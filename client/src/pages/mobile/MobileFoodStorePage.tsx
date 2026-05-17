import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";

// Bolt-Food-style restaurant / local-vendor detail page.
// Brand color is KiyuMart TEAL (#009688); everything else mirrors Bolt Food:
//   - Full-width hero with back / share / heart pills
//   - Sticky info card (name, rating, ETA, min order, distance)
//   - Sticky scroll-spy category tabs
//   - Menu sections, item rows (text left + thumb right)
//   - Sticky "View cart" CTA when items are selected
const F     = 'Inter,-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL  = '#009688';
const AMBER = '#F59E0B';

interface MobileFoodStorePageProps {
  storeId: string;
  // Pre-loaded store + product data so we don't double-fetch.
  store: any;
  products: any[];
}

interface StoreQuote {
  storeId: string;
  prepMins: number;
  travelMins: number;
  etaLowMins: number;
  etaHighMins: number;
  deliveryFee: number;
  minOrderAmount: number;
  distanceKm: number | null;
  totalSold?: number;
}

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  image: string;
  storeTypes?: string[] | null;
}

function distanceLabel(km: number | null): string {
  if (km === null) return '';
  if (km < 0.1) return '< 100 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export default function MobileFoodStorePage({ storeId, store, products }: MobileFoodStorePageProps) {
  const [, navigate] = useLocation();
  const [isDark, setIsDark] = useState(true);
  const [search, setSearch] = useState('');
  const [activeCatId, setActiveCatId] = useState<string>('');
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Theme observer
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

  // Saved location for live quote.
  const userLoc = useMemo<{ latitude: number; longitude: number } | null>(() => {
    try {
      const saved = localStorage.getItem('kiyumart_user_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        const lat = parsed?.latitude ?? parsed?.lat;
        const lon = parsed?.longitude ?? parsed?.lon;
        if (typeof lat === 'number' && typeof lon === 'number') return { latitude: lat, longitude: lon };
      }
    } catch { /* ignore */ }
    return null;
  }, []);

  // Single-store quote (ETA, fee, min, distance, totalSold)
  const { data: quote } = useQuery<StoreQuote | undefined>({
    queryKey: ['/api/stores/quotes', storeId, userLoc?.latitude, userLoc?.longitude],
    queryFn: async () => {
      const params = new URLSearchParams({ ids: storeId });
      if (userLoc) {
        params.set('lat', String(userLoc.latitude));
        params.set('lon', String(userLoc.longitude));
      }
      const r = await fetch(`/api/stores/quotes?${params.toString()}`);
      if (!r.ok) return undefined;
      const d = await r.json();
      return Array.isArray(d) ? d[0] : undefined;
    },
    staleTime: 60_000,
  });

  // Categories (used to group the menu sections + render sticky tabs).
  const { data: categories = [] } = useQuery<CategoryRow[]>({
    queryKey: ['/api/categories'],
    queryFn: async () => {
      const r = await fetch('/api/categories');
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 5 * 60_000,
  });

  // Group products of this store by categoryId. "Popular" is a synthetic bucket
  // covering all items so users always see something at the top.
  const grouped = useMemo(() => {
    const safe = Array.isArray(products) ? products : [];
    const q = search.trim().toLowerCase();
    const filtered = q ? safe.filter((p: any) => String(p?.name || '').toLowerCase().includes(q)) : safe;

    const byCat = new Map<string, any[]>();
    for (const p of filtered) {
      const cid = String(p?.categoryId || 'other');
      if (!byCat.has(cid)) byCat.set(cid, []);
      byCat.get(cid)!.push(p);
    }

    // Order: Popular first (top-N most popular by orderCount or random),
    // then sections for each category present, in the categories table order.
    const orderedCats: CategoryRow[] = [];
    for (const c of categories) {
      if (byCat.has(String(c.id))) orderedCats.push(c);
    }
    // Append "Other" bucket for products without a known category.
    const other = byCat.get('other') || [];
    if (other.length > 0) {
      orderedCats.push({ id: 'other', name: 'Other', slug: 'other', image: '' });
    }

    const popular = [...filtered]
      .sort((a, b) => (Number(b?.salesCount || 0) - Number(a?.salesCount || 0)))
      .slice(0, 6);

    return {
      popular,
      sections: orderedCats.map((c) => ({
        category: c,
        items: byCat.get(String(c.id)) || [],
      })),
    };
  }, [products, categories, search]);

  // Set initial active category to the first non-empty section (or popular).
  useEffect(() => {
    if (!activeCatId) {
      if (grouped.popular.length > 0) setActiveCatId('popular');
      else if (grouped.sections[0]) setActiveCatId(grouped.sections[0].category.id);
    }
  }, [grouped, activeCatId]);

  // Scroll to a category section when its tab is tapped.
  const scrollToSection = (id: string) => {
    setActiveCatId(id);
    const el = sectionRefs.current.get(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ── Palette ────────────────────────────────────────────────
  const bg     = isDark ? '#0B0B0B' : '#F7F8FA';
  const card   = isDark ? '#161616' : '#FFFFFF';
  const hdr    = isDark ? '#0B0B0B' : '#FFFFFF';
  const bdr    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
  const txt    = isDark ? '#FFFFFF' : '#0F172A';
  const muted  = isDark ? 'rgba(235,235,245,0.55)' : 'rgba(15,23,42,0.55)';
  const inp    = isDark ? '#1F1F22' : '#EEF0F4';
  const skel   = isDark ? '#1F1F22' : '#E5E7EB';
  const chipBg = isDark ? '#1F1F22' : '#EEF0F4';

  const cover = store?.banner || store?.logo || null;
  const rating = parseFloat(String(store?.averageRating ?? '0'));
  const isVerified = store?.verificationStatus === 'approved';

  return (
    <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, color: txt }}>
      {/* ── Hero image with floating buttons ────────────────── */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '5 / 3', background: skel, overflow: 'hidden' }}>
        {cover ? (
          <img src={cover} alt={store?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 72, color: TEAL, fontWeight: 800 }}>
            {String(store?.name || 'S').charAt(0).toUpperCase()}
          </div>
        )}
        {/* Gradient overlay for legibility */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 60%, rgba(0,0,0,0.55) 100%)',
        }} />
        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
        }}>
          <button
            onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}
            style={{
              width: 38, height: 38, borderRadius: 19,
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
              border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6"/>
            </svg>
          </button>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={() => {
                if (navigator.share) navigator.share({ title: store?.name, url: window.location.href }).catch(() => {});
                else navigator.clipboard.writeText(window.location.href).catch(() => {});
              }}
              style={{
                width: 38, height: 38, borderRadius: 19,
                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Info card (overlapping the hero, Bolt-style) ────── */}
      <div style={{
        margin: '-40px 16px 0', position: 'relative', zIndex: 2,
        background: card, borderRadius: 18, padding: '16px',
        border: `1px solid ${bdr}`,
        boxShadow: isDark ? 'none' : '0 4px 24px rgba(15,23,42,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: txt, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {store?.name}
            </div>
            {store?.description && (
              <div style={{ marginTop: 4, fontSize: 13, color: muted, lineHeight: 1.35,
                overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              } as React.CSSProperties}>
                {store.description}
              </div>
            )}
          </div>
          {isVerified && (
            <div style={{
              background: TEAL + '14', color: TEAL,
              borderRadius: 999, padding: '4px 9px',
              fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
              flexShrink: 0,
            }}>
              ✓ Verified
            </div>
          )}
        </div>

        {/* Stat strip */}
        <div style={{
          marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 0, borderTop: `1px solid ${bdr}`, paddingTop: 12,
        }}>
          <Stat
            icon={(<svg width={14} height={14} viewBox="0 0 24 24" fill={AMBER} stroke="none">
              <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
            </svg>)}
            label={rating > 0 ? rating.toFixed(1) : '—'}
            sub="Rating"
            txt={txt}
            muted={muted}
          />
          <Stat
            icon={(<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
            </svg>)}
            label={quote ? `${quote.etaLowMins}–${quote.etaHighMins}` : '—'}
            sub="min"
            txt={txt}
            muted={muted}
          />
          <Stat
            icon={(<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>)}
            label={quote?.distanceKm !== undefined && quote?.distanceKm !== null ? distanceLabel(quote.distanceKm) : '—'}
            sub="Away"
            txt={txt}
            muted={muted}
          />
          <Stat
            icon={(<svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h18l-2 13H5z"/><path d="M9 7a3 3 0 0 1 6 0"/>
            </svg>)}
            label={quote?.totalSold ? quote.totalSold.toLocaleString() : '0'}
            sub="Sold"
            txt={txt}
            muted={muted}
          />
        </div>

        {/* Delivery fee + min order */}
        <div style={{
          marginTop: 12, paddingTop: 12, borderTop: `1px solid ${bdr}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 12, color: muted, fontWeight: 500,
        }}>
          <span>
            {quote
              ? (quote.deliveryFee > 0 ? `GH₵ ${quote.deliveryFee.toFixed(2)} delivery` : 'Free delivery')
              : 'Share your address to see the delivery fee'}
          </span>
          {quote && quote.minOrderAmount > 0 && (
            <span>Min order: <strong style={{ color: txt }}>GH₵ {quote.minOrderAmount.toFixed(2)}</strong></span>
          )}
        </div>
      </div>

      {/* ── Search bar ────────────────────────────────────────── */}
      <div style={{ padding: '14px 16px 6px' }}>
        <div style={{
          background: inp, borderRadius: 14,
          display: 'flex', alignItems: 'center',
          padding: '0 14px', height: 44,
        }}>
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none"
            stroke={muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this menu"
            style={{
              flex: 1, height: '100%', background: 'transparent',
              border: 'none', outline: 'none',
              marginLeft: 10,
              fontSize: 15, color: txt, fontFamily: F,
            }}
          />
        </div>
      </div>

      {/* ── Sticky category tabs ──────────────────────────────── */}
      <div ref={tabsRef} style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: hdr, borderBottom: `1px solid ${bdr}`,
        padding: '10px 0 8px',
      }}>
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          padding: '0 16px',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}>
          {grouped.popular.length > 0 && (
            <CategoryChip
              active={activeCatId === 'popular'}
              label="Popular"
              onClick={() => scrollToSection('popular')}
              chipBg={chipBg}
              txt={txt}
            />
          )}
          {grouped.sections.map((sec) => (
            <CategoryChip
              key={sec.category.id}
              active={activeCatId === sec.category.id}
              label={sec.category.name}
              onClick={() => scrollToSection(sec.category.id)}
              chipBg={chipBg}
              txt={txt}
            />
          ))}
        </div>
      </div>

      {/* ── Menu sections ─────────────────────────────────────── */}
      <div style={{ padding: '8px 0 120px' }}>
        {grouped.popular.length > 0 && (
          <Section
            id="popular"
            title="Popular"
            items={grouped.popular}
            registerRef={(el) => el && sectionRefs.current.set('popular', el)}
            navigate={navigate}
            card={card} bdr={bdr} txt={txt} muted={muted} skel={skel}
          />
        )}
        {grouped.sections.map((sec) => (
          <Section
            key={sec.category.id}
            id={sec.category.id}
            title={sec.category.name}
            items={sec.items}
            registerRef={(el) => el && sectionRefs.current.set(sec.category.id, el)}
            navigate={navigate}
            card={card} bdr={bdr} txt={txt} muted={muted} skel={skel}
          />
        ))}
        {grouped.popular.length === 0 && grouped.sections.length === 0 && (
          <div style={{ padding: '40px 24px', textAlign: 'center', color: muted, fontSize: 14 }}>
            {search ? 'No menu items match your search.' : 'No menu items yet.'}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, sub, txt, muted }: { icon: React.ReactNode; label: string; sub: string; txt: string; muted: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 800, color: txt }}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{ fontSize: 10, color: muted, fontWeight: 500, letterSpacing: 0.3, textTransform: 'uppercase' }}>{sub}</div>
    </div>
  );
}

function CategoryChip({ active, label, onClick, chipBg, txt }: { active: boolean; label: string; onClick: () => void; chipBg: string; txt: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flexShrink: 0,
        padding: '7px 14px',
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
        WebkitTapHighlightColor: 'transparent',
        background: active ? TEAL : chipBg,
        color: active ? '#fff' : txt,
        transition: 'background 0.15s, color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function Section({
  id, title, items, registerRef, navigate,
  card, bdr, txt, muted, skel,
}: {
  id: string;
  title: string;
  items: any[];
  registerRef: (el: HTMLDivElement | null) => void;
  navigate: (path: string) => void;
  card: string; bdr: string; txt: string; muted: string; skel: string;
}) {
  if (items.length === 0) return null;
  return (
    <div ref={registerRef} id={`section-${id}`} style={{ padding: '14px 0 6px' }}>
      <div style={{ padding: '0 16px 8px', fontSize: 18, fontWeight: 800, color: txt, lineHeight: 1.2 }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {items.map((p) => {
          const img = Array.isArray(p?.images) ? p.images[0] : '';
          const price = parseFloat(String(p?.price || '0'));
          return (
            <button
              key={p.id}
              onClick={() => navigate(`/product/${p.id}`)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 16px',
                background: 'transparent',
                border: 'none', borderBottom: `1px solid ${bdr}`,
                cursor: 'pointer', textAlign: 'left',
                WebkitTapHighlightColor: 'transparent',
                width: '100%',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 15, fontWeight: 700, color: txt, lineHeight: 1.25,
                  overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 1, WebkitBoxOrient: 'vertical',
                } as React.CSSProperties}>
                  {p.name}
                </div>
                {p.description && (
                  <div style={{
                    marginTop: 4, fontSize: 12, color: muted, lineHeight: 1.4,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                  } as React.CSSProperties}>
                    {p.description}
                  </div>
                )}
                <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: txt }}>
                  GH₵ {price.toFixed(2)}
                </div>
              </div>
              <div style={{
                width: 96, height: 96,
                borderRadius: 12, overflow: 'hidden',
                background: skel, flexShrink: 0,
                position: 'relative',
              }}>
                {img ? (
                  <img src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 32 }}>🍽️</div>
                )}
                {/* Bolt-style "+" add button */}
                <div style={{
                  position: 'absolute', right: 6, bottom: 6,
                  width: 28, height: 28, borderRadius: 14,
                  background: card, border: `1px solid ${bdr}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
                }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 5v14M5 12h14"/>
                  </svg>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
