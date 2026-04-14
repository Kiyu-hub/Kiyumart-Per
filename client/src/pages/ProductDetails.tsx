import { useEffect, useState, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOrigin, fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Heart, ShoppingCart, Star, ArrowLeft, Minus, Plus, X, ChevronLeft, ChevronRight, Play, Check, Truck, CreditCard, ShieldCheck, BadgeCheck, Flame, Loader2 } from "lucide-react";
import { FaWhatsapp } from "react-icons/fa";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import ProductCard from "@/components/ProductCard";
import UserAvatar from "@/components/UserAvatar";
import { PriceDisplay } from "@/components/PriceDisplay";
import AdBanner from "@/components/AdBanner";
import ProductPageAd from "@/pages/ProductPageAd";
import CleanVideoPlayer from "@/components/CleanVideoPlayer";
import { getProductCategoryLabel, normalizeCategoryKey } from "@/lib/categoryUtils";
import { isDirectVideoUrl } from "@/lib/videoPlayback";
import type { PlatformSettings } from "@shared/schema";
import { getStoreTypeVariantConfig, type StoreType } from "@shared/storeTypes";

async function requestSameOriginJson<T>(method: string, url: string, data?: unknown): Promise<T> {
  return fetchSameOriginJson<T>(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });
}

function findCachedProduct(productId: string): Product | undefined {
  if (!productId) return undefined;

  const exact = queryClient.getQueryData<Product>(["/api/products", productId]);
  if (exact?.id === productId) {
    return exact;
  }

  const queryEntries = queryClient.getQueriesData({ queryKey: ["/api/products"] });
  for (const [, value] of queryEntries) {
    if (Array.isArray(value)) {
      const match = value.find(
        (item): item is Product =>
          !!item &&
          typeof item === "object" &&
          "id" in item &&
          String((item as Product).id || "") === productId,
      );
      if (match) {
        return match;
      }
    } else if (
      value &&
      typeof value === "object" &&
      "id" in value &&
      String((value as Product).id || "") === productId
    ) {
      return value as Product;
    }
  }

  return undefined;
}

interface Product {
  id: string;
  name: string;
  description?: string;
  price: string;
  costPrice?: string;
  discount?: number;
  sellerId: string;
  category?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
  images: string[];
  video?: string;
  ratings: string;
  totalRatings: number;
  stock: number;
  deliveryDuration?: string;
  dynamicFields?: Record<string, unknown>;
  isActive: boolean;
}

interface CategoryRecord {
  id: string;
  name: string;
  slug: string;
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
  images?: string[] | null;
  image: string | null;
  stock: number;
  priceAdjustment: string;
}

interface SizeGuideRow {
  labelSize: string;
  uk: string;
  bust: string;
  waist: string;
  hips: string;
  height: string;
  length: string;
  shoulder: string;
  sleeve: string;
}

interface SizeGuideData {
  displaySystem: string;
  bodyRows: SizeGuideRow[];
  productRows: SizeGuideRow[];
}

type SizeGuideAudience = "women" | "men" | null;

const VARIANT_COLOR_PRESETS: Record<string, string> = {
  red: "#dc2626",
  blue: "#2563eb",
  green: "#16a34a",
  yellow: "#eab308",
  orange: "#f97316",
  pink: "#ec4899",
  purple: "#9333ea",
  black: "#111827",
  white: "#f8fafc",
  brown: "#92400e",
  grey: "#6b7280",
  gray: "#6b7280",
  maroon: "#7f1d1d",
  nude: "#d6a77a",
  gold: "#ca8a04",
  silver: "#94a3b8",
  cream: "#f5f5dc",
  beige: "#d6c3a5",
};

const resolveVariantAccentColor = (value?: string | null, isDarkMode = false) => {
  const raw = String(value || "").trim();
  if (!raw) return "#14b8a6";
  const token = raw.split(/[,\s/]+/).find(Boolean)?.toLowerCase() || raw.toLowerCase();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw)) return raw;
  if (/^(rgb|rgba|hsl|hsla)\(/i.test(raw)) return raw;
  if (token === "black" || token === "jet" || token === "charcoal") {
    return isDarkMode ? "#ffffff" : "#000000";
  }
  return VARIANT_COLOR_PRESETS[token] || "#14b8a6";
};

const getVariantImages = (variant?: ProductVariant | null) => {
  if (Array.isArray(variant?.images) && variant.images.length > 0) {
    return variant.images.filter(Boolean);
  }
  if (variant?.image) {
    return [variant.image];
  }
  return [];
};

const splitVariantSizes = (value?: string | null) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const createSizeGuideRow = (labelSize = ""): SizeGuideRow => ({
  labelSize,
  uk: "",
  bust: "",
  waist: "",
  hips: "",
  height: "",
  length: "",
  shoulder: "",
  sleeve: "",
});

