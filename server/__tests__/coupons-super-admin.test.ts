// Super Admin can oversee every coupon; sellers keep seeing/editing only their
// own; buyers and anonymous visitors are blocked. Fake records only (no database).
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";

import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../routes";
import * as storageModule from "../storage";
import { generateToken } from "../auth";

const users: Record<string, any> = {
  super1: { id: "super1", email: "super1@example.invalid", role: "super_admin", isApproved: true, isActive: true },
  seller1: { id: "seller1", email: "seller1@example.invalid", role: "seller", isApproved: true, isActive: true },
  seller2: { id: "seller2", email: "seller2@example.invalid", role: "seller", isApproved: true, isActive: true },
  buyer1: { id: "buyer1", email: "buyer1@example.invalid", role: "buyer", isApproved: true, isActive: true },
};
let coupons = [
  { id: "c1", code: "SELLER1", sellerId: "seller1", discountType: "percentage", discountValue: "10", isActive: true, createdAt: new Date() },
  { id: "c2", code: "SELLER2", sellerId: "seller2", discountType: "percentage", discountValue: "15", isActive: true, createdAt: new Date() },
];

let failures = 0;
const check = (ok: boolean, msg: string) => { if (ok) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`); } };

async function run() {
  const s: any = storageModule.storage;
  s.getUser = async (id: string) => users[id];
  s.getCouponsBySeller = async (sellerId: string) => coupons.filter((c) => c.sellerId === sellerId);
  s.getAllCoupons = async () => coupons;
  s.getCoupon = async (id: string) => coupons.find((c) => c.id === id);
  s.updateCoupon = async (id: string, data: any) => { const c = coupons.find((x) => x.id === id); if (c) Object.assign(c, data); return c; };
  s.deleteCoupon = async (id: string) => { coupons = coupons.filter((c) => c.id !== id); return true; };
  s.getRoleFeatures = async () => ({});
  s.getPlatformSettings = async () => ({ roleFeatures: {} });

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}`;
  const auth = (id: string) => ({ "Content-Type": "application/json", Authorization: `Bearer ${generateToken({ id, email: users[id].email, role: users[id].role } as any)}` });

  try {
    console.log("Listing");
    let r = await fetch(`${base}/api/coupons`, { headers: auth("super1") });
    let body: any = await r.json();
    check(r.status === 200 && Array.isArray(body) && body.length === 2, `super_admin sees all coupons (${r.status}, ${Array.isArray(body) ? body.length : JSON.stringify(body)})`);
    r = await fetch(`${base}/api/coupons`, { headers: auth("seller1") });
    body = await r.json();
    check(r.status === 200 && body.length === 1 && body[0].id === "c1", "seller sees only own coupons");
    r = await fetch(`${base}/api/coupons`, { headers: auth("buyer1") });
    check(r.status === 403, `buyer blocked (${r.status})`);
    r = await fetch(`${base}/api/coupons`);
    check(r.status === 401, `anonymous blocked (${r.status})`);

    console.log("View / edit / delete");
    r = await fetch(`${base}/api/coupons/c2`, { headers: auth("super1") });
    check(r.status === 200, `super_admin can view another seller's coupon (${r.status})`);
    r = await fetch(`${base}/api/coupons/c2`, { headers: auth("seller1") });
    check(r.status === 403, `seller cannot view another seller's coupon (${r.status})`);
    r = await fetch(`${base}/api/coupons/c2`, { method: "PATCH", headers: auth("seller1"), body: JSON.stringify({ isActive: false }) });
    check(r.status === 403, `seller cannot edit another seller's coupon (${r.status})`);
    r = await fetch(`${base}/api/coupons/c2`, { method: "PATCH", headers: auth("super1"), body: JSON.stringify({ isActive: false }) });
    check(r.status === 200 && coupons.find((c) => c.id === "c2")?.isActive === false, `super_admin can edit any coupon (${r.status})`);
    r = await fetch(`${base}/api/coupons/c2`, { method: "DELETE", headers: auth("seller1") });
    check(r.status === 403, `seller cannot delete another seller's coupon (${r.status})`);
    r = await fetch(`${base}/api/coupons/c2`, { method: "DELETE", headers: auth("super1") });
    check(r.ok && !coupons.some((c) => c.id === "c2"), `super_admin can delete any coupon (${r.status})`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
  if (failures) throw new Error(`${failures} check(s) failed`);
  console.log("✅ coupons-super-admin.test passed");
  process.exit(0);
}
run().catch((e) => { console.error("❌ coupons-super-admin.test failed", e); process.exit(1); });
