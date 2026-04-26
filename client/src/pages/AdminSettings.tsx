import { useState, useEffect, type ReactNode } from "react";
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
import { Loader2, Save, Settings2, CreditCard, Mail, Palette, DollarSign, Image as ImageIcon, ArrowLeft, Cloud, Trash2, Pencil, Plus, Eye, ArrowRightLeft, Store, Layers, EyeOff, Edit, Globe, LayoutGrid, Activity,
  Truck, ShieldCheck, Clock, Heart, Star, Award, Gift, Shield, Lock, Headphones, Phone, MapPin, Package, Percent, ThumbsUp, CheckCircle, Users, Flame, Gem, Crown, BadgeCheck, Wallet, RefreshCcw, LifeBuoy, Rocket, Timer, Tag, ShoppingBag, ShoppingCart, Home, Search, Bell, MessageCircle, Wifi, Sun, Moon, BarChart, Key, Fingerprint, Globe2, Umbrella, Coffee, Music, Camera, Target, Compass, Anchor, Feather, Leaf, Droplets, Wind, Box, Database, HardDrive, BarChart2, Server, Zap, BookOpen, ExternalLink, Copy, ListChecks
} from "lucide-react";
import { insertFooterPageSchema, type FooterPage } from "@shared/schema";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
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

// Type definitions
interface FrontendUrlStatus {
  dbConfiguredUrl?: string | null;
  envConfiguredUrl?: string | null;
  configuredUrl: string;
  resolvedUrl: string;
  isHealthy: boolean;
  isFallingBack: boolean;
  fallbackUrl: string;
  cacheInfo: {
    message: string;
    ttl: string;
  };
}

