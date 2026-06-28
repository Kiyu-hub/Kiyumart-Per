/**
 * Mobile Home — APK (Tasly/KiyuMart Flutter app) design language
 * Urbanist font · flat black · white-bg product cards · flat 4-tab bar
 * Data & logic unchanged — visual style only.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { navigateToBannerLink } from "@/lib/bannerNavigation";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { fetchSameOriginJson } from "@/lib/queryClient";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { ShoppingCart, Sun, Moon, Store, Truck } from "lucide-react";
import type { Product } from "@shared/schema";
import { getCategoryIcon } from "@/lib/categoryIcons";
import {
  getFoodStoreIdSet,
  getFoodVendorStores,
  getLocalVendors,
  getRestaurants,
  splitProductsByFoodStores,
} from "@/lib/foodVendors";

// ── Design tokens ─────────────────────────────────────────────────────────────
const F       = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL    = '#009688';
const TEAL_LT = '#00BFA5';
const AMBER   = '#F59E0B';
const C_RED   = '#EF4444';

// CSS custom properties — actual values set on root div based on isDark state.
// Use these anywhere a color constant used to be referenced.
const S   = 'var(--ms)';   // surface
const SHI = 'var(--msh)';  // surface highlight / skeleton
const MM  = 'var(--mm)';   // muted text
const MO  = 'var(--mo)';   // outline / border
const MT  = 'var(--mt)';   // primary text
const MB  = 'var(--mb)';   // page background

// ── Prop types ────────────────────────────────────────────────────────────────
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

// ── Stroke SVG icons ─────────────────────────────────────────────────────────
function Ico({ name, size = 22, color = 'currentColor', stroke = 2, fill = 'none' }: {
  name: string; size?: number; color?: string; stroke?: number; fill?: string;
}) {
  const p: Record<string, React.ReactNode> = {
    home:      <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></>,
    search:    <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
    bag:       <><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></>,
    orders:    <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/></>,
    user:      <><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></>,
    bell:      <><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 18a2 2 0 0 0 4 0"/></>,
    heart:     <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>,
    tune:      <><path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14"/><circle cx="16" cy="6" r="2"/><circle cx="8" cy="12" r="2"/><circle cx="18" cy="18" r="2"/></>,
    flame:     <path d="M12 3s3 4 3 7a3 3 0 1 1-6 0c0-2 1-3 1-5 3 2 5 4 5 8a5 5 0 1 1-10 0c0-5 7-10 7-10z"/>,
    clock:     <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    location:  <><path d="M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></>,
    chevRight: <path d="m9 5 7 7-7 7"/>,
    qr:        <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM17 14h3M17 17v3M14 17v3"/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {p[name]}
    </svg>
  );
}

// ── Star rating row (APK style: ★ 4.5 | 88 sold) ─────────────────────────────
function RatingRow({ rating = 0, count }: { rating?: number; count?: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <svg width={12} height={12} viewBox="0 0 24 24" fill={AMBER} stroke="none">
        <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
      </svg>
      <span style={{ fontSize: 12, color: MM }}>{rating.toFixed(1)}</span>
      {count != null && count > 0 && (
        <>
          <span style={{ fontSize: 12, color: MM }}>|</span>
          <span style={{ fontSize: 12, color: MM }}>{count.toLocaleString()} reviews</span>
        </>
      )}
    </div>
  );
}

// ── Category card (4-col grid) ────────────────────────────────────────────────
const CAT_TINTS = ['#DC6B2F', '#16A34A', '#DC2626', '#2563EB', '#7C3AED', '#009688', '#F59E0B', '#EC4899'];
const CAT_EMOJI = ['🍛', '🥬', '💊', '📱', '🧼', '📶', '⚽', '💄'];

function CategoryCard({ cat, index, onClick }: { cat: any; index: number; onClick: () => void }) {
  const tint = cat?.tint || CAT_TINTS[index % CAT_TINTS.length];
  const fallbackEmoji = CAT_EMOJI[index % CAT_EMOJI.length];
  // Prefer the actual database image; fall back to illustration, then emoji
  const dbImage = cat?.image ?? null;
  const illustrationSrc = dbImage ? null : getCategoryIcon(cat?.name ?? '');
  const imgSrc = dbImage ?? illustrationSrc ?? null;
  const isIllustration = !dbImage && !!illustrationSrc;
  return (
    <button onClick={onClick} style={{
      background: S, borderRadius: 12, padding: '8px 6px 10px',
      textAlign: 'center', border: `1px solid ${MO}`,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      WebkitTapHighlightColor: 'transparent', cursor: 'pointer', width: '100%',
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 13,
        background: isIllustration ? tint + '18' : tint + '22',
        display: 'grid', placeItems: 'center', fontSize: 22,
        overflow: 'hidden', padding: isIllustration ? 6 : 0,
      }}>
        {imgSrc
          ? <img src={imgSrc} alt={cat?.name}
              style={{ width: '100%', height: '100%',
                objectFit: isIllustration ? 'contain' : 'cover',
                borderRadius: isIllustration ? 0 : 10 }} />
          : fallbackEmoji}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, marginTop: 6, color: MT, lineHeight: 1.2 }}>
        {cat?.name || '…'}
      </div>
      <div style={{ fontSize: 10, color: MM, marginTop: 1 }}>
        {(cat as any)?.productCount ?? (cat as any)?.count ?? ''}
      </div>
    </button>
  );
}

function CategorySkeleton() {
  return (
    <div style={{ background: S, borderRadius: 12, padding: '12px 6px', border: `1px solid ${MO}`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ width: 44, height: 44, borderRadius: 13, background: SHI }} />
      <div style={{ width: 44, height: 8, borderRadius: 12, background: SHI }} />
    </div>
  );
}

// ── Vendor card (horizontal scroll) ──────────────────────────────────────────
function VendorCard({ store, onClick }: { store: any; onClick: () => void }) {
  const tint   = store?.tint || '#009688';
  const rating = parseFloat(store?.averageRating ?? store?.ratings ?? '0');
  const orders = store?.totalOrders ?? store?.orderCount ?? null;
  const area   = store?.location ?? store?.address ?? '';
  return (
    <button onClick={onClick} style={{
      minWidth: 158, background: S, borderRadius: 12,
      padding: 12, border: `1px solid ${MO}`,
      textAlign: 'left', flexShrink: 0, cursor: 'pointer',
      WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: tint + '22', display: 'grid', placeItems: 'center', overflow: 'hidden',
        }}>
          {store?.logo
            ? <img src={store.logo} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <span style={{ fontSize: 18 }}>{(store?.name || 'S')[0]}</span>}
        </div>
        <div style={{ padding: '3px 8px', borderRadius: 6, background: TEAL + '22', color: TEAL, fontSize: 10, fontWeight: 700 }}>
          OPEN
        </div>
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 10, color: MT, lineHeight: 1.25 }}>
        {store?.name}
      </div>
      <div style={{ fontSize: 11, color: MM, marginTop: 3 }}>
        {area}{orders ? ` · ${typeof orders === 'number' ? orders.toLocaleString() : orders} orders` : ''}
      </div>
      <div style={{ marginTop: 6 }}>
        <RatingRow rating={rating} />
      </div>
    </button>
  );
}

function VendorSkeleton() {
  return (
    <div style={{ minWidth: 158, background: S, borderRadius: 12, padding: 12, border: `1px solid ${MO}`, flexShrink: 0 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: SHI }} />
        <div style={{ width: 36, height: 18, borderRadius: 6, background: SHI }} />
      </div>
      <div style={{ width: '80%', height: 10, borderRadius: 12, background: SHI }} />
      <div style={{ width: '60%', height: 8, borderRadius: 12, background: SHI, marginTop: 6 }} />
    </div>
  );
}

// ── Haversine distance (km) between two lat/lon pairs ────────────────────
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Local / Restaurant Store Card ──────────────────────────────────────────
function FoodStoreCard({
  store, userLat, userLon, onClick,
}: { store: any; userLat: number | null; userLon: number | null; onClick: () => void }) {
  const rating     = parseFloat(store?.averageRating ?? '0');
  const orders     = store?.totalOrders ?? null;
  const area       = store?.location ?? '';
  const logo       = store?.banner || store?.logo || null;
  const isVerified = (store as any)?.verificationStatus === 'approved';
  const ordersLabel = orders != null && orders > 0
    ? `${orders >= 1000 ? `${(orders / 1000).toFixed(1)}k` : orders} orders`
    : '';

  const storeLat = store?.latitude ? parseFloat(store.latitude) : null;
  const storeLon = store?.longitude ? parseFloat(store.longitude) : null;
  const distKm = (userLat !== null && userLon !== null && storeLat !== null && storeLon !== null)
    ? haversineKm(userLat, userLon, storeLat, storeLon)
    : null;
  const distLabel = distKm !== null
    ? (() => {
        const mins = Math.max(1, Math.round(distKm * 2));
        if (distKm < 0.1) return '< 100m · ~1 min';
        if (distKm < 1) return `${Math.round(distKm * 1000)}m · ~${mins} min`;
        return `${distKm.toFixed(1)} km · ~${mins} min`;
      })()
    : null;

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', aspectRatio: '1 / 1',
        background: S, borderRadius: 12,
        border: `1px solid ${MO}`, padding: 0, textAlign: 'left',
        cursor: 'pointer', overflow: 'hidden',
        WebkitTapHighlightColor: 'transparent',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Cover image — 60% of card height */}
      <div style={{
        flex: '0 0 60%', position: 'relative',
        background: SHI, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {logo
          ? <img src={logo} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span style={{ fontSize: 32, fontWeight: 700, color: TEAL }}>
              {(store.name || 'S')[0].toUpperCase()}
            </span>}
        {/* OPEN badge */}
        <div style={{
          position: 'absolute', top: 6, left: 6,
          background: TEAL, color: '#fff',
          fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 12, letterSpacing: 0.5,
        }}>
          OPEN
        </div>
        {/* Verified — blue text on solid dark-blue background */}
        {isVerified && (
          <div style={{
            position: 'absolute', top: 6, right: 6,
            background: '#1E3A5F', color: '#60A5FA',
            fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 12,
            letterSpacing: 0.3,
          }}>
            Verified
          </div>
        )}
      </div>

      {/* Info — fills remaining 40% with card background */}
      <div style={{ flex: 1, padding: '6px 8px 8px', background: S, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: MT, lineHeight: 1.2,
          overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
          marginBottom: 2,
        }}>
          {store.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <svg width={9} height={9} viewBox="0 0 24 24" fill={AMBER} stroke="none">
            <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
          </svg>
          <span style={{ fontSize: 10, fontWeight: 600, color: MT }}>
            {rating > 0 ? rating.toFixed(1) : 'New'}
          </span>
          {distLabel && (
            <span style={{ fontSize: 9, color: MM, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>· {distLabel}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function FoodStoreSkeleton() {
  return (
    <div style={{
      width: '100%', aspectRatio: '1 / 1', background: S, borderRadius: 12,
      border: `1px solid ${MO}`, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ flex: '0 0 60%', background: SHI }} />
      <div style={{ flex: 1, padding: '6px 8px 8px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ width: '70%', height: 9, borderRadius: 12, background: SHI, marginBottom: 5 }} />
        <div style={{ width: '45%', height: 8, borderRadius: 12, background: SHI }} />
      </div>
    </div>
  );
}

// ── Product card — full square, overlay info — dark/light aware ───────────────
function ProductCard({
  product, isWishlisted, onToggleWishlist, onClick,
}: {
  product: any; isWishlisted: boolean;
  onToggleWishlist: (id: string) => void; onClick: () => void;
}) {
  const images    = Array.isArray(product?.images) ? product.images : [product?.images];
  const price     = parseFloat(product?.price ?? '0');
  const costPrice = product?.costPrice ? parseFloat(product.costPrice) : null;
  const discField = parseFloat(product?.discount ?? '0');
  const computedDisc = costPrice && costPrice > price
    ? Math.round(((costPrice - price) / costPrice) * 100) : 0;
  const disc = discField > 0 ? Math.round(discField) : computedDisc;
  const was  = disc > 0
    ? (costPrice && costPrice > price ? costPrice : price / (1 - disc / 100))
    : null;
  const prep   = (product as any)?.prepTime ?? null;
  const rating = parseFloat((product as any)?.ratings ?? (product as any)?.averageRating ?? '0');
  const soldNum = Number((product as any)?.totalRatings ?? (product as any)?.reviewCount ?? 0);

  return (
    <div
      onClick={onClick}
      style={{
        borderRadius: 12, overflow: 'hidden', background: S,
        cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        border: `1px solid ${MO}`,
      }}
    >
      {/* Image section — 4:5 (shorter than square) */}
      <div style={{ position: 'relative', aspectRatio: '5 / 4', background: SHI }}>
        {images[0]
          ? <img src={images[0]} alt={product?.name} loading="lazy"
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
              <Ico name="bag" size={32} color={MM} />
            </div>}

        {/* Discount badge — top-left */}
        {disc > 0 && (
          <div style={{
            position: 'absolute', top: 7, left: 7,
            background: C_RED, color: '#fff',
            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 5,
            letterSpacing: 0.3,
          }}>
            {disc}% OFF
          </div>
        )}

        {/* Prep time badge */}
        {prep && (
          <div style={{
            position: 'absolute', top: disc > 0 ? 30 : 7, left: 7,
            display: 'flex', alignItems: 'center', gap: 3,
            background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '2px 6px', borderRadius: 5,
            fontSize: 9, fontWeight: 600, color: '#fff',
          }}>
            <Ico name="clock" size={9} color="#fff" /> {prep}
          </div>
        )}

        {/* Wishlist — top-right rounded square */}
        <button
          onClick={(e) => { e.stopPropagation(); product?.id && onToggleWishlist(product.id); }}
          style={{
            position: 'absolute', top: 7, right: 7,
            width: 28, height: 28, borderRadius: 8,
            background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: 'none', display: 'grid', placeItems: 'center',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={13} height={13} viewBox="0 0 24 24"
            fill={isWishlisted ? C_RED : 'none'}
            stroke={isWishlisted ? C_RED : 'rgba(255,255,255,0.9)'}
            strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z"/>
          </svg>
        </button>
      </div>

      {/* Info section */}
      <div style={{ padding: '5px 7px 7px' }}>
        <div style={{
          fontSize: 11, fontWeight: 600, color: MT, lineHeight: 1.3,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          marginBottom: 2,
        }}>
          {product?.name}
        </div>

        {/* Rating + sold */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 3 }}>
          <svg width={10} height={10} viewBox="0 0 24 24" fill={TEAL} stroke="none">
            <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z"/>
          </svg>
          <span style={{ fontSize: 10, color: MM }}>{rating.toFixed(1)}</span>
          {soldNum > 0 && <>
            <span style={{ fontSize: 10, color: MM }}>·</span>
            <span style={{ fontSize: 10, color: MM }}>{soldNum.toLocaleString()} sold</span>
          </>}
        </div>

        {/* Price row */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
          {was && (
            <span style={{ fontSize: 10, color: MM, textDecoration: 'line-through' }}>
              GH₵{was.toFixed(2)}
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 800, color: TEAL_LT, letterSpacing: -0.3 }}>
            GH₵{price.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ProductSkeleton() {
  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', background: S, border: `1px solid ${MO}` }}>
      <div style={{ aspectRatio: '5 / 4', background: SHI }} />
      <div style={{ padding: '7px 8px 9px' }}>
        <div style={{ height: 10, borderRadius: 12, background: SHI, marginBottom: 6, width: '80%' }} />
        <div style={{ height: 8, borderRadius: 12, background: SHI, marginBottom: 6, width: '50%' }} />
        <div style={{ height: 10, borderRadius: 12, background: SHI, width: '60%' }} />
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({
  title, sub, seeAll, onSeeAll,
}: { title: string; sub?: string; seeAll?: boolean; onSeeAll?: () => void }) {
  return (
    <div style={{
      padding: '18px 20px 10px',
      display: 'flex', alignItems: sub ? 'flex-start' : 'center',
      justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: 18, fontWeight: 700, color: MT, letterSpacing: -0.2 }}>
          {title}
        </div>
        {sub && <div style={{ fontSize: 12, color: MM, marginTop: 2 }}>{sub}</div>}
      </div>
      {seeAll && (
        <button onClick={onSeeAll} style={{
          fontSize: 13, color: TEAL, fontWeight: 600,
          background: 'none', border: 'none', cursor: 'pointer',
          WebkitTapHighlightColor: 'transparent', flexShrink: 0,
        }}>
          See All
        </button>
      )}
    </div>
  );
}

// ── Mobile banner slider — peek carousel ─────────────────────────────────────
function MobileBannerSlider() {
  const [, navigate] = useLocation();
  const [active, setActive] = useState(0);
  const [isDark, setIsDark] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const { data: platformSettings } = useQuery<{
    isMultiVendor: boolean; adsEnabled?: boolean;
    heroBannerEnabled?: boolean; heroBannerAdImage?: string | null; heroBannerAdUrl?: string | null;
    isExternalRiderSystemEnabled?: boolean;
  }>({ queryKey: ['/api/public/platform-settings'], staleTime: 60_000 });

  const storeMode = platformSettings?.isMultiVendor ? 'multivendor' : 'single';

  const { data: rawBanners = [] } = useQuery<any[]>({
    // Strict placement scope — mobile homepage hero never shows food vendor banners.
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
    const fromBanners = rawBanners.map((b: any) => ({
      id: b.id,
      image: b.image || null,
      title: b.title || '',
      subtitle: b.subtitle || null,
      ctaText: b.ctaText || null,
      ctaLink: b.ctaLink || null,
      bannerConfig: b.bannerConfig || null,
    }));

    // All promos included — renderMobileBanner suppresses overlay/thumbnail images automatically
    const fromPromos = (promos as any[]).map((p: any) => ({
        id: `promo-${p.id}`,
        image: p.image || null,
        title: p.title || '',
        subtitle: p.subtitle || null,
        ctaText: p.ctaText || null,
        ctaLink: p.ctaLink || null,
        bannerConfig: p.bannerConfig || null,
      }));

    const allSlides = [...fromBanners, ...fromPromos];

    if (
      platformSettings?.adsEnabled !== false &&
      platformSettings?.heroBannerEnabled &&
      platformSettings?.heroBannerAdImage
    ) {
      allSlides.unshift({
        id: 'hero-ad',
        image: platformSettings.heroBannerAdImage,
        title: '',
        subtitle: null,
        ctaText: null,
        ctaLink: platformSettings.heroBannerAdUrl || null,
        bannerConfig: null,
      });
    }
    return allSlides;
  }, [rawBanners, promos, platformSettings]);

  const goTo = (i: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    setActive(i);
    if (slides.length > 1) {
      timerRef.current = setInterval(() => setActive(a => (a + 1) % slides.length), 5000);
    }
  };

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

  const BANNER_H = 180;
  const BANNER_R = 10;
  const surfBg = isDark ? '#1A1A1C' : '#F0F0F5';

  // Full-fidelity mobile renderer — renders background, overlay image, text, CTA,
  // extra texts, and sponsored badge. Overlay is repositioned to fit the 180px height.
  const renderMobileBanner = (slide: any) => {
    if (!slide) return null;
    const cfg = slide.bannerConfig as any;

    // Background
    const bgImage: string | null = slide.image || (cfg?.background?.type === 'image' ? cfg.background.value : null);
    const solidBg: string = cfg?.background?.value || `linear-gradient(135deg, ${TEAL} 0%, #00897B 100%)`;

    // Text
    const titleText   = cfg?.title?.text    || slide.title    || '';
    const titleColor  = cfg?.title?.color   || '#ffffff';
    const titleSize   = cfg?.title?.size === '4xl' ? 20 : cfg?.title?.size === '3xl' ? 18 : cfg?.title?.size === '2xl' ? 16 : 15;
    const subText     = cfg?.subtitle?.text || slide.subtitle || '';
    const subColor    = cfg?.subtitle?.color || 'rgba(255,255,255,0.85)';
    const ctaBg       = cfg?.cta?.bgColor   || '#ffffff';
    const ctaColor    = cfg?.cta?.textColor || '#111111';
    const ctaLabel    = cfg?.cta?.text      || slide.ctaText  || '';
    const extraTexts: any[] = cfg?.extraTexts || [];
    const showSponsored: boolean = cfg?.showSponsored || false;

    // Overlay image
    const overlayUrl     = cfg?.overlay?.imageUrl   || null;
    const overlayOpacity = cfg?.overlay?.opacity != null ? cfg.overlay.opacity : 1;
    const overlayRotation = cfg?.overlay?.rotation  || 0;

    // Layout: "left" → text left + overlay right; "right" → overlay left + text right; "center" → centered text, overlay behind
    const layout = cfg?.layout || 'left';
    const textOnRight   = layout === 'right';
    const textCentered  = layout === 'center';
    const hasText = !!(titleText || subText || extraTexts.length > 0);
    const textWidth = overlayUrl && !textCentered ? '58%' : '100%';

    return (
      <div
        style={{
          width: '100%', height: '100%', position: 'relative',
          cursor: slide.ctaLink ? 'pointer' : 'default',
          overflow: 'hidden',
          background: bgImage ? undefined : solidBg,
        }}
        onClick={() => navigateToBannerLink(slide.ctaLink, navigate)}
      >
        {/* Background image */}
        {bgImage && (
          <img src={bgImage} alt={titleText || 'Banner'}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        )}

        {/* Overlay product/brand image — right half (or left if layout=right) */}
        {overlayUrl && (
          <div style={{
            position: 'absolute',
            [textOnRight ? 'left' : 'right']: 0,
            top: 0, bottom: 0,
            width: textCentered ? '100%' : '46%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 2,
          }}>
            <img src={overlayUrl} alt=""
              style={{
                maxHeight: '92%', maxWidth: '92%',
                objectFit: 'contain',
                opacity: overlayOpacity,
                transform: overlayRotation ? `rotate(${overlayRotation}deg)` : undefined,
                filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.3))',
              }} />
          </div>
        )}

        {/* Text + CTA column */}
        {hasText && (
          <div style={{
            position: 'absolute',
            [textCentered ? 'left' : textOnRight ? 'right' : 'left']: 0,
            top: 0, bottom: 0,
            width: textCentered ? '100%' : textWidth,
            background: textCentered
              ? 'rgba(0,0,0,0.35)'
              : textOnRight
                ? 'linear-gradient(to left, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 75%, transparent 100%)'
                : 'linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.2) 75%, transparent 100%)',
            display: 'flex', flexDirection: 'column',
            justifyContent: 'center',
            alignItems: textCentered ? 'center' : 'flex-start',
            padding: textCentered ? '0 16px' : textOnRight ? '0 20px 0 8px' : '0 8px 0 18px',
            zIndex: 3,
          }}>
            {showSponsored && (
              <div style={{
                fontSize: 9, fontWeight: 700, letterSpacing: 0.8,
                color: 'rgba(255,255,255,0.7)', marginBottom: 4,
                textTransform: 'uppercase' as const,
              }}>
                Sponsored
              </div>
            )}
            {titleText && (
              <div style={{
                fontSize: titleSize, fontWeight: 700, color: titleColor,
                lineHeight: 1.2, textShadow: '0 1px 6px rgba(0,0,0,0.4)',
                maxWidth: '100%',
                textAlign: textCentered ? 'center' : 'left',
              }}>
                {titleText}
              </div>
            )}
            {subText && (
              <div style={{
                fontSize: 11, color: subColor, marginTop: 3, lineHeight: 1.4,
                textAlign: textCentered ? 'center' : 'left',
              }}>
                {subText}
              </div>
            )}
            {extraTexts.map((et: any) => (
              <div key={et.id} style={{
                fontSize: Math.min(et.fontSize ?? 13, 13), color: et.color || '#ffffff',
                fontWeight: et.fontWeight === 'bold' ? 700 : 400,
                marginTop: 2, lineHeight: 1.3,
                textAlign: textCentered ? 'center' : 'left',
              }}>
                {et.text}
              </div>
            ))}
            {slide.ctaLink && ctaLabel && (
              <button
                onClick={(e) => { e.stopPropagation(); navigateToBannerLink(slide.ctaLink, navigate); }}
                style={{
                  marginTop: 8, alignSelf: textCentered ? 'center' : 'flex-start',
                  background: ctaBg, color: ctaColor,
                  border: 'none', borderRadius: 12,
                  padding: '6px 14px', fontSize: 11, fontWeight: 700,
                  cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
                }}
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
    return <div style={{ height: BANNER_H, margin: '14px 16px 4px', borderRadius: BANNER_R, background: surfBg }} />;
  }
  if (slides.length === 0) {
    return (
      <div style={{
        height: BANNER_H, margin: '14px 16px 4px', borderRadius: BANNER_R,
        background: surfBg, border: `1px solid ${isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.09)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ fontSize: 13, color: 'rgba(235,235,245,0.5)' }}>No banners available</div>
      </div>
    );
  }

  return (
    <div style={{ margin: '14px 16px 4px', position: 'relative' }}>
      {/* Full-width slide */}
      <div
        style={{ height: BANNER_H, borderRadius: BANNER_R, overflow: 'hidden', position: 'relative', background: surfBg }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {renderMobileBanner(slides[active])}
      </div>

      {/* Slide counter pill — top right corner, unobtrusive */}
      {slides.length > 1 && (
        <div style={{
          position: 'absolute', top: 10, right: 10, zIndex: 10,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
          borderRadius: 12, padding: '2px 8px',
          fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.85)',
          letterSpacing: 0.3, pointerEvents: 'none',
        }}>
          {active + 1}/{slides.length}
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Main component
// ═════════════════════════════════════════════════════════════════════════════
export function MobileHome({
  featuredProducts = [], newArrivalProducts = [], allProducts = [],
  categories = [], stores = [], wishlist = [], isLoading, onToggleWishlist,
}: MobileHomeProps) {
  const { user }     = useAuth();
  const [, navigate] = useLocation();
  const { isMultiVendor: mvFromPublic, isExternalRiderSystemEnabled } = usePlatformSettings();
  // Fetch full platform settings for shopDisplayMode (not in usePlatformSettings hook)
  const { data: fullSettings } = useQuery<any>({
    queryKey: ['/api/public/platform-settings'],
    staleTime: 60_000,
  });
  const isMultiVendor: boolean         = (fullSettings as any)?.isMultiVendor === true || mvFromPublic;
  const shopDisplayMode: string        = (fullSettings as any)?.shopDisplayMode ?? 'by-store';
  const showShopBySection: boolean     = (fullSettings as any)?.showShopBySection !== false;
  const showFeaturedSection: boolean   = (fullSettings as any)?.showHomepageFeaturedSection !== false;
  const showNewArrivalsSection: boolean = (fullSettings as any)?.showHomepageNewArrivalSection !== false;

  // Single-vendor mode: always browse by category (only 1 primary store — store grid is redundant).
  // Multi-vendor mode: respect admin's shopDisplayMode setting.
  const effectiveDisplayMode: string = !isMultiVendor ? 'by-category' : shopDisplayMode;

  // Normalise props — guard against non-array values from parent
  const safeStores      = Array.isArray(stores)            ? stores            : [];
  const safeCats        = Array.isArray(categories)         ? categories         : [];
  const safeWishlist    = Array.isArray(wishlist)           ? wishlist           : [];
  const safeFeatured    = Array.isArray(featuredProducts)   ? featuredProducts   : [];
  const safeNewArr      = Array.isArray(newArrivalProducts) ? newArrivalProducts : [];
  const safeAllProducts = Array.isArray(allProducts)        ? allProducts        : [];
  const effectiveLoading = isLoading;

  // Separate food-vendor stores from generic stores (shared utility — same logic as desktop)
  const localVendors = useMemo(() => getLocalVendors(safeStores), [safeStores]);
  const restaurants  = useMemo(() => getRestaurants(safeStores),  [safeStores]);

  // Food store id set — uses the BROAD isFoodVendorStore check so any store
  // with storeType=food_beverages OR merchantCategory=QUICK_EATS is excluded
  // from the regular "Shop by Store" grid, not just the strict businessType
  // matches. Must be computed BEFORE visibleStores uses it.
  const foodStoreIds = useMemo(() => getFoodStoreIdSet(safeStores), [safeStores]);

  // Split product feeds: food-vendor products go in their own section only;
  // featured / new-arrivals / all-products must never include them.
  const { foodVendorProducts: localVendorProducts, regularProducts: generalProducts } = useMemo(
    () => splitProductsByFoodStores(safeAllProducts, safeStores),
    [safeAllProducts, safeStores],
  );
  const featuredNoFood = useMemo(
    () => safeFeatured.filter((p) => !foodStoreIds.has(String((p as any)?.storeId || ""))),
    [safeFeatured, foodStoreIds],
  );
  const newArrNoFood = useMemo(
    () => safeNewArr.filter((p) => !foodStoreIds.has(String((p as any)?.storeId || ""))),
    [safeNewArr, foodStoreIds],
  );

  // Pre-filter lists once — used for both rendering and empty-state logic.
  // "Shop by Store" must exclude food vendors & restaurants — they live in
  // their own dedicated section. Same rule on desktop and mobile.
  const visibleStores = safeStores.filter((s: any) =>
    s && (s.banner || s.logo) && !foodStoreIds.has(String(s.id || "")),
  );
  // Drop food-scoped categories — they live on the dedicated Restaurants &
  // Local Vendors page, not in the generic Shop by Category section.
  const visibleCats   = safeCats.filter((c: any) => {
    const types = Array.isArray(c?.storeTypes) ? c.storeTypes : [];
    return !types.some((t: string) => t === "food_beverages" || t === "restaurant");
  });

  // Ref kept for the horizontal scroll container — the previous auto-scroll
  // animation relied on a doubled product list which caused duplicate cards
  // to appear. Users can scroll manually; that's the expected UX.
  const vendorScrollRef = useRef<HTMLDivElement>(null);

  // User GPS coords (from localStorage) — used for distance calculation
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('kiyumart_user_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.latitude && parsed?.longitude) {
          setUserLat(parsed.latitude);
          setUserLon(parsed.longitude);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // Shop section has renderable content
  const shopHasContent = showShopBySection && (
    effectiveLoading ||
    (effectiveDisplayMode === 'by-store' ? visibleStores.length > 0 : visibleCats.length > 0)
  );

  const BADGE_COLOR = TEAL;

  // Theme toggle — same mechanism as ThemeToggle.tsx used on desktop
  const [isDark, setIsDark] = useState(true); // default dark; effect syncs from storage
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

  // Unread notification count
  const { data: unreadCount = 0 } = useQuery<number>({
    queryKey: ['/api/notifications/unread-count', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (!res.ok) return 0;
      return res.json();
    },
    enabled: !!user,
  });

  // Cart count for header badge
  const { data: cartData } = useQuery<any>({
    queryKey: ['/api/cart'],
    queryFn: () => fetchSameOriginJson('/api/cart'),
    enabled: !!user,
  });
  const headerCartBadge = Array.isArray(cartData)
    ? cartData.reduce((s: number, i: any) => s + (i.quantity || 1), 0)
    : 0;

  // ── Location: read saved, reverse-geocode coords, or prompt ──────────────
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  const [locLoading, setLocLoading]       = useState(false);
  const geocodeRef = useRef(false);

  async function reverseGeocode(lat: number, lon: number) {
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
      const data = await res.json();
      const city = data?.address?.city || data?.address?.town || data?.address?.village || data?.address?.county || 'Near you';
      setLocationLabel(city);
      const prev = JSON.parse(localStorage.getItem('kiyumart_user_location') || '{}');
      localStorage.setItem('kiyumart_user_location', JSON.stringify({ ...prev, city }));
    } catch {
      setLocationLabel('Near you');
    }
  }

  function requestLocation() {
    if (!navigator.geolocation) { setLocationLabel('Accra, Ghana'); return; }
    setLocLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        localStorage.setItem('kiyumart_user_location', JSON.stringify({ latitude, longitude }));
        await reverseGeocode(latitude, longitude);
        setLocLoading(false);
      },
      () => { setLocationLabel('Accra, Ghana'); setLocLoading(false); },
      { enableHighAccuracy: false, timeout: 6000 },
    );
  }

  useEffect(() => {
    if (geocodeRef.current) return;
    geocodeRef.current = true;
    try {
      const saved = localStorage.getItem('kiyumart_user_location');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.city) {
          setLocationLabel(parsed.city);
        } else if (parsed?.latitude && parsed?.longitude) {
          reverseGeocode(parsed.latitude, parsed.longitude);
        }
      }
    } catch { /* ignore */ }
  }, []);

  const firstName   = user?.name?.split(' ')[0] ?? null;
  const displayName = firstName ?? (user?.name) ?? null;

  // Derive CSS variable values from isDark state
  const vars = isDark
    ? { '--mb': '#000000', '--ms': '#1A1A1C', '--msh': '#2C2C2E', '--mm': 'rgba(235,235,245,0.5)', '--mo': 'rgba(255,255,255,0.09)', '--mt': '#FFFFFF' }
    : { '--mb': '#F5F5F7', '--ms': '#FFFFFF',  '--msh': '#E8E8ED',  '--mm': 'rgba(60,60,67,0.55)',  '--mo': 'rgba(0,0,0,0.09)',         '--mt': '#111111' };

  return (
    <div style={{ ...vars, background: vars['--mb'], color: vars['--mt'], minHeight: '100dvh', fontFamily: F, paddingBottom: 80 } as React.CSSProperties}>

      {/* Status bar spacer */}
      <div style={{ height: 12 }} />

      {/* Become Seller/Rider + theme toggle row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {(!user || (user.role !== 'seller' && user.role !== 'super_admin' && user.role !== 'admin')) && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => navigate('/become-seller')}>
              <Store className="h-2.5 w-2.5" />
              Become a Seller
            </Button>
          )}
          {!isExternalRiderSystemEnabled && (!user || (user.role !== 'rider' && user.role !== 'seller' && user.role !== 'super_admin' && user.role !== 'admin')) && (
            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 gap-1" onClick={() => navigate('/become-rider')}>
              <Truck className="h-2.5 w-2.5" />
              Become a Rider
            </Button>
          )}
        </div>
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          style={{
            width: 36, height: 36, background: 'none', border: 'none',
            display: 'grid', placeItems: 'center',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}
        >
          {isDark
            ? <Sun size={19} color={vars['--mt']} strokeWidth={1.8} />
            : <Moon size={19} color={vars['--mt']} strokeWidth={1.8} />}
        </button>
      </div>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 16px 14px',
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', gap: 12,
      }}>
        {/* Avatar + greeting */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
          <button
            onClick={() => navigate(user ? '/profile' : '/auth')}
            style={{ flexShrink: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            {user ? (
              <div style={{ width: 46, height: 46, borderRadius: 23, overflow: 'hidden', flexShrink: 0 }}>
                <UserAvatar
                  name={user.name}
                  profileImage={(user as any).profileImage}
                  size="lg"
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div style={{
                width: 46, height: 46, borderRadius: 23,
                background: S, border: `1px solid ${MO}`,
                display: 'grid', placeItems: 'center',
              }}>
                <Ico name="user" size={22} color={MM} />
              </div>
            )}
          </button>

          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: MT, lineHeight: 1.2 }}>
              Hi 👋
            </div>
            <div style={{ fontSize: 13, color: MM, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayName ?? (
                <button onClick={() => navigate('/auth')} style={{ fontSize: 13, color: TEAL, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                  Sign in
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right icons: bell + cart */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
          <button
            onClick={() => navigate('/notifications')}
            style={{
              width: 40, height: 40, background: 'transparent', border: 'none',
              display: 'grid', placeItems: 'center', position: 'relative',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Ico name="bell" size={22} color={MT} stroke={1.8} />
            {unreadCount > 0 && (
              <div style={{
                position: 'absolute', top: 6, right: 5,
                minWidth: 16, height: 16, borderRadius: 8,
                background: BADGE_COLOR, fontSize: 10, fontWeight: 700,
                color: '#fff', display: 'grid', placeItems: 'center',
                padding: '0 4px', border: `1.5px solid ${vars['--mb']}`,
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </div>
            )}
          </button>
          <button
            onClick={() => navigate('/cart')}
            style={{
              width: 40, height: 40, background: 'transparent', border: 'none',
              display: 'grid', placeItems: 'center', position: 'relative',
              cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          >
            <ShoppingCart size={22} color={MT} strokeWidth={1.8} />
            {headerCartBadge > 0 && (
              <div style={{
                position: 'absolute', top: 6, right: 5,
                minWidth: 16, height: 16, borderRadius: 8,
                background: BADGE_COLOR, fontSize: 10, fontWeight: 700,
                color: '#fff', display: 'grid', placeItems: 'center',
                padding: '0 4px', border: `1.5px solid ${vars['--mb']}`,
              }}>
                {headerCartBadge > 99 ? '99+' : headerCartBadge}
              </div>
            )}
          </button>
        </div>
      </div>

      {/* ── Location pill ───────────────────────────────────────── */}
      <div style={{ padding: '0 20px 10px', display: 'flex', alignItems: 'center', gap: 5 }}>
        <Ico name="location" size={13} color={TEAL} />
        {locationLabel ? (
          <span style={{ fontSize: 12, color: MM, fontWeight: 500 }}>{locationLabel}</span>
        ) : (
          <button
            onClick={requestLocation}
            style={{ fontSize: 12, color: TEAL, fontWeight: 600, background: 'none', border: 'none', padding: 0, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            {locLoading ? 'Getting location…' : '+ Add your location'}
          </button>
        )}
      </div>

      {/* ── Search bar ──────────────────────────────────────────── */}
      <div style={{ padding: '0 20px' }}>
        <button
          onClick={() => navigate('/search?mobile=1')}
          style={{
            width: '100%', height: 48,
            background: S, borderRadius: 12,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '0 14px', border: `1px solid ${MO}`,
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent', boxSizing: 'border-box',
          }}
        >
          <Ico name="search" size={17} color={MM} />
          <span style={{ fontSize: 15, color: MM, flex: 1, textAlign: 'left', fontFamily: F }}>
            Search
          </span>
          <Ico name="tune" size={17} color={MM} />
        </button>
      </div>

      {/* ── Banner ──────────────────────────────────────────────── */}
      <MobileBannerSlider />

      {/* ── Browse section: by-store (multi-vendor only) OR by-category ── */}
      {shopHasContent && (
        effectiveDisplayMode === 'by-store' ? (
          <div style={{ margin: '6px 16px 0' }}>
            <div style={{ padding: '14px 0 12px' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: MT }}>Shop by Store</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {effectiveLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: SHI }} />
                      <div style={{ width: '70%', height: 8, borderRadius: 12, background: SHI }} />
                    </div>
                  ))
                : visibleStores.slice(0, 4).map((store: any) => (
                    <button
                      key={store.id}
                      onClick={() => navigate(`/sellers/${store.id}`)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent', padding: 0,
                      }}
                    >
                      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', background: SHI, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <img src={store.banner || store.logo} alt={store.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: MT, textAlign: 'center', lineHeight: 1.2, width: '100%',
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      } as React.CSSProperties}>
                        {store.name}
                      </span>
                    </button>
                  ))}
            </div>
            <button
              onClick={() => navigate('/mobile/stores')}
              style={{
                marginTop: 12, width: '100%', height: 42, borderRadius: 12,
                background: 'transparent', border: `1.5px solid ${MO}`,
                color: MT, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              See all stores
            </button>
          </div>
        ) : (
          <div style={{ margin: '6px 16px 0' }}>
            <div style={{ padding: '14px 0 12px' }}>
              <span style={{ fontSize: 17, fontWeight: 700, color: MT }}>Shop by Category</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {effectiveLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 12, background: SHI }} />
                      <div style={{ width: '70%', height: 8, borderRadius: 12, background: SHI }} />
                    </div>
                  ))
                : visibleCats.slice(0, 4).map((cat: any, i) => (
                    <button
                      key={cat.id}
                      onClick={() => navigate(`/products?category=${cat.id}`)}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                        background: 'none', border: 'none', cursor: 'pointer',
                        WebkitTapHighlightColor: 'transparent', padding: 0,
                      }}
                    >
                      <div style={{ width: '100%', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', background: SHI }}>
                        {cat.image
                          ? <img src={cat.image} alt={cat.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          : <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 22 }}>
                              {['🍛','🥬','💊','📱','🧼','⚽','💄','📶'][i % 8]}
                            </div>}
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: MT, textAlign: 'center', lineHeight: 1.2, width: '100%',
                        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      } as React.CSSProperties}>
                        {cat.name}
                      </span>
                      {cat.productCount != null && cat.productCount > 0 && (
                        <span style={{ fontSize: 9, color: MM, fontWeight: 500 }}>
                          {cat.productCount} items
                        </span>
                      )}
                    </button>
                  ))}
            </div>
            <button
              onClick={() => navigate('/categories')}
              style={{
                marginTop: 12, width: '100%', height: 42, borderRadius: 12,
                background: 'transparent', border: `1.5px solid ${MO}`,
                color: MT, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
              }}
            >
              See all category
            </button>
          </div>
        )
      )}

      {/* ── Local Vendors & Restaurants ──────────────────────────── */}
      {(effectiveLoading || localVendorProducts.length > 0) && (
        <>
          <SectionHeader
            title="Local Vendors & Restaurants"
            sub="Fresh food & drinks near you"
            seeAll
            onSeeAll={() => navigate('/mobile/vendors')}
          />
          <div
            ref={vendorScrollRef}
            style={{
              display: 'flex', gap: 12,
              overflowX: 'auto', paddingLeft: 20, paddingRight: 8, paddingBottom: 4,
              msOverflowStyle: 'none', scrollbarWidth: 'none',
              WebkitOverflowScrolling: 'touch',
            } as React.CSSProperties}
          >
            {effectiveLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} style={{ width: 140, flexShrink: 0 }}><ProductSkeleton /></div>
                ))
              : localVendorProducts.map((p) => (
                  <div key={p.id} style={{ width: 140, flexShrink: 0 }}>
                    <ProductCard
                      product={p}
                      isWishlisted={safeWishlist.some(w => w.productId === p.id)}
                      onToggleWishlist={onToggleWishlist}
                      onClick={() => navigate(`/product/${p.id}`)}
                    />
                  </div>
                ))}
          </div>
        </>
      )}

      {/* ── Featured Products (excludes food vendors) ───────────── */}
      {showFeaturedSection && (effectiveLoading || featuredNoFood.length > 0) && (
        <>
          <SectionHeader
            title="Featured Products"
            seeAll
            onSeeAll={() => navigate('/products')}
          />
          <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {effectiveLoading
              ? Array.from({ length: 4 }).map((_, i) => <ProductSkeleton key={i} />)
              : featuredNoFood.slice(0, 6).map((p) => (
                  <ProductCard
                    key={p.id} product={p}
                    isWishlisted={safeWishlist.some((w) => w.productId === p.id)}
                    onToggleWishlist={onToggleWishlist}
                    onClick={() => navigate(`/product/${p.id}`)}
                  />
                ))}
          </div>
        </>
      )}

      {/* ── New Arrivals (excludes food vendors) ─────────────────── */}
      {showNewArrivalsSection && (effectiveLoading || newArrNoFood.length > 0) && (
        <>
          <SectionHeader
            title="New Arrivals"
            seeAll
            onSeeAll={() => navigate('/products?sort=newest')}
          />
          <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {effectiveLoading
              ? Array.from({ length: 4 }).map((_, i) => <ProductSkeleton key={i} />)
              : newArrNoFood.slice(0, 6).map((p) => (
                  <ProductCard
                    key={p.id} product={p}
                    isWishlisted={safeWishlist.some((w) => w.productId === p.id)}
                    onToggleWishlist={onToggleWishlist}
                    onClick={() => navigate(`/product/${p.id}`)}
                  />
                ))}
          </div>
        </>
      )}

      {/* ── All Products (general — food store products are in their own section) ── */}
      {(effectiveLoading || generalProducts.length > 0) && (
        <>
          <SectionHeader
            title="All Products"
            seeAll
            onSeeAll={() => navigate('/products')}
          />
          <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {effectiveLoading
              ? Array.from({ length: 4 }).map((_, i) => <ProductSkeleton key={i} />)
              : generalProducts.map((p) => (
                  <ProductCard
                    key={p.id} product={p}
                    isWishlisted={safeWishlist.some((w) => w.productId === p.id)}
                    onToggleWishlist={onToggleWishlist}
                    onClick={() => navigate(`/product/${p.id}`)}
                  />
                ))}
          </div>
        </>
      )}

      {/* Empty state — only when no section has anything to show */}
      {!effectiveLoading && !shopHasContent && featuredNoFood.length === 0 && newArrNoFood.length === 0 && generalProducts.length === 0 && localVendorProducts.length === 0 && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '80px 32px', textAlign: 'center',
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 12,
            background: S, display: 'grid', placeItems: 'center', marginBottom: 20,
          }}>
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
