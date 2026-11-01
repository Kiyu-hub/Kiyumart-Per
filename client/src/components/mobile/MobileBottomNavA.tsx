/**
 * Shared mobile bottom navigation — approved "Option A · Teal Halo" (redesign/mobile-home-fashion).
 *
 * One bar for every user: Home · Cart · [role button] · Wishlist · Profile.
 * Only the raised centre button changes with the signed-in role:
 *   guest / buyer → Become a Seller   seller → Dashboard   rider → Tasks
 *   agent → Support   pickup_agent → Pickup   admin → Admin   super_admin → Super Admin
 * Fallback "Categories" when seller sign-up is switched off, or for riders while
 * external rider mode is on. Route access is still enforced by the existing guards.
 *
 * The original role-specific bar is kept as MobileBottomTabBarClassic; which one renders
 * is chosen by getMobileNavVariant() (default "classic"). Colours: existing mobile palette only.
 */
import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useHaptic } from "@/hooks/useHaptic";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  Home, ShoppingCart, User, Plus, LayoutDashboard, LayoutGrid, Truck, Headset, QrCode,
} from "lucide-react";

// Same full-screen pages that hide the classic bar.
const HIDE_ROUTES = ["/auth", "/checkout", "/payment", "/live-tracking", "/cart-link", "/search", "/mobile/vendors", "/mobile/stores", "/become-seller", "/become-rider", "/sellers/"];

const TEAL = "#009688";

/** Wishlist icon — approved option 2: shopping bag with a heart. */
function BagHeartIcon({ size = 22, color = "currentColor", strokeWidth = 1.7 }: { size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4.5 8h15l-1.2 12.2a1 1 0 0 1-1 .8H6.7a1 1 0 0 1-1-.8z" />
      <path d="M8.5 8V6.5a3.5 3.5 0 0 1 7 0V8" />
      <path d="M12 17.6s-3-1.8-3-3.7c0-1 .8-1.7 1.6-1.7.6 0 1.1.3 1.4.8.3-.5.8-.8 1.4-.8.8 0 1.6.7 1.6 1.7 0 1.9-3 3.7-3 3.7z" />
    </svg>
  );
}

type IconComp = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

interface CentreAction {
  label: string;
  href: string;
  icon: IconComp;
  /** Path prefixes that count as "inside this role's area" (lights up the button). */
  area: (path: string) => boolean;
}

const inArea = (...prefixes: string[]) => (path: string) =>
  prefixes.some((p) => path === p || path.startsWith(p + "/"));

const CATEGORIES_FALLBACK: CentreAction = { label: "Categories", href: "/categories", icon: LayoutGrid as IconComp, area: inArea("/categories") };

export function getCentreAction(role: string | null | undefined, opts: { allowSellerRegistration: boolean; isExternalRiderSystemEnabled: boolean }): CentreAction {
  switch (role) {
    case "seller":
      return { label: "Dashboard", href: "/seller", icon: LayoutDashboard as IconComp, area: inArea("/seller") };
    case "rider":
      return opts.isExternalRiderSystemEnabled
        ? CATEGORIES_FALLBACK
        : { label: "Tasks", href: "/rider/deliveries", icon: Truck as IconComp, area: inArea("/rider") };
    case "agent":
      return { label: "Support", href: "/agent", icon: Headset as IconComp, area: inArea("/agent") };
    case "pickup_agent":
      return { label: "Pickup", href: "/pickup-agent", icon: QrCode as IconComp, area: inArea("/pickup-agent") };
    case "admin":
      return { label: "Admin", href: "/admin", icon: LayoutDashboard as IconComp, area: inArea("/admin") };
    case "super_admin":
      return { label: "Super Admin", href: "/admin", icon: LayoutDashboard as IconComp, area: inArea("/admin") };
    default:
      // Guests and buyers (and any unrecognised role).
      return opts.allowSellerRegistration
        ? { label: "Become a Seller", href: "/become-seller", icon: Plus as IconComp, area: inArea("/become-seller") }
        : CATEGORIES_FALLBACK;
  }
}

interface CartItem { id: string; quantity: number; }

// The bar is mounted both globally (App.tsx) and inside DashboardLayout. Only one
// instance may draw, otherwise two identical fixed bars (and two spacers) stack up.
let drawingInstance: symbol | null = null;
const waiting = new Set<() => void>();
function useSingleDrawer(): boolean {
  const id = useRef(Symbol("MobileBottomNavA"));
  const [isDrawer, setIsDrawer] = useState(false);
  useEffect(() => {
    const claim = () => {
      if (drawingInstance === null) { drawingInstance = id.current; setIsDrawer(true); }
    };
    claim();
    waiting.add(claim);
    return () => {
      waiting.delete(claim);
      if (drawingInstance === id.current) {
        drawingInstance = null;
        waiting.forEach((fn) => fn()); // let a remaining instance take over
      }
    };
  }, []);
  return isDrawer;
}

