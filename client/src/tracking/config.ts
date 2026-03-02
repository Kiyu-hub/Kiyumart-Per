import type { ProviderId } from "@/tracking/interfaces";

const envProvider = String((import.meta.env as any).VITE_MAP_PROVIDER || "PROVIDER_A").toUpperCase();

export const USE_PROVIDER: ProviderId = envProvider === "PROVIDER_B" ? "PROVIDER_B" : "PROVIDER_A";

export const TRACKING_BUDGETS = {
  tileLoads: Number((import.meta.env as any).VITE_TRACKING_TILE_BUDGET || 150000),
  routeCalls: Number((import.meta.env as any).VITE_TRACKING_ROUTE_BUDGET || 2500),
  mapInstantiations: Number((import.meta.env as any).VITE_TRACKING_MAP_BUDGET || 4000),
};

export const TRACKING_THRESHOLDS = [60, 80, 90] as const;

export const MOTION_CONFIG = {
  maxCorrectionMetersPerSecond: 24,
  predictionBlend: 0.18,
  hardSnapDistanceMeters: 160,
  routeDeviationThresholdMeters: 65,
  rerouteThrottleMs: 45_000,
  etaMinRefreshMs: 15_000,
};

