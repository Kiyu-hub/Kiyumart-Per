# KiyuMart — Single-Codebase Mobile Integration Prompt

## MISSION STATEMENT

Evolve the existing production KiyuMart React/TypeScript/Tailwind web app into a **single-codebase, dual-surface platform** that delivers a world-class native-feel iOS-style mobile experience AND preserves the existing desktop experience — without touching, replacing, or breaking any existing logic, API calls, state, business rules, or desktop UI. All changes are **additive only**.

**Rule #1:** Never delete or modify existing code. Only add alongside it.  
**Rule #2:** The `md:` breakpoint (768px) remains the single toggle between mobile and desktop.  
**Rule #3:** All business logic (routes, guards, API hooks, Socket.IO, payments, order state machine) is shared 100%.  
**Rule #4:** The same admin dashboard that works on desktop also works on mobile — one action affects all surfaces.

---

## WHAT ALREADY EXISTS (DO NOT TOUCH)

The codebase already has these responsive foundations — build ON TOP of them:

| File | What it does | Your role |
|------|-------------|-----------|
| `MobileStorefrontNav.tsx` | Bottom nav (Home/Search/Cart/Wishlist/Account), `md:hidden` | **Enhance** — replace with full iOS bottom tab bar |
| `DashboardLayout.tsx` | Desktop sidebar + mobile hamburger overlay | **Extend** — add mobile bottom tab bar for dashboard on mobile |
| `DashboardSidebar.tsx` | Full 256px sidebar (40+ items) | **Keep as-is** — only shown `md:flex` |
| `Header.tsx` | Storefront header with mobile hamburger | **Enhance** — add mobile search bar treatment |
| `index.css` | Safe area insets, PWA mode, touch targets, `md:` media queries | **Extend** — add new mobile utilities here |
| `tailwind.config.ts` | Full Tailwind theme with `md:` as primary breakpoint | **Extend** — add `xs:` breakpoint (475px) if needed |
| All 150+ page components | Full desktop implementation | **Never touch desktop code** — only add `md:hidden` / `hidden md:flex` wrappers where needed |
| All `useQuery` / `useMutation` hooks | Data fetching, cache | **Reuse 100%** |
| All Socket.IO handlers | Realtime | **Reuse 100%** |
| Route guards (`withExternalRiderRouteGuard`, etc.) | Feature gating | **Reuse 100%** |
| Payment flow | Paystack inline | **Reuse 100%** |
| Order state machine | Status transitions | **Reuse 100%** |

---

## STRATEGY OVERVIEW

The integration has **6 layers**, all additive:

```
Layer 1: useMobileDevice() hook  ←  single source of truth for "am I on mobile?"
Layer 2: Global CSS additions     ←  mobile utilities, animations, iOS feel
Layer 3: PWA manifest + meta      ←  installable on iOS/Android homescreen  
Layer 4: Mobile layout shells     ←  wrappers that show on mobile only
Layer 5: Mobile page variants     ←  mobile-optimized views for key screens
Layer 6: Component enhancements   ←  responsive improvements to shared components
```

Each layer is independent. The app continues working at every step.

---

## LAYER 1 — Core Mobile Hook

### File: `client/src/hooks/useMobileDevice.ts` (NEW)

```typescript
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";

export type DeviceType = "mobile" | "tablet" | "desktop";
export type Orientation = "portrait" | "landscape";

interface MobileDeviceState {
  isMobile: boolean;         // < 768px
  isTablet: boolean;         // 768px - 1023px
  isDesktop: boolean;        // >= 1024px
  orientation: Orientation;
  isTouch: boolean;          // has touch capability
  isPWA: boolean;            // launched from homescreen
  isIOS: boolean;            // Safari on iPhone/iPad
  isAndroid: boolean;        // Chrome/Firefox on Android
  safeAreaBottom: number;    // notch/gesture bar height in px
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
        10
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

// Lightweight CSS-only alternative (no JS re-render) — use for className logic
export function useMobileClass(
  mobileClass: string,
  desktopClass: string = ""
): string {
  const { isMobile } = useMobileDevice();
  return isMobile ? mobileClass : desktopClass;
}
```

### File: `client/src/hooks/useSwipeGesture.ts` (NEW)

```typescript
import { useRef, useCallback } from "react";

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number; // px, default 50
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  threshold = 50,
}: SwipeHandlers) {
  const startX = useRef(0);
  const startY = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      const adx = Math.abs(dx);
      const ady = Math.abs(dy);

      if (adx > threshold && adx > ady) {
        if (dx > 0) onSwipeRight?.();
        else onSwipeLeft?.();
      } else if (ady > threshold && ady > adx) {
        if (dy > 0) onSwipeDown?.();
        else onSwipeUp?.();
      }
    },
    [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]
  );

  return { onTouchStart, onTouchEnd };
}
```

### File: `client/src/hooks/useHaptic.ts` (NEW)

```typescript
// Vibration API — works on Android Chrome; iOS requires user gesture but degrades gracefully
type HapticStyle = "light" | "medium" | "heavy" | "success" | "error" | "warning";

const patterns: Record<HapticStyle, number[]> = {
  light: [10],
  medium: [20],
  heavy: [40],
  success: [10, 50, 10],
  error: [50, 30, 50],
  warning: [30, 20, 30],
};

export function useHaptic() {
  const trigger = (style: HapticStyle = "medium") => {
    if (!("vibrate" in navigator)) return;
    navigator.vibrate(patterns[style]);
  };
  return { trigger };
}
```

---

## LAYER 2 — Global CSS Additions

### Append to `client/src/index.css` (ADDITIONS ONLY — never remove existing)

