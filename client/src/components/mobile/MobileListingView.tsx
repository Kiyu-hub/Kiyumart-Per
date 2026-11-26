/**
 * Phone product listing — approved redesign (26 Nov 2026) for:
 *   New arrivals  (/products?section=new-arrivals)
 *   Featured      (/products?section=featured)
 *   Category      (/products?category=…)
 *   All products  (/products)
 *
 * Same FashionProductCard as the homepage. Sizes, colours, "Shop by type",
 * price range and the Editor's pick all come from the products themselves.
 * Sold-out products stay visible (labelled) and always sort last.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useLocation } from "wouter";
import { goBack } from "@/lib/navigation";
import {
  FashionProductCard, FashionProductSkeleton, FASHION_CARD_CSS, fashionCardVars,
} from "@/components/mobile/FashionProductCard";
import {
  applyFilters, availableColours, isSoldOut, availableSizes, availableTypes, countActiveFilters, discountOf,
  EMPTY_FILTERS, groupByArrival, pickEditorsPick, priceBounds, priceOf, sortProducts, swatchFor,
  type ListingFilters, type ListingSort,
} from "@/lib/listing";

export type ListingMode = "all" | "featured" | "new-arrivals" | "category";

interface Props {
  mode: ListingMode;
  title: string;
  products: any[];
  isLoading: boolean;
  category?: any | null;
  chips: any[];
  selectedChip: string | null;
  onSelectChip: (slug: string | null) => void;
  search: string;
  onSearch: (q: string) => void;
  isWishlisted: (id: string) => boolean;
  onToggleWishlist: (id: string) => void;
  storeNameFor: (p: any) => string | null;
  isDark: boolean;
}

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL = "#009688";
const C_RED = "#EF4444";
const SORT_LABELS: Record<ListingSort, string> = {
  newest: "Newest", "price-asc": "Price: low to high", "price-desc": "Price: high to low", discount: "Biggest discount",
};
const money = (n: number) => `GH₵${n.toFixed(2)}`;
const DAY = 86_400_000;

const CSS = `
.kml-scroll{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.kml-scroll::-webkit-scrollbar{display:none}
.kml-pill{flex:none;height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--mo);background:var(--ms);color:var(--mt);font:600 13px ${F};display:inline-flex;align-items:center;gap:6px;cursor:pointer;-webkit-tap-highlight-color:transparent;white-space:nowrap}
.kml-pill[aria-pressed="true"]{background:var(--mt);color:var(--mb);border-color:var(--mt)}
.kml-pill:focus-visible,.kml-ic:focus-visible{outline:2px solid ${TEAL};outline-offset:2px}
.kml-ic{width:40px;height:40px;border-radius:20px;border:none;display:grid;place-items:center;cursor:pointer;flex:none;-webkit-tap-highlight-color:transparent}
.kml-range{position:relative;height:28px}
.kml-range input{position:absolute;inset:0;width:100%;margin:0;background:none;pointer-events:none;-webkit-appearance:none;appearance:none;height:28px}
.kml-range input::-webkit-slider-thumb{pointer-events:auto;-webkit-appearance:none;width:24px;height:24px;border-radius:12px;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.35);cursor:pointer}
.kml-range input::-moz-range-thumb{pointer-events:auto;width:24px;height:24px;border:none;border-radius:12px;background:#fff;box-shadow:0 1px 5px rgba(0,0,0,.35);cursor:pointer}
@media (prefers-reduced-motion: reduce){.kml-sheet{animation:none!important}}
@keyframes kmlUp{from{transform:translateY(100%)}to{transform:none}}
`;

const Icon = ({ d, size = 18, color = "currentColor", width = 2.2 }: { d: ReactNode; size?: number; color?: string; width?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const BACK = <path d="m15 5-7 7 7 7" />;
const SEARCH = <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>;
const HEART = <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z" />;
const SORT = <><path d="M7 4v16M3 8l4-4 4 4" /><path d="M17 20V4M13 16l4 4 4-4" /></>;
const FILTER = <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14" /><circle cx="16" cy="6" r="2" /><circle cx="8" cy="12" r="2" /><circle cx="18" cy="18" r="2" /></>;

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return light
    ? <span style={{ display: "inline-block", background: TEAL, color: "#fff", fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase", padding: "4px 8px", borderRadius: 6 }}>{children}</span>
    : <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase", color: TEAL }}>{children}</div>;
}

const Label = ({ children }: { children: ReactNode }) => (
  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, color: "var(--mm)", textTransform: "uppercase", margin: "18px 0 8px" }}>{children}</div>
);

export default function MobileListingView(props: Props) {
  const { mode, title, products, isLoading, category, chips, selectedChip, onSelectChip, search, onSearch, isWishlisted, onToggleWishlist, storeNameFor, isDark } = props;
  const [, navigate] = useLocation();
  const [sort, setSort] = useState<ListingSort>("newest");
  const [filters, setFilters] = useState<ListingFilters>(EMPTY_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);

  const vars = fashionCardVars(isDark);
  const openProduct = (id: string) => navigate(`/product/${id}`);

  // Featured: the best-presented in-stock product leads the page.
  const hero = useMemo(() => (mode === "featured" ? pickEditorsPick(products) : null), [mode, products]);
  const pool = useMemo(() => (hero ? products.filter((p) => p.id !== hero.id) : products), [products, hero]);

  const sizes = useMemo(() => availableSizes(pool), [pool]);
  const colours = useMemo(() => availableColours(pool), [pool]);
  const types = useMemo(() => availableTypes(pool), [pool]);
  const bounds = useMemo(() => priceBounds(pool), [pool]);
  const shown = useMemo(() => sortProducts(applyFilters(pool, filters), sort), [pool, filters, sort]);
  const activeCount = countActiveFilters(filters);
  // "All products": biggest discounts on in-stock items (hidden while searching).
  const deals = useMemo(
    () => (mode === "all" && !search.trim() ? sortProducts(pool.filter((p) => !isSoldOut(p) && discountOf(p) > 0), "discount").slice(0, 10) : []),
    [mode, search, pool],
  );

  const toggle = (key: "sizes" | "colours" | "types", value: string) =>
    setFilters((f) => ({ ...f, [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value] }));

  const recentCount = products.filter((p) => Date.now() - new Date(p?.createdAt || 0).getTime() < 7 * DAY).length;
  const minPrice = bounds?.min ?? 0;

  const card = (p: any, tag?: "new") => (
    <FashionProductCard key={p.id} product={p} tag={tag} storeName={storeNameFor(p)} isWishlisted={isWishlisted(p.id)}
      onToggleWishlist={onToggleWishlist} onClick={() => openProduct(p.id)} />
  );
  const grid = (items: ReactNode) => (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: "18px 12px", padding: "14px 16px 0" }}>{items}</div>
  );

  const roundBtn = (label: string, d: ReactNode, onClick: () => void, onImage = false) => (
    <button type="button" className="kml-ic" aria-label={label} onClick={onClick}
      style={{ background: onImage ? "rgba(255,255,255,0.95)" : "var(--msh)", color: onImage ? "#111" : "var(--mt)" }}>
      <Icon d={d} color={onImage ? "#111" : "currentColor"} />
    </button>
  );

  const topBar = (withSearchIcon: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px", paddingTop: "max(14px, env(safe-area-inset-top, 0px))", background: "var(--ms)" }}>
      {roundBtn("Back", BACK, () => goBack("/"))}
      <h1 style={{ flex: 1, textAlign: withSearchIcon ? "center" : "left", fontSize: 17, fontWeight: 700, margin: 0, color: "var(--mt)" }}>{title}</h1>
      {withSearchIcon ? roundBtn("Search", SEARCH, () => navigate("/search")) : <span style={{ fontSize: 13, fontWeight: 600, color: "var(--mm)", textAlign: "right" }}>{products.length ? `${products.length} ${products.length === 1 ? "item" : "items"}` : ""}</span>}
    </div>
  );

  const categoryChips = chips.length > 0 && mode !== "category" && mode !== "all" && (
    <div className="kml-scroll" style={{ padding: "10px 16px", background: "var(--ms)" }}>
      <button type="button" className="kml-pill" aria-pressed={!selectedChip} onClick={() => onSelectChip(null)}>All</button>
      {chips.map((c: any) => (
        <button key={c.id} type="button" className="kml-pill" aria-pressed={selectedChip === c.slug} onClick={() => onSelectChip(selectedChip === c.slug ? null : c.slug)}>{c.name}</button>
      ))}
    </div>
  );

  // Sticky Sort / Filter bar (+ quick sizes on category pages).
  const toolbar = (
    <div id="kml-results" style={{ position: "sticky", top: 0, zIndex: 15, background: "var(--ms)", borderBottom: "1px solid var(--mo)", paddingTop: "env(safe-area-inset-top, 0px)", scrollMarginTop: 0 }}>
      <div className="kml-scroll" style={{ padding: "10px 16px", alignItems: "center" }}>
        <button type="button" className="kml-pill" onClick={() => setSheetOpen(true)} aria-label={`Sort: ${SORT_LABELS[sort]}`}>
          <Icon d={SORT} size={15} /> {sort === "newest" ? "Sort" : SORT_LABELS[sort]}
        </button>
        <button type="button" className="kml-pill" onClick={() => setSheetOpen(true)} aria-pressed={activeCount > 0}>
          <Icon d={FILTER} size={15} /> Filter{activeCount > 0 ? ` · ${activeCount}` : ""}
        </button>
        {mode === "all" && (
          <button type="button" className="kml-pill" aria-pressed={filters.inStockOnly} onClick={() => setFilters((f) => ({ ...f, inStockOnly: !f.inStockOnly }))}>In stock</button>
        )}
        {mode === "category" && sizes.length > 0 && (
          <>
            <span aria-hidden="true" style={{ width: 1, alignSelf: "stretch", background: "var(--mo)", margin: "4px 2px", flex: "none" }} />
            {sizes.map((s) => (
              <button key={s} type="button" className="kml-pill" aria-pressed={filters.sizes.includes(s)} onClick={() => toggle("sizes", s)} style={{ minWidth: 44, justifyContent: "center" }}>{s}</button>
            ))}
          </>
        )}
      </div>
    </div>
  );

  const resultsLine = !isLoading && (
    <div style={{ padding: "12px 16px 0", fontSize: 12.5, color: "var(--mm)" }}>
      {filters.sizes.length > 0 ? `Size ${filters.sizes.join(", ")} · ` : ""}{shown.length} {shown.length === 1 ? "result" : "results"}
      {activeCount > 0 && (
        <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} style={{ marginLeft: 10, background: "none", border: "none", color: TEAL, fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0 }}>Clear</button>
      )}
    </div>
  );

  const empty = (
    <div style={{ textAlign: "center", padding: "56px 24px", color: "var(--mm)" }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: "var(--mt)", margin: "0 0 4px" }}>
        {activeCount > 0 ? "Nothing matches these filters" : mode === "category" ? "No products here yet" : "No products found"}
      </p>
      <p style={{ fontSize: 13, margin: 0 }}>{activeCount > 0 ? "Try removing a filter." : "New items are added often. Check back soon."}</p>
      {activeCount > 0 && (
        <button type="button" className="kml-pill" style={{ margin: "16px auto 0" }} onClick={() => setFilters(EMPTY_FILTERS)}>Clear filters</button>
      )}
    </div>
  );

  let body: ReactNode;
  if (isLoading) body = grid(Array.from({ length: 6 }).map((_, i) => <FashionProductSkeleton key={i} />));
  else if (shown.length === 0) body = empty;
  else if (mode === "new-arrivals" && sort === "newest") {
    body = groupByArrival(shown).map((g) => (
      <section key={g.key} aria-label={g.title}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "18px 16px 0" }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>{g.title}</h2>
          <span style={{ fontSize: 12, color: "var(--mm)" }}>{g.products.length} new</span>
        </div>
        {grid(g.products.map((p) => card(p, g.key === "today" ? "new" : undefined)))}
      </section>
    ));
  } else body = grid(shown.map((p) => card(p)));

  // ── Page heads ──────────────────────────────────────────────────────────
  let head: ReactNode;
  if (mode === "featured" && hero) {
    const disc = discountOf(hero);
    const cost = Number(hero.costPrice) || 0;
    const img = Array.isArray(hero.images) ? hero.images[0] : hero.images;
    head = (
      <>
        <div style={{ position: "relative", height: "min(66dvh, 560px)", minHeight: 420, overflow: "hidden", background: "var(--msh)" }}>
          {img && <img src={img} alt={hero.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block" }} />}
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.25) 0%,rgba(0,0,0,0) 22%,rgba(0,0,0,0) 50%,rgba(0,0,0,.72) 100%)" }} />
          <div style={{ position: "absolute", left: 16, right: 16, top: "max(14px, env(safe-area-inset-top, 0px))", display: "flex", justifyContent: "space-between" }}>
            {roundBtn("Back", BACK, () => goBack("/"), true)}
            <button type="button" className="kml-ic" aria-label={isWishlisted(hero.id) ? "Remove from wishlist" : "Add to wishlist"} aria-pressed={isWishlisted(hero.id)}
              onClick={() => onToggleWishlist(hero.id)} style={{ background: "rgba(255,255,255,0.95)" }}>
              <svg width={17} height={17} viewBox="0 0 24 24" fill={isWishlisted(hero.id) ? C_RED : "none"} stroke={isWishlisted(hero.id) ? C_RED : "#111"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{HEART}</svg>
            </button>
          </div>
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 22, color: "#fff" }}>
            <Eyebrow light>Editor's pick</Eyebrow>
            <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.15, margin: "8px 0 0", textWrap: "balance" } as CSSProperties}>{hero.name}</h1>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <b style={{ fontSize: 18 }}>{money(priceOf(hero))}</b>
              {cost > priceOf(hero) && <s style={{ opacity: 0.75, fontSize: 13 }}>{money(cost)}</s>}
              {disc > 0 && <span style={{ background: C_RED, fontSize: 10.5, fontWeight: 800, padding: "3px 7px", borderRadius: 6 }}>{disc}% OFF</span>}
            </div>
            <button type="button" onClick={() => openProduct(hero.id)} style={{ marginTop: 14, height: 44, padding: "0 22px", borderRadius: 22, border: "none", background: "#fff", color: "#111", font: `700 14px ${F}`, cursor: "pointer" }}>Shop this look</button>
          </div>
        </div>
        <div style={{ background: "var(--ms)", padding: "18px 16px 6px" }}>
          <Eyebrow>Featured picks</Eyebrow>
          <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.4, margin: "4px 0 0" }}>Hand-picked by KiyuMart</h2>
          <p style={{ fontSize: 13.5, color: "var(--mm)", margin: "6px 0 0" }}>Pieces our team loves · {products.length} {products.length === 1 ? "item" : "items"}</p>
        </div>
      </>
    );
  } else if (mode === "category") {
    const cover = category?.image || (Array.isArray(pool[0]?.images) ? pool[0].images[0] : null);
    const genders = Array.from(new Set(products.map((p) => String(p?.dynamicFields?.storeSpecific?.genderTarget || "").trim()).filter(Boolean))).slice(0, 2);
    head = (
      <>
        <div style={{ position: "relative", height: 230, overflow: "hidden", background: cover ? "#222" : `linear-gradient(135deg, ${TEAL}, #00564f)` }}>
          {cover && <img src={cover} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 20%", display: "block" }} />}
          <div aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,.3),rgba(0,0,0,.05) 35%,rgba(0,0,0,.7))" }} />
          <div style={{ position: "absolute", left: 16, right: 16, top: "max(14px, env(safe-area-inset-top, 0px))", display: "flex", justifyContent: "space-between" }}>
            {roundBtn("Back", BACK, () => goBack("/categories"), true)}
            {roundBtn("Search", SEARCH, () => navigate("/search"), true)}
          </div>
          <div style={{ position: "absolute", left: 20, right: 20, bottom: 18, color: "#fff" }}>
            {genders.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.88 }}>{genders.join(" · ")}</div>}
            <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.6, margin: 0, lineHeight: 1.15 }}>{title}</h1>
            <div style={{ fontSize: 13, opacity: 0.88, marginTop: 2 }}>
              {products.length} {products.length === 1 ? "product" : "products"}{bounds ? ` · from ${money(minPrice).replace(".00", "")}` : ""}
            </div>
          </div>
        </div>
        {types.length >= 2 && (
          <div style={{ background: "var(--ms)", padding: "12px 0 2px" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--mm)", padding: "0 16px 8px", letterSpacing: 0.4 }}>SHOP BY TYPE</div>
            <div className="kml-scroll" style={{ padding: "0 16px 8px" }}>
              <button type="button" className="kml-pill" aria-pressed={filters.types.length === 0} onClick={() => setFilters((f) => ({ ...f, types: [] }))}>All</button>
              {types.map((t) => (
                <button key={t} type="button" className="kml-pill" aria-pressed={filters.types.includes(t)} onClick={() => setFilters((f) => ({ ...f, types: f.types.includes(t) ? [] : [t] }))}>{t}</button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  } else if (mode === "new-arrivals") {
    head = (
      <>
        {topBar(true)}
        <div style={{ background: "var(--ms)", padding: "6px 16px 12px" }}>
          <Eyebrow>Just landed</Eyebrow>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.1, margin: "6px 0 0" }}>{recentCount > 0 ? "New this week" : "Latest arrivals"}</h2>
          <p style={{ fontSize: 13.5, color: "var(--mm)", margin: "6px 0 0" }}>
            {recentCount > 0 ? `${recentCount} ${recentCount === 1 ? "piece" : "pieces"} added in the last 7 days` : `${products.length} ${products.length === 1 ? "piece" : "pieces"}`}
          </p>
        </div>
      </>
    );
  } else {
    const shortcuts = chips.filter((c: any) => c?.image);
    head = (
      <>
        {topBar(false)}
        <div style={{ background: "var(--ms)", padding: "0 16px 10px" }}>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "var(--mm)", display: "grid" }}><Icon d={SEARCH} size={15} /></span>
            <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search dresses, abayas, shoes…" aria-label="Search products"
              style={{ width: "100%", height: 38, borderRadius: 10, border: "none", background: "var(--msh)", paddingLeft: 34, paddingRight: 12, fontSize: 14, color: "var(--mt)", fontFamily: F, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {shortcuts.length > 0 && (
          <nav aria-label="Categories" className="kml-scroll" style={{ gap: 14, padding: "4px 16px 14px", background: "var(--ms)" }}>
            {shortcuts.map((c: any) => (
              <button key={c.id} type="button" onClick={() => navigate(`/products?category=${c.id}`)}
                style={{ flex: "none", width: 68, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--mt)", textAlign: "center" }}>
                <img src={c.image} alt="" loading="lazy" style={{ width: 62, height: 62, borderRadius: 31, objectFit: "cover", display: "block", margin: "0 auto", background: "var(--msh)" }} />
                <span style={{ display: "block", fontSize: 11, fontWeight: 600, lineHeight: 1.2, marginTop: 5 }}>{String(c.name).split(" & ")[0]}</span>
              </button>
            ))}
          </nav>
        )}
        {deals.length > 0 && (
          <section aria-label="Top deals">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "20px 16px 10px" }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, margin: 0 }}>Top deals</h2>
              <button type="button" onClick={() => { setSort("discount"); document.getElementById("kml-results")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                style={{ background: "none", border: "none", color: TEAL, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 4 }}>See all</button>
            </div>
            <div className="kml-scroll" style={{ gap: 12, padding: "0 16px 4px" }}>
              {deals.map((p) => <div key={p.id} style={{ flex: "none", width: 150 }}>{card(p)}</div>)}
            </div>
          </section>
        )}
        <div style={{ height: 16 }} />
      </>
    );
  }

  return (
    <div style={{ ...vars, minHeight: "100dvh", background: "var(--mb)", color: "var(--mt)", fontFamily: F, paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))" } as CSSProperties}>
      <style>{FASHION_CARD_CSS + CSS}</style>
      {head}
      {categoryChips}
      {toolbar}
      {resultsLine}
      {body}
      {sheetOpen && (
        <FilterSheet
          sort={sort} filters={filters} sizes={sizes} colours={colours} types={types} bounds={bounds}
          countFor={(f) => applyFilters(pool, f).length}
          onClose={() => setSheetOpen(false)}
          onApply={(s, f) => { setSort(s); setFilters(f); setSheetOpen(false); }}
        />
      )}
    </div>
  );
}

function FilterSheet({ sort, filters, sizes, colours, types, bounds, countFor, onClose, onApply }: {
  sort: ListingSort; filters: ListingFilters; sizes: string[]; colours: string[]; types: string[];
  bounds: { min: number; max: number } | null;
  countFor: (f: ListingFilters) => number;
  onClose: () => void; onApply: (s: ListingSort, f: ListingFilters) => void;
}) {
  const [s, setS] = useState<ListingSort>(sort);
  const [f, setF] = useState<ListingFilters>(filters);
  const lo = f.minPrice ?? bounds?.min ?? 0;
  const hi = f.maxPrice ?? bounds?.max ?? 0;
  const span = bounds ? Math.max(bounds.max - bounds.min, 1) : 1;
  const pct = (v: number) => (bounds ? ((v - bounds.min) / span) * 100 : 0);
  const tog = (key: "sizes" | "colours" | "types", v: string) =>
    setF((x) => ({ ...x, [key]: x[key].includes(v) ? x[key].filter((y) => y !== v) : [...x[key], v] }));
  const count = countFor(f);

  return (
    <div role="dialog" aria-modal="true" aria-label="Sort and filter" data-fullscreen style={{ position: "fixed", inset: 0, zIndex: 60 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.45)" }} />
      <div className="kml-sheet" style={{ position: "absolute", left: 0, right: 0, bottom: 0, maxHeight: "90dvh", display: "flex", flexDirection: "column", background: "var(--ms)", color: "var(--mt)", borderRadius: "22px 22px 0 0", animation: "kmlUp .22s ease-out" }}>
        <div style={{ padding: "10px 20px 0" }}>
          <div aria-hidden="true" style={{ width: 40, height: 5, borderRadius: 3, background: "var(--mo)", margin: "0 auto 12px" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <b style={{ fontSize: 19 }}>Sort &amp; filter</b>
            <button type="button" onClick={() => { setS("newest"); setF(EMPTY_FILTERS); }} style={{ background: "none", border: "none", color: TEAL, fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 8 }}>Clear all</button>
          </div>
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 8px", WebkitOverflowScrolling: "touch" } as CSSProperties}>
          <Label>Sort by</Label>
          <div role="radiogroup" aria-label="Sort by">
            {(Object.keys(SORT_LABELS) as ListingSort[]).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={s === k} onClick={() => setS(k)}
                style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", height: 46, background: "none", border: "none", padding: 0, color: "var(--mt)", font: `${s === k ? 700 : 400} 15px ${F}`, cursor: "pointer" }}>
                {SORT_LABELS[k]}
                <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 11, border: `2px solid ${s === k ? TEAL : "var(--mo)"}`, display: "grid", placeItems: "center" }}>
                  {s === k && <i style={{ width: 10, height: 10, borderRadius: 5, background: TEAL }} />}
                </span>
              </button>
            ))}
          </div>

          {sizes.length > 0 && (<>
            <Label>Size</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {sizes.map((x) => <button key={x} type="button" className="kml-pill" aria-pressed={f.sizes.includes(x)} onClick={() => tog("sizes", x)} style={{ minWidth: 48, justifyContent: "center" }}>{x}</button>)}
            </div>
          </>)}

          {colours.length > 0 && (<>
            <Label>Colour</Label>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
              {colours.map((c) => {
                const on = f.colours.includes(c);
                return (
                  <button key={c} type="button" aria-pressed={on} aria-label={c} onClick={() => tog("colours", c)}
                    style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--mm)", font: `500 11px ${F}`, width: 52 }}>
                    <span style={{ width: 34, height: 34, borderRadius: 17, background: swatchFor(c), boxShadow: on ? `0 0 0 2px var(--ms), 0 0 0 4px ${TEAL}` : "0 0 0 1px var(--mo)" }} />
                    <span style={{ maxWidth: 52, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: on ? "var(--mt)" : undefined }}>{c}</span>
                  </button>
                );
              })}
            </div>
          </>)}

          {types.length > 0 && (<>
            <Label>Type</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {types.map((t) => <button key={t} type="button" className="kml-pill" aria-pressed={f.types.includes(t)} onClick={() => tog("types", t)}>{t}</button>)}
            </div>
          </>)}

          {bounds && bounds.max > bounds.min && (<>
            <Label>Price (GH₵)</Label>
            <div className="kml-range">
              <div aria-hidden="true" style={{ position: "absolute", top: 12, left: 0, right: 0, height: 4, borderRadius: 2, background: "var(--msh)" }} />
              <div aria-hidden="true" style={{ position: "absolute", top: 12, height: 4, left: `${pct(lo)}%`, right: `${100 - pct(hi)}%`, background: TEAL }} />
              <input type="range" aria-label="Lowest price" min={bounds.min} max={bounds.max} step={1} value={lo}
                onChange={(e) => { const v = Math.min(Number(e.target.value), hi); setF((x) => ({ ...x, minPrice: v <= bounds.min ? null : v })); }} />
              <input type="range" aria-label="Highest price" min={bounds.min} max={bounds.max} step={1} value={hi}
                onChange={(e) => { const v = Math.max(Number(e.target.value), lo); setF((x) => ({ ...x, maxPrice: v >= bounds.max ? null : v })); }} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--mm)", marginTop: 2 }}>
              <span>{money(lo).replace(".00", "")}</span><span>{money(hi).replace(".00", "")}</span>
            </div>
          </>)}

          <button type="button" role="switch" aria-checked={f.inStockOnly} onClick={() => setF((x) => ({ ...x, inStockOnly: !x.inStockOnly }))}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, background: "none", border: "none", padding: "6px 0", color: "var(--mt)", font: `400 15px ${F}`, cursor: "pointer" }}>
            In stock only
            <span aria-hidden="true" style={{ width: 51, height: 31, borderRadius: 16, background: f.inStockOnly ? TEAL : "var(--msh)", position: "relative", transition: "background .15s" }}>
              <i style={{ position: "absolute", top: 2, left: f.inStockOnly ? 22 : 2, width: 27, height: 27, borderRadius: 14, background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,.25)", transition: "left .15s" }} />
            </span>
          </button>
        </div>
        <div style={{ padding: "12px 20px", paddingBottom: "max(16px, env(safe-area-inset-bottom, 0px))", borderTop: "1px solid var(--mo)" }}>
          <button type="button" onClick={() => onApply(s, f)} disabled={count === 0}
            style={{ width: "100%", height: 52, borderRadius: 26, border: "none", background: count === 0 ? "var(--msh)" : TEAL, color: count === 0 ? "var(--mm)" : "#fff", font: `700 16px ${F}`, cursor: count === 0 ? "default" : "pointer" }}>
            {count === 0 ? "No matches" : `Show ${count} ${count === 1 ? "result" : "results"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
