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

function AssignRiderDialog({ order, availableRiders: parentRiders, onSuccess }: { order: Order; availableRiders?: AvailableRider[]; onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedRiderId, setSelectedRiderId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sortBy, setSortBy] = useState<"load" | "rating" | "name">("load");
  const { toast } = useToast();

  // Use parent riders if provided, otherwise fetch
  const { data: fetchedRiders = [], isLoading: loadingRiders } = useQuery<AvailableRider[]>({
    queryKey: ["/api/riders/available"],
    enabled: open && !parentRiders,
  });

  const availableRiders = parentRiders || fetchedRiders;

  // Sort riders based on selected criteria
  const sortedRiders = useMemo(() => {
    const riders = [...availableRiders];
    switch (sortBy) {
      case "load":
        return riders.sort((a, b) => a.activeOrderCount - b.activeOrderCount);
      case "rating":
        return riders.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
      case "name":
        return riders.sort((a, b) => (a.rider.name || "").localeCompare(b.rider.name || ""));
      default:
        return riders;
    }
  }, [availableRiders, sortBy]);

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
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                  <SelectTrigger className="w-[140px] h-8 text-xs">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="load">Lowest Load</SelectItem>
                    <SelectItem value="rating">Highest Rating</SelectItem>
                    <SelectItem value="name">Name A-Z</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {loadingRiders && !parentRiders ? (
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
                    const isRecommended = riderData.activeOrderCount === 0;
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
                                  <Badge className="bg-green-500 text-white text-xs">Available</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground truncate">{riderData.rider.email}</p>
                              {riderData.rider.phone && (
                                <p className="text-xs text-muted-foreground">{riderData.rider.phone}</p>
                              )}
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

  // Fetch all orders
  const { data: orders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 30000,
  });

  // Fetch available riders
  const { data: availableRiders = [], isLoading: ridersLoading, refetch: refetchRiders } = useQuery<AvailableRider[]>({
    queryKey: ["/api/riders/available"],
    queryFn: async () => {
      const res = await fetch("/api/riders/available", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch riders");
      return res.json();
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
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
  const { data: zones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/delivery-zones"],
    enabled: isAuthenticated,
  });

  // Real-time updates
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
    };

    socket.on("order_rider_assigned", handleUpdate);
    socket.on("order_status_updated", handleUpdate);
    socket.on("rider_location_updated", handleUpdate);

    return () => {
      socket.off("order_rider_assigned", handleUpdate);
      socket.off("order_status_updated", handleUpdate);
      socket.off("rider_location_updated", handleUpdate);
    };
  }, [socket]);

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

  // Filter orders that need rider assignment
  const unassignedOrders = useMemo(() => {
    return orders.filter(order => 
      !order.riderId && 
      order.deliveryMethod !== "pickup" &&
      ["pending", "confirmed", "processing", "ready"].includes(normalizeOrderStatus(order.status))
    );
  }, [orders]);

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
      return res;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Auto-Dispatch Complete",
        description: data.message || `${data.assignedCount || 0} orders assigned automatically`,
      });
      refetch();
      refetchRiders();
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
              onClick={() => { refetch(); refetchRiders(); }}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
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
                            availableRiders={availableRiders}
                            onSuccess={() => {
                              refetch();
                              refetchRiders();
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
  const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();
