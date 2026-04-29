import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PickupVerificationScanner from "@/components/PickupVerificationScanner";
import { ArrowLeft, CheckCircle2, Keyboard, Loader2, MessageCircle, QrCode, ShieldCheck, Store, Truck } from "lucide-react";

type OrderItem = {
  productId: string;
  productName?: string;
  quantity: number;
  price: string;
  image?: string | null;
  productImages?: string[] | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
};

type OrderDetails = {
  id: string;
  orderNumber: string;
  sellerId?: string | null;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  externalDeliveryByBus?: boolean;
  externalDeliveryType?: string | null;
  createdAt: string;
  total: string;
  subtotal: string;
  deliveryFee: string;
  processingFee: string;
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  customerInfo?: { name?: string; email?: string; phone?: string; address?: string | null } | null;
  sellerInfo?: { name?: string; email?: string; phone?: string; storeName?: string | null } | null;
  riderId?: string | null;
  deliveryZoneId?: string | null;
  items?: OrderItem[];
  pickupStationInfo?: {
    id: string;
    name: string;
    city?: string | null;
    region?: string | null;
    locationLabel?: string | null;
    pickupAgentName?: string | null;
    pickupAgentPhone?: string | null;
  } | null;
};

type AvailableRider = {
  rider: { id: string; name: string; email: string };
  activeOrderCount: number;
};

type PickupStation = {
  id: string;
  name: string;
  city?: string | null;
  region?: string | null;
  isActive?: boolean;
};

const normalize = (value?: string) => String(value || "").toLowerCase().trim();
const normalizePaymentStatus = (value?: string) => {
  const s = normalize(value);
  if (s === "payment_pending") return "pending";
  if (s === "payment_failed") return "failed";
  if (s === "completed" || s === "paid") return "paid";
  return s || "pending";
};
const isPickupMethod = (value?: string) => {
  const method = normalize(value);
  return method === "pickup" || method === "store_pickup" || method === "store pickup";
};
const getExternalDeliveryTypeLabel = (orderLike?: { externalDeliveryType?: string | null; externalDeliveryByBus?: boolean | null }) => {
  const normalizedType = normalize(orderLike?.externalDeliveryType || "");
  if (normalizedType === "bus" || orderLike?.externalDeliveryByBus) return "VIP Bus Delivery";
  return "Third-Party Delivery";
};

