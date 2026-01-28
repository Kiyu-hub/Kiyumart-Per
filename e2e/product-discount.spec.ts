import { test, expect } from '@playwright/test';

// Verify ProductCard shows strike-through original price and discount badge
// when costPrice is present, and when only discount is provided it infers original price.

const productWithCost = [
  {
    id: 'p-cost-1',
    name: 'Red Dress',
    price: '100.00',
    costPrice: '150.00',
    images: ['/attached_assets/stock_images/sample_dress.png'],
    ratings: '4.5',
    totalRatings: 3,
    discount: 0,
    stock: 10,
  }
];

const productWithDiscountOnly = [
  {
    id: 'p-disc-1',
    name: 'Blue Shirt',
    price: '80.00',
    // no costPrice set, only discount field
    discount: 20,
    images: ['/attached_assets/stock_images/sample_shirt.png'],
    ratings: '4.0',
    totalRatings: 1,
    stock: 5,
  }
];

test.describe('Product discount display', () => {
  test('shows cost price strike-through and computed percent when costPrice present', async ({ page }) => {
    await page.route('**/api/products*', (route) => route.fulfill({ status: 200, body: JSON.stringify(productWithCost) }));
    await page.goto('/');

    // wait for product card
    await page.waitForSelector('[data-testid^="badge-discount-"]', { timeout: 5000 });

    // badge should show 33% OFF
    const badge = await page.locator('[data-testid^="badge-discount-"]').first();
    await expect(badge).toHaveText(/33% OFF/);

    // original cost price should be present and struck-through
    const costPrice = await page.locator('[data-testid^="text-cost-price-"]').first();
    await expect(costPrice).toBeVisible();
    await expect(costPrice).toHaveClass(/line-through/);

    // selling price present
    const selling = await page.locator('[data-testid^="text-selling-price-"]').first();
    await expect(selling).toHaveText(/GHS\s*100(\.00)?/);
  });

  test('infers original price when only discount is provided and displays badge', async ({ page }) => {
    await page.route('**/api/products*', (route) => route.fulfill({ status: 200, body: JSON.stringify(productWithDiscountOnly) }));
    await page.goto('/');

    // badge should show 20% OFF
    await page.waitForSelector('[data-testid^="badge-discount-"]', { timeout: 5000 });
    const badge = await page.locator('[data-testid^="badge-discount-"]').first();
    await expect(badge).toHaveText(/20% OFF/);

    // inferred original price should be displayed (80 / (1 - 0.2) = 100.00)
    const costPrice = await page.locator('[data-testid^="text-cost-price-"]').first();
    await expect(costPrice).toHaveText(/GHS\s*100(\.00)?/);
  });
});
