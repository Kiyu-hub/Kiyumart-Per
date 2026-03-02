import { useEffect, useMemo, useState } from "react";
import type { AppRole, RoleMetric } from "@/tracking/interfaces";
import { trackingAnalyticsEngine } from "@/tracking/analytics/trackingAnalyticsEngine";
import { useCanonicalTrackingStore } from "@/tracking/state/canonicalTrackingStore";
import { useUsageMonitorSnapshot } from "@/tracking/hooks/useUsageMonitorSnapshot";

export function useRoleTrackingMetrics(role: AppRole): RoleMetric[] {
  const vehicles = useCanonicalTrackingStore((state) => state.vehicles);
  const usageSnapshot = useUsageMonitorSnapshot();
  const [metrics, setMetrics] = useState<RoleMetric[]>([]);

  const vehicleList = useMemo(() => Object.values(vehicles), [vehicles]);

  useEffect(() => {
    vehicleList.forEach((vehicle) => trackingAnalyticsEngine.ingestVehicleSnapshot(vehicle));
    setMetrics(trackingAnalyticsEngine.getRoleMetrics(role));
  }, [role, usageSnapshot, vehicleList]);

  return metrics;
}

