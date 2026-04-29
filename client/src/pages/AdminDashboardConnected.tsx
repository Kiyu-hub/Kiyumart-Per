import { useState, useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, ShoppingBag, Users, Truck, Loader2, UserCog, Ticket, Wallet, CheckCircle, XCircle, ExternalLink, MessageCircle, MapPin, AlertTriangle, Wrench, PowerOff, Clock, ShieldAlert, RefreshCw, CalendarDays, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  totalDeliveries?: number;
  totalPickups?: number;
  successfulDeliveries?: number;
  successfulPickups?: number;
  successfulOrders?: number;
}

interface SellerPayoutSummary {
  id: string;
  name: string;
  totalPaid: number | string;
  pendingAmount: number | string;
}

interface MaintenanceStatus {
  isMaintenanceMode: boolean;
  isManualMaintenance: boolean;
  isAutoMaintenance: boolean;
  autoMaintenanceReason: "restart" | "file_change" | null;
  autoMaintenanceUntil: string | null;
  autoSecondsLeft: number;
  maintenanceMessage: string | null;
  maintenanceStartedAt: string | null;
  maintenanceScheduledEnd: string | null;
}

interface SellerPaymentAlert {
  payoutId: string;
  sellerId: string;
  sellerName: string;
  amount: string | number;
  currency: string;
  status: string;
  method: string;
  reason: string;
  createdAt: string;
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
    <Card className={`border-border/70 bg-card/95 ${className}`.trim()}>
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
    } else if (path.includes("/admin/pickup-verify")) {
      setActiveItem("pickup-verify");
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
    } else if (path.includes("/admin/system-activities")) {
      setActiveItem("system-activities");
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
      id === "pickup-verify" ? "/admin/pickup-verify" :
      id === "my-cart" ? "/cart" :
      id === "my-purchases" ? "/orders" :
      id === "my-wishlist" ? "/wishlist" :
      id === "notifications" ? "/admin/notifications" :
      id === "messages" ? "/admin/messages" :
      id === "live-support" ? "/admin/live-support" :
      id === "system-activities" ? "/admin/system-activities" :
      id === "analytics" ? "/admin/analytics" :
      id === "platform-analytics" ? "/admin/platform-analytics" :
      id === "sentry" ? "/admin/sentry" :
      id === "platform-health" ? "/admin/platform-health" :
      id === "platform-earnings" ? "/admin/platform-earnings" :
      id === "sellers-payouts" ? "/admin/sellers-payouts" :
      id === "riders-payouts" ? "/admin/riders-payouts" :
      id === "settings" ? "/admin/settings" :
      id === "promotions" ? "/admin/promotions" :
      id === "banners" ? "/admin/banners" :
      id === "hero-banners" ? "/admin/hero-banners" :
      id === "support" ? "/support" :
      id === "shop-mode" ? "/" :
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

  const { data: sellerPayoutSummary = [] } = useQuery<SellerPayoutSummary[]>({
    queryKey: ["/api/admin/sellers", "dashboard-reconciliation"],
    queryFn: async () =>
      fetchApiJson<SellerPayoutSummary[]>("/api/admin/sellers", {
        credentials: "include",
        cache: "no-store",
      }),
    enabled: isAuthenticated && isSuperAdmin,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const { data: maintenanceStatus, refetch: refetchMaintenance } = useQuery<MaintenanceStatus>({
    queryKey: ["/api/maintenance/status"],
    queryFn: async () => {
      const res = await fetch("/api/maintenance/status", { cache: "no-store", credentials: "include" });
      return res.json();
    },
    enabled: isAuthenticated && isSuperAdmin,
    refetchInterval: 15000,
    staleTime: 0,
  });

  const [maintenanceMsg, setMaintenanceMsg] = useState("");
  const [maintenanceEndDate, setMaintenanceEndDate] = useState<Date | undefined>(undefined);
  const [maintenanceEndTime, setMaintenanceEndTime] = useState("12:00");
  const [maintenanceEndOpen, setMaintenanceEndOpen] = useState(false);
  const [maintenanceToggling, setMaintenanceToggling] = useState(false);

  const toggleMaintenance = async (enable: boolean) => {
    setMaintenanceToggling(true);
    try {
      const body: Record<string, any> = { enable };
      if (enable && maintenanceMsg.trim()) body.message = maintenanceMsg.trim();
      if (enable && maintenanceEndDate) {
        const [h, m] = maintenanceEndTime.split(":").map(Number);
        const d = new Date(maintenanceEndDate);
        d.setHours(h ?? 12, m ?? 0, 0, 0);
        body.scheduledEnd = d.toISOString();
      }
      await apiRequest("POST", "/api/admin/maintenance", body);
      // Show success immediately — the POST worked regardless of what happens next
      toast({
        title: enable ? "Maintenance mode enabled" : "Platform is back online",
        description: enable ? "All users will see the maintenance page." : "Maintenance page removed for all users.",
      });
      // Refetch in background — don't let its promise rejection surface as an error toast
      refetchMaintenance().catch(() => {});
    } catch {
      toast({ title: "Failed to toggle maintenance mode", variant: "destructive" });
    } finally {
      setMaintenanceToggling(false);
    }
  };

  const { data: sellerPaymentAlerts = [] } = useQuery<SellerPaymentAlert[]>({
    queryKey: ["/api/admin/seller-payment-alerts"],
    queryFn: async () =>
      fetchApiJson<SellerPaymentAlert[]>("/api/admin/seller-payment-alerts", {
        credentials: "include",
        cache: "no-store",
      }),
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 30000,
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

  interface PeriodStats { orders: number; revenue: number; platformRevenue: number; deliveries: number; pickups: number; newUsers: number; }
  interface PeriodComparison { current: PeriodStats; previous: PeriodStats; }
  const { data: periodStats } = useQuery<PeriodComparison>({
    queryKey: ["/api/admin/dashboard-period-stats"],
    queryFn: async () => fetchApiJson<PeriodComparison>("/api/admin/dashboard-period-stats", { credentials: "include", cache: "no-store" }),
    enabled: isAuthenticated && isAdminViewer,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const pctChange = (cur: number, prev: number): number | undefined => {
    if (prev === 0) return cur > 0 ? 100 : undefined;
    return Math.round(((cur - prev) / prev) * 1000) / 10;
  };

  const metricChanges = periodStats ? {
    platformRevenue: pctChange(periodStats.current.platformRevenue, periodStats.previous.platformRevenue),
    grossCollections: pctChange(periodStats.current.revenue, periodStats.previous.revenue),
    totalOrders: pctChange(periodStats.current.orders, periodStats.previous.orders),
    totalUsers: pctChange(periodStats.current.newUsers, periodStats.previous.newUsers),
    deliveries: pctChange(periodStats.current.deliveries, periodStats.previous.deliveries),
    pickups: pctChange(periodStats.current.pickups, periodStats.previous.pickups),
  } : {};

  const { data: orders = [], isLoading: ordersLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders", "admin-dashboard", user?.id],
    queryFn: async () =>
      fetchApiJson<Order[]>("/api/orders?context=admin&includeItems=false", {
        credentials: "include",
        cache: "no-store",
      }),
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

  const deliveredCountFromOrders = orders.filter((o) => {
    const normalized = sanitizeOrderStatusForExternalMode(o.status);
    return !isPickupMethod(o.deliveryMethod) && normalized === "completed";
  }).length;
  const successfulPickupCountFromOrders = orders.filter((o) => {
    const normalized = sanitizeOrderStatusForExternalMode(o.status);
    return isPickupMethod(o.deliveryMethod) && normalized === "completed";
  }).length;
  const totalDeliveriesCountFromOrders = orders.filter((o) => !isPickupMethod(o.deliveryMethod)).length;
  const totalPickupsCountFromOrders = orders.filter((o) => isPickupMethod(o.deliveryMethod)).length;
  const pendingApplicationsCount = pendingApplicationsBadgeData?.count || 0;
  const pendingAssignmentsCount = pendingAssignmentsBadgeData?.count || 0;
  const activeZoneCount = deliveryZones.filter((zone) => zone.isActive !== false).length;
  const hasOrdersData = !ordersLoading;
  const shouldBlockMetrics = dashboardSummaryLoading && !dashboardSummary && !hasOrdersData;
  const totalOrdersValue = dashboardSummary?.totalOrders ?? analytics?.totalOrders ?? orders.length;
  const totalUsersValue = dashboardSummary?.totalUsers ?? analytics?.totalUsers;
  const totalDeliveriesValue =
    dashboardSummary?.successfulDeliveries ?? deliveredCountFromOrders;
  const totalPickupsValue =
    dashboardSummary?.successfulPickups ?? successfulPickupCountFromOrders;
  const successfulDeliveriesValue =
    dashboardSummary?.successfulDeliveries ?? deliveredCountFromOrders;
  const successfulPickupValue =
    dashboardSummary?.successfulPickups ?? successfulPickupCountFromOrders;
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
  const sellerShareOwed = sellerPayoutSummary.reduce((sum, seller) => {
    return sum + Number.parseFloat(String(seller.totalPaid ?? "0") || "0") + Number.parseFloat(String(seller.pendingAmount ?? "0") || "0");
  }, 0);
  const verifiedPaidTotal = sellerPayoutSummary.reduce((sum, seller) => {
    return sum + Number.parseFloat(String(seller.totalPaid ?? "0") || "0");
  }, 0);
  const stillPendingTotal = sellerPayoutSummary.reduce((sum, seller) => {
    return sum + Number.parseFloat(String(seller.pendingAmount ?? "0") || "0");
  }, 0);
  const platformCommissionTotal =
    typeof analytics?.platformCommissionTotal === "number"
      ? analytics.platformCommissionTotal
      : typeof dashboardSummary?.platformCommissionTotal === "number"
        ? dashboardSummary.platformCommissionTotal
        : financeSummary?.byType?.commission
          ? Number(financeSummary.byType.commission)
          : 0;
  const promotionRevenueValue =
    typeof dashboardSummary?.promotionRevenueTotal === "number"
      ? dashboardSummary.promotionRevenueTotal
      : typeof analytics?.promotionRevenueTotal === "number"
        ? analytics.promotionRevenueTotal
        : financeSummary?.byType?.promotion
          ? Number(financeSummary.byType.promotion)
          : 0;
  const processingFeesTotal =
    typeof analytics?.processingFeesTotal === "number"
      ? analytics.processingFeesTotal
      : orders.reduce((sum, order: any) => sum + Number.parseFloat(order.processingFee || "0"), 0);
  const deliveryFeesTotal =
    typeof analytics?.deliveryReserveTotal === "number"
      ? analytics.deliveryReserveTotal
      : orders.reduce((sum, order: any) => sum + Number.parseFloat(order.deliveryFee || "0"), 0);
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
    <div className="flex h-screen bg-background overflow-hidden">
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

            {/* Maintenance Mode Control — Super Admin only */}
            {isSuperAdmin && (() => {
              const isActive = !!maintenanceStatus?.isMaintenanceMode;
              const isAuto   = !!maintenanceStatus?.isAutoMaintenance;
              const startedAt = maintenanceStatus?.maintenanceStartedAt
                ? new Date(maintenanceStatus.maintenanceStartedAt).toLocaleString(undefined, {
                    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                  })
                : null;
              const scheduledEnd = maintenanceStatus?.maintenanceScheduledEnd ?? null;
              const currentMsg   = maintenanceStatus?.maintenanceMessage ?? null;

              return (
                <Card className={`border-2 transition-colors ${
                  isActive
                    ? "border-destructive/60 bg-destructive/5 dark:bg-destructive/8"
                    : "border-primary/20 bg-card"
                }`}>
                  {/* ── Header row ── */}
                  <CardHeader className="pb-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          isActive ? "bg-destructive/15" : "bg-muted"
                        }`}>
                          {isActive
                            ? <ShieldAlert className="h-5 w-5 text-destructive" />
                            : <Wrench className="h-5 w-5 text-muted-foreground" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <CardTitle className="text-base leading-tight">Platform Maintenance Mode</CardTitle>
                            {isActive && (
                              <Badge variant="destructive" className="text-xs px-2 py-0.5 animate-pulse">
                                ACTIVE
                              </Badge>
                            )}
                            {isAuto && (
                              <Badge variant="outline" className="text-xs gap-1 px-2 py-0.5">
                                <RefreshCw className="h-3 w-3" /> Auto-triggered
                              </Badge>
                            )}
                          </div>
                          <CardDescription className="text-xs mt-0.5">
                            {isActive
                              ? "The platform is in maintenance mode. All non-admin users are redirected to the maintenance page."
                              : "Enabling maintenance mode will notify all users and block access to the platform until you restore it."}
                          </CardDescription>
                        </div>
                      </div>
                      {/* Quick toggle switch */}
                      <Switch
                        checked={isActive}
                        disabled={maintenanceToggling}
                        onCheckedChange={(checked) => void toggleMaintenance(checked)}
                        className="mt-1 shrink-0"
                      />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-0 space-y-4">
                    {/* ── ACTIVE STATE ── */}
                    {isActive && (
                      <>
                        {/* Status info grid */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {startedAt && (
                            <div className="rounded-lg border border-destructive/20 bg-card px-3 py-2.5">
                              <p className="text-xs text-muted-foreground mb-0.5">Started</p>
                              <p className="text-sm font-medium">{startedAt}</p>
                            </div>
                          )}
                          <div className="rounded-lg border border-destructive/20 bg-card px-3 py-2.5">
                            <p className="text-xs text-muted-foreground mb-0.5">Trigger</p>
                            <p className="text-sm font-medium">
                              {!isAuto
                                ? "Manually enabled by admin"
                                : maintenanceStatus?.autoMaintenanceReason === "file_change"
                                  ? "Auto — source file change detected (dev)"
                                  : "Auto — server restart / new deployment"}
                            </p>
                          </div>
                          {isAuto && maintenanceStatus?.autoSecondsLeft > 0 && (
                            <div className="rounded-lg border border-destructive/20 bg-card px-3 py-2.5">
                              <p className="text-xs text-muted-foreground mb-0.5">Auto-lifts in</p>
                              <p className="text-sm font-semibold text-destructive">
                                {maintenanceStatus.autoSecondsLeft >= 60
                                  ? `${Math.ceil(maintenanceStatus.autoSecondsLeft / 60)}m`
                                  : `${maintenanceStatus.autoSecondsLeft}s`}
                                <span className="text-xs font-normal text-muted-foreground ml-1">
                                  (auto — no action needed)
                                </span>
                              </p>
                            </div>
                          )}
                          {currentMsg && (
                            <div className="rounded-lg border border-destructive/20 bg-card px-3 py-2.5 sm:col-span-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Message shown to users</p>
                              <p className="text-sm italic">"{currentMsg}"</p>
                            </div>
                          )}
                          {scheduledEnd && (
                            <div className="rounded-lg border border-destructive/20 bg-card px-3 py-2.5 sm:col-span-2">
                              <p className="text-xs text-muted-foreground mb-0.5">Scheduled End</p>
                              <div className="flex items-center gap-2">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                <p className="text-sm font-medium">
                                  {new Date(scheduledEnd).toLocaleString(undefined, {
                                    weekday: "short", month: "short", day: "numeric",
                                    hour: "2-digit", minute: "2-digit",
                                  })}
                                </p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Restore button */}
                        <div className="flex items-center gap-3 pt-1">
                          <Button
                            size="sm"
                            disabled={maintenanceToggling}
                            onClick={() => void toggleMaintenance(false)}
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                          >
                            <CheckCircle className="h-4 w-4" />
                            {maintenanceToggling ? "Restoring platform..." : "Restore Platform — Bring It Back Online"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Restoring will immediately lift the maintenance block and notify all users that the platform is back.
                        </p>
                      </>
                    )}

                    {/* ── INACTIVE STATE — setup form ── */}
                    {!isActive && (
                      <>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          {/* Message field */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground/70">
                              Message to users <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <input
                              type="text"
                              className="w-full rounded-lg border border-input bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                              placeholder="We're upgrading the platform. Back soon!"
                              value={maintenanceMsg}
                              onChange={(e) => setMaintenanceMsg(e.target.value)}
                            />
                          </div>

                          {/* Date + time picker */}
                          <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground/70">
                              Expected completion time <span className="text-muted-foreground">(optional)</span>
                            </label>
                            <div className="flex gap-2">
                              {/* Calendar date picker */}
                              <Popover open={maintenanceEndOpen} onOpenChange={setMaintenanceEndOpen}>
                                <PopoverTrigger asChild>
                                  <Button
                                    variant="outline"
                                    className="flex-1 justify-start gap-2 bg-card border-input hover:bg-muted/60 text-sm font-normal h-10"
                                  >
                                    <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                                    {maintenanceEndDate
                                      ? maintenanceEndDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                      : <span className="text-muted-foreground">Pick a date</span>
                                    }
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                                  </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 border-border shadow-xl" align="start">
                                  <Calendar
                                    mode="single"
                                    selected={maintenanceEndDate}
                                    onSelect={(d) => { setMaintenanceEndDate(d); setMaintenanceEndOpen(false); }}
                                    disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>

                              {/* Time picker */}
                              <div className="relative shrink-0">
                                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-primary pointer-events-none" />
                                <input
                                  type="time"
                                  className="h-10 w-[108px] rounded-lg border border-input bg-card pl-8 pr-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary/60 transition-all"
                                  value={maintenanceEndTime}
                                  onChange={(e) => setMaintenanceEndTime(e.target.value)}
                                />
                              </div>
                            </div>
                            {maintenanceEndDate && (
                              <button
                                type="button"
                                className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                                onClick={() => setMaintenanceEndDate(undefined)}
                              >
                                × Clear date
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={maintenanceToggling}
                            onClick={() => void toggleMaintenance(true)}
                            className="gap-2"
                          >
                            <PowerOff className="h-4 w-4" />
                            {maintenanceToggling ? "Enabling..." : "Enable Maintenance Mode"}
                          </Button>
                          {(maintenanceMsg || maintenanceEndDate) && (
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => { setMaintenanceMsg(""); setMaintenanceEndDate(undefined); }}
                            >
                              Clear all
                            </button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          All logged-in users will receive a notification and be shown the maintenance page immediately. Admins retain full access.
                        </p>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

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
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-3">
                  <MetricCard
                    title="Platform Revenue"
                    value={typeof totalRevenueValue === "number" ? formatPrice(totalRevenueValue) : "..." }
                    icon={DollarSign}
                    change={metricChanges.platformRevenue}
                    changeLabel="vs last 30 days"
                    details="Service fees earned + promotion income"
                  />
                  <MetricCard
                    title="Gross Order Collections"
                    value={formatPrice(totalReceivedMoney || 0)}
                    icon={Wallet}
                    change={metricChanges.grossCollections}
                    changeLabel="vs last 30 days"
                    details="Total paid by buyers at checkout (all fees included)"
                  />
                  <MetricCard
                    title="Total Orders"
                    value={totalOrdersValue.toString()}
                    icon={ShoppingBag}
                    change={metricChanges.totalOrders}
                    changeLabel="vs last 30 days"
                  />
                  <MetricCard
                    title="Total Users"
                    value={typeof totalUsersValue === "number" ? totalUsersValue.toString() : "..."}
                    icon={Users}
                    change={metricChanges.totalUsers}
                    changeLabel="new users vs last 30 days"
                  />
                  <MetricCard
                    title="Successful Deliveries"
                    value={totalDeliveriesValue.toString()}
                    icon={Truck}
                    change={metricChanges.deliveries}
                    changeLabel="vs last 30 days"
                  />
                  <MetricCard
                    title="Successful Pickups"
                    value={totalPickupsValue.toString()}
                    icon={CheckCircle}
                    change={metricChanges.pickups}
                    changeLabel="vs last 30 days"
                  />
                </div>
                <CollapsibleDashboardSection
                  title="Money Reconciliation — Full Platform Money Flow"
                  summary="Expand for the complete breakdown of how every buyer payment flows through the platform to sellers, riders, and the platform itself."
                >
                  <div className="space-y-5">
                    {/* Step-by-step money flow */}
                    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                      <p className="text-sm font-semibold text-foreground">How every buyer payment flows through the platform</p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">① Buyer pays at checkout</p>
                          <p className="text-muted-foreground">Product subtotal + platform processing fee (1.95%) + delivery fee. The processing fee is added on top of the order — buyers pay it to cover Paystack's transaction cost.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">② Paystack splits instantly (bank sellers)</p>
                          <p className="text-muted-foreground">For bank-account sellers: Paystack sends the seller's net payout directly to their bank subaccount at checkout. The platform retains the service fee and processing fee in its wallet.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">③ Platform holds, then auto-transfers (mobile money)</p>
                          <p className="text-muted-foreground">For mobile money sellers: the full payment lands in the platform wallet. When the seller requests a withdrawal, the net payout is automatically sent to their mobile money number within ~15 seconds via Paystack transfer.</p>
                        </div>
                        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
                          <p className="font-semibold text-foreground">④ Delivery fee to rider</p>
                          <p className="text-muted-foreground">The delivery fee paid by the buyer is held in reserve and disbursed to the assigned rider or logistics provider upon delivery completion.</p>
                        </div>
                      </div>
                    </div>

                    {/* Metrics grid */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Gross Checkout Collections</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(totalReceivedMoney || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Everything buyers paid: product subtotals + processing fees + delivery fees. This is the total Paystack collected on behalf of the platform.</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seller Gross Sales</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(sellerShareOwed || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Product subtotals minus coupon discounts across all paid orders — the sellers' top-line earnings before the service fee is deducted.</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Platform Service Fee</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(platformCommissionTotal || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">The platform's % cut per sale, deducted from each seller's gross sales. This is the platform's core revenue (separate from the processing fee).</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Checkout Processing Fees</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(processingFeesTotal || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Collected from buyers at checkout (1.95% of order subtotal). Covers Paystack's transaction charge — not part of seller earnings and not the platform service fee.</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Promotion Revenue</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(promotionRevenueValue || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Fees paid by sellers to boost or feature their listings. Combined with the service fee this makes up total platform revenue.</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Delivery Fee Reserve</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(deliveryFeesTotal || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Delivery fees collected from buyers, held in reserve for rider/logistics payouts. Not platform revenue — passes through to riders.</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seller Payouts Completed</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(verifiedPaidTotal || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Net payout amounts already confirmed transferred to seller bank accounts or mobile money wallets.</p>
                        </CardContent>
                      </Card>
                      <Card className="border-border/70 bg-card">
                        <CardContent className="p-4">
                          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Seller Payouts Pending</p>
                          <p className="mt-2 text-2xl font-bold text-foreground">{formatPrice(stillPendingTotal || 0)}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Net payout amounts earned by sellers but not yet transferred. Mobile money payouts are queued automatically; bank-account payouts are handled at checkout.</p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Formula */}
                    <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-xs text-muted-foreground space-y-2">
                      <p className="font-semibold text-foreground text-sm">Money reconciliation formula</p>
                      <p><span className="font-medium text-foreground">Gross Checkout Collections</span> = Seller Gross Sales + Platform Service Fee + Checkout Processing Fees + Delivery Fee Reserve + Promotion Revenue <span className="opacity-70">(± coupon adjustments)</span></p>
                      <p><span className="font-medium text-foreground">Platform Revenue</span> (main metric card) = Platform Service Fee + Promotion Revenue only — it does not include processing fees or delivery reserves.</p>
                      <p><span className="font-medium text-foreground">Seller Net Payout</span> = Seller Gross Sales − Platform Service Fee. This is what sellers actually receive in their bank account or mobile money wallet.</p>
                    </div>

                    {/* Fulfillment stats */}
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                      <Card className="border-border/70 bg-card"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Successful Deliveries</p><p className="mt-2 text-2xl font-bold text-foreground">{successfulDeliveriesValue}</p></CardContent></Card>
                      <Card className="border-border/70 bg-card"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Successful Pickups</p><p className="mt-2 text-2xl font-bold text-foreground">{successfulPickupValue}</p></CardContent></Card>
                      <Card className="border-border/70 bg-card"><CardContent className="p-4"><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Successful Orders</p><p className="mt-2 text-2xl font-bold text-foreground">{dashboardSummary?.successfulOrders ?? (successfulDeliveriesValue + successfulPickupValue)}</p></CardContent></Card>
                    </div>
                  </div>
                </CollapsibleDashboardSection>
                </div>
              )
            )}

            {/* Seller Payment Alerts — always visible when there are unpaid sellers */}
            {sellerPaymentAlerts.length > 0 && (
              <CollapsibleDashboardSection
                title={`Seller Payment Alerts — ${sellerPaymentAlerts.length} Seller${sellerPaymentAlerts.length === 1 ? "" : "s"} Not Yet Paid`}
                summary="Expand to see which sellers have not received their money, with accurate reasons for each."
                defaultOpen
              >
                <div className="space-y-3">
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800/50 dark:bg-amber-950/20 p-3 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      These sellers have completed orders but their settlement has not been fully disbursed. Review each reason and take action where needed. Go to <strong>Admin → Seller Payouts</strong> to process manually.
                    </p>
                  </div>
                  <div className="space-y-2">
                    {sellerPaymentAlerts.map((alert) => (
                      <div key={alert.payoutId} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-border/60 bg-card p-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{alert.sellerName}</span>
                            <Badge variant={alert.status === "failed" ? "destructive" : "outline"} className="capitalize text-xs">
                              {alert.status}
                            </Badge>
                            <Badge variant="secondary" className="text-xs capitalize">{alert.method?.replace(/_/g, " ")}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{alert.reason}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-semibold text-primary">{formatPrice(Number(alert.amount) || 0)}</p>
                          <p className="text-xs text-muted-foreground">{new Date(alert.createdAt).toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => navigate("/admin/sellers-payouts")} className="w-full sm:w-auto">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Manage All Seller Payouts
                  </Button>
                </div>
              </CollapsibleDashboardSection>
            )}

            {isSuperAdmin && showInternalRiderFeatures && (
              <CollapsibleDashboardSection
                title="Admin Operations Panels"
                summary="Expand for the operational note and the visibility control for fleet, ETA, and rider risk panels."
                className="bg-card"
              >
                <div className="space-y-4">
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <p>
                      Toggle fleet control, AI ETA, and rider risk together. This stays saved until you change it.
                    </p>
                    <p>
                      If you hide these panels, the underlying operational systems keep running. This only changes dashboard visibility.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3">
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
              </CollapsibleDashboardSection>
            )}

            {isSuperAdmin && showAdminOperationsPanels && showInternalRiderFeatures && (
              <TrackingMetricsPanel
                role="super_admin"
                title="Fleet Control Intelligence"
              />
            )}

            {isSuperAdmin && showAdminOperationsPanels && showInternalRiderFeatures && (
              <CollapsibleDashboardSection
                title="AI ETA Control Center"
                summary="Expand for the ETA-control explanation and the role-level AI ETA controls."
              >
                <div className="space-y-3">
                  <CardDescription className="text-sm">
                    Global and role-level control for AI-assisted ETA predictions. Super Admin is always enabled.
                  </CardDescription>
                  <p className="text-sm text-muted-foreground">Changing these controls affects visibility and prediction behavior, but it does not edit historic order timelines.</p>
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
                </div>
              </CollapsibleDashboardSection>
            )}

            {isSuperAdmin && showAdminOperationsPanels && showInternalRiderFeatures && (
              <CollapsibleDashboardSection
                title="Rider Risk Overlay"
                summary="Expand for the fraud-signal explanation and the current rider risk feed."
              >
                <div className="space-y-2">
                  <CardDescription className="text-sm">
                    Silent fraud/anomaly score feed for manual intervention.
                  </CardDescription>
                  <p className="text-sm text-muted-foreground">High scores are review signals, not automatic guilt. Use them to inspect routes, proof, and payout activity before acting.</p>
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
                </div>
              </CollapsibleDashboardSection>
            )}

            {/* Pending Payouts Widget - Super Admin Only, only show when there are pending payouts */}
            {isSuperAdmin && showInternalRiderFeatures && pendingPayouts.length > 0 && (
              <CollapsibleDashboardSection
                title="Pending Rider Payouts"
                summary="Expand for the rider-payout note and the current pending rider payout queue."
                className="border-orange-200 dark:border-orange-800"
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-orange-500" />
                        <p className="text-base font-semibold">Pending Rider Payouts</p>
                        <Badge variant="destructive" className="ml-2">{pendingPayouts.length}</Badge>
                      </div>
                      <div className="space-y-1 text-sm text-muted-foreground">
                        <p>These rider payouts still need operational review and should not be confused with seller settlement status.</p>
                        <p>Use this widget to jump into rider payout approval, not seller payout verification.</p>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => navigate("/admin/riders-payouts")}
                    >
                      View All
                    </Button>
                  </div>
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
                </div>
              </CollapsibleDashboardSection>
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

