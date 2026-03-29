import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Package, Bike, Building2, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface PlatformSettings {
  processingFeePercent?: string;
}

function computeExactProcessingFee(chargeableBase: number, feeRate: number) {
  const normalizedBase = Math.max(0, chargeableBase);
  if (normalizedBase <= 0 || feeRate <= 0 || feeRate >= 1) return 0;
  return normalizedBase * feeRate / (1 - feeRate);
}

export default function Checkout() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { formatPrice } = useLanguage();
  const { data: settings } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "bus" | "rider">("pickup");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [deliveryZone, setDeliveryZone] = useState("");
  const [deliveryPhone, setDeliveryPhone] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  const mockCartItems = [
    { id: "1", name: "Designer Leather Handbag", price: 299.99, quantity: 1, image: "/placeholder.jpg" },
  ];

  const subtotal = mockCartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = deliveryMethod === "pickup" ? 0 : 0;
  const processingFeePercent = Number(settings?.processingFeePercent ?? "1.95");
  const processingFeeRate = Number.isFinite(processingFeePercent) ? processingFeePercent / 100 : 0.0195;
  const processingFee = computeExactProcessingFee(subtotal + deliveryFee, processingFeeRate);
  const total = subtotal + deliveryFee + processingFee;

  const handlePlaceOrder = async () => {
    if (deliveryMethod !== "pickup" && !deliveryAddress) {
      toast({
        title: "Missing Information",
        description: "Please provide a delivery address",
        variant: "destructive",
      });
      return;
    }

    if (deliveryMethod !== "pickup" && !deliveryPhone) {
      toast({
        title: "Missing Information",
        description: "Please provide a contact phone number",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);

    try {
      toast({
        title: "Order Placed Successfully",
        description: "Your order has been placed and is being processed",
      });
      
      setTimeout(() => {
        navigate("/track");
      }, 1500);
    } catch (error) {
      toast({
        title: "Order Failed",
        description: "Failed to place order. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
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
                        <div className="font-medium">VIP Bus Delivery</div>
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
                    Delivery Address
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
                    <Label htmlFor="zone">Delivery Zone</Label>
                    <Input
                      id="zone"
                      placeholder="e.g., Accra Central, Kumasi, Tema"
                      value={deliveryZone}
                      onChange={(e) => setDeliveryZone(e.target.value)}
                      data-testid="input-zone"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Contact Phone Number</Label>
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="Enter your contact phone number"
                      value={deliveryPhone}
                      onChange={(e) => setDeliveryPhone(e.target.value)}
                      data-testid="input-delivery-phone"
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="md:col-span-1">
            <Card className="sticky top-4" data-testid="card-order-summary">
              <CardHeader>
                <CardTitle>Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {mockCartItems.map((item) => (
                    <div key={item.id} className="flex gap-3" data-testid={`summary-item-${item.id}`}>
                      <div className="flex-1">
                        <div className="text-sm font-medium line-clamp-2">{item.name}</div>
                        <div className="text-sm text-muted-foreground">Qty: {item.quantity}</div>
                      </div>
                      <div className="text-sm font-medium">{formatPrice(item.price)}</div>
                    </div>
                  ))}
                </div>

                <Separator />

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span data-testid="text-checkout-subtotal">{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span data-testid="text-checkout-delivery">{formatPrice(deliveryFee)}</span>
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

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handlePlaceOrder}
                  disabled={isProcessing}
                  data-testid="button-pay"
                >
                  {isProcessing ? "Processing..." : "Pay"}
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
