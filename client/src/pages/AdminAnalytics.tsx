import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  Bus,
  Clock3,
  Download,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

type Method = "rider" | "bus" | "pickup";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  total: string;
  deliveryMethod: string;
  deliveryZoneId?: string | null;
  riderId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  deliveredAt?: string | null;
  seller?: { id?: string | null; name?: string | null; storeName?: string | null };
  rider?: { id?: string | null; name?: string | null };
};

type Zone = { id: string; name: string; city?: string | null; region?: string | null };
type LiteUser = { id: string; name: string; isActive?: boolean | null; riderOnline?: boolean | null; deliveryZoneId?: string | null };
type Analytics = { totalRevenue?: number; totalOrders?: number; totalUsers?: number; totalProducts?: number };

type SupportAnalytics = {
  totals?: { total?: number; open?: number; assigned?: number; resolved?: number; unresolved?: number };
  responseTime?: { avgFirstResponseSeconds?: number };
  unresolvedBacklog?: { over30MinutesWithoutFirstResponse?: number };
};

type SystemHealth = {
  pipeline?: { activeOrders?: number; searchingRider?: number; inTransit?: number };
  assignment?: { failedAttempts?: number };
  tracking?: { staleGpsOrders?: number };
};

type MessagingStats = {
  operations?: { dispatchBacklog?: number };
  messageQueue?: { queueSize?: number };
  alerts?: { messageQueueWarning?: boolean; dispatchBacklogWarning?: boolean };
};

const ACTIVE = new Set(["searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route"]);
const FINAL = new Set(["completed", "delivered"]);
const FAILED = new Set(["cancelled", "disputed"]);

const n = (v?: string | null) => String(v || "").toLowerCase().trim();
const num = (v: unknown) => Number(v || 0) || 0;
const paid = (s?: string | null) => ["completed", "paid", "success"].includes(n(s));
const completed = (s?: string | null) => FINAL.has(n(s));
const minutes = (start?: string | null, end?: string | null) => {
  const a = start ? new Date(start) : null;
  const b = end ? new Date(end) : null;
  if (!a || !b) return 0;
  return Math.max(0, (b.getTime() - a.getTime()) / 60000);
};
const fm = (m: number) => {
  if (!Number.isFinite(m) || m <= 0) return "0m";
  if (m < 60) return `${Math.round(m)}m`;
  return `${Math.floor(m / 60)}h ${Math.round(m % 60)}m`;
};
const dayKey = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}><CardContent className="p-4 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-7 w-28" /></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card><CardContent className="p-5"><Skeleton className="h-64 w-full" /></CardContent></Card>
        <Card><CardContent className="p-5"><Skeleton className="h-64 w-full" /></CardContent></Card>
      </div>
    </div>
  );
}

function csv(rows: Array<Record<string, any>>) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n");
}

