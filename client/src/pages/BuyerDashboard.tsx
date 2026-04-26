import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Package, MapPin, Loader2, ShoppingBag, Receipt, Heart, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import ReferralTracker from "@/components/ReferralTracker";

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
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchOnMount: "always",
    staleTime: 12_000,
  });

  const { data: wishlistItems = [] } = useQuery<Array<{ id: string; name: string; price: string; images: string[] }>>({
    queryKey: ["/api/wishlist", "buyer-dashboard"],
    queryFn: async () => fetchApiJson<any[]>("/api/wishlist"),
    enabled: isAuthenticated && user?.role === "buyer",
    staleTime: 30000,
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

  const totalSpent = orders
    .filter((o) => normalizePaymentStatus(o.paymentStatus) === "paid")
    .reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  const stats = {
    totalOrders: orders.length,
    pendingOrders: orders.filter((o) => getBuyerOrderStage(o) === "pending").length,
    completedOrders: orders.filter((o) => getBuyerOrderStage(o) === "completed").length,
    cancelledOrders: orders.filter((o) => ["cancelled", "disputed"].includes(getBuyerOrderStage(o))).length,
    pendingPayments: orders.filter((o) => {
      const paymentStatus = normalizePaymentStatus(o.paymentStatus);
      return paymentStatus === "pending" || paymentStatus === "failed" || paymentStatus === "processing";
    }).length,
  };

  const openOrders = orders.filter((o) => ["pending", "processing"].includes(getBuyerOrderStage(o))).length;
  const recentOrders = [...orders]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);
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
                   See your recent orders, payments, and fulfillment updates in one place.
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Badge className="border-border bg-muted text-foreground hover:bg-muted text-xs dark:bg-white/20 dark:text-white dark:border-white/30 dark:hover:bg-white/20">
                    {openOrders} pending deliver{openOrders === 1 ? "y" : "ies"}
                    </Badge>
                  <Badge className="border-border bg-muted text-foreground hover:bg-muted text-xs dark:bg-white/20 dark:text-white dark:border-white/30 dark:hover:bg-white/20">
                    {stats.pendingPayments} payment pending
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Collapsible dashboard metrics explainer */}
        <Card className="border-border/60 bg-card/95">
          <details>
            <summary className="cursor-pointer list-none px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Dashboard Metrics Explained</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Expand to understand what each number on your buyer dashboard means</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
              </div>
            </summary>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-sm">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Total Orders</p>
                  <p className="text-muted-foreground text-xs">All orders you have ever placed on the platform, across all statuses including pending, delivered, and cancelled.</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Pending Delivery</p>
                  <p className="text-muted-foreground text-xs">Orders that have been paid for and are currently being prepared, dispatched, or are in transit to you.</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Completed Orders</p>
                  <p className="text-muted-foreground text-xs">Orders you have fully received — either collected from a pickup station or delivered to your address.</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Payment Pending</p>
                  <p className="text-muted-foreground text-xs">Orders where payment has not yet been confirmed. These orders are on hold until payment is completed.</p>
                </div>
              </div>
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <p className="font-medium mb-1">Wishlist</p>
                <p className="text-muted-foreground text-xs">Items you have saved for later. Click an item to view the product and add it to your cart when you're ready to buy.</p>
              </div>
              <div className="mt-3 rounded-lg border border-dashed border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                <strong>About payment &amp; processing fees:</strong> A 1.95% processing fee is added at checkout to cover payment gateway costs. This fee is a one-time charge — if you pay by mobile money, <strong>no additional mobile money charges</strong> will be deducted from your wallet beyond the amount shown at checkout. Your payment is processed securely and automatically by Paystack, with no manual approval required.
              </div>
            </CardContent>
          </details>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Card data-testid="card-total-orders" className="border-l-4 border-l-primary">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                <span>Active: {openOrders}</span>
                <span>Completed: {stats.completedOrders}</span>
                {stats.cancelledOrders > 0 && <span>Cancelled: {stats.cancelledOrders}</span>}
                {stats.pendingPayments > 0 && <span>Unpaid: {stats.pendingPayments}</span>}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-orders" className="border-l-4 border-l-orange-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Delivery</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {openOrders}
              </div>
              <p className="text-xs text-muted-foreground">
                {showInternalRiderFeatures
                  ? "Orders being prepared, dispatched, or delivered"
                  : "Orders being prepared or coordinated for delivery and pickup"}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-orders" className="border-l-4 border-l-green-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedOrders}</div>
              <p className="text-xs text-muted-foreground">Orders you have received</p>
            </CardContent>
          </Card>

          <Card data-testid="card-wishlist" className="border-l-4 border-l-pink-500">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Wishlist</CardTitle>
              <Heart className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{(wishlistItems as any[]).length}</div>
              <p className="text-xs text-muted-foreground">
                <button className="underline hover:text-foreground" onClick={() => navigate("/wishlist")}>View saved items</button>
              </p>
            </CardContent>
          </Card>

        </div>

        {/* Wishlist preview */}
        {(wishlistItems as any[]).length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Saved to Wishlist</h2>
              <Button size="sm" variant="outline" onClick={() => navigate("/wishlist")}>
                <Heart className="h-4 w-4 mr-2" />
                View All
              </Button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {(wishlistItems as any[]).slice(0, 6).map((item: any) => (
                <Card
                  key={item.id}
                  className="shrink-0 w-36 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => navigate(`/product/${item.id}`)}
                >
                  <CardContent className="p-3">
                    {item.images?.[0] ? (
                      <img src={item.images[0]} alt={item.name} className="w-full h-24 object-cover rounded-md mb-2" />
                    ) : (
                      <div className="w-full h-24 rounded-md bg-muted flex items-center justify-center mb-2">
                        <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <p className="text-xs font-medium truncate">{item.name}</p>
                    <p className="text-xs text-primary font-semibold">{formatPrice(Number(item.price) || 0)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        <ReferralTracker />

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
                        <div className="flex justify-between gap-2">
                          <span className="text-muted-foreground">Fulfillment</span>
                          <span className="font-medium">{fulfillmentLabel}</span>
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
