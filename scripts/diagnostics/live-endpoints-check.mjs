#!/usr/bin/env node
import { createHash } from "node:crypto";
/**
 * Read-only checks of KiyuMart's public frontend and backend endpoints.
 * No credentials, API keys, user records, writes, login, or deployment.
 * Only prints HTTP metadata and selected, non-sensitive response fields.
 */
// A non-sensitive fingerprint of the 26 active category IDs in the connected
// KiyuMart Supabase project at the audit date. Detects a different live DB.
const expectedCategoryFingerprint = "e7a9e899e3a1ddf3c3cbbdd46c068363";
const endpoints = [
  { name: "Render API health", url: "https://kiyumart-api.onrender.com/api/health", kind: "health" },
  { name: "Netlify API proxy health", url: "https://kiyumartofficial.netlify.app/api/health", kind: "health" },
  { name: "Render public categories", url: "https://kiyumart-api.onrender.com/api/categories", kind: "categories" },
  { name: "Netlify public categories", url: "https://kiyumartofficial.netlify.app/api/categories", kind: "categories" },
  { name: "Netlify homepage", url: "https://kiyumartofficial.netlify.app/", kind: "html" },
];

let failed = false;
for (const target of endpoints) {
  const started = Date.now();
  try {
    const res = await fetch(target.url, {
      headers: { Accept: target.kind === "html" ? "text/html" : "application/json" },
      redirect: "follow",
      signal: AbortSignal.timeout(60000),
    });
    const type = res.headers.get("content-type") || "unknown";
    let expected = false, summary = "";
    const raw = (await res.text()).slice(0, 100000);
    if (target.kind === "health") {
      try {
        const json = JSON.parse(raw);
        expected = json?.status === "ok" && json?.database === "connected" && res.status === 200;
        summary = "status=" + String(json?.status || "unknown") +
          ", database=" + String(json?.database || "unknown");
      } catch {
        summary = "not JSON health";
      }
    } else if (target.kind === "categories") {
      try {
        const json = JSON.parse(raw);
        const categories = Array.isArray(json) ? json
          : Array.isArray(json.categories) ? json.categories : null;
        expected = res.status === 200 && categories !== null;
        summary = categories === null ? "JSON but not a category array" : "public category count=" + categories.length;
        if (categories) {
          const ids = categories.map(c => String(c.id || ""));
          const digest = createHash("md5").update(ids.sort().join("|")).digest("hex");
          const matchesDatabase = ids.every(Boolean) && digest === expectedCategoryFingerprint;
          expected = expected && matchesDatabase;
          summary += ", connected Supabase category fingerprint=" + (matchesDatabase ? "MATCH" : "MISMATCH") +
            " (" + digest + ")";
        }
      } catch {
        summary = "not JSON categories";
      }
    } else {
      expected = res.status === 200 && type.includes("text/html");
      summary = "HTML=" + type.includes("text/html");
    }
    console.log(JSON.stringify({ endpoint: target.name, status: res.status, contentType: type, elapsedMs: Date.now() - started, expected, summary }));
    if (!expected) failed = true;
  } catch (e) {
    console.log(JSON.stringify({ endpoint: target.name, error: e?.name || "NetworkError", message: String(e?.message || "").slice(0, 150), elapsedMs: Date.now() - started, expected: false }));
    failed = true;
  }
}
// Verify all seven preserved banner image paths through the live Netlify proxy.
// Only check image headers; do not fetch or print product/customer data.
const bannerPaths = [
  "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png",
  "/attached_assets/stock_images/Islamic_fashion_hero_banner_6bb20763.png",
  "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png",
  "/attached_assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png",
  "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png",
  "/attached_assets/stock_images/Burgundy_velvet_abaya_with_pearls_c19f2d40.png",
  "/attached_assets/stock_images/Women's_accessories_category_image_091f4ac1.png",
];
for (const [index, imagePath] of bannerPaths.entries()) {
  const started = Date.now();
  try {
    const res = await fetch("https://kiyumartofficial.netlify.app" + imagePath, {
      method: "GET",
      signal: AbortSignal.timeout(25000),
    });
    const type = res.headers.get("content-type") || "unknown";
    const ok = res.ok && type.startsWith("image/");
    console.log(JSON.stringify({ endpoint: "Preserved banner image " + (index + 1),
      status: res.status, contentType: type, elapsedMs: Date.now() - started,
      expected: ok }));
    if (res.body) await res.body.cancel();
    if (!ok) failed = true;
  } catch (e) {
    failed = true;
    console.log(JSON.stringify({ endpoint: "Preserved banner image " + (index + 1),
      error: e?.name || "NetworkError", elapsedMs: Date.now() - started,
      expected: false }));
  }
}

if (failed) {
  console.error("One or more live endpoints failed read-only checks; no remediation was attempted.");
  process.exitCode = 1;
} else {
  console.log("All public endpoint checks succeeded. Authentication, database credentials, and role-specific functions remain unverified.");
}
