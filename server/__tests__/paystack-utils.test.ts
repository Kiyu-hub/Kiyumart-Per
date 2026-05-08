import assert from 'assert';
import { buildPaystackInitializePayload } from '../paystackUtils';

async function run() {
  // Test 1: basic GHS payload with minor units
  {
    const order = { id: 'o1', total: '123.45', currency: 'GHS' } as any;
    const settings = {} as any;
    const p = buildPaystackInitializePayload(order, settings);
    assert.strictEqual(p.currency, 'GHS', 'currency should be GHS');
    assert.strictEqual(p.amount, 12345, 'amount should be in pesewas');
    assert.strictEqual(p.metadata.orderId, 'o1', 'orderId should be in metadata');
  }

  // Test 2: includes subaccount and commission when configured
  {
    const order = { id: 'o2', total: '50.00', currency: 'GHS', paystackSubaccountId: 'ACCT_123' } as any;
    const settings = { defaultCommissionRate: '2.50' } as any;
    const p = buildPaystackInitializePayload(order, settings);
    assert.strictEqual(p.subaccount, 'ACCT_123', 'subaccount should be set');
    assert.ok(Math.abs((p.metadata.platformCommissionPercent ?? 0) - 2.5) < 0.001, 'commission percent should be ~2.5');
    assert.strictEqual(p.amount, 5000, 'amount should be 5000 pesewas');
  }

  console.log('✅ paystack-utils.test passed');
}

run().catch(err => { console.error('❌ paystack-utils.test failed', err); throw err; });
