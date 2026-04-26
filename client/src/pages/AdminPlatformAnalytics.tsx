import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Loader2, BarChart3, Eye, AlertTriangle, RefreshCw, ExternalLink, MousePointer2 } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

interface GA4Row {
  date?: string;
  sessions?: string;
  totalUsers?: string;
  newUsers?: string;
  screenPageViews?: string;
  purchaseRevenue?: string;
  conversions?: string;
  averageSessionDuration?: string;
  bounceRate?: string;
}

interface TopPage {
  pagePath?: string;
  pageTitle?: string;
  screenPageViews?: string;
  sessions?: string;
}

interface GA4Report {
  configured: boolean;
  message?: string;
  error?: string;
  range?: string;
  timeSeries?: GA4Row[];
  topPages?: TopPage[];
  totals?: Record<string, string>;
}

type Range = "7daysAgo" | "28daysAgo" | "90daysAgo";

const RANGE_LABELS: Record<Range, string> = {
  "7daysAgo": "Last 7 days",
  "28daysAgo": "Last 28 days",
  "90daysAgo": "Last 90 days",
};

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-border/70 bg-card p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

const fmt = (v: string | undefined, decimals = 0) =>
  v ? Number(v).toLocaleString("en-GH", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) : "0";

const fmtDate = (v: string | undefined) => {
  if (!v || v.length !== 8) return v ?? "";
  return `${v.slice(4, 6)}/${v.slice(6, 8)}`;
};

export default function AdminPlatformAnalytics() {
  const { user } = useAuth();
  const [range, setRange] = useState<Range>("28daysAgo");

  const { data: analyticsConfig } = useQuery<{ googleAnalyticsId: string | null; microsoftClarityId: string | null }>({
    queryKey: ["/api/public/analytics-config"],
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const { data, isLoading, isFetching, refetch } = useQuery<GA4Report>({
    queryKey: ["/api/admin/ga4-report", range],
    queryFn: async () => {
      const r = await fetch(`/api/admin/ga4-report?range=${range}`, { credentials: "include" });
      return r.json();
    },
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
  });

  const timeSeries = (data?.timeSeries ?? []).map((row) => ({
    date: fmtDate(row.date),
    sessions: Number(row.sessions ?? 0),
    users: Number(row.totalUsers ?? 0),
    pageviews: Number(row.screenPageViews ?? 0),
    revenue: Number(row.purchaseRevenue ?? 0),
  }));

  const topPages = (data?.topPages ?? []).slice(0, 10);
  const totals = data?.totals ?? {};
  const avgDuration = totals.averageSessionDuration
    ? `${Math.floor(Number(totals.averageSessionDuration) / 60)}m ${Math.round(Number(totals.averageSessionDuration) % 60)}s`
    : "—";

  const clarityProjectId = analyticsConfig?.microsoftClarityId;

  return (
    <DashboardLayout role={user?.role === "super_admin" ? "super_admin" : "admin"}>
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Tracking & Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              GA4 performance data and Microsoft Clarity insights — all within the platform
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border overflow-hidden">
              {(Object.keys(RANGE_LABELS) as Range[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${range === r ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {RANGE_LABELS[r]}
                </button>
              ))}
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : !data?.configured ? (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-6 flex items-start gap-4">
              <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="font-semibold">Google Analytics 4 Not Configured</p>
                <p className="text-sm text-muted-foreground">{data?.message}</p>
                <div className="text-xs font-mono bg-muted rounded-lg p-3 space-y-1">
                  <p>GA4_PROPERTY_ID=123456789</p>
                  <p>GOOGLE_CREDENTIALS_JSON={"{"}"type":"service_account","client_email":"...","private_key":"..."{"}"}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Create a service account in Google Cloud Console, grant it Viewer access to your GA4 property, then add these env vars in Render.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : data?.error ? (
          <Card className="border-destructive/30 bg-destructive/5">
            <CardContent className="p-6 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <p className="text-sm">{data.error}</p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* KPI tiles */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Stat label="Sessions" value={fmt(totals.sessions)} sub={RANGE_LABELS[range]} />
              <Stat label="Total Users" value={fmt(totals.totalUsers)} sub={`${fmt(totals.newUsers)} new`} />
              <Stat label="Page Views" value={fmt(totals.screenPageViews)} sub="Total screen views" />
              <Stat
                label="Revenue"
                value={`GHS ${fmt(totals.purchaseRevenue, 2)}`}
                sub={`${fmt(totals.conversions)} conversions`}
              />
              <Stat label="Avg Session Duration" value={avgDuration} sub="Per session" />
              <Stat
                label="Bounce Rate"
                value={totals.bounceRate ? `${(Number(totals.bounceRate) * 100).toFixed(1)}%` : "—"}
                sub="Single-page sessions"
              />
            </div>

            {/* Sessions + Users area chart */}
            {timeSeries.length > 0 && (
              <Card className="border-border/70">
                <CardHeader>
                  <CardTitle className="text-base">Sessions & Users Over Time</CardTitle>
                  <CardDescription>{RANGE_LABELS[range]}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={timeSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="grad-sessions" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                          </linearGradient>
                          <linearGradient id="grad-users" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="sessions" stroke="hsl(var(--primary))" fill="url(#grad-sessions)" strokeWidth={2} name="Sessions" />
                        <Area type="monotone" dataKey="users" stroke="#10b981" fill="url(#grad-users)" strokeWidth={2} name="Users" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Pages + Revenue */}
            <div className="grid gap-4 xl:grid-cols-2">
              {topPages.length > 0 && (
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-base">Top Pages</CardTitle>
                    <CardDescription>By page views</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {topPages.map((p, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground w-5 shrink-0 text-right">{i + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{p.pagePath || "/"}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                            <Eye className="h-3 w-3" />
                            {fmt(p.screenPageViews)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {timeSeries.some((r) => r.revenue > 0) && (
                <Card className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-base">Revenue Trend</CardTitle>
                    <CardDescription>Purchase revenue from GA4</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={timeSeries} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                          <YAxis tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: any) => [`GHS ${Number(v).toFixed(2)}`, "Revenue"]} />
                          <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Microsoft Clarity embed */}
        <Card className="border-border/70">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <MousePointer2 className="h-4 w-4 text-primary" />
                  Microsoft Clarity
                </CardTitle>
                <CardDescription>Heatmaps, session recordings, and behaviour analytics</CardDescription>
              </div>
              {clarityProjectId && (
                <a
                  href={`https://clarity.microsoft.com/projects/view/${clarityProjectId}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline shrink-0"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open Clarity
                </a>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {clarityProjectId ? (
              <iframe
                src={`https://clarity.microsoft.com/projects/view/${clarityProjectId}/dashboard`}
                className="w-full rounded-xl border border-border/60"
                style={{ height: 540, minHeight: 400 }}
                title="Microsoft Clarity Dashboard"
                sandbox="allow-scripts allow-same-origin allow-forms"
              />
            ) : (
              <div className="rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-6 text-center">
                <MousePointer2 className="h-8 w-8 mx-auto mb-3 text-amber-500 opacity-60" />
                <p className="font-medium text-sm">Microsoft Clarity not configured</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add your Clarity Project ID in Admin Settings → Platform Settings → Microsoft Clarity ID.
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Clarity will then auto-inject on the storefront and the embed will appear here.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
