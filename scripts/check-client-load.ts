import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  page.on('console', msg => console.log('[browser-console]', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('[page-error]', err.message));
  page.on('requestfailed', req => console.log('[request-failed]', req.url(), req.failure()?.errorText));

  await page.goto('http://localhost:5173', { waitUntil: 'domcontentloaded' });

  // Wait a bit for client initialization
  await page.waitForTimeout(4000);

  const html = await page.content();
  console.log('---- PAGE HTML SNIPPET ----');
  console.log(html.substring(0, 2000));

  await browser.close();
})();