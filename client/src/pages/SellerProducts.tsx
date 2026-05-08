import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { SellerUpgradeModal } from "@/components/SellerUpgradeModal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package, Edit, Trash2, Plus, Eye, AlertCircle, AlertTriangle, RefreshCw, RotateCcw, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";
import MediaUploadInput from "@/components/MediaUploadInput";
import ProductGallery from "@/components/ProductGallery";
import { CategorySelect } from "@/components/CategorySelect";
import { PageLoadingState } from "@/components/ui/loading-state";
import { DynamicFieldRenderer } from "@/components/DynamicFieldRenderer";
import {
  StoreType,
  getStoreTypeLabel,
  getStoreTypeProductFields,
  getStoreTypeVariantConfig,
  buildStoreTypeProductDefaults,
} from "@shared/storeTypes";

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  costPrice: string | null;
  images: string[];
  video: string | null;
  category: string | null;
  categoryId: string | null;
  sellerId: string;
  storeId: string | null;
  stock: number;
  tags: string[] | null;
  deliveryDuration: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  dynamicFields?: Record<string, any>;
}

interface Store {
  id: string;
  storeType: StoreType;
}

interface PlatformSettingsLite {
  allowSharedVariantColorStock?: boolean;
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

const getVariantImages = (variant: any): string[] => {
  if (Array.isArray(variant?.images)) {
    return variant.images.map((value: unknown) => String(value || "").trim()).filter(Boolean);
  }
  if (variant?.image) {
    return [String(variant.image).trim()].filter(Boolean);
  }
  return [];
};

const resolveProductImagesFromVariants = (variants: any[], fallbackImages: string[] = []) => {
  const uniqueImages = Array.from(
    new Set(
      variants.flatMap((variant) => getVariantImages(variant))
    ),
  ).filter(Boolean);

  return uniqueImages.length > 0 ? uniqueImages.slice(0, 8) : fallbackImages;
};

const resolveProductStockFromVariants = (variants: any[], fallbackStock: number) => {
  if (!variants.length) return fallbackStock;
  return variants.reduce((total, variant) => total + (Number(variant?.stock) || 0), 0);
};

const normalizeVariantColor = (value: unknown) => String(value || "").trim().toLowerCase();
const normalizeVariantOptionKey = (value: unknown) => String(value || "").trim().toLowerCase();
const splitVariantSizes = (value: unknown) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const sanitizeLoadedVariants = (variants: any[]) =>
  variants
    .filter((variant) => Boolean(variant?.id))
    .map((variant) => ({
      ...variant,
      color: String(variant?.color || "").trim(),
      size: splitVariantSizes(variant?.size).join(", "),
      images: getVariantImages(variant),
      stock: Number(variant?.stock) || 0,
      originalStock: Number(variant?.originalStock ?? variant?.stock) || 0,
    }));

const getVariantSummaryFallback = (product?: Product | null) => {
  const summary = (product as any)?.dynamicFields?.variantSummary;
  return Array.isArray(summary) ? sanitizeLoadedVariants(summary) : [];
};

const getProductRemainingStock = (product: Product) => {
  const variantSummary = getVariantSummaryFallback(product);
  const productStock = Number(product?.stock);
  const normalizedProductStock = Number.isFinite(productStock) ? Math.max(0, productStock) : null;
  if (variantSummary.length > 0) {
    const summaryStock = variantSummary.reduce((total, variant) => total + (Number(variant?.stock) || 0), 0);
    if (normalizedProductStock !== null) {
      return Math.min(summaryStock, normalizedProductStock);
    }
    return summaryStock;
  }

  if (normalizedProductStock !== null) {
    return normalizedProductStock;
  }

  return Math.max(0, Number(product?.stock || 0));
};

const buildVariantSummarySnapshotLocal = (variants: any[] = []) =>
  sanitizeLoadedVariants(variants).map((variant) => {
    const images = getVariantImages(variant);
    return {
      id: variant.id,
      color: String(variant?.color || "").trim(),
      size: String(variant?.size || "").trim(),
      images,
      image: images[0] || null,
      stock: Number(variant?.stock) || 0,
      originalStock: Number(variant?.originalStock ?? variant?.stock) || 0,
    };
  });

const buildProductDynamicFieldsPayload = (
  storeType: StoreType | undefined,
  rawDynamicFields: Record<string, any> | undefined,
  extras: {
    homepageFeatured: boolean;
    homepageNewArrival: boolean;
    sizeGuide: SizeGuideData;
    variantSummary: any[];
  },
) => {
  const currentDynamicFields = rawDynamicFields || {};
  const storeSpecific = storeType
    ? buildStoreTypeProductDefaults(storeType, currentDynamicFields.storeSpecific)
    : currentDynamicFields.storeSpecific || {};

  return {
    ...currentDynamicFields,
    storeType: storeType || currentDynamicFields.storeType || null,
    homepageFeatured: extras.homepageFeatured,
    homepageNewArrival: extras.homepageNewArrival,
    sizeGuide: extras.sizeGuide,
    variantSummary: extras.variantSummary,
    storeSpecific,
  };
};

async function requestSameOriginJson<T>(method: string, url: string, data?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(parsed?.error || text || `${method} ${url} failed`);
  }

  return parsed as T;
}

interface SellerCategoryRequest {
  categoryId: string;
  name: string;
  slug: string;
  image: string | null;
  storeType: string | null;
  requestedAt: string;
  status: "pending" | "approved" | "rejected";
  message: string;
}

const DELIVERY_DURATION_PRESETS = [
  "Same day",
  "Next day",
  "1-2 days",
  "2-3 days",
  "3-5 business days",
  "5-7 business days",
  "1-2 weeks",
] as const;

const SIZE_DISPLAY_SYSTEMS = [
  "Standard size",
  "UK",
  "US",
  "EU",
] as const;

