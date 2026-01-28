import { test, expect, type APIRequestContext } from '@playwright/test';
import { getTestToken } from './test-utils';

// Verify that admins are not allowed to create products (403 Forbidden)

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  await request.post('http://localhost:5000/api/seed/test-users');
});

test('Admin cannot create product via API', async ({ request }) => {
  const adminToken = await getTestToken(request, 'admin@kiyumart.com');

  const productData = {
    name: `Admin Attempt ${Date.now()}`,
    description: 'Attempt by admin to create product should be forbidden',
    price: '10.00',
    costPrice: '20.00',
    images: [
      'https://example.com/a.png',
      'https://example.com/b.png',
      'https://example.com/c.png',
      'https://example.com/d.png',
      'https://example.com/e.png',
    ],
    video: 'https://example.com/v.mp4',
    stock: 1,
  };

  const res = await request.post('http://localhost:5000/api/products', { data: productData, headers: { Authorization: `Bearer ${adminToken}` } });
  expect(res.status()).toBeGreaterThanOrEqual(400);
  // Prefer a 403 code for forbidden
  expect(res.status()).toBe(403);
});
