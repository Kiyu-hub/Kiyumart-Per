// KM-006 — Public store endpoints must return allowlisted public fields only,
// while protected Super Admin / seller endpoints keep their access.
// Uses FAKE fixtures only (no database, no real seller data).
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";

import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../routes";
import * as storageModule from "../storage";
import { generateToken } from "../auth";
import { toPublicStore, toPublicStores, PUBLIC_STORE_FIELDS } from "../publicStore";

const SENSITIVE_FIELDS = [
  "payoutDetails",
  "payoutType",
  "isPayoutVerified",
  "paystackSubaccountId",
  "verificationDocFront",
  "verificationDocBack",
  "verificationSelfie",
  "verificationRejectionReason",
  "verificationAppliedAt",
  "verificationReviewedAt",
  "futurePrivateColumn",
];

const PUBLIC_EXPECTED = [
  "id",
  "primarySellerId",
  "name",
  "description",
  "logo",
  "banner",
  "storeType",
  "businessType",
  "merchantCategory",
  "brandingConfig",
  "socialLinks",
  "location",
  "isActive",
  "isApproved",
  "verificationStatus",
];

function fakeStore(id: string, sellerId: string, extra: Record<string, any> = {}) {
  return {
    id,
    primarySellerId: sellerId,
    name: `Test Store ${id}`,
    description: "Fake store for tests",
    logo: "https://example.invalid/logo.png",
    banner: "https://example.invalid/banner.png",
    category: "clothing",
    storeType: "clothing",
    storeTypeMetadata: {},
    businessType: "store",
    merchantCategory: "RETAIL_BOUTIQUE",
    brandingConfig: { primaryColor: "#009688" },
    socialLinks: { instagram: "https://example.invalid/ig" },
    whatsappNumber: null,
    location: "Accra",
    latitude: "5.6000000",
    longitude: "-0.1800000",
    prepTimeMins: 15,
    minOrderAmount: "0",
    isActive: true,
    isApproved: true,
    verificationStatus: "approved",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    // Sensitive fake values — must never appear in public responses
    paystackSubaccountId: "ACCT_TEST0000",
    payoutType: "bank_account",
    payoutDetails: { accountName: "TEST NAME", accountNumber: "TEST-ACCT-0000", bankCode: "000", bankName: "Test Bank" },
    isPayoutVerified: true,
    verificationDocFront: "https://example.invalid/doc-front.jpg",
    verificationDocBack: "https://example.invalid/doc-back.jpg",
    verificationSelfie: "https://example.invalid/selfie.jpg",
    verificationRejectionReason: "test reason",
    verificationAppliedAt: new Date("2026-01-02T00:00:00Z"),
    verificationReviewedAt: new Date("2026-01-03T00:00:00Z"),
    futurePrivateColumn: "a column added later must stay private",
    ...extra,
  };
}

