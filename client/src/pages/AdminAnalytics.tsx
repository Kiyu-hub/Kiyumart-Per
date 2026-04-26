import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  buildCsv,
  logReportActivity,
  openPrintReportWindow,
  renderPrintReportError,
  renderPrintReportWindow,
  triggerDownload,
} from "@/lib/reporting";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageLoadingState } from "@/components/ui/loading-state";
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
import pdfLogoDark from "@assets/kiyumart_logo_dark.png";
import pdfLogoLight from "@assets/kiyumart_logo_light.png";

type Method = "rider" | "delivery" | "bus" | "pickup";

type OrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string;
  total: string;
  deliveryMethod: string;
  externalDeliveryType?: string | null;
  externalDeliveryByBus?: boolean | null;
  deliveryZoneId?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  riderId?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  deliveredAt?: string | null;
  busDeliveryWorkflow?: BusWorkflow;
  pickupStationInfo?: {
    city?: string | null;
    region?: string | null;
    locationLabel?: string | null;
  } | null;
  seller?: { id?: string | null; name?: string | null; storeName?: string | null };
  rider?: { id?: string | null; name?: string | null };
};

type Zone = { id: string; name: string; city?: string | null; region?: string | null };
type LiteUser = { id: string; name: string; isActive?: boolean | null; riderOnline?: boolean | null; deliveryZoneId?: string | null };
type Analytics = {
  totalRevenue?: number;
  totalOrders?: number;
  totalUsers?: number;
  totalProducts?: number;
  totalReceivedMoney?: number;
  platformCommissionTotal?: number;
  promotionRevenueTotal?: number;
  platformRevenueTotal?: number;
  processingFeesTotal?: number;
  deliveryReserveTotal?: number;
};

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

type BusWorkflow = {
  stage?: string | null;
  proofSubmitted?: boolean;
} | null;

function CollapsibleDashboardSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <details open={defaultOpen}>
        <summary className="cursor-pointer list-none px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
          </div>
        </summary>
        <CardContent className="pt-0">{children}</CardContent>
      </details>
    </Card>
  );
}

type OrderLedgerRow = {
  order_id: string;
  order_number?: string | null;
  order_status?: string | null;
  payment_status?: string | null;
  delivery_method?: string | null;
  delivery_zone_id?: string | null;
  total?: string | number | null;
  currency?: string | null;
  order_created_at?: string | null;
  order_updated_at?: string | null;
  delivered_at?: string | null;
  is_completed?: boolean | null;
  transaction_id?: string | null;
  transaction_status?: string | null;
  transaction_amount?: string | number | null;
  payment_provider?: string | null;
  payment_reference?: string | null;
  commission_amount?: string | number | null;
  platform_amount?: string | number | null;
  seller_amount?: string | number | null;
  commission_status?: string | null;
  commission_rate?: string | number | null;
  commission_created_at?: string | null;
  seller_name?: string | null;
  store_name?: string | null;
  status_flow?: string | null;
};

type ReportActivityRow = {
  id: string;
  requestedBy: string;
  requesterRole: string;
  requesterEmail?: string | null;
  requesterName?: string | null;
  reportType: string;
  action: string;
  format?: string | null;
  status?: string | null;
  reportId?: string | null;
  createdAt: string;
};

