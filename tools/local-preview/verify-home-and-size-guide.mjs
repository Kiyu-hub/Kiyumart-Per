import { createRequire } from "module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const OUT = process.env.OUT_DIR || "preview-shots";
const b = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--no-sandbox"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36" });
await ctx.route("**/*", (r) => (["localhost","127.0.0.1"].includes(new URL(r.request().url()).hostname) ? r.continue() : r.abort()));
const page = await ctx.newPage(); const res = [];
await page.goto("http://localhost:5173/", { waitUntil: "networkidle" }); await page.waitForTimeout(2500);
const allTile = await page.locator('button[aria-label="All stores"], button[aria-label="All categories"]').count();
res.push(`${allTile === 0 ? "PASS" : "FAIL"} home: no "All" circle (found ${allTile})`);
await page.screenshot({ path: `${OUT}/home-no-all-tile.png` });
for (const [id, want, label] of [["p1", "body-women", "women"], ["p8", "body-men", "men"]]) {
  await page.goto(`http://localhost:5173/product/${id}`, { waitUntil: "networkidle" }); await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /View details/ }).click(); await page.waitForTimeout(600);
  await page.getByRole("button", { name: /Size guide/ }).click(); await page.waitForTimeout(800);
  const src = await page.getByTestId("legacy-guide-body-figure").getAttribute("src").catch(() => null);
  res.push(`${src && src.includes(want) ? "PASS" : "FAIL"} ${label}'s item shows ${want} figure (${src})`);
  await page.locator('section[aria-label="Size and fit guide"]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/size-guide-${label}.png` });
}
console.log(res.join("\n")); await b.close();
