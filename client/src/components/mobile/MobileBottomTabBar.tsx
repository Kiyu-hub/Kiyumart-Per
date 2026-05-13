import React from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useHaptic } from "@/hooks/useHaptic";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { cn } from "@/lib/utils";
import {
  Home, Search, ShoppingCart, Heart, User,
  Package, BarChart3, MessageCircle, Store, Settings,
  Truck, ClipboardList, Users, LayoutDashboard,
} from "lucide-react";

interface Tab {
  label: string;
  icon: React.ElementType;
  href: string;
}

const BUYER_TABS: Tab[] = [
  { label: "Home",    icon: Home,         href: "/" },
  { label: "Browse",  icon: Search,       href: "/products" },
  { label: "Cart",    icon: ShoppingCart, href: "/cart" },
  { label: "Orders",  icon: Package,      href: "/orders" },
  { label: "Profile", icon: User,         href: "/profile" },
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

const HIDE_ROUTES = ["/auth", "/checkout", "/payment", "/live-tracking", "/cart-link"];

interface CartItem { id: string; quantity: number; }

export function MobileBottomTabBar() {
  const { isMobile } = useMobileDevice();
  const [location, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const { trigger: haptic } = useHaptic();

  const { data: cartItems = [] } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });
  const cartCount = cartItems.reduce((s, i) => s + (i.quantity || 1), 0);

  if (!isMobile) return null;
  if (HIDE_ROUTES.some((r) => location.startsWith(r))) return null;

  const role = user?.role ?? "buyer";
  let tabs: Tab[] = BUYER_TABS;
  if (role === "seller") tabs = SELLER_TABS;
  else if (role === "rider") tabs = RIDER_TABS;
  else if (role === "admin" || role === "super_admin") tabs = ADMIN_TABS;

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  return (
    <>
      {/* Content spacer */}
      <div
        className="md:hidden"
        style={{ height: `calc(68px + env(safe-area-inset-bottom, 0px))` }}
        aria-hidden
      />

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
        role="tablist"
        aria-label="Main navigation"
      >
        {/* Floating bar */}
        <div
          className="mx-3 mb-2 rounded-[28px] border border-border/40 shadow-xl shadow-black/10"
          style={{
            background: "hsl(var(--background))",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
          }}
        >
          <div className="flex h-[58px] px-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = isActive(tab.href);
              const badge = tab.href === "/cart" ? cartCount : 0;

              return (
                <button
                  key={tab.href}
                  role="tab"
                  aria-selected={active}
                  aria-label={tab.label}
                  onClick={() => { haptic("light"); navigate(tab.href); }}
                  className={cn(
                    "touch-ripple flex flex-col items-center justify-center flex-1 h-full gap-0.5 relative",
                    "transition-all duration-200 select-none rounded-[24px]",
                    active ? "text-primary" : "text-muted-foreground/60",
                  )}
                >
                  {/* Active pill highlight */}
                  {active && (
                    <span className="absolute inset-x-1 top-1 bottom-1 rounded-[22px] bg-primary/10 mobile-bounce-in" />
                  )}

                  <div className="relative z-10 flex flex-col items-center gap-0.5">
                    <div className="relative">
                      <Icon
                        className={cn(
                          "transition-all duration-200",
                          active ? "w-[22px] h-[22px] stroke-[2.5]" : "w-[21px] h-[21px] stroke-[1.8]",
                        )}
                        style={active ? { filter: "drop-shadow(0 0 4px oklch(var(--primary) / 0.4))" } : {}}
                      />
                      {badge > 0 && (
                        <span className="absolute -top-2 -right-2.5 min-w-[17px] h-[17px] px-[3px] bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full flex items-center justify-center mobile-bounce-in border-2 border-background">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </div>
                    <span className={cn(
                      "text-[10px] leading-none transition-all duration-200",
                      active ? "font-bold" : "font-medium",
                    )}>
                      {tab.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
