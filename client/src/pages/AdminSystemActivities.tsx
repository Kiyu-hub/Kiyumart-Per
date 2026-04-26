import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Download, RefreshCw, Search, ShieldAlert, Loader2, Wrench } from "lucide-react";

type Severity = "info" | "warning" | "error" | "critical";
type StatusFilter = "all" | "open" | "resolved";

interface SystemActivitySummary {
  totalActivities: number;
  activeIssues: number;
  criticalErrors: number;
}

interface SystemActivityRow {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  message: string;
  humanExplanation?: string | null;
  rootCause?: string | null;
  suggestedFix?: string | null;
  preventiveAction?: string | null;
  source?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  fingerprint?: string | null;
  occurrenceCount?: number | null;
  isResolved: boolean;
  firstSeenAt?: string | null;
  lastSeenAt?: string | null;
  resolvedAt?: string | null;
  metadata?: Record<string, any> | null;
}

const CATEGORY_OPTIONS = [
  "all",
  "api",
  "auth",
  "user",
  "product",
  "order",
  "payment",
  "payout",
  "media",
  "security",
  "worker",
  "webhook",
  "database",
  "system",
] as const;

function severityBadgeVariant(severity: Severity) {
  if (severity === "critical" || severity === "error") return "destructive" as const;
  if (severity === "warning") return "secondary" as const;
  return "outline" as const;
}

