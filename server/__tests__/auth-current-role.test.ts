/**
 * Regression tests for database-backed role verification.
 * Run: SESSION_SECRET=testsecret DATABASE_URL=<test db url> npx tsx server/__tests__/auth-current-role.test.ts
 * This stubs the read-only user lookup and never writes to a database.
 */
import assert from "node:assert/strict";

process.env.SESSION_SECRET ||= "testsecret";

async function run() {
  const { storage } = await import("../storage");
  const { generateToken, requireAuth, requirePermission } = await import("../auth");

  const originalGetUser = storage.getUser.bind(storage);
  const userId = "user-role-refresh-test";
  const makeRes = () => ({
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; },
  });

  try {
    const token = generateToken({ id: userId, email: "example@invalid.test", role: "super_admin" } as any);
    let currentRole = "buyer";
    let isActive = true;
    (storage as any).getUser = async (id: string) =>
      id === userId ? { id, email: "example@invalid.test", role: currentRole, isActive } : undefined;

    const req: any = { cookies: { token }, headers: {} };
    let res = makeRes();
    let continued = false;
    await requireAuth(req, res as any, () => { continued = true; });
    assert.equal(continued, true);
    assert.equal(req.user.role, "buyer", "Old super_admin JWT must not elevate a demoted buyer");

    res = makeRes();
    continued = false;
    await requirePermission("manage_users")(req, res as any, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(res.statusCode, 403);

    currentRole = "super_admin";
    res = makeRes();
    continued = false;
    await requireAuth(req, res as any, () => { continued = true; });
    assert.equal(continued, true);
    res = makeRes();
    continued = false;
    await requirePermission("manage_users")(req, res as any, () => { continued = true; });
    assert.equal(continued, true, "Verified super_admin must retain dashboard permissions");

    isActive = false;
    res = makeRes();
    continued = false;
    await requireAuth(req, res as any, () => { continued = true; });
    assert.equal(continued, false);
    assert.equal(res.statusCode, 401, "Inactive super_admin must not retain access");

    // Suspension must never grant broad access merely because role = seller/rider.
    currentRole = "seller";
    const suspendedReq: any = {
      cookies: { token },
      headers: {},
      method: "GET",
      path: "/api/seller/message-contacts",
    };
    res = makeRes();
    continued = false;
    await requireAuth(suspendedReq, res as any, () => { continued = true; });
    assert.equal(continued, true, "Suspended seller should retain limited message contacts access");
    assert.equal(suspendedReq.user.role, "seller");

    suspendedReq.path = "/api/orders";
    res = makeRes();
    continued = false;
    await requireAuth(suspendedReq, res as any, () => { continued = true; });
    assert.equal(continued, false, "Suspended seller must not access ordinary routes");
    assert.equal(res.statusCode, 401);

    suspendedReq.path = "/api/seller/message-contacts";
    suspendedReq.method = "POST";
    res = makeRes();
    continued = false;
    await requireAuth(suspendedReq, res as any, () => { continued = true; });
    assert.equal(continued, false, "Suspended seller must not write through the read-only exception");
    assert.equal(res.statusCode, 401);

    currentRole = "rider";
    suspendedReq.method = "GET";
    suspendedReq.path = "/api/rider/message-contacts";
    res = makeRes();
    continued = false;
    await requireAuth(suspendedReq, res as any, () => { continued = true; });
    assert.equal(continued, true, "Suspended rider should retain limited message contacts access");

    suspendedReq.path = "/api/seller/message-contacts";
    res = makeRes();
    continued = false;
    await requireAuth(suspendedReq, res as any, () => { continued = true; });
    assert.equal(continued, false, "Rider may not borrow the seller exception");
    assert.equal(res.statusCode, 401);

    console.log("auth-current-role.test passed");
  } finally {
    (storage as any).getUser = originalGetUser;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
