import { goBack } from "@/lib/navigation";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useHaptic } from "@/hooks/useHaptic";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { fetchSameOriginJson } from "@/lib/queryClient";
import {
  readPersistedCheckoutCoupons,
  writePersistedCheckoutCoupon,
  removePersistedCheckoutCoupon,
} from "@/lib/checkoutCoupon";
import {
  readExcludedCartIds,
  writeExcludedCartIds,
} from "@/lib/cartSelection";
import { couponDiscountFor, resolveProcessingFeePercent, summarizeCart } from "@/lib/cartTotals";

/*
 * Phone cart — design "A" (approved 28 Nov 2026, docs/design/cart-redesign-20261128).
 * Items grouped by shop, tick to choose what to check out, one delivery location, one-tap shop coupons
 * (one per shop; each reduces only that shop's items), Paystack charges
 * shown and passed to the buyer exactly as checkout and the server compute them.
 * Desktop cart (Cart.tsx) is unchanged.
 */

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem("theme");
    return s ? s === "dark" : document.documentElement.classList.contains("dark");
  });
  useEffect(() => {
    const read = () => {
      const s = localStorage.getItem("theme");
      setIsDark(s ? s === "dark" : document.documentElement.classList.contains("dark"));
    };
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    const onStorage = (e: StorageEvent) => { if (e.key === "theme") read(); };
    window.addEventListener("storage", onStorage);
    return () => { obs.disconnect(); window.removeEventListener("storage", onStorage); };
  }, []);
  return isDark;
}

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: string;
  originalPrice?: string | null;
  quantity: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
  availableStock?: number;
  sellerId?: string | null;
  variantId?: string | null;
  selectedImageIndex?: number | null;
}

interface MobileCartProps {
  cartItems: CartItem[];
  isLoading: boolean;
  onQuantityChange: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  onCheckout: () => void;
}

interface Coupon {
  id?: string;
  code: string;
  discountType?: string | null;
  discountValue?: string | number | null;
  minimumPurchase?: string | number | null;
}

interface PublicStore {
  name?: string;
  logo?: string | null;
  primarySellerId?: string;
  verificationStatus?: string | null;
}

