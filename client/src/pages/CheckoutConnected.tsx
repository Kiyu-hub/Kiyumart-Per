import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOrigin, fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Package, Bike, Building2, CreditCard, Landmark, Loader2, LockKeyhole, MapPin, ShieldCheck, Smartphone, Tag } from "lucide-react";
import AddressMap from "@/components/AddressMap";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { ensureMapboxRuntimeConfig, resolveMapboxAccessToken } from "@/tracking/mapbox/mapboxLoader";
import {
  clearPersistedCheckoutCoupon,
  readPersistedCheckoutCoupon,
  writePersistedCheckoutCoupon,
} from "@/lib/checkoutCoupon";
import { loadPaystackInlineScript, PaystackInlineService, resetPaystackGuard } from "@/lib/paystackInline";
import { calculateProductPricingSummary, getCurrentSellingPrice, getOriginalDisplayPrice } from "@/lib/pricing";

interface CartItem {
  id: string;
  productId: string;
  quantity: number;
  variantId?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
  selectedImageIndex?: number | null;
}

interface Product {
  id: string;
  name: string;
  price: string;
  costPrice?: string | null;
  images: string[];
  sellerId: string;
  discount: number | null;
}

interface DeliveryZone {
  id: string;
  name: string;
  fee: string;
  city?: string | null;
  region?: string | null;
}

interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumPurchase: string;
  usageLimit?: number | null;
  usedCount?: number | null;
  expiryDate?: string | null;
}

interface PlatformSettings {
  processingFeePercent?: string;
}

interface CheckoutProfile {
  phone?: string | null;
  businessAddress?: string | null;
}

interface AddressSuggestion {
  label: string;
  lat: number;
  lng: number;
}

interface InlinePaymentInitializeResponse {
  reference: string;
  access_code?: string;
  authorization_url?: string;
  inline?: {
    publicKey: string;
    email: string;
    amount: number;
    currency: string;
    reference: string;
    accessCode?: string;
    channels?: string[];
  };
}

interface PaymentVerificationResult {
  verified: boolean;
  message: string;
  orderId?: string;
  transaction?: {
    id: string;
    orderId: string;
    amount: string;
    status: string;
  };
}

function isInGhana(lat: number, lng: number) {
  return lat >= 4.5 && lat <= 11.5 && lng >= -3.5 && lng <= 1.5;
}

function computeExactProcessingFee(chargeableBase: number, feeRate: number) {
  const normalizedBase = Math.max(0, chargeableBase);
  if (normalizedBase <= 0 || feeRate <= 0 || feeRate >= 1) return 0;
  return normalizedBase * feeRate / (1 - feeRate);
}

const CHECKOUT_DRAFT_STORAGE_PREFIX = "kiyumart.checkout.draft";
const LAST_PAID_ORDER_STORAGE_KEY = "kiyumart.checkout.lastPaidOrderId";

function normalizeGhanaPhoneNumber(rawValue: string) {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.startsWith("0") && digits.length === 10) {
    return `+233${digits.slice(1)}`;
  }
  return rawValue.trim();
}

function isValidGhanaPhoneNumber(rawValue: string) {
  const digits = String(rawValue || "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    return /^0(2|5)\d{8}$/.test(digits);
  }
  if (digits.length === 12 && digits.startsWith("233")) {
    return /^233(2|5)\d{8}$/.test(digits);
  }
  return false;
}

