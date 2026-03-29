import { USE_PROVIDER } from "@/tracking/config";

let loaderPromise: Promise<any> | null = null;
let mapboxConfigPromise: Promise<void> | null = null;
const MAP_PROVIDER_MODE_KEY = "map_provider_mode";
type MapProviderMode = "mapbox" | "open_source";
const DEFAULT_MAPBOX_GL_VERSION = "v3.17.0";
const SCRIPT_LOAD_TIMEOUT_MS = 15_000;

function normalizeMapboxGlVersion(raw: unknown): string {
  const fallback = DEFAULT_MAPBOX_GL_VERSION;
  const value = String(raw || "").trim();
  if (!value) return fallback;
  const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return fallback;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return fallback;
  // 3D model layers require modern Mapbox GL JS; reject older major versions.
  if (major < 3) return fallback;
  return `v${major}.${minor}.${patch}`;
}

function resolveMajorGlVersion(raw: unknown): number {
  const value = String(raw || "").trim();
  const match = value.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return 0;
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : 0;
}

function normalizeMapboxPublicToken(raw: unknown): string {
  const token = String(raw || "").trim();
  return token.startsWith("pk.") ? token : "";
}

function normalizeMapboxStyleUrl(raw: unknown): string {
  const style = String(raw || "").trim();
  if (!style) return "";
  if (style.startsWith("mapbox://styles/")) return style;
  if (style.startsWith("http://") || style.startsWith("https://")) return style;
  return "";
}

function buildApiUrl(path: string): string {
  const base = String((import.meta.env as any).VITE_API_URL || "").trim();
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

function clearRuntimeMapboxState(clearPersisted: boolean) {
  if (typeof window === "undefined") return;
  try {
    delete (window as any).__MAPBOX_ACCESS_TOKEN__;
    delete (window as any).__MAPBOX_STYLE_URL__;
    delete (window as any).__MAPBOX_GL_VERSION__;
  } catch {
    // Ignore window mutation failures.
  }
  if (!clearPersisted) return;
  try {
    window.localStorage.removeItem("mapbox_access_token");
    window.localStorage.removeItem("mapbox_style_url");
    window.localStorage.removeItem("mapbox_gl_version");
  } catch {
    // Ignore storage clear errors.
  }
}

function normalizeMapProviderMode(raw: unknown): MapProviderMode | null {
  const mode = String(raw || "").trim().toLowerCase();
  if (mode === "mapbox") return "mapbox";
  if (mode === "open_source" || mode === "open-source" || mode === "opensource") return "open_source";
  return null;
}

export function resolveMapProviderMode(): MapProviderMode {
  if (typeof window !== "undefined") {
    const winMode = normalizeMapProviderMode((window as any).__MAP_PROVIDER_MODE__);
    if (winMode) return winMode;
    try {
      const stored = normalizeMapProviderMode(window.localStorage.getItem(MAP_PROVIDER_MODE_KEY) || "");
      if (stored) return stored;
    } catch {
      // Ignore storage read errors.
    }
  }
  return "mapbox";
}

export function setMapProviderMode(mode: MapProviderMode): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeMapProviderMode(mode) || "mapbox";
  try {
    (window as any).__MAP_PROVIDER_MODE__ = normalized;
  } catch {
    // Ignore runtime write errors.
  }
  try {
    window.localStorage.setItem(MAP_PROVIDER_MODE_KEY, normalized);
  } catch {
    // Ignore storage write errors.
  }
  try {
    window.dispatchEvent(new CustomEvent("map_provider_mode_changed", { detail: { mode: normalized } }));
  } catch {
    // Ignore custom event errors.
  }
}

function appendScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const markState = (script: HTMLScriptElement, state: "loading" | "loaded" | "failed") => {
      script.dataset.state = state;
      if (state === "loaded") {
        script.dataset.loaded = "true";
        delete script.dataset.failed;
        return;
      }
      delete script.dataset.loaded;
      if (state === "failed") {
        script.dataset.failed = "true";
        return;
      }
      delete script.dataset.failed;
    };

    const waitForScript = (script: HTMLScriptElement, removeOnFailure: boolean) => {
      let timeoutId: number | null = null;
      const cleanup = () => {
        script.removeEventListener("load", handleLoad);
        script.removeEventListener("error", handleError);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };
      const fail = (message: string) => {
        cleanup();
        markState(script, "failed");
        if (removeOnFailure) {
          script.remove();
        }
        reject(new Error(message));
      };
      const handleLoad = () => {
        cleanup();
        markState(script, "loaded");
        resolve();
      };
      const handleError = () => fail(`Failed loading script: ${src}`);

      if ((window as any).mapboxgl) {
        markState(script, "loaded");
        resolve();
        return;
      }

      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", handleError, { once: true });
      timeoutId = window.setTimeout(() => {
        fail(`Timed out loading script: ${src}`);
      }, SCRIPT_LOAD_TIMEOUT_MS);
    };

    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      const existingState = String(existing.dataset.state || "").trim();
      const hasRuntime = Boolean((window as any).mapboxgl);
      const isLoaded = existing.dataset.loaded === "true" || existingState === "loaded";
      const isFailed = existing.dataset.failed === "true" || existingState === "failed";

      if (isLoaded && hasRuntime) {
        resolve();
        return;
      }

      if (isFailed || isLoaded) {
        existing.remove();
      } else {
        waitForScript(existing, true);
        return;
      }
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    markState(script, "loading");
    document.head.appendChild(script);
    waitForScript(script, true);
  });
}

function ensureStylesheet(href: string): void {
  if (document.querySelector(`link[href="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

export async function ensureMapboxRuntimeConfig(): Promise<void> {
  if (typeof window === "undefined") return;
  if (mapboxConfigPromise) {
    await mapboxConfigPromise;
    return;
  }
  mapboxConfigPromise = (async () => {
    try {
      const response = await fetch(buildApiUrl("/api/public/map-provider-config"), {
        credentials: "include",
      });
      if (!response.ok) return;
      const payload = await response.json();
      const token = normalizeMapboxPublicToken(payload?.mapboxAccessToken);
      const styleUrl = normalizeMapboxStyleUrl(payload?.mapboxStyleUrl);
      const glVersion = String(payload?.mapboxGlVersion || "").trim();
      const preferredMode = normalizeMapProviderMode(payload?.preferredMapMode);

      if (styleUrl) {
        (window as any).__MAPBOX_STYLE_URL__ = styleUrl;
      }
      if (glVersion) {
        (window as any).__MAPBOX_GL_VERSION__ = glVersion;
      }
      if (token) {
        (window as any).__MAPBOX_ACCESS_TOKEN__ = token;
      }
      if (preferredMode) {
        setMapProviderMode(preferredMode);
      }

      try {
        if (styleUrl) {
          window.localStorage.setItem("mapbox_style_url", styleUrl);
        }
        if (glVersion) {
          window.localStorage.setItem("mapbox_gl_version", glVersion);
        }
        if (token) {
          window.localStorage.setItem("mapbox_access_token", token);
        }
      } catch {
        // Ignore storage write errors.
      }
    } catch {
      // Ignore remote config lookup failures and continue with local fallbacks.
    }
  })();
  await mapboxConfigPromise;
}

export async function reloadMapboxRuntimeConfig(clearPersisted = true): Promise<void> {
  mapboxConfigPromise = null;
  clearRuntimeMapboxState(clearPersisted);
  await ensureMapboxRuntimeConfig();
}

export function resetMapboxGlLoader(): void {
  loaderPromise = null;
}

export async function loadMapboxGl(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Mapbox GL can only load in browser");
  }
  if ((window as any).mapboxgl) {
    const runtimeVersion = String((window as any).mapboxgl?.version || "").trim();
    if (resolveMajorGlVersion(runtimeVersion) >= 3) {
      return (window as any).mapboxgl;
    }
    try {
      delete (window as any).mapboxgl;
    } catch {
      // Fallback to script reload path below.
    }
  }
  await ensureMapboxRuntimeConfig();
  if (!loaderPromise) {
    loaderPromise = (async () => {
      try {
        const version = normalizeMapboxGlVersion(
          (window as any).__MAPBOX_GL_VERSION__ ||
            (import.meta.env as any).VITE_MAPBOX_GL_VERSION ||
            DEFAULT_MAPBOX_GL_VERSION,
        );
        const base = `https://api.mapbox.com/mapbox-gl-js/${version}`;
        ensureStylesheet(`${base}/mapbox-gl.css`);
        await appendScript(`${base}/mapbox-gl.js`);
        if (!(window as any).mapboxgl) {
          throw new Error("Mapbox GL failed to initialize");
        }
        return (window as any).mapboxgl;
      } catch (error) {
        loaderPromise = null;
        throw error;
      }
    })();
  }
  return loaderPromise;
}

