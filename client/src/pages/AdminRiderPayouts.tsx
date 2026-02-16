import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
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
  Bike,
  Phone,
  AlertCircle
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
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

interface Rider {
  id: string;
  name: string;
  email: string;
  phone?: string;
  momoNumber?: string;
  isApproved: boolean;
  isActive: boolean;
  totalPaid: string;
  pendingAmount: string;
  payoutCount: number;
  lastPayoutAt: string | null;
}

interface RiderPayout {
  id: string;
  riderId: string;
  orderId: string;
  amount: string;
  currency: string;
  method: string;
  status: "pending_approval" | "approved" | "processing" | "completed" | "failed" | "rejected";
  reference?: string;
  paymentDetails?: {
    accountName?: string;
    accountNumber?: string;
    bankCode?: string;
    bankName?: string;
    mobileNumber?: string;
    provider?: string;
  };
  notes?: string;
  approvedBy?: string;
  approvedAt?: string;
  processedBy?: string;
  processedAt: string | null;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

type FilterTab = "all" | "pending" | "completed" | "failed";

const statusColors: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-800 border-yellow-200",
  approved: "bg-blue-100 text-blue-800 border-blue-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  failed: "bg-red-100 text-red-800 border-red-200",
  rejected: "bg-red-100 text-red-800 border-red-200",
};

const statusIcons: Record<string, React.ReactNode> = {
  pending_approval: <Clock className="h-3 w-3" />,
  approved: <CheckCircle className="h-3 w-3" />,
  processing: <Loader2 className="h-3 w-3 animate-spin" />,
  completed: <CheckCircle className="h-3 w-3" />,
  failed: <XCircle className="h-3 w-3" />,
  rejected: <XCircle className="h-3 w-3" />,
};

