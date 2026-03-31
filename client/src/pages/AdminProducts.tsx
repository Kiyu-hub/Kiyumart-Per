import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Loader2, Search, Edit, Eye, ArrowLeft, Package, EyeOff, MessageCircle, Store, Layers3, Boxes } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";

interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  categoryName?: string | null;
  stock: number;
  images: string[];
  isActive: boolean;
  sellerId: string;
  storeId?: string | null;
  storeName?: string | null;
}

interface StoreRecord {
  id: string;
  name: string;
  primarySellerId?: string | null;
}

interface ProductStoreGroup {
  storeKey: string;
  storeName: string;
  hasLinkedStore: boolean;
  items: Product[];
}

function HideProductDialog({ product }: { product: Product }) {
  const { toast } = useToast();

  const hideProductMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/products/${product.id}/status`, { isActive: !product.isActive });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: product.isActive ? "Product hidden successfully" : "Product restored successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "admin-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update product visibility",
        variant: "destructive",
      });
    },
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" data-testid={`button-hide-${product.id}`} title={product.isActive ? "Hide product" : "Unhide product"}>
          <EyeOff className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{product.isActive ? "Hide Product" : "Unhide Product"}</AlertDialogTitle>
          <AlertDialogDescription>
            {product.isActive
              ? `Hide "${product.name}" from storefront listings?`
              : `Restore "${product.name}" so it appears in storefront listings again?`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-hide">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => hideProductMutation.mutate()}
            disabled={hideProductMutation.isPending}
            className={product.isActive ? "bg-amber-600 text-white hover:bg-amber-700" : ""}
            data-testid="button-confirm-hide"
          >
            {hideProductMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {product.isActive ? "Hide Product" : "Unhide Product"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AdminProducts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStoreKey, setSelectedStoreKey] = useState<string | null>(null);
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  // Debounce search query to avoid excessive filtering
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Show loading state while debouncing
  const isSearching = searchQuery !== debouncedSearchQuery;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "admin-products"],
    queryFn: () => fetchApiJson<Product[]>("/api/products"),
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchOnMount: "always",
  });

  const { data: stores = [] } = useQuery<StoreRecord[]>({
    queryKey: ["/api/stores", "admin-products"],
    queryFn: () => fetchApiJson<StoreRecord[]>("/api/stores"),
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchOnMount: "always",
  });

  const activeProductsCount = useMemo(() => products.filter((product) => product.isActive).length, [products]);
  const lowStockCount = useMemo(() => products.filter((product) => Number(product.stock || 0) <= 5).length, [products]);
  const hiddenProductsCount = useMemo(() => products.filter((product) => !product.isActive).length, [products]);
  const storeNameById = useMemo(() => {
    const map = new Map<string, StoreRecord>();
    stores.forEach((store) => {
      if (store.id) map.set(String(store.id), store);
    });
    return map;
  }, [stores]);
  const storeBySellerId = useMemo(() => {
    const map = new Map<string, StoreRecord>();
    stores.forEach((store) => {
      const sellerId = String(store.primarySellerId || "").trim();
      const storeName = String(store.name || "").trim();
      if (sellerId && storeName) map.set(sellerId, store);
    });
    return map;
  }, [stores]);
  const resolveStoreMeta = useMemo(() => {
    return (product: Product) => {
      const explicitStore = storeNameById.get(String(product.storeId || "").trim());
      if (explicitStore) {
        return {
          storeKey: String(explicitStore.id),
          storeName: String(explicitStore.name || "").trim() || "Unnamed store",
          hasLinkedStore: true,
        };
      }

      const sellerStore = storeBySellerId.get(String(product.sellerId || "").trim());
      if (sellerStore) {
        return {
          storeKey: String(sellerStore.id),
          storeName: String(sellerStore.name || "").trim() || "Unnamed store",
          hasLinkedStore: true,
        };
      }

      return {
        storeKey: `unassigned:${String(product.sellerId || product.id)}`,
        storeName: "Unassigned store",
        hasLinkedStore: false,
      };
    };
  }, [storeNameById, storeBySellerId]);
  const filteredProducts = useMemo(() => {
    const normalizedQuery = debouncedSearchQuery.toLowerCase().trim();
    if (!normalizedQuery) return products;

    return products.filter((product) =>
      product.name.toLowerCase().includes(normalizedQuery) ||
      String(product.category || "").toLowerCase().includes(normalizedQuery) ||
      String(product.categoryName || "").toLowerCase().includes(normalizedQuery) ||
      resolveStoreMeta(product).storeName.toLowerCase().includes(normalizedQuery),
    );
  }, [products, debouncedSearchQuery, resolveStoreMeta]);
  const groupedProducts = useMemo<ProductStoreGroup[]>(() => {
    const grouped = new Map<string, ProductStoreGroup>();
    filteredProducts.forEach((product) => {
      const resolvedStore = resolveStoreMeta(product);
      const existing = grouped.get(resolvedStore.storeKey) || {
        storeKey: resolvedStore.storeKey,
        storeName: resolvedStore.storeName,
        hasLinkedStore: resolvedStore.hasLinkedStore,
        items: [],
      };
      existing.items.push(product);
      grouped.set(resolvedStore.storeKey, existing);
    });

    return Array.from(grouped.values())
      .sort((left, right) => {
        if (left.hasLinkedStore !== right.hasLinkedStore) {
          return left.hasLinkedStore ? -1 : 1;
        }
        return left.storeName.localeCompare(right.storeName);
      })
      .map((group) => ({
        ...group,
        storeName: group.storeName,
        items: group.items.sort((left, right) => left.name.localeCompare(right.name)),
      }));
  }, [filteredProducts, resolveStoreMeta]);
  const selectedStoreGroup = useMemo(
    () => groupedProducts.find((group) => group.storeKey === selectedStoreKey) || groupedProducts[0] || null,
    [groupedProducts, selectedStoreKey],
  );

  useEffect(() => {
    if (groupedProducts.length === 0) {
      if (selectedStoreKey !== null) {
        setSelectedStoreKey(null);
      }
      return;
    }

    const hasSelectedStore = selectedStoreKey
      ? groupedProducts.some((group) => group.storeKey === selectedStoreKey)
      : false;

    if (!hasSelectedStore) {
      setSelectedStoreKey(groupedProducts[0].storeKey);
    }
  }, [groupedProducts, selectedStoreKey]);

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading products" description="Preparing product inventory, visibility, and seller context." />;
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-4 md:p-6">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-products">Products Management</h1>
              <p className="text-muted-foreground mt-1">Browse stores first, then open a store to manage the products inside it</p>
            </div>
          </div>

          <div className="mb-5">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2.3fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.85fr)]">
              <div className="relative">
                {isSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                )}
                <Input
                  placeholder="Search stores, products, or categories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-14 pl-10 pr-20 text-base"
                  data-testid="input-search-products"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                    Searching...
                  </span>
                )}
              </div>
              <Card className="h-14 rounded-[18px] border border-border/70 bg-card/95 px-4 shadow-sm">
                <div className="flex h-full items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Visible</p>
                    <p className="truncate text-xs text-muted-foreground">Storefront products</p>
                  </div>
                  <p className="text-3xl font-semibold leading-none text-foreground">{activeProductsCount}</p>
                </div>
              </Card>
              <Card className="h-14 rounded-[18px] border border-border/70 bg-card/95 px-4 shadow-sm">
                <div className="flex h-full items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Low Stock</p>
                    <p className="truncate text-xs text-muted-foreground">Five or fewer left</p>
                  </div>
                  <p className="text-3xl font-semibold leading-none text-amber-600 dark:text-amber-300">{lowStockCount}</p>
                </div>
              </Card>
              <Card className="h-14 rounded-[18px] border border-border/70 bg-card/95 px-4 shadow-sm">
                <div className="flex h-full items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Hidden</p>
                    <p className="truncate text-xs text-muted-foreground">Super-admin items</p>
                  </div>
                  <p className="text-3xl font-semibold leading-none text-foreground">{hiddenProductsCount}</p>
                </div>
              </Card>
            </div>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : isSearching ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-6">
              {groupedProducts.length > 0 && (
                <section className="space-y-4">
                  <div className="rounded-[22px] border border-border/70 bg-card/90 p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold text-foreground">Stores</h2>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Select a store to reveal all products under it.
                        </p>
                      </div>
                      <Badge variant="secondary">{groupedProducts.length} store{groupedProducts.length === 1 ? "" : "s"}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {groupedProducts.map((group) => {
                        const isSelected = selectedStoreGroup?.storeKey === group.storeKey;
                        const visibleCount = group.items.filter((item) => item.isActive).length;
                        const lowStockItems = group.items.filter((item) => Number(item.stock || 0) <= 5).length;
                        return (
                          <button
                            key={group.storeKey}
                            type="button"
                            onClick={() => setSelectedStoreKey(group.storeKey)}
                            className={`rounded-[20px] border p-4 text-left shadow-sm transition-all ${
                              isSelected
                                ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                                : "border-border/70 bg-card/85 hover:border-primary/35 hover:bg-card"
                            }`}
                            data-testid={`button-store-group-${group.storeKey}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <Store className="h-4 w-4 text-primary" />
                                  <h3 className="truncate text-lg font-semibold text-foreground">{group.storeName}</h3>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {group.hasLinkedStore ? "Store-linked products" : "Products awaiting store mapping"}
                                </p>
                              </div>
                              {!group.hasLinkedStore && (
                                <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                                  Needs link
                                </Badge>
                              )}
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-2">
                              <div className="rounded-[14px] border border-border/60 bg-background/60 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Products</p>
                                <p className="mt-1 text-lg font-semibold text-foreground">{group.items.length}</p>
                              </div>
                              <div className="rounded-[14px] border border-border/60 bg-background/60 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Visible</p>
                                <p className="mt-1 text-lg font-semibold text-foreground">{visibleCount}</p>
                              </div>
                              <div className="rounded-[14px] border border-border/60 bg-background/60 px-3 py-2">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Low</p>
                                <p className="mt-1 text-lg font-semibold text-foreground">{lowStockItems}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </section>
              )}

              {selectedStoreGroup && (
                <section key={selectedStoreGroup.storeKey} className="space-y-4">
                  <div className="rounded-[22px] border border-border/70 bg-card/90 p-4 shadow-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Store className="h-4 w-4 text-primary" />
                          <h2 className="truncate text-xl font-semibold text-foreground">{selectedStoreGroup.storeName}</h2>
                          {!selectedStoreGroup.hasLinkedStore && (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-300">
                              Needs store link
                            </Badge>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">
                          All products for the selected store are shown below.
                        </p>
                      </div>
                      <Badge variant="secondary">
                        {selectedStoreGroup.items.length} product{selectedStoreGroup.items.length === 1 ? "" : "s"}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {selectedStoreGroup.items.map((product) => (
                      <Card
                        key={product.id}
                        className="group overflow-hidden rounded-[22px] border border-border/70 bg-card/95 shadow-[0_16px_30px_-30px_rgba(0,0,0,0.5)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_22px_38px_-30px_rgba(16,185,129,0.16)]"
                        data-testid={`card-product-${product.id}`}
                      >
                        <div className="relative aspect-[16/9] overflow-hidden bg-muted/30">
                          <img
                            src={product.images[0] || "/placeholder.jpg"}
                            alt={product.name}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                            data-testid={`img-product-${product.id}`}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
                          <div className="absolute left-3 top-3 flex items-center gap-2">
                            <Badge
                              className={product.isActive ? "border-0 bg-emerald-600 px-2 py-0.5 text-[10px] text-white shadow-sm hover:bg-emerald-600" : "border-0 bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-100 hover:bg-zinc-700"}
                              variant="secondary"
                              data-testid={`badge-status-${product.id}`}
                            >
                              {product.isActive ? "Active" : "Deactivated"}
                            </Badge>
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-3">
                            <div className="rounded-[16px] border border-white/10 bg-background/82 p-3 backdrop-blur-md">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/55">Product Overview</p>
                              <h3
                                className="mt-1 line-clamp-2 min-h-[1.8rem] text-base font-semibold leading-tight text-foreground"
                                data-testid={`text-product-name-${product.id}`}
                              >
                                {product.name}
                              </h3>
                              <p className="mt-1 text-xs text-foreground/65">
                                {product.categoryName || product.category || "Uncategorized"}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-3 p-3.5">
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[16px] border border-border/70 bg-background/50 p-3">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current Price</p>
                              <p className="mt-2 text-xl font-bold tracking-tight text-primary" data-testid={`text-price-${product.id}`}>
                                {formatPrice(parseFloat(product.price))}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">Marketplace selling price</p>
                            </div>
                            <div className="rounded-[16px] border border-border/70 bg-background/50 p-3">
                              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Inventory</p>
                              <p className="mt-2 text-xl font-semibold text-foreground" data-testid={`text-stock-${product.id}`}>
                                {product.stock}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {product.stock <= 0 ? "Out of stock" : product.stock <= 5 ? "Running low" : "Healthy stock"}
                              </p>
                            </div>
                          </div>

                          <div className="rounded-[18px] border border-border/70 bg-muted/10 p-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Store Context</p>
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-[14px] border border-border/60 bg-background/40 p-3">
                                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  <Layers3 className="h-3 w-3" />
                                  Store Group
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">
                                  {selectedStoreGroup.storeName}
                                </p>
                              </div>
                              <div className="rounded-[14px] border border-border/60 bg-background/40 p-3">
                                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                  <Store className="h-3 w-3" />
                                  Store Link
                                </div>
                                <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground" data-testid={`badge-category-${product.id}`}>
                                  {selectedStoreGroup.hasLinkedStore ? "Mapped to active store record" : "Missing mapped store record"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="rounded-[18px] border border-border/70 bg-muted/10 p-3">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Category</p>
                            <p className="mt-2 text-sm font-medium text-foreground">
                              {product.categoryName || product.category || "Uncategorized"}
                            </p>
                          </div>

                          <div className="flex items-center justify-between rounded-[14px] border border-border/70 bg-muted/15 px-3 py-2.5 text-sm">
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Boxes className="h-3.5 w-3.5" />
                              Visibility
                            </div>
                            <span className="font-semibold text-foreground">
                              {product.isActive ? "Visible on storefront" : "Hidden by Super Admin"}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
                            <div className="text-xs text-muted-foreground">
                              Product ID: <span className="font-medium text-foreground/80">{product.id.slice(0, 8)}</span>
                            </div>
                            <div className="flex items-center justify-end gap-0.5">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/product/${product.id}`)}
                                data-testid={`button-view-${product.id}`}
                                title="View product"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/admin/products/${product.id}/edit`)}
                                data-testid={`button-edit-${product.id}`}
                                title="Edit product"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const params = new URLSearchParams({
                                    userId: product.sellerId,
                                    productId: product.id,
                                    productName: product.name,
                                    productImage: product.images?.[0] || "",
                                    productLink: `/product/${product.id}`,
                                  });
                                  navigate(`/admin/messages?${params.toString()}`);
                                }}
                                data-testid={`button-message-seller-${product.id}`}
                                title="Message seller about this product"
                              >
                                <MessageCircle className="h-4 w-4" />
                              </Button>
                              <HideProductDialog product={product} />
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

              {filteredProducts.length === 0 && !isSearching && (
                <div className="text-center py-12 col-span-full">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground" data-testid="text-no-products">
                    {debouncedSearchQuery ? "No products found matching your search" : "No products available"}
                  </p>
                </div>
              )}
            </div>
          )}
      </div>
    </DashboardLayout>
  );
}
