import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 90 * 1000,
  retries: 1,
  workers: 2,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    viewport: { width: 1280, height: 800 },
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'on',
  },
  webServer: [
    {
      command: 'npx tsx server/index.ts',
      url: 'http://localhost:5000/api/health',
      timeout: 60 * 1000,
      reuseExistingServer: true,
    },
    {
      command: 'npx vite --host',
      url: 'http://localhost:5173',
      timeout: 60 * 1000,
      reuseExistingServer: true,
    },
  ],
});
