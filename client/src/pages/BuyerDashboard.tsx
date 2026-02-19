import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Package, MapPin, Loader2, ShoppingBag, Wallet, TrendingUp, ArrowRight, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  paymentStatus?: string;
  createdAt: string;
}

export default function BuyerDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "buyer")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated && user?.role === "buyer",
  });

  if (authLoading || !isAuthenticated || user?.role !== "buyer") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-buyer" />
      </div>
    );
  }

  const normalize = (s?: string) => (s || "").toLowerCase().trim();
  const normalizePaymentStatus = (value?: string) => {
    const s = normalize(value);
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid") return "paid";
    return s || "pending";
  };

  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter(o => normalize(o.status) === "pending").length,
    completedOrders: orders.filter(o => normalize(o.status) === "delivered").length,
    totalSpend: orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    pendingPayments: orders.filter((o) => {
      const paymentStatus = normalizePaymentStatus(o.paymentStatus);
      const isPaid = paymentStatus === "paid";
      const status = normalize(o.status);
      return !isPaid && (status === "pending" || paymentStatus === "pending" || paymentStatus === "failed");
    }).length,
  };

  const trackStatuses = new Set(["processing", "delivering", "en_route", "picked_up", "assigned"]);
  const activeDeliveries = orders.filter((o) => trackStatuses.has(normalize(o.status))).length;
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const buyerButtonClass = "!hover:bg-muted !hover:text-foreground";

  return (
    <DashboardLayout role="buyer">
      <div className="p-6 space-y-6">
        <Card className="overflow-hidden border-0 bg-gradient-to-r from-emerald-600 via-emerald-500 to-cyan-500 text-white">
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
              <div>
                <p className="text-white/80 text-sm">Welcome back</p>
                <p className="text-xs font-semibold uppercase tracking-wide text-white/90">New Buyer Workspace</p>
                <h1 className="text-2xl md:text-3xl font-bold mt-1">
                  {user?.name ? `${user.name.split(" ")[0]}'s Buyer Dashboard` : "Buyer Dashboard"}
                </h1>
                <p className="text-sm text-white/90 mt-2 max-w-xl">
                  Track deliveries, resolve pending payments, and manage recent orders from one clean workspace.
                </p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                    {activeDeliveries} active delivery{activeDeliveries === 1 ? "" : "ies"}
                  </Badge>
                  <Badge className="bg-white/20 text-white border-white/30 hover:bg-white/20">
                    {stats.pendingPayments} payment pending
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="bg-white text-emerald-700 hover:bg-white/90 hover:text-emerald-700"
                  onClick={() => navigate(stats.pendingPayments > 0 ? "/orders" : "/orders")}
                  data-testid="button-primary-dashboard-action"
                >
                  {stats.pendingPayments > 0 ? "Continue Payment" : "View Orders"}
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/50 text-white hover:bg-white/15 hover:text-white"
                  onClick={() => navigate("/")}
                  data-testid="button-go-shop"
                >
                  Go to Shop
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card data-testid="card-total-orders" className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">Lifetime purchases</p>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-orders" className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Open Deliveries</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders.filter((o) => trackStatuses.has(normalize(o.status)) || normalize(o.status) === "pending").length}
              </div>
              <p className="text-xs text-muted-foreground">Pending + in transit</p>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-orders" className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedOrders}</div>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </CardContent>
          </Card>

          <Card data-testid="card-total-spend" className="border-l-4 border-l-blue-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Spend</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(stats.totalSpend)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.pendingPayments} order(s) need payment
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent Orders</h2>
            <p className="text-sm text-muted-foreground">Latest activity from your purchase history</p>
          </div>
          <Button size="sm" variant="outline" className={buyerButtonClass} onClick={() => navigate("/orders")} data-testid="button-view-orders-list">
            <Receipt className="h-4 w-4 mr-2" />
            View All Orders
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentOrders.map((order) => {
              const s = normalize(order.status);
              const paymentStatus = normalizePaymentStatus(order.paymentStatus);
              const isPaid = paymentStatus === "paid";
              const isUnpaid = paymentStatus === "pending" || paymentStatus === "failed";
              const requiresPaymentAction = !isPaid && (s === "pending" || isUnpaid);

              const action = requiresPaymentAction
                ? { label: "Continue Payment", path: `/payment/${order.id}`, variant: "outline" as const }
                : (trackStatuses.has(s) || paymentStatus === "paid" || paymentStatus === "processing")
                  ? { label: "Track Order", path: `/track?orderId=${order.id}`, variant: "outline" as const }
                  : { label: "View Order", path: "/orders", variant: "ghost" as const };

              return (
                <Card
                  key={order.id}
                  className="border shadow-sm hover:shadow-md transition-shadow flex flex-col"
                  data-testid={`order-${order.id}`}
                >
                  <CardContent className="p-4 flex-1 flex flex-col">
                    <div className="mb-3">
                      <p className="font-semibold text-sm">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>

                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="capitalize">
                          {order.status}
                        </Badge>
                        <Badge variant={paymentStatus === "paid" ? "default" : "outline"}>
                          {paymentStatus}
                        </Badge>
                      </div>

                      <div className="text-xs space-y-1">
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-semibold">{formatPrice(Number(order.total) || 0)}</span>
                        </div>
                      </div>

                      {requiresPaymentAction && (
                        <p className="text-xs text-amber-700 dark:text-amber-400 font-medium">Payment required</p>
                      )}
                    </div>

                    <div className="mt-4">
                      <Button
                        size="sm"
                        variant={action.variant}
                        className={buyerButtonClass}
                        onClick={() => navigate(action.path)}
                      >
                        {action.label}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground">Go to Shop to place your first order.</p>
              <Button className="mt-4" onClick={() => navigate("/")} data-testid="button-empty-go-shop">
                Start Shopping
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
