import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[PAGE-CONSOLE]', m.type(), m.text()));
  page.on('pageerror', (err) => console.log('[PAGE-ERROR]', err.message));
  page.on('requestfailed', (r) => console.log('[REQUEST-FAILED]', r.url(), r.failure()?.errorText));

  await page.goto('http://127.0.0.1:5000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  const cards = await page.locator('[data-testid^="card-product-"]');
  const count = await cards.count();
  console.log('product card count:', count);

  for (let i = 0; i < Math.min(8, count); i++) {
    const el = cards.nth(i);
    const id = await el.getAttribute('data-testid');
    const bbox = await el.boundingBox();
    const img = await el.locator('img').first().getAttribute('src').catch(() => null);
    const imgVisible = await el.locator('img').first().isVisible().catch(() => false);
    const style = await page.evaluate((node) => {
      const el = node as HTMLElement;
      const s = window.getComputedStyle(el);
      const parent = el.parentElement as HTMLElement | null;
      const ps = parent ? window.getComputedStyle(parent) : null;
      return {
        width: s.width,
        height: s.height,
        display: s.display,
        boxSizing: s.boxSizing,
        offsetWidth: el.offsetWidth,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        parentOffsetWidth: parent ? parent.offsetWidth : null,
        parentClientWidth: parent ? parent.clientWidth : null,
        parentDisplay: ps?.display || null,
      };
    }, await el.elementHandle());

    const inner = await el.innerHTML();

    // Detailed image style
    const imgStyles = await page.evaluate((n) => {
      const img = (n as HTMLElement).querySelector('img');
      if (!img) return null;
      const s = window.getComputedStyle(img);
      return {
        className: img.className,
        src: (img as HTMLImageElement).src,
        width: s.width,
        height: s.height,
        minWidth: s.minWidth,
        maxWidth: s.maxWidth,
        display: s.display,
        objectFit: (img as any).style?.objectFit || s.getPropertyValue('object-fit'),
      };
    }, await el.elementHandle());

    const nodeMeta = await page.evaluate((n) => {
      const el = n as HTMLElement;
      const parent = el.parentElement as HTMLElement | null;
      return {
        nodeName: el.nodeName,
        className: el.className,
        parentNodeName: parent?.nodeName || null,
        parentClassName: parent?.className || null,
      };
    }, await el.elementHandle());

    // Ancestor computed styles
    const ancestorStyles = await page.evaluate((n) => {
      const el = n as HTMLElement;
      const ancestors: any[] = [];
      let cur: HTMLElement | null = el;
      for (let i = 0; i < 12 && cur; i++) {
        const s = window.getComputedStyle(cur);
        const rect = cur.getBoundingClientRect();
        ancestors.push({
          nodeName: cur.nodeName,
          className: cur.className,
          width: s.width,
          minWidth: s.minWidth,
          maxWidth: s.maxWidth,
          display: s.display,
          boxSizing: s.boxSizing,
          position: s.position,
          transform: s.transform,
          float: s.cssFloat,
          justifySelf: s.getPropertyValue('justify-self'),
          alignSelf: s.getPropertyValue('align-self'),
          placeSelf: s.getPropertyValue('place-self'),
          flexBasis: s.flexBasis,
          flexGrow: s.flexGrow,
          flexShrink: s.flexShrink,
          rect: { width: rect.width, height: rect.height, x: rect.x, y: rect.y },
        });
        cur = cur.parentElement;
      }
      return ancestors;
    }, await el.elementHandle());

    const innerSnippet = inner ? inner.slice(0, 800).replace(/\s+/g, ' ') : '';
    const appliedRules = await page.evaluate((n) => {
      const el = n as HTMLElement;
      const inlineStyle = el.getAttribute('style');
      const matches: string[] = [];
      try {
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from((sheet as CSSStyleSheet).cssRules || [])) {
              if (rule && (rule as CSSStyleRule).selectorText && (rule as CSSStyleRule).selectorText.includes('.shadcn-card')) {
                matches.push((rule as CSSStyleRule).cssText);
              }
            }
          } catch(e) {
            // ignore CORS-restricted sheets
          }
        }
      } catch(e) {}
      return { matches, inlineStyle };
    }, await el.elementHandle());

    const { matches: rulesMatches, inlineStyle } = appliedRules;
    console.log(i, id, 'bbox', bbox, 'parentWidth', style.parentOffsetWidth, 'cardMeta', nodeMeta, 'imgVisible', imgVisible, 'imgStyles', imgStyles, 'ancestors', ancestorStyles, 'appliedRules', rulesMatches, 'inlineStyle', inlineStyle, innerSnippet ? `innerSnippet:${innerSnippet}` : '');
  }

  // Also inspect the grid container
  const grid = await page.locator('div.grid').first();
  const gridBBox = await grid.boundingBox().catch(() => null);
  const gridStyle = await page.evaluate((g) => {
    const s = window.getComputedStyle(g);
    return {
      gridTemplate: s.getPropertyValue('grid-template-columns'),
      autoColumns: s.getPropertyValue('grid-auto-columns'),
      autoFlow: s.getPropertyValue('grid-auto-flow'),
      className: (g as HTMLElement).className
    };
  }, await grid.elementHandle());
  console.log('grid bbox:', gridBBox, 'gridStyle:', gridStyle);

  await browser.close();
})();