```css
/* ============================================================
   KIYUMART MOBILE ENHANCEMENT LAYER
   All rules below are NEW additions. Nothing above is changed.
   ============================================================ */

/* ---- iOS-Style Spring Animations ---- */
@keyframes slideUpSpring {
  0%   { transform: translateY(100%); opacity: 0; }
  60%  { transform: translateY(-4px); opacity: 1; }
  80%  { transform: translateY(2px); }
  100% { transform: translateY(0); }
}

@keyframes slideDownOut {
  0%   { transform: translateY(0); opacity: 1; }
  100% { transform: translateY(100%); opacity: 0; }
}

@keyframes fadeScaleIn {
  0%   { transform: scale(0.94); opacity: 0; }
  60%  { transform: scale(1.01); }
  100% { transform: scale(1); opacity: 1; }
}

@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pressScale {
  0%   { transform: scale(1); }
  50%  { transform: scale(0.96); }
  100% { transform: scale(1); }
}

@keyframes bounceIn {
  0%   { transform: scale(0.3); opacity: 0; }
  50%  { transform: scale(1.05); opacity: 1; }
  70%  { transform: scale(0.9); }
  100% { transform: scale(1); }
}

/* ---- Mobile Utility Classes ---- */
.mobile-slide-up     { animation: slideUpSpring 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.mobile-fade-scale   { animation: fadeScaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.mobile-bounce-in    { animation: bounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
.mobile-press:active { animation: pressScale 0.15s ease; transform: scale(0.96); }

/* ---- Skeleton Shimmer ---- */
.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    hsl(var(--muted)) 25%,
    hsl(var(--muted) / 0.5) 50%,
    hsl(var(--muted)) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  border-radius: 8px;
}

/* ---- Mobile Bottom Sheet ---- */
.mobile-sheet-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  z-index: 60;
  animation: fadeScaleIn 0.2s ease forwards;
}

.mobile-sheet {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 70;
  background: hsl(var(--background));
  border-radius: 20px 20px 0 0;
  padding-bottom: env(safe-area-inset-bottom, 0px);
  animation: slideUpSpring 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  max-height: 92dvh;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.mobile-sheet-handle {
  width: 36px;
  height: 4px;
  background: hsl(var(--muted-foreground) / 0.3);
  border-radius: 999px;
  margin: 12px auto 4px;
}

/* ---- Frosted Glass ---- */
.glass {
  background: hsl(var(--background) / 0.85);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
}

.glass-card {
  background: hsl(var(--card) / 0.9);
  backdrop-filter: saturate(150%) blur(12px);
  -webkit-backdrop-filter: saturate(150%) blur(12px);
  border: 1px solid hsl(var(--border) / 0.6);
}

/* ---- Mobile Typography Enhancements ---- */
@media (max-width: 767px) {
  .mobile-large-title {
    font-size: 34px;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1.1;
  }
  .mobile-title-1 { font-size: 28px; font-weight: 700; letter-spacing: -0.3px; }
  .mobile-title-2 { font-size: 22px; font-weight: 700; }
  .mobile-title-3 { font-size: 20px; font-weight: 600; }
  .mobile-headline { font-size: 17px; font-weight: 600; }
  .mobile-body     { font-size: 17px; font-weight: 400; }
  .mobile-subhead  { font-size: 15px; font-weight: 400; }
  .mobile-caption  { font-size: 12px; font-weight: 400; }
}

/* ---- Mobile Card Style ---- */
@media (max-width: 767px) {
  .mobile-card {
    border-radius: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
    border: 1px solid hsl(var(--border) / 0.5);
    overflow: hidden;
  }
  .mobile-grouped-list {
    background: hsl(var(--muted) / 0.4);
    border-radius: 12px;
    overflow: hidden;
  }
  .mobile-grouped-list-item {
    background: hsl(var(--card));
    padding: 14px 16px;
    border-bottom: 1px solid hsl(var(--border) / 0.5);
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
  }
  .mobile-grouped-list-item:last-child { border-bottom: none; }
}

/* ---- Scroll Momentum & Hide Scrollbar on Mobile ---- */
@media (max-width: 767px) {
  .mobile-scroll {
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    scroll-snap-type: x mandatory;
  }
  .mobile-scroll::-webkit-scrollbar { display: none; }
  .mobile-scroll-snap-child { scroll-snap-align: start; }

  /* Horizontal pill scroll row */
  .mobile-pill-scroll {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding: 4px 16px;
    -webkit-overflow-scrolling: touch;
  }
  .mobile-pill-scroll::-webkit-scrollbar { display: none; }
}

/* ---- Status Bar Space (PWA / Standalone) ---- */
@media (display-mode: standalone) {
  .mobile-status-bar-pad {
    padding-top: env(safe-area-inset-top, 44px);
  }
}

/* ---- Touch Ripple Effect ---- */
.touch-ripple {
  position: relative;
  overflow: hidden;
  -webkit-tap-highlight-color: transparent;
}
.touch-ripple::after {
  content: "";
  position: absolute;
  inset: 0;
  background: currentColor;
  opacity: 0;
  border-radius: inherit;
  transition: opacity 0.15s;
}
.touch-ripple:active::after { opacity: 0.08; }

/* ---- Pull to Refresh Indicator ---- */
.pull-to-refresh-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  color: hsl(var(--muted-foreground));
}

/* ---- Mobile Navigation Transitions ---- */
@media (max-width: 767px) {
  .page-transition-enter {
    animation: fadeScaleIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
}

/* ---- Dark Mode Mobile Refinements ---- */
@media (max-width: 767px) {
  .dark .mobile-card {
    box-shadow: 0 1px 3px rgba(0,0,0,0.3), 0 4px 16px rgba(0,0,0,0.2);
  }
  .dark .glass {
    background: rgba(28, 28, 30, 0.85);
  }
}
```

---

## LAYER 3 — PWA Manifest + Meta Tags

### File: `client/index.html` (ADD to `<head>` — do not change anything else)

```html
<!-- PWA & Mobile Meta (ADDITIONS ONLY) -->
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="KiyuMart">
<meta name="theme-color" content="#16A34A" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#000000" media="(prefers-color-scheme: dark)">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">

<!-- Apple Touch Icons -->
<link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png">
<link rel="apple-touch-icon" sizes="152x152" href="/icons/apple-touch-152.png">
<link rel="apple-touch-icon" sizes="120x120" href="/icons/apple-touch-120.png">

<!-- Apple Splash Screens (iPhone 14 Pro, 13, SE) -->
<link rel="apple-touch-startup-image" href="/splash/splash-1179x2556.png" 
      media="(device-width: 393px) and (device-height: 852px) and (-webkit-device-pixel-ratio: 3)">
<link rel="apple-touch-startup-image" href="/splash/splash-1170x2532.png"
      media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3)">
<link rel="apple-touch-startup-image" href="/splash/splash-750x1334.png"
      media="(device-width: 375px) and (device-height: 667px) and (-webkit-device-pixel-ratio: 2)">

<!-- PWA Manifest -->
<link rel="manifest" href="/manifest.webmanifest">
```

