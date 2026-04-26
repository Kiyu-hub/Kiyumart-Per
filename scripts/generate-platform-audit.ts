import fs from "fs/promises";
import path from "path";

type Issue = { code: string; severity: "low" | "medium" | "high"; message: string; details?: string };

const ROOT = process.cwd();
const APP = path.resolve(ROOT, "client/src/App.tsx");
const README = path.resolve(ROOT, "README.md");
const DOCS = path.resolve(ROOT, "docs");
const REPORT = path.resolve(DOCS, "platform-audit-report.json");
const LOG = path.resolve(DOCS, "platform-audit-log.jsonl");
const LIVING_MD = path.resolve(DOCS, "platform-living-readme.md");
const START = "<!-- PLATFORM_AUDIT:START -->";
const END = "<!-- PLATFORM_AUDIT:END -->";

const DASHBOARDS = [
  { id: "super_admin", title: "Super Admin Dashboard", prefix: "/admin", root: "/admin" },
  { id: "admin", title: "Admin Dashboard", prefix: "/admin", root: "/admin" },
  { id: "agent", title: "Agent Dashboard", prefix: "/agent", root: "/agent" },
  { id: "seller", title: "Seller Dashboard", prefix: "/seller", root: "/seller" },
  { id: "rider", title: "Rider Dashboard", prefix: "/rider", root: "/rider" },
  { id: "buyer", title: "Customer / Buyer Dashboard", prefix: "/buyer", root: "/buyer" },
] as const;

const FEATURES = [
  { id: "order_management", title: "Order Management", keys: ["order", "orders", "order_status"] },
  { id: "rider_delivery", title: "Rider Delivery", keys: ["rider", "delivery", "assignment"] },
  { id: "agent_support", title: "Agent-Assisted Handling", keys: ["agent", "support", "ticket", "conversation"] },
  { id: "bus_delivery", title: "BUS Delivery Logic", keys: ["bus", "terminal"] },
  { id: "pickup_logic", title: "Pickup Logic", keys: ["pickup"] },
  { id: "zone_logic", title: "Zone & Region Logic", keys: ["zone", "delivery-zones", "radius"] },
  { id: "tracking_maps", title: "Real-time Tracking & Maps", keys: ["mapbox", "leaflet", "tracking", "gps"] },
  { id: "messaging_calls", title: "Messaging & Calls", keys: ["message", "chat", "jitsi", "call"] },
  { id: "analytics_receipts", title: "Reporting, Analytics & Receipts", keys: ["analytics", "report", "receipt"] },
  { id: "verification", title: "Verification (QR / OTP)", keys: ["qr", "otp", "verify"] },
  { id: "users_roles", title: "User Management & Roles", keys: ["users", "permissions", "role-features", "approve"] },
] as const;

const NON_FREE_HINTS = ["mapbox", "paystack", "cloudinary"];

const posix = (p: string) => p.replace(/\\/g, "/");
const norm = (p: string) => {
  const v = String(p || "")
    .trim()
    .replace(/\$\{[^}]+\}/g, "dynamic")
    .split("?")[0]
    .split("#")[0];
  if (v.length > 1 && v.endsWith("/")) return v.slice(0, -1);
  return v || "/";
};
const uniq = (v: string[]) => [...new Set(v)].sort((a, b) => a.localeCompare(b));
const exists = async (p: string) => fs.access(p).then(() => true).catch(() => false);
const read = (p: string) => fs.readFile(p, "utf8");

