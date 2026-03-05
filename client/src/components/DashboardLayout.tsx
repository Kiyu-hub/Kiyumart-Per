import { ReactNode, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import DashboardSidebar from "./DashboardSidebar";
import BackButton from "./BackButton";
import { useQuery } from "@tanstack/react-query";
import { useSellerProfileGuard } from "@/hooks/useSellerProfileGuard";

interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "seller" | "buyer" | "rider" | "agent" | "super_admin";
  isApproved?: boolean;
  profileImage?: string;
  roleFeatures?: Record<string, boolean>;
}

interface DashboardLayoutProps {
  children: ReactNode;
  role: "admin" | "seller" | "buyer" | "rider" | "agent" | "super_admin";
  showBackButton?: boolean;
}

interface DashboardGuideCard {
  id: string;
  title: string;
  description: string;
}

const roleBasePaths: Record<string, string> = {
  admin: "/admin",
  super_admin: "/admin",
  seller: "/seller",
  buyer: "/buyer",
  rider: "/rider",
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
  "/admin/delivery-tracking": "delivery-tracking",
  "/admin/manual-rider-assignment": "manual-rider-assignment",
  "/admin/notifications": "notifications",
  "/admin/messages": "messages",
  "/admin/live-support": "live-support",
  "/admin/analytics": "analytics",
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
  "/seller/orders": "orders",
  "/seller/coupons": "coupons",
  "/seller/promotions": "promotions",
  "/seller/deliveries": "deliveries",
  "/seller/payment-setup": "payment-setup",
  "/seller/notifications": "notifications",
  "/seller/messages": "messages",
  "/seller/analytics": "analytics",
  "/seller/platform-earnings": "platform-earnings",
  "/seller/payout": "payout",
  "/seller/payouts": "payout",
  "/seller/settings": "settings",
  "/buyer": "dashboard",
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
  "/agent": "dashboard",
  "/agent/tickets": "tickets",
  "/agent/customers": "customers",
  "/agent/messages": "messages",
  "/agent/notifications": "notifications",
  "/agent/settings": "settings",
};

function buildDashboardGuideCards(role: string, location: string): DashboardGuideCard[] {
  const route = String(location || "").toLowerCase();
  const isMapContext =
    route.includes("delivery-tracking") ||
    route.includes("manual-rider-assignment") ||
    route.includes("/rider/route") ||
    route.includes("/deliveries") ||
    route.includes("/rider");
  const isFinancialContext =
    route.includes("earnings") ||
    route.includes("payout") ||
    route.includes("platform-earnings") ||
    route.includes("payment-setup") ||
    route.includes("finance");

  const cards: DashboardGuideCard[] = [
    {
      id: "live-state-rule",
      title: "Live DB State Rule",
      description:
        "Dashboards reflect backend truth only. If GPS, rider status, or order state is stale, it should be marked unavailable or hidden until the next valid realtime update.",
    },
    {
      id: "order-flow",
      title: "Order Status Flow",
      description:
        "Buyer places order -> pending payment -> paid -> seller preparing -> seller ready -> rider assigned -> pickup OTP/QR verification -> in transit -> delivered (or bus handoff verified).",
    },
  ];

  if (isMapContext || role === "super_admin" || role === "admin" || role === "agent" || role === "rider") {
    cards.push({
      id: "map-ops",
      title: "Map + Rider Operations",
      description:
        "Rider Risk Overlay highlights stale GPS, overload, or route-deviation risk. Fleet controls use live location, vehicle type, and active-order counters for assignment decisions.",
    });
  }

  if (isFinancialContext || role === "super_admin" || role === "admin" || role === "seller" || role === "rider") {
    cards.push({
      id: "finance",
      title: "Financial Integrity",
      description:
        "Earnings, commissions, payouts, and fees should come from settled order/payment records. Use finance pages to verify totals before payout actions and avoid manual reconciliation drift.",
    });
  }

  if (role === "seller") {
    cards.push({
      id: "seller-actions",
      title: "Seller Action Scope",
      description:
        "Seller actions should focus on packaging readiness and handoff verification for assigned orders only; assignment and cross-zone dispatch remain controlled by admin workflows.",
    });
  }

  if (role === "rider") {
    cards.push({
      id: "rider-actions",
      title: "Rider Action Scope",
      description:
        "Riders should accept/reject eligible assignments, maintain live GPS heartbeat, complete pickup/drop verification, and update delivery progress directly from DB-backed action controls.",
    });
  }

  return cards;
}

export default function DashboardLayout({
  children,
  role,
  showBackButton = true,
}: DashboardLayoutProps) {
  const [location, setLocation] = useLocation();

  const { data: user } = useQuery<User>({
    queryKey: ["/api/auth/me"],
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
  const guideCards = useMemo(
    () => buildDashboardGuideCards(normalizedRole, location),
    [location, normalizedRole],
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
    }
    const isSellerMessagesRoute = normalizedRole === "seller" && location.startsWith("/seller/messages");
    const isRiderMessagesRoute = normalizedRole === "rider" && location.startsWith("/rider/messages");
    if (!isSellerMessagesRoute && !isRiderMessagesRoute) return;

    const canViewMessages = user.roleFeatures?.["messages.view"] === true;
    if (!canViewMessages) {
      const basePath = roleBasePaths[normalizedRole] || "/";
      setLocation(basePath);
    }
  }, [location, normalizedRole, setLocation, user]);

  const handleItemClick = (id: string) => {
    const basePath = roleBasePaths[normalizedRole];
    
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
      setLocation("/support");
    } else if (normalizedRole === "buyer" && (id === "orders" || id === "wishlist" || id === "support" || id === "notifications" || id === "settings")) {
      // Buyer uses global routes for these pages
      setLocation(`/${id}`);
    } else {
      setLocation(`${basePath}/${id}`);
    }
  };
  const fallbackRoute = roleBasePaths[normalizedRole] || "/";
  const isDashboardHome = location === fallbackRoute;

  return (
    <div className="flex h-screen bg-background" data-dashboard-surface>
      <DashboardSidebar
        role={normalizedRole as any}
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user?.name || "User"}
        userProfileImage={user?.profileImage}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {showBackButton && !isDashboardHome && (
          <div className="border-b px-6 py-3 bg-card">
            <BackButton fallbackRoute={fallbackRoute} />
          </div>
        )}
        <div className="border-b bg-muted/20 px-6 py-2">
          <details open>
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Page Guide and Realtime Rules
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
              {guideCards.map((card) => (
                <div key={card.id} className="rounded-md border bg-background/70 px-3 py-2">
                  <p className="text-xs font-semibold text-foreground">{card.title}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{card.description}</p>
                </div>
              ))}
            </div>
          </details>
        </div>
        
        <main className="flex-1 overflow-y-auto" data-route-scroll-container>
          {children}
        </main>
      </div>
    </div>
  );
}
