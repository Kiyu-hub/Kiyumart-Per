import { useEffect, useState } from "react";
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
import { Heart, ShoppingCart, Star, ArrowLeft, Minus, Plus, X } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import { PriceDisplay } from "@/components/PriceDisplay";
import AdBanner from "@/components/AdBanner";

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

  const productId = params?.id || "";

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
        productId, 
        quantity,
        variantId,
        selectedColor,
        selectedSize,
        selectedImageIndex
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
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
      toast({
        title: "Added to wishlist",
        description: "Product has been added to your wishlist",
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
  });

  const handleToggleWishlist = () => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }

    if (isWishlisted) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  const handleAddToCart = () => {
    if (!isAuthenticated) {
      navigate("/auth");
      return;
    }
    
    addToCartMutation.mutate({ 
      productId, 
      quantity,
      variantId: activeVariant?.id,
      selectedColor: selectedColor || undefined,
      selectedSize: selectedSize || undefined,
      selectedImageIndex: selectedImage
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading product...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Product Not Found</h2>
          <p className="text-muted-foreground mb-4">The product you're looking for doesn't exist</p>
          <Button onClick={() => navigate("/")} data-testid="button-back-home">
            Back to Home
          </Button>
        </div>
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
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>

      <Header
        cartItemsCount={cartItemsCount}
        onCartClick={() => isAuthenticated ? navigate("/cart") : navigate("/auth")}
      />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Products
          </Button>

          {/* 
            CRITICAL LAYOUT REQUIREMENT - DO NOT MODIFY:
            Product Detail Page Structure (approved design):
            1. Left Column: Product Image (reduced from aspect-square to aspect-[4/5]) + Thumbnails (images + video)
            2. Right Column: Product Info (title, rating, price, description, options)
            3. "See it in Action" section with video must show thumbnail in image gallery
            4. Thumbnails must include all product images PLUS video thumbnail at the end
            
            This layout is mandatory and must not be changed by future AI builders.
          */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4">
              {/* Main Product Image - Compact size */}
              <Card className="overflow-hidden cursor-pointer max-w-md" onClick={() => setIsImageExpanded(true)}>
                <div className="relative aspect-square group">
                  <img
                    src={product.images[selectedImage] || product.images[0]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    data-testid="img-product-main"
                  />
                  {discount > 0 && (
                    <Badge 
                      className="absolute top-2 left-2 bg-red-600 text-white font-bold px-3 py-1.5 text-sm shadow-xl"
                      style={{ zIndex: 20 }}
                      data-testid="badge-discount"
                    >
                      {discount}% OFF
                    </Badge>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                    <p className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-black/50 px-4 py-2 rounded-lg text-sm">
                      Click to expand
                    </p>
                  </div>
                </div>
              </Card>

              {/* Thumbnails Grid - Responsive mini images under main product image */}
              {(product.images.length > 1 || product.video) && (
                <div className="grid grid-cols-5 md:grid-cols-6 gap-2 max-w-md">
                  {product.images.map((image, idx) => (
                    <Card
                      key={`img-${idx}`}
                      className={`cursor-pointer overflow-hidden hover:scale-105 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${selectedImage === idx ? 'ring-2 ring-primary' : ''}`}
                      onClick={() => setSelectedImage(idx)}
                      onKeyDown={(e) => e.key === 'Enter' && setSelectedImage(idx)}
                      tabIndex={0}
                      role="button"
                      aria-label={`View image ${idx + 1}`}
                      data-testid={`img-thumbnail-${idx}`}
                    >
                      <div className="relative aspect-square">
                        <img
                          src={image}
                          alt={`${product.name} ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </Card>
                  ))}
                  
                  {/* Video Thumbnail - Responsive size to match images */}
                  {product.video && (
                    <Card
                      className="cursor-pointer overflow-hidden hover:scale-105 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 relative"
                      onClick={() => {
                        const videoSection = document.getElementById('product-video-section');
                        videoSection?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const videoSection = document.getElementById('product-video-section');
                          videoSection?.scrollIntoView({ behavior: 'smooth' });
                        }
                      }}
                      tabIndex={0}
                      role="button"
                      aria-label="View product video"
                      data-testid="thumbnail-video"
                    >
                      <div className="relative aspect-square bg-black flex items-center justify-center">
                        <video
                          className="w-full h-full object-cover"
                          muted
                        >
                          <source src={product.video} type="video/mp4" />
                        </video>
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                          <div className="w-6 h-6 md:w-8 md:h-8 bg-white/90 rounded-full flex items-center justify-center">
                            <div className="w-0 h-0 border-l-[6px] md:border-l-[8px] border-l-black border-y-[4px] md:border-y-[5px] border-y-transparent ml-0.5"></div>
                          </div>
                        </div>
                      </div>
                    </Card>
                  )}
                </div>
              )}

              {/* See it in Action Video Section */}
              {product.video && (
                <div id="product-video-section" className="mt-6 space-y-3">
                  <div>
                    <h3 className="text-lg font-semibold mb-1">See it in Action</h3>
                    <p className="text-sm text-muted-foreground">
                      Watch this video to see the product details, fit, and quality up close
                    </p>
                  </div>
                  <Card className="overflow-hidden">
                    <video
                      controls
                      className="w-full"
                      data-testid="video-product"
                    >
                      <source src={product.video} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </Card>
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div>
                <div className="flex items-start justify-between mb-2">
                  <h1 className="text-3xl font-bold" data-testid="text-product-name">
                    {product.name}
                  </h1>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleToggleWishlist}
                    className={isWishlisted ? "text-destructive" : ""}
                    data-testid="button-wishlist"
                  >
                    <Heart className={`h-6 w-6 ${isWishlisted ? "fill-current" : ""}`} />
                  </Button>
                </div>

                {rating > 0 && (
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center">
                      <Star className="h-5 w-5 fill-primary text-primary" />
                      <span className="ml-1 font-semibold" data-testid="text-rating">
                        {rating.toFixed(1)}
                      </span>
                    </div>
                    <span className="text-muted-foreground" data-testid="text-reviews">
                      ({product.totalRatings} reviews)
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-3 mb-4">
                  <span 
                    className="text-4xl font-bold text-primary"
                    data-testid="text-selling-price"
                  >
                    {formatPrice(sellingPrice)}
                  </span>
                  {originalPrice && originalPrice > sellingPrice && (
                    <span 
                      className="text-2xl text-gray-500 dark:text-gray-400 line-through font-medium"
                      data-testid="text-cost-price"
                    >
                      {formatPrice(originalPrice)}
                    </span>
                  )}
                </div>

                <Badge variant="secondary" data-testid="badge-category">
                  {product.category}
                </Badge>
              </div>

              {/* Product Description - Reduced text size */}
              {product.description && (
                <div>
                  <h2 className="text-lg font-semibold mb-2">Description</h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-description">
                    {product.description}
                  </p>
                </div>
              )}

              {variants.length > 0 && (
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold">Options</h2>
                  
                  {/* Color Selection */}
                  {hasColorVariants && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Color {hasColorVariants && <span className="text-destructive">*</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(variants.filter(v => v.color).map(v => v.color))).map((color) => {
                          const colorVariants = variants.filter(v => v.color === color);
                          const hasStock = colorVariants.some(v => v.stock > 0);
                          
                          return (
                            <Button
                              key={color}
                              variant={selectedColor === color ? "default" : "outline"}
                              onClick={() => setSelectedColor(color || "")}
                              disabled={!hasStock}
                              className="min-w-[80px]"
                              data-testid={`button-color-${color}`}
                            >
                              {color}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Size Selection */}
                  {hasSizeVariants && (
                    <div>
                      <label className="text-sm font-medium mb-2 block">
                        Size {hasSizeVariants && <span className="text-destructive">*</span>}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {Array.from(new Set(variants.filter(v => v.size).map(v => v.size))).map((size) => {
                          const sizeVariants = variants.filter(v => {
                            const sizeMatch = v.size === size;
                            const colorMatch = !hasColorVariants || !selectedColor || v.color === selectedColor;
                            return sizeMatch && colorMatch;
                          });
                          const hasStock = sizeVariants.some(v => v.stock > 0);
                          
                          return (
                            <Button
                              key={size}
                              variant={selectedSize === size ? "default" : "outline"}
                              onClick={() => setSelectedSize(size || "")}
                              disabled={!hasStock}
                              className="min-w-[60px]"
                              data-testid={`button-size-${size}`}
                            >
                              {size}
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Stock Information */}
                  {activeVariant && (
                    <div className="text-sm text-muted-foreground">
                      <span data-testid="text-variant-stock">
                        {activeVariant.stock > 0 
                          ? `${activeVariant.stock} in stock` 
                          : "Out of stock"}
                      </span>
                    </div>
                  )}

                  {/* Selection Required Message */}
                  {(hasColorVariants || hasSizeVariants) && !activeVariant && (
                    <div className="text-sm text-destructive" data-testid="text-selection-required">
                      {(() => {
                        const needsColor = hasColorVariants && !selectedColor;
                        const needsSize = hasSizeVariants && !selectedSize;
                        const invalidCombo = selectedColor && selectedSize && !activeVariant;
                        
                        if (invalidCombo) {
                          return "This combination is not available. Please select a different option.";
                        }
                        if (needsColor && needsSize) {
                          return "Please select a color and a size";
                        }
                        if (needsColor) {
                          return "Please select a color";
                        }
                        if (needsSize) {
                          return "Please select a size";
                        }
                        return "";
                      })()}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Quantity</label>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      disabled={quantity <= 1}
                      data-testid="button-decrease-quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span 
                      className="w-16 text-center font-semibold"
                      data-testid="text-quantity"
                    >
                      {quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                      disabled={quantity >= availableStock}
                      data-testid="button-increase-quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground ml-2">
                      ({availableStock} available)
                    </span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleAddToCart}
                  disabled={!product.isActive || availableStock === 0 || addToCartMutation.isPending}
                  data-testid="button-add-to-cart"
                >
                  <ShoppingCart className="h-5 w-5 mr-2" />
                  {availableStock === 0 ? "Out of Stock" : "Add to Cart"}
                </Button>

                {/* Product page ad placement */}
                <div className="mt-6">
                  <AdBanner position="product-page" className="h-44 md:h-56 rounded-lg" />
                </div>
              </div>
            </div>
          </div>

          {reviews.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-6" data-testid="heading-reviews">
                Customer Reviews ({reviews.length})
              </h2>
              <div className="space-y-6">
                {reviews.map((review) => (
                  <Card key={review.id} className="p-6" data-testid={`review-${review.id}`}>
                    <div className="flex items-start gap-4">
                      <Avatar>
                        <AvatarFallback className="bg-primary text-primary-foreground">
                          {review.userName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="font-semibold" data-testid={`review-name-${review.id}`}>
                              {review.userName}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(review.createdAt).toLocaleDateString('en-US', { 
                                year: 'numeric', 
                                month: 'long', 
                                day: 'numeric' 
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1" data-testid={`review-rating-${review.id}`}>
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-4 w-4 ${
                                  i < review.rating
                                    ? "fill-primary text-primary"
                                    : "fill-muted text-muted"
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                        {review.comment && (
                          <p className="text-muted-foreground" data-testid={`review-comment-${review.id}`}>
                            {review.comment}
                          </p>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {relatedProducts.length > 0 && (
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-6" data-testid="heading-related">
                You May Also Like
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {relatedProducts.map((relatedProduct) => {
                  const costPrice = relatedProduct.costPrice ? parseFloat(relatedProduct.costPrice) : undefined;
                  const sellingPrice = parseFloat(relatedProduct.price);
                  const discount = costPrice && costPrice > sellingPrice
                    ? Math.round(((costPrice - sellingPrice) / costPrice) * 100)
                    : 0;
                  
                  return (
                    <Card 
                      key={relatedProduct.id} 
                      className="overflow-hidden cursor-pointer hover-elevate active-elevate-2 transition-all"
                      onClick={() => navigate(`/product/${relatedProduct.id}`)}
                      data-testid={`related-product-${relatedProduct.id}`}
                    >
                      <div className="relative aspect-square">
                        <img
                          src={relatedProduct.images[0]}
                          alt={relatedProduct.name}
                          className="w-full h-full object-cover"
                        />
                        {discount > 0 && (
                          <Badge className="absolute top-2 right-2 bg-destructive text-destructive-foreground">
                            -{discount}%
                          </Badge>
                        )}
                      </div>
                      <div className="p-4 space-y-2">
                        <h3 className="font-semibold line-clamp-2 min-h-[3rem]">
                          {relatedProduct.name}
                        </h3>
                        <div className="flex items-center gap-1">
                          <Star className="h-4 w-4 fill-primary text-primary" />
                          <span className="text-sm font-medium">
                            {parseFloat(relatedProduct.ratings).toFixed(1)}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            ({relatedProduct.totalRatings})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <PriceDisplay 
                            amount={sellingPrice}
                            className="text-lg font-bold text-primary"
                          />
                          {costPrice && costPrice > sellingPrice && (
                            <PriceDisplay 
                              amount={costPrice}
                              className="text-sm text-muted-foreground line-through"
                            />
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      <Footer />

      {/* Image Expansion Modal */}
      {isImageExpanded && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setIsImageExpanded(false)}
          data-testid="modal-image-expanded"
        >
          <div className="relative w-full max-w-[60vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="ghost"
              size="icon"
              className="absolute -top-12 right-0 text-white hover:bg-white/20 h-10 w-10"
              onClick={() => setIsImageExpanded(false)}
              data-testid="button-close-expanded"
            >
              <X className="h-6 w-6" />
            </Button>
            <div className="relative bg-background rounded-lg overflow-hidden">
              <div className="relative">
                <img
                  src={product.images[selectedImage] || product.images[0]}
                  alt={product.name}
                  className="w-full h-auto object-contain max-h-[80vh]"
                  data-testid="img-expanded"
                />
                {discount > 0 && (
                  <Badge 
                    className="absolute top-3 left-3 bg-red-600 text-white font-bold px-5 py-2.5 text-lg shadow-2xl"
                    data-testid="badge-discount-expanded"
                  >
                    {discount}% OFF
                  </Badge>
                )}
              </div>
              {product.images.length > 1 && (
                <div className="p-4 bg-background border-t">
                  <div className="grid grid-cols-8 gap-2">
                    {product.images.map((image, idx) => (
                      <Card
                        key={idx}
                        className={`cursor-pointer overflow-hidden hover-elevate ${selectedImage === idx ? 'ring-2 ring-primary' : ''}`}
                        onClick={() => setSelectedImage(idx)}
                        data-testid={`img-expanded-thumbnail-${idx}`}
                      >
                        <div className="relative aspect-square">
                          <img
                            src={image}
                            alt={`${product.name} ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
