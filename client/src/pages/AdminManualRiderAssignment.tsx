import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSocket } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, UserCheck, Package, Truck, AlertCircle, CheckCircle2, MapPin, Clock, Users, Search, RefreshCw, Activity, Circle, Timer, Navigation, Star, Phone, Mail, Bolt } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";

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
  updatedAt?: string;
  shippingAddress?: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
  deliveryZoneId?: string;
  paymentStatus?: string;
  buyer?: { id: string; name: string; email?: string; phone?: string };
  seller?: { id: string; name: string; storeName?: string };
}

interface AvailableRider {
  rider: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    profileImage: string | null;
    isActive: boolean;
    deliveryZoneId?: string;
    lastLocationLat?: number;
    lastLocationLng?: number;
    lastLocationUpdate?: string;
  };
  activeOrderCount: number;
  totalDeliveries?: number;
  avgRating?: number;
  distanceToOrder?: number;
  zoneMatched?: boolean;
  sellerZoneMatched?: boolean;
}

interface DeliveryZone {
  id: string;
  name: string;
  city?: string | null;
  region?: string | null;
  type?: "city" | "region";
  isActive: boolean;
}

interface RiderStats {
  totalRiders: number;
  activeRiders: number;
  inactiveRiders: number;
  ridersOnDelivery: number;
  avgLoad: number;
}

interface ActiveAssignmentAttempt {
  riderId: string;
  riderName: string;
  distanceKm: number | null;
  offeredAt: string;
  resolvedAt?: string;
  status: "offered" | "accepted" | "accepted_pending_admin" | "rejected" | "timed_out" | "failed";
  reason?: string;
}

interface ActiveAssignment {
  orderId: string;
  orderNumber: string;
  startedAt: string;
  expiresAt: string | null;
  currentRiderId: string | null;
  currentCandidateIndex: number;
  currentRadiusKm: number;
  candidateCount: number;
  acceptedRiderId: string | null;
  manualConfirmationRequired: boolean;
  attempts: ActiveAssignmentAttempt[];
  lastError: string | null;
}

