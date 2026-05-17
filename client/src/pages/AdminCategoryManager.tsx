import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCategorySchema } from "@shared/schema";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import MediaUploadInput from "@/components/MediaUploadInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, Trash2, ArrowUp, ArrowDown, ArrowLeft, Loader2 } from "lucide-react";
import type { Category } from "@shared/schema";
import { STORE_TYPES } from "@shared/storeTypes";
import { productMatchesCategory } from "@/lib/categoryUtils";

const dynamicFieldSchema = z.object({
  name: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "select", "multiselect", "number"]),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
  description: z.string().optional(),
  required: z.boolean().optional(),
});
type CuisineField = z.infer<typeof dynamicFieldSchema>;

const categoryFormSchema = insertCategorySchema.extend({
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  storeTypes: z.array(z.string()).optional(),
  productFieldsConfig: z.array(dynamicFieldSchema).optional(),
});

type CategoryFormData = z.infer<typeof categoryFormSchema>;

type CategoryPageProduct = {
  id: string;
  category?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
};

export default function AdminCategoryManager() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  // Super-admin scopes: categories live in two contexts that surface on different
  // mobile/desktop sections — generic "stores" feed vs. the "Restaurants & Local
  // Vendors" food page. A category is food-scoped when its storeTypes array
  // includes food_beverages or restaurant.
  const [activeTab, setActiveTab] = useState<"stores" | "food" | "pending">("stores");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });
  const { data: products = [] } = useQuery<CategoryPageProduct[]>({
    queryKey: ["/api/products"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const focusedCategoryId = useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("categoryId") || "";
  }, [location]);

  const clearFocusedCategory = () => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has("categoryId") && !params.has("action")) return;
    params.delete("categoryId");
    params.delete("action");
    const nextQuery = params.toString();
    navigate(nextQuery ? `/admin/categories?${nextQuery}` : "/admin/categories", { replace: true } as any);
  };

  const form = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      image: "",
      description: "",
      displayOrder: 0,
      isActive: true,
      storeTypes: [],
      productFieldsConfig: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: CategoryFormData) => {
      const response = await apiRequest("POST", "/api/categories", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsDialogOpen(false);
      setEditingCategory(null);
      form.reset();
      toast({ title: "Success", description: "Category created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CategoryFormData }) => {
      const response = await apiRequest("PATCH", `/api/categories/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsDialogOpen(false);
      setEditingCategory(null);
      form.reset();
      clearFocusedCategory();
      toast({ title: "Success", description: "Category updated successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/categories/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      clearFocusedCategory();
      toast({ title: "Success", description: "Category deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // One-click seed of standard cuisine categories (Rice, Drinks, Pizza, etc.)
  const seedCuisinesMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/categories/seed-cuisines");
      return r.json();
    },
    onSuccess: (data: { created: string[]; skipped: string[] }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      const c = data?.created?.length ?? 0;
      const s = data?.skipped?.length ?? 0;
      toast({
        title: c > 0 ? "Cuisines seeded" : "Already seeded",
        description: c > 0
          ? `Added ${c} cuisine${c === 1 ? "" : "s"}${s > 0 ? `, skipped ${s} existing` : ""}.`
          : "All default cuisines are already present.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Seed failed", description: error.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/categories/${id}/approve`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories", "active"] });
      clearFocusedCategory();
      toast({ title: "Success", description: "Category approved and now visible on the homepage." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("POST", `/api/categories/${id}/reject`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/categories", "active"] });
      clearFocusedCategory();
      toast({ title: "Success", description: "Category request rejected." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (category: Category) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      slug: category.slug,
      image: category.image,
      description: category.description || "",
      displayOrder: category.displayOrder || 0,
      isActive: category.isActive,
      storeTypes: category.storeTypes || [],
      productFieldsConfig: (category as any).productFieldsConfig || [],
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
      deleteMutation.mutate(id);
    }
  };

  const handleReject = (category: Category) => {
    const confirmed = confirm(`Reject "${category.name}" and remove it from pending category requests?`);
    if (!confirmed) return;
    rejectMutation.mutate(category.id);
  };

  const onSubmit = (data: CategoryFormData) => {
    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenDialog = () => {
    setEditingCategory(null);
    // Pre-scope storeTypes based on the active tab so categories created from
    // the "Restaurants & Local Vendors" tab only surface on the food page,
    // and ones from "Stores" only surface in the general feed.
    const defaultStoreTypes = activeTab === "food"
      ? ["food_beverages", "restaurant"]
      : [];
    form.reset({
      name: "",
      slug: "",
      image: "",
      description: "",
      displayOrder: categories.length,
      isActive: true,
      storeTypes: defaultStoreTypes,
      productFieldsConfig: [],
    });
    setIsDialogOpen(true);
  };

  useEffect(() => {
    if (!focusedCategoryId || categories.length === 0) return;
    const targetCategory = categories.find((category) => category.id === focusedCategoryId);
    if (!targetCategory) return;

    if (!targetCategory.isActive) {
      setActiveTab("pending");
    } else if (isFoodCategory(targetCategory)) {
      setActiveTab("food");
    } else {
      setActiveTab("stores");
    }

    handleEdit(targetCategory);

    if (typeof document !== "undefined") {
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-testid="card-category-${targetCategory.id}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }, [focusedCategoryId, categories]);

  // Auto-generate slug from name
  const handleNameChange = (name: string) => {
    if (!editingCategory) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();
      form.setValue("slug", slug);
    }
  };

  const categoryProductCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      counts.set(
        category.id,
        products.filter((product) => productMatchesCategory(product as any, category)).length,
      );
    }
    return counts;
  }, [categories, products]);

  const sortCategoriesByProductCount = (source: Category[]) =>
    [...source].sort((a, b) => {
      const productDiff = (categoryProductCounts.get(b.id) || 0) - (categoryProductCounts.get(a.id) || 0);
      if (productDiff !== 0) return productDiff;
      const displayOrderDiff = (a.displayOrder || 0) - (b.displayOrder || 0);
      if (displayOrderDiff !== 0) return displayOrderDiff;
      return a.name.localeCompare(b.name);
    });

  const isFoodCategory = (c: Category) =>
    Array.isArray(c.storeTypes) &&
    c.storeTypes.some((t) => t === "food_beverages" || t === "restaurant");

  const pendingCategories = sortCategoriesByProductCount(categories.filter((category) => !category.isActive));
  const storeCategories = sortCategoriesByProductCount(
    categories.filter((c) => c.isActive && !isFoodCategory(c)),
  );
  const foodCategories = sortCategoriesByProductCount(
    categories.filter((c) => c.isActive && isFoodCategory(c)),
  );
  const visibleCategories =
    activeTab === "pending" ? pendingCategories
    : activeTab === "food" ? foodCategories
    : storeCategories;

  if (authLoading || isLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
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
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">Category Management</h1>
              <p className="text-muted-foreground mt-2">
                Manage product categories displayed on the homepage
              </p>
              {user?.role === "super_admin" && (
                <p className="text-sm text-muted-foreground mt-1">
                  Seller-submitted categories stay hidden until an admin approves them.
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {user?.role === "super_admin" && activeTab === "food" && (
                <Button
                  variant="outline"
                  onClick={() => seedCuisinesMutation.mutate()}
                  disabled={seedCuisinesMutation.isPending}
                  data-testid="button-seed-cuisines"
                >
                  {seedCuisinesMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Seed default cuisines
                </Button>
              )}
              <Button onClick={handleOpenDialog} data-testid="button-create-category">
                <Plus className="h-4 w-4 mr-2" />
                Add Category
              </Button>
            </div>
          </div>

          {user?.role === "super_admin" && (
            <Tabs
              value={activeTab}
              onValueChange={(value) =>
                setActiveTab(value === "food" ? "food" : value === "pending" ? "pending" : "stores")
              }
              className="mb-6"
            >
              <TabsList>
                <TabsTrigger value="stores" data-testid="tab-store-categories">
                  Stores ({storeCategories.length})
                </TabsTrigger>
                <TabsTrigger value="food" data-testid="tab-food-categories">
                  Restaurants &amp; Local Vendors ({foodCategories.length})
                </TabsTrigger>
                <TabsTrigger value="pending" data-testid="tab-pending-categories">
                  Pending ({pendingCategories.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value={activeTab} className="mt-0" />
            </Tabs>
          )}

            {visibleCategories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">
                  {activeTab === "pending"
                    ? "No pending categories right now"
                    : activeTab === "food"
                      ? "No restaurant or local-vendor categories yet"
                      : "No store categories yet"}
                </p>
                {activeTab !== "pending" && (
                  <Button onClick={handleOpenDialog}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create First Category
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {visibleCategories.map((category) => (
                <Card
                  key={category.id}
                  data-testid={`card-category-${category.id}`}
                  className={focusedCategoryId === category.id ? "ring-2 ring-primary/60" : undefined}
                >
                  <CardContent className="p-6">
                    <div className="flex gap-6 items-start">
                      <div className="w-32 h-32 flex-shrink-0">
                        <img
                          src={category.image}
                          alt={category.name}
                          className="w-full h-full object-cover rounded-lg"
                          data-testid={`img-category-${category.id}`}
                        />
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-xl font-semibold">{category.name}</h3>
                            <p className="text-sm text-muted-foreground">/{category.slug}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={category.isActive ? "default" : "secondary"}>
                              {category.isActive ? "Active" : "Pending Approval"}
                            </Badge>
                            <Badge variant="outline">
                              Products: {categoryProductCounts.get(category.id) || 0}
                            </Badge>
                            <Badge variant="outline">Order: {category.displayOrder}</Badge>
                          </div>
                        </div>
                        
                        {category.description && (
                          <p className="text-muted-foreground mb-4">{category.description}</p>
                        )}
                        
                        {category.storeTypes && category.storeTypes.length > 0 && (
                          <div className="mb-4">
                            <p className="text-sm text-muted-foreground mb-2">Available for store types:</p>
                            <div className="flex flex-wrap gap-2">
                              {category.storeTypes.map((type) => (
                                <Badge key={type} variant="secondary">
                                  {type.replace(/_/g, ' ')}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                        {(!category.storeTypes || category.storeTypes.length === 0) && (
                          <p className="text-sm text-muted-foreground mb-4">Available for all store types</p>
                        )}
                        
                        <div className="flex gap-2">
                          {user?.role === "super_admin" && !category.isActive && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => approveMutation.mutate(category.id)}
                              disabled={approveMutation.isPending}
                              data-testid={`button-approve-${category.id}`}
                            >
                              {approveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Approve
                            </Button>
                          )}
                          {user?.role === "super_admin" && !category.isActive && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleReject(category)}
                              disabled={rejectMutation.isPending}
                              data-testid={`button-reject-${category.id}`}
                            >
                              {rejectMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                              Reject
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(category)}
                            data-testid={`button-edit-${category.id}`}
                          >
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          {/* Super-admin can delete ANY category (active or inactive). */}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(category.id)}
                            data-testid={`button-delete-${category.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

            <Dialog
              open={isDialogOpen}
              onOpenChange={(open) => {
                setIsDialogOpen(open);
                if (!open) {
                  setEditingCategory(null);
                  clearFocusedCategory();
                }
              }}
            >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {editingCategory ? "Edit Category" : "Create New Category"}
                </DialogTitle>
              </DialogHeader>

              <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category Name *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., Elegant Abayas"
                            onChange={(e) => {
                              field.onChange(e);
                              handleNameChange(e.target.value);
                            }}
                            data-testid="input-name"
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
                        <FormLabel>URL Slug *</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., elegant-abayas"
                            data-testid="input-slug"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Used in the URL: /category/{field.value || "slug"}
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="image"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Category Image *</FormLabel>
                        <FormControl>
                          <MediaUploadInput
                            id="category-image"
                            label=""
                            value={field.value}
                            onChange={field.onChange}
                            accept="image"
                            placeholder="https://example.com/category-image.jpg"
                            description="Upload or enter URL for category image (min 300×300px)"
                            required
                            skip4KValidation
                            minDimensions={{ width: 300, height: 300 }}
                            mediaCategory="category"
                          />
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
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            placeholder="Brief description of this category..."
                            rows={3}
                            data-testid="input-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="storeTypes"
                    render={({ field }) => {
                      // Scope the available store-type checkboxes by the active tab.
                      // Food tab → only food_beverages + restaurant. Stores tab →
                      // everything else. Pending tab keeps the full list (since
                      // categories under review may belong to either scope).
                      const isFoodTab = activeTab === "food";
                      const isStoresTab = activeTab === "stores";
                      const visibleStoreTypes = isFoodTab
                        ? STORE_TYPES.filter((t) => t === "food_beverages" || t === "restaurant")
                        : isStoresTab
                          ? STORE_TYPES.filter((t) => t !== "food_beverages" && t !== "restaurant")
                          : STORE_TYPES;
                      const scopeLabel = isFoodTab
                        ? "Restaurants & Local Vendors"
                        : isStoresTab
                          ? "general store types"
                          : "store types";
                      return (
                        <FormItem>
                          <FormLabel>Available for {scopeLabel} (Optional)</FormLabel>
                          <FormDescription>
                            {isFoodTab
                              ? "Pick which food businesses can use this category. Leave empty to apply to all restaurants and local vendors."
                              : isStoresTab
                                ? "Pick which general store types can use this category. Food-only options are managed separately under the Restaurants & Local Vendors tab."
                                : "Leave empty to show this category to all store types. Select specific types to restrict visibility."}
                          </FormDescription>
                          <div className="grid grid-cols-2 gap-4 mt-3">
                            {visibleStoreTypes.map((storeType) => (
                              <div key={storeType} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`store-type-${storeType}`}
                                  checked={field.value?.includes(storeType)}
                                  onCheckedChange={(checked) => {
                                    const current = field.value || [];
                                    if (checked) {
                                      field.onChange([...current, storeType]);
                                    } else {
                                      field.onChange(current.filter((t) => t !== storeType));
                                    }
                                  }}
                                  data-testid={`checkbox-store-type-${storeType}`}
                                />
                                <label
                                  htmlFor={`store-type-${storeType}`}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                >
                                  {storeType.replace(/_/g, ' ')}
                                </label>
                              </div>
                            ))}
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* Cuisine field builder — visible only when this category is
                      scoped to food vendors / restaurants. Lets super admin define
                      Pizza→crust/sauce/toppings or Sushi→rice type style fields. */}
                  <FormField
                    control={form.control}
                    name="productFieldsConfig"
                    render={({ field }) => {
                      const storeTypesVal = form.watch("storeTypes") || [];
                      const isFoodScope = storeTypesVal.some((t: string) => t === "food_beverages" || t === "restaurant");
                      if (!isFoodScope) return <></>;
                      const fields: CuisineField[] = Array.isArray(field.value) ? (field.value as any) : [];
                      const updateField = (idx: number, patch: Partial<CuisineField>) => {
                        const next = fields.map((f, i) => i === idx ? { ...f, ...patch } : f);
                        field.onChange(next);
                      };
                      const removeField = (idx: number) => {
                        field.onChange(fields.filter((_, i) => i !== idx));
                      };
                      const addField = () => {
                        field.onChange([
                          ...fields,
                          { name: "", label: "", type: "text", required: false } as CuisineField,
                        ]);
                      };
                      return (
                        <FormItem>
                          <FormLabel>Cuisine-specific fields</FormLabel>
                          <FormDescription>
                            When a seller picks this cuisine, these fields appear on the product form alongside the usual ones — e.g. Pizza shows Crust / Sauce / Toppings, Sushi shows Rice type / Fish.
                          </FormDescription>
                          <div className="mt-3 space-y-3">
                            {fields.map((f, idx) => (
                              <div key={idx} className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Internal key</label>
                                    <Input
                                      value={f.name}
                                      onChange={(e) => updateField(idx, {
                                        name: e.target.value
                                          .toLowerCase()
                                          .replace(/[^a-z0-9_]+/g, "_")
                                          .replace(/^_+|_+$/g, ""),
                                      })}
                                      placeholder="e.g. crust_type"
                                      data-testid={`input-cuisine-field-name-${idx}`}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Buyer-facing label</label>
                                    <Input
                                      value={f.label}
                                      onChange={(e) => updateField(idx, { label: e.target.value })}
                                      placeholder="e.g. Crust type"
                                      data-testid={`input-cuisine-field-label-${idx}`}
                                    />
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Field type</label>
                                    <select
                                      value={f.type}
                                      onChange={(e) => updateField(idx, { type: e.target.value as CuisineField["type"] })}
                                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                      data-testid={`select-cuisine-field-type-${idx}`}
                                    >
                                      <option value="text">Short text</option>
                                      <option value="textarea">Long text</option>
                                      <option value="select">Pick one (options)</option>
                                      <option value="multiselect">Pick many (options)</option>
                                      <option value="number">Number</option>
                                    </select>
                                  </div>
                                  <div className="flex items-end gap-2">
                                    <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-muted-foreground">
                                      <Checkbox
                                        checked={!!f.required}
                                        onCheckedChange={(c) => updateField(idx, { required: !!c })}
                                      />
                                      Required
                                    </label>
                                  </div>
                                </div>
                                {(f.type === "select" || f.type === "multiselect") && (
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Options (comma-separated)</label>
                                    <Input
                                      value={Array.isArray(f.options) ? f.options.join(", ") : ""}
                                      onChange={(e) => updateField(idx, {
                                        options: e.target.value
                                          .split(",")
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      })}
                                      placeholder="e.g. Thin crust, Thick crust, Stuffed crust"
                                      data-testid={`input-cuisine-field-options-${idx}`}
                                    />
                                  </div>
                                )}
                                {(f.type === "text" || f.type === "textarea") && (
                                  <div className="space-y-1">
                                    <label className="text-xs font-medium text-muted-foreground">Placeholder (optional)</label>
                                    <Input
                                      value={f.placeholder || ""}
                                      onChange={(e) => updateField(idx, { placeholder: e.target.value })}
                                      placeholder="What the seller sees as a hint"
                                    />
                                  </div>
                                )}
                                <div className="flex justify-end">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeField(idx)}
                                    className="text-destructive hover:text-destructive"
                                    data-testid={`button-remove-cuisine-field-${idx}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                    Remove field
                                  </Button>
                                </div>
                              </div>
                            ))}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={addField}
                              data-testid="button-add-cuisine-field"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              Add cuisine field
                            </Button>
                          </div>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="displayOrder"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? 0}
                            type="number"
                            min={0}
                            onChange={(e) => field.onChange(parseInt(e.target.value))}
                            data-testid="input-displayOrder"
                          />
                        </FormControl>
                        <p className="text-xs text-muted-foreground">
                          Lower numbers appear first
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isActive"
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-3">
                        <FormControl>
                          <Switch
                            checked={field.value ?? true}
                            onCheckedChange={field.onChange}
                            data-testid="switch-isActive"
                          />
                        </FormControl>
                        <FormLabel className="!mt-0">Active</FormLabel>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsDialogOpen(false)}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={createMutation.isPending || updateMutation.isPending}
                      data-testid="button-submit"
                    >
                      {editingCategory ? "Update" : "Create"} Category
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
    </DashboardLayout>
  );
}
