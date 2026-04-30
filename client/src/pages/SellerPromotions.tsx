import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Loader2, Tag, Store, Package, CreditCard } from "lucide-react";
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

interface SellerStore {
  id: string;
  name: string;
}

interface SellerProduct {
  id: string;
  name: string;
}

const formatMoney = (value: number) => {
  if (!Number.isFinite(value)) return "0.00";
  return value.toFixed(2);
};

const formatDurationUnit = (unit: PromotionPricing["durationType"]) => {
  switch (unit) {
    case "hour": return "hour";
    case "day": return "day";
    case "week": return "week";
    case "month": return "month";
    default: return unit;
  }
};

const statusBadgeVariant = (status: SellerPromotionApplication["status"]) => {
  if (status === "active") return "default";
  if (status === "rejected") return "destructive";
  return "secondary";
};

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

  const applicationIdFromUrl = useMemo(
    () => new URLSearchParams(location.split("?")[1] || "").get("applicationId") || "",
    [location],
  );

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  // Pre-load Paystack script as soon as the seller lands on this page
  useEffect(() => {
    if (isAuthenticated && user?.role === "seller") {
      void loadPaystackInlineScript().catch(() => {});
    }
  }, [isAuthenticated, user?.role]);

  useEffect(() => {
    if (!applicationIdFromUrl) return;
    const target = document.querySelector(`[data-testid="card-seller-promotion-${applicationIdFromUrl}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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
      if (!res.ok) throw new Error((await res.text()) || "Failed to load your store");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "seller",
    retry: false,
  });

  const { data: myProducts = [] } = useQuery<SellerProduct[]>({
    queryKey: ["/api/products", "seller-promotions", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/products?sellerId=${encodeURIComponent(String(user?.id || ""))}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.text()) || "Failed to load your products");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller" && !!user?.id,
  });

  const { data: applications = [], isLoading: applicationsLoading } = useQuery<SellerPromotionApplication[]>({
    queryKey: ["/api/seller/promotion-applications"],
    queryFn: async () => {
      const res = await fetch("/api/seller/promotion-applications", { credentials: "include" });
      if (!res.ok) throw new Error((await res.text()) || "Failed to load promotion history");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller",
    refetchInterval: 15000,
  });

  const durationOptions = useMemo(
    () => promotionPricing.filter((item) => item.type === type && item.isActive).sort((a, b) => Number(a.duration) - Number(b.duration)),
    [promotionPricing, type],
  );

  useEffect(() => {
    if (durationOptions.length === 0) { setSelectedDurationId(""); return; }
    if (!durationOptions.some((item) => String(item.id) === selectedDurationId)) {
      setSelectedDurationId(String(durationOptions[0].id));
    }
  }, [durationOptions, selectedDurationId]);

  useEffect(() => {
    if (type === "store") return;
    if (myProducts.length === 0) { setSelectedProductId(""); return; }
    if (!myProducts.some((item) => String(item.id) === selectedProductId)) {
      setSelectedProductId(String(myProducts[0].id));
    }
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
        body: JSON.stringify({
          type,
          targetId,
          durationType: selectedDuration.durationType,
          duration: Number(selectedDuration.duration),
          sellerNote,
          displaySection,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || "Could not initialize payment");
      }
      const init = await res.json();
      resetPaystackGuard();
      await PaystackInlineService.pay({
        publicKey: init.publicKey,
        email: user.email,
        amount: Math.round(init.amountGhs * 100),
        currency: "GHS",
        reference: init.reference,
        accessCode: init.accessCode,
      });
      toast({
        title: "Promotion Activated",
        description: "Your payment was confirmed and your promotion is now live.",
        duration: 7000,
      });
      setSellerNote("");
      await queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] });
    } catch (err: any) {
      if (err?.message !== "Payment was cancelled before completion.") {
        toast({ title: "Payment failed", description: err?.message || "Could not complete payment", variant: "destructive" });
      }
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
      resetPaystackGuard();
      await PaystackInlineService.pay({
        publicKey: init.publicKey,
        email: user.email,
        amount: Math.round(init.amountGhs * 100),
        currency: "GHS",
        reference: init.reference,
        accessCode: init.accessCode,
      });
      toast({ title: "Promotion Activated", description: "Your payment was confirmed and your promotion is now live.", duration: 7000 });
      await queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
    } catch (err: any) {
      if (err?.message !== "Payment was cancelled before completion.") {
        toast({ title: "Payment failed", description: err?.message || "Could not complete payment", variant: "destructive" });
      }
    } finally {
      setRetryingId(null);
    }
  };

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading seller promotions" description="Preparing promotion pricing and campaign status." />;
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Promotions</h1>
          <p className="text-muted-foreground mt-1">
            Promote your store or products. Select your target and duration, review the price, and pay instantly via Paystack — your promotion activates automatically.
          </p>
        </div>

        <Card className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Promotion Type</Label>
              <Select value={type} onValueChange={(value) => setType(value as "store" | "product")}>
                <SelectTrigger data-testid="select-promotion-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">Store Promotion</SelectItem>
                  <SelectItem value="product">Product Promotion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Target</Label>
              {type === "store" ? (
                <Input value={myStore?.name || "No store linked"} disabled data-testid="input-store-target" />
              ) : (
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger data-testid="select-product-target">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {myProducts.map((product) => (
                      <SelectItem key={product.id} value={String(product.id)}>{product.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Duration Package</Label>
              <Select value={selectedDurationId} onValueChange={setSelectedDurationId}>
                <SelectTrigger data-testid="select-promotion-duration">
                  <SelectValue placeholder={pricingLoading ? "Loading pricing..." : "Select duration"} />
                </SelectTrigger>
                <SelectContent>
                  {durationOptions.map((item) => (
                    <SelectItem key={item.id} value={String(item.id)}>
                      {item.duration} {formatDurationUnit(item.durationType)}{item.duration === 1 ? "" : "s"} — GHS {item.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Placement</Label>
              <Select value={displaySection} onValueChange={(v) => setDisplaySection(v as "homepage" | "banner")}>
                <SelectTrigger data-testid="select-display-section">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="homepage">Featured Section (Homepage grid)</SelectItem>
                  <SelectItem value="banner">Spotlight Banner (Top carousel)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {displaySection === "homepage"
                  ? "Your promotion will appear in the featured items grid on the homepage."
                  : "Your promotion will appear as a full banner in the top carousel — maximum visibility."}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="seller-note">Note (optional)</Label>
              <Input
                id="seller-note"
                placeholder="Any additional notes"
                value={sellerNote}
                onChange={(e) => setSellerNote(e.target.value)}
                data-testid="input-promotion-seller-note"
              />
            </div>
          </div>

          {pricingError && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {(pricingError as any)?.message || "Unable to load promotion pricing"}
            </div>
          )}

          {selectedDuration && (
            <div className="rounded-lg border bg-muted/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Total to Pay</p>
                <p className="text-2xl font-bold text-foreground">GHS {formatMoney(totalPrice)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedDuration.duration} {formatDurationUnit(selectedDuration.durationType)}{selectedDuration.duration === 1 ? "" : "s"} at GHS {selectedDuration.price} each
                </p>
              </div>
              <Button
                onClick={handlePromote}
                disabled={paying || !selectedDuration || (type === "store" ? !myStore?.id : !selectedProductId)}
                className="gap-2"
                data-testid="button-submit-promotion-application"
              >
                {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                {paying ? "Processing…" : `Pay & Promote`}
              </Button>
            </div>
          )}

          {!selectedDuration && !pricingLoading && durationOptions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">No active pricing available for this promotion type.</p>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Your Promotions</h2>
            {applicationsLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <div className="space-y-3">
            {applications.map((application) => (
              <div
                key={application.id}
                className={`rounded-lg border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 ${
                  applicationIdFromUrl && String(application.id) === String(applicationIdFromUrl)
                    ? "border-primary ring-2 ring-primary/20"
                    : ""
                }`}
                data-testid={`card-seller-promotion-${application.id}`}
              >
                <div className="space-y-1">
                  <p className="font-medium text-foreground flex items-center gap-2">
                    {application.type === "store" ? <Store className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    {application.targetName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {application.duration} {formatDurationUnit(application.durationType)}{application.duration === 1 ? "" : "s"} — GHS {application.totalPrice}
                  </p>
                  {application.startAt && application.endAt ? (
                    <p className="text-xs text-muted-foreground">
                      {new Date(application.startAt).toLocaleString()} — {new Date(application.endAt).toLocaleString()}
                    </p>
                  ) : null}
                  {application.displaySection && (
                    <p className="text-xs text-muted-foreground">
                      Placement: {application.displaySection === "banner" ? "Spotlight Banner (carousel)" : "Featured Section (homepage)"}
                    </p>
                  )}
                  {application.rejectionReason ? (
                    <p className="text-xs text-destructive">Reason: {application.rejectionReason}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">Submitted: {new Date(application.createdAt).toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={statusBadgeVariant(application.status)}
                    data-testid={`badge-promotion-status-${application.id}`}
                  >
                    {application.status.replace(/_/g, " ")}
                  </Badge>
                  {application.status === "pending_payment" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRetryPayment(application.id)}
                      disabled={retryingId === application.id}
                      data-testid={`btn-retry-payment-${application.id}`}
                    >
                      {retryingId === application.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                      Retry Payment
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {applications.length === 0 && !applicationsLoading && (
              <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-promotion-requests">
                No promotions yet. Run your first promotion above.
              </p>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
