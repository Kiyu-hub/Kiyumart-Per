import { USE_PROVIDER } from "@/tracking/config";

function asNumber(value: unknown): number {
  return Number(value);
}

export function buildExternalNavigationUrl(params: {
  lat: number;
  lng: number;
  destinationLat?: number;
  destinationLng?: number;
}): string {
  const lat = asNumber(params.lat);
  const lng = asNumber(params.lng);
  const destinationLat = params.destinationLat != null ? asNumber(params.destinationLat) : null;
  const destinationLng = params.destinationLng != null ? asNumber(params.destinationLng) : null;

  if (USE_PROVIDER === "PROVIDER_A") {
    if (destinationLat != null && destinationLng != null) {
      const profile = String((import.meta.env as any).VITE_MAPBOX_DIRECTIONS_PROFILE || "driving");
      return `https://www.mapbox.com/directions/?profile=${encodeURIComponent(profile)}&origin=${lat},${lng}&destination=${destinationLat},${destinationLng}`;
    }
    return `https://www.mapbox.com/search/?query=${lat},${lng}`;
  }

  if (destinationLat != null && destinationLng != null) {
    return `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${lat}%2C${lng}%3B${destinationLat}%2C${destinationLng}`;
  }
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

