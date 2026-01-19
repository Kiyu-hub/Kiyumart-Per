import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  // Ensure test users exist
  await request.post('http://localhost:5000/api/seed/test-users');
});

test('multi-vendor toggle updates immediately and persists after reload', async ({ page }: { page: Page }) => {
  // login
  await page.goto('/auth');
  await page.fill('[data-testid="input-login-email"]', 'superadmin@kiyumart.com');
  await page.fill('[data-testid="input-login-password"]', 'superadmin123');
  await page.click('[data-testid="button-login"]');

  // go to admin settings
  await page.goto('/admin/settings');
  await page.waitForSelector('[data-testid="label-store-mode"]');

  const label = await page.textContent('[data-testid="label-store-mode"]');
  const initialIsMulti = label?.includes('Multi-Vendor');

  // Trigger toggle
  await page.click('[data-testid="switch-store-mode"]');

  // Confirm the dialog
  await page.click('[data-testid="button-confirm-mode-change"]');

  // Immediately see change in UI
  const newLabel = await page.textContent('[data-testid="label-store-mode"]');
  expect(newLabel?.includes('Multi-Vendor')).toBe(!initialIsMulti);

  // Reload the page and ensure change persisted
  await page.reload();
  const persistedLabel = await page.textContent('[data-testid="label-store-mode"]');
  expect(persistedLabel?.includes('Multi-Vendor')).toBe(!initialIsMulti);
});
