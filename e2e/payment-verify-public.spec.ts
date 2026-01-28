import { test, expect } from '@playwright/test';

// When Paystack redirects a user (unauthenticated) to /payment/verify?reference=..., the
// app should call the public verify endpoint and then redirect to success/failure accordingly.

test('Guest verify redirects to success page when verified', async ({ page }) => {
  const ref = 'guest-mock-ref';

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('request', (req) => console.log('REQ:', req.url()));
  page.on('response', (res) => console.log('RESP:', res.url(), res.status()));

  // Stub the public verify endpoint response
  await page.route(`**/api/payments/verify-public/${ref}`, (route) => {
    route.fulfill({
      status: 200,
      body: JSON.stringify({ verified: true, orderId: 'order-guest-1', transaction: { id: 'tx-1', orderId: 'order-guest-1', amount: '100.00', status: 'completed' } }),
      headers: { 'Content-Type': 'application/json' }
    });
  });

  await page.goto(`/payment/verify?reference=${ref}`);

  // Should navigate to success page with orderId
  await page.waitForURL('**/payment/success?orderId=order-guest-1', { timeout: 10000 });
  const url = page.url();
  expect(url).toContain('/payment/success?orderId=order-guest-1');
});

test('Guest verify redirects to failure page when verification fails', async ({ page }) => {
  const ref = 'guest-mock-fail';

  page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
  page.on('request', (req) => console.log('REQ:', req.url()));
  page.on('response', (res) => console.log('RESP:', res.url(), res.status()));

  await page.route(`**/api/payments/verify-public/${ref}`, (route) => {
    route.fulfill({
      status: 400,
      body: JSON.stringify({ verified: false, message: 'Payment not found' }),
      headers: { 'Content-Type': 'application/json' }
    });
  });

  await page.goto(`/payment/verify?reference=${ref}`);

  await page.waitForURL('**/payment/failure?reason=*', { timeout: 10000 });
  const url = page.url();
  expect(url).toContain('/payment/failure');
});
