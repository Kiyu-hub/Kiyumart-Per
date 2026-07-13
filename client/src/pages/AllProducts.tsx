import { useState, useMemo, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
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
import { getProductCategoryLabel, productMatchesCategory } from "@/lib/categoryUtils";
import { excludeFoodVendorProducts, getFoodStoreIdSet } from "@/lib/foodVendors";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCurrentSellingPrice, getOriginalDisplayPrice } from "@/lib/pricing";
import type { Product } from "@shared/schema";

type ProductWithCategoryMeta = Product & {
  categoryName?: string | null;
  categoryId?: string | null;
};

export default function AllProducts() {
  const [location, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { isMobile } = useMobileDevice();
  const { formatPrice } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const { data: wishlist = [] } = useQuery<Array<{ id: string; productId: string }>>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated && !authLoading,
    queryFn: () => fetch("/api/wishlist", { credentials: "include", cache: "no-store" }).then(r => r.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const addToWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetch("/api/wishlist", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId }) }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: () => toast({ title: "Error", description: "Could not add to wishlist", variant: "destructive" }),
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetch(`/api/wishlist/${productId}`, { method: "DELETE", credentials: "include" }).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
    onError: () => toast({ title: "Error", description: "Could not remove from wishlist", variant: "destructive" }),
  });

  const handleToggleWishlist = (productId: string) => {
    if (!isAuthenticated) { toast({ title: "Sign in required", description: "Please sign in to use wishlist." }); return; }
    wishlist.some((w) => w.productId === productId)
      ? removeFromWishlistMutation.mutate(productId)
      : addToWishlistMutation.mutate(productId);
  };
  
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

  const { data: products = [], isLoading } = useQuery<ProductWithCategoryMeta[]>({
    queryKey: ["/api/products", "active", "all-products"],
    queryFn: async () => {
      const res = await fetch("/api/products?isActive=true");
      return res.json();
    },
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

  // Stores list — used only to identify which products belong to food vendors
  // so they can be kept out of the generic All Products feed.
  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
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

  // Food vendor products & food-scoped categories live ONLY on the dedicated
  // Restaurants & Local Vendors surface — they must never appear in the generic
  // All Products feed (or its category filter). See lib/foodVendors.ts.
  const foodStoreIds = useMemo(() => getFoodStoreIdSet(stores), [stores]);
  const nonFoodProducts = useMemo(
    () => excludeFoodVendorProducts<ProductWithCategoryMeta>(products, foodStoreIds),
    [products, foodStoreIds],
  );
  // Food must also be excluded from the empty-state featured fallback.
  const nonFoodFeatured = useMemo(
    () => excludeFoodVendorProducts<any>(featuredProducts, foodStoreIds),
    [featuredProducts, foodStoreIds],
  );
  const isFoodScopedCategory = (category: any) =>
    Array.isArray(category?.storeTypes) &&
    category.storeTypes.some((t: string) => t === "food_beverages" || t === "restaurant");

  // Use debounced search query for filtering
  const filteredProducts = useMemo(() => {
    return nonFoodProducts.filter((product) => {
      const categoryLabel = getProductCategoryLabel(product).toLowerCase();
      const matchesSearch =
        product.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        categoryLabel.includes(debouncedSearchQuery.toLowerCase());
      const matchesCategory =
        !selectedCategory ||
        productMatchesCategory(product, { slug: selectedCategory });
      return matchesSearch && matchesCategory;
    });
  }, [nonFoodProducts, debouncedSearchQuery, selectedCategory]);

  const availableCategories = useMemo(() => {
    return categories.filter((category: any) =>
      !isFoodScopedCategory(category) &&
      nonFoodProducts.some((product) => productMatchesCategory(product, category)),
    );
  }, [categories, nonFoodProducts]);

  // ── Parse URL for category/title context ─────────────────
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const categoryParam = urlParams.get("category") || selectedCategory;
  const titleParam = urlParams.get("title") || "";
  const pageTitle = titleParam || (categoryParam
    ? availableCategories.find((c: any) => c.slug === categoryParam)?.name || "Products"
    : "All Products");

  if (isMobile) {
    const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
    const isDarkVal = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
    const bg    = isDarkVal ? "#111111" : "#F2F2F7";
    const card  = isDarkVal ? "#1C1C1E" : "#FFFFFF";
    const hdr   = isDarkVal ? "#111111" : "#FFFFFF";
    const bdr   = isDarkVal ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
    const txt   = isDarkVal ? "#FFFFFF" : "#111111";
    const muted = isDarkVal ? "rgba(235,235,245,0.45)" : "rgba(60,60,67,0.45)";
    const inp   = isDarkVal ? "#2C2C2E" : "#EBEBF0";
    const accent = "#009688";
    const skel   = isDarkVal ? "#2C2C2E" : "#E5E5EA";

    const displayProducts = filteredProducts.length > 0 ? filteredProducts : nonFoodFeatured;

    return (
      <div style={{ minHeight: "100dvh", background: bg, fontFamily: F, paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
        {/* Sticky header */}
        <div style={{
          position: "sticky", top: 0, zIndex: 20, background: hdr,
          borderBottom: `1px solid ${bdr}`,
          paddingLeft: 16, paddingRight: 16, paddingBottom: 10,
          paddingTop: "max(14px, env(safe-area-inset-top, 14px))",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
            <button onClick={() => navigate(-1 as any)} style={{ width: 34, height: 34, borderRadius: 17, background: inp, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
            <span style={{ flex: 1, fontSize: 17, fontWeight: 700, color: txt }}>{pageTitle}</span>
            {displayProducts.length > 0 && (
              <span style={{ fontSize: 12, color: muted, fontWeight: 600 }}>{displayProducts.length}</span>
            )}
          </div>
          {/* Search */}
          <div style={{ position: "relative" }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={2} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products…"
              style={{ width: "100%", height: 36, borderRadius: 10, border: "none", background: inp, paddingLeft: 34, paddingRight: 12, fontSize: 14, color: txt, fontFamily: F, outline: "none", boxSizing: "border-box" }}
            />
          </div>
        </div>

        {/* Category pills */}
        {availableCategories.length > 0 && (
          <div style={{ display: "flex", gap: 8, overflowX: "auto", padding: "10px 12px 2px", scrollbarWidth: "none" }}>
            <button
              onClick={() => setSelectedCategory(null)}
              style={{
                flexShrink: 0, padding: "6px 14px", borderRadius: 20,
                border: `1.5px solid ${!selectedCategory ? accent : bdr}`,
                background: !selectedCategory ? accent : inp,
                color: !selectedCategory ? "#fff" : txt,
                fontSize: 12, fontWeight: !selectedCategory ? 700 : 500, cursor: "pointer",
                fontFamily: F, WebkitTapHighlightColor: "transparent",
              }}
            >All</button>
            {availableCategories.map((cat: any) => {
              const active = selectedCategory === cat.slug;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(active ? null : cat.slug)}
                  style={{
                    flexShrink: 0, padding: "6px 14px", borderRadius: 20,
                    border: `1.5px solid ${active ? accent : bdr}`,
                    background: active ? accent : inp,
                    color: active ? "#fff" : txt,
                    fontSize: 12, fontWeight: active ? 700 : 500, cursor: "pointer",
                    fontFamily: F, WebkitTapHighlightColor: "transparent",
                  }}
                >{cat.name}</button>
              );
            })}
          </div>
        )}

        {/* Product grid */}
        <div style={{ padding: "10px 12px 0" }}>
          {isLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ background: card, borderRadius: 14, overflow: "hidden", border: `1px solid ${bdr}` }}>
                  <div style={{ aspectRatio: "5/4", background: skel }} />
                  <div style={{ padding: "10px 10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ width: "75%", height: 11, borderRadius: 4, background: skel }} />
                    <div style={{ width: "45%", height: 9, borderRadius: 4, background: skel }} />
                  </div>
                </div>
              ))}
            </div>
          ) : displayProducts.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px", color: muted }}>
              <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} style={{ margin: "0 auto 12px" }}><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
              <p style={{ fontSize: 16, fontWeight: 600, color: txt, marginBottom: 4 }}>No products found</p>
              <p style={{ fontSize: 13 }}>Try a different search or category</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {displayProducts.map((product: any) => {
                const sp = getCurrentSellingPrice({ price: product.price, costPrice: product.costPrice ?? null, discount: product.discount ?? null });
                const op = getOriginalDisplayPrice({ price: product.price, costPrice: product.costPrice ?? null, discount: product.discount ?? null });
                const isWishlisted = wishlist.some((w: any) => w.productId === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => navigate(`/product/${product.id}`)}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent" }}
                  >
                    <div style={{ background: card, borderRadius: 14, overflow: "hidden", border: `1px solid ${bdr}` }}>
                      <div style={{ position: "relative", aspectRatio: "5/4", overflow: "hidden", background: inp }}>
                        {product.images?.[0] ? (
                          <img src={product.images[0]} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                          </div>
                        )}
                        {product.discount > 0 && (
                          <div style={{ position: "absolute", top: 6, left: 6, background: "#ef4444", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 5, padding: "2px 5px" }}>-{product.discount}%</div>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); handleToggleWishlist(product.id); }}
                          style={{ position: "absolute", top: 6, right: 6, width: 28, height: 28, borderRadius: 14, background: isDarkVal ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.85)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}
                        >
                          <svg width={14} height={14} viewBox="0 0 24 24" fill={isWishlisted ? "#ef4444" : "none"} stroke={isWishlisted ? "#ef4444" : muted} strokeWidth={2} strokeLinecap="round">
                            <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z" />
                          </svg>
                        </button>
                      </div>
                      <div style={{ padding: "8px 10px 10px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: txt, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any, marginBottom: 4 }}>
                          {product.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                          <span style={{ fontSize: 14, fontWeight: 800, color: accent }}>{formatPrice(sp)}</span>
                          {op && op > sp && (
                            <span style={{ fontSize: 11, color: muted, textDecoration: "line-through" }}>{formatPrice(op)}</span>
                          )}
                        </div>
                        {(product.stock || 0) === 0 && (
                          <div style={{ fontSize: 10, color: "#ef4444", fontWeight: 600, marginTop: 2 }}>Out of stock</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900">
      <Header />

      <main className="flex-1">
        <div className="container max-w-[1400px] mx-auto px-4 py-6 space-y-8">
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
                  className="shrink-0 whitespace-nowrap"
                >
                  All
                </Button>
                {availableCategories.map((category: any) => (
                  <Button
                    key={category.id}
                    variant={selectedCategory === category.slug ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedCategory(category.slug)}
                    data-testid={`button-category-${category.slug}`}
                    className="shrink-0 whitespace-nowrap"
                  >
                    {category.name}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 2xl:grid-cols-6 gap-x-4 gap-y-6" data-testid="grid-products">
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
                  isWishlisted={wishlist.some((w) => w.productId === product.id)}
                  onToggleWishlist={handleToggleWishlist}
                />
              ))}
            </div>
          ) : nonFoodFeatured && nonFoodFeatured.length > 0 ? (
            <div>
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-lg font-medium">No products match your search/filters. Showing featured products instead.</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3" data-testid="grid-featured-products">
                {nonFoodFeatured.map((product: any) => (
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
                    isWishlisted={wishlist.some((w) => w.productId === product.id)}
                    onToggleWishlist={handleToggleWishlist}
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
