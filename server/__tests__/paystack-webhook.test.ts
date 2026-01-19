import assert from 'assert';
import processPaystackChargeSuccess from '../payments';

async function run() {
  // Fake storage capturing calls
  const calls: string[] = [];
  const fakeStorage: any = {
    getTransactionByReference: async (ref: string) => null,
    getAllOrders: async () => [
      { id: 'o1', buyerId: 'u1', orderNumber: '1001', total: '10.00', currency: 'GHS' },
      { id: 'o2', buyerId: 'u1', orderNumber: '1002', total: '5.00', currency: 'GHS' }
    ],
    getOrder: async (id: string) => ({ id, buyerId: 'u1', orderNumber: '1001', total: '10.00', currency: 'GHS' }),
    createTransaction: async (data: any) => { calls.push('createTransaction'); return data; },
    updateOrder: async (id: string, data: any) => { calls.push(`updateOrder:${id}`); return { id, ...data }; },
    createCommissionWithEarning: async (orderId: string) => { calls.push(`commission:${orderId}`); return { commission: {}, earning: {} }; },
    getUser: async (id: string) => ({ id, name: 'Buyer' }),
    createNotification: async (n: any) => { calls.push('notify'); return n; }
  };

  const fakeIo = { to: (_: string) => ({ emit: (_: string, __: any) => calls.push('emit') }) } as any;

  const eventData = {
    reference: 'ref-123',
    amount: 1500,
    currency: 'GHS',
    status: 'success',
    metadata: {
      isMultiVendor: true,
      orderIds: ['o1','o2'],
      userId: 'u1'
    }
  };

  const result = await processPaystackChargeSuccess(eventData, fakeStorage, fakeIo);
  assert.deepStrictEqual(result.success, true);
  assert(calls.includes('createTransaction'), 'transaction should be created');
  assert(calls.some(c => c.startsWith('updateOrder:')), 'orders should be updated');
  assert(calls.some(c => c.startsWith('commission:')), 'commissions should be calculated');

  console.log('✅ paystack-webhook.test passed');
}

run().catch(err => {
  console.error('❌ test failed', err);
  process.exit(1);
});
