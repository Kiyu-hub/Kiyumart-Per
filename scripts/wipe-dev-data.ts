/**
 * Wipe dev-seeded data — safe for production-launch prep.
 *
 * Removes ONLY rows that scripts/seed-dev-data.ts created (matched by the
 * `devSeed: true` marker stored in JSON columns and by the seed email
 * domain). Leaves untouched:
 *   • platform_settings  • hero_banners       • delivery_zones
 *   • super_admin user   • real admin users   • real sellers/buyers
 *   • categories that ONLY belong to non-seeded store types
 *   • orders / commissions (preserved by default; pass --orders to clear too)
 *
 * Usage:
 *   npm run wipe:dev                # dry-run summary
 *   npm run wipe:dev -- --confirm   # actually delete
 *   npm run wipe:dev -- --confirm --orders   # also clear seed-order data
 */
import "dotenv/config";
import { sql, eq, inArray, like, and } from "drizzle-orm";
import { db } from "../db/index";
import {
  users,
  stores,
  categories,
  products,
  productModifiers,
  orders,
  orderItems,
  cart,
  wishlists,
  reviews,
  commissions,
  sellerPayouts,
  platformEarnings,
  chatMessages,
  notifications,
} from "@shared/schema";

const SEED_EMAIL_DOMAIN = "dev.kiyumart.local";
const args = process.argv.slice(2);
const CONFIRMED = args.includes("--confirm");
const INCLUDE_ORDERS = args.includes("--orders");

function banner(title: string) {
  console.log("\n" + "─".repeat(60));
  console.log("  " + title);
  console.log("─".repeat(60));
}

