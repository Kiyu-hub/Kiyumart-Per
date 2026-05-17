import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Loader2, Search, Edit, ArrowLeft, EyeOff, UtensilsCrossed } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";
import { isFoodVendorStore } from "@/lib/foodVendors";

// Admin Food Products — mirrors AdminProducts but lists only food/restaurant
// items. Lives under /admin/food-products. Keeps inventory for food separate
// from generic products so super admin can manage each independently.

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
  businessType?: string | null;
  storeType?: string | null;
  merchantCategory?: string | null;
}

function HideProductDialog({ product }: { product: Product }) {
  const { toast } = useToast();
  const hideProductMutation = useMutation({
    mutationFn: async () => apiRequest("PATCH", `/api/products/${product.id}/status`, { isActive: !product.isActive }),
    onSuccess: () => {
      toast({ title: "Success", description: product.isActive ? "Product hidden" : "Product restored" });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" title={product.isActive ? "Hide" : "Unhide"}>
          <EyeOff className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{product.isActive ? "Hide menu item" : "Unhide menu item"}</AlertDialogTitle>
          <AlertDialogDescription>
            {product.isActive
              ? `Hide "${product.name}" so buyers can no longer order it.`
              : `Restore "${product.name}" so it appears on the menu again.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => hideProductMutation.mutate()}>
            {hideProductMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {product.isActive ? "Hide" : "Unhide"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AdminFoodProducts() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const isSearching = searchQuery !== debouncedSearchQuery;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "admin-food-products"],
    queryFn: () => fetchApiJson<Product[]>("/api/products"),
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchOnMount: "always",
  });

  const { data: stores = [] } = useQuery<StoreRecord[]>({
    queryKey: ["/api/stores", "admin-food-products"],
    queryFn: () => fetchApiJson<StoreRecord[]>("/api/stores"),
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchOnMount: "always",
  });

  // Only show items from food vendors / restaurants.
  const foodMap = useMemo(() => {
    const byId = new Map<string, StoreRecord>();
    const sellerToStore = new Map<string, StoreRecord>();
    for (const s of stores) {
      if (!s?.id || !isFoodVendorStore(s as any)) continue;
      byId.set(String(s.id), s);
      if (s.primarySellerId) sellerToStore.set(String(s.primarySellerId), s);
    }
    return { byId, sellerToStore };
  }, [stores]);

  const foodProducts = useMemo(() => {
    return products.filter((p) => {
      const sid = String(p.storeId || "").trim();
      const sellerId = String(p.sellerId || "").trim();
      if (sid && foodMap.byId.has(sid)) return true;
      if (!sid && sellerId && foodMap.sellerToStore.has(sellerId)) return true;
      return false;
    });
  }, [products, foodMap]);

  const filteredProducts = useMemo(() => {
    const q = debouncedSearchQuery.toLowerCase().trim();
    if (!q) return foodProducts;
    return foodProducts.filter((p) => {
      const storeName = (p.storeId && foodMap.byId.get(String(p.storeId))?.name)
        || (p.sellerId && foodMap.sellerToStore.get(String(p.sellerId))?.name)
        || p.storeName || "";
      return p.name.toLowerCase().includes(q)
        || String(p.categoryName || "").toLowerCase().includes(q)
        || storeName.toLowerCase().includes(q);
    });
  }, [foodProducts, debouncedSearchQuery, foodMap]);

  const activeCount = useMemo(() => foodProducts.filter((p) => p.isActive).length, [foodProducts]);
  const hiddenCount = useMemo(() => foodProducts.filter((p) => !p.isActive).length, [foodProducts]);

  if (authLoading || !isAuthenticated) return <PageLoadingState />;

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <UtensilsCrossed className="h-7 w-7 text-primary" />
              Food Products
            </h1>
            <p className="text-muted-foreground mt-1">
              Menu items from every restaurant and local vendor on the platform.
            </p>
          </div>
          <Button variant="outline" onClick={() => navigate("/admin/products")}>
            All other products
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Total menu items</p>
            <p className="mt-1 text-2xl font-bold">{foodProducts.length}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Visible</p>
            <p className="mt-1 text-2xl font-bold text-primary">{activeCount}</p>
          </Card>
          <Card className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Hidden</p>
            <p className="mt-1 text-2xl font-bold text-muted-foreground">{hiddenCount}</p>
          </Card>
        </div>

        <div className="relative">
          {isSearching ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          )}
          <Input
            placeholder="Search menu items, restaurants, or categories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 pl-10 text-base"
            data-testid="input-search-food-products"
          />
        </div>

        {isLoading ? (
          <Card className="p-10 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto animate-spin" />
            <p className="mt-3 text-sm">Loading food products…</p>
          </Card>
        ) : filteredProducts.length === 0 ? (
          <Card className="p-10 text-center">
            <UtensilsCrossed className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <h3 className="mt-3 text-lg font-semibold">No food products yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {debouncedSearchQuery
                ? "Nothing matches your search."
                : "When restaurants and local vendors add menu items they'll appear here."}
            </p>
          </Card>
        ) : (
          <Card>
            <div className="divide-y divide-border">
              {filteredProducts.map((p) => {
                const img = Array.isArray(p.images) ? p.images[0] : "";
                const storeName =
                  (p.storeId && foodMap.byId.get(String(p.storeId))?.name) ||
                  (p.sellerId && foodMap.sellerToStore.get(String(p.sellerId))?.name) ||
                  p.storeName ||
                  "Unassigned restaurant";
                return (
                  <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="h-14 w-14 rounded-md overflow-hidden bg-muted flex-shrink-0">
                      {img ? (
                        <img src={img} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full grid place-items-center text-xl">🍽️</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate" data-testid={`row-food-product-${p.id}`}>{p.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {storeName}
                        {p.categoryName ? ` · ${p.categoryName}` : ""}
                      </p>
                    </div>
                    <div className="hidden sm:block text-right">
                      <p className="font-semibold">GH₵ {parseFloat(p.price || "0").toFixed(2)}</p>
                      <Badge variant={p.isActive ? "default" : "secondary"} className="mt-1">
                        {p.isActive ? "Visible" : "Hidden"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(`/admin/products/${p.id}/edit`)}
                        data-testid={`button-edit-food-product-${p.id}`}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <HideProductDialog product={p} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
