import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOriginJson, fetchSameOrigin, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { getCurrentSellingPrice, getOriginalDisplayPrice } from "@/lib/pricing";
import Product3DViewer, { canShow3DViewer } from "@/components/Product3DViewer";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';

interface Product {
  id: string;
  name: string;
  description?: string;
  price: string;
  costPrice?: string;
  discount?: number;
  sellerId: string;
  storeId?: string | null;
  images: string[];
  video?: string;
  ratings: string;
  totalRatings: number;
  stock: number;
  deliveryDuration?: string;
  dynamicFields?: Record<string, unknown>;
  isActive: boolean;
  category?: string | null;
  categoryName?: string | null;
}

interface ProductVariant {
  id: string;
  productId: string;
  color: string | null;
  size: string | null;
  sku: string | null;
  images?: string[] | null;
  image: string | null;
  stock: number;
  priceAdjustment: string;
}

interface WishlistItem { id: string; userId: string; productId: string; createdAt: string; }

const VARIANT_COLOR_PRESETS: Record<string, string> = {
  red: "#dc2626", blue: "#2563eb", green: "#16a34a", yellow: "#eab308",
  orange: "#f97316", pink: "#ec4899", purple: "#9333ea", black: "#111827",
  white: "#f8fafc", brown: "#92400e", grey: "#6b7280", gray: "#6b7280",
  maroon: "#7f1d1d", nude: "#d6a77a", gold: "#ca8a04", silver: "#94a3b8",
  cream: "#f5f5dc", beige: "#d6c3a5",
};

const resolveColorSwatch = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) return "#14b8a6";
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  const token = raw.split(/[,\s/]+/).find(Boolean)?.toLowerCase() || "";
  return VARIANT_COLOR_PRESETS[token] || "#14b8a6";
};

const splitSizes = (v?: string | null) =>
  String(v || "").split(",").map(s => s.trim()).filter(Boolean);

const getVariantImages = (v?: ProductVariant | null) => {
  if (Array.isArray(v?.images) && v.images.length > 0) return v.images.filter(Boolean);
  if (v?.image) return [v.image];
  return [];
};

