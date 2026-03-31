import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, ShoppingBag, Users, Truck, Loader2, AlertCircle, UserCog, Ticket, Wallet, CheckCircle, XCircle, ExternalLink, MessageCircle, MapPin } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/contexts/NotificationContext";
import { apiRequest, fetchApiJson } from "@/lib/queryClient";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
  totalReceivedMoney?: number;
  platformCommissionTotal?: number;
  promotionRevenueTotal?: number;
  platformRevenueTotal?: number;
  processingFeesTotal?: number;
  deliveryReserveTotal?: number;
  totalUsers: number;
}

interface FinanceSummary {
  total?: string;
  totalRevenue?: string;
  byType?: Record<string, string>;
}

interface DashboardSummary {
  totalOrders?: number;
  totalUsers?: number;
  totalRevenue?: number;
  platformCommissionTotal?: number;
  promotionRevenueTotal?: number;
  platformRevenueTotal?: number;
  totalReceivedMoney?: number;
  deliveries?: number;
  successfulPickups?: number;
}

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  deliveryMethod: string;
  total: string;
  status: string;
  paymentStatus?: string;
  createdAt: string;
  externalDeliveryByBus?: boolean;
  externalDeliveryType?: string | null;
  customerInfo?: { name?: string; email?: string; phone?: string; address?: string | null } | null;
  buyer?: { id?: string; name?: string; email?: string; phone?: string } | null;
  seller?: { id?: string; name?: string; storeName?: string | null } | null;
  sellerInfo?: { name?: string; email?: string; phone?: string; storeName?: string | null } | null;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface PendingPayout {
  id: string;
  riderId: string;
  orderId: string;
  amount: string;
  currency: string;
  status: string;
  createdAt: string;
  notes?: string;
}

interface DeliveryZone {
  id: string;
  isActive: boolean;
}

interface EtaControls {
  aiEnabledGlobal: boolean;
  aiEnabledByRole: Record<string, boolean>;
  aiVisibleByRole: Record<string, boolean>;
}

interface RiderRiskScore {
  riderId: string;
  score: number;
  updatedAt: number;
  signals: Array<{ signal: string; weight: number; at: number }>;
}

interface PlatformSettingsVisibility {
  showAdminOperationsPanels?: boolean | null;
}

const ETA_CONTROL_ROLE_KEYS = ["customer", "rider", "agent", "admin"] as const;

function DashboardMetricSkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={`metric-skeleton-${index}`} className="min-w-0 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-16" />
            </div>
            <Skeleton className="h-10 w-10 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-9 w-28" />
            <Skeleton className="mt-3 h-4 w-24" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function RecentOrdersSkeletonGrid({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card key={`recent-order-skeleton-${index}`} className="border-border/70 bg-card/95">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-20" />
                </CardContent>
              </Card>
              <Card className="border-dashed">
                <CardContent className="p-4 space-y-2">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-6 w-24" />
                </CardContent>
              </Card>
            </div>
            <div className="space-y-3 rounded-xl border p-4">
              <Skeleton className="h-3 w-36" />
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-48" />
            </div>
            <div className="space-y-3 border-t pt-4">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function AdminDashboardConnected() {
  const [activeItem, setActiveItem] = useState("dashboard");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const normalizedRole = (() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  })();
  const isAdminViewer = normalizedRole === "admin" || normalizedRole === "super_admin";
  const isSuperAdmin = normalizedRole === "super_admin";
  const { formatPrice } = useLanguage();
  const socket = useSocket();
  const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdminViewer)) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, isAdminViewer, navigate]);

  useEffect(() => {
    // Update activeItem based on current route
    const path = location;
    if (path === "/admin" || path === "/admin/") {
      setActiveItem("dashboard");
    } else if (path.includes("/admin/delivery-tracking")) {
      setActiveItem("delivery-tracking");
    } else if (path.includes("/admin/permissions")) {
      setActiveItem("permissions");
    } else if (path.includes("/admin/store")) {
      setActiveItem("store");
    } else if (path.includes("/admin/branding")) {
      setActiveItem("branding");
    } else if (path.includes("/admin/categories")) {
      setActiveItem("categories");
    } else if (path.includes("/admin/products")) {
      setActiveItem("products");
    } else if (path.includes("/admin/orders")) {
      setActiveItem("orders");
    } else if (path.includes("/admin/users")) {
      setActiveItem("users");
    } else if (path.includes("/admin/sellers")) {
      setActiveItem("sellers");
    } else if (path.includes("/admin/manual-rider-assignment")) {
      setActiveItem("manual-rider-assignment");
    } else if (path.includes("/admin/riders")) {
      setActiveItem("riders");
    } else if (path.includes("/admin/applications")) {
      setActiveItem("applications");
    } else if (path.includes("/admin/pickup-stations")) {
      setActiveItem("pickup-stations");
    } else if (path.includes("/admin/zones") || path.includes("/admin/delivery-zones")) {
      setActiveItem("zones");
    } else if (path === "/cart") {
      setActiveItem("my-cart");
    } else if (path === "/orders" || path === "/track") {
      setActiveItem("my-purchases");
    } else if (path === "/wishlist") {
      setActiveItem("my-wishlist");
    } else if (path.includes("/admin/notifications") || path === "/notifications") {
      setActiveItem("notifications");
    } else if (path.includes("/admin/messages")) {
      setActiveItem("messages");
    } else if (path.includes("/admin/live-support")) {
      setActiveItem("live-support");
    } else if (path.includes("/admin/analytics")) {
      setActiveItem("analytics");
    } else if (path.includes("/admin/platform-earnings")) {
      setActiveItem("platform-earnings");
    } else if (path.includes("/admin/sellers-payouts")) {
      setActiveItem("sellers-payouts");
    } else if (path.includes("/admin/riders-payouts")) {
      setActiveItem("riders-payouts");
    } else if (path.includes("/admin/settings")) {
      setActiveItem("settings");
    } else if (path.includes("/admin/promotions")) {
      setActiveItem("promotions");
    } else if (path.includes("/admin/banners")) {
      setActiveItem("banners");
    } else if (path.includes("/admin/media-library")) {
      setActiveItem("media-library");
    }
  }, [location]);

  const handleItemClick = (id: string) => {
    navigate(
      id === "dashboard" ? "/admin" :
      id === "delivery-tracking" ? "/admin/delivery-tracking" :
      id === "permissions" ? "/admin/permissions" :
      id === "store" ? "/admin/store" :
      id === "branding" ? "/admin/branding" :
      id === "categories" ? "/admin/categories" :
      id === "media-library" ? "/admin/media-library" :
      id === "products" ? "/admin/products" :
      id === "orders" ? "/admin/orders" :
      id === "users" ? "/admin/users" :
      id === "sellers" ? "/admin/sellers" :
      id === "riders" ? "/admin/riders" :
      id === "manual-rider-assignment" ? "/admin/manual-rider-assignment" :
      id === "applications" ? "/admin/applications" :
      id === "zones" ? "/admin/zones" :
      id === "pickup-stations" ? "/admin/pickup-stations" :
      id === "my-cart" ? "/cart" :
      id === "my-purchases" ? "/orders" :
      id === "my-wishlist" ? "/wishlist" :
      id === "notifications" ? "/admin/notifications" :
      id === "messages" ? "/admin/messages" :
      id === "live-support" ? "/admin/live-support" :
      id === "analytics" ? "/admin/analytics" :
      id === "platform-earnings" ? "/admin/platform-earnings" :
      id === "sellers-payouts" ? "/admin/sellers-payouts" :
      id === "riders-payouts" ? "/admin/riders-payouts" :
      id === "settings" ? "/admin/settings" :
      id === "promotions" ? "/admin/promotions" :
      "/admin"
    );
  };

  const fetchDashboardAnalytics = async (): Promise<Analytics> => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4500);
    try {
      return await fetchApiJson<Analytics>("/api/analytics", {
        credentials: "include",
        cache: "no-store",
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics"],
    queryFn: fetchDashboardAnalytics,
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: financeSummary } = useQuery<FinanceSummary>({
    queryKey: ["/api/admin/finance-summary", "dashboard"],
    queryFn: async () =>
      fetchApiJson<FinanceSummary>("/api/admin/finance-summary", {
        credentials: "include",
        cache: "no-store",
      }),
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: dashboardSummary, isLoading: dashboardSummaryLoading } = useQuery<DashboardSummary>({
    queryKey: ["/api/admin/dashboard-summary"],
    queryFn: async () =>
      fetchApiJson<DashboardSummary>("/api/admin/dashboard-summary", {
        credentials: "include",
        cache: "no-store",
      }),
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", user?.id],
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 10000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: buyers = [] } = useQuery<User[]>({
    queryKey: ["/api/users", "buyer"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=buyer");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && isAdminViewer,
  });

  const { data: pendingApplicationsBadgeData } = useQuery<{ count: number; sellers: number; riders: number }>({
    queryKey: ["/api/dashboard/pending-applications-count"],
    queryFn: async () => {
      const sellerRes = await fetch("/api/users?role=seller&applicationStatus=pending", { credentials: "include" });
      if (!sellerRes.ok) return { count: 0, sellers: 0, riders: 0 };
      const sellers = await sellerRes.json();
      const sellerCount = Array.isArray(sellers) ? sellers.length : 0;
      if (isExternalRiderSystemEnabled) {
        return { count: sellerCount, sellers: sellerCount, riders: 0 };
      }
      const riderRes = await fetch("/api/users?role=rider&applicationStatus=pending", { credentials: "include" });
      if (!riderRes.ok) return { count: sellerCount, sellers: sellerCount, riders: 0 };
      const riders = await riderRes.json();
      const riderCount = Array.isArray(riders) ? riders.length : 0;
      return { count: sellerCount + riderCount, sellers: sellerCount, riders: riderCount };
    },
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: pendingAssignmentsBadgeData } = useQuery<{ count: number }>({
    queryKey: ["/api/dashboard/pending-assignments-count"],
    queryFn: async () => {
      // Keep dashboard queue badge aligned with dispatch center logic.
      const res = await fetch("/api/admin/pending-orders", { credentials: "include" });
      if (!res.ok) return { count: 0 };
      const data = await res.json();
      return { count: Array.isArray(data) ? data.length : 0 };
    },
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: deliveryZones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/admin/delivery-zones"],
    queryFn: async () => {
      const res = await fetch("/api/admin/delivery-zones", { credentials: "include", cache: "no-store" });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 10000,
    staleTime: 0,
  });

  const { data: pickupStations = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/admin/pickup-stations"],
    queryFn: async () => {
      const res = await fetch("/api/admin/pickup-stations", { credentials: "include", cache: "no-store" });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 10000,
    staleTime: 0,
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: platformSettings } = useQuery<PlatformSettingsVisibility>({
    queryKey: ["/api/platform-settings"],
    queryFn: () => fetchApiJson<PlatformSettingsVisibility>("/api/platform-settings"),
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 30000,
  });
  const { data: riderRiskScores = [] } = useQuery<RiderRiskScore[]>({
    queryKey: ["/api/admin/rider-risk-scores"],
    queryFn: async () => {
      const res = await fetch("/api/admin/rider-risk-scores?limit=5", { credentials: "include" });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && isSuperAdmin,
    refetchInterval: 30000,
  });
  const { data: etaControls } = useQuery<EtaControls>({
    queryKey: ["/api/admin/eta-controls"],
    queryFn: async () => {
      const res = await fetch("/api/admin/eta-controls", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load ETA controls");
      return res.json();
    },
    enabled: isAuthenticated && isSuperAdmin,
    refetchInterval: 30000,
  });

  const updateEtaControlsMutation = useMutation({
    mutationFn: async (next: Partial<EtaControls>) => {
      const res = await fetch("/api/admin/eta-controls", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Failed to update ETA controls");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/eta-controls"] });
      toast({ title: "ETA Controls Updated", description: "AI ETA settings were applied." });
    },
    onError: () => {
      toast({ title: "Update Failed", description: "Could not update ETA controls.", variant: "destructive" });
    },
  });

  const updateAdminOperationsPanelsMutation = useMutation({
    mutationFn: async (showAdminOperationsPanels: boolean) => {
      const res = await apiRequest("PATCH", "/api/settings", { showAdminOperationsPanels });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Dashboard Panels Updated",
        description: "Admin operations panels visibility was saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error?.message || "Could not save dashboard panel visibility.",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!socket) return;

    const handleDeliveryZonesUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
    };

    const handleEtaControlsUpdated = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/eta-controls"] });
    };

    socket.on("delivery_zones_updated", handleDeliveryZonesUpdated);
    socket.on("admin_eta_controls_updated", handleEtaControlsUpdated);
    return () => {
      socket.off("delivery_zones_updated", handleDeliveryZonesUpdated);
      socket.off("admin_eta_controls_updated", handleEtaControlsUpdated);
    };
  }, [socket, queryClient]);

  // Fetch pending rider payouts (super_admin only)
  const { data: pendingPayouts = [], isLoading: payoutsLoading } = useQuery<PendingPayout[]>({
    queryKey: ["/api/admin/rider-payouts/pending"],
    enabled: isAuthenticated && isSuperAdmin,
    refetchInterval: 15000,
  });

  // Fetch riders for name lookup
  const { data: riders = [] } = useQuery<User[]>({
    queryKey: ["/api/users", "rider"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=rider");
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && isSuperAdmin,
  });

  // Approve payout mutation
  const approveMutation = useMutation({
    mutationFn: async (payoutId: string) => {
      const res = await fetch(`/api/admin/rider-payouts/${payoutId}/approve`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to approve payout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-payouts/pending"] });
      toast({ title: "Payout Approved", description: "Rider has been notified" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve payout", variant: "destructive" });
    }
  });

  // Reject payout mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ payoutId, reason }: { payoutId: string; reason: string }) => {
      const res = await fetch(`/api/admin/rider-payouts/${payoutId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason })
      });
      if (!res.ok) throw new Error("Failed to reject payout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/rider-payouts/pending"] });
      toast({ title: "Payout Rejected", description: "Rider has been notified" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject payout", variant: "destructive" });
    }
  });

  const riderMap = new Map(Array.isArray(riders) ? riders.map(r => [r.id, r]) : []);
  const normalizeOrderStatus = (value?: string) => String(value || "").toLowerCase().trim();
  const normalizePaymentStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid" || s === "success") return "paid";
    return s || "pending";
  };
  const isPaidPaymentStatus = (value?: string) => normalizePaymentStatus(value) === "paid";

  if (authLoading || !isAuthenticated || !isAdminViewer) {
    return <PageLoadingState title="Loading dashboard" description="Preparing the admin workspace and latest platform totals." />;
  }

  const recentOrders = orders
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 6);

  const buyerMap = new Map(Array.isArray(buyers) ? buyers.map(b => [b.id, b]) : []);

  const showAdminOperationsPanels = platformSettings?.showAdminOperationsPanels !== false;
  const showInternalRiderFeatures = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;
  const sanitizeOrderStatusForExternalMode = (value?: string) => {
    const status = String(value || "").toLowerCase().trim();
    if (!showInternalRiderFeatures && ["searching_rider", "assigned"].includes(status)) {
      return "external_dispatch_arranged";
    }
    if (!showInternalRiderFeatures && ["picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      return "en_route";
    }
    if (!showInternalRiderFeatures && ["rider_arrived", "delivered"].includes(status)) {
      return "completed";
    }
    return value || "";
  };

  const isPickupMethod = (value?: string) => {
    const method = String(value || "").toLowerCase().trim();
    return method === "pickup" || method === "store_pickup";
  };

  const deliveredCount = orders.filter((o) => {
    const normalized = sanitizeOrderStatusForExternalMode(o.status);
    return !isPickupMethod(o.deliveryMethod) && (normalized === "delivered" || normalized === "completed");
  }).length;
  const successfulPickupCount = orders.filter((o) => {
    const normalized = sanitizeOrderStatusForExternalMode(o.status);
    return isPickupMethod(o.deliveryMethod) && (normalized === "delivered" || normalized === "completed");
  }).length;
  const pendingApplicationsCount = pendingApplicationsBadgeData?.count || 0;
  const pendingAssignmentsCount = pendingAssignmentsBadgeData?.count || 0;
  const activeZoneCount = deliveryZones.filter((zone) => zone.isActive !== false).length;
  const hasOrdersData = !ordersLoading;
  const shouldBlockMetrics = dashboardSummaryLoading && !dashboardSummary && !hasOrdersData;
  const totalOrdersValue = dashboardSummary?.totalOrders ?? analytics?.totalOrders ?? orders.length;
  const totalUsersValue = dashboardSummary?.totalUsers ?? analytics?.totalUsers;
  const totalRevenueValue =
    dashboardSummary?.totalRevenue ??
    dashboardSummary?.platformRevenueTotal ??
    analytics?.platformRevenueTotal ??
    (financeSummary?.totalRevenue ? Number(financeSummary.totalRevenue) : undefined) ??
    analytics?.totalRevenue ??
    analytics?.platformCommissionTotal ??
    (financeSummary?.byType?.commission ? Number(financeSummary.byType.commission) : undefined);
  const paidMoneyFromOrders = orders
    .filter((o) => isPaidPaymentStatus((o as any).paymentStatus))
    .reduce((sum, o) => sum + Number.parseFloat((o as any).total || "0"), 0);
  const totalReceivedMoney = typeof analytics?.totalReceivedMoney === "number"
    ? analytics.totalReceivedMoney
    : typeof dashboardSummary?.totalReceivedMoney === "number"
      ? dashboardSummary.totalReceivedMoney
    : paidMoneyFromOrders;
  const getExternalDeliveryTypeLabel = (orderLike?: { externalDeliveryType?: string | null; externalDeliveryByBus?: boolean | null }) => {
    const normalizedType = String(orderLike?.externalDeliveryType || "").toLowerCase().trim();
    if (normalizedType === "bus" || orderLike?.externalDeliveryByBus) return "VIP Bus Delivery";
    return "Third-Party Delivery";
  };
  const getDeliveryLabel = (order: Order) => {
    if (isPickupMethod(order.deliveryMethod)) return "Pickup";
    if (!showInternalRiderFeatures) return getExternalDeliveryTypeLabel(order);
    const method = String(order.deliveryMethod || "").toLowerCase().trim();
    if (method === "bus") return "Bus Delivery";
    if (method === "rider") return "Rider Delivery";
    return order.deliveryMethod || "Delivery";
  };
  const getSellerActionState = (order: Order) => {
    const status = String(order.status || "").toLowerCase().trim();
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const pickupFlow = isPickupMethod(order.deliveryMethod);
    const externalDeliveryFlow = !showInternalRiderFeatures && !pickupFlow;

    if (externalDeliveryFlow && ["rider_arrived", "delivered", "completed"].includes(status)) {
      return {
        label: "Completed",
        hint: "No further seller action required",
        className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
      };
    }

    if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) {
      return {
        label: "Awaiting Payment",
        hint: "Seller action not started",
        className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20",
      };
    }

    if (["paid", "processing", "preparing", "confirmed"].includes(status)) {
      return {
        label: "Seller Action Required",
        hint: pickupFlow
          ? "Seller must prepare for pickup"
          : externalDeliveryFlow
            ? "Seller must prepare for external delivery handoff"
            : "Seller must prepare for dispatch",
        className: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
      };
    }

    if (pickupFlow && status === "packaged") {
      return {
        label: "Packaged",
        hint: "Super admin must assign a pickup station",
        className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20",
      };
    }

    if (["ready", "searching_rider", "assigned", "rider_arrived"].includes(status)) {
      return {
        label: pickupFlow ? "Ready for Pickup" : externalDeliveryFlow ? "Awaiting External Dispatch" : "Ready for Dispatch",
        hint: pickupFlow
          ? "Awaiting buyer collection"
          : externalDeliveryFlow
            ? "Admin must arrange the external delivery service"
            : "Awaiting rider assignment or dispatch progression",
        className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
      };
    }

    if (status === "external_dispatch_arranged") {
      return {
        label: "External Delivery Arranged",
        hint: "Manual delivery handoff is being coordinated",
        className: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/20",
      };
    }

    if (["picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      return {
        label: externalDeliveryFlow ? "Delivery In Progress" : "Seller Handoff Complete",
        hint: externalDeliveryFlow ? "Operations is managing the final delivery flow" : "No further seller action required",
        className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
      };
    }

    if (["delivered", "completed"].includes(status)) {
      return {
        label: "Completed",
        hint: "No further action required",
        className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
      };
    }

    if (status === "cancelled") {
      return {
        label: "Order Cancelled",
        hint: "No seller action required",
        className: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20",
      };
    }

    return {
      label: "Seller Status Pending",
      hint: "Review order details",
      className: "bg-muted text-muted-foreground border-border",
    };
  };
  const getAwaitingActionOwner = (order: Order): "seller" | "admin" | "rider" | "done" | "none" => {
    const status = String(order.status || "").toLowerCase().trim();
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const pickupFlow = isPickupMethod(order.deliveryMethod);
    const externalDeliveryFlow = !showInternalRiderFeatures && !pickupFlow;

    if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) return "none";
    if (["paid", "processing", "preparing", "confirmed"].includes(status)) return "seller";
    if (pickupFlow && status === "packaged") return "admin";
    if (["ready", "searching_rider", "external_dispatch_arranged"].includes(status) && !pickupFlow) return "admin";
    if (externalDeliveryFlow && ["rider_arrived", "delivered", "completed"].includes(status)) return "done";
    if (["assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      return externalDeliveryFlow ? "admin" : "rider";
    }
    if (["delivered", "completed"].includes(status)) return "done";
    return "none";
  };
  const getActionPill = (order: Order) => {
    const owner = getAwaitingActionOwner(order);
    if (owner === "seller") {
      return {
        label: "Seller Action Required",
        className: "bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-500/20",
      };
    }
    if (owner === "admin") {
      return {
        label: "Admin Action Required",
        className: "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20",
      };
    }
    if (owner === "rider") {
      return {
        label: "Rider Action Required",
        className: "bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20",
      };
    }
    if (owner === "done") {
      return {
        label: "Completed",
        className: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20",
      };
    }
    return null;
  };
  const getPaymentPillClass = (value?: string) => {
    const payment = normalizePaymentStatus(value);
    if (payment === "paid") return "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/20";
    if (payment === "pending") return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/20";
    return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20";
  };

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role={isSuperAdmin ? "super_admin" : "admin"}
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user?.name || "Admin"}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            {isSuperAdmin ? "Super Admin" : "Admin"} Dashboard
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
            {isSuperAdmin && (
              shouldBlockMetrics ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading live dashboard totals...</span>
                  </div>
                  <DashboardMetricSkeletonGrid />
                </div>
              ) : (
                <div className="space-y-3">
                  {dashboardSummaryLoading && !dashboardSummary ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Live analytics are still syncing. Showing dashboard totals now.</span>
                    </div>
                  ) : null}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-7 gap-6">
                  <MetricCard
                    title="Total Revenue"
                    value={typeof totalRevenueValue === "number" ? formatPrice(totalRevenueValue) : "..." }
                    icon={DollarSign}
                    change={12.5}
                  />
                  <MetricCard
                    title="Total Received Money"
                    value={formatPrice(totalReceivedMoney || 0)}
                    icon={Wallet}
                    change={9.4}
                  />
                  <MetricCard
                    title="Total Orders"
                    value={totalOrdersValue.toString()}
                    icon={ShoppingBag}
                    change={8.2}
                  />
                  <MetricCard
                    title="Total Users"
                    value={typeof totalUsersValue === "number" ? totalUsersValue.toString() : "..."}
                    icon={Users}
                    change={-3.1}
                  />
                  <MetricCard
                    title="Deliveries"
                    value={deliveredCount.toString()}
                    icon={Truck}
                    change={15.3}
                  />
                  <MetricCard
                    title="Successful Pickups"
                    value={successfulPickupCount.toString()}
                    icon={CheckCircle}
                    change={11.2}
                  />
                </div>
                </div>
              )
            )}

            {isSuperAdmin && showInternalRiderFeatures && (
              <div className="flex flex-wrap items-center justify-end gap-3 rounded-lg border bg-card p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Admin Operations Panels</p>
                  <p className="text-xs text-muted-foreground">
                    Toggle fleet control, AI ETA, and rider risk together. This stays saved until you change it.
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                  <Badge variant={showAdminOperationsPanels ? "default" : "outline"}>
                    {showAdminOperationsPanels ? "Visible" : "Hidden"}
                  </Badge>
                  <Switch
                    checked={showAdminOperationsPanels}
                    disabled={updateAdminOperationsPanelsMutation.isPending}
                    onCheckedChange={(checked) => updateAdminOperationsPanelsMutation.mutate(checked)}
                    data-testid="switch-admin-operations-panels"
                    aria-label="Toggle admin operations panels"
                  />
                </div>
              </div>
            )}

            {showAdminOperationsPanels && showInternalRiderFeatures && (
              <TrackingMetricsPanel
                role={isSuperAdmin ? "super_admin" : "admin"}
                title={isSuperAdmin ? "Fleet Control Intelligence" : "Zone Dispatch Intelligence"}
              />
            )}

            {isSuperAdmin && showAdminOperationsPanels && showInternalRiderFeatures && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">AI ETA Control Center</CardTitle>
                  <CardDescription>Global and role-level control for AI-assisted ETA predictions. Super Admin is always enabled.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={etaControls?.aiEnabledGlobal ? "default" : "outline"}>
                      AI ETA {etaControls?.aiEnabledGlobal ? "Enabled" : "Disabled"}
                    </Badge>
                    <Button
                      size="sm"
                      variant={etaControls?.aiEnabledGlobal ? "outline" : "default"}
                      disabled={updateEtaControlsMutation.isPending}
                      onClick={() =>
                        updateEtaControlsMutation.mutate({
                          aiEnabledGlobal: !etaControls?.aiEnabledGlobal,
                        })
                      }
                    >
                      {etaControls?.aiEnabledGlobal ? "Disable Global AI ETA" : "Enable Global AI ETA"}
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {ETA_CONTROL_ROLE_KEYS.map((roleKey) => {
                      const enabled = etaControls?.aiEnabledByRole?.[roleKey] !== false;
                      return (
                        <div key={roleKey} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{roleKey}</p>
                          <p className="text-sm font-semibold">{enabled ? "AI ETA On" : "AI ETA Off"}</p>
                          <Button
                            className="mt-2"
                            size="sm"
                            variant="outline"
                            disabled={updateEtaControlsMutation.isPending}
                            onClick={() =>
                              updateEtaControlsMutation.mutate({
                                aiEnabledByRole: {
                                  ...(etaControls?.aiEnabledByRole || {}),
                                  [roleKey]: !enabled,
                                },
                              } as any)
                            }
                          >
                            Toggle
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {isSuperAdmin && showAdminOperationsPanels && showInternalRiderFeatures && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Rider Risk Overlay</CardTitle>
                  <CardDescription>Silent fraud/anomaly score feed for manual intervention.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {riderRiskScores.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No active risk signals.</p>
                  ) : (
                    riderRiskScores.map((risk) => (
                      <div key={risk.riderId} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium">{risk.riderId}</p>
                          <Badge variant={risk.score >= 6 ? "destructive" : risk.score >= 3 ? "default" : "outline"}>
                            Score {risk.score.toFixed(1)}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Last signal: {risk.signals[risk.signals.length - 1]?.signal || "none"}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pending Payouts Widget - Super Admin Only, only show when there are pending payouts */}
            {isSuperAdmin && showInternalRiderFeatures && pendingPayouts.length > 0 && (
              <Card className="border-orange-200 dark:border-orange-800">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-5 w-5 text-orange-500" />
                    <CardTitle>Pending Rider Payouts</CardTitle>
                    <Badge variant="destructive" className="ml-2">{pendingPayouts.length}</Badge>
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => navigate("/admin/riders-payouts")}
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent>
                  {payoutsLoading ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin" />
                    </div>
                  ) : (
                    <ScrollArea className="h-[300px]">
                      <div className="space-y-3">
                        {pendingPayouts.slice(0, 5).map((payout) => {
                          const rider = riderMap.get(payout.riderId);
                          return (
                            <div key={payout.id} className="p-3 border rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                                      📦 Action Required
                                    </Badge>
                                  </div>
                                  <p className="font-medium mt-1 text-sm">
                                    Order #{payout.notes?.match(/#?(\w+)/)?.[1] || payout.orderId?.slice(0, 8)}
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Rider: {rider?.name || "Unknown"}
                                  </p>
                                  <p className="text-lg font-bold text-green-600 mt-1">
                                    {payout.currency} {parseFloat(payout.amount).toFixed(2)}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Status: Delivered & Verified
                                  </p>
                                </div>
                                <div className="flex flex-col gap-1">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white"
                                    onClick={() => approveMutation.mutate(payout.id)}
                                    disabled={approveMutation.isPending}
                                  >
                                    {approveMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                    )}
                                    Approve
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() => rejectMutation.mutate({ payoutId: payout.id, reason: "Payment issue" })}
                                    disabled={rejectMutation.isPending}
                                  >
                                    <XCircle className="h-3 w-3 mr-1" />
                                    Reject
                                  </Button>
                                </div>
                              </div>
                              <div className="flex gap-2 mt-2 pt-2 border-t">
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-xs h-7"
                                  onClick={() => navigate(`/admin/orders?orderId=${payout.orderId}`)}
                                >
                                  <ExternalLink className="h-3 w-3 mr-1" />
                                  View Order
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="text-xs h-7"
                                  onClick={() => navigate(`/admin/messages?userId=${payout.riderId}`)}
                                >
                                  <MessageCircle className="h-3 w-3 mr-1" />
                                  Chat
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        {pendingPayouts.length > 5 && (
                          <Button 
                            variant="outline" 
                            className="w-full"
                            onClick={() => navigate("/admin/riders-payouts")}
                          >
                            View {pendingPayouts.length - 5} more pending payouts
                          </Button>
                        )}
                      </div>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Platform Settings</CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/settings")}
                    data-testid="button-configure"
                  >
                    Configure
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Platform Configuration</p>
                        <p className="text-sm text-muted-foreground">
                          Manage payment settings, contact info, and branding
                        </p>
                        {showInternalRiderFeatures ? (
                          <p className="text-xs text-muted-foreground mt-1">
                            Delivery zones: {deliveryZones.length} total ({activeZoneCount} active)
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground mt-1">
                          Pickup stations: {pickupStations.length} total ({pickupStations.filter((station) => station.isActive).length} active)
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {showInternalRiderFeatures ? (
                        <Button
                          variant="outline"
                          onClick={() => navigate("/admin/zones")}
                          data-testid="button-manage-delivery-zones"
                        >
                          <MapPin className="h-4 w-4 mr-2" />
                          Manage Delivery Zones
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        onClick={() => navigate("/admin/pickup-stations")}
                        data-testid="button-manage-pickup-stations"
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Manage Pickup Stations
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <UserCog className="h-5 w-5" />
                    Sellers Management
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/sellers")}
                    data-testid="button-view-sellers"
                  >
                    View All
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Manage Sellers</p>
                        <p className="text-sm text-muted-foreground">
                          View, approve, and manage all sellers on the platform
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5" />
                    Applications
                    {pendingApplicationsCount > 0 && (
                      <Badge variant="destructive" className="ml-1">{pendingApplicationsCount > 99 ? "99+" : pendingApplicationsCount}</Badge>
                    )}
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/applications")}
                    data-testid="button-view-applications"
                  >
                    Review
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Pending Applications</p>
                        <p className="text-sm text-muted-foreground">
                          Review and approve pending marketplace applications
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {showInternalRiderFeatures
                            ? `Sellers: ${pendingApplicationsBadgeData?.sellers || 0} | Riders: ${pendingApplicationsBadgeData?.riders || 0}`
                            : `Sellers: ${pendingApplicationsBadgeData?.sellers || 0}`}
                        </p>
                      </div>
                      <Badge variant={pendingApplicationsCount > 0 ? "destructive" : "secondary"}>
                        {pendingApplicationsCount}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {showInternalRiderFeatures ? (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Rider Assignment Queue
                    {pendingAssignmentsCount > 0 && (
                      <Badge variant="destructive" className="ml-1">{pendingAssignmentsCount > 99 ? "99+" : pendingAssignmentsCount}</Badge>
                    )}
                  </CardTitle>
                  <Button 
                    variant="outline" 
                    onClick={() => navigate("/admin/manual-rider-assignment")}
                    data-testid="button-view-rider-queue"
                  >
                    Open Queue
                  </Button>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <div>
                        <p className="font-semibold">Pending Rider Assignment</p>
                        <p className="text-sm text-muted-foreground">
                          Orders waiting for a rider assignment
                        </p>
                      </div>
                      <Badge variant={pendingAssignmentsCount > 0 ? "destructive" : "secondary"}>
                        {pendingAssignmentsCount}
                      </Badge>
                    </div>
                    <Button variant="outline" onClick={() => navigate("/admin/riders")} data-testid="button-view-riders">
                      Manage Riders
                    </Button>
                  </div>
                </CardContent>
              </Card>
              ) : null}
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Recent Orders</h2>
                <Button variant="outline" onClick={() => navigate("/admin/orders")} data-testid="button-view-all">View All</Button>
              </div>

              {ordersLoading && recentOrders.length === 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Loading recent orders...</span>
                  </div>
                  <RecentOrdersSkeletonGrid />
                </div>
              ) : recentOrders.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {recentOrders.map((order) => {
                    const buyer = buyerMap.get(order.buyerId);
                    const orderDate = new Date(order.createdAt);
                    const formattedDate = orderDate.toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric', 
                      year: 'numeric' 
                    });

                    return (
                      (() => {
                        const sellerState = getSellerActionState(order);
                        const actionPill = getActionPill(order);
                        const customerName =
                          String(order.buyer?.name || "").trim() ||
                          String(order.customerInfo?.name || "").trim() ||
                          String(buyer?.name || "").trim() ||
                          String(order.buyer?.email || "").trim() ||
                          "Unknown Customer";
                        const sellerDisplayName =
                          String(order.seller?.storeName || "").trim() ||
                          String(order.sellerInfo?.storeName || "").trim() ||
                          String(order.seller?.name || "").trim() ||
                          String(order.sellerInfo?.name || "").trim() ||
                          "Unknown Seller Store";

                        return (
                          <Card
                            key={order.id}
                            className="group min-w-0 border-border/70 bg-card/95 transition-all hover:border-primary/30 hover:shadow-lg"
                            data-testid={`card-recent-order-${order.id}`}
                          >
                            <CardContent className="p-6 space-y-5">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                  <p className="text-lg font-semibold leading-tight truncate">
                                    Order #{order.orderNumber || order.id.slice(0, 8)}
                                  </p>
                                  <p className="text-sm text-muted-foreground truncate">{customerName}</p>
                                </div>
                                <Badge className="border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300">
                                  {(() => {
                                    const normalizedStatus = String(sanitizeOrderStatusForExternalMode(order.status) || "processing").toLowerCase().trim();
                                    if (isPickupMethod(order.deliveryMethod) && normalizedStatus === "packaged") return "Packaged";
                                    if (isPickupMethod(order.deliveryMethod) && normalizedStatus === "ready") return "Ready for Pickup";
                                    return normalizedStatus
                                      .replace(/_/g, " ")
                                      .replace(/\b\w/g, (char) => char.toUpperCase());
                                  })()}
                                </Badge>
                              </div>

                              <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Delivery</p>
                                  <p className="mt-1 font-medium">{getDeliveryLabel(order)}</p>
                                </div>
                                <div className="rounded-xl border border-border/70 bg-background/70 p-3">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Date</p>
                                  <p className="mt-1 font-medium">{formattedDate}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Badge className={`border ${getPaymentPillClass(order.paymentStatus)}`}>
                                  {normalizePaymentStatus(order.paymentStatus).replace(/\b\w/g, (char) => char.toUpperCase())}
                                </Badge>
                                {actionPill ? (
                                  <Badge className={`border ${actionPill.className}`}>
                                    {actionPill.label}
                                  </Badge>
                                ) : null}
                              </div>

                              <div className="rounded-2xl border border-border/70 bg-background/60 p-4 space-y-2">
                                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Order Responsibility</p>
                                <p className="text-sm font-medium text-foreground">{sellerState.hint}</p>
                                <p className="text-sm text-muted-foreground">
                                  Responsible seller store: <span className="font-medium text-foreground">{sellerDisplayName}</span>
                                </p>
                              </div>

                              <div className="grid grid-cols-1 gap-3 border-t border-border/70 pt-4">
                                <div className="min-w-0">
                                  <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Total</p>
                                  <p className="text-2xl font-semibold">{formatPrice(parseFloat(order.total || "0"))}</p>
                                </div>
                                <Button
                                  variant="outline"
                                  className="h-auto w-full max-w-full min-w-0 whitespace-normal break-words px-4 py-2 text-sm"
                                  onClick={() => navigate(`/admin/orders/${order.id}/action`)}
                                  data-testid={`button-open-recent-order-${order.id}`}
                                >
                                  Open Action Center
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })()
                    );
                  })}
                </div>
              ) : (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    No orders yet
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

