/**
 * After a new release, a page that was opened on the previous version can ask
 * for a code file (chunk) that no longer exists, e.g.
 * "Failed to fetch dynamically imported module …/AdminDashboardConnected-XXXX.js".
 * Reloading once picks up the new version. A short session guard prevents a
 * reload loop if the file is genuinely missing.
 */
const KEY = "kiyumart_stale_chunk_reload_at";
const WINDOW_MS = 30_000;

export function isStaleChunkError(error: unknown): boolean {
  const msg = String((error as any)?.message ?? error ?? "");
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /ChunkLoadError|Loading chunk [\w-]+ failed/i.test(msg)
  );
}

/** Reloads once (per 30 s) and returns true if a reload was started. */
export function reloadForStaleChunk(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < WINDOW_MS) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    /* storage blocked: still try one reload */
  }
  window.location.reload();
  return true;
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
}