### File: `client/public/manifest.webmanifest` (NEW)

```json
{
  "name": "KiyuMart",
  "short_name": "KiyuMart",
  "description": "Your market, delivered.",
  "start_url": "/",
  "display": "standalone",
  "display_override": ["standalone", "minimal-ui"],
  "background_color": "#FFFFFF",
  "theme_color": "#16A34A",
  "orientation": "portrait-primary",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    { "name": "View Cart", "short_name": "Cart", "url": "/cart", "icons": [{ "src": "/icons/shortcut-cart.png", "sizes": "96x96" }] },
    { "name": "My Orders", "short_name": "Orders", "url": "/orders", "icons": [{ "src": "/icons/shortcut-orders.png", "sizes": "96x96" }] },
    { "name": "Search", "short_name": "Search", "url": "/search", "icons": [{ "src": "/icons/shortcut-search.png", "sizes": "96x96" }] }
  ],
  "screenshots": [
    { "src": "/screenshots/mobile-home.png", "sizes": "390x844", "type": "image/png", "form_factor": "narrow", "label": "KiyuMart Home" },
    { "src": "/screenshots/desktop-home.png", "sizes": "1280x800", "type": "image/png", "form_factor": "wide", "label": "KiyuMart Desktop" }
  ],
  "categories": ["shopping", "lifestyle"],
  "prefer_related_applications": false
}
```

---

## LAYER 4 — Mobile Layout Shells

These are **new components** that wrap the existing page content on mobile.
They do not modify the wrapped pages — they add navigation chrome around them.

### File: `client/src/components/mobile/MobileStorefrontShell.tsx` (NEW)

This **replaces** the existing `MobileStorefrontNav.tsx` with a full iOS-quality bottom tab bar.
The existing file can remain — just update `App.tsx` to use this instead on mobile.

```tsx
import { useLocation } from "wouter";
import { useCart } from "@/hooks/useCart";          // existing hook
import { useNotifications } from "@/hooks/useNotifications"; // existing hook
import { useAuth } from "@/hooks/useAuth";           // existing hook
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";

// Icons — use existing lucide-react icons already in the project
import {
  Home, Search, ShoppingCart, Heart, User,
  Store, Package, BarChart3, MessageCircle, Bell
} from "lucide-react";

interface Tab {
  label: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
  roles?: string[];   // if set, only show for these roles
}

const BUYER_TABS: Tab[] = [
  { label: "Home",    icon: Home,         href: "/" },
  { label: "Browse",  icon: Search,       href: "/products" },
  { label: "Cart",    icon: ShoppingCart, href: "/cart" },    // badge from cart count
  { label: "Orders",  icon: Package,      href: "/orders" },
  { label: "Profile", icon: User,         href: "/profile" },
];

const SELLER_TABS: Tab[] = [
  { label: "Dashboard", icon: Home,          href: "/seller" },
  { label: "Products",  icon: Package,       href: "/seller/products" },
  { label: "Orders",    icon: ShoppingCart,  href: "/seller/orders" },
  { label: "Analytics", icon: BarChart3,     href: "/seller/analytics" },
  { label: "Profile",   icon: User,          href: "/profile" },
];

const RIDER_TABS: Tab[] = [
  { label: "Dashboard",   icon: Home,          href: "/rider" },
  { label: "Deliveries",  icon: Package,       href: "/rider/deliveries" },
  { label: "Earnings",    icon: BarChart3,     href: "/rider/earnings" },
  { label: "Messages",    icon: MessageCircle, href: "/chat" },
  { label: "Profile",     icon: User,          href: "/profile" },
];

const ADMIN_TABS: Tab[] = [
  { label: "Dashboard",  icon: Home,      href: "/admin" },
  { label: "Orders",     icon: Package,   href: "/admin/orders" },
  { label: "Users",      icon: User,      href: "/admin/users" },
  { label: "Analytics",  icon: BarChart3, href: "/admin/analytics" },
  { label: "More",       icon: Store,     href: "/admin/settings" },
];

// Routes where bottom nav should be hidden entirely
const HIDE_NAV_ROUTES = [
  "/auth", "/checkout", "/payment", "/live-tracking",
  "/rider/route", "/pickup-agent/verify",
];

export function MobileBottomTabBar() {
  const { isMobile } = useMobileDevice();
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { trigger: haptic } = useHaptic();

  // Reuse existing cart/notification state
  const cartCount = useCart()?.items?.length ?? 0;
  const unreadNotifications = 0; // wire to existing notifications hook

  if (!isMobile) return null;

  // Hide on specific routes
  const shouldHide = HIDE_NAV_ROUTES.some(route => location.startsWith(route));
  if (shouldHide) return null;

  // Pick tabs based on role
  let tabs: Tab[] = BUYER_TABS;
  if (user?.role === "seller")       tabs = SELLER_TABS;
  else if (user?.role === "rider")   tabs = RIDER_TABS;
  else if (user?.role === "admin" || user?.role === "super_admin") tabs = ADMIN_TABS;

  const isActive = (href: string) => {
    if (href === "/") return location === "/";
    return location.startsWith(href);
  };

  return (
    <>
      {/* Spacer so page content doesn't hide behind the tab bar */}
      <div
        className="md:hidden"
        style={{ height: `calc(56px + env(safe-area-inset-bottom, 0px))` }}
        aria-hidden
      />

      {/* Tab Bar */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 left-0 right-0 z-40",
          "glass border-t border-border/50"
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="tablist"
        aria-label="Main navigation"
      >
        <div className="flex items-end justify-around h-14">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            // Determine badge
            const badge =
              tab.href === "/cart" ? cartCount :
              tab.href === "/notifications" ? unreadNotifications :
              0;

            return (
              <button
                key={tab.href}
                role="tab"
                aria-selected={active}
                aria-label={tab.label}
                className={cn(
                  "touch-ripple flex flex-col items-center justify-center",
                  "flex-1 h-full gap-0.5 relative",
                  "transition-colors duration-150",
                  active ? "text-primary" : "text-muted-foreground"
                )}
                onClick={() => {
                  haptic("light");
                  navigate(tab.href);
                }}
              >
                <div className="relative">
                  <Icon
                    className={cn(
                      "transition-all duration-200",
                      active ? "w-6 h-6 stroke-[2.5]" : "w-6 h-6 stroke-2"
                    )}
                  />
                  {/* Badge */}
                  {badge > 0 && (
                    <span
                      className={cn(
                        "absolute -top-1.5 -right-1.5",
                        "min-w-[16px] h-4 px-1",
                        "bg-destructive text-destructive-foreground",
                        "text-[10px] font-bold leading-4 text-center",
                        "rounded-full mobile-bounce-in"
                      )}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] leading-none transition-all duration-200",
                    active ? "font-semibold" : "font-normal"
                  )}
                >
                  {tab.label}
                </span>
                {/* Active indicator dot */}
                {active && (
                  <span className="absolute top-1 w-1 h-1 rounded-full bg-primary mobile-bounce-in" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
```

