import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

async function setAuthCookie(page: Page, request: APIRequestContext, email: string) {
  const res = await request.post('http://localhost:5000/api/test/token', { data: { email } });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  const token = body.token;
  // Use url when setting cookie to ensure it's attached to the Vite dev origin
  // Inject a cookie via page script so it's available to the frontend and sent on requests
  await page.addInitScript(`() => { document.cookie = "token=${token}; path=/"; }`);
}

test.beforeAll(async ({ request }) => {
  await request.post('http://localhost:5000/api/seed/test-users');
});

test('Customer can create support ticket via UI', async ({ page, request }) => {
  await setAuthCookie(page, request, 'buyer@kiyumart.com');

  await page.goto('/support');
  await page.waitForSelector('[data-testid="text-page-title"]');
  const title = await page.textContent('[data-testid="text-page-title"]');
  expect(title).toContain('Customer Support');

  await page.click('[data-testid="button-new-ticket"]');
  await page.fill('[data-testid="input-ticket-subject"]', 'Playwright UI ticket');
  await page.fill('[data-testid="textarea-ticket-message"]', 'I need help with my order');
  await page.click('[data-testid="button-create-ticket"]');

  // Wait for the conversations list to show at least one ticket
  await page.waitForSelector('div[data-testid^="conversation-"]');
  const convs = await page.$$('[data-testid^="conversation-"]');
  expect(convs.length).toBeGreaterThanOrEqual(1);
});

test('Agent can view and respond to ticket via UI (assign & resolve)', async ({ page, request }) => {
  // Ensure there's at least one ticket created by the previous test
  await setAuthCookie(page, request, 'agent@kiyumart.com');

  await page.goto('/support');
  await page.waitForSelector('[data-testid="text-page-title"]');
  const title = await page.textContent('[data-testid="text-page-title"]');
  expect(title).toContain('Support Dashboard');

  // Wait for a conversation to appear
  await page.waitForSelector('div[data-testid^="conversation-"]');
  const convEl = await page.$('div[data-testid^="conversation-"]');
  expect(convEl).toBeTruthy();

  // Open conversation
  await convEl!.click();
  await page.waitForSelector('[data-testid="button-assign"]');
  await page.click('[data-testid="button-assign"]');

  // Assign should mark agentId and update status; wait for badge text change
  await page.waitForSelector('[data-testid="button-resolve"]');

  // Send a reply
  await page.fill('[data-testid="input-message"]', 'This is an agent reply');
  await page.click('[data-testid="button-send"]');

  // Resolve
  await page.click('[data-testid="button-resolve"]');

  // Verify the status badge shows 'resolved'
  await page.waitForSelector('text=resolved');
});

test('Admin can view support tickets via admin UI', async ({ page, request }) => {
  await setAuthCookie(page, request, 'admin@kiyumart.com');

  await page.goto('/admin/messages');
  await page.waitForSelector('h1');
  const heading = await page.textContent('h1');
  expect(heading).toBeTruthy();

  // There may be no messages in admin UI; ensure page loads
  await page.waitForLoadState('networkidle');
});
