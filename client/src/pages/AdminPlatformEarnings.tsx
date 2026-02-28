import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Loader2, DollarSign, TrendingUp, Store, ShoppingCart, Calendar, Filter, 
  RotateCcw, CreditCard, Wallet, Receipt, ArrowUpRight, ArrowDownRight, Percent
} from "lucide-react";

export default function AdminPlatformEarnings() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const { data: summary, isLoading: sLoading, refetch: refetchSummary } = useQuery({ 
    queryKey: ["/api/admin/finance-summary"], 
    queryFn: async () => { const r = await fetch('/api/admin/finance-summary'); return r.json(); },
    refetchInterval: 30000,
  });

  const [storeId, setStoreId] = useState<string>("all");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [earningType, setEarningType] = useState<string>("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: earnings = [], isLoading: eLoading, refetch: refetchEarnings } = useQuery({ 
    queryKey: ["/api/admin/platform-earnings", storeId, fromDate, toDate], 
    queryFn: async () => { 
      const params = new URLSearchParams();
      params.set('limit','100');
      if (storeId && storeId !== 'all') params.set('storeId', storeId);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const r = await fetch('/api/admin/platform-earnings?' + params.toString()); 
      return r.json(); 
    },
    refetchInterval: 15000,
  });

  const { data: transactions = [], isLoading: tLoading, refetch: refetchTransactions } = useQuery({ 
    queryKey: ["/api/admin/transactions"], 
    queryFn: async () => { const r = await fetch('/api/admin/transactions?limit=100'); return r.json(); },
    refetchInterval: 15000,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetchSummary(), refetchEarnings(), refetchTransactions()]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const { data: stores = [] } = useQuery({ 
    queryKey: ['/api/stores'], 
    queryFn: async () => { const r = await fetch('/api/stores'); return r.json(); } 
  });

  const earningsError = earnings && !Array.isArray(earnings) ? (earnings.error || 'Failed to load') : null;
  const earningsArray = Array.isArray(earnings) ? earnings : [];

  const filteredEarnings = useMemo(() => {
    if (earningType === 'all') return earningsArray;
    return earningsArray.filter((e: any) => e.type === earningType);
  }, [earningsArray, earningType]);

  const stats = useMemo(() => {
    const total = parseFloat(summary?.total || '0');
    const byType = summary?.byType || {};
    const commission = parseFloat(byType['commission'] || '0');
    const delivery = parseFloat(byType['delivery_fee'] || '0');
    return { total, commission, delivery, transactionCount: Array.isArray(transactions) ? transactions.length : 0, earningsCount: earningsArray.length };
  }, [summary, transactions, earningsArray]);

  const resetFilters = () => { setStoreId("all"); setFromDate(""); setToDate(""); setEarningType("all"); };
  const hasFilters = storeId !== "all" || fromDate || toDate || earningType !== "all";

  const getTypeBadge = (type: string) => {
    switch (type?.toLowerCase()) {
      case 'commission': return <Badge className="bg-green-100 text-green-800"><Percent className="h-3 w-3 mr-1" />Commission</Badge>;
      case 'delivery_fee': return <Badge className="bg-blue-100 text-blue-800"><ShoppingCart className="h-3 w-3 mr-1" />Delivery Fee</Badge>;
      case 'promotion': return <Badge className="bg-purple-100 text-purple-800"><TrendingUp className="h-3 w-3 mr-1" />Promotion</Badge>;
      default: return <Badge variant="outline">{type}</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'completed': case 'success': return <Badge className="bg-green-100 text-green-800"><ArrowUpRight className="h-3 w-3 mr-1" />Success</Badge>;
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed': return <Badge className="bg-red-100 text-red-800"><ArrowDownRight className="h-3 w-3 mr-1" />Failed</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const formatCurrency = (amount: number | string) => {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    return `GHS ${num.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-GH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sLoading || eLoading || tLoading) {
    return (
      <DashboardLayout role={user.role as "admin" | "super_admin"} showBackButton>
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Loading financial data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (earningsError) {
    return (
      <DashboardLayout role={user.role as "admin" | "super_admin"} showBackButton>
        <div className="p-8">
          <Card className="max-w-2xl mx-auto">
            <CardHeader><CardTitle className="text-destructive">Error Loading Data</CardTitle></CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">{earningsError}</p>
              <Button onClick={handleRefresh} disabled={isRefreshing}>
                <RotateCcw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
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
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Platform Earnings</h1>
            <p className="text-muted-foreground mt-1">Monitor your platform's financial performance</p>
          </div>
          <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
            <RotateCcw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="bg-gradient-to-br from-green-50 to-green-100/50 border-green-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-green-800">Total Earnings</CardTitle>
              <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center"><DollarSign className="h-5 w-5 text-green-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-900">{formatCurrency(stats.total)}</div>
              <p className="text-xs text-green-700 mt-1">From {stats.earningsCount} records</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100/50 border-blue-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-blue-800">Commission</CardTitle>
              <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center"><Percent className="h-5 w-5 text-blue-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-900">{formatCurrency(stats.commission)}</div>
              <p className="text-xs text-blue-700 mt-1">Platform commission</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100/50 border-purple-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-purple-800">Delivery Fees</CardTitle>
              <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center"><ShoppingCart className="h-5 w-5 text-purple-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-900">{formatCurrency(stats.delivery)}</div>
              <p className="text-xs text-purple-700 mt-1">Collected fees</p>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-50 to-orange-100/50 border-orange-200">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-orange-800">Transactions</CardTitle>
              <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center"><CreditCard className="h-5 w-5 text-orange-600" /></div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-900">{stats.transactionCount}</div>
              <p className="text-xs text-orange-700 mt-1">Total transactions</p>
            </CardContent>
          </Card>
        </div>

        {summary?.byType && Object.keys(summary.byType).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Wallet className="h-5 w-5" />Earnings Breakdown</CardTitle>
              <CardDescription>By source type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                {Object.entries(summary.byType).map(([type, amount]: [string, any]) => (
                  <div key={type} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                    <span className="text-sm font-medium capitalize">{type.replace('_', ' ')}</span>
                    <span className="text-sm font-bold">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><Filter className="h-5 w-5" />Earnings History</CardTitle>
                <CardDescription>Showing {filteredEarnings.length} records</CardDescription>
              </div>
              {hasFilters && <Button variant="outline" size="sm" onClick={resetFilters}><RotateCcw className="h-4 w-4 mr-2" />Reset</Button>}
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Store</label>
                <Select value={storeId} onValueChange={setStoreId}>
                  <SelectTrigger><SelectValue placeholder="All Stores" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {stores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Type</label>
                <Tabs value={earningType} onValueChange={setEarningType} className="w-full">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="commission">Commission</TabsTrigger>
                    <TabsTrigger value="delivery_fee">Delivery</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />From</label>
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />To</label>
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredEarnings.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">{earningsArray.length === 0 ? "No earnings yet." : "No matches."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Order</TableHead>
                      <TableHead>Store</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredEarnings.map((e: any) => (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">#{e.orderNumber || e.orderId?.slice(0, 8)}</TableCell>
                        <TableCell><div className="flex items-center gap-2"><Store className="h-4 w-4 text-muted-foreground" />{e.storeName || '—'}</div></TableCell>
                        <TableCell className="text-sm">{e.sellerName || e.sellerId?.slice(0, 8) || '—'}</TableCell>
                        <TableCell>{getTypeBadge(e.type)}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">{formatCurrency(e.amount)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(e.createdAt)}</TableCell>
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
            <CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5" />Recent Transactions</CardTitle>
            <CardDescription>Payment transactions</CardDescription>
          </CardHeader>
          <CardContent>
            {!Array.isArray(transactions) || transactions.length === 0 ? (
              <div className="text-center py-12">
                <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No transactions yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Reference</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.slice(0, 20).map((t: any) => (
                      <TableRow key={t.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-sm">{t.paymentReference?.slice(0, 12)}...</TableCell>
                        <TableCell>#{t.orderId?.slice(0, 8)}</TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(t.amount)}</TableCell>
                        <TableCell>{getStatusBadge(t.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{t.createdAt ? formatDate(t.createdAt) : '—'}</TableCell>
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