export default function AdminRiderPayouts() {
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<RiderPayout | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch riders with payout summary
  const { data: riders = [], isLoading: ridersLoading, refetch: refetchRiders } = useQuery<Rider[]>({
    queryKey: ["/api/admin/riders-payouts"],
    refetchInterval: 15000,
  });

  // Fetch all pending payouts awaiting approval
  const { data: pendingPayouts = [], refetch: refetchPending } = useQuery<RiderPayout[]>({
    queryKey: ["/api/admin/rider-payouts/pending"],
    refetchInterval: 15000,
  });

  // Fetch selected rider's payouts
  const { data: riderPayouts = [], isLoading: payoutsLoading } = useQuery<RiderPayout[]>({
    queryKey: ["/api/admin/riders", selectedRider?.id, "payouts"],
    queryFn: async () => {
      if (!selectedRider) return [];
      const res = await fetch(`/api/admin/riders/${selectedRider.id}/payouts`);
      if (!res.ok) throw new Error("Failed to fetch payouts");
      return res.json();
    },
    enabled: !!selectedRider,
    refetchInterval: 15000,
  });

  // Approve payout mutation
  const approveMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      const res = await fetch(`/api/admin/rider-payouts/${payoutId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to approve payout");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payout Approved",
        description: "The rider payout has been approved and processed.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/riders-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-payouts/pending"] });
      if (selectedRider) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/riders", selectedRider.id, "payouts"] });
      }
      setApproveDialogOpen(false);
      setSelectedPayout(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to approve payout. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Reject payout mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ payoutId, reason }: { payoutId: string; reason: string }) => {
      const res = await fetch(`/api/admin/rider-payouts/${payoutId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error("Failed to reject payout");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payout Rejected",
        description: "The rider payout has been rejected.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/riders-payouts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-payouts/pending"] });
      if (selectedRider) {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/riders", selectedRider.id, "payouts"] });
      }
      setRejectDialogOpen(false);
      setSelectedPayout(null);
      setRejectReason("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to reject payout. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Calculate stats
  const stats = useMemo(() => {
    const totalPaid = riders.reduce((sum, r) => sum + parseFloat(r.totalPaid || "0"), 0);
    const totalPending = riders.reduce((sum, r) => sum + parseFloat(r.pendingAmount || "0"), 0);
    const activeRiders = riders.filter(r => r.isApproved && r.isActive).length;
    const totalPayouts = riders.reduce((sum, r) => sum + (r.payoutCount || 0), 0);
    const avgPayout = totalPayouts > 0 ? totalPaid / totalPayouts : 0;
    const pendingApprovals = pendingPayouts.length;

    return { totalPaid, totalPending, activeRiders, avgPayout, pendingApprovals };
  }, [riders, pendingPayouts]);

  // Filter riders based on search and tab
  const filteredRiders = useMemo(() => {
    let filtered = riders;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        r => r.name?.toLowerCase().includes(query) || 
             r.email?.toLowerCase().includes(query) ||
             r.phone?.toLowerCase().includes(query)
      );
    }

    if (activeTab === "pending") {
      filtered = filtered.filter(r => parseFloat(r.pendingAmount || "0") > 0);
    } else if (activeTab === "completed") {
      filtered = filtered.filter(r => parseFloat(r.totalPaid || "0") > 0);
    }

    return filtered;
  }, [riders, searchQuery, activeTab]);

  // Tab counts
  const tabCounts = useMemo(() => ({
    all: riders.length,
    pending: riders.filter(r => parseFloat(r.pendingAmount || "0") > 0).length,
    completed: riders.filter(r => parseFloat(r.totalPaid || "0") > 0).length,
    failed: 0,
  }), [riders]);

  // Filter payouts by status
  const filteredPayouts = useMemo(() => {
    if (activeTab === "all") return riderPayouts;
    // Map "pending" tab to "pending_approval" status
    if (activeTab === "pending") {
      return riderPayouts.filter(p => p.status === "pending_approval" || p.status === "approved" || p.status === "processing");
    }
    if (activeTab === "failed") {
      return riderPayouts.filter(p => p.status === "failed" || p.status === "rejected");
    }
    return riderPayouts.filter(p => p.status === activeTab);
  }, [riderPayouts, activeTab]);

  const formatCurrency = (amount: string | number) => {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-GH", {
      style: "currency",
      currency: "GHS",
    }).format(num);
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

  // Rider detail view
  if (selectedRider) {
    return (
      <DashboardLayout role={user?.role as any} showBackButton>
        <div className="p-6 lg:p-8 space-y-6">
          {/* Back Button & Rider Header */}
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedRider(null)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Riders
            </Button>
          </div>

          {/* Rider Info Card */}
          <Card className="border shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bike className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">{selectedRider.name}</CardTitle>
                    <CardDescription className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1">
                        <Mail className="h-4 w-4" />
                        {selectedRider.email}
                      </span>
                      {selectedRider.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          {selectedRider.phone}
                        </span>
                      )}
                    </CardDescription>
                    {selectedRider.momoNumber && (
                      <p className="text-sm text-muted-foreground mt-1">
                        MoMo: {selectedRider.momoNumber}
                      </p>
                    )}
                  </div>
                </div>
                <Badge 
                  variant="outline"
                  className={selectedRider.isActive 
                    ? "bg-green-50 text-green-700 border-green-200" 
                    : "bg-gray-50 text-gray-700 border-gray-200"
                  }
                >
                  {selectedRider.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Total Paid</p>
                  <p className="text-2xl font-bold text-green-600">{formatCurrency(selectedRider.totalPaid)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Pending Amount</p>
                  <p className="text-2xl font-bold text-amber-600">{formatCurrency(selectedRider.pendingAmount)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Total Payouts</p>
                  <p className="text-2xl font-bold">{selectedRider.payoutCount}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-4 border">
                  <p className="text-muted-foreground text-sm">Last Payout</p>
                  <p className="text-lg font-bold">{formatDate(selectedRider.lastPayoutAt)}</p>
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
                    Complete delivery payout history for this rider
                  </CardDescription>
                </div>
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as FilterTab)}>
                  <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                    <TabsTrigger value="failed">Failed</TabsTrigger>
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
                      <TableHead>Order ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Processed At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPayouts.map((payout) => (
                      <TableRow key={payout.id} className="hover:bg-slate-50">
                        <TableCell className="font-medium">
                          {formatDate(payout.createdAt)}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          #{payout.orderId}
                        </TableCell>
                        <TableCell className="font-semibold text-green-600">
                          {formatCurrency(payout.amount)}
                        </TableCell>
                        <TableCell className="capitalize">
                          {payout.method?.replace('_', ' ') || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`${statusColors[payout.status]} gap-1`}
                          >
                            {statusIcons[payout.status]}
                            <span className="capitalize">{payout.status.replace('_', ' ')}</span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {payout.processedAt ? formatDate(payout.processedAt) : "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          {payout.status === "pending_approval" && (
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-green-600 hover:text-green-700"
                                onClick={() => {
                                  setSelectedPayout(payout);
                                  setApproveDialogOpen(true);
                                }}
                              >
                                <CheckCircle className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1 text-red-600 hover:text-red-700"
                                onClick={() => {
                                  setSelectedPayout(payout);
                                  setRejectDialogOpen(true);
                                }}
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Approve Dialog */}
        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve Payout</DialogTitle>
              <DialogDescription>
                Are you sure you want to approve this payout of {selectedPayout && formatCurrency(selectedPayout.amount)} to {selectedRider.name}?
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <p className="text-sm"><strong>Order:</strong> #{selectedPayout?.orderId}</p>
                <p className="text-sm"><strong>Payout Amount:</strong> {selectedPayout && formatCurrency(selectedPayout.amount)}</p>
                <p className="text-sm"><strong>Payment Method:</strong> {selectedPayout?.method?.replace('_', ' ') || "Mobile Money"}</p>
                {selectedPayout?.notes && (
                  <p className="text-sm"><strong>Notes:</strong> {selectedPayout.notes}</p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => selectedPayout && approveMutation.mutate(selectedPayout.id)}
                disabled={approveMutation.isPending}
                className="gap-2 bg-green-600 hover:bg-green-700"
              >
                {approveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Approve Payout
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Payout</DialogTitle>
              <DialogDescription>
                Are you sure you want to reject this payout? Please provide a reason.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="bg-red-50 rounded-lg p-4 space-y-2 border border-red-200">
                <p className="text-sm"><strong>Order:</strong> #{selectedPayout?.orderId}</p>
                <p className="text-sm"><strong>Amount:</strong> {selectedPayout && formatCurrency(selectedPayout.amount)}</p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Reason for Rejection</label>
                <Textarea
                  placeholder="Enter reason for rejecting this payout..."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={() => selectedPayout && rejectMutation.mutate({ payoutId: selectedPayout.id, reason: rejectReason })}
                disabled={rejectMutation.isPending}
                className="gap-2"
              >
                {rejectMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Reject Payout
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DashboardLayout>
    );
  }

  // Main list view
  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="p-6 lg:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Rider Payouts
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage and approve rider delivery payouts
            </p>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => {
              refetchRiders();
              refetchPending();
            }}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Pending Approvals Alert */}
        {stats.pendingApprovals > 0 && (
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="flex items-center gap-4 py-4">
              <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-amber-800">
                  {stats.pendingApprovals} Payout{stats.pendingApprovals > 1 ? "s" : ""} Awaiting Approval
                </p>
                <p className="text-sm text-amber-600">
                  Review and approve pending rider delivery payouts
                </p>
              </div>
            </CardContent>
          </Card>
        )}

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
              <CardDescription>Active Riders</CardDescription>
              <div className="h-10 w-10 rounded-full bg-blue-100 flex items-center justify-center">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{stats.activeRiders}</span>
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
                  <Bike className="h-5 w-5 text-primary" />
                  Riders Overview
                </CardTitle>
                <CardDescription>
                  View and manage payouts for all delivery riders
                </CardDescription>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search riders..."
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
                    <TabsTrigger value="completed" className="gap-1">
                      Paid
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
            {ridersLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredRiders.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Bike className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No riders found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Rider</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead className="text-center">Payouts</TableHead>
                    <TableHead>Last Payout</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRiders.map((rider) => (
                    <TableRow key={rider.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold">
                            {rider.name?.charAt(0)?.toUpperCase() || "?"}
                          </div>
                          <div>
                            <p className="font-medium">{rider.name}</p>
                            <p className="text-sm text-muted-foreground">{rider.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline"
                          className={rider.isActive 
                            ? "bg-green-50 text-green-700 border-green-200" 
                            : "bg-gray-50 text-gray-700 border-gray-200"
                          }
                        >
                          {rider.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {formatCurrency(rider.totalPaid)}
                      </TableCell>
                      <TableCell className="text-right">
                        {parseFloat(rider.pendingAmount || "0") > 0 ? (
                          <span className="font-semibold text-amber-600">
                            {formatCurrency(rider.pendingAmount)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary" className="font-mono">
                          {rider.payoutCount}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(rider.lastPayoutAt)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setSelectedRider(rider)}
                            className="gap-1"
                          >
                            <Eye className="h-4 w-4" />
                            View Payouts
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
