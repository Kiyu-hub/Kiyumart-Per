// Ensure SESSION_SECRET exists before importing auth utilities
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

import express from 'express';
import cookieParser from 'cookie-parser';
// use global fetch available in Node 18+
import { registerRoutes } from '../routes';
import * as storageModule from '../storage';
import { generateToken } from '../auth';

async function run() {
  if (process.env.RUN_PAYSTACK_INTEGRATION !== 'true') {
    console.log('Skipping integration test; set RUN_PAYSTACK_INTEGRATION=true to run');
    return;
  }
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

  // Prepare fake storage behaviors
  const calls: string[] = [];

  // Minimal platform settings with single-store enabled
  storageModule.storage.getPlatformSettings = async () => ({ isMultiVendor: false, primaryStoreId: 'store1', paystackSecretKey: 'sk_test', defaultCommissionRate: '10' } as any);

  storageModule.storage.getStore = async (id: string) => ({ id: 'store1', primarySellerId: 'seller1', name: 'Primary Store', paystackSubaccountId: 'sub_123', isPayoutVerified: true } as any);

  // Existing order for single-vendor purchase
  // Order total includes processing fee (e.g., product 100 + processing 5 = 105)
  const order = { id: 'order1', buyerId: 'u1', orderNumber: 'ORD-1', total: '105.00', processingFee: '5.00', currency: 'GHS', storeId: 'store1', sellerId: 'seller1' } as any;
  storageModule.storage.getOrder = async (id: string) => id === 'order1' ? order : undefined;

  storageModule.storage.updateOrder = async (id: string, data: any) => { calls.push(`updateOrder:${id}`); Object.assign(order, data); return order; };
  storageModule.storage.createTransaction = async (t: any) => { calls.push('createTransaction'); return t; };
  storageModule.storage.getTransactionByReference = async (ref: string) => null;
  storageModule.storage.createCommissionWithEarning = async (orderId: string) => { calls.push(`commission:${orderId}`); return { commission: {}, earning: {} }; };
  storageModule.storage.createNotification = async (n: any) => { calls.push('notify'); return n; };

  // Mock external Paystack responses by patching global fetch, but delegate localhost calls to real fetch
  const realFetch = (globalThis as any).fetch.bind(globalThis);
  (globalThis as any).fetch = async (url: any, opts: any) => {
    if (typeof url === 'string' && url.startsWith('http://localhost')) {
      return realFetch(url, opts);
    }

    if (typeof url === 'string' && url.includes('/transaction/initialize')) {
      // Capture and inspect initialize payload
      try {
        const body = JSON.parse(opts.body as string);
        calls.push(`initialize:transaction_charge=${body.transaction_charge}`);
        if (body.subaccounts && body.subaccounts.length > 0) {
          calls.push(`initialize:subaccount_share=${body.subaccounts[0].share}`);
        }
      } catch (e) {
        // ignore
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: true, data: { authorization_url: 'https://paystack/checkout', reference: 'mock-ref' } })
      } as any;
    }
    if (typeof url === 'string' && url.includes('/transaction/verify/mock-ref')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: true, data: { status: 'success', amount: 1000, currency: 'GHS', reference: 'mock-ref', metadata: { orderId: 'order1', userId: 'u1' } } })
      } as any;
    }
    return { ok: false, status: 502, json: async () => ({}) } as any;
  };

  // Start server
  const app = express();
  app.use(express.json({ verify: (req: any, _res: any, buf: any) => { req.rawBody = buf; } }));
  app.use(cookieParser());

  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  // @ts-ignore
  const port = (server.address() as any).port;

  // Generate auth token for user u1
  const token = generateToken({ id: 'u1', email: 'u1@example.com', role: 'buyer' });

  // Call initialize
  const initResp = await fetch(`http://localhost:${port}/api/payments/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ orderId: 'order1' })
  });
  const initJson = await initResp.json();
  console.log('initialize status', initResp.status, 'body', initJson);
  if (!initJson || (!initJson.reference && !initJson.authorization_url)) {
    throw new Error(`Initialize failed: ${JSON.stringify(initJson)}`);
  }

  // Call verify endpoint (server will call mocked Paystack verify)
  const verifyResp = await fetch(`http://localhost:${port}/api/payments/verify/mock-ref`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` }
  });
  const verifyJson = await verifyResp.json();

  // Assertions
  if (!calls.includes('createTransaction')) throw new Error('Transaction not created');
  if (!calls.some(c => c.startsWith('updateOrder:'))) throw new Error('Order not updated');
  if (!calls.some(c => c.startsWith('commission:'))) throw new Error('Commission not calculated');

  // Validate processing fee passed to Paystack (in kobo) and subaccount share reflects amount excluding processing fee and commission
  if (!calls.some(c => c.startsWith('initialize:transaction_charge=500'))) throw new Error('Processing fee not passed correctly to Paystack (expected 500 kobo)');
  if (!calls.some(c => c.startsWith('initialize:subaccount_share=9000'))) throw new Error('Subaccount share calculation is incorrect (expected 9000 kobo)');

  console.log('✅ paystack-integration.test passed');

  server.close();
}

run().catch(err => { console.error('❌ integration test failed', err); throw err; });
