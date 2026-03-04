import { create } from "zustand";
import type {
  CanonicalETA,
  Coordinates,
  DeviationMetrics,
  RealityGpsUpdate,
  RerouteReason,
  RouteResult,
  TripPhase,
  VehicleSnapshot,
} from "@/tracking/interfaces";

interface CanonicalTrackingState {
  vehicles: Record<string, VehicleSnapshot>;
  ensureVehicle: (vehicleId: string, defaults?: Partial<VehicleSnapshot>) => void;
  ingestGpsReality: (update: RealityGpsUpdate) => void;
  setPredictedPosition: (vehicleId: string, position: { lat: number; lng: number }, speedMps: number, bearingDeg: number) => void;
  setRoute: (vehicleId: string, route: RouteResult | undefined, reason: RerouteReason) => void;
  setTripPhase: (vehicleId: string, phase: TripPhase) => void;
  setEta: (vehicleId: string, eta: CanonicalETA) => void;
  setDeviation: (vehicleId: string, deviation: DeviationMetrics) => void;
  clearVehicle: (vehicleId: string) => void;
}

function patchVehicle(
  vehicles: Record<string, VehicleSnapshot>,
  vehicleId: string,
  patch: Partial<VehicleSnapshot>,
): Record<string, VehicleSnapshot> {
  const next = {
    ...(vehicles[vehicleId] || { vehicleId, tripPhase: "idle" as const }),
    ...patch,
  };
  return {
    ...vehicles,
    [vehicleId]: next,
  };
}

function sameNumber(a: number | undefined, b: number | undefined, epsilon = 0.000001): boolean {
  return Math.abs(Number(a ?? 0) - Number(b ?? 0)) <= epsilon;
}

function sameCoordinates(a?: Coordinates, b?: Coordinates, epsilon = 0.000001): boolean {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) <= epsilon && Math.abs(a.lng - b.lng) <= epsilon;
}

function sameEta(a?: CanonicalETA, b?: CanonicalETA): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    sameNumber(a.minutes, b.minutes, 0.001) &&
    sameNumber(a.distanceKm, b.distanceKm, 0.001) &&
    String(a.source || "") === String(b.source || "")
  );
}

function sameDeviation(a?: DeviationMetrics, b?: DeviationMetrics): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    sameNumber(a.distanceFromRouteMeters, b.distanceFromRouteMeters, 0.01) &&
    a.exceededThreshold === b.exceededThreshold &&
    sameNumber(a.thresholdMeters, b.thresholdMeters, 0.01)
  );
}

export const useCanonicalTrackingStore = create<CanonicalTrackingState>((set, get) => ({
  vehicles: {},

  ensureVehicle(vehicleId, defaults) {
    const existing = get().vehicles[vehicleId];
    if (existing) return;
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, vehicleId, defaults || {}),
    }));
  },

  ingestGpsReality(update) {
    set((state) => {
      const current = state.vehicles[update.vehicleId];
      const orderId = update.orderId || current?.orderId;
      const confirmedPosition = { ...update.position };
      const speedMps = Number(update.speedMps ?? current?.speedMps ?? 0);
      const bearingDeg = Number(update.bearingDeg ?? current?.bearingDeg ?? 0);
      const timestampMs = Number.isFinite(update.timestampMs) ? Number(update.timestampMs) : Date.now();

      if (current) {
        const sameOrder = String(current.orderId || "") === String(orderId || "");
        const samePosition = sameCoordinates(current.confirmedPosition, confirmedPosition, 0.0000005);
        const sameSpeed = sameNumber(current.speedMps, speedMps, 0.05);
        const sameBearing = sameNumber(current.bearingDeg, bearingDeg, 0.5);
        const elapsedSinceLastReality = timestampMs - Number(current.lastRealityUpdateMs ?? 0);
        if (sameOrder && samePosition && sameSpeed && sameBearing && elapsedSinceLastReality < 1000) {
          return state;
        }
      }

      return {
        vehicles: patchVehicle(state.vehicles, update.vehicleId, {
          orderId,
          confirmedPosition,
          speedMps,
          bearingDeg,
          lastRealityUpdateMs: timestampMs,
        }),
      };
    });
  },

  setPredictedPosition(vehicleId, position, speedMps, bearingDeg) {
    set((state) => {
      const current = state.vehicles[vehicleId];
      const samePosition = sameCoordinates(current?.predictedPosition, position, 0.0000005);
      const sameSpeed = sameNumber(current?.speedMps, speedMps, 0.05);
      const sameBearing = sameNumber(current?.bearingDeg, bearingDeg, 0.5);
      if (current && samePosition && sameSpeed && sameBearing) {
        return state;
      }
      return {
        vehicles: patchVehicle(state.vehicles, vehicleId, {
          predictedPosition: position,
          speedMps,
          bearingDeg,
        }),
      };
    });
  },

  setRoute(vehicleId, route, reason) {
    set((state) => {
      const current = state.vehicles[vehicleId];
      if (current?.route === route && current?.lastRerouteReason === reason) {
        return state;
      }
      return {
        vehicles: patchVehicle(state.vehicles, vehicleId, {
          route,
          lastRerouteReason: reason,
        }),
      };
    });
  },

  setTripPhase(vehicleId, phase) {
    set((state) => {
      const current = state.vehicles[vehicleId];
      if (current?.tripPhase === phase) return state;
      return {
        vehicles: patchVehicle(state.vehicles, vehicleId, { tripPhase: phase }),
      };
    });
  },

  setEta(vehicleId, eta) {
    set((state) => {
      const current = state.vehicles[vehicleId];
      if (current && sameEta(current.eta, eta)) return state;
      return {
        vehicles: patchVehicle(state.vehicles, vehicleId, { eta }),
      };
    });
  },

  setDeviation(vehicleId, deviation) {
    set((state) => {
      const current = state.vehicles[vehicleId];
      if (current && sameDeviation(current.deviation, deviation)) return state;
      return {
        vehicles: patchVehicle(state.vehicles, vehicleId, { deviation }),
      };
    });
  },

  clearVehicle(vehicleId) {
    set((state) => {
      if (!(vehicleId in state.vehicles)) return state;
      const next = { ...state.vehicles };
      delete next[vehicleId];
      return { vehicles: next };
    });
  },
}));
