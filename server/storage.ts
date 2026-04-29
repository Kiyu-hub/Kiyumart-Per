import { db } from "../db/index";
import { 
  users, products, orders, orderItems, orderStatusHistory, deliveryZones, deliveryTracking,
  chatMessages, transactions, platformSettings, cart, wishlist, reviews, riderReviews,
  productVariants, heroBanners, promotionalAds, promotionPricing, promotionApplications, coupons, bannerCollections, marketplaceBanners,
  stores, categoryFields, categories, notifications, mediaLibrary, footerPages,
  idempotencyKeys,
  commissions, platformEarnings, sellerPayouts, riderPayouts, roleFeatures,
  type User, type InsertUser, type Product, type InsertProduct,
  type Order, type InsertOrder, type DeliveryZone, type InsertDeliveryZone,
  type ChatMessage, type InsertChatMessage, type Transaction, type PlatformSettings,
  type Cart, type Wishlist, type DeliveryTracking, type InsertDeliveryTracking,
  type Review, type InsertReview, type RiderReview, type InsertRiderReview, type ProductVariant, type InsertProductVariant, type HeroBanner, type InsertHeroBanner,
  type Coupon, type InsertCoupon, type BannerCollection, type InsertBannerCollection,
  type MarketplaceBanner, type InsertMarketplaceBanner, type Store, type CategoryField,
  type Category, type Notification, type InsertNotification, type MediaLibrary,
  type InsertMediaLibrary, type FooterPage, type InsertFooterPage,
  type Commission, type InsertCommission, type PlatformEarning, type InsertPlatformEarning,
  type SellerPayout, type InsertSellerPayout,
  type RiderPayout, type InsertRiderPayout,
  type OrderStatusHistory, type InsertOrderStatusHistory
} from "@shared/schema";
import { eq, and, asc, desc, sql, lte, gte, or, isNull, isNotNull, inArray } from "drizzle-orm";
import { promises as fs } from "fs";
import path from "path";
import {
  isValidGhanaMobileMoneyNumber,
  normalizeGhanaMobileMoneyNumber,
  normalizeGhanaMobileMoneyProvider,
} from "./paystack";

const platformSettingsCompatPath = path.join(process.cwd(), "server", "data", "platform-settings-compat.json");
let platformSettingsSchemaReady: Promise<void> | null = null;
let productVariantsSchemaReady: Promise<void> | null = null;
let orderItemsSchemaReady: Promise<void> | null = null;

function normalizeOrderStatusForDatabase(status?: string | null): string | undefined {
  const normalized = String(status || "").toLowerCase().trim();
  if (!normalized) return undefined;
  if (normalized === "created") return "pending";
  if (normalized === "ready_for_pickup") return "ready";
  if (normalized === "assigned_to_rider") return "assigned";
  if (normalized === "out_for_delivery") return "en_route";
  if (normalized === "delivering") return "en_route";
  return normalized;
}

