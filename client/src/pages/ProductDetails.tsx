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
import { PriceDisplay } from "@/components/PriceDisplay";
import AdBanner from "@/components/AdBanner";
import ProductPageAd from "@/pages/ProductPageAd";

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
}

interface ProductVariant {
  id: string;
  productId: string;
  color: string | null;
  size: string | null;
  sku: string | null;
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
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [isImageExpanded, setIsImageExpanded] = useState(false);
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

  const { data: relatedProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
    select: (products) => {
      if (!product) return [];
      return products
        .filter((p) => p.id !== product.id && p.category === product.category)
        .slice(0, 4);
    },
    enabled: !!product,
  });

  // ─── Derived State ──────────────────────────────────────
  const isWishlisted = wishlist.some(item => item.productId === productId);
  const cartItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const hasColorVariants = variants.some(v => v.color);
  const hasSizeVariants = variants.some(v => v.size);

  const activeVariant = (() => {
    if (!variants.length) return null;
    const colorRequired = hasColorVariants;
    const sizeRequired = hasSizeVariants;
    if (colorRequired && !selectedColor) return null;
    if (sizeRequired && !selectedSize) return null;
    return variants.find(v => {
      const colorMatch = !colorRequired || v.color === selectedColor;
      const sizeMatch = !sizeRequired || v.size === selectedSize;
      return colorMatch && sizeMatch;
    }) || null;
  })();

  const availableStock = activeVariant 
    ? activeVariant.stock 
    : (!hasColorVariants && !hasSizeVariants ? (product?.stock || 0) : 0);

  useEffect(() => {
    if (quantity > availableStock && availableStock > 0) {
      setQuantity(availableStock);
    } else if (availableStock === 0 && quantity !== 1) {
      setQuantity(1);
    }
  }, [availableStock, quantity]);

  useEffect(() => {
    if (selectedColor && selectedSize && hasSizeVariants && hasColorVariants) {
      const combination = variants.find(v => v.color === selectedColor && v.size === selectedSize);
      if (!combination || combination.stock === 0) {
        setSelectedSize("");
      }
    }
  }, [selectedColor, hasSizeVariants, hasColorVariants, variants]);

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
      variantId: activeVariant?.id,
      selectedColor: selectedColor || undefined,
      selectedSize: selectedSize || undefined,
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
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
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">

            {/* ── Left: Image Gallery ── */}
            <div className="space-y-4">
              {/* Main Image */}
              <div
                className="relative overflow-hidden rounded-2xl bg-muted/30 cursor-zoom-in group"
                onClick={() => setIsImageExpanded(true)}
              >
                <div className="aspect-[4/5] relative">
                  <img
                    src={product.images[selectedImage] || product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    data-testid="img-product-main"
                  />
                  {/* Discount Badge - Glassmorphism */}
                  {discount > 0 && (
                    <div 
                      className="absolute top-4 left-4 px-4 py-2 rounded-full text-sm font-bold text-white"
                      style={{
                        background: 'rgba(220, 38, 38, 0.85)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                      }}
                      data-testid="badge-discount"
                    >
                      -{discount}% OFF
                    </div>
                  )}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors duration-300" />
                </div>
              </div>

              {/* Thumbnail Strip */}
              {(product.images.length > 1 || product.video) && (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                  {product.images.map((image, idx) => (
                    <button
                      key={`img-${idx}`}
                      onClick={() => setSelectedImage(idx)}
                      className={`relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden transition-all duration-200 ring-offset-2 ring-offset-background
                        ${selectedImage === idx 
                          ? 'ring-2 ring-primary scale-105 shadow-lg' 
                          : 'ring-1 ring-border hover:ring-primary/50 hover:scale-105 opacity-70 hover:opacity-100'
                        }`}
                      data-testid={`img-thumbnail-${idx}`}
                    >
                      <img src={image} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                  
                  {/* Video Thumbnail */}
                  {product.video && (
                    <button
                      onClick={() => {
                        const el = document.getElementById('product-video-section');
                        el?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="relative flex-shrink-0 w-20 h-20 rounded-xl overflow-hidden ring-1 ring-border hover:ring-primary/50 hover:scale-105 transition-all duration-200"
                      data-testid="thumbnail-video"
                    >
                      <video className="w-full h-full object-cover" muted>
                        <source src={product.video} type="video/mp4" />
                      </video>
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-lg">
                          <Play className="w-4 h-4 text-black ml-0.5" fill="currentColor" />
                        </div>
                      </div>
                    </button>
                  )}
                </div>
              )}

              {/* Video Section */}
              {product.video && (
                <div id="product-video-section" className="pt-4 space-y-3">
                  <h3 className="text-lg font-semibold tracking-tight">See it in Action</h3>
                  <p className="text-sm text-muted-foreground">Watch this video for details, fit, and quality up close</p>
                  <div className="rounded-2xl overflow-hidden bg-black">
                    <video controls className="w-full" data-testid="video-product">
                      <source src={product.video} type="video/mp4" />
                    </video>
                  </div>
                </div>
              )}
            </div>

            {/* ── Right: Product Info ── */}
            <div className="space-y-8 lg:sticky lg:top-8 lg:self-start">
              {/* Category Badge */}
              <div>
                <Badge 
                  variant="secondary" 
                  className="rounded-full px-4 py-1 text-xs font-medium uppercase tracking-wider"
                  data-testid="badge-category"
                >
                  {product.category}
                </Badge>
              </div>

              {/* Title */}
              <h1 
                className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.1]"
                data-testid="text-product-name"
              >
                {product.name}
              </h1>

              {/* Rating */}
              {rating > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={`h-5 w-5 transition-colors ${
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
              <div className="flex items-baseline gap-4">
                <span 
                  className="text-4xl sm:text-5xl font-extrabold tracking-tight"
                  data-testid="text-selling-price"
                >
                  {formatPrice(sellingPrice)}
                </span>
                {originalPrice && originalPrice > sellingPrice && (
                  <span 
                    className="text-xl text-muted-foreground line-through"
                    data-testid="text-cost-price"
                  >
                    {formatPrice(originalPrice)}
                  </span>
                )}
                {discount > 0 && (
                  <span className="text-sm font-semibold text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 px-3 py-1 rounded-full">
                    Save {discount}%
                  </span>
                )}
              </div>

              {/* Description */}
              {product.description && (
                <div className="space-y-2">
                  <p className="text-base text-muted-foreground leading-relaxed max-w-lg" data-testid="text-description">
                    {product.description}
                  </p>
                </div>
              )}

              {/* ── Variants ── */}
              {variants.length > 0 && (
                <div className="space-y-6">
                  {/* Color Selection */}
                  {hasColorVariants && (
                    <div className="space-y-3">
                      <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Color {selectedColor && <span className="text-foreground normal-case">— {selectedColor}</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(variants.filter(v => v.color).map(v => v.color))).map((color) => {
                          const colorVariants = variants.filter(v => v.color === color);
                          const hasStock = colorVariants.some(v => v.stock > 0);
                          const isSelected = selectedColor === color;
                          return (
                            <button
                              key={color}
                              onClick={() => setSelectedColor(color || "")}
                              disabled={!hasStock}
                              className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all duration-200 border-2
                                ${isSelected
                                  ? 'border-primary bg-primary text-primary-foreground shadow-lg scale-105'
                                  : 'border-border bg-background hover:border-primary/50 hover:scale-105'
                                }
                                ${!hasStock ? 'opacity-40 cursor-not-allowed line-through' : 'cursor-pointer'}
                              `}
                              data-testid={`button-color-${color}`}
                            >
                              {color}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Size Selection */}
                  {hasSizeVariants && (
                    <div className="space-y-3">
                      <label className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                        Size {selectedSize && <span className="text-foreground normal-case">— {selectedSize}</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(variants.filter(v => v.size).map(v => v.size))).map((size) => {
                          const sizeVariants = variants.filter(v => {
                            const sizeMatch = v.size === size;
                            const colorMatch = !hasColorVariants || !selectedColor || v.color === selectedColor;
                            return sizeMatch && colorMatch;
                          });
                          const hasStock = sizeVariants.some(v => v.stock > 0);
                          const isSelected = selectedSize === size;
                          return (
                            <button
                              key={size}
                              onClick={() => setSelectedSize(size || "")}
                              disabled={!hasStock}
                              className={`w-14 h-14 rounded-xl text-sm font-semibold transition-all duration-200 border-2 flex items-center justify-center
                                ${isSelected
                                  ? 'border-primary bg-primary text-primary-foreground shadow-lg scale-105'
                                  : 'border-border bg-background hover:border-primary/50 hover:scale-105'
                                }
                                ${!hasStock ? 'opacity-40 cursor-not-allowed line-through' : 'cursor-pointer'}
                              `}
                              data-testid={`button-size-${size}`}
                            >
                              {size}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Variant Stock */}
                  {activeVariant && (
                    <p className="text-sm font-medium" data-testid="text-variant-stock">
                      {activeVariant.stock > 0 
                        ? <span className="text-green-600 dark:text-green-400">{activeVariant.stock} in stock</span>
                        : <span className="text-destructive">Out of stock</span>
                      }
                    </p>
                  )}

                  {/* Selection guidance */}
                  {(hasColorVariants || hasSizeVariants) && !activeVariant && (
                    <p className="text-sm text-amber-600 dark:text-amber-400 font-medium" data-testid="text-selection-required">
                      {(() => {
                        const needsColor = hasColorVariants && !selectedColor;
                        const needsSize = hasSizeVariants && !selectedSize;
                        const invalidCombo = selectedColor && selectedSize && !activeVariant;
                        if (invalidCombo) return "This combination is unavailable. Try a different option.";
                        if (needsColor && needsSize) return "Please select a color and size";
                        if (needsColor) return "Please select a color";
                        if (needsSize) return "Please select a size";
                        return "";
                      })()}
                    </p>
                  )}
                </div>
              )}

              {/* ── Quantity & Actions ── */}
              <div className="space-y-4 pt-2">
                {/* Quantity Selector */}
                <div className="flex items-center gap-4">
                  <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Qty</span>
                  <div className="flex items-center rounded-full border-2 border-border overflow-hidden">
                    <button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                      data-testid="button-decrease-quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-12 text-center font-bold tabular-nums" data-testid="text-quantity">{quantity}</span>
                    <button
                      onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                      disabled={quantity >= availableStock}
                      className="w-12 h-12 flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-40"
                      data-testid="button-increase-quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <span className="text-sm text-muted-foreground">({availableStock} available)</span>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    size="lg"
                    onClick={handleAddToCart}
                    disabled={!product.isActive || availableStock === 0 || addToCartMutation.isPending}
                    className={`flex-1 h-14 rounded-full text-base font-semibold transition-all duration-300 shadow-lg hover:shadow-xl
                      ${addedToCart 
                        ? 'bg-green-600 hover:bg-green-600 text-white' 
                        : 'hover:scale-[1.02] active:scale-[0.98]'
                      }`}
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
                    className={`h-14 w-14 rounded-full transition-all duration-300 hover:scale-110 active:scale-95 
                      ${isWishlisted ? 'border-red-300 bg-red-50 dark:bg-red-950/30 text-red-500 hover:text-red-600' : 'hover:border-red-300'}`}
                    data-testid="button-wishlist"
                  >
                    <Heart className={`h-6 w-6 transition-all ${isWishlisted ? 'fill-current scale-110' : ''}`} />
                  </Button>
                </div>

                {/* Product page ad placement */}
                <ProductPageAd />
              </div>

              {/* Trust Indicators */}
              <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Fast Delivery</span>
                </div>
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Secure Payment</span>
                </div>
                <div className="flex flex-col items-center text-center gap-2">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <RotateCcw className="w-5 h-5 text-primary" />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground">Easy Returns</span>
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
                    <div className="h-full p-6 rounded-2xl bg-background border shadow-sm hover:shadow-md transition-shadow duration-300 space-y-4">
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
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                            {review.userName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
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
              <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                {relatedProducts.map((relatedProduct) => {
                  const costPrice = relatedProduct.costPrice ? parseFloat(relatedProduct.costPrice) : undefined;
                  const sp = parseFloat(relatedProduct.price);
                  const d = costPrice && costPrice > sp
                    ? Math.round(((costPrice - sp) / costPrice) * 100)
                    : 0;
                  
                  return (
                    <div
                      key={relatedProduct.id}
                      onClick={() => navigate(`/product/${relatedProduct.id}`)}
                      className="group cursor-pointer"
                      data-testid={`related-product-${relatedProduct.id}`}
                    >
                      <div className="relative overflow-hidden rounded-2xl bg-muted/30 mb-4">
                        <div className="aspect-square">
                          <img
                            src={relatedProduct.images[0]}
                            alt={relatedProduct.name}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                        </div>
                        {d > 0 && (
                          <div 
                            className="absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-bold text-white"
                            style={{ background: 'rgba(220, 38, 38, 0.85)', backdropFilter: 'blur(8px)' }}
                          >
                            -{d}%
                          </div>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                          {relatedProduct.name}
                        </h3>
                        <div className="flex items-center gap-1.5">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                          <span className="text-xs font-medium">{parseFloat(relatedProduct.ratings).toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({relatedProduct.totalRatings})</span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <PriceDisplay amount={sp} className="text-base font-bold" />
                          {costPrice && costPrice > sp && (
                            <PriceDisplay amount={costPrice} className="text-xs text-muted-foreground line-through" />
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
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
        >
          {/* Backdrop with glassmorphism */}
          <div 
            className="absolute inset-0"
            style={{
              background: 'rgba(0, 0, 0, 0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            }}
          />

          <div className="relative w-full max-w-4xl max-h-[90vh] mx-4" onClick={(e) => e.stopPropagation()}>
            {/* Close Button */}
            <button
              onClick={() => setIsImageExpanded(false)}
              className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
              data-testid="button-close-expanded"
            >
              <X className="h-5 w-5 text-white" />
            </button>

            {/* Main expanded image */}
            <div className="rounded-2xl overflow-hidden bg-background">
              <div className="relative">
                <img
                  src={product.images[selectedImage] || product.images[0]}
                  alt={product.name}
                  className="w-full h-auto object-contain max-h-[75vh]"
                  data-testid="img-expanded"
                />
                {discount > 0 && (
                  <div 
                    className="absolute top-4 left-4 px-5 py-2.5 rounded-full text-base font-bold text-white"
                    style={{ background: 'rgba(220, 38, 38, 0.85)', backdropFilter: 'blur(12px)' }}
                    data-testid="badge-discount-expanded"
                  >
                    -{discount}% OFF
                  </div>
                )}
              </div>

              {/* Thumbnails in modal */}
              {product.images.length > 1 && (
                <div className="p-4 border-t bg-background">
                  <div className="flex gap-2 overflow-x-auto justify-center">
                    {product.images.map((image, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(idx)}
                        className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden transition-all duration-200 
                          ${selectedImage === idx 
                            ? 'ring-2 ring-primary scale-105' 
                            : 'ring-1 ring-border opacity-60 hover:opacity-100'
                          }`}
                        data-testid={`img-expanded-thumbnail-${idx}`}
                      >
                        <img src={image} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Navigation arrows */}
            {product.images.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedImage((selectedImage - 1 + product.images.length) % product.images.length)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>
                <button
                  onClick={() => setSelectedImage((selectedImage + 1) % product.images.length)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
                >
                  <ChevronRight className="w-6 h-6 text-white" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
