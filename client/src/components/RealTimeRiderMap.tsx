import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Clock } from "lucide-react";
import { io } from "socket.io-client";

interface RiderLocation {
  riderId: string;
  riderName: string;
  orderId: string;
  orderNumber: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: string;
}

const riderIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

export default function RealTimeRiderMap() {
  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [center, setCenter] = useState<LatLng>(new LatLng(5.6037, -0.1870)); // Accra, Ghana

  const { data: initialRiders = [], isLoading } = useQuery<RiderLocation[]>({
    queryKey: ["/api/admin/active-riders"],
    refetchInterval: 30000, // Refresh every 30 seconds as fallback
  });

  useEffect(() => {
    if (initialRiders.length > 0) {
      setRiders(initialRiders);
      // Center map on first rider
      setCenter(new LatLng(initialRiders[0].latitude, initialRiders[0].longitude));
    }
  }, [initialRiders]);

  useEffect(() => {
    const socket = io();

    // Listen for real-time rider location updates
    socket.on("admin_rider_location_updated", (locationUpdate: RiderLocation) => {
      setRiders((prevRiders) => {
        const existingIndex = prevRiders.findIndex(r => r.riderId === locationUpdate.riderId);
        
        if (existingIndex >= 0) {
          // Update existing rider
          const updated = [...prevRiders];
          updated[existingIndex] = locationUpdate;
          return updated;
        } else {
          // Add new rider
          return [...prevRiders, locationUpdate];
        }
      });
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card data-testid="card-rider-map">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              Live Rider Tracking
            </CardTitle>
            <CardDescription>
              Real-time location of all active delivery riders
            </CardDescription>
          </div>
          <Badge variant="secondary" data-testid="badge-active-riders">
            {riders.length} Active {riders.length === 1 ? "Rider" : "Riders"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[500px] flex items-center justify-center bg-muted rounded-lg">
            <p className="text-muted-foreground">Loading map...</p>
          </div>
        ) : (
          <div className="h-[500px] rounded-lg overflow-hidden border" data-testid="map-container">
            <MapContainer
              center={center}
              zoom={12}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {riders.length === 0 ? (
                <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
                  <div className="bg-background/80 backdrop-blur-sm rounded-lg p-4 text-center">
                    <Truck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No active deliveries</p>
                  </div>
                </div>
              ) : (
                riders.map((rider) => (
                  <Marker
                    key={rider.riderId}
                    position={[rider.latitude, rider.longitude]}
                    icon={riderIcon}
                  >
                    <Popup>
                      <div className="p-2 min-w-[200px]" data-testid={`popup-rider-${rider.riderId}`}>
                        <h3 className="font-bold text-sm mb-1">{rider.riderName}</h3>
                        <p className="text-xs text-muted-foreground mb-2">
                          Order #{rider.orderNumber}
                        </p>
                        <div className="space-y-1 text-xs">
                          {rider.speed !== null && (
                            <p className="flex items-center gap-1">
                              <span className="font-medium">Speed:</span>
                              <span>{Math.round(rider.speed * 3.6)} km/h</span>
                            </p>
                          )}
                          <p className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimestamp(rider.timestamp)}</span>
                          </p>
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                ))
              )}
            </MapContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
