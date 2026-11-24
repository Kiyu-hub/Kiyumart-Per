/**
 * TEMPORARY old/new comparison switch for the mobile bottom navigation.
 *   ?nav=new     → shared Option A navigation (MobileBottomNavA) — DEFAULT
 *   ?nav=classic → original role-specific tab bar (kept as an escape hatch)
 * Remembered in this browser. The new bar became the default when the owner
 * approved the redesign for production on 2026-11-24.
 *
 * (The ?home=classic|fashion homepage switch was retired on 2026-11-24 when the
 * fashion homepage became the only mobile homepage.)
 */
export type MobileNavVariant = "classic" | "new";
const NAV_STORAGE_KEY = "kiyumart_nav_variant";

export function getMobileNavVariant(): MobileNavVariant {
  if (typeof window === "undefined") return "new";
  try {
    const param = new URLSearchParams(window.location.search).get("nav");
    if (param === "classic" || param === "new") {
      window.localStorage.setItem(NAV_STORAGE_KEY, param);
      return param;
    }
    return window.localStorage.getItem(NAV_STORAGE_KEY) === "classic" ? "classic" : "new";
  } catch {
    return "new";
  }
}
