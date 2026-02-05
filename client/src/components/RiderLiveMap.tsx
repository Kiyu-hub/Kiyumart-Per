import { useEffect, useState, useRef, lazy, Suspense } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Navigation, 
  MapPin, 
  Clock, 
  Package, 
  Maximize2,
  Minimize2,
  LocateFixed,
  Loader2,
  RefreshCcw
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";

interface ActiveDelivery {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  buyerName?: string;
}

// Custom icons
const riderIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [45, 45],
  iconAnchor: [22, 45],
  popupAnchor: [0, -45],
});

const deliveryIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const pendingIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1048/1048953.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Map controller for centering
function MapController({ position, autoCenter }: { position: [number, number] | null; autoCenter: boolean }) {
  const map = useMap();
  
  useEffect(() => {
    if (position && autoCenter) {
      map.flyTo(position, 15, { duration: 1 });
    }
  }, [map, position, autoCenter]);
  
  return null;
}

interface RiderLiveMapProps {
  className?: string;
}

export default function RiderLiveMap({ className = "" }: RiderLiveMapProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [autoCenter, setAutoCenter] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);

  // Fetch rider's active deliveries
  const { data: activeDeliveries = [], refetch } = useQuery<ActiveDelivery[]>({
    queryKey: ["/api/rider/deliveries/active"],
    queryFn: async () => {
      const res = await fetch("/api/rider/deliveries/active");
      if (!res.ok) {
        if (res.status === 404) return [];
        throw new Error("Failed to fetch deliveries");
      }
      return res.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Initialize geolocation tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    const successHandler = (position: GeolocationPosition) => {
      const { latitude, longitude } = position.coords;
      setCurrentPosition([latitude, longitude]);
      setLocationError(null);

      // Emit location to server
      if (socketRef.current?.connected) {
        socketRef.current.emit("rider_location_update", {
          latitude,
          longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          timestamp: new Date().toISOString(),
        });
      }
    };

    const errorHandler = (error: GeolocationPositionError) => {
      switch (error.code) {
        case error.PERMISSION_DENIED:
          setLocationError("Location permission denied. Please enable location access.");
          break;
        case error.POSITION_UNAVAILABLE:
          setLocationError("Location information is unavailable.");
          break;
        case error.TIMEOUT:
          setLocationError("Location request timed out.");
          break;
        default:
          setLocationError("An unknown error occurred.");
      }
    };

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      successHandler,
      errorHandler,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 5000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  // Socket connection for real-time updates
  useEffect(() => {
    socketRef.current = io({
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });

    socketRef.current.on("connect", () => {
      console.log("Rider map socket connected");
    });

    socketRef.current.on("new_delivery_assigned", () => {
      refetch();
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [refetch]);

  const centerOnMe = () => {
    setAutoCenter(true);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  // Default to Ghana center if no position
  const mapCenter = currentPosition || [5.6037, -0.1870];

  const containerClass = isFullscreen 
    ? "fixed inset-0 z-50 bg-background" 
    : `relative ${className}`;

  return (
    <Card className={containerClass}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Live Map
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="flex items-center gap-1">
              <div className={`h-2 w-2 rounded-full ${currentPosition ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
              {currentPosition ? 'GPS Active' : 'Locating...'}
            </Badge>
            <Button variant="ghost" size="icon" onClick={() => refetch()}>
              <RefreshCcw className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={centerOnMe}>
              <LocateFixed className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className={`relative ${isFullscreen ? 'h-[calc(100vh-80px)]' : 'h-[400px]'}`}>
          {locationError ? (
            <div className="flex flex-col items-center justify-center h-full bg-muted/50 p-6 text-center">
              <MapPin className="h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">{locationError}</p>
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => window.location.reload()}
              >
                <RefreshCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <MapContainer
              center={mapCenter as [number, number]}
              zoom={14}
              className="h-full w-full z-0"
              zoomControl={true}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              
              <MapController position={currentPosition} autoCenter={autoCenter} />
              
              {/* Rider's current position */}
              {currentPosition && (
                <>
                  <Marker position={currentPosition} icon={riderIcon}>
                    <Popup>
                      <div className="text-center">
                        <strong>You are here</strong>
                        <p className="text-xs text-muted-foreground mt-1">
                          GPS tracking active
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                  {/* Accuracy circle */}
                  <Circle 
                    center={currentPosition}
                    radius={50}
                    pathOptions={{ 
                      color: '#3b82f6', 
                      fillColor: '#3b82f6',
                      fillOpacity: 0.1 
                    }}
                  />
                </>
              )}

              {/* Active delivery destinations */}
              {activeDeliveries.map((delivery) => (
                delivery.deliveryLatitude && delivery.deliveryLongitude && (
                  <Marker
                    key={delivery.id}
                    position={[delivery.deliveryLatitude, delivery.deliveryLongitude]}
                    icon={delivery.status === "delivering" ? deliveryIcon : pendingIcon}
                  >
                    <Popup>
                      <div className="min-w-[180px]">
                        <div className="font-semibold">Order #{delivery.orderNumber}</div>
                        <Badge className="mt-1" variant={delivery.status === "delivering" ? "default" : "secondary"}>
                          {delivery.status.replace(/_/g, " ")}
                        </Badge>
                        {delivery.buyerName && (
                          <p className="text-sm mt-2">
                            <strong>Customer:</strong> {delivery.buyerName}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-1">
                          {delivery.deliveryAddress}
                        </p>
                        <Button 
                          size="sm" 
                          className="w-full mt-2"
                          onClick={() => {
                            const lat = delivery.deliveryLatitude;
                            const lng = delivery.deliveryLongitude;
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`,
                              '_blank'
                            );
                          }}
                        >
                          <Navigation className="h-4 w-4 mr-2" />
                          Navigate
                        </Button>
                      </div>
                    </Popup>
                  </Marker>
                )
              ))}
            </MapContainer>
          )}

          {/* Overlay with stats */}
          <div className="absolute bottom-4 left-4 z-[1000] bg-background/95 backdrop-blur-sm rounded-lg p-3 shadow-lg">
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-primary" />
                <span className="font-medium">{activeDeliveries.length}</span>
                <span className="text-muted-foreground">Active</span>
              </div>
              {activeDeliveries.length > 0 && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-500" />
                  <span className="text-muted-foreground">
                    {activeDeliveries.filter(d => d.status === "delivering").length} En Route
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
