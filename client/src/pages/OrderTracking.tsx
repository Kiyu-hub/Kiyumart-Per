import { useEffect, useState, useRef } from "react";
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

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  deliveryAddress: string;
  deliveryCity: string;
  deliveryPhone: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
  qrCode: string;
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
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const requestedOrderId = searchParams.get("orderId");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [riderLocations, setRiderLocations] = useState<Map<string, RiderLocation>>(new Map());
  const socketRef = useRef<Socket | null>(null);
  const normalizeStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "ready" || s === "confirmed") return "processing";
    if (s === "assigned" || s === "picked_up" || s === "en_route") return "en_route";
    return s || "pending";
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
        description: `Order #${data.orderNumber} is now ${data.status}`,
      });
    });

    // Listen for real-time rider location updates
    socket.on("rider_location_updated", (data: { orderId: string; orderNumber: string; latitude: string; longitude: string; timestamp: string }) => {
      console.log("Rider location updated:", data);
      
      const lat = parseFloat(data.latitude);
      const lng = parseFloat(data.longitude);
      
      // Only update if coordinates are valid
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
        
        // Show toast notification
        toast({
          title: "Rider Location Updated",
          description: `Delivery rider for Order #${data.orderNumber} is on the move`,
        });
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [user?.id, toast]);

  const { data: orders = [], isLoading, error } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: !authLoading && !!user,
  });

  // Fetch initial rider locations for orders out for delivery
  useEffect(() => {
    if (!orders || orders.length === 0) return;

    const fetchRiderLocations = async () => {
      const enRouteOrders = orders.filter(order => {
        const status = normalizeStatus(order.status);
        return status === "en_route";
      });
      
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
  }, [orders]);

  // Filter orders based on search and status
  const filteredOrders = orders.filter((order) => {
    if (requestedOrderId && order.id !== requestedOrderId) return false;

    const normalized = normalizeStatus(order.status);
    const address = order.deliveryAddress || "";
    const city = order.deliveryCity || "";
    const matchesSearch = 
      searchQuery === "" ||
      order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      city.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = 
      statusFilter === "all" || normalized === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const hasOrders = orders.length > 0;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-auth" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-orders" />
      </div>
    );
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold" data-testid="text-heading">Track Your Orders</h1>
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
              {/* Filters Section */}
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
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="en_route">Out for Delivery</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="disputed">Disputed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {requestedOrderId && (
                  <p className="text-xs text-muted-foreground mt-3">
                    Showing tracking for selected order.
                  </p>
                )}
              </Card>

              {/* Results Count */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground" data-testid="text-results-count">
                  {filteredOrders.length === orders.length 
                    ? `${orders.length} order${orders.length === 1 ? '' : 's'}`
                    : `${filteredOrders.length} of ${orders.length} order${orders.length === 1 ? '' : 's'}`
                  }
                </p>
              </div>

              {/* Orders List */}
              {filteredOrders.length === 0 ? (
                <Card className="p-8 text-center" data-testid="card-no-results">
                  <p className="text-lg text-muted-foreground">No orders match your filters</p>
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
                </Card>
              ) : (
                <div className="space-y-6">
                  {filteredOrders.map((order) => (
                    <Card key={order.id} className="overflow-hidden" data-testid={`card-order-${order.id}`}>
                      <CardHeader className="bg-muted/30 pb-4">
                        <div className="flex justify-between items-start flex-wrap gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Order Number</p>
                            <p className="text-lg font-semibold" data-testid={`text-order-number-${order.id}`}>
                              #{order.orderNumber}
                            </p>
                          </div>
                          <OrderStatusBadge status={order.status} />
                        </div>
                      </CardHeader>

                      <CardContent className="pt-6 space-y-6">
                        {/* Order Status Timeline */}
                        <div>
                          <h3 className="text-sm font-medium mb-4">Order Progress</h3>
                          <OrderStatusTimeline 
                            currentStatus={order.status}
                            createdAt={order.createdAt}
                            updatedAt={order.updatedAt}
                            deliveredAt={order.deliveredAt}
                          />
                        </div>

                        {/* Order Details */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                          <div>
                            <p className="text-sm text-muted-foreground">Delivery Address</p>
                            <p className="font-medium" data-testid={`text-address-${order.id}`}>
                              {order.deliveryAddress}
                            </p>
                            <p className="text-sm">{order.deliveryCity}</p>
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

                        {/* Live Delivery Map for Delivering Orders */}
                        {normalizeStatus(order.status) === "en_route" && order.deliveryLatitude && order.deliveryLongitude && 
                         !isNaN(parseFloat(order.deliveryLatitude)) && !isNaN(parseFloat(order.deliveryLongitude)) && (
                          <div className="pt-4 border-t space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-medium">Live Delivery Tracking</h3>
                              <Button
                                onClick={() => navigate(`/live-tracking?orderId=${order.id}`)}
                                variant="default"
                                size="sm"
                                data-testid={`button-live-tracking-${order.id}`}
                              >
                                <Navigation className="h-4 w-4 mr-2" />
                                View Full Map
                              </Button>
                            </div>
                            <DeliveryMap
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

                        {/* QR Code */}
                        {order.status !== "cancelled" && order.qrCode && (
                          <div className="pt-4 border-t">
                            <p className="text-sm font-medium mb-3">Delivery Confirmation QR Code</p>
                            <div className="flex justify-center bg-muted/30 p-6 rounded-lg">
                              <div className="text-center">
                                <QRCodeDisplay
                                  value={order.qrCode}
                                  title=""
                                  description="Show this QR code to the delivery rider to confirm receipt"
                                />
                                <p className="text-xs text-muted-foreground mt-2" data-testid={`text-qr-value-${order.id}`}>
                                  {order.qrCode}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
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
