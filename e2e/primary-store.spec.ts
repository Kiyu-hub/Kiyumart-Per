import { test, expect } from '@playwright/test';

// Ensure primary store is set to a store with active products and confirm homepage shows seller products + banners
test('primary store shows seller products and maintains Islamic header banners in single-store mode', async ({ page, request }) => {
  // Ensure test users
  await request.post('http://localhost:5000/api/seed/test-users');

  // Force platform to use a primary store that has active products
  const res = await request.post('http://localhost:5000/api/seed/ensure-primary-store');
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const primaryStoreId = body.primaryStoreId;
  expect(primaryStoreId).toBeTruthy();

  // Visit homepage and check mandatory Islamic banners (header branding)
  await page.goto('/');
  await expect(page.locator('text=Abaya').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=Hijab').first()).toBeVisible({ timeout: 10000 });

  // Go to products page and ensure products exist (the store's products should be visible)
  await page.goto('/products');
  await page.waitForSelector('[data-testid="grid-products"]');
  const productCountText = await page.textContent('[data-testid="badge-product-count"]');
  expect(productCountText && parseInt(productCountText.trim()) > 0).toBeTruthy();

  // Switch platform to multi-vendor mode and validate banners are not present
  // First set auth cookie for superadmin then patch settings
  await page.goto('http://localhost:5000/api/test/auth-cookie?email=superadmin@kiyumart.com');
  const patch = await request.patch('http://localhost:5000/api/settings', { data: { isMultiVendor: true } });
  expect(patch.ok()).toBeTruthy();

  // Go back to homepage, banners should switch to marketplace layout (category headings)
  await page.goto('/');
  await expect(page.locator('text=Shop by Category').first()).toBeVisible({ timeout: 10000 });
});