import { test, expect } from '@playwright/test';

test('shows featured products when main products list is empty', async ({ page }) => {
  // Stub /api/products to return empty
  await page.route('**/api/products*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    })
  );

  // Stub featured products to return a single product
  const featured = [
    {
      id: 'featured-1',
      name: 'Featured Abaya',
      price: 199.99,
      images: ['https://example.com/featured-1.png'],
      discount: 0,
      ratings: '4.8',
      totalRatings: 10,
      stock: 5,
    },
  ];

  await page.route('**/api/homepage/featured-products*', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(featured),
    })
  );

  // Allow categories to be empty or normal; navigate to the products page
  await page.goto('/products');

  // Wait for the featured products grid to appear
  const grid = page.locator('[data-testid="grid-featured-products"]');
  await expect(grid).toBeVisible();

  // Expect at least one featured product card with our ID
  const card = page.locator('[data-testid="card-product-featured-1"]');
  await expect(card).toBeVisible();

  // Verify the product name text is visible
  await expect(page.locator('[data-testid="text-product-name-featured-1"]')).toHaveText('Featured Abaya');
});
