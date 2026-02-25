import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
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
  User, 
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
import { fetchOrderEta } from "@/lib/eta";

interface RiderLocation {
  riderId: string;
  riderName: string;
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
  buyerName: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryLatitude: number;
  deliveryLongitude: number;
  createdAt: string;
  total: string;
  status: string;
}

interface AvailableRider {
  id: string;
  name: string;
  email: string;
  phone: string;
  isAvailable: boolean;
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

// OSRM route geometry for visual path only. ETA is backend-computed.
async function calculateRoute(from: [number, number], to: [number, number]): Promise<[number, number][] | null> {
  try {
    const response = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`
    );
    const data = await response.json();
    
    if (data.code === "Ok" && data.routes?.[0]) {
      const route = data.routes[0];
      return route.geometry.coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
    }
    return null;
  } catch (error) {
    console.error("OSRM route calculation failed:", error);
    return null;
  }
}

export default function RealTimeRiderMap() {
  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [center] = useState<LatLng>(new LatLng(5.6037, -0.1870)); // Accra, Ghana
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderLocation | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [routeGeometry, setRouteGeometry] = useState<[number, number][] | null>(null);
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);
  const [availableRiders, setAvailableRiders] = useState<AvailableRider[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const { toast } = useToast();

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
    queryKey: ["/api/admin/available-riders"],
    enabled: showDispatchPanel,
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
    if (initialRiders.length > 0) {
      setRiders(initialRiders);
    }
  }, [initialRiders]);

  useEffect(() => {
    if (pendingOrdersData.length > 0) {
      setPendingOrders(pendingOrdersData);
    }
  }, [pendingOrdersData]);

  useEffect(() => {
    if (availableRidersData.length > 0) {
      setAvailableRiders(availableRidersData);
    }
  }, [availableRidersData]);

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

    // Listen for geofencing alerts
    socketRef.current.on("geofence_alert", (alert: { riderId: string; riderName: string; message: string }) => {
      toast({
        title: "Geofence Alert",
        description: `${alert.riderName}: ${alert.message}`,
        variant: "destructive",
      });
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, [selectedRider, toast]);

  // Calculate route when rider is selected
  useEffect(() => {
    if (selectedRider && selectedRider.deliveryAddress && selectedRider.latitude && selectedRider.longitude) {
      const order = pendingOrders.find(o => o.id === selectedRider.orderId);
      if (order && order.deliveryLatitude && order.deliveryLongitude) {
        calculateRoute(
          [selectedRider.latitude, selectedRider.longitude],
          [Number(order.deliveryLatitude), Number(order.deliveryLongitude)]
        ).then(route => {
          setRouteGeometry(route);
        });
      }
    } else {
      setRouteGeometry(null);
    }
  }, [selectedRider?.riderId, pendingOrders]);

  useEffect(() => {
    const loadSelectedRiderEta = async () => {
      if (!selectedRider?.orderId || selectedRider.latitude == null || selectedRider.longitude == null) return;
      try {
        const eta = await fetchOrderEta({
          orderId: selectedRider.orderId,
          riderLat: selectedRider.latitude,
          riderLng: selectedRider.longitude,
          speed: selectedRider.speed,
        });
        setSelectedRider((prev) =>
          prev
            ? {
                ...prev,
                eta: eta.etaMinutes,
                distance: eta.distanceKm,
              }
            : null
        );
      } catch {
        // Keep rendering location data even if ETA fetch temporarily fails.
      }
    };
    loadSelectedRiderEta();
  }, [selectedRider?.orderId, selectedRider?.latitude, selectedRider?.longitude, selectedRider?.speed]);

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

  const mapHeight = isFullscreen ? "100vh" : "600px";
  
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
        className={isFullscreen ? "fixed inset-0 z-[9999] rounded-none" : ""}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5 text-primary" />
                Command Center - Live Tracking
              </CardTitle>
              <CardDescription>
                Real-time monitoring of all active deliveries and pending orders
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
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
        <CardContent className="p-0">
          <div className="flex">
            {/* Map Container */}
            <div 
              className={`relative ${selectedRider ? 'w-2/3' : 'w-full'} transition-all duration-300`}
              style={{ height: mapHeight }}
              data-testid="map-container"
            >
              {isLoading ? (
                <div className="h-full flex items-center justify-center bg-muted">
                  <p className="text-muted-foreground">Loading map...</p>
                </div>
              ) : (
                <MapContainer
                  center={center}
                  zoom={12}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  <MapInvalidator />
                  <MapBoundsController riders={riders} pendingOrders={pendingOrders} />
                  
                  {/* Route polyline */}
                  {routeGeometry && (
                    <Polyline 
                      positions={routeGeometry} 
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
                        position={[rider.latitude, rider.longitude]}
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
                  {pendingOrders.filter(o => o.deliveryLatitude && o.deliveryLongitude).map((order) => (
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
                  {selectedRider && pendingOrders.find(o => o.id === selectedRider.orderId) && (
                    <Marker
                      position={[
                        Number(pendingOrders.find(o => o.id === selectedRider.orderId)!.deliveryLatitude),
                        Number(pendingOrders.find(o => o.id === selectedRider.orderId)!.deliveryLongitude)
                      ]}
                      icon={destinationIcon}
                    >
                      <Popup>
                        <div className="p-2">
                          <p className="font-bold text-sm">Delivery Destination</p>
                          <p className="text-xs text-muted-foreground">
                            {pendingOrders.find(o => o.id === selectedRider.orderId)?.deliveryAddress}
                          </p>
                        </div>
                      </Popup>
                    </Marker>
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
                </MapContainer>
              )}
            </div>

            {/* Rider Detail Sidebar */}
            {selectedRider && (
              <div 
                className="w-1/3 border-l bg-background overflow-hidden"
                style={{ height: mapHeight }}
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
                          setRouteGeometry(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Rider Info */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="h-6 w-6 text-primary" />
                        </div>
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
                            {selectedRider.distance ? `${selectedRider.distance.toFixed(1)} km` : '--'}
                          </p>
                          <p className="text-xs text-muted-foreground">Distance</p>
                        </div>
                        <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg text-center">
                          <Clock className="h-5 w-5 mx-auto text-green-600 mb-1" />
                          <p className="text-lg font-bold text-green-600">
                            {selectedRider.eta ? `${selectedRider.eta} min` : '--'}
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
                              const url = `https://www.openstreetmap.org/?mlat=${selectedRider.latitude}&mlon=${selectedRider.longitude}#map=16/${selectedRider.latitude}/${selectedRider.longitude}`;
                              window.open(url, '_blank');
                            }
                          }}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Open in OpenStreetMap
                        </Button>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          
          {/* Riders without GPS section */}
          {ridersWithoutLocation.length > 0 && (
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
                        <div className="h-8 w-8 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
                          <User className="h-4 w-4 text-amber-600" />
                        </div>
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
                    {availableRiders.map((rider) => (
                      <div
                        key={rider.id}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <User className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{rider.name}</p>
                            {rider.distanceToOrder && (
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
