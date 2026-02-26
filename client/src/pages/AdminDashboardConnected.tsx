import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import OrderCard from "@/components/OrderCard";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, ShoppingBag, Users, Truck, Loader2, AlertCircle, UserCog, Ticket, Wallet, CheckCircle, XCircle, ExternalLink, MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
  totalReceivedMoney?: number;
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

interface PendingPayout {
  id: string;
  riderId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
  notes?: string;
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
    } else if (path.includes("/admin/live-support")) {
      setActiveItem("live-support");
    } else if (path.includes("/admin/analytics")) {
      setActiveItem("analytics");
    } else if (path.includes("/admin/platform-earnings")) {
      setActiveItem("platform-earnings");
    } else if (path.includes("/admin/sellers-payouts")) {
      setActiveItem("sellers-payouts");
    } else if (path.includes("/admin/riders-payouts")) {
      setActiveItem("riders-payouts");
    } else if (path.includes("/admin/settings")) {
      setActiveItem("settings");
    } else if (path.includes("/admin/promotions")) {
      setActiveItem("promotions");
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
      id === "live-support" ? "/admin/live-support" :
      id === "analytics" ? "/admin/analytics" :
      id === "platform-earnings" ? "/admin/platform-earnings" :
      id === "sellers-payouts" ? "/admin/sellers-payouts" :
      id === "riders-payouts" ? "/admin/riders-payouts" :
      id === "settings" ? "/admin/settings" :
      id === "promotions" ? "/admin/promotions" :
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

  const { data: pendingApplicationsBadgeData } = useQuery<{ count: number; sellers: number; riders: number }>({
    queryKey: ["/api/dashboard/pending-applications-count"],
    queryFn: async () => {
      const [sellerRes, riderRes] = await Promise.all([
        fetch("/api/users?role=seller&isApproved=false&applicationStatus=pending", { credentials: "include" }),
        fetch("/api/users?role=rider&isApproved=false&applicationStatus=pending", { credentials: "include" }),
      ]);
      if (!sellerRes.ok || !riderRes.ok) return { count: 0, sellers: 0, riders: 0 };
      const [sellers, riders] = await Promise.all([sellerRes.json(), riderRes.json()]);
      const sellerCount = Array.isArray(sellers) ? sellers.length : 0;
      const riderCount = Array.isArray(riders) ? riders.length : 0;
      return { count: sellerCount + riderCount, sellers: sellerCount, riders: riderCount };
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: pendingAssignmentsBadgeData } = useQuery<{ count: number }>({
    queryKey: ["/api/dashboard/pending-assignments-count"],
    queryFn: async () => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      const data = await res.json();
      if (!Array.isArray(data)) return { count: 0 };
      const actionableStatuses = new Set(["pending", "confirmed", "processing", "ready", "searching_rider"]);
      const count = data.filter((order: any) => {
        const deliveryMethod = String(order?.deliveryMethod || "").toLowerCase().trim();
        const status = String(order?.status || "").toLowerCase().trim();
        const riderId = order?.riderId || null;
        return deliveryMethod !== "pickup" && !riderId && actionableStatuses.has(status);
      }).length;
      return { count };
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch pending rider payouts (super_admin only)
  const { data: pendingPayouts = [], isLoading: payoutsLoading } = useQuery<PendingPayout[]>({
    queryKey: ["/api/admin/rider-payouts/pending"],
    enabled: isAuthenticated && user?.role === "super_admin",
    refetchInterval: 15000,
  });

  // Fetch riders for name lookup
  const { data: riders = [] } = useQuery<User[]>({
    queryKey: ["/api/users", "rider"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=rider");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && user?.role === "super_admin",
  });

  // Approve payout mutation
  const approveMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      const res = await fetch(`/api/admin/rider-payouts/${payoutId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to approve payout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-payouts/pending"] });
      toast({ title: "Payout Approved", description: "Rider has been notified" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve payout", variant: "destructive" });
    }
  });

  // Reject payout mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ payoutId, reason }: { payoutId: string; reason: string }) => {
      const res = await fetch(`/api/admin/rider-payouts/${payoutId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      if (!res.ok) throw new Error("Failed to reject payout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-payouts/pending"] });
      toast({ title: "Payout Rejected", description: "Rider has been notified" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject payout", variant: "destructive" });
    }
  });

  const riderMap = new Map(Array.isArray(riders) ? riders.map(r => [r.id, r]) : []);
  const normalizePaymentStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid" || s === "success") return "paid";
    return s || "pending";
  };
  const isPaidPaymentStatus = (value?: string) => normalizePaymentStatus(value) === "paid";

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

  const deliveredCount = orders.filter(o => normalizeOrderStatus(o.status) === "delivered").length;
  const pendingApplicationsCount = pendingApplicationsBadgeData?.count || 0;
  const pendingAssignmentsCount = pendingAssignmentsBadgeData?.count || 0;
  const paidMoneyFromOrders = orders
    .filter((o) => isPaidPaymentStatus((o as any).paymentStatus))
    .reduce((sum, o) => sum + Number.parseFloat((o as any).total || "0"), 0);
  const totalReceivedMoney = typeof analytics?.totalReceivedMoney === "number"
    ? analytics.totalReceivedMoney
    : paidMoneyFromOrders;

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
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5 gap-6">
                  <MetricCard
                    title="Total Revenue"
                    value={formatPrice(analytics.totalRevenue || 0)}
                    icon={DollarSign}
                    change={12.5}
                  />
                  <MetricCard
                    title="Total Received Money"
                    value={formatPrice(totalReceivedMoney || 0)}
                    icon={Wallet}
                    change={9.4}
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

            {/* Pending Payouts Widget - Super Admin Only, only show when there are pending payouts */}
            {user.role === "super_admin" && pendingPayouts.length > 0 && (
              <Card className="border-orange-200 dark:border-orange-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-orange-500" />
                    <CardTitle>Pending Rider Payouts</CardTitle>
                    <Badge variant="destructive" className="ml-2">{pendingPayouts.length}</Badge>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate("/admin/riders-payouts")}
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent>
                  {payoutsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-3">
                        {pendingPayouts.slice(0, 5).map((payout) => {
                          const rider = riderMap.get(payout.riderId);
                          return (
                            <div key={payout.id} className="p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                      📦 Action Required
                                    </Badge>
                                  </div>
                                  <p className="font-medium mt-1 text-sm">
                                    Order #{payout.notes?.match(/#?(\w+)/)?.[1] || payout.orderId?.slice(0, 8)}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Rider: {rider?.name || "Unknown"}
                                  </p>
                                  <p className="text-lg font-bold text-green-600 mt-1">
                                    {payout.currency} {parseFloat(payout.amount).toFixed(2)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Status: Delivered & Verified
                                  </p>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => approveMutation.mutate(payout.id)}
                                    disabled={approveMutation.isPending}
                                  >
                                    {approveMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => rejectMutation.mutate({ payoutId: payout.id, reason: "Payment issue" })}
                                    disabled={rejectMutation.isPending}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                              <div className="flex gap-2 mt-2 pt-2 border-t">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-xs h-7"
                                  onClick={() => navigate(`/admin/orders?orderId=${payout.orderId}`)}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View Order
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-xs h-7"
                                  onClick={() => navigate(`/admin/messages?userId=${payout.riderId}`)}
                                >
                                  <MessageCircle className="h-3 w-3 mr-1" />
                                  Chat
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        {pendingPayouts.length > 5 && (
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => navigate("/admin/riders-payouts")}
                          >
                            View {pendingPayouts.length - 5} more pending payouts
                          </Button>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
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
                    {pendingApplicationsCount > 0 && (
                      <Badge variant="destructive" className="ml-1">{pendingApplicationsCount > 99 ? "99+" : pendingApplicationsCount}</Badge>
                    )}
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
                        <p className="text-xs text-muted-foreground mt-1">
                          Sellers: {pendingApplicationsBadgeData?.sellers || 0} | Riders: {pendingApplicationsBadgeData?.riders || 0}
                        </p>
                      </div>
                      <Badge variant={pendingApplicationsCount > 0 ? "destructive" : "secondary"}>
                        {pendingApplicationsCount}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Rider Assignment Queue
                    {pendingAssignmentsCount > 0 && (
                      <Badge variant="destructive" className="ml-1">{pendingAssignmentsCount > 99 ? "99+" : pendingAssignmentsCount}</Badge>
                    )}
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/manual-rider-assignment")}
                    data-testid="button-view-rider-queue"
                  >
                    Open Queue
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Pending Rider Assignment</p>
                        <p className="text-sm text-muted-foreground">
                          Orders waiting for a rider assignment
                        </p>
                      </div>
                      <Badge variant={pendingAssignmentsCount > 0 ? "destructive" : "secondary"}>
                        {pendingAssignmentsCount}
                      </Badge>
                    </div>
                    <Button variant="outline" onClick={() => navigate("/admin/riders")} data-testid="button-view-riders">
                      Manage Riders
                    </Button>
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
  const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();
