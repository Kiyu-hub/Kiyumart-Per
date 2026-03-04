import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MapContainer, Marker, Popup, Polyline, useMap, Circle, CircleMarker } from "react-leaflet";
import { Icon, DivIcon, LatLng, Map as LeafletMap } from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
  Route,
  MessageSquare
} from "lucide-react";
import { io, Socket } from "socket.io-client";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
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
  riderPhone?: string | null;
  vehicleType?: string | null;
  vehicleColor?: string | null;
  isOnline?: boolean;
  onlineStatus?: "online" | "away" | "offline" | string;
  lastSeenAt?: string | null;
  activeOrderCount?: number;
  hasActiveOrder?: boolean;
  orderId?: string | null;
  orderNumber?: string | null;
  orderStatus?: string | null;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  timestamp: string | null;
  hasLocation?: boolean;
  deliveryAddress?: string | null;
  deliveryPhone?: string | null;
  buyerName?: string | null;
  deliveryLatitude?: number | null;
  deliveryLongitude?: number | null;
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

interface RoleFeatureEntry {
  id: string;
  role: string;
  features: Record<string, boolean>;
}

interface RiderDeliveryHistory {
  id: string;
  orderNumber?: string | null;
  status?: string | null;
  deliveryAddress?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  total?: string | null;
}

function normalizeVehicleType(vehicleType: string | null | undefined): string {
  const value = String(vehicleType || "").toLowerCase().trim();
  if (!value) return "motorcycle";
  if (value.includes("motor")) return "motorcycle";
  if (value.includes("bike")) return "bicycle";
  if (value.includes("car") || value.includes("sedan")) return "car";
  if (value.includes("van")) return "van";
  if (value.includes("truck")) return "truck";
  return value;
}

function getVehicleGlyph(vehicleType: string | null | undefined): string {
  const normalized = normalizeVehicleType(vehicleType);
  if (normalized === "car") return "🚗";
  if (normalized === "van") return "🚐";
  if (normalized === "truck") return "🚚";
  if (normalized === "bicycle") return "🚲";
  return "🏍️";
}

