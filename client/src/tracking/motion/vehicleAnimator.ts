import { MOTION_CONFIG } from "@/tracking/config";
import type { RealityGpsUpdate, RouteResult, VehicleAnimator, VehicleAnimatorState } from "@/tracking/interfaces";
import {
  advanceAlongRoute,
  bearingDegrees,
  closestPointOnRoute,
  haversineMeters,
  lerpCoordinates,
} from "@/tracking/motion/routeMath";

function normalizeSpeed(speedMps?: number | null): number {
  const value = Number(speedMps ?? 0);
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

class RouteSnappedVehicleAnimator implements VehicleAnimator {
  private listeners = new Set<(state: VehicleAnimatorState) => void>();
  private rafId: number | null = null;
  private lastTickMs = 0;
  private route?: RouteResult;
  private state: VehicleAnimatorState = { speedMps: 0, bearingDeg: 0 };
  private latestReality?: RealityGpsUpdate;

  start() {
    if (this.rafId !== null) return;
    this.lastTickMs = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  setRoute(route: RouteResult | undefined) {
    this.route = route;
    if (route?.geometry?.length && this.state.position) {
      this.state.position = closestPointOnRoute(this.state.position, route.geometry).point;
      this.emit();
    }
  }

  setReality(update: RealityGpsUpdate) {
    this.latestReality = update;
    if (!this.state.position) {
      this.state.position = { ...update.position };
      this.state.speedMps = normalizeSpeed(update.speedMps);
      this.state.bearingDeg = Number(update.bearingDeg ?? 0);
      if (this.route?.geometry?.length) {
        this.state.position = closestPointOnRoute(this.state.position, this.route.geometry).point;
      }
      this.emit();
    }
  }

  getState(): VehicleAnimatorState {
    return this.state;
  }

  subscribe(listener: (state: VehicleAnimatorState) => void): () => void {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.start();
    }
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) {
        this.stop();
      }
    };
  }

  private emit() {
    this.listeners.forEach((listener) => listener(this.state));
  }

  private moveTowardTarget(current: { lat: number; lng: number }, target: { lat: number; lng: number }, dtSeconds: number) {
    const distance = haversineMeters(current, target);
    if (distance <= 0.25) return target;
    const maxMove = Math.max(1, MOTION_CONFIG.maxCorrectionMetersPerSecond * dtSeconds);
    if (distance > MOTION_CONFIG.hardSnapDistanceMeters) {
      return lerpCoordinates(current, target, Math.min(1, maxMove / distance));
    }
    return lerpCoordinates(current, target, MOTION_CONFIG.predictionBlend);
  }

  private tick = (nowMs: number) => {
    const dtSeconds = Math.max(0.016, Math.min(0.25, (nowMs - this.lastTickMs) / 1000));
    this.lastTickMs = nowMs;

    const current = this.state.position;
    const latestReality = this.latestReality;
    if (current && latestReality) {
      const routeGeometry = this.route?.geometry || [];
      const targetPosition = routeGeometry.length
        ? closestPointOnRoute(latestReality.position, routeGeometry).point
        : latestReality.position;

      const realitySpeed = normalizeSpeed(latestReality.speedMps);
      const blendedSpeed = this.state.speedMps * 0.75 + realitySpeed * 0.25;
      const speedMps = Number.isFinite(blendedSpeed) ? blendedSpeed : 0;
      let next = current;

      if (routeGeometry.length >= 2 && speedMps > 0.2) {
        next = advanceAlongRoute(routeGeometry, current, speedMps * dtSeconds);
      }
      next = this.moveTowardTarget(next, targetPosition, dtSeconds);

      const distanceMoved = haversineMeters(current, next);
      const movementBearing = distanceMoved > 0.8 ? bearingDegrees(current, next) : this.state.bearingDeg;

      this.state = {
        position: next,
        speedMps,
        bearingDeg: Number.isFinite(movementBearing) ? movementBearing : 0,
      };
      this.emit();
    }

    this.rafId = requestAnimationFrame(this.tick);
  };
}

const registry = new Map<string, RouteSnappedVehicleAnimator>();

export function getVehicleAnimator(vehicleId: string): VehicleAnimator {
  const existing = registry.get(vehicleId);
  if (existing) return existing;
  const animator = new RouteSnappedVehicleAnimator();
  registry.set(vehicleId, animator);
  return animator;
}

export function removeVehicleAnimator(vehicleId: string): void {
  const animator = registry.get(vehicleId);
  if (!animator) return;
  animator.stop();
  registry.delete(vehicleId);
}
