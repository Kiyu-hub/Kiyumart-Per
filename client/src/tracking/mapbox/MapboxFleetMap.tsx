import { useCallback, useEffect, useMemo, useRef } from "react";
import { Compass, Crosshair, Layers3, LocateFixed, Minus, Plus, Route } from "lucide-react";
import { usageMonitor } from "@/tracking/usage/usageMonitor";
import { getMapRenderer } from "@/tracking/providers/factory";
import {
  loadMapboxGl,
  resolveMapboxAccessToken,
  resolveMapboxStyleUrl,
  toMapboxRasterStyle,
} from "@/tracking/mapbox/mapboxLoader";

interface FleetRiderMarker {
  riderId: string;
  latitude: number;
  longitude: number;
  vehicleType?: string | null;
  isOnline?: boolean;
  heading?: number | null;
  activeOrderCount?: number;
}

interface FleetOrderMarker {
  id: string;
  latitude: number;
  longitude: number;
}

interface MapboxFleetMapProps {
  initialCenter?: [number, number] | null;
  initialZoom?: number;
  mapStyleUrl?: string;
  cameraFocus?: [number, number] | null;
  viewerLocation?: [number, number] | null;
  riders: FleetRiderMarker[];
  pendingOrders: FleetOrderMarker[];
  routeGeometry?: [number, number][];
  selectedDestination?: [number, number] | null;
  className?: string;
  style?: React.CSSProperties;
  presentationMode?: boolean;
  onRiderClick?: (riderId: string) => void;
  onOrderClick?: (orderId: string) => void;
  requireMapboxToken?: boolean;
  onLoad?: () => void;
  onError?: (error: unknown) => void;
  onRenderModeChange?: (mode: "3d" | "hybrid" | "fallback") => void;
}

const ROUTE_SOURCE_ID = "fleet-route-source";
const ROUTE_LAYER_ID = "fleet-route-layer";
const ROUTE_OUTLINE_LAYER_ID = "fleet-route-outline-layer";
const RIDERS_SOURCE_ID = "fleet-riders-source";
const RIDERS_LAYER_ID = "fleet-riders-3d-layer";
const RIDERS_HIT_LAYER_ID = "fleet-riders-hit-layer";
const RIDER_SOURCE_UPDATE_MIN_INTERVAL_MS = 80;
type SupportedVehicleType = "car" | "motorcycle" | "bicycle";
type ModelLoadState = "idle" | "loading" | "ready" | "failed";
const DEFAULT_3D_PITCH = 60;
const DEFAULT_3D_BEARING = -12;

const VEHICLE_MODEL_URL_CANDIDATES: Record<SupportedVehicleType, string[]> = {
  car: ["/assets/vehicles/car.glb"],
  motorcycle: ["/assets/vehicles/motorcycle.glb"],
  bicycle: ["/assets/vehicles/bicycle.glb"],
};

function fitMapToPoints(
  map: any,
  points: Array<[number, number]>,
  options?: {
    padding?: number;
    maxZoom?: number;
    duration?: number;
  },
) {
  if (!points.length) return;
  const padding = options?.padding ?? 50;
  const maxZoom = options?.maxZoom ?? 18;
  const duration = options?.duration ?? 800;
  if (points.length === 1) {
    const currentZoom = Number(map.getZoom?.() || 12);
    const nextZoom = Math.min(maxZoom, Math.max(2, currentZoom + 0.85));
    map.easeTo({ center: points[0], zoom: nextZoom, duration });
    return;
  }
  const mapboxgl = (window as any).mapboxgl;
  const bounds = new mapboxgl.LngLatBounds(points[0], points[0]);
  points.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, { padding, maxZoom, duration });
}

function isPointVisibleWithMargin(map: any, point: [number, number], marginRatio = 0.12): boolean {
  const bounds = map.getBounds?.();
  if (!bounds) return false;
  const sw = bounds.getSouthWest();
  const ne = bounds.getNorthEast();
  const latPad = (ne.lat - sw.lat) * marginRatio;
  const lngPad = (ne.lng - sw.lng) * marginRatio;
  const [lng, lat] = point;
  return (
    lat >= sw.lat + latPad &&
    lat <= ne.lat - latPad &&
    lng >= sw.lng + lngPad &&
    lng <= ne.lng - lngPad
  );
}

function makeMarkerElement(color: string, size = 12): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "9999px";
  el.style.background = color;
  el.style.border = "2px solid rgba(255,255,255,0.92)";
  el.style.boxShadow = "0 1px 8px rgba(0,0,0,0.35)";
  return el;
}

