import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, timestamp, boolean, jsonb, pgEnum, unique, serial, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin", "seller", "buyer", "rider", "agent", "pickup_agent"]);
export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "searching_rider",
  "confirmed",
  "packaged",
  "ready",
  "external_dispatch_arranged",
  "processing",
  "assigned",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "en_route",
  "delivering",
  "delivered",
  "completed",
  "cancelled",
  "disputed",
]);
export const deliveryMethodEnum = pgEnum("delivery_method", ["pickup", "bus", "rider"]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "processing", "completed", "failed", "refunded"]);
export const supportStatusEnum = pgEnum("support_status", ["open", "assigned", "resolved"]);
export const discountTypeEnum = pgEnum("discount_type", ["percentage", "fixed"]);
export const notificationTypeEnum = pgEnum("notification_type", ["order", "user", "product", "review", "message", "payout", "system"]);
export const adminTransactionTypeEnum = pgEnum("admin_transaction_type", ["sale", "commission", "promotion_fee"]);
export const mediaTypeEnum = pgEnum("media_type", ["image", "video"]);
export const deliveryAssignmentStatusEnum = pgEnum("delivery_assignment_status", ["assigned", "en_route", "delivered", "cancelled"]);
export const mediaCategoryEnum = pgEnum("media_category", ["banner", "category", "logo", "product", "general"]);
export const storeTypeEnum = pgEnum("store_type", ["clothing", "electronics", "food_beverages", "beauty_cosmetics", "home_garden", "sports_fitness", "books_media", "toys_games", "automotive", "health_wellness"]);
export const promoTypeEnum = pgEnum("promo_type", ["store", "product"]);
export const applicationStatusEnum = pgEnum("application_status", ["pending", "interview_scheduled", "approved", "rejected"]);

// Promotional Ads table for time-limited promoted stores/products
export const promotionalAds = pgTable("promotional_ads", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: promoTypeEnum("type").notNull(),
  targetId: varchar("target_id").notNull(), // store id or product id
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  // Promo display fields (migration 0009)
  title: text("title"),
  description: text("description"),
  imageUrl: text("image_url"),
  ctaText: varchar("cta_text"),
  ctaUrl: text("cta_url"),
  themeColor: varchar("theme_color"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  typeIdx: index("promotional_ads_type_idx").on(t.type),
  activeIdx: index("promotional_ads_active_idx").on(t.isActive),
}));

// Promotion pricing for sellers to apply for promotions
export const promotionPricing = pgTable("promotion_pricing", {
  id: serial("id").primaryKey(),
  type: promoTypeEnum("type").notNull(), // 'store' or 'product'
  durationType: varchar("duration_type").notNull(), // 'hour', 'day', 'week', or 'month'
  duration: integer("duration").notNull(), // e.g., 1 for 1 hour, 7 for 7 days, 2 for 2 weeks
  price: decimal("price", { precision: 10, scale: 2 }).notNull(), // price in GHS
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  typeDurationIdx: index("promotion_pricing_type_duration_idx").on(t.type, t.durationType, t.duration),
}));

export const promotionApplications = pgTable("promotion_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  type: promoTypeEnum("type").notNull(),
  targetId: varchar("target_id").notNull(),
  targetName: text("target_name").notNull(),
  durationType: varchar("duration_type").notNull(),
  duration: integer("duration").notNull(),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal("total_price", { precision: 10, scale: 2 }).notNull(),
  sellerNote: text("seller_note"),
  customerServiceNote: text("customer_service_note"),
  status: varchar("status", { length: 40 }).notNull().default("pending_payment"),
  paymentConfirmed: boolean("payment_confirmed").default(false),
  paymentConfirmedAt: timestamp("payment_confirmed_at"),
  paymentConfirmedBy: varchar("payment_confirmed_by").references(() => users.id),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectionReason: text("rejection_reason"),
  createdPromotionId: varchar("created_promotion_id").references(() => promotionalAds.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => ({
  sellerIdx: index("promotion_applications_seller_id_idx").on(t.sellerId),
  statusIdx: index("promotion_applications_status_idx").on(t.status),
  createdPromotionIdx: index("promotion_applications_created_promotion_id_idx").on(t.createdPromotionId),
}));

export const payoutTypeEnum = pgEnum("payout_type", ["bank_account", "mobile_money"]);
export const messageStatusEnum = pgEnum("message_status", ["sent", "delivered", "read"]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: userRoleEnum("role").notNull().default("buyer"),
  requestedRole: userRoleEnum("requested_role"),
  phone: text("phone"),
  isActive: boolean("is_active").default(true),
  riderOnline: boolean("rider_online").default(true),
  isApproved: boolean("is_approved").default(false),
  applicationStatus: applicationStatusEnum("application_status").default("pending"),
  interviewScheduledAt: timestamp("interview_scheduled_at"),
  interviewScheduledBy: text("interview_scheduled_by"),
  rejectionReason: text("rejection_reason"),
  profileImage: text("profile_image"),
  ghanaCardFront: text("ghana_card_front"),
  ghanaCardBack: text("ghana_card_back"),
  businessAddress: text("business_address"),
  riderCity: text("rider_city"),
  riderRegion: text("rider_region"),
  deliveryZoneId: varchar("delivery_zone_id").references(() => deliveryZones.id),
  storeName: text("store_name"),
  storeDescription: text("store_description"),
  storeBanner: text("store_banner"),
  storeType: storeTypeEnum("store_type"),
  storeTypeMetadata: jsonb("store_type_metadata").$type<Record<string, any>>(),
  vehicleInfo: jsonb("vehicle_info").$type<{ type: string; plateNumber?: string; license?: string; color?: string }>(),
  riderPreferences: jsonb("rider_preferences").$type<{
    deliveryNotifications: boolean;
    emailNotifications: boolean;
    locationSharing: boolean;
    lastKnownLocation?: {
      latitude: number;
      longitude: number;
      accuracy?: number | null;
      speed?: number | null;
      heading?: number | null;
      timestamp?: string | null;
    };
  }>(),
  nationalIdCard: varchar("national_id_card"),
  isPremiumSeller: boolean("is_premium_seller").default(false),
  sellerUpgradePlan: text("seller_upgrade_plan"), // "plan_a" | "plan_b" | "plan_c" | null
  sellerPlanExpiresAt: timestamp("seller_plan_expires_at"), // for plan_b monthly renewal
  sellerBonusSlots: integer("seller_bonus_slots").default(0), // extra slots from plan_a
  referralCode: text("referral_code").unique(),
  lastReferralNotificationAt: timestamp("last_referral_notification_at"),
  ratings: decimal("ratings", { precision: 3, scale: 2 }).default("0"),
  totalRatings: integer("total_ratings").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  roleIdx: index("users_role_idx").on(table.role),
  requestedRoleIdx: index("users_requested_role_idx").on(table.requestedRole),
  isActiveIdx: index("users_is_active_idx").on(table.isActive),
  riderOnlineIdx: index("users_rider_online_idx").on(table.riderOnline),
  isApprovedIdx: index("users_is_approved_idx").on(table.isApproved),
  applicationStatusIdx: index("users_application_status_idx").on(table.applicationStatus),
}));

