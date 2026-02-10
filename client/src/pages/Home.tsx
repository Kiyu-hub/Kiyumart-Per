import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import MarketplaceBannerCarousel from "@/components/MarketplaceBannerCarousel";
import CategoryCard from "@/components/CategoryCard";
import StoreCard from "@/components/StoreCard";
import ProductCard from "@/components/ProductCard";
import Footer from "@/components/Footer";
import CartSidebar from "@/components/CartSidebar";
import ThemeToggle from "@/components/ThemeToggle";
import LocationPrompt from "@/components/LocationPrompt";

import heroImage from "@assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png";
import abaya1 from "@assets/stock_images/Elegant_black_abaya_with_gold_embroidery_cc860cad.png";
import abaya2 from "@assets/stock_images/Navy_blue_embroidered_modest_dress_aa08f435.png";
import abaya3 from "@assets/stock_images/Pink_lace_abaya_dress_53759991.png";
import abaya4 from "@assets/stock_images/Burgundy_velvet_abaya_with_pearls_c19f2d40.png";
import abaya5 from "@assets/stock_images/Emerald_green_satin_dress_530931af.png";
import abaya6 from "@assets/stock_images/Cream_abaya_with_beige_embroidery_92e12aec.png";
import abayaCategoryImage from "@assets/stock_images/Abayas_category_collection_image_cbf9978c.png";
import hijabCategoryImage from "@assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png";
import eveningCategoryImage from "@assets/stock_images/Evening_wear_category_image_455c3389.png";

export default function Home() {
  const [, navigate] = useLocation();
  const { currencySymbol, t } = useLanguage();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartItems, setCartItems] = useState([
    {
      id: '1',
      name: 'Elegant Black Abaya',
      price: 299.99,
      quantity: 1,
      image: abaya1
    }
  ]);

  const { data: platformSettings } = useQuery<{
    isMultiVendor: boolean; 
    primaryStoreId?: string; 
    shopDisplayMode?: string;
  }>({
    queryKey: ["/api/platform-settings"],
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

  const { data: dbCategories = [] } = useQuery<Array<{id: string; name: string; slug: string; image: string; isActive: boolean}>>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      const res = await fetch("/api/categories?isActive=true");
      return res.json();
    },
  });

  const { data: allDbProducts = [] } = useQuery<Array<{id: string; name: string; price: string; costPrice?: string; images: string[]; discount: number; ratings: string; totalRatings: number; category: string; stock?: number; storeId?: string}>>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products?isActive=true");
      return res.json();
    },
  });

  // Fetch featured products (server-side already filters by store mode)
  const { data: featuredDbProducts = [] } = useQuery<Array<{id: string; name: string; price: string; costPrice?: string; images: string[]; discount: number; ratings: string; totalRatings: number; category: string; stock?: number}>>({
    queryKey: ["/api/homepage/featured-products"],
  });

  // Products are already filtered server-side by primary store's sellerId in single-store mode
  // No additional client-side filtering needed — /api/products handles store mode correctly
  let dbProducts = allDbProducts;

  // Fallback behavior when the configured primary store has no products
  const primaryStoreIdMissingProducts = platformSettings?.isMultiVendor !== true && platformSettings?.primaryStoreId && dbProducts.length === 0;

  const isProduction = (import.meta.env.MODE === 'production');

  // In non-production environments, fallback to showing all products (helpful for dev).
  // In production, we DO NOT fall back to other stores; instead we'll render banners and a friendly message.
  if (primaryStoreIdMissingProducts && !isProduction) {
    dbProducts = allDbProducts; // show all products as a graceful fallback in dev
  }

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

  const categories = dbCategories.map(cat => ({
    id: cat.slug,
    name: cat.name,
    image: cat.image,
    productCount: dbProducts.filter(p => p.category === cat.slug).length
  }));

  // If we had to fall back because the primary store has no products, send a dev-only client log
  if (primaryStoreIdMissingProducts) {
    (async () => {
      try {
        await fetch('/api/test/client-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            type: 'primary_store_missing_products',
            primaryStoreId: platformSettings?.primaryStoreId,
            availableProducts: allDbProducts.length,
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (e) {
        // silent
        console.debug('Client log failed to send:', (e as any)?.message || (e as any));
      }
    })();
  }

  // Use DB products for featured section (server-side filters by store mode)
  const displayFeaturedProducts = featuredDbProducts.length > 0 ? featuredDbProducts : dbProducts;

  const handleAddToCart = (productId: string) => {
    console.log('Add to cart:', productId);
  };

  const showShopBySection = (platformSettings as any)?.showShopBySection !== false;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>
      
      <Header
        cartItemsCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={() => setIsCartOpen(true)}
      />

      <MarketplaceBannerCarousel />

      <main className="flex-1">
        {showShopBySection && (
        <section className="max-w-7xl mx-auto px-4 py-12">
          {platformSettings?.isMultiVendor && platformSettings?.shopDisplayMode === "by-store" ? (
            <>
              <h2 className="text-3xl font-bold mb-8">Shop by Stores</h2>
              {dbStores.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-lg">No stores available at the moment. Please check back later!</p>
                </div>
              ) : (
                <div className="category-grid-single-store">
                  {dbStores.map((store) => (
                    <StoreCard
                      key={store.id}
                      id={store.id}
                      name={store.name}
                      logo={store.logo}
                      banner={store.banner}
                    />
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <h2 className="text-3xl font-bold mb-8">{t("shopByCategory")}</h2>
              {categories.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground text-lg">
                    No product categories are available at the moment. Please check back later or contact the administrator.
                  </p>
                </div>
              ) : (
                <div className="category-grid-single-store">
                  {categories.map((category) => (
                    <CategoryCard
                      key={category.id}
                      {...category}
                      onClick={(id) => navigate(`/category/${id}`)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </section>
        )}

        <section className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">{t("featuredProducts")}</h2>
            <Link href="/products" className="text-primary hover:underline">
              {t("viewAll")}
            </Link>
          </div>
          {displayFeaturedProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {displayFeaturedProducts.slice(0, 8).map((product) => {
                const sellingPrice = parseFloat(product.price);
                const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
                const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                  ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                  : 0;
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
                    reviewCount={product.totalRatings || 0}
                    inStock={(product.stock || 0) > 0}
                    onToggleWishlist={(id) => console.log('Wishlist toggled:', id)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">No products available yet. Check back soon!</p>
            </div>
          )}
        </section>

        {/* All Products Section */}
        {dbProducts.length > 0 && (
          <section className="max-w-7xl mx-auto px-4 py-12 border-t">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-3xl font-bold">All Products</h2>
              <Link href="/products" className="text-primary hover:underline">
                {t("viewAll")}
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {dbProducts.map((product) => {
                const sellingPrice = parseFloat(product.price);
                const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
                const calculatedDiscount = originalPrice && originalPrice > sellingPrice
                  ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
                  : 0;
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
                    reviewCount={product.totalRatings || 0}
                    inStock={(product.stock || 0) > 0}
                    onToggleWishlist={(id) => console.log('Wishlist toggled:', id)}
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Footer />

      <CartSidebar
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={(id, quantity) => {
          setCartItems(cartItems.map(item =>
            item.id === id ? { ...item, quantity } : item
          ));
        }}
        onRemoveItem={(id) => {
          setCartItems(cartItems.filter(item => item.id !== id));
        }}
        onCheckout={() => {
          setIsCartOpen(false);
          navigate('/checkout');
        }}
      />
      
      {/* Location prompt for new users */}
      <LocationPrompt />
    </div>
  );
}