function makeRiderMarkerElement(
  color: string,
  heading = 0,
  activeOrderCount = 0,
): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.style.position = "relative";
  wrapper.style.width = "28px";
  wrapper.style.height = "28px";

  const marker = document.createElement("div");
  marker.style.width = "28px";
  marker.style.height = "28px";
  marker.style.borderRadius = "9999px";
  marker.style.background = color;
  marker.style.border = "2px solid rgba(255,255,255,0.92)";
  marker.style.boxShadow = "0 4px 12px rgba(0,0,0,0.35)";
  marker.style.display = "flex";
  marker.style.alignItems = "center";
  marker.style.justifyContent = "center";
  marker.style.cursor = "pointer";

  const arrow = document.createElement("div");
  arrow.style.width = "0";
  arrow.style.height = "0";
  arrow.style.borderLeft = "5px solid transparent";
  arrow.style.borderRight = "5px solid transparent";
  arrow.style.borderBottom = "9px solid rgba(255,255,255,0.95)";
  arrow.style.transform = `rotate(${Number.isFinite(heading) ? heading : 0}deg)`;
  arrow.style.transition = "transform 180ms ease";
  marker.appendChild(arrow);
  wrapper.appendChild(marker);

  if (activeOrderCount > 0) {
    const badge = document.createElement("span");
    badge.textContent = String(activeOrderCount);
    badge.style.position = "absolute";
    badge.style.top = "-4px";
    badge.style.right = "-4px";
    badge.style.minWidth = "16px";
    badge.style.height = "16px";
    badge.style.padding = "0 4px";
    badge.style.borderRadius = "9999px";
    badge.style.background = "#f59e0b";
    badge.style.color = "#fff";
    badge.style.fontSize = "10px";
    badge.style.fontWeight = "700";
    badge.style.lineHeight = "16px";
    badge.style.textAlign = "center";
    badge.style.border = "1px solid rgba(255,255,255,0.92)";
    wrapper.appendChild(badge);
  }

  return wrapper;
}

function toSupportedVehicleType(vehicleType: string | null | undefined): SupportedVehicleType | null {
  const value = String(vehicleType || "").toLowerCase().trim();
  if (!value) return null;
  if (
    value === "car" ||
    value.includes("car") ||
    value.includes("sedan") ||
    value.includes("saloon") ||
    value.includes("hatchback") ||
    value.includes("suv") ||
    value.includes("van") ||
    value.includes("truck")
  ) {
    return "car";
  }
  if (value === "motorcycle" || value.includes("motor") || value.includes("moto") || value.includes("scooter")) {
    return "motorcycle";
  }
  if (
    value === "bicycle" ||
    value === "bike" ||
    value.includes("bicycle") ||
    value.includes("bycicle") ||
    value.includes("cycle") ||
    value.includes("pedal")
  ) {
    return "bicycle";
  }
  return null;
}

function toRiderFeatureCollection(
  riders: FleetRiderMarker[],
  failedModels: Partial<Record<SupportedVehicleType, boolean>>,
  resolvedModelUrls: Partial<Record<SupportedVehicleType, string>>,
) {
  const features = riders
    .filter((rider) => rider.isOnline !== false)
    .map((rider) => {
      const vehicleType = toSupportedVehicleType(rider.vehicleType);
      if (!vehicleType) return null;
      if (failedModels[vehicleType]) return null;
      const modelUrl = resolvedModelUrls[vehicleType];
      if (!modelUrl) return null;
      return {
        type: "Feature" as const,
        id: rider.riderId,
        geometry: {
          type: "Point" as const,
          coordinates: [rider.longitude, rider.latitude] as [number, number],
        },
        properties: {
          riderId: rider.riderId,
          vehicleType,
          modelUrl,
          bearing: [0, 0, Number(rider.heading || 0)],
        },
      };
    })
    .filter(Boolean);

  return {
    type: "FeatureCollection" as const,
    features,
  };
}

function toGeoJsonLine(positions: [number, number][]) {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: positions.map(([lat, lng]) => [lng, lat]),
        },
        properties: {},
      },
    ],
  };
}

function buildRiderSourceSignature(riders: FleetRiderMarker[]) {
  return riders
    .map((rider) =>
      [
        rider.riderId,
        rider.latitude.toFixed(6),
        rider.longitude.toFixed(6),
        Math.round(Number(rider.heading || 0)),
        rider.isOnline === false ? "0" : "1",
        toSupportedVehicleType(rider.vehicleType) || "none",
      ].join(":"),
    )
    .join("|");
}

function buildRouteSignature(routeGeometry: [number, number][]) {
  return routeGeometry.map(([lat, lng]) => `${lat.toFixed(6)}:${lng.toFixed(6)}`).join("|");
}

