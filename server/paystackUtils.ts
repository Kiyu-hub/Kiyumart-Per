import { format } from 'util';

interface OrderItem {
  productId: string;
  quantity: number;
  price: string; // stringified decimal, e.g. "100.00"
}

interface Order {
  id: string;
  orderNumber?: string;
  total: string; // e.g. "105.00"
  currency?: string; // e.g. 'GHS'
  buyerId?: string;
  sellerId?: string;
  storeId?: string;
  paystackSubaccountId?: string | null;
}

interface PlatformSettings {
  paystackPublicKey?: string | null;
  defaultCommissionRate?: string | number; // percent, e.g. "1.00" for 1%
}

/**
 * Build a Paystack /transaction/initialize payload for an order.
 * This helper encapsulates split/subaccount logic but does not call Paystack.
 * It's intentionally pure and easy to unit-test.
 */
export function buildPaystackInitializePayload(order: Order, settings: PlatformSettings) {
  const currency = (order.currency || 'GHS').toUpperCase();
  // Paystack expects amount in the smallest currency unit (e.g., Kobo/Pesewas)
  const amountFloat = Number(order.total || '0');
  const amountMinor = Math.round(amountFloat * 100);

  const payload: Record<string, any> = {
    email: 'buyer@example.com', // caller should replace with real buyer email
    amount: amountMinor,
    currency,
    metadata: {
      orderId: order.id,
      orderNumber: order.orderNumber || null,
      buyerId: order.buyerId || null,
      storeId: order.storeId || null,
    },
  };

  // If seller/store has a Paystack subaccount, include it so Paystack splits automatically
  if (order.paystackSubaccountId) {
    payload.subaccount = order.paystackSubaccountId;

    // If platform takes a commission, pass the split (Paystack handles internal split via subaccount ratios)
    // We keep this optional and conservative: do not set `bearer` here — higher-level code decides who bears fees.
    if (settings.defaultCommissionRate) {
      const commissionPercent = Number(settings.defaultCommissionRate) || 0;
      payload.metadata.platformCommissionPercent = commissionPercent;
    }
  }

  return payload;
}

export default buildPaystackInitializePayload;
