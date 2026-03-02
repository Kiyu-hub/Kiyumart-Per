import { useEffect, useMemo, useRef } from "react";
import { usageMonitor } from "@/tracking/usage/usageMonitor";
import { getMapRenderer } from "@/tracking/providers/factory";
import { loadMapboxGl, resolveMapboxAccessToken, toMapboxRasterStyle } from "@/tracking/mapbox/mapboxLoader";

interface FleetRiderMarker {
  riderId: string;
  latitude: number;
  longitude: number;
}

interface FleetOrderMarker {
  id: string;
  latitude: number;
  longitude: number;
}

interface MapboxFleetMapProps {
  center: [number, number];
  riders: FleetRiderMarker[];
  pendingOrders: FleetOrderMarker[];
  routeGeometry?: [number, number][];
  selectedDestination?: [number, number] | null;
  className?: string;
  style?: React.CSSProperties;
  onRiderClick?: (riderId: string) => void;
  onOrderClick?: (orderId: string) => void;
  onLoad?: () => void;
  onError?: (error: unknown) => void;
}

const ROUTE_SOURCE_ID = "fleet-route-source";
const ROUTE_LAYER_ID = "fleet-route-layer";

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
  riders,
  pendingOrders,
  routeGeometry = [],
  selectedDestination,
  className,
  style,
  onRiderClick,
  onOrderClick,
  onLoad,
  onError,
}: MapboxFleetMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const riderMarkersRef = useRef<Map<string, any>>(new Map());
  const orderMarkersRef = useRef<Map<string, any>>(new Map());
  const destinationMarkerRef = useRef<any>(null);
  const loadedRef = useRef(false);

  const mapStyle = useMemo(
    () => String((import.meta.env as any).VITE_MAPBOX_STYLE_URL || "mapbox://styles/mapbox/dark-v11"),
    [],
  );
  const fallbackMapRenderConfig = useMemo(() => getMapRenderer().getRenderConfig(), []);

  useEffect(() => {
    let disposed = false;
    if (!containerRef.current || mapRef.current) return;

    (async () => {
      try {
        const mapboxgl = await loadMapboxGl();
        const token = resolveMapboxAccessToken();
        if (disposed || !containerRef.current) return;
        if (token) {
          mapboxgl.accessToken = token;
        }
        const styleValue = token
          ? mapStyle
          : toMapboxRasterStyle(fallbackMapRenderConfig.tileUrl, fallbackMapRenderConfig.attribution);
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: styleValue,
          center: [center[1], center[0]],
          zoom: 12,
          pitch: 42,
          antialias: true,
        });
        mapRef.current = map;
        usageMonitor.trackMapInstantiation();
        map.on("sourcedata", () => usageMonitor.trackTileLoad());
        map.on("load", () => {
          if (disposed) return;
          loadedRef.current = true;
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
                "line-width": 4,
                "line-opacity": 0.85,
              },
            });
          }
        });
      } catch (error) {
        onError?.(error);
      }
    })();

    return () => {
      disposed = true;
      riderMarkersRef.current.forEach((marker) => marker.remove());
      orderMarkersRef.current.forEach((marker) => marker.remove());
      riderMarkersRef.current.clear();
      orderMarkersRef.current.clear();
      if (destinationMarkerRef.current) destinationMarkerRef.current.remove();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, fallbackMapRenderConfig.attribution, fallbackMapRenderConfig.tileUrl, mapStyle, onError, onLoad]);

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
      if (!marker) {
        const el = makeMarkerElement("#10b981", 12);
        el.style.cursor = "pointer";
        el.addEventListener("click", () => onRiderClick?.(rider.riderId));
        marker = new mapboxgl.Marker({ element: el });
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
    const points: Array<[number, number]> = [];
    riders.forEach((rider) => points.push([rider.longitude, rider.latitude]));
    pendingOrders.forEach((order) => points.push([order.longitude, order.latitude]));
    if (selectedDestination) {
      points.push([selectedDestination[1], selectedDestination[0]]);
    }
    if (!points.length) return;
    if (points.length === 1) {
      map.easeTo({ center: points[0], zoom: 14, duration: 700 });
      return;
    }
    const mapboxgl = (window as any).mapboxgl;
    const bounds = new mapboxgl.LngLatBounds(points[0], points[0]);
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, { padding: 50, maxZoom: 15, duration: 900 });
  }, [pendingOrders, riders, selectedDestination]);

  return <div ref={containerRef} className={className} style={style} />;
}