let failures = 0;
function check(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${message}`);
  }
}

function assertPublicShape(label: string, body: any) {
  for (const field of PUBLIC_EXPECTED) {
    check(Object.prototype.hasOwnProperty.call(body, field), `${label}: public field "${field}" present`);
  }
  for (const field of SENSITIVE_FIELDS) {
    check(!Object.prototype.hasOwnProperty.call(body, field), `${label}: sensitive field "${field}" absent`);
  }
  const serialized = JSON.stringify(body);
  check(!serialized.includes("TEST-ACCT-0000"), `${label}: no account number anywhere in body`);
  check(!serialized.includes("example.invalid/doc-"), `${label}: no identity document URL anywhere in body`);
  check(!serialized.includes("example.invalid/selfie"), `${label}: no selfie URL anywhere in body`);
  check(!serialized.includes("ACCT_TEST0000"), `${label}: no Paystack subaccount anywhere in body`);
}

async function run() {
  // ── Unit: helper behaviour ─────────────────────────────────────────────
  console.log("toPublicStore helper");
  const input = fakeStore("s1", "seller1");
  const snapshot = JSON.stringify(input);
  const pub = toPublicStore(input)!;
  assertPublicShape("helper", pub);
  check(JSON.stringify(input) === snapshot, "helper does not mutate its input");
  check(toPublicStore(null) === null && toPublicStore(undefined) === null, "helper handles null/undefined");
  check(Array.isArray(toPublicStores(null as any)) && toPublicStores(null as any).length === 0, "list helper handles null");
  check(!(PUBLIC_STORE_FIELDS as readonly string[]).some((f) => SENSITIVE_FIELDS.includes(f)), "allowlist contains no sensitive field");

  // ── Route-level: stub storage with fake records ─────────────────────────
  const stores = [
    fakeStore("store1", "seller1", { sellerName: "Seller One", averageRating: "4.50", totalOrders: 3, productCount: 7 }),
    fakeStore("store2", "seller2", { isApproved: false, sellerName: "Seller Two", averageRating: "0", totalOrders: 0, productCount: 0 }),
  ];
  const usersById: Record<string, any> = {
    seller1: { id: "seller1", email: "seller1@example.invalid", role: "seller", isApproved: true, isActive: true, profileImage: "https://example.invalid/p1.png" },
    seller2: { id: "seller2", email: "seller2@example.invalid", role: "seller", isApproved: true, isActive: true, profileImage: null },
    buyer1: { id: "buyer1", email: "buyer1@example.invalid", role: "buyer", isApproved: true, isActive: true },
    super1: { id: "super1", email: "super1@example.invalid", role: "super_admin", isApproved: true, isActive: true },
  };

  const s: any = storageModule.storage;
  s.getStores = async (filters?: { isActive?: boolean; isApproved?: boolean }) =>
    stores.filter((st) =>
      (filters?.isActive === undefined || st.isActive === filters.isActive) &&
      (filters?.isApproved === undefined || st.isApproved === filters.isApproved),
    );
  s.getStore = async (id: string) => stores.find((st) => st.id === id);
  s.getStoreByPrimarySeller = async (sellerId: string) => stores.find((st) => st.primarySellerId === sellerId);
  s.getUser = async (id: string) => usersById[id];
  s.ensureStoreForSeller = async (sellerId: string) => stores.find((st) => st.primarySellerId === sellerId);

  // Block any accidental outbound network call during the test
  const realFetch = (globalThis as any).fetch.bind(globalThis);
  (globalThis as any).fetch = async (url: any, opts: any) => {
    if (typeof url === "string" && url.startsWith("http://localhost")) return realFetch(url, opts);
    return { ok: false, status: 599, json: async () => ({}) } as any;
  };

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://localhost:${port}`;
  const auth = (id: string) => ({
    Authorization: `Bearer ${generateToken({ id, email: usersById[id].email, role: usersById[id].role } as any)}`,
  });

  try {
    console.log("GET /api/stores (public list)");
    let r = await fetch(`${base}/api/stores`);
    let body: any = await r.json();
    check(r.status === 200 && Array.isArray(body) && body.length === 2, "returns 200 with both fake stores (visibility unchanged)");
    body.forEach((st: any, i: number) => assertPublicShape(`list[${i}]`, st));
    check(body[0].sellerName === "Seller One" && body[0].productCount === 7 && body[0].averageRating === "4.50", "list keeps derived public fields");

    r = await fetch(`${base}/api/stores?isActive=true&isApproved=true`);
    body = await r.json();
    check(r.status === 200 && body.length === 1 && body[0].id === "store1", "list filters still work");

    console.log("GET /api/stores/:id (public detail)");
    r = await fetch(`${base}/api/stores/store1`);
    body = await r.json();
    check(r.status === 200, "returns 200");
    assertPublicShape("detail", body);
    check(body.sellerProfileImage === "https://example.invalid/p1.png", "detail keeps sellerProfileImage");
    r = await fetch(`${base}/api/stores/missing`);
    check(r.status === 404, "unknown store still returns 404");

    console.log("GET /api/stores/by-seller/:sellerId (public)");
    r = await fetch(`${base}/api/stores/by-seller/seller1`);
    body = await r.json();
    check(r.status === 200, "returns 200");
    assertPublicShape("by-seller", body);

    console.log("Public response is identical for privileged callers (no role-based leakage)");
    r = await fetch(`${base}/api/stores/store1`, { headers: auth("super1") });
    body = await r.json();
    assertPublicShape("detail as super_admin", body);

    console.log("Seller keeps access to own full record via protected /api/stores/my-store");
    r = await fetch(`${base}/api/stores/my-store`, { headers: auth("seller1") });
    body = await r.json();
    check(r.status === 200 && body.id === "store1", "seller receives own store");
    check(body.payoutDetails?.accountNumber === "TEST-ACCT-0000", "seller's own payout details still available");
    r = await fetch(`${base}/api/stores/my-store`, { headers: auth("buyer1") });
    check(r.status === 403, "buyer cannot use /api/stores/my-store (403)");
    r = await fetch(`${base}/api/stores/my-store`);
    check(r.status === 401, "anonymous cannot use /api/stores/my-store (401)");

    console.log("Protected admin store dashboard gates unchanged");
    r = await fetch(`${base}/api/admin/stores/store1/dashboard`);
    check(r.status === 401, "anonymous blocked (401)");
    r = await fetch(`${base}/api/admin/stores/store1/dashboard`, { headers: auth("buyer1") });
    check(r.status === 403, "buyer blocked (403)");
    r = await fetch(`${base}/api/admin/stores/store1/dashboard`, { headers: auth("seller1") });
    check(r.status === 403, "seller blocked (403)");
    // Unknown id: a 404 proves super_admin passed every auth/permission gate and reached the handler.
    r = await fetch(`${base}/api/admin/stores/missing/dashboard`, { headers: auth("super1") });
    check(r.status === 404, "super_admin passes all gates and reaches the handler (404 for unknown store)");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (failures > 0) {
    throw new Error(`${failures} check(s) failed`);
  }
  console.log("✅ public-store-fields.test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error("❌ public-store-fields.test failed", err);
  process.exit(1);
});
