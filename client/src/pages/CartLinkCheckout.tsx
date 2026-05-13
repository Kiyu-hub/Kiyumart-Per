import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShoppingCart, CheckCircle2, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CartLinkData {
  token: string;
  storeName: string;
  storeLogo: string | null;
  storeColor: string | null;
  items: Array<{ productId: string; name: string; price: number; image: string | null; quantity: number }>;
  totalAmount: string;
  note: string | null;
  expiresAt: string;
}

export default function CartLinkCheckout() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);

  const { data: cart, isLoading, error } = useQuery<CartLinkData>({
    queryKey: ["/api/cart-links", token],
    queryFn: () => fetchApiJson(`/api/cart-links/${token}`),
    enabled: !!token,
    retry: false,
  });

  const brandColor = cart?.storeColor || "#16a34a";

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orders/cart-checkout", {
        token,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        deliveryAddress: address.trim(),
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const { paystackConfig, orderNumber: oNum } = data;
      setOrderNumber(oNum);

      const PaystackPop = (window as any).PaystackPop;
      if (PaystackPop && paystackConfig) {
        const handler = PaystackPop.setup({
          ...paystackConfig,
          onClose: () => {
            toast({ title: "Payment cancelled", description: "You can try again.", variant: "destructive" });
          },
          callback: (response: any) => {
            if (response.status === "success" || response.status === "completed") {
              setOrderComplete(true);
            }
          },
        });
        handler.openIframe();
      } else {
        setOrderComplete(true);
      }
    },
    onError: (error: any) => {
      toast({ title: "Checkout failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!document.getElementById("paystack-inline-js")) {
      const script = document.createElement("script");
      script.id = "paystack-inline-js";
      script.src = "https://js.paystack.co/v2/inline.js";
      script.async = true;
      document.body.appendChild(script);
    }
  }, []);

  const subtotal = cart?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;
  const isExpired = cart ? new Date(cart.expiresAt) < new Date() : false;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !cart) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <p className="text-lg font-semibold">Cart link not found</p>
        <p className="text-sm text-muted-foreground">This link may have expired or been removed.</p>
      </div>
    );
  }

  if (isExpired) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <p className="text-lg font-semibold">Cart link expired</p>
        <p className="text-sm text-muted-foreground">Please ask the seller to generate a new cart link.</p>
      </div>
    );
  }

  if (orderComplete) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <CheckCircle2 className="h-16 w-16" style={{ color: brandColor }} />
        <p className="text-xl font-bold">Payment Successful!</p>
        {orderNumber && <p className="text-sm text-muted-foreground">Order #{orderNumber}</p>}
        <p className="text-sm text-muted-foreground max-w-xs">
          Your order has been placed. You'll receive updates via SMS or email.
        </p>
      </div>
    );
  }

  const canSubmit = name.trim() && phone.trim() && address.trim();

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* Store header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3">
        <div className="mx-auto flex max-w-md items-center gap-3">
          {cart.storeLogo ? (
            <img src={cart.storeLogo} alt={cart.storeName} className="h-8 w-8 rounded-full object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: brandColor }}>
              {cart.storeName[0]}
            </div>
          )}
          <span className="font-semibold text-sm">{cart.storeName}</span>
        </div>
      </div>

      <div className="mx-auto max-w-md space-y-5 px-4 pt-5">
        {/* Cart items */}
        <div className="rounded-xl border overflow-hidden">
          <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
            <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Your Order</p>
          </div>
          <div className="divide-y">
            {cart.items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                {item.image ? (
                  <img src={item.image} alt={item.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="h-12 w-12 rounded-lg bg-muted shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
                <p className="text-sm font-semibold" style={{ color: brandColor }}>
                  GHS {(item.price * item.quantity).toFixed(2)}
                </p>
              </div>
            ))}
          </div>
          <div className="border-t bg-muted/40 px-4 py-3 flex items-center justify-between">
            <p className="text-sm font-semibold">Total</p>
            <p className="text-base font-bold" style={{ color: brandColor }}>GHS {subtotal.toFixed(2)}</p>
          </div>
        </div>

        {cart.note && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-xs font-medium text-primary">Note from seller</p>
            <p className="text-sm mt-0.5">{cart.note}</p>
          </div>
        )}

        {/* Customer details */}
        <div className="space-y-3 rounded-xl border p-4">
          <p className="text-sm font-semibold">Your Details</p>
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs">Full Name *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ama Boateng" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="phone" className="text-xs">Phone Number *</Label>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+233 24 000 0000" type="tel" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs">Email (optional)</Label>
            <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" type="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs">Delivery Address *</Label>
            <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="House no. / street / area" />
          </div>
        </div>

        <Button
          className="w-full h-12 text-base font-semibold"
          style={{ backgroundColor: brandColor, color: "#fff" }}
          disabled={!canSubmit || checkoutMutation.isPending}
          onClick={() => checkoutMutation.mutate()}
        >
          {checkoutMutation.isPending ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing…</>
          ) : (
            `Pay GHS ${subtotal.toFixed(2)}`
          )}
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Secured by Paystack · Your payment is encrypted and protected
        </p>
      </div>
    </div>
  );
}
