import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export default function AdminPlatformEarnings() {
  const { data: summary, isLoading: sLoading } = useQuery({ queryKey: ["/api/admin/finance-summary"], queryFn: async () => { const r = await fetch('/api/admin/finance-summary'); return r.json(); } });

  // Filters state
  const [storeId, setStoreId] = useState<string | undefined>(undefined);
  const [sellerId, setSellerId] = useState<string | undefined>(undefined);
  const [fromDate, setFromDate] = useState<string | undefined>(undefined);
  const [toDate, setToDate] = useState<string | undefined>(undefined);

  const earningsQueryKey = ["/api/admin/platform-earnings", storeId, sellerId, fromDate, toDate];
  const { data: earnings, isLoading: eLoading } = useQuery({ queryKey: earningsQueryKey, queryFn: async () => { 
    const params = new URLSearchParams();
    params.set('limit','50');
    if (storeId) params.set('storeId', storeId);
    if (sellerId) params.set('sellerId', sellerId);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const r = await fetch('/api/admin/platform-earnings?' + params.toString()); return r.json(); } });

  const { data: transactions, isLoading: tLoading } = useQuery({ queryKey: ["/api/admin/transactions"], queryFn: async () => { const r = await fetch('/api/admin/transactions?limit=50'); return r.json(); } });

  const { data: stores = [] } = useQuery({ queryKey: ['/api/stores'], queryFn: async () => { const r = await fetch('/api/stores'); return r.json(); } });

  // Defensive error handling: API may return { error: '...' } instead of an array
  const earningsError = earnings && !Array.isArray(earnings) ? (earnings.error || 'Failed to load earnings') : null;

  if (sLoading || eLoading || tLoading) {
    return (
      <DashboardLayout role="admin" showBackButton>
        <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </DashboardLayout>
    );
  }

  if (earningsError) {
    return (
      <DashboardLayout role="admin" showBackButton>
        <div className="p-8">
          <div className="max-w-2xl">
            <Card>
              <CardHeader>
                <CardTitle>Platform Earnings</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-destructive">{earningsError}</p>
                <div className="mt-4">
                  <button className="btn" onClick={() => window.location.reload()}>Retry</button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="admin" showBackButton>
      <div className="p-8">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Platform Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">GHS {summary?.total || '0.00'}</div>
              <div className="text-sm text-muted-foreground mt-2">Breakdown by type</div>
              <ul className="mt-2">
                {summary?.byType && Object.entries(summary.byType).map(([k,v]) => (
                  <li key={k} className="text-sm">{`${k}: GHS ${v}`}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent Earnings</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <div className="flex items-center gap-2 mb-4">
                <select value={storeId || ''} onChange={(ev) => setStoreId(ev.target.value || undefined)} className="input">
                  <option value="">All Stores</option>
                  {stores.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                </select>
                <input type="date" value={fromDate || ''} onChange={(e) => setFromDate(e.target.value || undefined)} className="input" />
                <input type="date" value={toDate || ''} onChange={(e) => setToDate(e.target.value || undefined)} className="input" />
                <button type="button" className="btn" onClick={() => { /* trigger refetch via state change already */ }}>Apply</button>
              </div>

              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Store</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {earnings?.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell>{e.orderNumber || e.orderId}</TableCell>
                    <TableCell>{e.storeName || '-'}</TableCell>
                    <TableCell>{e.sellerName || e.sellerId}</TableCell>
                    <TableCell>{e.type}</TableCell>
                    <TableCell>GHS {e.amount}</TableCell>
                    <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions?.map((t: any) => (
                    <TableRow key={t.id}>
                      <TableCell>{t.paymentReference}</TableCell>
                      <TableCell>{t.orderId}</TableCell>
                      <TableCell>GHS {t.amount}</TableCell>
                      <TableCell>{t.status}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
