import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Banknote,
  Calendar,
  CheckCircle,
  Clock,
  CreditCard,
  DollarSign,
  Eye,
  Loader2,
  Mail,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  Wallet,
  XCircle,
} from "lucide-react";

interface Seller {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
  isApproved: boolean;
  hasPayoutSetup?: boolean;
  payoutType?: string | null;
  totalPaid: number | string;
  pendingAmount: number | string;
  payoutCount: number;
  completedPayoutCount?: number;
  lastPayoutAt: string | null;
}

interface Payout {
  id: string;
  sellerId: string;
  amount: number | string;
  status: "pending" | "processing" | "completed" | "failed";
  method?: string;
  reference?: string | null;
  paymentMethod: string;
  paymentDetails: string;
  bankDetails?: {
    transferFee?: string;
    settlementMode?: string;
    transferReference?: string;
    transferCode?: string;
    transferStatus?: string;
    setupRequired?: boolean;
    needsAudit?: boolean;
    auditReason?: string;
    mobileNumber?: string;
    provider?: string;
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    accountName?: string;
  } | null;
  createdAt: string;
  processedAt: string | null;
  notes: string | null;
}

type FilterTab = "all" | "pending" | "processing" | "completed" | "verified_paid" | "audit_required" | "missing_setup";
type HistoryTab = "all" | "pending" | "processing" | "completed";

function CollapsibleDashboardNote({
  title = "Notes",
  defaultOpen = false,
  children,
}: {
  title?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="text-xs text-muted-foreground" open={defaultOpen}>
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
        {title}
      </summary>
      <div className="mt-1 space-y-1">{children}</div>
    </details>
  );
}

const statusTone: Record<Payout["status"] | "audit_required", string> = {
  pending: "border-amber-400/30 bg-amber-500/15 text-amber-200",
  processing: "border-sky-400/30 bg-sky-500/15 text-sky-200",
  completed: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
  failed: "border-red-400/30 bg-red-500/15 text-red-200",
  audit_required: "border-red-400/30 bg-red-500/15 text-red-200",
};

