import { useState, useEffect } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductAutocomplete from "@/components/ProductAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Clock, Plus, Trash2, Check, Loader2 } from "lucide-react";

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

  const expirePromotion = useMutation({
    mutationFn: async (promoId: string) => {
      const res = await apiRequest('PATCH', `/api/admin/promotions/${promoId}/expire`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/promotions'] });
      toast({ title: 'Success', description: 'Promotion ended' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message || String(e), variant: 'destructive' }),
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

  const getPromotionStatus = (promo: any) => {
    const now = new Date();
    if (promo.endAt && new Date(promo.endAt) < now) return 'expired';
    if (new Date(promo.startAt) > now) return 'scheduled';
    return 'active';
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <DashboardLayout role="admin">
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Promotional Ads</h1>
          <p className="text-muted-foreground mt-1">Create and manage time-limited promotions for stores or products</p>
        </div>

        {/* Create Promotion Form Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Create New Promotion
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Type Selection */}
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <Button 
                variant={type === 'store' ? 'default' : 'outline'} 
                onClick={() => { setType('store'); setSellerId(null); setProductId(null); setProductIds([]); }}
                className="w-full"
              >
                Store Promotion
              </Button>
              <Button 
                variant={type === 'product' ? 'default' : 'outline'} 
                onClick={() => { setType('product'); setStoreId(null); }}
                className="w-full"
              >
                Product Promotion
              </Button>
            </div>

            {/* Store Selection */}
            {type === 'store' && (
              <div>
                <label className="font-medium">Select Store *</label>
                <Select value={storeId || ''} onValueChange={(v) => setStoreId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Product Selection */}
            {type === 'product' && (
              <div className="space-y-4">
                <div>
                  <label className="font-medium">Select Seller *</label>
                  <Select value={sellerId || ''} onValueChange={(v) => setSellerId(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a seller" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="font-medium">Product(s) *</label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <ProductAutocomplete sellerId={sellerId} value={productId} onChange={(v: any) => setProductId(v)} />
                    </div>
                    <Button 
                      onClick={async () => {
                        if (!productId) return;
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
                      }} 
                      disabled={!productId}
                      size="sm"
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Add multiple products - each will be created as a separate promotion</p>
                </div>

                {productIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-3 bg-muted rounded-lg">
                    {productIds.map((pid) => (
                      <Badge key={pid} variant="secondary" className="cursor-pointer hover:opacity-75">
                        <span>{productLabels[pid] || pid}</span>
                        <button 
                          onClick={() => { 
                            setProductIds(prev => prev.filter(x => x !== pid)); 
                            setProductLabels(pl => { const copy = {...pl}; delete copy[pid]; return copy; }); 
                          }} 
                          className="ml-2 text-xs"
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Promotion Details Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="font-medium">Duration (hours) *</label>
                <Input 
                  type="number" 
                  min={1} 
                  value={duration} 
                  onChange={(e) => setDuration(Number(e.target.value))} 
                  className="text-foreground"
                />
              </div>

              <div>
                <label className="font-medium">Title</label>
                <Input 
                  value={title} 
                  onChange={(e) => setTitle(e.target.value)} 
                  placeholder="e.g., Summer Sale" 
                  className="text-foreground"
                />
              </div>

              <div>
                <label className="font-medium">Description</label>
                <Input 
                  value={description} 
                  onChange={(e) => setDescription(e.target.value)} 
                  placeholder="Short description" 
                  className="text-foreground"
                />
              </div>

              <div>
                <label className="font-medium">CTA Text</label>
                <Input 
                  value={ctaText} 
                  onChange={(e) => setCtaText(e.target.value)} 
                  placeholder="e.g., Shop now" 
                  className="text-foreground"
                />
              </div>

              <div>
                <label className="font-medium">CTA URL</label>
                <Input 
                  value={ctaUrl} 
                  onChange={(e) => setCtaUrl(e.target.value)} 
                  placeholder="/product/... or https://..." 
                  className="text-foreground"
                />
              </div>

              <div>
                <label className="font-medium">Image URL</label>
                <Input 
                  value={imageUrl} 
                  onChange={(e) => setImageUrl(e.target.value)} 
                  placeholder="https://..." 
                  className="text-foreground"
                />
              </div>

              <div>
                <label className="font-medium">Theme Color</label>
                <input 
                  type="color" 
                  value={themeColor} 
                  onChange={(e) => setThemeColor(e.target.value)} 
                  className="w-full h-10 p-1 border rounded cursor-pointer"
                />
              </div>
            </div>

            <Button 
              onClick={handleCreate} 
              disabled={createPromotion.isPending}
              className="w-full md:w-auto"
              size="lg"
            >
              {createPromotion.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Promotion
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Promotions Table */}
        <Card>
          <CardHeader>
            <CardTitle>Active & Recent Promotions</CardTitle>
          </CardHeader>
          <CardContent>
            {allPromotions.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No promotions yet. Create one to get started!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Name/Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>End Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allPromotions.map((p: any) => {
                      const status = getPromotionStatus(p);
                      const targetName = p.type === 'product' 
                        ? (p.product?.name || p.targetId.slice(0, 8))
                        : (p.store?.name || p.targetId.slice(0, 8));

                      return (
                        <TableRow key={p.id} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">
                            {p.title || targetName}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {p.type === 'product' ? '🛍️ Product' : '🏪 Store'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {targetName}
                          </TableCell>
                          <TableCell className="text-sm">
                            {formatDate(p.startAt)}
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.endAt ? formatDate(p.endAt) : '—'}
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                status === 'active' ? 'default' : 
                                status === 'scheduled' ? 'outline' : 
                                'secondary'
                              }
                            >
                              {status === 'active' && '🔴 Active'}
                              {status === 'scheduled' && '⏰ Scheduled'}
                              {status === 'expired' && '✓ Expired'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  disabled={status === 'expired'}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>End Promotion?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to end this promotion? This action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => expirePromotion.mutate(p.id)}
                                    disabled={expirePromotion.isPending}
                                  >
                                    {expirePromotion.isPending ? 'Ending...' : 'End Promotion'}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        </TableRow>
                      );
                    })}
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
