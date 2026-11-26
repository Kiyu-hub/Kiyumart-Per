/**
 * Phone "All stores" — approved option B (26 Nov 2026): storefront tiles.
 * Two-column photo tiles: the store's banner, or its best-presented product
 * photo when it has no banner; logo (or initial), name, product count and
 * "Visit store". Type chips come from the stores that actually exist.
 * The "Become a Seller" card shows only to shoppers and signed-out visitors.
 */
import { goBack } from "@/lib/navigation";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { isFoodVendorStore } from "@/lib/foodVendors";
import { STORE_TYPE_CONFIG } from "@shared/storeTypes";
import { fashionCardVars } from "@/components/mobile/FashionProductCard";
import { pickEditorsPick } from "@/lib/listing";

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL = "#009688";

interface Store {
  id: string;
  name: string;
  logo?: string | null;
  banner?: string | null;
  location?: string | null;
  productCount?: number | null;
  sellerName?: string | null;
  businessType?: string | null;
  merchantCategory?: string | null;
  storeType?: string | null;
  brandingConfig?: { primaryColor?: string | null; logoOverride?: string | null; coverImage?: string | null } | null;
}

function useIsDark() {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const obs = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

const typeLabel = (t?: string | null) => (t && (STORE_TYPE_CONFIG as any)[t]?.label) || null;

const CSS = `
.kms-scroll{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch}
.kms-scroll::-webkit-scrollbar{display:none}
.kms-pill{flex:none;height:36px;padding:0 14px;border-radius:18px;border:1px solid var(--mo);background:var(--ms);color:var(--mt);font:600 13px ${F};cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent}
.kms-pill[aria-pressed="true"]{background:var(--mt);color:var(--mb);border-color:var(--mt)}
.kms-tile{transition:transform .15s ease}
.kms-tile:active{transform:scale(.97)}
.kms-tile:focus-visible,.kms-pill:focus-visible{outline:2px solid ${TEAL};outline-offset:2px}
@media (prefers-reduced-motion: reduce){.kms-tile{transition:none}}
`;

export default function MobileAllStores() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const isDark = useIsDark();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<string | null>(null);

  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ["/api/stores", "public-listing"],
    queryFn: async () => {
      const res = await fetch("/api/stores?isActive=true&isApproved=true");
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : (d?.stores ?? []);
    },
    staleTime: 60_000,
  });
  const { data: products = [] } = useQuery<any[]>({
    queryKey: ["/api/products", "active", "stores-covers"],
    queryFn: async () => {
      const res = await fetch("/api/products?isActive=true");
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  // Food vendors live elsewhere; only fashion stores are listed.
  const fashionStores = useMemo(() => stores.filter((s) => !isFoodVendorStore(s)), [stores]);

  // Cover: banner → branding cover → the store's best-presented product photo.
  const coverFor = useMemo(() => {
    const byStore = new Map<string, any[]>();
    for (const p of products) {
      const k = String(p?.storeId || "");
      if (!byStore.has(k)) byStore.set(k, []);
      byStore.get(k)!.push(p);
    }
    return (s: Store): string | null => {
      if (s.banner) return s.banner;
      if (s.brandingConfig?.coverImage) return s.brandingConfig.coverImage;
      const list = byStore.get(String(s.id)) || [];
      const best = pickEditorsPick(list) || list[0];
      const img = Array.isArray(best?.images) ? best.images[0] : null;
      return img || null;
    };
  }, [products]);

  const types = useMemo(() => {
    const seen = new Map<string, string>();
    for (const s of fashionStores) {
      const label = typeLabel(s.storeType);
      if (s.storeType && label && !seen.has(s.storeType)) seen.set(s.storeType, label);
    }
    return Array.from(seen.entries());
  }, [fashionStores]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fashionStores.filter((s) => {
      if (type && s.storeType !== type) return false;
      if (!q) return true;
      return [s.name, s.sellerName, s.location, typeLabel(s.storeType)].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [fashionStores, search, type]);

  const role = String((user as any)?.role || "");
  const showSellerCta = !user || role === "buyer";

  return (
    <div style={{ ...fashionCardVars(isDark), minHeight: "100dvh", background: "var(--mb)", color: "var(--mt)", fontFamily: F, paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))" } as CSSProperties}>
      <style>{CSS}</style>

      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--ms)", borderBottom: "1px solid var(--mo)", paddingTop: "max(14px, env(safe-area-inset-top, 0px))" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 16px 10px" }}>
          <button type="button" aria-label="Back" onClick={() => goBack("/")}
            style={{ width: 40, height: 40, borderRadius: 20, border: "none", background: "var(--msh)", color: "var(--mt)", display: "grid", placeItems: "center", cursor: "pointer", flex: "none" }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <h1 style={{ flex: 1, margin: 0, fontSize: 17, fontWeight: 700 }}>Stores</h1>
        </div>
        <div style={{ padding: "0 16px 10px" }}>
          <div style={{ position: "relative" }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="var(--mm)" strokeWidth={2.2} aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search stores" aria-label="Search stores"
              style={{ width: "100%", height: 40, borderRadius: 12, border: "none", background: "var(--msh)", paddingLeft: 36, paddingRight: 12, fontSize: 14, color: "var(--mt)", fontFamily: F, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {types.length > 1 && (
          <div className="kms-scroll" style={{ padding: "0 16px 12px" }}>
            <button type="button" className="kms-pill" aria-pressed={!type} onClick={() => setType(null)}>All</button>
            {types.map(([value, label]) => (
              <button key={value} type="button" className="kms-pill" aria-pressed={type === value} onClick={() => setType(type === value ? null : value)}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {!isLoading && (
        <div style={{ padding: "14px 16px 0", fontSize: 12.5, color: "var(--mm)" }}>
          {shown.length} {shown.length === 1 ? "store" : "stores"}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 12, padding: "10px 16px 0" }}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ aspectRatio: "3 / 4", borderRadius: 18, background: "var(--msh)" }} />)
          : shown.map((s) => {
              const cover = coverFor(s);
              const logo = s.brandingConfig?.logoOverride || s.logo;
              const brand = s.brandingConfig?.primaryColor || TEAL;
              const count = Number(s.productCount) || 0;
              return (
                <button key={s.id} type="button" className="kms-tile" onClick={() => navigate(`/sellers/${s.id}`)} aria-label={`Visit ${s.name}`}
                  style={{ position: "relative", aspectRatio: "3 / 4", borderRadius: 18, overflow: "hidden", border: "none", padding: 0, background: cover ? "var(--msh)" : `linear-gradient(150deg, ${brand}, #00332e)`, cursor: "pointer", textAlign: "left", WebkitTapHighlightColor: "transparent" }}>
                  {cover && <img src={cover} alt="" loading="lazy" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />}
                  <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0) 45%,rgba(0,0,0,.78))" }} />
                  <span style={{ position: "absolute", top: 10, left: 10, width: 40, height: 40, borderRadius: 20, overflow: "hidden", border: "2.5px solid #fff", background: brand, color: "#fff", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 17 }}>
                    {logo ? <img src={logo} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : (s.name || "?").trim().charAt(0).toUpperCase()}
                  </span>
                  <span style={{ position: "absolute", left: 12, right: 12, bottom: 12, color: "#fff", display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
                    <span style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.2, textTransform: "capitalize", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" } as CSSProperties}>{s.name}</span>
                    <span style={{ fontSize: 11.5, opacity: 0.88, marginTop: 3 }}>{count} {count === 1 ? "product" : "products"}</span>
                    <span style={{ marginTop: 8, height: 28, padding: "0 12px", borderRadius: 14, background: "#fff", color: "#111", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center" }}>Visit store</span>
                  </span>
                </button>
              );
            })}
      </div>

      {!isLoading && shown.length === 0 && (
        <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--mm)" }}>
          <p style={{ fontSize: 16, fontWeight: 700, color: "var(--mt)", margin: "0 0 4px" }}>{search || type ? "No stores match" : "No stores yet"}</p>
          <p style={{ fontSize: 13, margin: 0 }}>{search || type ? "Try another name or type." : "New stores are joining soon."}</p>
        </div>
      )}

      {showSellerCta && (
        <div style={{ margin: "20px 16px 0", border: "1.5px dashed rgba(0,150,136,.45)", borderRadius: 18, padding: 18, textAlign: "center", background: "var(--ms)" }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>Own a fashion brand?</div>
          <div style={{ fontSize: 13, color: "var(--mm)", marginTop: 4 }}>Open your store on KiyuMart and reach shoppers across Ghana.</div>
          <button type="button" onClick={() => navigate("/become-seller")}
            style={{ marginTop: 12, height: 42, padding: "0 20px", borderRadius: 21, border: "none", background: TEAL, color: "#fff", font: `700 14px ${F}`, cursor: "pointer" }}>
            Become a Seller
          </button>
        </div>
      )}
    </div>
  );
}
