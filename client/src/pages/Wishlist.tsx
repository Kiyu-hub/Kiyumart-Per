import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";

interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

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
}

export default function Wishlist() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currencySymbol } = useLanguage();
  const [isCartOpen, setIsCartOpen] = useState(false);

  const { data: wishlist = [], isLoading: wishlistLoading } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated,
  });

  const { data: wishlistProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/wishlist/products", wishlist],
    queryFn: async () => {
      if (!wishlist.length) return [];
      const productsData = await Promise.all(
        wishlist.map(async (item) => {
          const res = await fetch(`/api/products/${item.productId}`);
          return res.json();
        })
      );
      return productsData;
    },
    enabled: wishlist.length > 0,
  });

  if (!isAuthenticated && !authLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header cartItemsCount={0} onCartClick={() => navigate("/cart")} />
        <div className="flex-1 flex items-center justify-center">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle>Sign In Required</CardTitle>
              <CardDescription>Please sign in to view your wishlist</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/auth")} className="w-full" data-testid="button-signin">
                Sign In
              </Button>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>
    );
  }

  const isLoading = wishlistLoading || productsLoading;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header cartItemsCount={0} onCartClick={() => setIsCartOpen(true)} />
      
      <main className="flex-1">
        <div className="container max-w-7xl mx-auto px-4 py-8">
          <div className="flex items-center gap-3 mb-8">
            <Heart className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold" data-testid="text-wishlist-title">My Wishlist</h1>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[1, 2, 3, 4].map((i) => (
                <Card key={i} className="h-96 animate-pulse">
                  <div className="h-full bg-muted" />
                </Card>
              ))}
            </div>
          ) : wishlistProducts.length === 0 ? (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <div className="flex justify-center mb-4">
                  <Heart className="h-16 w-16 text-muted-foreground" />
                </div>
                <CardTitle className="text-center">Your Wishlist is Empty</CardTitle>
                <CardDescription className="text-center">
                  Start adding products you love to your wishlist
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={() => navigate("/")} className="w-full" data-testid="button-shop">
                  Start Shopping
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              <p className="text-muted-foreground mb-6" data-testid="text-wishlist-count">
                {wishlistProducts.length} {wishlistProducts.length === 1 ? 'item' : 'items'} in your wishlist
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {wishlistProducts.map((product) => {
                  const costPrice = product.costPrice ? parseFloat(product.costPrice) : undefined;
                  const sellingPrice = parseFloat(product.price);
                  const discount = costPrice && costPrice > sellingPrice
                    ? Math.round(((costPrice - sellingPrice) / costPrice) * 100)
                    : 0;

                  return (
                    <ProductCard
                      key={product.id}
                      id={product.id}
                      name={product.name}
                      price={sellingPrice}
                      costPrice={costPrice}
                      currency={currencySymbol}
                      image={product.images[0]}
                      discount={discount}
                      rating={parseFloat(product.ratings) || 0}
                      reviewCount={product.totalRatings}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
