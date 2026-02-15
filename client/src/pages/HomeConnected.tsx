import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
import MultiVendorHome from "./MultiVendorHome";
import LocationPrompt from "@/components/LocationPrompt";
import { Button } from '@/components/ui/button';
import type { PlatformSettings } from "@shared/schema";

import heroImage from "@assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png";
import abayaCategoryImage from "@assets/stock_images/Abayas_category_collection_image_cbf9978c.png";
import hijabCategoryImage from "@assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png";
import eveningCategoryImage from "@assets/stock_images/Evening_wear_category_image_455c3389.png";

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string;
  images: string[];
  discount: number;
  ratings: string;
  totalRatings: number;
  category: string;
  storeId?: string;
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
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { currency, currencySymbol, t } = useLanguage();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const { data: platformSettings, isLoading: settingsLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 5000,
  });

  // Defensive flags to avoid runtime errors when settings are undefined during hydration/HMR
  const adsEnabled = platformSettings?.adsEnabled ?? true;
  const heroBannerEnabled = platformSettings?.heroBannerEnabled ?? true;
  const sidebarAdEnabled = platformSettings?.sidebarAdEnabled ?? true;
  const footerAdEnabled = platformSettings?.footerAdEnabled ?? true;
  const productPageAdEnabled = platformSettings?.productPageAdEnabled ?? true;

  // Query promotions to determine sidebar display logic
  const { data: allPromotions = [] } = useQuery<any[]>({
    queryKey: ["/api/homepage/promotional"],
    queryFn: async () => {
      const res = await fetch("/api/homepage/promotional");
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Determine sidebar display logic based on promotion count
  const hasExactlyOnePromotion = allPromotions.length === 1;
  const hasMultiplePromotions = allPromotions.length > 1;
  const hasPromotion = allPromotions.length >= 1;
  const singlePromotion = hasPromotion ? allPromotions[0] : null;

  // Sidebar content stacking: both promo + ad can coexist (matching MultiVendorHome)
  const hasSidebarAd = adsEnabled && sidebarAdEnabled;
  const sidebarItemCount = (hasPromotion ? 1 : 0) + (hasSidebarAd ? 1 : 0);

  const { data: allProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
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
    queryFn: async () => {
      const res = await fetch("/api/stores?isActive=true&isApproved=true");
      return res.json();
    },
    enabled: platformSettings?.isMultiVendor === true && platformSettings?.shopDisplayMode === "by-store",
  });

  // Products are already filtered server-side by primary store's sellerId in single-store mode
  // No additional client-side filtering needed — /api/products handles store mode correctly
  const products = allProducts;

  // Development-only fallback: show a few sample products when DB/products are not available
  const sampleProducts: Product[] = [
    { id: 'demo-1', name: 'Classic Abaya', price: '29.99', costPrice: '59.99', images: [heroImage], discount: 50, ratings: '4.7', totalRatings: 12, category: 'abayas' },
    { id: 'demo-2', name: 'Luxe Hijab', price: '9.99', costPrice: '19.99', images: [hijabCategoryImage], discount: 50, ratings: '4.6', totalRatings: 8, category: 'hijabs' },
    { id: 'demo-3', name: 'Evening Dress', price: '49.99', costPrice: '79.99', images: [eveningCategoryImage], discount: 38, ratings: '4.8', totalRatings: 21, category: 'evening' },
    { id: 'demo-4', name: 'Abaya Set', price: '34.99', costPrice: '49.99', images: [abayaCategoryImage], discount: 29, ratings: '4.5', totalRatings: 10, category: 'abayas' },
  ];

  // Merge DB products with development sample products (DEV only) so the grid always has content for visual checks
  const mergedProducts = (() => {
    const seen = new Set<string>();
    const combined = [ ...(products || []), ...(import.meta.env.DEV ? sampleProducts : []) ].filter((p) => {
      if (!p || !p.id) return false;
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    return combined;
  })();

  const availableProducts = mergedProducts;

  const { data: cartItems = [], isLoading: cartLoading } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated && !authLoading,
  });

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated && !authLoading,
  });

  const { data: cartProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/cart/products"],
    queryFn: async () => {
      if (!cartItems.length) return [];
      const productIds = cartItems.map(item => item.productId);
      const productsData = await Promise.all(
        productIds.map(async (id) => {
          const res = await fetch(`/api/products/${id}`);
          return res.json();
        })
      );
      return productsData;
    },
    enabled: cartItems.length > 0,
  });

  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity = 1 }: { productId: string; quantity?: number }) => {
      const res = await apiRequest("POST", "/api/cart", { productId, quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({
        title: "Added to cart",
        description: "Product has been added to your cart",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Please login to add items to cart",
        variant: "destructive",
      });
    },
  });

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }: { id: string; quantity: number }) => {
      const res = await apiRequest("PATCH", `/api/cart/${id}`, { quantity });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    },
  });

  const removeFromCartMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/cart/${id}`, {});
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
      const res = await apiRequest("POST", "/api/wishlist", { productId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({
        title: "Added to wishlist",
        description: "Product has been added to your wishlist",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not add to wishlist",
        variant: "destructive",
      });
    },
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      await apiRequest("DELETE", `/api/wishlist/${productId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({
        title: "Removed from wishlist",
        description: "Product has been removed from your wishlist",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Could not remove from wishlist",
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

  const { data: dbCategories = [] } = useQuery<Array<{id: string; name: string; slug: string; image: string; isActive: boolean; storeTypes: string[] | null}>>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories?isActive=true");
      return res.json();
    },
  });

  // Fetch primary store details in single-vendor mode
  const { data: primaryStore } = useQuery<{storeType: string} | null>({
    queryKey: ["/api/stores", platformSettings?.primaryStoreId],
    queryFn: async () => {
      if (!platformSettings?.primaryStoreId) return null;
      const res = await fetch(`/api/stores/${platformSettings.primaryStoreId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !platformSettings?.isMultiVendor && !!platformSettings?.primaryStoreId,
  });

  // Filter categories by store type in single-vendor mode
  const filteredCategories = !platformSettings?.isMultiVendor 
    ? (dbCategories || []).filter(cat => {
        // Default to "clothing" for Islamic fashion platform if no primary store configured
        const storeType = primaryStore?.storeType || "clothing";
        // Show global categories (null or empty storeTypes) OR categories for the store's type
        return !cat.storeTypes || cat.storeTypes.length === 0 || cat.storeTypes.includes(storeType);
      })
    : (dbCategories || []);

  // Use database categories only
  const categories = filteredCategories.map(cat => ({
    id: cat.slug,
    name: cat.name,
    image: cat.image,
    productCount: products.filter(p => p.category === cat.slug).length
  }));

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

  const handleAddToCart = (productId: string) => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    addToCartMutation.mutate({ productId });
  };

  const handleToggleWishlist = (productId: string) => {
    if (!isAuthenticated) {
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

  // Debounced search handler - Reduced debounce for more instant feel
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearch = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    debounceTimerRef.current = setTimeout(() => {
      setSearchQuery(query.toLowerCase().trim());
    }, 150);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Filter products based on search query
  const filteredProducts = searchQuery
    ? availableProducts.filter(product => 
        product.name.toLowerCase().includes(searchQuery) ||
        (product.category || '').toLowerCase().includes(searchQuery)
      )
    : availableProducts;

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

  if (platformSettings?.isMultiVendor) {
    return <MultiVendorHome />;
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

  return (
    <div className="min-h-screen flex flex-col">
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
          <section>
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold">{t("shopByCategory")}</h2>
              {categories.length > 0 && (
                <p className="text-sm text-muted-foreground">Scroll to see more →</p>
              )}
            </div>
            {categories.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p className="text-lg">No categories available at the moment.</p>
                <p className="text-sm mt-2">Please check back later.</p>
              </div>
            ) : (
              <div className="relative">
                <div className="flex gap-4 md:gap-6 overflow-x-auto pb-4 snap-x snap-mandatory [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-muted [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50">
                  {categories.map((category) => (
                    <div key={category.id} className="flex-shrink-0 w-[min(280px,80vw)] md:w-72 snap-start">
                      <CategoryCard {...category} onClick={(id) => navigate(`/category/${id}`)} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
          )}

          {/* Promotional Ads Grid - Only show if 2+ promotions exist */}
          {hasMultiplePromotions && <PromotionalAdsGrid />}

          {/* Products and Sidebar row */}
          {/* Mobile promo: visible on small screens, hidden on large (sidebar shows on lg+) */}
          <div className="lg:hidden mb-6">
            <PromotionalAd />
          </div>

          <div className="mt-8 grid lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Show promo AND/OR ad when available (stacking like MultiVendorHome) */}
            {sidebarItemCount > 0 && (
              <aside className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 flex flex-col gap-4" style={{ height: 'calc(100vh - 6rem)' }}>
                  {/* Promotion — fills available height, splits evenly when stacked */}
                  {hasPromotion && (
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
              <section>
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-3xl font-bold">
                    {searchQuery ? `${t("search").replace("...", "")} (${filteredProducts.length})` : t("featuredProducts")}
                  </h2>
                </div>

              {productsLoading ? (
                <div className="text-center py-12">Loading products...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No products found matching "{searchQuery}"</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
                  {(searchQuery ? filteredProducts : filteredProducts.slice(0, 8)).map((product) => {
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
                        isWishlisted={isWishlisted}
                        onToggleWishlist={handleToggleWishlist}
                      />
                    );
                  })}
                </div>
              )}
            </section>

              {/* All Products Section */}
              {filteredProducts.length > 8 && !searchQuery && (
                <section className="mt-8">
                  <div className="flex items-center justify-between mb-8">
                    <h2 className="text-3xl font-bold">All Products</h2>
                    <span className="text-sm text-muted-foreground">{filteredProducts.length} products</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4">
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
                          isWishlisted={isWishlisted}
                          onToggleWishlist={handleToggleWishlist}
                        />
                      );
                    })}
                  </div>
                </section>
              )}
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
