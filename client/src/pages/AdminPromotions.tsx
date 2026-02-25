import { useState, useEffect, useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ProductAutocomplete from "@/components/ProductAutocomplete";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Plus, Trash2, Check, Loader2, Upload, Store, ShoppingBag, Filter, RotateCcw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";

export default function AdminPromotions() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);
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

  const { data: allPromotions = [], refetch, isRefetching } = useQuery<any[]>({
    queryKey: ['/api/admin/promotions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/promotions');
      return res.json();
    },
    refetchInterval: 3000,
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
  const [imageUrl, setImageUrl] = useState<string>('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  // Filter states
  const [typeFilter, setTypeFilter] = useState<'all' | 'store' | 'product'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'scheduled' | 'expired'>('all');

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
    onSuccess: async () => {
      // Invalidate AND immediately refetch to ensure UI updates
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/promotions'] });
      await refetch();
      toast({ title: 'Ended', description: 'Promotion has been ended successfully', variant: 'default' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message || String(e), variant: 'destructive' }),
  });

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    
    setImageFile(file);
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      setUploading(true);
      const res = await fetch('/api/upload/image', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (res.ok) {
        const { url } = await res.json();
        setImageUrl(url);
        toast({ title: 'Success', description: 'Image uploaded successfully' });
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({ title: 'Upload failed', description: errorData.error || 'Could not upload image', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Error', description: String(e), variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    // Auto-generate CTA URL based on selection
    let finalCtaUrl = ctaUrl;
    if (!finalCtaUrl) {
      if (type === 'store' && storeId) {
        finalCtaUrl = `/sellers/${storeId}`;
      } else if (type === 'product' && productIds.length > 0) {
        finalCtaUrl = `/product/${productIds[0]}`;
      }
    }

    // Get default image from store/product if not uploaded
    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
      try {
        if (type === 'store' && storeId) {
          const storeRes = await fetch(`/api/stores/${storeId}`);
          const store = await storeRes.json();
          finalImageUrl = store?.logo || store?.banner || '';
        } else if (type === 'product' && productIds.length > 0) {
          const prodRes = await fetch(`/api/products/${productIds[0]}`);
          const prod = await prodRes.json();
          finalImageUrl = prod?.images?.[0] || '';
        }
      } catch (e) {
        console.error('Failed to get default image:', e);
      }
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + duration * 60 * 60 * 1000);

    const basePayload: any = {
      type,
      startAt: now.toISOString(),
      endAt: endAt.toISOString(),
      title: title || null,
      description: description || null,
      imageUrl: finalImageUrl || null,
      ctaText: ctaText || null,
      ctaUrl: finalCtaUrl || null,
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
    // Use server-side isActive status first
    if (promo.isActive === false) return 'expired';
    
    const now = new Date();
    if (promo.endAt && new Date(promo.endAt) < now) return 'expired';
    if (promo.startAt && new Date(promo.startAt) > now) return 'scheduled';
    return 'active';
  };

  // Filter promotions based on selected filters
  const filteredPromotions = useMemo(() => {
    return allPromotions.filter((p: any) => {
      // Type filter
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      
      // Status filter
      if (statusFilter !== 'all') {
        const status = getPromotionStatus(p);
        if (status !== statusFilter) return false;
      }
      
      return true;
    });
  }, [allPromotions, typeFilter, statusFilter]);

  // Stats for filter badges
  const stats = useMemo(() => {
    return {
      total: allPromotions.length,
      store: allPromotions.filter((p: any) => p.type === 'store').length,
      product: allPromotions.filter((p: any) => p.type === 'product').length,
      active: allPromotions.filter((p: any) => getPromotionStatus(p) === 'active').length,
      scheduled: allPromotions.filter((p: any) => getPromotionStatus(p) === 'scheduled').length,
      expired: allPromotions.filter((p: any) => getPromotionStatus(p) === 'expired').length,
    };
  }, [allPromotions]);

  const resetFilters = () => {
    setTypeFilter('all');
    setStatusFilter('all');
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

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user.role as "admin" | "super_admin"}>
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
                    <div className="flex-1 text-foreground">
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
                <label className="font-medium">CTA URL (Optional)</label>
                <Input 
                  value={ctaUrl} 
                  onChange={(e) => setCtaUrl(e.target.value)} 
                  placeholder="Leave empty for auto-redirect to store/product" 
                  className="text-foreground"
                />
              </div>

              <div className="md:col-span-2">
                <label className="font-medium">Promotion Image (Optional)</label>
                <p className="text-xs text-muted-foreground mb-3">Upload an image or leave empty to use the store/product image automatically</p>
                <label className="flex items-center justify-center w-full px-4 py-6 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors bg-muted/30">
                  <div className="text-center">
                    <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                    <span className="text-sm font-medium">Click to upload or drag and drop</span>
                    <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
                  </div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                {imageUrl && (
                  <div className="mt-4 relative inline-block">
                    <img src={imageUrl} alt="Promotion" className="h-32 w-auto rounded border shadow-sm" />
                    <button
                      onClick={() => { setImageUrl(''); setImageFile(null); }}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 shadow-sm"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                )}
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

        {/* Promotions Table with Filters */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Promotions Management
                </CardTitle>
                <CardDescription>
                  Showing {filteredPromotions.length} of {allPromotions.length} promotions
                </CardDescription>
              </div>
              {(typeFilter !== 'all' || statusFilter !== 'all') && (
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reset Filters
                </Button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-col md:flex-row gap-4 mt-4">
              {/* Type Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Filter by Type</label>
                <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                  <TabsList className="grid grid-cols-3">
                    <TabsTrigger value="all" className="gap-1">
                      All
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {stats.total}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="store" className="gap-1">
                      <Store className="h-3.5 w-3.5" />
                      Store
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {stats.store}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="product" className="gap-1">
                      <ShoppingBag className="h-3.5 w-3.5" />
                      Product
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                        {stats.product}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Status Filter */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Filter by Status</label>
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <TabsList className="grid grid-cols-4">
                    <TabsTrigger value="all">
                      All
                    </TabsTrigger>
                    <TabsTrigger value="active" className="gap-1">
                      🔴 Active
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-green-100 text-green-800">
                        {stats.active}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="scheduled" className="gap-1">
                      ⏰ Scheduled
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-blue-100 text-blue-800">
                        {stats.scheduled}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="expired" className="gap-1">
                      ✓ Expired
                      <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs bg-gray-100 text-gray-800">
                        {stats.expired}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {filteredPromotions.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {allPromotions.length === 0 
                    ? "No promotions yet. Create one to get started!"
                    : "No promotions match your filters."
                  }
                </p>
                {allPromotions.length > 0 && (
                  <Button variant="outline" className="mt-4" onClick={resetFilters}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset Filters
                  </Button>
                )}
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
                    {filteredPromotions.map((p: any) => {
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