### File: `client/src/components/mobile/MobilePageHeader.tsx` (NEW)

A mobile-only page header with large title, back button, and action buttons.
Use this **alongside** existing desktop headers — wrap with `md:hidden`.

```tsx
import { useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useMobileDevice } from "@/hooks/useMobileDevice";

interface MobilePageHeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  actions?: React.ReactNode;    // right-side action buttons
  transparent?: boolean;         // for use over hero images
  sticky?: boolean;              // default true
  largeTitle?: boolean;          // iOS large title style (default false)
  className?: string;
}

export function MobilePageHeader({
  title,
  subtitle,
  showBack = true,
  onBack,
  actions,
  transparent = false,
  sticky = true,
  largeTitle = false,
  className,
}: MobilePageHeaderProps) {
  const { isMobile } = useMobileDevice();
  const [, navigate] = useLocation();

  if (!isMobile) return null;

  return (
    <header
      className={cn(
        "md:hidden flex items-center gap-3 px-4 py-3 z-30",
        sticky && "sticky top-0",
        transparent ? "bg-transparent" : "glass border-b border-border/30",
        className
      )}
      style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}
    >
      {/* Back button */}
      {showBack && (
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 -ml-2 text-primary touch-ripple"
          onClick={onBack ?? (() => navigate("~-1"))}
          aria-label="Go back"
        >
          <ChevronLeft className="w-6 h-6 stroke-[2.5]" />
        </Button>
      )}

      {/* Title area */}
      <div className={cn("flex-1 min-w-0", !showBack && "ml-0")}>
        {largeTitle ? (
          <h1 className="mobile-large-title truncate">{title}</h1>
        ) : (
          <h1 className="mobile-headline truncate">{title}</h1>
        )}
        {subtitle && (
          <p className="mobile-caption text-muted-foreground truncate">{subtitle}</p>
        )}
      </div>

      {/* Right actions */}
      {actions && <div className="flex items-center gap-1 shrink-0">{actions}</div>}
    </header>
  );
}
```

### File: `client/src/components/mobile/MobileSheet.tsx` (NEW)

Reusable iOS-style bottom sheet for mobile. Use instead of Dialog on mobile.

```tsx
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMobileDevice } from "@/hooks/useMobileDevice";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeight?: string;  // default "85dvh"
  showHandle?: boolean;
}

export function MobileSheet({
  open,
  onClose,
  title,
  children,
  maxHeight = "85dvh",
  showHandle = true,
}: MobileSheetProps) {
  const { isMobile } = useMobileDevice();
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  // On desktop, fall through to existing dialog/sheet from ShadCN
  if (!isMobile) return <>{children}</>;

  return (
    <>
      {/* Overlay */}
      <div
        className="mobile-sheet-overlay"
        onClick={onClose}
        aria-hidden
      />
      {/* Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal
        className="mobile-sheet"
        style={{ maxHeight }}
      >
        {showHandle && <div className="mobile-sheet-handle" />}
        {title && (
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <h2 className="mobile-title-3">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} className="touch-ripple">
              <X className="w-5 h-5" />
            </Button>
          </div>
        )}
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
      </div>
    </>
  );
}
```

### File: `client/src/components/mobile/MobileSkeletonCard.tsx` (NEW)

```tsx
import { cn } from "@/lib/utils";

interface SkeletonProps { className?: string; }

export function SkeletonBox({ className }: SkeletonProps) {
  return <div className={cn("skeleton-shimmer", className)} />;
}

export function MobileProductCardSkeleton() {
  return (
    <div className="mobile-card p-3 space-y-2">
      <SkeletonBox className="w-full aspect-square rounded-xl" />
      <SkeletonBox className="h-4 w-3/4 rounded" />
      <SkeletonBox className="h-4 w-1/2 rounded" />
      <div className="flex gap-2">
        <SkeletonBox className="h-3 w-12 rounded" />
        <SkeletonBox className="h-3 w-8 rounded" />
      </div>
    </div>
  );
}

export function MobileOrderCardSkeleton() {
  return (
    <div className="mobile-card p-4 space-y-3">
      <div className="flex justify-between">
        <SkeletonBox className="h-4 w-24 rounded" />
        <SkeletonBox className="h-4 w-16 rounded" />
      </div>
      <div className="flex gap-3">
        <SkeletonBox className="h-14 w-14 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBox className="h-4 w-full rounded" />
          <SkeletonBox className="h-4 w-2/3 rounded" />
          <SkeletonBox className="h-3 w-1/2 rounded" />
        </div>
      </div>
    </div>
  );
}

export function MobileListItemSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mobile-grouped-list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="mobile-grouped-list-item">
          <SkeletonBox className="w-9 h-9 rounded-xl shrink-0" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBox className="h-4 w-40 rounded" />
            <SkeletonBox className="h-3 w-24 rounded" />
          </div>
          <SkeletonBox className="h-4 w-4 rounded" />
        </div>
      ))}
    </div>
  );
}
```

