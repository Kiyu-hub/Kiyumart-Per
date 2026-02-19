import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Package, MapPin, Loader2, ShoppingBag, Wallet, Clock3, TrendingUp } from "lucide-react";
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
      const status = normalize(o.status);
      return status === "pending" || paymentStatus === "pending" || paymentStatus === "failed";
    }).length,
  };

  const trackStatuses = new Set(["processing", "delivering", "en_route", "picked_up", "assigned"]);
  const buyerButtonClass = "!hover:bg-muted !hover:text-foreground";

  return (
    <DashboardLayout role="buyer">
      <div className="p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Buyer Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage orders, payments, and delivery progress from one place.
            </p>
          </div>
          <div className="inline-flex items-center rounded-lg border p-1 bg-card">
            <Button size="sm" variant="default" disabled data-testid="button-mode-dashboard">
              Dashboard Mode
            </Button>
            <Button size="sm" variant="ghost" className={buyerButtonClass} onClick={() => navigate("/")} data-testid="button-mode-shop">
              Shop Mode
            </Button>
          </div>
        </div>

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

        <Card>
          <CardContent className="pt-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-2 text-sm">
              <Clock3 className="h-4 w-4 text-muted-foreground" />
              <span>Payment Priority</span>
              <Badge variant={stats.pendingPayments > 0 ? "destructive" : "secondary"}>
                {stats.pendingPayments > 0 ? `${stats.pendingPayments} pending` : "No pending payments"}
              </Badge>
            </div>
            {stats.pendingPayments > 0 ? (
              <Button size="sm" variant="outline" className={buyerButtonClass} onClick={() => navigate("/orders")} data-testid="button-resume-pending-payments">
                Continue Pending Payment
              </Button>
            ) : (
              <Button size="sm" variant="outline" className={buyerButtonClass} onClick={() => navigate("/orders")} data-testid="button-view-all-orders">
                View All Orders
              </Button>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.slice(0, 6).map((order) => {
                  const s = normalize(order.status);
                  const paymentStatus = normalizePaymentStatus(order.paymentStatus);
                  const isUnpaid = paymentStatus === "pending" || paymentStatus === "failed";
                  const requiresPaymentAction = s === "pending" || isUnpaid;

                  const handleClick = () => {
                    if (s === "pending") {
                      navigate(`/payment/${order.id}`);
                      return;
                    }
                    if (paymentStatus === "processing") {
                      navigate(`/track?orderId=${order.id}`);
                      return;
                    }
                    if (isUnpaid) {
                      navigate(`/payment/${order.id}`);
                    } else if (trackStatuses.has(s)) {
                      navigate(`/track?orderId=${order.id}`);
                    } else {
                      navigate(`/track?orderId=${order.id}`);
                    }
                  };

                  return (
                    <div 
                      key={order.id} 
                      className="p-4 border rounded-lg hover:bg-muted/40 cursor-pointer transition-colors flex flex-col"
                      onClick={handleClick}
                      data-testid={`order-${order.id}`}
                    >
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
                          <p className="text-xs text-destructive font-medium">Payment required</p>
                        )}
                      </div>

                      <div className="mt-3">
                        {requiresPaymentAction ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className={buyerButtonClass}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/payment/${order.id}`);
                            }}
                          >
                            Continue Payment
                          </Button>
                        ) : trackStatuses.has(s) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className={buyerButtonClass}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/track?orderId=${order.id}`);
                            }}
                          >
                            Track Order
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className={buyerButtonClass}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/track?orderId=${order.id}`);
                            }}
                          >
                            View
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground">Switch to Shop Mode above to start placing orders.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
