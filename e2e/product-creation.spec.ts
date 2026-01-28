import { test, expect, type APIRequestContext } from '@playwright/test';
import { getTestToken } from './test-utils';

// Ensures seller can create a product with costPrice and selling price and that
// the UI displays the cost (struck-through) and computed discount correctly.

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  // Ensure seeded test users exist
  await request.post('http://localhost:5000/api/seed/test-users');
});

test('Seller creates product with costPrice; UI shows strike-through and discount', async ({ page, request }) => {
  // Obtain a seller token
  const sellerToken = await getTestToken(request, 'seller@kiyumart.com');

  // Create product payload - include 5 image URLs and a video URL to satisfy validation
  const productData = {
    name: `Playwright Seller Product ${Date.now()}`,
    description: 'A product created by Playwright for testing seller create flow',
    price: '50.00',
    costPrice: '100.00',
    discount: 0,
    stock: 10,
    images: [
      'https://example.com/img1.png',
      'https://example.com/img2.png',
      'https://example.com/img3.png',
      'https://example.com/img4.png',
      'https://example.com/img5.png',
    ],
    video: 'https://example.com/video.mp4',
    tags: ['playwright', 'e2e'],
  };

  const createRes = await request.post('http://localhost:5000/api/products', { 
    data: productData,
    headers: { Authorization: `Bearer ${sellerToken}` }
  });

  expect(createRes.ok()).toBeTruthy();
  const created = await createRes.json();
  expect(created && created.id).toBeTruthy();

  // Visit the product details page in browser context
  await page.goto(`http://localhost:5000/product/${created.id}`);
  await page.waitForSelector('[data-testid="text-selling-price"]', { timeout: 10000 });

  // Verify selling price
  const sellingPrice = await page.textContent('[data-testid="text-selling-price"]');
  expect(sellingPrice).toContain('GHS');
  expect(sellingPrice).toMatch(/50(\.00)?/);

  // Verify original cost price is shown and struck-through
  const costEl = await page.locator('[data-testid="text-cost-price"]');
  await expect(costEl).toBeVisible();
  const costText = await costEl.textContent();
  expect(costText).toContain('100');

  // Verify discount badge shows 50% OFF
  const badge = await page.locator('[data-testid="badge-discount"]');
  await expect(badge).toBeVisible();
  await expect(badge).toHaveText(/50% OFF/);
});
