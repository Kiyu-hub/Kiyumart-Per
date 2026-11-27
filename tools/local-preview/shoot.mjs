// Screenshots of the local preview. Blocks every request that isn't localhost.
import { createRequire } from "module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");

const [, , outPrefix, query = "", width = "390", height = "844", scheme = "light", mobile = "1"] = process.argv;
const isMobile = mobile === "1";
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--no-sandbox"] });
const ctx = await browser.newContext({
  viewport: { width: +width, height: +height },
  deviceScaleFactor: 2,
  isMobile,
  hasTouch: isMobile,
  colorScheme: scheme,
  userAgent: isMobile
    ? "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36"
    : undefined,
});
await ctx.route("**/*", (route) => {
  const u = new URL(route.request().url());
  return ["localhost", "127.0.0.1"].includes(u.hostname) ? route.continue() : route.abort();
});
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5173/${query}`, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(3500);
// Dismiss location/cookie prompts if present (no data is sent anywhere).
for (const label of ["Not now", "Skip", "Maybe later", "Dismiss", "Close"]) {
  const b = page.getByRole("button", { name: label }).first();
  if (await b.isVisible().catch(() => false)) await b.click().catch(() => {});
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${outPrefix}-top.png` });
await page.screenshot({ path: `${outPrefix}-full.png`, fullPage: true });
console.log(outPrefix, "errors:", errors.length ? errors.slice(0, 3).join(" | ") : "none");
await browser.close();
