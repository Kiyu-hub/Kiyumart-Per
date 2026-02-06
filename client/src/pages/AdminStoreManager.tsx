import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import MediaUploadInput from "@/components/MediaUploadInput";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Store, ArrowLeft, AlertTriangle, Settings, Palette, Building2, ToggleLeft } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const storeSettingsSchema = z.object({
  platformName: z.string().min(1, "Store name is required"),
  logo: z.string().url().optional().or(z.literal("")),
  contactEmail: z.string().email("Must be a valid email"),
  contactPhone: z.string().min(1, "Contact phone is required"),
  contactAddress: z.string().min(1, "Store address is required"),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  useCustomBranding: z.boolean().default(false),
  businessHoursOpen: z.string().default("09:00"),
  businessHoursClose: z.string().default("18:00"),
  defaultCurrency: z.enum(["GHS"]),
  shippingZonesEnabled: z.boolean().default(true),
  isMultiVendor: z.boolean(),
  primaryStoreId: z.string().optional(),
  shopDisplayMode: z.enum(["by-store", "by-category"]).default("by-store"),
  footerDescription: z.string().min(1, "Store description is required"),
});

type StoreSettingsFormData = z.infer<typeof storeSettingsSchema>;

interface PlatformSettings extends Partial<StoreSettingsFormData> {
  id: string;
  updatedAt: string;
}

