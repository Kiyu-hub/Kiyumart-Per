import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getCategoryIcon, CAT_EMOJI } from "@/lib/categoryIcons";

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';

interface Category {
  id: string; name: string; image?: string;
  isActive: boolean; productCount: number;
  storeTypes?: string[] | null;
}

// Categories scoped only to food vendors live on the Restaurants & Local
// Vendors page — they must never leak into the generic category grid.
function isFoodCategory(c: Category): boolean {
  return Array.isArray(c.storeTypes) &&
    c.storeTypes.some((t) => t === "food_beverages" || t === "restaurant");
}

export default function MobileAllCategories() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [isDark, setIsDark] = useState(true);

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

  const bg    = isDark ? '#111111' : '#F2F2F7';
  const card  = isDark ? '#1C1C1E' : '#FFFFFF';
  const hdr   = isDark ? '#111111' : '#FFFFFF';
  const bdr   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const txt   = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)';
  const inp   = isDark ? '#2C2C2E' : '#EBEBF0';
  const skel  = isDark ? '#2C2C2E' : '#E5E5EA';

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ['/api/categories'],
    queryFn: async () => {
      const res = await fetch('/api/categories');
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d)
        ? d.filter((c: any) =>
            c.isActive !== false &&
            (c.productCount ?? 0) > 0 &&
            !isFoodCategory(c as Category),
          )
        : [];
    },
    staleTime: 60_000,
  });

  const filtered = search.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : categories;

  return (
    <div style={{ background: bg, minHeight: '100dvh', fontFamily: F }}>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: hdr,
        borderBottom: `1px solid ${bdr}`,
        padding: '14px 16px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', height: 36 }}>
          <button
            onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}
            style={{
              position: 'absolute', left: 0,
              width: 32, height: 32, borderRadius: 12,
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
          <span style={{ fontSize: 16, fontWeight: 700, color: txt }}>All Category</span>
        </div>

        <div style={{ marginTop: 10, background: inp, borderRadius: 12, position: 'relative', display: 'flex', alignItems: 'center' }}>
          <svg style={{ position: 'absolute', left: 12 }}
            width={15} height={15} viewBox="0 0 24 24" fill="none"
            stroke={muted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find your perfect category here..."
            style={{
              width: '100%', height: 42, background: 'transparent',
              border: 'none', outline: 'none',
              paddingLeft: 38, paddingRight: 14,
              fontSize: 14, color: txt, fontFamily: F,
              boxSizing: 'border-box' as const,
            }}
          />
        </div>
      </div>

      {/* 2-col grid */}
      <div style={{ padding: '12px 12px 100px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {isLoading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div key={i} style={{
                background: card, borderRadius: 12, overflow: 'hidden',
                boxShadow: isDark ? 'none' : '0 1px 6px rgba(0,0,0,0.08)',
              }}>
                <div style={{ aspectRatio: '1', background: skel }} />
                <div style={{ padding: '6px 8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: '65%', height: 10, borderRadius: 12, background: skel }} />
                  <div style={{ width: '42%', height: 8, borderRadius: 12, background: skel }} />
                </div>
              </div>
            ))
          : filtered.map((cat, i) => {
              // Prefer actual DB image; only use illustration as fallback
              const dbImg = cat.image ?? null;
              const iconSrc = dbImg ?? getCategoryIcon(cat.name) ?? null;
              const isIllustration = !dbImg && !!getCategoryIcon(cat.name);
              return (
              <button
                key={cat.id}
                onClick={() => navigate(`/products?category=${cat.id}`)}
                style={{
                  background: card, borderRadius: 12, overflow: 'hidden',
                  cursor: 'pointer', textAlign: 'center', padding: 0,
                  WebkitTapHighlightColor: 'transparent',
                  boxShadow: isDark ? 'none' : '0 1px 6px rgba(0,0,0,0.08)',
                  border: 'none',
                }}
              >
                {/* Image — fills tile edge-to-edge */}
                <div style={{
                  aspectRatio: '1', overflow: 'hidden',
                  background: isIllustration
                    ? (isDark ? '#1C2C2A' : '#E8F5E9')
                    : (isDark ? '#1C1C1E' : '#F5F5F5'),
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: isIllustration ? 12 : 0,
                }}>
                  {iconSrc
                    ? <img src={iconSrc} alt={cat.name}
                        style={{
                          width: '100%', height: '100%',
                          objectFit: isIllustration ? 'contain' : 'cover',
                          display: 'block',
                        }} />
                    : <span style={{ fontSize: 48 }}>{CAT_EMOJI[i % CAT_EMOJI.length]}</span>}
                </div>
                {/* Name + count — centered */}
                <div style={{ padding: '4px 8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: txt, lineHeight: 1.3 }}>
                    {cat.name}
                  </div>
                  <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                    {cat.productCount} {cat.productCount === 1 ? 'Product' : 'Products'}
                  </div>
                </div>
              </button>
            );
          })}

        {!isLoading && filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: '60px 0', textAlign: 'center', color: muted, fontSize: 14 }}>
            No categories found
          </div>
        )}
      </div>
    </div>
  );
}
