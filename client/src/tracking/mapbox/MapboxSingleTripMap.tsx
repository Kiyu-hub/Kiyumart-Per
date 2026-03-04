import { useEffect, useMemo, useRef } from "react";
import { usageMonitor } from "@/tracking/usage/usageMonitor";
import { getMapRenderer } from "@/tracking/providers/factory";
import {
  loadMapboxGl,
  resolveMapboxAccessToken,
  resolveMapboxStyleUrl,
  toMapboxRasterStyle,
} from "@/tracking/mapbox/mapboxLoader";

type LatLngTuple = [number, number];

interface MapboxSingleTripMapProps {
  center: LatLngTuple;
  riderPos?: LatLngTuple | null;
  destinationPos: LatLngTuple;
  routeGeometry?: LatLngTuple[];
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: (error: unknown) => void;
}

const ROUTE_SOURCE_ID = "trip-route-source";
const ROUTE_LAYER_ID = "trip-route-layer";

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
  const padding = options?.padding ?? 60;
  const maxZoom = options?.maxZoom ?? 16;
  const duration = options?.duration ?? 800;
  const singleZoom = options?.singleZoom ?? 15;
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

function toGeoJsonLine(positions: LatLngTuple[]) {
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

function makeMarkerElement(color: string, size = 14): HTMLDivElement {
  const el = document.createElement("div");
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.borderRadius = "9999px";
  el.style.background = color;
  el.style.border = "2px solid rgba(255,255,255,0.9)";
  el.style.boxShadow = "0 1px 8px rgba(0,0,0,0.35)";
  return el;
}

export default function MapboxSingleTripMap({
  center,
  riderPos,
  destinationPos,
  routeGeometry = [],
  className,
  style,
  onLoad,
  onError,
}: MapboxSingleTripMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const riderMarkerRef = useRef<any>(null);
  const destinationMarkerRef = useRef<any>(null);
  const loadedRef = useRef(false);
  const initErrorReportedRef = useRef(false);
  const onLoadRef = useRef<MapboxSingleTripMapProps["onLoad"]>(onLoad);
  const onErrorRef = useRef<MapboxSingleTripMapProps["onError"]>(onError);
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
    if (!containerRef.current) return;
    if (mapRef.current) return;

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
        if (token) {
          mapboxgl.accessToken = token;
        }
        const mapStyle = resolveMapboxStyleUrl();
        const styleValue = token
          ? mapStyle
          : toMapboxRasterStyle(fallbackMapRenderConfig.tileUrl, fallbackMapRenderConfig.attribution);
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: styleValue,
          center: [center[1], center[0]],
          zoom: 14,
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
        map.addControl(new mapboxgl.NavigationControl({ showZoom: true, showCompass: true }), "top-right");
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
                "line-width": 5,
                "line-opacity": 0.86,
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
      if (riderMarkerRef.current) riderMarkerRef.current.remove();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      loadedRef.current = false;
      initErrorReportedRef.current = false;
      hasInitialAutoFitRef.current = false;
    };
  }, [fallbackMapRenderConfig.attribution, fallbackMapRenderConfig.tileUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (hasInitialAutoFitRef.current) return;
    map.jumpTo({ center: [center[1], center[0]] });
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

    if (!destinationMarkerRef.current) {
      const mapboxgl = (window as any).mapboxgl;
      destinationMarkerRef.current = new mapboxgl.Marker({ element: makeMarkerElement("#ef4444", 16) });
    }
    destinationMarkerRef.current.setLngLat([destinationPos[1], destinationPos[0]]).addTo(map);
  }, [destinationPos]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    if (!riderPos) {
      if (riderMarkerRef.current) riderMarkerRef.current.remove();
      return;
    }
    if (!riderMarkerRef.current) {
      const mapboxgl = (window as any).mapboxgl;
      riderMarkerRef.current = new mapboxgl.Marker({ element: makeMarkerElement("#10b981", 16) });
    }
    riderMarkerRef.current.setLngLat([riderPos[1], riderPos[0]]).addTo(map);
  }, [riderPos]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points: Array<[number, number]> = [];
    if (riderPos) points.push([riderPos[1], riderPos[0]]);
    points.push([destinationPos[1], destinationPos[0]]);
    cameraPointsRef.current = points;
    const now = Date.now();
    if (now < autoCameraLockUntilRef.current) return;
    if (hasInitialAutoFitRef.current && now - lastAutoCameraAtRef.current < 1200) return;
    if (hasInitialAutoFitRef.current && points.every((point) => isPointVisibleWithMargin(map, point, 0.16))) return;
    fitMapToPoints(map, points, { padding: 60, maxZoom: 16, duration: 800, singleZoom: 15 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = Date.now();
  }, [destinationPos, riderPos]);

  const zoomIn = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
    map.zoomIn({ duration: 250 });
  };

  const zoomOut = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    autoCameraLockUntilRef.current = Date.now() + 10_000;
    map.zoomOut({ duration: 250 });
  };

  const recenterCamera = () => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    const points = cameraPointsRef.current;
    if (!points.length) return;
    autoCameraLockUntilRef.current = 0;
    fitMapToPoints(map, points, { padding: 60, maxZoom: 16, duration: 700, singleZoom: 15 });
    hasInitialAutoFitRef.current = true;
    lastAutoCameraAtRef.current = Date.now();
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
      <div className="pointer-events-none absolute right-3 top-3 z-[1300] flex flex-col gap-2">
        <button type="button" className="pointer-events-auto rounded bg-background/95 px-2 py-1 text-xs shadow" onClick={zoomIn} title="Zoom In">+</button>
        <button type="button" className="pointer-events-auto rounded bg-background/95 px-2 py-1 text-xs shadow" onClick={zoomOut} title="Zoom Out">-</button>
        <button type="button" className="pointer-events-auto rounded bg-background/95 px-2 py-1 text-xs shadow" onClick={recenterCamera} title="Recenter / Fit">Fit</button>
        <button type="button" className="pointer-events-auto rounded bg-background/95 px-2 py-1 text-xs shadow" onClick={togglePitch} title="Toggle 2D/3D">2D/3D</button>
        <button type="button" className="pointer-events-auto rounded bg-background/95 px-2 py-1 text-xs shadow" onClick={resetBearing} title="Reset North">N</button>
      </div>
    </div>
  );
}
