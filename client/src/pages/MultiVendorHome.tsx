import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
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
import { TrendingUp, Star, ShoppingBag, ChevronRight, Sparkles } from "lucide-react";
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
    <div className="mv-home min-h-screen flex flex-col relative overflow-hidden">
      {/* Animated gradient background */}
      <div className="mv-bg-gradient" />
      <div className="mv-bg-orb mv-bg-orb-1" />
      <div className="mv-bg-orb mv-bg-orb-2" />
      <div className="mv-bg-orb mv-bg-orb-3" />

      {/* Top bar with theme toggle */}
      <div className="relative z-20 flex items-center justify-end px-4 py-2 border-b border-white/10 backdrop-blur-md bg-white/5">
        <ThemeToggle />
      </div>
      
      <div className="relative z-10">
        <Header />
      </div>
      
      {/* Full-width Hero Carousel */}
      <div className="relative z-10">
        <HeroCarousel />
      </div>
      
      <main className="flex-1 relative z-10">
        <div className="container max-w-7xl mx-auto px-4 py-8 space-y-12">

          {/* Hero Ad */}
          {adsEnabled && heroBannerEnabled && (
            <div className="w-full">
              <AdBanner position="hero" className="h-16 md:h-20 rounded-xl" />
            </div>
          )}

          {/* Promotional Ads Grid */}
          {hasMultiplePromotions && (
            <PromotionalAdsGrid />
          )}

          {/* Shop by Store/Category Section */}
          <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="mv-icon-badge">
                  <ShoppingBag className="w-5 h-5 text-white" />
                </div>
                <h2 
                  className="text-2xl md:text-3xl font-bold text-white"
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
                      : `${categories.length} ${categories.length === 1 ? "Category" : "Categories"}`
                    }
                  </Badge>
                )}
                <Button 
                  variant="ghost" 
                  className="gap-1 text-blue-200 hover:text-white hover:bg-white/10"
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
                    <Skeleton key={i} className="aspect-[4/3] rounded-xl bg-white/10" data-testid={`skeleton-category-${i}`} />
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
                <div className="text-center py-12 text-blue-200/70" data-testid="empty-categories">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">No product categories are available at the moment</p>
                  <p className="text-sm">Please check back later or contact the administrator to add categories!</p>
                </div>
              )
            ) : (
              storesLoading ? (
                <div className="category-grid">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="aspect-[4/3] rounded-xl bg-white/10" data-testid={`skeleton-store-${i}`} />
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
                <div className="text-center py-12 text-blue-200/70" data-testid="empty-stores">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">No stores available at the moment</p>
                  <p className="text-sm">Please check back later or contact support!</p>
                </div>
              )
            )}
          </section>

          {/* Mobile promo */}
          {hasExactlyOnePromotion && (
            <div className="lg:hidden mb-6">
              <PromotionalAd />
            </div>
          )}

          {/* Products and Sidebar row */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* Left Sidebar */}
            {(hasExactlyOnePromotion || (adsEnabled && sidebarAdEnabled)) && (
              <aside className="hidden lg:block lg:col-span-4">
                <div className="sticky top-24 flex flex-col gap-6 h-[calc(100vh-6rem)]">
                  {hasExactlyOnePromotion ? (
                    <div className="flex-1 overflow-hidden min-h-0">
                      <SinglePromotionSidebar promo={singlePromotion} />
                    </div>
                  ) : (adsEnabled && sidebarAdEnabled) ? (
                    <div className="flex-1 overflow-hidden min-h-0 rounded-xl overflow-hidden border border-white/10 shadow-lg">
                      <AdBanner position="sidebar" className="w-full h-full rounded-none border-0" />
                    </div>
                  ) : null}
                </div>
              </aside>
            )}

            {/* Products column */}
            <div className={(hasExactlyOnePromotion || (adsEnabled && sidebarAdEnabled)) ? 'lg:col-span-8' : 'lg:col-span-12'}>
              {/* Featured Products */}
              <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6 mb-8">
                <div className="flex items-center gap-3">
                  <div className="mv-icon-badge mv-icon-badge-amber">
                    <TrendingUp className="w-5 h-5 text-white" />
                  </div>
                  <h2 
                    className="text-2xl md:text-3xl font-bold text-white"
                    data-testid="heading-featured"
                  >
                    Featured Products
                  </h2>
                  <Sparkles className="w-5 h-5 text-amber-400 animate-pulse" />
                </div>

                {productsLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="aspect-square rounded-xl bg-white/10" data-testid={`skeleton-product-${i}`} />
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
                  <div className="text-center py-12 text-blue-200/70" data-testid="empty-products">
                    <Star className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p>No products available yet</p>
                  </div>
                )}
              </section>

              {/* New Arrivals */}
              <section className="mv-glass-card rounded-2xl p-6 md:p-8 space-y-6">
                <div className="flex items-center gap-3">
                  <div className="mv-icon-badge mv-icon-badge-purple">
                    <Star className="w-5 h-5 text-white" />
                  </div>
                  <h2 
                    className="text-2xl md:text-3xl font-bold text-white"
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

          {/* Footer Ad */}
          {adsEnabled && footerAdEnabled && (
            <div className="w-full">
              <AdBanner position="footer" className="h-24 md:h-32 rounded-xl" />
            </div>
          )}
        </div>
      </main>

      <div className="relative z-10">
        <Footer />
      </div>

      <LocationPrompt />

      <style>{`
        /* ── Glassmorphism Dark Blue Theme ────────────── */
        .mv-home {
          background: #080e27;
          color: #e0e7ff;
        }

        .mv-bg-gradient {
          position: fixed;
          inset: 0;
          background: linear-gradient(135deg, #0a1628 0%, #0d1f4a 25%, #111d42 50%, #0c1a3d 75%, #060d24 100%);
          z-index: 0;
        }

        .mv-bg-orb {
          position: fixed;
          border-radius: 50%;
          filter: blur(100px);
          opacity: 0.3;
          z-index: 1;
          animation: mv-float 20s ease-in-out infinite;
        }

        .mv-bg-orb-1 {
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, #1e40af 0%, transparent 70%);
          top: -200px;
          right: -100px;
          animation-delay: 0s;
        }

        .mv-bg-orb-2 {
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, #7c3aed 0%, transparent 70%);
          bottom: 10%;
          left: -150px;
          animation-delay: -7s;
        }

        .mv-bg-orb-3 {
          width: 400px;
          height: 400px;
          background: radial-gradient(circle, #0ea5e9 0%, transparent 70%);
          top: 50%;
          right: 20%;
          animation-delay: -14s;
        }

        @keyframes mv-float {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -20px) scale(1.05); }
          66% { transform: translate(-20px, 15px) scale(0.95); }
        }

        /* Glass card */
        .mv-glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 
            0 8px 32px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }

        .mv-glass-card:hover {
          border-color: rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.07);
        }

        /* Icon badges */
        .mv-icon-badge {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(135deg, #2563eb, #1d4ed8);
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4);
        }

        .mv-icon-badge-amber {
          background: linear-gradient(135deg, #f59e0b, #d97706);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
        }

        .mv-icon-badge-purple {
          background: linear-gradient(135deg, #7c3aed, #6d28d9);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
        }

        .mv-badge {
          background: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          color: #c7d2fe;
          backdrop-filter: blur(8px);
        }

        /* Category grid scrollbar */
        .category-grid {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          overflow-y: hidden;
          scroll-behavior: smooth;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: thin;
          scrollbar-color: rgba(99, 102, 241, 0.4) transparent;
          padding-bottom: 8px;
        }

        .category-grid::-webkit-scrollbar {
          height: 6px;
        }

        .category-grid::-webkit-scrollbar-track {
          background: transparent;
        }

        .category-grid::-webkit-scrollbar-thumb {
          background-color: rgba(99, 102, 241, 0.4);
          border-radius: 3px;
        }

        .category-grid::-webkit-scrollbar-thumb:hover {
          background-color: rgba(99, 102, 241, 0.7);
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