export default function AdminSystemActivities() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [category, setCategory] = useState<string>("all");
  const [severity, setSeverity] = useState<string>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [isAutoFixing, setIsAutoFixing] = useState(false);

  const normalizedRole = useMemo(() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  }, [user?.role]);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (normalizedRole !== "admin" && normalizedRole !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, normalizedRole]);

  const focusId = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("focus");
  }, []);

  const summaryQuery = useQuery<SystemActivitySummary>({
    queryKey: ["/api/admin/system-activities/summary"],
    queryFn: () =>
      fetchSameOriginJson<SystemActivitySummary>("/api/admin/system-activities/summary", {
        cache: "no-store",
      }),
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const activitiesQuery = useQuery<SystemActivityRow[]>({
    queryKey: ["/api/admin/system-activities", category, severity, status, search],
    queryFn: () => {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (category !== "all") params.set("category", category);
      if (severity !== "all") params.set("severity", severity);
      if (status !== "all") params.set("status", status);
      if (search.trim()) params.set("search", search.trim());
      return fetchSameOriginJson<SystemActivityRow[]>(`/api/admin/system-activities?${params.toString()}`, {
        cache: "no-store",
      });
    },
    enabled: isAuthenticated && (normalizedRole === "admin" || normalizedRole === "super_admin"),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    staleTime: 5000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) =>
      fetchSameOriginJson(`/api/admin/system-activities/${id}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/system-activities/summary"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/admin/system-activities"] });
      setResolvingId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error?.message || "Could not update the issue status right now.",
        variant: "destructive",
      });
      setResolvingId(null);
    },
  });

  const handleAutoFix = async () => {
    try {
      setIsAutoFixing(true);
      const res = await fetch("/api/admin/system-health/auto-fix", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Auto-fix failed");
      const { fixedCount, errorCount, fixes } = data as {
        fixedCount: number;
        errorCount: number;
        fixes: Array<{ name: string; status: string; detail?: string }>;
      };
      toast({
        title: fixedCount > 0 ? `Auto-Fix: ${fixedCount} fix(es) applied` : "Auto-Fix: Nothing needed fixing",
        description: errorCount > 0
          ? `${errorCount} check(s) failed. See results below.`
          : fixes.map(f => `${f.name}: ${f.detail || f.status}`).join(" • ").slice(0, 200),
      });
      void summaryQuery.refetch();
      void activitiesQuery.refetch();
    } catch (error: any) {
      toast({ title: "Auto-Fix Failed", description: error?.message || "Unknown error", variant: "destructive" });
    } finally {
      setIsAutoFixing(false);
    }
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);
      const response = await fetch("/api/admin/system-activities/export", {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || "Could not export system activities right now.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `system-activities-${Date.now()}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error?.message || "Could not export system activities right now.",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  useEffect(() => {
    if (!focusId || !activitiesQuery.data?.length) return;
    const match = activitiesQuery.data.find((row) => row.id === focusId);
    if (!match) return;
    setExpandedId(match.id);
    requestAnimationFrame(() => {
      document.getElementById(`system-activity-${match.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [activitiesQuery.data, focusId]);

  if (authLoading) {
    return <PageLoadingState title="Loading system activities" description="Checking admin access and observability data." />;
  }

  if (!isAuthenticated || (normalizedRole !== "admin" && normalizedRole !== "super_admin")) {
    return <PageLoadingState title="Redirecting" description="Taking you to the correct access point." />;
  }

  const summary = summaryQuery.data || { totalActivities: 0, activeIssues: 0, criticalErrors: 0 };
  const activities = activitiesQuery.data || [];

  return (
    <DashboardLayout role={normalizedRole === "super_admin" ? "super_admin" : "admin"}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">System Activities</h1>
            <p className="text-muted-foreground">
              Monitor platform activity, investigate issues, and resolve repeated failures from one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                void summaryQuery.refetch();
                void activitiesQuery.refetch();
              }}
              data-testid="button-refresh-system-activities"
              disabled={summaryQuery.isFetching || activitiesQuery.isFetching}
            >
              {(summaryQuery.isFetching || activitiesQuery.isFetching) ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {summaryQuery.isFetching || activitiesQuery.isFetching ? "Refreshing" : "Refresh"}
            </Button>
            {normalizedRole === "super_admin" && (
              <Button
                onClick={handleAutoFix}
                type="button"
                variant="outline"
                data-testid="button-auto-fix"
                disabled={isAutoFixing}
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              >
                {isAutoFixing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {isAutoFixing ? "Fixing..." : "Auto-Fix"}
              </Button>
            )}
            <Button onClick={handleExport} type="button" data-testid="button-export-system-activities" disabled={isExporting}>
              {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {isExporting ? "Exporting" : "Export"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Activities</CardDescription>
              <CardTitle className="text-4xl">{summary.totalActivities}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active Issues</CardDescription>
              <CardTitle className="text-4xl">{summary.activeIssues}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Critical Errors</CardDescription>
              <CardTitle className="text-4xl">{summary.criticalErrors}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Search and narrow the live feed by category, severity, and issue state.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2 md:col-span-4">
              <Label htmlFor="system-activity-search">Search</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="system-activity-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9"
                  placeholder="Search titles, causes, or sources"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option === "all" ? "All categories" : option.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Severity</Label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger>
                  <SelectValue placeholder="All severities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severities</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warning">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open issues</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {activitiesQuery.isLoading && !activities.length ? (
            <PageLoadingState title="Loading activity feed" description="Gathering the latest platform events and issue signals." />
          ) : activities.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
                <CheckCircle2 className="h-10 w-10 text-primary" />
                <div>
                  <p className="text-lg font-semibold">No matching activities</p>
                  <p className="text-sm text-muted-foreground">
                    Try widening the filters or search to inspect more platform events.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            activities.map((activity) => {
              const isExpanded = expandedId === activity.id;
              const isFocused = focusId === activity.id;
              return (
                <Card
                  key={activity.id}
                  id={`system-activity-${activity.id}`}
                  className={isFocused ? "border-primary shadow-sm ring-1 ring-primary/30" : undefined}
                >
                  <CardHeader className="gap-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={severityBadgeVariant(activity.severity)}>{activity.severity}</Badge>
                          <Badge variant="outline">{activity.category}</Badge>
                          {!activity.isResolved ? (
                            <Badge variant="secondary">Open</Badge>
                          ) : (
                            <Badge variant="outline">Resolved</Badge>
                          )}
                          {Number(activity.occurrenceCount || 1) > 1 ? (
                            <Badge variant="outline">{activity.occurrenceCount} repeats</Badge>
                          ) : null}
                        </div>
                        <CardTitle className="text-xl">{activity.title}</CardTitle>
                        <CardDescription>{activity.message}</CardDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          type="button"
                          onClick={() => setExpandedId(isExpanded ? null : activity.id)}
                          data-testid={`button-toggle-system-activity-${activity.id}`}
                        >
                          {isExpanded ? "Hide Details" : "View Details"}
                        </Button>
                        <Button
                          variant={activity.isResolved ? "outline" : "default"}
                          type="button"
                          onClick={() => {
                            setResolvingId(activity.id);
                            resolveMutation.mutate({ id: activity.id, resolved: !activity.isResolved });
                          }}
                          disabled={resolveMutation.isPending && resolvingId === activity.id}
                          data-testid={`button-resolve-system-activity-${activity.id}`}
                        >
                          {resolveMutation.isPending && resolvingId === activity.id ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          ) : null}
                          {activity.isResolved ? "Reopen" : "Mark Resolved"}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  {isExpanded ? (
                    <CardContent className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-semibold">What happened</p>
                          <p className="text-sm text-muted-foreground">
                            {activity.humanExplanation || activity.message}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Why it happened</p>
                          <p className="text-sm text-muted-foreground">
                            {activity.rootCause || "The activity was captured, but no root cause was recorded yet."}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Suggested fix</p>
                          <p className="text-sm text-muted-foreground">
                            {activity.suggestedFix || "No suggested fix was recorded yet."}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Prevent recurrence</p>
                          <p className="text-sm text-muted-foreground">
                            {activity.preventiveAction || "No preventive action was recorded yet."}
                          </p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <p className="text-sm font-semibold">Technical context</p>
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <p><span className="font-medium text-foreground">Source:</span> {activity.source || "Not specified"}</p>
                            <p><span className="font-medium text-foreground">Entity:</span> {activity.entityType || "N/A"} {activity.entityId ? `(${activity.entityId})` : ""}</p>
                            <p><span className="font-medium text-foreground">Actor:</span> {activity.actorRole || "N/A"} {activity.actorId ? `(${activity.actorId})` : ""}</p>
                            <p><span className="font-medium text-foreground">First seen:</span> {activity.firstSeenAt || "N/A"}</p>
                            <p><span className="font-medium text-foreground">Last seen:</span> {activity.lastSeenAt || "N/A"}</p>
                            <p><span className="font-medium text-foreground">Resolved at:</span> {activity.resolvedAt || "Not resolved"}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Technical details</p>
                          <pre className="mt-2 max-h-64 overflow-auto rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground whitespace-pre-wrap break-words">
                            {JSON.stringify(activity.metadata || {}, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </CardContent>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>

        {summary.criticalErrors > 0 ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-start gap-3 py-5">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="font-semibold">Critical issues need attention</p>
                <p className="text-sm text-muted-foreground">
                  Open the matching records above, confirm the root cause, and resolve them only after the live issue is fully contained.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
