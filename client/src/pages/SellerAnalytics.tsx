import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DollarSign, Loader2, Package, ShoppingCart, TrendingUp } from "lucide-react";

type OrderRow = {
  id: string;
  status: string;
  paymentStatus?: string;
  total: string;
  deliveryMethod: string;
  createdAt: string;
  deliveredAt?: string | null;
};

type Analytics = { totalRevenue?: number; totalOrders?: number; totalReceivedMoney?: number };

const n = (v?: string | null) => String(v || "").toLowerCase().trim();
const num = (v: unknown) => Number(v || 0) || 0;
const paid = (s?: string | null) => ["completed", "paid", "success"].includes(n(s));
const completed = (s?: string | null) => ["completed", "delivered"].includes(n(s));
const dayKey = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

export default function SellerAnalytics() {
  const { user } = useAuth();
  const { formatPrice } = useLanguage();
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");

  const { data: stats, isLoading: statsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: !!user && user.role === "seller",
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderRow[]>({
    queryKey: ["/api/orders", "seller-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/orders?context=seller", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch seller orders");
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: !!user && user.role === "seller",
  });

  const startDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (range === "7d" ? 6 : range === "30d" ? 29 : 89));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [range]);

  const scoped = useMemo(() => orders.filter((o) => new Date(o.createdAt) >= startDate), [orders, startDate]);
  const paidCompleted = useMemo(() => scoped.filter((o) => paid(o.paymentStatus) && completed(o.status)), [scoped]);

  const totals = useMemo(() => {
    const completedCount = scoped.filter((o) => completed(o.status)).length;
    const cancelledCount = scoped.filter((o) => ["cancelled", "disputed"].includes(n(o.status))).length;
    const revenue = paidCompleted.reduce((sum, o) => sum + num(o.total), 0);
    const aov = paidCompleted.length ? revenue / paidCompleted.length : 0;
    const paidRate = scoped.length ? (paidCompleted.length / scoped.length) * 100 : 0;
    return { completedCount, cancelledCount, revenue, aov, paidRate };
  }, [paidCompleted, scoped]);

  const salesTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number }>();
    paidCompleted.forEach((o) => {
      const k = dayKey(o.deliveredAt || o.createdAt);
      const row = map.get(k) || { revenue: 0, orders: 0 };
      row.revenue += num(o.total);
      row.orders += 1;
      map.set(k, row);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({ day: day.slice(5), revenue: v.revenue, orders: v.orders }))
      .slice(-30);
  }, [paidCompleted]);

  const byMethod = useMemo(() => {
    const map = new Map<string, number>();
    paidCompleted.forEach((o) => map.set(n(o.deliveryMethod), (map.get(n(o.deliveryMethod)) || 0) + 1));
    return [
      { method: "Rider", count: map.get("rider") || 0 },
      { method: "Bus", count: map.get("bus") || 0 },
      { method: "Pickup", count: map.get("pickup") || 0 },
    ];
  }, [paidCompleted]);

  const peakHours = useMemo(() => {
    const map = new Map<number, number>();
    scoped.forEach((o) => {
      const h = new Date(o.createdAt).getHours();
      map.set(h, (map.get(h) || 0) + 1);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a - b)
      .map(([hour, orders]) => ({ hour: `${hour.toString().padStart(2, "0")}:00`, orders }))
      .slice(0, 24);
  }, [scoped]);

  const loading = statsLoading || ordersLoading;

  return (
    <DashboardLayout role="seller">
      <div className="p-4 md:p-6 space-y-4">
        <Card className="border-emerald-500/30 bg-[linear-gradient(100deg,rgba(6,78,59,0.32)_0%,rgba(2,6,23,0.96)_50%,rgba(12,74,110,0.36)_100%)] text-white">
          <CardContent className="p-4 md:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">Seller Analytics</h1>
              <p className="text-white/80 text-sm">Business-focused insights to optimize revenue, fulfillment, and delivery performance.</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-white/20 text-white border-white/30">Live DB Data</Badge>
              <select className="h-9 rounded-md border border-white/30 bg-white/10 px-3 text-sm text-white" value={range} onChange={(e) => setRange(e.target.value as any)}>
                <option value="7d" className="text-black">7 days</option>
                <option value="30d" className="text-black">30 days</option>
                <option value="90d" className="text-black">90 days</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-3 w-24 mb-2" /><Skeleton className="h-8 w-28" /></CardContent></Card>)}</div>
            <div className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-5"><Skeleton className="h-64 w-full" /></CardContent></Card><Card><CardContent className="p-5"><Skeleton className="h-64 w-full" /></CardContent></Card></div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardDescription>Revenue Earned</CardDescription><CardTitle className="text-2xl">{formatPrice(totals.revenue)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />All paid completed orders</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Orders Completed</CardDescription><CardTitle className="text-2xl">{totals.completedCount}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Vs {totals.cancelledCount} cancelled</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Average Order Value</CardDescription><CardTitle className="text-2xl">{formatPrice(totals.aov)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><Package className="h-4 w-4" />Per paid order</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Conversion Quality</CardDescription><CardTitle className="text-2xl">{totals.paidRate.toFixed(1)}%</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Paid completed ratio</CardContent></Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Sales Overview</CardTitle><CardDescription>Revenue trend by day</CardDescription></CardHeader>
                <CardContent>
                  <ChartContainer config={{ revenue: { label: "Revenue", color: "#10b981" } }} className="h-[260px] w-full">
                    <AreaChart data={salesTrend}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.22} /></AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Delivery Method Performance</CardTitle><CardDescription>Completed orders by channel</CardDescription></CardHeader>
                <CardContent>
                  <ChartContainer config={{ count: { label: "Orders", color: "#0ea5e9" } }} className="h-[260px] w-full">
                    <BarChart data={byMethod}><CartesianGrid vertical={false} /><XAxis dataKey="method" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} /></BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Peak Order Times</CardTitle><CardDescription>When your customers buy most</CardDescription></CardHeader>
                <CardContent>
                  <ChartContainer config={{ orders: { label: "Orders", color: "#22c55e" } }} className="h-[240px] w-full">
                    <BarChart data={peakHours}><CartesianGrid vertical={false} /><XAxis dataKey="hour" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="orders" fill="var(--color-orders)" radius={[6, 6, 0, 0]} /></BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Actionable Insights</CardTitle><CardDescription>Auto-generated from current range</CardDescription></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="rounded-lg border p-3">Paid revenue in this window: <span className="font-semibold">{formatPrice(totals.revenue)}</span></div>
                  <div className="rounded-lg border p-3">Completion quality: <span className="font-semibold">{totals.completedCount}</span> completed vs <span className="font-semibold">{totals.cancelledCount}</span> cancelled.</div>
                  <div className="rounded-lg border p-3">Top delivery method: <span className="font-semibold">{byMethod.sort((a, b) => b.count - a.count)[0]?.method || "N/A"}</span>.</div>
                  <div className="rounded-lg border p-3">Catalog at a glance: <span className="font-semibold">{num(stats?.totalOrders)}</span> lifetime orders, <span className="font-semibold">{formatPrice(num(stats?.totalRevenue))}</span> lifetime revenue.</div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
