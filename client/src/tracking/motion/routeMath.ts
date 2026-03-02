import type { Coordinates } from "@/tracking/interfaces";

const EARTH_RADIUS_M = 6_371_000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function bearingDegrees(a: Coordinates, b: Coordinates): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLng = toRadians(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const brng = (toDegrees(Math.atan2(y, x)) + 360) % 360;
  return Number.isFinite(brng) ? brng : 0;
}

export function lerpCoordinates(a: Coordinates, b: Coordinates, alpha: number): Coordinates {
  const t = Math.max(0, Math.min(1, alpha));
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lng: a.lng + (b.lng - a.lng) * t,
  };
}

type XY = { x: number; y: number };

function toXY(point: Coordinates): XY {
  // Equirectangular approximation for local route snapping.
  const x = point.lng * Math.cos(toRadians(point.lat));
  const y = point.lat;
  return { x, y };
}

function fromXY(value: XY): Coordinates {
  return { lat: value.y, lng: value.x };
}

export function closestPointOnRoute(
  point: Coordinates,
  route: Coordinates[],
): { point: Coordinates; distanceMeters: number } {
  if (route.length === 0) return { point, distanceMeters: 0 };
  if (route.length === 1) {
    return { point: route[0], distanceMeters: haversineMeters(point, route[0]) };
  }

  const p = toXY(point);
  let best = route[0];
  let bestDist = Number.POSITIVE_INFINITY;

  for (let i = 0; i < route.length - 1; i += 1) {
    const a = toXY(route[i]);
    const b = toXY(route[i + 1]);
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const apx = p.x - a.x;
    const apy = p.y - a.y;
    const denom = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom));
    const proj = { x: a.x + abx * t, y: a.y + aby * t };
    const candidate = fromXY(proj);
    const dist = haversineMeters(point, candidate);
    if (dist < bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }

  return { point: best, distanceMeters: bestDist };
}

export function advanceAlongRoute(route: Coordinates[], current: Coordinates, distanceMeters: number): Coordinates {
  if (route.length < 2 || distanceMeters <= 0) return current;

  let remaining = distanceMeters;
  let cursor = closestPointOnRoute(current, route).point;

  for (let i = 0; i < route.length - 1; i += 1) {
    const segmentStart = route[i];
    const segmentEnd = route[i + 1];
    const segmentLength = haversineMeters(segmentStart, segmentEnd);
    if (segmentLength < 1) continue;

    const fromCursorToSegmentEnd = haversineMeters(cursor, segmentEnd);
    if (fromCursorToSegmentEnd > segmentLength + 1) continue;

    if (remaining <= fromCursorToSegmentEnd) {
      const alpha = remaining / fromCursorToSegmentEnd;
      return lerpCoordinates(cursor, segmentEnd, alpha);
    }

    remaining -= fromCursorToSegmentEnd;
    cursor = segmentEnd;
  }

  return route[route.length - 1];
}

