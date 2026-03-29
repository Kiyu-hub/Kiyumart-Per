import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import ProductAutocomplete from "@/components/ProductAutocomplete";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Activity,
  CalendarDays,
  Clock,
  CheckCircle2,
  Pencil,
  Filter,
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
} from "lucide-react";

type PromotionKind = "store" | "product";
type StatusFilter = "all" | "active" | "scheduled" | "expired";
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
  seller?: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

type WorkspaceTab = "requests" | "active_promotions" | "scheduled" | "expired";
type RequestStatusFilter = "all" | "pending_payment" | "payment_confirmed" | "rejected";

const formatDurationUnitLabel = (unit: DurationUnit) => {
  switch (unit) {
    case "hour":
      return "Per Hour";
    case "day":
      return "Per Day";
    case "week":
      return "Per Week";
    case "month":
      return "Per Month";
    default:
      return unit;
  }
};

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
    refetchInterval: 3000,
  });

  const { data: promotionPricing = [], refetch: refetchPricing } = useQuery<PromotionPricingRow[]>({
    queryKey: ["/api/admin/promotion-pricing"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promotion-pricing", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load promotion pricing");
      }
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 15000,
  });

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pricingType, setPricingType] = useState<PromotionKind>("product");
  const [pricingDurationType, setPricingDurationType] = useState<DurationUnit>("hour");
  const [pricingDuration, setPricingDuration] = useState<number>(1);
  const [pricingAmount, setPricingAmount] = useState<string>("");
  const [editingPricingId, setEditingPricingId] = useState<number | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>("requests");
  const [requestStatusFilter, setRequestStatusFilter] = useState<RequestStatusFilter>("all");

  const {
    data: promotionApplications = [],
    refetch: refetchApplications,
    isRefetching: isRefetchingApplications,
  } = useQuery<PromotionApplicationRow[]>({
    queryKey: ["/api/admin/promotion-applications"],
    queryFn: async () => {
      const res = await fetch("/api/admin/promotion-applications", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load promotion applications");
      }
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    refetchInterval: 5000,
  });

  const createPromotion = useMutation({
    mutationFn: async (payload: any) => {
      const res = await apiRequest("POST", "/api/admin/promotions", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      toast({ title: "Created", description: "Promotional ad created" });
    },
    onError: (e: any) => {
      toast({
        title: "Create failed",
        description: e.message || String(e),
        variant: "destructive",
      });
    },
  });

  const expirePromotion = useMutation({
    mutationFn: async (promoId: string) => {
      const res = await apiRequest("PATCH", `/api/admin/promotions/${promoId}/expire`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      await refetch();
      toast({ title: "Ended", description: "Promotion has been ended successfully" });
    },
    onError: (e: any) => {
      toast({
        title: "Error",
        description: e.message || String(e),
        variant: "destructive",
      });
    },
  });

  const resetExpiredPromotions = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/promotions/reset-expired", {});
      return res.json();
    },
    onSuccess: async (result: any) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      await refetch();
      toast({
        title: "Expired promotions cleared",
        description: `${result?.deletedCount ?? 0} expired promotion(s) removed.`,
      });
    },
    onError: (e: any) => {
      toast({
        title: "Reset failed",
        description: e.message || String(e),
        variant: "destructive",
      });
    },
  });

  const confirmPromotionPayment = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/promotion-applications/${id}/confirm-payment`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      await refetchApplications();
      await refetch();
      toast({ title: "Payment confirmed", description: "The request is now ready for final approval." });
    },
    onError: (e: any) => {
      toast({ title: "Action failed", description: e.message || String(e), variant: "destructive" });
    },
  });

  const approvePromotionApplication = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/admin/promotion-applications/${id}/approve`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] });
      await refetchApplications();
      await refetch();
      setWorkspaceTab("active_promotions");
      toast({ title: "Promotion activated", description: "The approved request has been moved into active promotions." });
    },
    onError: (e: any) => {
      toast({ title: "Approval failed", description: e.message || String(e), variant: "destructive" });
    },
  });

  const rejectPromotionApplication = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/promotion-applications/${id}/reject`, {});
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      await refetchApplications();
      toast({ title: "Request rejected", description: "The promotion request has been closed." });
    },
    onError: (e: any) => {
      toast({ title: "Reject failed", description: e.message || String(e), variant: "destructive" });
    },
  });

  const createPricing = useMutation({
    mutationFn: async (payload: { type: PromotionKind; durationType: DurationUnit; duration: number; price: string }) => {
      const res = await apiRequest("POST", "/api/admin/promotion-pricing", payload);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-pricing"] });
      await refetchPricing();
      setPricingAmount("");
      setPricingDuration(1);
      toast({ title: "Pricing added", description: "The promotion price has been saved." });
    },
    onError: (e: any) => {
      toast({ title: "Pricing error", description: e.message || String(e), variant: "destructive" });
    },
  });

  const updatePricing = useMutation({
    mutationFn: async ({ id, price, isActive }: { id: number; price?: string; isActive?: boolean }) => {
      const res = await apiRequest("PUT", `/api/admin/promotion-pricing/${id}`, { price, isActive });
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-pricing"] });
      await refetchPricing();
      setEditingPricingId(null);
      setPricingType("product");
      setPricingDurationType("hour");
      setPricingDuration(1);
      setPricingAmount("");
      toast({ title: "Pricing updated", description: "The promotion price has been updated." });
    },
    onError: (e: any) => {
      toast({ title: "Update failed", description: e.message || String(e), variant: "destructive" });
    },
  });

  const deletePricing = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/promotion-pricing/${id}`);
      return res.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-pricing"] });
      await refetchPricing();
      toast({ title: "Pricing removed", description: "The promotion price entry has been deleted." });
    },
    onError: (e: any) => {
      toast({ title: "Delete failed", description: e.message || String(e), variant: "destructive" });
    },
  });

  const startEditingPricing = (row: PromotionPricingRow) => {
    setEditingPricingId(row.id);
    setPricingType(row.type);
    setPricingDurationType(row.durationType);
    setPricingDuration(Number(row.duration) || 1);
    setPricingAmount(String(row.price || ""));
  };

  const resetPricingForm = () => {
    setEditingPricingId(null);
    setPricingType("product");
    setPricingDurationType("hour");
    setPricingDuration(1);
    setPricingAmount("");
  };

  const handleImageUpload = async (file: File) => {
    if (!file) return;

    setImageFile(file);
    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploading(true);
      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (res.ok) {
        const { url } = await res.json();
        setImageUrl(url);
        toast({ title: "Success", description: "Image uploaded successfully" });
      } else {
        const errorData = await res.json().catch(() => ({}));
        toast({
          title: "Upload failed",
          description: errorData.error || "Could not upload image",
          variant: "destructive",
        });
      }
    } catch (e) {
      toast({ title: "Error", description: String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleCreate = async () => {
    let finalCtaUrl = ctaUrl;
    if (!finalCtaUrl) {
      if (type === "store" && storeId) {
        finalCtaUrl = `/sellers/${storeId}`;
      } else if (type === "product" && productIds.length > 0) {
        finalCtaUrl = `/product/${productIds[0]}`;
      }
    }

    let finalImageUrl = imageUrl;
    if (!finalImageUrl) {
      try {
        if (type === "store" && storeId) {
          const storeRes = await fetch(`/api/stores/${storeId}`);
          const store = await storeRes.json();
          finalImageUrl = store?.logo || store?.banner || "";
        } else if (type === "product" && productIds.length > 0) {
          const prodRes = await fetch(`/api/products/${productIds[0]}`);
          const prod = await prodRes.json();
          finalImageUrl = prod?.images?.[0] || "";
        }
      } catch (e) {
        console.error("Failed to get default image:", e);
      }
    }

    const now = new Date();
    const endAt = new Date(now.getTime() + duration * 60 * 60 * 1000);

    const basePayload: any = {
      type,
      startAt: now.toISOString(),
      endAt: endAt.toISOString(),
      title: title || null,
      description: description || null,
      imageUrl: finalImageUrl || null,
      ctaText: ctaText || null,
      ctaUrl: finalCtaUrl || null,
    };

    if (type === "store") {
      if (!storeId) {
        toast({
          title: "Missing store",
          description: "Please select a store to promote",
          variant: "destructive",
        });
        return;
      }
      createPromotion.mutate({ ...basePayload, targetId: storeId });
      return;
    }

    const selectedIds = productIds.length > 0 ? productIds : productId ? [productId] : [];
    if (selectedIds.length === 0) {
      toast({
        title: "Missing product",
        description: "Please select at least one product",
        variant: "destructive",
      });
      return;
    }

    createPromotion.mutate({ ...basePayload, targetIds: selectedIds });
  };

  const getPromotionStatus = (promo: any): Exclude<StatusFilter, "all"> => {
    if (promo.isActive === false) return "expired";
    const now = new Date();
    if (promo.endAt && new Date(promo.endAt) < now) return "expired";
    if (promo.startAt && new Date(promo.startAt) > now) return "scheduled";
    return "active";
  };

  const activePromotions = useMemo(
    () => allPromotions.filter((promotion: any) => getPromotionStatus(promotion) === "active"),
    [allPromotions],
  );

  const scheduledPromotions = useMemo(
    () => allPromotions.filter((promotion: any) => getPromotionStatus(promotion) === "scheduled"),
    [allPromotions],
  );

  const expiredPromotions = useMemo(
    () => allPromotions.filter((promotion: any) => getPromotionStatus(promotion) === "expired"),
    [allPromotions],
  );

  const requestQueueApplications = useMemo(
    () =>
      promotionApplications.filter((application) =>
        ["pending_payment", "payment_confirmed", "rejected"].includes(String(application.status || "")),
      ),
    [promotionApplications],
  );

  const filteredRequestApplications = useMemo(() => {
    return requestQueueApplications.filter((application) => {
      if (requestStatusFilter === "all") return true;
      return application.status === requestStatusFilter;
    });
  }, [requestQueueApplications, requestStatusFilter]);

  const stats = useMemo(() => {
    return {
      total: allPromotions.length,
      requestQueue: requestQueueApplications.filter((application) => application.status !== "rejected").length,
      pendingPayment: requestQueueApplications.filter((application) => application.status === "pending_payment").length,
      paymentConfirmed: requestQueueApplications.filter((application) => application.status === "payment_confirmed").length,
      rejected: requestQueueApplications.filter((application) => application.status === "rejected").length,
      active: activePromotions.length,
      scheduled: scheduledPromotions.length,
      expired: expiredPromotions.length,
    };
  }, [activePromotions.length, allPromotions.length, expiredPromotions.length, requestQueueApplications, scheduledPromotions.length]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatRequestStatus = (status: PromotionApplicationRow["status"]) => {
    switch (status) {
      case "pending_payment":
        return "Pending Payment";
      case "payment_confirmed":
        return "Payment Confirmed";
      case "rejected":
        return "Rejected";
      case "active":
        return "Active";
      case "expired":
        return "Expired";
      default:
        return status.replace(/_/g, " ");
    }
  };

  const currentWorkspacePromotions = (() => {
    if (workspaceTab === "active_promotions") return activePromotions;
    if (workspaceTab === "scheduled") return scheduledPromotions;
    return expiredPromotions;
  })();

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading promotions" description="Preparing pricing, requests, and live campaign operations." />;
  }

  return (
    <DashboardLayout role={user.role as "admin" | "super_admin"}>
      <div className="space-y-6 p-4 md:p-6 pb-8">
        <Card className="border-border/70 bg-card text-foreground shadow-sm dark:border-emerald-500/30 dark:bg-[linear-gradient(102deg,rgba(6,78,59,0.46)_0%,rgba(2,6,23,0.97)_48%,rgba(8,47,73,0.56)_100%)] dark:text-white">
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-300/40 dark:bg-emerald-500/15 dark:text-emerald-50">
                    <Megaphone className="mr-1 h-3.5 w-3.5" />
                    Promotion Command Center
                  </Badge>
                  <Badge className="border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-300/40 dark:bg-sky-500/15 dark:text-sky-50">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Live updates every 3s
                  </Badge>
                </div>
                <h1 className="mt-3 text-2xl font-semibold md:text-3xl">Promotions</h1>
                <p className="mt-2 max-w-3xl text-sm text-muted-foreground dark:text-white/80">
                  Create time-bound campaigns for stores and products, monitor live placement status, and end campaigns from one polished operations workspace.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-border/70 text-foreground hover:bg-muted dark:border-white/30 dark:text-white dark:hover:bg-white/10"
                  onClick={() => {
                    refetch();
                    refetchApplications();
                  }}
                >
                  {isRefetching || isRefetchingApplications ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Refresh
                </Button>
                {user?.role === "super_admin" && stats.expired > 0 ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-border/70 text-foreground hover:bg-muted dark:border-white/30 dark:text-white dark:hover:bg-white/10"
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Clear Expired
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear expired promotions?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently remove all expired promotions from the registry. Active and scheduled campaigns will stay untouched.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => resetExpiredPromotions.mutate()}
                          disabled={resetExpiredPromotions.isPending}
                        >
                          {resetExpiredPromotions.isPending ? "Clearing..." : "Clear Expired"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Promotion Requests</p><Megaphone className="h-4 w-4 text-emerald-600 dark:text-emerald-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.requestQueue}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/60">New requests waiting for action</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Pending Payment</p><Clock className="h-4 w-4 text-amber-600 dark:text-amber-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.pendingPayment}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/60">Customer service follow-up needed</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Ready To Activate</p><CheckCircle2 className="h-4 w-4 text-sky-600 dark:text-sky-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.paymentConfirmed}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/60">Payment confirmed, awaiting approval</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Active Promotions</p><Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.active}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/60">Currently visible on the storefront</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Scheduled</p><CalendarDays className="h-4 w-4 text-sky-600 dark:text-sky-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.scheduled}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/60">Campaigns queued for later start</p></CardContent></Card>
              <Card className="border-border/70 bg-background dark:border-white/20 dark:bg-white/5"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground dark:text-white/70">Expired</p><XCircle className="h-4 w-4 text-slate-600 dark:text-slate-200" /></div><p className="mt-3 text-2xl font-semibold">{stats.expired}</p><p className="mt-1 text-xs text-muted-foreground dark:text-white/60">Historical campaigns ready for cleanup</p></CardContent></Card>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              Promotion Pricing
            </CardTitle>
            <CardDescription>
              Configure how much sellers are charged for each store or product promotion duration. Seller applications use these prices directly.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Promotion Type</label>
                <Select value={pricingType} onValueChange={(value) => setPricingType(value as PromotionKind)}>
                  <SelectTrigger disabled={editingPricingId !== null}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="store">Store</SelectItem>
                    <SelectItem value="product">Product</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration Unit</label>
                <Select value={pricingDurationType} onValueChange={(value) => setPricingDurationType(value as DurationUnit)}>
                  <SelectTrigger disabled={editingPricingId !== null}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hour">Per Hour</SelectItem>
                    <SelectItem value="day">Per Day</SelectItem>
                    <SelectItem value="week">Per Week</SelectItem>
                    <SelectItem value="month">Per Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration</label>
                <Input
                  type="number"
                  min={1}
                  value={pricingDuration}
                  disabled={editingPricingId !== null}
                  onChange={(e) => setPricingDuration(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price (GHS)</label>
                <Input
                  value={pricingAmount}
                  onChange={(e) => setPricingAmount(e.target.value)}
                  placeholder="e.g. 10.00"
                />
              </div>
            </div>

            {editingPricingId ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
                Editing pricing for the selected type, unit, and duration. Price updates will apply to this existing pricing row.
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              {editingPricingId ? (
                <Button variant="outline" onClick={resetPricingForm}>
                  Cancel Edit
                </Button>
              ) : null}
              <Button
                onClick={() => {
                  if (editingPricingId) {
                    updatePricing.mutate({
                      id: editingPricingId,
                      price: pricingAmount,
                    });
                    return;
                  }
                  createPricing.mutate({
                    type: pricingType,
                    durationType: pricingDurationType,
                    duration: pricingDuration,
                    price: pricingAmount,
                  });
                }}
                disabled={!pricingAmount.trim() || createPricing.isPending || updatePricing.isPending}
              >
                {createPricing.isPending || updatePricing.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : editingPricingId ? <Pencil className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editingPricingId ? "Update Pricing" : "Save Pricing"}
              </Button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-border/70">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Type</TableHead>
                    <TableHead>Unit</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {promotionPricing.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>{row.type === "store" ? "Store" : "Product"}</TableCell>
                      <TableCell>{formatDurationUnitLabel(row.durationType)}</TableCell>
                      <TableCell>{row.duration}</TableCell>
                      <TableCell>GHS {row.price}</TableCell>
                      <TableCell>
                        <Badge variant={row.isActive ? "default" : "secondary"}>{row.isActive ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => startEditingPricing(row)}
                            disabled={updatePricing.isPending || deletePricing.isPending}
                          >
                            <Pencil className="mr-2 h-4 w-4" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => updatePricing.mutate({ id: row.id, isActive: !row.isActive })}
                            disabled={updatePricing.isPending}
                          >
                            {row.isActive ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => deletePricing.mutate(row.id)}
                            disabled={deletePricing.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {promotionPricing.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        No promotion pricing configured yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5" />
              Create Promotion
            </CardTitle>
            <CardDescription>
              Configure a store or product campaign, set duration, and optionally override the destination or campaign artwork.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:max-w-md md:grid-cols-2">
              <Button
                variant={type === "store" ? "default" : "outline"}
                onClick={() => {
                  setType("store");
                  setSellerId(null);
                  setProductId(null);
                  setProductIds([]);
                }}
                className="justify-start"
              >
                <Store className="mr-2 h-4 w-4" />
                Store Promotion
              </Button>
              <Button
                variant={type === "product" ? "default" : "outline"}
                onClick={() => {
                  setType("product");
                  setStoreId(null);
                }}
                className="justify-start"
              >
                <ShoppingBag className="mr-2 h-4 w-4" />
                Product Promotion
              </Button>
            </div>

            {type === "store" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Select Store *</label>
                <Select value={storeId || ""} onValueChange={(v) => setStoreId(v || null)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a store" />
                  </SelectTrigger>
                  <SelectContent>
                    {stores.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Select Seller *</label>
                  <Select value={sellerId || ""} onValueChange={(v) => setSellerId(v || null)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a seller" />
                    </SelectTrigger>
                    <SelectContent>
                      {sellers.map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Product(s) *</label>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1 text-foreground">
                      <ProductAutocomplete sellerId={sellerId} value={productId} onChange={(v: any) => setProductId(v)} />
                    </div>
                    <Button
                      onClick={async () => {
                        if (!productId) return;
                        try {
                          const res = await fetch(`/api/products/${productId}`);
                          const json = res.ok ? await res.json() : null;
                          const name = json?.name || productId;
                          setProductLabels((pl) => ({ ...pl, [productId]: name }));
                          setProductIds((prev) => Array.from(new Set([...prev, productId])));
                          setProductId(null);
                        } catch (e) {
                          setProductIds((prev) => Array.from(new Set([...prev, productId])));
                          setProductId(null);
                        }
                      }}
                      disabled={!productId}
                      size="sm"
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Add multiple products and the system will create one promotion entry per product.</p>
                </div>

                {productIds.length > 0 && (
                  <div className="flex flex-wrap gap-2 rounded-xl border border-border/70 bg-background/60 p-3">
                    {productIds.map((pid) => (
                      <Badge key={pid} variant="secondary" className="cursor-pointer hover:opacity-80">
                        <span>{productLabels[pid] || pid}</span>
                        <button
                          type="button"
                          onClick={() => {
                            setProductIds((prev) => prev.filter((x) => x !== pid));
                            setProductLabels((pl) => {
                              const copy = { ...pl };
                              delete copy[pid];
                              return copy;
                            });
                          }}
                          className="ml-2 text-xs"
                        >
                          x
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">Duration (hours) *</label>
                <Input type="number" min={1} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="text-foreground" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Weekend Spotlight" className="text-foreground" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Description</label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short campaign description" className="text-foreground" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">CTA Text</label>
                <Input value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="e.g., Shop now" className="text-foreground" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">CTA URL (Optional)</label>
                <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="Leave empty to auto-link to the store or product" className="text-foreground" />
              </div>
            </div>

            <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-primary/10 p-2 text-primary">
                  <ImagePlus className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">Promotion Image</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload campaign artwork, or leave it empty to use the default store or product image automatically.
                  </p>
                </div>
              </div>

              <label className="mt-4 flex items-center justify-center w-full px-4 py-6 border-2 border-dashed rounded-xl cursor-pointer hover:border-primary transition-colors bg-background/50">
                <div className="text-center">
                  <Upload className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
                  <span className="text-sm font-medium">{uploading ? "Uploading image..." : "Click to upload or drag and drop"}</span>
                  <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 5MB</p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleImageUpload(e.target.files[0])}
                  disabled={uploading}
                  className="hidden"
                />
              </label>

              {imageUrl && (
                <div className="mt-4 relative inline-block">
                  <img src={imageUrl} alt="Promotion" className="h-32 w-auto rounded-xl border shadow-sm" />
                  <button
                    onClick={() => {
                      setImageUrl("");
                      setImageFile(null);
                    }}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 shadow-sm"
                    type="button"
                  >
                    x
                  </button>
                </div>
              )}
            </div>

            <Button onClick={handleCreate} disabled={createPromotion.isPending} className="w-full md:w-auto" size="lg">
              {createPromotion.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating promotion...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Promotion
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Filter className="h-5 w-5" />
                  Promotion Operations
                </CardTitle>
                <CardDescription>
                  Handle new requests separately from live campaigns so the request queue resets once all incoming requests are cleared.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => { refetch(); refetchApplications(); }}>
                {(isRefetching || isRefetchingApplications) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Refresh Workspace
              </Button>
            </div>

            <Tabs value={workspaceTab} onValueChange={(v) => setWorkspaceTab(v as WorkspaceTab)}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="requests">Promotion Requests ({stats.requestQueue})</TabsTrigger>
                <TabsTrigger value="active_promotions">Active Promotions ({stats.active})</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled ({stats.scheduled})</TabsTrigger>
                <TabsTrigger value="expired">Expired ({stats.expired})</TabsTrigger>
              </TabsList>
            </Tabs>

            {workspaceTab === "requests" && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-muted-foreground">Request Status</label>
                <Tabs value={requestStatusFilter} onValueChange={(v) => setRequestStatusFilter(v as RequestStatusFilter)}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending_payment">Pending ({stats.pendingPayment})</TabsTrigger>
                    <TabsTrigger value="payment_confirmed">Confirmed ({stats.paymentConfirmed})</TabsTrigger>
                    <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            )}
          </CardHeader>
          <CardContent>
            {workspaceTab === "requests" ? (
              filteredRequestApplications.length === 0 ? (
                <div className="text-center py-12">
                  <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">
                    {stats.requestQueue === 0 ? "No new promotion requests are waiting for action." : "No requests match the selected request filter."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-4 xl:grid-cols-2">
                  {filteredRequestApplications.map((application) => (
                    <div key={application.id} className="rounded-2xl border border-border/70 bg-background p-5 shadow-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{application.type === "store" ? "Store" : "Product"}</Badge>
                            <Badge variant={application.status === "payment_confirmed" ? "default" : "secondary"}>
                              {formatRequestStatus(application.status)}
                            </Badge>
                          </div>
                          <h3 className="text-lg font-semibold">{application.targetName}</h3>
                          <p className="text-sm text-muted-foreground">Seller: {application.seller?.name || application.seller?.email || "Unknown seller"}</p>
                          <p className="text-sm text-muted-foreground">
                            Package: {application.duration} {formatDurationUnitLabel(application.durationType).replace("Per ", "").toLowerCase()}{application.duration === 1 ? "" : "s"} at GHS {application.unitPrice}
                          </p>
                          <p className="text-sm text-muted-foreground">Quoted total: GHS {application.totalPrice}</p>
                          <p className="text-sm text-muted-foreground">Submitted: {formatDate(application.createdAt)}</p>
                          {application.seller?.phone ? <p className="text-sm text-muted-foreground">Seller phone: {application.seller.phone}</p> : null}
                          {application.sellerNote ? <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Seller note: {application.sellerNote}</p> : null}
                          {application.customerServiceNote ? <p className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Service note: {application.customerServiceNote}</p> : null}
                        </div>

                        <div className="flex flex-wrap gap-2 md:max-w-[220px] md:justify-end">
                          {application.status === "pending_payment" ? (
                            <Button size="sm" onClick={() => confirmPromotionPayment.mutate(application.id)} disabled={confirmPromotionPayment.isPending}>
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Confirm Payment
                            </Button>
                          ) : null}
                          {application.status === "payment_confirmed" && user?.role === "super_admin" ? (
                            <Button size="sm" onClick={() => approvePromotionApplication.mutate(application.id)} disabled={approvePromotionApplication.isPending}>
                              <Sparkles className="mr-2 h-4 w-4" />
                              Approve & Activate
                            </Button>
                          ) : null}
                          {application.status !== "rejected" ? (
                            <Button variant="outline" size="sm" onClick={() => rejectPromotionApplication.mutate(application.id)} disabled={rejectPromotionApplication.isPending}>
                              <XCircle className="mr-2 h-4 w-4" />
                              Reject
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )
            ) : currentWorkspacePromotions.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground">
                  {workspaceTab === "active_promotions"
                    ? "No active promotions are running right now."
                    : workspaceTab === "scheduled"
                      ? "No scheduled promotions are waiting to start."
                      : "No expired promotions found."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {currentWorkspacePromotions.map((promotion: any) => {
                  const status = getPromotionStatus(promotion);
                  const targetName =
                    promotion.type === "product"
                      ? promotion.product?.name || promotion.targetId.slice(0, 8)
                      : promotion.store?.name || promotion.targetId.slice(0, 8);

                  return (
                    <div key={promotion.id} className="rounded-2xl border border-border/70 bg-background p-5 shadow-sm">
                      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">{promotion.type === "product" ? "Product" : "Store"}</Badge>
                            <Badge
                              className={
                                status === "active"
                                  ? "border-emerald-400/30 bg-emerald-500/15 text-emerald-700 dark:text-emerald-200"
                                  : status === "scheduled"
                                    ? "border-sky-400/30 bg-sky-500/15 text-sky-700 dark:text-sky-200"
                                    : "border-slate-300/30 bg-slate-500/10 text-slate-600 dark:text-slate-200"
                              }
                            >
                              {status === "active" ? "Active" : status === "scheduled" ? "Scheduled" : "Expired"}
                            </Badge>
                          </div>
                          <h3 className="text-lg font-semibold">{promotion.title || targetName}</h3>
                          <p className="text-sm text-muted-foreground">Target: {targetName}</p>
                          {promotion.description ? <p className="text-sm text-muted-foreground">{promotion.description}</p> : null}
                          <div className="grid gap-2 pt-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Start</p>
                              <p className="mt-1 text-sm font-medium">{formatDate(promotion.startAt)}</p>
                            </div>
                            <div className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2">
                              <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">End</p>
                              <p className="mt-1 text-sm font-medium">{promotion.endAt ? formatDate(promotion.endAt) : "-"}</p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2 md:max-w-[180px] md:justify-end">
                          {status !== "expired" ? (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm" disabled={expirePromotion.isPending}>
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  End Promotion
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>End promotion?</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will close the campaign immediately and it cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => expirePromotion.mutate(promotion.id)} disabled={expirePromotion.isPending}>
                                    {expirePromotion.isPending ? "Ending..." : "End Promotion"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
