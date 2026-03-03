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

  const fallbackMapRenderConfig = useMemo(() => getMapRenderer().getRenderConfig(), []);

  useEffect(() => {
    let disposed = false;
    if (!containerRef.current) return;
    if (mapRef.current) return;

    (async () => {
      try {
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
        mapRef.current = map;
        usageMonitor.trackMapInstantiation();
        map.on("sourcedata", () => usageMonitor.trackTileLoad());
        map.on("error", (event: any) => {
          if (disposed || initErrorReportedRef.current || loadedRef.current) return;
          const errorPayload = event?.error || event || new Error("Mapbox map failed to initialize.");
          initErrorReportedRef.current = true;
          onError?.(errorPayload);
        });
        map.on("load", () => {
          if (disposed) return;
          loadedRef.current = true;
          initErrorReportedRef.current = false;
          onLoad?.();
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
        initErrorReportedRef.current = true;
        onError?.(error);
      }
    })();

    return () => {
      disposed = true;
      if (riderMarkerRef.current) riderMarkerRef.current.remove();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      loadedRef.current = false;
      initErrorReportedRef.current = false;
    };
  }, [center, fallbackMapRenderConfig.attribution, fallbackMapRenderConfig.tileUrl, onError, onLoad]);

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
    if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: 15, duration: 700 });
      return;
    }
    const mapboxgl = (window as any).mapboxgl;
    const bounds = new mapboxgl.LngLatBounds(points[0], points[0]);
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 800 });
  }, [destinationPos, riderPos]);

  return <div ref={containerRef} className={className} style={style} />;
}