const settingsSchema = z.object({
  platformName: z.string().min(1, "Platform name is required"),
  isMultiVendor: z.boolean(),
  allowSellerRegistration: z.boolean(),
  allowRiderRegistration: z.boolean(),
  allowSellerBankPayouts: z.boolean(),
  allowSharedVariantColorStock: z.boolean(),
  showHomepageFeaturedSection: z.boolean(),
  showHomepageNewArrivalSection: z.boolean(),
  isExternalRiderSystemEnabled: z.boolean(),
  showCheckoutDeliveryMap: z.boolean(),
  allowPickupAgentAdminChat: z.boolean(),
  allowSellerDirectSupportMessages: z.boolean(),
  shopDisplayMode: z.enum(["by-store", "by-category"]).optional(),
  showShopBySection: z.boolean().optional(),
  primaryStoreId: z.string().optional().nullable(),
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  defaultCurrency: z.string(),
  frontendUrl: z.string().url("Must be a valid URL").optional().or(z.literal("")).default(""),
  paystackPublicKey: z.string().optional(),
  paystackSecretKey: z.string().optional(),
  processingFeePercent: z.string().min(0),
  defaultCommissionRate: z.string().min(0).max(100),
  smtpHost: z.string().optional().or(z.literal("")),
  smtpPort: z.coerce.number().int().positive().optional(),
  smtpUser: z.string().optional().or(z.literal("")),
  smtpPass: z.string().optional().or(z.literal("")),
  smtpSecure: z.boolean().optional(),
  smtpFromEmail: z.string().email("Must be a valid email").optional().or(z.literal("")),
  smtpFromName: z.string().optional().or(z.literal("")),
  cloudinaryCloudName: z.string().optional(),
  cloudinaryApiKey: z.string().optional(),
  cloudinaryApiSecret: z.string().optional(),
  cloudinaryAccounts: z.string().optional(), // JSON array of extra accounts
  mapboxPublicToken: z.string().optional().or(z.literal("")),
  mapboxStyleUrl: z.string().optional().or(z.literal("")),
  mapboxGlVersion: z.string().optional().or(z.literal("")),
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
  heroBannerEnabled: z.boolean(),
  sidebarAdEnabled: z.boolean(),
  footerAdEnabled: z.boolean(),
  productPageAdEnabled: z.boolean(),
  // Ad image and link fields accept absolute URLs, protocol links (mailto:, tel:), or relative/anchor paths (e.g. /category/abayas, #section)
  heroBannerAdImage: z.string().optional().or(z.literal("")),
  heroBannerAdUrl: z.string().optional().or(z.literal("")),
  sidebarAdImage: z.string().optional().or(z.literal("")),
  sidebarAdUrl: z.string().optional().or(z.literal("")),
  footerAdImage: z.string().optional().or(z.literal("")),
  footerAdUrl: z.string().optional().or(z.literal("")),
  productPageAdImage: z.string().optional().or(z.literal("")),
  productPageAdUrl: z.string().optional().or(z.literal("")),
  // Analytics
  googleAnalyticsId: z.string().optional().or(z.literal("")),
  microsoftClarityId: z.string().optional().or(z.literal("")),
  sentryDsn: z.string().optional().or(z.literal("")),
  // GA4 Data API credentials
  ga4PropertyId: z.string().optional().or(z.literal("")),
  googleCredentialsJson: z.string().optional().or(z.literal("")),
  // Sentry REST API credentials
  sentryAuthToken: z.string().optional().or(z.literal("")),
  sentryOrg: z.string().optional().or(z.literal("")),
  sentryProject: z.string().optional().or(z.literal("")),
  // Hosting
  renderDeployHookUrl: z.string().optional().or(z.literal("")),
  // Operational limits
  inviteOnlyRegistration: z.boolean().optional(),
  orderAutoCancelHours: z.coerce.number().int().min(0).optional(),
  freeTierProductLimit: z.coerce.number().int().min(0).optional(),
  maxProductsPerSeller: z.coerce.number().int().min(0).optional(),
  // Seller upgrade plan pricing
  upgradePlanAPrice: z.coerce.number().min(0).optional(),
  upgradePlanASlots: z.coerce.number().int().min(1).optional(),
  upgradePlanBPrice: z.coerce.number().min(0).optional(),
  upgradePlanCPrice: z.coerce.number().min(0).optional(),
  // Delivery commission & referral
  deliveryFeeCommission: z.coerce.number().min(0).optional(),
  referralRewardPercent: z.coerce.number().min(0).max(100).optional(),
  referralEnabled: z.boolean().optional(),
  referralEnabledSingleStore: z.boolean().optional(),
  referralEnabledMultiVendor: z.boolean().optional(),
  referralCustomerThreshold: z.coerce.number().int().min(1).optional(),
  referralSellerThreshold: z.coerce.number().int().min(1).optional(),
  referralSellerPromoHours: z.coerce.number().int().min(1).optional(),
  // Upload controls
  maxUploadSizeMb: z.coerce.number().int().min(1).max(100).optional(),
  allowedUploadTypes: z.string().optional().or(z.literal("")),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

function CollapsibleDashboardSection({
  title,
  summary,
  defaultOpen = false,
  children,
  className = "",
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <details open={defaultOpen}>
        <summary className="cursor-pointer list-none px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-base font-semibold">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
            </div>
            <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
          </div>
        </summary>
        <CardContent className="pt-0">{children}</CardContent>
      </details>
    </Card>
  );
}

interface PlatformSettings extends SettingsFormData {
  id: string;
  logo?: string;
  onboardingImages?: string[];
  updatedAt: string;
  paystackPublicKeySource?: string;
  paystackSecretKeySource?: string;
  smtpHostSource?: string;
  smtpPortSource?: string;
  smtpUserSource?: string;
  smtpPassSource?: string;
  smtpFromEmailSource?: string;
  smtpFromNameSource?: string;
  cloudinaryApiKeySource?: string;
  cloudinaryApiSecretSource?: string;
  mapboxPublicTokenSource?: string;
  mapboxStyleUrlSource?: string;
  mapboxGlVersionSource?: string;
}

const MAPBOX_STYLE_PRESETS = [
  { value: "mapbox://styles/mapbox/streets-v12", label: "Streets" },
  { value: "mapbox://styles/mapbox/outdoors-v12", label: "Outdoors" },
  { value: "mapbox://styles/mapbox/light-v11", label: "Light" },
  { value: "mapbox://styles/mapbox/dark-v11", label: "Dark" },
  { value: "mapbox://styles/mapbox/satellite-v9", label: "Satellite" },
  { value: "mapbox://styles/mapbox/satellite-streets-v12", label: "Satellite Streets" },
  { value: "mapbox://styles/mapbox/navigation-day-v1", label: "Navigation Day" },
  { value: "mapbox://styles/mapbox/navigation-night-v1", label: "Navigation Night" },
] as const;

// ─── Sensitive Settings Gate ──────────────────────────────────────────────────
// Shown inside payments / storage / map tabs until super_admin re-authenticates.
const SENSITIVE_TABS = ["payments", "storage", "map", "advanced-features", "security", "analytics-integrations", "hosting"] as const;
type SensitiveTab = (typeof SENSITIVE_TABS)[number];

function SensitiveContentGate({
  role,
  isElevated,
  onUnlock,
  children,
}: {
  role?: string;
  isElevated: boolean;
  onUnlock: () => void;
  children?: ReactNode;
}) {
  if (role !== "super_admin") {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-destructive/30 bg-destructive/5 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-8 w-8 text-destructive" />
        </div>
        <div className="max-w-sm space-y-1">
          <h3 className="text-lg font-semibold text-destructive">Super Admin Access Only</h3>
          <p className="text-sm text-muted-foreground">
            This section contains sensitive credentials and is restricted to Super Administrators only.
          </p>
        </div>
      </div>
    );
  }

  if (!isElevated) {
    return (
      <div className="flex flex-col items-center gap-5 rounded-2xl border border-amber-200 bg-amber-50 py-16 text-center dark:border-amber-800/50 dark:bg-amber-950/20">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30">
          <ShieldCheck className="h-8 w-8 text-amber-500" />
        </div>
        <div className="max-w-sm space-y-1">
          <h3 className="text-lg font-semibold text-amber-700 dark:text-amber-400">
            Security Verification Required
          </h3>
          <p className="text-sm text-muted-foreground">
            This section contains sensitive API keys and credentials. Re-enter your password to unlock access for 15 minutes.
          </p>
        </div>
        <Button onClick={onUnlock} variant="default" className="mt-1">
          <Lock className="mr-2 h-4 w-4" />
          Verify Identity
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
// ──────────────────────────────────────────────────────────────────────────────

function ReferralReportSection() {
  const { data, isLoading, refetch } = useQuery<{
    totalReferrals: number;
    totalCompleted: number;
    totalRewards: number;
    totalClaimed: number;
    referrals: any[];
    rewards: any[];
  }>({
    queryKey: ["/api/admin/referral-report"],
    queryFn: () =>
      fetch("/api/admin/referral-report", { credentials: "include" }).then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json();
      }),
    staleTime: 60_000,
  });

  return (
    <Card className="border-border/70 bg-card shadow-sm">
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Referral Report</CardTitle>
          <CardDescription>Platform-wide referral activity and rewards.</CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "Total Referrals", value: data.totalReferrals },
                { label: "Completed", value: data.totalCompleted },
                { label: "Rewards Issued", value: data.totalRewards },
                { label: "Rewards Claimed", value: data.totalClaimed },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl border bg-muted/30 p-3 text-center">
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>

            {data.referrals.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Referrals</p>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Referrer</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Role</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.referrals.slice(-20).reverse().map((r: any) => (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2 truncate max-w-[120px]">{r.referrerName || r.referrerEmail || "—"}</td>
                          <td className="px-3 py-2 capitalize text-muted-foreground text-xs">{r.referrerRole || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.rewards.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Rewards</p>
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">User</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Type</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Code / Promo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rewards.slice(-20).reverse().map((r: any) => (
                        <tr key={r.id} className="border-t">
                          <td className="px-3 py-2 truncate max-w-[120px]">{r.userName || r.userEmail || "—"}</td>
                          <td className="px-3 py-2 capitalize text-xs text-muted-foreground">{r.type}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${r.status === "claimed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : r.status === "expired" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400" : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"}`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs text-primary">{r.discountCode || (r.rewardDurationHours ? `${r.rewardDurationHours}h promo` : "—")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {data.referrals.length === 0 && (
              <p className="text-sm text-center text-muted-foreground py-4">No referral activity yet.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-center text-muted-foreground py-4">Could not load report.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("general");
  const [clearedSocialKeys, setClearedSocialKeys] = useState<string[]>([]);

  // Elevated access for sensitive settings tabs (payments, storage, map)
  const [elevatedAccessAt, setElevatedAccessAt] = useState<number | null>(null);
  const [showElevatedAuthModal, setShowElevatedAuthModal] = useState(false);
  const [pendingTab, setPendingTab] = useState<string | null>(null);
  const [elevatedAuthPassword, setElevatedAuthPassword] = useState("");
  const [isVerifyingElevated, setIsVerifyingElevated] = useState(false);
  const isElevatedAccess =
    elevatedAccessAt !== null && Date.now() - elevatedAccessAt < 15 * 60 * 1000;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  // Security tab state
  const [encryptionKeyInput, setEncryptionKeyInput] = useState("");
  const [showEncryptionKey, setShowEncryptionKey] = useState(false);
  const [renderApiKeyInput, setRenderApiKeyInput] = useState("");
  const [renderServiceIdInput, setRenderServiceIdInput] = useState("");
  const [isPushingToRender, setIsPushingToRender] = useState(false);
  const [renderPushResult, setRenderPushResult] = useState<{ success: boolean; message: string } | null>(null);

  // Deploy hook state
  const [isTriggering, setIsTriggering] = useState(false);

  const handleTriggerDeploy = async () => {
    setIsTriggering(true);
    try {
      const res = await apiRequest("POST", "/api/admin/trigger-deploy", {});
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Deploy trigger failed");
      toast({ title: "Deploy triggered", description: data.message });
    } catch (e: any) {
      toast({ title: "Deploy failed", description: e.message, variant: "destructive" });
    } finally {
      setIsTriggering(false);
    }
  };

  // Import dialogs state
  const [showImportPaystackDialog, setShowImportPaystackDialog] = useState(false);
  const [isImportingPaystack, setIsImportingPaystack] = useState(false);
  const [showImportSmtpDialog, setShowImportSmtpDialog] = useState(false);
  const [isImportingSmtp, setIsImportingSmtp] = useState(false);
  const [showImportCloudinaryDialog, setShowImportCloudinaryDialog] = useState(false);
  const [isImportingCloudinary, setIsImportingCloudinary] = useState(false);
  const [showImportMapDialog, setShowImportMapDialog] = useState(false);
  const [isImportingMap, setIsImportingMap] = useState(false);

  // Footer Management state
  const [footerDialogOpen, setFooterDialogOpen] = useState(false);
  const [editingFooterPage, setEditingFooterPage] = useState<FooterPage | null>(null);
  const [footerStoreModeFilter, setFooterStoreModeFilter] = useState<string | null>(null);
  const [footerGroupFilter, setFooterGroupFilter] = useState("all");

  const FOOTER_GROUPS = [
    { value: "quick_links", label: "Quick Links / Marketplace" },
    { value: "customer_service", label: "Customer Service" },
    { value: "legal", label: "Legal" },
    { value: "trust_bar", label: "Trust Bar" },
    { value: "general", label: "General" },
  ];
  const STORE_MODES_FOOTER = [
    { value: "both", label: "Both Modes" },
    { value: "single", label: "Single Store" },
    { value: "multivendor", label: "Multi-Vendor" },
  ];

  const footerForm = useForm({
    defaultValues: {
      title: "", slug: "", content: "", url: "", group: "general",
      storeMode: "both", icon: "", displayOrder: 0, isActive: true, openInNewTab: false,
    },
  });

  // Icon options for trust bar items
  const TRUST_BAR_ICONS: { value: string; label: string; icon: any }[] = [
    { value: "Truck", label: "Delivery Truck", icon: Truck },
    { value: "ShieldCheck", label: "Shield Check", icon: ShieldCheck },
    { value: "CreditCard", label: "Credit Card", icon: CreditCard },
    { value: "Clock", label: "Clock", icon: Clock },
    { value: "Heart", label: "Heart", icon: Heart },
    { value: "Star", label: "Star", icon: Star },
    { value: "Award", label: "Award", icon: Award },
    { value: "Gift", label: "Gift", icon: Gift },
    { value: "Shield", label: "Shield", icon: Shield },
    { value: "Lock", label: "Lock", icon: Lock },
    { value: "Headphones", label: "Headphones", icon: Headphones },
    { value: "Phone", label: "Phone", icon: Phone },
    { value: "MapPin", label: "Location", icon: MapPin },
    { value: "Package", label: "Package", icon: Package },
    { value: "Percent", label: "Percent", icon: Percent },
    { value: "ThumbsUp", label: "Thumbs Up", icon: ThumbsUp },
    { value: "CheckCircle", label: "Check Circle", icon: CheckCircle },
    { value: "Users", label: "Users", icon: Users },
    { value: "Flame", label: "Flame", icon: Flame },
    { value: "Gem", label: "Gem", icon: Gem },
    { value: "Crown", label: "Crown", icon: Crown },
    { value: "BadgeCheck", label: "Badge Check", icon: BadgeCheck },
    { value: "Wallet", label: "Wallet", icon: Wallet },
    { value: "RefreshCcw", label: "Refresh", icon: RefreshCcw },
    { value: "LifeBuoy", label: "Life Buoy", icon: LifeBuoy },
    { value: "Rocket", label: "Rocket", icon: Rocket },
    { value: "Timer", label: "Timer", icon: Timer },
    { value: "Tag", label: "Tag", icon: Tag },
    { value: "ShoppingBag", label: "Shopping Bag", icon: ShoppingBag },
    { value: "ShoppingCart", label: "Shopping Cart", icon: ShoppingCart },
    { value: "Home", label: "Home", icon: Home },
    { value: "Search", label: "Search", icon: Search },
    { value: "Bell", label: "Bell", icon: Bell },
    { value: "MessageCircle", label: "Message", icon: MessageCircle },
    { value: "Wifi", label: "Wifi", icon: Wifi },
    { value: "Sun", label: "Sun", icon: Sun },
    { value: "Moon", label: "Moon", icon: Moon },
    { value: "BarChart", label: "Chart", icon: BarChart },
    { value: "Key", label: "Key", icon: Key },
    { value: "Fingerprint", label: "Fingerprint", icon: Fingerprint },
    { value: "Globe2", label: "Globe", icon: Globe2 },
    { value: "Umbrella", label: "Umbrella", icon: Umbrella },
    { value: "Coffee", label: "Coffee", icon: Coffee },
    { value: "Music", label: "Music", icon: Music },
    { value: "Camera", label: "Camera", icon: Camera },
    { value: "Target", label: "Target", icon: Target },
    { value: "Compass", label: "Compass", icon: Compass },
    { value: "Anchor", label: "Anchor", icon: Anchor },
    { value: "Feather", label: "Feather", icon: Feather },
    { value: "Leaf", label: "Leaf", icon: Leaf },
    { value: "Droplets", label: "Droplets", icon: Droplets },
    { value: "Wind", label: "Wind", icon: Wind },
    { value: "DollarSign", label: "Dollar", icon: DollarSign },
    { value: "Mail", label: "Mail", icon: Mail },
    { value: "Box", label: "Box", icon: Box },
    { value: "Database", label: "Database", icon: Database },
    { value: "HardDrive", label: "Hard Drive", icon: HardDrive },
  ];

  const { data: footerPages = [], isLoading: footerPagesLoading } = useQuery<FooterPage[]>({
    queryKey: ["/api/admin/footer-pages"],
  });

  const createFooterMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/admin/footer-pages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      setFooterDialogOpen(false);
      setEditingFooterPage(null);
      footerForm.reset();
      toast({ title: "Success", description: "Footer item created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateFooterMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await apiRequest("PATCH", `/api/admin/footer-pages/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      setFooterDialogOpen(false);
      setEditingFooterPage(null);
      footerForm.reset();
      toast({ title: "Success", description: "Footer item updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteFooterMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/footer-pages/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      toast({ title: "Success", description: "Footer item deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleFooterVisibility = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/footer-pages/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
    },
  });

  const handleFooterSubmit = (data: any) => {
    if (editingFooterPage) {
      updateFooterMutation.mutate({ id: editingFooterPage.id, data });
    } else {
      createFooterMutation.mutate(data);
    }
  };

  const handleEditFooter = (page: FooterPage) => {
    setEditingFooterPage(page);
    footerForm.reset({
      title: page.title, slug: page.slug, content: page.content || "",
      url: page.url || "", group: page.group || "general",
      storeMode: (page as any).storeMode || "both",
      icon: (page as any).icon || "",
      displayOrder: page.displayOrder || 0,
      isActive: page.isActive ?? true, openInNewTab: page.openInNewTab ?? false,
    });
    setFooterDialogOpen(true);
  };

  const handleFooterTitleChange = (title: string) => {
    if (!editingFooterPage) {
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
      footerForm.setValue("slug", slug);
    }
  };

  // ── Elevated access handlers ────────────────────────────────────────────────
  const handleTabChange = (value: string) => {
    const isSensitive = SENSITIVE_TABS.includes(value as SensitiveTab);
    if (isSensitive && user?.role === "super_admin" && !isElevatedAccess) {
      setPendingTab(value);
      setShowElevatedAuthModal(true);
      return; // Don't navigate to the tab yet
    }
    setActiveTab(value);
  };

  const handleElevatedVerify = async () => {
    if (!elevatedAuthPassword.trim()) return;
    setIsVerifyingElevated(true);
    try {
      const res = await apiRequest("POST", "/api/admin/verify-elevated-access", {
        password: elevatedAuthPassword,
      });
      const data = await res.json();
      if (data.granted) {
        setElevatedAccessAt(Date.now());
        setShowElevatedAuthModal(false);
        setElevatedAuthPassword("");
        if (pendingTab) {
          setActiveTab(pendingTab);
          setPendingTab(null);
        }
        toast({ title: "Access Granted", description: "Sensitive settings unlocked for 15 minutes." });
      }
    } catch (error: any) {
      toast({
        title: "Access Denied",
        description: error.message?.replace(/^\d+:\s*/, "") || "Incorrect password",
        variant: "destructive",
      });
    } finally {
      setIsVerifyingElevated(false);
    }
  };

  const handleLockElevatedAccess = () => {
    setElevatedAccessAt(null);
    if (SENSITIVE_TABS.includes(activeTab as SensitiveTab)) {
      setActiveTab("general");
    }
    toast({ title: "Sensitive Settings Locked", description: "Re-authentication required to access credentials." });
  };
  // ─────────────────────────────────────────────────────────────────────────────

  // ── Security tab handlers ────────────────────────────────────────────────────
  const { data: encKeyStatus } = useQuery<{ isSet: boolean; keyLength: number }>({
    queryKey: ["/api/admin/encryption-key-status"],
    enabled: isAuthenticated && user?.role === "super_admin",
    staleTime: 60_000,
  });

  const generateEncryptionKey = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    // Base64url encode for env-var friendliness
    const key = btoa(String.fromCharCode(...Array.from(array))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    setEncryptionKeyInput(key);
    setShowEncryptionKey(true);
    setRenderPushResult(null);
  };

  const handlePushToRender = async () => {
    if (!renderApiKeyInput.trim() || !renderServiceIdInput.trim() || !encryptionKeyInput.trim()) return;
    setIsPushingToRender(true);
    setRenderPushResult(null);
    try {
      const res = await apiRequest("POST", "/api/admin/push-to-render", {
        renderApiKey: renderApiKeyInput.trim(),
        renderServiceId: renderServiceIdInput.trim(),
        envKey: "SETTINGS_ENCRYPTION_KEY",
        envValue: encryptionKeyInput.trim(),
      });
      const data = await res.json();
      setRenderPushResult({ success: true, message: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/encryption-key-status"] });
    } catch (error: any) {
      const msg = error.message?.replace(/^\d+:\s*/, "") || "Failed to push to Render";
      setRenderPushResult({ success: false, message: msg });
    } finally {
      setIsPushingToRender(false);
    }
  };
  // ─────────────────────────────────────────────────────────────────────────────

  const getFooterGroupLabel = (g: string) => FOOTER_GROUPS.find(f => f.value === g)?.label || g;
  const getFooterStoreModeLabel = (m: string) => STORE_MODES_FOOTER.find(s => s.value === m)?.label || m;
  const getFooterStoreModeBadgeClass = (m: string) => {
    if (m === "single") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    if (m === "multivendor") return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
  };

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });

  const activeFooterModeFilter = footerStoreModeFilter ?? (settings?.isMultiVendor ? "multivendor" : "single");
  const filteredFooterPages = footerPages.filter((page) => {
    const sm = (page as any).storeMode || "both";
    const matchesStore = sm === activeFooterModeFilter || sm === "both";
    const matchesGroup = footerGroupFilter === "all" || (page.group || "general") === footerGroupFilter;
    return matchesStore && matchesGroup;
  });

  const groupedFooterPages = filteredFooterPages.reduce((acc, page) => {
    const g = page.group || "general";
    if (!acc[g]) acc[g] = [];
    acc[g].push(page);
    return acc;
  }, {} as Record<string, FooterPage[]>);

  const { data: stores = [] } = useQuery<Array<{id: string; name: string; isActive: boolean}>>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
      return res.json();
    },
  });

  // Fetch hero banners for preview
  interface HeroBannerPreview {
    id: string;
    title: string;
    subtitle: string | null;
    image: string;
    storeMode: "single" | "multivendor" | "both";
    isActive: boolean;
    displayOrder: number;
  }

  const { data: heroBanners = [] } = useQuery<HeroBannerPreview[]>({
    queryKey: ["/api/admin/hero-banners"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Frontend URL Status Query
  const frontendUrlQuery = useQuery<FrontendUrlStatus>({
    queryKey: ["/api/admin/frontend-url-status"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/admin/frontend-url-status");
      return (await response.json()) as FrontendUrlStatus;
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    refetchInterval: 60000, // Refetch every 60 seconds
    staleTime: 30000, // Consider data stale after 30 seconds
    retry: 1, // Retry once on failure
    throwOnError: false, // Don't throw errors, handle them gracefully
  });

  const refreshFrontendUrlMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("GET", "/api/admin/frontend-url-status?refresh=true");
      return (await response.json()) as FrontendUrlStatus;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/admin/frontend-url-status"], data);
    },
  });

  // Filter banners by store mode
  const singleStoreBanners = heroBanners.filter(b => b.storeMode === "single" || b.storeMode === "both");
  const multiVendorBanners = heroBanners.filter(b => b.storeMode === "multivendor" || b.storeMode === "both");

  // Delete banner mutation
  const deleteBannerMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/hero-banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-banners"] });
      toast({ title: "Success", description: "Banner deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Toggle banner active status
  const toggleBannerMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/hero-banners/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-banners"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Banner preview component
  const BannerPreviewCard = ({ banner }: { banner: HeroBannerPreview }) => (
    <div className="relative group border rounded-lg overflow-hidden bg-background">
      <div className="aspect-[16/6] relative">
        <img
          src={banner.image}
          alt={banner.title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/admin/hero-banners?edit=${banner.id}`)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => window.open(banner.image, "_blank")}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              if (confirm(`Delete banner "${banner.title}"?`)) {
                deleteBannerMutation.mutate(banner.id);
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="p-2">
        <div className="flex items-center justify-between gap-2">
          <p className="font-medium text-sm truncate">{banner.title}</p>
          <Badge variant={banner.isActive ? "default" : "secondary"} className="text-xs">
            {banner.isActive ? "Active" : "Inactive"}
          </Badge>
        </div>
        {banner.subtitle && (
          <p className="text-xs text-muted-foreground truncate">{banner.subtitle}</p>
        )}
      </div>
    </div>
  );

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Ensure super admins don't see branding/currency tabs and reset active tab if needed
  useEffect(() => {
    if (user?.role === "super_admin" && (activeTab === "branding" || activeTab === "currency")) {
      setActiveTab("general");
    }
  }, [user?.role, activeTab]);

  const form = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      platformName: "",
      isMultiVendor: false,
      allowSellerRegistration: false,
      allowRiderRegistration: false,
      allowSellerBankPayouts: true,
      allowSharedVariantColorStock: false,
      showHomepageFeaturedSection: true,
      showHomepageNewArrivalSection: true,
      isExternalRiderSystemEnabled: false,
      showCheckoutDeliveryMap: true,
      allowPickupAgentAdminChat: true,
      allowSellerDirectSupportMessages: true,
      shopDisplayMode: "by-store",
      showShopBySection: true,
      primaryStoreId: null,
      primaryColor: "#1e7b5f",
      defaultCurrency: "GHS",
      frontendUrl: "",
      paystackPublicKey: "",
      paystackSecretKey: "",
      processingFeePercent: "1.95",
      defaultCommissionRate: "1",
      smtpHost: "",
      smtpPort: 587,
      smtpUser: "",
      smtpPass: "",
      smtpSecure: false,
      smtpFromEmail: "",
      smtpFromName: "KiyuMart",
      cloudinaryCloudName: "",
      cloudinaryApiKey: "",
      cloudinaryApiSecret: "",
      mapboxPublicToken: "",
      mapboxStyleUrl: "mapbox://styles/mapbox/navigation-night-v1",
      mapboxGlVersion: "v3.4.0",
      contactPhone: "",
      contactEmail: "",
      contactAddress: "",
      facebookUrl: "",
      instagramUrl: "",
      twitterUrl: "",
      showFacebook: true,
      showInstagram: true,
      showTwitter: true,
      showLinkedin: true,
      showYoutube: true,
      showTiktok: true,
      showPinterest: true,
      showWhatsapp: true,
      linkedinUrl: "",
      youtubeUrl: "",
      tiktokUrl: "",
      pinterestUrl: "",
      whatsappPage: "",
      showSocialLinks: true,
      footerDescription: "",
      adsEnabled: false,
      heroBannerEnabled: false,
      sidebarAdEnabled: false,
      footerAdEnabled: false,
      productPageAdEnabled: false,
      heroBannerAdImage: "",
      heroBannerAdUrl: "",
      sidebarAdImage: "",
      sidebarAdUrl: "",
      footerAdImage: "",
      footerAdUrl: "",
      productPageAdImage: "",
      productPageAdUrl: "",
    },
  });
  const mapboxStyleUrlValue = String(form.watch("mapboxStyleUrl") || "").trim();
  const selectedMapboxStylePreset = MAPBOX_STYLE_PRESETS.some((preset) => preset.value === mapboxStyleUrlValue)
    ? mapboxStyleUrlValue
    : "__custom__";

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
      const mergedData = {
        ...form.getValues(),
        ...data,
        isExternalRiderSystemEnabled: (data as any).isExternalRiderSystemEnabled === true,
        showCheckoutDeliveryMap: (data as any).showCheckoutDeliveryMap !== false,
        allowPickupAgentAdminChat: (data as any).allowPickupAgentAdminChat !== false,
        allowSellerDirectSupportMessages: (data as any).allowSellerDirectSupportMessages !== false,
      };
      // Replace cache with authoritative server response and refetch other keys
      queryClient.setQueryData(["/api/settings"], mergedData);
      await queryClient.invalidateQueries({ queryKey: ["/api/settings", user?.id] });
      await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
      await queryClient.refetchQueries({ queryKey: ["/api/settings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/public/platform-settings"] });
      await queryClient.refetchQueries({ queryKey: ["/api/public/platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/new-arrivals"] });
      
      // Invalidate hero banners so they refetch with new store mode
      queryClient.invalidateQueries({ queryKey: ["/api/hero-banners"] });

      // Reset cleared keys after successful update
      setClearedSocialKeys([]);

      // Reset form with server response
      form.reset({
        platformName: mergedData.platformName,
        isMultiVendor: mergedData.isMultiVendor,
        allowSellerRegistration: mergedData.allowSellerRegistration || false,
        allowRiderRegistration: mergedData.allowRiderRegistration || false,
        allowSellerBankPayouts: mergedData.allowSellerBankPayouts !== false,
        allowSharedVariantColorStock: mergedData.allowSharedVariantColorStock === true,
        showHomepageFeaturedSection: mergedData.showHomepageFeaturedSection !== false,
        showHomepageNewArrivalSection: mergedData.showHomepageNewArrivalSection !== false,
        isExternalRiderSystemEnabled: mergedData.isExternalRiderSystemEnabled || false,
        showCheckoutDeliveryMap: mergedData.showCheckoutDeliveryMap !== false,
        allowPickupAgentAdminChat: mergedData.allowPickupAgentAdminChat !== false,
        allowSellerDirectSupportMessages: mergedData.allowSellerDirectSupportMessages !== false,
        shopDisplayMode: mergedData.shopDisplayMode || "by-store",
        showShopBySection: mergedData.showShopBySection ?? true,
        primaryStoreId: mergedData.primaryStoreId || null,
        primaryColor: mergedData.primaryColor,
        defaultCurrency: mergedData.defaultCurrency,
        frontendUrl: mergedData.frontendUrl || "",
        paystackPublicKey: mergedData.paystackPublicKey || "",
        paystackSecretKey: mergedData.paystackSecretKey || "",
        processingFeePercent: mergedData.processingFeePercent,
        defaultCommissionRate: mergedData.defaultCommissionRate || "1",
        smtpHost: mergedData.smtpHost || "",
        smtpPort: Number(mergedData.smtpPort || 587),
        smtpUser: mergedData.smtpUser || "",
        smtpPass: mergedData.smtpPass || "",
        smtpSecure: mergedData.smtpSecure === true,
        smtpFromEmail: mergedData.smtpFromEmail || "",
        smtpFromName: mergedData.smtpFromName || "KiyuMart",
        cloudinaryCloudName: mergedData.cloudinaryCloudName || "",
        cloudinaryApiKey: mergedData.cloudinaryApiKey || "",
        cloudinaryApiSecret: mergedData.cloudinaryApiSecret || "",
        cloudinaryAccounts: (mergedData as any).cloudinaryAccounts || "",
        mapboxPublicToken: (mergedData as any).mapboxPublicToken || "",
        mapboxStyleUrl: (mergedData as any).mapboxStyleUrl || "mapbox://styles/mapbox/navigation-night-v1",
        mapboxGlVersion: (mergedData as any).mapboxGlVersion || "v3.4.0",
        contactPhone: mergedData.contactPhone,
        contactEmail: mergedData.contactEmail,
        contactAddress: mergedData.contactAddress,
        facebookUrl: mergedData.facebookUrl || "",
        instagramUrl: mergedData.instagramUrl || "",
        twitterUrl: mergedData.twitterUrl || "",
        showFacebook: mergedData.showFacebook ?? true,
        showInstagram: mergedData.showInstagram ?? true,
        showTwitter: mergedData.showTwitter ?? true,
        showLinkedin: mergedData.showLinkedin ?? true,
        showYoutube: mergedData.showYoutube ?? true,
        showTiktok: mergedData.showTiktok ?? true,
        showPinterest: mergedData.showPinterest ?? true,
        showWhatsapp: mergedData.showWhatsapp ?? true,
        linkedinUrl: mergedData.linkedinUrl || "",
        youtubeUrl: mergedData.youtubeUrl || "",
        tiktokUrl: mergedData.tiktokUrl || "",
        pinterestUrl: mergedData.pinterestUrl || "",
        whatsappPage: mergedData.whatsappPage || "",
        showSocialLinks: mergedData.showSocialLinks ?? true,
        footerDescription: mergedData.footerDescription,
        adsEnabled: mergedData.adsEnabled || false,
        heroBannerEnabled: (mergedData as any).heroBannerEnabled ?? false,
        sidebarAdEnabled: (mergedData as any).sidebarAdEnabled ?? false,
        footerAdEnabled: (mergedData as any).footerAdEnabled ?? false,
        productPageAdEnabled: (mergedData as any).productPageAdEnabled ?? false,
        heroBannerAdImage: mergedData.heroBannerAdImage || "",
        heroBannerAdUrl: mergedData.heroBannerAdUrl || "",
        sidebarAdImage: mergedData.sidebarAdImage || "",
        sidebarAdUrl: mergedData.sidebarAdUrl || "",
        footerAdImage: mergedData.footerAdImage || "",
        footerAdUrl: mergedData.footerAdUrl || "",
        productPageAdImage: mergedData.productPageAdImage || "",
        productPageAdUrl: mergedData.productPageAdUrl || "",
        googleAnalyticsId: (mergedData as any).googleAnalyticsId || "",
        microsoftClarityId: (mergedData as any).microsoftClarityId || "",
        sentryDsn: (mergedData as any).sentryDsn || "",
        ga4PropertyId: (mergedData as any).ga4PropertyId || "",
        googleCredentialsJson: (mergedData as any).googleCredentialsJson || "",
        sentryAuthToken: (mergedData as any).sentryAuthToken || "",
        sentryOrg: (mergedData as any).sentryOrg || "",
        sentryProject: (mergedData as any).sentryProject || "",
        renderDeployHookUrl: (mergedData as any).renderDeployHookUrl || "",
        inviteOnlyRegistration: (mergedData as any).inviteOnlyRegistration === true,
        orderAutoCancelHours: Number((mergedData as any).orderAutoCancelHours ?? 0),
        freeTierProductLimit: Number((mergedData as any).freeTierProductLimit ?? 20),
        maxProductsPerSeller: Number((mergedData as any).maxProductsPerSeller ?? 0),
        upgradePlanAPrice: Number((mergedData as any).upgradePlanAPrice ?? 15),
        upgradePlanASlots: Number((mergedData as any).upgradePlanASlots ?? 10),
        upgradePlanBPrice: Number((mergedData as any).upgradePlanBPrice ?? 40),
        upgradePlanCPrice: Number((mergedData as any).upgradePlanCPrice ?? 100),
        deliveryFeeCommission: Number((mergedData as any).deliveryFeeCommission ?? 0),
        referralRewardPercent: Number((mergedData as any).referralRewardPercent ?? 10),
        referralEnabled: (mergedData as any).referralEnabled === true,
        referralEnabledSingleStore: (mergedData as any).referralEnabledSingleStore !== false,
        referralEnabledMultiVendor: (mergedData as any).referralEnabledMultiVendor !== false,
        referralCustomerThreshold: Number((mergedData as any).referralCustomerThreshold ?? 5),
        referralSellerThreshold: Number((mergedData as any).referralSellerThreshold ?? 10),
        referralSellerPromoHours: Number((mergedData as any).referralSellerPromoHours ?? 24),
        maxUploadSizeMb: Number((mergedData as any).maxUploadSizeMb ?? 10),
        allowedUploadTypes: (mergedData as any).allowedUploadTypes || "jpg,jpeg,png,webp,gif,avif",
      });

      // Keep in-browser runtime map config in sync so map pages in the same session pick up updates immediately.
      try {
        const token = String((data as any).mapboxPublicToken || "").trim();
        const styleUrl = String((data as any).mapboxStyleUrl || "").trim();
        const glVersion = String((data as any).mapboxGlVersion || "").trim();
        if (token.startsWith("pk.")) {
          (window as any).__MAPBOX_ACCESS_TOKEN__ = token;
          window.localStorage.setItem("mapbox_access_token", token);
        } else {
          delete (window as any).__MAPBOX_ACCESS_TOKEN__;
          window.localStorage.removeItem("mapbox_access_token");
        }
        if (styleUrl) {
          (window as any).__MAPBOX_STYLE_URL__ = styleUrl;
          window.localStorage.setItem("mapbox_style_url", styleUrl);
        } else {
          delete (window as any).__MAPBOX_STYLE_URL__;
          window.localStorage.removeItem("mapbox_style_url");
        }
        if (glVersion) {
          (window as any).__MAPBOX_GL_VERSION__ = glVersion;
          window.localStorage.setItem("mapbox_gl_version", glVersion);
        } else {
          delete (window as any).__MAPBOX_GL_VERSION__;
          window.localStorage.removeItem("mapbox_gl_version");
        }
      } catch {
        // Ignore runtime cache sync failures.
      }

      toast({
        title: "Settings updated",
        description: "Platform settings have been saved successfully.",
      });
    },
  });

  const onSubmit = (_data: SettingsFormData) => {
    // Use getValues to ensure controlled switches and all values are included
    const payload: any = { ...form.getValues() };
    if ((settings as any)?.id === "default") {
      delete payload.allowSellerBankPayouts;
      delete payload.allowSharedVariantColorStock;
    }
    const mapKeys = ["mapboxPublicToken", "mapboxStyleUrl", "mapboxGlVersion"] as const;
    for (const key of mapKeys) {
      const raw = payload[key];
      if (raw === null || raw === undefined) {
        delete payload[key];
        continue;
      }
      if (typeof raw !== "string") {
        delete payload[key];
        continue;
      }
      const trimmed = raw.trim();
      if (!trimmed) {
        delete payload[key];
        continue;
      }
      payload[key] = trimmed;
    }
    const smtpTextKeys = ["smtpHost", "smtpUser", "smtpPass", "smtpFromEmail", "smtpFromName"] as const;
    for (const key of smtpTextKeys) {
      const raw = payload[key];
      if (typeof raw !== "string") continue;
      payload[key] = raw.trim();
    }
    updateSettingsMutation.mutate(payload as SettingsFormData);
  };

  // Keep form in sync when settings change externally
  useEffect(() => {
    if (settings) {
      form.reset({
        platformName: settings.platformName,
        isMultiVendor: settings.isMultiVendor,
        allowSellerRegistration: (settings as any).allowSellerRegistration || false,
        allowRiderRegistration: (settings as any).allowRiderRegistration || false,
        allowSellerBankPayouts: (settings as any).allowSellerBankPayouts !== false,
        allowSharedVariantColorStock: (settings as any).allowSharedVariantColorStock === true,
        showHomepageFeaturedSection: (settings as any).showHomepageFeaturedSection !== false,
        showHomepageNewArrivalSection: (settings as any).showHomepageNewArrivalSection !== false,
        isExternalRiderSystemEnabled: (settings as any).isExternalRiderSystemEnabled || false,
        showCheckoutDeliveryMap: (settings as any).showCheckoutDeliveryMap !== false,
        allowPickupAgentAdminChat: (settings as any).allowPickupAgentAdminChat !== false,
        allowSellerDirectSupportMessages: (settings as any).allowSellerDirectSupportMessages !== false,
        shopDisplayMode: (settings as any).shopDisplayMode || "by-store",
        showShopBySection: (settings as any).showShopBySection ?? true,
        primaryStoreId: (settings as any).primaryStoreId || null,
        primaryColor: settings.primaryColor,
        defaultCurrency: settings.defaultCurrency,
        frontendUrl: (settings as any).frontendUrl || "",
        paystackPublicKey: settings.paystackPublicKey || "",
        paystackSecretKey: settings.paystackSecretKey || "",
        processingFeePercent: settings.processingFeePercent,
        defaultCommissionRate: (settings as any).defaultCommissionRate || "1",
        smtpHost: (settings as any).smtpHost || "",
        smtpPort: Number((settings as any).smtpPort || 587),
        smtpUser: (settings as any).smtpUser || "",
        smtpPass: (settings as any).smtpPass || "",
        smtpSecure: (settings as any).smtpSecure === true,
        smtpFromEmail: (settings as any).smtpFromEmail || "",
        smtpFromName: (settings as any).smtpFromName || "KiyuMart",
        cloudinaryCloudName: (settings as any).cloudinaryCloudName || "",
        cloudinaryApiKey: (settings as any).cloudinaryApiKey || "",
        cloudinaryApiSecret: (settings as any).cloudinaryApiSecret || "",
        cloudinaryAccounts: (settings as any).cloudinaryAccounts || "",
        mapboxPublicToken: (settings as any).mapboxPublicToken || "",
        mapboxStyleUrl: (settings as any).mapboxStyleUrl || "mapbox://styles/mapbox/navigation-night-v1",
        mapboxGlVersion: (settings as any).mapboxGlVersion || "v3.4.0",
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
        heroBannerEnabled: (settings as any).heroBannerEnabled ?? false,
        sidebarAdEnabled: (settings as any).sidebarAdEnabled ?? false,
        footerAdEnabled: (settings as any).footerAdEnabled ?? false,
        productPageAdEnabled: (settings as any).productPageAdEnabled ?? false,
        heroBannerAdImage: settings.heroBannerAdImage || "",
        heroBannerAdUrl: settings.heroBannerAdUrl || "",
        sidebarAdImage: settings.sidebarAdImage || "",
        sidebarAdUrl: settings.sidebarAdUrl || "",
        footerAdImage: settings.footerAdImage || "",
        footerAdUrl: settings.footerAdUrl || "",
        productPageAdImage: settings.productPageAdImage || "",
        productPageAdUrl: settings.productPageAdUrl || "",
        googleAnalyticsId: (settings as any).googleAnalyticsId || "",
        microsoftClarityId: (settings as any).microsoftClarityId || "",
        sentryDsn: (settings as any).sentryDsn || "",
        ga4PropertyId: (settings as any).ga4PropertyId || "",
        googleCredentialsJson: (settings as any).googleCredentialsJson || "",
        sentryAuthToken: (settings as any).sentryAuthToken || "",
        sentryOrg: (settings as any).sentryOrg || "",
        sentryProject: (settings as any).sentryProject || "",
        renderDeployHookUrl: (settings as any).renderDeployHookUrl || "",
        inviteOnlyRegistration: (settings as any).inviteOnlyRegistration === true,
        orderAutoCancelHours: Number((settings as any).orderAutoCancelHours ?? 0),
        freeTierProductLimit: Number((settings as any).freeTierProductLimit ?? 20),
        maxProductsPerSeller: Number((settings as any).maxProductsPerSeller ?? 0),
        upgradePlanAPrice: Number((settings as any).upgradePlanAPrice ?? 15),
        upgradePlanASlots: Number((settings as any).upgradePlanASlots ?? 10),
        upgradePlanBPrice: Number((settings as any).upgradePlanBPrice ?? 40),
        upgradePlanCPrice: Number((settings as any).upgradePlanCPrice ?? 100),
        deliveryFeeCommission: Number((settings as any).deliveryFeeCommission ?? 0),
        referralRewardPercent: Number((settings as any).referralRewardPercent ?? 10),
        referralEnabled: (settings as any).referralEnabled === true,
        referralEnabledSingleStore: (settings as any).referralEnabledSingleStore !== false,
        referralEnabledMultiVendor: (settings as any).referralEnabledMultiVendor !== false,
        referralCustomerThreshold: Number((settings as any).referralCustomerThreshold ?? 5),
        referralSellerThreshold: Number((settings as any).referralSellerThreshold ?? 10),
        referralSellerPromoHours: Number((settings as any).referralSellerPromoHours ?? 24),
        maxUploadSizeMb: Number((settings as any).maxUploadSizeMb ?? 10),
        allowedUploadTypes: (settings as any).allowedUploadTypes || "jpg,jpeg,png,webp,gif,avif",
      });
    }
  }, [settings]);

  if (authLoading || isLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="space-y-1">
            <p className="text-lg font-semibold text-foreground">Loading settings</p>
            <p className="text-sm text-muted-foreground">
              Preparing platform controls, payments, ads, and advanced configuration.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="mx-auto w-full max-w-[1680px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-[28px] border border-border/70 bg-card shadow-sm dark:border-primary/20 dark:bg-gradient-to-br dark:from-primary/10 dark:via-background dark:to-background dark:shadow-[0_20px_70px_-45px_rgba(16,185,129,0.65)]">
            <div className="flex flex-col gap-6 p-5 sm:p-6 xl:grid xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,1fr)] xl:items-start">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner shadow-primary/10 dark:bg-primary/15">
                  <Settings2 className="h-7 w-7" />
                </div>
                <div className="min-w-0 space-y-3">
                  <div>
                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Platform Settings</h1>
                    <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
                      Superadmin control center for commerce mode, operations, payments, storefront visibility, and infrastructure.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="border-primary/20 bg-primary/10 text-primary">Super Admin Control</Badge>
                    <Badge variant="outline">{form.watch("isMultiVendor") ? "Multi-Vendor" : "Single Store"}</Badge>
                    <Badge variant="outline">
                      {form.watch("isExternalRiderSystemEnabled") ? "External Delivery Enabled" : "Rider Features Off"}
                    </Badge>
                    <Badge variant="outline">{activeTab.replace(/-/g, " ")}</Badge>
                    {isElevatedAccess && (
                      <button
                        type="button"
                        onClick={handleLockElevatedAccess}
                        className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-400 dark:hover:bg-amber-900/60"
                      >
                        <ShieldCheck className="h-3 w-3" />
                        Elevated — Lock
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="grid w-full min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-2">
                <div className="min-h-[132px] rounded-2xl border border-border/70 bg-background p-4 shadow-sm dark:bg-background/80 dark:backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Commerce Mode</p>
                  <p className="mt-2 text-base font-semibold">{form.watch("isMultiVendor") ? "Marketplace" : "Primary Store"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {form.watch("isMultiVendor") ? "Multiple sellers and multi-store layout." : "Single-store storefront experience."}
                  </p>
                </div>
                <div className="min-h-[132px] rounded-2xl border border-border/70 bg-background p-4 shadow-sm dark:bg-background/80 dark:backdrop-blur">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Delivery Flow</p>
                  <p className="mt-2 text-base font-semibold">
                    {form.watch("isExternalRiderSystemEnabled") ? "Manual / External" : "Rider Features Off"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {form.watch("showCheckoutDeliveryMap") ? "Checkout map visible." : "Checkout map hidden."}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                Configuration Workspace
              </h2>
              <p className="text-muted-foreground mt-1">All platform controls remain available here. The layout has been tightened, not reduced.</p>
            </div>
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit(form.getValues() as SettingsFormData);
            }}
            className="space-y-6"
          >
          <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
            <div className="overflow-hidden rounded-[26px] border border-border/70 bg-card/60 shadow-sm">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-none bg-transparent p-3 sm:grid-cols-3 lg:grid-cols-5">
              <TabsTrigger value="general" data-testid="tab-general" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Settings2 className="h-4 w-4 mr-2" />
                General
              </TabsTrigger>
              <TabsTrigger value="payments" data-testid="tab-payments" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <CreditCard className="h-4 w-4 mr-2" />
                Payments
              </TabsTrigger>
              <TabsTrigger value="storage" data-testid="tab-storage" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Cloud className="h-4 w-4 mr-2" />
                Storage
              </TabsTrigger>
              <TabsTrigger value="map" data-testid="tab-map" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Globe className="h-4 w-4 mr-2" />
                Map
              </TabsTrigger>
              <TabsTrigger value="contact" data-testid="tab-contact" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Mail className="h-4 w-4 mr-2" />
                Contact
              </TabsTrigger>
              {user?.role === "super_admin" && (
                <TabsTrigger value="advanced-features" data-testid="tab-advanced-features" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Rocket className="h-4 w-4 mr-2" />
                  Advanced Features
                </TabsTrigger>
              )}
              {user?.role === "super_admin" && (
                <TabsTrigger value="security" data-testid="tab-security" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Key className="h-4 w-4 mr-2" />
                  Security Keys
                </TabsTrigger>
              )}
              {user?.role !== "super_admin" && (
                <>
                  <TabsTrigger value="branding" data-testid="tab-branding" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                    <Palette className="h-4 w-4 mr-2" />
                    Branding
                  </TabsTrigger>
                  <TabsTrigger value="currency" data-testid="tab-currency" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Currency
                  </TabsTrigger>
                </>
              )}
              <TabsTrigger value="ads" data-testid="tab-ads" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <ImageIcon className="h-4 w-4 mr-2" />
                Ads
              </TabsTrigger>
              <TabsTrigger value="footer" data-testid="tab-footer" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Layers className="h-4 w-4 mr-2" />
                Footer
              </TabsTrigger>
              <TabsTrigger value="diagnostics" data-testid="tab-diagnostics" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                <Activity className="h-4 w-4 mr-2" />
                Diagnostics
              </TabsTrigger>
              {user?.role === "super_admin" && (
                <TabsTrigger value="analytics-integrations" data-testid="tab-analytics-integrations" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <BarChart2 className="h-4 w-4 mr-2" />
                  Analytics
                </TabsTrigger>
              )}
              {user?.role === "super_admin" && (
                <TabsTrigger value="hosting" data-testid="tab-hosting" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <Server className="h-4 w-4 mr-2" />
                  Hosting
                </TabsTrigger>
              )}
              {user?.role === "super_admin" && (
                <TabsTrigger value="deploy-guide" data-testid="tab-deploy-guide" className="min-h-[48px] w-full justify-center rounded-xl border border-transparent px-4 py-2.5 text-center text-sm data-[state=active]:border-primary/25 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
                  <BookOpen className="h-4 w-4 mr-2" />
                  Deploy Guide
                </TabsTrigger>
              )}
            </TabsList>
            </div>

            <TabsContent value="general" className="space-y-5">
              {user?.role === "super_admin" && (
                <Card className="border-primary/50 bg-primary/5">
                  <CardHeader>
                    <CardTitle className="text-primary">Super Admin Profile</CardTitle>
                    <CardDescription>
                      Your administrator profile and account information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-foreground font-semibold">Full Name</Label>
                        <div className="p-3 bg-muted/50 rounded-lg border">
                          <p className="text-foreground font-medium">{user?.name || "N/A"}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-foreground font-semibold">Email Address</Label>
                        <div className="p-3 bg-muted/50 rounded-lg border">
                          <p className="text-foreground font-medium">{user?.email || "N/A"}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-foreground font-semibold">Role</Label>
                        <div className="p-3 bg-muted/50 rounded-lg border">
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary text-primary-foreground">
                            Super Administrator
                          </span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-foreground font-semibold">Phone</Label>
                        <div className="p-3 bg-muted/50 rounded-lg border">
                          <p className="text-foreground font-medium">{user?.phone || "Not provided"}</p>
                        </div>
                      </div>
                    </div>
                    <div className="pt-2 border-t">
                      <Button variant="outline" onClick={() => navigate("/profile")}>
                        Edit Profile Details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

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

                  {user?.role === "super_admin" && (
                    <>
                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-0.5">
                          <Label htmlFor="showHomepageFeaturedSection">Show Featured Products On Homepage</Label>
                          <p className="text-sm text-muted-foreground">
                            Turn the homepage featured products section on or off.
                          </p>
                        </div>
                        <Switch
                          id="showHomepageFeaturedSection"
                          checked={form.watch("showHomepageFeaturedSection")}
                          onCheckedChange={(checked) => form.setValue("showHomepageFeaturedSection", checked)}
                          data-testid="switch-show-homepage-featured-section"
                        />
                      </div>

                      <div className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-0.5">
                          <Label htmlFor="showHomepageNewArrivalSection">Show New Arrivals On Homepage</Label>
                          <p className="text-sm text-muted-foreground">
                            Turn the homepage new arrivals section on or off.
                          </p>
                        </div>
                        <Switch
                          id="showHomepageNewArrivalSection"
                          checked={form.watch("showHomepageNewArrivalSection")}
                          onCheckedChange={(checked) => form.setValue("showHomepageNewArrivalSection", checked)}
                          data-testid="switch-show-homepage-new-arrival-section"
                        />
                      </div>
                    </>
                  )}

                  {!form.watch("isExternalRiderSystemEnabled") ? (
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
                  ) : null}

                  {form.watch("isMultiVendor") && (
                    <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Layers className="h-5 w-5 text-primary" />
                          <div>
                            <Label className="text-base font-semibold">Multi-Vendor Mode</Label>
                            <p className="text-sm text-muted-foreground">
                              Marketplace banners, collections, and homepage layout
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => form.setValue("isMultiVendor", false)}
                          className="gap-2"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          Switch to Single Store
                        </Button>
                      </div>

                      {/* Hero Banner Management */}
                      <div className="space-y-3 pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <Label>Hero Banners for Multi-Vendor Mode</Label>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => navigate("/admin/hero-banners")}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Manage Banners
                          </Button>
                        </div>
                        {multiVendorBanners.length === 0 ? (
                          <div className="text-center py-6 border border-dashed rounded-lg">
                            <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">No banners configured for multi-vendor mode</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate("/admin/hero-banners")}
                            >
                              Create your first banner
                            </Button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {multiVendorBanners.slice(0, 6).map((banner) => (
                              <BannerPreviewCard key={banner.id} banner={banner} />
                            ))}
                          </div>
                        )}
                        {multiVendorBanners.length > 6 && (
                          <p className="text-sm text-muted-foreground text-center">
                            +{multiVendorBanners.length - 6} more banners. <Button variant="ghost" className="p-0 h-auto" onClick={() => navigate("/admin/hero-banners")}>View all</Button>
                          </p>
                        )}
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

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div>
                          <Label>Show "Shop By" Section</Label>
                          <p className="text-xs text-muted-foreground">
                            Toggle visibility of the Shop by Store/Category section on the homepage
                          </p>
                        </div>
                        <Switch
                          checked={form.watch("showShopBySection") !== false}
                          onCheckedChange={(checked) => form.setValue("showShopBySection", checked)}
                        />
                      </div>
                    </div>
                  )}

                  {!form.watch("isMultiVendor") && (
                    <div className="p-4 border rounded-lg bg-muted/50 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Store className="h-5 w-5 text-primary" />
                          <div>
                            <Label className="text-base font-semibold">Single Store Mode</Label>
                            <p className="text-sm text-muted-foreground">
                              Display products from one primary store
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => form.setValue("isMultiVendor", true)}
                          className="gap-2"
                        >
                          <ArrowRightLeft className="h-4 w-4" />
                          Switch to Multi-Vendor
                        </Button>
                      </div>
                      
                      <div className="space-y-2 pt-2 border-t">
                        <Label htmlFor="primaryStoreId">Primary Store</Label>
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
                      {/* Single-Store Banner Preview */}
                      <div className="space-y-3 pt-3 border-t">
                        <div className="flex items-center justify-between">
                          <Label>Hero Banners for Single-Store Mode</Label>
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => navigate("/admin/hero-banners")}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Manage Banners
                          </Button>
                        </div>
                        {singleStoreBanners.length === 0 ? (
                          <div className="text-center py-6 border border-dashed rounded-lg">
                            <ImageIcon className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                            <p className="text-sm text-muted-foreground">No banners configured for single-store mode</p>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => navigate("/admin/hero-banners")}
                            >
                              Create your first banner
                            </Button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {singleStoreBanners.slice(0, 6).map((banner) => (
                              <BannerPreviewCard key={banner.id} banner={banner} />
                            ))}
                          </div>
                        )}
                        {singleStoreBanners.length > 6 && (
                          <p className="text-sm text-muted-foreground text-center">
                            +{singleStoreBanners.length - 6} more banners. <Button variant="ghost" className="p-0 h-auto" onClick={() => navigate("/admin/hero-banners")}>View all</Button>
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t">
                        <div>
                          <Label>Show "Shop By" Section</Label>
                          <p className="text-xs text-muted-foreground">
                            Toggle visibility of the Shop by Category section on the homepage
                          </p>
                        </div>
                        <Switch
                          checked={form.watch("showShopBySection") !== false}
                          onCheckedChange={(checked) => form.setValue("showShopBySection", checked)}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payments" className="space-y-4">
              {(!isElevatedAccess || user?.role !== "super_admin") ? (
                <SensitiveContentGate
                  role={user?.role}
                  isElevated={isElevatedAccess}
                  onUnlock={() => { setPendingTab("payments"); setShowElevatedAuthModal(true); }}
                />
              ) : <>
              {user?.role === "super_admin" && (
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Mail className="h-5 w-5 text-primary" />
                      <CardTitle>Email Delivery</CardTitle>
                    </div>
                    <CardDescription>
                      Update the sender email, app password, and SMTP details used for password reset emails and platform mail delivery.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">SMTP configuration</h4>
                          <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
                            This controls reset-password emails and any other transactional email sent by the platform.
                          </p>
                        </div>
                        <div className="space-y-2 text-right">
                          <div className="text-xs text-muted-foreground">
                            Source: <span className="font-medium">{settings?.smtpUserSource || "none"}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setShowImportSmtpDialog(true)}
                            data-testid="button-import-smtp"
                          >
                            Import from Environment
                          </Button>
                        </div>
                      </div>

                      <AlertDialog open={showImportSmtpDialog} onOpenChange={setShowImportSmtpDialog}>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Import SMTP Settings?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This copies the current SMTP environment values into platform settings so you can manage them in the dashboard.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setShowImportSmtpDialog(false)}>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={async () => {
                                try {
                                  setIsImportingSmtp(true);
                                  await apiRequest("POST", "/api/settings/import-smtp", {});
                                  await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                                  await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
                                  toast({ title: "Imported", description: "SMTP settings have been imported into platform settings." });
                                  setShowImportSmtpDialog(false);
                                } catch (e: any) {
                                  toast({ title: "Import failed", description: e.message || "Failed to import SMTP settings", variant: "destructive" });
                                } finally {
                                  setIsImportingSmtp(false);
                                }
                              }}
                              disabled={isImportingSmtp}
                            >
                              {isImportingSmtp ? "Importing..." : "Import"}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="smtpHost">SMTP Host</Label>
                        <Input id="smtpHost" {...form.register("smtpHost")} placeholder="smtp.gmail.com" data-testid="input-smtp-host" />
                        <p className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.smtpHostSource || "none"}</span></p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpPort">SMTP Port</Label>
                        <Input id="smtpPort" type="number" {...form.register("smtpPort", { valueAsNumber: true })} placeholder="587" data-testid="input-smtp-port" />
                        <p className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.smtpPortSource || "none"}</span></p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpUser">Sender Email</Label>
                        <Input id="smtpUser" type="email" {...form.register("smtpUser")} placeholder="kiyumartofficial@gmail.com" data-testid="input-smtp-user" />
                        <p className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.smtpUserSource || "none"}</span></p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpPass">App Password</Label>
                        <Input id="smtpPass" type="password" {...form.register("smtpPass")} placeholder="********************************" data-testid="input-smtp-pass" />
                        <p className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.smtpPassSource || "none"}</span></p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpFromEmail">From Email</Label>
                        <Input id="smtpFromEmail" type="email" {...form.register("smtpFromEmail")} placeholder="kiyumartofficial@gmail.com" data-testid="input-smtp-from-email" />
                        <p className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.smtpFromEmailSource || "none"}</span></p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="smtpFromName">From Name</Label>
                        <Input id="smtpFromName" {...form.register("smtpFromName")} placeholder="KiyuMart" data-testid="input-smtp-from-name" />
                        <p className="text-xs text-muted-foreground">Source: <span className="font-medium">{settings?.smtpFromNameSource || "none"}</span></p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <Label htmlFor="smtpSecure">Use secure SMTP connection</Label>
                        <p className="text-sm text-muted-foreground">
                          Turn this on for SSL ports like `465`. Leave it off for TLS ports like `587`.
                        </p>
                      </div>
                      <Switch
                        id="smtpSecure"
                        checked={form.watch("smtpSecure") === true}
                        onCheckedChange={(checked) => form.setValue("smtpSecure", checked)}
                        data-testid="switch-smtp-secure"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}

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

                    <CollapsibleDashboardSection
                      title="How Payments Are Handled"
                      summary="Expand to view the full checkout, commission, delivery, and payout-cost explanation."
                      className="border border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                    >
                      <div className="flex items-start gap-3">
                        <Wallet className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                        <div className="space-y-2 text-sm">
                          <p className="text-emerald-800 dark:text-emerald-200">
                            Customers pay the order subtotal, any delivery fee, and the Paystack processing fee at checkout.
                            The processing fee is collected from the customer as the exact Paystack checkout charge and is recorded separately from platform commission.
                          </p>
                          <p className="text-emerald-800 dark:text-emerald-200">
                            Seller commission is charged only on the merchandise amount after coupon discount. It is deducted from
                            the seller&apos;s share during the split before the seller receives funds.
                          </p>
                          <p className="text-emerald-800 dark:text-emerald-200">
                            Delivery fees are handled separately from seller payout. They do not increase the seller&apos;s payable
                            amount. When the internal rider flow is active and a zone delivery fee is charged, that amount is held
                            separately and remains subject to super admin payout approval.
                          </p>
                          <p className="text-emerald-800 dark:text-emerald-200">
                            When the External Rider System is enabled, delivery is arranged manually or through third-party services,
                            and any delivery fee remains separate from seller commission and seller settlement.
                          </p>
                          <p className="text-emerald-800 dark:text-emerald-200">
                            Seller payout transfer costs are tracked separately from checkout fees and commission. Reference Paystack payout costs are GHS 1 for mobile money and GHS 8 for bank transfer.
                          </p>
                        </div>
                      </div>
                    </CollapsibleDashboardSection>

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
                    <Label htmlFor="frontendUrl">Payment Callback URL</Label>
                    <Input
                      id="frontendUrl"
                      type="url"
                      {...form.register("frontendUrl")}
                      placeholder="https://yourstore.com"
                      data-testid="input-frontend-url"
                    />
                    <p className="text-xs text-muted-foreground">
                      Your store's frontend URL used for Paystack payment redirects (e.g., https://mystore.com). Leave empty to use environment variable FRONTEND_URL.
                    </p>
                    {form.formState.errors.frontendUrl && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.frontendUrl.message}
                      </p>
                    )}
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
              </> }

            </TabsContent>

            <TabsContent value="storage" className="space-y-4">
              {(!isElevatedAccess || user?.role !== "super_admin") ? (
                <SensitiveContentGate
                  role={user?.role}
                  isElevated={isElevatedAccess}
                  onUnlock={() => { setPendingTab("storage"); setShowElevatedAuthModal(true); }}
                />
              ) : <>
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

                  {/* Additional Cloudinary Accounts (rotation pool) */}
                  <Card className="mt-2">
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Database className="h-4 w-4 text-primary" />
                        Additional Cloudinary Accounts
                      </CardTitle>
                      <CardDescription>
                        Add extra accounts for round-robin upload rotation — useful when the primary account nears its storage limit. Uploads cycle through all valid accounts automatically.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {(() => {
                        let accounts: Array<{label: string; cloudName: string; apiKey: string; apiSecret: string}> = [];
                        try { accounts = JSON.parse(form.watch("cloudinaryAccounts") || "[]"); } catch {}
                        const removeAccount = (idx: number) => {
                          const updated = accounts.filter((_, i) => i !== idx);
                          form.setValue("cloudinaryAccounts", JSON.stringify(updated), { shouldDirty: true });
                        };
                        return (
                          <div className="space-y-3">
                            {accounts.length === 0 ? (
                              <p className="text-sm text-muted-foreground">No extra accounts configured. Uploads use the primary account above.</p>
                            ) : (
                              <div className="space-y-2">
                                {accounts.map((acc, idx) => (
                                  <div key={idx} className="flex items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                                    <Cloud className="h-4 w-4 text-primary shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate">{acc.label || `Account ${idx + 1}`}</p>
                                      <p className="text-xs text-muted-foreground truncate">{acc.cloudName}</p>
                                    </div>
                                    <Badge variant="outline" className="text-xs">Account {idx + 2}</Badge>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive hover:text-destructive"
                                      onClick={() => removeAccount(idx)}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            )}
                            <details className="group">
                              <summary className="cursor-pointer text-sm font-medium text-primary hover:underline flex items-center gap-1">
                                <Plus className="h-4 w-4" />
                                Add another account
                              </summary>
                              <div className="mt-3 rounded-lg border bg-muted/20 p-4 space-y-3">
                                {["label", "cloudName", "apiKey", "apiSecret"].map((field) => (
                                  <div key={field} className="space-y-1">
                                    <Label htmlFor={`new-cld-${field}`} className="text-xs capitalize">{field === "cloudName" ? "Cloud Name" : field === "apiKey" ? "API Key" : field === "apiSecret" ? "API Secret" : "Label"}</Label>
                                    <Input
                                      id={`new-cld-${field}`}
                                      type={field === "apiSecret" ? "password" : "text"}
                                      placeholder={field === "label" ? "e.g. Account 2" : field === "cloudName" ? "my-cloud-2" : field === "apiKey" ? "123456789" : "••••••••"}
                                      onBlur={(e) => {
                                        const formEl = e.currentTarget.closest("details") as HTMLElement;
                                        if (!formEl) return;
                                        const inputs = formEl.querySelectorAll("input");
                                        const vals: Record<string, string> = {};
                                        inputs.forEach((inp) => vals[inp.id.replace("new-cld-", "")] = inp.value);
                                        if (vals.cloudName && vals.apiKey && vals.apiSecret) {
                                          // Only save when all required fields are filled
                                        }
                                      }}
                                    />
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="default"
                                  className="w-full"
                                  onClick={(e) => {
                                    const details = (e.currentTarget as HTMLElement).closest("details") as HTMLElement;
                                    if (!details) return;
                                    const inputs = details.querySelectorAll<HTMLInputElement>("input");
                                    const vals: Record<string, string> = {};
                                    inputs.forEach((inp) => { vals[inp.id.replace("new-cld-", "")] = inp.value.trim(); });
                                    if (!vals.cloudName || !vals.apiKey || !vals.apiSecret) {
                                      alert("Cloud Name, API Key, and API Secret are required.");
                                      return;
                                    }
                                    const updated = [...accounts, { label: vals.label || `Account ${accounts.length + 2}`, cloudName: vals.cloudName, apiKey: vals.apiKey, apiSecret: vals.apiSecret }];
                                    form.setValue("cloudinaryAccounts", JSON.stringify(updated), { shouldDirty: true });
                                    inputs.forEach((inp) => { inp.value = ""; });
                                  }}
                                >
                                  Add Account
                                </Button>
                              </div>
                            </details>
                          </div>
                        );
                      })()}
                    </CardContent>
                  </Card>

                  {/* Upload controls */}
                  <Card className="mt-2">
                    <CardHeader>
                      <CardTitle className="text-base">Upload Controls</CardTitle>
                      <CardDescription>Limit file sizes and accepted types for all media uploads.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="maxUploadSizeMb">Max Upload Size (MB)</Label>
                        <Input id="maxUploadSizeMb" type="number" min={1} max={100} {...form.register("maxUploadSizeMb")} placeholder="10" />
                        <p className="text-xs text-muted-foreground">Maximum file size per upload. Applies to product images and store media.</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="allowedUploadTypes">Allowed File Types</Label>
                        <Input id="allowedUploadTypes" {...form.register("allowedUploadTypes")} placeholder="jpg,jpeg,png,webp,gif,avif" />
                        <p className="text-xs text-muted-foreground">Comma-separated list of allowed extensions (e.g. jpg,png,webp).</p>
                      </div>
                    </CardContent>
                  </Card>
                </CardContent>
              </Card>
              </> }
            </TabsContent>

            {user?.role === "super_admin" && (
              <TabsContent value="advanced-features" className="space-y-4">
                {!isElevatedAccess ? (
                  <SensitiveContentGate
                    role={user?.role}
                    isElevated={isElevatedAccess}
                    onUnlock={() => { setPendingTab("advanced-features"); setShowElevatedAuthModal(true); }}
                  />
                ) : <>
                <Card>
                  <CardHeader>
                    <CardTitle>Advanced Features</CardTitle>
                    <CardDescription>
                      Super-admin feature flags that change platform behavior without removing the original implementation.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="isExternalRiderSystemEnabled">Enable External Rider System</Label>
                        <p className="text-sm text-muted-foreground">
                          Use manual external delivery workflows instead of the built-in rider dispatch system.
                        </p>
                      </div>
                      <Switch
                        id="isExternalRiderSystemEnabled"
                        checked={form.watch("isExternalRiderSystemEnabled")}
                        onCheckedChange={(checked) => form.setValue("isExternalRiderSystemEnabled", checked)}
                        data-testid="switch-external-rider-system"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="allowSellerBankPayouts">Allow Bank Payouts For Sellers</Label>
                        <p className="text-sm text-muted-foreground">
                          Disable this to force sellers to use mobile money only. Existing bank payout setups stay preserved, but new payout setup and routing will follow the current toggle.
                        </p>
                      </div>
                      <Switch
                        id="allowSellerBankPayouts"
                        checked={form.watch("allowSellerBankPayouts")}
                        onCheckedChange={(checked) => form.setValue("allowSellerBankPayouts", checked)}
                        data-testid="switch-allow-seller-bank-payouts"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="allowSharedVariantColorStock">Show Shared Stock Option For Variants</Label>
                        <p className="text-sm text-muted-foreground">
                          Keep this off to make sellers use separate stock for each size only. Turn it on only if you want sellers to choose one shared stock number for a whole color.
                        </p>
                      </div>
                      <Switch
                        id="allowSharedVariantColorStock"
                        checked={form.watch("allowSharedVariantColorStock")}
                        onCheckedChange={(checked) => form.setValue("allowSharedVariantColorStock", checked)}
                        data-testid="switch-allow-shared-variant-color-stock"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="showCheckoutDeliveryMap">Show Checkout Delivery Map</Label>
                        <p className="text-sm text-muted-foreground">
                          Control whether the live delivery map appears on checkout for customers entering a delivery address.
                        </p>
                      </div>
                      <Switch
                        id="showCheckoutDeliveryMap"
                        checked={form.watch("showCheckoutDeliveryMap")}
                        onCheckedChange={(checked) => form.setValue("showCheckoutDeliveryMap", checked)}
                        data-testid="switch-checkout-delivery-map"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="allowPickupAgentAdminChat">Allow Admin Access To Pickup Agent Support</Label>
                        <p className="text-sm text-muted-foreground">
                          Control whether regular admins can join pickup-agent live support conversations. Super admin access is always preserved.
                        </p>
                      </div>
                      <Switch
                        id="allowPickupAgentAdminChat"
                        checked={form.watch("allowPickupAgentAdminChat")}
                        onCheckedChange={(checked) => form.setValue("allowPickupAgentAdminChat", checked)}
                        data-testid="switch-allow-pickup-agent-admin-chat"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="allowSellerDirectSupportMessages">Allow Direct Seller And Support Messages</Label>
                        <p className="text-sm text-muted-foreground">
                          When this is off, sellers must use the Support page first instead of direct live support messaging.
                        </p>
                      </div>
                      <Switch
                        id="allowSellerDirectSupportMessages"
                        checked={form.watch("allowSellerDirectSupportMessages")}
                        onCheckedChange={(checked) => form.setValue("allowSellerDirectSupportMessages", checked)}
                        data-testid="switch-allow-seller-direct-support-messages"
                      />
                    </div>

                    {/* Invite-only registration */}
                    <div className="flex items-center justify-between p-3 border rounded-lg bg-background">
                      <div className="space-y-0.5 pr-4">
                        <Label htmlFor="inviteOnlyRegistration">Invite-Only Registration</Label>
                        <p className="text-sm text-muted-foreground">When on, new buyer sign-ups are blocked with a message to contact the administrator. Existing accounts are unaffected.</p>
                      </div>
                      <Switch id="inviteOnlyRegistration" checked={form.watch("inviteOnlyRegistration") ?? false} onCheckedChange={(checked) => form.setValue("inviteOnlyRegistration", checked)} />
                    </div>

                    {/* Operational limits */}
                    <div className="grid gap-4 pt-2 sm:grid-cols-2">
                      <div className="space-y-2 rounded-xl border p-4">
                        <Label htmlFor="orderAutoCancelHours">Auto-Cancel Unpaid Orders After (hours)</Label>
                        <Input id="orderAutoCancelHours" type="number" min={0} {...form.register("orderAutoCancelHours")} placeholder="0" />
                        <p className="text-xs text-muted-foreground">Set to 0 to disable. Orders still in "pending" payment status after this many hours are automatically cancelled.</p>
                      </div>
                      <div className="space-y-2 rounded-xl border p-4">
                        <Label htmlFor="maxProductsPerSeller">Hard Cap: Max Products Per Seller</Label>
                        <Input id="maxProductsPerSeller" type="number" min={0} {...form.register("maxProductsPerSeller")} placeholder="0" />
                        <p className="text-xs text-muted-foreground">Absolute ceiling for all sellers including premium. Set to 0 for no ceiling.</p>
                      </div>
                    </div>

                    {/* Monetisation: Free-tier / Premium listing limits */}
                    <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900/40 dark:bg-yellow-950/20">
                      <div className="mb-3 flex items-center gap-2">
                        <span className="text-lg">⭐</span>
                        <div>
                          <p className="font-semibold text-sm">Premium Seller Monetisation</p>
                          <p className="text-xs text-muted-foreground">Free-tier sellers are capped at this many listings. Sellers you mark as Premium can list without restriction (up to the hard cap above).</p>
                        </div>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="freeTierProductLimit">Free-Tier Listing Limit</Label>
                          <Input id="freeTierProductLimit" type="number" min={0} {...form.register("freeTierProductLimit")} placeholder="20" />
                          <p className="text-xs text-muted-foreground">Set to 0 to disable the free-tier cap (all sellers unlimited). Default: 20.</p>
                        </div>
                        <div className="space-y-2 flex flex-col justify-center p-3 rounded-lg bg-background border text-sm text-muted-foreground">
                          <p className="font-medium text-foreground text-xs">How it works</p>
                          <ul className="list-disc list-inside space-y-1 text-xs">
                            <li>Free sellers hit this limit → upgrade prompt shown</li>
                            <li>Mark a seller as Premium in Users → unlimited listings</li>
                            <li>Hard cap above overrides premium if set</li>
                          </ul>
                        </div>
                      </div>

                      {/* Seller upgrade plan pricing */}
                      <div className="pt-2">
                        <p className="text-sm font-medium mb-3">Seller Upgrade Plan Pricing (GHS)</p>
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                          <div className="space-y-2 rounded-xl border p-4">
                            <Label htmlFor="upgradePlanAPrice">Plan A — Price (GHS)</Label>
                            <Input id="upgradePlanAPrice" type="number" min={0} step="0.01" {...form.register("upgradePlanAPrice")} placeholder="15" />
                            <p className="text-xs text-muted-foreground">One-time fee for extra slots.</p>
                          </div>
                          <div className="space-y-2 rounded-xl border p-4">
                            <Label htmlFor="upgradePlanASlots">Plan A — Extra Slots</Label>
                            <Input id="upgradePlanASlots" type="number" min={1} {...form.register("upgradePlanASlots")} placeholder="10" />
                            <p className="text-xs text-muted-foreground">How many additional listing slots Plan A grants.</p>
                          </div>
                          <div className="space-y-2 rounded-xl border p-4">
                            <Label htmlFor="upgradePlanBPrice">Plan B — Monthly Price (GHS)</Label>
                            <Input id="upgradePlanBPrice" type="number" min={0} step="0.01" {...form.register("upgradePlanBPrice")} placeholder="40" />
                            <p className="text-xs text-muted-foreground">Monthly unlimited listings. Requires renewal each month.</p>
                          </div>
                          <div className="space-y-2 rounded-xl border p-4">
                            <Label htmlFor="upgradePlanCPrice">Plan C — One-Time Price (GHS)</Label>
                            <Input id="upgradePlanCPrice" type="number" min={0} step="0.01" {...form.register("upgradePlanCPrice")} placeholder="100" />
                            <p className="text-xs text-muted-foreground">One-time fee for unlimited listings forever.</p>
                          </div>
                          <div className="space-y-2 rounded-xl border p-4">
                            <Label htmlFor="deliveryFeeCommission">Delivery Commission Added (GHS)</Label>
                            <Input id="deliveryFeeCommission" type="number" min={0} step="0.01" {...form.register("deliveryFeeCommission")} placeholder="0" />
                            <p className="text-xs text-muted-foreground">Added to the zone base fee at checkout when internal rider mode is on.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Referral Programme Configuration */}
                <Card className="border-border/70 bg-card shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Referral Programme</CardTitle>
                    <CardDescription>Configure thresholds, rewards, and which modes the referral programme is active in.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    {/* Master toggle */}
                    <div className="flex items-center justify-between rounded-xl border p-4">
                      <div>
                        <p className="font-medium text-sm">Enable Referral Programme</p>
                        <p className="text-xs text-muted-foreground">Activates the referral system across the platform.</p>
                      </div>
                      <FormField
                        control={form.control}
                        name="referralEnabled"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>

                    {/* Per-mode toggles */}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="flex items-center justify-between rounded-xl border p-4">
                        <div>
                          <p className="text-sm font-medium">Single-Store Mode</p>
                          <p className="text-xs text-muted-foreground">Referrals active in single-store mode.</p>
                        </div>
                        <FormField
                          control={form.control}
                          name="referralEnabledSingleStore"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex items-center justify-between rounded-xl border p-4">
                        <div>
                          <p className="text-sm font-medium">Multi-Vendor Mode</p>
                          <p className="text-xs text-muted-foreground">Referrals active in multi-vendor mode.</p>
                        </div>
                        <FormField
                          control={form.control}
                          name="referralEnabledMultiVendor"
                          render={({ field }) => (
                            <FormItem>
                              <FormControl>
                                <Switch checked={!!field.value} onCheckedChange={field.onChange} />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Thresholds & reward values */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-2 rounded-xl border p-4">
                        <Label htmlFor="referralCustomerThreshold">Customer Threshold</Label>
                        <Input id="referralCustomerThreshold" type="number" min={1} {...form.register("referralCustomerThreshold")} placeholder="5" />
                        <p className="text-xs text-muted-foreground">Completed purchases needed before a buyer earns a reward.</p>
                      </div>
                      <div className="space-y-2 rounded-xl border p-4">
                        <Label htmlFor="referralRewardPercent">Buyer Reward (%)</Label>
                        <Input id="referralRewardPercent" type="number" min={0} max={100} step="0.01" {...form.register("referralRewardPercent")} placeholder="10" />
                        <p className="text-xs text-muted-foreground">Discount percentage issued to the buyer on their next order.</p>
                      </div>
                      <div className="space-y-2 rounded-xl border p-4">
                        <Label htmlFor="referralSellerThreshold">Seller Threshold</Label>
                        <Input id="referralSellerThreshold" type="number" min={1} {...form.register("referralSellerThreshold")} placeholder="10" />
                        <p className="text-xs text-muted-foreground">Completed purchases needed before a seller earns free promotion.</p>
                      </div>
                      <div className="space-y-2 rounded-xl border p-4">
                        <Label htmlFor="referralSellerPromoHours">Seller Promo Duration (hours)</Label>
                        <Input id="referralSellerPromoHours" type="number" min={1} {...form.register("referralSellerPromoHours")} placeholder="24" />
                        <p className="text-xs text-muted-foreground">Hours of free store/product promotion a seller earns per reward.</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Referral Report */}
                <ReferralReportSection />
                </> }
              </TabsContent>
            )}

            <TabsContent value="map" className="space-y-4">
              {(!isElevatedAccess || user?.role !== "super_admin") ? (
                <SensitiveContentGate
                  role={user?.role}
                  isElevated={isElevatedAccess}
                  onUnlock={() => { setPendingTab("map"); setShowElevatedAuthModal(true); }}
                />
              ) : <>
              <Card>
                <CardHeader>
                  <CardTitle>Map Configuration</CardTitle>
                  <CardDescription>
                    Configure Mapbox runtime values used by tracking, geocoding, and fleet maps.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Runtime Map Source</p>
                        <p className="text-xs text-blue-700 dark:text-blue-300">
                          Source: <span className="font-medium">{settings?.mapboxPublicTokenSource || "none"}</span>
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowImportMapDialog(true)}
                        data-testid="button-import-map"
                      >
                        Import from Environment
                      </Button>
                    </div>

                    <AlertDialog open={showImportMapDialog} onOpenChange={setShowImportMapDialog}>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Import Map Settings?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This syncs Mapbox token/style/version from environment variables into Platform Settings.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel onClick={() => setShowImportMapDialog(false)}>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={async () => {
                              try {
                                setIsImportingMap(true);
                                await apiRequest("POST", "/api/settings/import-map", {});
                                await queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
                                await queryClient.refetchQueries({ queryKey: ["/api/settings"] });
                                toast({ title: "Imported", description: "Map environment settings have been synced." });
                                setShowImportMapDialog(false);
                              } catch (e: any) {
                                toast({ title: "Import failed", description: e.message || "Failed to import map settings", variant: "destructive" });
                              } finally {
                                setIsImportingMap(false);
                              }
                            }}
                            disabled={isImportingMap}
                          >
                            {isImportingMap ? "Importing..." : "Import"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-100">
                    <p className="font-medium">How to get Mapbox keys</p>
                    <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs">
                      <li>Sign in to your Mapbox account dashboard.</li>
                      <li>Go to Account and open the Access Tokens page.</li>
                      <li>Create or copy a public token that starts with <code>pk.</code>.</li>
                      <li>Use that token in <code>Mapbox Public Token</code> below and save settings.</li>
                      <li>If map is already open, click <code>Retry Mapbox</code> to reload fresh runtime config.</li>
                    </ol>
                  </div>

                  <div className="rounded-lg border border-muted bg-muted/30 p-4 text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">Field purpose guide</p>
                    <p className="mt-1"><strong>Mapbox Public Token:</strong> Authenticates map tiles, geocoding, and directions requests in the browser.</p>
                    <p className="mt-1"><strong>Mapbox Style URL:</strong> Controls visual style of the map (colors, roads, labels, theme).</p>
                    <p className="mt-1"><strong>Mapbox GL JS Version:</strong> Controls which Mapbox GL script version is loaded at runtime.</p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Label htmlFor="mapboxPublicToken">Mapbox Public Token</Label>
                        <p className="text-xs text-muted-foreground">
                          Public key used by map rendering and geocoding (`pk...`).
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Source: <span className="font-medium">{settings?.mapboxPublicTokenSource || "none"}</span>
                      </p>
                    </div>
                    <Input
                      id="mapboxPublicToken"
                      {...form.register("mapboxPublicToken")}
                      placeholder="pk.xxxxxxxxxxxxxxxxxxxxx"
                      data-testid="input-mapbox-public-token"
                    />
                    <p className="text-xs text-muted-foreground">
                      Mapbox access token is missing. Set VITE_MAPBOX_ACCESS_TOKEN or MAPBOX_PUBLIC_TOKEN.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Label htmlFor="mapboxStyleUrl">Mapbox Style URL</Label>
                        <p className="text-xs text-muted-foreground">
                          Example: `mapbox://styles/mapbox/navigation-night-v1`
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Source: <span className="font-medium">{settings?.mapboxStyleUrlSource || "none"}</span>
                      </p>
                    </div>
                    <Select
                      value={selectedMapboxStylePreset}
                      onValueChange={(value) => {
                        if (value === "__custom__") return;
                        form.setValue("mapboxStyleUrl", value, { shouldDirty: true, shouldTouch: true });
                      }}
                    >
                      <SelectTrigger id="mapboxStylePreset" data-testid="select-mapbox-style-preset">
                        <SelectValue placeholder="Choose a map theme" />
                      </SelectTrigger>
                      <SelectContent>
                        {MAPBOX_STYLE_PRESETS.map((preset) => (
                          <SelectItem key={preset.value} value={preset.value}>
                            {preset.label}
                          </SelectItem>
                        ))}
                        <SelectItem value="__custom__">Custom URL (manual input)</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      id="mapboxStyleUrl"
                      {...form.register("mapboxStyleUrl")}
                      placeholder="mapbox://styles/mapbox/navigation-night-v1"
                      data-testid="input-mapbox-style-url"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <Label htmlFor="mapboxGlVersion">Mapbox GL JS Version</Label>
                        <p className="text-xs text-muted-foreground">
                          Version used for loading Mapbox GL script at runtime.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Source: <span className="font-medium">{settings?.mapboxGlVersionSource || "none"}</span>
                      </p>
                    </div>
                    <Input
                      id="mapboxGlVersion"
                      {...form.register("mapboxGlVersion")}
                      placeholder="v3.4.0"
                      data-testid="input-mapbox-gl-version"
                    />
                  </div>

                </CardContent>
              </Card>
              </> }
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

            {user?.role !== "super_admin" && (
              <>
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
                            </SelectContent>
                          </Select>
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
              </>
            )}

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
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Hero Banner Ad
                          </h4>
                          <Switch
                            id="heroBannerEnabled"
                            checked={form.watch("heroBannerEnabled")}
                            onCheckedChange={(checked) => form.setValue("heroBannerEnabled", checked)}
                            data-testid="switch-hero-enabled"
                          />
                        </div>
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
                          <Label htmlFor="heroBannerAdUrl">Link (Optional)</Label>
                          <Input
                            id="heroBannerAdUrl"
                            {...form.register("heroBannerAdUrl")}
                            placeholder="https://example.com or /category/abayas or mailto:hello@domain.com"
                            data-testid="input-hero-ad-url"
                          />
                          <p className="text-xs text-muted-foreground">Supports absolute URLs, relative paths (starting with /), anchors (starting with #), and protocol links like mailto: and tel:</p>
                        </div>
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Sidebar Ad
                          </h4>
                          <Switch
                            id="sidebarAdEnabled"
                            checked={form.watch("sidebarAdEnabled")}
                            onCheckedChange={(checked) => form.setValue("sidebarAdEnabled", checked)}
                            data-testid="switch-sidebar-enabled"
                          />
                        </div>
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
                          <Label htmlFor="sidebarAdUrl">Link (Optional)</Label>
                          <Input
                            id="sidebarAdUrl"
                            {...form.register("sidebarAdUrl")}
                            placeholder="https://example.com or /stores/123 or mailto:ads@domain.com"
                            data-testid="input-sidebar-ad-url"
                          />
                          <p className="text-xs text-muted-foreground">Supports absolute URLs, relative paths, anchors, and protocol links.</p>
                        </div>
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Product Page Ad
                          </h4>
                          <Switch
                            id="productPageAdEnabled"
                            checked={form.watch("productPageAdEnabled")}
                            onCheckedChange={(checked) => form.setValue("productPageAdEnabled", checked)}
                            data-testid="switch-product-enabled"
                          />
                        </div>
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
                          <Label htmlFor="productPageAdUrl">Link (Optional)</Label>
                          <Input
                            id="productPageAdUrl"
                            {...form.register("productPageAdUrl")}
                            placeholder="https://example.com or /product/123 or tel:+233123456789"
                            data-testid="input-product-ad-url"
                          />
                          <p className="text-xs text-muted-foreground">Supports absolute URLs, relative paths, anchors, and protocol links.</p>
                        </div>
                      </div>

                      <div className="space-y-4 p-4 border rounded-lg">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold flex items-center gap-2">
                            <ImageIcon className="h-4 w-4" />
                            Footer Ad
                          </h4>
                          <Switch
                            id="footerAdEnabled"
                            checked={form.watch("footerAdEnabled")}
                            onCheckedChange={(checked) => form.setValue("footerAdEnabled", checked)}
                            data-testid="switch-footer-enabled"
                          />
                        </div>
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
                          <Label htmlFor="footerAdUrl">Link (Optional)</Label>
                          <Input
                            id="footerAdUrl"
                            {...form.register("footerAdUrl")}
                            placeholder="https://example.com or /contact or #newsletter"
                            data-testid="input-footer-ad-url"
                          />
                          <p className="text-xs text-muted-foreground">Supports absolute URLs, relative paths, anchors, and protocol links.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Footer Management Tab */}
            <TabsContent value="footer" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Footer Management</CardTitle>
                      <CardDescription>
                        Manage all footer sections, links, and pages. Changes apply globally across the site based on store mode.
                      </CardDescription>
                    </div>
                    <Dialog open={footerDialogOpen} onOpenChange={setFooterDialogOpen}>
                      <DialogTrigger asChild>
                        <Button onClick={() => { setEditingFooterPage(null); footerForm.reset({ title: "", slug: "", content: "", url: "", group: "general", storeMode: "both", icon: "", displayOrder: footerPages.length, isActive: true, openInNewTab: false }); }} data-testid="button-add-footer-page">
                          <Plus className="mr-2 h-4 w-4" />
                          Add Footer Item
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>{editingFooterPage ? "Edit Footer Item" : "Create Footer Item"}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={footerForm.handleSubmit(handleFooterSubmit)} className="space-y-4">
                          <div className="space-y-2">
                            <Label htmlFor="footerTitle">Title</Label>
                            <Input id="footerTitle" {...footerForm.register("title")} onChange={(e) => { footerForm.setValue("title", e.target.value); handleFooterTitleChange(e.target.value); }} placeholder="e.g., Returns & Refunds" data-testid="input-footer-title" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="footerSlug">Slug (URL)</Label>
                            <Input id="footerSlug" {...footerForm.register("slug")} placeholder="e.g., returns-refunds" data-testid="input-footer-slug" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Footer Section</Label>
                              <Select value={footerForm.watch("group")} onValueChange={(v) => footerForm.setValue("group", v)}>
                                <SelectTrigger data-testid="select-footer-group"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {FOOTER_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Store Mode</Label>
                              <Select value={footerForm.watch("storeMode")} onValueChange={(v) => footerForm.setValue("storeMode", v)}>
                                <SelectTrigger data-testid="select-footer-store-mode"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {STORE_MODES_FOOTER.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">Controls which storefront mode shows this link</p>
                            </div>
                          </div>
                          {/* Icon Picker - only shown for Trust Bar items */}
                          {footerForm.watch("group") === "trust_bar" && (
                            <div className="space-y-2">
                              <Label>Trust Bar Icon</Label>
                              <p className="text-xs text-muted-foreground mb-2">Select an icon to display next to this trust bar item</p>
                              <div className="grid grid-cols-8 sm:grid-cols-10 gap-1.5 max-h-[200px] overflow-y-auto border rounded-lg p-3 bg-muted/20">
                                {TRUST_BAR_ICONS.map((iconItem) => {
                                  const IconComp = iconItem.icon;
                                  const isSelected = footerForm.watch("icon") === iconItem.value;
                                  return (
                                    <button
                                      key={iconItem.value}
                                      type="button"
                                      title={iconItem.label}
                                      onClick={() => footerForm.setValue("icon", isSelected ? "" : iconItem.value)}
                                      className={`flex items-center justify-center w-9 h-9 rounded-md transition-all ${isSelected ? "bg-primary text-white ring-2 ring-primary ring-offset-1 scale-110" : "bg-background hover:bg-muted border border-border hover:border-primary/50"}`}
                                    >
                                      <IconComp className="h-4 w-4" />
                                    </button>
                                  );
                                })}
                              </div>
                              {footerForm.watch("icon") && (
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-muted-foreground">Selected:</span>
                                  <Badge variant="secondary" className="gap-1">
                                    {(() => { const found = TRUST_BAR_ICONS.find(i => i.value === footerForm.watch("icon")); const IC = found?.icon; return IC ? <><IC className="h-3 w-3" />{found?.label}</> : footerForm.watch("icon"); })()}
                                  </Badge>
                                  <Button type="button" variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => footerForm.setValue("icon", "")}>Clear</Button>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="space-y-2">
                            <Label htmlFor="footerUrl">External URL (optional)</Label>
                            <Input id="footerUrl" {...footerForm.register("url")} placeholder="https://... (leave empty for internal page)" data-testid="input-footer-url" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="footerContent">Page Content (HTML)</Label>
                            <Textarea id="footerContent" {...footerForm.register("content")} rows={6} placeholder="Enter page content..." data-testid="textarea-footer-content" />
                          </div>
                          <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label htmlFor="footerOrder">Order</Label>
                              <Input id="footerOrder" type="number" {...footerForm.register("displayOrder", { valueAsNumber: true })} data-testid="input-footer-order" />
                            </div>
                            <div className="space-y-2 flex flex-col justify-end">
                              <Label>Visible</Label>
                              <div className="flex items-center gap-2">
                                <Switch checked={footerForm.watch("isActive")} onCheckedChange={(v) => footerForm.setValue("isActive", v)} data-testid="switch-footer-active" />
                                <span className="text-sm">{footerForm.watch("isActive") ? "Yes" : "No"}</span>
                              </div>
                            </div>
                            <div className="space-y-2 flex flex-col justify-end">
                              <Label>New Tab</Label>
                              <div className="flex items-center gap-2">
                                <Switch checked={footerForm.watch("openInNewTab")} onCheckedChange={(v) => footerForm.setValue("openInNewTab", v)} data-testid="switch-footer-newtab" />
                                <span className="text-sm">{footerForm.watch("openInNewTab") ? "Yes" : "No"}</span>
                              </div>
                            </div>
                          </div>
                          <DialogFooter>
                            <Button type="submit" disabled={createFooterMutation.isPending || updateFooterMutation.isPending} data-testid="button-save-footer">
                              {(createFooterMutation.isPending || updateFooterMutation.isPending) ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : editingFooterPage ? "Update" : "Create"}
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Filters */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Store Mode:</span>
                      <Select value={activeFooterModeFilter} onValueChange={setFooterStoreModeFilter}>
                        <SelectTrigger className="w-[180px]" data-testid="select-footer-mode-filter"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="single">Single Store</SelectItem>
                          <SelectItem value="multivendor">Multi-Vendor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Section:</span>
                      <Select value={footerGroupFilter} onValueChange={setFooterGroupFilter}>
                        <SelectTrigger className="w-[200px]" data-testid="select-footer-section-filter"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Sections</SelectItem>
                          {FOOTER_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Badge variant="outline" className="ml-auto">
                      {filteredFooterPages.length} of {footerPages.length} items
                    </Badge>
                  </div>

                  {/* Current mode indicator */}
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
                    <Store className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Current store mode:</span>
                    <Badge variant="outline" className={settings?.isMultiVendor ? "border-purple-500 text-purple-500" : "border-blue-500 text-blue-500"}>
                      {settings?.isMultiVendor ? "Multi-Vendor" : "Single Store"}
                    </Badge>
                  </div>

                  {/* Footer items grouped by section */}
                  {footerPagesLoading ? (
                    <div className="text-center py-8"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></div>
                  ) : Object.keys(groupedFooterPages).length > 0 ? (
                    Object.entries(groupedFooterPages)
                      .sort(([a], [b]) => {
                        const order = FOOTER_GROUPS.map(g => g.value);
                        return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
                      })
                      .map(([group, gPages]) => (
                        <div key={group} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold">{getFooterGroupLabel(group)}</h4>
                            <Badge variant="secondary" className="text-xs">{gPages.length}</Badge>
                          </div>
                          {gPages.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map((page) => (
                            <div key={page.id} className={`flex items-center justify-between p-3 rounded-lg border ${!page.isActive ? 'opacity-60' : ''}`} data-testid={`footer-item-${page.id}`}>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{page.title}</span>
                                  {page.isActive ? <Badge variant="default" className="text-[10px] h-5">Active</Badge> : <Badge variant="secondary" className="text-[10px] h-5">Hidden</Badge>}
                                  <Badge variant="outline" className={`text-[10px] h-5 ${getFooterStoreModeBadgeClass((page as any).storeMode || 'both')}`}>
                                    {getFooterStoreModeLabel((page as any).storeMode || 'both')}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">{page.url || `/page/${page.slug}`} &bull; Order: {page.displayOrder}</p>
                              </div>
                              <div className="flex gap-1 ml-2 shrink-0">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleFooterVisibility.mutate({ id: page.id, isActive: !page.isActive })}>
                                  {page.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditFooter(page)}>
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => { if (confirm("Delete this footer item?")) deleteFooterMutation.mutate(page.id); }}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ))
                  ) : (
                    <div className="text-center py-8 text-muted-foreground" data-testid="footer-empty-state">
                      {footerPages.length === 0 ? "No footer items yet. Click \"Add Footer Item\" to create one." : "No items match the current filters."}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security Keys Tab — super_admin only, gated */}
            {user?.role === "super_admin" && (
              <TabsContent value="security" className="space-y-4">
                {!isElevatedAccess ? (
                  <SensitiveContentGate
                    role={user?.role}
                    isElevated={isElevatedAccess}
                    onUnlock={() => { setPendingTab("security"); setShowElevatedAuthModal(true); }}
                  />
                ) : <>
                  {/* Card 1: Encryption Key */}
                  <Card className="border-amber-200/60 dark:border-amber-700/40">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Key className="h-5 w-5 text-amber-500" />
                        Encryption Key Management
                      </CardTitle>
                      <CardDescription>
                        Manage the <code className="rounded bg-muted px-1 py-0.5 text-xs">SETTINGS_ENCRYPTION_KEY</code> used to encrypt sensitive credentials stored in the database (SMTP password, Paystack secret key, Cloudinary API secret).
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      {/* Server status */}
                      <div className={`flex items-center gap-3 rounded-lg border p-4 ${encKeyStatus?.isSet ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/20" : "border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20"}`}>
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${encKeyStatus?.isSet ? "bg-green-100 dark:bg-green-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                          {encKeyStatus?.isSet
                            ? <ShieldCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                            : <Shield className="h-5 w-5 text-amber-500" />}
                        </div>
                        <div>
                          <p className={`font-semibold text-sm ${encKeyStatus?.isSet ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400"}`}>
                            {encKeyStatus?.isSet ? `Key active on server (${encKeyStatus.keyLength} characters)` : "Key not set on server"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {encKeyStatus?.isSet
                              ? "Sensitive fields are being encrypted at rest."
                              : "Without this key, sensitive fields are stored as plaintext. Use the Render push below to activate encryption."}
                          </p>
                        </div>
                      </div>

                      {/* Key input + generate */}
                      <div className="space-y-2">
                        <Label>Encryption Key Value</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              type={showEncryptionKey ? "text" : "password"}
                              value={encryptionKeyInput}
                              onChange={(e) => setEncryptionKeyInput(e.target.value)}
                              placeholder="Paste your key or generate one below"
                              className="pr-10 font-mono text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => setShowEncryptionKey(v => !v)}
                              className="absolute inset-y-0 right-2 flex items-center text-muted-foreground hover:text-foreground"
                            >
                              {showEncryptionKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              if (encryptionKeyInput) {
                                navigator.clipboard.writeText(encryptionKeyInput);
                                toast({ title: "Copied", description: "Encryption key copied to clipboard." });
                              }
                            }}
                            disabled={!encryptionKeyInput}
                          >
                            Copy
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">Minimum 32 characters. Store this key safely — losing it means encrypted credentials cannot be decrypted.</p>
                      </div>

                      <Button type="button" variant="outline" onClick={generateEncryptionKey} className="gap-2">
                        <RefreshCcw className="h-4 w-4" />
                        Generate New Secure Key
                      </Button>
                    </CardContent>
                  </Card>

                  {/* Card 2: Push to Render */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        Push to Render
                      </CardTitle>
                      <CardDescription>
                        Automatically push <code className="rounded bg-muted px-1 py-0.5 text-xs">SETTINGS_ENCRYPTION_KEY</code> to your Render service and trigger a redeploy. Your Render API key is used only for this request and is never stored.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800/50 dark:bg-blue-950/20">
                        <p className="text-sm text-blue-700 dark:text-blue-300">
                          <strong>How to get your Render credentials:</strong><br />
                          • <strong>API Key:</strong> Render Dashboard → Account Settings → API Keys → Create API Key<br />
                          • <strong>Service ID:</strong> Open your backend service on Render → the ID is in the URL: <code className="text-xs">dashboard.render.com/web/<em>srv-xxxxxxxx</em></code>
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label>Render API Key</Label>
                        <Input
                          type="password"
                          value={renderApiKeyInput}
                          onChange={(e) => setRenderApiKeyInput(e.target.value)}
                          placeholder="rnd_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="font-mono text-sm"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Render Service ID</Label>
                        <Input
                          type="text"
                          value={renderServiceIdInput}
                          onChange={(e) => setRenderServiceIdInput(e.target.value)}
                          placeholder="srv-xxxxxxxxxxxxxxxxxxxxxxxx"
                          className="font-mono text-sm"
                        />
                      </div>

                      {renderPushResult && (
                        <div className={`flex items-start gap-3 rounded-lg border p-4 ${renderPushResult.success ? "border-green-200 bg-green-50 dark:border-green-800/50 dark:bg-green-950/20" : "border-red-200 bg-red-50 dark:border-red-800/50 dark:bg-red-950/20"}`}>
                          {renderPushResult.success
                            ? <CheckCircle className="h-5 w-5 shrink-0 text-green-600 dark:text-green-400 mt-0.5" />
                            : <Shield className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />}
                          <p className={`text-sm ${renderPushResult.success ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                            {renderPushResult.message}
                          </p>
                        </div>
                      )}

                      <Button
                        type="button"
                        onClick={handlePushToRender}
                        disabled={isPushingToRender || !renderApiKeyInput.trim() || !renderServiceIdInput.trim() || !encryptionKeyInput.trim()}
                        className="w-full gap-2"
                      >
                        {isPushingToRender
                          ? <><Loader2 className="h-4 w-4 animate-spin" /> Pushing to Render...</>
                          : <><HardDrive className="h-4 w-4" /> Push Key to Render & Redeploy</>}
                      </Button>
                    </CardContent>
                  </Card>
                </> }
              </TabsContent>
            )}

            {/* Analytics Integrations Tab */}
            {user?.role === "super_admin" && (
              <TabsContent value="analytics-integrations" className="space-y-4">
                {!isElevatedAccess ? (
                  <SensitiveContentGate role={user?.role} isElevated={isElevatedAccess} onUnlock={() => { setPendingTab("analytics-integrations"); setShowElevatedAuthModal(true); }} />
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><BarChart2 className="h-5 w-5 text-primary" /> Analytics Integrations</CardTitle>
                        <CardDescription>Connect free analytics services. IDs are injected into the frontend automatically — no code changes needed.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* GA4 */}
                        <div className="space-y-3 rounded-xl border p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                              <BarChart className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Google Analytics 4 (GA4)</p>
                              <p className="text-xs text-muted-foreground">Free — tracks page views, users, events</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="googleAnalyticsId">Measurement ID</Label>
                            <Input id="googleAnalyticsId" {...form.register("googleAnalyticsId")} placeholder="G-XXXXXXXXXX" className="font-mono text-sm" />
                            <p className="text-xs text-muted-foreground">Find this in Google Analytics → Admin → Data Streams → your stream → Measurement ID. Auto-injected on storefront.</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="ga4PropertyId">GA4 Property ID <span className="text-muted-foreground">(for in-dashboard reports)</span></Label>
                            <Input id="ga4PropertyId" {...form.register("ga4PropertyId")} placeholder="123456789" className="font-mono text-sm" />
                            <p className="text-xs text-muted-foreground">Numeric property ID — Google Analytics → Admin → Property Settings → Property ID</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="googleCredentialsJson">Google Service Account Credentials JSON <span className="text-muted-foreground">(for in-dashboard reports)</span></Label>
                            <textarea
                              id="googleCredentialsJson"
                              {...form.register("googleCredentialsJson")}
                              placeholder={'{"type":"service_account","client_email":"...","private_key":"..."}'}
                              className="w-full font-mono text-xs rounded-md border border-input bg-background px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                            <p className="text-xs text-muted-foreground">Service account JSON from Google Cloud Console. Grant Viewer access to GA4 property. Paste the full JSON here.</p>
                          </div>
                        </div>
                        {/* Microsoft Clarity */}
                        <div className="space-y-3 rounded-xl border p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                              <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Microsoft Clarity</p>
                              <p className="text-xs text-muted-foreground">Free — heatmaps, session recordings, click maps</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="microsoftClarityId">Project ID</Label>
                            <Input id="microsoftClarityId" {...form.register("microsoftClarityId")} placeholder="xxxxxxxxxx" className="font-mono text-sm" />
                            <p className="text-xs text-muted-foreground">Find this in clarity.microsoft.com → your project → Settings → Project ID</p>
                          </div>
                        </div>
                        {/* Sentry */}
                        <div className="space-y-3 rounded-xl border p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30">
                              <ShieldCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Sentry Error Tracking</p>
                              <p className="text-xs text-muted-foreground">Free tier: 5,000 errors/month — catches server crashes and frontend errors</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sentryDsn">Sentry DSN</Label>
                            <Input id="sentryDsn" {...form.register("sentryDsn")} placeholder="https://xxxxxxxx@oXXXXXX.ingest.sentry.io/XXXXXXX" className="font-mono text-sm" />
                            <p className="text-xs text-muted-foreground">Project Settings → SDK Setup → DSN. Activates SDK error capture (requires server restart).</p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="sentryAuthToken">Sentry Auth Token <span className="text-muted-foreground">(for in-dashboard issues)</span></Label>
                            <Input id="sentryAuthToken" {...form.register("sentryAuthToken")} placeholder="sntrys_..." className="font-mono text-sm" type="password" />
                            <p className="text-xs text-muted-foreground">Sentry → User Settings → Auth Tokens → Create token with <code className="bg-muted px-1 rounded">project:read</code> scope.</p>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label htmlFor="sentryOrg">Organisation Slug</Label>
                              <Input id="sentryOrg" {...form.register("sentryOrg")} placeholder="my-org" className="font-mono text-sm" />
                              <p className="text-xs text-muted-foreground">Found in Sentry URL: sentry.io/organizations/<strong>slug</strong>/</p>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="sentryProject">Project Slug</Label>
                              <Input id="sentryProject" {...form.register("sentryProject")} placeholder="my-project" className="font-mono text-sm" />
                              <p className="text-xs text-muted-foreground">Found in Sentry → Project Settings → General → Name</p>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/20">
                          <p className="text-xs text-amber-700 dark:text-amber-400">GA4 Measurement ID and Clarity inject automatically after saving — no restart needed. Sentry DSN requires a server restart. GA4 Property ID + Service Account JSON and Sentry Auth Token + Org + Project enable the in-dashboard reports under Tracking & Analytics and Error Monitoring.</p>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            )}

            {/* Hosting Tab */}
            {user?.role === "super_admin" && (
              <TabsContent value="hosting" className="space-y-4">
                {!isElevatedAccess ? (
                  <SensitiveContentGate role={user?.role} isElevated={isElevatedAccess} onUnlock={() => { setPendingTab("hosting"); setShowElevatedAuthModal(true); }} />
                ) : (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2"><Server className="h-5 w-5 text-primary" /> Hosting & Deployment</CardTitle>
                        <CardDescription>Configure your frontend URL and trigger Render redeployments directly from the dashboard.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-6">
                        {/* Frontend URL */}
                        <div className="space-y-2">
                          <Label htmlFor="frontendUrl-hosting">Frontend URL (Netlify)</Label>
                          <Input id="frontendUrl-hosting" {...form.register("frontendUrl")} placeholder="https://your-site.netlify.app" className="font-mono text-sm" />
                          <p className="text-xs text-muted-foreground">Used for Paystack payment redirect callbacks and CORS. Must match your Netlify domain exactly.</p>
                        </div>

                        {/* Deploy Hook */}
                        <div className="space-y-3 rounded-xl border p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                              <Zap className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <p className="font-semibold text-sm">Render Deploy Hook</p>
                              <p className="text-xs text-muted-foreground">Trigger a backend redeploy without leaving the dashboard</p>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="renderDeployHookUrl">Deploy Hook URL</Label>
                            <Input id="renderDeployHookUrl" {...form.register("renderDeployHookUrl")} placeholder="https://api.render.com/deploy/srv-xxxxxxxx?key=xxxxxxxx" className="font-mono text-sm" type="password" />
                            <p className="text-xs text-muted-foreground">Render Dashboard → your service → Settings → Deploy Hook → Copy URL. Stored encrypted in DB.</p>
                          </div>
                          <Button type="button" variant="outline" className="gap-2" onClick={handleTriggerDeploy} disabled={isTriggering || !form.watch("renderDeployHookUrl")}>
                            {isTriggering ? <><Loader2 className="h-4 w-4 animate-spin" /> Triggering...</> : <><Zap className="h-4 w-4" /> Trigger Redeploy Now</>}
                          </Button>
                        </div>

                        {/* Backend info */}
                        <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
                          <p className="text-sm font-semibold">Live Backend Info</p>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div><span className="text-muted-foreground">Environment</span><p className="font-mono font-medium">{typeof window !== "undefined" && window.location.hostname === "localhost" ? "development" : "production"}</p></div>
                            <div><span className="text-muted-foreground">API Origin</span><p className="font-mono font-medium break-all">{typeof window !== "undefined" ? window.location.origin : "—"}</p></div>
                          </div>
                        </div>

                        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/50 dark:bg-blue-950/20">
                          <p className="text-xs text-blue-700 dark:text-blue-400"><strong>Bootstrap env vars</strong> (must stay on Render — cannot be moved to dashboard): <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">DATABASE_URL</code>, <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">JWT_SECRET</code>, <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">SESSION_SECRET</code>, <code className="rounded bg-blue-100 dark:bg-blue-900 px-1">SETTINGS_ENCRYPTION_KEY</code>. All other credentials can live here.</p>
                        </div>
                      </CardContent>
                    </Card>
                  </>
                )}
              </TabsContent>
            )}

            {/* Diagnostics Tab */}
            <TabsContent value="diagnostics" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>System Diagnostics</CardTitle>
                  <CardDescription>Monitor system health and configuration status</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Frontend URL Status */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold">Frontend URL Health</h3>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => refreshFrontendUrlMutation.mutate()}
                        disabled={frontendUrlQuery.isLoading || frontendUrlQuery.isPending || refreshFrontendUrlMutation.isPending}
                      >
                        {frontendUrlQuery.isLoading || frontendUrlQuery.isPending || refreshFrontendUrlMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Checking...
                          </>
                        ) : (
                          <>
                            <RefreshCcw className="h-4 w-4 mr-2" />
                            Refresh
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Loading state */}
                    {(frontendUrlQuery.isLoading || frontendUrlQuery.isPending || refreshFrontendUrlMutation.isPending) && (
                      <div className="p-4 rounded-lg bg-muted/50 border flex items-center gap-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">Checking Frontend URL status...</p>
                      </div>
                    )}

                    {/* Success state */}
                    {frontendUrlQuery.data && !frontendUrlQuery.isLoading && (
                      <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase">Configured URL (DB / ENV)</p>
                          <p className="text-sm font-mono break-all">{frontendUrlQuery.data.configuredUrl || '(not set)'}</p>
                          <div className="text-xs text-muted-foreground mt-2">
                            <p>DB: <span className="font-mono">{frontendUrlQuery.data.dbConfiguredUrl || '(not set)'}</span></p>
                            <p>ENV: <span className="font-mono">{frontendUrlQuery.data.envConfiguredUrl || '(not set)'}</span></p>
                          </div>
                        </div>

                        <div>
                          <p className="text-xs font-medium text-muted-foreground uppercase">Resolved URL</p>
                          <div className="flex items-center gap-2 mt-1">
                            <p className="text-sm font-mono break-all flex-1">{frontendUrlQuery.data.resolvedUrl || 'Unknown'}</p>
                            <Badge variant={frontendUrlQuery.data.isHealthy ? "default" : "secondary"}>
                              {frontendUrlQuery.data.isFallingBack ? "⚠️ Fallback" : "✓ Primary"}
                            </Badge>
                          </div>
                        </div>

                        {frontendUrlQuery.data.isFallingBack && (
                          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                            <p className="text-xs text-yellow-700 dark:text-yellow-400">
                              <strong>Fallback Active:</strong> The configured Netlify URL appears to be unreachable. Payment redirects are using localhost instead. Check your deployment status.
                            </p>
                          </div>
                        )}

                        <div className="text-xs text-muted-foreground">
                          <p>💾 {frontendUrlQuery.data.cacheInfo?.message || 'Status cached'} • TTL: {frontendUrlQuery.data.cacheInfo?.ttl || '60 seconds'}</p>
                        </div>
                      </div>
                    )}

                    {/* Error state */}
                    {frontendUrlQuery.isError && !frontendUrlQuery.isLoading && (
                      <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-600 dark:text-red-400">
                          Failed to fetch diagnostics. The endpoint may be temporarily unavailable.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Info Section */}
                  <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20 space-y-2">
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">ℹ️ How it works</p>
                    <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Server checks your configured FRONTEND_URL every 60 seconds</li>
                      <li>If unreachable, payment redirects fall back to localhost</li>
                      <li>This ensures uninterrupted payment processing during outages</li>
                      <li>Use the Refresh button to force an immediate health check</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Deploy Guide ─────────────────────────────────────────────── */}
            <TabsContent value="deploy-guide" className="space-y-5">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <BookOpen className="h-5 w-5 text-primary" />
                    Complete Deployment Guide
                  </CardTitle>
                  <CardDescription>
                    Follow these phases in order to go from zero to a fully running production platform. Every credential mentioned here has a corresponding field in this Settings page — no code changes or redeployments are needed once the platform is live.
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Phase 0 */}
              <CollapsibleDashboardSection
                title="Phase 0 — Create Your Accounts First"
                summary="Before writing any config, create free accounts on these 7 services. You need credentials from all of them."
                defaultOpen={true}
              >
                <div className="space-y-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium">Service</th>
                          <th className="text-left py-2 pr-4 font-medium">Purpose</th>
                          <th className="text-left py-2 pr-4 font-medium">URL</th>
                          <th className="text-left py-2 font-medium">Free Tier</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {[
                          { name: "GitHub", purpose: "Code repository", url: "github.com", free: "Yes" },
                          { name: "Neon", purpose: "PostgreSQL database", url: "neon.tech", free: "Yes (0.5 GB)" },
                          { name: "Render", purpose: "Backend API hosting", url: "render.com", free: "Yes (sleeps after 15 min)" },
                          { name: "Netlify", purpose: "Frontend hosting", url: "netlify.com", free: "Yes (100 GB/mo)" },
                          { name: "Paystack", purpose: "GHS payments", url: "paystack.com", free: "Yes (test mode)" },
                          { name: "Cloudinary", purpose: "Image & video hosting", url: "cloudinary.com", free: "Yes (25 GB)" },
                          { name: "SMTP provider", purpose: "Transactional email", url: "See below", free: "Varies" },
                        ].map((row) => (
                          <tr key={row.name}>
                            <td className="py-2 pr-4 font-medium">{row.name}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{row.purpose}</td>
                            <td className="py-2 pr-4 text-primary text-xs font-mono">{row.url}</td>
                            <td className="py-2">
                              <Badge variant="secondary" className="text-xs">{row.free}</Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <p className="text-sm font-medium mb-2">SMTP Options</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <div><span className="font-medium text-foreground">Brevo</span> — 9,000 free emails/mo · brevo.com</div>
                      <div><span className="font-medium text-foreground">Mailersend</span> — 3,000/mo · mailersend.com</div>
                      <div><span className="font-medium text-foreground">Gmail + App Password</span> — Unlimited (low limits)</div>
                      <div><span className="font-medium text-foreground">Postmark</span> — Best deliverability · postmarkapp.com</div>
                    </div>
                  </div>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 1 */}
              <CollapsibleDashboardSection
                title="Phase 1 — Local Development Setup"
                summary="Get the platform running on your machine before deploying anywhere."
                defaultOpen={true}
              >
                <div className="space-y-5">
                  {[
                    {
                      step: "1.1",
                      title: "Clone the Repository",
                      code: `git clone https://github.com/YOUR_ORG/Kiyumart-Per.git\ncd Kiyumart-Per`,
                    },
                    {
                      step: "1.2",
                      title: "Install Node.js 18+",
                      code: `node --version   # must be v18.x.x or higher\nnpm --version`,
                      note: "Download from nodejs.org — install the LTS version.",
                    },
                    {
                      step: "1.3",
                      title: "Create Your Environment File",
                      code: `cp .env.example .env`,
                      note: "Then open .env and fill in the values from Phases 2–5.",
                    },
                    {
                      step: "1.4",
                      title: "Generate Secrets",
                      code: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
                      note: "Run this twice — once for JWT_SECRET, once for SESSION_SECRET. Use 64-char output.",
                    },
                    {
                      step: "1.5",
                      title: "Install Dependencies",
                      code: `npm install`,
                    },
                    {
                      step: "1.6",
                      title: "Start Development Server",
                      code: `npm run dev`,
                      note: "Opens backend on :5000 and frontend on :5173. On first boot: creates all DB tables and your super admin account.",
                    },
                  ].map(({ step, title, code, note }) => (
                    <div key={step} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge className="shrink-0 text-xs px-2 py-0.5">{step}</Badge>
                        <p className="font-medium text-sm">{title}</p>
                      </div>
                      <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">{code}</pre>
                      {note && <p className="text-xs text-muted-foreground pl-1">{note}</p>}
                    </div>
                  ))}
                  <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-3">
                    <p className="text-xs text-blue-800 dark:text-blue-300">Log in at <code className="font-mono">http://localhost:5173/auth</code> using the <code className="font-mono">SUPER_ADMIN_EMAIL</code> and <code className="font-mono">SUPER_ADMIN_PASSWORD</code> you set in <code className="font-mono">.env</code>.</p>
                  </div>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 2 */}
              <CollapsibleDashboardSection
                title="Phase 2 — Neon Database Setup"
                summary="Serverless PostgreSQL. The schema is created automatically on first boot — no manual migrations needed."
              >
                <div className="space-y-4">
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">1</span><span>Go to <strong>console.neon.tech</strong> → <strong>Create a project</strong> → name it <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">kiyumart-production</code> → select the region closest to your Render region (Frankfurt EU).</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">2</span><span>In your project → <strong>Connection Details</strong> → select <strong>Pooled connection</strong> (not the direct URL — pooled is required).</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">3</span><span>Copy the connection string — it looks like:<br/><code className="text-xs font-mono bg-muted px-1 py-0.5 rounded break-all">postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require</code></span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">4</span><span>Add to <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">.env</code>: <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">DATABASE_URL=postgresql://...</code><br/>In production: add to Render Environment Variables (Phase 6).</span></li>
                  </ol>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 3 */}
              <CollapsibleDashboardSection
                title="Phase 3 — Cloudinary Setup"
                summary="Stores all product images and videos. Without it, uploads are lost on every Render redeploy."
              >
                <div className="space-y-4">
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">1</span><span>Go to <strong>cloudinary.com</strong> → Sign Up Free → verify your email.</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">2</span><span>Dashboard → <strong>Settings → Access Keys</strong> → copy: <strong>Cloud name</strong>, <strong>API Key</strong>, <strong>API Secret</strong>.</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">3</span><span>Add to <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">.env</code> locally, or enter directly in <strong>Settings → Storage</strong> here after first login.</span></li>
                  </ol>
                  <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{`CLOUDINARY_CLOUD_NAME=your_cloud_name\nCLOUDINARY_API_KEY=123456789012345\nCLOUDINARY_API_SECRET=AbCdEfGhIjKlMnOpQrStUvWxYz`}</pre>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 4 */}
              <CollapsibleDashboardSection
                title="Phase 4 — Paystack Setup"
                summary="Processes all GHS payments. Test mode works immediately — no business verification required for testing."
              >
                <div className="space-y-4">
                  <ol className="space-y-3 text-sm">
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">1</span><span>Go to <strong>paystack.com</strong> → Create a free account → verify your email.</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">2</span><span>Dashboard → <strong>Settings → API Keys & Webhooks</strong> → copy the <strong>Test Keys</strong>: Secret key (<code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">sk_test_...</code>) and Public key (<code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">pk_test_...</code>).</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">3</span><span>Add to <code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">.env</code> locally, or enter in <strong>Settings → Payments</strong> here after first login.</span></li>
                    <li className="flex gap-3"><span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-semibold">4</span><span>After backend deploys → set webhook URL in Paystack:<br/><code className="text-xs font-mono bg-muted px-1 py-0.5 rounded">https://your-backend.onrender.com/api/webhooks/paystack</code></span></li>
                  </ol>
                  <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3">
                    <p className="text-xs text-amber-800 dark:text-amber-300"><strong>Live payments:</strong> Complete Paystack business verification to get live keys (<code className="font-mono">sk_live_...</code>). Replace test keys in Render env vars and Settings → Payments when ready to accept real GHS.</p>
                  </div>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 5 */}
              <CollapsibleDashboardSection
                title="Phase 5 — SMTP Email Setup"
                summary="Used for order confirmations, application approvals, password resets, and payment reminders."
              >
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Option A — Brevo (Recommended)</p>
                    <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                      <li>Go to <strong>brevo.com</strong> → Sign Up Free → verify email</li>
                      <li>Go to <strong>SMTP & API → SMTP</strong> → copy your SMTP credentials</li>
                    </ol>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{`SMTP_HOST=smtp-relay.brevo.com\nSMTP_PORT=587\nSMTP_USER=your_brevo_login_email\nSMTP_PASS=your_brevo_smtp_key\nSMTP_SECURE=false\nSMTP_FROM_EMAIL=noreply@yourdomain.com\nSMTP_FROM_NAME=KiyuMart`}</pre>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Option B — Gmail (Quick Testing Only)</p>
                    <ol className="space-y-1 text-sm text-muted-foreground list-decimal list-inside">
                      <li>Enable 2FA on your Google account</li>
                      <li>Google Account → <strong>Security → App Passwords</strong> → generate one for Mail</li>
                    </ol>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{`SMTP_HOST=smtp.gmail.com\nSMTP_PORT=587\nSMTP_USER=youremail@gmail.com\nSMTP_PASS=your_16_char_app_password\nSMTP_SECURE=false`}</pre>
                  </div>
                  <p className="text-xs text-muted-foreground">SMTP can also be configured in <strong>Settings → Contact</strong> here — credentials are encrypted in the database and take effect immediately without redeploy.</p>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 6 */}
              <CollapsibleDashboardSection
                title="Phase 6 — Backend Deployment (Render)"
                summary="Deploy the Express API server. Takes 3–5 minutes on first deploy."
              >
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>6.1</Badge><p className="text-sm font-medium">Push Code to GitHub</p></div>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{`git add .\ngit commit -m "Initial production deployment"\ngit push origin main`}</pre>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>6.2</Badge><p className="text-sm font-medium">Create a Web Service on Render</p></div>
                    <p className="text-sm text-muted-foreground">render.com → <strong>New → Web Service</strong> → Connect repository → select <strong>Kiyumart-Per</strong></p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>6.3</Badge><p className="text-sm font-medium">Service Configuration</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y">
                          {[
                            ["Name", "kiyumart-api"],
                            ["Region", "Frankfurt (EU)"],
                            ["Runtime", "Node"],
                            ["Branch", "main"],
                            ["Build Command", "npm install && npm run build"],
                            ["Start Command", "npm run start"],
                            ["Plan", "Free (testing) · Starter (production — no cold starts)"],
                            ["Health Check Path", "/api/health"],
                          ].map(([field, value]) => (
                            <tr key={field}>
                              <td className="py-1.5 pr-4 font-medium text-muted-foreground w-40">{field}</td>
                              <td className="py-1.5 font-mono">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>6.4</Badge><p className="text-sm font-medium">Set Environment Variables</p></div>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">{`NODE_ENV                   = production
DATABASE_URL               = postgresql://... (Neon pooled URL)
JWT_SECRET                 = <64-char hex>
SESSION_SECRET             = <64-char hex>
PAYSTACK_SECRET_KEY        = sk_test_...
PAYSTACK_PUBLIC_KEY        = pk_test_...
FRONTEND_URL               = https://your-app.netlify.app  ← fill in AFTER Netlify deploys
CLOUDINARY_CLOUD_NAME      = your_cloud_name
CLOUDINARY_API_KEY         = your_api_key
CLOUDINARY_API_SECRET      = your_api_secret
SMTP_HOST                  = smtp-relay.brevo.com
SMTP_PORT                  = 587
SMTP_USER                  = your_smtp_user
SMTP_PASS                  = your_smtp_pass
SMTP_SECURE                = false
SMTP_FROM_EMAIL            = noreply@yourdomain.com
SMTP_FROM_NAME             = KiyuMart
SUPER_ADMIN_EMAIL          = admin@yourdomain.com
SUPER_ADMIN_PASSWORD       = StrongPassword123!
SETTINGS_ENCRYPTION_KEY    = <32-byte hex>
KIYUMART_USE_EMBEDDED_VITE = false`}</pre>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>6.5</Badge><p className="text-sm font-medium">Deploy & Set Paystack Webhook</p></div>
                    <p className="text-sm text-muted-foreground">Click <strong>Create Web Service</strong>. When the build turns green, your backend URL is something like <code className="text-xs font-mono bg-muted px-1 rounded">https://kiyumart-api.onrender.com</code>.</p>
                    <p className="text-sm text-muted-foreground mt-1">Then in Paystack → <strong>Settings → API Keys & Webhooks</strong> → Webhook URL:</p>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto">{`https://kiyumart-api.onrender.com/api/webhooks/paystack`}</pre>
                  </div>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 7 */}
              <CollapsibleDashboardSection
                title="Phase 7 — Frontend Deployment (Netlify)"
                summary="Deploy the React SPA to Netlify's global CDN. Takes 1–3 minutes."
              >
                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>7.1</Badge><p className="text-sm font-medium">Verify the SPA Redirect Rule</p></div>
                    <p className="text-xs text-muted-foreground">The file <code className="font-mono bg-muted px-1 rounded">client/public/_redirects</code> must contain:</p>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono">/*    /index.html   200</pre>
                    <p className="text-xs text-muted-foreground">Already included in the repo. This is required for client-side routing (otherwise page refreshes return 404).</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>7.2</Badge><p className="text-sm font-medium">Create a Site on Netlify</p></div>
                    <p className="text-sm text-muted-foreground">netlify.com → <strong>Add new site → Import an existing project → GitHub</strong> → authorize → select <strong>Kiyumart-Per</strong></p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>7.3</Badge><p className="text-sm font-medium">Build Settings</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody className="divide-y">
                          {[
                            ["Base directory", "(leave blank)"],
                            ["Build command", "npm run build:frontend"],
                            ["Publish directory", "dist/public"],
                          ].map(([field, value]) => (
                            <tr key={field}>
                              <td className="py-1.5 pr-4 font-medium text-muted-foreground w-40">{field}</td>
                              <td className="py-1.5 font-mono">{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>7.4</Badge><p className="text-sm font-medium">Environment Variable</p></div>
                    <p className="text-xs text-muted-foreground">Netlify → your site → <strong>Site configuration → Environment variables</strong>:</p>
                    <pre className="bg-muted rounded-lg p-3 text-xs font-mono">{`VITE_API_URL = https://kiyumart-api.onrender.com`}</pre>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1"><Badge>7.5</Badge><p className="text-sm font-medium">After Deploy — Update FRONTEND_URL on Render</p></div>
                    <p className="text-sm text-muted-foreground">When Netlify gives you a URL (e.g. <code className="text-xs font-mono bg-muted px-1 rounded">https://kiyumart-abc123.netlify.app</code>), go back to Render → Environment → set <code className="text-xs font-mono bg-muted px-1 rounded">FRONTEND_URL</code> to that exact URL (no trailing slash). Render will redeploy automatically.</p>
                    <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-3">
                      <p className="text-xs text-red-800 dark:text-red-300"><strong>Critical:</strong> If FRONTEND_URL is wrong, Paystack payment callbacks will redirect to the wrong URL and orders will not complete. Match it exactly — no trailing slash.</p>
                    </div>
                  </div>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 8 */}
              <CollapsibleDashboardSection
                title="Phase 8 — Post-Deploy Admin Configuration"
                summary="Everything here is done through this Settings page — no code or redeploy needed."
              >
                <div className="space-y-4">
                  <div className="rounded-lg border border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30 p-3">
                    <p className="text-xs text-green-800 dark:text-green-300">Open your Netlify URL → <code className="font-mono">/auth</code> → log in with <code className="font-mono">SUPER_ADMIN_EMAIL</code> + <code className="font-mono">SUPER_ADMIN_PASSWORD</code>. Then complete each tab below.</p>
                  </div>
                  <div className="space-y-3">
                    {[
                      { tab: "Settings → General", action: "Set Platform Name, choose Single-Vendor or Multi-Vendor mode, configure Store Display Mode and homepage sections." },
                      { tab: "Settings → Payments", action: "Enter Paystack Public Key and Secret Key (stored encrypted). Set Default Commission Rate and Processing Fee." },
                      { tab: "Settings → Storage", action: "Enter Cloudinary Cloud Name, API Key, and API Secret. Set Max Upload Size and allowed file types." },
                      { tab: "Settings → Contact", action: "Fill in Contact Phone, Email, and Address. Configure SMTP if not already set via env vars. Add social media URLs." },
                      { tab: "Settings → Advanced Features", action: "Choose Delivery Mode (Internal Riders vs External). Set Order Auto-Cancel window, Free Tier Product Limit, seller upgrade plan pricing, and Referral System settings." },
                      { tab: "Settings → Security Keys", action: "Verify Paystack and Cloudinary credentials show as configured. Enable Invite-Only Registration to control who can sign up." },
                    ].map(({ tab, action }) => (
                      <div key={tab} className="flex gap-3 text-sm">
                        <Badge variant="outline" className="shrink-0 text-xs">{tab}</Badge>
                        <p className="text-muted-foreground">{action}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </CollapsibleDashboardSection>

              {/* Phase 9 — Checklist */}
              <CollapsibleDashboardSection
                title="Phase 9 — Going Live Checklist"
                summary="Work through every item before announcing the platform publicly."
                defaultOpen={true}
              >
                <div className="space-y-5">
                  {[
                    {
                      category: "Infrastructure",
                      icon: <Server className="h-4 w-4" />,
                      items: [
                        "NODE_ENV=production is set on Render",
                        "FRONTEND_URL matches exact Netlify URL — no trailing slash",
                        "JWT_SECRET is a 64-character random hex string",
                        "SETTINGS_ENCRYPTION_KEY is set (encrypts DB-stored credentials)",
                        "Render plan is Starter or higher if you need no cold starts (Free plan sleeps after 15 min inactivity)",
                      ],
                    },
                    {
                      category: "Payments",
                      icon: <CreditCard className="h-4 w-4" />,
                      items: [
                        "Paystack webhook URL is set: https://your-backend.onrender.com/api/webhooks/paystack",
                        "A test checkout completes end-to-end (order → payment popup → order confirmed)",
                        "Live Paystack keys (sk_live_...) are in place before accepting real GHS payments",
                        "Paystack business verification is complete (required for live mode)",
                      ],
                    },
                    {
                      category: "Email",
                      icon: <Mail className="h-4 w-4" />,
                      items: [
                        "A test order confirmation email is received",
                        "Password reset email arrives and the link works",
                        "SMTP_FROM_EMAIL is a domain you control (improves deliverability)",
                      ],
                    },
                    {
                      category: "Media",
                      icon: <Cloud className="h-4 w-4" />,
                      items: [
                        "A test product image upload shows a Cloudinary URL in the product record",
                        "Local disk fallback is not in use — verify in Cloudinary dashboard",
                      ],
                    },
                    {
                      category: "Frontend",
                      icon: <Globe className="h-4 w-4" />,
                      items: [
                        "All routes work on page refresh (no 404 — the _redirects file is deployed)",
                        "PWA installs correctly on mobile (Chrome → install prompt appears)",
                        "VITE_API_URL points to your production Render URL",
                      ],
                    },
                    {
                      category: "Security",
                      icon: <ShieldCheck className="h-4 w-4" />,
                      items: [
                        ".env is in .gitignore and was never committed to git",
                        "No test credentials remain in production environment variables",
                        "Admin password is strong and not the setup default",
                        "SUPER_ADMIN_PASSWORD env var can be removed after first boot (account already exists)",
                      ],
                    },
                    {
                      category: "SEO",
                      icon: <Globe2 className="h-4 w-4" />,
                      items: [
                        "robots.txt is deployed (blocks /admin, /seller, /rider, /api from crawlers)",
                        "sitemap.xml is deployed and lists public product and category pages",
                        "Platform name and contact details are filled in Settings",
                      ],
                    },
                  ].map(({ category, icon, items }) => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {icon}
                        {category}
                      </div>
                      <ul className="space-y-1.5">
                        {items.map((item) => (
                          <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                            <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground/50" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </CollapsibleDashboardSection>

              {/* Alternatives */}
              <CollapsibleDashboardSection
                title="Alternative Hosting Platforms"
                summary="Render and Netlify are the defaults but any Node.js host and static CDN work."
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2"><Server className="h-4 w-4" /> Backend Alternatives to Render</p>
                    <div className="space-y-2 text-sm">
                      {[
                        { name: "Railway", note: "No cold starts on Hobby plan ($5/mo), simplest DX" },
                        { name: "Fly.io", note: "Better global latency, requires more config" },
                        { name: "DigitalOcean App Platform", note: "$5–12/mo managed, solid SLAs" },
                        { name: "VPS (any provider)", note: "Full control — run with PM2 or systemd" },
                      ].map(({ name, note }) => (
                        <div key={name}>
                          <p className="font-medium text-xs">{name}</p>
                          <p className="text-xs text-muted-foreground">{note}</p>
                        </div>
                      ))}
                    </div>
                    <pre className="bg-muted rounded-lg p-2 text-xs font-mono overflow-x-auto">{`# Same on any platform:\nnpm install && npm run build  # build\nnpm run start                  # start`}</pre>
                  </div>
                  <div className="space-y-3">
                    <p className="text-sm font-medium flex items-center gap-2"><Globe className="h-4 w-4" /> Frontend Alternatives to Netlify</p>
                    <div className="space-y-2 text-sm">
                      {[
                        { name: "Vercel", note: "Fastest global CDN, identical build config" },
                        { name: "Cloudflare Pages", note: "Unlimited bandwidth on free plan" },
                        { name: "GitHub Pages", note: "Free; limited to .github.io on free plan" },
                      ].map(({ name, note }) => (
                        <div key={name}>
                          <p className="font-medium text-xs">{name}</p>
                          <p className="text-xs text-muted-foreground">{note}</p>
                        </div>
                      ))}
                    </div>
                    <pre className="bg-muted rounded-lg p-2 text-xs font-mono overflow-x-auto">{`# Same on any platform:\nBuild:   npm run build:frontend\nPublish: dist/public\nRedirect: /* /index.html 200`}</pre>
                  </div>
                </div>
              </CollapsibleDashboardSection>
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

        {/* ── Elevated Access Re-Authentication Dialog ─────────────────────── */}
        <Dialog open={showElevatedAuthModal} onOpenChange={(open) => { if (!open) { setShowElevatedAuthModal(false); setElevatedAuthPassword(""); setPendingTab(null); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
                Identity Verification Required
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">
                You are attempting to access sensitive platform credentials. Re-enter your Super Admin password to unlock access for <strong>15 minutes</strong>.
              </p>
              <div className="space-y-2">
                <Label htmlFor="elevated-auth-password">Super Admin Password</Label>
                <Input
                  id="elevated-auth-password"
                  type="password"
                  placeholder="Enter your password"
                  value={elevatedAuthPassword}
                  onChange={(e) => setElevatedAuthPassword(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleElevatedVerify(); }}
                  autoFocus
                />
              </div>
            </div>
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => { setShowElevatedAuthModal(false); setElevatedAuthPassword(""); setPendingTab(null); }}>
                Cancel
              </Button>
              <Button
                onClick={handleElevatedVerify}
                disabled={isVerifyingElevated || !elevatedAuthPassword.trim()}
              >
                {isVerifyingElevated ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying...</>
                ) : (
                  <><Lock className="mr-2 h-4 w-4" /> Verify & Unlock</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* ─────────────────────────────────────────────────────────────────── */}
    </DashboardLayout>
  );
}
