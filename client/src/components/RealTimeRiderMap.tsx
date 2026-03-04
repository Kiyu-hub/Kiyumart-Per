import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapContainer, Marker, Popup, Polyline, useMap, Circle, CircleMarker } from "react-leaflet";
import { Icon, LatLng, Map as LeafletMap } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  MapPinOff,
  Plus,
  Minus,
  LocateFixed,
  Crosshair,
  Layers3,
  Compass,
  Route
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
import { TRACKING_BUDGETS } from "@/tracking/config";
import { isMapboxGlPreferred, reloadMapboxRuntimeConfig, resetMapboxGlLoader, resolveMapboxStyleUrl } from "@/tracking/mapbox/mapboxLoader";
import MapboxFleetMap from "@/tracking/mapbox/MapboxFleetMap";
import { OPEN_SOURCE_MAP_PRESETS } from "@/tracking/components/MapTileLayer";

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

const MAPBOX_STYLE_PRESETS = [
  { value: "mapbox://styles/mapbox/streets-v12", label: "Streets" },
  { value: "mapbox://styles/mapbox/outdoors-v12", label: "Outdoors" },
  { value: "mapbox://styles/mapbox/light-v11", label: "Light" },
  { value: "mapbox://styles/mapbox/dark-v11", label: "Dark" },
  { value: "mapbox://styles/mapbox/satellite-v9", label: "Satellite" },
  { value: "mapbox://styles/mapbox/satellite-streets-v12", label: "Satellite Streets" },
  { value: "mapbox://styles/mapbox/navigation-day-v1", label: "Navigation Day" },
  { value: "mapbox://styles/mapbox/navigation-night-v1", label: "Navigation Night" },
] as const;

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

interface RealTimeRiderMapProps {
  forceMapboxGl?: boolean;
}

