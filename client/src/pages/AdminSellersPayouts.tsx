import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableRow, TableCell, TableHead, TableHeader } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

export default function AdminSellersPayouts(){
  const { data: sellers = [], isLoading } = useQuery({
    queryKey: ['/api/admin/sellers'],
    queryFn: async () => { const r = await fetch('/api/admin/sellers'); return r.json(); }
  });

  const [selectedSeller, setSelectedSeller] = useState<any | null>(null);
  const { data: payouts = [] } = useQuery({
    queryKey: ['/api/admin/sellers', selectedSeller?.id, 'payouts'],
    enabled: !!selectedSeller,
    queryFn: async () => { const r = await fetch(`/api/admin/sellers/${selectedSeller.id}/payouts`); return r.json(); }
  });

  if (isLoading) return (
    <DashboardLayout role="admin" showBackButton>
      <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
    </DashboardLayout>
  );

  return (
    <DashboardLayout role="admin" showBackButton>
      <div className="p-8">
        <div className="grid grid-cols-1 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>All Sellers & Payouts</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Seller</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Total Paid</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Payouts</TableHead>
                    <TableHead>Last Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sellers.map((s: any) => (
                    <TableRow key={s.id} className="cursor-pointer hover:bg-muted" onClick={() => setSelectedSeller(s)}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell>{s.email}</TableCell>
                      <TableCell>GHS {s.totalPaid}</TableCell>
                      <TableCell>GHS {s.pendingAmount}</TableCell>
                      <TableCell>{s.payoutCount}</TableCell>
                      <TableCell>{s.lastPayoutAt ? new Date(s.lastPayoutAt).toLocaleString() : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {selectedSeller && (
            <Card>
              <CardHeader>
                <CardTitle>Payouts for {selectedSeller.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Processed By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payouts.map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.id}</TableCell>
                        <TableCell>GHS {p.amount}</TableCell>
                        <TableCell>{p.status}</TableCell>
                        <TableCell>{p.processedAt ? new Date(p.processedAt).toLocaleString() : new Date(p.createdAt).toLocaleString()}</TableCell>
                        <TableCell>{p.processedBy || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}