function getFailedModelMap(modelState: Record<SupportedVehicleType, ModelLoadState>) {
  return {
    car: modelState.car === "failed",
    motorcycle: modelState.motorcycle === "failed",
    bicycle: modelState.bicycle === "failed",
  } satisfies Partial<Record<SupportedVehicleType, boolean>>;
}

function isRiderUsingFallbackMarker(
  rider: FleetRiderMarker,
  failedModels: Partial<Record<SupportedVehicleType, boolean>>,
  forceFallback: boolean,
) {
  if (forceFallback) return true;
  if (rider.isOnline === false) return true;
  const vehicleType = toSupportedVehicleType(rider.vehicleType);
  if (!vehicleType) return true;
  return failedModels[vehicleType] === true;
}

export default function MapboxFleetMap({
  initialCenter = null,
  initialZoom,
  mapStyleUrl,
  cameraFocus = null,
  viewerLocation = null,
  riders,
  pendingOrders,
  routeGeometry = [],
  selectedDestination,
  className,
  style,
  presentationMode = false,
  onRiderClick,
  onOrderClick,
  requireMapboxToken = false,
  onLoad,
  onError,
  onRenderModeChange,
}: MapboxFleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const riderModelStateRef = useRef<Record<SupportedVehicleType, ModelLoadState>>({
    car: "idle",
    motorcycle: "idle",
    bicycle: "idle",
  });
  const resolvedModelUrlsRef = useRef<Partial<Record<SupportedVehicleType, string>>>({});
  const riderSourceUpdateRafRef = useRef<number | null>(null);
  const riderSourceUpdateTimeoutRef = useRef<number | null>(null);
  const lastRiderSourceCommitAtRef = useRef(0);
  const pendingRiderSourceDataRef = useRef<any | null>(null);
  const riderMarkersRef = useRef<Map<string, any>>(new Map());
  const orderMarkersRef = useRef<Map<string, any>>(new Map());
  const destinationMarkerRef = useRef<any>(null);
  const viewerMarkerRef = useRef<any>(null);
  const loadedRef = useRef(false);
  const initErrorReportedRef = useRef(false);
  const riderLayerInteractionsBoundRef = useRef(false);
  const useDomRiderMarkerFallbackRef = useRef(false);
  const onLoadRef = useRef<MapboxFleetMapProps["onLoad"]>(onLoad);
  const onErrorRef = useRef<MapboxFleetMapProps["onError"]>(onError);
  const onRenderModeChangeRef = useRef<MapboxFleetMapProps["onRenderModeChange"]>(onRenderModeChange);
  const onRiderClickRef = useRef<MapboxFleetMapProps["onRiderClick"]>(onRiderClick);
  const onOrderClickRef = useRef<MapboxFleetMapProps["onOrderClick"]>(onOrderClick);
  const autoCameraLockUntilRef = useRef(0);
  const lastAutoCameraAtRef = useRef(0);
  const hasInitialAutoFitRef = useRef(false);
  const cameraPointsRef = useRef<Array<[number, number]>>([]);
  const initialCenterRef = useRef<[number, number] | null>(null);
  const lastRiderSourceSignatureRef = useRef("");
  const lastRouteSignatureRef = useRef("");
  const lastRenderModeRef = useRef<"3d" | "hybrid" | "fallback" | null>(null);

  const fallbackMapRenderConfig = useMemo(() => getMapRenderer().getRenderConfig(), []);
  const resolvedInitialCenter = useMemo<[number, number]>(() => {
    if (initialCenter) return [initialCenter[1], initialCenter[0]];
    if (cameraFocus) return [cameraFocus[1], cameraFocus[0]];
    if (viewerLocation) return [viewerLocation[1], viewerLocation[0]];
    if (riders.length > 0) return [riders[0].longitude, riders[0].latitude];
    if (pendingOrders.length > 0) return [pendingOrders[0].longitude, pendingOrders[0].latitude];
    return [0, 0];
  }, [cameraFocus, initialCenter, pendingOrders, riders, viewerLocation]);
  if (!initialCenterRef.current) {
    initialCenterRef.current = resolvedInitialCenter;
  }

  const reportRenderMode = useCallback((mode: "3d" | "hybrid" | "fallback") => {
    if (lastRenderModeRef.current === mode) return;
    lastRenderModeRef.current = mode;
    onRenderModeChangeRef.current?.(mode);
  }, []);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onRenderModeChangeRef.current = onRenderModeChange;
  }, [onRenderModeChange]);

  useEffect(() => {
    onRiderClickRef.current = onRiderClick;
  }, [onRiderClick]);

  useEffect(() => {
    onOrderClickRef.current = onOrderClick;
  }, [onOrderClick]);

  const ensureRiderModelsLoaded = useCallback(
    async () => {
      const vehicleTypes: SupportedVehicleType[] = ["car", "motorcycle", "bicycle"];
      for (const vehicleType of vehicleTypes) {
        const state = riderModelStateRef.current[vehicleType];
        if (state === "ready" || state === "failed" || state === "loading") continue;
        riderModelStateRef.current[vehicleType] = "loading";
        try {
          let resolvedUrl = "";
          for (const candidateUrl of VEHICLE_MODEL_URL_CANDIDATES[vehicleType]) {
            const assetResponse = await fetch(candidateUrl, { method: "HEAD" });
            if (assetResponse.ok) {
              resolvedUrl = candidateUrl;
              break;
            }
          }
          if (!resolvedUrl) {
            throw new Error(
              `Vehicle model asset missing for ${vehicleType}: ${VEHICLE_MODEL_URL_CANDIDATES[vehicleType].join(", ")}`,
            );
          }
          resolvedModelUrlsRef.current[vehicleType] = resolvedUrl;
          riderModelStateRef.current[vehicleType] = "ready";
        } catch (error) {
          riderModelStateRef.current[vehicleType] = "failed";
          console.error(`3D model load failed for ${vehicleType}:`, error);
        }
      }
    },
    [],
  );

  const ensureRiderModelLayer = useCallback(
    async (map: any) => {
      try {
        await ensureRiderModelsLoaded();
        const allModelLoadsFailed = (
          Object.values(riderModelStateRef.current) as ModelLoadState[]
        ).every((state) => state === "failed");
        if (allModelLoadsFailed) {
          useDomRiderMarkerFallbackRef.current = true;
          return;
        }
        if (!map.getSource(RIDERS_SOURCE_ID)) {
          map.addSource(RIDERS_SOURCE_ID, {
            type: "geojson",
            data: toRiderFeatureCollection([], {}, resolvedModelUrlsRef.current),
          });
        }
        if (!map.getLayer(RIDERS_HIT_LAYER_ID)) {
          map.addLayer({
            id: RIDERS_HIT_LAYER_ID,
            type: "circle",
            source: RIDERS_SOURCE_ID,
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8, 8,
                14, 14,
                18, 20,
              ],
              "circle-opacity": 0,
              "circle-stroke-opacity": 0,
            },
          });
        }
        if (!map.getLayer(RIDERS_LAYER_ID)) {
          map.addLayer({
            id: RIDERS_LAYER_ID,
            type: "model",
            source: RIDERS_SOURCE_ID,
            layout: {
              "model-id": ["get", "modelUrl"],
            },
            paint: {
              "model-type": "location-indicator",
              "model-rotation": ["coalesce", ["get", "bearing"], ["literal", [0, 0, 0]]],
              "model-scale": [10, 10, 10],
            },
          });
        }

        if (!riderLayerInteractionsBoundRef.current) {
          map.on("click", RIDERS_HIT_LAYER_ID, (event: any) => {
            const riderId = String(event?.features?.[0]?.properties?.riderId || "").trim();
            if (riderId) onRiderClickRef.current?.(riderId);
          });
          map.on("mouseenter", RIDERS_HIT_LAYER_ID, () => {
            const canvas = map.getCanvas?.();
            if (canvas) canvas.style.cursor = "pointer";
          });
          map.on("mouseleave", RIDERS_HIT_LAYER_ID, () => {
            const canvas = map.getCanvas?.();
            if (canvas) canvas.style.cursor = "grab";
          });
          riderLayerInteractionsBoundRef.current = true;
        }
      } catch (error) {
        useDomRiderMarkerFallbackRef.current = true;
        console.error("Failed to initialize rider 3D layer:", error);
      }
    },
    [ensureRiderModelsLoaded],
  );

  useEffect(() => {
    let disposed = false;
    let initTimeoutId: number | NodeJS.Timeout | null = null;
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      try {
        initTimeoutId = window.setTimeout(() => {
          if (disposed || initErrorReportedRef.current || loadedRef.current) return;
          initErrorReportedRef.current = true;
          onErrorRef.current?.(new Error("Mapbox map initialization timed out"));
        }, 10000);
        const mapboxgl = await loadMapboxGl();
        const token = resolveMapboxAccessToken();
        if (disposed || !containerRef.current) return;
        if (requireMapboxToken && !token) {
          throw new Error("Mapbox access token is missing. Set VITE_MAPBOX_ACCESS_TOKEN or MAPBOX_PUBLIC_TOKEN.");
        }
        if (token) {
          mapboxgl.accessToken = token;
        }
        const mapStyle = String(mapStyleUrl || "").trim() || resolveMapboxStyleUrl();
        const styleValue = token
          ? mapStyle
          : toMapboxRasterStyle(fallbackMapRenderConfig.tileUrl, fallbackMapRenderConfig.attribution);
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: styleValue,
          center: initialCenterRef.current || resolvedInitialCenter,
          zoom: Number.isFinite(initialZoom as number) ? Number(initialZoom) : 14,
          minZoom: 2,
          maxZoom: 22,
          pitch: DEFAULT_3D_PITCH,
          bearing: DEFAULT_3D_BEARING,
          antialias: true,
          fadeDuration: 200,
        });
        const lockAutoCamera = () => {
          autoCameraLockUntilRef.current = Date.now() + 2_500;
        };
        map.on("dragstart", lockAutoCamera);
        map.on("zoomstart", lockAutoCamera);
        map.on("rotatestart", lockAutoCamera);
        map.on("pitchstart", lockAutoCamera);
        map.scrollZoom.enable();
        if (map.scrollZoom?.setWheelZoomRate) {
          map.scrollZoom.setWheelZoomRate(1 / 200);
        }
        if (map.scrollZoom?.setZoomRate) {
          map.scrollZoom.setZoomRate(1 / 80);
        }
        map.dragPan.enable();
        map.doubleClickZoom.enable();
        map.dragRotate.enable();
        map.touchZoomRotate.enable();
        const canvas = map.getCanvas?.();
        let handleMouseDown: (() => void) | null = null;
        let resetCursor: (() => void) | null = null;
        if (canvas) {
          canvas.style.cursor = "grab";
          handleMouseDown = () => {
            canvas.style.cursor = "grabbing";
          };
          resetCursor = () => {
            canvas.style.cursor = "grab";
          };
          canvas.addEventListener("mousedown", handleMouseDown);
          canvas.addEventListener("mouseup", resetCursor);
          canvas.addEventListener("mouseleave", resetCursor);
        }
        map.addControl(new mapboxgl.NavigationControl({ showZoom: true, showCompass: true }), "top-right");
        map.addControl(
          new mapboxgl.GeolocateControl({
            positionOptions: { enableHighAccuracy: true },
            trackUserLocation: true,
            showUserHeading: true,
          }),
          "top-right",
        );
        map.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");
        mapRef.current = map;
        usageMonitor.trackMapInstantiation();
        map.on("sourcedata", () => usageMonitor.trackTileLoad());
        map.on("error", (event: any) => {
          if (disposed) return;
          const errorPayload = event?.error || event || new Error("Mapbox map failed to initialize.");
          if (!loadedRef.current && !initErrorReportedRef.current) {
            initErrorReportedRef.current = true;
            onErrorRef.current?.(errorPayload);
            return;
          }
          // Runtime layer/source errors should not force fallback away from Mapbox.
          console.error("Mapbox runtime error:", errorPayload);
        });
        map.on("load", () => {
          if (disposed) return;
          if (initTimeoutId) {
            window.clearTimeout(initTimeoutId);
            initTimeoutId = null;
          }
          loadedRef.current = true;
          initErrorReportedRef.current = false;
          onLoadRef.current?.();
          if (!map.getSource(ROUTE_SOURCE_ID)) {
            map.addSource(ROUTE_SOURCE_ID, {
              type: "geojson",
              data: toGeoJsonLine([]),
            });
          }
          // Outer casing / glow layer (Uber-grade route styling)
          if (!map.getLayer(ROUTE_OUTLINE_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_OUTLINE_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              paint: {
                "line-color": "#93c5fd",
                "line-width": 10,
                "line-opacity": 0.35,
                "line-blur": 4,
              },
            });
          }
          if (!map.getLayer(ROUTE_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              paint: {
                "line-color": "#2563eb",
                "line-width": 5,
                "line-opacity": 0.95,
                "line-dasharray": [1, 0],
              },
            });
          }
          void ensureRiderModelLayer(map).then(() => {
            if (useDomRiderMarkerFallbackRef.current) return;
            const hitSource = map.getSource(RIDERS_SOURCE_ID);
            if (!hitSource) return;
            const failedModelMap = {
              car: riderModelStateRef.current.car === "failed",
              motorcycle: riderModelStateRef.current.motorcycle === "failed",
              bicycle: riderModelStateRef.current.bicycle === "failed",
            };
            lastRiderSourceSignatureRef.current = buildRiderSourceSignature(riders);
            hitSource.setData(toRiderFeatureCollection(riders, failedModelMap, resolvedModelUrlsRef.current));
          });
        });
      } catch (error) {
        if (initTimeoutId) {
          window.clearTimeout(initTimeoutId);
          initTimeoutId = null;
        }
        initErrorReportedRef.current = true;
        onErrorRef.current?.(error);
      }
    })();

    return () => {
      disposed = true;
      if (initTimeoutId) {
        window.clearTimeout(initTimeoutId);
        initTimeoutId = null;
      }
      if (riderSourceUpdateRafRef.current !== null) {
        window.cancelAnimationFrame(riderSourceUpdateRafRef.current);
        riderSourceUpdateRafRef.current = null;
      }
      if (riderSourceUpdateTimeoutRef.current !== null) {
        window.clearTimeout(riderSourceUpdateTimeoutRef.current);
        riderSourceUpdateTimeoutRef.current = null;
      }
      pendingRiderSourceDataRef.current = null;
      riderMarkersRef.current.forEach((marker) => marker.remove());
      riderMarkersRef.current.clear();
      orderMarkersRef.current.forEach((marker) => marker.remove());
      orderMarkersRef.current.clear();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (viewerMarkerRef.current) viewerMarkerRef.current.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      riderLayerInteractionsBoundRef.current = false;
      useDomRiderMarkerFallbackRef.current = false;
      initErrorReportedRef.current = false;
      loadedRef.current = false;
      hasInitialAutoFitRef.current = false;
      lastRiderSourceSignatureRef.current = "";
      lastRouteSignatureRef.current = "";
      lastRenderModeRef.current = null;
    };
  }, [ensureRiderModelLayer, fallbackMapRenderConfig.attribution, fallbackMapRenderConfig.tileUrl, initialZoom, mapStyleUrl, requireMapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const nextSignature = buildRouteSignature(routeGeometry);
    if (lastRouteSignatureRef.current === nextSignature) return;
    const source = map.getSource(ROUTE_SOURCE_ID);
    if (source && source.setData) {
      lastRouteSignatureRef.current = nextSignature;
      source.setData(toGeoJsonLine(routeGeometry));
    }
  }, [routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const mapboxgl = (window as any).mapboxgl;
    const failedModelMap = getFailedModelMap(riderModelStateRef.current);
    const forceFallback = useDomRiderMarkerFallbackRef.current;
    const modelEligibleRiders = riders.filter((rider) => !isRiderUsingFallbackMarker(rider, failedModelMap, forceFallback));
    const fallbackRiders = riders.filter((rider) => isRiderUsingFallbackMarker(rider, failedModelMap, forceFallback));

    if (!riders.length) {
      reportRenderMode("fallback");
    } else if (!modelEligibleRiders.length) {
      reportRenderMode("fallback");
    } else if (fallbackRiders.length > 0) {
      reportRenderMode("hybrid");
    } else {
      reportRenderMode("3d");
    }

    const nextIds = new Set(fallbackRiders.map((rider) => rider.riderId));
    riderMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        riderMarkersRef.current.delete(id);
      }
    });

    fallbackRiders.forEach((rider) => {
      const color = rider.isOnline === false ? "#64748b" : "#0f766e";
      const heading = Number(rider.heading || 0);
      const activeOrderCount = Number(rider.activeOrderCount || 0);
      let marker = riderMarkersRef.current.get(rider.riderId);
      const shouldRecreate =
        !marker ||
        marker.__color !== color ||
        marker.__heading !== heading ||
        marker.__activeOrderCount !== activeOrderCount;

      if (shouldRecreate) {
        if (marker) {
          marker.remove();
        }
        const el = makeRiderMarkerElement(color, heading, activeOrderCount);
        el.addEventListener("click", () => onRiderClickRef.current?.(rider.riderId));
        marker = new mapboxgl.Marker({ element: el, rotationAlignment: "map" });
        marker.__color = color;
        marker.__heading = heading;
        marker.__activeOrderCount = activeOrderCount;
        riderMarkersRef.current.set(rider.riderId, marker);
      }

      marker.setLngLat([rider.longitude, rider.latitude]);
      if (!marker.__isAdded || shouldRecreate) {
        marker.addTo(map);
        marker.__isAdded = true;
      }
    });

    const nextSignature = buildRiderSourceSignature(modelEligibleRiders);
    if (lastRiderSourceSignatureRef.current === nextSignature) return;
    lastRiderSourceSignatureRef.current = nextSignature;
    pendingRiderSourceDataRef.current = toRiderFeatureCollection(modelEligibleRiders, {}, resolvedModelUrlsRef.current);
    const commitSourceData = () => {
      if (riderSourceUpdateRafRef.current !== null) return;
      riderSourceUpdateRafRef.current = window.requestAnimationFrame(() => {
        riderSourceUpdateRafRef.current = null;
        const hitSource = map.getSource(RIDERS_SOURCE_ID);
        if (!hitSource || !pendingRiderSourceDataRef.current) return;
        try {
          hitSource.setData(pendingRiderSourceDataRef.current);
          lastRiderSourceCommitAtRef.current = Date.now();
        } catch (error) {
          console.error("Failed to update rider 3D source data:", error);
        }
      });
    };

    const now = Date.now();
    const elapsed = now - lastRiderSourceCommitAtRef.current;
    if (elapsed >= RIDER_SOURCE_UPDATE_MIN_INTERVAL_MS) {
      commitSourceData();
      return;
    }

    if (riderSourceUpdateTimeoutRef.current !== null) return;
    riderSourceUpdateTimeoutRef.current = window.setTimeout(() => {
      riderSourceUpdateTimeoutRef.current = null;
      commitSourceData();
    }, Math.max(16, RIDER_SOURCE_UPDATE_MIN_INTERVAL_MS - elapsed));
  }, [reportRenderMode, riders]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const mapboxgl = (window as any).mapboxgl;

    const nextIds = new Set(pendingOrders.map((order) => order.id));
    orderMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        orderMarkersRef.current.delete(id);
      }
    });

    pendingOrders.forEach((order) => {
      let marker = orderMarkersRef.current.get(order.id);
      if (!marker) {
        const el = makeMarkerElement("#f59e0b", 12);
        el.style.cursor = "pointer";
        el.addEventListener("click", () => onOrderClickRef.current?.(order.id));
        marker = new mapboxgl.Marker({ element: el });
        orderMarkersRef.current.set(order.id, marker);
      }
      const prevLat = Number(marker.__lastLat);
      const prevLng = Number(marker.__lastLng);
      const moved =
        !Number.isFinite(prevLat) ||
        !Number.isFinite(prevLng) ||
        Math.abs(prevLat - order.latitude) > 0.0000001 ||
        Math.abs(prevLng - order.longitude) > 0.0000001;
      if (moved) {
        marker.setLngLat([order.longitude, order.latitude]);
        marker.__lastLat = order.latitude;
        marker.__lastLng = order.longitude;
      }
      if (!marker.__isAdded) {
        marker.addTo(map);
        marker.__isAdded = true;
      }
    });
  }, [pendingOrders]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (!selectedDestination) {
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      return;
    }
    const mapboxgl = (window as any).mapboxgl;
    if (!destinationMarkerRef.current) {
      destinationMarkerRef.current = new mapboxgl.Marker({ element: makeMarkerElement("#ef4444", 14) });
    }
    destinationMarkerRef.current.setLngLat([selectedDestination[1], selectedDestination[0]]).addTo(map);
  }, [selectedDestination]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (!viewerLocation) {
      if (viewerMarkerRef.current) viewerMarkerRef.current.remove();
      return;
    }
    const mapboxgl = (window as any).mapboxgl;
    if (!viewerMarkerRef.current) {
      viewerMarkerRef.current = new mapboxgl.Marker({ element: makeMarkerElement("#3b82f6", 12) });
    }
    viewerMarkerRef.current.setLngLat([viewerLocation[1], viewerLocation[0]]).addTo(map);
  }, [viewerLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points: Array<[number, number]> = [];
    const focusAnchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : null;
    if (focusAnchor) points.push(focusAnchor);
    riders.forEach((rider) => points.push([rider.longitude, rider.latitude]));
    if (selectedDestination) {
      points.push([selectedDestination[1], selectedDestination[0]]);
    }
    cameraPointsRef.current = points;
    if (!points.length) return;
    const now = Date.now();
    const focusVisible = focusAnchor ? isPointVisibleWithMargin(map, focusAnchor, 0.2) : true;
    if (now < autoCameraLockUntilRef.current && focusVisible) return;
    if (hasInitialAutoFitRef.current && now - lastAutoCameraAtRef.current < 1_500) return;
    if (focusAnchor) {
      if (focusVisible && hasInitialAutoFitRef.current) return;
      const currentZoom = Number(map.getZoom?.() || 12);
      const maxZoom = Number(map.getMaxZoom?.() || 20);
      const targetZoom = hasInitialAutoFitRef.current ? currentZoom : Math.min(maxZoom, Math.max(currentZoom, 16.8));
      map.easeTo({
        center: focusAnchor,
        zoom: targetZoom,
        pitch: Math.max(Number(map.getPitch?.() || 0), presentationMode ? 64 : DEFAULT_3D_PITCH),
        bearing: Number.isFinite(Number(map.getBearing?.())) ? Number(map.getBearing?.()) : DEFAULT_3D_BEARING,
        duration: 520,
      });
      hasInitialAutoFitRef.current = true;
      lastAutoCameraAtRef.current = now;
      return;
    }
    if (hasInitialAutoFitRef.current && points.every((point) => isPointVisibleWithMargin(map, point, 0.14))) return;
    fitMapToPoints(map, points, { padding: 50, maxZoom: 19, duration: 900 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = now;
  }, [cameraFocus, riders, selectedDestination]);

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : cameraPointsRef.current[0];
    const nextZoom = Math.min((map.getZoom?.() ?? 12) + 1, 20);
    if (anchor) {
      map.easeTo({
        center: anchor,
        zoom: nextZoom,
        pitch: Math.max(Number(map.getPitch?.() || 0), DEFAULT_3D_PITCH),
        duration: 250,
      });
      return;
    }
    map.zoomIn({ duration: 250 });
  };

  const zoomOut = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : cameraPointsRef.current[0];
    const nextZoom = Math.max((map.getZoom?.() ?? 12) - 1, 2);
    if (anchor) {
      map.easeTo({
        center: anchor,
        zoom: nextZoom,
        pitch: Math.max(Number(map.getPitch?.() || 0), presentationMode ? 58 : 52),
        duration: 250,
      });
      return;
    }
    map.zoomOut({ duration: 250 });
  };

  const recenterCamera = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points = cameraPointsRef.current;
    if (!points.length) return;
    autoCameraLockUntilRef.current = 0;
    const focusAnchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : points[0];
    if (focusAnchor) {
      const nextZoom = Math.min(Number(map.getMaxZoom?.() || 20), Number(map.getZoom?.() || 12) + 0.8);
      map.easeTo({
        center: focusAnchor,
        zoom: nextZoom,
        pitch: Math.max(Number(map.getPitch?.() || 0), presentationMode ? 64 : DEFAULT_3D_PITCH),
        bearing: DEFAULT_3D_BEARING,
        duration: 650,
      });
      hasInitialAutoFitRef.current = true;
      lastAutoCameraAtRef.current = Date.now();
      return;
    }
    fitMapToPoints(map, points, { padding: 60, maxZoom: 19, duration: 700 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = Date.now();
  };

  const focusCamera = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : cameraPointsRef.current[0];
    if (!anchor) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const zoom = Math.min(Number(map.getMaxZoom?.() || 20), Number(map.getZoom?.() ?? 12) + 0.75);
    map.easeTo({
      center: anchor,
      zoom,
      pitch: Math.max(Number(map.getPitch?.() || 0), presentationMode ? 64 : DEFAULT_3D_PITCH),
      duration: 320,
    });
  };

  const streetZoom = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points = cameraPointsRef.current;
    if (!points.length) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : points[0];
    const zoom = Math.min(Number(map.getMaxZoom?.() || 20), Number(map.getZoom?.() || 12) + 1.35);
    map.easeTo({
      center: anchor,
      zoom,
      pitch: Math.max(Number(map.getPitch?.() || 0), presentationMode ? 64 : DEFAULT_3D_PITCH),
      duration: 350,
    });
  };

  const resetBearing = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    map.easeTo({
      bearing: DEFAULT_3D_BEARING,
      pitch: Math.max(Number(map.getPitch?.() || 0), DEFAULT_3D_PITCH),
      duration: 300,
    });
  };

  const togglePitch = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const current = Number(map.getPitch?.() || 0);
    const next = current < 20 ? 48 : current < 56 ? DEFAULT_3D_PITCH : 0;
    map.easeTo({ pitch: next, duration: 350 });
  };

  return (
    <div className={`relative ${className || ""}`} style={style}>
      <div ref={containerRef} className="h-full w-full" />
      {!presentationMode && (
        <div className="pointer-events-none absolute right-3 top-3 z-[1300]">
          <div className="pointer-events-auto rounded-2xl border border-slate-300/40 bg-white/75 p-2 shadow-2xl backdrop-blur-md dark:border-slate-700/60 dark:bg-slate-900/70">
            <div className="grid grid-cols-2 gap-1.5">
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={zoomIn} title="Zoom In"><Plus className="h-3.5 w-3.5" /><span>In</span></button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={zoomOut} title="Zoom Out"><Minus className="h-3.5 w-3.5" /><span>Out</span></button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={streetZoom} title="Street Level"><Route className="h-3.5 w-3.5" /><span>Street</span></button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={recenterCamera} title="Recenter / Fit"><Crosshair className="h-3.5 w-3.5" /><span>Fit</span></button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={focusCamera} title="Focus Rider"><LocateFixed className="h-3.5 w-3.5" /><span>Focus</span></button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={resetBearing} title="Reset North"><Compass className="h-3.5 w-3.5" /><span>North</span></button>
              <button type="button" className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300/60 bg-white px-2 py-1.5 text-[11px] font-semibold text-slate-800 transition hover:-translate-y-px hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700" onClick={togglePitch} title="Toggle 2D/3D"><Layers3 className="h-3.5 w-3.5" /><span>2D/3D</span></button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
