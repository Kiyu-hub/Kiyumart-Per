import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Users,
  Truck,
  MessageSquare,
  Settings,
  BarChart3,
  Store,
  MapPin,
  Tag,
  Grid3x3,
  Heart,
  Headphones,
  Palette,
  Bell,
  Ticket,
  UserCog,
  ImagePlus,
  ShoppingCart,
  Shield,
  Home,
  DollarSign,
  UserCheck,
  CreditCard,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import UserAvatar from "@/components/UserAvatar";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  id: string;
  badge?: number | "dynamic" | "applications_dynamic" | "assignments_dynamic";
  separator?: boolean;
}

interface DashboardSidebarProps {
  role: "admin" | "seller" | "buyer" | "rider" | "agent" | "super_admin";
  activeItem?: string;
  onItemClick?: (id: string) => void;
  userName?: string;
  userProfileImage?: string;
}

interface CurrentUserPayload {
  id?: string;
  name?: string;
  profileImage?: string;
  roleFeatures?: Record<string, boolean>;
}

const menuItems: Record<string, MenuItem[]> = {
  super_admin: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: Truck, label: "Live Delivery", id: "delivery-tracking" },
    { icon: Grid3x3, label: "Categories", id: "categories" },
    { icon: ImagePlus, label: "Media Library", id: "media-library" },
    { icon: Package, label: "Products", id: "products" },
    { icon: ShoppingBag, label: "Orders", id: "orders" },
    { icon: Users, label: "Users", id: "users" },
    { icon: UserCog, label: "Sellers", id: "sellers" },
    { icon: Truck, label: "Riders", id: "riders" },
    { icon: UserCheck, label: "Assign Riders", id: "manual-rider-assignment", badge: "assignments_dynamic" },
    { icon: Ticket, label: "Applications", id: "applications", badge: "applications_dynamic" },
    { icon: Shield, label: "Permissions", id: "permissions" },
    { icon: MapPin, label: "Delivery Zones", id: "zones" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Activity, label: "Live Support", id: "live-support" },
    { icon: BarChart3, label: "Analytics", id: "analytics" },
    { icon: DollarSign, label: "Platform Earnings", id: "platform-earnings" },
    { icon: CreditCard, label: "Seller Payouts", id: "sellers-payouts" },
    { icon: Truck, label: "Rider Payouts", id: "riders-payouts" },
    { icon: Tag, label: "Promotions", id: "promotions" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
  admin : [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: Grid3x3, label: "Categories", id: "categories" },
    { icon: Package, label: "Products", id: "products" },
    { icon: ShoppingBag, label: "Orders", id: "orders" },
    { icon: UserCog, label: "Sellers", id: "sellers" },
    { icon: Truck, label: "Riders", id: "riders" },
    { icon: UserCheck, label: "Assign Riders", id: "manual-rider-assignment", badge: "assignments_dynamic" },
    { icon: Ticket, label: "Applications", id: "applications", badge: "applications_dynamic" },
    { icon: MapPin, label: "Delivery Zones", id: "zones" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Activity, label: "Live Support", id: "live-support" },
    { icon: BarChart3, label: "Analytics", id: "analytics" },
    { icon: DollarSign, label: "Platform Earnings", id: "platform-earnings" },
    { icon: CreditCard, label: "Seller Payouts", id: "sellers-payouts" },
    { icon: Truck, label: "Rider Payouts", id: "riders-payouts" },
    { icon: Tag, label: "Promotions", id: "promotions" },
  ],
  seller: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: ImagePlus, label: "Media Library", id: "media-library" },
    { icon: Package, label: "My Products", id: "products" },
    { icon: ShoppingBag, label: "Orders", id: "orders" },
    { icon: Tag, label: "Coupons", id: "coupons" },
    { icon: Truck, label: "Deliveries", id: "deliveries" },
    { icon: DollarSign, label: "Payment Setup", id: "payment-setup", separator: true },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart" },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Headphones, label: "Support", id: "support" },
    { icon: BarChart3, label: "Analytics", id: "analytics" },
    { icon: DollarSign, label: "Platform Earnings", id: "platform-earnings" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
  rider: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: Home, label: "Shop Mode", id: "shop-mode" },
    { icon: ShoppingBag, label: "Deliveries", id: "deliveries" },
    { icon: MapPin, label: "Active Route", id: "route" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Headphones, label: "Support", id: "support" },
    { icon: BarChart3, label: "Earnings", id: "earnings" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
  buyer: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: ShoppingBag, label: "My Orders", id: "orders" },
    { icon: Heart, label: "Wishlist", id: "wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic" },
    { icon: Headphones, label: "Support", id: "support" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
  agent: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: Home, label: "Shop Mode", id: "shop-mode" },
    { icon: Ticket, label: "My Tickets", id: "tickets" },
    { icon: Users, label: "Customers", id: "customers" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: MessageSquare, label: "Messages", id: "messages", separator: true },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
};

