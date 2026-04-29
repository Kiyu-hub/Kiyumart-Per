import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { fetchApiJson, fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroCarousel from "@/components/HeroCarousel";
import ThemeToggle from "@/components/ThemeToggle";
import StoreCard from "@/components/StoreCard";
import CategoryCard from "@/components/CategoryCard";
import ProductCard from "@/components/ProductCard";
import PromotionalAdsGrid from "@/components/PromotionalAdsGrid";
import AdBanner from "@/components/AdBanner";
import SinglePromotionSidebar from "@/components/SinglePromotionSidebar";
import PromotionalAd from "@/components/PromotionalAd";
import LocationPrompt from "@/components/LocationPrompt";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getProductCategoryLabel, productMatchesCategory } from "@/lib/categoryUtils";
import { ShoppingBag, Tag, ChevronRight } from "lucide-react";
import type { Product, PlatformSettings } from "@shared/schema";

type ProductWithCategoryMeta = Product & {
  categoryName?: string | null;
  categoryId?: string | null;
};

interface Category {
  id: string;
  name: string;
  slug: string;
  image: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  requestedBySeller?: boolean;
}

interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
}

export default function MultiVendorHome() {
  const { user, isAuthenticated, isLoading: authLoading, ensureAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
  });

  const { data: stores = [], isLoading: storesLoading } = useQuery<Array<{
    id: string;
    name: string;
    logo?: string;
    banner?: string;
    isActive: boolean;
    isApproved: boolean;
  }>>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores?isActive=true&isApproved=true");
      return res.json();
    },
  });

  const { data: featuredProducts = [], isLoading: productsLoading } = useQuery<ProductWithCategoryMeta[]>({
    queryKey: ["/api/homepage/featured-products"],
  });

  const { data: newArrivalProducts = [], isLoading: newArrivalsLoading } = useQuery<ProductWithCategoryMeta[]>({
    queryKey: ["/api/homepage/new-arrivals"],
  });

  const { data: allProducts = [] } = useQuery<ProductWithCategoryMeta[]>({
    queryKey: ["/api/products", "active", "multi-vendor-home"],
    queryFn: async () => {
      return fetchApiJson<ProductWithCategoryMeta[]>("/api/products?isActive=true");
    },
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories", "active"],
    queryFn: async () => {
      return fetchApiJson<Category[]>("/api/categories?isActive=true");
    },
  });

  // Fetch active promotions
  const { data: promos = [] } = useQuery<any[]>({
    queryKey: ['/api/homepage/promotional'],
    queryFn: async () => {
      return fetchApiJson<any[]>("/api/homepage/promotional");
    },
    refetchInterval: 5000,
  });

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated && !authLoading,
    queryFn: () => fetchSameOriginJson<WishlistItem[]>("/api/wishlist", { cache: "no-store" }),
    refetchOnMount: "always",
  });

  const addToWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchSameOriginJson("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Added to wishlist", description: "Product has been added to your wishlist" });
    },
    onError: (error: any) => {
      const message = error?.message || "";
      toast({
        title: "Error",
        description: /401|authentication|login/i.test(message) ? "Please login to use wishlist" : message || "Could not add to wishlist",
        variant: "destructive",
      });
    },
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (productId: string) =>
      fetchSameOriginJson(`/api/wishlist/${productId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Removed from wishlist", description: "Product has been removed from your wishlist" });
    },
    onError: (error: any) => {
      const message = error?.message || "";
      toast({
        title: "Error",
        description: /401|authentication|login/i.test(message) ? "Please login to use wishlist" : message || "Could not remove from wishlist",
        variant: "destructive",
      });
    },
  });

  const handleToggleWishlist = async (productId: string) => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) { navigate("/auth"); return; }
    const isWishlisted = wishlist.some(item => item.productId === productId);
    if (isWishlisted) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  const getCategoryProductCount = (category: Category) =>
    allProducts.filter((product) => productMatchesCategory(product, category)).length;
  const categoriesWithProducts = categories.filter(
    (category) => getCategoryProductCount(category) > 0 || Boolean(category.requestedBySeller),
  );
  
  const isAdmin = user?.role === "admin";
  const shopDisplayMode = (settings as any)?.shopDisplayMode || "by-store";
  const adsEnabled = (settings as any)?.adsEnabled ?? false;
  const heroBannerEnabled = (settings as any)?.heroBannerEnabled ?? false;
  const sidebarAdEnabled = (settings as any)?.sidebarAdEnabled ?? false;
  const footerAdEnabled = (settings as any)?.footerAdEnabled ?? false;
  const showHomepageFeaturedSection = (settings as any)?.showHomepageFeaturedSection !== false;
  const showHomepageNewArrivalSection = (settings as any)?.showHomepageNewArrivalSection !== false;

  const hasMultiplePromotions = promos && promos.length > 1;
  const hasExactlyOnePromotion = promos && promos.length === 1;
  const singlePromotion = hasExactlyOnePromotion ? promos[0] : null;

  // Sidebar content stacking: both promo + ad can coexist
  const hasSidebarAd = adsEnabled && sidebarAdEnabled;
  const sidebarItemCount = (hasExactlyOnePromotion ? 1 : 0) + (hasSidebarAd ? 1 : 0);

  // Products to auto-fill empty promo/ad areas - show most popular (highest rated) products as trending
  const sidebarProducts = allProducts
    .sort((a, b) => (b.totalRatings || 0) - (a.totalRatings || 0))
    .slice(0, 4);
  const spotlightProducts = allProducts.filter(p => (p.totalRatings || 0) > 10).slice(0, 3);

  // Sidebar is visible when it has promo or ad to show
  const hasSidebarContent = sidebarItemCount > 0;

  // --- Search — redirects to dedicated /search page automatically while typing ---
  const [searchQuery, setSearchQuery] = useState("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearch = useCallback((query: string) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    const trimmed = query.trim();
    if (!trimmed) { setSearchQuery(""); return; }
    debounceTimerRef.current = setTimeout(() => {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`);
    }, 300);
  }, [navigate]);

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const matchesProductSearch = (product: ProductWithCategoryMeta) => {
    const categoryLabel = getProductCategoryLabel(product).toLowerCase();
    return (product.name || "").toLowerCase().includes(searchQuery) || categoryLabel.includes(searchQuery);
  };

  // Filtered product lists for live-search parity with single-store
  const filteredFeaturedProducts = (
    searchQuery
      ? (featuredProducts || []).filter(matchesProductSearch)
      : (featuredProducts || [])
  ).slice(0, 5);

  const filteredNewArrivalProducts = (
    searchQuery
      ? (newArrivalProducts || []).filter(matchesProductSearch)
      : (newArrivalProducts || [])
  ).slice(0, 5);

  const filteredAllProducts = searchQuery
    ? (allProducts || []).filter(matchesProductSearch)
    : (allProducts || []);

  const [showAllCategories, setShowAllCategories] = useState(false);
  const CATEGORY_VISIBLE_THRESHOLD = 6;

  return (
    <div className="mv-home min-h-screen flex flex-col relative">
      {/* Animated gradient background — contained to prevent horizontal overflow */}
      <div className="overflow-hidden absolute inset-0 pointer-events-none">
        <div className="mv-bg-gradient" />
        <div className="mv-bg-orb mv-bg-orb-1" />
        <div className="mv-bg-orb mv-bg-orb-2" />
        <div className="mv-bg-orb mv-bg-orb-3" />
      </div>

      {/* Top bar with theme toggle */}
      <div className="relative z-20 flex items-center justify-end px-4 py-2 border-b border-gray-200 dark:border-white/10 backdrop-blur-md bg-white/80 dark:bg-white/5">
        <ThemeToggle />
      </div>
      
      <div className="relative z-10">
        <Header onSearch={handleSearch} />
      </div>
      
      {/* Full-width Hero Carousel */}
      <div className="relative z-10">
        <HeroCarousel />
      </div>
      
      <main className="flex-1 relative z-10">
        <div className="container max-w-7xl mx-auto px-4 py-8 space-y-12">

          {/* Hero Ad — or product spotlight when no ads */}
          {adsEnabled && heroBannerEnabled ? (
            <div className="w-full">
              <AdBanner position="hero" className="h-16 md:h-20 rounded-xl" />
            </div>
          ) : spotlightProducts.length > 0 && false ? ( // Hidden by default - only show when products have >10 purchases
            <section className="mv-glass-card rounded-2xl p-4 md:p-6">
              <div className="flex items-center gap-2 mb-4">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Hot Deals</h3>
              </div>
              <div className="category-grid">
                {spotlightProducts.map(product => (
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
                    isWishlisted={wishlist.some(w => w.productId === product.id)}
                    onToggleWishlist={handleToggleWishlist}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {/* Shop by Store/Category Section */}
          {(settings as any)?.showShopBySection !== false && (
          <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h2 
                  className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white"
                  data-testid="heading-categories"
                >
                  {shopDisplayMode === "by-category" ? "Shop by Categories" : "Shop by Store"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Badge className="mv-badge text-sm" data-testid="badge-store-count">
                    {shopDisplayMode === "by-store" 
                      ? `${stores.length} ${stores.length === 1 ? "Store" : "Stores"}`
                      : `${categoriesWithProducts.length} ${categoriesWithProducts.length === 1 ? "Category" : "Categories"}`
                    }
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  className="gap-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-blue-200 dark:hover:text-white dark:hover:bg-white/10"
                  onClick={() => {
                    if (shopDisplayMode === "by-category") {
                      navigate("/products");
                    } else {
                      navigate("/stores");
                    }
                  }}
                  data-testid="button-see-all-categories"
                >
                  See All
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {shopDisplayMode === "by-category" ? (
              categoriesLoading ? (
                <div className="category-grid">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3] rounded-xl bg-gray-200 dark:bg-white/10" data-testid={`skeleton-category-${i}`} />
                  ))}
                </div>
              ) : categoriesWithProducts.length > 0 ? (
                <div className={showAllCategories ? "category-grid-expanded" : "category-grid"} data-testid="grid-categories">
                  {categoriesWithProducts.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      name={category.name}
                      image={category.image}
                      slug={category.slug}
                      productCount={getCategoryProductCount(category)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 dark:text-blue-200/70" data-testid="empty-categories">
                  <p className="text-lg mb-2">No product categories are available at the moment</p>
                  <p className="text-sm">Please check back later or contact the administrator to add categories!</p>
                </div>
              )
            ) : (
              storesLoading ? (
                <div className="category-grid">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3] rounded-xl bg-gray-200 dark:bg-white/10" data-testid={`skeleton-store-${i}`} />
                  ))}
                </div>
              ) : stores.length > 0 ? (
                <div className="category-grid" data-testid="grid-stores">
                  {stores.map((store) => (
                    <StoreCard
                      key={store.id}
                      id={store.id}
                      name={store.name}
                      logo={store.logo}
                      banner={store.banner}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 dark:text-blue-200/70" data-testid="empty-stores">
                  <p className="text-lg mb-2">No stores available at the moment</p>
                  <p className="text-sm">Please check back later or contact support!</p>
                </div>
              )
            )}
          </section>
          )}

          {/* Featured Promotions — below shop by category/store */}
          {hasMultiplePromotions && <PromotionalAdsGrid />}

          {/* Mobile promo (single promotion) */}
          {hasExactlyOnePromotion && (
            <div className="lg:hidden">
              <PromotionalAd />
            </div>
          )}

          {/* Products and Sidebar row */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Sidebar — conditionally visible: promo > ad > trending products */}
            {hasSidebarContent && (
              <aside className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 flex flex-col gap-4" style={{ height: 'calc(100vh - 6rem)' }}>
                  {/* Dynamic sidebar stacking: promo + ad share space via flexbox */}
                  {sidebarItemCount > 0 ? (
                    <>
                    {/* Promotion — fills available height, splits evenly when stacked */}
                    {hasExactlyOnePromotion && singlePromotion && (
                      <div
                        className="overflow-hidden rounded-xl"
                        style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
                      >
                        <SinglePromotionSidebar promo={singlePromotion} />
                      </div>
                    )}
                    {/* Advertisement — fills available height, splits evenly when stacked */}
                    {hasSidebarAd && (
                      <div
                        className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10"
                        style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
                      >
                        <AdBanner position="sidebar" className="w-full h-full rounded-none border-0 flex-1" />
                      </div>
                    )}
                  </>
                ) : null}
                </div>
              </aside>
            )}

            {/* Products column — expand to full width when no sidebar */}
            <div className={hasSidebarContent ? 'lg:col-span-8' : 'lg:col-span-12'}>
              {/* Featured Products */}
              {showHomepageFeaturedSection && (productsLoading || filteredFeaturedProducts.length > 0 || Boolean(searchQuery)) && (
              <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6 mb-8">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white" data-testid="heading-featured">
                    {searchQuery ? `Search results (${filteredAllProducts.length})` : 'Featured Products'}
                  </h2>
                </div>

                {productsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-6">
                    {[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-xl bg-gray-200 dark:bg-white/10" data-testid={`skeleton-product-${i}`} />
                    ))}
                  </div>
                ) : filteredFeaturedProducts.length > 0 ? (
                  <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${hasSidebarContent ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`} data-testid="grid-featured-products">
                    {filteredFeaturedProducts.map((product) => (
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
                        isWishlisted={wishlist.some(w => w.productId === product.id)}
                        onToggleWishlist={handleToggleWishlist}
                      />
                    ))}
                  </div>
                ) : searchQuery ? (
                  <div className="text-center py-12 text-muted-foreground">No products found matching "{searchQuery}"</div>
                ) : (
                  <div className="text-center py-12 text-gray-400 dark:text-blue-200/70" data-testid="empty-products">
                    <p>No products available yet</p>
                  </div>
                )}
              </section>
              )}

              {showHomepageNewArrivalSection && filteredNewArrivalProducts.length > 0 && (
                <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6 mb-8">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                      New Arrivals
                    </h2>
                  </div>

                  {newArrivalsLoading ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 gap-y-6">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="aspect-square rounded-xl bg-gray-200 dark:bg-white/10" />
                      ))}
                    </div>
                  ) : (
                    <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${hasSidebarContent ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                      {filteredNewArrivalProducts.map((product) => (
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
                          isWishlisted={wishlist.some(w => w.productId === product.id)}
                          onToggleWishlist={handleToggleWishlist}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* All Products */}
              {filteredAllProducts.length > 0 && (
              <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white" data-testid="heading-all-products">
                      {searchQuery ? `Search results (${filteredAllProducts.length})` : 'All Products'}
                    </h2>
                  </div>
                  <span className="text-sm text-gray-500 dark:text-blue-200/70">{filteredAllProducts.length} products</span>
                </div>

                <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${hasSidebarContent ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`} data-testid="grid-all-products">
                  {filteredAllProducts.map((product) => (
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
                      isWishlisted={wishlist.some(w => w.productId === product.id)}
                      onToggleWishlist={handleToggleWishlist}
                    />
                  ))}
                </div>
              </section>
              )}
            </div>
          </div>

          {/* Footer Ad — or more products when ads are disabled */}
          {adsEnabled && footerAdEnabled ? (
            <div className="w-full">
              <AdBanner position="footer" className="h-24 md:h-32 rounded-xl" />
            </div>
          ) : allProducts.length > 10 ? (
            <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">
                  You Might Also Like
                </h2>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 gap-y-6">
                {allProducts.slice(10, 20).map(product => (
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
                    isWishlisted={wishlist.some(w => w.productId === product.id)}
                    onToggleWishlist={handleToggleWishlist}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>

      <LocationPrompt />

      <style>{`
        /* Light Mode (Clean Professional) */
        .mv-home {
          background: #f8fafc;
          color: #1e293b;
        }

        .mv-bg-gradient {
          position: fixed;
          inset: 0;
          background: linear-gradient(135deg, #ffffff 0%, #f0f4ff 25%, #eef2ff 50%, #f5f3ff 75%, #f8fafc 100%);
          z-index: 0;
        }

        .mv-bg-orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(120px);
          opacity: 0.06;
          z-index: 1;
          animation: mv-float 25s ease-in-out infinite;
        }

        .mv-bg-orb-1 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #93c5fd 0%, transparent 70%);
          top: -200px;
          right: -100px;
          animation-delay: 0s;
        }

        .mv-bg-orb-2 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, #c4b5fd 0%, transparent 70%);
          bottom: 10%;
          left: -150px;
          animation-delay: -8s;
        }

        .mv-bg-orb-3 {
          width: 350px;
          height: 350px;
          background: radial-gradient(circle, #7dd3fc 0%, transparent 70%);
          top: 50%;
          right: 20%;
          animation-delay: -16s;
        }

        @keyframes mv-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }

        .mv-glass-card {
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(0, 0, 0, 0.08);
        }

        .mv-glass-card:hover {
          border-color: rgba(0, 0, 0, 0.12);
          background: rgba(255, 255, 255, 0.85);
        }

        .mv-icon-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
        }

        .mv-icon-badge-amber {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
        }

        .mv-icon-badge-purple {
          background: linear-gradient(135deg, #7c3aed, #6d28d9);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }

        .mv-badge {
          background: rgba(59, 130, 246, 0.1);
          border: 1px solid rgba(59, 130, 246, 0.2);
          color: #3b82f6;
          backdrop-filter: blur(8px);
        }

        .category-grid {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(99, 102, 241, 0.3) transparent;
          padding-bottom: 8px;
        }

        .category-grid::-webkit-scrollbar { height: 6px; }
        .category-grid::-webkit-scrollbar-track { background: transparent; }
        .category-grid::-webkit-scrollbar-thumb { background-color: rgba(99, 102, 241, 0.3); border-radius: 3px; }
        .category-grid::-webkit-scrollbar-thumb:hover { background-color: rgba(99, 102, 241, 0.5); }

        .category-grid > * {
          flex: 0 0 auto;
          width: 185px;
        }

        .category-grid-expanded {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(185px, 1fr));
          gap: 16px;
          padding-bottom: 8px;
        }

        @media (min-width: 640px) {
          .category-grid > * { width: 220px; }
          .category-grid-expanded { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
        }

        @media (min-width: 1024px) {
          .category-grid > * { width: 245px; }
          .category-grid-expanded { grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); }
        }

        /* Dark Mode Override */
        .dark .mv-home {
          background: #020305;
          color: #e0e7ff;
        }

        .dark .mv-bg-gradient {
          background: linear-gradient(135deg, #010203 0%, #020408 20%, #030610 40%, #040816 60%, #020408 80%, #010102 100%);
        }

        .dark .mv-bg-orb { opacity: 0.07; }

        .dark .mv-bg-orb-1 {
          background: radial-gradient(circle, #1e3a8a 0%, transparent 70%);
        }

        .dark .mv-bg-orb-2 {
          background: radial-gradient(circle, #4c1d95 0%, transparent 70%);
        }

        .dark .mv-bg-orb-3 {
          background: radial-gradient(circle, #0c4a6e 0%, transparent 70%);
        }

        .dark .mv-glass-card {
          background: rgba(255, 255, 255, 0.025);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.04);
        }

        .dark .mv-glass-card:hover {
          border-color: rgba(255, 255, 255, 0.07);
          background: rgba(255, 255, 255, 0.04);
        }

        .dark .mv-badge {
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.12);
          color: #c7d2fe;
        }

        .dark .category-grid {
          scrollbar-color: rgba(99, 102, 241, 0.4) transparent;
        }
        .dark .category-grid::-webkit-scrollbar-thumb { background-color: rgba(99, 102, 241, 0.4); }
        .dark .category-grid::-webkit-scrollbar-thumb:hover { background-color: rgba(99, 102, 241, 0.7); }
      `}</style>
    </div>
  );
}
