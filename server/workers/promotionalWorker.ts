import { storage } from "../storage";

const POLL_INTERVAL = parseInt(process.env.PROMO_WORKER_INTERVAL_MS || '60000', 10); // 60s
let _promosTableMissingSince: number | null = null;
const PROMO_MISSING_COOLDOWN = 5 * 60 * 1000; // 5 minutes

export async function runPromotionalWorker() {
  console.log('[PROMO-WORKER] Starting promotional ads worker, interval', POLL_INTERVAL);

  // Check if table exists before starting the periodic expiry loop. If not present, poll less frequently
  // until migrations are applied.
  try {
    const exists = await storage.promotionsTableExists();
    if (!exists) {
      console.warn('[PROMO-WORKER] promotional_ads table not present; worker will retry table existence later');
      // Retry after a longer delay
      setTimeout(runPromotionalWorker, POLL_INTERVAL * 5);
      return;
    }
  } catch (err: any) {
    console.error('[PROMO-WORKER] Error checking promotions table existence', (err?.message || err));
    setTimeout(runPromotionalWorker, POLL_INTERVAL * 5);
    return;
  }

  setInterval(async () => {
    try {
      await storage.expirePromotionalAds();
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('[PROMO-WORKER] Error while expiring promotions', msg);
    }
  }, POLL_INTERVAL);
} 
