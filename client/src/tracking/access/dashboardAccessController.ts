import type { AppRole, DashboardAccessController, RoleMetric } from "@/tracking/interfaces";

const permissions: Record<AppRole, Set<string>> = {
  buyer: new Set(["eta_stability"]),
  seller: new Set(["active_vehicles", "eta_stability", "anomaly_count"]),
  rider: new Set(["eta_stability", "avg_deviation"]),
  agent: new Set(["active_vehicles", "stale_vehicles", "anomaly_count", "eta_stability"]),
  admin: new Set(["active_vehicles", "stale_vehicles", "anomaly_count", "eta_stability", "avg_deviation", "route_usage"]),
  super_admin: new Set([
    "active_vehicles",
    "stale_vehicles",
    "anomaly_count",
    "eta_stability",
    "avg_deviation",
    "route_usage",
    "tile_usage",
  ]),
};

class RoleBasedDashboardAccessController implements DashboardAccessController {
  canViewMetric(role: AppRole, metricId: string): boolean {
    return permissions[role]?.has(metricId) || false;
  }

  filterMetrics(role: AppRole, metrics: RoleMetric[]): RoleMetric[] {
    return metrics.filter((metric) => this.canViewMetric(role, metric.id));
  }
}

export const dashboardAccessController: DashboardAccessController = new RoleBasedDashboardAccessController();

