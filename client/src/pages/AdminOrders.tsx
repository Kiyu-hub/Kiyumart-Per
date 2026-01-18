import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Eye, Package, ArrowLeft } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  total: string;
  subtotal: string;
  deliveryFee: string;
  processingFee: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
  deliveryMethod: string;
  deliveryAddress?: string;
  deliveryPhone?: string;
}

interface AvailableRider {
  rider: {
    id: string;
    name: string;
    email: string;
  };
  activeOrderCount: number;
}

function ViewOrderDialog({ 
  orderId, 
  open, 
  onOpenChange 
}: { 
  orderId: string; 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
}) {
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
                  disabled={updateStatusMutation.isPending}
                >
                  <SelectTrigger data-testid="select-order-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="delivering">Out for Delivery</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Payment Status</p>
                <Badge className={orderDetails.paymentStatus === "completed" ? "bg-green-500" : "bg-yellow-500"}>
                  {orderDetails.paymentStatus}
                </Badge>
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

            {orderDetails.deliveryMethod === "delivery" && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Assign Rider</p>
                <Select
                  defaultValue={orderDetails.riderId || ""}
                  onValueChange={(value) => assignRiderMutation.mutate(value)}
                  disabled={assignRiderMutation.isPending || ridersLoading}
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
            )}

            {orderDetails.deliveryAddress && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Delivery Address</p>
                <p className="font-semibold">{orderDetails.deliveryAddress}</p>
                {orderDetails.deliveryPhone && (
                  <p className="text-sm text-muted-foreground">{orderDetails.deliveryPhone}</p>
                )}
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
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  
  // Parse URL params to get orderId for dialog
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const orderIdFromUrl = urlParams.get('orderId');
  const [openOrderId, setOpenOrderId] = useState<string | null>(orderIdFromUrl);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", user?.id],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });
  
  // Sync openOrderId with URL params (wouter location hook)
  useEffect(() => {
    const params = new URLSearchParams(location.split('?')[1] || '');
    const orderId = params.get('orderId');
    setOpenOrderId(orderId);
  }, [location]);
  
  // Validate orderId exists in orders list, auto-close if invalid
  useEffect(() => {
    if (openOrderId && orders.length > 0) {
      const orderExists = orders.some(o => o.id === openOrderId);
      if (!orderExists) {
        handleCloseDialog();
      }
    }
  }, [openOrderId, orders]);
  
  const handleOpenDialog = (orderId: string) => {
    navigate(`/admin/orders?orderId=${orderId}`, { replace: true });
    setOpenOrderId(orderId);
  };
  
  const handleCloseDialog = () => {
    navigate('/admin/orders', { replace: true });
    setOpenOrderId(null);
  };

  const filteredOrders = orders.filter(o => 
    o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    o.status.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch(status.toLowerCase()) {
      case "pending": return "bg-yellow-500";
      case "processing": return "bg-blue-500";
      case "delivering": return "bg-purple-500";
      case "delivered": return "bg-green-500";
      case "cancelled": return "bg-red-500";
      default: return "bg-gray-500";
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
      <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-orders">Orders Management</h1>
              <p className="text-muted-foreground mt-1">Track and manage all orders</p>
            </div>
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-orders"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredOrders.map((order) => (
                <Card key={order.id} className="p-4" data-testid={`card-order-${order.id}`}>
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-lg">
                      <Package className="h-6 w-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg" data-testid={`text-order-number-${order.id}`}>
                        Order #{order.orderNumber}
                      </h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-primary font-bold" data-testid={`text-total-${order.id}`}>
                          {formatPrice(parseFloat(order.total))}
                        </span>
                        <Badge className={getStatusColor(order.status)} data-testid={`badge-status-${order.id}`}>
                          {order.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground" data-testid={`text-date-${order.id}`}>
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                        <Badge variant="outline" data-testid={`badge-delivery-${order.id}`}>
                          {order.deliveryMethod}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleOpenDialog(order.id)}
                        data-testid={`button-view-${order.id}`}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
              
              {filteredOrders.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-muted-foreground" data-testid="text-no-orders">
                    No orders found
                  </p>
                </div>
              )}
            </div>
          )}
          
          {/* Conditional ViewOrderDialog render when openOrderId is set */}
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
