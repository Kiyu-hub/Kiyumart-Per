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
  const positionsRef = useRef<Record<string, { lat: number; lng: number }>>({});
  const pendingPositionsRef = useRef<Record<string, { lat: number; lng: number }>>({});
  const animationFrameRef = useRef<number | null>(null);
  const lastUpdateMsRef = useRef<number>(0);

  const flushPendingPositions = () => {
    const now = Date.now();
    if (now - lastUpdateMsRef.current < 100) {
      // Throttle to 10 FPS to prevent React from freezing
      animationFrameRef.current = window.requestAnimationFrame(flushPendingPositions);
      return;
    }
    lastUpdateMsRef.current = now;
    animationFrameRef.current = null;
    const queued = pendingPositionsRef.current;
    const vehicleIds = Object.keys(queued);
    if (!vehicleIds.length) return;
    pendingPositionsRef.current = {};

    setPositions((prev) => {
      let changed = false;
      let next = prev;
      vehicleIds.forEach((vehicleId) => {
        const queuedPosition = queued[vehicleId];
        const current = prev[vehicleId];
        if (
          current &&
          Math.abs(current.lat - queuedPosition.lat) < 0.0000005 &&
          Math.abs(current.lng - queuedPosition.lng) < 0.0000005
        ) {
          return;
        }
        if (!changed) {
          next = { ...prev };
          changed = true;
        }
        next[vehicleId] = queuedPosition;
      });
      if (!changed) return prev;
      positionsRef.current = next;
      return next;
    });
  };

  const queuePositionUpdate = (vehicleId: string, position: { lat: number; lng: number }) => {
    const current = pendingPositionsRef.current[vehicleId] || positionsRef.current[vehicleId];
    if (
      current &&
      Math.abs(current.lat - position.lat) < 0.0000005 &&
      Math.abs(current.lng - position.lng) < 0.0000005
    ) {
      return;
    }
    pendingPositionsRef.current[vehicleId] = position;
    if (animationFrameRef.current === null) {
      animationFrameRef.current = window.requestAnimationFrame(flushPendingPositions);
    }
  };

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
          queuePositionUpdate(item.vehicleId, state.position);
        });
        unsubscribersRef.current.set(item.vehicleId, unsubscribe);
      }
    });

    const removedIds: string[] = [];
    unsubscribersRef.current.forEach((unsubscribe, vehicleId) => {
      if (seenIds.has(vehicleId)) return;
      unsubscribe();
      unsubscribersRef.current.delete(vehicleId);
      lastRealitySignatureRef.current.delete(vehicleId);
      delete pendingPositionsRef.current[vehicleId];
      removedIds.push(vehicleId);
    });

    if (removedIds.length) {
      setPositions((prev) => {
        let changed = false;
        const next = { ...prev };
        removedIds.forEach((vehicleId) => {
          if (!(vehicleId in next)) return;
          changed = true;
          delete next[vehicleId];
        });
        if (!changed) return prev;
        positionsRef.current = next;
        return next;
      });
    }

  }, [input]);

  useEffect(() => {
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      unsubscribersRef.current.forEach((unsubscribe) => unsubscribe());
      unsubscribersRef.current.clear();
      lastRealitySignatureRef.current.clear();
      pendingPositionsRef.current = {};
      positionsRef.current = {};
    };
  }, []);

  return positions;
}
