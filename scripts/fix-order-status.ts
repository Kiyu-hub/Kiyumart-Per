import "dotenv/config";
import { storage } from "../server/storage";

async function main() {
  const ids = process.argv.slice(2);
  if (ids.length === 0) {
    console.error("Usage: tsx scripts/fix-order-status.ts <orderId> [orderId...]");
    process.exit(1);
  }

  for (const id of ids) {
    try {
      console.log(`Updating order ${id} -> status=\"pending\"`);
      const updated = await storage.updateOrder(id, { status: "pending" as any });
      if (!updated) {
        console.error(`Order not found: ${id}`);
        continue;
      }
      console.log(`Success: order ${id} now status=${updated.status}`);
    } catch (err: any) {
      console.error(`Failed to update ${id}:`, err?.message || err);
    }
  }

  process.exit(0);
}

main();