export const adminPermissions = pgTable("admin_permissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: "cascade" }),
  canManageUsers: boolean("can_manage_users").default(true),
  canManageProducts: boolean("can_manage_products").default(true),
  canManageOrders: boolean("can_manage_orders").default(true),
  canManageStores: boolean("can_manage_stores").default(true),
  canManageCategories: boolean("can_manage_categories").default(true),
  canManageAdmins: boolean("can_manage_admins").default(false), // Only super_admin
  canEditPasswords: boolean("can_edit_passwords").default(false), // Only super_admin
  canManageRoles: boolean("can_manage_roles").default(false), // Only super_admin
  canManagePlatformSettings: boolean("can_manage_platform_settings").default(true),
  canViewAnalytics: boolean("can_view_analytics").default(true),
  canManagePromotions: boolean("can_manage_promotions").default(true),
  canManageReviews: boolean("can_manage_reviews").default(true),
  canManagePayouts: boolean("can_manage_payouts").default(true),
  canViewPayouts: boolean("can_view_payouts").default(true),
  canManageFeatures: boolean("can_manage_features").default(false),
  maxProductsPerDay: integer("max_products_per_day").default(100),
  maxOrdersPerDay: integer("max_orders_per_day").default(500),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const passwordResetTokens = pgTable("password_reset_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  token: varchar("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdBy: varchar("created_by").references(() => users.id), // Admin who triggered reset
  createdAt: timestamp("created_at").defaultNow(),
});