---

## LAYER 5 — Mobile Page Variants

These are **new mobile-optimized views** for the most-used screens. Each page component gets a **mobile sibling** that renders inside the same route. The existing desktop component is untouched.

The pattern is always:

```tsx
// In the existing page file — ADD this at the top of the return:
const { isMobile } = useMobileDevice();
if (isMobile) return <MobileXxxPage { ...all existing props/hooks } />;
// ...existing desktop JSX continues below unchanged
```

### 5.1 Mobile Home Page

**File: `client/src/pages/mobile/MobileHome.tsx`** (NEW)

Receives all the same data as `HomeConnected.tsx` — no extra API calls.

```tsx
// Layout structure (all data comes from existing hooks — no changes to data layer):
//
// <ScrollView>
//   <MobileHomeHeader />          — sticky glass header with search + notifications
//   <HeroBannerCarousel />        — full-width auto-playing banners (existing data)
//   <DeliveryZoneStrip />         — "Delivering to: Accra" strip
//   <CategoryPillRow />           — horizontal scroll, circular icons
//   <SectionHeader title="Featured" seeAllHref="/products?filter=featured" />
//   <FeaturedProductsRow />       — horizontal scroll of ProductCards
//   <SectionHeader title="Stores" seeAllHref="/stores" />  {/* multi-vendor only */}
//   <FeaturedStoresRow />         — horizontal scroll of StoreCards
//   <SectionHeader title="New Arrivals" seeAllHref="/products?sort=newest" />
//   <ProductGrid />               — 2-column grid, infinite scroll
// </ScrollView>
```

Key mobile-specific behaviors:
- **Sticky search bar** morphs from compact (icon only) → full width on tap
- **Pull-to-refresh** on the scroll container
- **Category pills** horizontal scroll with momentum, no scrollbar
- **Hero carousel** auto-advances every 4s, pause on touch, spring snap between slides
- **ProductCard** in mobile: 160px wide cards in horizontal row, or 2-col grid with 16px gap and 16px side padding
- **Section headers** use `mobile-headline` font + "See All" link in `text-primary`

### 5.2 Mobile Product Detail

**File: `client/src/pages/mobile/MobileProductDetail.tsx`** (NEW)

All existing `useQuery(['products', id])` data reused.

```
Layout:
- Fullscreen image gallery (swipeable, pinch-to-zoom) — top 45% of screen
- Scrollable content below:
  - Store chip (tap → store page)
  - Product name (mobile-title-1)
  - Price row: GHS amount (green large) + original price strikethrough + discount badge
  - Rating row: stars + count + reviews link
  - Variant section: Color swatches → Size chips (show only relevant combos)
  - Stock indicator
  - Description (expandable)
  - Reviews section (tap to expand)
  - Related products horizontal row
- Sticky bottom bar (above safe area):
  - Quantity stepper (−/+) on left
  - "Add to Cart" button (flex-1, green)
  - Wishlist heart button
```

Haptic feedback: Medium on cart add, Light on wishlist toggle.

### 5.3 Mobile Cart

**File: `client/src/pages/mobile/MobileCart.tsx`** (NEW)

All existing `useCart()` hook data reused.

```
Layout:
- MobilePageHeader title="Cart" actions={<EditButton />}
- Items list (grouped by seller in multi-vendor mode):
  - Seller header row
  - SwipeableRow: product thumbnail + name/variant + qty stepper + price
    - Swipe left → Delete (red) with haptic
- Coupon code section (MobileSheet trigger)
- Order summary card (subtotal, delivery, coupon, total)
- Sticky bottom: "Checkout — GHS X.XX" button
```

### 5.4 Mobile Orders List

**File: `client/src/pages/mobile/MobileOrders.tsx`** (NEW)

Uses existing `useQuery(['orders'])` data.

```
Layout:
- MobilePageHeader title="My Orders"
- Segmented tabs: All | Active | Completed | Cancelled (scroll-to-filter)
- Order cards (full-width):
  - Status color bar (left edge, 3px)
  - Order # + date row
  - Product thumbnails (up to 3, +N overflow)
  - Status chip + total
  - Action: "Track" (for active) / "Reorder" / "View Receipt"
- Swipe right on card → Track (if active)
- Infinite scroll, pull-to-refresh
```

### 5.5 Mobile Dashboard Home (All Roles)

**File: `client/src/pages/mobile/MobileDashboardHome.tsx`** (NEW)

This is the mobile home for `/seller`, `/rider`, `/admin`, `/buyer` dashboard routes.
Receives same data from existing hooks.

```
Layout:
- Glass header: "Good morning, [Name]" + avatar + notification bell
- Role-specific stats row (horizontal scroll of stat cards):
  - Seller: Revenue today, Orders, Products, Pending payouts
  - Rider: Deliveries today, Earnings, Rating, Online status toggle
  - Admin: Orders today, Revenue, Active riders, Pending applications
  - Buyer: Orders, Wishlist, Rewards balance
- Quick actions grid (2×2):
  - Seller: Add Product, View Orders, Analytics, Payouts
  - Rider: Go Online/Offline, Active Delivery, Earnings, Messages
  - Admin: Orders, Users, Payouts, Settings
- Recent activity list (last 5 items, same data as desktop)
- Alerts/notices (low stock, pending review, assignment failures)
```

### 5.6 Mobile Admin Orders

**File: `client/src/pages/mobile/MobileAdminOrders.tsx`** (NEW)

Uses existing `useQuery(['admin', 'orders'])`.

```
Layout:
- MobilePageHeader title="Orders" actions={<FilterButton />}
- Status filter tabs (scrollable pills): All | New | Processing | Ready | In Transit | Completed
- Order cards (same SwipeableRow pattern):
  - Swipe left → Cancel (destructive)
  - Swipe right → Advance status
  - Tap → Order detail with action sheet (Override, Assign Rider, Refund, Cancel)
- Floating "+" button for manual order (if needed)
- Real-time Socket.IO badge on "New" tab
```

