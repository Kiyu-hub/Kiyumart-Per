import { useEffect, useMemo, useRef } from "react";
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
  activeOrderCount?: number;
}

interface FleetOrderMarker {
  id: string;
  latitude: number;
  longitude: number;
}

interface MapboxFleetMapProps {
  center: [number, number];
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

function fitMapToPoints(
  map: any,
  points: Array<[number, number]>,
  options?: {
    padding?: number;
    maxZoom?: number;
    duration?: number;
    singleZoom?: number;
  },
) {
  if (!points.length) return;
  const padding = options?.padding ?? 50;
  const maxZoom = options?.maxZoom ?? 18;
  const duration = options?.duration ?? 800;
  const singleZoom = options?.singleZoom ?? 16;
  if (points.length === 1) {
    map.easeTo({ center: points[0], zoom: singleZoom, duration });
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

function vehicleGlyph(vehicleType: string | null | undefined): string {
  const normalized = normalizeVehicleType(vehicleType);
  if (normalized === "car") return "🚗";
  if (normalized === "van") return "🚐";
  if (normalized === "truck") return "🚚";
  if (normalized === "bicycle") return "🚲";
  return "🏍️";
}

function makeVehicleMarkerElement(
  vehicleType: string | null | undefined,
  isOnline: boolean,
  activeOrderCount: number,
): HTMLDivElement {
  const el = document.createElement("div");
  const tone = isOnline ? "#0f766e" : "#475569";
  const indicator = isOnline ? "#10b981" : "#ef4444";
  const glyph = vehicleGlyph(vehicleType);
  const badge = activeOrderCount > 0
    ? `<span style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 4px;border-radius:9999px;background:#f59e0b;color:white;font-size:10px;line-height:16px;font-weight:700;text-align:center;border:1px solid rgba(255,255,255,0.92);">${activeOrderCount}</span>`
    : "";
  el.style.position = "relative";
  el.style.width = "34px";
  el.style.height = "34px";
  el.style.borderRadius = "9999px";
  el.style.border = "2px solid rgba(255,255,255,0.92)";
  el.style.background = `linear-gradient(145deg, ${tone}, #0f172a)`;
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.justifyContent = "center";
  el.style.fontSize = "16px";
  el.style.boxShadow = "0 8px 18px rgba(15,23,42,0.28)";
  el.style.transform = "translateZ(0)";
  el.innerHTML = `<span>${glyph}</span>
    <span style="position:absolute;bottom:-4px;left:-4px;width:10px;height:10px;border-radius:9999px;background:${indicator};border:2px solid white;"></span>
    ${badge}`;
  return el;
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
  center,
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
  const riderMarkersRef = useRef<Map<string, any>>(new Map());
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

  const fallbackMapRenderConfig = useMemo(() => getMapRenderer().getRenderConfig(), []);

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

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
          center: [center[1], center[0]],
          zoom: 16,
          minZoom: 2,
          maxZoom: 20,
          pitch: 45,
          antialias: true,
        });
        const lockAutoCamera = () => {
          autoCameraLockUntilRef.current = Date.now() + 10_000;
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
        if (canvas) {
          canvas.style.cursor = "grab";
          canvas.addEventListener("mousedown", () => {
            canvas.style.cursor = "grabbing";
          });
          const resetCursor = () => {
            canvas.style.cursor = "grab";
          };
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
          if (disposed || initErrorReportedRef.current) return;
          const errorPayload = event?.error || event || new Error("Mapbox map failed to initialize.");
          initErrorReportedRef.current = true;
          onErrorRef.current?.(errorPayload);
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
      riderMarkersRef.current.forEach((marker) => marker.remove());
      orderMarkersRef.current.forEach((marker) => marker.remove());
      riderMarkersRef.current.clear();
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
  }, [fallbackMapRenderConfig.attribution, fallbackMapRenderConfig.tileUrl, mapStyleUrl, presentationMode, requireMapboxToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.easeTo({ center: [center[1], center[0]], duration: 400 });
  }, [center]);

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
    const mapboxgl = (window as any).mapboxgl;

    const nextIds = new Set(riders.map((rider) => rider.riderId));
    riderMarkersRef.current.forEach((marker, id) => {
      if (!nextIds.has(id)) {
        marker.remove();
        riderMarkersRef.current.delete(id);
      }
    });

    riders.forEach((rider) => {
      let marker = riderMarkersRef.current.get(rider.riderId);
      const markerKey = [
        normalizeVehicleType(rider.vehicleType),
        rider.isOnline === false ? "0" : "1",
        Number(rider.activeOrderCount || 0),
      ].join("|");
      if (!marker) {
        const el = makeVehicleMarkerElement(
          rider.vehicleType,
          rider.isOnline !== false,
          Number(rider.activeOrderCount || 0),
        );
        el.style.cursor = "pointer";
        el.addEventListener("click", () => onRiderClick?.(rider.riderId));
        marker = new mapboxgl.Marker({ element: el });
        marker.__markerKey = markerKey;
        riderMarkersRef.current.set(rider.riderId, marker);
      } else if (marker.__markerKey !== markerKey) {
        marker.remove();
        const el = makeVehicleMarkerElement(
          rider.vehicleType,
          rider.isOnline !== false,
          Number(rider.activeOrderCount || 0),
        );
        el.style.cursor = "pointer";
        el.addEventListener("click", () => onRiderClick?.(rider.riderId));
        marker = new mapboxgl.Marker({ element: el });
        marker.__markerKey = markerKey;
        riderMarkersRef.current.set(rider.riderId, marker);
      }
      marker.setLngLat([rider.longitude, rider.latitude]).addTo(map);
    });
  }, [onRiderClick, riders]);

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
      marker.setLngLat([order.longitude, order.latitude]).addTo(map);
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
    pendingOrders.forEach((order) => points.push([order.longitude, order.latitude]));
    if (selectedDestination) {
      points.push([selectedDestination[1], selectedDestination[0]]);
    }
    cameraPointsRef.current = points;
    if (!points.length) return;
    const now = Date.now();
    if (now < autoCameraLockUntilRef.current) return;
    if (hasInitialAutoFitRef.current && now - lastAutoCameraAtRef.current < 900) return;
    if (focusAnchor) {
      const currentZoom = Number(map.getZoom?.() || 12);
      const nextZoom = hasInitialAutoFitRef.current ? Math.max(currentZoom, 17) : 17;
      map.easeTo({ center: focusAnchor, zoom: nextZoom, duration: 650 });
      hasInitialAutoFitRef.current = true;
      lastAutoCameraAtRef.current = Date.now();
      return;
    }
    if (hasInitialAutoFitRef.current && points.every((point) => isPointVisibleWithMargin(map, point, 0.14))) return;
    fitMapToPoints(map, points, { padding: 50, maxZoom: 19, duration: 900, singleZoom: 17 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = Date.now();
  }, [cameraFocus, pendingOrders, riders, selectedDestination]);

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
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
    autoCameraLockUntilRef.current = Date.now() + 10_000;
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
      map.easeTo({ center: focusAnchor, zoom: 17, bearing: 0, duration: 650 });
      hasInitialAutoFitRef.current = true;
      lastAutoCameraAtRef.current = Date.now();
      return;
    }
    fitMapToPoints(map, points, { padding: 60, maxZoom: 19, duration: 700, singleZoom: 17 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = Date.now();
  };

  const focusCamera = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : cameraPointsRef.current[0];
    if (!anchor) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
    const zoom = Math.max((map.getZoom?.() ?? 12), 17);
    map.easeTo({ center: anchor, zoom, duration: 320 });
  };

  const streetZoom = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points = cameraPointsRef.current;
    if (!points.length) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
    const anchor = cameraFocus ? ([cameraFocus[1], cameraFocus[0]] as [number, number]) : points[0];
    map.easeTo({ center: anchor, zoom: 18, duration: 350 });
  };

  const resetBearing = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
    map.easeTo({ bearing: 0, duration: 300 });
  };

  const togglePitch = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
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
