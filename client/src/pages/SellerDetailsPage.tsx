import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  ArrowLeft,
  BarChart3,
  Clock3,
  DollarSign,
  ExternalLink,
  Layers3,
  Loader2,
  Package,
  Percent,
  ShieldCheck,
  ShoppingBag,
  Star,
  Store,
  Wallet,
  RefreshCw,
} from "lucide-react";

type SellerUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  storeName?: string | null;
  storeDescription?: string | null;
  storeBanner?: string | null;
  storeType?: string | null;
  businessAddress?: string | null;
  isActive?: boolean;
  isApproved?: boolean;
  applicationStatus?: string | null;
  profileImage?: string | null;
  nationalIdCard?: string | null;
  ghanaCardFront?: string | null;
  ghanaCardBack?: string | null;
  createdAt?: string | null;
};

type SellerStore = {
  id: string;
  name: string;
  description?: string | null;
  banner?: string | null;
  logo?: string | null;
  category?: string | null;
  storeType?: string | null;
  isActive?: boolean | null;
  isApproved?: boolean | null;
  paystackSubaccountId?: string | null;
  isPayoutVerified?: boolean | null;
  createdAt?: string | null;
};

type SellerProduct = {
  id: string;
  name: string;
  description: string;
  images?: string[] | null;
  price: string;
  costPrice?: string | null;
  stock?: number | null;
  discount?: number | null;
  isActive?: boolean;
  ratings?: string | number | null;
  totalRatings?: number | null;
  categoryName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type SellerOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: string;
  total: string;
  image?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
};

type SellerSale = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string | null;
  deliveryMethod?: string | null;
  deliveryAddress?: string | null;
  subtotal?: string | null;
  deliveryFee?: string | null;
  processingFee?: string | null;
  couponDiscount?: string | null;
  total: string;
  currency?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  deliveredAt?: string | null;
  buyer?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  seller?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  rider?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  items: SellerOrderItem[];
  pickupStationInfo?: {
    id?: string | null;
    name?: string | null;
    city?: string | null;
    region?: string | null;
    locationLabel?: string | null;
    pickupAgentName?: string | null;
    pickupAgentPhone?: string | null;
  } | null;
};

type SellerPayout = {
  id: string;
  amount: string;
  currency?: string | null;
  method?: string | null;
  status: string;
  reference?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  processedAt?: string | null;
};

type SellerCommission = {
  id: string;
  orderId: string;
  orderAmount: string;
  commissionAmount: string;
  sellerAmount: string;
  commissionRate: string;
  status: string;
  createdAt?: string | null;
};

type SellerTopProduct = {
  productId: string;
  name: string;
  image?: string | null;
  unitsSold: number;
  revenue: number;
  ordersCount: number;
  product?: SellerProduct | null;
};

type ActivityItem = {
  type: string;
  title: string;
  description: string;
  status: string;
  at: string;
};

type SellerDashboardData = {
  seller: SellerUser;
  store?: SellerStore | null;
  summary: {
    totalSales: number;
    totalRevenue: number;
    totalPaid: number;
    salesThisMonth: number;
    revenueThisMonth: number;
    avgOrderValue: number;
    totalProducts: number;
    activeProducts: number;
    inactiveProducts: number;
    outOfStockProducts: number;
    lowStockProducts: number;
    totalStockUnits: number;
    averageProductRating: number;
    totalProductRatings: number;
    featuredProducts: number;
    totalCommissionCharged: number;
    netSellerProfit: number;
    availableBalance: number;
    completedPayoutValue: number;
    pendingPayoutValue: number;
  };
  sales: SellerSale[];
  payouts: SellerPayout[];
  commissions: SellerCommission[];
  products: SellerProduct[];
  topProducts: SellerTopProduct[];
  recentActivity: ActivityItem[];
};

type SellerDashboardBootstrapData = {
  seller: SellerUser;
  store?: SellerStore | null;
};

type SellerProductsSectionData = {
  products: SellerProduct[];
};

type SellerSalesSectionData = {
  sales: SellerSale[];
  topProducts: SellerTopProduct[];
};