**IMPORTANT:** All order mutations use the **exact same API calls** as desktop.
`PATCH /api/orders/:id/status` is called by both desktop and mobile order pages.
An admin acting on mobile → updates desktop in real-time, and vice versa.

### 5.7 Mobile Seller Products

**File: `client/src/pages/mobile/MobileSellerProducts.tsx`** (NEW)

```
Layout:
- MobilePageHeader title="Products" actions={<AddButton />}
- Filter tabs: All | Active | Inactive | Low Stock
- Product list items (SwipeableRow):
  - Thumbnail (56×56), name, price, stock, status toggle
  - Swipe left: Edit | Delete
  - Swipe right: Toggle active
- FAB "+" → existing Add Product sheet/page
```

### 5.8 Mobile Chat / Messaging

**File: `client/src/pages/mobile/MobileChat.tsx`** (NEW)

```
Layout (Conversation list):
- MobilePageHeader title="Messages"
- Segmented: Direct | Support
- Conversation rows (same Socket.IO data):
  - Avatar (online dot), name, last message, time, unread badge
  - Swipe left: Delete | Mute

Layout (Chat thread):
- MobilePageHeader title={contactName} actions={<CallButton />}
- Message bubbles (green = sent, gray = received)
- Typing indicator (three animated dots)
- Input bar: attachment | text field | voice record | send
- Voice message: waveform + duration
- Image tap → full-screen viewer
```

### 5.9 Mobile Notifications

**File: `client/src/pages/mobile/MobileNotifications.tsx`** (NEW)

```
Layout:
- MobilePageHeader title="Notifications" actions={<MarkAllReadButton />}
- Grouped sections: Today | Yesterday | Earlier
- Notification rows:
  - Icon (type-colored), title (bold if unread), preview, time
  - Unread: green dot + slightly different background
  - Swipe left: Delete
  - Swipe right: Mark read
  - Tap: deep navigate to relevant entity
```

### 5.10 Mobile Profile

**File: `client/src/pages/mobile/MobileProfile.tsx`** (NEW)

```
Layout:
- Profile header card:
  - Avatar (80px, tappable to change)
  - Name, role badge, referral code + copy button
  - Buyer: quick stats (orders, wishlist, reviews)
  - Seller: quick stats (products, orders, revenue)
- iOS-style grouped list sections:
  - Account: Edit Profile, Change Password, Linked Accounts
  - Orders/Activity (role-specific links)
  - Preferences: Notifications, Appearance, Security
  - Referral Programme (if enabled)
  - About: Version, Terms, Privacy, Contact
  - Danger zone: Sign Out (red)
```

### 5.11 Mobile Live Order Tracking

**File: `client/src/pages/mobile/MobileLiveTracking.tsx`** (NEW)

This is the most immersive mobile screen. Uses existing Socket.IO `rider_location_update` events and existing map/tracking API.

```
Layout:
- Full-screen map (reuse existing map component)
- Bottom sheet (always visible, draggable between half/full):
  - Half state: Rider avatar + name + ETA (large) + status
  - Full state: Full order detail + status steps + actions
- "Message Rider" FAB (floating)
- Status transitions in real-time via Socket.IO
```

### 5.12 Mobile Seller Analytics

**File: `client/src/pages/mobile/MobileSellerAnalytics.tsx`** (NEW)

```
Layout:
- Range picker tabs: 7D | 30D | 90D
- Revenue line chart (Victory Native equivalent — use Recharts which is already in project)
- Stats cards row: Revenue, Orders, Avg order, Conversion
- Top products list (scrollable)
- All data from existing `/api/seller/analytics` endpoints
```

---

## LAYER 6 — Component Enhancements

These modify **shared components** to be more mobile-friendly.
All changes use the pattern: "add mobile styles alongside desktop styles, never remove desktop styles."

### 6.1 Enhance `MobileStorefrontNav.tsx` → Replace with `MobileBottomTabBar`

In `App.tsx`, find where `MobileStorefrontNav` is rendered and replace with `MobileBottomTabBar` from Layer 4. The new component handles all 6 roles with correct tabs.

### 6.2 Enhance `DashboardLayout.tsx`

**ADD** (do not change anything else):

```tsx
// At the bottom of DashboardLayout return, BEFORE closing div, ADD:
import { MobileBottomTabBar } from "@/components/mobile/MobileStorefrontShell";

// Inside the JSX, after the main content area:
<MobileBottomTabBar />
```

This gives dashboard pages (seller, rider, admin) a bottom tab bar on mobile while keeping the exact sidebar on desktop.

### 6.3 Enhance `Header.tsx`

The existing mobile header already has the right structure. Enhance the mobile search experience:

```tsx
// ADD a mobile search expansion state:
const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

// ADD in the mobile section (md:hidden):
{mobileSearchOpen ? (
  <div className="md:hidden fixed inset-x-0 top-0 z-50 glass px-4 py-3 flex items-center gap-2"
       style={{ paddingTop: "max(12px, env(safe-area-inset-top, 0px))" }}>
    <Input
      autoFocus
      placeholder="Search products..."
      className="flex-1 h-10 rounded-full bg-muted border-0 text-base"
      onChange={(e) => {/* use existing search handler */}}
    />
    <Button variant="ghost" onClick={() => setMobileSearchOpen(false)}>Cancel</Button>
  </div>
) : (
  // Existing mobile header JSX unchanged
)}
```

### 6.4 Enhance `ProductCard` (storefront product cards)

Find the existing ProductCard component. **ADD** responsive classes:

```tsx
// Existing: <div className="rounded-lg overflow-hidden ...">
// Change to: <div className="rounded-lg md:rounded-lg overflow-hidden mobile-press touch-ripple ...">

// Existing: product image
// Add blurhash placeholder loading state (already supported by existing img tags with onLoad)

// Add to the card wrapper:
className={cn(
  existingClasses,
  "mobile-press touch-ripple"  // ADD mobile touch feel
)}
```

