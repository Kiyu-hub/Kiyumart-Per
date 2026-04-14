import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";

interface ProductCardProps {
  id: string;
  name: string;
  price: number | string;
  costPrice?: number | string;
  currency?: string;
  image: string;
  discount?: number;
  rating?: number | string;
  reviewCount?: number;
  inStock?: boolean;
  isWishlisted?: boolean;
  onToggleWishlist?: (id: string) => void;
  category?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  description?: string;
  dynamicFields?: Record<string, unknown>;
  video?: string;
  deliveryDuration?: string;
}

/**
 * ⚠️ CRITICAL - MANDATORY LAYOUT - DO NOT CHANGE WITHOUT EXPLICIT USER APPROVAL ⚠️
 * 
 * This product card layout is STRICTLY DEFINED and must remain exactly as designed below.
 * Any AI builder or developer modifying this component MUST preserve this exact structure.
 * 
 * REQUIRED LAYOUT (top to bottom):
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 1. Product Image (aspect-[4/3] - horizontal ratio to reduce vertical height)
 *    - Discount badge (top-left corner, red background)
 *    - Wishlist heart button (top-right corner)
 * 
 * 2. Product Name (text-base, font-semibold, line-clamp-2, leading-tight)
 * 
 * 3. Rating Row (Star icon + number + review count)
 *    - Format: ★ 4.8 (124)
 *    - Star: h-4 w-4, filled with primary color
 *    - Rating number: text-sm font-medium
 *    - Review count: text-sm text-muted-foreground
 * 
 * 4. Price Section (strikethrough original + sale price)
 *    - Original price: text-sm, line-through, gray (only if discounted)
 *    - Sale price: text-xl, font-bold, primary color (green)
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 
 * SPACING & PADDING:
 * - Card content padding: p-2.5
 * - Vertical spacing between elements: space-y-1
 * 
 * ⛔ DO NOT:
 * - Reorder elements
 * - Change text sizes without approval
 * - Modify spacing or padding
 * - Remove or alter the image aspect ratio
 * - Change the discount badge or wishlist button positions
 * 
 * This layout ensures consistency across the entire marketplace.
 * All modifications MUST be approved by the product owner.
 */
