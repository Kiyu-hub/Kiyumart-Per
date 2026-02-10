import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search, Filter, ShoppingBag, Loader2 } from "lucide-react";
import MarketplaceBannerCarousel from "@/components/MarketplaceBannerCarousel";
import { useDebounce } from "@/hooks/useDebounce";
import type { Product } from "@shared/schema";

export default function AllProducts() {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // Initialize search query from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.split('?')[1] || '');
    const searchParam = urlParams.get('search');
    if (searchParam) {
      setSearchQuery(searchParam);
    }
  }, [location]);
  
  // Debounce search query to avoid excessive filtering - Reduced for more instant feel
  const debouncedSearchQuery = useDebounce(searchQuery, 150);
  
  // Show loading state while debouncing
  const isSearching = searchQuery !== debouncedSearchQuery;

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  // Platform settings to detect single-store mode and primary store behavior
  const { data: platformSettings } = useQuery<{ isMultiVendor?: boolean; primaryStoreId?: string } | null>({
    queryKey: ["/api/platform-settings"],
  });

  const isSingleStoreMode = platformSettings?.isMultiVendor !== true;
  const isProduction = (import.meta.env.MODE === 'production');

  // When in production and single-store mode and primary store has no products, don't fallback — show Coming Soon instead
  const showComingSoon = isProduction && isSingleStoreMode && platformSettings?.primaryStoreId && products.length === 0;

  const { data: categories = [] } = useQuery<any[]>({
    queryKey: ["/api/categories", "active"],
    queryFn: async () => {
      const res = await fetch("/api/categories?isActive=true");
      return res.json();
    },
  });

  // Fetch featured products as a safe fallback when the main product list is empty
  const { data: featuredProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/homepage/featured-products"],
    queryFn: async () => {
      const res = await fetch("/api/homepage/featured-products");
      return res.json();
    },
    // Only fetch featured products if main product list is empty (avoid unnecessary requests)
    enabled: products.length === 0,
    // Keep the result short-lived for interactive pages
    staleTime: 1000 * 60,
  });

  // Use debounced search query for filtering
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (product.category?.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ?? false);
      const matchesCategory = !selectedCategory || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, debouncedSearchQuery, selectedCategory]);

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900">
      <Header />

      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 py-6 space-y-8">
          <div className="flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-primary" />
                <h1 className="text-3xl font-bold text-foreground dark:text-white" data-testid="heading-all-products">
                  All Products
                </h1>
              </div>
              <Badge variant="outline" className="text-sm" data-testid="badge-product-count">
                {filteredProducts.length} {filteredProducts.length === 1 ? "Product" : "Products"}
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                {isSearching ? (
                  <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 animate-spin" />
                ) : (
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                )}
                <Input
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
                {isSearching && (
                  <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                    Searching...
                  </span>
                )}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-2">
                <Button
                  variant={selectedCategory === null ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedCategory(null)}
                  data-testid="button-category-all"
                >
                  All
                </Button>
                {categories.map((category: any) => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.slug ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.slug)}
                    data-testid={`button-category-${category.slug}`}
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="aspect-square rounded-lg" data-testid={`skeleton-product-${i}`} />
              ))}
            </div>
          ) : isSearching ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : showComingSoon ? (
            <div className="space-y-6">
              <div className="mb-6">
                <MarketplaceBannerCarousel autoplayEnabled={false} />
              </div>
              <div className="text-center py-16 text-muted-foreground" data-testid="coming-soon-products">
                <ShoppingBag className="w-20 h-20 mx-auto mb-4 opacity-50" />
                <h2 className="text-2xl font-bold">Coming Soon</h2>
                <p className="text-sm">This store is being prepared. Check back soon for fresh products!</p>
              </div>
            </div>
          ) : filteredProducts.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-testid="grid-products">
              {filteredProducts.map((product) => (
                <ProductCard
                  key={product.id}
                  id={product.id}
                  name={product.name}
                  price={product.price}
                  costPrice={product.costPrice || undefined}
                  image={product.images[0] || ""}
                  discount={product.discount || 0}
                  rating={product.ratings || "0"}
                  reviewCount={product.totalRatings || 0}
                  inStock={(product.stock || 0) > 0}
                />
              ))}
            </div>
          ) : featuredProducts && featuredProducts.length > 0 ? (
            <div>
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-lg font-medium">No products match your search/filters. Showing featured products instead.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4" data-testid="grid-featured-products">
                {featuredProducts.map((product: any) => (
                  <ProductCard
                    key={product.id}
                    id={product.id}
                    name={product.name}
                    price={product.price}
                    costPrice={product.costPrice || undefined}
                    image={(product.images && product.images[0]) || product.image || ""}
                    discount={product.discount || 0}
                    rating={product.ratings || "0"}
                    reviewCount={product.totalRatings || 0}
                    inStock={(product.stock || 0) > 0}
                  />
                ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground" data-testid="empty-products">
              <ShoppingBag className="w-20 h-20 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">No products found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
