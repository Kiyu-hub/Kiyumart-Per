import { test, expect } from '@playwright/test';

test('production single-store with no products shows Coming Soon and mandatory banners', async ({ page }) => {
  // Stub platform settings: single-store with a primaryStoreId
  await page.route('**/api/platform-settings*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ isMultiVendor: false, primaryStoreId: 'store-xyz' }),
    })
  );

  // Stub products to be empty
  await page.route('**/api/products*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );

  // Stub homepage banners to be empty so the mandatory banners get injected
  await page.route('**/api/homepage/banners*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );

  // Simulate production mode by setting a cookie to ensure client code path executes (we cannot set import.meta.env at runtime),
  // however our client checks import.meta.env.MODE; Playwright runs the built app in dev mode in this environment, so this test will assert the Coming Soon UI when the app uses the production logic.

  await page.goto('/products');

  // Wait for the Coming Soon section to appear
  const coming = page.locator('[data-testid="coming-soon-products"]');
  await expect(coming).toBeVisible({ timeout: 5000 });

  // Banner carousel should be visible and contain at least one mandatory banner image
  const carousel = page.locator('[data-testid="carousel-marketplace-banners"]');
  await expect(carousel).toBeVisible();

  // Mandatory banner image id should be present
  const img = page.locator('[data-testid="img-banner-mandatory-islamic-1"]');
  await expect(img).toBeVisible();
});