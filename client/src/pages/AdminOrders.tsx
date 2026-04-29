import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSocket } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Search, Eye, Package, ArrowLeft, TrendingUp, Clock, CheckCircle, XCircle, Truck, Filter, RefreshCw, AlertTriangle, DollarSign, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PageLoadingState, SectionLoadingState } from "@/components/ui/loading-state";
import { apiRequest, fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  riderId?: string;
  total: string;
  subtotal: string;
  deliveryFee: string;
  processingFee: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  updatedAt?: string;
  deliveredAt?: string;
  deliveryMethod: string;
  externalDeliveryByBus?: boolean;
  externalDeliveryType?: string | null;
  qrCode?: string | null;
  pickupOtp?: string | null;
  deliveryAddress?: string;
  deliveryPhone?: string;
  buyer?: { id: string; name: string; email?: string; phone?: string };
  customerInfo?: { name?: string; email?: string; phone?: string; address?: string | null };
  seller?: { id: string; name: string; storeName?: string | null };
  rider?: { id: string; name: string };
  verificationSummary?: {
    sellerToRider?: string | null;
    riderToBuyer?: string | null;
    sellerToBuyer?: string | null;
  };
  busDeliveryWorkflow?: {
    stage?: string;
    proofSubmitted?: boolean;
    proof?: {
      receiptImageUrl?: string | null;
      driverPhone?: string | null;
      busNumber?: string | null;
      stationName?: string | null;
      submittedAt?: string | null;
    } | null;
  } | null;
  items?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price?: string;
    selectedColor?: string | null;
    selectedSize?: string | null;
    image?: string | null;
  }>;
}

interface OrderStats {
  total: number;
  pending: number;
  processing: number;
  enRoute: number;
  delivered: number;
  pickups: number;
  cancelled: number;
  totalRevenue: number;
  todayOrders: number;
}

interface AvailableRider {
  rider: {
    id: string;
    name: string;
    email: string;
  };
  activeOrderCount: number;
}

const normalizePaymentStatus = (value?: string) => {
  const s = (value || "").toLowerCase().trim();
  if (s === "payment_pending") return "pending";
  if (s === "payment_failed") return "failed";
  if (s === "completed" || s === "paid") return "paid";
  return s || "pending";
};

