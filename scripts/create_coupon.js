// Create a test coupon for the seller using the test token endpoint.
// Usage:
// API_URL=http://localhost:3000 SELLER_EMAIL=seller@kiyumart.com COUPON_CODE=DEVTEST50 node scripts/create_coupon.js

const API = process.env.API_URL || "http://localhost:3000";
const sellerEmail = process.env.SELLER_EMAIL || "seller@kiyumart.com";
const couponCode = process.env.COUPON_CODE || `DEVTEST-${Date.now()}`;

async function main() {
  try {
    console.log(`Requesting test token for ${sellerEmail} from ${API}`);
    const tRes = await fetch(`${API}/api/test/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: sellerEmail }),
    });
    if (!tRes.ok) {
      console.error('Failed to get test token', await tRes.text());
      process.exit(1);
    }
    const tJson = await tRes.json();
    const token = tJson.token || tJson.accessToken || tJson.access_token;
    if (!token) {
      console.error('No token returned:', tJson);
      process.exit(1);
    }
    console.log('Got token. Creating coupon:', couponCode);

    const couponPayload = {
      code: couponCode,
      discountType: 'percentage',
      discountValue: '10',
      minPurchase: '0',
      maxUses: '100',
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    };

    const cRes = await fetch(`${API}/api/coupons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(couponPayload),
    });

    const cJson = await cRes.json();
    if (!cRes.ok) {
      console.error('Failed to create coupon:', cJson);
      process.exit(1);
    }

    console.log('Coupon created successfully:');
    console.log(JSON.stringify(cJson, null, 2));
    console.log('\nYou can now test the coupon code in the Checkout page:', couponCode);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();
