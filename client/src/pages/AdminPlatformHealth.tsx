import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, Database, Wifi, Users, CreditCard, AlertTriangle, CheckCircle2, Clock, Server, Cpu, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface HealthData {
  timestamp: string;
  uptime: { seconds: number; days: number; hours: number; minutes: number; label: string };
  database: { status: string; latencyMs: number };
  sockets: { activeConnections: number };
  sessions: { active30Min: number };
  payments: { last24hTotal: number; successful: number; failed: number; totalRevenue24h: number };
  errors: { criticalLast24h: number; monitoringAvailable: boolean };
  nodeVersion: string;
  memoryMb: number;
}

function StatusDot({ ok }: { ok: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`} />;
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  status,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  status?: "ok" | "warn" | "error";
  className?: string;
}) {
  return (
    <Card className={cn("border-border/70", className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{label}</p>
            <p className="text-2xl font-bold truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl shrink-0",
            status === "error" ? "bg-destructive/10 text-destructive" :
            status === "warn" ? "bg-amber-500/10 text-amber-600" :
            "bg-primary/10 text-primary"
          )}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        {status && (
          <div className="mt-3 flex items-center gap-1.5">
            <StatusDot ok={status === "ok"} />
            <span className={`text-xs font-medium ${status === "ok" ? "text-emerald-600" : status === "warn" ? "text-amber-600" : "text-destructive"}`}>
              {status === "ok" ? "Healthy" : status === "warn" ? "Warning" : "Critical"}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPlatformHealth() {
  const { user } = useAuth();
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery<HealthData>({
    queryKey: ["/api/admin/platform-health"],
    queryFn: async () => {
      const r = await fetch("/api/admin/platform-health", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch health data");
      return r.json();
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    staleTime: 25_000,
  });

  useEffect(() => {
    if (data) setLastUpdated(new Date());
  }, [data]);

  const dbOk = data?.database.status === "healthy";
  const dbLatency = data?.database.latencyMs ?? 0;
  const latencyStatus = dbLatency < 100 ? "ok" : dbLatency < 500 ? "warn" : "error";
  const paymentSuccessRate = data
    ? data.payments.last24hTotal > 0
      ? Math.round((data.payments.successful / data.payments.last24hTotal) * 100)
      : 100
    : 0;
  const criticalErrors = data?.errors.criticalLast24h ?? 0;

  return (
    <DashboardLayout role={user?.role === "super_admin" ? "super_admin" : "admin"}>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6 text-primary" />
              Platform Health
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Live infrastructure and system metrics — refreshes every 30s
            </p>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Overall status banner */}
            <Card className={cn(
              "border-2",
              !dbOk || criticalErrors > 0
                ? "border-destructive/40 bg-destructive/5"
                : "border-emerald-500/40 bg-emerald-500/5"
            )}>
              <CardContent className="p-4 flex items-center gap-3">
                {(!dbOk || criticalErrors > 0) ? (
                  <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                )}
                <div>
                  <p className="font-semibold text-sm">
                    {(!dbOk || criticalErrors > 0) ? "Platform Issues Detected" : "All Systems Operational"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {data?.uptime.label ? `Uptime: ${data.uptime.label}` : ""}
                    {data?.timestamp ? ` · Last checked: ${new Date(data.timestamp).toLocaleTimeString()}` : ""}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Core metrics grid */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={Database}
                label="Database"
                value={dbOk ? "Connected" : "Error"}
                sub={`${dbLatency}ms response time`}
                status={dbOk ? latencyStatus : "error"}
              />
              <MetricCard
                icon={Wifi}
                label="Active Socket Connections"
                value={data?.sockets.activeConnections ?? 0}
                sub="Real-time WebSocket clients"
                status="ok"
              />
              <MetricCard
                icon={Users}
                label="Active Sessions (30m)"
                value={data?.sessions.active30Min ?? 0}
                sub="Users active in last 30 minutes"
                status={data ? "ok" : "ok"}
              />
              <MetricCard
                icon={Clock}
                label="Server Uptime"
                value={data?.uptime.label ?? "—"}
                sub={`Node.js ${data?.nodeVersion ?? ""}`}
                status="ok"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                icon={CreditCard}
                label="Payments (Last 24h)"
                value={data?.payments.last24hTotal ?? 0}
                sub={`${data?.payments.successful ?? 0} succeeded · ${data?.payments.failed ?? 0} failed`}
                status={
                  data?.payments.failed && data.payments.failed > 0 && paymentSuccessRate < 90 ? "warn" :
                  data?.payments.failed && data.payments.failed > 5 ? "error" : "ok"
                }
              />
              <MetricCard
                icon={CreditCard}
                label="Revenue (Last 24h)"
                value={`GHS ${(data?.payments.totalRevenue24h ?? 0).toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                sub={`${paymentSuccessRate}% payment success rate`}
                status="ok"
              />
              <MetricCard
                icon={AlertTriangle}
                label="Critical Errors (24h)"
                value={criticalErrors}
                sub={data?.errors.monitoringAvailable ? "From system activity log" : "Activity log unavailable"}
                status={criticalErrors === 0 ? "ok" : criticalErrors < 5 ? "warn" : "error"}
              />
              <MetricCard
                icon={Cpu}
                label="Memory Usage"
                value={`${data?.memoryMb ?? 0} MB`}
                sub="RSS (resident set size)"
                status={
                  (data?.memoryMb ?? 0) < 256 ? "ok" :
                  (data?.memoryMb ?? 0) < 512 ? "warn" : "error"
                }
              />
            </div>

            {/* Payment breakdown */}
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Payment Activity — Last 24 Hours</CardTitle>
                <CardDescription>All payment events processed by the platform</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border bg-muted/30 p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">{data?.payments.successful ?? 0}</p>
                    <p className="text-sm text-muted-foreground mt-1">Successful</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4 text-center">
                    <p className="text-3xl font-bold text-destructive">{data?.payments.failed ?? 0}</p>
                    <p className="text-sm text-muted-foreground mt-1">Failed</p>
                  </div>
                  <div className="rounded-xl border bg-muted/30 p-4 text-center">
                    <p className="text-3xl font-bold">{data?.payments.last24hTotal ?? 0}</p>
                    <p className="text-sm text-muted-foreground mt-1">Total Attempts</p>
                  </div>
                </div>
                <div className="mt-4 h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${paymentSuccessRate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">{paymentSuccessRate}% payment success rate</p>
              </CardContent>
            </Card>

            {/* DB health detail */}
            <Card className="border-border/70">
              <CardHeader>
                <CardTitle className="text-base">Infrastructure Detail</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { label: "Database Status", value: data?.database.status ?? "—", ok: dbOk },
                    { label: "DB Response Time", value: `${data?.database.latencyMs ?? 0}ms`, ok: dbLatency < 300 },
                    { label: "Socket.IO Connections", value: String(data?.sockets.activeConnections ?? 0), ok: true },
                    { label: "Node.js Version", value: data?.nodeVersion ?? "—", ok: true },
                    { label: "Process Memory (RSS)", value: `${data?.memoryMb ?? 0} MB`, ok: (data?.memoryMb ?? 0) < 512 },
                    { label: "Server Uptime", value: data?.uptime.label ?? "—", ok: true },
                  ].map(({ label, value, ok }) => (
                    <div key={label} className="flex items-center justify-between rounded-lg border border-border/60 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusDot ok={ok} />
                        <span className="text-sm text-muted-foreground">{label}</span>
                      </div>
                      <span className="text-sm font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
