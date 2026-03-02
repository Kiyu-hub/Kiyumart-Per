import { useEffect, useMemo, useRef } from "react";
import { MOTION_CONFIG } from "@/tracking/config";
import type { Coordinates, RerouteReason, TripPhase } from "@/tracking/interfaces";
import { stableEtaService } from "@/tracking/eta/stableEtaService";
import { closestPointOnRoute, haversineMeters } from "@/tracking/motion/routeMath";
import { getVehicleAnimator } from "@/tracking/motion/vehicleAnimator";
import { getRoutingEngine } from "@/tracking/providers/factory";
import { ingestRealityGpsUpdate, ingestTripPhaseChange } from "@/tracking/reality/realityInput";
import { useCanonicalTrackingStore } from "@/tracking/state/canonicalTrackingStore";
import { usageMonitor } from "@/tracking/usage/usageMonitor";

interface UseVehicleTrackingArgs {
  vehicleId: string;
  orderId?: string;
  gps?: {
    lat: number;
    lng: number;
    speedMps?: number | null;
    bearingDeg?: number | null;
    timestampMs?: number;
  };
  destination?: Coordinates | null;
  tripPhase?: TripPhase;
}

function sameCoordinates(a?: Coordinates | null, b?: Coordinates | null): boolean {
  if (!a || !b) return false;
  return Math.abs(a.lat - b.lat) < 0.000001 && Math.abs(a.lng - b.lng) < 0.000001;
}

