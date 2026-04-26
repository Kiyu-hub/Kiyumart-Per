import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import { Package, Clock, CheckCircle, XCircle, Truck, CreditCard, AlertCircle, Loader2, MapPin } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Order {
  id: string;
  orderNumber?: string;
  userId: string;
  status: string;
  paymentStatus: string;
  deliveryMethod: "pickup" | "bus" | "rider" | string;
  totalAmount: string;
  createdAt: string;
  deliveryAddress: string;
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
    city?: string | null;
    region?: string | null;
    locationLabel?: string | null;
    pickupAgentName?: string | null;
    pickupAgentPhone?: string | null;
  } | null;
}

export default function Orders() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { currencySymbol, formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();

  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const normalizePaymentStatus = (value?: string) => {
    const s = normalize(value);
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid") return "paid";
    return s || "pending";
  };
  const getEffectiveOrderStatus = (order: Order) => {
    const orderStatus = normalize(order.status) || "pending";
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const isPickup = normalize(order.deliveryMethod) === "pickup";
    const externalManualFlow = isExternalRiderSystemEnabled && !isPickup;
    if ((orderStatus === "pending" || orderStatus === "created") && (paymentStatus === "paid" || paymentStatus === "processing")) {
      return "processing";
    }
    if (isPickup && orderStatus === "packaged") {
      return "packaged";
    }
    if (["searching_rider", "confirmed", "ready", "processing", "assigned", "rider_arrived", "external_dispatch_arranged"].includes(orderStatus)) {
      return "processing";
    }
    if (["picked_up", "in_transit", "en_route", "out_for_delivery", "delivering"].includes(orderStatus)) {
      return "en_route";
    }
    if (orderStatus === "completed") return "completed";
    if (orderStatus === "delivered") return "delivered";
    if (orderStatus === "created") return "pending";
    return orderStatus;
  };

  const getStatusLabel = (status: string, deliveryMethod?: string) => {
    const isPickup = normalize(deliveryMethod) === "pickup";
    const externalManualFlow = isExternalRiderSystemEnabled && !isPickup;
    switch (status.toLowerCase()) {
      case "pending":
        return "Pending";
      case "processing":
        return isPickup ? "Preparing Order" : "Preparing Delivery";
      case "packaged":
        return "Packaged";
      case "en_route":
        return isPickup ? "Ready for Pickup" : "On the Way";
      case "delivered":
        return externalManualFlow ? "Completed" : "Delivered";
      case "completed":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      case "disputed":
        return "Disputed";
      default:
        return "Pending";
    }
  };

  // Always fetch orders where the user is the buyer (their purchases)
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", "buyer-orders"],
    queryFn: async () => {
      const response = await fetch("/api/orders?context=buyer", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load orders");
      return response.json();
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const formatItemSelection = (item?: { selectedColor?: string | null; selectedSize?: string | null }) => {
    const parts = [
      item?.selectedColor ? `Color: ${item.selectedColor}` : null,
      item?.selectedSize ? `Size: ${item.selectedSize}` : null,
    ].filter(Boolean);
    return parts.join(" • ");
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "bg-yellow-500 text-white";
      case "processing":
        return "bg-blue-500 text-white";
      case "en_route":
        return "bg-purple-500 text-white";
      case "delivered":
        return "bg-green-500 text-white";
      case "completed":
        return "bg-green-600 text-white";
      case "cancelled":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getPaymentStatusColor = (paymentStatus: string) => {
    switch (normalizePaymentStatus(paymentStatus)) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "paid":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "refunded":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string, deliveryMethod?: string) => {
    const isPickup = normalize(deliveryMethod) === "pickup";
    switch (status.toLowerCase()) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "processing":
        return <Package className="h-4 w-4" />;
      case "packaged":
        return <Package className="h-4 w-4" />;
      case "en_route":
        return isPickup ? <MapPin className="h-4 w-4" /> : <Truck className="h-4 w-4" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4" />;
      case "completed":
        return <CheckCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getPaymentStatusIcon = (paymentStatus: string) => {
    switch (normalizePaymentStatus(paymentStatus)) {
      case "pending":
        return <AlertCircle className="h-3 w-3" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "paid":
        return <CheckCircle className="h-3 w-3" />;
      case "failed":
        return <XCircle className="h-3 w-3" />;
      default:
        return <CreditCard className="h-3 w-3" />;
    }
  };

  const filterOrdersByStatus = (status: string) => {
    if (status === "all") return orders;
    if (status === "processing") {
      return orders.filter((order) => {
        const effective = getEffectiveOrderStatus(order);
        return effective === "processing" || effective === "en_route";
      });
    }
    if (status === "delivered") {
      return orders.filter((order) => {
        const effective = getEffectiveOrderStatus(order);
        return effective === "delivered" || effective === "completed";
      });
    }
    return orders.filter((order) => getEffectiveOrderStatus(order) === status.toLowerCase());
  };

  const getOrderFlowLabel = (status: string) => {
    switch (status) {
      case "all":
        return "All";
      case "pending":
        return "Pending";
      case "processing":
        return "Preparing";
      case "delivered":
        return "Completed";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };
  const getFilterProcessingLabel = () => "Preparing";
  const getFilterCompletedLabel = () => "Completed";

  const getPaymentButtonConfig = (order: Order) => {
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const orderStatus = getEffectiveOrderStatus(order);
    const isPickup = normalize(order.deliveryMethod) === "pickup";
    const isExternalManualFlow = isExternalRiderSystemEnabled && !isPickup;
    const rawStatus = normalize(order.status);
    const canResumePayment =
      ["pending", "created", "unpaid"].includes(rawStatus) &&
      ["pending", "failed", "processing"].includes(paymentStatus);
    const shouldTrackOrView =
      ["processing", "en_route", "delivered", "cancelled", "disputed"].includes(orderStatus) ||
      paymentStatus === "paid";

    if (shouldTrackOrView) {
      if (["delivered", "completed"].includes(orderStatus)) {
        return {
          label: "Track Order",
          variant: "outline" as const,
          disabled: false,
          onClick: () => navigate(`/track/${encodeURIComponent(order.id)}`),
          title: "View the completed order timeline and final delivery state",
        };
      }

      return {
        label: isPickup || isExternalManualFlow ? "View Order" : "Track Order",
        variant: "outline" as const,
        disabled: false,
        onClick: () =>
          navigate(
            isPickup || isExternalManualFlow
              ? `/orders/${encodeURIComponent(order.id)}`
              : `/track/${encodeURIComponent(order.id)}`,
          ),
        title: isPickup || isExternalManualFlow ? "View order updates" : "View order status and tracking information",
      };
    }

    if (canResumePayment) {
      return {
        label: "Continue Payment",
        variant: "default" as const,
        disabled: false,
        onClick: () => navigate(`/payment/${order.id}`),
        title: "Resume payment for this order",
      };
    }

    return {
      label: ["delivered", "completed"].includes(orderStatus)
        ? "Track Order"
        : isPickup || isExternalManualFlow
          ? "View Order"
          : "Track Order",
      variant: "outline" as const,
      disabled: false,
      onClick: () =>
        navigate(["delivered", "completed"].includes(orderStatus)
          ? `/track/${encodeURIComponent(order.id)}`
          : isPickup || isExternalManualFlow
            ? `/orders/${encodeURIComponent(order.id)}`
            : `/track/${encodeURIComponent(order.id)}`),
      title: ["delivered", "completed"].includes(orderStatus)
        ? "View the completed order timeline and final delivery state"
        : isPickup || isExternalManualFlow
          ? "View order updates"
          : "View order status and tracking information",
    };
  };

  const getDisplayOrderNumber = (order: Order) => {
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
  };
  const getFulfillmentLabel = (order: Order) => {
    const method = normalize(order.deliveryMethod);
    if (method === "pickup" || method === "store_pickup") return "Pickup";
    if (!isExternalRiderSystemEnabled) {
      if (method === "bus") return "Bus Delivery";
      if (method === "rider") return "Rider Delivery";
      return order.deliveryMethod || "Delivery";
    }
    if (String(order.externalDeliveryType || "").toLowerCase().trim() === "bus" || order.externalDeliveryByBus) {
      return "VIP Bus Delivery";
    }
    return "Third-Party Delivery";
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const paymentButtonConfig = getPaymentButtonConfig(order);
    const orderStatus = getEffectiveOrderStatus(order);
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const displayOrderNumber = getDisplayOrderNumber(order);
    const isPickup = normalize(order.deliveryMethod) === "pickup";
    const isBus =
      normalize(order.deliveryMethod) === "bus" ||
      (isExternalRiderSystemEnabled &&
        (String(order.externalDeliveryType || "").toLowerCase().trim() === "bus" || order.externalDeliveryByBus));
    const verification = order.verificationSummary;
    const showVerificationBlock = ["delivered", "completed"].includes(orderStatus);
    const primaryItem = order.items?.[0];
    const extraItemsCount = Math.max(0, (order.items?.length || 0) - 1);
    const handleCardClick = () => {
      navigate(`/orders/${encodeURIComponent(order.id)}`);
    };

    return (
      <Card
        className="cursor-pointer hover-elevate active-elevate-2 transition-all"
        onClick={handleCardClick}
        data-testid={`order-card-${order.id}`}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="p-2 rounded-lg bg-muted">
                {getStatusIcon(orderStatus, order.deliveryMethod)}
              </div>
              <div className="min-w-0">
                <CardTitle className="text-lg leading-tight">
                  <span className="block truncate" title={`#${displayOrderNumber}`}>
                    #{displayOrderNumber}
                  </span>
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Badge className={`${getStatusColor(orderStatus)} shrink-0 whitespace-nowrap`} data-testid={`badge-status-${order.id}`}>
              {getStatusLabel(orderStatus, order.deliveryMethod)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(order.items?.length || 0) > 0 && (
              <div className="rounded-md border border-border/60 bg-muted/20 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ordered Items
                </p>
                {primaryItem ? (
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-3 text-sm">
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium" title={primaryItem.productName}>
                          {primaryItem.productName}
                        </span>
                        {!!formatItemSelection(primaryItem) && (
                          <span className="block truncate text-xs text-muted-foreground" title={formatItemSelection(primaryItem)}>
                            {formatItemSelection(primaryItem)}
                          </span>
                        )}
                        {extraItemsCount > 0 && (
                          <span className="block text-xs text-muted-foreground">
                            +{extraItemsCount} more item{extraItemsCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 text-muted-foreground">
                        Qty: {primaryItem.quantity}
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-bold text-primary">
                {formatPrice(parseFloat(order.totalAmount))}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment:</span>
              <Badge 
                variant="secondary"
                className={`h-5 gap-1 ${getPaymentStatusColor(paymentStatus)}`}
                data-testid={`badge-payment-status-${order.id}`}
              >
                {getPaymentStatusIcon(paymentStatus)}
                {paymentStatus === "paid"
                  ? "Paid"
                  : paymentStatus === "processing"
                  ? "Processing..."
                  : paymentStatus === "failed"
                  ? "Failed"
                  : "Pending"}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Fulfillment:</span>
              <span className="font-medium">{getFulfillmentLabel(order)}</span>
            </div>
            {showVerificationBlock && (
              <div className="rounded-md border border-muted p-2 text-xs space-y-1">
                <p className="font-semibold text-foreground">Completion Verification</p>
                {isPickup ? (
                  <p className="text-muted-foreground">
                    Seller verified buyer using:{" "}
                    <span className="font-medium text-foreground">
                      {verification?.sellerToBuyer || "Not recorded"}
                    </span>
                  </p>
                ) : isBus ? (
                  <>
                    {!isExternalRiderSystemEnabled ? (
                      <p className="text-muted-foreground">
                        Seller verified rider at pickup:{" "}
                        <span className="font-medium text-foreground">
                          {verification?.sellerToRider || "Not recorded"}
                        </span>
                      </p>
                    ) : null}
                    <p className="text-muted-foreground">
                      VIP bus handoff is monitored by platform operations until final delivery is confirmed.
                    </p>
                  </>
                ) : isExternalRiderSystemEnabled ? null : (
                  <>
                    <p className="text-muted-foreground">
                      Seller verified rider at pickup:{" "}
                      <span className="font-medium text-foreground">
                        {verification?.sellerToRider || "Not recorded"}
                      </span>
                    </p>
                    <p className="text-muted-foreground">
                      Rider verified buyer at delivery:{" "}
                      <span className="font-medium text-foreground">
                        {verification?.riderToBuyer || "Not recorded"}
                      </span>
                    </p>
                  </>
                )}
              </div>
            )}
            {normalize(order.deliveryMethod) !== "pickup" && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Delivery:</span>
                  <span className="font-medium truncate max-w-[200px]">
                    {order.deliveryAddress || "N/A"}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Phone:</span>
                  <span className="font-medium">{order.deliveryPhone || user?.phone || "N/A"}</span>
                </div>
              </>
            )}
            {normalize(order.deliveryMethod) === "pickup" && order.pickupStationInfo?.locationLabel && (
              <>
                <div className="flex justify-between text-sm gap-3">
                  <span className="text-muted-foreground">Pickup Station:</span>
                  <span className="font-medium text-right">
                    {order.pickupStationInfo.locationLabel}
                  </span>
                </div>
                {order.pickupStationInfo.pickupAgentPhone && (
                  <div className="flex justify-between text-sm gap-3">
                    <span className="text-muted-foreground">Pickup Contact:</span>
                    <span className="font-medium text-right">
                      {order.pickupStationInfo.pickupAgentName || "Pickup Agent"} - {order.pickupStationInfo.pickupAgentPhone}
                    </span>
                  </div>
                )}
              </>
            )}
          </div>
            <div className="mt-4">
              <Button
                className="w-full"
                variant={paymentButtonConfig.variant}
                onClick={(e) => {
                  e.stopPropagation();
                  paymentButtonConfig.onClick();
                }}
                disabled={paymentButtonConfig.disabled}
                title={paymentButtonConfig.title}
                data-testid={`button-action-${order.id}`}
              >
                {paymentButtonConfig.label}
              </Button>
            </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex items-center justify-end p-2 border-b bg-background">
          <ThemeToggle />
        </div>
        <Header onCartClick={() => navigate("/cart")} data-testid="header-orders" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading orders...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>

      <Header onCartClick={() => navigate("/cart")} data-testid="header-orders" />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-orders">
              My Orders
            </h1>
            <p className="text-muted-foreground">
              View and track all your orders in one place
            </p>
          </div>

          {/* Finance note — collapsible order total explainer */}
          <Card className="mb-6 border-border/60 bg-card/95">
            <details>
              <summary className="cursor-pointer list-none px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold">Understanding Your Order Amounts</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Expand to see how order totals, statuses, and payment work</p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
                </div>
              </summary>
              <CardContent className="pt-0 space-y-3 text-sm">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <p className="font-medium mb-1">Order Total</p>
                    <p className="text-muted-foreground text-xs">The full amount charged to your payment method. It includes the product price, delivery fee, and a small processing fee, minus any coupon discount you applied.</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <p className="font-medium mb-1">Payment Status</p>
                    <p className="text-muted-foreground text-xs"><strong>Pending</strong> = payment not yet collected. <strong>Processing</strong> = payment received, order being prepared. <strong>Paid</strong> = fully confirmed. <strong>Failed</strong> = payment was not successful.</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <p className="font-medium mb-1">Order Stages</p>
                    <p className="text-muted-foreground text-xs"><strong>Pending</strong> = awaiting payment. <strong>Processing</strong> = paid, seller is preparing. <strong>En Route / Delivered</strong> = dispatch and delivery. <strong>Completed</strong> = order received by you.</p>
                  </div>
                  <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                    <p className="font-medium mb-1">Delivery Fee</p>
                    <p className="text-muted-foreground text-xs">Covers the cost of getting your items from the seller to your door or pickup station. This goes to the rider or logistics provider, not to the platform.</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border/50 bg-background/60 px-3 py-2">
                  <strong>Formula:</strong> Order Total = Product Subtotal + Delivery Fee + Processing Fee − Coupon Discount. No hidden charges beyond what is shown at checkout.
                </p>
              </CardContent>
            </details>
          </Card>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1">
              <TabsTrigger value="all" data-testid="tab-all">
                {getOrderFlowLabel("all")} ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">
                {getOrderFlowLabel("pending")} ({filterOrdersByStatus("pending").length})
              </TabsTrigger>
              <TabsTrigger value="processing" data-testid="tab-processing">
                {getFilterProcessingLabel()} ({filterOrdersByStatus("processing").length})
              </TabsTrigger>
              <TabsTrigger value="delivered" data-testid="tab-delivered">
                {getFilterCompletedLabel()} ({filterOrdersByStatus("delivered").length})
              </TabsTrigger>
              <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                {getOrderFlowLabel("cancelled")} ({filterOrdersByStatus("cancelled").length})
              </TabsTrigger>
            </TabsList>

            {["all", "pending", "processing", "delivered", "cancelled"].map((status) => (
              <TabsContent key={status} value={status} className="mt-6">
                {filterOrdersByStatus(status).length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No {status === "all" ? "" : getOrderFlowLabel(status).toLowerCase()} orders
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {status === "all"
                        ? "You haven't placed any orders yet"
                        : `You don't have any ${getOrderFlowLabel(status).toLowerCase()} orders`}
                    </p>
                    <Button onClick={() => navigate("/")} data-testid="button-shop-now">
                      Start Shopping
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filterOrdersByStatus(status).map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