### 6.5 Add `SwipeableRow` component

**File: `client/src/components/mobile/SwipeableRow.tsx`** (NEW)

Used in cart, orders, products lists for swipe-to-action.

```tsx
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useHaptic } from "@/hooks/useHaptic";

interface SwipeAction {
  label: string;
  icon?: React.ReactNode;
  color: "destructive" | "primary" | "warning";
  onPress: () => void;
}

interface SwipeableRowProps {
  children: React.ReactNode;
  leftAction?: SwipeAction;   // swipe right reveals
  rightAction?: SwipeAction;  // swipe left reveals
  className?: string;
}

export function SwipeableRow({ children, leftAction, rightAction, className }: SwipeableRowProps) {
  const [offsetX, setOffsetX] = useState(0);
  const startX = useRef(0);
  const isDragging = useRef(false);
  const { trigger: haptic } = useHaptic();
  const ACTION_WIDTH = 80;
  const TRIGGER_THRESHOLD = ACTION_WIDTH * 0.6;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    isDragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!isDragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const bounded = Math.max(
      rightAction ? -ACTION_WIDTH : 0,
      Math.min(leftAction ? ACTION_WIDTH : 0, dx)
    );
    setOffsetX(bounded);
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    if (offsetX < -TRIGGER_THRESHOLD && rightAction) {
      haptic("medium");
      setOffsetX(-ACTION_WIDTH);
    } else if (offsetX > TRIGGER_THRESHOLD && leftAction) {
      haptic("medium");
      setOffsetX(ACTION_WIDTH);
    } else {
      setOffsetX(0);
    }
  };

  const colorMap = {
    destructive: "bg-destructive text-destructive-foreground",
    primary: "bg-primary text-primary-foreground",
    warning: "bg-yellow-500 text-white",
  };

  return (
    <div className={cn("relative overflow-hidden", className)}>
      {/* Left action (revealed by swipe right) */}
      {leftAction && (
        <button
          className={cn("absolute left-0 top-0 bottom-0 flex items-center justify-center px-5 font-semibold text-sm", colorMap[leftAction.color])}
          style={{ width: ACTION_WIDTH }}
          onClick={() => { leftAction.onPress(); setOffsetX(0); }}
        >
          {leftAction.icon}
          <span className="mt-1 text-xs">{leftAction.label}</span>
        </button>
      )}
      {/* Right action (revealed by swipe left) */}
      {rightAction && (
        <button
          className={cn("absolute right-0 top-0 bottom-0 flex items-center justify-center px-5 font-semibold text-sm", colorMap[rightAction.color])}
          style={{ width: ACTION_WIDTH }}
          onClick={() => { rightAction.onPress(); setOffsetX(0); }}
        >
          {rightAction.icon}
          <span className="mt-1 text-xs">{rightAction.label}</span>
        </button>
      )}
      {/* Main content */}
      <div
        className="relative bg-background transition-transform duration-200"
        style={{ transform: `translateX(${offsetX}px)` }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  );
}
```

---

## HOW TO WIRE MOBILE VARIANTS INTO EXISTING PAGES

The integration pattern is identical for every page. No existing code is changed.
Add 3 lines at the top of the page component's return statement:

### Pattern A — Full Page Variant

```tsx
// In existing page component (e.g., Orders.tsx):
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { MobileOrders } from "@/pages/mobile/MobileOrders";

export default function Orders() {
  // ...ALL existing hooks, queries, state — UNCHANGED...

  const { isMobile } = useMobileDevice();
  // Pass all existing data down as props — no extra API calls
  if (isMobile) return <MobileOrders orders={orders} isLoading={isLoading} />;

  // ...existing desktop JSX — COMPLETELY UNCHANGED below...
  return (
    // existing desktop layout
  );
}
```

### Pattern B — Responsive Wrapper (for pages that mostly work on mobile already)

```tsx
// Add responsive classes to existing wrappers using cn():
<div className={cn(
  "p-6",              // desktop padding (existing)
  "md:p-6 p-4"       // mobile gets smaller padding (ADD)
)}>
```

### Pattern C — Show/Hide Sections

```tsx
// Existing desktop-only element:
<div className="hidden md:block">
  {/* existing desktop component */}
</div>

// New mobile-only element:
<div className="block md:hidden">
  <MobileFriendlyVersion />
</div>
```

---

## SINGLE SOURCE OF TRUTH — HOW CHANGES PROPAGATE

This table proves that every action on any platform affects all other platforms:

| Action | Data Layer | Result on Desktop | Result on Mobile |
|--------|-----------|-------------------|-----------------|
| Admin changes order status (mobile) | `PATCH /api/orders/:id/status` | Order list updates via React Query refetch | Same query invalidated → mobile list updates |
| Admin changes order status (desktop) | Same API | Desktop table updates | Mobile list updates |
| Seller adds product (mobile) | `POST /api/products` | Desktop product list shows new product | Mobile product list shows new product |
| Buyer places order (mobile PWA) | `POST /api/orders` | Admin desktop dashboard shows new order | All mobile dashboards see new order |
| Admin changes platform color (desktop) | `PATCH /api/settings` | Desktop re-reads `platformSettings` | Mobile re-reads same settings |
| Rider goes online (mobile) | `PATCH /api/rider/availability` | Admin desktop map shows rider available | Mobile rider shows online state |
| Message sent (any platform) | Socket.IO + DB | Desktop chat updates | Mobile chat updates in real-time |
| Coupon created (seller mobile) | `POST /api/coupons` | Shows in desktop coupon list | Shows in mobile coupon list |

**Why this works:** The mobile variants share 100% of the data hooks:
- `useQuery` cache is keyed identically → same cache invalidation
- Socket.IO handlers are in a shared context provider (unchanged)
- Auth state is shared (same `useAuth()` hook)
- Platform settings are shared (`usePlatformSettings()` hook, unchanged)
- Route guards are shared (same guard HOCs, unchanged)

---

## ROUTE CHANGES IN App.tsx

The only change to `App.tsx` is adding `MobileBottomTabBar` globally and ensuring the mobile page variants are imported. No routes change. No guards change.

