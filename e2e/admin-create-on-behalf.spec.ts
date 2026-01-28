import { test, expect } from '@playwright/test';
import { getTestToken } from './test-utils';

test.beforeAll(async ({ request }) => {
  await request.post('http://localhost:5000/api/seed/test-users');
});

test('Admin can create product on behalf of a seller via /api/admin/products', async ({ request, page }) => {
  const adminToken = await getTestToken(request, 'admin@kiyumart.com');

  // Fetch sellers list
  const sellersRes = await request.get('http://localhost:5000/api/users?role=seller', { headers: { Authorization: `Bearer ${adminToken}` } });
  expect(sellersRes.ok()).toBeTruthy();
  const sellers = await sellersRes.json();
  expect(Array.isArray(sellers) && sellers.length > 0).toBeTruthy();
  const sellerId = sellers[0].id;

  const payload = {
    name: `Admin OnBehalf Product ${Date.now()}`,
    description: 'Created by admin on behalf of seller',
    price: '60.00',
    costPrice: '120.00',
    images: [
      'https://example.com/1.png',
      'https://example.com/2.png',
      'https://example.com/3.png',
      'https://example.com/4.png',
      'https://example.com/5.png',
    ],
    video: 'https://example.com/v.mp4',
    stock: 5,
    sellerId,
  };

  const createRes = await request.post('http://localhost:5000/api/admin/products', { data: payload, headers: { Authorization: `Bearer ${adminToken}` } });
  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  expect(created.sellerId).toBe(sellerId);

  // Visit product page and confirm UI shows discounted badge and original price
  await page.goto(`http://localhost:5000/product/${created.id}`);
  await page.waitForSelector('[data-testid="text-selling-price"]', { timeout: 10000 });
  const selling = await page.textContent('[data-testid="text-selling-price"]');
  expect(selling).toMatch(/60(\.00)?/);

  const costEl = await page.locator('[data-testid="text-cost-price"]');
  await expect(costEl).toBeVisible();
  await expect(costEl).toHaveText(/120(\.00)?/);

  const badge = await page.locator('[data-testid="badge-discount"]');
  await expect(badge).toHaveText(/50% OFF/);
});