const normalizeSizeGuideRows = (rows: unknown, sizes: string[]) => {
  const rowMap = new Map<string, SizeGuideRow>();

  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      const labelSize = String((row as any)?.labelSize || "").trim();
      if (!labelSize) return;
      rowMap.set(labelSize.toLowerCase(), {
        labelSize,
        uk: String((row as any)?.uk || "").trim(),
        bust: String((row as any)?.bust || "").trim(),
        waist: String((row as any)?.waist || "").trim(),
        hips: String((row as any)?.hips || "").trim(),
        height: String((row as any)?.height || "").trim(),
        length: String((row as any)?.length || "").trim(),
        shoulder: String((row as any)?.shoulder || "").trim(),
        sleeve: String((row as any)?.sleeve || "").trim(),
      });
    });
  }

  const orderedSizes = Array.from(
    new Set(
      [
        ...sizes,
        ...Array.from(rowMap.values()).map((row) => row.labelSize),
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  return orderedSizes.map((size) => rowMap.get(size.toLowerCase()) || createSizeGuideRow(size));
};

const buildSizeGuideFromProduct = (raw: any, sizes: string[]): SizeGuideData => ({
  displaySystem: String(raw?.displaySystem || "").trim() || "Standard size",
  bodyRows: normalizeSizeGuideRows(raw?.bodyRows, sizes),
  productRows: normalizeSizeGuideRows(raw?.productRows, sizes),
});

const sizeGuideRowHasValues = (row: SizeGuideRow, fields: Array<keyof SizeGuideRow>) =>
  fields.some((field) => String(row[field] || "").trim().length > 0);

const WOMEN_SIZE_GUIDE_KEYWORDS = [
  "women",
  "woman",
  "ladies",
  "lady",
  "female",
  "abaya",
  "dress",
  "gown",
  "skirt",
  "maxi",
  "kaftan",
];

const MEN_SIZE_GUIDE_KEYWORDS = [
  "men",
  "man's",
  "mens",
  "male",
  "gentleman",
  "thobe",
  "jalabiya",
  "agbada",
  "senator",
  "boys",
  "boy",
];

const getProductTextSource = (product?: Product | null) =>
  [
    product?.name,
    product?.description,
    product?.category,
    product?.categoryName,
    ...(Array.isArray((product as any)?.tags) ? ((product as any).tags as string[]) : []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const isWomenClothingProduct = (product?: Product | null) => {
  const source = getProductTextSource(product);
  return WOMEN_SIZE_GUIDE_KEYWORDS.some((keyword) => source.includes(keyword));
};

const isMenClothingProduct = (product?: Product | null) => {
  const source = getProductTextSource(product);
  return MEN_SIZE_GUIDE_KEYWORDS.some((keyword) => source.includes(keyword));
};

const resolveSizeGuideAudience = (product?: Product | null): SizeGuideAudience => {
  if (isMenClothingProduct(product)) return "men";
  if (isWomenClothingProduct(product)) return "women";
  return null;
};

const findSelectedSizeGuideRow = (rows: SizeGuideRow[], selectedSize: string) =>
  rows.find((row) => row.labelSize.toLowerCase() === selectedSize.toLowerCase()) || rows[0] || null;

const renderMeasurementValue = (value?: string) => {
  const normalized = String(value || "").trim();
  return normalized || "-";
};

function MeasurementPill({
  value,
  className,
}: {
  value?: string;
  className?: string;
}) {
  return (
    <div
      className={`absolute rounded-full border border-orange-300 bg-white/95 px-3 py-1 text-sm font-semibold text-orange-600 shadow-sm dark:border-orange-400/30 dark:bg-slate-950/90 dark:text-orange-300 ${className || ""}`}
    >
      {renderMeasurementValue(value)}
    </div>
  );
}

function MenBodyGuideSvg() {
  return (
    <svg viewBox="0 0 280 360" className="mx-auto h-full max-h-[420px] w-full max-w-[280px] text-slate-300">
      <circle cx="140" cy="52" r="28" fill="currentColor" fillOpacity="0.18" stroke="currentColor" strokeWidth="2" />
      <path
        d="M110 95c8-12 22-18 30-18s22 6 30 18l14 30c5 10 8 22 8 34v110c0 8-6 14-14 14h-16v55c0 8-6 14-14 14h-16c-8 0-14-6-14-14v-55h-16c-8 0-14-6-14-14V159c0-12 3-24 8-34l14-30Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M106 122h68" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M112 166h56" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M108 206h64" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M218 96v210" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M206 96h24" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M206 306h24" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" />
    </svg>
  );
}

function MenProductGuideSvg() {
  return (
    <svg viewBox="0 0 280 360" className="mx-auto h-full max-h-[420px] w-full max-w-[280px] text-slate-300">
      <path
        d="M84 98l34-22h44l34 22 28 24-18 28-22-12v148c0 8-6 14-14 14H110c-8 0-14-6-14-14V138l-22 12-18-28 28-24Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path d="M112 132h56" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M95 76h90" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M210 98v202" stroke="#f97316" strokeWidth="3" strokeLinecap="round" />
      <path d="M198 98h24" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M198 300h24" stroke="#f97316" strokeWidth="2" strokeDasharray="4 4" />
      <path d="M84 114l-18 30" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M196 114l18 30" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function SizeGuideIllustrationCard({
  audience,
  type,
  row,
}: {
  audience: SizeGuideAudience;
  type: "body" | "product";
  row: SizeGuideRow | null;
}) {
  const isWomen = audience === "women";

  return (
    <div className="relative overflow-hidden rounded-[28px] border border-orange-200/70 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-sm dark:border-orange-400/20 dark:bg-[linear-gradient(180deg,rgba(25,28,31,0.98),rgba(17,20,23,1))]">
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-orange-100/70 to-transparent dark:from-orange-400/10" />
      <div className="relative overflow-hidden rounded-[24px] border border-white/80 bg-white/90 p-3 dark:border-white/10 dark:bg-slate-950/90">
        <div className="relative min-h-[360px]">
          {isWomen ? (
            <img
              src={type === "body" ? "/size-guide-body.avif" : "/size-guide-product.avif"}
              alt={type === "body" ? "Women's size guide" : "Women's garment size guide"}
              className="mx-auto h-full max-h-[420px] w-full object-contain"
            />
          ) : type === "body" ? (
            <MenBodyGuideSvg />
          ) : (
            <MenProductGuideSvg />
          )}

          {type === "body" ? (
            <>
              <MeasurementPill value={row?.bust} className="left-[16%] top-[26%]" />
              <MeasurementPill value={row?.waist} className="left-[20%] top-[42%]" />
              <MeasurementPill value={row?.hips} className="left-[14%] top-[58%]" />
              <MeasurementPill value={row?.height} className="right-[7%] top-[56%]" />
            </>
          ) : (
            <>
              <MeasurementPill value={row?.bust} className="left-[36%] top-[28%]" />
              <MeasurementPill value={row?.length} className="right-[10%] top-[56%]" />
              <MeasurementPill value={row?.shoulder} className="left-[18%] top-[10%]" />
              <MeasurementPill value={row?.sleeve} className="right-[16%] top-[18%]" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const normalizeDescriptionSections = (value?: string | null) => {
  const raw = String(value || "").trim();
  if (!raw) {
    return { intro: "", paragraphs: [] as string[], features: [] as string[] };
  }

  const collapsed = raw.replace(/\s+/g, " ").trim();
  const featureMatch = collapsed.match(/key features?:\s*(.*)$/i);
  const featureSource = featureMatch?.[1] || "";
  const mainText = featureMatch ? collapsed.slice(0, featureMatch.index).trim() : collapsed;

  const sentenceParts = mainText
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const intro = sentenceParts[0] || "";
  const paragraphs = sentenceParts.slice(1);

  const features = featureSource
    ? featureSource
        .split(/\s*(?:•|-|,)\s*|\s{2,}/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  return { intro, paragraphs, features };
};

const STORE_TYPE_PRODUCT_FIELD_LABELS: Partial<Record<StoreType, Record<string, string>>> = {
  clothing: {
    fitType: "Fit Type",
    material: "Material",
    careInstructions: "Care Instructions",
    occasion: "Best For",
    genderTarget: "Target Wearer",
  },
  electronics: {
    brand: "Brand",
    model: "Model",
    keySpecs: "Key Specifications",
    warranty: "Warranty",
    condition: "Condition",
  },
  food_beverages: {
    foodType: "Food Type",
    netWeight: "Net Weight / Volume",
    ingredients: "Ingredients",
    storageGuide: "Storage Guide",
    expiryInfo: "Expiry / Best Before",
  },
  beauty_cosmetics: {
    brand: "Brand",
    productType: "Product Type",
    skinOrHairType: "Best For",
    benefits: "Main Benefits",
    sizeVolume: "Size / Volume",
  },
  home_garden: {
    material: "Material",
    dimensions: "Dimensions",
    useArea: "Best For",
    assemblyNeeded: "Assembly Needed",
    careInstructions: "Care Instructions",
  },
  sports_fitness: {
    sportCategory: "Sport / Activity",
    brand: "Brand",
    material: "Material",
    skillLevel: "Skill Level",
    usageNote: "Usage Note",
  },
  books_media: {
    authorOrCreator: "Author / Creator",
    format: "Format",
    genre: "Genre",
    language: "Language",
    summary: "Quick Summary",
  },
  toys_games: {
    ageRange: "Age Range",
    toyType: "Toy Type",
    material: "Material",
    safetyNote: "Safety Note",
    skillsDeveloped: "Learning Benefit",
  },
  automotive: {
    brand: "Brand",
    vehicleCompatibility: "Vehicle Compatibility",
    productType: "Product Type",
    condition: "Condition",
    installationNote: "Installation Note",
  },
  health_wellness: {
    productCategory: "Product Category",
    usageDirections: "How To Use",
    keyIngredients: "Key Ingredients / Components",
    warnings: "Important Warnings",
    certification: "Certification",
  },
};

const inferStoreTypeFromStoreSpecific = (storeSpecific: Record<string, unknown>): StoreType | null => {
  const keys = Object.keys(storeSpecific || {});
  if (keys.length === 0) return null;

  const bestMatch = (Object.entries(STORE_TYPE_PRODUCT_FIELD_LABELS) as Array<[StoreType, Record<string, string>]>)
    .map(([storeType, labels]) => ({
      storeType,
      score: keys.filter((key) => Object.prototype.hasOwnProperty.call(labels, key)).length,
    }))
    .sort((a, b) => b.score - a.score)[0];

  return bestMatch && bestMatch.score > 0 ? bestMatch.storeType : null;
};

const normalizeStoreSpecificParts = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const resolveStoreSpecificDetails = (product?: Product | null) => {
  const rawStoreType = String((product?.dynamicFields as any)?.storeType || "").trim();
  const storeSpecific = (product?.dynamicFields as any)?.storeSpecific;

  if (!storeSpecific || typeof storeSpecific !== "object") {
    return {
      storeType: null as StoreType | null,
      entries: [] as Array<{ label: string; value: string; parts: string[]; isTagList: boolean; isParagraphList: boolean }>,
    };
  }

  const storeType =
    (rawStoreType as StoreType) ||
    inferStoreTypeFromStoreSpecific(storeSpecific as Record<string, unknown>);

  if (!storeType) {
    return {
      storeType: null as StoreType | null,
      entries: [] as Array<{ label: string; value: string; parts: string[]; isTagList: boolean; isParagraphList: boolean }>,
    };
  }

  const labels = STORE_TYPE_PRODUCT_FIELD_LABELS[storeType] || {};
  const entries = Object.entries(storeSpecific)
    .map(([key, rawValue]) => {
      const parts = normalizeStoreSpecificParts(rawValue);
      const value = Array.isArray(rawValue)
        ? parts.join(", ")
        : String(rawValue || "").trim();
      const normalizedKey = key.toLowerCase();
      const isTagList =
        Array.isArray(rawValue) ||
        normalizedKey === "occasion" ||
        normalizedKey === "bestfor" ||
        normalizedKey === "skinorhairtype" ||
        normalizedKey === "usearea" ||
        normalizedKey === "sportcategory" ||
        normalizedKey === "skillsdeveloped" ||
        normalizedKey === "certification";
      const isParagraphList =
        normalizedKey.includes("care") ||
        normalizedKey.includes("instruction") ||
        normalizedKey.includes("direction") ||
        normalizedKey.includes("warning") ||
        normalizedKey.includes("summary") ||
        normalizedKey.includes("benefit") ||
        normalizedKey.includes("note");

      return {
        label: labels[key] || key,
        value,
        parts,
        isTagList,
        isParagraphList,
      };
    })
    .filter((entry) => entry.value);

  return { storeType, entries };
};

const resolveDeliveryDurationLabel = (value?: string | null) => {
  const normalized = String(value || "").trim();
  return normalized || "Not provided";
};

const resolveExpectedDeliveryText = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const matches = normalized.match(/\d+/g);
  const offsets = matches?.map((match) => parseInt(match, 10)).filter((num) => !Number.isNaN(num)) || [];
  const days = offsets.length > 0 ? Math.max(...offsets) : 1;
  const deliveryDate = new Date();
  deliveryDate.setDate(deliveryDate.getDate() + days);

  const formattedDate = deliveryDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return `Estimated delivery is on or before ${formattedDate}.`;
};

export default function ProductDetails() {
  const [, params] = useRoute("/product/:id");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, ensureAuthenticated } = useAuth();
  const { toast } = useToast();
  const { currencySymbol, formatPrice } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [selectedSizeOption, setSelectedSizeOption] = useState("");
  const [selectedImage, setSelectedImage] = useState(0);
  const [isImageExpanded, setIsImageExpanded] = useState(false);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const [showFullDescription, setShowFullDescription] = useState(false);
  const [addedToCart, setAddedToCart] = useState(false);
  const [wishlistOptimistic, setWishlistOptimistic] = useState<boolean | null>(null);
  const reviewsRef = useRef<HTMLDivElement>(null);

  const productId = params?.id || "";
  const pageQuery = location.split("?")[1] || "";
  const sourcePage = useRef(new URLSearchParams(pageQuery).get("from") || "");

  // ─── Data Fetching ───────────────────────────────────────
  const { data: product, isLoading, error: productError } = useQuery<Product>({
    queryKey: ["/api/products", productId],
    queryFn: async () =>
      fetchSameOriginJson<Product>(`/api/products/${productId}`, {
        cache: "no-store",
      }),
    placeholderData: () => findCachedProduct(productId),
    enabled: !!productId,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: fallbackCategory } = useQuery<CategoryRecord | null>({
    queryKey: ["/api/categories", product?.categoryId, "product-details-fallback"],
    queryFn: async () => {
      if (!product?.categoryId) return null;
      const res = await fetchSameOrigin(`/api/categories/${product.categoryId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!product?.categoryId && !getProductCategoryLabel(product),
    refetchOnMount: "always",
  });

  const { data: wishlist = [] } = useQuery<WishlistItem[]>({
    queryKey: ["/api/wishlist"],
    enabled: isAuthenticated,
  });

  const { data: cartItems = [], isLoading: cartItemsLoading, isFetching: cartItemsFetching } = useQuery<Array<{
    id: string;
    productId: string;
    quantity: number;
    variantId?: string | null;
    selectedColor?: string | null;
    selectedSize?: string | null;
    availableStock?: number;
  }>>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated && !!product,
    queryFn: async () =>
      fetchSameOriginJson("/api/cart", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: reviews = [] } = useQuery<Review[]>({
    queryKey: ["/api/products", productId, "reviews"],
    queryFn: async () => fetchSameOriginJson<Review[]>(`/api/products/${productId}/reviews`),
    enabled: !!productId && !!product,
  });
  const reviewCount = reviews.length;

  const { data: variants = [] } = useQuery<ProductVariant[]>({
    queryKey: ["/api/products", productId, "variants"],
    queryFn: async () => {
      const res = await fetchSameOrigin(`/api/products/${productId}/variants`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!productId && !!product,
  });

  const { data: platformSettings } = useQuery<PlatformSettings>({
    queryKey: ["/api/platform-settings"],
    queryFn: async () => fetchSameOriginJson<PlatformSettings>("/api/platform-settings"),
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    staleTime: 60 * 60 * 1000,
  });

  const { data: relatedProducts = [] } = useQuery<Product[]>({
    queryKey: ["/api/products", "active", "product-details-related", productId],
    queryFn: async () => {
      const res = await fetchSameOrigin("/api/products?isActive=true");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!product?.id,
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
      const baseCategoryKey = normalizeCategoryKey(product.categoryName || product.category);

      const scored = candidates.map((p) => {
        let score = 0;
        const candidateCategoryKey = normalizeCategoryKey(p.categoryName || p.category);

        // Strong boost for same category
        if (baseCategoryKey && candidateCategoryKey === baseCategoryKey) score += 100;

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
  });

  const categoryLabel = getProductCategoryLabel(product) || fallbackCategory?.name || "Uncategorized";

  // ─── Derived State ──────────────────────────────────────
  const serverWishlisted = wishlist.some(item => item.productId === productId);
  const isWishlisted = wishlistOptimistic ?? serverWishlisted;
  const cartItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  // Get all available variants
  const availableVariants = variants.filter(v => v.stock > 0);
  const colorVariantGroups = Array.from(
    availableVariants.reduce((groups, variant) => {
      const color = String(variant.color || "").trim();
      if (!color) return groups;

      const key = color.toLowerCase();
      const current = groups.get(key) || {
        id: variant.id,
        color,
        variants: [] as ProductVariant[],
        images: [] as string[],
        sizes: [] as string[],
        stock: 0,
      };

      current.variants.push(variant);
      current.images = Array.from(new Set([...current.images, ...getVariantImages(variant)]));
      current.sizes = Array.from(new Set([...current.sizes, ...splitVariantSizes(variant.size)]));
      current.stock += Number(variant.stock || 0);
      groups.set(key, current);
      return groups;
    }, new Map<string, { id: string; color: string; variants: ProductVariant[]; images: string[]; sizes: string[]; stock: number }>() ).values(),
  );

  // Selected variant (either explicitly selected or first available)
  const selectedVariantBase = selectedVariantId
    ? variants.find(v => v.id === selectedVariantId) || null
    : availableVariants[0] || null;
  const selectedColorGroup = selectedVariantBase
    ? colorVariantGroups.find((group) => group.variants.some((variant) => variant.id === selectedVariantBase.id)) || null
    : colorVariantGroups[0] || null;

  // Auto-select first available variant if none selected
  useEffect(() => {
    if (!selectedVariantId && availableVariants.length > 0) {
      setSelectedVariantId(availableVariants[0].id);
    }
  }, [selectedVariantId, availableVariants]);

  const colorOptions = colorVariantGroups;
  const selectedColor = String(selectedColorGroup?.color || selectedVariantBase?.color || "").trim();
  const sizeOptions = Array.from(
    new Set(
      (selectedColorGroup?.sizes?.length
        ? selectedColorGroup.sizes
        : variants
            .filter((variant) => {
              const variantColor = String(variant.color || "").trim();
              if (!selectedColor) return true;
              return variantColor.toLowerCase() === selectedColor.toLowerCase();
            })
            .flatMap((variant) => splitVariantSizes(variant.size)))
      .filter(Boolean),
    ),
  );
  const selectedSize = selectedSizeOption || sizeOptions[0] || splitVariantSizes(selectedVariantBase?.size)[0] || "";
  const selectedVariant =
    (selectedColorGroup?.variants.find((variant) =>
      splitVariantSizes(variant.size).some((size) => size.toLowerCase() === selectedSize.toLowerCase()),
    ) || null) ??
    selectedVariantBase ??
    selectedColorGroup?.variants[0] ??
    availableVariants[0] ??
    null;

  const availableStock = product ? (selectedVariant
    ? selectedVariant.stock
    : selectedColorGroup
      ? selectedColorGroup.stock
      : variants.length > 0
        ? (availableVariants.length > 0 ? availableVariants[0].stock : product.stock)
        : product.stock) : 0;
  const selectedVariantImages = selectedColorGroup?.images?.length
    ? selectedColorGroup.images
    : getVariantImages(selectedVariant);
  const productImages = Array.isArray(product?.images) ? product.images : [];
  const activeGalleryImages = selectedVariantImages.length > 0 ? selectedVariantImages : productImages;
  const sizeGuide = buildSizeGuideFromProduct(product?.dynamicFields?.sizeGuide, sizeOptions);
  const getSelectionQuantityInCart = (
    items: Array<{
      id: string;
      productId: string;
      quantity: number;
      variantId?: string | null;
      selectedColor?: string | null;
      selectedSize?: string | null;
    }>,
  ) =>
    items.reduce((sum, item) => {
      const sameProduct = String(item.productId || "") === String(productId || "");
      const sameVariant = String(item.variantId || "") === String(selectedVariant?.id || "");
      const sameColor =
        String(item.selectedColor || "").trim().toLowerCase() === String(selectedColor || "").trim().toLowerCase();
      const sameSize =
        String(item.selectedSize || "").trim().toLowerCase() === String(selectedSize || "").trim().toLowerCase();

      if (!sameProduct) return sum;

      if (selectedVariant?.id) {
        const variantMatches = sameVariant;
        const colorMatches = !selectedColor || sameColor;
        const sizeMatches = !selectedSize || sameSize;
        return variantMatches && colorMatches && sizeMatches ? sum + Number(item.quantity || 0) : sum;
      }

      if (selectedColor || selectedSize) {
        const colorMatches = !selectedColor || sameColor;
        const sizeMatches = !selectedSize || sameSize;
        return colorMatches && sizeMatches ? sum + Number(item.quantity || 0) : sum;
      }

      return sum + Number(item.quantity || 0);
    }, 0);

  const matchingCartQuantity = getSelectionQuantityInCart(cartItems);
  const remainingToAdd = Math.max(availableStock - matchingCartQuantity, 0);
  const allAvailableItemsAlreadyInCart = availableStock > 0 && remainingToAdd === 0;
  const isCartStatePending = isAuthenticated && (cartItemsLoading || cartItemsFetching);
  const isOwnSellerProduct =
    isAuthenticated &&
    String(user?.role || "").toLowerCase().trim() === "seller" &&
    String(user?.id || "").trim() !== "" &&
    String(product?.sellerId || "").trim() === String(user?.id || "").trim();

  useEffect(() => {
    if (!sizeOptions.length) {
      if (selectedSizeOption) setSelectedSizeOption("");
      return;
    }

    if (!selectedSizeOption || !sizeOptions.some((size) => size.toLowerCase() === selectedSizeOption.toLowerCase())) {
      setSelectedSizeOption(sizeOptions[0]);
    }
  }, [sizeOptions, selectedSizeOption]);

  useEffect(() => {
    if (selectedVariant?.id && selectedVariant.id !== selectedVariantId) {
      setSelectedVariantId(selectedVariant.id);
    }
  }, [selectedVariant?.id, selectedVariantId]);

  const hasBodyGuide = sizeGuide.bodyRows.some((row) =>
    sizeGuideRowHasValues(row, ["uk", "bust", "waist", "hips", "height"]),
  );
  const hasProductGuide = sizeGuide.productRows.some((row) =>
    sizeGuideRowHasValues(row, ["length", "bust", "waist", "hips", "shoulder", "sleeve"]),
  );
  const hasSizeGuide = hasBodyGuide || hasProductGuide;
  const bodyGuideRows = sizeGuide.bodyRows.filter((row) =>
    sizeGuideRowHasValues(row, ["uk", "bust", "waist", "hips", "height"]),
  );
  const productGuideRows = sizeGuide.productRows.filter((row) =>
    sizeGuideRowHasValues(row, ["length", "bust", "waist", "hips", "shoulder", "sleeve"]),
  );
  const sizeGuideAudience = resolveSizeGuideAudience(product);
  const selectedBodyGuideRow = findSelectedSizeGuideRow(bodyGuideRows, selectedSize);
  const selectedProductGuideRow = findSelectedSizeGuideRow(productGuideRows, selectedSize);

  const handleColorSelect = (color: string) => {
    const normalizedColor = color.trim().toLowerCase();
    const selectedGroup = colorVariantGroups.find((group) => group.color.toLowerCase() === normalizedColor);
    const matchingVariant =
      selectedGroup?.variants.find((variant) => {
        const variantSizes = splitVariantSizes(variant.size).map((size) => size.toLowerCase());
        return !selectedSize || variantSizes.includes(selectedSize.toLowerCase());
      }) ||
      selectedGroup?.variants[0] ||
      variants.find((variant) => String(variant.color || "").trim().toLowerCase() === normalizedColor);

    if (matchingVariant) {
      setSelectedVariantId(matchingVariant.id);
      const nextSizes = selectedGroup?.sizes || splitVariantSizes(matchingVariant.size);
      if (nextSizes.length > 0) {
        const preservedSize = nextSizes.find((size) => size.toLowerCase() === selectedSize.toLowerCase());
        setSelectedSizeOption(preservedSize || nextSizes[0]);
      } else {
        setSelectedSizeOption("");
      }
      setSelectedImage(0);
    }
  };

  const handleSizeSelect = (size: string) => {
    const normalizedSize = size.trim().toLowerCase();
    const matchingVariant =
      variants.find((variant) => {
        const variantColor = String(variant.color || "").trim().toLowerCase();
        const variantSizes = splitVariantSizes(variant.size).map((entry) => entry.toLowerCase());
        return variantSizes.includes(normalizedSize) && (!selectedColor || variantColor === selectedColor.toLowerCase());
      }) ||
      variants.find((variant) => splitVariantSizes(variant.size).map((entry) => entry.toLowerCase()).includes(normalizedSize));

    if (matchingVariant) {
      setSelectedVariantId(matchingVariant.id);
    }
    setSelectedSizeOption(size);
  };

  useEffect(() => {
    if (quantity > remainingToAdd && remainingToAdd > 0) {
      setQuantity(remainingToAdd);
    } else if (remainingToAdd === 0 && quantity !== 1) {
      setQuantity(1);
    }
  }, [remainingToAdd, quantity]);

  useEffect(() => {
    setSelectedImage(0);
  }, [selectedVariantId, selectedColor]);

  useEffect(() => {
    setWishlistOptimistic(null);
  }, [productId, serverWishlisted]);

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
      return await requestSameOriginJson("POST", "/api/cart", { 
        productId, quantity, variantId, selectedColor, selectedSize, selectedImageIndex
      });
    },
    onSuccess: (cartItem: any, variables) => {
      queryClient.setQueryData<any[]>(["/api/cart"], (current = []) => {
        const existing = Array.isArray(current) ? [...current] : [];
        const normalizedColor = String(selectedColorGroup?.color || selectedVariant?.color || "").trim().toLowerCase();
        const normalizedSize = String(selectedSize || "").trim().toLowerCase();
        const optimisticImage =
          activeGalleryImages[selectedImage] ||
          activeGalleryImages[0] ||
          productImages[0] ||
          "";
        const incomingId = String(cartItem?.id || "").trim();

        const selectionIndex = existing.findIndex((item) => {
          const sameProduct = String(item?.productId || "") === String(productId || "");
          const sameVariant = String(item?.variantId || "") === String(selectedVariant?.id || "");
          const sameColor =
            String(item?.selectedColor || "").trim().toLowerCase() === normalizedColor;
          const sameSize =
            String(item?.selectedSize || "").trim().toLowerCase() === normalizedSize;
          return sameProduct && sameVariant && sameColor && sameSize;
        });

        const nextRow = {
          ...(selectionIndex >= 0 ? existing[selectionIndex] : {}),
          ...(cartItem || {}),
          id: incomingId || existing[selectionIndex]?.id || "",
          productId,
          productName: product?.name || existing[selectionIndex]?.productName || "Product",
          productImage: optimisticImage || existing[selectionIndex]?.productImage || "",
          quantity: Number(cartItem?.quantity ?? variables.quantity ?? 1),
          price: String(product?.price ?? existing[selectionIndex]?.price ?? "0"),
          variantId: cartItem?.variantId ?? selectedVariant?.id ?? null,
          selectedColor: selectedColorGroup?.color || selectedVariant?.color || null,
          selectedSize: selectedSize || null,
          selectedImageIndex: selectedImage,
          availableStock,
        };

        if (selectionIndex >= 0) {
          existing[selectionIndex] = nextRow;
          return existing;
        }

        if (incomingId) {
          const rowIndex = existing.findIndex((item) => String(item?.id || "") === incomingId);
          if (rowIndex >= 0) {
            existing[rowIndex] = nextRow;
            return existing;
          }
        }

        return [nextRow, ...existing];
      });
      queryClient.refetchQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
      toast({
        title: "Added to cart",
        description: `${quantity} item(s) added to your cart`,
      });
    },
    onError: (error: any) => {
      const message = String(error?.message || "").trim();
      if (/401|authentication|login/i.test(message)) {
        queryClient.setQueryData(["/api/auth/me"], null);
        toast({
          title: "Session expired",
          description: "Please log in again to continue shopping.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      if (/Only\s+\d+\s+item\(s\)\s+available/i.test(message) || /out of stock/i.test(message)) {
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      }
      toast({
        title: "Error",
        description: /only\s+\d+|out of stock|maximum available quantity|fully reserved/i.test(message)
          ? "This option is no longer available in that quantity. Please try a lower quantity."
          : message || "Could not add this item to your cart",
        variant: "destructive",
      });
    },
  });

  const addToWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      return await requestSameOriginJson("POST", "/api/wishlist", { productId });
    },
    onMutate: () => {
      setWishlistOptimistic(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      toast({ title: "Added to wishlist", description: "Product has been added to your wishlist" });
    },
    onError: (error: any) => {
      setWishlistOptimistic(serverWishlisted);
      const message = String(error?.message || "").trim();
      if (/401|authentication|login/i.test(message)) {
        queryClient.setQueryData(["/api/auth/me"], null);
        toast({
          title: "Session expired",
          description: "Please log in again to use your wishlist.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      toast({
        title: "Could not update wishlist",
        description: message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (productId: string) => {
      await requestSameOriginJson("DELETE", `/api/wishlist/${productId}`);
    },
    onMutate: () => {
      setWishlistOptimistic(false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      toast({ title: "Removed from wishlist", description: "Product has been removed from your wishlist" });
    },
    onError: (error: any) => {
      setWishlistOptimistic(serverWishlisted);
      const message = String(error?.message || "").trim();
      if (/401|authentication|login/i.test(message)) {
        queryClient.setQueryData(["/api/auth/me"], null);
        toast({
          title: "Session expired",
          description: "Please log in again to use your wishlist.",
          variant: "destructive",
        });
        navigate("/auth");
        return;
      }
      toast({
        title: "Could not update wishlist",
        description: message || "Please try again in a moment.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    },
  });

  // ─── Handlers ───────────────────────────────────────────
  const handleToggleWishlist = async () => {
    if (addToWishlistMutation.isPending || removeFromWishlistMutation.isPending) return;
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      toast({
        title: "Session expired",
        description: "Please log in again to use your wishlist.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    if (isWishlisted) {
      removeFromWishlistMutation.mutate(productId);
    } else {
      addToWishlistMutation.mutate(productId);
    }
  };

  const handleAddToCart = async () => {
    const activeUser = await ensureAuthenticated();
    if (!activeUser) {
      toast({
        title: "Session expired",
        description: "Please log in again to continue shopping.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }
    if (isOwnSellerProduct) {
      toast({
        title: "Own product",
        description: "You cannot buy your own product, but you can shop from other sellers.",
        variant: "destructive",
      });
      return;
    }
    if (!isCartStatePending && allAvailableItemsAlreadyInCart) {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      toast({
        title: "Cart already full for this option",
        description: "You already have the maximum available quantity for this selection in your cart.",
      });
      return;
    }
    const safeQuantity = !isCartStatePending && remainingToAdd > 0
      ? Math.min(Math.max(1, quantity), remainingToAdd)
      : Math.max(1, quantity);
    if (safeQuantity !== quantity) {
      setQuantity(safeQuantity);
    }
    const resolvedImageIndex = Math.max(0, selectedImage);
    addToCartMutation.mutate({ 
      productId, quantity: safeQuantity,
      variantId: selectedVariant?.id,
      selectedColor: selectedColorGroup?.color || selectedVariant?.color || undefined,
      selectedSize: selectedSize || undefined,
      selectedImageIndex: resolvedImageIndex >= 0 ? resolvedImageIndex : 0
    });
  };

  const decreaseQuantity = () => {
    setQuantity((current) => Math.max(1, current - 1));
  };

  const increaseQuantity = () => {
    if (!isCartStatePending && remainingToAdd <= 0) return;
    setQuantity((current) => Math.min(Math.max(1, remainingToAdd), current + 1));
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

  const handleShareOnWhatsApp = () => {
    if (!product) return;
    const productUrl = typeof window !== "undefined" ? window.location.href : `/product/${product.id}`;
    const shareText = `Check this out on KiyuMart: ${product.name} - ${formatPrice(parseFloat(product.price))}`;
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText}\n${productUrl}`)}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
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
            <h2 className="text-2xl font-bold tracking-tight">
              {productError ? "Could not load product" : "Product Not Found"}
            </h2>
            <p className="text-muted-foreground max-w-sm">
              The product could not be loaded right now. Please refresh the page or try again shortly.
            </p>
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
  const rawDiscount = Number(product.discount) || 0;
  const discount = Math.max(0, calculatedDiscount > 0 ? calculatedDiscount : rawDiscount > 0 ? rawDiscount : 0);
  const rating = parseFloat(product.ratings) || 0;
  const deliveryDurationLabel = resolveDeliveryDurationLabel(product.deliveryDuration);
  const expectedDeliveryText = resolveExpectedDeliveryText(product.deliveryDuration);
  const isLowStock = availableStock > 0 && availableStock < 10;
  const isCriticalStock = availableStock > 0 && availableStock <= 3;
  const directVideoUrl = isDirectVideoUrl(product.video) ? product.video : null;
  const isDarkMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");
  const descriptionSections = normalizeDescriptionSections(product.description);
  const reviewAverage =
    reviewCount > 0
      ? reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / reviewCount
      : 0;
  const storeSpecificDetails = resolveStoreSpecificDetails(product);
  const variantConfig = getStoreTypeVariantConfig(storeSpecificDetails.storeType);
  const showSizeGuide = variantConfig.supportsSizeGuide && hasSizeGuide;
  const showClothingFitGuideFallback = reviewCount === 0 && !!sizeGuideAudience && hasSizeGuide;
  const reviewBuckets = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((review) => Math.round(review.rating) === star).length;
    return { star, count, percent: reviewCount > 0 ? Math.round((count / reviewCount) * 100) : 0 };
  });
  const shouldShowProductPageAd =
    (platformSettings?.adsEnabled ?? false) &&
    (platformSettings?.productPageAdEnabled ?? false) &&
    Boolean(
      (platformSettings?.productPageAdImage && platformSettings.productPageAdImage.trim()) ||
      (platformSettings?.logo && platformSettings.logo.trim())
    );

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
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                window.history.back();
                return;
              }

              const decodedSource = sourcePage.current ? decodeURIComponent(sourcePage.current) : "";
              if (decodedSource.startsWith("/")) {
                navigate(decodedSource);
                return;
              }

              navigate("/products");
            }}
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
                      src={activeGalleryImages[selectedImage] || activeGalleryImages[0]}
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
                      {discount}% OFF
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
              {colorVariantGroups.length > 0 && (
                <div
                  className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center px-2 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {colorVariantGroups.map((variant) => {
                    const isActive = selectedColorGroup?.id === variant.id;
                    return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => handleColorSelect(variant.color)}
                      className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden border transition-all duration-300 ring-offset-2 ring-offset-background shadow-md hover:shadow-lg
                        ${isActive
                          ? 'border-[5px] scale-110 shadow-xl bg-primary/5'
                          : 'border-border/50 hover:border-primary/70 hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      style={
                        isActive
                          ? {
                              boxSizing: 'border-box',
                              borderColor: resolveVariantAccentColor(variant.color, isDarkMode),
                            }
                          : { boxSizing: 'border-box' }
                      }
                      data-testid={`variant-thumbnail-${variant.id}`}
                    >
                      <img
                        src={variant.images[0] || product?.images[0] || '/placeholder-product.jpg'}
                        alt={`${product?.name} - ${variant.color || ''}`.trim()}
                        className="w-full h-full object-cover"
                      />
                      {isActive && (
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
                        {variant.color ? variant.color : "Variant"}
                      </div>
                    </button>
                  )})}
                </div>
              )}

              {selectedVariantImages.length > 1 && (
                <div
                  className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide justify-center px-2 [&::-webkit-scrollbar]:hidden"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                >
                  {selectedVariantImages.map((image, idx) => (
                    <button
                      key={`selected-variant-image-${idx}`}
                      onClick={() => setSelectedImage(idx)}
                      className={`relative flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-300 ring-offset-2 ring-offset-background shadow-md hover:shadow-lg
                        ${selectedImage === idx
                          ? 'ring-3 ring-primary scale-110 shadow-xl bg-primary/5'
                          : 'ring-2 ring-border/50 hover:ring-primary/70 hover:scale-105 opacity-80 hover:opacity-100'
                        }`}
                      style={{ boxSizing: 'border-box' }}
                      data-testid={`selected-variant-image-${idx}`}
                    >
                      <img
                        src={image}
                        alt={`${product.name} ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
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
                </div>
              )}

              {/* Product Image Thumbnails - Fallback when no variants */}
              {colorVariantGroups.length === 0 && (product.images.length > 1 || product.video) && (
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
                      {directVideoUrl ? (
                        <video className="w-full h-full object-cover" muted>
                          <source src={directVideoUrl} type="video/mp4" />
                        </video>
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-black">
                          <Play className="h-5 w-5 text-white" fill="currentColor" />
                        </div>
                      )}
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
                    <CleanVideoPlayer
                      videoUrl={product.video}
                      title={`${product.name} video`}
                      className="rounded-2xl border-0 shadow-none"
                      layout="landscape"
                    />
                  </div>
                </div>
              )}

              {showClothingFitGuideFallback ? (
                <Card className="border-orange-200/70 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-sm dark:border-orange-400/20 dark:bg-[linear-gradient(180deg,rgba(25,28,31,0.98),rgba(17,20,23,1))]">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-500 dark:text-orange-300">
                          Size & Fit Guide
                        </p>
                        <h4 className="text-lg font-semibold text-slate-900 dark:text-white">
                          No reviews yet, so use the fit guide for this style
                        </h4>
                        <p className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                          Check the measurement guide for this {sizeGuideAudience === "men" ? "men's" : "women's"} clothing item before ordering.
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                          Size displayed: {sizeGuide.displaySystem}
                        </Badge>
                        {selectedSize && (
                          <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white dark:bg-white dark:text-slate-950">
                            Selected size: {selectedSize}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
                      <SizeGuideIllustrationCard
                        audience={sizeGuideAudience}
                        type="body"
                        row={selectedBodyGuideRow}
                      />

                      <div className="space-y-3 rounded-[24px] border border-orange-200/70 bg-white/90 p-4 dark:border-white/10 dark:bg-slate-950/90">
                        <div className="flex flex-wrap gap-2">
                          {sizeOptions.map((size) => {
                            const isActive = size.toLowerCase() === selectedSize.toLowerCase();
                            return (
                              <button
                                key={`fallback-size-${size}`}
                                type="button"
                                onClick={() => handleSizeSelect(size)}
                                className={`min-w-[52px] rounded-full border px-3 py-2 text-sm font-semibold transition-all ${
                                  isActive
                                    ? "border-slate-900 bg-slate-900 text-white dark:border-white dark:bg-white dark:text-slate-950"
                                    : "border-slate-300 bg-white text-slate-700 hover:border-orange-400 dark:border-white/15 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-orange-300 dark:hover:text-white"
                                }`}
                              >
                                {size}
                              </button>
                            );
                          })}
                        </div>

                        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
                            <span>Bust</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{renderMeasurementValue(selectedBodyGuideRow?.bust)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
                            <span>Waist</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{renderMeasurementValue(selectedBodyGuideRow?.waist)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
                            <span>Hips</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{renderMeasurementValue(selectedBodyGuideRow?.hips)}</span>
                          </div>
                          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-900/80">
                            <span>Height</span>
                            <span className="font-semibold text-slate-900 dark:text-white">{renderMeasurementValue(selectedBodyGuideRow?.height)}</span>
                          </div>
                        </div>

                        <Button type="button" variant="outline" className="w-full" onClick={() => setIsSizeGuideOpen(true)}>
                          Open full size guide
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="border-border/70 bg-card/70 p-4 shadow-sm">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm font-semibold text-foreground">{reviewCount} reviews</span>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={`summary-star-${i}`}
                            className={`h-4 w-4 ${
                              i < Math.round(reviewAverage)
                                ? "fill-amber-400 text-amber-400"
                                : "fill-muted text-muted"
                            }`}
                          />
                        ))}
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {reviewAverage.toFixed(1)}
                      </span>
                      <span className="text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
                        Reviews from purchases
                      </span>
                    </div>

                    {reviewCount > 0 ? (
                      <div className="space-y-2">
                        {reviewBuckets.map((bucket) => (
                          <div key={`bucket-${bucket.star}`} className="flex items-center gap-3 text-xs">
                            <span className="w-10 text-muted-foreground">{bucket.star}★</span>
                            <div className="h-2 flex-1 rounded-full bg-muted">
                              <div
                                className="h-2 rounded-full bg-foreground/80"
                                style={{ width: `${bucket.percent}%` }}
                              />
                            </div>
                            <span className="w-10 text-right text-muted-foreground">{bucket.percent}%</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No reviews yet. Be the first to review.</p>
                    )}

                    {reviewCount > 0 && (
                      <div className="space-y-3">
                        {reviews.slice(0, 3).map((review) => (
                          <div key={review.id} className="rounded-xl border border-border/60 bg-background/60 p-3">
                            <div className="flex items-center gap-2">
                              <UserAvatar
                                profileImage={review.profileImage}
                                name={review.userName || "Customer"}
                                size="sm"
                              />
                              <div className="text-sm font-medium">{review.userName || "Customer"}</div>
                            </div>
                            <div className="mt-2 flex items-center gap-1">
                              {Array.from({ length: 5 }).map((_, i) => (
                                <Star
                                  key={`review-star-${review.id}-${i}`}
                                  className={`h-3 w-3 ${
                                    i < Math.round(review.rating)
                                      ? "fill-amber-400 text-amber-400"
                                      : "fill-muted text-muted"
                                  }`}
                                />
                              ))}
                            </div>
                            {review.comment && (
                              <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => reviewsRef.current?.scrollIntoView({ behavior: "smooth" })}
                        >
                          See all reviews
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
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
                  {categoryLabel}
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

              {/* Description */}
              {product.description && (
                <Card className="border-border/70 bg-card/70 p-4 shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Product Details
                      </h3>
                    </div>

                    {descriptionSections.intro && (
                      <p className="text-sm font-medium leading-7 text-foreground" data-testid="text-description-intro">
                        {descriptionSections.intro}
                      </p>
                    )}

                    {descriptionSections.paragraphs.length > 0 && (
                      <div className="space-y-2" data-testid="text-description">
                        {descriptionSections.paragraphs.map((paragraph, index) => (
                          <p key={`description-paragraph-${index}`} className="text-sm leading-7 text-muted-foreground">
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    )}

                  </div>
                </Card>
              )}

              {storeSpecificDetails.entries.length > 0 && (
                <Card className="border-border/70 bg-card/70 p-2.5 shadow-sm">
                  <div className="space-y-1.5">
                    <div>
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        Specification
                      </h3>
                    </div>

                    <div className="divide-y divide-border/40 rounded-md border border-border/40 bg-background/30">
                      {storeSpecificDetails.entries.map((entry) => (
                        <div
                          key={entry.label}
                          className={`px-3 py-2.5 sm:px-3 ${
                            entry.isParagraphList ? "" : "sm:grid sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-4 sm:items-start"
                          }`}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                            {entry.label}
                          </p>
                          {entry.isTagList ? (
                            <div className="mt-1.5 flex flex-wrap gap-1 sm:mt-0">
                              {entry.parts.map((part) => (
                                <span
                                  key={`${entry.label}-${part}`}
                                  className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
                                >
                                  {part}
                                </span>
                              ))}
                            </div>
                          ) : entry.isParagraphList && entry.parts.length > 1 ? (
                            <p className="mt-1.5 text-sm leading-6 text-foreground/90 sm:mt-0">
                              {entry.parts.join(" • ")}
                            </p>
                          ) : (
                            <p className="mt-1.5 text-sm leading-6 text-foreground sm:mt-0">
                              {entry.value}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </Card>
              )}

              {/* ── Variants ── */}
              {colorVariantGroups.length > 0 && (
                <div className="space-y-4 rounded-2xl border border-border/70 bg-background/70 p-4" style={{ boxSizing: 'border-box' }}>
                  {colorOptions.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">
                          {variantConfig.primaryLabel}
                          {selectedColor ? `: ${selectedColor}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {colorOptions.map((variant) => {
                          const color = String(variant.color || "").trim();
                          const isActive = color.toLowerCase() === selectedColor.toLowerCase();
                          const accentColor = resolveVariantAccentColor(color, isDarkMode);
                          return (
                            <button
                              key={`color-${variant.id}`}
                              type="button"
                              onClick={() => handleColorSelect(color)}
                              className={`w-[92px] overflow-hidden rounded-xl text-left transition-all ${
                                isActive
                                  ? "border-[5px] shadow-md"
                                  : "border border-border/70 hover:border-primary/50"
                              }`}
                              style={isActive ? {
                                borderColor: accentColor,
                                boxShadow: `0 10px 24px -18px ${accentColor}`,
                              } : undefined}
                              data-testid={`button-variant-color-${variant.id}`}
                            >
                              <div className="aspect-square bg-muted/40">
                                <img
                                  src={variant.images[0] || product?.images?.[0] || "/placeholder-product.jpg"}
                                  alt={`${product.name} - ${color}`}
                                  className="h-full w-full object-cover"
                                />
                              </div>
                              <div className="px-2 py-1.5 text-center">
                                <p className="line-clamp-2 text-xs font-medium text-foreground">{color}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {sizeOptions.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground">
                          {variantConfig.secondaryLabel}
                          {selectedSize ? `: ${selectedSize}` : ""}
                        </p>
                        {showSizeGuide ? (
                          <button
                            type="button"
                            onClick={() => setIsSizeGuideOpen(true)}
                            className="text-xs font-medium text-primary hover:underline"
                            data-testid="button-open-size-guide"
                          >
                            {variantConfig.sizeGuideLabel}
                          </button>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {sizeOptions.map((size) => {
                          const isActive = size.toLowerCase() === selectedSize.toLowerCase();
                          return (
                            <button
                              key={`size-${size}`}
                              type="button"
                              onClick={() => handleSizeSelect(size)}
                              className={`min-w-[52px] rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                                isActive
                                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                  : "border-border/70 bg-background hover:border-primary/50"
                              }`}
                              data-testid={`button-variant-size-${size}`}
                            >
                              {size}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <p className="text-sm font-medium" data-testid="text-stock">
                      {availableStock > 0
                        ? isLowStock
                          ? (
                            <span className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold shadow-sm ${
                              isCriticalStock
                                ? "bg-red-500/12 text-red-600 dark:text-red-400 animate-pulse"
                                : "bg-orange-500/12 text-orange-600 dark:text-orange-400 animate-pulse"
                            }`}>
                              <Flame className="h-4 w-4" />
                              {availableStock} left
                            </span>
                          )
                          : <span className="text-base font-semibold text-green-600 dark:text-green-400">{availableStock} in stock</span>
                        : <span className="text-base font-semibold text-destructive">Out of stock</span>
                      }
                    </p>

                    {!selectedVariant && (
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
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Qty</span>
                  <div className="relative z-10 flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-3 py-2 shadow-sm">
                    <button
                      type="button"
                      onClick={decreaseQuantity}
                      disabled={quantity <= 1 || addToCartMutation.isPending || isOwnSellerProduct}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background transition-all duration-200 hover:border-primary/50 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ boxSizing: "border-box" }}
                      data-testid="button-decrease-quantity"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="min-w-[32px] text-center text-lg font-bold tabular-nums" data-testid="text-quantity">
                      {quantity}
                    </span>
                    <button
                      type="button"
                      onClick={increaseQuantity}
                      disabled={isOwnSellerProduct || addToCartMutation.isPending || (!isCartStatePending && (remainingToAdd <= 0 || quantity >= remainingToAdd))}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-background transition-all duration-200 hover:border-primary/50 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      style={{ boxSizing: "border-box" }}
                      data-testid="button-increase-quantity"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  {availableStock > 0 ? (
                    allAvailableItemsAlreadyInCart ? (
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        All available items for this selection are already in your cart
                      </span>
                    ) : isLowStock ? (
                      <span
                        className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold shadow-sm ${
                          isCriticalStock
                            ? "bg-red-500/12 text-red-600 dark:text-red-400 animate-pulse"
                            : "bg-orange-500/12 text-orange-600 dark:text-orange-400 animate-pulse"
                        }`}
                      >
                        <Flame className="h-4 w-4" />
                        {remainingToAdd} left
                      </span>
                    ) : (
                      <span className="text-base text-muted-foreground font-semibold">{remainingToAdd} available</span>
                    )
                  ) : (
                    <span className="text-base text-destructive font-semibold">Out of stock</span>
                  )}
                  {isOwnSellerProduct ? (
                    <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      This is your own product. You can only buy products from other sellers.
                    </span>
                  ) : null}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button
                    size="lg"
                    onClick={handleAddToCart}
                    disabled={!product.isActive || availableStock === 0 || allAvailableItemsAlreadyInCart || addToCartMutation.isPending || isOwnSellerProduct}
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
                    ) : addToCartMutation.isPending ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Adding...
                      </>
                    ) : availableStock === 0 ? (
                      "Out of Stock"
                    ) : isOwnSellerProduct ? (
                      "Your Product"
                    ) : allAvailableItemsAlreadyInCart ? (
                      "Already in Cart"
                    ) : (
                      <>
                        <ShoppingCart className="h-5 w-5 mr-2" />
                        Add to Cart
                      </>
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={handleToggleWishlist}
                    disabled={addToWishlistMutation.isPending || removeFromWishlistMutation.isPending}
                    className={`h-14 w-14 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 shadow-lg hover:shadow-xl border-2
                      ${isWishlisted ? 'border-red-300 bg-red-50 dark:bg-red-950/30 text-red-500 hover:text-red-600 hover:border-red-400' : 'hover:border-primary/50'}`}
                    style={{ boxSizing: 'border-box' }}
                    data-testid="button-wishlist"
                  >
                    {addToWishlistMutation.isPending || removeFromWishlistMutation.isPending ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Heart className={`h-6 w-6 transition-all ${isWishlisted ? 'fill-current scale-110' : ''}`} />
                    )}
                    </Button>

                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleShareOnWhatsApp}
                    className="h-14 w-14 rounded-xl transition-all duration-300 hover:scale-110 active:scale-95 shadow-lg hover:shadow-xl border-2 text-[#25D366] hover:border-[#25D366]"
                    style={{ boxSizing: 'border-box' }}
                    data-testid="button-share-whatsapp"
                    aria-label="Share product on WhatsApp"
                    title="Share on WhatsApp"
                  >
                    <FaWhatsapp className="h-6 w-6" />
                  </Button>
                </div>

                {/* Product page ad placement / fallback information */}
                {shouldShowProductPageAd ? (
                  <ProductPageAd />
                ) : (
                  <div className="mt-6 rounded-2xl border border-border/70 bg-card px-5 py-5 shadow-sm">
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Shopping Information
                      </p>
                      <p className="text-sm text-foreground font-medium">
                        Secure checkout, trusted payment options, and product details you can review before placing your order.
                      </p>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                          <CreditCard className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Flexible Payment Methods</p>
                          <p className="text-sm text-muted-foreground">
                            Available payment options are shown clearly at checkout so you can complete your order with confidence.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                          <ShieldCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Protected Checkout</p>
                          <p className="text-sm text-muted-foreground">
                            Your order is processed through a secure payment flow, with pricing and delivery details confirmed before payment.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                          <BadgeCheck className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-foreground">Order Confidence</p>
                          <p className="text-sm text-muted-foreground">
                            You can view the product photos, watch the video when available, and check the details here so you know exactly what you are ordering.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border/50" style={{ boxSizing: 'border-box' }}>
                <div className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Delivery Information</p>
                      <p className="text-base font-semibold text-foreground mt-1">Fast Delivery</p>
                      <p className="text-sm text-muted-foreground mt-1">{deliveryDurationLabel}</p>

                      {expectedDeliveryText && (
                        <div className="mt-3 border-l-2 border-primary/30 pl-3">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">
                            Expected Delivery
                          </p>
                          <p className="mt-1 text-sm text-foreground leading-relaxed">{expectedDeliveryText}</p>
                        </div>
                      )}
                    </div>
                  </div>
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
            type="button"
            variant="outline"
            size="icon"
            onClick={handleToggleWishlist}
            disabled={addToWishlistMutation.isPending || removeFromWishlistMutation.isPending}
            className={`h-12 w-12 rounded-full flex-shrink-0 ${isWishlisted ? 'text-red-500 border-red-300' : ''}`}
          >
            <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} />
          </Button>
          <Button
            size="lg"
            onClick={handleAddToCart}
            disabled={!product.isActive || availableStock === 0 || allAvailableItemsAlreadyInCart || addToCartMutation.isPending}
            className={`h-12 rounded-full px-8 font-semibold transition-all duration-300 flex-shrink-0
              ${addedToCart ? 'bg-green-600 hover:bg-green-600' : ''}`}
          >
            {addedToCart ? (
              <><Check className="h-5 w-5 mr-1" /> Added</>
            ) : availableStock === 0 ? (
              "Sold Out"
            ) : allAvailableItemsAlreadyInCart ? (
              "Already in Cart"
            ) : (
              <><ShoppingCart className="h-5 w-5 mr-1" /> Add to Cart</>
            )}
          </Button>
        </div>
      </div>

      {/* Bottom spacer for mobile sticky bar */}
      <div className="h-20 lg:hidden" />

      {/* ═══════ IMAGE EXPANSION MODAL ═══════ */}
      {showSizeGuide && (
        <Dialog open={isSizeGuideOpen} onOpenChange={setIsSizeGuideOpen}>
          <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border border-border bg-background p-0">
            <div className="overflow-hidden rounded-[28px] bg-white dark:bg-slate-950">
              <DialogHeader className="border-b border-slate-100 bg-gradient-to-r from-orange-50 via-white to-amber-50 px-6 py-5 sm:px-8 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(24,28,31,0.98),rgba(17,20,23,1))]">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-orange-500 dark:text-orange-300">
                      Size Guide
                    </div>
                    <DialogTitle className="text-2xl font-bold text-slate-900 dark:text-white">
                      Find the best fit before you order
                    </DialogTitle>
                    <DialogDescription className="max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
                      Compare your body measurements or your own clothes with the guide below so you can choose the size that fits you better.
                    </DialogDescription>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="rounded-full bg-white px-3 py-1 text-slate-700 shadow-sm dark:bg-slate-900 dark:text-slate-200">
                      Size displayed: {sizeGuide.displaySystem}
                    </Badge>
                    {selectedSize && (
                      <Badge className="rounded-full bg-slate-900 px-3 py-1 text-white dark:bg-white dark:text-slate-950">
                        Selected size: {selectedSize}
                      </Badge>
                    )}
                  </div>
                </div>

                {sizeOptions.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-3">
                    {sizeOptions.map((size) => {
                      const isActive = size.toLowerCase() === selectedSize.toLowerCase();
                      return (
                        <button
                          key={`size-guide-pill-${size}`}
                          type="button"
                          onClick={() => handleSizeSelect(size)}
                          className={`min-w-[60px] rounded-full border px-4 py-2 text-sm font-semibold transition-all ${
                            isActive
                              ? "border-slate-900 bg-slate-900 text-white shadow-md dark:border-white dark:bg-white dark:text-slate-950"
                              : "border-slate-300 bg-white text-slate-700 hover:border-orange-400 hover:text-slate-900 dark:border-white/15 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-orange-300 dark:hover:text-white"
                          }`}
                        >
                          {size}
                        </button>
                      );
                    })}
                  </div>
                )}
              </DialogHeader>

              <div className="px-6 py-6 sm:px-8">
                <Tabs defaultValue={hasBodyGuide ? "body" : "product"} className="space-y-6">
                  <TabsList className="h-auto rounded-full bg-slate-100 p-1 dark:bg-slate-900/80">
                    {hasBodyGuide && (
                      <TabsTrigger
                        value="body"
                        className="rounded-full px-5 py-2 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-300 dark:data-[state=active]:bg-slate-50 dark:data-[state=active]:text-slate-950"
                      >
                        Body chart
                      </TabsTrigger>
                    )}
                    {hasProductGuide && (
                      <TabsTrigger
                        value="product"
                        className="rounded-full px-5 py-2 text-sm font-semibold data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm dark:text-slate-300 dark:data-[state=active]:bg-slate-50 dark:data-[state=active]:text-slate-950"
                      >
                        Product chart
                      </TabsTrigger>
                    )}
                  </TabsList>

                  {hasBodyGuide && (
                    <TabsContent value="body" className="space-y-5">
                      <div className="space-y-1">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-white">Use your body measurements</h4>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                          Measure your bust, waist, hips, and height, then match them to the row that feels closest to your fit.
                        </p>
                      </div>

                      {sizeGuideAudience && (
                        <SizeGuideIllustrationCard
                          audience={sizeGuideAudience}
                          type="body"
                          row={selectedBodyGuideRow}
                        />
                      )}

                      <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-white/10">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 dark:bg-slate-900/80">
                            <tr className="text-slate-600 dark:text-slate-300">
                              <th className="px-4 py-3 text-left font-semibold">Label Size</th>
                              <th className="px-4 py-3 text-left font-semibold">{sizeGuide.displaySystem === "UK" ? "UK" : "Alt Size"}</th>
                              <th className="px-4 py-3 text-left font-semibold">Bust</th>
                              <th className="px-4 py-3 text-left font-semibold">Waist</th>
                              <th className="px-4 py-3 text-left font-semibold">Hips</th>
                              <th className="px-4 py-3 text-left font-semibold">Height</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bodyGuideRows.map((row) => {
                              const isActive = row.labelSize.toLowerCase() === selectedSize.toLowerCase();
                              return (
                                <tr
                                  key={`body-row-${row.labelSize}`}
                                  className={`border-t transition-colors ${
                                    isActive ? "bg-orange-50/80 dark:bg-orange-400/10" : "hover:bg-slate-50/60 dark:hover:bg-slate-900/70"
                                  }`}
                                >
                                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                                    <div className="flex items-center gap-2">
                                      {isActive && <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />}
                                      <span
                                        className={
                                          isActive
                                            ? "rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
                                            : ""
                                        }
                                      >
                                        {row.labelSize}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">{row.uk || "-"}</td>
                                  <td className="px-4 py-3">{row.bust || "-"}</td>
                                  <td className="px-4 py-3">{row.waist || "-"}</td>
                                  <td className="px-4 py-3">{row.hips || "-"}</td>
                                  <td className="px-4 py-3">{row.height || "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  )}

                  {hasProductGuide && (
                    <TabsContent value="product" className="space-y-5">
                      <div className="space-y-1">
                        <h4 className="text-base font-semibold text-slate-900 dark:text-white">Compare with your own clothes</h4>
                        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">
                          Lay a similar item flat and compare its length, bust, shoulder, and sleeve with the chart below for a more confident fit.
                        </p>
                      </div>

                      {sizeGuideAudience && (
                        <SizeGuideIllustrationCard
                          audience={sizeGuideAudience}
                          type="product"
                          row={selectedProductGuideRow}
                        />
                      )}

                      <div className="overflow-x-auto rounded-[24px] border border-slate-200 dark:border-white/10">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-50 dark:bg-slate-900/80">
                            <tr className="text-slate-600 dark:text-slate-300">
                              <th className="px-4 py-3 text-left font-semibold">Label Size</th>
                              <th className="px-4 py-3 text-left font-semibold">Length</th>
                              <th className="px-4 py-3 text-left font-semibold">Bust</th>
                              <th className="px-4 py-3 text-left font-semibold">Waist</th>
                              <th className="px-4 py-3 text-left font-semibold">Hips</th>
                              <th className="px-4 py-3 text-left font-semibold">Shoulder</th>
                              <th className="px-4 py-3 text-left font-semibold">Sleeve</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productGuideRows.map((row) => {
                              const isActive = row.labelSize.toLowerCase() === selectedSize.toLowerCase();
                              return (
                                <tr
                                  key={`product-row-${row.labelSize}`}
                                  className={`border-t transition-colors ${
                                    isActive ? "bg-orange-50/80 dark:bg-orange-400/10" : "hover:bg-slate-50/60 dark:hover:bg-slate-900/70"
                                  }`}
                                >
                                  <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">
                                    <div className="flex items-center gap-2">
                                      {isActive && <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />}
                                      <span
                                        className={
                                          isActive
                                            ? "rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950"
                                            : ""
                                        }
                                      >
                                        {row.labelSize}
                                      </span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">{row.length || "-"}</td>
                                  <td className="px-4 py-3">{row.bust || "-"}</td>
                                  <td className="px-4 py-3">{row.waist || "-"}</td>
                                  <td className="px-4 py-3">{row.hips || "-"}</td>
                                  <td className="px-4 py-3">{row.shoulder || "-"}</td>
                                  <td className="px-4 py-3">{row.sleeve || "-"}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>
                  )}
                </Tabs>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

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
              {discount}% OFF
            </div>
          )}

          <div className="relative mx-4 flex w-full max-w-5xl items-center justify-center" onClick={(e) => e.stopPropagation()} style={{ boxSizing: 'border-box' }}>
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
            <div className="flex max-h-[88vh] w-full max-w-full flex-col gap-4 overflow-hidden rounded-2xl bg-background" style={{ boxSizing: 'border-box' }}>
              <div className="flex min-h-0 flex-1 w-full items-center justify-center p-4 sm:p-6" style={{ boxSizing: 'border-box' }}>
                  <img
                    src={activeGalleryImages[selectedImage] || activeGalleryImages[0]}
                  alt={selectedVariant ? `${product.name} - ${selectedVariant.color || ''} ${selectedVariant.size || ''}`.trim() : product.name}
                  className="max-w-full max-h-full w-auto h-auto object-contain"
                  style={{ boxSizing: 'border-box', maxHeight: 'calc(88vh - 220px)' }}
                  data-testid="img-expanded"
                />
              </div>

              {/* Variant Thumbnails in Expanded Modal - Moved up */}
              {(colorVariantGroups.length > 0 || selectedVariantImages.length > 1 || (colorVariantGroups.length === 0 && product.images.length > 1)) && (
                <div
                  className="shrink-0 px-4 pb-4 pt-0 sm:px-8"
                  style={{ boxSizing: 'border-box' }}
                >
              {colorVariantGroups.length > 0 && (
                <div className="pb-3" style={{ boxSizing: 'border-box' }}>
                  <div
                    className="flex gap-3 overflow-x-auto overflow-y-hidden justify-center scrollbar-hide py-1 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {colorVariantGroups.map((variant) => {
                      const accentColor = resolveVariantAccentColor(variant.color, isDarkMode);
                      const isActive = selectedColorGroup?.id === variant.id;
                      return (
                        <button
                          key={variant.id}
                          onClick={() => handleColorSelect(variant.color)}
                          className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-200 touch-manipulation ${
                            isActive
                              ? "scale-105 shadow-lg border-[5px]"
                            : "border border-border opacity-80 hover:opacity-100 hover:scale-105"
                          }`}
                          style={
                            isActive
                              ? {
                                  boxSizing: "border-box",
                                  borderColor: accentColor,
                                  boxShadow: `0 10px 26px -18px ${accentColor}`,
                                }
                              : { boxSizing: "border-box" }
                          }
                          data-testid={`variant-expanded-thumbnail-${variant.id}`}
                        >
                          <img
                            src={variant.images[0] || product?.images?.[0] || "/placeholder-product.jpg"}
                            alt={`${product.name} - ${variant.color || ""}`.trim()}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs px-1 py-0.5 text-center">
                            {variant.color ? variant.color : "Variant"}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedVariantImages.length > 1 && (
                <div style={{ boxSizing: 'border-box' }}>
                  <div
                    className="flex gap-3 overflow-x-auto overflow-y-hidden justify-center scrollbar-hide py-1 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {selectedVariantImages.map((image, idx) => (
                      <button
                        key={`selected-variant-expanded-${idx}`}
                        onClick={() => setSelectedImage(idx)}
                        className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-200 touch-manipulation
                          ${selectedImage === idx
                            ? 'border-[5px] border-primary scale-105 shadow-lg'
                            : 'ring-2 ring-border opacity-80 hover:opacity-100 hover:scale-105'
                          }`}
                        style={{ boxSizing: 'border-box' }}
                        data-testid={`selected-variant-expanded-${idx}`}
                      >
                        <img src={image} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Product Image Thumbnails in Expanded Modal - Fallback - Moved up */}
              {colorVariantGroups.length === 0 && product.images.length > 1 && (
                <div style={{ boxSizing: 'border-box' }}>
                  <div
                    className="flex gap-3 overflow-x-auto overflow-y-hidden justify-center scrollbar-hide py-1 [&::-webkit-scrollbar]:hidden"
                    style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                  >
                    {product.images.map((image, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedImage(idx)}
                        className={`flex-shrink-0 w-14 h-14 rounded-xl overflow-hidden transition-all duration-200 touch-manipulation
                          ${selectedImage === idx
                            ? 'border-[5px] border-primary scale-105 shadow-lg'
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
              )}
            </div>

            {/* Navigation arrows for variants */}
            {colorVariantGroups.length > 0 && colorVariantGroups.length > 1 && (
              <>
                <button
                  onClick={() => {
                        const currentIndex = colorVariantGroups.findIndex(v => v.id === selectedColorGroup?.id);
                        const prevIndex = (currentIndex - 1 + colorVariantGroups.length) % colorVariantGroups.length;
                        handleColorSelect(colorVariantGroups[prevIndex].color);
                  }}
                  className="absolute left-6 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/35 bg-slate-900/78 text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-slate-900/92 touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-prev-variant"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={() => {
                        const currentIndex = colorVariantGroups.findIndex(v => v.id === selectedColorGroup?.id);
                        const nextIndex = (currentIndex + 1) % colorVariantGroups.length;
                        handleColorSelect(colorVariantGroups[nextIndex].color);
                  }}
                  className="absolute right-6 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/35 bg-slate-900/78 text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-slate-900/92 touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-next-variant"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              </>
            )}

            {/* Navigation arrows for product images - fallback */}
            {colorVariantGroups.length === 0 && product.images.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedImage((selectedImage - 1 + product.images.length) % product.images.length)}
                  className="absolute left-6 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/35 bg-slate-900/78 text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-slate-900/92 touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-prev-image"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={() => setSelectedImage((selectedImage + 1) % product.images.length)}
                  className="absolute right-6 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/35 bg-slate-900/78 text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-slate-900/92 touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-next-image"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              </>
            )}

            {selectedVariantImages.length > 1 && (
              <>
                <button
                  onClick={() => setSelectedImage((selectedImage - 1 + selectedVariantImages.length) % selectedVariantImages.length)}
                  className="absolute left-6 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/35 bg-slate-900/78 text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-slate-900/92 touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-prev-selected-variant-image"
                >
                  <ChevronLeft className="w-8 h-8 text-white" />
                </button>
                <button
                  onClick={() => setSelectedImage((selectedImage + 1) % selectedVariantImages.length)}
                  className="absolute right-6 top-1/2 z-30 flex h-16 w-16 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/35 bg-slate-900/78 text-white shadow-2xl backdrop-blur-md transition-colors hover:bg-slate-900/92 touch-manipulation"
                  style={{ boxSizing: 'border-box' }}
                  data-testid="button-next-selected-variant-image"
                >
                  <ChevronRight className="w-8 h-8 text-white" />
                </button>
              </>
            )}

            {/* Swipe indicators for variants */}
            {colorVariantGroups.length > 0 && colorVariantGroups.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 sm:hidden">
                {colorVariantGroups.map((variant) => (
                  <div
                    key={variant.id}
                    className={`w-2 h-2 rounded-full transition-all duration-200 ${
                      selectedColorGroup?.id === variant.id ? 'bg-white scale-125' : 'bg-white/40'
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

            {selectedVariantImages.length > 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 sm:hidden">
                {selectedVariantImages.map((_, idx) => (
                  <div
                    key={`selected-variant-indicator-${idx}`}
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
