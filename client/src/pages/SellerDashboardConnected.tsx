import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, Package, ShoppingBag, TrendingUp, Loader2, AlertCircle, Plus, Pencil, Trash2, Tag, Truck, Star, Crown, Zap } from "lucide-react";
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
import ReferralTracker from "@/components/ReferralTracker";
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

function CollapsibleDashboardSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <Card className="border-border/70 bg-card shadow-sm">
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
    staleTime: 60000,
  });

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
  // Gross product revenue: prefer the analytics API value (uses subtotal - couponDiscount from DB,
  // which excludes delivery fees and processing fees that don't belong to the seller).
  // Fall back to a client-side sum using subtotal - couponDiscount (never use order.total which includes fees).
  const paidRevenueFromOrders = safeOrders
    .filter((order) => {
      if (order?.sellerId !== user.id) return false;
      return isPaidSellerOrder(order);
    })
    .reduce((sum, order) => {
      const sub = safeNumber(order.subtotal ?? order.total);
      const disc = safeNumber(order.couponDiscount ?? 0);
      return sum + Math.max(0, sub - disc);
    }, 0);
  const totalRevenue = typeof analytics?.totalRevenue === "number" && analytics.totalRevenue >= 0
    ? analytics.totalRevenue
    : paidRevenueFromOrders;
  // Net payout = totalRevenue minus the platform service fee, recorded in commissions table
  const netPayout = typeof analytics?.sellerSettlementTotal === "number" && analytics.sellerSettlementTotal >= 0
    ? analytics.sellerSettlementTotal
    : null;
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
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            {activeItem === "coupons" ? "Coupon Management" : activeItem === "reviews" ? "Ratings & Reviews" : "Seller Dashboard"}
          </h1>
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
                {tierInfo && (() => {
                  const { isPremiumSeller, sellerUpgradePlan, planBExpired, sellerBonusSlots, productCount, effectiveLimit, freeTierLimit } = tierInfo;
                  const hasUnlimited = isPremiumSeller || sellerUpgradePlan === "plan_c" || (sellerUpgradePlan === "plan_b" && !planBExpired);
                  const displayLimit = effectiveLimit > 0 ? effectiveLimit : null;
                  const atLimit = displayLimit !== null && productCount >= displayLimit;
                  const nearLimit = !atLimit && displayLimit !== null && productCount >= Math.floor(displayLimit * 0.8);

                  if (hasUnlimited) {
                    const planLabel = isPremiumSeller && sellerUpgradePlan === "plan_c" ? "Plan C (Unlimited Forever)" :
                      sellerUpgradePlan === "plan_b" ? "Plan B (Monthly Unlimited)" :
                      isPremiumSeller ? "Premium Seller" : "";
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800 p-3 flex items-center gap-3">
                        <span className="text-lg">👑</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-amber-900 dark:text-amber-100">{planLabel || "Premium Seller"}</p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Unlimited product listings.
                            {productCount > 0 ? ` Currently listing ${productCount} product${productCount !== 1 ? "s" : ""}.` : ""}
                            {sellerUpgradePlan === "plan_b" && tierInfo.sellerPlanExpiresAt
                              ? ` Renews ${new Date(tierInfo.sellerPlanExpiresAt).toLocaleDateString()}.`
                              : ""}
                          </p>
                        </div>
                        <Button size="sm" variant="outline" onClick={handleUpgrade} className="gap-1.5 text-xs">
                          <Zap className="h-3.5 w-3.5" /> Upgrade
                        </Button>
                      </div>
                    );
                  }

                  if (planBExpired) {
                    return (
                      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 p-4">
                        <div className="flex items-start gap-3">
                          <span className="text-xl flex-shrink-0">⏰</span>
                          <div className="flex-1">
                            <h3 className="font-semibold mb-1 text-red-900 dark:text-red-100">Plan B Expired</h3>
                            <p className="text-sm mb-3 text-red-800 dark:text-red-200">
                              Your monthly unlimited plan has expired. Renew Plan B or upgrade to Plan C for permanent unlimited listings.
                            </p>
                            <Button size="sm" onClick={handleUpgrade} className="gap-2">
                              <Crown className="h-4 w-4" /> Renew or Upgrade
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  if (sellerUpgradePlan === "plan_a") {
                    return (atLimit || nearLimit) ? (
                      <div className={`rounded-lg border p-4 ${atLimit ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"}`}>
                        <div className="flex items-start gap-3">
                          <span className="text-xl flex-shrink-0">{atLimit ? "🚫" : "⭐"}</span>
                          <div className="flex-1">
                            <h3 className={`font-semibold mb-1 ${atLimit ? "text-red-900 dark:text-red-100" : "text-yellow-900 dark:text-yellow-100"}`}>
                              {atLimit ? "Listing Limit Reached" : "Approaching Listing Limit"}
                            </h3>
                            <p className={`text-sm mb-3 ${atLimit ? "text-red-800 dark:text-red-200" : "text-yellow-800 dark:text-yellow-200"}`}>
                              {productCount} of {displayLimit} products listed ({freeTierLimit} free + {sellerBonusSlots} bonus slots).
                              Upgrade to Plan B or C for unlimited listings.
                            </p>
                            <Button size="sm" onClick={handleUpgrade} className="gap-2">
                              <Crown className="h-4 w-4" /> Upgrade Plan
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : null;
                  }

                  if (!atLimit && !nearLimit) return null;
                  return (
                    <div className={`rounded-lg border p-4 ${atLimit ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"}`}>
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">{atLimit ? "🚫" : "⭐"}</span>
                        <div className="flex-1">
                          <h3 className={`font-semibold mb-1 ${atLimit ? "text-red-900 dark:text-red-100" : "text-yellow-900 dark:text-yellow-100"}`}>
                            {atLimit ? "Listing Limit Reached" : "Approaching Your Listing Limit"}
                          </h3>
                          <p className={`text-sm mb-3 ${atLimit ? "text-red-800 dark:text-red-200" : "text-yellow-800 dark:text-yellow-200"}`}>
                            {productCount} of {displayLimit} products listed.{" "}
                            {atLimit ? "Choose an upgrade plan to continue listing products." : "You're almost at your limit."}
                          </p>
                          <Button size="sm" onClick={handleUpgrade} className="gap-2">
                            <Crown className="h-4 w-4" /> View Upgrade Plans
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <SellerUpgradeModal
                  open={showUpgradeModal}
                  onClose={() => setShowUpgradeModal(false)}
                  onUpgraded={() => {
                    queryClient.invalidateQueries({ queryKey: ["/api/seller/tier-info"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
                  }}
                />

                {analyticsLoading && !lastGoodMetrics ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    <MetricCard
                      title="Gross Sales"
                      value={formatPrice(visibleMetrics.totalRevenue)}
                      icon={DollarSign}
                      details={
                        netPayout !== null ? (
                          <span>Net payout: <strong>{formatPrice(netPayout)}</strong> (after service fee)</span>
                        ) : undefined
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

                <CollapsibleDashboardSection
                  title="Dashboard Metrics Explained"
                  summary="Expand to see what each number on your seller dashboard means."
                >
                  <div className="space-y-4">
                    {/* Earnings explanation banner */}
                    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-2">
                      <p className="text-sm font-semibold text-foreground">Understanding your earnings</p>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">Gross Sales</p>
                          <p className="text-muted-foreground">Your total product revenue — product prices minus any coupon discounts. This is your top-line figure before the platform service fee.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">Platform Service Fee</p>
                          <p className="text-muted-foreground">A small % deducted from your gross sales per transaction. This is the only reduction to your earnings — delivery and processing fees are paid by buyers, not you.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">Net Payout = what you receive</p>
                          <p className="text-muted-foreground">Gross Sales minus the service fee. For bank accounts, your payout arrives automatically the moment the buyer pays. For mobile money, request a withdrawal and the transfer is processed instantly by Paystack — no manual approval needed.</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Gross Sales</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          The total value of your product sales from all paid orders — product prices minus any coupon discounts. Delivery fees and the checkout processing fee are paid by buyers on top of your product price and are never included in this figure. Your actual payout will be slightly less after the platform service fee is deducted (shown as <strong className="text-foreground">Net Payout</strong>).
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Pending Fulfillment</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Every paid order that is still open and not yet completed. Inside the card, deliveries and pickups are shown separately so you can see what is still waiting under each fulfillment method.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Completed Fulfillment</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Paid orders that have already been fully completed and handed off to buyers. Deliveries and pickups are shown separately so you can compare finished orders by fulfillment method.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Total Orders</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          All orders placed by buyers for your products, across every status — paid, pending, processing, and completed.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Orders Requiring Action</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Paid open orders that still need your attention — packaging, preparing, or marking items ready for pickup or dispatch. These are a subset of Pending Fulfillment.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Remaining Stock</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Total stock units remaining across all your active products and their variants.
                        </p>
                      </div>
                    </div>

                    <div className={`grid gap-3 ${bankPayoutsAllowed ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">Your Net Payout</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          What you actually receive: your Gross Sales minus the platform service fee. The service fee is the only deduction from your product earnings — delivery fees and the 1.95% checkout processing fee are charged to buyers separately and never touch your payout. For <strong className="text-foreground">bank accounts</strong>, your payout arrives automatically the moment the buyer's payment is confirmed. For <strong className="text-foreground">mobile money</strong>, request a withdrawal and the Paystack transfer is processed automatically within seconds — no manual action is required from the platform.
                        </p>
                      </div>
                      <div className="rounded-xl border border-border/70 bg-card p-4">
                        <p className="text-sm font-medium text-foreground">How Payouts Work</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Your earnings are sent automatically as soon as a buyer completes payment — no manual request needed. Your net amount goes straight to your configured bank account or mobile money wallet.
                        </p>
                      </div>
                    </div>
                  </div>
                </CollapsibleDashboardSection>

                {publicSettings?.referralEnabled && (
                  <div className="space-y-3">
                    <div className="rounded-2xl border bg-primary/5 p-4 text-sm text-muted-foreground">
                      {publicSettings?.isMultiVendor ? (
                        <p>
                          <span className="font-semibold text-foreground">Earn free promotion time.</span>{" "}
                          Refer 10 new customers who make a purchase from any store on the platform and you'll earn free promotional time for your store or a product listing. Track your progress below.
                        </p>
                      ) : (
                        <p>
                          <span className="font-semibold text-foreground">Grow your customer base.</span>{" "}
                          Share your referral link and earn rewards every time a referred customer makes their first purchase. Rewards are funded by the platform to support your growth.
                        </p>
                      )}
                    </div>
                    <ReferralTracker />
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
