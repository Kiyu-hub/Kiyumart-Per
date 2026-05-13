import { useMemo, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Bell, Store, Settings as SettingsIcon, Wallet, MessageSquare, Package, FolderTree, Image as ImageIcon, ShieldCheck, Globe, Loader2, Copy, Check, Palette, Share2 } from "lucide-react";
import { FaInstagram, FaFacebook, FaTiktok } from "react-icons/fa";
import { useLocation } from "wouter";
import { fetchApiJson, apiRequest, queryClient } from "@/lib/queryClient";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useToast } from "@/hooks/use-toast";
import { Stack, CalendarCheck, Infinity as PhInfinity, Storefront, ArrowCircleUp } from "@phosphor-icons/react";
import { SellerUpgradeModal } from "@/components/SellerUpgradeModal";

interface TierInfo {
  isPremiumSeller: boolean;
  sellerUpgradePlan: string | null;
  sellerPlanExpiresAt: string | null;
  sellerBonusSlots: number;
  planBExpired: boolean;
  productCount: number;
  freeTierLimit: number;
  hardMax: number;
  effectiveLimit: number;
  upgradePlanAPrice: number;
  upgradePlanASlots: number;
  upgradePlanBPrice: number;
  upgradePlanCPrice: number;
  sellerMonetizationEnabled: boolean;
}

interface SellerStore {
  id: string;
  name: string;
  payoutType?: "bank_account" | "mobile_money" | null;
  payoutDetails?: {
    provider?: string | null;
    mobileNumber?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    bankCode?: string | null;
  } | null;
  isPayoutVerified?: boolean | null;
  whatsappNumber?: string | null;
  socialLinks?: { instagram?: string; facebook?: string; tiktok?: string; website?: string } | null;
  merchantCategory?: string | null;
  brandingConfig?: {
    primaryColor?: string | null;
    accentColor?: string | null;
    logoOverride?: string | null;
    coverImage?: string | null;
    tagline?: string | null;
  } | null;
}

const MERCHANT_CATEGORIES = [
  { value: "QUICK_EATS", label: "Quick Eats / Food & Cafe", icon: "🍔" },
  { value: "HEALTH_ESSENTIALS", label: "Health & Pharmacy", icon: "💊" },
  { value: "RETAIL_BOUTIQUE", label: "Retail / Fashion Boutique", icon: "👗" },
  { value: "GENERAL_PROVISIONS", label: "General Provisions / Mixed", icon: "🏪" },
];

const hasSellerPayoutSetup = (store?: SellerStore | null) => {
  if (!store?.payoutType || !store?.payoutDetails) return false;

  if (store.payoutType === "mobile_money") {
    return Boolean(
      String(store.payoutDetails.provider || "").trim() &&
      String(store.payoutDetails.mobileNumber || "").trim(),
    );
  }

  return Boolean(
    String(store.payoutDetails.bankName || "").trim() &&
    String(store.payoutDetails.bankCode || "").trim() &&
    String(store.payoutDetails.accountName || "").trim() &&
    String(store.payoutDetails.accountNumber || "").trim(),
  );
};

