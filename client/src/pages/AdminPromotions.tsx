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

  const { data: allPromotions = [], refetch } = useQuery<any[]>({
    queryKey: ['/api/admin/promotions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/promotions');
      return res.json();
    },
  });


  const [type, setType] = useState<'store'|'product'>('store');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productLabels, setProductLabels] = useState<Record<string,string>>({});
  const [duration, setDuration] = useState<number>(24);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [ctaText, setCtaText] = useState<string>('Shop now');
  const [ctaUrl, setCtaUrl] = useState<string>('');
  const [themeColor, setThemeColor] = useState<string>('#16a34a');
  const [imageUrl, setImageUrl] = useState<string>('');

  const createPromotion = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest('POST', '/api/admin/promotions', payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/promotions'] });
      toast({ title: 'Created', description: 'Promotional ad created' });
    },
    onError: (e: any) => toast({ title: 'Create failed', description: e.message || String(e), variant: 'destructive' }),
  });

  const handleCreate = async () => {
    const now = new Date();
    const endAt = new Date(now.getTime() + duration * 60 * 60 * 1000);

    const basePayload: any = {
      type,
      startAt: now.toISOString(),
      endAt: endAt.toISOString(),
      title: title || null,
      description: description || null,
      imageUrl: imageUrl || null,
      ctaText: ctaText || null,
      ctaUrl: ctaUrl || null,
      themeColor: themeColor || null,
    };

    if (type === 'store') {
      if (!storeId) {
        toast({ title: 'Missing store', description: 'Please select a store to promote', variant: 'destructive' });
        return;
      }
      createPromotion.mutate({ ...basePayload, targetId: storeId });
      return;
    }

    // product type: allow creating for a single product or multiple selected products
    const selectedIds = productIds.length > 0 ? productIds : (productId ? [productId] : []);
    if (selectedIds.length === 0) {
      toast({ title: 'Missing product', description: 'Please select at least one product', variant: 'destructive' });
      return;
    }

    // bulk create by sending targetIds array
    createPromotion.mutate({ ...basePayload, targetIds: selectedIds });
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
                <Label>Product(s) (search after selecting seller)</Label>
                <div className="flex gap-2 items-center">
                  <ProductAutocomplete sellerId={sellerId} value={productId} onChange={(v:any) => setProductId(v)} />
                  <Button onClick={async () => {
                    if (!productId) return;
                    // fetch product name for label and then add
                    try {
                      const res = await fetch(`/api/products/${productId}`);
                      const json = res.ok ? await res.json() : null;
                      const name = json?.name || productId;
                      setProductLabels(pl => ({ ...pl, [productId]: name }));
                      setProductIds(prev => Array.from(new Set([...prev, productId])));
                      setProductId(null);
                    } catch (e) {
                      setProductIds(prev => Array.from(new Set([...prev, productId])));
                      setProductId(null);
                    }
                  }} disabled={!productId} size="sm">Add</Button>
                </div>
                <p className="text-xs text-muted-foreground">You may add multiple products; they'll each be created as separate promotions</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {productIds.map((pid) => (
                    <div key={pid} className="px-2 py-1 bg-primary/10 text-primary rounded-full flex items-center gap-2">
                      <span className="text-sm text-primary-foreground">{productLabels[pid] || pid}</span>
                      <button onClick={() => { setProductIds(prev => prev.filter(x => x !== pid)); setProductLabels(pl => { const copy = {...pl}; delete copy[pid]; return copy; }); }} className="text-xs text-destructive">Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="p-4 border rounded-lg grid grid-cols-1 gap-3">
            <div>
              <Label>Duration (hours)</Label>
              <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="text-foreground" />
            </div>

            <div>
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Short headline for the promotion" className="text-foreground" />
            </div>

            <div>
              <Label>Description</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description (optional)" className="text-foreground" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>CTA Text</Label>
                <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} className="text-foreground" />
              </div>
              <div>
                <Label>CTA Url</Label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="/product/.. or https://.." className="text-foreground" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 items-end">
              <div>
                <Label>Theme color</Label>
                <input type="color" value={themeColor} onChange={(e) => setThemeColor(e.target.value)} className="w-full h-9 p-0 border rounded" />
              </div>
              <div>
                <Label>Image URL</Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className="text-foreground" />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleCreate} data-testid="button-create-promo">Create Promotion</Button>
            </div>
          </div>

          <div className="p-4 border rounded-lg">
            <h2 className="text-lg font-semibold">Active & Recent Promotions</h2>
            <div className="mt-3 space-y-2">
              {allPromotions.length === 0 ? (
                <div className="text-sm text-muted-foreground">No promotions yet</div>
              ) : (
                allPromotions.map((p:any) => (
                  <div key={p.id} className="p-3 border rounded flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="font-semibold">{p.title || (p.type === 'product' ? (p.product?.name || p.targetId) : (p.store?.name || p.targetId))}</div>
                      <div className="text-xs text-muted-foreground mt-1">{p.description || ''}</div>
                      <div className="text-xs text-muted-foreground mt-1">{p.type} • {new Date(p.startAt).toLocaleString()} → {p.endAt ? new Date(p.endAt).toLocaleString() : '—'}</div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button variant="ghost" onClick={async () => { await fetch(`/api/admin/promotions/${p.id}/expire`, { method: 'PATCH' }); await refetch(); toast({ title: 'Ended', description: 'Promotion ended' }); }}>End</Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}



function Label({ children }: { children: React.ReactNode }) {
  return <div className="font-medium mb-1">{children}</div>;
}
