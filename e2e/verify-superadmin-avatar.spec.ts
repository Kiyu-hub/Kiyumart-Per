import { test, expect } from '@playwright/test';

const SERVER = process.env.FRONTEND_URL || 'http://localhost:5173';
const API = process.env.BACKEND_URL || 'http://localhost:5000';

test.describe('Superadmin avatar / navigation', () => {
  test('avatar remains visible when clicking Dashboard nav item', async ({ page }) => {
    // Set dev auth cookie for superadmin
    await page.goto(`${API}/api/test/auth-cookie?email=superadmin@kiyumart.com`);

    // Open admin dashboard
    await page.goto(`${SERVER}/admin`, { waitUntil: 'networkidle' });

    // Ensure sidebar and avatar initials are present
    const initials = page.locator('text=SA').first();
    await expect(initials).toBeVisible({ timeout: 5000 });

    // Click the Dashboard nav item (should be present)
    const dashboardBtn = page.locator('[data-testid="nav-item-dashboard"]').first();
    await expect(dashboardBtn).toBeVisible({ timeout: 3000 });
    await dashboardBtn.click();

    // After clicking, avatar should still be visible
    await expect(initials).toBeVisible({ timeout: 3000 });
  });
});
