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
  DollarSign,
  UserCheck,
  CreditCard,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import UserAvatar from "@/components/UserAvatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { getDashboardRoleLabel } from "@/lib/roleLabels";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  id: string;
  badge?: number | "dynamic" | "applications_dynamic" | "assignments_dynamic" | "issues_dynamic";
  separator?: boolean;
}

interface DashboardSidebarProps {
  role: "admin" | "seller" | "buyer" | "rider" | "pickup_agent" | "agent" | "super_admin";
  activeItem?: string;
  onItemClick?: (id: string) => void;
  userName?: string;
  userProfileImage?: string;
}

interface CurrentUserPayload {
  id?: string;
  name?: string;
  role?: string;
  profileImage?: string;
  isActive?: boolean;
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
    { icon: MapPin, label: "Pickup Stations", id: "pickup-stations" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Activity, label: "Live Support", id: "live-support" },
    { icon: Shield, label: "System Activities", id: "system-activities", badge: "issues_dynamic" },
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
    { icon: MapPin, label: "Pickup Stations", id: "pickup-stations" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Activity, label: "Live Support", id: "live-support" },
    { icon: Shield, label: "System Activities", id: "system-activities", badge: "issues_dynamic" },
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
    { icon: Grid3x3, label: "Categories", id: "categories" },
    { icon: ShoppingBag, label: "Orders", id: "orders" },
    { icon: Tag, label: "Coupons", id: "coupons" },
    { icon: Tag, label: "Promotions", id: "promotions" },
    { icon: Truck, label: "Deliveries", id: "deliveries" },
    { icon: DollarSign, label: "Payment Setup", id: "payment-setup", separator: true },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart" },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: Headphones, label: "Support", id: "support" },
    { icon: BarChart3, label: "Analytics", id: "analytics" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
  rider: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
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
  pickup_agent: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic" },
    { icon: Headphones, label: "Support", id: "support" },
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
  const normalizedRole = String(role || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_")
    .replace(/^superadmin$/, "super_admin") as DashboardSidebarProps["role"];
  const items = Array.isArray(menuItems[normalizedRole]) ? menuItems[normalizedRole] : [];
  const { isExternalRiderSystemEnabled, hasResolvedSettings, isMultiVendor, allowSellerDirectSupportMessages } = usePlatformSettings();
  const showInternalRiderFeatures = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;

  // Ensure we have the current user available for the avatar and user-scoped caches.
  const { data: currentUser } = useQuery<CurrentUserPayload>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (!res.ok) return null;
      return res.json();
    },
    // Use cached value if present
    initialData: () => queryClient.getQueryData(["/api/auth/me"]),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  const { data: notificationCount = 0 } = useQuery<number>({
    queryKey: ["/api/notifications/unread-count", currentUser?.id || "anonymous"],
    queryFn: async () => {
      if (!currentUser?.id) return 0;
      const res = await fetch("/api/notifications/unread-count", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return 0;
      const payload = await res.json();
      const parsed = Number(payload?.count ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    },
    enabled: !!currentUser?.id,
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: applicationBadgeData } = useQuery<{ count: number }>({
    queryKey: ["/api/sidebar/pending-applications-count"],
    queryFn: async () => {
      if (normalizedRole !== "admin" && normalizedRole !== "super_admin") return { count: 0 };
      const sellerRes = await fetch("/api/users?role=seller&applicationStatus=pending", { credentials: "include" });
      if (!sellerRes.ok) return { count: 0 };
      const sellers = await sellerRes.json();
      const sellerCount = Array.isArray(sellers) ? sellers.length : 0;
      if (!showInternalRiderFeatures) {
        return { count: sellerCount };
      }
      const riderRes = await fetch("/api/users?role=rider&applicationStatus=pending", { credentials: "include" });
      if (!riderRes.ok) return { count: sellerCount };
      const riders = await riderRes.json();
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
      // Keep sidebar count aligned with dispatch center source of truth.
      const queueRes = await fetch("/api/admin/pending-orders", { credentials: "include" });
      if (!queueRes.ok) return { count: 0 };
      const queue = await queueRes.json();
      return { count: Array.isArray(queue) ? queue.length : 0 };
    },
    enabled: (normalizedRole === "admin" || normalizedRole === "super_admin") && showInternalRiderFeatures,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const pendingAssignmentsCount = assignmentBadgeData?.count || 0;

  const { data: systemActivitySummary } = useQuery<{
    totalActivities: number;
    activeIssues: number;
    criticalErrors: number;
  }>({
    queryKey: ["/api/admin/system-activities/summary"],
    queryFn: async () => {
      if (normalizedRole !== "admin" && normalizedRole !== "super_admin") {
        return { totalActivities: 0, activeIssues: 0, criticalErrors: 0 };
      }
      const res = await fetch("/api/admin/system-activities/summary", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        return { totalActivities: 0, activeIssues: 0, criticalErrors: 0 };
      }
      return res.json();
    },
    enabled: normalizedRole === "admin" || normalizedRole === "super_admin",
    refetchInterval: 15000,
    staleTime: 5000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const activeSystemIssuesCount = Number(systemActivitySummary?.activeIssues || 0);

  const visibleItems = (() => {
    const isRestrictedInactiveAccount =
      (normalizedRole === "seller" || normalizedRole === "rider") &&
      currentUser?.role === normalizedRole &&
      currentUser?.isActive === false;

    if (isRestrictedInactiveAccount) {
      return [
        { icon: Headphones, label: "Support", id: "support" },
      ] as MenuItem[];
    }

    const roleFeatures = currentUser?.roleFeatures || {};
    const canViewMaps = normalizedRole === "rider" ? true : roleFeatures["maps.view"] !== false;
    const canViewMessages = roleFeatures["messages.view"] === true;
    const canManagePromotions = roleFeatures["promotions.manage"] !== false;
    return items
      .filter((item) => {
      if (
        !showInternalRiderFeatures &&
        (normalizedRole === "admin" || normalizedRole === "super_admin") &&
        (
          item.id === "riders" ||
          item.id === "delivery-tracking" ||
          item.id === "manual-rider-assignment" ||
          item.id === "riders-payouts" ||
          item.id === "zones"
        )
      ) {
        return false;
      }
      if (!canViewMaps) {
        if (item.id === "delivery-tracking") return false;
      }
      if (normalizedRole === "seller" && item.id === "deliveries" && !showInternalRiderFeatures) {
        return false;
      }
      if (normalizedRole === "seller" && item.id === "messages") {
        return canViewMessages && allowSellerDirectSupportMessages;
      }
      if (normalizedRole === "seller" && item.id === "support") {
        return !allowSellerDirectSupportMessages;
      }
      if (item.id === "messages") return canViewMessages;
      if (normalizedRole === "seller" && item.id === "promotions") return canManagePromotions && isMultiVendor;
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
            <p className="text-xs text-muted-foreground">
              {getDashboardRoleLabel(normalizedRole)}
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
              : item.badge === "issues_dynamic"
                ? (activeSystemIssuesCount > 0 ? (activeSystemIssuesCount > 99 ? "99+" : String(activeSystemIssuesCount)) : null)
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
