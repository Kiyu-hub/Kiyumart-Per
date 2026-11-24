/**
 * TEMPORARY old/new comparison switch for the mobile bottom navigation.
 *   ?nav=new     → shared Option A navigation (MobileBottomNavA)
 *   ?nav=classic → original role-specific tab bar
 * Remembered in this browser; default "classic". Remove once signed off.
 *
 * (The ?home=classic|fashion homepage switch was retired on 2026-11-24 when the
 * fashion homepage became the only mobile homepage.)
 */
export type MobileNavVariant = "classic" | "new";
const NAV_STORAGE_KEY = "kiyumart_nav_variant";

export function getMobileNavVariant(): MobileNavVariant {
  if (typeof window === "undefined") return "classic";
  try {
    const param = new URLSearchParams(window.location.search).get("nav");
    if (param === "classic" || param === "new") {
      window.localStorage.setItem(NAV_STORAGE_KEY, param);
      return param;
    }
    return window.localStorage.getItem(NAV_STORAGE_KEY) === "new" ? "new" : "classic";
  } catch {
    return "classic";
  }
}
