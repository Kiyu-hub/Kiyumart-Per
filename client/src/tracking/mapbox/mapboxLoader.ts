import { USE_PROVIDER } from "@/tracking/config";

let loaderPromise: Promise<any> | null = null;
let mapboxConfigPromise: Promise<void> | null = null;

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

export async function loadMapboxGl(): Promise<any> {
  if (typeof window === "undefined") {
    throw new Error("Mapbox GL can only load in browser");
  }
  if ((window as any).mapboxgl) return (window as any).mapboxgl;
  if (!mapboxConfigPromise) {
    mapboxConfigPromise = (async () => {
      if (resolveMapboxAccessToken()) return;
      try {
        const response = await fetch("/api/public/map-provider-config", {
          credentials: "include",
        });
        if (!response.ok) return;
        const payload = await response.json();
        const token = String(payload?.mapboxAccessToken || "").trim();
        const styleUrl = String(payload?.mapboxStyleUrl || "").trim();
        if (styleUrl) {
          (window as any).__MAPBOX_STYLE_URL__ = styleUrl;
        }
        if (!token) return;
        (window as any).__MAPBOX_ACCESS_TOKEN__ = token;
        try {
          if (styleUrl) {
            window.localStorage.setItem("mapbox_style_url", styleUrl);
          }
          window.localStorage.setItem("mapbox_access_token", token);
        } catch {
          // Ignore storage write errors.
        }
      } catch {
        // Ignore remote token lookup failures and continue with local fallbacks.
      }
    })();
  }
  await mapboxConfigPromise;
  if (!loaderPromise) {
    loaderPromise = (async () => {
      const version = String((import.meta.env as any).VITE_MAPBOX_GL_VERSION || "v3.4.0");
      const base = `https://api.mapbox.com/mapbox-gl-js/${version}`;
      ensureStylesheet(`${base}/mapbox-gl.css`);
      await appendScript(`${base}/mapbox-gl.js`);
      if (!(window as any).mapboxgl) {
        throw new Error("Mapbox GL failed to initialize");
      }
      return (window as any).mapboxgl;
    })();
  }
  return loaderPromise;
}

export function resolveMapboxAccessToken(): string {
  const envToken = String((import.meta.env as any).VITE_MAPBOX_ACCESS_TOKEN || "").trim();
  if (envToken) return envToken;
  if (typeof window === "undefined") return "";
  const winToken = String(
    (window as any).__MAPBOX_ACCESS_TOKEN__ ||
      (window as any).MAPBOX_ACCESS_TOKEN ||
      "",
  ).trim();
  if (winToken) return winToken;
  try {
    const stored = String(window.localStorage.getItem("mapbox_access_token") || "").trim();
    if (stored) return stored;
  } catch {
    // Ignore storage read errors.
  }
  return "";
}

export function resolveMapboxStyleUrl(): string {
  const envStyle = String((import.meta.env as any).VITE_MAPBOX_STYLE_URL || "").trim();
  if (envStyle) return envStyle;
  if (typeof window === "undefined") return "mapbox://styles/mapbox/dark-v11";

  const winStyle = String((window as any).__MAPBOX_STYLE_URL__ || "").trim();
  if (winStyle) return winStyle;

  try {
    const stored = String(window.localStorage.getItem("mapbox_style_url") || "").trim();
    if (stored) return stored;
  } catch {
    // Ignore storage read errors.
  }

  return "mapbox://styles/mapbox/dark-v11";
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
  return !disable && (forceEnable || USE_PROVIDER === "PROVIDER_A");
}