export function useVehicleTracking(args: UseVehicleTrackingArgs) {
  const vehicle = useCanonicalTrackingStore((state) => state.vehicles[args.vehicleId]);
  const setPredictedPosition = useCanonicalTrackingStore((state) => state.setPredictedPosition);
  const setRoute = useCanonicalTrackingStore((state) => state.setRoute);
  const setDeviation = useCanonicalTrackingStore((state) => state.setDeviation);
  const setEta = useCanonicalTrackingStore((state) => state.setEta);
  const ensureVehicle = useCanonicalTrackingStore((state) => state.ensureVehicle);

  const animator = useMemo(() => getVehicleAnimator(args.vehicleId), [args.vehicleId]);
  const routingEngine = useMemo(() => getRoutingEngine(), []);
  const routeRequestAtRef = useRef(0);
  const destinationRef = useRef<Coordinates | null>(null);
  const tripPhaseRef = useRef<TripPhase | undefined>(undefined);
  const etaRequestAtRef = useRef(0);
  const lastEtaPositionRef = useRef<Coordinates | null>(null);
  const lastEtaPhaseRef = useRef<TripPhase | undefined>(undefined);

  useEffect(() => {
    ensureVehicle(args.vehicleId, { orderId: args.orderId });
  }, [args.vehicleId, args.orderId, ensureVehicle]);

  useEffect(() => {
    const unsubscribe = animator.subscribe((state) => {
      if (state.position) {
        setPredictedPosition(args.vehicleId, state.position, state.speedMps, state.bearingDeg);
      }
    });
    return () => {
      unsubscribe();
    };
  }, [animator, args.vehicleId, setPredictedPosition]);

  useEffect(() => {
    if (!args.tripPhase) return;
    ingestTripPhaseChange(args.vehicleId, args.tripPhase);
  }, [args.vehicleId, args.tripPhase]);

  useEffect(() => {
    if (!args.gps) return;
    ingestRealityGpsUpdate({
      vehicleId: args.vehicleId,
      orderId: args.orderId,
      position: { lat: args.gps.lat, lng: args.gps.lng },
      speedMps: args.gps.speedMps,
      bearingDeg: args.gps.bearingDeg,
      timestampMs: args.gps.timestampMs || Date.now(),
    });
    animator.setReality({
      vehicleId: args.vehicleId,
      orderId: args.orderId,
      position: { lat: args.gps.lat, lng: args.gps.lng },
      speedMps: args.gps.speedMps,
      bearingDeg: args.gps.bearingDeg,
      timestampMs: args.gps.timestampMs || Date.now(),
    });
  }, [animator, args.vehicleId, args.orderId, args.gps]);

  useEffect(() => {
    const requestRoute = async (reason: RerouteReason) => {
      if (!args.destination) return;
      const from = vehicle?.predictedPosition || vehicle?.confirmedPosition;
      if (!from) return;
      if (usageMonitor.getSnapshot().disableReroute && reason === "deviation") return;
      routeRequestAtRef.current = Date.now();
      usageMonitor.trackRouteCall();
      try {
        const route = await routingEngine.route({
          from,
          to: args.destination,
          reason,
        });
        setRoute(args.vehicleId, route, reason);
        animator.setRoute(route);
      } catch {
        // Keep current route on failures to avoid visual regressions.
      }
    };

    const destinationChanged = !sameCoordinates(destinationRef.current, args.destination || null);
    const phaseChanged = args.tripPhase && args.tripPhase !== tripPhaseRef.current;

    if (destinationChanged && args.destination) {
      destinationRef.current = args.destination;
      void requestRoute("destination_set");
    } else if (phaseChanged && args.destination) {
      void requestRoute("phase_change");
    }

    if (args.tripPhase) {
      tripPhaseRef.current = args.tripPhase;
    }
  }, [animator, args.destination, args.tripPhase, args.vehicleId, routingEngine, setRoute, vehicle?.confirmedPosition, vehicle?.predictedPosition]);

  useEffect(() => {
    if (!vehicle?.route?.geometry?.length || !vehicle.predictedPosition) return;
    const deviation = closestPointOnRoute(vehicle.predictedPosition, vehicle.route.geometry);
    const exceeded = deviation.distanceMeters > MOTION_CONFIG.routeDeviationThresholdMeters;
    setDeviation(args.vehicleId, {
      distanceFromRouteMeters: Number(deviation.distanceMeters.toFixed(1)),
      exceededThreshold: exceeded,
      thresholdMeters: MOTION_CONFIG.routeDeviationThresholdMeters,
    });

    if (exceeded && Date.now() - routeRequestAtRef.current > MOTION_CONFIG.rerouteThrottleMs && args.destination) {
      if (!usageMonitor.getSnapshot().disableReroute) {
        routeRequestAtRef.current = Date.now();
        usageMonitor.trackRouteCall();
        routingEngine
          .route({
            from: vehicle.predictedPosition,
            to: args.destination,
            reason: "deviation",
          })
          .then((route) => {
            setRoute(args.vehicleId, route, "deviation");
            animator.setRoute(route);
          })
          .catch(() => {
            // Keep previous route in place.
          });
      }
    }
  }, [animator, args.destination, args.vehicleId, routingEngine, setDeviation, setRoute, vehicle?.predictedPosition, vehicle?.route?.geometry]);

  useEffect(() => {
    if (!args.orderId || !vehicle?.predictedPosition) return;
    const now = Date.now();
    const sinceLastRequest = now - etaRequestAtRef.current;
    const movedMeters = lastEtaPositionRef.current
      ? haversineMeters(lastEtaPositionRef.current, vehicle.predictedPosition)
      : Number.POSITIVE_INFINITY;
    const phaseChanged = args.tripPhase !== lastEtaPhaseRef.current;
    const canRefreshForMovement = movedMeters >= 25;
    const canRefreshForTime = sinceLastRequest >= MOTION_CONFIG.etaMinRefreshMs;
    if (!phaseChanged && !canRefreshForMovement && !canRefreshForTime) {
      return;
    }
    etaRequestAtRef.current = now;
    lastEtaPositionRef.current = vehicle.predictedPosition;
    lastEtaPhaseRef.current = args.tripPhase;
    stableEtaService
      .getStableEta({
        orderId: args.orderId,
        vehicleId: args.vehicleId,
        riderLat: vehicle.predictedPosition.lat,
        riderLng: vehicle.predictedPosition.lng,
        speed: vehicle.speedMps,
        tripPhase: args.tripPhase,
      })
      .then((eta) => {
        if (!vehicle.eta) {
          setEta(args.vehicleId, eta);
          return;
        }
        const distanceDiff = Math.abs(vehicle.eta.distanceKm - eta.distanceKm);
        const minuteDiff = Math.abs(vehicle.eta.minutes - eta.minutes);
        if (distanceDiff < 0.05 && minuteDiff < 1) {
          return;
        }
        setEta(args.vehicleId, eta);
      })
      .catch(() => {
        // Non-blocking fallback: keep last stable ETA.
      });
  }, [args.orderId, args.tripPhase, args.vehicleId, setEta, vehicle?.eta, vehicle?.predictedPosition, vehicle?.speedMps]);

  return vehicle;
}
