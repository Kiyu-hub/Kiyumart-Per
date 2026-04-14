import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import ThemeToggle from "@/components/ThemeToggle";
import OrderStatusTimeline from "@/components/OrderStatusTimeline";
import OrderStatusBadge from "@/components/OrderStatusBadge";
import DeliveryMap from "@/components/DeliveryMap";
import { ArrowLeft, Search, Filter, Loader2, Navigation } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { io, Socket } from "socket.io-client";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { PageLoadingState } from "@/components/ui/loading-state";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: "pickup" | "bus" | "rider" | string;
  totalAmount: number;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryPhone: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
  externalDeliveryType?: string | null;
  externalDeliveryByBus?: boolean;
  qrCode: string;
  deliveryOtp?: string | null;
  pickupOtp?: string | null;
  busDeliveryWorkflow?: {
    stage?: string;
    proofSubmitted?: boolean;
  } | null;
  pickupStationInfo?: {
    id?: string | null;
    name?: string | null;
    city?: string | null;
    region?: string | null;
    locationLabel?: string | null;
    pickupAgentName?: string | null;
    pickupAgentPhone?: string | null;
  } | null;
  createdAt: string;
  deliveredAt?: string;
  updatedAt?: string;
}

interface RiderLocation {
  orderId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

export default function OrderTracking() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const pathname = useMemo(() => location.split("?")[0] || "", [location]);
  const searchParams = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const trackPathMatch = useMemo(() => pathname.match(/^\/track\/([^/?#]+)/), [pathname]);
  const requestedOrderId = trackPathMatch?.[1]
    ? decodeURIComponent(trackPathMatch[1])
    : searchParams.get("orderId");
  const isOrderDetailsMode = Boolean(requestedOrderId);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riderLocations, setRiderLocations] = useState<Map<string, RiderLocation>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(isOrderDetailsMode ? "/orders" : "/");
  };
  const normalizeStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "created") return "pending";
    if (s === "ready_for_pickup") return "ready";
    if (s === "assigned_to_rider") return "assigned";
    if (s === "out_for_delivery" || s === "delivering") return "en_route";
    if (s === "external_dispatch_arranged") return "processing";
    if (isExternalRiderSystemEnabled && (s === "rider_arrived" || s === "delivered")) return "completed";
    return s || "pending";
  };
  const normalizeDeliveryMethod = (value?: string) => (value || "").toLowerCase().trim();
  const isPickupMethod = (value?: string) => {
    const method = normalizeDeliveryMethod(value);
    return method === "pickup" || method === "store_pickup" || method === "store pickup";
  };
  const getBusStage = (order?: Order | null) => String(order?.busDeliveryWorkflow?.stage || "").toUpperCase();
  const getFulfillmentLabel = (order: Order) => {
    const method = normalizeDeliveryMethod(order.deliveryMethod);
    if (isPickupMethod(order.deliveryMethod)) return "Pickup";
    if (!isExternalRiderSystemEnabled) {
      if (method === "bus") return "Bus Delivery";
      if (method === "rider") return "Rider Delivery";
      return order.deliveryMethod || "Delivery";
    }
    if (String(order.externalDeliveryType || "").toLowerCase().trim() === "bus" || order.externalDeliveryByBus || method === "bus") {
      return "VIP Bus Delivery";
    }
    return "Third-Party Delivery";
  };
  const toCustomerStatus = (value?: string, deliveryMethod?: string) => {
    const s = normalizeStatus(value);
    const isPickup = isPickupMethod(deliveryMethod);
    const isBus = normalizeDeliveryMethod(deliveryMethod) === "bus";
    if (["pending"].includes(s)) return "pending";
    if (isBus) {
      if (["searching_rider", "confirmed", "ready", "processing", "assigned", "rider_arrived"].includes(s)) {
        return "processing";
      }
      if (["picked_up", "in_transit", "en_route", "delivered"].includes(s)) {
        return "en_route";
      }
      if (["completed"].includes(s)) return "delivered";
      if (["cancelled", "disputed"].includes(s)) return s;
      return "pending";
    }
    if (isPickup) {
      if (s === "packaged") return "packaged";
      if (["searching_rider", "confirmed", "processing", "assigned", "rider_arrived"].includes(s)) return "processing";
      if (s === "ready") return "en_route";
      if (["picked_up", "in_transit", "en_route"].includes(s)) return "processing";
      if (["delivered", "completed"].includes(s)) return "completed";
      if (["cancelled", "disputed"].includes(s)) return s;
      return "pending";
    }
    if (["searching_rider", "confirmed", "ready", "processing", "assigned", "rider_arrived"].includes(s)) return "processing";
    if (["picked_up", "in_transit", "en_route"].includes(s)) return "en_route";
    if (["delivered", "completed"].includes(s)) return "delivered";
    if (["cancelled", "disputed"].includes(s)) return s;
    return "pending";
  };
  const toCustomerStatusLabel = (value?: string, deliveryMethod?: string) => {
    const s = toCustomerStatus(value, deliveryMethod);
    const isPickup = isPickupMethod(deliveryMethod);
    const isBus = normalizeDeliveryMethod(deliveryMethod) === "bus";
    switch (s) {
      case "pending":
        return "Pending";
      case "processing":
        return isPickup ? "Preparing Order" : isBus ? "Preparing BUS Handoff" : "Preparing Delivery";
      case "packaged":
        return "Packaged";
      case "en_route":
        return isPickup ? "Ready for Pickup" : isBus ? "In Transit (Bus)" : "On the Way";
      case "completed":
        return "Completed";
      case "delivered":
        return isPickup ? "Completed" : !isPickup && isExternalRiderSystemEnabled ? "Completed" : "Delivered";
      case "cancelled":
        return "Cancelled";
      case "disputed":
        return "Disputed";
      default:
        return "Pending";
    }
  };

