import { useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import MetricCard from "@/components/MetricCard";
import OrderCard from "@/components/OrderCard";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DollarSign, Package, MapPin, Star, Loader2 } from "lucide-react";

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
}

interface RiderSettingsPayload {
  riderOnline: boolean;
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
  });

  const { data: earnings } = useQuery<RiderEarningsPayload>({
    queryKey: ["/api/rider/earnings"],
    queryFn: async () => {
      const res = await fetch("/api/rider/earnings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rider earnings");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "rider",
  });

  const { data: settings } = useQuery<RiderSettingsPayload>({
    queryKey: ["/api/rider/settings"],
    queryFn: async () => {
      const res = await fetch("/api/rider/settings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch rider settings");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "rider",
  });

  const availabilityMutation = useMutation({
    mutationFn: async (online: boolean) => {
      const res = await apiRequest("PATCH", "/api/rider/availability", { online });
      if (!res.ok) throw new Error("Failed to update availability");
      return res.json();
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rider/settings"] });
      toast({
        title: "Availability updated",
        description: payload?.online ? "You are online for new assignments." : "You are offline for new assignments.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Availability update failed",
        description: error.message || "Could not update rider availability",
        variant: "destructive",
      });
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
            <div className="mb-6 flex items-center justify-end">
              <div className="flex items-center gap-3 rounded-lg border px-4 py-2">
                <Label htmlFor="dashboard-rider-online" className="text-sm">Online for Assignments</Label>
                <Switch
                  id="dashboard-rider-online"
                  checked={settings?.riderOnline !== false}
                  onCheckedChange={(checked) => availabilityMutation.mutate(Boolean(checked))}
                  disabled={availabilityMutation.isPending}
                  data-testid="switch-dashboard-rider-availability"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              <MetricCard
                title="Today's Earnings"
                value={formatPrice(Number(earnings?.today || 0))}
                icon={DollarSign}
              />
              <MetricCard
                title="Completed Deliveries"
                value={String(earnings?.deliveriesCompleted || 0)}
                icon={Package}
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
              <Suspense fallback={
                <Card className="h-[400px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </Card>
              }>
                <RiderLiveMap className="h-[400px]" />
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
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
