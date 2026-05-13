import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { MobileSellerDashboard } from "@/pages/mobile/MobileSellerDashboard";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, Package, ShoppingBag, TrendingUp, Loader2, AlertCircle, Plus, Pencil, Trash2, Tag, Truck } from "lucide-react";
import { Stack, CalendarCheck, Infinity as PhInfinity, Storefront, ArrowCircleUp } from "@phosphor-icons/react";
import { PaystackInlineService } from "@/lib/paystackInline";
import { SellerUpgradeModal } from "@/components/SellerUpgradeModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState, SectionLoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
  sellerSettlementTotal?: number;
  platformCommissionTotal?: number;
  processingFeesTotal?: number;
  pendingPayoutValue?: number;
  availableBalance?: number;
  completedPayoutValue?: number;
  totalDeliveries?: number;
  totalPickups?: number;
}

interface SellerDashboardMetricSnapshot {
  totalRevenue: number;
  pendingDeliveryOrders: number;
  pendingPickupOrders: number;
  completedDeliveryOrders: number;
  completedPickupOrders: number;
  cancelledFulfillmentOrders: number;
  awaitingPaymentOrders: number;
  sellerOrdersCount: number;
  pendingOrders: number;
  remainingStockUnits: number;
}

interface SellerOrdersResponse {
  orders?: Order[];
  total?: number;
}

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string | null;
  images: string[];
  discount: number | null;
  sellerId: string;
  isActive: boolean;
  ratings?: number | string | null;
  totalRatings?: number | null;
  stock?: number | null;
  dynamicFields?: Record<string, any> | null;
}

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  sellerId: string;
  createdAt?: string;
  total?: string | number | null;
  subtotal?: string | number | null;
  couponDiscount?: string | number | null;
  paymentStatus?: string | null;
  deliveryMethod?: string | null;
  riderId?: string | null;
}

interface SellerProfileSummary {
  storeType?: string | null;
  storeName?: string | null;
  storeDescription?: string | null;
  storeBanner?: string | null;
  businessAddress?: string | null;
}

interface PublicPlatformSettings {
  allowSellerBankPayouts?: boolean;
  allowSellerDirectSupportMessages?: boolean;
  isMultiVendor?: boolean;
  referralEnabled?: boolean;
}

interface Coupon {
  id: string;
  code: string;
  sellerId: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumPurchase: string;
  usageLimit: number | null;
  usedCount: number;
  expiryDate: string | null;
  isActive: boolean;
  createdAt: string;
}

const couponFormSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").toUpperCase(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.string().min(1, "Discount value is required"),
  minimumPurchase: z.string().optional(),
  usageLimit: z.string().optional(),
  expiryDate: z.string().optional(),
  isActive: z.boolean().default(true),
}).refine((data) => {
  if (data.discountType === "percentage") {
    const value = parseFloat(data.discountValue);
    return value >= 0 && value <= 100;
  }
  return true;
}, {
  message: "Percentage discount must be between 0 and 100",
  path: ["discountValue"],
});

type CouponFormData = z.infer<typeof couponFormSchema>;

