// Interaction checks against the local preview (sample data only; non-localhost requests blocked).
import { createRequire } from "module";
const require = createRequire(new URL("../../package.json", import.meta.url));
const { chromium } = require("playwright");
const OUT = process.env.OUT_DIR || "preview-shots";
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ["--no-sandbox"] });
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? " — " + extra : ""}`);

async function ctxFor(mobile) {
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36" }
    : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await ctx.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  return ctx;
}
const errorsOf = (page) => { const e = []; page.on("pageerror", (x) => e.push(x.message)); return e; };

// ── Phone product page ──────────────────────────────────────────────
{
  const ctx = await ctxFor(true); const page = await ctx.newPage(); const errs = errorsOf(page);
  await page.goto("http://localhost:5173/product/p1", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: /View details/ }).click();
  await page.waitForTimeout(800);
  const pressed = await page.locator('section[aria-label="Choose product options"] button[aria-pressed="true"]').allTextContents();
  check("phone: no size preselected", !pressed.some((t) => ["M", "L", "XL", "S"].includes(t.trim())), `pressed=${JSON.stringify(pressed)}`);
  const cta = (await page.locator("button", { hasText: /Select a size|Add to cart/ }).last().textContent())?.trim();
  check("phone: button says 'Select a size'", cta === "Select a size", cta);
  const swatch = await page.locator('button[aria-label="Choose Burgundy"] span').evaluate((el) => getComputedStyle(el).backgroundColor);
  check("phone: Burgundy swatch is burgundy (not teal)", swatch === "rgb(122, 22, 38)", swatch);
  check("phone: seller row shown", await page.getByTestId("pdp-seller-row").isVisible(), (await page.getByTestId("pdp-seller-row").textContent())?.replace(/\s+/g, " "));
  await page.screenshot({ path: `${OUT}/phone-sheet-before-size.png` });
  await page.getByRole("button", { name: "L", exact: true }).first().click();
  await page.waitForTimeout(400);
  const cta2 = (await page.locator("button", { hasText: /Select a size|Add to cart/ }).last().textContent())?.trim();
  check("phone: after choosing L, button says 'Add to cart'", cta2 === "Add to cart", cta2);
  await page.locator('section[aria-label="Choose product options"]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await page.waitForTimeout(400);
  check("phone: related products shown in sheet", await page.getByTestId("pdp-related").isVisible());
  await page.screenshot({ path: `${OUT}/phone-sheet-bottom.png` });
  await page.getByRole("button", { name: /Size guide/ }).click();
  await page.waitForTimeout(500);
  const guideText = await page.locator('section[aria-label="Size and fit guide"]').textContent();
  check("phone: desktop-entered size guide visible (L row)", /Garment measurements/.test(guideText) && /108 cm/.test(guideText), "");
  await page.screenshot({ path: `${OUT}/phone-size-guide-legacy.png` });
  check("phone: no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}

// ── Phone /stores and login colour ──────────────────────────────────
{
  const ctx = await ctxFor(true); const page = await ctx.newPage();
  await page.goto("http://localhost:5173/stores", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  const hasOldHeader = await page.getByText("Browse Stores").isVisible().catch(() => false);
  check("phone: /stores uses the new storefront-tiles page", !hasOldHeader);
  await page.screenshot({ path: `${OUT}/phone-stores.png` });
  await page.goto("http://localhost:5173/auth", { waitUntil: "networkidle" }); await page.waitForTimeout(1200);
  const html = await page.content();
  check("phone: login uses teal (#009688), no dark green", /rgb\(0, 150, 136\)|#009688/i.test(html) && !/1A4A3C|rgb\(26, 74, 60\)/i.test(html));
  await page.screenshot({ path: `${OUT}/phone-login.png` });
  await ctx.close();
}

// ── Desktop product page ────────────────────────────────────────────
{
  const ctx = await ctxFor(false); const page = await ctx.newPage(); const errs = errorsOf(page);
  await page.goto("http://localhost:5173/product/p1", { waitUntil: "networkidle" }); await page.waitForTimeout(2000);
  const btn = (await page.getByTestId("button-add-to-cart").textContent())?.trim();
  check("desktop: button says 'Select a size' until a size is chosen", btn === "Select a size", btn);
  await page.screenshot({ path: `${OUT}/desktop-pdp-before-size.png` });
  await page.locator("[data-size-picker] button", { hasText: /^L$/ }).first().click();
  await page.waitForTimeout(400);
  const btn2 = (await page.getByTestId("button-add-to-cart").textContent())?.trim();
  check("desktop: after choosing L, 'Add to Cart'", /Add to Cart/.test(btn2 || ""), btn2);
  const sizes = await page.locator("[data-size-picker] button").allTextContents();
  check("desktop: sizes smallest→largest", JSON.stringify(sizes.map((s) => s.trim())) === JSON.stringify(["M", "L", "XL"]), JSON.stringify(sizes));
  await page.screenshot({ path: `${OUT}/desktop-pdp-size-chosen.png` });
  const dPrice = (await page.getByTestId("text-selling-price").textContent())?.trim();
  check("desktop: price matches phone/checkout (GH₵552.50)", /552\.50/.test(dPrice || ""), dPrice);
  check("desktop: no page errors", errs.length === 0, errs.slice(0, 2).join(" | "));
  await ctx.close();
}
console.log(results.join("\n"));
await browser.close();
