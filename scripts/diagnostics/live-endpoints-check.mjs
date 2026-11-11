#!/usr/bin/env node
/**
 * Read-only checks of KiyuMart's public frontend and backend endpoints.
 * No credentials, API keys, user records, writes, login, or deployment.
 * Only prints HTTP metadata and selected, non-sensitive response fields.
 */
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
if (failed) {
  console.error("One or more live endpoints failed read-only checks; no remediation was attempted.");
  process.exitCode = 1;
} else {
  console.log("All public endpoint checks succeeded. Authentication, database credentials, and role-specific functions remain unverified.");
}
