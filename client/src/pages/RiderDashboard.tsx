import { useEffect, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardLayout from "@/components/DashboardLayout";
import MetricCard from "@/components/MetricCard";
import OrderCard from "@/components/OrderCard";
import DeliveryTracker from "@/components/DeliveryTracker";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DollarSign, Package, MapPin, Star, Loader2 } from "lucide-react";

// Lazy load the map component for better performance
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
}

interface DeliveryStep {
  label: string;
  time?: string;
  completed: boolean;
}

const ACTIVE_DELIVERY_STATUSES = new Set([
  "assigned",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "en_route",
]);

function buildDeliverySteps(order?: Order): DeliveryStep[] {
  const status = normalizeOrderStatus(order?.status);
  const formatTimestamp = (value?: string | null) =>
    value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined;
  const baseTime = formatTimestamp(order?.updatedAt || order?.createdAt);

  const completed = (target: string) => {
    const orderState = ["assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "delivered", "completed"];
    return orderState.indexOf(status) >= orderState.indexOf(target);
  };

  return [
    { label: "Rider Assigned", time: completed("assigned") ? baseTime : undefined, completed: completed("assigned") },
    { label: "Rider Arrived", time: completed("rider_arrived") ? baseTime : undefined, completed: completed("rider_arrived") },
    { label: "Picked Up", time: completed("picked_up") ? baseTime : undefined, completed: completed("picked_up") },
    {
      label: "In Transit",
      time: completed("in_transit") || completed("en_route") ? baseTime : undefined,
      completed: completed("in_transit") || completed("en_route"),
    },
    { label: "Delivered", time: completed("delivered") ? baseTime : undefined, completed: completed("delivered") || completed("completed") },
  ];
}

export default function RiderDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "rider")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated && user?.role === "rider",
  });

  if (authLoading || !isAuthenticated || user?.role !== "rider") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-rider" />
      </div>
    );
  }

  const myDeliveries = orders.filter(o => o.riderId === user.id);
  const activeDeliveries = myDeliveries.filter((o) => ACTIVE_DELIVERY_STATUSES.has(normalizeOrderStatus(o.status)));
  const completedDeliveries = myDeliveries.filter((o) => normalizeOrderStatus(o.status) === "delivered");
  
  const todayEarnings = completedDeliveries
    .filter(o => {
      const orderDate = new Date(o.deliveredAt || o.createdAt);
      const today = new Date();
      return orderDate.toDateString() === today.toDateString();
    })
    .reduce((sum, o) => sum + parseFloat(o.total) * 0.1, 0);

  const currentOrder = activeDeliveries[0];
  const trackingSteps = buildDeliverySteps(currentOrder);

  return (
    <DashboardLayout role="rider">
      <div className="p-6">
            {ordersLoading ? (
              <div className="flex justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <MetricCard
                    title="Today's Earnings"
                    value={formatPrice(todayEarnings)}
                    icon={DollarSign}
                  />
                  <MetricCard
                    title="Completed Deliveries"
                    value={completedDeliveries.length.toString()}
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

                {/* Live Map Section */}
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
                      activeDeliveries.map((order) => (
                        <OrderCard
                          key={order.id}
                          orderId={order.orderNumber}
                          customerName="Customer"
                          items={1}
                          total={parseFloat(order.total)}
                          status={order.status as any}
                          deliveryMethod={order.deliveryMethod as any}
                          date={new Date(order.createdAt).toLocaleDateString()}
                          onViewDetails={() => navigate(`/track?orderId=${order.id}`)}
                        />
                      ))
                    ) : (
                      <p className="text-muted-foreground text-center py-8" data-testid="text-no-deliveries">
                        No active deliveries
                      </p>
                    )}
                  </div>

                  <div>
                    <h2 className="text-xl font-bold mb-4">Current Route</h2>
                    {activeDeliveries.length > 0 ? (
                      <DeliveryTracker
                        orderId={currentOrder.orderNumber}
                        riderName={user.name}
                        steps={trackingSteps}
                        estimatedArrival={currentOrder?.updatedAt ? new Date(currentOrder.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : undefined}
                      />
                    ) : (
                      <p className="text-muted-foreground text-center py-8">
                        No active route
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
      </div>
    </DashboardLayout>
  );
}
  const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();
