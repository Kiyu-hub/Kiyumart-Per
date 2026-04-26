import { ReactNode, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import DashboardSidebar from "./DashboardSidebar";
import BackButton from "./BackButton";
import { useQuery } from "@tanstack/react-query";
import { useSellerProfileGuard } from "@/hooks/useSellerProfileGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import ThemeToggle from "@/components/ThemeToggle";
import { ShieldAlert, Menu, X } from "lucide-react";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "seller" | "buyer" | "rider" | "pickup_agent" | "agent" | "super_admin";
  isActive?: boolean;
  isApproved?: boolean;
  rejectionReason?: string | null;
  profileImage?: string;
  roleFeatures?: Record<string, boolean>;
}

interface DashboardLayoutProps {
  children: ReactNode;
  role: "admin" | "seller" | "buyer" | "rider" | "pickup_agent" | "agent" | "super_admin";
  showBackButton?: boolean;
}

const roleBasePaths: Record<string, string> = {
  admin: "/admin",
  super_admin: "/admin",
  seller: "/seller",
  buyer: "/buyer",
  rider: "/rider",
  pickup_agent: "/pickup-agent",
  agent: "/agent",
};

const routeToMenuId: Record<string, string> = {
  "/admin": "dashboard",
  "/admin/branding": "branding",
  "/admin/categories": "categories",
  "/admin/media-library": "media-library",
  "/admin/products": "products",
  "/admin/orders": "orders",
  "/admin/users": "users",
  "/admin/sellers": "sellers",
  "/admin/riders": "riders",
  "/admin/applications": "applications",
  "/admin/permissions": "permissions",
  "/admin/zones": "zones",
  "/admin/delivery-zones": "zones",
  "/admin/pickup-stations": "pickup-stations",
  "/admin/pickup-verify": "pickup-verify",
  "/admin/delivery-tracking": "delivery-tracking",
  "/admin/manual-rider-assignment": "manual-rider-assignment",
  "/admin/notifications": "notifications",
  "/admin/messages": "messages",
  "/admin/live-support": "live-support",
  "/admin/system-activities": "system-activities",
  "/admin/analytics": "analytics",
  "/admin/platform-analytics": "platform-analytics",
  "/admin/sentry": "sentry",
  "/admin/platform-health": "platform-health",
  "/admin/platform-earnings": "platform-earnings",
  "/admin/settings": "settings",
  "/admin/promotions": "promotions",
  "/admin/banners": "banners",
  "/admin/hero-banners": "hero-banners",
  "/admin/sellers-payouts": "sellers-payouts",
  "/admin/riders-payouts": "riders-payouts",
  "/seller": "dashboard",
  "/seller/media-library": "media-library",
  "/seller/products": "products",
  "/seller/categories": "categories",
  "/seller/orders": "orders",
  "/seller/coupons": "coupons",
  "/seller/promotions": "promotions",
  "/seller/deliveries": "deliveries",
  "/seller/payment-setup": "payment-setup",
  "/seller/notifications": "notifications",
  "/seller/messages": "messages",
  "/seller/analytics": "analytics",
  "/seller/reviews": "reviews",
  "/seller/platform-earnings": "platform-earnings",
  "/seller/payout": "payout",
  "/seller/payouts": "payout",
  "/seller/settings": "settings",
  "/buyer": "dashboard",
  "/buyer/orders": "orders",
  "/orders": "orders",
  "/wishlist": "wishlist",
  "/cart": "my-cart",
  "/notifications": "notifications",
  "/support": "support",
  "/settings": "settings",
  "/rider": "dashboard",
  "/rider/deliveries": "deliveries",
  "/rider/route": "route",
  "/rider/notifications": "notifications",
  "/rider/messages": "messages",
  "/rider/earnings": "earnings",
  "/rider/settings": "settings",
  "/pickup-agent": "dashboard",
  "/pickup-agent/verify": "verify",
  "/pickup-agent/earnings": "earnings",
  "/pickup-agent/shift": "shift",
  "/pickup-agent/notifications": "notifications",
  "/pickup-agent/support": "support",
  "/pickup-agent/settings": "settings",
  "/agent": "dashboard",
  "/agent/tickets": "tickets",
  "/agent/customers": "customers",
  "/agent/messages": "messages",
  "/agent/notifications": "notifications",
  "/agent/settings": "settings",
};

