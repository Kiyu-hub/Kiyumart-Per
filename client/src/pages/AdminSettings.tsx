import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Settings2, CreditCard, Mail, Palette, DollarSign, Image as ImageIcon, ArrowLeft, Cloud } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const settingsSchema = z.object({
  platformName: z.string().min(1, "Platform name is required"),
  isMultiVendor: z.boolean(),
  allowSellerRegistration: z.boolean(),
  allowRiderRegistration: z.boolean(),
  shopDisplayMode: z.enum(["by-store", "by-category"]).optional(),
  primaryStoreId: z.string().optional().nullable(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  defaultCurrency: z.string(),
  paystackPublicKey: z.string().optional(),
  paystackSecretKey: z.string().optional(),
  processingFeePercent: z.string().min(0),
  defaultCommissionRate: z.string().min(0).max(100),
  cloudinaryCloudName: z.string().optional(),
  cloudinaryApiKey: z.string().optional(),
  cloudinaryApiSecret: z.string().optional(),
  contactPhone: z.string().min(1, "Contact phone is required"),
  contactEmail: z.string().email("Must be a valid email"),
  contactAddress: z.string().min(1, "Contact address is required"),
  facebookUrl: z.string().url().optional().or(z.literal("")),
  instagramUrl: z.string().url().optional().or(z.literal("")),
  twitterUrl: z.string().url().optional().or(z.literal("")),
  showFacebook: z.boolean(),
  showInstagram: z.boolean(),
  showTwitter: z.boolean(),
  showLinkedin: z.boolean(),
  showYoutube: z.boolean(),
  showTiktok: z.boolean(),
  showPinterest: z.boolean(),
  showWhatsapp: z.boolean(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  youtubeUrl: z.string().url().optional().or(z.literal("")),
  tiktokUrl: z.string().url().optional().or(z.literal("")),
  pinterestUrl: z.string().url().optional().or(z.literal("")),
  whatsappPage: z.string().optional().or(z.literal("")),

  showSocialLinks: z.boolean(),
  footerDescription: z.string().min(1, "Footer description is required"),
  adsEnabled: z.boolean(),
  heroBannerAdImage: z.string().url().optional().or(z.literal("")),
  heroBannerAdUrl: z.string().url().optional().or(z.literal("")),
  sidebarAdImage: z.string().url().optional().or(z.literal("")),
  sidebarAdUrl: z.string().url().optional().or(z.literal("")),
  footerAdImage: z.string().url().optional().or(z.literal("")),
  footerAdUrl: z.string().url().optional().or(z.literal("")),
  productPageAdImage: z.string().url().optional().or(z.literal("")),
  productPageAdUrl: z.string().url().optional().or(z.literal("")),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

interface PlatformSettings extends SettingsFormData {
  id: string;
  logo?: string;
  onboardingImages?: string[];
  updatedAt: string;
  paystackPublicKeySource?: string;
  paystackSecretKeySource?: string;
  cloudinaryApiKeySource?: string;
  cloudinaryApiSecretSource?: string;
}

export default function AdminSettings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");
  const [clearedSocialKeys, setClearedSocialKeys] = useState<string[]>([]);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Import dialogs state
  const [showImportPaystackDialog, setShowImportPaystackDialog] = useState(false);
  const [isImportingPaystack, setIsImportingPaystack] = useState(false);
  const [showImportCloudinaryDialog, setShowImportCloudinaryDialog] = useState(false);
  const [isImportingCloudinary, setIsImportingCloudinary] = useState(false);

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: stores = [] } = useQuery<Array<{id: string; name: string; isActive: boolean}>>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
      return res.json();
    },
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    values: settings ? {
      platformName: settings.platformName,
      isMultiVendor: settings.isMultiVendor,
      allowSellerRegistration: (settings as any).allowSellerRegistration || false,
      allowRiderRegistration: (settings as any).allowRiderRegistration || false,
      shopDisplayMode: (settings as any).shopDisplayMode || "by-store",
      primaryStoreId: (settings as any).primaryStoreId || null,
      primaryColor: settings.primaryColor,
      defaultCurrency: settings.defaultCurrency,
      paystackPublicKey: settings.paystackPublicKey || "",
      paystackSecretKey: settings.paystackSecretKey || "",
      processingFeePercent: settings.processingFeePercent,
      defaultCommissionRate: (settings as any).defaultCommissionRate || "1",
      cloudinaryCloudName: (settings as any).cloudinaryCloudName || "",
      cloudinaryApiKey: (settings as any).cloudinaryApiKey || "",
      cloudinaryApiSecret: (settings as any).cloudinaryApiSecret || "",
      contactPhone: settings.contactPhone,
      contactEmail: settings.contactEmail,
      contactAddress: settings.contactAddress,
      facebookUrl: settings.facebookUrl || "",
      instagramUrl: settings.instagramUrl || "",
      twitterUrl: settings.twitterUrl || "",
      showFacebook: (settings as any).showFacebook ?? true,
      showInstagram: (settings as any).showInstagram ?? true,
      showTwitter: (settings as any).showTwitter ?? true,
      showLinkedin: (settings as any).showLinkedin ?? true,
      showYoutube: (settings as any).showYoutube ?? true,
      showTiktok: (settings as any).showTiktok ?? true,
      showPinterest: (settings as any).showPinterest ?? true,
      showWhatsapp: (settings as any).showWhatsapp ?? true,
      footerDescription: settings.footerDescription,
      adsEnabled: settings.adsEnabled || false,
      heroBannerAdImage: settings.heroBannerAdImage || "",
      heroBannerAdUrl: settings.heroBannerAdUrl || "",
      sidebarAdImage: settings.sidebarAdImage || "",
      sidebarAdUrl: settings.sidebarAdUrl || "",
      footerAdImage: settings.footerAdImage || "",
      footerAdUrl: settings.footerAdUrl || "",
      productPageAdImage: settings.productPageAdImage || "",
      productPageAdUrl: settings.productPageAdUrl || "",
      linkedinUrl: (settings as any).linkedinUrl || "",
      youtubeUrl: (settings as any).youtubeUrl || "",
      tiktokUrl: (settings as any).tiktokUrl || "",
      pinterestUrl: (settings as any).pinterestUrl || "",
      whatsappPage: (settings as any).whatsappPage || "",
      showSocialLinks: (settings as any).showSocialLinks ?? true,
    } : undefined,
  });

  const updateSettingsMutation = useMutation({
    mutationFn: async (data: SettingsFormData) => {
      // Include the list of social keys that should be cleared
      const payload = {
        ...data,
        _clearSocialKeys: clearedSocialKeys
      };
      const res = await apiRequest("PATCH", "/api/settings", payload);
      return res.json();
    },
    // Optimistic update to ensure UI shows changes immediately
    onMutate: async (newData: SettingsFormData) => {
      await queryClient.cancelQueries({ queryKey: ["/api/settings"] });
      const previous = queryClient.getQueryData<any>(["/api/settings"]);
      queryClient.setQueryData(["/api/settings"], (old: any) => ({ ...old, ...newData, updatedAt: new Date().toISOString() }));
      return { previous };
    },
    onError: (err: any, _newData, context: any) => {
      // rollback
      if (context?.previous) {
        queryClient.setQueryData(["/api/settings"], context.previous);
      }
      // Reset cleared keys on error
      setClearedSocialKeys([]);
      toast({ title: "Update failed", description: err.message || "Failed to update settings", variant: "destructive" });
    },
    onSuccess: async (data) => {
      // Replace cache with authoritative server response and refetch other keys
      queryClient.setQueryData(["/api/settings"], data);
      await queryClient.invalidateQueries({ queryKey: ["/api/settings", user?.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
      await queryClient.refetchQueries({ queryKey: ["/api/settings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });

      // Reset cleared keys after successful update
      setClearedSocialKeys([]);

      // Reset form with server response
      form.reset({
        platformName: data.platformName,
        isMultiVendor: data.isMultiVendor,
        allowSellerRegistration: data.allowSellerRegistration || false,
        allowRiderRegistration: data.allowRiderRegistration || false,
        shopDisplayMode: data.shopDisplayMode || "by-store",
        primaryStoreId: data.primaryStoreId || null,
        primaryColor: data.primaryColor,
        defaultCurrency: data.defaultCurrency,
        paystackPublicKey: data.paystackPublicKey || "",
        paystackSecretKey: data.paystackSecretKey || "",
        processingFeePercent: data.processingFeePercent,
        defaultCommissionRate: data.defaultCommissionRate || "1",
        cloudinaryCloudName: data.cloudinaryCloudName || "",
        cloudinaryApiKey: data.cloudinaryApiKey || "",
        cloudinaryApiSecret: data.cloudinaryApiSecret || "",
        contactPhone: data.contactPhone,
        contactEmail: data.contactEmail,
        contactAddress: data.contactAddress,
        facebookUrl: data.facebookUrl || "",
        instagramUrl: data.instagramUrl || "",
        twitterUrl: data.twitterUrl || "",
        showFacebook: data.showFacebook ?? true,
        showInstagram: data.showInstagram ?? true,
        showTwitter: data.showTwitter ?? true,
        showLinkedin: data.showLinkedin ?? true,
        showYoutube: data.showYoutube ?? true,
        showTiktok: data.showTiktok ?? true,
        showPinterest: data.showPinterest ?? true,
        showWhatsapp: data.showWhatsapp ?? true,
        linkedinUrl: data.linkedinUrl || "",
        youtubeUrl: data.youtubeUrl || "",
        tiktokUrl: data.tiktokUrl || "",
        pinterestUrl: data.pinterestUrl || "",
        whatsappPage: data.whatsappPage || "",
        showSocialLinks: data.showSocialLinks ?? true,
        footerDescription: data.footerDescription,
        adsEnabled: data.adsEnabled || false,
        heroBannerAdImage: data.heroBannerAdImage || "",
        heroBannerAdUrl: data.heroBannerAdUrl || "",
        sidebarAdImage: data.sidebarAdImage || "",
        sidebarAdUrl: data.sidebarAdUrl || "",
        footerAdImage: data.footerAdImage || "",
        footerAdUrl: data.footerAdUrl || "",
        productPageAdImage: data.productPageAdImage || "",
        productPageAdUrl: data.productPageAdUrl || "",
      });

      toast({
        title: "Settings updated",
        description: "Platform settings have been saved successfully. Branding colors updated!",
      });
    },
  });

  const onSubmit = (data: SettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  // Keep form in sync when settings change externally
  useEffect(() => {
    if (settings) {
      form.reset({
        platformName: settings.platformName,
        isMultiVendor: settings.isMultiVendor,
        allowSellerRegistration: (settings as any).allowSellerRegistration || false,
        allowRiderRegistration: (settings as any).allowRiderRegistration || false,
        shopDisplayMode: (settings as any).shopDisplayMode || "by-store",
        primaryStoreId: (settings as any).primaryStoreId || null,
        primaryColor: settings.primaryColor,
        defaultCurrency: settings.defaultCurrency,
        paystackPublicKey: settings.paystackPublicKey || "",
        paystackSecretKey: settings.paystackSecretKey || "",
        processingFeePercent: settings.processingFeePercent,
        defaultCommissionRate: (settings as any).defaultCommissionRate || "1",
        cloudinaryCloudName: (settings as any).cloudinaryCloudName || "",
        cloudinaryApiKey: (settings as any).cloudinaryApiKey || "",
        cloudinaryApiSecret: (settings as any).cloudinaryApiSecret || "",
        contactPhone: settings.contactPhone,
        contactEmail: settings.contactEmail,
        contactAddress: settings.contactAddress,
        facebookUrl: settings.facebookUrl || "",
        instagramUrl: settings.instagramUrl || "",
        twitterUrl: settings.twitterUrl || "",
          showFacebook: (settings as any).showFacebook ?? true,
          showInstagram: (settings as any).showInstagram ?? true,
          showTwitter: (settings as any).showTwitter ?? true,
          showLinkedin: (settings as any).showLinkedin ?? true,
          showYoutube: (settings as any).showYoutube ?? true,
          showTiktok: (settings as any).showTiktok ?? true,
          showPinterest: (settings as any).showPinterest ?? true,
          showWhatsapp: (settings as any).showWhatsapp ?? true,
          linkedinUrl: (settings as any).linkedinUrl || "",
          youtubeUrl: (settings as any).youtubeUrl || "",
          tiktokUrl: (settings as any).tiktokUrl || "",
          pinterestUrl: (settings as any).pinterestUrl || "",
          whatsappPage: (settings as any).whatsappPage || "",
          showSocialLinks: (settings as any).showSocialLinks ?? true,
        footerDescription: settings.footerDescription,
        adsEnabled: settings.adsEnabled || false,
        heroBannerAdImage: settings.heroBannerAdImage || "",
        heroBannerAdUrl: settings.heroBannerAdUrl || "",
        sidebarAdImage: settings.sidebarAdImage || "",
        sidebarAdUrl: settings.sidebarAdUrl || "",
        footerAdImage: settings.footerAdImage || "",
        footerAdUrl: settings.footerAdUrl || "",
        productPageAdImage: settings.productPageAdImage || "",
        productPageAdUrl: settings.productPageAdUrl || "",
      });
    }
  }, [settings]);

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
                <Settings2 className="h-8 w-8" />
                Platform Settings
              </h1>
              <p className="text-muted-foreground mt-1">Configure your platform's core settings and preferences</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-7 mb-6">
              <TabsTrigger value="general" data-testid="tab-general">
                <Settings2 className="h-4 w-4 mr-2" />
                General
              </TabsTrigger>
              <TabsTrigger value="payments" data-testid="tab-payments">
                <CreditCard className="h-4 w-4 mr-2" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="storage" data-testid="tab-storage">
                <Cloud className="h-4 w-4 mr-2" />
                Storage
              </TabsTrigger>
              <TabsTrigger value="contact" data-testid="tab-contact">
                <Mail className="h-4 w-4 mr-2" />
                Contact
              </TabsTrigger>
              <TabsTrigger value="branding" data-testid="tab-branding">
                <Palette className="h-4 w-4 mr-2" />
                Branding
              </TabsTrigger>
              <TabsTrigger value="currency" data-testid="tab-currency">
                <DollarSign className="h-4 w-4 mr-2" />
                Currency
              </TabsTrigger>
              <TabsTrigger value="ads" data-testid="tab-ads">
                <ImageIcon className="h-4 w-4 mr-2" />
                Ads
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>General Settings</CardTitle>
                  <CardDescription>
                    Configure your platform's basic information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="platformName">Platform Name</Label>
                    <Input
                      id="platformName"
                      {...form.register("platformName")}
                      placeholder="KiyuMart"
                      data-testid="input-platform-name"
                    />
                    {form.formState.errors.platformName && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.platformName.message}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="isMultiVendor">Multi-Vendor Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Enable multiple sellers to list products on your platform
                      </p>
                    </div>
                    <Switch
                      id="isMultiVendor"
                      checked={form.watch("isMultiVendor")}
                      onCheckedChange={(checked) => form.setValue("isMultiVendor", checked)}
                      data-testid="switch-multi-vendor"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="allowSellerRegistration">Allow Seller Registration</Label>
                      <p className="text-sm text-muted-foreground">
                        Show "Become a Seller" button on toolbar to allow new seller applications
                      </p>
                    </div>
                    <Switch
                      id="allowSellerRegistration"
                      checked={form.watch("allowSellerRegistration")}
                      onCheckedChange={(checked) => form.setValue("allowSellerRegistration", checked)}
                      data-testid="switch-allow-seller-registration"
                    />
                  </div>

                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="allowRiderRegistration">Allow Delivery Partner Registration</Label>
                      <p className="text-sm text-muted-foreground">
                        Show "Become a Delivery Partner" button on toolbar to allow new delivery partner applications
                      </p>
                    </div>
                    <Switch
                      id="allowRiderRegistration"
                      checked={form.watch("allowRiderRegistration")}
                      onCheckedChange={(checked) => form.setValue("allowRiderRegistration", checked)}
                      data-testid="switch-allow-rider-registration"
                    />
                  </div>

                  {form.watch("isMultiVendor") && (
                    <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                      <div className="space-y-2">
                        <Label>Multi-Vendor Features</Label>
                        <p className="text-sm text-muted-foreground mb-3">
                          Manage marketplace banners, collections, and homepage layout
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => navigate("/admin/banners")}
                          data-testid="button-banner-manager"
                        >
                          <ImageIcon className="w-4 h-4 mr-2" />
                          Manage Banners
                        </Button>
                      </div>
                      
                      <div className="space-y-2 pt-2 border-t">
                        <Label htmlFor="shopDisplayMode">Homepage Display Mode</Label>
                        <Select
                          value={form.watch("shopDisplayMode")}
                          onValueChange={(value) => form.setValue("shopDisplayMode", value as "by-store" | "by-category")}
                        >
                          <SelectTrigger id="shopDisplayMode" data-testid="select-shop-display-mode">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="by-store">Shop by Store</SelectItem>
                            <SelectItem value="by-category">Shop by Categories</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Choose how products are displayed on the multi-vendor homepage
                        </p>
                      </div>
                    </div>
                  )}

                  {!form.watch("isMultiVendor") && (
                    <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="primaryStoreId">Primary Store (Single-Store Mode)</Label>
                        <Select
                          value={form.watch("primaryStoreId") || "none"}
                          onValueChange={(value) => form.setValue("primaryStoreId", value === "none" ? null : value)}
                        >
                          <SelectTrigger id="primaryStoreId" data-testid="select-primary-store">
                            <SelectValue placeholder="Select a store" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No primary store</SelectItem>
                            {stores.filter(s => s.isActive).map((store) => (
                              <SelectItem key={store.id} value={store.id}>
                                {store.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Select the store to display in single-store mode. Only one store can be primary. Leave empty to show the first active store.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" className="h-6 w-auto" aria-hidden>
                      <rect width="200" height="40" rx="6" fill="#00b14f" />
                      <text x="100" y="26" fill="#fff" fontFamily="Inter, Arial, sans-serif" fontWeight="700" fontSize="18" textAnchor="middle">Paystack</text>
                    </svg>
                    <CardTitle>Paystack Integration</CardTitle>
                  </div>
                  <CardDescription>
                    Configure your Paystack payment gateway credentials. Use "Import from Environment" to copy runtime keys into Platform Settings (they will be masked).
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">Paystack Configuration</h4>
                              <p className="text-sm text-blue-700 dark:text-blue-300">
                                Paystack handles payments (cards, bank transfers). You can set Paystack keys here or via environment variables. Environment variables are recommended for production, but credentials set here will be stored and manageable from the dashboard. Use "Import from Environment" to copy runtime values into the dashboard (they will be masked).
                              </p>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-2">Source: <span className="font-medium">{settings?.paystackPublicKeySource || 'none'}</span></div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setShowImportPaystackDialog(true)}
                                data-testid="button-import-paystack"
                              >
                                Import from Environment
                              </Button>

                              <AlertDialog open={showImportPaystackDialog} onOpenChange={setShowImportPaystackDialog}>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Import Paystack Secrets?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Import Paystack secrets from environment into the database. This will store the secrets in the DB (they will be masked in the UI). Proceed only if you trust the environment values.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel onClick={() => setShowImportPaystackDialog(false)}>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={async () => {
                                        try {
                                          setIsImportingPaystack(true);
                                          const res = await apiRequest("POST", "/api/settings/import-paystack", {});
                                          await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                                          await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
                                          toast({ title: "Imported", description: "Paystack environment secrets have been imported into Platform Settings." });
                                          setShowImportPaystackDialog(false);
                                        } catch (e: any) {
                                          toast({ title: "Import failed", description: e.message || "Failed to import Paystack secrets", variant: "destructive" });
                                        } finally {
                                          setIsImportingPaystack(false);
                                        }
                                      }}
                                      disabled={isImportingPaystack}
                                    >
                                      {isImportingPaystack ? "Importing..." : "Import"}
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <Label htmlFor="paystackPublicKey">Paystack Public Key</Label>
                        <p className="text-xs text-muted-foreground">Your Paystack public key (starts with pk_test_ or pk_live_)</p>
                      </div>
                      <div className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.paystackPublicKeySource || 'none'}</span></div>
                    </div>
                    <Input
                      id="paystackPublicKey"
                      {...form.register("paystackPublicKey")}
                      placeholder="pk_test_xxxxxxxxxxxxxxxx"
                      data-testid="input-paystack-public"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Label htmlFor="paystackSecretKey">Paystack Secret Key</Label>
                        <p className="text-xs text-muted-foreground">
                          Your Paystack secret key (starts with sk_test_ or sk_live_). You can set it here or via environment variables. Environment variables are recommended for production, but credentials set here will be stored and manageable from the dashboard.
                        </p>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground mb-2">Source: <span className="font-medium">{settings?.paystackSecretKeySource || 'none'}</span></div>
                      </div>
                    </div>
                    <Input
                      id="paystackSecretKey"
                      type="password"
                      {...form.register("paystackSecretKey")}
                      placeholder="sk_test_xxxxxxxxxxxxxxxx"
                      data-testid="input-paystack-secret"
                    />
                    {form.formState.errors.paystackSecretKey && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.paystackSecretKey.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="processingFeePercent">Processing Fee (%)</Label>
                    <Input
                      id="processingFeePercent"
                      type="number"
                      step="0.01"
                      {...form.register("processingFeePercent")}
                      placeholder="1.95"
                      data-testid="input-processing-fee"
                    />
                    <p className="text-xs text-muted-foreground">
                      Percentage fee charged per transaction
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="defaultCommissionRate">Default Commission Rate (%)</Label>
                    <Input
                      id="defaultCommissionRate"
                      type="number"
                      step="0.01"
                      {...form.register("defaultCommissionRate")}
                      placeholder="0.00"
                      data-testid="input-commission-rate"
                    />
                    <p className="text-xs text-muted-foreground">
                      Platform commission charged on each sale (used for multi-vendor payment splits)
                    </p>
                  </div>

                  
                </CardContent>
              </Card>

            </TabsContent>

            <TabsContent value="storage" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Cloudinary Storage</CardTitle>
                  <CardDescription>
                    Configure Cloudinary for media uploads and storage
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                      <ImageIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                              Cloudinary Configuration
                            </h4>
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              You can set Cloudinary credentials here or via environment variables. Environment variables are recommended for production, but credentials set here will be stored and manageable from the dashboard. Use "Import from Environment" to copy any runtime values into the dashboard (they will be masked).
                            </p>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground mb-2">Source: <span className="font-medium">{settings?.cloudinaryApiKeySource || 'none'}</span></div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowImportCloudinaryDialog(true)}
                              data-testid="button-import-cloudinary"
                            >
                              Import from Environment
                            </Button>

                            <AlertDialog open={showImportCloudinaryDialog} onOpenChange={setShowImportCloudinaryDialog}>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Import Cloudinary Secrets?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Import Cloudinary secrets from environment into the database. This will store the secrets in the DB (they will be masked in the UI). Proceed only if you trust the environment values.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setShowImportCloudinaryDialog(false)}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={async () => {
                                      try {
                                        setIsImportingCloudinary(true);
                                        const res = await apiRequest("POST", "/api/settings/import-cloudinary", {});
                                        await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                                        await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
                                        toast({ title: "Imported", description: "Cloudinary environment secrets have been imported into Platform Settings." });
                                        setShowImportCloudinaryDialog(false);
                                      } catch (e: any) {
                                        toast({ title: "Import failed", description: e.message || "Failed to import Cloudinary secrets", variant: "destructive" });
                                      } finally {
                                        setIsImportingCloudinary(false);
                                      }
                                    }}
                                    disabled={isImportingCloudinary}
                                  >
                                    {isImportingCloudinary ? "Importing..." : "Import"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cloudinaryCloudName">Cloud Name</Label>
                    <Input
                      id="cloudinaryCloudName"
                      {...form.register("cloudinaryCloudName")}
                      placeholder="your-cloud-name"
                      data-testid="input-cloudinary-cloud-name"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your Cloudinary cloud name (found in your Cloudinary dashboard)
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cloudinaryApiKey">API Key</Label>
                    <Input
                      id="cloudinaryApiKey"
                      {...form.register("cloudinaryApiKey")}
                      placeholder="123456789012345"
                      data-testid="input-cloudinary-api-key"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Source: <span className="font-medium">{settings?.cloudinaryApiKeySource || 'none'}</span></p>
                    <p className="text-xs text-muted-foreground">
                      Your Cloudinary API key
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="cloudinaryApiSecret">API Secret</Label>
                    <Input
                      id="cloudinaryApiSecret"
                      type="password"
                      {...form.register("cloudinaryApiSecret")}
                      placeholder="••••••••••••••••••••••••"
                      data-testid="input-cloudinary-api-secret"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Source: <span className="font-medium">{settings?.cloudinaryApiSecretSource || 'none'}</span></p>
                    <p className="text-xs text-muted-foreground">
                      Your Cloudinary API secret (keep this confidential)
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contact" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                  <CardDescription>
                    Update your platform's contact details displayed in the footer
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="contactPhone">Contact Phone</Label>
                    <Input
                      id="contactPhone"
                      {...form.register("contactPhone")}
                      placeholder="+233 XX XXX XXXX"
                      data-testid="input-contact-phone"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Contact Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      {...form.register("contactEmail")}
                      placeholder="support@kiyumart.com"
                      data-testid="input-contact-email"
                    />
                    {form.formState.errors.contactEmail && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.contactEmail.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactAddress">Contact Address</Label>
                    <Input
                      id="contactAddress"
                      {...form.register("contactAddress")}
                      placeholder="Accra, Ghana"
                      data-testid="input-contact-address"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="footerDescription">Footer Description</Label>
                    <Textarea
                      id="footerDescription"
                      {...form.register("footerDescription")}
                      placeholder="Your trusted fashion marketplace..."
                      rows={3}
                      data-testid="input-footer-description"
                    />
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-4">Social Media Links</h4>
                    
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="facebookUrl">Facebook URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="facebookUrl"
                            {...form.register("facebookUrl")}
                            placeholder="https://facebook.com/yourpage"
                            data-testid="input-facebook-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showFacebook"
                              checked={form.watch("showFacebook")}
                              onCheckedChange={(checked) => form.setValue("showFacebook", checked)}
                              data-testid="switch-show-facebook"
                            />
                            <button
                              type="button"
                              className="btn-ghost text-sm"
                              onClick={() => {
                                if (confirm('Clear Facebook URL from settings? This will remove it from the footer.')) {
                                  form.setValue('facebookUrl', '');
                                  setClearedSocialKeys([...clearedSocialKeys, 'facebookUrl']);
                                }
                              }}
                              data-testid="button-clear-facebook"
                            >
                              Clear
                            </button>
                          </div>
                        </div>
                        {form.formState.errors.facebookUrl && (
                          <p className="text-sm text-destructive">
                            {form.formState.errors.facebookUrl.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="instagramUrl">Instagram URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="instagramUrl"
                            {...form.register("instagramUrl")}
                            placeholder="https://instagram.com/yourpage"
                            data-testid="input-instagram-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showInstagram"
                              checked={form.watch("showInstagram")}
                              onCheckedChange={(checked) => form.setValue("showInstagram", checked)}
                              data-testid="switch-show-instagram"
                            />
                            <button
                              type="button"
                              className="btn-ghost text-sm"
                              onClick={() => {
                                if (confirm('Clear Instagram URL from settings?')) {
                                  form.setValue('instagramUrl', '');
                                  setClearedSocialKeys([...clearedSocialKeys, 'instagramUrl']);
                                }
                              }}
                              data-testid="button-clear-instagram"
                            >Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.instagramUrl && (
                          <p className="text-sm text-destructive">
                            {form.formState.errors.instagramUrl.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="twitterUrl">Twitter URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="twitterUrl"
                            {...form.register("twitterUrl")}
                            placeholder="https://twitter.com/yourpage"
                            data-testid="input-twitter-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showTwitter"
                              checked={form.watch("showTwitter")}
                              onCheckedChange={(checked) => form.setValue("showTwitter", checked)}
                              data-testid="switch-show-twitter"
                            />
                            <button type="button" className="btn-ghost text-sm" onClick={() => { if (confirm('Clear Twitter URL from settings?')) { form.setValue('twitterUrl', ''); setClearedSocialKeys([...clearedSocialKeys, 'twitterUrl']); } }} data-testid="button-clear-twitter">Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.twitterUrl && (
                          <p className="text-sm text-destructive">
                            {form.formState.errors.twitterUrl.message}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="linkedinUrl">LinkedIn URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="linkedinUrl"
                            {...form.register("linkedinUrl")}
                            placeholder="https://linkedin.com/company/yourpage"
                            data-testid="input-linkedin-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showLinkedin"
                              checked={form.watch("showLinkedin")}
                              onCheckedChange={(checked) => form.setValue("showLinkedin", checked)}
                              data-testid="switch-show-linkedin"
                            />
                            <button type="button" className="btn-ghost text-sm" onClick={() => { if (confirm('Clear LinkedIn URL from settings?')) { form.setValue('linkedinUrl', ''); setClearedSocialKeys([...clearedSocialKeys, 'linkedinUrl']); } }} data-testid="button-clear-linkedin">Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.linkedinUrl && (
                          <p className="text-sm text-destructive">{form.formState.errors.linkedinUrl.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="youtubeUrl">YouTube URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="youtubeUrl"
                            {...form.register("youtubeUrl")}
                            placeholder="https://youtube.com/channel/yourchannel"
                            data-testid="input-youtube-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showYoutube"
                              checked={form.watch("showYoutube")}
                              onCheckedChange={(checked) => form.setValue("showYoutube", checked)}
                              data-testid="switch-show-youtube"
                            />
                            <button type="button" className="btn-ghost text-sm" onClick={() => { if (confirm('Clear YouTube URL from settings?')) { form.setValue('youtubeUrl', ''); setClearedSocialKeys([...clearedSocialKeys, 'youtubeUrl']); } }} data-testid="button-clear-youtube">Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.youtubeUrl && (
                          <p className="text-sm text-destructive">{form.formState.errors.youtubeUrl.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tiktokUrl">TikTok URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="tiktokUrl"
                            {...form.register("tiktokUrl")}
                            placeholder="https://tiktok.com/@yourpage"
                            data-testid="input-tiktok-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showTiktok"
                              checked={form.watch("showTiktok")}
                              onCheckedChange={(checked) => form.setValue("showTiktok", checked)}
                              data-testid="switch-show-tiktok"
                            />
                            <button type="button" className="btn-ghost text-sm" onClick={() => { if (confirm('Clear TikTok URL from settings?')) { form.setValue('tiktokUrl', ''); setClearedSocialKeys([...clearedSocialKeys, 'tiktokUrl']); } }} data-testid="button-clear-tiktok">Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.tiktokUrl && (
                          <p className="text-sm text-destructive">{form.formState.errors.tiktokUrl.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="pinterestUrl">Pinterest URL</Label>
                        <div className="flex gap-2">
                          <Input
                            id="pinterestUrl"
                            {...form.register("pinterestUrl")}
                            placeholder="https://pinterest.com/yourpage"
                            data-testid="input-pinterest-url"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showPinterest"
                              checked={form.watch("showPinterest")}
                              onCheckedChange={(checked) => form.setValue("showPinterest", checked)}
                              data-testid="switch-show-pinterest"
                            />
                            <button type="button" className="btn-ghost text-sm" onClick={() => { if (confirm('Clear Pinterest URL from settings?')) { form.setValue('pinterestUrl', ''); setClearedSocialKeys([...clearedSocialKeys, 'pinterestUrl']); } }} data-testid="button-clear-pinterest">Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.pinterestUrl && (
                          <p className="text-sm text-destructive">{form.formState.errors.pinterestUrl.message}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="whatsappPage">WhatsApp Page</Label>
                        <div className="flex gap-2">
                          <Input
                            id="whatsappPage"
                            {...form.register("whatsappPage")}
                            placeholder="https://wa.me/yourphonenumber or https://your.whatsapp.page"
                            data-testid="input-whatsapp-page"
                          />
                          <div className="flex items-center gap-2">
                            <Switch
                              id="showWhatsapp"
                              checked={form.watch("showWhatsapp")}
                              onCheckedChange={(checked) => form.setValue("showWhatsapp", checked)}
                              data-testid="switch-show-whatsapp"
                            />
                            <button type="button" className="btn-ghost text-sm" onClick={() => { if (confirm('Clear WhatsApp link from settings?')) { form.setValue('whatsappPage', ''); setClearedSocialKeys([...clearedSocialKeys, 'whatsappPage']); } }} data-testid="button-clear-whatsapp">Clear</button>
                          </div>
                        </div>
                        {form.formState.errors.whatsappPage && (
                          <p className="text-sm text-destructive">{form.formState.errors.whatsappPage.message}</p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div>
                          <Label htmlFor="showSocialLinks">Show Social Links</Label>
                          <p className="text-xs text-muted-foreground">Toggle visibility of social links in the footer</p>
                        </div>
                        <Switch
                          id="showSocialLinks"
                          checked={form.watch("showSocialLinks")}
                          onCheckedChange={(checked) => form.setValue("showSocialLinks", checked)}
                          data-testid="switch-show-social-links"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="branding" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Branding & Appearance</CardTitle>
                  <CardDescription>
                    Customize your platform's visual identity
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="primaryColor">Primary Color</Label>
                    <div className="flex gap-2">
                      <Input
                        id="primaryColor"
                        {...form.register("primaryColor")}
                        placeholder="#1e7b5f"
                        data-testid="input-primary-color"
                        className="flex-1"
                      />
                      <div 
                        className="w-12 h-10 rounded border"
                        style={{ backgroundColor: form.watch("primaryColor") }}
                      />
                    </div>
                    {form.formState.errors.primaryColor && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.primaryColor.message}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Hex color code for your brand's primary color
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="currency" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Currency Settings</CardTitle>
                  <CardDescription>
                    Configure your platform's default currency
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="defaultCurrency">Default Currency</Label>
                    <Select
                      value={form.watch("defaultCurrency")}
                      onValueChange={(value) => form.setValue("defaultCurrency", value)}
                    >
                      <SelectTrigger data-testid="select-default-currency">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GHS - Ghanaian Cedi</SelectItem>
                        <SelectItem value="NGN">NGN - Nigerian Naira</SelectItem>
                        <SelectItem value="XOF">XOF - West African CFA Franc</SelectItem>
                        <SelectItem value="USD">USD - US Dollar</SelectItem>
                        <SelectItem value="EUR">EUR - Euro</SelectItem>
                        <SelectItem value="SAR">SAR - Saudi Riyal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ads" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Advertisement Settings</CardTitle>
                  <CardDescription>
                    Control advertisement display and manage ad placements to monetize your platform
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/50">
                    <div className="space-y-1">
                      <Label htmlFor="adsEnabled" className="text-base font-semibold">Enable Advertisements</Label>
                      <p className="text-sm text-muted-foreground">
                        Display ads across your platform to generate revenue
                      </p>
                    </div>
                    <Switch
                      id="adsEnabled"
                      checked={form.watch("adsEnabled")}
                      onCheckedChange={(checked) => form.setValue("adsEnabled", checked)}
                      data-testid="switch-ads-enabled"
                    />
                  </div>

                  {form.watch("adsEnabled") && (
                    <div className="space-y-6 pt-4">
                      <div className="space-y-4 p-4 border rounded-lg">
                        <h4 className="font-semibold flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Hero Banner Ad
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Display an advertisement banner prominently on the homepage hero section
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="heroBannerAdImage">Image URL</Label>
                          <Input
                            id="heroBannerAdImage"
                            {...form.register("heroBannerAdImage")}
                            placeholder="https://example.com/ad-banner.jpg"
                            data-testid="input-hero-ad-image"
                          />
                          <p className="text-xs text-muted-foreground">
                            Recommended size: 1200x400px
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="heroBannerAdUrl">Link URL (Optional)</Label>
                          <Input
                            id="heroBannerAdUrl"
                            {...form.register("heroBannerAdUrl")}
                            placeholder="https://example.com"
                            data-testid="input-hero-ad-url"
                          />
                        </div>
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <h4 className="font-semibold flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Sidebar Ad
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Display an advertisement in the sidebar on product listing pages
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="sidebarAdImage">Image URL</Label>
                          <Input
                            id="sidebarAdImage"
                            {...form.register("sidebarAdImage")}
                            placeholder="https://example.com/sidebar-ad.jpg"
                            data-testid="input-sidebar-ad-image"
                          />
                          <p className="text-xs text-muted-foreground">
                            Recommended size: 300x600px
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="sidebarAdUrl">Link URL (Optional)</Label>
                          <Input
                            id="sidebarAdUrl"
                            {...form.register("sidebarAdUrl")}
                            placeholder="https://example.com"
                            data-testid="input-sidebar-ad-url"
                          />
                        </div>
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <h4 className="font-semibold flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Product Page Ad
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Display an advertisement below product details on individual product pages
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="productPageAdImage">Image URL</Label>
                          <Input
                            id="productPageAdImage"
                            {...form.register("productPageAdImage")}
                            placeholder="https://example.com/product-ad.jpg"
                            data-testid="input-product-ad-image"
                          />
                          <p className="text-xs text-muted-foreground">
                            Recommended size: 728x90px
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="productPageAdUrl">Link URL (Optional)</Label>
                          <Input
                            id="productPageAdUrl"
                            {...form.register("productPageAdUrl")}
                            placeholder="https://example.com"
                            data-testid="input-product-ad-url"
                          />
                        </div>
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <h4 className="font-semibold flex items-center gap-2">
                          <ImageIcon className="h-4 w-4" />
                          Footer Ad
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Display an advertisement in the footer section across all pages
                        </p>
                        <div className="space-y-2">
                          <Label htmlFor="footerAdImage">Image URL</Label>
                          <Input
                            id="footerAdImage"
                            {...form.register("footerAdImage")}
                            placeholder="https://example.com/footer-ad.jpg"
                            data-testid="input-footer-ad-image"
                          />
                          <p className="text-xs text-muted-foreground">
                            Recommended size: 1200x150px
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="footerAdUrl">Link URL (Optional)</Label>
                          <Input
                            id="footerAdUrl"
                            {...form.register("footerAdUrl")}
                            placeholder="https://example.com"
                            data-testid="input-footer-ad-url"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-4 mt-6">
            <Button
              type="submit"
              disabled={updateSettingsMutation.isPending}
              data-testid="button-save-settings"
            >
              {updateSettingsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
          </form>
        </div>
    </DashboardLayout>
  );
}
