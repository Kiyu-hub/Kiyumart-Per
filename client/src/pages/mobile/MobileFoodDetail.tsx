import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";

// Bolt-Food-style food / dish detail page.
// Brand color is KiyuMart TEAL. Layout mirrors Bolt:
//   - Full-bleed hero image with floating back / share / heart
//   - Title + description block
//   - Modifier groups (radio = required single-select, checkbox = multi)
//   - Quantity stepper + special instructions textarea
//   - Sticky "Add to cart · GH₵xx.xx" CTA with live price.
const F = 'Inter,-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL = '#009688';
const AMBER = '#F59E0B';

interface ProductData {
  id: string;
  name: string;
  description?: string;
  price: string;
  images?: string[];
  sellerId: string;
  storeId?: string | null;
  ratings?: string;
  totalRatings?: number;
  isActive?: boolean;
  storeType?: string | null;
}

interface ModifierGroup {
  id: string;
  productId: string;
  name: string;
  options: { label: string; priceAdj: number }[];
  required: boolean;
  maxSelections: number;
}

interface StoreLite {
  id: string;
  name: string;
  prepTimeMins?: number | null;
  averageRating?: string;
}

export default function MobileFoodDetail() {
  const [, params] = useRoute<{ id: string }>("/product/:id");
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { isMobile } = useMobileDevice();
  const isDesktop = !isMobile;
  const productId = params?.id || "";

  const [isDark, setIsDark] = useState(true);
  const [selections, setSelections] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const read = () => {
      const s = localStorage.getItem('theme');
      setIsDark(s ? s === 'dark' : document.documentElement.classList.contains('dark'));
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const { data: product, isLoading } = useQuery<ProductData>({
    queryKey: ["/api/products", productId],
    queryFn: async () => {
      const r = await fetch(`/api/products/${productId}`);
      if (!r.ok) throw new Error("Not found");
      return r.json();
    },
    enabled: !!productId,
  });

  const { data: modifiers = [] } = useQuery<ModifierGroup[]>({
    queryKey: ["/api/products", productId, "modifiers"],
    queryFn: async () => {
      const r = await fetch(`/api/products/${productId}/modifiers`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    enabled: !!productId,
    staleTime: 60_000,
  });

  const { data: store } = useQuery<StoreLite | null>({
    queryKey: ["/api/stores", product?.storeId, "lite"],
    queryFn: async () => {
      if (!product?.storeId) return null;
      const r = await fetch(`/api/stores/${product.storeId}`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!product?.storeId,
  });

  // "You may also like" — other dishes from the same restaurant / vendor.
  const { data: related = [] } = useQuery<ProductData[]>({
    queryKey: ["/api/products", "food-related", product?.storeId, productId],
    queryFn: async () => {
      const r = await fetch("/api/products?isActive=true");
      if (!r.ok) return [];
      const all = await r.json();
      if (!Array.isArray(all)) return [];
      return all
        .filter((p: any) => p && p.id !== productId && String(p.storeId || "") === String(product?.storeId || ""))
        .slice(0, 12);
    },
    enabled: !!productId && !!product?.storeId,
    staleTime: 60_000,
  });

  // ── Palette ───────────────────────────────────────────
  const bg     = isDark ? '#0B0B0B' : '#F7F8FA';
  const card   = isDark ? '#161616' : '#FFFFFF';
  const bdr    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
  const txt    = isDark ? '#FFFFFF' : '#0F172A';
  const muted  = isDark ? 'rgba(235,235,245,0.55)' : 'rgba(15,23,42,0.55)';
  const inp    = isDark ? '#1F1F22' : '#EEF0F4';
  const skel   = isDark ? '#1F1F22' : '#E5E7EB';

  // ── Selection helpers ─────────────────────────────────
  const toggleOption = (group: ModifierGroup, optionLabel: string) => {
    setSelections((prev) => {
      const current = prev[group.id] || [];
      const max = Math.max(1, Number(group.maxSelections) || 1);
      // Single-select (radio) — replace.
      if (max === 1) return { ...prev, [group.id]: [optionLabel] };
      // Multi — toggle, but enforce max.
      if (current.includes(optionLabel)) {
        return { ...prev, [group.id]: current.filter((l) => l !== optionLabel) };
      }
      const next = [...current, optionLabel];
      while (next.length > max) next.shift();
      return { ...prev, [group.id]: next };
    });
  };

  // Pre-select the first option of any required single-select group so the
  // CTA is enabled by default — Bolt does the same so users can buy in one tap.
  useEffect(() => {
    if (!modifiers.length) return;
    setSelections((prev) => {
      const next = { ...prev };
      for (const m of modifiers) {
        const max = Math.max(1, Number(m.maxSelections) || 1);
        if (m.required && max === 1 && !(next[m.id] && next[m.id].length > 0) && m.options.length > 0) {
          next[m.id] = [m.options[0].label];
        }
      }
      return next;
    });
  }, [modifiers]);

  // ── Live price ────────────────────────────────────────
  const basePrice = parseFloat(String(product?.price || "0")) || 0;
  const modifierAdjustment = useMemo(() => {
    let sum = 0;
    for (const m of modifiers) {
      const chosen = selections[m.id] || [];
      for (const label of chosen) {
        const opt = m.options.find((o) => o.label === label);
        if (opt) sum += Number(opt.priceAdj) || 0;
      }
    }
    return sum;
  }, [modifiers, selections]);
  const totalPrice = (basePrice + modifierAdjustment) * Math.max(1, quantity);

  // Required-group validation — Bolt disables the CTA until every required
  // group has at least one option picked.
  const requiredMissing = useMemo(() => {
    return modifiers
      .filter((m) => m.required)
      .filter((m) => !(selections[m.id] && selections[m.id].length > 0))
      .map((m) => m.name);
  }, [modifiers, selections]);

  // ── Add to cart ───────────────────────────────────────
  const addToCart = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        navigate("/auth");
        return;
      }
      // Snapshot the chosen modifier labels + price deltas alongside the cart
      // item so the cart screen and the eventual order line stay self-describing.
      const modifierSelections = modifiers
        .map((m) => ({
          modifierId: m.id,
          groupName: m.name,
          selected: (selections[m.id] || []).map((label) => {
            const opt = m.options.find((o) => o.label === label);
            return { label, priceAdj: opt?.priceAdj || 0 };
          }),
        }))
        .filter((row) => row.selected.length > 0);

      const r = await fetch("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId,
          quantity,
          notes: notes.trim() || undefined,
          modifierSelections,
          // Final per-unit price so the cart matches the live total preview.
          unitPriceWithModifiers: basePrice + modifierAdjustment,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e?.error || "Could not add to cart");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      toast({ title: "Added to cart" });
      navigate("/cart");
    },
    onError: (err: any) => {
      toast({ title: "Add to cart failed", description: err?.message || "Try again", variant: "destructive" });
    },
  });

  const heroImg = Array.isArray(product?.images) ? product?.images[0] : undefined;

  if (isLoading || !product) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, color: txt }}>
        <div style={{ width: '100%', aspectRatio: '4 / 3', background: skel }} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ width: '60%', height: 22, borderRadius: 6, background: skel }} />
          <div style={{ width: '90%', height: 12, borderRadius: 4, background: skel }} />
          <div style={{ width: '40%', height: 14, borderRadius: 5, background: skel }} />
        </div>
      </div>
    );
  }

  const rating = parseFloat(String(product?.ratings || "0"));

  return (
    <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, color: txt, display: 'flex', flexDirection: 'column' }}>
      {/* Desktop wears the SAME chrome as the standard product detail page —
          ThemeToggle bar, site Header, a Back breadcrumb and Footer — with
          Bolt-styled content in a max-w-7xl two-column grid (hero left, details
          right). Mobile stays full-bleed with a fixed bottom CTA. */}
      {isDesktop && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', padding: 8, borderBottom: `1px solid ${bdr}`, background: card }}>
            <ThemeToggle />
          </div>
          <Header />
          <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-4">
            <button
              onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/products'); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: muted, background: 'none', border: 'none', cursor: 'pointer', fontFamily: F, fontSize: 14, padding: 0 }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              <span>Back</span>
            </button>
          </div>
        </>
      )}
      <div
        className={isDesktop ? 'max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6' : undefined}
        style={isDesktop ? { flex: 1 } : {
          margin: '0 auto', position: 'relative', minHeight: '100dvh', background: bg,
          maxWidth: 480, paddingBottom: 120,
        }}
      >
        <div className={isDesktop ? 'grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12' : undefined}>
          {/* ── LEFT column: hero (sticky on desktop) ─────────── */}
          <div className={isDesktop ? 'lg:sticky lg:top-24 lg:self-start' : undefined}>
      {/* ── Hero image ───────────────────────────────────── */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: skel, overflow: 'hidden', borderRadius: isDesktop ? 18 : 0 }}>
        {heroImg ? (
          <img src={heroImg} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 80 }}>🍽️</div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 28%)',
        }} />
        {isMobile && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
        }}>
          <FloatButton onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </FloatButton>
          <div style={{ display: 'flex', gap: 10 }}>
            <FloatButton onClick={() => {
              if (navigator.share) navigator.share({ title: product.name, url: window.location.href }).catch(() => {});
              else navigator.clipboard.writeText(window.location.href).catch(() => {});
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </FloatButton>
          </div>
        </div>
        )}
      </div>
          </div>
          {/* ── RIGHT column: details ─────────────────────────── */}
          <div>

      {/* ── Title block ──────────────────────────────────── */}
      <div style={{ padding: isDesktop ? '0 0 8px' : '16px 16px 8px' }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: txt, lineHeight: 1.15 }}>{product.name}</div>
        {store?.name && (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, color: muted, fontSize: 13 }}>
            <button
              onClick={() => product.storeId && navigate(`/sellers/${product.storeId}`)}
              style={{ background: 'none', border: 'none', padding: 0, color: muted, cursor: 'pointer', fontFamily: F, fontSize: 13, textDecoration: 'underline' }}
            >
              {store.name}
            </button>
            {rating > 0 && (
              <>
                <span>·</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <svg width={11} height={11} viewBox="0 0 24 24" fill={AMBER} stroke="none">
                    <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
                  </svg>
                  {rating.toFixed(1)}
                </span>
              </>
            )}
          </div>
        )}
        {product.description && (
          <div style={{ marginTop: 10, fontSize: 14, color: muted, lineHeight: 1.5 }}>
            {product.description}
          </div>
        )}
        <div style={{ marginTop: 12, fontSize: 22, fontWeight: 800, color: txt }}>
          GH₵ {basePrice.toFixed(2)}
        </div>
      </div>

      {/* ── Modifier groups ──────────────────────────────── */}
      {modifiers.map((group) => {
        const max = Math.max(1, Number(group.maxSelections) || 1);
        const isSingle = max === 1;
        const chosen = new Set(selections[group.id] || []);
        return (
          <div key={group.id} style={{ marginTop: 10, padding: '14px 16px', background: card, borderTop: `1px solid ${bdr}`, borderBottom: `1px solid ${bdr}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: txt }}>{group.name}</div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: group.required ? '#fff' : muted,
                background: group.required ? TEAL : 'transparent',
                border: group.required ? 'none' : `1px solid ${bdr}`,
                padding: '3px 8px', borderRadius: 999,
                letterSpacing: 0.3,
              }}>
                {group.required ? 'REQUIRED' : 'OPTIONAL'}
              </div>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, color: muted }}>
              {isSingle ? 'Select one' : `Select up to ${max}`}
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {group.options.map((opt) => {
                const active = chosen.has(opt.label);
                const adj = Number(opt.priceAdj) || 0;
                return (
                  <button
                    key={opt.label}
                    onClick={() => toggleOption(group, opt.label)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 14px',
                      background: 'transparent',
                      border: `1.5px solid ${active ? TEAL : bdr}`,
                      borderRadius: 12,
                      cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                      width: '100%',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 20, height: 20,
                        borderRadius: isSingle ? 10 : 6,
                        border: `2px solid ${active ? TEAL : bdr}`,
                        background: active ? TEAL : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0,
                      }}>
                        {active && (
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                        )}
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: txt }}>{opt.label}</span>
                    </div>
                    {adj !== 0 && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: adj > 0 ? txt : TEAL }}>
                        {adj > 0 ? `+ GH₵ ${adj.toFixed(2)}` : `- GH₵ ${Math.abs(adj).toFixed(2)}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* ── Special instructions ─────────────────────────── */}
      <div style={{ marginTop: 10, padding: '14px 16px', background: card, borderTop: `1px solid ${bdr}` }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: txt }}>Special instructions</div>
        <div style={{ marginTop: 4, fontSize: 12, color: muted }}>
          Any allergies, dietary needs, or special requests for the kitchen.
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value.slice(0, 240))}
          rows={3}
          placeholder="e.g. No onions, extra spicy, well-done"
          style={{
            marginTop: 10, width: '100%',
            background: inp, color: txt,
            border: 'none', outline: 'none',
            borderRadius: 12, padding: '12px 14px',
            fontSize: 14, fontFamily: F, resize: 'none',
            boxSizing: 'border-box' as const,
          }}
        />
        <div style={{ marginTop: 4, fontSize: 11, color: muted, textAlign: 'right' }}>{notes.length}/240</div>
      </div>

      {/* ── Sticky bottom bar: qty stepper + Add to cart ── */}
      <div style={isMobile ? {
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', bottom: 0,
        width: '100%', maxWidth: 480, boxSizing: 'border-box' as const,
        zIndex: 30,
        background: card,
        borderTop: `1px solid ${bdr}`,
        padding: '10px 16px',
        paddingBottom: 'max(10px, env(safe-area-inset-bottom, 10px))',
        display: 'flex', alignItems: 'center', gap: 12,
      } : {
        // Desktop: inline CTA at the foot of the details column.
        position: 'static', marginTop: 24,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        {/* Quantity stepper */}
        <div style={{
          display: 'flex', alignItems: 'center',
          background: inp, borderRadius: 999, padding: 4,
          flexShrink: 0,
        }}>
          <button
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            aria-label="Decrease quantity"
            style={{
              width: 32, height: 32, borderRadius: 999,
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/></svg>
          </button>
          <div style={{ minWidth: 24, textAlign: 'center', fontSize: 15, fontWeight: 800, color: txt }}>{quantity}</div>
          <button
            onClick={() => setQuantity((q) => Math.min(99, q + 1))}
            aria-label="Increase quantity"
            style={{
              width: 32, height: 32, borderRadius: 999,
              background: 'transparent', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: txt, WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>

        {/* Add to cart CTA — live total */}
        <button
          onClick={() => {
            if (requiredMissing.length > 0) {
              toast({
                title: "Make your selection",
                description: `Choose: ${requiredMissing.join(', ')}`,
                variant: "destructive",
              });
              return;
            }
            addToCart.mutate();
          }}
          disabled={addToCart.isPending}
          style={{
            flex: 1,
            height: 52,
            background: TEAL,
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            cursor: 'pointer',
            fontSize: 15, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 18px',
            opacity: addToCart.isPending ? 0.7 : 1,
            WebkitTapHighlightColor: 'transparent',
            fontFamily: F,
          }}
        >
          <span>{addToCart.isPending ? 'Adding…' : 'Add to cart'}</span>
          <span>GH₵ {totalPrice.toFixed(2)}</span>
        </button>
      </div>
          </div>
        </div>

        {related.length > 0 && (
          <div style={{ marginTop: isDesktop ? 44 : 18, padding: isDesktop ? 0 : '0 16px' }}>
            <div style={{ fontSize: isDesktop ? 22 : 18, fontWeight: 800, color: txt, marginBottom: 14 }}>
              You may also like
            </div>
            <div
              className={isDesktop ? undefined : 'scrollbar-hide'}
              style={isDesktop
                ? { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 18 }
                : { display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch' as const, scrollSnapType: 'x proximity' }}
            >
              {related.map((p) => {
                const img = Array.isArray(p.images) ? p.images[0] : undefined;
                return (
                  <button
                    key={p.id}
                    onClick={() => { navigate(`/product/${p.id}`); if (typeof window !== 'undefined') window.scrollTo({ top: 0 }); }}
                    style={{
                      flexShrink: 0, width: isDesktop ? 'auto' : 152, textAlign: 'left',
                      background: card, border: `1px solid ${bdr}`, borderRadius: 14, overflow: 'hidden',
                      cursor: 'pointer', padding: 0, fontFamily: F, scrollSnapAlign: 'start' as const,
                    }}
                  >
                    <div style={{ width: '100%', aspectRatio: '1 / 1', background: skel }}>
                      {img
                        ? <img src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 40 }}>🍽️</div>}
                    </div>
                    <div style={{ padding: 10 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: txt, lineHeight: 1.25,
                        overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                        WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, minHeight: 32,
                      }}>
                        {p.name}
                      </div>
                      <div style={{ marginTop: 6, fontSize: 13, fontWeight: 800, color: TEAL }}>
                        GH₵ {(parseFloat(String(p.price || '0')) || 0).toFixed(2)}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      {isDesktop && <Footer />}
    </div>
  );
}

function FloatButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 38, height: 38, borderRadius: 19,
        background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
        border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      {children}
    </button>
  );
}
