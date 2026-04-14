import "dotenv/config";
import { db } from "../db/index.ts";
import { sql } from "drizzle-orm";
import { storage } from "../server/storage.ts";

const sellerId = process.argv[2] || "";

const run = async () => {
  await storage.repairUnsafeSellerPayoutRecords(500);
  const storageSummary = await storage.getAdminSellerPayoutSummaries();

  const summary = await db.execute(sql`
    WITH seller_base AS (
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.is_approved AS is_approved,
        st.payout_type AS payout_type,
        CASE
          WHEN st.payout_type = 'bank_account'
            AND COALESCE(st.paystack_subaccount_id, '') <> ''
            AND COALESCE(st.payout_details->>'bankCode', '') <> ''
            AND COALESCE(st.payout_details->>'accountNumber', '') <> ''
            AND COALESCE(st.payout_details->>'accountName', '') <> ''
            AND COALESCE(st.payout_details->>'bankName', '') <> ''
            AND COALESCE(st.is_payout_verified, false) = true
            THEN true
          WHEN st.payout_type = 'mobile_money'
            AND COALESCE(st.paystack_subaccount_id, '') <> ''
            AND COALESCE(st.payout_details->>'provider', '') <> ''
            AND COALESCE(st.payout_details->>'mobileNumber', '') <> ''
            AND COALESCE(st.is_payout_verified, false) = true
            THEN true
          ELSE false
        END AS has_payout_setup
      FROM users u
      LEFT JOIN stores st ON st.primary_seller_id = u.id
      WHERE u.role = 'seller'
    )
    SELECT
      sb.id,
      sb.name,
      sb.email,
      sb.is_approved AS "isApproved",
      sb.has_payout_setup AS "hasPayoutSetup",
      sb.payout_type AS "payoutType",
      (
        CASE
          WHEN sb.has_payout_setup = true
            THEN COALESCE(pt.verified_transfer_paid, 0) + COALESCE(pt.verified_split_paid, 0)
          ELSE COALESCE(pt.verified_transfer_paid, 0)
        END
      )::text AS "totalPaid",
      (
        GREATEST(COALESCE(ct.pending_amount, 0), 0)
        + COALESCE(pt.processing_amount, 0)
        + COALESCE(pt.unverified_completed_amount, 0)
        + CASE
            WHEN sb.has_payout_setup = false THEN COALESCE(pt.verified_split_paid, 0)
            ELSE 0
          END
      )::text AS "pendingAmount",
      COALESCE(pt.payout_count, 0)::int AS "payoutCount",
      (
        CASE
          WHEN sb.has_payout_setup = true
            THEN COALESCE(pt.verified_transfer_count, 0) + COALESCE(pt.verified_split_count, 0)
          ELSE COALESCE(pt.verified_transfer_count, 0)
        END
      )::int AS "completedPayoutCount",
      CASE
        WHEN sb.has_payout_setup = true
          THEN GREATEST(COALESCE(pt.last_transfer_payout_at, TIMESTAMP 'epoch'), COALESCE(pt.last_split_payout_at, TIMESTAMP 'epoch'))
        ELSE COALESCE(pt.last_transfer_payout_at, NULL)
      END AS "lastPayoutAt"
    FROM seller_base sb
    LEFT JOIN (
      SELECT
        seller_id,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN amount::numeric ELSE 0 END), 0) AS processing_amount,
        COALESCE(SUM(CASE WHEN status = 'completed' AND COALESCE(bank_details->>'settlementMode', '') = 'split' THEN amount::numeric ELSE 0 END), 0) AS verified_split_paid,
        COALESCE(SUM(CASE WHEN status = 'completed' AND (
          LOWER(COALESCE(bank_details->>'transferStatus', '')) IN ('success', 'successful', 'completed')
          OR COALESCE(bank_details->>'transferReference', '') <> ''
          OR COALESCE(bank_details->>'transferCode', '') <> ''
        ) THEN amount::numeric ELSE 0 END), 0) AS verified_transfer_paid,
        COALESCE(SUM(CASE WHEN status = 'completed'
          AND COALESCE(bank_details->>'settlementMode', '') <> 'split'
          AND LOWER(COALESCE(bank_details->>'transferStatus', '')) NOT IN ('success', 'successful', 'completed')
          AND COALESCE(bank_details->>'transferReference', '') = ''
          AND COALESCE(bank_details->>'transferCode', '') = ''
          THEN amount::numeric ELSE 0 END), 0) AS unverified_completed_amount,
        COUNT(*) AS payout_count,
        COALESCE(SUM(CASE WHEN status = 'completed' AND COALESCE(bank_details->>'settlementMode', '') = 'split' THEN 1 ELSE 0 END), 0) AS verified_split_count,
        COALESCE(SUM(CASE WHEN status = 'completed' AND (
          LOWER(COALESCE(bank_details->>'transferStatus', '')) IN ('success', 'successful', 'completed')
          OR COALESCE(bank_details->>'transferReference', '') <> ''
          OR COALESCE(bank_details->>'transferCode', '') <> ''
        ) THEN 1 ELSE 0 END), 0) AS verified_transfer_count,
        MAX(CASE WHEN status = 'completed' AND (
          LOWER(COALESCE(bank_details->>'transferStatus', '')) IN ('success', 'successful', 'completed')
          OR COALESCE(bank_details->>'transferReference', '') <> ''
          OR COALESCE(bank_details->>'transferCode', '') <> ''
        ) THEN processed_at ELSE NULL END) AS last_transfer_payout_at,
        MAX(CASE WHEN status = 'completed' AND COALESCE(bank_details->>'settlementMode', '') = 'split' THEN processed_at ELSE NULL END) AS last_split_payout_at
      FROM seller_payouts
      GROUP BY seller_id
    ) pt ON pt.seller_id = sb.id
    LEFT JOIN (
      SELECT
        seller_id,
        COALESCE(SUM(CASE WHEN status IN ('pending', 'processing') THEN seller_amount::numeric ELSE 0 END), 0) AS pending_amount
      FROM commissions
      GROUP BY seller_id
    ) ct ON ct.seller_id = sb.id
    ${sellerId ? sql`WHERE sb.id = ${sellerId}` : sql``}
    ORDER BY sb.name ASC
  `);

  const payoutRows = await db.execute(sql`
    SELECT
      sp.id,
      sp.seller_id AS "sellerId",
      u.name AS "sellerName",
      sp.amount::text AS amount,
      sp.status,
      sp.method,
      sp.reference,
      sp.processed_at AS "processedAt",
      sp.bank_details AS "bankDetails"
    FROM seller_payouts sp
    LEFT JOIN users u ON u.id = sp.seller_id
    ${sellerId ? sql`WHERE sp.seller_id = ${sellerId}` : sql``}
    ORDER BY sp.created_at DESC
    LIMIT 50
  `);

  const commissionRows = await db.execute(sql`
    SELECT
      c.id,
      c.seller_id AS "sellerId",
      u.name AS "sellerName",
      c.order_id AS "orderId",
      c.seller_amount::text AS "sellerAmount",
      c.status,
      c.processed_at AS "processedAt"
    FROM commissions c
    LEFT JOIN users u ON u.id = c.seller_id
    ${sellerId ? sql`WHERE c.seller_id = ${sellerId}` : sql``}
    ORDER BY c.created_at DESC
    LIMIT 50
  `);

  console.log("=== STORAGE SUMMARY ===");
  console.dir(storageSummary, { depth: null });
  console.log("");
  console.log("=== SELLER SUMMARY ===");
  console.dir(Array.isArray(summary) ? summary : summary.rows, { depth: null });
  console.log("\n=== SELLER PAYOUTS ===");
  console.dir(Array.isArray(payoutRows) ? payoutRows : payoutRows.rows, { depth: null });
  console.log("\n=== COMMISSIONS ===");
  console.dir(Array.isArray(commissionRows) ? commissionRows : commissionRows.rows, { depth: null });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
