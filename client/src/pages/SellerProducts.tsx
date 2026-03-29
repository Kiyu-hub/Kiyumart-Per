import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Package, Edit, Trash2, Plus, Eye, AlertCircle, RotateCcw } from "lucide-react";
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
import { StoreType } from "@shared/storeTypes";

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
  dynamicFields?: Record<string, any>;
}

interface Store {
  id: string;
  storeType: StoreType;
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

// Base product schema (media rules: 3-8 images required, video optional)
const baseProductSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format"),
  compareAtPrice: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid price format").optional().or(z.literal("")),
  categoryId: z.string().optional(),
  stockQuantity: z.string().regex(/^\d+$/, "Must be a valid number"),
  tags: z.string().optional(),
  images: z.array(z.string().url()).min(3, "Minimum 3 product images required").max(8, "Maximum 8 images allowed"),
  videoUrl: z.string().url("Invalid video URL").optional().or(z.literal("")),
  deliveryDuration: z.string().optional(),
  inStock: z.boolean().default(true),
  homepageFeatured: z.boolean().default(false),
  homepageNewArrival: z.boolean().default(false),
  dynamicFields: z.record(z.any()).optional(),
});

function ProductFormDialog({ product, mode }: { product?: Product; mode: "create" | "edit" }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Fetch seller's store to get storeType
  const { data: store } = useQuery<Store>({
    queryKey: ["/api/stores/my-store"],
    enabled: !!user?.id,
  });

  const { data: freshProduct } = useQuery<Product | null>({
    queryKey: ["/api/products", product?.id, "seller-edit"],
    queryFn: async () => {
      if (!product?.id) return null;
      try {
        return await fetchApiJson<Product>(`/api/products/${product.id}`);
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

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productSchema),
    defaultValues: effectiveProduct ? {
      name: effectiveProduct.name,
      description: effectiveProduct.description,
      price: effectiveProduct.price,
      compareAtPrice: effectiveProduct.costPrice || "",
      categoryId: effectiveProduct.categoryId || undefined,
      stockQuantity: effectiveProduct.stock.toString(),
      tags: effectiveProduct.tags?.join(", ") || "",
      images: effectiveProduct.images || [],
      videoUrl: effectiveProduct.video || "",
      deliveryDuration: (effectiveProduct as any).deliveryDuration || "",
      inStock: true,
      homepageFeatured: Boolean(effectiveProduct.dynamicFields?.homepageFeatured),
      homepageNewArrival: Boolean(effectiveProduct.dynamicFields?.homepageNewArrival),
      dynamicFields: effectiveProduct.dynamicFields || {},
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
      dynamicFields: {},
    },
  });

  const watchedDeliveryDuration = form.watch("deliveryDuration");
  const selectedDeliveryPreset = getDeliveryDurationPreset(watchedDeliveryDuration);

  // Variant management state
  const [productVariants, setProductVariants] = useState<any[]>([]);
  const [showVariantDialog, setShowVariantDialog] = useState(false);
  const [editingVariant, setEditingVariant] = useState<any>(null);

  // Fetch variants when editing a product
  const { data: existingVariants = [] } = useQuery<any[]>({
    queryKey: ["/api/products", product?.id, "variants"],
    enabled: !!product?.id && open,
  });

  // Update variants when fetched
  useEffect(() => {
    if (existingVariants && existingVariants.length > 0) {
      setProductVariants(existingVariants);
    } else if (mode === "create") {
      setProductVariants([]);
    }
  }, [existingVariants, mode]);

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      form.reset(effectiveProduct ? {
        name: effectiveProduct.name,
        description: effectiveProduct.description,
        price: effectiveProduct.price,
        compareAtPrice: effectiveProduct.costPrice || "",
        categoryId: effectiveProduct.categoryId || undefined,
        stockQuantity: effectiveProduct.stock.toString(),
        tags: effectiveProduct.tags?.join(", ") || "",
        images: effectiveProduct.images || [],
        videoUrl: effectiveProduct.video || "",
        deliveryDuration: effectiveProduct.deliveryDuration || "",
        inStock: true,
        homepageFeatured: Boolean(effectiveProduct.dynamicFields?.homepageFeatured),
        homepageNewArrival: Boolean(effectiveProduct.dynamicFields?.homepageNewArrival),
        dynamicFields: effectiveProduct.dynamicFields || {},
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
        inStock: true,
        homepageFeatured: false,
        homepageNewArrival: false,
        dynamicFields: {},
      });
    }
  }, [open, effectiveProduct, form]);

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }

      const normalizedCategoryId = String(data.categoryId || "").trim() || undefined;

      const productData: any = {
        name: data.name,
        description: data.description,
        price: data.price,
        costPrice: data.compareAtPrice || null,
        categoryId: normalizedCategoryId,
        stock: parseInt(data.stockQuantity),
        images: data.images || [],
        video: data.videoUrl || null,
        deliveryDuration: data.deliveryDuration || null,
        sellerId: user.id,
        storeId: store?.id || null,
        dynamicFields: {
          ...(data.dynamicFields || {}),
          homepageFeatured: Boolean(data.homepageFeatured),
          homepageNewArrival: Boolean(data.homepageNewArrival),
        },
      };

      productData.tags = data.tags
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      const response = await apiRequest("POST", "/api/products", productData);
      return response.json();
    },
    onSuccess: async (createdProduct: any) => {
      // Create variants if any exist
      if (productVariants.length > 0) {
        try {
          for (const variant of productVariants) {
            if (variant.id?.startsWith("temp-")) {
              const { id, ...variantData } = variant;
              await apiRequest("POST", `/api/products/${createdProduct.id}/variants`, variantData);
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
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/new-arrivals"] });
      setOpen(false);
      form.reset();
      setProductVariants([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const normalizedCategoryId = String(data.categoryId || "").trim() || undefined;

      const updateData: any = {
        name: data.name,
        description: data.description,
        price: data.price,
        costPrice: data.compareAtPrice || null,
        categoryId: normalizedCategoryId,
        stock: parseInt(data.stockQuantity),
        images: data.images,
        video: data.videoUrl || null,
        deliveryDuration: data.deliveryDuration || null,
        dynamicFields: {
          ...(data.dynamicFields || {}),
          homepageFeatured: Boolean(data.homepageFeatured),
          homepageNewArrival: Boolean(data.homepageNewArrival),
        },
      };

      updateData.tags = data.tags
        ? data.tags.split(",").map(t => t.trim()).filter(Boolean)
        : [];

      const response = await apiRequest("PATCH", `/api/products/${product?.id}`, updateData);
      return response.json();
    },
    onSuccess: (updatedProduct: any) => {
      toast({
        title: "Success",
        description: "Product updated successfully",
      });
      if (updatedProduct?.id) {
        queryClient.setQueryData(["/api/products", updatedProduct.id], updatedProduct);
      }
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product?.id] });
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
    if (mode === "create") {
      createProductMutation.mutate(data);
    } else {
      updateProductMutation.mutate(data);
    }
  };

  // Variant management functions
  const handleCreateVariant = async (variantData: any) => {
    try {
      if (!product?.id) {
        setProductVariants((prev) => [...prev, { ...variantData, id: `temp-${Date.now()}` }]);
        setShowVariantDialog(false);
        setEditingVariant(null);
        return;
      }

      const response = await apiRequest("POST", `/api/products/${product.id}/variants`, variantData);
      const createdVariant = await response.json();
      setProductVariants((prev) => [...prev, createdVariant]);
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id, "variants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      setShowVariantDialog(false);
      setEditingVariant(null);
      toast({ title: "Success", description: "Variant created successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to create variant", variant: "destructive" });
    }
  };

  const handleUpdateVariant = async (variantData: any) => {
    try {
      if (!product?.id || !editingVariant) return;

      const response = await apiRequest("PUT", `/api/products/${product.id}/variants/${editingVariant.id}`, variantData);
      const updatedVariant = await response.json();
      setProductVariants((prev) => prev.map((v) => (v.id === editingVariant.id ? updatedVariant : v)));
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id, "variants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      setShowVariantDialog(false);
      setEditingVariant(null);
      toast({ title: "Success", description: "Variant updated successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to update variant", variant: "destructive" });
    }
  };

  const handleDeleteVariant = async (variantId: string) => {
    try {
      if (!product?.id) {
        setProductVariants((prev) => prev.filter((v) => v.id !== variantId));
        return;
      }

      await apiRequest("DELETE", `/api/products/${product.id}/variants/${variantId}`);
      setProductVariants((prev) => prev.filter((v) => v.id !== variantId));
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id, "variants"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", product.id] });
      toast({ title: "Success", description: "Variant deleted successfully" });
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to delete variant", variant: "destructive" });
    }
  };

  const isLoading = createProductMutation.isPending || updateProductMutation.isPending;

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
            variant="ghost" 
            size="icon"
            data-testid={`button-edit-${product?.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                    <FormLabel>Compare At Price (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" placeholder="349.99" {...field} data-testid="input-product-compare-price" />
                    </FormControl>
                    <FormDescription>Original price for showing discounts</FormDescription>
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
                name="stockQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Quantity *</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder="10" {...field} data-testid="input-product-stock" />
                    </FormControl>
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
                        value={selectedDeliveryPreset}
                        onValueChange={(value) => {
                          if (value === "custom") {
                            if (DELIVERY_DURATION_PRESETS.includes(String(field.value || "").trim() as any)) {
                              field.onChange("");
                            }
                            return;
                          }
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

                      {selectedDeliveryPreset === "custom" && (
                        <Input
                          placeholder="e.g. 4-6 business days"
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
              <h3 className="font-semibold mb-4">Homepage Display</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Only the first 5 featured products can appear on the homepage.
              </p>
              <div className="space-y-4">
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
            </Card>

            <FormField
              control={form.control}
              name="images"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <ProductGallery
                      images={field.value || []}
                      onChange={field.onChange}
                      maxImages={8}
                      required={true}
                      description="Upload 3-8 high-quality product images - front, back, sides, and detailed shots"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="videoUrl"
              render={({ field }) => (
                <FormItem>
                  <MediaUploadInput
                    id="product-video"
                    label="Product Video (Optional)"
                    value={field.value || ""}
                    onChange={field.onChange}
                    accept="video"
                    placeholder="https://... or upload from computer"
                    description="Upload a video or enter a Cloudinary video URL (max 30 seconds)"
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
                  <p className="text-sm text-muted-foreground">Create different color/size combinations for this product</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowVariantDialog(true)}
                  data-testid="button-add-variant"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Variant
                </Button>
              </div>

              {productVariants.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-12 gap-2 text-sm font-medium text-muted-foreground border-b pb-2">
                    <div className="col-span-2">Color</div>
                    <div className="col-span-2">Size</div>
                    <div className="col-span-2">SKU</div>
                    <div className="col-span-2">Stock</div>
                    <div className="col-span-2">Price Adj.</div>
                    <div className="col-span-2">Actions</div>
                  </div>
                  {productVariants.map((variant) => (
                    <div key={variant.id} className="grid grid-cols-12 gap-2 text-sm items-center py-2 border-b">
                      <div className="col-span-2">{variant.color || "-"}</div>
                      <div className="col-span-2">{variant.size || "-"}</div>
                      <div className="col-span-2">{variant.sku || "-"}</div>
                      <div className="col-span-2">{variant.stock}</div>
                      <div className="col-span-2">{variant.priceAdjustment ? `$${variant.priceAdjustment}` : "-"}</div>
                      <div className="col-span-2 flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setEditingVariant(variant);
                            setShowVariantDialog(true);
                          }}
                          data-testid={`button-edit-variant-${variant.id}`}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteVariant(variant.id)}
                          data-testid={`button-delete-variant-${variant.id}`}
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
                  <p>No variants created yet</p>
                  <p className="text-sm">Add variants to offer different colors, sizes, or options</p>
                </div>
              )}
            </Card>

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
      <Dialog open={showVariantDialog} onOpenChange={setShowVariantDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingVariant ? "Edit Variant" : "Add Variant"}</DialogTitle>
            <DialogDescription>
              {editingVariant ? "Update variant details" : "Create a new product variant"}
            </DialogDescription>
          </DialogHeader>

          <VariantForm
            variant={editingVariant}
            onSubmit={editingVariant ? handleUpdateVariant : handleCreateVariant}
            onCancel={() => {
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

  const visibleRequests = requests.slice(0, 5);

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
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{request.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {request.slug ? `/${request.slug}` : "Requested category"}
                  </p>
                </div>
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
function VariantForm({ variant, onSubmit, onCancel }: {
  variant?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}) {
  const [formData, setFormData] = useState({
    color: variant?.color || "",
    size: variant?.size || "",
    sku: variant?.sku || "",
    image: variant?.image || "",
    stock: variant?.stock || 0,
    priceAdjustment: variant?.priceAdjustment || "0",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      stock: parseInt(formData.stock.toString()) || 0,
      priceAdjustment: formData.priceAdjustment || "0",
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="variant-color">Color (Optional)</Label>
          <Input
            id="variant-color"
            value={formData.color}
            onChange={(e) => setFormData((prev) => ({ ...prev, color: e.target.value }))}
            placeholder="e.g. Red, Blue"
          />
        </div>
        <div>
          <Label htmlFor="variant-size">Size (Optional)</Label>
          <Input
            id="variant-size"
            value={formData.size}
            onChange={(e) => setFormData((prev) => ({ ...prev, size: e.target.value }))}
            placeholder="e.g. S, M, L"
          />
        </div>
      </div>

      <div>
        <Label htmlFor="variant-sku">SKU (Optional)</Label>
        <Input
          id="variant-sku"
          value={formData.sku}
          onChange={(e) => setFormData((prev) => ({ ...prev, sku: e.target.value }))}
          placeholder="Stock Keeping Unit"
        />
      </div>

      <div>
        <Label htmlFor="variant-image">Image URL (Optional)</Label>
        <Input
          id="variant-image"
          value={formData.image}
          onChange={(e) => setFormData((prev) => ({ ...prev, image: e.target.value }))}
          placeholder="https://..."
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="variant-stock">Stock</Label>
          <Input
            id="variant-stock"
            type="number"
            value={formData.stock}
            onChange={(e) => setFormData((prev) => ({ ...prev, stock: parseInt(e.target.value) || 0 }))}
            min="0"
          />
        </div>
        <div>
          <Label htmlFor="variant-price">Price Adjustment</Label>
          <Input
            id="variant-price"
            type="number"
            step="0.01"
            value={formData.priceAdjustment}
            onChange={(e) => setFormData((prev) => ({ ...prev, priceAdjustment: e.target.value }))}
            placeholder="0.00"
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {variant ? "Update Variant" : "Create Variant"}
        </Button>
      </div>
    </form>
  );
}

function DeleteProductDialog({ product }: { product: Product }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const deleteProductMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/products/${product.id}`, {});
    },
    onSuccess: () => {
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
          variant="ghost" 
          size="icon"
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

  // Use debounced search query for filtering
  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
    );
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
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-products">My Products</h1>
            <p className="text-muted-foreground mt-1">Manage your product catalog</p>
          </div>
          <ProductFormDialog mode="create" />
        </div>

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
          <div className="grid gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <div className="flex items-start gap-4 animate-pulse">
                  <div className="w-24 h-24 bg-muted rounded-lg" />
                  <div className="flex-1 space-y-3">
                    <div className="h-6 bg-muted rounded w-1/3" />
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                    <div className="flex gap-2">
                      <div className="h-6 bg-muted rounded w-20" />
                      <div className="h-6 bg-muted rounded w-20" />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {filteredProducts.map((product) => (
              <Card
                key={product.id}
                className={`p-4 transition-all ${product.id === highlightedProductId ? "ring-2 ring-primary shadow-lg" : ""}`}
                data-testid={`card-product-${product.id}`}
              >
                <div className="flex items-start gap-4">
                  {product.images[0] && (
                    <img 
                      src={product.images[0]} 
                      alt={product.name}
                      className="w-24 h-24 object-cover rounded-lg"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-lg truncate" data-testid={`text-name-${product.id}`}>
                          {product.name}
                        </h3>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {product.description}
                        </p>
                      </div>
                      <div className="flex gap-2 flex-shrink-0">
                        <ProductFormDialog mode="edit" product={product} />
                        <DeleteProductDialog product={product} />
                        <Button 
                          variant="outline" 
                          size="icon"
                          onClick={() => navigate(`/product/${product.id}`)}
                          data-testid={`button-view-${product.id}`}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div className="mt-3 flex items-center gap-4">
                      <div>
                        <span className="text-lg font-bold text-primary">GHS {product.price}</span>
                        {product.costPrice && (
                          <span className="ml-2 text-sm line-through text-muted-foreground">
                            GHS {product.costPrice}
                          </span>
                        )}
                      </div>
                      
                      <Badge variant={product.stock > 0 ? "default" : "destructive"}>
                        {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
                      </Badge>
                      
                      <Badge variant={product.isActive ? "default" : "secondary"}>
                        {product.isActive ? "Active" : "Inactive"}
                      </Badge>

                      {product.dynamicFields?.homepageFeatured && (
                        <Badge variant="outline">Featured</Badge>
                      )}

                      {product.dynamicFields?.homepageNewArrival && (
                        <Badge variant="outline">New Arrival</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            
            {filteredProducts.length === 0 && !isSearching && (
              <div className="text-center py-12">
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