export default function RealTimeRiderMap({ forceMapboxGl = false }: RealTimeRiderMapProps) {
  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [center] = useState<LatLng>(new LatLng(5.6037, -0.1870)); // Accra, Ghana
  const [mapboxStyleUrl, setMapboxStyleUrl] = useState<string>(() => resolveMapboxStyleUrl());
  const [openSourceStyleId, setOpenSourceStyleId] = useState<string>(() => {
    if (typeof window === "undefined") return OPEN_SOURCE_MAP_PRESETS[0].id;
    const stored = String(window.localStorage.getItem("open_source_map_style") || "").trim();
    return OPEN_SOURCE_MAP_PRESETS.some((entry) => entry.id === stored) ? stored : OPEN_SOURCE_MAP_PRESETS[0].id;
  });
  const [mapboxInitFailed, setMapboxInitFailed] = useState(false);
  const [mapboxError, setMapboxError] = useState<string>("");
  const [mapboxRetryNonce, setMapboxRetryNonce] = useState(0);
  const [isRetryingMapbox, setIsRetryingMapbox] = useState(false);
  const [preferOpenSourceMap, setPreferOpenSourceMap] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedRider, setSelectedRider] = useState<RiderLocation | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);
  const [availableRiders, setAvailableRiders] = useState<AvailableRider[]>([]);
  const [viewerLocation, setViewerLocation] = useState<{ lat: number; lng: number; accuracyM: number | null } | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletAutoLockUntilRef = useRef(0);
  const leafletLastAutoCameraAtRef = useRef(0);
  const { toast } = useToast();
  const usageSnapshot = useUsageMonitorSnapshot();
  const shouldUseMapboxGl = (forceMapboxGl || isMapboxGlPreferred()) && !mapboxInitFailed && !preferOpenSourceMap;

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

  useEffect(() => {
    if (preferOpenSourceMap) return;
    if (!mapboxInitFailed) return;
    setMapboxInitFailed(false);
    setMapboxError("");
    setMapboxRetryNonce((prev) => prev + 1);
  }, [preferOpenSourceMap, mapboxInitFailed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem("open_source_map_style", openSourceStyleId);
    } catch {
      // Ignore storage write failures.
    }
  }, [openSourceStyleId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const persistedStyle = resolveMapboxStyleUrl();
    if (persistedStyle && persistedStyle !== mapboxStyleUrl) {
      setMapboxStyleUrl(persistedStyle);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const geolocation = window.navigator?.geolocation;
    if (!geolocation) return;
    const watchId = geolocation.watchPosition(
      (position) => {
        setViewerLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
      },
      () => {
        // Ignore permission and availability errors.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 20_000,
        timeout: 12_000,
      },
    );
    return () => geolocation.clearWatch(watchId);
  }, []);

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
  const focusPoint = useMemo<[number, number] | null>(() => {
    const selectedAnimated = selectedRider ? animatedFleetPositions[selectedRider.riderId] : null;
    if (selectedAnimated) return [selectedAnimated.lat, selectedAnimated.lng];
    if (selectedRider?.latitude != null && selectedRider?.longitude != null) return [selectedRider.latitude, selectedRider.longitude];
    const firstRider = riders.find((r) => r.latitude != null && r.longitude != null);
    if (firstRider) return [firstRider.latitude as number, firstRider.longitude as number];
    const firstOrder = pendingOrders.find((o) => o.deliveryLatitude != null && o.deliveryLongitude != null);
    if (firstOrder) return [Number(firstOrder.deliveryLatitude), Number(firstOrder.deliveryLongitude)];
    return null;
  }, [animatedFleetPositions, pendingOrders, riders, selectedRider]);
  const mapPointsForFit = useMemo<Array<[number, number]>>(() => {
    const points: Array<[number, number]> = [];
    riders.forEach((r) => {
      if (r.latitude != null && r.longitude != null) points.push([r.latitude, r.longitude]);
    });
    pendingOrders.forEach((o) => {
      if (o.deliveryLatitude != null && o.deliveryLongitude != null) {
        points.push([Number(o.deliveryLatitude), Number(o.deliveryLongitude)]);
      }
    });
    return points;
  }, [pendingOrders, riders]);
  const selectedOpenSourcePreset = useMemo(
    () => OPEN_SOURCE_MAP_PRESETS.find((entry) => entry.id === openSourceStyleId) || OPEN_SOURCE_MAP_PRESETS[0],
    [openSourceStyleId],
  );
  const selectedMapboxStyleValue = useMemo(
    () => MAPBOX_STYLE_PRESETS.find((entry) => entry.value === mapboxStyleUrl)?.value || MAPBOX_STYLE_PRESETS[0].value,
    [mapboxStyleUrl],
  );
  const viewerLocationPoint = viewerLocation ? ([viewerLocation.lat, viewerLocation.lng] as [number, number]) : null;

  const applyMapboxStyle = useCallback((styleUrl: string) => {
    setMapboxStyleUrl(styleUrl);
    if (typeof window !== "undefined") {
      try {
        (window as any).__MAPBOX_STYLE_URL__ = styleUrl;
        window.localStorage.setItem("mapbox_style_url", styleUrl);
      } catch {
        // Ignore style persistence failures.
      }
    }
    setMapboxInitFailed(false);
    setMapboxRetryNonce((prev) => prev + 1);
  }, []);

  const zoomLeafletIn = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const nextZoom = Math.min(Number(map.getZoom?.() || 12) + 1, 20);
    if (focusPoint) map.setView(focusPoint, nextZoom, { animate: true });
    else map.zoomIn(1, { animate: true });
  }, [focusPoint]);
  const zoomLeafletOut = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const nextZoom = Math.max(Number(map.getZoom?.() || 12) - 1, 2);
    if (focusPoint) map.setView(focusPoint, nextZoom, { animate: true });
    else map.zoomOut(1, { animate: true });
  }, [focusPoint]);
  const streetLeaflet = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map || !focusPoint) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    map.setView(focusPoint, 18, { animate: true });
  }, [focusPoint]);
  const fitLeaflet = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map || !mapPointsForFit.length) return;
    leafletAutoLockUntilRef.current = 0;
    if (focusPoint) {
      map.setView(focusPoint, 17, { animate: true });
      leafletLastAutoCameraAtRef.current = Date.now();
      return;
    }
    if (mapPointsForFit.length === 1) {
      map.setView(mapPointsForFit[0], 17, { animate: true });
      leafletLastAutoCameraAtRef.current = Date.now();
      return;
    }
    map.fitBounds(mapPointsForFit, { padding: [40, 40], maxZoom: 18, animate: true });
    leafletLastAutoCameraAtRef.current = Date.now();
  }, [focusPoint, mapPointsForFit]);
  const focusLeaflet = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map || !focusPoint) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const zoom = Math.max(Number(map.getZoom?.() || 12), 17);
    map.setView(focusPoint, zoom, { animate: true });
  }, [focusPoint]);
  const locateLeaflet = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map || !viewerLocationPoint) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const zoom = Math.max(Number(map.getZoom?.() || 12), 17);
    map.setView(viewerLocationPoint, zoom, { animate: true });
  }, [viewerLocationPoint]);
  const northLeaflet = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    if (focusPoint) {
      map.setView(focusPoint, Number(map.getZoom?.() || 12), { animate: true });
      return;
    }
    if (mapPointsForFit.length > 1) {
      map.fitBounds(mapPointsForFit, { padding: [40, 40], maxZoom: 18, animate: true });
      return;
    }
    if (mapPointsForFit.length === 1) {
      map.setView(mapPointsForFit[0], 17, { animate: true });
    }
  }, [focusPoint, mapPointsForFit]);

  useEffect(() => {
    if (shouldUseMapboxGl) return;
    const map = leafletMapRef.current;
    if (!map) return;
    const now = Date.now();
    if (now < leafletAutoLockUntilRef.current) return;
    if (now - leafletLastAutoCameraAtRef.current < 900) return;

    if (focusPoint) {
      const nextZoom = Math.max(Number(map.getZoom?.() || 12), 17);
      map.setView(focusPoint, nextZoom, { animate: true });
      leafletLastAutoCameraAtRef.current = now;
      return;
    }

    if (mapPointsForFit.length === 1) {
      map.setView(mapPointsForFit[0], 17, { animate: true });
      leafletLastAutoCameraAtRef.current = now;
      return;
    }

    if (mapPointsForFit.length > 1) {
      map.fitBounds(mapPointsForFit, { padding: [40, 40], maxZoom: 18, animate: true });
      leafletLastAutoCameraAtRef.current = now;
    }
  }, [focusPoint, mapPointsForFit, shouldUseMapboxGl]);

  const usageSeverity = Math.max(usageSnapshot.tileUsagePct, usageSnapshot.routeUsagePct, usageSnapshot.mapUsagePct);
  const usageToneClass =
    usageSeverity >= 90
      ? "text-red-700"
      : usageSeverity >= 80
        ? "text-amber-700"
        : usageSeverity >= 60
          ? "text-blue-700"
          : "text-emerald-700";
  const usageFactors = [
    ridersWithLocation.length > 35 ? "Many live riders increase tile downloads and camera updates." : null,
    pendingOrders.length > 25 ? "High pending-order marker count increases render and tile pressure." : null,
    usageSnapshot.disableReroute ? "Reroute calls are high; frequent route recalculation can exceed routing budget." : null,
    usageSnapshot.freezeSecondaryLayers ? "Usage guardrails are active: secondary layers are already being limited." : null,
    usageSnapshot.tileUsagePct >= 80 ? "Rapid zoom/pan sessions can spike tile usage quickly." : null,
  ].filter(Boolean) as string[];
  const usageSummary =
    usageSeverity >= 90
      ? "Critical"
      : usageSeverity >= 80
        ? "High"
        : usageSeverity >= 60
          ? "Moderate"
          : "Healthy";

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
        <CardHeader className="py-3 pb-2 shrink-0">
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
              <div className="flex items-center gap-2 rounded-full border border-white/20 bg-background/70 px-2.5 py-1 backdrop-blur">
                <span className="text-[11px] font-medium text-muted-foreground">Open-source mode</span>
                <Switch
                  checked={preferOpenSourceMap}
                  onCheckedChange={setPreferOpenSourceMap}
                  data-testid="switch-open-source-map"
                />
              </div>
              <div className="flex min-w-[190px] items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-2 py-1.5 shadow-sm backdrop-blur">
                <Layers3 className="h-3.5 w-3.5 text-muted-foreground" />
                {shouldUseMapboxGl ? (
                  <Select value={selectedMapboxStyleValue} onValueChange={applyMapboxStyle}>
                    <SelectTrigger className="h-8 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0" data-testid="select-mapbox-style">
                      <SelectValue placeholder="Map style" />
                    </SelectTrigger>
                    <SelectContent>
                      {MAPBOX_STYLE_PRESETS.map((preset) => (
                        <SelectItem key={preset.value} value={preset.value}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Select value={openSourceStyleId} onValueChange={setOpenSourceStyleId}>
                    <SelectTrigger className="h-8 border-0 bg-transparent p-0 text-xs shadow-none focus:ring-0" data-testid="select-open-source-style">
                      <SelectValue placeholder="Tile style" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPEN_SOURCE_MAP_PRESETS.map((preset) => (
                        <SelectItem key={preset.id} value={preset.id}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
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
                className="rounded-full bg-background/80 backdrop-blur"
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
                className="rounded-full bg-background/80 backdrop-blur"
                onClick={toggleFullscreen}
                data-testid="button-fullscreen"
              >
                {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={`p-0 ${isFullscreen ? "flex-1 min-h-0 overflow-hidden flex flex-col" : ""}`}>
          <div className={`border-b bg-gradient-to-r from-background to-muted/30 ${isFullscreen ? "p-2" : "p-2.5"}`} data-testid="map-usage-bar">
            <div className="flex flex-wrap items-center gap-2">
              <p className={`text-xs font-semibold uppercase tracking-wide ${usageToneClass}`}>Map Usage</p>
              <Badge
                variant="outline"
                className={`text-[10px] ${usageSeverity >= 90 ? "border-red-300 text-red-700" : usageSeverity >= 80 ? "border-amber-300 text-amber-700" : "border-emerald-300 text-emerald-700"}`}
              >
                {usageSummary}
              </Badge>
              <p className="ml-auto text-[11px] text-muted-foreground">
                Guardrails: reroute {usageSnapshot.disableReroute ? "limited" : "normal"} | layers {usageSnapshot.freezeSecondaryLayers ? "reduced" : "normal"}
              </p>
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-md border bg-background/70 p-2">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span>Tiles</span>
                  <span>{usageSnapshot.tileLoads}/{TRACKING_BUDGETS.tileLoads}</span>
                </div>
                <Progress value={Math.min(100, usageSnapshot.tileUsagePct)} className="h-1.5" />
              </div>
              <div className="rounded-md border bg-background/70 p-2">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span>Routes</span>
                  <span>{usageSnapshot.routeCalls}/{TRACKING_BUDGETS.routeCalls}</span>
                </div>
                <Progress value={Math.min(100, usageSnapshot.routeUsagePct)} className="h-1.5" />
              </div>
              <div className="rounded-md border bg-background/70 p-2">
                <div className="mb-1 flex items-center justify-between text-[11px]">
                  <span>Maps</span>
                  <span>{usageSnapshot.mapInstantiations}/{TRACKING_BUDGETS.mapInstantiations}</span>
                </div>
                <Progress value={Math.min(100, usageSnapshot.mapUsagePct)} className="h-1.5" />
              </div>
            </div>
            {usageFactors.length > 0 && (
              <p className="mt-1 text-[11px] text-amber-700">
                Minimal overrun factors: {usageFactors[0]} {usageFactors.length > 1 ? `(+${usageFactors.length - 1} more)` : ""}
              </p>
            )}
          </div>
          <div className={`flex ${isFullscreen ? "flex-1 min-h-0" : ""}`}>
            {/* Map Container */}
            <div 
              className={`relative transition-all duration-300 ${selectedRider ? "flex-1" : "w-full"} ${isFullscreen ? "h-full min-h-0" : "h-[380px] lg:h-[420px]"}`}
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
                      key={`fleet-mapbox-${mapboxRetryNonce}-${mapboxStyleUrl}`}
                      center={[center.lat, center.lng]}
                      mapStyleUrl={mapboxStyleUrl}
                      cameraFocus={focusPoint}
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
                      ref={leafletMapRef}
                      center={center}
                      zoom={17}
                      zoomControl={false}
                      style={{ height: "100%", width: "100%" }}
                    >
                      <MapTileLayer presetId={selectedOpenSourcePreset.id} />
                      <MapUsageTracker />
                      
                      <MapInvalidator />
                      
                      {/* Route polyline */}
                      {!usageSnapshot.freezeSecondaryLayers && selectedRouteGeometry.length > 1 && (
                        <Polyline 
                          positions={selectedRouteGeometry} 
                          color="#3b82f6" 
                          weight={4}
                          opacity={0.8}
                        />
                      )}

                      {viewerLocationPoint && (
                        <>
                          <Circle
                            center={viewerLocationPoint}
                            radius={Math.min(Math.max(Number(viewerLocation?.accuracyM || 30), 12), 140)}
                            pathOptions={{ color: "#60a5fa", weight: 1, fillColor: "#60a5fa", fillOpacity: 0.16 }}
                          />
                          <CircleMarker
                            center={viewerLocationPoint}
                            radius={7}
                            pathOptions={{ color: "#1d4ed8", weight: 2, fillColor: "#3b82f6", fillOpacity: 0.95 }}
                          >
                            <Popup>
                              <div className="p-1">
                                <p className="text-xs font-semibold">Your Location</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {viewerLocation?.accuracyM ? `Accuracy ~${Math.round(viewerLocation.accuracyM)}m` : "Live position"}
                                </p>
                              </div>
                            </Popup>
                          </CircleMarker>
                        </>
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

                  {!shouldUseMapboxGl && (
                    <div className="pointer-events-none absolute right-3 top-3 z-[1300]">
                      <div className="pointer-events-auto rounded-2xl border border-slate-300/40 bg-white/75 p-2 shadow-2xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/70">
                        <div className="grid grid-cols-2 gap-1.5">
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={zoomLeafletIn} title="Zoom In"><Plus className="h-3.5 w-3.5" /><span>In</span></button>
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={zoomLeafletOut} title="Zoom Out"><Minus className="h-3.5 w-3.5" /><span>Out</span></button>
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={streetLeaflet} title="Street Level"><Route className="h-3.5 w-3.5" /><span>Street</span></button>
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={fitLeaflet} title="Recenter / Fit"><Crosshair className="h-3.5 w-3.5" /><span>Fit</span></button>
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={focusLeaflet} title="Focus Rider"><LocateFixed className="h-3.5 w-3.5" /><span>Focus</span></button>
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={locateLeaflet} disabled={!viewerLocationPoint} title="Go To My Location"><MapPin className="h-3.5 w-3.5" /><span>Me</span></button>
                          <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={northLeaflet} title="Reset Bearing"><Compass className="h-3.5 w-3.5" /><span>North</span></button>
                        </div>
                      </div>
                    </div>
                  )}

                  {forceMapboxGl && mapboxInitFailed && !preferOpenSourceMap && (
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
                className={`${isFullscreen ? "w-[330px] xl:w-[390px] h-full min-h-0 flex-shrink-0" : "w-1/3 h-[380px] lg:h-[420px]"} border-l bg-background overflow-hidden`}
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