export default function AdminStoreManager() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [showModeWarning, setShowModeWarning] = useState(false);

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const { data: stores = [] } = useQuery<Array<{id: string; name: string; isActive: boolean; isApproved: boolean}>>({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const form = useForm<StoreSettingsFormData>({
    resolver: zodResolver(storeSettingsSchema),
    values: settings ? {
      platformName: settings.platformName || "",
      logo: settings.logo || "",
      contactEmail: settings.contactEmail || "",
      contactPhone: settings.contactPhone || "",
      contactAddress: settings.contactAddress || "",
      primaryColor: settings.primaryColor || "#1e7b5f",
      secondaryColor: settings.secondaryColor || "#2c3e50",
      useCustomBranding: false,
      businessHoursOpen: "09:00",
      businessHoursClose: "18:00",
      defaultCurrency: (settings.defaultCurrency as "GHS") || "GHS",
      shippingZonesEnabled: true,
      isMultiVendor: settings.isMultiVendor || false,
      primaryStoreId: settings.primaryStoreId || "",
      shopDisplayMode: (settings.shopDisplayMode as "by-store" | "by-category") || "by-store",
      footerDescription: settings.footerDescription || "",
    } : undefined,
  });

  // Keep store manager form in sync if something else updates platform settings
  useEffect(() => {
    if (settings) {
      form.reset({
        platformName: settings.platformName || "",
        logo: settings.logo || "",
        contactEmail: settings.contactEmail || "",
        contactPhone: settings.contactPhone || "",
        contactAddress: settings.contactAddress || "",
        primaryColor: settings.primaryColor || "#1e7b5f",
        secondaryColor: settings.secondaryColor || "#2c3e50",
        useCustomBranding: false,
        businessHoursOpen: "09:00",
        businessHoursClose: "18:00",
        defaultCurrency: (settings.defaultCurrency as "GHS") || "GHS",
        shippingZonesEnabled: true,
        isMultiVendor: settings.isMultiVendor || false,
        primaryStoreId: settings.primaryStoreId || "",
        shopDisplayMode: (settings.shopDisplayMode as "by-store" | "by-category") || "by-store",
        footerDescription: settings.footerDescription || "",
      });
    }
  }, [settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: StoreSettingsFormData) => {
      return await apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      toast({
        title: "Settings updated",
        description: "Store settings have been saved successfully.",
      });
      setShowModeWarning(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StoreSettingsFormData) => {
    // Convert empty string to undefined for primaryStoreId
    const cleanedData = {
      ...data,
      primaryStoreId: data.primaryStoreId && data.primaryStoreId !== "" ? data.primaryStoreId : undefined,
    };
    updateSettingsMutation.mutate(cleanedData);
  };

  const handleModeChange = (checked: boolean) => {
    form.setValue("isMultiVendor", checked);
    setShowModeWarning(true);
  };

  if (authLoading || isLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
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
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Store className="h-8 w-8" />
                Store Management
              </h1>
              <p className="text-muted-foreground mt-1">Configure your store settings and preferences</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 mb-6">
                <TabsTrigger value="profile" data-testid="tab-profile">
                  <Settings className="h-4 w-4 mr-2" />
                  Store Profile
                </TabsTrigger>
                <TabsTrigger value="branding" data-testid="tab-branding">
                  <Palette className="h-4 w-4 mr-2" />
                  Branding
                </TabsTrigger>
                <TabsTrigger value="business" data-testid="tab-business">
                  <Building2 className="h-4 w-4 mr-2" />
                  Business
                </TabsTrigger>
                <TabsTrigger value="mode" data-testid="tab-mode">
                  <ToggleLeft className="h-4 w-4 mr-2" />
                  Store Mode
                </TabsTrigger>
              </TabsList>

              <TabsContent value="profile" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Store Profile Settings</CardTitle>
                    <CardDescription>
                      Manage your store's basic information and contact details
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="platformName">Store Name</Label>
                      <Input
                        id="platformName"
                        {...form.register("platformName")}
                        placeholder="My Awesome Store"
                        data-testid="input-store-name"
                      />
                      {form.formState.errors.platformName && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.platformName.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="footerDescription">Store Description</Label>
                      <Textarea
                        id="footerDescription"
                        {...form.register("footerDescription")}
                        placeholder="Tell customers about your store..."
                        rows={4}
                        data-testid="input-store-description"
                      />
                      {form.formState.errors.footerDescription && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.footerDescription.message}
                        </p>
                      )}
                    </div>

                    <MediaUploadInput
                      id="logo"
                      label="Store Logo"
                      value={form.watch("logo") || ""}
                      onChange={(value) => form.setValue("logo", value)}
                      accept="image"
                      placeholder="https://example.com/logo.png"
                      description="Upload your store logo (min 200×200px)"
                      skip4KValidation
                      minDimensions={{ width: 200, height: 200 }}
                    />

                    <div className="space-y-2">
                      <Label htmlFor="contactEmail">Contact Email</Label>
                      <Input
                        id="contactEmail"
                        type="email"
                        {...form.register("contactEmail")}
                        placeholder="contact@mystore.com"
                        data-testid="input-contact-email"
                      />
                      {form.formState.errors.contactEmail && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.contactEmail.message}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactPhone">Contact Phone</Label>
                      <Input
                        id="contactPhone"
                        {...form.register("contactPhone")}
                        placeholder="+233 XX XXX XXXX"
                        data-testid="input-contact-phone"
                      />
                      {form.formState.errors.contactPhone && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.contactPhone.message}
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="branding" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Store Branding</CardTitle>
                    <CardDescription>
                      Customize your store's visual identity and color scheme
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="useCustomBranding">Use Custom Branding</Label>
                        <p className="text-sm text-muted-foreground">
                          Override platform branding with your own colors
                        </p>
                      </div>
                      <Switch
                        id="useCustomBranding"
                        checked={form.watch("useCustomBranding")}
                        onCheckedChange={(checked) => form.setValue("useCustomBranding", checked)}
                        data-testid="switch-custom-branding"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="primaryColor">Primary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="primaryColor"
                          type="color"
                          {...form.register("primaryColor")}
                          className="w-20 h-10"
                          data-testid="input-primary-color"
                        />
                        <Input
                          type="text"
                          {...form.register("primaryColor")}
                          placeholder="#1e7b5f"
                          className="flex-1"
                          data-testid="input-primary-color-text"
                        />
                      </div>
                      {form.formState.errors.primaryColor && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.primaryColor.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Main theme color for buttons and accents</p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="secondaryColor">Secondary Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id="secondaryColor"
                          type="color"
                          {...form.register("secondaryColor")}
                          className="w-20 h-10"
                          data-testid="input-secondary-color"
                        />
                        <Input
                          type="text"
                          {...form.register("secondaryColor")}
                          placeholder="#2c3e50"
                          className="flex-1"
                          data-testid="input-secondary-color-text"
                        />
                      </div>
                      {form.formState.errors.secondaryColor && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.secondaryColor.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Supporting color for headers and navigation</p>
                    </div>

                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Need more advanced branding options?{" "}
                        <button
                          type="button"
                          className="text-primary hover:underline font-medium"
                          onClick={() => navigate("/admin/branding")}
                          data-testid="link-branding-page"
                        >
                          Visit the Branding page
                        </button>
                        {" "}for full customization.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="business" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Business Settings</CardTitle>
                    <CardDescription>
                      Configure your store's operational settings
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="businessHoursOpen">Opening Time</Label>
                        <Input
                          id="businessHoursOpen"
                          type="time"
                          {...form.register("businessHoursOpen")}
                          data-testid="input-opening-time"
                        />
                        <p className="text-xs text-muted-foreground">When your store opens</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="businessHoursClose">Closing Time</Label>
                        <Input
                          id="businessHoursClose"
                          type="time"
                          {...form.register("businessHoursClose")}
                          data-testid="input-closing-time"
                        />
                        <p className="text-xs text-muted-foreground">When your store closes</p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="contactAddress">Store Location / Address</Label>
                      <Input
                        id="contactAddress"
                        {...form.register("contactAddress")}
                        placeholder="123 Main Street, City, Country"
                        data-testid="input-store-address"
                      />
                      {form.formState.errors.contactAddress && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.contactAddress.message}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">Physical location of your store</p>
                    </div>

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <Label htmlFor="shippingZonesEnabled">Delivery Zones</Label>
                        <p className="text-sm text-muted-foreground">
                          Enable delivery zone management
                        </p>
                      </div>
                      <Switch
                        id="shippingZonesEnabled"
                        checked={form.watch("shippingZonesEnabled")}
                        onCheckedChange={(checked) => form.setValue("shippingZonesEnabled", checked)}
                        data-testid="switch-shipping-zones"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="defaultCurrency">Default Currency</Label>
                      <Select
                        value={form.watch("defaultCurrency")}
                        onValueChange={(value) => form.setValue("defaultCurrency", value as "GHS")}
                      >
                        <SelectTrigger id="defaultCurrency" data-testid="select-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="GHS">GHS - Ghanaian Cedi</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Currency for pricing and transactions</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="mode" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Store Mode Configuration</CardTitle>
                    <CardDescription>
                      Choose between single-store or multi-vendor marketplace mode
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                      <div className="flex items-center gap-3 mb-2">
                        <Store className="h-5 w-5 text-primary" />
                        <h3 className="font-semibold text-lg">
                          Current Mode: {form.watch("isMultiVendor") ? "Multi-Vendor" : "Single Store"}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {form.watch("isMultiVendor") 
                          ? "Your platform is configured as a marketplace with multiple sellers"
                          : "Your platform operates as a single store"}
                      </p>
                    </div>

                    {showModeWarning && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                          <strong>Warning:</strong> Changing the store mode will affect how your platform operates. 
                          Make sure to review all implications before saving this change.
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1 flex-1">
                        <Label htmlFor="isMultiVendor">Enable Multi-Vendor Mode</Label>
                        <p className="text-sm text-muted-foreground">
                          Allow multiple sellers to create stores and list products on your platform
                        </p>
                      </div>
                      <Switch
                        id="isMultiVendor"
                        checked={form.watch("isMultiVendor")}
                        onCheckedChange={handleModeChange}
                        data-testid="switch-multi-vendor"
                      />
                    </div>

                    {form.watch("isMultiVendor") && (
                      <div className="p-4 border rounded-lg bg-card space-y-3">
                        <div className="space-y-1">
                          <Label htmlFor="shopDisplayMode">Shop By Mode</Label>
                          <p className="text-sm text-muted-foreground">
                            Choose how customers browse products in multi-vendor mode
                          </p>
                        </div>
                        <Select
                          value={form.watch("shopDisplayMode") || "by-store"}
                          onValueChange={(value) => form.setValue("shopDisplayMode", value as "by-store" | "by-category")}
                        >
                          <SelectTrigger id="shopDisplayMode" data-testid="select-shop-display-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="by-store">Shop by Stores</SelectItem>
                            <SelectItem value="by-category">Shop by Categories</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="p-3 bg-primary/5 rounded-md text-sm">
                          {form.watch("shopDisplayMode") === "by-store" ? (
                            <p className="text-muted-foreground">
                              <strong>Shop by Stores:</strong> Customers will see all stores with their names and logos. They can browse each store individually.
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              <strong>Shop by Categories:</strong> Customers will see product categories (electronics, fashion, etc.) from all stores combined.
                            </p>
                          )}
                        </div>
                      </div>
                    )}

                    {!form.watch("isMultiVendor") && (
                      <div className="p-4 border rounded-lg bg-card space-y-3">
                        <div className="space-y-1">
                          <Label htmlFor="primaryStoreId">Primary Store</Label>
                          <p className="text-sm text-muted-foreground">
                            Select which store's products to display on your single-store homepage
                          </p>
                        </div>
                        <Select
                          value={form.watch("primaryStoreId") || ""}
                          onValueChange={(value) => form.setValue("primaryStoreId", value)}
                        >
                          <SelectTrigger id="primaryStoreId" data-testid="select-primary-store">
                            <SelectValue placeholder="Select a store..." />
                          </SelectTrigger>
                          <SelectContent>
                            {stores.filter(s => s.isActive && s.isApproved).length === 0 ? (
                              <SelectItem value="none" disabled>No approved stores available</SelectItem>
                            ) : (
                              stores
                                .filter(s => s.isActive && s.isApproved)
                                .map((store) => (
                                  <SelectItem key={store.id} value={store.id}>
                                    {store.name}
                                  </SelectItem>
                                ))
                            )}
                          </SelectContent>
                        </Select>
                        {!form.watch("primaryStoreId") && stores.filter(s => s.isActive && s.isApproved).length > 0 && (
                          <p className="text-sm text-amber-600">
                            ⚠️ No primary store selected. All products from all stores will be shown until you select one.
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="border-2">
                        <CardHeader>
                          <CardTitle className="text-base">Single Store Mode</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <p className="text-muted-foreground">Best for:</p>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>Individual businesses</li>
                            <li>Brand-specific stores</li>
                            <li>Simpler inventory management</li>
                            <li>Direct customer relationships</li>
                          </ul>
                        </CardContent>
                      </Card>

                      <Card className="border-2">
                        <CardHeader>
                          <CardTitle className="text-base">Multi-Vendor Mode</CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          <p className="text-muted-foreground">Best for:</p>
                          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                            <li>Marketplace platforms</li>
                            <li>Multiple seller support</li>
                            <li>Commission-based business</li>
                            <li>Wider product variety</li>
                          </ul>
                        </CardContent>
                      </Card>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 mt-6 sticky bottom-0 bg-background py-4 border-t">
              <Button
                type="submit"
                disabled={updateSettingsMutation.isPending}
                data-testid="button-save-settings"
                className="gap-2"
              >
                {updateSettingsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Settings
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
    </DashboardLayout>
  );
}
