import { useMemo } from "react";
import type { AppRole, RoleMetric } from "@/tracking/interfaces";
import { trackingAnalyticsEngine } from "@/tracking/analytics/trackingAnalyticsEngine";
import { useCanonicalTrackingStore } from "@/tracking/state/canonicalTrackingStore";
import { useUsageMonitorSnapshot } from "@/tracking/hooks/useUsageMonitorSnapshot";

export function useRoleTrackingMetrics(role: AppRole): RoleMetric[] {
  const vehicles = useCanonicalTrackingStore((state) => state.vehicles);
  const usageSnapshot = useUsageMonitorSnapshot();
  const vehicleList = useMemo(() => Object.values(vehicles), [vehicles]);
  const usageSignature = `${usageSnapshot.tileLoads}|${usageSnapshot.routeCalls}|${usageSnapshot.mapInstantiations}|${usageSnapshot.tileUsagePct}|${usageSnapshot.routeUsagePct}|${usageSnapshot.mapUsagePct}`;

  return useMemo(() => {
    vehicleList.forEach((vehicle) => trackingAnalyticsEngine.ingestVehicleSnapshot(vehicle));
    return trackingAnalyticsEngine.getRoleMetrics(role);
  }, [role, usageSignature, vehicleList]);
}
