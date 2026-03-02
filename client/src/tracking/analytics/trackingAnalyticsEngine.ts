import type {
  AnalyticsEngine,
  AnalyticsSnapshot,
  AppRole,
  RoleMetric,
  VehicleSnapshot,
} from "@/tracking/interfaces";
import { dashboardAccessController } from "@/tracking/access/dashboardAccessController";
import { usageMonitor } from "@/tracking/usage/usageMonitor";

const STALE_AFTER_MS = 45_000;

class InMemoryTrackingAnalyticsEngine implements AnalyticsEngine {
  private vehicles = new Map<string, VehicleSnapshot>();
  private etaHistory = new Map<string, number[]>();

  ingestVehicleSnapshot(snapshot: VehicleSnapshot): void {
    this.vehicles.set(snapshot.vehicleId, snapshot);
    if (snapshot.eta?.minutes != null) {
      const existing = this.etaHistory.get(snapshot.vehicleId) || [];
      existing.push(snapshot.eta.minutes);
      if (existing.length > 8) existing.shift();
      this.etaHistory.set(snapshot.vehicleId, existing);
    }
  }

  getSnapshot(): AnalyticsSnapshot {
    const values = Array.from(this.vehicles.values());
    const now = Date.now();
    const staleVehicles = values.filter(
      (vehicle) => typeof vehicle.lastRealityUpdateMs === "number" && now - vehicle.lastRealityUpdateMs > STALE_AFTER_MS,
    ).length;
    const anomalies = values.filter((vehicle) => vehicle.deviation?.exceededThreshold).length;
    const deviations = values
      .map((vehicle) => Number(vehicle.deviation?.distanceFromRouteMeters || 0))
      .filter((value) => Number.isFinite(value));
    const averageDeviationMeters =
      deviations.length > 0 ? deviations.reduce((sum, value) => sum + value, 0) / deviations.length : 0;

    const etaVariances = Array.from(this.etaHistory.values()).map((series) => {
      if (series.length < 2) return 0;
      const avg = series.reduce((sum, value) => sum + value, 0) / series.length;
      const variance = series.reduce((sum, value) => sum + (value - avg) * (value - avg), 0) / series.length;
      return variance;
    });
    const avgVariance =
      etaVariances.length > 0 ? etaVariances.reduce((sum, value) => sum + value, 0) / etaVariances.length : 0;
    const etaStabilityScore = Math.max(0, Math.min(100, Math.round(100 - avgVariance * 12)));

    return {
      activeVehicles: values.length,
      staleVehicles,
      anomalyCount: anomalies,
      averageDeviationMeters: Number(averageDeviationMeters.toFixed(1)),
      etaStabilityScore,
      usage: usageMonitor.getSnapshot(),
    };
  }

  getRoleMetrics(role: AppRole): RoleMetric[] {
    const snapshot = this.getSnapshot();
    const metrics: RoleMetric[] = [
      { id: "active_vehicles", label: "Active Vehicles", value: String(snapshot.activeVehicles) },
      { id: "stale_vehicles", label: "Stale Streams", value: String(snapshot.staleVehicles) },
      { id: "anomaly_count", label: "Anomalies", value: String(snapshot.anomalyCount) },
      { id: "eta_stability", label: "ETA Stability", value: `${snapshot.etaStabilityScore}%` },
      { id: "avg_deviation", label: "Avg Deviation", value: `${Math.round(snapshot.averageDeviationMeters)}m` },
      { id: "route_usage", label: "Route Usage", value: `${snapshot.usage.routeUsagePct}%` },
      { id: "tile_usage", label: "Tile Usage", value: `${snapshot.usage.tileUsagePct}%` },
    ];
    return dashboardAccessController.filterMetrics(role, metrics);
  }
}

export const trackingAnalyticsEngine: AnalyticsEngine = new InMemoryTrackingAnalyticsEngine();

