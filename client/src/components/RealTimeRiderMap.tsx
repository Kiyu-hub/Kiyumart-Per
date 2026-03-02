import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapContainer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Icon, LatLng } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Truck, 
  Clock, 
  Maximize2, 
  Minimize2, 
  MapPin, 
  Phone, 
  Package, 
  Navigation,
  AlertTriangle,
  X,
  ExternalLink,
  RefreshCcw,
  ChevronDown,
  MapPinOff
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/UserAvatar";
import MapTileLayer from "@/tracking/components/MapTileLayer";
import MapUsageTracker from "@/tracking/components/MapUsageTracker";
import { useAnimatedFleetPositions } from "@/tracking/hooks/useAnimatedFleetPositions";
import { useUsageMonitorSnapshot } from "@/tracking/hooks/useUsageMonitorSnapshot";
import { useVehicleTracking } from "@/tracking/hooks/useVehicleTracking";
import { buildExternalNavigationUrl } from "@/tracking/providers/externalMapUrl";
import { isMapboxGlPreferred, reloadMapboxRuntimeConfig, resetMapboxGlLoader } from "@/tracking/mapbox/mapboxLoader";
import MapboxFleetMap from "@/tracking/mapbox/MapboxFleetMap";

interface RiderLocation {
  riderId: string;
  riderName: string;
  riderProfileImage?: string | null;
  orderId: string;
  orderNumber: string;
  orderStatus?: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string | null;
  hasLocation?: boolean;
  deliveryAddress?: string;
  deliveryPhone?: string;
  buyerName?: string;
  eta?: number; // ETA in minutes
  distance?: number; // Distance in km
}

interface PendingOrder {
  id: string;
  orderNumber: string;
  sellerId: string;
  buyerName: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  deliveryZoneId?: string | null;
  createdAt: string;
  total: string;
  status: string;
}

interface AvailableRider {
  id: string;
  name: string;
  email: string;
  phone: string;
  profileImage?: string | null;
  isAvailable: boolean;
  zoneMatched?: boolean;
  sellerZoneMatched?: boolean;
  currentLocation?: { lat: number; lng: number };
  distanceToOrder?: number;
}

const riderIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/3448/3448339.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
});

const destinationIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/684/684908.png",
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

const pendingOrderIcon = new Icon({
  iconUrl: "https://cdn-icons-png.flaticon.com/512/1048/1048953.png",
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

// Component to invalidate map size on mount (fixes common Leaflet rendering issues)
function MapInvalidator() {
  const map = useMap();
  
  useEffect(() => {
    // Invalidate size after a short delay to ensure container is fully rendered
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    
    // Also invalidate on window resize
    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    
    return () => {
      clearTimeout(timeout);
      window.removeEventListener('resize', handleResize);
    };
  }, [map]);
  
  return null;
}

// Component to fit map bounds to all markers
function MapBoundsController({ riders, pendingOrders }: { riders: RiderLocation[]; pendingOrders: PendingOrder[] }) {
  const map = useMap();
  
  useEffect(() => {
    const points: [number, number][] = [
      ...riders.filter(r => r.latitude && r.longitude).map(r => [r.latitude, r.longitude] as [number, number]),
      ...pendingOrders.filter(o => o.deliveryLatitude && o.deliveryLongitude)
        .map(o => [Number(o.deliveryLatitude), Number(o.deliveryLongitude)] as [number, number])
    ];
    
    if (points.length > 0) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 14 });
    }
  }, [map, riders.length, pendingOrders.length]);
  
  return null;
}

interface RealTimeRiderMapProps {
  forceMapboxGl?: boolean;
}

