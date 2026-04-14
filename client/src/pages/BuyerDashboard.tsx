import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Package, MapPin, Loader2, ShoppingBag, Wallet, TrendingUp, Receipt } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

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
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "buyer")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", "buyer-dashboard", user?.id],
    queryFn: async () => fetchApiJson<Order[]>("/api/orders?context=buyer&includeItems=false"),
    enabled: isAuthenticated && user?.role === "buyer",
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  if (authLoading || !isAuthenticated || user?.role !== "buyer") {
    return <PageLoadingState title="Loading buyer dashboard" description="Preparing your orders, spend overview, and delivery updates." />;
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
    completedOrders: orders.filter(o => {
      const s = normalize(o.status);
      return s === "delivered" || s === "completed";
    }).length,
    totalSpend: orders.reduce((sum, o) => sum + (Number(o.total) || 0), 0),
    pendingPayments: orders.filter((o) => {
      const paymentStatus = normalizePaymentStatus(o.paymentStatus);
      return paymentStatus === "pending" || paymentStatus === "failed" || paymentStatus === "processing";
    }).length,
  };

  const trackStatuses = new Set([
    "processing",
    "packaged",
    "ready",
    "picked_up",
    "in_transit",
    "en_route",
    "arrived",
    "external_dispatch_arranged",
    ...(showInternalRiderFeatures ? ["searching_rider", "assigned", "rider_arrived"] : []),
  ]);
  const activeDeliveries = orders.filter((o) => trackStatuses.has(normalize(o.status))).length;
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const monthlySpend = Array.from(
    orders.reduce((map, order) => {
      const d = new Date(order.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      map.set(key, (map.get(key) || 0) + (Number(order.total) || 0));
      return map;
    }, new Map<string, number>())
  )
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([month, spend]) => ({ month: month.slice(5), spend }));
  const deliverySuccessRate = stats.totalOrders
    ? (stats.completedOrders / stats.totalOrders) * 100
    : 0;
  const buyerButtonClass = "!hover:bg-muted !hover:text-foreground";

  return (
    <DashboardLayout role="buyer">
      <div className="p-6 space-y-6">
        <Card className="relative overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(90deg,rgba(6,78,59,0.42)_0%,rgba(2,6,23,0.98)_48%,rgba(8,47,73,0.48)_100%)] dark:text-white dark:shadow-[0_0_0_1px_rgba(20,184,166,0.08)]">
          <div className="pointer-events-none absolute inset-0 hidden dark:block dark:bg-[radial-gradient(circle_at_18%_50%,rgba(16,185,129,0.14),transparent_40%),radial-gradient(circle_at_85%_50%,rgba(6,182,212,0.14),transparent_42%)]" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-sm dark:text-white/80">Welcome back</p>
                <h1 className="text-xl md:text-2xl font-bold mt-1">
                  {user?.name ? `${user.name.split(" ")[0]}'s Buyer Dashboard` : "Buyer Dashboard"}
                </h1>
                <p className="text-sm text-muted-foreground mt-1 max-w-xl dark:text-white/90">
                  See your recent orders, payments, and delivery updates in one place.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className="border-border bg-muted text-foreground hover:bg-muted text-xs dark:bg-white/20 dark:text-white dark:border-white/30 dark:hover:bg-white/20">
                    {activeDeliveries} active delivery{activeDeliveries === 1 ? "" : "ies"}
                  </Badge>
                  <Badge className="border-border bg-muted text-foreground hover:bg-muted text-xs dark:bg-white/20 dark:text-white dark:border-white/30 dark:hover:bg-white/20">
                    {stats.pendingPayments} payment pending
                  </Badge>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="border-border text-foreground hover:bg-muted hover:text-foreground dark:border-white/50 dark:text-white dark:hover:bg-white/15 dark:hover:text-white"
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
              <p className="text-xs text-muted-foreground">All your orders so far</p>
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
              <p className="text-xs text-muted-foreground">Orders still in progress</p>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-orders" className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedOrders}</div>
              <p className="text-xs text-muted-foreground">Orders you have received</p>
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
                {stats.pendingPayments} order(s) still need payment
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Spending Overview</CardTitle>
              <p className="text-sm text-muted-foreground">Your spending over the last 6 months</p>
            </CardHeader>
            <CardContent>
              <ChartContainer config={{ spend: { label: "Spend", color: "#10b981" } }} className="h-[220px] w-full">
                <AreaChart data={monthlySpend}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area dataKey="spend" stroke="var(--color-spend)" fill="var(--color-spend)" fillOpacity={0.2} />
                </AreaChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Delivery Success Rate</CardTitle>
              <p className="text-sm text-muted-foreground">How many of your orders were completed</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-3xl font-semibold">{deliverySuccessRate.toFixed(1)}%</div>
              <div className="h-2 rounded-full bg-muted">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, deliverySuccessRate)}%` }} />
              </div>
              <p className="text-sm text-muted-foreground">
                {stats.completedOrders} completed out of {stats.totalOrders} total orders
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Recent Orders</h2>
            <p className="text-sm text-muted-foreground">Your latest orders</p>
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
              const isProcessingPayment = paymentStatus === "processing";
              const isUnpaid = paymentStatus === "pending" || paymentStatus === "failed";
              const canResumePayment =
                ["pending", "created", "unpaid"].includes(s) &&
                (isUnpaid || isProcessingPayment);
              const shouldTrack = trackStatuses.has(s) || isPaid || isProcessingPayment;
              const displayStatus = (s === "pending" && (isPaid || isProcessingPayment)) ? "processing" : order.status;

              const action = canResumePayment
                ? { label: "Continue Payment", path: `/payment/${order.id}`, variant: "outline" as const }
                : shouldTrack
                  ? { label: "Track Order", path: `/track/${encodeURIComponent(order.id)}`, variant: "outline" as const }
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
                          {displayStatus}
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

                      {canResumePayment && (
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
