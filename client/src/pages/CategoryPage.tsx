import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { fetchSameOriginJson } from "@/lib/queryClient";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { formatCategoryLabel, productMatchesCategory } from "@/lib/categoryUtils";

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string;
  images: string[];
  discount: number;
  ratings: string;
  totalRatings: number;
  category?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  stock?: number;
}

interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  image?: string | null;
}

export default function CategoryPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { currencySymbol, t } = useLanguage();
  const { isAuthenticated, ensureAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "active", "category-page"],
    queryFn: async () =>
      fetchSameOriginJson<Product[]>("/api/products?isActive=true", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: category } = useQuery<CategoryRecord | null>({
    queryKey: ["/api/categories/by-slug", id],
    queryFn: async () => {
      if (!id) return null;
      const res = await fetch(`/api/categories/by-slug/${id}`, {
        credentials: "include",
      });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!id,
  });

  const { data: wishlistItems = [] } = useQuery<{ productId: string }[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated,
    queryFn: async () =>
      fetchSameOriginJson<{ productId: string }[]>("/api/wishlist", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const addToWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      return fetchSameOriginJson("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Added to wishlist" });
    },
    onError: (error: any) => {
      const message = String(error?.message || "").trim();
      toast({
        title: "Error",
        description: /401|authentication|login/i.test(message)
          ? "Please login to use wishlist"
          : message || "Could not add to wishlist",
        variant: "destructive",
      });
    },
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      return fetchSameOriginJson(`/api/wishlist/${productId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Removed from wishlist" });
    },
    onError: (error: any) => {
      const message = String(error?.message || "").trim();
      toast({
        title: "Error",
        description: /401|authentication|login/i.test(message)
          ? "Please login to use wishlist"
          : message || "Could not remove from wishlist",
        variant: "destructive",
      });
    },
  });

  const handleToggleWishlist = async (productId: string) => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      navigate("/auth");
      return;
    }
    const isInWishlist = wishlistItems.some((item) => item.productId === productId);
    if (isInWishlist) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  const categoryProducts = products.filter((product) =>
    productMatchesCategory(product, { slug: id }),
  );
  const categoryTitle = category?.name || formatCategoryLabel(id) || "Category";
  const categoryDescription = category?.description || "Browse our collection";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        onSearch={(query) => navigate(`/products?search=${encodeURIComponent(query)}`)}
        onCartClick={() => navigate(isAuthenticated ? "/cart" : "/auth")}
        data-testid="header-category"
      />

      <main className="flex-1">
        <div className="bg-muted py-12 mb-8">
          <div className="max-w-[1800px] mx-auto px-4">
            <div className="grid gap-6 md:grid-cols-[180px_minmax(0,1fr)] md:items-center">
              {category?.image ? (
                <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
                  <img
                    src={category.image}
                    alt={categoryTitle}
                    className="aspect-[4/3] h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div>
                <h1
                  className="text-4xl font-bold mb-2"
                  data-testid="text-category-title"
                >
                  {categoryTitle}
                </h1>
                <p
                  className="text-lg text-muted-foreground"
                  data-testid="text-category-description"
                >
                  {categoryDescription}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {categoryProducts.length} products
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-[1800px] mx-auto px-4 pb-12">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-6">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-[3/4] w-full" />
                  <div className="p-4 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                </Card>
              ))}
            </div>
          ) : categoryProducts.length === 0 ? (
            <div className="text-center py-16">
              <h3 className="text-xl font-semibold mb-2">
                No products found in this category
              </h3>
              <p className="text-muted-foreground">
                Check back soon for new arrivals!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-6">
              {categoryProducts.map((product) => {
                const sellingPrice = parseFloat(product.price);
                const originalPrice = product.costPrice
                  ? parseFloat(product.costPrice)
                  : null;
                const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                  ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                  : 0;

                return (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    price={sellingPrice}
                    costPrice={originalPrice || undefined}
                    currency={currencySymbol}
                    image={product.images[0]}
                    discount={calculatedDiscount}
                    rating={parseFloat(product.ratings) || 0}
                    reviewCount={product.totalRatings}
                    inStock={(product.stock || 0) > 0}
                    isWishlisted={wishlistItems.some((item) => item.productId === product.id)}
                    onToggleWishlist={handleToggleWishlist}
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
