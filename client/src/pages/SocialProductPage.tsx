import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApiJson } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ShoppingBag, ArrowLeft, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { loadPaystackInlineScript, PaystackInlineService } from "@/lib/paystackInline";

// Types
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
          const ref = await PaystackInlineService.pay({
            publicKey: cfg.key || cfg.publicKey,
            email: cfg.email,
            amount: cfg.amount,
            reference: cfg.reference || cfg.ref,
            currency: "GHS",
            accessCode: cfg.accessCode || cfg.access_code,
          });
          navigate(`/payment/success?ref=${ref}`);
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
              <img
                src={images[imgIdx]}
                alt={product.name}
                className="w-full h-full object-cover"
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 hover:bg-black/60 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-1.5 hover:bg-black/60 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
                      />
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
            <span className="text-2xl font-bold" style={{ color: primaryColor }}>
              GHS {unitPrice.toFixed(2)}
            </span>
            {modifierAdjustment !== 0 && (
              <span className="text-sm text-muted-foreground">base: GHS {basePrice.toFixed(2)}</span>
            )}
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
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="px-3 py-2 text-lg hover:bg-muted transition-colors"
            >
              −
            </button>
            <span className="px-3 py-2 font-semibold min-w-[2rem] text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="px-3 py-2 text-lg hover:bg-muted transition-colors"
            >
              +
            </button>
          </div>
          <span className="text-sm text-muted-foreground ml-auto font-semibold">
            Total: GHS {totalAmount.toFixed(2)}
          </span>
        </div>

        {/* Delivery form */}
        <div className="space-y-4 border rounded-xl p-4">
          <p className="text-sm font-semibold">Your details</p>
          <div className="space-y-3">
            <Input
              placeholder="Full name *"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              placeholder="Phone number *"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <Input
              placeholder="Email (optional)"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              placeholder="Delivery address *"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
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

        {/* Store tagline */}
        {branding?.tagline && (
          <p className="text-center text-xs text-muted-foreground italic">{branding.tagline}</p>
        )}

        {/* Secure payment note */}
        <p className="text-center text-xs text-muted-foreground pb-4">
          Secured by Paystack • Powered by KiyuMart
        </p>
      </main>
    </div>
  );
}
