import { useEffect, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import DashboardLayout from "@/components/DashboardLayout";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import DeliveryMap from "@/components/DeliveryMap";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, MapPin, Package, Phone, Truck, Clock, CheckCircle2, Navigation } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useLanguage } from "@/contexts/LanguageContext";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: string;
  totalAmount: number;
  deliveryAddress: string;
  deliveryCity?: string;
  deliveryPhone?: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
  createdAt: string;
  deliveredAt?: string;
  updatedAt?: string;
  riderId?: string;
  riderInfo?: {
    id?: string;
    name?: string;
    phone?: string;
    vehicleType?: string;
    vehicleColor?: string;
    profileImage?: string;
  } | null;
  estimatedDeliveryTime?: string | null;
  trackingNumber?: string | null;
}

interface RiderLocation {
  orderId: string;
  latitude: number;
  longitude: number;
  speed?: number | null;
  heading?: number | null;
  timestamp: string;
  riderName?: string;
  vehicleType?: string;
}

const DELIVERY_STATUSES = [
  { key: "created", label: "Order Placed", icon: Package },
  { key: "processing", label: "Being Prepared", icon: Package },
  { key: "ready", label: "Ready for Pickup", icon: Package },
  { key: "assigned", label: "Rider Assigned", icon: Truck },
  { key: "picked_up", label: "Picked Up", icon: Truck },
  { key: "in_transit", label: "In Transit", icon: Navigation },
  { key: "en_route", label: "On the Way", icon: Navigation },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
  { key: "completed", label: "Completed", icon: CheckCircle2 },
];

