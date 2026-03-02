import type { RouteInstruction, RouteResult, RoutingEngine, RoutingRequest } from "@/tracking/interfaces";

function toMapboxInstructions(route: any): RouteInstruction[] {
  const instructions: RouteInstruction[] = [];
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  legs.forEach((leg: any) => {
    const steps = Array.isArray(leg?.steps) ? leg.steps : [];
    steps.forEach((step: any) => {
      const text = String(step?.maneuver?.instruction || step?.name || "Continue");
      const distanceMeters = Number(step?.distance || 0);
      instructions.push({ text, distanceMeters });
    });
  });
  return instructions;
}

function toOsrmInstructions(route: any): RouteInstruction[] {
  const instructions: RouteInstruction[] = [];
  const legs = Array.isArray(route?.legs) ? route.legs : [];
  legs.forEach((leg: any) => {
    const steps = Array.isArray(leg?.steps) ? leg.steps : [];
    steps.forEach((step: any) => {
      const type = String(step?.maneuver?.type || "continue");
      const modifier = String(step?.maneuver?.modifier || "").trim();
      const text = modifier ? `${type} ${modifier}` : type;
      const distanceMeters = Number(step?.distance || 0);
      instructions.push({ text, distanceMeters });
    });
  });
  return instructions;
}

function toMapboxRouteResult(payload: any): RouteResult {
  const route = payload?.routes?.[0];
  const geometry = Array.isArray(route?.geometry?.coordinates)
    ? route.geometry.coordinates.map((point: number[]) => ({ lat: Number(point[1]), lng: Number(point[0]) }))
    : [];
  const distanceMeters = Number(route?.distance || 0);
  const durationSeconds = Number(route?.duration || 0);
  const etaMinutes = Math.max(1, Math.round(durationSeconds / 60));
  return {
    geometry,
    instructions: toMapboxInstructions(route),
    distanceMeters,
    durationSeconds,
    etaMinutes,
    source: "MAPBOX_DIRECTIONS_PRIMARY",
  };
}

function toOsrmRouteResult(payload: any): RouteResult {
  const route = payload?.routes?.[0];
  const geometry = Array.isArray(route?.geometry?.coordinates)
    ? route.geometry.coordinates.map((point: number[]) => ({ lat: Number(point[1]), lng: Number(point[0]) }))
    : [];
  const distanceMeters = Number(route?.distance || 0);
  const durationSeconds = Number(route?.duration || 0);
  const etaMinutes = Math.max(1, Math.round(durationSeconds / 60));
  return {
    geometry,
    instructions: toOsrmInstructions(route),
    distanceMeters,
    durationSeconds,
    etaMinutes,
    source: "OSRM_FALLBACK",
  };
}

async function fetchMapboxRoute(request: RoutingRequest): Promise<RouteResult> {
  const token = String((import.meta.env as any).VITE_MAPBOX_ACCESS_TOKEN || "").trim();
  if (!token) {
    throw new Error("Missing VITE_MAPBOX_ACCESS_TOKEN for Mapbox Directions");
  }
  const profile = String((import.meta.env as any).VITE_MAPBOX_DIRECTIONS_PROFILE || "driving").trim();
  const coordinates = `${request.from.lng},${request.from.lat};${request.to.lng},${request.to.lat}`;
  const query = new URLSearchParams({
    alternatives: "false",
    geometries: "geojson",
    overview: "full",
    steps: "true",
    access_token: token,
  });
  const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordinates}?${query.toString()}`);
  if (!response.ok) {
    throw new Error(`Mapbox route request failed (${response.status})`);
  }
  const json = await response.json();
  if (json?.code !== "Ok" || !json?.routes?.[0]) {
    throw new Error("Mapbox Directions returned no route");
  }
  return toMapboxRouteResult(json);
}

async function fetchOsrmFallbackRoute(request: RoutingRequest): Promise<RouteResult> {
  const coordinates = `${request.from.lng},${request.from.lat};${request.to.lng},${request.to.lat}`;
  const query = "overview=full&geometries=geojson&steps=true";
  const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordinates}?${query}`);
  if (!response.ok) {
    throw new Error(`OSRM fallback request failed (${response.status})`);
  }
  const json = await response.json();
  if (json?.code !== "Ok" || !json?.routes?.[0]) {
    throw new Error("OSRM fallback returned no route");
  }
  return toOsrmRouteResult(json);
}

async function routeWithPrimaryAndFallback(request: RoutingRequest): Promise<RouteResult> {
  try {
    return await fetchMapboxRoute(request);
  } catch {
    return fetchOsrmFallbackRoute(request);
  }
}

export const osrmProviderA: RoutingEngine = {
  id: "PROVIDER_A",
  route: routeWithPrimaryAndFallback,
};

