import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageLoadingState } from "@/components/ui/loading-state";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Loader2, Store, Package, CreditCard, CheckCircle2, Clock,
  XCircle, TrendingUp, Megaphone, RefreshCw, Sparkles, Timer,
  Trash2, Receipt, CalendarCheck,
} from "lucide-react";
import { loadPaystackInlineScript, PaystackInlineService, resetPaystackGuard } from "@/lib/paystackInline";

interface PromotionPricing {
  id: number;
  type: "store" | "product";
  durationType: "hour" | "day" | "week" | "month";
  duration: number;
  price: string;
  isActive: boolean;
}

interface SellerPromotionApplication {
  id: string;
  type: "store" | "product";
  targetId: string;
  targetName: string;
  durationType: "hour" | "day" | "week" | "month";
  duration: number;
  unitPrice: string;
  totalPrice: string;
  sellerNote?: string | null;
  displaySection?: "homepage" | "banner" | null;
  paymentConfirmed: boolean;
  paymentConfirmedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  status: "pending_payment" | "payment_confirmed" | "approved" | "active" | "expired" | "rejected";
  createdAt: string;
}

interface SellerStore { id: string; name: string; }
interface SellerProduct { id: string; name: string; }

interface PaymentReceipt {
  applicationId: string;
  reference: string;
  amountGhs: number;
  targetName: string;
  promotionType: "store" | "product";
  displaySection: string;
  duration: number;
  durationType: string;
  paidAt: Date;
}

const formatMoney = (value: number) =>
  Number.isFinite(value) ? value.toFixed(2) : "0.00";

const formatDurationUnit = (unit: PromotionPricing["durationType"]) =>
  ({ hour: "hour", day: "day", week: "week", month: "month" }[unit] ?? unit);

const STATUS_CONFIG: Record<
  SellerPromotionApplication["status"],
  { label: string; color: string; border: string; icon: React.ReactNode; tab: string }
> = {
  pending_payment: {
    label: "Pending Payment",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    border: "border-l-amber-400",
    icon: <Clock className="h-3.5 w-3.5" />,
    tab: "pending",
  },
  payment_confirmed: {
    label: "Payment Confirmed",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    border: "border-l-blue-400",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    tab: "pending",
  },
  // "approved" means superadmin has approved and the promo is live — show as Active
  approved: {
    label: "Active",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    border: "border-l-green-500",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    tab: "active",
  },
  active: {
    label: "Active",
    color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    border: "border-l-green-500",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
    tab: "active",
  },
  expired: {
    label: "Expired",
    color: "bg-muted text-muted-foreground",
    border: "border-l-muted-foreground/30",
    icon: <Timer className="h-3.5 w-3.5" />,
    tab: "history",
  },
  rejected: {
    label: "Rejected",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
    border: "border-l-red-500",
    icon: <XCircle className="h-3.5 w-3.5" />,
    tab: "history",
  },
};

