let loaderPromise: Promise<any> | null = null;

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

export function isMapboxGlPreferred(): boolean {
  const provider = String((import.meta.env as any).VITE_MAP_PROVIDER || "PROVIDER_A").toUpperCase();
  const token = String((import.meta.env as any).VITE_MAPBOX_ACCESS_TOKEN || "").trim();
  const disable = String((import.meta.env as any).VITE_DISABLE_MAPBOX_GL || "").toLowerCase().trim() === "true";
  return provider === "PROVIDER_A" && Boolean(token) && !disable;
}

