import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, MapPin, Package } from "lucide-react";

interface Delivery {
  id: string;
  orderNumber: string;
  status: string;
  riderId?: string;
  riderName?: string;
  deliveryAddress: string;
  estimatedTime?: string;
  createdAt: string;
}

export default function SellerDeliveries() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: deliveries = [], isLoading } = useQuery<Delivery[]>({
    queryKey: ["/api/orders", "seller-deliveries", user?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/orders?context=seller");
      const orders = await res.json();
      if (!Array.isArray(orders)) return [];

      return orders.map((order: any) => ({
        id: order.id,
        orderNumber: order.orderNumber || order.id,
        status: order.status || "pending",
        riderId: order.riderId || undefined,
        riderName: order.riderName || undefined,
        deliveryAddress: order.deliveryAddress || "No delivery address provided",
        estimatedTime: order.estimatedDelivery || undefined,
        createdAt: order.createdAt,
      }));
    },
    enabled: !!user && user.role === "seller",
  });

  const getStatusColor = (status: string) => {
    const normalized = String(status || "").toLowerCase().trim();
    switch (normalized) {
      case "pending":
      case "created":
      case "confirmed":
        return "bg-yellow-500";
      case "processing":
      case "ready":
      case "searching_rider":
        return "bg-indigo-500";
      case "assigned":
        return "bg-blue-500";
      case "rider_arrived":
        return "bg-cyan-500";
      case "picked_up":
        return "bg-purple-500";
      case "in_transit":
      case "en_route":
        return "bg-orange-500";
      case "delivered":
      case "completed":
        return "bg-green-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">
            Deliveries
          </h1>
          <p className="text-muted-foreground">Track your order deliveries</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : deliveries.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No deliveries</h3>
              <p className="text-muted-foreground">Your deliveries will appear here</p>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4">
            {deliveries.map((delivery) => (
              <Card key={delivery.id} className="p-4" data-testid={`card-delivery-${delivery.id}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <p className="font-semibold">Order #{delivery.orderNumber}</p>
                      <Badge className={`${getStatusColor(delivery.status)} text-white`}>
                        {delivery.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-4 w-4 mt-0.5" />
                      <p>{delivery.deliveryAddress}</p>
                    </div>
                    {delivery.riderName && (
                      <p className="text-sm mt-2">
                        <span className="text-muted-foreground">Rider:</span> {delivery.riderName}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/track?orderId=${delivery.id}`)}
                    data-testid={`button-track-${delivery.id}`}
                  >
                    Track
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