export const platformSettings = pgTable("platform_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  isMultiVendor: boolean("is_multi_vendor").default(false),
  platformName: text("platform_name").default("ModestGlow"),
  logo: text("logo"),
  primaryColor: text("primary_color").default("#1e7b5f"),
  secondaryColor: text("secondary_color").default("#2c3e50"),
  accentColor: text("accent_color").default("#e74c3c"),
  lightBgColor: text("light_bg_color").default("#ffffff"),
  lightTextColor: text("light_text_color").default("#000000"),
  darkBgColor: text("dark_bg_color").default("#1a1a1a"),
  darkTextColor: text("dark_text_color").default("#ffffff"),
  lightCardColor: text("light_card_color").default("#f8f9fa"),
  darkCardColor: text("dark_card_color").default("#2a2a2a"),
  onboardingImages: text("onboarding_images").array(),
  defaultCurrency: text("default_currency").default("GHS"),
  frontendUrl: text("frontend_url"), // Paystack callback URL for payment redirects (e.g., https://mystore.com)
  mapboxPublicToken: text("mapbox_public_token"),
  mapboxStyleUrl: text("mapbox_style_url").default("mapbox://styles/mapbox/navigation-night-v1"),
  mapboxGlVersion: text("mapbox_gl_version").default("v3.4.0"),
  smtpHost: text("smtp_host"),
  smtpPort: integer("smtp_port"),
  smtpUser: text("smtp_user"),
  smtpPass: text("smtp_pass"),
  smtpSecure: boolean("smtp_secure").default(false),
  smtpFromEmail: text("smtp_from_email"),
  smtpFromName: text("smtp_from_name"),
  paystackPublicKey: text("paystack_public_key"),
  paystackSecretKey: text("paystack_secret_key"),
  processingFeePercent: decimal("processing_fee_percent", { precision: 4, scale: 2 }).default("1.95"),
  cloudinaryCloudName: text("cloudinary_cloud_name"),
  cloudinaryApiKey: text("cloudinary_api_key"),
  cloudinaryApiSecret: text("cloudinary_api_secret"),
  cloudinaryAccounts: text("cloudinary_accounts"), // JSON array of extra accounts for rotation
  contactPhone: text("contact_phone").default("+233 XX XXX XXXX"),
  contactEmail: text("contact_email").default("support@kiyumart.com"),
  contactAddress: text("contact_address").default("Accra, Ghana"),
  facebookUrl: text("facebook_url"),
  instagramUrl: text("instagram_url"),
  twitterUrl: text("twitter_url"),
  linkedinUrl: text("linkedin_url"),
  youtubeUrl: text("youtube_url"),
  tiktokUrl: text("tiktok_url"),
  pinterestUrl: text("pinterest_url"),
  whatsappPage: text("whatsapp_page"),
  showSocialLinks: boolean("show_social_links").default(true),
  showFacebook: boolean("show_facebook").default(true),
  showInstagram: boolean("show_instagram").default(true),
  showTwitter: boolean("show_twitter").default(true),
  showLinkedin: boolean("show_linkedin").default(true),
  showYoutube: boolean("show_youtube").default(true),
  showTiktok: boolean("show_tiktok").default(true),
  showPinterest: boolean("show_pinterest").default(true),
  showWhatsapp: boolean("show_whatsapp").default(true),
  footerDescription: text("footer_description").default("Your trusted fashion marketplace. Quality products, fast delivery, and excellent service."),
  footerLinks: jsonb("footer_links").$type<Array<{title: string; url: string}>>().default([]),
  footerPaymentIcons: text("footer_payment_icons").array(),
  activeBannerCollectionId: varchar("active_banner_collection_id"),
  categoryDisplayStyle: text("category_display_style").default("grid"),
  bannerAutoplayEnabled: boolean("banner_autoplay_enabled").default(true),
  bannerAutoplayDuration: integer("banner_autoplay_duration").default(5000),
  adsEnabled: boolean("ads_enabled").default(false),
  heroBannerEnabled: boolean("hero_banner_enabled").default(false),
  sidebarAdEnabled: boolean("sidebar_ad_enabled").default(false),
  footerAdEnabled: boolean("footer_ad_enabled").default(false),
  productPageAdEnabled: boolean("product_page_ad_enabled").default(false),
  heroBannerAdImage: text("hero_banner_ad_image"),
  heroBannerAdUrl: text("hero_banner_ad_url"),
  sidebarAdImage: text("sidebar_ad_image"),
  sidebarAdUrl: text("sidebar_ad_url"),
  shopDisplayMode: text("shop_display_mode").default("by-store"), // "by-store" or "by-category"
  showShopBySection: boolean("show_shop_by_section").default(true), // Toggle visibility of Shop by section per store mode
  showHomepageFeaturedSection: boolean("show_homepage_featured_section").default(true),
  showHomepageNewArrivalSection: boolean("show_homepage_new_arrival_section").default(true),
  footerAdImage: text("footer_ad_image"),
  footerAdUrl: text("footer_ad_url"),
  productPageAdImage: text("product_page_ad_image"),
  productPageAdUrl: text("product_page_ad_url"),
  showAdminOperationsPanels: boolean("show_admin_operations_panels").default(true),
  isExternalRiderSystemEnabled: boolean("is_external_rider_system_enabled").default(false),
  showCheckoutDeliveryMap: boolean("show_checkout_delivery_map").default(true),
  allowPickupAgentAdminChat: boolean("allow_pickup_agent_admin_chat").default(true),
  allowSellerDirectSupportMessages: boolean("allow_seller_direct_support_messages").default(true),
  allowSellerRegistration: boolean("allow_seller_registration").default(false),
  allowRiderRegistration: boolean("allow_rider_registration").default(false),
  allowSellerBankPayouts: boolean("allow_seller_bank_payouts").default(true),
  allowSharedVariantColorStock: boolean("allow_shared_variant_color_stock").default(false),
  primaryStoreId: varchar("primary_store_id"),
  defaultCommissionRate: decimal("default_commission_rate", { precision: 5, scale: 2 }).default("1.00"), // 1% default
  isMaintenanceMode: boolean("is_maintenance_mode").default(false),
  maintenanceMessage: text("maintenance_message"),
  maintenanceStartedAt: timestamp("maintenance_started_at"),
  maintenanceScheduledEnd: timestamp("maintenance_scheduled_end"),
  maintenanceStartedBy: varchar("maintenance_started_by"),
  // Analytics integrations (free tiers)
  googleAnalyticsId: text("google_analytics_id"),
  microsoftClarityId: text("microsoft_clarity_id"),
  sentryDsn: text("sentry_dsn"),
  // GA4 Data API credentials (for server-side GA4 reporting dashboard)
  ga4PropertyId: text("ga4_property_id"),
  googleCredentialsJson: text("google_credentials_json"),
  // Sentry REST API credentials (for Sentry Issues dashboard)
  sentryAuthToken: text("sentry_auth_token"),
  sentryOrg: text("sentry_org"),
  sentryProject: text("sentry_project"),
  // Hosting & deployment
  renderDeployHookUrl: text("render_deploy_hook_url"),
  // Operational limits
  inviteOnlyRegistration: boolean("invite_only_registration").default(false),
  orderAutoCancelHours: integer("order_auto_cancel_hours").default(0),
  freeTierProductLimit: integer("free_tier_product_limit").default(20),
  maxProductsPerSeller: integer("max_products_per_seller").default(0),
  // Seller upgrade plan pricing (superadmin-managed)
  upgradePlanAPrice: decimal("upgrade_plan_a_price", { precision: 10, scale: 2 }).default("15"),
  upgradePlanASlots: integer("upgrade_plan_a_slots").default(10),
  upgradePlanBPrice: decimal("upgrade_plan_b_price", { precision: 10, scale: 2 }).default("40"),
  upgradePlanCPrice: decimal("upgrade_plan_c_price", { precision: 10, scale: 2 }).default("100"),
  // Delivery commission added to zone fee when internal rider mode is on
  deliveryFeeCommission: decimal("delivery_fee_commission", { precision: 10, scale: 2 }).default("0"),
  // Referral programme configuration
  referralEnabled: boolean("referral_enabled").default(false),
  referralEnabledSingleStore: boolean("referral_enabled_single_store").default(true),
  referralEnabledMultiVendor: boolean("referral_enabled_multi_vendor").default(true),
  referralCustomerThreshold: integer("referral_customer_threshold").default(5),
  referralSellerThreshold: integer("referral_seller_threshold").default(10),
  referralRewardPercent: decimal("referral_reward_percent", { precision: 5, scale: 2 }).default("10"),
  referralSellerPromoHours: integer("referral_seller_promo_hours").default(24),
  // Upload controls
  maxUploadSizeMb: integer("max_upload_size_mb").default(10),
  allowedUploadTypes: text("allowed_upload_types").default("jpg,jpeg,png,webp,gif,avif"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Stores table for multi-vendor support (backward compatible - optional)
export const stores = pgTable("stores", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  primarySellerId: varchar("primary_seller_id").references(() => users.id).unique(), // Unique constraint: one store per seller
  name: text("name").notNull(),
  description: text("description"),
  logo: text("logo"),
  banner: text("banner"),
  category: text("category"),
  storeType: storeTypeEnum("store_type"),
  storeTypeMetadata: jsonb("store_type_metadata").$type<Record<string, any>>(),
  isActive: boolean("is_active").default(true),
  isApproved: boolean("is_approved").default(true),
  
  // Paystack Payment Integration Fields
  paystackSubaccountId: text("paystack_subaccount_id"), // Paystack subaccount code (e.g., ACCT_xxxxxxxx)
  payoutType: payoutTypeEnum("payout_type"), // bank_account or mobile_money
  payoutDetails: jsonb("payout_details").$type<{
    // For Bank Account
    accountName?: string;
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    // For Mobile Money
    fullName?: string;
    mobileNumber?: string;
    provider?: string; // MTN, Vodafone, AirtelTigo
  }>(),
  isPayoutVerified: boolean("is_payout_verified").default(false),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Idempotency keys table for correlating payment initializes and webhooks
export const idempotencyKeys = pgTable("idempotency_keys", {
  key: varchar("key").primaryKey(),
  payload: jsonb("payload").$type<Record<string, any> | null>(),
  used: boolean("used").default(false),
  usedReference: text("used_reference"),
  retries: integer("retries").default(0),
  lastAttempt: timestamp("last_attempt"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  keyIdx: index("idempotency_keys_key_idx").on(t.key),
}));

// Product categories (admin-manageable)
export const categories = pgTable("categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  image: text("image").notNull(),
  description: text("description"),
  storeTypes: text("store_types").array(), // Array of store types this category applies to
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  storeId: varchar("store_id").references(() => stores.id), // Optional - for multi-vendor mode
  name: text("name").notNull(),
  description: text("description").notNull(),
  categoryId: varchar("category_id").references(() => categories.id), // Relational category (nullable during migration)
  category: text("category"), // Deprecated - kept temporarily for migration
  costPrice: decimal("cost_price", { precision: 10, scale: 2 }),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  discount: integer("discount").default(0),
  stock: integer("stock").default(0),
  images: text("images").array().notNull(),
  video: text("video"), // Max 30 seconds, MP4 or WEBM
  videoDuration: integer("video_duration"), // Duration in seconds for validation
  tags: text("tags").array(),
  dynamicFields: jsonb("dynamic_fields").$type<Record<string, any>>(), // Category-specific dynamic fields
  deliveryDuration: varchar("delivery_duration"), // Delivery time estimate (e.g., "1-2 days", "3-5 business days")
  isActive: boolean("is_active").default(true),
  ratings: decimal("ratings", { precision: 3, scale: 2 }).default("0"),
  totalRatings: integer("total_ratings").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  sellerIdx: index("products_seller_id_idx").on(table.sellerId),
  storeIdx: index("products_store_id_idx").on(table.storeId),
  categoryIdIdx: index("products_category_id_idx").on(table.categoryId),
  isActiveIdx: index("products_is_active_idx").on(table.isActive),
}));

export const deliveryZones = pgTable("delivery_zones", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(), // Unique constraint on normalized lowercase name
  entityKind: text("entity_kind").notNull().default("delivery_zone"), // delivery_zone | pickup_station
  type: text("type").notNull().default("city"), // city | region
  city: text("city"),
  region: text("region"),
  fee: decimal("fee", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const coupons = pgTable("coupons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  discountType: discountTypeEnum("discount_type").notNull(),
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull(),
  minimumPurchase: decimal("minimum_purchase", { precision: 10, scale: 2 }).default("0"),
  usageLimit: integer("usage_limit"),
  usedCount: integer("used_count").default(0),
  expiryDate: timestamp("expiry_date"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orders = pgTable("orders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber: text("order_number").notNull().unique(),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  riderId: varchar("rider_id").references(() => users.id),
  storeId: varchar("store_id").references(() => stores.id),
  checkoutSessionId: varchar("checkout_session_id"),
  status: orderStatusEnum("status").notNull().default("pending"),
  deliveryMethod: deliveryMethodEnum("delivery_method").notNull(),
  externalDeliveryByBus: boolean("external_delivery_by_bus").default(false),
  externalDeliveryType: varchar("external_delivery_type", { length: 32 }),
  deliveryZoneId: varchar("delivery_zone_id").references(() => deliveryZones.id),
  deliveryAddress: text("delivery_address"),
  deliveryCity: text("delivery_city"),
  deliveryPhone: text("delivery_phone"),
  deliveryLatitude: decimal("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: decimal("delivery_longitude", { precision: 10, scale: 7 }),
  deliveryFee: decimal("delivery_fee", { precision: 10, scale: 2 }).default("0"),
  subtotal: decimal("subtotal", { precision: 10, scale: 2 }).notNull(),
  couponCode: text("coupon_code"),
  couponDiscount: decimal("coupon_discount", { precision: 10, scale: 2 }).default("0"),
  processingFee: decimal("processing_fee", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("GHS"),
  paymentStatus: paymentStatusEnum("payment_status").default("pending"),
  paymentReference: text("payment_reference"),
  qrCode: text("qr_code"),
  deliveryOtp: varchar("delivery_otp", { length: 6 }),
  pickupOtp: varchar("pickup_otp", { length: 6 }),
  estimatedDelivery: timestamp("estimated_delivery"),
  deliveredAt: timestamp("delivered_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  buyerIdx: index("orders_buyer_id_idx").on(table.buyerId),
  sellerIdx: index("orders_seller_id_idx").on(table.sellerId),
  riderIdx: index("orders_rider_id_idx").on(table.riderId),
  statusIdx: index("orders_status_idx").on(table.status),
  paymentStatusIdx: index("orders_payment_status_idx").on(table.paymentStatus),
  createdAtIdx: index("orders_created_at_idx").on(table.createdAt),
  checkoutSessionIdx: index("orders_checkout_session_id_idx").on(table.checkoutSessionId),
}));

export const orderItems = pgTable("order_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  variantId: varchar("variant_id").references(() => productVariants.id),
  selectedColor: varchar("selected_color"),
  selectedSize: varchar("selected_size"),
  selectedImageIndex: integer("selected_image_index").default(0),
  quantity: integer("quantity").notNull(),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  total: decimal("total", { precision: 10, scale: 2 }).notNull(),
});

export const orderStatusHistory = pgTable("order_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: orderStatusEnum("from_status"),
  toStatus: orderStatusEnum("to_status").notNull(),
  changedBy: varchar("changed_by").notNull().references(() => users.id),
  changedByRole: userRoleEnum("changed_by_role").notNull(),
  reason: text("reason"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  orderIdx: index("order_status_history_order_id_idx").on(table.orderId),
  createdAtIdx: index("order_status_history_created_at_idx").on(table.createdAt),
}));

export const deliveryTracking = pgTable("delivery_tracking", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  latitude: decimal("latitude", { precision: 10, scale: 7 }).notNull(),
  longitude: decimal("longitude", { precision: 10, scale: 7 }).notNull(),
  accuracy: decimal("accuracy", { precision: 10, scale: 2 }),
  speed: decimal("speed", { precision: 10, scale: 2 }),
  heading: decimal("heading", { precision: 10, scale: 2 }),
  timestamp: timestamp("timestamp").defaultNow(),
});

export const chatMessages = pgTable("chat_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  receiverId: varchar("receiver_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  messageType: text("message_type").default("text"),
  status: messageStatusEnum("status").default("sent"), // WhatsApp-style: sent → delivered → read
  deliveredAt: timestamp("delivered_at"), // Timestamp when message delivered to recipient
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Index for finding messages by sender and status (batch delivery queries)
  senderStatusIdx: index("chat_messages_sender_status_idx").on(table.senderId, table.status),
  // Index for finding undelivered messages (WHERE delivered_at IS NULL)
  deliveredAtIdx: index("chat_messages_delivered_at_idx").on(table.deliveredAt),
}));

export const supportConversations = pgTable("support_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull().references(() => users.id),
  agentId: varchar("agent_id").references(() => users.id),
  routingMode: varchar("routing_mode", { length: 32 }).notNull().default("all_support"),
  routingUserIds: jsonb("routing_user_ids").$type<string[]>().default([]),
  lastSupportResponderId: varchar("last_support_responder_id").references(() => users.id),
  status: supportStatusEnum("status").notNull().default("open"),
  subject: text("subject").notNull(),
  lastMessage: text("last_message").default(""),
  firstResponseAt: timestamp("first_response_at"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const supportMessages = pgTable("support_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => supportConversations.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const transactions = pgTable("transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("GHS"),
  paymentProvider: text("payment_provider").default("paystack"),
  paymentReference: text("payment_reference").notNull(),
  status: paymentStatusEnum("status").default("pending"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const cart = pgTable("cart", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  variantId: varchar("variant_id").references(() => productVariants.id),
  selectedColor: varchar("selected_color"),
  selectedSize: varchar("selected_size"),
  selectedImageIndex: integer("selected_image_index").default(0),
  quantity: integer("quantity").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const wishlist = pgTable("wishlist", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserProduct: unique("wishlist_user_product_unique").on(table.userId, table.productId),
}));

export const reviews = pgTable("reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  userId: varchar("user_id").notNull().references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id), // Track which order this review is for
  rating: integer("rating").notNull(),
  comment: text("comment"),
  images: text("images").array(), // Optional review images
  isVerifiedPurchase: boolean("is_verified_purchase").default(false), // Only true if buyer actually purchased
  sellerReply: text("seller_reply"), // Seller can reply to reviews
  sellerReplyAt: timestamp("seller_reply_at"),
  isApproved: boolean("is_approved").default(true), // Admin moderation
  createdAt: timestamp("created_at").defaultNow(),
});

export const riderReviews = pgTable("rider_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  userId: varchar("user_id").notNull().references(() => users.id), // Buyer who left the review
  orderId: varchar("order_id").notNull().references(() => orders.id), // Delivery order being reviewed
  rating: integer("rating").notNull(), // 1-5 stars
  comment: text("comment"),
  isApproved: boolean("is_approved").default(true), // Admin moderation
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  uniqueUserOrder: unique("rider_review_user_order_unique").on(table.userId, table.orderId),
}));

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: notificationTypeEnum("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").default(false),
  metadata: jsonb("metadata").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const reportActivityLogs = pgTable("report_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestedBy: varchar("requested_by").notNull().references(() => users.id, { onDelete: "cascade" }),
  requesterRole: userRoleEnum("requester_role").notNull(),
  reportType: text("report_type").notNull(),
  action: text("action").notNull(), // request | generate | download
  format: text("format"), // pdf | csv | json
  status: text("status").default("success"), // success | failed | denied
  reportId: text("report_id"),
  scope: jsonb("scope").$type<Record<string, any>>().default({}),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  requestedByIdx: index("report_activity_logs_requested_by_idx").on(table.requestedBy),
  requesterRoleIdx: index("report_activity_logs_requester_role_idx").on(table.requesterRole),
  reportTypeIdx: index("report_activity_logs_report_type_idx").on(table.reportType),
  createdAtIdx: index("report_activity_logs_created_at_idx").on(table.createdAt),
}));

