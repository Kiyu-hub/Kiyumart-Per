import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { 
  DollarSign, 
  Clock, 
  Users, 
  TrendingUp, 
  Eye, 
  CreditCard,
  Calendar,
  Mail,
  User,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Loader2,
  RefreshCw,
  Search,
  Filter,
  Phone
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Seller {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
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
  paymentMethod: string;
  paymentDetails: string;
  createdAt: string;
  processedAt: string | null;
  notes: string | null;
}

type FilterTab = "all" | "pending" | "processing" | "completed";

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3" />,
  processing: <Loader2 className="h-3 w-3 animate-spin" />,
  completed: <CheckCircle className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
};

export default function AdminSellersPayouts() {
  const [selectedSeller, setSelectedSeller] = useState<Seller | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [payoutAmount, setPayoutAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [paymentNotes, setPaymentNotes] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return Number.isFinite(value) ? value : 0;
    if (typeof value === "string") {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    }
    return 0;
  };

  // Fetch sellers with real-time updates
  const { data: sellers = [], isLoading: sellersLoading, isError: sellersError, refetch: refetchSellers } = useQuery<Seller[]>({
    queryKey: ["/api/admin/sellers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/sellers");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 15000,
  });

  // Fetch pending payouts for counts
  const { data: pendingPayouts = [], refetch: refetchPendingPayouts } = useQuery<Payout[]>({
    queryKey: ["/api/admin/payouts/pending"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/payouts/pending");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    refetchInterval: 15000,
  });

  // Fetch selected seller's payouts
  const { data: sellerPayouts = [], isLoading: payoutsLoading, refetch: refetchSellerPayouts } = useQuery<Payout[]>({
    queryKey: ["/api/admin/sellers", selectedSeller?.id, "payouts"],
    queryFn: async () => {
      if (!selectedSeller) return [];
      const res = await apiRequest("GET", `/api/admin/sellers/${selectedSeller.id}/payouts`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!selectedSeller,
    refetchInterval: 15000,
  });

  // Process payout mutation
  const processPayoutMutation = useMutation({
    mutationFn: async (data: { sellerId: string; amount: number; method: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/admin/sellers/${data.sellerId}/payouts`, {
        amount: data.amount,
        paymentMethod: data.method,
        notes: data.notes,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payout Initiated",
        description: "The payout has been successfully initiated.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/payouts/pending"] });
      if (selectedSeller) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/sellers", selectedSeller.id, "payouts"] });
      }
      setProcessDialogOpen(false);
      setPayoutAmount("");
      setPaymentNotes("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to process payout. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalPaid = sellers.reduce((sum, s) => sum + toNumber(s.totalPaid), 0);
    const totalPending = sellers.reduce((sum, s) => sum + toNumber(s.pendingAmount), 0);
    const activeSellers = sellers.filter(s => s.isApproved).length;
    const totalPayouts = sellers.reduce((sum, s) => sum + (s.payoutCount || 0), 0);
    const avgPayout = totalPayouts > 0 ? totalPaid / totalPayouts : 0;

    return { totalPaid, totalPending, activeSellers, avgPayout };
  }, [sellers]);

  // Filter sellers based on search and tab
  const filteredSellers = useMemo(() => {
    let filtered = sellers;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        s =>
          s.name?.toLowerCase().includes(query) ||
          s.email?.toLowerCase().includes(query) ||
          s.phone?.toLowerCase().includes(query)
      );
    }

    // Tab filter
    if (activeTab === "pending") {
      filtered = filtered.filter(s => toNumber(s.pendingAmount) > 0);
    } else if (activeTab === "completed") {
      filtered = filtered.filter(s => toNumber(s.totalPaid) > 0);
    }

    return filtered;
  }, [sellers, searchQuery, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    all: sellers.length,
    pending: sellers.filter(s => toNumber(s.pendingAmount) > 0).length,
    processing: pendingPayouts.filter(p => p.status === "processing").length,
    completed: sellers.filter(s => toNumber(s.totalPaid) > 0).length,
  }), [sellers, pendingPayouts]);

  // Filter payouts by status
  const filteredPayouts = useMemo(() => {
    if (activeTab === "all") return sellerPayouts;
    return sellerPayouts.filter(p => p.status === activeTab);
  }, [sellerPayouts, activeTab]);

  const formatCurrency = (amount: number | string) => {
    const normalized = toNumber(amount);
    return `GH₵${new Intl.NumberFormat("en-GH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(normalized)}`;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const handleProcessPayout = () => {
    if (!selectedSeller || !payoutAmount) return;
    processPayoutMutation.mutate({
      sellerId: selectedSeller.id,
      amount: parseFloat(payoutAmount),
      method: paymentMethod,
      notes: paymentNotes,
    });
  };

  const { user } = useAuth();

  if (selectedSeller) {
    return (
      <DashboardLayout role={user?.role as any} showBackButton>
        <div className="p-6 lg:p-8 space-y-6">
          {/* Back Button & Seller Header */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSeller(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sellers
            </Button>
          </div>

          {/* Seller Info Card */}
          <Card className="border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">{selectedSeller.name}</CardTitle>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Mail className="h-4 w-4" />
                      {selectedSeller.email}
                    </CardDescription>
                    <CardDescription className="flex items-center gap-2 mt-1">
                      <Phone className="h-4 w-4" />
                      {selectedSeller.phone || "No phone number"}
                    </CardDescription>
                  </div>
                </div>
                <Dialog open={processDialogOpen} onOpenChange={setProcessDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      className="gap-2"
                      disabled={toNumber(selectedSeller.pendingAmount) <= 0}
                    >
                      <CreditCard className="h-4 w-4" />
                      Process Payout
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Process Payout for {selectedSeller.name}</DialogTitle>
                      <DialogDescription>
                        Available balance: {formatCurrency(selectedSeller.pendingAmount)}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Amount</label>
                        <Input
                          type="number"
                          placeholder="Enter amount"
                          value={payoutAmount}
                          onChange={(e) => setPayoutAmount(e.target.value)}
                          max={toNumber(selectedSeller.pendingAmount)}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Payment Method</label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="paypal">PayPal</SelectItem>
                            <SelectItem value="crypto">Cryptocurrency</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Notes (Optional)</label>
                        <Input
                          placeholder="Add payment notes..."
                          value={paymentNotes}
                          onChange={(e) => setPaymentNotes(e.target.value)}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setProcessDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleProcessPayout}
                        disabled={!payoutAmount || parseFloat(payoutAmount) <= 0 || processPayoutMutation.isPending}
                        className="gap-2"
                      >
                        {processPayoutMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                        Process Payout
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Total Paid</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(selectedSeller.totalPaid)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Pending Amount</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(selectedSeller.pendingAmount)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Total Payouts</p>
                  <p className="text-2xl font-bold">{selectedSeller.payoutCount}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Last Payout</p>
                  <p className="text-lg font-bold">{formatDate(selectedSeller.lastPayoutAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payout History */}
          <Card className="border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Payout History
                  </CardTitle>
                  <CardDescription>
                    Complete transaction history for this seller
                  </CardDescription>
                </div>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
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
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredPayouts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No payout history found</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processed At</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayouts.map((payout) => (
                      <TableRow key={payout.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          {formatDate(payout.createdAt)}
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(payout.amount)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {payout.paymentMethod?.replace("_", " ") || "N/A"}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`${statusColors[payout.status]} gap-1`}
                          >
                            {statusIcons[payout.status]}
                            <span className="capitalize">{payout.status}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {payout.processedAt ? formatDate(payout.processedAt) : "-"}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {payout.notes || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Seller Payouts
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and process seller payouts across the platform
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              refetchSellers();
              refetchPendingPayouts();
              if (selectedSeller) {
                refetchSellerPayouts();
              }
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardDescription>Total Paid Out</CardDescription>
              <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-green-600">{formatCurrency(stats.totalPaid)}</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardDescription>Pending Payouts</CardDescription>
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <Clock className="h-5 w-5 text-amber-600" />
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold text-amber-600">{formatCurrency(stats.totalPending)}</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardDescription>Active Sellers</CardDescription>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{stats.activeSellers}</span>
            </CardContent>
          </Card>

          <Card className="border shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardDescription>Average Payout</CardDescription>
              <div className="h-10 w-10 rounded-full bg-purple-100 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{formatCurrency(stats.avgPayout)}</span>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card className="border shadow-sm">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Sellers Overview
                </CardTitle>
                <CardDescription>
                  View and manage payouts for all sellers
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search sellers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 w-[250px]"
                  />
                </div>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="all" className="gap-1">
                      All
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5">
                        {tabCounts.all}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="pending" className="gap-1">
                      Pending
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-yellow-100 text-yellow-800">
                        {tabCounts.pending}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="processing" className="gap-1">
                      Processing
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-blue-100 text-blue-800">
                        {tabCounts.processing}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="completed" className="gap-1">
                      Completed
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 bg-green-100 text-green-800">
                        {tabCounts.completed}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {sellersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredSellers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No sellers found</p>
              </div>
            ) : sellersError ? (
              <div className="text-center py-12 text-muted-foreground">
                <XCircle className="h-12 w-12 mx-auto mb-4 text-destructive" />
                <p className="mb-3">Failed to load seller payouts data</p>
                <Button onClick={() => refetchSellers()} variant="outline" size="sm">
                  Retry
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
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
                    <TableRow key={seller.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                            {seller.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="font-medium">{seller.name}</p>
                            <p className="text-sm text-muted-foreground">{seller.email}</p>
                            <p className="text-sm text-muted-foreground">{seller.phone || "No phone number"}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={seller.isApproved 
                            ? "bg-green-50 text-green-700 border-green-200" 
                            : "bg-gray-50 text-gray-700 border-gray-200"
                          }
                        >
                          {seller.isApproved ? "Approved" : "Pending"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(seller.totalPaid)}
                      </TableCell>
                      <TableCell className="text-right">
                        {toNumber(seller.pendingAmount) > 0 ? (
                          <span className="font-semibold text-amber-600">
                            {formatCurrency(seller.pendingAmount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">
                          {seller.payoutCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(seller.lastPayoutAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedSeller(seller)}
                            className="gap-1"
                          >
                            <Eye className="h-4 w-4" />
                            View Payouts
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => {
                              setSelectedSeller(seller);
                              setProcessDialogOpen(true);
                            }}
                            disabled={toNumber(seller.pendingAmount) <= 0}
                            className="gap-1"
                          >
                            <CreditCard className="h-4 w-4" />
                            Process
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Live Update Indicator */}
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span>Live updates every 15 seconds</span>
        </div>
      </div>
    </DashboardLayout>
  );
}