export default function CheckoutConnected() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading, ensureAuthenticated } = useAuth();
  const { toast } = useToast();
  const { formatPrice, currency } = useLanguage();
  const { isExternalRiderSystemEnabled, showCheckoutDeliveryMap, hasResolvedSettings } = usePlatformSettings();
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "bus" | "rider">("pickup");
  const [externalDeliveryType, setExternalDeliveryType] = useState<"third_party" | "bus">("third_party");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState(user?.phone || "");
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [locationAutoDetected, setLocationAutoDetected] = useState(false);
  const [showLocationChangeWarning, setShowLocationChangeWarning] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isAddressSuggesting, setIsAddressSuggesting] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [selectedPickupStationId, setSelectedPickupStationId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [isRestoringCoupon, setIsRestoringCoupon] = useState(false);
  const [isPaymentReviewOpen, setIsPaymentReviewOpen] = useState(false);
  const [isLaunchingInlinePayment, setIsLaunchingInlinePayment] = useState(false);
  const [isVerifyingInlinePayment, setIsVerifyingInlinePayment] = useState(false);
  const [isRedirectingToSuccess, setIsRedirectingToSuccess] = useState(false);
  // Tracks the pending order created in this session — reused on retries to prevent duplicate orders
  const pendingOrderRef = useRef<{ orderId: string; checkoutSessionId?: string; isMultiVendor?: boolean } | null>(null);
  const previousExternalModeRef = useRef<boolean | null>(null);
  const suggestionDebounceRef = useRef<number | null>(null);
  const activeSuggestionRequestRef = useRef(0);
  const suppressNextSuggestionLookupRef = useRef(false);
  const hasAttemptedCouponRestoreRef = useRef(false);
  const checkoutSubmissionLockedRef = useRef(false);
  const checkoutDraftStorageKey = user?.id ? `${CHECKOUT_DRAFT_STORAGE_PREFIX}.${user.id}` : null;

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPaystackInlineScript().catch(() => {
      // Keep checkout usable even if preloading the payment tools fails.
    });
  }, [isAuthenticated]);

  const { data: cartItems = [] } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
    queryFn: () =>
      fetchSameOriginJson<CartItem[]>("/api/cart", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: deliveryZones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/delivery-zones"],
    enabled: hasResolvedSettings && !isExternalRiderSystemEnabled,
    queryFn: () =>
      fetchSameOriginJson<DeliveryZone[]>("/api/delivery-zones", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: pickupStations = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/pickup-stations"],
    enabled: hasResolvedSettings,
    queryFn: () =>
      fetchSameOriginJson<DeliveryZone[]>("/api/pickup-stations", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: cartProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/cart/products", cartItems],
    queryFn: async () => {
      if (!cartItems.length) return [];
      const productsData = await Promise.all(
        cartItems.map((item) =>
          fetchSameOriginJson<Product>(`/api/products/${item.productId}`, {
            cache: "no-store",
          })
        )
      );
      return productsData;
    },
    enabled: cartItems.length > 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
    queryFn: () =>
      fetchSameOriginJson<PlatformSettings>("/api/settings", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const { data: profile } = useQuery<CheckoutProfile>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated,
    queryFn: () =>
      fetchSameOriginJson<CheckoutProfile>("/api/profile", {
        cache: "no-store",
      }),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!checkoutDraftStorageKey || typeof window === "undefined") return;
    try {
      const rawDraft = window.localStorage.getItem(checkoutDraftStorageKey);
      if (!rawDraft) return;
      const draft = JSON.parse(rawDraft) as Record<string, any>;
      if (typeof draft.deliveryMethod === "string") {
        setDeliveryMethod(draft.deliveryMethod as any);
      }
      if (typeof draft.externalDeliveryType === "string") {
        setExternalDeliveryType(draft.externalDeliveryType as any);
      }
      if (typeof draft.deliveryAddress === "string" && !deliveryAddress.trim()) {
        setDeliveryAddress(draft.deliveryAddress);
      }
      if (typeof draft.deliveryPhone === "string" && !deliveryPhone.trim()) {
        setDeliveryPhone(draft.deliveryPhone);
      }
      if (typeof draft.selectedZoneId === "string") {
        setSelectedZoneId(draft.selectedZoneId);
      }
      if (typeof draft.selectedPickupStationId === "string") {
        setSelectedPickupStationId(draft.selectedPickupStationId);
      }
      if (typeof draft.couponCode === "string" && !couponCode.trim()) {
        setCouponCode(draft.couponCode);
      }
      if (Number.isFinite(Number(draft.deliveryLat))) {
        setDeliveryLat(Number(draft.deliveryLat));
      }
      if (Number.isFinite(Number(draft.deliveryLng))) {
        setDeliveryLng(Number(draft.deliveryLng));
      }
    } catch {
      // Ignore local draft parsing issues.
    }
  }, [checkoutDraftStorageKey]);

  useEffect(() => {
    if (!checkoutDraftStorageKey || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        checkoutDraftStorageKey,
        JSON.stringify({
          deliveryMethod,
          externalDeliveryType,
          deliveryAddress,
          deliveryPhone,
          selectedZoneId,
          selectedPickupStationId,
          couponCode,
          deliveryLat,
          deliveryLng,
        }),
      );
    } catch {
      // Ignore local draft write failures.
    }
  }, [
    checkoutDraftStorageKey,
    couponCode,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    deliveryMethod,
    deliveryPhone,
    externalDeliveryType,
    selectedPickupStationId,
    selectedZoneId,
  ]);

  useEffect(() => {
    const savedPhone = String(profile?.phone || user?.phone || "").trim();
    const savedAddress = String(profile?.businessAddress || "").trim();

    if (savedPhone && !String(deliveryPhone || "").trim()) {
      setDeliveryPhone(savedPhone);
    }

    if (savedAddress && !String(deliveryAddress || "").trim()) {
      setDeliveryAddress(savedAddress);
    }
  }, [profile?.businessAddress, profile?.phone, user?.phone]);

  useEffect(() => {
    if (!hasResolvedSettings) return;
    if (previousExternalModeRef.current === null) {
      previousExternalModeRef.current = isExternalRiderSystemEnabled;
    } else if (previousExternalModeRef.current !== isExternalRiderSystemEnabled) {
      setSelectedZoneId("");
      setExternalDeliveryType("third_party");
      setDeliveryMethod((current) => (current === "pickup" ? "pickup" : "rider"));
      previousExternalModeRef.current = isExternalRiderSystemEnabled;
    }

    if (isExternalRiderSystemEnabled) {
      setSelectedZoneId("");
      if (deliveryMethod === "bus") {
        setDeliveryMethod("rider");
      }
    }
  }, [deliveryMethod, hasResolvedSettings, isExternalRiderSystemEnabled]);

  useEffect(() => {
    const query = deliveryAddress.trim();

    if (suppressNextSuggestionLookupRef.current) {
      suppressNextSuggestionLookupRef.current = false;
      return;
    }

    if (suggestionDebounceRef.current) {
      window.clearTimeout(suggestionDebounceRef.current);
      suggestionDebounceRef.current = null;
    }

    if (query.length < 3 || deliveryMethod === "pickup") {
      setAddressSuggestions([]);
      setShowAddressSuggestions(false);
      setIsAddressSuggesting(false);
      return;
    }

    const requestId = ++activeSuggestionRequestRef.current;
    setShowAddressSuggestions(true);
    setIsAddressSuggesting(true);
    suggestionDebounceRef.current = window.setTimeout(() => {
      void fetchAddressSuggestions(query)
        .then((results) => {
          if (requestId !== activeSuggestionRequestRef.current) return;
          setAddressSuggestions(results);
        })
        .finally(() => {
          if (requestId === activeSuggestionRequestRef.current) {
            setIsAddressSuggesting(false);
          }
        });
    }, 120);

    return () => {
      if (suggestionDebounceRef.current) {
        window.clearTimeout(suggestionDebounceRef.current);
        suggestionDebounceRef.current = null;
      }
    };
  }, [deliveryAddress, deliveryMethod]);

  async function fetchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
    try {
      await ensureMapboxRuntimeConfig();
      const mapboxToken = resolveMapboxAccessToken();
      if (mapboxToken) {
        const proximity = `${-0.1869644},${5.6037168}`;
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?country=gh&types=address,poi,street,neighborhood,locality,place,postcode&autocomplete=true&limit=5&proximity=${proximity}&access_token=${mapboxToken}`;
        const response = await fetch(mapboxUrl, { headers: { Accept: "application/json" } });
        const data = await response.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        return features
          .map((feature: any) => {
            const center = Array.isArray(feature?.center) ? feature.center : [];
            const lng = Number(center[0]);
            const lat = Number(center[1]);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInGhana(lat, lng)) return null;
            return {
              label: String(feature.place_name || feature.text || query).trim(),
              lat,
              lng,
            } satisfies AddressSuggestion;
          })
          .filter((item: AddressSuggestion | null): item is AddressSuggestion => Boolean(item));
      }

      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=gh&bounded=1`;
      const response = await fetch(fallbackUrl, { headers: { Accept: "application/json" } });
      const data = await response.json();
      if (!Array.isArray(data)) return [];
      return data
        .map((item: any) => {
          const lat = Number(item?.lat);
          const lng = Number(item?.lon);
          if (!Number.isFinite(lat) || !Number.isFinite(lng) || !isInGhana(lat, lng)) return null;
          return {
            label: String(item.display_name || query).trim(),
            lat,
            lng,
          } satisfies AddressSuggestion;
        })
        .filter((item: AddressSuggestion | null): item is AddressSuggestion => Boolean(item));
    } catch {
      return [];
    }
  }

  function handleSelectAddressSuggestion(suggestion: AddressSuggestion) {
    suppressNextSuggestionLookupRef.current = true;
    setDeliveryAddress(suggestion.label);
    setDeliveryLat(suggestion.lat);
    setDeliveryLng(suggestion.lng);
    setAddressSuggestions([]);
    setShowAddressSuggestions(false);
  }

  const validateCouponMutation = useMutation({
    mutationFn: (data: { code: string; sellerId: string; orderTotal: string }) =>
      fetchSameOriginJson<any>("/api/coupons/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }),
    onSuccess: (data) => {
      if (data.valid && data.coupon) {
        setAppliedCoupon(data.coupon);
        const restoredCode = String(data.coupon.code || couponCode || "").trim().toUpperCase();
        setCouponCode(restoredCode);
        writePersistedCheckoutCoupon(user?.id, {
          code: restoredCode,
          sellerId: itemsWithProducts[0]?.product?.sellerId || null,
          savedAt: Date.now(),
        });
        toast({
          title: "Coupon Applied",
          description: `${data.coupon.discountType === "percentage" ? `${data.coupon.discountValue}%` : formatPrice(parseFloat(data.coupon.discountValue))} discount applied successfully!`,
        });
      } else {
        setAppliedCoupon(null);
        clearPersistedCheckoutCoupon(user?.id);
        toast({
          title: "Invalid Coupon",
          description: data.message || "This coupon code is not valid",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Validation Failed",
        description: error.message || "Failed to validate coupon",
        variant: "destructive",
      });
    },
  });

  const initializeAndPay = async (data: { id?: string; checkoutSessionId?: string; isMultiVendor?: boolean }) => {
    try {
      // Store the order reference so retries can reuse it without creating a new order
      if (data.id) {
        pendingOrderRef.current = {
          orderId: data.id,
          checkoutSessionId: data.checkoutSessionId,
          isMultiVendor: data.isMultiVendor,
        };
      }

      const paymentPayload = data.isMultiVendor && data.checkoutSessionId
        ? { checkoutSessionId: data.checkoutSessionId, inline: true }
        : { orderId: data.id, inline: true };

      const paymentData = await fetchSameOriginJson<InlinePaymentInitializeResponse>("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paymentPayload),
      });

      const inline = paymentData.inline;
      if (!inline?.publicKey || !inline.reference || !inline.amount) {
        throw new Error("Payment system returned incomplete payment details. Please try again.");
      }

      resetPaystackGuard();
      setIsLaunchingInlinePayment(true);
      await Promise.resolve();

      let reference: string;
      try {
        reference = await PaystackInlineService.pay({
          publicKey: inline.publicKey,
          email: inline.email,
          amount: inline.amount,
          currency: inline.currency || "GHS",
          reference: inline.reference,
          accessCode: inline.accessCode,
          channels: inline.channels,
          onOpen: () => {
            setIsPaymentReviewOpen(false);
          },
        });
      } catch (inlineError: any) {
        const inlineMessage = String(inlineError?.message || "");
        const canFallbackToHostedCheckout =
          /could not load paystack payment tools|paystack payment tools took too long to load/i.test(
            inlineMessage,
          ) && paymentData.authorization_url;
        if (canFallbackToHostedCheckout) {
          window.location.assign(paymentData.authorization_url!);
          return;
        }
        throw inlineError;
      }

      setIsLaunchingInlinePayment(false);
      setIsVerifyingInlinePayment(true);

      let verification: PaymentVerificationResult;
      try {
        verification = await fetchSameOriginJson<PaymentVerificationResult>(
          `/api/payments/verify/${encodeURIComponent(reference)}`,
          { cache: "no-store" }
        );
      } catch {
        verification = await fetchSameOriginJson<PaymentVerificationResult>(
          `/api/payments/verify-public/${encodeURIComponent(reference)}`,
          { cache: "no-store" }
        );
      }

      const resolvedOrderId = verification.orderId || verification.transaction?.orderId;

      if (!verification.verified || !resolvedOrderId) {
        throw new Error(verification.message || "Payment could not be confirmed.");
      }

      // Clear the pending order ref on success
      pendingOrderRef.current = null;
      clearPersistedCheckoutCoupon(user?.id);
      if (checkoutDraftStorageKey && typeof window !== "undefined") {
        window.localStorage.removeItem(checkoutDraftStorageKey);
      }
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(LAST_PAID_ORDER_STORAGE_KEY, resolvedOrderId);
      }
      setIsPaymentReviewOpen(false);
      setIsRedirectingToSuccess(true);
      queryClient.setQueryData(["/api/cart"], []);
      navigate(`/payment/success?orderId=${resolvedOrderId}`);
      void fetchSameOrigin("/api/cart", { method: "DELETE", credentials: "include" }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      void queryClient.invalidateQueries({ queryKey: [`/api/orders/${resolvedOrderId}`] });
    } catch (error: any) {
      const rawMessage = String(error?.message || "");
      const normalizedMessage = rawMessage.replace(/^\d+:\s*/, "").trim();
      const wasCancelled = /cancelled/i.test(normalizedMessage);
      const isPaystackLoadIssue =
        /could not load paystack payment tools|paystack payment tools took too long to load/i.test(
          normalizedMessage,
        );
      const friendlyMessage = rawMessage.startsWith("401:")
        ? "Your session expired while preparing payment. Please log in again and retry checkout."
        : wasCancelled
          ? "Payment was cancelled. Your order is still pending — tap Pay Again to retry."
          : isPaystackLoadIssue
            ? "Secure payment is taking longer than expected to open. Please try again in a moment."
            : normalizedMessage || "Failed to initialize payment. Please try again.";
      setIsPaymentReviewOpen(true);
      toast({
        title: wasCancelled ? "Payment Cancelled" : "Payment Initialization Failed",
        description: friendlyMessage,
        variant: wasCancelled ? "default" : "destructive",
      });
    } finally {
      setIsLaunchingInlinePayment(false);
      setIsVerifyingInlinePayment(false);
      checkoutSubmissionLockedRef.current = false;
    }
  };

  const createOrderMutation = useMutation({
    mutationFn: (orderData: any) =>
      fetchSameOriginJson<any>("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderData),
      }),
    onSuccess: async (data) => {
      await initializeAndPay(data);
    },
    onError: (error: any) => {
      const rawMessage = String(error?.message || "");
      const friendlyMessage = rawMessage.startsWith("401:")
        ? "Your session expired. Please log in again before placing the order."
        : rawMessage.replace(/^\d+:\s*/, "") || "Failed to create order";
      toast({
        title: "Order Failed",
        description: friendlyMessage,
        variant: "destructive",
      });
      checkoutSubmissionLockedRef.current = false;
    },
  });


  if (!cartItems.length && !productsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Cart is Empty</CardTitle>
            <CardDescription>Add some products to your cart before checking out</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              Continue Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const itemsWithProducts = cartItems.map(item => {
    const product = cartProducts.find(p => p.id === item.productId);
    return { ...item, product };
  }).filter(item => item.product);

  const pricingSummary = calculateProductPricingSummary(
    itemsWithProducts.map((item) => ({
      ...item.product!,
      quantity: item.quantity,
    })),
  );
  const subtotal = pricingSummary.subtotal;
  const originalSubtotal = pricingSummary.originalSubtotal;
  const productSavings = pricingSummary.productSavings;

  const selectedZone = deliveryZones.find(z => z.id === selectedZoneId);
  const selectedPickupStation = pickupStations.find((station) => station.id === selectedPickupStationId);
  const usingExternalDeliveryFlow = isExternalRiderSystemEnabled && deliveryMethod !== "pickup";
  const deliveryFeeCommission = !isExternalRiderSystemEnabled ? Number((settings as any)?.deliveryFeeCommission ?? 0) : 0;
  const deliveryFee =
    deliveryMethod === "pickup"
      ? 0
      : usingExternalDeliveryFlow
        ? 0
        : selectedZone
          ? parseFloat(selectedZone.fee) + deliveryFeeCommission
          : 0;

  // Calculate coupon discount
  const calculateCouponDiscount = () => {
    if (!appliedCoupon) return 0;
    
    if (appliedCoupon.discountType === "percentage") {
      return (subtotal * parseFloat(appliedCoupon.discountValue)) / 100;
    } else {
      return parseFloat(appliedCoupon.discountValue);
    }
  };

  const couponDiscount = calculateCouponDiscount();
  const discountedSubtotal = Math.max(0, subtotal - couponDiscount);
  const processingFeePercent = Number(settings?.processingFeePercent ?? "1.95");
  const processingFeeRate = Number.isFinite(processingFeePercent) ? processingFeePercent / 100 : 0.0195;
  const processingFee = computeExactProcessingFee(discountedSubtotal + deliveryFee, processingFeeRate);
  const total = discountedSubtotal + deliveryFee + processingFee;
  const checkoutSellerId = itemsWithProducts[0]?.product?.sellerId || user?.id || null;
  const isInlinePaymentBusy =
    createOrderMutation.isPending || isLaunchingInlinePayment || isVerifyingInlinePayment;

  const { data: availableCoupons = [] } = useQuery<Coupon[]>({
    queryKey: ["/api/coupons/available", checkoutSellerId, subtotal],
    enabled: isAuthenticated && !!checkoutSellerId && subtotal > 0,
    queryFn: () =>
      fetchSameOriginJson<Coupon[]>(
        `/api/coupons/available?sellerId=${encodeURIComponent(String(checkoutSellerId))}&orderTotal=${encodeURIComponent(
          subtotal.toFixed(2),
        )}`,
        {
          cache: "no-store",
        },
      ),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  useEffect(() => {
    if (!user?.id) return;
    if (hasAttemptedCouponRestoreRef.current) return;
    if (!itemsWithProducts.length || !checkoutSellerId || subtotal <= 0) return;

    hasAttemptedCouponRestoreRef.current = true;
    const persistedCoupon = readPersistedCheckoutCoupon(user.id);
    if (!persistedCoupon?.code) return;

    if (persistedCoupon.sellerId && persistedCoupon.sellerId !== checkoutSellerId) {
      clearPersistedCheckoutCoupon(user.id);
      return;
    }

    setCouponCode(persistedCoupon.code);
    setIsRestoringCoupon(true);

    void fetchSameOriginJson<any>("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: persistedCoupon.code,
        sellerId: checkoutSellerId,
        orderTotal: subtotal.toFixed(2),
      }),
    })
      .then((data) => {
        if (data?.valid && data?.coupon) {
          setAppliedCoupon(data.coupon);
          writePersistedCheckoutCoupon(user.id, {
            code: String(data.coupon.code || persistedCoupon.code).trim().toUpperCase(),
            sellerId: checkoutSellerId,
            savedAt: Date.now(),
          });
        } else {
          setAppliedCoupon(null);
          clearPersistedCheckoutCoupon(user.id);
        }
      })
      .catch(() => {
        // Keep the coupon persisted for the next retry if checkout temporarily fails.
      })
      .finally(() => {
        setIsRestoringCoupon(false);
      });
  }, [checkoutSellerId, itemsWithProducts.length, subtotal, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    if (!appliedCoupon) return;

    writePersistedCheckoutCoupon(user.id, {
      code: String(appliedCoupon.code || couponCode).trim().toUpperCase(),
      sellerId: checkoutSellerId,
      savedAt: Date.now(),
    });
  }, [appliedCoupon, checkoutSellerId, couponCode, user?.id]);

  const handleApplyCoupon = () => {
    if (!couponCode.trim()) {
      toast({
        title: "Invalid Input",
        description: "Please enter a coupon code",
        variant: "destructive",
      });
      return;
    }

    const sellerId = itemsWithProducts[0]?.product?.sellerId || user?.id;
    if (!sellerId) {
      toast({
        title: "Error",
        description: "Unable to validate coupon at this time",
        variant: "destructive",
      });
      return;
    }

    validateCouponMutation.mutate({
      code: couponCode.trim(),
      sellerId,
      orderTotal: subtotal.toFixed(2),
    });
  };

  const handleQuickApplyCoupon = (coupon: Coupon) => {
    setCouponCode(String(coupon.code || "").toUpperCase());
    validateCouponMutation.mutate({
      code: String(coupon.code || "").trim(),
      sellerId: checkoutSellerId ?? "",
      orderTotal: subtotal.toFixed(2),
    });
  };

  const syncCheckoutDetailsToProfile = async () => {
    const trimmedPhone = normalizeGhanaPhoneNumber(String(deliveryPhone || "").trim());
    const trimmedAddress = String(deliveryAddress || "").trim();
    const currentPhone = String(profile?.phone || user?.phone || "").trim();
    const currentAddress = String(profile?.businessAddress || "").trim();

    const updatePayload: Record<string, string> = {};

    if (trimmedPhone && trimmedPhone !== currentPhone) {
      updatePayload.phone = trimmedPhone;
    }

    if (deliveryMethod !== "pickup" && trimmedAddress && trimmedAddress !== currentAddress) {
      updatePayload.businessAddress = trimmedAddress;
    }

    if (!Object.keys(updatePayload).length) return;

    await fetchSameOriginJson("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updatePayload),
    });

    await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    await queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
  };

  const validateCheckoutBeforePayment = async () => {
    const authenticated = await ensureAuthenticated();
    if (!authenticated) {
      toast({
        title: "Session expired",
        description: "Please log in again to continue with checkout.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    const normalizedPhone = normalizeGhanaPhoneNumber(deliveryPhone);
    if (!String(deliveryPhone || "").trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a contact phone number before checkout.",
        variant: "destructive",
      });
      return false;
    }

    if (!isValidGhanaPhoneNumber(normalizedPhone)) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter a valid Ghana phone number such as 0241234567 or +233241234567.",
        variant: "destructive",
      });
      return false;
    }

    if (normalizedPhone !== deliveryPhone) {
      setDeliveryPhone(normalizedPhone);
    }

    if (deliveryMethod !== "pickup" && !String(deliveryAddress || "").trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide a delivery address",
        variant: "destructive",
      });
      return false;
    }

    if (!usingExternalDeliveryFlow && deliveryMethod !== "pickup" && !selectedZoneId) {
      toast({
        title: "Missing Information",
        description: "Please select a delivery zone",
        variant: "destructive",
      });
      return false;
    }
    if (deliveryMethod !== "pickup" && (deliveryLat == null || deliveryLng == null)) {
      toast({
        title: "Location Required",
        description: usingExternalDeliveryFlow
          ? "Pin your exact delivery location on the map so customer service can coordinate external delivery."
          : "Pin your exact delivery location on the map so rider navigation works.",
        variant: "destructive",
      });
      return false;
    }
    if (
      deliveryMethod !== "pickup" &&
      (deliveryLat! < -90 || deliveryLat! > 90 || deliveryLng! < -180 || deliveryLng! > 180)
    ) {
      toast({
        title: "Invalid Location",
        description: "Selected map coordinates are invalid. Please choose location again.",
        variant: "destructive",
      });
      return false;
    }

    if (deliveryMethod === "pickup" && pickupStations.length > 0 && !selectedPickupStationId) {
      toast({
        title: "Missing Information",
        description: "Please choose a pickup station",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const submitCheckoutForInlinePayment = async () => {
    if (checkoutSubmissionLockedRef.current || isInlinePaymentBusy) {
      return;
    }
    const isValid = await validateCheckoutBeforePayment();
    if (!isValid) return;
    checkoutSubmissionLockedRef.current = true;

    try {
      await syncCheckoutDetailsToProfile();
    } catch {
      toast({
        title: "Profile update skipped",
        description: "Your order can continue, but we could not save your checkout details to your profile right now.",
        variant: "destructive",
      });
    }

    const sellerId = itemsWithProducts[0]?.product?.sellerId || user?.id;

    const orderData = {
      items: itemsWithProducts.map(item => {
        const discountedPrice = getCurrentSellingPrice(item.product!);
        return {
          productId: item.productId,
          variantId: item.variantId || null,
          selectedColor: item.selectedColor || null,
          selectedSize: item.selectedSize || null,
          selectedImageIndex: Number.isFinite(Number(item.selectedImageIndex))
            ? Math.max(0, Number(item.selectedImageIndex) || 0)
            : 0,
          quantity: item.quantity,
          price: discountedPrice.toFixed(2),
          total: (discountedPrice * item.quantity).toFixed(2),
        };
      }),
      sellerId,
      deliveryMethod: usingExternalDeliveryFlow ? "rider" : deliveryMethod,
      externalDeliveryByBus: usingExternalDeliveryFlow ? externalDeliveryType === "bus" : false,
      externalDeliveryType: usingExternalDeliveryFlow ? externalDeliveryType : null,
      deliveryZoneId:
        deliveryMethod === "pickup"
          ? selectedPickupStationId || null
          : usingExternalDeliveryFlow
            ? null
            : selectedZoneId || null,
      deliveryAddress: deliveryAddress.trim() || null,
      deliveryPhone: normalizeGhanaPhoneNumber(deliveryPhone.trim()) || null,
      deliveryLatitude: deliveryLat,
      deliveryLongitude: deliveryLng,
      deliveryFee: deliveryFee.toFixed(2),
      subtotal: subtotal.toFixed(2),
      couponCode: appliedCoupon?.code || null,
      couponDiscount: couponDiscount > 0 ? couponDiscount.toFixed(2) : null,
      processingFee: processingFee.toFixed(2),
      total: total.toFixed(2),
      currency: currency,
      status: "pending",
    };

    // If we already have a pending order from a prior attempt, reuse it to avoid duplicates
    if (pendingOrderRef.current) {
      checkoutSubmissionLockedRef.current = true;
      await initializeAndPay(pendingOrderRef.current);
      return;
    }

    createOrderMutation.mutate(orderData);
  };

  const handlePlaceOrder = async () => {
    if (checkoutSubmissionLockedRef.current || isInlinePaymentBusy) return;
    const isValid = await validateCheckoutBeforePayment();
    if (!isValid) return;
    setIsPaymentReviewOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Location change warning modal */}
      {showLocationChangeWarning && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              </div>
              <div>
                <p className="font-semibold text-sm">Change Detected Location?</p>
                <p className="text-xs text-muted-foreground mt-0.5">Your location was automatically detected</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Our system has already detected your accurate location. Providing an incorrect delivery address can lead to failed or delayed deliveries. Are you sure you want to change it?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowLocationChangeWarning(false)}
                className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2.5 transition-colors"
              >
                Keep
              </button>
              <button
                onClick={() => {
                  setLocationAutoDetected(false);
                  setShowLocationChangeWarning(false);
                  setDeliveryLat(null);
                  setDeliveryLng(null);
                }}
                className="flex-1 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2.5 transition-colors"
              >
                Change Location
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="container max-w-7xl mx-auto px-4 py-8">
        <Button
          variant="ghost"
          onClick={() => navigate("/")}
          className="mb-6"
          data-testid="button-back"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Shopping
        </Button>

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card data-testid="card-delivery-method">
              <CardHeader>
                <CardTitle>Delivery Method</CardTitle>
                <CardDescription>
                  {hasResolvedSettings ? "Choose how you want to receive your order" : "Loading delivery options..."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!hasResolvedSettings ? (
                  <div className="rounded-xl border border-white/10 bg-muted/20 px-4 py-5 text-sm text-muted-foreground">
                    Checking the current delivery configuration...
                  </div>
                ) : (
                <RadioGroup
                  key={isExternalRiderSystemEnabled ? "external-delivery-mode" : "internal-rider-mode"}
                  value={deliveryMethod}
                  onValueChange={(value) => setDeliveryMethod(value as any)}
                  className="space-y-3"
                >
                  <div className="flex items-center space-x-3 rounded-lg border px-4 py-4">
                    <RadioGroupItem value="pickup" id="pickup" data-testid="radio-pickup" />
                    <Label htmlFor="pickup" className="flex-1 cursor-pointer flex items-center gap-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">Pickup</div>
                        <div className="text-sm text-muted-foreground">Collect from store - Free</div>
                      </div>
                    </Label>
                  </div>

                  {deliveryMethod === "pickup" && (
                    <div className="space-y-2 rounded-lg border border-border px-4 py-4">
                      <Label htmlFor="pickup-station" className="text-sm font-medium">
                        Pickup location
                      </Label>
                      {pickupStations.length > 0 ? (
                        <Select
                          value={selectedPickupStationId || undefined}
                          onValueChange={setSelectedPickupStationId}
                        >
                          <SelectTrigger id="pickup-station" data-testid="select-pickup-station">
                            <SelectValue placeholder="Select a pickup location" />
                          </SelectTrigger>
                          <SelectContent>
                            {pickupStations.map((station) => {
                              const locationBits = [station.name, station.city, station.region]
                                .map((value) => String(value || "").trim())
                                .filter(Boolean);
                              return (
                                <SelectItem key={station.id} value={station.id}>
                                  {locationBits.join(", ")}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No pickup locations are available at the moment.
                        </p>
                      )}
                      <div className="space-y-2 pt-2">
                        <Label htmlFor="pickup-phone" className="text-sm font-medium">
                          Contact phone number
                        </Label>
                        <Input
                          id="pickup-phone"
                          type="tel"
                          placeholder="0241234567 or +233241234567"
                          value={deliveryPhone}
                          onChange={(e) => setDeliveryPhone(e.target.value)}
                          data-testid="input-pickup-phone"
                        />
                      </div>
                    </div>
                  )}

                  {isExternalRiderSystemEnabled ? (
                    <>
                      <div className="flex items-center space-x-3 rounded-lg border px-4 py-4">
                        <RadioGroupItem value="rider" id="external-delivery" data-testid="radio-external-delivery" />
                        <Label htmlFor="external-delivery" className="flex-1 cursor-pointer flex items-center gap-3">
                          <Bike className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Delivery</div>
                            <div className="text-sm text-muted-foreground">
                              {externalDeliveryType === "bus"
                                ? "Long-distance regional delivery support"
                                : "Yango, Uber, Bolt and similar services"}
                            </div>
                          </div>
                        </Label>
                      </div>

                      {deliveryMethod === "rider" && (
                        <div className="space-y-2 rounded-lg border border-border px-4 py-4">
                          <Label htmlFor="external-delivery-type" className="text-sm font-medium">
                            Delivery arrangement
                          </Label>
                          <Select
                            value={externalDeliveryType}
                            onValueChange={(value) => setExternalDeliveryType(value as "third_party" | "bus")}
                          >
                            <SelectTrigger id="external-delivery-type" data-testid="select-external-delivery-type">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="third_party">Third-party delivery</SelectItem>
                              <SelectItem value="bus">VIP bus delivery</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm text-muted-foreground">
                            {externalDeliveryType === "bus"
                              ? "Suitable for deliveries from Accra to regions such as Ashanti, Northern, Upper East, Upper West, Volta, and other distant areas. We will confirm the bus station details, handover process, and delivery cost with you before dispatch."
                              : "Suitable for Accra and nearby destinations. We will arrange a trusted third-party delivery service such as Yango, Uber, Bolt and similar services, and confirm the delivery charge with you before dispatch."}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center space-x-3 rounded-lg border px-4 py-4">
                        <RadioGroupItem value="bus" id="bus" data-testid="radio-bus" />
                        <Label htmlFor="bus" className="flex-1 cursor-pointer flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Bus Delivery</div>
                            <div className="text-sm text-muted-foreground">Delivered via bus</div>
                          </div>
                        </Label>
                      </div>

                      <div className="flex items-center space-x-3 rounded-lg border px-4 py-4">
                        <RadioGroupItem value="rider" id="rider" data-testid="radio-rider" />
                        <Label htmlFor="rider" className="flex-1 cursor-pointer flex items-center gap-3">
                          <Bike className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Rider Delivery</div>
                            <div className="text-sm text-muted-foreground">Fast delivery by rider</div>
                          </div>
                        </Label>
                      </div>
                    </>
                  )}
                </RadioGroup>
                )}
              </CardContent>
            </Card>

            {deliveryMethod !== "pickup" && (
              <Card data-testid="card-delivery-address">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Delivery Details
                  </CardTitle>
                  <CardDescription>Where should we deliver your order?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {usingExternalDeliveryFlow && (
                    <p
                      className="text-sm leading-6 text-muted-foreground"
                      data-testid="external-delivery-notice"
                    >
                      {externalDeliveryType === "bus"
                        ? "Suitable for deliveries from Accra to regions such as Ashanti, Northern, Upper East, Upper West, Volta, and other distant areas. We will confirm the bus station details, handover process, and delivery cost with you before dispatch."
                        : "Suitable for Accra and nearby destinations. We will arrange a trusted third-party delivery service such as Yango, Uber, Bolt and similar services, and confirm the delivery charge with you before dispatch."}
                    </p>
                  )}

                  <div className="relative space-y-2">
                    <Label htmlFor="address">Full Address</Label>
                    <Input
                      id="address"
                      placeholder="Enter your full delivery address"
                      value={deliveryAddress}
                      readOnly={locationAutoDetected}
                      onClick={() => {
                        if (locationAutoDetected) setShowLocationChangeWarning(true);
                      }}
                      onChange={(e) => {
                        if (locationAutoDetected) {
                          setShowLocationChangeWarning(true);
                          return;
                        }
                        setDeliveryAddress(e.target.value);
                        setDeliveryLat(null);
                        setDeliveryLng(null);
                        setShowAddressSuggestions(true);
                      }}
                      onFocus={() => {
                        if (deliveryAddress.trim().length >= 3 || addressSuggestions.length > 0) {
                          setShowAddressSuggestions(true);
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setShowAddressSuggestions(false), 220);
                      }}
                      autoComplete="street-address"
                      data-testid="input-address"
                    />
                    {showAddressSuggestions && deliveryAddress.trim().length >= 3 ? (
                      <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-xl border border-border/70 bg-background/95 shadow-2xl backdrop-blur-sm">
                        {isAddressSuggesting ? (
                          <div className="px-3 py-2.5 text-sm text-muted-foreground">
                            Finding matching places in Ghana...
                          </div>
                        ) : addressSuggestions.length === 0 ? (
                          <div className="px-3 py-2.5 text-sm text-muted-foreground">
                            No matching places found yet. Try adding a nearby area, street, or landmark in Ghana.
                          </div>
                        ) : (
                          <div className="max-h-72 overflow-y-auto py-1">
                            {addressSuggestions.map((suggestion, index) => (
                              <button
                                key={`${suggestion.label}-${index}`}
                                type="button"
                                className="flex w-full flex-col items-start gap-1 px-3 py-2.5 text-left transition hover:bg-muted/70"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => handleSelectAddressSuggestion(suggestion)}
                                data-testid={`address-suggestion-${index}`}
                              >
                                <span className="text-sm font-medium text-foreground">{suggestion.label.split(",").slice(0, 2).join(", ")}</span>
                                <span className="text-xs text-muted-foreground">{suggestion.label}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="phone">Contact Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="0241234567 or +233241234567"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      data-testid="input-delivery-phone"
                    />
                    <p className="text-xs text-muted-foreground">
                      Use a valid Ghana number so delivery and payment support can reach you quickly.
                    </p>
                  </div>

                  {showCheckoutDeliveryMap ? (
                    <div className="mt-3">
                      <AddressMap
                        address={deliveryAddress}
                        onAddressChange={(addr) => {
                          setDeliveryAddress(addr);
                          setLocationAutoDetected(true);
                        }}
                        onLocationChange={(lat, lng) => {
                          setDeliveryLat(lat);
                          setDeliveryLng(lng);
                          setLocationAutoDetected(true);
                        }}
                        selectedCoordinates={deliveryLat != null && deliveryLng != null ? [deliveryLat, deliveryLng] : null}
                      />
                    </div>
                  ) : null}
                  {!usingExternalDeliveryFlow && (
                    <div className="space-y-2">
                      <Label htmlFor="zone">Delivery Zone</Label>
                      <Select
                        value={selectedZoneId || undefined}
                        onValueChange={setSelectedZoneId}
                      >
                        <SelectTrigger id="zone" data-testid="select-zone">
                          <SelectValue placeholder="Select a zone" />
                        </SelectTrigger>
                        <SelectContent>
                        {deliveryZones.map((zone) => (
                          <SelectItem key={zone.id} value={zone.id}>
                            {zone.name} ({formatPrice(parseFloat(zone.fee))})
                          </SelectItem>
                        ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card data-testid="card-coupon">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5" />
                  Coupon Code
                </CardTitle>
                <CardDescription>Have a coupon? Apply it to get a discount</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {availableCoupons.length > 0 && !appliedCoupon ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Available coupons for this order</p>
                    <div className="flex flex-wrap gap-2">
                      {availableCoupons.map((coupon) => (
                        <button
                          key={coupon.id}
                          type="button"
                          onClick={() => handleQuickApplyCoupon(coupon)}
                          className="rounded-full border border-border/70 bg-muted/30 px-3 py-1.5 text-left text-xs transition hover:border-primary hover:bg-primary/5"
                          data-testid={`button-available-coupon-${coupon.id}`}
                        >
                          <span className="font-semibold">{coupon.code}</span>
                          <span className="ml-2 text-muted-foreground">
                            {coupon.discountType === "percentage"
                              ? `${coupon.discountValue}% off`
                              : `${formatPrice(parseFloat(coupon.discountValue || "0"))} off`}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {!appliedCoupon ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      onKeyPress={(e) => e.key === 'Enter' && handleApplyCoupon()}
                      disabled={validateCouponMutation.isPending || isRestoringCoupon}
                      data-testid="input-coupon"
                    />
                    <Button
                      onClick={handleApplyCoupon}
                      disabled={validateCouponMutation.isPending || isRestoringCoupon || !couponCode.trim()}
                      data-testid="button-apply-coupon"
                    >
                      {validateCouponMutation.isPending || isRestoringCoupon ? "Validating..." : "Apply"}
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100" data-testid="badge-coupon-applied">
                        {appliedCoupon.code}
                      </Badge>
                      <span className="text-sm font-medium text-green-700 dark:text-green-300" data-testid="text-coupon-discount">
                        {appliedCoupon.discountType === "percentage" 
                          ? `${appliedCoupon.discountValue}% off`
                          : `${formatPrice(parseFloat(appliedCoupon.discountValue))} off`}
                      </span>
                    </div>
                      {couponDiscount > 0 && (
                        <div className="mt-2 text-sm text-green-600 dark:text-green-400 font-medium" data-testid="text-coupon-amount">
                          -{formatPrice(couponDiscount)}
                        </div>
                      )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="md:col-span-1">
            <Card className="sticky top-4" data-testid="card-order-summary">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {itemsWithProducts.map((item) => {
                    const originalPrice = getOriginalDisplayPrice(item.product!);
                    const discountedPrice = getCurrentSellingPrice(item.product!);
                    const computedDiscount =
                      originalPrice > discountedPrice
                        ? Math.round(((originalPrice - discountedPrice) / originalPrice) * 100)
                        : 0;
                    const discount = computedDiscount > 0 ? computedDiscount : (item.product!.discount || 0);
                    const hasDiscount = discount > 0;
                    
                    return (
                      <div key={item.id} className="flex gap-3" data-testid={`summary-item-${item.id}`}>
                        <div className="flex-1 space-y-1">
                          <div className="text-sm font-medium line-clamp-2">{item.product!.name}</div>
                          <div className="text-sm text-muted-foreground">Qty: {item.quantity}</div>
                          {hasDiscount && (
                            <Badge variant="secondary" className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-100" data-testid={`badge-discount-${item.id}`}>
                              {discount}% OFF
                            </Badge>
                          )}
                        </div>
                        <div className="text-sm text-right flex flex-col justify-start">
                          {hasDiscount && (
                            <div className="text-muted-foreground line-through text-xs mb-1" data-testid={`text-original-price-${item.id}`}>
                              {formatPrice(originalPrice * item.quantity)}
                            </div>
                          )}
                          <div className={`font-medium ${hasDiscount ? 'text-green-600 dark:text-green-400' : ''}`} data-testid={`text-item-total-${item.id}`}>
                            {formatPrice(discountedPrice * item.quantity)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Items Total</span>
                    <span data-testid="text-checkout-original-subtotal">{formatPrice(originalSubtotal)}</span>
                  </div>
                  {productSavings > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span className="font-medium">Product Discounts</span>
                      <span data-testid="text-product-discounts">-{formatPrice(productSavings)}</span>
                    </div>
                  )}
                  {couponDiscount > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span className="font-medium">Coupon Discount</span>
                      <span data-testid="text-coupon-discount-summary">-{formatPrice(couponDiscount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span data-testid="text-checkout-subtotal">{formatPrice(discountedSubtotal)}</span>
                  </div>
                  {deliveryMethod !== "pickup" && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Delivery Fee</span>
                      <span data-testid="text-checkout-delivery">
                        {usingExternalDeliveryFlow ? "To be communicated" : formatPrice(deliveryFee)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Fee (Paystack {processingFeePercent.toFixed(2)}%)</span>
                    <span data-testid="text-checkout-processing">{formatPrice(processingFee)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span data-testid="text-checkout-total">{formatPrice(total)}</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md space-y-2">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100">
                    Available Payment Methods
                  </p>
                  <div className="space-y-2 text-xs text-blue-700 dark:text-blue-300">
                    <div className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4 shrink-0" />
                      <span>Card (Visa, Mastercard)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Landmark className="h-4 w-4 shrink-0" />
                      <span>Bank Transfer</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-4 w-4 shrink-0" />
                      <span>Mobile Money (MTN, Vodafone/Telecel, AirtelTigo)</span>
                    </div>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={isInlinePaymentBusy}
                  data-testid="button-pay"
                >
                  {isInlinePaymentBusy ? "Preparing secure payment..." : "Review & Pay"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  By placing your order, you agree to our terms and conditions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={isPaymentReviewOpen} onOpenChange={(open) => !isInlinePaymentBusy && setIsPaymentReviewOpen(open)}>
          <DialogContent className="flex max-h-[92vh] w-[min(96vw,34rem)] flex-col overflow-hidden border-border bg-background p-0 shadow-2xl">
          <div className="border-b border-primary/20 bg-primary/10 px-6 py-5 dark:bg-primary/12">
            <DialogHeader className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2">
                  <DialogTitle className="text-2xl font-semibold tracking-tight">Confirm Secure Payment</DialogTitle>
                  <DialogDescription className="max-w-md text-sm leading-6 text-muted-foreground">
                    Review your order total and continue with your checkout.
                  </DialogDescription>
                </div>
                <div className="rounded-2xl border border-border bg-card p-3 text-muted-foreground dark:text-foreground">
                  <ShieldCheck className="h-5 w-5" />
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">Paying now</p>
                  <p className="mt-2 text-3xl font-semibold text-foreground">{formatPrice(total)}</p>
                </div>
                <div className="text-right text-sm text-muted-foreground">
                  <p>{itemsWithProducts.length} item{itemsWithProducts.length === 1 ? "" : "s"}</p>
                  <p>{user?.email || "Signed-in customer"}</p>
                </div>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-border/70 bg-card/50 p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Items subtotal</span>
                <span className="font-medium">{formatPrice(subtotal)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex items-center justify-between text-sm text-primary">
                  <span>Coupon discount</span>
                  <span className="font-medium">-{formatPrice(couponDiscount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{formatPrice(discountedSubtotal)}</span>
              </div>
              {deliveryMethod !== "pickup" && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Delivery</span>
                  <span className="font-medium">
                    {usingExternalDeliveryFlow ? "Confirmed after checkout" : formatPrice(deliveryFee)}
                  </span>
                </div>
              )}

              {deliveryMethod === "pickup" && selectedPickupStation ? (
                <div className="flex items-start justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Pickup location</span>
                  <div className="text-right">
                    <div className="font-medium">{selectedPickupStation.name}</div>
                    <div className="text-muted-foreground">
                      {[selectedPickupStation.city, selectedPickupStation.region].filter(Boolean).join(", ")}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Paystack checkout fee</span>
                <span className="font-medium">{formatPrice(processingFee)}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
              <LockKeyhole className="h-4 w-4 shrink-0 text-primary" />
              <span>Secure payment powered by Paystack</span>
            </div>

            {(isLaunchingInlinePayment || isVerifyingInlinePayment) && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
                Please do not go back, refresh, or leave this page while we complete and confirm your payment.
              </div>
            )}

            <div className="flex justify-center pt-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 200 40"
                className="h-8 w-auto"
                role="img"
                aria-label="Paystack"
              >
                <rect width="200" height="40" rx="6" fill="#00B14F" />
                <text
                  x="100"
                  y="26"
                  fill="#FFFFFF"
                  fontFamily="Inter, Arial, sans-serif"
                  fontWeight="700"
                  fontSize="18"
                  textAnchor="middle"
                >
                  Paystack
                </text>
              </svg>
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 bg-muted/20 px-6 py-4 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsPaymentReviewOpen(false)}
              disabled={isInlinePaymentBusy}
              className="sm:min-w-[9rem]"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void submitCheckoutForInlinePayment()}
              disabled={isInlinePaymentBusy}
              className="sm:min-w-[12rem]"
            >
              {createOrderMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing payment...
                </>
              ) : isLaunchingInlinePayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening Paystack...
                </>
              ) : isVerifyingInlinePayment ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirming payment...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay {formatPrice(total)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLaunchingInlinePayment && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[min(92vw,24rem)] rounded-3xl border border-white/10 bg-background/95 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <h3 className="mt-4 text-xl font-semibold">Opening secure payment</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paystack is loading inside the app. Please complete your payment in the popup window that just opened.
            </p>
          </div>
        </div>
      )}

      {(isVerifyingInlinePayment || isRedirectingToSuccess) && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[min(92vw,28rem)] rounded-3xl border border-white/10 bg-background/95 p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="h-7 w-7 animate-spin" />
            </div>
            <h3 className="mt-4 text-xl font-semibold">
              {isRedirectingToSuccess ? "Payment confirmed" : "Confirming your payment"}
            </h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {isRedirectingToSuccess
                ? "Your payment is successful. Please stay on this page while we redirect you to the success page."
                : "Please do not go back, close this page, or refresh while we verify your payment and complete your order."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
