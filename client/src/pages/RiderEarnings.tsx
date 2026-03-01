import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Bus, DollarSign, Loader2, MapPin, Package, TrendingUp } from "lucide-react";

type EarningsHistory = { deliveryId: string; orderId?: string | null; date?: string | null; amount: string; status?: string };
type EarningsPayload = { total?: string; thisMonth?: string; today?: string; deliveriesCompleted?: number; history?: EarningsHistory[] };
type OrderRow = { id: string; status: string; deliveryMethod: string; createdAt: string; deliveredAt?: string | null };
type TrackPoint = { latitude: string; longitude: string; timestamp: string };

const n = (v?: string | null) => String(v || "").toLowerCase().trim();
const num = (v: unknown) => Number(v || 0) || 0;
const done = (s?: string | null) => ["completed", "delivered"].includes(n(s));

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const r = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function RiderEarnings() {
  const { user } = useAuth();
  const { formatPrice } = useLanguage();

  const { data: earnings, isLoading: earningsLoading } = useQuery<EarningsPayload>({
    queryKey: ["/api/rider/earnings"],
    queryFn: async () => {
      const r = await fetch("/api/rider/earnings", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch earnings");
      return r.json();
    },
    enabled: !!user && user.role === "rider",
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<OrderRow[]>({
    queryKey: ["/api/orders", "rider-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/orders?context=rider", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch rider orders");
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: !!user && user.role === "rider",
  });

  const completedOrders = useMemo(() => orders.filter((o) => done(o.status)), [orders]);

  const { data: distanceKm = 0 } = useQuery<number>({
    queryKey: ["/api/rider/distance-estimate", completedOrders.map((o) => o.id).join(",")],
    queryFn: async () => {
      let total = 0;
      const targetOrders = completedOrders.slice(0, 8);
      for (const order of targetOrders) {
        try {
          const r = await fetch(`/api/delivery-tracking/${order.id}/history`, { credentials: "include" });
          if (!r.ok) continue;
          const points = (await r.json()) as TrackPoint[];
          if (!Array.isArray(points) || points.length < 2) continue;
          for (let i = 1; i < points.length; i++) {
            total += haversineKm(num(points[i - 1].latitude), num(points[i - 1].longitude), num(points[i].latitude), num(points[i].longitude));
          }
        } catch {
          continue;
        }
      }
      return total;
    },
    enabled: completedOrders.length > 0,
  });

  const metrics = useMemo(() => {
    const busHandoffs = completedOrders.filter((o) => n(o.deliveryMethod) === "bus").length;
    const avgMinutes = completedOrders.length
      ? completedOrders.map((o) => (new Date(o.deliveredAt || o.createdAt).getTime() - new Date(o.createdAt).getTime()) / 60000).filter((m) => m > 0)
      : [];
    const avgDeliveryMinutes = avgMinutes.length ? avgMinutes.reduce((a, b) => a + b, 0) / avgMinutes.length : 0;

    const now = new Date();
    const weekStart = new Date();
    weekStart.setDate(now.getDate() - 6);
    weekStart.setHours(0, 0, 0, 0);
    const weeklyCompleted = completedOrders.filter((o) => new Date(o.deliveredAt || o.createdAt) >= weekStart).length;
    const dailyCompleted = completedOrders.filter((o) => new Date(o.deliveredAt || o.createdAt).toDateString() === now.toDateString()).length;

    return { busHandoffs, avgDeliveryMinutes, weeklyCompleted, dailyCompleted };
  }, [completedOrders]);

  const earningsTrend = useMemo(() => {
    const history = Array.isArray(earnings?.history) ? earnings!.history! : [];
    const map = new Map<string, number>();
    history.forEach((h) => {
      const d = h.date ? new Date(h.date) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) || 0) + num(h.amount));
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([day, amount]) => ({ day: day.slice(5), amount }));
  }, [earnings?.history]);

  const statusBars = useMemo(() => {
    const map = new Map<string, number>();
    orders.forEach((o) => map.set(n(o.status), (map.get(n(o.status)) || 0) + 1));
    return [
      { label: "Completed", value: (map.get("completed") || 0) + (map.get("delivered") || 0) },
      { label: "In Transit", value: map.get("in_transit") || 0 },
      { label: "Assigned", value: map.get("assigned") || 0 },
      { label: "Cancelled", value: map.get("cancelled") || 0 },
    ];
  }, [orders]);

  const loading = earningsLoading || ordersLoading;

  if (!user || user.role !== "rider") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <DashboardLayout role="rider">
      <div className="p-4 md:p-6 space-y-4">
        <Card className="border-emerald-500/30 bg-[linear-gradient(98deg,rgba(4,120,87,0.35)_0%,rgba(2,6,23,0.96)_52%,rgba(14,116,144,0.36)_100%)] text-white">
          <CardContent className="p-4 md:p-5">
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Rider Performance Analytics</h1>
            <p className="text-white/80 text-sm">Daily and weekly summaries for deliveries, earnings, timing, distance, and bus handoffs.</p>
          </CardContent>
        </Card>

        {loading ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }).map((_, i) => <Card key={i}><CardContent className="p-4"><Skeleton className="h-3 w-20 mb-2" /><Skeleton className="h-8 w-24" /></CardContent></Card>)}</div>
            <div className="grid gap-4 xl:grid-cols-2"><Card><CardContent className="p-5"><Skeleton className="h-64 w-full" /></CardContent></Card><Card><CardContent className="p-5"><Skeleton className="h-64 w-full" /></CardContent></Card></div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <Card><CardHeader className="pb-2"><CardDescription>Total Earnings</CardDescription><CardTitle className="text-2xl">{formatPrice(num(earnings?.total))}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><DollarSign className="h-4 w-4" />All settled payouts</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>This Month</CardDescription><CardTitle className="text-2xl">{formatPrice(num(earnings?.thisMonth))}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><TrendingUp className="h-4 w-4" />Monthly earnings summary</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Deliveries Completed</CardDescription><CardTitle className="text-2xl">{num(earnings?.deliveriesCompleted)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><Package className="h-4 w-4" />Across all recorded periods</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>Distance Covered</CardDescription><CardTitle className="text-2xl">{distanceKm.toFixed(1)} km</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><MapPin className="h-4 w-4" />Estimated from tracking history</CardContent></Card>
              <Card><CardHeader className="pb-2"><CardDescription>BUS Handoffs</CardDescription><CardTitle className="text-2xl">{metrics.busHandoffs}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground flex items-center gap-2"><Bus className="h-4 w-4" />Completed bus-assisted deliveries</CardContent></Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Earnings Trend</CardTitle><CardDescription>Daily earning pattern</CardDescription></CardHeader>
                <CardContent>
                  <ChartContainer config={{ amount: { label: "Amount", color: "#10b981" } }} className="h-[250px] w-full">
                    <AreaChart data={earningsTrend}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="amount" stroke="var(--color-amount)" fill="var(--color-amount)" fillOpacity={0.22} /></AreaChart>
                  </ChartContainer>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle>Delivery Status Distribution</CardTitle><CardDescription>Current workload and completion profile</CardDescription></CardHeader>
                <CardContent>
                  <ChartContainer config={{ value: { label: "Count", color: "#0ea5e9" } }} className="h-[250px] w-full">
                    <BarChart data={statusBars}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} /></BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <Card><CardHeader><CardTitle>Time Per Delivery</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{metrics.avgDeliveryMinutes.toFixed(0)} min</p><p className="text-sm text-muted-foreground">Average completion time for delivered/completed jobs</p></CardContent></Card>
              <Card><CardHeader><CardTitle>Daily Summary</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{metrics.dailyCompleted}</p><p className="text-sm text-muted-foreground">Deliveries completed today</p></CardContent></Card>
              <Card><CardHeader><CardTitle>Weekly Summary</CardTitle></CardHeader><CardContent><p className="text-2xl font-semibold">{metrics.weeklyCompleted}</p><p className="text-sm text-muted-foreground">Deliveries completed in last 7 days</p></CardContent></Card>
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
