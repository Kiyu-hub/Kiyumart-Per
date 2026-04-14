import "dotenv/config";
import { paystackService } from "../server/paystack.ts";
import { storage } from "../server/storage.ts";
import { db } from "../db/index.ts";
import { sql } from "drizzle-orm";

const run = async () => {
  const settings = await storage.getPlatformSettings();
  const secret = settings?.paystackSecretKey;
  if (!secret) {
    throw new Error("Platform Paystack secret is missing");
  }

  const sellerResult = await db.execute(sql`
    SELECT
      u.id,
      u.name,
      st.payout_type AS "payoutType",
      st.payout_details AS "payoutDetails"
    FROM users u
    LEFT JOIN stores st ON st.primary_seller_id = u.id
    WHERE u.email = 'seller@kiyumart.com'
    LIMIT 1
  `);
  const seller = (Array.isArray(sellerResult) ? sellerResult[0] : sellerResult.rows?.[0]) as any;
  if (!seller) {
    throw new Error("Selom store not found");
  }

  console.log("=== INPUT ===");
  console.dir(seller, { depth: null });

  const recipientRes = await paystackService.createTransferRecipient({
    type: "mobile_money",
    name: seller.name,
    mobile: seller.payoutDetails?.mobileNumber,
    provider: seller.payoutDetails?.provider,
    currency: "GHS",
  }, secret);

  console.log("=== RECIPIENT RESPONSE ===");
  console.dir(recipientRes, { depth: null });
};

run().catch((error: any) => {
  console.error("=== ERROR ===");
  console.error(error?.message || error);
  process.exit(1);
});
