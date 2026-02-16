import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Truck, 
  Clock, 
  Maximize2, 
  Minimize2, 
  MapPin, 
  Phone, 
  Navigation,
  Target,
  RefreshCcw,
  Loader2
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface ActiveDelivery {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddress: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  buyerName?: string;
  buyerPhone?: string;
}

interface RouteInfo {
  distance: number; // km
  duration: number; // minutes
  geometry: [number, number][];
}

const riderIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [45, 45],
  iconAnchor: [22, 45],
  popupAnchor: [0, -45],
});

const destinationIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

// Component to invalidate map size on mount (fixes common Leaflet rendering issues)
function MapInvalidator() {
  const map = useMap();
  
  useEffect(() => {
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);
  
  return null;
}

// Component to fit map bounds
function MapBoundsController({ riderPos, destPos }: { riderPos: [number, number] | null; destPos: [number, number] | null }) {
  const map = useMap();
  
  useEffect(() => {
    const points: [number, number][] = [];
    if (riderPos) points.push(riderPos);
    if (destPos) points.push(destPos);
    
    if (points.length > 1) {
      map.fitBounds(points, { padding: [60, 60], maxZoom: 15 });
    } else if (points.length === 1) {
      map.setView(points[0], 15);
    }
  }, [map, riderPos, destPos]);
  
  return null;
}

// OSRM Route calculation
async function calculateRoute(from: [number, number], to: [number, number]): Promise<RouteInfo | null> {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    );
    const data = await response.json();
    
    if (data.code === "Ok" && data.routes?.[0]) {
      const route = data.routes[0];
      return {
        distance: route.distance / 1000,
        duration: Math.round(route.duration / 60),
        geometry: route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number])
      };
    }
    return null;
  } catch (error) {
    console.error("Route calculation failed:", error);
    return null;
  }
}

interface RiderLiveMapProps {
  className?: string;
}