export default function AdminAnalytics() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  const role = useMemo(() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  }, [user?.role]);
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const canView = isSuperAdmin || isAdmin;
  const adminZoneId = isAdmin ? String((user as any)?.deliveryZoneId || "") : "";

  const [preset, setPreset] = useState<"7d" | "30d" | "90d" | "custom">("30d");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [methodFilter, setMethodFilter] = useState<"all" | Method>("all");
  const [zoneFilter, setZoneFilter] = useState("all");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !canView)) navigate("/auth");
  }, [authLoading, canView, isAuthenticated, navigate]);

  useEffect(() => {
    if (isAdmin && adminZoneId) setZoneFilter(adminZoneId);
  }, [adminZoneId, isAdmin]);

  const { data: analytics, isLoading: aLoading, refetch: refetchAnalytics } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: isAuthenticated && canView,
  });

  const { data: orders = [], isLoading: oLoading, refetch: refetchOrders } = useQuery<OrderRow[]>({
    queryKey: ["/api/orders", "analytics"],
    queryFn: async () => {
      const r = await fetch("/api/orders?context=admin", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load orders");
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView,
    refetchInterval: 20000,
  });

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/delivery-zones", "analytics"],
    queryFn: async () => {
      const r = await fetch("/api/delivery-zones", { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView,
  });

  const userQuery = (roleName: string) => useQuery<LiteUser[]>({
    queryKey: ["/api/users", roleName, "analytics"],
    queryFn: async () => {
      const r = await fetch(`/api/users?role=${roleName}`, { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView,
  });

  const ridersQuery = userQuery("rider");
  const sellersQuery = userQuery("seller");
  const buyersQuery = userQuery("buyer");
  const agentsQuery = userQuery("agent");
  const riders = ridersQuery.data || [];
  const sellers = sellersQuery.data || [];
  const buyers = buyersQuery.data || [];
  const agents = agentsQuery.data || [];

  const { data: support } = useQuery<SupportAnalytics>({ queryKey: ["/api/support/analytics"], enabled: isAuthenticated && canView });
  const { data: health } = useQuery<SystemHealth>({ queryKey: ["/api/admin/system-health"], enabled: isAuthenticated && canView, refetchInterval: 15000 });
  const { data: messaging } = useQuery<MessagingStats>({ queryKey: ["/api/admin/messaging-stats"], enabled: isAuthenticated && canView, refetchInterval: 15000 });
  const { data: revenueViews } = useQuery<any>({ queryKey: ["/api/admin/revenue/views/summary"], enabled: isAuthenticated && canView });

  const [rangeStart, rangeEnd] = useMemo(() => {
    const end = toDate ? new Date(toDate) : new Date();
    end.setHours(23, 59, 59, 999);
    if (preset === "custom") {
      const start = fromDate ? new Date(fromDate) : new Date(Date.now() - 29 * 86400000);
      start.setHours(0, 0, 0, 0);
      return [start, end] as const;
    }
    const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
    const start = new Date();
    start.setDate(start.getDate() - (days - 1));
    start.setHours(0, 0, 0, 0);
    return [start, end] as const;
  }, [fromDate, preset, toDate]);

  const zoneScope = isAdmin ? adminZoneId : (zoneFilter === "all" ? "" : zoneFilter);

  const zoneName = useMemo(() => {
    const m = new Map<string, string>();
    zones.forEach((z) => m.set(z.id, z.name || z.city || z.region || z.id));
    return m;
  }, [zones]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime()) || d < rangeStart || d > rangeEnd) return false;
      if (methodFilter !== "all" && n(o.deliveryMethod) !== methodFilter) return false;
      if (zoneScope && String(o.deliveryZoneId || "") !== zoneScope) return false;
      return true;
    });
  }, [methodFilter, orders, rangeEnd, rangeStart, zoneScope]);

  const paidDone = useMemo(() => filtered.filter((o) => paid(o.paymentStatus) && completed(o.status)), [filtered]);

  const todayStart = useMemo(() => {
    const d = new Date(); d.setHours(0, 0, 0, 0); return d;
  }, []);

  const kpi = useMemo(() => {
    const ordersToday = filtered.filter((o) => new Date(o.createdAt) >= todayStart).length;
    const weekStart = new Date(todayStart); weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(todayStart.getFullYear(), todayStart.getMonth(), 1);
    const week = filtered.filter((o) => new Date(o.createdAt) >= weekStart).length;
    const month = filtered.filter((o) => new Date(o.createdAt) >= monthStart).length;
    const active = filtered.filter((o) => ACTIVE.has(n(o.status)));
    const riderActive = active.filter((o) => n(o.deliveryMethod) === "rider").length;
    const busActive = active.filter((o) => n(o.deliveryMethod) === "bus").length;
    const failed = filtered.filter((o) => FAILED.has(n(o.status)) || n(o.paymentStatus) === "failed").length;
    const delayed = filtered.filter((o) => ACTIVE.has(n(o.status)) && (Date.now() - new Date(o.createdAt).getTime()) / 60000 > 120).length;
    return { ordersToday, week, month, riderActive, busActive, failed, delayed };
  }, [filtered, todayStart]);

  const onlineRiders = useMemo(() => {
    return riders.filter((r) => (!zoneScope || String(r.deliveryZoneId || "") === zoneScope) && r.isActive !== false && r.riderOnline !== false).length;
  }, [riders, zoneScope]);

  const revenueTime = useMemo(() => {
    const fromViews = Array.isArray(revenueViews?.dailyRevenue) ? revenueViews.dailyRevenue : [];
    if (fromViews.length) {
      return fromViews.slice(-30).map((r: any) => ({ day: String(r.revenue_date || "").slice(5), revenue: num(r.total_revenue) }));
    }
    const byDay = new Map<string, number>();
    paidDone.forEach((o) => {
      const key = dayKey(o.deliveredAt || o.updatedAt || o.createdAt);
      byDay.set(key, (byDay.get(key) || 0) + num(o.total));
    });
    return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([k, v]) => ({ day: k.slice(5), revenue: v }));
  }, [paidDone, revenueViews?.dailyRevenue]);
  const revenueByMethod = useMemo(() => {
    const map = new Map<string, number>();
    paidDone.forEach((o) => map.set(n(o.deliveryMethod), (map.get(n(o.deliveryMethod)) || 0) + num(o.total)));
    return [
      { label: "Rider", revenue: map.get("rider") || 0 },
      { label: "Bus", revenue: map.get("bus") || 0 },
      { label: "Pickup", revenue: map.get("pickup") || 0 },
    ];
  }, [paidDone]);

  const revenueByZone = useMemo(() => {
    const map = new Map<string, number>();
    paidDone.forEach((o) => {
      const z = zoneName.get(String(o.deliveryZoneId || "")) || "Unspecified";
      map.set(z, (map.get(z) || 0) + num(o.total));
    });
    return Array.from(map.entries()).map(([zone, revenue]) => ({ zone, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [paidDone, zoneName]);

  const finance = useMemo(() => {
    const rows = Array.isArray(revenueViews?.platformCommission) ? revenueViews.platformCommission : [];
    return {
      fees: rows.reduce((s: number, r: any) => s + num(r.commission_amount), 0),
      payouts: rows.reduce((s: number, r: any) => s + num(r.seller_amount), 0),
    };
  }, [revenueViews?.platformCommission]);

  const ops = useMemo(() => {
    const funnel = ["pending", "processing", "assigned", "in_transit", "completed"].map((status) => ({
      status: status.replace("_", " "),
      count: filtered.filter((o) => n(o.status) === status).length,
    }));
    const riderOrders = filtered.filter((o) => n(o.deliveryMethod) === "rider");
    const assignmentRate = riderOrders.length ? (riderOrders.filter((o) => !!o.riderId).length / riderOrders.length) * 100 : 0;
    const avgMins = filtered
      .filter((o) => completed(o.status) && o.deliveredAt)
      .map((o) => minutes(o.createdAt, o.deliveredAt))
      .filter((m) => m > 0);
    const avgTime = avgMins.length ? avgMins.reduce((a, b) => a + b, 0) / avgMins.length : 0;
    const busOrders = filtered.filter((o) => n(o.deliveryMethod) === "bus");
    const busRate = busOrders.length ? (busOrders.filter((o) => completed(o.status)).length / busOrders.length) * 100 : 0;
    return { funnel, assignmentRate, avgTime, busRate };
  }, [filtered]);

  const feed = useMemo(() => {
    return [...filtered].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 8);
  }, [filtered]);

  const topSellers = useMemo(() => {
    const map = new Map<string, { name: string; revenue: number }>();
    paidDone.forEach((o) => {
      const id = String(o.seller?.id || "unknown");
      const name = o.seller?.storeName || o.seller?.name || "Unknown Seller";
      const row = map.get(id) || { name, revenue: 0 };
      row.revenue += num(o.total);
      map.set(id, row);
    });
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [paidDone]);

  const topRiders = useMemo(() => {
    const map = new Map<string, { name: string; completed: number }>();
    filtered.forEach((o) => {
      if (!o.rider?.id || !completed(o.status)) return;
      const id = String(o.rider.id);
      const row = map.get(id) || { name: o.rider.name || "Rider", completed: 0 };
      row.completed += 1;
      map.set(id, row);
    });
    return Array.from(map.values()).sort((a, b) => b.completed - a.completed).slice(0, 5);
  }, [filtered]);

  const roleStats = [
    { role: "Buyers", active: buyers.filter((u) => u.isActive !== false).length, total: buyers.length },
    { role: "Sellers", active: sellers.filter((u) => u.isActive !== false).length, total: sellers.length },
    { role: "Riders", active: riders.filter((u) => u.isActive !== false).length, total: riders.length },
    { role: "Agents", active: agents.filter((u) => u.isActive !== false).length, total: agents.length },
  ];

  const zoneOrders = useMemo(() => (adminZoneId ? filtered.filter((o) => String(o.deliveryZoneId || "") === adminZoneId) : []), [adminZoneId, filtered]);

  const exportCsv = () => {
    const rows = filtered.map((o) => ({
      order_number: o.orderNumber,
      status: o.status,
      payment_status: o.paymentStatus || "",
      delivery_method: o.deliveryMethod,
      zone: zoneName.get(String(o.deliveryZoneId || "")) || "",
      total: num(o.total).toFixed(2),
      created_at: o.createdAt,
    }));
    const data = csv(rows);
    if (!data) return;
    const blob = new Blob([data], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (authLoading || !isAuthenticated || !canView) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const loading = aLoading || oLoading;

  return (
    <DashboardLayout role={role as any}>
      <div className="p-4 md:p-6 space-y-4">
        <Card className="sticky top-2 z-20 border-emerald-500/30 bg-[linear-gradient(96deg,rgba(6,78,59,0.46)_0%,rgba(2,6,23,0.96)_47%,rgba(8,47,73,0.52)_100%)] text-white">
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold" data-testid="heading-analytics">{isSuperAdmin ? "Operations Command Center" : "Zone Operations Analytics"}</h1>
                <p className="text-white/80 text-sm mt-1">{isSuperAdmin ? "Uber-grade command view for financial, operational, and real-time insights." : "Zone-scoped execution analytics with no cross-zone exposure."}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className="bg-emerald-500/25 border-emerald-300/50 text-emerald-50"><ShieldCheck className="h-3.5 w-3.5 mr-1" />Role-Aware</Badge>
                  {isAdmin && <Badge className="bg-slate-500/25 border-slate-300/40 text-slate-50">Zone: {zoneName.get(adminZoneId) || "Unassigned"}</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" className="border-white/35 text-white hover:bg-white/10" onClick={() => { void refetchAnalytics(); void refetchOrders(); }}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
                <Button variant="outline" size="sm" className="border-white/35 text-white hover:bg-white/10" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />CSV</Button>
                <Button variant="outline" size="sm" className="border-white/35 text-white hover:bg-white/10" onClick={() => window.print()}>PDF</Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-white/20 bg-white/5"><CardContent className="p-3"><p className="text-xs text-white/70">Total Revenue</p><p className="text-xl font-semibold">{formatPrice(num(analytics?.totalRevenue))}</p></CardContent></Card>
              <Card className="border-white/20 bg-white/5"><CardContent className="p-3"><p className="text-xs text-white/70">Orders Today</p><p className="text-xl font-semibold">{kpi.ordersToday}</p></CardContent></Card>
              <Card className="border-white/20 bg-white/5"><CardContent className="p-3"><p className="text-xs text-white/70">Orders Week</p><p className="text-xl font-semibold">{kpi.week}</p></CardContent></Card>
              <Card className="border-white/20 bg-white/5"><CardContent className="p-3"><p className="text-xs text-white/70">Active Deliveries</p><p className="text-xl font-semibold">{kpi.riderActive + kpi.busActive}</p><p className="text-[11px] text-white/70">Rider {kpi.riderActive} • Bus {kpi.busActive}</p></CardContent></Card>
              <Card className="border-white/20 bg-white/5"><CardContent className="p-3"><p className="text-xs text-white/70">Online Riders</p><p className="text-xl font-semibold">{onlineRiders}</p><p className="text-[11px] text-red-300">{kpi.failed + kpi.delayed} failed/delayed</p></CardContent></Card>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Date Range</label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={preset} onChange={(e) => setPreset(e.target.value as any)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom</option></select></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">From</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">To</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Delivery Method</label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as any)}><option value="all">All</option><option value="rider">Rider</option><option value="bus">Bus</option><option value="pickup">Pickup</option></select></div>
              {isSuperAdmin && <div className="space-y-1 md:col-span-2"><label className="text-xs text-muted-foreground">Zone</label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}><option value="all">All zones</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div>}
            </div>
          </CardContent>
        </Card>

        {loading ? <LoadingSkeleton /> : (
          isSuperAdmin ? (
            <>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Revenue Over Time</CardTitle><CardDescription>Completed paid revenue trend</CardDescription></CardHeader>
                  <CardContent>
                    <ChartContainer config={{ revenue: { label: "Revenue", color: "#14b8a6" } }} className="h-[260px] w-full">
                      <AreaChart data={revenueTime}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.22} /></AreaChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Revenue by Delivery Method</CardTitle><CardDescription>Method contribution</CardDescription></CardHeader>
                  <CardContent>
                    <ChartContainer config={{ revenue: { label: "Revenue", color: "#0ea5e9" } }} className="h-[260px] w-full">
                      <BarChart data={revenueByMethod}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} /></BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader><CardTitle>Revenue by Zone</CardTitle><CardDescription>Top regional performers</CardDescription></CardHeader>
                  <CardContent>
                    <ChartContainer config={{ revenue: { label: "Revenue", color: "#22c55e" } }} className="h-[250px] w-full">
                      <BarChart data={revenueByZone}><CartesianGrid vertical={false} /><XAxis dataKey="zone" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} /></BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Platform Fees vs Payouts</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Platform Fees</p><p className="text-lg font-semibold">{formatPrice(finance.fees)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Seller Payouts</p><p className="text-lg font-semibold">{formatPrice(finance.payouts)}</p></div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card><CardHeader><CardTitle>Order Lifecycle Funnel</CardTitle></CardHeader><CardContent className="space-y-2">{ops.funnel.map((f) => <div key={f.status} className="space-y-1"><div className="flex items-center justify-between text-sm"><span className="capitalize">{f.status}</span><span className="font-medium">{f.count}</span></div><div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, f.count * 5)}%` }} /></div></div>)}</CardContent></Card>
                <Card><CardHeader><CardTitle>Operations & Performance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Rider Assignment Success</span><span className="font-semibold">{ops.assignmentRate.toFixed(1)}%</span></div><div className="flex justify-between"><span>Average Delivery Time</span><span className="font-semibold">{fm(ops.avgTime)}</span></div><div className="flex justify-between"><span>Bus Completion Rate</span><span className="font-semibold">{ops.busRate.toFixed(1)}%</span></div><div className="flex justify-between"><span>Orders This Month</span><span className="font-semibold">{kpi.month}</span></div></CardContent></Card>
                <Card><CardHeader><CardTitle>Real-Time System Activity</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><span>Dispatch backlog: {messaging?.operations?.dispatchBacklog || 0}</span></div><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-500" /><span>Message queue: {messaging?.messageQueue?.queueSize || 0}</span></div><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-red-500" /><span>Stale GPS orders: {health?.tracking?.staleGpsOrders || 0}</span></div><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /><span>In transit: {health?.pipeline?.inTransit || 0}</span></div><div className="flex items-center gap-2"><Bus className="h-4 w-4 text-blue-500" /><span>Searching rider: {health?.pipeline?.searchingRider || 0}</span></div></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card><CardHeader><CardTitle>Live Order Feed</CardTitle></CardHeader><CardContent className="space-y-2">{feed.map((o) => <div key={o.id} className="rounded-lg border p-3 flex items-center justify-between gap-2 text-sm"><div className="min-w-0"><p className="font-medium truncate">#{o.orderNumber}</p><p className="text-xs text-muted-foreground truncate capitalize">{n(o.status).replace("_", " ")} • {zoneName.get(String(o.deliveryZoneId || "")) || "Unspecified"}</p></div><p className="text-xs text-muted-foreground">{new Date(o.updatedAt || o.createdAt).toLocaleTimeString()}</p></div>)}</CardContent></Card>
                <Card><CardHeader><CardTitle>User & Role Analytics</CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid grid-cols-2 gap-2">{roleStats.map((r) => <div key={r.role} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{r.role}</p><p className="text-lg font-semibold">{r.active}/{r.total}</p></div>)}</div><div className="space-y-2"><p className="text-sm font-medium">Seller Performance Ranking</p>{topSellers.map((s, i) => <div key={`${s.name}-${i}`} className="flex justify-between text-sm"><span className="truncate">{s.name}</span><span className="font-semibold">{formatPrice(s.revenue)}</span></div>)}</div><div className="space-y-2"><p className="text-sm font-medium">Rider Performance Metrics</p>{topRiders.map((r, i) => <div key={`${r.name}-${i}`} className="flex justify-between text-sm"><span className="truncate">{r.name}</span><span className="font-semibold">{r.completed} completed</span></div>)}</div><div className="rounded-lg border p-3 text-sm"><p className="font-medium mb-1">Agent Activity Metrics</p><p>Open: {num(support?.totals?.open)} • Assigned: {num(support?.totals?.assigned)} • Resolved: {num(support?.totals?.resolved)}</p><p className="text-muted-foreground">Avg first response: {Math.round(num(support?.responseTime?.avgFirstResponseSeconds) / 60)} min</p></div></CardContent></Card>
              </div>
            </>
          ) : (
            <>
              <Card className="border-blue-500/25"><CardContent className="p-4 text-sm text-muted-foreground">Zone-scoped mode is active. Global financial and cross-zone analytics are intentionally hidden for admins.</CardContent></Card>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Zone Orders</p><p className="text-2xl font-semibold">{zoneOrders.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-semibold">{zoneOrders.filter((o) => completed(o.status)).length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Zone Revenue</p><p className="text-2xl font-semibold">{formatPrice(zoneOrders.filter((o) => completed(o.status) && paid(o.paymentStatus)).reduce((s, o) => s + num(o.total), 0))}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Rider Availability</p><p className="text-2xl font-semibold">{onlineRiders}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">SLA Risk</p><p className="text-2xl font-semibold">{kpi.delayed}</p></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card><CardHeader><CardTitle>Delivery Success vs Failure</CardTitle></CardHeader><CardContent><ChartContainer config={{ value: { label: "Count", color: "#06b6d4" } }} className="h-[240px] w-full"><BarChart data={[{ label: "Completed", value: zoneOrders.filter((o) => completed(o.status)).length }, { label: "Failed", value: zoneOrders.filter((o) => FAILED.has(n(o.status))).length }, { label: "Active", value: zoneOrders.filter((o) => ACTIVE.has(n(o.status))).length }]}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} /></BarChart></ChartContainer></CardContent></Card>
                <Card><CardHeader><CardTitle>Daily Operational Summary</CardTitle></CardHeader><CardContent><ChartContainer config={{ orders: { label: "Orders", color: "#22c55e" } }} className="h-[240px] w-full"><AreaChart data={Array.from(zoneOrders.reduce((m, o) => { const key = dayKey(o.createdAt); m.set(key, (m.get(key) || 0) + 1); return m; }, new Map<string, number>())).map(([day, value]) => ({ day: day.slice(5), value }))}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="value" stroke="var(--color-orders)" fill="var(--color-orders)" fillOpacity={0.22} /></AreaChart></ChartContainer></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card><CardHeader><CardTitle>Rider Performance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Total Riders (zone)</span><span className="font-semibold">{riders.filter((r) => String(r.deliveryZoneId || "") === adminZoneId).length}</span></div><div className="flex justify-between"><span>Online Riders</span><span className="font-semibold">{onlineRiders}</span></div><div className="flex justify-between"><span>Active Deliveries</span><span className="font-semibold">{zoneOrders.filter((o) => ACTIVE.has(n(o.status))).length}</span></div></CardContent></Card>
                <Card><CardHeader><CardTitle>SLA Metrics</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Average Delivery Time</span><span className="font-semibold">{fm(ops.avgTime)}</span></div><div className="flex justify-between"><span>Bus Completion Rate</span><span className="font-semibold">{ops.busRate.toFixed(1)}%</span></div><div className="flex justify-between"><span>Intervention Backlog</span><span className="font-semibold">{num(support?.unresolvedBacklog?.over30MinutesWithoutFirstResponse)}</span></div></CardContent></Card>
                <Card><CardHeader><CardTitle>Operational Alerts</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><span>Dispatch backlog: {messaging?.operations?.dispatchBacklog || 0}</span></div><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-500" /><span>Message queue: {messaging?.messageQueue?.queueSize || 0}</span></div><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /><span>In transit: {health?.pipeline?.inTransit || 0}</span></div></CardContent></Card>
              </div>
            </>
          )
        )}
      </div>
    </DashboardLayout>
  );
}
