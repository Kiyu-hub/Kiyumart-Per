import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

test.beforeAll(async ({ request }: { request: APIRequestContext }) => {
  // Ensure test users exist
  await request.post('http://localhost:5000/api/seed/test-users');
});

// Use programmatic login and set cookie to avoid triggering rate limits from repeated UI logins
async function setAuthCookie(page: any, request: any, email: string) {
  const res = await request.post('http://localhost:5000/api/test/token', { data: { email } });
  if (!res.ok()) throw new Error('Failed to get test token');
  const body = await res.json();
  const token = body.token;
  // Use url when setting cookie to ensure it's attached to the Vite dev origin
  // Inject a cookie via page script so it's available to the frontend and sent on requests
  await page.addInitScript(`() => { document.cookie = "token=${token}; path=/"; }`);
}

test.beforeEach(async ({ request, page }) => {
  await setAuthCookie(page, request, 'superadmin@kiyumart.com');
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
