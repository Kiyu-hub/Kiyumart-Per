/**
 * Frontend URL Resolution Utility
 * Validates FRONTEND_URL from environment and falls back to localhost if unavailable
 */

import axios from 'axios';

const DEFAULT_LOCAL_URL = 'http://localhost:5173';
const ENV_FRONTEND_URL = process.env.FRONTEND_URL || '';
const URL_CACHE = {
  url: null as string | null,
  source: null as 'env' | 'db' | 'cache' | null,
  timestamp: 0,
  cacheDuration: 60000, // 1 minute cache
};

async function checkUrlAccessibility(url: string): Promise<boolean> {
  if (!url) return false;

  try {
    await axios.head(url, {
      timeout: 5000,
      validateStatus: (status: number) => status < 500, // Treat 4xx as accessible
    });
    return true;
  } catch (error) {
    // URL is not accessible
    return false;
  }
}

/**
 * Get a valid frontend URL with automatic fallback
 * - Tries FRONTEND_URL from environment first
 * - Falls back to localhost if URL is down
 * - Caches result for 1 minute to avoid repeated health checks
 */
export async function getValidFrontendUrl(): Promise<string> {
  const now = Date.now();

  // Return cached result if still valid
  const cachedUrl = URL_CACHE.url;
  if (cachedUrl && now - URL_CACHE.timestamp < URL_CACHE.cacheDuration) {
    return cachedUrl;
  }

  // 1) Try DB-configured value (platform settings)
  try {
    const { storage } = await import('./storage');
    const settings = await storage.getPlatformSettings();
    const dbUrl = (settings as any).frontendUrl || '';
    if (dbUrl) {
      const normalized = dbUrl.replace(/\/$/, '');
      const ok = await checkUrlAccessibility(normalized);
      if (ok) {
        URL_CACHE.url = normalized;
        URL_CACHE.source = 'db';
        URL_CACHE.timestamp = now;
        console.log(`[FRONTEND_URL] Using DB-configured URL: ${URL_CACHE.url}`);
        return URL_CACHE.url;
      }
      console.warn(`[FRONTEND_URL] DB-configured URL (${dbUrl}) is not accessible, falling back to other sources`);
    }
  } catch (err) {
    // If storage is unavailable, continue to env fallback
    console.warn('[FRONTEND_URL] Could not read DB-configured frontendUrl:', (err as any)?.message || String(err));
  }

  // 2) Try environment FRONTEND_URL
  if (ENV_FRONTEND_URL) {
    const normalized = ENV_FRONTEND_URL.replace(/\/$/, '');
    const isAccessible = await checkUrlAccessibility(normalized);
    if (isAccessible) {
      URL_CACHE.url = normalized;
      URL_CACHE.source = 'env';
      URL_CACHE.timestamp = now;
      console.log(`[FRONTEND_URL] Using environment URL: ${URL_CACHE.url}`);
      return URL_CACHE.url;
    }
    console.warn(`[FRONTEND_URL] Environment URL (${ENV_FRONTEND_URL}) is not accessible, falling back to localhost`);
  }

  // 3) Fallback to localhost
  URL_CACHE.url = DEFAULT_LOCAL_URL;
  URL_CACHE.source = 'cache';
  URL_CACHE.timestamp = now;
  console.log(`[FRONTEND_URL] Using localhost fallback: ${DEFAULT_LOCAL_URL}`);
  return DEFAULT_LOCAL_URL;
}

/**
 * Get frontend URL synchronously with last known value
 * For use in time-sensitive paths (payments, redirects)
 * Falls back to provided request host if no cache available
 */
export function getFrontendUrlSync(requestHost?: string): string {
  // If cache is still valid, use it
  if (URL_CACHE.url && Date.now() - URL_CACHE.timestamp < URL_CACHE.cacheDuration) {
    return URL_CACHE.url;
  }

  // Fall back to environment variable if present
  if (ENV_FRONTEND_URL) {
    return ENV_FRONTEND_URL.replace(/\/$/, '');
  }

  // Use request host if provided
  if (requestHost) {
    return `${requestHost}`.replace(/\/$/, '');
  }

  // Final fallback
  return DEFAULT_LOCAL_URL;
}

/**
 * Validate and set frontend URL on server startup
 */
export async function validateFrontendUrlOnStartup(): Promise<string> {
  console.log('[STARTUP] Validating FRONTEND_URL...');

  const validUrl = await getValidFrontendUrl();
  console.log(`[STARTUP] Frontend URL resolved to: ${validUrl}`);

  return validUrl;
}

/**
 * Clear the URL cache to force re-validation on next check
 */
export function clearFrontendUrlCache(): void {
  URL_CACHE.url = null;
  URL_CACHE.timestamp = 0;
  console.log('[FRONTEND_URL] Cache cleared, will re-validate on next request');
}
