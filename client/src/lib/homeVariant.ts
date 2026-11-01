/**
 * TEMPORARY old/new comparison switch for the mobile homepage redesign
 * (branch redesign/mobile-home-fashion). Remove once the product owner signs off.
 *
 *   /?home=fashion  → redesigned mobile home (MobileHomeFashion)
 *   /?home=classic  → original mobile home (MobileHome)
 *
 * The choice is remembered in this browser (localStorage) so in-app navigation
 * back to "/" keeps the same version. Default is "classic". Desktop is unaffected:
 * callers only use this on the mobile/tablet branch.
 */
export type MobileHomeVariant = "classic" | "fashion";

const STORAGE_KEY = "kiyumart_home_variant";

/**
 * TEMPORARY old/new comparison switch for the mobile bottom navigation.
 *   ?nav=new     → shared Option A navigation (MobileBottomNavA)
 *   ?nav=classic → original role-specific tab bar
 * Remembered in this browser; default "classic". Remove once signed off.
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

export function getMobileHomeVariant(): MobileHomeVariant {
  if (typeof window === "undefined") return "classic";
  try {
    const param = new URLSearchParams(window.location.search).get("home");
    if (param === "classic" || param === "fashion") {
      window.localStorage.setItem(STORAGE_KEY, param);
      return param;
    }
    return window.localStorage.getItem(STORAGE_KEY) === "fashion" ? "fashion" : "classic";
  } catch {
    return "classic";
  }
}
