import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  buildCsv,
  logReportActivity,
  openPrintReportWindow,
  renderPrintReportError,
  renderPrintReportWindow,
  triggerDownload,
} from "@/lib/reporting";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { DollarSign, Download, Loader2, ShoppingCart, TrendingUp } from "lucide-react";
import pdfLogoDark from "@assets/kiyumart_logo_dark.png";
import pdfLogoLight from "@assets/kiyumart_logo_light.png";

type OrderRow = {
  id: string;
  status: string;
  paymentStatus?: string;
  total: string;
  subtotal?: string | number | null;
  couponDiscount?: string | number | null;
  deliveryMethod: string;
  createdAt: string;
  deliveredAt?: string | null;
};

type Analytics = {
  totalRevenue?: number;
  totalOrders?: number;
  totalReceivedMoney?: number;
  sellerSettlementTotal?: number;
  pendingPayoutValue?: number;
  availableBalance?: number;
  completedPayoutValue?: number;
  platformCommissionTotal?: number;
  processingFeesTotal?: number;
};
type ReceiptSummary = {
  id: string;
  receiptNumber: string;
  orderId: string;
  orderNumber: string;
  orderStatus: string;
  paymentStatus: string;
  total: string;
  currency: string;
  updatedAt: string;
};

const n = (v?: string | null) => String(v || "").toLowerCase().trim();
const num = (v: unknown) => Number(v || 0) || 0;
const paid = (s?: string | null) => ["completed", "paid", "success"].includes(n(s));
const completed = (s?: string | null) => ["completed", "delivered"].includes(n(s));
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
const dayKey = (v?: string | null) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

