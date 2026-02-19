import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Package, Heart, MapPin, CreditCard, User, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ThemeToggle from "@/components/ThemeToggle";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  status: string;
  createdAt: string;
}

export default function BuyerDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

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
  };

  return (
    <DashboardLayout role="buyer">
      <div className="p-6">
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card data-testid="card-total-orders">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalOrders}</div>
              <p className="text-xs text-muted-foreground">All time</p>
            </CardContent>
          </Card>

          <Card data-testid="card-pending-orders">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingOrders}</div>
              <p className="text-xs text-muted-foreground">In progress</p>
            </CardContent>
          </Card>

          <Card data-testid="card-completed-orders">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.completedOrders}</div>
              <p className="text-xs text-muted-foreground">Delivered</p>
            </CardContent>
          </Card>
        </div>

        {isLoading ? (
          <div className="mt-8 flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders.length > 0 ? (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Recent Orders</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {orders.slice(0, 6).map((order) => {
                  const s = normalize(order.status);
                  const paymentStatus = normalizePaymentStatus((order as any).paymentStatus);
                  const isUnpaid = paymentStatus === "pending" || paymentStatus === "failed";
                  const trackStatuses = new Set(["processing", "delivering", "en_route", "picked_up", "assigned"]);

                  const handleClick = () => {
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
                      className="p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors flex flex-col"
                      onClick={handleClick}
                      data-testid={`order-${order.id}`}
                    >
                      <div className="mb-2">
                        <p className="font-medium text-sm">{order.orderNumber}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex-1">
                        <p className="text-lg font-semibold mb-2">GHS {order.total}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-sm text-muted-foreground capitalize">{order.status}</p>
                          {isUnpaid && (
                            <p className="text-xs text-destructive font-medium">Click to pay</p>
                          )}
                        </div>
                      </div>

                      <div className="mt-3">
                        {isUnpaid ? (
                          <Button
                            size="sm"
                            variant="outline"
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
          <Card className="mt-8">
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
              <p className="text-muted-foreground mb-4">Start shopping to see your orders here</p>
              <Button onClick={() => navigate("/")} data-testid="button-start-shopping">
                Start Shopping
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