export function resolveMapboxAccessToken(): string {
  if (typeof window !== "undefined") {
    const winToken = normalizeMapboxPublicToken(
      (window as any).__MAPBOX_ACCESS_TOKEN__ ||
        (window as any).MAPBOX_ACCESS_TOKEN ||
        ""
    );
    if (winToken) return winToken;
  }
  const envToken = normalizeMapboxPublicToken((import.meta.env as any).VITE_MAPBOX_ACCESS_TOKEN);
  if (envToken) return envToken;
  if (typeof window === "undefined") return "";
  const winToken = normalizeMapboxPublicToken(
    (window as any).MAPBOX_ACCESS_TOKEN ||
      ""
  );
  if (winToken) return winToken;
  try {
    const stored = normalizeMapboxPublicToken(window.localStorage.getItem("mapbox_access_token") || "");
    if (stored) return stored;
  } catch {
    // Ignore storage read errors.
  }
  return "";
}

export function resolveMapboxStyleUrl(): string {
  if (typeof window !== "undefined") {
    const winStyle = normalizeMapboxStyleUrl((window as any).__MAPBOX_STYLE_URL__ || "");
    if (winStyle) return winStyle;
  }
  const envStyle = normalizeMapboxStyleUrl((import.meta.env as any).VITE_MAPBOX_STYLE_URL || "");
  if (envStyle) return envStyle;
  if (typeof window === "undefined") return "mapbox://styles/mapbox/navigation-night-v1";

  try {
    const stored = normalizeMapboxStyleUrl(window.localStorage.getItem("mapbox_style_url") || "");
    if (stored) return stored;
  } catch {
    // Ignore storage read errors.
  }

  return "mapbox://styles/mapbox/navigation-night-v1";
}

export function toMapboxRasterStyle(tileUrl: string, attribution?: string) {
  const normalized = String(tileUrl || "").replace("{r}", "");
  const tiles = normalized.includes("{s}")
    ? ["a", "b", "c"].map((subdomain) => normalized.replace("{s}", subdomain))
    : [normalized];

  return {
    version: 8,
    sources: {
      "raster-base": {
        type: "raster",
        tiles,
        tileSize: 256,
        attribution: attribution || "",
      },
    },
    layers: [
      {
        id: "raster-base-layer",
        type: "raster",
        source: "raster-base",
      },
    ],
  };
}

export function isMapboxGlPreferred(): boolean {
  const disable = String((import.meta.env as any).VITE_DISABLE_MAPBOX_GL || "").toLowerCase().trim() === "true";
  const forceEnable = String((import.meta.env as any).VITE_FORCE_MAPBOX_GL || "").toLowerCase().trim() === "true";
  if (disable) return false;
  const mode = resolveMapProviderMode();
  if (mode === "open_source") return false;
  if (mode === "mapbox") return true;
  return forceEnable || USE_PROVIDER === "PROVIDER_A";
}
