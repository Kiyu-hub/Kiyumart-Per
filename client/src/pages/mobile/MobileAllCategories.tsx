/**
 * Phone "All categories" — approved redesign (26 Nov 2026).
 * Search, All / Fashion / Beauty tabs (from each category's store types),
 * "Popular now" (the 4 categories with the most products) and a grid of every
 * active category in the super admin's order. Empty ones say "Coming soon".
 */
import { goBack } from "@/lib/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fashionCardVars } from "@/components/mobile/FashionProductCard";

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL = "#009688";

interface Category {
  id: string; name: string; slug?: string; image?: string | null;
  isActive: boolean; productCount?: number | null; displayOrder?: number | null;
  storeTypes?: string[] | null;
}

// Food-only categories never appear in the fashion marketplace.
function isFoodCategory(c: Category): boolean {
  return Array.isArray(c.storeTypes) && c.storeTypes.some((t) => t === "food_beverages" || t === "restaurant");
}

const TABS: Array<{ key: string; label: string; types: string[] | null }> = [
  { key: "all", label: "All", types: null },
  { key: "fashion", label: "Fashion", types: ["clothing"] },
  { key: "beauty", label: "Beauty", types: ["beauty_cosmetics"] },
];

const itemsLabel = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;

const CSS = `
.kmc-scroll{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none}
.kmc-scroll::-webkit-scrollbar{display:none}
.kmc-pill{flex:none;height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--mo);background:var(--ms);color:var(--mt);font:600 13px ${F};cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.kmc-pill[aria-pressed="true"]{background:var(--mt);color:var(--mb);border-color:var(--mt)}
.kmc-tap{transition:transform .15s ease;-webkit-tap-highlight-color:transparent}
.kmc-tap:active{transform:scale(.97)}
.kmc-tap:focus-visible,.kmc-pill:focus-visible{outline:2px solid ${TEAL};outline-offset:2px}
@media (prefers-reduced-motion: reduce){.kmc-tap{transition:none}}
`;

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export default function MobileAllCategories() {
  const [, navigate] = useLocation();
  const isDark = useIsDark();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("all");

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories", "all-categories-page"],
    queryFn: async () => {
      const res = await fetch("/api/categories");
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d)
        ? d
            .filter((c: Category) => c.isActive !== false && !isFoodCategory(c))
            .sort((a: Category, b: Category) => (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0))
        : [];
    },
    staleTime: 60_000,
  });

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const t of TABS) out[t.key] = t.types ? categories.filter((c) => (c.storeTypes || []).some((s) => t.types!.includes(s))).length : categories.length;
    return out;
  }, [categories]);
  const tabs = TABS.filter((t) => t.key === "all" || counts[t.key] > 0);

  const inTab = useMemo(() => {
    const t = TABS.find((x) => x.key === tab);
    return t?.types ? categories.filter((c) => (c.storeTypes || []).some((s) => t.types!.includes(s))) : categories;
  }, [categories, tab]);

  const q = search.trim().toLowerCase();
  const matches = q ? inTab.filter((c) => c.name.toLowerCase().includes(q)) : inTab;
  const popular = q ? [] : [...inTab].filter((c) => (Number(c.productCount) || 0) > 0)
    .sort((a, b) => (Number(b.productCount) || 0) - (Number(a.productCount) || 0) || (Number(a.displayOrder) || 0) - (Number(b.displayOrder) || 0))
    .slice(0, 4);
  const popularIds = new Set(popular.map((c) => c.id));
  const grid = matches.filter((c) => !popularIds.has(c.id));
  const open = (c: Category) => navigate(`/products?category=${c.id}`);

  return (
    <div style={{ ...fashionCardVars(isDark), minHeight: "100dvh", background: "var(--mb)", color: "var(--mt)", fontFamily: F, paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))" } as CSSProperties}>
      <style>{CSS}</style>
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--ms)", borderBottom: "1px solid var(--mo)", paddingTop: "max(14px, env(safe-area-inset-top, 0px))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px" }}>
          <button type="button" aria-label="Back" onClick={() => goBack("/")}
            style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "var(--msh)", color: "var(--mt)", display: "grid", placeItems: "center", cursor: "pointer", flex: "none" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <h1 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 700 }}>Categories</h1>
        </div>
        <div style={{ padding: "0 16px 10px" }}>
          <div style={{ position: "relative" }}>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--mm)" strokeWidth={2.2} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search categories"
            placeholder={`Search ${categories.length || ""} categories`.replace("  ", " ")}
            style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "var(--msh)", paddingLeft: 36, paddingRight: 12, fontSize: 14, color: "var(--mt)", fontFamily: F, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {tabs.length > 1 && (
          <div className="kmc-scroll" style={{ padding: "0 16px 12px" }}>
            {tabs.map((t) => (
              <button key={t.key} type="button" className="kmc-pill" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
                {t.label} · {counts[t.key]}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "14px 10px", padding: "20px 16px 0" }}>
          {Array.from({ length: 9 }).map((_, i) => <div key={i} style={{ aspectRatio: "1", borderRadius: 16, background: "var(--msh)" }} />)}
        </div>
      ) : (
        <>
          {popular.length > 0 && (
            <section aria-label="Popular now">
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, margin: 0, padding: "20px 16px 10px" }}>Popular now</h2>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 10, padding: "0 16px" }}>
                {popular.map((c) => (
                  <button key={c.id} type="button" className="kmc-tap" onClick={() => open(c)} aria-label={`${c.name}, ${itemsLabel(Number(c.productCount) || 0)}`}
                    style={{ position: "relative", aspectRatio: "1 / 1.05", borderRadius: 16, overflow: "hidden", border: "none", padding: 0, background: c.image ? "var(--msh)" : `linear-gradient(150deg, ${TEAL}, #00332e)`, cursor: "pointer", textAlign: "left" }}>
                    {c.image && <img src={c.image} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
                    <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.7))" }} />
                    <span style={{ position: "absolute", left: 12, right: 12, bottom: 10, color: "#fff", display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2 }}>{c.name}</span>
                      <span style={{ fontSize: 12, opacity: 0.88, marginTop: 2 }}>{itemsLabel(Number(c.productCount) || 0)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {grid.length > 0 && (
            <section aria-label={q ? "Results" : "All categories"}>
              <h2 style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.3, margin: 0, padding: "22px 16px 10px" }}>
                {q ? `${matches.length} ${matches.length === 1 ? "result" : "results"}` : "All categories"}
              </h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: "14px 10px", padding: "0 16px" }}>
                {grid.map((c) => {
                  const n = Number(c.productCount) || 0;
                  return (
                    <button key={c.id} type="button" className="kmc-tap" onClick={() => open(c)}
                      style={{ border: "none", padding: 0, background: "none", textAlign: "left", cursor: "pointer", color: "var(--mt)", minWidth: 0 }}>
                      <span style={{ display: "block", aspectRatio: "1", borderRadius: 16, overflow: "hidden", background: "var(--msh)" }}>
                        {c.image && <img src={c.image} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
                      </span>
                      <span style={{ display: "block", fontSize: 12.5, fontWeight: 600, lineHeight: 1.25, marginTop: 6 }}>{c.name}</span>
                      <span style={{ display: "block", fontSize: 11, marginTop: 1, color: n > 0 ? "var(--mm)" : TEAL, fontWeight: n > 0 ? 400 : 600 }}>{n > 0 ? itemsLabel(n) : "Coming soon"}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {matches.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--mm)" }}>
              <p style={{ fontSize: 16, fontWeight: 700, color: "var(--mt)", margin: "0 0 4px" }}>No categories match “{search.trim()}”</p>
              <p style={{ fontSize: 13, margin: 0 }}>Try a shorter word, like “dress” or “shoes”.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
