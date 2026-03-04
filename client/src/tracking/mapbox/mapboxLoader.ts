import { USE_PROVIDER } from "@/tracking/config";

let loaderPromise: Promise<any> | null = null;
let mapboxConfigPromise: Promise<void> | null = null;
const MAP_PROVIDER_MODE_KEY = "map_provider_mode";
type MapProviderMode = "mapbox" | "open_source";

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
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing) {
      if ((existing as any).dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(`Failed loading script: ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.addEventListener(
      "load",
      () => {
        (script as any).dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    script.addEventListener("error", () => reject(new Error(`Failed loading script: ${src}`)), { once: true });
    document.head.appendChild(script);
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
  if ((window as any).mapboxgl) return (window as any).mapboxgl;
  await ensureMapboxRuntimeConfig();
  if (!loaderPromise) {
    loaderPromise = (async () => {
      try {
        const version = String(
          (window as any).__MAPBOX_GL_VERSION__ ||
            (import.meta.env as any).VITE_MAPBOX_GL_VERSION ||
            "v3.4.0",
        ).trim();
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
