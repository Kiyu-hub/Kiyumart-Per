import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useMobileDevice } from "@/hooks/useMobileDevice";

const MobileHomeComp = lazy(() =>
  import("@/pages/mobile/MobileHome").then(m => ({ default: m.MobileHome }))
);
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import HeroCarousel from "@/components/HeroCarousel";
import CategoryCard from "@/components/CategoryCard";
import StoreCard from "@/components/StoreCard";
import ProductCard from "@/components/ProductCard";
import Footer from "@/components/Footer";
import CartSidebar from "@/components/CartSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import AdBanner from "@/components/AdBanner";
import PromotionalAd from "@/components/PromotionalAd";
import PromotionalAdsGrid from "@/components/PromotionalAdsGrid";
import SinglePromotionSidebar from "@/components/SinglePromotionSidebar";
import LocationPrompt from "@/components/LocationPrompt";
import { Button } from '@/components/ui/button';
import { getProductCategoryLabel, productMatchesCategory } from "@/lib/categoryUtils";
import {
  excludeFoodVendorProducts,
  getFoodStoreIdSet,
  getLocalVendors,
  getRestaurants,
  splitProductsByFoodStores,
} from "@/lib/foodVendors";
import type { PlatformSettings } from "@shared/schema";
import { ChevronDown, ChevronUp, ChevronRight, Loader2, UtensilsCrossed } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import heroImage from "@assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png";

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
  storeId?: string;
  dynamicFields?: Record<string, any>;
}

interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  variantId: string | null;
  selectedColor: string | null;
  selectedSize: string | null;
  selectedImageIndex: number | null;
  createdAt: string;
}

interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

