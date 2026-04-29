import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Package, Loader2, ShoppingBag, Receipt, CheckCircle2, Activity, Gift, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  paymentStatus?: string;
  createdAt: string;
  deliveryMethod?: string;
  externalDeliveryType?: string | null;
  externalDeliveryByBus?: boolean | null;
}

export default function BuyerDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled, referralEnabled } = usePlatformSettings();
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
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    staleTime: 12_000,
  });

  const { data: referralStats } = useQuery<{ referralCode: string; completed: number; signedUp: number; threshold: number } | null>({
    queryKey: ["/api/referral/stats"],
    queryFn: () => fetch("/api/referral/stats", { credentials: "include" }).then(r => r.ok ? r.json() : null).catch(() => null),
    enabled: isAuthenticated && user?.role === "buyer" && referralEnabled,
    staleTime: 60_000,
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
  const getBuyerOrderStage = (order: Order) => {
    const status = normalize(order.status) || "pending";
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const isPickup = ["pickup", "store_pickup", "store pickup"].includes(normalize(order.deliveryMethod));
    const isExternalManualFlow = usesExternalDeliveryFlow(order);

    if (
      paymentStatus !== "paid" &&
      !["completed", "delivered", "cancelled", "refunded", "disputed"].includes(status)
    ) {
      return "pending";
    }

    if ((status === "pending" || status === "created") && (paymentStatus === "paid" || paymentStatus === "processing")) {
      return "processing";
    }

    if (isPickup && status === "packaged") {
      return "processing";
    }

    if (status === "completed") {
      return "completed";
    }

    if (status === "delivered") {
      return "processing";
    }

    if (["cancelled", "disputed"].includes(status)) {
      return status;
    }

    if (
      [
        "confirmed",
        "ready",
        "processing",
        "packaged",
        "assigned",
        "searching_rider",
        "rider_arrived",
        "external_dispatch_arranged",
      ].includes(status)
    ) {
      return "processing";
    }

    if (["picked_up", "in_transit", "en_route", "out_for_delivery", "delivering"].includes(status)) {
      return isExternalManualFlow || isPickup ? "processing" : "en_route";
    }

    return "pending";
  };
  const usesExternalDeliveryFlow = (order: Order) =>
    isExternalRiderSystemEnabled &&
    !["pickup", "store_pickup", "store pickup"].includes(normalize(order.deliveryMethod));

  const getDashboardOrderAction = (order: Order) => {
    const status = normalize(order.status);
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const isPickup = ["pickup", "store_pickup", "store pickup"].includes(normalize(order.deliveryMethod));
    const useExternalViewFlow = usesExternalDeliveryFlow(order);
    const stage = getBuyerOrderStage(order);
    const canResumePayment =
      ["pending", "created", "unpaid"].includes(status) &&
      ["pending", "failed", "processing"].includes(paymentStatus);

    if (canResumePayment) {
      return {
        label: "Continue Payment",
        path: `/payment/${encodeURIComponent(order.id)}`,
        variant: "outline" as const,
      };
    }

    if (stage === "completed") {
      return {
        label: "Track Order",
        path: `/track/${encodeURIComponent(order.id)}`,
        variant: "outline" as const,
      };
    }

    if (stage !== "pending" || paymentStatus === "paid" || paymentStatus === "processing") {
      return {
        label: isPickup || useExternalViewFlow ? "View Order" : "Track Order",
        path: isPickup || useExternalViewFlow
          ? `/orders/${encodeURIComponent(order.id)}`
          : `/track/${encodeURIComponent(order.id)}`,
        variant: "outline" as const,
      };
    }

    return {
      label: "View Order",
      path: `/orders/${encodeURIComponent(order.id)}`,
      variant: "outline" as const,
    };
  };

  const stats = {
    activeOrders: orders.filter((o) => !["completed", "cancelled", "disputed"].includes(getBuyerOrderStage(o))).length,
    processingOrders: orders.filter((o) => getBuyerOrderStage(o) === "processing").length,
    completedOrders: orders.filter((o) => getBuyerOrderStage(o) === "completed").length,
  };

  const openOrders = stats.activeOrders;
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
  const buyerButtonClass = "!hover:bg-muted !hover:text-foreground";

  return (
    <DashboardLayout role="buyer">
      <div className="p-6 space-y-6">
        {/* Welcome Card */}
        <Card className="relative overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(90deg,rgba(6,78,59,0.42)_0%,rgba(2,6,23,0.98)_48%,rgba(8,47,73,0.48)_100%)] dark:text-white dark:shadow-[0_0_0_1px_rgba(20,184,166,0.08)]">
          <div className="pointer-events-none absolute inset-0 hidden dark:block dark:bg-[radial-gradient(circle_at_18%_50%,rgba(16,185,129,0.14),transparent_40%),radial-gradient(circle_at_85%_50%,rgba(6,182,212,0.14),transparent_42%)]" />
          <CardContent className="relative p-4 md:p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-sm dark:text-white/80">Welcome back</p>
                <h1 className="text-xl md:text-2xl font-bold mt-1">
                  {user?.name ? `${user.name.split(" ")[0]}'s Dashboard` : "Buyer Dashboard"}
                </h1>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Badge className="border-border bg-muted text-foreground hover:bg-muted text-xs dark:bg-white/20 dark:text-white dark:border-white/30 dark:hover:bg-white/20">
                    {stats.activeOrders} active order{stats.activeOrders === 1 ? "" : "s"}
                  </Badge>
                  <Badge className="border-border bg-muted text-foreground hover:bg-muted text-xs dark:bg-white/20 dark:text-white dark:border-white/30 dark:hover:bg-white/20">
                    {stats.completedOrders} completed
                  </Badge>
                </div>
              </div>
              {referralStats && (
                <button
                  onClick={() => navigate("/referral")}
                  className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3 hover:bg-muted/60 transition-colors dark:border-white/20 dark:bg-white/10 dark:hover:bg-white/15 text-left shrink-0"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 dark:bg-white/20">
                    <Gift className="h-5 w-5 text-primary dark:text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground dark:text-white/70 font-medium">Referrals</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-lg font-bold dark:text-white">{referralStats.completed}</span>
                      <span className="text-xs text-muted-foreground dark:text-white/60">/ {referralStats.threshold}</span>
                      <Users className="h-3.5 w-3.5 text-muted-foreground dark:text-white/50 ml-1" />
                    </div>
                  </div>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 3 Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card data-testid="card-active-orders" className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Active Orders</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.activeOrders}</div>
              <p className="text-xs text-muted-foreground mt-1">Orders currently in progress</p>
            </CardContent>
          </Card>

          <Card data-testid="card-processing-orders" className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Processing</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.processingOrders}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {showInternalRiderFeatures
                  ? "Being prepared or dispatched"
                  : "Being prepared or coordinated"}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-orders" className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedOrders}</div>
              <p className="text-xs text-muted-foreground mt-1">Successfully received</p>
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
              const displayStatus = (s === "pending" && (isPaid || isProcessingPayment)) ? "processing" : getBuyerOrderStage(order);
              const action = getDashboardOrderAction(order);
              const fulfillmentLabel =
                normalize(order.deliveryMethod) === "pickup"
                  ? "Pickup"
                  : usesExternalDeliveryFlow(order)
                    ? String(order.externalDeliveryType || "").toLowerCase().trim() === "bus" || order.externalDeliveryByBus
                      ? "VIP Bus Delivery"
                      : "Third-Party Delivery"
                    : "Rider Delivery";

              return (
                <Card
                  key={order.id}
                  className="border shadow-sm hover:shadow-md transition-shadow flex flex-col cursor-pointer"
                  data-testid={`order-${order.id}`}
                  onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)}
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
                        {(showInternalRiderFeatures || normalize(order.deliveryMethod) === "pickup") && (
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Fulfillment</span>
                            <span className="font-medium">{fulfillmentLabel}</span>
                          </div>
                        )}
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
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(action.path);
                        }}
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
