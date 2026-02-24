import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import DeliveryMap from "@/components/DeliveryMap";

interface Order {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: "pickup" | "bus" | "rider" | string;
  deliveryAddress: string;
  deliveryLatitude?: string;
  deliveryLongitude?: string;
  riderId?: string;
  riderInfo?: {
    id: string;
    name: string;
    phone?: string | null;
    vehicleType?: string | null;
    vehiclePlateNumber?: string | null;
    rating?: string | null;
  } | null;
}

interface RiderLocation {
  orderId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  heading?: number;
}

export default function LiveTracking() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [riderLocation, setRiderLocation] = useState<RiderLocation | null>(null);
  const socketRef = useRef<Socket | null>(null);
  
  // Get orderId from query params (safe extraction)
  const searchParams = new URLSearchParams(location.split('?')[1] || '');
  const orderId = searchParams.get("orderId");
  const normalizeStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "out_for_delivery" || s === "delivering") return "en_route";
    return s;
  };

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate]);

  // Fetch order details
  const { data: order, isLoading: orderLoading } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch order");
      return res.json();
    },
    enabled: !!orderId && isAuthenticated,
  });

  // Fetch rider's average rating from actual reviews
  const { data: riderRating } = useQuery<{ averageRating: number }>({
    queryKey: ["/api/riders", order?.riderId, "rating"],
    queryFn: async () => {
      const res = await fetch(`/api/riders/${order?.riderId}/rating`, {
        credentials: "include",
      });
      if (!res.ok) return { averageRating: 0 };
      return res.json();
    },
    enabled: !!order?.riderId,
  });

  // Initialize Socket.IO for real-time updates
  useEffect(() => {
    if (!user || !orderId) return;

    const socket = io({
      auth: { userId: user.id }
    });

    socket.on("connect", () => {
      console.log("🗺️ Live tracking connected");
      socket.emit("register", user.id);
    });

    // Listen for rider location updates
    socket.on("rider_location_updated", (data: { 
      orderId: string; 
      latitude: string; 
      longitude: string; 
      timestamp: string;
      heading?: string;
    }) => {
      if (data.orderId === orderId) {
        const lat = parseFloat(data.latitude);
        const lng = parseFloat(data.longitude);
        const hdg = data.heading ? parseFloat(data.heading) : undefined;
        
        if (!isNaN(lat) && !isNaN(lng)) {
          setRiderLocation({
            orderId: data.orderId,
            latitude: lat,
            longitude: lng,
            timestamp: data.timestamp,
            heading: hdg,
          });
        }
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [user, orderId]);

  // Fetch initial rider location
  useEffect(() => {
    if (!orderId) return;

    const fetchInitialLocation = async () => {
      try {
        const response = await fetch(`/api/delivery-tracking/${orderId}`, {
          credentials: "include",
        });
        
        if (response.ok) {
          const data = await response.json();
          const lat = parseFloat(data.latitude);
          const lng = parseFloat(data.longitude);
          const hdg = data.heading ? parseFloat(data.heading) : undefined;
          
          if (!isNaN(lat) && !isNaN(lng)) {
            setRiderLocation({
              orderId,
              latitude: lat,
              longitude: lng,
              timestamp: data.timestamp,
              heading: hdg,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch initial rider location:", error);
      }
    };

    fetchInitialLocation();
  }, [orderId]);

  if (authLoading || orderLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-tracking" />
      </div>
    );
  }

  if (!order || !orderId) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <p className="text-lg text-muted-foreground mb-4">Order not found</p>
        <Button onClick={() => navigate("/orders")} data-testid="button-back-orders">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
      </div>
    );
  }

  if (!order.deliveryLatitude || !order.deliveryLongitude) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <p className="text-lg text-muted-foreground mb-4">Delivery location not available</p>
        <Button onClick={() => navigate("/orders")} data-testid="button-back-orders">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Orders
        </Button>
      </div>
    );
  }

  const currentStatus = normalizeStatus(order.status);
  const deliveryMethod = String(order.deliveryMethod || "").toLowerCase().trim();
  if (deliveryMethod !== "rider") {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <p className="text-lg text-muted-foreground mb-2">Live map is available for rider delivery orders only</p>
        <Button onClick={() => navigate(`/track?orderId=${order.id}`)} data-testid="button-back-track-order-non-rider">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Order Tracking
        </Button>
      </div>
    );
  }
  if (!["in_transit", "en_route"].includes(currentStatus)) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-background p-6">
        <p className="text-lg text-muted-foreground mb-2">Live tracking starts when your rider is on the way</p>
        <p className="text-sm text-muted-foreground mb-4">Current status: {order.status}</p>
        <Button onClick={() => navigate(`/track?orderId=${order.id}`)} data-testid="button-back-track-order">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Order Tracking
        </Button>
      </div>
    );
  }

  const deliveryLocation = {
    latitude: parseFloat(order.deliveryLatitude),
    longitude: parseFloat(order.deliveryLongitude),
    address: order.deliveryAddress,
  };

  // Use actual rider rating from reviews (data-driven from real customer feedback)
  const riderInfo = order?.riderInfo ? {
    name: order.riderInfo.name,
    rating: riderRating?.averageRating || (order.riderInfo.rating ? Number(order.riderInfo.rating) : undefined),
    vehicleType: order.riderInfo.vehicleType || "Motorcycle",
  } : undefined;

  return (
    <div className="h-screen w-full bg-background" data-testid="page-live-tracking">
      <DeliveryMap
        orderId={order.id}
        deliveryLocation={deliveryLocation}
        riderLocation={riderLocation || undefined}
        riderInfo={riderInfo}
        orderNumber={order.orderNumber}
        compact={true}
      />
    </div>
  );
}
