import { chromium } from 'playwright';
import fs from 'fs';
(async () => {
  const browser = await chromium.launch({ args: ['--disable-web-security'], headless: true });
  const page = await browser.newPage();
  console.log('Navigating to homepage');
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'domcontentloaded' });
  console.log('Waiting for Featured Products heading');
  await page.waitForSelector('text=Featured Products', { timeout: 8000 }).catch(()=>{ console.warn('Heading not found after timeout'); });
  // Wait for client JS and assets
  await page.waitForTimeout(2500);
  console.log('Attempting to extract product grid HTML');
  const grid = await page.locator('div.grid').first().elementHandle().catch(()=>null);
  const prodHtml = grid ? await page.locator('div.grid').first().innerHTML().catch(()=>null) : null;
  const screenshot = await page.screenshot({ fullPage: true });
  fs.writeFileSync('/tmp/home-snapshot.png', screenshot);
  console.log('Saved screenshot to /tmp/home-snapshot.png');
  console.log('Product grid snippet length:', prodHtml ? prodHtml.length : 'none');
  if (prodHtml) console.log(prodHtml.substring(0, 600));
  await browser.close();
})();
