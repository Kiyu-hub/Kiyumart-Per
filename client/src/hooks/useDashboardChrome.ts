import { useEffect } from "react";

/**
 * Marks <html> with `km-dash` while a dashboard page is open. On phones only,
 * index.css then swaps the dashboard "primary" colour (buttons, active items,
 * focus rings) from the admin green to the mobile brand teal #009688
 * (owner request 2026-11-25). Desktop and shop pages are unaffected.
 * Applied on <html> so dialogs/menus rendered in portals follow it too.
 */
export function useDashboardChrome() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("km-dash");
    return () => root.classList.remove("km-dash");
  }, []);
}