type SellerFinanceSectionData = {
  payouts: SellerPayout[];
  commissions: SellerCommission[];
};

type SellerActivitySectionData = {
  recentActivity: ActivityItem[];
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  try {
    return format(new Date(value), "MMM dd, yyyy HH:mm");
  } catch {
    return "N/A";
  }
};

const moneyValue = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
const normalizeValue = (value?: string | null) => String(value || "").toLowerCase().trim();
const isPickupOrder = (deliveryMethod?: string | null) => {
  const normalized = normalizeValue(deliveryMethod);
  return normalized === "pickup" || normalized === "store_pickup" || normalized === "store pickup";
};

const SELLER_LOADING_MESSAGES = [
  "Loading seller overview and approval status.",
  "Checking product catalog, stock levels, and active listings.",
  "Reviewing paid orders, payouts, and finance performance.",
  "Preparing revenue, commission, and seller balance insights.",
  "Syncing recent seller activity so the page opens with fresh data.",
];

const EMPTY_SELLER_SUMMARY: SellerDashboardData["summary"] = {
  totalSales: 0,
  totalRevenue: 0,
  totalPaid: 0,
  salesThisMonth: 0,
  revenueThisMonth: 0,
  avgOrderValue: 0,
  totalProducts: 0,
  activeProducts: 0,
  inactiveProducts: 0,
  outOfStockProducts: 0,
  lowStockProducts: 0,
  totalStockUnits: 0,
  averageProductRating: 0,
  totalProductRatings: 0,
  featuredProducts: 0,
  totalCommissionCharged: 0,
  netSellerProfit: 0,
  availableBalance: 0,
  completedPayoutValue: 0,
  pendingPayoutValue: 0,
};

const statusTone = (status?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "approved", "active", "paid", "success"].includes(normalized)) return "default";
  if (["pending", "processing", "interview_scheduled"].includes(normalized)) return "secondary";
  if (["cancelled", "rejected", "failed", "inactive"].includes(normalized)) return "destructive";
  return "outline";
};

