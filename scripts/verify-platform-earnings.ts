import 'dotenv/config';
import { storage } from '../server/storage';
import { processPaystackChargeSuccess } from '../server/payments';

async function run() {
  console.log('Starting platform earnings verification script...');

  // Ensure test users exist (seed endpoint could be used but we'll query)
  const seller = await storage.getUserByEmail('seller@kiyumart.com');
  const buyer = await storage.getUserByEmail('buyer@kiyumart.com');
  if (!seller || !buyer) {
    console.error('seller or buyer not found. Call POST /api/seed/test-users first.');
    process.exit(1);
  }

  // Create a product for seller
  const product = await storage.createProduct({
    sellerId: seller.id,
    name: 'Platform earnings test product',
    description: 'Test product for verifying commission/earnings',
    price: '100.00',
    sku: 'TEST-PE-001',
    images: ['https://via.placeholder.com/600x800'],
    isActive: true,
  } as any);

  // Build an order
  const subtotal = 100.00;
  const deliveryFee = 0.00;
  const processingFee = parseFloat((subtotal * (parseFloat((await storage.getPlatformSettings()).processingFeePercent || '0') / 100)).toFixed(2));
  const total = +(subtotal + deliveryFee + processingFee).toFixed(2);

  const order = await storage.createOrder({
    buyerId: buyer.id,
    sellerId: seller.id,
    status: 'pending' as any,
    deliveryMethod: 'pickup' as any,
    subtotal: subtotal.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    processingFee: processingFee.toFixed(2),
    total: total.toFixed(2),
    currency: 'GHS',
    deliveryAddress: 'Test address',
  } as any, [
    { productId: product.id, quantity: 1, price: '100.00', total: '100.00' }
  ]);

  console.log('Created order', order.id, 'total', order.total, 'processingFee', order.processingFee);

  // Simulate Paystack charge.success webhook
  const eventData: any = {
    reference: `TEST-REF-${Date.now()}`,
    amount: Math.round(total * 100), // paystack uses kobo/cents
    currency: 'GHS',
    status: 'success',
    gateway_response: 'Successful',
    metadata: {
      orderId: order.id,
      userId: buyer.id,
    }
  };

  // Call the processor
  try {
    await processPaystackChargeSuccess(eventData, storage, { to: () => ({ emit: () => {} }) } as any);
    console.log('processPaystackChargeSuccess succeeded');
  } catch (e) {
    console.error('processPaystackChargeSuccess failed', e);
    process.exit(1);
  }

  // Check commissions & platform earnings
  const commissions = await storage.getSellerCommissions(seller.id);
  const earningsSummary = await storage.getPlatformEarningsSummary();
  console.log('Seller commissions count:', commissions.length);
  console.log('Earnings summary:', earningsSummary);

  console.log('Done');
}

run().catch((e) => { console.error(e); process.exit(1); });
