import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoadingState } from "@/components/ui/loading-state";
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  CreditCard,
  AlertCircle,
  Loader2,
  MapPin,
} from "lucide-react";

interface Order {
  id: string;
  orderNumber?: string;
  userId: string;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  totalAmount: string;
  createdAt: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  externalDeliveryType?: string | null;
  externalDeliveryByBus?: boolean;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    selectedColor?: string | null;
    selectedSize?: string | null;
  }>;
  verificationSummary?: {
    sellerToRider?: string | null;
    riderToBuyer?: string | null;
    sellerToBuyer?: string | null;
  };
  pickupStationInfo?: {
    id?: string | null;
    name?: string | null;
    locationLabel?: string | null;
    pickupAgentName?: string | null;
    pickupAgentPhone?: string | null;
  } | null;
}

const TRACKABLE_STATUSES = new Set([
  "assigned",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "en_route",
]);

function normalize(s?: string | null) {
  return (s || "").toLowerCase().trim();
}

function normalizePaymentStatus(value?: string) {
  const s = normalize(value);
  if (s === "payment_pending") return "pending";
  if (s === "payment_failed") return "failed";
  if (s === "completed" || s === "paid") return "paid";
  return s || "pending";
}

function getStatusColor(status: string) {
  switch (status) {
    case "pending":
    case "created":
      return "bg-yellow-500 text-white";
    case "processing":
    case "packaged":
    case "ready":
    case "searching_rider":
      return "bg-blue-500 text-white";
    case "assigned":
    case "rider_arrived":
      return "bg-indigo-500 text-white";
    case "picked_up":
    case "in_transit":
    case "en_route":
      return "bg-purple-500 text-white";
    case "external_dispatch_arranged":
      return "bg-orange-500 text-white";
    case "delivered":
    case "completed":
      return "bg-green-600 text-white";
    case "cancelled":
      return "bg-red-500 text-white";
    case "disputed":
      return "bg-rose-500 text-white";
    default:
      return "bg-gray-500 text-white";
  }
}

