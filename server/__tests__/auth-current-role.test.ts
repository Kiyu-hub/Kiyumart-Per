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

    console.log("auth-current-role.test passed");
  } finally {
    (storage as any).getUser = originalGetUser;
  }
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