function timeRemaining(endAt: string): string {
  const diff = new Date(endAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

export default function SellerPromotions() {
  const [location] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [type, setType] = useState<"store" | "product">("store");
  const [selectedDurationId, setSelectedDurationId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [displaySection, setDisplaySection] = useState<"homepage" | "banner">("homepage");
  const [sellerNote, setSellerNote] = useState("");
  const [paying, setPaying] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pendingConfirmationIds, setPendingConfirmationIds] = useState<Set<string>>(new Set());
  const [lastReceipt, setLastReceipt] = useState<PaymentReceipt | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoVerifiedRef = useRef<Set<string>>(new Set());

  const applicationIdFromUrl = useMemo(
    () => new URLSearchParams(location.split("?")[1] || "").get("applicationId") || "",
    [location],
  );

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  useEffect(() => {
    if (isAuthenticated && user?.role === "seller") void loadPaystackInlineScript().catch(() => {});
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    if (!applicationIdFromUrl) return;
    const el = document.querySelector(`[data-testid="card-seller-promotion-${applicationIdFromUrl}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [applicationIdFromUrl]);

  const { data: promotionPricing = [], isLoading: pricingLoading, error: pricingError } = useQuery<PromotionPricing[]>({
    queryKey: ["/api/seller/promotion-pricing"],
    queryFn: async () => {
      const res = await fetch("/api/seller/promotion-pricing", { credentials: "include" });
      if (!res.ok) throw new Error((await res.text()) || "Failed to load promotion pricing");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller",
  });

  const { data: myStore } = useQuery<SellerStore | null>({
    queryKey: ["/api/stores/my-store", "promotion-page"],
    queryFn: async () => {
      const res = await fetch("/api/stores/my-store", { credentials: "include" });
      if (res.status === 404 || res.status === 403) return null;
      if (!res.ok) throw new Error("Failed to load your store");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "seller",
    retry: false,
  });

  const { data: myProducts = [] } = useQuery<SellerProduct[]>({
    queryKey: ["/api/products", "seller-promotions", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/products?sellerId=${encodeURIComponent(String(user?.id || ""))}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load your products");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller" && !!user?.id,
  });

  const { data: applications = [], isLoading: applicationsLoading } = useQuery<SellerPromotionApplication[]>({
    queryKey: ["/api/seller/promotion-applications"],
    queryFn: async () => {
      const res = await fetch("/api/seller/promotion-applications", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load promotion history");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller",
    refetchInterval: 15000,
  });

  // Clear confirmed IDs when status moves away from pending_payment; clean up localStorage too
  useEffect(() => {
    if (pendingConfirmationIds.size === 0) return;
    const stillPending = new Set<string>();
    Array.from(pendingConfirmationIds).forEach((id) => {
      const app = applications.find((a) => a.id === id);
      if (!app || app.status === "pending_payment") {
        stillPending.add(id);
      } else {
        localStorage.removeItem(`promo-ref-${id}`);
      }
    });
    if (stillPending.size !== pendingConfirmationIds.size) {
      setPendingConfirmationIds(stillPending);
      if (stillPending.size === 0 && pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    }
  }, [applications, pendingConfirmationIds]);

  // Auto-verify any pending_payment applications that have a stored reference (handles page reload)
  useEffect(() => {
    if (!isAuthenticated || applications.length === 0) return;
    const pendingApps = applications.filter((a) => a.status === "pending_payment");
    for (const app of pendingApps) {
      if (autoVerifiedRef.current.has(app.id)) continue;
      const ref = localStorage.getItem(`promo-ref-${app.id}`);
      if (!ref) continue;
      autoVerifiedRef.current.add(app.id);
      startConfirmationPolling(app.id);
      fetch(`/api/seller/promotions/${app.id}/verify-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref }),
      }).then((res) => {
        if (res.ok) {
          localStorage.removeItem(`promo-ref-${app.id}`);
          queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
        } else {
          autoVerifiedRef.current.delete(app.id);
        }
      }).catch(() => {
        autoVerifiedRef.current.delete(app.id);
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applications, isAuthenticated]);

  const startConfirmationPolling = (applicationId: string) => {
    setPendingConfirmationIds((prev) => new Set(prev).add(applicationId));
    if (pollRef.current) clearTimeout(pollRef.current);
    let attempts = 0;
    // Poll every 2s for the first 10 tries (20s), then every 4s for 15 more tries (60s) = 80s total
    const tick = () => {
      attempts++;
      queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
      const maxAttempts = 25;
      if (attempts < maxAttempts) {
        const delay = attempts <= 10 ? 2000 : 4000;
        pollRef.current = setTimeout(tick, delay);
      } else {
        pollRef.current = null;
        setPendingConfirmationIds((prev) => {
          const next = new Set(prev);
          next.delete(applicationId);
          return next;
        });
      }
    };
    pollRef.current = setTimeout(tick, 2000);
  };

  const deleteMutation = useMutation({
    mutationFn: async (applicationId: string) => {
      const res = await fetch(`/api/seller/promotions/${applicationId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Failed to delete application");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
      toast({ title: "Application removed", description: "The promotion application has been cleared from your history." });
    },
    onError: (err: any) => {
      toast({ title: "Could not delete", description: err.message, variant: "destructive" });
    },
  });

  const durationOptions = useMemo(
    () => promotionPricing.filter((item) => item.type === type && item.isActive).sort((a, b) => Number(a.duration) - Number(b.duration)),
    [promotionPricing, type],
  );

  useEffect(() => {
    if (durationOptions.length === 0) { setSelectedDurationId(""); return; }
    if (!durationOptions.some((item) => String(item.id) === selectedDurationId))
      setSelectedDurationId(String(durationOptions[0].id));
  }, [durationOptions, selectedDurationId]);

  useEffect(() => {
    if (type === "store") return;
    if (myProducts.length === 0) { setSelectedProductId(""); return; }
    if (!myProducts.some((item) => String(item.id) === selectedProductId))
      setSelectedProductId(String(myProducts[0].id));
  }, [type, myProducts, selectedProductId]);

  const selectedDuration = durationOptions.find((item) => String(item.id) === selectedDurationId) || null;
  const totalPrice = selectedDuration ? Number(selectedDuration.price) * Number(selectedDuration.duration) : 0;

  const handlePromote = async () => {
    if (!selectedDuration || !user?.email) return;
    const targetId = type === "store" ? myStore?.id : selectedProductId;
    if (!targetId) {
      toast({ title: "Select a target", description: type === "store" ? "No store linked." : "Select a product to promote.", variant: "destructive" });
      return;
    }
    setPaying(true);
    try {
      const res = await fetch("/api/seller/promotions/initialize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, targetId, durationType: selectedDuration.durationType, duration: Number(selectedDuration.duration), sellerNote, displaySection }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Could not initialize payment");
      }
      const init = await res.json();

      // Store reference so we can auto-verify after page reload or popup-close edge cases
      localStorage.setItem(`promo-ref-${init.applicationId}`, init.reference);

      resetPaystackGuard();

      // Track whether the payment was actually captured
      let paymentCaptured = false;
      try {
        await PaystackInlineService.pay({
          publicKey: init.publicKey,
          email: user.email,
          amount: Math.round(init.amountGhs * 100),
          currency: "GHS",
          reference: init.reference,
          accessCode: init.accessCode,
        });
        // Popup resolved cleanly — verify immediately to update DB
        try {
          const vRes = await fetch(`/api/seller/promotions/${init.applicationId}/verify-payment`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: init.reference }),
          });
          if (vRes.ok) localStorage.removeItem(`promo-ref-${init.applicationId}`);
        } catch { /* webhook is the fallback */ }
        paymentCaptured = true;
      } catch (payErr: any) {
        if (payErr?.message !== "Payment was cancelled before completion.") {
          localStorage.removeItem(`promo-ref-${init.applicationId}`);
          throw payErr;
        }
        // Popup closed — could be genuine cancel OR payment captured before popup closed.
        // Verify immediately; if captured, proceed as success to avoid double-payment confusion.
        try {
          const chkRes = await fetch(`/api/seller/promotions/${init.applicationId}/verify-payment`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: init.reference }),
          });
          if (chkRes.ok) {
            const chkData = await chkRes.json();
            if (chkData.status !== "pending_payment") {
              paymentCaptured = true;
              localStorage.removeItem(`promo-ref-${init.applicationId}`);
            }
          }
        } catch { /* ignore — auto-verify on next load will catch it */ }

        if (!paymentCaptured) {
          // Genuine cancel — clear reference and exit silently
          localStorage.removeItem(`promo-ref-${init.applicationId}`);
          return;
        }
      }

      // Payment confirmed — optimistic cache update
      queryClient.setQueryData(["/api/seller/promotion-applications"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((a: any) =>
          a.id === init.applicationId
            ? { ...a, status: "payment_confirmed", paymentConfirmed: true, paymentConfirmedAt: new Date().toISOString() }
            : a
        );
      });

      const targetName = type === "store"
        ? (myStore?.name || "your store")
        : (myProducts.find((p) => String(p.id) === selectedProductId)?.name || "your product");

      setLastReceipt({
        applicationId: init.applicationId,
        reference: init.reference,
        amountGhs: init.amountGhs,
        targetName,
        promotionType: type,
        displaySection,
        duration: Number(selectedDuration.duration),
        durationType: selectedDuration.durationType,
        paidAt: new Date(),
      });

      setSellerNote("");
      startConfirmationPolling(init.applicationId);
      queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] });
    } catch (err: any) {
      toast({ title: "Payment failed", description: err?.message || "Could not complete payment", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  const handleRetryPayment = async (applicationId: string) => {
    if (!user?.email) return;
    setRetryingId(applicationId);
    try {
      const res = await fetch(`/api/seller/promotions/${applicationId}/retry-payment`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Could not initialize payment");
      }
      const init = await res.json();

      localStorage.setItem(`promo-ref-${applicationId}`, init.reference);
      resetPaystackGuard();

      let paymentCaptured = false;
      try {
        await PaystackInlineService.pay({
          publicKey: init.publicKey,
          email: user.email,
          amount: Math.round(init.amountGhs * 100),
          currency: "GHS",
          reference: init.reference,
          accessCode: init.accessCode,
        });
        try {
          const vRes = await fetch(`/api/seller/promotions/${applicationId}/verify-payment`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: init.reference }),
          });
          if (vRes.ok) localStorage.removeItem(`promo-ref-${applicationId}`);
        } catch { /* webhook fallback */ }
        paymentCaptured = true;
      } catch (payErr: any) {
        if (payErr?.message !== "Payment was cancelled before completion.") {
          localStorage.removeItem(`promo-ref-${applicationId}`);
          throw payErr;
        }
        try {
          const chkRes = await fetch(`/api/seller/promotions/${applicationId}/verify-payment`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ reference: init.reference }),
          });
          if (chkRes.ok) {
            const chkData = await chkRes.json();
            if (chkData.status !== "pending_payment") {
              paymentCaptured = true;
              localStorage.removeItem(`promo-ref-${applicationId}`);
            }
          }
        } catch { /* auto-verify on next load */ }

        if (!paymentCaptured) {
          localStorage.removeItem(`promo-ref-${applicationId}`);
          return;
        }
      }

      queryClient.setQueryData(["/api/seller/promotion-applications"], (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((a: any) =>
          a.id === applicationId
            ? { ...a, status: "payment_confirmed", paymentConfirmed: true, paymentConfirmedAt: new Date().toISOString() }
            : a
        );
      });

      const app = applications.find((a) => a.id === applicationId);
      setLastReceipt({
        applicationId,
        reference: init.reference,
        amountGhs: init.amountGhs,
        targetName: app?.targetName || "your promotion",
        promotionType: app?.type || "store",
        displaySection: app?.displaySection || "homepage",
        duration: app ? Number(app.duration) : 1,
        durationType: app?.durationType || "day",
        paidAt: new Date(),
      });

      startConfirmationPolling(applicationId);
      queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
    } catch (err: any) {
      toast({ title: "Payment failed", description: err?.message || "Could not complete payment", variant: "destructive" });
    } finally {
      setRetryingId(null);
    }
  };

  const getEffectiveStatus = (a: SellerPromotionApplication): SellerPromotionApplication["status"] =>
    (a.status === "active" || a.status === "approved") && a.endAt && new Date(a.endAt).getTime() < Date.now()
      ? "expired"
      : a.status;

  const filterApps = (tab: string) => {
    if (tab === "all") return applications;
    return applications.filter((a) => STATUS_CONFIG[getEffectiveStatus(a)].tab === tab);
  };

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading seller promotions" description="Preparing promotion pricing and campaign status." />;
  }

  const activeCount = applications.filter((a) => getEffectiveStatus(a) === "active").length;
  const pendingCount = applications.filter((a) => ["pending_payment", "payment_confirmed"].includes(getEffectiveStatus(a))).length;

  return (
    <DashboardLayout role="seller">
      <div className="p-6 md:p-8 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
              <Megaphone className="h-7 w-7 text-primary" />
              Promotions
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Boost your store or products with featured placements — pay once, get reviewed and activated by our team.
            </p>
          </div>
          <div className="flex gap-3">
            {activeCount > 0 && (
              <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 px-4 py-2 text-center min-w-[80px]">
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{activeCount}</p>
                <p className="text-xs text-green-600 dark:text-green-500">Active</p>
              </div>
            )}
            {pendingCount > 0 && (
              <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 px-4 py-2 text-center min-w-[80px]">
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{pendingCount}</p>
                <p className="text-xs text-blue-600 dark:text-blue-500">Pending</p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Receipt Panel */}
        {lastReceipt && (
          <div className="rounded-xl border-2 border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/20 p-5 relative">
            <button
              onClick={() => setLastReceipt(null)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground text-lg leading-none"
              aria-label="Dismiss receipt"
            >
              ×
            </button>
            <div className="flex items-start gap-4">
              <div className="rounded-full bg-green-100 dark:bg-green-800/50 p-3 shrink-0">
                <Receipt className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-green-800 dark:text-green-300 uppercase tracking-wide">Payment Received</p>
                <h3 className="text-xl font-bold text-foreground mt-0.5">GHS {formatMoney(lastReceipt.amountGhs)}</h3>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-muted-foreground">
                  <div>
                    <span className="font-medium text-foreground">Promoting:</span>{" "}
                    <span className="capitalize">{lastReceipt.promotionType}</span> — {lastReceipt.targetName}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Duration:</span>{" "}
                    {lastReceipt.duration} {formatDurationUnit(lastReceipt.durationType as any)}{lastReceipt.duration === 1 ? "" : "s"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Placement:</span>{" "}
                    {lastReceipt.displaySection === "banner" ? "Spotlight Banner" : "Featured Section"}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Paid at:</span>{" "}
                    {lastReceipt.paidAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="font-medium text-foreground">Reference:</span>{" "}
                    <code className="text-xs bg-background border rounded px-1 py-0.5">{lastReceipt.reference}</code>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-sm text-blue-700 dark:text-blue-300">
                  <CalendarCheck className="h-4 w-4 shrink-0" />
                  <span>Your promotion is under review. Our team will activate it shortly — you'll be notified.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* New Promotion Form */}
        <Card className="overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b pb-4">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Create New Promotion
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Promotion Type</Label>
                <div className="flex rounded-lg border overflow-hidden">
                  {(["store", "product"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium transition-colors ${
                        type === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-background text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {t === "store" ? <Store className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                      {t === "store" ? "Store" : "Product"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Target</Label>
                {type === "store" ? (
                  <Input value={myStore?.name || "No store linked"} disabled className="bg-muted/50" />
                ) : (
                  <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                    <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {myProducts.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              <div className="space-y-2">
                <Label>Duration Package</Label>
                <Select value={selectedDurationId} onValueChange={setSelectedDurationId}>
                  <SelectTrigger>
                    <SelectValue placeholder={pricingLoading ? "Loading…" : "Select duration"} />
                  </SelectTrigger>
                  <SelectContent>
                    {durationOptions.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.duration} {formatDurationUnit(item.durationType)}{item.duration === 1 ? "" : "s"} — GHS {item.price} each
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!pricingLoading && durationOptions.length === 0 && (
                  <p className="text-xs text-muted-foreground">No pricing available for this type.</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Placement</Label>
                <Select value={displaySection} onValueChange={(v) => setDisplaySection(v as "homepage" | "banner")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homepage">Featured Section (Homepage grid)</SelectItem>
                    <SelectItem value="banner">Spotlight Banner (Top carousel)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {displaySection === "homepage"
                    ? "Appears in the featured items grid."
                    : "Full-width banner in the top carousel — maximum visibility."}
                </p>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="seller-note">Note to Admin (optional)</Label>
                <Input
                  id="seller-note"
                  placeholder="Any special instructions or context for the admin"
                  value={sellerNote}
                  onChange={(e) => setSellerNote(e.target.value)}
                />
              </div>
            </div>

            {pricingError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {(pricingError as any)?.message || "Unable to load promotion pricing"}
              </div>
            )}

            {selectedDuration && (
              <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total to Pay</p>
                  <p className="text-3xl font-bold text-foreground">GHS {formatMoney(totalPrice)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedDuration.duration} {formatDurationUnit(selectedDuration.durationType)}{selectedDuration.duration === 1 ? "" : "s"}
                    {" "}· {displaySection === "banner" ? "Spotlight Banner" : "Featured Section"}
                    {" "}· {type === "store" ? myStore?.name || "Store" : myProducts.find((p) => String(p.id) === selectedProductId)?.name || "Product"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    After payment, our team will review and activate your promotion within 24 hours.
                  </p>
                </div>
                <Button
                  onClick={handlePromote}
                  disabled={paying || !selectedDuration || (type === "store" ? !myStore?.id : !selectedProductId)}
                  size="lg"
                  className="gap-2 shrink-0"
                  data-testid="button-submit-promotion-application"
                >
                  {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                  {paying ? "Processing…" : "Pay & Request Promotion"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Your Promotions */}
        <Card>
          <CardHeader className="pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Your Promotions
                {applications.length > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">({applications.length})</span>
                )}
              </CardTitle>
              {applicationsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <Tabs defaultValue="all">
              <TabsList className="mb-4">
                <TabsTrigger value="all">All ({applications.length})</TabsTrigger>
                <TabsTrigger value="active">Active ({activeCount})</TabsTrigger>
                <TabsTrigger value="pending">Pending ({pendingCount})</TabsTrigger>
                <TabsTrigger value="history">History ({applications.filter((a) => ["expired", "rejected"].includes(getEffectiveStatus(a))).length})</TabsTrigger>
              </TabsList>

              {(["all", "active", "pending", "history"] as const).map((tab) => (
                <TabsContent key={tab} value={tab}>
                  <div className="space-y-3">
                    {filterApps(tab).map((app) => {
                      // Client-side expired check: if endAt is in the past, show as expired
                      // regardless of DB status (DB update may be delayed)
                      const effectiveStatus: SellerPromotionApplication["status"] =
                        (app.status === "active" || app.status === "approved") &&
                        app.endAt && new Date(app.endAt).getTime() < Date.now()
                          ? "expired"
                          : app.status;
                      const cfg = STATUS_CONFIG[effectiveStatus];
                      const isConfirming = pendingConfirmationIds.has(app.id);
                      const isHighlighted = applicationIdFromUrl && String(app.id) === String(applicationIdFromUrl);
                      const canDelete = ["expired", "rejected"].includes(app.status);
                      return (
                        <div
                          key={app.id}
                          data-testid={`card-seller-promotion-${app.id}`}
                          className={`rounded-lg border border-l-4 ${cfg.border} p-4 transition-all ${
                            isHighlighted ? "ring-2 ring-primary/30" : "hover:bg-muted/30"
                          }`}
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                            <div className="space-y-1.5 min-w-0">
                              <div className="flex items-center gap-2 font-semibold text-foreground">
                                {app.type === "store"
                                  ? <Store className="h-4 w-4 text-muted-foreground shrink-0" />
                                  : <Package className="h-4 w-4 text-muted-foreground shrink-0" />}
                                <span className="truncate">{app.targetName}</span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                <span>
                                  {app.duration} {formatDurationUnit(app.durationType)}{app.duration === 1 ? "" : "s"}
                                  {" "}— GHS {app.totalPrice}
                                </span>
                                {app.displaySection && (
                                  <span>
                                    {app.displaySection === "banner" ? "Spotlight Banner" : "Featured Section"}
                                  </span>
                                )}
                              </div>
                              {app.startAt && app.endAt && (
                                <p className="text-xs text-muted-foreground">
                                  {new Date(app.startAt).toLocaleDateString()} — {new Date(app.endAt).toLocaleDateString()}
                                  {effectiveStatus === "active" && (
                                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                                      · {timeRemaining(app.endAt)}
                                    </span>
                                  )}
                                </p>
                              )}
                              {app.rejectionReason && (
                                <p className="text-xs text-destructive">Reason: {app.rejectionReason}</p>
                              )}
                              <p className="text-xs text-muted-foreground/70">
                                Submitted {new Date(app.createdAt).toLocaleString()}
                              </p>
                            </div>

                            <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                              {isConfirming ? (
                                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 gap-1.5 animate-pulse">
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                  Confirming…
                                </Badge>
                              ) : (
                                <Badge className={`${cfg.color} gap-1.5`} data-testid={`badge-promotion-status-${app.id}`}>
                                  {cfg.icon}
                                  {cfg.label}
                                </Badge>
                              )}

                              {app.status === "pending_payment" && !isConfirming && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleRetryPayment(app.id)}
                                  disabled={retryingId === app.id}
                                  className="gap-1.5 text-xs"
                                  data-testid={`btn-retry-payment-${app.id}`}
                                >
                                  {retryingId === app.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <RefreshCw className="h-3 w-3" />}
                                  Complete Payment
                                </Button>
                              )}

                              {app.status === "payment_confirmed" && (
                                <p className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
                                  <CalendarCheck className="h-3 w-3" />
                                  Awaiting admin review
                                </p>
                              )}
                              {app.status === "approved" && (
                                <p className="text-xs text-purple-600 dark:text-purple-400">Activating soon…</p>
                              )}

                              {canDelete && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="gap-1.5 text-xs text-muted-foreground hover:text-destructive"
                                      disabled={deleteMutation.isPending}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      Clear
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove this application?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will permanently remove this {app.status} promotion application from your history. This cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => deleteMutation.mutate(app.id)}
                                        disabled={deleteMutation.isPending}
                                      >
                                        {deleteMutation.isPending ? "Removing…" : "Remove"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}

                    {filterApps(tab).length === 0 && !applicationsLoading && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Megaphone className="h-10 w-10 mx-auto mb-3 opacity-20" />
                        <p className="font-medium">
                          {tab === "all" ? "No promotions yet" : `No ${tab} promotions`}
                        </p>
                        {tab === "all" && (
                          <p className="text-sm mt-1">Create your first promotion using the form above.</p>
                        )}
                      </div>
                    )}
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