function getStatusLabel(status: string, deliveryMethod?: string, isExternal?: boolean) {
  const isPickup = normalize(deliveryMethod) === "pickup";
  switch (status) {
    case "pending":
    case "created":
      return "Pending";
    case "processing":
      return "Processing";
    case "packaged":
      return "Packaged";
    case "ready":
      return isPickup ? "Ready for Pickup" : "Ready";
    case "searching_rider":
      return "Finding Rider";
    case "assigned":
      return "Rider Assigned";
    case "rider_arrived":
      return "Rider at Seller";
    case "picked_up":
      return "Picked Up";
    case "in_transit":
    case "en_route":
      return "On the Way";
    case "external_dispatch_arranged":
      return isExternal ? "Dispatched" : "Dispatch Arranged";
    case "delivered":
      return "Delivered";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "disputed":
      return "Disputed";
    default:
      return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function getStatusIcon(status: string, deliveryMethod?: string) {
  const isPickup = normalize(deliveryMethod) === "pickup";
  switch (status) {
    case "pending":
    case "created":
      return <Clock className="h-4 w-4" />;
    case "processing":
    case "packaged":
    case "ready":
    case "searching_rider":
      return <Package className="h-4 w-4" />;
    case "assigned":
    case "rider_arrived":
    case "picked_up":
    case "in_transit":
    case "en_route":
    case "external_dispatch_arranged":
      return isPickup ? <MapPin className="h-4 w-4" /> : <Truck className="h-4 w-4" />;
    case "delivered":
    case "completed":
      return <CheckCircle className="h-4 w-4" />;
    case "cancelled":
    case "disputed":
      return <XCircle className="h-4 w-4" />;
    default:
      return <Package className="h-4 w-4" />;
  }
}

function getDisplayOrderNumber(order: Order) {
  const raw = String(order.orderNumber || "").replace(/^#/, "").trim();
  const orderIdToken = String(order.id || "").replace(/-/g, "").slice(0, 4).toUpperCase() || "XXXX";
  const normalizedRaw = raw.toUpperCase();
  const ordMatch = normalizedRaw.match(/^ORD-(\d{10,17})(?:-([A-Z0-9]+))?$/);
  if (ordMatch) {
    const timestampPart = ordMatch[1];
    const suffixPart = (ordMatch[2] || orderIdToken).replace(/[^A-Z0-9]/g, "").slice(0, 4) || orderIdToken;
    return `ORD-${timestampPart}-${suffixPart}`;
  }
  if (normalizedRaw.length > 0) return normalizedRaw;
  return `ORD-${String(order.id || "").replace(/-/g, "").slice(0, 12).toUpperCase()}`;
}

function getGroupStatus(status: string): "pending" | "active" | "completed" | "cancelled" {
  switch (status) {
    case "pending":
    case "created":
      return "pending";
    case "processing":
    case "packaged":
    case "ready":
    case "searching_rider":
    case "assigned":
    case "rider_arrived":
    case "picked_up":
    case "in_transit":
    case "en_route":
    case "external_dispatch_arranged":
      return "active";
    case "delivered":
    case "completed":
      return "completed";
    case "cancelled":
    case "disputed":
      return "cancelled";
    default:
      return "pending";
  }
}

export default function BuyerOrders() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "buyer")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", "buyer-dashboard-orders", user?.id],
    queryFn: () => fetchApiJson<Order[]>("/api/orders?context=buyer"),
    enabled: isAuthenticated && user?.role === "buyer",
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    staleTime: 0,
  });

  if (authLoading || !isAuthenticated || user?.role !== "buyer") {
    return <PageLoadingState title="Loading orders" description="Fetching your order history." />;
  }

  const filterByGroup = (group: "all" | "pending" | "active" | "completed" | "cancelled") => {
    if (group === "all") return orders;
    return orders.filter((o) => getGroupStatus(normalize(o.status)) === group);
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const rawStatus = normalize(order.status);
    const payStatus = normalizePaymentStatus(order.paymentStatus);
    const isPickup = normalize(order.deliveryMethod) === "pickup";
    const isExternal = isExternalRiderSystemEnabled && !isPickup;
    const displayNumber = getDisplayOrderNumber(order);
    const isTrackable = TRACKABLE_STATUSES.has(rawStatus);
    const isCompleted = rawStatus === "delivered" || rawStatus === "completed";
    const isPendingPayment =
      ["pending", "created"].includes(rawStatus) &&
      ["pending", "failed"].includes(payStatus);

    const primaryItem = order.items?.[0];
    const extraCount = Math.max(0, (order.items?.length || 0) - 1);

    return (
      <Card
        className="cursor-pointer hover-elevate active-elevate-2 transition-all"
        onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)}
        data-testid={`order-card-${order.id}`}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-lg bg-muted">
                {getStatusIcon(rawStatus, order.deliveryMethod)}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-base leading-tight">
                  <span className="block truncate">#{displayNumber}</span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Badge
              className={`${getStatusColor(rawStatus)} shrink-0 text-xs`}
              data-testid={`badge-status-${order.id}`}
            >
              {getStatusLabel(rawStatus, order.deliveryMethod, isExternal)}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {primaryItem && (
            <div className="rounded-md border border-border/60 bg-muted/20 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                Items
              </p>
              <div className="flex justify-between gap-2">
                <span className="truncate font-medium" title={primaryItem.productName}>
                  {primaryItem.productName}
                </span>
                <span className="shrink-0 text-muted-foreground">×{primaryItem.quantity}</span>
              </div>
              {extraCount > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  +{extraCount} more item{extraCount === 1 ? "" : "s"}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold text-primary">
              {formatPrice(parseFloat(order.totalAmount))}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Delivery</span>
            <span className="font-medium">
              {isPickup
                ? "Pickup"
                : isExternal
                ? normalize(order.externalDeliveryType) === "bus" || order.externalDeliveryByBus
                  ? "VIP Bus"
                  : "Third-Party"
                : normalize(order.deliveryMethod) === "bus"
                ? "Bus Delivery"
                : "Rider Delivery"}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Payment</span>
            <Badge
              variant="secondary"
              className={`h-5 gap-1 text-xs ${
                payStatus === "paid"
                  ? "bg-green-100 text-green-800"
                  : payStatus === "failed"
                  ? "bg-red-100 text-red-800"
                  : payStatus === "processing"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-yellow-100 text-yellow-800"
              }`}
            >
              {payStatus === "paid" ? (
                <CheckCircle className="h-3 w-3" />
              ) : payStatus === "failed" ? (
                <XCircle className="h-3 w-3" />
              ) : payStatus === "processing" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              {payStatus === "paid"
                ? "Paid"
                : payStatus === "failed"
                ? "Failed"
                : payStatus === "processing"
                ? "Processing"
                : "Pending"}
            </Badge>
          </div>

          {isPickup && order.pickupStationInfo?.locationLabel && (
            <div className="flex justify-between text-sm gap-2">
              <span className="text-muted-foreground">Pickup Station</span>
              <span className="font-medium text-right truncate">
                {order.pickupStationInfo.locationLabel}
              </span>
            </div>
          )}

          <div className="mt-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {isTrackable && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => navigate(`/track/${encodeURIComponent(order.id)}`)}
                data-testid={`button-track-${order.id}`}
              >
                <Truck className="h-4 w-4 mr-1" />
                Track Order
              </Button>
            )}
            {isPendingPayment && (
              <Button
                size="sm"
                className="flex-1"
                onClick={() => navigate(`/payment/${encodeURIComponent(order.id)}`)}
                data-testid={`button-pay-${order.id}`}
              >
                <CreditCard className="h-4 w-4 mr-1" />
                Pay Now
              </Button>
            )}
            {!isTrackable && !isPendingPayment && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)}
                data-testid={`button-view-${order.id}`}
              >
                {isCompleted ? "View Receipt" : "View Order"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const TAB_GROUPS = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "active", label: "In Progress" },
    { value: "completed", label: "Completed" },
    { value: "cancelled", label: "Cancelled" },
  ] as const;

  return (
    <DashboardLayout role="buyer" showBackButton>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="heading-buyer-orders">
            My Orders
          </h1>
          <p className="text-muted-foreground mt-1">
            Track and manage all your purchases
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Package className="h-16 w-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No orders yet</h2>
            <p className="text-muted-foreground mb-6">
              When you place an order it will appear here.
            </p>
            <Button onClick={() => navigate("/")}>Start Shopping</Button>
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-4">
              {TAB_GROUPS.map(({ value, label }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="rounded-full border data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  data-testid={`tab-${value}`}
                >
                  {label}
                  <span className="ml-1.5 text-xs opacity-70">
                    ({filterByGroup(value).length})
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>

            {TAB_GROUPS.map(({ value }) => (
              <TabsContent key={value} value={value} className="mt-0">
                {filterByGroup(value).length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mb-3 opacity-40" />
                    <p>No orders in this category</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filterByGroup(value).map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
