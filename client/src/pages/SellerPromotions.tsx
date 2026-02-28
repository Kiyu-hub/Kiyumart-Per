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
import { Loader2, Tag, Store, Package } from "lucide-react";

interface PromotionPricing {
  id: number;
  type: "store" | "product";
  durationType: "hour" | "day";
  duration: number;
  price: string;
  isActive: boolean;
}

interface SellerPromotionApplication {
  id: string;
  type: "store" | "product";
  targetId: string;
  targetName: string;
  startAt?: string | null;
  endAt?: string | null;
  durationHours?: number | null;
  status: "active" | "expired" | "ended";
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

export default function SellerPromotions() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [type, setType] = useState<"store" | "product">("store");
  const [selectedDurationId, setSelectedDurationId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

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
  const estimatedTotal = selectedDuration
    ? Number.parseFloat(selectedDuration.price || "0") * Number(selectedDuration.duration || 0)
    : 0;

  const submitPromotionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDuration) {
        throw new Error("Select a duration before submitting.");
      }
      const targetId = type === "store" ? myStore?.id : selectedProductId;
      if (!targetId) {
        throw new Error(type === "store" ? "Store target is missing." : "Select a product to promote.");
      }
      const reference = paymentReference.trim();
      if (!reference) {
        throw new Error("Payment reference is required.");
      }

      const res = await apiRequest("POST", "/api/seller/apply-promotion", {
        type,
        targetId,
        durationType: selectedDuration.durationType,
        duration: Number(selectedDuration.duration),
        paymentReference: reference,
      });
      return res.json();
    },
    onSuccess: async () => {
      toast({
        title: "Promotion request submitted",
        description: "Your promotion application was submitted and shared with super admin.",
      });
      setPaymentReference("");
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
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-6 md:p-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Promotions</h1>
          <p className="text-muted-foreground mt-1">
            Apply to promote your store or products. Submitted requests are visible to super admin in Applications.
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
                      {item.duration} {item.durationType}(s) - GHS {item.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-reference">Payment Reference</Label>
              <Input
                id="payment-reference"
                placeholder="e.g. PSTK_123456789"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                data-testid="input-payment-reference"
              />
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Estimated total:</span>{" "}
              GHS {formatMoney(estimatedTotal)}
            </p>
            <p className="mt-1">
              Use the exact successful Paystack reference for promotion payment. Invalid or reused references are rejected.
            </p>
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
              Submit Promotion Request
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
                className="rounded-lg border p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3"
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
                    Window: {application.startAt ? new Date(application.startAt).toLocaleString() : "N/A"}{" -> "}
                    {application.endAt ? new Date(application.endAt).toLocaleString() : "N/A"}
                  </p>
                </div>
                <Badge
                  variant={application.status === "active" ? "default" : "secondary"}
                  data-testid={`badge-promotion-status-${application.id}`}
                >
                  {application.status}
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
