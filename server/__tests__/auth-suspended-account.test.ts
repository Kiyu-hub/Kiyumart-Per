// Suspended or deleted accounts lose access immediately on routes protected only
// by requireAuth (e.g. cart), instead of when their 7-day token expires.
// Fake records only (no database).
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";

import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../routes";
import * as storageModule from "../storage";
import { generateToken } from "../auth";

let failures = 0;
const check = (ok: boolean, msg: string) => { if (ok) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`); } };

const users: Record<string, any> = {
  active: { id: "active", email: "a@example.invalid", role: "buyer", isApproved: true, isActive: true },
  suspended: { id: "suspended", email: "s@example.invalid", role: "buyer", isApproved: true, isActive: false },
  sellerSuspended: { id: "sellerSuspended", email: "x@example.invalid", role: "seller", isApproved: true, isActive: false },
};

async function run() {
  const s: any = storageModule.storage;
  s.getUser = async (id: string) => users[id];
  s.getCart = async () => [];
  const app = express(); app.use(express.json()); app.use(cookieParser());
  const server = await registerRoutes(app);
  await new Promise<void>((r) => server.listen(0, r));
  const base = `http://localhost:${(server.address() as any).port}`;
  const tokenFor = (id: string, role = "buyer") => ({ Authorization: `Bearer ${generateToken({ id, email: `${id}@example.invalid`, role } as any)}` });
  try {
    let r = await fetch(`${base}/api/cart`, { headers: tokenFor("active") });
    check(r.status === 200, `active buyer can use the cart (${r.status})`);
    r = await fetch(`${base}/api/cart`, { headers: tokenFor("suspended") });
    const body: any = await r.json().catch(() => ({}));
    check(r.status === 403 && body.code === "ACCOUNT_SUSPENDED", `suspended buyer blocked immediately (${r.status})`);
    r = await fetch(`${base}/api/cart`, { headers: tokenFor("deleted-user") });
    check(r.status === 401, `deleted account blocked (${r.status})`);
    r = await fetch(`${base}/api/cart`, { headers: tokenFor("sellerSuspended", "seller") });
    check(r.status !== 401 && r.status !== 403, `suspended seller keeps the limited access role rules allow (${r.status})`);
    r = await fetch(`${base}/api/cart`);
    check(r.status === 401, `no token still 401 (${r.status})`);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
  if (failures) throw new Error(`${failures} check(s) failed`);
  console.log("✅ auth-suspended-account.test passed");
  process.exit(0);
}
run().catch((e) => { console.error("❌ auth-suspended-account.test failed", e); process.exit(1); });
