import { useState, useEffect } from "react";
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
import { ArrowLeft, Package, Bike, Building2, MapPin, Tag, X } from "lucide-react";
import AddressMap from "@/components/AddressMap";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

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

export default function CheckoutConnected() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { formatPrice, currency } = useLanguage();
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "bus" | "rider">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState(user?.phone || "");
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);

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
  // Show full delivery fee for all delivery methods (bus and rider get same fee)
  const deliveryFee = deliveryMethod === "pickup" ? 0 : 
                      selectedZone ? parseFloat(selectedZone.fee) : 0;

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
  const processingFee = (subtotal - couponDiscount + deliveryFee) * 0.0195;
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

    if (deliveryMethod !== "pickup" && !selectedZoneId) {
      toast({
        title: "Missing Information",
        description: "Please select a delivery zone",
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
      deliveryMethod,
      deliveryZoneId: selectedZoneId || null,
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
                <CardDescription>Choose how you want to receive your order</CardDescription>
              </CardHeader>
              <CardContent>
                <RadioGroup
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
                </RadioGroup>
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
                  <div className="space-y-2">
                    <Label htmlFor="address">Full Address</Label>
                    <Input
                      id="address"
                      placeholder="Enter your full delivery address"
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      data-testid="input-address"
                    />
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

                  {/* Live map tied to the address input. Map updates address and vice-versa. */}
                  <div className="mt-3">
                    <AddressMap
                      address={deliveryAddress}
                      onAddressChange={(addr) => setDeliveryAddress(addr)}
                      onLocationChange={(lat, lng, addr) => {
                        // Keep deliveryAddress in sync; if reverse geocode returns a value prefer it
                        if (addr) setDeliveryAddress(addr);
                        setDeliveryLat(lat);
                        setDeliveryLng(lng);
                      }}
                    />
                  </div>
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
                    <span data-testid="text-checkout-delivery">{formatPrice(deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processing Fee (1.95%)</span>
                    <span data-testid="text-checkout-processing">{formatPrice(processingFee)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-lg font-bold">
                    <span>Total</span>
                    <span data-testid="text-checkout-total">{formatPrice(total)}</span>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-xs font-medium text-blue-900 dark:text-blue-100 mb-2">
                    💳 Available Payment Methods:
                  </p>
                  <ul className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                    <li>• Card (Visa, Mastercard)</li>
                    <li>• Bank Transfer</li>
                    <li>• Mobile Money (MTN, Vodafone/Telecel, AirtelTigo)</li>
                  </ul>
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
