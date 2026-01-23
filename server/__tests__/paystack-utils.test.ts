import { buildPaystackInitializePayload } from '../paystackUtils';

describe('buildPaystackInitializePayload', () => {
  it('builds basic payload with GHS and minor units', () => {
    const order = { id: 'o1', total: '123.45', currency: 'GHS' } as any;
    const settings = {} as any;

    const p = buildPaystackInitializePayload(order, settings);
    expect(p.currency).toBe('GHS');
    expect(p.amount).toBe(12345);
    expect(p.metadata.orderId).toBe('o1');
  });

  it('includes subaccount and commission metadata when present', () => {
    const order = { id: 'o2', total: '50.00', currency: 'GHS', paystackSubaccountId: 'ACCT_123' } as any;
    const settings = { defaultCommissionRate: '2.50' } as any;

    const p = buildPaystackInitializePayload(order, settings);
    expect(p.subaccount).toBe('ACCT_123');
    expect(p.metadata.platformCommissionPercent).toBeCloseTo(2.5);
    expect(p.amount).toBe(5000);
  });
});