  // Redirect to auth if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  // Initialize Socket.IO connection for real-time order updates
  useEffect(() => {
    if (!user) return;

    const socket = io({
      auth: { userId: user.id }
    });

    socket.on("connect", () => {
      console.log("Socket connected for order tracking");
      socket.emit("register", user.id);
    });

    socket.on("order_status_updated", (data: { orderId: string; orderNumber: string; status: string; updatedAt: string }) => {
      console.log("Order status updated:", data);
      
      // Invalidate and refetch orders
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      
      // Show toast notification
      toast({
        title: "Order Status Updated",
        description: `Order #${data.orderNumber} status updated to ${toCustomerStatusLabel(data.status)}`,
      });
    });

    // Listen for real-time rider location updates
    if (!isExternalRiderSystemEnabled) {
      socket.on("rider_location_updated", (data: { orderId: string; orderNumber: string; latitude: string; longitude: string; timestamp: string }) => {
        console.log("Rider location updated:", data);
        
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        
        if (!isNaN(lat) && !isNaN(lng)) {
          setRiderLocations(prev => {
            const updated = new Map(prev);
            updated.set(data.orderId, {
              orderId: data.orderId,
              latitude: lat,
              longitude: lng,
              timestamp: data.timestamp,
            });
            return updated;
          });
          
          toast({
            title: "Delivery Location Updated",
            description: `Order #${data.orderNumber} delivery progress has been updated`,
          });
        }
      });
    }

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [isExternalRiderSystemEnabled, user?.id, toast]);

  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: !authLoading && !!user,
  });

  // Fetch initial rider locations for orders out for delivery
  useEffect(() => {
    if (isExternalRiderSystemEnabled || !orders || orders.length === 0) return;

    const fetchRiderLocations = async () => {
      const liveTrackingStatuses = new Set(["in_transit", "en_route"]);
      const enRouteOrders = orders.filter(order =>
        normalizeDeliveryMethod(order.deliveryMethod) === "rider" &&
        liveTrackingStatuses.has(normalizeStatus(order.status))
      );
      
      for (const order of enRouteOrders) {
        try {
          const response = await fetch(`/api/delivery-tracking/${order.id}`, {
            credentials: "include",
          });
          
          if (response.ok) {
            const data = await response.json();
            const lat = parseFloat(data.latitude);
            const lng = parseFloat(data.longitude);
            
            // Only update if coordinates are valid
            if (!isNaN(lat) && !isNaN(lng)) {
              setRiderLocations(prev => {
                const updated = new Map(prev);
                updated.set(order.id, {
                  orderId: order.id,
                  latitude: lat,
                  longitude: lng,
                  timestamp: data.timestamp,
                });
                return updated;
              });
            }
          }
        } catch (error) {
          console.error(`Failed to fetch rider location for order ${order.id}:`, error);
        }
      }
    };

    fetchRiderLocations();
  }, [isExternalRiderSystemEnabled, orders]);

  // Filter orders based on search and status
  const referencedOrder = requestedOrderId
    ? orders.find((order) => order.id === requestedOrderId || order.orderNumber === requestedOrderId) ?? null
    : null;

  const filteredOrders = isOrderDetailsMode
    ? referencedOrder
      ? [referencedOrder]
      : []
    : orders.filter((order) => {

        const normalized = normalizeStatus(order.status);
        const customerStatus = toCustomerStatus(order.status, order.deliveryMethod);
        const address = normalizeDeliveryMethod(order.deliveryMethod) === "pickup" ? "" : (order.deliveryAddress || "");
        const city = order.deliveryCity || "";
        const matchesSearch = 
          searchQuery === "" ||
          order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
          address.toLowerCase().includes(searchQuery.toLowerCase()) ||
          city.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesStatus = statusFilter === "all" || customerStatus === statusFilter;

        return matchesSearch && matchesStatus;
      });

  const hasOrders = orders.length > 0;

  if (authLoading) {
    return <PageLoadingState title="Loading order tracking" description="Preparing your account and recent order activity." />;
  }

  if (!user) {
    return null;
  }

  if (isLoading) {
    return <PageLoadingState title="Loading orders" description="Fetching the latest tracking updates for your orders." />;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-destructive">Error loading orders. Please try again.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={goBack}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-2xl font-bold" data-testid="text-heading">
              {isOrderDetailsMode ? "Order Tracking" : "Track Your Orders"}
            </h1>
          </div>
          <ThemeToggle />
        </header>

      <main className="flex-1 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {!hasOrders ? (
            <Card className="p-8 text-center" data-testid="card-no-orders">
              <p className="text-lg text-muted-foreground">No orders found</p>
              <Button onClick={() => navigate("/")} className="mt-4" data-testid="button-start-shopping">
                Start Shopping
              </Button>
            </Card>
          ) : (
            <>
              {!isOrderDetailsMode && (
                <Card className="p-4" data-testid="card-filters">
                  <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-1">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by order number or address..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-10"
                          data-testid="input-search"
                        />
                      </div>
                    </div>
                    <div className="w-full md:w-48">
                      <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger data-testid="select-status-filter">
                          <Filter className="h-4 w-4 mr-2" />
                          <SelectValue placeholder="Filter by status" />
                        </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Orders</SelectItem>
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="processing">Preparing Delivery</SelectItem>
                            <SelectItem value="en_route">On the Way</SelectItem>
                            <SelectItem value="delivered">Delivered / Completed</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                          <SelectItem value="disputed">Disputed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </Card>
              )}

              {!isOrderDetailsMode && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                    {filteredOrders.length === orders.length 
                      ? `${orders.length} order${orders.length === 1 ? '' : 's'}`
                      : `${filteredOrders.length} of ${orders.length} order${orders.length === 1 ? '' : 's'}`
                    }
                  </p>
                </div>
              )}

              {/* Orders List */}
              {filteredOrders.length === 0 ? (
                  <Card className="p-8 text-center" data-testid="card-no-results">
                    <p className="text-lg text-muted-foreground">
                      {isOrderDetailsMode ? "The selected order could not be resolved." : "No orders match your filters"}
                    </p>
                    {isOrderDetailsMode ? (
                      <Button
                        variant="outline"
                        onClick={() => navigate("/orders")}
                        className="mt-4"
                        data-testid="button-back-to-orders"
                      >
                        Back to Orders
                      </Button>
                    ) : (
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setSearchQuery("");
                          setStatusFilter("all");
                        }} 
                        className="mt-4"
                        data-testid="button-clear-filters"
                      >
                        Clear Filters
                      </Button>
                    )}
                  </Card>
              ) : (
                <div className="space-y-6">
                  {filteredOrders.map((order) => (
                    (() => {
                      const isPickup = isPickupMethod(order.deliveryMethod);
                      const isBus =
                        normalizeDeliveryMethod(order.deliveryMethod) === "bus" ||
                        (isExternalRiderSystemEnabled &&
                          (String(order.externalDeliveryType || "").toLowerCase().trim() === "bus" || order.externalDeliveryByBus));
                      const isManualExternalDelivery =
                        isExternalRiderSystemEnabled &&
                        !isPickup &&
                        (String(order.externalDeliveryType || "").toLowerCase().trim() === "third_party" ||
                          String(order.externalDeliveryType || "").toLowerCase().trim() === "bus" ||
                          order.externalDeliveryByBus);
                      const busStage = getBusStage(order);
                      const statusForDisplay = isBus ? toCustomerStatus(order.status, order.deliveryMethod) : order.status;
                      const resolvedOtp = isPickup
                        ? (order.pickupOtp || order.deliveryOtp || null)
                        : (order.deliveryOtp || order.pickupOtp || null);
                      const otpLabel = isPickup ? "Pickup OTP" : "Delivery OTP";
                      return (
                    <Card key={order.id} className="overflow-hidden" data-testid={`card-order-${order.id}`}>
                      <CardHeader className="bg-muted/30 pb-4">
                        <div className="flex justify-between items-start flex-wrap gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Order Number</p>
                            <p className="text-lg font-semibold" data-testid={`text-order-number-${order.id}`}>
                              #{order.orderNumber}
                            </p>
                          </div>
                          <OrderStatusBadge status={statusForDisplay} deliveryMethod={order.deliveryMethod} />
                        </div>
                      </CardHeader>

                      <CardContent className="pt-6 space-y-6">
                        {/* Order Status Timeline */}
                        <div>
                          <h3 className="text-sm font-medium mb-4">Order Progress</h3>
                          <OrderStatusTimeline 
                            currentStatus={statusForDisplay}
                            deliveryMethod={order.deliveryMethod}
                            busDeliveryWorkflow={order.busDeliveryWorkflow}
                            createdAt={order.createdAt}
                            updatedAt={order.updatedAt}
                            deliveredAt={order.deliveredAt}
                          />
                        </div>

                        {/* Order Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                          <div>
                            <p className="text-sm text-muted-foreground">Fulfillment Method</p>
                            <p className="font-medium capitalize" data-testid={`text-fulfillment-${order.id}`}>
                              {getFulfillmentLabel(order)}
                            </p>
                            {isBus && (
                              <p className="text-xs text-muted-foreground mt-1">
                                BUS Stage: <span className="font-medium text-foreground">{busStage || "READY"}</span>
                              </p>
                            )}
                            {!isPickupMethod(order.deliveryMethod) && (
                              <>
                                <p className="text-sm text-muted-foreground mt-2">Delivery Address</p>
                                <p className="font-medium" data-testid={`text-address-${order.id}`}>
                                  {order.deliveryAddress}
                                </p>
                                <p className="text-sm">{order.deliveryCity}</p>
                              </>
                            )}
                            {isPickupMethod(order.deliveryMethod) && order.pickupStationInfo?.locationLabel && (
                              <>
                                <p className="text-sm text-muted-foreground mt-2">Pickup Station</p>
                                <p className="font-medium">{order.pickupStationInfo.locationLabel}</p>
                                {order.pickupStationInfo.pickupAgentPhone && (
                                  <p className="text-sm text-muted-foreground">
                                    Contact {order.pickupStationInfo.pickupAgentName || "Pickup Agent"}: {order.pickupStationInfo.pickupAgentPhone}
                                  </p>
                                )}
                              </>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-sm text-muted-foreground">Total Amount</p>
                              <p className="text-lg font-semibold" data-testid={`text-amount-${order.id}`}>
                                {formatPrice(parseFloat(order.totalAmount as any || "0"))}
                              </p>
                            </div>
                            <div>
                              <p className="text-sm text-muted-foreground">Order Date</p>
                              <p className="text-sm" data-testid={`text-date-${order.id}`}>
                                {format(new Date(order.createdAt), 'MMM d, yyyy')}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {format(new Date(order.createdAt), 'h:mm a')}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Live Delivery Map for in-transit deliveries */}
                        {!isExternalRiderSystemEnabled &&
                         normalizeDeliveryMethod(order.deliveryMethod) === "rider" &&
                         ["in_transit", "en_route"].includes(normalizeStatus(order.status)) && order.deliveryLatitude != null && order.deliveryLongitude != null && 
                         !isNaN(parseFloat(order.deliveryLatitude)) && !isNaN(parseFloat(order.deliveryLongitude)) && (
                          <div className="pt-4 border-t space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-medium">Live Rider Tracking</h3>
                              <Button
                                onClick={() => navigate(`/live-tracking?orderId=${order.id}`)}
                                variant="default"
                                size="sm"
                                data-testid={`button-live-tracking-${order.id}`}
                              >
                                <Navigation className="h-4 w-4 mr-2" />
                                Open Live Map
                              </Button>
                            </div>
                            <DeliveryMap
                              orderId={order.id}
                              deliveryLocation={{
                                latitude: parseFloat(order.deliveryLatitude),
                                longitude: parseFloat(order.deliveryLongitude),
                                address: `${order.deliveryAddress}, ${order.deliveryCity}`,
                              }}
                              riderLocation={riderLocations.get(order.id)}
                              orderNumber={order.orderNumber}
                            />
                          </div>
                        )}

                        {/* Verification Codes */}
                        {!isBus && !isManualExternalDelivery && order.status !== "cancelled" && (order.qrCode || resolvedOtp) && (
                          <div className="pt-4 border-t">
                            <p className="text-sm font-medium mb-3">
                              {isPickupMethod(order.deliveryMethod)
                                ? "Pickup Verification QR Code"
                                : "Delivery Confirmation QR Code"}
                            </p>
                            <div className="flex justify-center bg-muted/30 p-6 rounded-lg">
                              <div className="text-center">
                                {order.qrCode ? (
                                  <>
                                    <QRCodeDisplay
                                      value={order.qrCode}
                                      title=""
                                        description={
                                          isPickupMethod(order.deliveryMethod)
                                            ? "Show this QR code to the pickup station agent when collecting your order"
                                            : isExternalRiderSystemEnabled
                                              ? "Show this QR code to the delivery contact handling your order confirmation"
                                              : "Show this QR code to the delivery rider to confirm receipt"
                                        }
                                    />
                                    <p className="text-xs text-muted-foreground mt-2" data-testid={`text-qr-value-${order.id}`}>
                                      {order.qrCode}
                                    </p>
                                  </>
                                ) : (
                                  <p className="text-sm text-muted-foreground">QR code is being prepared. You can use OTP below.</p>
                                )}
                                {resolvedOtp && (
                                  <p className="text-sm font-semibold mt-3" data-testid={`text-order-otp-${order.id}`}>
                                    {otpLabel}: {resolvedOtp}
                                  </p>
                                )}
                                <p className="text-xs text-muted-foreground mt-3 max-w-md">
                                  {isPickupMethod(order.deliveryMethod)
                                    ? "At store pickup, present either this QR code or your Pickup OTP to the pickup station agent for confirmation."
                                    : isExternalRiderSystemEnabled
                                      ? "At delivery, present either this QR code or your Delivery OTP to the delivery contact handling the handoff."
                                      : "At delivery, show either this QR code or your Delivery OTP to the rider to confirm receipt."}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                      );
                    })()
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
