import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const gridExists = !!(await page.$('.mt-8.grid'));
  console.log('grid exists?', gridExists);
  await page.evaluate(() => {
    const g = document.querySelector('.mt-8.grid') as HTMLElement | null;
    if (g) {
      console.log('[PAGE] before grid-template', window.getComputedStyle(g).getPropertyValue('grid-template-columns'));
      g.style.gridTemplateColumns = 'repeat(12, 1fr)';
      console.log('[PAGE] after grid-template', window.getComputedStyle(g).getPropertyValue('grid-template-columns'));
    }
  });
  await page.waitForTimeout(100);
  const cols = await page.$$('.mt-8.grid > *');
  console.log('cols count', cols.length);
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i];
    const cls = await (await c.getProperty('className')).jsonValue();
    const box = await c.boundingBox();
    console.log(i, cls, box);
  }
  await browser.close();
})();