export const systemActivityLogs = pgTable("system_activity_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  category: text("category").notNull(),
  severity: text("severity").notNull().default("info"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  humanExplanation: text("human_explanation"),
  rootCause: text("root_cause"),
  suggestedFix: text("suggested_fix"),
  preventiveAction: text("preventive_action"),
  source: text("source"),
  entityType: text("entity_type"),
  entityId: text("entity_id"),
  actorId: varchar("actor_id").references(() => users.id, { onDelete: "set null" }),
  actorRole: userRoleEnum("actor_role"),
  fingerprint: text("fingerprint"),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  isResolved: boolean("is_resolved").notNull().default(false),
  firstSeenAt: timestamp("first_seen_at").defaultNow(),
  lastSeenAt: timestamp("last_seen_at").defaultNow(),
  resolvedAt: timestamp("resolved_at"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("system_activity_logs_category_idx").on(table.category),
  severityIdx: index("system_activity_logs_severity_idx").on(table.severity),
  isResolvedIdx: index("system_activity_logs_is_resolved_idx").on(table.isResolved),
  fingerprintIdx: index("system_activity_logs_fingerprint_idx").on(table.fingerprint),
  lastSeenAtIdx: index("system_activity_logs_last_seen_at_idx").on(table.lastSeenAt),
  createdAtIdx: index("system_activity_logs_created_at_idx").on(table.createdAt),
}));

