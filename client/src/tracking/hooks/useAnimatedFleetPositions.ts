import { useEffect, useState } from "react";
import { getVehicleAnimator } from "@/tracking/motion/vehicleAnimator";
import { ingestRealityGpsUpdate } from "@/tracking/reality/realityInput";

interface FleetInput {
  vehicleId: string;
  orderId?: string;
  latitude: number | null;
  longitude: number | null;
  speed?: number | null;
  heading?: number | null;
  timestamp?: string | null;
}

export function useAnimatedFleetPositions(input: FleetInput[]) {
  const [positions, setPositions] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    input.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      const animator = getVehicleAnimator(item.vehicleId);
      ingestRealityGpsUpdate({
        vehicleId: item.vehicleId,
        orderId: item.orderId,
        position: { lat: item.latitude, lng: item.longitude },
        speedMps: item.speed ?? 0,
        bearingDeg: item.heading ?? 0,
        timestampMs: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
      });
      animator.setReality({
        vehicleId: item.vehicleId,
        orderId: item.orderId,
        position: { lat: item.latitude, lng: item.longitude },
        speedMps: item.speed ?? 0,
        bearingDeg: item.heading ?? 0,
        timestampMs: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
      });
      const unsubscribe = animator.subscribe((state) => {
        if (!state.position) return;
        setPositions((prev) => ({
          ...prev,
          [item.vehicleId]: state.position!,
        }));
      });
      unsubscribers.push(unsubscribe);
    });

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [input]);

  return positions;
}