const getAllowedStatusOptions = ({
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
  const current = normalize(currentStatus);
  const actorRole = normalize(role);
  if (!["admin", "super_admin"].includes(actorRole)) return [];
  if (isPickupOrder) return [];

  const options = new Set<string>();
  const add = (value?: string) => {
    const normalized = normalize(value);
    if (normalized) options.add(normalized);
  };

  add(current);

  switch (current) {
    case "created":
    case "pending":
      add("cancelled");
      break;
    case "confirmed":
      add("cancelled");
      break;
    case "processing":
      if (!isExternalRiderSystemEnabled) {
        add("assigned");
        add("en_route");
      }
      add("cancelled");
      break;
    case "ready":
      if (!isExternalRiderSystemEnabled) {
        add("searching_rider");
      }
      add("cancelled");
      break;
    case "external_dispatch_arranged":
      add("cancelled");
      break;
    case "en_route":
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

const getStatusLabel = (status: string, isExternalRiderSystemEnabled: boolean) => {
  switch (normalize(status)) {
    case "created":
    case "pending":
      return "Pending";
    case "confirmed":
      return "Confirmed";
    case "processing":
      return "Processing";
    case "packaged":
      return "Packaged";
    case "ready":
      return "Ready";
    case "searching_rider":
      return isExternalRiderSystemEnabled ? "Preparing External Dispatch" : "Searching Rider";
    case "assigned":
      return isExternalRiderSystemEnabled ? "External Dispatch Arranged" : "Assigned";
    case "rider_arrived":
      return isExternalRiderSystemEnabled ? "Completed" : "Rider Arrived";
    case "picked_up":
      return "Picked Up";
    case "in_transit":
      return "In Transit";
    case "en_route":
      return isExternalRiderSystemEnabled ? "External Delivery In Progress" : "Out for Delivery";
    case "external_dispatch_arranged":
      return "External Dispatch Arranged";
    case "delivered":
      return isExternalRiderSystemEnabled ? "Completed" : "Delivered";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    case "disputed":
      return "Disputed";
    default:
      return status;
  }
};

export default function AdminOrderActionPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const [pickupVerificationQr, setPickupVerificationQr] = useState("");
  const [pickupVerificationOtp, setPickupVerificationOtp] = useState("");
  const [selectedPickupStationId, setSelectedPickupStationId] = useState("");

  const isAdminViewer = user?.role === "admin" || user?.role === "super_admin" || user?.role === "agent";

  const { data: orderDetails, isLoading } = useQuery<OrderDetails>({
    queryKey: ["/api/orders", id, "action-center"],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch order details");
      return res.json();
    },
    enabled: Boolean(id) && isAuthenticated && isAdminViewer,
  });

  const { data: availableRiders = [], isLoading: ridersLoading } = useQuery<AvailableRider[]>({
    queryKey: ["/api/riders/available", "action-center"],
    queryFn: async () => {
      const res = await fetch("/api/riders/available", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch available riders");
      return res.json();
    },
    enabled: Boolean(id) && isAuthenticated && isAdminViewer && !isExternalRiderSystemEnabled,
  });

  const status = normalize(orderDetails?.status);
  const paymentStatus = normalizePaymentStatus(orderDetails?.paymentStatus);
  const isPickupOrder = isPickupMethod(orderDetails?.deliveryMethod);

  const { data: pickupStations = [], isLoading: pickupStationsLoading } = useQuery<PickupStation[]>({
    queryKey: ["/api/admin/pickup-stations", "action-center"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pickup-stations", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch pickup stations");
      return res.json();
    },
    enabled: Boolean(id) && isAuthenticated && isAdminViewer && isPickupOrder && user?.role === "super_admin",
  });

  const refreshOrderData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders", id] });
    queryClient.invalidateQueries({ queryKey: ["/api/orders", id, "action-center"] });
  };

  const updateStatusMutation = useMutation({
    mutationFn: async (status: string) => apiRequest("PATCH", `/api/orders/${id}/status`, { status }),
    onSuccess: () => {
      toast({ title: "Status updated", description: "Order status was updated successfully." });
      refreshOrderData();
    },
    onError: (error: any) => toast({ title: "Update failed", description: error.message || "Failed to update order status", variant: "destructive" }),
  });
  const assignRiderMutation = useMutation({
    mutationFn: async (riderId: string) => apiRequest("PATCH", `/api/orders/${id}/assign-rider`, { riderId }),
    onSuccess: () => {
      toast({ title: "Rider assigned", description: "The order was assigned successfully." });
      refreshOrderData();
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available", "action-center"] });
    },
    onError: (error: any) => toast({ title: "Assignment failed", description: error.message || "Failed to assign rider", variant: "destructive" }),
  });
  const arrangeExternalDeliveryMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/orders/${id}/arrange-external-delivery`, {}),
    onSuccess: () => {
      toast({ title: "External delivery arranged", description: "The order is now ready for manual external dispatch." });
      refreshOrderData();
    },
    onError: (error: any) => toast({ title: "Action failed", description: error.message || "Failed to arrange external delivery", variant: "destructive" }),
  });
  const markExternalDeliveredMutation = useMutation({
    mutationFn: async () => apiRequest("POST", `/api/admin/orders/${id}/mark-external-delivered`, {}),
    onSuccess: () => {
      toast({ title: "Delivery completed", description: "The external delivery was marked as completed." });
      refreshOrderData();
    },
    onError: (error: any) => toast({ title: "Completion failed", description: error.message || "Failed to mark delivery complete", variant: "destructive" }),
  });
  const verifyCustomerPickupMutation = useMutation({
    mutationFn: async ({ qrCode, otp }: { qrCode?: string; otp?: string }) =>
      apiRequest("POST", `/api/orders/${id}/verify-customer-pickup`, { qrCode, otp }),
    onSuccess: () => {
      toast({ title: "Pickup verified", description: "Pickup completed successfully." });
      setPickupVerificationQr("");
      setPickupVerificationOtp("");
      refreshOrderData();
    },
    onError: (error: any) => toast({ title: "Verification failed", description: error.message || "Failed to verify pickup", variant: "destructive" }),
  });
  const assignPickupStationMutation = useMutation({
    mutationFn: async (stationId: string) => apiRequest("POST", `/api/admin/orders/${id}/assign-pickup-station`, { stationId }),
    onSuccess: () => {
      toast({ title: "Pickup station assigned", description: "The order is now ready for pickup and station notifications have been sent." });
      refreshOrderData();
    },
    onError: (error: any) => toast({ title: "Assignment failed", description: error.message || "Failed to assign pickup station", variant: "destructive" }),
  });

  const sellerActionRequired =
    !isPickupOrder &&
    ((paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) ||
      ["paid", "processing", "preparing", "confirmed"].includes(status));
  const showArrangeExternalDelivery =
    isExternalRiderSystemEnabled && !isPickupOrder && status === "ready" && (user?.role === "admin" || user?.role === "super_admin");
  const showManualExternalDeliveredButton =
    isExternalRiderSystemEnabled &&
    !isPickupOrder &&
    ["external_dispatch_arranged", "en_route", "delivered", "rider_arrived"].includes(status) &&
    user?.role === "super_admin";
  const canVerifyPickup =
    isPickupOrder &&
    ["pickup_agent", "admin", "super_admin"].includes(String(user?.role || "")) &&
    status === "ready";
  const canAssignPickupStation =
    isPickupOrder &&
    user?.role === "super_admin" &&
    status === "packaged" &&
    paymentStatus === "paid";
  const allowedStatusOptions = useMemo(
    () =>
      getAllowedStatusOptions({
        currentStatus: orderDetails?.status,
        role: user?.role,
        isExternalRiderSystemEnabled,
        isPickupOrder,
      }),
    [isExternalRiderSystemEnabled, isPickupOrder, orderDetails?.status, user?.role],
  );

  useEffect(() => {
    if (!canAssignPickupStation) return;
    if (orderDetails?.deliveryZoneId) {
      setSelectedPickupStationId(orderDetails.deliveryZoneId);
      return;
    }
    if (!selectedPickupStationId && pickupStations.length > 0) {
      const firstActiveStation = pickupStations.find((station) => station.isActive !== false);
      setSelectedPickupStationId(firstActiveStation?.id || pickupStations[0]?.id || "");
    }
  }, [canAssignPickupStation, orderDetails?.deliveryZoneId, pickupStations, selectedPickupStationId]);

  const actionNote = useMemo(() => {
    if (showArrangeExternalDelivery) return "This order is waiting for operations to arrange the external delivery service.";
    if (showManualExternalDeliveredButton) return "The delivery is already in the manual flow. Confirm completion once the third-party or VIP bus handoff is fully finished.";
    if (canAssignPickupStation) return "The seller has packaged this pickup order. Assign it to a pickup station to mark it ready for pickup and notify the buyer and pickup agent.";
    if (isPickupOrder && status === "processing") return "The seller is still packaging this pickup order before station assignment can happen.";
    if (isPickupOrder && status !== "ready") return "Pickup completion stays locked until the seller finishes packaging and the order is assigned to a pickup station.";
    if (canVerifyPickup) return "This pickup is ready. Admin or the assigned pickup agent can complete it with either the buyer QR code or the pickup OTP.";
    if (sellerActionRequired) return "Seller confirmation is still required before dispatch actions unlock.";
    return "Use this action center to review the order, coordinate the next step, and keep the flow moving.";
  }, [canAssignPickupStation, canVerifyPickup, isPickupOrder, sellerActionRequired, showArrangeExternalDelivery, showManualExternalDeliveredButton, status]);

  if (!authLoading && (!isAuthenticated || !isAdminViewer)) {
    navigate("/auth");
    return null;
  }

  return (
    <DashboardLayout role={(user?.role as any) || "admin"}>
      <div className="space-y-6">
        <Button variant="ghost" className="gap-2 px-0" onClick={() => navigate("/admin/orders")}>
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Button>

        {isLoading ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !orderDetails ? (
          <Card><CardContent className="p-8 text-center text-muted-foreground">Order details could not be loaded.</CardContent></Card>
        ) : (
          <>
            <Card className="overflow-hidden border-border/70 bg-card shadow-sm dark:border-primary/20 dark:bg-gradient-to-br dark:from-card dark:via-card dark:to-primary/10">
              <CardContent className="p-6 md:p-8">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-primary/15 text-primary hover:bg-primary/15">Action Center</Badge>
                      <Badge variant="secondary">{status || "pending"}</Badge>
                      <Badge className={paymentStatus === "paid" ? "bg-green-600/90" : "bg-amber-500/90"}>{paymentStatus}</Badge>
                    </div>
                    <div>
                      <h1 className="text-3xl font-semibold tracking-tight">Order #{orderDetails.orderNumber}</h1>
                      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{actionNote}</p>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Button variant="outline" onClick={() => navigate(`/track/${encodeURIComponent(orderDetails.id)}`)}>
                          <Truck className="mr-2 h-4 w-4" />
                          Open Tracking
                        </Button>
                        {orderDetails.sellerId ? (
                          <Button
                            variant="secondary"
                            onClick={() => {
                              const params = new URLSearchParams({
                                userId: orderDetails.sellerId || "",
                                orderId: orderDetails.id,
                                orderNumber: orderDetails.orderNumber,
                                orderAction: "Order coordination",
                                orderActionOwner: "seller",
                                orderLink: `/admin/orders/${orderDetails.id}/action`,
                              });
                              navigate(`/admin/messages?${params.toString()}`);
                            }}
                          >
                            <MessageCircle className="mr-2 h-4 w-4" />
                            Chat With Seller
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Total</p>
                      <p className="mt-2 text-2xl font-semibold text-primary">{formatPrice(parseFloat(orderDetails.total || "0"))}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/60 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Delivery</p>
                      <p className="mt-2 text-base font-semibold">
                        {isPickupOrder ? "Pickup" : isExternalRiderSystemEnabled ? getExternalDeliveryTypeLabel(orderDetails) : orderDetails.deliveryMethod}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="space-y-6">
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle>Order Actions</CardTitle>
                    <CardDescription>Perform the next required step from one clean workspace.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Status Control</p>
                        <Select
                          value={orderDetails.status}
                          onValueChange={(value) => updateStatusMutation.mutate(value)}
                          disabled={updateStatusMutation.isPending || user?.role === "agent" || allowedStatusOptions.length <= 1}
                        >
                          <SelectTrigger className="mt-3"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {allowedStatusOptions.map((option) => (
                              <SelectItem key={option} value={option}>
                                {getStatusLabel(option, isExternalRiderSystemEnabled)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {user?.role === "agent" ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Customer agents can review order progress here, but they cannot change order status.
                          </p>
                        ) : allowedStatusOptions.length <= 1 ? (
                          <p className="mt-2 text-xs text-muted-foreground">
                            No direct status change is available here. Use the dedicated action below when required.
                          </p>
                        ) : null}
                      </div>

                      {!isExternalRiderSystemEnabled && !isPickupOrder ? (
                        <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Rider Assignment</p>
                          <Select onValueChange={(value) => assignRiderMutation.mutate(value)} disabled={sellerActionRequired || assignRiderMutation.isPending || ridersLoading}>
                            <SelectTrigger className="mt-3"><SelectValue placeholder={ridersLoading ? "Loading riders..." : "Assign a rider"} /></SelectTrigger>
                            <SelectContent>
                              {availableRiders.map((item) => (
                                <SelectItem key={item.rider.id} value={item.rider.id}>
                                  {item.rider.name} ({item.activeOrderCount} active)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      {canAssignPickupStation ? (
                        <Card className="border-sky-500/30 bg-sky-500/5">
                          <CardContent className="p-4">
                            <div className="space-y-3">
                              <div>
                                <p className="font-medium">Assign Pickup Station</p>
                                <p className="text-sm text-muted-foreground">
                                  Select the station that will handle collection. This will update the order to ready for pickup and notify the assigned pickup agents and buyer.
                                </p>
                              </div>
                              <Select value={selectedPickupStationId} onValueChange={setSelectedPickupStationId}>
                                <SelectTrigger>
                                  <SelectValue placeholder={pickupStationsLoading ? "Loading pickup stations..." : "Select a pickup station"} />
                                </SelectTrigger>
                                <SelectContent>
                                  {pickupStations
                                    .filter((station) => station.isActive !== false)
                                    .map((station) => (
                                      <SelectItem key={station.id} value={station.id}>
                                        {station.name}
                                        {station.city || station.region ? ` - ${[station.city, station.region].filter(Boolean).join(", ")}` : ""}
                                      </SelectItem>
                                    ))}
                                </SelectContent>
                              </Select>
                              <Button
                                onClick={() => assignPickupStationMutation.mutate(selectedPickupStationId)}
                                disabled={!selectedPickupStationId || assignPickupStationMutation.isPending || pickupStationsLoading}
                              >
                                {assignPickupStationMutation.isPending ? "Assigning..." : "Assign to Pickup Station"}
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ) : null}

                      {showArrangeExternalDelivery ? (
                        <Card className="border-primary/30 bg-primary/5">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <Truck className="mt-0.5 h-5 w-5 text-primary" />
                              <div className="space-y-3">
                                <p className="font-medium">Arrange External Delivery</p>
                                <p className="text-sm text-muted-foreground">Send this order into the manual delivery flow once customer service has coordinated the handoff.</p>
                                <Button onClick={() => arrangeExternalDeliveryMutation.mutate()} disabled={arrangeExternalDeliveryMutation.isPending}>
                                  {arrangeExternalDeliveryMutation.isPending ? "Arranging..." : "Arrange External Delivery"}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : null}

                      {showManualExternalDeliveredButton ? (
                        <Card className="border-emerald-500/30 bg-emerald-500/5">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-3">
                              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
                              <div className="space-y-3">
                                <p className="font-medium">Complete Manual Delivery</p>
                                <p className="text-sm text-muted-foreground">Super admin confirms that the external manual delivery has been completed successfully.</p>
                                <Button onClick={() => markExternalDeliveredMutation.mutate()} disabled={markExternalDeliveredMutation.isPending}>
                                  {markExternalDeliveredMutation.isPending ? "Marking..." : "Mark Delivered"}
                                </Button>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>

                    {canVerifyPickup ? (
                      <Card className="border-amber-500/30 bg-amber-500/5">
                        <CardContent className="space-y-4 p-4">
                          <div className="flex items-start gap-3">
                            <ShieldCheck className="mt-0.5 h-5 w-5 text-amber-300" />
                            <div>
                              <p className="font-medium">Pickup Verification</p>
                              <p className="text-sm text-muted-foreground">Choose the scan option for camera verification, or switch to manual entry when you need to type the code.</p>
                            </div>
                          </div>
                          <Tabs defaultValue="scan" className="space-y-4">
                            <TabsList className="grid w-full grid-cols-2">
                              <TabsTrigger value="scan" className="gap-2">
                                <QrCode className="h-4 w-4" />
                                Scan QR
                              </TabsTrigger>
                              <TabsTrigger value="manual" className="gap-2">
                                <Keyboard className="h-4 w-4" />
                                Enter Code
                              </TabsTrigger>
                            </TabsList>
                            <TabsContent value="scan" className="mt-0">
                              <PickupVerificationScanner
                                orderId={orderDetails.id}
                                orderNumber={orderDetails.orderNumber}
                                onSuccess={refreshOrderData}
                              />
                            </TabsContent>
                            <TabsContent value="manual" className="mt-0">
                              <div className="space-y-4 rounded-2xl border border-amber-500/20 bg-background/40 p-4">
                                <p className="text-sm text-muted-foreground">
                                  Type either the buyer QR value or the 6-digit pickup OTP. One valid method is enough to complete the pickup.
                                </p>
                                <div className="grid gap-3 md:grid-cols-2">
                                  <Input value={pickupVerificationQr} onChange={(e) => setPickupVerificationQr(e.target.value)} placeholder="Buyer QR code" />
                                  <Input value={pickupVerificationOtp} onChange={(e) => setPickupVerificationOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit pickup OTP" />
                                </div>
                                <Button
                                  onClick={() => verifyCustomerPickupMutation.mutate({ qrCode: pickupVerificationQr.trim() || undefined, otp: pickupVerificationOtp.trim() || undefined })}
                                  disabled={verifyCustomerPickupMutation.isPending || (!pickupVerificationQr.trim() && !pickupVerificationOtp.trim())}
                                >
                                  {verifyCustomerPickupMutation.isPending ? "Verifying..." : "Verify Pickup"}
                                </Button>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                      </Card>
                    ) : null}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {orderDetails.items && orderDetails.items.length > 0 && (
                  <Card className="border-border/70">
                    <CardHeader>
                      <CardTitle>Order Items</CardTitle>
                      <CardDescription>{orderDetails.items.length} item{orderDetails.items.length !== 1 ? "s" : ""} in this order</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {orderDetails.items.map((item, idx) => {
                        const imgSrc = item.image || (Array.isArray(item.productImages) ? item.productImages[0] : null);
                        return (
                        <div key={item.productId || idx} className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/20 p-3">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={item.productName || "Product"}
                              className="h-14 w-14 rounded-lg object-cover flex-shrink-0 bg-muted"
                            />
                          ) : (
                            <div className="h-14 w-14 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                              <span className="text-muted-foreground text-xs">No img</span>
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{item.productName || "Unnamed product"}</p>
                            {(item.selectedColor || item.selectedSize) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[item.selectedColor, item.selectedSize].filter(Boolean).join(" · ")}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-0.5">Qty: {item.quantity}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-sm font-semibold">{formatPrice(parseFloat(item.price || "0"))}</p>
                            <p className="text-xs text-muted-foreground">each</p>
                          </div>
                        </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                )}

                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle>People Involved</CardTitle>
                    <CardDescription>Quick context before you take action.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Customer</p>
                      <p className="mt-2 font-medium">{orderDetails.customerInfo?.name || "Not available"}</p>
                      <p className="text-sm text-muted-foreground">{orderDetails.customerInfo?.email || "No email"}</p>
                      <p className="text-sm text-muted-foreground">{orderDetails.customerInfo?.phone || orderDetails.deliveryPhone || "No phone"}</p>
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4 text-primary" />
                        <p className="font-medium">{orderDetails.sellerInfo?.storeName || "Seller store"}</p>
                      </div>
                      <p className="mt-2 text-sm">{orderDetails.sellerInfo?.name || "Seller not available"}</p>
                      <p className="text-sm text-muted-foreground">{orderDetails.sellerInfo?.email || "No email"}</p>
                      <p className="text-sm text-muted-foreground">{orderDetails.sellerInfo?.phone || "No phone"}</p>
                      {orderDetails.sellerId ? (
                        <Button
                          variant="outline"
                          className="mt-4 w-full"
                          onClick={() => {
                            const params = new URLSearchParams({
                              userId: orderDetails.sellerId || "",
                              orderId: orderDetails.id,
                              orderNumber: orderDetails.orderNumber,
                              orderAction: "Order coordination",
                              orderActionOwner: "seller",
                              orderLink: `/admin/orders/${orderDetails.id}/action`,
                            });
                            navigate(`/admin/messages?${params.toString()}`);
                          }}
                        >
                          <MessageCircle className="mr-2 h-4 w-4" />
                          Message Seller
                        </Button>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Delivery Address</p>
                      <p className="mt-2 text-sm">{orderDetails.deliveryAddress || orderDetails.customerInfo?.address || "No delivery address recorded yet."}</p>
                    </div>
                    {isPickupOrder ? (
                      <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Pickup Station</p>
                        {orderDetails.pickupStationInfo ? (
                          <div className="mt-2 space-y-2 text-sm">
                            <p className="font-medium">{orderDetails.pickupStationInfo.name}</p>
                            <p className="text-muted-foreground">{orderDetails.pickupStationInfo.locationLabel || "Station location will show here once assigned."}</p>
                            <p className="text-muted-foreground">
                              Pickup agent: {orderDetails.pickupStationInfo.pickupAgentName || "Not assigned yet"}
                            </p>
                            <p className="text-muted-foreground">
                              Contact: {orderDetails.pickupStationInfo.pickupAgentPhone || "No pickup-agent phone available yet"}
                            </p>
                          </div>
                        ) : (
                          <p className="mt-2 text-sm text-muted-foreground">No pickup station has been assigned to this order yet.</p>
                        )}
                      </div>
                    ) : null}
                    <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cost Breakdown</p>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatPrice(parseFloat(orderDetails.subtotal || "0"))}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Delivery Fee</span><span>{formatPrice(parseFloat(orderDetails.deliveryFee || "0"))}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Processing Fee</span><span>{formatPrice(parseFloat(orderDetails.processingFee || "0"))}</span></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
