// Route-level test for /api/payments/verify/:reference
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'testsecret';

import express from 'express';
import cookieParser from 'cookie-parser';
import { registerRoutes } from '../routes';
import * as storageModule from '../storage';
import { generateToken } from '../auth';

async function run() {
  const calls: string[] = [];

  // Platform settings
  storageModule.storage.getPlatformSettings = async () => ({ paystackSecretKey: 'sk_test', defaultCommissionRate: '10', isMultiVendor: false } as any);

  // Orders / stores
  const order = { id: 'order1', buyerId: 'u1', orderNumber: 'ORD-1', total: '105.00', processingFee: '5.00', currency: 'GHS', storeId: 'store1', sellerId: 'seller1', paymentReference: 'mock-ref' } as any;
  storageModule.storage.getOrder = async (id: string) => id === 'order1' ? order : undefined;
  storageModule.storage.getAllOrders = async () => [order];
  storageModule.storage.getStore = async (id: string) => ({ id: 'store1', primarySellerId: 'seller1', name: 'Primary Store', paystackSubaccountId: 'sub_123', isPayoutVerified: true, payoutType: 'bank_account', payoutDetails: {} } as any);
  storageModule.storage.getStoreByPrimarySeller = async (sellerId: string) => ({ id: 'store1', primarySellerId: sellerId, paystackSubaccountId: 'sub_123', isPayoutVerified: true, payoutType: 'bank_account', payoutDetails: {} } as any);

  // Transactions / commissions / notifications / payouts
  storageModule.storage.getTransactionByReference = async (ref: string) => null;
  storageModule.storage.createTransaction = async (t: any) => { calls.push('createTransaction'); return t; };
  storageModule.storage.updateOrder = async (id: string, data: any) => { calls.push(`updateOrder:${id}`); return { id, ...data }; };
  storageModule.storage.createCommissionWithEarning = async (orderId: string) => { calls.push(`commission:${orderId}`); return { commission: { id: `c-${orderId}`, sellerId: 'seller1', sellerAmount: '90.00' }, earning: {} }; };
  storageModule.storage.markCommissionsProcessed = async (ids: string[]) => ({ ids });
  storageModule.storage.createNotification = async (n: any) => { calls.push('notify'); return n; };
  storageModule.storage.getUser = async (id: string) => ({ id, email: `${id}@example.com`, name: 'Buyer' });

  storageModule.storage.createSellerPayout = async (p: any) => { calls.push('createSellerPayout'); return { id: 'payout1', ...p }; };
  storageModule.storage.updatePayoutStatus = async (id: string, status: string) => ({ id, status });

  // Mock Paystack verify response: intercept external fetch
  const realFetch = (globalThis as any).fetch ? (globalThis as any).fetch.bind(globalThis) : undefined;
  (globalThis as any).fetch = async (url: any, opts: any) => {
    if (typeof url === 'string' && url.startsWith('http://localhost')) {
      if (realFetch) return realFetch(url, opts);
      return { ok: false, status: 404, json: async () => ({}) } as any;
    }

    if (typeof url === 'string' && url.includes('/transaction/verify/mock-ref')) {
      return { ok: true, status: 200, json: async () => ({ status: true, data: { status: 'success', amount: 10500, currency: 'GHS', reference: 'mock-ref', metadata: { orderId: 'order1', userId: 'u1' } } }) } as any;
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

  const verifyResp = await fetch(`http://localhost:${port}/api/payments/verify/mock-ref`, {
    method: 'GET', headers: { Authorization: `Bearer ${token}` }
  });
  const verifyJson = await verifyResp.json();
  console.log('verify status', verifyResp.status, 'body', verifyJson);

  // Assertions: transaction created, order updated, commission created
  if (!calls.includes('createTransaction')) throw new Error('Transaction not created');
  if (!calls.some(c => c.startsWith('updateOrder:'))) throw new Error('Order not updated');
  if (!calls.some(c => c.startsWith('commission:'))) throw new Error('Commission not calculated');

  console.log('calls:', calls);
  console.log('✅ paystack-verify-route.test passed');

  server.close(() => process.exit(0));
}

run().catch(err => { console.error('❌ paystack-verify-route.test failed', err); throw err; });
