import { requirePermissionIfAdmin } from "../auth";

async function run() {
  const middleware = requirePermissionIfAdmin("manage_products");

  // Non-admin users should bypass admin permission check.
  let nextCalled = false;
  const sellerReq: any = { user: { id: "u1", role: "seller" } };
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: any) {
      this.body = payload;
      return this;
    },
  };
  middleware(sellerReq, res, () => {
    nextCalled = true;
  });

  if (!nextCalled) {
    throw new Error("Expected next() to be called for seller");
  }

  // Missing user should return 401.
  nextCalled = false;
  const anonReq: any = {};
  middleware(anonReq, res, () => {
    nextCalled = true;
  });

  if (nextCalled) {
    throw new Error("Did not expect next() for unauthenticated request");
  }
  if (res.statusCode !== 401) {
    throw new Error(`Expected 401, got ${res.statusCode}`);
  }

  console.log("✅ auth-permission-if-admin.test passed");
}

run().catch((err) => {
  console.error("❌ auth-permission-if-admin.test failed", err);
  throw err;
});
