import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import ProductAutocomplete from "@/components/ProductAutocomplete";
import { BannerEditor, BannerConfig } from "@/components/BannerEditor";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageLoadingState } from "@/components/ui/loading-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  Activity,
  CalendarDays,
  Clock,
  CheckCircle2,
  Paintbrush,
  Pencil,
  ImagePlus,
  Loader2,
  Megaphone,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  ShoppingBag,
  Sparkles,
  Store,
  Tag,
  Trash2,
  Upload,
  XCircle,
  TrendingUp,
  ArrowRight,
  BadgeCheck,
  Timer,
  Eye,
} from "lucide-react";

type PromotionKind = "store" | "product";
type DurationUnit = "hour" | "day" | "week" | "month";

type PromotionPricingRow = {
  id: number;
  type: PromotionKind;
  durationType: DurationUnit;
  duration: number;
  price: string;
  isActive: boolean;
};

type PromotionApplicationRow = {
  id: string;
  type: PromotionKind;
  targetId: string;
  targetName: string;
  storeName?: string | null;
  durationType: DurationUnit;
  duration: number;
  totalPrice: string;
  unitPrice: string;
  sellerNote?: string | null;
  customerServiceNote?: string | null;
  paymentConfirmed: boolean;
  status: "pending_payment" | "payment_confirmed" | "approved" | "active" | "expired" | "rejected";
  createdAt: string;
  approvedAt?: string | null;
  paymentConfirmedAt?: string | null;
  rejectedAt?: string | null;
  endAt?: string | null;
  displaySection?: string | null;
  seller?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type WorkspaceSection = "processing" | "pending_payment" | "active" | "scheduled" | "expired" | "rejected";

const formatDurationLabel = (unit: DurationUnit, n: number) => {
  const labels: Record<DurationUnit, string> = { hour: "hour", day: "day", week: "week", month: "month" };
  return `${n} ${labels[unit]}${n === 1 ? "" : "s"}`;
};

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

export default function AdminPromotions() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const { data: stores = [] } = useQuery<any[]>({
    queryKey: ["/api/stores"],
    queryFn: async () => {
      const res = await fetch("/api/stores");
      return res.json();
    },
  });

  const { data: sellers = [] } = useQuery<any[]>({
    queryKey: ["/api/users/sellers"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=seller");
      return res.json();
    },
  });

  const {
    data: allPromotions = [],
    refetch,
    isRefetching,
  } = useQuery<any[]>({
    queryKey: ["/api/admin/promotions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promotions");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const { data: promotionPricing = [], refetch: refetchPricing } = useQuery<PromotionPricingRow[]>({
    queryKey: ["/api/admin/promotion-pricing"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promotion-pricing", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load promotion pricing");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 30000,
  });

  const {
    data: promotionApplications = [],
    refetch: refetchApplications,
    isRefetching: isRefetchingApplications,
  } = useQuery<PromotionApplicationRow[]>({
    queryKey: ["/api/admin/promotion-applications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promotion-applications", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load promotion applications");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 5000,
  });

  // Create promotion form state
  const [type, setType] = useState<PromotionKind>("store");
  const [storeId, setStoreId] = useState<string | null>(null);
  const [sellerId, setSellerId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productLabels, setProductLabels] = useState<Record<string, string>>({});
  const [duration, setDuration] = useState<number>(24);
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [ctaText, setCtaText] = useState<string>("Shop now");
  const [ctaUrl, setCtaUrl] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [adDisplaySection, setAdDisplaySection] = useState<"homepage" | "banner">("homepage");

  // Per-application placement override state (admin can change before approving)
  const [approvalSections, setApprovalSections] = useState<Record<string, "homepage" | "banner">>({});

  // Pricing form state
  const [pricingType, setPricingType] = useState<PromotionKind>("product");
  const [pricingDurationType, setPricingDurationType] = useState<DurationUnit>("hour");
  const [pricingDuration, setPricingDuration] = useState<number>(1);
  const [pricingAmount, setPricingAmount] = useState<string>("");
  const [editingPricingId, setEditingPricingId] = useState<number | null>(null);

  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>("processing");
  const [previewApp, setPreviewApp] = useState<PromotionApplicationRow | null>(null);

  // Banner designer state
  const [bannerEditorOpen, setBannerEditorOpen] = useState(false);
  const [bannerEditorApp, setBannerEditorApp] = useState<PromotionApplicationRow | null>(null);
  const [editingBannerPromoId, setEditingBannerPromoId] = useState<string | null>(null);
  const [editingBannerConfig, setEditingBannerConfig] = useState<BannerConfig | null>(null);

  // Mutations
  const createPromotion = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/admin/promotions", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      toast({ title: "Created", description: "Promotional ad created" });
    },
    onError: (e: any) => toast({ title: "Create failed", description: e.message || String(e), variant: "destructive" }),
  });

  const expirePromotion = useMutation({
    mutationFn: async (promoId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/promotions/${promoId}/expire`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      toast({ title: "Ended", description: "Promotion has been ended successfully" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || String(e), variant: "destructive" }),
  });

  const resetExpiredPromotions = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/promotions/reset-expired", {});
      return res.json();
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      toast({ title: "Expired promotions cleared", description: `${result?.deletedCount ?? 0} expired promotion(s) removed.` });
    },
    onError: (e: any) => toast({ title: "Reset failed", description: e.message || String(e), variant: "destructive" }),
  });

  const confirmPromotionPayment = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/promotion-applications/${id}/confirm-payment`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      setWorkspaceSection("processing");
      toast({ title: "Payment confirmed", description: "Moved to Processing queue for activation." });
    },
    onError: (e: any) => toast({ title: "Action failed", description: e.message || String(e), variant: "destructive" }),
  });

  const approvePromotionApplication = useMutation({
    mutationFn: async ({ id, bannerConfig, displaySection }: { id: string; bannerConfig?: BannerConfig; displaySection?: "homepage" | "banner" }) => {
      const body: any = {};
      if (bannerConfig) body.bannerConfig = bannerConfig;
      if (displaySection) body.displaySection = displaySection;
      const res = await apiRequest("POST", `/api/admin/promotion-applications/${id}/approve`, body);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] });
      setBannerEditorOpen(false);
      setBannerEditorApp(null);
      setPreviewApp(null);
      setWorkspaceSection("active");
      toast({ title: "Promotion activated", description: "The promotion is now live on the storefront." });
    },
    onError: (e: any) => toast({ title: "Approval failed", description: e.message || String(e), variant: "destructive" }),
  });

  const updateBannerConfig = useMutation({
    mutationFn: async ({ id, bannerConfig }: { id: string; bannerConfig: BannerConfig }) => {
      const res = await apiRequest("PATCH", `/api/admin/promotions/${id}/banner-config`, { bannerConfig });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] });
      setEditingBannerPromoId(null);
      setEditingBannerConfig(null);
      toast({ title: "Banner design updated", description: "Changes are now live on the storefront." });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message || String(e), variant: "destructive" }),
  });

  const handleApproveClick = (app: PromotionApplicationRow) => {
    const section = approvalSections[app.id] ?? (app.displaySection as "homepage" | "banner" | null) ?? "homepage";
    if (section === "banner") {
      setBannerEditorApp(app);
      setBannerEditorOpen(true);
    } else {
      approvePromotionApplication.mutate({ id: app.id, displaySection: section });
    }
  };

  const handleBannerEditorSave = (config: BannerConfig) => {
    if (bannerEditorApp) {
      const section = approvalSections[bannerEditorApp.id] ?? "banner";
      approvePromotionApplication.mutate({ id: bannerEditorApp.id, bannerConfig: config, displaySection: section });
    }
  };

  const handleEditBannerDesign = (promo: any) => {
    setEditingBannerPromoId(promo.id);
    setEditingBannerConfig(promo.bannerConfig || null);
  };

  const rejectPromotionApplication = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/promotion-applications/${id}/reject`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      toast({ title: "Request rejected", description: "The promotion request has been closed." });
    },
    onError: (e: any) => toast({ title: "Reject failed", description: e.message || String(e), variant: "destructive" }),
  });

  const createPricing = useMutation({
    mutationFn: async (payload: { type: PromotionKind; durationType: DurationUnit; duration: number; price: string }) => {
      const res = await apiRequest("POST", "/api/admin/promotion-pricing", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-pricing"] });
      setPricingAmount("");
      setPricingDuration(1);
      toast({ title: "Pricing added" });
    },
    onError: (e: any) => toast({ title: "Pricing error", description: e.message || String(e), variant: "destructive" }),
  });

  const updatePricing = useMutation({
    mutationFn: async ({ id, price, isActive }: { id: number; price?: string; isActive?: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/promotion-pricing/${id}`, { price, isActive });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-pricing"] });
      setEditingPricingId(null);
      setPricingAmount("");
      toast({ title: "Pricing updated" });
    },
    onError: (e: any) => toast({ title: "Update failed", description: e.message || String(e), variant: "destructive" }),
  });

  const deletePricing = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/promotion-pricing/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-pricing"] });
      toast({ title: "Pricing removed" });
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message || String(e), variant: "destructive" }),
  });

  const getPromotionStatus = (promo: any): "active" | "scheduled" | "expired" => {
    if (promo.isActive === false) return "expired";
    const now = new Date();
    if (promo.endAt && new Date(promo.endAt) < now) return "expired";
    if (promo.startAt && new Date(promo.startAt) > now) return "scheduled";
    return "active";
  };

  const activePromotions = useMemo(() => allPromotions.filter((p: any) => getPromotionStatus(p) === "active"), [allPromotions]);
  const scheduledPromotions = useMemo(() => allPromotions.filter((p: any) => getPromotionStatus(p) === "scheduled"), [allPromotions]);
  const expiredPromotions = useMemo(() => allPromotions.filter((p: any) => getPromotionStatus(p) === "expired"), [allPromotions]);

  const processingApps = useMemo(
    () => promotionApplications.filter((a) => a.status === "payment_confirmed"),
    [promotionApplications],
  );
  const pendingPaymentApps = useMemo(
    () => promotionApplications.filter((a) => a.status === "pending_payment"),
    [promotionApplications],
  );
  const rejectedApps = useMemo(
    () => promotionApplications.filter((a) => a.status === "rejected"),
    [promotionApplications],
  );

  const stats = {
    processing: processingApps.length,
    pendingPayment: pendingPaymentApps.length,
    active: activePromotions.length,
    scheduled: scheduledPromotions.length,
    expired: expiredPromotions.length,
    rejected: rejectedApps.length,
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    try {
      setUploading(true);
      const res = await fetch("/api/upload/image", { method: "POST", body: formData, credentials: "include" });
      if (res.ok) {
        const { url } = await res.json();
        setImageUrl(url);
        toast({ title: "Image uploaded" });
      } else {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    } catch {
      toast({ title: "Upload error", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    let finalCtaUrl = ctaUrl;
    if (!finalCtaUrl) {
      if (type === "store" && storeId) finalCtaUrl = `/sellers/${storeId}`;
      else if (type === "product" && productIds.length > 0) finalCtaUrl = `/product/${productIds[0]}`;
    }
    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
      try {
        if (type === "store" && storeId) {
          const r = await fetch(`/api/stores/${storeId}`);
          const s = await r.json();
          finalImageUrl = s?.logo || s?.banner || "";
        } else if (type === "product" && productIds.length > 0) {
          const r = await fetch(`/api/products/${productIds[0]}`);
          const p = await r.json();
          finalImageUrl = p?.images?.[0] || "";
        }
      } catch { /* best-effort */ }
    }
    const now = new Date();
    const endAt = new Date(now.getTime() + duration * 60 * 60 * 1000);
    const basePayload: any = {
      type, startAt: now.toISOString(), endAt: endAt.toISOString(),
      title: title || null, description: description || null,
      imageUrl: finalImageUrl || null, ctaText: ctaText || null, ctaUrl: finalCtaUrl || null,
      displaySection: adDisplaySection,
    };
    if (type === "store") {
      if (!storeId) { toast({ title: "Select a store", variant: "destructive" }); return; }
      createPromotion.mutate({ ...basePayload, targetId: storeId });
    } else {
      const ids = productIds.length > 0 ? productIds : productId ? [productId] : [];
      if (ids.length === 0) { toast({ title: "Select a product", variant: "destructive" }); return; }
      createPromotion.mutate({ ...basePayload, targetIds: ids });
    }
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading promotions" description="Preparing pricing, requests, and live campaigns." />;
  }

  const isSuperAdmin = user.role === "super_admin";

  // Section content resolver
  const getSectionContent = () => {
    if (workspaceSection === "processing") return processingApps;
    if (workspaceSection === "pending_payment") return pendingPaymentApps;
    if (workspaceSection === "rejected") return rejectedApps;
    if (workspaceSection === "active") return activePromotions;
    if (workspaceSection === "scheduled") return scheduledPromotions;
    return expiredPromotions;
  };

  const getQueuePosition = (app: PromotionApplicationRow): number => {
    const section = app.displaySection === "banner" ? "banner" : "homepage";
    return activePromotions.filter((p: any) => {
      const pSection = p.displaySection === "banner" ? "banner" : "homepage";
      return pSection === section;
    }).length;
  };

  const sectionItems = getSectionContent();
  const isApplicationSection = ["processing", "pending_payment", "rejected"].includes(workspaceSection);

  return (
    <DashboardLayout role={user.role as "admin" | "super_admin"}>
      <div className="space-y-6 p-4 md:p-6 pb-10">

        {/* ── Hero Header ───────────────────────────────────── */}
        <div className="rounded-2xl border border-border/60 bg-card dark:bg-gradient-to-br dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/60 p-6 shadow-sm dark:shadow-lg dark:text-white">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge className="border-emerald-600/40 bg-emerald-100 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                  <Megaphone className="mr-1.5 h-3.5 w-3.5" />
                  Promotion Command Center
                </Badge>
                {stats.processing > 0 && (
                  <Badge className="border-sky-600/40 bg-sky-100 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/20 dark:text-sky-200 animate-pulse">
                    <Clock className="mr-1.5 h-3.5 w-3.5" />
                    {stats.processing} awaiting your approval
                  </Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold md:text-3xl text-foreground dark:text-white">Promotions</h1>
              <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground dark:text-white/70">
                Review seller promotion requests, manage live campaigns, and configure pricing from one unified workspace.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="border-border text-foreground hover:bg-muted/60 dark:border-white/20 dark:text-white dark:hover:bg-white/10"
                onClick={() => { refetch(); refetchApplications(); }}
              >
                {isRefetching || isRefetchingApplications
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh
              </Button>
              {isSuperAdmin && stats.expired > 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="border-border text-foreground hover:bg-muted/60 dark:border-white/20 dark:text-white dark:hover:bg-white/10">
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Clear Expired ({stats.expired})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Clear all expired promotions?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Permanently removes all expired promotions. Active and scheduled campaigns stay untouched.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => resetExpiredPromotions.mutate()} disabled={resetExpiredPromotions.isPending}>
                        {resetExpiredPromotions.isPending ? "Clearing…" : "Clear Expired"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          {/* Stats row */}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: "Processing", value: stats.processing, icon: <Clock className="h-4 w-4" />, color: "text-sky-600 dark:text-sky-300", section: "processing" as WorkspaceSection },
              { label: "Pending Payment", value: stats.pendingPayment, icon: <Timer className="h-4 w-4" />, color: "text-amber-600 dark:text-amber-300", section: "pending_payment" as WorkspaceSection },
              { label: "Active", value: stats.active, icon: <Activity className="h-4 w-4" />, color: "text-emerald-600 dark:text-emerald-300", section: "active" as WorkspaceSection },
              { label: "Scheduled", value: stats.scheduled, icon: <CalendarDays className="h-4 w-4" />, color: "text-blue-600 dark:text-blue-300", section: "scheduled" as WorkspaceSection },
              { label: "Expired", value: stats.expired, icon: <XCircle className="h-4 w-4" />, color: "text-slate-500 dark:text-slate-300", section: "expired" as WorkspaceSection },
              { label: "Rejected", value: stats.rejected, icon: <XCircle className="h-4 w-4" />, color: "text-red-600 dark:text-red-300", section: "rejected" as WorkspaceSection },
            ].map(({ label, value, icon, color, section }) => (
              <button
                key={label}
                onClick={() => setWorkspaceSection(section)}
                className={`rounded-xl border border-border/60 bg-muted/20 p-3 text-left transition-all hover:bg-muted/40 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 ${workspaceSection === section ? "ring-2 ring-primary/30 bg-primary/5 dark:ring-white/30 dark:bg-white/10" : ""}`}
              >
                <div className={`flex items-center gap-1.5 ${color} mb-1.5`}>{icon}<span className="text-xs font-medium">{label}</span></div>
                <p className="text-2xl font-bold text-foreground dark:text-white">{value}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Approval Workflow Banner ───────────────────────── */}
        <Card className="border-sky-200/60 dark:border-sky-700/40 bg-sky-50 dark:bg-sky-900/10">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-sky-800 dark:text-sky-300">
              <span className="font-semibold">Seller Promotion Flow:</span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="border-amber-400 text-amber-700 dark:text-amber-300 text-xs">Pending Payment</Badge>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="outline" className="border-sky-400 text-sky-700 dark:text-sky-300 text-xs">Payment Confirmed (Processing)</Badge>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <Badge variant="outline" className="border-emerald-400 text-emerald-700 dark:text-emerald-300 text-xs">Approved & Live</Badge>
              </span>
              <span className="text-muted-foreground text-xs">— Sellers pay, you approve before anything goes live.</span>
            </div>
          </CardContent>
        </Card>

        {/* ── Operations Workspace ───────────────────────────── */}
        <Card className="border-border/70">
          <CardHeader className="pb-4 border-b">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <TrendingUp className="h-5 w-5" />
                  Operations Workspace
                </CardTitle>
                <CardDescription className="mt-0.5">
                  {workspaceSection === "processing"
                    ? "Paid promotions awaiting superadmin approval to go live."
                    : workspaceSection === "pending_payment"
                    ? "Seller requests that still need payment to proceed."
                    : workspaceSection === "rejected"
                    ? "Closed requests that were rejected."
                    : workspaceSection === "active"
                    ? "Promotions currently running on the storefront."
                    : workspaceSection === "scheduled"
                    ? "Promotions queued to start in the future."
                    : "Historical campaigns ready for cleanup."}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => { refetch(); refetchApplications(); }}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>

            {/* Section tabs */}
            <div className="flex flex-wrap gap-2 mt-4">
              {([
                { id: "processing" as WorkspaceSection, label: "Processing", count: stats.processing, icon: <BadgeCheck className="h-3.5 w-3.5" />, urgent: stats.processing > 0 },
                { id: "pending_payment" as WorkspaceSection, label: "Pending Payment", count: stats.pendingPayment, icon: <Clock className="h-3.5 w-3.5" />, urgent: false },
                { id: "active" as WorkspaceSection, label: "Active", count: stats.active, icon: <Activity className="h-3.5 w-3.5" />, urgent: false },
                { id: "scheduled" as WorkspaceSection, label: "Scheduled", count: stats.scheduled, icon: <CalendarDays className="h-3.5 w-3.5" />, urgent: false },
                { id: "expired" as WorkspaceSection, label: "Expired", count: stats.expired, icon: <XCircle className="h-3.5 w-3.5" />, urgent: false },
                { id: "rejected" as WorkspaceSection, label: "Rejected", count: stats.rejected, icon: <XCircle className="h-3.5 w-3.5" />, urgent: false },
              ]).map(({ id, label, count, icon, urgent }) => (
                <button
                  key={id}
                  onClick={() => setWorkspaceSection(id as WorkspaceSection)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all border ${
                    workspaceSection === id
                      ? urgent
                        ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                        : "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background text-muted-foreground border-border hover:bg-muted"
                  }`}
                >
                  {icon}
                  {label}
                  {count > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                      workspaceSection === id ? "bg-white/20 text-white" : urgent ? "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300" : "bg-muted text-muted-foreground"
                    }`}>{count}</span>
                  )}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {sectionItems.length === 0 ? (
              <div className="py-16 text-center">
                <Megaphone className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground font-medium">
                  {workspaceSection === "processing" ? "No promotions awaiting approval." :
                   workspaceSection === "pending_payment" ? "No requests awaiting payment." :
                   workspaceSection === "rejected" ? "No rejected requests." :
                   workspaceSection === "active" ? "No active promotions running." :
                   workspaceSection === "scheduled" ? "No scheduled promotions." :
                   "No expired promotions."}
                </p>
              </div>
            ) : isApplicationSection ? (
              /* Applications (processing / pending_payment / rejected) */
              <div className="grid gap-4 lg:grid-cols-2">
                {(sectionItems as PromotionApplicationRow[]).map((app) => (
                  <div key={app.id} className={`rounded-2xl border p-5 transition-shadow hover:shadow-md ${
                    app.status === "payment_confirmed"
                      ? "border-sky-200 dark:border-sky-700/40 bg-sky-50/50 dark:bg-sky-900/10"
                      : app.status === "rejected"
                      ? "border-red-200/60 dark:border-red-700/30 bg-red-50/30 dark:bg-red-900/10"
                      : "border-border bg-background"
                  }`}>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{app.type === "store" ? "Store" : "Product"}</Badge>
                        {app.status === "payment_confirmed" && (
                          <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300 border-0 text-xs gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Payment Confirmed
                          </Badge>
                        )}
                        {app.status === "pending_payment" && (
                          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-0 text-xs gap-1">
                            <Clock className="h-3 w-3" /> Pending Payment
                          </Badge>
                        )}
                        {app.status === "rejected" && (
                          <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0 text-xs gap-1">
                            <XCircle className="h-3 w-3" /> Rejected
                          </Badge>
                        )}
                      </div>
                      <p className="text-lg font-bold text-foreground shrink-0">GHS {app.totalPrice}</p>
                    </div>

                    <h3 className="text-base font-semibold text-foreground mb-1">{app.targetName}</h3>
                    <div className="space-y-1 text-sm text-muted-foreground">
                      <p><span className="font-medium text-foreground">Seller:</span> {app.seller?.name || app.seller?.email || "Unknown"}</p>
                      {app.seller?.phone && <p><span className="font-medium text-foreground">Phone:</span> {app.seller.phone}</p>}
                      <p><span className="font-medium text-foreground">Package:</span> {formatDurationLabel(app.durationType, app.duration)} at GHS {app.unitPrice}/{app.durationType}</p>
                      {app.status === "payment_confirmed" && isSuperAdmin ? (
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">Placement:</span>
                          <Select
                            value={approvalSections[app.id] ?? (app.displaySection as string | null) ?? "homepage"}
                            onValueChange={(v) => setApprovalSections((prev) => ({ ...prev, [app.id]: v as "homepage" | "banner" }))}
                          >
                            <SelectTrigger className="h-7 w-48 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="homepage">Featured Section</SelectItem>
                              <SelectItem value="banner">Spotlight Banner</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : app.displaySection ? (
                        <p><span className="font-medium text-foreground">Placement:</span> {app.displaySection === "banner" ? "Spotlight Banner" : "Featured Section"}</p>
                      ) : null}
                      <p><span className="font-medium text-foreground">Submitted:</span> {formatDate(app.createdAt)}</p>
                      {app.paymentConfirmedAt && (
                        <p><span className="font-medium text-foreground">Paid at:</span> {formatDate(app.paymentConfirmedAt)}</p>
                      )}
                    </div>

                    {app.sellerNote && (
                      <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                        <span className="font-medium text-foreground">Seller note:</span> {app.sellerNote}
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {app.status === "pending_payment" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => confirmPromotionPayment.mutate(app.id)}
                          disabled={confirmPromotionPayment.isPending}
                          className="gap-1.5"
                        >
                          {confirmPromotionPayment.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Confirm Payment
                        </Button>
                      )}
                      {app.status === "payment_confirmed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewApp(app)}
                          className="gap-1.5"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Preview Placement
                        </Button>
                      )}
                      {app.status === "payment_confirmed" && isSuperAdmin && (
                        <Button
                          size="sm"
                          onClick={() => handleApproveClick(app)}
                          disabled={approvePromotionApplication.isPending}
                          className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                        >
                          {approvePromotionApplication.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (approvalSections[app.id] ?? app.displaySection) === "banner" ? (
                            <Paintbrush className="h-3.5 w-3.5" />
                          ) : (
                            <Rocket className="h-3.5 w-3.5" />
                          )}
                          {(approvalSections[app.id] ?? app.displaySection) === "banner" ? "Design & Activate" : "Approve & Activate"}
                        </Button>
                      )}
                      {app.status === "payment_confirmed" && !isSuperAdmin && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3.5 w-3.5" /> Awaiting superadmin approval
                        </p>
                      )}
                      {app.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectPromotionApplication.mutate(app.id)}
                          disabled={rejectPromotionApplication.isPending}
                          className="gap-1.5 text-destructive hover:text-destructive"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Promotional ads (active / scheduled / expired) */
              <div className="grid gap-4 lg:grid-cols-2">
                {sectionItems.map((promo: any) => {
                  const status = getPromotionStatus(promo);
                  const targetName = promo.type === "product"
                    ? (promo.product?.name || promo.targetId.slice(0, 8))
                    : (promo.store?.name || promo.targetId.slice(0, 8));
                  return (
                    <div key={promo.id} className="rounded-2xl border border-border/70 bg-background p-5 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-xs">{promo.type === "product" ? "Product" : "Store"}</Badge>
                          <Badge className={
                            status === "active"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border-0 text-xs"
                              : status === "scheduled"
                              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-0 text-xs"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800/40 dark:text-slate-300 border-0 text-xs"
                          }>
                            {status === "active" ? "Active" : status === "scheduled" ? "Scheduled" : "Expired"}
                          </Badge>
                        </div>
                        {status !== "expired" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="gap-1.5 text-xs shrink-0" disabled={expirePromotion.isPending}>
                                <Trash2 className="h-3.5 w-3.5" /> End
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>End this promotion?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This closes the campaign immediately. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => expirePromotion.mutate(promo.id)} disabled={expirePromotion.isPending}>
                                  {expirePromotion.isPending ? "Ending…" : "End Promotion"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-foreground">{promo.title || targetName}</h3>
                      {promo.title && <p className="text-sm text-muted-foreground">Target: {targetName}</p>}
                      {promo.description && <p className="text-sm text-muted-foreground mt-1">{promo.description}</p>}
                      {promo.displaySection === "banner" && (
                        <p className="text-xs text-sky-600 dark:text-sky-400 font-medium mt-1">Spotlight Banner</p>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">Start</p>
                          <p className="text-sm font-medium mt-0.5">{formatDate(promo.startAt)}</p>
                        </div>
                        <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2">
                          <p className="text-xs text-muted-foreground uppercase tracking-wide">End</p>
                          <p className="text-sm font-medium mt-0.5">{promo.endAt ? formatDate(promo.endAt) : "—"}</p>
                        </div>
                      </div>
                      {isSuperAdmin && promo.displaySection === "banner" && status !== "expired" && (
                        <div className="mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs"
                            onClick={() => handleEditBannerDesign(promo)}
                          >
                            <Paintbrush className="h-3.5 w-3.5" />
                            Edit Banner Design
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Promotion Pricing ──────────────────────────────── */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Promotion Pricing
            </CardTitle>
            <CardDescription>
              Configure what sellers pay for each promotion duration. Prices apply immediately to new applications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Type</label>
                <Select value={pricingType} onValueChange={(v) => setPricingType(v as PromotionKind)} disabled={!!editingPricingId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Store</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Duration Unit</label>
                <Select value={pricingDurationType} onValueChange={(v) => setPricingDurationType(v as DurationUnit)} disabled={!!editingPricingId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Per Hour</SelectItem>
                    <SelectItem value="day">Per Day</SelectItem>
                    <SelectItem value="week">Per Week</SelectItem>
                    <SelectItem value="month">Per Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Duration</label>
                <Input type="number" min={1} value={pricingDuration} disabled={!!editingPricingId}
                  onChange={(e) => setPricingDuration(Math.max(1, Number(e.target.value) || 1))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Price (GHS)</label>
                <Input value={pricingAmount} onChange={(e) => setPricingAmount(e.target.value)} placeholder="e.g. 10.00" />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              {editingPricingId && (
                <Button variant="outline" onClick={() => { setEditingPricingId(null); setPricingAmount(""); }}>Cancel</Button>
              )}
              <Button
                onClick={() => {
                  if (editingPricingId) { updatePricing.mutate({ id: editingPricingId, price: pricingAmount }); return; }
                  createPricing.mutate({ type: pricingType, durationType: pricingDurationType, duration: pricingDuration, price: pricingAmount });
                }}
                disabled={!pricingAmount.trim() || createPricing.isPending || updatePricing.isPending}
              >
                {createPricing.isPending || updatePricing.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : editingPricingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingPricingId ? "Update Pricing" : "Save Pricing"}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Type</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotionPricing.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="capitalize">{row.type}</TableCell>
                      <TableCell>Per {row.durationType.charAt(0).toUpperCase() + row.durationType.slice(1)}</TableCell>
                      <TableCell>{row.duration}</TableCell>
                      <TableCell className="font-medium">GHS {row.price}</TableCell>
                      <TableCell>
                        <Badge variant={row.isActive ? "default" : "secondary"} className="text-xs">
                          {row.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => {
                            setEditingPricingId(row.id);
                            setPricingType(row.type);
                            setPricingDurationType(row.durationType);
                            setPricingDuration(Number(row.duration) || 1);
                            setPricingAmount(String(row.price || ""));
                          }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => updatePricing.mutate({ id: row.id, isActive: !row.isActive })} disabled={updatePricing.isPending}>
                            {row.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => deletePricing.mutate(row.id)} disabled={deletePricing.isPending}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {promotionPricing.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No promotion pricing configured yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* ── Create Promotion (Admin-direct) ───────────────── */}
        <Card className="border-border/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Create Promotion Directly
            </CardTitle>
            <CardDescription>
              Manually launch a campaign for any store or product without going through the seller payment flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex gap-3 max-w-md">
              <Button variant={type === "store" ? "default" : "outline"} onClick={() => { setType("store"); setProductIds([]); }} className="flex-1 justify-start">
                <Store className="mr-2 h-4 w-4" /> Store Promotion
              </Button>
              <Button variant={type === "product" ? "default" : "outline"} onClick={() => { setType("product"); setStoreId(null); }} className="flex-1 justify-start">
                <ShoppingBag className="mr-2 h-4 w-4" /> Product Promotion
              </Button>
            </div>

            {type === "store" ? (
              <div className="space-y-1.5 max-w-md">
                <label className="text-sm font-medium">Select Store *</label>
                <Select value={storeId || ""} onValueChange={(v) => setStoreId(v || null)}>
                  <SelectTrigger><SelectValue placeholder="Choose a store" /></SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4 max-w-2xl">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Select Seller *</label>
                  <Select value={sellerId || ""} onValueChange={(v) => setSellerId(v || null)}>
                    <SelectTrigger><SelectValue placeholder="Choose a seller" /></SelectTrigger>
                    <SelectContent>
                      {sellers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Product(s) *</label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <ProductAutocomplete sellerId={sellerId} value={productId} onChange={(v: any) => setProductId(v)} />
                    </div>
                    <Button size="sm" onClick={async () => {
                      if (!productId) return;
                      try {
                        const r = await fetch(`/api/products/${productId}`);
                        const j = r.ok ? await r.json() : null;
                        setProductLabels((pl) => ({ ...pl, [productId]: j?.name || productId }));
                      } catch { /* ignore */ }
                      setProductIds((prev) => Array.from(new Set([...prev, productId])));
                      setProductId(null);
                    }} disabled={!productId}>Add</Button>
                  </div>
                  {productIds.length > 0 && (
                    <div className="flex flex-wrap gap-2 rounded-xl border border-border/60 bg-background/60 p-3">
                      {productIds.map((pid) => (
                        <Badge key={pid} variant="secondary" className="cursor-pointer">
                          {productLabels[pid] || pid}
                          <button type="button" onClick={() => setProductIds((p) => p.filter((x) => x !== pid))} className="ml-2 text-xs">×</button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 max-w-2xl">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Duration (hours) *</label>
                <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Weekend Spotlight" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short campaign description" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">CTA Text</label>
                <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g., Shop now" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">CTA URL (optional)</label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="Leave empty to auto-link to the store or product" />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-sm font-medium">Placement *</label>
                <Select value={adDisplaySection} onValueChange={(v) => setAdDisplaySection(v as "homepage" | "banner")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homepage">Featured Section (Homepage grid)</SelectItem>
                    <SelectItem value="banner">Spotlight Banner (Top carousel)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {adDisplaySection === "homepage"
                    ? "Appears in the featured items grid on the homepage."
                    : "Full-width banner at the top of the carousel — maximum visibility."}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 p-4 max-w-2xl">
              <div className="flex items-start gap-3 mb-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary"><ImagePlus className="h-5 w-5" /></div>
                <div>
                  <p className="font-medium text-sm">Promotion Image</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Upload campaign artwork, or leave empty to use the store/product image automatically.</p>
                </div>
              </div>
              <label className="flex items-center justify-center w-full px-4 py-5 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary transition-colors bg-background/50">
                <div className="text-center">
                  <Upload className="h-5 w-5 mx-auto mb-1.5 text-muted-foreground" />
                  <span className="text-sm font-medium">{uploading ? "Uploading…" : "Click to upload"}</span>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
                </div>
                <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])} disabled={uploading} className="hidden" />
              </label>
              {imageUrl && (
                <div className="mt-3 relative inline-block">
                  <img src={imageUrl} alt="Promotion" className="h-28 w-auto rounded-xl border shadow-sm" />
                  <button onClick={() => setImageUrl("")} className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs shadow">×</button>
                </div>
              )}
            </div>

            <Button onClick={handleCreate} disabled={createPromotion.isPending} size="lg">
              {createPromotion.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {createPromotion.isPending ? "Creating…" : "Create Promotion"}
            </Button>
          </CardContent>
        </Card>

      </div>

      {/* ── Preview Placement Dialog ─────────────────────── */}
      <Dialog open={!!previewApp} onOpenChange={(open) => { if (!open) setPreviewApp(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Promotion Preview
            </DialogTitle>
            <DialogDescription>
              See exactly how this promotion will appear and where it will be placed in the queue.
            </DialogDescription>
          </DialogHeader>

          {previewApp && (() => {
            const queuePos = getQueuePosition(previewApp);
            const isBanner = previewApp.displaySection === "banner";

            return (
              <div className="space-y-5 mt-2">

                {/* Placement + queue position tiles */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Placement</p>
                    <p className="font-semibold text-foreground">{isBanner ? "Spotlight Banner" : "Featured Section"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{isBanner ? "Full-width banner at top of homepage" : "Product/store card in featured grid"}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${queuePos === 0 ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" : "border-amber-300 bg-amber-50 dark:bg-amber-900/20"}`}>
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Queue Position</p>
                    <p className={`text-3xl font-bold ${queuePos === 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>#{queuePos}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{queuePos === 0 ? "First in this slot — goes live immediately" : `After ${queuePos} active promotion${queuePos > 1 ? "s" : ""}`}</p>
                  </div>
                </div>

                <Separator />

                {/* Visual mockup */}
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Visual Mockup
                  </p>
                  {isBanner ? (
                    <div className="rounded-xl overflow-hidden border border-border/60">
                      <div className="bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 p-6 text-white relative">
                        <div className="absolute top-3 right-3">
                          <Badge className="bg-white/20 text-white text-xs border-0">Sponsored</Badge>
                        </div>
                        <p className="text-xs uppercase tracking-widest opacity-75 mb-1">Featured Promotion</p>
                        <h3 className="text-xl font-bold mb-1">{previewApp.targetName}</h3>
                        {previewApp.seller?.name && (
                          <p className="text-sm opacity-80">by {previewApp.storeName || previewApp.seller.name}</p>
                        )}
                        {previewApp.sellerNote && (
                          <p className="text-sm mt-2 opacity-80 italic">"{previewApp.sellerNote}"</p>
                        )}
                        <div className="mt-4">
                          <span className="inline-flex items-center gap-1.5 bg-white text-emerald-700 font-semibold rounded-full px-4 py-1.5 text-sm">
                            Shop now <ArrowRight className="h-3.5 w-3.5" />
                          </span>
                        </div>
                        <div className="absolute bottom-2 right-4 text-xs text-white/50">Position #{queuePos} in banner queue</div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-muted/30 rounded-xl p-4 border border-border/60">
                      <p className="text-xs text-muted-foreground mb-3">Featured grid — homepage (position #{queuePos}):</p>
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {Array.from({ length: Math.min(queuePos, 3) }).map((_, i) => (
                          <div key={i} className="shrink-0 w-[140px] h-[170px] rounded-xl border-2 border-dashed border-border/50 bg-background/60 flex items-center justify-center">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-muted-foreground/30">#{i}</p>
                              <p className="text-xs text-muted-foreground/30">Active</p>
                            </div>
                          </div>
                        ))}
                        {/* This promotion's card */}
                        <div className="shrink-0 w-[140px] rounded-xl border-2 border-primary bg-background shadow-lg shadow-primary/10 relative overflow-hidden">
                          <div className="h-[90px] bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                            <div className="text-4xl">{previewApp.type === "store" ? "🏪" : "📦"}</div>
                          </div>
                          <div className="p-2.5">
                            <div className="flex items-center gap-1 mb-1">
                              <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-0">Featured</Badge>
                              <span className="text-[10px] text-muted-foreground ml-auto">#{queuePos}</span>
                            </div>
                            <p className="text-xs font-semibold text-foreground truncate">{previewApp.targetName}</p>
                            {previewApp.seller?.name && (
                              <p className="text-[10px] text-muted-foreground truncate">{previewApp.storeName || previewApp.seller.name}</p>
                            )}
                          </div>
                          <div className="absolute top-2 left-2 w-2 h-2 bg-primary rounded-full animate-pulse" />
                        </div>
                        {queuePos > 3 && (
                          <div className="shrink-0 flex items-center text-muted-foreground text-sm pl-2">+{queuePos - 3} more</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <Separator />

                {/* Details grid */}
                <div>
                  <p className="text-sm font-semibold text-foreground mb-3">Application Details</p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Seller</p>
                      <p className="font-medium text-foreground mt-0.5">{previewApp.seller?.name || previewApp.seller?.email || "Unknown"}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Package</p>
                      <p className="font-medium text-foreground mt-0.5">{formatDurationLabel(previewApp.durationType, previewApp.duration)}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Amount Paid</p>
                      <p className="font-medium text-foreground mt-0.5">GHS {previewApp.totalPrice}</p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Target</p>
                      <p className="font-medium text-foreground mt-0.5 truncate">{previewApp.targetName}</p>
                    </div>
                    {previewApp.seller?.phone && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Seller Phone</p>
                        <p className="font-medium text-foreground mt-0.5">{previewApp.seller.phone}</p>
                      </div>
                    )}
                    {previewApp.paymentConfirmedAt && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                        <p className="text-xs text-muted-foreground">Paid At</p>
                        <p className="font-medium text-foreground mt-0.5">{formatDate(previewApp.paymentConfirmedAt)}</p>
                      </div>
                    )}
                  </div>
                  {previewApp.sellerNote && (
                    <div className="mt-3 rounded-lg border border-border/60 bg-muted/40 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Seller Note</p>
                      <p className="text-sm text-foreground mt-0.5">"{previewApp.sellerNote}"</p>
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 justify-end pt-2 border-t border-border/60">
                  <Button variant="outline" onClick={() => setPreviewApp(null)}>Close Preview</Button>
                  {isSuperAdmin && (
                    <Button
                      onClick={() => {
                        if (previewApp.displaySection === "banner") {
                          setBannerEditorApp(previewApp);
                          setBannerEditorOpen(true);
                          setPreviewApp(null);
                        } else {
                          approvePromotionApplication.mutate({ id: previewApp.id });
                        }
                      }}
                      disabled={approvePromotionApplication.isPending}
                      className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white border-0"
                    >
                      {approvePromotionApplication.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : previewApp.displaySection === "banner" ? (
                        <Paintbrush className="h-4 w-4" />
                      ) : (
                        <Rocket className="h-4 w-4" />
                      )}
                      {previewApp.displaySection === "banner" ? "Design & Activate" : "Approve & Activate"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Banner Designer — approve flow */}
      <BannerEditor
        open={bannerEditorOpen}
        onOpenChange={(open) => {
          setBannerEditorOpen(open);
          if (!open) setBannerEditorApp(null);
        }}
        targetName={bannerEditorApp?.targetName || ""}
        onSave={handleBannerEditorSave}
        isSaving={approvePromotionApplication.isPending}
        saveLabel="Save Design & Activate"
      />

      {/* Banner Designer — edit live banner */}
      <BannerEditor
        open={!!editingBannerPromoId}
        onOpenChange={(open) => {
          if (!open) {
            setEditingBannerPromoId(null);
            setEditingBannerConfig(null);
          }
        }}
        targetName={
          editingBannerPromoId
            ? (sectionItems as any[]).find((p: any) => p.id === editingBannerPromoId)?.store?.name ||
              (sectionItems as any[]).find((p: any) => p.id === editingBannerPromoId)?.product?.name ||
              "Banner"
            : ""
        }
        initialConfig={editingBannerConfig}
        onSave={(config) => {
          if (editingBannerPromoId) {
            updateBannerConfig.mutate({ id: editingBannerPromoId, bannerConfig: config });
          }
        }}
        isSaving={updateBannerConfig.isPending}
        saveLabel="Update Banner Design"
      />

    </DashboardLayout>
  );
}