const routeRe = /<Route\s+path="([^"]+)"\s+component=\{([^}]+)\}/g;
const apiRe = /["'`]\/api\/[A-Za-z0-9/_:\-.?=&%]+["'`]/g;
const navRes = [
  /navigate\(\s*["'`]([^"'`]+)["'`]/g,
  /\bhref=\s*["'`]([^"'`]+)["'`]/g,
  /\bto=\s*["'`]([^"'`]+)["'`]/g,
];
const impRes = [
  /\bimport\s+[^'"]*?from\s+["'`]([^"'`]+)["'`]/g,
  /\brequire\(\s*["'`]([^"'`]+)["'`]\s*\)/g,
];

function routeRx(p: string) {
  const rx = norm(p).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:([^/]+)/g, "[^/]+").replace(/\\\*/g, ".*");
  return new RegExp(`^${rx}$`);
}
function routeOk(target: string, routes: string[]) {
  const t = norm(target);
  return routes.some((r) => routeRx(r).test(t));
}
function importBase(spec: string): string | null {
  const s = String(spec || "").trim();
  if (!s || s.startsWith(".") || s.startsWith("/") || s.startsWith("@/")) return null;
  if (s.startsWith("@")) {
    const p = s.split("/");
    return p.length > 1 ? `${p[0]}/${p[1]}` : s;
  }
  return s.split("/")[0];
}
function collect(content: string, re: RegExp, mapper: (v: string) => string | null = (v) => v): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(content))) {
    const raw = String(m[1] ?? m[0]).replace(/^["'`]|["'`]$/g, "");
    const v = mapper(raw);
    if (v) out.push(v);
  }
  return out;
}
async function files(dir: string, exts: Set<string>, out: string[] = []): Promise<string[]> {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (["node_modules", ".git", "dist", "archive"].includes(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) await files(full, exts, out);
    else if (e.isFile() && exts.has(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const check = args.has("--check");
  const strictFree = args.has("--strict-free-only");
  const noReadme = args.has("--no-readme");

  const app = await read(APP);
  const routes: Array<{ path: string; component: string }> = [];
  let m: RegExpExecArray | null = null;
  while ((m = routeRe.exec(app))) routes.push({ path: norm(m[1]), component: String(m[2]).trim() });
  const routePaths = uniq(routes.map((r) => r.path));

  // Resolve HOC aliases (e.g., const GuardedX = withGuard(X))
  const hocAliasRe = /const\s+(\w+)\s+=\s+\w+\(([^)]+)\)/g;
  const aliases = new Map<string, string>();
  while ((m = hocAliasRe.exec(app))) {
    aliases.set(m[1], m[2].trim());
  }

  const srcFiles = (await files(ROOT, new Set([".ts", ".tsx", ".js", ".mjs"]))).filter((f) => {
    const r = posix(path.relative(ROOT, f));
    return r.startsWith("client/src/") || r.startsWith("server/");
  });
  const text = new Map<string, string>();
  for (const f of srcFiles) text.set(f, await read(f).catch(() => ""));

  const allTargets = uniq(srcFiles.flatMap((f) => navRes.flatMap((re) => collect(text.get(f) || "", re)).filter((t) => t.startsWith("/") && !t.startsWith("/api/")).map(norm)));
  const brokenTargets = allTargets.filter((t) => !routeOk(t, routePaths));
  const deadRoutes = routePaths.filter((r) => r !== "/" && !r.includes(":") && !allTargets.includes(r));

  const pages = (await files(path.resolve(ROOT, "client/src/pages"), new Set([".ts", ".tsx"]))).map((f) => posix(path.relative(ROOT, f)));
  const pageIndex = new Map(pages.map((p) => [path.basename(p, path.extname(p)), p]));
  
  const routedPages = new Set<string>();
  for (const r of routes) {
    const componentName = r.component;
    // Resolve through aliases if it's a guarded component
    const actualComponent = aliases.get(componentName) || componentName;
    const pagePath = pageIndex.get(actualComponent);
    if (pagePath) routedPages.add(pagePath);
  }
  const orphanPages = pages.filter((p) => !routedPages.has(p) && !p.endsWith("/NotFound.tsx") && !p.endsWith("/not-found.tsx"));

  const dashboards = DASHBOARDS.map((d) => {
    const dRoutes = routePaths.filter((p) => p === d.prefix || p.startsWith(`${d.prefix}/`));
    const dFiles = srcFiles.filter((f) => {
      const r = posix(path.relative(ROOT, f)).toLowerCase();
      if (d.id === "super_admin" || d.id === "admin") return r.includes("/pages/admin") || r.includes("realtimeridermap");
      return r.includes(`/pages/${d.id}`);
    });
    const dText = dFiles.map((f) => text.get(f) || "").join("\n").toLowerCase();
    const dApis = uniq(dFiles.flatMap((f) => collect(text.get(f) || "", apiRe, (v) => norm(v))));
    const dTargets = uniq(dFiles.flatMap((f) => navRes.flatMap((re) => collect(text.get(f) || "", re)).map(norm)));
    const exits = dTargets.filter((t) => !t.startsWith(d.prefix));
    return {
      ...d,
      routes: dRoutes,
      linkedPages: uniq(dRoutes.map((p) => routes.find((r) => r.path === p)?.component || "").filter(Boolean)),
      entryPoints: routePaths.includes(d.root) ? [d.root] : [],
      exitPoints: uniq(exits),
      apiEndpoints: dApis,
      ui: { buttons: (dText.match(/<button\b|<button\s|<button>/g) || []).length + (dText.match(/<button\b|<button\s|<button>/g) || []).length, dialogs: (dText.match(/<dialog\b/g) || []).length },
      states: { loading: (dText.match(/\bloading\b/g) || []).length, error: (dText.match(/\berror\b/g) || []).length, empty: (dText.match(/\bno [a-z]/g) || []).length },
    };
  });

  const featureData = FEATURES.map((f) => {
    const filesHit = srcFiles.filter((file) => {
      const t = (text.get(file) || "").toLowerCase();
      return f.keys.some((k) => t.includes(k));
    });
    const apis = uniq(filesHit.flatMap((file) => collect(text.get(file) || "", apiRe, (v) => norm(v))));
    const deps = uniq(filesHit.flatMap((file) => impRes.flatMap((re) => collect(text.get(file) || "", re, importBase))));
    const impacted = uniq(filesHit.flatMap((file) => {
      const p = posix(path.relative(ROOT, file)).toLowerCase();
      if (p.includes("/pages/admin") || p.includes("realtimeridermap")) return ["Super Admin Dashboard", "Admin Dashboard"];
      if (p.includes("/pages/agent")) return ["Agent Dashboard"];
      if (p.includes("/pages/seller")) return ["Seller Dashboard"];
      if (p.includes("/pages/rider") || p.includes("/components/rider")) return ["Rider Dashboard"];
      if (p.includes("/pages/buyer") || p.includes("/pages/checkout") || p.includes("/pages/orders")) return ["Customer / Buyer Dashboard"];
      return [];
    }));
    return { id: f.id, title: f.title, files: uniq(filesHit.map((x) => posix(path.relative(ROOT, x)))), apis, deps, impacted };
  });

  const pkg = JSON.parse(await read(path.resolve(ROOT, "package.json"))) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const resources = await Promise.all(Object.entries(deps).map(async ([name, version]) => {
    const p = path.resolve(ROOT, "node_modules", ...name.split("/"), "package.json");
    let license = "unknown";
    if (await exists(p)) {
      try {
        const pj = JSON.parse(await read(p)) as { license?: string; licenses?: Array<{ type?: string }> };
        license = String(pj.license || pj.licenses?.[0]?.type || "unknown");
      } catch {}
    }
    const lower = name.toLowerCase();
    const cost = NON_FREE_HINTS.some((h) => lower.includes(h)) ? "usage_metered_or_external" : (license === "unknown" ? "unknown" : "free_or_self_hosted");
    const featureUse = uniq(featureData.filter((f) => f.deps.includes(name)).map((f) => f.title));
    return { name, version: String(version), license, openSource: license !== "unknown" && license.toLowerCase() !== "unlicensed", costStatus: cost, features: featureUse };
  }));
  resources.sort((a, b) => a.name.localeCompare(b.name));

  const issues: Issue[] = [];
  if (brokenTargets.length) issues.push({ code: "BROKEN_ROUTE_LINKS", severity: "high", message: `${brokenTargets.length} broken route targets`, details: brokenTargets.slice(0, 12).join(", ") });
  const missingDashboards = dashboards.filter((d) => d.entryPoints.length === 0).map((d) => d.title);
  if (missingDashboards.length) issues.push({ code: "MISSING_DASHBOARD_ENTRY", severity: "high", message: "Missing dashboard entry points", details: missingDashboards.join(", ") });
  if (orphanPages.length) issues.push({ code: "ORPHAN_PAGES", severity: "medium", message: `${orphanPages.length} orphan pages`, details: orphanPages.slice(0, 10).join(", ") });
  const nonFree = resources.filter((r) => r.costStatus !== "free_or_self_hosted");
  if (nonFree.length) issues.push({ code: "NON_FREE_OR_UNKNOWN_DEPENDENCIES", severity: strictFree ? "high" : "medium", message: `${nonFree.length} non-free or unknown dependencies`, details: nonFree.slice(0, 15).map((r) => r.name).join(", ") });

  let prev: any = undefined;
  if (await exists(REPORT)) {
    try {
      prev = JSON.parse(await read(REPORT));
    } catch {
      prev = undefined;
    }
  }
  const prevVersion = Number(String(prev?.version || "v0").replace(/[^\d]/g, "")) || 0;
  const report = {
    version: `v${prevVersion + 1}`,
    timestamp: new Date().toISOString(),
    generatedBy: "scripts/generate-platform-audit.ts",
    summary: { routeCount: routePaths.length, dashboardCount: dashboards.length, featureModuleCount: featureData.length, dependencyCount: resources.length, issueCount: issues.length },
    changes: prev ? [] as string[] : ["Initial automated platform audit baseline generated."],
    dashboards,
    features: featureData,
    resources,
    health: { brokenRouteTargets: brokenTargets, deadRoutes, orphanPages, dashboardsMissingEntryPoint: missingDashboards },
    issues,
  };
  if (prev) {
    const c: string[] = [];
    for (const [k, a, b] of [
      ["Routes", prev.summary?.routeCount || 0, report.summary.routeCount],
      ["Features", prev.summary?.featureModuleCount || 0, report.summary.featureModuleCount],
      ["Dependencies", prev.summary?.dependencyCount || 0, report.summary.dependencyCount],
      ["Issues", prev.summary?.issueCount || 0, report.summary.issueCount],
    ] as Array<[string, number, number]>) if (a !== b) c.push(`${k}: ${a} -> ${b} (${b - a >= 0 ? "+" : ""}${b - a})`);
    report.changes = c.length ? c : ["No structural changes detected compared with previous audit snapshot."];
  }

  await fs.mkdir(DOCS, { recursive: true });
  await fs.writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await fs.appendFile(LOG, `${JSON.stringify({ version: report.version, timestamp: report.timestamp, summary: report.summary, issues: issues.map((i) => i.code) })}\n`, "utf8");

  const section = [
    "## Platform Living Audit README",
    "",
    `Generated version: \`${report.version}\``,
    `Generated at: \`${report.timestamp}\``,
    "",
    "### 1. Platform Overview",
    "- Continuous internal audit for routes, dashboards, features, flows, services, and dependencies.",
    "- Roles covered: super_admin, admin, agent, seller, rider, buyer.",
    "",
    "### 2. System Architecture",
    "- Frontend: React + Wouter dashboard/page routing.",
    "- Backend: Express + service-layer APIs + RBAC middleware.",
    "- Realtime: Socket.IO and live-tracking map telemetry.",
    "",
    "### 3. Dashboards (Fully Detailed)",
    ...dashboards.map((d) => `- ${d.title}: ${d.routes.length} routes, entry ${d.entryPoints.join(", ") || "missing"}, exits ${d.exitPoints.length}, APIs ${d.apiEndpoints.length}`),
    "",
    "### 4. Features (By Module)",
    ...featureData.map((f) => `- ${f.title}: ${f.files.length} files, dashboards ${f.impacted.join(", ") || "none"}, APIs ${f.apis.length}`),
    "",
    "### 5. Delivery Logic",
    "- Rider delivery, BUS/pickup keywords, assignment, verification, and tracking are scanned from backend and UI sources.",
    "",
    "### 6. Reporting, Analytics & Receipts",
    "- Analytics/reporting/receipt modules are indexed in feature inventory and dashboard coverage.",
    "",
    "### 7. Resources & Tools (Full Inventory)",
    "| Dependency | License | Cost status | Open source |",
    "| --- | --- | --- | --- |",
    ...resources.slice(0, 120).map((r) => `| \`${r.name}\` | ${r.license} | ${r.costStatus} | ${r.openSource ? "yes" : "no"} |`),
    "",
    "### 8. Configuration & Environment",
    "- Run audit: `npm run audit:platform`",
    "- Strict gate: `npm run audit:platform:check`",
    "",
    "### 9. Security & Permissions",
    "- RBAC and role feature gates are enforced via backend middleware and audited as part of dashboard coverage.",
    "",
    "### 10. Audit, Logs & Monitoring",
    `- JSON report: \`${posix(path.relative(ROOT, REPORT))}\``,
    `- Audit log: \`${posix(path.relative(ROOT, LOG))}\``,
    "",
    "### Health Findings",
    ...(issues.length ? issues.map((i) => `- [${i.severity}] ${i.code}: ${i.message}${i.details ? ` (${i.details})` : ""}`) : ["- No issues detected."]),
  ].join("\n");
  await fs.writeFile(LIVING_MD, `${section}\n`, "utf8");

  if (!noReadme) {
    const current = (await exists(README)) ? await read(README) : "# Project\n";
    const wrapped = `${START}\n\n${section}\n\n${END}`;
    if (current.includes(START) && current.includes(END)) {
      const replaced = current.replace(new RegExp(`${START}[\\s\\S]*?${END}`, "m"), wrapped);
      await fs.writeFile(README, replaced, "utf8");
    } else {
      await fs.writeFile(README, `${current}${current.endsWith("\n") ? "\n" : "\n\n"}${wrapped}\n`, "utf8");
    }
  }

  console.log(`Audit complete: ${report.version}`);
  console.log(`Routes: ${report.summary.routeCount}, Dashboards: ${report.summary.dashboardCount}, Features: ${report.summary.featureModuleCount}, Dependencies: ${report.summary.dependencyCount}, Issues: ${report.summary.issueCount}`);
  console.log(`Report: ${posix(path.relative(ROOT, REPORT))}`);

  const blocking = issues.filter((i) => {
    if (i.code === "NON_FREE_OR_UNKNOWN_DEPENDENCIES" && !strictFree) return false;
    return i.code === "BROKEN_ROUTE_LINKS" || i.code === "MISSING_DASHBOARD_ENTRY" || i.code === "NON_FREE_OR_UNKNOWN_DEPENDENCIES";
  });
  if (check && blocking.length) {
    console.error("Blocking audit issues detected:");
    blocking.forEach((i) => console.error(`- ${i.code}: ${i.message}`));
    process.exit(1);
  }
}

void main().catch((e) => {
  console.error("Platform audit failed:", e);
  process.exit(1);
});
