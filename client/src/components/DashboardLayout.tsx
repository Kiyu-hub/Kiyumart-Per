import { ReactNode, useMemo } from "react";
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
}

interface DashboardLayoutProps {
  children: ReactNode;
  role: "admin" | "seller" | "buyer" | "rider" | "agent" | "super_admin";
  showBackButton?: boolean;
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
  "/admin/sellers-payouts": "sellers-payouts",
  "/admin/riders-payouts": "riders-payouts",
  "/seller": "dashboard",
  "/seller/media-library": "media-library",
  "/seller/products": "products",
  "/seller/orders": "orders",
  "/seller/coupons": "coupons",
  "/seller/deliveries": "deliveries",
  "/seller/payment-setup": "payment-setup",
  "/seller/notifications": "notifications",
  "/seller/messages": "messages",
  "/seller/analytics": "analytics",
  "/seller/platform-earnings": "platform-earnings",
  "/seller/payout": "payout",
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

  const handleItemClick = (id: string) => {
    const basePath = roleBasePaths[role];
    
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
    } else if (role === "buyer" && (id === "orders" || id === "wishlist" || id === "support" || id === "notifications" || id === "settings")) {
      // Buyer uses global routes for these pages
      setLocation(`/${id}`);
    } else {
      setLocation(`${basePath}/${id}`);
    }
  };

  const fallbackRoute = roleBasePaths[role] || "/";
  const isDashboardHome = location === fallbackRoute;

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role={role}
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user?.name || "User"}
      />
      
      <div className="flex-1 flex flex-col overflow-hidden">
        {showBackButton && !isDashboardHome && (
          <div className="border-b px-6 py-3 bg-card">
            <BackButton fallbackRoute={fallbackRoute} />
          </div>
        )}
        
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
