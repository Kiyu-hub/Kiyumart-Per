import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Navigation, 
  Phone, 
  MapPin, 
  Clock, 
  Package, 
  User,
  Maximize2,
  Minimize2,
  RefreshCcw,
  LocateFixed
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { fetchOrderEta } from "@/lib/eta";

interface DeliveryDetails {
  orderId: string;
  orderNumber: string;
  buyerName: string;
  buyerPhone: string;
  deliveryAddress: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  sellerName?: string;
  sellerAddress?: string;
  sellerLatitude?: number;
  sellerLongitude?: number;
  status: string;
}

interface RouteInfo {
  geometry: [number, number][];
}

const riderIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

const destinationIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

const pickupIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1048/1048953.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

// Component to center map on user location
function MapCenterController({ position }: { position: [number, number] | null }) {
  const map = useMap();
  
  useEffect(() => {
    if (position) {
      map.setView(position, 15);
    }
  }, [map, position]);
  
  return null;
}

// OSRM route geometry for path visualization only. ETA is backend-computed.
async function calculateRoute(from: [number, number], to: [number, number]): Promise<RouteInfo | null> {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    );
    const data = await response.json();
    
    if (data.code === "Ok" && data.routes?.[0]) {
      const route = data.routes[0];
      return {
        geometry: route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number])
      };
    }
    return null;
  } catch (error) {
    console.error("OSRM route calculation failed:", error);
    return null;
  }
}

interface RiderNavigationMapProps {
  delivery: DeliveryDetails;
  riderId: string;
  onLocationUpdate?: (lat: number, lng: number) => void;
}

