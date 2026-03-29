import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Package, Bike, Building2, CreditCard, Info, Landmark, MapPin, Smartphone, Tag, X } from "lucide-react";
import AddressMap from "@/components/AddressMap";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { ensureMapboxRuntimeConfig, resolveMapboxAccessToken } from "@/tracking/mapbox/mapboxLoader";

interface CartItem {
  id: string;
  productId: string;
  quantity: number;
}

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  sellerId: string;
  discount: number | null;
}

interface DeliveryZone {
  id: string;
  name: string;
  fee: string;
}

interface Coupon {
  id: string;
  code: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumPurchase: string;
}

interface PlatformSettings {
  processingFeePercent?: string;
}

interface AddressSuggestion {
  label: string;
  lat: number;
  lng: number;
}

const ACCRA_REFERENCE: [number, number] = [5.6037, -0.187];
const VIP_BUS_KEYWORDS = [
  "ashanti",
  "kumasi",
  "northern",
  "tamale",
  "upper east",
  "bolgatanga",
  "upper west",
  "wa",
  "savannah",
  "damongo",
  "north east",
  "northeast",
  "volta",
  "ho",
  "oti",
  "sunyani",
  "bono",
  "bono east",
  "ahafo",
];

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function distanceFromAccraKm(lat: number, lng: number) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat - ACCRA_REFERENCE[0]);
  const dLng = toRadians(lng - ACCRA_REFERENCE[1]);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(ACCRA_REFERENCE[0])) *
      Math.cos(toRadians(lat)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function isInGhana(lat: number, lng: number) {
  return lat >= 4.5 && lat <= 11.5 && lng >= -3.5 && lng <= 1.5;
}

function computeExactProcessingFee(chargeableBase: number, feeRate: number) {
  const normalizedBase = Math.max(0, chargeableBase);
  if (normalizedBase <= 0 || feeRate <= 0 || feeRate >= 1) return 0;
  return normalizedBase * feeRate / (1 - feeRate);
}

function inferExternalDeliveryType(address: string, lat: number | null, lng: number | null): "third_party" | "bus" {
  const normalizedAddress = String(address || "").toLowerCase();
  if (VIP_BUS_KEYWORDS.some((keyword) => normalizedAddress.includes(keyword))) {
    return "bus";
  }
  if (lat != null && lng != null) {
    return distanceFromAccraKm(lat, lng) >= 120 ? "bus" : "third_party";
  }
  return "third_party";
}

export default function CheckoutConnected() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { formatPrice, currency } = useLanguage();
  const { isExternalRiderSystemEnabled, showCheckoutDeliveryMap, hasResolvedSettings } = usePlatformSettings();
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "bus" | "rider">("pickup");
  const [externalDeliveryType, setExternalDeliveryType] = useState<"third_party" | "bus">("third_party");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState(user?.phone || "");
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<AddressSuggestion[]>([]);
  const [isAddressSuggesting, setIsAddressSuggesting] = useState(false);
  const [showAddressSuggestions, setShowAddressSuggestions] = useState(false);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const previousExternalModeRef = useRef<boolean | null>(null);
  const suggestionDebounceRef = useRef<number | null>(null);
  const activeSuggestionRequestRef = useRef(0);
  const suppressNextSuggestionLookupRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const { data: cartItems = [] } = useQuery<CartItem[]>({
    queryKey: ["/api/cart"],
    enabled: isAuthenticated,
  });

  const { data: deliveryZones = [] } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/delivery-zones"],
    enabled: hasResolvedSettings && !isExternalRiderSystemEnabled,
  });

  const { data: cartProducts = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/cart/products", cartItems],
    queryFn: async () => {
      if (!cartItems.length) return [];
      const productsData = await Promise.all(
        cartItems.map(async (item) => {
          const res = await fetch(`/api/products/${item.productId}`);
          return res.json();
        })
      );
      return productsData;
    },
    enabled: cartItems.length > 0,
  });

  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });

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
    if (!hasResolvedSettings || !isExternalRiderSystemEnabled || deliveryMethod !== "rider") return;
    setExternalDeliveryType(inferExternalDeliveryType(deliveryAddress, deliveryLat, deliveryLng));
  }, [deliveryAddress, deliveryLat, deliveryLng, deliveryMethod, hasResolvedSettings, isExternalRiderSystemEnabled]);

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
    }, 350);

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
    mutationFn: async (data: { code: string; sellerId: string; orderTotal: string }) => {
      const res = await apiRequest("POST", "/api/coupons/validate", data);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.valid && data.coupon) {
        setAppliedCoupon(data.coupon);
        toast({
          title: "Coupon Applied",
          description: `${data.coupon.discountType === "percentage" ? `${data.coupon.discountValue}%` : formatPrice(parseFloat(data.coupon.discountValue))} discount applied successfully!`,
        });
      } else {
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

  const createOrderMutation = useMutation({
    mutationFn: async (orderData: any) => {
      const res = await apiRequest("POST", "/api/orders", orderData);
      return res.json();
    },
    onSuccess: async (data) => {
      try {
        // Detect multi-vendor checkout and use appropriate payment initialization
        const paymentPayload = data.isMultiVendor && data.checkoutSessionId
          ? { checkoutSessionId: data.checkoutSessionId }
          : { orderId: data.id };
        
        const paymentRes = await apiRequest("POST", "/api/payments/initialize", paymentPayload);
        const paymentData = await paymentRes.json();
        
        if (paymentData.authorization_url) {
          // Clear cart before redirecting to payment
          await queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
          window.location.href = paymentData.authorization_url;
        } else {
          throw new Error("Failed to initialize payment");
        }
      } catch (error: any) {
        toast({
          title: "Payment Initialization Failed",
          description: error.message || "Failed to initialize payment. Please try again.",
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Order Failed",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
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

  const calculateItemPrice = (product: Product) => {
    const originalPrice = parseFloat(product.price);
    if (product.discount && product.discount > 0) {
      return originalPrice * (1 - product.discount / 100);
    }
    return originalPrice;
  };

  const subtotal = itemsWithProducts.reduce((sum, item) => {
    const discountedPrice = calculateItemPrice(item.product!);
    return sum + (discountedPrice * item.quantity);
  }, 0);

  const productSavings = itemsWithProducts.reduce((sum, item) => {
    const originalPrice = parseFloat(item.product!.price);
    const discountedPrice = calculateItemPrice(item.product!);
    return sum + ((originalPrice - discountedPrice) * item.quantity);
  }, 0);

  const selectedZone = deliveryZones.find(z => z.id === selectedZoneId);
  const usingExternalDeliveryFlow = isExternalRiderSystemEnabled && deliveryMethod !== "pickup";
  const deliveryFee =
    deliveryMethod === "pickup"
      ? 0
      : usingExternalDeliveryFlow
        ? 0
        : selectedZone
          ? parseFloat(selectedZone.fee)
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
  const processingFeePercent = Number(settings?.processingFeePercent ?? "1.95");
  const processingFeeRate = Number.isFinite(processingFeePercent) ? processingFeePercent / 100 : 0.0195;
  const processingFee = computeExactProcessingFee(subtotal - couponDiscount + deliveryFee, processingFeeRate);
  const total = subtotal - couponDiscount + deliveryFee + processingFee;

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

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    toast({
      title: "Coupon Removed",
      description: "The coupon has been removed from your order",
    });
  };

  const handlePlaceOrder = async () => {
    if (deliveryMethod !== "pickup" && !deliveryAddress) {
      toast({
        title: "Missing Information",
        description: "Please provide a delivery address",
        variant: "destructive",
      });
      return;
    }

    if (!usingExternalDeliveryFlow && deliveryMethod !== "pickup" && !selectedZoneId) {
      toast({
        title: "Missing Information",
        description: "Please select a delivery zone",
        variant: "destructive",
      });
      return;
    }
    if (deliveryMethod !== "pickup" && (deliveryLat == null || deliveryLng == null)) {
      toast({
        title: "Location Required",
        description: usingExternalDeliveryFlow
          ? "Pin your exact delivery location on the map so customer service can coordinate external delivery."
          : "Pin your exact delivery location on the map so rider navigation works.",
        variant: "destructive",
      });
      return;
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
      return;
    }

    const sellerId = itemsWithProducts[0]?.product?.sellerId || user?.id;

    const orderData = {
      items: itemsWithProducts.map(item => {
        const discountedPrice = calculateItemPrice(item.product!);
        return {
          productId: item.productId,
          quantity: item.quantity,
          price: discountedPrice.toFixed(2),
          total: (discountedPrice * item.quantity).toFixed(2),
        };
      }),
      sellerId,
      deliveryMethod: usingExternalDeliveryFlow ? "rider" : deliveryMethod,
      externalDeliveryByBus: usingExternalDeliveryFlow ? externalDeliveryType === "bus" : false,
      externalDeliveryType: usingExternalDeliveryFlow ? externalDeliveryType : null,
      deliveryZoneId: usingExternalDeliveryFlow ? null : selectedZoneId || null,
      deliveryAddress: deliveryAddress || null,
      deliveryPhone: deliveryPhone || null,
      deliveryLatitude: deliveryLat,
      deliveryLongitude: deliveryLng,
      deliveryFee: deliveryFee.toFixed(2),
      subtotal: subtotal.toFixed(2),
      couponCode: appliedCoupon?.code || null,
      couponDiscount: couponDiscount > 0 ? couponDiscount.toFixed(2) : null,
      processingFee: processingFee.toFixed(2),
      total: total.toFixed(2),
      currency: currency,
    };

    createOrderMutation.mutate(orderData);
  };

  return (
    <div className="min-h-screen bg-background">
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
                  <div className="flex items-center space-x-3 p-4 border rounded-lg hover-elevate">
                    <RadioGroupItem value="pickup" id="pickup" data-testid="radio-pickup" />
                    <Label htmlFor="pickup" className="flex-1 cursor-pointer flex items-center gap-3">
                      <Package className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <div className="font-medium">Pickup</div>
                        <div className="text-sm text-muted-foreground">Collect from store - Free</div>
                      </div>
                    </Label>
                  </div>

                  {isExternalRiderSystemEnabled ? (
                    <>
                      <div className="flex items-center space-x-3 p-4 border rounded-lg hover-elevate">
                        <RadioGroupItem value="rider" id="external-delivery" data-testid="radio-external-delivery" />
                        <Label htmlFor="external-delivery" className="flex-1 cursor-pointer flex items-center gap-3">
                          <Bike className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Delivery</div>
                            <div className="text-sm text-muted-foreground">Customer support will coordinate the delivery arrangement</div>
                          </div>
                        </Label>
                      </div>

                      {deliveryMethod === "rider" && (
                        <div className="rounded-2xl border border-emerald-200 bg-card p-4 space-y-4 dark:border-emerald-500/20 dark:bg-[linear-gradient(180deg,rgba(12,18,20,0.96),rgba(9,14,16,0.98))]">
                          <div className="space-y-1">
                            <div className="font-medium">External Delivery</div>
                            <div className="text-sm text-muted-foreground">
                              Select how our customer support team should coordinate delivery after checkout.
                            </div>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            <button
                              type="button"
                              onClick={() => setExternalDeliveryType("third_party")}
                              className={`group rounded-2xl border p-4 text-left transition-all duration-200 ${
                                externalDeliveryType === "third_party"
                                  ? "border-emerald-500 bg-emerald-50 shadow-sm dark:border-emerald-400/70 dark:bg-[linear-gradient(180deg,rgba(11,77,64,0.88),rgba(8,46,38,0.94))] dark:shadow-[0_12px_30px_rgba(4,120,87,0.28)]"
                                  : "border-border bg-background hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(24,29,31,0.92),rgba(18,22,24,0.96))] dark:hover:border-emerald-300/35 dark:hover:bg-[linear-gradient(180deg,rgba(27,35,37,0.96),rgba(20,24,26,0.98))]"
                              }`}
                              data-testid="card-external-third-party-top"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-xl bg-emerald-100 p-2 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:ring-emerald-400/20">
                                    <Bike className="h-5 w-5 text-emerald-600 dark:text-emerald-300" />
                                  </div>
                                  <div>
                                    <div className="font-semibold text-base text-foreground dark:text-white">Third-Party Delivery</div>
                                    <div className="text-xs text-emerald-700 dark:text-emerald-200/80">Yango, Uber, Bolt and similar services</div>
                                  </div>
                                </div>
                                <Checkbox
                                  checked={externalDeliveryType === "third_party"}
                                  className="pointer-events-none border-emerald-300 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 dark:border-white/35"
                                />
                              </div>
                              <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-slate-200/85">
                                Suitable for Accra and nearby destinations. We will arrange a trusted third-party delivery service such as Yango, Uber, or Bolt and confirm the delivery charge with you before dispatch.
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setExternalDeliveryType("bus")}
                              className={`group rounded-2xl border p-4 text-left transition-all duration-200 ${
                                externalDeliveryType === "bus"
                                  ? "border-lime-500 bg-lime-50 shadow-sm dark:border-emerald-400/70 dark:bg-[linear-gradient(180deg,rgba(61,77,19,0.88),rgba(30,43,10,0.94))] dark:shadow-[0_12px_30px_rgba(101,163,13,0.22)]"
                                  : "border-border bg-background hover:border-lime-300 hover:bg-lime-50/50 dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(24,29,31,0.92),rgba(18,22,24,0.96))] dark:hover:border-emerald-300/35 dark:hover:bg-[linear-gradient(180deg,rgba(27,35,37,0.96),rgba(20,24,26,0.98))]"
                              }`}
                              data-testid="card-external-bus-top"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <div className="rounded-xl bg-lime-100 p-2 ring-1 ring-lime-200 dark:bg-lime-300/10 dark:ring-lime-300/20">
                                    <Building2 className="h-5 w-5 text-lime-700 dark:text-lime-200" />
                                  </div>
                                  <div>
                                    <div className="font-semibold text-base text-foreground dark:text-white">VIP Bus Delivery</div>
                                    <div className="text-xs text-lime-700 dark:text-lime-100/80">Long-distance regional delivery support</div>
                                  </div>
                                </div>
                                <Checkbox
                                  checked={externalDeliveryType === "bus"}
                                  className="pointer-events-none border-lime-300 data-[state=checked]:bg-lime-500 data-[state=checked]:border-lime-500 dark:border-white/35"
                                />
                              </div>
                              <p className="mt-3 text-sm leading-6 text-muted-foreground dark:text-slate-200/85">
                                Suitable for deliveries from Accra to regions such as Ashanti, Northern, Upper East, Upper West, Volta, and other distant areas. We will confirm the station details, handover process, and final delivery cost with you before dispatch.
                              </p>
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center space-x-3 p-4 border rounded-lg hover-elevate">
                        <RadioGroupItem value="bus" id="bus" data-testid="radio-bus" />
                        <Label htmlFor="bus" className="flex-1 cursor-pointer flex items-center gap-3">
                          <Building2 className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <div className="font-medium">Bus Delivery</div>
                            <div className="text-sm text-muted-foreground">Delivered via bus</div>
                          </div>
                        </Label>
                      </div>

                      <div className="flex items-center space-x-3 p-4 border rounded-lg hover-elevate">
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
                    <div
                      className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm space-y-4 dark:border-amber-500/30 dark:bg-[linear-gradient(135deg,rgba(120,84,32,0.18),rgba(29,22,12,0.62))] dark:shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
                      data-testid="external-delivery-notice"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 ring-1 ring-amber-200 dark:bg-amber-400/15 dark:ring-amber-400/25">
                          <Info className="h-5 w-5 text-amber-700 dark:text-amber-300" />
                        </div>
                        <div className="space-y-3 flex-1">
                          <div className="max-w-3xl space-y-1">
                            <p className="text-sm font-semibold text-amber-900 dark:text-amber-50">
                              Delivery will be arranged after checkout.
                            </p>
                            <p className="max-w-3xl text-sm leading-relaxed text-amber-800 dark:text-amber-100/85">
                              Once your order is placed, our customer support team will contact you to confirm the most suitable delivery arrangement and share the final delivery cost before dispatch.
                            </p>
                          </div>
                          <div className="max-w-3xl rounded-xl border border-amber-200 bg-white/70 p-3 text-sm text-amber-900 dark:border-white/10 dark:bg-black/15 dark:text-amber-50/90">
                            {externalDeliveryType === "bus"
                              ? "VIP bus delivery has been selected. Our team will guide you on the station details, handover plan, and final delivery cost."
                              : "Third-party delivery has been selected. Our team will arrange a suitable delivery service and confirm the final delivery cost with you."}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative space-y-2">
                    <Label htmlFor="address">Full Address</Label>
                    <Input
                      id="address"
                      placeholder="Enter your full delivery address"
                      value={deliveryAddress}
                      onChange={(e) => {
                        setDeliveryAddress(e.target.value);
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
                    {showAddressSuggestions && deliveryMethod !== "pickup" && deliveryAddress.trim().length >= 3 ? (
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
                      placeholder="Enter your phone number for delivery"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      data-testid="input-delivery-phone"
                    />
                  </div>

                  {showCheckoutDeliveryMap ? (
                    <div className="mt-3">
                      <AddressMap
                        address={deliveryAddress}
                        onAddressChange={(addr) => setDeliveryAddress(addr)}
                        onLocationChange={(lat, lng) => {
                          setDeliveryLat(lat);
                          setDeliveryLng(lng);
                        }}
                        selectedCoordinates={deliveryLat != null && deliveryLng != null ? [deliveryLat, deliveryLng] : null}
                      />
                    </div>
                  ) : null}
                  {!usingExternalDeliveryFlow && (
                    <div className="space-y-2">
                      <Label htmlFor="zone">Delivery Zone</Label>
                      <select
                        id="zone"
                        className="w-full h-10 px-3 rounded-md border border-input bg-background"
                        value={selectedZoneId}
                        onChange={(e) => setSelectedZoneId(e.target.value)}
                        data-testid="select-zone"
                      >
                        <option value="">Select a zone</option>
                        {deliveryZones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name} ({formatPrice(parseFloat(zone.fee))})
                          </option>
                        ))}
                      </select>
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
                {!appliedCoupon ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Enter coupon code"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      onKeyPress={(e) => e.key === 'Enter' && handleApplyCoupon()}
                      disabled={validateCouponMutation.isPending}
                      data-testid="input-coupon"
                    />
                    <Button
                      onClick={handleApplyCoupon}
                      disabled={validateCouponMutation.isPending || !couponCode.trim()}
                      data-testid="button-apply-coupon"
                    >
                      {validateCouponMutation.isPending ? "Validating..." : "Apply"}
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleRemoveCoupon}
                      className="h-8 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                      data-testid="button-remove-coupon"
                    >
                      <X className="h-4 w-4" />
                    </Button>
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
                    const originalPrice = parseFloat(item.product!.price);
                    const discountedPrice = calculateItemPrice(item.product!);
                    const discount = item.product!.discount || 0;
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
                    <span className="text-muted-foreground">Subtotal</span>
                    <span data-testid="text-checkout-subtotal">{formatPrice(subtotal)}</span>
                  </div>
                  {productSavings > 0 && (
                    <div className="flex justify-between text-green-600 dark:text-green-400">
                      <span className="font-medium">Product Discounts</span>
                      <span data-testid="text-product-discounts">-{formatPrice(productSavings)}</span>
                    </div>
                  )}
                  {/* Coupon discount is shown inline with the coupon code card only */}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span data-testid="text-checkout-delivery">
                      {usingExternalDeliveryFlow ? "To be communicated" : formatPrice(deliveryFee)}
                    </span>
                  </div>
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
                  disabled={createOrderMutation.isPending}
                  data-testid="button-pay"
                >
                  {createOrderMutation.isPending ? "Processing..." : "Pay"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  By placing your order, you agree to our terms and conditions
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
