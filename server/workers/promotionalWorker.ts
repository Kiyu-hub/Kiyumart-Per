import { db } from "../db";
import { promotionalAds } from "@shared/schema";
import { and } from "drizzle-orm";

const POLL_INTERVAL = parseInt(process.env.PROMO_WORKER_INTERVAL_MS || '60000', 10); // 60s

export async function runPromotionalWorker() {
  console.log('[PROMO-WORKER] Starting promotional ads worker, interval', POLL_INTERVAL);
  setInterval(async () => {
    try {
      const now = new Date();
      const expired = await db.update(promotionalAds).set({ isActive: false, updatedAt: new Date() }).where(and(promotionalAds.isActive.eq(true), promotionalAds.endAt.lessThanOrEqual(now)));
      // Log if any expired
      // Note: drizzle update returns number of rows updated in some drivers; we log generically
    } catch (err) {
      console.error('[PROMO-WORKER] Error while expiring promotions', (err as any)?.message || err);
    }
  }, POLL_INTERVAL);
}
