/**
 * The one product card used on the phone homepage AND the All Products page,
 * so products always look the same: 3:4 photo, % OFF badge, round heart,
 * store name, price with crossed-out "was" price, real ratings only.
 *
 * Colours come from CSS variables; wrap the list in an element that sets them
 * (use fashionCardVars) and include FASHION_CARD_CSS once.
 */
import type React from "react";

const TEAL  = '#009688';
const AMBER = '#F59E0B';
const C_RED = '#EF4444';
const SHI = 'var(--msh)';
const MM  = 'var(--mm)';
const MT  = 'var(--mt)';

export const fashionCardVars = (isDark: boolean): Record<string, string> => isDark
  ? { '--mb': '#000000', '--ms': '#1A1A1C', '--msh': '#2C2C2E', '--mm': 'rgba(235,235,245,0.5)', '--mo': 'rgba(255,255,255,0.09)', '--mt': '#FFFFFF' }
  : { '--mb': '#F5F5F7', '--ms': '#FFFFFF',  '--msh': '#E8E8ED',  '--mm': 'rgba(60,60,67,0.55)',  '--mo': 'rgba(0,0,0,0.09)',         '--mt': '#111111' };

export const FASHION_CARD_CSS = `
.kmf-press{transition:transform .15s ease, opacity .15s ease}
.kmf-press:active{transform:scale(.97);opacity:.92}
.kmf-card:focus-visible,.kmf-press:focus-visible{outline:2px solid ${TEAL};outline-offset:2px;border-radius:14px}
@media (prefers-reduced-motion: reduce){.kmf-press{transition:none}}
`;

// ── Price / discount helper (same rules as MobileHome ProductCard) ────────────
export function priceInfo(product: any) {
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
export function FashionProductCard({
  product, storeName, isWishlisted, onToggleWishlist, onClick, tag,
}: {
  product: any; storeName?: string | null; isWishlisted: boolean;
  onToggleWishlist: (id: string) => void; onClick: () => void;
  /** "new": teal NEW tag instead of the discount badge (just-arrived items). */
  tag?: 'new';
}) {
  const images = Array.isArray(product?.images) ? product.images : [product?.images];
  const { price, disc, was } = priceInfo(product);
  const rating      = parseFloat((product as any)?.ratings ?? (product as any)?.averageRating ?? '0');
  const ratingCount = Number((product as any)?.totalRatings ?? (product as any)?.reviewCount ?? 0);
  const hasRating   = rating > 0 && ratingCount > 0;
  // Only a known stock of 0 counts as sold out (missing stock data is not).
  const soldOut = product?.stock !== undefined && product?.stock !== null && Number(product.stock) <= 0;

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
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={MM} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
            </div>}

        {soldOut && (
          <>
            <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.45)' }} />
            <div style={{
              position: 'absolute', left: 8, bottom: 8, background: '#111111', color: '#fff',
              fontSize: 10.5, fontWeight: 700, padding: '4px 8px', borderRadius: 6,
            }}>
              Sold out
            </div>
          </>
        )}

        {tag === 'new' && !soldOut && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: TEAL, color: '#fff',
            fontSize: 10, fontWeight: 800, padding: '3px 7px', borderRadius: 6, letterSpacing: 0.4,
          }}>
            NEW
          </div>
        )}

        {disc > 0 && !soldOut && tag !== 'new' && (
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

export function FashionProductSkeleton() {
  return (
    <div>
      <div style={{ aspectRatio: '3 / 4', borderRadius: 14, background: SHI }} />
      <div style={{ height: 9, borderRadius: 6, background: SHI, margin: '10px 0 6px', width: '45%' }} />
      <div style={{ height: 11, borderRadius: 6, background: SHI, marginBottom: 6, width: '85%' }} />
      <div style={{ height: 11, borderRadius: 6, background: SHI, width: '40%' }} />
    </div>
  );
}

