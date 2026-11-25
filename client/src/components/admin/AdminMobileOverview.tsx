/**
 * Mobile overview for the Super Admin / Admin dashboard (below 768px only).
 *
 * Approved by the product owner on 2026-11-25 from a reference design,
 * adapted to KiyuMart: GHS only, existing brand colours (theme primary +
 * mobile teal #009688/#00897B), and only figures the platform already records.
 * The desktop dashboard is unchanged; the full existing sections still render
 * underneath this overview on phones.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import {
  ShoppingCart, Wallet, Store, Tag, BarChart3, ClipboardList, UserCheck, CreditCard,
  Bike, ChevronRight, PieChart, Crown, ShoppingBag,
} from "lucide-react";

type OrderLike = { id: string; orderNumber?: string; total?: string; status?: string; paymentStatus?: string; createdAt?: string; customerInfo?: { name?: string } | null };

export interface AdminMobileOverviewProps {
  userName: string;
  totalOrders: number;
  platformRevenue?: number;
  ordersChange?: number;
  revenueChange?: number;
  orders: OrderLike[];
  pendingApplications: number;
  sellerPaymentAlerts: number;
  pendingAssignments: number;
  /** Internal rider system on (isExternalRiderSystemEnabled === false): show rider items. */
  showRiderItems: boolean;
  formatPrice: (n: number) => string;
  navigate: (to: string) => void;
}

const TEAL = "#009688";
// Existing palette only: brand teal shades, brand amber, neutral grey.
const SLICE_COLOURS = ["#00897B", TEAL, "#4DB6AC", "#F59E0B", "#80CBC4", "#B0BEC5"];

const isPaid = (s?: string) => ["paid", "completed", "success"].includes(String(s || "").toLowerCase());

function Change({ value }: { value?: number }) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const up = value >= 0;
  return (
    <span
      className={`mt-1 inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold ${
        up ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-red-500/15 text-red-600 dark:text-red-400"
      }`}
      title="Compared with the previous 30 days"
    >
      {up ? "▲" : "▼"} {Math.abs(value)}%
    </span>
  );
}

function StatCard({ icon: Icon, label, value, change, onClick }: { icon: any; label: string; value: string; change?: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 items-start gap-2.5 rounded-2xl border bg-card p-3 text-left shadow-sm active:scale-[0.98] transition-transform"
      style={{ minHeight: 0 }}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full max-[359px]:hidden" style={{ background: "rgba(0,150,136,.12)", color: TEAL }}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block whitespace-nowrap text-[11px] text-muted-foreground">{label}</span>
        <span className="block whitespace-nowrap text-[15px] font-bold tabular-nums leading-tight max-[359px]:text-sm">{value}</span>
        <Change value={change} />
      </span>
    </button>
  );
}

function SalesChart({ orders, formatPrice }: { orders: OrderLike[]; formatPrice: (n: number) => string }) {
  const days = useMemo(() => {
    const out: { key: string; label: string; sales: number; count: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today.getTime() - i * 86400000);
      out.push({ key: d.toDateString(), label: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), sales: 0, count: 0 });
    }
    const idx = new Map(out.map((d, i) => [d.key, i]));
    for (const o of orders) {
      if (!o.createdAt || !isPaid(o.paymentStatus)) continue;
      const d = new Date(o.createdAt);
      d.setHours(0, 0, 0, 0);
      const i = idx.get(d.toDateString());
      if (i === undefined) continue;
      out[i].sales += Number.parseFloat(o.total || "0") || 0;
      out[i].count += 1;
    }
    return out;
  }, [orders]);

  const W = 300, H = 110, PAD = 6;
  const maxSales = Math.max(...days.map((d) => d.sales), 1);
  const maxCount = Math.max(...days.map((d) => d.count), 1);
  const x = (i: number) => (i * W) / (days.length - 1);
  const ys = (v: number) => H - PAD - (v / maxSales) * (H - PAD * 2);
  const yc = (v: number) => H - PAD - (v / maxCount) * (H - PAD * 2) * 0.55;
  const salesLine = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${ys(d.sales).toFixed(1)}`).join(" ");
  const countLine = days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yc(d.count).toFixed(1)}`).join(" ");
  const total = days.reduce((s, d) => s + d.sales, 0);
  const totalCount = days.reduce((s, d) => s + d.count, 0);
  const ticks = [0, 7, 14, 21, 29];

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-primary" />Sales ({formatPrice(total)})</span>
        <span className="inline-flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full" style={{ background: "#4DB6AC" }} />Orders ({totalCount})</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-28 w-full text-primary" preserveAspectRatio="none" role="img" aria-label={`Paid sales over the last 30 days: ${formatPrice(total)} from ${totalCount} orders`}>
        <defs>
          <linearGradient id="kmSalesFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${salesLine} L${W},${H} L0,${H} Z`} fill="url(#kmSalesFill)" />
        <path d={salesLine} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" />
        <path d={countLine} fill="none" stroke="#4DB6AC" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-0.5 flex justify-between text-[10px] text-muted-foreground">
        {ticks.map((t) => <span key={t}>{days[t].label}</span>)}
      </div>
      {totalCount === 0 && <p className="mt-2 text-center text-xs text-muted-foreground">No paid orders in the last 30 days yet.</p>}
    </div>
  );
}

