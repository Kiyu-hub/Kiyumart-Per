import "dotenv/config";
import { db } from "../db/index.ts";
import { sql } from "drizzle-orm";
import { storage } from "../server/storage.ts";

const run = async () => {
  const settings = await storage.getPlatformSettings();
  const seller = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      u.email,
      st.id AS "storeId",
      st.payout_type AS "payoutType",
      st.payout_details AS "payoutDetails",
      st.paystack_subaccount_id AS "paystackSubaccountId",
      st.is_payout_verified AS "isPayoutVerified"
    FROM users u
    LEFT JOIN stores st ON st.primary_seller_id = u.id
    WHERE u.email = 'seller@kiyumart.com'
    LIMIT 1
  `);

  const payouts = await db.execute(sql`
    SELECT
      id,
      amount::text AS amount,
      status,
      reference,
      bank_details AS "bankDetails",
      processed_at AS "processedAt",
      created_at AS "createdAt"
    FROM seller_payouts
    WHERE seller_id = (
      SELECT id FROM users WHERE email = 'seller@kiyumart.com' LIMIT 1
    )
    ORDER BY created_at DESC
    LIMIT 20
  `);

  console.log("=== PAYSTACK SECRET PRESENT ===");
  console.dir({
    hasPlatformPaystackSecret: Boolean(settings?.paystackSecretKey),
    platformPaystackSecretPreview: settings?.paystackSecretKey ? String(settings.paystackSecretKey).slice(0, 12) : null,
  }, { depth: null });

  console.log("\n=== SELOM STORE PAYOUT SETUP ===");
  console.dir(Array.isArray(seller) ? seller : seller.rows, { depth: null });

  console.log("\n=== SELOM PAYOUT ROWS ===");
  console.dir(Array.isArray(payouts) ? payouts : payouts.rows, { depth: null });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
