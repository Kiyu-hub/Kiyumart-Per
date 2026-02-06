import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MarketplaceBannerCarousel from "@/components/MarketplaceBannerCarousel";
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
import { TrendingUp, Star, ShoppingBag, ChevronRight } from "lucide-react";
import type { Product, PlatformSettings } from "@shared/schema";

interface Category {
  id: string;
  name: string;
  slug: string;
  image: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
}

export default function MultiVendorHome() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
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

  const { data: featuredProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/homepage/featured-products"],
  });

  const { data: allProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories", "active"],
    queryFn: async () => {
      const res = await fetch("/api/categories?isActive=true");
      return res.json();
    },
  });

  // Fetch active promotions
  const { data: promos = [] } = useQuery<any[]>({
    queryKey: ['/api/homepage/promotional'],
    queryFn: async () => {
      const res = await fetch('/api/homepage/promotional');
      return res.json();
    },
    refetchInterval: 5000,
  });

  const hasMultiplePromotions = promos && promos.length > 1;
  const hasExactlyOnePromotion = promos && promos.length === 1;
  const singlePromotion = hasExactlyOnePromotion ? promos[0] : null;

  const getCategoryProductCount = (categorySlug: string) => {
    return allProducts.filter((p) => p.category === categorySlug).length;
  };
  
  const isAdmin = user?.role === "admin";
  const shopDisplayMode = (settings as any)?.shopDisplayMode || "by-store";
  const adsEnabled = (settings as any)?.adsEnabled ?? false;
  const heroBannerEnabled = (settings as any)?.heroBannerEnabled ?? true;
  const sidebarAdEnabled = (settings as any)?.sidebarAdEnabled ?? true;
  const footerAdEnabled = (settings as any)?.footerAdEnabled ?? true;

  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-gray-900">
      <Header />
      
      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 py-6 space-y-12">
          <MarketplaceBannerCarousel
            autoplayEnabled={settings?.bannerAutoplayEnabled ?? true}
            autoplayDuration={settings?.bannerAutoplayDuration ?? 5000}
          />

          {/* Hero Ad - Only when ads are enabled */}
          {adsEnabled && heroBannerEnabled && (
            <div className="w-full">
              <AdBanner position="hero" className="h-16 md:h-20 rounded-lg" />
            </div>
          )}

          {/* Promotional Ads Grid - Show when 2+ promotions */}
          {hasMultiplePromotions && (
            <PromotionalAdsGrid />
          )}

          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShoppingBag className="w-6 h-6 text-primary" />
                <h2 
                  className="text-2xl md:text-3xl font-bold text-foreground dark:text-white"
                  data-testid="heading-categories"
                >
                  {shopDisplayMode === "by-category" ? "Shop by Categories" : "Shop by Store"}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Badge variant="outline" className="text-sm" data-testid="badge-store-count">
                    {shopDisplayMode === "by-store" 
                      ? `${stores.length} ${stores.length === 1 ? "Store" : "Stores"}`
                      : `${categories.length} ${categories.length === 1 ? "Category" : "Categories"}`
                    }
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  className="gap-1"
                  onClick={() => navigate(shopDisplayMode === "by-category" ? "/categories" : "/stores")}
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
                    <Skeleton key={i} className="aspect-[4/3] rounded-lg" data-testid={`skeleton-category-${i}`} />
                  ))}
                </div>
              ) : categories.length > 0 ? (
                <div className="category-grid" data-testid="grid-categories">
                  {categories.map((category) => (
                    <CategoryCard
                      key={category.id}
                      category={category}
                      name={category.name}
                      image={category.image}
                      slug={category.slug}
                      productCount={getCategoryProductCount(category.slug)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-categories">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">No product categories are available at the moment</p>
                  <p className="text-sm">Please check back later or contact the administrator to add categories!</p>
                </div>
              )
            ) : (
              storesLoading ? (
                <div className="category-grid">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3] rounded-lg" data-testid={`skeleton-store-${i}`} />
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
                <div className="text-center py-12 text-muted-foreground" data-testid="empty-stores">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">No stores available at the moment</p>
                  <p className="text-sm">Please check back later or contact support!</p>
                </div>
              )
            )}
          </section>

          {/* Mobile promo: visible on small screens, hidden on large (sidebar shows on lg+) */}
          {hasExactlyOnePromotion && (
            <div className="lg:hidden mb-6">
              <PromotionalAd />
            </div>
          )}

          {/* Products and Sidebar row */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Sidebar - Show promotion if exactly 1, OR ads if enabled */}
            {(hasExactlyOnePromotion || (adsEnabled && sidebarAdEnabled)) && (
              <aside className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 flex flex-col gap-6 h-[calc(100vh-6rem)]">
                  {/* Sidebar Content: Priority order - Single Promotion > Ads > Nothing */}
                  {hasExactlyOnePromotion ? (
                    <div className="flex-1 overflow-hidden min-h-0">
                      <SinglePromotionSidebar promo={singlePromotion} />
                    </div>
                  ) : (adsEnabled && sidebarAdEnabled) ? (
                    <div className="flex-1 overflow-hidden min-h-0 rounded-lg overflow-hidden border-2 border-primary/20 shadow-md">
                      <AdBanner position="sidebar" className="w-full h-full rounded-none border-0" />
                    </div>
                  ) : null}
                </div>
              </aside>
            )}

            {/* Products column - Adjust width based on sidebar visibility */}
            <div className={(hasExactlyOnePromotion || (adsEnabled && sidebarAdEnabled)) ? 'lg:col-span-8' : 'lg:col-span-12'}>
          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-6 h-6 text-primary" />
              <h2 
                className="text-2xl md:text-3xl font-bold text-foreground dark:text-white"
                data-testid="heading-featured"
              >
                Featured Products
              </h2>
            </div>

            {productsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[...Array(10)].map((_, i) => (
                  <Skeleton key={i} className="aspect-square rounded-lg" data-testid={`skeleton-product-${i}`} />
                ))}
              </div>
            ) : featuredProducts.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-featured-products">
                {featuredProducts.map((product) => (
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
            ) : (
              <div className="text-center py-12 text-muted-foreground" data-testid="empty-products">
                <Star className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>No products available yet</p>
              </div>
            )}
          </section>

          <section className="space-y-6">
            <div className="flex items-center gap-3">
              <Star className="w-6 h-6 text-primary" />
              <h2 
                className="text-2xl md:text-3xl font-bold text-foreground dark:text-white"
                data-testid="heading-new-arrivals"
              >
                New Arrivals
              </h2>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="grid-new-arrivals">
              {allProducts.slice(0, 10).map((product) => (
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
          </section>
            </div>
          </div>

          {/* Footer Ad - Only when ads are enabled */}
          {adsEnabled && footerAdEnabled && (
            <div className="w-full">
              <AdBanner position="footer" className="h-24 md:h-32 rounded-lg" />
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Location prompt for new users */}
      <LocationPrompt />

      <style>{`
        .category-grid {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
          padding-bottom: 8px;
        }

        .category-grid::-webkit-scrollbar {
          height: 6px;
        }

        .category-grid::-webkit-scrollbar-track {
          background: transparent;
        }

        .category-grid::-webkit-scrollbar-thumb {
          background-color: rgba(155, 155, 155, 0.5);
          border-radius: 3px;
        }

        .category-grid::-webkit-scrollbar-thumb:hover {
          background-color: rgba(155, 155, 155, 0.7);
        }

        .category-grid > * {
          flex: 0 0 auto;
          width: 160px;
        }

        @media (min-width: 640px) {
          .category-grid > * {
            width: 200px;
          }
        }

        @media (min-width: 1024px) {
          .category-grid > * {
            width: 220px;
          }
        }
      `}</style>
    </div>
  );
}
