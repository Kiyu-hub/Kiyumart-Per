import { test, expect } from '@playwright/test';
import { getTestToken } from './test-utils';

test('super-admin: create multi-product promotions, list, end, and sidebar placeholder when none exist', async ({ page, request }) => {
  const token = await getTestToken(request, 'superadmin@kiyumart.com');

  // get a seller and two products
  const sellersRes = await request.get('http://localhost:5000/api/users?role=seller');
  expect(sellersRes.ok()).toBeTruthy();
  const sellers = await sellersRes.json();
  if (!sellers || sellers.length === 0) return test.skip();
  const sellerId = sellers[0].id;

  const productsRes = await request.get(`http://localhost:5000/api/products?sellerId=${sellerId}&isActive=true`);
  expect(productsRes.ok()).toBeTruthy();
  const products = await productsRes.json();
  if (!products || products.length < 2) return test.skip();

  const productIds = [products[0].id, products[1].id];

  // Create multi-product promotions that end soon
  const now = new Date();
  const endAt = new Date(now.getTime() + 2 * 60 * 1000).toISOString();

  const res = await request.post('http://localhost:5000/api/admin/promotions', { data: { type: 'product', targetIds: productIds, startAt: now.toISOString(), endAt, title: 'Multi Promo', description: 'Promote two products', ctaText: 'Shop' }, headers: { Authorization: `Bearer ${token}` } });
  expect(res.ok()).toBeTruthy();
  const created = await res.json();
  expect(Array.isArray(created)).toBeTruthy();

  // Visit admin promotions and assert they appear
  await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);
  await page.goto('http://localhost:5000/admin/promotions', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('text=Multi Promo')).toBeVisible({ timeout: 5000 });

  // End the first promotion via the admin list 'End' button
  const firstEnd = page.locator('text=Multi Promo').first().locator('..').locator('button', { hasText: 'End' }).first();
  await firstEnd.click();
  await page.reload({ waitUntil: 'domcontentloaded' });

  // Expire remaining promotions via API to simulate none existing
  const allList = await request.get('http://localhost:5000/api/admin/promotions', { headers: { Authorization: `Bearer ${token}` } });
  const all = await allList.json();
  for (const p of all) {
    await request.patch(`http://localhost:5000/api/admin/promotions/${p.id}/expire`, { headers: { Authorization: `Bearer ${token}` } });
  }

  // Visit homepage and ensure sidebar shows placeholder (no active promos)
  await page.goto('http://localhost:5000/', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const placeholder = page.locator('aside .sticky text=No active promotions');
  await expect(page.locator('text=No active promotions')).toBeVisible({ timeout: 5000 });
});