export default function RealTimeRiderMap({ forceMapboxGl = false }: RealTimeRiderMapProps) {
  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [center] = useState<LatLng>(new LatLng(5.6037, -0.1870)); // Accra, Ghana
  const [mapboxInitFailed, setMapboxInitFailed] = useState(false);
  const [mapboxError, setMapboxError] = useState<string>("");
  const [mapboxRetryNonce, setMapboxRetryNonce] = useState(0);
  const [isRetryingMapbox, setIsRetryingMapbox] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderLocation | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);
  const [availableRiders, setAvailableRiders] = useState<AvailableRider[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();
  const usageSnapshot = useUsageMonitorSnapshot();
  const shouldUseMapboxGl = (forceMapboxGl || isMapboxGlPreferred()) && !mapboxInitFailed;

  // Fetch initial active riders
  const { data: initialRiders = [], isLoading, refetch: refetchActiveRiders } = useQuery<RiderLocation[]>({
    queryKey: ["/api/admin/active-riders"],
    refetchInterval: 30000,
  });

  // Fetch pending orders that need assignment
  const { data: pendingOrdersData = [], refetch: refetchPendingOrders } = useQuery<PendingOrder[]>({
    queryKey: ["/api/admin/pending-orders"],
    refetchInterval: 60000,
  });

  // Fetch available riders for dispatch
  const { data: availableRidersData = [], refetch: refetchAvailableRiders } = useQuery<AvailableRider[]>({
    queryKey: [
      "/api/admin/available-riders",
      selectedOrder?.id,
      selectedOrder?.deliveryLatitude,
      selectedOrder?.deliveryLongitude,
      selectedOrder?.deliveryZoneId,
      selectedOrder?.sellerId,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedOrder?.deliveryLatitude != null) params.set("orderLat", String(selectedOrder.deliveryLatitude));
      if (selectedOrder?.deliveryLongitude != null) params.set("orderLng", String(selectedOrder.deliveryLongitude));
      if (selectedOrder?.deliveryZoneId) params.set("orderZoneId", String(selectedOrder.deliveryZoneId));
      if (selectedOrder?.sellerId) params.set("sellerId", String(selectedOrder.sellerId));
      const suffix = params.toString();
      const res = await fetch(`/api/admin/available-riders${suffix ? `?${suffix}` : ""}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch available riders");
      return res.json();
    },
    enabled: showDispatchPanel && !!selectedOrder,
  });

  // Assign rider mutation
  const assignRiderMutation = useMutation({
    mutationFn: async ({ orderId, riderId }: { orderId: string; riderId: string }) => {
      try {
        // Primary path used by admin/super-admin order operations.
        return await apiRequest("PATCH", `/api/orders/${orderId}/assign-rider`, { riderId });
      } catch (primaryErr: any) {
        const message = String(primaryErr?.message || "");
        // Backward-compatible fallback for environments still using legacy POST route.
        if (message.includes("404") || message.includes("405")) {
          return apiRequest("POST", `/api/orders/${orderId}/assign-rider`, { riderId });
        }
        throw primaryErr;
      }
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Rider assigned successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/active-riders"] });
      setShowDispatchPanel(false);
      setSelectedOrder(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to assign rider", variant: "destructive" });
    },
  });

  useEffect(() => {
    setRiders(initialRiders);
  }, [initialRiders]);

  useEffect(() => {
    setPendingOrders(pendingOrdersData);
  }, [pendingOrdersData]);

  useEffect(() => {
    setAvailableRiders(availableRidersData);
  }, [availableRidersData]);

  const fleetAnimationInput = useMemo(
    () => riders.map((rider) => ({
      vehicleId: rider.riderId,
      orderId: rider.orderId,
      latitude: rider.latitude,
      longitude: rider.longitude,
      speed: rider.speed,
      heading: rider.heading,
      timestamp: rider.timestamp,
    })),
    [riders],
  );
  const animatedFleetPositions = useAnimatedFleetPositions(fleetAnimationInput);

  const selectedRiderOrder = selectedRider ? pendingOrders.find((order) => order.id === selectedRider.orderId) : null;
  const selectedTripPhase =
    selectedRider?.orderStatus === "assigned" ? "assigned" :
    selectedRider?.orderStatus === "rider_arrived" || selectedRider?.orderStatus === "picked_up" ? "pickup" :
    selectedRider?.orderStatus === "arrived" ? "arrived" :
    selectedRider?.orderStatus === "delivered" ? "delivered" :
    "en_route";

  const trackedSelectedRider = useVehicleTracking({
    vehicleId: selectedRider?.riderId || "admin-selected-rider",
    orderId: selectedRider?.orderId,
    destination:
      selectedRiderOrder && selectedRiderOrder.deliveryLatitude != null && selectedRiderOrder.deliveryLongitude != null
        ? { lat: Number(selectedRiderOrder.deliveryLatitude), lng: Number(selectedRiderOrder.deliveryLongitude) }
        : null,
    tripPhase: selectedTripPhase,
    gps:
      selectedRider?.latitude != null && selectedRider?.longitude != null
        ? {
            lat: selectedRider.latitude,
            lng: selectedRider.longitude,
            speedMps: selectedRider.speed ?? 0,
            bearingDeg: selectedRider.heading ?? 0,
            timestampMs: selectedRider.timestamp ? new Date(selectedRider.timestamp).getTime() : Date.now(),
          }
        : undefined,
  });
  const selectedRouteGeometry = trackedSelectedRider?.route?.geometry?.map((point) => [point.lat, point.lng] as [number, number]) || [];

  // Socket.IO for real-time updates
  useEffect(() => {
    socketRef.current = io();

    socketRef.current.on("admin_rider_location_updated", (locationUpdate: RiderLocation) => {
      setRiders((prevRiders) => {
        const existingIndex = prevRiders.findIndex(r => r.riderId === locationUpdate.riderId);
        
        if (existingIndex >= 0) {
          const updated = [...prevRiders];
          updated[existingIndex] = { ...updated[existingIndex], ...locationUpdate };
          return updated;
        } else {
          return [...prevRiders, locationUpdate];
        }
      });
      
      // Update route if this is the selected rider
      if (selectedRider?.riderId === locationUpdate.riderId) {
        setSelectedRider(prev => prev ? { ...prev, ...locationUpdate } : null);
      }
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [selectedRider, toast]);

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

  const formatTimeSinceCreation = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins >= 60) {
      return { text: `${Math.floor(diffMins / 60)}h ${diffMins % 60}m`, isUrgent: true };
    }
    return { text: `${diffMins}m`, isUrgent: diffMins >= 45 };
  };

  const handleDispatchOrder = (order: PendingOrder) => {
    setSelectedOrder(order);
    setShowDispatchPanel(true);
  };

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);
  
  // Count riders with valid location data
  const ridersWithLocation = riders.filter(r => r.latitude !== null && r.longitude !== null);
  const ridersWithoutLocation = riders.filter(r => r.latitude === null || r.longitude === null);

  return (
    <>
      {/* Fullscreen backdrop overlay */}
      {isFullscreen && (
        <div 
          className="fixed inset-0 bg-black/50 z-[9998]" 
          onClick={toggleFullscreen}
        />
      )}
      
      <Card 
        data-testid="card-rider-map"
        className={isFullscreen ? "fixed inset-0 z-[9999] rounded-none h-screen flex flex-col overflow-hidden" : ""}
      >
        <CardHeader className="pb-2 shrink-0">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                Command Center - Live Tracking
              </CardTitle>
              <CardDescription>
                Real-time monitoring of all active deliveries and pending orders
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              <Badge variant="secondary" data-testid="badge-active-riders">
                {ridersWithLocation.length}/{riders.length} On Map
              </Badge>
              {ridersWithoutLocation.length > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-300" data-testid="badge-no-gps">
                  {ridersWithoutLocation.length} No GPS
                </Badge>
              )}
              {pendingOrders.length > 0 && (
                <Badge variant="destructive" data-testid="badge-pending-orders">
                  {pendingOrders.length} Pending
                </Badge>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  refetchActiveRiders();
                  refetchPendingOrders();
                  if (showDispatchPanel) {
                    refetchAvailableRiders();
                  }
                }}
                data-testid="button-refresh"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleFullscreen}
                data-testid="button-fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={`p-0 ${isFullscreen ? "flex-1 min-h-0 overflow-hidden flex flex-col" : ""}`}>
          <div className={`flex ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
            {/* Map Container */}
            <div 
              className={`relative transition-all duration-300 ${selectedRider ? "flex-1" : "w-full"} ${isFullscreen ? "h-full min-h-0" : "h-[520px] lg:h-[560px]"}`}
              data-testid="map-container"
            >
              {isLoading ? (
                <div className="h-full flex items-center justify-center bg-muted">
                  <p className="text-muted-foreground">Loading map...</p>
                </div>
              ) : (
                <>
                  {shouldUseMapboxGl ? (
                    <MapboxFleetMap
                      key={`fleet-mapbox-${mapboxRetryNonce}`}
                      center={[center.lat, center.lng]}
                      riders={riders
                        .filter((rider): rider is RiderLocation & { latitude: number; longitude: number } => rider.latitude !== null && rider.longitude !== null)
                        .map((rider) => ({
                          riderId: rider.riderId,
                          latitude: animatedFleetPositions[rider.riderId]?.lat ?? rider.latitude,
                          longitude: animatedFleetPositions[rider.riderId]?.lng ?? rider.longitude,
                        }))}
                      pendingOrders={
                        usageSnapshot.freezeSecondaryLayers
                          ? []
                          : pendingOrders
                              .filter((order) => order.deliveryLatitude && order.deliveryLongitude)
                              .map((order) => ({
                                id: order.id,
                                latitude: Number(order.deliveryLatitude),
                                longitude: Number(order.deliveryLongitude),
                              }))
                      }
                      routeGeometry={usageSnapshot.freezeSecondaryLayers ? [] : selectedRouteGeometry}
                      selectedDestination={
                        selectedRiderOrder
                          ? [Number(selectedRiderOrder.deliveryLatitude), Number(selectedRiderOrder.deliveryLongitude)]
                          : null
                      }
                      style={{ height: "100%", width: "100%" }}
                      onRiderClick={(riderId) => {
                        const rider = riders.find((entry) => entry.riderId === riderId);
                        if (rider) setSelectedRider(rider);
                      }}
                      onOrderClick={(orderId) => {
                        const order = pendingOrders.find((entry) => entry.id === orderId);
                        if (order) handleDispatchOrder(order);
                      }}
                      requireMapboxToken={forceMapboxGl}
                      onLoad={() => {
                        setMapboxInitFailed(false);
                        setMapboxError("");
                      }}
                      onError={(error) => {
                        console.error("Mapbox fleet map failed to initialize", error);
                        setMapboxError(error instanceof Error ? error.message : String(error || "Mapbox initialization failed"));
                        setMapboxInitFailed(true);
                      }}
                    />
                  ) : (
                    <MapContainer
                      center={center}
                      zoom={12}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <MapTileLayer />
                      <MapUsageTracker />
                      
                      <MapInvalidator />
                      <MapBoundsController riders={riders} pendingOrders={pendingOrders} />
                      
                      {/* Route polyline */}
                      {!usageSnapshot.freezeSecondaryLayers && selectedRouteGeometry.length > 1 && (
                        <Polyline 
                          positions={selectedRouteGeometry} 
                          color="#3b82f6" 
                          weight={4}
                          opacity={0.8}
                        />
                      )}
                      
                      {/* Clustered rider markers */}
                      <MarkerClusterGroup chunkedLoading>
                        {riders.filter((rider): rider is RiderLocation & { latitude: number; longitude: number } => 
                          rider.latitude !== null && rider.longitude !== null
                        ).map((rider) => (
                          <Marker
                            key={rider.riderId}
                            position={
                              animatedFleetPositions[rider.riderId]
                                ? [animatedFleetPositions[rider.riderId].lat, animatedFleetPositions[rider.riderId].lng]
                                : [rider.latitude, rider.longitude]
                            }
                            icon={riderIcon}
                            eventHandlers={{
                              click: () => setSelectedRider(rider),
                            }}
                          >
                            <Popup>
                              <div className="p-2 min-w-[200px]">
                                <h3 className="font-bold text-sm mb-1">{rider.riderName}</h3>
                                <p className="text-xs text-muted-foreground mb-2">
                                  Order #{rider.orderNumber}
                                </p>
                                <Button 
                                  size="sm" 
                                  className="w-full mt-2"
                                  onClick={() => setSelectedRider(rider)}
                                >
                                  View Details
                                </Button>
                              </div>
                            </Popup>
                          </Marker>
                        ))}
                      </MarkerClusterGroup>

                      {/* Pending order markers */}
                      {!usageSnapshot.freezeSecondaryLayers &&
                        pendingOrders.filter(o => o.deliveryLatitude && o.deliveryLongitude).map((order) => (
                        <Marker
                          key={order.id}
                          position={[Number(order.deliveryLatitude), Number(order.deliveryLongitude)]}
                          icon={pendingOrderIcon}
                          eventHandlers={{
                            click: () => handleDispatchOrder(order),
                          }}
                        >
                          <Popup>
                            <div className="p-2 min-w-[200px]">
                              <div className="flex items-center gap-2 mb-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                <span className="font-bold text-sm">Pending Order</span>
                              </div>
                              <p className="text-xs mb-1">#{order.orderNumber}</p>
                              <p className="text-xs text-muted-foreground mb-2">{order.deliveryAddress}</p>
                              <Button 
                                size="sm" 
                                className="w-full"
                                onClick={() => handleDispatchOrder(order)}
                              >
                                Assign Rider
                              </Button>
                            </div>
                          </Popup>
                        </Marker>
                      ))}

                      {/* Destination marker for selected rider */}
                      {selectedRider && selectedRiderOrder && (
                        <Marker
                          position={[
                            Number(selectedRiderOrder.deliveryLatitude),
                            Number(selectedRiderOrder.deliveryLongitude)
                          ]}
                          icon={destinationIcon}
                        >
                          <Popup>
                            <div className="p-2">
                              <p className="font-bold text-sm">Delivery Destination</p>
                              <p className="text-xs text-muted-foreground">
                                {selectedRiderOrder.deliveryAddress}
                              </p>
                            </div>
                          </Popup>
                        </Marker>
                      )}
                    </MapContainer>
                  )}

                  {forceMapboxGl && mapboxInitFailed && (
                    <div className="absolute left-3 right-3 top-3 z-[1200] rounded-lg border border-destructive/30 bg-background/95 p-3 shadow-sm backdrop-blur">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-destructive">Mapbox failed to initialize</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {mapboxError || "Mapbox access token is missing. Set VITE_MAPBOX_ACCESS_TOKEN or MAPBOX_PUBLIC_TOKEN."}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isRetryingMapbox}
                          onClick={async () => {
                            setIsRetryingMapbox(true);
                            setMapboxError("");
                            try {
                              resetMapboxGlLoader();
                              await reloadMapboxRuntimeConfig(true);
                            } catch (error) {
                              setMapboxError(error instanceof Error ? error.message : String(error || "Mapbox configuration refresh failed"));
                            } finally {
                              setMapboxInitFailed(false);
                              setMapboxRetryNonce((prev) => prev + 1);
                              setIsRetryingMapbox(false);
                            }
                          }}
                        >
                          {isRetryingMapbox ? "Retrying..." : "Retry Mapbox"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Empty state overlay */}
                  {ridersWithLocation.length === 0 && pendingOrders.length === 0 && (
                    <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
                      <div className="bg-background/80 backdrop-blur-sm rounded-lg p-6 text-center max-w-sm">
                        <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        {riders.length > 0 ? (
                          <>
                            <p className="text-muted-foreground font-medium mb-2">
                              {riders.length} active {riders.length === 1 ? 'rider' : 'riders'} but no GPS data
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Riders need to enable location sharing on their devices to appear on the map.
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">No active deliveries or pending orders</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Rider Detail Sidebar */}
            {selectedRider && (
              <div 
                className={`${isFullscreen ? "w-[340px] xl:w-[400px] h-full min-h-0 flex-shrink-0" : "w-1/3 h-[520px] lg:h-[560px]"} border-l bg-background overflow-hidden`}
                >
                <ScrollArea className="h-full">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">Rider Details</h3>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setSelectedRider(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Rider Info */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <UserAvatar
                          profileImage={selectedRider.riderProfileImage || null}
                          name={selectedRider.riderName}
                          size="lg"
                        />
                        <div>
                          <p className="font-semibold">{selectedRider.riderName}</p>
                          <p className="text-sm text-muted-foreground">Active Delivery</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Order Info */}
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Order #{selectedRider.orderNumber}
                        </h4>
                        <div className="space-y-2 text-sm">
                          {selectedRider.deliveryAddress && (
                            <div className="flex items-start gap-2">
                              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                              <span>{selectedRider.deliveryAddress}</span>
                            </div>
                          )}
                          {selectedRider.deliveryPhone && (
                            <div className="flex items-center gap-2">
                              <Phone className="h-4 w-4 text-muted-foreground" />
                              <a 
                                href={`tel:${selectedRider.deliveryPhone}`}
                                className="text-primary hover:underline"
                              >
                                {selectedRider.deliveryPhone}
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* ETA & Distance */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                          <Navigation className="h-5 w-5 mx-auto text-blue-600 mb-1" />
                          <p className="text-lg font-bold text-blue-600">
                            {typeof trackedSelectedRider?.eta?.distanceKm === "number"
                              ? `${trackedSelectedRider.eta.distanceKm.toFixed(1)} km`
                              : "--"}
                          </p>
                          <p className="text-xs text-muted-foreground">Distance</p>
                        </div>
                        <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                          <Clock className="h-5 w-5 mx-auto text-green-600 mb-1" />
                          <p className="text-lg font-bold text-green-600">
                            {typeof trackedSelectedRider?.eta?.minutes === "number"
                              ? `${trackedSelectedRider.eta.minutes} min`
                              : "--"}
                          </p>
                          <p className="text-xs text-muted-foreground">ETA</p>
                        </div>
                      </div>

                      <Separator />

                      {/* Real-time Stats */}
                      <div>
                        <h4 className="font-medium mb-2">Real-time Data</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Speed</span>
                            <span className="font-medium">
                              {selectedRider.speed !== null 
                                ? `${Math.round(selectedRider.speed * 3.6)} km/h` 
                                : 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Last Update</span>
                            <span className="font-medium">{selectedRider.timestamp ? formatTimestamp(selectedRider.timestamp) : 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Location</span>
                            <span className="font-mono text-xs">
                              {selectedRider.latitude && selectedRider.longitude 
                                ? `${selectedRider.latitude.toFixed(5)}, ${selectedRider.longitude.toFixed(5)}`
                                : 'No location data'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-4 space-y-2">
                        <Button 
                          className="w-full"
                          variant="outline"
                          disabled={!selectedRider.latitude || !selectedRider.longitude}
                          onClick={() => {
                            if (selectedRider.latitude && selectedRider.longitude) {
                              const destination = selectedRiderOrder
                                ? {
                                    destinationLat: Number(selectedRiderOrder.deliveryLatitude),
                                    destinationLng: Number(selectedRiderOrder.deliveryLongitude),
                                  }
                                : {};
                              const url = buildExternalNavigationUrl({
                                lat: selectedRider.latitude,
                                lng: selectedRider.longitude,
                                ...destination,
                              });
                              window.open(url, '_blank');
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in External Map
                        </Button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          
          {/* Riders without GPS section */}
          {!isFullscreen && ridersWithoutLocation.length > 0 && (
            <div className="border-t p-4">
              <Collapsible>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <MapPinOff className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-sm">
                      {ridersWithoutLocation.length} Rider{ridersWithoutLocation.length !== 1 ? 's' : ''} Without GPS Data
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {ridersWithoutLocation.map((rider) => (
                      <div
                        key={rider.riderId}
                        className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg"
                      >
                        <UserAvatar
                          profileImage={rider.riderProfileImage || null}
                          name={rider.riderName}
                          size="sm"
                          className="flex-shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{rider.riderName}</p>
                          <p className="text-xs text-muted-foreground truncate">Order #{rider.orderNumber}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    These riders have active deliveries but haven't shared their location yet.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dispatch Panel Sheet */}
      <Sheet open={showDispatchPanel} onOpenChange={setShowDispatchPanel}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>Assign Rider to Order</SheetTitle>
            <SheetDescription>
              Select an available rider to assign to this delivery
            </SheetDescription>
          </SheetHeader>

          {selectedOrder && (
            <div className="mt-6 space-y-6">
              {/* Order Details */}
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="h-5 w-5 text-primary" />
                  <span className="font-bold">Order #{selectedOrder.orderNumber}</span>
                </div>
                <p className="text-sm text-muted-foreground mb-1">{selectedOrder.deliveryAddress}</p>
                <p className="text-sm">
                  <span className="font-medium">Total:</span> GHS {selectedOrder.total}
                </p>
                <div className="mt-2">
                  {(() => {
                    const time = formatTimeSinceCreation(selectedOrder.createdAt);
                    return (
                      <Badge variant={time.isUrgent ? "destructive" : "secondary"}>
                        Waiting: {time.text}
                      </Badge>
                    );
                  })()}
                </div>
              </div>

              {/* Available Riders */}
              <div>
                <h4 className="font-medium mb-3">Available Riders</h4>
                {availableRiders.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No riders currently available
                  </p>
                ) : (
                  <div className="space-y-2">
                    {availableRiders.map((rider, index) => (
                      <div
                        key={rider.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <UserAvatar
                            profileImage={rider.profileImage || null}
                            name={rider.name}
                            email={rider.email}
                            size="md"
                          />
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{rider.name}</p>
                              {index === 0 && (
                                <Badge className="text-[10px] px-2 py-0.5 bg-emerald-600 text-white">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                            {typeof rider.distanceToOrder === "number" && (
                              <p className="text-xs text-muted-foreground">
                                {rider.distanceToOrder.toFixed(1)} km away
                              </p>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => assignRiderMutation.mutate({ 
                            orderId: selectedOrder.id, 
                            riderId: rider.id 
                          })}
                          disabled={assignRiderMutation.isPending}
                        >
                          Assign
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

