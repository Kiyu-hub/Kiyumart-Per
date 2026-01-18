import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, Navigation, Package } from "lucide-react";

interface ActiveDelivery {
  id: string;
  orderNumber: string;
  status: string;
  currentLocation: string;
  destination: string;
  distance: string;
  estimatedTime: string;
}

export default function RiderActiveRoute() {
  const { user } = useAuth();

  const { data: activeDelivery, isLoading } = useQuery<ActiveDelivery>({
    queryKey: ["/api/deliveries/active"],
    queryFn: async () => {
      const res = await fetch("/api/deliveries/active");
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch active route");
      }
      return res.json();
    },
  });

  return (
    <DashboardLayout role="rider">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Active Route</h1>
          <p className="text-muted-foreground">Your current delivery route</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !activeDelivery ? (
          <Card className="p-12">
            <div className="text-center">
              <Navigation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Active Route</h3>
              <p className="text-muted-foreground">You don't have any active deliveries at the moment</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="p-6" data-testid="card-active-delivery">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="h-6 w-6 text-primary" />
                    <div>
                      <p className="font-semibold text-lg">Order #{activeDelivery.orderNumber}</p>
                      <Badge className="bg-blue-500 text-white mt-1">
                        {activeDelivery.status.replace("_", " ")}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-green-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Current Location</p>
                      <p className="text-muted-foreground">{activeDelivery.currentLocation}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-red-500 mt-0.5" />
                    <div>
                      <p className="font-medium">Destination</p>
                      <p className="text-muted-foreground">{activeDelivery.destination}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-sm text-muted-foreground">Distance</p>
                    <p className="text-lg font-semibold">{activeDelivery.distance}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Est. Time</p>
                    <p className="text-lg font-semibold">{activeDelivery.estimatedTime}</p>
                  </div>
                </div>

                <Button 
                  className="w-full" 
                  data-testid="button-navigate"
                  onClick={() => {
                    if (activeDelivery?.deliveryAddress) {
                      const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(activeDelivery.deliveryAddress)}`;
                      window.open(mapsUrl, '_blank');
                    }
                  }}
                >
                  <Navigation className="h-4 w-4 mr-2" />
                  Start Navigation
                </Button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-semibold mb-3">Route Map</h3>
              <div className="bg-muted rounded-lg h-64 flex items-center justify-center">
                <p className="text-muted-foreground">Map integration coming soon...</p>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
