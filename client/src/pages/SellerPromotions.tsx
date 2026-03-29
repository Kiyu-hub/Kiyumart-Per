import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Loader2, Tag, Store, Package } from "lucide-react";

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
  customerServiceNote?: string | null;
  paymentConfirmed: boolean;
  paymentConfirmedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationHours?: number | null;
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
    case "hour":
      return "hour";
    case "day":
      return "day";
    case "week":
      return "week";
    case "month":
      return "month";
    default:
      return unit;
  }
};

export default function SellerPromotions() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [type, setType] = useState<"store" | "product">("store");
  const [selectedDurationId, setSelectedDurationId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [sellerNote, setSellerNote] = useState("");
  const applicationIdFromUrl = useMemo(() => new URLSearchParams(location.split("?")[1] || "").get("applicationId") || "", [location]);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

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
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load promotion pricing");
      }
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
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load your store");
      }
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "seller",
    retry: false,
  });

  const { data: myProducts = [] } = useQuery<SellerProduct[]>({
    queryKey: ["/api/products", "seller-promotions", user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/products?sellerId=${encodeURIComponent(String(user?.id || ""))}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load your products");
      }
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller" && !!user?.id,
  });

  const { data: applications = [], isLoading: applicationsLoading } = useQuery<SellerPromotionApplication[]>({
    queryKey: ["/api/seller/promotion-applications"],
    queryFn: async () => {
      const res = await fetch("/api/seller/promotion-applications", { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load promotion requests");
      }
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && user?.role === "seller",
    refetchInterval: 15000,
  });

  const durationOptions = useMemo(
    () =>
      promotionPricing
        .filter((item) => item.type === type && item.isActive)
        .sort((a, b) => Number(a.duration) - Number(b.duration)),
    [promotionPricing, type],
  );

  useEffect(() => {
    if (durationOptions.length === 0) {
      setSelectedDurationId("");
      return;
    }
    if (!durationOptions.some((item) => String(item.id) === selectedDurationId)) {
      setSelectedDurationId(String(durationOptions[0].id));
    }
  }, [durationOptions, selectedDurationId]);

  useEffect(() => {
    if (type === "store") return;
    if (myProducts.length === 0) {
      setSelectedProductId("");
      return;
    }
    if (!myProducts.some((item) => String(item.id) === selectedProductId)) {
      setSelectedProductId(String(myProducts[0].id));
    }
  }, [type, myProducts, selectedProductId]);

  const selectedDuration = durationOptions.find((item) => String(item.id) === selectedDurationId) || null;
  const submitPromotionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDuration) {
        throw new Error("Select a duration before submitting.");
      }
      const targetId = type === "store" ? myStore?.id : selectedProductId;
      if (!targetId) {
        throw new Error(type === "store" ? "Store target is missing." : "Select a product to promote.");
      }
      const res = await apiRequest("POST", "/api/seller/apply-promotion", {
        type,
        targetId,
        durationType: selectedDuration.durationType,
        duration: Number(selectedDuration.duration),
        sellerNote,
      });
      return res.json();
    },
    onSuccess: async () => {
      toast({
        title: "Promotion application submitted",
        description: "Customer service will call you to facilitate payment for this promotion request.",
      });
      setSellerNote("");
      await queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] });
    },
    onError: (error: any) => {
      toast({
        title: "Request failed",
        description: error?.message || "Could not submit promotion request",
        variant: "destructive",
      });
    },
  });

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return <PageLoadingState title="Loading seller promotions" description="Preparing promotion pricing, requests, and campaign status." />;
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Promotions</h1>
          <p className="text-muted-foreground mt-1">
            Apply to promote your store or products. Package pricing is based on the selected duration, customer service will call you to facilitate payment, and the promotion will be activated after payment is confirmed and the request is reviewed.
          </p>
        </div>

        <Card className="p-5 space-y-5">
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Promotion application flow</p>
            <p className="mt-1">
              Select the store or product you want to promote, choose the duration package, and review the quoted cost before you apply.
              After submission, customer service will call you to explain the procedure, facilitate payment offline, and confirm the final promotion arrangement.
              Once payment is confirmed, the request will be reviewed and the promotion will be created automatically for the selected duration.
            </p>
            <p className="mt-2">
              You can promote your store and multiple different products, but you cannot submit another request for the same target while an active promotion or open request already exists for it.
            </p>
          </div>

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
                <Input
                  value={myStore?.name || "No store linked"}
                  disabled
                  data-testid="input-store-target"
                />
              ) : (
                <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                  <SelectTrigger data-testid="select-product-target">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {myProducts.map((product) => (
                      <SelectItem key={product.id} value={String(product.id)}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="space-y-2">
              <Label>Duration Option</Label>
              <Select value={selectedDurationId} onValueChange={setSelectedDurationId}>
                <SelectTrigger data-testid="select-promotion-duration">
                  <SelectValue placeholder={pricingLoading ? "Loading pricing..." : "Select duration"} />
                </SelectTrigger>
                    <SelectContent>
                      {durationOptions.map((item) => (
                        <SelectItem key={item.id} value={String(item.id)}>
                          {item.duration} {formatDurationUnit(item.durationType)}{item.duration === 1 ? "" : "s"} - GHS {item.price}
                        </SelectItem>
                      ))}
                    </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="seller-note">Note for customer service</Label>
              <Input
                id="seller-note"
                placeholder="Add a contact note or preferred time for the payment call"
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

          <div className="flex justify-end">
            <Button
              onClick={() => submitPromotionMutation.mutate()}
              disabled={
                submitPromotionMutation.isPending ||
                !selectedDuration ||
                (type === "store" ? !myStore?.id : !selectedProductId)
              }
              className="gap-2"
              data-testid="button-submit-promotion-application"
            >
              {submitPromotionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Tag className="h-4 w-4" />
              )}
              Apply for Promotion
            </Button>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Your Promotion Requests</h2>
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
                    Submitted: {application.createdAt ? new Date(application.createdAt).toLocaleString() : "N/A"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Package: {application.duration} {formatDurationUnit(application.durationType)}{application.duration === 1 ? "" : "s"} at GHS {application.unitPrice} each
                  </p>
                  <p className="text-xs text-muted-foreground">Quoted total: GHS {application.totalPrice}</p>
                  {application.customerServiceNote ? (
                    <p className="text-xs text-muted-foreground">Service note: {application.customerServiceNote}</p>
                  ) : null}
                  {application.rejectionReason ? (
                    <p className="text-xs text-destructive">Reason: {application.rejectionReason}</p>
                  ) : null}
                  {application.startAt && application.endAt ? (
                    <p className="text-xs text-muted-foreground">
                      Active window: {new Date(application.startAt).toLocaleString()}{" -> "}
                      {new Date(application.endAt).toLocaleString()}
                    </p>
                  ) : null}
                </div>
                <Badge
                  variant={application.status === "active" ? "default" : "secondary"}
                  data-testid={`badge-promotion-status-${application.id}`}
                >
                  {application.status.replace(/_/g, " ")}
                </Badge>
              </div>
            ))}

            {applications.length === 0 && !applicationsLoading && (
              <p className="text-sm text-muted-foreground text-center py-6" data-testid="text-no-promotion-requests">
                No promotion requests yet
              </p>
            )}
          </div>
        </Card>
      </div>
    </DashboardLayout>
  );
}
