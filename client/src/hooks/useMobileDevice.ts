import { useEffect, useState, useCallback } from "react";

export type Orientation = "portrait" | "landscape";

interface MobileDeviceState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  orientation: Orientation;
  isTouch: boolean;
  isPWA: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  safeAreaBottom: number;
}

export function useMobileDevice(): MobileDeviceState {
  const getState = useCallback((): MobileDeviceState => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ua = navigator.userAgent;
    return {
      isMobile: width < 768,
      isTablet: width >= 768 && width < 1024,
      isDesktop: width >= 1024,
      orientation: height > width ? "portrait" : "landscape",
      isTouch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
      isPWA:
        window.matchMedia("(display-mode: standalone)").matches ||
        (window.navigator as any).standalone === true,
      isIOS: /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream,
      isAndroid: /Android/.test(ua),
      safeAreaBottom: parseInt(
        getComputedStyle(document.documentElement)
          .getPropertyValue("--safe-bottom")
          .trim() || "0",
        10,
      ),
    };
  }, []);

  const [state, setState] = useState<MobileDeviceState>(getState);

  useEffect(() => {
    const handler = () => setState(getState());
    window.addEventListener("resize", handler, { passive: true });
    window.addEventListener("orientationchange", handler, { passive: true });
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, [getState]);

  return state;
}
