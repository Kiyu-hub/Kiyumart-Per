import { test, expect } from '@playwright/test';
import { getTestToken } from './test-utils';

test('admin and super-admin see Promotions nav item and can open page', async ({ page, request }) => {
  // Super admin
  let token = await getTestToken(request, 'superadmin@kiyumart.com');
  await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);

  // Visit admin dashboard and open nav
  await page.goto('http://localhost:5000/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="nav-item-promotions"]', { timeout: 10000 });

  await expect(page.locator('[data-testid="nav-item-promotions"]')).toBeVisible();
  await page.click('[data-testid="nav-item-promotions"]');
  await page.waitForURL('**/admin/promotions', { timeout: 5000 });
  await expect(page.locator('text=Promotional Ads')).toBeVisible();

  // Regular admin
  await page.context().clearCookies();
  token = await getTestToken(request, 'admin@kiyumart.com');
  await page.context().addCookies([{ name: 'token', value: token, domain: 'localhost', path: '/' }]);

  await page.goto('http://localhost:5000/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="nav-item-promotions"]', { timeout: 10000 });
  await expect(page.locator('[data-testid="nav-item-promotions"]')).toBeVisible();
  await page.click('[data-testid="nav-item-promotions"]');
  await page.waitForURL('**/admin/promotions', { timeout: 5000 });
  await expect(page.locator('text=Promotional Ads')).toBeVisible();
});