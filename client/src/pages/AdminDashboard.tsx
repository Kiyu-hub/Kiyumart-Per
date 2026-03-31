import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";
import RealTimeRiderMap from "@/components/RealTimeRiderMap";
import { DollarSign, ShoppingBag, Users, Truck, Loader2, AlertCircle, MapPin } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Analytics {
  totalRevenue?: number;
  platformRevenueTotal?: number;
  totalOrders?: number;
  totalUsers?: number;
  totalProducts?: number;
}

interface DashboardSummary {
  totalOrders?: number;
  totalUsers?: number;
  totalRevenue?: number;
  platformRevenueTotal?: number;
}

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  total?: string;
  paymentStatus?: string;
  createdAt: string;
}

interface DeliveryZone {
  id: string;
}

function AdminMetricSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={`admin-metric-skeleton-${index}`} className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-24" />
            <Skeleton className="mt-3 h-4 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AdminRecentOrdersSkeletonGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={`admin-order-skeleton-${index}`}>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-6 w-32" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-2">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-4 w-20" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Skeleton className="h-16 flex-1 rounded-lg" />
                <Skeleton className="h-16 flex-1 rounded-lg" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const normalizedRole = (() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  })();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();
  const [activeItem, setActiveItem] = useState("dashboard");
  const showInternalRiderFeatures = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;
  const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();
  const normalizePaymentStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid") return "paid";
    return s || "pending";
  };

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    const path = location;
    if (path === "/admin" || path === "/admin/") {
      setActiveItem("dashboard");
    } else if (path.includes("/admin/products")) {
      setActiveItem("products");
    } else if (path.includes("/admin/orders")) {
      setActiveItem("orders");
    } else if (path.includes("/admin/sellers")) {
      setActiveItem("sellers");
    } else if (path.includes("/admin/riders")) {
      setActiveItem("riders");
    } else if (path.includes("/admin/categories")) {
      setActiveItem("categories");
    } else if (path.includes("/admin/pickup-stations")) {
      setActiveItem("pickup-stations");
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
    } else if (path.includes("/admin/live-support")) {
      setActiveItem("live-support");
    } else if (path.includes("/admin/analytics")) {
      setActiveItem("analytics");
    } else if (path.includes("/admin/promotions")) {
      setActiveItem("promotions");
    } else if (path.includes("/admin/platform-earnings")) {
      setActiveItem("platform-earnings");
    } else if (path.includes("/admin/sellers-payouts")) {
      setActiveItem("sellers-payouts");
    } else if (path.includes("/admin/riders-payouts")) {
      setActiveItem("riders-payouts");
    } else if (path.includes("/admin/manual-rider-assignment")) {
      setActiveItem("manual-rider-assignment");
    }
  }, [location]);

  const handleItemClick = (id: string) => {
    navigate(
      id === "dashboard" ? "/admin" :
      id === "categories" ? "/admin/categories" :
      id === "products" ? "/admin/products" :
      id === "orders" ? "/admin/orders" :
      id === "sellers" ? "/admin/sellers" :
      id === "riders" ? "/admin/riders" :
      id === "zones" ? "/admin/zones" :
      id === "pickup-stations" ? "/admin/pickup-stations" :
      id === "my-cart" ? "/cart" :
      id === "my-purchases" ? "/orders" :
      id === "my-wishlist" ? "/wishlist" :
      id === "notifications" ? "/admin/notifications" :
      id === "messages" ? "/admin/messages" :
      id === "live-support" ? "/admin/live-support" :
      id === "analytics" ? "/admin/analytics" :
      id === "promotions" ? "/admin/promotions" :
      id === "platform-earnings" ? "/admin/platform-earnings" :
      id === "sellers-payouts" ? "/admin/sellers-payouts" :
      id === "riders-payouts" ? "/admin/riders-payouts" :
      id === "manual-rider-assignment" ? "/admin/manual-rider-assignment" :
      "/admin"
    );
  };

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
  });

  const { data: dashboardSummary, isLoading: dashboardSummaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/admin/dashboard-summary", "admin-dashboard"],
    queryFn: async () => {
      const res = await fetch("/api/admin/dashboard-summary", { credentials: "include", cache: "no-store" });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
  });

  const { data: deliveryZones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/admin/delivery-zones"],
    queryFn: async () => {
      const res = await fetch("/api/admin/delivery-zones", { credentials: "include", cache: "no-store" });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
    staleTime: 0,
    refetchInterval: 10000,
  });

  const { data: pickupStations = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/admin/pickup-stations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pickup-stations", { credentials: "include", cache: "no-store" });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
    staleTime: 0,
    refetchInterval: 10000,
  });

  if (authLoading || !isAuthenticated || (normalizedRole !== "admin" && normalizedRole !== "super_admin")) {
    return <PageLoadingState title="Loading dashboard" description="Preparing the admin workspace and latest activity." />;
  }

  const recentOrders = orders
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const deliveredCount = orders.filter(o => normalizeOrderStatus(o.status) === "delivered").length;
  const processingCount = orders.filter(o =>
    ["processing", "ready", "confirmed", "assigned", "picked_up", "en_route"].includes(normalizeOrderStatus(o.status))
  ).length;

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role={normalizedRole === "super_admin" ? "super_admin" : "admin"}
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user?.name || "Admin"}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">Admin Dashboard</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" onClick={() => navigate("/")} data-testid="button-shop">
              Shop
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {dashboardSummaryLoading && !dashboardSummary && analyticsLoading && !analytics ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Loading dashboard totals...</span>
                </div>
                <AdminMetricSkeletonGrid />
              </div>
            ) : analytics ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <MetricCard
                    title="Total Revenue"
                    value={formatPrice(dashboardSummary?.totalRevenue ?? dashboardSummary?.platformRevenueTotal ?? analytics?.platformRevenueTotal ?? analytics?.totalRevenue ?? 0)}
                    icon={DollarSign}
                    change={12.5}
                  />
                  <MetricCard
                    title="Total Orders"
                    value={(dashboardSummary?.totalOrders ?? analytics?.totalOrders ?? 0).toString()}
                    icon={ShoppingBag}
                    change={8.2}
                  />
                  <MetricCard
                    title="Total Users"
                    value={(dashboardSummary?.totalUsers ?? analytics?.totalUsers ?? 0).toString()}
                    icon={Users}
                    change={-3.1}
                  />
                <MetricCard
                  title={showInternalRiderFeatures ? "Deliveries" : "Completed Orders"}
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
            )}

            {showInternalRiderFeatures ? (
              <RealTimeRiderMap forceMapboxGl />
            ) : null}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                  <CardDescription>Manage your platform</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => navigate("/admin/products")}
                    data-testid="button-manage-products"
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    Manage Products
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => navigate("/admin/orders")}
                    data-testid="button-view-orders"
                  >
                    <ShoppingBag className="mr-2 h-4 w-4" />
                    View Orders
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => navigate("/admin/sellers")}
                    data-testid="button-manage-sellers"
                  >
                    <Users className="mr-2 h-4 w-4" />
                    Manage Sellers
                  </Button>
                  {showInternalRiderFeatures ? (
                    <Button 
                      variant="outline" 
                      className="w-full justify-start" 
                      onClick={() => navigate("/admin/riders")}
                      data-testid="button-manage-riders"
                    >
                      <Truck className="mr-2 h-4 w-4" />
                      Manage Riders
                    </Button>
                  ) : null}
                  {showInternalRiderFeatures ? (
                    <Button
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => navigate("/admin/zones")}
                      data-testid="button-manage-delivery-zones-admin"
                    >
                      <MapPin className="mr-2 h-4 w-4" />
                      {`Delivery Zones (${deliveryZones.length})`}
                    </Button>
                  ) : null}
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => navigate("/admin/pickup-stations")}
                    data-testid="button-manage-pickup-stations-admin"
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    {`Pickup Stations (${pickupStations.length})`}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Activity</CardTitle>
                  <CardDescription>Latest platform updates</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="text-sm">
                      <p className="font-medium">Total Orders</p>
                      <p className="text-muted-foreground">{orders.length} orders</p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">{showInternalRiderFeatures ? "Delivered Orders" : "Completed Orders"}</p>
                      <p className="text-muted-foreground">
                        {deliveredCount} {showInternalRiderFeatures ? "delivered" : "completed"}
                      </p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">Active Orders</p>
                      <p className="text-muted-foreground">
                        {processingCount} active
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>Recent Orders</CardTitle>
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/admin/orders")}
                  data-testid="button-view-all-orders"
                >
                  View All
                </Button>
              </CardHeader>
              <CardContent>
                {ordersLoading && recentOrders.length === 0 ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Loading recent orders...</span>
                    </div>
                    <AdminRecentOrdersSkeletonGrid />
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentOrders.map((order) => (
                      <Card key={order.id} className="hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(`/admin/orders/${order.id}/action`)}>
                        <CardContent className="pt-6">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs text-muted-foreground uppercase font-semibold">Order Number</p>
                              <p className="font-bold text-lg">#{order.orderNumber || order.id.slice(0, 8)}</p>
                            </div>
                            <div className="flex justify-between items-center">
                              <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Date</p>
                                <p className="text-sm">{new Date(order.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground uppercase font-semibold">Amount</p>
                                <p className="font-semibold text-green-600">{order.total ? formatPrice(parseFloat(order.total)) : 'N/A'}</p>
                              </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p>
                                <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                  normalizeOrderStatus(order.status) === 'delivered' ? 'bg-green-100 text-green-800' :
                                  ['processing', 'ready', 'confirmed', 'assigned', 'picked_up', 'en_route'].includes(normalizeOrderStatus(order.status)) ? 'bg-blue-100 text-blue-800' :
                                  normalizeOrderStatus(order.status) === 'cancelled' ? 'bg-red-100 text-red-800' :
                                  'bg-yellow-100 text-yellow-800'
                                }`}>
                                  {normalizeOrderStatus(order.status) === "en_route" ? "En Route" : (order.status || "unknown").replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())}
                                </span>
                              </div>
                              <div className="flex-1">
                                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Payment</p>
                                {(() => {
                                  const paymentStatusLabel = normalizePaymentStatus(order.paymentStatus);
                                  return (
                                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                                      paymentStatusLabel === 'paid' ? 'bg-green-100 text-green-800' :
                                      paymentStatusLabel === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                      'bg-red-100 text-red-800'
                                    }`}>
                                      {paymentStatusLabel ? paymentStatusLabel.charAt(0).toUpperCase() + paymentStatusLabel.slice(1) : 'N/A'}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-muted-foreground py-4">No orders yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </div>
  );
}
