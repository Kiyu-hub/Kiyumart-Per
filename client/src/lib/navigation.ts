/**
 * Reliable "Back" for every page.
 *
 * `history.length > 1` can't tell whether the previous entry is a KiyuMart page
 * (a shared link, a new tab or a reload all count other sites/entries), so
 * Back could leave the app or do nothing. We stamp each in-app history entry
 * with its depth; Back goes to the previous KiyuMart page when there is one,
 * and otherwise to a sensible page for where the shopper is (never off-site).
 */
const IDX = "__kiyuIdx";
let current = 0;
let installed = false;

function readIdx(state: unknown): number {
  const n = Number((state as any)?.[IDX]);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function withIdx(state: unknown, idx: number) {
  if (state && typeof state === "object") return { ...(state as object), [IDX]: idx };
  return { [IDX]: idx };
}

export function installNavigationTracker(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  current = readIdx(window.history.state);
  const push = window.history.pushState.bind(window.history);
  const replace = window.history.replaceState.bind(window.history);
  window.history.pushState = (state: any, title: string, url?: string | URL | null) => {
    current += 1;
    return push(withIdx(state, current), title, url);
  };
  window.history.replaceState = (state: any, title: string, url?: string | URL | null) =>
    replace(withIdx(state, current), title, url);
  // Stamp the entry we landed on (keeps its depth across reloads).
  replace(withIdx(window.history.state, current), "", window.location.href);
  window.addEventListener("popstate", (e) => { current = readIdx(e.state); });
}

export function canGoBackInApp(): boolean {
  return current > 0;
}

/** Where Back goes when the page was opened directly (link, new tab, reload). */
export function fallbackFor(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p.startsWith("/admin")) return "/admin";
  if (p.startsWith("/seller/")) return "/seller";
  if (p.startsWith("/rider/")) return "/rider";
  if (p.startsWith("/agent/")) return "/agent";
  if (p.startsWith("/orders/") || p.startsWith("/track")) return "/orders";
  if (p.startsWith("/product/") || p.startsWith("/products/")) return "/products";
  return "/";
}

function navigateTo(path: string) {
  window.history.replaceState(null, "", path);
  // wouter listens to popstate as well as push/replace.
  window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
}

export function goBack(fallback?: string): void {
  if (typeof window === "undefined") return;
  if (canGoBackInApp()) {
    window.history.back();
    return;
  }
  navigateTo(fallback || fallbackFor(window.location.pathname));
}