export default function SellerSettings() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { allowSellerBankPayouts, allowSellerDirectSupportMessages } = usePlatformSettings();
  const { toast } = useToast();

  const { data: store, isLoading: storeLoading } = useQuery<SellerStore>({
    queryKey: ["/api/stores/my-store", "seller-settings"],
    enabled: !!user?.id && user.role === "seller",
  });

  const { data: unreadSummary } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count", "seller-settings"],
    queryFn: () => fetchApiJson<{ count: number }>("/api/notifications/unread-count"),
    enabled: !!user?.id && user.role === "seller",
    refetchInterval: 15000,
  });

  const { data: tierInfo } = useQuery<TierInfo>({
    queryKey: ["/api/seller/tier-info"],
    enabled: !!user?.id && user.role === "seller",
  });

  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [instagram, setInstagram] = useState("");
  const [facebook, setFacebook] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [website, setWebsite] = useState("");
  const [merchantCat, setMerchantCat] = useState("");
  const [socialSaved, setSocialSaved] = useState(false);
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  // Branding state
  const [brandPrimaryColor, setBrandPrimaryColor] = useState("");
  const [brandAccentColor, setBrandAccentColor] = useState("");
  const [brandLogoOverride, setBrandLogoOverride] = useState("");
  const [brandCoverImage, setBrandCoverImage] = useState("");
  const [brandTagline, setBrandTagline] = useState("");
  const [brandingSaved, setBrandingSaved] = useState(false);

  // Sync store data into social + branding fields when store loads
  const storeLoaded = store?.id;
  useMemo(() => {
    if (store) {
      setInstagram(store.socialLinks?.instagram || "");
      setFacebook(store.socialLinks?.facebook || "");
      setTiktok(store.socialLinks?.tiktok || "");
      setWebsite(store.socialLinks?.website || "");
      setMerchantCat(store.merchantCategory || "");
      setBrandPrimaryColor(store.brandingConfig?.primaryColor || "");
      setBrandAccentColor(store.brandingConfig?.accentColor || "");
      setBrandLogoOverride(store.brandingConfig?.logoOverride || "");
      setBrandCoverImage(store.brandingConfig?.coverImage || "");
      setBrandTagline(store.brandingConfig?.tagline || "");
    }
  }, [storeLoaded]);

  const saveSocialMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Store not found");
      const res = await apiRequest("PATCH", `/api/stores/${store.id}`, {
        socialLinks: {
          instagram: instagram.trim() || undefined,
          facebook: facebook.trim() || undefined,
          tiktok: tiktok.trim() || undefined,
          website: website.trim() || undefined,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Social commerce settings saved!" });
      setSocialSaved(true);
      setTimeout(() => setSocialSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Failed to save", variant: "destructive" });
    },
  });

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Store not found");
      const res = await apiRequest("PATCH", `/api/stores/${store.id}`, {
        brandingConfig: {
          primaryColor: brandPrimaryColor.trim() || null,
          accentColor: brandAccentColor.trim() || null,
          logoOverride: brandLogoOverride.trim() || null,
          coverImage: brandCoverImage.trim() || null,
          tagline: brandTagline.trim() || null,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Store branding saved!" });
      setBrandingSaved(true);
      setTimeout(() => setBrandingSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Failed to save branding", variant: "destructive" });
    },
  });

  const [personaSaved, setPersonaSaved] = useState(false);
  const savePersonaMutation = useMutation({
    mutationFn: async () => {
      if (!store?.id) throw new Error("Store not found");
      const res = await apiRequest("PATCH", `/api/stores/${store.id}`, { merchantCategory: merchantCat || null });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Store persona updated!" });
      setPersonaSaved(true);
      setTimeout(() => setPersonaSaved(false), 2000);
      queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
    },
    onError: (e: any) => {
      toast({ title: e?.message || "Failed to save", variant: "destructive" });
    },
  });

  const storePayoutReady = hasSellerPayoutSetup(store);
  const storeApprovalLabel = useMemo(() => {
    if (!user) return "Loading";
    if (user.isApproved === false) return "Pending Approval";
    if (user.isActive === false) return "Restricted";
    return "Active";
  }, [user]);

  if (!user || storeLoading) {
    return (
      <DashboardLayout role="seller">
        <div className="p-6">
          <PageLoadingState title="Loading seller settings..." />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground">Manage your seller account and payout details.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card data-testid="card-account-status" className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Seller Account Status
              </CardTitle>
              <CardDescription>
                A quick view of your account, store, and payout status.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Seller Approval</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={user.isApproved === false ? "secondary" : "default"}>{storeApprovalLabel}</Badge>
                  {user.isActive === false && <Badge variant="destructive">Access Limited</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your seller account is ready to use.
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Store Profile</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={store?.id ? "default" : "secondary"}>{store?.name?.trim() ? "Connected" : "Needs Review"}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {store?.name?.trim()
                    ? `Store: ${store.name}`
                    : "Add your store details so customers can see the right information."}
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Payout Setup</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={storePayoutReady ? "default" : "secondary"}>
                    {storePayoutReady ? "Configured" : "Setup Required"}
                  </Badge>
                  {store?.payoutType === "mobile_money" && <Badge variant="outline">Mobile Money</Badge>}
                  {store?.payoutType === "bank_account" && <Badge variant="outline">Bank Account</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {storePayoutReady
                    ? "Your payout details are ready, so future payouts can be sent to this saved account."
                    : "Complete your payout setup so your earnings can be sent without delays."}
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Notifications</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{unreadSummary?.count ?? 0} unread</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Check here for new messages, updates, and payout alerts.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-payout-methods">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Payout Options
              </CardTitle>
              <CardDescription>
                Choose how you want to receive your money.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border p-4">
                <p className="font-medium">Mobile Money</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your Ghana mobile money number so your payouts can be sent to the right wallet.</p>
              </div>
              {allowSellerBankPayouts !== false && (
                <div className="rounded-xl border p-4">
                  <p className="font-medium">Bank Account</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use your bank account details to get paid.
                  </p>
                </div>
              )}
              <Button onClick={() => navigate("/seller/payment-setup")} data-testid="button-open-payout-setup">
                Open Payout Setup
              </Button>
            </CardContent>
          </Card>

          {/* Listing Plan — only visible when superadmin has enabled seller monetization */}
          {tierInfo?.sellerMonetizationEnabled && (() => {
            const {
              isPremiumSeller, sellerUpgradePlan, sellerPlanExpiresAt, planBExpired,
              sellerBonusSlots, productCount, effectiveLimit, freeTierLimit,
              upgradePlanAPrice, upgradePlanASlots, upgradePlanBPrice, upgradePlanCPrice,
            } = tierInfo;

            const hasUnlimited = isPremiumSeller || sellerUpgradePlan === "plan_c" || (sellerUpgradePlan === "plan_b" && !planBExpired);
            const displayLimit = effectiveLimit > 0 ? effectiveLimit : null;
            const remaining = displayLimit !== null && !hasUnlimited ? displayLimit - productCount : null;
            const atLimit = displayLimit !== null && !hasUnlimited && productCount >= displayLimit;
            const nearLimit = !atLimit && remaining !== null && remaining <= 3;

            const planLabel =
              sellerUpgradePlan === "plan_c" ? "Plan C — Unlimited Forever" :
              sellerUpgradePlan === "plan_b" && !planBExpired ? "Plan B — Monthly Unlimited" :
              sellerUpgradePlan === "plan_b" && planBExpired ? "Plan B (Expired)" :
              sellerUpgradePlan === "plan_a" ? `Plan A — Extra Slots` :
              "Basic Plan";

            const planIcon =
              sellerUpgradePlan === "plan_c" ? <PhInfinity size={16} weight="bold" className="text-green-500" /> :
              sellerUpgradePlan === "plan_b" ? <CalendarCheck size={16} weight="fill" className={planBExpired ? "text-red-500" : "text-blue-500"} /> :
              sellerUpgradePlan === "plan_a" ? <Stack size={16} weight="fill" className="text-yellow-500" /> :
              <Storefront size={16} weight="duotone" className="text-muted-foreground" />;

            return (
              <Card data-testid="card-listing-plan" className="lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ArrowCircleUp size={20} weight="fill" className="text-primary" />
                    Listing Plan
                  </CardTitle>
                  <CardDescription>
                    Your current listing plan, usage, and available upgrades.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {/* Current status row */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      {planIcon}
                      <span className="font-semibold text-foreground">{planLabel}</span>
                    </div>
                    {hasUnlimited ? (
                      <Badge variant="default" className="bg-green-600 text-white">Unlimited</Badge>
                    ) : atLimit ? (
                      <Badge variant="destructive">Limit Reached</Badge>
                    ) : nearLimit ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300">
                        {remaining} slot{remaining !== 1 ? "s" : ""} left
                      </Badge>
                    ) : (
                      <Badge variant="secondary">
                        {productCount} / {displayLimit ?? "∞"} used
                      </Badge>
                    )}
                    {planBExpired && (
                      <Badge variant="destructive">Expired</Badge>
                    )}
                    {sellerPlanExpiresAt && sellerUpgradePlan === "plan_b" && !planBExpired && (
                      <span className="text-xs text-muted-foreground">
                        Renews {new Date(sellerPlanExpiresAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Usage progress bar — shown when there's a finite limit */}
                  {displayLimit !== null && !hasUnlimited && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>{productCount} products listed</span>
                        <span>{displayLimit} slot limit</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            atLimit ? "bg-red-500" : nearLimit ? "bg-amber-500" : "bg-primary"
                          }`}
                          style={{ width: `${Math.min(100, (productCount / displayLimit) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Expired Plan B warning */}
                  {planBExpired && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                      Your monthly unlimited plan has expired. Renew Plan B or upgrade to Plan C to continue listing without limits.
                    </div>
                  )}

                  {/* At-limit warning */}
                  {atLimit && !planBExpired && (
                    <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
                      You've reached your listing limit. Upgrade your plan to add more products.
                    </div>
                  )}

                  {/* Near-limit early warning */}
                  {nearLimit && !atLimit && remaining !== null && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
                      You have {remaining} listing slot{remaining !== 1 ? "s" : ""} remaining. Consider upgrading before you hit the limit.
                    </div>
                  )}

                  {/* Plan comparison */}
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-3">Available Plans</p>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {/* Basic */}
                      <div className={`rounded-xl border p-4 flex flex-col gap-2 ${!sellerUpgradePlan ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center gap-2">
                          <Storefront size={16} weight="duotone" className="text-muted-foreground" />
                          <span className="text-sm font-semibold">Basic Plan</span>
                          {!sellerUpgradePlan && <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">Free · {freeTierLimit} product slots</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Up to {freeTierLimit} products</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>No subscription required</li>
                        </ul>
                      </div>

                      {/* Plan A */}
                      <div className={`rounded-xl border p-4 flex flex-col gap-2 ${sellerUpgradePlan === "plan_a" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center gap-2">
                          <Stack size={16} weight="fill" className="text-yellow-500" />
                          <span className="text-sm font-semibold">Plan A</span>
                          {sellerUpgradePlan === "plan_a" && <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">GHS {upgradePlanAPrice.toFixed(2)} · one-time</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>+{upgradePlanASlots} extra slots per purchase</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Slots stack — buy more anytime</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>No expiry</li>
                        </ul>
                      </div>

                      {/* Plan B */}
                      <div className={`rounded-xl border p-4 flex flex-col gap-2 ${sellerUpgradePlan === "plan_b" && !planBExpired ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center gap-2">
                          <CalendarCheck size={16} weight="fill" className="text-blue-500" />
                          <span className="text-sm font-semibold">Plan B</span>
                          {sellerUpgradePlan === "plan_b" && !planBExpired && <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>}
                          {sellerUpgradePlan === "plan_b" && planBExpired && <Badge variant="destructive" className="ml-auto text-xs">Expired</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">GHS {upgradePlanBPrice.toFixed(2)} / month</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Unlimited listings for 30 days</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Renew monthly</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Best for high-volume sellers</li>
                        </ul>
                      </div>

                      {/* Plan C */}
                      <div className={`rounded-xl border p-4 flex flex-col gap-2 ${sellerUpgradePlan === "plan_c" ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border"}`}>
                        <div className="flex items-center gap-2">
                          <PhInfinity size={16} weight="bold" className="text-green-500" />
                          <span className="text-sm font-semibold">Plan C</span>
                          {sellerUpgradePlan === "plan_c" && <Badge variant="secondary" className="ml-auto text-xs">Current</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground">GHS {upgradePlanCPrice.toFixed(2)} · one-time forever</p>
                        <ul className="space-y-1 text-xs text-muted-foreground">
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Unlimited listings permanently</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Never pay again</li>
                          <li className="flex items-start gap-1"><span className="text-primary mt-0.5">✓</span>Best long-term value</li>
                        </ul>
                      </div>
                    </div>
                  </div>

                  {/* Upgrade CTA — hidden only if already on Plan C */}
                  {sellerUpgradePlan !== "plan_c" && (
                    <div className="flex justify-end">
                      <Button
                        onClick={() => setShowUpgradeModal(true)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <ArrowCircleUp size={16} weight="fill" className="mr-2" />
                        {planBExpired ? "Renew or Upgrade Plan" : sellerUpgradePlan ? "Upgrade Plan" : "Upgrade from Basic"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {/* Store Persona */}
          <Card data-testid="card-store-persona" className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Store className="h-5 w-5 text-primary" />
                Store Persona
              </CardTitle>
              <CardDescription>
                Choose the category that best describes what you sell. This controls which product fields appear when you list items — you can update it any time your focus changes.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {MERCHANT_CATEGORIES.map((cat) => (
                  <button
                    key={cat.value}
                    type="button"
                    onClick={() => setMerchantCat(cat.value)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      merchantCat === cat.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:bg-muted"
                    }`}
                  >
                    <span className="text-2xl">{cat.icon}</span>
                    <p className="mt-1.5 text-xs font-medium leading-tight">{cat.label}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => savePersonaMutation.mutate()} disabled={savePersonaMutation.isPending}>
                  {savePersonaMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : personaSaved ? (
                    <><Check className="h-4 w-4 mr-2" /> Saved!</>
                  ) : (
                    "Save Persona"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Social Commerce — social links, merchant category */}
          <Card data-testid="card-social-commerce" className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="h-5 w-5 text-primary" />
                Social Commerce Settings
              </CardTitle>
              <CardDescription>
                Share your store and products on Instagram, TikTok, Facebook, and beyond.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* My Store Link */}
              {store && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Your Store Link</p>
                  <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                    <p className="flex-1 truncate text-xs font-mono text-muted-foreground">
                      {window.location.origin}/sellers/{store.id}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 h-7 gap-1.5 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/sellers/${store.id}`);
                        toast({ title: "Copied!", description: "Store link copied to clipboard." });
                      }}
                    >
                      <Copy className="h-3 w-3" /> Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Share this link on your Instagram bio, WhatsApp status, or anywhere online. Customers will see all your products.
                  </p>
                </div>
              )}

              {/* Social links */}
              <div className="space-y-3">
                <p className="text-sm font-semibold">Social Links</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5"><FaInstagram className="h-3 w-3" /> Instagram</label>
                    <Input placeholder="https://instagram.com/yourstore" value={instagram} onChange={(e) => setInstagram(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5"><FaFacebook className="h-3 w-3" /> Facebook</label>
                    <Input placeholder="https://facebook.com/yourpage" value={facebook} onChange={(e) => setFacebook(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5"><FaTiktok className="h-3 w-3" /> TikTok</label>
                    <Input placeholder="https://tiktok.com/@yourstore" value={tiktok} onChange={(e) => setTiktok(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Globe className="h-3 w-3" /> Website</label>
                    <Input placeholder="https://yourwebsite.com" value={website} onChange={(e) => setWebsite(e.target.value)} />
                  </div>
                </div>
              </div>

              {/* Save button */}
              <div className="flex justify-end">
                <Button
                  onClick={() => saveSocialMutation.mutate()}
                  disabled={saveSocialMutation.isPending}
                >
                  {saveSocialMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : socialSaved ? (
                    <><Check className="h-4 w-4 mr-2" /> Saved!</>
                  ) : (
                    "Save Social Settings"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Logo & Branding */}
          <Card data-testid="card-store-branding" className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Logo &amp; Branding
              </CardTitle>
              <CardDescription>
                Customise your store's visual identity. Changes are reflected on your public store page and social product links.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Live preview */}
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Live Preview</p>
                <div className="overflow-hidden rounded-2xl border shadow-sm">
                  {/* Cover */}
                  <div
                    className="h-24 w-full"
                    style={{
                      background: brandCoverImage
                        ? `url(${brandCoverImage}) center/cover no-repeat`
                        : `linear-gradient(135deg, ${/^#([A-Fa-f0-9]{6})$/.test(brandPrimaryColor) ? brandPrimaryColor : "#16a34a"}22 0%, ${/^#([A-Fa-f0-9]{6})$/.test(brandPrimaryColor) ? brandPrimaryColor : "#16a34a"}55 100%)`,
                    }}
                  />
                  {/* Store header */}
                  <div className="bg-background px-4 pb-4">
                    <div className="flex items-end gap-3 -mt-7">
                      <div
                        className="h-14 w-14 rounded-xl border-2 border-background shadow flex items-center justify-center text-white font-bold text-xl overflow-hidden shrink-0"
                        style={{ backgroundColor: /^#([A-Fa-f0-9]{6})$/.test(brandPrimaryColor) ? brandPrimaryColor : "#16a34a" }}
                      >
                        {brandLogoOverride ? (
                          <img src={brandLogoOverride} alt="Logo" className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          (store?.name?.[0] || "S").toUpperCase()
                        )}
                      </div>
                      <div className="pb-1 min-w-0">
                        <p className="font-bold text-sm leading-tight truncate">{store?.name || "Your Store Name"}</p>
                        {(brandTagline || "Your tagline here") && (
                          <p className="text-xs text-muted-foreground truncate">{brandTagline || "Your tagline here"}</p>
                        )}
                      </div>
                    </div>
                    {/* Sample product card */}
                    <div className="mt-3 rounded-xl border p-3 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-muted shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">Sample Product</p>
                        <p className="text-xs font-bold" style={{ color: /^#([A-Fa-f0-9]{6})$/.test(brandPrimaryColor) ? brandPrimaryColor : "#16a34a" }}>
                          GHS 150.00
                        </p>
                      </div>
                      <button
                        className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                        style={{ backgroundColor: /^#([A-Fa-f0-9]{6})$/.test(brandPrimaryColor) ? brandPrimaryColor : "#16a34a" }}
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Primary color */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Primary Brand Color</label>
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <input
                        type="color"
                        value={/^#([A-Fa-f0-9]{6})$/.test(brandPrimaryColor) ? brandPrimaryColor : "#16a34a"}
                        onChange={(e) => setBrandPrimaryColor(e.target.value)}
                        className="h-9 w-9 cursor-pointer rounded border p-0.5 bg-transparent"
                        title="Pick primary color"
                      />
                    </div>
                    <Input
                      placeholder="#16a34a"
                      value={brandPrimaryColor}
                      onChange={(e) => setBrandPrimaryColor(e.target.value)}
                      className="flex-1 font-mono text-sm"
                      maxLength={7}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Buttons, price highlights, store avatar background.</p>
                </div>
                {/* Accent color */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <div className="relative shrink-0">
                      <input
                        type="color"
                        value={/^#([A-Fa-f0-9]{6})$/.test(brandAccentColor) ? brandAccentColor : "#f59e0b"}
                        onChange={(e) => setBrandAccentColor(e.target.value)}
                        className="h-9 w-9 cursor-pointer rounded border p-0.5 bg-transparent"
                        title="Pick accent color"
                      />
                    </div>
                    <Input
                      placeholder="#f59e0b"
                      value={brandAccentColor}
                      onChange={(e) => setBrandAccentColor(e.target.value)}
                      className="flex-1 font-mono text-sm"
                      maxLength={7}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Badges, tags, and secondary accents.</p>
                </div>
              </div>

              {/* Tagline */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Store Tagline</label>
                <Input
                  placeholder="Fresh bakes delivered daily ✨"
                  value={brandTagline}
                  onChange={(e) => setBrandTagline(e.target.value)}
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">Short phrase shown under your store name. Max 120 characters.</p>
              </div>

              {/* Logo URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Logo Image URL</label>
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="https://res.cloudinary.com/…/logo.png"
                    value={brandLogoOverride}
                    onChange={(e) => setBrandLogoOverride(e.target.value)}
                    className="flex-1"
                  />
                  {brandLogoOverride && (
                    <img
                      src={brandLogoOverride}
                      alt="Logo preview"
                      className="h-10 w-10 rounded-lg object-cover border bg-muted shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Replaces the initials avatar. Use a square image, ideally from your Cloudinary library.</p>
              </div>

              {/* Cover image URL */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cover / Banner Image URL</label>
                <div className="flex items-center gap-3">
                  <Input
                    placeholder="https://res.cloudinary.com/…/cover.jpg"
                    value={brandCoverImage}
                    onChange={(e) => setBrandCoverImage(e.target.value)}
                    className="flex-1"
                  />
                  {brandCoverImage && (
                    <img
                      src={brandCoverImage}
                      alt="Cover preview"
                      className="h-10 w-16 rounded-lg object-cover border bg-muted shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Wide banner at the top of your store page. Recommended 1200×400 px.</p>
              </div>

              <div className="flex justify-end">
                <Button onClick={() => saveBrandingMutation.mutate()} disabled={saveBrandingMutation.isPending}>
                  {saveBrandingMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving…</>
                  ) : brandingSaved ? (
                    <><Check className="h-4 w-4 mr-2" /> Saved!</>
                  ) : (
                    "Save Branding"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-workspace-shortcuts" className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Seller Workspace Shortcuts
              </CardTitle>
              <CardDescription>
                Quick links to the seller tools you use most.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/products")} data-testid="button-open-products">
                <Package className="h-4 w-4" />
                Products
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/categories")} data-testid="button-open-categories">
                <FolderTree className="h-4 w-4" />
                Categories
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/media-library")} data-testid="button-open-media-library">
                <ImageIcon className="h-4 w-4" />
                Media Library
              </Button>
              {allowSellerDirectSupportMessages ? (
                <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/messages")} data-testid="button-open-messages">
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </Button>
              ) : (
                <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/support")} data-testid="button-open-support">
                  <MessageSquare className="h-4 w-4" />
                  Contact Support
                </Button>
              )}
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/notifications")} data-testid="button-open-notifications">
                <Bell className="h-4 w-4" />
                Notifications
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/profile")} data-testid="button-edit-profile">
                <Store className="h-4 w-4" />
                Edit Store Profile
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/change-password")} data-testid="button-change-password">
                <SettingsIcon className="h-4 w-4" />
                Change Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <SellerUpgradeModal
        open={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
      />
    </DashboardLayout>
  );
}
