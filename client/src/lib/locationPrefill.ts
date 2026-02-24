type SavedLocation = {
  latitude: number;
  longitude: number;
  timestamp?: number;
};

export type ResolvedLocation = {
  address: string;
  city: string;
  region: string;
};

const LOCATION_STORAGE_KEY = "kiyumart_user_location";
const LOCATION_RESOLVED_CACHE_KEY = "kiyumart_user_location_resolved";

function isValidCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getSavedSignupLocation(): SavedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedLocation;
    if (!isValidCoordinate(parsed?.latitude) || !isValidCoordinate(parsed?.longitude)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getCachedResolvedLocation(latitude: number, longitude: number): ResolvedLocation | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LOCATION_RESOLVED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      latitude: number;
      longitude: number;
      resolved: ResolvedLocation;
    };
    if (
      !isValidCoordinate(parsed?.latitude) ||
      !isValidCoordinate(parsed?.longitude) ||
      !parsed?.resolved
    ) {
      return null;
    }
    // Only reuse cache for the same saved point.
    if (parsed.latitude === latitude && parsed.longitude === longitude) {
      return parsed.resolved;
    }
    return null;
  } catch {
    return null;
  }
}

function cacheResolvedLocation(latitude: number, longitude: number, resolved: ResolvedLocation) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCATION_RESOLVED_CACHE_KEY,
      JSON.stringify({ latitude, longitude, resolved }),
    );
  } catch {
    // Ignore client storage failures; prefill remains best-effort.
  }
}

export async function resolveSavedLocationToAddress(): Promise<ResolvedLocation | null> {
  const saved = getSavedSignupLocation();
  if (!saved) return null;

  const cached = getCachedResolvedLocation(saved.latitude, saved.longitude);
  if (cached) return cached;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(saved.latitude));
    url.searchParams.set("lon", String(saved.longitude));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "18");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();

    const addressObj = data?.address || {};
    const city =
      addressObj.city ||
      addressObj.town ||
      addressObj.village ||
      addressObj.municipality ||
      "";
    const region = addressObj.state || addressObj.region || addressObj.county || "";
    const address = data?.display_name || "";

    const resolved: ResolvedLocation = {
      address: String(address || "").trim(),
      city: String(city || "").trim(),
      region: String(region || "").trim(),
    };

    if (!resolved.address && !resolved.city && !resolved.region) return null;
    cacheResolvedLocation(saved.latitude, saved.longitude, resolved);
    return resolved;
  } catch {
    return null;
  }
}

