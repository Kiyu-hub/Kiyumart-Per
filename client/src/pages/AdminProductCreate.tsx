import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { insertProductSchema } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import MediaUploadInput from "@/components/MediaUploadInput";
import { CategorySelect } from "@/components/CategorySelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";

const productFormSchema = insertProductSchema.extend({
  name: z.string().min(1, "Product name is required"),
  description: z.string().min(1, "Description is required"),
  categoryId: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  costPrice: z.string().optional(),
  stock: z.number().min(0, "Stock must be 0 or greater"),
  images: z.array(z.string().url()).min(5, "Exactly 5 product images are required").max(5, "Maximum 5 images allowed"),
  video: z.string().url("Product video is required").min(1, "Product video is required"),
  // When an admin creates on behalf of a seller, they must pick a seller
  sellerId: z.string().optional(),
});

type ProductFormData = z.infer<typeof productFormSchema>;

export default function AdminProductCreate() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState("");

  useEffect(() => {
    // Product creation via UI is allowed for sellers and admins (admins can create on behalf of sellers)
    const allowedRoles = ["seller", "admin", "super_admin"];
    if (!authLoading && (!isAuthenticated || !allowedRoles.includes(user?.role || ""))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Admin-only: fetch sellers for "create on behalf" workflow
  const { data: sellers = [] } = useQuery<any[]>({
    queryKey: ["/api/users", "role=seller"],
    queryFn: async () => {
      const res = await fetch('/api/users?role=seller');
      return res.json();
    },
    enabled: user?.role === 'admin' || user?.role === 'super_admin',
  });

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      description: "",
      categoryId: undefined,
      price: "",
      costPrice: "",
      stock: 0,
      images: [],
      video: "",
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload: any = {
        ...data,
        images: imageUrls,
        video: videoUrl,
      };

      // Admin creates on behalf of seller via admin endpoint
      if (user?.role === 'admin' || user?.role === 'super_admin') {
        if (!payload.sellerId) throw new Error('Please select a seller');
        return apiRequest("POST", "/api/admin/products", payload);
      }

      // Seller creates their own product
      return apiRequest("POST", "/api/products", payload);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Product created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      navigate("/admin/products");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create product",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ProductFormData) => {
    if (imageUrls.length < 5) {
      toast({
        title: "Error",
        description: "Exactly 5 product images are required",
        variant: "destructive",
      });
      return;
    }

    if (!videoUrl || videoUrl.trim() === "") {
      toast({
        title: "Error",
        description: "Product video is required",
        variant: "destructive",
      });
      return;
    }

    createProductMutation.mutate({
      ...data,
      images: imageUrls,
      video: videoUrl,
    });
  };

  const addImageUrl = (url: string) => {
    setImageUrls([...imageUrls, url]);
  };

  const removeImageUrl = (index: number) => {
    setImageUrls(imageUrls.filter((_, i) => i !== index));
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/products")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-create-product">
                Create New Product
              </h1>
              <p className="text-muted-foreground mt-1">Add a new product to your catalog</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="name">
                    Product Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    {...form.register("name")}
                    placeholder="Enter product name"
                    data-testid="input-name"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <div>
                  <Label htmlFor="description">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    {...form.register("description")}
                    placeholder="Enter product description"
                    rows={4}
                    data-testid="input-description"
                  />
                  {form.formState.errors.description && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.description.message}</p>
                  )}
                </div>

                <CategorySelect
                  value={form.watch("categoryId")}
                  onValueChange={(value) => form.setValue("categoryId", value)}
                  label="Category"
                  required={false}
                  error={form.formState.errors.categoryId?.message}
                  testId="select-category"
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Pricing & Inventory</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="price">
                      Selling Price (GHS) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="price"
                      type="number"
                      step="0.01"
                      {...form.register("price")}
                      placeholder="0.00"
                      data-testid="input-price"
                    />
                    {form.formState.errors.price && (
                      <p className="text-sm text-destructive mt-1">{form.formState.errors.price.message}</p>
                    )}
                  </div>

                  {/* Admin only: pick seller to create on behalf */}
                  {(user?.role === 'admin' || user?.role === 'super_admin') && (
                    <div>
                      <Label htmlFor="sellerId">Seller</Label>
                      <select id="sellerId" {...form.register('sellerId')} className="w-full mt-1 p-2 border rounded" data-testid="select-seller">
                        <option value="">Select seller</option>
                        {sellers && sellers.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name || s.email}</option>
                        ))}
                      </select>
                      {form.formState.errors.sellerId && (
                        <p className="text-sm text-destructive mt-1">{form.formState.errors.sellerId.message}</p>
                      )}
                    </div>
                  )}

                  <div>
                    <Label htmlFor="costPrice">Cost Price (GHS)</Label>
                    <Input
                      id="costPrice"
                      type="number"
                      step="0.01"
                      {...form.register("costPrice")}
                      placeholder="0.00"
                      data-testid="input-cost-price"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="stock">
                    Stock Quantity <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="stock"
                    type="number"
                    {...form.register("stock", { valueAsNumber: true })}
                    placeholder="0"
                    data-testid="input-stock"
                  />
                  {form.formState.errors.stock && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.stock.message}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Images</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <MediaUploadInput
                    id="product-image"
                    label="Add Product Image"
                    value=""
                    onChange={addImageUrl}
                    accept="image"
                    placeholder="https://example.com/image.jpg"
                    description="Upload product images (max 10MB each)"
                  />
                </div>

                {imageUrls.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
                    {imageUrls.map((url, index) => (
                      <div key={index} className="relative group" data-testid={`image-preview-${index}`}>
                        <img
                          src={url}
                          alt={`Product ${index + 1}`}
                          className="w-full h-32 object-cover rounded border"
                        />
                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeImageUrl(index)}
                          data-testid={`button-remove-image-${index}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {imageUrls.length === 0 && (
                  <p className="text-sm text-destructive">At least one product image is required</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Product Video (Optional)</CardTitle>
              </CardHeader>
              <CardContent>
                <MediaUploadInput
                  id="product-video"
                  label="Add Product Video"
                  value={videoUrl}
                  onChange={setVideoUrl}
                  accept="video"
                  placeholder="https://example.com/video.mp4"
                  description="Upload a product video (max 30MB, 30 seconds)"
                />
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin/products")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createProductMutation.isPending}
                data-testid="button-submit"
              >
                {createProductMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Product
              </Button>
            </div>
          </form>
      </div>
    </DashboardLayout>
  );
}