const GHANAIAN_FOOD_PRESETS: { name: string; category: string; url: string }[] = [
  // Rice & Grains
  { name: "Jollof Rice", category: "Rice & Grains", url: "https://images.unsplash.com/photo-1565557623262-b51c2513a641?w=300&h=300&fit=crop&q=80" },
  { name: "Waakye", category: "Rice & Grains", url: "https://images.unsplash.com/photo-1603048297172-c92544798d5a?w=300&h=300&fit=crop&q=80" },
  { name: "Fried Rice", category: "Rice & Grains", url: "https://images.unsplash.com/photo-1567620832903-9fc6debc209f?w=300&h=300&fit=crop&q=80" },
  { name: "Rice & Stew", category: "Rice & Grains", url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&h=300&fit=crop&q=80" },
  // Soups & Stews
  { name: "Groundnut Soup", category: "Soups & Stews", url: "https://images.unsplash.com/photo-1547592180-85f173990554?w=300&h=300&fit=crop&q=80" },
  { name: "Light Soup", category: "Soups & Stews", url: "https://images.unsplash.com/photo-1551218372-a8789b81b253?w=300&h=300&fit=crop&q=80" },
  { name: "Kontomire Stew", category: "Soups & Stews", url: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=300&h=300&fit=crop&q=80" },
  { name: "Tomato Stew", category: "Soups & Stews", url: "https://images.unsplash.com/photo-1602030638-d73d6d5e7ce4?w=300&h=300&fit=crop&q=80" },
  { name: "Bean Stew", category: "Soups & Stews", url: "https://images.unsplash.com/photo-1481671703460-040cb8a2d909?w=300&h=300&fit=crop&q=80" },
  // Staples
  { name: "Fufu", category: "Staples", url: "https://images.unsplash.com/photo-1574484284002-952d92456975?w=300&h=300&fit=crop&q=80" },
  { name: "Banku", category: "Staples", url: "https://images.unsplash.com/photo-1555939594-58329b5f9f47?w=300&h=300&fit=crop&q=80" },
  { name: "Kenkey", category: "Staples", url: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&h=300&fit=crop&q=80&sig=kenkey" },
  { name: "Yam", category: "Staples", url: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=300&h=300&fit=crop&q=80" },
  // Proteins
  { name: "Grilled Tilapia", category: "Proteins", url: "https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=300&h=300&fit=crop&q=80" },
  { name: "Grilled Chicken", category: "Proteins", url: "https://images.unsplash.com/photo-1582169296194-e4d644c48063?w=300&h=300&fit=crop&q=80" },
  { name: "Grilled Meat / Kebab", category: "Proteins", url: "https://images.unsplash.com/photo-1576866209830-589e1bfbaa4d?w=300&h=300&fit=crop&q=80" },
  { name: "Egg Stew", category: "Proteins", url: "https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=300&h=300&fit=crop&q=80" },
  // Snacks & Street Food
  { name: "Kelewele (Spiced Plantain)", category: "Snacks & Street Food", url: "https://images.unsplash.com/photo-1587593810167-a84920ea0781?w=300&h=300&fit=crop&q=80" },
  { name: "Fried Plantain", category: "Snacks & Street Food", url: "https://images.unsplash.com/photo-1528712306091-ed0763094c98?w=300&h=300&fit=crop&q=80" },
  { name: "Puff Puff", category: "Snacks & Street Food", url: "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=300&h=300&fit=crop&q=80" },
  { name: "Chin Chin", category: "Snacks & Street Food", url: "https://images.unsplash.com/photo-1541592106381-b31e9677c0e5?w=300&h=300&fit=crop&q=80" },
  { name: "Bofrot / Togbei", category: "Snacks & Street Food", url: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?w=300&h=300&fit=crop&q=80" },
  // Beverages
  { name: "Sobolo (Hibiscus)", category: "Beverages", url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=300&h=300&fit=crop&q=80" },
  { name: "Fresh Juice", category: "Beverages", url: "https://images.unsplash.com/photo-1494390248081-4e521a5940db?w=300&h=300&fit=crop&q=80" },
];

const createEmptySizeGuideRow = (labelSize = ""): SizeGuideRow => ({
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

  return orderedSizes.map((size) => rowMap.get(size.toLowerCase()) || createEmptySizeGuideRow(size));
};

const buildSizeGuideFromSource = (raw: any, sizes: string[]): SizeGuideData => ({
  displaySystem: SIZE_DISPLAY_SYSTEMS.includes(raw?.displaySystem as any)
    ? raw.displaySystem
    : "Standard size",
  bodyRows: normalizeSizeGuideRows(raw?.bodyRows, sizes),
  productRows: normalizeSizeGuideRows(raw?.productRows, sizes),
});

const getDeliveryDurationPreset = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return DELIVERY_DURATION_PRESETS.includes(normalized as any) ? normalized : "custom";
};

const requestCategorySchema = z.object({
  name: z.string().min(2, "Category name must be at least 2 characters"),
  slug: z.string().min(2, "Slug is required"),
  description: z.string().optional(),
  image: z.string().optional().or(z.literal("")),
});

// Base product schema (media rules: 3-8 images required, video required)
const baseProductSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
  compareAtPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format").optional().or(z.literal("")),
  categoryId: z.string().optional(),
  stockQuantity: z.string().optional().default("0"),
  tags: z.string().optional(),
  images: z.array(z.string().url()).max(8, "Maximum 8 images allowed").default([]),
  videoUrl: z.string().url("Enter a valid video link").optional().or(z.literal("")),
  deliveryDuration: z.string().optional(),
  inStock: z.boolean().default(true),
  homepageFeatured: z.boolean().default(false),
  homepageNewArrival: z.boolean().default(false),
  dynamicFields: z.record(z.any()).optional(),
});

function FoodImageGallery({ images, onChange }: { images: string[]; onChange: (imgs: string[]) => void }) {
  const foodCategories = Array.from(new Set(GHANAIAN_FOOD_PRESETS.map((f) => f.category)));
  const [activeCategory, setActiveCategory] = useState<string>(foodCategories[0]);
  const presetInView = GHANAIAN_FOOD_PRESETS.filter((f) => f.category === activeCategory);

  return (
    <Card className="p-4 space-y-4">
      <div>
        <p className="text-base font-semibold">Product Images</p>
        <p className="text-sm text-muted-foreground">Pick from our Ghanaian food gallery or upload your own photos (max 8).</p>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {foodCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${activeCategory === cat ? "bg-primary text-primary-foreground border-primary" : "bg-background text-foreground border-border hover:border-primary/50"}`}
            >
              {cat}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {presetInView.map((food) => {
            const alreadyAdded = images.includes(food.url);
            return (
              <button
                key={food.url}
                type="button"
                disabled={alreadyAdded || images.length >= 8}
                onClick={() => { if (!alreadyAdded && images.length < 8) onChange([...images, food.url]); }}
                title={food.name}
                className={`relative aspect-square overflow-hidden rounded-lg border-2 transition-all ${alreadyAdded ? "border-primary opacity-70" : "border-transparent hover:border-primary/60"}`}
              >
                <img src={food.url} alt={food.name} className="h-full w-full object-cover" loading="lazy" />
                <span className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 text-[10px] text-white leading-tight truncate text-center">{food.name}</span>
                {alreadyAdded && (
                  <span className="absolute inset-0 flex items-center justify-center bg-primary/20">
                    <span className="text-primary text-xl font-bold drop-shadow">✓</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {images.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Selected Images ({images.length}/8)</p>
          <div className="grid grid-cols-4 gap-2">
            {images.map((url, idx) => (
              <div key={idx} className="relative aspect-square overflow-hidden rounded-lg border">
                <img src={url} alt={`Product ${idx + 1}`} className="h-full w-full object-cover" />
                {idx === 0 && <span className="absolute top-1 left-1 rounded bg-primary px-1 py-0.5 text-[10px] font-medium text-primary-foreground">Primary</span>}
                <button
                  type="button"
                  onClick={() => onChange(images.filter((_, i) => i !== idx))}
                  className="absolute top-1 right-1 rounded-full bg-destructive p-0.5 text-destructive-foreground hover:bg-destructive/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < 8 && (
              <div className="aspect-square rounded-lg border-2 border-dashed flex items-center justify-center p-1">
                <MediaUploadInput
                  id="food-store-extra-img"
                  label=""
                  value=""
                  onChange={(url) => { if (url && images.length < 8) onChange([...images, url]); }}
                  accept="image"
                  placeholder="Upload"
                  compact={true}
                />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed p-4 text-center space-y-2">
          <p className="text-sm text-muted-foreground">No images selected yet. Pick from the gallery above or upload your own.</p>
          <MediaUploadInput
            id="food-store-img-upload"
            label="Upload Image"
            value=""
            onChange={(url) => { if (url) onChange([url]); }}
            accept="image"
            placeholder="Upload image or enter URL"
          />
        </div>
      )}
    </Card>
  );
}

function ProductFormDialog({ product, mode }: { product?: Product; mode: "create" | "edit" }) {
  const [open, setOpen] = useState(false);
  const [isCustomDeliveryDuration, setIsCustomDeliveryDuration] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch seller's store to get storeType
  const { data: store } = useQuery<Store>({
    queryKey: ["/api/stores/my-store"],
    enabled: !!user?.id,
  });

  const { data: platformSettings } = useQuery<PlatformSettingsLite>({
    queryKey: ["/api/platform-settings"],
    enabled: !!user?.id,
  });

  const storeTypeProductFields = useMemo(
    () => (store?.storeType ? getStoreTypeProductFields(store.storeType) : []),
    [store?.storeType],
  );
  const variantConfig = useMemo(
    () => getStoreTypeVariantConfig(store?.storeType || null),
    [store?.storeType],
  );

  const { data: freshProduct } = useQuery<Product | null>({
    queryKey: ["/api/products", product?.id, "seller-edit"],
    queryFn: async () => {
      if (!product?.id) return null;
      try {
        const res = await fetch(`/api/products/${product.id}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) throw new Error("Failed to load product");
        return res.json();
      } catch {
        return null;
      }
    },
    enabled: mode === "edit" && open && !!product?.id,
    refetchOnMount: "always",
  });

  const effectiveProduct = freshProduct || product;

  const productSchema = baseProductSchema;
  type ProductFormData = z.infer<typeof productSchema>;

  const buildInitialFormValues = useCallback(
    (sourceProduct?: Product | null): ProductFormData => sourceProduct ? {
      name: sourceProduct.name,
      description: sourceProduct.description,
      price: sourceProduct.price,
      compareAtPrice: sourceProduct.costPrice || "",
      categoryId: sourceProduct.categoryId || undefined,
      stockQuantity: sourceProduct.stock.toString(),
      tags: sourceProduct.tags?.join(", ") || "",
      images: sourceProduct.images || [],
      videoUrl: sourceProduct.video || "",
      deliveryDuration: (sourceProduct as any).deliveryDuration || "",
      inStock: true,
      homepageFeatured: Boolean(sourceProduct.dynamicFields?.homepageFeatured),
      homepageNewArrival: Boolean(sourceProduct.dynamicFields?.homepageNewArrival),
      dynamicFields: {
        ...(sourceProduct.dynamicFields || {}),
        storeSpecific: store?.storeType
          ? buildStoreTypeProductDefaults(store.storeType, sourceProduct.dynamicFields?.storeSpecific)
          : sourceProduct.dynamicFields?.storeSpecific || {},
      },
    } : {
      name: "",
      description: "",
      price: "",
      compareAtPrice: "",
      categoryId: undefined,
      stockQuantity: "0",
      tags: "",
      images: [],
      videoUrl: "",
      deliveryDuration: "",
      inStock: true,
      homepageFeatured: false,
      homepageNewArrival: false,
      dynamicFields: {
        storeSpecific: store?.storeType ? buildStoreTypeProductDefaults(store.storeType) : {},
      },
    },
    [store?.storeType],
  );

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: buildInitialFormValues(effectiveProduct),
  });
  const initializedSnapshotRef = useRef<string>("");

  const watchedDeliveryDuration = form.watch("deliveryDuration");
  const watchedDynamicFields = form.watch("dynamicFields");
  const selectedDeliveryPreset = getDeliveryDurationPreset(watchedDeliveryDuration);
  const showCustomDeliveryDurationInput =
    isCustomDeliveryDuration || selectedDeliveryPreset === "custom";

  // Variant management state
  const [productVariants, setProductVariants] = useState<any[]>([]);
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [editingVariant, setEditingVariant] = useState<any>(null);
  const [isVariantSubmitting, setIsVariantSubmitting] = useState(false);
  const [activeVariantGroupId, setActiveVariantGroupId] = useState<string | null>(null);
  const [sizeGuide, setSizeGuide] = useState<SizeGuideData>(() =>
    buildSizeGuideFromSource(effectiveProduct?.dynamicFields?.sizeGuide, []),
  );

  // Fetch variants when editing a product
  const activeProductId = effectiveProduct?.id || product?.id;
  const variantsQueryKey = activeProductId ? [`/api/products/${activeProductId}/variants`] : ["/api/products/variants/none"];

  const { data: existingVariants } = useQuery<any[]>({
    queryKey: variantsQueryKey,
    queryFn: async () => {
      if (!activeProductId) return [];
      return requestSameOriginJson<any[]>("GET", `/api/products/${activeProductId}/variants`);
    },
    enabled: !!activeProductId && open,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: !!activeProductId && open ? 15000 : false,
    staleTime: 0,
  });

  const variantSizeLabels = useMemo(
    () =>
      Array.from(
        new Set(
          productVariants.flatMap((variant) => {
            const normalizedSizes = Array.isArray(variant?.sizes) && variant.sizes.length > 0
              ? variant.sizes
              : splitVariantSizes(variant?.size);
            return normalizedSizes.map((value: unknown) => String(value || "").trim()).filter(Boolean);
          }),
        ),
      ),
    [productVariants],
  );

  useEffect(() => {
    if (mode === "edit" && open) {
      const fallbackVariants = getVariantSummaryFallback(effectiveProduct);
      if (fallbackVariants.length > 0) {
        setProductVariants(fallbackVariants);
      }
    }
  }, [mode, open, effectiveProduct]);

  // Update variants when fetched
  useEffect(() => {
    if (Array.isArray(existingVariants) && existingVariants.length > 0) {
      setProductVariants(sanitizeLoadedVariants(existingVariants));
    } else if (mode === "edit" && Array.isArray(existingVariants) && existingVariants.length === 0) {
      setProductVariants(getVariantSummaryFallback(effectiveProduct));
    } else if (mode === "create" && open && productVariants.length === 0) {
      setProductVariants([]);
    }
  }, [existingVariants, mode, open, productVariants.length, effectiveProduct]);

  useEffect(() => {
    if (!open || !activeProductId) return;

    let cancelled = false;

    const loadVariants = async () => {
      try {
        const latestVariants = await requestSameOriginJson<any[]>("GET", `/api/products/${activeProductId}/variants`);
        if (!cancelled) {
          const normalizedVariants = Array.isArray(latestVariants) ? sanitizeLoadedVariants(latestVariants) : [];
          setProductVariants(normalizedVariants.length > 0 ? normalizedVariants : getVariantSummaryFallback(effectiveProduct));
        }
      } catch {
        if (!cancelled) {
          setProductVariants(getVariantSummaryFallback(effectiveProduct));
        }
      }
    };

    loadVariants();

    return () => {
      cancelled = true;
    };
  }, [open, activeProductId, effectiveProduct]);

  useEffect(() => {
    if (!open) return;
    setSizeGuide(buildSizeGuideFromSource(effectiveProduct?.dynamicFields?.sizeGuide, variantSizeLabels));
  }, [open, effectiveProduct]);

  useEffect(() => {
    if (!open) return;
    setSizeGuide((prev) => buildSizeGuideFromSource(prev, variantSizeLabels));
  }, [open, variantSizeLabels]);

  useEffect(() => {
    if (!open || !store?.storeType) return;

    const currentDynamicFields = watchedDynamicFields || {};
    const normalizedStoreSpecific = buildStoreTypeProductDefaults(
      store.storeType,
      currentDynamicFields.storeSpecific,
    );

    const currentSerialized = JSON.stringify(currentDynamicFields.storeSpecific || {});
    const normalizedSerialized = JSON.stringify(normalizedStoreSpecific);

    if (currentSerialized !== normalizedSerialized) {
      form.setValue(
        "dynamicFields",
        {
          ...currentDynamicFields,
          storeSpecific: normalizedStoreSpecific,
        },
        { shouldDirty: false, shouldTouch: false },
      );
    }
  }, [open, store?.storeType, watchedDynamicFields, form]);

  // Reset form when the dialog first opens, and only hydrate fresher product data
  // while the form is still untouched.
  useEffect(() => {
    if (!open) {
      initializedSnapshotRef.current = "";
      return;
    }

    const sourceProduct = freshProduct || product || null;
    const snapshot = JSON.stringify({
      id: sourceProduct?.id || "create",
      updatedAt: sourceProduct?.updatedAt || "",
      storeType: store?.storeType || "",
    });
    const shouldHydrate =
      !initializedSnapshotRef.current ||
      (!form.formState.isDirty && initializedSnapshotRef.current !== snapshot);

    if (!shouldHydrate) return;

    form.reset(buildInitialFormValues(sourceProduct));
    initializedSnapshotRef.current = snapshot;

    const initialDeliveryDuration = String(sourceProduct?.deliveryDuration || "").trim();
    setIsCustomDeliveryDuration(
      Boolean(initialDeliveryDuration) &&
        !DELIVERY_DURATION_PRESETS.includes(initialDeliveryDuration as any),
    );
  }, [open, freshProduct, product, store?.storeType, form, buildInitialFormValues]);

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const normalizedCategoryId = String(data.categoryId || "").trim() || undefined;

      const noVariantsAllowed = store?.storeType === "food_beverages";
      const directStock = Math.max(0, parseInt(data.stockQuantity || "0", 10) || 0);

      const productData: any = {
        name: data.name,
        description: data.description,
        price: data.price,
        costPrice: data.compareAtPrice || null,
        categoryId: normalizedCategoryId,
        stock: productVariants.length > 0
          ? resolveProductStockFromVariants(productVariants, directStock)
          : directStock,
        images: resolveProductImagesFromVariants(productVariants, data.images || []),
        video: data.videoUrl || null,
        deliveryDuration: data.deliveryDuration || null,
        sellerId: user.id,
        storeId: store?.id || null,
        dynamicFields: {
          ...buildProductDynamicFieldsPayload(store?.storeType, data.dynamicFields, {
            homepageFeatured: Boolean(data.homepageFeatured),
            homepageNewArrival: Boolean(data.homepageNewArrival),
            sizeGuide,
            variantSummary: buildVariantSummarySnapshotLocal(productVariants),
          }),
        },
      };

      productData.tags = data.tags
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      if (productVariants.length === 0 && !noVariantsAllowed) {
        throw new Error("Add at least one variant before saving this product");
      }

      return requestSameOriginJson<any>("POST", "/api/products", productData);
    },
    onSuccess: async (createdProduct: any) => {
      // Create variants if any exist
      if (productVariants.length > 0) {
        try {
          for (const variant of productVariants) {
            if (variant.id?.startsWith("temp-")) {
              const { id, ...variantData } = variant;
              await requestSameOriginJson("POST", `/api/products/${createdProduct.id}/variants`, variantData);
            }
          }
        } catch (error: any) {
          console.error("Failed to create variants:", error);
          toast({
            title: "Warning",
            description: "Product created but some variants failed to save",
            variant: "destructive",
          });
        }
      }

      toast({
        title: "Success",
        description: "Product created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller-dashboard", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/new-arrivals"] });
      setOpen(false);
      form.reset();
      setProductVariants([]);
    },
    onError: async (error: any, variables: ProductFormData) => {
      const isVariantGuard = error?.message === "Add at least one variant before saving this product";
      toast({
        title: isVariantGuard ? "Variant required" : "Failed to save product",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
      // Attempt draft save for server-side failures (not client-side validation)
      if (!isVariantGuard && user?.id) {
        try {
          const directStock = Math.max(0, parseInt(variables.stockQuantity || "0", 10) || 0);
          await requestSameOriginJson<any>("POST", "/api/products", {
            name: variables.name,
            description: variables.description,
            price: variables.price || "0",
            costPrice: variables.compareAtPrice || null,
            stock: productVariants.length > 0 ? resolveProductStockFromVariants(productVariants, directStock) : directStock,
            images: resolveProductImagesFromVariants(productVariants, variables.images || []),
            video: variables.videoUrl || null,
            deliveryDuration: variables.deliveryDuration || null,
            sellerId: user.id,
            storeId: store?.id || null,
            isActive: false,
            dynamicFields: variables.dynamicFields || {},
            tags: variables.tags ? variables.tags.split(",").map((t: string) => t.trim()).filter(Boolean) : [],
          });
          toast({
            title: "Saved as draft",
            description: "Product saved as an inactive draft. Activate it from your product list when ready.",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
        } catch {
          // Draft save failed silently — user already has the error toast
        }
      }
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const normalizedCategoryId = String(data.categoryId || "").trim() || undefined;

      const directStockUpd = Math.max(0, parseInt(data.stockQuantity || "0", 10) || 0);
      const updateData: any = {
        name: data.name,
        description: data.description,
        price: data.price,
        costPrice: data.compareAtPrice || null,
        categoryId: normalizedCategoryId,
        stock: productVariants.length > 0
          ? resolveProductStockFromVariants(productVariants, directStockUpd)
          : directStockUpd,
        images: resolveProductImagesFromVariants(productVariants, data.images || effectiveProduct?.images || []),
        video: data.videoUrl || null,
        deliveryDuration: data.deliveryDuration || null,
        dynamicFields: {
          ...buildProductDynamicFieldsPayload(store?.storeType, data.dynamicFields, {
            homepageFeatured: Boolean(data.homepageFeatured),
            homepageNewArrival: Boolean(data.homepageNewArrival),
            sizeGuide,
            variantSummary: buildVariantSummarySnapshotLocal(productVariants),
          }),
        },
      };

      updateData.tags = data.tags
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      return requestSameOriginJson<any>("PATCH", `/api/products/${product?.id}`, updateData);
    },
    onSuccess: (updatedProduct: any) => {
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
      if (updatedProduct?.id) {
        queryClient.setQueryData(["/api/products", updatedProduct.id], updatedProduct);
        queryClient.setQueryData(["/api/products", updatedProduct.id, "seller-edit"], updatedProduct);
      }
      queryClient.setQueryData<Product[] | undefined>(["/api/products", "seller", user?.id], (current) =>
        Array.isArray(current)
          ? current.map((item) => (item.id === updatedProduct?.id ? { ...item, ...updatedProduct } : item))
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller-dashboard", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product?.id, "seller-edit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", updatedProduct?.id, "seller-edit"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/new-arrivals"] });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update product",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    const isFoodStore = store?.storeType === "food_beverages";
    if (productVariants.length === 0 && !isFoodStore) {
      toast({
        title: "Variant required",
        description: `Add at least one ${variantConfig.groupLabel.toLowerCase()} variant before saving.`,
        variant: "destructive",
      });
      return;
    }
    if (mode === "create") {
      createProductMutation.mutate(data);
    } else {
      updateProductMutation.mutate(data);
    }
  };

  // Variant management functions
  const handleCreateVariant = async (variantData: any) => {
    try {
      setIsVariantSubmitting(true);
      setActiveVariantGroupId(null);
      const normalizedSizes = Array.isArray(variantData?.sizes)
        ? variantData.sizes.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [String(variantData?.size || "").trim()].filter(Boolean);
      if (normalizedSizes.length === 0) {
        throw new Error("Add at least one size before saving this variant");
      }
      const perSizeStock = Boolean(variantData?.perSizeStock);
      const sizeStocks =
        variantData?.sizeStocks && typeof variantData.sizeStocks === "object"
          ? variantData.sizeStocks
          : {};

      if (!product?.id) {
        const nextVariants = perSizeStock
          ? normalizedSizes.map((size: string, index: number) => ({
              ...variantData,
              size,
              stock: Math.max(0, parseInt(String(sizeStocks[size] ?? 0), 10) || 0),
              originalStock: Math.max(0, parseInt(String(sizeStocks[size] ?? 0), 10) || 0),
              id: `temp-${Date.now()}-${index}`,
            }))
          : [{
              ...variantData,
              size: normalizedSizes.join(", "),
              originalStock: Math.max(0, Number(variantData?.stock) || 0),
              id: `temp-${Date.now()}`,
            }];
        setProductVariants((prev) => [...prev, ...nextVariants]);
        setShowVariantDialog(false);
        setEditingVariant(null);
        return;
      }

      const createdVariants = perSizeStock
        ? await Promise.all(
            normalizedSizes.map(async (size: string) => {
              return requestSameOriginJson<any>("POST", `/api/products/${product.id}/variants`, {
                ...variantData,
                size,
                stock: Math.max(0, parseInt(String(sizeStocks[size] ?? 0), 10) || 0),
              });
            }),
          )
        : [
            await requestSameOriginJson<any>("POST", `/api/products/${product.id}/variants`, {
                ...variantData,
                size: normalizedSizes.join(", "),
            }),
          ];
      const latestVariants = await requestSameOriginJson<any[]>("GET", `/api/products/${product.id}/variants`);
      setProductVariants(Array.isArray(latestVariants) ? sanitizeLoadedVariants(latestVariants) : createdVariants);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/variants`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller-dashboard", user?.id] });
      setShowVariantDialog(false);
      setEditingVariant(null);
      toast({
        title: "Success",
        description: "Variant created successfully",
      });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create variant", variant: "destructive" });
    } finally {
      setActiveVariantGroupId(null);
      setIsVariantSubmitting(false);
    }
  };

  const handleUpdateVariant = async (variantData: any) => {
    try {
      if (!editingVariant) return;
      setIsVariantSubmitting(true);
      setActiveVariantGroupId(editingVariant.id);

      const normalizedSizes = Array.isArray(variantData?.sizes)
        ? variantData.sizes.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [String(variantData?.size || "").trim()].filter(Boolean);
      if (normalizedSizes.length === 0) {
        throw new Error("Add at least one size before updating this variant");
      }
      const perSizeStock = Boolean(variantData?.perSizeStock);
      const sizeStocks =
        variantData?.sizeStocks && typeof variantData.sizeStocks === "object"
          ? variantData.sizeStocks
          : {};

      // In create mode (no product ID yet), update local state directly
      if (!product?.id) {
        const groupVariantIds = new Set(
          (Array.isArray(editingVariant?.variants) && editingVariant.variants.length > 0
            ? editingVariant.variants
            : [editingVariant.primaryVariant || editingVariant]
          ).map((v: any) => v?.id),
        );
        const updatedLocal = perSizeStock
          ? normalizedSizes.map((size: string, idx: number) => ({
              ...variantData,
              size,
              stock: Math.max(0, parseInt(String(sizeStocks[size] ?? 0), 10) || 0),
              originalStock: Math.max(0, parseInt(String(sizeStocks[size] ?? 0), 10) || 0),
              id: `temp-${Date.now()}-${idx}`,
            }))
          : [{
              ...variantData,
              size: normalizedSizes.join(", "),
              originalStock: Math.max(0, Number(variantData?.stock) || 0),
              id: editingVariant?.primaryVariant?.id || editingVariant?.id || `temp-${Date.now()}`,
            }];
        setProductVariants((prev) => [
          ...prev.filter((v) => !groupVariantIds.has(v?.id)),
          ...updatedLocal,
        ]);
        setShowVariantDialog(false);
        setEditingVariant(null);
        toast({ title: "Variant updated" });
        return;
      }

      const existingVariants = Array.isArray(editingVariant?.variants) && editingVariant.variants.length > 0
        ? editingVariant.variants
        : [editingVariant.primaryVariant || editingVariant];

      if (!perSizeStock) {
        const keeper = existingVariants[0];
        await requestSameOriginJson("PUT", `/api/products/${product.id}/variants/${keeper.id}`, {
          ...variantData,
          size: normalizedSizes.join(", "),
        });

        if (existingVariants.length > 1) {
          for (const variant of existingVariants.slice(1)) {
            await requestSameOriginJson("DELETE", `/api/products/${product.id}/variants/${variant.id}`);
          }
        }
      } else {
        const existingBySize = new Map<string, any>(
          existingVariants.map((variant: any) => [normalizeVariantOptionKey(variant?.size), variant]),
        );
        const desiredSizes = new Set(normalizedSizes.map((size: string) => normalizeVariantOptionKey(size)));

        for (const size of normalizedSizes) {
          const existing = existingBySize.get(normalizeVariantOptionKey(size));
          const nextStock = Math.max(0, parseInt(String(sizeStocks[size] ?? 0), 10) || 0);
          if (existing) {
            await requestSameOriginJson("PUT", `/api/products/${product.id}/variants/${existing.id}`, {
              ...variantData,
              size,
              stock: nextStock,
            });
            existingBySize.delete(normalizeVariantOptionKey(size));
          } else {
            await requestSameOriginJson("POST", `/api/products/${product.id}/variants`, {
              ...variantData,
              size,
              stock: nextStock,
            });
          }
        }

        for (const variant of Array.from(existingBySize.values()).filter(
          (variant: any) => !desiredSizes.has(normalizeVariantOptionKey(variant?.size)),
        ) as any[]) {
          await requestSameOriginJson("DELETE", `/api/products/${product.id}/variants/${variant.id}`);
        }
      }

      const latestVariants = await requestSameOriginJson<any[]>("GET", `/api/products/${product.id}/variants`);
      setProductVariants(Array.isArray(latestVariants) ? sanitizeLoadedVariants(latestVariants) : []);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/variants`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller-dashboard", user?.id] });
      setShowVariantDialog(false);
      setEditingVariant(null);
      toast({ title: "Success", description: "Variant updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update variant", variant: "destructive" });
    } finally {
      setActiveVariantGroupId(null);
      setIsVariantSubmitting(false);
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    try {
      if (!product?.id) {
        setProductVariants((prev) => prev.filter((v) => v.id !== variantId));
        return;
      }

      await requestSameOriginJson("DELETE", `/api/products/${product.id}/variants/${variantId}`);
      const latestVariants = await requestSameOriginJson<any[]>("GET", `/api/products/${product.id}/variants`);
      setProductVariants(Array.isArray(latestVariants) ? sanitizeLoadedVariants(latestVariants) : []);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/variants`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller-dashboard", user?.id] });
      toast({ title: "Success", description: "Variant deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete variant", variant: "destructive" });
    }
  };

  const handleDeleteVariantGroup = async (variantsToDelete: any[]) => {
    try {
      if (!variantsToDelete.length) return;

      if (!product?.id) {
        const ids = new Set(variantsToDelete.map((variant) => variant.id));
        setProductVariants((prev) => prev.filter((variant) => !ids.has(variant.id)));
        return;
      }

      for (const variant of variantsToDelete) {
        await requestSameOriginJson("DELETE", `/api/products/${product.id}/variants/${variant.id}`);
      }

      const latestVariants = await requestSameOriginJson<any[]>("GET", `/api/products/${product.id}/variants`);
      setProductVariants(Array.isArray(latestVariants) ? sanitizeLoadedVariants(latestVariants) : []);
      queryClient.invalidateQueries({ queryKey: [`/api/products/${product.id}/variants`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", "seller-dashboard", user?.id] });
      toast({
        title: "Success",
        description: "Variant deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to delete variant",
        variant: "destructive",
      });
    }
  };

  const isLoading = createProductMutation.isPending || updateProductMutation.isPending;
  const groupedVariants = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const variant of productVariants) {
      const key = normalizeVariantColor(variant?.color) || `variant-${variant?.id}`;
      const current = groups.get(key) || [];
      current.push(variant);
      groups.set(key, current);
    }

    return Array.from(groups.values()).map((variants) => {
      const primaryVariant = variants[0];
      const usesPerSizeStock =
        variants.length > 1 &&
        variants.every((variant) => splitVariantSizes(variant?.size).length <= 1);
      const sizes = Array.from(
        new Set(
          variants.flatMap((variant) => splitVariantSizes(variant?.size)),
        ),
      );
      const totalStock = usesPerSizeStock
        ? variants.reduce((sum, variant) => sum + (Number(variant?.stock) || 0), 0)
        : variants.reduce(
            (max, variant) => Math.max(max, Number(variant?.stock) || 0),
            0,
          );
      const originalStock = usesPerSizeStock
        ? variants.reduce((sum, variant) => sum + (Number(variant?.originalStock ?? variant?.stock) || 0), 0)
        : variants.reduce(
            (max, variant) => Math.max(max, Number(variant?.originalStock ?? variant?.stock) || 0),
            0,
          );
      const imageCount = getVariantImages(primaryVariant).length;
      const sizeStockMap = Object.fromEntries(
        variants.flatMap((variant) =>
          splitVariantSizes(variant?.size).map((size) => [size, Number(variant?.stock) || 0]),
        ),
      );

      return {
        id: primaryVariant?.id,
        color: primaryVariant?.color || "-",
        sizes,
        sizeCount: sizes.length,
        imageCount,
        stock: totalStock,
        originalStock,
        remainingStock: totalStock,
        perSizeStock: usesPerSizeStock,
        sizeStockMap,
        variants,
        primaryVariant,
      };
    });
  }, [productVariants]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button data-testid="button-create-product">
            <Plus className="mr-2 h-4 w-4" />
            Add Product
          </Button>
        ) : (
          <Button 
            variant="secondary" 
            size="icon"
            className="h-7 w-7 border border-border/80 bg-background/95 shadow-sm backdrop-blur-sm hover:bg-background"
            data-testid={`button-edit-${product?.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[min(96vw,72rem)] max-w-4xl max-h-[92vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Add New Product" : "Edit Product"}</DialogTitle>
          <DialogDescription>
            {mode === "create" ? "Add a new product to your store" : "Update product information"}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="Elegant Black Abaya" {...field} data-testid="input-product-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description *</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe your product..." 
                      {...field} 
                      data-testid="input-product-description"
                      rows={4}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price *</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="299.99" {...field} data-testid="input-product-price" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="compareAtPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Price (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="349.99" {...field} data-testid="input-product-compare-price" />
                    </FormControl>
                    <FormDescription>Your buying or cost price for this product</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <CategorySelect
                      value={field.value}
                      onValueChange={field.onChange}
                      storeType={store?.storeType}
                      label="Category"
                      required={false}
                      testId="select-category"
                    />
                    <div className="pt-2">
                      <RequestCategoryDialog storeType={store?.storeType} />
                    </div>
                    <div className="pt-3">
                      <SellerCategoryRequestList storeType={store?.storeType} />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

            <FormField
              control={form.control}
              name="deliveryDuration"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Delivery Duration</FormLabel>
                  <FormControl>
                    <div className="space-y-3">
                      <Select
                        value={showCustomDeliveryDurationInput ? "custom" : selectedDeliveryPreset}
                        onValueChange={(value) => {
                          if (value === "custom") {
                            setIsCustomDeliveryDuration(true);
                            field.onChange("");
                            return;
                          }
                          setIsCustomDeliveryDuration(false);
                          field.onChange(value);
                        }}
                      >
                        <SelectTrigger data-testid="select-delivery-duration-preset">
                          <SelectValue placeholder="Choose a delivery duration" />
                        </SelectTrigger>
                        <SelectContent>
                          {DELIVERY_DURATION_PRESETS.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                          <SelectItem value="custom">Custom duration</SelectItem>
                        </SelectContent>
                      </Select>

                      {showCustomDeliveryDurationInput && (
                        <Input
                          placeholder="e.g. 3 days or 4-6 business days"
                          {...field}
                          data-testid="input-delivery-duration"
                        />
                      )}
                    </div>
                  </FormControl>
                  <FormDescription>
                    Pick a quick preset or enter a custom delivery duration that will show on the product page.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            </div>

            {store?.storeType && storeTypeProductFields.length > 0 && (
              <Card className="p-4 sm:p-5">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold">
                    {getStoreTypeLabel(store.storeType)} Product Details
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Add the extra product details buyers usually need for this type of store.
                  </p>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {storeTypeProductFields.map((field) => {
                    const isWideField = field.type === "textarea" || field.type === "multiselect";

                    return (
                      <div
                        key={field.name}
                        className={isWideField ? "md:col-span-2" : ""}
                      >
                        <DynamicFieldRenderer
                          field={field}
                          form={form}
                          basePath="dynamicFields.storeSpecific"
                        />
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Food store: product image gallery + Ghanaian food preset picker */}
            {store?.storeType === "food_beverages" && (
              <FoodImageGallery
                images={form.watch("images") || []}
                onChange={(imgs) => form.setValue("images", imgs, { shouldValidate: true })}
              />
            )}

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tags (comma-separated)</FormLabel>
                  <FormControl>
                    <Input placeholder="modest, elegant, formal" {...field} data-testid="input-product-tags" />
                  </FormControl>
                  <FormDescription>Enter tags separated by commas</FormDescription>
                  <FormMessage />
                </FormItem>
                )}
              />

            <Card className="p-4">
              <details className="group" open={Boolean(form.watch("homepageFeatured") || form.watch("homepageNewArrival"))}>
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold">Homepage Display</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Show or hide this product in the homepage sections.
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground transition-opacity group-open:hidden">Show</span>
                  <span className="hidden text-sm text-muted-foreground transition-opacity group-open:inline">Hide</span>
                </summary>

                <div className="mt-4 space-y-4">
                  <FormField
                    control={form.control}
                    name="homepageFeatured"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-1">
                          <FormLabel>Featured Product</FormLabel>
                          <FormDescription>Show this product in the homepage featured section.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-homepage-featured" />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="homepageNewArrival"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between rounded-lg border p-4">
                        <div className="space-y-1">
                          <FormLabel>New Arrival</FormLabel>
                          <FormDescription>Show this product in the homepage new arrivals section.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-homepage-new-arrival" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>
              </details>
            </Card>

            <FormField
              control={form.control}
              name="videoUrl"
              render={({ field }) => (
                <FormItem>
                  <MediaUploadInput
                    id="product-video"
                    label="Product Video"
                    value={field.value || ""}
                    onChange={field.onChange}
                    accept="video"
                    placeholder="https://... or upload from computer"
                    required={true}
                    description="Upload a product video or paste a direct video link or a supported TikTok, YouTube, Instagram, Facebook, or Vimeo link. Longer videos are optimized automatically."
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Product Variants Management */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Product Variants</h3>
                  <p className="text-sm text-muted-foreground">
                    {variantConfig.sectionDescription}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isVariantSubmitting}
                  onClick={() => {
                    setEditingVariant(null);
                    setShowVariantDialog(true);
                  }}
                  data-testid="button-add-variant"
                >
                  {isVariantSubmitting && !editingVariant ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Variant
                </Button>
              </div>

              {groupedVariants.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1.5fr_1.6fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div>{variantConfig.groupLabel}</div>
                    <div>{variantConfig.optionsLabel}</div>
                    <div className="text-center">Images</div>
                    <div className="text-center">Original</div>
                    <div className="text-center">Remaining</div>
                    <div className="text-center">Actions</div>
                  </div>
                  {groupedVariants.map((variantGroup) => (
                    <div key={variantGroup.id} className="grid grid-cols-[1.5fr_1.6fr_0.7fr_0.8fr_0.9fr_0.9fr] gap-4 text-sm items-center py-2 border-b">
                      <div className="min-w-0 flex items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 rounded-full border border-border shadow-sm"
                          style={{ backgroundColor: variantGroup.color || "#9ca3af" }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{variantGroup.color}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate">{variantGroup.sizes.join(", ")}</p>
                        {variantGroup.sizeCount > 1 ? (
                          <p className="text-xs text-muted-foreground">
                            {variantGroup.sizeCount} sizes
                            {variantGroup.perSizeStock ? " • stock per size" : ""}
                          </p>
                        ) : null}
                      </div>
                      <div className="text-center">{variantGroup.imageCount}</div>
                      <div className="text-center">{variantGroup.originalStock}</div>
                      <div className="text-center">{variantGroup.remainingStock}</div>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isVariantSubmitting}
                          onClick={() => {
                            setEditingVariant(variantGroup);
                            setShowVariantDialog(true);
                          }}
                          data-testid={`button-edit-variant-${variantGroup.id}`}
                        >
                          {isVariantSubmitting && activeVariantGroupId === variantGroup.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Edit className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isVariantSubmitting}
                          onClick={() => handleDeleteVariantGroup(variantGroup.variants)}
                          data-testid={`button-delete-variant-${variantGroup.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {productVariants.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>{variantConfig.emptyStateLabel}</p>
                  <p className="text-sm">{variantConfig.emptyStateDescription}</p>
                </div>
              )}
            </Card>

            {variantConfig.supportsSizeGuide ? (
              <SizeGuideEditor
                title={variantConfig.sizeGuideLabel}
                sizeGuide={sizeGuide}
                availableSizes={variantSizeLabels}
                onChange={setSizeGuide}
              />
            ) : null}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
                data-testid="button-cancel-product"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                data-testid="button-submit-product"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "create" ? "Create Product" : "Update Product"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>

      {/* Variant Management Dialog */}
      <Dialog
        open={showVariantDialog}
        onOpenChange={(nextOpen) => {
          if (isVariantSubmitting) return;
          setShowVariantDialog(nextOpen);
          if (!nextOpen) {
            setEditingVariant(null);
          }
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingVariant ? "Edit Variant" : "Add Variant"}</DialogTitle>
            <DialogDescription>
              {editingVariant ? "Update variant details" : "Create a new product variant"}
            </DialogDescription>
          </DialogHeader>

          <VariantForm
            variant={editingVariant}
            isEditing={Boolean(editingVariant)}
            allowSharedStockOption={platformSettings?.allowSharedVariantColorStock === true}
            variantConfig={variantConfig}
            isSubmitting={isVariantSubmitting}
            onSubmit={editingVariant ? handleUpdateVariant : handleCreateVariant}
            onCancel={() => {
              if (isVariantSubmitting) return;
              setShowVariantDialog(false);
              setEditingVariant(null);
            }}
          />
        </DialogContent>
      </Dialog>

    </Dialog>
  );
}

function RequestCategoryDialog({ storeType }: { storeType?: StoreType }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof requestCategorySchema>>({
    resolver: zodResolver(requestCategorySchema),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      image: "",
    },
  });

  const requestCategoryMutation = useMutation({
    mutationFn: async (data: z.infer<typeof requestCategorySchema>) => {
      const response = await apiRequest("POST", "/api/seller/categories/request", data);
      return response.json();
    },
    onSuccess: (payload: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories", "active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/category-requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      setOpen(false);
      form.reset();
      toast({
        title: "Category request submitted",
        description: payload?.message || "An admin must approve it before it appears on the homepage.",
      });
    },
    onError: (error: any) => {
      let description = error?.message || "Could not submit category request";
      const normalized = String(description).replace(/^\d+:\s*/, "");
      try {
        const parsed = JSON.parse(normalized);
        description = parsed?.error || description;
      } catch {
        description = normalized;
      }
      toast({
        title: "Request failed",
        description,
        variant: "destructive",
      });
    },
  });

  const handleNameChange = (name: string) => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .trim();
    form.setValue("slug", slug);
  };

  const handleRequestSubmit = form.handleSubmit((data) => {
    requestCategoryMutation.mutate(data);
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={!storeType} data-testid="button-request-category">
          <Plus className="mr-2 h-4 w-4" />
          Request Category
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request New Category</DialogTitle>
          <DialogDescription>
            {storeType
              ? `This request will be submitted for ${storeType.replace(/_/g, " ")} stores and will stay hidden until an admin approves it.`
              : "Your store type must be configured before you can request a category."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <div className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. Prayer Mats"
                      onChange={(e) => {
                        field.onChange(e);
                        handleNameChange(e.target.value);
                      }}
                      data-testid="input-request-category-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Slug</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="prayer-mats" data-testid="input-request-category-slug" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value || ""} rows={3} placeholder="Short note for review" data-testid="input-request-category-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="image"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category Image (Optional)</FormLabel>
                  <FormControl>
                    <MediaUploadInput
                      id="seller-category-image"
                      label=""
                      value={field.value || ""}
                      onChange={field.onChange}
                      accept="image"
                      placeholder="https://example.com/category-image.jpg"
                      description="If you leave this empty, a default image for your store type will be used automatically."
                      mediaCategory="category"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void handleRequestSubmit()}
                disabled={requestCategoryMutation.isPending || !storeType}
                data-testid="button-submit-category-request"
              >
                {requestCategoryMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Submit Request
              </Button>
            </div>
          </div>
        </Form>
      </DialogContent>

    </Dialog>
  );
}

function SellerCategoryRequestList({ storeType }: { storeType?: StoreType }) {
  const { data: requests = [], isLoading } = useQuery<SellerCategoryRequest[]>({
    queryKey: ["/api/seller/category-requests"],
    queryFn: async () => {
      const data = await fetchApiJson<SellerCategoryRequest[]>("/api/seller/category-requests");
      return Array.isArray(data) ? data : [];
    },
    enabled: !!storeType,
  });

  const [dismissedRequestIds, setDismissedRequestIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const stored = window.localStorage.getItem("seller.dismissedCategoryRequestIds");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "seller.dismissedCategoryRequestIds",
      JSON.stringify(dismissedRequestIds),
    );
  }, [dismissedRequestIds]);

  const visibleRequests = requests
    .filter((request) => !dismissedRequestIds.includes(String(request.categoryId)))
    .slice(0, 5);

  if (!storeType) {
    return (
      <Card className="border-dashed p-3">
        <p className="text-sm text-muted-foreground">
          Set your store type first to request a category and track approval status.
        </p>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading category request status...
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">Pending Approval</h4>
          <p className="text-xs text-muted-foreground">
            Your recent category requests and their current status.
          </p>
        </div>
        <Badge variant="secondary">{requests.filter((request) => request.status === "pending").length} pending</Badge>
      </div>

      {visibleRequests.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No category requests yet.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {visibleRequests.map((request) => (
            <div key={request.categoryId} className="rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{request.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {request.slug ? `/${request.slug}` : "Requested category"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant={
                      request.status === "approved"
                        ? "default"
                        : request.status === "rejected"
                          ? "destructive"
                          : "outline"
                    }
                  >
                    {request.status === "approved" ? "Approved" : request.status === "rejected" ? "Rejected" : "Pending"}
                  </Badge>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 rounded-full"
                    onClick={() =>
                      setDismissedRequestIds((prev) => Array.from(new Set([...prev, String(request.categoryId)])))
                    }
                    aria-label={`Dismiss ${request.name} request`}
                    data-testid={`button-dismiss-category-request-${request.categoryId}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{request.message}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Requested {new Date(request.requestedAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// Variant Form Component
function VariantForm({ variant, isEditing = false, allowSharedStockOption = false, variantConfig, isSubmitting = false, onSubmit, onCancel }: {
  variant?: any;
  isEditing?: boolean;
  allowSharedStockOption?: boolean;
  variantConfig: ReturnType<typeof getStoreTypeVariantConfig>;
  isSubmitting?: boolean;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const primaryVariant = variant?.primaryVariant || variant;
  const initialSize = String(primaryVariant?.size || "").trim();
  const initialImages = getVariantImages(primaryVariant);
  const presetOptions = variantConfig.secondaryPresetOptions;
  const initialSizeList = Array.isArray(variant?.sizes) && variant.sizes.length > 0
    ? variant.sizes.map((value: unknown) => String(value || "").trim()).filter(Boolean)
    : splitVariantSizes(initialSize);
  const firstInitialSize = initialSizeList[0] || "";
  const initialSelectedSize = presetOptions.includes(firstInitialSize) ? firstInitialSize : firstInitialSize ? "__custom__" : "";
  const initialPerSizeStock = allowSharedStockOption ? Boolean(variant?.perSizeStock) : true;
  const initialSizeStockMap = variant?.sizeStockMap && typeof variant.sizeStockMap === "object"
    ? Object.fromEntries(
        Object.entries(variant.sizeStockMap).map(([size, stock]) => [size, Number(stock) || 0]),
      )
    : Object.fromEntries(initialSizeList.map((size: string) => [size, Number(primaryVariant?.stock) || 0]));
  const [formData, setFormData] = useState({
    color: primaryVariant?.color || variant?.color || "",
    size: initialSelectedSize,
    customSize: presetOptions.includes(firstInitialSize) ? "" : firstInitialSize,
    sizes: initialSizeList,
    images: initialImages,
    stock: primaryVariant?.stock || variant?.stock || 0,
    perSizeStock: initialPerSizeStock,
    sizeStocks: initialSizeStockMap as Record<string, number>,
  });

  useEffect(() => {
    if (allowSharedStockOption) return;
    setFormData((prev) => ({
      ...prev,
      perSizeStock: true,
      sizeStocks: Object.fromEntries(
        prev.sizes.map((size: string) => [size, prev.sizeStocks[size] ?? prev.stock ?? 0]),
      ),
    }));
  }, [allowSharedStockOption]);

  const resolvedCurrentSize = String(
    formData.size === "__custom__" ? formData.customSize : formData.size || "",
  ).trim();
  const canAddCurrentSize = Boolean(
    String(
      formData.size === "__custom__" || !formData.size
        ? formData.customSize
        : formData.size,
    ).trim(),
  );
  const hasAnySizeSelected = Array.from(
    new Set(
      [
        ...formData.sizes,
        ...(resolvedCurrentSize ? [resolvedCurrentSize] : []),
      ]
        .map((size) => String(size || "").trim())
        .filter(Boolean),
    ),
  ).length > 0;

  const addSize = () => {
    const nextSize = String(
      formData.size === "__custom__" || !formData.size
        ? formData.customSize
        : formData.size,
    ).trim();
    if (!nextSize) return;
    setFormData((prev) => {
      if (prev.sizes.includes(nextSize)) {
        return prev;
      }
      return {
        ...prev,
        sizes: [...prev.sizes, nextSize],
        size: "",
        customSize: "",
        sizeStocks: prev.perSizeStock ? { ...prev.sizeStocks, [nextSize]: prev.sizeStocks[nextSize] ?? 0 } : prev.sizeStocks,
      };
    });
  };

  const removeSize = (sizeToRemove: string) => {
    setFormData((prev) => ({
      ...prev,
      sizes: prev.sizes.filter((size: string) => size !== sizeToRemove),
      sizeStocks: Object.fromEntries(
        Object.entries(prev.sizeStocks).filter(([size]) => size !== sizeToRemove),
      ),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const normalizedColor = String(formData.color || "").trim();
    const draftSize = resolvedCurrentSize;
    const normalizedSizes = Array.from(
      new Set(
        [
          ...formData.sizes,
          ...(resolvedCurrentSize ? [resolvedCurrentSize] : []),
        ]
          .map((size) => String(size || "").trim())
          .filter(Boolean),
      ),
    );
    const normalizedSizeStocks = Object.fromEntries(
      normalizedSizes.map((size) => [size, Math.max(0, parseInt(String(formData.sizeStocks[size] ?? 0), 10) || 0)]),
    );

    if (!normalizedColor || normalizedSizes.length === 0 || formData.images.length < 3 || formData.images.length > 5) {
      return;
    }
    onSubmit({
      color: normalizedColor,
      size: normalizedSizes[0],
      sizes: normalizedSizes,
      images: formData.images,
      stock: parseInt(formData.stock.toString()) || 0,
      perSizeStock: allowSharedStockOption ? formData.perSizeStock : true,
      sizeStocks: normalizedSizeStocks,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="variant-color">{variantConfig.primaryLabel} *</Label>
          <Input
            id="variant-color"
            disabled={isSubmitting}
            value={formData.color}
            onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
            placeholder={variantConfig.primaryPlaceholder}
          />
        </div>
        <div>
          <Label htmlFor="variant-size">{variantConfig.secondaryLabel} *</Label>
          <Select
            disabled={isSubmitting}
            value={formData.size || "__custom__"}
            onValueChange={(value) => setFormData((prev) => ({ ...prev, size: value }))}
          >
            <SelectTrigger id="variant-size">
              <SelectValue placeholder={`Choose or type a ${variantConfig.secondaryLabel.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {presetOptions.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
              <SelectItem value="__custom__">Type my own {variantConfig.secondaryLabel.toLowerCase()}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {(formData.size === "__custom__" || !formData.size) && (
        <div>
          <Label htmlFor="variant-custom-size">Custom {variantConfig.secondaryLabel} *</Label>
          <Input
            id="variant-custom-size"
            disabled={isSubmitting}
            value={formData.customSize}
            onChange={(e) => setFormData((prev) => ({ ...prev, customSize: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSize();
              }
            }}
            placeholder={variantConfig.secondaryPlaceholder}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {variantConfig.secondaryDescription} Then click <span className="font-medium">{variantConfig.addOptionCta}</span>.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border p-3">
          <div className="space-y-3">
            <div>
              <Label htmlFor="variant-stock-mode">Stock Setup *</Label>
              <p className="text-xs text-muted-foreground">
                {allowSharedStockOption
                  ? variantConfig.stockSetupDescription
                  : variantConfig.perOptionStockDescription}
              </p>
            </div>
            {allowSharedStockOption ? (
              <Select
                disabled={isSubmitting}
                value={formData.perSizeStock ? "per_size" : "shared"}
                onValueChange={(value) =>
                  setFormData((prev) => ({
                    ...prev,
                    perSizeStock: value === "per_size",
                    sizeStocks:
                      value === "per_size"
                        ? Object.fromEntries(prev.sizes.map((size: string) => [size, prev.sizeStocks[size] ?? 0]))
                        : prev.sizeStocks,
                  }))
                }
              >
                <SelectTrigger id="variant-stock-mode">
                  <SelectValue placeholder="Choose stock setup" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="per_size">Separate stock for each size</SelectItem>
                  <SelectItem value="shared">One shared stock for this color</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm font-medium text-foreground">
                Separate stock for each size
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <Label>Selected {variantConfig.optionsLabel} *</Label>
              <p className="text-xs text-muted-foreground">{variantConfig.secondaryDescription}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSize}
              disabled={!canAddCurrentSize || isSubmitting}
            >
              {variantConfig.addOptionCta}
            </Button>
          </div>
          {formData.sizes.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {formData.sizes.map((size: string) => (
                <Badge key={size} variant="secondary" className="gap-2 px-3 py-1">
                  <span>{size}</span>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => removeSize(size)}
                    aria-label={`Remove size ${size}`}
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No {variantConfig.optionsLabel.toLowerCase()} added yet.</p>
          )}
        </div>

      <ProductGallery
        images={formData.images}
        onChange={(images) => setFormData((prev) => ({ ...prev, images }))}
        maxImages={5}
        required={true}
        description="Add 3-5 images for this variant using URL, Upload, or Library."
      />

      {formData.perSizeStock ? (
        <div className="space-y-3 rounded-lg border p-3">
          <div>
            <Label>Stock For Each {variantConfig.secondaryLabel} *</Label>
            <p className="text-xs text-muted-foreground">{variantConfig.perOptionStockDescription}</p>
          </div>
          {formData.sizes.length > 0 ? (
            <div className="space-y-3">
              {formData.sizes.map((size: string) => (
                <div key={size} className="flex items-center gap-3">
                  <div className="min-w-[88px] text-sm font-medium">{size}</div>
                  <Input
                    type="number"
                    disabled={isSubmitting}
                    min="0"
                    value={formData.sizeStocks[size] ?? 0}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        sizeStocks: {
                          ...prev.sizeStocks,
                          [size]: parseInt(e.target.value, 10) || 0,
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Add at least one size first.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <div>
            <Label htmlFor="variant-stock">Stock Quantity *</Label>
            <Input
              id="variant-stock"
              type="number"
              disabled={isSubmitting}
              value={formData.stock}
              onChange={(e) => setFormData((prev) => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
              min="0"
            />
          </div>
        </div>
      )}

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            isSubmitting ||
            !String(formData.color || "").trim() ||
            !hasAnySizeSelected ||
            formData.images.length < 3 ||
            formData.images.length > 5
          }
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {variant ? "Update Variant" : "Create Variant"}
        </Button>
      </div>
    </form>
  );
}

function SizeGuideEditor({
  title = "Size Guide",
  sizeGuide,
  availableSizes,
  onChange,
}: {
  title?: string;
  sizeGuide: SizeGuideData;
  availableSizes: string[];
  onChange: (next: SizeGuideData) => void;
}) {
  const updateRows = (section: "bodyRows" | "productRows", labelSize: string, field: keyof SizeGuideRow, value: string) => {
    onChange({
      ...sizeGuide,
      [section]: sizeGuide[section].map((row) =>
        row.labelSize === labelSize ? { ...row, [field]: value } : row,
      ),
    });
  };

  const renderSection = (
    title: string,
    description: string,
    section: "bodyRows" | "productRows",
    columns: Array<{ key: keyof SizeGuideRow; label: string; placeholder: string }>,
  ) => {
    const gridTemplateColumns = `100px repeat(${columns.length}, minmax(96px, 1fr))`;
    return (
    <div className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <div className="min-w-[780px]">
          <div className="grid gap-2 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns }}>
            <div>Size</div>
            {columns.map((column) => (
              <div key={`${section}-${column.key}`}>{column.label}</div>
            ))}
          </div>
          <div className="space-y-0">
            {sizeGuide[section].map((row) => (
              <div
                key={`${section}-${row.labelSize}`}
                className="grid gap-2 border-b px-3 py-2 last:border-b-0"
                style={{ gridTemplateColumns }}
              >
                <div className="flex items-center">
                  <Badge variant="secondary" className="justify-center">{row.labelSize}</Badge>
                </div>
                {columns.map((column) => (
                  <Input
                    key={`${section}-${row.labelSize}-${column.key}`}
                    value={String(row[column.key] || "")}
                    onChange={(e) => updateRows(section, row.labelSize, column.key, e.target.value)}
                    placeholder={column.placeholder}
                    className="h-9"
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    );
  };

  return (
    <Card className="p-4">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">
              Add a simple body chart and product chart for the sizes you already used in this product.
            </p>
          </div>
          <div className="w-full md:w-48">
            <Label>Size displayed</Label>
            <Select
              value={sizeGuide.displaySystem}
              onValueChange={(value) => onChange({ ...sizeGuide, displaySystem: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choose size style" />
              </SelectTrigger>
              <SelectContent>
                {SIZE_DISPLAY_SYSTEMS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {availableSizes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Add your product variants first, then the size guide rows will appear here automatically.
          </div>
        ) : (
          <div className="space-y-6">
            {renderSection(
              "Body Chart",
              "Fill in the body measurements your customer should compare before choosing a size.",
              "bodyRows",
              [
                { key: "uk", label: "UK", placeholder: "8" },
                { key: "bust", label: "Bust", placeholder: "86-90" },
                { key: "waist", label: "Waist", placeholder: "66-70" },
                { key: "hips", label: "Hips", placeholder: "91-95" },
                { key: "height", label: "Height", placeholder: "165-170" },
              ],
            )}

            {renderSection(
              "Product Chart",
              "Add the garment measurements for each size so buyers can compare the product itself.",
              "productRows",
              [
                { key: "length", label: "Length", placeholder: "138" },
                { key: "bust", label: "Bust", placeholder: "88" },
                { key: "waist", label: "Waist", placeholder: "80" },
                { key: "hips", label: "Hips", placeholder: "96" },
                { key: "shoulder", label: "Shoulder", placeholder: "38" },
                { key: "sleeve", label: "Sleeve", placeholder: "58" },
              ],
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function DeleteProductDialog({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const deleteProductMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/products/${product.id}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        throw new Error(payload?.error || text || "Failed to delete product");
      }

      return payload;
    },
    onSuccess: (_payload: any) => {
      toast({
        title: "Success",
        description: "Product deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/new-arrivals"] });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete product",
        variant: "destructive",
      });
    },
  });

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button 
          variant="secondary" 
          size="icon"
          className="h-7 w-7 border border-border/80 bg-background/95 shadow-sm backdrop-blur-sm hover:bg-background"
          data-testid={`button-delete-${product.id}`}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Product?</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete "{product.name}"? This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => deleteProductMutation.mutate()}
            disabled={deleteProductMutation.isPending}
            className="bg-destructive hover:bg-destructive/90"
            data-testid="button-confirm-delete"
          >
            {deleteProductMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function SellerProducts() {
  const [searchQuery, setSearchQuery] = useState("");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [justPurchasedPlan, setJustPurchasedPlan] = useState(false);
  const prevTierLimitRef = useRef<number | null>(null);
  const highlightedProductId = useMemo(() => {
    const query = location.split("?")[1] || "";
    return new URLSearchParams(query).get("productId") || "";
  }, [location]);

  // Debounce search query to avoid excessive filtering
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  
  // Show loading state while debouncing
  const isSearching = searchQuery !== debouncedSearchQuery;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: products = [], isLoading, isError, error, refetch } = useQuery<Product[]>({
    queryKey: ["/api/products", "seller", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const data = await fetchApiJson<Product[]>(`/api/products?sellerId=${encodeURIComponent(user.id)}`);
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && user?.role === "seller",
    retry: 2,
    retryDelay: 1000,
  });

  const { data: tierInfo } = useQuery<{
    effectiveLimit: number;
    productCount: number;
    planBExpired: boolean;
    sellerUpgradePlan: string | null;
    sellerPlanExpiresAt: string | null;
    freeTierLimit: number;
    sellerMonetizationEnabled: boolean;
  }>({
    queryKey: ["/api/seller/tier-info"],
    enabled: isAuthenticated && user?.role === "seller",
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });
  // Override the gate when we just paid — don't block the seller until the DB actually
  // confirms the new limit. Clear the override once tier-info reflects the improvement.
  const atProductLimit = !justPurchasedPlan && tierInfo && tierInfo.effectiveLimit > 0 && tierInfo.productCount >= tierInfo.effectiveLimit;
  // Plan-b expired but product count hasn't yet hit the free-tier floor — show warning
  const planBExpiredUnderLimit = !justPurchasedPlan && !!tierInfo?.planBExpired && !atProductLimit;
  const isRenewal = !!tierInfo?.planBExpired;

  useEffect(() => {
    if (!justPurchasedPlan || !tierInfo) return;
    const oldLimit = prevTierLimitRef.current ?? 0;
    // 0 = unlimited; or limit increased (plan upgraded); either clears the bypass
    if (tierInfo.effectiveLimit === 0 || tierInfo.effectiveLimit > oldLimit) {
      setJustPurchasedPlan(false);
    }
  }, [tierInfo?.effectiveLimit, justPurchasedPlan]);

  // Use debounced search query for filtering
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (p?.dynamicFields?.archived) return false;
      const query = debouncedSearchQuery.toLowerCase();
      return (
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query)
      );
    });
  }, [products, debouncedSearchQuery]);

  useEffect(() => {
    if (!highlightedProductId || products.length === 0) return;
    const targetProduct = products.find((product) => product.id === highlightedProductId);
    if (!targetProduct) return;
    setSearchQuery(targetProduct.name || "");
    const frame = window.requestAnimationFrame(() => {
      const element = document.querySelector(`[data-testid="card-product-${highlightedProductId}"]`);
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [highlightedProductId, products]);

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading seller products" description="Preparing your catalog, stock levels, and product actions." />;
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-products">My Products</h1>
            <p className="text-muted-foreground mt-1">Manage your product catalog</p>
          </div>
          {atProductLimit ? (
            <Button
              onClick={() => setUpgradeModalOpen(true)}
              className={`gap-2 text-white ${isRenewal ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}
            >
              <RefreshCw className="h-4 w-4" />
              {isRenewal ? "Renew Plan to Add Products" : "Add Product (Upgrade Required)"}
            </Button>
          ) : (
            <ProductFormDialog mode="create" />
          )}
        </div>

        {/* Plan expiry banners */}
        {atProductLimit && isRenewal && (
          <div className="mb-5 rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-700/50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-red-800 dark:text-red-300">Plan B has expired — product limit restored</p>
              <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">
                You've reached your free-tier limit of {tierInfo?.freeTierLimit ?? 20} products.
                Renew Plan B to get unlimited listings again, or upgrade to Plan C for permanent access.
              </p>
              {tierInfo?.sellerPlanExpiresAt && (
                <p className="text-xs text-red-600/80 dark:text-red-500 mt-1">
                  Expired: {new Date(tierInfo.sellerPlanExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setUpgradeModalOpen(true)} className="shrink-0 bg-red-600 hover:bg-red-700 text-white border-0 gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> Renew
            </Button>
          </div>
        )}

        {planBExpiredUnderLimit && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/50 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-amber-800 dark:text-amber-300">Plan B expired — listing limit will apply soon</p>
              <p className="text-sm text-amber-700 dark:text-amber-400 mt-0.5">
                Your Plan B subscription has expired. You can still add products up to the free-tier limit of {tierInfo?.freeTierLimit ?? 20}.
                You currently have {tierInfo?.productCount ?? 0} products listed.
                Renew to keep unlimited access.
              </p>
              {tierInfo?.sellerPlanExpiresAt && (
                <p className="text-xs text-amber-600/80 dark:text-amber-500 mt-1">
                  Expired: {new Date(tierInfo.sellerPlanExpiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setUpgradeModalOpen(true)} className="shrink-0 gap-1.5" variant="outline">
              <RefreshCw className="h-3.5 w-3.5" /> Renew
            </Button>
          </div>
        )}

        <SellerUpgradeModal
          open={upgradeModalOpen}
          onClose={() => setUpgradeModalOpen(false)}
          isRenewal={isRenewal}
          onUpgraded={() => {
            prevTierLimitRef.current = tierInfo?.effectiveLimit ?? null;
            setJustPurchasedPlan(true);
            setUpgradeModalOpen(false);
          }}
        />

        <div className="mb-6">
          <div className="relative">
            {isSearching ? (
              <Loader2 className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
            ) : (
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            )}
            <Input
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-products"
            />
            {isSearching && (
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-muted-foreground">
                Searching...
              </span>
            )}
          </div>
        </div>

        {isError ? (
          <Card className="p-8">
            <div className="text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to Load Products</h3>
              <p className="text-muted-foreground mb-4">
                {error instanceof Error ? error.message : "An error occurred while loading your products"}
              </p>
              <Button onClick={() => refetch()} data-testid="button-retry-products">
                <RotateCcw className="mr-2 h-4 w-4" />
                Try Again
              </Button>
            </div>
          </Card>
        ) : isLoading ? (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="overflow-hidden border-border/70 bg-card/90 p-0 shadow-sm">
                <div className="animate-pulse">
                  <div className="aspect-[4/3] bg-muted" />
                  <div className="space-y-1.5 p-2">
                    <div className="h-4 w-2/3 rounded bg-muted" />
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-3/4 rounded bg-muted" />
                    <div className="flex gap-2">
                      <div className="h-4 w-14 rounded-full bg-muted" />
                      <div className="h-4 w-14 rounded-full bg-muted" />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className={`overflow-hidden border-border/70 bg-card/95 p-0 shadow-sm transition-all hover:shadow-md ${product.id === highlightedProductId ? "ring-2 ring-primary shadow-lg" : ""}`}
                data-testid={`card-product-${product.id}`}
              >
                <div className="relative aspect-[4/3] bg-muted/50">
                  {product.images[0] ? (
                    <img 
                      src={product.images[0]} 
                      alt={product.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Package className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  )}
                  <div className="absolute right-1.5 top-1.5 flex gap-1">
                    <ProductFormDialog mode="edit" product={product} />
                    <DeleteProductDialog product={product} />
                     <Button 
                       variant="secondary"
                       size="icon"
                        className="h-7 w-7 border border-border/80 bg-background/95 shadow-sm backdrop-blur-sm hover:bg-background"
                        onClick={() => navigate(`/product/${product.id}?from=${encodeURIComponent(location)}`)}
                        data-testid={`button-view-${product.id}`}
                      >
                       <Eye className="h-3 w-3" />
                     </Button>
                  </div>
                </div>

                <div className="space-y-1.5 p-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold" data-testid={`text-name-${product.id}`}>
                      {product.name}
                    </h3>
                    <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                      {product.description}
                    </p>
                  </div>

                  <div className="space-y-0.5">
                    <div className="min-w-0">
                      <span className="text-base font-bold text-primary">GHS {product.price}</span>
                      {product.costPrice && (
                        <span className="ml-1.5 text-[11px] text-muted-foreground line-through">
                          GHS {product.costPrice}
                        </span>
                      )}
                    </div>
                    {product.category && (
                      <Badge variant="outline" className="max-w-full truncate text-[10px]">
                        {product.category}
                      </Badge>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {(() => {
                      const remainingStock = getProductRemainingStock(product);
                      return (
                        <Badge
                          variant={remainingStock > 5 ? "default" : "destructive"}
                          className="text-[10px]"
                        >
                          {remainingStock <= 0
                            ? "Out of stock"
                            : remainingStock <= 5
                              ? `Low stock: ${remainingStock} left`
                              : `${remainingStock} in stock`}
                        </Badge>
                      );
                    })()}
                    <Badge variant={product.isActive ? "default" : "secondary"} className="text-[10px]">
                      {product.isActive ? "Active" : "Inactive"}
                    </Badge>

                    {product.dynamicFields?.homepageFeatured && (
                      <Badge variant="outline" className="text-[10px]">Featured</Badge>
                    )}

                    {product.dynamicFields?.homepageNewArrival && (
                      <Badge variant="outline" className="text-[10px]">New Arrival</Badge>
                    )}
                  </div>
                </div>
              </Card>
            ))}
            
             {filteredProducts.length === 0 && !isSearching && (
               <div className="col-span-full text-center py-12">
                 <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                 <p className="text-muted-foreground" data-testid="text-no-products">
                   {debouncedSearchQuery ? "No products found matching your search" : "No products yet. Add your first product to get started!"}
                 </p>
               </div>
            )}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
