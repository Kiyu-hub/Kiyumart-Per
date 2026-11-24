/**
 * Mobile Home — Fashion layout. The only mobile/tablet homepage.
 *
 * Approved redesign (Prompt 02/03); made permanent by the product owner on
 * 2026-11-24, replacing the original MobileHome.tsx (recoverable from Git
 * history, e.g. `git show 68561d6:client/src/pages/mobile/MobileHome.tsx`).
 *
 * Header, theme toggle, notifications/cart badges, location, banner data and
 * the restaurants section keep the original behaviour. Colours are the
 * existing mobile palette only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { navigateToBannerLink } from "@/lib/bannerNavigation";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { fetchSameOriginJson } from "@/lib/queryClient";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useToast } from "@/hooks/use-toast";
import { getMobileNavVariant } from "@/lib/homeVariant";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Sun, Moon, Store, Truck } from "lucide-react";
import {
  getFoodStoreIdSet,
  splitProductsByFoodStores,
} from "@/lib/foodVendors";
import type { Product } from "@shared/schema";

// ── Prop types (moved from the retired MobileHome.tsx, unchanged) ─────────────
type ProductWithMeta = Product & {
  categoryName?: string | null;
  categoryId?: string | null;
};
interface Category {
  id: string; name: string; slug: string; image: string;
  displayOrder: number; isActive: boolean;
}
interface WishlistItem { id: string; userId: string; productId: string; }
export interface MobileHomeProps {
  featuredProducts: ProductWithMeta[];
  newArrivalProducts: ProductWithMeta[];
  allProducts?: ProductWithMeta[];
  categories: Category[];
  stores: any[];
  wishlist: WishlistItem[];
  isLoading: boolean;
  onToggleWishlist: (id: string) => void;
}

// ── Existing KiyuMart mobile palette (unchanged values) ───────────────────────
const F      = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL   = '#009688';
const AMBER  = '#F59E0B';
const C_RED  = '#EF4444';

const S   = 'var(--ms)';   // surface
const SHI = 'var(--msh)';  // surface highlight / skeleton
const MM  = 'var(--mm)';   // muted text
const MO  = 'var(--mo)';   // outline / border
const MT  = 'var(--mt)';   // primary text

const FASHION_STORE_TYPES = new Set(['clothing']);

// Scoped interaction styles (press feedback, hidden scrollbars, reduced motion).
const SCOPED_CSS = `
.kmf-rail{display:flex;gap:12px;overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;-webkit-overflow-scrolling:touch;scroll-snap-type:x proximity;scroll-padding-inline:16px;padding:0 16px 4px}
.kmf-rail::-webkit-scrollbar{display:none}
.kmf-rail > *{scroll-snap-align:start}
.kmf-press{transition:transform .15s ease, opacity .15s ease}
.kmf-press:active{transform:scale(.97);opacity:.92}
.kmf-card:focus-visible,.kmf-press:focus-visible{outline:2px solid ${TEAL};outline-offset:2px;border-radius:14px}
.kmf-fade{animation:kmfFade .35s ease both}
@keyframes kmfFade{from{opacity:.001;transform:translateY(6px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion: reduce){.kmf-press,.kmf-fade{transition:none;animation:none}}
`;

// ── Icons (same set as MobileHome) ────────────────────────────────────────────
function Ico({ name, size = 22, color = 'currentColor', stroke = 2, fill = 'none' }: {
  name: string; size?: number; color?: string; stroke?: number; fill?: string;
}) {
  const p: Record<string, React.ReactNode> = {
    search:    <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bag:       <><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></>,
    bell:      <><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 18a2 2 0 0 0 4 0"/></>,
    tune:      <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    location:  <><path d="M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
    chevRight: <path d="m9 5 7 7-7 7"/>,
    store:     <><path d="M3 9l1.5-5h15L21 9"/><path d="M4 9h16v11H4z"/><path d="M9 20v-6h6v6"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {p[name]}
    </svg>
  );
}

// ── Price / discount helper (same rules as MobileHome ProductCard) ────────────
function priceInfo(product: any) {
  const price     = parseFloat(product?.price ?? '0');
  const costPrice = product?.costPrice ? parseFloat(product.costPrice) : null;
  const discField = parseFloat(product?.discount ?? '0');
  const computedDisc = costPrice && costPrice > price
    ? Math.round(((costPrice - price) / costPrice) * 100) : 0;
  const disc = discField > 0 ? Math.round(discField) : computedDisc;
  const was  = disc > 0
    ? (costPrice && costPrice > price ? costPrice : price / (1 - disc / 100))
    : null;
  return { price, disc, was };
}

// ── Fashion product card: 3:4 portrait, round heart, store name, real ratings only ──
function FashionProductCard({
  product, storeName, isWishlisted, onToggleWishlist, onClick,
}: {
  product: any; storeName?: string | null; isWishlisted: boolean;
  onToggleWishlist: (id: string) => void; onClick: () => void;
}) {
  const images = Array.isArray(product?.images) ? product.images : [product?.images];
  const { price, disc, was } = priceInfo(product);
  const rating      = parseFloat((product as any)?.ratings ?? (product as any)?.averageRating ?? '0');
  const ratingCount = Number((product as any)?.totalRatings ?? (product as any)?.reviewCount ?? 0);
  const hasRating   = rating > 0 && ratingCount > 0;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={product?.name}
      className="kmf-card kmf-press"
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
      style={{ cursor: 'pointer', WebkitTapHighlightColor: 'transparent', minWidth: 0 }}
    >
      <div style={{ position: 'relative', aspectRatio: '3 / 4', borderRadius: 14, overflow: 'hidden', background: SHI }}>
        {images[0]
          ? <img src={images[0]} alt={product?.name ?? ''} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
              <Ico name="bag" size={32} color={MM} />
            </div>}

        {disc > 0 && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: C_RED, color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6, letterSpacing: 0.2,
          }}>
            {disc}% OFF
          </div>
        )}

        <button
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          aria-pressed={isWishlisted}
          onClick={(e) => { e.stopPropagation(); product?.id && onToggleWishlist(product.id); }}
          onKeyDown={(e) => e.stopPropagation()}
          style={{
            // 44px tap area (site-wide touch-target rule); the visible circle is 32px.
            position: 'absolute', top: 2, right: 2, width: 44, height: 44,
            background: 'transparent', border: 'none', padding: 0,
            display: 'grid', placeItems: 'center',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{
            width: 32, height: 32, borderRadius: 16, display: 'grid', placeItems: 'center',
            background: 'rgba(255,255,255,0.94)', boxShadow: '0 1px 4px rgba(0,0,0,0.14)',
          }}>
            <svg width={15} height={15} viewBox="0 0 24 24"
              fill={isWishlisted ? C_RED : 'none'}
              stroke={isWishlisted ? C_RED : '#111111'}
              strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
            </svg>
          </span>
        </button>
      </div>

      <div style={{ padding: '8px 2px 2px' }}>
        {storeName && (
          <div style={{
            fontSize: 10.5, fontWeight: 600, color: MM, letterSpacing: 0.4, textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2,
          }}>
            {storeName}
          </div>
        )}
        <div style={{
          fontSize: 13, fontWeight: 600, color: MT, lineHeight: 1.3,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        } as React.CSSProperties}>
          {product?.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          <span style={{ fontSize: 14.5, fontWeight: 800, color: TEAL, letterSpacing: -0.2 }}>
            GH₵{price.toFixed(2)}
          </span>
          {was && (
            <span style={{ fontSize: 11, color: MM, textDecoration: 'line-through' }}>
              GH₵{was.toFixed(2)}
            </span>
          )}
        </div>
        {hasRating && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <svg width={11} height={11} viewBox="0 0 24 24" fill={AMBER} stroke="none" aria-hidden="true">
              <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z"/>
            </svg>
            <span style={{ fontSize: 11, color: MM }}>{rating.toFixed(1)} ({ratingCount.toLocaleString()})</span>
          </div>
        )}
      </div>
    </div>
  );
}

function FashionProductSkeleton() {
  return (
    <div>
      <div style={{ aspectRatio: '3 / 4', borderRadius: 14, background: SHI }} />
      <div style={{ height: 9, borderRadius: 6, background: SHI, margin: '10px 0 6px', width: '45%' }} />
      <div style={{ height: 11, borderRadius: 6, background: SHI, marginBottom: 6, width: '85%' }} />
      <div style={{ height: 11, borderRadius: 6, background: SHI, width: '40%' }} />
    </div>
  );
}

// ── Classic card — used ONLY for the existing restaurants section (unchanged look) ──
function ClassicFoodCard({
  product, isWishlisted, onToggleWishlist, onClick,
}: { product: any; isWishlisted: boolean; onToggleWishlist: (id: string) => void; onClick: () => void }) {
  const images = Array.isArray(product?.images) ? product.images : [product?.images];
  const { price, disc, was } = priceInfo(product);
  const prep   = (product as any)?.prepTime ?? null;
  const rating = parseFloat((product as any)?.ratings ?? (product as any)?.averageRating ?? '0');
  const soldNum = Number((product as any)?.totalRatings ?? (product as any)?.reviewCount ?? 0);
  return (
    <div onClick={onClick} style={{ borderRadius: 12, overflow: 'hidden', background: S, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', border: `1px solid ${MO}` }}>
      <div style={{ position: 'relative', aspectRatio: '5 / 4', background: SHI }}>
        {images[0]
          ? <img src={images[0]} alt={product?.name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}><Ico name="bag" size={32} color={MM} /></div>}
        {disc > 0 && (
          <div style={{ position: 'absolute', top: 7, left: 7, background: C_RED, color: '#fff', fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5, letterSpacing: 0.3 }}>{disc}% OFF</div>
        )}
        {prep && (
          <div style={{ position: 'absolute', top: disc > 0 ? 30 : 7, left: 7, display: 'flex', alignItems: 'center', gap: 3, background: 'rgba(0,0,0,0.55)', padding: '2px 6px', borderRadius: 5, fontSize: 9, fontWeight: 600, color: '#fff' }}>
            <Ico name="clock" size={9} color="#fff" /> {prep}
          </div>
        )}
        <button
          aria-label={isWishlisted ? 'Remove from wishlist' : 'Add to wishlist'}
          onClick={(e) => { e.stopPropagation(); product?.id && onToggleWishlist(product.id); }}
          style={{ position: 'absolute', top: 7, right: 7, width: 28, height: 28, borderRadius: 8, background: 'rgba(0,0,0,0.45)', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24" fill={isWishlisted ? C_RED : 'none'} stroke={isWishlisted ? C_RED : 'rgba(255,255,255,0.9)'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
          </svg>
        </button>
      </div>
      <div style={{ padding: '5px 7px 7px' }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: MT, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{product?.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
          <svg width={10} height={10} viewBox="0 0 24 24" fill={TEAL} stroke="none"><path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z"/></svg>
          <span style={{ fontSize: 10, color: MM }}>{rating.toFixed(1)}</span>
          {soldNum > 0 && <><span style={{ fontSize: 10, color: MM }}>·</span><span style={{ fontSize: 10, color: MM }}>{soldNum.toLocaleString()} sold</span></>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
          {was && <span style={{ fontSize: 10, color: MM, textDecoration: 'line-through' }}>GH₵{was.toFixed(2)}</span>}
          <span style={{ fontSize: 12, fontWeight: 800, color: '#00BFA5', letterSpacing: -0.3 }}>GH₵{price.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, actionLabel = 'See all', onAction }: {
  title: string; sub?: string; actionLabel?: string; onAction?: () => void;
}) {
  return (
    <div style={{ padding: '22px 16px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: MT, letterSpacing: -0.3, lineHeight: 1.2 }}>{title}</h2>
        {sub && <div style={{ fontSize: 12, color: MM, marginTop: 3 }}>{sub}</div>}
      </div>
      {onAction && (
        <button onClick={onAction} className="kmf-press" style={{
          fontSize: 13, color: TEAL, fontWeight: 600, background: 'none', border: 'none',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0, padding: '4px 0',
        }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ── Category circle ───────────────────────────────────────────────────────────
function CategoryCircle({ cat, onClick }: { cat: any; onClick: () => void }) {
  const initial = String(cat?.name || '?').trim().charAt(0).toUpperCase();
  return (
    <button onClick={onClick} className="kmf-press" style={{
      flex: 'none', width: 72, background: 'none', border: 'none', padding: 0,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7,
      cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{
        width: 68, height: 68, borderRadius: 34, overflow: 'hidden', background: SHI,
        boxShadow: `0 0 0 1px ${MO}`, display: 'grid', placeItems: 'center',
      }}>
        {cat?.image
          ? <img src={cat.image} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ fontSize: 24, fontWeight: 700, color: TEAL }}>{initial}</span>}
      </div>
      <span style={{
        fontSize: 11.5, fontWeight: 600, color: MT, lineHeight: 1.2, textAlign: 'center', width: '100%',
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
      } as React.CSSProperties}>
        {cat?.name}
      </span>
    </button>
  );
}

// ── Banner slider: same data + renderer as MobileHome, dots instead of counter ──
function FashionBannerSlider() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { data: platformSettings } = useQuery<{
    isMultiVendor: boolean; adsEnabled?: boolean;
    heroBannerEnabled?: boolean; heroBannerAdImage?: string | null; heroBannerAdUrl?: string | null;
  }>({ queryKey: ['/api/public/platform-settings'], staleTime: 60_000 });

  const storeMode = platformSettings?.isMultiVendor ? 'multivendor' : 'single';

  const { data: rawBanners = [] } = useQuery<any[]>({
    queryKey: ['/api/hero-banners', storeMode, 'mobile', 'home'],
    queryFn: async () => {
      const res = await fetch(`/api/hero-banners?storeMode=${storeMode}&placement=home`);
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d.filter((b: any) => b.isActive) : [];
    },
    enabled: !!platformSettings,
    staleTime: 60_000,
  });

  const { data: promos = [] } = useQuery<any[]>({
    queryKey: ['/api/homepage/promotional', 'banner'],
    queryFn: async () => {
      const res = await fetch('/api/homepage/promotional?section=banner');
      if (!res.ok) return [];
      const d = await res.json();
      return Array.isArray(d) ? d : [];
    },
    staleTime: 60_000,
  });

  const slides = useMemo(() => {
    const map = (b: any, id: string) => ({
      id, image: b.image || null, title: b.title || '', subtitle: b.subtitle || null,
      ctaText: b.ctaText || null, ctaLink: b.ctaLink || null, bannerConfig: b.bannerConfig || null,
    });
    const all = [
      ...rawBanners.map((b: any) => map(b, b.id)),
      ...(promos as any[]).map((p: any) => map(p, `promo-${p.id}`)),
    ];
    if (platformSettings?.adsEnabled !== false && platformSettings?.heroBannerEnabled && platformSettings?.heroBannerAdImage) {
      all.unshift({ id: 'hero-ad', image: platformSettings.heroBannerAdImage, title: '', subtitle: null, ctaText: null, ctaLink: platformSettings.heroBannerAdUrl || null, bannerConfig: null });
    }
    return all;
  }, [rawBanners, promos, platformSettings]);

  useEffect(() => { if (active >= slides.length && slides.length > 0) setActive(0); }, [slides.length, active]);

  const restartTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (slides.length > 1) timerRef.current = setInterval(() => setActive(a => (a + 1) % slides.length), 5000);
  };
  const goTo = (i: number) => { setActive(i); restartTimer(); };

  useEffect(() => {
    if (slides.length < 2) return;
    timerRef.current = setInterval(() => setActive(a => (a + 1) % slides.length), 5000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [slides.length]);

  const handleTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && active < slides.length - 1) goTo(active + 1);
    else if (dx > 0 && active > 0) goTo(active - 1);
  };

  const BANNER_H = 200;
  const BANNER_R = 18;

  // Same admin bannerConfig support as MobileHome (background, overlay, text, CTA, sponsored).
  const renderBanner = (slide: any) => {
    if (!slide) return null;
    const cfg = slide.bannerConfig as any;
    const bgImage: string | null = slide.image || (cfg?.background?.type === 'image' ? cfg.background.value : null);
    const solidBg: string = cfg?.background?.value || `linear-gradient(135deg, ${TEAL} 0%, #00897B 100%)`;
    const titleText  = cfg?.title?.text    || slide.title    || '';
    const titleColor = cfg?.title?.color   || '#ffffff';
    const titleSize  = cfg?.title?.size === '4xl' ? 22 : cfg?.title?.size === '3xl' ? 20 : cfg?.title?.size === '2xl' ? 18 : 17;
    const subText    = cfg?.subtitle?.text || slide.subtitle || '';
    const subColor   = cfg?.subtitle?.color || 'rgba(255,255,255,0.88)';
    const ctaBg      = cfg?.cta?.bgColor   || '#ffffff';
    const ctaColor   = cfg?.cta?.textColor || '#111111';
    const ctaLabel   = cfg?.cta?.text      || slide.ctaText  || '';
    const extraTexts: any[] = cfg?.extraTexts || [];
    const showSponsored: boolean = cfg?.showSponsored || false;
    const overlayUrl      = cfg?.overlay?.imageUrl || null;
    const overlayOpacity  = cfg?.overlay?.opacity != null ? cfg.overlay.opacity : 1;
    const overlayRotation = cfg?.overlay?.rotation || 0;
    const layout = cfg?.layout || 'left';
    const textOnRight  = layout === 'right';
    const textCentered = layout === 'center';
    const hasText = !!(titleText || subText || extraTexts.length > 0);

    return (
      <div
        style={{ width: '100%', height: '100%', position: 'relative', cursor: slide.ctaLink ? 'pointer' : 'default', overflow: 'hidden', background: bgImage ? undefined : solidBg }}
        onClick={() => navigateToBannerLink(slide.ctaLink, navigate)}
      >
        {bgImage && <img src={bgImage} alt={titleText || 'Banner'} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        {overlayUrl && (
          <div style={{ position: 'absolute', [textOnRight ? 'left' : 'right']: 0, top: 0, bottom: 0, width: textCentered ? '100%' : '46%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 }}>
            <img src={overlayUrl} alt="" style={{ maxHeight: '92%', maxWidth: '92%', objectFit: 'contain', opacity: overlayOpacity, transform: overlayRotation ? `rotate(${overlayRotation}deg)` : undefined, filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.3))' }} />
          </div>
        )}
        {hasText && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 3,
            background: textCentered
              ? 'rgba(0,0,0,0.35)'
              : 'linear-gradient(180deg, rgba(0,0,0,0) 28%, rgba(0,0,0,0.72) 100%)',
            display: 'flex', flexDirection: 'column', justifyContent: textCentered ? 'center' : 'flex-end',
            alignItems: textCentered ? 'center' : textOnRight ? 'flex-end' : 'flex-start',
            padding: '16px 18px 18px',
          }}>
            {showSponsored && <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(255,255,255,0.75)', marginBottom: 4, textTransform: 'uppercase' }}>Sponsored</div>}
            {titleText && <div style={{ fontSize: titleSize, fontWeight: 700, color: titleColor, lineHeight: 1.2, letterSpacing: -0.3, textShadow: '0 1px 6px rgba(0,0,0,0.35)', maxWidth: overlayUrl && !textCentered ? '58%' : '100%', textAlign: textCentered ? 'center' : textOnRight ? 'right' : 'left' }}>{titleText}</div>}
            {subText && <div style={{ fontSize: 12, color: subColor, marginTop: 3, lineHeight: 1.4, maxWidth: overlayUrl && !textCentered ? '58%' : '100%', textAlign: textCentered ? 'center' : textOnRight ? 'right' : 'left' }}>{subText}</div>}
            {extraTexts.map((et: any) => (
              <div key={et.id} style={{ fontSize: Math.min(et.fontSize ?? 13, 13), color: et.color || '#ffffff', fontWeight: et.fontWeight === 'bold' ? 700 : 400, marginTop: 2, lineHeight: 1.3 }}>{et.text}</div>
            ))}
            {slide.ctaLink && ctaLabel && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateToBannerLink(slide.ctaLink, navigate); }}
                style={{ marginTop: 10, background: ctaBg, color: ctaColor, border: 'none', borderRadius: 12, padding: '8px 16px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
              >
                {ctaLabel}
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (!platformSettings) {
    return <div style={{ height: BANNER_H, margin: '16px 16px 0', borderRadius: BANNER_R, background: SHI }} />;
  }
  if (slides.length === 0) return null;

  return (
    <div style={{ margin: '16px 16px 0', position: 'relative' }}>
      <div
        style={{ height: BANNER_H, borderRadius: BANNER_R, overflow: 'hidden', position: 'relative', background: SHI }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {renderBanner(slides[active])}
      </div>
      {slides.length > 1 && (
        // Position indicator only (like the original "1/7" counter); swipe changes slides.
        <div
          role="img"
          aria-label={`Banner ${active + 1} of ${slides.length}`}
          style={{ position: 'absolute', right: 14, bottom: 14, zIndex: 10, display: 'flex', gap: 5, pointerEvents: 'none' }}
        >
          {slides.map((s, i) => (
            <span
              key={s.id}
              style={{
                display: 'block', width: i === active ? 16 : 6, height: 6, borderRadius: 3,
                background: i === active ? '#ffffff' : 'rgba(255,255,255,0.5)',
                transition: 'width .2s ease',
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
export function MobileHomeFashion({
  featuredProducts = [], newArrivalProducts = [], allProducts = [],
  categories = [], stores = [], wishlist = [], isLoading, onToggleWishlist,
}: MobileHomeProps) {
  const { user }     = useAuth();
  const [, navigate] = useLocation();
  const { isMultiVendor: mvFromPublic, isExternalRiderSystemEnabled, restaurantsEnabled } = usePlatformSettings();
  const { data: fullSettings } = useQuery<any>({
    queryKey: ['/api/public/platform-settings'],
    staleTime: 60_000,
  });
  const isMultiVendor: boolean          = (fullSettings as any)?.isMultiVendor === true || mvFromPublic;
  const shopDisplayMode: string         = (fullSettings as any)?.shopDisplayMode ?? 'by-store';
  const showShopBySection: boolean      = (fullSettings as any)?.showShopBySection !== false;
  const showFeaturedSection: boolean    = (fullSettings as any)?.showHomepageFeaturedSection !== false;
  const showNewArrivalsSection: boolean = (fullSettings as any)?.showHomepageNewArrivalSection !== false;

  const safeStores      = Array.isArray(stores)            ? stores            : [];
  const safeCats        = Array.isArray(categories)        ? categories        : [];
  const safeWishlist    = Array.isArray(wishlist)          ? wishlist          : [];
  const safeFeatured    = Array.isArray(featuredProducts)  ? featuredProducts  : [];
  const safeNewArr      = Array.isArray(newArrivalProducts) ? newArrivalProducts : [];
  const safeAllProducts = Array.isArray(allProducts)       ? allProducts       : [];
  const loading = isLoading;

  // Same food-separation rules as MobileHome.
  const foodStoreIds = useMemo(() => getFoodStoreIdSet(safeStores), [safeStores]);
  const { foodVendorProducts: localVendorProducts, regularProducts: generalProducts } = useMemo(
    () => splitProductsByFoodStores(safeAllProducts, safeStores),
    [safeAllProducts, safeStores],
  );
  const featuredNoFood = useMemo(
    () => safeFeatured.filter((p) => !foodStoreIds.has(String((p as any)?.storeId || ''))),
    [safeFeatured, foodStoreIds],
  );
  const newArrNoFood = useMemo(
    () => safeNewArr.filter((p) => !foodStoreIds.has(String((p as any)?.storeId || ''))),
    [safeNewArr, foodStoreIds],
  );

  // Store name lookup for product cards (multi-vendor only — one store in single mode).
  const storeNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of safeStores) if (s?.id && s?.name) m.set(String(s.id), String(s.name));
    return m;
  }, [safeStores]);
  const storeNameFor = (p: any) => (isMultiVendor ? storeNameById.get(String(p?.storeId || '')) ?? null : null);

  // Stores: non-food, with an image, fashion store types first (stable order otherwise).
  const visibleStores = useMemo(() => {
    const list = safeStores.filter((s: any) => s && (s.banner || s.logo) && !foodStoreIds.has(String(s.id || '')));
    return list
      .map((s: any, i: number) => ({ s, i, fashion: FASHION_STORE_TYPES.has(String(s?.storeType || '')) ? 0 : 1 }))
      .sort((a, b) => a.fashion - b.fashion || a.i - b.i)
      .map((x) => x.s);
  }, [safeStores, foodStoreIds]);

  // Categories: every ACTIVE admin category shows, even with zero products
  // (same rule as release PR #11); food-scoped ones are dropped; fashion first.
  const visibleCats = useMemo(() => {
    const list = safeCats.filter((c: any) => {
      if (c?.isActive === false) return false;
      const types = Array.isArray(c?.storeTypes) ? c.storeTypes : [];
      return !types.some((t: string) => t === 'food_beverages' || t === 'restaurant');
    });
    return list
      .map((c: any, i: number) => {
        const types: string[] = Array.isArray(c?.storeTypes) ? c.storeTypes : [];
        return { c, i, fashion: types.some((t) => FASHION_STORE_TYPES.has(t)) ? 0 : 1 };
      })
      .sort((a, b) => a.fashion - b.fashion || a.i - b.i)
      .map((x) => x.c);
  }, [safeCats]);

  // Admin-controlled discovery: Shop by Category OR Shop by Store — never both.
  // Same rule and fallback as MobileHome: single-store always browses by category;
  // multi-vendor follows shopDisplayMode (missing → 'by-store').
  const effectiveDisplayMode: string = !isMultiVendor ? 'by-category' : shopDisplayMode;
  const discoveryByStore = effectiveDisplayMode === 'by-store';
  const showCategories = showShopBySection && !discoveryByStore && (loading || visibleCats.length > 0);
  const showStores     = showShopBySection && discoveryByStore && (loading || visibleStores.length > 0);
  const showFeatured = showFeaturedSection && (loading || featuredNoFood.length > 0);
  const showNewArrivals = showNewArrivalsSection && (loading || newArrNoFood.length > 0);
  const showRestaurants = restaurantsEnabled && (loading || localVendorProducts.length > 0);
  const hasAnything = loading || showCategories || showStores || featuredNoFood.length > 0
    || newArrNoFood.length > 0 || generalProducts.length > 0 || localVendorProducts.length > 0;

  // Theme toggle — identical behaviour to MobileHome (localStorage 'theme' + html.dark).
  const [isDark, setIsDark] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const dark = saved ? saved === 'dark' : !window.matchMedia('(prefers-color-scheme: light)').matches;
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);
  const toggleTheme = () => {
    const next = !isDark;
    setIsDark(next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['/api/notifications/unread-count', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (!res.ok) return 0;
      return res.json();
    },
    enabled: !!user,
  });

  const { data: cartData } = useQuery<any>({
    queryKey: ['/api/cart'],
    queryFn: () => fetchSameOriginJson('/api/cart'),
    enabled: !!user,
  });
  const headerCartBadge = Array.isArray(cartData)
    ? cartData.reduce((s: number, i: any) => s + (i.quantity || 1), 0)
    : 0;

  // Location — saved on this device (localStorage 'kiyumart_user_location',
  // the same key the food pages, sign-up and checkout prefill read), so it
  // survives reloads and app restarts. Tap the label to update it.
  const { toast } = useToast();
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locLoading, setLocLoading]       = useState(false);
  const LOC_KEY = 'kiyumart_user_location';

  const shortLabel = (v: unknown): string | null => {
    const t = String(v ?? '').trim();
    return t ? t.split(',')[0].trim() || null : null;
  };

  // Reverse-geocode via the existing server proxy (/api/public/geocode/reverse),
  // which sends Nominatim a proper User-Agent and avoids browser CORS issues.
  async function lookupCity(lat: number, lon: number): Promise<{ city: string | null; label: string | null }> {
    try {
      const r = await fetch(`/api/public/geocode/reverse?lat=${lat}&lon=${lon}`);
      if (!r.ok) return { city: null, label: null };
      const d = await r.json();
      const a = d?.raw?.address || {};
      const city = a.city || a.town || a.village || a.suburb || a.county || null;
      return { city, label: d?.display_name || null };
    } catch {
      return { city: null, label: null };
    }
  }

  function saveLocation(next: Record<string, unknown>) {
    try {
      const prev = JSON.parse(localStorage.getItem(LOC_KEY) || '{}');
      localStorage.setItem(LOC_KEY, JSON.stringify({ ...prev, ...next, timestamp: Date.now() }));
    } catch { /* storage blocked: label still shows for this visit */ }
  }

  function requestLocation() {
    if (locLoading) return;
    if (!navigator.geolocation) {
      toast({ title: 'Location unavailable', description: 'This device or browser does not share location.', variant: 'destructive' });
      return;
    }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const { city, label } = await lookupCity(latitude, longitude);
        const shown = city || shortLabel(label) || 'Current location';
        saveLocation({ latitude, longitude, city: shown, ...(label ? { label } : {}) });
        setLocationLabel(shown);
        setLocLoading(false);
      },
      (err) => {
        setLocLoading(false);
        toast({
          title: "Couldn't get your location",
          description: err.code === err.PERMISSION_DENIED
            ? 'Allow location access for KiyuMart in your browser settings, then tap "Add your location" again.'
            : 'Please try again in a moment.',
          variant: 'destructive',
        });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }

  // Restore the saved location on load (also picks up one set on the food
  // pages, at sign-up or at checkout). Older entries without a city name are
  // looked up once and the result saved.
  useEffect(() => {
    let cancelled = false;
    try {
      const parsed = JSON.parse(localStorage.getItem(LOC_KEY) || 'null');
      const lat = parsed?.latitude ?? parsed?.lat;
      const lon = parsed?.longitude ?? parsed?.lon;
      const known = shortLabel(parsed?.city) || shortLabel(parsed?.label);
      if (known) setLocationLabel(known);
      else if (typeof lat === 'number' && typeof lon === 'number') {
        lookupCity(lat, lon).then(({ city, label }) => {
          if (cancelled) return;
          const shown = city || shortLabel(label);
          if (shown) { setLocationLabel(shown); saveLocation({ city: shown }); }
        });
      }
    } catch { /* ignore */ }
    return () => { cancelled = true; };
  }, []);

  const firstName   = user?.name?.split(' ')[0] ?? null;
  const displayName = firstName ?? (user?.name) ?? null;

  // Existing mobile palette (MobileHome.tsx L1000–1001).
  const vars = isDark
    ? { '--mb': '#000000', '--ms': '#1A1A1C', '--msh': '#2C2C2E', '--mm': 'rgba(235,235,245,0.5)', '--mo': 'rgba(255,255,255,0.09)', '--mt': '#FFFFFF' }
    : { '--mb': '#F5F5F7', '--ms': '#FFFFFF',  '--msh': '#E8E8ED',  '--mm': 'rgba(60,60,67,0.55)',  '--mo': 'rgba(0,0,0,0.09)',         '--mt': '#111111' };

  const badge = (n: number) => (
    <div style={{
      position: 'absolute', top: 6, right: 5, minWidth: 16, height: 16, borderRadius: 8,
      background: TEAL, fontSize: 10, fontWeight: 700, color: '#fff', display: 'grid', placeItems: 'center',
      padding: '0 4px', border: `1.5px solid ${vars['--mb']}`,
    }}>
      {n > 99 ? '99+' : n}
    </div>
  );

  const showHeaderSellerCta = getMobileNavVariant() !== 'new'
    && (!user || (user.role !== 'seller' && user.role !== 'super_admin' && user.role !== 'admin'));
  const showHeaderRiderCta = !isExternalRiderSystemEnabled
    && (!user || (user.role !== 'rider' && user.role !== 'seller' && user.role !== 'super_admin' && user.role !== 'admin'));

  const isWishlisted = (id: string) => safeWishlist.some((w) => w.productId === id);
  const openProduct  = (id: string) => navigate(`/product/${id}`);

  return (
    <div
      data-home-variant="fashion"
      style={{ ...vars, background: vars['--mb'], color: vars['--mt'], minHeight: '100dvh', fontFamily: F, paddingBottom: 88 } as React.CSSProperties}
    >
      <style>{SCOPED_CSS}</style>

      {/* Top safe space: clears the phone's status bar / notch (installed app or edge-to-edge browser). */}
      <div style={{ height: 'max(12px, env(safe-area-inset-top, 0px))' }} />

      {/* "Become a Seller" now lives in the bottom bar's centre button. The header
          keeps it only while the old bottom bar is in use, so the link is never lost.
          "Become a Rider" stays (only when the internal rider system is on). */}
      {/* Top row: optional Become chips on the left, theme toggle in its original top-right spot. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {showHeaderSellerCta && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => navigate('/become-seller')}>
              <Store className="h-2.5 w-2.5" />
              Become a Seller
            </Button>
          )}
          {showHeaderRiderCta && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => navigate('/become-rider')}>
              <Truck className="h-2.5 w-2.5" />
              Become a Rider
            </Button>
          )}
        </div>
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{ width: 36, height: 36, background: 'none', border: 'none', display: 'grid', placeItems: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
        >
          {isDark
            ? <Sun size={19} color={MT} strokeWidth={1.8} />
            : <Moon size={19} color={MT} strokeWidth={1.8} />}
        </button>
      </div>

      {/* Greeting, notifications, cart — unchanged behaviour, compact spacing */}
      <div style={{ padding: '2px 16px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button
            onClick={() => navigate(user ? '/profile' : '/auth')}
            aria-label={user ? 'Open profile' : 'Sign in'}
            style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            {user ? (
              <div style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden', flexShrink: 0 }}>
                <UserAvatar name={user.name} profileImage={(user as any).profileImage} size="lg" className="w-full h-full" />
              </div>
            ) : (
              <div style={{ width: 46, height: 46, borderRadius: 23, background: S, border: `1px solid ${MO}`, display: 'grid', placeItems: 'center' }}>
                <Ico name="user" size={22} color={MM} />
              </div>
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: MT, lineHeight: 1.2 }}>Hi 👋</div>
            <div style={{ fontSize: 13, color: MM, marginTop: 2, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName ?? (
                // Inline text link: opt out of the global 44px button minimum (the avatar beside it is a full-size sign-in target).
                <button onClick={() => navigate('/auth')} style={{ fontSize: 13, lineHeight: 1.3, color: TEAL, fontWeight: 600, background: 'none', border: 'none', padding: 0, minHeight: 0, minWidth: 0, cursor: 'pointer' }}>
                  Sign in
                </button>
              )}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={() => navigate('/notifications')}
            aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
            style={{ width: 44, height: 44, background: 'transparent', border: 'none', display: 'grid', placeItems: 'center', position: 'relative', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            <Ico name="bell" size={22} color={MT} stroke={1.8} />
            {unreadCount > 0 && badge(unreadCount)}
          </button>
          <button
            onClick={() => navigate('/cart')}
            aria-label={headerCartBadge > 0 ? `Cart, ${headerCartBadge} items` : 'Cart'}
            style={{ width: 44, height: 44, background: 'transparent', border: 'none', display: 'grid', placeItems: 'center', position: 'relative', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            <ShoppingCart size={22} color={MT} strokeWidth={1.8} />
            {headerCartBadge > 0 && badge(headerCartBadge)}
          </button>
        </div>
      </div>

      {/* Location */}
      <div style={{ padding: '2px 16px 12px', display: 'flex', alignItems: 'center', gap: 5, minHeight: 20 }}>
        <Ico name="location" size={13} color={TEAL} />
        <button
          onClick={requestLocation}
          aria-label={locationLabel ? `Delivery location: ${locationLabel}. Tap to update` : 'Add your location'}
          style={{ fontSize: 12, lineHeight: 1.4, color: locationLabel ? MM : TEAL, fontWeight: locationLabel ? 500 : 600, background: 'none', border: 'none', padding: '2px 0', minHeight: 0, minWidth: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', maxWidth: '100%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
        >
          {locLoading ? 'Getting location…' : locationLabel ? <>{locationLabel} <span style={{ color: TEAL, fontWeight: 600 }}>· Change</span></> : '+ Add your location'}
        </button>
      </div>

      {/* Search — same destination, fashion-focused hint text */}
      <div style={{ padding: '0 16px' }}>
        <button
          onClick={() => navigate('/search?mobile=1&from=home')}
          style={{
            width: '100%', height: 48, background: S, borderRadius: 14,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', border: `1px solid ${MO}`,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxSizing: 'border-box',
          }}
        >
          <Ico name="search" size={17} color={MM} />
          <span style={{ fontSize: 15, color: MM, flex: 1, textAlign: 'left', fontFamily: F, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            Search dresses, shoes, stores…
          </span>
        </button>
      </div>

      {/* Promotional banner (existing admin-managed data) */}
      <FashionBannerSlider />

      {/* Shop by Category OR Shop by Store (admin shopDisplayMode) — same circle style */}
      {(showCategories || showStores) && (
        <section className="kmf-fade" data-discovery={discoveryByStore ? 'by-store' : 'by-category'}>
          <SectionHeader
            title={discoveryByStore ? 'Shop by store' : 'Shop by category'}
            onAction={() => navigate(discoveryByStore ? '/mobile/stores' : '/categories')}
          />
          <div className="kmf-rail" style={{ gap: 14 }}>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{ flex: 'none', width: 72, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
                    <div style={{ width: 68, height: 68, borderRadius: 34, background: SHI }} />
                    <div style={{ width: 48, height: 8, borderRadius: 6, background: SHI }} />
                  </div>
                ))
              : <>
                  {discoveryByStore
                    ? visibleStores.slice(0, 8).map((store: any) => (
                        <CategoryCircle
                          key={store.id}
                          cat={{ name: store.name, image: store.banner || store.logo || null }}
                          onClick={() => navigate(`/sellers/${store.id}`)}
                        />
                      ))
                    : visibleCats.slice(0, 8).map((cat: any) => (
                        <CategoryCircle key={cat.id} cat={cat} onClick={() => navigate(`/products?category=${cat.id}`)} />
                      ))}
                  <button
                    onClick={() => navigate(discoveryByStore ? '/mobile/stores' : '/categories')}
                    className="kmf-press"
                    aria-label={discoveryByStore ? 'All stores' : 'All categories'}
                    style={{
                      flex: 'none', width: 72, background: 'none', border: 'none', padding: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, cursor: 'pointer',
                    }}
                  >
                    <div style={{ width: 68, height: 68, borderRadius: 34, background: S, boxShadow: `0 0 0 1px ${MO}`, display: 'grid', placeItems: 'center' }}>
                      <Ico name="chevRight" size={22} color={TEAL} />
                    </div>
                    <span style={{ fontSize: 11.5, fontWeight: 600, color: MT }}>All</span>
                  </button>
                </>}
          </div>
        </section>
      )}

      {/* Featured picks — horizontal rail */}
      {showFeatured && (
        <section className="kmf-fade">
          <SectionHeader title="Featured picks" onAction={() => navigate('/products')} />
          <div className="kmf-rail">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} style={{ flex: 'none', width: 152 }}><FashionProductSkeleton /></div>)
              : featuredNoFood.slice(0, 10).map((p) => (
                  <div key={p.id} style={{ flex: 'none', width: 152 }}>
                    <FashionProductCard
                      product={p}
                      storeName={storeNameFor(p)}
                      isWishlisted={isWishlisted(p.id)}
                      onToggleWishlist={onToggleWishlist}
                      onClick={() => openProduct(p.id)}
                    />
                  </div>
                ))}
          </div>
        </section>
      )}

      {/* New arrivals — two-column grid */}
      {showNewArrivals && (
        <section className="kmf-fade">
          <SectionHeader title="New arrivals" onAction={() => navigate('/products?sort=newest')} />
          <div style={{ padding: '0 16px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '18px 12px' }}>
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <FashionProductSkeleton key={i} />)
              : newArrNoFood.slice(0, 6).map((p) => (
                  <FashionProductCard
                    key={p.id}
                    product={p}
                    storeName={storeNameFor(p)}
                    isWishlisted={isWishlisted(p.id)}
                    onToggleWishlist={onToggleWishlist}
                    onClick={() => openProduct(p.id)}
                  />
                ))}
          </div>
        </section>
      )}

      {/* Existing restaurants section — same visibility rule and card as MobileHome */}
      {showRestaurants && (
        <section>
          <SectionHeader title="Local Vendors & Restaurants" sub="Fresh food & drinks near you" onAction={() => navigate('/mobile/vendors')} />
          <div className="kmf-rail">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => <div key={i} style={{ width: 140, flexShrink: 0, aspectRatio: '5 / 5.6', borderRadius: 12, background: SHI }} />)
              : localVendorProducts.map((p) => (
                  <div key={p.id} style={{ width: 140, flexShrink: 0 }}>
                    <ClassicFoodCard
                      product={p}
                      isWishlisted={isWishlisted(p.id)}
                      onToggleWishlist={onToggleWishlist}
                      onClick={() => openProduct(p.id)}
                    />
                  </div>
                ))}
          </div>
        </section>
      )}

      {/* Browse all products */}
      {!loading && generalProducts.length > 0 && (
        <div style={{ padding: '26px 16px 0' }}>
          <button
            onClick={() => navigate('/products')}
            className="kmf-press"
            style={{
              width: '100%', height: 48, borderRadius: 14, background: S, border: `1.5px solid ${MO}`,
              color: MT, fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            Browse all products
            <Ico name="chevRight" size={16} color={TEAL} />
          </button>
        </div>
      )}

      {/* Empty state */}
      {!hasAnything && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '80px 32px', textAlign: 'center' }}>
          <div style={{ width: 80, height: 80, borderRadius: 16, background: S, display: 'grid', placeItems: 'center', marginBottom: 20 }}>
            <Ico name="bag" size={36} color={MM} />
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: MT }}>No products yet</div>
          <div style={{ fontSize: 14, color: MM, marginTop: 8, lineHeight: 1.6 }}>
            Products will appear here once stores go live.
          </div>
        </div>
      )}
    </div>
  );
}

export default MobileHomeFashion;
