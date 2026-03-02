import { MOTION_CONFIG } from "@/tracking/config";
import type { CanonicalETA, ETARequest, ETAService } from "@/tracking/interfaces";
import { fetchOrderEta } from "@/lib/eta";

type EtaCacheValue = {
  eta: CanonicalETA;
  lastFetchMs: number;
  tripPhase?: string;
};

const cache = new Map<string, EtaCacheValue>();

function blendEta(previous: CanonicalETA, incoming: CanonicalETA): CanonicalETA {
  const distanceDiff = Math.abs(previous.distanceKm - incoming.distanceKm);
  const minutesDiff = Math.abs(previous.minutes - incoming.minutes);
  if (minutesDiff < 1 && distanceDiff < 0.15) {
    return previous;
  }
  return {
    minutes: Math.max(1, Math.round(previous.minutes * 0.65 + incoming.minutes * 0.35)),
    distanceKm: Number((previous.distanceKm * 0.6 + incoming.distanceKm * 0.4).toFixed(2)),
    source: incoming.source,
    calculatedAtMs: incoming.calculatedAtMs,
  };
}

class CalmEtaService implements ETAService {
  async getStableEta(request: ETARequest): Promise<CanonicalETA> {
    const cacheKey = `${request.orderId}:${request.vehicleId}`;
    const nowMs = Date.now();
    const cached = cache.get(cacheKey);
    const minRefreshMs = MOTION_CONFIG.etaMinRefreshMs;
    const samePhase = cached?.tripPhase === request.tripPhase;

    if (cached && samePhase && nowMs - cached.lastFetchMs < minRefreshMs) {
      return cached.eta;
    }

    const fresh = await fetchOrderEta({
      orderId: request.orderId,
      riderLat: request.riderLat,
      riderLng: request.riderLng,
      speed: request.speed,
    });

    const incoming: CanonicalETA = {
      minutes: Math.max(1, Math.round(Number(fresh.etaMinutes || 0))),
      distanceKm: Number(Number(fresh.distanceKm || 0).toFixed(2)),
      source: String(fresh.source || "backend"),
      calculatedAtMs: Date.now(),
    };

    const stable = cached ? blendEta(cached.eta, incoming) : incoming;
    cache.set(cacheKey, { eta: stable, lastFetchMs: nowMs, tripPhase: request.tripPhase });
    return stable;
  }
}

export const stableEtaService: ETAService = new CalmEtaService();