export default function SellerAnalytics() {
  const { user } = useAuth();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  const [range, setRange] = useState<"7d" | "30d" | "90d" | "all">("all");
  const [exporting, setExporting] = useState<"none" | "csv" | "pdf">("none");
  const [, navigate] = useLocation();

  const { data: stats, isLoading: statsLoading, isFetching: statsFetching } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    enabled: !!user && user.role === "seller",
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const { data: orders = [], isLoading: ordersLoading, isFetching: ordersFetching } = useQuery<OrderRow[]>({
    queryKey: ["/api/orders", "seller-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/orders?context=seller", { credentials: "include" });
      if (!r.ok) throw new Error("Failed to fetch seller orders");
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: !!user && user.role === "seller",
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const { data: receipts = [] } = useQuery<ReceiptSummary[]>({
    queryKey: ["/api/receipts", "seller-analytics"],
    queryFn: async () => {
      const r = await fetch("/api/receipts?limit=8", { credentials: "include" });
      if (!r.ok) return [];
      const p = await r.json();
      return Array.isArray(p) ? p : [];
    },
    enabled: !!user && user.role === "seller",
    refetchInterval: 120_000,
    refetchOnWindowFocus: false,
    refetchIntervalInBackground: false,
    staleTime: 60_000,
  });

  const startDate = useMemo(() => {
    if (range === "all") return new Date(0);
    const d = new Date();
    d.setDate(d.getDate() - (range === "7d" ? 6 : range === "30d" ? 29 : 89));
    d.setHours(0, 0, 0, 0);
    return d;
  }, [range]);

  const scoped = useMemo(() => orders.filter((o) => new Date(o.createdAt) >= startDate), [orders, startDate]);
  const paidCompleted = useMemo(() => scoped.filter((o) => paid(o.paymentStatus) && completed(o.status)), [scoped]);

  // Gross product revenue = subtotal - couponDiscount (excludes delivery fee and processing fee
  // since those go to riders/platform, not the seller).
  const productRevenue = (o: OrderRow) =>
    Math.max(0, num(o.subtotal ?? o.total) - num(o.couponDiscount ?? 0));

  const totals = useMemo(() => {
    const completedCount = scoped.filter((o) => completed(o.status)).length;
    const cancelledCount = scoped.filter((o) => ["cancelled", "disputed"].includes(n(o.status))).length;
    const revenue = paidCompleted.reduce((sum, o) => sum + productRevenue(o), 0);
    const aov = paidCompleted.length ? revenue / paidCompleted.length : 0;
    const paidRate = scoped.length ? (paidCompleted.length / scoped.length) * 100 : 0;
    return { completedCount, cancelledCount, revenue, aov, paidRate };
  }, [paidCompleted, scoped]);

  const salesTrend = useMemo(() => {
    const map = new Map<string, { revenue: number; orders: number }>();
    paidCompleted.forEach((o) => {
      const k = dayKey(o.deliveredAt || o.createdAt);
      const row = map.get(k) || { revenue: 0, orders: 0 };
      row.revenue += productRevenue(o);
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
    paidCompleted.forEach((o) => {
      const method = n(o.deliveryMethod);
      const normalizedMethod = !showInternalRiderFeatures && method === "rider" ? "delivery" : method;
      map.set(normalizedMethod, (map.get(normalizedMethod) || 0) + 1);
    });
    return [
      { method: showInternalRiderFeatures ? "Rider" : "External Delivery", count: showInternalRiderFeatures ? (map.get("rider") || 0) : (map.get("delivery") || 0) },
      { method: "VIP Bus", count: map.get("bus") || 0 },
      { method: "Pickup", count: map.get("pickup") || 0 },
    ];
  }, [paidCompleted, showInternalRiderFeatures]);

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
  const refreshing = !loading && (statsFetching || ordersFetching);

  // Date-scoped financial metrics computed from orders
  const scopedGrossSales = totals.revenue;
  const allTimeGross = num(stats?.totalRevenue);
  const commissionRate = allTimeGross > 0 && num(stats?.platformCommissionTotal) > 0
    ? num(stats?.platformCommissionTotal) / allTimeGross
    : 0.01; // default 1%
  const scopedNetPayout = Math.max(0, scopedGrossSales * (1 - commissionRate));
  const scopedCommission = Math.max(0, scopedGrossSales * commissionRate);

  // All-time wallet/payout figures from server (not date-filterable without backend changes)
  const availableWallet = num(stats?.availableBalance ?? stats?.sellerSettlementTotal ?? stats?.totalReceivedMoney);
  const pendingPayoutTotal = num(stats?.pendingPayoutValue);
  const sellerWalletTotal = num(stats?.completedPayoutValue);
  const reportType = "seller_performance_analytics";
  const reportScope = { range, scopedOrders: scoped.length };
  const exportRows = scoped.map((order) => ({
    order_id: order.id,
    status: order.status,
    payment_status: order.paymentStatus || "",
    delivery_method: order.deliveryMethod,
    total: Number(order.total || 0).toFixed(2),
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
      triggerDownload(new Blob([data], { type: "text/csv;charset=utf-8;" }), `seller-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
      await logReportActivity({ action: "download", reportType, format: "csv", scope: reportScope, status: "success" });
    } catch {
      await logReportActivity({ action: "generate", reportType, format: "csv", scope: reportScope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  const handleExportPdf = async () => {
    const reportWindow = openPrintReportWindow("KiyuMart Seller Analytics", "Preparing your premium analytics report...");
    await logReportActivity({ action: "request", reportType, format: "pdf", scope: reportScope, status: "success" });
    try {
      setExporting("pdf");
      const prefersDarkPdf = false;
      const pdfLogoUrl = new URL(prefersDarkPdf ? pdfLogoLight : pdfLogoDark, window.location.origin).toString();
      const orderRowsMarkup =
        exportRows.length > 0
          ? exportRows
              .slice(0, 12)
              .map(
                (row) => `
                  <tr>
                    <td>
                      <div class="table-primary">${escapeHtml(row.order_id)}</div>
                      <div class="table-secondary">${escapeHtml(formatDateTime(row.created_at))}</div>
                    </td>
                    <td>${escapeHtml(row.status)}</td>
                    <td>${escapeHtml(row.payment_status || "pending")}</td>
                    <td>${escapeHtml(row.delivery_method)}</td>
                    <td class="table-amount">GHS ${escapeHtml(row.total)}</td>
                  </tr>
                `,
              )
              .join("")
          : "";

      const receiptsMarkup =
        receipts.length > 0
          ? receipts
              .slice(0, 8)
              .map(
                (receipt) => `
                  <div class="compact-row">
                    <span>${escapeHtml(receipt.receiptNumber)}</span>
                    <span>${escapeHtml(receipt.orderNumber)}</span>
                    <span>GHS ${escapeHtml(Number(receipt.total || 0).toFixed(2))}</span>
                  </div>
                `,
              )
              .join("")
          : `<div class="empty-state">No recent receipts available.</div>`;

      const deliveryMarkup = byMethod
        .map(
          (entry) => `
            <div class="compact-row">
              <span>${escapeHtml(entry.method)}</span>
              <span>${escapeHtml(String(entry.count))} completed</span>
            </div>
          `,
        )
        .join("");

      const trendMarkup =
        salesTrend.length > 0
          ? salesTrend
              .slice(-7)
              .map(
                (point) => `
                  <div class="compact-row">
                    <span>${escapeHtml(point.day)}</span>
                    <span>GHS ${escapeHtml(point.revenue.toFixed(2))} • ${escapeHtml(String(point.orders))} orders</span>
                  </div>
                `,
              )
              .join("")
          : `<div class="empty-state">No sales trend data available in this range.</div>`;

      if (!reportWindow) {
        throw new Error("Please allow pop-ups so your PDF report can open.");
      }

      renderPrintReportWindow(reportWindow, "KiyuMart Seller Analytics", `
        <!DOCTYPE html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>KiyuMart Seller Analytics</title>
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
              body {
                margin: 0;
                font-family: "Segoe UI", Arial, sans-serif;
                color: var(--ink);
                background: #eef4f7;
              }
              .page {
                max-width: 980px;
                margin: 0 auto;
                min-height: 100vh;
                background: var(--surface);
              }
              .hero {
                padding: 34px 40px 28px;
                background:
                  linear-gradient(135deg, rgba(11, 143, 116, 0.16), rgba(9, 34, 76, 0.06)),
                  linear-gradient(180deg, #ffffff, #f8fbfc);
                border-bottom: 1px solid var(--border);
              }
              .hero-top {
                display: flex;
                align-items: center;
                gap: 16px;
              }
              .hero-top img {
                height: 42px;
                width: auto;
                object-fit: contain;
              }
              .eyebrow {
                display: inline-block;
                padding: 6px 12px;
                border-radius: 999px;
                background: var(--accent-soft);
                color: var(--accent);
                font-size: 12px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              h1 {
                margin: 14px 0 8px;
                font-size: 34px;
                line-height: 1.05;
              }
              .hero-copy {
                max-width: 620px;
                color: var(--muted);
                font-size: 15px;
                line-height: 1.6;
              }
              .summary-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 14px;
                margin-top: 24px;
              }
              .summary-card {
                border: 1px solid var(--border);
                border-radius: 18px;
                padding: 16px 18px;
                background: rgba(255, 255, 255, 0.9);
              }
              .summary-label {
                color: var(--muted);
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.08em;
              }
              .summary-value {
                margin-top: 8px;
                font-size: 24px;
                font-weight: 700;
              }
              .content {
                padding: 28px 40px 40px;
              }
              .section {
                margin-top: 28px;
              }
              .section:first-child {
                margin-top: 0;
              }
              .section-heading {
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0 0 14px;
              }
              .section-icon {
                width: 30px;
                height: 30px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                background: var(--accent-soft);
                color: var(--accent);
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.06em;
                text-transform: uppercase;
              }
              .section-title {
                margin: 0;
                font-size: 18px;
                font-weight: 700;
              }
              .report-table-wrap {
                border: 1px solid var(--border);
                border-radius: 18px;
                overflow: hidden;
                background: var(--surface);
              }
              .report-table {
                width: 100%;
                border-collapse: collapse;
              }
              .report-table thead {
                background: #f4f8fb;
              }
              .report-table th,
              .report-table td {
                padding: 14px 16px;
                border-bottom: 1px solid var(--border);
                text-align: left;
                vertical-align: top;
                font-size: 14px;
              }
              .report-table th {
                color: var(--muted);
                font-size: 12px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                font-weight: 700;
              }
              .report-table tbody tr:last-child td {
                border-bottom: none;
              }
              .table-primary {
                font-weight: 700;
                font-size: 14px;
              }
              .table-secondary {
                margin-top: 4px;
                color: var(--muted);
                font-size: 12px;
              }
              .table-amount {
                white-space: nowrap;
                color: var(--accent);
                font-weight: 700;
              }
              .compact-list {
                border: 1px solid var(--border);
                border-radius: 16px;
                overflow: hidden;
                background: var(--surface);
              }
              .compact-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 18px;
                padding: 14px 16px;
                border-bottom: 1px solid var(--border);
                font-size: 14px;
              }
              .compact-row:last-child {
                border-bottom: none;
              }
              .two-col {
                display: grid;
                grid-template-columns: repeat(2, minmax(0, 1fr));
                gap: 18px;
              }
              .empty-state {
                padding: 18px 16px;
                border: 1px dashed var(--border);
                border-radius: 14px;
                color: var(--muted);
                background: var(--soft);
                font-size: 14px;
              }
              .footer-note {
                margin-top: 30px;
                padding-top: 18px;
                border-top: 1px solid var(--border);
                color: var(--muted);
                font-size: 12px;
                line-height: 1.6;
              }
              .print-footer {
                display: none;
              }
              @page {
                margin: 16mm;
              }
              @media print {
                body { background: #fff; }
                .page { max-width: none; }
                .content { padding-bottom: 72px; }
                .print-footer {
                  display: flex;
                  position: fixed;
                  left: 16mm;
                  right: 16mm;
                  bottom: 8mm;
                  align-items: center;
                  justify-content: space-between;
                  color: var(--muted);
                  font-size: 11px;
                  border-top: 1px solid var(--border);
                  padding-top: 8px;
                  background: #fff;
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
                    <span class="eyebrow">Seller Analytics Report</span>
                    <h1>KiyuMart Seller Performance</h1>
                    <div class="hero-copy">
                      A premium summary of your revenue, settlement, completed orders, delivery performance,
                      and recent sales activity.
                    </div>
                  </div>
                </div>
                <div class="summary-grid">
                  <div class="summary-card">
                    <div class="summary-label">Report Range</div>
                    <div class="summary-value">${escapeHtml(range.toUpperCase())}</div>
                  </div>
                  <div class="summary-card">
                    <div class="summary-label">Orders</div>
                    <div class="summary-value">${escapeHtml(String(scoped.length))}</div>
                  </div>
                  <div class="summary-card">
                    <div class="summary-label">Revenue</div>
                    <div class="summary-value">GHS ${escapeHtml(totals.revenue.toFixed(2))}</div>
                  </div>
                  <div class="summary-card">
                    <div class="summary-label">Settlement</div>
                    <div class="summary-value">GHS ${escapeHtml(num(stats?.sellerSettlementTotal).toFixed(2))}</div>
                  </div>
                  <div class="summary-card">
                    <div class="summary-label">Pending Payout</div>
                    <div class="summary-value">GHS ${escapeHtml(pendingPayoutTotal.toFixed(2))}</div>
                  </div>
                  <div class="summary-card">
                    <div class="summary-label">Seller Wallet</div>
                    <div class="summary-value">GHS ${escapeHtml(sellerWalletTotal.toFixed(2))}</div>
                  </div>
                </div>
              </section>
              <main class="content">
                <section class="section">
                  <div class="section-heading">
                    <span class="section-icon">KP</span>
                    <h2 class="section-title">Key Performance</h2>
                  </div>
                  <div class="compact-list">
                    <div class="compact-row"><span>Completed Orders</span><span>${escapeHtml(String(totals.completedCount))}</span></div>
                    <div class="compact-row"><span>Cancelled Orders</span><span>${escapeHtml(String(totals.cancelledCount))}</span></div>
                    <div class="compact-row"><span>Average Order Value</span><span>GHS ${escapeHtml(totals.aov.toFixed(2))}</span></div>
                    <div class="compact-row"><span>Paid Completed Ratio</span><span>${escapeHtml(totals.paidRate.toFixed(1))}%</span></div>
                  </div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <span class="section-icon">OR</span>
                    <h2 class="section-title">Recent Orders</h2>
                  </div>
                  ${
                    exportRows.length > 0
                      ? `
                        <div class="report-table-wrap">
                          <table class="report-table">
                            <thead>
                              <tr>
                                <th>Order</th>
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
                      `
                      : `<div class="empty-state">No orders available in this report range.</div>`
                  }
                </section>

                <section class="section">
                  <div class="two-col">
                    <div>
                      <div class="section-heading">
                        <span class="section-icon">RC</span>
                        <h2 class="section-title">Recent Receipts</h2>
                      </div>
                      <div class="compact-list">${receiptsMarkup}</div>
                    </div>
                    <div>
                      <div class="section-heading">
                        <span class="section-icon">DL</span>
                        <h2 class="section-title">Delivery Mix</h2>
                      </div>
                      <div class="compact-list">${deliveryMarkup}</div>
                    </div>
                  </div>
                </section>

                <section class="section">
                  <div class="section-heading">
                    <span class="section-icon">TR</span>
                    <h2 class="section-title">Recent Sales Trend</h2>
                  </div>
                  <div class="compact-list">${trendMarkup}</div>
                </section>

                <div class="footer-note">
                  This report reflects the current seller analytics snapshot available in your KiyuMart workspace.
                  For spreadsheet analysis, use the CSV export from the analytics page.
                </div>
              </main>
              <div class="print-footer">
                <span>KiyuMart Seller Analytics</span>
                <span>${escapeHtml(formatDateTime(new Date().toISOString()))}</span>
              </div>
            </div>
          </body>
        </html>
      `);
      await logReportActivity({ action: "generate", reportType, format: "pdf", scope: reportScope, status: "success" });
      await logReportActivity({ action: "download", reportType, format: "pdf", scope: reportScope, status: "success" });
    } catch (error: any) {
      if (reportWindow) {
        renderPrintReportError(
          reportWindow,
          "Seller analytics report failed",
          error?.message || "The report could not be prepared right now. Please try again shortly.",
        );
      }
      await logReportActivity({ action: "generate", reportType, format: "pdf", scope: reportScope, status: "failed" });
    } finally {
      setExporting("none");
    }
  };

  return (
    <DashboardLayout role="seller">
      <div className="p-4 md:p-6 space-y-4">
        <Card className="border-border/70 bg-card text-card-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(100deg,rgba(6,78,59,0.32)_0%,rgba(2,6,23,0.96)_50%,rgba(12,74,110,0.36)_100%)] dark:text-white">
          <CardContent className="p-4 md:p-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-2xl font-semibold" data-testid="text-page-title">Seller Analytics</h1>
              <p className="text-sm text-muted-foreground dark:text-white/80">Business-focused insights to optimize revenue, fulfillment, and {showInternalRiderFeatures ? "delivery" : "manual-delivery"} performance.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
               <Badge className="border-sky-200 bg-sky-50 text-sky-700 dark:border-white/30 dark:bg-white/20 dark:text-white">Live DB Data</Badge>
               {refreshing && <Badge variant="outline" className="gap-1 text-xs"><Loader2 className="h-3 w-3 animate-spin" />Refreshing</Badge>}
               <select className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground dark:border-white/30 dark:bg-white/10 dark:text-white" value={range} onChange={(e) => setRange(e.target.value as any)}>
                <option value="all" className="text-black">All Time</option>
                <option value="7d" className="text-black">Last 7 days</option>
                <option value="30d" className="text-black">Last 30 days</option>
                <option value="90d" className="text-black">Last 90 days</option>
              </select>
               <Button variant="outline" size="sm" className="border-border bg-background/90 text-foreground hover:bg-muted dark:border-white/35 dark:bg-transparent dark:text-white dark:hover:bg-white/10" onClick={() => void handleExportCsv()} disabled={exporting !== "none"}>
                <Download className="h-4 w-4 mr-2" />
                {exporting === "csv" ? "Preparing..." : "CSV"}
              </Button>
              <Button variant="outline" size="sm" className="border-border bg-background/90 text-foreground hover:bg-muted dark:border-white/35 dark:bg-transparent dark:text-white dark:hover:bg-white/10" onClick={() => void handleExportPdf()} disabled={exporting !== "none"}>
                <Download className="h-4 w-4 mr-2" />
                {exporting === "pdf" ? "Preparing..." : "PDF"}
              </Button>
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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Card className="border-emerald-200 dark:border-emerald-500/30">
                <CardHeader className="pb-2">
                  <CardDescription>Gross Sales {range !== "all" && <span className="text-xs">({range})</span>}</CardDescription>
                  <CardTitle className="text-2xl">{formatPrice(scopedGrossSales)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />Total product revenue before platform fee
                </CardContent>
              </Card>
              <Card className="border-sky-200 dark:border-sky-500/30">
                <CardHeader className="pb-2">
                  <CardDescription>Your Earnings (Net Payout) {range !== "all" && <span className="text-xs">({range})</span>}</CardDescription>
                  <CardTitle className="text-2xl">{formatPrice(scopedNetPayout)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />After platform fee (~{formatPrice(scopedCommission)} deducted)
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Wallet — Available to Cash Out</CardDescription>
                  <CardTitle className="text-2xl">{formatPrice(availableWallet)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />Settled earnings ready for payout request
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Pending Payout (Processing)</CardDescription>
                  <CardTitle className="text-2xl">{formatPrice(pendingPayoutTotal)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />Payout requested — being processed
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Paid Out (All Time)</CardDescription>
                  <CardTitle className="text-2xl">{formatPrice(sellerWalletTotal)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />Successfully transferred to your account
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardDescription>Orders Completed {range !== "all" && <span className="text-xs">({range})</span>}</CardDescription><CardTitle className="text-2xl">{totals.completedCount}</CardTitle></CardHeader>
                <CardContent className="text-sm text-muted-foreground flex items-center gap-2"><ShoppingCart className="h-4 w-4" />Vs {totals.cancelledCount} cancelled • {totals.paidRate.toFixed(1)}% paid rate</CardContent>
              </Card>
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
                <CardHeader><CardTitle>Delivery Method Performance</CardTitle><CardDescription>{showInternalRiderFeatures ? "Completed orders by channel" : "Completed orders by external delivery, VIP bus, or pickup"}</CardDescription></CardHeader>
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
                  <div className="rounded-lg border p-3">Top delivery method: <span className="font-semibold">{[...byMethod].sort((a, b) => b.count - a.count)[0]?.method || "N/A"}</span>.</div>
                  <div className="rounded-lg border p-3">Catalog at a glance: <span className="font-semibold">{num(stats?.totalOrders)}</span> lifetime orders, <span className="font-semibold">{formatPrice(num(stats?.totalRevenue))}</span> lifetime revenue.</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Receipt History</CardTitle>
                <CardDescription>Live receipt records generated from payment and completion events.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {receipts.slice(0, 6).map((receipt) => (
                  <button
                    key={receipt.id}
                    type="button"
                    onClick={() => navigate(`/orders/${receipt.orderId}/receipt`)}
                    className="w-full flex items-center justify-between rounded-lg border p-3 text-sm transition-colors hover:border-primary/30 hover:bg-primary/5 dark:hover:bg-primary/10 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">{receipt.receiptNumber}</p>
                      <p className="text-xs text-muted-foreground truncate">Order #{receipt.orderNumber} • {receipt.orderStatus}</p>
                    </div>
                    <p className="font-semibold">{formatPrice(Number(receipt.total || 0))}</p>
                  </button>
                ))}
                {!receipts.length && <p className="text-sm text-muted-foreground">No receipts generated yet for this seller scope.</p>}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
