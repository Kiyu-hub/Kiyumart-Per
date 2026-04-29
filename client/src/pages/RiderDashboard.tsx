import { useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import MetricCard from "@/components/MetricCard";
import OrderCard from "@/components/OrderCard";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { DollarSign, Package, MapPin, Star, Loader2, TrendingUp, Calendar } from "lucide-react";

const RiderLiveMap = lazy(() => import("@/components/RiderLiveMap"));

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  riderId: string | null;
  deliveryMethod: string;
  total: string;
  status: string;
  createdAt: string;
  deliveredAt?: string | null;
  updatedAt?: string | null;
  deliveryAddress?: string | null;
  busDeliveryWorkflow?: {
    stage?: string | null;
    proofSubmitted?: boolean;
  } | null;
  buyer?: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
  };
  items?: Array<{ quantity?: number }>;
}

interface RiderEarningsPayload {
  total: string;
  thisMonth: string;
  today: string;
  deliveriesCompleted: number;
  history?: Array<{ deliveryId: string; orderId: string | null; date: string | null; amount: string; currency: string; status: string }>;
}

const ACTIVE_DELIVERY_STATUSES = new Set([
  "searching_rider",
  "assigned",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "en_route",
]);

const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();

export default function RiderDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "rider")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", "rider"],
    queryFn: async () => {
      const res = await fetch("/api/orders?context=rider", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rider orders");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "rider",
    refetchInterval: 10000,
  });

  const { data: earnings, refetch: refetchEarnings } = useQuery<RiderEarningsPayload>({
    queryKey: ["/api/rider/earnings"],
    queryFn: async () => {
      const res = await fetch("/api/rider/earnings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rider earnings");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "rider",
    refetchInterval: 30000,
  });

  const { data: riderSettings, refetch: refetchSettings } = useQuery<{ riderOnline: boolean }>({
    queryKey: ["/api/rider/settings"],
    queryFn: async () => {
      const res = await fetch("/api/rider/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rider settings");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "rider",
  });

  const goOnlineMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/rider/availability", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to update availability");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rider/settings"] });
      toast({ title: "You are online", description: "You are now available for delivery assignments." });
    },
    onError: (error: any) => {
      toast({ title: "Could not update availability", description: error?.message, variant: "destructive" });
    },
  });

  if (authLoading || !isAuthenticated || user?.role !== "rider") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-rider" />
      </div>
    );
  }

  const myDeliveries = orders.filter((o) => o.riderId === user.id);
  const activeDeliveries = myDeliveries.filter((o) => ACTIVE_DELIVERY_STATUSES.has(normalizeOrderStatus(o.status)));
  const currentOrder = activeDeliveries[0];

  return (
    <DashboardLayout role="rider">
      <div className="p-6">
        {ordersLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Availability + welcome bar */}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Welcome back, {user?.name?.split(" ")[0] || "Rider"}</p>
                <p className="text-xs text-muted-foreground">
                  This month: <strong>{formatPrice(Number(earnings?.thisMonth || 0))}</strong> · All time: <strong>{formatPrice(Number(earnings?.total || 0))}</strong>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {riderSettings?.riderOnline !== false ? (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-white animate-pulse inline-block" />
                    Online — Available
                  </Badge>
                ) : (
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1.5">Offline</Badge>
                    <Button size="sm" onClick={() => goOnlineMutation.mutate()} disabled={goOnlineMutation.isPending}>
                      {goOnlineMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Go Online
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Today's Earnings"
                value={formatPrice(Number(earnings?.today || 0))}
                icon={DollarSign}
              />
              <MetricCard
                title="This Month"
                value={formatPrice(Number(earnings?.thisMonth || 0))}
                icon={TrendingUp}
              />
              <MetricCard
                title="Active Deliveries"
                value={activeDeliveries.length.toString()}
                icon={MapPin}
              />
              <MetricCard
                title="Rating"
                value={String((user as any)?.ratings || "0.0")}
                icon={Star}
              />
            </div>

            <div className="mt-6">
              <TrackingMetricsPanel role="rider" title="Live Route Intelligence" />
            </div>

            <div className="mt-6">
              <Suspense fallback={
                <Card className="min-h-[360px] h-[52vh] max-h-[760px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </Card>
              }>
                <RiderLiveMap className="min-h-[360px] h-[52vh] max-h-[760px]" />
              </Suspense>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
              <div className="space-y-4">
                <h2 className="text-xl font-bold" data-testid="text-active-deliveries">Active Deliveries</h2>
                {activeDeliveries.length > 0 ? (
                  activeDeliveries.map((order) => {
                    const itemCount = (order.items || []).reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
                    return (
                      <OrderCard
                        key={order.id}
                        orderId={order.orderNumber}
                        customerName={order.buyer?.name || "Customer"}
                        items={itemCount}
                        total={parseFloat(order.total)}
                        status={order.status}
                        deliveryMethod={order.deliveryMethod}
                        date={new Date(order.createdAt).toLocaleDateString()}
                        onViewDetails={() => navigate(`/rider/route?orderId=${order.id}`)}
                      />
                    );
                  })
                ) : (
                  <p className="text-muted-foreground text-center py-8" data-testid="text-no-deliveries">
                    No active deliveries
                  </p>
                )}
              </div>

              <div>
                <h2 className="text-xl font-bold mb-4">Current Route Timeline</h2>
                {currentOrder ? (
                  <Card className="p-4">
                    <div className="mb-3">
                      <p className="font-semibold">Order #{currentOrder.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{currentOrder.deliveryAddress || "Delivery address unavailable"}</p>
                    </div>
                    <OrderStatusTimeline
                      currentStatus={currentOrder.status}
                      deliveryMethod={currentOrder.deliveryMethod}
                      busDeliveryWorkflow={currentOrder.busDeliveryWorkflow}
                      createdAt={currentOrder.createdAt}
                      updatedAt={currentOrder.updatedAt || undefined}
                      deliveredAt={currentOrder.deliveredAt || undefined}
                    />
                  </Card>
                ) : (
                  <p className="text-muted-foreground text-center py-8">No active route</p>
                )}
              </div>
            </div>

            {/* Earnings history */}
            {earnings?.history && earnings.history.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-bold">Recent Earnings</h2>
                  <Button variant="outline" size="sm" onClick={() => navigate("/rider/earnings")}>
                    View All
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-0">
                    <div className="divide-y divide-border">
                      {earnings.history.slice(0, 8).map((entry, idx) => (
                        <div key={entry.deliveryId || idx} className="flex items-center justify-between px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                              <Calendar className="h-4 w-4 text-emerald-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium">Delivery completed</p>
                              <p className="text-xs text-muted-foreground">
                                {entry.date ? new Date(entry.date).toLocaleDateString() : "Date unavailable"}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-emerald-600">{formatPrice(Number(entry.amount || 0))}</p>
                            <Badge variant="outline" className="text-xs capitalize">{entry.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
