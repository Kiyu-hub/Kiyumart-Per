import { test, expect } from '@playwright/test';
import { getTestToken } from './test-utils';

test('ads display on home (hero + sidebar + footer) and product page', async ({ page, request }) => {
  // Enable ads via API so the UI will render ad placements
  const token = await getTestToken(request, 'superadmin@kiyumart.com');
  const settingsPatch = await request.patch('http://localhost:5000/api/settings', { data: { adsEnabled: true, isMultiVendor: false }, headers: { Authorization: `Bearer ${token}` } });
  expect(settingsPatch.ok()).toBeTruthy();
  const patched = await settingsPatch.json();
  expect(patched.adsEnabled).toBeTruthy();
  expect(patched.isMultiVendor).toBe(false);

  // Ensure frontend origin loads and refetches settings
  // Load the app via backend origin so API requests are same-origin (avoids dev server proxy issues)
  await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
  // Force a reload to ensure the client picks up the latest platform settings
  await page.reload();
  // Wait for footer text to ensure the client finished rendering
  await page.waitForSelector('text=© 2026 KiyuMart', { timeout: 5000 });

  // Make sure viewport is large enough to show sidebar
  await page.setViewportSize({ width: 1280, height: 800 });

  // Hero ad should be present (fallback content shows if no image configured)
  await expect(page.locator('[data-testid="ad-banner-hero"]')).toBeVisible({ timeout: 10000 });

  // Sidebar ad should be present on large screens
  await expect(page.locator('[data-testid="ad-banner-sidebar"]')).toBeVisible({ timeout: 10000 });

  // Footer ad should be present
  await expect(page.locator('[data-testid="ad-banner-footer"]')).toBeVisible({ timeout: 10000 });

  // Pick a product from the API and visit its page to check product-page ad
  const res = await request.get('http://localhost:5000/api/products');
  expect(res.ok()).toBeTruthy();
  const products = await res.json();
  if (!products || products.length === 0) {
    test.skip();
    return;
  }

  const productId = products[0].id;
  // Visit product detail on backend origin so API requests are same-origin
  await page.goto(`http://localhost:5000/product/${productId}`, { waitUntil: 'domcontentloaded' });
  // Wait for product name to indicate the page finished rendering
  await page.waitForSelector('[data-testid="text-product-name"]', { timeout: 8000 });
  await expect(page.locator('[data-testid="ad-banner-product-page"]')).toBeVisible({ timeout: 10000 });
});
