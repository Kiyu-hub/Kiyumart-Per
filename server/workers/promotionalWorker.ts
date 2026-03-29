import { storage } from "../storage";

const POLL_INTERVAL = parseInt(process.env.PROMO_WORKER_INTERVAL_MS || '60000', 10); // 60s
let _promosTableMissingSince: number | null = null;
const PROMO_MISSING_COOLDOWN = 5 * 60 * 1000; // 5 minutes
let started = false;
let intervalHandle: NodeJS.Timeout | null = null;
let retryHandle: NodeJS.Timeout | null = null;
let batchRunning = false;

function scheduleRetry(delayMs: number) {
  if (retryHandle) return;
  retryHandle = setTimeout(async () => {
    retryHandle = null;
    started = false;
    await runPromotionalWorker();
  }, delayMs);
}

export async function runPromotionalWorker() {
  if (started) return;
  started = true;
  console.log('[PROMO-WORKER] Starting promotional ads worker, interval', POLL_INTERVAL);

  // Check if table exists before starting the periodic expiry loop. If not present, poll less frequently
  // until migrations are applied.
  try {
    const exists = await storage.promotionsTableExists();
    if (!exists) {
      console.warn('[PROMO-WORKER] promotional_ads table not present; worker will retry table existence later');
      // Retry after a longer delay
      started = false;
      scheduleRetry(POLL_INTERVAL * 5);
      return;
    }
  } catch (err: any) {
    console.error('[PROMO-WORKER] Error checking promotions table existence', (err?.message || err));
    started = false;
    scheduleRetry(POLL_INTERVAL * 5);
    return;
  }

  if (intervalHandle) return;

  intervalHandle = setInterval(async () => {
    if (batchRunning) {
      console.warn('[PROMO-WORKER] Previous promotion-expiry batch is still running; skipping overlap tick');
      return;
    }

    batchRunning = true;
    try {
      await storage.expirePromotionalAds();
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[PROMO-WORKER] Error while expiring promotions', msg);
    } finally {
      batchRunning = false;
    }
  }, POLL_INTERVAL);
} 
