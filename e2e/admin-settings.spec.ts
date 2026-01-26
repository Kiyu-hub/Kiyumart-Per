import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  // Ensure test users exist
  await request.post('http://localhost:5000/api/seed/test-users');
});

// Use programmatic login and set cookie to avoid triggering rate limits from repeated UI logins
test.beforeEach(async ({ request, page }) => {
  const loginRes = await request.post('http://localhost:5000/api/auth/login', {
    data: { email: 'superadmin@kiyumart.com', password: 'superadmin123' },
  });
  const rawSetCookie = (loginRes.headers()['set-cookie'] || '') as string;
  const m = rawSetCookie.match(/token=([^;]+);?/);
  const token = m ? m[1] : '';

  if (token) {
    await page.context().addCookies([
      { name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true },
    ]);
  }
});

test('multi-vendor toggle updates immediately and persists after reload', async ({ page }: { page: Page }) => {
  // go to admin settings (already authenticated via cookie)
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
