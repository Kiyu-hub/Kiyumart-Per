import type { RealityGpsUpdate, TripPhase } from "@/tracking/interfaces";
import { useCanonicalTrackingStore } from "@/tracking/state/canonicalTrackingStore";

export function ingestRealityGpsUpdate(update: RealityGpsUpdate): void {
  useCanonicalTrackingStore.getState().ensureVehicle(update.vehicleId, {
    orderId: update.orderId,
  });
  useCanonicalTrackingStore.getState().ingestGpsReality(update);
}

export function ingestTripPhaseChange(vehicleId: string, phase: TripPhase): void {
  useCanonicalTrackingStore.getState().ensureVehicle(vehicleId);
  useCanonicalTrackingStore.getState().setTripPhase(vehicleId, phase);
}

export function ingestNetworkEvent(vehicleId: string, orderId?: string): void {
  useCanonicalTrackingStore.getState().ensureVehicle(vehicleId, { orderId });
}