function CategoryDonut({ products, categories }: { products: any[]; categories: any[] }) {
  const slices = useMemo(() => {
    const names = new Map(categories.map((c: any) => [String(c.id), String(c.name || "Other")]));
    const counts = new Map<string, number>();
    for (const p of products) {
      const name = names.get(String(p.categoryId)) || "Other";
      counts.set(name, (counts.get(name) || 0) + 1);
    }
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5).reduce((s, [, n]) => s + n, 0);
    if (rest) top.push(["Others", rest]);
    return top;
  }, [products, categories]);
  const total = products.length;
  const r = 38, C = 2 * Math.PI * r;
  let offset = 0;

  if (!total) {
    return <p className="py-3 text-center text-xs text-muted-foreground">No products yet. Categories will fill in as sellers list items.</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 100 100" className="h-28 w-28 shrink-0" role="img" aria-label={`${total} products by category`}>
        {slices.map(([name, n], i) => {
          const len = (C * n) / total;
          const el = (
            <circle key={name} r={r} cx={50} cy={50} fill="none" stroke={SLICE_COLOURS[i % SLICE_COLOURS.length]} strokeWidth={16}
              strokeDasharray={`${Math.max(len - 1, 0.5)} ${C}`} strokeDashoffset={-offset} transform="rotate(-90 50 50)" />
          );
          offset += len;
          return el;
        })}
        <text x="50" y="50" textAnchor="middle" fontSize="14" fontWeight="700" fill="currentColor">{total}</text>
        <text x="50" y="62" textAnchor="middle" fontSize="8" fill="currentColor" opacity="0.6">products</text>
      </svg>
      <div className="grid min-w-0 flex-1 gap-1">
        {slices.map(([name, n], i) => (
          <div key={name} className="flex items-center gap-1.5 text-[11px]">
            <i className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: SLICE_COLOURS[i % SLICE_COLOURS.length] }} />
            <span className="min-w-0 flex-1 truncate">{name}</span>
            <b className="tabular-nums">{Math.round((n / total) * 1000) / 10}%</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AdminMobileOverview(props: AdminMobileOverviewProps) {
  const { userName, totalOrders, platformRevenue, ordersChange, revenueChange, orders, formatPrice, navigate } = props;
  const firstName = (userName || "Admin").split(" ")[0];

  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores", "admin-mobile-overview"],
    queryFn: () => fetchApiJson<any[]>("/api/stores?isActive=true&isApproved=true", { credentials: "include" }),
    staleTime: 60000,
  });
  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products", "admin-mobile-overview"],
    queryFn: () => fetchApiJson<any[]>("/api/products?isActive=true", { credentials: "include" }),
    staleTime: 60000,
  });
  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories", "admin-mobile-overview"],
    queryFn: () => fetchApiJson<any[]>("/api/categories", { credentials: "include" }),
    staleTime: 300000,
  });
  const safeStores = Array.isArray(stores) ? stores : [];
  const safeProducts = Array.isArray(products) ? products : [];
  const safeCategories = Array.isArray(categories) ? categories : [];

  const pending = [
    { key: "apps", icon: UserCheck, label: props.showRiderItems ? "Seller & rider applications" : "Seller applications", n: props.pendingApplications, to: "/admin/applications" },
    { key: "pay", icon: CreditCard, label: "Seller payment alerts", n: props.sellerPaymentAlerts, to: "/admin/sellers" },
    ...(props.showRiderItems
      ? [{ key: "assign", icon: Bike, label: "Orders awaiting a rider", n: props.pendingAssignments, to: "/admin/orders" }]
      : []),
  ];
  const pendingTotal = pending.reduce((s, p) => s + (p.n || 0), 0);
  const recent = [...orders]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 3);

  return (
    <section className="space-y-3 md:hidden" data-admin-mobile-overview>
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#00897B] p-4 text-white">
        <p className="text-lg font-bold leading-tight">
          Welcome back,<br />{firstName} <Crown className="inline h-4 w-4 -translate-y-0.5 text-amber-300" />
        </p>
        <p className="mt-1 max-w-[62%] text-xs opacity-85">Here's how KiyuMart is doing today.</p>
        <ShoppingBag className="absolute -bottom-2 right-3 h-20 w-20 opacity-20" strokeWidth={1.5} aria-hidden />
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard icon={ShoppingCart} label="Total orders" value={totalOrders.toLocaleString("en-GH")} change={ordersChange} onClick={() => navigate("/admin/orders")} />
        <StatCard icon={Wallet} label="Platform revenue" value={typeof platformRevenue === "number" ? formatPrice(platformRevenue) : "…"} change={revenueChange} />
        <StatCard icon={Store} label="Active sellers" value={safeStores.length.toLocaleString("en-GH")} onClick={() => navigate("/admin/sellers")} />
        <StatCard icon={Tag} label="Total products" value={safeProducts.length.toLocaleString("en-GH")} onClick={() => navigate("/admin/products")} />
      </div>

      {/* Sales overview */}
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" style={{ color: TEAL }} />
          <div>
            <p className="text-sm font-bold leading-tight">Sales overview</p>
            <p className="text-[11px] text-muted-foreground">Paid orders, last 30 days</p>
          </div>
        </div>
        <SalesChart orders={orders} formatPrice={formatPrice} />
      </div>

      {/* Pending actions */}
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <ClipboardList className="h-4 w-4" style={{ color: TEAL }} />
          <p className="text-sm font-bold">Pending actions</p>
          {pendingTotal > 0 && <span className="rounded-full bg-red-500 px-2 text-[11px] font-bold text-white">{pendingTotal}</span>}
        </div>
        {pending.map(({ key, icon: Icon, label, n, to }) => (
          <button key={key} type="button" onClick={() => navigate(to)} className="flex w-full items-center gap-3 border-t py-2.5 text-left text-[13px] first-of-type:border-t-0">
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex-1">{label}</span>
            <span className={`rounded-lg px-2 text-[11px] font-bold ${n ? "bg-red-500/12 text-red-600 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>{n || 0}</span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Products by category */}
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <PieChart className="h-4 w-4" style={{ color: TEAL }} />
          <p className="text-sm font-bold">Products by category</p>
        </div>
        <CategoryDonut products={safeProducts} categories={safeCategories} />
      </div>

      {/* Recent orders */}
      <div className="rounded-2xl border bg-card p-3 shadow-sm">
        <div className="mb-1 flex items-center">
          <p className="text-sm font-bold">Recent orders</p>
          <button type="button" onClick={() => navigate("/admin/orders")} className="ml-auto text-xs font-semibold" style={{ color: TEAL, minHeight: 0 }}>See all</button>
        </div>
        {recent.length === 0 ? (
          <p className="py-2 text-xs text-muted-foreground">No orders yet.</p>
        ) : recent.map((o) => (
          <div key={o.id} className="flex items-center gap-2 border-t py-2 text-[12.5px] first-of-type:border-t-0">
            <span className="min-w-0 flex-1 truncate"><b>#{o.orderNumber || o.id.slice(0, 6)}</b> · {o.customerInfo?.name || "Customer"} · {formatPrice(Number.parseFloat(o.total || "0") || 0)}</span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${isPaid(o.paymentStatus) ? "bg-green-500/15 text-green-700 dark:text-green-400" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}>
              {isPaid(o.paymentStatus) ? "Paid" : "Pending"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
