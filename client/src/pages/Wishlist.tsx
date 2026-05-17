import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ProductCard from "@/components/ProductCard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Heart } from "lucide-react";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

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

function MobileWishlistView({ wishlistProducts, isLoading, isAuthenticated, authLoading, onRemove }: {
  wishlistProducts: any[];
  isLoading: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  onRemove: (productId: string) => void;
}) {
  const [, navigate] = useLocation();
  const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const s = localStorage.getItem('theme');
    setIsDark(s ? s === 'dark' : document.documentElement.classList.contains('dark'));
  }, []);

  const bg   = isDark ? '#111111' : '#F2F2F7';
  const card = isDark ? '#1C1C1E' : '#FFFFFF';
  const hdr  = isDark ? '#111111' : '#FFFFFF';
  const bdr  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const txt  = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)';
  const inp  = isDark ? '#2C2C2E' : '#EBEBF0';
  const skel = isDark ? '#2C2C2E' : '#E5E5EA';

  if (!isAuthenticated && !authLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: F }}>
        <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} strokeLinecap="round">
          <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
        </svg>
        <p style={{ fontSize: 17, fontWeight: 700, color: txt }}>Sign in to view your wishlist</p>
        <button onClick={() => navigate('/auth')} style={{ background: '#009688', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: bg, minHeight: '100dvh', fontFamily: F }}>
      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: hdr, borderBottom: `1px solid ${bdr}`, padding: '0 16px 12px', paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
          <button onClick={() => navigate(-1 as any)} style={{ width: 34, height: 34, borderRadius: 17, background: inp, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: txt }}>Wishlist</span>
          {wishlistProducts.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 13, color: muted, fontWeight: 600 }}>{wishlistProducts.length} item{wishlistProducts.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '12px 12px 100px' }}>
        {isLoading ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{ background: card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${bdr}` }}>
                <div style={{ aspectRatio: '5/4', background: skel }} />
                <div style={{ padding: '10px 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ width: '75%', height: 11, borderRadius: 4, background: skel }} />
                  <div style={{ width: '45%', height: 9, borderRadius: 4, background: skel }} />
                </div>
              </div>
            ))}
          </div>
        ) : wishlistProducts.length === 0 ? (
          <div style={{ paddingTop: 80, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.2} strokeLinecap="round">
              <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
            </svg>
            <p style={{ fontSize: 18, fontWeight: 700, color: txt }}>Your wishlist is empty</p>
            <p style={{ fontSize: 14, color: muted }}>Save products you love and find them here</p>
            <button onClick={() => navigate('/')} style={{ marginTop: 8, background: '#009688', color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
              Start Shopping
            </button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {wishlistProducts.map((product: any) => {
              const images = Array.isArray(product.images) ? product.images : [product.images];
              const price = parseFloat(product.price ?? '0');
              const costPrice = product.costPrice ? parseFloat(product.costPrice) : null;
              const disc = costPrice && costPrice > price ? Math.round(((costPrice - price) / costPrice) * 100) : 0;

              return (
                <div key={product.id} style={{ background: card, borderRadius: 14, overflow: 'hidden', border: `1px solid ${bdr}`, position: 'relative' }}>
                  <button
                    onClick={() => navigate(`/products/${product.id}`)}
                    style={{ width: '100%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* Image */}
                    <div style={{ aspectRatio: '5/4', position: 'relative', background: skel, overflow: 'hidden' }}>
                      {images[0]
                        ? <img src={images[0]} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} strokeLinecap="round"><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
                          </div>}
                      {disc > 0 && (
                        <div style={{ position: 'absolute', top: 6, left: 6, background: '#EF4444', color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5 }}>
                          {disc}% OFF
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div style={{ padding: '10px 10px 4px' }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: txt, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                        {product.name}
                      </p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: '#009688', marginTop: 4 }}>
                        GH₵ {price.toFixed(2)}
                      </p>
                    </div>
                  </button>
                  {/* Remove button */}
                  <button
                    onClick={() => onRemove(product.id)}
                    style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 8, background: 'rgba(239,68,68,0.15)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}
                  >
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="#EF4444" stroke="none">
                      <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
                    </svg>
                  </button>
                  {/* Add to cart button */}
                  <button
                    onClick={() => navigate(`/products/${product.id}`)}
                    style={{ display: 'block', width: 'calc(100% - 20px)', margin: '8px 10px 10px', height: 36, borderRadius: 9, background: '#009688', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: F }}
                  >
                    View Product
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Wishlist() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { currencySymbol } = useLanguage();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { isMobile } = useMobileDevice();
  const { toast } = useToast();

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

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      const item = wishlist.find(w => w.productId === productId);
      if (!item) return;
      await apiRequest('DELETE', `/api/wishlist/${item.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/wishlist'] });
      toast({ title: 'Removed from wishlist' });
    },
  });

  const isLoading = wishlistLoading || productsLoading;

  if (isMobile) {
    return (
      <MobileWishlistView
        wishlistProducts={wishlistProducts}
        isLoading={isLoading}
        isAuthenticated={isAuthenticated}
        authLoading={authLoading}
        onRemove={(productId) => removeFromWishlistMutation.mutate(productId)}
      />
    );
  }

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
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 gap-y-6">
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
