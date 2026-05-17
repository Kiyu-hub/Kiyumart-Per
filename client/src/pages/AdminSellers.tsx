import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, Store, Edit, Ban, ArrowLeft, Plus, CheckCircle, XCircle, ShieldCheck, Clock, ExternalLink, Eye, CreditCard, User, MapPin, Tag, ZoomIn, ZoomOut, RotateCw, Package, ShoppingBag } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatGhanaCardInput, GHANA_CARD_MAX_LENGTH } from "@/lib/ghanaCard";
import MediaUploadInput from "@/components/MediaUploadInput";
import { STORE_TYPES, STORE_TYPE_CONFIG, type StoreType } from "@shared/storeTypes";
import { StoreTypeSelector, StoreTypeDynamicFields } from "@/components/StoreTypeSelector";

interface SellerData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  isActive: boolean;
  isApproved: boolean;
  applicationStatus?: "pending" | "interview_scheduled" | "approved" | "rejected" | null;
  storeName: string | null;
  storeDescription: string | null;
  storeBanner: string | null;
  storeType: string | null;
  profileImage: string | null;
  ghanaCardFront: string | null;
  ghanaCardBack: string | null;
  nationalIdCard: string | null;
  businessAddress: string | null;
  createdAt: string | null;
  storeId?: string | null;
  storeLogo?: string | null;
  productCount?: number;
  orderCount?: number;
  storeTypeMetadata?: Record<string, any> | null;
}

const createSellerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().optional(),
  storeName: z.string().min(2, "Store name must be at least 2 characters"),
  storeDescription: z.string().optional(),
  storeType: z.enum(STORE_TYPES, { required_error: "Store type is required" }),
  businessAddress: z.string().min(5, "Business address is required"),
  storeBanner: z.string().optional(),
  storeTypeMetadata: z.record(z.any()).optional(),
});

const editSellerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  storeType: z.enum(STORE_TYPES, { required_error: "Store type is required" }),
  storeName: z.string().min(2, "Store name must be at least 2 characters"),
  storeDescription: z.string().optional(),
  storeBanner: z.string().optional(),
  businessAddress: z.string().optional(),
  nationalIdCard: z.string().optional(),
  profileImage: z.string().optional(),
  ghanaCardFront: z.string().optional(),
  ghanaCardBack: z.string().optional(),
  storeTypeMetadata: z.record(z.any()).optional(),
});

type CreateSellerFormData = z.infer<typeof createSellerSchema>;
type EditSellerFormData = z.infer<typeof editSellerSchema>;

const normalizeSeller = (raw: any): SellerData => ({
  id: String(raw?.id || ""),
  name: String(raw?.name || raw?.username || ""),
  email: String(raw?.email || ""),
  phone: raw?.phone ? String(raw.phone) : null,
  role: String(raw?.role || ""),
  isActive: Boolean(raw?.isActive),
  isApproved: Boolean(raw?.isApproved),
  applicationStatus: raw?.applicationStatus || null,
  storeName: raw?.storeName || null,
  storeDescription: raw?.storeDescription || null,
  storeBanner: raw?.storeBanner || null,
  storeType: raw?.storeType || null,
  profileImage: raw?.profileImage || null,
  ghanaCardFront: raw?.ghanaCardFront || null,
  ghanaCardBack: raw?.ghanaCardBack || null,
  nationalIdCard: raw?.nationalIdCard || null,
  businessAddress: raw?.businessAddress || null,
  createdAt: raw?.createdAt || null,
  storeId: raw?.storeId || null,
  storeLogo: raw?.storeLogo || null,
  productCount: Number(raw?.productCount || 0),
  orderCount: Number(raw?.orderCount || 0),
  storeTypeMetadata: raw?.storeTypeMetadata || null,
});

function CreateSellerDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<CreateSellerFormData>({
    resolver: zodResolver(createSellerSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      storeName: "",
      storeDescription: "",
      storeType: undefined as any,
      businessAddress: "",
      storeBanner: "",
      storeTypeMetadata: {},
    },
  });

  const createSellerMutation = useMutation({
    mutationFn: async (data: CreateSellerFormData) => {
      return apiRequest("POST", "/api/users", {
        ...data,
        role: "seller",
        storeTypeMetadata: data.storeTypeMetadata || {},
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Seller created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seller-stats"] });
      setOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create seller",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateSellerFormData) => {
    createSellerMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-seller">
          <Plus className="mr-2 h-4 w-4" />
          Create New Seller
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Seller</DialogTitle>
          <DialogDescription>
            Add a new seller to the platform with store details
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-create-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="seller@example.com" {...field} data-testid="input-create-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password *</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} data-testid="input-create-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+233 XX XXX XXXX" {...field} data-testid="input-create-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="storeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="My Fashion Store" {...field} data-testid="input-create-store-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Type <span className="text-destructive">*</span></FormLabel>
                  <FormDescription>
                    Choose the category that best fits this seller's business.
                  </FormDescription>
                  <StoreTypeSelector
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      form.setValue("storeTypeMetadata", {});
                    }}
                    error={form.formState.errors.storeType?.message as string | undefined}
                  />
                </FormItem>
              )}
            />

            {form.watch("storeType") && (
              <StoreTypeDynamicFields
                storeType={form.watch("storeType") as StoreType}
                metadata={form.watch("storeTypeMetadata") || {}}
                onChange={(updated) => form.setValue("storeTypeMetadata", updated)}
              />
            )}

            <FormField
              control={form.control}
              name="businessAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Address *</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, Accra, Ghana" {...field} data-testid="input-create-business-address" />
                  </FormControl>
                  <FormDescription>Physical location of the business</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storeDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe your store and products..." 
                      {...field} 
                      data-testid="input-create-store-description"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storeBanner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Banner Image</FormLabel>
                  <FormControl>
                    <MediaUploadInput
                      id="store-banner"
                      label=""
                      value={field.value || ""}
                      onChange={field.onChange}
                      accept="image"
                      placeholder="Upload or enter image URL..."
                      description="Store banner image (min 800×200px)"
                      skip4KValidation
                      minDimensions={{ width: 800, height: 200 }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  form.reset();
                }}
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createSellerMutation.isPending}
                data-testid="button-submit-create"
              >
                {createSellerMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Seller
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function EditSellerDialog({ sellerData }: { sellerData: SellerData }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const normalizeMediaUrl = (value?: string | null) => {
    if (!value) return "";
    const normalized = String(value).trim();
    if (!normalized || normalized === "null" || normalized === "undefined") return "";
    return normalized;
  };

  const form = useForm<EditSellerFormData>({
    resolver: zodResolver(editSellerSchema),
    defaultValues: {
      name: sellerData.name,
      email: sellerData.email,
      phone: sellerData.phone || "",
      password: "",
      storeType: (sellerData.storeType as (typeof STORE_TYPES)[number]) || STORE_TYPES[0],
      storeName: sellerData.storeName || "",
      storeDescription: sellerData.storeDescription || "",
      storeBanner: sellerData.storeBanner || "",
      businessAddress: sellerData.businessAddress || "",
      nationalIdCard: sellerData.nationalIdCard || "",
      profileImage: sellerData.profileImage || "",
      ghanaCardFront: sellerData.ghanaCardFront || "",
      ghanaCardBack: sellerData.ghanaCardBack || "",
      storeTypeMetadata: sellerData.storeTypeMetadata || {},
    },
  });

  const { data: sellerStore } = useQuery<{ banner?: string | null; logo?: string | null; name?: string | null; description?: string | null } | null>({
    queryKey: ["/api/stores/by-seller", sellerData.id, "edit"],
    queryFn: async () => {
      const res = await fetch(`/api/stores/by-seller/${sellerData.id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load seller store");
      }
      return res.json();
    },
    enabled: open,
    retry: false,
    staleTime: 0,
  });

  useEffect(() => {
    if (!open) return;

    const currentStoreBanner = normalizeMediaUrl(form.getValues("storeBanner"));
    const fallbackBanner = normalizeMediaUrl(sellerStore?.banner || sellerData.storeBanner);
    if (!currentStoreBanner && fallbackBanner && !form.getFieldState("storeBanner").isDirty) {
      form.setValue("storeBanner", fallbackBanner, { shouldDirty: false });
    }

    const currentProfileImage = normalizeMediaUrl(form.getValues("profileImage"));
    const normalizedStoreLogo = normalizeMediaUrl(sellerStore?.logo);
    const normalizedStoreBanner = normalizeMediaUrl(sellerStore?.banner || sellerData.storeBanner);
    const fallbackStoreLogo =
      normalizedStoreLogo && normalizedStoreLogo !== normalizedStoreBanner
        ? normalizedStoreLogo
        : null;
    const fallbackProfile = normalizeMediaUrl(sellerData.profileImage || fallbackStoreLogo);
    if (!currentProfileImage && fallbackProfile && !form.getFieldState("profileImage").isDirty) {
      form.setValue("profileImage", fallbackProfile, { shouldDirty: false });
    }
  }, [open, sellerStore, sellerData.storeBanner, sellerData.profileImage, form]);

  const editSellerMutation = useMutation({
    mutationFn: async (data: EditSellerFormData) => {
      const updateData: any = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        storeType: data.storeType,
        storeName: data.storeName,
        storeDescription: data.storeDescription,
        storeBanner: data.storeBanner,
        businessAddress: data.businessAddress || null,
        nationalIdCard: data.nationalIdCard || null,
        profileImage: data.profileImage || null,
        ghanaCardFront: data.ghanaCardFront || null,
        ghanaCardBack: data.ghanaCardBack || null,
        storeTypeMetadata: data.storeTypeMetadata || {},
      };

      if (data.password && data.password.length > 0) {
        updateData.password = data.password;
      }

      return apiRequest("PATCH", `/api/users/${sellerData.id}`, updateData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Seller updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seller-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stores/by-seller", sellerData.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/seller-profile", sellerData.id] });
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update seller",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditSellerFormData) => {
    editSellerMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          data-testid={`button-edit-${sellerData.id}`}
        >
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Seller</DialogTitle>
          <DialogDescription>
            Update seller information and store details
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name *</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} data-testid="input-edit-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="seller@example.com" {...field} data-testid="input-edit-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password (Leave blank to keep current)</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} data-testid="input-edit-password" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="+233 XX XXX XXXX" {...field} data-testid="input-edit-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="storeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Type <span className="text-destructive">*</span></FormLabel>
                  <FormDescription>
                    Choose the category that best fits this seller's business.
                  </FormDescription>
                  <StoreTypeSelector
                    value={field.value}
                    onChange={(value) => {
                      field.onChange(value);
                      form.setValue("storeTypeMetadata", {});
                    }}
                    error={form.formState.errors.storeType?.message as string | undefined}
                  />
                </FormItem>
              )}
            />

            {form.watch("storeType") && (
              <StoreTypeDynamicFields
                storeType={form.watch("storeType") as StoreType}
                metadata={form.watch("storeTypeMetadata") || {}}
                onChange={(updated) => form.setValue("storeTypeMetadata", updated)}
              />
            )}

            <FormField
              control={form.control}
              name="storeName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Name *</FormLabel>
                  <FormControl>
                    <Input placeholder="My Fashion Store" {...field} data-testid="input-edit-store-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storeDescription"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Description</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Describe your store and products..." 
                      {...field} 
                      data-testid="input-edit-store-description"
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="businessAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Main St, Accra, Ghana" {...field} data-testid="input-edit-business-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nationalIdCard"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ghana Card Number</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="GHA-XXXXXXXXX-X"
                      inputMode="text"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={GHANA_CARD_MAX_LENGTH}
                      {...field}
                      value={field.value || ""}
                      onChange={(e) => field.onChange(formatGhanaCardInput(e.target.value))}
                      data-testid="input-edit-national-id-card"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="profileImage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Image</FormLabel>
                  <FormControl>
                    <MediaUploadInput
                      id="edit-seller-profile-image"
                      label=""
                      value={field.value || ""}
                      onChange={field.onChange}
                      accept="image"
                      placeholder="Upload or enter profile image URL..."
                      description="Profile image shown in user cards and profile views"
                      skip4KValidation
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="ghanaCardFront"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ghana Card Front</FormLabel>
                    <FormControl>
                      <MediaUploadInput
                        id="edit-seller-ghana-front"
                        label=""
                        value={field.value || ""}
                        onChange={field.onChange}
                        accept="image"
                        placeholder="Upload or enter front image URL..."
                        description="Front side of verification card"
                        skip4KValidation
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ghanaCardBack"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ghana Card Back</FormLabel>
                    <FormControl>
                      <MediaUploadInput
                        id="edit-seller-ghana-back"
                        label=""
                        value={field.value || ""}
                        onChange={field.onChange}
                        accept="image"
                        placeholder="Upload or enter back image URL..."
                        description="Back side of verification card"
                        skip4KValidation
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="storeBanner"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Banner Image</FormLabel>
                  <FormControl>
                    <MediaUploadInput
                      id="edit-store-banner"
                      label=""
                      value={field.value || ""}
                      onChange={field.onChange}
                      accept="image"
                      placeholder="Upload or enter image URL..."
                      description="Store banner image (min 800×200px)"
                      skip4KValidation
                      minDimensions={{ width: 800, height: 200 }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel-edit"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={editSellerMutation.isPending}
                data-testid="button-submit-edit"
              >
                {editSellerMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update Seller
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ViewApplicationDialog({ sellerData }: { sellerData: SellerData }) {
  const [open, setOpen] = useState(false);
  const [cardRotation, setCardRotation] = useState<{ front: number; back: number }>({
    front: 0,
    back: 0,
  });
  const [zoomedImage, setZoomedImage] = useState<{ label: string; url: string } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomRotation, setZoomRotation] = useState(0);

  const { data: sellerStore } = useQuery<{ banner?: string | null; logo?: string | null } | null>({
    queryKey: ["/api/stores/by-seller", sellerData.id],
    queryFn: async () => {
      const res = await fetch(`/api/stores/by-seller/${sellerData.id}`, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load seller store");
      }
      return res.json();
    },
    enabled: open,
    retry: false,
    staleTime: 0,
  });

  const normalizeBannerUrl = (value?: string | null) => {
    if (!value) return null;
    const normalized = String(value).trim();
    if (!normalized || normalized === "null" || normalized === "undefined") return null;
    return normalized;
  };
  const normalizedStoreLogo = normalizeBannerUrl(sellerStore?.logo);
  const normalizedStoreBanner = normalizeBannerUrl(sellerStore?.banner) || normalizeBannerUrl(sellerData.storeBanner);
  const storeLogoCandidate =
    normalizedStoreLogo && normalizedStoreLogo !== normalizedStoreBanner
      ? normalizedStoreLogo
      : null;
  const resolvedProfileImage =
    normalizeBannerUrl(sellerData.profileImage) ||
    storeLogoCandidate ||
    null;
  const resolvedStoreBanner =
    normalizedStoreBanner ||
    null;

  const openZoom = (label: string, url: string, rotation: number) => {
    setZoomedImage({ label, url });
    setZoomScale(1);
    setZoomRotation(rotation % 360);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setCardRotation({ front: 0, back: 0 });
        } else {
          setZoomedImage(null);
          setZoomScale(1);
          setZoomRotation(0);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          data-testid={`button-view-application-${sellerData.id}`}
        >
          <Eye className="h-3 w-3 mr-1" />
          View Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Seller Application Details</DialogTitle>
          <DialogDescription>
            Review all application details including verification documents
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Profile + Banner (wrapped together, still separate fields) */}
          <div className="rounded-lg border border-border/70 bg-muted/20 p-4 md:p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4">
              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Photo
                </h3>
                <div className="rounded-lg overflow-hidden border border-border/70 bg-muted/30 p-6 h-full">
                  <div className="relative h-40 flex items-center justify-center">
                    {resolvedProfileImage ? (
                      <button
                        type="button"
                        className="rounded-full p-1.5 bg-background border border-border shadow-lg"
                        onClick={() => openZoom("Profile Photo", resolvedProfileImage, 0)}
                      >
                        <img
                          src={resolvedProfileImage}
                          alt="Profile"
                          className="w-32 h-32 rounded-full object-cover cursor-zoom-in"
                        />
                      </button>
                    ) : (
                      <div className="w-32 h-32 rounded-full bg-background border-2 border-border shadow-sm flex items-center justify-center">
                        <User className="h-12 w-12 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <Store className="h-5 w-5" />
                  Store Banner
                </h3>
                <div className="rounded-lg overflow-hidden border border-border/70 bg-muted/30 h-full">
                  {resolvedStoreBanner ? (
                    <button
                      type="button"
                      className="block w-full text-left h-full"
                      onClick={() => openZoom("Store Banner", resolvedStoreBanner, 0)}
                    >
                      <img
                        src={resolvedStoreBanner}
                        alt="Store banner"
                        className="h-48 w-full object-cover cursor-zoom-in"
                      />
                    </button>
                  ) : (
                    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                      No store banner set
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Personal Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{sellerData.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{sellerData.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium">{sellerData.phone || 'N/A'}</p>
              </div>
              {sellerData.nationalIdCard && (
                <div>
                  <p className="text-muted-foreground">Ghana Card Number</p>
                  <p className="font-medium">{sellerData.nationalIdCard}</p>
                </div>
              )}
            </div>
          </div>

          {/* Ghana Card Verification */}
          {(sellerData.ghanaCardFront || sellerData.ghanaCardBack) && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Ghana Card Verification
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sellerData.ghanaCardFront && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Front</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openZoom("Ghana Card Front", sellerData.ghanaCardFront!, cardRotation.front)}
                        >
                          Zoom
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setCardRotation((prev) => ({ ...prev, front: (prev.front + 90) % 360 }))
                          }
                        >
                          Rotate
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-2 h-60 border border-border/70 flex items-center justify-center overflow-hidden">
                      <img
                        src={sellerData.ghanaCardFront}
                        alt="Ghana Card Front"
                        className="max-h-[85%] max-w-[85%] rounded object-contain transition-transform duration-150 cursor-zoom-in"
                        style={{
                          transform: `rotate(${cardRotation.front}deg)`,
                          imageOrientation: "from-image" as any,
                        }}
                        onClick={() => openZoom("Ghana Card Front", sellerData.ghanaCardFront!, cardRotation.front)}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          const shouldRotate = img.naturalHeight > img.naturalWidth;
                          setCardRotation((prev) =>
                            prev.front !== 0 ? prev : { ...prev, front: shouldRotate ? 90 : 0 }
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
                {sellerData.ghanaCardBack && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Back</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openZoom("Ghana Card Back", sellerData.ghanaCardBack!, cardRotation.back)}
                        >
                          Zoom
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setCardRotation((prev) => ({ ...prev, back: (prev.back + 90) % 360 }))
                          }
                        >
                          Rotate
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-2 h-60 border border-border/70 flex items-center justify-center overflow-hidden">
                      <img
                        src={sellerData.ghanaCardBack}
                        alt="Ghana Card Back"
                        className="max-h-[85%] max-w-[85%] rounded object-contain transition-transform duration-150 cursor-zoom-in"
                        style={{
                          transform: `rotate(${cardRotation.back}deg)`,
                          imageOrientation: "from-image" as any,
                        }}
                        onClick={() => openZoom("Ghana Card Back", sellerData.ghanaCardBack!, cardRotation.back)}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          const shouldRotate = img.naturalHeight > img.naturalWidth;
                          setCardRotation((prev) =>
                            prev.back !== 0 ? prev : { ...prev, back: shouldRotate ? 90 : 0 }
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Store Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <Store className="h-5 w-5" />
              Store Information
            </h3>
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Store Name</p>
                <p className="font-medium">{sellerData.storeName || 'N/A'}</p>
              </div>
              {sellerData.storeType && (
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    Store Type
                  </p>
                  <p className="font-medium">
                    {STORE_TYPE_CONFIG[sellerData.storeType as keyof typeof STORE_TYPE_CONFIG]?.icon}{' '}
                    {STORE_TYPE_CONFIG[sellerData.storeType as keyof typeof STORE_TYPE_CONFIG]?.label || sellerData.storeType}
                  </p>
                </div>
              )}
              <div>
                <p className="text-muted-foreground">Store Description</p>
                <p className="font-medium">{sellerData.storeDescription || 'N/A'}</p>
              </div>
              {sellerData.businessAddress && (
                <div>
                  <p className="text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    Business Address
                  </p>
                  <p className="font-medium">{sellerData.businessAddress}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>

      <Dialog
        open={Boolean(zoomedImage)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setZoomedImage(null);
            setZoomScale(1);
            setZoomRotation(0);
          }
        }}
      >
        <DialogContent className="w-[96vw] max-w-5xl h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{zoomedImage?.label || "Image Preview"}</DialogTitle>
            <DialogDescription>Use zoom and rotate controls to inspect details clearly.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 border-b px-6 py-3">
            <div className="text-sm text-muted-foreground truncate">{zoomedImage?.url || ""}</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZoomScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setZoomScale(1)}>
                100%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZoomScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZoomRotation((prev) => (prev + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="h-full overflow-auto bg-black/80 p-4">
            {zoomedImage && (
              <div className="flex min-h-full items-center justify-center">
                <img
                  src={zoomedImage.url}
                  alt={zoomedImage.label}
                  className="max-w-none"
                  style={{
                    transform: `scale(${zoomScale}) rotate(${zoomRotation}deg)`,
                    transformOrigin: "center center",
                    imageOrientation: "from-image" as any,
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function ApproveRejectDialog({ sellerData }: { sellerData: SellerData }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/users/${sellerData.id}/approve`);
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Seller application approved successfully",
      });
      // Force immediate refetch of users data
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/seller-stats"] });
      await queryClient.refetchQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
      setOpen(false);
      setAction(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve seller",
        variant: "destructive",
      });
      setAction(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/users/${sellerData.id}/reject`);
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Seller application rejected successfully",
      });
      // Force immediate refetch of users data
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/seller-stats"] });
      await queryClient.refetchQueries({ queryKey: ["/api/users"] });
      setOpen(false);
      setAction(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject seller",
        variant: "destructive",
      });
      setAction(null);
    },
  });

  const handleAction = (selectedAction: 'approve' | 'reject') => {
    setAction(selectedAction);
    setOpen(true);
  };

  const confirmAction = () => {
    if (action === 'approve') {
      approveMutation.mutate();
    } else if (action === 'reject') {
      rejectMutation.mutate();
    }
  };

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <>
      {!sellerData.isApproved && sellerData.isActive && (
        <div className="flex gap-1">
          <Button 
            variant="default" 
            size="sm"
            onClick={() => handleAction('approve')}
            data-testid={`button-approve-${sellerData.id}`}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Approve
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => handleAction('reject')}
            data-testid={`button-reject-${sellerData.id}`}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </div>
      )}
      
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === 'approve' ? 'Approve' : 'Reject'} Seller Application?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'approve' 
                ? `Are you sure you want to approve ${sellerData.name}'s application? This will create their store and allow them to start selling.`
                : `Are you sure you want to reject ${sellerData.name}'s application? This will deactivate their account.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-action">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={isPending}
              data-testid="button-confirm-action"
              className={action === 'reject' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {action === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function BanActivateDialog({ sellerData }: { sellerData: SellerData }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { toast } = useToast();

  const toggleStatusMutation = useMutation({
    mutationFn: async (reasonText: string) => {
      return apiRequest("PATCH", `/api/users/${sellerData.id}/status`, {
        isActive: !sellerData.isActive,
        reason: sellerData.isActive ? reasonText : undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Seller ${sellerData.isActive ? 'deactivated' : 'activated'} successfully`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/seller-stats"] });
      setReason("");
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update seller status",
        variant: "destructive",
      });
    },
  });

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setReason("");
        }
      }}
    >
      <AlertDialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          data-testid={`button-ban-${sellerData.id}`}
        >
          <Ban className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {sellerData.isActive ? 'Deactivate' : 'Activate'} Seller?
          </AlertDialogTitle>
        <AlertDialogDescription>
          Are you sure you want to {sellerData.isActive ? 'deactivate' : 'activate'} {sellerData.name}? 
          {sellerData.isActive && ' This will prevent them from accessing their account and managing their store.'}
        </AlertDialogDescription>
      </AlertDialogHeader>
      {sellerData.isActive ? (
        <div className="space-y-2">
          <label className="text-sm font-medium">Reason for deactivation</label>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this seller account is being deactivated..."
            rows={4}
          />
        </div>
      ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="button-cancel-ban">Cancel</AlertDialogCancel>
        <Button
          type="button"
          onClick={() => toggleStatusMutation.mutate(reason.trim())}
          disabled={toggleStatusMutation.isPending || (sellerData.isActive && !reason.trim())}
          data-testid="button-confirm-ban"
          variant="default"
        >
            {toggleStatusMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {sellerData.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export default function AdminSellers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const isAdminViewer =
    isAuthenticated && (user?.role === "admin" || user?.role === "super_admin");

  const { data: users = [], isLoading } = useQuery<SellerData[]>({
    queryKey: ["/api/admin/seller-stats"],
    queryFn: async () => {
      const res = await fetch("/api/admin/seller-stats", { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load sellers");
      }
      const payload = await res.json();
      if (!Array.isArray(payload)) return [];
      return payload.map(normalizeSeller);
    },
    enabled: isAdminViewer,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // All sellers (exclude rejected application records from management lists)
  const allSellers = (Array.isArray(users) ? users : []).filter((u) => {
    if (u.role !== "seller") return false;
    const status = String(u.applicationStatus || "").toLowerCase();
    return !(status === "rejected" && !u.isApproved);
  });
  
  // Pending applications (unapproved AND active sellers only, excluding rejected ones)
  const pendingSellers = allSellers.filter((s) => {
    const status = String(s.applicationStatus || "").toLowerCase();
    return s.isApproved === false && s.isActive === true && (status === "pending" || status === "interview_scheduled");
  });
  
  // Approved sellers
  const approvedSellers = allSellers.filter(s => s.isApproved === true);
  
  // Get the appropriate seller list based on active tab
  const sellers = activeTab === "pending" 
    ? pendingSellers 
    : activeTab === "approved" 
      ? approvedSellers 
      : allSellers;
  
  const filteredSellers = sellers.filter(s => 
    (s.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (s.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (s.storeName?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
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
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-sellers">Sellers Management</h1>
              <p className="text-muted-foreground mt-1">Manage sellers, stores, and approvals</p>
            </div>
            {user?.role !== "super_admin" && <CreateSellerDialog />}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="all" data-testid="tab-all-sellers">
                All Sellers ({allSellers.length})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending-sellers">
                Pending Applications ({pendingSellers.length})
              </TabsTrigger>
              <TabsTrigger value="approved" data-testid="tab-approved-sellers">
                Approved Sellers ({approvedSellers.length})
              </TabsTrigger>
            </TabsList>

            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search sellers by name, email or store..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-sellers"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                {filteredSellers.map((seller) => {
                  const sellerImage = seller.profileImage || seller.storeLogo || null;
                  const sellerBanner = seller.storeBanner || null;
                  const sellerProductCount = seller.productCount || 0;
                  const sellerOrderCount = seller.orderCount || 0;

                  return (
                <Card
                  key={seller.id}
                  className="group relative min-h-[340px] cursor-pointer overflow-hidden border-border/60 bg-card/95 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-2xl"
                  data-testid={`card-seller-${seller.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/admin/sellers/${seller.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/admin/sellers/${seller.id}`);
                    }
                  }}
                >
                  <div className="absolute inset-x-0 top-0 h-28 overflow-hidden">
                    {sellerBanner ? (
                      <img
                        src={sellerBanner}
                        alt={`${seller.storeName || seller.name} banner`}
                        className="h-full w-full object-cover"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <div className="absolute inset-0 hidden dark:block dark:bg-gradient-to-r dark:from-primary/25 dark:via-background/10 dark:to-transparent" />
                    <div className="absolute inset-0 hidden dark:block dark:bg-gradient-to-b dark:from-transparent dark:via-transparent dark:to-card" />
                  </div>
                  <div className="relative flex h-full flex-col p-5">
                    <div className="absolute right-5 top-5 z-10 flex gap-1.5">
                      <div className="min-w-[78px] rounded-[18px] border border-primary/20 bg-card/95 px-2.5 py-2 text-right shadow-sm backdrop-blur-sm">
                        <p className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">Products</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <Package className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-lg font-semibold leading-none text-foreground">{sellerProductCount}</p>
                        </div>
                      </div>
                      <div className="min-w-[78px] rounded-[18px] border border-border/70 bg-card/95 px-2.5 py-2 text-right shadow-sm backdrop-blur-sm">
                        <p className="text-[8px] uppercase tracking-[0.22em] text-muted-foreground">Orders</p>
                        <div className="mt-1.5 flex items-center justify-between">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
                            <ShoppingBag className="h-3.5 w-3.5" />
                          </div>
                          <p className="text-lg font-semibold leading-none text-foreground">{sellerOrderCount}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-1 flex-col gap-4">
                    <div className="relative h-24">
                      <div className="absolute bottom-0 left-0 h-20 w-20 overflow-hidden rounded-3xl border border-primary/20 bg-primary/10 shadow-sm flex items-center justify-center">
                      {sellerImage ? (
                        <img
                          src={sellerImage}
                          alt={`${seller.name} profile`}
                          className="h-full w-full object-cover"
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <Store className="h-6 w-6 text-primary" />
                      )}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-col gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="truncate text-xl font-semibold" data-testid={`text-name-${seller.id}`}>
                            {seller.name}
                          </h3>
                          <p className="mt-1 truncate text-sm font-medium text-primary" data-testid={`text-store-${seller.id}`}>
                            {seller.storeName || "No store name"}
                          </p>
                        </div>
                        <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-background/70 p-1.5 shadow-sm" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                          <ViewApplicationDialog sellerData={seller} />
                          <EditSellerDialog sellerData={seller} />
                          <BanActivateDialog sellerData={seller} />
                          {seller.isApproved && seller.storeId && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => navigate(`/sellers/${seller.id}`)}
                              data-testid={`button-view-store-${seller.id}`}
                              className="gap-1"
                            >
                              <ExternalLink className="h-4 w-4" />
                              Store
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span data-testid={`text-email-${seller.id}`}>{seller.email}</span>
                          {seller.phone && (
                            <>
                              <span>•</span>
                              <span data-testid={`text-phone-${seller.id}`}>{seller.phone}</span>
                            </>
                          )}
                        </div>
                        
                        {seller.storeDescription && (
                          <p className="text-sm text-muted-foreground line-clamp-2" data-testid={`text-description-${seller.id}`}>
                            {seller.storeDescription}
                          </p>
                        )}
                      </div>

                      {!seller.isApproved && (
                        <div className="mt-3">
                          <ApproveRejectDialog sellerData={seller} />
                        </div>
                      )}

                      <div className="mt-auto flex items-center gap-2 pt-4">
                        {seller.isActive ? (
                          <Badge className="bg-green-500" data-testid={`badge-status-${seller.id}`}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive" data-testid={`badge-status-${seller.id}`}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                        
                        {seller.isApproved ? (
                          <Badge className="bg-blue-500" data-testid={`badge-approval-${seller.id}`}>
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-approval-${seller.id}`}>
                            <Clock className="h-3 w-3 mr-1" />
                            Pending Approval
                          </Badge>
                        )}
                        
                        <span className="text-xs text-muted-foreground ml-auto" data-testid={`text-joined-${seller.id}`}>
                          Joined {seller.createdAt ? new Date(seller.createdAt).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                  </div>
                </Card>
                  );
                })}
              
              {filteredSellers.length === 0 && (
                <div className="text-center py-12">
                  <Store className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground" data-testid="text-no-sellers">
                    {searchQuery 
                      ? "No sellers found matching your search" 
                      : activeTab === "pending"
                        ? "No pending applications"
                        : "No sellers registered yet"
                    }
                  </p>
                </div>
              )}
            </div>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
