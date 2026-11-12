import { pgTable, varchar, text, integer, timestamp, boolean, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { stores, users } from "./schema";

/** Fashion service privileges are separate from marketplace seller privileges. */
export const fashionServiceApplications = pgTable("fashion_service_applications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").notNull().references(() => stores.id).unique(),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"),
  headline: text("headline").notNull(),
  bio: text("bio").notNull(),
  specialties: text("specialties").array().notNull(),
  coverageAreas: text("coverage_areas").array().notNull().default(sql`ARRAY[]::text[]`),
  languages: text("languages").array().notNull().default(sql`ARRAY[]::text[]`),
  portfolioUrls: text("portfolio_urls").array().notNull().default(sql`ARRAY[]::text[]`),
  /** Private: only the applicant and Super Admin may view verification evidence. */
  evidenceUrls: text("evidence_urls").array().notNull().default(sql`ARRAY[]::text[]`),
  experienceYears: integer("experience_years"),
  availability: jsonb("availability").$type<{ days: number[]; advanceDays: number; paused: boolean }>().notNull().default({ days: [1,2,3,4,5,6], advanceDays: 30, paused: false }),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewedAt: timestamp("reviewed_at"),
  reviewNote: text("review_note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => ({ sellerIdx: index("fashion_application_seller_idx").on(t.sellerId) }));

export const fashionServiceOfferings = pgTable("fashion_service_offerings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  storeId: varchar("store_id").notNull().references(() => stores.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  title: text("title").notNull(),
  serviceType: text("service_type").notNull(),
  description: text("description").notNull(),
  startingPricePesewas: integer("starting_price_pesewas").notNull(),
  turnaroundDays: integer("turnaround_days").notNull().default(7),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, t=>({storeIdx:index("fashion_offerings_store_idx").on(t.storeId)}));

export const fashionServiceRequests = pgTable("fashion_service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  referenceCode: text("reference_code").notNull().unique(),
  storeId: varchar("store_id").notNull().references(() => stores.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  offeringId: varchar("offering_id").references(() => fashionServiceOfferings.id),
  serviceTitle: text("service_title").notNull(),
  description: text("description").notNull(),
  referenceImages: text("reference_images").array().notNull().default(sql`ARRAY[]::text[]`),
  preferredDate: timestamp("preferred_date"),
  fittingMethod: text("fitting_method").notNull().default("discuss"),
  customerLocation: text("customer_location"),
  status: text("status").notNull().default("pending"),
  quotePesewas: integer("quote_pesewas"),
  depositPercent: integer("deposit_percent"),
  quoteExpiresAt: timestamp("quote_expires_at"),
  paidPesewas: integer("paid_pesewas").notNull().default(0),
  deliveryMethod: text("delivery_method"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
},t=>({
  buyerIdx:index("fashion_requests_buyer_idx").on(t.buyerId),
  sellerIdx:index("fashion_requests_seller_idx").on(t.sellerId),
  storeIdx:index("fashion_requests_store_idx").on(t.storeId),
}));

export const fashionServiceMessages = pgTable("fashion_service_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => fashionServiceRequests.id),
  senderId: varchar("sender_id").notNull().references(() => users.id),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},t=>({requestIdx:index("fashion_messages_request_idx").on(t.requestId)}));

export const fashionServicePayments = pgTable("fashion_service_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => fashionServiceRequests.id),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  paystackReference: text("paystack_reference").notNull().unique(),
  amountPesewas: integer("amount_pesewas").notNull(),
  status: text("status").notNull().default("initiated"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},t=>({requestIdx:index("fashion_payments_request_idx").on(t.requestId)}));

export const fashionServiceReviews = pgTable("fashion_service_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: varchar("request_id").notNull().references(() => fashionServiceRequests.id).unique(),
  buyerId: varchar("buyer_id").notNull().references(() => users.id),
  sellerId: varchar("seller_id").notNull().references(() => users.id),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
},t=>({sellerIdx:index("fashion_reviews_seller_idx").on(t.sellerId)}));

export type FashionApplication = typeof fashionServiceApplications.$inferSelect;
export type FashionOffering = typeof fashionServiceOfferings.$inferSelect;
export type FashionRequest = typeof fashionServiceRequests.$inferSelect;
