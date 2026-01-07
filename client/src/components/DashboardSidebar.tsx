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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface MenuItem {
  icon: React.ElementType;
  label: string;
  id: string;
  badge?: number | "dynamic";
  separator?: boolean;
}

interface DashboardSidebarProps {
  role: "admin" | "seller" | "buyer" | "rider" | "agent" | "super_admin";
  activeItem?: string;
  onItemClick?: (id: string) => void;
  userName?: string;
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
    { icon: UserCheck, label: "Assign Riders", id: "manual-rider-assignment" },
    { icon: Ticket, label: "Applications", id: "applications" },
    { icon: Shield, label: "Permissions", id: "permissions" },
    { icon: MapPin, label: "Delivery Zones", id: "zones" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: BarChart3, label: "Analytics", id: "analytics" },
    { icon: Settings, label: "Settings", id: "settings" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
    { icon: Grid3x3, label: "Categories", id: "categories" },
    { icon: Package, label: "Products", id: "products" },
    { icon: ShoppingBag, label: "Orders", id: "orders" },
    { icon: UserCog, label: "Sellers", id: "sellers" },
    { icon: Truck, label: "Riders", id: "riders" },
    { icon: UserCheck, label: "Assign Riders", id: "manual-rider-assignment" },
    { icon: MapPin, label: "Delivery Zones", id: "zones" },
    { icon: ShoppingCart, label: "Shopping Cart", id: "my-cart", separator: true },
    { icon: ShoppingBag, label: "My Purchases", id: "my-purchases" },
    { icon: Heart, label: "My Wishlist", id: "my-wishlist" },
    { icon: Bell, label: "Notifications", id: "notifications", badge: "dynamic", separator: true },
    { icon: MessageSquare, label: "Messages", id: "messages" },
    { icon: BarChart3, label: "Analytics", id: "analytics" },
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
    { icon: BarChart3, label: "Analytics", id: "analytics" },
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
}: DashboardSidebarProps) {
  const items = menuItems[role];

  // Fetch real notification count
  const { data: notificationData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const notificationCount = notificationData?.count || 0;

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
              {role} Dashboard
            </p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {items.map((item, index) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;

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
                {item.badge && (
                  <span className="bg-destructive text-destructive-foreground text-xs rounded-full px-2 py-0.5">
                    {item.badge === "dynamic" ? (notificationCount > 0 ? (notificationCount > 9 ? "9+" : notificationCount) : null) : item.badge}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
            <p className="text-xs text-muted-foreground capitalize">{role}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