export default function ProductCard({
  id,
  name,
  price,
  costPrice,
  currency = "GHS",
  image,
  discount = 0,
  rating = 0,
  reviewCount = 0,
  inStock = true,
  isWishlisted: initialWishlisted = false,
  onToggleWishlist,
  category,
  categoryName,
  categoryId,
  description,
  dynamicFields,
  video,
  deliveryDuration,
}: ProductCardProps) {
  const [location, navigate] = useLocation();
  const [localWishlisted, setLocalWishlisted] = useState(initialWishlisted);
  const { formatPrice } = useLanguage();

  useEffect(() => {
    setLocalWishlisted(initialWishlisted);
  }, [initialWishlisted]);

  const isWishlisted = onToggleWishlist ? initialWishlisted : localWishlisted;

  const sellingPrice = typeof price === 'string' ? parseFloat(price) : price;
  const originalPrice = costPrice ? (typeof costPrice === 'string' ? parseFloat(costPrice) : costPrice) : null;
  const ratingNum = typeof rating === 'string' ? parseFloat(rating) : rating;
  
  // Determine final discount to display:
  // - Prefer explicit `discount` prop if provided (> 0)
  // - Otherwise compute from originalPrice and sellingPrice when possible
  const discountProp = typeof discount === 'string' ? parseFloat(discount) : discount || 0;
  const computedDiscount = originalPrice && originalPrice > sellingPrice
    ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100)
    : 0;
  const actualDiscount = discountProp > 0 ? Math.round(discountProp) : computedDiscount;

  // If no originalPrice was provided but we have a discount number (from admin),
  // infer an original price for display so the strike-through can show (rounded to 2 decimals).
  const inferredOriginalPrice = (!originalPrice && actualDiscount > 0 && actualDiscount < 100)
    ? Math.round((sellingPrice / (1 - (actualDiscount / 100))) * 100) / 100
    : null;
  const displayOriginalPrice = originalPrice ?? inferredOriginalPrice;

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleWishlist) {
      onToggleWishlist(id);
      return;
    }
    setLocalWishlisted(!isWishlisted);
  };

  const handleCardClick = () => {
    queryClient.setQueryData(["/api/products", id], (current: any) => current ?? ({
      id,
      name,
      description,
      price: String(price),
      costPrice: costPrice != null ? String(costPrice) : undefined,
      discount: actualDiscount,
      category: category ?? null,
      categoryName: categoryName ?? null,
      categoryId: categoryId ?? null,
      images: image ? [image] : [],
      video,
      ratings: String(ratingNum || 0),
      totalRatings: Number(reviewCount || 0),
      stock: inStock ? 1 : 0,
      deliveryDuration,
      dynamicFields,
      isActive: true,
    }));
    navigate(`/product/${id}?from=${encodeURIComponent(location)}`);
  };

  const prefetchProductDetails = () => {
    queryClient.prefetchQuery({
      queryKey: ["/api/products", id],
      queryFn: async () => fetchSameOriginJson(`/api/products/${id}`),
      staleTime: 60 * 1000,
    });
    queryClient.prefetchQuery({
      queryKey: ["/api/products", id, "variants"],
      queryFn: async () => fetchSameOriginJson(`/api/products/${id}/variants`),
      staleTime: 60 * 1000,
    });
  };

  return (
    <Card 
      className={"group overflow-hidden hover-elevate transition-all duration-300 cursor-pointer " + (import.meta.env.DEV ? 'outline outline-1 outline-muted/30' : '')}
      onClick={handleCardClick}
      onMouseEnter={prefetchProductDetails}
      onFocus={prefetchProductDetails}
      data-testid={`card-product-${id}`}
    >
      {/* Product Image Container - DO NOT MODIFY ASPECT RATIO */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-muted/20 via-background to-muted/35">
        <img
          src={image}
          alt={name}
          className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-[1.04]"
          data-testid={`img-product-${id}`}
        />
        {actualDiscount > 0 && (
          <Badge 
            className="absolute top-2 left-2 bg-red-600 text-white z-10 font-semibold text-xs px-2 py-0.5 shadow-sm"
            data-testid={`badge-discount-${id}`}
          >
            {actualDiscount}% OFF
          </Badge>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={`absolute top-2 right-2 bg-background/80 backdrop-blur-sm hover:bg-background ${
            isWishlisted ? "text-destructive" : ""
          }`}
          onClick={handleWishlistToggle}
          data-testid={`button-wishlist-${id}`}
        >
          <Heart className={`h-4 w-4 ${isWishlisted ? "fill-current" : ""}`} />
        </Button>
        {!inStock && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Badge variant="secondary" data-testid={`badge-out-of-stock-${id}`}>
              Out of Stock
            </Badge>
          </div>
        )}
      </div>

      {/* Product Info Section - DO NOT REORDER ELEMENTS */}
      <div className="p-2 space-y-1">
        {/* Product Name */}
        <h3 
          className="font-semibold text-[12px] line-clamp-2 leading-tight"
          data-testid={`text-product-name-${id}`}
        >
          {name}
        </h3>

        {/* Rating Row - Star Icon + Number + (Review Count) */}
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-primary text-primary" />
          <span className="text-[11px] font-medium" data-testid={`text-rating-${id}`}>
            {ratingNum.toFixed(1)}
          </span>
          <span className="text-[11px] text-muted-foreground" data-testid={`text-reviews-${id}`}>
            ({reviewCount})
          </span>
        </div>

        {/* Price Row - Original Price (struck) + Sale Price (green) */}
        <div className="flex items-baseline gap-2">
          {displayOriginalPrice && displayOriginalPrice > sellingPrice && (
            <span 
              className="text-sm text-gray-500 dark:text-gray-400 line-through"
              data-testid={`text-cost-price-${id}`}
            >
              {formatPrice(displayOriginalPrice)}
            </span>
          )}
          <span 
            className="text-sm font-bold text-primary"
            data-testid={`text-selling-price-${id}`}
          >
            {formatPrice(sellingPrice)}
          </span>
        </div>
      </div>
    </Card>
  );
}
