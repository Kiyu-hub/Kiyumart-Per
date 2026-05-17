import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { isFoodVendorStore, getFoodStoreIdSet } from "@/lib/foodVendors";
import { useToast } from "@/hooks/use-toast";

// Bolt-Food-inspired layout. Brand color is KiyuMart TEAL (#009688) — every
// other tier 1 brand cue (typography, spacing, image treatment, badge anatomy,
// sticky CTA pattern) maps to Bolt Food.
const F     = 'Inter,-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL  = '#009688';
const AMBER = '#F59E0B';

type FilterTab = 'all' | 'local_vendor' | 'restaurant';

interface Store {
  id: string; name: string;
  logo?: string | null; banner?: string | null;
  location?: string | null;
  latitude?: string | null; longitude?: string | null;
  averageRating?: string; totalOrders?: number;
  isActive?: boolean; isApproved?: boolean; isPayoutVerified?: boolean;
  verificationStatus?: string | null;
  businessType?: string | null; merchantCategory?: string | null; storeType?: string | null;
  sellerName?: string | null;
  description?: string | null;
  prepTimeMins?: number | null;
  minOrderAmount?: string | null;
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
  deliveryZoneName?: string | null;
  totalSold?: number;
}

interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  image: string;
  ctaText: string | null;
  ctaLink: string | null;
  placement?: string | null;
  themeColor?: string | null;
}

interface CategoryRow {
  id: string;
  name: string;
  image: string;
  slug: string;
  storeTypes?: string[] | null;
  productCount?: number;
}

interface UserLoc {
  latitude: number;
  longitude: number;
  label?: string;
}