```tsx
// In App.tsx, find the outermost return wrapper and ADD:
import { MobileBottomTabBar } from "@/components/mobile/MobileStorefrontShell";

// Inside the JSX, just before </> closing:
<MobileBottomTabBar />
// That's the only addition to App.tsx
```

The existing `MobileStorefrontNav` component can remain but will be superseded by `MobileBottomTabBar` which handles all roles. To avoid rendering both, either:
- Remove `MobileStorefrontNav` usage in App.tsx and replace with `MobileBottomTabBar`, OR
- Add a feature flag in `MobileStorefrontNav` to return null (since `MobileBottomTabBar` covers it)

---

## DASHBOARD ON MOBILE — SPECIFIC GUIDANCE

The existing `DashboardLayout.tsx` already has:
- Mobile hamburger menu ✅
- Mobile sidebar overlay ✅
- `[data-dashboard-surface]` attribute ✅

**What to ADD** (without changing existing):

1. Add `MobileBottomTabBar` inside `DashboardLayout`'s JSX (after main content, before closing `</div>`)
2. The hamburger sidebar becomes a secondary overflow menu for items not in the bottom tab bar
3. The bottom tab bar shows the 5 most important tabs for the user's role
4. Hamburger sidebar still accessible for less-used admin sections (categories, zones, CMS, etc.)

```
Mobile Admin Layout:
- Bottom tabs: Dashboard | Orders | Users | Analytics | More
- "More" tab opens a MobileSheet with remaining admin menu items
- This sheet lists all remaining sidebar items (existing DashboardSidebar menu items)
- Tapping any item navigates + closes the sheet
```

The `DashboardSidebar` component's menu item list can be reused directly in this "More" sheet — same data, same route links, same role filtering, same permission checks. Zero duplication.

---

## MOBILE-SPECIFIC ADMIN FEATURES (Same Logic, Better UX)

All admin capabilities work identically. The mobile admin experience provides:

| Feature | Desktop | Mobile |
|---------|---------|--------|
| Override order status | Dropdown select | Action sheet (iOS-style) |
| Assign rider manually | Drag & drop table | List with "Assign" button per rider |
| Approve/reject application | Table row actions | Swipe right (Approve) / left (Reject) |
| View platform analytics | Full chart dashboard | Scrollable cards with charts |
| Send broadcast notification | Form page | Bottom sheet with recipient picker |
| Toggle maintenance mode | Settings toggle | Big toggle in settings |
| Change platform colors | Color picker | Same color picker, scrollable |

---

## PERFORMANCE CONSIDERATIONS

### Code Splitting (Already Exists — Maintain)
All 150+ pages are lazy-loaded. The mobile variants should follow the same pattern:

```tsx
const MobileOrders = lazy(() => import("@/pages/mobile/MobileOrders"));
const MobileHome = lazy(() => import("@/pages/mobile/MobileHome"));
// etc.
```

Mobile variants are only loaded when `isMobile === true`, so desktop users never download mobile code.

### Image Optimization
Cloudinary is already configured. On mobile, request smaller images via URL params:

```typescript
// Utility to add mobile size transform to Cloudinary URLs
export function mobileImageUrl(url: string, width = 400): string {
  if (!url?.includes("cloudinary.com")) return url;
  return url.replace("/upload/", `/upload/w_${width},f_auto,q_auto/`);
}
```

### Touch Event Optimization
All `onTouchStart` and `onTouchMove` handlers use `{ passive: true }` to avoid scroll blocking.

### Prevent iOS Input Zoom
Already in `index.css` (existing): `font-size: 16px` on inputs prevents iOS zoom. Maintain this.

---

## TESTING CHECKLIST

After integration, verify on physical iPhone and Android device:

**Core Flows:**
- [ ] Home feed loads, banner carousel swipes, categories scroll
- [ ] Product search, detail page, image gallery swipe works
- [ ] Add to cart → cart updates badge on tab bar
- [ ] Checkout completes → Paystack sheet appears inline → payment verified
- [ ] Order tracking map shows rider movement in real-time
- [ ] Notifications arrive as push (if PWA installed to homescreen)

**Admin Flows (same superadmin account, on mobile):**
- [ ] Admin dashboard shows correct stats
- [ ] Changing order status on mobile → desktop shows update
- [ ] Creating a category on mobile → buyer mobile home shows new category
- [ ] Toggling maintenance mode on mobile → all platforms see maintenance page

**Cross-Platform Parity:**
- [ ] Color change in Admin Branding settings → affects both mobile and desktop
- [ ] Product added by seller on desktop → appears on buyer mobile home
- [ ] Message sent by buyer on mobile → appears on seller desktop chat in real-time

**PWA Installation:**
- [ ] "Add to Home Screen" works on iOS Safari
- [ ] "Add to Home Screen" works on Android Chrome
- [ ] App opens in standalone mode (no browser chrome)
- [ ] Splash screen shows on iOS
- [ ] Safe area insets respected (notch/Dynamic Island)

---

## SUMMARY: WHAT YOU'RE BUILDING

You are NOT building a new app. You are **revealing the mobile version of an app that already exists.**

The data, logic, routing, and business rules are already production-tested. You are:
1. Adding a `useMobileDevice()` hook to detect the surface
2. Adding CSS animation utilities to `index.css`
3. Adding a `manifest.webmanifest` for PWA installation
4. Replacing the existing basic `MobileStorefrontNav` with a role-aware `MobileBottomTabBar`
5. Adding a `MobileBottomTabBar` to `DashboardLayout` for dashboard routes
6. Creating `~15 mobile page variants` that render when `isMobile === true`
7. Creating `~5 reusable mobile components` (Sheet, PageHeader, Skeleton, SwipeableRow, BottomTabBar)
8. Adding `mobile-press`, `glass`, `mobile-card` utility classes

The desktop site is **not touched**. The API is **not touched**. The route guards are **not touched**. The payment logic is **not touched**. The Socket.IO realtime system is **not touched**.

One superadmin. One database. One API. One set of business rules.  
Two beautiful, production-grade surfaces: desktop and mobile.
