import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductAutocomplete from "@/components/ProductAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function AdminPromotions() {
  const { toast } = useToast();
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ['/api/stores'],
    queryFn: async () => {
      const res = await fetch('/api/stores');
      return res.json();
    },
  });

  const { data: sellers = [] } = useQuery<any[]>({
    queryKey: ['/api/users/sellers'],
    queryFn: async () => {
      const res = await fetch('/api/users?role=seller');
      return res.json();
    },
  });

  const [type, setType] = useState<'store'|'product'>('store');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(24);

  const createPromotion = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', '/api/admin/promotions', payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Created', description: 'Promotional ad created' });
    },
    onError: (e: any) => toast({ title: 'Create failed', description: e.message || String(e), variant: 'destructive' }),
  });

  const handleCreate = async () => {
    const now = new Date();
    const endAt = new Date(now.getTime() + duration * 60 * 60 * 1000);
    const payload: any = {
      type,
      targetId: type === 'store' ? storeId : productId,
      startAt: now.toISOString(),
      endAt: endAt.toISOString(),
    };
    if (!payload.targetId) {
      toast({ title: 'Missing target', description: 'Please select a target store or product', variant: 'destructive' });
      return;
    }
    createPromotion.mutate(payload);
  };

  return (
    <DashboardLayout role="admin">
      <div className="p-8">
        <h1 className="text-2xl font-bold">Promotional Ads</h1>
        <p className="text-muted-foreground mt-1">Create time-limited promotions for stores or products</p>

        <div className="mt-6 space-y-4">
          <div className="flex gap-4">
            <Button variant={type === 'store' ? 'default' : 'ghost'} onClick={() => setType('store')}>Promoted Stores</Button>
            <Button variant={type === 'product' ? 'default' : 'ghost'} onClick={() => setType('product')}>Promoted Products</Button>
          </div>

          {type === 'store' ? (
            <div className="p-4 border rounded-lg">
              <Label>Select store</Label>
              <Select value={storeId || ''} onValueChange={(v) => setStoreId(v || null)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a store" />
                </SelectTrigger>
                <SelectContent>
                  {stores.map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="p-4 border rounded-lg">
              <div>
                <Label>Select seller</Label>
                <Select value={sellerId || ''} onValueChange={(v) => setSellerId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a seller" />
                  </SelectTrigger>
                  <SelectContent>
                    {sellers.map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="mt-3">
                <Label>Product (search after selecting seller)</Label>
                <ProductAutocomplete sellerId={sellerId} value={productId} onChange={(v:any) => setProductId(v)} />
                <p className="text-xs text-muted-foreground">Select a product from the chosen seller</p>
              </div>
            </div>
          )}

          <div className="p-4 border rounded-lg">
            <Label>Duration (hours)</Label>
            <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleCreate} data-testid="button-create-promo">Create Promotion</Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}



function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-medium mb-1">{children}</div>;
}
