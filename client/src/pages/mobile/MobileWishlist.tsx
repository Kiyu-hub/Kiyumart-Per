import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQueries, useQuery } from "@tanstack/react-query";
import { goBack } from "@/lib/navigation";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { priceOf, discountOf, isSoldOut, sizesOf, coloursOf } from "@/lib/listing";

/*
 * Phone wishlist — approved design (28 Nov 2026, docs/design/wishlist-profile-20261128).
 * Same look as the phone cart. Prices use the checkout rule, the discount badge is
 * the app's red "% OFF", sold-out items are greyed with "Find similar".
 * Desktop wishlist is unchanged.
 */

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';

function useIsDark() {
  const read = () => {
    const s = localStorage.getItem("theme");
    return s ? s === "dark" : document.documentElement.classList.contains("dark");
  };
  const [isDark, setIsDark] = useState(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const money = (n: number) =>
  "GH₵" + (Math.round(n * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const HeartIcon = ({ filled, color }: { filled: boolean; color: string }) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill={filled ? color : "none"} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

interface Props {
  wishlistProducts: any[];
  isLoading: boolean;
  isAuthenticated: boolean;
  authLoading: boolean;
  onRemove: (productId: string) => void;
}

export function MobileWishlist({ wishlistProducts, isLoading, isAuthenticated, authLoading, onRemove }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const isDark = useIsDark();
  const [filter, setFilter] = useState<"all" | "instock">("all");
  const [added, setAdded] = useState<string[]>([]);
  const [savedPicks, setSavedPicks] = useState<string[]>([]);

  const t = {
    bg: isDark ? "#111111" : "#F2F2F7",
    card: isDark ? "#1C1C1E" : "#FFFFFF",
    txt: isDark ? "#FFFFFF" : "#0D0D0D",
    muted: isDark ? "rgba(235,235,245,0.6)" : "#5F6368",
    faint: isDark ? "rgba(235,235,245,0.45)" : "#80868B",
    chip: isDark ? "#2C2C2E" : "#F2F2F7",
    border: isDark ? "rgba(255,255,255,0.12)" : "#E3E3E8",
    teal: "#00796B",
    tint: isDark ? "rgba(0,150,136,0.24)" : "#E0F2F1",
    link: isDark ? "#4DB6AC" : "#00796B",
    skel: isDark ? "#2C2C2E" : "#E5E5EA",
  };

  const items = (wishlistProducts || []).filter((p) => p && p.id && !p.error);
  const shown = filter === "instock" ? items.filter((p) => !isSoldOut(p)) : items;

  // Shop names for each card.
  const sellerIds = useMemo(() => Array.from(new Set(items.map((p) => p.sellerId).filter(Boolean))) as string[], [items]);
  const storeQueries = useQueries({
    queries: sellerIds.map((sid) => ({
      queryKey: ["/api/stores/by-seller", sid],
      staleTime: 5 * 60_000,
      retry: false,
      queryFn: () => fetchSameOriginJson<any>(`/api/stores/by-seller/${encodeURIComponent(sid)}`),
    })),
  });
  const shopName = (sid?: string) => {
    const i = sid ? sellerIds.indexOf(sid) : -1;
    return (i >= 0 && storeQueries[i]?.data?.name) || "";
  };

  // Empty state: popular products to start a wishlist.
  const isEmpty = !isLoading && isAuthenticated && items.length === 0;
  const { data: browseProducts = [] } = useQuery<any[]>({
    queryKey: ["/api/products", "wishlist-empty"],
    enabled: isEmpty,
    staleTime: 5 * 60_000,
    queryFn: () => fetchSameOriginJson<any[]>("/api/products?isActive=true&limit=24"),
  });
  const picks = (Array.isArray(browseProducts) ? browseProducts : [])
    .filter((p) => p?.id && p?.isActive !== false && !isSoldOut(p) && Array.isArray(p?.images) && p.images[0])
    .slice(0, 4);

  const addToCart = async (p: any) => {
    // Products with sizes or several colours need a choice first.
    if (sizesOf(p).length > 0 || coloursOf(p).length > 1) {
      navigate(`/product/${p.id}`);
      return;
    }
    try {
      await fetchSameOriginJson("/api/cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, quantity: 1 }),
      });
      setAdded((a) => (a.includes(p.id) ? a : [...a, p.id]));
      queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
    } catch {
      toast({ title: "Couldn't add to cart", description: "Please try again.", variant: "destructive" });
    }
  };

  const savePick = async (p: any) => {
    try {
      await fetchSameOriginJson("/api/wishlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id }),
      });
      setSavedPicks((s) => [...s, p.id]);
      queryClient.invalidateQueries({ queryKey: ["/api/wishlist"] });
    } catch {
      toast({ title: "Couldn't save", variant: "destructive" });
    }
  };

  const findSimilar = (name: string) => {
    const q = String(name || "").replace(/^demo\s*[–-]\s*/i, "").split(/\s+/).slice(0, 3).join(" ");
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const header = (
    <header style={{ position: "sticky", top: 0, zIndex: 20, display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", paddingTop: "max(14px, env(safe-area-inset-top, 14px))", background: t.card }}>
      <button aria-label="Back" onClick={() => goBack("/")} style={{ width: 44, height: 44, border: 0, borderRadius: 22, background: t.chip, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={t.txt} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div data-testid="text-page-title" style={{ fontSize: 20, fontWeight: 800 }}>Wishlist</div>
        {items.length > 0 && <div style={{ fontSize: 12, color: t.muted }}>{items.length} {items.length === 1 ? "saved item" : "saved items"}</div>}
      </div>
    </header>
  );

  const badge = (text: string, dark: boolean) => (
    <span style={{ position: "absolute", top: 8, left: 8, fontSize: 10, fontWeight: 800, letterSpacing: 0.2, color: "#FFFFFF", borderRadius: 6, padding: "3px 7px", background: dark ? "#3C4043" : "#EF4444" }}>{text}</span>
  );

  if (!isAuthenticated && !authLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: t.bg, color: t.txt, fontFamily: F }}>
        {header}
        <section style={{ margin: "12px 12px 0", background: t.card, borderRadius: 20, padding: "28px 20px 20px", textAlign: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: t.tint, display: "grid", placeItems: "center", margin: "0 auto 16px" }}><HeartIcon filled={false} color={t.link} /></div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Sign in to see your wishlist</div>
          <button onClick={() => navigate("/auth?redirect=/wishlist")} style={{ marginTop: 14, height: 52, width: "100%", border: 0, borderRadius: 26, background: t.teal, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: F }}>Sign in</button>
        </section>
      </div>
    );
  }

  if (isLoading || authLoading) {
    return (
      <div style={{ minHeight: "100dvh", background: t.bg, fontFamily: F }}>
        {header}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px" }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} style={{ background: t.card, borderRadius: 16, overflow: "hidden" }}>
              <div style={{ aspectRatio: "4 / 5", background: t.skel }} />
              <div style={{ padding: 10 }}><div style={{ height: 12, background: t.skel, borderRadius: 4, width: "80%" }} /></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div data-testid="wishlist-empty" style={{ minHeight: "100dvh", background: t.bg, color: t.txt, fontFamily: F, paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom)))" }}>
        {header}
        <section style={{ margin: "12px 12px 0", background: t.card, borderRadius: 20, padding: "28px 20px 20px", textAlign: "center" }}>
          <div style={{ width: 96, height: 96, borderRadius: 48, background: t.tint, display: "grid", placeItems: "center", margin: "0 auto 16px" }}>
            <svg width={44} height={44} viewBox="0 0 24 24" fill="none" stroke={t.link} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z" /></svg>
          </div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>Your wishlist is empty</div>
          <div style={{ fontSize: 14, color: t.muted, lineHeight: 1.5, marginBottom: 20 }}>Tap the heart on any product to save it here.</div>
          <button data-testid="button-start-shopping" onClick={() => navigate("/")} style={{ height: 52, width: "100%", border: 0, borderRadius: 26, background: t.teal, color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: F }}>Start shopping</button>
        </section>
        {picks.length > 0 && (
          <section style={{ marginTop: 22, padding: "0 12px" }}>
            <div style={{ fontSize: 16, fontWeight: 800, padding: "0 4px 10px" }}>Popular right now</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {picks.map((p) => {
                const price = priceOf(p);
                const off = discountOf(p);
                const was = off > 0 ? price / (1 - off / 100) : 0;
                const saved = savedPicks.includes(p.id);
                return (
                  <article key={p.id} style={{ background: t.card, borderRadius: 16, overflow: "hidden" }}>
                    <div style={{ position: "relative" }}>
                      <button onClick={() => navigate(`/product/${p.id}`)} aria-label={`Open ${p.name}`} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "none", cursor: "pointer" }}>
                        <img src={p.images[0]} alt={p.name} style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block", background: t.chip }} />
                      </button>
                      {off > 0 && badge(`${off}% OFF`, false)}
                      <button onClick={() => !saved && savePick(p)} aria-label={saved ? `${p.name} saved` : `Save ${p.name}`} style={{ position: "absolute", top: 6, right: 6, width: 36, height: 36, border: 0, borderRadius: 18, background: "rgba(255,255,255,0.92)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                        <HeartIcon filled={saved} color={saved ? "#E53935" : "#3C4043"} />
                      </button>
                    </div>
                    <div style={{ padding: "8px 10px 10px" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, minHeight: 34, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 4 }}>
                        <span style={{ fontSize: 14, fontWeight: 800 }}>{money(price)}</span>
                        {was > price && <span style={{ fontSize: 11, color: t.faint, textDecoration: "line-through" }}>{money(was)}</span>}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div data-testid="wishlist-page" style={{ minHeight: "100dvh", background: t.bg, color: t.txt, fontFamily: F, paddingBottom: "max(96px, calc(80px + env(safe-area-inset-bottom)))" }}>
      {header}
      <div style={{ display: "flex", gap: 8, padding: "12px 12px 4px", overflowX: "auto" }}>
        {([["all", `All (${items.length})`], ["instock", "In stock"]] as const).map(([k, label]) => {
          const on = filter === k;
          return (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={on} style={{ height: 34, padding: "0 14px", borderRadius: 17, border: `1px solid ${on ? t.teal : t.border}`, background: on ? t.teal : t.card, color: on ? "#FFFFFF" : t.txt, fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer", fontFamily: F }}>
              {label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "10px 12px 0" }}>
        {shown.map((p) => {
          const soldOut = isSoldOut(p);
          const price = priceOf(p);
          const off = discountOf(p);
          const was = off > 0 ? price / (1 - off / 100) : 0;
          const isAdded = added.includes(p.id);
          const shop = shopName(p.sellerId);
          return (
            <article key={p.id} data-testid="wishlist-item" style={{ background: t.card, borderRadius: 16, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ position: "relative" }}>
                <button onClick={() => navigate(`/product/${p.id}`)} aria-label={`Open ${p.name}`} style={{ display: "block", width: "100%", border: 0, padding: 0, background: "none", cursor: "pointer" }}>
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt={p.name} style={{ width: "100%", aspectRatio: "4 / 5", objectFit: "cover", display: "block", background: t.chip, filter: soldOut ? "grayscale(1)" : "none", opacity: soldOut ? 0.6 : 1 }} />
                  ) : (
                    <span style={{ display: "block", width: "100%", aspectRatio: "4 / 5", background: t.chip }} />
                  )}
                </button>
                {soldOut ? badge("Sold out", true) : off > 0 ? badge(`${off}% OFF`, false) : null}
                <button onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name} from wishlist`} style={{ position: "absolute", top: 6, right: 6, width: 36, height: 36, border: 0, borderRadius: 18, background: "rgba(255,255,255,0.92)", display: "grid", placeItems: "center", cursor: "pointer" }}>
                  <HeartIcon filled color="#E53935" />
                </button>
              </div>
              <div style={{ padding: "8px 10px 10px", display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
                {shop && <div style={{ fontSize: 11, color: t.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{shop}</div>}
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.3, minHeight: 34, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const }}>{p.name}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                  <span style={{ fontSize: 15, fontWeight: 800 }}>{money(price)}</span>
                  {was > price && <span style={{ fontSize: 11, color: t.faint, textDecoration: "line-through" }}>{money(was)}</span>}
                </div>
                <div style={{ flex: 1 }} />
                {soldOut ? (
                  <button onClick={() => findSimilar(p.name)} style={{ marginTop: 6, height: 36, border: `1px solid ${t.link}`, borderRadius: 18, background: t.card, color: t.link, fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: F }}>Find similar</button>
                ) : (
                  <button onClick={() => !isAdded && addToCart(p)} style={{ marginTop: 6, height: 36, border: 0, borderRadius: 18, background: isAdded ? t.tint : t.teal, color: isAdded ? t.link : "#FFFFFF", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: F }}>
                    {isAdded ? "Added ✓" : "Add to cart"}
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p style={{ textAlign: "center", color: t.muted, fontSize: 14, padding: "32px 16px" }}>Nothing in stock right now.</p>
      )}
    </div>
  );
}
