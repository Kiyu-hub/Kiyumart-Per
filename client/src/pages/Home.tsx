import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
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

  const { data: allDbProducts = [] } = useQuery<Array<{id: string; category: string; storeId?: string}>>({
    queryKey: ["/api/products"],
    queryFn: async () => {
      const res = await fetch("/api/products?isActive=true");
      return res.json();
    },
  });

  // Filter products by primary store in single-store mode
  const dbProducts = platformSettings?.isMultiVendor 
    ? allDbProducts 
    : platformSettings?.primaryStoreId
      ? allDbProducts.filter(p => p.storeId === platformSettings.primaryStoreId)
      : allDbProducts;

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

  const products = [
    {
      id: "1",
      name: "Elegant Black Abaya with Gold Embroidery",
      price: 299.99,
      costPrice: 399.99,
      image: abaya1,
      discount: 25,
      rating: 4.8,
      reviewCount: 128,
    },
    {
      id: "2",
      name: "Navy Blue Embroidered Modest Dress",
      price: 189.99,
      costPrice: 249.99,
      image: abaya2,
      discount: 24,
      rating: 4.9,
      reviewCount: 256,
    },
    {
      id: "3",
      name: "Pink Lace Abaya Dress",
      price: 229.99,
      costPrice: 299.99,
      image: abaya3,
      discount: 23,
      rating: 4.6,
      reviewCount: 89,
    },
    {
      id: "4",
      name: "Burgundy Velvet Abaya with Pearls",
      price: 449.99,
      costPrice: 599.99,
      image: abaya4,
      discount: 25,
      rating: 4.9,
      reviewCount: 45,
    },
    {
      id: "5",
      name: "Emerald Green Satin Dress with Hijab",
      price: 279.99,
      costPrice: 349.99,
      image: abaya5,
      discount: 20,
      rating: 4.7,
      reviewCount: 203,
    },
    {
      id: "6",
      name: "Cream Abaya with Beige Embroidery",
      price: 249.99,
      costPrice: 329.99,
      image: abaya6,
      discount: 24,
      rating: 4.8,
      reviewCount: 167,
    },
  ];

  const handleAddToCart = (productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      const existingItem = cartItems.find(item => item.id === productId);
      if (existingItem) {
        setCartItems(cartItems.map(item =>
          item.id === productId ? { ...item, quantity: item.quantity + 1 } : item
        ));
      } else {
        setCartItems([...cartItems, {
          id: product.id,
          name: product.name,
          price: product.discount ? product.price * (1 - product.discount / 100) : product.price,
          quantity: 1,
          image: product.image
        }]);
      }
      console.log('Added to cart:', productId);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>
      
      <Header
        cartItemsCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        onCartClick={() => setIsCartOpen(true)}
      />

      <HeroCarousel />

      <main className="flex-1">
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

        <section className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-bold">{t("featuredProducts")}</h2>
            <a href="#" className="text-primary hover:underline">
              {t("viewAll")}
            </a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                {...product}
                currency={currencySymbol}
                onToggleWishlist={(id) => console.log('Wishlist toggled:', id)}
              />
            ))}
          </div>
        </section>
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
    </div>
  );
}
