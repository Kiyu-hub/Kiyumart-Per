// KM-006f — Super Admin keeps complete seller store data; ordinary admins never
// get identity documents and get payout details only with the view-payouts
// permission. Fake records only (no database; permission lookup fails closed).
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";

import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../routes";
import * as storageModule from "../storage";
import { generateToken } from "../auth";
import { toAdminStoreView } from "../publicStore";

let failures = 0;
const check = (ok: boolean, msg: string) => { if (ok) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`); } };

const fakeStore = {
  id: "st1", name: "Test Store", primarySellerId: "seller1", verificationStatus: "pending",
  payoutDetails: { accountNumber: "TEST-ACCT-0000" }, paystackSubaccountId: "ACCT_TEST0000",
  verificationDocFront: "https://example.invalid/front.jpg", verificationDocBack: "https://example.invalid/back.jpg",
  verificationSelfie: "https://example.invalid/selfie.jpg",
};
const users: Record<string, any> = {
  super1: { id: "super1", email: "s@example.invalid", role: "super_admin", isApproved: true, isActive: true },
  admin1: { id: "admin1", email: "a@example.invalid", role: "admin", isApproved: true, isActive: true },
  seller1: { id: "seller1", email: "x@example.invalid", role: "seller", isApproved: true, isActive: true },
};

async function run() {
  console.log("toAdminStoreView");
  const full = toAdminStoreView(fakeStore, { isSuperAdmin: true, canViewPayouts: true });
  check(full === fakeStore, "super_admin receives the complete record");
  const withPayouts = toAdminStoreView(fakeStore, { isSuperAdmin: false, canViewPayouts: true })!;
  check(!("verificationDocFront" in withPayouts) && !("verificationSelfie" in withPayouts), "admin never receives ID documents");
  check("payoutDetails" in withPayouts, "admin with view-payouts receives payout details");
  const noPayouts = toAdminStoreView(fakeStore, { isSuperAdmin: false, canViewPayouts: false })!;
  check(!("payoutDetails" in noPayouts) && !("paystackSubaccountId" in noPayouts), "admin without view-payouts receives no payout details");
  check(noPayouts.name === "Test Store", "ordinary store fields kept");
  check("verificationDocFront" in fakeStore, "input not mutated");

  const s: any = storageModule.storage;
  s.getUser = async (id: string) => users[id];
  s.getVerificationApplications = async () => [fakeStore];
  const app = express(); app.use(express.json()); app.use(cookieParser());
  const server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}`;
  const auth = (id: string) => ({ Authorization: `Bearer ${generateToken({ id, email: users[id].email, role: users[id].role } as any)}` });
  try {
    console.log("GET /api/admin/verification/applications");
    let r = await fetch(`${base}/api/admin/verification/applications`, { headers: auth("super1") });
    let body: any = await r.json();
    check(r.status === 200 && body[0]?.verificationDocFront && body[0]?.payoutDetails, "super_admin sees documents and payout details");
    r = await fetch(`${base}/api/admin/verification/applications`, { headers: auth("admin1") });
    body = await r.json();
    check(r.status === 200 && body[0]?.name === "Test Store", "admin still sees the application list");
    check(!body[0]?.verificationDocFront && !body[0]?.verificationSelfie, "admin does not see ID documents");
    r = await fetch(`${base}/api/admin/verification/applications`, { headers: auth("seller1") });
    check(r.status === 403, `seller blocked (${r.status})`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
  if (failures) throw new Error(`${failures} check(s) failed`);
  console.log("✅ admin-store-data-access.test passed");
  process.exit(0);
}
run().catch((e) => { console.error("❌ admin-store-data-access.test failed", e); process.exit(1); });
