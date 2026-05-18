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
  mode?: "prefilled" | "browse";
  sellerId?: string;
  storeId?: string;
  storeName: string;
  storeLogo: string | null;
  storeColor: string | null;
  storeTagline?: string | null;
  items: Array<{ productId: string; name: string; price: number; image: string | null; quantity: number }>;
  totalAmount: string;
  note: string | null;
  expiresAt: string;
}

interface BrowseCatalogItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string | null;
  category: string | null;
  stock: number | null;
}

interface CompletedOrder {
  orderNumber: string;
  storeName: string;
  items: CartLinkData["items"];
  subtotal: number;
  address: string;
  date: string;
}

async function generateCartReceiptPdf(order: CompletedOrder, brandColor: string, platformName: string, contactEmail?: string | null, contactPhone?: string | null, logoUrl?: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const col = brandColor.startsWith("#") ? brandColor : "#16a34a";
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);

  // Header band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 28, "F");

  let headerY = 10;
  if (logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve(); img.onerror = () => reject();
        img.src = logoUrl; setTimeout(() => reject(), 3000);
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 120; canvas.height = img.naturalHeight || 120;
      const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0);
      doc.addImage(canvas.toDataURL("image/png"), "PNG", (W - 14) / 2, 5, 14, 14);
      headerY = 21;
    } catch { headerY = 10; }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(logoUrl ? 9 : 14);
  doc.setFont("helvetica", "bold");
  doc.text(platformName || "Order Receipt", W / 2, headerY + (logoUrl ? 0 : 4), { align: "center" });

  doc.setTextColor(r, g, b);
  doc.setFontSize(13);
  doc.text("Payment Receipt", W / 2, 38, { align: "center" });
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(14, 41, W - 14, 41);

  let y = 48;
  doc.setFontSize(9);
  const meta: [string, string][] = [
    ["Order #", order.orderNumber],
    ["Date", order.date],
    ["Store", order.storeName],
    ["Address", order.address],
  ];
  meta.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal"); doc.setTextColor(120, 120, 120); doc.text(label, 14, y);
    doc.setFont("helvetica", "bold"); doc.setTextColor(30, 30, 30);
    const wrapped = doc.splitTextToSize(value, W - 60);
    doc.text(wrapped, W - 14, y, { align: "right" });
    y += wrapped.length > 1 ? wrapped.length * 5 + 3 : 8;
  });

  // Items
  doc.setDrawColor(220, 220, 220); doc.setLineWidth(0.3); doc.line(14, y, W - 14, y); y += 5;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(100, 100, 100); doc.text("ITEMS", 14, y); y += 5;
  order.items.forEach((item) => {
    doc.setFont("helvetica", "normal"); doc.setTextColor(40, 40, 40); doc.setFontSize(8.5);
    doc.text(`${item.name} × ${item.quantity}`, 14, y);
    doc.setFont("helvetica", "bold");
    doc.text(`GHS ${(item.price * item.quantity).toFixed(2)}`, W - 14, y, { align: "right" });
    y += 6;
  });

  // Total
  doc.setLineWidth(0.3); doc.setDrawColor(220, 220, 220); doc.line(14, y, W - 14, y); y += 6;
  doc.setFontSize(11); doc.setFont("helvetica", "normal"); doc.setTextColor(80, 80, 80); doc.text("Total Paid", 14, y);
  doc.setFont("helvetica", "bold"); doc.setTextColor(r, g, b);
  doc.text(`GHS ${order.subtotal.toFixed(2)}`, W - 14, y, { align: "right" }); y += 12;

  if (contactEmail || contactPhone) {
    doc.setFontSize(8); doc.setFont("helvetica", "bold"); doc.setTextColor(120, 120, 120); doc.text("NEED HELP?", 14, y); y += 5;
    doc.setFont("helvetica", "normal"); doc.setTextColor(50, 50, 50);
    if (contactEmail) { doc.text(contactEmail, 14, y); y += 5; }
    if (contactPhone) { doc.text(contactPhone, 14, y); y += 5; }
  }

  doc.setFillColor(r, g, b); doc.rect(0, H - 12, W, 12, "F");
  doc.setFontSize(7); doc.setFont("helvetica", "normal"); doc.setTextColor(255, 255, 255);
  doc.text("Secured by Paystack", W / 2, H - 5, { align: "center" });

  return doc.output("blob");
}