function distanceLabel(km: number | null): string {
  if (km === null) return '';
  if (km < 0.1) return '< 100 m';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

export default function MobileAllVendors() {
  const [, navigate]  = useLocation();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [isDark, setIsDark] = useState(true);
  const [userLoc, setUserLoc] = useState<UserLoc | null>(null);
  const [locLoading, setLocLoading] = useState(false);

  // Debounce search input (250ms) so we don't recompute the filtered list on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim().toLowerCase()), 250);
    return () => clearTimeout(t);
  }, [search]);

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

  // Read any persisted location on mount.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kiyumart_user_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        const lat = parsed?.latitude ?? parsed?.lat;
        const lon = parsed?.longitude ?? parsed?.lon;
        if (typeof lat === 'number' && typeof lon === 'number') {
          setUserLoc({ latitude: lat, longitude: lon, label: parsed?.label });
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Request geolocation + reverse-geocode for a Bolt-style "Deliver to" header.
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast({ title: "Location unavailable", description: "Your device blocks location access.", variant: "destructive" });
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        let label = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
        try {
          const r = await fetch(`/api/public/geocode/reverse?lat=${lat}&lon=${lon}`);
          if (r.ok) {
            const d = await r.json();
            if (d?.display_name) label = d.display_name;
          }
        } catch { /* keep coord fallback */ }
        const next: UserLoc = { latitude: lat, longitude: lon, label };
        setUserLoc(next);
        try { localStorage.setItem('kiyumart_user_location', JSON.stringify(next)); } catch { /* ignore */ }
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        toast({
          title: "Couldn't get your location",
          description: err.code === err.PERMISSION_DENIED
            ? "Allow location access in your browser settings to see accurate delivery times."
            : "Try again in a moment.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, [toast]);

  // Bolt uses near-white surfaces in light mode and very deep neutrals in dark mode.
  const bg     = isDark ? '#0B0B0B' : '#F7F8FA';
  const card   = isDark ? '#161616' : '#FFFFFF';
  const hdr    = isDark ? '#0B0B0B' : '#FFFFFF';
  const bdr    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
  const txt    = isDark ? '#FFFFFF' : '#0F172A';
  const muted  = isDark ? 'rgba(235,235,245,0.55)' : 'rgba(15,23,42,0.55)';
  const inp    = isDark ? '#1F1F22' : '#EEF0F4';
  const skel   = isDark ? '#1F1F22' : '#E5E7EB';
  const chipBg = isDark ? '#1F1F22' : '#EEF0F4';

  // ── Real data fetches ────────────────────────────────────────
  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ['/api/stores', 'active-approved', 'vendors-mobile'],
    queryFn: async () => {
      const res = await fetch('/api/stores?isActive=true&isApproved=true');
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : (d?.stores ?? []);
    },
    staleTime: 60_000,
  });

  const { data: allProducts = [] } = useQuery<any[]>({
    queryKey: ['/api/products', 'active', 'vendors-mobile'],
    queryFn: async () => {
      const res = await fetch('/api/products?isActive=true');
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  // Banner — only food-vendors-scoped banners. Super admin manages content,
  // image, color, CTA via AdminHeroBanners with placement="food_vendors".
  const { data: banners = [] } = useQuery<HeroBanner[]>({
    queryKey: ['/api/hero-banners', 'food_vendors'],
    queryFn: async () => {
      const r = await fetch('/api/hero-banners?placement=food_vendors');
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 5 * 60_000,
  });
  const banner: HeroBanner | null = banners[0] ?? null;

  // Food-scoped categories — drives the cuisine chip row (Pizza / Burger /
  // Local etc.). Created by super admin under the "Restaurants & Local Vendors"
  // tab in AdminCategoryManager.
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
  const foodCategories: CategoryRow[] = useMemo(
    () => categories.filter((c) =>
      Array.isArray(c.storeTypes) &&
      c.storeTypes.some((t) => t === 'food_beverages' || t === 'restaurant'),
    ),
    [categories],
  );

  const foodStores = useMemo(() => stores.filter(isFoodVendorStore), [stores]);

  // ── Quotes (real ETA + delivery fee) ─────────────────────────
  const storeIds = useMemo(() => foodStores.map((s) => s.id).sort().join(','), [foodStores]);
  const { data: quotes = [] } = useQuery<StoreQuote[]>({
    queryKey: ['/api/stores/quotes', storeIds, userLoc?.latitude, userLoc?.longitude],
    queryFn: async () => {
      if (!storeIds) return [];
      const params = new URLSearchParams({ ids: storeIds });
      if (userLoc) {
        params.set('lat', String(userLoc.latitude));
        params.set('lon', String(userLoc.longitude));
      }
      const r = await fetch(`/api/stores/quotes?${params.toString()}`);
      if (!r.ok) return [];
      const d = await r.json();
      return Array.isArray(d) ? d : [];
    },
    enabled: storeIds.length > 0,
    staleTime: 60_000,
  });
  const quoteByStoreId = useMemo(() => {
    const m = new Map<string, StoreQuote>();
    quotes.forEach((q) => m.set(q.storeId, q));
    return m;
  }, [quotes]);

  // ── Filters ──────────────────────────────────────────────────
  const isRestaurant = (s: Store) =>
    s.businessType === 'restaurant' || s.storeType === 'restaurant';
  const isLocalVendor = (s: Store) => !isRestaurant(s);

  const tabFiltered: Store[] = activeTab === 'all'
    ? foodStores
    : activeTab === 'restaurant'
      ? foodStores.filter(isRestaurant)
      : foodStores.filter(isLocalVendor);

  // Category filter — a store matches a food category if any of its products
  // is linked to that category.
  const categoryFilteredStoreIds = useMemo<Set<string> | null>(() => {
    if (activeCategory === 'all') return null;
    const ids = new Set<string>();
    for (const p of (allProducts as any[])) {
      if (String(p?.categoryId) === activeCategory && p?.storeId) ids.add(String(p.storeId));
    }
    return ids;
  }, [activeCategory, allProducts]);

  const categoryFiltered: Store[] = categoryFilteredStoreIds === null
    ? tabFiltered
    : tabFiltered.filter((s) => categoryFilteredStoreIds.has(String(s.id)));

  const searched: Store[] = debouncedSearch
    ? categoryFiltered.filter((s) =>
        s.name.toLowerCase().includes(debouncedSearch) ||
        (s.location ?? '').toLowerCase().includes(debouncedSearch) ||
        (s.sellerName ?? '').toLowerCase().includes(debouncedSearch) ||
        (s.description ?? '').toLowerCase().includes(debouncedSearch),
      )
    : categoryFiltered;

  // When the user's location is known, sort the entire list by distance so the
  // closest restaurant / vendor is always at the top — matches Bolt Food.
  const filtered: Store[] = useMemo(() => {
    if (!userLoc) return searched;
    return [...searched].sort((a, b) => {
      const da = quoteByStoreId.get(a.id)?.distanceKm ?? Number.POSITIVE_INFINITY;
      const db = quoteByStoreId.get(b.id)?.distanceKm ?? Number.POSITIVE_INFINITY;
      return da - db;
    });
  }, [searched, userLoc, quoteByStoreId]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'restaurant',   label: 'Restaurants' },
    { key: 'local_vendor', label: 'Local Vendors' },
  ];

  // Top picks: highest rated + nearest (when location known).
  const topPicks = useMemo(() => {
    return [...foodStores]
      .sort((a, b) => {
        const ra = parseFloat(a.averageRating ?? '0');
        const rb = parseFloat(b.averageRating ?? '0');
        if (rb !== ra) return rb - ra;
        const da = quoteByStoreId.get(a.id)?.distanceKm ?? Infinity;
        const db = quoteByStoreId.get(b.id)?.distanceKm ?? Infinity;
        return da - db;
      })
      .slice(0, 6);
  }, [foodStores, quoteByStoreId]);

  // Popular dishes — also honor the search query.
  const popularDishes = useMemo(() => {
    const foodStoreIds = getFoodStoreIdSet(stores);
    const base = (Array.isArray(allProducts) ? allProducts : [])
      .filter((p: any) => p?.storeId && foodStoreIds.has(String(p.storeId)));
    const q = debouncedSearch;
    const matched = q
      ? base.filter((p: any) => String(p?.name || '').toLowerCase().includes(q))
      : base;
    return matched.slice(0, 8);
  }, [allProducts, stores, debouncedSearch]);

  return (
    <div style={{ background: bg, minHeight: '100dvh', fontFamily: F, color: txt }}>
      {/* ── Sticky header ─────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: hdr,
        borderBottom: `1px solid ${bdr}`,
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        {/* Deliver-to row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px 10px' }}>
          <button
            onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: inp, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
              stroke={txt} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            onClick={requestLocation}
            disabled={locLoading}
            style={{
              flex: 1, minWidth: 0, background: 'none', border: 'none',
              padding: 0, cursor: 'pointer', textAlign: 'left',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{ fontSize: 10, color: muted, fontWeight: 600, letterSpacing: 0.5 }}>DELIVER TO</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 0 }}>
              <span style={{
                fontSize: 13, fontWeight: 700, color: txt,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70vw',
              }}>
                {locLoading ? 'Finding you…' : (userLoc?.label || 'Tap to share your address')}
              </span>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '0 16px 12px' }}>
          <div style={{
            background: inp, borderRadius: 14,
            display: 'flex', alignItems: 'center',
            padding: '0 14px', height: 46,
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none"
              stroke={muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search restaurants or dishes"
              style={{
                flex: 1, height: '100%', background: 'transparent',
                border: 'none', outline: 'none',
                marginLeft: 10,
                fontSize: 15, color: txt, fontFamily: F,
              }}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: muted }}
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12"/>
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Pill segmented control */}
        <div style={{ padding: '0 16px 12px', display: 'flex', gap: 8 }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                flex: 1,
                padding: '9px 0',
                borderRadius: 999,
                border: activeTab === t.key ? 'none' : `1px solid ${bdr}`,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: F,
                WebkitTapHighlightColor: 'transparent',
                background: activeTab === t.key ? TEAL : 'transparent',
                color: activeTab === t.key ? '#fff' : muted,
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Cuisine chips (real categories) ───────────────────── */}
      {foodCategories.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, overflowX: 'auto',
          padding: '14px 16px 6px',
          msOverflowStyle: 'none', scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}>
          {[{ id: 'all', name: 'All', image: '' }, ...foodCategories].map((c) => {
            const active = activeCategory === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCategory(c.id)}
                style={{
                  flexShrink: 0,
                  padding: '8px 14px',
                  borderRadius: 999,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: F,
                  WebkitTapHighlightColor: 'transparent',
                  background: active ? TEAL : chipBg,
                  color: active ? '#fff' : txt,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background 0.15s',
                }}
              >
                {c.image && (
                  <img
                    src={c.image}
                    alt={c.name}
                    style={{ width: 18, height: 18, borderRadius: 4, objectFit: 'cover' }}
                  />
                )}
                <span>{c.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Banner (super admin-managed) ──────────────────────── */}
      {banner && (
        <button
          onClick={() => banner.ctaLink && navigate(banner.ctaLink)}
          style={{
            display: 'block', textAlign: 'left',
            margin: '12px 16px 4px',
            padding: 0, border: 'none',
            borderRadius: 16, overflow: 'hidden', cursor: banner.ctaLink ? 'pointer' : 'default',
            background: banner.themeColor
              ? `linear-gradient(135deg, ${banner.themeColor} 0%, ${banner.themeColor}cc 100%)`
              : `linear-gradient(135deg, ${TEAL} 0%, #00B89A 100%)`,
            color: '#fff',
            width: 'calc(100% - 32px)',
            position: 'relative',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          {banner.image && (
            <img
              src={banner.image}
              alt={banner.title}
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                objectFit: 'cover', opacity: 0.55,
              }}
            />
          )}
          <div style={{ position: 'relative', padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>{banner.title}</div>
              {banner.subtitle && (
                <div style={{ fontSize: 12, opacity: 0.92, marginTop: 4 }}>{banner.subtitle}</div>
              )}
              {banner.ctaText && (
                <div style={{
                  marginTop: 10, display: 'inline-block',
                  background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(6px)',
                  borderRadius: 999, padding: '5px 12px',
                  fontSize: 12, fontWeight: 700,
                }}>
                  {banner.ctaText} →
                </div>
              )}
            </div>
          </div>
        </button>
      )}

      {/* ── Top picks rail ────────────────────────────────────── */}
      {!isLoading && topPicks.length > 0 && (
        <>
          <SectionHeader title="Top picks for you" muted={muted} txt={txt} />
          <div style={{
            display: 'flex', gap: 12, overflowX: 'auto',
            padding: '0 16px 16px',
            msOverflowStyle: 'none', scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}>
            {topPicks.map((store) => {
              const coverImg = store.banner || store.logo;
              const rating = parseFloat(store.averageRating ?? '0');
              const q = quoteByStoreId.get(store.id);
              return (
                <button
                  key={store.id}
                  onClick={() => navigate(`/sellers/${store.id}`)}
                  style={{
                    flexShrink: 0, width: 220,
                    background: 'none', border: 'none', padding: 0,
                    cursor: 'pointer', textAlign: 'left',
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <div style={{
                    width: '100%', aspectRatio: '16 / 10',
                    borderRadius: 14, overflow: 'hidden',
                    background: skel, position: 'relative',
                  }}>
                    {coverImg ? (
                      <img src={coverImg} alt={store.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 42, color: TEAL, fontWeight: 800 }}>
                        {(store.name || 'S')[0].toUpperCase()}
                      </div>
                    )}
                    {rating > 0 && (
                      <div style={{
                        position: 'absolute', top: 8, left: 8,
                        background: 'rgba(0,0,0,0.65)', color: '#fff',
                        borderRadius: 999, padding: '3px 8px',
                        fontSize: 11, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 3,
                        backdropFilter: 'blur(4px)',
                      }}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill={AMBER} stroke="none">
                          <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
                        </svg>
                        {rating.toFixed(1)}
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 14, fontWeight: 700, color: txt, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {store.name}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 12, color: muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {q ? (
                      <>
                        <span>{q.etaLowMins}–{q.etaHighMins} min</span>
                        {q.distanceKm !== null && <><span>·</span><span>{distanceLabel(q.distanceKm)}</span></>}
                      </>
                    ) : (
                      <span>Share your address for delivery time</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── All restaurants / vendors list ─────────────────────── */}
      <SectionHeader
        title={activeTab === 'restaurant' ? 'Restaurants' : activeTab === 'local_vendor' ? 'Local vendors' : 'All places'}
        sub={filtered.length > 0 ? `${filtered.length} ${filtered.length === 1 ? 'place' : 'places'}` : undefined}
        muted={muted}
        txt={txt}
      />

      <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{
                background: card, borderRadius: 16, overflow: 'hidden',
                border: `1px solid ${bdr}`,
              }}>
                <div style={{ width: '100%', aspectRatio: '16 / 9', background: skel }} />
                <div style={{ padding: '12px 14px 14px' }}>
                  <div style={{ width: '60%', height: 12, borderRadius: 6, background: skel, marginBottom: 8 }} />
                  <div style={{ width: '40%', height: 10, borderRadius: 5, background: skel }} />
                </div>
              </div>
            ))
          : filtered.map((store) => {
              const rating   = parseFloat(store.averageRating ?? '0');
              const coverImg = store.banner || store.logo;
              const isVerified = store.verificationStatus === 'approved';
              const q = quoteByStoreId.get(store.id);

              return (
                <button
                  key={store.id}
                  onClick={() => navigate(`/sellers/${store.id}`)}
                  style={{
                    width: '100%',
                    background: card, borderRadius: 16, overflow: 'hidden',
                    cursor: 'pointer', textAlign: 'left', padding: 0,
                    WebkitTapHighlightColor: 'transparent',
                    border: `1px solid ${bdr}`,
                    display: 'flex', flexDirection: 'column',
                    boxShadow: isDark ? 'none' : '0 1px 2px rgba(15,23,42,0.04)',
                  }}
                >
                  <div style={{
                    width: '100%', aspectRatio: '16 / 9',
                    background: skel, position: 'relative', overflow: 'hidden',
                  }}>
                    {coverImg ? (
                      <img src={coverImg} alt={store.name}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%',
                        display: 'grid', placeItems: 'center',
                        fontSize: 56, fontWeight: 800, color: TEAL,
                      }}>
                        {(store.name || 'S')[0].toUpperCase()}
                      </div>
                    )}
                    {rating > 0 && (
                      <div style={{
                        position: 'absolute', top: 12, left: 12,
                        background: 'rgba(0,0,0,0.72)', color: '#fff',
                        borderRadius: 999, padding: '4px 10px',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 4,
                        backdropFilter: 'blur(6px)',
                      }}>
                        <svg width={11} height={11} viewBox="0 0 24 24" fill={AMBER} stroke="none">
                          <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
                        </svg>
                        {rating.toFixed(1)}
                      </div>
                    )}
                    {isVerified && (
                      <div style={{
                        position: 'absolute', top: 12, right: 12,
                        background: '#fff', color: TEAL,
                        borderRadius: 999, padding: '4px 10px',
                        fontSize: 11, fontWeight: 800, letterSpacing: 0.3,
                      }}>
                        ✓ Verified
                      </div>
                    )}
                  </div>

                  <div style={{ padding: '12px 14px 14px' }}>
                    <div style={{
                      fontSize: 16, fontWeight: 700, color: txt,
                      lineHeight: 1.2,
                      overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                    }}>
                      {store.name}
                    </div>
                    <div style={{
                      marginTop: 6, display: 'flex', alignItems: 'center', gap: 10,
                      fontSize: 12, color: muted, fontWeight: 500,
                      flexWrap: 'wrap',
                    }}>
                      {q ? (
                        <>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
                            </svg>
                            {q.etaLowMins}–{q.etaHighMins} min
                          </span>
                          {q.distanceKm !== null && (
                            <>
                              <span>·</span>
                              <span>{distanceLabel(q.distanceKm)}</span>
                            </>
                          )}
                          <span>·</span>
                          <span style={{ color: TEAL, fontWeight: 700 }}>
                            {q.deliveryFee > 0 ? `GH₵ ${q.deliveryFee.toFixed(2)} delivery` : 'Free delivery'}
                          </span>
                          {q.minOrderAmount > 0 && (
                            <>
                              <span>·</span>
                              <span>Min GH₵ {q.minOrderAmount.toFixed(2)}</span>
                            </>
                          )}
                          {q.totalSold !== undefined && q.totalSold > 0 && (
                            <>
                              <span>·</span>
                              <span>{q.totalSold.toLocaleString()} sold</span>
                            </>
                          )}
                        </>
                      ) : (
                        <span>Share your address to see delivery time</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

        {!isLoading && filtered.length === 0 && (
          <div style={{
            padding: '60px 16px', textAlign: 'center', color: muted, fontSize: 14,
          }}>
            {search ? 'No results found' : 'No vendors or restaurants here yet'}
          </div>
        )}
      </div>

      {/* ── Popular dishes carousel ───────────────────────────── */}
      {!isLoading && popularDishes.length > 0 && (
        <>
          <SectionHeader title="Popular dishes near you" muted={muted} txt={txt} />
          <div style={{
            display: 'flex', gap: 12, overflowX: 'auto',
            padding: '0 16px 100px',
            msOverflowStyle: 'none', scrollbarWidth: 'none',
            WebkitOverflowScrolling: 'touch',
          } as React.CSSProperties}>
            {popularDishes.map((p: any) => {
              const img = Array.isArray(p.images) ? p.images[0] : '';
              const price = parseFloat(p.price || '0');
              return (
                <button
                  key={p.id}
                  onClick={() => navigate(`/product/${p.id}`)}
                  style={{
                    flexShrink: 0, width: 170,
                    background: card, borderRadius: 16,
                    border: `1px solid ${bdr}`,
                    cursor: 'pointer', textAlign: 'left', padding: 0,
                    WebkitTapHighlightColor: 'transparent',
                    overflow: 'hidden',
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  <div style={{ aspectRatio: '4 / 3', background: skel, overflow: 'hidden' }}>
                    {img ? (
                      <img src={img} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: 36 }}>🍽️</div>
                    )}
                  </div>
                  <div style={{ padding: '10px 12px 12px' }}>
                    <div style={{
                      fontSize: 13, fontWeight: 700, color: txt, lineHeight: 1.25,
                      overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      minHeight: 32,
                    } as React.CSSProperties}>
                      {p.name}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 14, fontWeight: 800, color: TEAL }}>
                      GH₵ {price.toFixed(2)}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SectionHeader({ title, sub, txt, muted }: { title: string; sub?: string; txt: string; muted: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
      padding: '6px 16px 10px',
    }}>
      <span style={{ fontSize: 18, fontWeight: 800, color: txt, lineHeight: 1.2 }}>{title}</span>
      {sub && <span style={{ fontSize: 12, color: muted, fontWeight: 500 }}>{sub}</span>}
    </div>
  );
}
