import express from "express";
import cookieParser from "cookie-parser";
import { registerRoutes } from "../server/routes";

type CheckResult = { name: string; pass: boolean; detail: string };

async function run() {
  process.env.NODE_ENV = "development";
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || "testsecret";

  const app = express();
  app.use(
    express.json({
      limit: "10mb",
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );
  app.use(cookieParser());

  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;
  const results: CheckResult[] = [];

  const jfetch = async (url: string, init: RequestInit = {}) => {
    const res = await fetch(url, init);
    const text = await res.text();
    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { res, json };
  };

  try {
    // Seed and auth tokens
    const seed = await jfetch(`${base}/api/seed/test-users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    results.push({
      name: "seed_test_users",
      pass: seed.res.ok && seed.json?.success === true,
      detail: seed.res.ok ? "seed endpoint ok" : `status=${seed.res.status}`,
    });

    const superTokenResp = await jfetch(`${base}/api/test/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "superadmin@kiyumart.com" }),
    });
    const buyerTokenResp = await jfetch(`${base}/api/test/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "buyer@kiyumart.com" }),
    });
    const superToken = superTokenResp.json?.token;
    const buyerToken = buyerTokenResp.json?.token;
    results.push({
      name: "token_generation",
      pass: Boolean(superToken && buyerToken),
      detail: `super=${Boolean(superToken)} buyer=${Boolean(buyerToken)}`,
    });

    // Create order
    const productsResp = await jfetch(`${base}/api/products`);
    const product = productsResp.json?.[0];
    if (!product) {
      results.push({
        name: "order_create",
        pass: false,
        detail: "no products available",
      });
    } else {
      const price = Number(product.price || 0);
      const discount = Number(product.discount || 0);
      const subtotal = Number((price * (1 - discount / 100)).toFixed(2));
      const settingsResp = await jfetch(`${base}/api/platform-settings`, {
        headers: { authorization: `Bearer ${superToken}` },
      });
      const feePct = Number(settingsResp.json?.processingFeePercent || 1.95);
      const processingFee = Number((subtotal * (feePct / 100)).toFixed(2));
      const total = Number((subtotal + processingFee).toFixed(2));

      const createOrderResp = await jfetch(`${base}/api/orders`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${buyerToken}`,
        },
        body: JSON.stringify({
          sellerId: product.sellerId,
          deliveryMethod: "rider",
          deliveryAddress: "QA Delivery Compliance Address",
          deliveryCity: "Accra",
          deliveryPhone: "+233500000101",
          deliveryLatitude: "5.6037000",
          deliveryLongitude: "-0.1870000",
          deliveryFee: "0.00",
          subtotal: subtotal.toFixed(2),
          processingFee: processingFee.toFixed(2),
          total: total.toFixed(2),
          currency: "GHS",
          items: [{ productId: product.id, quantity: 1 }],
        }),
      });
      const order = createOrderResp.json;
      results.push({
        name: "order_create",
        pass: createOrderResp.res.ok && Boolean(order?.id),
        detail: createOrderResp.res.ok ? `order=${order.id}` : `status=${createOrderResp.res.status}`,
      });

      if (order?.id) {
        // Payment completion hook (proof without webhook signature flow)
        const payHook = await jfetch(`${base}/api/test/payments/complete`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${superToken}`,
          },
          body: JSON.stringify({ orderId: order.id }),
        });
        const hookPass = payHook.res.ok && payHook.json?.success === true;
        results.push({
          name: "payment_hook_complete",
          pass: hookPass,
          detail: hookPass
            ? `paymentStatus=${payHook.json?.orders?.[0]?.paymentStatus}`
            : `status=${payHook.res.status}`,
        });

        // Payment gated matching started
        const orderAfter = await jfetch(`${base}/api/orders/${order.id}`, {
          headers: { authorization: `Bearer ${buyerToken}` },
        });
        const normalizedStatus = String(orderAfter.json?.status || "").toLowerCase();
        results.push({
          name: "payment_gated_searching_rider",
          pass:
            orderAfter.res.ok &&
            ["searching_rider", "assigned", "processing", "ready", "confirmed"].includes(normalizedStatus),
          detail: `status=${normalizedStatus} payment=${orderAfter.json?.paymentStatus}`,
        });

        // Backend ETA endpoint
        const etaResp = await jfetch(
          `${base}/api/orders/${order.id}/eta?riderLat=5.6041&riderLng=-0.1865`,
          { headers: { authorization: `Bearer ${buyerToken}` } }
        );
        results.push({
          name: "backend_eta_endpoint",
          pass: etaResp.res.ok && etaResp.json?.source === "backend_math" && Number.isFinite(Number(etaResp.json?.etaMinutes)),
          detail: etaResp.res.ok
            ? `eta=${etaResp.json?.etaMinutes} distance=${etaResp.json?.distanceKm} source=${etaResp.json?.source}`
            : `status=${etaResp.res.status}`,
        });
      }
    }

    // System health endpoint
    const healthResp = await jfetch(`${base}/api/admin/system-health`, {
      headers: { authorization: `Bearer ${superToken}` },
    });
    results.push({
      name: "system_health_endpoint",
      pass: healthResp.res.ok && healthResp.json?.pipeline && healthResp.json?.assignment && healthResp.json?.tracking,
      detail: healthResp.res.ok ? "pipeline/assignment/tracking present" : `status=${healthResp.res.status}`,
    });

    // Revenue view endpoints
    const revSummary = await jfetch(`${base}/api/admin/revenue/views/summary`, {
      headers: { authorization: `Bearer ${superToken}` },
    });
    const revPayments = await jfetch(`${base}/api/admin/revenue/views/order-payments?limit=10`, {
      headers: { authorization: `Bearer ${superToken}` },
    });
    results.push({
      name: "revenue_view_endpoints",
      pass: revSummary.res.ok && revPayments.res.ok,
      detail: `summary=${revSummary.res.status} orderPayments=${revPayments.res.status}`,
    });
  } finally {
    server.close();
  }

  const failed = results.filter((r) => !r.pass);
  for (const r of results) {
    console.log(`${r.pass ? "PASS" : "FAIL"} ${r.name} :: ${r.detail}`);
  }
  if (failed.length > 0) {
    throw new Error(`Compliance QA failed for ${failed.length} checks`);
  }
  console.log("PASS qa_delivery_compliance");
}

run().catch((err) => {
  console.error("FAIL qa_delivery_compliance", err);
  process.exit(1);
});