export default function AdminSellersPayouts() {
  const { user } = useAuth();

  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [queueTab, setQueueTab] = useState<FilterTab>("all");
  const [historyTab, setHistoryTab] = useState<HistoryTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<string | null>(null);
  const [lastGoodSellers, setLastGoodSellers] = useState<Seller[]>([]);
  const [lastGoodPendingPayouts, setLastGoodPendingPayouts] = useState<Payout[]>([]);
  const [lastGoodSellerPayouts, setLastGoodSellerPayouts] = useState<Payout[]>([]);

  useEffect(() => {
    setLastGoodSellerPayouts([]);
  }, [selectedSeller?.id]);

  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };

  const formatCurrency = (amount: number | string) =>
    `GH₵${new Intl.NumberFormat("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(toNumber(amount))}`;

  const formatDate = (value: string | null) => {
    if (!value) return "Never";
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const hasVerifiedPayoutEvidence = (payout: Payout) => {
    const settlementMode = String(payout.bankDetails?.settlementMode || "").toLowerCase().trim();
    const transferStatus = String(payout.bankDetails?.transferStatus || "").toLowerCase().trim();
    return (
      settlementMode === "split" ||
      ["success", "successful", "completed"].includes(transferStatus) ||
      Boolean(String(payout.bankDetails?.transferReference || "").trim()) ||
      Boolean(String(payout.bankDetails?.transferCode || "").trim())
    );
  };

  const getPayoutDisplayStatus = (payout: Payout) => {
    if (payout.status === "completed" && !hasVerifiedPayoutEvidence(payout)) {
      return "audit_required";
    }
    return payout.status;
  };

  const normalizeMobileProvider = (provider?: string | null) => {
    const value = String(provider || "").trim().toLowerCase();
    if (value === "mtn") return "MTN";
    if (value === "vod") return "Telecel";
    if (value === "atl") return "AirtelTigo";
    return value ? value.toUpperCase() : "";
  };

  const normalizeGhanaMobileNumber = (mobileNumber?: string | null) => {
    const digits = String(mobileNumber || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 9) return `0${digits}`;
    if (digits.length === 10 && digits.startsWith("0")) return digits;
    if (digits.length === 12 && digits.startsWith("233")) return `0${digits.slice(3)}`;
    if (digits.length === 13 && digits.startsWith("2330")) return `0${digits.slice(4)}`;
    return digits;
  };

  const isValidProviderNumberPair = (provider?: string | null, mobileNumber?: string | null) => {
    const normalizedProvider = String(provider || "").trim().toLowerCase();
    const normalizedNumber = normalizeGhanaMobileNumber(mobileNumber);
    if (!/^0\d{9}$/.test(normalizedNumber)) return false;
    const validPrefixes: Record<string, string[]> = {
      mtn: ["024", "025", "053", "054", "055", "059"],
      vod: ["020", "050"],
      atl: ["026", "027", "056", "057"],
    };
    return (validPrefixes[normalizedProvider] || []).includes(normalizedNumber.slice(0, 3));
  };

  const getSellerBlockedReason = (seller: Seller, payoutsForSeller: Payout[]) => {
    if (seller.hasPayoutSetup !== false) {
      return null;
    }

    const latestSetupBlockedPayout = [...payoutsForSeller]
      .filter((payout) => payout.bankDetails?.setupRequired)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0];

    const payoutDetails = latestSetupBlockedPayout?.bankDetails;
    const method = String(latestSetupBlockedPayout?.method || latestSetupBlockedPayout?.paymentMethod || seller.payoutType || "").toLowerCase().trim();

    if (method === "mobile_money") {
      const provider = String(payoutDetails?.provider || "").toLowerCase().trim();
      const mobileNumber = payoutDetails?.mobileNumber;
      if (!provider && !mobileNumber) {
        return "Missing mobile money payout setup";
      }
      if (!provider) {
        return "Missing mobile money provider";
      }
      if (!mobileNumber) {
        return `Missing ${normalizeMobileProvider(provider)} mobile money number`;
      }
      if (!isValidProviderNumberPair(provider, mobileNumber)) {
        return `Invalid ${normalizeMobileProvider(provider)} mobile money number`;
      }
      return `${normalizeMobileProvider(provider)} mobile money setup needs attention`;
    }

    if (method === "bank_account" || method === "bank_transfer") {
      if (!payoutDetails?.bankCode && !payoutDetails?.accountNumber && !payoutDetails?.bankName && !payoutDetails?.accountName) {
        return "Missing bank payout setup";
      }
      if (!payoutDetails?.bankName || !payoutDetails?.bankCode) {
        return "Missing bank details";
      }
      if (!payoutDetails?.accountNumber) {
        return "Missing bank account number";
      }
      if (!payoutDetails?.accountName) {
        return "Missing account name";
      }
      return "Bank payout setup needs attention";
    }

    return payoutDetails?.auditReason || "Payout setup is incomplete";
  };

  const {
    data: sellers = [],
    isLoading: sellersLoading,
    isError: sellersError,
    refetch: refetchSellers,
  } = useQuery<Seller[]>({
    queryKey: ["/api/admin/sellers", "payout-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/sellers");
      const payload = await res.json();
      if (!Array.isArray(payload)) {
        throw new Error("Invalid seller payout summary response");
      }
      return payload;
    },
    placeholderData: (previousData) => previousData ?? [],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchInterval: 15000,
  });

  const {
    data: pendingPayouts = [],
    isError: pendingPayoutsError,
    refetch: refetchPendingPayouts,
  } = useQuery<Payout[]>({
    queryKey: ["/api/admin/payouts/pending", "seller-payouts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payouts/pending");
      const payload = await res.json();
      if (!Array.isArray(payload)) {
        throw new Error("Invalid pending payout response");
      }
      return payload;
    },
    placeholderData: (previousData) => previousData ?? [],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchInterval: 15000,
  });

  const {
    data: sellerPayouts = [],
    isLoading: payoutsLoading,
    isError: sellerPayoutsError,
    refetch: refetchSellerPayouts,
  } = useQuery<Payout[]>({
    queryKey: ["/api/admin/sellers", "payout-history", selectedSeller?.id],
    queryFn: async () => {
      if (!selectedSeller) return [];
      const res = await apiRequest("GET", `/api/admin/sellers/${selectedSeller.id}/payouts`);
      const payload = await res.json();
      if (!Array.isArray(payload)) {
        throw new Error("Invalid seller payout history response");
      }
      return payload;
    },
    enabled: !!selectedSeller,
    placeholderData: (previousData) => previousData ?? [],
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    retry: 1,
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (Array.isArray(sellers) && !sellersError) {
      setLastGoodSellers(sellers);
    }
  }, [sellers, sellersError]);

  useEffect(() => {
    if (Array.isArray(pendingPayouts) && !pendingPayoutsError) {
      setLastGoodPendingPayouts(pendingPayouts);
    }
  }, [pendingPayouts, pendingPayoutsError]);

  useEffect(() => {
    if (Array.isArray(sellerPayouts) && !sellerPayoutsError) {
      setLastGoodSellerPayouts(sellerPayouts);
    }
  }, [sellerPayouts, sellerPayoutsError]);

  const sellerRows = !sellersError && Array.isArray(sellers)
    ? sellers
    : lastGoodSellers;
  const pendingPayoutRows = !pendingPayoutsError && Array.isArray(pendingPayouts)
    ? pendingPayouts
    : lastGoodPendingPayouts;
  const sellerPayoutRows = !sellerPayoutsError && Array.isArray(sellerPayouts)
    ? sellerPayouts
    : lastGoodSellerPayouts;

  const stats = useMemo(() => {
    const totalPaid = sellerRows.reduce((sum, seller) => sum + toNumber(seller.totalPaid), 0);
    const totalPending = sellerRows.reduce((sum, seller) => sum + toNumber(seller.pendingAmount), 0);
    const activeSellers = sellerRows.filter((seller) =>
      seller.isApproved &&
      seller.hasPayoutSetup !== false &&
      (toNumber(seller.pendingAmount) > 0 || Number(seller.completedPayoutCount || 0) > 0)
    ).length;
    const completedPayouts = sellerRows.reduce((sum, seller) => sum + Number(seller.completedPayoutCount || 0), 0);
    const avgPayout = completedPayouts > 0 ? totalPaid / completedPayouts : 0;

    const mostExposedSeller = [...sellerRows]
      .sort((a, b) => toNumber(b.pendingAmount) - toNumber(a.pendingAmount))[0];

    const verifiedPaidCount = sellerRows.reduce((sum, seller) => sum + Number(seller.completedPayoutCount || 0), 0);
    const processingTransferRows = pendingPayoutRows.filter((payout) => payout.status === "processing");
    const processingTransferAmount = processingTransferRows.reduce((sum, payout) => sum + toNumber(payout.amount), 0);
    const awaitingSetupSellers = sellerRows.filter(
      (seller) => seller.hasPayoutSetup === false && toNumber(seller.pendingAmount) > 0,
    );
    const awaitingSetupAmount = awaitingSetupSellers.reduce((sum, seller) => sum + toNumber(seller.pendingAmount), 0);
    const auditRequiredRows = pendingPayoutRows.filter((payout) => payout.bankDetails?.needsAudit);
    const auditRequiredAmount = auditRequiredRows.reduce((sum, payout) => sum + toNumber(payout.amount), 0);

    return {
      totalPaid,
      totalPending,
      activeSellers,
      totalPayouts: completedPayouts,
      avgPayout,
      mostExposedSellerName: mostExposedSeller?.name || "No seller data",
      mostExposedSellerAmount: toNumber(mostExposedSeller?.pendingAmount),
      verifiedPaidCount,
      processingTransferAmount,
      processingTransferCount: processingTransferRows.length,
      awaitingSetupAmount,
      awaitingSetupCount: awaitingSetupSellers.length,
      awaitingSetupSellerNames: awaitingSetupSellers.map((seller) => seller.name).filter(Boolean),
      auditRequiredAmount,
      auditRequiredCount: auditRequiredRows.length,
    };
  }, [pendingPayoutRows, sellerRows]);

  const filteredSellers = useMemo(() => {
    let rows = sellerRows;
    const processingSellerIds = new Set(
      pendingPayoutRows
        .filter((payout) => payout.status === "processing")
        .map((payout) => payout.sellerId)
        .filter(Boolean)
    );
    const auditRequiredSellerIds = new Set(
      pendingPayoutRows
        .filter((payout) => payout.bankDetails?.needsAudit)
        .map((payout) => payout.sellerId)
        .filter(Boolean)
    );

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      rows = rows.filter((seller) =>
        seller.name?.toLowerCase().includes(query) ||
        seller.email?.toLowerCase().includes(query) ||
        seller.phone?.toLowerCase().includes(query)
      );
    }

    if (queueTab === "pending") {
      rows = rows.filter((seller) => toNumber(seller.pendingAmount) > 0);
    } else if (queueTab === "processing") {
      rows = rows.filter((seller) => processingSellerIds.has(seller.id));
    } else if (queueTab === "completed") {
      rows = rows.filter((seller) => Number(seller.completedPayoutCount || 0) > 0 && seller.hasPayoutSetup !== false);
    } else if (queueTab === "verified_paid") {
      rows = rows.filter((seller) => Number(seller.completedPayoutCount || 0) > 0);
    } else if (queueTab === "audit_required") {
      rows = rows.filter((seller) => auditRequiredSellerIds.has(seller.id));
    } else if (queueTab === "missing_setup") {
      rows = rows.filter((seller) => seller.isApproved && seller.hasPayoutSetup === false);
    }

    return rows;
  }, [queueTab, pendingPayoutRows, searchQuery, sellerRows]);

  const tabCounts = useMemo(() => ({
    all: sellerRows.length,
    pending: sellerRows.filter((seller) => toNumber(seller.pendingAmount) > 0).length,
    processing: pendingPayoutRows.filter((payout) => payout.status === "processing").length,
    completed: sellerRows.filter((seller) => Number(seller.completedPayoutCount || 0) > 0 && seller.hasPayoutSetup !== false).length,
    verified_paid: sellerRows.filter((seller) => Number(seller.completedPayoutCount || 0) > 0).length,
    audit_required: new Set(
      pendingPayoutRows
        .filter((payout) => payout.bankDetails?.needsAudit)
        .map((payout) => payout.sellerId)
        .filter(Boolean)
    ).size,
    missing_setup: sellerRows.filter((seller) => seller.isApproved && seller.hasPayoutSetup === false).length,
  }), [pendingPayoutRows, sellerRows]);

  const filteredPayouts = useMemo(() => {
    if (historyTab === "all") return sellerPayoutRows;
    if (historyTab === "completed") {
      return sellerPayoutRows.filter((payout) => getPayoutDisplayStatus(payout) === "completed");
    }
    return sellerPayoutRows.filter((payout) => payout.status === historyTab);
  }, [historyTab, sellerPayoutRows]);

  const blockedReasonBySellerId = useMemo(() => {
    const grouped = new Map<string, Payout[]>();
    for (const payout of pendingPayoutRows) {
      if (!payout?.sellerId) continue;
      if (!grouped.has(payout.sellerId)) grouped.set(payout.sellerId, []);
      grouped.get(payout.sellerId)!.push(payout);
    }
    const reasons = new Map<string, string>();
    for (const seller of sellerRows) {
      const reason = getSellerBlockedReason(seller, grouped.get(seller.id) || []);
      if (reason) {
        reasons.set(seller.id, reason);
      }
    }
    return reasons;
  }, [pendingPayoutRows, sellerRows]);

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        refetchSellers(),
        refetchPendingPayouts(),
        selectedSeller ? refetchSellerPayouts() : Promise.resolve(),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const reconcileCommissions = async () => {
    setIsReconciling(true);
    setReconcileResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/finance/reconcile-commissions");
      const data = await res.json();
      setReconcileResult(data.message || `Reconciled ${data.repairedCount} record(s).`);
      await refreshAll();
    } catch (err: any) {
      setReconcileResult("Reconciliation failed: " + (err?.message || "Unknown error"));
    } finally {
      setIsReconciling(false);
    }
  };

  if (selectedSeller) {
    return (
      <DashboardLayout role={user?.role as any} showBackButton>
        <div className="space-y-6 p-4 md:p-6 pb-8">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedSeller(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Sellers
            </Button>
            <Button variant="outline" size="sm" onClick={refreshAll} disabled={isRefreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing..." : "Refresh History"}
            </Button>
          </div>

        <Card className="border-border/70 bg-card text-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(102deg,rgba(6,78,59,0.42)_0%,rgba(2,6,23,0.96)_48%,rgba(8,47,73,0.56)_100%)] dark:text-white">
          <CardContent className="space-y-5 p-5 md:p-6">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-center gap-4">
                  <UserAvatar
                    profileImage={selectedSeller.profileImage}
                    name={selectedSeller.name}
                    email={selectedSeller.email}
                    size="lg"
                    className="h-16 w-16"
                  />
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-50">
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Seller Finance Profile
                      </Badge>
                      <Badge className={selectedSeller.isApproved ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-50" : "border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-300/40 dark:bg-slate-500/20 dark:text-slate-50"}>
                        {selectedSeller.isApproved ? "Approved Seller" : "Pending Approval"}
                      </Badge>
                    </div>
                    <h1 className="mt-3 text-2xl font-semibold md:text-3xl">{selectedSeller.name}</h1>
                    <div className="mt-2 space-y-1 text-sm text-muted-foreground dark:text-white/80">
                      <p className="flex items-center gap-2"><Mail className="h-4 w-4" />{selectedSeller.email}</p>
                      <p className="flex items-center gap-2"><Phone className="h-4 w-4" />{selectedSeller.phone || "No phone number"}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge className="border-sky-200 bg-sky-50 px-3 py-1.5 text-sky-700 dark:border-sky-300/40 dark:bg-sky-500/15 dark:text-sky-50">
                    <CreditCard className="mr-1.5 h-3.5 w-3.5" />
                    Seller settlement is automatic after payment confirmation
                  </Badge>
                </div>
              </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Total Paid</p><p className="mt-3 text-2xl font-semibold">{formatCurrency(selectedSeller.totalPaid)}</p></CardContent></Card>
                  <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Pending Balance</p><p className="mt-3 text-2xl font-semibold">{formatCurrency(selectedSeller.pendingAmount)}</p></CardContent></Card>
                  <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Total Payouts</p><p className="mt-3 text-2xl font-semibold">{selectedSeller.payoutCount}</p></CardContent></Card>
                  <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Last Payout</p><p className="mt-3 text-lg font-semibold">{selectedSeller.hasPayoutSetup === false ? "Setup Required" : formatDate(selectedSeller.lastPayoutAt)}</p></CardContent></Card>
                </div>

                {selectedSeller.hasPayoutSetup === false && (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-50/80 p-4 text-sm text-amber-900 dark:border-amber-300/20 dark:bg-amber-500/10 dark:text-amber-100">
                    <p className="font-medium">Awaiting Setup</p>
                    <p className="mt-1">{blockedReasonBySellerId.get(selectedSeller.id) || "Payout setup is incomplete."}</p>
                  </div>
                )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle>Payout History</CardTitle>
                  <CardDescription>Live payout records for this seller account.</CardDescription>
                </div>
                <Tabs value={historyTab} onValueChange={(value) => setHistoryTab(value as HistoryTab)}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="processing">Processing</TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {payoutsLoading && sellerPayoutRows.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : sellerPayoutsError && sellerPayoutRows.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                  <p className="mb-4">Failed to load payout history for this seller.</p>
                  <Button variant="outline" onClick={refreshAll} disabled={isRefreshing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Retrying..." : "Retry"}
                  </Button>
                </div>
              ) : filteredPayouts.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <CreditCard className="mx-auto mb-4 h-12 w-12 opacity-50" />
                  <p>No payout history found for the current filter.</p>
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredPayouts.map((payout) => (
                    <Card key={payout.id} className="border-border/60 bg-muted/20">
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm text-muted-foreground">Payout ID</p>
                            <p className="font-medium">{payout.id}</p>
                          </div>
                          <Badge className={statusTone[getPayoutDisplayStatus(payout)]}>
                            {getPayoutDisplayStatus(payout) === "processing" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : getPayoutDisplayStatus(payout) === "completed" ? <CheckCircle className="mr-1 h-3.5 w-3.5" /> : getPayoutDisplayStatus(payout) === "failed" || getPayoutDisplayStatus(payout) === "audit_required" ? <XCircle className="mr-1 h-3.5 w-3.5" /> : <Clock className="mr-1 h-3.5 w-3.5" />}
                            {getPayoutDisplayStatus(payout) === "audit_required" ? "Needs Audit" : payout.status}
                          </Badge>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Amount</p>
                            <p className="mt-2 text-lg font-semibold text-emerald-500">{formatCurrency(payout.amount)}</p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Method</p>
                            <p className="mt-2 text-sm font-medium capitalize">{(payout.method || payout.paymentMethod)?.replace(/_/g, " ") || "N/A"}</p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Processor Reference</p>
                            <p className="mt-2 text-sm font-medium break-all">
                              {payout.bankDetails?.transferReference || payout.reference || "N/A"}
                            </p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Transfer Code</p>
                            <p className="mt-2 text-sm font-medium break-all">
                              {payout.bankDetails?.transferCode || "N/A"}
                            </p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Processor Status</p>
                            <p className="mt-2 text-sm font-medium capitalize">
                              {payout.bankDetails?.settlementMode === "split"
                                ? payout.status === "completed"
                                  ? "split settled"
                                  : "split pending"
                                : (payout.bankDetails?.transferStatus || "awaiting confirmation").replace(/_/g, " ")}
                            </p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Created</p>
                            <p className="mt-2 text-sm font-medium">{formatDate(payout.createdAt)}</p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Processed</p>
                            <p className="mt-2 text-sm font-medium">{formatDate(payout.processedAt)}</p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Transfer Cost</p>
                            <p className="mt-2 text-sm font-medium">{formatCurrency(payout.bankDetails?.transferFee || 0)}</p>
                          </div>
                          <div className="rounded-xl border p-3">
                            <p className="text-xs text-muted-foreground">Settlement Path</p>
                            <p className="mt-2 text-sm font-medium capitalize">{payout.bankDetails?.settlementMode || "standard"}</p>
                          </div>
                        </div>

                        <div className="rounded-xl border p-3">
                          <p className="text-xs text-muted-foreground">Notes</p>
                          <p className="mt-2 text-sm">{payout.notes || "No notes attached to this payout."}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="space-y-6 p-4 md:p-6 pb-8">
        <Card className="border-border/70 bg-card text-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(102deg,rgba(6,78,59,0.46)_0%,rgba(2,6,23,0.97)_48%,rgba(8,47,73,0.56)_100%)] dark:text-white">
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-50">
                    <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                    Seller Payout Operations
                  </Badge>
                  <Badge className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/40 dark:bg-sky-500/15 dark:text-sky-50">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Live updates every 15s
                  </Badge>
                </div>
                <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Seller Payouts</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground dark:text-white/80">
                  Review automatic seller settlements, pending balances, and payout records from one finance workspace.
                </p>
              </div>

              <div className="flex flex-col items-end gap-2">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="border-border/70 text-foreground hover:bg-muted dark:border-white/30 dark:text-white dark:hover:bg-white/10" onClick={reconcileCommissions} disabled={isReconciling || isRefreshing}>
                    <Sparkles className={`mr-2 h-4 w-4 ${isReconciling ? "animate-spin" : ""}`} />
                    {isReconciling ? "Reconciling..." : "Reconcile Commissions"}
                  </Button>
                  <Button variant="outline" size="sm" className="border-border/70 text-foreground hover:bg-muted dark:border-white/30 dark:text-white dark:hover:bg-white/10" onClick={refreshAll} disabled={isRefreshing}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </Button>
                </div>
                {reconcileResult && (
                  <p className="text-xs text-muted-foreground dark:text-white/70">{reconcileResult}</p>
                )}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Total Paid Out</p><DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-200" /></div><p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.totalPaid)}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Pending Balance</p><Wallet className="h-4 w-4 text-amber-600 dark:text-amber-200" /></div><p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.totalPending)}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Active Sellers</p><Users className="h-4 w-4 text-sky-600 dark:text-sky-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.activeSellers}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Average Payout</p><TrendingUp className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-200" /></div><p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.avgPayout)}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Highest Pending Seller</p><Banknote className="h-4 w-4 text-violet-600 dark:text-violet-200" /></div><p className="mt-3 text-base font-semibold">{stats.mostExposedSellerName}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{formatCurrency(stats.mostExposedSellerAmount)}</p></CardContent></Card>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Card className="border-emerald-200/60 bg-emerald-50/70 dark:border-emerald-300/20 dark:bg-emerald-500/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Verified Paid</p>
                    <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.totalPaid)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{stats.verifiedPaidCount} verified payout{stats.verifiedPaidCount === 1 ? "" : "s"}</p>
                </CardContent>
              </Card>
              <Card className="border-sky-200/60 bg-sky-50/70 dark:border-sky-300/20 dark:bg-sky-500/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Processing Transfer</p>
                    <Loader2 className="h-4 w-4 text-sky-600 dark:text-sky-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.processingTransferAmount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{stats.processingTransferCount} transfer{stats.processingTransferCount === 1 ? "" : "s"} awaiting confirmation</p>
                </CardContent>
              </Card>
              <Card className="border-amber-200/60 bg-amber-50/70 dark:border-amber-300/20 dark:bg-amber-500/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Awaiting Setup</p>
                    <CreditCard className="h-4 w-4 text-amber-600 dark:text-amber-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.awaitingSetupAmount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{stats.awaitingSetupCount} seller{stats.awaitingSetupCount === 1 ? "" : "s"} blocked by payout setup</p>
                  <p className="mt-2 text-xs text-muted-foreground dark:text-white/70">
                    {stats.awaitingSetupSellerNames.length > 0
                      ? stats.awaitingSetupSellerNames.join(", ")
                      : "No blocked sellers"}
                  </p>
                </CardContent>
              </Card>
              <Card className="border-rose-200/60 bg-rose-50/70 dark:border-rose-300/20 dark:bg-rose-500/10">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground dark:text-white/70">Audit Required</p>
                    <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-200" />
                  </div>
                  <p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.auditRequiredAmount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{stats.auditRequiredCount} payout row{stats.auditRequiredCount === 1 ? "" : "s"} need verification</p>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <details>
            <summary className="cursor-pointer list-none px-6 py-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-base font-semibold">How Seller Settlement Works</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Expand to view the full finance explanation for seller settlement, fees, and payout totals.
                  </p>
                </div>
                <span className="text-xs font-medium text-muted-foreground">Show / Hide</span>
              </div>
            </summary>
            <CardContent className="space-y-4 pt-0">
              <CardDescription>
                This page is for visibility, not manual seller approval. Seller settlement is automatic after the split succeeds, while payout transfer costs stay separate from checkout processing fees.
              </CardDescription>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-medium">Seller Share</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Seller settlement comes from merchandise subtotal minus coupon discount and minus platform commission.
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-medium">Delivery Fees</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Delivery charges are not added to seller settlement. They are tracked separately on the platform side.
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-medium">Processing Fees</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Processor fees represent the exact Paystack checkout fee paid by the customer and do not reduce or increase seller settlement amount.
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-medium">Payout Transfer Costs</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Paystack payout costs are tracked separately from checkout fees and commission. Reference payout costs are GHS 1 for mobile money and GHS 8 for bank transfer.
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-medium">Pending Balance</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Pending balance reflects automatic settlement records that are still awaiting final payout completion or transfer confirmation.
                  </p>
                </div>
                <div className="rounded-xl border border-border/70 bg-background/80 p-4">
                  <p className="text-sm font-medium">Why Totals Differ</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Gross checkout money does not equal seller payout totals. Checkout also includes platform commission, customer-paid processing fees, delivery charges, discounts, and orders still awaiting verified payout completion.
                  </p>
                </div>
              </div>
            </CardContent>
          </details>
        </Card>

        <Card>
          <CardHeader>
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-end">
              <div className="min-w-0 max-w-2xl">
                <CardTitle>Seller Settlement Queue</CardTitle>
                <CardDescription className="max-w-2xl text-sm leading-7 md:leading-relaxed">
                  Search sellers, review pending balances, and open each payout profile for detailed history.
                </CardDescription>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3 2xl:w-auto 2xl:items-end">
                <div className="relative w-full 2xl:max-w-[320px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search sellers by name, email, or phone"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10"
                  />
                </div>
                <Tabs value={queueTab} onValueChange={(value) => setQueueTab(value as FilterTab)} className="w-full">
                  <TabsList className="h-auto w-full flex-wrap justify-start gap-1 2xl:justify-end">
                    <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                    <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
                    <TabsTrigger value="processing">Processing ({tabCounts.processing})</TabsTrigger>
                    <TabsTrigger value="completed">Completed ({tabCounts.completed})</TabsTrigger>
                    <TabsTrigger value="verified_paid">Verified Paid ({tabCounts.verified_paid})</TabsTrigger>
                    <TabsTrigger value="audit_required">Audit Required ({tabCounts.audit_required})</TabsTrigger>
                    <TabsTrigger value="missing_setup">Missing Setup ({tabCounts.missing_setup})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sellersLoading && sellerRows.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (sellerRows.length === 0 && pendingPayoutRows.length === 0 && (sellersError || pendingPayoutsError)) ? (
              <div className="py-16 text-center text-muted-foreground">
                <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                <p className="mb-4">Failed to load seller payout data.</p>
                <Button variant="outline" onClick={refreshAll} disabled={isRefreshing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
                  {isRefreshing ? "Retrying..." : "Retry"}
                </Button>
              </div>
            ) : filteredSellers.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>No sellers match the current filters.</p>
              </div>
            ) : (
              <>
                <div className="grid gap-4 lg:hidden">
                  {filteredSellers.map((seller) => (
                    <Card key={`mobile-${seller.id}`} className="border-border/70 shadow-sm">
                      <CardContent className="space-y-4 p-4">
                        <div className="flex items-start gap-3">
                          <UserAvatar
                            profileImage={seller.profileImage}
                            name={seller.name}
                            email={seller.email}
                            size="md"
                            className="h-10 w-10 shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium">{seller.name}</p>
                            <p className="truncate text-sm text-muted-foreground">{seller.email}</p>
                            <p className="text-sm text-muted-foreground">{seller.phone || "No phone number"}</p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <Badge className={
                            seller.isApproved
                              ? seller.hasPayoutSetup === false
                                ? "border-amber-400/30 bg-amber-500/15 text-amber-700 dark:text-amber-200"
                                : "border-emerald-400/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                              : "border-slate-300/30 bg-slate-500/10 text-slate-600 dark:text-slate-200"
                          }>
                            {seller.isApproved ? (seller.hasPayoutSetup === false ? "Awaiting Setup" : "Approved") : "Pending"}
                          </Badge>
                          <Badge variant="secondary">{seller.payoutCount} payouts</Badge>
                        </div>

                        {seller.hasPayoutSetup === false && blockedReasonBySellerId.get(seller.id) && (
                          <p className="text-xs text-amber-700 dark:text-amber-200">{blockedReasonBySellerId.get(seller.id)}</p>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                            <p className="text-xs text-muted-foreground">Total Paid</p>
                            <p className="mt-1 font-semibold text-emerald-500">{formatCurrency(seller.totalPaid)}</p>
                          </div>
                          <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                            <p className="text-xs text-muted-foreground">Pending</p>
                            <p className="mt-1 font-semibold text-amber-500">
                              {toNumber(seller.pendingAmount) > 0 ? formatCurrency(seller.pendingAmount) : "—"}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                            <p className="text-xs text-muted-foreground">Last Payout</p>
                            <p className="mt-1 font-medium">
                              {seller.hasPayoutSetup === false ? "Awaiting Setup" : formatDate(seller.lastPayoutAt)}
                            </p>
                          </div>
                          <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                            <p className="text-xs text-muted-foreground">Payout Type</p>
                            <p className="mt-1 font-medium capitalize">{seller.payoutType?.replace(/_/g, " ") || "Not set"}</p>
                          </div>
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setSelectedSeller(seller);
                            setHistoryTab("all");
                          }}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          View Settlement
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

              <div className="hidden overflow-x-auto lg:block">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40">
                      <TableHead>Seller</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Paid</TableHead>
                      <TableHead className="text-right">Pending</TableHead>
                      <TableHead className="text-center">Payouts</TableHead>
                      <TableHead>Last Payout</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSellers.map((seller) => (
                      <TableRow key={seller.id} className="hover:bg-muted/20">
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              profileImage={seller.profileImage}
                              name={seller.name}
                              email={seller.email}
                              size="md"
                              className="h-10 w-10"
                            />
                            <div>
                              <p className="font-medium">{seller.name}</p>
                              <p className="text-sm text-muted-foreground">{seller.email}</p>
                              <p className="text-sm text-muted-foreground">{seller.phone || "No phone number"}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={
                            seller.isApproved
                              ? seller.hasPayoutSetup === false
                                ? "border-amber-400/30 bg-amber-500/15 text-amber-700 dark:text-amber-200"
                                : "border-emerald-400/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                              : "border-slate-300/30 bg-slate-500/10 text-slate-600 dark:text-slate-200"
                          }>
                            {seller.isApproved ? (seller.hasPayoutSetup === false ? "Awaiting Setup" : "Approved") : "Pending"}
                          </Badge>
                          {seller.hasPayoutSetup === false && blockedReasonBySellerId.get(seller.id) && (
                            <p className="mt-2 max-w-xs text-xs text-amber-700 dark:text-amber-200">
                              {blockedReasonBySellerId.get(seller.id)}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-emerald-500">{formatCurrency(seller.totalPaid)}</TableCell>
                        <TableCell className="text-right">
                          {toNumber(seller.pendingAmount) > 0 ? (
                            <span className="font-semibold text-amber-500">{formatCurrency(seller.pendingAmount)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{seller.payoutCount}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {seller.hasPayoutSetup === false ? "Awaiting Setup" : formatDate(seller.lastPayoutAt)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedSeller(seller);
                                setHistoryTab("all");
                              }}
                            >
                              <Eye className="mr-1 h-4 w-4" />
                              View Settlement
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