function getVehicleMarkerIcon(vehicleType: string | null | undefined, isOnline: boolean, activeOrderCount: number): DivIcon {
  const glyph = getVehicleGlyph(vehicleType);
  const tone = isOnline ? "#0f766e" : "#475569";
  const indicator = isOnline ? "#10b981" : "#ef4444";
  const badge = activeOrderCount > 0
    ? `<span style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:9999px;background:#f59e0b;color:white;font-size:10px;line-height:16px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.92);">${activeOrderCount}</span>`
    : "";
  return new DivIcon({
    className: "rider-vehicle-marker",
    html: `<div style="position:relative;width:34px;height:34px;border-radius:50%;background:linear-gradient(145deg, ${tone}, #0f172a);display:flex;align-items:center;justify-content:center;box-shadow:0 8px 18px rgba(15,23,42,0.28);border:2px solid rgba(255,255,255,0.92);font-size:16px;transform:translateZ(0);">
      <span>${glyph}</span>
      <span style="position:absolute;bottom:-4px;left:-4px;width:10px;height:10px;border-radius:9999px;background:${indicator};border:2px solid white;"></span>
      ${badge}
    </div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

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
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  const [riders, setRiders] = useState<RiderLocation[]>([]);
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [center] = useState<LatLng>(new LatLng(5.6037, -0.1870)); // Accra, Ghana
  const [mapboxStyleUrl, setMapboxStyleUrl] = useState<string>(() => {
    const resolved = String(resolveMapboxStyleUrl() || "").trim();
    if (!resolved || resolved === "mapbox://styles/mapbox/dark-v11") {
      return "mapbox://styles/mapbox/navigation-night-v1";
    }
    return resolved;
  });
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
  const [trackSelectedOnly, setTrackSelectedOnly] = useState(false);
  const [riderSearchTerm, setRiderSearchTerm] = useState("");
  const [vehicleFilter, setVehicleFilter] = useState<string>("all");
  const [showDetailPanels, setShowDetailPanels] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<PendingOrder | null>(null);
  const [showDispatchPanel, setShowDispatchPanel] = useState(false);
  const [availableRiders, setAvailableRiders] = useState<AvailableRider[]>([]);
  const [viewerLocation, setViewerLocation] = useState<{ lat: number; lng: number; accuracyM: number | null } | null>(null);
  const [isUpdatingMapAccess, setIsUpdatingMapAccess] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const leafletMapRef = useRef<LeafletMap | null>(null);
  const leafletAutoLockUntilRef = useRef(0);
  const leafletLastAutoCameraAtRef = useRef(0);
  const { toast } = useToast();
  const usageSnapshot = useUsageMonitorSnapshot();
  const shouldUseMapboxGl = (forceMapboxGl || isMapboxGlPreferred()) && !mapboxInitFailed && !preferOpenSourceMap;
  const mapAccessEnabled = user?.role === "rider" ? true : user?.roleFeatures?.["maps.view"] !== false;

  const { data: roleFeatureRows = [] } = useQuery<RoleFeatureEntry[]>({
    queryKey: ["/api/role-features", "map-access-inline"],
    queryFn: async () => {
      const res = await fetch("/api/role-features", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load role map access");
      return res.json();
    },
    enabled: isSuperAdmin,
    staleTime: 30_000,
  });

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

  const { data: selectedRiderDeliveries = [] } = useQuery<RiderDeliveryHistory[]>({
    queryKey: ["/api/riders", selectedRider?.riderId, "deliveries"],
    queryFn: async () => {
      if (!selectedRider?.riderId) return [];
      const res = await fetch(`/api/riders/${selectedRider.riderId}/deliveries`, { credentials: "include" });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: Boolean(selectedRider?.riderId),
    staleTime: 30_000,
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
    if (!selectedRider) return;
    const latest = riders.find((entry) => entry.riderId === selectedRider.riderId);
    if (latest && latest !== selectedRider) {
      setSelectedRider(latest);
    }
  }, [riders, selectedRider]);

  useEffect(() => {
    setPendingOrders(pendingOrdersData);
  }, [pendingOrdersData]);

  useEffect(() => {
    setAvailableRiders(availableRidersData);
  }, [availableRidersData]);

  useEffect(() => {
    if (!isFullscreen) return;
    setSelectedRider(null);
    setShowDispatchPanel(false);
  }, [isFullscreen]);

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
    const persistedStyle = String(resolveMapboxStyleUrl() || "").trim();
    const normalizedStyle =
      !persistedStyle || persistedStyle === "mapbox://styles/mapbox/dark-v11"
        ? "mapbox://styles/mapbox/navigation-night-v1"
        : persistedStyle;
    if (normalizedStyle && normalizedStyle !== mapboxStyleUrl) {
      setMapboxStyleUrl(normalizedStyle);
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
      orderId: rider.orderId || undefined,
      latitude: rider.latitude,
      longitude: rider.longitude,
      speed: rider.speed,
      heading: rider.heading,
      timestamp: rider.timestamp,
    })),
    [riders],
  );
  const animatedFleetPositions = useAnimatedFleetPositions(fleetAnimationInput);

  const selectedRiderOrder =
    selectedRider && selectedRider.deliveryLatitude != null && selectedRider.deliveryLongitude != null
      ? {
          deliveryLatitude: Number(selectedRider.deliveryLatitude),
          deliveryLongitude: Number(selectedRider.deliveryLongitude),
          deliveryAddress: selectedRider.deliveryAddress || "",
        }
      : null;
  const selectedTripPhase =
    selectedRider?.orderStatus === "assigned" ? "assigned" :
    selectedRider?.orderStatus === "rider_arrived" || selectedRider?.orderStatus === "picked_up" ? "pickup" :
    selectedRider?.orderStatus === "arrived" ? "arrived" :
    selectedRider?.orderStatus === "delivered" ? "delivered" :
    "en_route";

  const trackedSelectedRider = useVehicleTracking({
    vehicleId: selectedRider?.riderId || "admin-selected-rider",
    orderId: selectedRider?.orderId || undefined,
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
      const normalizedUpdate: RiderLocation = {
        ...locationUpdate,
        latitude: locationUpdate.latitude != null ? Number(locationUpdate.latitude) : null,
        longitude: locationUpdate.longitude != null ? Number(locationUpdate.longitude) : null,
        speed: locationUpdate.speed != null ? Number(locationUpdate.speed) : null,
        heading: locationUpdate.heading != null ? Number(locationUpdate.heading) : null,
      };
      setRiders((prevRiders) => {
        const existingIndex = prevRiders.findIndex(r => r.riderId === normalizedUpdate.riderId);
        
        if (existingIndex >= 0) {
          const updated = [...prevRiders];
          updated[existingIndex] = { ...updated[existingIndex], ...normalizedUpdate };
          return updated;
        } else {
          return [...prevRiders, normalizedUpdate];
        }
      });
      
      // Update route if this is the selected rider
      if (selectedRider?.riderId === normalizedUpdate.riderId) {
        setSelectedRider(prev => prev ? { ...prev, ...normalizedUpdate } : null);
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
    if (isFullscreen) return;
    setSelectedOrder(order);
    setShowDispatchPanel(true);
  };

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const normalizedRiderSearch = riderSearchTerm.trim().toLowerCase();
  const filteredRiders = useMemo(
    () =>
      riders.filter((rider) => {
        const vehicleType = normalizeVehicleType(rider.vehicleType);
        const matchesVehicle = vehicleFilter === "all" || vehicleType === vehicleFilter;
        const matchesSearch =
          !normalizedRiderSearch ||
          String(rider.riderName || "").toLowerCase().includes(normalizedRiderSearch) ||
          String(rider.orderNumber || "").toLowerCase().includes(normalizedRiderSearch);
        return matchesVehicle && matchesSearch;
      }),
    [riders, vehicleFilter, normalizedRiderSearch],
  );
  const visibleRiders = useMemo(() => {
    if (!trackSelectedOnly || !selectedRider) return filteredRiders;
    return filteredRiders.filter((rider) => rider.riderId === selectedRider.riderId);
  }, [filteredRiders, selectedRider, trackSelectedOnly]);

  // Global and visible rider counters
  const ridersWithLocation = riders.filter((r) => r.latitude !== null && r.longitude !== null);
  const ridersWithoutLocation = riders.filter((r) => r.latitude === null || r.longitude === null);
  const visibleRidersWithLocation = visibleRiders.filter((r) => r.latitude !== null && r.longitude !== null);
  const visibleRidersWithoutLocation = visibleRiders.filter((r) => r.latitude === null || r.longitude === null);
  const onlineRiderCount = riders.filter((r) => r.isOnline).length;
  const offlineRiderCount = Math.max(0, riders.length - onlineRiderCount);
  const assignedRiderCount = riders.filter((r) => Boolean(r.orderId)).length;
  const unassignedRiderCount = Math.max(0, riders.length - assignedRiderCount);
  const vehicleCounts = useMemo(() => {
    const counts = {
      motorcycle: 0,
      car: 0,
      van: 0,
      truck: 0,
      bicycle: 0,
      other: 0,
    };
    riders.forEach((r) => {
      const normalized = normalizeVehicleType(r.vehicleType);
      if (normalized === "motorcycle") counts.motorcycle += 1;
      else if (normalized === "car") counts.car += 1;
      else if (normalized === "van") counts.van += 1;
      else if (normalized === "truck") counts.truck += 1;
      else if (normalized === "bicycle") counts.bicycle += 1;
      else counts.other += 1;
    });
    return counts;
  }, [riders]);

  const focusPoint = useMemo<[number, number] | null>(() => {
    const selectedAnimated = selectedRider ? animatedFleetPositions[selectedRider.riderId] : null;
    if (selectedAnimated) return [selectedAnimated.lat, selectedAnimated.lng];
    if (selectedRider?.latitude != null && selectedRider?.longitude != null) return [selectedRider.latitude, selectedRider.longitude];
    const firstRider = visibleRiders.find((r) => r.latitude != null && r.longitude != null);
    if (firstRider) return [firstRider.latitude as number, firstRider.longitude as number];
    const firstOrder = pendingOrders.find((o) => o.deliveryLatitude != null && o.deliveryLongitude != null);
    if (firstOrder) return [Number(firstOrder.deliveryLatitude), Number(firstOrder.deliveryLongitude)];
    return null;
  }, [animatedFleetPositions, pendingOrders, selectedRider, visibleRiders]);
  const mapPointsForFit = useMemo<Array<[number, number]>>(() => {
    const points: Array<[number, number]> = [];
    visibleRiders.forEach((r) => {
      if (r.latitude != null && r.longitude != null) points.push([r.latitude, r.longitude]);
    });
    if (trackSelectedOnly) {
      if (selectedRiderOrder?.deliveryLatitude != null && selectedRiderOrder?.deliveryLongitude != null) {
        points.push([Number(selectedRiderOrder.deliveryLatitude), Number(selectedRiderOrder.deliveryLongitude)]);
      }
    } else {
      pendingOrders.forEach((o) => {
        if (o.deliveryLatitude != null && o.deliveryLongitude != null) {
          points.push([Number(o.deliveryLatitude), Number(o.deliveryLongitude)]);
        }
      });
    }
    return points;
  }, [pendingOrders, selectedRiderOrder, trackSelectedOnly, visibleRiders]);
  const selectedOpenSourcePreset = useMemo(
    () => OPEN_SOURCE_MAP_PRESETS.find((entry) => entry.id === openSourceStyleId) || OPEN_SOURCE_MAP_PRESETS[0],
    [openSourceStyleId],
  );
  const roleMapAccess = useMemo(() => {
    const defaults: Record<string, boolean> = {
      admin: true,
      seller: true,
      buyer: true,
      agent: true,
      rider: true,
    };
    roleFeatureRows.forEach((row) => {
      const key = String(row.role || "").toLowerCase().trim();
      if (key in defaults) {
        defaults[key] = key === "rider" ? true : row.features?.["maps.view"] !== false;
      }
    });
    defaults.rider = true;
    return defaults;
  }, [roleFeatureRows]);
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

  const updateRoleMapAccess = useCallback(
    async (role: "admin" | "seller" | "buyer" | "agent" | "rider", enabled: boolean) => {
      if (!isSuperAdmin) return;
      if (role === "rider") return;
      const row = roleFeatureRows.find((entry) => String(entry.role || "").toLowerCase().trim() === role);
      const currentFeatures = row?.features || {};
      const nextFeatures = { ...currentFeatures, "maps.view": enabled === true };
      setIsUpdatingMapAccess(role);
      try {
        await apiRequest("PUT", `/api/role-features/${role}`, { features: nextFeatures });
        toast({
          title: "Map access updated",
          description: `${role.charAt(0).toUpperCase()}${role.slice(1)} map access is now ${enabled ? "enabled" : "disabled"}.`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/role-features"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      } catch (error: any) {
        toast({
          title: "Failed to update map access",
          description: error?.message || "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsUpdatingMapAccess(null);
      }
    },
    [isSuperAdmin, roleFeatureRows, toast],
  );

  const zoomLeafletIn = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const maxZoom = Number(selectedOpenSourcePreset.maxZoom ?? 19);
    const nextZoom = Math.min(Number(map.getZoom?.() || 12) + 1, maxZoom);
    if (focusPoint) map.setView(focusPoint, nextZoom, { animate: true });
    else map.zoomIn(1, { animate: true });
  }, [focusPoint, selectedOpenSourcePreset.maxZoom]);
  const zoomLeafletOut = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const minZoom = Number(selectedOpenSourcePreset.minZoom ?? 2);
    const nextZoom = Math.max(Number(map.getZoom?.() || 12) - 1, minZoom);
    if (focusPoint) map.setView(focusPoint, nextZoom, { animate: true });
    else map.zoomOut(1, { animate: true });
  }, [focusPoint, selectedOpenSourcePreset.minZoom]);
  const streetLeaflet = useCallback(() => {
    const map = leafletMapRef.current;
    if (!map || !focusPoint) return;
    leafletAutoLockUntilRef.current = Date.now() + 8_000;
    const streetZoom = Math.min(18, Number(selectedOpenSourcePreset.maxZoom ?? 19));
    map.setView(focusPoint, streetZoom, { animate: true });
  }, [focusPoint, selectedOpenSourcePreset.maxZoom]);
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
    map.fitBounds(mapPointsForFit, { padding: [40, 40], maxZoom: Math.min(18, Number(selectedOpenSourcePreset.maxZoom ?? 19)), animate: true });
    leafletLastAutoCameraAtRef.current = Date.now();
  }, [focusPoint, mapPointsForFit, selectedOpenSourcePreset.maxZoom]);
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
      map.fitBounds(mapPointsForFit, { padding: [40, 40], maxZoom: Math.min(18, Number(selectedOpenSourcePreset.maxZoom ?? 19)), animate: true });
      return;
    }
    if (mapPointsForFit.length === 1) {
      map.setView(mapPointsForFit[0], 17, { animate: true });
    }
  }, [focusPoint, mapPointsForFit, selectedOpenSourcePreset.maxZoom]);

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
      map.fitBounds(mapPointsForFit, {
        padding: [40, 40],
        maxZoom: Math.min(18, Number(selectedOpenSourcePreset.maxZoom ?? 19)),
        animate: true,
      });
      leafletLastAutoCameraAtRef.current = now;
    }
  }, [focusPoint, mapPointsForFit, selectedOpenSourcePreset.maxZoom, shouldUseMapboxGl]);

  useEffect(() => {
    if (shouldUseMapboxGl) return;
    const map = leafletMapRef.current;
    if (!map) return;
    const maxZoom = Number(selectedOpenSourcePreset.maxZoom ?? 19);
    const minZoom = Number(selectedOpenSourcePreset.minZoom ?? 2);
    const currentZoom = Number(map.getZoom?.() || 12);
    if (currentZoom > maxZoom) {
      map.setZoom(maxZoom, { animate: false });
    } else if (currentZoom < minZoom) {
      map.setZoom(minZoom, { animate: false });
    }
    map.invalidateSize();
  }, [openSourceStyleId, selectedOpenSourcePreset, shouldUseMapboxGl]);

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

  if (!mapAccessEnabled) {
    return (
      <Card data-testid="card-rider-map-access-disabled">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinOff className="h-5 w-5 text-amber-600" />
            Map Access Disabled
          </CardTitle>
          <CardDescription>
            Live map access for your role is currently disabled by Super Admin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            If you need map visibility, request Super Admin to enable <span className="font-mono">maps.view</span> for your role.
          </p>
        </CardContent>
      </Card>
    );
  }

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
                Real-time monitoring of riders, active deliveries, and dispatch readiness
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
                {visibleRidersWithLocation.length}/{visibleRiders.length} On Map
              </Badge>
              {visibleRidersWithoutLocation.length > 0 && (
                <Badge variant="outline" className="text-amber-600 border-amber-300" data-testid="badge-no-gps">
                  {visibleRidersWithoutLocation.length} No GPS
                </Badge>
              )}
              {!isFullscreen && pendingOrders.length > 0 && (
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
          {!isFullscreen && (
            <div className="mt-3 flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">Command Center Panels</div>
              <Select
                value={showDetailPanels ? "show" : "hide"}
                onValueChange={(value) => setShowDetailPanels(value !== "hide")}
              >
                <SelectTrigger className="h-8 w-[180px]" data-testid="select-command-center-panels">
                  <SelectValue placeholder="Panel visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="show">Show Details</SelectItem>
                  <SelectItem value="hide">Hide Details</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {!isFullscreen && showDetailPanels && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-[1.2fr_0.8fr_0.8fr_auto]">
                <Input
                  value={riderSearchTerm}
                  onChange={(event) => setRiderSearchTerm(event.target.value)}
                  placeholder="Filter riders by name or order number..."
                  data-testid="input-rider-search"
                />
                <Select value={vehicleFilter} onValueChange={setVehicleFilter}>
                  <SelectTrigger data-testid="select-vehicle-filter">
                    <SelectValue placeholder="Vehicle Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vehicles</SelectItem>
                    <SelectItem value="motorcycle">Motorcycles</SelectItem>
                    <SelectItem value="car">Cars</SelectItem>
                    <SelectItem value="van">Vans</SelectItem>
                    <SelectItem value="truck">Trucks</SelectItem>
                    <SelectItem value="bicycle">Bicycles</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={selectedRider?.riderId || "__none__"}
                  onValueChange={(value) => {
                    if (value === "__none__") {
                      setSelectedRider(null);
                      setTrackSelectedOnly(false);
                      return;
                    }
                    const rider = riders.find((entry) => entry.riderId === value);
                    if (rider) setSelectedRider(rider);
                  }}
                >
                  <SelectTrigger data-testid="select-rider-focus">
                    <SelectValue placeholder="Select Rider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">All Riders</SelectItem>
                    {filteredRiders.map((rider) => (
                      <SelectItem key={rider.riderId} value={rider.riderId}>
                        {rider.riderName} • {normalizeVehicleType(rider.vehicleType)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 rounded-md border bg-background px-3">
                  <span className="text-xs text-muted-foreground">Track Selected Only</span>
                  <Switch checked={trackSelectedOnly} onCheckedChange={setTrackSelectedOnly} data-testid="switch-track-selected-only" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <Badge variant="outline">Riders: {riders.length}</Badge>
                <Badge variant="outline" className="border-emerald-300 text-emerald-700">Online: {onlineRiderCount}</Badge>
                <Badge variant="outline" className="border-slate-300 text-slate-700">Offline: {offlineRiderCount}</Badge>
                <Badge variant="outline">Assigned: {assignedRiderCount}</Badge>
                <Badge variant="outline">Unassigned: {unassignedRiderCount}</Badge>
                <Badge variant="outline">Moto: {vehicleCounts.motorcycle}</Badge>
                <Badge variant="outline">Car: {vehicleCounts.car}</Badge>
                <Badge variant="outline">Van: {vehicleCounts.van}</Badge>
                <Badge variant="outline">Truck: {vehicleCounts.truck}</Badge>
                {vehicleCounts.bicycle > 0 && <Badge variant="outline">Bike: {vehicleCounts.bicycle}</Badge>}
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className={`p-0 ${isFullscreen ? "flex-1 min-h-0 overflow-hidden flex flex-col" : ""}`}>
          {!isFullscreen && showDetailPanels && (
            <div className="border-b bg-blue-50/70 px-3 py-2 text-[11px] text-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
              Tracking meter guide: `Tiles`, `Routes`, and `Maps` estimate provider usage. Above 80% may trigger overage billing.
              Prevention: reduce rapid zoom/style switching, keep unnecessary layers off, and use recenter/focus instead of constant manual panning.
            </div>
          )}
          {!isFullscreen && showDetailPanels && isSuperAdmin && (
            <div className="border-b bg-muted/30 px-3 py-2">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Role Map Access (Super Admin Control)</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                {(["admin", "seller", "buyer", "agent", "rider"] as const).map((role) => (
                  <div key={role} className="flex items-center justify-between rounded-md border bg-background px-2 py-1.5">
                    <span className="text-xs capitalize">{role}</span>
                    <Switch
                      checked={roleMapAccess[role]}
                      disabled={role === "rider" || isUpdatingMapAccess === role}
                      onCheckedChange={(checked) => {
                        void updateRoleMapAccess(role, checked);
                      }}
                      data-testid={`switch-map-access-${role}`}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">Rider map access is always enabled by default.</p>
            </div>
          )}
          {!isFullscreen && showDetailPanels && (
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
          )}
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
                      viewerLocation={viewerLocationPoint}
                      riders={visibleRiders
                        .filter((rider): rider is RiderLocation & { latitude: number; longitude: number } => rider.latitude !== null && rider.longitude !== null)
                        .map((rider) => ({
                          riderId: rider.riderId,
                          latitude: animatedFleetPositions[rider.riderId]?.lat ?? rider.latitude,
                          longitude: animatedFleetPositions[rider.riderId]?.lng ?? rider.longitude,
                          vehicleType: rider.vehicleType || "motorcycle",
                          isOnline: rider.isOnline !== false,
                          activeOrderCount: Number(rider.activeOrderCount || 0),
                        }))}
                      pendingOrders={
                        usageSnapshot.freezeSecondaryLayers || trackSelectedOnly
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
                      presentationMode={isFullscreen}
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
                      zoomControl={isFullscreen}
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
                        {visibleRiders.filter((rider): rider is RiderLocation & { latitude: number; longitude: number } => 
                          rider.latitude !== null && rider.longitude !== null
                        ).map((rider) => (
                          <Marker
                            key={rider.riderId}
                            position={
                                animatedFleetPositions[rider.riderId]
                                ? [animatedFleetPositions[rider.riderId].lat, animatedFleetPositions[rider.riderId].lng]
                                : [rider.latitude, rider.longitude]
                            }
                            icon={getVehicleMarkerIcon(
                              rider.vehicleType || "motorcycle",
                              rider.isOnline !== false,
                              Number(rider.activeOrderCount || 0),
                            )}
                            eventHandlers={{
                              click: () => setSelectedRider(rider),
                            }}
                          >
                            <Popup>
                              <div className="p-2 min-w-[200px]">
                                <h3 className="font-bold text-sm mb-1">{rider.riderName}</h3>
                                <p className="text-xs text-muted-foreground">
                                  {normalizeVehicleType(rider.vehicleType)} • {rider.isOnline ? "Online" : "Offline"}
                                </p>
                                {rider.orderNumber ? (
                                  <p className="text-xs text-muted-foreground mb-2">Order #{rider.orderNumber}</p>
                                ) : (
                                  <p className="text-xs text-muted-foreground mb-2">No active order</p>
                                )}
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
                        !trackSelectedOnly &&
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

                  {!shouldUseMapboxGl && !isFullscreen && (
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
                  {visibleRidersWithLocation.length === 0 && pendingOrders.length === 0 && (
                    <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
                      <div className="bg-background/80 backdrop-blur-sm rounded-lg p-6 text-center max-w-sm">
                        <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        {visibleRiders.length > 0 ? (
                          <>
                            <p className="text-muted-foreground font-medium mb-2">
                              {visibleRiders.length} filtered {visibleRiders.length === 1 ? 'rider' : 'riders'} but no GPS data
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
            {!isFullscreen && selectedRider && (
              <div 
                className="w-1/3 h-[380px] lg:h-[420px] border-l bg-background overflow-hidden"
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
                          <p className="text-sm text-muted-foreground">
                            {normalizeVehicleType(selectedRider.vehicleType)} • {selectedRider.isOnline ? "Online" : "Offline"}
                          </p>
                        </div>
                        <Badge variant={selectedRider.isOnline ? "secondary" : "outline"} className={selectedRider.isOnline ? "text-emerald-700" : "text-slate-600"}>
                          {selectedRider.isOnline ? "Online" : "Offline"}
                        </Badge>
                      </div>

                      <Separator />

                      {/* Order Info */}
                      <div>
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          {selectedRider.orderNumber ? `Order #${selectedRider.orderNumber}` : "No Active Delivery"}
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Active Orders</span>
                            <span className="font-medium">{selectedRider.activeOrderCount ?? 0}</span>
                          </div>
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
                            <span className="font-medium">
                              {selectedRider.timestamp
                                ? formatTimestamp(selectedRider.timestamp)
                                : selectedRider.lastSeenAt
                                  ? formatTimestamp(selectedRider.lastSeenAt)
                                  : "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Location</span>
                            <span className="font-mono text-xs">
                              {selectedRider.latitude != null && selectedRider.longitude != null
                                ? `${selectedRider.latitude.toFixed(5)}, ${selectedRider.longitude.toFixed(5)}`
                                : 'No location data'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="pt-2 space-y-2">
                        <Button
                          className="w-full"
                          variant="outline"
                          disabled={!selectedRider.riderPhone}
                          onClick={() => {
                            if (!selectedRider.riderPhone) return;
                            window.open(`tel:${selectedRider.riderPhone}`, "_self");
                          }}
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          Call Rider
                        </Button>
                        <Button
                          className="w-full"
                          variant="outline"
                          onClick={() => {
                            window.open(`/admin/messages?userId=${selectedRider.riderId}`, "_blank");
                          }}
                        >
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Message Rider
                        </Button>
                        <Button 
                          className="w-full"
                          variant="outline"
                          disabled={selectedRider.latitude == null || selectedRider.longitude == null}
                          onClick={() => {
                            if (selectedRider.latitude != null && selectedRider.longitude != null) {
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

                      <Separator />

                      <div>
                        <h4 className="font-medium mb-2">Recent Journeys</h4>
                        {selectedRiderDeliveries.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No delivery history found for this rider.</p>
                        ) : (
                          <div className="space-y-2">
                            {selectedRiderDeliveries.slice(0, 6).map((delivery) => (
                              <div key={delivery.id} className="rounded-md border bg-muted/40 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold">#{delivery.orderNumber || "N/A"}</p>
                                  <Badge variant="outline" className="text-[10px]">{String(delivery.status || "unknown").replace(/_/g, " ")}</Badge>
                                </div>
                                <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1">
                                  {delivery.deliveryAddress || "No address"}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
          
          {/* Riders without GPS section */}
          {!isFullscreen && showDetailPanels && visibleRidersWithoutLocation.length > 0 && (
            <div className="border-t p-4">
              <Collapsible>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left">
                  <div className="flex items-center gap-2">
                    <MapPinOff className="h-4 w-4 text-amber-500" />
                    <span className="font-medium text-sm">
                      {visibleRidersWithoutLocation.length} Rider{visibleRidersWithoutLocation.length !== 1 ? 's' : ''} Without GPS Data
                    </span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {visibleRidersWithoutLocation.map((rider) => (
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
                          <p className="text-xs text-muted-foreground truncate">
                            {rider.orderNumber ? `Order #${rider.orderNumber}` : "No active order"}
                          </p>
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