function ReceiptScreen({
  order,
  brandColor,
  logoUrl,
  onClose,
}: {
  order: CompletedOrder;
  brandColor: string;
  logoUrl?: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { contactEmail, contactPhone, platformName } = usePlatformSettings();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const itemLines = order.items.map((it) => `  • ${it.name} × ${it.quantity}  GHS ${(it.price * it.quantity).toFixed(2)}`).join("\n");
  const receiptText = [
    `Order #${order.orderNumber}`,
    `Date: ${order.date}`,
    `Store: ${order.storeName}`,
    itemLines,
    `Total Paid: GHS ${order.subtotal.toFixed(2)}`,
    `Address: ${order.address}`,
    contactEmail ? `Email: ${contactEmail}` : "",
    contactPhone ? `Phone: ${contactPhone}` : "",
  ].filter(Boolean).join("\n");

  const handleDownload = async () => {
    setGeneratingPdf(true);
    try {
      const blob = await generateCartReceiptPdf(order, brandColor, platformName || "KiyuMart", contactEmail, contactPhone, logoUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `receipt-${order.orderNumber}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF receipt downloaded" });
    } catch {
      const blob = new Blob([receiptText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `receipt-${order.orderNumber}.txt`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Receipt downloaded" });
    } finally { setGeneratingPdf(false); }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        setGeneratingPdf(true);
        const blob = await generateCartReceiptPdf(order, brandColor, platformName || "KiyuMart", contactEmail, contactPhone, logoUrl);
        const file = new File([blob], `receipt-${order.orderNumber}.pdf`, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Receipt #${order.orderNumber}` });
          return;
        }
        await navigator.share({ title: `Order Receipt #${order.orderNumber}`, text: receiptText });
      } catch { /* user cancelled */ } finally { setGeneratingPdf(false); }
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
          <Button variant="outline" className="gap-2" onClick={handleDownload} disabled={generatingPdf}>
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}PDF Receipt
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleShare} disabled={generatingPdf}>
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
  const [paymentSummary, setPaymentSummary] = useState<{
    subtotal: number; processingFee: number; finalTotal: number;
    cfg: any; orderNumber: string;
  } | null>(null);
  const [confirmingPay, setConfirmingPay] = useState(false);

  const { data: cart, isLoading, error } = useQuery<CartLinkData>({
    queryKey: ["/api/cart-links", token],
    queryFn: () => fetchApiJson(`/api/cart-links/${token}`),
    enabled: !!token,
    retry: false,
  });

  const isBrowseMode = cart?.mode === "browse";

  // ── Browse-mode state — buyer picks items from the seller's catalog ────────
  const { data: catalog = [], isLoading: catalogLoading } = useQuery<BrowseCatalogItem[]>({
    queryKey: ["/api/cart-links", token, "catalog"],
    queryFn: () => fetchApiJson<{ items: BrowseCatalogItem[] }>(`/api/cart-links/${token}/catalog`)
      .then((d) => d.items),
    enabled: !!token && isBrowseMode,
    retry: false,
  });
  const [browseQty, setBrowseQty] = useState<Record<string, number>>({});
  const browseSearch = useState("");
  const [browseSearchText, setBrowseSearchText] = browseSearch;

  const visibleCatalog = browseSearchText.trim()
    ? catalog.filter((p) => p.name.toLowerCase().includes(browseSearchText.toLowerCase()))
    : catalog;

  const selectedBrowseItems = catalog
    .map((p) => ({ product: p, qty: browseQty[p.id] || 0 }))
    .filter((entry) => entry.qty > 0);

  const incBrowse = useCallback((productId: string) => {
    setBrowseQty((prev) => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  }, []);
  const decBrowse = useCallback((productId: string) => {
    setBrowseQty((prev) => {
      const next = { ...prev };
      const current = next[productId] || 0;
      if (current <= 1) {
        delete next[productId];
      } else {
        next[productId] = current - 1;
      }
      return next;
    });
  }, []);

  const brandColor = cart?.storeColor || "#16a34a";
  const frontendSubtotal = isBrowseMode
    ? selectedBrowseItems.reduce((sum, e) => sum + e.product.price * e.qty, 0)
    : cart?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orders/cart-checkout", {
        token,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        deliveryAddress: address.trim(),
        selectedItems: isBrowseMode
          ? selectedBrowseItems.map((e) => ({ productId: e.product.id, quantity: e.qty }))
          : undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        return;
      }
      // Show payment breakdown to user BEFORE opening Paystack
      setPaymentSummary({
        subtotal: parseFloat(data.subtotal ?? String(frontendSubtotal)),
        processingFee: parseFloat(data.processingFee ?? "0"),
        finalTotal: data.finalTotal,
        cfg: data.paystackConfig,
        orderNumber: data.orderNumber || "N/A",
      });
    },
    onError: (error: any) => {
      toast({ title: "Checkout failed", description: error?.message || "Please try again.", variant: "destructive" });
    },
  });

  const handleConfirmPay = async () => {
    if (!paymentSummary) return;
    setConfirmingPay(true);
    const { cfg, orderNumber, finalTotal } = paymentSummary;
    const PaystackPop = (window as any).PaystackPop;
    if (PaystackPop && cfg) {
      const handler = PaystackPop.setup({
        ...cfg,
        onClose: () => {
          toast({ title: "Payment cancelled", description: "You can try again.", variant: "destructive" });
          setConfirmingPay(false);
          setPaymentSummary(null);
        },
        callback: (response: any) => {
          if (response.status === "success" || response.status === "completed") {
            const items: CompletedOrder["items"] = isBrowseMode
              ? selectedBrowseItems.map((e) => ({
                  productId: e.product.id,
                  name: e.product.name,
                  price: e.product.price,
                  image: e.product.image,
                  quantity: e.qty,
                }))
              : cart?.items ?? [];
            setPaymentSummary(null);
            setCompletedOrder({
              orderNumber,
              storeName: cart?.storeName ?? "",
              items,
              subtotal: finalTotal,
              address: address.trim(),
              date: new Date().toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" }),
            });
          }
          setConfirmingPay(false);
        },
      });
      handler.openIframe();
    } else {
      setConfirmingPay(false);
    }
  };

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
          const res = await fetch(`/api/public/geocode/reverse?lat=${latitude}&lon=${longitude}`);
          const data = await res.json();
          setAddress(data.display_name || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          toast({ title: "Location detected", description: "Delivery address updated." });
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
    return <ReceiptScreen order={completedOrder} brandColor={brandColor} logoUrl={cart?.storeLogo || null} onClose={() => window.location.href = "/"} />;
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

  const canSubmit = Boolean(
    name.trim() &&
    phone.trim() &&
    address.trim() &&
    (!isBrowseMode || selectedBrowseItems.length > 0),
  );

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
        {isBrowseMode ? (
          // ── Browse mode — buyer picks items from the seller's catalog ──
          <div className="rounded-xl border overflow-hidden">
            <div className="bg-muted/40 px-4 py-2.5 flex items-center gap-2">
              <ShoppingCart className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {cart.storeName}'s Catalog
              </p>
            </div>
            <div className="border-b px-3 py-2">
              <Input
                placeholder="Search products…"
                value={browseSearchText}
                onChange={(e) => setBrowseSearchText(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="max-h-[360px] overflow-y-auto divide-y">
              {catalogLoading ? (
                <div className="py-8 flex items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : visibleCatalog.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No products available in this store.
                </p>
              ) : (
                visibleCatalog.map((p) => {
                  const qty = browseQty[p.id] || 0;
                  return (
                    <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                      {p.image ? (
                        <img src={p.image} alt={p.name} className="h-12 w-12 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-lg bg-muted shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs font-semibold" style={{ color: brandColor }}>GHS {p.price.toFixed(2)}</p>
                      </div>
                      {qty > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => decBrowse(p.id)}
                            className="h-7 w-7 rounded-full border flex items-center justify-center hover:bg-muted"
                            aria-label="Decrease quantity"
                          >
                            <span className="text-sm font-bold">−</span>
                          </button>
                          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                          <button
                            type="button"
                            onClick={() => incBrowse(p.id)}
                            className="h-7 w-7 rounded-full text-white flex items-center justify-center"
                            style={{ backgroundColor: brandColor }}
                            aria-label="Increase quantity"
                          >
                            <span className="text-sm font-bold">+</span>
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => incBrowse(p.id)}
                          className="h-7 px-3 text-xs font-semibold rounded-full text-white"
                          style={{ backgroundColor: brandColor }}
                        >
                          Add
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <div className="border-t bg-muted/40 px-4 py-3 flex items-center justify-between">
              <p className="text-sm font-semibold">
                Subtotal ({selectedBrowseItems.reduce((n, e) => n + e.qty, 0)} items)
              </p>
              <p className="text-base font-bold" style={{ color: brandColor }}>
                GHS {frontendSubtotal.toFixed(2)}
              </p>
            </div>
          </div>
        ) : (
          // ── Pre-filled mode — locked-in items ──
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
              <p className="text-sm font-semibold">Subtotal</p>
              <p className="text-base font-bold" style={{ color: brandColor }}>GHS {frontendSubtotal.toFixed(2)}</p>
            </div>
          </div>
        )}

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

        {/* Payment Summary Confirmation */}
        {paymentSummary && (
          <div className="rounded-2xl border-2 overflow-hidden" style={{ borderColor: brandColor + "40" }}>
            <div className="px-4 py-3 text-xs font-bold uppercase tracking-wide text-white" style={{ backgroundColor: brandColor }}>
              Payment Summary
            </div>
            <div className="p-4 space-y-2.5 text-sm bg-background">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  Items ({isBrowseMode ? selectedBrowseItems.length : (cart?.items.length ?? 0)})
                </span>
                <span className="font-semibold">GHS {paymentSummary.subtotal.toFixed(2)}</span>
              </div>
              {paymentSummary.processingFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Processing fee</span>
                  <span className="font-semibold">GHS {paymentSummary.processingFee.toFixed(2)}</span>
                </div>
              )}
              <div className="border-t pt-2.5 flex justify-between font-bold text-base">
                <span>Total you&apos;ll pay</span>
                <span style={{ color: brandColor }}>GHS {paymentSummary.finalTotal.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                This is the exact amount Paystack will charge your card / mobile money.
              </p>
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setPaymentSummary(null)}
                  disabled={confirmingPay}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 rounded-xl font-bold"
                  style={{ backgroundColor: brandColor, color: "#fff" }}
                  onClick={handleConfirmPay}
                  disabled={confirmingPay}
                >
                  {confirmingPay
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Opening…</>
                    : <>Confirm &amp; Pay GHS {paymentSummary.finalTotal.toFixed(2)}</>
                  }
                </Button>
              </div>
            </div>
          </div>
        )}

        {!paymentSummary && (
          <Button
            className="w-full h-12 text-base font-semibold"
            style={{ backgroundColor: brandColor, color: "#fff" }}
            disabled={!canSubmit || checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate()}
          >
            {checkoutMutation.isPending ? (
              <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Calculating total…</>
            ) : (
              `Proceed to Payment`
            )}
          </Button>
        )}

        <p className="text-center text-xs text-muted-foreground">
          Secured by Paystack · Your payment is encrypted and protected
        </p>
      </div>
    </div>
  );
}