export const receipts = pgTable("receipts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  receiptNumber: text("receipt_number").notNull().unique(),
  orderId: varchar("order_id").notNull().unique().references(() => orders.id, { onDelete: "cascade" }),
  generatedBy: varchar("generated_by").references(() => users.id),
  generatedByRole: userRoleEnum("generated_by_role"),
  trigger: text("trigger").notNull().default("payment_success"),
  status: text("status").notNull().default("generated"),
  payload: jsonb("payload").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdx: index("receipts_order_id_idx").on(table.orderId),
  generatedByIdx: index("receipts_generated_by_idx").on(table.generatedBy),
  updatedAtIdx: index("receipts_updated_at_idx").on(table.updatedAt),
}));

export const productVariants = pgTable("product_variants", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  productId: varchar("product_id").notNull().references(() => products.id),
  color: text("color"),
  size: text("size"),
  images: text("images").array(),
  sku: text("sku"),
  image: text("image"),
  stock: integer("stock").default(0),
  originalStock: integer("original_stock").default(0),
  priceAdjustment: decimal("price_adjustment", { precision: 10, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Store mode enum for banners
export const storeModeEnum = pgEnum("store_mode", ["single", "multivendor", "both"]);

export const heroBanners = pgTable("hero_banners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  subtitle: text("subtitle"),
  image: text("image").notNull(),
  ctaText: text("cta_text"),
  ctaLink: text("cta_link"),
  storeMode: storeModeEnum("store_mode").default("both"),
  isActive: boolean("is_active").default(true),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bannerCollections = pgTable("banner_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  type: text("type"),
  isActive: boolean("is_active").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const marketplaceBanners = pgTable("marketplace_banners", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").references(() => bannerCollections.id),
  title: text("title"),
  subtitle: text("subtitle"),
  imageUrl: text("image_url").notNull(),
  productRef: varchar("product_ref"),
  storeRef: varchar("store_ref"),
  ctaText: text("cta_text"),
  ctaUrl: text("cta_url"),
  displayOrder: integer("display_order").default(0),
  startAt: timestamp("start_at"),
  endAt: timestamp("end_at"),
  isActive: boolean("is_active").default(true),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const footerPages = pgTable("footer_pages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  content: text("content"),
  url: text("url"),
  group: text("group").default("general"),
  storeMode: text("store_mode").default("both"), // "single", "multivendor", or "both"
  icon: text("icon"),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  openInNewTab: boolean("open_in_new_tab").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// New tables for comprehensive feature list
export const adminWalletTransactions = pgTable("admin_wallet_transactions", {
  id: serial("id").primaryKey(),
  adminId: varchar("admin_id").notNull().references(() => users.id),
  type: adminTransactionTypeEnum("type").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  productId: varchar("product_id").references(() => products.id),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Commission System Tables
export const commissions = pgTable("commissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id).unique(), // CRITICAL: One commission per order
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  orderAmount: decimal("order_amount", { precision: 10, scale: 2 }).notNull(),
  commissionRate: decimal("commission_rate", { precision: 5, scale: 2 }).notNull(), // Percentage
  commissionAmount: decimal("commission_amount", { precision: 10, scale: 2 }).notNull(),
  sellerAmount: decimal("seller_amount", { precision: 10, scale: 2 }).notNull(),
  platformAmount: decimal("platform_amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("pending"), // pending, processed, failed
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  sellerIdx: index("commissions_seller_id_idx").on(table.sellerId),
  orderIdx: index("commissions_order_id_idx").on(table.orderId),
  statusIdx: index("commissions_status_idx").on(table.status),
}));

export const sellerPayouts = pgTable("seller_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("GHS"),
  method: text("method").notNull(), // bank_transfer, mobile_money, paystack
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  reference: text("reference").unique(),
  bankDetails: jsonb("bank_details").$type<{
    accountName?: string;
    accountNumber?: string;
    bankName?: string;
    bankCode?: string;
    mobileNumber?: string;
    provider?: string;
    transferFee?: string;
    settlementMode?: "split" | "transfer";
    transferReference?: string;
    transferCode?: string;
    transferStatus?: string;
    recipientCode?: string;
  }>(),
  commissionIds: text("commission_ids").array(), // Array of commission IDs included in this payout
  notes: text("notes"),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Rider payouts table for automated rider payment with approval workflow
export const riderPayouts = pgTable("rider_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  orderId: varchar("order_id").references(() => orders.id), // Link to completed delivery order
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("GHS"),
  method: text("method").notNull(), // bank_transfer, mobile_money, paystack
  status: text("status").notNull().default("pending_approval"), // pending_approval, approved, processing, completed, failed, rejected
  reference: text("reference").unique(),
  paymentDetails: jsonb("payment_details").$type<{
    accountName?: string;
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    mobileNumber?: string;
    provider?: string; // mtn, vodafone, airteltigo for mobile money
  }>(),
  notes: text("notes"),
  approvedBy: varchar("approved_by").references(() => users.id), // Super admin who approved
  approvedAt: timestamp("approved_at"),
  processedBy: varchar("processed_by").references(() => users.id),
  processedAt: timestamp("processed_at"),
  rejectedBy: varchar("rejected_by").references(() => users.id),
  rejectedAt: timestamp("rejected_at"),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  riderIdx: index("rider_payouts_rider_id_idx").on(table.riderId),
  statusIdx: index("rider_payouts_status_idx").on(table.status),
  createdAtIdx: index("rider_payouts_created_at_idx").on(table.createdAt),
}));

export const platformEarnings = pgTable("platform_earnings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  commissionId: varchar("commission_id").references(() => commissions.id).unique(), // One earning per commission
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  type: text("type").notNull(), // commission, service_fee, delivery_fee
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  // Index for commission lookup
  commissionIdx: index("platform_earnings_commission_id_idx").on(table.commissionId),
}));

export const promotions = pgTable("promotions", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id").notNull().references(() => products.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  promotedBy: varchar("promoted_by").notNull().references(() => users.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  position: integer("position").default(0),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscriptionPlans = pgTable("subscription_plans", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  description: text("description"),
  price: decimal("price", { precision: 10, scale: 2 }).notNull(),
  features: jsonb("features").$type<Array<string>>(),
  duration: integer("duration").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const featuredListings = pgTable("featured_listings", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id").notNull().references(() => products.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  planId: integer("plan_id").notNull().references(() => subscriptionPlans.id),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date").notNull(),
  position: integer("position").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const wishlists = pgTable("wishlists", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  productId: varchar("product_id").notNull().references(() => products.id),
  addedAt: timestamp("added_at").defaultNow(),
});

export const productMedia = pgTable("product_media", {
  id: serial("id").primaryKey(),
  productId: varchar("product_id").notNull().references(() => products.id),
  mediaUrl: varchar("media_url").notNull(),
  mediaType: mediaTypeEnum("media_type").notNull(),
  displayOrder: integer("display_order").default(0),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const currencyRates = pgTable("currency_rates", {
  id: serial("id").primaryKey(),
  fromCurrency: varchar("from_currency").notNull(),
  toCurrency: varchar("to_currency").notNull(),
  rate: decimal("rate", { precision: 10, scale: 6 }).notNull(),
  lastUpdated: timestamp("last_updated").defaultNow(),
});

export const deliveryAssignments = pgTable("delivery_assignments", {
  id: serial("id").primaryKey(),
  orderId: varchar("order_id").notNull().references(() => orders.id),
  riderId: varchar("rider_id").notNull().references(() => users.id),
  status: deliveryAssignmentStatusEnum("status").notNull().default("assigned"),
  assignedAt: timestamp("assigned_at").defaultNow(),
  deliveredAt: timestamp("delivered_at"),
  deliveryProof: varchar("delivery_proof"),
});

export const localizationStrings = pgTable("localization_strings", {
  id: serial("id").primaryKey(),
  key: varchar("key").notNull().unique(),
  en: text("en"),
  fr: text("fr"),
  ar: text("ar"),
  es: text("es"),
  zh: text("zh"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const securitySettings = pgTable("security_settings", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().unique().references(() => users.id),
  pinEnabled: boolean("pin_enabled").default(false),
  pinHash: varchar("pin_hash"),
  fingerprintEnabled: boolean("fingerprint_enabled").default(false),
  faceIdEnabled: boolean("face_id_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Referral tracking tables
export const referrals = pgTable("referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referrerId: varchar("referrer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  referredUserId: varchar("referred_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("signed_up"), // "signed_up" | "completed"
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  referrerIdx: index("referrals_referrer_idx").on(table.referrerId),
  referredIdx: index("referrals_referred_idx").on(table.referredUserId),
}));

export const referralRewards = pgTable("referral_rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // "discount" | "promotion"
  rewardPercent: decimal("reward_percent", { precision: 5, scale: 2 }),
  rewardDurationHours: integer("reward_duration_hours"),
  status: text("status").notNull().default("pending"), // "pending" | "claimed" | "expired"
  claimedAt: timestamp("claimed_at"),
  expiresAt: timestamp("expires_at"),
  discountCode: text("discount_code").unique(),
  promotionType: text("promotion_type"), // "store" | "product"
  promotionTargetId: text("promotion_target_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  userIdx: index("referral_rewards_user_idx").on(table.userId),
}));

export type Referral = typeof referrals.$inferSelect;
export type ReferralReward = typeof referralRewards.$inferSelect;

// Zod schemas for validation
export const insertUserSchema = createInsertSchema(users).pick({
  email: true,
  password: true,
  name: true,
  role: true,
  phone: true,
  profileImage: true,
  ghanaCardFront: true,
  ghanaCardBack: true,
  nationalIdCard: true,
  businessAddress: true,
  riderCity: true,
  riderRegion: true,
  deliveryZoneId: true,
  storeName: true,
  storeDescription: true,
  storeBanner: true,
  storeType: true,
  storeTypeMetadata: true,
  vehicleInfo: true,
}).extend({
  // Additional fields for form submission that map to user/store data
  vehicleType: z.string().optional(), // Maps to vehicleInfo.type
  vehicleColor: z.string().optional(), // Maps to vehicleInfo.color
  vehiclePlateNumber: z.string().optional(), // Maps to vehicleInfo.plateNumber
});

export const insertAdminPermissionSchema = createInsertSchema(adminPermissions).pick({
  userId: true,
  canManageUsers: true,
  canManageProducts: true,
  canManageOrders: true,
  canManageStores: true,
  canManageCategories: true,
  canManageAdmins: true,
  canEditPasswords: true,
  canManageRoles: true,
  canManagePlatformSettings: true,
  canViewAnalytics: true,
  canManagePromotions: true,
  canManageReviews: true,
  maxProductsPerDay: true,
  maxOrdersPerDay: true,
});

export const insertPasswordResetTokenSchema = createInsertSchema(passwordResetTokens).pick({
  userId: true,
  token: true,
  expiresAt: true,
  createdBy: true,
});

export const insertProductSchema = createInsertSchema(products).pick({
  name: true,
  description: true,
  categoryId: true,
  costPrice: true,
  price: true,
  discount: true,
  stock: true,
  images: true,
  video: true,
  videoDuration: true,
  tags: true,
  deliveryDuration: true,
  dynamicFields: true,
  storeId: true,
}).extend({
  images: z.array(z.string().url()).min(3, "Minimum 3 product images are required").max(8, "Maximum 8 images allowed"),
  video: z.string().url("Invalid video URL").optional().or(z.literal("")).nullable(),
});

export const insertDeliveryZoneSchema = createInsertSchema(deliveryZones).pick({
  name: true,
  entityKind: true,
  type: true,
  city: true,
  region: true,
  fee: true,
}).extend({
  name: z.string().min(1, "Zone name is required").max(100, "Zone name must be less than 100 characters"),
  entityKind: z.enum(["delivery_zone", "pickup_station"]).default("delivery_zone"),
  type: z.enum(["city", "region"]).default("city"),
  city: z.string().max(120, "City must be less than 120 characters").optional().nullable(),
  region: z.string().max(120, "Region must be less than 120 characters").optional().nullable(),
  // Use coerce to accept both string and number inputs (for seeds/scripts)
  fee: z.coerce.number().nonnegative("Delivery fee must be a non-negative number"),
});

export const insertOrderSchema = createInsertSchema(orders).pick({
  buyerId: true,
  sellerId: true,
  status: true,
  deliveryMethod: true,
  externalDeliveryByBus: true,
  externalDeliveryType: true,
  deliveryZoneId: true,
  deliveryAddress: true,
  deliveryCity: true,
  deliveryPhone: true,
  deliveryLatitude: true,
  deliveryLongitude: true,
  deliveryFee: true,
  subtotal: true,
  couponCode: true,
  couponDiscount: true,
  processingFee: true,
  total: true,
  currency: true,
  estimatedDelivery: true,
}).extend({
  // Accept both numeric and string GPS inputs from checkout UIs and normalize to DB decimal strings.
  deliveryLatitude: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((value) => (value === null || value === undefined || value === "" ? null : String(value))),
  deliveryLongitude: z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((value) => (value === null || value === undefined || value === "" ? null : String(value))),
});

export const insertChatMessageSchema = createInsertSchema(chatMessages).pick({
  receiverId: true,
  message: true,
  messageType: true,
});

export const insertWishlistSchema = createInsertSchema(wishlist).pick({
  productId: true,
});

export const insertDeliveryTrackingSchema = createInsertSchema(deliveryTracking).pick({
  orderId: true,
  riderId: true,
  latitude: true,
  longitude: true,
  accuracy: true,
  speed: true,
  heading: true,
});

export const insertReviewSchema = createInsertSchema(reviews).pick({
  productId: true,
  orderId: true,
  rating: true,
  comment: true,
  images: true,
  isVerifiedPurchase: true,
});

export const insertRiderReviewSchema = createInsertSchema(riderReviews).pick({
  riderId: true,
  orderId: true,
  rating: true,
  comment: true,
});

export const insertNotificationSchema = createInsertSchema(notifications).pick({
  userId: true,
  type: true,
  title: true,
  message: true,
  metadata: true,
});

export const insertReportActivityLogSchema = createInsertSchema(reportActivityLogs).pick({
  requestedBy: true,
  requesterRole: true,
  reportType: true,
  action: true,
  format: true,
  status: true,
  reportId: true,
  scope: true,
  metadata: true,
});

export const insertSystemActivityLogSchema = createInsertSchema(systemActivityLogs).pick({
  category: true,
  severity: true,
  title: true,
  message: true,
  humanExplanation: true,
  rootCause: true,
  suggestedFix: true,
  preventiveAction: true,
  source: true,
  entityType: true,
  entityId: true,
  actorId: true,
  actorRole: true,
  fingerprint: true,
  occurrenceCount: true,
  isResolved: true,
  firstSeenAt: true,
  lastSeenAt: true,
  resolvedAt: true,
  metadata: true,
});

export const insertReceiptSchema = createInsertSchema(receipts).pick({
  receiptNumber: true,
  orderId: true,
  generatedBy: true,
  generatedByRole: true,
  trigger: true,
  status: true,
  payload: true,
});

export const insertProductVariantSchema = createInsertSchema(productVariants).pick({
  productId: true,
  color: true,
  size: true,
  images: true,
  sku: true,
  image: true,
  stock: true,
  originalStock: true,
  priceAdjustment: true,
});

export const insertHeroBannerSchema = createInsertSchema(heroBanners).pick({
  title: true,
  subtitle: true,
  image: true,
  ctaText: true,
  ctaLink: true,
  storeMode: true,
  isActive: true,
  displayOrder: true,
});

export const insertCouponSchema = createInsertSchema(coupons).pick({
  code: true,
  discountType: true,
  discountValue: true,
  minimumPurchase: true,
  usageLimit: true,
  expiryDate: true,
  isActive: true,
});

export const insertBannerCollectionSchema = createInsertSchema(bannerCollections).pick({
  name: true,
  description: true,
  type: true,
  isActive: true,
});

export const insertMarketplaceBannerSchema = createInsertSchema(marketplaceBanners).pick({
  collectionId: true,
  title: true,
  subtitle: true,
  imageUrl: true,
  productRef: true,
  storeRef: true,
  ctaText: true,
  ctaUrl: true,
  displayOrder: true,
  startAt: true,
  endAt: true,
  isActive: true,
  metadata: true,
});

export const insertFooterPageSchema = createInsertSchema(footerPages).pick({
  title: true,
  slug: true,
  content: true,
  url: true,
  storeMode: true,
  icon: true,
  group: true,
  displayOrder: true,
  isActive: true,
  openInNewTab: true,
});

export const insertAdminWalletTransactionSchema = createInsertSchema(adminWalletTransactions).omit({ id: true, createdAt: true });
export const insertPromotionSchema = createInsertSchema(promotions).omit({ id: true, createdAt: true });
export const insertSubscriptionPlanSchema = createInsertSchema(subscriptionPlans).omit({ id: true, createdAt: true });
export const insertFeaturedListingSchema = createInsertSchema(featuredListings).omit({ id: true, createdAt: true });
export const insertWishlistsSchema = createInsertSchema(wishlists).omit({ id: true, addedAt: true });
export const insertProductMediaSchema = createInsertSchema(productMedia).omit({ id: true, createdAt: true });
export const insertCurrencyRateSchema = createInsertSchema(currencyRates).omit({ id: true, lastUpdated: true });
export const insertDeliveryAssignmentSchema = createInsertSchema(deliveryAssignments).omit({ id: true, assignedAt: true });
export const insertLocalizationStringSchema = createInsertSchema(localizationStrings).omit({ id: true, createdAt: true });
export const insertSecuritySettingSchema = createInsertSchema(securitySettings).omit({ id: true, createdAt: true, updatedAt: true });

// TypeScript types
// Vehicle Info schema for rider onboarding
export const vehicleInfoSchema = z.object({
  type: z.string(),
  plateNumber: z.string().optional(),
  license: z.string().optional(),
  color: z.string().optional()
});

export type VehicleInfo = z.infer<typeof vehicleInfoSchema>;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof products.$inferSelect;

export type InsertDeliveryZone = z.infer<typeof insertDeliveryZoneSchema>;
export type DeliveryZone = typeof deliveryZones.$inferSelect;

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

export type OrderItem = typeof orderItems.$inferSelect;

export const insertOrderStatusHistorySchema = createInsertSchema(orderStatusHistory).omit({
  id: true,
  createdAt: true,
});

export type InsertOrderStatusHistory = z.infer<typeof insertOrderStatusHistorySchema>;
export type OrderStatusHistory = typeof orderStatusHistory.$inferSelect;

export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessage = typeof chatMessages.$inferSelect;

export type Transaction = typeof transactions.$inferSelect;

export type PlatformSettings = typeof platformSettings.$inferSelect;

export type Cart = typeof cart.$inferSelect;

export type InsertWishlist = z.infer<typeof insertWishlistSchema>;
export type Wishlist = typeof wishlist.$inferSelect;

export type InsertDeliveryTracking = z.infer<typeof insertDeliveryTrackingSchema>;
export type DeliveryTracking = typeof deliveryTracking.$inferSelect;

export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviews.$inferSelect;

export type InsertRiderReview = z.infer<typeof insertRiderReviewSchema>;
export type RiderReview = typeof riderReviews.$inferSelect;

export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;
export type InsertReportActivityLog = z.infer<typeof insertReportActivityLogSchema>;
export type ReportActivityLog = typeof reportActivityLogs.$inferSelect;
export type InsertSystemActivityLog = z.infer<typeof insertSystemActivityLogSchema>;
export type SystemActivityLog = typeof systemActivityLogs.$inferSelect;
export type InsertReceipt = z.infer<typeof insertReceiptSchema>;
export type Receipt = typeof receipts.$inferSelect;

export const insertSupportConversationSchema = createInsertSchema(supportConversations).pick({
  subject: true,
});

export const insertSupportMessageSchema = createInsertSchema(supportMessages).pick({
  conversationId: true,
  message: true,
});

export type InsertSupportConversation = z.infer<typeof insertSupportConversationSchema>;
export type SupportConversation = typeof supportConversations.$inferSelect;

export type InsertSupportMessage = z.infer<typeof insertSupportMessageSchema>;
export type SupportMessage = typeof supportMessages.$inferSelect;

export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariants.$inferSelect;

export type InsertHeroBanner = z.infer<typeof insertHeroBannerSchema>;
export type HeroBanner = typeof heroBanners.$inferSelect;

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

export type InsertBannerCollection = z.infer<typeof insertBannerCollectionSchema>;
export type BannerCollection = typeof bannerCollections.$inferSelect;

export type InsertMarketplaceBanner = z.infer<typeof insertMarketplaceBannerSchema>;
export type MarketplaceBanner = typeof marketplaceBanners.$inferSelect;

export type InsertFooterPage = z.infer<typeof insertFooterPageSchema>;
export type FooterPage = typeof footerPages.$inferSelect;

export type InsertAdminWalletTransaction = z.infer<typeof insertAdminWalletTransactionSchema>;
export type AdminWalletTransaction = typeof adminWalletTransactions.$inferSelect;

export type InsertPromotion = z.infer<typeof insertPromotionSchema>;
export type Promotion = typeof promotions.$inferSelect;

export type InsertSubscriptionPlan = z.infer<typeof insertSubscriptionPlanSchema>;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export type InsertFeaturedListing = z.infer<typeof insertFeaturedListingSchema>;
export type FeaturedListing = typeof featuredListings.$inferSelect;

export type InsertWishlists = z.infer<typeof insertWishlistsSchema>;
export type Wishlists = typeof wishlists.$inferSelect;

export type InsertProductMedia = z.infer<typeof insertProductMediaSchema>;
export type ProductMedia = typeof productMedia.$inferSelect;

export type InsertCurrencyRate = z.infer<typeof insertCurrencyRateSchema>;
export type CurrencyRate = typeof currencyRates.$inferSelect;

export type InsertDeliveryAssignment = z.infer<typeof insertDeliveryAssignmentSchema>;
export type DeliveryAssignment = typeof deliveryAssignments.$inferSelect;

export type InsertLocalizationString = z.infer<typeof insertLocalizationStringSchema>;
export type LocalizationString = typeof localizationStrings.$inferSelect;

export type InsertSecuritySetting = z.infer<typeof insertSecuritySettingSchema>;
export type SecuritySetting = typeof securitySettings.$inferSelect;

// Media Library for storing reusable images (banners, categories, logos, products)
export const mediaLibrary = pgTable("media_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  url: text("url").notNull(),
  category: mediaCategoryEnum("category").notNull(),
  uploaderRole: userRoleEnum("uploader_role").notNull(),
  uploaderId: varchar("uploader_id").references(() => users.id),
  filename: text("filename").notNull(),
  altText: text("alt_text"),
  tags: text("tags").array(),
  isTemporary: boolean("is_temporary").default(true), // hardcoded images are temporary
  createdAt: timestamp("created_at").defaultNow(),
});

// Category Fields for dynamic admin-created categories
export const categoryFields = pgTable("category_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  categoryName: text("category_name").notNull(),
  fieldName: text("field_name").notNull(),
  fieldType: text("field_type").notNull(), // text, number, dropdown, multiselect, table
  fieldOptions: jsonb("field_options").$type<Array<string>>(), // For dropdown/multiselect
  isRequired: boolean("is_required").default(false),
  displayOrder: integer("display_order").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

// Role Feature Permissions - Controls which features are enabled for each user role
export const roleFeatures = pgTable("role_features", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  role: userRoleEnum("role").notNull().unique(),
  features: jsonb("features").$type<Record<string, boolean>>().notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: varchar("updated_by").references(() => users.id),
});

export const insertMediaLibrarySchema = createInsertSchema(mediaLibrary).omit({ id: true, createdAt: true });
export type InsertMediaLibrary = z.infer<typeof insertMediaLibrarySchema>;
export type MediaLibrary = typeof mediaLibrary.$inferSelect;

export const insertCategoryFieldSchema = createInsertSchema(categoryFields).omit({ id: true, createdAt: true });
export type InsertCategoryField = z.infer<typeof insertCategoryFieldSchema>;
export type CategoryField = typeof categoryFields.$inferSelect;

// Commission System Schemas
export const insertCommissionSchema = createInsertSchema(commissions).omit({ id: true, createdAt: true });
export type InsertCommission = z.infer<typeof insertCommissionSchema>;
export type Commission = typeof commissions.$inferSelect;

export const insertSellerPayoutSchema = createInsertSchema(sellerPayouts).omit({ id: true, createdAt: true });
export type InsertSellerPayout = z.infer<typeof insertSellerPayoutSchema>;
export type SellerPayout = typeof sellerPayouts.$inferSelect;

export const insertRiderPayoutSchema = createInsertSchema(riderPayouts).omit({ id: true, createdAt: true });
export type InsertRiderPayout = z.infer<typeof insertRiderPayoutSchema>;
export type RiderPayout = typeof riderPayouts.$inferSelect;

export const insertPlatformEarningSchema = createInsertSchema(platformEarnings).omit({ id: true, createdAt: true });
export type InsertPlatformEarning = z.infer<typeof insertPlatformEarningSchema>;
export type PlatformEarning = typeof platformEarnings.$inferSelect;

// Store schema
export const insertStoreSchema = createInsertSchema(stores).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStore = z.infer<typeof insertStoreSchema>;
export type Store = typeof stores.$inferSelect;

// Category schema
export const insertCategorySchema = createInsertSchema(categories).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCategory = z.infer<typeof insertCategorySchema>;
export type Category = typeof categories.$inferSelect;

// Role Features schema
export const insertRoleFeaturesSchema = createInsertSchema(roleFeatures).omit({ id: true, updatedAt: true });
export type InsertRoleFeatures = z.infer<typeof insertRoleFeaturesSchema>;
export type RoleFeatures = typeof roleFeatures.$inferSelect;

// Promotion Pricing schema
export const insertPromotionPricingSchema = createInsertSchema(promotionPricing).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPromotionPricing = z.infer<typeof insertPromotionPricingSchema>;
export type PromotionPricing = typeof promotionPricing.$inferSelect;
export const insertPromotionApplicationSchema = createInsertSchema(promotionApplications).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPromotionApplication = z.infer<typeof insertPromotionApplicationSchema>;
export type PromotionApplication = typeof promotionApplications.$inferSelect;
