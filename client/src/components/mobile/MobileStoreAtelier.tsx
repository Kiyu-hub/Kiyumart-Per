/**
 * Phone store page — approved "Atelier" lookbook (26 Nov 2026).
 *
 * Opens on the seller's own store background (banner) and profile picture
 * (logo), store name in serif, the seller's tagline, "Shop the collection" and
 * "Deals". Then real numbers (pieces · in stock · categories — no starting
 * price), an automatically chosen Featured piece, the collection with
 * category tabs + Sort & filter, and the seller's own "About the store".
 *
 * Fallbacks: no banner → collage of the store's best product photos;
 * no logo → the store's initial in its brand colour. Nothing is invented.
 */
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { goBack } from "@/lib/navigation";
import { FashionProductCard, FASHION_CARD_CSS, fashionCardVars } from "@/components/mobile/FashionProductCard";
import { FilterSheet, LISTING_CSS } from "@/components/mobile/MobileListingView";
import {
  applyFilters, availableColours, availableSizes, availableTypes, countActiveFilters, discountOf, EMPTY_FILTERS,
  editorScore, isSoldOut, pickEditorsPick, priceBounds, priceOf, sizesOf, sortProducts, sortSizes,
  type ListingFilters, type ListingSort,
} from "@/lib/listing";

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const SERIF = "Georgia,'Times New Roman',serif";
const TEAL = "#009688";

export interface AtelierStore {
  name: string;
  banner?: string | null;
  logo?: string | null;
  tagline?: string | null;
  description?: string | null;
  primaryColor?: string | null;
}

interface Props {
  store: AtelierStore;
  products: any[];
  isLoading: boolean;
  isDark: boolean;
  isWishlisted: (id: string) => boolean;
  onToggleWishlist: (id: string) => void;
}

const money = (n: number) => `GH₵${n.toFixed(2).replace(/\.00$/, "")}`;
const categoryOf = (p: any) => String(p?.categoryName || p?.category || "").trim();

function shareStore(name: string) {
  const url = window.location.href;
  try {
    if (navigator.share) { void navigator.share({ title: name, url }).catch(() => undefined); return; }
  } catch { /* fall through */ }
  try { void navigator.clipboard?.writeText(url); } catch { /* ignore */ }
}

