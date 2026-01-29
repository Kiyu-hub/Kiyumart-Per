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
  await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1280, height: 900 });

  // Promo should be visible in the sidebar
  await expect(page.locator('[data-testid="promo-ad-sidebar"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-testid="promo-countdown"]')).toBeVisible({ timeout: 15000 });

  // Expire the promo via admin endpoint
  const expireRes = await request.patch(`http://localhost:5000/api/admin/promotions/${created.id}/expire`, { headers: { Authorization: `Bearer ${token}` } });
  expect(expireRes.ok()).toBeTruthy();

  // Reload the page and assert promo is removed
  await page.reload();
  await expect(page.locator('[data-testid="promo-ad-sidebar"]')).toHaveCount(0, { timeout: 15000 });
});