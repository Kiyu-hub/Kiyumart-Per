import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildCsv, createSimplePdf, logReportActivity, triggerDownload } from "@/lib/reporting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Bus, DollarSign, Download, Loader2, MapPin, Package, TrendingUp } from "lucide-react";

type EarningsHistory = { deliveryId: string; orderId?: string | null; date?: string | null; amount: string; status?: string };
type EarningsPayload = { total?: string; thisMonth?: string; today?: string; deliveriesCompleted?: number; history?: EarningsHistory[] };
type OrderRow = { id: string; status: string; deliveryMethod: string; createdAt: string; deliveredAt?: string | null };
type TrackPoint = { latitude: string; longitude: string; timestamp: string };
type ReceiptSummary = {
  id: string;
  receiptNumber: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  total: string;
  updatedAt: string;
};

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
  const [exporting, setExporting] = useState<"none" | "csv" | "pdf">("none");

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

  const { data: receipts = [] } = useQuery<ReceiptSummary[]>({
    queryKey: ["/api/receipts", "rider-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/receipts?limit=8", { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: !!user && user.role === "rider",
    refetchInterval: 20000,
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
  const reportType = "rider_performance_analytics";
  const reportScope = { completedOrders: completedOrders.length, totalOrders: orders.length };
  const exportRows = completedOrders.map((order) => ({
    order_id: order.id,
    status: order.status,
    delivery_method: order.deliveryMethod,
    created_at: order.createdAt,
    delivered_at: order.deliveredAt || "",
  }));

  const handleExportCsv = async () => {
    await logReportActivity({ action: "request", reportType, format: "csv", scope: reportScope, status: "success" });
    try {
      setExporting("csv");
      const data = buildCsv(exportRows);
      if (!data) return;
      await logReportActivity({ action: "generate", reportType, format: "csv", scope: reportScope, status: "success" });
      triggerDownload(new Blob([data], { type: "text/csv;charset=utf-8;" }), `rider-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
      await logReportActivity({ action: "download", reportType, format: "csv", scope: reportScope, status: "success" });
    } catch {
      await logReportActivity({ action: "generate", reportType, format: "csv", scope: reportScope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  const handleExportPdf = async () => {
    await logReportActivity({ action: "request", reportType, format: "pdf", scope: reportScope, status: "success" });
    try {
      setExporting("pdf");
      const lines = [
        `Generated At: ${new Date().toISOString()}`,
        `Completed Deliveries: ${completedOrders.length}`,
        `Total Earnings: ${num(earnings?.total).toFixed(2)}`,
        `BUS Handoffs: ${metrics.busHandoffs}`,
        `Distance Covered: ${distanceKm.toFixed(1)} km`,
        " ",
      ];
      exportRows.forEach((row, idx) => {
        lines.push(`${idx + 1}. ${row.order_id}`);
        lines.push(`Status: ${row.status} | Method: ${row.delivery_method}`);
        lines.push(`Created: ${row.created_at} | Delivered: ${row.delivered_at || "N/A"}`);
        lines.push(" ");
      });
      const pdfBytes = createSimplePdf("Kiyumart Rider Analytics Report", lines);
      await logReportActivity({ action: "generate", reportType, format: "pdf", scope: reportScope, status: "success" });
      triggerDownload(new Blob([pdfBytes], { type: "application/pdf" }), `rider-analytics-${new Date().toISOString().slice(0, 10)}.pdf`);
      await logReportActivity({ action: "download", reportType, format: "pdf", scope: reportScope, status: "success" });
    } catch {
      await logReportActivity({ action: "generate", reportType, format: "pdf", scope: reportScope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  if (!user || user.role !== "rider") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <DashboardLayout role="rider">
      <div className="p-4 md:p-6 space-y-4">
        <Card className="border-emerald-500/30 bg-[linear-gradient(98deg,rgba(4,120,87,0.35)_0%,rgba(2,6,23,0.96)_52%,rgba(14,116,144,0.36)_100%)] text-white">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-page-title">Rider Performance Analytics</h1>
                <p className="text-white/80 text-sm">Daily and weekly summaries for deliveries, earnings, timing, distance, and bus handoffs.</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="border-white/35 text-white hover:bg-white/10" onClick={() => void handleExportCsv()} disabled={exporting !== "none"}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting === "csv" ? "Preparing..." : "CSV"}
                </Button>
                <Button variant="outline" size="sm" className="border-white/35 text-white hover:bg-white/10" onClick={() => void handleExportPdf()} disabled={exporting !== "none"}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting === "pdf" ? "Preparing..." : "PDF"}
                </Button>
              </div>
            </div>
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

            <Card>
              <CardHeader>
                <CardTitle>Receipt History</CardTitle>
                <CardDescription>Receipts linked to your completed deliveries and bus handoff confirmations.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {receipts.slice(0, 6).map((receipt) => (
                  <a key={receipt.id} href={`/orders/${receipt.orderId}/receipt`} className="flex items-center justify-between rounded-lg border p-3 text-sm hover:bg-accent">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{receipt.receiptNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">Order #{receipt.orderNumber} • {receipt.orderStatus}</p>
                    </div>
                    <p className="font-semibold">{formatPrice(Number(receipt.total || 0))}</p>
                  </a>
                ))}
                {!receipts.length && <p className="text-sm text-muted-foreground">No receipts generated yet for this rider scope.</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
