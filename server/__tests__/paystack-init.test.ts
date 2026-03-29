// Unit test for payments initialize route using mocked storage and Paystack responses
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import * as storageModule from '../storage';
import { generateToken } from '../auth';
import processPaystackChargeSuccess from '../payments';

async function run() {
  const calls: string[] = [];

  // Mock platform settings
  storageModule.storage.getPlatformSettings = async () => ({ isMultiVendor: false, primaryStoreId: 'store1', paystackSecretKey: 'sk_test', defaultCommissionRate: '10' } as any);

  // Mock store and order
  storageModule.storage.getStore = async (id: string) => ({ id: 'store1', primarySellerId: 'seller1', name: 'Primary Store', paystackSubaccountId: 'sub_123', isPayoutVerified: true, payoutType: 'bank_account', payoutDetails: {} } as any);

  const order = {
    id: 'order1',
    buyerId: 'u1',
    orderNumber: 'ORD-1',
    subtotal: '100.00',
    couponDiscount: '0.00',
    total: '105.00',
    processingFee: '5.00',
    currency: 'GHS',
    storeId: 'store1',
    sellerId: 'seller1',
    paymentStatus: 'pending'
  } as any;
  storageModule.storage.getOrder = async (id: string) => id === 'order1' ? order : undefined;

  storageModule.storage.updateOrder = async (id: string, data: any) => { calls.push(`updateOrder:${id}`); Object.assign(order, data); return order; };
  storageModule.storage.createTransaction = async (t: any) => { calls.push('createTransaction'); return t; };
  storageModule.storage.getTransactionByReference = async (ref: string) => null;
  storageModule.storage.createIdempotencyKey = async (key: string, payload: any) => ({ key: `idem-${Date.now()}` });
  storageModule.storage.markIdempotencyUsed = async (key: string, reference: string) => ({ key, reference });
  storageModule.storage.createCommissionWithEarning = async (orderId: string) => { calls.push(`commission:${orderId}`); return { commission: {}, earning: {} }; };
  storageModule.storage.createNotification = async (n: any) => { calls.push('notify'); return n; };

  // Mock fetch to capture Paystack initialize payload
  const realFetch = (globalThis as any).fetch ? (globalThis as any).fetch.bind(globalThis) : undefined;
  (globalThis as any).fetch = async (url: any, opts: any) => {
    if (typeof url === 'string' && url.startsWith('http://localhost')) {
      if (realFetch) return realFetch(url, opts);
      return { ok: false, status: 404, json: async () => ({}) } as any;
    }
    if (typeof url === 'string' && url.includes('/transaction/initialize')) {
      try {
        const body = JSON.parse(opts.body as string);
        calls.push(`initialize:transaction_charge=${body.transaction_charge}`);
        if (body.subaccounts && body.subaccounts.length > 0) {
          calls.push(`initialize:subaccount_share=${body.subaccounts[0].share}`);
        } else if (body.subaccount) {
          calls.push(`initialize:subaccount=${body.subaccount}`);
        }
      } catch (e) {}
      return { ok: true, status: 200, json: async () => ({ status: true, data: { authorization_url: 'https://paystack/checkout', reference: 'mock-ref' } }) } as any;
    }
    if (typeof url === 'string' && url.includes('/transaction/verify/mock-ref')) {
      return { ok: true, status: 200, json: async () => ({ status: true, data: { status: 'success', amount: 1000, currency: 'GHS', reference: 'mock-ref', metadata: { orderId: 'order1', userId: 'u1' } } }) } as any;
    }
    return { ok: false, status: 502, json: async () => ({}) } as any;
  };

  const app = express();
  app.use(express.json({ verify: (req: any, _res: any, buf: any) => { req.rawBody = buf; } }));
  app.use(cookieParser());

  

  const server = await registerRoutes(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  // @ts-ignore
  const port = (server.address() as any).port;

  const token = generateToken({ id: 'u1', email: 'u1@example.com', role: 'buyer' });

  const initResp = await fetch(`http://localhost:${port}/api/payments/initialize`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ orderId: 'order1' })
  });
  const initJson = await initResp.json();
  if (!initJson || (!initJson.reference && !initJson.authorization_url)) {
    throw new Error(`Initialize failed: ${JSON.stringify(initJson)}`);
  }
  // Call verify endpoint (server will call mocked Paystack verify)
    console.log('calls:', calls);

    if (!calls.some(c => c.startsWith('updateOrder:'))) throw new Error('Order not updated');
    // With bank-account split routing, Paystack retains platform-side amounts:
    // commission (10% of subtotal 100.00 = 10.00) + processing fee (5.00) = 15.00 -> 1500
    if (!calls.includes('initialize:transaction_charge=1500')) throw new Error('Platform-retained amount was not passed correctly to Paystack (expected 1500)');
    if (!calls.includes('initialize:subaccount=sub_123') && !calls.includes('initialize:subaccount_share=9000')) throw new Error('Subaccount/subaccount share missing from initialize payload');

    console.log('✅ paystack-init.test passed');

  server.close();
}

run().catch(err => { console.error('❌ paystack-init.test failed', err); throw err; });
