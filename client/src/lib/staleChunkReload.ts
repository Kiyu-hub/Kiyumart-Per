import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/**
 * After a new release, a page that was opened on the previous version can ask
 * for a code file (chunk) that no longer exists, e.g.
 * "Failed to fetch dynamically imported module …/MobileProductDetails-XXXX.js".
 *
 * Recovery (never shows the raw error to shoppers):
 *  1st attempt: drop the cached start page, ask the service worker to update, reload.
 *  2nd attempt: remove the service worker and every cache, reload from the network.
 *  After that (file truly missing): a friendly "Refresh" screen.
 */
const KEY = "kiyumart_stale_chunk_attempts";
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 2;

export function isStaleChunkError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Unable to preload CSS/i.test(msg) ||
    /ChunkLoadError|Loading chunk [\w-]+ failed|Loading CSS chunk/i.test(msg)
  );
}

function readAttempts(): { count: number; at: number } {
  try {
    const raw = JSON.parse(sessionStorage.getItem(KEY) || "null");
    if (raw && Date.now() - Number(raw.at) < WINDOW_MS) return { count: Number(raw.count) || 0, at: Number(raw.at) };
  } catch { /* ignore */ }
  return { count: 0, at: 0 };
}

let reloading = false;

async function clearCaches(all: boolean) {
  try {
    if ("caches" in window) {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => all || /precache|html-cache|pages/i.test(n))
          .map((n) => caches.delete(n)),
      );
    }
  } catch { /* ignore */ }
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => (all ? r.unregister() : r.update().catch(() => undefined))));
    }
  } catch { /* ignore */ }
}

/** Starts a recovery reload. Returns false when attempts are used up. */
export function reloadForStaleChunk(): boolean {
  if (reloading) return true;
  const { count } = readAttempts();
  if (count >= MAX_ATTEMPTS) return false;
  reloading = true;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ count: count + 1, at: Date.now() }));
  } catch { /* storage blocked: still try */ }
  const done = () => window.location.reload();
  Promise.race([clearCaches(count >= 1), new Promise((r) => setTimeout(r, 2500))]).then(done, done);
  return true;
}

/** Manual "Refresh" button: wipe everything and reload. */
export function hardRefresh(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  const done = () => window.location.reload();
  Promise.race([clearCaches(true), new Promise((r) => setTimeout(r, 2500))]).then(done, done);
}

/**
 * Drop-in for React.lazy's loader: retries once (brief network blip), then
 * starts recovery and keeps the loading screen up instead of crashing.
 */
export function retryImport<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try {
      return await load();
    } catch (error) {
      if (!isStaleChunkError(error)) throw error;
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await load();
      } catch (again) {
        if (isStaleChunkError(again) && reloadForStaleChunk()) {
          return new Promise<T>(() => { /* page is reloading */ });
        }
        throw again;
      }
    }
  };
}

export function installStaleChunkReload(): void {
  if (typeof window === "undefined") return;
  // Vite fires this when a dynamic import's preload fails.
  window.addEventListener("vite:preloadError", (event) => {
    if (reloadForStaleChunk()) event.preventDefault();
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (isStaleChunkError(event.reason)) reloadForStaleChunk();
  });
  // A successful, settled page load resets the counter.
  window.addEventListener("load", () => {
    setTimeout(() => { try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }, WINDOW_MS);
  });
}

/** React.lazy with automatic recovery after a new release (use for every page). */
export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(retryImport(factory));
}
