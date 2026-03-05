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
}

const ROUTE_SOURCE_ID = "fleet-route-source";
const ROUTE_LAYER_ID = "fleet-route-layer";
const RIDERS_SOURCE_ID = "fleet-riders-source";
const RIDERS_LAYER_ID = "fleet-riders-3d-layer";
const RIDERS_HIT_LAYER_ID = "fleet-riders-hit-layer";
type SupportedVehicleType = "car" | "motorcycle" | "bicycle";
type ModelLoadState = "idle" | "loading" | "ready" | "failed";

const VEHICLE_MODEL_IDS: Record<SupportedVehicleType, string> = {
  car: "car-model",
  motorcycle: "motorcycle-model",
  bicycle: "bicycle-model",
};

const VEHICLE_MODEL_URLS: Record<SupportedVehicleType, string> = {
  car: "/assets/vehicles/car.glb",
  motorcycle: "/assets/vehicles/motorcycle.glb",
  bicycle: "/assets/vehicles/bicycle.glb",
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

function toSupportedVehicleType(vehicleType: string | null | undefined): SupportedVehicleType | null {
  const value = String(vehicleType || "").toLowerCase().trim();
  if (!value) return null;
  if (value === "car") return "car";
  if (value === "motorcycle") return "motorcycle";
  if (value === "bicycle") return "bicycle";
  return null;
}

function toRiderFeatureCollection(
  riders: FleetRiderMarker[],
  failedModels: Partial<Record<SupportedVehicleType, boolean>>,
) {
  const features = riders
    .filter((rider) => rider.isOnline !== false)
    .map((rider) => {
      const vehicleType = toSupportedVehicleType(rider.vehicleType);
      if (!vehicleType) return null;
      if (failedModels[vehicleType]) return null;
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
}: MapboxFleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const riderModelStateRef = useRef<Record<SupportedVehicleType, ModelLoadState>>({
    car: "idle",
    motorcycle: "idle",
    bicycle: "idle",
  });
  const riderSourceUpdateRafRef = useRef<number | null>(null);
  const pendingRiderSourceDataRef = useRef<any | null>(null);
  const orderMarkersRef = useRef<Map<string, any>>(new Map());
  const destinationMarkerRef = useRef<any>(null);
  const viewerMarkerRef = useRef<any>(null);
  const loadedRef = useRef(false);
  const initErrorReportedRef = useRef(false);
  const onLoadRef = useRef<MapboxFleetMapProps["onLoad"]>(onLoad);
  const onErrorRef = useRef<MapboxFleetMapProps["onError"]>(onError);
  const autoCameraLockUntilRef = useRef(0);
  const lastAutoCameraAtRef = useRef(0);
  const hasInitialAutoFitRef = useRef(false);
  const cameraPointsRef = useRef<Array<[number, number]>>([]);
  const initialCenterRef = useRef<[number, number] | null>(null);

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

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const ensureRiderModelsLoaded = useCallback(
    async (map: any) => {
      const vehicleTypes: SupportedVehicleType[] = ["car", "motorcycle", "bicycle"];
      for (const vehicleType of vehicleTypes) {
        const state = riderModelStateRef.current[vehicleType];
        if (state === "ready" || state === "failed" || state === "loading") continue;
        riderModelStateRef.current[vehicleType] = "loading";
        const modelId = VEHICLE_MODEL_IDS[vehicleType];
        const modelUrl = VEHICLE_MODEL_URLS[vehicleType];
        try {
          const hasModel = typeof map.hasModel === "function" ? map.hasModel(modelId) : false;
          if (!hasModel && typeof map.addModel === "function") {
            try {
              await Promise.resolve(map.addModel(modelId, { uri: modelUrl, type: "gltf" }));
            } catch {
              await Promise.resolve(map.addModel(modelId, modelUrl));
            }
          } else if (!hasModel) {
            throw new Error("Mapbox model API unavailable on this runtime");
          }
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
        await ensureRiderModelsLoaded(map);
        if (!map.getSource(RIDERS_SOURCE_ID)) {
          map.addSource(RIDERS_SOURCE_ID, {
            type: "geojson",
            data: toRiderFeatureCollection([], {}),
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
              "model-id": [
                "match",
                ["get", "vehicleType"],
                "car", VEHICLE_MODEL_IDS.car,
                "motorcycle", VEHICLE_MODEL_IDS.motorcycle,
                "bicycle", VEHICLE_MODEL_IDS.bicycle,
                "",
              ],
            },
            paint: {
              "model-rotation": ["coalesce", ["get", "bearing"], ["literal", [0, 0, 0]]],
              "model-scale": [
                "interpolate",
                ["linear"],
                ["zoom"],
                7, ["literal", [0.32, 0.32, 0.32]],
                13, ["literal", [0.68, 0.68, 0.68]],
                18, ["literal", [1.08, 1.08, 1.08]],
              ],
            },
          });
        }

        map.on("click", RIDERS_HIT_LAYER_ID, (event: any) => {
          const riderId = String(event?.features?.[0]?.properties?.riderId || "").trim();
          if (riderId) onRiderClick?.(riderId);
        });
        map.on("mouseenter", RIDERS_HIT_LAYER_ID, () => {
          const canvas = map.getCanvas?.();
          if (canvas) canvas.style.cursor = "pointer";
        });
        map.on("mouseleave", RIDERS_HIT_LAYER_ID, () => {
          const canvas = map.getCanvas?.();
          if (canvas) canvas.style.cursor = "grab";
        });
      } catch (error) {
        console.error("Failed to initialize rider 3D layer:", error);
      }
    },
    [ensureRiderModelsLoaded, onRiderClick],
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
          maxZoom: 20,
          pitch: 45,
          antialias: true,
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
          if (!map.getLayer(ROUTE_LAYER_ID)) {
            map.addLayer({
              id: ROUTE_LAYER_ID,
              type: "line",
              source: ROUTE_SOURCE_ID,
              paint: {
                "line-color": "#3b82f6",
                "line-width": 4,
                "line-opacity": 0.85,
              },
            });
          }
          void ensureRiderModelLayer(map).then(() => {
            const source = map.getSource(RIDERS_SOURCE_ID);
            if (!source) return;
            const failedModelMap = {
              car: riderModelStateRef.current.car === "failed",
              motorcycle: riderModelStateRef.current.motorcycle === "failed",
              bicycle: riderModelStateRef.current.bicycle === "failed",
            };
            source.setData(toRiderFeatureCollection(riders, failedModelMap));
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
      pendingRiderSourceDataRef.current = null;
      orderMarkersRef.current.forEach((marker) => marker.remove());
      orderMarkersRef.current.clear();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (viewerMarkerRef.current) viewerMarkerRef.current.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      initErrorReportedRef.current = false;
      loadedRef.current = false;
      hasInitialAutoFitRef.current = false;
    };
  }, [ensureRiderModelLayer, fallbackMapRenderConfig.attribution, fallbackMapRenderConfig.tileUrl, initialZoom, mapStyleUrl, presentationMode, requireMapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const source = map.getSource(ROUTE_SOURCE_ID);
    if (source && source.setData) {
      source.setData(toGeoJsonLine(routeGeometry));
    }
  }, [routeGeometry]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const failedModelMap = {
      car: riderModelStateRef.current.car === "failed",
      motorcycle: riderModelStateRef.current.motorcycle === "failed",
      bicycle: riderModelStateRef.current.bicycle === "failed",
    };
    pendingRiderSourceDataRef.current = toRiderFeatureCollection(riders, failedModelMap);

    if (riderSourceUpdateRafRef.current !== null) {
      return;
    }

    riderSourceUpdateRafRef.current = window.requestAnimationFrame(() => {
      riderSourceUpdateRafRef.current = null;
      const source = map.getSource(RIDERS_SOURCE_ID);
      if (!source || !pendingRiderSourceDataRef.current) return;
      try {
        source.setData(pendingRiderSourceDataRef.current);
      } catch (error) {
        console.error("Failed to update rider 3D source data:", error);
      }
    });

    return () => {
      if (riderSourceUpdateRafRef.current !== null) {
        window.cancelAnimationFrame(riderSourceUpdateRafRef.current);
        riderSourceUpdateRafRef.current = null;
      }
    };
  }, [riders]);

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
        el.addEventListener("click", () => onOrderClick?.(order.id));
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
  }, [onOrderClick, pendingOrders]);

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
    if (hasInitialAutoFitRef.current && now - lastAutoCameraAtRef.current < 900) return;
    if (focusAnchor) {
      const currentZoom = Number(map.getZoom?.() || 12);
      const zoomBoost = hasInitialAutoFitRef.current ? 0.35 : 0.85;
      const nextZoom = Math.min(Number(map.getMaxZoom?.() || 20), currentZoom + zoomBoost);
      map.easeTo({ center: focusAnchor, zoom: nextZoom, duration: 650 });
      hasInitialAutoFitRef.current = true;
      lastAutoCameraAtRef.current = Date.now();
      return;
    }
    if (hasInitialAutoFitRef.current && points.every((point) => isPointVisibleWithMargin(map, point, 0.14))) return;
    fitMapToPoints(map, points, { padding: 50, maxZoom: 19, duration: 900 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = Date.now();
  }, [cameraFocus, pendingOrders, riders, selectedDestination]);

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : cameraPointsRef.current[0];
    const nextZoom = Math.min((map.getZoom?.() ?? 12) + 1, 20);
    if (anchor) {
      map.easeTo({ center: anchor, zoom: nextZoom, duration: 250 });
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
      map.easeTo({ center: anchor, zoom: nextZoom, duration: 250 });
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
      map.easeTo({ center: focusAnchor, zoom: nextZoom, bearing: 0, duration: 650 });
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
    map.easeTo({ center: anchor, zoom, duration: 320 });
  };

  const streetZoom = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points = cameraPointsRef.current;
    if (!points.length) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : points[0];
    const zoom = Math.min(Number(map.getMaxZoom?.() || 20), Number(map.getZoom?.() || 12) + 1.35);
    map.easeTo({ center: anchor, zoom, duration: 350 });
  };

  const resetBearing = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    map.easeTo({ bearing: 0, duration: 300 });
  };

  const togglePitch = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 2_500;
    const current = Number(map.getPitch?.() || 0);
    const next = current < 20 ? 45 : current < 50 ? 60 : 0;
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
