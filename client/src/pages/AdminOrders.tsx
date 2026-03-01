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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatDistanceToNow } from "date-fns";

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
}

interface OrderStats {
  total: number;
  pending: number;
  processing: number;
  enRoute: number;
  delivered: number;
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

  const { data: orderDetails, isLoading } = useQuery({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
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
    enabled: open,
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
  const completeBusOrderMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/orders/${orderId}/bus-complete`, {});
    },
    onSuccess: () => {
      toast({
        title: "BUS order completed",
        description: "Super admin verification completed successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
    },
    onError: (error: any) => {
      toast({
        title: "Completion failed",
        description: error.message || "Failed to complete BUS order",
        variant: "destructive",
      });
    },
  });

  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const isPickupMethod = (value?: string) => {
    const method = normalize(value);
    return method === "pickup" || method === "store_pickup";
  };
  const status = normalize(orderDetails?.status);
  const isBusDelivery = normalize(orderDetails?.deliveryMethod) === "bus";
  const busStage = String(orderDetails?.busDeliveryWorkflow?.stage || "").toUpperCase();
  const paymentStatus = normalizePaymentStatus(orderDetails?.paymentStatus);
  const sellerActionRequired =
    !isPickupMethod(orderDetails?.deliveryMethod) &&
    ((paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) ||
      ["paid", "processing", "preparing", "confirmed"].includes(status));
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
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
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
                  disabled={updateStatusMutation.isPending || isBusDelivery}
                >
                  <SelectTrigger data-testid="select-order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="en_route">Out for Delivery</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                {isBusDelivery && (
                  <p className="text-[11px] text-muted-foreground mt-1">
                    BUS lifecycle is controlled by proof submission and super admin completion.
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
                <p className="font-semibold">{orderDetails.deliveryMethod}</p>
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

            {["rider", "bus"].includes(normalize(orderDetails.deliveryMethod)) && (
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
  
  // Parse URL params to get orderId for dialog
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const orderIdFromUrl = urlParams.get('orderId');
  const [openOrderId, setOpenOrderId] = useState<string | null>(orderIdFromUrl);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Fetch all orders (admin/super_admin sees all)
  const { data: allOrders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    queryFn: async () => {
      const res = await fetch("/api/orders", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch orders");
      return res.json();
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 30000, // Refetch every 30 seconds as fallback
  });

  const { data: analytics } = useQuery<{ totalRevenue?: number }>({
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
      console.log("📦 Order update received:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Order Updated",
        description: `Order #${data.orderNumber || data.orderId} status changed`,
      });
    };

    const handleRiderAssigned = (data: any) => {
      console.log("🏍️ Rider assigned:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Rider Assigned",
        description: `Rider assigned to order #${data.orderNumber}`,
      });
    };

    const handleDeliveryCompleted = (data: any) => {
      console.log("✅ Delivery completed:", data);
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      toast({
        title: "Delivery Completed",
        description: `Order #${data.orderNumber} has been delivered`,
      });
    };

    socket.on("order_status_updated", handleOrderUpdate);
    socket.on("order_rider_assigned", handleRiderAssigned);
    socket.on("admin_delivery_completed", handleDeliveryCompleted);
    socket.on("new_order", handleOrderUpdate);

    return () => {
      socket.off("order_status_updated", handleOrderUpdate);
      socket.off("order_rider_assigned", handleRiderAssigned);
      socket.off("admin_delivery_completed", handleDeliveryCompleted);
      socket.off("new_order", handleOrderUpdate);
    };
  }, [socket, toast]);

  // Calculate order statistics
  const stats = useMemo<OrderStats>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const normalize = (s?: string) => (s || "").toLowerCase().trim();

    return {
      total: allOrders.length,
      pending: allOrders.filter(o => normalize(o.status) === "pending").length,
      processing: allOrders.filter(o => normalize(o.status) === "processing").length,
      enRoute: allOrders.filter(o => ["en_route", "picked_up"].includes(normalize(o.status))).length,
      delivered: allOrders.filter(o => normalize(o.status) === "delivered").length,
      cancelled: allOrders.filter(o => normalize(o.status) === "cancelled").length,
      totalRevenue: Number(analytics?.totalRevenue || 0),
      todayOrders: allOrders.filter(o => new Date(o.createdAt) >= today).length,
    };
  }, [allOrders, analytics?.totalRevenue]);

  // Separate admin's personal orders (where admin is the buyer)
  const myOrders = useMemo(() => 
    allOrders.filter(o => o.buyerId === user?.id), [allOrders, user?.id]);

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
    const normalize = (s?: string) => (s || "").toLowerCase().trim();
    const isPickupMethod = (method?: string) => {
      const m = normalize(method);
      return m === "pickup" || m === "store_pickup";
    };
    const getAwaitingActionOwner = (order: Order): "seller" | "admin" | "rider" | "delivered" | "none" => {
      const status = normalize(order.status);
      const paymentStatus = normalizePaymentStatus(order.paymentStatus);
      const isPickup = isPickupMethod(order.deliveryMethod);

      if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) {
        return "none";
      }

      if (["paid", "processing", "preparing", "confirmed"].includes(status)) {
        return "seller";
      }

      if (["ready", "searching_rider"].includes(status) && !isPickup) {
        return "admin";
      }

      if (["assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
        return "rider";
      }

      if (["delivered", "completed"].includes(status)) {
        return "delivered";
      }

      return "none";
    };

    let orders = activeTab === "my-orders" ? myOrders : allOrders;

    if (statusFilter !== "all") {
      orders = orders.filter(o => normalize(o.status) === normalize(statusFilter));
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
  }, [allOrders, myOrders, activeTab, statusFilter, actionFilter, searchQuery]);
  
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
    navigate(`/admin/orders?orderId=${orderId}`, { replace: true });
    setOpenOrderId(orderId);
  };
  
  const handleCloseDialog = () => {
    navigate('/admin/orders', { replace: true });
    setOpenOrderId(null);
  };

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case "pending": return "bg-yellow-500";
      case "confirmed": return "bg-blue-400";
      case "processing": return "bg-blue-500";
      case "ready": return "bg-indigo-500";
      case "assigned": return "bg-violet-500";
      case "picked_up": return "bg-purple-500";
      case "en_route": return "bg-orange-500";
      case "delivered": return "bg-green-500";
      case "cancelled": return "bg-red-500";
      case "refunded": return "bg-gray-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status.toLowerCase()) {
      case "pending": return <Clock className="h-4 w-4" />;
      case "processing": return <Package className="h-4 w-4" />;
      case "en_route": return <Truck className="h-4 w-4" />;
      case "delivered": return <CheckCircle className="h-4 w-4" />;
      case "cancelled": return <XCircle className="h-4 w-4" />;
      default: return <Package className="h-4 w-4" />;
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
            onClick={() => refetch()}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
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
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-orange-500" />
              <div>
                <p className="text-xs text-muted-foreground">En Route</p>
                <p className="text-xl font-bold">{stats.enRoute}</p>
              </div>
            </div>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-xs text-muted-foreground">Delivered</p>
                <p className="text-xl font-bold">{stats.delivered}</p>
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
                  <SelectItem value="en_route">Out for Delivery</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
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
                  <SelectItem value="rider">Awaiting Rider Action</SelectItem>
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
  const getPaymentLabel = (value?: string) => normalizePaymentStatus(value);
  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const isPickupMethod = (value?: string) => {
    const method = normalize(value);
    return method === "pickup" || method === "store_pickup";
  };

  const getSellerActionState = (order: Order) => {
    const status = normalize(order.status);
    const paymentStatus = getPaymentLabel(order.paymentStatus);
    const pickupFlow = isPickupMethod(order.deliveryMethod);

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
        hint: pickupFlow ? "Seller must prepare for pickup" : "Seller must prepare for dispatch",
        className: "bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200",
      };
    }

    if (["ready", "searching_rider", "assigned", "rider_arrived"].includes(status)) {
      return {
        label: pickupFlow ? "Ready for Pickup" : "Ready for Dispatch",
        hint: pickupFlow ? "Awaiting buyer collection" : "Awaiting rider/dispatch progression",
        className: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
      };
    }

    if (["picked_up", "in_transit", "en_route", "arrived", "delivered", "completed"].includes(status)) {
      return {
        label: "Seller Handoff Complete",
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
        <Card 
          key={order.id} 
          className="p-4 hover:shadow-md transition-shadow cursor-pointer flex flex-col"
          onClick={() => onViewOrder(order.id)}
          data-testid={`card-order-${order.id}`}
        >
          <div className="flex items-start gap-3 mb-3">
            <div className={`p-2.5 rounded-lg ${getStatusColor(order.status)} text-white shrink-0`}>
              {getStatusIcon(order.status)}
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
              <Badge className={getStatusColor(order.status)} data-testid={`badge-status-${order.id}`} variant="secondary">
                {order.status.replace(/_/g, " ")}
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
                verification?.sellerToRider || verification?.riderToBuyer || verification?.sellerToBuyer
              );
              const status = String(order.status || "").toLowerCase().trim();
              const shouldShowVerification =
                hasAnyVerification || ["picked_up", "in_transit", "en_route", "arrived", "delivered", "completed"].includes(status);
              if (!shouldShowVerification) return null;
              return (
                <div className="rounded-md border border-muted p-2 mt-1 text-[11px] space-y-1">
                  <p className="font-semibold text-foreground">Verification Checkpoints</p>
                  {isPickup ? (
                    <p className="text-muted-foreground">
                      Seller to Buyer: <span className="font-medium text-foreground">{verification?.sellerToBuyer ? `Verified (${verification.sellerToBuyer})` : "Pending"}</span>
                    </p>
                  ) : isBus ? (
                    <>
                      <p className="text-muted-foreground">
                        Seller to Rider: <span className="font-medium text-foreground">{verification?.sellerToRider ? `Verified (${verification.sellerToRider})` : "Pending"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        BUS Transport Proof: <span className="font-medium text-foreground">{order.busDeliveryWorkflow?.proofSubmitted ? "Submitted" : "Pending"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        BUS Stage: <span className="font-medium text-foreground">{busStage || "READY"}</span>
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-muted-foreground">
                        Seller to Rider: <span className="font-medium text-foreground">{verification?.sellerToRider ? `Verified (${verification.sellerToRider})` : "Pending"}</span>
                      </p>
                      <p className="text-muted-foreground">
                        Rider to Buyer: <span className="font-medium text-foreground">{verification?.riderToBuyer ? `Verified (${verification.riderToBuyer})` : "Pending"}</span>
                      </p>
                    </>
                  )}
                </div>
              );
            })()}
            {(() => {
              const sellerState = getSellerActionState(order);
              const sellerActionPending = sellerState.label === "Seller Action Required";
              const riderActionPending = [
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
              <span className="font-medium capitalize">{order.deliveryMethod}</span>
            </div>
          </div>
          
          {(() => {
            const s = (order.status || "").toLowerCase().trim();
            const paymentStatus = getPaymentLabel(order.paymentStatus);
            const isUnpaid = paymentStatus === "pending" || paymentStatus === "failed";
            const isProcessingPayment = paymentStatus === "processing";
            const trackStatuses = new Set([
              "processing",
              "ready",
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
            if (trackStatuses.has(s)) {
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full mt-3 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Navigate to tracking page with order id
                    navigate(`/track?orderId=${order.id}`);
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
      ))}
    </div>
  );
}


