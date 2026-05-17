import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { isFoodVendorStore } from "@/lib/foodVendors";

const F     = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const AMBER = '#F59E0B';

interface Store {
  id: string;
  name: string;
  logo?: string | null;
  banner?: string | null;
  location?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  averageRating?: string | null;
  totalOrders?: number | null;
  productCount?: number | null;
  isActive?: boolean;
  isApproved?: boolean;
  verificationStatus?: string | null;
  sellerName?: string | null;
  businessType?: string | null;
  merchantCategory?: string | null;
  storeType?: string | null;
}

function useTheme() {
  const [isDark, setIsDark] = useState(() => {
    const s = localStorage.getItem('theme');
    return s ? s === 'dark' : document.documentElement.classList.contains('dark');
  });
  useEffect(() => {
    const read = () => {
      const s = localStorage.getItem('theme');
      setIsDark(s ? s === 'dark' : document.documentElement.classList.contains('dark'));
    };
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    const onStorage = (e: StorageEvent) => { if (e.key === 'theme') read(); };
    window.addEventListener('storage', onStorage);
    return () => { obs.disconnect(); window.removeEventListener('storage', onStorage); };
  }, []);
  return isDark;
}

export default function MobileAllStores() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const isDark = useTheme();
  const accent = '#009688';

  const bg    = isDark ? '#111111' : '#F2F2F7';
  const card  = isDark ? '#1C1C1E' : '#FFFFFF';
  const hdr   = isDark ? '#111111' : '#FFFFFF';
  const bdr   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const txt   = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)';
  const inp   = isDark ? '#2C2C2E' : '#EBEBF0';
  const skel  = isDark ? '#2C2C2E' : '#E5E5EA';

  const { data: stores = [], isLoading } = useQuery<Store[]>({
    queryKey: ['/api/stores', 'public-listing'],
    queryFn: async () => {
      const res = await fetch('/api/stores?isActive=true&isApproved=true');
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : (d?.stores ?? []);
    },
    staleTime: 60_000,
  });

  // "All Stores" excludes food vendors & restaurants — they live in
  // /mobile/vendors. Same rule as Shop by Store on the home page.
  const nonFoodStores = useMemo(() => stores.filter((s) => !isFoodVendorStore(s)), [stores]);
  const filtered = search.trim()
    ? nonFoodStores.filter(s => {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.sellerName ?? '').toLowerCase().includes(q) ||
          (s.location ?? '').toLowerCase().includes(q)
        );
      })
    : nonFoodStores;

  return (
    <div style={{ background: bg, minHeight: '100dvh', fontFamily: F }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: hdr,
        borderBottom: `1px solid ${bdr}`,
        padding: '0 16px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        {/* Title row */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 44 }}>
          <button
            onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}
            style={{
              position: 'absolute', left: 0,
              width: 34, height: 34, borderRadius: 17,
              background: inp, border: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
              stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <span style={{ fontSize: 16, fontWeight: 700, color: txt }}>All Stores</span>
          {stores.length > 0 && (
            <span style={{
              position: 'absolute', right: 0,
              fontSize: 12, fontWeight: 600, color: muted,
            }}>
              {filtered.length} store{filtered.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* Search */}
        <div style={{
          marginTop: 8, background: inp, borderRadius: 12,
          position: 'relative', display: 'flex', alignItems: 'center',
        }}>
          <svg style={{ position: 'absolute', left: 12 }}
            width={14} height={14} viewBox="0 0 24 24" fill="none"
            stroke={muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by store or seller name..."
            style={{
              width: '100%', height: 42, background: 'transparent',
              border: 'none', outline: 'none',
              paddingLeft: 36, paddingRight: 14,
              fontSize: 14, color: txt, fontFamily: F,
              boxSizing: 'border-box' as const,
            }}
          />
          {search.length > 0 && (
            <button
              onClick={() => setSearch('')}
              style={{ position: 'absolute', right: 10, background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: muted }}
            >
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* 2-col grid */}
      <div style={{ padding: '12px 12px 100px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {isLoading
          ? Array.from({ length: 6 }).map((_, i) => (
              <div key={i} style={{
                width: '100%', aspectRatio: '0.85',
                background: card, borderRadius: 12, overflow: 'hidden',
                border: `1px solid ${bdr}`,
                display: 'flex', flexDirection: 'column',
              }}>
                <div style={{ flex: '0 0 55%', background: skel }} />
                <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ width: '72%', height: 11, borderRadius: 12, background: skel }} />
                  <div style={{ width: '50%', height: 9, borderRadius: 12, background: skel }} />
                  <div style={{ width: '65%', height: 9, borderRadius: 12, background: skel }} />
                </div>
              </div>
            ))
          : filtered.map(store => {
              const rating     = parseFloat(store.averageRating ?? '0');
              const coverImg   = store.banner || store.logo;
              const isVerified = store.verificationStatus === 'approved';
              const initial    = (store.name || 'S')[0].toUpperCase();

              return (
                <button
                  key={store.id}
                  onClick={() => navigate(`/sellers/${store.id}`)}
                  style={{
                    width: '100%', aspectRatio: '0.85',
                    background: card, borderRadius: 12, overflow: 'hidden',
                    cursor: 'pointer', textAlign: 'left', padding: 0,
                    WebkitTapHighlightColor: 'transparent',
                    border: `1px solid ${bdr}`,
                    display: 'flex', flexDirection: 'column',
                  }}
                >
                  {/* Image — 55% of card height */}
                  <div style={{
                    flex: '0 0 55%', position: 'relative',
                    background: isDark ? '#2C2C2E' : '#F2F2F7', overflow: 'hidden',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {coverImg
                      ? <img src={coverImg} alt={store.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <span style={{ fontSize: 38, fontWeight: 900, color: accent, opacity: 0.85 }}>
                          {initial}
                        </span>}

                    {/* Verified badge */}
                    {isVerified && (
                      <div style={{
                        position: 'absolute', top: 6, right: 6,
                        display: 'flex', alignItems: 'center', gap: 3,
                        background: '#1E3A5F', borderRadius: 6,
                        padding: '2px 6px',
                      }}>
                        <svg width={8} height={8} viewBox="0 0 24 24" fill="#60A5FA" stroke="none">
                          <path d="M12 2 3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7z"/>
                        </svg>
                        <span style={{ fontSize: 8, fontWeight: 800, color: '#60A5FA', letterSpacing: 0.3 }}>
                          Verified
                        </span>
                      </div>
                    )}

                    {/* Items available pill */}
                    {store.productCount != null && store.productCount > 0 && (
                      <div style={{
                        position: 'absolute', bottom: 6, left: 6,
                        background: 'rgba(0,0,0,0.52)', color: '#fff',
                        fontSize: 8, fontWeight: 700, padding: '2px 7px',
                        borderRadius: 5, backdropFilter: 'blur(4px)',
                        letterSpacing: 0.2,
                      }}>
                        {store.productCount} item{store.productCount !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>

                  {/* Info — fills remaining 45% */}
                  <div style={{
                    flex: 1, padding: '7px 9px 9px',
                    background: card, display: 'flex',
                    flexDirection: 'column', justifyContent: 'space-between',
                  }}>
                    {/* Store name */}
                    <div style={{
                      fontSize: 12, fontWeight: 700, color: txt,
                      lineHeight: 1.25,
                      overflow: 'hidden', display: '-webkit-box',
                      WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
                    }}>
                      {store.name}
                    </div>

                    {/* Seller name */}
                    {store.sellerName && (
                      <div style={{
                        fontSize: 10, color: muted, marginTop: 2,
                        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
                      }}>
                        by {store.sellerName}
                      </div>
                    )}

                    {/* Rating + sales row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                      {/* Star + rating */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <svg width={10} height={10} viewBox="0 0 24 24" fill={AMBER} stroke="none">
                          <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z"/>
                        </svg>
                        <span style={{ fontSize: 10, fontWeight: 700, color: rating > 0 ? txt : muted }}>
                          {rating > 0 ? rating.toFixed(1) : 'New'}
                        </span>
                      </div>

                      {/* Sales divider + count */}
                      {store.totalOrders != null && store.totalOrders > 0 && (
                        <>
                          <span style={{ fontSize: 9, color: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', fontWeight: 700 }}>·</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={2} strokeLinecap="round">
                              <path d="M5 7h14l-1 13H6z"/>
                            </svg>
                            <span style={{ fontSize: 9, color: muted }}>
                              {store.totalOrders >= 1000
                                ? `${(store.totalOrders / 1000).toFixed(1)}k`
                                : store.totalOrders} sold
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

        {!isLoading && filtered.length === 0 && (
          <div style={{
            gridColumn: '1 / -1', padding: '60px 0',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
          }}>
            <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} strokeLinecap="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <path d="M9 22V12h6v10"/>
            </svg>
            <span style={{ fontSize: 14, color: muted, textAlign: 'center' }}>
              {search ? `No stores matching "${search}"` : 'No stores available yet'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