export default function RiderLiveMap({ className }: RiderLiveMapProps) {
  const { user } = useAuth();
  const [riderPosition, setRiderPosition] = useState<[number, number] | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "active" | "error">("acquiring");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mapRef = useRef<any>(null);

  // Fetch active delivery
  const { data: activeDelivery, isLoading, refetch } = useQuery<ActiveDelivery | null>({
    queryKey: ["/api/rider/active-delivery"],
    refetchInterval: 30000,
  });

  const destPos: [number, number] | null = activeDelivery?.deliveryLatitude && activeDelivery?.deliveryLongitude
    ? [activeDelivery.deliveryLatitude, activeDelivery.deliveryLongitude]
    : null;

  // GPS tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsStatus("error");
      return;
    }

    const handlePosition = (position: GeolocationPosition) => {
      const { latitude, longitude, accuracy, speed, heading } = position.coords;
      const newPos: [number, number] = [latitude, longitude];
      setRiderPosition(newPos);
      setGpsStatus("active");
      setLastUpdate(new Date());

      // Send location to server
      if (socketRef.current?.connected && activeDelivery) {
        socketRef.current.emit("rider_location_update", {
          orderId: activeDelivery.id,
          latitude,
          longitude,
          accuracy,
          speed: speed || 0,
          heading: heading || 0,
        });
      }
    };

    const handleError = (error: GeolocationPositionError) => {
      console.error("GPS Error:", error);
      setGpsStatus("error");
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [activeDelivery]);

  // Socket.IO connection
  useEffect(() => {
    socketRef.current = io(window.location.origin, {
      withCredentials: true,
      transports: ["websocket", "polling"],
    });

    socketRef.current.on("connect", () => {
      console.log("Rider map socket connected");
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // Calculate route when positions change
  useEffect(() => {
    if (riderPosition && destPos) {
      calculateRoute(riderPosition, destPos).then(route => {
        if (route) setRouteInfo(route);
      });
    }
  }, [riderPosition, destPos]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const centerOnRider = useCallback(() => {
    if (mapRef.current && riderPosition) {
      mapRef.current.setView(riderPosition, 16);
    }
  }, [riderPosition]);

  const openGoogleMapsNav = () => {
    if (destPos) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${destPos[0]},${destPos[1]}&travelmode=driving`;
      window.open(url, "_blank");
    }
  };

  if (isLoading) {
    return (
      <Card className={cn("flex items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  const defaultCenter = new LatLng(riderPosition?.[0] || 5.6037, riderPosition?.[1] || -0.1870);

  return (
    <>
      {/* Fullscreen backdrop overlay */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[9998]" 
          onClick={toggleFullscreen}
        />
      )}
      
      <Card className={cn(
        "overflow-hidden transition-all duration-300",
        isFullscreen ? "fixed inset-0 z-[9999] rounded-none" : "",
        className
      )}>
      <CardHeader className="py-3 px-4 flex flex-row items-center justify-between border-b bg-gradient-to-r from-primary/10 to-primary/5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Navigation className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Live Navigation</CardTitle>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge 
                variant="outline" 
                className={cn(
                  "text-xs",
                  gpsStatus === "active" ? "bg-green-100 text-green-700 border-green-300" :
                  gpsStatus === "acquiring" ? "bg-yellow-100 text-yellow-700 border-yellow-300" :
                  "bg-red-100 text-red-700 border-red-300"
                )}
              >
                {gpsStatus === "active" ? "GPS Active" : 
                 gpsStatus === "acquiring" ? "Acquiring GPS..." : "GPS Error"}
              </Badge>
              {routeInfo && (
                <>
                  <span className="text-primary font-medium">{routeInfo.distance.toFixed(1)} km</span>
                  <span>•</span>
                  <span className="text-primary font-medium">{routeInfo.duration} min</span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="icon" variant="outline" onClick={centerOnRider} title="Center on me">
            <Target className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => refetch()} title="Refresh">
            <RefreshCcw className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="p-0 relative">
        {/* Active Delivery Info Bar */}
        {activeDelivery && (
          <div className="absolute top-2 left-2 right-2 z-[1000] bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg p-3 backdrop-blur-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-blue-500 text-white text-xs">
                    Order #{activeDelivery.orderNumber}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {activeDelivery.status.replace(/_/g, " ").toUpperCase()}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                  <MapPin className="h-3 w-3 flex-shrink-0" />
                  {activeDelivery.deliveryAddress || "No address"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {activeDelivery.buyerPhone && (
                  <a href={`tel:${activeDelivery.buyerPhone}`}>
                    <Button size="sm" variant="outline" className="h-8 px-2">
                      <Phone className="h-3 w-3 mr-1" />
                      Call
                    </Button>
                  </a>
                )}
                <Button size="sm" onClick={openGoogleMapsNav} className="h-8 px-2" disabled={!destPos}>
                  <Navigation className="h-3 w-3 mr-1" />
                  Navigate
                </Button>
              </div>
            </div>
          </div>
        )}

        {!activeDelivery && (
          <div className="absolute top-2 left-2 right-2 z-[1000] bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg p-4 backdrop-blur-sm text-center">
            <Truck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No Active Delivery</p>
            <p className="text-xs text-muted-foreground">Accept a delivery to start navigation</p>
          </div>
        )}

        <MapContainer
          center={defaultCenter}
          zoom={14}
          className={cn("w-full", isFullscreen ? "h-[calc(100vh-80px)]" : "h-[350px]")}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          
          <MapInvalidator />
          <MapBoundsController riderPos={riderPosition} destPos={destPos} />

          {/* Route polyline */}
          {routeInfo?.geometry && (
            <Polyline 
              positions={routeInfo.geometry} 
              color="#3b82f6" 
              weight={5} 
              opacity={0.8}
              dashArray="10, 10"
            />
          )}

          {/* Rider position marker */}
          {riderPosition && (
            <Marker position={riderPosition} icon={riderIcon}>
              <Popup>
                <div className="text-center">
                  <strong>Your Location</strong>
                  {lastUpdate && (
                    <p className="text-xs text-muted-foreground">
                      Updated: {lastUpdate.toLocaleTimeString()}
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          )}

          {/* Destination marker */}
          {destPos && activeDelivery && (
            <Marker position={destPos} icon={destinationIcon}>
              <Popup>
                <div className="min-w-[180px]">
                  <strong className="text-sm">Delivery Destination</strong>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeDelivery.deliveryAddress}
                  </p>
                  {activeDelivery.buyerName && (
                    <p className="text-xs mt-1">
                      <strong>Customer:</strong> {activeDelivery.buyerName}
                    </p>
                  )}
                  {routeInfo && (
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-primary font-medium">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {routeInfo.duration} min
                      </span>
                      <span className="text-primary font-medium">
                        {routeInfo.distance.toFixed(1)} km
                      </span>
                    </div>
                  )}
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Bottom stats bar */}
        <div className="absolute bottom-2 left-2 right-2 z-[1000]">
          <div className="bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-lg px-4 py-2 backdrop-blur-sm flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              {routeInfo ? (
                <>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold">{routeInfo.duration} min</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-green-500" />
                    <span className="font-semibold">{routeInfo.distance.toFixed(1)} km</span>
                  </div>
                </>
              ) : (
                <span className="text-muted-foreground text-xs">
                  {activeDelivery ? "Calculating route..." : "No active route"}
                </span>
              )}
            </div>
            {lastUpdate && (
              <span className="text-xs text-muted-foreground">
                GPS: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
    </>
  );
}
