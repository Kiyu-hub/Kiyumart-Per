import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRole, RoleMetric } from "@/tracking/interfaces";
import { useRoleTrackingMetrics } from "@/tracking/hooks/useRoleTrackingMetrics";

interface TrackingMetricsPanelProps {
  role: AppRole;
  title?: string;
}

type SystemHealthResponse = {
  pipeline?: {
    activeOrders?: number;
    searchingRider?: number;
    inTransit?: number;
  };
  assignment?: {
    activeAttempts?: number;
    failedAttempts?: number;
  };
  tracking?: {
    staleGpsOrders?: number;
  };
  alerts?: {
    overloadedRiders?: Array<{ riderId: string; activeOrders: number }>;
  };
  presence?: {
    onlineUsers?: number;
  };
};

export default function TrackingMetricsPanel({ role, title = "Real-Time Tracking Intelligence" }: TrackingMetricsPanelProps) {
  const fallbackMetrics = useRoleTrackingMetrics(role);
  const isAdminRole = role === "admin" || role === "super_admin";

  const { data: systemHealth } = useQuery<SystemHealthResponse | null>({
    queryKey: ["/api/admin/system-health", "tracking-metrics"],
    queryFn: async () => {
      const res = await fetch("/api/admin/system-health", { credentials: "include", cache: "no-store" });
      if (res.status === 401 || res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to load fleet intelligence metrics");
      return res.json();
    },
    enabled: isAdminRole,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const dbBackedMetrics = useMemo<RoleMetric[]>(() => {
    if (!systemHealth) return [];
    const activeOrders = Number(systemHealth.pipeline?.activeOrders || 0);
    const searchingRider = Number(systemHealth.pipeline?.searchingRider || 0);
    const inTransit = Number(systemHealth.pipeline?.inTransit || 0);
    const staleGpsOrders = Number(systemHealth.tracking?.staleGpsOrders || 0);
    const activeAttempts = Number(systemHealth.assignment?.activeAttempts || 0);
    const failedAttempts = Number(systemHealth.assignment?.failedAttempts || 0);
    const overloadedRiders = Array.isArray(systemHealth.alerts?.overloadedRiders)
      ? systemHealth.alerts?.overloadedRiders.length
      : 0;
    const onlineUsers = Number(systemHealth.presence?.onlineUsers || 0);

    return [
      { id: "active_orders", label: "Active Orders", value: String(activeOrders) },
      { id: "searching_rider", label: "Searching Rider", value: String(searchingRider) },
      { id: "in_transit", label: "In Transit", value: String(inTransit) },
      { id: "stale_gps_orders", label: "Stale GPS", value: String(staleGpsOrders) },
      { id: "active_attempts", label: "Active Assignments", value: String(activeAttempts) },
      { id: "failed_attempts", label: "Failed Attempts", value: String(failedAttempts) },
      { id: "overloaded_riders", label: "Overloaded Riders", value: String(overloadedRiders) },
      { id: "online_users", label: "Online Users", value: String(onlineUsers) },
    ];
  }, [systemHealth]);

  const metrics = dbBackedMetrics.length > 0 ? dbBackedMetrics : fallbackMetrics;

  if (!metrics.length) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>Provider-agnostic, role-scoped live transport metrics.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {metrics.map((metric) => (
            <div key={metric.id} className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-lg font-semibold">{metric.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
