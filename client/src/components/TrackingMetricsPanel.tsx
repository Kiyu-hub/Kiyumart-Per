import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { AppRole } from "@/tracking/interfaces";
import { useRoleTrackingMetrics } from "@/tracking/hooks/useRoleTrackingMetrics";

interface TrackingMetricsPanelProps {
  role: AppRole;
  title?: string;
}

export default function TrackingMetricsPanel({ role, title = "Real-Time Tracking Intelligence" }: TrackingMetricsPanelProps) {
  const metrics = useRoleTrackingMetrics(role);

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

