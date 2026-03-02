import type { RouteResult, RoutingEngine, RoutingRequest } from "@/tracking/interfaces";

function toRouteResult(payload: any): RouteResult {
  const route = payload?.routes?.[0];
  const geometry = Array.isArray(route?.geometry?.coordinates)
    ? route.geometry.coordinates.map((point: number[]) => ({ lat: Number(point[1]), lng: Number(point[0]) }))
    : [];
  const distanceMeters = Number(route?.distance || 0);
  const durationSeconds = Number(route?.duration || 0);
  const etaMinutes = Math.max(1, Math.round(durationSeconds / 60));

  return {
    geometry,
    instructions: [],
    distanceMeters,
    durationSeconds,
    etaMinutes,
    source: "OSRM_PROVIDER_B",
  };
}

async function fetchOsrmRoute(request: RoutingRequest): Promise<RouteResult> {
  const coordinates = `${request.from.lng},${request.from.lat};${request.to.lng},${request.to.lat}`;
  const query = "overview=full&geometries=geojson&steps=true";
  const response = await fetch(`https://routing.openstreetmap.de/routed-car/route/v1/driving/${coordinates}?${query}`);
  if (!response.ok) {
    throw new Error(`Route request failed (${response.status})`);
  }
  const json = await response.json();
  if (json?.code !== "Ok") {
    throw new Error("Route provider returned no route");
  }
  return toRouteResult(json);
}

export const osrmProviderB: RoutingEngine = {
  id: "PROVIDER_B",
  route: fetchOsrmRoute,
};