const normalizeExternalOrderStatus = (value?: string) => {
  const status = String(value || "").toLowerCase().trim();
  if (status === "searching_rider" || status === "assigned") {
    return "external_dispatch_arranged";
  }
  if (status === "rider_arrived" || status === "delivered") {
    return "completed";
  }
  if (status === "external_dispatch_arranged") {
    return "external_dispatch_arranged";
  }
  if (["picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
    return "en_route";
  }
  return status;
};

const getExternalDeliveryMethodLabel = (value?: string) => {
  const method = String(value || "").toLowerCase().trim();
  return method === "rider" ? "delivery" : value || "delivery";
};

const getExternalDeliveryTypeLabel = (orderLike?: { externalDeliveryType?: string | null; externalDeliveryByBus?: boolean | null }) => {
  const normalizedType = String(orderLike?.externalDeliveryType || "").toLowerCase().trim();
  if (normalizedType === "bus" || orderLike?.externalDeliveryByBus) {
    return "VIP Bus Delivery";
  }
  if (normalizedType === "third_party") {
    return "Third-Party Delivery (Yango, Uber, Bolt)";
  }
  return "Third-Party Delivery (Yango, Uber, Bolt)";
};

const normalizeOrderStatusValue = (value?: string) => (value || "").toLowerCase().trim();

const isPickupOrderMethod = (value?: string) => {
  const method = normalizeOrderStatusValue(value);
  return method === "pickup" || method === "store_pickup" || method === "store pickup";
};

const getEffectiveOrderStatus = (order: Order, showInternalRiderFeatures: boolean) => {
  const baseStatus = showInternalRiderFeatures
    ? normalizeOrderStatusValue(order.status)
    : normalizeExternalOrderStatus(order.status);
  const paymentStatus = normalizePaymentStatus(order.paymentStatus);
  if (
    paymentStatus !== "paid" &&
    !["completed", "delivered", "cancelled", "refunded"].includes(baseStatus)
  ) {
    return "pending";
  }
  return baseStatus;
};

const getAllowedAdminStatusOptions = ({
  currentStatus,
  role,
  isExternalRiderSystemEnabled,
  isPickupOrder,
}: {
  currentStatus?: string;
  role?: string;
  isExternalRiderSystemEnabled: boolean;
  isPickupOrder: boolean;
}) => {
  const current = String(currentStatus || "").toLowerCase().trim();
  const actorRole = String(role || "").toLowerCase().trim();
  if (!["admin", "super_admin"].includes(actorRole)) return [];
  if (isPickupOrder) return [];

  const options = new Set<string>();
  const add = (value?: string) => {
    const normalized = String(value || "").toLowerCase().trim();
    if (normalized) options.add(normalized);
  };

  add(current);

  switch (current) {
    case "created":
    case "pending":
      add("confirmed");
      add("processing");
      add("cancelled");
      break;
    case "confirmed":
      add("ready");
      add("processing");
      add("cancelled");
      break;
    case "processing":
      add("ready");
      if (!isExternalRiderSystemEnabled) {
        add("assigned");
        add("en_route");
      }
      add("cancelled");
      break;
    case "ready":
      if (isExternalRiderSystemEnabled) {
        add("external_dispatch_arranged");
      } else {
        add("processing");
        add("searching_rider");
      }
      add("cancelled");
      break;
    case "external_dispatch_arranged":
      if (actorRole === "super_admin") add("completed");
      add("cancelled");
      break;
    case "en_route":
      if (isExternalRiderSystemEnabled && actorRole === "super_admin") add("completed");
      add("cancelled");
      break;
    case "assigned":
      add("rider_arrived");
      add("cancelled");
      break;
    case "rider_arrived":
      add("cancelled");
      break;
    case "picked_up":
      add("in_transit");
      add("en_route");
      break;
    case "in_transit":
      add("en_route");
      break;
    case "delivered":
      if (actorRole === "super_admin") add("completed");
      break;
    case "disputed":
      add("delivered");
      add("cancelled");
      break;
    default:
      break;
  }

  return Array.from(options);
};

const getStatusOptionLabel = (status?: string) => {
  const value = String(status || "").toLowerCase().trim();
  switch (value) {
    case "created":
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "processing":
      return "Processing";
    case "ready":
      return "Ready";
    case "searching_rider":
      return "Searching Rider";
    case "assigned":
      return "Assigned";
    case "rider_arrived":
      return "Completed";
    case "picked_up":
      return "Picked Up";
    case "in_transit":
      return "In Transit";
    case "en_route":
      return "Out for Delivery";
    case "external_dispatch_arranged":
      return "External Dispatch Arranged";
    case "delivered":
      return "Delivered";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "disputed":
      return "Disputed";
    default:
      return status || "Status";
  }
};

function ViewOrderDialog({ 
  orderId, 
  open, 
  onOpenChange 
}: { 
  orderId: string; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const [pickupVerificationQr, setPickupVerificationQr] = useState("");
  const [pickupVerificationOtp, setPickupVerificationOtp] = useState("");
  const formatItemSelection = (item: { selectedColor?: string | null; selectedSize?: string | null }) => {
    const parts = [
      item.selectedColor ? `Color: ${item.selectedColor}` : null,
      item.selectedSize ? `Size: ${item.selectedSize}` : null,
    ].filter(Boolean);
    return parts.join(" • ");
  };

  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      return res.json();
    },
    enabled: open,
  });

  const { data: availableRiders = [], isLoading: ridersLoading } = useQuery<AvailableRider[]>({
    queryKey: ["/api/riders/available"],
    queryFn: async () => {
      const res = await fetch("/api/riders/available", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch available riders");
      return res.json();
    },
    enabled: open && !isExternalRiderSystemEnabled,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/status`, { status });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Order status updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update order status",
        variant: "destructive",
      });
    },
  });

  const assignRiderMutation = useMutation({
    mutationFn: async (riderId: string) => {
      return apiRequest("PATCH", `/api/orders/${orderId}/assign-rider`, { riderId });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Rider assigned successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign rider",
        variant: "destructive",
      });
    },
  });

  const arrangeExternalDeliveryMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/orders/${orderId}/arrange-external-delivery`, {});
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "External delivery arranged successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to arrange external delivery",
        variant: "destructive",
      });
    },
  });
  const markExternalDeliveredMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/admin/orders/${orderId}/mark-external-delivered`, {});
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "External delivery marked as completed",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark external delivery as completed",
        variant: "destructive",
      });
    },
  });
  const completeBusOrderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${orderId}/bus-complete`, {});
    },
    onSuccess: () => {
      toast({
        title: "VIP Bus order completed",
        description: "Super admin verification completed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Completion failed",
        description: error.message || "Failed to complete VIP Bus order",
        variant: "destructive",
      });
    },
  });
  const verifyCustomerPickupMutation = useMutation({
    mutationFn: async ({ qrCode, otp }: { qrCode?: string; otp?: string }) => {
      return apiRequest("POST", `/api/orders/${orderId}/verify-customer-pickup`, { qrCode, otp });
    },
    onSuccess: () => {
      toast({
        title: "Pickup verified",
        description: "Pickup completed successfully using the provided verification method.",
      });
      setPickupVerificationQr("");
      setPickupVerificationOtp("");
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Failed to verify pickup",
        variant: "destructive",
      });
    },
  });

  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const isPickupMethod = (value?: string) => {
    const method = normalize(value);
    return method === "pickup" || method === "store_pickup" || method === "store pickup";
  };
  const status = normalize(orderDetails?.status);
  const isPickupOrder = isPickupMethod(orderDetails?.deliveryMethod);
  const isBusDelivery = normalize(orderDetails?.deliveryMethod) === "bus";
  const isAgentViewer = user?.role === "agent";
  const canVerifyPickup =
    isPickupOrder &&
    ["pickup_agent", "admin", "super_admin"].includes(String(user?.role || "")) &&
    status === "ready";
  const canArrangeExternalDelivery = user?.role === "admin" || user?.role === "super_admin";
  const canManuallyCompleteExternalDelivery = user?.role === "super_admin";
  const showArrangeExternalDelivery =
    isExternalRiderSystemEnabled &&
    !isPickupOrder &&
    status === "ready" &&
    (user?.role === "admin" || user?.role === "super_admin" || user?.role === "agent");
  const showManualExternalDeliveredButton =
    isExternalRiderSystemEnabled &&
    !isPickupMethod(orderDetails?.deliveryMethod) &&
    ["external_dispatch_arranged", "en_route", "delivered", "rider_arrived"].includes(status) &&
    canManuallyCompleteExternalDelivery;
  const busStage = String(orderDetails?.busDeliveryWorkflow?.stage || "").toUpperCase();
  const paymentStatus = normalizePaymentStatus(orderDetails?.paymentStatus);
  const sellerActionRequired =
    !isPickupMethod(orderDetails?.deliveryMethod) &&
    ((paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) ||
      ["paid", "processing", "preparing", "confirmed"].includes(status));
  const allowedStatusOptions = getAllowedAdminStatusOptions({
    currentStatus: orderDetails?.status,
    role: user?.role,
    isExternalRiderSystemEnabled,
    isPickupOrder,
  });

  useEffect(() => {
    if (!open) {
      setPickupVerificationQr("");
      setPickupVerificationOtp("");
    }
  }, [open, orderId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription>
            View and manage order information
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <SectionLoadingState title="Loading order details" description="Preparing the latest order summary, payment state, and action controls." lines={2} className="border-0 shadow-none" />
        ) : orderDetails ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Order Number</p>
                <p className="font-semibold">#{orderDetails.orderNumber}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Status</p>
                <Select
                  defaultValue={orderDetails.status}
                  onValueChange={(value) => updateStatusMutation.mutate(value)}
                  disabled={updateStatusMutation.isPending || isBusDelivery || isAgentViewer || allowedStatusOptions.length <= 1}
                >
                  <SelectTrigger data-testid="select-order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedStatusOptions.map((option) => (
                      <SelectItem key={option} value={option}>
                        {getStatusOptionLabel(option)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isBusDelivery && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    BUS lifecycle is controlled by proof submission and super admin completion.
                  </p>
                )}
                {isAgentViewer && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Customer agents can review order progress here, but status updates are restricted to admin roles.
                  </p>
                )}
                {!isAgentViewer && !isBusDelivery && allowedStatusOptions.length <= 1 && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    No direct status change is available here for the current order state.
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Payment Status</p>
                {(() => {
                  const paymentStatusLabel = normalizePaymentStatus(orderDetails.paymentStatus);
                  return (
                    <Badge className={paymentStatusLabel === "paid" ? "bg-green-500" : "bg-yellow-500"}>
                      {paymentStatusLabel}
                    </Badge>
                  );
                })()}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Delivery Method</p>
                <p className="font-semibold">
                  {isExternalRiderSystemEnabled
                    ? getExternalDeliveryMethodLabel(orderDetails.deliveryMethod)
                    : orderDetails.deliveryMethod}
                </p>
                {isExternalRiderSystemEnabled && orderDetails.deliveryMethod !== "pickup" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    External type: {getExternalDeliveryTypeLabel(orderDetails)}
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date</p>
                <p className="font-semibold">{new Date(orderDetails.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total</p>
                <p className="font-semibold text-primary">{formatPrice(parseFloat(orderDetails.total))}</p>
              </div>
            </div>

            {!isExternalRiderSystemEnabled && ["rider", "bus"].includes(normalize(orderDetails.deliveryMethod)) && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Assign Rider</p>
                <div className={sellerActionRequired ? "opacity-60 blur-[1px] pointer-events-none select-none" : ""}>
                  <Select
                    defaultValue={orderDetails.riderId || ""}
                    onValueChange={(value) => assignRiderMutation.mutate(value)}
                    disabled={sellerActionRequired || assignRiderMutation.isPending || ridersLoading}
                  >
                    <SelectTrigger data-testid="select-rider">
                      <SelectValue placeholder={ridersLoading ? "Loading riders..." : orderDetails.riderId ? "Rider assigned" : "Select a rider"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRiders.length === 0 && !ridersLoading && (
                        <div className="px-2 py-3 text-sm text-muted-foreground text-center">
                          No available riders
                        </div>
                      )}
                      {availableRiders.map((item) => (
                        <SelectItem key={item.rider.id} value={item.rider.id}>
                          {item.rider.name} ({item.activeOrderCount} active orders)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {sellerActionRequired && (
                  <div className="mt-2 rounded-md border border-orange-500/30 bg-orange-500/10 px-3 py-2">
                    <p className="text-xs text-orange-200">
                      Seller action required first. Rider assignment unlocks after seller marks the order ready for dispatch.
                    </p>
                  </div>
                )}
              </div>
            )}

            {showArrangeExternalDelivery && (
              <div className="border-t pt-4">
                <Button
                  onClick={() => arrangeExternalDeliveryMutation.mutate()}
                  disabled={arrangeExternalDeliveryMutation.isPending || !canArrangeExternalDelivery}
                  data-testid="button-arrange-external-delivery"
                >
                  {arrangeExternalDeliveryMutation.isPending ? "Arranging..." : "Arrange External Delivery"}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  {canArrangeExternalDelivery
                    ? "This marks the order as manually arranged with a third-party delivery service."
                    : "Visible for review here. Only admin or super admin can send the external delivery arrangement."}
                </p>
              </div>
            )}

            {showManualExternalDeliveredButton && (
              <div className="border-t pt-4">
                <Button
                  onClick={() => markExternalDeliveredMutation.mutate()}
                  disabled={markExternalDeliveredMutation.isPending || !canManuallyCompleteExternalDelivery}
                  data-testid="button-mark-external-delivered"
                >
                  {markExternalDeliveredMutation.isPending ? "Marking..." : "Mark Delivered (Manual External Delivery)"}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-2">
                  Super admin manually confirms final delivery here for the external/manual delivery flow.
                </p>
              </div>
            )}

            {isBusDelivery && (
              <div className="border-t pt-4 space-y-3">
                <div className="rounded-md border border-cyan-400/40 bg-cyan-500/10 px-3 py-2">
                  <p className="text-xs font-medium text-cyan-100">
                    BUS Stage: {busStage || "READY"}
                  </p>
                </div>
                {orderDetails.busDeliveryWorkflow?.proof ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <p>
                      Driver Phone:{" "}
                      <span className="font-semibold">{orderDetails.busDeliveryWorkflow.proof.driverPhone || "N/A"}</span>
                    </p>
                    <p>
                      Bus Number:{" "}
                      <span className="font-semibold">{orderDetails.busDeliveryWorkflow.proof.busNumber || "N/A"}</span>
                    </p>
                    <p>
                      Station:{" "}
                      <span className="font-semibold">{orderDetails.busDeliveryWorkflow.proof.stationName || "N/A"}</span>
                    </p>
                    <p>
                      Submitted:{" "}
                      <span className="font-semibold">{orderDetails.busDeliveryWorkflow.proof.submittedAt || "N/A"}</span>
                    </p>
                    {orderDetails.busDeliveryWorkflow.proof.receiptImageUrl && (
                      <a
                        href={orderDetails.busDeliveryWorkflow.proof.receiptImageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline md:col-span-2"
                      >
                        View Transport Receipt
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No BUS transport proof submitted yet.</p>
                )}
                {user?.role === "super_admin" && (
                  <Button
                    onClick={() => completeBusOrderMutation.mutate()}
                    disabled={
                      completeBusOrderMutation.isPending ||
                      !orderDetails.busDeliveryWorkflow?.proofSubmitted ||
                      busStage === "COMPLETED"
                    }
                    data-testid="button-complete-bus-order"
                  >
                    {completeBusOrderMutation.isPending ? "Completing..." : "Complete BUS Order (Super Admin)"}
                  </Button>
                )}
              </div>
            )}

            {!!orderDetails.items?.length && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Ordered Items</p>
                <div className="space-y-2">
                  {orderDetails.items.map((item: any, index: number) => (
                    <div
                      key={`${orderDetails.id}-${item.productId}-${index}`}
                      className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                    >
                      {item.image && (
                        <img
                          src={item.image}
                          alt={item.productName}
                          className="h-12 w-12 rounded-md object-cover shrink-0 border border-border/40"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate" title={item.productName}>
                          {item.productName}
                        </p>
                        {!!formatItemSelection(item) && (
                          <p className="text-xs text-muted-foreground">
                            {formatItemSelection(item)}
                          </p>
                        )}
                        {item.price && (
                          <p className="text-xs text-muted-foreground">
                            Unit price: {formatPrice(parseFloat(item.price))}
                          </p>
                        )}
                      </div>
                      <p className="shrink-0 text-sm font-medium">Qty: {item.quantity}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(orderDetails.deliveryAddress || orderDetails.customerInfo?.email || orderDetails.customerInfo?.phone || orderDetails.deliveryPhone) && (
              <div className="space-y-1">
                {orderDetails.deliveryAddress && (
                  <>
                    <p className="text-sm font-medium text-muted-foreground">Delivery Address</p>
                    <p className="font-semibold">{orderDetails.deliveryAddress}</p>
                  </>
                )}
                {orderDetails.customerInfo?.email && (
                  <p className="text-sm text-muted-foreground">Email: {orderDetails.customerInfo.email}</p>
                )}
                {(orderDetails.customerInfo?.phone || orderDetails.deliveryPhone) && (
                  <p className="text-sm text-muted-foreground">Phone: {orderDetails.customerInfo?.phone || orderDetails.deliveryPhone}</p>
                )}
                {isExternalRiderSystemEnabled && orderDetails.deliveryMethod !== "pickup" && (
                  <p className="text-sm text-muted-foreground">
                    External dispatch preference: {getExternalDeliveryTypeLabel(orderDetails)}
                  </p>
                )}
              </div>
            )}
            <div className="space-y-1 border-t pt-4">
              <p className="text-sm font-medium text-muted-foreground">Seller Information</p>
              <p className="text-sm">
                Store: <span className="font-semibold">{orderDetails.sellerInfo?.storeName || "Not available"}</span>
              </p>
              <p className="text-sm">
                Seller: <span className="font-semibold">{orderDetails.sellerInfo?.name || "Not available"}</span>
              </p>
              <p className="text-sm text-muted-foreground">Email: {orderDetails.sellerInfo?.email || "Not available"}</p>
              <p className="text-sm text-muted-foreground">Phone: {orderDetails.sellerInfo?.phone || "Not available"}</p>
            </div>

            {canVerifyPickup && (
              <div className="border-t pt-4 space-y-3">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="font-medium text-emerald-100">Pickup Verification</p>
                  <p className="mt-1 text-sm text-emerald-50/90">
                    Use either the buyer QR code or the Pickup OTP. One valid method is enough to complete this pickup order.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Buyer QR Code</label>
                    <Input
                      value={pickupVerificationQr}
                      onChange={(e) => setPickupVerificationQr(e.target.value)}
                      placeholder="Enter or paste buyer QR code"
                      data-testid="input-pickup-verification-qr"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Pickup OTP</label>
                    <Input
                      value={pickupVerificationOtp}
                      onChange={(e) => setPickupVerificationOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter 6-digit pickup OTP"
                      data-testid="input-pickup-verification-otp"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    onClick={() =>
                      verifyCustomerPickupMutation.mutate({
                        qrCode: pickupVerificationQr.trim() || undefined,
                        otp: pickupVerificationOtp.trim() || undefined,
                      })
                    }
                    disabled={
                      verifyCustomerPickupMutation.isPending ||
                      (!pickupVerificationQr.trim() && !pickupVerificationOtp.trim())
                    }
                    data-testid="button-verify-customer-pickup"
                  >
                    {verifyCustomerPickupMutation.isPending ? "Verifying..." : "Verify Pickup"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Available for pickup agent, admin, and super admin only after the seller marks the order ready.
                  </p>
                </div>
              </div>
            )}

            <div className="border-t pt-4">
              <p className="font-medium mb-2">Order Summary</p>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatPrice(parseFloat(orderDetails.subtotal))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Fee</span>
                  <span>{formatPrice(parseFloat(orderDetails.deliveryFee))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processing Fee</span>
                  <span>{formatPrice(parseFloat(orderDetails.processingFee))}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span className="text-primary">{formatPrice(parseFloat(orderDetails.total))}</span>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-center text-muted-foreground py-8">Failed to load order details</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminOrders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("all-orders");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const socket = useSocket();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  
  // Parse URL params to get orderId for dialog
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const orderIdFromUrl = urlParams.get('orderId');
  const [openOrderId, setOpenOrderId] = useState<string | null>(orderIdFromUrl);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin" && user?.role !== "agent"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Fetch all orders (admin/super_admin sees all)
  const { data: allOrders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    queryFn: () =>
      fetchSameOriginJson<Order[]>("/api/orders?context=admin&includeItems=false", {
        cache: "no-store",
      }),
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin" || user?.role === "agent"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
  });

  const { data: analytics } = useQuery<{ totalRevenue?: number; platformCommissionTotal?: number; promotionRevenueTotal?: number; platformRevenueTotal?: number }>({
    queryKey: ["/api/analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 30000,
  });

  // Socket.IO real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleOrderUpdate = (data: any) => {
      console.log("[orders] update received:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order Updated",
        description: `Order #${data.orderNumber || data.orderId} status changed`,
      });
    };

    const handleRiderAssigned = (data: any) => {
      if (!showInternalRiderFeatures) return;
      console.log("[orders] rider assigned:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Rider Assigned",
        description: `Rider assigned to order #${data.orderNumber}`,
      });
    };

    const handleDeliveryCompleted = (data: any) => {
      console.log("[orders] delivery completed:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Delivery Completed",
        description: `Order #${data.orderNumber} has been delivered`,
      });
    };

    const handleBusProofSubmitted = (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "BUS Proof Submitted",
        description: `Order #${data.orderNumber || data.orderId} proof is ready for verification`,
      });
    };

    socket.on("order_status_updated", handleOrderUpdate);
    if (showInternalRiderFeatures) {
      socket.on("order_rider_assigned", handleRiderAssigned);
    }
    socket.on("admin_delivery_completed", handleDeliveryCompleted);
    socket.on("admin_bus_transport_proof_submitted", handleBusProofSubmitted);
    socket.on("new_order", handleOrderUpdate);

    return () => {
      socket.off("order_status_updated", handleOrderUpdate);
      if (showInternalRiderFeatures) {
        socket.off("order_rider_assigned", handleRiderAssigned);
      }
      socket.off("admin_delivery_completed", handleDeliveryCompleted);
      socket.off("admin_bus_transport_proof_submitted", handleBusProofSubmitted);
      socket.off("new_order", handleOrderUpdate);
    };
  }, [showInternalRiderFeatures, socket, toast]);

  // Calculate order statistics
  const stats = useMemo<OrderStats>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      total: allOrders.length,
      pending: allOrders.filter(o => getEffectiveOrderStatus(o, showInternalRiderFeatures) === "pending").length,
      processing: allOrders.filter(o => ["processing", "confirmed", "ready", "external_dispatch_arranged"].includes(getEffectiveOrderStatus(o, showInternalRiderFeatures))).length,
      enRoute: allOrders.filter(o => ["in_transit", "en_route", "picked_up"].includes(getEffectiveOrderStatus(o, showInternalRiderFeatures))).length,
      delivered: allOrders.filter(o => !isPickupOrderMethod(o.deliveryMethod) && getEffectiveOrderStatus(o, showInternalRiderFeatures) === "completed").length,
      pickups: allOrders.filter(o => isPickupOrderMethod(o.deliveryMethod) && getEffectiveOrderStatus(o, showInternalRiderFeatures) === "completed").length,
      cancelled: allOrders.filter(o => getEffectiveOrderStatus(o, showInternalRiderFeatures) === "cancelled").length,
      totalRevenue: Number(analytics?.platformRevenueTotal ?? analytics?.totalRevenue ?? analytics?.platformCommissionTotal ?? 0),
      todayOrders: allOrders.filter(o => new Date(o.createdAt) >= today).length,
    };
  }, [allOrders, analytics?.platformCommissionTotal, analytics?.platformRevenueTotal, analytics?.totalRevenue, showInternalRiderFeatures]);

  // Separate admin's personal orders (where admin is the buyer)
  const myOrders = useMemo(() => 
    allOrders.filter(o => o.buyerId === user?.id), [allOrders, user?.id]);

  const orderFlowTabs = useMemo(() => {
    const baseOrders = activeTab === "my-orders" ? myOrders : allOrders;
    const countByMatcher = (matcher: (order: Order) => boolean) => baseOrders.filter(matcher).length;

    return [
      { value: "all", label: "All Flow", count: baseOrders.length },
      {
        value: "pending",
        label: "Pending",
        count: countByMatcher((order) => getEffectiveOrderStatus(order, showInternalRiderFeatures) === "pending"),
      },
      {
        value: "processing",
        label: "Processing",
        count: countByMatcher((order) =>
          ["processing", "confirmed", "ready", "packaged", "external_dispatch_arranged"].includes(
            getEffectiveOrderStatus(order, showInternalRiderFeatures),
          ),
        ),
      },
      {
        value: "in_transit",
        label: showInternalRiderFeatures ? "En Route" : "In Progress",
        count: countByMatcher((order) =>
          ["picked_up", "in_transit", "en_route", "arrived"].includes(
            getEffectiveOrderStatus(order, showInternalRiderFeatures),
          ),
        ),
      },
      {
        value: "completed",
        label: "Completed",
          count: countByMatcher((order) => {
            const effective = getEffectiveOrderStatus(order, showInternalRiderFeatures);
            const current = normalizeOrderStatusValue(order.status);
            return effective === "completed" || current === "completed";
          }),
      },
      {
        value: "cancelled",
        label: "Cancelled",
        count: countByMatcher((order) => getEffectiveOrderStatus(order, showInternalRiderFeatures) === "cancelled"),
      },
    ];
  }, [activeTab, allOrders, myOrders, showInternalRiderFeatures]);

  // Recent orders (last 24 hours)
  const recentOrders = useMemo(() => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    return allOrders
      .filter(o => new Date(o.createdAt) >= yesterday)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10);
  }, [allOrders]);

  // Filter orders based on search and status
  const filteredOrders = useMemo(() => {
    const isPickupMethod = (method?: string) => {
      const m = normalizeOrderStatusValue(method);
      return m === "pickup" || m === "store_pickup" || m === "store pickup";
    };
    const getAwaitingActionOwner = (order: Order): "seller" | "admin" | "rider" | "delivered" | "none" => {
      const status = normalizeOrderStatusValue(order.status);
      const paymentStatus = normalizePaymentStatus(order.paymentStatus);
      const isPickup = isPickupMethod(order.deliveryMethod);
      const externalDeliveryFlow = !showInternalRiderFeatures && !isPickup;

      if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) {
        return "none";
      }

      if (["paid", "processing", "preparing", "confirmed"].includes(status)) {
        return "seller";
      }

      if (isPickup && status === "packaged") {
        return "admin";
      }

      if (["ready", "searching_rider", "external_dispatch_arranged"].includes(status) && !isPickup) {
        return "admin";
      }

      if (["assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
        if (externalDeliveryFlow) return "admin";
        return "rider";
      }

      if (["delivered", "completed"].includes(status)) {
        return "delivered";
      }

      return "none";
    };

    let orders = activeTab === "my-orders" ? myOrders : allOrders;

    if (statusFilter !== "all") {
      const target = normalizeOrderStatusValue(statusFilter);
      orders = orders.filter((o) => {
        const current = normalizeOrderStatusValue(o.status);
        const effective = getEffectiveOrderStatus(o, showInternalRiderFeatures);
        if (target === "delivered") return ["delivered", "completed"].includes(current);
        if (target === "completed") {
          return current === "completed" || effective === "completed";
        }
        if (target === "in_transit") return ["in_transit", "en_route"].includes(current);
        if (target === "external_dispatch_arranged") return current === "external_dispatch_arranged";
        if (target === "pending") return effective === "pending";
        if (target === "processing") return ["processing", "confirmed", "ready", "packaged", "external_dispatch_arranged"].includes(effective);
        return current === target || effective === target;
      });
    }

    if (actionFilter !== "all") {
      orders = orders.filter((o) => getAwaitingActionOwner(o) === actionFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      orders = orders.filter(o => 
        o.orderNumber?.toLowerCase().includes(query) ||
        o.buyer?.name?.toLowerCase().includes(query) ||
        o.buyer?.email?.toLowerCase().includes(query) ||
        o.buyer?.phone?.toLowerCase().includes(query) ||
        o.seller?.name?.toLowerCase().includes(query) ||
        o.status?.toLowerCase().includes(query) ||
        o.deliveryPhone?.toLowerCase().includes(query) ||
        o.deliveryAddress?.toLowerCase().includes(query)
      );
    }
    
    return orders.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [allOrders, myOrders, activeTab, statusFilter, actionFilter, searchQuery, showInternalRiderFeatures]);
  
  // Sync openOrderId with URL params
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const orderId = params.get('orderId');
    setOpenOrderId(orderId);
  }, [location]);
  
  // Validate orderId exists in orders list
  useEffect(() => {
    if (openOrderId && allOrders.length > 0) {
      const orderExists = allOrders.some(o => o.id === openOrderId);
      if (!orderExists) {
        handleCloseDialog();
      }
    }
  }, [openOrderId, allOrders]);
  
  const handleOpenDialog = (orderId: string) => {
    navigate(`/admin/orders/${orderId}/action`);
  };

  const handleCloseDialog = () => {
    navigate('/admin/orders');
    setOpenOrderId(null);
  };

  const handleRefresh = async () => {
    await Promise.all([
      refetch(),
      queryClient.refetchQueries({
        predicate: (query) => {
          const key = query.queryKey?.[0];
          if (typeof key !== "string") return false;
          return [
            "/api/orders",
            "/api/riders/available",
            "/api/admin/pending-orders",
          ].some((prefix) => key.startsWith(prefix));
        },
      }),
    ]);
  };

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case "pending": return "bg-yellow-500";
      case "confirmed": return "bg-blue-400";
      case "processing": return "bg-blue-500";
      case "packaged": return "bg-indigo-500";
      case "ready": return "bg-indigo-500";
      case "external_dispatch_arranged": return "bg-cyan-600";
      case "assigned": return "bg-violet-500";
      case "picked_up": return "bg-purple-500";
      case "in_transit": return "bg-amber-500";
      case "en_route": return "bg-orange-500";
      case "delivered": return "bg-green-500";
      case "completed": return "bg-emerald-600";
      case "cancelled": return "bg-red-500";
      case "refunded": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status.toLowerCase()) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "processing": return <Package className="h-4 w-4" />;
      case "packaged": return <Package className="h-4 w-4" />;
      case "external_dispatch_arranged": return <Truck className="h-4 w-4" />;
      case "in_transit": return <Truck className="h-4 w-4" />;
      case "en_route": return <Truck className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "completed": return <CheckCircle className="h-4 w-4" />;
      case "cancelled": return <XCircle className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
    }
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin" && user?.role !== "agent")) {
    return <PageLoadingState title="Loading orders" description="Preparing order management, status queues, and action controls." />;
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="heading-orders">
                Orders Management
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                Track and manage all orders in real-time
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${showInternalRiderFeatures ? "lg:grid-cols-7" : "lg:grid-cols-6"}`}>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-yellow-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </Card>
          {showInternalRiderFeatures ? (
            <Card className="p-3">
              <div className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-orange-500" />
                <div>
                  <p className="text-xs text-muted-foreground">En Route</p>
                  <p className="text-xl font-bold">{stats.enRoute}</p>
                </div>
              </div>
            </Card>
          ) : null}
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Deliveries</p>
                <p className="text-xl font-bold">{stats.delivered}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-indigo-500" />
              <div>
                <p className="text-xs text-muted-foreground">Successful Pickups</p>
                <p className="text-xl font-bold">{stats.pickups}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Today</p>
                <p className="text-xl font-bold">{stats.todayOrders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-lg font-bold">{formatPrice(stats.totalRevenue)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Finance Note — collapsible explainer */}
        <Card className="border-border/60 bg-card/95">
          <details>
            <summary className="cursor-pointer list-none px-6 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">Order Finance & Commission — How the Money Flows</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Expand to understand how platform commission, seller payouts, and order totals relate</p>
                </div>
                <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
              </div>
            </summary>
            <CardContent className="pt-0 space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Order Total</p>
                  <p className="text-muted-foreground text-xs">Merchandise subtotal + Delivery Fee + Processing Fee − Coupon Discount. This is the full amount the buyer paid.</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Platform Commission</p>
                  <p className="text-muted-foreground text-xs">A configurable percentage of the merchandise subtotal (after coupons). Kept by the platform. Delivery and processing fees are separate platform revenue.</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Seller Settlement</p>
                  <p className="text-muted-foreground text-xs">Merchandise subtotal minus commission. Routed automatically to the seller's bank or mobile money account via Paystack at the time of payment if payout setup is verified.</p>
                </div>
                <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                  <p className="font-medium mb-1">Pending Payout</p>
                  <p className="text-muted-foreground text-xs">Seller's share held back because their payout setup is incomplete. Goes to "completed" automatically once they verify their bank or mobile money details.</p>
                </div>
              </div>
              <div className="rounded-lg border border-dashed border-border/50 bg-background/60 px-3 py-2 text-xs text-muted-foreground">
                <strong>Split formula:</strong> Seller Share = (Subtotal − Coupon) × (100% − Commission%). Platform gets Commission% + Processing Fee + Delivery Fee. Both bank and mobile-money payouts are tracked in Admin → Seller Payouts.
              </div>
            </CardContent>
          </details>
        </Card>

        {/* Tabs for All Orders vs My Orders */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="all-orders" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              All Orders ({allOrders.length})
            </TabsTrigger>
            <TabsTrigger value="my-orders" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              My Orders ({myOrders.length})
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <div className="mb-4 flex flex-wrap gap-2">
              {orderFlowTabs.map((tab) => {
                const isActive = statusFilter === tab.value || (tab.value === "all" && statusFilter === "all");
                return (
                  <Button
                    key={tab.value}
                    type="button"
                    variant={isActive ? "default" : "outline"}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setStatusFilter(tab.value)}
                    data-testid={`button-order-flow-${tab.value}`}
                  >
                    {tab.label} ({tab.count})
                  </Button>
                );
              })}
            </div>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order #, customer, seller, address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-orders"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  {isExternalRiderSystemEnabled ? (
                    <SelectItem value="external_dispatch_arranged">External Dispatch Arranged</SelectItem>
                  ) : null}
                  {showInternalRiderFeatures ? <SelectItem value="assigned">Assigned</SelectItem> : null}
                  <SelectItem value="in_transit">In Transit</SelectItem>
                  <SelectItem value="en_route">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter by action owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Action Owners</SelectItem>
                  <SelectItem value="seller">Awaiting Seller Action</SelectItem>
                  <SelectItem value="admin">Awaiting Admin Action</SelectItem>
                  {showInternalRiderFeatures ? <SelectItem value="rider">Awaiting Rider Action</SelectItem> : null}
                  <SelectItem value="delivered">Delivered Actions</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Recent Orders Widget */}
            {activeTab === "all-orders" && recentOrders.length > 0 && (
              <Card className="mb-4 border-2 border-dashed border-blue-200 dark:border-blue-900">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-blue-500" />
                    Recent Activity (Last 24h)
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex flex-wrap gap-2">
                    {recentOrders.slice(0, 5).map(order => (
                      <Badge
                        key={order.id}
                        variant="outline"
                        className="cursor-pointer hover:bg-primary/10 transition"
                        onClick={() => handleOpenDialog(order.id)}
                      >
                        #{order.orderNumber} - {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Orders List */}
            <TabsContent value="all-orders" className="mt-0">
              <OrdersList 
                orders={filteredOrders}
                isLoading={isLoading}
                formatPrice={formatPrice}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                onViewOrder={handleOpenDialog}
              />
            </TabsContent>

            <TabsContent value="my-orders" className="mt-0">
              <OrdersList 
                orders={filteredOrders}
                isLoading={isLoading}
                formatPrice={formatPrice}
                getStatusColor={getStatusColor}
                getStatusIcon={getStatusIcon}
                onViewOrder={handleOpenDialog}
                isMyOrders
                emptyMessage="You haven't made any personal orders yet"
              />
            </TabsContent>
          </div>
        </Tabs>
        
        {/* Order Dialog */}
        {openOrderId && (
          <ViewOrderDialog 
            orderId={openOrderId}
            open={!!openOrderId}
            onOpenChange={(isOpen) => {
              if (!isOpen) handleCloseDialog();
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

// Separate OrdersList component for reusability
function OrdersList({
  orders,
  isLoading,
  formatPrice,
  getStatusColor,
  getStatusIcon,
  onViewOrder,
  isMyOrders = false,
  emptyMessage = "No orders found",
}: {
  orders: Order[];
  isLoading: boolean;
  formatPrice: (price: number) => string;
  getStatusColor: (status: string) => string;
  getStatusIcon: (status: string) => React.ReactNode;
  onViewOrder: (id: string) => void;
  isMyOrders?: boolean;
  emptyMessage?: string;
}) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  const getPaymentLabel = (value?: string) => normalizePaymentStatus(value);
  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const getDisplayMethodLabel = (order: Order) => {
    if (isPickupMethod(order.deliveryMethod)) return "Pickup";
    if (!showInternalRiderFeatures) return getExternalDeliveryTypeLabel(order);
    if (normalize(order.deliveryMethod) === "bus") return "Bus Delivery";
    if (normalize(order.deliveryMethod) === "rider") return "Rider Delivery";
    return order.deliveryMethod || "Delivery";
  };
  const displayStatusLabel = (value?: string, deliveryMethod?: string) => {
    const normalized = showInternalRiderFeatures ? normalize(value) : normalizeExternalOrderStatus(value);
    if (isPickupMethod(deliveryMethod)) {
      if (normalized === "packaged") return "Packaged";
      if (normalized === "ready") return "Ready for Pickup";
      if (["delivered", "completed"].includes(normalized)) return "Completed";
    }
    return normalized.replace(/_/g, " ");
  };
  const isPickupMethod = (value?: string) => {
    const method = normalize(value);
    return method === "pickup" || method === "store_pickup" || method === "store pickup";
  };

  const getSellerActionState = (order: Order) => {
    const status = normalize(order.status);
    const paymentStatus = getPaymentLabel(order.paymentStatus);
    const pickupFlow = isPickupMethod(order.deliveryMethod);
    const externalDeliveryFlow = !showInternalRiderFeatures && !pickupFlow;

    if (externalDeliveryFlow && ["rider_arrived", "delivered", "completed"].includes(status)) {
      return {
        label: "Completed",
        hint: "No further seller action required",
        className: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
      };
    }

    if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) {
      return {
        label: "Awaiting Payment",
        hint: "Seller action not started",
        className: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200",
      };
    }

    if (["paid", "processing", "preparing", "confirmed"].includes(status)) {
      return {
        label: "Seller Action Required",
        hint: pickupFlow
          ? "Seller must prepare for pickup"
          : externalDeliveryFlow
            ? "Seller must prepare for external delivery handoff"
            : "Seller must prepare for dispatch",
        className: "bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200",
      };
    }

    if (pickupFlow && status === "packaged") {
      return {
        label: "Packaged",
        hint: "Super admin must assign a pickup station",
        className: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200",
      };
    }

    if (["ready", "searching_rider", "assigned", "rider_arrived"].includes(status)) {
      return {
        label: pickupFlow ? "Ready for Pickup" : externalDeliveryFlow ? "Awaiting External Dispatch" : "Ready for Dispatch",
        hint: pickupFlow
          ? "Awaiting buyer collection"
          : externalDeliveryFlow
            ? "Admin must arrange the external delivery service"
            : "Awaiting rider/dispatch progression",
        className: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
      };
    }

    if (status === "external_dispatch_arranged") {
      return {
        label: "External Delivery Arranged",
        hint: "Customer support or admin is coordinating the delivery handoff",
        className: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/30 dark:text-cyan-200",
      };
    }

    if (["picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      return {
        label: externalDeliveryFlow ? "Delivery In Progress" : "Seller Handoff Complete",
        hint: externalDeliveryFlow ? "Delivery is being coordinated externally" : "No further seller action required",
        className: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
      };
    }

    if (["delivered", "completed"].includes(status)) {
      return {
        label: "Completed",
        hint: "No further seller action required",
        className: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
      };
    }

    if (status === "cancelled") {
      return {
        label: "Order Cancelled",
        hint: "No seller action required",
        className: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
      };
    }

    return {
      label: "Seller Status Pending",
      hint: "Review order details",
      className: "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200",
    };
  };

  const getRiderActionHint = (order: Order) => {
    const status = normalize(order.status);
    if (status === "assigned") return "Proceed to pickup location";
    if (status === "rider_arrived") return "Confirm pickup handoff with seller";
    if (status === "picked_up") return "Start transit to buyer";
    if (status === "in_transit" || status === "en_route") return "Continue to buyer and prepare delivery handoff";
    if (status === "arrived") return "Complete delivery verification with buyer";
    return "Continue delivery workflow for this order";
  };
  const getAwaitingActionOwner = (order: Order): "seller" | "admin" | "rider" | "delivered" | "none" => {
    const status = normalize(order.status);
    const paymentStatus = getPaymentLabel(order.paymentStatus);
    const isPickup = isPickupMethod(order.deliveryMethod);
    const externalDeliveryFlow = !showInternalRiderFeatures && !isPickup;

    if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) {
      return "none";
    }

    if (["paid", "processing", "preparing", "confirmed"].includes(status)) {
      return "seller";
    }

    if (isPickup && status === "packaged") {
      return "admin";
    }

    if (["ready", "searching_rider", "external_dispatch_arranged"].includes(status) && !isPickup) {
      return "admin";
    }

    if (externalDeliveryFlow && ["rider_arrived", "delivered", "completed"].includes(status)) {
      return "delivered";
    }

    if (["assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      if (externalDeliveryFlow) return "admin";
      return "rider";
    }

    if (["delivered", "completed"].includes(status)) {
      return "delivered";
    }

    return "none";
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <Card className="p-12">
        <div className="text-center">
          <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground" data-testid="text-no-orders">
            {emptyMessage}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {orders.map((order) => (
        (() => {
          const cardStatus = getEffectiveOrderStatus(order, showInternalRiderFeatures);
          return (
        <Card 
          key={order.id} 
          className="p-4 hover:shadow-md transition-shadow cursor-pointer flex flex-col"
          onClick={() => onViewOrder(order.id)}
          data-testid={`card-order-${order.id}`}
        >
          <div className="flex items-start gap-3 mb-3">
            <div className={`p-2.5 rounded-lg ${getStatusColor(cardStatus)} text-white shrink-0`}>
              {getStatusIcon(cardStatus)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-sm" data-testid={`text-order-number-${order.id}`}>
                #{order.orderNumber}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          
          <div className="space-y-2 flex-1">
            {order.buyer?.name && (
              <div className="text-xs">
                <p className="text-muted-foreground">Customer</p>
                <p className="font-medium truncate">{order.buyer.name}</p>
              </div>
            )}
            <div className="text-xs space-y-1">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Email</span>
                <span className="font-medium truncate">{order.buyer?.email || "N/A"}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Phone</span>
                <span className="font-medium">{order.deliveryPhone || order.buyer?.phone || "N/A"}</span>
              </div>
              {order.deliveryAddress && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Address</span>
                  <span className="font-medium truncate">{order.deliveryAddress}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
                <Badge className={getStatusColor(cardStatus)} data-testid={`badge-status-${order.id}`} variant="secondary">
                 {displayStatusLabel(cardStatus, order.deliveryMethod)}
                </Badge>
              {(() => {
                const paymentStatusLabel = getPaymentLabel(order.paymentStatus);
                return (
                  <Badge
                    variant={paymentStatusLabel === "paid" ? "default" : "outline"}
                    className={paymentStatusLabel === "paid" ? "bg-green-600 text-white" : ""}
                  >
                    {paymentStatusLabel}
                  </Badge>
                );
              })()}
            </div>
            {(() => {
              const isPickup = String(order.deliveryMethod || "").toLowerCase().trim() === "pickup";
              const isBus = String(order.deliveryMethod || "").toLowerCase().trim() === "bus";
              const busStage = String(order.busDeliveryWorkflow?.stage || "").toUpperCase();
              const verification = order.verificationSummary;
              const hasAnyVerification = Boolean(
                verification?.sellerToBuyer ||
                (showInternalRiderFeatures && (verification?.sellerToRider || verification?.riderToBuyer))
              );
              const status = String(order.status || "").toLowerCase().trim();
              const isCompletedOrder = status === "completed";
              const shouldShowVerification =
                hasAnyVerification || ["picked_up", "in_transit", "en_route", "arrived", "delivered", "completed"].includes(status);
              if (!shouldShowVerification) return null;
              return (
                <div className="rounded-md border border-muted p-2 mt-1 text-[11px] space-y-1">
                  <p className="font-semibold text-foreground">Verification Checkpoints</p>
                  {isPickup ? (
                    <p className="text-muted-foreground">
                      Seller to Buyer: <span className="font-medium text-foreground">{verification?.sellerToBuyer ? `Verified (${verification.sellerToBuyer})` : isCompletedOrder ? "Verified (completed)" : "Pending"}</span>
                    </p>
                  ) : isBus ? (
                    <>
                      {showInternalRiderFeatures ? (
                        <p className="text-muted-foreground">
                          Seller to Rider: <span className="font-medium text-foreground">{verification?.sellerToRider ? `Verified (${verification.sellerToRider})` : "Pending"}</span>
                        </p>
                      ) : null}
                      <p className="text-muted-foreground">
                        BUS Transport Proof: <span className="font-medium text-foreground">{order.busDeliveryWorkflow?.proofSubmitted ? "Submitted" : isCompletedOrder ? "Submitted" : "Pending"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        BUS Stage: <span className="font-medium text-foreground">{isCompletedOrder ? "COMPLETED" : busStage || "READY"}</span>
                      </p>
                    </>
                  ) : showInternalRiderFeatures ? (
                    <>
                      <p className="text-muted-foreground">
                        Seller to Rider: <span className="font-medium text-foreground">{verification?.sellerToRider ? `Verified (${verification.sellerToRider})` : isCompletedOrder ? "Verified (completed)" : "Pending"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Rider to Buyer: <span className="font-medium text-foreground">{verification?.riderToBuyer ? `Verified (${verification.riderToBuyer})` : isCompletedOrder ? "Verified (completed)" : "Pending"}</span>
                      </p>
                    </>
                  ) : null}
                </div>
              );
            })()}
            {(() => {
              const sellerState = getSellerActionState(order);
              const sellerActionPending = sellerState.label === "Seller Action Required";
              const riderActionPending = showInternalRiderFeatures && [
                "assigned",
                "rider_arrived",
                "picked_up",
                "in_transit",
                "en_route",
                "arrived",
              ].includes(normalize(order.status));
              const sellerDisplayName =
                String(order.seller?.storeName || "").trim() ||
                String(order.seller?.name || "").trim() ||
                "Unknown Seller Store";
              const sellerContact = order.sellerId || null;
              const riderDisplayName =
                String(order.rider?.name || "").trim() ||
                "Unknown Rider";
              const riderContact = order.riderId || null;
              return (
                <div className="mt-1">
                  <Badge className={`${sellerState.className} text-[11px]`} variant="secondary">
                    {sellerState.label}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground mt-1">{sellerState.hint}</p>
                  {sellerActionPending && (
                    <div className="rounded-md border border-orange-200/60 dark:border-orange-900/40 p-2 mt-2 space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Responsible seller store: <span className="font-medium text-foreground">{sellerDisplayName}</span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!sellerContact}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!sellerContact) return;
                          const params = new URLSearchParams({
                            userId: sellerContact,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            orderAction: sellerState.hint,
                            orderActionOwner: "seller",
                            orderLink: `/admin/orders?orderId=${order.id}`,
                          });
                          navigate(`/admin/messages?${params.toString()}`);
                        }}
                        data-testid={`button-message-seller-${order.id}`}
                      >
                        <MessageCircle className="h-3 w-3 mr-1" />
                        Message Seller
                      </Button>
                    </div>
                  )}
                  {user?.role === "super_admin" && sellerState.label === "Awaiting Payment" && (
                    <div className="rounded-md border border-slate-200/60 dark:border-slate-700/40 p-2 mt-2 space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Customer: <span className="font-medium text-foreground">{order.buyer?.name || "Unknown"}</span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!order.buyerId}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!order.buyerId) return;
                          const params = new URLSearchParams({
                            userId: order.buyerId,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            orderAction: "Payment pending — customer hasn't paid yet",
                            orderActionOwner: "buyer",
                            orderLink: `/admin/orders?orderId=${order.id}`,
                          });
                          navigate(`/admin/messages?${params.toString()}`);
                        }}
                        data-testid={`button-message-customer-${order.id}`}
                      >
                        <MessageCircle className="h-3 w-3 mr-1" />
                        Chat with Customer
                      </Button>
                    </div>
                  )}
                  {riderActionPending && (
                    <div className="rounded-md border border-blue-200/60 dark:border-blue-900/40 p-2 mt-2 space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Responsible rider: <span className="font-medium text-foreground">{riderDisplayName}</span>
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-[11px]"
                        disabled={!riderContact}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!riderContact) return;
                          const params = new URLSearchParams({
                            userId: riderContact,
                            orderId: order.id,
                            orderNumber: order.orderNumber,
                            orderAction: getRiderActionHint(order),
                            orderActionOwner: "rider",
                            orderLink: `/admin/orders?orderId=${order.id}`,
                          });
                          navigate(`/admin/messages?${params.toString()}`);
                        }}
                        data-testid={`button-message-rider-${order.id}`}
                      >
                        <MessageCircle className="h-3 w-3 mr-1" />
                        Message Rider
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          
          <div className="border-t pt-3 mt-3 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{formatPrice(parseFloat(order.total))}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method</span>
              <span className="font-medium">{getDisplayMethodLabel(order)}</span>
            </div>
          </div>
          
          {(() => {
            const s = (order.status || "").toLowerCase().trim();
            const paymentStatus = getPaymentLabel(order.paymentStatus);
            const isUnpaid = paymentStatus === "pending" || paymentStatus === "failed";
            const isProcessingPayment = paymentStatus === "processing";
            const awaitingActionOwner = getAwaitingActionOwner(order);
            const trackStatuses = new Set([
              "processing",
              "ready",
              "external_dispatch_arranged",
              "searching_rider",
              "assigned",
              "rider_arrived",
              "picked_up",
              "in_transit",
              "en_route",
              "arrived",
            ]);
            const canResumePayment =
              ["pending", "created", "unpaid"].includes(s) &&
              (isUnpaid || isProcessingPayment);
            if (isMyOrders && canResumePayment) {
              return (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full mt-3 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/payment/${order.id}`);
                  }}
                  data-testid={`button-continue-payment-${order.id}`}
                >
                  Continue Payment
                </Button>
              );
            }
            if (!isMyOrders && awaitingActionOwner === "admin") {
              return (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full mt-3 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/admin/orders/${order.id}/action`);
                  }}
                  data-testid={`button-admin-action-${order.id}`}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Take Admin Action
                </Button>
              );
            }
            if (!isMyOrders && awaitingActionOwner === "seller") {
              return (
                <Button
                  variant="default"
                  size="sm"
                  className="w-full mt-3 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/admin/orders/${order.id}/action`);
                  }}
                  data-testid={`button-review-seller-action-${order.id}`}
                >
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Review Seller Action
                </Button>
              );
            }
            if (trackStatuses.has(s)) {
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Navigate to tracking page with order id
                    navigate(`/track/${encodeURIComponent(order.id)}`);
                  }}
                  data-testid={`button-track-${order.id}`}
                >
                  <Truck className="h-3 w-3 mr-1" />
                  Track Order
                </Button>
              );
            }

            return (
              <Button 
                variant="ghost" 
                size="sm"
                className="w-full mt-3 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewOrder(order.id);
                }}
                data-testid={`button-view-${order.id}`}
              >
                <Eye className="h-3 w-3 mr-1" />
                View Details
              </Button>
            );
          })()}
        </Card>
          );
        })()
      ))}
    </div>
  );
}