async function apiJson<T>(method: string, url: string, data?: unknown): Promise<T> {
  return fetchSameOriginJson<T>(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
}

export default function MobileProductDetails() {
  const [, params] = useRoute("/product/:id");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, ensureAuthenticated } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useLanguage();

  const productId = params?.id || "";
  const sourceRef = useRef(new URLSearchParams(location.split("?")[1] || "").get("from") || "");

  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const read = () => {
      const s = localStorage.getItem("theme");
      setIsDark(s ? s === "dark" : document.documentElement.classList.contains("dark"));
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const bg    = isDark ? "#111111" : "#F2F2F7";
  const card  = isDark ? "#1C1C1E" : "#FFFFFF";
  const hdr   = isDark ? "#111111" : "#FFFFFF";
  const bdr   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)";
  const txt   = isDark ? "#FFFFFF" : "#111111";
  const muted = isDark ? "rgba(235,235,245,0.45)" : "rgba(60,60,67,0.45)";
  const inp   = isDark ? "#2C2C2E" : "#EBEBF0";
  const accent = "#22C55E";

  // ── State ─────────────────────────────────────────────────
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [selectedSizeOption, setSelectedSizeOption] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [wishlistOptimistic, setWishlistOptimistic] = useState<boolean | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);

  // touch swipe for carousel
  const touchStartX = useRef(0);

  // ── Queries ───────────────────────────────────────────────
  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: () => fetchSameOriginJson(`/api/products/${productId}`, { cache: "no-store" }),
    enabled: !!productId,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: variants = [] } = useQuery<ProductVariant[]>({
    queryKey: ["/api/products", productId, "variants"],
    queryFn: async () => {
      const res = await fetchSameOrigin(`/api/products/${productId}/variants`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId && !!product,
  });

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated,
  });

  const { data: cartItems = [] } = useQuery<any[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated && !!product,
    queryFn: () => fetchSameOriginJson("/api/cart", { cache: "no-store" }),
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: relatedProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", "active", "mobile-related", productId],
    queryFn: async () => {
      const res = await fetchSameOrigin("/api/products?isActive=true");
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!product?.id,
    select: (products) => {
      if (!product) return [];
      const others = products.filter(p => p.id !== product.id);
      const sameCategory = others.filter(p =>
        p.category === product.category || p.categoryName === product.categoryName
      );
      return (sameCategory.length >= 4 ? sameCategory : [...sameCategory, ...others.filter(p => !sameCategory.includes(p))]).slice(0, 8);
    },
  });

  // ── Derived variant state ─────────────────────────────────
  const availableVariants = variants.filter(v => v.stock > 0);

  const colorGroups = Array.from(
    availableVariants.reduce((map, v) => {
      const color = String(v.color || "").trim();
      if (!color) return map;
      const key = color.toLowerCase();
      const cur = map.get(key) || { id: v.id, color, variants: [] as ProductVariant[], images: [] as string[], sizes: [] as string[], stock: 0 };
      cur.variants.push(v);
      cur.images = Array.from(new Set([...cur.images, ...getVariantImages(v)]));
      cur.sizes = Array.from(new Set([...cur.sizes, ...splitSizes(v.size)]));
      cur.stock += Number(v.stock || 0);
      map.set(key, cur);
      return map;
    }, new Map<string, { id: string; color: string; variants: ProductVariant[]; images: string[]; sizes: string[]; stock: number }>())
    .values(),
  );

  const selectedVariantBase = selectedVariantId
    ? variants.find(v => v.id === selectedVariantId) || null
    : availableVariants[0] || null;

  const selectedColorGroup = selectedVariantBase
    ? colorGroups.find(g => g.variants.some(v => v.id === selectedVariantBase.id)) || null
    : colorGroups[0] || null;

  const selectedColor = String(selectedColorGroup?.color || selectedVariantBase?.color || "").trim();

  const sizeOptions = Array.from(new Set(
    (selectedColorGroup?.sizes?.length
      ? selectedColorGroup.sizes
      : variants.filter(v => !selectedColor || String(v.color || "").trim().toLowerCase() === selectedColor.toLowerCase())
          .flatMap(v => splitSizes(v.size))
    ).filter(Boolean)
  ));

  const selectedSize = selectedSizeOption || sizeOptions[0] || splitSizes(selectedVariantBase?.size)[0] || "";

  const selectedVariant =
    selectedColorGroup?.variants.find(v => splitSizes(v.size).some(s => s.toLowerCase() === selectedSize.toLowerCase()))
    || selectedVariantBase
    || selectedColorGroup?.variants[0]
    || availableVariants[0]
    || null;

  const availableStock = product
    ? selectedVariant
      ? selectedVariant.stock
      : selectedColorGroup
        ? selectedColorGroup.stock
        : variants.length > 0
          ? (availableVariants.length > 0 ? availableVariants[0].stock : product.stock)
          : product.stock
    : 0;

  const variantImages = selectedColorGroup?.images?.length
    ? selectedColorGroup.images
    : getVariantImages(selectedVariant);
  const productImages = Array.isArray(product?.images) ? product.images : [];
  const galleryImages = variantImages.length > 0 ? variantImages : productImages;

  // 3D / AR visibility — platform-wide kill switch + food vendor exclusion.
  // Cross-references the actual store record so legacy products without a
  // storeType field can still be correctly identified as food and locked out.
  const _platform3D = usePlatformSettings();
  const { data: _3dStoreCheck } = useQuery<any | null>({
    queryKey: ["/api/stores", (product as any)?.storeId, "3d-check"],
    queryFn: async () => {
      const sid = (product as any)?.storeId;
      if (!sid) return null;
      const r = await fetch(`/api/stores/${sid}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!(product as any)?.storeId,
    staleTime: 5 * 60_000,
  });
  const _isFoodVendor =
    (product as any)?.storeType === "food_beverages" ||
    (product as any)?.storeType === "restaurant" ||
    _3dStoreCheck?.businessType === "restaurant" ||
    _3dStoreCheck?.businessType === "local_vendor" ||
    _3dStoreCheck?.storeType === "food_beverages" ||
    _3dStoreCheck?.storeType === "restaurant" ||
    _3dStoreCheck?.merchantCategory === "QUICK_EATS";
  const show3DAR = _platform3D.enable3DAR && !_isFoodVendor;

  const cartQuantityForSelection = cartItems.reduce((sum, item) => {
    if (String(item.productId) !== productId) return sum;
    if (selectedVariant?.id) {
      const sv = String(item.variantId || "");
      const sc = String(item.selectedColor || "").toLowerCase();
      const ss = String(item.selectedSize || "").toLowerCase();
      if (sv === selectedVariant.id && (!selectedColor || sc === selectedColor.toLowerCase()) && (!selectedSize || ss === selectedSize.toLowerCase())) {
        return sum + Number(item.quantity || 0);
      }
      return sum;
    }
    return sum + Number(item.quantity || 0);
  }, 0);

  const remainingToAdd = Math.max(availableStock - cartQuantityForSelection, 0);
  const allInCart = availableStock > 0 && remainingToAdd === 0;

  const serverWishlisted = wishlist.some(w => w.productId === productId);
  const isWishlisted = wishlistOptimistic ?? serverWishlisted;

  const sellingPrice = product
    ? getCurrentSellingPrice({ price: product.price, costPrice: product.costPrice ?? null, discount: product.discount ?? null })
    : 0;
  const originalPrice = product
    ? getOriginalDisplayPrice({ price: product.price, costPrice: product.costPrice ?? null, discount: product.discount ?? null })
    : null;

  // ── Effects ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedVariantId && availableVariants.length > 0) {
      setSelectedVariantId(availableVariants[0].id);
    }
  }, [selectedVariantId, availableVariants.length]);

  useEffect(() => {
    if (!sizeOptions.length) { setSelectedSizeOption(""); return; }
    if (!selectedSizeOption || !sizeOptions.some(s => s.toLowerCase() === selectedSizeOption.toLowerCase())) {
      setSelectedSizeOption(sizeOptions[0]);
    }
  }, [sizeOptions.join(",")]);

  useEffect(() => { setSelectedImage(0); }, [selectedVariantId, selectedColor]);
  useEffect(() => { setWishlistOptimistic(null); }, [productId, serverWishlisted]);

  useEffect(() => {
    if (quantity > remainingToAdd && remainingToAdd > 0) setQuantity(remainingToAdd);
    else if (remainingToAdd === 0 && quantity !== 1) setQuantity(1);
  }, [remainingToAdd]);

  // ── Mutations ─────────────────────────────────────────────
  const addToCartMutation = useMutation({
    mutationFn: (payload: { productId: string; quantity: number; variantId?: string; selectedColor?: string; selectedSize?: string; selectedImageIndex?: number }) =>
      apiJson("POST", "/api/cart", payload),
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: ["/api/cart"] });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
      toast({ title: "Added to cart", description: `${quantity} item(s) added to your cart` });
    },
    onError: (error: any) => {
      const msg = String(error?.message || "");
      toast({
        title: "Error",
        description: /only\s+\d+|out of stock|maximum available/i.test(msg)
          ? "This option isn't available in that quantity."
          : msg || "Could not add to cart",
        variant: "destructive",
      });
    },
  });

  const addToWishlistMutation = useMutation({
    mutationFn: (id: string) => apiJson("POST", "/api/wishlist", { productId: id }),
    onMutate: () => setWishlistOptimistic(true),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }); toast({ title: "Added to wishlist" }); },
    onError: () => { setWishlistOptimistic(null); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (id: string) => apiJson("DELETE", `/api/wishlist/${id}`),
    onMutate: () => setWishlistOptimistic(false),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }); toast({ title: "Removed from wishlist" }); },
    onError: () => setWishlistOptimistic(null),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] }),
  });

  // ── Handlers ──────────────────────────────────────────────
  const handleColorSelect = (color: string) => {
    const grp = colorGroups.find(g => g.color.toLowerCase() === color.toLowerCase());
    const v = grp?.variants.find(v => {
      const sz = splitSizes(v.size).map(s => s.toLowerCase());
      return !selectedSize || sz.includes(selectedSize.toLowerCase());
    }) || grp?.variants[0];
    if (v) {
      setSelectedVariantId(v.id);
      const nextSizes = grp?.sizes || splitSizes(v.size);
      const preserved = nextSizes.find(s => s.toLowerCase() === selectedSize.toLowerCase());
      setSelectedSizeOption(preserved || nextSizes[0] || "");
      setSelectedImage(0);
    }
  };

  const handleSizeSelect = (size: string) => {
    const v = variants.find(v => {
      const vc = String(v.color || "").toLowerCase();
      const vs = splitSizes(v.size).map(s => s.toLowerCase());
      return vs.includes(size.toLowerCase()) && (!selectedColor || vc === selectedColor.toLowerCase());
    }) || variants.find(v => splitSizes(v.size).map(s => s.toLowerCase()).includes(size.toLowerCase()));
    if (v) setSelectedVariantId(v.id);
    setSelectedSizeOption(size);
  };

  const handleAddToCart = async () => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) { navigate("/auth"); return; }
    const isOwn = user?.role === "seller" && String(product?.sellerId) === String(user?.id);
    if (isOwn) { toast({ title: "Own product", description: "You cannot buy your own product", variant: "destructive" }); return; }
    if (allInCart) { toast({ title: "Already in cart at max quantity" }); return; }
    const qty = remainingToAdd > 0 ? Math.min(Math.max(1, quantity), remainingToAdd) : Math.max(1, quantity);
    addToCartMutation.mutate({
      productId,
      quantity: qty,
      variantId: selectedVariant?.id,
      selectedColor: selectedColor || undefined,
      selectedSize: selectedSize || undefined,
      selectedImageIndex: selectedImage,
    });
  };

  const handleWishlist = async () => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) { navigate("/auth"); return; }
    if (isWishlisted) removeFromWishlistMutation.mutate(productId);
    else addToWishlistMutation.mutate(productId);
  };

  const handleBack = () => {
    const from = sourceRef.current;
    if (from) { navigate(from); return; }
    if (typeof window !== 'undefined' && window.history.length > 1) window.history.back();
    else navigate('/');
  };

  // ── Loading / Error ───────────────────────────────────────
  if (isLoading || !product) {
    return (
      <div style={{ minHeight: "100dvh", background: bg, fontFamily: F, display: "flex", flexDirection: "column" }}>
        <div style={{ height: 56, background: hdr, borderBottom: `1px solid ${bdr}` }} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 36, height: 36, borderRadius: 12, border: `3px solid ${accent}`, borderTopColor: "transparent", animation: "spin 0.8s linear infinite" }} />
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const descText = String(product.description || "").trim();
  const shortDesc = descText.length > 160 ? descText.slice(0, 160) + "…" : descText;
  const rating = parseFloat(String(product.ratings || "0")) || 0;
  const starsDisplay = Array.from({ length: 5 }, (_, i) => i < Math.round(rating));

  return (
    <div style={{ minHeight: "100dvh", background: bg, fontFamily: F, paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>

      {/* Header */}
      <div style={{
        position: "sticky", top: 0, zIndex: 30, background: hdr,
        borderBottom: `1px solid ${bdr}`,
        paddingLeft: 16, paddingRight: 16, paddingBottom: 12,
        paddingTop: "max(14px, env(safe-area-inset-top, 14px))",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button onClick={handleBack} style={{ width: 34, height: 34, borderRadius: 17, background: inp, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: txt, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {product.name}
        </span>
        <button onClick={handleWishlist} style={{ width: 34, height: 34, borderRadius: 17, background: inp, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill={isWishlisted ? "#ef4444" : "none"} stroke={isWishlisted ? "#ef4444" : muted} strokeWidth={2} strokeLinecap="round">
            <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z" />
          </svg>
        </button>
      </div>

      {/* Image Carousel */}
      <div style={{ position: "relative", background: card }}>
        <div
          style={{ width: "100%", aspectRatio: "1/1", overflow: "hidden", userSelect: "none" }}
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 40) {
              if (dx < 0 && selectedImage < galleryImages.length - 1) setSelectedImage(i => i + 1);
              if (dx > 0 && selectedImage > 0) setSelectedImage(i => i - 1);
            }
          }}
        >
          {galleryImages.length > 0 ? (
            <img
              src={galleryImages[selectedImage] || galleryImages[0]}
              alt={product.name}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: inp, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
            </div>
          )}
        </div>

        {/* Dot indicators */}
        {galleryImages.length > 1 && (
          <div style={{ position: "absolute", bottom: 12, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 5 }}>
            {galleryImages.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedImage(i)}
                style={{
                  width: i === selectedImage ? 16 : 6, height: 6, borderRadius: 3,
                  background: i === selectedImage ? accent : "rgba(255,255,255,0.6)",
                  border: "none", cursor: "pointer", padding: 0,
                  transition: "width 0.2s, background 0.2s",
                }}
              />
            ))}
          </div>
        )}

        {/* Thumbnail strip */}
        {galleryImages.length > 1 && (
          <div style={{ display: "flex", gap: 6, padding: "8px 12px", overflowX: "auto", background: card }}>
            {galleryImages.map((img, i) => (
              <button
                key={i}
                onClick={() => setSelectedImage(i)}
                style={{
                  width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0,
                  border: `2px solid ${i === selectedImage ? accent : bdr}`, cursor: "pointer", background: "none", padding: 0,
                  transition: "border-color 0.15s",
                }}
              >
                <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3D / AR product viewer launcher.
          Hidden when the platform 3D/AR toggle is off OR the product belongs to a food store. */}
      {show3DAR && canShow3DViewer({
        modelUrl: (product as any).modelUrl,
        modelUrlIos: (product as any).modelUrlIos,
        modelPoster: (product as any).modelPoster,
        productImages: productImages,
      }) ? (
        <div style={{ margin: "8px 12px 0", display: "flex", justifyContent: "center" }}>
          <Product3DViewer
            asLauncher
            modelUrl={(product as any).modelUrl}
            modelUrlIos={(product as any).modelUrlIos}
            modelPoster={(product as any).modelPoster}
            productName={product.name}
            productImages={productImages}
          />
        </div>
      ) : null}

      {/* Product Info Card */}
      <div style={{ margin: "10px 12px 0", background: card, borderRadius: 12, padding: "14px 14px 4px", border: `1px solid ${bdr}` }}>
        {/* Name */}
        <h1 style={{ fontSize: 18, fontWeight: 700, color: txt, margin: "0 0 6px", lineHeight: 1.3 }}>{product.name}</h1>

        {/* Ratings */}
        {rating > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 2 }}>
              {starsDisplay.map((filled, i) => (
                <svg key={i} width={12} height={12} viewBox="0 0 24 24" fill={filled ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth={1.5}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
              ))}
            </div>
            <span style={{ fontSize: 12, color: muted }}>{rating.toFixed(1)} ({product.totalRatings})</span>
          </div>
        )}

        {/* Price */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: accent }}>{formatPrice(sellingPrice)}</span>
          {originalPrice && originalPrice > sellingPrice && (
            <span style={{ fontSize: 15, color: muted, textDecoration: "line-through" }}>{formatPrice(originalPrice)}</span>
          )}
          {product.discount && product.discount > 0 && (
            <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#ef4444", borderRadius: 6, padding: "2px 6px" }}>
              -{product.discount}%
            </span>
          )}
        </div>

        {/* Stock */}
        <div style={{ marginBottom: 12 }}>
          {availableStock > 0 ? (
            <span style={{ fontSize: 12, color: availableStock <= 5 ? "#f97316" : accent, fontWeight: 600 }}>
              {availableStock <= 5 ? `Only ${availableStock} left` : "In Stock"}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>Out of Stock</span>
          )}
        </div>
      </div>

      {/* Variants */}
      {(colorGroups.length > 0 || sizeOptions.length > 0) && (
        <div style={{ margin: "10px 12px 0", background: card, borderRadius: 12, padding: 14, border: `1px solid ${bdr}` }}>
          {/* Colors */}
          {colorGroups.length > 0 && (
            <div style={{ marginBottom: sizeOptions.length > 0 ? 16 : 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginBottom: 8 }}>
                Color: <span style={{ color: txt }}>{selectedColor || "Select"}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {colorGroups.map(g => {
                  const isSelected = g.color.toLowerCase() === selectedColor.toLowerCase();
                  const swatch = resolveColorSwatch(g.color);
                  return (
                    <button
                      key={g.color}
                      onClick={() => handleColorSelect(g.color)}
                      title={g.color}
                      style={{
                        width: 30, height: 30, borderRadius: 15, border: `2.5px solid ${isSelected ? accent : bdr}`,
                        background: swatch, cursor: "pointer", padding: 0,
                        boxShadow: isSelected ? `0 0 0 2px ${bg}, 0 0 0 4px ${accent}` : "none",
                        transition: "box-shadow 0.15s",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Sizes */}
          {sizeOptions.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: muted, marginBottom: 8 }}>
                Size: <span style={{ color: txt }}>{selectedSize || "Select"}</span>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {sizeOptions.map(size => {
                  const isSelected = size.toLowerCase() === selectedSize.toLowerCase();
                  return (
                    <button
                      key={size}
                      onClick={() => handleSizeSelect(size)}
                      style={{
                        padding: "6px 14px", borderRadius: 8,
                        border: `1.5px solid ${isSelected ? accent : bdr}`,
                        background: isSelected ? accent : inp,
                        color: isSelected ? "#fff" : txt,
                        fontSize: 13, fontWeight: isSelected ? 700 : 500,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                    >
                      {size}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Description */}
      {descText.length > 0 && (
        <div style={{ margin: "10px 12px 0", background: card, borderRadius: 12, padding: 14, border: `1px solid ${bdr}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 6 }}>Description</div>
          <p style={{ fontSize: 13, color: muted, lineHeight: 1.6, margin: 0, whiteSpace: "pre-line" }}>
            {showFullDesc ? descText : shortDesc}
          </p>
          {descText.length > 160 && (
            <button
              onClick={() => setShowFullDesc(v => !v)}
              style={{ fontSize: 13, color: accent, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: "6px 0 0", WebkitTapHighlightColor: "transparent" }}
            >
              {showFullDesc ? "Show less" : "Read more"}
            </button>
          )}
        </div>
      )}

      {/* Related Products */}
      {relatedProducts.length > 0 && (
        <div style={{ margin: "10px 12px 0", background: card, borderRadius: 12, padding: "14px 14px 14px", border: `1px solid ${bdr}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: txt, marginBottom: 10 }}>You may also like</div>
          <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 4 }}>
            {relatedProducts.map(rp => {
              const rPrice = getCurrentSellingPrice({ price: rp.price, costPrice: rp.costPrice ?? null, discount: rp.discount ?? null });
              return (
                <button
                  key={rp.id}
                  onClick={() => navigate(`/product/${rp.id}`)}
                  style={{ width: 120, flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 0, WebkitTapHighlightColor: "transparent", textAlign: "left" }}
                >
                  <div style={{ width: 120, height: 100, borderRadius: 12, overflow: "hidden", background: inp, marginBottom: 5 }}>
                    {rp.images?.[0] ? (
                      <img src={rp.images[0]} alt={rp.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: txt, fontWeight: 600, lineHeight: 1.2, marginBottom: 3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as any }}>
                    {rp.name}
                  </div>
                  <div style={{ fontSize: 12, color: accent, fontWeight: 700 }}>{formatPrice(rPrice)}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Fixed Bottom Bar */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 50,
        background: card, borderTop: `1px solid ${bdr}`,
        padding: "12px 16px",
        paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Quantity stepper */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, background: inp, borderRadius: 12, overflow: "hidden", flexShrink: 0 }}>
            <button
              onClick={() => setQuantity(q => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              style={{ width: 36, height: 40, border: "none", background: "none", cursor: quantity <= 1 ? "default" : "pointer", color: quantity <= 1 ? muted : txt, fontSize: 18, fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}
            >−</button>
            <span style={{ width: 32, textAlign: "center", fontSize: 15, fontWeight: 700, color: txt }}>{quantity}</span>
            <button
              onClick={() => setQuantity(q => Math.min(availableStock, q + 1))}
              disabled={quantity >= availableStock}
              style={{ width: 36, height: 40, border: "none", background: "none", cursor: quantity >= availableStock ? "default" : "pointer", color: quantity >= availableStock ? muted : txt, fontSize: 18, fontWeight: 300, display: "flex", alignItems: "center", justifyContent: "center", WebkitTapHighlightColor: "transparent" }}
            >+</button>
          </div>

          {/* Add to Cart */}
          <button
            onClick={handleAddToCart}
            disabled={availableStock === 0 || addToCartMutation.isPending}
            style={{
              flex: 1, height: 46, borderRadius: 12, border: "none",
              background: availableStock === 0 ? inp : addedToCart ? "#16a34a" : accent,
              color: availableStock === 0 ? muted : "#fff",
              fontSize: 15, fontWeight: 700, cursor: availableStock === 0 ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              transition: "background 0.2s",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            {addToCartMutation.isPending ? (
              <div style={{ width: 18, height: 18, borderRadius: 9, border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "spin 0.6s linear infinite" }} />
            ) : availableStock === 0 ? (
              "Out of Stock"
            ) : addedToCart ? (
              <>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><path d="M20 6 9 17l-5-5" /></svg>
                Added!
              </>
            ) : (
              <>
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                Add to Cart
              </>
            )}
          </button>

          {/* Go to Cart */}
          <button
            onClick={() => navigate("/cart")}
            style={{ width: 46, height: 46, borderRadius: 12, background: inp, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, WebkitTapHighlightColor: "transparent" }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={1.8} strokeLinecap="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
          </button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