function InactiveAccountNotice({
  role,
  reason,
}: {
  role: "seller" | "rider";
  reason?: string | null;
}) {
  return (
    <Card className="border-destructive/30 bg-card/95 shadow-sm">
      <CardContent className="p-6 md:p-8">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
              <ShieldAlert className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">Account Deactivated</h1>
              <p className="text-sm text-muted-foreground">
                Your {role} dashboard is restricted. Use the support ticket section in the sidebar to submit your appeal.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="destructive">Dashboard Access Restricted</Badge>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4">
            <p className="text-sm font-medium">Reason from admin</p>
            <p className="mt-2 text-sm text-muted-foreground">
                {reason || "Your account was deactivated by admin. Submit an appeal through Support to request reactivation."}
              </p>
            </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardLayout({
  children,
  role,
  showBackButton = true,
}: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  // CRITICAL: Enforce profile completion for sellers
  // Hook is always called (React Hooks Rules), but internally exempts /seller/settings
  useSellerProfileGuard(role === "seller" ? location : undefined);

  // Normalize role variants (some tokens may use `superadmin` without underscore)
  const normalizedRole = (role as string) === "superadmin" ? "super_admin" : role;

  const activeItem = useMemo(() => {
    // Handle shopping routes for all roles
    if (location === "/cart") return "my-cart";
    if (location === "/orders" && role !== "buyer") return "my-purchases";
    if (location === "/wishlist" && role !== "buyer") return "my-wishlist";
    
    const exactMatch = routeToMenuId[location];
    if (exactMatch) return exactMatch;

    for (const [path, menuId] of Object.entries(routeToMenuId)) {
      if (location.startsWith(path + "/")) {
        return menuId;
      }
    }

    return "dashboard";
  }, [location, role]);

  const pageTitle = useMemo(() => {
    if (activeItem === "dashboard") {
      const roleLabel =
        normalizedRole === "super_admin"
          ? "Super Admin"
          : normalizedRole.charAt(0).toUpperCase() + normalizedRole.slice(1);
      return `${roleLabel} Dashboard`;
    }

    return activeItem
      .split("-")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
  }, [activeItem, normalizedRole]);

  const inactiveAppealPath = "/support";
  const isInactiveSellerOrRider = Boolean(
    user &&
    (normalizedRole === "seller" || normalizedRole === "rider") &&
    user.role === normalizedRole &&
    user.isActive === false,
  );

  useEffect(() => {
    if (!user) return;
    // Seller/Rider dashboards require explicit admin approval.
    if ((normalizedRole === "seller" || normalizedRole === "rider")) {
      const roleMismatch = user.role !== normalizedRole;
      const pendingApproval = user.role === normalizedRole && user.isApproved !== true;
      if (roleMismatch || pendingApproval) {
        setLocation("/");
        return;
      }
      if (user.isActive === false && location !== inactiveAppealPath) {
        setLocation(inactiveAppealPath);
        return;
      }
    }
    const isSellerMessagesRoute = normalizedRole === "seller" && location.startsWith("/seller/messages");
    const isRiderMessagesRoute = normalizedRole === "rider" && location.startsWith("/rider/messages");
    if (!isSellerMessagesRoute && !isRiderMessagesRoute) return;

    const canViewMessages = user.roleFeatures?.["messages.view"] !== false;
    if (user.isActive !== false && !canViewMessages) {
      const basePath = roleBasePaths[normalizedRole] || "/";
      setLocation(basePath);
    }
  }, [inactiveAppealPath, location, normalizedRole, setLocation, user]);

  const handleItemClick = (id: string) => {
    const basePath = roleBasePaths[normalizedRole];

    if (id === "__back__") {
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
      } else {
        setLocation(basePath);
      }
      return;
    }

    if (id === "dashboard") {
      setLocation(basePath);
    } else if (id === "shop-mode") {
      // Navigate to shop homepage
      setLocation("/");
    } else if (id === "my-cart") {
      // All roles can access shopping cart
      setLocation("/cart");
    } else if (id === "my-purchases") {
      // All non-buyer roles access their purchases at /orders
      setLocation("/orders");
    } else if (id === "my-wishlist") {
      // All non-buyer roles access their wishlist at /wishlist
      setLocation("/wishlist");
    } else if (id === "support") {
      setLocation(normalizedRole === "pickup_agent" ? "/pickup-agent/support" : "/support");
    } else if (normalizedRole === "buyer" && id === "orders") {
      setLocation("/buyer/orders");
    } else if (normalizedRole === "buyer" && (id === "wishlist" || id === "support" || id === "notifications" || id === "settings")) {
      // Buyer uses global routes for these pages
      setLocation(`/${id}`);
    } else {
      setLocation(`${basePath}/${id}`);
    }
  };
  const fallbackRoute = roleBasePaths[normalizedRole] || "/";
  const isDashboardHome = location === fallbackRoute;

  const closeMobileSidebar = () => setIsMobileOpen(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden" data-dashboard-surface>
      {/* Desktop sidebar — always visible on md+ */}
      <div className="hidden md:flex">
        <DashboardSidebar
          role={normalizedRole as any}
          activeItem={activeItem}
          onItemClick={handleItemClick}
          userName={user?.name || "User"}
          userProfileImage={user?.profileImage}
        />
      </div>

      {/* Mobile sidebar overlay */}
      {isMobileOpen && (
        <div
          className="mobile-sidebar-overlay md:hidden"
          onClick={closeMobileSidebar}
          aria-hidden="true"
        />
      )}

      {/* Mobile sidebar panel */}
      {isMobileOpen && (
        <div className="mobile-sidebar-panel md:hidden bg-card shadow-2xl">
          <button
            onClick={closeMobileSidebar}
            className="absolute top-4 right-3 z-10 p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          <DashboardSidebar
            role={normalizedRole as any}
            activeItem={activeItem}
            onItemClick={(id) => { handleItemClick(id); closeMobileSidebar(); }}
            userName={user?.name || "User"}
            userProfileImage={user?.profileImage}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className="border-b bg-card px-4 md:px-6 py-3 md:py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* Hamburger — mobile only */}
              <button
                className="md:hidden p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => setIsMobileOpen(true)}
                aria-label="Open menu"
              >
                <Menu className="h-5 w-5" />
              </button>
              <h1 className="text-xl md:text-2xl font-bold truncate" data-testid="text-dashboard-title">
                {pageTitle}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Button variant="outline" size="sm" onClick={() => setLocation("/")} data-testid="button-shop" className="hidden sm:inline-flex">
                Shop
              </Button>
            </div>
          </div>
        </header>

        {showBackButton && !isDashboardHome && (
          <div className="border-b px-6 py-3 bg-card">
            <BackButton fallbackRoute={fallbackRoute} />
          </div>
        )}
        
        <main className="flex-1 overflow-y-auto" data-route-scroll-container>
          {isInactiveSellerOrRider ? (
            <div className="space-y-6 p-6 md:p-8">
              <InactiveAccountNotice
                role={normalizedRole as "seller" | "rider"}
                reason={user?.rejectionReason}
              />
              {location === inactiveAppealPath ? children : null}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}
