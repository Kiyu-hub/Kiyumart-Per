import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Heart, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { enhanceCloudinaryThumb } from "@/lib/imageEnhance";

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

const TEAL = '#009688';
const RED  = '#EF4444';

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
  const { isMobile, isTablet } = useMobileDevice();

  useEffect(() => {
    setLocalWishlisted(initialWishlisted);
  }, [initialWishlisted]);

  const isWishlisted = onToggleWishlist ? initialWishlisted : localWishlisted;

  const sellingPrice   = typeof price === 'string' ? parseFloat(price) : price;
  const originalPrice  = costPrice ? (typeof costPrice === 'string' ? parseFloat(costPrice) : costPrice) : null;
  const ratingNum      = typeof rating === 'string' ? parseFloat(rating) : rating;

  const discountProp     = typeof discount === 'string' ? parseFloat(discount as any) : discount || 0;
  const computedDiscount = originalPrice && originalPrice > sellingPrice
    ? Math.round(((originalPrice - sellingPrice) / originalPrice) * 100) : 0;
  // Show discount from either the explicit field OR computed from costPrice vs price
  const actualDiscount   = discountProp > 0 ? Math.round(discountProp) : computedDiscount;

  // Prefer real original price; infer from discount % if missing
  const inferredOriginalPrice = (!originalPrice && actualDiscount > 0 && actualDiscount < 100)
    ? Math.round((sellingPrice / (1 - actualDiscount / 100)) * 100) / 100 : null;
  const displayOriginalPrice = originalPrice ?? inferredOriginalPrice;

  const handleWishlistToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleWishlist) { onToggleWishlist(id); return; }
    setLocalWishlisted(v => !v);
  };

  const handleCardClick = () => {
    queryClient.setQueryData(["/api/products", id], (current: any) => current ?? ({
      id, name, description,
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
      staleTime: 60_000,
    });
  };

  // ── Mobile card — image top, info section below ──────────────────────────
  if (isMobile || isTablet) {
    const origPrice = displayOriginalPrice && displayOriginalPrice > sellingPrice
      ? (typeof displayOriginalPrice === 'number' ? displayOriginalPrice : parseFloat(String(displayOriginalPrice)))
      : null;
    const soldCount = reviewCount ?? 0;

    return (
      <div
        onClick={handleCardClick}
        onTouchStart={prefetchProductDetails}
        data-testid={`card-product-${id}`}
        style={{
          borderRadius: 12, overflow: 'hidden', background: '#1C1C1E',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Image section */}
        <div style={{ position: 'relative', aspectRatio: '1', background: '#2C2C2E' }}>
          {image
            ? <img src={enhanceCloudinaryThumb(image, 640)} alt={name} loading="lazy" style={{
                width: '100%', height: '100%', objectFit: 'cover', display: 'block',
              }} />
            : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                <svg width={32} height={32} viewBox="0 0 24 24" fill="none"
                  stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/>
                </svg>
              </div>}

          {/* Discount badge — top-left */}
          {actualDiscount > 0 && (
            <div data-testid={`badge-discount-${id}`} style={{
              position: 'absolute', top: 7, left: 7,
              background: RED, color: '#fff',
              fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, letterSpacing: 0.3,
            }}>
              {actualDiscount}% OFF
            </div>
          )}

          {/* Wishlist — top-right rounded square */}
          <button onClick={handleWishlistToggle} data-testid={`button-wishlist-${id}`} style={{
            position: 'absolute', top: 7, right: 7,
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center',
            WebkitTapHighlightColor: 'transparent',
          }}>
            <svg width={13} height={13} viewBox="0 0 24 24"
              fill={isWishlisted ? RED : 'none'}
              stroke={isWishlisted ? RED : 'rgba(255,255,255,0.9)'}
              strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
            </svg>
          </button>

          {/* Out-of-stock overlay */}
          {!inStock && (
            <div style={{
              position: 'absolute', inset: 0,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{
                background: 'rgba(255,255,255,0.15)', color: '#fff',
                fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 5,
              }}>Out of Stock</span>
            </div>
          )}
        </div>

        {/* Info section */}
        <div style={{ padding: '5px 7px 7px' }}>
          <div data-testid={`text-product-name-${id}`} style={{
            fontSize: 11, fontWeight: 600, color: '#fff', lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 2,
          }}>
            {name}
          </div>

          {/* Rating + sold — always on same row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
            <svg width={10} height={10} viewBox="0 0 24 24" fill={TEAL} stroke="none">
              <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z"/>
            </svg>
            <span data-testid={`text-rating-${id}`}
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
              {ratingNum.toFixed(1)}
            </span>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>·</span>
            <span data-testid={`text-reviews-${id}`}
              style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>
              {soldCount.toLocaleString()} sold
            </span>
          </div>

          {/* Price row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
            {origPrice && (
              <span data-testid={`text-cost-price-${id}`}
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textDecoration: 'line-through' }}>
                GH₵{origPrice.toFixed(2)}
              </span>
            )}
            <span data-testid={`text-selling-price-${id}`}
              style={{ fontSize: 12, fontWeight: 800, color: '#00BFA5', letterSpacing: -0.3 }}>
              GH₵{sellingPrice.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Desktop card ──────────────────────────────────────────────────────────
  return (
    <Card
      className={"group overflow-hidden hover-elevate transition-all duration-300 cursor-pointer " + (import.meta.env.DEV ? 'outline outline-1 outline-muted/30' : '')}
      onClick={handleCardClick}
      onMouseEnter={prefetchProductDetails}
      onFocus={prefetchProductDetails}
      data-testid={`card-product-${id}`}
    >
      <div className="relative aspect-square overflow-hidden bg-gradient-to-br from-muted/20 via-background to-muted/35">
        <img
          src={enhanceCloudinaryThumb(image, 640)}
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
          className={`absolute top-2 right-2 bg-background/80 backdrop-blur-sm hover:bg-background ${isWishlisted ? "text-destructive" : ""}`}
          onClick={handleWishlistToggle}
          data-testid={`button-wishlist-${id}`}
        >
          <Heart className={`h-4 w-4 ${isWishlisted ? "fill-current" : ""}`} />
        </Button>
        {!inStock && (
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
            <Badge variant="secondary" data-testid={`badge-out-of-stock-${id}`}>Out of Stock</Badge>
          </div>
        )}
      </div>

      <div className="p-2.5 space-y-1">
        <h3 className="font-semibold text-[12px] line-clamp-2 leading-tight"
          data-testid={`text-product-name-${id}`}>{name}</h3>
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3 fill-primary text-primary" />
          <span className="text-[11px] font-medium" data-testid={`text-rating-${id}`}>{ratingNum.toFixed(1)}</span>
          <span className="text-[11px] text-muted-foreground" data-testid={`text-reviews-${id}`}>({reviewCount})</span>
        </div>
        <div className="flex items-baseline gap-2">
          {displayOriginalPrice && displayOriginalPrice > sellingPrice && (
            <span className="text-sm text-gray-500 dark:text-gray-400 line-through"
              data-testid={`text-cost-price-${id}`}>{formatPrice(displayOriginalPrice)}</span>
          )}
          <span className="text-sm font-bold text-primary"
            data-testid={`text-selling-price-${id}`}>{formatPrice(sellingPrice)}</span>
        </div>
      </div>
    </Card>
  );
}