const ACTIVE = new Set(["searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "external_dispatch_arranged"]);
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
const toText = (v: unknown) => String(v ?? "");
const statusFlow = (rawFlow: unknown, current: unknown) => {
  const currentStatus = toText(current).trim();
  const flow = toText(rawFlow)
    .split("->")
    .map((s) => s.trim())
    .filter(Boolean);
  if (currentStatus && flow[flow.length - 1] !== currentStatus) flow.push(currentStatus);
  return flow.length ? flow.join(" -> ") : currentStatus;
};

const GHANA_REGION_PATTERNS: Array<{ label: string; patterns: string[] }> = [
  { label: "Greater Accra Region", patterns: ["greater accra", "accra"] },
  { label: "Ashanti Region", patterns: ["ashanti", "kumasi"] },
  { label: "Central Region", patterns: ["central region", "cape coast", "central"] },
  { label: "Eastern Region", patterns: ["eastern region", "eastern", "koforidua"] },
  { label: "Western Region", patterns: ["western region", "takoradi", "sekondi", "western"] },
  { label: "Western North Region", patterns: ["western north"] },
  { label: "Volta Region", patterns: ["volta", "ho,"] },
  { label: "Oti Region", patterns: ["oti"] },
  { label: "Northern Region", patterns: ["northern region", "tamale", "northern"] },
  { label: "North East Region", patterns: ["north east"] },
  { label: "Savannah Region", patterns: ["savannah"] },
  { label: "Upper East Region", patterns: ["upper east", "bolgatanga"] },
  { label: "Upper West Region", patterns: ["upper west", "wa "] },
  { label: "Bono Region", patterns: ["bono", "sunyani"] },
  { label: "Bono East Region", patterns: ["bono east", "techiman"] },
  { label: "Ahafo Region", patterns: ["ahafo"] },
];

const compactText = (value?: string | null) =>
  String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const formatDateTime = (value?: string | null) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString("en-GH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const inferRegionFromLocationText = (...values: Array<string | null | undefined>) => {
  const haystack = values
    .map((value) => compactText(value))
    .filter(Boolean)
    .join(" | ");
  if (!haystack) return "";
  const exactRegion = GHANA_REGION_PATTERNS.find(({ label }) => haystack.includes(compactText(label)));
  if (exactRegion) return exactRegion.label;
  const matchedRegion = GHANA_REGION_PATTERNS.find(({ patterns }) =>
    patterns.some((pattern) => haystack.includes(pattern)),
  );
  return matchedRegion?.label || "";
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

export default function AdminAnalytics() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  const role = useMemo(() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  }, [user?.role]);
  const isSuperAdmin = role === "super_admin";
  const isAdmin = role === "admin";
  const canView = isSuperAdmin || isAdmin;
  const adminZoneId = isAdmin ? String((user as any)?.deliveryZoneId || "") : "";

  const formatInputDate = (value: Date) => {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, "0");
    const day = `${value.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
  };
  const today = useMemo(() => new Date(), []);
  const defaultFrom = useMemo(() => {
    const value = new Date(today);
    value.setDate(value.getDate() - 6);
    return formatInputDate(value);
  }, [today]);
  const defaultTo = useMemo(() => formatInputDate(today), [today]);

  const [preset, setPreset] = useState<"7d" | "30d" | "90d" | "custom" | "all">("all");
  const [fromDate, setFromDate] = useState(defaultFrom);
  const [toDate, setToDate] = useState(defaultTo);
  const [methodFilter, setMethodFilter] = useState<"all" | Method>("all");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [exporting, setExporting] = useState<"none" | "csv" | "pdf">("none");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !canView)) navigate("/auth");
  }, [authLoading, canView, isAuthenticated, navigate]);

  useEffect(() => {
    if (isAdmin && adminZoneId) setZoneFilter(adminZoneId);
  }, [adminZoneId, isAdmin]);

  useEffect(() => {
    if (!showInternalRiderFeatures && methodFilter === "rider") {
      setMethodFilter("all");
    }
  }, [methodFilter, showInternalRiderFeatures]);

  useEffect(() => {
    if (preset === "custom" || preset === "all") return;
    const end = new Date();
    const start = new Date(end);
    const days = preset === "7d" ? 6 : preset === "30d" ? 29 : 89;
    start.setDate(start.getDate() - days);
    setFromDate(formatInputDate(start));
    setToDate(formatInputDate(end));
  }, [preset]);

  const normalizeDeliveryMethod = (
    value?: string | null,
    orderLike?: { externalDeliveryType?: string | null; externalDeliveryByBus?: boolean | null },
  ) => {
    const method = n(value);
    const externalType = n(orderLike?.externalDeliveryType);
    const byBus = Boolean(orderLike?.externalDeliveryByBus);
    if (externalType === "bus" || byBus) return "bus";
    if (externalType === "third_party") return "delivery";
    if (!showInternalRiderFeatures && method === "rider") return "delivery";
    return method;
  };
  const getStatusLabel = (value?: string | null) => {
    const status = n(value);
    if (!showInternalRiderFeatures) {
      if (["searching_rider", "assigned", "external_dispatch_arranged"].includes(status)) return "External Dispatch Arranged";
      if (["rider_arrived", "picked_up", "in_transit", "en_route", "arrived"].includes(status)) return "Delivery In Progress";
      if (["delivered", "completed"].includes(status)) return "Completed";
    }
    return status.replace(/_/g, " ") || "pending";
  };
  const locationEntityLabel = "Zone";
  const locationEntityLabelPlural = "zones";

  const { data: analytics, isLoading: aLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: isAuthenticated && canView,
    staleTime: 55_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: 60_000,
  });

  const { data: orders = [], isLoading: oLoading } = useQuery<OrderRow[]>({
    queryKey: ["/api/orders", "analytics"],
    queryFn: async () => {
      const r = await fetch("/api/orders?context=admin", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load orders");
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView,
    staleTime: 55_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: 60_000,
  });

  const { data: orderLedger = [], isLoading: ledgerLoading } = useQuery<OrderLedgerRow[]>({
    queryKey: ["/api/admin/revenue/views/order-ledger", role],
    queryFn: async () => {
      const r = await fetch("/api/admin/revenue/views/order-ledger?limit=600", { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView,
    staleTime: 55_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: 60_000,
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
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const userQuery = (roleName: string, enabled = true) => useQuery<LiteUser[]>({
    queryKey: ["/api/users", roleName, "analytics"],
    queryFn: async () => {
      const r = await fetch(`/api/users?role=${roleName}`, { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView && enabled,
  });

  const ridersQuery = userQuery("rider", showInternalRiderFeatures);
  const sellersQuery = userQuery("seller");
  const buyersQuery = userQuery("buyer");
  const agentsQuery = userQuery("agent");
  const pickupAgentsQuery = userQuery("pickup_agent");
  const adminsQuery = userQuery("admin");
  const superAdminsQuery = userQuery("super_admin");
  const riders = showInternalRiderFeatures ? (ridersQuery.data || []) : [];
  const sellers = sellersQuery.data || [];
  const buyers = buyersQuery.data || [];
  const agents = agentsQuery.data || [];
  const pickupAgents = pickupAgentsQuery.data || [];
  const admins = adminsQuery.data || [];
  const superAdmins = superAdminsQuery.data || [];

  const { data: support } = useQuery<SupportAnalytics>({ queryKey: ["/api/support/analytics"], enabled: isAuthenticated && canView, staleTime: 55_000, refetchOnWindowFocus: false, refetchIntervalInBackground: false, refetchInterval: 60_000 });
  const { data: health } = useQuery<SystemHealth>({ queryKey: ["/api/admin/system-health"], enabled: isAuthenticated && canView, staleTime: 25_000, refetchOnWindowFocus: false, refetchIntervalInBackground: false, refetchInterval: 30_000 });
  const { data: messaging } = useQuery<MessagingStats>({ queryKey: ["/api/admin/messaging-stats"], enabled: isAuthenticated && canView, staleTime: 25_000, refetchOnWindowFocus: false, refetchIntervalInBackground: false, refetchInterval: 30_000 });
  const { data: revenueViews } = useQuery<any>({ queryKey: ["/api/admin/revenue/views/summary"], enabled: isAuthenticated && canView, staleTime: 55_000, refetchOnWindowFocus: false, refetchIntervalInBackground: false, refetchInterval: 60_000 });
  const { data: reportActivity = [], refetch: refetchReportActivity } = useQuery<ReportActivityRow[]>({
    queryKey: ["/api/reports/activity", "admin-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/reports/activity?limit=30", { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: isAuthenticated && canView,
    staleTime: 55_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    refetchInterval: 60_000,
  });

  const [rangeStart, rangeEnd] = useMemo(() => {
    if (preset === "all") return [new Date(0), new Date(8640000000000000)] as const;
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
  const regionName = useMemo(() => {
    const m = new Map<string, string>();
    zones.forEach((z) => m.set(z.id, z.region || z.city || z.name || `Unspecified region`));
    return m;
  }, [zones]);
  const resolveOrderRegion = useMemo(() => {
    return (order: OrderRow) => {
      const derivedFromCustomerLocation = inferRegionFromLocationText(
        order.deliveryCity,
        order.deliveryAddress,
        order.pickupStationInfo?.region,
        order.pickupStationInfo?.city,
        order.pickupStationInfo?.locationLabel,
      );
      if (derivedFromCustomerLocation) return derivedFromCustomerLocation;
      return regionName.get(String(order.deliveryZoneId || "")) || "Unspecified region";
    };
  }, [regionName]);

  const filtered = useMemo(() => {
    return orders.filter((o) => {
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime()) || d < rangeStart || d > rangeEnd) return false;
      if (methodFilter !== "all" && normalizeDeliveryMethod(o.deliveryMethod, o) !== methodFilter) return false;
      if (zoneScope && String(o.deliveryZoneId || "") !== zoneScope) return false;
      return true;
    });
  }, [methodFilter, normalizeDeliveryMethod, orders, rangeEnd, rangeStart, zoneScope]);

  const paidDone = useMemo(() => filtered.filter((o) => paid(o.paymentStatus) && completed(o.status)), [filtered]);
  const paidDeliveries = useMemo(
    () => paidDone.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) !== "pickup"),
    [normalizeDeliveryMethod, paidDone],
  );
  const paidPickups = useMemo(
    () => paidDone.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "pickup"),
    [normalizeDeliveryMethod, paidDone],
  );

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
    const riderActive = active.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "rider").length;
    const deliveryActive = active.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "delivery").length;
    const busActive = active.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "bus").length;
    const failed = filtered.filter((o) => FAILED.has(n(o.status)) || n(o.paymentStatus) === "failed").length;
    const delayed = filtered.filter((o) => ACTIVE.has(n(o.status)) && (Date.now() - new Date(o.createdAt).getTime()) / 60000 > 120).length;
    return { ordersToday, week, month, riderActive, deliveryActive, busActive, failed, delayed };
  }, [filtered, normalizeDeliveryMethod, todayStart]);

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
    paidDone.forEach((o) => {
      const method = normalizeDeliveryMethod(o.deliveryMethod, o);
      map.set(method, (map.get(method) || 0) + num(o.total));
    });
    return [
      ...(showInternalRiderFeatures ? [{ label: "Rider", revenue: map.get("rider") || 0 }] : []),
      ...(!showInternalRiderFeatures ? [{ label: "External Delivery", revenue: map.get("delivery") || 0 }] : []),
      { label: "Bus", revenue: map.get("bus") || 0 },
      { label: "Pickup", revenue: map.get("pickup") || 0 },
    ];
  }, [normalizeDeliveryMethod, paidDone, showInternalRiderFeatures]);

  const revenueByRegion = useMemo(() => {
    const map = new Map<string, number>();
    paidDone.forEach((o) => {
      const region = resolveOrderRegion(o);
      map.set(region, (map.get(region) || 0) + num(o.total));
    });
    return Array.from(map.entries()).map(([region, revenue]) => ({ region, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);
  }, [paidDone, resolveOrderRegion]);
  const hasRevenueOverTimeData = useMemo(() => revenueTime.some((row: { revenue: number | string }) => num(row.revenue) > 0), [revenueTime]);
  const hasRevenueByMethodData = useMemo(() => revenueByMethod.some((row) => num(row.revenue) > 0), [revenueByMethod]);
  const hasRevenueByRegionData = useMemo(() => revenueByRegion.some((row) => num(row.revenue) > 0), [revenueByRegion]);

  const finance = useMemo(() => {
    const rows = Array.isArray(revenueViews?.platformCommission) ? revenueViews.platformCommission : [];
    const platformRevenue = num(analytics?.platformRevenueTotal) || (num(analytics?.platformCommissionTotal) + num(analytics?.promotionRevenueTotal));
    return {
      fees: platformRevenue,
      commission: num(analytics?.platformCommissionTotal),
      promotion: num(analytics?.promotionRevenueTotal),
      processing: num(analytics?.processingFeesTotal),
      payouts: rows.reduce((s: number, r: any) => s + num(r.seller_amount), 0),
    };
  }, [analytics?.platformCommissionTotal, analytics?.platformRevenueTotal, analytics?.processingFeesTotal, analytics?.promotionRevenueTotal, revenueViews?.platformCommission]);

  const ops = useMemo(() => {
      const funnel = [
        "pending",
        "processing",
        showInternalRiderFeatures ? "assigned" : "external_dispatch_arranged",
        "in_transit",
        "completed",
      ].map((status) => ({
      status: getStatusLabel(status),
        count: filtered.filter((o) => n(o.status) === status).length,
      }));
    const riderOrders = filtered.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "rider");
    const assignmentRate = riderOrders.length ? (riderOrders.filter((o) => !!o.riderId).length / riderOrders.length) * 100 : 0;
    const avgMins = filtered
      .filter((o) => completed(o.status) && o.deliveredAt)
      .map((o) => minutes(o.createdAt, o.deliveredAt))
      .filter((m) => m > 0);
    const avgTime = avgMins.length ? avgMins.reduce((a, b) => a + b, 0) / avgMins.length : 0;
    const busOrders = filtered.filter((o) => n(o.deliveryMethod) === "bus");
    const busRate = busOrders.length ? (busOrders.filter((o) => completed(o.status)).length / busOrders.length) * 100 : 0;
    return { funnel, assignmentRate, avgTime, busRate };
  }, [filtered, getStatusLabel, normalizeDeliveryMethod]);

  const feed = useMemo(() => {
    return [...filtered].sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()).slice(0, 8);
  }, [filtered, normalizeDeliveryMethod, showInternalRiderFeatures]);

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
    if (!showInternalRiderFeatures) return [];
    const map = new Map<string, { name: string; completed: number }>();
    filtered.forEach((o) => {
      if (!o.rider?.id || !completed(o.status)) return;
      const id = String(o.rider.id);
      const row = map.get(id) || { name: o.rider.name || "Rider", completed: 0 };
      row.completed += 1;
      map.set(id, row);
    });
    return Array.from(map.values()).sort((a, b) => b.completed - a.completed).slice(0, 5);
  }, [filtered, showInternalRiderFeatures]);

  const roleStats = [
    { role: "Buyers", active: buyers.filter((u) => u.isActive !== false).length, total: buyers.length },
    { role: "Sellers", active: sellers.filter((u) => u.isActive !== false).length, total: sellers.length },
    ...(showInternalRiderFeatures
      ? [{ role: "Riders", active: riders.filter((u) => u.isActive !== false).length, total: riders.length }]
      : []),
    { role: "Customer Agents", active: agents.filter((u) => u.isActive !== false).length, total: agents.length },
    { role: "Pickup Agents", active: pickupAgents.filter((u) => u.isActive !== false).length, total: pickupAgents.length },
    { role: "Admins", active: admins.filter((u) => u.isActive !== false).length, total: admins.length },
    { role: "Super Admins", active: superAdmins.filter((u) => u.isActive !== false).length, total: superAdmins.length },
  ];

  const zoneOrders = useMemo(() => (adminZoneId ? filtered.filter((o) => String(o.deliveryZoneId || "") === adminZoneId) : []), [adminZoneId, filtered]);
  const ledgerByOrderId = useMemo(() => {
    const map = new Map<string, OrderLedgerRow>();
    orderLedger.forEach((row) => {
      const key = String(row.order_id || "");
      if (!key || map.has(key)) return;
      map.set(key, row);
    });
    return map;
  }, [orderLedger]);

  const filteredLedger = useMemo(() => {
    const scopedOrderIds = new Set(filtered.map((o) => String(o.id)));
    return orderLedger.filter((row) => scopedOrderIds.has(String(row.order_id || "")));
  }, [filtered, orderLedger]);

  const applyCurrentFilters = (rows: OrderRow[]) =>
    rows.filter((o) => {
      const d = new Date(o.createdAt);
      if (Number.isNaN(d.getTime()) || d < rangeStart || d > rangeEnd) return false;
      if (methodFilter !== "all" && normalizeDeliveryMethod(o.deliveryMethod, o) !== methodFilter) return false;
      if (zoneScope && String(o.deliveryZoneId || "") !== zoneScope) return false;
      return true;
    });

  const fetchOrderSnapshot = async () => {
    const r = await fetch("/api/orders?context=admin", { credentials: "include" });
    if (!r.ok) throw new Error("Failed to fetch live orders snapshot");
    const p = await r.json();
    return Array.isArray(p) ? (p as OrderRow[]) : [];
  };

  const fetchLedgerSnapshot = async (limit: number) => {
    const capped = Math.min(1000, Math.max(100, limit));
    const r = await fetch(`/api/admin/revenue/views/order-ledger?limit=${capped}`, { credentials: "include" });
    if (!r.ok) throw new Error("Failed to fetch live order ledger");
    const p = await r.json();
    return Array.isArray(p) ? (p as OrderLedgerRow[]) : [];
  };

  const toExportRows = async () => {
    const [liveOrders, liveLedger] = await Promise.all([
      fetchOrderSnapshot(),
      fetchLedgerSnapshot(Math.max(filtered.length * 3, 300)),
    ]);
    const filteredLive = applyCurrentFilters(liveOrders);
    const liveLedgerByOrderId = new Map<string, OrderLedgerRow>();
    liveLedger.forEach((row) => {
      const key = String(row.order_id || "");
      if (!key || liveLedgerByOrderId.has(key)) return;
      liveLedgerByOrderId.set(key, row);
    });

    return filteredLive.map((order) => {
      const ledger = liveLedgerByOrderId.get(order.id) || ledgerByOrderId.get(order.id);
      const flow = statusFlow(ledger?.status_flow, order.status);
      return {
        order_number: order.orderNumber,
        order_id: order.id,
        current_status: order.status,
        completed: completed(order.status) ? "yes" : "no",
        payment_status: order.paymentStatus || toText(ledger?.payment_status || ""),
        delivery_method: order.deliveryMethod,
        bus_stage: n(order.deliveryMethod) === "bus" ? toText(order.busDeliveryWorkflow?.stage || "READY") : "",
        zone: zoneName.get(String(order.deliveryZoneId || "")) || "",
        store_name: order.seller?.storeName || toText(ledger?.store_name || ""),
        seller_name: order.seller?.name || toText(ledger?.seller_name || ""),
        order_total: num(order.total).toFixed(2),
        currency: toText(ledger?.currency || "GHS"),
        seller_paid_amount: num(ledger?.seller_amount).toFixed(2),
        platform_commission_amount: num(ledger?.commission_amount).toFixed(2),
        platform_amount: num(ledger?.platform_amount).toFixed(2),
        commission_rate: num(ledger?.commission_rate).toFixed(2),
        commission_status: toText(ledger?.commission_status || ""),
        seller_paid: num(ledger?.seller_amount) > 0 ? "yes" : "no",
        transaction_id: toText(ledger?.transaction_id || ""),
        transaction_status: toText(ledger?.transaction_status || ""),
        transaction_amount: num(ledger?.transaction_amount).toFixed(2),
        payment_provider: toText(ledger?.payment_provider || ""),
        payment_reference: toText(ledger?.payment_reference || ""),
        status_flow: flow,
        order_created_at: order.createdAt,
        order_updated_at: order.updatedAt || "",
        order_delivered_at: order.deliveredAt || "",
      };
    });
  };

  const currentReportType = isSuperAdmin ? "platform_analytics_ledger" : "zone_analytics_ledger";
  const buildReportScope = () => ({
    datePreset: preset,
    fromDate: fromDate || null,
    toDate: toDate || null,
    deliveryMethod: methodFilter,
    zone: zoneScope || "all",
  });

  const refreshAll = () => {
    setIsRefreshing(true);
    queryClient.invalidateQueries().finally(() => setIsRefreshing(false));
  };

  const exportCsv = async () => {
    const scope = buildReportScope();
    await logReportActivity({
      action: "request",
      reportType: currentReportType,
      format: "csv",
      scope,
      status: "success",
    });
    try {
      setExporting("csv");
      await refreshAll();
      const rows = await toExportRows();
      const data = buildCsv(rows);
      if (!data) return;
      await logReportActivity({ action: "generate", reportType: currentReportType, format: "csv", scope, status: "success" });
      triggerDownload(
        new Blob([data], { type: "text/csv;charset=utf-8;" }),
        `analytics-ledger-${new Date().toISOString().slice(0, 10)}.csv`
      );
      await logReportActivity({ action: "download", reportType: currentReportType, format: "csv", scope, status: "success" });
      void refetchReportActivity();
    } catch {
      await logReportActivity({ action: "generate", reportType: currentReportType, format: "csv", scope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  const exportPdf = async () => {
    const reportWindow = openPrintReportWindow("KiyuMart Platform Analytics", "Preparing your premium analytics report...");
    const scope = buildReportScope();
    await logReportActivity({
      action: "request",
      reportType: currentReportType,
      format: "pdf",
      scope,
      status: "success",
    });
    try {
      setExporting("pdf");
      const prefersDarkPdf = false;
      const pdfLogoUrl = new URL(prefersDarkPdf ? pdfLogoLight : pdfLogoDark, window.location.origin).toString();
      const rows = await toExportRows();

      const totalCommission = rows.reduce((sum, row) => sum + num(row.platform_commission_amount), 0);
      const totalSellerPaid = rows.reduce((sum, row) => sum + num(row.seller_paid_amount), 0);
      const completedCount = rows.filter((row) => row.completed === "yes").length;
      const methodSummary = rows.reduce<Record<string, number>>((acc, row) => {
        const method = String(row.delivery_method || "unknown");
        acc[method] = (acc[method] || 0) + 1;
        return acc;
      }, {});
      const topStores = rows.reduce<Record<string, number>>((acc, row) => {
        const storeName = String(row.store_name || "Unknown Store");
        acc[storeName] = (acc[storeName] || 0) + num(row.order_total);
        return acc;
      }, {});

      const orderRowsMarkup = rows
        .slice(0, 14)
        .map(
          (row) => `
            <tr>
              <td>
                <div class="table-primary">${escapeHtml(row.order_number || row.order_id)}</div>
                <div class="table-secondary">${escapeHtml(formatDateTime(row.order_created_at))}</div>
              </td>
              <td>${escapeHtml(row.store_name || "Unknown Store")}</td>
              <td>${escapeHtml(row.current_status)}</td>
              <td>${escapeHtml(row.payment_status || "pending")}</td>
              <td>${escapeHtml(row.delivery_method)}</td>
              <td class="table-amount">GHS ${escapeHtml(row.order_total)}</td>
            </tr>
          `,
        )
        .join("");

      const methodMarkup = Object.entries(methodSummary)
        .sort((a, b) => b[1] - a[1])
        .map(
          ([method, count]) => `
            <div class="compact-row">
              <span>${escapeHtml(method)}</span>
              <span>${escapeHtml(String(count))} orders</span>
            </div>
          `,
        )
        .join("");

      const storeMarkup = Object.entries(topStores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(
          ([storeName, revenue]) => `
            <div class="compact-row">
              <span>${escapeHtml(storeName)}</span>
              <span>GHS ${escapeHtml(revenue.toFixed(2))}</span>
            </div>
          `,
        )
        .join("");

      if (!reportWindow) {
        throw new Error("Please allow pop-ups so your PDF report can open.");
      }

      renderPrintReportWindow(reportWindow, "KiyuMart Platform Analytics", `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>KiyuMart Platform Analytics</title>
            <style>
              :root {
                --ink: #102a43;
                --muted: #5c6b7a;
                --border: #d9e2ec;
                --surface: #ffffff;
                --soft: #f7fafc;
                --accent: #0b8f74;
                --accent-soft: rgba(11, 143, 116, 0.1);
              }
              * { box-sizing: border-box; }
              body { margin: 0; font-family: "Segoe UI", Arial, sans-serif; color: var(--ink); background: #eef4f7; }
              .page { max-width: 1040px; margin: 0 auto; min-height: 100vh; background: var(--surface); }
              .hero {
                padding: 34px 40px 28px;
                background:
                  linear-gradient(135deg, rgba(11, 143, 116, 0.16), rgba(9, 34, 76, 0.06)),
                  linear-gradient(180deg, #ffffff, #f8fbfc);
                border-bottom: 1px solid var(--border);
              }
              .hero-top { display: flex; align-items: center; gap: 16px; }
              .hero-top img { height: 42px; width: auto; object-fit: contain; }
              .eyebrow {
                display: inline-block; padding: 6px 12px; border-radius: 999px; background: var(--accent-soft);
                color: var(--accent); font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase;
              }
              h1 { margin: 14px 0 8px; font-size: 34px; line-height: 1.05; }
              .hero-copy { max-width: 680px; color: var(--muted); font-size: 15px; line-height: 1.6; }
              .summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 24px; }
              .summary-card { border: 1px solid var(--border); border-radius: 18px; padding: 16px 18px; background: rgba(255,255,255,0.9); }
              .summary-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; }
              .summary-value { margin-top: 8px; font-size: 24px; font-weight: 700; }
              .content { padding: 28px 40px 40px; }
              .section { margin-top: 28px; }
              .section:first-child { margin-top: 0; }
              .section-heading { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; }
              .section-icon {
                width: 30px; height: 30px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center;
                background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
              }
              .section-title { margin: 0; font-size: 18px; font-weight: 700; }
              .report-table-wrap { border: 1px solid var(--border); border-radius: 18px; overflow: hidden; background: var(--surface); }
              .report-table { width: 100%; border-collapse: collapse; }
              .report-table thead { background: #f4f8fb; }
              .report-table th, .report-table td {
                padding: 14px 16px; border-bottom: 1px solid var(--border); text-align: left; vertical-align: top; font-size: 14px;
              }
              .report-table th {
                color: var(--muted); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 700;
              }
              .report-table tbody tr:last-child td { border-bottom: none; }
              .table-primary { font-weight: 700; font-size: 14px; }
              .table-secondary { margin-top: 4px; color: var(--muted); font-size: 12px; }
              .table-amount { white-space: nowrap; color: var(--accent); font-weight: 700; }
              .compact-list { border: 1px solid var(--border); border-radius: 16px; overflow: hidden; background: var(--surface); }
              .compact-row {
                display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px 16px;
                border-bottom: 1px solid var(--border); font-size: 14px;
              }
              .compact-row:last-child { border-bottom: none; }
              .two-col { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
              .empty-state {
                padding: 18px 16px; border: 1px dashed var(--border); border-radius: 14px; color: var(--muted); background: var(--soft); font-size: 14px;
              }
              .footer-note {
                margin-top: 30px; padding-top: 18px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; line-height: 1.6;
              }
              .print-footer { display: none; }
              @page { margin: 16mm; }
              @media print {
                body { background: #fff; }
                .page { max-width: none; }
                .content { padding-bottom: 72px; }
                .print-footer {
                  display: flex; position: fixed; left: 16mm; right: 16mm; bottom: 8mm; align-items: center; justify-content: space-between;
                  color: var(--muted); font-size: 11px; border-top: 1px solid var(--border); padding-top: 8px; background: #fff;
                }
              }
            </style>
          </head>
          <body>
            <div class="page">
              <section class="hero">
                <div class="hero-top">
                  <img src="${pdfLogoUrl}" alt="KiyuMart" />
                  <div>
                    <span class="eyebrow">${escapeHtml(isSuperAdmin ? "Platform Analytics Report" : `${locationEntityLabel} Analytics Report`)}</span>
                    <h1>KiyuMart Live Order Ledger</h1>
                    <div class="hero-copy">
                      A premium operations report covering order flow, payment completion, commission totals, seller payouts,
                      and delivery mix for the selected analytics scope.
                    </div>
                  </div>
                </div>
                <div class="summary-grid">
                  <div class="summary-card"><div class="summary-label">Orders In Scope</div><div class="summary-value">${escapeHtml(String(rows.length))}</div></div>
                  <div class="summary-card"><div class="summary-label">Completed Orders</div><div class="summary-value">${escapeHtml(String(completedCount))}</div></div>
                  <div class="summary-card"><div class="summary-label">Platform Commission</div><div class="summary-value">GHS ${escapeHtml(totalCommission.toFixed(2))}</div></div>
                  <div class="summary-card"><div class="summary-label">Seller Paid</div><div class="summary-value">GHS ${escapeHtml(totalSellerPaid.toFixed(2))}</div></div>
                </div>
              </section>
              <main class="content">
                <section class="section">
                  <div class="section-heading">
                    <span class="section-icon">SC</span>
                    <h2 class="section-title">Scope Summary</h2>
                  </div>
                  <div class="compact-list">
                    <div class="compact-row"><span>Date Preset</span><span>${escapeHtml(String(scope.datePreset || "custom"))}</span></div>
                    <div class="compact-row"><span>From</span><span>${escapeHtml(String(scope.fromDate || "Not set"))}</span></div>
                    <div class="compact-row"><span>To</span><span>${escapeHtml(String(scope.toDate || "Not set"))}</span></div>
                    <div class="compact-row"><span>Delivery Method</span><span>${escapeHtml(String(scope.deliveryMethod || "all"))}</span></div>
                    <div class="compact-row"><span>${escapeHtml(locationEntityLabel)}</span><span>${escapeHtml(String(scope.zone || "all"))}</span></div>
                  </div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <span class="section-icon">OR</span>
                    <h2 class="section-title">Recent Orders</h2>
                  </div>
                  <div class="report-table-wrap">
                    <table class="report-table">
                      <thead>
                        <tr>
                          <th>Order</th>
                          <th>Store</th>
                          <th>Status</th>
                          <th>Payment</th>
                          <th>Method</th>
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${orderRowsMarkup}
                      </tbody>
                    </table>
                  </div>
                </section>

                <section class="section">
                  <div class="two-col">
                    <div>
                      <div class="section-heading">
                        <span class="section-icon">DM</span>
                        <h2 class="section-title">Delivery Mix</h2>
                      </div>
                      <div class="compact-list">${methodMarkup || `<div class="empty-state">No delivery data available.</div>`}</div>
                    </div>
                    <div>
                      <div class="section-heading">
                        <span class="section-icon">TS</span>
                        <h2 class="section-title">Top Stores</h2>
                      </div>
                      <div class="compact-list">${storeMarkup || `<div class="empty-state">No store revenue data available.</div>`}</div>
                    </div>
                  </div>
                </section>

                <div class="footer-note">
                  This report reflects the current live order transaction ledger for the selected analytics filters.
                  For raw spreadsheet analysis, use the CSV export from the analytics page.
                </div>
              </main>
              <div class="print-footer">
                <span>KiyuMart Platform Analytics</span>
                <span>${escapeHtml(formatDateTime(new Date().toISOString()))}</span>
              </div>
            </div>
          </body>
        </html>
      `);
      await logReportActivity({ action: "generate", reportType: currentReportType, format: "pdf", scope, status: "success" });
      await logReportActivity({ action: "download", reportType: currentReportType, format: "pdf", scope, status: "success" });
      void refetchReportActivity();
    } catch (error: any) {
      if (reportWindow) {
        renderPrintReportError(
          reportWindow,
          "Analytics report failed",
          error?.message || "The report could not be prepared right now. Please try again shortly.",
        );
      }
      await logReportActivity({ action: "generate", reportType: currentReportType, format: "pdf", scope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  if (authLoading || !isAuthenticated || !canView) {
    return <PageLoadingState title="Loading analytics" description="Gathering live platform metrics and reports." />;
  }

  const loading = aLoading || oLoading || ledgerLoading;

  return (
    <DashboardLayout role={role as any}>
      <div className="p-4 md:p-6 space-y-4 pb-8 min-h-full overflow-x-hidden">
        <Card className="sticky top-2 z-20 border-border/70 bg-card text-card-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(96deg,rgba(6,78,59,0.46)_0%,rgba(2,6,23,0.96)_47%,rgba(8,47,73,0.52)_100%)] dark:text-white">
          <CardContent className="p-4 md:p-5 space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h1 className="text-2xl md:text-3xl font-semibold" data-testid="heading-analytics">
                  {isSuperAdmin
                    ? "Platform Analytics"
                    : `${locationEntityLabel} Operations Analytics`}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground dark:text-white/80">
                  {isSuperAdmin
                    ? (showInternalRiderFeatures
                        ? "Unified financial, operational, and rider-dispatch insights for the whole platform."
                        : "Unified financial, operational, and manual-delivery insights for the whole platform.")
                    : `${locationEntityLabel}-scoped execution analytics with no cross-${locationEntityLabelPlural} exposure.`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/50 dark:bg-emerald-500/25 dark:text-emerald-50"><ShieldCheck className="mr-1 h-3.5 w-3.5" />Role-Aware</Badge>
                  {isAdmin && <Badge className="border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-300/40 dark:bg-slate-500/25 dark:text-slate-50">{locationEntityLabel}: {zoneName.get(adminZoneId) || "Unassigned"}</Badge>}
                  <Badge className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/50 dark:bg-sky-500/25 dark:text-sky-50">Live DB rows: {filteredLedger.length}</Badge>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border bg-background/90 text-foreground hover:bg-muted dark:border-white/35 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
                  onClick={() => void refreshAll()}
                  disabled={exporting !== "none" || isRefreshing}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing
                    ? isSuperAdmin
                      ? "Requesting platform update..."
                      : "Requesting zone update..."
                    : isSuperAdmin
                      ? "Request platform update"
                      : "Request zone update"}
                </Button>
                <Button variant="outline" size="sm" className="border-border bg-background/90 text-foreground hover:bg-muted dark:border-white/35 dark:bg-transparent dark:text-white dark:hover:bg-white/10" onClick={() => void exportCsv()} disabled={exporting !== "none"}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting === "csv" ? "Preparing..." : "CSV"}
                </Button>
                <Button variant="outline" size="sm" className="border-border bg-background/90 text-foreground hover:bg-muted dark:border-white/35 dark:bg-transparent dark:text-white dark:hover:bg-white/10" onClick={() => void exportPdf()} disabled={exporting !== "none"}>
                  <Download className="h-4 w-4 mr-2" />
                  {exporting === "pdf" ? "Preparing..." : "PDF"}
                </Button>
              </div>
            </div>

            <div className={showInternalRiderFeatures ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8" : "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7"}>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Total Revenue</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{formatPrice(num(analytics?.platformRevenueTotal) || (num(analytics?.platformCommissionTotal) + num(analytics?.promotionRevenueTotal)))}</p></CardContent></Card>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Received Money</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{formatPrice(num(analytics?.totalReceivedMoney))}</p></CardContent></Card>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Processing Fees</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{formatPrice(num(analytics?.processingFeesTotal))}</p></CardContent></Card>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Orders Today</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{kpi.ordersToday}</p></CardContent></Card>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Orders Week</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{kpi.week}</p></CardContent></Card>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Deliveries</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{paidDeliveries.length}</p><p className="mt-auto pt-3 text-[11px] text-muted-foreground dark:text-white/70">{showInternalRiderFeatures ? `Successful rider and bus deliveries` : `Successful external and VIP bus deliveries`}</p></CardContent></Card>
              <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Successful Pickups</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{paidPickups.length}</p><p className="mt-auto pt-3 text-[11px] text-muted-foreground dark:text-white/70">Completed after QR or OTP pickup validation</p></CardContent></Card>
              {showInternalRiderFeatures ? <Card className="h-full border-border/70 bg-background/95 shadow-none dark:border-white/20 dark:bg-white/5"><CardContent className="flex h-full min-h-[132px] flex-col p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Online Riders</p><p className="mt-2 text-2xl font-semibold text-foreground dark:text-white">{onlineRiders}</p><p className="mt-auto pt-3 text-[11px] text-red-600 dark:text-red-300">{`${kpi.failed + kpi.delayed} failed/delayed`}</p></CardContent></Card> : null}
            </div>

            <CollapsibleDashboardSection
              title="How These Totals Work"
              summary="Expand to view what Total Revenue, Received Money, Processing Fees, and Deliveries each mean."
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-xl border border-border/70 bg-background/85 p-4">
                  <p className="text-sm font-medium">Total Revenue</p>
                  <p className="mt-1 text-sm text-muted-foreground">Commission and promotion revenue combined. This is platform-side revenue, not gross customer intake.</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/85 p-4">
                  <p className="text-sm font-medium">Received Money</p>
                  <p className="mt-1 text-sm text-muted-foreground">Gross paid customer amount across orders. It includes seller share, platform commission, delivery fees, and the exact checkout processing fee charged to the customer.</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/85 p-4">
                  <p className="text-sm font-medium">Processing Fees</p>
                  <p className="mt-1 text-sm text-muted-foreground">Customer-paid Paystack checkout fees recorded separately from commission and seller settlement.</p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/85 p-4">
                  <p className="text-sm font-medium">Deliveries</p>
                  <p className="mt-1 text-sm text-muted-foreground">Successful completed delivery orders only. Pickup completions are tracked separately after QR or OTP validation.</p>
                </div>
              </div>
            </CollapsibleDashboardSection>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Date Range</label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={preset} onChange={(e) => setPreset(e.target.value as any)}><option value="all">All Time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom</option></select></div>
              {preset !== "all" && <div className="space-y-1"><label className="text-xs text-muted-foreground">From</label><input type="date" value={fromDate} onChange={(e) => { setPreset("custom"); setFromDate(e.target.value); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>}
              {preset !== "all" && <div className="space-y-1"><label className="text-xs text-muted-foreground">To</label><input type="date" value={toDate} onChange={(e) => { setPreset("custom"); setToDate(e.target.value); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" /></div>}
              <div className="space-y-1"><label className="text-xs text-muted-foreground">Delivery Method</label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={methodFilter} onChange={(e) => setMethodFilter(e.target.value as any)}><option value="all">All</option>{showInternalRiderFeatures ? <option value="rider">Rider</option> : <option value="delivery">External Delivery</option>}<option value="bus">VIP Bus</option><option value="pickup">Pickup</option></select></div>
              {isSuperAdmin && showInternalRiderFeatures && <div className="space-y-1 md:col-span-2"><label className="text-xs text-muted-foreground">{locationEntityLabel}</label><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}><option value="all">All {locationEntityLabelPlural}</option>{zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}</select></div>}
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
                    {hasRevenueOverTimeData ? (
                      <ChartContainer config={{ revenue: { label: "Revenue", color: "#14b8a6" } }} className="h-[260px] w-full">
                        <AreaChart data={revenueTime}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="revenue" stroke="var(--color-revenue)" fill="var(--color-revenue)" fillOpacity={0.22} /></AreaChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-center text-sm text-muted-foreground">
                        No completed paid revenue found for the current filters.
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Revenue by Delivery Method</CardTitle><CardDescription>Method contribution</CardDescription></CardHeader>
                  <CardContent>
                    {hasRevenueByMethodData ? (
                      <ChartContainer config={{ revenue: { label: "Revenue", color: "#0ea5e9" } }} className="h-[260px] w-full">
                        <BarChart data={revenueByMethod}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} /></BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-center text-sm text-muted-foreground">
                        No delivery-method revenue is available for the current filters.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card className="xl:col-span-2">
                  <CardHeader><CardTitle>Revenue by Region</CardTitle><CardDescription>{showInternalRiderFeatures ? "Top regional performers" : "Top regional performance under manual delivery mode"}</CardDescription></CardHeader>
                  <CardContent>
                    {hasRevenueByRegionData ? (
                      <ChartContainer config={{ revenue: { label: "Revenue", color: "#22c55e" } }} className="h-[250px] w-full">
                        <BarChart data={revenueByRegion}><CartesianGrid vertical={false} /><XAxis dataKey="region" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="revenue" fill="var(--color-revenue)" radius={[6, 6, 0, 0]} /></BarChart>
                      </ChartContainer>
                    ) : (
                      <div className="flex h-[250px] items-center justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 text-center text-sm text-muted-foreground">
                        No regional revenue is available for the current filters.
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Platform Fees vs Payouts</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Platform Revenue</p><p className="text-lg font-semibold">{formatPrice(finance.fees)}</p><p className="mt-1 text-[11px] text-muted-foreground">Commission + promotion</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Platform Commission</p><p className="text-lg font-semibold">{formatPrice(finance.commission)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Promotion Revenue</p><p className="text-lg font-semibold">{formatPrice(finance.promotion)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Processing Fees</p><p className="text-lg font-semibold">{formatPrice(finance.processing)}</p></div>
                    <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Seller Settlements</p><p className="text-lg font-semibold">{formatPrice(finance.payouts)}</p></div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <Card><CardHeader><CardTitle>Order Lifecycle Funnel</CardTitle></CardHeader><CardContent className="space-y-2">{ops.funnel.map((f) => <div key={f.status} className="space-y-1"><div className="flex items-center justify-between text-sm"><span className="capitalize">{f.status}</span><span className="font-medium">{f.count}</span></div><div className="h-1.5 rounded bg-muted"><div className="h-full rounded bg-primary" style={{ width: `${Math.min(100, f.count * 5)}%` }} /></div></div>)}</CardContent></Card>
                <Card><CardHeader><CardTitle>Operations & Performance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{showInternalRiderFeatures ? <div className="flex justify-between"><span>Rider Assignment Success</span><span className="font-semibold">{ops.assignmentRate.toFixed(1)}%</span></div> : <div className="flex justify-between"><span>External Dispatch Volume</span><span className="font-semibold">{kpi.deliveryActive}</span></div>}<div className="flex justify-between"><span>Average Delivery Time</span><span className="font-semibold">{fm(ops.avgTime)}</span></div><div className="flex justify-between"><span>Bus Completion Rate</span><span className="font-semibold">{ops.busRate.toFixed(1)}%</span></div><div className="flex justify-between"><span>Orders This Month</span><span className="font-semibold">{kpi.month}</span></div></CardContent></Card>
                <Card><CardHeader><CardTitle>Real-Time System Activity</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><span>Dispatch backlog: {messaging?.operations?.dispatchBacklog || 0}</span></div><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-500" /><span>Message queue: {messaging?.messageQueue?.queueSize || 0}</span></div><div className="flex items-center gap-2"><MapPin className="h-4 w-4 text-red-500" /><span>{showInternalRiderFeatures ? `Stale GPS orders: ${health?.tracking?.staleGpsOrders || 0}` : `Manual delivery exceptions: ${kpi.failed + kpi.delayed}`}</span></div><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /><span>In transit: {health?.pipeline?.inTransit || 0}</span></div>{showInternalRiderFeatures ? <div className="flex items-center gap-2"><Bus className="h-4 w-4 text-blue-500" /><span>Searching rider: {health?.pipeline?.searchingRider || 0}</span></div> : <div className="flex items-center gap-2"><Bus className="h-4 w-4 text-blue-500" /><span>External dispatch arranged: {filtered.filter((o) => n(o.status) === "external_dispatch_arranged").length}</span></div>}</CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Live Order Feed</CardTitle></CardHeader>
                  <CardContent className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    {feed.map((o) => (
                      <div key={o.id} className="rounded-lg border p-3 flex items-center justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-medium truncate">#{o.orderNumber}</p>
                          <p className="text-xs text-muted-foreground truncate capitalize">
                            {getStatusLabel(o.status)} | {resolveOrderRegion(o)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground">{new Date(o.updatedAt || o.createdAt).toLocaleTimeString()}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
                <Card><CardHeader><CardTitle>User & Role Analytics</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">{roleStats.map((r) => <div key={r.role} className="rounded-xl border border-border/70 bg-background/90 p-3 shadow-sm"><p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{r.role}</p><p className="mt-2 text-xl font-semibold">{r.active}/{r.total}</p><p className="mt-1 text-xs text-muted-foreground">Active / Total</p></div>)}</div><div className="space-y-2"><p className="text-sm font-medium">Seller Performance Ranking</p>{topSellers.map((s, i) => <div key={`${s.name}-${i}`} className="flex justify-between text-sm"><span className="truncate">{s.name}</span><span className="font-semibold">{formatPrice(s.revenue)}</span></div>)}</div>{showInternalRiderFeatures ? <div className="space-y-2"><p className="text-sm font-medium">Rider Performance Metrics</p>{topRiders.map((r, i) => <div key={`${r.name}-${i}`} className="flex justify-between text-sm"><span className="truncate">{r.name}</span><span className="font-semibold">{r.completed} completed</span></div>)}</div> : <div className="space-y-2"><p className="text-sm font-medium">Manual Delivery Oversight</p><div className="flex justify-between text-sm"><span>External delivery orders</span><span className="font-semibold">{kpi.deliveryActive}</span></div><div className="flex justify-between text-sm"><span>VIP bus orders</span><span className="font-semibold">{kpi.busActive}</span></div></div>}<div className="rounded-lg border p-3 text-sm"><p className="font-medium mb-1">Customer Agent Activity Metrics</p><p>Open: {num(support?.totals?.open)} | Assigned: {num(support?.totals?.assigned)} | Resolved: {num(support?.totals?.resolved)}</p><p className="text-muted-foreground">Avg first response: {Math.round(num(support?.responseTime?.avgFirstResponseSeconds) / 60)} min</p></div></CardContent></Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Real-Time Transaction & Order Ledger</CardTitle>
                  <CardDescription>Live DB-backed flow including completion state, seller paid values, and platform commission per order.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-card z-10">
                        <tr className="border-b">
                          <th className="text-left px-4 py-2 font-medium">Order</th>
                          <th className="text-left px-4 py-2 font-medium">Status</th>
                          <th className="text-left px-4 py-2 font-medium">Completed</th>
                          <th className="text-left px-4 py-2 font-medium">Seller Paid</th>
                          <th className="text-left px-4 py-2 font-medium">Commission</th>
                          <th className="text-left px-4 py-2 font-medium">Transaction</th>
                          <th className="text-left px-4 py-2 font-medium">Flow</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredLedger.slice(0, 120).map((row) => (
                          <tr key={`${row.order_id}-${row.transaction_id || "tx"}`} className="border-b last:border-0">
                            <td className="px-4 py-2 min-w-[220px]">
                              <p className="font-medium truncate">#{row.order_number || row.order_id}</p>
                              <p className="text-xs text-muted-foreground truncate">{toText(row.store_name || row.seller_name || "Unknown Seller")}</p>
                            </td>
                            <td className="px-4 py-2 capitalize">{toText(row.order_status || "").replace(/_/g, " ") || "pending"}</td>
                            <td className="px-4 py-2">{row.is_completed ? "Yes" : "No"}</td>
                            <td className="px-4 py-2">{formatPrice(num(row.seller_amount))}</td>
                            <td className="px-4 py-2">{formatPrice(num(row.commission_amount))}</td>
                            <td className="px-4 py-2">
                              <p>{toText(row.transaction_status || "N/A")}</p>
                              <p className="text-xs text-muted-foreground truncate">{toText(row.payment_reference || row.transaction_id || "")}</p>
                            </td>
                            <td className="px-4 py-2 min-w-[320px] text-xs text-muted-foreground">{statusFlow(row.status_flow, row.order_status)}</td>
                          </tr>
                        ))}
                        {!filteredLedger.length && (
                          <tr>
                            <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={7}>
                              No ledger rows found for the current filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card className="border-blue-500/25"><CardContent className="p-4 text-sm text-muted-foreground">{showInternalRiderFeatures ? "Zone-scoped mode is active. Global financial and cross-zone analytics are intentionally hidden for admins." : "Zone-scoped mode is active. Global financial and cross-zone analytics remain hidden for admins while manual delivery mode is active."}</CardContent></Card>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{locationEntityLabel} Orders</p><p className="text-2xl font-semibold">{zoneOrders.length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Completed</p><p className="text-2xl font-semibold">{zoneOrders.filter((o) => completed(o.status)).length}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{locationEntityLabel} Revenue</p><p className="text-2xl font-semibold">{formatPrice(zoneOrders.filter((o) => completed(o.status) && paid(o.paymentStatus)).reduce((s, o) => s + num(o.total), 0))}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{showInternalRiderFeatures ? "Rider Availability" : "Service Alerts"}</p><p className="text-2xl font-semibold">{showInternalRiderFeatures ? onlineRiders : kpi.failed + kpi.delayed}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">SLA Risk</p><p className="text-2xl font-semibold">{kpi.delayed}</p></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <Card><CardHeader><CardTitle>Delivery Success vs Failure</CardTitle></CardHeader><CardContent><ChartContainer config={{ value: { label: "Count", color: "#06b6d4" } }} className="h-[240px] w-full"><BarChart data={[{ label: "Completed", value: zoneOrders.filter((o) => completed(o.status)).length }, { label: "Failed", value: zoneOrders.filter((o) => FAILED.has(n(o.status))).length }, { label: "Active", value: zoneOrders.filter((o) => ACTIVE.has(n(o.status))).length }]}><CartesianGrid vertical={false} /><XAxis dataKey="label" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} /></BarChart></ChartContainer></CardContent></Card>
                <Card><CardHeader><CardTitle>Daily Operational Summary</CardTitle></CardHeader><CardContent><ChartContainer config={{ orders: { label: "Orders", color: "#22c55e" } }} className="h-[240px] w-full"><AreaChart data={Array.from(zoneOrders.reduce((m, o) => { const key = dayKey(o.createdAt); m.set(key, (m.get(key) || 0) + 1); return m; }, new Map<string, number>())).map(([day, value]) => ({ day: day.slice(5), value }))}><CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} /><ChartTooltip content={<ChartTooltipContent />} /><Area dataKey="value" stroke="var(--color-orders)" fill="var(--color-orders)" fillOpacity={0.22} /></AreaChart></ChartContainer></CardContent></Card>
              </div>

              <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                {showInternalRiderFeatures ? <Card><CardHeader><CardTitle>Rider Performance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Total Riders ({locationEntityLabel.toLowerCase()})</span><span className="font-semibold">{riders.filter((r) => String(r.deliveryZoneId || "") === adminZoneId).length}</span></div><div className="flex justify-between"><span>Online Riders</span><span className="font-semibold">{onlineRiders}</span></div><div className="flex justify-between"><span>Active Deliveries</span><span className="font-semibold">{zoneOrders.filter((o) => ACTIVE.has(n(o.status))).length}</span></div></CardContent></Card> : <Card><CardHeader><CardTitle>Delivery Performance</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Active Deliveries</span><span className="font-semibold">{zoneOrders.filter((o) => ACTIVE.has(n(o.status))).length}</span></div><div className="flex justify-between"><span>External Deliveries</span><span className="font-semibold">{zoneOrders.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "delivery").length}</span></div><div className="flex justify-between"><span>VIP Bus Deliveries</span><span className="font-semibold">{zoneOrders.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "bus").length}</span></div><div className="flex justify-between"><span>Pickup Orders</span><span className="font-semibold">{zoneOrders.filter((o) => normalizeDeliveryMethod(o.deliveryMethod, o) === "pickup").length}</span></div></CardContent></Card>}
                <Card><CardHeader><CardTitle>SLA Metrics</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span>Average Delivery Time</span><span className="font-semibold">{fm(ops.avgTime)}</span></div><div className="flex justify-between"><span>Bus Completion Rate</span><span className="font-semibold">{ops.busRate.toFixed(1)}%</span></div><div className="flex justify-between"><span>Intervention Backlog</span><span className="font-semibold">{num(support?.unresolvedBacklog?.over30MinutesWithoutFirstResponse)}</span></div></CardContent></Card>
                <Card><CardHeader><CardTitle>Operational Alerts</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><span>Dispatch backlog: {messaging?.operations?.dispatchBacklog || 0}</span></div><div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-amber-500" /><span>Message queue: {messaging?.messageQueue?.queueSize || 0}</span></div><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-blue-500" /><span>In transit: {health?.pipeline?.inTransit || 0}</span></div></CardContent></Card>
              </div>
            </>
          )
        )}

        <Card>
          <CardHeader>
            <CardTitle>Report Activity Log</CardTitle>
            <CardDescription>Read-only, real-time audit trail of report requests, generations, and downloads.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[280px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b">
                    <th className="px-4 py-2 text-left font-medium">Time</th>
                    <th className="px-4 py-2 text-left font-medium">Requester</th>
                    <th className="px-4 py-2 text-left font-medium">Action</th>
                    <th className="px-4 py-2 text-left font-medium">Report</th>
                    <th className="px-4 py-2 text-left font-medium">Format</th>
                    <th className="px-4 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {reportActivity.slice(0, 40).map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="px-4 py-2 whitespace-nowrap text-xs">{new Date(entry.createdAt).toLocaleString()}</td>
                      <td className="px-4 py-2">
                        <p className="font-medium truncate">{entry.requesterName || entry.requesterEmail || entry.requestedBy}</p>
                        <p className="text-xs text-muted-foreground">{entry.requesterRole}</p>
                      </td>
                      <td className="px-4 py-2 capitalize">{entry.action}</td>
                      <td className="px-4 py-2">{entry.reportType}</td>
                      <td className="px-4 py-2 uppercase">{entry.format || "-"}</td>
                      <td className="px-4 py-2 capitalize">{entry.status || "success"}</td>
                    </tr>
                  ))}
                  {!reportActivity.length && (
                    <tr>
                      <td className="px-4 py-6 text-sm text-muted-foreground" colSpan={6}>
                        No report activity logged yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}



