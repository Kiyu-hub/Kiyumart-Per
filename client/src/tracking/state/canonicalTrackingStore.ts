import { create } from "zustand";
import type {
  CanonicalETA,
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
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, update.vehicleId, {
        orderId: update.orderId || state.vehicles[update.vehicleId]?.orderId,
        confirmedPosition: { ...update.position },
        speedMps: Number(update.speedMps ?? state.vehicles[update.vehicleId]?.speedMps ?? 0),
        bearingDeg: Number(update.bearingDeg ?? state.vehicles[update.vehicleId]?.bearingDeg ?? 0),
        lastRealityUpdateMs: update.timestampMs,
      }),
    }));
  },

  setPredictedPosition(vehicleId, position, speedMps, bearingDeg) {
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, vehicleId, {
        predictedPosition: position,
        speedMps,
        bearingDeg,
      }),
    }));
  },

  setRoute(vehicleId, route, reason) {
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, vehicleId, {
        route,
        lastRerouteReason: reason,
      }),
    }));
  },

  setTripPhase(vehicleId, phase) {
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, vehicleId, { tripPhase: phase }),
    }));
  },

  setEta(vehicleId, eta) {
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, vehicleId, { eta }),
    }));
  },

  setDeviation(vehicleId, deviation) {
    set((state) => ({
      vehicles: patchVehicle(state.vehicles, vehicleId, { deviation }),
    }));
  },

  clearVehicle(vehicleId) {
    set((state) => {
      const next = { ...state.vehicles };
      delete next[vehicleId];
      return { vehicles: next };
    });
  },
}));

