import { test, expect } from '@playwright/test';
import { getTestToken } from './test-utils';

test('promotional ad lifecycle: create -> visible with countdown -> expire -> removed', async ({ page, request }) => {
  const token = await getTestToken(request, 'superadmin@kiyumart.com');

  // pick a store to promote
  const storesRes = await request.get('http://127.0.0.1:5000/api/stores?isActive=true&isApproved=true');
  expect(storesRes.ok()).toBeTruthy();
  const stores = await storesRes.json();
  if (!stores || stores.length === 0) {
    test.skip();
    return;
  }
  const storeId = stores[0].id;

  // create a promo that ends in a few minutes
  const now = new Date();
  const endAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();
  const res = await request.post('http://localhost:5000/api/admin/promotions', { data: { type: 'store', targetId: storeId, startAt: now.toISOString(), endAt }, headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  const created = await res.json();

  // Visit homepage and confirm promo appears in sidebar
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });

  // Promo should be visible in the sidebar
  const promoSidebar = page.locator('[data-testid="promo-ad-sidebar"]');
  await expect(promoSidebar).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="promo-ad-sidebar"] [data-testid="promo-countdown"]')).toBeVisible({ timeout: 15000 });

  // Assert the sidebar promo fills the sticky container vertically alongside the secondary ad
  const sticky = page.locator('aside .sticky');
  await expect(sticky).toBeVisible();

  const stickyBox = await sticky.boundingBox();
  const promoBox = await promoSidebar.boundingBox();
  const sidebarAd = page.locator('aside [data-testid="ad-banner-sidebar"]');
  const sidebarAdBox = await sidebarAd.boundingBox();

  if (stickyBox && promoBox && sidebarAdBox) {
    const sum = promoBox.height + sidebarAdBox.height;
    // Allow a small tolerance for borders/margins and responsive rounding
    expect(Math.abs(sum - stickyBox.height)).toBeLessThanOrEqual(40);
  }

  // Now test mobile responsive behavior: promo should render as full-width mobile block and sidebar variant should not be present
  await page.setViewportSize({ width: 375, height: 800 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-testid="promo-ad"]')).toBeVisible({ timeout: 15000 });
  // Sidebar variant should be present in DOM but hidden on mobile; assert it's hidden
  await expect(page.locator('[data-testid="promo-ad-sidebar"]')).toBeHidden();

  // Expire the promo via admin endpoint
  const expireRes = await request.patch(`http://localhost:5000/api/admin/promotions/${created.id}/expire`, { headers: { Authorization: `Bearer ${token}` } });
  expect(expireRes.ok()).toBeTruthy();

  // Reload the page and assert promo is removed
  await page.reload();
  await expect(page.locator('[data-testid="promo-ad-sidebar"]')).toHaveCount(0, { timeout: 15000 });
});