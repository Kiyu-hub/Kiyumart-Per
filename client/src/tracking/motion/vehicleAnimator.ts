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

/**
 * Interpolates an angle in degrees along the shortest arc.
 * Used for smooth bearing rotation (avoids 359° -> 1° spinning).
 */
function lerpBearingDeg(from: number, to: number, alpha: number): number {
  let delta = ((to - from + 540) % 360) - 180;
  return (from + delta * alpha + 360) % 360;
}

class RouteSnappedVehicleAnimator implements VehicleAnimator {
  private listeners = new Set<(state: VehicleAnimatorState) => void>();
  private isRunning = false;
  private route?: RouteResult;
  private state: VehicleAnimatorState = { speedMps: 0, bearingDeg: 0 };
  private latestReality?: RealityGpsUpdate;
  private smoothedBearingDeg = 0;
  private smoothedSpeedMps = 0;
  private lastEmitMs = 0;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    attachAnimator(this);
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    detachAnimator(this);
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
      this.smoothedSpeedMps = normalizeSpeed(update.speedMps);
      this.smoothedBearingDeg = Number(update.bearingDeg ?? 0);
      this.state.speedMps = this.smoothedSpeedMps;
      this.state.bearingDeg = this.smoothedBearingDeg;
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
      // Hard snap but animate to the snap target smoothly 
      return lerpCoordinates(current, target, Math.min(0.95, maxMove / distance));
    }
    return lerpCoordinates(current, target, MOTION_CONFIG.predictionBlend);
  }

  tickFrame(dtSeconds: number) {
    const current = this.state.position;
    const latestReality = this.latestReality;
    if (current && latestReality) {
      const routeGeometry = this.route?.geometry || [];
      const targetPosition = routeGeometry.length
        ? closestPointOnRoute(latestReality.position, routeGeometry).point
        : latestReality.position;

      const realitySpeed = normalizeSpeed(latestReality.speedMps);
      
      // Exponential smoothing on speed (tau=0.6s for responsiveness)
      const speedAlpha = Math.min(1, dtSeconds / 0.6);
      this.smoothedSpeedMps = this.smoothedSpeedMps * (1 - speedAlpha) + realitySpeed * speedAlpha;
      const speedMps = Number.isFinite(this.smoothedSpeedMps) ? this.smoothedSpeedMps : 0;
      
      let next = current;
      if (routeGeometry.length >= 2 && speedMps > 0.2) {
        next = advanceAlongRoute(routeGeometry, current, speedMps * dtSeconds);
      }
      next = this.moveTowardTarget(next, targetPosition, dtSeconds);

      const distanceMoved = haversineMeters(current, next);
      const movementBearing = distanceMoved > 0.5 ? bearingDegrees(current, next) : this.smoothedBearingDeg;

      // Smooth bearing with exponential decay — avoids sharp rotations (tau=0.25s)
      const bearingAlpha = Math.min(1, dtSeconds / 0.25);
      this.smoothedBearingDeg = lerpBearingDeg(this.smoothedBearingDeg, movementBearing, bearingAlpha);

      this.state = {
        position: next,
        speedMps,
        bearingDeg: Number.isFinite(this.smoothedBearingDeg) ? this.smoothedBearingDeg : 0,
      };

      const now = Date.now();
      if (!this.lastEmitMs || now - this.lastEmitMs >= 100) {
        this.emit();
        this.lastEmitMs = now;
      }
    }
  }
}

const registry = new Map<string, RouteSnappedVehicleAnimator>();
const activeAnimators = new Set<RouteSnappedVehicleAnimator>();

// Run at 60fps for Uber-grade smoothness
const SHARED_FRAME_INTERVAL_MS = 1000 / 60;
let sharedRafId: number | null = null;
let sharedLastTickMs = 0;

function runSharedAnimationFrame(nowMs: number) {
  if (!activeAnimators.size) {
    sharedRafId = null;
    return;
  }

  if (!sharedLastTickMs) {
    sharedLastTickMs = nowMs;
  }

  const elapsedMs = nowMs - sharedLastTickMs;
  if (elapsedMs < SHARED_FRAME_INTERVAL_MS) {
    sharedRafId = requestAnimationFrame(runSharedAnimationFrame);
    return;
  }

  // Cap dt to prevent large jumps on tab resume
  const dtSeconds = Math.max(0.008, Math.min(0.1, elapsedMs / 1000));
  sharedLastTickMs = nowMs;

  activeAnimators.forEach((animator) => animator.tickFrame(dtSeconds));
  sharedRafId = requestAnimationFrame(runSharedAnimationFrame);
}

function attachAnimator(animator: RouteSnappedVehicleAnimator) {
  activeAnimators.add(animator);
  if (sharedRafId !== null) return;
  sharedLastTickMs = 0;
  sharedRafId = requestAnimationFrame(runSharedAnimationFrame);
}

function detachAnimator(animator: RouteSnappedVehicleAnimator) {
  activeAnimators.delete(animator);
  if (activeAnimators.size > 0) return;
  if (sharedRafId !== null) {
    cancelAnimationFrame(sharedRafId);
    sharedRafId = null;
  }
  sharedLastTickMs = 0;
}

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
