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
import { Loader2, Search, Edit, Eye, ArrowLeft, Package, EyeOff, MessageCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Product {
  id: string;
  name: string;
  price: string;
  category: string;
  stock: number;
  images: string[];
  isActive: boolean;
  sellerId: string;
  storeName?: string;
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
    queryKey: ["/api/products"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Use debounced search query for filtering
  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    );
  }, [products, debouncedSearchQuery]);

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
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

          <div className="mb-6">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
              {filteredProducts.map((product) => (
                <Card
                  key={product.id}
                  className="overflow-hidden border-border/70 shadow-sm hover:shadow-md hover:border-primary/30 transition-all"
                  data-testid={`card-product-${product.id}`}
                >
                  <div className="relative aspect-[4/3] bg-muted/20">
                    <img
                      src={product.images[0] || "/placeholder.jpg"}
                      alt={product.name}
                      className="h-full w-full object-cover"
                      data-testid={`img-product-${product.id}`}
                    />
                    <div className="absolute top-2 left-2 flex items-center gap-2">
                      <Badge
                        className={product.isActive ? "bg-emerald-600 hover:bg-emerald-600" : ""}
                        variant={product.isActive ? "default" : "secondary"}
                        data-testid={`badge-status-${product.id}`}
                      >
                        {product.isActive ? "Active" : "Deactivated"}
                      </Badge>
                    </div>
                  </div>

                  <div className="p-4 space-y-3">
                    <div>
                      <h3
                        className="font-semibold text-base leading-snug line-clamp-2 min-h-[2.5rem]"
                        data-testid={`text-product-name-${product.id}`}
                      >
                        {product.name}
                      </h3>
                      <p className="text-primary font-bold mt-1" data-testid={`text-price-${product.id}`}>
                        {formatPrice(parseFloat(product.price))}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" data-testid={`badge-category-${product.id}`}>
                        {product.category}
                      </Badge>
                      {product.storeName && (
                        <Badge variant="secondary" data-testid={`badge-seller-${product.id}`}>
                          {product.storeName}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-2">
                      <span data-testid={`text-stock-${product.id}`}>Stock: {product.stock}</span>
                      {!product.isActive && (
                        <span className="text-amber-500 font-medium" data-testid={`text-hidden-label-${product.id}`}>
                          Hidden by Super Admin
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-end gap-1 border-t pt-2">
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
