import { useMemo, useState } from "react";
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
  totalPaid: number | string;
  pendingAmount: number | string;
  payoutCount: number;
  lastPayoutAt: string | null;
}

interface Payout {
  id: string;
  sellerId: string;
  amount: number | string;
  status: "pending" | "processing" | "completed" | "failed";
  method?: string;
  paymentMethod: string;
  paymentDetails: string;
  bankDetails?: {
    transferFee?: string;
    settlementMode?: string;
  } | null;
  createdAt: string;
  processedAt: string | null;
  notes: string | null;
}

type FilterTab = "all" | "pending" | "processing" | "completed";

const statusTone: Record<Payout["status"], string> = {
  pending: "border-amber-400/30 bg-amber-500/15 text-amber-200",
  processing: "border-sky-400/30 bg-sky-500/15 text-sky-200",
  completed: "border-emerald-400/30 bg-emerald-500/15 text-emerald-200",
  failed: "border-red-400/30 bg-red-500/15 text-red-200",
};

export default function AdminSellersPayouts() {
  const { user } = useAuth();

  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

  const {
    data: sellers = [],
    isLoading: sellersLoading,
    isError: sellersError,
    refetch: refetchSellers,
  } = useQuery<Seller[]>({
    queryKey: ["/api/admin/sellers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/sellers");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 15000,
  });

  const {
    data: pendingPayouts = [],
    refetch: refetchPendingPayouts,
  } = useQuery<Payout[]>({
    queryKey: ["/api/admin/payouts/pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payouts/pending");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 15000,
  });

  const {
    data: sellerPayouts = [],
    isLoading: payoutsLoading,
    refetch: refetchSellerPayouts,
  } = useQuery<Payout[]>({
    queryKey: ["/api/admin/sellers", selectedSeller?.id, "payouts"],
    queryFn: async () => {
      if (!selectedSeller) return [];
      const res = await apiRequest("GET", `/api/admin/sellers/${selectedSeller.id}/payouts`);
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: !!selectedSeller,
    refetchInterval: 15000,
  });

  const stats = useMemo(() => {
    const totalPaid = sellers.reduce((sum, seller) => sum + toNumber(seller.totalPaid), 0);
    const totalPending = sellers.reduce((sum, seller) => sum + toNumber(seller.pendingAmount), 0);
    const activeSellers = sellers.filter((seller) => seller.isApproved).length;
    const totalPayouts = sellers.reduce((sum, seller) => sum + (seller.payoutCount || 0), 0);
    const avgPayout = totalPayouts > 0 ? totalPaid / totalPayouts : 0;

    const mostExposedSeller = [...sellers]
      .sort((a, b) => toNumber(b.pendingAmount) - toNumber(a.pendingAmount))[0];

    return {
      totalPaid,
      totalPending,
      activeSellers,
      totalPayouts,
      avgPayout,
      mostExposedSellerName: mostExposedSeller?.name || "No seller data",
      mostExposedSellerAmount: toNumber(mostExposedSeller?.pendingAmount),
    };
  }, [sellers]);

  const filteredSellers = useMemo(() => {
    let rows = sellers;
    const processingSellerIds = new Set(
      pendingPayouts
        .filter((payout) => payout.status === "processing")
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

    if (activeTab === "pending") {
      rows = rows.filter((seller) => toNumber(seller.pendingAmount) > 0);
    } else if (activeTab === "processing") {
      rows = rows.filter((seller) => processingSellerIds.has(seller.id));
    } else if (activeTab === "completed") {
      rows = rows.filter((seller) => toNumber(seller.totalPaid) > 0);
    }

    return rows;
  }, [activeTab, pendingPayouts, searchQuery, sellers]);

  const tabCounts = useMemo(() => ({
    all: sellers.length,
    pending: sellers.filter((seller) => toNumber(seller.pendingAmount) > 0).length,
    processing: pendingPayouts.filter((payout) => payout.status === "processing").length,
    completed: sellers.filter((seller) => toNumber(seller.totalPaid) > 0).length,
  }), [pendingPayouts, sellers]);

  const filteredPayouts = useMemo(() => {
    if (activeTab === "all") return sellerPayouts;
    return sellerPayouts.filter((payout) => payout.status === activeTab);
  }, [activeTab, sellerPayouts]);

  const refreshAll = async () => {
    await Promise.all([
      refetchSellers(),
      refetchPendingPayouts(),
      selectedSeller ? refetchSellerPayouts() : Promise.resolve(),
    ]);
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
            <Button variant="outline" size="sm" onClick={refreshAll}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh History
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
                <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><p className="text-xs text-muted-foreground dark:text-white/70">Last Payout</p><p className="mt-3 text-lg font-semibold">{formatDate(selectedSeller.lastPayoutAt)}</p></CardContent></Card>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <CardTitle>Payout History</CardTitle>
                  <CardDescription>Live payout records for this seller account.</CardDescription>
                </div>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FilterTab)}>
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
              {payoutsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
                          <Badge className={statusTone[payout.status]}>
                            {payout.status === "processing" ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : payout.status === "completed" ? <CheckCircle className="mr-1 h-3.5 w-3.5" /> : payout.status === "failed" ? <XCircle className="mr-1 h-3.5 w-3.5" /> : <Clock className="mr-1 h-3.5 w-3.5" />}
                            {payout.status}
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

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="border-border/70 text-foreground hover:bg-muted dark:border-white/30 dark:text-white dark:hover:bg-white/10" onClick={refreshAll}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Total Paid Out</p><DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-200" /></div><p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.totalPaid)}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Pending Balance</p><Wallet className="h-4 w-4 text-amber-600 dark:text-amber-200" /></div><p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.totalPending)}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Active Sellers</p><Users className="h-4 w-4 text-sky-600 dark:text-sky-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.activeSellers}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Average Payout</p><TrendingUp className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-200" /></div><p className="mt-3 text-2xl font-semibold">{formatCurrency(stats.avgPayout)}</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Highest Pending Seller</p><Banknote className="h-4 w-4 text-violet-600 dark:text-violet-200" /></div><p className="mt-3 text-base font-semibold">{stats.mostExposedSellerName}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/70">{formatCurrency(stats.mostExposedSellerAmount)}</p></CardContent></Card>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">How Seller Settlement Works</CardTitle>
            <CardDescription>
              This page is for visibility, not manual seller approval. Seller settlement is automatic after the split succeeds, while payout transfer costs stay separate from checkout processing fees.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
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
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle>Seller Settlement Queue</CardTitle>
                <CardDescription>
                  Search sellers, review pending balances, and open each payout profile for detailed history.
                </CardDescription>
              </div>
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search sellers by name, email, or phone"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-[280px] pl-10"
                  />
                </div>
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="all">All ({tabCounts.all})</TabsTrigger>
                    <TabsTrigger value="pending">Pending ({tabCounts.pending})</TabsTrigger>
                    <TabsTrigger value="processing">Processing ({tabCounts.processing})</TabsTrigger>
                    <TabsTrigger value="completed">Completed ({tabCounts.completed})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sellersLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sellersError ? (
              <div className="py-16 text-center text-muted-foreground">
                <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
                <p className="mb-4">Failed to load seller payout data.</p>
                <Button variant="outline" onClick={refreshAll}>
                  Retry
                </Button>
              </div>
            ) : filteredSellers.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                <Users className="mx-auto mb-4 h-12 w-12 opacity-50" />
                <p>No sellers match the current filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
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
                          <Badge className={seller.isApproved ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200" : "border-slate-300/30 bg-slate-500/10 text-slate-600 dark:text-slate-200"}>
                            {seller.isApproved ? "Approved" : "Pending"}
                          </Badge>
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
                        <TableCell className="text-muted-foreground">{formatDate(seller.lastPayoutAt)}</TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => setSelectedSeller(seller)}>
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
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
