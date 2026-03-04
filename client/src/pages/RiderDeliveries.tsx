import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Package, MapPin, CheckCircle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Delivery {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: string;
  deliveryAddress?: string;
  buyer?: {
    name?: string;
    phone?: string;
  };
  busDeliveryWorkflow?: {
    stage?: string;
    proofSubmitted?: boolean;
  } | null;
  createdAt: string;
}

interface AssignmentOffer {
  orderId: string;
  orderNumber: string;
  deliveryAddress?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
  deliveryMethod?: string | null;
  estimatedPayout?: string | null;
  currency?: string | null;
  status?: string | null;
  offeredAt?: string | null;
  expiresAt?: string | null;
  radiusKm?: number | null;
}

export default function RiderDeliveries() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const urlParams = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const orderIdFromUrl = urlParams.get("orderId");
  const orderNumberFromUrl = (urlParams.get("orderNumber") || "").trim();
  const [statusFilter, setStatusFilter] = useState("all");
  const highlightedDeliveryRef = useRef<HTMLDivElement | null>(null);

  const { data: deliveries = [], isLoading } = useQuery<Delivery[]>({
    queryKey: ["/api/orders", "rider"],
    queryFn: async () => {
      const res = await fetch("/api/orders?context=rider", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch deliveries");
      return res.json();
    },
    refetchInterval: 20000,
  });

  const { data: assignmentOffers = [], isLoading: offersLoading } = useQuery<AssignmentOffer[]>({
    queryKey: ["/api/rider/assignment-offers"],
    queryFn: async () => {
      const res = await fetch("/api/rider/assignment-offers", { credentials: "include", cache: "no-store" });
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to fetch assignment offers");
      }
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 10000,
    staleTime: 0,
  });

  const normalizeStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "searching_rider") return "searching_rider";
    if (s === "ready_for_pickup") return "assigned";
    if (s === "assigned_to_rider") return "assigned";
    if (s === "out_for_delivery" || s === "en_route") return "in_transit";
    if (s === "completed") return "completed";
    return s || "pending";
  };

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiRequest("PATCH", `/api/orders/${id}/status`, { status });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Delivery status updated" });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey?.[0];
          if (typeof key !== "string") return false;
          return key.startsWith("/api/orders") || key.startsWith("/api/rider/active-delivery");
        },
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const assignmentOfferResponseMutation = useMutation({
    mutationFn: async ({ orderId, action }: { orderId: string; action: "accept" | "reject" }) => {
      const res = await apiRequest("POST", `/api/rider/assignment-offers/${orderId}/respond`, { action });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast({
        title: variables.action === "accept" ? "Offer accepted" : "Offer rejected",
        description:
          variables.action === "accept"
            ? "Dispatch center has been notified. Await assignment confirmation."
            : "Offer was rejected. Dispatch center can reassign.",
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey?.[0];
          if (typeof key !== "string") return false;
          return (
            key.startsWith("/api/orders") ||
            key.startsWith("/api/rider/active-delivery") ||
            key.startsWith("/api/rider/assignment-offers")
          );
        },
      });
    },
    onError: (error: any) => {
      toast({
        title: "Offer response failed",
        description: error?.message || "Could not submit offer response",
        variant: "destructive",
      });
    },
  });

  const filteredDeliveries = statusFilter === "all" 
    ? deliveries 
    : deliveries.filter(d => normalizeStatus(d.status) === statusFilter);
  const focusedDeliveryId =
    orderIdFromUrl && filteredDeliveries.some((delivery) => delivery.id === orderIdFromUrl)
      ? orderIdFromUrl
      : null;

  useEffect(() => {
    if (!focusedDeliveryId || isLoading || !highlightedDeliveryRef.current) return;
    highlightedDeliveryRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedDeliveryId, isLoading, filteredDeliveries.length]);

  const getStatusColor = (status: string) => {
    switch (normalizeStatus(status)) {
      case "pending": return "bg-yellow-500";
      case "searching_rider": return "bg-indigo-500";
      case "assigned": return "bg-blue-500";
      case "rider_arrived": return "bg-cyan-500";
      case "picked_up": return "bg-purple-500";
      case "in_transit": return "bg-orange-500";
      case "delivered": return "bg-green-500";
      case "completed": return "bg-emerald-600";
      default: return "bg-gray-500";
    }
  };

  const isBusDelivery = (delivery: Delivery) =>
    String(delivery.deliveryMethod || "").toLowerCase().trim() === "bus";
  const busStage = (delivery: Delivery) =>
    String(delivery.busDeliveryWorkflow?.stage || "").toUpperCase() || "READY";
  const busStageLabel = (delivery: Delivery) =>
    busStage(delivery).replace(/_/g, " ");
  const busProofSubmitted = (delivery: Delivery) =>
    Boolean(delivery.busDeliveryWorkflow?.proofSubmitted) || ["AWAITING_CONFIRMATION", "COMPLETED"].includes(busStage(delivery));

  return (
    <DashboardLayout role="rider">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Deliveries</h1>
            <p className="text-muted-foreground">Manage your delivery assignments</p>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Deliveries</SelectItem>
              <SelectItem value="assigned">Assigned</SelectItem>
              <SelectItem value="rider_arrived">Rider Arrived</SelectItem>
              <SelectItem value="picked_up">Picked Up</SelectItem>
              <SelectItem value="in_transit">In Transit</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {offersLoading ? (
          <Card className="mb-4 p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading assignment offers...
            </div>
          </Card>
        ) : assignmentOffers.length > 0 ? (
          <Card className="mb-4 p-4 border-primary/40 bg-primary/5" data-testid="card-assignment-offers">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Pending Assignment Offers</h2>
              <Badge variant="secondary">{assignmentOffers.length}</Badge>
            </div>
            <div className="space-y-3">
              {assignmentOffers.map((offer) => (
                <div key={offer.orderId} className="rounded-lg border bg-background p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">Order #{offer.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">{offer.deliveryAddress || "Delivery address unavailable"}</p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Radius {typeof offer.radiusKm === "number" ? `${offer.radiusKm} km` : "N/A"}
                        {" | "}
                        Expires {offer.expiresAt ? new Date(offer.expiresAt).toLocaleTimeString() : "soon"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        disabled={assignmentOfferResponseMutation.isPending}
                        onClick={() =>
                          assignmentOfferResponseMutation.mutate({
                            orderId: offer.orderId,
                            action: "accept",
                          })
                        }
                        data-testid={`button-offer-accept-${offer.orderId}`}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={assignmentOfferResponseMutation.isPending}
                        onClick={() =>
                          assignmentOfferResponseMutation.mutate({
                            orderId: offer.orderId,
                            action: "reject",
                          })
                        }
                        data-testid={`button-offer-reject-${offer.orderId}`}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredDeliveries.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No deliveries</h3>
              <p className="text-muted-foreground">
                {statusFilter === "all" ? "You have no assigned deliveries" : `No ${statusFilter} deliveries`}
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {filteredDeliveries.map((delivery) => (
              <Card
                key={delivery.id}
                ref={delivery.id === focusedDeliveryId ? highlightedDeliveryRef : null}
                className={`p-4 ${delivery.id === focusedDeliveryId ? "ring-2 ring-primary/70" : ""}`}
                data-testid={`card-delivery-${delivery.id}`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-semibold">Order #{delivery.orderNumber}</p>
                        <p className="text-sm text-muted-foreground">
                          {delivery.buyer?.name || "Customer"}
                          {orderNumberFromUrl && delivery.id === focusedDeliveryId ? ` • Ref #${orderNumberFromUrl}` : ""}
                        </p>
                      </div>
                    </div>
                    {delivery.id === focusedDeliveryId && (
                      <Badge variant="outline" className="text-[10px]">
                        Referenced
                      </Badge>
                    )}
                    <Badge className={`${getStatusColor(delivery.status)} text-white`}>
                      {normalizeStatus(delivery.status).replace("_", " ")}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-red-500" />
                      <div>
                        <p className="font-medium">{isBusDelivery(delivery) ? "Bus Station / Handoff" : "Delivery"}</p>
                        <p className="text-muted-foreground">{delivery.deliveryAddress || "N/A"}</p>
                        {isBusDelivery(delivery) && (
                          <p className="text-[11px] text-muted-foreground mt-1">
                            BUS Stage: <span className="font-medium text-foreground">{busStageLabel(delivery)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {normalizeStatus(delivery.status) === "assigned" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: delivery.id, status: "rider_arrived" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-arrived-${delivery.id}`}
                      >
                        Mark as Arrived
                      </Button>
                    )}
                    {normalizeStatus(delivery.status) === "rider_arrived" && (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled
                          data-testid={`button-pickup-locked-${delivery.id}`}
                        >
                          Await Seller Verification
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Seller/admin must verify rider handoff with QR or OTP.
                        </p>
                      </div>
                    )}
                    {normalizeStatus(delivery.status) === "picked_up" && (
                      <Button
                        size="sm"
                        onClick={() => updateStatusMutation.mutate({ id: delivery.id, status: "in_transit" })}
                        disabled={updateStatusMutation.isPending}
                        data-testid={`button-intransit-${delivery.id}`}
                      >
                        Mark as In Transit
                      </Button>
                    )}
                    {normalizeStatus(delivery.status) === "in_transit" && (
                      isBusDelivery(delivery) ? (
                        <div className="w-full space-y-3">
                          {busProofSubmitted(delivery) ? (
                            <div className="rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30 p-3 text-xs">
                              <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">Awaiting Super Admin Confirmation</p>
                              <p className="text-blue-800 dark:text-blue-100">
                                BUS proof already submitted. Current stage: {busStageLabel(delivery)}.
                              </p>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              onClick={() => navigate(`/rider/route?orderId=${delivery.id}`)}
                              data-testid={`button-bus-proof-${delivery.id}`}
                            >
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Submit BUS Transport Proof
                            </Button>
                          )}
                          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 text-xs">
                            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-2">BUS Delivery Workflow</p>
                            <ol className="list-decimal pl-4 space-y-1 text-amber-800 dark:text-amber-100">
                              <li>Deliver package to bus station and handoff to transport operator.</li>
                              <li>Submit receipt photo and bus driver phone in the Bus Proof tab.</li>
                              <li>Super admin verifies and completes the order.</li>
                            </ol>
                          </div>
                        </div>
                      ) : (
                        <div className="w-full space-y-3">
                          <Button
                            size="sm"
                            className="bg-amber-600 hover:bg-amber-700 text-white"
                            onClick={() => navigate(`/rider/route?orderId=${delivery.id}`)}
                            data-testid={`button-complete-verified-${delivery.id}`}
                          >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            Pending completion (QR or OTP)
                          </Button>
                          <div className="rounded-md border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30 p-3 text-xs">
                            <p className="font-semibold text-amber-900 dark:text-amber-200 mb-2">Completion Required</p>
                            <ol className="list-decimal pl-4 space-y-1 text-amber-800 dark:text-amber-100">
                              <li>Ask buyer for either QR code or OTP.</li>
                              <li>Scan QR code or enter OTP in the verification tab.</li>
                              <li>Submit verification to complete delivery.</li>
                            </ol>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
