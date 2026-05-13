import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ShoppingBag, ArrowLeft, ChevronLeft, ChevronRight, Star, Download, Share2, X, MapPin, Navigation, Phone, Mail, MessageSquare, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { loadPaystackInlineScript, PaystackInlineService } from "@/lib/paystackInline";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface ProductModifier {
  id: string;
  name: string;
  options: { label: string; priceAdj: number }[];
  required: boolean;
  maxSelections: number;
}

interface SocialProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  images: string[];
  slug: string;
  ratings: string;
  totalRatings: number;
  isActive: boolean;
  modifiers: ProductModifier[];
  store: {
    id: string;
    name: string;
    logo: string | null;
    whatsappNumber: string | null;
    socialLinks: { instagram?: string; facebook?: string; tiktok?: string } | null;
    brandingConfig: { primaryColor?: string; accentColor?: string; logoOverride?: string; tagline?: string } | null;
  } | null;
  seller: { id: string; name: string } | null;
}

interface CompletedOrder {
  orderId: string;
  orderNumber: string;
  total: number;
  productName: string;
  quantity: number;
  storeName: string;
  date: string;
  address: string;
}

function ModifierGroup({ mod, selected, onChange }: {
  mod: ProductModifier;
  selected: string[];
  onChange: (labels: string[]) => void;
}) {
  const toggle = (label: string) => {
    if (mod.maxSelections === 1) {
      onChange(selected.includes(label) ? [] : [label]);
    } else {
      if (selected.includes(label)) {
        onChange(selected.filter((s) => s !== label));
      } else if (selected.length < mod.maxSelections) {
        onChange([...selected, label]);
      }
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">
        {mod.name}
        {mod.required && <span className="text-red-500 ml-1">*</span>}
        {mod.maxSelections > 1 && <span className="text-muted-foreground font-normal ml-1 text-xs">(up to {mod.maxSelections})</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {mod.options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => toggle(opt.label)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              selected.includes(opt.label)
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:bg-muted"
            }`}
          >
            {opt.label}
            {opt.priceAdj !== 0 && (
              <span className="ml-1 opacity-75">
                {opt.priceAdj > 0 ? `+` : ``}GHS {Math.abs(opt.priceAdj).toFixed(2)}
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

async function generateReceiptPdf(order: CompletedOrder, primaryColor: string, platformName: string, contactEmail?: string | null, contactPhone?: string | null, logoUrl?: string | null): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a5" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const col = primaryColor.startsWith("#") ? primaryColor : "#16a34a";
  const r = parseInt(col.slice(1, 3), 16);
  const g = parseInt(col.slice(3, 5), 16);
  const b = parseInt(col.slice(5, 7), 16);

  // Header band
  doc.setFillColor(r, g, b);
  doc.rect(0, 0, W, 28, "F");

  // Logo / platform name centred in header
  let headerY = 10;
  if (logoUrl) {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject();
        img.src = logoUrl;
        setTimeout(() => reject(), 3000);
      });
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || 120;
      canvas.height = img.naturalHeight || 120;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const dataUrl = canvas.toDataURL("image/png");
      const logoSize = 14;
      doc.addImage(dataUrl, "PNG", (W - logoSize) / 2, 5, logoSize, logoSize);
      headerY = 21;
    } catch { headerY = 10; }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(logoUrl ? 9 : 14);
  doc.setFont("helvetica", "bold");
  doc.text(platformName || "Order Receipt", W / 2, headerY + (logoUrl ? 0 : 4), { align: "center" });

  // Order title
  doc.setTextColor(r, g, b);
  doc.setFontSize(13);
  doc.text("Payment Receipt", W / 2, 38, { align: "center" });

  // Divider
  doc.setDrawColor(r, g, b);
  doc.setLineWidth(0.4);
  doc.line(14, 41, W - 14, 41);

  // Receipt rows
  const rows: [string, string][] = [
    ["Order #", order.orderNumber],
    ["Date", order.date],
    ["Item", `${order.productName} × ${order.quantity}`],
    ["Store", order.storeName],
    ["Delivery Address", order.address],
  ];

  doc.setFontSize(9);
  let y = 48;
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(label, 14, y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(30, 30, 30);
    const wrapped = doc.splitTextToSize(value, W - 60);
    doc.text(wrapped, W - 14, y, { align: "right" });
    y += wrapped.length > 1 ? wrapped.length * 5 + 3 : 8;
  });

  // Total row
  doc.setLineWidth(0.3);
  doc.setDrawColor(220, 220, 220);
  doc.line(14, y, W - 14, y);
  y += 6;
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Total Paid", 14, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(r, g, b);
  doc.text(`GHS ${order.total.toFixed(2)}`, W - 14, y, { align: "right" });
  y += 12;

  // Contact / support section
  if (contactEmail || contactPhone) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(120, 120, 120);
    doc.text("NEED HELP?", 14, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    if (contactEmail) { doc.setTextColor(50, 50, 50); doc.text(contactEmail, 14, y); y += 5; }
    if (contactPhone) { doc.text(contactPhone, 14, y); y += 5; }
    y += 3;
  }

  // Footer
  doc.setFillColor(r, g, b);
  doc.rect(0, H - 12, W, 12, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(255, 255, 255);
  doc.text("Secured by Paystack", W / 2, H - 5, { align: "center" });

  return doc.output("blob");
}

function ReceiptScreen({
  order,
  primaryColor,
  logoUrl,
  onClose,
}: {
  order: CompletedOrder;
  primaryColor: string;
  logoUrl?: string | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const { contactEmail, contactPhone, platformName } = usePlatformSettings();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const receiptText = [
    `===== ORDER RECEIPT =====`,
    `${platformName}`,
    ``,
    `Order #${order.orderNumber}`,
    `Date: ${order.date}`,
    ``,
    `Item: ${order.productName}`,
    `Qty: ${order.quantity}`,
    `Store: ${order.storeName}`,
    `Delivery Address: ${order.address}`,
    ``,
    `Total Paid: GHS ${order.total.toFixed(2)}`,
    ``,
    contactEmail ? `Email: ${contactEmail}` : "",
    contactPhone ? `Phone: ${contactPhone}` : "",
  ].filter(Boolean).join("\n");

  const handleDownload = async () => {
    setGeneratingPdf(true);
    try {
      const blob = await generateReceiptPdf(order, primaryColor, platformName || "KiyuMart", contactEmail, contactPhone, logoUrl);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${order.orderNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "PDF receipt downloaded" });
    } catch {
      // fallback to text
      const blob = new Blob([receiptText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `receipt-${order.orderNumber}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Receipt downloaded" });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        setGeneratingPdf(true);
        const blob = await generateReceiptPdf(order, primaryColor, platformName || "KiyuMart", contactEmail, contactPhone, logoUrl);
        const file = new File([blob], `receipt-${order.orderNumber}.pdf`, { type: "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Receipt #${order.orderNumber}` });
          return;
        }
        await navigator.share({ title: `Order Receipt #${order.orderNumber}`, text: receiptText });
      } catch { /* user cancelled */ } finally {
        setGeneratingPdf(false);
      }
    } else {
      await navigator.clipboard.writeText(receiptText);
      toast({ title: "Receipt copied to clipboard" });
    }
  };

  const handleSubmitReview = async () => {
    if (!comment.trim() && rating === 5) {
      setSubmitted(true);
      return;
    }
    try {
      await apiRequest("POST", "/api/orders/experience-feedback", {
        orderId: order.orderId,
        rating,
        comment: comment.trim(),
      }).catch(() => {});
    } finally {
      setSubmitted(true);
      toast({ title: "Thank you for your feedback!" });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-5 w-5" style={{ color: primaryColor }} />
          <span className="font-semibold text-sm">Payment Successful</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 hover:bg-muted transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Success badge */}
        <div className="flex flex-col items-center gap-3 py-4">
          <div className="rounded-full p-4" style={{ backgroundColor: `${primaryColor}22` }}>
            <CheckCircle2 className="h-12 w-12" style={{ color: primaryColor }} />
          </div>
          <p className="text-xl font-bold">Order Confirmed!</p>
          <p className="text-sm text-muted-foreground text-center">
            Your order has been placed. You'll receive updates via SMS or email.
          </p>
        </div>

        {/* Receipt card */}
        <div className="rounded-2xl border overflow-hidden">
          <div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted/30">
            Receipt
          </div>
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
              <span className="text-muted-foreground">Item</span>
              <span className="font-medium text-right max-w-[60%]">{order.productName} × {order.quantity}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Store</span>
              <span>{order.storeName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Address</span>
              <span className="text-right max-w-[60%]">{order.address}</span>
            </div>
            <div className="border-t pt-3 flex justify-between font-bold">
              <span>Total Paid</span>
              <span style={{ color: primaryColor }}>GHS {order.total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Download / Share */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="outline" className="gap-2" onClick={handleDownload} disabled={generatingPdf}>
            {generatingPdf ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            PDF Receipt
          </Button>
          <Button variant="outline" className="gap-2" onClick={handleShare} disabled={generatingPdf}>
            <Share2 className="h-4 w-4" />
            Share
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
            <Button
              className="w-full"
              style={{ backgroundColor: primaryColor }}
              onClick={handleSubmitReview}
            >
              Submit Feedback
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border p-4 flex items-center gap-3 bg-muted/30">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
            <p className="text-sm text-muted-foreground">Thank you for your feedback!</p>
          </div>
        )}

        {/* Platform contact */}
        <div className="rounded-2xl border p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Need Help?</p>
          {contactEmail && (
            <a href={`mailto:${contactEmail}`} className="flex items-center gap-2 text-sm hover:underline">
              <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
              {contactEmail}
            </a>
          )}
          {contactPhone && (
            <a href={`tel:${contactPhone}`} className="flex items-center gap-2 text-sm hover:underline">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              {contactPhone}
            </a>
          )}
          {!contactEmail && !contactPhone && (
            <p className="text-sm text-muted-foreground">Contact {platformName} support for assistance.</p>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          Close
        </Button>

        <p className="text-center text-xs text-muted-foreground pb-4">
          Secured by Paystack • Powered by {platformName}
        </p>
      </div>
    </div>
  );
}

export default function SocialProductPage() {
  const { slug } = useParams<{ slug: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: product, isLoading, error } = useQuery<SocialProduct>({
    queryKey: ["/api/p", slug],
    queryFn: () => fetchApiJson<SocialProduct>(`/api/p/${slug}`),
    staleTime: 60_000,
    enabled: Boolean(slug),
  });

  const [imgIdx, setImgIdx] = useState(0);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<string, string[]>>({});
  const [paying, setPaying] = useState(false);
  const [locating, setLocating] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);

  useEffect(() => { void loadPaystackInlineScript().catch(() => {}); }, []);

  const branding = product?.store?.brandingConfig;
  const primaryColor = branding?.primaryColor || "#16a34a";

  const images = product?.images ?? [];
  const basePrice = parseFloat(product?.price ?? "0");

  const modifierAdjustment = Object.values(selectedModifiers).flat().reduce((total, label) => {
    for (const mod of product?.modifiers ?? []) {
      const opt = mod.options.find((o) => o.label === label);
      if (opt) total += opt.priceAdj;
    }
    return total;
  }, 0);

  const unitPrice = Math.max(0, basePrice + modifierAdjustment);
  const totalAmount = unitPrice * quantity;

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

  const validateForm = () => {
    if (!name.trim()) { toast({ title: "Please enter your name", variant: "destructive" }); return false; }
    if (!phone.trim()) { toast({ title: "Please enter your phone number", variant: "destructive" }); return false; }
    if (!address.trim()) { toast({ title: "Please enter your delivery address", variant: "destructive" }); return false; }
    for (const mod of product?.modifiers ?? []) {
      if (mod.required && !(selectedModifiers[mod.id]?.length)) {
        toast({ title: `Please select ${mod.name}`, variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const handlePayNow = async () => {
    if (!validateForm()) return;
    if (!product) return;
    setPaying(true);
    try {
      const res = await apiRequest("POST", "/api/orders/social-checkout", {
        productId: product.id,
        quantity,
        selectedModifiers,
        customerName: name.trim(),
        customerPhone: phone.trim(),
        customerEmail: email.trim() || undefined,
        deliveryAddress: address.trim(),
        amount: totalAmount,
      });
      const data = await res.json();
      if (data?.error) {
        toast({ title: data.error, variant: "destructive" });
        setPaying(false);
        return;
      }
      if (data?.paystackConfig) {
        const cfg = data.paystackConfig;
        try {
          await PaystackInlineService.pay({
            publicKey: cfg.key || cfg.publicKey,
            email: cfg.email,
            amount: cfg.amount,
            reference: cfg.reference || cfg.ref,
            currency: "GHS",
            accessCode: cfg.accessCode || cfg.access_code,
          });
          setCompletedOrder({
            orderId: data.orderId,
            orderNumber: data.orderNumber,
            total: totalAmount,
            productName: product.name,
            quantity,
            storeName: product.store?.name ?? "",
            date: new Date().toLocaleDateString("en-GH", { year: "numeric", month: "short", day: "numeric" }),
            address: address.trim(),
          });
        } catch (payErr: any) {
          if (cfg.authorization_url) {
            window.location.href = cfg.authorization_url;
          } else {
            toast({ title: "Payment cancelled" });
          }
        }
      }
    } catch (e: any) {
      toast({ title: e?.message || "Failed to start checkout", variant: "destructive" });
    } finally {
      setPaying(false);
    }
  };

  if (completedOrder) {
    return (
      <ReceiptScreen
        order={completedOrder}
        primaryColor={primaryColor}
        logoUrl={branding?.logoOverride || product?.store?.logo || null}
        onClose={() => navigate("/")}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background gap-4 px-4 text-center">
        <ShoppingBag className="h-16 w-16 text-muted-foreground/40" />
        <h2 className="text-xl font-semibold">Product not found</h2>
        <p className="text-muted-foreground text-sm">This product link may be expired or the item is no longer available.</p>
        <Button variant="outline" onClick={() => navigate("/")}>Browse Store</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" style={{ "--brand-color": primaryColor } as any}>
      {/* Minimal header */}
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="max-w-lg mx-auto flex items-center justify-between px-4 h-14">
          <button onClick={() => history.back()} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
          {product.store && (
            <div className="flex items-center gap-2">
              {(branding?.logoOverride || product.store.logo) && (
                <img src={branding?.logoOverride || product.store.logo!} alt={product.store.name} className="h-7 w-7 rounded-full object-cover" />
              )}
              <span className="text-sm font-semibold">{product.store.name}</span>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {/* Product images carousel */}
        <div className="relative rounded-2xl overflow-hidden aspect-square bg-muted">
          {images.length > 0 ? (
            <>
              <img src={images[imgIdx]} alt={product.name} className="w-full h-full object-cover" />
              {images.length > 1 && (
                <>
                  <button onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 hover:bg-black/60 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => setImgIdx((i) => (i + 1) % images.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 hover:bg-black/60 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <button key={i} onClick={() => setImgIdx(i)} className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <ShoppingBag className="h-16 w-16 text-muted-foreground/30" />
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold leading-tight">{product.name}</h1>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-bold" style={{ color: primaryColor }}>GHS {unitPrice.toFixed(2)}</span>
            {modifierAdjustment !== 0 && <span className="text-sm text-muted-foreground">base: GHS {basePrice.toFixed(2)}</span>}
          </div>
          {Number(product.totalRatings) > 0 && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              <span>{parseFloat(product.ratings).toFixed(1)}</span>
              <span>({product.totalRatings} reviews)</span>
            </div>
          )}
          <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
        </div>

        {/* Modifiers */}
        {product.modifiers.length > 0 && (
          <div className="space-y-4 border rounded-xl p-4 bg-muted/30">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Customize your order</p>
            {product.modifiers.map((mod) => (
              <ModifierGroup
                key={mod.id}
                mod={mod}
                selected={selectedModifiers[mod.id] ?? []}
                onChange={(labels) => setSelectedModifiers((prev) => ({ ...prev, [mod.id]: labels }))}
              />
            ))}
          </div>
        )}

        {/* Quantity */}
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Quantity</span>
          <div className="flex items-center gap-2 border rounded-lg overflow-hidden">
            <button type="button" onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg hover:bg-muted transition-colors">−</button>
            <span className="px-3 py-2 font-semibold min-w-[2rem] text-center">{quantity}</span>
            <button type="button" onClick={() => setQuantity((q) => q + 1)} className="px-3 py-2 text-lg hover:bg-muted transition-colors">+</button>
          </div>
          <span className="text-sm text-muted-foreground ml-auto font-semibold">Total: GHS {totalAmount.toFixed(2)}</span>
        </div>

        {/* Delivery form */}
        <div className="space-y-4 border rounded-xl p-4">
          <p className="text-sm font-semibold">Your details</p>
          <div className="space-y-3">
            <Input placeholder="Full name *" value={name} onChange={(e) => setName(e.target.value)} />
            <Input placeholder="Phone number *" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input placeholder="Email (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            {/* Address with geolocation */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <Input
                  placeholder="Delivery address *"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
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
        </div>

        {/* Pay Now Button */}
        <Button
          onClick={handlePayNow}
          disabled={paying}
          className="w-full py-6 text-base font-bold rounded-2xl shadow-lg"
          style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
        >
          {paying ? (
            <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Processing…</>
          ) : (
            <>Pay Now — GHS {totalAmount.toFixed(2)}</>
          )}
        </Button>

        {branding?.tagline && <p className="text-center text-xs text-muted-foreground italic">{branding.tagline}</p>}
        <p className="text-center text-xs text-muted-foreground pb-4">Secured by Paystack • Powered by KiyuMart</p>
      </main>
    </div>
  );
}
