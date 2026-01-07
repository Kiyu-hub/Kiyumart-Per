import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import OrderCard from "@/components/OrderCard";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, ShoppingBag, Users, Truck, Loader2, AlertCircle, UserCog, Ticket } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
  totalUsers: number;
}

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  deliveryMethod: string;
  total: string;
  status: string;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

export default function AdminDashboardConnected() {
  const [activeItem, setActiveItem] = useState("dashboard");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  useEffect(() => {
    // Update activeItem based on current route
    const path = location;
    if (path === "/admin" || path === "/admin/") {
      setActiveItem("dashboard");
    } else if (path.includes("/admin/delivery-tracking")) {
      setActiveItem("delivery-tracking");
    } else if (path.includes("/admin/permissions")) {
      setActiveItem("permissions");
    } else if (path.includes("/admin/store")) {
      setActiveItem("store");
    } else if (path.includes("/admin/branding")) {
      setActiveItem("branding");
    } else if (path.includes("/admin/categories")) {
      setActiveItem("categories");
    } else if (path.includes("/admin/products")) {
      setActiveItem("products");
    } else if (path.includes("/admin/orders")) {
      setActiveItem("orders");
    } else if (path.includes("/admin/users")) {
      setActiveItem("users");
    } else if (path.includes("/admin/sellers")) {
      setActiveItem("sellers");
    } else if (path.includes("/admin/manual-rider-assignment")) {
      setActiveItem("manual-rider-assignment");
    } else if (path.includes("/admin/riders")) {
      setActiveItem("riders");
    } else if (path.includes("/admin/applications")) {
      setActiveItem("applications");
    } else if (path.includes("/admin/zones") || path.includes("/admin/delivery-zones")) {
      setActiveItem("zones");
    } else if (path === "/cart") {
      setActiveItem("my-cart");
    } else if (path === "/orders" || path === "/track") {
      setActiveItem("my-purchases");
    } else if (path === "/wishlist") {
      setActiveItem("my-wishlist");
    } else if (path.includes("/admin/notifications") || path === "/notifications") {
      setActiveItem("notifications");
    } else if (path.includes("/admin/messages")) {
      setActiveItem("messages");
    } else if (path.includes("/admin/analytics")) {
      setActiveItem("analytics");
    } else if (path.includes("/admin/settings")) {
      setActiveItem("settings");
    } else if (path.includes("/admin/banners")) {
      setActiveItem("banners");
    } else if (path.includes("/admin/media-library")) {
      setActiveItem("media-library");
    }
  }, [location]);

  const handleItemClick = (id: string) => {
    navigate(
      id === "dashboard" ? "/admin" :
      id === "delivery-tracking" ? "/admin/delivery-tracking" :
      id === "permissions" ? "/admin/permissions" :
      id === "store" ? "/admin/store" :
      id === "branding" ? "/admin/branding" :
      id === "categories" ? "/admin/categories" :
      id === "media-library" ? "/admin/media-library" :
      id === "products" ? "/admin/products" :
      id === "orders" ? "/admin/orders" :
      id === "users" ? "/admin/users" :
      id === "sellers" ? "/admin/sellers" :
      id === "riders" ? "/admin/riders" :
      id === "manual-rider-assignment" ? "/admin/manual-rider-assignment" :
      id === "applications" ? "/admin/applications" :
      id === "zones" ? "/admin/zones" :
      id === "my-cart" ? "/cart" :
      id === "my-purchases" ? "/orders" :
      id === "my-wishlist" ? "/wishlist" :
      id === "notifications" ? "/admin/notifications" :
      id === "messages" ? "/admin/messages" :
      id === "analytics" ? "/admin/analytics" :
      id === "settings" ? "/admin/settings" :
      "/admin"
    );
  };

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", user?.id],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const { data: buyers = [] } = useQuery<User[]>({
    queryKey: ["/api/users", "buyer"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=buyer");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  if (authLoading || !isAuthenticated || (user?.role !== "super_admin" && user?.role !== "admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-admin" />
      </div>
    );
  }

  const recentOrders = orders
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const buyerMap = new Map(Array.isArray(buyers) ? buyers.map(b => [b.id, b]) : []);

  const deliveredCount = orders.filter(o => o.status === "delivered").length;

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role={user.role as any}
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user.name}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            {user.role === "super_admin" ? "Super Admin" : "Admin"} Dashboard
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" onClick={() => navigate("/")} data-testid="button-shop">
              Shop
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {user.role === "super_admin" && (
              analyticsLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : analytics ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <MetricCard
                    title="Total Revenue"
                    value={formatPrice(analytics.totalRevenue || 0)}
                    icon={DollarSign}
                    change={12.5}
                  />
                  <MetricCard
                    title="Total Orders"
                    value={(analytics.totalOrders || 0).toString()}
                    icon={ShoppingBag}
                    change={8.2}
                  />
                  <MetricCard
                    title="Total Users"
                    value={(analytics.totalUsers || 0).toString()}
                    icon={Users}
                    change={-3.1}
                  />
                  <MetricCard
                    title="Deliveries"
                    value={deliveredCount.toString()}
                    icon={Truck}
                    change={15.3}
                  />
                </div>
              ) : (
                <Card>
                  <CardContent className="p-6 flex items-center gap-3 text-destructive">
                    <AlertCircle className="h-5 w-5" />
                    <span>Failed to load analytics</span>
                  </CardContent>
                </Card>
              )
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Platform Settings</CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/settings")}
                    data-testid="button-configure"
                  >
                    Configure
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Platform Configuration</p>
                        <p className="text-sm text-muted-foreground">
                          Manage payment settings, contact info, and branding
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <UserCog className="h-5 w-5" />
                    Sellers Management
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/sellers")}
                    data-testid="button-view-sellers"
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Manage Sellers</p>
                        <p className="text-sm text-muted-foreground">
                          View, approve, and manage all sellers on the platform
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5" />
                    Applications
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/applications")}
                    data-testid="button-view-applications"
                  >
                    Review
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Pending Applications</p>
                        <p className="text-sm text-muted-foreground">
                          Review and approve seller and rider applications
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Riders Management
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/riders")}
                    data-testid="button-view-riders"
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Manage Riders</p>
                        <p className="text-sm text-muted-foreground">
                          View, approve, and manage all riders on the platform
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Recent Orders</h2>
                <Button variant="outline" onClick={() => navigate("/orders")} data-testid="button-view-all">View All</Button>
              </div>

              {ordersLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : recentOrders.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recentOrders.map((order) => {
                    const buyer = buyerMap.get(order.buyerId);
                    const orderDate = new Date(order.createdAt);
                    const formattedDate = orderDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    });

                    return (
                      <OrderCard
                        key={order.id}
                        orderId={order.orderNumber}
                        customerName={buyer?.name || "Unknown Customer"}
                        items={1}
                        total={parseFloat(order.total)}
                        status={order.status as any}
                        deliveryMethod={order.deliveryMethod as any}
                        date={formattedDate}
                        onViewDetails={() => navigate(`/admin/orders?orderId=${order.id}`)}
                      />
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No orders yet
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
