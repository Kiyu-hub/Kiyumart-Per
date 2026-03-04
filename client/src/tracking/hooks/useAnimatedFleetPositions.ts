import { useEffect, useRef, useState } from "react";
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
  const unsubscribersRef = useRef<Map<string, () => void>>(new Map());
  const lastRealitySignatureRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    const seenIds = new Set<string>();

    input.forEach((item) => {
      if (item.latitude == null || item.longitude == null) return;
      seenIds.add(item.vehicleId);
      const animator = getVehicleAnimator(item.vehicleId);
      const timestampMs = item.timestamp ? new Date(item.timestamp).getTime() : Date.now();
      const reality = {
        vehicleId: item.vehicleId,
        orderId: item.orderId,
        position: { lat: item.latitude, lng: item.longitude },
        speedMps: item.speed ?? 0,
        bearingDeg: item.heading ?? 0,
        timestampMs,
      };
      const signature = [
        reality.orderId || "",
        reality.position.lat,
        reality.position.lng,
        reality.speedMps,
        reality.bearingDeg,
        reality.timestampMs,
      ].join("|");
      if (lastRealitySignatureRef.current.get(item.vehicleId) !== signature) {
        lastRealitySignatureRef.current.set(item.vehicleId, signature);
        ingestRealityGpsUpdate(reality);
        animator.setReality(reality);
      }

      if (!unsubscribersRef.current.has(item.vehicleId)) {
        const unsubscribe = animator.subscribe((state) => {
          if (!state.position) return;
          setPositions((prev) => {
            const current = prev[item.vehicleId];
            if (
              current &&
              Math.abs(current.lat - state.position!.lat) < 0.0000005 &&
              Math.abs(current.lng - state.position!.lng) < 0.0000005
            ) {
              return prev;
            }
            return {
              ...prev,
              [item.vehicleId]: state.position!,
            };
          });
        });
        unsubscribersRef.current.set(item.vehicleId, unsubscribe);
      }
    });

    unsubscribersRef.current.forEach((unsubscribe, vehicleId) => {
      if (seenIds.has(vehicleId)) return;
      unsubscribe();
      unsubscribersRef.current.delete(vehicleId);
      lastRealitySignatureRef.current.delete(vehicleId);
      setPositions((prev) => {
        if (!(vehicleId in prev)) return prev;
        const next = { ...prev };
        delete next[vehicleId];
        return next;
      });
    });

  }, [input]);

  useEffect(() => {
    return () => {
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current.clear();
      lastRealitySignatureRef.current.clear();
    };
  }, []);

  return positions;
}