const getProductRemainingStock = (product: Product) => {
  const variantSummary = Array.isArray(product?.dynamicFields?.variantSummary)
    ? product.dynamicFields.variantSummary
    : [];
  const productStock = Number(product?.stock);
  const normalizedProductStock = Number.isFinite(productStock) ? Math.max(0, productStock) : null;

  if (variantSummary.length > 0) {
    const summaryStock = variantSummary.reduce((sum: number, variant: any) => {
      return sum + Math.max(0, Number(variant?.stock || 0));
    }, 0);
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


const SELLER_NAV_ROUTES: Record<string, string> = {
  "media-library": "/seller/media-library",
  products: "/seller/products",
  categories: "/seller/categories",
  orders: "/seller/orders",
  promotions: "/seller/promotions",
  deliveries: "/seller/deliveries",
  "payment-setup": "/seller/payment-setup",
  messages: "/seller/messages",
  support: "/support",
  analytics: "/seller/analytics",
  settings: "/seller/settings",
  notifications: "/seller/notifications",
  reviews: "/seller/reviews",
  "my-cart": "/cart",
  "my-purchases": "/orders",
  "my-wishlist": "/wishlist",
};

function safeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SellerDashboardConnected() {
  const [activeItem, setActiveItem] = useState("dashboard");
  const [lastGoodRecentOrders, setLastGoodRecentOrders] = useState<Order[]>([]);
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const { data: publicSettings } = useQuery<PublicPlatformSettings>({
    queryKey: ["/api/public/platform-settings", "seller-dashboard"],
    queryFn: async () => fetchApiJson<PublicPlatformSettings>("/api/public/platform-settings"),
  });
  const bankPayoutsAllowed = publicSettings?.allowSellerBankPayouts !== false;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [justUpgraded, setJustUpgraded] = useState(false);
  const upgradePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevPlanRef = useRef<string | null | undefined>(undefined);
  const [lastGoodMetrics, setLastGoodMetrics] = useState<SellerDashboardMetricSnapshot | null>(null);
  const metricsStorageKey = user?.id ? `seller-dashboard-metrics:${user.id}` : null;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  useEffect(() => {
    if (!authLoading && isAuthenticated && user?.role === "seller" && user?.isActive === false) {
      navigate("/seller/messages");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  useEffect(() => {
    // Update activeItem based on current route
    const path = location;
    if (path === "/seller" || path === "/seller/") {
      setActiveItem("dashboard");
    } else if (path.includes("/seller/products")) {
      setActiveItem("products");
    } else if (path.includes("/seller/categories")) {
      setActiveItem("categories");
    } else if (path.includes("/seller/orders")) {
      setActiveItem("orders");
    } else if (path.includes("/seller/promotions")) {
      setActiveItem("promotions");
    } else if (path.includes("/seller/coupons")) {
      setActiveItem("coupons");
    } else if (path.includes("/seller/deliveries")) {
      setActiveItem("deliveries");
    } else if (path.includes("/seller/messages")) {
      setActiveItem("messages");
    } else if (path.includes("/support")) {
      setActiveItem("support");
    } else if (path.includes("/seller/analytics")) {
      setActiveItem("analytics");
    } else if (path.includes("/seller/reviews")) {
      setActiveItem("reviews");
    } else if (path.includes("/seller/settings")) {
      setActiveItem("settings");
    } else if (path.includes("/seller/notifications")) {
      setActiveItem("notifications");
    } else if (path === "/cart") {
      setActiveItem("my-cart");
    } else if (path === "/orders") {
      setActiveItem("my-purchases");
    } else if (path === "/wishlist") {
      setActiveItem("my-wishlist");
    } else if (path.includes("/notifications")) {
      setActiveItem("notifications");
    }
  }, [location]);

  useEffect(() => {
    // Navigate when sidebar item is clicked
    switch(activeItem) {
      case "dashboard":
        // Already on dashboard
        break;
      case "media-library":
        navigate("/seller/media-library");
        break;
      case "products":
        navigate("/seller/products");
        break;
      case "categories":
        navigate("/seller/categories");
        break;
      case "orders":
        navigate("/seller/orders");
        break;
      case "coupons":
        // Stays on dashboard showing coupons section
        break;
      case "deliveries":
        navigate("/seller/deliveries");
        break;
      case "payment-setup":
        navigate("/seller/payment-setup");
        break;
      case "messages":
        navigate("/seller/messages");
        break;
      case "support":
        navigate("/support");
        break;
      case "analytics":
        navigate("/seller/analytics");
        break;
      case "reviews":
        navigate("/seller/reviews");
        break;
      case "settings":
        navigate("/seller/settings");
        break;
      case "notifications":
        navigate("/seller/notifications");
        break;
      case "my-cart":
        navigate("/cart");
        break;
      case "my-purchases":
        navigate("/orders");
        break;
      case "my-wishlist":
        navigate("/wishlist");
        break;
      case "referral":
        navigate("/referral");
        break;
      default: {
        const targetRoute = SELLER_NAV_ROUTES[activeItem];
        if (targetRoute) {
          navigate(targetRoute);
        } else {
          setActiveItem("dashboard");
        }
        break;
      }
    }
  }, [activeItem, navigate]);

  const { data: store, refetch: refetchStore, isFetching: isStoreRefreshing } = useQuery<{
    paystackSubaccountId?: string;
    payoutType?: "bank_account" | "mobile_money";
    payoutDetails?: {
      accountName?: string;
      accountNumber?: string;
      bankCode?: string;
      bankName?: string;
      mobileNumber?: string;
      provider?: string;
    };
    isPayoutVerified?: boolean;
  }>({
    queryKey: ["/api/stores/my-store"],
    enabled: isAuthenticated && user?.role === "seller",
  });

  const hasCompletePayoutSetup = Boolean(
    store?.paystackSubaccountId &&
    store?.isPayoutVerified &&
    (
      (store?.payoutType === "bank_account" &&
        store?.payoutDetails?.bankCode &&
        store?.payoutDetails?.bankName &&
        store?.payoutDetails?.accountNumber &&
        store?.payoutDetails?.accountName) ||
      (store?.payoutType === "mobile_money" &&
        store?.payoutDetails?.provider &&
        store?.payoutDetails?.mobileNumber)
    )
  );

  const { data: sellerProfile, refetch: refetchSellerProfile } = useQuery<SellerProfileSummary>({
    queryKey: ["/api/auth/me", "seller-completeness", user?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/me");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "seller",
  });

  const missingStoreFields = [
    { key: "storeType", label: "Store type" },
    { key: "storeName", label: "Store name" },
    { key: "storeDescription", label: "Store description" },
    { key: "storeBanner", label: "Store banner image" },
    { key: "businessAddress", label: "Business address" },
  ].filter(({ key }) => {
    const value = (sellerProfile as Record<string, any> | undefined)?.[key];
    return value === null || value === undefined || value === "";
  });

  useEffect(() => {
    if (!sellerProfile || missingStoreFields.length === 0) {
      return;
    }
    if (location.startsWith("/profile")) {
      return;
    }

    toast({
      title: "Complete Store Information",
      description: `Missing required fields: ${missingStoreFields.map((field) => field.label).join(", ")}. Please complete your profile.`,
    });
    navigate("/profile");
  }, [sellerProfile, missingStoreFields, location, navigate, toast]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "seller" || !store) return;
    if (!location.startsWith("/seller")) return;
    if (location.startsWith("/seller/payment-setup")) return;
    if (hasCompletePayoutSetup) return;

    toast({
      title: "Payment Setup Required",
      description: "Complete your momo or bank payout setup before continuing with seller operations.",
    });
    navigate("/seller/payment-setup");
  }, [hasCompletePayoutSetup, isAuthenticated, location, navigate, store, toast, user?.role]);

  const { data: analytics, isLoading: analyticsLoading, refetch: refetchAnalytics } = useQuery<Partial<Analytics>>({
    queryKey: ["/api/analytics", user?.id, user?.role],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/analytics");
      const data = await res.json();
      return data && typeof data === "object" ? data : {};
    },
    enabled: isAuthenticated && user?.role === "seller",
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: products = [], isLoading: productsLoading, refetch: refetchProducts } = useQuery<Product[]>({
    queryKey: ["/api/products", "seller-dashboard", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      return fetchApiJson<Product[]>(`/api/products?sellerId=${encodeURIComponent(user.id)}`);
    },
    enabled: isAuthenticated && user?.role === "seller" && !!user?.id,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

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
  }
  const { data: tierInfo } = useQuery<TierInfo>({
    queryKey: ["/api/seller/tier-info"],
    enabled: isAuthenticated && user?.role === "seller",
    staleTime: 15000,
  });

  // Clear justUpgraded only when tier-info actually reflects a plan change.
  // Only watch sellerUpgradePlan — not isPremiumSeller (which may already be true
  // for existing premium sellers, causing premature clearing).
  useEffect(() => {
    if (!justUpgraded || !tierInfo) return;
    const planChanged = tierInfo.sellerUpgradePlan !== prevPlanRef.current;
    if (planChanged) {
      if (upgradePollRef.current) { clearInterval(upgradePollRef.current); upgradePollRef.current = null; }
      setJustUpgraded(false);
    }
  }, [tierInfo?.sellerUpgradePlan, justUpgraded]);

  const {
    data: sellerOrdersResponse,
    isLoading: ordersLoading,
    isFetching: ordersFetching,
    isFetched: ordersFetched,
    refetch: refetchOrders,
  } = useQuery<SellerOrdersResponse>({
    queryKey: ["/api/orders", "seller-dashboard", user?.id],
    queryFn: async () => {
      const result = await fetchApiJson<Order[] | SellerOrdersResponse>("/api/orders?context=seller&includeItems=false");
      if (Array.isArray(result)) {
        return {
          orders: result,
          total: result.length,
        };
      }
      return {
        orders: Array.isArray(result?.orders) ? result.orders : [],
        total: typeof result?.total === "number" ? result.total : undefined,
      };
    },
    enabled: isAuthenticated && user?.role === "seller",
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: coupons = [], isLoading: couponsLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/coupons"],
    enabled: isAuthenticated && user?.role === "seller" && activeItem === "coupons",
  });

  const form = useForm<CouponFormData>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      discountType: "percentage",
      discountValue: "",
      minimumPurchase: "",
      usageLimit: "",
      expiryDate: "",
      isActive: true,
    },
  });

  const createCouponMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      return apiRequest("POST", "/api/coupons", {
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minimumPurchase: data.minimumPurchase || "0",
        usageLimit: data.usageLimit ? parseInt(data.usageLimit) : null,
        expiryDate: data.expiryDate || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon created successfully",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create coupon",
        variant: "destructive",
      });
    },
  });

  const updateCouponMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CouponFormData }) => {
      return apiRequest("PATCH", `/api/coupons/${id}`, {
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minimumPurchase: data.minimumPurchase || "0",
        usageLimit: data.usageLimit ? parseInt(data.usageLimit) : null,
        expiryDate: data.expiryDate || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon updated successfully",
      });
      setIsDialogOpen(false);
      setEditingCoupon(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update coupon",
        variant: "destructive",
      });
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coupons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete coupon",
        variant: "destructive",
      });
    },
  });

  const toggleCouponStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/coupons/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update coupon status",
        variant: "destructive",
      });
    },
  });


  const onSubmit = (data: CouponFormData) => {
    if (editingCoupon) {
      updateCouponMutation.mutate({ id: editingCoupon.id, data });
    } else {
      createCouponMutation.mutate(data);
    }
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    form.reset({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minimumPurchase: coupon.minimumPurchase || "",
      usageLimit: coupon.usageLimit?.toString() || "",
      expiryDate: coupon.expiryDate ? format(new Date(coupon.expiryDate), "yyyy-MM-dd") : "",
      isActive: coupon.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this coupon?")) {
      deleteCouponMutation.mutate(id);
    }
  };

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleCouponStatusMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingCoupon(null);
    form.reset();
  };

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading seller dashboard" description="Preparing your store performance, orders, and tools." />;
  }

  if (user?.isActive === false) {
    return <PageLoadingState title="Checking seller access" description="Confirming your store status and dashboard availability." />;
  }

  const handleUpgrade = () => setShowUpgradeModal(true);

  const safeProducts = (Array.isArray(products) ? products : []).filter((product) => !product?.dynamicFields?.archived);
  const safeOrders = Array.from(
    new Map(
      (Array.isArray(sellerOrdersResponse?.orders) ? sellerOrdersResponse.orders : []).map((o: any) => [o.id, o])
    ).values()
  ) as Order[];
  const safeCoupons = Array.isArray(coupons) ? coupons : [];
  const requiresSellerAction = (order?: Order) => {
    if (!order || order.sellerId !== user.id) return false;

    const status = normalizeOrderStatus(order.status);
    const paymentStatus = normalizeOrderStatus(order.paymentStatus ?? undefined);
    const deliveryMethod = normalizeOrderStatus(order.deliveryMethod ?? undefined);
    const hasRiderAssigned = Boolean(order.riderId);
    const isPaid = ["paid", "completed", "success"].includes(paymentStatus);

    const canStartPackaging =
      isPaid &&
      ["created", "pending", "confirmed"].includes(status);
    const canMarkReady =
      isPaid &&
      deliveryMethod !== "pickup" &&
      ["processing", "confirmed"].includes(status);
    const canMarkPackaged =
      isPaid &&
      deliveryMethod === "pickup" &&
      ["processing", "confirmed"].includes(status);
    const canStartRiderMatching =
      isExternalRiderSystemEnabled &&
      isPaid &&
      !hasRiderAssigned &&
      ["rider", "bus"].includes(deliveryMethod) &&
      status === "ready";

    return canStartPackaging || canMarkReady || canMarkPackaged || canStartRiderMatching;
  };

  const pendingOrders = safeOrders.filter((o) => requiresSellerAction(o)).length;

  const sellerOrdersCount = safeNumber(sellerOrdersResponse?.total ?? safeOrders.length);
  const remainingStockUnits = safeProducts.reduce((sum, product) => {
    return sum + getProductRemainingStock(product);
  }, 0);
  const isPaidSellerOrder = (order?: Order) => {
    const paymentStatus = normalizeOrderStatus(order?.paymentStatus ?? undefined);
    return ["paid", "completed", "success"].includes(paymentStatus);
  };
  const getSellerFulfillmentMode = (order?: Order) => {
    const deliveryMethod = normalizeOrderStatus(order?.deliveryMethod ?? undefined);
    return deliveryMethod === "pickup" ? "pickup" : "delivery";
  };
  // Gross product revenue: prefer the analytics API value (server uses status=completed + paid filter).
  // Client-side fallback must apply the same completed+paid filter so cached values stay accurate.
  const paidRevenueFromOrders = safeOrders
    .filter((order) => {
      if (order?.sellerId !== user.id) return false;
      if (!isPaidSellerOrder(order)) return false;
      // Must match server analytics: only finalised (completed) orders count as revenue.
      return normalizeOrderStatus(order?.status) === "completed";
    })
    .reduce((sum, order) => {
      const sub = safeNumber(order.subtotal ?? order.total);
      const disc = safeNumber(order.couponDiscount ?? 0);
      return sum + Math.max(0, sub - disc);
    }, 0);
  const totalRevenue = typeof analytics?.totalRevenue === "number" && analytics.totalRevenue >= 0
    ? analytics.totalRevenue
    : paidRevenueFromOrders;
  // Net earnings = sellerSettlementTotal (gross minus platform commission).
  // availableBalance is the current wallet cash-out balance — a separate figure shown elsewhere.
  const sellerEarnings = typeof analytics?.sellerSettlementTotal === "number" && analytics.sellerSettlementTotal >= 0
    ? analytics.sellerSettlementTotal
    : null;
  const netPayout = sellerEarnings;
  const isCompletedSellerOrder = (order?: Order) => {
    const status = normalizeOrderStatus(order?.status);
    return status === "completed" || status === "delivered";
  };
  const isClosedSellerOrder = (order?: Order) => {
    const status = normalizeOrderStatus(order?.status);
    return ["completed", "delivered", "cancelled", "failed", "refunded"].includes(status);
  };
  const pendingDeliveryOrders = safeOrders.filter(
    (order) =>
      order?.sellerId === user.id &&
      isPaidSellerOrder(order) &&
      getSellerFulfillmentMode(order) === "delivery" &&
      !isClosedSellerOrder(order),
  ).length;
  const pendingPickupOrders = safeOrders.filter(
    (order) =>
      order?.sellerId === user.id &&
      isPaidSellerOrder(order) &&
      getSellerFulfillmentMode(order) === "pickup" &&
      !isClosedSellerOrder(order),
  ).length;
  const completedDeliveryOrders = safeOrders.filter(
    (order) =>
      order?.sellerId === user.id &&
      isPaidSellerOrder(order) &&
      getSellerFulfillmentMode(order) === "delivery" &&
      isCompletedSellerOrder(order),
  ).length;
  const completedPickupOrders = safeOrders.filter(
    (order) =>
      order?.sellerId === user.id &&
      isPaidSellerOrder(order) &&
      getSellerFulfillmentMode(order) === "pickup" &&
      isCompletedSellerOrder(order),
  ).length;
  const cancelledFulfillmentOrders = safeOrders.filter((order) => {
    if (order?.sellerId !== user.id) return false;
    if (!isPaidSellerOrder(order)) return false;
    const status = normalizeOrderStatus(order?.status);
    return ["cancelled", "failed", "refunded", "disputed"].includes(status);
  }).length;
  const awaitingPaymentOrders = safeOrders.filter(
    (order) => order?.sellerId === user.id && !isPaidSellerOrder(order)
  ).length;
  const liveMetrics: SellerDashboardMetricSnapshot = {
    totalRevenue,
    pendingDeliveryOrders,
    pendingPickupOrders,
    completedDeliveryOrders,
    completedPickupOrders,
    cancelledFulfillmentOrders,
    awaitingPaymentOrders,
    sellerOrdersCount,
    pendingOrders,
    remainingStockUnits,
  };
  const visibleMetrics: SellerDashboardMetricSnapshot = {
    ...{
      totalRevenue: safeNumber(lastGoodMetrics?.totalRevenue),
      pendingDeliveryOrders: safeNumber(lastGoodMetrics?.pendingDeliveryOrders),
      pendingPickupOrders: safeNumber(lastGoodMetrics?.pendingPickupOrders),
      completedDeliveryOrders: safeNumber(lastGoodMetrics?.completedDeliveryOrders),
      completedPickupOrders: safeNumber(lastGoodMetrics?.completedPickupOrders),
      cancelledFulfillmentOrders: safeNumber(lastGoodMetrics?.cancelledFulfillmentOrders),
      awaitingPaymentOrders: safeNumber(lastGoodMetrics?.awaitingPaymentOrders),
      sellerOrdersCount: safeNumber(lastGoodMetrics?.sellerOrdersCount),
      pendingOrders: safeNumber(lastGoodMetrics?.pendingOrders),
      remainingStockUnits: safeNumber(lastGoodMetrics?.remainingStockUnits),
    },
    ...liveMetrics,
  };
  const recentOrders = [...safeOrders]
    .filter((o) => requiresSellerAction(o))
    .sort((a, b) => new Date(b.createdAt || "").getTime() - new Date(a.createdAt || "").getTime())
    .slice(0, 6);
  const displayedRecentOrders = recentOrders.length > 0 ? recentOrders : lastGoodRecentOrders;
  const shouldShowRecentOrdersLoading =
    activeItem === "dashboard" &&
    (!ordersFetched || (ordersLoading && displayedRecentOrders.length === 0));

  useEffect(() => {
    if (recentOrders.length > 0) {
      setLastGoodRecentOrders(recentOrders);
    }
  }, [recentOrders]);

  useEffect(() => {
    if (!metricsStorageKey || typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(metricsStorageKey);
      if (!raw) return;
      setLastGoodMetrics(JSON.parse(raw) as SellerDashboardMetricSnapshot);
    } catch {
      // Ignore localStorage read failures.
    }
  }, [metricsStorageKey]);

  useEffect(() => {
    if (!metricsStorageKey) return;
    const hasMeaningfulMetrics =
      liveMetrics.totalRevenue > 0 ||
      liveMetrics.pendingDeliveryOrders > 0 ||
      liveMetrics.pendingPickupOrders > 0 ||
      liveMetrics.completedDeliveryOrders > 0 ||
      liveMetrics.completedPickupOrders > 0 ||
      liveMetrics.sellerOrdersCount > 0 ||
      liveMetrics.pendingOrders > 0 ||
      liveMetrics.remainingStockUnits > 0;

    if (!hasMeaningfulMetrics) return;

    const unchanged =
      lastGoodMetrics &&
      lastGoodMetrics.totalRevenue === liveMetrics.totalRevenue &&
      lastGoodMetrics.pendingDeliveryOrders === liveMetrics.pendingDeliveryOrders &&
      lastGoodMetrics.pendingPickupOrders === liveMetrics.pendingPickupOrders &&
      lastGoodMetrics.completedDeliveryOrders === liveMetrics.completedDeliveryOrders &&
      lastGoodMetrics.completedPickupOrders === liveMetrics.completedPickupOrders &&
      lastGoodMetrics.cancelledFulfillmentOrders === liveMetrics.cancelledFulfillmentOrders &&
      lastGoodMetrics.awaitingPaymentOrders === liveMetrics.awaitingPaymentOrders &&
      lastGoodMetrics.sellerOrdersCount === liveMetrics.sellerOrdersCount &&
      lastGoodMetrics.pendingOrders === liveMetrics.pendingOrders &&
      lastGoodMetrics.remainingStockUnits === liveMetrics.remainingStockUnits;

    if (unchanged) return;

    setLastGoodMetrics(liveMetrics);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(metricsStorageKey, JSON.stringify(liveMetrics));
      } catch {
        // Ignore localStorage write failures.
      }
    }
  }, [
    liveMetrics.pendingOrders,
    liveMetrics.pendingDeliveryOrders,
    liveMetrics.pendingPickupOrders,
    liveMetrics.completedDeliveryOrders,
    liveMetrics.completedPickupOrders,
    liveMetrics.cancelledFulfillmentOrders,
    liveMetrics.awaitingPaymentOrders,
    liveMetrics.remainingStockUnits,
    liveMetrics.sellerOrdersCount,
    liveMetrics.totalRevenue,
    lastGoodMetrics,
    metricsStorageKey,
  ]);

  useEffect(() => {
    if (!isAuthenticated || user?.role !== "seller" || activeItem !== "dashboard") {
      return;
    }

    void refetchAnalytics();
    void refetchProducts();
    void refetchOrders();
  }, [activeItem, isAuthenticated, refetchAnalytics, refetchOrders, refetchProducts, user?.role]);

  const { isMobile } = useMobileDevice();
  if (isMobile && activeItem === "dashboard") {
    return (
      <MobileSellerDashboard
        user={{ name: user.name, profileImage: user.profileImage }}
        stats={{
          todayRevenue: 0,
          totalRevenue: sellerEarnings,
          pendingOrders,
          totalOrders: sellerOrdersCount,
          activeProducts: safeProducts.filter((p: any) => p.isActive).length,
          totalProducts: safeProducts.length,
          pendingPayouts: typeof analytics?.pendingPayoutValue === "number" ? analytics.pendingPayoutValue : 0,
        }}
        recentOrders={safeOrders.slice(0, 5).map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          totalAmount: o.totalAmount,
          createdAt: o.createdAt,
          itemCount: o.items?.length,
        }))}
        isLoading={ordersLoading || productsLoading}
        unreadCount={0}
      />
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <DashboardSidebar
        role="seller"
        activeItem={activeItem}
        onItemClick={setActiveItem}
        userName={user.name}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b p-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5" data-testid="text-dashboard-title">
            <h1 className="text-2xl font-bold">
              {activeItem === "coupons" ? "Coupon Management" : activeItem === "reviews" ? "Ratings & Reviews" : "Seller Dashboard"}
            </h1>
            {tierInfo && (() => {
              const { isPremiumSeller, sellerUpgradePlan, planBExpired, sellerMonetizationEnabled } = tierInfo as any;
              if (isPremiumSeller || sellerUpgradePlan === "plan_c") {
                return (
                  <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-700 text-xs font-semibold flex items-center gap-1">
                    <PhInfinity size={13} weight="bold" />
                    Plan C — Unlimited Forever
                  </Badge>
                );
              }
              if (sellerUpgradePlan === "plan_b" && !planBExpired) {
                return (
                  <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200 border-blue-300 dark:border-blue-700 text-xs font-semibold flex items-center gap-1">
                    <CalendarCheck size={13} weight="fill" />
                    Plan B — Monthly Unlimited
                  </Badge>
                );
              }
              if (sellerUpgradePlan === "plan_a") {
                return (
                  <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200 border-green-300 dark:border-green-700 text-xs font-semibold flex items-center gap-1">
                    <Stack size={13} weight="fill" />
                    Plan A — Extra Slots
                  </Badge>
                );
              }
              if (sellerMonetizationEnabled) {
                return (
                  <Badge className="bg-muted text-muted-foreground border-border text-xs font-semibold flex items-center gap-1">
                    <Storefront size={13} weight="duotone" />
                    Basic Plan
                  </Badge>
                );
              }
              return null;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" onClick={() => navigate("/")} data-testid="button-shop">
              Shop
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {store && !hasCompletePayoutSetup && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                      Payment Setup Required
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                      Set up your payout method to receive payments from your sales. You can use either bank account or mobile money.
                    </p>
                    <Button 
                      size="sm"
                      onClick={() => navigate("/seller/payment-setup")}
                      data-testid="button-setup-payment"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Set Up Payment Now
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!store && user?.isApproved && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      Store Setup In Progress
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      Your seller account is approved! Your store profile is being created. This usually completes within a few moments. Please refresh the page if this message persists.
                    </p>
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        await Promise.all([refetchStore(), refetchSellerProfile()]);
                      }}
                      disabled={isStoreRefreshing}
                      data-testid="button-refresh-store"
                      className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      {isStoreRefreshing ? "Refreshing..." : "Refresh Page"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {activeItem === "dashboard" && (
              <>
                {/* Low stock alert */}
                {(() => {
                  const LOW_STOCK = 5;
                  const lowStockItems = safeProducts.filter((p) => getProductRemainingStock(p) <= LOW_STOCK && getProductRemainingStock(p) >= 0 && p.isActive);
                  if (!lowStockItems.length) return null;
                  return (
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="font-semibold text-orange-900 dark:text-orange-100 mb-1">
                            Low Stock Alert — {lowStockItems.length} product{lowStockItems.length !== 1 ? "s" : ""} running low
                          </h3>
                          <p className="text-sm text-orange-800 dark:text-orange-200 mb-2">
                            {lowStockItems.slice(0, 3).map((p) => `${p.name} (${getProductRemainingStock(p)} left)`).join(", ")}
                            {lowStockItems.length > 3 ? ` and ${lowStockItems.length - 3} more` : ""}
                          </p>
                          <Button size="sm" onClick={() => navigate("/seller/products")} className="bg-orange-600 hover:bg-orange-700 text-white">
                            Manage Products
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Seller tier / upgrade prompt */}
                {tierInfo && !justUpgraded && (() => {
                  const { isPremiumSeller, sellerUpgradePlan, planBExpired, sellerBonusSlots, productCount, effectiveLimit, freeTierLimit, sellerMonetizationEnabled } = tierInfo as any;

                  // When monetization is disabled, sellers can list freely — show nothing
                  if (!sellerMonetizationEnabled) return null;

                  const hasUnlimited = isPremiumSeller || sellerUpgradePlan === "plan_c" || (sellerUpgradePlan === "plan_b" && !planBExpired);
                  const displayLimit = effectiveLimit > 0 ? effectiveLimit : null;
                  const remaining = displayLimit !== null ? displayLimit - productCount : null;
                  const atLimit = displayLimit !== null && productCount >= displayLimit;
                  const nearLimit = !atLimit && remaining !== null && remaining <= 3;

                  // Plan B expired — amber warning, no red
                  if (planBExpired) {
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-xl flex-shrink-0">⏰</span>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1 text-amber-900 dark:text-amber-100">Plan B Expired</h3>
                            <p className="text-sm mb-3 text-amber-800 dark:text-amber-200">
                              Your monthly unlimited plan has expired. Renew Plan B or upgrade to Plan C for permanent unlimited listings.
                            </p>
                            <Button size="sm" onClick={handleUpgrade} className="bg-green-600 hover:bg-green-700 text-white">Renew or Upgrade</Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Unlimited plan — quiet info strip
                  if (hasUnlimited) {
                    const planLabel = sellerUpgradePlan === "plan_c" ? "Plan C — Unlimited Forever" :
                      sellerUpgradePlan === "plan_b" ? "Plan B — Monthly Unlimited" : "Unlimited";
                    return (
                      <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-900/10 dark:border-green-800 p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-green-900 dark:text-green-100">{planLabel}</p>
                          <p className="text-xs text-green-700 dark:text-green-300">
                            Unlimited product listings.
                            {productCount > 0 ? ` You currently have ${productCount} product${productCount !== 1 ? "s" : ""} listed.` : ""}
                            {sellerUpgradePlan === "plan_b" && tierInfo.sellerPlanExpiresAt
                              ? ` Renews ${new Date(tierInfo.sellerPlanExpiresAt).toLocaleDateString()}.`
                              : ""}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  // At limit — green banner, clear call to action
                  if (atLimit) {
                    const planName = sellerUpgradePlan === "plan_a" ? `Plan A (${freeTierLimit} free + ${sellerBonusSlots} bonus)` : "Basic Plan";
                    return (
                      <div className="rounded-lg border border-green-300 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1 text-green-900 dark:text-green-100">Listing Limit Reached</h3>
                            <p className="text-sm mb-3 text-green-800 dark:text-green-200">
                              You have listed {productCount} of {displayLimit} products on your {planName}.
                              Upgrade to add more products.
                            </p>
                            <Button size="sm" onClick={handleUpgrade} className="bg-green-600 hover:bg-green-700 text-white">Upgrade Plan</Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // 3 or fewer remaining — amber early warning
                  if (nearLimit && remaining !== null) {
                    const planName = sellerUpgradePlan === "plan_a" ? `Plan A (${freeTierLimit} + ${sellerBonusSlots} bonus slots)` : "Basic Plan";
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-800 p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1 text-amber-900 dark:text-amber-100">
                              {remaining === 0 ? "No slots left" : `${remaining} listing slot${remaining !== 1 ? "s" : ""} remaining`}
                            </h3>
                            <p className="text-sm mb-3 text-amber-800 dark:text-amber-200">
                              You have used {productCount} of {displayLimit} product slots on your {planName}.
                              Upgrade now to keep growing your store.
                            </p>
                            <Button size="sm" onClick={handleUpgrade} className="bg-green-600 hover:bg-green-700 text-white">Upgrade Plan</Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Basic Plan — show a subtle progress indicator so sellers always know their usage
                  if (!sellerUpgradePlan && displayLimit !== null) {
                    return (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground">Basic Plan</p>
                          <p className="text-xs text-muted-foreground">
                            {productCount} of {displayLimit} product{displayLimit !== 1 ? "s" : ""} listed.
                            Upgrade anytime to unlock more slots or unlimited listings.
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={handleUpgrade} className="text-xs shrink-0">Upgrade</Button>
                      </div>
                    );
                  }

                  return null;
                })()}

                <SellerUpgradeModal
                  open={showUpgradeModal}
                  onClose={() => setShowUpgradeModal(false)}
                  onUpgraded={() => {
                    prevPlanRef.current = tierInfo?.sellerUpgradePlan ?? null;
                    setJustUpgraded(true);
                    setShowUpgradeModal(false);
                    // SellerUpgradeModal already starts a 60s global poll after payment.
                    // This local poll is kept as an extra safety net for the dashboard banner.
                    // Critically: do NOT reset justUpgraded on timeout — the useEffect
                    // handles clearing only when tier-info actually reflects the new plan.
                    if (upgradePollRef.current) clearInterval(upgradePollRef.current);
                    let attempts = 0;
                    upgradePollRef.current = setInterval(() => {
                      attempts++;
                      queryClient.invalidateQueries({ queryKey: ["/api/seller/tier-info"] });
                      if (attempts >= 30) { // 60s then stop polling; leave justUpgraded alone
                        clearInterval(upgradePollRef.current!);
                        upgradePollRef.current = null;
                      }
                    }, 2000);
                  }}
                />

                {analyticsLoading && !lastGoodMetrics ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <MetricCard
                      title="My Earnings"
                      value={netPayout !== null ? formatPrice(netPayout) : formatPrice(visibleMetrics.totalRevenue)}
                      icon={DollarSign}
                      details={
                        <span>
                          {netPayout !== null
                            ? <span>Net earnings after platform fee • Gross: <strong>{formatPrice(visibleMetrics.totalRevenue)}</strong></span>
                            : <span>Gross sales — visit Analytics for full breakdown</span>
                          }
                        </span>
                      }
                    />
                    <MetricCard
                      title="Pending Fulfillment"
                      value={(visibleMetrics.pendingDeliveryOrders + visibleMetrics.pendingPickupOrders).toString()}
                      details={
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <span>Deliveries: {visibleMetrics.pendingDeliveryOrders}</span>
                          <span>Pickups: {visibleMetrics.pendingPickupOrders}</span>
                        </div>
                      }
                      icon={Truck}
                    />
                    <MetricCard
                      title="Completed Fulfillment"
                      value={(visibleMetrics.completedDeliveryOrders + visibleMetrics.completedPickupOrders).toString()}
                      details={
                        <div className="flex flex-wrap gap-x-3 gap-y-1">
                          <span>Deliveries: {visibleMetrics.completedDeliveryOrders}</span>
                          <span>Pickups: {visibleMetrics.completedPickupOrders}</span>
                        </div>
                      }
                      icon={Package}
                    />
                    <MetricCard
                      title="Total Orders"
                      value={visibleMetrics.sellerOrdersCount.toString()}
                      icon={Package}
                      details={
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span>Active: {visibleMetrics.pendingDeliveryOrders + visibleMetrics.pendingPickupOrders}</span>
                          <span>Completed: {visibleMetrics.completedDeliveryOrders + visibleMetrics.completedPickupOrders}</span>
                          {visibleMetrics.cancelledFulfillmentOrders > 0 && <span>Cancelled: {visibleMetrics.cancelledFulfillmentOrders}</span>}
                          {visibleMetrics.awaitingPaymentOrders > 0 && <span>Unpaid: {visibleMetrics.awaitingPaymentOrders}</span>}
                        </div>
                      }
                    />
                    <MetricCard
                      title="Orders Requiring Action"
                      value={visibleMetrics.pendingOrders.toString()}
                      icon={ShoppingBag}
                    />
                    <MetricCard
                      title="Remaining Stock"
                      value={visibleMetrics.remainingStockUnits.toString()}
                      icon={TrendingUp}
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">Recent Orders</h2>
                    <Button onClick={() => navigate("/seller/orders")} data-testid="button-view-all-orders">
                      <Package className="mr-2 h-4 w-4" />
                      View All Orders
                    </Button>
                  </div>

                  {shouldShowRecentOrdersLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : displayedRecentOrders.length > 0 ? (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {displayedRecentOrders.map((order) => (
                        <Card key={order.id} className="border-border/70 bg-card shadow-sm">
                          <CardContent className="p-5 space-y-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">
                                  #{order.orderNumber || order.id.slice(0, 8)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {order.createdAt ? new Date(order.createdAt).toLocaleString() : "Date unavailable"}
                                </p>
                              </div>
                              <Badge variant="outline" className="capitalize">
                                {normalizeOrderStatus(order.status).replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <p className="text-2xl font-semibold">{formatPrice(safeNumber(order.total))}</p>
                              <p className="text-sm text-muted-foreground">
                                Payment: {normalizeOrderStatus(order.paymentStatus || "pending").replace(/_/g, " ")}
                              </p>
                              <p className="text-sm font-medium text-amber-500">
                                Seller action required
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() =>
                                navigate(
                                  `/seller/orders/${encodeURIComponent(order.id)}?context=seller${
                                    order.orderNumber
                                      ? `&orderNumber=${encodeURIComponent(order.orderNumber)}`
                                      : ""
                                  }`
                                )
                              }
                              data-testid={`button-open-order-${order.id}`}
                            >
                              Open Order
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        <p className="mb-4">
                          {ordersFetching ? "Checking your latest paid orders..." : "No paid orders currently need seller action"}
                        </p>
                        <Button onClick={() => navigate("/seller/orders")}>
                          Open Orders Workspace
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            {activeItem === "coupons" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      <CardTitle>Manage Coupons</CardTitle>
                    </div>
                    <Dialog
                      open={isDialogOpen}
                      onOpenChange={(open) => {
                        if (open) {
                          setIsDialogOpen(true);
                          return;
                        }
                        handleDialogClose();
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button data-testid="button-create-coupon">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Coupon
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md" data-testid="dialog-coupon-form">
                        <DialogHeader>
                          <DialogTitle>
                            {editingCoupon ? "Edit Coupon" : "Create New Coupon"}
                          </DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                              control={form.control}
                              name="code"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Coupon Code</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="SUMMER2024"
                                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                      data-testid="input-coupon-code"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="discountType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Discount Type</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-discount-type">
                                        <SelectValue placeholder="Select discount type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                                      <SelectItem value="fixed">Fixed Amount (GHS)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="discountValue"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Discount Value</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      step="0.01"
                                      placeholder={form.watch("discountType") === "percentage" ? "10" : "50.00"}
                                      data-testid="input-discount-value"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="minimumPurchase"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Minimum Purchase (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      data-testid="input-minimum-purchase"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="usageLimit"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Usage Limit (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      placeholder="Unlimited"
                                      data-testid="input-usage-limit"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="expiryDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Expiry Date (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="date"
                                      data-testid="input-expiry-date"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="isActive"
                              render={({ field }) => (
                                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-base">Active</FormLabel>
                                    <div className="text-sm text-muted-foreground">
                                      Enable this coupon for use
                                    </div>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="switch-is-active"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleDialogClose}
                                data-testid="button-cancel-coupon"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={createCouponMutation.isPending || updateCouponMutation.isPending}
                                data-testid="button-submit-coupon"
                              >
                                {createCouponMutation.isPending || updateCouponMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                {editingCoupon ? "Update" : "Create"}
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {couponsLoading ? (
                    <SectionLoadingState title="Loading coupons" description="Fetching your latest coupon campaigns." lines={3} className="border-0 shadow-none" />
                  ) : safeCoupons.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead data-testid="header-code">Code</TableHead>
                            <TableHead data-testid="header-discount">Discount</TableHead>
                            <TableHead data-testid="header-min-purchase">Min. Purchase</TableHead>
                            <TableHead data-testid="header-usage">Usage</TableHead>
                            <TableHead data-testid="header-expiry">Expiry</TableHead>
                            <TableHead data-testid="header-status">Status</TableHead>
                            <TableHead data-testid="header-actions">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeCoupons.map((coupon) => (
                            <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                              <TableCell className="font-mono font-semibold" data-testid={`text-code-${coupon.id}`}>
                                {coupon.code}
                              </TableCell>
                              <TableCell data-testid={`text-discount-${coupon.id}`}>
                                {coupon.discountType === "percentage"
                                  ? `${coupon.discountValue}%`
                                  : formatPrice(parseFloat(coupon.discountValue))}
                              </TableCell>
                              <TableCell data-testid={`text-min-purchase-${coupon.id}`}>
                                {coupon.minimumPurchase && parseFloat(coupon.minimumPurchase) > 0
                                  ? formatPrice(parseFloat(coupon.minimumPurchase))
                                  : "-"}
                              </TableCell>
                              <TableCell data-testid={`text-usage-${coupon.id}`}>
                                {coupon.usedCount} / {coupon.usageLimit || "∞"}
                              </TableCell>
                              <TableCell data-testid={`text-expiry-${coupon.id}`}>
                                {coupon.expiryDate
                                  ? format(new Date(coupon.expiryDate), "MMM dd, yyyy")
                                  : "No expiry"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={coupon.isActive ? "default" : "secondary"}
                                  data-testid={`badge-status-${coupon.id}`}
                                >
                                  {coupon.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(coupon.id, coupon.isActive)}
                                    data-testid={`button-toggle-${coupon.id}`}
                                  >
                                    {coupon.isActive ? "Deactivate" : "Activate"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(coupon)}
                                    data-testid={`button-edit-${coupon.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(coupon.id)}
                                    disabled={deleteCouponMutation.isPending}
                                    data-testid={`button-delete-${coupon.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center p-8 text-muted-foreground">
                      <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">No coupons yet</p>
                      <p className="text-sm mb-4">Create your first coupon to offer discounts to customers</p>
                      <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-first-coupon">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Coupon
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
  const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();
