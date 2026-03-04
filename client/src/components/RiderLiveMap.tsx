import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { DivIcon, Icon, LatLng } from "leaflet";
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
import MapTileLayer from "@/tracking/components/MapTileLayer";
import MapUsageTracker from "@/tracking/components/MapUsageTracker";
import { useVehicleTracking } from "@/tracking/hooks/useVehicleTracking";
import { useUsageMonitorSnapshot } from "@/tracking/hooks/useUsageMonitorSnapshot";
import { isMapboxGlPreferred } from "@/tracking/mapbox/mapboxLoader";
import MapboxSingleTripMap from "@/tracking/mapbox/MapboxSingleTripMap";

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

const riderIcon = new DivIcon({
  className: "rider-live-marker",
  html: `<div style="position:relative;width:36px;height:36px;border-radius:50%;background:linear-gradient(145deg,#0f766e,#0f172a);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,255,255,0.92);box-shadow:0 8px 18px rgba(15,23,42,0.28);font-size:17px;">
    <span>🚗</span>
    <span style="position:absolute;bottom:-4px;left:-4px;width:10px;height:10px;border-radius:9999px;background:#10b981;border:2px solid white;"></span>
  </div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -16],
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

interface RiderLiveMapProps {
  className?: string;
}

export default function RiderLiveMap({ className }: RiderLiveMapProps) {
  const { user } = useAuth();
  const [riderPosition, setRiderPosition] = useState<[number, number] | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<"acquiring" | "active" | "error">("acquiring");
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [mapboxInitFailed, setMapboxInitFailed] = useState(false);
  const [mapboxError, setMapboxError] = useState("");
  const socketRef = useRef<Socket | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const mapRef = useRef<any>(null);
  const latestCoordsRef = useRef<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  } | null>(null);
  const usageSnapshot = useUsageMonitorSnapshot();
  const shouldUseMapboxGl = isMapboxGlPreferred() && !mapboxInitFailed;

  // Fetch active delivery
  const { data: activeDelivery, isLoading, refetch } = useQuery<ActiveDelivery | null>({
    queryKey: ["/api/rider/active-delivery"],
    refetchInterval: 30000,
  });

  const destPos: [number, number] | null = activeDelivery?.deliveryLatitude && activeDelivery?.deliveryLongitude
    ? [activeDelivery.deliveryLatitude, activeDelivery.deliveryLongitude]
    : null;
  const normalizedStatus = String(activeDelivery?.status || "").toLowerCase().trim();
  const tripPhase =
    normalizedStatus === "assigned" ? "assigned" :
    normalizedStatus === "rider_arrived" || normalizedStatus === "picked_up" ? "pickup" :
    normalizedStatus === "arrived" ? "arrived" :
    normalizedStatus === "delivered" || normalizedStatus === "completed" ? "delivered" :
    "en_route";

  const trackedVehicle = useVehicleTracking({
    vehicleId: user?.id || "rider-live-map",
    orderId: activeDelivery?.id,
    destination: destPos ? { lat: destPos[0], lng: destPos[1] } : null,
    tripPhase,
    gps: riderPosition
      ? {
          lat: riderPosition[0],
          lng: riderPosition[1],
          speedMps: latestCoordsRef.current?.speed ?? 0,
          bearingDeg: latestCoordsRef.current?.heading ?? 0,
          timestampMs: Date.now(),
        }
      : undefined,
  });
  const routeGeometry = trackedVehicle?.route?.geometry?.map((point) => [point.lat, point.lng] as [number, number]) || [];
  const distanceKm = trackedVehicle?.eta?.distanceKm ?? 0;
  const etaMinutes = trackedVehicle?.eta?.minutes ?? "--";
  const animatedRiderPos: [number, number] | null = trackedVehicle?.predictedPosition
    ? [trackedVehicle.predictedPosition.lat, trackedVehicle.predictedPosition.lng]
    : riderPosition;

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

      latestCoordsRef.current = {
        latitude,
        longitude,
        accuracy,
        speed: speed || 0,
        heading: heading || 0,
      };
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

  // Emit rider GPS updates at deterministic 4s cadence for backend real-time sync.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!socketRef.current?.connected) return;
      const latest = latestCoordsRef.current;
      if (!latest) return;
      socketRef.current.emit("rider_location_update", {
        orderId: activeDelivery?.id || null,
        latitude: latest.latitude,
        longitude: latest.longitude,
        accuracy: latest.accuracy ?? 0,
        speed: latest.speed ?? 0,
        heading: latest.heading ?? 0,
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeDelivery?.id]);

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
  };

  const centerOnRider = useCallback(() => {
    if (mapRef.current && animatedRiderPos) {
      mapRef.current.setView(animatedRiderPos, 16);
    }
  }, [animatedRiderPos]);

  if (isLoading) {
    return (
      <Card className={cn("flex items-center justify-center", className)}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </Card>
    );
  }

  const defaultCenter = new LatLng(animatedRiderPos?.[0] || 5.6037, animatedRiderPos?.[1] || -0.1870);

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
              {routeGeometry.length > 1 && (
                <>
                  <span className="text-primary font-medium">{distanceKm.toFixed(1)} km</span>
                  <span>•</span>
                  <span className="text-primary font-medium">{etaMinutes} min</span>
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

      <CardContent className="p-0">
        {/* Active Delivery Info Bar */}
        {activeDelivery && (
          <div className="mx-2 mt-2 mb-2 bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-sm border p-3">
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
              </div>
            </div>
          </div>
        )}

        {!activeDelivery && (
          <div className="mx-2 mt-2 mb-2 bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-sm border p-4 text-center">
            <Truck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">No Active Delivery</p>
            <p className="text-xs text-muted-foreground">Accept a delivery to start navigation</p>
          </div>
        )}

        {shouldUseMapboxGl && destPos ? (
          <MapboxSingleTripMap
            center={animatedRiderPos || destPos}
            riderPos={animatedRiderPos}
            viewerLocation={animatedRiderPos}
            destinationPos={destPos}
            routeGeometry={usageSnapshot.freezeSecondaryLayers ? [] : routeGeometry}
            className={cn("w-full", isFullscreen ? "h-[calc(100vh-160px)]" : "h-[420px]")}
            onLoad={() => {
              setMapboxInitFailed(false);
              setMapboxError("");
            }}
            onError={(error) => {
              console.error("Mapbox rider live map failed to initialize", error);
              setMapboxError(error instanceof Error ? error.message : String(error || "Mapbox initialization failed"));
              setMapboxInitFailed(true);
            }}
          />
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={14}
            className={cn("w-full", isFullscreen ? "h-[calc(100vh-160px)]" : "h-[420px]")}
            ref={mapRef}
          >
            <MapTileLayer />
            <MapUsageTracker />
            
            <MapInvalidator />
            <MapBoundsController riderPos={animatedRiderPos} destPos={destPos} />

            {/* Route polyline */}
            {!usageSnapshot.freezeSecondaryLayers && routeGeometry.length > 1 && (
              <Polyline 
                positions={routeGeometry} 
                color="#3b82f6" 
                weight={5} 
                opacity={0.8}
                dashArray="10, 10"
              />
            )}

            {/* Rider position marker */}
            {animatedRiderPos && (
              <Marker position={animatedRiderPos} icon={riderIcon}>
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
                    {routeGeometry.length > 1 && (
                      <div className="flex gap-3 mt-2 text-xs">
                        <span className="text-primary font-medium">
                          <Clock className="h-3 w-3 inline mr-1" />
                          {etaMinutes} min
                        </span>
                        <span className="text-primary font-medium">
                          {distanceKm.toFixed(1)} km
                        </span>
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        )}

        {mapboxInitFailed && (
          <div className="mx-2 mt-2 rounded-lg border border-amber-300 bg-background/95 px-3 py-2 text-xs text-amber-700 shadow-sm">
            Falling back to standard map view. {mapboxError || "Mapbox initialization failed."}
          </div>
        )}

        {/* Bottom stats bar */}
        <div className="mx-2 my-2">
          <div className="bg-white/95 dark:bg-gray-900/95 rounded-lg shadow-sm border px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              {routeGeometry.length > 1 ? (
                <>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4 text-blue-500" />
                    <span className="font-semibold">{etaMinutes} min</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="h-4 w-4 text-green-500" />
                    <span className="font-semibold">{distanceKm.toFixed(1)} km</span>
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