export default function RiderNavigationMap({ delivery, riderId, onLocationUpdate }: RiderNavigationMapProps) {
  const [currentPosition, setCurrentPosition] = useState<[number, number] | null>(null);
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWatching, setIsWatching] = useState(false);
  const watchIdRef = useRef<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const latestCoordsRef = useRef<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    speed?: number | null;
    heading?: number | null;
  } | null>(null);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  const etaQuery = useQuery({
    queryKey: ["/api/orders/eta", delivery.orderId, currentPosition?.[0], currentPosition?.[1]],
    queryFn: () =>
      fetchOrderEta({
        orderId: delivery.orderId,
        riderLat: currentPosition?.[0],
        riderLng: currentPosition?.[1],
      }),
    enabled: Boolean(delivery.orderId && currentPosition?.[0] != null && currentPosition?.[1] != null),
    refetchInterval: 10000,
  });

  // Start watching position
  const startWatching = useCallback(() => {
    if (!navigator.geolocation) {
      console.error("Geolocation not supported");
      return;
    }

    setIsWatching(true);

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const newPos: [number, number] = [position.coords.latitude, position.coords.longitude];
        setCurrentPosition(newPos);
        setLastUpdateTime(new Date());

        latestCoordsRef.current = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
        };

        onLocationUpdate?.(position.coords.latitude, position.coords.longitude);
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  }, [riderId, delivery.orderId, onLocationUpdate]);

  // Stop watching position
  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWatching(false);
  }, []);

  // Initialize socket and geolocation
  useEffect(() => {
    socketRef.current = io();

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentPosition([position.coords.latitude, position.coords.longitude]);
      },
      (error) => {
        console.error("Initial geolocation error:", error);
        // Default to delivery location if can't get current position
        if (delivery.deliveryLatitude && delivery.deliveryLongitude) {
          setCurrentPosition([delivery.deliveryLatitude, delivery.deliveryLongitude]);
        }
      }
    );

    // Auto-start watching when component mounts
    startWatching();

    return () => {
      stopWatching();
      socketRef.current?.disconnect();
    };
  }, [delivery, startWatching, stopWatching]);

  // Emit rider GPS updates at deterministic 4s cadence for backend real-time sync.
  useEffect(() => {
    const timer = window.setInterval(() => {
      const latest = latestCoordsRef.current;
      if (!latest || !socketRef.current?.connected) return;
      socketRef.current.emit("rider_location_update", {
        riderId,
        orderId: delivery.orderId,
        latitude: latest.latitude,
        longitude: latest.longitude,
        accuracy: latest.accuracy ?? 0,
        speed: latest.speed ?? 0,
        heading: latest.heading ?? 0,
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [delivery.orderId, riderId]);

  // Calculate route when position or destination changes
  useEffect(() => {
    if (currentPosition && delivery.deliveryLatitude && delivery.deliveryLongitude) {
      calculateRoute(
        currentPosition,
        [delivery.deliveryLatitude, delivery.deliveryLongitude]
      ).then(route => {
        if (route) {
          setRouteInfo(route);
        }
      });
    }
  }, [currentPosition, delivery.deliveryLatitude, delivery.deliveryLongitude]);

  const mapHeight = isFullscreen ? "100vh" : "400px";

  const openInMaps = () => {
    if (delivery.deliveryLatitude && delivery.deliveryLongitude) {
      const url = `https://www.openstreetmap.org/?mlat=${delivery.deliveryLatitude}&mlon=${delivery.deliveryLongitude}#map=16/${delivery.deliveryLatitude}/${delivery.deliveryLongitude}`;
      window.open(url, '_blank');
    }
  };

  const callBuyer = () => {
    if (delivery.buyerPhone) {
      window.location.href = `tel:${delivery.buyerPhone}`;
    }
  };

  return (
    <Card className={isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            Delivery Navigation
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={isWatching ? "default" : "secondary"}>
              {isWatching ? "Live Tracking" : "Paused"}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Route Info Bar */}
        <div className="p-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {routeInfo ? `${(etaQuery.data?.distanceKm ?? 0).toFixed(1)} km` : '--'}
                </p>
                <p className="text-xs opacity-90">Distance</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">
                  {routeInfo ? `${etaQuery.data?.etaMinutes ?? '--'} min` : '--'}
                </p>
                <p className="text-xs opacity-90">ETA</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={openInMaps}
              >
                <Navigation className="h-4 w-4 mr-1" />
                Navigate
              </Button>
              <Button 
                size="sm" 
                variant="secondary"
                onClick={callBuyer}
              >
                <Phone className="h-4 w-4 mr-1" />
                Call
              </Button>
            </div>
          </div>
        </div>

        {/* Map */}
        <div style={{ height: mapHeight }} className="relative">
          <MapContainer
            center={currentPosition || [5.6037, -0.1870]}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            
            {currentPosition && <MapCenterController position={currentPosition} />}
            
            {/* Route polyline */}
            {routeInfo && (
              <Polyline 
                positions={routeInfo.geometry} 
                color="#3b82f6" 
                weight={5}
                opacity={0.8}
              />
            )}
            
            {/* Current position marker */}
            {currentPosition && (
              <Marker position={currentPosition} icon={riderIcon}>
                <Popup>
                  <div className="p-2 text-center">
                    <p className="font-bold">Your Location</p>
                    {lastUpdateTime && (
                      <p className="text-xs text-muted-foreground">
                        Updated: {lastUpdateTime.toLocaleTimeString()}
                      </p>
                    )}
                  </div>
                </Popup>
              </Marker>
            )}
            
            {/* Pickup location marker (if available) */}
            {delivery.sellerLatitude && delivery.sellerLongitude && delivery.status === "assigned" && (
              <Marker 
                position={[delivery.sellerLatitude, delivery.sellerLongitude]} 
                icon={pickupIcon}
              >
                <Popup>
                  <div className="p-2">
                    <p className="font-bold text-sm">Pickup Location</p>
                    <p className="text-xs text-muted-foreground">{delivery.sellerAddress || delivery.sellerName}</p>
                  </div>
                </Popup>
              </Marker>
            )}
            
            {/* Destination marker */}
            {delivery.deliveryLatitude && delivery.deliveryLongitude && (
              <Marker 
                position={[delivery.deliveryLatitude, delivery.deliveryLongitude]} 
                icon={destinationIcon}
              >
                <Popup>
                  <div className="p-2">
                    <p className="font-bold text-sm">Delivery Destination</p>
                    <p className="text-xs text-muted-foreground">{delivery.deliveryAddress}</p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>

          {/* Recenter button */}
          <Button
            variant="secondary"
            size="icon"
            className="absolute bottom-4 right-4 z-[1000] shadow-lg"
            onClick={() => {
              navigator.geolocation.getCurrentPosition(
                (pos) => setCurrentPosition([pos.coords.latitude, pos.coords.longitude]),
                (err) => console.error(err)
              );
            }}
          >
            <LocateFixed className="h-4 w-4" />
          </Button>
        </div>

        {/* Delivery Details */}
        <div className="p-4 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
            <Package className="h-8 w-8 text-primary" />
            <div>
              <p className="font-semibold">Order #{delivery.orderNumber}</p>
              <Badge className="mt-1">{delivery.status.replace(/_/g, ' ')}</Badge>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="font-medium">{delivery.buyerName}</p>
                <a 
                  href={`tel:${delivery.buyerPhone}`} 
                  className="text-sm text-primary hover:underline flex items-center gap-1"
                >
                  <Phone className="h-3 w-3" />
                  {delivery.buyerPhone}
                </a>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Delivery Address</p>
                <p className="text-sm text-muted-foreground">{delivery.deliveryAddress}</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
