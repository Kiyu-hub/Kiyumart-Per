// Test Paystack payment initialization flow (development helper)
// Usage: API_URL=http://localhost:5000 node scripts/test_payment.js

const API = process.env.API_URL || 'http://localhost:5000';
const buyerEmail = process.env.BUYER_EMAIL || 'buyer@kiyumart.com';

async function main() {
  try {
    console.log(`Requesting test token for ${buyerEmail} from ${API}`);
    const tokenRes = await fetch(`${API}/api/test/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: buyerEmail }),
    });
    const tokenJson = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok) {
      console.error('Failed to get test token', tokenJson);
      process.exit(1);
    }
    const token = tokenJson.token;
    console.log('Got token for buyer. Bearer token length:', token ? token.length : 0);

    // Fetch a product to use in order
    console.log('Fetching products...');
    const productsRes = await fetch(`${API}/api/products`);
    const products = await productsRes.json();
    if (!Array.isArray(products) || products.length === 0) {
      console.error('No products available to create order');
      process.exit(1);
    }
    const product = products[0];
    console.log('Using product:', product.id, product.name, product.price);

    // Compute prices
    const originalPrice = parseFloat(product.price);
    const discount = product.discount || 0;
    const sellingPrice = discount > 0 ? originalPrice * (1 - discount / 100) : originalPrice;
    const quantity = 1;
    const subtotal = parseFloat((sellingPrice * quantity).toFixed(2));
    const deliveryFee = 0;
    const processingFee = parseFloat(((subtotal + deliveryFee) * 0.0195).toFixed(2));
    const total = parseFloat((subtotal + deliveryFee + processingFee).toFixed(2));

    const orderPayload = {
      items: [{ productId: product.id, quantity }],
      deliveryMethod: 'pickup',
      deliveryZoneId: null,
      deliveryAddress: null,
      deliveryLatitude: null,
      deliveryLongitude: null,
      deliveryFee: deliveryFee.toFixed(2),
      subtotal: subtotal.toFixed(2),
      processingFee: processingFee.toFixed(2),
      total: total.toFixed(2),
      currency: product.currency || 'GHS',
    };

    console.log('Creating order with payload:', orderPayload);
    const createOrderRes = await fetch(`${API}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(orderPayload),
    });

    const createOrderJson = await createOrderRes.json().catch(() => ({}));
    if (!createOrderRes.ok) {
      console.error('Failed to create order:', createOrderJson);
      process.exit(1);
    }

    console.log('Order created:', createOrderJson.id || createOrderJson.orderNumber || createOrderJson);
    const orderId = createOrderJson.id;

    console.log('Initializing payment for order:', orderId);
    const initRes = await fetch(`${API}/api/payments/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ orderId }),
    });

    const initJson = await initRes.json().catch(() => ({}));
    console.log('Payments initialize response status:', initRes.status);
    console.log(JSON.stringify(initJson, null, 2));

    if (!initRes.ok) {
      console.log('Payment initialization failed or gateway not configured. See server response above.');
      process.exit(0);
    }

    console.log('\nPayment initialized successfully. Authorization URL:', initJson.authorization_url);
    console.log('Reference:', initJson.reference);
    console.log('You can simulate verification by calling /api/payments/verify-public/:reference or using the test webhook.');
  } catch (e) {
    console.error('Error during payment test:', e);
    process.exit(1);
  }
}

main();
