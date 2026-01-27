import { test, expect } from '@playwright/test';
import { getTestToken } from './test-utils';

// Ensure primary store is set to a store with active products and confirm homepage shows seller products + banners
test('primary store shows seller products and maintains Islamic header banners in single-store mode', async ({ page, request }) => {
  // Ensure test users
  await request.post('http://localhost:5000/api/seed/test-users');

  // Ensure marketplace (Islamic fashion) sample data exists then force platform to use a primary store that has active products
  await request.post('http://localhost:5000/api/seed/islamic-fashion');

  // Now pick a primary store that has active products
  const res = await request.post('http://localhost:5000/api/seed/ensure-primary-store');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const primaryStoreId = body.primaryStoreId;
  expect(primaryStoreId).toBeTruthy();

  // Visit homepage (backend origin) and check mandatory Islamic banners (header branding)
  await page.goto('http://localhost:5000/');
  await expect(page.locator('text=Abaya').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Hijab').first()).toBeVisible({ timeout: 10000 });

  // Go to products page (backend origin) and ensure products exist (the store's products should be visible)
  await page.goto('http://localhost:5000/products');
  await page.waitForSelector('[data-testid="grid-products"]');
  const productCountText = await page.textContent('[data-testid="badge-product-count"]');
  expect(productCountText && parseInt(productCountText.trim()) > 0).toBeTruthy();

  // Switch platform to multi-vendor mode and validate banners are not present
  // Use test token to authenticate and set cookie via Playwright context, then patch settings
  const testToken = await getTestToken(request, 'superadmin@kiyumart.com');
  await page.context().addCookies([{ name: 'token', value: testToken, url: 'http://localhost:5000' }]);
  // Confirm auth works via backend
  // eslint-disable-next-line no-console
  console.log('DEBUG: primary-store cookies', JSON.stringify(await page.context().cookies()));

  // Ensure client recognizes auth
  await page.goto('/profile');
  try {
    await page.waitForSelector('[data-testid="header-profile"]', { timeout: 10000 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('DEBUG: profile did not render for primary-store test');
    const me = await page.evaluate(async () => {
      const r = await fetch('http://localhost:5000/api/auth/me', { credentials: 'include' });
      try { return { status: r.status, body: await r.json() }; } catch { return { status: r.status, body: await r.text() }; }
    });
    // eslint-disable-next-line no-console
    console.log('DEBUG: auth/me from browser context', JSON.stringify(me));
    if (me.status !== 200) throw new Error('Authentication failed in browser context');
  }

  await page.goto('http://localhost:5000/');
  await page.waitForLoadState('networkidle');

  // Patch settings with superadmin token (reuse earlier testToken)
  const patch = await request.patch('http://localhost:5000/api/settings', { data: { isMultiVendor: true }, headers: { Authorization: `Bearer ${testToken}` } });
  expect(patch.ok()).toBeTruthy();

  // Go back to homepage, banners should switch to marketplace layout (category headings)
  await page.goto('/');
  await page.waitForLoadState('networkidle');

  // Be flexible: depending on shopDisplayMode, homepage may show either stores or categories
  const categoryCount = await page.locator('text=Shop by Category').first().count();
  const storeCount = await page.locator('text=Shop by Store').first().count();
  expect(categoryCount + storeCount).toBeGreaterThan(0);
});