async function readPlatformSettingsCompat(): Promise<Partial<PlatformSettings>> {
  try {
    const raw = await fs.readFile(platformSettingsCompatPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writePlatformSettingsCompat(data: Partial<PlatformSettings>) {
  const existing = await readPlatformSettingsCompat();
  const next = { ...existing, ...data };
  await fs.mkdir(path.dirname(platformSettingsCompatPath), { recursive: true });
  await fs.writeFile(platformSettingsCompatPath, JSON.stringify(next, null, 2), "utf8");
}

async function ensurePlatformSettingsSchemaCompat() {
  if (!platformSettingsSchemaReady) {
    platformSettingsSchemaReady = (async () => {
      // Run each ALTER TABLE independently so one failure doesn't block the rest.
      // If any fail, reset the singleton so the next call retries.
      let anyFailed = false;
      const runAlter = async (query: Parameters<typeof db.execute>[0]) => {
        try {
          await db.execute(query);
        } catch (e: any) {
          anyFailed = true;
          console.warn("[STORAGE] platform_settings schema compat ALTER skipped:", e?.message || e);
        }
      };

      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS is_external_rider_system_enabled boolean DEFAULT false`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_checkout_delivery_map boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_pickup_agent_admin_chat boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_seller_direct_support_messages boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_seller_bank_payouts boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_shared_variant_color_stock boolean DEFAULT false`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_homepage_featured_section boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_homepage_new_arrival_section boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_host text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_port integer`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_user text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_pass text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_secure boolean DEFAULT false`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_from_email text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS smtp_from_name text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS is_maintenance_mode boolean DEFAULT false`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_message text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_started_at timestamp`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_scheduled_end timestamp`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS maintenance_started_by varchar`);
      // Advanced features / operational limits columns
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS invite_only_registration boolean DEFAULT false`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS order_auto_cancel_hours integer DEFAULT 0`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS free_tier_product_limit integer DEFAULT 20`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS max_products_per_seller integer DEFAULT 0`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_a_price decimal(10,2) DEFAULT 15`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_a_slots integer DEFAULT 10`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_b_price decimal(10,2) DEFAULT 40`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_c_price decimal(10,2) DEFAULT 100`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS delivery_fee_commission decimal(10,2) DEFAULT 0`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_reward_percent decimal(5,2) DEFAULT 0`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_enabled boolean DEFAULT false`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_enabled_single_store boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_enabled_multi_vendor boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_customer_threshold integer DEFAULT 5`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_seller_threshold integer DEFAULT 10`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_seller_promo_hours integer DEFAULT 24`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS max_upload_size_mb integer DEFAULT 10`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allowed_upload_types text DEFAULT 'jpg,jpeg,png,webp,gif,avif'`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS render_deploy_hook_url text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ga4_property_id text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS google_credentials_json text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_auth_token text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_org text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_project text`);
      // Analytics / social / banner columns that may have been added to schema after initial DB creation
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS google_analytics_id text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS microsoft_clarity_id text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_dsn text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_social_links boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_facebook boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_instagram boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_twitter boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_linkedin boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_youtube boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_tiktok boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_pinterest boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_whatsapp boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS shop_display_mode text DEFAULT 'by-store'`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_shop_by_section boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS active_banner_collection_id varchar`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS category_display_style text DEFAULT 'grid'`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS banner_autoplay_enabled boolean DEFAULT true`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS banner_autoplay_duration integer DEFAULT 5000`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hero_banner_ad_image text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hero_banner_ad_url text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sidebar_ad_image text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sidebar_ad_url text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_ad_image text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_ad_url text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_page_ad_image text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_page_ad_url text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS primary_store_id varchar`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS default_commission_rate decimal(5,2) DEFAULT 1.00`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS cloudinary_accounts text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS frontend_url text`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_links jsonb DEFAULT '[]'::jsonb`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_payment_icons text[]`);
      await runAlter(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_seller_registration boolean DEFAULT false`);
      // If any statement failed, reset so the next call retries
      if (anyFailed) platformSettingsSchemaReady = null;
    })();
  }

  await platformSettingsSchemaReady;
}

async function ensureProductVariantsSchemaCompat() {
  if (!productVariantsSchemaReady) {
    productVariantsSchemaReady = (async () => {
      try {
        await db.execute(
          sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS original_stock integer DEFAULT 0`
        );
        await db.execute(
          sql`UPDATE product_variants
              SET original_stock = COALESCE(original_stock, stock, 0)
              WHERE original_stock IS NULL OR original_stock = 0`
        );
      } catch (error: any) {
        console.warn(
          "[STORAGE] Could not auto-add original_stock to product_variants:",
          error?.message || error,
        );
      }
    })();
  }

  await productVariantsSchemaReady;
}

async function ensureOrderItemsSchemaCompat() {
  if (!orderItemsSchemaReady) {
    orderItemsSchemaReady = (async () => {
      try {
        await db.execute(
          sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id varchar`
        );
        await db.execute(
          sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_color varchar`
        );
        await db.execute(
          sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size varchar`
        );
        await db.execute(
          sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_image_index integer DEFAULT 0`
        );
      } catch (error: any) {
        console.warn(
          "[STORAGE] Could not auto-add variant columns to order_items:",
          error?.message || error,
        );
      }
    })();
  }

  await orderItemsSchemaReady;
}

const generateNumericOtp = (): string => String(Math.floor(100000 + Math.random() * 900000));

const normalizeRequestedQuantity = (value: unknown) => {
  const quantity = Number(value || 0);
  return Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 0;
};

type CheckoutStockItem = {
  productId: string;
  quantity: number;
  variantId?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
  selectedImageIndex?: number | null;
};

const buildVariantSummarySnapshotForStorage = (variants: Array<any> = []) =>
  variants.map((variant) => {
    const normalizedImages = Array.isArray(variant?.images)
      ? variant.images.map((value: unknown) => String(value || "").trim()).filter(Boolean)
      : [];
    return {
      id: variant.id,
      color: String(variant?.color || "").trim(),
      size: String(variant?.size || "").trim(),
      images: normalizedImages,
      image: normalizedImages[0] || String(variant?.image || "").trim() || null,
      stock: Math.max(0, Number(variant?.stock) || 0),
      originalStock: Math.max(0, Number(variant?.originalStock ?? variant?.stock) || 0),
    };
  });

const syncProductVariantState = async (tx: any, productId: string) => {
  await ensureProductVariantsSchemaCompat();

  const variantRows = await tx
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, productId));

  if (!variantRows.length) {
    return;
  }

  const [productRow] = await tx
    .select({
      id: products.id,
      images: products.images,
      dynamicFields: products.dynamicFields,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!productRow) {
    return;
  }

  const variantSummary = buildVariantSummarySnapshotForStorage(variantRows);
  const productImages = Array.from(
    new Set(
      variantSummary.flatMap((variant) => Array.isArray(variant.images) ? variant.images : [])
    )
  ).filter(Boolean).slice(0, 8);
  const productStock = variantSummary.reduce((sum, variant) => sum + Math.max(0, Number(variant.stock) || 0), 0);

  await tx
    .update(products)
    .set({
      stock: productStock,
      images: productImages.length > 0 ? productImages : Array.isArray(productRow.images) ? productRow.images : [],
      dynamicFields: {
        ...((productRow.dynamicFields as Record<string, any> | null) || {}),
        variantSummary,
      },
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));
};

const productInventoryReconciliationInFlight = new Set<string>();
const ABANDONED_CHECKOUT_GRACE_MS = 60 * 60 * 1000;

const reconcileProductInventory = async (tx: any, productId: string) => {
  const [productRow] = await tx
    .select({
      id: products.id,
      stock: products.stock,
      updatedAt: products.updatedAt,
      createdAt: products.createdAt,
    })
    .from(products)
    .where(eq(products.id, productId))
    .for("update");

  if (!productRow) return null;

  const baselineDate =
    productRow.updatedAt instanceof Date
      ? productRow.updatedAt
      : productRow.createdAt instanceof Date
        ? productRow.createdAt
        : new Date(0);

  const [reservationSummary] = await tx
    .select({
      quantity: sql<number>`COALESCE(SUM(${orderItems.quantity}), 0)`,
    })
    .from(orderItems)
    .leftJoin(orders, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orderItems.productId, productId),
        sql`${orders.createdAt} > ${baselineDate}`,
        sql`${orders.status} <> 'cancelled'`,
        sql`${orders.paymentStatus} <> 'failed'`,
      ),
    );

  const currentStock = Number(productRow.stock || 0);
  const reservedQuantity = Number(reservationSummary?.quantity || 0);
  if (reservedQuantity <= 0) {
    return { ...productRow, stock: currentStock };
  }

  const reconciledStock = Math.max(0, currentStock - reservedQuantity);
  if (reconciledStock === currentStock) {
    return { ...productRow, stock: currentStock };
  }

  const [updatedProduct] = await tx
    .update(products)
    .set({
      stock: reconciledStock,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId))
    .returning({
      id: products.id,
      stock: products.stock,
      updatedAt: products.updatedAt,
      createdAt: products.createdAt,
    });

  return updatedProduct || { ...productRow, stock: reconciledStock, updatedAt: new Date() };
};

const scheduleProductInventoryReconciliation = (productIds: string[]) => {
  const uniqueIds = Array.from(new Set((productIds || []).filter(Boolean)));
  const queuedIds = uniqueIds.filter((productId) => {
    if (productInventoryReconciliationInFlight.has(productId)) return false;
    productInventoryReconciliationInFlight.add(productId);
    return true;
  });

  if (queuedIds.length === 0) return;

  setTimeout(() => {
    void db
      .transaction(async (tx) => {
        for (const productId of queuedIds) {
          try {
            await reconcileProductInventory(tx, productId);
          } catch (error) {
            console.warn(`[INVENTORY] Background reconciliation failed for product ${productId}:`, error);
          }
        }
      })
      .catch((error) => {
        console.warn("[INVENTORY] Background product reconciliation batch failed:", error);
      })
      .finally(() => {
        queuedIds.forEach((productId) => productInventoryReconciliationInFlight.delete(productId));
      });
  }, 0);
};

const reserveProductStock = async (
  tx: any,
  items: CheckoutStockItem[],
) => {
  await ensureProductVariantsSchemaCompat();
  await ensureOrderItemsSchemaCompat();

  const quantityByProduct = new Map<string, number>();
  const quantityByVariant = new Map<string, { productId: string; quantity: number }>();
  const touchedVariantProductIds = new Set<string>();

  for (const item of items) {
    const productId = String(item.productId || "").trim();
    const quantity = normalizeRequestedQuantity(item.quantity);
    const variantId = String(item.variantId || "").trim();
    if (!productId || quantity <= 0) continue;

    if (variantId) {
      const current = quantityByVariant.get(variantId);
      quantityByVariant.set(variantId, {
        productId,
        quantity: (current?.quantity || 0) + quantity,
      });
      touchedVariantProductIds.add(productId);
      continue;
    }

    quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
  }

  for (const [variantId, reservation] of Array.from(quantityByVariant.entries())) {
    const currentRows = await tx
      .select({
        id: productVariants.id,
        productId: productVariants.productId,
        color: productVariants.color,
        size: productVariants.size,
        stock: productVariants.stock,
      })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .for("update");

    const currentVariant = currentRows[0];
    if (!currentVariant) {
      throw new Error(`Variant not found for stock reservation: ${variantId}`);
    }

    const availableStock = Number(currentVariant.stock || 0);
    if (availableStock < reservation.quantity) {
      const variantLabel = [currentVariant.color, currentVariant.size]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(" / ");
      throw new Error(
        `${variantLabel || "Selected option"} has only ${availableStock} item(s) left. Please refresh and try again.`,
      );
    }

    await tx
      .update(productVariants)
      .set({
        stock: availableStock - reservation.quantity,
      })
      .where(eq(productVariants.id, variantId));
  }

  for (const [productId, requestedQuantity] of Array.from(quantityByProduct.entries())) {
    const currentRows = await tx
      .select({
        id: products.id,
        name: products.name,
        stock: products.stock,
      })
      .from(products)
      .where(eq(products.id, productId))
      .for("update");

    const currentProduct = currentRows[0];
    if (!currentProduct) {
      throw new Error(`Product not found for stock reservation: ${productId}`);
    }

    const availableStock = Number(currentProduct.stock || 0);
    if (availableStock < requestedQuantity) {
      throw new Error(
        `${currentProduct.name} has only ${availableStock} item(s) left. Please refresh and try again.`,
      );
    }

    await tx
      .update(products)
      .set({
        stock: availableStock - requestedQuantity,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));
  }

  for (const productId of Array.from(touchedVariantProductIds)) {
    await syncProductVariantState(tx, productId);
  }
};

async function withStorageTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

let financeBackfillComplete = false;
let financeBackfillInFlight: Promise<number> | null = null;

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getUsersByRole(role: string): Promise<User[]>;
  
  // Product operations
  createProduct(product: InsertProduct & { sellerId: string }): Promise<Product>;
  getProduct(id: string): Promise<Product | undefined>;
  getProducts(filters?: { sellerId?: string; storeId?: string; category?: string; isActive?: boolean }): Promise<Product[]>;
  updateProduct(id: string, data: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  
  // Order operations
  createOrder(order: InsertOrder, items: Array<{ productId: string; quantity: number; price: string; total: string }>): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getAllOrders(): Promise<Order[]>;
  getOrdersByUser(userId: string, role: "buyer" | "seller" | "rider"): Promise<Order[]>;
  getOrderItems(orderId: string): Promise<Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    selectedColor: string | null;
    selectedSize: string | null;
    image?: string | null;
  }>>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  applyOrderStatusTransition(orderId: string, toStatus: string, changedBy: string, changedByRole: string, reason?: string, sideEffects?: Partial<Order>): Promise<Order | undefined>;
  createOrderStatusHistory(data: InsertOrderStatusHistory): Promise<OrderStatusHistory>;
  getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]>;
  updateOrder(orderId: string, data: Partial<Order>): Promise<Order | undefined>;
  assignRider(orderId: string, riderId: string): Promise<Order | undefined>;
  getAvailableRidersWithOrderCounts(): Promise<Array<{ rider: User; activeOrderCount: number }>>;
  
  // Delivery Zone operations
  createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone>;
  getDeliveryZones(includeInactive?: boolean, entityKind?: "delivery_zone" | "pickup_station"): Promise<DeliveryZone[]>;
  updateDeliveryZone(id: string, data: Partial<DeliveryZone>): Promise<DeliveryZone | undefined>;
  deleteDeliveryZone(id: string): Promise<boolean>;
  
  // Chat operations
  createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage>;
  getMessages(userId1: string, userId2: string): Promise<ChatMessage[]>;
  markMessageDelivered(messageId: string): Promise<void>;
  markMessagesAsRead(senderId: string, receiverId: string): Promise<Array<{
    id: string;
    senderId: string;
    receiverId: string;
    readAt: Date | null;
    deliveredAt: Date | null;
  }>>;
  getUnreadMessageCount(userId: string): Promise<number>;
  
  // Transaction operations
  createTransaction(data: any): Promise<Transaction>;
  getTransactionByReference(reference: string): Promise<Transaction | undefined>;
  // Idempotency key operations (simple DB-backed keys for init/webhook dedupe)
  createIdempotencyKey(key: string, payload?: any): Promise<{ key: string }>;
  getIdempotencyKey(key: string): Promise<any | undefined>;
  getIdempotencyByReference(reference: string): Promise<any | undefined>;
  markIdempotencyUsed(key: string, reference?: string): Promise<void>;
  incrementIdempotencyRetry(key: string): Promise<number>;
  
  // Commission operations
  createCommission(data: InsertCommission): Promise<Commission>;
  createPlatformEarning(data: InsertPlatformEarning): Promise<PlatformEarning>;
  createCommissionWithEarning(orderId: string): Promise<{commission: Commission, earning: PlatformEarning}>;
  ensureAutomaticSellerPayoutForCommission(commissionId: string): Promise<SellerPayout | undefined>;
  repairUnsafeSellerPayoutRecords(limit?: number): Promise<number>;
  backfillMissingCommissionEarnings(limit?: number): Promise<number>;
  getSellerAvailableBalance(sellerId: string): Promise<number>;
  getSellerCommissions(sellerId: string, status?: string): Promise<Commission[]>;
  
  // Seller Payout operations
  createSellerPayout(data: InsertSellerPayout): Promise<SellerPayout>;
  getAdminSellerPayoutSummaries(): Promise<Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isApproved: boolean;
    hasPayoutSetup: boolean;
    payoutType: string | null;
    totalPaid: string;
    pendingAmount: string;
    payoutCount: number;
    completedPayoutCount: number;
    lastPayoutAt: Date | null;
  }>>;
  getSellerPayouts(sellerId: string): Promise<SellerPayout[]>;
  activateEligibleSellerPayoutsForSeller(sellerId: string): Promise<{ releasedCount: number; releasedAmount: number }>;
  getAllPendingPayouts(): Promise<SellerPayout[]>;
  updateSellerPayoutDetails(payoutId: string, bankDetailsPatch: Record<string, any>, notes?: string): Promise<SellerPayout | undefined>;
  updatePayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<SellerPayout | undefined>;
  
  // Rider Payout operations
  createRiderPayout(data: InsertRiderPayout): Promise<RiderPayout>;
  getRiderPayouts(riderId: string): Promise<RiderPayout[]>;
  getAllPendingRiderPayouts(): Promise<RiderPayout[]>;
  updateRiderPayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<RiderPayout | undefined>;
  getRiderAvailableBalance(riderId: string): Promise<number>;
  queueRiderPayout(riderId: string, amount: number, orderId: string): Promise<RiderPayout>;
  
  // Platform settings
  getPlatformSettings(): Promise<PlatformSettings>;
  updatePlatformSettings(data: Partial<PlatformSettings>): Promise<PlatformSettings>;
  
  // Cart operations
  addToCart(userId: string, productId: string, quantity: number, variantId?: string, selectedColor?: string, selectedSize?: string, selectedImageIndex?: number): Promise<Cart>;
  getCart(userId: string): Promise<Array<{ id: string; productId: string; productName: string; productImage: string; quantity: number; price: string; variantId: string | null; selectedColor: string | null; selectedSize: string | null; selectedImageIndex: number | null; availableStock: number; requiresVariantSelection?: boolean }>>;
  updateCartItem(id: string, quantity: number): Promise<Cart | undefined>;
  removeFromCart(id: string): Promise<boolean>;
  clearCart(userId: string): Promise<void>;
  reassignCartVariantReferences(sourceVariantIds: string[], targetVariantId: string): Promise<void>;
  clearCartVariantReferences(variantIds: string[]): Promise<void>;
  
  // Wishlist operations
  addToWishlist(userId: string, productId: string): Promise<Wishlist>;
  getWishlist(userId: string): Promise<Wishlist[]>;
  removeFromWishlist(userId: string, productId: string): Promise<boolean>;
  
  // Delivery Tracking operations
  createDeliveryTracking(data: InsertDeliveryTracking): Promise<DeliveryTracking>;
  getLatestDeliveryLocation(orderId: string): Promise<DeliveryTracking | undefined>;
  getLatestRiderLocation(riderId: string): Promise<DeliveryTracking | undefined>;
  getDeliveryTrackingHistory(orderId: string): Promise<DeliveryTracking[]>;
  
  // Review operations
  createReview(review: InsertReview & { userId: string }): Promise<Review>;
  getProductReviews(productId: string): Promise<Array<Review & { userName: string; profileImage: string | null }>>;
  addSellerReply(reviewId: string, reply: string): Promise<Review | undefined>;
  verifyPurchaseForReview(userId: string, productId: string): Promise<{ verified: boolean; orderId?: string }>;
  
  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  markNotificationAsRead(notificationId: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(notificationId: string, userId: string): Promise<boolean>;
  
  // Product Variant operations
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  
  // Category Fields operations (admin only)
  createCategoryField(field: any): Promise<any>;
  getCategoryFields(categoryName?: string): Promise<any[]>;
  updateCategoryField(id: string, data: any): Promise<any | undefined>;
  deleteCategoryField(id: string): Promise<boolean>;
  
  // Store operations
  createStore(store: any): Promise<any>;
  getStore(id: string): Promise<any | undefined>;
  getStores(filters?: { isActive?: boolean; isApproved?: boolean }): Promise<any[]>;
  getStoreByPrimarySeller(sellerId: string): Promise<any | undefined>;
  updateStore(id: string, data: any): Promise<any | undefined>;
  deleteStore(id: string): Promise<boolean>;
  
  // Category operations
  createCategory(category: any): Promise<any>;
  getCategory(id: string): Promise<any | undefined>;
  getCategoryBySlug(slug: string): Promise<any | undefined>;
  getCategories(filters?: { isActive?: boolean }): Promise<any[]>;
  getCategoriesByStore(storeId: string): Promise<any[]>;
  updateCategory(id: string, data: any): Promise<any | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Hero Banner operations
  getHeroBanners(storeMode?: string): Promise<HeroBanner[]>;
  getAllHeroBanners(): Promise<HeroBanner[]>;
  getHeroBanner(id: string): Promise<HeroBanner | undefined>;
  createHeroBanner(banner: InsertHeroBanner): Promise<HeroBanner>;
  updateHeroBanner(id: string, data: Partial<HeroBanner>): Promise<HeroBanner | undefined>;
  deleteHeroBanner(id: string): Promise<boolean>;
  
  // Coupon operations
  createCoupon(coupon: InsertCoupon & { sellerId: string }): Promise<Coupon>;
  getCoupon(id: string): Promise<Coupon | undefined>;
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  getCouponsBySeller(sellerId: string): Promise<Coupon[]>;
  updateCoupon(id: string, data: Partial<Coupon>): Promise<Coupon | undefined>;
  deleteCoupon(id: string): Promise<boolean>;
  validateCoupon(code: string, sellerId: string, orderTotal: number): Promise<{ valid: boolean; message?: string; coupon?: Coupon }>;
  
  // Analytics
  getAnalytics(userId?: string, role?: string): Promise<any>;
  
  // Banner Collection operations
  createBannerCollection(collection: InsertBannerCollection): Promise<BannerCollection>;
  getBannerCollection(id: string): Promise<BannerCollection | undefined>;
  getBannerCollections(): Promise<BannerCollection[]>;
  updateBannerCollection(id: string, data: Partial<BannerCollection>): Promise<BannerCollection | undefined>;
  deleteBannerCollection(id: string): Promise<boolean>;
  
  // Marketplace Banner operations
  createMarketplaceBanner(banner: InsertMarketplaceBanner): Promise<MarketplaceBanner>;
  getMarketplaceBanner(id: string): Promise<MarketplaceBanner | undefined>;
  getMarketplaceBanners(collectionId?: string): Promise<MarketplaceBanner[]>;
  getActiveMarketplaceBanners(): Promise<MarketplaceBanner[]>;
  updateMarketplaceBanner(id: string, data: Partial<MarketplaceBanner>): Promise<MarketplaceBanner | undefined>;
  deleteMarketplaceBanner(id: string): Promise<boolean>;
  
  // Footer Pages operations
  getActiveFooterPages(): Promise<FooterPage[]>;
  getAllFooterPages(): Promise<FooterPage[]>;
  createFooterPage(data: InsertFooterPage): Promise<FooterPage>;
  updateFooterPage(id: string, data: Partial<FooterPage>): Promise<FooterPage | undefined>;
  deleteFooterPage(id: string): Promise<boolean>;
  reorderMarketplaceBanners(bannerIds: string[]): Promise<void>;
  
  // Multi-vendor homepage data
  getApprovedSellers(): Promise<User[]>;
  getFeaturedProducts(limit?: number, sellerId?: string, storeId?: string): Promise<Product[]>;
  
  // Media Library operations
  createMediaLibraryItem(data: InsertMediaLibrary): Promise<MediaLibrary>;
  getMediaLibraryItems(filters?: { category?: string; uploaderRole?: string; uploaderId?: string }): Promise<MediaLibrary[]>;
  deleteMediaLibraryItem(id: string): Promise<boolean>;
  
  // Role Features operations (super_admin only)
  getRoleFeatures(role?: string): Promise<any[]>;
  updateRoleFeatures(role: string, features: Record<string, boolean>, updatedBy: string): Promise<any>;
}

export class DbStorage implements IStorage {
  // FREE TIER OPTIMIZATION: Query result caching (saves 44 DB calls/day)
  private queryCache = new Map<string, { timestamp: number; data: any }>();
  private buyerOrderResolutionInFlight = new Map<string, Promise<number>>();
  private readonly CACHE_TTL = {
    getAllOrders: 5 * 60 * 1000,      // 5 minutes
    getProducts: 15 * 1000,            // 15 seconds
    getProduct: 60 * 1000,             // 1 minute
    getProductVariants: 60 * 1000,     // 1 minute
    getProductReviews: 30 * 1000,      // 30 seconds
    getPlatformSettings: 60 * 60 * 1000, // 1 hour
    getDeliveryZones: 30 * 60 * 1000,  // 30 minutes
  };

  private getCachedResult(key: string, ttlMs: number): any | null {
    const entry = this.queryCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > ttlMs) {
      this.queryCache.delete(key);
      return null;
    }
    return entry.data;
  }

  private setCachedResult(key: string, data: any): void {
    this.queryCache.set(key, { timestamp: Date.now(), data });
  }

  private scheduleBuyerOrderResolution(userId: string): void {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return;
    if (this.buyerOrderResolutionInFlight.has(normalizedUserId)) return;

    const task = this.resolveBuyerUnpaidOrders(normalizedUserId)
      .catch((error) => {
        console.warn("Background unpaid-order resolution failed:", error instanceof Error ? error.message : String(error));
        return 0;
      })
      .finally(() => {
        this.buyerOrderResolutionInFlight.delete(normalizedUserId);
      });

    this.buyerOrderResolutionInFlight.set(normalizedUserId, task);
  }

  private buildCartSelectionKey(row: {
    productId?: string | null;
    variantId?: string | null;
    selectedColor?: string | null;
    selectedSize?: string | null;
  }) {
    return [
      String(row.productId || "").trim(),
      String(row.variantId || "").trim(),
      String(row.selectedColor || "").trim().toLowerCase(),
      String(row.selectedSize || "").trim().toLowerCase(),
    ].join("::");
  }

  private async mergeDuplicateCartSelections(userId: string): Promise<void> {
    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) return;

    const rows = await db
      .select({
        id: cart.id,
        productId: cart.productId,
        variantId: cart.variantId,
        selectedColor: cart.selectedColor,
        selectedSize: cart.selectedSize,
        selectedImageIndex: cart.selectedImageIndex,
        quantity: cart.quantity,
        updatedAt: cart.updatedAt,
        createdAt: cart.createdAt,
      })
      .from(cart)
      .where(eq(cart.userId, normalizedUserId))
      .orderBy(desc(cart.updatedAt), desc(cart.createdAt));

    if (rows.length < 2) return;

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = this.buildCartSelectionKey(row);
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }

    for (const groupRows of Array.from(groups.values())) {
      if (groupRows.length < 2) continue;

      const primary = groupRows[0];
      const duplicates = groupRows.slice(1);
      const mergedQuantity = groupRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.quantity || 0)),
        0,
      );

      await db.transaction(async (tx) => {
        await tx
          .update(cart)
          .set({
            quantity: mergedQuantity,
            selectedImageIndex: primary.selectedImageIndex ?? 0,
            updatedAt: new Date(),
          })
          .where(eq(cart.id, primary.id));

        await tx
          .delete(cart)
          .where(inArray(cart.id, duplicates.map((row) => row.id)));
      });
    }
  }

  async resolveBuyerUnpaidOrders(
    userId: string,
    options?: {
      orderIds?: string[];
      force?: boolean;
      maxAgeMs?: number;
    },
  ): Promise<number> {
    await ensureOrderItemsSchemaCompat();
    await ensureProductVariantsSchemaCompat();

    const normalizedUserId = String(userId || "").trim();
    if (!normalizedUserId) {
      return 0;
    }

    const normalizedOrderIds = Array.from(
      new Set((options?.orderIds || []).map((id) => String(id || "").trim()).filter(Boolean)),
    );
    const shouldForce = options?.force === true;
    const cutoff = new Date(Date.now() - (options?.maxAgeMs ?? ABANDONED_CHECKOUT_GRACE_MS));

    const pendingOrders = await db
      .select({
        id: orders.id,
        buyerId: orders.buyerId,
        couponCode: orders.couponCode,
        status: orders.status,
        paymentStatus: orders.paymentStatus,
      })
      .from(orders)
      .where(
        and(
          eq(orders.buyerId, normalizedUserId),
          eq(orders.paymentStatus, "pending"),
          or(
            eq(orders.status, "pending"),
            eq(orders.status, "processing"),
            sql`${orders.status}::text = 'created'`,
          ),
          normalizedOrderIds.length > 0 ? inArray(orders.id, normalizedOrderIds) : sql`true`,
          shouldForce ? sql`true` : lte(orders.createdAt, cutoff),
        ),
      );

    if (!pendingOrders.length) {
      return 0;
    }

    const touchedProductIds = new Set<string>();

    await db.transaction(async (tx) => {
      const currentCartRows = await tx
        .select({
          productId: cart.productId,
          variantId: cart.variantId,
          selectedColor: cart.selectedColor,
          selectedSize: cart.selectedSize,
          selectedImageIndex: cart.selectedImageIndex,
        })
        .from(cart)
        .where(eq(cart.userId, normalizedUserId));

      const cartKeys = new Set(
        currentCartRows.map((row) =>
          [
            String(row.productId || ""),
            String(row.variantId || ""),
            String(row.selectedColor || ""),
            String(row.selectedSize || ""),
            String(row.selectedImageIndex ?? 0),
          ].join("::"),
        ),
      );

      for (const orderRow of pendingOrders) {
        const [freshOrderState] = await tx
          .select({
            id: orders.id,
            couponCode: orders.couponCode,
            status: orders.status,
            paymentStatus: orders.paymentStatus,
          })
          .from(orders)
          .where(eq(orders.id, orderRow.id))
          .for("update");

        if (!freshOrderState) {
          continue;
        }

        const normalizedPaymentStatus = String(freshOrderState.paymentStatus || "").toLowerCase().trim();
        const normalizedOrderStatus = String(freshOrderState.status || "").toLowerCase().trim();
        if (
          ["completed", "paid", "success"].includes(normalizedPaymentStatus) ||
          !["pending", "processing", "created"].includes(normalizedOrderStatus)
        ) {
          continue;
        }

        const items = await tx
          .select({
            productId: orderItems.productId,
            variantId: orderItems.variantId,
            selectedColor: orderItems.selectedColor,
            selectedSize: orderItems.selectedSize,
            selectedImageIndex: orderItems.selectedImageIndex,
            quantity: orderItems.quantity,
          })
          .from(orderItems)
          .where(eq(orderItems.orderId, orderRow.id));

        const quantityByProduct = new Map<string, number>();
        const quantityByVariant = new Map<string, { productId: string; quantity: number }>();
        const touchedVariantProductIds = new Set<string>();
        for (const item of items) {
          const productId = String(item.productId || "").trim();
          const variantId = String(item.variantId || "").trim();
          const quantity = normalizeRequestedQuantity(item.quantity);
          if (!productId || quantity <= 0) continue;
          touchedProductIds.add(productId);
          if (variantId) {
            const current = quantityByVariant.get(variantId);
            quantityByVariant.set(variantId, {
              productId,
              quantity: (current?.quantity || 0) + quantity,
            });
            touchedVariantProductIds.add(productId);
            continue;
          }
          quantityByProduct.set(productId, (quantityByProduct.get(productId) || 0) + quantity);
        }

        for (const [variantId, variantRow] of Array.from(quantityByVariant.entries())) {
          await tx
            .update(productVariants)
            .set({
              stock: sql`${productVariants.stock} + ${variantRow.quantity}`,
            })
            .where(eq(productVariants.id, variantId));
        }

        for (const [productId, quantity] of Array.from(quantityByProduct.entries())) {
          await tx
            .update(products)
            .set({
              stock: sql`${products.stock} + ${quantity}`,
              updatedAt: new Date(),
            })
            .where(eq(products.id, productId));
        }

        for (const productId of Array.from(touchedVariantProductIds)) {
          await syncProductVariantState(tx, productId);
        }

        for (const item of items) {
          const productId = String(item.productId || "").trim();
          const variantId = String(item.variantId || "").trim() || null;
          const selectedColor = String(item.selectedColor || "").trim() || null;
          const selectedSize = String(item.selectedSize || "").trim() || null;
          const selectedImageIndex = Number.isFinite(Number(item.selectedImageIndex))
            ? Math.max(0, Number(item.selectedImageIndex) || 0)
            : 0;
          const quantity = normalizeRequestedQuantity(item.quantity);
          if (!productId || quantity <= 0) continue;

          const cartKey = [
            productId,
            variantId || "",
            selectedColor || "",
            selectedSize || "",
            String(selectedImageIndex),
          ].join("::");
          if (cartKeys.has(cartKey)) {
            continue;
          }

          await tx.insert(cart).values({
            userId: normalizedUserId,
            productId,
            quantity,
            variantId,
            selectedColor,
            selectedSize,
            selectedImageIndex,
            updatedAt: new Date(),
          });
          cartKeys.add(cartKey);
        }

        if (freshOrderState.couponCode) {
          await tx
            .update(coupons)
            .set({
              usedCount: sql`GREATEST(COALESCE(${coupons.usedCount}, 0) - 1, 0)`,
            })
            .where(eq(coupons.code, freshOrderState.couponCode));
        }

        await tx
          .update(orders)
          .set({
            paymentStatus: "failed",
            status: "cancelled",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, orderRow.id));

        await tx.insert(orderStatusHistory).values({
          orderId: orderRow.id,
          fromStatus: (normalizeOrderStatusForDatabase(freshOrderState.status as any) || "pending") as any,
          toStatus: "cancelled" as any,
          changedBy: normalizedUserId,
          changedByRole: "buyer" as any,
          reason: "payment_abandoned_restored",
          metadata: {
            paymentStatus: freshOrderState.paymentStatus,
            restoredToCart: true,
            restoredItems: items.length,
          } as any,
        });
      }
    });

    this.invalidateOrderCache();
    this.invalidateProductInventoryCaches(touchedProductIds);
    return pendingOrders.length;
  }

  private invalidateCache(pattern?: string): void {
    if (!pattern) {
      this.queryCache.clear();
      return;
    }
    // Invalidate entries matching pattern
    for (const key of Array.from(this.queryCache.keys())) {
      if (key.includes(pattern)) {
        this.queryCache.delete(key);
      }
    }
  }

  private invalidateOrderCache(): void {
    this.invalidateCache("getAllOrders");
  }

  private invalidateProductInventoryCaches(productIds: Iterable<string>): void {
    const normalizedIds = Array.from(
      new Set(
        Array.from(productIds)
          .map((id) => String(id || "").trim())
          .filter(Boolean),
      ),
    );

    if (normalizedIds.length === 0) {
      return;
    }

    for (const productId of normalizedIds) {
      this.invalidateCache(`getProduct:${productId}`);
      this.invalidateCache(`getProductVariants:${productId}`);
    }

    this.invalidateCache("getProducts");
  }

  // Helper method for database operations with retry logic
  private async executeDbOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: unknown) {
        const normalizedError = error instanceof Error ? error : new Error(String(error));
        lastError = normalizedError;
        console.warn(
          `Database operation ${operationName} failed (attempt ${attempt}/${maxRetries}):`,
          normalizedError.message
        );
        
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    const finalError = lastError ?? new Error(`Database operation ${operationName} failed`);
    console.error(`Database operation ${operationName} failed after ${maxRetries} attempts:`, finalError);
    throw finalError;
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await this.executeDbOperation(
      () => db.select().from(users).where(eq(users.id, id)).limit(1),
      'getUser'
    );
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await this.executeDbOperation(
      () => db.select().from(users).where(eq(users.email, email)).limit(1),
      'getUserByEmail'
    );
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values([user as any]).returning();
    return result[0];
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, role as any));
  }

  // Product operations
  async createProduct(product: InsertProduct & { sellerId: string }): Promise<Product> {
    const result = await db.insert(products).values(product).returning();
    this.invalidateCache("getProducts");
    return result[0];
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const cacheKey = `getProduct:${id}`;
    const cached = this.getCachedResult(cacheKey, this.CACHE_TTL.getProduct);
    if (cached) {
      return cached;
    }

    const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
    const product = result[0];

    if (product) {
      this.setCachedResult(cacheKey, product);
    }

    return product;
  }

  async getProducts(filters?: { sellerId?: string; storeId?: string; category?: string; isActive?: boolean }): Promise<Product[]> {
    const conditions = [];

    if (filters?.sellerId) {
      conditions.push(eq(products.sellerId, filters.sellerId));
    }
    if (filters?.storeId) {
      conditions.push(eq(products.storeId, filters.storeId));
    }
    if (filters?.category) {
      conditions.push(eq(products.category, filters.category));
    }
    if (filters?.isActive !== undefined) {
      conditions.push(eq(products.isActive, filters.isActive));
    }

    const query = db.select().from(products);
    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query).orderBy(desc(products.createdAt));

    if (rows.length === 0) return rows;
    return rows;
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product | undefined> {
    const result = await db.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, id)).returning();
    this.invalidateCache(`getProduct:${id}`);
    this.invalidateCache("getProducts");
    return result[0];
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    this.invalidateCache(`getProduct:${id}`);
    this.invalidateCache("getProducts");
    this.invalidateCache(`getProductVariants:${id}`);
    this.invalidateCache(`getProductReviews:${id}`);
    return true;
  }

  // Order operations
  async createOrder(
    order: InsertOrder, 
    items: Array<CheckoutStockItem & { price: string; total: string }>
  ): Promise<Order> {
    await ensureOrderItemsSchemaCompat();
    const touchedProductIds = new Set(
      items
        .map((item) => String(item.productId || "").trim())
        .filter(Boolean),
    );
    const createdOrder = await db.transaction(async (tx) => {
      await reserveProductStock(tx, items);

      const orderNumber = `ORD-${Date.now()}`;
      const qrCode = `${orderNumber}-${order.buyerId}`;
      const deliveryOtp = generateNumericOtp();
      const pickupOtp = generateNumericOtp();
      const normalizedStatus = normalizeOrderStatusForDatabase((order as any).status);
      
      const [newOrder] = await tx.insert(orders).values({
        ...order,
        ...(normalizedStatus ? { status: normalizedStatus as any } : {}),
        orderNumber,
        qrCode,
        deliveryOtp,
        pickupOtp,
      }).returning();

      if (items.length > 0) {
        await tx.insert(orderItems).values(items.map((item) => ({
          orderId: newOrder.id,
          productId: item.productId,
          variantId: String(item.variantId || "").trim() || null,
          selectedColor: String(item.selectedColor || "").trim() || null,
          selectedSize: String(item.selectedSize || "").trim() || null,
          selectedImageIndex: Number.isFinite(Number(item.selectedImageIndex))
            ? Math.max(0, Number(item.selectedImageIndex) || 0)
            : 0,
          quantity: item.quantity,
          price: item.price,
          total: item.total,
        })));
      }

      if (order.couponCode) {
        await tx.update(coupons)
          .set({ usedCount: sql`COALESCE(${coupons.usedCount}, 0) + 1` })
          .where(eq(coupons.code, order.couponCode));
      }

      return newOrder;
    });
    this.invalidateOrderCache();
    this.invalidateProductInventoryCaches(touchedProductIds);
    return createdOrder;
  }

  async createMultiSellerOrders(
    baseOrderData: Omit<InsertOrder, 'sellerId' | 'storeId' | 'subtotal' | 'total' | 'processingFee'>,
    itemsBySeller: Array<{
      sellerId: string;
      storeId: string | null;
      items: Array<CheckoutStockItem & { price: string; total: string }>;
      subtotal: number;
      deliveryFee: number;
      processingFee: number;
      couponDiscount: number;
      total: number;
    }>
  ): Promise<{ sessionId: string; orders: Order[] }> {
    await ensureOrderItemsSchemaCompat();
    const touchedProductIds = new Set(
      itemsBySeller
        .flatMap((sellerGroup) => sellerGroup.items)
        .map((item) => String(item.productId || "").trim())
        .filter(Boolean),
    );
    const createdOrderBatch = await db.transaction(async (tx) => {
      await reserveProductStock(
        tx,
        itemsBySeller.flatMap((sellerGroup) => sellerGroup.items),
      );

      const sessionId = `SESSION-${Date.now()}`;
      const createdOrders: Order[] = [];

      for (const sellerGroup of itemsBySeller) {
        const orderNumber = `ORD-${Date.now()}-${sellerGroup.sellerId.slice(0, 8)}`;
        const qrCode = `${orderNumber}-${baseOrderData.buyerId}`;
        const deliveryOtp = generateNumericOtp();
        const pickupOtp = generateNumericOtp();
        const normalizedStatus = normalizeOrderStatusForDatabase((baseOrderData as any).status);

        const [newOrder] = await tx.insert(orders).values({
          ...baseOrderData,
          ...(normalizedStatus ? { status: normalizedStatus as any } : {}),
          sellerId: sellerGroup.sellerId,
          storeId: sellerGroup.storeId,
          checkoutSessionId: sessionId,
          orderNumber,
          qrCode,
          deliveryOtp,
          pickupOtp,
          subtotal: sellerGroup.subtotal.toFixed(2),
          deliveryFee: sellerGroup.deliveryFee.toFixed(2),
          processingFee: sellerGroup.processingFee.toFixed(2),
          couponDiscount: sellerGroup.couponDiscount > 0 ? sellerGroup.couponDiscount.toFixed(2) : null,
          total: sellerGroup.total.toFixed(2),
        }).returning();

        if (sellerGroup.items.length > 0) {
          await tx.insert(orderItems).values(sellerGroup.items.map((item) => ({
            orderId: newOrder.id,
            productId: item.productId,
            variantId: String(item.variantId || "").trim() || null,
            selectedColor: String(item.selectedColor || "").trim() || null,
            selectedSize: String(item.selectedSize || "").trim() || null,
            selectedImageIndex: Number.isFinite(Number(item.selectedImageIndex))
              ? Math.max(0, Number(item.selectedImageIndex) || 0)
              : 0,
            quantity: item.quantity,
            price: item.price,
            total: item.total,
          })));
        }

        createdOrders.push(newOrder);
      }

      // Increment coupon usage count if coupon was applied
      if (baseOrderData.couponCode) {
        await tx.update(coupons)
          .set({ usedCount: sql`COALESCE(${coupons.usedCount}, 0) + 1` })
          .where(eq(coupons.code, baseOrderData.couponCode));
      }

      return { sessionId, orders: createdOrders };
    });
    this.invalidateOrderCache();
    this.invalidateProductInventoryCaches(touchedProductIds);
    return createdOrderBatch;
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return result[0];
  }

  async getAllOrders(): Promise<Order[]> {
    // FREE TIER OPTIMIZATION: Cache frequently accessed query (saves 44 calls/day)
    const cacheKey = "getAllOrders";
    const cached = this.getCachedResult(cacheKey, this.CACHE_TTL.getAllOrders);
    if (cached) return cached;

    const result = await db.select().from(orders).orderBy(desc(orders.createdAt));
    this.setCachedResult(cacheKey, result);
    return result;
  }

  async getOrdersByUser(userId: string, role: "buyer" | "seller" | "rider"): Promise<Order[]> {
    if (role === "buyer") {
      return db.select().from(orders).where(eq(orders.buyerId, userId)).orderBy(desc(orders.createdAt));
    } else if (role === "seller") {
      return db.select().from(orders).where(eq(orders.sellerId, userId)).orderBy(desc(orders.createdAt));
    } else {
      return db.select().from(orders).where(eq(orders.riderId, userId as any)).orderBy(desc(orders.createdAt));
    }
  }

  async getOrderItems(orderId: string): Promise<Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    selectedColor: string | null;
    selectedSize: string | null;
    image?: string | null;
  }>> {
    await ensureOrderItemsSchemaCompat();
    const items = await db
      .select({
        productId: orderItems.productId,
        productName: products.name,
        quantity: orderItems.quantity,
        price: orderItems.price,
        selectedColor: orderItems.selectedColor,
        selectedSize: orderItems.selectedSize,
        selectedImageIndex: orderItems.selectedImageIndex,
        productImages: products.images,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));
    
    return items.map(item => ({
      ...item,
      productName: item.productName || "Unknown Product",
      image: Array.isArray(item.productImages)
        ? item.productImages[Math.max(0, Number(item.selectedImageIndex ?? 0))] || item.productImages[0] || null
        : null,
    }));
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const { canonicalizeOrderStatus, toStorageOrderStatus } = await import("./services/orderStateMachine");
    const normalizedStatus = canonicalizeOrderStatus(status);
    const storageStatus = toStorageOrderStatus(normalizedStatus as any);
    const result = await db.update(orders).set({ 
      status: storageStatus as any,
      updatedAt: new Date(),
      ...(normalizedStatus === "delivered" ? { deliveredAt: new Date() } : {})
    }).where(eq(orders.id, id)).returning();
    if (result[0]) this.invalidateOrderCache();
    return result[0];
  }

  async applyOrderStatusTransition(
    orderId: string,
    toStatus: string,
    changedBy: string,
    changedByRole: string,
    reason?: string
  ): Promise<Order | undefined> {
    // CRITICAL: Use transaction to ensure atomicity
    // Read order, validate, compute side effects, update, and audit trail must all be atomic
    try {
      const platformSettings = await this.getPlatformSettings();
      const updatedOrder = await db.transaction(async (tx) => {
        // CRITICAL: Read order INSIDE transaction with row lock (FOR UPDATE)
        // This prevents TOCTOU race conditions
        const currentOrderResult = await tx.select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update'); // Lock row for duration of transaction

        const currentOrder = currentOrderResult[0];

        if (!currentOrder) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const fromStatus = currentOrder.status;

        // CRITICAL: Validate transition INSIDE transaction with locked order state
        // This prevents validation on stale data
        const { assertCanTransition, getTransitionSideEffects, canonicalizeOrderStatus, toStorageOrderStatus } = await import("./services/orderStateMachine");
        const normalizedStatus = canonicalizeOrderStatus(toStatus);
        const storageStatus = toStorageOrderStatus(normalizedStatus as any);

        const transitionResult = assertCanTransition({
          order: currentOrder, // Use locked order state
          targetStatus: normalizedStatus as any,
          actorId: changedBy,
          actorRole: changedByRole as any,
          reason,
          isExternalRiderSystemEnabled: platformSettings?.isExternalRiderSystemEnabled === true,
        });

        if (!transitionResult.valid) {
          const error = transitionResult.error;
          // Throw with error code for proper HTTP status mapping
          const errorWithCode = new Error(error.message);
          (errorWithCode as any).code = error.code;
          (errorWithCode as any).details = error.details;
          throw errorWithCode;
        }

        // Compute side effects based on locked order state
        const sideEffects = getTransitionSideEffects(currentOrder, normalizedStatus as any);

        // Apply status change with side effects
        const result = await tx.update(orders).set({
          status: storageStatus as any,
          updatedAt: new Date(),
          ...sideEffects,
        })
        .where(eq(orders.id, orderId))
        .returning();

        const updatedOrder = result[0];

        if (!updatedOrder) {
          throw new Error("UPDATE_FAILED");
        }

        // Create audit trail entry (inside same transaction)
        await tx.insert(orderStatusHistory).values({
          orderId,
          fromStatus: (normalizeOrderStatusForDatabase(fromStatus as any) || "pending") as any,
          toStatus: storageStatus as any,
          changedBy,
          changedByRole: changedByRole as any,
          reason,
          metadata: sideEffects as any,
        });

        return updatedOrder;
      });

      if (updatedOrder) this.invalidateOrderCache();
      return updatedOrder;
    } catch (error: any) {
      console.error("Failed to apply order status transition:", error);
      // Re-throw with error code for proper HTTP status mapping
      throw error;
    }
  }

  async createOrderStatusHistory(data: InsertOrderStatusHistory): Promise<OrderStatusHistory> {
    const normalizedFromStatus = data.fromStatus
      ? normalizeOrderStatusForDatabase(data.fromStatus as any)
      : null;
    const normalizedToStatus = normalizeOrderStatusForDatabase(data.toStatus as any) || "pending";
    const result = await db.insert(orderStatusHistory).values({
      ...data,
      fromStatus: normalizedFromStatus as any,
      toStatus: normalizedToStatus as any,
    }).returning();
    return result[0];
  }

  async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    return db.select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(desc(orderStatusHistory.createdAt));
  }

  async updateOrder(orderId: string, data: Partial<Order>): Promise<Order | undefined> {
    const normalizedStatus = Object.prototype.hasOwnProperty.call(data, "status")
      ? normalizeOrderStatusForDatabase((data as any).status)
      : undefined;
    const result = await db.update(orders).set({ 
      ...data,
      ...(Object.prototype.hasOwnProperty.call(data, "status")
        ? { status: (normalizedStatus || "pending") as any }
        : {}),
      updatedAt: new Date()
    }).where(eq(orders.id, orderId)).returning();
    if (result[0]) this.invalidateOrderCache();
    return result[0];
  }

  async assignRider(orderId: string, riderId: string): Promise<Order | undefined> {
    const result = await db.update(orders).set({ 
      riderId,
      updatedAt: new Date()
    })
    .where(and(eq(orders.id, orderId), isNull(orders.riderId)))
    .returning();
    if (result[0]) this.invalidateOrderCache();
    return result[0];
  }

  async getAvailableRidersWithOrderCounts(): Promise<Array<{ rider: User; activeOrderCount: number }>> {
    const engagedStatuses = new Set([
      "searching_rider",
      "assigned",
      "rider_arrived",
      "picked_up",
      "in_transit",
      "en_route",
      "delivering",
    ]);
    const resolveMaxCapacity = (rider: any) => {
      const pref = Number((rider as any)?.riderPreferences?.maxActiveOrders);
      const vehicle = Number((rider as any)?.vehicleInfo?.maxCapacity);
      const fallback = 3;
      const resolved = Number.isFinite(pref) && pref > 0 ? pref : Number.isFinite(vehicle) && vehicle > 0 ? vehicle : fallback;
      return Math.max(1, Math.floor(resolved));
    };
    const allRiders = await db.select().from(users)
      .where(
        and(
          eq(users.role, 'rider'),
          eq(users.isApproved, true),
          eq(users.isActive, true),
          eq(users.riderOnline, true)
        )
      );

    const ridersWithCounts = await Promise.all(
      allRiders.map(async (rider) => {
        const riderOrders = await db.select()
          .from(orders)
          .where(eq(orders.riderId, rider.id));
        const activeOrders = riderOrders.filter((order) =>
          engagedStatuses.has(String(order.status || "").toLowerCase().trim())
        );
        
        return {
          rider,
          activeOrderCount: activeOrders.length
        };
      })
    );

    return ridersWithCounts.filter(r => r.activeOrderCount < resolveMaxCapacity(r.rider))
      .sort((a, b) => a.activeOrderCount - b.activeOrderCount);
  }

  // Delivery Zone operations
  async createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone> {
    // CRITICAL: Validate at storage layer to prevent bypass via seeds/scripts
    const { insertDeliveryZoneSchema } = await import("@shared/schema");
    
    // Parse and validate input (throws if invalid)
    // Zod coerce handles both string and number inputs
    const validatedZone = insertDeliveryZoneSchema.parse(zone);
    
    // Normalize zone name (trim whitespace)
    const normalizedZone = {
      ...validatedZone,
      name: validatedZone.name.trim(),
      entityKind: validatedZone.entityKind || "delivery_zone",
      type: (validatedZone.type || "city").toLowerCase(),
      city: validatedZone.city?.trim() || null,
      region: validatedZone.region?.trim() || null,
      fee: validatedZone.fee.toString(), // Convert number to string for database
    };
    
    // Check for duplicate names (case-insensitive)
    const existingZones = await db.select()
      .from(deliveryZones)
      .where(sql`lower(${deliveryZones.name}) = lower(${normalizedZone.name})`);
    
    if (existingZones.length > 0) {
      const error = new Error("A delivery zone with this name already exists. Please use a different name.");
      (error as any).code = 'DUPLICATE_ZONE_NAME';
      throw error;
    }
    
    const result = await db.insert(deliveryZones).values(normalizedZone).returning();
    return result[0];
  }

  async getDeliveryZones(
    includeInactive: boolean = false,
    entityKind: "delivery_zone" | "pickup_station" = "delivery_zone",
  ): Promise<DeliveryZone[]> {
    if (includeInactive) {
      return db.select().from(deliveryZones).where(eq(deliveryZones.entityKind, entityKind as any));
    }
    return db
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.isActive, true), eq(deliveryZones.entityKind, entityKind as any)));
  }

  async updateDeliveryZone(id: string, data: Partial<DeliveryZone>): Promise<DeliveryZone | undefined> {
    // CRITICAL: Validate at storage layer to prevent bypass
    // Don't mutate input - create new object with validated values
    const updateData: Partial<DeliveryZone> = {};
    
    // Validate fee if provided
    if (data.fee !== undefined) {
      const feeValue = typeof data.fee === 'string' ? parseFloat(data.fee) : data.fee;
      if (isNaN(feeValue) || feeValue < 0) {
        const error = new Error("Delivery fee must be a non-negative number");
        (error as any).code = 'INVALID_FEE';
        throw error;
      }
      updateData.fee = feeValue.toString() as any;
    }
    
    // Validate and normalize name if provided
    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (trimmedName.length === 0) {
        const error = new Error("Zone name cannot be empty");
        (error as any).code = 'INVALID_NAME';
        throw error;
      }
      if (trimmedName.length > 100) {
        const error = new Error("Zone name must be less than 100 characters");
        (error as any).code = 'INVALID_NAME';
        throw error;
      }
      
      // Check for duplicate names (case-insensitive), excluding current zone
      const existingZones = await db.select()
        .from(deliveryZones)
        .where(
          and(
            sql`lower(${deliveryZones.name}) = lower(${trimmedName})`,
            sql`${deliveryZones.id} != ${id}`
          )
        );
      
      if (existingZones.length > 0) {
        const error = new Error("A delivery zone with this name already exists. Please use a different name.");
        (error as any).code = 'DUPLICATE_ZONE_NAME';
        throw error;
      }
      
      updateData.name = trimmedName;
    }

    if (data.type !== undefined) {
      const normalizedType = String(data.type || "").toLowerCase();
      if (!["city", "region"].includes(normalizedType)) {
        const error = new Error("Zone type must be either city or region");
        (error as any).code = "INVALID_ZONE_TYPE";
        throw error;
      }
      updateData.type = normalizedType as any;
    }

    if (data.entityKind !== undefined) {
      const normalizedEntityKind = String(data.entityKind || "").toLowerCase().trim();
      if (!["delivery_zone", "pickup_station"].includes(normalizedEntityKind)) {
        const error = new Error("Zone kind must be either delivery_zone or pickup_station");
        (error as any).code = "INVALID_ZONE_KIND";
        throw error;
      }
      updateData.entityKind = normalizedEntityKind as any;
    }

    if (data.city !== undefined) {
      updateData.city = (data.city || "").trim() || null;
    }

    if (data.region !== undefined) {
      updateData.region = (data.region || "").trim() || null;
    }
    
    // Copy over other fields that don't need validation
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    
    const result = await db.update(deliveryZones).set(updateData).where(eq(deliveryZones.id, id)).returning();
    return result[0];
  }

  async deleteDeliveryZone(id: string): Promise<boolean> {
    const result = await db.delete(deliveryZones).where(eq(deliveryZones.id, id));
    return true;
  }

  // Chat operations
  async createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage> {
    const result = await db.insert(chatMessages).values(message).returning();
    return result[0];
  }

  async getMessages(userId1: string, userId2: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages)
      .where(
        sql`(${chatMessages.senderId} = ${userId1} AND ${chatMessages.receiverId} = ${userId2}) OR 
            (${chatMessages.senderId} = ${userId2} AND ${chatMessages.receiverId} = ${userId1})`
      )
      .orderBy(chatMessages.createdAt);
  }

  async markMessageDelivered(messageId: string): Promise<void> {
    await db.update(chatMessages)
      .set({ 
        status: 'delivered',
        deliveredAt: new Date()
      })
      .where(eq(chatMessages.id, messageId));
  }

  async markMessagesAsRead(senderId: string, receiverId: string): Promise<Array<{
    id: string;
    senderId: string;
    receiverId: string;
    readAt: Date | null;
    deliveredAt: Date | null;
  }>> {
    return db.update(chatMessages)
      .set({ 
        status: 'read',
        isRead: true,
        readAt: new Date(),
        deliveredAt: sql`COALESCE(delivered_at, NOW())`
      })
      .where(
        and(
          eq(chatMessages.senderId, senderId),
          eq(chatMessages.receiverId, receiverId),
          eq(chatMessages.isRead, false)
        )
      )
      .returning({
        id: chatMessages.id,
        senderId: chatMessages.senderId,
        receiverId: chatMessages.receiverId,
        readAt: chatMessages.readAt,
        deliveredAt: chatMessages.deliveredAt,
      });
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const result = await db.select().from(chatMessages)
      .where(
        and(
          eq(chatMessages.receiverId, userId),
          eq(chatMessages.isRead, false)
        )
      );
    return result.length;
  }

  // Transaction operations
  async createTransaction(data: any): Promise<Transaction> {
    const result = await db.insert(transactions).values(data as any).returning();
    return result[0];
  }

  async getTransactionByReference(reference: string): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.paymentReference, reference)).limit(1);
    return result[0];
  }

  // Idempotency helpers using typed Drizzle table `idempotencyKeys`
  async createIdempotencyKey(key: string, payload?: any): Promise<{ key: string }> {
    try {
      await db.insert(idempotencyKeys).values({ key, payload: payload ?? null }).onConflictDoNothing();
    } catch (e) {
      console.warn('[IDEMPOTENCY] insert failed', (e as any).message || e);
    }
    return { key };
  }

  async getIdempotencyKey(key: string): Promise<any | undefined> {
    try {
      const res = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
      return res[0];
    } catch (e) {
      console.warn('[IDEMPOTENCY] select failed', (e as any).message || e);
      return undefined;
    }
  }

  async getIdempotencyByReference(reference: string): Promise<any | undefined> {
    try {
      const res = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.usedReference, reference)).limit(1);
      return res[0];
    } catch (e) {
      console.warn('[IDEMPOTENCY] select by reference failed', (e as any).message || e);
      return undefined;
    }
  }

  async markIdempotencyUsed(key: string, reference?: string): Promise<void> {
    try {
      await db.update(idempotencyKeys).set({ used: true, usedReference: reference ?? null, lastAttempt: new Date() }).where(eq(idempotencyKeys.key, key));
    } catch (e) {
      console.warn('[IDEMPOTENCY] mark used failed', (e as any).message || e);
    }
  }

  async incrementIdempotencyRetry(key: string): Promise<number> {
    try {
      const updated = await db.update(idempotencyKeys)
        .set({ retries: sql`COALESCE(${idempotencyKeys.retries},0) + 1`, lastAttempt: new Date() })
        .where(eq(idempotencyKeys.key, key)).returning();
      if (updated && updated[0]) return (updated[0] as any).retries ?? 0;
      const res = await db.select({ retries: idempotencyKeys.retries }).from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
      return res[0]?.retries ?? 0;
    } catch (e) {
      console.warn('[IDEMPOTENCY] increment retry failed', (e as any).message || e);
      return 0;
    }
  }

  // Commission operations
  async createCommission(data: InsertCommission): Promise<Commission> {
    const result = await db.insert(commissions).values(data as any).returning();
    return result[0];
  }

  async createPlatformEarning(data: InsertPlatformEarning): Promise<PlatformEarning> {
    const result = await db.insert(platformEarnings).values(data as any).returning();
    return result[0];
  }

  // Fetch platform earnings list with optional pagination and filtering
  async getPlatformEarnings(limit = 50, offset = 0): Promise<PlatformEarning[]> {
    const rows = await db.select().from(platformEarnings).orderBy(desc(platformEarnings.createdAt)).limit(limit).offset(offset);
    return rows;
  }

  // Detailed platform earnings (joins to provide store/seller and order info) with filters
  async getPlatformEarningsDetailed(options?: { limit?: number; offset?: number; sellerId?: string; storeId?: string; from?: string; to?: string; type?: string }) {
    void this.backfillMissingCommissionEarnings(100).catch((error: any) => {
      console.error("[FINANCE] Background platform earnings sync failed:", error?.message || error);
    });
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const conditions: any[] = [];

    let query: any = db.select({
      id: platformEarnings.id,
      orderId: platformEarnings.orderId,
      commissionId: platformEarnings.commissionId,
      amount: platformEarnings.amount,
      type: platformEarnings.type,
      description: platformEarnings.description,
      createdAt: platformEarnings.createdAt,
      sellerId: commissions.sellerId,
      sellerName: users.name,
      storeId: stores.id,
      storeName: stores.name,
      orderNumber: orders.orderNumber,
      orderCreatedAt: orders.createdAt
    })
    .from(platformEarnings)
    .leftJoin(commissions, eq(platformEarnings.commissionId, commissions.id))
    .leftJoin(orders, eq(platformEarnings.orderId, orders.id))
    .leftJoin(stores, eq(commissions.sellerId, stores.primarySellerId))
    .leftJoin(users, eq(commissions.sellerId, users.id))
    .orderBy(desc(platformEarnings.createdAt)) as any;

    // Apply filters
    if (options?.sellerId) {
      conditions.push(eq(commissions.sellerId, options.sellerId));
    }
    if (options?.storeId) {
      conditions.push(eq(stores.id, options.storeId));
    }
    if (options?.type) {
      conditions.push(eq(platformEarnings.type, options.type));
    }
    if (options?.from) {
      const from = new Date(options.from);
      if (!Number.isNaN(from.getTime())) {
        from.setHours(0, 0, 0, 0);
        conditions.push(sql`${platformEarnings.createdAt} >= ${from}`);
      }
    }
    if (options?.to) {
      const to = new Date(options.to);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        conditions.push(sql`${platformEarnings.createdAt} <= ${to}`);
      }
    }
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const rows = await query;

    const shouldIncludePromotionRows = !options?.type || options.type === "promotion" || options.type === "promotion_fee";
    if (!shouldIncludePromotionRows) {
      return rows.slice(offset, offset + limit);
    }

    const promotionConditions: any[] = [
      eq(promotionApplications.paymentConfirmed, true),
      isNotNull(promotionApplications.approvedAt),
    ];

    if (options?.sellerId) {
      promotionConditions.push(eq(promotionApplications.sellerId, options.sellerId));
    }
    if (options?.from) {
      const from = new Date(options.from);
      if (!Number.isNaN(from.getTime())) {
        from.setHours(0, 0, 0, 0);
        promotionConditions.push(sql`${promotionApplications.approvedAt} >= ${from}`);
      }
    }
    if (options?.to) {
      const to = new Date(options.to);
      if (!Number.isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        promotionConditions.push(sql`${promotionApplications.approvedAt} <= ${to}`);
      }
    }

    const promotionBaseRows = await db
      .select({
        id: promotionApplications.id,
        sellerId: promotionApplications.sellerId,
        sellerName: users.name,
        type: promotionApplications.type,
        targetId: promotionApplications.targetId,
        targetName: promotionApplications.targetName,
        totalPrice: promotionApplications.totalPrice,
        approvedAt: promotionApplications.approvedAt,
      })
      .from(promotionApplications)
      .leftJoin(users, eq(promotionApplications.sellerId, users.id))
      .where(and(...promotionConditions));

    const cachedUsers = new Map<string, any>();
    const cachedStores = new Map<string, any>();
    const cachedProducts = new Map<string, any>();
    const getCachedUser = async (userId?: string | null) => {
      const id = String(userId || "").trim();
      if (!id) return null;
      if (!cachedUsers.has(id)) {
        cachedUsers.set(id, await this.getUser(id).catch(() => null));
      }
      return cachedUsers.get(id) || null;
    };
    const getCachedStore = async (storeId?: string | null) => {
      const id = String(storeId || "").trim();
      if (!id) return null;
      if (!cachedStores.has(id)) {
        cachedStores.set(id, await this.getStore(id).catch(() => null));
      }
      return cachedStores.get(id) || null;
    };
    const getCachedPromotionProduct = async (productId?: string | null) => {
      const id = String(productId || "").trim();
      if (!id) return null;
      if (!cachedProducts.has(id)) {
        const [product] = await db.select({
          id: products.id,
          name: products.name,
          sellerId: products.sellerId,
          storeId: products.storeId,
        }).from(products).where(eq(products.id, id)).limit(1);
        cachedProducts.set(id, product || null);
      }
      return cachedProducts.get(id) || null;
    };

    const promotionRows = [] as any[];
    for (const promotionRow of promotionBaseRows) {
      let resolvedStoreId: string | null = null;
      let resolvedStoreName: string | null = null;
      let resolvedSellerId: string | null = String(promotionRow.sellerId || "").trim() || null;
      let resolvedSellerName: string | null = String(promotionRow.sellerName || "").trim() || null;

      if (promotionRow.type === "store") {
        const store = await getCachedStore(String(promotionRow.targetId || ""));
        resolvedStoreId = store?.id || null;
        resolvedStoreName = store?.name || promotionRow.targetName || "Store Promotion";
        resolvedSellerId = String(store?.primarySellerId || resolvedSellerId || "").trim() || null;
      } else {
        const product = await getCachedPromotionProduct(String(promotionRow.targetId || ""));
        if (product?.storeId) {
          const store = await getCachedStore(String(product.storeId));
          resolvedStoreId = store?.id || null;
          resolvedStoreName = store?.name || null;
        }
        if (!resolvedStoreId && product?.sellerId) {
          const sellerStore = await this.getStoreByPrimarySeller(String(product.sellerId)).catch(() => null);
          if (sellerStore) {
            resolvedStoreId = sellerStore.id || null;
            resolvedStoreName = sellerStore.name || resolvedStoreName;
          }
        }
        resolvedSellerId = String(product?.sellerId || resolvedSellerId || "").trim() || null;
        resolvedStoreName = resolvedStoreName || promotionRow.targetName || "Product Promotion";
      }

      if (!resolvedStoreName && resolvedSellerId) {
        const sellerStore = await this.getStoreByPrimarySeller(resolvedSellerId).catch(() => null);
        if (sellerStore) {
          resolvedStoreId = sellerStore.id || resolvedStoreId;
          resolvedStoreName = sellerStore.name || resolvedStoreName;
        }
      }

      const sellerUser = await getCachedUser(resolvedSellerId);
      if (sellerUser) {
        resolvedSellerName =
          String(sellerUser.name || "").trim() ||
          String(sellerUser.storeName || "").trim() ||
          String(sellerUser.email || "").trim() ||
          resolvedSellerName;
      }

      if (options?.storeId && resolvedStoreId !== options.storeId) {
        continue;
      }

      promotionRows.push({
        id: `promotion-${promotionRow.id}`,
        orderId: null,
        commissionId: null,
        amount: promotionRow.totalPrice,
        type: "promotion",
        description: `${promotionRow.type === "store" ? "Store" : "Product"} promotion income for ${promotionRow.targetName}`,
        createdAt: promotionRow.approvedAt,
        sellerId: resolvedSellerId,
        sellerName: resolvedSellerName || "Unknown Seller",
        storeId: resolvedStoreId,
        storeName: resolvedStoreName || "Unknown Store",
        orderNumber: null,
        orderCreatedAt: null,
      });
    }

    return [...rows, ...promotionRows]
      .sort((a: any, b: any) => {
        const aTs = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTs = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTs - aTs;
      })
      .slice(offset, offset + limit);
  }

  // Summary of platform earnings grouped by type and total
  async getPlatformEarningsSummary(): Promise<{ total: string; totalRevenue: string; byType: Record<string, string> }> {
    void this.backfillMissingCommissionEarnings(100).catch((error: any) => {
      console.error("[FINANCE] Background finance summary sync failed:", error?.message || error);
    });
    const totals = await db.select({ type: platformEarnings.type, sum: sql`SUM(${platformEarnings.amount})` }).from(platformEarnings).groupBy(platformEarnings.type);
    const totalAll = await db.select({ sum: sql`SUM(${platformEarnings.amount})` }).from(platformEarnings);
    const promotionTotals = await db
      .select({ sum: sql`SUM(${promotionApplications.totalPrice})` })
      .from(promotionApplications)
      .where(and(eq(promotionApplications.paymentConfirmed, true), isNotNull(promotionApplications.approvedAt)));
    const byType: Record<string, string> = {};
    totals.forEach((t: any) => { byType[String(t.type)] = (parseFloat(String(t.sum)) || 0).toFixed(2); });
    const promotionSum = parseFloat(String(promotionTotals[0]?.sum)) || 0;
    if (promotionSum > 0) {
      byType.promotion = promotionSum.toFixed(2);
    }
    const commissionSum = parseFloat(String(byType.commission || 0)) || 0;
    return {
      total: ((parseFloat(String(totalAll[0]?.sum)) || 0) + promotionSum).toFixed(2),
      totalRevenue: (commissionSum + promotionSum).toFixed(2),
      byType,
    };
  }

  // Fetch recent transactions
  async getTransactions(limit = 50, offset = 0): Promise<Transaction[]> {
    const rows = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(limit).offset(offset);
    return rows;
  }

  // CRITICAL: Atomic commission creation with platform earning
  async createCommissionWithEarning(orderId: string): Promise<{commission: Commission, earning: PlatformEarning}> {
    return await db.transaction(async (tx) => {
      // Step 1: Check if commission already exists (idempotency)
      const existingCommission = await tx.select().from(commissions)
        .where(eq(commissions.orderId, orderId))
        .limit(1);
      
      if (existingCommission.length > 0) {
        const error = new Error(`Commission already exists for order ${orderId}`);
        (error as any).code = 'COMMISSION_ALREADY_EXISTS';
        throw error;
      }

      // Step 2: Get and validate order
      const [order] = await tx.select().from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      
      if (!order) {
        const error = new Error(`Order ${orderId} not found`);
        (error as any).code = 'ORDER_NOT_FOUND';
        throw error;
      }

      if (order.paymentStatus !== 'completed') {
        const error = new Error(`Order ${orderId} payment not completed (status: ${order.paymentStatus})`);
        (error as any).code = 'PAYMENT_NOT_COMPLETED';
        throw error;
      }

      if (!order.sellerId) {
        const error = new Error(`Order ${orderId} missing sellerId`);
        (error as any).code = 'MISSING_SELLER';
        throw error;
      }

      // Step 3: Get platform commission rate
      const settings = await this.getPlatformSettings();
      const commissionRatePercent = parseFloat(settings.defaultCommissionRate || "1.00");

      // Step 4: Calculate amounts using integer arithmetic (cents) for precision.
      // Commission applies only to the merchandise amount net of coupon discounts.
      // Delivery fees and processing fees are excluded from seller commission.
      const subtotalCents = Math.round((parseFloat(order.subtotal || "0") || 0) * 100);
      const couponDiscountCents = Math.round((parseFloat(order.couponDiscount || "0") || 0) * 100);
      const processingFeeCents = Math.round((parseFloat(order.processingFee || "0") || 0) * 100);
      const orderAmountCents = Math.max(0, subtotalCents - couponDiscountCents);
      const commissionAmountCents = Math.round((orderAmountCents * commissionRatePercent) / 100);
      const sellerAmountCents = orderAmountCents - commissionAmountCents;

      // Validation: Ensure splits add up correctly
      if (sellerAmountCents + commissionAmountCents !== orderAmountCents) {
        const error = new Error(`Commission split calculation error: ${sellerAmountCents} + ${commissionAmountCents} !== ${orderAmountCents}`);
        (error as any).code = 'CALCULATION_ERROR';
        throw error;
      }

      // Convert back to decimal strings for database
      const orderAmountDecimal = (orderAmountCents / 100).toFixed(2);
      const commissionAmountDecimal = (commissionAmountCents / 100).toFixed(2);
      const sellerAmountDecimal = (sellerAmountCents / 100).toFixed(2);

      // Step 5: Create commission record.
      // Keep as pending until payout workflow consumes it.
      const [commission] = await tx.insert(commissions).values({
        orderId: order.id,
        sellerId: order.sellerId,
        orderAmount: orderAmountDecimal,
        commissionRate: commissionRatePercent.toFixed(2),
        commissionAmount: commissionAmountDecimal,
        sellerAmount: sellerAmountDecimal,
        platformAmount: commissionAmountDecimal, // Same as commission amount
        status: "pending",
        processedAt: null,
      } as any).returning();

      // Step 6: Create linked platform earning
      const [earning] = await tx.insert(platformEarnings).values({
        orderId: order.id,
        commissionId: commission.id, // Link to commission
        amount: commissionAmountDecimal,
        type: "commission",
        description: `Commission from order #${order.orderNumber}`,
      } as any).returning();

      if (processingFeeCents > 0) {
        await tx.insert(platformEarnings).values({
          orderId: order.id,
          amount: (processingFeeCents / 100).toFixed(2),
          type: "service_fee",
          description: `Processing fee from order #${order.orderNumber}`,
        } as any);
      }

      return { commission, earning };
    });
  }

  private getSellerPayoutSetupState(store: any) {
    const payoutDetails = ((store?.payoutDetails as Record<string, any> | null) || {}) as Record<string, any>;
    const payoutType =
      store?.payoutType === "mobile_money"
        ? "mobile_money"
        : store?.payoutType === "bank_account"
          ? "bank_account"
          : null;
    const normalizedPayoutDetails =
      payoutType === "mobile_money"
        ? {
            ...payoutDetails,
            provider: normalizeGhanaMobileMoneyProvider(payoutDetails.provider),
            mobileNumber: normalizeGhanaMobileMoneyNumber(payoutDetails.mobileNumber),
          }
        : payoutDetails;
    const isVerified = Boolean(store?.isPayoutVerified);
    const hasVerifiedBankSetup = Boolean(
      payoutType === "bank_account" &&
      String(store?.paystackSubaccountId || "").trim() &&
      String(normalizedPayoutDetails.bankCode || "").trim() &&
      String(normalizedPayoutDetails.accountNumber || "").trim() &&
      String(normalizedPayoutDetails.accountName || normalizedPayoutDetails.fullName || "").trim() &&
      String(normalizedPayoutDetails.bankName || "").trim() &&
      isVerified,
    );
    const hasVerifiedMobileSetup = Boolean(
      payoutType === "mobile_money" &&
      String(store?.paystackSubaccountId || "").trim() &&
      String(normalizedPayoutDetails.provider || "").trim() &&
      String(normalizedPayoutDetails.mobileNumber || "").trim() &&
      isValidGhanaMobileMoneyNumber(normalizedPayoutDetails.mobileNumber, normalizedPayoutDetails.provider) &&
      isVerified,
    );

    return {
      payoutType,
      payoutDetails: normalizedPayoutDetails,
      hasVerifiedBankSetup,
      hasVerifiedMobileSetup,
      hasVerifiedSetup: hasVerifiedBankSetup || hasVerifiedMobileSetup,
    };
  }

  private hasVerifiedSellerPayoutEvidence(
    payout: Pick<SellerPayout, "status" | "bankDetails">,
    setupState: {
      hasVerifiedBankSetup: boolean;
      hasVerifiedMobileSetup: boolean;
      hasVerifiedSetup: boolean;
    },
  ) {
    const payoutBankDetails = ((payout.bankDetails as Record<string, any> | null) || {}) as Record<string, any>;
    const settlementMode = String(payoutBankDetails.settlementMode || "").toLowerCase().trim();
    const transferStatus = String(payoutBankDetails.transferStatus || "").toLowerCase().trim();
    const hasTransferEvidence = Boolean(
      String(payoutBankDetails.transferReference || "").trim() ||
      String(payoutBankDetails.transferCode || "").trim() ||
      ["success", "successful", "completed"].includes(transferStatus),
    );
    const hasVerifiedSplitEvidence = settlementMode === "split" && setupState.hasVerifiedBankSetup;

    return hasTransferEvidence || hasVerifiedSplitEvidence;
  }

  private normalizeSellerPayoutForDisplay(
    payout: SellerPayout,
    setupState: {
      hasVerifiedBankSetup: boolean;
      hasVerifiedMobileSetup: boolean;
      hasVerifiedSetup: boolean;
    },
  ): SellerPayout {
    if (String(payout.status || "").toLowerCase() !== "completed") {
      return payout;
    }

    if (this.hasVerifiedSellerPayoutEvidence(payout, setupState)) {
      return payout;
    }

    const payoutBankDetails = ((payout.bankDetails as Record<string, any> | null) || {}) as Record<string, any>;
    return {
      ...payout,
      status: setupState.hasVerifiedSetup ? "processing" : "pending",
      processedAt: null,
      bankDetails: {
        ...payoutBankDetails,
        settlementMode: "transfer",
        needsAudit: true,
        auditReason: "Payout marked completed without verified transfer or valid split evidence",
        setupRequired: setupState.hasVerifiedSetup ? undefined : true,
      },
    } as SellerPayout;
  }

  async ensureAutomaticSellerPayoutForCommission(commissionId: string): Promise<SellerPayout | undefined> {
    const [commission] = await db.select()
      .from(commissions)
      .where(eq(commissions.id, commissionId))
      .limit(1);

    if (!commission) return undefined;

    const [order] = await db.select()
      .from(orders)
      .where(eq(orders.id, commission.orderId))
      .limit(1);

    if (!order || !commission.sellerId) return undefined;

    const store = await this.getStoreByPrimarySeller(commission.sellerId);
    const setupState = this.getSellerPayoutSetupState(store);
    const payoutMethod = setupState.payoutType ?? "bank_account";
    const settlementMode: "transfer" | "split" =
      setupState.hasVerifiedBankSetup && payoutMethod === "bank_account" ? "split" : "transfer";
    const transferFee = payoutMethod === "mobile_money" ? "1.00" : "0.00";
    const payoutDetails = payoutMethod === "mobile_money"
      ? {
          mobileNumber: setupState.payoutDetails?.mobileNumber,
          provider: setupState.payoutDetails?.provider,
          transferFee,
          settlementMode,
          setupRequired: !setupState.hasVerifiedMobileSetup,
        }
      : {
          accountName: setupState.payoutDetails?.accountName || setupState.payoutDetails?.fullName || store?.name,
          accountNumber: setupState.payoutDetails?.accountNumber,
          bankCode: setupState.payoutDetails?.bankCode,
          bankName: setupState.payoutDetails?.bankName,
          transferFee,
          settlementMode,
          setupRequired: !setupState.hasVerifiedBankSetup,
        };

    const settlementReference = `auto_seller_settlement_${commission.id}`;
    const desiredStatus: SellerPayout["status"] =
      !setupState.hasVerifiedSetup ? "pending" : settlementMode === "split" ? "completed" : "processing";
    const desiredCommissionStatus =
      desiredStatus === "completed"
        ? "processed"
        : desiredStatus === "processing"
          ? "processing"
          : "pending";
    const settlementNotes =
      !setupState.hasVerifiedSetup
        ? `Automatic seller settlement for order #${order.orderNumber} is awaiting verified payout setup`
        : payoutMethod === "mobile_money"
        ? `Automatic seller settlement for order #${order.orderNumber} queued for Paystack mobile money transfer`
        : `Automatic seller settlement for order #${order.orderNumber} completed through Paystack split routing`;

    const [existingPayout] = await db.select()
      .from(sellerPayouts)
      .where(or(
        eq(sellerPayouts.reference, settlementReference),
        and(
          eq(sellerPayouts.sellerId, commission.sellerId),
          sql`${commission.id} = ANY(${sellerPayouts.commissionIds})`
        ),
      ))
      .limit(1);

    if (existingPayout) {
      let payout = existingPayout;
      if (
        payoutMethod === "bank_account" &&
        setupState.hasVerifiedBankSetup &&
        existingPayout.status !== "completed" &&
        existingPayout.status !== "failed"
      ) {
        payout = (await this.updatePayoutStatus(existingPayout.id, "completed", undefined)) || existingPayout;
      } else if (
        setupState.hasVerifiedSetup &&
        existingPayout.status === "pending"
      ) {
        payout = (await this.updatePayoutStatus(
          existingPayout.id,
          settlementMode === "split" ? "completed" : "processing",
          undefined,
        )) || existingPayout;
      }

      if (commission.status !== desiredCommissionStatus) {
        await db.update(commissions)
          .set({
            status: desiredCommissionStatus,
            processedAt: desiredCommissionStatus === "processed" ? new Date() : null,
          })
          .where(eq(commissions.id, commission.id));
      }

      return payout;
    }

    try {
      const [createdPayout] = await db.transaction(async (tx) => {
        const [insertedPayout] = await tx.insert(sellerPayouts).values({
          sellerId: commission.sellerId,
          amount: commission.sellerAmount,
          currency: order.currency || "GHS",
          method: payoutMethod,
          status: desiredStatus,
          reference: settlementReference,
          bankDetails: payoutDetails,
          commissionIds: [commission.id],
          notes: settlementNotes,
          processedAt: desiredStatus === "completed" ? new Date() : null,
        } as any).returning();

        await tx.update(commissions)
          .set({
            status: desiredCommissionStatus,
            processedAt: desiredCommissionStatus === "processed" ? new Date() : null,
          })
          .where(eq(commissions.id, commission.id));

        return [insertedPayout];
      });

      if (desiredStatus === "pending") {
        try {
          await this.createNotification({
            userId: commission.sellerId,
            type: "payout",
            title: "Complete Payout Setup To Receive Funds",
            message: `You have ${commission.sellerAmount} waiting from order #${order.orderNumber}. Complete your ${payoutMethod === "mobile_money" ? "mobile money" : "bank"} payout setup so we can transfer your settlement.`,
            metadata: {
              link: "/seller/payment-setup",
              payoutId: createdPayout.id,
              orderId: order.id,
              orderNumber: order.orderNumber,
              sellerId: commission.sellerId,
              setupRequired: true,
            },
          } as any);
        } catch (notifyError: any) {
          console.error("[PAYOUT] Failed to create seller payout-setup notification:", notifyError?.message || notifyError);
        }
      }

      return createdPayout;
    } catch (error: any) {
      if (error?.code === "23505") {
        const [retryPayout] = await db.select()
          .from(sellerPayouts)
          .where(or(
            eq(sellerPayouts.reference, settlementReference),
            and(
              eq(sellerPayouts.sellerId, commission.sellerId),
              sql`${commission.id} = ANY(${sellerPayouts.commissionIds})`
            ),
          ))
          .limit(1);

        if (retryPayout) {
          if (
            payoutMethod === "bank_account" &&
            retryPayout.status !== "completed" &&
            retryPayout.status !== "failed"
          ) {
            return await this.updatePayoutStatus(retryPayout.id, "completed", undefined);
          }
          if (payoutMethod === "mobile_money" && retryPayout.status === "pending") {
            return await this.updatePayoutStatus(retryPayout.id, "processing", undefined);
          }
          return retryPayout;
        }
      }

      throw error;
    }
  }

  async reconcileOrderFinanceRecords(orderId: string): Promise<number> {
    const [order] = await db.select().from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) return 0;
    const paymentStatus = String(order.paymentStatus || "").toLowerCase().trim();
    if (!["completed", "paid", "success"].includes(paymentStatus)) return 0;
    if (!order.sellerId) return 0;

    let repairedCount = 0;

    const existingCommissionRows = await db.select().from(commissions)
      .where(eq(commissions.orderId, orderId))
      .limit(1);

    let commission = existingCommissionRows[0];

    if (!commission) {
      try {
        const created = await this.createCommissionWithEarning(orderId);
        commission = created.commission;
        repairedCount += 1;
      } catch (error: any) {
        if (error?.code === "COMMISSION_ALREADY_EXISTS") {
          const retryRows = await db.select().from(commissions)
            .where(eq(commissions.orderId, orderId))
            .limit(1);
          commission = retryRows[0];
        } else {
          throw error;
        }
      }
    }

    if (!commission) return repairedCount;

    const commissionEarningRows = await db.select().from(platformEarnings)
      .where(or(
        eq(platformEarnings.commissionId, commission.id),
        and(eq(platformEarnings.orderId, order.id), eq(platformEarnings.type, "commission")),
      ))
      .limit(1);

    if (commissionEarningRows.length === 0) {
      await this.createPlatformEarning({
        orderId: order.id,
        commissionId: commission.id,
        amount: commission.commissionAmount,
        type: "commission",
        description: `Commission from order #${order.orderNumber}`,
      } as any);
      repairedCount += 1;
    }

    const processingFee = parseFloat(order.processingFee || "0") || 0;
    if (processingFee > 0) {
      const serviceFeeRows = await db.select().from(platformEarnings)
        .where(and(
          eq(platformEarnings.orderId, order.id),
          eq(platformEarnings.type, "service_fee"),
        ))
        .limit(1);

      if (serviceFeeRows.length === 0) {
        await this.createPlatformEarning({
          orderId: order.id,
          amount: processingFee.toFixed(2),
          type: "service_fee",
          description: `Processing fee from order #${order.orderNumber}`,
        } as any);
        repairedCount += 1;
      }
    }

    const payout = await this.ensureAutomaticSellerPayoutForCommission(commission.id);
    if (payout) {
      repairedCount += 1;
    }

    return repairedCount;
  }

  async backfillMissingCommissionEarnings(limit = 50): Promise<number> {
    const reconcileRecentPaidOrders = async () => {
      const paidStatusFilter = sql`lower(cast(${orders.paymentStatus} as text)) in ('completed', 'paid', 'success')`;
      const recentPaidOrders = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(
          paidStatusFilter,
          isNotNull(orders.sellerId),
        ))
        .orderBy(desc(orders.updatedAt), desc(orders.createdAt))
        .limit(limit);

      let repairedCount = 0;
      for (const row of recentPaidOrders) {
        try {
          repairedCount += await this.reconcileOrderFinanceRecords(row.id);
        } catch (error: any) {
          console.error(`[FINANCE] Failed to reconcile recent finance records for order ${row.id}:`, error?.message || error);
        }
      }
      return repairedCount;
    };

    if (financeBackfillComplete) {
      return reconcileRecentPaidOrders();
    }
    if (financeBackfillInFlight) return financeBackfillInFlight;

    financeBackfillInFlight = (async () => {
      try {
        const paidStatusFilter = sql`lower(cast(${orders.paymentStatus} as text)) in ('completed', 'paid', 'success')`;
        let offset = 0;
        let repairedCount = 0;

        while (true) {
          const paidOrders = await db
            .select({ id: orders.id })
            .from(orders)
            .where(and(
              paidStatusFilter,
              isNotNull(orders.sellerId),
            ))
            .orderBy(desc(orders.updatedAt), desc(orders.createdAt))
            .limit(limit)
            .offset(offset);

          if (paidOrders.length === 0) break;

          for (const row of paidOrders) {
            try {
              repairedCount += await this.reconcileOrderFinanceRecords(row.id);
            } catch (error: any) {
              console.error(`[FINANCE] Failed to reconcile finance records for order ${row.id}:`, error?.message || error);
            }
          }

          offset += paidOrders.length;
          if (paidOrders.length < limit) break;
        }

        financeBackfillComplete = true;
        return repairedCount;
      } catch (error: any) {
        console.error("[FINANCE] Historical commission sync failed:", error?.message || error);
        return 0;
      } finally {
        financeBackfillInFlight = null;
      }
    })();

    return financeBackfillInFlight;
  }

  // Get seller's available balance (sum of pending commissions not in payouts)
  async getSellerAvailableBalance(sellerId: string): Promise<number> {
    await this.backfillMissingCommissionEarnings(50);
    // Get all pending commissions for seller
    const pendingCommissions = await db.select()
      .from(commissions)
      .where(
        and(
          eq(commissions.sellerId, sellerId),
          eq(commissions.status, 'pending')
        )
      );

    // Calculate total available (sum of sellerAmount)
    const totalCents = pendingCommissions.reduce((sum, commission) => {
      return sum + Math.round(parseFloat(commission.sellerAmount) * 100);
    }, 0);

    return totalCents / 100; // Convert back to decimal
  }

  // Get seller commissions
  async getSellerCommissions(sellerId: string, status?: string): Promise<Commission[]> {
    await this.backfillMissingCommissionEarnings(50);
    if (status) {
      return await db.select()
        .from(commissions)
        .where(
          and(
            eq(commissions.sellerId, sellerId),
            eq(commissions.status, status)
          )
        )
        .orderBy(desc(commissions.createdAt));
    }
    
    return await db.select()
      .from(commissions)
      .where(eq(commissions.sellerId, sellerId))
      .orderBy(desc(commissions.createdAt));
  }

  // CRITICAL: Create seller payout with comprehensive validation
  async createSellerPayout(data: InsertSellerPayout): Promise<SellerPayout> {
    return await db.transaction(async (tx) => {
      // Step 1: Validate seller exists
      const [seller] = await tx.select()
        .from(users)
        .where(eq(users.id, data.sellerId))
        .limit(1);

      if (!seller || seller.role !== 'seller') {
        const error = new Error(`Seller ${data.sellerId} not found`);
        (error as any).code = 'SELLER_NOT_FOUND';
        throw error;
      }

      // Step 2: Get platform settings
      const settings = await this.getPlatformSettings();
      const requestedAmount = parseFloat(data.amount);
      // No minimum payout amount is enforced platform-wide

      if (requestedAmount <= 0) {
        const error = new Error(`Invalid payout amount: ${requestedAmount.toFixed(2)}`);
        (error as any).code = 'INVALID_AMOUNT';
        throw error;
      }

      // Step 4: Calculate available balance from pending commissions
      const pendingCommissions = await tx.select()
        .from(commissions)
        .where(
          and(
            eq(commissions.sellerId, data.sellerId),
            eq(commissions.status, 'pending')
          )
        );

      const availableBalanceCents = pendingCommissions.reduce((sum, commission) => {
        return sum + Math.round(parseFloat(commission.sellerAmount) * 100);
      }, 0);
      const availableBalance = availableBalanceCents / 100;

      // Step 5: Validate sufficient balance
      if (requestedAmount > availableBalance) {
        const error = new Error(`Insufficient balance. Requested: ${requestedAmount.toFixed(2)}, Available: ${availableBalance.toFixed(2)}`);
        (error as any).code = 'INSUFFICIENT_BALANCE';
        throw error;
      }

      // Step 6: Find commissions that sum to exact requested amount
      // CRITICAL: Use subset sum algorithm to find exact match, allowing skips
      const requestedCents = Math.round(requestedAmount * 100);
      const sortedCommissions = pendingCommissions.sort((a, b) => 
        new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
      );
      
      // Convert commissions to cents for precise calculation
      const commissionData = sortedCommissions.map(c => ({
        id: c.id,
        amountCents: Math.round(parseFloat(c.sellerAmount) * 100),
        amountDisplay: parseFloat(c.sellerAmount).toFixed(2)
      }));

      // Find subset that sums to exactly requestedCents (greedy with backtracking)
      const commissionsToInclude: string[] = [];
      let accumulatedCents = 0;

      for (const commission of commissionData) {
        // Can we add this commission without exceeding?
        if (accumulatedCents + commission.amountCents <= requestedCents) {
          commissionsToInclude.push(commission.id);
          accumulatedCents += commission.amountCents;
          
          // Exact match found!
          if (accumulatedCents === requestedCents) {
            break;
          }
        }
        // Skip commissions that would cause overshoot, continue searching
      }

      // Verify exact match found
      if (accumulatedCents !== requestedCents) {
        // No exact composition exists - provide helpful error
        const availableAmounts = commissionData.map(c => c.amountDisplay).join(', ');
        const error = new Error(
          `Cannot compose exact payout amount ${requestedAmount.toFixed(2)} from available commissions. ` +
          `Available commissions (oldest first): ${availableAmounts}. ` +
          `Please request an amount that equals the sum of one or more commissions, or withdraw your full balance of ${availableBalance.toFixed(2)}.`
        );
        (error as any).code = 'AMOUNT_NOT_COMPOSABLE';
        throw error;
      }

      // Step 7: Validate payout method details
      if (data.method === 'bank_transfer' || data.method === 'bank_account') {
        if (!data.bankDetails?.accountNumber || !data.bankDetails?.bankName) {
          const error = new Error('Bank account details required for bank transfer');
          (error as any).code = 'MISSING_BANK_DETAILS';
          throw error;
        }
      } else if (data.method === 'mobile_money') {
        if (!data.bankDetails?.mobileNumber) {
          const error = new Error('Mobile number required for mobile money payout');
          (error as any).code = 'MISSING_MOBILE_NUMBER';
          throw error;
        }
      }

      // Step 8: Create payout record
      const [payout] = await tx.insert(sellerPayouts).values({
        ...data,
        commissionIds: commissionsToInclude,
        status: 'pending',
      } as any).returning();

      // Step 9: Mark included commissions as 'processing'
      if (commissionsToInclude.length > 0) {
        await tx.update(commissions)
          .set({ status: 'processing' })
          .where(
            and(
              eq(commissions.sellerId, data.sellerId),
              sql`${commissions.id} = ANY(${commissionsToInclude})`
            )
          );
      }

      return payout;
    });
  }

  // Get seller payouts
  async repairUnsafeSellerPayoutRecords(limit = 200): Promise<number> {
    const payoutRows = await db.select()
      .from(sellerPayouts)
      .where(or(
        eq(sellerPayouts.status, "completed"),
        eq(sellerPayouts.status, "processing"),
      ))
      .orderBy(desc(sellerPayouts.createdAt))
      .limit(limit);

    let repairedCount = 0;

    for (const payout of payoutRows) {
      const store = await this.getStoreByPrimarySeller(payout.sellerId).catch(() => null);
      const setupState = this.getSellerPayoutSetupState(store);
      const payoutBankDetails = ((payout.bankDetails as Record<string, any> | null) || {}) as Record<string, any>;
      const hasTransferEvidence = Boolean(
        String(payoutBankDetails.transferReference || "").trim() ||
        String(payoutBankDetails.transferCode || "").trim() ||
        String(payoutBankDetails.transferStatus || "").trim() ||
        String(payoutBankDetails.recipientCode || "").trim(),
      );

      if (payout.status === "processing" && !setupState.hasVerifiedSetup && !hasTransferEvidence) {
        await db.transaction(async (tx) => {
          await tx.update(sellerPayouts)
            .set({
              status: "pending",
              processedAt: null,
              bankDetails: {
                ...(setupState.payoutType === "mobile_money"
                  ? {
                      provider: setupState.payoutDetails?.provider,
                      mobileNumber: setupState.payoutDetails?.mobileNumber,
                    }
                  : {
                      bankCode: setupState.payoutDetails?.bankCode,
                      bankName: setupState.payoutDetails?.bankName,
                      accountNumber: setupState.payoutDetails?.accountNumber,
                      accountName: setupState.payoutDetails?.accountName || setupState.payoutDetails?.fullName,
                    }),
                ...payoutBankDetails,
                settlementMode: "transfer",
                needsAudit: true,
                setupRequired: true,
                auditReason: "Moved back to pending because payout setup is incomplete or invalid for transfer processing",
              },
            } as any)
            .where(eq(sellerPayouts.id, payout.id));

          if (Array.isArray(payout.commissionIds) && payout.commissionIds.length > 0) {
            for (const commissionId of payout.commissionIds.filter(Boolean)) {
              await tx.update(commissions)
                .set({
                  status: "pending",
                  processedAt: null,
                } as any)
                .where(eq(commissions.id, commissionId));
            }
          }
        });
        repairedCount += 1;
        continue;
      }

      if (this.hasVerifiedSellerPayoutEvidence(payout, setupState)) {
        continue;
      }

      const nextStatus: SellerPayout["status"] = setupState.hasVerifiedSetup ? "processing" : "pending";
      const nextCommissionStatus = nextStatus === "processing" ? "processing" : "pending";

      await db.transaction(async (tx) => {
        await tx.update(sellerPayouts)
          .set({
            status: nextStatus,
            processedAt: null,
            bankDetails: {
              ...(setupState.payoutType === "mobile_money"
                ? {
                    provider: setupState.payoutDetails?.provider,
                    mobileNumber: setupState.payoutDetails?.mobileNumber,
                  }
                : {
                    bankCode: setupState.payoutDetails?.bankCode,
                    bankName: setupState.payoutDetails?.bankName,
                    accountNumber: setupState.payoutDetails?.accountNumber,
                    accountName: setupState.payoutDetails?.accountName || setupState.payoutDetails?.fullName,
                  }),
              ...payoutBankDetails,
              settlementMode: "transfer",
              needsAudit: true,
              setupRequired: setupState.hasVerifiedSetup ? undefined : true,
              auditReason: "Reclassified because payout completion had no verified transfer or valid split evidence",
            },
          } as any)
          .where(eq(sellerPayouts.id, payout.id));

        if (Array.isArray(payout.commissionIds) && payout.commissionIds.length > 0) {
          for (const commissionId of payout.commissionIds.filter(Boolean)) {
            await tx.update(commissions)
              .set({
                status: nextCommissionStatus,
                processedAt: null,
              } as any)
              .where(eq(commissions.id, commissionId));
          }
        }
      });

      repairedCount += 1;
    }

    return repairedCount;
  }

  async getAdminSellerPayoutSummaries(): Promise<Array<{
    id: string;
    name: string;
    email: string;
    phone: string | null;
    isApproved: boolean;
    hasPayoutSetup: boolean;
    payoutType: string | null;
    totalPaid: string;
    pendingAmount: string;
    payoutCount: number;
    completedPayoutCount: number;
    lastPayoutAt: Date | null;
  }>> {
    await this.repairUnsafeSellerPayoutRecords(500);

    const sellerRows = await db.select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      isApproved: users.isApproved,
      payoutType: stores.payoutType,
      paystackSubaccountId: stores.paystackSubaccountId,
      payoutDetails: stores.payoutDetails,
      isPayoutVerified: stores.isPayoutVerified,
    })
      .from(users)
      .leftJoin(stores, eq(stores.primarySellerId, users.id))
      .where(eq(users.role, "seller"))
      .orderBy(asc(users.name));

    const payoutRows = await db.select().from(sellerPayouts);
    const commissionRows = await db.select({
      id: commissions.id,
      sellerId: commissions.sellerId,
      sellerAmount: commissions.sellerAmount,
      status: commissions.status,
    }).from(commissions);

    return sellerRows.map((seller) => {
      const setupState = this.getSellerPayoutSetupState(seller);
      const sellerPayoutRows = payoutRows
        .filter((payout) => payout.sellerId === seller.id)
        .map((payout) => this.normalizeSellerPayoutForDisplay(payout, setupState));
      const coveredCommissionIds = new Set(
        sellerPayoutRows.flatMap((payout) => Array.isArray(payout.commissionIds) ? payout.commissionIds.filter(Boolean) : []),
      );
      const uncoveredCommissionRows = commissionRows.filter((commission) =>
        commission.sellerId === seller.id &&
        !coveredCommissionIds.has(commission.id) &&
        ["pending", "processing", "processed"].includes(String(commission.status || "").toLowerCase().trim()),
      );
      const verifiedCompletedPayouts = sellerPayoutRows.filter((payout) => String(payout.status || "").toLowerCase().trim() === "completed");
      const openPayoutAmount = sellerPayoutRows
        .filter((payout) => ["pending", "processing"].includes(String(payout.status || "").toLowerCase().trim()))
        .reduce((sum, payout) => sum + (parseFloat(String(payout.amount || "0")) || 0), 0);
      const uncoveredCommissionAmount = uncoveredCommissionRows
        .reduce((sum, commission) => sum + (parseFloat(String(commission.sellerAmount || "0")) || 0), 0);
      const lastPayoutAt = verifiedCompletedPayouts
        .map((payout) => payout.processedAt ? new Date(payout.processedAt) : null)
        .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
        .sort((a, b) => b.getTime() - a.getTime())[0] || null;

      return {
        id: seller.id,
        name: seller.name,
        email: seller.email,
        phone: seller.phone,
        isApproved: Boolean(seller.isApproved),
        hasPayoutSetup: setupState.hasVerifiedSetup,
        payoutType: setupState.payoutType,
        totalPaid: verifiedCompletedPayouts.reduce((sum, payout) => sum + (parseFloat(String(payout.amount || "0")) || 0), 0).toFixed(2),
        pendingAmount: (openPayoutAmount + uncoveredCommissionAmount).toFixed(2),
        payoutCount: sellerPayoutRows.length,
        completedPayoutCount: verifiedCompletedPayouts.length,
        lastPayoutAt,
      };
    });
  }

  async getSellerPayouts(sellerId: string): Promise<SellerPayout[]> {
    await this.backfillMissingCommissionEarnings(50);
    await this.repairUnsafeSellerPayoutRecords(500);
    const payoutRows = await db.select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.sellerId, sellerId))
      .orderBy(desc(sellerPayouts.createdAt));

    const coveredCommissionIds = new Set(
      payoutRows.flatMap((payout) => Array.isArray(payout.commissionIds) ? payout.commissionIds.filter(Boolean) : []),
    );

    const store = await this.getStoreByPrimarySeller(sellerId).catch(() => null);
    const setupState = this.getSellerPayoutSetupState(store);
    const payoutMethod = setupState.payoutType ?? "bank_account";
    const settlementMode = payoutMethod === "mobile_money" ? "transfer" : setupState.hasVerifiedBankSetup ? "split" : "transfer";
    const transferFee = payoutMethod === "mobile_money" ? "1.00" : "0.00";
    const payoutDetails =
      payoutMethod === "mobile_money"
        ? {
            mobileNumber: setupState.payoutDetails?.mobileNumber,
            provider: setupState.payoutDetails?.provider,
            transferFee,
            settlementMode,
            setupRequired: !setupState.hasVerifiedMobileSetup,
          }
        : {
            accountName: setupState.payoutDetails?.accountName || setupState.payoutDetails?.fullName || store?.name,
            accountNumber: setupState.payoutDetails?.accountNumber,
            bankCode: setupState.payoutDetails?.bankCode,
            bankName: setupState.payoutDetails?.bankName,
            transferFee,
            settlementMode,
            setupRequired: !setupState.hasVerifiedBankSetup,
          };

    const commissionRows = await db
      .select({
        id: commissions.id,
        orderId: commissions.orderId,
        sellerAmount: commissions.sellerAmount,
        status: commissions.status,
        createdAt: commissions.createdAt,
        processedAt: commissions.processedAt,
        orderNumber: orders.orderNumber,
      })
      .from(commissions)
      .leftJoin(orders, eq(orders.id, commissions.orderId))
      .where(eq(commissions.sellerId, sellerId))
      .orderBy(desc(commissions.createdAt));

    const syntheticPayouts = commissionRows
      .filter((commission) => !coveredCommissionIds.has(commission.id))
      .map((commission) => {
        const normalizedStatus = String(commission.status || "").toLowerCase().trim();
        const payoutStatus: SellerPayout["status"] =
          normalizedStatus === "processing"
            ? "processing"
            : normalizedStatus === "failed"
                ? "failed"
                : "pending";

        const orderLabel = commission.orderNumber || String(commission.orderId || "").slice(0, 8) || "N/A";
        const notes =
          payoutStatus === "processing"
              ? `Automatic seller settlement for order #${orderLabel} is currently processing`
              : normalizedStatus === "processed"
                ? `Commission for order #${orderLabel} is processed, but payout evidence is still being verified`
              : `Seller settlement for order #${orderLabel} is pending payout completion`;

        return {
          id: `commission-${commission.id}`,
          sellerId,
          amount: commission.sellerAmount,
          currency: "GHS",
          method: payoutMethod,
          status: payoutStatus,
          reference: `auto_seller_settlement_${commission.id}`,
          bankDetails: payoutDetails,
          commissionIds: [commission.id],
          notes,
          processedBy: null,
          processedAt: null,
          createdAt: commission.createdAt,
        } as SellerPayout;
      });

    return [...payoutRows, ...syntheticPayouts]
      .map((payout) => this.normalizeSellerPayoutForDisplay(payout, setupState))
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime();
        const bTime = new Date(b.createdAt || 0).getTime();
        return bTime - aTime;
      });
  }

  async activateEligibleSellerPayoutsForSeller(sellerId: string): Promise<{ releasedCount: number; releasedAmount: number }> {
    const store = await this.getStoreByPrimarySeller(sellerId).catch(() => null);
    const setupState = this.getSellerPayoutSetupState(store);
    if (!setupState.hasVerifiedSetup) {
      return { releasedCount: 0, releasedAmount: 0 };
    }

    const payoutMethod = setupState.payoutType ?? "bank_account";
    const settlementMode = payoutMethod === "mobile_money" ? "transfer" : setupState.hasVerifiedBankSetup ? "split" : "transfer";
    const payoutDetails =
      payoutMethod === "mobile_money"
        ? {
            mobileNumber: setupState.payoutDetails?.mobileNumber,
            provider: setupState.payoutDetails?.provider,
            transferFee: "1.00",
            settlementMode,
            setupRequired: false,
            needsAudit: false,
            auditReason: null,
          }
        : {
            accountName: setupState.payoutDetails?.accountName || setupState.payoutDetails?.fullName || store?.name,
            accountNumber: setupState.payoutDetails?.accountNumber,
            bankCode: setupState.payoutDetails?.bankCode,
            bankName: setupState.payoutDetails?.bankName,
            transferFee: "0.00",
            settlementMode,
            setupRequired: false,
            needsAudit: false,
            auditReason: null,
          };

    const blockedPayouts = await db.select()
      .from(sellerPayouts)
      .where(and(
        eq(sellerPayouts.sellerId, sellerId),
        or(
          eq(sellerPayouts.status, "pending"),
          eq(sellerPayouts.status, "processing"),
        ),
      ))
      .orderBy(desc(sellerPayouts.createdAt));

    let releasedCount = 0;
    let releasedAmount = 0;

    for (const payout of blockedPayouts) {
      const currentBankDetails = ((payout.bankDetails as Record<string, any> | null) || {}) as Record<string, any>;
      const requiresSetup = Boolean(currentBankDetails.setupRequired);
      const hasTransferEvidence = Boolean(
        String(currentBankDetails.transferReference || "").trim() ||
        String(currentBankDetails.transferCode || "").trim() ||
        String(currentBankDetails.transferStatus || "").trim() ||
        String(currentBankDetails.recipientCode || "").trim(),
      );

      if (!requiresSetup && payout.status !== "pending") {
        continue;
      }

      await this.updateSellerPayoutDetails(
        payout.id,
        {
          ...payoutDetails,
          ...currentBankDetails,
          ...payoutDetails,
        },
        settlementMode === "split"
          ? "Seller payout setup verified. Held settlement released through split payout."
          : "Seller payout setup verified. Held settlement released to transfer processing.",
      );

      const nextStatus: SellerPayout["status"] =
        settlementMode === "split" ? "completed" : hasTransferEvidence ? "processing" : "processing";
      await this.updatePayoutStatus(payout.id, nextStatus, "system");
      releasedCount += 1;
      releasedAmount += parseFloat(String(payout.amount || "0")) || 0;
    }

    return { releasedCount, releasedAmount: Number(releasedAmount.toFixed(2)) };
  }

  // Get all pending payouts (for admin)
  async getAllPendingPayouts(): Promise<SellerPayout[]> {
    await this.backfillMissingCommissionEarnings(50);
    return await db.select()
      .from(sellerPayouts)
      .where(or(
        eq(sellerPayouts.status, 'pending'),
        eq(sellerPayouts.status, 'processing'),
      ))
      .orderBy(desc(sellerPayouts.createdAt));
  }

  // Get payouts by status (e.g., 'processing')
  async getPayoutsByStatus(status: string): Promise<SellerPayout[]> {
    return await db.select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.status, status))
      .orderBy(desc(sellerPayouts.createdAt));
  }

  async updateSellerPayoutDetails(
    payoutId: string,
    bankDetailsPatch: Record<string, any>,
    notes?: string,
  ): Promise<SellerPayout | undefined> {
    const [payout] = await db.select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.id, payoutId))
      .limit(1);

    if (!payout) {
      return undefined;
    }

    const mergedBankDetails = {
      ...((payout.bankDetails as Record<string, any> | null) || {}),
      ...(bankDetailsPatch || {}),
    };

    const [updated] = await db.update(sellerPayouts)
      .set({
        bankDetails: mergedBankDetails,
        notes: notes ?? payout.notes,
      } as any)
      .where(eq(sellerPayouts.id, payoutId))
      .returning();

    return updated;
  }

  // Mark an array of commission IDs as processed
  async markCommissionsProcessed(commissionIds: string[]): Promise<void> {
    if (!commissionIds || commissionIds.length === 0) return;

    // Some DB drivers can fail when passing JS arrays directly to ANY(...).
    // Update commissions one-by-one inside a transaction to ensure compatibility and atomicity.
    await db.transaction(async (tx) => {
      for (const id of commissionIds) {
        await tx.update(commissions).set({ status: 'processed' }).where(eq(commissions.id, id));
      }
    });
  }

  // Update payout status (for admin processing)
  async updatePayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<SellerPayout | undefined> {
    return await db.transaction(async (tx) => {
      // Get payout
      const [payout] = await tx.select()
        .from(sellerPayouts)
        .where(eq(sellerPayouts.id, payoutId))
        .limit(1);

      if (!payout) {
        return undefined;
      }

      const payoutBankDetails = ((payout.bankDetails as Record<string, any> | null) || {}) as Record<string, any>;
      const settlementMode = String(payoutBankDetails.settlementMode || "").toLowerCase().trim();
      const transferStatus = String(payoutBankDetails.transferStatus || "").toLowerCase().trim();
      const hasManualTransferEvidence = Boolean(
        String(payoutBankDetails.transferReference || "").trim() ||
        String(payoutBankDetails.transferCode || "").trim(),
      );
      const hasSuccessfulProcessorStatus = ["success", "successful", "completed"].includes(transferStatus);
      const store = await this.getStoreByPrimarySeller(payout.sellerId).catch(() => null);
      const setupState = this.getSellerPayoutSetupState(store);
      const hasVerifiedSplitEvidence = settlementMode === "split" && setupState.hasVerifiedBankSetup;

      if (
        status === "completed" &&
        !hasVerifiedSplitEvidence &&
        !hasManualTransferEvidence &&
        !hasSuccessfulProcessorStatus
      ) {
        const verificationError = new Error("Payout completion requires a verified transfer reference, transfer code, or successful processor status.");
        (verificationError as any).code = "PAYOUT_VERIFICATION_REQUIRED";
        throw verificationError;
      }

      // Update payout status
      const [updated] = await tx.update(sellerPayouts)
        .set({
          status,
          processedBy: processedBy || payout.processedBy,
          processedAt: status === 'completed' || status === 'failed' ? new Date() : payout.processedAt,
        } as any)
        .where(eq(sellerPayouts.id, payoutId))
        .returning();

      // Update commission status based on payout outcome
      if (payout.commissionIds && payout.commissionIds.length > 0) {
        const commissionStatus = status === 'completed' ? 'processed' : 
                               status === 'failed' ? 'pending' : 
                               'processing';

        await tx.update(commissions)
          .set({ status: commissionStatus })
          .where(sql`${commissions.id} = ANY(${payout.commissionIds})`);
      }

      return updated;
    });
  }

  // ===== Rider Payout Operations =====
  
  // Create rider payout (for approved payouts after delivery completion)
  async createRiderPayout(data: InsertRiderPayout): Promise<RiderPayout> {
    const [payout] = await db.insert(riderPayouts)
      .values(data as any)
      .returning();
    return payout;
  }

  // Get rider payouts
  async getRiderPayouts(riderId: string): Promise<RiderPayout[]> {
    return await db.select()
      .from(riderPayouts)
      .where(eq(riderPayouts.riderId, riderId))
      .orderBy(desc(riderPayouts.createdAt));
  }

  // Get all pending rider payouts (for admin approval)
  async getAllPendingRiderPayouts(): Promise<RiderPayout[]> {
    return await db.select()
      .from(riderPayouts)
      .where(eq(riderPayouts.status, 'pending_approval'))
      .orderBy(desc(riderPayouts.createdAt));
  }

  // Update rider payout status (admin processing)
  async updateRiderPayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<RiderPayout | undefined> {
    const [updated] = await db.update(riderPayouts)
      .set({
        status,
        processedBy: processedBy || undefined,
        processedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      } as any)
      .where(eq(riderPayouts.id, payoutId))
      .returning();
    return updated;
  }

  // Get rider's available balance (sum of pending payouts)
  async getRiderAvailableBalance(riderId: string): Promise<number> {
    const result = await db.select({
      total: sql`COALESCE(SUM(${riderPayouts.amount}::numeric), 0)::numeric`
    })
      .from(riderPayouts)
      .where(and(
        eq(riderPayouts.riderId, riderId),
        eq(riderPayouts.status, 'pending_approval')
      ));
    
    return parseFloat(result[0]?.total as string || '0');
  }

  // Queue a payout for a completed delivery (called when delivery is marked complete)
  async queueRiderPayout(riderId: string, amount: number, orderId: string): Promise<RiderPayout> {
    const [payout] = await db.insert(riderPayouts)
      .values({
        riderId,
        orderId,
        amount: amount.toFixed(2),
        method: 'mobile_money',
        status: 'pending_approval',
        notes: `Delivery fee for order ${orderId}`
      })
      .returning();
    return payout;
  }

  // Platform settings
  async getPlatformSettings(): Promise<PlatformSettings> {
    // FREE TIER OPTIMIZATION: Cache platform settings (rarely changes)
    const cacheKey = "getPlatformSettings";
    const cached = this.getCachedResult(cacheKey, this.CACHE_TTL.getPlatformSettings);
    if (cached) return cached;

    try {
      await ensurePlatformSettingsSchemaCompat();
      // Return the most recently updated settings row (if multiple exist) to avoid ambiguity
      const result = await withStorageTimeout(
        db.select().from(platformSettings).orderBy(desc(platformSettings.updatedAt)).limit(1),
        10000,
        "Platform settings lookup",
      );
      const compatOverrides = await readPlatformSettingsCompat();
      if (result.length === 0) {
        // Ensure reasonable defaults on first creation: Single-store by default and GHS currency
        const [settings] = await withStorageTimeout(
          db.insert(platformSettings).values({
            isMultiVendor: false,
            defaultCurrency: 'GHS',
            adsEnabled: false,
            heroBannerEnabled: false,
            sidebarAdEnabled: false,
            footerAdEnabled: false,
            productPageAdEnabled: false,
            isExternalRiderSystemEnabled: false,
            showCheckoutDeliveryMap: true,
            allowRiderRegistration: false,
            allowSellerDirectSupportMessages: true,
            allowSellerBankPayouts: true,
            allowSharedVariantColorStock: false,
            showHomepageFeaturedSection: true,
            showHomepageNewArrivalSection: true,
          }).returning(),
          10000,
          "Platform settings bootstrap",
        );
        // compat provides fallbacks for columns not yet in DB; DB result wins if column exists
        const mergedSettings = { ...compatOverrides, ...settings };
        this.setCachedResult(cacheKey, mergedSettings);
        return mergedSettings;
      }
      // Sanitize social URLs: convert '__CLEAR__' to null
      const socialKeys = [
        'facebookUrl','instagramUrl','twitterUrl','linkedinUrl','youtubeUrl','tiktokUrl','pinterestUrl','whatsappPage'
      ];
      const settings: any = { ...result[0] };
      for (const key of socialKeys) {
        if (settings[key] === '__CLEAR__') settings[key] = null;
      }
      // compat provides fallbacks for columns not yet in DB; DB result wins if the column exists
      const mergedSettings = { ...compatOverrides, ...settings };
      this.setCachedResult(cacheKey, mergedSettings);
      return mergedSettings;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('ERROR getPlatformSettings query failed:', msg);
      // If the settings table or expected columns are not present (e.g., migrations not applied),
      // return reasonable defaults so the frontend can continue to render without crashing.
      if (
        msg.includes('does not exist') ||
        msg.includes('column') ||
        msg.includes('relation') ||
        msg.includes('Connection terminated') ||
        msg.toLowerCase().includes('timeout')
      ) {
        console.warn('[STORAGE] platform_settings table or columns missing; returning defaults');
        // Provide a full shape that satisfies the PlatformSettings type; set optional fields to null/defaults
        const defaults: PlatformSettings = {
          id: 'default',
          isMultiVendor: false,
          platformName: 'KiyuMart',
          logo: null,
          primaryColor: '#1e7b5f',
          secondaryColor: '#2c3e50',
          accentColor: '#e74c3c',
          lightBgColor: '#ffffff',
          lightTextColor: '#000000',
          darkBgColor: '#1a1a1a',
          darkTextColor: '#ffffff',
          lightCardColor: '#f8f9fa',
          darkCardColor: '#2a2a2a',
          onboardingImages: [],
          defaultCurrency: 'GHS',
          mapboxPublicToken: null,
          mapboxStyleUrl: 'mapbox://styles/mapbox/navigation-night-v1',
          mapboxGlVersion: 'v3.4.0',
          smtpHost: null,
          smtpPort: null,
          smtpUser: null,
          smtpPass: null,
          smtpSecure: false,
          smtpFromEmail: null,
          smtpFromName: null,
          paystackPublicKey: null,
          paystackSecretKey: null,
          processingFeePercent: '1.95',
          cloudinaryCloudName: null,
          cloudinaryApiKey: null,
          cloudinaryApiSecret: null,
          contactPhone: null,
          contactEmail: null,
          contactAddress: null,
          facebookUrl: null,
          instagramUrl: null,
          twitterUrl: null,
          linkedinUrl: null,
          youtubeUrl: null,
          tiktokUrl: null,
          pinterestUrl: null,
          whatsappPage: null,
          showSocialLinks: true,
          showFacebook: true,
          showInstagram: true,
          showTwitter: true,
          showLinkedin: true,
          showYoutube: true,
          showTiktok: true,
          showPinterest: true,
          showWhatsapp: true,
          showShopBySection: true,
          showHomepageFeaturedSection: true,
          showHomepageNewArrivalSection: true,
          footerDescription: null,
          footerLinks: [],
          footerPaymentIcons: [],
          activeBannerCollectionId: null,
          categoryDisplayStyle: null,
          bannerAutoplayEnabled: false,
          bannerAutoplayDuration: 5,
          adsEnabled: false,
          heroBannerEnabled: false,
          sidebarAdEnabled: false,
          footerAdEnabled: false,
          productPageAdEnabled: false,
          heroBannerAdImage: null,
          heroBannerAdUrl: null,
          sidebarAdImage: null,
          sidebarAdUrl: null,
          shopDisplayMode: 'by-store',
          footerAdImage: null,
          footerAdUrl: null,
          productPageAdImage: null,
          productPageAdUrl: null,
          showAdminOperationsPanels: true,
          isExternalRiderSystemEnabled: false,
          showCheckoutDeliveryMap: true,
          allowPickupAgentAdminChat: true,
          allowSellerDirectSupportMessages: true,
          allowSellerRegistration: true,
          allowRiderRegistration: false,
          allowSellerBankPayouts: true,
          allowSharedVariantColorStock: false,
          primaryStoreId: null,
          defaultCommissionRate: '1',
          frontendUrl: null,
          isMaintenanceMode: false,
          maintenanceMessage: null,
          maintenanceStartedAt: null,
          maintenanceScheduledEnd: null,
          maintenanceStartedBy: null,
          googleAnalyticsId: null,
          microsoftClarityId: null,
          sentryDsn: null,
          ga4PropertyId: null,
          googleCredentialsJson: null,
          sentryAuthToken: null,
          sentryOrg: null,
          sentryProject: null,
          renderDeployHookUrl: null,
          cloudinaryAccounts: null,
          inviteOnlyRegistration: false,
          orderAutoCancelHours: 0,
          freeTierProductLimit: 20,
          maxProductsPerSeller: 0,
          maxUploadSizeMb: 10,
          allowedUploadTypes: 'jpg,jpeg,png,webp,gif,avif',
          upgradePlanAPrice: '15',
          upgradePlanASlots: 10,
          upgradePlanBPrice: '40',
          upgradePlanCPrice: '100',
          deliveryFeeCommission: '0',
          referralEnabled: false,
          referralEnabledSingleStore: true,
          referralEnabledMultiVendor: true,
          referralCustomerThreshold: 5,
          referralSellerThreshold: 10,
          referralRewardPercent: '10',
          referralSellerPromoHours: 24,
          suggestionsEnabled: false,
          updatedAt: new Date(),
        };
        return { ...defaults, ...(await readPlatformSettingsCompat()) };
      }
      throw err;
    }
  }

  async updatePlatformSettings(data: Partial<PlatformSettings>): Promise<PlatformSettings> {
    // Invalidate cache when settings change
    this.invalidateCache("getPlatformSettings");
    await ensurePlatformSettingsSchemaCompat();

    const existing = await this.getPlatformSettings();
    const payload = { ...data, updatedAt: new Date() } as Record<string, any>;

    const runUpdate = async (updatePayload: Record<string, any>) =>
      db.update(platformSettings)
        .set(updatePayload)
        .where(eq(platformSettings.id, existing.id))
        .returning();

    if (data.allowSellerBankPayouts !== undefined) {
      await writePlatformSettingsCompat({ allowSellerBankPayouts: data.allowSellerBankPayouts });
    }
    if (data.isExternalRiderSystemEnabled !== undefined) {
      await writePlatformSettingsCompat({ isExternalRiderSystemEnabled: data.isExternalRiderSystemEnabled });
    }
    if (data.showCheckoutDeliveryMap !== undefined) {
      await writePlatformSettingsCompat({ showCheckoutDeliveryMap: data.showCheckoutDeliveryMap });
    }
    if (data.allowPickupAgentAdminChat !== undefined) {
      await writePlatformSettingsCompat({ allowPickupAgentAdminChat: data.allowPickupAgentAdminChat });
    }
    if (data.allowSellerDirectSupportMessages !== undefined) {
      await writePlatformSettingsCompat({ allowSellerDirectSupportMessages: data.allowSellerDirectSupportMessages });
    }
    if (data.allowSharedVariantColorStock !== undefined) {
      await writePlatformSettingsCompat({ allowSharedVariantColorStock: data.allowSharedVariantColorStock });
    }
    if (data.referralEnabled !== undefined) {
      await writePlatformSettingsCompat({ referralEnabled: data.referralEnabled });
    }
    if (data.referralEnabledSingleStore !== undefined) {
      await writePlatformSettingsCompat({ referralEnabledSingleStore: data.referralEnabledSingleStore });
    }
    if (data.referralEnabledMultiVendor !== undefined) {
      await writePlatformSettingsCompat({ referralEnabledMultiVendor: data.referralEnabledMultiVendor });
    }
    if (data.referralRewardPercent !== undefined) {
      await writePlatformSettingsCompat({ referralRewardPercent: data.referralRewardPercent });
    }
    if (data.referralCustomerThreshold !== undefined) {
      await writePlatformSettingsCompat({ referralCustomerThreshold: data.referralCustomerThreshold });
    }
    if (data.referralSellerThreshold !== undefined) {
      await writePlatformSettingsCompat({ referralSellerThreshold: data.referralSellerThreshold });
    }
    if (data.referralSellerPromoHours !== undefined) {
      await writePlatformSettingsCompat({ referralSellerPromoHours: data.referralSellerPromoHours });
    }
    if (data.deliveryFeeCommission !== undefined) {
      await writePlatformSettingsCompat({ deliveryFeeCommission: data.deliveryFeeCommission });
    }

    let result;
    try {
      result = await runUpdate(payload);
    } catch (err: any) {
      const message = String(err?.message || "");
      const missingBankPayoutColumn =
        message.includes("allow_seller_bank_payouts") &&
        message.toLowerCase().includes("does not exist");
      const missingExternalRiderColumn =
        message.includes("is_external_rider_system_enabled") &&
        message.toLowerCase().includes("does not exist");
      const missingCheckoutMapColumn =
        message.includes("show_checkout_delivery_map") &&
        message.toLowerCase().includes("does not exist");
      const missingPickupAgentChatColumn =
        message.includes("allow_pickup_agent_admin_chat") &&
        message.toLowerCase().includes("does not exist");
      const missingSellerDirectSupportMessagesColumn =
        message.includes("allow_seller_direct_support_messages") &&
        message.toLowerCase().includes("does not exist");
      const missingSharedVariantStockColumn =
        message.includes("allow_shared_variant_color_stock") &&
        message.toLowerCase().includes("does not exist");
      const missingMaintenanceColumns =
        (message.includes("is_maintenance_mode") || message.includes("maintenance_")) &&
        message.toLowerCase().includes("does not exist");
      const missingAdvancedFeaturesColumn =
        message.toLowerCase().includes("does not exist") && (
          message.includes("invite_only_registration") ||
          message.includes("order_auto_cancel_hours") ||
          message.includes("free_tier_product_limit") ||
          message.includes("max_products_per_seller") ||
          message.includes("upgrade_plan_a_price") ||
          message.includes("upgrade_plan_a_slots") ||
          message.includes("upgrade_plan_b_price") ||
          message.includes("upgrade_plan_c_price") ||
          message.includes("delivery_fee_commission") ||
          message.includes("referral_enabled") ||
          message.includes("referral_reward_percent") ||
          message.includes("referral_customer_threshold") ||
          message.includes("referral_seller_threshold") ||
          message.includes("referral_seller_promo_hours") ||
          message.includes("max_upload_size_mb") ||
          message.includes("allowed_upload_types") ||
          message.includes("render_deploy_hook_url") ||
          message.includes("ga4_property_id") ||
          message.includes("google_credentials_json") ||
          message.includes("sentry_auth_token") ||
          message.includes("sentry_org") ||
          message.includes("sentry_project")
        );

      if (
        !missingBankPayoutColumn &&
        !missingExternalRiderColumn &&
        !missingCheckoutMapColumn &&
        !missingPickupAgentChatColumn &&
        !missingSellerDirectSupportMessagesColumn &&
        !missingSharedVariantStockColumn &&
        !missingMaintenanceColumns &&
        !missingAdvancedFeaturesColumn
      ) {
        throw err;
      }

      console.warn(
        "[STORAGE] platform_settings is missing a newer feature column; retrying update without unsupported fields",
      );

      delete payload.allowSellerBankPayouts;
      delete payload.isExternalRiderSystemEnabled;
      delete payload.showCheckoutDeliveryMap;
      delete payload.allowPickupAgentAdminChat;
      delete payload.allowSellerDirectSupportMessages;
      delete payload.allowSharedVariantColorStock;
      delete payload.isMaintenanceMode;
      delete payload.maintenanceMessage;
      delete payload.maintenanceStartedAt;
      delete payload.maintenanceScheduledEnd;
      delete payload.maintenanceStartedBy;
      delete payload.inviteOnlyRegistration;
      delete payload.orderAutoCancelHours;
      delete payload.freeTierProductLimit;
      delete payload.maxProductsPerSeller;
      delete payload.upgradePlanAPrice;
      delete payload.upgradePlanASlots;
      delete payload.upgradePlanBPrice;
      delete payload.upgradePlanCPrice;
      delete payload.deliveryFeeCommission;
      delete payload.referralEnabled;
      delete payload.referralEnabledSingleStore;
      delete payload.referralEnabledMultiVendor;
      delete payload.referralRewardPercent;
      delete payload.referralCustomerThreshold;
      delete payload.referralSellerThreshold;
      delete payload.referralSellerPromoHours;
      delete payload.maxUploadSizeMb;
      delete payload.allowedUploadTypes;
      delete payload.renderDeployHookUrl;
      delete payload.ga4PropertyId;
      delete payload.googleCredentialsJson;
      delete payload.sentryAuthToken;
      delete payload.sentryOrg;
      delete payload.sentryProject;
      result = await runUpdate(payload);
    }

    // Invalidate cache again after update
    this.invalidateCache("getPlatformSettings");
    // compat provides fallbacks; DB result wins if the column exists
    return {
      ...(await readPlatformSettingsCompat()),
      ...result[0],
    };
  }

  // Promotional Ads management
  async createPromotionalAd(payload: { type: 'store' | 'product'; targetId: string; startAt?: Date | null; endAt?: Date | null; createdBy?: string | null; title?: string | null; description?: string | null; imageUrl?: string | null; ctaText?: string | null; ctaUrl?: string | null; themeColor?: string | null }) {
    try {
      const now = new Date();
      const [existingActive] = await db
        .select()
        .from(promotionalAds)
        .where(
          and(
            eq(promotionalAds.type, payload.type),
            eq(promotionalAds.targetId, payload.targetId),
            eq(promotionalAds.isActive, true),
            or(isNull(promotionalAds.endAt), gte(promotionalAds.endAt, now)),
          ),
        )
        .orderBy(desc(promotionalAds.createdAt))
        .limit(1);

      if (existingActive) {
        throw new Error(
          `An active ${payload.type} promotion already exists for this target. End the current promotion before creating another one.`,
        );
      }

      const [created] = await db.insert(promotionalAds).values({
        type: payload.type,
        targetId: payload.targetId,
        startAt: payload.startAt || null,
        endAt: payload.endAt || null,
        isActive: true,
        createdBy: payload.createdBy || null,
        title: payload.title || null,
        description: payload.description || null,
        imageUrl: payload.imageUrl || null,
        ctaText: payload.ctaText || null,
        ctaUrl: payload.ctaUrl || null,
        themeColor: payload.themeColor || null,
      }).returning();
      return created;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        throw new Error('Promotional ads table not present; please run migrations');
      }
      throw err;
    }
  }

  async getActivePromotionalAds(): Promise<any[]> {
    const now = new Date();
    try {
      const rows = await db
        .select()
        .from(promotionalAds)
        .where(and(eq(promotionalAds.isActive, true), or(isNull(promotionalAds.endAt), gte(promotionalAds.endAt, now))))
        .orderBy(desc(promotionalAds.createdAt));

      const uniqueRows = new Map<string, any>();
      for (const row of rows) {
        const key = `${row.type}:${row.targetId}`;
        if (!uniqueRows.has(key)) {
          uniqueRows.set(key, row);
        }
      }

      return Array.from(uniqueRows.values());
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; getActivePromotionalAds returning empty list');
        return [];
      }
      throw err;
    }
  }

  // Return all promotions (active + inactive) for admin listing; resilient if table missing
  async getAllPromotionalAds(): Promise<any[]> {
    try {
      const rows = await db.select().from(promotionalAds).orderBy(desc(promotionalAds.createdAt));
      return rows;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; getAllPromotionalAds returning empty list');
        return [];
      }
      throw err;
    }
  }

  async expirePromotionalAds() {
    const now = new Date();
    try {
      await db.update(promotionalAds).set({ isActive: false, updatedAt: new Date() }).where(and(eq(promotionalAds.isActive, true), isNotNull(promotionalAds.endAt), lte(promotionalAds.endAt, now)));
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; expirePromotionalAds no-op');
        return;
      }
      throw err;
    }
  }

  async expirePromotionById(id: string) {
    try {
      await db.update(promotionalAds).set({ isActive: false, updatedAt: new Date() }).where(eq(promotionalAds.id, id));
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; expirePromotionById no-op');
        return;
      }
      throw err;
    }
  }

  // Check if promotions table exists in the database
  async promotionsTableExists(): Promise<boolean> {
    try {
      // Try a harmless query to check table presence
      const rows = await db.select().from(promotionalAds).limit(1);
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        return false;
      }
      throw err;
    }
  }

  // Promotion Pricing operations
  async createPromotionPricing(data: { type: 'store' | 'product'; durationType: 'hour' | 'day' | 'week' | 'month'; duration: number; price: string }): Promise<any> {
    const result = await db.insert(promotionPricing).values(data as any).returning();
    return result[0];
  }

  async getAllPromotionPricing(options?: { includeInactive?: boolean }): Promise<any[]> {
    if (options?.includeInactive) {
      return await db.select().from(promotionPricing).orderBy(desc(promotionPricing.updatedAt), desc(promotionPricing.createdAt));
    }
    return await db.select().from(promotionPricing).where(eq(promotionPricing.isActive, true)).orderBy(desc(promotionPricing.updatedAt), desc(promotionPricing.createdAt));
  }

  async getPromotionPricing(type: 'store' | 'product', durationType: 'hour' | 'day' | 'week' | 'month', duration: number): Promise<any | undefined> {
    const result = await db.select().from(promotionPricing)
      .where(and(
        eq(promotionPricing.type, type),
        eq(promotionPricing.durationType, durationType),
        eq(promotionPricing.duration, duration),
        eq(promotionPricing.isActive, true)
      ))
      .limit(1);
    return result[0];
  }

  async updatePromotionPricing(id: number, data: Partial<{ price: string; isActive: boolean }>): Promise<any> {
    const result = await db.update(promotionPricing).set({ ...data, updatedAt: new Date() }).where(eq(promotionPricing.id, id)).returning();
    return result[0];
  }

  async deletePromotionPricing(id: number): Promise<void> {
    await db.delete(promotionPricing).where(eq(promotionPricing.id, id));
  }

  // Cart operations
  private async productHasVariants(productId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: productVariants.id })
      .from(productVariants)
      .where(eq(productVariants.productId, productId))
      .limit(1);

    return Boolean(row?.id);
  }

  private async getAvailableCartStock(productId: string, variantId?: string | null): Promise<number> {
    if (variantId) {
      const [variant] = await db
        .select({ stock: productVariants.stock })
        .from(productVariants)
        .where(eq(productVariants.id, variantId))
        .limit(1);

      if (variant) {
        return Math.max(0, Number(variant.stock) || 0);
      }
    }

    if (await this.productHasVariants(productId)) {
      return 0;
    }

    const [product] = await db
      .select({ stock: products.stock })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    return Math.max(0, Number(product?.stock) || 0);
  }

  private async getCartSelectionQuantity(
    userId: string,
    productId: string,
    variantId?: string | null,
    selectedColor?: string | null,
    selectedSize?: string | null,
    excludeCartId?: string | null,
  ): Promise<number> {
    const rows = await db
      .select({ quantity: cart.quantity })
      .from(cart)
      .where(
        and(
          eq(cart.userId, userId),
          eq(cart.productId, productId),
          variantId ? eq(cart.variantId, variantId) : sql`${cart.variantId} IS NULL`,
          selectedColor ? eq(cart.selectedColor, selectedColor) : sql`${cart.selectedColor} IS NULL`,
          selectedSize ? eq(cart.selectedSize, selectedSize) : sql`${cart.selectedSize} IS NULL`,
          excludeCartId ? sql`${cart.id} <> ${excludeCartId}` : sql`true`,
        ),
      );

    return rows.reduce((sum, row) => sum + Math.max(0, Number(row.quantity || 0)), 0);
  }

  async addToCart(userId: string, productId: string, quantity: number, variantId?: string, selectedColor?: string, selectedSize?: string, selectedImageIndex?: number): Promise<Cart> {
    await this.mergeDuplicateCartSelections(userId);
    const normalizedQuantity = Math.max(1, Math.floor(Number(quantity) || 1));
    const productRecord = await this.getProduct(productId);
    if (!productRecord) {
      throw new Error("Product not found");
    }
    if (String(productRecord.sellerId || "").trim() === String(userId || "").trim()) {
      throw new Error("You cannot add your own product to cart");
    }
    const productRequiresVariantSelection = await this.productHasVariants(productId);
    if (productRequiresVariantSelection && !variantId) {
      throw new Error("Please choose the product option before adding it to cart");
    }
    if (productRequiresVariantSelection) {
      await db
        .delete(cart)
        .where(
          and(
            eq(cart.userId, userId),
            eq(cart.productId, productId),
            sql`${cart.variantId} IS NULL`,
          ),
        );
    }
    const availableStock = await this.getAvailableCartStock(productId, variantId || null);
    if (availableStock <= 0) {
      throw new Error("This product is out of stock");
    }

    const imageIdx = selectedImageIndex ?? 0;
    
    const existing = await db.select().from(cart)
      .where(and(
        eq(cart.userId, userId), 
        eq(cart.productId, productId),
        variantId ? eq(cart.variantId, variantId) : sql`${cart.variantId} IS NULL`,
        selectedColor ? eq(cart.selectedColor, selectedColor) : sql`${cart.selectedColor} IS NULL`,
        selectedSize ? eq(cart.selectedSize, selectedSize) : sql`${cart.selectedSize} IS NULL`
      ))
      .limit(1);

    const selectionQuantityInCart = await this.getCartSelectionQuantity(
      userId,
      productId,
      variantId || null,
      selectedColor || null,
      selectedSize || null,
    );
    const remainingSelectionStock = Math.max(availableStock - selectionQuantityInCart, 0);

    if (existing.length > 0) {
      if (remainingSelectionStock <= 0) {
        return existing[0];
      }
      const nextQuantity = Math.min(existing[0].quantity + normalizedQuantity, availableStock);
      // Exact match - update quantity and ensure image index is preserved
      const [updated] = await db.update(cart)
        .set({ 
          quantity: nextQuantity,
          selectedImageIndex: imageIdx,
          updatedAt: new Date() 
        })
        .where(eq(cart.id, existing[0].id))
        .returning();
      return updated;
    }

    // New unique combination - create separate cart item
    if (remainingSelectionStock <= 0) {
      throw new Error("This selection is already fully reserved in your cart");
    }
    const [newItem] = await db.insert(cart).values({ 
      userId, 
      productId, 
      quantity: Math.min(normalizedQuantity, remainingSelectionStock),
      variantId,
      selectedColor,
      selectedSize,
      selectedImageIndex: imageIdx
    }).returning();
    return newItem;
  }

  async getCart(userId: string): Promise<Array<{ id: string; productId: string; productName: string; productImage: string; quantity: number; price: string; variantId: string | null; selectedColor: string | null; selectedSize: string | null; selectedImageIndex: number | null; availableStock: number; requiresVariantSelection?: boolean }>> {
    this.scheduleBuyerOrderResolution(userId);
    await this.mergeDuplicateCartSelections(userId);

    const items = await db
      .select({
        id: cart.id,
        productId: cart.productId,
        productName: products.name,
        productImages: products.images,
        variantImages: productVariants.images,
        variantImage: productVariants.image,
        quantity: cart.quantity,
        price: products.price,
        variantId: cart.variantId,
        selectedColor: cart.selectedColor,
        selectedSize: cart.selectedSize,
        selectedImageIndex: cart.selectedImageIndex,
      })
      .from(cart)
      .leftJoin(products, eq(cart.productId, products.id))
      .leftJoin(productVariants, eq(cart.variantId, productVariants.id))
      .where(eq(cart.userId, userId))
      .orderBy(desc(cart.createdAt));

    const invalidLegacyIds: string[] = [];
    const resolvedItems = await Promise.all(
      items.map(async (item) => {
        const imageIndex = item.selectedImageIndex ?? 0;
        const requiresVariantSelection = !item.variantId && await this.productHasVariants(item.productId);
        if (requiresVariantSelection) {
          invalidLegacyIds.push(item.id);
          return null;
        }

        const variantImages =
          item.variantImages && Array.isArray(item.variantImages)
            ? item.variantImages.filter(Boolean)
            : item.variantImage
              ? [item.variantImage]
              : [];
        const productImage =
          variantImages.length > imageIndex
            ? variantImages[imageIndex]
            : variantImages.length > 0
              ? variantImages[0]
              : item.productImages && Array.isArray(item.productImages) && item.productImages.length > imageIndex
                ? item.productImages[imageIndex]
                : item.productImages && Array.isArray(item.productImages) && item.productImages.length > 0
                  ? item.productImages[0]
                  : "";
        const siblingSelectionQuantity = await this.getCartSelectionQuantity(
          userId,
          item.productId,
          item.variantId,
          item.selectedColor,
          item.selectedSize,
          item.id,
        );
        const rawAvailableStock = await this.getAvailableCartStock(item.productId, item.variantId);

        return {
          id: item.id,
          productId: item.productId,
          productName: item.productName || "Unknown Product",
          productImage,
          quantity: item.quantity,
          price: item.price || "0",
          variantId: item.variantId,
          selectedColor: item.selectedColor,
          selectedSize: item.selectedSize,
          selectedImageIndex: item.selectedImageIndex,
          availableStock: Math.max(rawAvailableStock - siblingSelectionQuantity, 0),
          requiresVariantSelection: false,
        };
      }),
    );

    if (invalidLegacyIds.length > 0) {
      await db.delete(cart).where(inArray(cart.id, invalidLegacyIds));
    }

    return resolvedItems.filter((item): item is NonNullable<typeof item> => Boolean(item));
  }

  async updateCartItem(id: string, quantity: number): Promise<Cart | undefined> {
    const normalizedQuantity = Math.max(0, Math.floor(Number(quantity) || 0));
    if (normalizedQuantity <= 0) {
      await db.delete(cart).where(eq(cart.id, id));
      return undefined;
    }

    const [existingItem] = await db
      .select({
        id: cart.id,
        userId: cart.userId,
        productId: cart.productId,
        variantId: cart.variantId,
        selectedColor: cart.selectedColor,
        selectedSize: cart.selectedSize,
        currentQuantity: cart.quantity,
      })
      .from(cart)
      .where(eq(cart.id, id))
      .limit(1);

    if (!existingItem) {
      return undefined;
    }

    const availableStock = await this.getAvailableCartStock(existingItem.productId, existingItem.variantId);
    const siblingSelectionQuantity = await this.getCartSelectionQuantity(
      existingItem.userId,
      existingItem.productId,
      existingItem.variantId,
      existingItem.selectedColor,
      existingItem.selectedSize,
      existingItem.id,
    );
    const maxQuantityForLine = Math.max(availableStock - siblingSelectionQuantity, 0);
    const safeQuantity =
      normalizedQuantity > maxQuantityForLine
        ? maxQuantityForLine > 0
          ? maxQuantityForLine
          : Math.max(1, Number(existingItem.currentQuantity || 1))
        : normalizedQuantity;

    const [updated] = await db.update(cart)
      .set({ quantity: safeQuantity, updatedAt: new Date() })
      .where(eq(cart.id, id))
      .returning();
    return updated;
  }

  async removeFromCart(id: string): Promise<boolean> {
    await db.delete(cart).where(eq(cart.id, id));
    return true;
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cart).where(eq(cart.userId, userId));
  }

  async clearCartThroughCheckoutTime(userId: string, checkoutStartedAt: Date): Promise<void> {
    await db
      .delete(cart)
      .where(and(eq(cart.userId, userId), lte(cart.updatedAt, checkoutStartedAt)));
  }

  async reassignCartVariantReferences(sourceVariantIds: string[], targetVariantId: string): Promise<void> {
    const normalizedIds = Array.from(new Set(sourceVariantIds.map((id) => String(id || "").trim()).filter(Boolean)));
    if (!normalizedIds.length) {
      return;
    }

    await db
      .update(cart)
      .set({ variantId: targetVariantId, updatedAt: new Date() })
      .where(inArray(cart.variantId, normalizedIds));
  }

  async clearCartVariantReferences(variantIds: string[]): Promise<void> {
    const normalizedIds = Array.from(new Set(variantIds.map((id) => String(id || "").trim()).filter(Boolean)));
    if (!normalizedIds.length) {
      return;
    }

    await db.delete(cart).where(inArray(cart.variantId, normalizedIds));
  }

  // Wishlist operations
  async addToWishlist(userId: string, productId: string): Promise<Wishlist> {
    const existing = await db.select().from(wishlist)
      .where(and(eq(wishlist.userId, userId), eq(wishlist.productId, productId)))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [newItem] = await db.insert(wishlist).values({ userId, productId }).returning();
    return newItem;
  }

  async getWishlist(userId: string): Promise<Wishlist[]> {
    return db.select().from(wishlist).where(eq(wishlist.userId, userId)).orderBy(desc(wishlist.createdAt));
  }

  async removeFromWishlist(userId: string, productId: string): Promise<boolean> {
    const result = await db.delete(wishlist)
      .where(and(eq(wishlist.userId, userId), eq(wishlist.productId, productId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Review operations
  async createReview(review: InsertReview & { userId: string }): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    // Recalculate and persist product rating aggregate
    const [agg] = await db.select({
      avg: sql<string>`COALESCE(AVG(${reviews.rating})::numeric(3,2), 0)::text`,
      count: sql<number>`COUNT(*)::integer`,
    }).from(reviews).where(eq(reviews.productId, review.productId));
    await db.update(products)
      .set({ ratings: String(agg?.avg ?? "0"), totalRatings: agg?.count ?? 0 })
      .where(eq(products.id, review.productId));
    this.invalidateCache(`getProductReviews:${review.productId}`);
    this.invalidateCache(`getProduct:${review.productId}`);
    this.invalidateCache("getProducts");
    return newReview;
  }

  async getProductReviews(productId: string): Promise<Array<Review & { userName: string; profileImage: string | null }>> {
    const cacheKey = `getProductReviews:${productId}`;
    const cached = this.getCachedResult(cacheKey, this.CACHE_TTL.getProductReviews);
    if (cached) {
      return cached;
    }

    const result = await db.select({
      id: reviews.id,
      productId: reviews.productId,
      userId: reviews.userId,
      rating: reviews.rating,
      comment: reviews.comment,
      sellerReply: reviews.sellerReply,
      sellerReplyAt: reviews.sellerReplyAt,
      createdAt: reviews.createdAt,
      userName: users.name,
      profileImage: users.profileImage,
    })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));
    const typedResult = result as Array<Review & { userName: string; profileImage: string | null }>;
    this.setCachedResult(cacheKey, typedResult);
    return typedResult;
  }

  async createRiderReview(review: InsertRiderReview & { userId: string }): Promise<RiderReview> {
    const [newReview] = await db.insert(riderReviews).values(review).returning();
    return newReview;
  }

  async getRiderReviews(riderId: string): Promise<Array<RiderReview & { userName: string }>> {
    const result = await db.select({
      id: riderReviews.id,
      riderId: riderReviews.riderId,
      userId: riderReviews.userId,
      orderId: riderReviews.orderId,
      rating: riderReviews.rating,
      comment: riderReviews.comment,
      createdAt: riderReviews.createdAt,
      userName: users.name,
    })
      .from(riderReviews)
      .leftJoin(users, eq(riderReviews.userId, users.id))
      .where(eq(riderReviews.riderId, riderId))
      .orderBy(desc(riderReviews.createdAt));
    return result as Array<RiderReview & { userName: string }>;
  }

  async getRiderAverageRating(riderId: string): Promise<number> {
    const result = await db.select({
      avgRating: sql<number>`avg(${riderReviews.rating})::float`,
    })
      .from(riderReviews)
      .where(eq(riderReviews.riderId, riderId));
    return result[0]?.avgRating || 0;
  }

  async addSellerReply(reviewId: string, reply: string): Promise<Review | undefined> {
    const [existing] = await db.select({ productId: reviews.productId }).from(reviews).where(eq(reviews.id, reviewId)).limit(1);
    const [updated] = await db.update(reviews)
      .set({ sellerReply: reply, sellerReplyAt: new Date() })
      .where(eq(reviews.id, reviewId))
      .returning();
    if (existing?.productId) {
      this.invalidateCache(`getProductReviews:${existing.productId}`);
    }
    return updated;
  }

  async verifyPurchaseForReview(userId: string, productId: string): Promise<{ verified: boolean; orderId?: string }> {
    const result = await db.select()
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.buyerId, userId),
          eq(orderItems.productId, productId),
          eq(orders.status, "delivered")
        )
      )
      .limit(1);
    
    if (result.length > 0) {
      return { verified: true, orderId: result[0].orders.id };
    }
    return { verified: false };
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByUser(userId: string, limit: number = 500): Promise<Notification[]> {
    return db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async markNotificationAsRead(notificationId: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  // Product Variant operations
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    await ensureProductVariantsSchemaCompat();
    const cacheKey = `getProductVariants:${productId}`;
    const cached = this.getCachedResult(cacheKey, this.CACHE_TTL.getProductVariants);
    if (cached) {
      return cached;
    }

    const variants = await db.select().from(productVariants).where(eq(productVariants.productId, productId));
    this.setCachedResult(cacheKey, variants);
    return variants;
  }

  async createProductVariant(variant: InsertProductVariant): Promise<ProductVariant> {
    await ensureProductVariantsSchemaCompat();
    const [newVariant] = await db.insert(productVariants).values({
      ...variant,
      originalStock: Number(variant.originalStock ?? variant.stock ?? 0) || 0,
    }).returning();
    this.invalidateCache(`getProductVariants:${variant.productId}`);
    this.invalidateCache(`getProduct:${variant.productId}`);
    this.invalidateCache("getProducts");
    return newVariant;
  }

  async updateProductVariant(variantId: string, updates: Partial<InsertProductVariant>): Promise<ProductVariant> {
    await ensureProductVariantsSchemaCompat();
    const [existing] = await db
      .select({
        productId: productVariants.productId,
        stock: productVariants.stock,
        originalStock: productVariants.originalStock,
      })
      .from(productVariants)
      .where(eq(productVariants.id, variantId))
      .limit(1);

    const nextStock =
      updates.stock !== undefined
        ? Math.max(0, Number(updates.stock) || 0)
        : Math.max(0, Number(existing?.stock) || 0);
    const existingOriginalStock = Math.max(
      0,
      Number(existing?.originalStock ?? existing?.stock ?? 0) || 0,
    );
    const nextOriginalStock =
      updates.originalStock !== undefined
        ? Math.max(0, Number(updates.originalStock) || 0)
        : nextStock > existingOriginalStock
          ? nextStock
          : existingOriginalStock;

    const [updatedVariant] = await db
      .update(productVariants)
      .set({
        ...updates,
        stock: nextStock,
        originalStock: nextOriginalStock,
      })
      .where(eq(productVariants.id, variantId))
      .returning();
    const productId = updatedVariant?.productId || existing?.productId;
    if (productId) {
      this.invalidateCache(`getProductVariants:${productId}`);
      this.invalidateCache(`getProduct:${productId}`);
      this.invalidateCache("getProducts");
    }
    return updatedVariant;
  }

  async deleteProductVariant(variantId: string): Promise<void> {
    const [existing] = await db.select({ productId: productVariants.productId }).from(productVariants).where(eq(productVariants.id, variantId)).limit(1);
    await this.clearCartVariantReferences([variantId]);
    await db.delete(productVariants).where(eq(productVariants.id, variantId));
    if (existing?.productId) {
      this.invalidateCache(`getProductVariants:${existing.productId}`);
      this.invalidateCache(`getProduct:${existing.productId}`);
      this.invalidateCache("getProducts");
    }
  }

  // Hero Banner operations
  async getHeroBanners(storeMode?: string): Promise<HeroBanner[]> {
    if (storeMode && storeMode !== 'both') {
      return await db.select().from(heroBanners)
        .where(and(
          eq(heroBanners.isActive, true),
          or(
            eq(heroBanners.storeMode, storeMode as any),
            eq(heroBanners.storeMode, 'both')
          )
        ))
        .orderBy(heroBanners.displayOrder);
    }
    return await db.select().from(heroBanners)
      .where(eq(heroBanners.isActive, true))
      .orderBy(heroBanners.displayOrder);
  }
  
  async getAllHeroBanners(): Promise<HeroBanner[]> {
    return await db.select().from(heroBanners)
      .orderBy(heroBanners.displayOrder);
  }
  
  async getHeroBanner(id: string): Promise<HeroBanner | undefined> {
    const [banner] = await db.select().from(heroBanners).where(eq(heroBanners.id, id));
    return banner;
  }
  
  async createHeroBanner(banner: InsertHeroBanner): Promise<HeroBanner> {
    const [newBanner] = await db.insert(heroBanners).values(banner).returning();
    return newBanner;
  }
  
  async updateHeroBanner(id: string, data: Partial<HeroBanner>): Promise<HeroBanner | undefined> {
    const [updated] = await db.update(heroBanners)
      .set(data)
      .where(eq(heroBanners.id, id))
      .returning();
    return updated;
  }
  
  async deleteHeroBanner(id: string): Promise<boolean> {
    const result = await db.delete(heroBanners).where(eq(heroBanners.id, id)).returning();
    return result.length > 0;
  }

  // Delivery Tracking operations
  async createDeliveryTracking(data: InsertDeliveryTracking): Promise<DeliveryTracking> {
    const [tracking] = await db.insert(deliveryTracking).values(data).returning();
    return tracking;
  }

  async getLatestDeliveryLocation(orderId: string): Promise<DeliveryTracking | undefined> {
    const result = await db.select()
      .from(deliveryTracking)
      .where(eq(deliveryTracking.orderId, orderId))
      .orderBy(desc(deliveryTracking.timestamp))
      .limit(1);
    return result[0];
  }

  async getLatestRiderLocation(riderId: string): Promise<DeliveryTracking | undefined> {
    const result = await db.select()
      .from(deliveryTracking)
      .where(eq(deliveryTracking.riderId, riderId))
      .orderBy(desc(deliveryTracking.timestamp))
      .limit(1);
    return result[0];
  }

  async getDeliveryTrackingHistory(orderId: string): Promise<DeliveryTracking[]> {
    return db.select()
      .from(deliveryTracking)
      .where(eq(deliveryTracking.orderId, orderId))
      .orderBy(desc(deliveryTracking.timestamp));
  }

  // Coupon operations
  async createCoupon(coupon: InsertCoupon & { sellerId: string }): Promise<Coupon> {
    const [newCoupon] = await db.insert(coupons).values({
      ...coupon,
      code: coupon.code.toUpperCase(),
    }).returning();
    return newCoupon;
  }

  async getCoupon(id: string): Promise<Coupon | undefined> {
    const result = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    return result[0];
  }

  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    const result = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);
    return result[0];
  }

  async getCouponsBySeller(sellerId: string): Promise<Coupon[]> {
    return db.select().from(coupons).where(eq(coupons.sellerId, sellerId)).orderBy(desc(coupons.createdAt));
  }

  async updateCoupon(id: string, data: Partial<Coupon>): Promise<Coupon | undefined> {
    const updateData = { ...data };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    const result = await db.update(coupons).set(updateData).where(eq(coupons.id, id)).returning();
    return result[0];
  }

  async deleteCoupon(id: string): Promise<boolean> {
    const result = await db.delete(coupons).where(eq(coupons.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async validateCoupon(code: string, sellerId: string, orderTotal: number): Promise<{ valid: boolean; message?: string; coupon?: Coupon; discountAmount?: string }> {
    const coupon = await this.getCouponByCode(code);
    
    if (!coupon) {
      return { valid: false, message: "Invalid coupon code" };
    }

    if (!coupon.isActive) {
      return { valid: false, message: "This coupon is no longer active" };
    }

    if (coupon.sellerId !== sellerId) {
      return { valid: false, message: "This coupon is not valid for this seller" };
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return { valid: false, message: "This coupon has expired" };
    }

    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
      return { valid: false, message: "This coupon has reached its usage limit" };
    }

    const minimumPurchase = parseFloat(coupon.minimumPurchase || "0");
    if (orderTotal < minimumPurchase) {
      return { valid: false, message: `Minimum purchase of ${minimumPurchase} required to use this coupon` };
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (orderTotal * parseFloat(coupon.discountValue)) / 100;
    } else {
      discountAmount = parseFloat(coupon.discountValue);
    }

    // Ensure discount doesn't exceed order total
    discountAmount = Math.min(discountAmount, orderTotal);

    return { valid: true, coupon, discountAmount: discountAmount.toFixed(2) };
  }

  // Analytics
  async getAnalytics(userId?: string, role?: string): Promise<any> {
    void this.backfillMissingCommissionEarnings(100).catch((error: any) => {
      console.error("[FINANCE] Background analytics sync failed:", error?.message || error);
    });
    // Basic analytics - can be expanded
    const result: any = {};
    const normalizedRole = (() => {
      const raw = (role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
      if (raw === "superadmin") return "super_admin";
      return raw;
    })();
    // payment_status can be enum/text depending on DB state, so cast to text before lower()
    const paidStatusFilter = sql`lower(cast(${orders.paymentStatus} as text)) in ('completed', 'paid', 'success')`;
    const completedRevenueFilter = and(eq(orders.status, "completed"), paidStatusFilter);
    
    if (normalizedRole === "admin" || normalizedRole === "super_admin" || !userId) {
      // Keep order counts aligned with DB totals and calculate revenue from paid states only.
      const totalOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders);

      const completedOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(completedRevenueFilter);
      
      const totalReceivedMoney = await db.select({ sum: sql<number>`sum(${orders.total})` })
        .from(orders)
        .where(paidStatusFilter);
      const [commissionTotals, promotionTotals] = await Promise.all([
        db.select({
          commission: sql<number>`coalesce(sum(${commissions.commissionAmount}::numeric), 0)`,
        }).from(commissions),
        db
          .select({
            promotion: sql<number>`coalesce(sum(${promotionApplications.totalPrice}::numeric), 0)`,
          })
          .from(promotionApplications)
          .where(and(eq(promotionApplications.paymentConfirmed, true), isNotNull(promotionApplications.approvedAt))),
      ]);
      const processingFeeTotals = await db.select({
        serviceFee: sql<number>`coalesce(sum(${orders.processingFee}::numeric), 0)`,
      })
        .from(orders)
        .where(paidStatusFilter);
      const deliveryReserveTotals = await db.select({
        deliveryFee: sql<number>`coalesce(sum(case when ${riderPayouts.status} in ('pending_approval', 'approved', 'processing') then ${riderPayouts.amount}::numeric else 0 end), 0)`,
      }).from(riderPayouts);
      
      const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
      const totalProducts = await db.select({ count: sql<number>`count(*)` }).from(products);
      
      result.totalOrders = Number(totalOrders[0]?.count ?? 0);
      result.paidOrders = Number(completedOrders[0]?.count ?? 0);
      result.completedOrders = Number(completedOrders[0]?.count ?? 0);
      const commissionRevenue = Number(commissionTotals[0]?.commission ?? 0);
      const promotionRevenue = Number(promotionTotals[0]?.promotion ?? 0);
      result.totalRevenue = commissionRevenue + promotionRevenue;
      result.totalReceivedMoney = Number(totalReceivedMoney[0]?.sum ?? 0);
      result.platformCommissionTotal = commissionRevenue;
      result.promotionRevenueTotal = promotionRevenue;
      result.platformRevenueTotal = commissionRevenue + promotionRevenue;
      result.processingFeesTotal = Number(processingFeeTotals[0]?.serviceFee ?? 0);
      result.deliveryReserveTotal = Number(deliveryReserveTotals[0]?.deliveryFee ?? 0);
      result.totalUsers = Number(totalUsers[0]?.count ?? 0);
      result.totalProducts = Number(totalProducts[0]?.count ?? 0);
    } else if (normalizedRole === "seller") {
      const totalSellerOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.sellerId, userId));

      const completedSellerOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.sellerId, userId),
          eq(orders.status, "completed"),
          paidStatusFilter
        ));
      
      // Gross product revenue = subtotal minus any coupon discount.
      // This excludes delivery fees and processing fees, which do not belong to the seller.
      const sellerRevenue = await db.select({
        sum: sql<number>`coalesce(sum(cast(${orders.subtotal} as numeric) - coalesce(cast(${orders.couponDiscount} as numeric), 0)), 0)`,
      })
        .from(orders)
        .where(and(
          eq(orders.sellerId, userId),
          eq(orders.status, "completed"),
          paidStatusFilter
        ));

      const sellerPaidRevenue = await db.select({
        sum: sql<number>`coalesce(sum(cast(${orders.subtotal} as numeric) - coalesce(cast(${orders.couponDiscount} as numeric), 0)), 0)`,
      })
        .from(orders)
        .where(and(
          eq(orders.sellerId, userId),
          paidStatusFilter
        ));

      const sellerProcessingFees = await db.select({ sum: sql<number>`sum(${orders.processingFee})` })
        .from(orders)
        .where(and(
          eq(orders.sellerId, userId),
          paidStatusFilter
        ));

      const deliveryMethodCounts = await db.select({
        deliveryMethod: orders.deliveryMethod,
        count: sql<number>`count(*)`,
      })
        .from(orders)
        .where(eq(orders.sellerId, userId))
        .groupBy(orders.deliveryMethod);

      const pendingSellerPayouts = await db.select({
        sum: sql<number>`coalesce(sum(${sellerPayouts.amount}), 0)`,
      })
        .from(sellerPayouts)
        .where(and(
          eq(sellerPayouts.sellerId, userId),
          or(
            eq(sellerPayouts.status, "pending"),
            eq(sellerPayouts.status, "processing"),
          ),
        ));

      const completedSellerPayouts = await db.select({
        sum: sql<number>`coalesce(sum(${sellerPayouts.amount}), 0)`,
      })
        .from(sellerPayouts)
        .where(and(
          eq(sellerPayouts.sellerId, userId),
          eq(sellerPayouts.status, "completed"),
        ));

      const sellerCommissionTotals = await db.select({
        commission: sql<number>`coalesce(sum(${commissions.commissionAmount}), 0)`,
        settlement: sql<number>`coalesce(sum(${commissions.sellerAmount}), 0)`,
      })
        .from(commissions)
        .where(eq(commissions.sellerId, userId));

      const availableBalance = await this.getSellerAvailableBalance(userId);
      const totalPickups = deliveryMethodCounts
        .filter((entry: any) => String(entry.deliveryMethod || "").toLowerCase().trim() === "pickup")
        .reduce((sum: number, entry: any) => sum + Number(entry.count || 0), 0);
      const totalDeliveries = deliveryMethodCounts
        .filter((entry: any) => String(entry.deliveryMethod || "").toLowerCase().trim() !== "pickup")
        .reduce((sum: number, entry: any) => sum + Number(entry.count || 0), 0);
      
      result.totalOrders = Number(totalSellerOrders[0]?.count ?? 0);
      result.paidOrders = Number(completedSellerOrders[0]?.count ?? 0);
      result.completedOrders = Number(completedSellerOrders[0]?.count ?? 0);
      result.totalRevenue = Number(sellerPaidRevenue[0]?.sum ?? 0);
      result.completedRevenue = Number(sellerRevenue[0]?.sum ?? 0);
      result.totalReceivedMoney = Number(sellerCommissionTotals[0]?.settlement ?? 0);
      result.sellerSettlementTotal = Number(sellerCommissionTotals[0]?.settlement ?? 0);
      result.platformCommissionTotal = Number(sellerCommissionTotals[0]?.commission ?? 0);
      result.processingFeesTotal = Number(sellerProcessingFees[0]?.sum ?? 0);
      result.pendingPayoutValue = Number(pendingSellerPayouts[0]?.sum ?? 0);
      result.availableBalance = Number(availableBalance ?? 0);
      result.completedPayoutValue = Number(completedSellerPayouts[0]?.sum ?? 0);
      result.totalPickups = totalPickups;
      result.totalDeliveries = totalDeliveries;
    }
    
    return result;
  }

  // Banner Collection operations
  async createBannerCollection(collection: InsertBannerCollection): Promise<BannerCollection> {
    const [newCollection] = await db.insert(bannerCollections).values(collection).returning();
    return newCollection;
  }

  async getBannerCollection(id: string): Promise<BannerCollection | undefined> {
    const result = await db.select().from(bannerCollections).where(eq(bannerCollections.id, id)).limit(1);
    return result[0];
  }

  async getBannerCollections(): Promise<BannerCollection[]> {
    return db.select().from(bannerCollections).orderBy(desc(bannerCollections.createdAt));
  }

  async updateBannerCollection(id: string, data: Partial<BannerCollection>): Promise<BannerCollection | undefined> {
    const [updated] = await db.update(bannerCollections).set(data).where(eq(bannerCollections.id, id)).returning();
    return updated;
  }

  async deleteBannerCollection(id: string): Promise<boolean> {
    await db.delete(bannerCollections).where(eq(bannerCollections.id, id));
    return true;
  }

  // Marketplace Banner operations
  async createMarketplaceBanner(banner: InsertMarketplaceBanner): Promise<MarketplaceBanner> {
    const [newBanner] = await db.insert(marketplaceBanners).values(banner).returning();
    return newBanner;
  }

  async getMarketplaceBanner(id: string): Promise<MarketplaceBanner | undefined> {
    const result = await db.select().from(marketplaceBanners).where(eq(marketplaceBanners.id, id)).limit(1);
    return result[0];
  }

  async getMarketplaceBanners(collectionId?: string): Promise<MarketplaceBanner[]> {
    if (collectionId) {
      return db.select().from(marketplaceBanners)
        .where(eq(marketplaceBanners.collectionId, collectionId))
        .orderBy(marketplaceBanners.displayOrder, desc(marketplaceBanners.createdAt));
    }
    return db.select().from(marketplaceBanners)
      .orderBy(marketplaceBanners.displayOrder, desc(marketplaceBanners.createdAt));
  }

  async getActiveMarketplaceBanners(): Promise<MarketplaceBanner[]> {
    const now = new Date();
    return db.select().from(marketplaceBanners)
      .where(
        and(
          eq(marketplaceBanners.isActive, true),
          or(
            isNull(marketplaceBanners.startAt),
            lte(marketplaceBanners.startAt, now)
          ),
          or(
            isNull(marketplaceBanners.endAt),
            gte(marketplaceBanners.endAt, now)
          )
        )
      )
      .orderBy(marketplaceBanners.displayOrder);
  }

  async getActiveFooterPages(): Promise<FooterPage[]> {
    return db.select().from(footerPages)
      .where(eq(footerPages.isActive, true))
      .orderBy(footerPages.group, footerPages.displayOrder);
  }

  async getAllFooterPages(): Promise<FooterPage[]> {
    return db.select().from(footerPages)
      .orderBy(footerPages.group, footerPages.displayOrder);
  }

  async createFooterPage(data: InsertFooterPage): Promise<FooterPage> {
    const [created] = await db.insert(footerPages).values(data).returning();
    return created;
  }

  async updateFooterPage(id: string, data: Partial<FooterPage>): Promise<FooterPage | undefined> {
    const [updated] = await db.update(footerPages).set(data).where(eq(footerPages.id, id)).returning();
    return updated;
  }

  async deleteFooterPage(id: string): Promise<boolean> {
    await db.delete(footerPages).where(eq(footerPages.id, id));
    return true;
  }

  async updateMarketplaceBanner(id: string, data: Partial<MarketplaceBanner>): Promise<MarketplaceBanner | undefined> {
    const [updated] = await db.update(marketplaceBanners).set(data).where(eq(marketplaceBanners.id, id)).returning();
    return updated;
  }

  async deleteMarketplaceBanner(id: string): Promise<boolean> {
    await db.delete(marketplaceBanners).where(eq(marketplaceBanners.id, id));
    return true;
  }

  async reorderMarketplaceBanners(bannerIds: string[]): Promise<void> {
    for (let i = 0; i < bannerIds.length; i++) {
      await db.update(marketplaceBanners)
        .set({ displayOrder: i })
        .where(eq(marketplaceBanners.id, bannerIds[i]));
    }
  }

  // Multi-vendor homepage data
  async getApprovedSellers(): Promise<User[]> {
    return db.select().from(users)
      .where(
        and(
          eq(users.role, "seller"),
          eq(users.isApproved, true),
          eq(users.isActive, true)
        )
      )
      .orderBy(desc(users.createdAt));
  }

  async getFeaturedProducts(limit: number = 12, sellerId?: string, storeId?: string): Promise<Product[]> {
    const conditions = [eq(products.isActive, true)];
    if (sellerId) {
      conditions.push(eq(products.sellerId, sellerId));
    }
    if (storeId) {
      conditions.push(eq(products.storeId, storeId));
    }
    return db.select().from(products)
      .where(and(...conditions))
      .orderBy(desc(products.ratings), desc(products.createdAt))
      .limit(limit);
  }


  // Category Fields operations
  async createCategoryField(field: any): Promise<CategoryField> {
    const [newField] = await db.insert(categoryFields).values(field).returning();
    return newField;
  }

  async getCategoryFields(categoryName?: string): Promise<CategoryField[]> {
    if (categoryName) {
      return await db.select()
        .from(categoryFields)
        .where(eq(categoryFields.categoryName, categoryName))
        .orderBy(categoryFields.displayOrder);
    }
    return await db.select().from(categoryFields).orderBy(categoryFields.categoryName, categoryFields.displayOrder);
  }

  async updateCategoryField(id: string, data: any): Promise<CategoryField | undefined> {
    const [updated] = await db.update(categoryFields)
      .set(data)
      .where(eq(categoryFields.id, id))
      .returning();
    return updated;
  }

  async deleteCategoryField(id: string): Promise<boolean> {
    const result = await db.delete(categoryFields).where(eq(categoryFields.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Store operations
  async createStore(store: any): Promise<Store> {
    const [newStore] = await db.insert(stores).values(store).returning();
    return newStore;
  }

  // Centralized idempotent store creation/retrieval for sellers
  // Returns: Store object on success, throws error with specific message on failure
  async ensureStoreForSeller(sellerId: string, options?: { requireApproval?: boolean }): Promise<Store> {
    const requireApproval = options?.requireApproval ?? false;
    
    // First, check if store already exists
    const existingStore = await this.getStoreByPrimarySeller(sellerId);
    if (existingStore) {
      console.log(`[ensureStoreForSeller] Store ${existingStore.id} already exists for seller ${sellerId}`);
      return existingStore;
    }

    // Get seller details
    const seller = await this.getUser(sellerId);
    if (!seller) {
      throw new Error(`Seller account not found`);
    }

    // Check seller role
    if (seller.role !== "seller") {
      throw new Error(`User is not a seller (role: ${seller.role})`);
    }

    // Optionally check if seller is approved (used by product creation, my-store endpoints)
    if (requireApproval && !seller.isApproved) {
      throw new Error(`Seller account is not approved yet. Please wait for admin approval.`);
    }

    // Validate required fields for store creation
    if (!seller.storeType) {
      throw new Error(`Missing required store type. Please ensure the seller has selected a store type during registration.`);
    }

    // Create store with seller's profile data
    const storeData = {
      primarySellerId: sellerId,
      name: seller.storeName || `${seller.name}'s Store`,
      description: seller.storeDescription || `Welcome to ${seller.name}'s store`,
      logo: seller.profileImage || seller.storeBanner || undefined,
      banner: seller.storeBanner || undefined,
      storeType: seller.storeType,
      storeTypeMetadata: seller.storeTypeMetadata,
      isActive: true,
      isApproved: true
    };

    console.log(`[ensureStoreForSeller] Creating new store for seller ${sellerId}:`, {
      name: storeData.name,
      storeType: storeData.storeType,
      hasLogo: !!storeData.logo,
      sellerApproved: seller.isApproved
    });

    try {
      const newStore = await this.createStore(storeData);
      console.log(`[ensureStoreForSeller] Successfully created store ${newStore.id} for seller ${sellerId}`);
      return newStore;
    } catch (error: any) {
      console.error(`[ensureStoreForSeller] Database error creating store for seller ${sellerId}:`, {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to create store: ${error.message}`);
    }
  }

  async getStore(id: string): Promise<Store | undefined> {
    const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
    return result[0];
  }

  async getStores(filters?: { isActive?: boolean; isApproved?: boolean }): Promise<Store[]> {
    let query = db.select().from(stores);
    
    const conditions = [];
    if (filters?.isActive !== undefined) {
      conditions.push(eq(stores.isActive, filters.isActive));
    }
    if (filters?.isApproved !== undefined) {
      conditions.push(eq(stores.isApproved, filters.isApproved));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(stores.createdAt));
  }

  async getStoreByPrimarySeller(sellerId: string): Promise<Store | undefined> {
    const result = await db.select()
      .from(stores)
      .where(eq(stores.primarySellerId, sellerId))
      .limit(1);
    return result[0];
  }

  async updateStore(id: string, data: any): Promise<Store | undefined> {
    const nextPayoutType = data?.payoutType;
    const nextPayoutDetails = data?.payoutDetails;
    let normalizedData = { ...data };

    if (nextPayoutType !== undefined || nextPayoutDetails !== undefined) {
      const existingStore = await this.getStore(id);
      if (!existingStore) return undefined;

      const resolvedPayoutType = nextPayoutType ?? existingStore.payoutType;
      const resolvedPayoutDetails = { ...(nextPayoutDetails ?? existingStore.payoutDetails ?? {}) };

      if (resolvedPayoutType === "mobile_money") {
        resolvedPayoutDetails.provider = normalizeGhanaMobileMoneyProvider(resolvedPayoutDetails.provider);
        resolvedPayoutDetails.mobileNumber = normalizeGhanaMobileMoneyNumber(resolvedPayoutDetails.mobileNumber);
      }

      if (resolvedPayoutType === "bank_account") {
        if (
          !resolvedPayoutDetails?.bankCode ||
          !resolvedPayoutDetails?.bankName ||
          !resolvedPayoutDetails?.accountNumber ||
          !resolvedPayoutDetails?.accountName
        ) {
          throw new Error("Incomplete bank payout setup. Bank code, bank name, account number, and account name are required.");
        }
      } else if (resolvedPayoutType === "mobile_money") {
        if (
          !resolvedPayoutDetails?.provider ||
          !resolvedPayoutDetails?.mobileNumber ||
          !isValidGhanaMobileMoneyNumber(resolvedPayoutDetails.mobileNumber, resolvedPayoutDetails.provider)
        ) {
          throw new Error("Incomplete mobile money payout setup. A valid Ghana mobile money number matching the selected provider is required.");
        }
      }

      normalizedData = {
        ...normalizedData,
        payoutDetails: resolvedPayoutDetails,
      };
    }

    const [updated] = await db.update(stores)
      .set({ ...normalizedData, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return updated;
  }

  async deleteStore(id: string): Promise<boolean> {
    const result = await db.delete(stores).where(eq(stores.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Category operations
  async createCategory(category: any): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0];
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    return result[0];
  }

  async getCategories(filters?: { isActive?: boolean }): Promise<Category[]> {
    try {
      let query = db.select().from(categories);
      
      if (filters?.isActive !== undefined) {
        query = query.where(eq(categories.isActive, filters.isActive)) as any;
      }

      return await withStorageTimeout(
        query.orderBy(categories.displayOrder, categories.name),
        10000,
        "Categories lookup",
      );
    } catch (err: any) {
      console.warn('[STORAGE] categories lookup failed, returning empty list:', err?.message || String(err));
      return [];
    }
  }

  async updateCategory(id: string, data: any): Promise<Category | undefined> {
    const [updated] = await db.update(categories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getCategoriesByStore(storeId: string): Promise<Category[]> {
    const categoriesWithProducts = await db
      .selectDistinct({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        image: categories.image,
        storeTypes: categories.storeTypes,
        isActive: categories.isActive,
        displayOrder: categories.displayOrder,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.storeId, storeId),
          eq(categories.isActive, true)
        )
      )
      .orderBy(categories.displayOrder, categories.name);

    return categoriesWithProducts;
  }

  // Media Library operations
  async createMediaLibraryItem(data: InsertMediaLibrary): Promise<MediaLibrary> {
    const [newItem] = await db.insert(mediaLibrary).values(data).returning();
    return newItem;
  }

  async getMediaLibraryItems(filters?: { category?: string; uploaderRole?: string; uploaderId?: string }): Promise<MediaLibrary[]> {
    let query = db.select().from(mediaLibrary);
    
    const conditions = [];
    if (filters?.category) {
      conditions.push(eq(mediaLibrary.category, filters.category as any));
    }
    if (filters?.uploaderRole) {
      conditions.push(eq(mediaLibrary.uploaderRole, filters.uploaderRole as any));
    }
    if (filters?.uploaderId) {
      conditions.push(eq(mediaLibrary.uploaderId, filters.uploaderId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(mediaLibrary.createdAt));
  }

  async deleteMediaLibraryItem(id: string): Promise<boolean> {
    const result = await db.delete(mediaLibrary).where(eq(mediaLibrary.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Role Features operations
  async getRoleFeatures(role?: string): Promise<any[]> {
    let query = db.select().from(roleFeatures);
    
    if (role) {
      query = query.where(eq(roleFeatures.role, role as any)) as any;
    }
    
    return query;
  }

  async updateRoleFeatures(role: string, features: Record<string, boolean>, updatedBy: string): Promise<any> {
    const existing = await db.select().from(roleFeatures).where(eq(roleFeatures.role, role as any)).limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(roleFeatures)
        .set({ features, updatedAt: new Date(), updatedBy })
        .where(eq(roleFeatures.role, role as any))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(roleFeatures)
        .values({ role: role as any, features, updatedBy })
        .returning();
      return created;
    }
  }
}

export const storage = new DbStorage();
