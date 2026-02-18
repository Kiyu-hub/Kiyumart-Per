import { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Heart, ShoppingCart, Star, ArrowLeft, Minus, Plus, X, ChevronLeft, ChevronRight, Play, Check, Truck, Shield, RotateCcw } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import ProductCard from "@/components/ProductCard";
import UserAvatar from "@/components/UserAvatar";
import { PriceDisplay } from "@/components/PriceDisplay";
import AdBanner from "@/components/AdBanner";
import ProductPageAd from "@/pages/ProductPageAd";
import type { PlatformSettings } from "@shared/schema";

interface Product {
  id: string;
  name: string;
  description?: string;
  price: string;
  costPrice?: string;
  discount?: number;
  category: string;
  images: string[];
  video?: string;
  ratings: string;
  totalRatings: number;
  stock: number;
  deliveryDuration?: string;
  isActive: boolean;
}

interface WishlistItem {
  id: string;
  userId: string;
  productId: string;
  createdAt: string;
}

interface Review {
  id: string;
  productId: string;
  userId: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  userName: string;
  profileImage: string | null;
}

interface ProductVariant {
  id: string;
  productId: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  image: string | null;
  stock: number;
  priceAdjustment: string;
}

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { currencySymbol, formatPrice } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const reviewsRef = useRef<HTMLDivElement>(null);

  const productId = params?.id || "";

  // ─── Data Fetching ───────────────────────────────────────
  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}`);
      if (!res.ok) throw new Error("Product not found");
      return res.json();
    },
  });

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated,
  });

  const { data: cartItems = [] } = useQuery<{ id: string; productId: string; quantity: number }[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/products", productId, "reviews"],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/reviews`);
      if (!res.ok) throw new Error("Failed to fetch reviews");
      return res.json();
    },
    enabled: !!productId,
  });

  const { data: variants = [] } = useQuery<ProductVariant[]>({
    queryKey: ["/api/products", productId, "variants"],
    queryFn: async () => {
      const res = await fetch(`/api/products/${productId}/variants`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId,
  });

  const { data: platformSettings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
  });

  const { data: relatedProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    // Select related products using a scoring function (category + name token overlap + price proximity + tags)
    select: (products) => {
      if (!product) return [];

      const normalizeTokens = (s: string) =>
        (s || '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(Boolean);

      const baseTokens = new Set(normalizeTokens(product.name || ''));

      const candidates = products.filter((p) => p.id !== product.id);

      const scored = candidates.map((p) => {
        let score = 0;

        // Strong boost for same category
        if (p.category === product.category) score += 100;

        // Name token overlap
        const pTokens = normalizeTokens(p.name || '');
        const overlap = pTokens.reduce((acc, tok) => acc + (baseTokens.has(tok) ? 1 : 0), 0);
        score += overlap * 12; // each matching token is valuable

        // Tag overlap (defensive - tags may not exist)
        try {
          const pTags = (p as any).tags || [];
          const prodTags = (product as any).tags || [];
          if (Array.isArray(pTags) && Array.isArray(prodTags)) {
            const tagOverlap = pTags.filter((t: string) => prodTags.includes(t)).length;
            score += tagOverlap * 8;
          }
        } catch (e) {
          /* ignore */
        }

        // Price proximity bonus (closer price -> slightly more relevant)
        try {
          const pPrice = Math.abs(parseFloat(String(p.price)) || 0);
          const prodPrice = Math.abs(parseFloat(String(product.price)) || 0);
          if (prodPrice > 0) {
            const rel = Math.abs(pPrice - prodPrice) / prodPrice;
            if (rel < 0.1) score += 6;
            else if (rel < 0.25) score += 3;
          }
        } catch (e) {
          /* ignore */
        }

        // Small boost for higher ratings (used as tie-breaker)
        score += (parseFloat(String(p.ratings)) || 0) * 0.1;

        return { product: p, score };
      });

      // Sort by computed score, then by totalRatings
      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return (b.product.totalRatings || 0) - (a.product.totalRatings || 0);
      });

      // Take top 5 related products
      const top = scored.map(s => s.product).slice(0, 5);

      // If fewer than 5, fill with top-rated products (excluding current and already selected)
      if (top.length < 5) {
        const fill = products
          .filter(p => p.id !== product.id && !top.find(tp => tp.id === p.id))
          .sort((a, b) => (b.totalRatings || 0) - (a.totalRatings || 0))
          .slice(0, 5 - top.length);
        return top.concat(fill);
      }

      return top;
    },
    enabled: !!product,
  });

  // ─── Derived State ──────────────────────────────────────
  const isWishlisted = wishlist.some(item => item.productId === productId);
  const cartItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Get all available variants
  const availableVariants = variants.filter(v => v.stock > 0);

  // Selected variant (either explicitly selected or first available)
  const selectedVariant = selectedVariantId
    ? variants.find(v => v.id === selectedVariantId) || null
    : availableVariants[0] || null;

  // Auto-select first available variant if none selected
  useEffect(() => {
    if (!selectedVariantId && availableVariants.length > 0) {
      setSelectedVariantId(availableVariants[0].id);
    }
  }, [selectedVariantId, availableVariants]);

  const availableStock = product ? (selectedVariant
    ? selectedVariant.stock
    : variants.length > 0
      ? (availableVariants.length > 0 ? availableVariants[0].stock : product.stock)
      : product.stock) : 0;

  useEffect(() => {
    if (quantity > availableStock && availableStock > 0) {
      setQuantity(availableStock);
    } else if (availableStock === 0 && quantity !== 1) {
      setQuantity(1);
    }
  }, [availableStock, quantity]);

  // ─── Mutations ──────────────────────────────────────────
  const addToCartMutation = useMutation({
    mutationFn: async ({ productId, quantity, variantId, selectedColor, selectedSize, selectedImageIndex }: { 
      productId: string; 
      quantity: number;
      variantId?: string;
      selectedColor?: string;
      selectedSize?: string;
      selectedImageIndex?: number;
    }) => {
      const res = await apiRequest("POST", "/api/cart", { 
        productId, quantity, variantId, selectedColor, selectedSize, selectedImageIndex
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
      toast({
        title: "Added to cart",
        description: `${quantity} item(s) added to your cart`,
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

  const addToWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      const res = await apiRequest("POST", "/api/wishlist", { productId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Added to wishlist", description: "Product has been added to your wishlist" });
    },
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      await apiRequest("DELETE", `/api/wishlist/${productId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      toast({ title: "Removed from wishlist", description: "Product has been removed from your wishlist" });
    },
  });

  // ─── Handlers ───────────────────────────────────────────
  const handleToggleWishlist = () => {
    if (!isAuthenticated) { navigate("/auth"); return; }
    if (isWishlisted) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) { navigate("/auth"); return; }
    addToCartMutation.mutate({ 
      productId, quantity,
      variantId: selectedVariant?.id,
      selectedColor: selectedVariant?.color || undefined,
      selectedSize: selectedVariant?.size || undefined,
      selectedImageIndex: selectedImage
    });
  };

  const scrollReviews = (direction: "left" | "right") => {
    if (reviewsRef.current) {
      const scrollAmount = 340;
      reviewsRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
    }
  };

  // ─── Loading State ──────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 animate-pulse">
            <div className="space-y-4">
              <div className="aspect-[4/5] bg-muted rounded-2xl" />
              <div className="flex gap-3">
                {[1,2,3,4].map(i => <div key={i} className="w-20 h-20 bg-muted rounded-xl" />)}
              </div>
            </div>
            <div className="space-y-6 pt-4">
              <div className="h-5 w-24 bg-muted rounded-full" />
              <div className="h-10 w-3/4 bg-muted rounded-lg" />
              <div className="h-6 w-32 bg-muted rounded-lg" />
              <div className="h-12 w-48 bg-muted rounded-lg" />
              <div className="space-y-3">
                <div className="h-4 w-full bg-muted rounded" />
                <div className="h-4 w-5/6 bg-muted rounded" />
                <div className="h-4 w-2/3 bg-muted rounded" />
              </div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="w-24 h-24 mx-auto rounded-full bg-muted flex items-center justify-center">
              <ShoppingCart className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Product Not Found</h2>
            <p className="text-muted-foreground max-w-sm">The product you're looking for doesn't exist or has been removed.</p>
            <Button onClick={() => navigate("/")} size="lg" className="rounded-full px-8" data-testid="button-back-home">
              Back to Home
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const sellingPrice = parseFloat(product.price);
  const originalPrice = product.costPrice ? parseFloat(product.costPrice) : null;
  const calculatedDiscount = originalPrice && originalPrice > sellingPrice
    ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
    : 0;
  const discount = calculatedDiscount > 0 ? calculatedDiscount : (product.discount || 0);
  const rating = parseFloat(product.ratings) || 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>

      <Header
        cartItemsCount={cartItemsCount}
        onCartClick={() => isAuthenticated ? navigate("/cart") : navigate("/auth")}
      />

      <main className="flex-1">
        {/* Breadcrumb / Back */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
          <button
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
            <span>Back to Products</span>
          </button>
        </div>

        {/* ═══════ HERO PRODUCT SECTION ═══════ */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12">

            {/* ── Left: Image Gallery ── */}
            <div className="flex flex-col space-y-4">
              {/* Main Image Container - Professional Design */}
              <div className="relative group">
                <div
                  className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-muted/20 to-muted/40 cursor-zoom-in shadow-2xl border border-border/20 backdrop-blur-sm"
                  onClick={() => setIsImageExpanded(true)}
                  style={{
                    boxSizing: 'border-box',
                    aspectRatio: '4/3',
                    maxHeight: '450px',
                    minHeight: '320px'
                  }}
                >
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <img
                      src={selectedVariant?.image || product.images[selectedImage] || product.images[0]}
                      alt={selectedVariant ? `${product.name} - ${selectedVariant.color || ''} ${selectedVariant.size || ''}`.trim() : `${product.name} ${selectedImage + 1}`}
                      className="max-w-full max-h-full w-auto h-auto object-contain transition-all duration-500 ease-out group-hover:scale-105"
                      style={{ boxSizing: 'border-box' }}
                      data-testid="img-product-main"
                    />
                  </div>

                  {/* Discount Badge - Enhanced */}
                  {discount > 0 && (
                    <div
                      className="absolute top-6 left-6 px-5 py-3 rounded-2xl text-base font-bold text-white z-10 shadow-lg"
                      style={{
                        background: 'rgba(220, 38, 38, 0.9)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        boxSizing: 'border-box'
                      }}
                      data-testid="badge-discount"
                    >
                      -{discount}% OFF
                    </div>
                  )}

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-all duration-300 rounded-3xl" />

                  {/* Zoom Indicator */}
                  <div className="absolute bottom-6 right-6 w-12 h-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Variant Thumbnails - Professional Design */}
              {variants.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center px-2">
                  {variants.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => setSelectedVariantId(variant.id)}
                      className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-300 ring-offset-2 ring-offset-background shadow-md hover:shadow-lg
                        ${selectedVariantId === variant.id
                          ? 'ring-3 ring-primary scale-110 shadow-xl bg-primary/5'
                          : 'ring-2 ring-border/50 hover:ring-primary/70 hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      style={{ boxSizing: 'border-box' }}
                      data-testid={`variant-thumbnail-${variant.id}`}
                    >
                      <img
                        src={variant.image || product?.images[0] || '/placeholder-product.jpg'}
                        alt={`${product?.name} - ${variant.color || ''} ${variant.size || ''}`.trim()}
                        className="w-full h-full object-cover"
                      />
                      {selectedVariantId === variant.id && (
                        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      )}
                      {/* Variant Info Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 text-center">
                        {variant.color && variant.size ? `${variant.color}/${variant.size}` :
                         variant.color ? variant.color :
                         variant.size ? variant.size : 'Variant'}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Product Image Thumbnails - Fallback when no variants */}
              {variants.length === 0 && (product.images.length > 1 || product.video) && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center px-2">
                  {product.images.map((image, idx) => (
                    <button
                      key={`img-${idx}`}
                      onClick={() => {
                        setSelectedImage(idx);
                        setSelectedVariantId(""); // Deselect variant when selecting product image
                      }}
                      className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-300 ring-offset-2 ring-offset-background shadow-md hover:shadow-lg
                        ${selectedImage === idx
                          ? 'ring-3 ring-primary scale-110 shadow-xl bg-primary/5'
                          : 'ring-2 ring-border/50 hover:ring-primary/70 hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      style={{ boxSizing: 'border-box' }}
                      data-testid={`img-thumbnail-${idx}`}
                    >
                      <img src={image} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                      {selectedImage === idx && (
                        <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  ))}

                  {/* Video Thumbnail */}
                  {product.video && (
                    <button
                      onClick={() => {
                        const el = document.getElementById('product-video-section');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden ring-2 ring-border/50 hover:ring-primary/70 hover:scale-105 transition-all duration-300 shadow-md hover:shadow-lg bg-muted/50"
                      style={{ boxSizing: 'border-box' }}
                      data-testid="thumbnail-video"
                    >
                      <video className="w-full h-full object-cover" muted>
                        <source src={product.video} type="video/mp4" />
                      </video>
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-8 h-8 bg-white/95 rounded-full flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Video Section - Professional Layout */}
              {product.video && (
                <div id="product-video-section" className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Play className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">Product Video</h3>
                      <p className="text-sm text-muted-foreground">Watch this video for details, fit, and quality up close</p>
                    </div>
                  </div>
                  <div className="rounded-2xl overflow-hidden bg-black shadow-2xl border border-border/20">
                    <video controls className="w-full aspect-video" data-testid="video-product">
                      <source src={product.video} type="video/mp4" />
                    </video>
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Product Info ── */}
            <div 
              className={`flex flex-col space-y-4 p-6 rounded-2xl ${
                platformSettings?.isMultiVendor 
                  ? 'mv-glass-card' 
                  : 'bg-card border border-border shadow-sm'
              }`} 
              style={{ boxSizing: 'border-box' }}
            >
              {/* Category Badge */}
              <div>
                <Badge 
                  variant="secondary" 
                  className="rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wider"
                  data-testid="badge-category"
                >
                  {product.category}
                </Badge>
              </div>

              {/* Title */}
              <h1 
                className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-tight"
                data-testid="text-product-name"
              >
                {product.name}
              </h1>

              {/* Rating */}
              {rating > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-4 w-4 transition-colors ${
                          i < Math.round(rating) 
                            ? "fill-amber-400 text-amber-400" 
                            : "fill-muted text-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-medium" data-testid="text-rating">{rating.toFixed(1)}</span>
                  <span className="text-sm text-muted-foreground" data-testid="text-reviews">
                    ({product.totalRatings} {product.totalRatings === 1 ? 'review' : 'reviews'})
                  </span>
                </div>
              )}

              {/* Price Block */}
              <div className="flex items-baseline gap-3">
                <span 
                  className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent"
                  data-testid="text-selling-price"
                >
                  {formatPrice(sellingPrice)}
                </span>
                {originalPrice && originalPrice > sellingPrice && (
                  <span 
                    className="text-lg text-muted-foreground line-through"
                    data-testid="text-cost-price"
                  >
                    {formatPrice(originalPrice)}
                  </span>
                )}
                {discount > 0 && (
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-2 py-1 rounded-full">
                    Save {discount}%
                  </span>
                )}
              </div>

              {/* Delivery Duration */}
              {product.deliveryDuration && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Truck className="w-4 h-4" />
                  <span>
                    {(() => {
                      const durationMatch = product.deliveryDuration?.match(/(\d+)/);
                      const days = durationMatch ? parseInt(durationMatch[1]) : 1;
                      const deliveryDate = new Date();
                      deliveryDate.setDate(deliveryDate.getDate() + days);
                      return `Expected delivery: ${deliveryDate.toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}`;
                    })()}
                  </span>
                </div>
              )}

              {/* Description - Reverted from collapsible */}
              {product.description && (
                <div className="space-y-1">
                  <h3 className="text-sm font-medium text-muted-foreground">Product Details</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-description">
                    {product.description}
                  </p>
                </div>
              )}

              {/* ── Variants ── */}
              {variants.length > 0 && (
                <div className="space-y-3" style={{ boxSizing: 'border-box' }}>
                  {/* Stock & Selection guidance */}
                  <div className="space-y-2">
                    {/* Stock display */}
                    <p className="text-sm font-medium" data-testid="text-stock">
                      {availableStock > 0
                        ? <span className="text-green-600 dark:text-green-400">{availableStock} in stock</span>
                        : <span className="text-destructive">Out of stock</span>
                      }
                    </p>

                    {/* Selection guidance */}
                    {variants.length > 0 && !selectedVariant && (
                      <p className="text-sm text-amber-600 dark:text-amber-400 font-medium" data-testid="text-selection-required">
                        Please select a variant to continue
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* ── Quantity & Actions ── */}
              <div className="space-y-4 pt-1" style={{ boxSizing: 'border-box' }}>
                {/* Quantity Selector */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Qty</span>
                  <div className="flex items-center rounded-xl border-2 border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-all duration-200 disabled:opacity-40 hover:scale-105"
                      style={{ boxSizing: 'border-box' }}
                      data-testid="button-decrease-quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-14 text-center font-bold tabular-nums text-base" data-testid="text-quantity">{quantity}</span>
                    <button
                      onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                      disabled={quantity >= availableStock}
                      className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-all duration-200 disabled:opacity-40 hover:scale-105"
                      style={{ boxSizing: 'border-box' }}
                      data-testid="button-increase-quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-sm text-muted-foreground font-medium">({availableStock} available)</span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    size="lg"
                    onClick={handleAddToCart}
                    disabled={!product.isActive || availableStock === 0 || addToCartMutation.isPending}
                    className={`flex-1 h-14 rounded-xl text-base font-bold transition-all duration-300 shadow-xl hover:shadow-2xl
                      ${addedToCart 
                        ? 'bg-green-600 hover:bg-green-600 text-white scale-105' 
                        : 'hover:scale-[1.02] active:scale-[0.98] bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary'
                      }`}
                    style={{ boxSizing: 'border-box' }}
                    data-testid="button-add-to-cart"
                  >
                    {addedToCart ? (
                      <>
                        <Check className="h-5 w-5 mr-2" />
                        Added!
                      </>
                    ) : availableStock === 0 ? (
                      "Out of Stock"
                    ) : (
                      <>
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        Add to Cart
                      </>
                    )}
                  </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleToggleWishlist}
                    className={`h-14 w-14 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 shadow-lg hover:shadow-xl border-2
                      ${isWishlisted ? 'border-red-300 bg-red-50 dark:bg-red-950/30 text-red-500 hover:text-red-600 hover:border-red-400' : 'hover:border-primary/50'}`}
                    style={{ boxSizing: 'border-box' }}
                    data-testid="button-wishlist"
                  >
                    <Heart className={`h-6 w-6 transition-all ${isWishlisted ? 'fill-current scale-110' : ''}`} />
                  </Button>
                </div>

                {/* Product page ad placement */}
                <ProductPageAd />
              </div>

              {/* Trust Indicators - Compact */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/50" style={{ boxSizing: 'border-box' }}>
                <div className="group flex flex-col items-center text-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-all duration-300 hover:scale-105" style={{ boxSizing: 'border-box' }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Fast Delivery</span>
                  <span className="text-xs text-muted-foreground">2-3 days</span>
                </div>
                <div className="group flex flex-col items-center text-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-all duration-300 hover:scale-105" style={{ boxSizing: 'border-box' }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Secure Payment</span>
                  <span className="text-xs text-muted-foreground">SSL encrypted</span>
                </div>
                <div className="group flex flex-col items-center text-center gap-2 p-3 rounded-xl hover:bg-muted/50 transition-all duration-300 hover:scale-105" style={{ boxSizing: 'border-box' }}>
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                    <RotateCcw className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">Easy Returns</span>
                  <span className="text-xs text-muted-foreground">30-day policy</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════ REVIEWS CAROUSEL ═══════ */}
        {reviews.length > 0 && (
          <section className="py-16 border-t bg-muted/20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight" data-testid="heading-reviews">
                    Customer Reviews
                  </h2>
                  <p className="text-muted-foreground mt-1">{reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}</p>
                </div>
                {reviews.length > 2 && (
                  <div className="hidden sm:flex gap-2">
                    <button
                      onClick={() => scrollReviews("left")}
                      className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center hover:bg-muted transition-colors hover:scale-105"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => scrollReviews("right")}
                      className="w-10 h-10 rounded-full border-2 border-border flex items-center justify-center hover:bg-muted transition-colors hover:scale-105"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Horizontal scrollable review cards */}
              <div
                ref={reviewsRef}
                className="flex gap-5 overflow-x-auto pb-4 snap-x snap-mandatory scrollbar-hide"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
              >
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="flex-shrink-0 w-[320px] snap-start"
                    data-testid={`review-${review.id}`}
                  >
                    <div className={`h-full p-6 rounded-2xl space-y-4 ${
                      platformSettings?.isMultiVendor 
                        ? 'mv-glass-card' 
                        : 'bg-background border shadow-sm hover:shadow-md transition-shadow duration-300'
                    }`}>
                      {/* Stars */}
                      <div className="flex gap-1" data-testid={`review-rating-${review.id}`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            className={`h-4 w-4 ${
                              i < review.rating ? "fill-amber-400 text-amber-400" : "fill-muted text-muted"
                            }`}
                          />
                        ))}
                      </div>

                      {/* Comment */}
                      {review.comment && (
                        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4" data-testid={`review-comment-${review.id}`}>
                          "{review.comment}"
                        </p>
                      )}

                      {/* Author */}
                      <div className="flex items-center gap-3 pt-2 border-t">
                        <UserAvatar
                          profileImage={review.profileImage}
                          name={review.userName}
                          size="md"
                        />
                        <div>
                          <p className="text-sm font-semibold" data-testid={`review-name-${review.id}`}>
                            {review.userName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(review.createdAt).toLocaleDateString('en-US', { 
                              year: 'numeric', month: 'short', day: 'numeric' 
                            })}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ═══════ RELATED PRODUCTS ═══════ */}
        {relatedProducts.length > 0 && (
          <section className="py-16 border-t">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-8" data-testid="heading-related">
                You May Also Like
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5 gap-4 gap-y-6 lg:gap-6">
                {relatedProducts.map((relatedProduct) => (
                  <ProductCard
                    key={relatedProduct.id}
                    id={relatedProduct.id}
                    name={relatedProduct.name}
                    price={parseFloat(relatedProduct.price)}
                    costPrice={relatedProduct.costPrice ? parseFloat(relatedProduct.costPrice) : undefined}
                    image={relatedProduct.images[0] || ''}
                    discount={relatedProduct.costPrice && parseFloat(relatedProduct.costPrice) > parseFloat(relatedProduct.price) ? Math.round(((parseFloat(relatedProduct.costPrice) - parseFloat(relatedProduct.price)) / parseFloat(relatedProduct.costPrice)) * 100) : 0}
                    rating={parseFloat(relatedProduct.ratings) || 0}
                    reviewCount={relatedProduct.totalRatings || 0}
                    inStock={(relatedProduct.stock || 0) > 0}
                  />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>

      <Footer />

      {/* ═══════ STICKY MOBILE CART BAR ═══════ */}
      <div 
        className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
        style={{
          background: 'rgba(var(--background), 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="font-bold text-lg truncate">{formatPrice(sellingPrice)}</p>
            {originalPrice && originalPrice > sellingPrice && (
              <p className="text-xs text-muted-foreground line-through">{formatPrice(originalPrice)}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleToggleWishlist}
            className={`h-12 w-12 rounded-full flex-shrink-0 ${isWishlisted ? 'text-red-500 border-red-300' : ''}`}
          >
            <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} />
          </Button>
          <Button
            size="lg"
            onClick={handleAddToCart}
            disabled={!product.isActive || availableStock === 0 || addToCartMutation.isPending}
            className={`h-12 rounded-full px-8 font-semibold transition-all duration-300 flex-shrink-0
              ${addedToCart ? 'bg-green-600 hover:bg-green-600' : ''}`}
          >
            {addedToCart ? (
              <><Check className="h-5 w-5 mr-1" /> Added</>
            ) : availableStock === 0 ? (
              "Sold Out"
            ) : (
              <><ShoppingCart className="h-5 w-5 mr-1" /> Add to Cart</>
            )}
          </Button>
        </div>
      </div>

      {/* Bottom spacer for mobile sticky bar */}
      <div className="h-20 lg:hidden" />

      {/* ═══════ IMAGE EXPANSION MODAL ═══════ */}
      {isImageExpanded && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={() => setIsImageExpanded(false)}
          data-testid="modal-image-expanded"
          style={{ boxSizing: 'border-box' }}
        >
          {/* Backdrop with glassmorphism */}
          <div 
            className="absolute inset-0"
            style={{
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              boxSizing: 'border-box'
            }}
          />

          {/* Discount Badge - Positioned on viewport for visibility */}
          {discount > 0 && (
            <div
              className="fixed top-6 left-6 sm:top-8 sm:left-8 px-3 py-2 sm:px-6 sm:py-3 rounded-full text-sm sm:text-lg font-bold text-white z-50 shadow-lg"
              style={{
                background: 'rgba(220, 38, 38, 0.9)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxSizing: 'border-box'
              }}
              data-testid="badge-discount-expanded"
            >
              -{discount}% OFF
            </div>
          )}

          <div className="relative w-full max-w-5xl max-h-[90vh] mx-4 flex items-center justify-center" onClick={(e) => e.stopPropagation()} style={{ boxSizing: 'border-box' }}>
            {/* Close Button - Larger touch target */}
            <button
              onClick={() => setIsImageExpanded(false)}
              className="absolute -top-16 right-0 w-14 h-14 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10 touch-manipulation"
              data-testid="button-close-expanded"
              style={{ boxSizing: 'border-box' }}
            >
              <X className="h-7 w-7 text-white" />
            </button>

            {/* Main expanded image */}
            <div className="rounded-2xl overflow-hidden bg-background max-w-full h-[65vh] flex flex-col" style={{ boxSizing: 'border-box' }}>
              <div className="flex-1 w-full flex items-center justify-center p-4" style={{ boxSizing: 'border-box' }}>
                <img
                  src={selectedVariant?.image || product.images[selectedImage] || product.images[0]}
                  alt={selectedVariant ? `${product.name} - ${selectedVariant.color || ''} ${selectedVariant.size || ''}`.trim() : product.name}
                  className="max-w-full max-h-full w-auto h-auto object-contain"
                  style={{ boxSizing: 'border-box', maxHeight: 'calc(65vh - 120px)' }}
                  data-testid="img-expanded"
                />
              </div>

              {/* Variant Thumbnails in Expanded Modal - Moved up */}
              {variants.length > 0 && (
                <div className="px-8 pb-4 bg-background/95 backdrop-blur-sm" style={{ boxSizing: 'border-box' }}>
                  <div className="flex gap-3 overflow-x-auto justify-center scrollbar-hide">
                    {variants.map((variant) => (
                      <button
                        key={variant.id}
                        onClick={() => setSelectedVariantId(variant.id)}
                        className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-200 touch-manipulation
                          ${selectedVariantId === variant.id
                            ? 'ring-3 ring-primary scale-105 shadow-lg'
                            : 'ring-2 ring-border opacity-80 hover:opacity-100 hover:scale-105'
                          }`}
                        style={{ boxSizing: 'border-box' }}
                        data-testid={`variant-expanded-thumbnail-${variant.id}`}
                      >
                        <img
                          src={variant.image || product.images[0] || '/placeholder-product.jpg'}
                          alt={`${product.name} - ${variant.color || ''} ${variant.size || ''}`.trim()}
                          className="w-full h-full object-cover"
                        />
                        {/* Variant Info Overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 text-center">
                          {variant.color && variant.size ? `${variant.color}/${variant.size}` :
                           variant.color ? variant.color :
                           variant.size ? variant.size : 'Variant'}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Image Thumbnails in Expanded Modal - Fallback - Moved up */}
              {variants.length === 0 && product.images.length > 1 && (
                <div className="px-8 pb-4 bg-background/95 backdrop-blur-sm" style={{ boxSizing: 'border-box' }}>
                  <div className="flex gap-3 overflow-x-auto justify-center scrollbar-hide">
                    {product.images.map((image, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(idx)}
                        className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-200 touch-manipulation
                          ${selectedImage === idx
                            ? 'ring-3 ring-primary scale-105 shadow-lg'
                            : 'ring-2 ring-border opacity-80 hover:opacity-100 hover:scale-105'
                          }`}
                        style={{ boxSizing: 'border-box' }}
                        data-testid={`img-expanded-thumbnail-${idx}`}
                      >
                        <img src={image} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation arrows for variants */}
            {variants.length > 0 && variants.length > 1 && (
              <>
                <button
                  onClick={() => {
                    const currentIndex = variants.findIndex(v => v.id === selectedVariantId);
                    const prevIndex = (currentIndex - 1 + variants.length) % variants.length;
                    setSelectedVariantId(variants[prevIndex].id);
                  }}
                  className="absolute left-6 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-prev-variant"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={() => {
                    const currentIndex = variants.findIndex(v => v.id === selectedVariantId);
                    const nextIndex = (currentIndex + 1) % variants.length;
                    setSelectedVariantId(variants[nextIndex].id);
                  }}
                  className="absolute right-6 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-next-variant"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              </>
            )}

            {/* Navigation arrows for product images - fallback */}
            {variants.length === 0 && product.images.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedImage((selectedImage - 1 + product.images.length) % product.images.length)}
                  className="absolute left-6 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-prev-image"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={() => setSelectedImage((selectedImage + 1) % product.images.length)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-next-image"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              </>
            )}

            {/* Swipe indicators for variants */}
            {variants.length > 0 && variants.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 sm:hidden">
                {variants.map((variant) => (
                  <div
                    key={variant.id}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      selectedVariantId === variant.id ? 'bg-white scale-125' : 'bg-white/40'
                    }`}
                    style={{ boxSizing: 'border-box' }}
                  />
                ))}
              </div>
            )}

            {/* Swipe indicators for product images - fallback */}
            {variants.length === 0 && product.images.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 sm:hidden">
                {product.images.map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      selectedImage === idx ? 'bg-white scale-125' : 'bg-white/40'
                    }`}
                    style={{ boxSizing: 'border-box' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
