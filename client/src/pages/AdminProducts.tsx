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
import { Loader2, Search, Edit, Eye, ArrowLeft, Package, EyeOff, MessageCircle, Store, Layers3, Boxes, Tag as TagIcon } from "lucide-react";
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
  storeName?: string | null;
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

  // Use debounced search query for filtering
  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      String(p.category || "").toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      String(p.storeName || "").toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    );
  }, [products, debouncedSearchQuery]);

  const activeProductsCount = useMemo(() => products.filter((product) => product.isActive).length, [products]);
  const lowStockCount = useMemo(() => products.filter((product) => Number(product.stock || 0) <= 5).length, [products]);
  const hiddenProductsCount = useMemo(() => products.filter((product) => !product.isActive).length, [products]);

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading products" description="Preparing product inventory, visibility, and seller context." />;
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-8">
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
              <p className="text-muted-foreground mt-1">Manage all products from all sellers</p>
            </div>
          </div>

          <div className="mb-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="relative">
              {isSearching ? (
                <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
              ) : (
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              )}
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-products"
              />
              {isSearching && (
                <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                  Searching...
                </span>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card className="rounded-[24px] border border-border/70 bg-card/95 p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Visible</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{activeProductsCount}</p>
                <p className="text-sm text-muted-foreground">Active storefront products</p>
              </Card>
              <Card className="rounded-[24px] border border-border/70 bg-card/95 p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Low Stock</p>
                <p className="mt-2 text-2xl font-semibold text-amber-600 dark:text-amber-300">{lowStockCount}</p>
                <p className="text-sm text-muted-foreground">Five units or fewer left</p>
              </Card>
              <Card className="rounded-[24px] border border-border/70 bg-card/95 p-4 shadow-sm">
                <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Hidden</p>
                <p className="mt-2 text-2xl font-semibold text-foreground">{hiddenProductsCount}</p>
                <p className="text-sm text-muted-foreground">Super-admin hidden items</p>
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  className="group overflow-hidden rounded-[28px] border border-border/70 bg-card/95 shadow-[0_18px_36px_-30px_rgba(0,0,0,0.55)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/35 hover:shadow-[0_24px_44px_-30px_rgba(16,185,129,0.18)]"
                  data-testid={`card-product-${product.id}`}
                >
                  <div className="relative aspect-[16/11] overflow-hidden bg-muted/30">
                    <img
                      src={product.images[0] || "/placeholder.jpg"}
                      alt={product.name}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                      data-testid={`img-product-${product.id}`}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/95 via-background/20 to-transparent" />
                    <div className="absolute left-4 top-4 flex items-center gap-2">
                      <Badge
                        className={product.isActive ? "border-0 bg-emerald-600 px-2 py-0.5 text-[10px] text-white shadow-sm hover:bg-emerald-600" : "border-0 bg-zinc-700 px-2 py-0.5 text-[10px] text-zinc-100 hover:bg-zinc-700"}
                        variant="secondary"
                        data-testid={`badge-status-${product.id}`}
                      >
                        {product.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </div>
                    <div className="absolute right-4 top-4 max-w-[72%]">
                      <Badge
                        variant="secondary"
                        className="max-w-full truncate border border-white/15 bg-background/80 px-2 py-0.5 text-[10px] font-medium text-foreground/90 backdrop-blur"
                        data-testid={`badge-store-${product.id}`}
                        title={product.storeName || "Unassigned store"}
                      >
                        <Store className="mr-1 h-3 w-3 shrink-0" />
                        {product.storeName || "Unassigned store"}
                      </Badge>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 p-4">
                      <div className="rounded-[18px] border border-white/10 bg-background/78 p-3 backdrop-blur-md">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-foreground/55">Product Overview</p>
                        <h3
                          className="mt-1 line-clamp-2 min-h-[2rem] text-lg font-semibold leading-tight text-foreground"
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

                  <div className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[20px] border border-border/70 bg-background/50 p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Current Price</p>
                        <p className="mt-2 text-2xl font-bold tracking-tight text-primary" data-testid={`text-price-${product.id}`}>
                          {formatPrice(parseFloat(product.price))}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">Marketplace selling price</p>
                      </div>
                      <div className="rounded-[20px] border border-border/70 bg-background/50 p-4">
                        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Inventory</p>
                        <p className="mt-2 text-2xl font-semibold text-foreground" data-testid={`text-stock-${product.id}`}>
                          {product.stock}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {product.stock <= 0 ? "Out of stock" : product.stock <= 5 ? "Running low" : "Healthy stock"}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[22px] border border-border/70 bg-muted/10 p-4">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Seller Context</p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[16px] border border-border/60 bg-background/40 p-3">
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            <Store className="h-3 w-3" />
                            Store
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground">
                            {product.storeName || "Unassigned store"}
                          </p>
                        </div>
                        <div className="rounded-[16px] border border-border/60 bg-background/40 p-3">
                          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                            <TagIcon className="h-3 w-3" />
                            Category
                          </div>
                          <p className="mt-1.5 line-clamp-2 text-sm font-medium text-foreground" data-testid={`badge-category-${product.id}`}>
                            {product.categoryName || product.category || "Uncategorized"}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-[18px] border border-border/70 bg-muted/15 px-3 py-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Boxes className="h-3.5 w-3.5" />
                        Visibility
                      </div>
                      <span className="font-semibold text-foreground">
                        {product.isActive ? "Visible on storefront" : "Hidden by Super Admin"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
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