const money = (n: number) =>
  "GH₵" + (Math.round(n * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function couponLabel(c: Coupon) {
  const value = Number(c.discountValue) || 0;
  const what = c.discountType === "percentage" ? `${value}% off this shop` : `${money(value)} off this shop`;
  const min = Number(c.minimumPurchase) || 0;
  return min > 0 ? `${what} · min. spend ${money(min)}` : what;
}

const variantText = (item: { selectedSize?: string | null; selectedColor?: string | null }) =>
  [item.selectedSize ? `Size ${item.selectedSize}` : null, item.selectedColor || null].filter(Boolean).join(" · ");

/* ── Icons ─────────────────────────────────────────────── */
const Check = ({ size = 13, color = "#fff", w = 3.2 }: { size?: number; color?: string; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
);
const TagIcon = ({ color, size = 18 }: { color: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.6 13.4l-7.2 7.2a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
);

function Tick({ on, accent, ring }: { on: boolean; accent: string; ring: string }) {
  return on ? (
    <span style={{ width: 22, height: 22, borderRadius: 11, background: accent, display: "grid", placeItems: "center" }}><Check /></span>
  ) : (
    <span style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${ring}`, boxSizing: "border-box" }} />
  );
}

export function MobileCart({ cartItems, isLoading, onQuantityChange, onRemoveItem, onCheckout }: MobileCartProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { trigger: haptic } = useHaptic();
  const isDark = useTheme();
  const userId = user?.id ? String(user.id) : null;

  const t = {
    accent: "#009688",
    accentDeep: "#00796B",
    bg: isDark ? "#111111" : "#F2F2F7",
    card: isDark ? "#1C1C1E" : "#FFFFFF",
    soft: isDark ? "#232325" : "#FBFBFC",
    chip: isDark ? "#2C2C2E" : "#FAFAFB",
    chipBorder: isDark ? "rgba(255,255,255,0.12)" : "#E3E3E8",
    txt: isDark ? "#FFFFFF" : "#0D0D0D",
    sub: isDark ? "rgba(235,235,245,0.7)" : "#3C4043",
    muted: isDark ? "rgba(235,235,245,0.5)" : "#5F6368",
    faint: isDark ? "rgba(235,235,245,0.4)" : "#80868B",
    line: isDark ? "rgba(255,255,255,0.07)" : "#F0F0F3",
    border: isDark ? "rgba(255,255,255,0.08)" : "#ECECEF",
    stepBg: isDark ? "#2C2C2E" : "#F2F2F7",
    ring: isDark ? "rgba(235,235,245,0.4)" : "#9AA0A6",
    tint: isDark ? "rgba(0,150,136,0.16)" : "#F0FAF9",
    tintStrong: isDark ? "rgba(0,150,136,0.24)" : "#E0F2F1",
    link: isDark ? "#4DB6AC" : "#00796B",
    danger: isDark ? "#F28B82" : "#B3261E",
    warn: isDark ? "#F6AE5B" : "#B45309",
    skel: isDark ? "#2C2C2E" : "#E5E5EA",
  };

  /* ── Selection (persisted so checkout uses the same choice) ── */
  const [excluded, setExcluded] = useState<string[]>(() => readExcludedCartIds(userId));
  useEffect(() => { setExcluded(readExcludedCartIds(userId)); }, [userId]);
  useEffect(() => {
    // Forget ticks for rows that are no longer in the cart.
    if (!cartItems.length) return;
    const ids = new Set(cartItems.map((i) => i.id));
    const kept = excluded.filter((id) => ids.has(id));
    if (kept.length !== excluded.length) { setExcluded(kept); writeExcludedCartIds(userId, kept); }
  }, [cartItems, excluded, userId]);
  const setExcludedIds = (ids: string[]) => { setExcluded(ids); writeExcludedCartIds(userId, ids); };

  /* ── Stock split ── */
  const isSoldOut = (i: CartItem) => typeof i.availableStock === "number" && i.availableStock <= 0;
  const available = cartItems.filter((i) => !isSoldOut(i));
  const unavailable = cartItems.filter(isSoldOut);
  const isSelected = (i: CartItem) => !excluded.includes(i.id);

  /* ── Shops ── */
  const sellerIds = useMemo(
    () => Array.from(new Set(available.map((i) => i.sellerId || "unknown"))),
    [available],
  );
  const storeQueries = useQueries({
    queries: sellerIds.map((sid) => ({
      queryKey: ["/api/stores/by-seller", sid],
      enabled: sid !== "unknown",
      staleTime: 5 * 60_000,
      retry: false,
      queryFn: () => fetchSameOriginJson<PublicStore>(`/api/stores/by-seller/${encodeURIComponent(sid)}`),
    })),
  });

  const lineNet = (i: CartItem) => (parseFloat(i.price) || 0) * i.quantity;
  const shopSubtotal = (sid: string) =>
    available.filter((i) => (i.sellerId || "unknown") === sid && isSelected(i)).reduce((s, i) => s + lineNet(i), 0);

  /* ── Coupons: what each shop offers right now ── */
  const couponQueries = useQueries({
    queries: sellerIds.map((sid) => {
      const sub = shopSubtotal(sid);
      return {
        queryKey: ["/api/coupons/available", sid, sub.toFixed(2)],
        enabled: !!userId && sid !== "unknown" && sub > 0,
        staleTime: 30_000,
        queryFn: () =>
          fetchSameOriginJson<Coupon[]>(
            `/api/coupons/available?sellerId=${encodeURIComponent(sid)}&orderTotal=${encodeURIComponent(sub.toFixed(2))}`,
            { cache: "no-store" },
          ),
      };
    }),
  });

  // One coupon per shop; a shop without a coupon is never affected.
  const [applied, setApplied] = useState<Record<string, Coupon>>({});
  const [codeOpenFor, setCodeOpenFor] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [busySeller, setBusySeller] = useState<string | null>(null);

  const validate = async (sid: string, code: string) => {
    const sub = shopSubtotal(sid);
    const data = await fetchSameOriginJson<any>("/api/coupons/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, sellerId: sid, orderTotal: sub.toFixed(2) }),
    });
    return data?.valid && data?.coupon ? (data.coupon as Coupon) : { error: String(data?.message || "This coupon can't be used") };
  };

  // Bring back coupons applied earlier (or at checkout) that still fit this cart.
  const [restored, setRestored] = useState(false);
  useEffect(() => {
    if (restored || !userId || !available.length) return;
    setRestored(true);
    for (const saved of readPersistedCheckoutCoupons(userId)) {
      const sid = saved.sellerId;
      if (!sid || !sellerIds.includes(sid)) continue;
      void validate(sid, saved.code).then((r) => {
        if ("code" in r) setApplied((cur) => ({ ...cur, [sid]: r }));
        else removePersistedCheckoutCoupon(userId, sid);
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, available.length, restored]);

  const applyCoupon = async (sid: string, code: string) => {
    if (!code.trim()) return;
    setBusySeller(sid);
    try {
      const r = await validate(sid, code.trim().toUpperCase());
      if (!("code" in r)) {
        toast({ title: "Coupon not applied", description: r.error, variant: "destructive" });
        return;
      }
      setApplied((cur) => ({ ...cur, [sid]: r }));
      writePersistedCheckoutCoupon(userId, { code: String(r.code).toUpperCase(), sellerId: sid, savedAt: Date.now() });
      setCodeOpenFor(null);
      setCodeInput("");
      haptic("light");
    } catch (e: any) {
      toast({ title: "Coupon not applied", description: "Please try again in a moment.", variant: "destructive" });
    } finally {
      setBusySeller(null);
    }
  };
  const removeCoupon = (sid: string) => {
    setApplied((cur) => { const next = { ...cur }; delete next[sid]; return next; });
    removePersistedCheckoutCoupon(userId, sid);
  };

  /* ── Totals (same maths as checkout and the server) ── */
  const { data: settings } = useQuery<{ processingFeePercent?: string }>({
    queryKey: ["/api/settings"],
    enabled: !!userId,
    queryFn: () => fetchSameOriginJson("/api/settings", { cache: "no-store" }),
    staleTime: 60_000,
  });
  const feePercent = resolveProcessingFeePercent(settings?.processingFeePercent);
  // Each shop's coupon is worked out on that shop's ticked items only.
  const couponOffFor = (sid: string) => {
    const c = applied[sid];
    const sub = shopSubtotal(sid);
    if (!c || sub <= 0 || sub < (Number(c.minimumPurchase) || 0)) return 0;
    return couponDiscountFor(c, sub);
  };
  const couponOff = sellerIds.reduce((total, sid) => total + couponOffFor(sid), 0);
  const selectedLines = available.filter(isSelected).map((i) => ({
    price: parseFloat(i.price) || 0,
    originalPrice: parseFloat(i.originalPrice || "") || null,
    quantity: i.quantity,
  }));
  const sum = summarizeCart({ lines: selectedLines, couponDiscount: couponOff, feePercent });

  const shops = sellerIds.map((sid, idx) => {
    const store = storeQueries[idx]?.data;
    const items = available.filter((i) => (i.sellerId || "unknown") === sid);
    const offers = (couponQueries[idx]?.data || []).filter((c) => c?.code);
    const off = couponOffFor(sid);
    const isApplied = !!applied[sid] && off > 0;
    return {
      sid, items, store,
      name: store?.name || "Shop",
      verified: String(store?.verificationStatus || "").toLowerCase() === "verified",
      couponOff: off,
      subtotal: shopSubtotal(sid) - off,
      offer: offers[0] || null,
      isApplied,
    };
  });

  const liveCount = available.reduce((s, i) => s + i.quantity, 0);
  const allSelected = available.length > 0 && available.every(isSelected);
  const toggleAll = () => { haptic("light"); setExcludedIds(allSelected ? available.map((i) => i.id) : []); };
  const toggleItem = (id: string) => { haptic("light"); setExcludedIds(excluded.includes(id) ? excluded.filter((x) => x !== id) : [...excluded, id]); };

  const findSimilar = (name: string) => {
    const q = name.replace(/^demo\s*[–-]\s*/i, "").split(/\s+/).slice(0, 3).join(" ");
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const goCheckout = () => {
    if (sum.itemCount === 0) {
      toast({ title: "Nothing selected", description: "Tick at least one item to check out." });
      return;
    }
    haptic("medium");
    onCheckout();
  };

  /* ── Shared header ── */
  const BackButton = (
    <button
      aria-label="Back"
      onClick={() => goBack("/")}
      style={{ width: 44, height: 44, border: 0, borderRadius: 22, background: t.stepBg, display: "grid", placeItems: "center", cursor: "pointer", WebkitTapHighlightColor: "transparent", flexShrink: 0 }}
    >
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.txt} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
    </button>
  );
  const headerStyle = {
    position: "sticky" as const, top: 0, zIndex: 20, background: t.card,
    display: "flex", alignItems: "center", gap: 8,
    padding: "10px 12px 10px", paddingTop: "max(14px, env(safe-area-inset-top, 14px))",
  };

  if (isLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: t.bg, fontFamily: F }}>
        <div style={headerStyle}>
          <div style={{ width: 44, height: 44, borderRadius: 22, background: t.skel }} />
          <div style={{ flex: 1, height: 18, borderRadius: 6, background: t.skel, maxWidth: 110 }} />
        </div>
        <div style={{ margin: "12px", background: t.card, borderRadius: 16, overflow: "hidden" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ padding: 14, display: "flex", gap: 12, borderBottom: `1px solid ${t.line}` }}>
              <div style={{ width: 88, height: 112, borderRadius: 12, background: t.skel, flexShrink: 0 }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 9, paddingTop: 4 }}>
                <div style={{ height: 14, borderRadius: 5, background: t.skel, width: "70%" }} />
                <div style={{ height: 22, borderRadius: 8, background: t.skel, width: "45%" }} />
                <div style={{ height: 18, borderRadius: 6, background: t.skel, width: "55%" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Empty cart ── */
  if (cartItems.length === 0) {
    return (
      <div style={{ minHeight: "100dvh", background: t.bg, display: "flex", flexDirection: "column", fontFamily: F, color: t.txt }}>
        <div style={headerStyle}>
          {BackButton}
          <div style={{ flex: 1, fontSize: 20, fontWeight: 800 }}>My cart</div>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 32px", textAlign: "center" }}>
          <div style={{ width: 112, height: 112, borderRadius: 56, background: t.tintStrong, display: "grid", placeItems: "center", marginBottom: 20 }}>
            <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke={t.link} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 7h12l-1 13H7L6 7z" /><path d="M9 7a3 3 0 0 1 6 0" /></svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Your cart is empty</div>
          <div style={{ fontSize: 14, color: t.muted, lineHeight: 1.5, marginBottom: 24 }}>
            Browse shops across KiyuMart and add the pieces you love.
          </div>
          <button data-testid="button-shop-now" onClick={() => navigate("/")} style={{ height: 52, width: "100%", border: 0, borderRadius: 26, background: t.accentDeep, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: F }}>
            Start shopping
          </button>
          <button onClick={() => navigate("/wishlist")} style={{ height: 48, width: "100%", marginTop: 10, border: `1px solid ${t.link}`, borderRadius: 24, background: t.card, color: t.link, fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: F }}>
            View wishlist
          </button>
        </div>
        <div style={{ padding: "0 16px", paddingBottom: "max(28px, env(safe-area-inset-bottom))" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Browse shops</div>
          <button onClick={() => navigate("/stores")} style={{ width: "100%", background: t.card, borderRadius: 14, padding: 10, border: 0, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: t.txt, fontFamily: F }}>
            <span style={{ width: 40, height: 40, borderRadius: 20, background: t.tintStrong, display: "grid", placeItems: "center", color: t.link, fontWeight: 800, fontSize: 18 }}>+</span>
            <span style={{ fontSize: 13, fontWeight: 600, flex: 1, textAlign: "left" }}>All shops</span>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
          </button>
        </div>
      </div>
    );
  }

  const row = { display: "flex", justifyContent: "space-between", alignItems: "center" } as const;

  return (
    <div style={{ minHeight: "100dvh", background: t.bg, color: t.txt, fontFamily: F, paddingBottom: 130 }}>
      {/* Header */}
      <header style={headerStyle}>
        {BackButton}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div data-testid="text-page-title" style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.2 }}>My cart</div>
          <div style={{ fontSize: 12, color: t.muted }}>
            {liveCount} {liveCount === 1 ? "item" : "items"} · {shops.length} {shops.length === 1 ? "shop" : "shops"}
          </div>
        </div>
        {available.length > 0 && (
          <button onClick={toggleAll} style={{ height: 44, border: 0, background: "none", fontSize: 13, fontWeight: 600, color: t.link, cursor: "pointer", fontFamily: F }}>
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </header>

      {/* Deliver to */}
      <button
        onClick={goCheckout}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", border: 0, borderTop: `1px solid ${t.border}`, background: t.card, textAlign: "left", cursor: "pointer", color: t.txt, fontFamily: F }}
      >
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></svg>
        <span style={{ flex: 1, fontSize: 14 }}>
          <b>Deliver to:</b> <span style={{ color: t.link, fontWeight: 600 }}>Add your location</span>
          <br /><span style={{ fontSize: 12, color: t.muted }}>once, for your whole order</span>
        </span>
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
      </button>

      {available.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 6px" }}>
          <button onClick={toggleAll} style={{ display: "flex", alignItems: "center", gap: 10, border: 0, background: "none", padding: "6px 0", fontSize: 14, fontWeight: 600, color: t.txt, cursor: "pointer", fontFamily: F }}>
            <Tick on={allSelected} accent={t.accent} ring={t.ring} />
            Select all
          </button>
          <span style={{ fontSize: 12, color: t.muted }}>One delivery fee for your order</span>
        </div>
      )}

      {/* Shops */}
      {shops.map((shop) => (
        <section key={shop.sid} data-testid="cart-shop" style={{ margin: "10px 12px 0", background: t.card, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderBottom: `1px solid ${t.line}` }}>
            {shop.store?.logo ? (
              <img src={shop.store.logo} alt="" style={{ width: 34, height: 34, borderRadius: 17, objectFit: "cover" }} />
            ) : (
              <span style={{ width: 34, height: 34, borderRadius: 17, background: t.tintStrong, color: t.link, display: "grid", placeItems: "center", fontWeight: 800 }}>
                {shop.name.charAt(0).toUpperCase()}
              </span>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, fontWeight: 700 }}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shop.name}</span>
                {shop.verified && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 800, color: "#fff", background: t.accentDeep, borderRadius: 999, padding: "2px 7px", flexShrink: 0 }}>
                    <Check size={9} w={4} /> Verified
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: t.muted }}>{shop.items.length} {shop.items.length === 1 ? "item" : "items"}</div>
            </div>
            {shop.sid !== "unknown" && (
              <button onClick={() => navigate(`/sellers/${shop.sid}`)} style={{ fontSize: 13, fontWeight: 700, color: t.link, background: "none", border: 0, padding: "10px 0", cursor: "pointer", fontFamily: F }}>
                Visit shop ›
              </button>
            )}
          </div>

          {shop.items.map((item) => {
            const unit = parseFloat(item.price) || 0;
            const was = parseFloat(item.originalPrice || "") || 0;
            const hasWas = was > unit;
            const selected = isSelected(item);
            const stock = typeof item.availableStock === "number" ? item.availableStock : undefined;
            const atMax = stock !== undefined && item.quantity >= stock;
            const variant = variantText(item);
            return (
              <div key={item.id} data-testid="cart-item" style={{ display: "flex", gap: 10, padding: "14px 12px 14px 8px", borderBottom: `1px solid ${t.line}` }}>
                <button onClick={() => toggleItem(item.id)} aria-label={`${selected ? "Untick" : "Tick"} ${item.productName}`} aria-pressed={selected} style={{ alignSelf: "center", width: 28, height: 44, border: 0, background: "none", padding: 0, cursor: "pointer", display: "grid", placeItems: "center" }}>
                  <Tick on={selected} accent={t.accent} ring={t.ring} />
                </button>
                <button onClick={() => navigate(`/product/${item.productId}`)} aria-label={`Open ${item.productName}`} style={{ border: 0, padding: 0, background: "none", cursor: "pointer", flexShrink: 0 }}>
                  {item.productImage ? (
                    <img src={item.productImage} alt={item.productName} style={{ width: 80, height: 104, borderRadius: 12, objectFit: "cover", background: t.stepBg, display: "block", opacity: selected ? 1 : 0.6 }} />
                  ) : (
                    <span style={{ width: 80, height: 104, borderRadius: 12, background: t.stepBg, display: "block" }} />
                  )}
                </button>
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{item.productName}</div>
                  {variant && (
                    <button onClick={() => navigate(`/product/${item.productId}`)} aria-label={`Change ${variant}`} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, border: `1px solid ${t.chipBorder}`, background: t.chip, borderRadius: 8, padding: "5px 8px", fontSize: 12, color: t.sub, cursor: "pointer", fontFamily: F }}>
                      {variant}
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={t.muted} strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                  )}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 16, fontWeight: 800 }}>{money(unit * item.quantity)}</span>
                    {hasWas && <span style={{ fontSize: 12, color: t.faint, textDecoration: "line-through" }}>{money(was * item.quantity)}</span>}
                    {hasWas && <span style={{ fontSize: 11, fontWeight: 800, color: t.link }}>−{Math.round((1 - unit / was) * 100)}%</span>}
                  </div>
                  {stock !== undefined && stock <= 3 && (
                    <div style={{ fontSize: 12, fontWeight: 700, color: t.warn }}>Only {stock} left</div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 4, marginTop: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", background: t.stepBg, borderRadius: 22 }}>
                      <button aria-label="Decrease quantity" disabled={item.quantity <= 1} onClick={() => { haptic("light"); onQuantityChange(item.id, -1); }} style={{ width: 34, height: 36, border: 0, background: "none", fontSize: 18, fontWeight: 700, color: t.txt, cursor: item.quantity <= 1 ? "not-allowed" : "pointer", opacity: item.quantity <= 1 ? 0.35 : 1, fontFamily: F }}>−</button>
                      <span style={{ minWidth: 22, textAlign: "center", fontSize: 14, fontWeight: 700 }}>{item.quantity}</span>
                      <button aria-label="Increase quantity" disabled={atMax} onClick={() => { haptic("light"); onQuantityChange(item.id, 1); }} style={{ width: 34, height: 36, border: 0, background: "none", fontSize: 18, fontWeight: 700, color: t.txt, cursor: atMax ? "not-allowed" : "pointer", opacity: atMax ? 0.35 : 1, fontFamily: F }}>+</button>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button onClick={() => { haptic("medium"); onRemoveItem(item.id); }} aria-label={`Remove ${item.productName}`} style={{ height: 36, border: 0, background: "none", padding: "0 0 0 6px", fontSize: 12, fontWeight: 600, color: t.danger, cursor: "pointer", fontFamily: F }}>Remove</button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Coupon + shop subtotal */}
          <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10, background: t.soft }}>
            {shop.isApplied ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, border: `1px solid ${t.accent}`, borderRadius: 12, padding: "10px 12px", background: t.tintStrong }}>
                <Check size={18} color={t.link} w={2.6} />
                <span style={{ flex: 1, fontSize: 13 }}><b>{String(applied[shop.sid].code).toUpperCase()}</b> applied · <b style={{ color: t.link }}>− {money(shop.couponOff)}</b></span>
                <button onClick={() => removeCoupon(shop.sid)} style={{ height: 32, border: 0, background: "none", color: t.danger, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Remove</button>
              </div>
            ) : shop.offer ? (
              <button
                onClick={() => applyCoupon(shop.sid, String(shop.offer!.code))}
                disabled={busySeller === shop.sid}
                aria-label={`Apply coupon ${shop.offer.code}`}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", border: `1px dashed ${t.accent}`, borderRadius: 12, padding: "10px 12px", background: t.tint, textAlign: "left", cursor: "pointer", color: t.txt, fontFamily: F }}
              >
                <TagIcon color={t.link} />
                <span style={{ flex: 1, fontSize: 12, lineHeight: 1.35 }}>
                  <b style={{ fontSize: 13 }}>Coupon available: {String(shop.offer.code).toUpperCase()}</b><br />
                  <span style={{ color: t.muted }}>{couponLabel(shop.offer)}</span>
                </span>
                <span style={{ height: 32, padding: "0 14px", borderRadius: 16, background: t.accentDeep, color: "#fff", fontSize: 12, fontWeight: 800, display: "grid", placeItems: "center" }}>
                  {busySeller === shop.sid ? "…" : "Apply"}
                </span>
              </button>
            ) : codeOpenFor === shop.sid ? (
              <form
                onSubmit={(e) => { e.preventDefault(); void applyCoupon(shop.sid, codeInput); }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", border: `1px dashed ${t.accent}`, borderRadius: 12, padding: "6px 6px 6px 12px", background: t.tint }}
              >
                <TagIcon color={t.link} />
                <input autoFocus value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase())} placeholder="Enter coupon code" aria-label={`Coupon code for ${shop.name}`} style={{ flex: 1, minWidth: 0, height: 36, border: 0, outline: "none", fontSize: 16, fontWeight: 700, background: "transparent", color: t.txt, fontFamily: F }} />
                <button type="submit" disabled={busySeller === shop.sid || !codeInput.trim()} style={{ height: 32, padding: "0 14px", border: 0, borderRadius: 16, background: t.accentDeep, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: F, opacity: codeInput.trim() ? 1 : 0.5 }}>
                  {busySeller === shop.sid ? "…" : "Apply"}
                </button>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: t.muted }}>
                <TagIcon color={t.ring} size={16} />
                <span style={{ flex: 1 }}>No coupon available for this shop right now</span>
                <button onClick={() => { setCodeOpenFor(shop.sid); setCodeInput(""); }} style={{ height: 32, border: 0, background: "none", color: t.link, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Enter a code</button>
              </div>
            )}
            <div style={{ ...row, fontSize: 13 }}>
              <span style={{ color: t.muted }}>Shop subtotal</span><span style={{ fontWeight: 700 }}>{money(shop.subtotal)}</span>
            </div>
          </div>
        </section>
      ))}

      {/* Sold out */}
      {unavailable.length > 0 && (
        <section style={{ margin: "16px 12px 0", background: t.card, borderRadius: 16, padding: "12px 14px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Unavailable ({unavailable.length})</div>
          {unavailable.map((item) => (
            <div key={item.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: "4px 0 8px" }}>
              <div style={{ position: "relative", width: 64, height: 80, flexShrink: 0 }}>
                {item.productImage ? (
                  <img src={item.productImage} alt={item.productName} style={{ width: 64, height: 80, borderRadius: 10, objectFit: "cover", filter: "grayscale(1)", opacity: 0.55 }} />
                ) : (
                  <span style={{ width: 64, height: 80, borderRadius: 10, background: t.stepBg, display: "block" }} />
                )}
                <span style={{ position: "absolute", left: 4, bottom: 4, fontSize: 10, fontWeight: 800, color: "#fff", background: "#3C4043", borderRadius: 6, padding: "2px 5px" }}>Sold out</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.muted }}>{item.productName}</div>
                <div style={{ fontSize: 12, color: t.faint, marginTop: 2 }}>
                  {[variantText(item), "not included in checkout"].filter(Boolean).join(" · ")}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => findSimilar(item.productName)} style={{ height: 34, padding: "0 12px", border: `1px solid ${t.link}`, borderRadius: 17, background: t.card, color: t.link, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Find similar</button>
                  <button onClick={() => onRemoveItem(item.id)} style={{ height: 34, padding: "0 12px", border: 0, background: "none", color: t.danger, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: F }}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Order summary */}
      {available.length > 0 && (
        <section data-testid="cart-summary" style={{ margin: "16px 12px 0", background: t.card, borderRadius: 16, padding: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12 }}>Order summary</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 9, fontSize: 14 }}>
            <div style={row}><span style={{ color: t.muted }}>Items ({sum.itemCount})</span><span>{money(sum.itemsOriginal)}</span></div>
            <div style={row}><span style={{ color: t.muted }}>Discounts</span><span style={{ color: t.link, fontWeight: 700 }}>− {money(sum.discounts)}</span></div>
            <div style={row}><span style={{ color: t.muted }}>Delivery</span><span style={{ color: t.muted }}>After location</span></div>
            <div style={row}>
              <span style={{ color: t.muted }}>Shop coupons</span>
              {sum.coupon > 0 ? <span style={{ color: t.link, fontWeight: 700 }}>− {money(sum.coupon)}</span> : <span>—</span>}
            </div>
            <div style={row}><span style={{ color: t.muted }}>Charges (Paystack {feePercent}%)</span><span data-testid="cart-paystack-charge">{money(sum.fee)}</span></div>
            <div style={{ height: 1, background: t.border, margin: "2px 0" }} />
            <div style={{ ...row, fontSize: 16, fontWeight: 800 }}><span>Total so far</span><span data-testid="cart-total">{money(sum.total)}</span></div>
          </div>
        </section>
      )}

      {/* Checkout bar */}
      {available.length > 0 && (
        <div style={{
          position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 30, background: t.card,
          borderTop: `1px solid ${t.border}`, padding: "12px 16px",
          paddingBottom: "max(16px, calc(12px + env(safe-area-inset-bottom)))",
          display: "flex", alignItems: "center", gap: 12, boxShadow: "0 -6px 20px rgba(0,0,0,0.06)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, color: t.muted }}>Total ({sum.itemCount} {sum.itemCount === 1 ? "item" : "items"})</div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.3 }}>{money(sum.total)}</div>
            {sum.savings > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: t.link }}>You save {money(sum.savings)}</div>}
          </div>
          <button
            data-testid="button-checkout"
            onClick={goCheckout}
            disabled={sum.itemCount === 0}
            style={{ height: 52, padding: "0 26px", border: 0, borderRadius: 26, background: sum.itemCount === 0 ? t.ring : t.accentDeep, color: "#fff", fontSize: 16, fontWeight: 800, cursor: sum.itemCount === 0 ? "not-allowed" : "pointer", fontFamily: F }}
          >
            Checkout ({sum.itemCount})
          </button>
        </div>
      )}
    </div>
  );
}