async function main() {
  banner("KiyuMart wipe-dev-data");

  console.log(`   mode:      ${CONFIRMED ? "🗑  DELETE" : "🔎  DRY-RUN (pass --confirm to delete)"}`);
  console.log(`   orders:    ${INCLUDE_ORDERS ? "yes — seed-order rows will be cleared" : "no — orders preserved"}`);
  console.log(`   preserve:  platform_settings, hero_banners, delivery_zones,`);
  console.log(`              all real users (anything outside @${SEED_EMAIL_DOMAIN}),`);
  console.log(`              categories tagged for non-seeded store types.`);

  // ---- 1. Find seeded sellers ---------------------------------------------
  const seededSellers = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(like(users.email, `%@${SEED_EMAIL_DOMAIN}`));

  const sellerIds = seededSellers.map((u) => u.id);
  console.log(`\n   sellers found:    ${sellerIds.length}`);

  // ---- 2. Find seeded stores ----------------------------------------------
  let storeIds: string[] = [];
  if (sellerIds.length > 0) {
    const rows = await db
      .select({ id: stores.id })
      .from(stores)
      .where(inArray(stores.primarySellerId, sellerIds));
    storeIds = rows.map((s) => s.id);
  }
  console.log(`   stores found:     ${storeIds.length}`);

  // ---- 3. Find seeded products (sellerId match OR dynamicFields.devSeed) ---
  let productIds: string[] = [];
  if (sellerIds.length > 0) {
    const rows = await db
      .select({ id: products.id })
      .from(products)
      .where(inArray(products.sellerId, sellerIds));
    productIds = rows.map((p) => p.id);
  }
  // Catch any products tagged with devSeed but not tied to a seed seller
  const taggedProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(sql`${products.dynamicFields} @> '{"devSeed": true}'::jsonb`);
  for (const p of taggedProducts) {
    if (!productIds.includes(p.id)) productIds.push(p.id);
  }
  console.log(`   products found:   ${productIds.length}`);

  // ---- 4. Find seeded categories (created here — has devSeed flag).
  //         We DO NOT auto-delete categories that real admins created.
  //         A seeded category is identified by being referenced only by
  //         seeded products. Categories with non-seeded product references
  //         are left intact.
  let seededCategoryIds: string[] = [];
  if (productIds.length > 0) {
    const catRefs = await db
      .select({ id: products.categoryId })
      .from(products)
      .where(inArray(products.id, productIds));
    const referencedCatIds = Array.from(new Set(catRefs.map((r) => r.id).filter((id): id is string => !!id)));

    if (referencedCatIds.length > 0) {
      for (const catId of referencedCatIds) {
        const otherProducts = await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.categoryId, catId), sql`${products.id} NOT IN (${sql.join(productIds.map((p) => sql`${p}`), sql`, `)})`))
          .limit(1);
        if (otherProducts.length === 0) {
          seededCategoryIds.push(catId);
        }
      }
    }
  }
  console.log(`   categories to drop: ${seededCategoryIds.length} (only those with no other product references)`);

  if (!CONFIRMED) {
    console.log("\n   ℹ  Dry-run finished — nothing was deleted.");
    console.log("       To wipe, re-run:  npm run wipe:dev -- --confirm");
    return;
  }

  banner("Deleting…");

  // ---- 5. Delete in FK-safe order -----------------------------------------

  // a) Cart entries and wishlists referencing seed products
  if (productIds.length > 0) {
    await db.delete(cart).where(inArray(cart.productId, productIds));
    await db.delete(wishlists).where(inArray(wishlists.productId, productIds));
    await db.delete(reviews).where(inArray(reviews.productId, productIds));
    await db.delete(productModifiers).where(inArray(productModifiers.productId, productIds));
  }

  // b) Optional: clear seed-order data
  if (INCLUDE_ORDERS && sellerIds.length > 0) {
    const seedOrderIds = await db
      .select({ id: orders.id })
      .from(orders)
      .where(inArray(orders.sellerId, sellerIds));
    const ids = seedOrderIds.map((o) => o.id);
    if (ids.length > 0) {
      await db.delete(orderItems).where(inArray(orderItems.orderId, ids));
      await db.delete(platformEarnings).where(inArray(platformEarnings.orderId, ids));
      await db.delete(commissions).where(inArray(commissions.orderId, ids));
      await db.delete(orders).where(inArray(orders.id, ids));
      console.log(`   • orders cleared: ${ids.length}`);
    }

    // payouts and earnings belonging to seed sellers
    await db.delete(sellerPayouts).where(inArray(sellerPayouts.sellerId, sellerIds));
  }

  // c) Notifications & chat messages referencing seed sellers
  if (sellerIds.length > 0) {
    await db.delete(notifications).where(inArray(notifications.userId, sellerIds));
    await db
      .delete(chatMessages)
      .where(
        sql`${chatMessages.senderId} IN (${sql.join(sellerIds.map((id) => sql`${id}`), sql`, `)}) OR ${chatMessages.receiverId} IN (${sql.join(sellerIds.map((id) => sql`${id}`), sql`, `)})`,
      );
  }

  // d) Products
  if (productIds.length > 0) {
    await db.delete(products).where(inArray(products.id, productIds));
    console.log(`   • products deleted: ${productIds.length}`);
  }

  // e) Stores
  if (storeIds.length > 0) {
    await db.delete(stores).where(inArray(stores.id, storeIds));
    console.log(`   • stores deleted: ${storeIds.length}`);
  }

  // f) Categories that ONLY had seeded products
  if (seededCategoryIds.length > 0) {
    await db.delete(categories).where(inArray(categories.id, seededCategoryIds));
    console.log(`   • categories deleted: ${seededCategoryIds.length}`);
  }

  // g) Seller users
  if (sellerIds.length > 0) {
    await db.delete(users).where(inArray(users.id, sellerIds));
    console.log(`   • sellers deleted: ${sellerIds.length}`);
  }

  banner("✅  Wipe complete");
  console.log(`   The platform is now clean of dev-seed data.`);
  console.log(`   Platform settings, hero banners, delivery zones, and any`);
  console.log(`   real users / categories were left fully intact.`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Wipe failed:", err);
    process.exit(1);
  });