export default function HomeConnected() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading, ensureAuthenticated } = useAuth();
  const { toast } = useToast();
  const { currency, currencySymbol, t } = useLanguage();
  const { isMobile, isTablet } = useMobileDevice();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllFeaturedProducts, setShowAllFeaturedProducts] = useState(false);

  const { data: platformSettings, isLoading: settingsLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
    queryFn: async () => fetchSameOriginJson<PlatformSettings>("/api/platform-settings"),
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  // Defensive flags to avoid runtime errors when settings are undefined during hydration/HMR
  const adsEnabled = platformSettings?.adsEnabled ?? false;
  const heroBannerEnabled = platformSettings?.heroBannerEnabled ?? false;
  const sidebarAdEnabled = platformSettings?.sidebarAdEnabled ?? false;
  const footerAdEnabled = platformSettings?.footerAdEnabled ?? false;
  const productPageAdEnabled = platformSettings?.productPageAdEnabled ?? false;
  const showHomepageFeaturedSection = platformSettings?.showHomepageFeaturedSection !== false;
  const showHomepageNewArrivalSection = platformSettings?.showHomepageNewArrivalSection !== false;

  // Query promotions to determine sidebar display logic
  const { data: allPromotions = [] } = useQuery<any[]>({
    queryKey: ["/api/homepage/promotional", "homepage"],
    queryFn: async () => fetchSameOriginJson<any[]>("/api/homepage/promotional?section=homepage"),
    refetchInterval: 5000,
  });

  // Determine sidebar display logic based on promotion count
  const hasExactlyOnePromotion = allPromotions.length === 1;
  const hasMultiplePromotions = allPromotions.length > 1;
  const singlePromotion = hasExactlyOnePromotion ? allPromotions[0] : null;

  // Sidebar content stacking: both promo + ad can coexist (matching MultiVendorHome)
  const hasSidebarAd = adsEnabled && sidebarAdEnabled;
  const sidebarItemCount = (hasExactlyOnePromotion ? 1 : 0) + (hasSidebarAd ? 1 : 0);

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", "active", "home"],
    queryFn: async () => fetchSameOriginJson<Product[]>("/api/products?isActive=true"),
  });
  const { data: featuredProducts = [], isLoading: featuredProductsLoading } = useQuery<Product[]>({
    queryKey: ["/api/homepage/featured-products"],
    queryFn: async () => fetchSameOriginJson<Product[]>("/api/homepage/featured-products"),
  });
  const { data: newArrivalProducts = [], isLoading: newArrivalProductsLoading } = useQuery<Product[]>({
    queryKey: ["/api/homepage/new-arrivals"],
    queryFn: async () => fetchSameOriginJson<Product[]>("/api/homepage/new-arrivals"),
  });

  const { data: dbStores = [] } = useQuery<Array<{
    id: string; 
    name: string; 
    logo?: string; 
    banner?: string; 
    isActive: boolean; 
    isApproved: boolean;
  }>>({
    queryKey: ["/api/stores"],
    queryFn: async () => fetchSameOriginJson("/api/stores?isActive=true&isApproved=true"),
    enabled: platformSettings?.isMultiVendor === true && platformSettings?.shopDisplayMode === "by-store",
  });

  // Products are already filtered server-side by the selected primary store in single-store mode
  // No additional client-side filtering needed — /api/products handles store mode correctly
  const products = allProducts;

  const availableProducts = products;

  const { data: cartItems = [], isLoading: cartLoading } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated && !authLoading,
    queryFn: async () =>
      fetchSameOriginJson<CartItem[]>("/api/cart", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated && !authLoading,
    queryFn: async () =>
      fetchSameOriginJson<WishlistItem[]>("/api/wishlist", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: cartProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/cart/products"],
    queryFn: async () => {
      if (!cartItems.length) return [];
      const productIds = cartItems.map(item => item.productId);
      const productsData = await Promise.all(
        productIds.map(async (id) => {
          return fetchSameOriginJson<Product>(`/api/products/${id}`, {
            cache: "no-store",
          });
        })
      );
      return productsData;
    },
    enabled: cartItems.length > 0,
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => {
      return fetchSameOriginJson("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: "Product has been added to your cart",
      });
    },
    onError: (error: any) => {
      const message = String(error?.message || "").trim();
      if (/401|authentication|login/i.test(message)) {
        queryClient.setQueryData(["/api/auth/me"], null);
        toast({
          title: "Session expired",
          description: "Please log in again to continue shopping.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      toast({
        title: "Error",
        description: message || "Could not add this item to your cart",
        variant: "destructive",
      });
    },
  });

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      return fetchSameOriginJson(`/api/cart/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
    onError: (error: any) => {
      const message = String(error?.message || "").trim();
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Cart update not completed",
        description: /only\s+\d+|out of stock|maximum available quantity/i.test(message)
          ? "That quantity is no longer available. The cart has been refreshed."
          : "Please try again in a moment.",
        variant: "destructive",
      });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetchSameOriginJson(`/api/cart/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Removed from cart",
        description: "Item has been removed from your cart",
      });
    },
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
      toast({
        title: "Added to wishlist",
        description: "Product has been added to your wishlist",
      });
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
      await fetchSameOriginJson(`/api/wishlist/${productId}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({
        title: "Removed from wishlist",
        description: "Product has been removed from your wishlist",
      });
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

  const bannerSlides = [
    {
      image: heroImage,
      title: t("newSeasonCollection"),
      description: t("discoverLatest"),
      cta: t("shopNow")
    },
    {
      image: heroImage,
      title: t("upTo50Off"),
      description: t("limitedOffer"),
      cta: t("viewDeals")
    }
  ];

  const { data: dbCategories = [] } = useQuery<Array<{id: string; name: string; slug: string; image: string; isActive: boolean; storeTypes: string[] | null; requestedBySeller?: boolean}>>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const data = await fetchSameOriginJson<Array<{id: string; name: string; slug: string; image: string; isActive: boolean; storeTypes: string[] | null; requestedBySeller?: boolean}>>("/api/categories?isActive=true");
      return Array.isArray(data) ? data : [];
    },
  });

  // Fetch primary store details in single-vendor mode
  const { data: primaryStore } = useQuery<{storeType: string} | null>({
    queryKey: ["/api/stores", platformSettings?.primaryStoreId],
    queryFn: async () => {
      if (!platformSettings?.primaryStoreId) return null;
      try {
        return await fetchSameOriginJson<{storeType: string}>(`/api/stores/${platformSettings.primaryStoreId}`);
      } catch {
        return null;
      }
    },
    enabled: !platformSettings?.isMultiVendor && !!platformSettings?.primaryStoreId,
  });

  // Filter categories by store type in single-vendor mode
  const safeCategories = Array.isArray(dbCategories) ? dbCategories : [];
  const filteredCategories = !platformSettings?.isMultiVendor 
    ? safeCategories.filter(cat => {
        // Default to "clothing" for Islamic fashion platform if no primary store configured
        const storeType = primaryStore?.storeType || "clothing";
        // Show global categories (null or empty storeTypes) OR categories for the store's type
        return !cat.storeTypes || cat.storeTypes.length === 0 || cat.storeTypes.includes(storeType);
      })
    : safeCategories;

  // Use database categories only
  const categories = filteredCategories
    .map(cat => ({
      id: cat.slug,
      slug: cat.slug,
      name: cat.name,
      image: cat.image,
      displayOrder: 0,
      isActive: cat.isActive,
      requestedBySeller: Boolean(cat.requestedBySeller),
      productCount: products.filter((product) => productMatchesCategory(product, cat)).length,
    }))
    .filter(category => category.productCount > 0 || category.requestedBySeller);

  const cartItemsForSidebar = cartItems.map(cartItem => {
    const product = cartProducts.find(p => p.id === cartItem.productId);
    if (!product) return null;
    
    const productImage = Array.isArray(product.images) && product.images.length > 0 
      ? product.images[cartItem.selectedImageIndex || 0] || product.images[0]
      : heroImage;
    
    return {
      id: cartItem.id,
      name: product.name,
      price: parseFloat(product.price) * (1 - product.discount / 100),
      quantity: cartItem.quantity,
      image: productImage,
    };
  }).filter(Boolean) as any[];

  const handleAddToCart = async (productId: string) => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      navigate("/auth");
      return;
    }
    const product = availableProducts.find((entry) => entry.id === productId) || null;
    const hasVariantOptions = Array.isArray(product?.dynamicFields?.variantSummary) && product.dynamicFields.variantSummary.length > 0;
    if (hasVariantOptions) {
      toast({
        title: "Choose product option",
        description: "Please open the product and choose the exact option before adding it to cart.",
      });
      navigate(`/product/${productId}`);
      return;
    }
    addToCartMutation.mutate({ productId });
  };

  const handleToggleWishlist = async (productId: string) => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      navigate("/auth");
      return;
    }

    const isWishlisted = wishlist.some(item => item.productId === productId);
    if (isWishlisted) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  // Filter products locally while typing; navigation to search page happens on Enter/submit
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query.trim());
  }, []);

  const matchesProductSearch = (product: Product) => {
    const categoryLabel = getProductCategoryLabel(product).toLowerCase();
    return product.name.toLowerCase().includes(searchQuery) || categoryLabel.includes(searchQuery);
  };

  // Food-vendor isolation — same shared utility as MobileHome / MultiVendorHome.
  // Platform-wide food experience switch (Super Admin → Advanced Features).
  // When off, the Local Vendors & Restaurants homepage section is hidden.
  const restaurantsEnabled = (platformSettings as any)?.restaurantsEnabled !== false;
  // Food products live ONLY in the Local Vendors & Restaurants section; the
  // generic feeds (Featured / New Arrivals / All Products) exclude them.
  const foodStoreIds = getFoodStoreIdSet(dbStores as any);
  const localVendorList = getLocalVendors(dbStores as any);
  const restaurantList  = getRestaurants(dbStores as any);
  const foodVendorList = splitProductsByFoodStores<Product>(availableProducts, dbStores as any).foodVendorProducts;

  // Filter products based on search query (food excluded from generic feeds)
  const filteredProducts = searchQuery
    ? excludeFoodVendorProducts<Product>(availableProducts, foodStoreIds).filter(matchesProductSearch)
    : excludeFoodVendorProducts<Product>(availableProducts, foodStoreIds);
  const filteredFeaturedProducts = (
    searchQuery
      ? excludeFoodVendorProducts<Product>(featuredProducts, foodStoreIds).filter(matchesProductSearch)
      : excludeFoodVendorProducts<Product>(featuredProducts, foodStoreIds)
  ).slice(0, 5);
  const filteredNewArrivalProducts = searchQuery
    ? excludeFoodVendorProducts<Product>(newArrivalProducts, foodStoreIds).filter(matchesProductSearch)
    : excludeFoodVendorProducts<Product>(newArrivalProducts, foodStoreIds);
  const filteredFoodVendorProducts: Product[] = searchQuery
    ? foodVendorList.filter(matchesProductSearch).slice(0, 12)
    : foodVendorList.slice(0, 12);

  // MOBILE — pass unfiltered lists so MobileHome can split using the shared utility
  const mobileAllProducts = searchQuery
    ? (availableProducts || []).filter(matchesProductSearch)
    : (availableProducts || []);
  const mobileFeatured = (
    searchQuery ? (featuredProducts || []).filter(matchesProductSearch) : (featuredProducts || [])
  ).slice(0, 12);
  const mobileNewArrivals = (
    searchQuery ? (newArrivalProducts || []).filter(matchesProductSearch) : (newArrivalProducts || [])
  ).slice(0, 12);

  const FEATURED_ROW_LIMIT = 5;
  const visibleFeaturedProducts =
    searchQuery || showAllFeaturedProducts
      ? filteredFeaturedProducts
      : filteredFeaturedProducts.slice(0, FEATURED_ROW_LIMIT);
  const visibleNewArrivalProducts = searchQuery
    ? filteredNewArrivalProducts
    : filteredNewArrivalProducts.slice(0, FEATURED_ROW_LIMIT);

  // In development, log available products to help debug display issues
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.log('HOME: availableProducts', availableProducts.map(p => ({ id: p.id, name: p.name, images: (p as any).images?.length || 0 }))); 
  }

  if (settingsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  function SidebarPromotionsPlaceholder() {
    const { data: proms = [] } = useQuery<any[]>({ queryKey: ['/api/homepage/promotional'], queryFn: async () => { const res = await fetch('/api/homepage/promotional'); return res.json(); }, refetchInterval: 5000 });

    if (proms && proms.length > 0) {
      return <div className="min-h-0"><PromotionalAd sidebar /></div>;
    }

    // No promos: render an expanded placeholder (fills vertical space)
    return (
      <div className="h-full flex flex-col min-h-0">
        <div className="w-full flex-1 flex flex-col justify-center min-h-0">
          <div className="mb-4 text-muted-foreground text-center">No active promotions</div>
          <div className="flex-1 flex min-h-0">
            <AdBanner position="sidebar" className="w-full h-full flex-1 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (isMobile || isTablet) {
    return (
      <Suspense fallback={null}>
        <MobileHomeComp
          featuredProducts={mobileFeatured as any}
          newArrivalProducts={mobileNewArrivals as any}
          allProducts={mobileAllProducts as any}
          categories={categories as any}
          stores={dbStores}
          wishlist={wishlist as any}
          isLoading={productsLoading || featuredProductsLoading || newArrivalProductsLoading}
          onToggleWishlist={handleToggleWishlist}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen flex flex-col pb-14 md:pb-0">
      <style>{`
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
        .category-grid > * { flex: 0 0 auto; width: 185px; }
        @media (min-width: 640px) { .category-grid > * { width: 220px; } }
        @media (min-width: 1024px) { .category-grid > * { width: 245px; } }
        .dark .category-grid { scrollbar-color: rgba(99, 102, 241, 0.4) transparent; }
        .dark .category-grid::-webkit-scrollbar-thumb { background-color: rgba(99, 102, 241, 0.4); }
        .dark .category-grid::-webkit-scrollbar-thumb:hover { background-color: rgba(99, 102, 241, 0.7); }
      `}</style>
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>
      
      <Header
        cartItemsCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={() => isAuthenticated ? navigate("/cart") : navigate("/auth")}
        onSearch={handleSearch}
      />

      <HeroCarousel />

      {/* Full-bleed hero ad - stretches edge-to-edge and removes card borders for a flush look */}
      {/* Hero ad: render only when ads are enabled and hero is enabled */}
      {adsEnabled && heroBannerEnabled && (
        <div className="w-screen -mx-4 md:-mx-8 py-3">
          {/* much shorter hero ad height per request */}
          <AdBanner position="hero" className="h-16 md:h-20 rounded-none border-0" fullBleed />
        </div>
      )} 

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-12">
          {/* Shop by categories - full-width, above products and sidebar */}
          {(platformSettings as any)?.showShopBySection !== false && (
          <section className="rounded-2xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold tracking-tight">{t("shopByCategory")}</h2>
              {categories.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1 text-muted-foreground hover:text-foreground font-medium"
                  onClick={() => navigate("/products")}
                >
                  See all
                  <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
            {categories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">No categories available at the moment.</p>
                <p className="text-sm mt-2">Please check back later.</p>
              </div>
            ) : (
              <div className="category-grid" data-testid="grid-categories">
                {categories.map((category) => (
                  <CategoryCard
                    key={category.id}
                    category={category}
                    name={category.name}
                    image={category.image}
                    slug={category.slug}
                  />
                ))}
              </div>
            )}
          </section>
          )}

          {/* Promotional Ads Grid - Only show if 2+ promotions exist */}
          {hasMultiplePromotions && <PromotionalAdsGrid />}

          {/* Products and Sidebar row */}
          {/* Mobile promo: visible on small screens, hidden on large (sidebar shows on lg+) */}
          {hasExactlyOnePromotion && (
            <div className="lg:hidden mb-6">
              <PromotionalAd />
            </div>
          )}

          <div className="mt-8 grid lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Show promo AND/OR ad when available (stacking like MultiVendorHome) */}
            {sidebarItemCount > 0 && (
              <aside className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 flex flex-col gap-4" style={{ height: 'calc(100vh - 6rem)' }}>
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
                      className="overflow-hidden rounded-xl border-2 border-primary/20 shadow-md"
                      style={{ flex: '1 1 0%', minHeight: 0, display: 'flex', flexDirection: 'column' }}
                    >
                      <AdBanner position="sidebar" className="w-full h-full rounded-none border-0 flex-1" />
                    </div>
                  )}
                </div>
              </aside>
            )}

            {/* Products column - Adjust width based on sidebar visibility */}
            <div className={sidebarItemCount > 0 ? 'lg:col-span-8' : 'lg:col-span-12'}>
              {/* Local Vendors & Restaurants — dedicated food section (hidden when the food experience is disabled) */}
              {restaurantsEnabled && (productsLoading || filteredFoodVendorProducts.length > 0 || localVendorList.length > 0 || restaurantList.length > 0) && (
                <section className="rounded-2xl border bg-card p-6 shadow-sm mb-8" data-testid="section-local-vendors">
                  <div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-orange-500/15 text-orange-500 flex items-center justify-center">
                        <UtensilsCrossed className="h-5 w-5" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold tracking-tight">Local Vendors &amp; Restaurants</h2>
                        <p className="text-sm text-muted-foreground">Fresh food &amp; drinks near you</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => navigate('/vendors')} data-testid="button-see-all-vendors">
                      See all <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>

                  {productsLoading ? (
                    <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Skeleton key={i} className="aspect-square w-full rounded-xl" />
                      ))}
                    </div>
                  ) : filteredFoodVendorProducts.length > 0 ? (
                    <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`} data-testid="grid-food-vendor-products">
                      {filteredFoodVendorProducts.map((product) => {
                        const sellingPrice = parseFloat(product.price);
                        const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
                        const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                          ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                          : 0;
                        const isWishlisted = wishlist.some(item => item.productId === product.id);
                        const productImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : heroImage;
                        return (
                          <ProductCard
                            key={product.id}
                            id={product.id}
                            name={product.name}
                            price={product.price}
                            costPrice={product.costPrice || undefined}
                            image={productImage}
                            discount={product.discount || calculatedDiscount}
                            rating={product.ratings || "0"}
                            reviewCount={product.totalRatings || 0}
                            inStock={(product.stock || 0) > 0}
                            isWishlisted={isWishlisted}
                            onToggleWishlist={handleToggleWishlist}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                      No dishes available yet — check back soon.
                    </div>
                  )}
                </section>
              )}

              {showHomepageFeaturedSection && (featuredProductsLoading || filteredFeaturedProducts.length > 0 || Boolean(searchQuery)) && (
              <section className="rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold tracking-tight">
                    {searchQuery ? `${t("search").replace("...", "")} (${filteredFeaturedProducts.length})` : t("featuredProducts")}
                  </h2>
                  {!searchQuery && filteredFeaturedProducts.length > FEATURED_ROW_LIMIT && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground font-medium"
                      onClick={() => setShowAllFeaturedProducts((current) => !current)}
                      data-testid="button-toggle-featured-products"
                    >
                      <span>{showAllFeaturedProducts ? "Show less" : "Show all"}</span>
                      {showAllFeaturedProducts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  )}
                </div>

              {featuredProductsLoading ? (
                <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <Skeleton className="aspect-square w-full rounded-xl" />
                      <Skeleton className="h-4 w-3/4 rounded" />
                      <Skeleton className="h-4 w-1/2 rounded" />
                    </div>
                  ))}
                </div>
              ) : filteredFeaturedProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {searchQuery
                    ? `No featured products found matching "${searchQuery}"`
                    : "No featured products selected yet."}
                </div>
              ) : (
                <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                  {visibleFeaturedProducts.map((product) => {
                    const sellingPrice = parseFloat(product.price);
                    const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
                    const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                      ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                      : 0;

                    const isWishlisted = wishlist.some(item => item.productId === product.id);
                    const productImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : heroImage;

                    return (
                      <ProductCard
                        key={product.id}
                        id={product.id}
                        name={product.name}
                        price={sellingPrice}
                        costPrice={originalPrice || undefined}
                        currency={currencySymbol}
                        image={productImage}
                        discount={calculatedDiscount}
                        rating={parseFloat(product.ratings) || 0}
                        reviewCount={product.totalRatings}
                        inStock={(product.stock || 0) > 0}
                        isWishlisted={isWishlisted}
                        onToggleWishlist={handleToggleWishlist}
                      />
                    );
                  })}
                </div>
                )}
            </section>
              )}

              {showHomepageNewArrivalSection && visibleNewArrivalProducts.length > 0 && (
                <section className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl font-bold tracking-tight">New Arrivals</h2>
                    {!searchQuery && filteredNewArrivalProducts.length > FEATURED_ROW_LIMIT && (
                      <span className="text-sm text-muted-foreground">
                        {filteredNewArrivalProducts.length} new arrivals
                      </span>
                    )}
                  </div>

                  {newArrivalProductsLoading ? (
                    <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                      {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="flex flex-col gap-2">
                          <Skeleton className="aspect-square w-full rounded-xl" />
                          <Skeleton className="h-4 w-3/4 rounded" />
                          <Skeleton className="h-4 w-1/2 rounded" />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`grid gap-x-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                      {visibleNewArrivalProducts.map((product) => {
                        const sellingPrice = parseFloat(product.price);
                        const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
                        const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                          ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                          : 0;

                        const isWishlisted = wishlist.some(item => item.productId === product.id);
                        const productImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : heroImage;

                        return (
                          <ProductCard
                            key={product.id}
                            id={product.id}
                            name={product.name}
                            price={sellingPrice}
                            costPrice={originalPrice || undefined}
                            currency={currencySymbol}
                            image={productImage}
                            discount={calculatedDiscount}
                            rating={parseFloat(product.ratings) || 0}
                            reviewCount={product.totalRatings}
                            inStock={(product.stock || 0) > 0}
                            isWishlisted={isWishlisted}
                            onToggleWishlist={handleToggleWishlist}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              )}

              <section className="mt-6 rounded-2xl border bg-card p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold tracking-tight">All Products</h2>
                  <span className="text-sm text-muted-foreground">{filteredProducts.length} products</span>
                </div>

                {productsLoading ? (
                  <div className={`grid gap-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                    {Array.from({ length: 15 }).map((_, i) => (
                      <div key={i} className="flex flex-col gap-2">
                        <Skeleton className="aspect-square w-full rounded-xl" />
                        <Skeleton className="h-4 w-3/4 rounded" />
                        <Skeleton className="h-4 w-1/2 rounded" />
                      </div>
                    ))}
                  </div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    {searchQuery ? `No products found matching "${searchQuery}"` : "No products available in this store yet."}
                  </div>
                ) : (
                  <div className={`grid gap-4 gap-y-6 grid-cols-2 sm:grid-cols-3 ${sidebarItemCount > 0 ? 'md:grid-cols-3' : 'md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'}`}>
                    {filteredProducts.map((product) => {
                      const sellingPrice = parseFloat(product.price);
                      const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
                      const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                        ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                        : 0;
                      const isWishlisted = wishlist.some(item => item.productId === product.id);
                      const productImage = Array.isArray(product.images) && product.images.length > 0 ? product.images[0] : heroImage;

                      return (
                        <ProductCard
                          key={product.id}
                          id={product.id}
                          name={product.name}
                          price={sellingPrice}
                          costPrice={originalPrice || undefined}
                          currency={currencySymbol}
                          image={productImage}
                          discount={calculatedDiscount}
                          rating={parseFloat(product.ratings) || 0}
                          reviewCount={product.totalRatings}
                          inStock={(product.stock || 0) > 0}
                          isWishlisted={isWishlisted}
                          onToggleWishlist={handleToggleWishlist}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </main>
      {/* Full-bleed footer ad - show only when enabled */}
      {(adsEnabled && footerAdEnabled) && (
        <div className="w-screen -mx-4 md:-mx-8 pb-8">
          {/* smaller footer ad */}
          <AdBanner position="footer" className="h-12 md:h-16 rounded-none border-0" fullBleed />
        </div>
      )} 

      <Footer />

      {isAuthenticated && (
        <CartSidebar
          isOpen={isCartOpen}
          onClose={() => setIsCartOpen(false)}
          items={cartItemsForSidebar}
          onUpdateQuantity={(id, quantity) => {
            updateCartMutation.mutate({ id, quantity });
          }}
          onRemoveItem={(id) => {
            removeFromCartMutation.mutate(id);
          }}
          onCheckout={() => {
            setIsCartOpen(false);
            navigate('/checkout');
          }}
        />
      )}
      
      {/* Location prompt for new users */}
      <LocationPrompt />
    </div>
  );
}
