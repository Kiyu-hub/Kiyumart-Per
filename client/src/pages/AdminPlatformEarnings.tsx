import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoadingState, SectionLoadingState } from "@/components/ui/loading-state";
import {
  ArrowRightLeft,
  Calendar,
  CreditCard,
  DollarSign,
  Percent,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";

type FinanceSummary = {
  total?: string;
  byType?: Record<string, string>;
};

type EarningRow = {
  id: string;
  orderId?: string | null;
  orderNumber?: string | null;
  orderCreatedAt?: string | null;
  commissionId?: string | null;
  amount: string | number;
  type: string;
  description?: string | null;
  createdAt: string;
  sellerId?: string | null;
  sellerName?: string | null;
  storeId?: string | null;
  storeName?: string | null;
};

type AdminTransaction = {
  id: string;
  orderId?: string | null;
  amount: string | number;
  status?: string | null;
  createdAt?: string | null;
  paymentReference?: string | null;
  paymentProvider?: string | null;
};

type StoreOption = {
  id: string;
  name: string;
};

const num = (value: unknown) => Number(value || 0) || 0;
type DatePreset = "all" | "7d" | "30d" | "this_month" | "90d" | "custom";

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizeDateInput = (value?: string) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? "" : formatDateInput(parsed);
};

export default function AdminPlatformEarnings() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const [, navigate] = useLocation();

  const [storeId, setStoreId] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [earningType, setEarningType] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const normalizedFromDate = normalizeDateInput(fromDate);
  const normalizedToDate = normalizeDateInput(toDate);

  const {
    data: analytics,
  } = useQuery<{
    platformCommissionTotal?: number;
    processingFeesTotal?: number;
    deliveryReserveTotal?: number;
  }>({
    queryKey: ["/api/analytics", "platform-earnings"],
    queryFn: async () => {
      const response = await fetch("/api/analytics", { credentials: "include" });
      if (!response.ok) return {};
      return response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const {
    data: summary,
    isLoading: summaryLoading,
    refetch: refetchSummary,
  } = useQuery<FinanceSummary>({
    queryKey: ["/api/admin/finance-summary"],
    queryFn: async () => {
      const response = await fetch("/api/admin/finance-summary", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load finance summary");
      return response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const {
    data: earnings = [],
    isLoading: earningsLoading,
    refetch: refetchEarnings,
  } = useQuery<EarningRow[] | { error?: string }>({
    queryKey: ["/api/admin/platform-earnings", storeId, normalizedFromDate, normalizedToDate, earningType],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "150");
      if (storeId !== "all") params.set("storeId", storeId);
      if (normalizedFromDate) params.set("from", normalizedFromDate);
      if (normalizedToDate) params.set("to", normalizedToDate);
      if (earningType !== "all") params.set("type", earningType);
      const response = await fetch(`/api/admin/platform-earnings?${params.toString()}`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load platform earnings");
      return response.json();
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const {
    data: transactions = [],
    isLoading: transactionsLoading,
    refetch: refetchTransactions,
  } = useQuery<AdminTransaction[]>({
    queryKey: ["/api/admin/transactions"],
    queryFn: async () => {
      const response = await fetch("/api/admin/transactions?limit=100", { credentials: "include" });
      if (!response.ok) throw new Error("Failed to load transactions");
      return response.json();
    },
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ["/api/stores", "platform-earnings"],
    queryFn: async () => {
      const response = await fetch("/api/stores", { credentials: "include" });
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload) ? payload : [];
    },
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchSummary(),
        refetchEarnings(),
        refetchTransactions(),
        queryClient.refetchQueries({
          predicate: (query) => {
            const key = query.queryKey?.[0];
            if (typeof key !== "string") return false;
            return [
              "/api/analytics",
              "/api/stores",
              "/api/admin/finance-summary",
              "/api/admin/platform-earnings",
              "/api/admin/transactions",
            ].some((prefix) => key.startsWith(prefix));
          },
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const earningsError = !Array.isArray(earnings) ? earnings?.error || "Failed to load platform earnings." : null;
  const earningsArray = Array.isArray(earnings) ? earnings : [];

  const filteredEarnings = useMemo(() => earningsArray, [earningsArray]);

  const stats = useMemo(() => {
    const byType = summary?.byType || {};
    const commission = num(byType.commission) || num(analytics?.platformCommissionTotal);
    const serviceFee = num(byType.service_fee) || num(analytics?.processingFeesTotal);
    const promotion = num(byType.promotion) + num(byType.promotion_fee);
    const total = commission + promotion;

    const last7Days = new Date();
    last7Days.setDate(last7Days.getDate() - 7);

    const recentEarnings = earningsArray.filter((earning) => {
      const createdAt = new Date(earning.createdAt);
      return !Number.isNaN(createdAt.getTime()) && createdAt >= last7Days;
    });
    const recentTransactions = (Array.isArray(transactions) ? transactions : []).filter((transaction) => {
      const createdAt = transaction.createdAt ? new Date(transaction.createdAt) : null;
      return createdAt && !Number.isNaN(createdAt.getTime()) && createdAt >= last7Days;
    });

    const topStoreMap = new Map<string, number>();
    earningsArray.forEach((earning) => {
      const storeName = String(earning.storeName || "Unknown Store");
      topStoreMap.set(storeName, (topStoreMap.get(storeName) || 0) + num(earning.amount));
    });

    const topStore = Array.from(topStoreMap.entries())
      .sort((a, b) => b[1] - a[1])[0];

    return {
      total,
      commission,
      serviceFee,
      promotion,
      earningsCount: earningsArray.length,
      transactionCount: Array.isArray(transactions) ? transactions.length : 0,
      recentEarningsValue: recentTransactions.length
        ? recentTransactions.reduce((sum, transaction) => sum + num(transaction.amount), 0)
        : recentEarnings.reduce((sum, earning) => sum + num(earning.amount), 0),
      recentTransactionCount: recentTransactions.length,
      topStoreName: topStore?.[0] || "No store data",
      topStoreValue: topStore?.[1] || 0,
    };
  }, [analytics?.platformCommissionTotal, analytics?.processingFeesTotal, earningsArray, summary, transactions]);

  const typeBreakdown = useMemo(() => {
    return [
      {
        key: "commission",
        label: "Commission",
        amount: stats.commission,
        description: "Platform commission deducted before seller settlement.",
      },
      {
        key: "service_fee",
        label: "Processing Fee",
        amount: stats.serviceFee,
        description: "Customer-paid payment processing charge kept separate from commission.",
      },
      {
        key: "promotion",
        label: "Promotion Income",
        amount: stats.promotion,
        description: "Sponsored placement and promotional revenue.",
      },
    ].filter((row) => row.amount > 0 || row.key === "commission" || row.key === "service_fee");
  }, [stats.commission, stats.promotion, stats.serviceFee]);

  const hasFilters = storeId !== "all" || !!normalizedFromDate || !!normalizedToDate || earningType !== "all";

  useEffect(() => {
    if (datePreset === "custom") return;
    if (datePreset === "all") {
      setFromDate("");
      setToDate("");
      return;
    }

    const today = new Date();
    const end = formatDateInput(today);
    const startDate = new Date(today);

    if (datePreset === "7d") {
      startDate.setDate(today.getDate() - 6);
    } else if (datePreset === "30d") {
      startDate.setDate(today.getDate() - 29);
    } else if (datePreset === "90d") {
      startDate.setDate(today.getDate() - 89);
    } else if (datePreset === "this_month") {
      startDate.setDate(1);
    }

    setFromDate(formatDateInput(startDate));
    setToDate(end);
  }, [datePreset]);

  const resetFilters = () => {
    setStoreId("all");
    setFromDate("");
    setToDate("");
    setDatePreset("all");
    setEarningType("all");
  };

  const getTypeBadge = (type: string) => {
    const normalizedType = String(type || "").toLowerCase();
    if (normalizedType === "commission") {
      return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200">Commission</Badge>;
    }
    if (normalizedType === "service_fee") {
      return <Badge className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-400/30 dark:bg-sky-500/15 dark:text-sky-200">Processing Fee</Badge>;
    }
    if (normalizedType === "delivery_fee") {
      return <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">Delivery Reserve</Badge>;
    }
    if (normalizedType === "promotion" || normalizedType === "promotion_fee") {
      return <Badge className="border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700 dark:border-fuchsia-400/30 dark:bg-fuchsia-500/15 dark:text-fuchsia-200">Promotion</Badge>;
    }
    return <Badge variant="outline">{type}</Badge>;
  };

  const getStatusBadge = (status?: string | null) => {
    const normalizedStatus = String(status || "").toLowerCase();
    if (["completed", "success", "paid"].includes(normalizedStatus)) {
      return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-200">Success</Badge>;
    }
    if (normalizedStatus === "pending") {
      return <Badge className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-500/15 dark:text-amber-200">Pending</Badge>;
    }
    if (normalizedStatus === "failed") {
      return <Badge className="border-red-200 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-200">Failed</Badge>;
    }
    return <Badge variant="outline">{status || "Unknown"}</Badge>;
  };

  const formatCurrency = (amount: number | string) => formatPrice(num(amount));
  const formatDate = (value?: string | null) =>
    value
      ? new Date(value).toLocaleDateString("en-GH", {
          month: "short",
          day: "numeric",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "N/A";

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading finance access" description="Preparing the platform earnings workspace." />;
  }

  if (summaryLoading || earningsLoading || transactionsLoading) {
    return (
      <DashboardLayout role={user.role as "admin" | "super_admin"} showBackButton>
        <div className="p-4 md:p-6">
          <SectionLoadingState title="Loading real-time finance data" description="Preparing the latest commission, promotion revenue, and ledger entries." lines={3} />
        </div>
      </DashboardLayout>
    );
  }

  if (earningsError) {
    return (
      <DashboardLayout role={user.role as "admin" | "super_admin"} showBackButton>
        <div className="p-6 lg:p-8">
          <Card className="mx-auto max-w-2xl border-red-500/25 bg-red-500/5">
            <CardHeader>
              <CardTitle className="text-red-300">Unable to Load Platform Earnings</CardTitle>
              <CardDescription className="text-red-100/80">
                The finance dashboard could not load the latest earnings records.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-red-100/80">{earningsError}</p>
              <Button onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Retrying..." : "Retry"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={user.role as "admin" | "super_admin"} showBackButton>
      <div className="min-h-full space-y-6 p-4 md:p-6 pb-8">
        <Card className="border-border/70 bg-card text-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(102deg,rgba(6,78,59,0.46)_0%,rgba(2,6,23,0.97)_48%,rgba(8,47,73,0.56)_100%)] dark:text-white">
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-50">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    Finance Operations
                  </Badge>
                  <Badge className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/40 dark:bg-sky-500/15 dark:text-sky-50">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Live data refresh every 15s
                  </Badge>
                </div>
                <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Platform Earnings</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground dark:text-white/80">
                  Combined platform-side inflows from commission and promotion records, with exact checkout fee tracking kept alongside the ledger and payout transfer costs tracked separately on seller settlements.
                  This view stays aligned with the live finance ledger, seller settlement rules, and transaction history.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border/70 text-foreground hover:bg-muted dark:border-white/30 dark:text-white dark:hover:bg-white/10"
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Refreshing..." : "Refresh"}
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Total Earnings</p>
                    <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.total)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">Commission and promotion revenue combined</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Commission</p>
                    <Percent className="h-4 w-4 text-sky-600 dark:text-sky-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.commission)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">Seller-funded platform commission</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Processing Fees</p>
                    <Wallet className="h-4 w-4 text-violet-600 dark:text-violet-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.serviceFee)}</p>
                    <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">Exact Paystack checkout fee paid by the customer</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Promotion Revenue</p>
                    <Sparkles className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.promotion)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">Approved promotion income recorded into platform earnings</p>
                </CardContent>
              </Card>

              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">7-Day Intake</p>
                    <TrendingUp className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.recentEarningsValue)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{stats.recentTransactionCount} recent payment transactions</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How Platform Earnings Accumulate</CardTitle>
            <CardDescription>
              Platform earnings are recorded live from payment and commission events. Seller settlement and payout transfer costs remain separate.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <p className="text-sm font-medium">Total Earnings</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Combined platform-side inflows from commission and promotion records.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <p className="text-sm font-medium">Commission</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Deducted from the seller merchandise share only, after coupon discount and before seller settlement.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <p className="text-sm font-medium">Processing Fees</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Paid by the customer as the exact Paystack checkout fee. They are recorded separately from platform commission and never added to seller payout.
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 p-4">
              <p className="text-sm font-medium">Promotion Revenue</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Promotion income is recorded when promotion requests are confirmed and approved for activation.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Earnings Breakdown
              </CardTitle>
              <CardDescription>Live grouped totals from platform earning records.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {typeBreakdown.map((item) => (
                <div key={item.key} className="rounded-2xl border border-border/60 bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{item.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <p className="text-lg font-semibold">{formatCurrency(item.amount)}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5" />
                Finance Snapshot
              </CardTitle>
              <CardDescription>Quick operational context for today's platform earnings.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="rounded-xl border p-4">
                <p className="text-muted-foreground">Top Store by Earnings</p>
                <p className="mt-2 text-lg font-semibold">{stats.topStoreName}</p>
                <p className="mt-1 text-sm text-emerald-400">{formatCurrency(stats.topStoreValue)}</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-muted-foreground">Transaction Feed</p>
                <p className="mt-2 text-lg font-semibold">{stats.transactionCount}</p>
                <p className="mt-1 text-sm text-muted-foreground">Synced from the payment transaction ledger.</p>
              </div>
              <div className="rounded-xl border p-4">
                <p className="text-muted-foreground">Settlement Rule</p>
                <p className="mt-2 text-sm">
                  Seller payouts exclude checkout processing fees, and platform earnings on this page focus on commission plus promotion revenue only. Payout transfer costs stay on the settlement side.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Earnings Ledger
                </CardTitle>
                <CardDescription>
                  Showing {filteredEarnings.length} visible records from the live platform earnings stream.
                </CardDescription>
              </div>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reset Filters
                </Button>
              ) : null}
            </div>

              <div className="mt-4 space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Date Range</label>
                    <Select value={datePreset} onValueChange={(value) => setDatePreset(value as DatePreset)}>
                    <SelectTrigger>
                      <SelectValue placeholder="All time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="7d">Last 7 days</SelectItem>
                      <SelectItem value="30d">Last 30 days</SelectItem>
                      <SelectItem value="this_month">This month</SelectItem>
                      <SelectItem value="90d">Last 90 days</SelectItem>
                      <SelectItem value="custom">Custom range</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">Store</label>
                  <Select value={storeId} onValueChange={setStoreId}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Stores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stores</SelectItem>
                      {stores.map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          {store.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    From
                  </label>
                  <Input
                    type="date"
                    value={normalizedFromDate}
                    onChange={(e) => {
                      setDatePreset("custom");
                      setFromDate(normalizeDateInput(e.target.value));
                    }}
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    To
                  </label>
                  <Input
                    type="date"
                    value={normalizedToDate}
                    onChange={(e) => {
                      setDatePreset("custom");
                      setToDate(normalizeDateInput(e.target.value));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Earning Type</label>
                <Tabs value={earningType} onValueChange={setEarningType} className="w-full">
                  <TabsList className="flex h-auto w-full flex-wrap items-center gap-2 bg-transparent p-0">
                    <TabsTrigger className="min-w-[110px] flex-1 md:flex-none" value="all">All</TabsTrigger>
                    <TabsTrigger className="min-w-[130px] flex-1 md:flex-none" value="commission">Commission</TabsTrigger>
                    <TabsTrigger className="min-w-[130px] flex-1 md:flex-none" value="service_fee">Processing</TabsTrigger>
                    <TabsTrigger className="min-w-[120px] flex-1 md:flex-none" value="promotion">Promotion</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {filteredEarnings.length === 0 ? (
              <div className="py-14 text-center">
                <Receipt className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-base font-medium">
                  {earningsArray.length === 0 ? "No platform earnings recorded yet." : "No earnings match the current filters."}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When orders generate commission or processing fee entries, and when promotions are approved, they will appear here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Order</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEarnings.map((earning) => (
                      <TableRow key={earning.id} className="hover:bg-muted/20">
                        <TableCell className="min-w-[150px]">
                          <p className="font-medium">#{earning.orderNumber || earning.orderId?.slice(0, 8) || "N/A"}</p>
                          <p className="text-xs text-muted-foreground">{earning.orderCreatedAt ? formatDate(earning.orderCreatedAt) : "Order date unavailable"}</p>
                        </TableCell>
                        <TableCell className="min-w-[180px]">
                          <div className="flex items-center gap-2">
                            <Store className="h-4 w-4 text-muted-foreground" />
                            <span>{earning.storeName || "Unknown Store"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="min-w-[160px] text-sm">{earning.sellerName || earning.sellerId || "Unknown Seller"}</TableCell>
                        <TableCell>{getTypeBadge(earning.type)}</TableCell>
                        <TableCell className="min-w-[220px] text-sm text-muted-foreground">{earning.description || "No description provided"}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-400">{formatCurrency(earning.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(earning.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Recent Transactions
            </CardTitle>
            <CardDescription>Recent payment attempts and completed payment records linked to the platform flow.</CardDescription>
          </CardHeader>
          <CardContent>
            {!Array.isArray(transactions) || transactions.length === 0 ? (
              <div className="py-12 text-center">
                <CreditCard className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-base font-medium">No transactions recorded yet.</p>
                <p className="mt-1 text-sm text-muted-foreground">Transaction activity will appear here as orders are paid and verified.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Reference</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 20).map((transaction) => (
                      <TableRow key={transaction.id} className="hover:bg-muted/20">
                        <TableCell className="font-mono text-xs">
                          {transaction.paymentReference ? `${transaction.paymentReference.slice(0, 18)}...` : "N/A"}
                        </TableCell>
                        <TableCell>{transaction.paymentProvider || "N/A"}</TableCell>
                        <TableCell>#{transaction.orderId?.slice(0, 8) || "N/A"}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(transaction.amount)}</TableCell>
                        <TableCell>{getStatusBadge(transaction.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(transaction.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
