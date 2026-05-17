import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useHaptic } from "@/hooks/useHaptic";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { cn } from "@/lib/utils";
import {
  Home, ShoppingCart, Package, User,
  BarChart3, MessageCircle, Store, Settings,
  Truck, ClipboardList, Users, LayoutDashboard, Heart,
} from "lucide-react";

interface Tab {
  label: string;
  icon: React.ElementType;
  href: string;
}

const BUYER_TABS: Tab[] = [
  { label: "Home",     icon: Home,         href: "/" },
  { label: "Wishlist", icon: Heart,        href: "/wishlist" },
  { label: "Cart",     icon: ShoppingCart, href: "/cart" },
  { label: "Orders",   icon: Package,      href: "/orders" },
  { label: "Profile",  icon: User,         href: "/profile" },
];

const SELLER_TABS: Tab[] = [
  { label: "Home",      icon: LayoutDashboard, href: "/seller" },
  { label: "Products",  icon: Package,         href: "/seller/products" },
  { label: "Orders",    icon: ShoppingCart,    href: "/seller/orders" },
  { label: "Analytics", icon: BarChart3,       href: "/seller/analytics" },
  { label: "Settings",  icon: Settings,        href: "/seller/settings" },
];

const RIDER_TABS: Tab[] = [
  { label: "Home",      icon: LayoutDashboard, href: "/rider" },
  { label: "Trips",     icon: Truck,           href: "/rider/deliveries" },
  { label: "Earnings",  icon: BarChart3,       href: "/rider/earnings" },
  { label: "Messages",  icon: MessageCircle,   href: "/rider/messages" },
  { label: "Profile",   icon: User,            href: "/profile" },
];

const ADMIN_TABS: Tab[] = [
  { label: "Home",     icon: LayoutDashboard, href: "/admin" },
  { label: "Orders",   icon: ClipboardList,   href: "/admin/orders" },
  { label: "Users",    icon: Users,           href: "/admin/users" },
  { label: "Sellers",  icon: Store,           href: "/admin/sellers" },
  { label: "Settings", icon: Settings,        href: "/admin/settings" },
];

const HIDE_ROUTES = ["/auth", "/checkout", "/payment", "/live-tracking", "/cart-link", "/search", "/mobile/vendors", "/mobile/stores", "/become-seller", "/become-rider", "/sellers/"];

interface CartItem { id: string; quantity: number; }

export function MobileBottomTabBar() {
  const { isMobile } = useMobileDevice();
  const [location, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { trigger: haptic } = useHaptic();

  // Theme awareness — read from localStorage, sync with document class
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const read = () => {
      const saved = localStorage.getItem("theme");
      setIsDark(saved ? saved === "dark" : document.documentElement.classList.contains("dark"));
    };
    read();
    // Re-sync whenever localStorage changes (other tab or MobileHome toggle)
    const onStorage = (e: StorageEvent) => { if (e.key === "theme") read(); };
    window.addEventListener("storage", onStorage);
    // Also poll for class changes (same-tab toggle)
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => { window.removeEventListener("storage", onStorage); observer.disconnect(); };
  }, []);

  // Cart count
  const { data: cartItems = [] } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });
  const cartCount = Array.isArray(cartItems)
    ? cartItems.reduce((s, i) => s + (i.quantity || 1), 0)
    : 0;

  // Notification count
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

  if (!isMobile) return null;
  if (HIDE_ROUTES.some((r) => location.startsWith(r))) return null;

  const role = user?.role ?? "buyer";
  let tabs: Tab[] = BUYER_TABS;
  if (role === "seller") tabs = SELLER_TABS;
  else if (role === "rider") tabs = RIDER_TABS;
  else if (role === "admin" || role === "super_admin") tabs = ADMIN_TABS;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  // Theme-aware colors
  const bg         = isDark ? "#111111" : "#FFFFFF";
  const border     = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.09)";
  const activeClr  = "#009688";
  const inactiveClr = isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)";

  return (
    <>
      {/* Content spacer */}
      <div
        className="md:hidden"
        style={{ height: `calc(62px + env(safe-area-inset-bottom, 0px))` }}
        aria-hidden
      />

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="tablist"
        aria-label="Main navigation"
      >
        <div
          style={{
            background: bg,
            borderTop: `1px solid ${border}`,
          }}
        >
          <div style={{ display: "flex", height: 62, padding: "0 4px" }}>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = isActive(tab.href);

              // Badge: cart count for cart tab, notif count for profile tab
              const badge =
                tab.href === "/cart" ? cartCount :
                tab.href === "/profile" ? notifCount :
                0;

              return (
                <button
                  key={tab.href}
                  role="tab"
                  aria-selected={active}
                  aria-label={tab.label}
                  onClick={() => { haptic("light"); navigate(tab.href); }}
                  style={{
                    flex: 1, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center",
                    height: "100%", position: "relative",
                    background: "transparent", border: "none",
                    cursor: "pointer", WebkitTapHighlightColor: "transparent",
                    transition: "color 0.15s",
                  }}
                >
                  {active ? (
                    <div style={{ position: "relative", maxWidth: "calc(100% - 6px)" }}>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 4,
                        background: activeClr, borderRadius: 7,
                        padding: "5px 9px",
                        overflow: "hidden",
                      }}>
                        <Icon style={{ width: 15, height: 15, strokeWidth: 2.2, color: "#fff", flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {tab.label}
                        </span>
                      </div>
                      {badge > 0 && (
                        <span style={{
                          position: "absolute", top: -5, right: -5,
                          minWidth: 16, height: 16, borderRadius: 8,
                          background: isDark ? "#111" : "#fff",
                          color: activeClr, fontSize: 9, fontWeight: 900,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: "0 3px", border: `1.5px solid ${activeClr}`,
                          zIndex: 2,
                        }}>
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, position: "relative" }}>
                      <div style={{ position: "relative" }}>
                        <Icon style={{ width: 21, height: 21, strokeWidth: 1.6, color: inactiveClr }} />
                        {badge > 0 && (
                          <span style={{
                            position: "absolute", top: -6, right: -10,
                            minWidth: 17, height: 17, borderRadius: 9,
                            background: activeClr, color: "#000",
                            fontSize: 10, fontWeight: 900,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            padding: "0 3px",
                          }}>
                            {badge > 99 ? "99+" : badge}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 10, lineHeight: 1, fontWeight: 500, color: inactiveClr }}>
                        {tab.label}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