export default function BuyerOrderTracking() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/buyer/tracking/:orderId");
  const orderId = params?.orderId || "";
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();
  const { toast } = useToast();
  const socketRef = useRef<Socket | null>(null);
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const showRiderFeatures = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "buyer")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, user, navigate]);

  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
    enabled: !!orderId && isAuthenticated,
    refetchInterval: 30000,
  });

  // Live rider location via Socket.IO (only when internal rider mode on)
  useEffect(() => {
    if (!orderId || !showRiderFeatures || !isAuthenticated) return;
    const socket = io({ auth: { userId: user?.id } });
    socketRef.current = socket;

    socket.on("rider_location_updated", (data: RiderLocation) => {
      if (data.orderId === orderId) {
        setRiderLocation(data);
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      }
    });

    socket.on("order_status_updated", (data: { orderId: string }) => {
      if (data.orderId === orderId) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [orderId, showRiderFeatures, isAuthenticated, user?.id]);

  if (authLoading || !isAuthenticated) {
    return <PageLoadingState title="Loading tracking" description="Verifying your account…" />;
  }

  if (!orderId) {
    return (
      <DashboardLayout role="buyer">
        <div className="p-6 text-center py-20 text-muted-foreground">
          <p>No order ID specified.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/buyer/orders")}>
            Back to Orders
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  if (orderLoading) {
    return <PageLoadingState title="Loading order tracking" description="Fetching order status and rider location…" />;
  }

  if (!order) {
    return (
      <DashboardLayout role="buyer">
        <div className="p-6 text-center py-20">
          <p className="text-muted-foreground">Order not found or access denied.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/buyer/orders")}>
            Back to Orders
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const isDeliveryOrder = order.deliveryMethod === "rider" || order.deliveryMethod === "bus";
  const isDelivered = ["delivered", "completed"].includes(order.status);
  const hasRider = !!order.riderId || !!order.riderInfo;
  const liveLatitude = riderLocation?.latitude ?? (order.deliveryLatitude ? parseFloat(order.deliveryLatitude) : undefined);
  const liveLongitude = riderLocation?.longitude ?? (order.deliveryLongitude ? parseFloat(order.deliveryLongitude) : undefined);

  const currentStatusIndex = DELIVERY_STATUSES.findIndex(s => s.key === order.status);

  return (
    <DashboardLayout role="buyer">
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/buyer/orders")} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            My Orders
          </Button>
        </div>

        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Order #{order.orderNumber}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Placed {format(new Date(order.createdAt), "MMM d, yyyy 'at' h:mm a")}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        {/* Status Timeline */}
        {isDeliveryOrder && showRiderFeatures ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                Delivery Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-1 overflow-x-auto pb-2">
                {DELIVERY_STATUSES.map((step, idx) => {
                  const isCompleted = idx < currentStatusIndex;
                  const isCurrent = idx === currentStatusIndex;
                  const Icon = step.icon;
                  return (
                    <div key={step.key} className="flex items-center gap-1 flex-shrink-0">
                      <div className={`flex flex-col items-center gap-1 ${isCompleted || isCurrent ? "opacity-100" : "opacity-30"}`}>
                        <div className={`h-7 w-7 rounded-full flex items-center justify-center border-2 transition-all ${
                          isCurrent ? "border-primary bg-primary text-primary-foreground" :
                          isCompleted ? "border-primary bg-primary/10 text-primary" :
                          "border-muted text-muted-foreground"
                        }`}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <span className={`text-[10px] text-center max-w-[60px] leading-tight ${isCurrent ? "text-primary font-medium" : "text-muted-foreground"}`}>
                          {step.label}
                        </span>
                      </div>
                      {idx < DELIVERY_STATUSES.length - 1 && (
                        <div className={`h-0.5 w-5 flex-shrink-0 rounded mb-3 ${isCompleted ? "bg-primary" : "bg-muted"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
              {order.estimatedDeliveryTime && !isDelivered && (
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground border-t pt-3">
                  <Clock className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>Estimated delivery: <strong>{order.estimatedDeliveryTime}</strong></span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <OrderStatusTimeline currentStatus={order.status} deliveryMethod={order.deliveryMethod} />
        )}

        {/* Live Map — only when rider mode is on and we have a location */}
        {showRiderFeatures && isDeliveryOrder && (riderLocation || order.deliveryLatitude) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Navigation className="h-4 w-4 text-primary" />
                Live Rider Location
                {riderLocation && (
                  <Badge variant="default" className="ml-2 text-[10px] animate-pulse">LIVE</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-hidden rounded-b-xl">
              <div className="h-64 md:h-80">
                <DeliveryMap
                  deliveryLocation={{
                    latitude: order.deliveryLatitude ? parseFloat(order.deliveryLatitude) : 0,
                    longitude: order.deliveryLongitude ? parseFloat(order.deliveryLongitude) : 0,
                    address: order.deliveryAddress || "",
                  }}
                  riderLocation={riderLocation ? {
                    latitude: riderLocation.latitude,
                    longitude: riderLocation.longitude,
                    heading: riderLocation.heading ?? undefined,
                    speed: riderLocation.speed ?? undefined,
                    timestamp: riderLocation.timestamp,
                  } : undefined}
                  riderInfo={order.riderInfo ? {
                    name: order.riderInfo.name,
                    profileImage: order.riderInfo.profileImage,
                    vehicleType: riderLocation?.vehicleType || order.riderInfo.vehicleType,
                    phone: order.riderInfo.phone,
                  } : undefined}
                  orderNumber={order.orderNumber}
                  orderId={orderId}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Rider Info — only when rider mode on and rider assigned */}
        {showRiderFeatures && hasRider && order.riderInfo && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                Your Rider
              </CardTitle>
            </CardHeader>
            <CardContent className="flex items-center gap-4">
              <div className="flex-1">
                <p className="font-medium">{order.riderInfo.name || "Rider"}</p>
                {order.riderInfo.vehicleType && (
                  <p className="text-xs text-muted-foreground capitalize">
                    {order.riderInfo.vehicleType}{order.riderInfo.vehicleColor ? ` — ${order.riderInfo.vehicleColor}` : ""}
                  </p>
                )}
              </div>
              {order.riderInfo.phone && (
                <Button variant="outline" size="sm" className="gap-1.5" asChild>
                  <a href={`tel:${order.riderInfo.phone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    Call Rider
                  </a>
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Order Details */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" />
              Delivery Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Address</span>
              <span className="font-medium text-right max-w-[60%]">{order.deliveryAddress}</span>
            </div>
            {order.deliveryCity && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">City</span>
                <span className="font-medium">{order.deliveryCity}</span>
              </div>
            )}
            {order.deliveryPhone && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Contact</span>
                <span className="font-medium">{order.deliveryPhone}</span>
              </div>
            )}
            <div className="flex justify-between border-t pt-2 mt-2">
              <span className="text-muted-foreground">Order Total</span>
              <span className="font-bold text-base">{formatPrice(order.totalAmount)}</span>
            </div>
            {isDelivered && order.deliveredAt && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Delivered At</span>
                <span className="font-medium text-green-600">
                  {format(new Date(order.deliveredAt), "MMM d, yyyy h:mm a")}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
