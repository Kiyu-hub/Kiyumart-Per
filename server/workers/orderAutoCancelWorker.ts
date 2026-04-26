import { db } from "../../db";
import { orders, platformSettings } from "../../shared/schema";
import { sql, and, eq, lt, isNull, or } from "drizzle-orm";

const POLL_INTERVAL = 5 * 60 * 1000; // check every 5 minutes
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let batchRunning = false;

async function cancelStaleUnpaidOrders() {
  try {
    // Read current setting on each run so changes apply without restart
    const [settings] = await db.select({ hours: platformSettings.orderAutoCancelHours }).from(platformSettings).limit(1);
    const hours = Number(settings?.hours ?? 0);
    if (!hours || hours <= 0) return; // 0 = disabled

    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    const stale = await db
      .select({ id: orders.id, orderNumber: orders.orderNumber })
      .from(orders)
      .where(
        and(
          lt(orders.createdAt, cutoff),
          or(
            eq(sql`lower(cast(${orders.paymentStatus} as text))`, "pending"),
            isNull(orders.paymentStatus),
          ),
          or(
            eq(sql`lower(cast(${orders.status} as text))`, "pending"),
            eq(sql`lower(cast(${orders.status} as text))`, "created"),
          ),
        ),
      )
      .limit(100);

    if (stale.length === 0) return;

    for (const order of stale) {
      try {
        await db
          .update(orders)
          .set({ status: "cancelled", paymentStatus: "failed" } as any)
          .where(eq(orders.id, order.id));
        console.info(`[AUTO-CANCEL] Cancelled stale unpaid order ${order.orderNumber} (${order.id})`);
      } catch (err: any) {
        console.error(`[AUTO-CANCEL] Failed to cancel order ${order.id}:`, err?.message);
      }
    }
  } catch (err: any) {
    console.error("[AUTO-CANCEL] Worker batch error:", err?.message);
  }
}

export function runOrderAutoCancelWorker() {
  if (intervalHandle) return;
  intervalHandle = setInterval(async () => {
    if (batchRunning) return;
    batchRunning = true;
    try {
      await cancelStaleUnpaidOrders();
    } finally {
      batchRunning = false;
    }
  }, POLL_INTERVAL);
  console.log("[BOOT] Order auto-cancel worker started");
}
