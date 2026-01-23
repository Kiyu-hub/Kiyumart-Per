import assert from 'assert';
import processPaystackChargeSuccess from '../payments';

async function run() {
  const calls: string[] = [];
  const fakeStorage: any = {
    getTransactionByReference: async (ref: string) => null,
    getAllOrders: async () => [],
    getOrder: async (id: string) => ({ id, buyerId: 'u1', orderNumber: '1001', total: '10.00', currency: 'GHS' }),
    createTransaction: async (data: any) => { calls.push('createTransaction'); return data; },
    updateOrder: async (id: string, data: any) => { calls.push(`updateOrder:${id}`); return { id, ...data }; },
    createCommissionWithEarning: async (orderId: string) => { calls.push(`commission:${orderId}`); return { commission: {}, earning: {} }; },
    getUser: async (id: string) => ({ id, name: 'Buyer' }),
    createNotification: async (n: any) => { calls.push('notify'); return n; }
  };
  const fakeIo = { to: (_: string) => ({ emit: (_: string, __: any) => calls.push('emit') }) } as any;

  // Single-vendor metadata
  const eventData = {
    reference: 'ref-single',
    amount: 1000,
    currency: 'GHS',
    status: 'success',
    metadata: {
      orderId: 'o-single',
      userId: 'u1'
    }
  };

  const result = await processPaystackChargeSuccess(eventData, fakeStorage, fakeIo);
  assert.deepStrictEqual(result.success, true);
  assert(calls.includes('createTransaction'));
  assert(calls.some(c => c.startsWith('updateOrder:')));
  assert(calls.some(c => c.startsWith('commission:')));
  console.log('✅ paystack-verify.test passed');
}

run().catch(err => { console.error('❌ test failed', err); throw err; });
