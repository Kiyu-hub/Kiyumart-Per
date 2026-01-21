import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

export default function AdminPlatformEarnings() {
  const { data: summary, isLoading: sLoading } = useQuery({ queryKey: ["/api/admin/finance-summary"], queryFn: async () => { const r = await fetch('/api/admin/finance-summary'); return r.json(); } });
  const { data: earnings, isLoading: eLoading } = useQuery({ queryKey: ["/api/admin/platform-earnings"], queryFn: async () => { const r = await fetch('/api/admin/platform-earnings?limit=50'); return r.json(); } });
  const { data: transactions, isLoading: tLoading } = useQuery({ queryKey: ["/api/admin/transactions"], queryFn: async () => { const r = await fetch('/api/admin/transactions?limit=50'); return r.json(); } });

  if (sLoading || eLoading || tLoading) {
    return (
      <DashboardLayout role="admin" showBackButton>
        <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
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
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {earnings?.map((e: any) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.orderId}</TableCell>
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
