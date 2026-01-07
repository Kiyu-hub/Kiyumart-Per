import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";
import RealTimeRiderMap from "@/components/RealTimeRiderMap";
import { DollarSign, ShoppingBag, Users, Truck, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";

interface Analytics {
  totalRevenue?: number;
  totalOrders?: number;
  totalUsers?: number;
  totalProducts?: number;
}

interface Order {
  id: string;
  status: string;
  createdAt: string;
}

export default function AdminDashboard() {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const [activeItem, setActiveItem] = useState("dashboard");

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
    } else if (path.includes("/admin/zones")) {
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
      id === "my-cart" ? "/cart" :
      id === "my-purchases" ? "/orders" :
      id === "my-wishlist" ? "/wishlist" :
      id === "notifications" ? "/admin/notifications" :
      id === "messages" ? "/admin/messages" :
      id === "analytics" ? "/admin/analytics" :
      "/admin"
    );
  };

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: isAuthenticated && user?.role === "admin",
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated && user?.role === "admin",
  });

  if (authLoading || !isAuthenticated || user?.role !== "admin") {
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

  const deliveredCount = orders.filter(o => o.status === "delivered").length;

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role="admin"
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user.name}
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
            {analyticsLoading ? (
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
            )}

            {/* Real-Time Rider Tracking Map */}
            <RealTimeRiderMap />

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
                  <Button 
                    variant="outline" 
                    className="w-full justify-start" 
                    onClick={() => navigate("/admin/riders")}
                    data-testid="button-manage-riders"
                  >
                    <Truck className="mr-2 h-4 w-4" />
                    Manage Riders
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
                      <p className="font-medium">Delivered Orders</p>
                      <p className="text-muted-foreground">{deliveredCount} delivered</p>
                    </div>
                    <div className="text-sm">
                      <p className="font-medium">Processing Orders</p>
                      <p className="text-muted-foreground">
                        {orders.filter(o => o.status === "processing").length} processing
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
                {ordersLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="space-y-2">
                    {recentOrders.map((order, index) => (
                      <div key={order.id} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium text-sm">Order #{index + 1}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(order.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-sm capitalize">{order.status}</div>
                      </div>
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