export function MobileBottomNavA() {
  const { isMobile } = useMobileDevice();
  const [location, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { trigger: haptic } = useHaptic();
  const { allowSellerRegistration, isExternalRiderSystemEnabled } = usePlatformSettings();
  const isDrawer = useSingleDrawer();

  // Theme awareness — same mechanism as the classic bar.
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const read = () => {
      const saved = localStorage.getItem("theme");
      setIsDark(saved ? saved === "dark" : document.documentElement.classList.contains("dark"));
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === "theme") read(); };
    window.addEventListener("storage", onStorage);
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { window.removeEventListener("storage", onStorage); observer.disconnect(); };
  }, []);

  // Cart count (existing data source).
  const { data: cartItems = [] } = useQuery<CartItem[]>({ queryKey: ["/api/cart"], enabled: isAuthenticated });
  const cartCount = Array.isArray(cartItems) ? cartItems.reduce((s, i) => s + (i.quantity || 1), 0) : 0;

  // Unread notifications on Profile (same as the classic bar).
  const { data: notifCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/notifications/unread-count", { credentials: "include" });
      if (!res.ok) return 0;
      const d = await res.json();
      return typeof d === "number" ? d : (d?.count ?? 0);
    },
    enabled: isAuthenticated && !!user,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  if (!isMobile || !isDrawer) return null;
  if (HIDE_ROUTES.some((r) => location.startsWith(r))) return null;

  const centre = getCentreAction(user?.role ?? null, { allowSellerRegistration, isExternalRiderSystemEnabled });
  const centreActive = centre.area(location);

  const bar      = isDark ? "#111111" : "#FFFFFF";
  const border   = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
  const inactive = isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)";
  const strong   = isDark ? "#FFFFFF" : "#111111";

  const go = (href: string) => { haptic("light"); navigate(href); };

  const tabs: { key: string; label: string; href: string; icon: IconComp; active: boolean; badge: number }[] = [
    { key: "home",     label: "Home",     href: "/",         icon: Home as IconComp,         active: location === "/",                          badge: 0 },
    { key: "cart",     label: "Cart",     href: "/cart",     icon: ShoppingCart as IconComp, active: location.startsWith("/cart"),              badge: cartCount },
    { key: "wishlist", label: "Wishlist", href: "/wishlist", icon: BagHeartIcon,             active: location.startsWith("/wishlist"),          badge: 0 },
    { key: "profile",  label: "Profile",  href: "/profile",  icon: User as IconComp,         active: location.startsWith("/profile"),           badge: notifCount },
  ];

  const renderTab = (t: typeof tabs[number]) => {
    const Icon = t.icon;
    const color = t.active ? TEAL : inactive;
    return (
      <button
        key={t.key}
        role="tab"
        aria-selected={t.active}
        aria-label={t.badge > 0 ? `${t.label}, ${t.badge}` : t.label}
        onClick={() => go(t.href)}
        style={{
          flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 3, position: "relative",
          background: "transparent", border: "none", padding: 0, cursor: "pointer",
          WebkitTapHighlightColor: "transparent", color,
        }}
      >
        <span style={{ position: "relative", display: "grid", placeItems: "center" }}>
          <Icon size={22} color={color} strokeWidth={t.active ? 2.3 : 1.7} />
          {t.badge > 0 && (
            <span style={{
              position: "absolute", top: -6, right: -10, minWidth: 16, height: 16, borderRadius: 8,
              background: TEAL, color: "#fff", fontSize: 10, fontWeight: 800, lineHeight: "16px",
              textAlign: "center", padding: "0 4px", border: `1.5px solid ${bar}`,
            }}>
              {t.badge > 99 ? "99+" : t.badge}
            </span>
          )}
        </span>
        <span style={{ fontSize: 10.5, lineHeight: 1, fontWeight: t.active ? 700 : 500, whiteSpace: "nowrap" }}>{t.label}</span>
      </button>
    );
  };

  const CentreIcon = centre.icon;

  return (
    <>
      {/* Content spacer so page content clears the bar */}
      <div className="md:hidden" style={{ height: "calc(66px + env(safe-area-inset-bottom, 0px))" }} aria-hidden />

      <nav
        data-nav-variant="new"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", background: bar, borderTop: `1px solid ${border}` }}
        role="tablist"
        aria-label="Main navigation"
      >
        <div style={{ display: "flex", alignItems: "stretch", height: 66, padding: "0 4px" }}>
          {renderTab(tabs[0])}
          {renderTab(tabs[1])}

          {/* Role button — raised teal circle with white ring and soft teal glow */}
          <button
            role="tab"
            aria-selected={centreActive}
            aria-label={centre.label}
            data-centre-action={centre.label}
            onClick={() => go(centre.href)}
            style={{
              flex: 1.25, minWidth: 0, height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "flex-start", gap: 4,
              background: "transparent", border: "none", padding: "0 2px", cursor: "pointer",
              WebkitTapHighlightColor: "transparent", overflow: "visible",
            }}
          >
            <span style={{
              width: 56, height: 56, borderRadius: 28, marginTop: -24, flexShrink: 0,
              background: centreActive ? "#00897B" : TEAL, color: "#fff",
              display: "grid", placeItems: "center",
              border: `4px solid ${bar}`, boxSizing: "border-box",
              boxShadow: `0 8px 20px rgba(0,150,136,${isDark ? 0.45 : 0.35})`,
            }}>
              <CentreIcon size={24} color="#fff" strokeWidth={2.2} />
            </span>
            <span style={{
              fontSize: 10.5, lineHeight: 1.1, fontWeight: 700, textAlign: "center",
              color: centreActive ? TEAL : strong, maxWidth: "100%",
              overflowWrap: "break-word",
            }}>
              {centre.label}
            </span>
          </button>

          {renderTab(tabs[2])}
          {renderTab(tabs[3])}
        </div>
      </nav>
    </>
  );
}

export default MobileBottomNavA;