async function fetchSellerDashboardData<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    if (contentType.includes("text/html")) {
      throw new Error("The seller data request did not reach the JSON API correctly. Please retry.");
    }

    let parsed: any = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }

    if (!response.ok) {
      const message = parsed?.userMessage || parsed?.error || rawText || response.statusText;
      throw new Error(`${response.status}: ${message}`);
    }

    return parsed as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`This seller page is still loading after ${Math.round(timeoutMs / 1000)} seconds. Please try again.`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export default function SellerDetailsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const sellerId = params.id;
  const [activeTab, setActiveTab] = useState("overview");
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [displayedLoadingMessage, setDisplayedLoadingMessage] = useState("");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  const sellerDashboardEnabled =
    !!sellerId &&
    !authLoading &&
    isAuthenticated &&
    (user?.role === "admin" || user?.role === "super_admin");

  const bootstrapQuery = useQuery<SellerDashboardBootstrapData>({
    queryKey: [`/api/admin/sellers/${sellerId}/dashboard/bootstrap`],
    queryFn: () =>
      fetchSellerDashboardData<SellerDashboardBootstrapData>(
        `/api/admin/sellers/${sellerId}/dashboard/bootstrap`,
        20_000,
      ),
    enabled: sellerDashboardEnabled,
    retry: 1,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const liteQuery = useQuery<SellerDashboardData>({
    queryKey: [`/api/admin/sellers/${sellerId}/dashboard`, "summary"],
    queryFn: () => fetchSellerDashboardData<SellerDashboardData>(`/api/admin/sellers/${sellerId}/dashboard?lite=1`, 120_000),
    enabled: sellerDashboardEnabled && !!bootstrapQuery.data,
    retry: 1,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const productsQuery = useQuery<SellerProductsSectionData>({
    queryKey: [`/api/admin/sellers/${sellerId}/dashboard/products`],
    queryFn: () => fetchSellerDashboardData<SellerProductsSectionData>(`/api/admin/sellers/${sellerId}/dashboard/products`, 120_000),
    enabled: sellerDashboardEnabled && !!bootstrapQuery.data,
    retry: 2,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const salesQuery = useQuery<SellerSalesSectionData>({
    queryKey: [`/api/admin/sellers/${sellerId}/dashboard/sales`],
    queryFn: () => fetchSellerDashboardData<SellerSalesSectionData>(`/api/admin/sellers/${sellerId}/dashboard/sales`, 120_000),
    enabled: sellerDashboardEnabled && !!bootstrapQuery.data,
    retry: 2,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const financeQuery = useQuery<SellerFinanceSectionData>({
    queryKey: [`/api/admin/sellers/${sellerId}/dashboard/finance`],
    queryFn: () => fetchSellerDashboardData<SellerFinanceSectionData>(`/api/admin/sellers/${sellerId}/dashboard/finance`, 120_000),
    enabled: sellerDashboardEnabled && !!bootstrapQuery.data,
    retry: 2,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const activityQuery = useQuery<SellerActivitySectionData>({
    queryKey: [`/api/admin/sellers/${sellerId}/dashboard/activity`],
    queryFn: () => fetchSellerDashboardData<SellerActivitySectionData>(`/api/admin/sellers/${sellerId}/dashboard/activity`, 120_000),
    enabled: sellerDashboardEnabled && !!bootstrapQuery.data,
    retry: 2,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const data = liteQuery.data;
  const bootstrapData = bootstrapQuery.data;
  const isLoading = bootstrapQuery.isLoading;
  const error = bootstrapQuery.error;
  const sectionQueries = [productsQuery, salesQuery, financeQuery, activityQuery];
  const loadingSectionCount = sectionQueries.filter((query) => query.isLoading || query.isFetching).length;
  const failedSectionCount = sectionQueries.filter((query) => !!query.error).length;
  const completedSectionCount = sectionQueries.filter((query) => !!query.data).length;
  const summaryStillLoading = !!bootstrapData && (liteQuery.isLoading || liteQuery.isFetching) && !liteQuery.data;
  const summaryUnavailable = !!bootstrapData && !!liteQuery.error && !liteQuery.data;
  const isEnrichingSellerData =
    !!bootstrapData && ((!!liteQuery.data && loadingSectionCount > 0) || summaryStillLoading);
  const fullDataUnavailable = (!!liteQuery.data && failedSectionCount > 0) || summaryUnavailable;
  const activeDataMode =
    completedSectionCount === sectionQueries.length
      ? "full"
      : liteQuery.data
        ? "summary"
        : "shell";
  const refetchAll = async () => {
    await bootstrapQuery.refetch();
    await liteQuery.refetch();
    await Promise.all([
      productsQuery.refetch(),
      salesQuery.refetch(),
      financeQuery.refetch(),
      activityQuery.refetch(),
    ]);
  };

  const sellerDataStatusNote = useMemo(() => {
    if (summaryStillLoading) {
      return "Seller identity and store information are already open. Live revenue and operations totals are still syncing in the background.";
    }
    if (summaryUnavailable) {
      return "The seller page is open with verified store identity, but the summary totals are not ready yet. You can retry without closing this page.";
    }
    if (isEnrichingSellerData) {
      return "Opening the seller page with live summary data now. Product, sales, finance, and activity sections are loading in the background.";
    }
    if (fullDataUnavailable) {
      return "Some extended seller sections are still unavailable. The overview below is real live data, and you can retry only the affected sections.";
    }
    if (activeDataMode === "full") {
      return "Full seller store intelligence is loaded from the live admin source.";
    }
    return null;
  }, [activeDataMode, fullDataUnavailable, isEnrichingSellerData, summaryStillLoading, summaryUnavailable]);

  useEffect(() => {
    if (!sellerId || !isLoading) return;
    setLoadingMessageIndex(0);
    const intervalId = window.setInterval(() => {
      setLoadingMessageIndex((current) => (current + 1) % SELLER_LOADING_MESSAGES.length);
    }, 2200);

    return () => window.clearInterval(intervalId);
  }, [isLoading, sellerId]);

  useEffect(() => {
    if (!isLoading) {
      setDisplayedLoadingMessage("");
      return;
    }

    const currentMessage = SELLER_LOADING_MESSAGES[loadingMessageIndex];
    setDisplayedLoadingMessage("");

    let characterIndex = 0;
    const intervalId = window.setInterval(() => {
      characterIndex += 1;
      setDisplayedLoadingMessage(currentMessage.slice(0, characterIndex));
      if (characterIndex >= currentMessage.length) {
        window.clearInterval(intervalId);
      }
    }, 28);

    return () => window.clearInterval(intervalId);
  }, [isLoading, loadingMessageIndex]);

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading) {
    return (
      <DashboardLayout role={user?.role as any}>
        <div className="flex min-h-[70vh] items-center justify-center p-6 md:p-10">
          <Card className="w-full max-w-3xl overflow-hidden border-border/70 shadow-sm">
            <CardContent className="p-0">
              <div className="border-b border-border/70 bg-gradient-to-r from-primary/12 via-background to-primary/5 px-6 py-6 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10">
                  <Loader2 className="h-7 w-7 animate-spin text-primary" />
                </div>
                <h2 className="text-2xl font-semibold">Opening seller command view</h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">
                  We are pulling seller profile, finance, catalog, and order intelligence into one place.
                </p>
              </div>

              <div className="space-y-6 px-6 py-6">
                <div className="rounded-2xl border border-primary/15 bg-primary/5 px-5 py-4 text-center">
                  <p className="text-xs font-semibold uppercase tracking-[0.26em] text-primary/80">
                    Live Load Status
                  </p>
                  <p
                    key={loadingMessageIndex}
                    className="mt-3 animate-in fade-in-0 slide-in-from-bottom-1 text-base font-medium text-foreground duration-500"
                  >
                    {displayedLoadingMessage}
                    <span className="ml-0.5 inline-block h-5 w-[1px] animate-pulse bg-primary align-[-2px]" />
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Seller Page</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Profile, store status, approval, and compliance records are being prepared.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Finance</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Revenue, paid volume, payouts, and commission values are being reconciled.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-muted/20 p-4">
                    <p className="text-xs uppercase tracking-[0.22em] text-muted-foreground">Operations</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Product counts, stock movement, and recent commercial activity are being loaded.
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (!sellerId || error || !bootstrapData) {
    return (
      <DashboardLayout role={user?.role as any}>
        <div className="flex min-h-[60vh] items-center justify-center p-6">
          <Card className="w-full max-w-xl">
            <CardContent className="space-y-4 p-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                <Store className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Seller page could not be loaded</h2>
                <p className="text-sm text-muted-foreground">
                  {error instanceof Error && !/api\/admin\/sellers\//i.test(error.message)
                    ? error.message
                    : "We could not load this seller profile right now. Please retry shortly."}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <Button variant="outline" onClick={() => navigate("/admin/sellers")}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to Sellers
                </Button>
                <Button onClick={() => refetchAll()}>
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const seller = data?.seller ?? bootstrapData.seller;
  const store = data?.store ?? bootstrapData.store ?? null;
  const summary = data?.summary ?? EMPTY_SELLER_SUMMARY;
  const products = productsQuery.data?.products ?? data?.products ?? [];
  const sales = salesQuery.data?.sales ?? data?.sales ?? [];
  const payouts = financeQuery.data?.payouts ?? data?.payouts ?? [];
  const commissions = financeQuery.data?.commissions ?? data?.commissions ?? [];
  const topProducts = salesQuery.data?.topProducts ?? data?.topProducts ?? [];
  const recentActivity = activityQuery.data?.recentActivity ?? data?.recentActivity ?? [];
  const banner = seller.storeBanner || store?.banner || null;
  const avatar = seller.profileImage || store?.logo || null;
  type SectionQueryState = {
    isLoading: boolean;
    isFetching: boolean;
    error: unknown;
    refetch: () => Promise<unknown>;
  };

  const renderSectionFallback = (
    title: string,
    query: SectionQueryState,
    emptyMessage: string,
  ) => {
    if (query.isLoading || query.isFetching) {
      return (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>{title} is loading in the background.</span>
          </CardContent>
        </Card>
      );
    }

    if (query.error) {
      return (
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{title} could not be loaded yet. You can retry this section without reloading the full seller page.</span>
            <Button variant="outline" size="sm" onClick={() => query.refetch()} disabled={query.isFetching}>
              {query.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Retry Section
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">{emptyMessage}</CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/sellers")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold" data-testid="heading-seller-dashboard">Seller Command View</h1>
            <p className="text-sm text-muted-foreground">Unified seller profile, catalog, sales, finance, and activity.</p>
          </div>
            <div className="flex items-center gap-2">
              <Badge variant={activeDataMode === "full" ? "default" : "secondary"}>
                    {activeDataMode === "full" ? "Full Store Data" : liteQuery.data ? "Live Summary" : "Seller Shell"}
                  </Badge>
              {(isEnrichingSellerData || fullDataUnavailable) ? (
                <Button variant="outline" size="sm" onClick={() => refetchAll()} disabled={sectionQueries.some((query) => query.isFetching)}>
                  {sectionQueries.some((query) => query.isFetching) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  {fullDataUnavailable ? "Retry Sections" : "Refreshing"}
                </Button>
              ) : null}
            </div>
        </div>

        {sellerDataStatusNote ? (
          <Card className="border-border/70 bg-muted/20">
            <CardContent className="flex flex-col gap-3 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <p>{sellerDataStatusNote}</p>
              {(isEnrichingSellerData || fullDataUnavailable) ? (
                <div className="flex items-center gap-2 text-xs">
                  {isEnrichingSellerData ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : null}
                  <span>
                    {isEnrichingSellerData
                      ? `${loadingSectionCount} extended seller section${loadingSectionCount === 1 ? "" : "s"} still syncing.`
                      : `${failedSectionCount} extended seller section${failedSectionCount === 1 ? "" : "s"} ready to retry.`}
                  </span>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden border-border/70">
          <div className="relative h-40 bg-gradient-to-r from-primary/25 via-primary/10 to-background">
            {banner ? <img src={banner} alt={`${seller.storeName || seller.name} banner`} className="h-full w-full object-cover" /> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-background/20 via-transparent to-background/30" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
          </div>
          <CardContent className="relative px-6 pb-6 pt-0">
            <div className="-mt-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-end gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-background bg-muted shadow-lg">
                  {avatar ? (
                    <img src={avatar} alt={`${seller.name} profile`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Store className="h-8 w-8 text-primary" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 pb-1">
                  <h2 className="truncate text-2xl font-semibold">{seller.name}</h2>
                  <p className="truncate text-base text-primary">{seller.storeName || store?.name || "Seller account"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={seller.isActive ? "default" : "destructive"}>{seller.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge variant={seller.isApproved ? "default" : "secondary"}>{seller.isApproved ? "Approved" : "Pending approval"}</Badge>
                    {seller.applicationStatus ? <Badge variant="outline">{seller.applicationStatus.replace(/_/g, " ")}</Badge> : null}
                    {store?.isPayoutVerified ? <Badge variant="outline">Payout verified</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Gross Revenue</p><p className="text-lg font-semibold">{formatPrice(summary.totalRevenue)}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Net Profit</p><p className="text-lg font-semibold">{formatPrice(summary.netSellerProfit)}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Products</p><p className="text-lg font-semibold">{summary.totalProducts}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Available Balance</p><p className="text-lg font-semibold">{formatPrice(summary.availableBalance)}</p></CardContent></Card>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Orders</span><ShoppingBag className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.totalSales}</p><p className="mt-1 text-xs text-muted-foreground">{summary.salesThisMonth} this month</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Commission</span><Percent className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.totalCommissionCharged)}</p><p className="mt-1 text-xs text-muted-foreground">Platform charges across all orders</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Inventory Units</span><Package className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.totalStockUnits}</p><p className="mt-1 text-xs text-muted-foreground">{summary.outOfStockProducts} out of stock, {summary.lowStockProducts} low stock</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Product Rating</span><Star className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.averageProductRating.toFixed(1)}</p><p className="mt-1 text-xs text-muted-foreground">{summary.totalProductRatings} total ratings</p></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="sales">Sales</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card className="xl:col-span-1">
                <CardHeader><CardTitle>Profile & Compliance</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Email</p><p className="font-medium">{seller.email}</p></div>
                  <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{seller.phone || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">Business Address</p><p className="font-medium">{seller.businessAddress || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">National ID</p><p className="font-medium">{seller.nationalIdCard || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">Joined</p><p className="font-medium">{formatDateTime(seller.createdAt)}</p></div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="overflow-hidden rounded-xl border bg-muted/40">
                      {seller.ghanaCardFront ? <img src={seller.ghanaCardFront} alt="Ghana card front" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No front ID</div>}
                      <div className="border-t px-3 py-2 text-xs text-muted-foreground">Ghana card front</div>
                    </div>
                    <div className="overflow-hidden rounded-xl border bg-muted/40">
                      {seller.ghanaCardBack ? <img src={seller.ghanaCardBack} alt="Ghana card back" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No back ID</div>}
                      <div className="border-t px-3 py-2 text-xs text-muted-foreground">Ghana card back</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="xl:col-span-1">
                <CardHeader><CardTitle>Store Operations</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Store Name</p><p className="font-medium">{store?.name || seller.storeName || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Store Type</p><p className="font-medium">{seller.storeType || store?.storeType || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Store Status</p><div className="flex flex-wrap gap-2"><Badge variant={store?.isActive ? "default" : "destructive"}>{store?.isActive ? "Store active" : "Store inactive"}</Badge><Badge variant={store?.isApproved ? "default" : "secondary"}>{store?.isApproved ? "Store approved" : "Store pending"}</Badge></div></div>
                  <div><p className="text-muted-foreground">Payout Verification</p><p className="font-medium">{store?.isPayoutVerified ? "Verified" : "Pending verification"}</p></div>
                  <div><p className="text-muted-foreground">Paystack Subaccount</p><p className="font-medium break-all">{store?.paystackSubaccountId || "Not connected"}</p></div>
                  <div><p className="text-muted-foreground">Description</p><p className="font-medium">{store?.description || seller.storeDescription || "No store description"}</p></div>
                </CardContent>
              </Card>

              <Card className="xl:col-span-1">
                <CardHeader><CardTitle>Commercial Snapshot</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Active Products</p><p className="text-xl font-semibold">{summary.activeProducts}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Inactive Products</p><p className="text-xl font-semibold">{summary.inactiveProducts}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Featured</p><p className="text-xl font-semibold">{summary.featuredProducts}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Payout Pending</p><p className="text-xl font-semibold">{formatPrice(summary.pendingPayoutValue)}</p></CardContent></Card>
                  </div>
                  <div>
                    <p className="mb-2 text-muted-foreground">Top products by revenue</p>
                    <div className="space-y-2">
                       {salesQuery.isLoading || salesQuery.isFetching ? <p className="text-sm text-muted-foreground">Top product performance is loading.</p> : topProducts.length === 0 ? <p className="text-sm text-muted-foreground">No product performance data yet.</p> : topProducts.slice(0, 4).map((product) => (
                         <div key={product.productId} className="flex items-center gap-3 rounded-xl border p-3">
                           <div className="h-12 w-12 overflow-hidden rounded-xl bg-muted">{product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : <div className="flex h-full w-full items-center justify-center"><Package className="h-4 w-4 text-muted-foreground" /></div>}</div>
                           <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{product.name}</p>
                            <p className="text-xs text-muted-foreground">{product.unitsSold} units across {product.ordersCount} orders</p>
                          </div>
                          <p className="text-sm font-semibold">{formatPrice(product.revenue)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="activity" className="space-y-6">
            {activityQuery.data ? (
              <Card>
                <CardHeader><CardTitle>Recent Activity Feed</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {recentActivity.length === 0 ? <p className="text-sm text-muted-foreground">No recent activity.</p> : recentActivity.map((item, index) => (
                      <div key={`${item.type}-${index}`} className="rounded-2xl border border-border/70 bg-muted/10 p-4 shadow-sm">
                        <div className="mb-4 h-1.5 w-14 rounded-full bg-primary/80" />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{item.title}</p>
                            <Badge variant={statusTone(item.status) as any}>{item.status}</Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                          <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.at)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : renderSectionFallback("Activity feed", activityQuery, "No recent activity.")}
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            {productsQuery.data ? (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <Card key={product.id} className="overflow-hidden border-border/60 bg-card/95 shadow-sm">
                    <div className="border-b bg-muted/30 p-3">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted">
                        {product.images?.[0] ? (
                          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-background/95 via-background/35 to-transparent p-3">
                          <Badge variant="outline" className="border-white/20 bg-background/80 backdrop-blur">
                            {product.categoryName || "Uncategorized"}
                          </Badge>
                          <Badge variant={product.isActive ? "default" : "secondary"}>
                            {product.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <CardContent className="space-y-4 p-5">
                      <div className="space-y-2">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold">{product.name}</p>
                            <p className="text-sm text-muted-foreground">Updated {formatDateTime(product.updatedAt || product.createdAt)}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Price</p>
                            <p className="text-base font-semibold">{formatPrice(moneyValue(product.price))}</p>
                          </div>
                        </div>
                      </div>
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{product.description}</p>
                      <div className="grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Cost</p>
                          <p className="mt-1 font-medium">{formatPrice(moneyValue(product.costPrice))}</p>
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Stock</p>
                          <p className="mt-1 font-medium">{product.stock ?? 0}</p>
                        </div>
                        <div className="rounded-xl border bg-muted/20 p-3">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Rating</p>
                          <p className="mt-1 font-medium">{moneyValue(product.ratings).toFixed(1)} ({product.totalRatings || 0})</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : renderSectionFallback("Products", productsQuery, "No products found for this seller.")}
          </TabsContent>

          <TabsContent value="sales" className="space-y-4">
            {!salesQuery.data ? renderSectionFallback("Sales records", salesQuery, "No sales recorded for this seller.") : sales.length === 0 ? <Card><CardContent className="p-8 text-sm text-muted-foreground">No sales recorded for this seller.</CardContent></Card> : sales.map((order) => (
              <Card key={order.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Order #{order.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{order.buyer?.name || "Buyer"} • {order.buyer?.email || "No email"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusTone(order.status) as any}>{order.status}</Badge>
                      <Badge variant={statusTone(order.paymentStatus) as any}>{order.paymentStatus || "payment unknown"}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-5 text-sm">
                    <div><p className="text-muted-foreground">Total</p><p className="font-medium">{formatPrice(moneyValue(order.total))}</p></div>
                    <div><p className="text-muted-foreground">Subtotal</p><p className="font-medium">{formatPrice(moneyValue(order.subtotal))}</p></div>
                    <div>
                      <p className="text-muted-foreground">{isPickupOrder(order.deliveryMethod) ? "Pickup" : "Delivery Fee"}</p>
                      <p className="font-medium">
                        {isPickupOrder(order.deliveryMethod)
                          ? order.pickupStationInfo?.locationLabel || "Pickup station not set"
                          : formatPrice(moneyValue(order.deliveryFee))}
                      </p>
                    </div>
                    <div><p className="text-muted-foreground">Processing Fee</p><p className="font-medium">{formatPrice(moneyValue(order.processingFee))}</p></div>
                    <div><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDateTime(order.createdAt)}</p></div>
                  </div>
                  <div className={`grid grid-cols-1 gap-3 ${order.rider && showInternalRiderFeatures ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="text-muted-foreground">Customer</p>
                      <p className="font-medium">{order.buyer?.name || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{order.buyer?.email || "No email"}</p>
                      <p className="text-xs text-muted-foreground">{order.buyer?.phone || "No phone"}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="text-muted-foreground">Seller</p>
                      <p className="font-medium">{order.seller?.name || seller.name}</p>
                      <p className="text-xs text-muted-foreground">{order.seller?.email || seller.email}</p>
                      <p className="text-xs text-muted-foreground">{order.seller?.phone || seller.phone || "No phone"}</p>
                    </div>
                    {order.rider && showInternalRiderFeatures ? (
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-muted-foreground">Assigned Rider</p>
                        <p className="font-medium">{order.rider.name}</p>
                        <p className="text-xs text-muted-foreground">{order.rider.email || "No email"}</p>
                        <p className="text-xs text-muted-foreground">{order.rider.phone || "No phone"}</p>
                      </div>
                    ) : null}
                  </div>
                  {order.items.length > 0 ? (
                    <div className="space-y-2 rounded-xl border p-3">
                      <p className="text-sm font-medium">Order Items</p>
                      {order.items.map((item) => (
                        <div key={`${order.id}-${item.productId}`} className="flex items-center gap-3 text-sm">
                          <div className="h-12 w-12 overflow-hidden rounded-lg bg-muted">
                            {item.image ? <img src={item.image} alt={item.productName} className="h-full w-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              Qty {item.quantity}
                              {item.selectedColor ? ` • Color: ${item.selectedColor}` : ""}
                              {item.selectedSize ? ` • Size: ${item.selectedSize}` : ""}
                            </p>
                          </div>
                          <p className="font-medium">{formatPrice(moneyValue(item.total))}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {isPickupOrder(order.deliveryMethod) ? (
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="text-muted-foreground">Pickup Location</p>
                      <p className="font-medium">{order.pickupStationInfo?.locationLabel || "Pickup station not set"}</p>
                      {order.pickupStationInfo?.pickupAgentPhone ? (
                        <p className="text-xs text-muted-foreground">
                          {order.pickupStationInfo.pickupAgentName || "Pickup agent"} • {order.pickupStationInfo.pickupAgentPhone}
                        </p>
                      ) : null}
                    </div>
                  ) : order.deliveryAddress ? <p className="text-sm text-muted-foreground">Delivery address: {order.deliveryAddress}</p> : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="finance" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Paid Volume</span><DollarSign className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.totalPaid)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completed Payouts</span><Wallet className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.completedPayoutValue)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pending Payouts</span><Clock3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.pendingPayoutValue)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Average Order</span><BarChart3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.avgOrderValue)}</p></CardContent></Card>
            </div>

            {!financeQuery.data ? renderSectionFallback("Finance ledgers", financeQuery, "No finance records available for this seller.") : (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Payout Ledger</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {payouts.length === 0 ? <p className="text-sm text-muted-foreground">No payout records.</p> : payouts.map((payout) => (
                      <div key={payout.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{payout.reference || payout.id}</p>
                          <Badge variant={statusTone(payout.status) as any}>{payout.status}</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3 text-sm">
                          <div><p className="text-muted-foreground">Amount</p><p className="font-medium">{formatPrice(moneyValue(payout.amount))}</p></div>
                          <div><p className="text-muted-foreground">Method</p><p className="font-medium">{payout.method || "N/A"}</p></div>
                          <div><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDateTime(payout.createdAt)}</p></div>
                        </div>
                        {payout.notes ? <p className="mt-3 text-sm text-muted-foreground">{payout.notes}</p> : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Commission Ledger</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    {commissions.length === 0 ? <p className="text-sm text-muted-foreground">No commission records.</p> : commissions.map((commission) => (
                      <div key={commission.id} className="rounded-xl border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">Order {commission.orderId.slice(0, 8)}</p>
                          <Badge variant={statusTone(commission.status) as any}>{commission.status}</Badge>
                        </div>
                        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4 text-sm">
                          <div><p className="text-muted-foreground">Gross</p><p className="font-medium">{formatPrice(moneyValue(commission.orderAmount))}</p></div>
                          <div><p className="text-muted-foreground">Commission</p><p className="font-medium">{formatPrice(moneyValue(commission.commissionAmount))}</p></div>
                          <div><p className="text-muted-foreground">Net</p><p className="font-medium">{formatPrice(moneyValue(commission.sellerAmount))}</p></div>
                          <div><p className="text-muted-foreground">Rate</p><p className="font-medium">{commission.commissionRate}%</p></div>
                        </div>
                        <p className="mt-3 text-xs text-muted-foreground">{formatDateTime(commission.createdAt)}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