export default function DashboardSidebar({
  role,
  activeItem = "dashboard",
  onItemClick,
  userName = "User",
  userProfileImage,
}: DashboardSidebarProps) {
  // Normalize incoming role variants (some tokens may be "superadmin")
  const normalizedRole = (role as string) === "superadmin" ? "super_admin" : role;
  const items = menuItems[normalizedRole];

  // Fetch real notification count
  const { data: notificationData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const notificationCount = notificationData?.count || 0;

  const { data: applicationBadgeData } = useQuery<{ count: number }>({
    queryKey: ["/api/sidebar/pending-applications-count"],
    queryFn: async () => {
      if (normalizedRole !== "admin" && normalizedRole !== "super_admin") return { count: 0 };
      const [sellerRes, riderRes] = await Promise.all([
        fetch("/api/users?role=seller&applicationStatus=pending", { credentials: "include" }),
        fetch("/api/users?role=rider&applicationStatus=pending", { credentials: "include" }),
      ]);
      if (!sellerRes.ok || !riderRes.ok) return { count: 0 };
      const [sellers, riders] = await Promise.all([sellerRes.json(), riderRes.json()]);
      const sellerCount = Array.isArray(sellers) ? sellers.length : 0;
      const riderCount = Array.isArray(riders) ? riders.length : 0;
      return { count: sellerCount + riderCount };
    },
    enabled: normalizedRole === "admin" || normalizedRole === "super_admin",
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const pendingApplicationsCount = applicationBadgeData?.count || 0;

  const { data: assignmentBadgeData } = useQuery<{ count: number }>({
    queryKey: ["/api/sidebar/pending-assignments-count"],
    queryFn: async () => {
      if (normalizedRole !== "admin" && normalizedRole !== "super_admin") return { count: 0 };
      const ordersRes = await fetch("/api/orders", { credentials: "include" });
      if (!ordersRes.ok) return { count: 0 };
      const orders = await ordersRes.json();
      if (!Array.isArray(orders)) return { count: 0 };

      const actionableStatuses = new Set(["pending", "confirmed", "processing", "ready", "searching_rider"]);
      const count = orders.filter((order: any) => {
        const deliveryMethod = String(order?.deliveryMethod || "").toLowerCase().trim();
        const status = String(order?.status || "").toLowerCase().trim();
        const riderId = order?.riderId || null;
        return deliveryMethod !== "pickup" && !riderId && actionableStatuses.has(status);
      }).length;

      return { count };
    },
    enabled: normalizedRole === "admin" || normalizedRole === "super_admin",
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const pendingAssignmentsCount = assignmentBadgeData?.count || 0;

  // Ensure we have the current user available for the avatar even if parent hasn't passed it yet
  const { data: currentUser } = useQuery<CurrentUserPayload>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    // Use cached value if present
    initialData: () => queryClient.getQueryData(["/api/auth/me"]),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  const visibleItems = (() => {
    // Seller/Rider chat visibility is controlled by super admin role features.
    if (normalizedRole !== "seller" && normalizedRole !== "rider") return items;
    const roleFeatures = currentUser?.roleFeatures || {};
    const canViewMessages = roleFeatures["messages.view"] === true;
    return items.filter((item) => {
      if (item.id === "messages") return canViewMessages;
      return true;
    });
  })();

  return (
    <div className="flex flex-col h-full w-64 bg-card border-r">
      <div className="p-6 border-b">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-green-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            K
          </div>
          <div>
            <h2 className="text-xl font-bold text-primary" data-testid="text-dashboard-logo">
              KiyuMart
            </h2>
            <p className="text-xs text-muted-foreground capitalize">
              {normalizedRole} Dashboard
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {visibleItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          const badgeValue = item.badge === "dynamic"
            ? (notificationCount > 0 ? (notificationCount > 9 ? "9+" : String(notificationCount)) : null)
            : item.badge === "applications_dynamic"
              ? (pendingApplicationsCount > 0 ? (pendingApplicationsCount > 99 ? "99+" : String(pendingApplicationsCount)) : null)
              : item.badge === "assignments_dynamic"
                ? (pendingAssignmentsCount > 0 ? (pendingAssignmentsCount > 99 ? "99+" : String(pendingAssignmentsCount)) : null)
              : typeof item.badge === "number"
                ? String(item.badge)
                : null;

          return (
            <div key={item.id}>
              {item.separator && (
                <div className="my-3 border-t border-border" />
              )}
              <button
                onClick={() => onItemClick?.(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors hover-elevate active-elevate-2",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-card-foreground"
                )}
                data-testid={`nav-item-${item.id}`}
              >
                <Icon className="h-5 w-5" />
                <span className="flex-1 text-left">{item.label}</span>
                {badgeValue && (
                  <span className="bg-destructive text-destructive-foreground text-xs rounded-full px-2 py-0.5">
                    {badgeValue}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t">
          <div className="flex items-center gap-3 px-4 py-3">
          <UserAvatar 
            profileImage={userProfileImage || currentUser?.profileImage}
            name={userName || currentUser?.name}
            size="md"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName || currentUser?.name}</p>
            <p className="text-xs text-muted-foreground capitalize">{normalizedRole}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