export default function MobileStoreAtelier({ store, products, isLoading, isDark, isWishlisted, onToggleWishlist }: Props) {
  const [, navigate] = useLocation();
  const collectionRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<string | null>(null);
  const [sort, setSort] = useState<ListingSort>("newest");
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const brand = store.primaryColor || TEAL;
  const T = isDark
    ? { bg: "#111111", panel: "#1C1C1E", ink: "#F5F5F5", muted: "rgba(235,235,245,.55)", line: "rgba(255,255,255,.08)" }
    : { bg: "#FBF9F6", panel: "#F1EEE9", ink: "#111111", muted: "#7A756D", line: "#ECE7DF" };

  const active = useMemo(() => products.filter((p) => p?.isActive !== false), [products]);
  const inStock = active.filter((p) => !isSoldOut(p)).length;
  const categories = useMemo(() => {
    const seen = new Map<string, number>();
    for (const p of active) { const c = categoryOf(p); if (c) seen.set(c, (seen.get(c) || 0) + 1); }
    return Array.from(seen.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [active]);
  const featured = useMemo(() => pickEditorsPick(active), [active]);
  const hasDeals = active.some((p) => !isSoldOut(p) && discountOf(p) > 0);

  // Collage when the seller hasn't uploaded a store background yet.
  const collage = useMemo(() => {
    if (store.banner) return [];
    return active.filter((p) => Array.isArray(p.images) && p.images[0])
      .map((p) => ({ p, s: editorScore(p) }))
      .sort((a, b) => b.s - a.s)
      .slice(0, 3).map((x) => x.p.images[0]);
  }, [store.banner, active]);

  const pool = useMemo(() => (tab ? active.filter((p) => categoryOf(p) === tab) : active), [active, tab]);
  const shown = useMemo(() => sortProducts(applyFilters(pool, filters), sort), [pool, filters, sort]);
  const activeCount = countActiveFilters(filters);

  const deliveryLine = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of active) { const d = String(p?.deliveryDuration || "").trim(); if (d) counts.set(d, (counts.get(d) || 0) + 1); }
    const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return top ? `Delivery ${top[0]}` : "";
  }, [active]);

  const scrollToCollection = () => collectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  const roundBtn = (label: string, path: JSX.Element, onClick: () => void) => (
    <button type="button" aria-label={label} onClick={onClick}
      style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "rgba(255,255,255,.95)", color: "#111", display: "grid", placeItems: "center", cursor: "pointer" }}>
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{path}</svg>
    </button>
  );

  const featuredDetails = featured ? (() => {
    const spec = featured.dynamicFields?.storeSpecific || {};
    const occ = Array.isArray(spec.occasion) ? spec.occasion[0] : spec.occasion;
    const sizes = sortSizes(sizesOf(featured));
    const parts = [spec.material, occ, sizes.length > 1 ? `Sizes ${sizes[0]}–${sizes[sizes.length - 1]}` : sizes[0] ? `Size ${sizes[0]}` : ""];
    return parts.map((x) => String(x || "").trim()).filter(Boolean).join(" · ");
  })() : "";

  return (
    <div style={{ ...fashionCardVars(isDark), "--mb": T.bg, minHeight: "100dvh", background: T.bg, color: T.ink, fontFamily: F, paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))" } as CSSProperties}>
      <style>{FASHION_CARD_CSS + LISTING_CSS}</style>

      {/* ── Opening: the seller's store background + profile picture ── */}
      <header style={{ position: "relative", height: "min(74dvh, 620px)", minHeight: 480, overflow: "hidden", background: store.banner ? "#222" : `linear-gradient(150deg, ${brand}, #00332e)` }}>
        {store.banner ? (
          <img src={store.banner} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
        ) : collage.length > 0 ? (
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${collage.length}, 1fr)`, gap: 2 }}>
            {collage.map((src, i) => <img key={i} src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />)}
          </div>
        ) : null}
        <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.05) 25%,rgba(0,0,0,.1) 45%,rgba(0,0,0,.78))" }} />
        <div style={{ position: "absolute", left: 16, right: 16, top: "max(14px, env(safe-area-inset-top, 0px))", display: "flex", justifyContent: "space-between" }}>
          {roundBtn("Back", <path d="m15 5-7 7 7 7" />, () => goBack("/mobile/stores"))}
          {roundBtn("Share store", <><path d="M12 3v12M7 8l5-5 5 5" /><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" /></>, () => shareStore(store.name))}
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 30, color: "#fff", textAlign: "center" }}>
          {store.logo ? (
            <img src={store.logo} alt={`${store.name} logo`} style={{ width: 84, height: 84, borderRadius: 42, border: "2.5px solid #fff", objectFit: "cover", display: "block", margin: "0 auto", boxShadow: "0 4px 14px rgba(0,0,0,.25)", background: "#fff" }} />
          ) : (
            <div aria-hidden="true" style={{ width: 84, height: 84, borderRadius: 42, border: "2.5px solid #fff", background: brand, display: "grid", placeItems: "center", margin: "0 auto", fontFamily: SERIF, fontSize: 34 }}>
              {(store.name || "?").trim().charAt(0).toUpperCase()}
            </div>
          )}
          {active.length > 0 && (
            <div style={{ fontSize: 11, letterSpacing: 3, opacity: 0.88, marginTop: 14 }}>{active.length} {active.length === 1 ? "PIECE" : "PIECES"}</div>
          )}
          <h1 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 34, lineHeight: 1.08, margin: "8px 0 0", textTransform: "capitalize", textWrap: "balance" } as CSSProperties}>{store.name}</h1>
          {store.tagline && <p style={{ fontSize: 13.5, opacity: 0.88, margin: "8px 0 0" }}>{store.tagline}</p>}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 18 }}>
            <button type="button" onClick={scrollToCollection}
              style={{ height: 46, padding: "0 24px", borderRadius: 23, border: "none", background: "#fff", color: "#111", font: `700 14px ${F}`, cursor: "pointer" }}>
              Shop the collection
            </button>
            {hasDeals && (
              <button type="button" onClick={() => { setSort("discount"); setTab(null); scrollToCollection(); }}
                style={{ height: 46, padding: "0 18px", borderRadius: 23, border: "1.5px solid rgba(255,255,255,.8)", background: "transparent", color: "#fff", font: `600 14px ${F}`, cursor: "pointer" }}>
                Deals
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Real numbers only ── */}
      {!isLoading && active.length > 0 && (
        <div style={{ display: "flex", justifyContent: "space-around", padding: "18px 32px", borderBottom: `1px solid ${T.line}` }}>
          {[[active.length, active.length === 1 ? "Piece" : "Pieces"], [inStock, "In stock"], [categories.length, categories.length === 1 ? "Category" : "Categories"]].map(([n, l]) => (
            <div key={String(l)} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: SERIF, fontSize: 22 }}>{n}</div>
              <div style={{ fontSize: 11, letterSpacing: 1.5, color: T.muted, textTransform: "uppercase", marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Featured piece (picked automatically) ── */}
      {featured && active.length > 2 && (
        <section aria-label="Featured piece" style={{ padding: "26px 16px 0" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: TEAL, fontWeight: 800 }}>FEATURED PIECE</div>
          <div style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 14, marginTop: 12, alignItems: "end" }}>
            <button type="button" onClick={() => navigate(`/product/${featured.id}`)} aria-label={featured.name}
              style={{ aspectRatio: "3 / 4", borderRadius: 4, overflow: "hidden", border: "none", padding: 0, background: T.panel, cursor: "pointer" }}>
              <img src={featured.images?.[0]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: SERIF, fontSize: 21, lineHeight: 1.15 }}>{featured.name}</div>
              {featuredDetails && <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>{featuredDetails}</div>}
              <div style={{ marginTop: 10, display: "flex", gap: 6, alignItems: "baseline", flexWrap: "wrap" }}>
                <b style={{ color: TEAL, fontSize: 17 }}>{money(priceOf(featured))}</b>
                {Number(featured.costPrice) > priceOf(featured) && <s style={{ color: T.muted, fontSize: 12 }}>{money(Number(featured.costPrice))}</s>}
              </div>
              <button type="button" onClick={() => navigate(`/product/${featured.id}`)}
                style={{ marginTop: 12, width: "100%", height: 40, borderRadius: 20, border: "none", background: T.ink, color: T.bg, font: `700 13px ${F}`, cursor: "pointer" }}>
                View piece
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── The collection ── */}
      <div ref={collectionRef} style={{ scrollMarginTop: 0 }}>
        <div style={{ padding: "30px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontFamily: SERIF, fontWeight: 400, fontSize: 24, margin: 0 }}>The collection</h2>
          <button type="button" onClick={() => setSheetOpen(true)}
            style={{ background: "none", border: "none", color: activeCount || sort !== "newest" ? TEAL : T.muted, font: `600 13px ${F}`, cursor: "pointer", padding: 6 }}>
            Sort · Filter{activeCount ? ` (${activeCount})` : ""}
          </button>
        </div>
        {categories.length > 1 && (
          <div className="kml-scroll" role="tablist" aria-label="Categories" style={{ gap: 20, padding: "0 16px 12px" }}>
            {[null, ...categories].map((c) => {
              const on = tab === c;
              return (
                <button key={c || "all"} type="button" role="tab" aria-selected={on} onClick={() => setTab(c)}
                  style={{ flex: "none", background: "none", border: "none", padding: "4px 0", cursor: "pointer", font: `${on ? 600 : 400} 13.5px ${F}`, color: on ? T.ink : T.muted, borderBottom: `1.5px solid ${on ? T.ink : "transparent"}` }}>
                  {c ? c.split(" & ")[0] : "All"}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "20px 12px", padding: "0 16px" }}>
          {Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ aspectRatio: "3 / 4", borderRadius: 4, background: T.panel }} />)}
        </div>
      ) : shown.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 24px", color: T.muted }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: T.ink, margin: "0 0 4px" }}>{active.length === 0 ? "No pieces yet" : "Nothing matches"}</p>
          <p style={{ fontSize: 13, margin: 0 }}>{active.length === 0 ? "This store is adding its collection. Check back soon." : "Try removing a filter."}</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "20px 12px", padding: "0 16px" }}>
          {shown.map((p) => (
            <FashionProductCard key={p.id} product={p} isWishlisted={isWishlisted(p.id)} onToggleWishlist={onToggleWishlist} onClick={() => navigate(`/product/${p.id}`)} />
          ))}
        </div>
      )}

      {/* ── About the store (seller's own words) ── */}
      {(store.description || deliveryLine) && (
        <section aria-label="About the store" style={{ margin: "30px 16px 0", padding: "24px 22px", background: T.panel, borderRadius: 6, textAlign: "center" }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: TEAL, fontWeight: 800 }}>ABOUT THE STORE</div>
          {store.description && <p style={{ fontFamily: SERIF, fontStyle: "italic", fontSize: 17, lineHeight: 1.55, margin: "10px 0 0" }}>“{store.description}”</p>}
          {deliveryLine && <p style={{ fontSize: 12.5, color: T.muted, margin: "12px 0 0" }}>{deliveryLine}</p>}
        </section>
      )}

      {sheetOpen && (
        <FilterSheet
          sort={sort} filters={filters}
          sizes={availableSizes(pool)} colours={availableColours(pool)} types={availableTypes(pool)} bounds={priceBounds(pool)}
          countFor={(f) => applyFilters(pool, f).length}
          onClose={() => setSheetOpen(false)}
          onApply={(s2, f2) => { setSort(s2); setFilters(f2); setSheetOpen(false); }}
        />
      )}
    </div>
  );
}
