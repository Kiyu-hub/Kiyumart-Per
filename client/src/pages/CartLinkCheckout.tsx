import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShoppingCart, CheckCircle2, AlertTriangle, Download, Share2, X, MapPin, Navigation, Phone, Mail, MessageSquare, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

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

interface CompletedOrder {
  orderNumber: string;
  storeName: string;
  items: CartLinkData["items"];
  subtotal: number;
  address: string;
  date: string;
}

function ReceiptScreen({
  order,
  brandColor,
  onClose,
}: {
  order: CompletedOrder;
  brandColor: string;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { contactEmail, contactPhone, platformName } = usePlatformSettings();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const itemLines = order.items.map((it) => `  • ${it.name} × ${it.quantity}  GHS ${(it.price * it.quantity).toFixed(2)}`).join("\n");
  const receiptText = [
    `===== ORDER RECEIPT =====`,
    `${platformName}`,
    ``,
    `Order #${order.orderNumber}`,
    `Date: ${order.date}`,
    `Store: ${order.storeName}`,
    ``,
    `Items:`,
    itemLines,
    ``,
    `Total Paid: GHS ${order.subtotal.toFixed(2)}`,
    ``,
    `Delivery Address: ${order.address}`,
    ``,
    `=========================`,
    `Need Help?`,
    contactEmail ? `Email: ${contactEmail}` : "",
    contactPhone ? `Phone: ${contactPhone}` : "",
    `=========================`,
  ].filter(Boolean).join("\n");

  const handleDownload = () => {
    const blob = new Blob([receiptText], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${order.orderNumber}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Receipt downloaded" });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: `Order Receipt #${order.orderNumber}`, text: receiptText });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(receiptText);
      toast({ title: "Receipt copied to clipboard" });
    }
  };

  const handleSubmitFeedback = () => {
    setSubmitted(true);
    toast({ title: "Thank you for your feedback!" });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" style={{ color: brandColor }} />
          <span className="font-semibold text-sm">Payment Successful</span>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-muted transition-colors" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
        {/* Success badge */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="rounded-full p-4" style={{ backgroundColor: `${brandColor}22` }}>
            <CheckCircle2 className="h-12 w-12" style={{ color: brandColor }} />
          </div>
          <p className="text-xl font-bold">Order Confirmed!</p>
          <p className="text-sm text-muted-foreground text-center">Your order has been placed. You'll receive updates via SMS or email.</p>
        </div>

        {/* Receipt card */}
        <div className="rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30">Receipt</div>
          <div className="p-4 space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Order #</span>
              <span className="font-semibold">{order.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>{order.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Store</span>
              <span>{order.storeName}</span>
            </div>
            <div className="border-t pt-3 space-y-1.5">
              {order.items.map((item, i) => (
                <div key={i} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{item.name} × {item.quantity}</span>
                  <span>GHS {(item.price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t pt-3 flex justify-between font-bold">
              <span>Total Paid</span>
              <span style={{ color: brandColor }}>GHS {order.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right max-w-[60%]">{order.address}</span>
            </div>
          </div>
        </div>

        {/* Download / Share */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="gap-2" onClick={handleDownload}>
            <Download className="h-4 w-4" />Download
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleShare}>
            <Share2 className="h-4 w-4" />Share
          </Button>
        </div>

        {/* Experience feedback */}
        {!submitted ? (
          <div className="rounded-2xl border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-semibold">How was your experience?</p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} type="button" onClick={() => setRating(s)}>
                  <Star className={`h-6 w-6 ${s <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`} />
                </button>
              ))}
            </div>
            <Textarea
              placeholder="Leave a comment (optional)…"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              className="resize-none text-sm"
            />
            <Button className="w-full" style={{ backgroundColor: brandColor }} onClick={handleSubmitFeedback}>
              Submit Feedback
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border p-4 flex items-center gap-3 bg-muted/30">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <p className="text-sm text-muted-foreground">Thank you for your feedback!</p>
          </div>
        )}

        {/* Contact info */}
        <div className="rounded-2xl border p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Need Help?</p>
          {contactEmail && (
            <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 text-sm hover:underline">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />{contactEmail}
            </a>
          )}
          {contactPhone && (
            <a href={`tel:${contactPhone}`} className="flex items-center gap-2 text-sm hover:underline">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />{contactPhone}
            </a>
          )}
          {!contactEmail && !contactPhone && (
            <p className="text-sm text-muted-foreground">Contact {platformName} support for assistance.</p>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />Close
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-4">Secured by Paystack · Your payment is encrypted</p>
      </div>
    </div>
  );
}

export default function CartLinkCheckout() {
  const { token } = useParams<{ token: string }>();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [locating, setLocating] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);

  const { data: cart, isLoading, error } = useQuery<CartLinkData>({
    queryKey: ["/api/cart-links", token],
    queryFn: () => fetchApiJson(`/api/cart-links/${token}`),
    enabled: !!token,
    retry: false,
  });

  const brandColor = cart?.storeColor || "#16a34a";
  const subtotal = cart?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;

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

      const completeOrder = () => {
        setCompletedOrder({
          orderNumber: oNum || "N/A",
          storeName: cart?.storeName ?? "",
          items: cart?.items ?? [],
          subtotal,
          address: address.trim(),
          date: new Date().toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" }),
        });
      };

      const PaystackPop = (window as any).PaystackPop;
      if (PaystackPop && paystackConfig) {
        const handler = PaystackPop.setup({
          ...paystackConfig,
          onClose: () => {
            toast({ title: "Payment cancelled", description: "You can try again.", variant: "destructive" });
          },
          callback: (response: any) => {
            if (response.status === "success" || response.status === "completed") {
              completeOrder();
            }
          },
        });
        handler.openIframe();
      } else {
        completeOrder();
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

  const handleUseLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "Location not supported", description: "Your browser doesn't support location access.", variant: "destructive" });
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=en`,
            { headers: { "User-Agent": "KiyuMart/1.0" } }
          );
          if (res.ok) {
            const data = await res.json();
            setAddress(data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
            toast({ title: "Location detected", description: "Delivery address updated." });
          } else {
            setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
        } catch {
          setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        toast({ title: "Location access denied", description: "Please enter your address manually.", variant: "destructive" });
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }, [toast]);

  const isExpired = cart ? new Date(cart.expiresAt) < new Date() : false;

  if (completedOrder) {
    return <ReceiptScreen order={completedOrder} brandColor={brandColor} onClose={() => window.location.href = "/"} />;
  }

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
                <p className="text-sm font-semibold" style={{ color: brandColor }}>GHS {(item.price * item.quantity).toFixed(2)}</p>
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
          {/* Delivery address with geolocation */}
          <div className="space-y-1.5">
            <Label htmlFor="address" className="text-xs">Delivery Address *</Label>
            <div className="flex gap-2">
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House no. / street / area"
                className="flex-1"
              />
              <button
                type="button"
                onClick={handleUseLocation}
                disabled={locating}
                title="Use my current location"
                className="shrink-0 flex items-center justify-center h-10 w-10 rounded-lg border hover:bg-muted transition-colors disabled:opacity-50"
              >
                {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="h-3 w-3 shrink-0" />
              Tap <Navigation className="h-3 w-3 inline mx-0.5" /> to use your GPS location for accurate delivery.
            </p>
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