function AssignRiderDialog({ order, onSuccess }: { order: Order; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sortBy, setSortBy] = useState<"recommended" | "load" | "rating" | "distance" | "name">("recommended");
  const { toast } = useToast();

  const { data: availableRiders = [], isLoading: loadingRiders, refetch: refetchRidersForOrder, isFetching: ridersRefreshing } = useQuery<AvailableRider[]>({
    queryKey: [
      "/api/admin/available-riders",
      order.id,
      order.deliveryLatitude,
      order.deliveryLongitude,
      order.deliveryZoneId,
      order.sellerId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (order.deliveryLatitude) params.set("orderLat", String(order.deliveryLatitude));
      if (order.deliveryLongitude) params.set("orderLng", String(order.deliveryLongitude));
      if (order.deliveryZoneId) params.set("orderZoneId", String(order.deliveryZoneId));
      if (order.sellerId) params.set("sellerId", String(order.sellerId));

      const endpoint = `/api/admin/available-riders${params.toString() ? `?${params.toString()}` : ""}`;
      try {
        const res = await fetch(endpoint, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch ranked riders");
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map((item: any) => ({
          rider: {
            id: String(item.id || ""),
            name: String(item.name || ""),
            email: String(item.email || ""),
            phone: item.phone ? String(item.phone) : null,
            profileImage: item.profileImage || null,
            isActive: item.isAvailable !== false,
            deliveryZoneId: item.zoneId || undefined,
          },
          activeOrderCount: Number(item.activeOrderCount || 0),
          totalDeliveries: Number.isFinite(Number(item.totalDeliveries)) ? Number(item.totalDeliveries) : undefined,
          avgRating: Number.isFinite(Number(item.avgRating)) ? Number(item.avgRating) : undefined,
          distanceToOrder: Number.isFinite(Number(item.distanceToOrder)) ? Number(item.distanceToOrder) : undefined,
          zoneMatched: Boolean(item.zoneMatched),
          sellerZoneMatched: Boolean(item.sellerZoneMatched),
        })) as AvailableRider[];
      } catch {
        // Legacy fallback for environments where ranked endpoint is unavailable.
        const res = await fetch("/api/riders/available", { credentials: "include" });
        if (!res.ok) throw new Error("Failed to fetch available riders");
        const data = await res.json();
        return Array.isArray(data) ? data : [];
      }
    },
    enabled: open,
    staleTime: 0,
  });

  const recommendedRiderId = useMemo(() => availableRiders[0]?.rider?.id || null, [availableRiders]);

  useEffect(() => {
    if (!open) {
      setSelectedRiderId(null);
      return;
    }
    const selectedStillAvailable = selectedRiderId && availableRiders.some((r) => r.rider.id === selectedRiderId);
    if (!selectedStillAvailable && recommendedRiderId) {
      setSelectedRiderId(recommendedRiderId);
    }
  }, [open, availableRiders, selectedRiderId, recommendedRiderId]);

  // Sort riders based on selected criteria
  const sortedRiders = useMemo(() => {
    const riders = [...availableRiders];
    switch (sortBy) {
      case "recommended":
        return riders.sort((a, b) => {
          const aRecommended = a.rider.id === recommendedRiderId;
          const bRecommended = b.rider.id === recommendedRiderId;
          if (aRecommended !== bRecommended) return aRecommended ? -1 : 1;
          if (!!a.zoneMatched !== !!b.zoneMatched) return a.zoneMatched ? -1 : 1;
          if (!!a.sellerZoneMatched !== !!b.sellerZoneMatched) return a.sellerZoneMatched ? -1 : 1;
          const distanceA = typeof a.distanceToOrder === "number" ? a.distanceToOrder : Number.MAX_SAFE_INTEGER;
          const distanceB = typeof b.distanceToOrder === "number" ? b.distanceToOrder : Number.MAX_SAFE_INTEGER;
          if (distanceA !== distanceB) return distanceA - distanceB;
          if (a.activeOrderCount !== b.activeOrderCount) return a.activeOrderCount - b.activeOrderCount;
          return (a.rider.name || "").localeCompare(b.rider.name || "");
        });
      case "load":
        return riders.sort((a, b) => a.activeOrderCount - b.activeOrderCount);
      case "rating":
        return riders.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
      case "distance":
        return riders.sort((a, b) => {
          const distanceA = typeof a.distanceToOrder === "number" ? a.distanceToOrder : Number.MAX_SAFE_INTEGER;
          const distanceB = typeof b.distanceToOrder === "number" ? b.distanceToOrder : Number.MAX_SAFE_INTEGER;
          if (distanceA !== distanceB) return distanceA - distanceB;
          return a.activeOrderCount - b.activeOrderCount;
        });
      case "name":
        return riders.sort((a, b) => (a.rider.name || "").localeCompare(b.rider.name || ""));
      default:
        return riders;
    }
  }, [availableRiders, sortBy, recommendedRiderId]);

  const assignMutation = useMutation({
    mutationFn: async (riderId: string) => {
      return apiRequest("PATCH", `/api/orders/${order.id}/assign-rider`, {
        riderId,
      });
    },
    onSuccess: () => {
      toast({
        title: "Rider Assigned",
        description: `Rider successfully assigned to order ${order.orderNumber}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      setOpen(false);
      setShowConfirm(false);
      setSelectedRiderId(null);
      onSuccess();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Assignment Failed",
        description: error.message || "Failed to assign rider",
      });
      setShowConfirm(false);
    },
  });

  const selectedRider = availableRiders.find(r => r.rider.id === selectedRiderId);

  const handleAssign = () => {
    if (selectedRiderId) {
      assignMutation.mutate(selectedRiderId);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" data-testid={`button-assign-rider-${order.id}`}>
            <UserCheck className="h-4 w-4 mr-2" />
            Assign Rider
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" data-testid={`dialog-assign-rider-${order.id}`}>
          <DialogHeader>
            <DialogTitle>Assign Rider to Order</DialogTitle>
            <DialogDescription>
              Select a rider to deliver order {order.orderNumber}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Order Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Number:</span>
                  <span className="font-medium">{order.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Delivery Method:</span>
                  <Badge variant="secondary">{order.deliveryMethod}</Badge>
                </div>
                {order.shippingAddress && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Address:</span>
                    <span className="font-medium text-right max-w-xs">{order.shippingAddress}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">Available Riders ({sortedRiders.length})</h3>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => refetchRidersForOrder()}
                    disabled={ridersRefreshing}
                  >
                    {ridersRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Sort by" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="recommended">Recommended</SelectItem>
                      <SelectItem value="distance">Nearest First</SelectItem>
                      <SelectItem value="load">Lowest Load</SelectItem>
                      <SelectItem value="rating">Highest Rating</SelectItem>
                      <SelectItem value="name">Name A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {loadingRiders ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : sortedRiders.length === 0 ? (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No available riders</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {sortedRiders.map((riderData) => {
                    const isRecommended = riderData.rider.id === recommendedRiderId;
                    return (
                      <Card
                        key={riderData.rider.id}
                        className={`cursor-pointer transition-all ${
                          selectedRiderId === riderData.rider.id
                            ? "border-primary bg-primary/5 ring-2 ring-primary"
                            : "hover:bg-muted/50"
                        } ${isRecommended ? "border-green-200 dark:border-green-900" : ""}`}
                        onClick={() => setSelectedRiderId(riderData.rider.id)}
                        data-testid={`card-rider-${riderData.rider.id}`}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <Avatar className="h-12 w-12">
                                <AvatarImage src={riderData.rider.profileImage || undefined} />
                                <AvatarFallback>{(riderData.rider.name || "R").charAt(0)}</AvatarFallback>
                              </Avatar>
                              {riderData.rider.isActive !== false && (
                                <Circle className="absolute -bottom-1 -right-1 h-3 w-3 text-green-500 fill-green-500" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold truncate">{riderData.rider.name}</h4>
                                {isRecommended && (
                                  <Badge className="bg-emerald-600 text-white text-xs">Recommended</Badge>
                                )}
                                {!isRecommended && riderData.zoneMatched && (
                                  <Badge variant="secondary" className="text-xs">Zone Match</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{riderData.rider.email}</p>
                              {riderData.rider.phone && (
                                <p className="text-xs text-muted-foreground">{riderData.rider.phone}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                {typeof riderData.distanceToOrder === "number" && (
                                  <p className="text-xs text-muted-foreground">{riderData.distanceToOrder.toFixed(1)} km away</p>
                                )}
                                {riderData.sellerZoneMatched && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Seller Zone</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-center px-2">
                                <div className={`text-xl font-bold ${
                                  riderData.activeOrderCount === 0 ? "text-green-500" :
                                  riderData.activeOrderCount >= 3 ? "text-red-500" :
                                  "text-primary"
                                }`}>
                                  {riderData.activeOrderCount}
                                </div>
                                <div className="text-xs text-muted-foreground">Active</div>
                              </div>
                              {riderData.avgRating && (
                                <div className="text-center px-2">
                                  <div className="flex items-center text-lg font-bold">
                                    <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 mr-1" />
                                    {riderData.avgRating.toFixed(1)}
                                  </div>
                                  <div className="text-xs text-muted-foreground">Rating</div>
                                </div>
                              )}
                              {selectedRiderId === riderData.rider.id && (
                                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0" />
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-assign"
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                disabled={!selectedRiderId || assignMutation.isPending}
                onClick={() => setShowConfirm(true)}
                data-testid="button-confirm-assign"
              >
                {assignMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <UserCheck className="h-4 w-4 mr-2" />
                    Assign Selected Rider
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent data-testid="alert-confirm-assignment">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Rider Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to assign <strong>{selectedRider?.rider.name}</strong> to deliver order <strong>{order.orderNumber}</strong>?
              {selectedRider && selectedRider.activeOrderCount > 0 && (
                <div className="mt-2 text-amber-600 dark:text-amber-400">
                  Note: This rider currently has {selectedRider.activeOrderCount} active {selectedRider.activeOrderCount === 1 ? "order" : "orders"}.
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-confirm">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleAssign}
              disabled={assignMutation.isPending}
              data-testid="button-confirm-final"
            >
              {assignMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Confirm Assignment"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AdminManualRiderAssignment() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const socket = useSocket();
  const [searchQuery, setSearchQuery] = useState("");
  const [zoneFilter, setZoneFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Backend-authoritative pending rider-assignment queue
  const {
    data: pendingOrders = [],
    isLoading,
    refetch: refetchPendingOrders,
    isFetching: isPendingOrdersFetching,
    dataUpdatedAt: pendingOrdersUpdatedAt,
  } = useQuery<Order[]>({
    queryKey: ["/api/admin/pending-orders"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pending-orders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch pending orders");
      const payload = await res.json();
      if (!Array.isArray(payload)) return [];
      return payload.map((order: any) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        buyerId: "",
        sellerId: order.sellerId,
        riderId: null,
        deliveryMethod: "rider",
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
        shippingAddress: order.deliveryAddress || null,
        deliveryAddress: order.deliveryAddress || null,
        deliveryPhone: order.deliveryPhone || null,
        deliveryLatitude: order.deliveryLatitude ? String(order.deliveryLatitude) : undefined,
        deliveryLongitude: order.deliveryLongitude ? String(order.deliveryLongitude) : undefined,
        deliveryZoneId: order.deliveryZoneId || undefined,
        paymentStatus: "completed",
        buyer: {
          id: "",
          name: order.buyerName || "Buyer",
          email: order.buyerEmail || undefined,
          phone: order.buyerPhone || undefined,
        },
      })) as Order[];
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 10000,
    staleTime: 0,
  });

  // Fetch available riders
  const { data: availableRiders = [], isLoading: ridersLoading, refetch: refetchRiders, isFetching: isRidersFetching, dataUpdatedAt: ridersUpdatedAt } = useQuery<AvailableRider[]>({
    queryKey: ["/api/riders/available"],
    queryFn: async () => {
      const res = await fetch("/api/riders/available", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch riders");
      return res.json();
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 15000,
    staleTime: 0,
  });

  const {
    data: activeAssignments = [],
    refetch: refetchActiveAssignments,
    isFetching: isActiveAssignmentsFetching,
    dataUpdatedAt: activeAssignmentsUpdatedAt,
  } = useQuery<ActiveAssignment[]>({
    queryKey: ["/api/admin/rider-assignment/active"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rider-assignment/active", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch active assignments");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 5000,
    staleTime: 0,
  });

  // Fetch all riders for stats
  const { data: allRiders = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await fetch("/api/admin/users?role=rider", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return data.filter((u: any) => u.role === "rider");
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Fetch delivery zones
  const { data: zones = [], refetch: refetchZones } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/delivery-zones"],
    enabled: isAuthenticated,
  });

  // Real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-assignment/active"] });
    };

    const handleAssignmentFailure = (payload: { orderNumber?: string; reason?: string }) => {
      toast({
        variant: "destructive",
        title: payload?.orderNumber ? `Assignment Failed • #${payload.orderNumber}` : "Rider Assignment Failed",
        description: payload?.reason || "No rider accepted this order. Manual review is required.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-assignment/active"] });
    };

    socket.on("order_rider_assigned", handleUpdate);
    socket.on("order_status_updated", handleUpdate);
    socket.on("rider_location_updated", handleUpdate);
    socket.on("order_rider_assignment_failed", handleAssignmentFailure);

    return () => {
      socket.off("order_rider_assigned", handleUpdate);
      socket.off("order_status_updated", handleUpdate);
      socket.off("rider_location_updated", handleUpdate);
      socket.off("order_rider_assignment_failed", handleAssignmentFailure);
    };
  }, [socket, toast]);

  // Calculate rider stats
  const riderStats = useMemo<RiderStats>(() => {
    const activeRiders = allRiders.filter((r: any) => r.isActive !== false && r.approvalStatus === "approved");
    const inactiveRiders = allRiders.filter((r: any) => r.isActive === false || r.approvalStatus !== "approved");
    const ridersOnDelivery = availableRiders.filter(r => r.activeOrderCount > 0).length;
    const totalLoad = availableRiders.reduce((sum, r) => sum + r.activeOrderCount, 0);
    
    return {
      totalRiders: allRiders.length,
      activeRiders: activeRiders.length,
      inactiveRiders: inactiveRiders.length,
      ridersOnDelivery,
      avgLoad: availableRiders.length > 0 ? totalLoad / availableRiders.length : 0,
    };
  }, [allRiders, availableRiders]);

  // Orders that are already validated by backend for rider assignment
  const unassignedOrders = useMemo(() => {
    return pendingOrders.filter((order) => !order.riderId);
  }, [pendingOrders]);

  const activeAssignmentsByOrderId = useMemo(() => {
    const mapped = new Map<string, ActiveAssignment>();
    activeAssignments.forEach((assignment) => {
      if (assignment.orderId) mapped.set(assignment.orderId, assignment);
    });
    return mapped;
  }, [activeAssignments]);

  const lastSyncedAt = useMemo(() => {
    const timestamps = [pendingOrdersUpdatedAt, ridersUpdatedAt, activeAssignmentsUpdatedAt].filter(
      (value): value is number => typeof value === "number" && value > 0
    );
    if (timestamps.length === 0) return null;
    return new Date(Math.max(...timestamps));
  }, [pendingOrdersUpdatedAt, ridersUpdatedAt, activeAssignmentsUpdatedAt]);

  // Calculate order priority based on age
  const getOrderPriority = (order: Order): "critical" | "high" | "medium" | "low" => {
    const minutes = differenceInMinutes(new Date(), new Date(order.createdAt));
    if (minutes > 60) return "critical";
    if (minutes > 30) return "high";
    if (minutes > 15) return "medium";
    return "low";
  };

  // Apply filters
  const filteredOrders = useMemo(() => {
    let filtered = unassignedOrders;
    
    if (zoneFilter !== "all") {
      filtered = filtered.filter(o => o.deliveryZoneId === zoneFilter);
    }
    
    if (priorityFilter !== "all") {
      filtered = filtered.filter(o => getOrderPriority(o) === priorityFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.orderNumber?.toLowerCase().includes(query) ||
        o.deliveryAddress?.toLowerCase().includes(query) ||
        o.shippingAddress?.toLowerCase().includes(query) ||
        o.buyer?.name?.toLowerCase().includes(query) ||
        o.buyer?.email?.toLowerCase().includes(query) ||
        o.buyer?.phone?.toLowerCase().includes(query)
      );
    }
    
    // Sort by priority (oldest first)
    return filtered.sort((a, b) => 
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [unassignedOrders, zoneFilter, priorityFilter, searchQuery]);

  // Group riders by zone
  const ridersByZone = useMemo(() => {
    const grouped: Record<string, AvailableRider[]> = { unassigned: [] };
    zones.forEach(zone => { grouped[zone.id] = []; });
    
    availableRiders.forEach(rider => {
      const zoneId = rider.rider.deliveryZoneId || "unassigned";
      if (!grouped[zoneId]) grouped[zoneId] = [];
      grouped[zoneId].push(rider);
    });
    
    return grouped;
  }, [availableRiders, zones]);

  // Auto-dispatch mutation
  const autoDispatchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/auto-dispatch");
      return res.json();
    },
    onSuccess: (data: any) => {
      const matchingStarted = Number(data?.matchingStarted || 0);
      const pending = Number(data?.pending || 0);
      toast({
        title: "Auto-Dispatch Complete",
        description:
          data?.message ||
          (matchingStarted > 0
            ? `${matchingStarted} order${matchingStarted === 1 ? "" : "s"} moved into live rider matching${pending > 0 ? ` (${pending} still pending)` : ""}`
            : "No eligible orders required dispatch"),
      });
      refetchPendingOrders();
      refetchRiders();
      refetchActiveAssignments();
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Auto-Dispatch Failed",
        description: error.message || "Failed to auto-dispatch orders",
      });
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "critical": return "bg-red-500 text-white";
      case "high": return "bg-orange-500 text-white";
      case "medium": return "bg-yellow-500 text-white";
      case "low": return "bg-green-500 text-white";
      default: return "bg-gray-500";
    }
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case "critical": return <AlertCircle className="h-4 w-4" />;
      case "high": return <Timer className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  const isRealtimeSyncing =
    isPendingOrdersFetching || isRidersFetching || isActiveAssignmentsFetching || autoDispatchMutation.isPending;

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-foreground" data-testid="heading-manual-rider-assignment">
                Rider Dispatch Center
              </h1>
              <p className="text-muted-foreground text-sm">
                Manage rider assignments and auto-dispatch deliveries
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => {
                refetchPendingOrders();
                refetchRiders();
                refetchZones();
                refetchActiveAssignments();
              }}
              disabled={isRealtimeSyncing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRealtimeSyncing ? "animate-spin" : ""}`} />
              {isRealtimeSyncing ? "Syncing..." : "Refresh"}
            </Button>
            <Button 
              size="sm"
              onClick={() => autoDispatchMutation.mutate()}
              disabled={autoDispatchMutation.isPending || unassignedOrders.length === 0}
              className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600"
            >
              {autoDispatchMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Bolt className="h-4 w-4 mr-2" />
              )}
              Auto-Dispatch All
            </Button>
          </div>
        </div>

        <Card
          className="border-primary/30 bg-gradient-to-r from-primary/10 via-background to-emerald-500/10 shadow-sm"
          data-testid="dispatch-live-status-bar"
        >
          <CardContent className="py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${isRealtimeSyncing ? "bg-amber-500 animate-pulse" : "bg-emerald-500 animate-pulse"}`} />
                <div>
                  <p className="text-sm font-semibold">
                    {isRealtimeSyncing ? "Synchronizing dispatch data..." : "Live dispatch data connected"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {lastSyncedAt
                      ? `Last sync ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`
                      : "Waiting for first data sync"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="gap-1">
                  <Activity className="h-3.5 w-3.5" />
                  Active Matching: {activeAssignments.length}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <Package className="h-3.5 w-3.5" />
                  Pending Queue: {unassignedOrders.length}
                </Badge>
              </div>
            </div>
            <div className="mt-3 h-1.5 rounded-full bg-muted/70 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  isRealtimeSyncing ? "w-1/2 bg-amber-500 animate-pulse" : "w-full bg-emerald-500"
                }`}
              />
            </div>

            {activeAssignments.length > 0 && (
              <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {activeAssignments.slice(0, 3).map((assignment) => {
                  const pendingAttempt = assignment.attempts?.find((attempt) => attempt.status === "offered");
                  return (
                    <div key={assignment.orderId} className="rounded-md border bg-background/70 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">#{assignment.orderNumber}</p>
                        <Badge variant="outline" className="text-[10px] px-2 py-0">
                          Radius {assignment.currentRadiusKm}km
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {pendingAttempt
                          ? `Offering ${pendingAttempt.riderName}`
                          : "Matching in progress"}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-xl font-bold">{unassignedOrders.length}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <div>
                <p className="text-xs text-muted-foreground">Total Riders</p>
                <p className="text-xl font-bold">{riderStats.totalRiders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Circle className="h-5 w-5 text-green-500 fill-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Active</p>
                <p className="text-xl font-bold">{riderStats.activeRiders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Circle className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-xs text-muted-foreground">Inactive</p>
                <p className="text-xl font-bold">{riderStats.inactiveRiders}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-purple-500" />
              <div>
                <p className="text-xs text-muted-foreground">On Delivery</p>
                <p className="text-xl font-bold">{riderStats.ridersOnDelivery}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-xs text-muted-foreground">Avg Load</p>
                <p className="text-xl font-bold">{riderStats.avgLoad.toFixed(1)}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="pending" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Pending ({filteredOrders.length})
            </TabsTrigger>
            <TabsTrigger value="riders" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Riders ({availableRiders.length})
            </TabsTrigger>
            <TabsTrigger value="zones" className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Zones ({zones.length})
            </TabsTrigger>
          </TabsList>

          {/* Pending Orders Tab */}
          <TabsContent value="pending" className="mt-4 space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by order # or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priorities</SelectItem>
                  <SelectItem value="critical">Critical (&gt;60min)</SelectItem>
                  <SelectItem value="high">High (&gt;30min)</SelectItem>
                  <SelectItem value="medium">Medium (&gt;15min)</SelectItem>
                  <SelectItem value="low">Low (&lt;15min)</SelectItem>
                </SelectContent>
              </Select>
              <Select value={zoneFilter} onValueChange={setZoneFilter}>
                <SelectTrigger className="w-full sm:w-[160px]">
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Zones</SelectItem>
                  {zones.map(zone => (
                    <SelectItem key={zone.id} value={zone.id}>{zone.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <CheckCircle2 className="h-16 w-16 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-semibold mb-2">All Caught Up!</h3>
                  <p className="text-muted-foreground">
                    No orders pending rider assignment.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => {
                  const priority = getOrderPriority(order);
                  const waitTime = differenceInMinutes(new Date(), new Date(order.createdAt));
                  const activeAssignment = activeAssignmentsByOrderId.get(order.id);
                  const activeOffer = activeAssignment?.attempts?.find((attempt) => attempt.status === "offered");
                  
                  return (
                    <Card 
                      key={order.id} 
                      className={`p-4 border-l-4 ${
                        priority === "critical" ? "border-l-red-500" :
                        priority === "high" ? "border-l-orange-500" :
                        priority === "medium" ? "border-l-yellow-500" :
                        "border-l-green-500"
                      }`}
                      data-testid={`card-order-${order.id}`}
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-semibold">#{order.orderNumber}</h3>
                            <Badge className={getPriorityColor(priority)}>
                              {getPriorityIcon(priority)}
                              <span className="ml-1">{priority.toUpperCase()}</span>
                            </Badge>
                            <Badge variant="outline">{order.status}</Badge>
                            {activeAssignment && (
                              <Badge variant="secondary" className="bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20">
                                Live Matching
                              </Badge>
                            )}
                            <span className="text-sm text-muted-foreground">
                              Waiting {waitTime} min
                            </span>
                          </div>
                          
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            <span className="font-medium text-foreground">
                              {formatPrice(parseFloat(order.total))}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {order.deliveryAddress || order.shippingAddress || "No address"}
                            </span>
                            {order.buyer?.name && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {order.buyer.name}
                              </span>
                            )}
                            {order.buyer?.email && (
                              <span className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {order.buyer.email}
                              </span>
                            )}
                            {(order.deliveryPhone || order.buyer?.phone) && (
                              <span className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                              {order.deliveryPhone || order.buyer?.phone}
                            </span>
                          )}
                          {activeAssignment && (
                            <span className="text-xs text-indigo-600 dark:text-indigo-300">
                              {activeOffer
                                ? `Offering ${activeOffer.riderName}`
                                : `Candidate ${Math.max(activeAssignment.currentCandidateIndex, 1)} of ${Math.max(activeAssignment.candidateCount, 1)}`}
                            </span>
                          )}
                        </div>

                          {/* Wait time progress bar */}
                          <div className="w-full max-w-xs">
                            <Progress 
                              value={Math.min((waitTime / 60) * 100, 100)} 
                              className={`h-1 ${
                                priority === "critical" ? "[&>div]:bg-red-500" :
                                priority === "high" ? "[&>div]:bg-orange-500" :
                                priority === "medium" ? "[&>div]:bg-yellow-500" :
                                "[&>div]:bg-green-500"
                              }`}
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <AssignRiderDialog
                            order={order}
                            onSuccess={() => {
                              refetchPendingOrders();
                              refetchRiders();
                              refetchActiveAssignments();
                            }}
                          />
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* Riders Tab */}
          <TabsContent value="riders" className="mt-4">
            {ridersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : availableRiders.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Available Riders</h3>
                  <p className="text-muted-foreground">
                    All riders are currently offline or at capacity.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {availableRiders.map((riderData) => (
                  <Card key={riderData.rider.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <Avatar className="h-12 w-12">
                          <AvatarImage src={riderData.rider.profileImage || undefined} />
                          <AvatarFallback>{riderData.rider.name?.charAt(0) || "R"}</AvatarFallback>
                        </Avatar>
                        <Circle 
                          className={`absolute -bottom-1 -right-1 h-4 w-4 ${
                            riderData.rider.isActive !== false ? "text-green-500 fill-green-500" : "text-gray-400"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold truncate">{riderData.rider.name}</h4>
                        <p className="text-sm text-muted-foreground truncate">{riderData.rider.email}</p>
                        {riderData.rider.phone && (
                          <a 
                            href={`tel:${riderData.rider.phone}`}
                            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
                          >
                            <Phone className="h-3 w-3" />
                            {riderData.rider.phone}
                          </a>
                        )}
                      </div>
                    </div>
                    
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="bg-muted rounded-lg p-2 text-center">
                        <p className="text-2xl font-bold text-primary">{riderData.activeOrderCount}</p>
                        <p className="text-xs text-muted-foreground">Active Orders</p>
                      </div>
                      <div className="bg-muted rounded-lg p-2 text-center">
                        <p className="text-2xl font-bold text-emerald-600">{riderData.totalDeliveries || 0}</p>
                        <p className="text-xs text-muted-foreground">Total Deliveries</p>
                      </div>
                    </div>

                    {riderData.avgRating && (
                      <div className="mt-2 flex items-center gap-1 text-sm">
                        <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        <span className="font-medium">{riderData.avgRating.toFixed(1)}</span>
                        <span className="text-muted-foreground">rating</span>
                      </div>
                    )}

                    {riderData.rider.lastLocationUpdate && (
                      <p className="mt-2 text-xs text-muted-foreground flex items-center gap-1">
                        <Navigation className="h-3 w-3" />
                        Updated {formatDistanceToNow(new Date(riderData.rider.lastLocationUpdate), { addSuffix: true })}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Zones Tab */}
          <TabsContent value="zones" className="mt-4">
            {zones.length === 0 ? (
              <Card className="p-12">
                <div className="text-center">
                  <MapPin className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No Delivery Zones</h3>
                  <p className="text-muted-foreground">
                    Configure delivery zones in settings to enable zone-based dispatch.
                  </p>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {zones.map(zone => {
                  const zoneRiders = ridersByZone[zone.id] || [];
                  const activeCount = zoneRiders.filter(r => r.rider.isActive !== false).length;
                  const ordersInZone = unassignedOrders.filter(o => o.deliveryZoneId === zone.id).length;
                  
                  return (
                    <Card key={zone.id} className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-semibold">{zone.name}</h4>
                          <p className="text-sm text-muted-foreground">{zone.city || zone.region || "Not specified"}</p>
                        </div>
                        <Badge variant={zone.isActive ? "default" : "secondary"}>
                          {zone.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="bg-muted rounded-lg p-2">
                          <p className="text-lg font-bold text-blue-500">{zoneRiders.length}</p>
                          <p className="text-xs text-muted-foreground">Riders</p>
                        </div>
                        <div className="bg-muted rounded-lg p-2">
                          <p className="text-lg font-bold text-green-500">{activeCount}</p>
                          <p className="text-xs text-muted-foreground">Active</p>
                        </div>
                        <div className="bg-muted rounded-lg p-2">
                          <p className="text-lg font-bold text-orange-500">{ordersInZone}</p>
                          <p className="text-xs text-muted-foreground">Pending</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
