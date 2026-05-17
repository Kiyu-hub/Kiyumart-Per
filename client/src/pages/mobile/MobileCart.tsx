import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { SwipeableRow } from "@/components/mobile/SwipeableRow";

const F = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';

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

interface CartItem {
  id: string;
  productId: string;
  productName: string;
  productImage: string;
  price: string;
  originalPrice?: string | null;
  quantity: number;
  selectedColor?: string | null;
  selectedSize?: string | null;
  availableStock?: number;
}

interface MobileCartProps {
  cartItems: CartItem[];
  isLoading: boolean;
  onQuantityChange: (itemId: string, delta: number) => void;
  onRemoveItem: (itemId: string) => void;
  subtotal: number;
  deliveryFee: number;
  total: number;
  onCheckout: () => void;
}

function CartRow({
  item, accent, isDark, onQty, onRemove,
}: {
  item: CartItem; accent: string; isDark: boolean;
  onQty: (id: string, d: number) => void;
  onRemove: (id: string) => void;
}) {
  const { trigger: haptic } = useHaptic();
  const bg    = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt   = isDark ? '#FFFFFF' : '#0D0D0D';
  const muted = isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.5)';
  const divider = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const stepBg = isDark ? '#2C2C2E' : '#F2F2F7';
  const imgBg  = isDark ? '#2C2C2E' : '#F5F5F7';

  const unitPrice = parseFloat(item.price) || 0;
  const lineTotal = unitPrice * item.quantity;
  const origUnit  = parseFloat(item.originalPrice || '') || 0;
  const hasDiscount = origUnit > 0 && origUnit > unitPrice;

  const TrashIcon = () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
    </svg>
  );

  return (
    <SwipeableRow
      rightAction={{
        label: 'Remove',
        icon: <TrashIcon />,
        color: 'destructive',
        onPress: () => { haptic('medium'); onRemove(item.id); },
      }}
    >
      <div style={{ background: bg, borderBottom: `1px solid ${divider}`, fontFamily: F }}>
        {/* Product row */}
        <div style={{ display: 'flex', gap: 14, padding: '14px 16px 10px' }}>
          {/* Thumbnail */}
          <div style={{
            width: 80, height: 80, borderRadius: 12, overflow: 'hidden',
            background: imgBg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {item.productImage ? (
              <img src={item.productImage} alt={item.productName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5}>
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
            )}
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{
              fontSize: 14, fontWeight: 700, color: txt, lineHeight: 1.35, marginBottom: 5,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const,
            }}>
              {item.productName}
            </p>
            {(item.selectedColor || item.selectedSize) && (
              <p style={{ fontSize: 12, color: muted, lineHeight: 1.3 }}>
                {[
                  item.selectedSize && `Size: ${item.selectedSize}`,
                  item.selectedColor && `Color: ${item.selectedColor}`,
                ].filter(Boolean).join('  ')}
              </p>
            )}
          </div>
        </div>

        {/* Price + Stepper row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 14px' }}>
          {/* Price block */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: txt }}>
              GHS {lineTotal.toFixed(2)}
            </span>
            {hasDiscount && item.quantity === 1 && (
              <span style={{ fontSize: 13, color: muted, textDecoration: 'line-through' }}>
                GHS {origUnit.toFixed(2)}
              </span>
            )}
            {hasDiscount && item.quantity > 1 && (
              <span style={{ fontSize: 12, color: muted }}>
                GHS {unitPrice.toFixed(2)} each
              </span>
            )}
            {!hasDiscount && item.quantity > 1 && (
              <span style={{ fontSize: 12, color: muted }}>
                GHS {unitPrice.toFixed(2)} each
              </span>
            )}
          </div>

          {/* Quantity stepper */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, background: stepBg, borderRadius: 22, padding: '3px 4px', height: 38 }}>
            <button
              onClick={() => { haptic('light'); onQty(item.id, -1); }}
              disabled={item.quantity <= 1}
              style={{
                width: 32, height: 32, borderRadius: 12,
                background: item.quantity <= 1 ? 'transparent' : (isDark ? '#3A3A3C' : '#E5E5EA'),
                border: 'none', cursor: item.quantity <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: item.quantity <= 1 ? 0.3 : 1,
                WebkitTapHighlightColor: 'transparent', transition: 'opacity 0.15s',
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round"><path d="M5 12h14"/></svg>
            </button>

            <span style={{ fontSize: 15, fontWeight: 700, color: txt, minWidth: 28, textAlign: 'center' as const }}>
              {item.quantity}
            </span>

            <button
              onClick={() => { haptic('light'); onQty(item.id, 1); }}
              disabled={item.availableStock !== undefined && item.quantity >= item.availableStock}
              style={{
                width: 32, height: 32, borderRadius: 12,
                background: accent,
                border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                opacity: (item.availableStock !== undefined && item.quantity >= item.availableStock) ? 0.35 : 1,
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </div>
      </div>
    </SwipeableRow>
  );
}

export function MobileCart({
  cartItems, isLoading, onQuantityChange, onRemoveItem,
  subtotal, deliveryFee, total, onCheckout,
}: MobileCartProps) {
  const [, navigate] = useLocation();
  const isDark = useTheme();
  const accent = '#009688';

  const bg     = isDark ? '#111111' : '#F2F2F7';
  const card   = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt    = isDark ? '#FFFFFF' : '#0D0D0D';
  const muted  = isDark ? 'rgba(235,235,245,0.4)' : 'rgba(60,60,67,0.45)';
  const border = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const skel   = isDark ? '#2C2C2E' : '#E5E5EA';

  const totalItems = cartItems.reduce((s, i) => s + i.quantity, 0);

  if (isLoading) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, fontFamily: F }}>
        {/* Skeleton header */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20, background: bg,
          padding: '12px 16px 12px',
          paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
          borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ width: 32, height: 32, borderRadius: 12, background: skel }} />
          <div style={{ flex: 1, height: 18, borderRadius: 6, background: skel, maxWidth: 80 }} />
        </div>
        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[1,2,3].map(i => (
            <div key={i} style={{ background: card, padding: '14px 16px', marginBottom: 1, display: 'flex', gap: 14, borderBottom: `1px solid ${border}` }}>
              <div style={{ width: 80, height: 80, borderRadius: 12, background: skel, flexShrink: 0 }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
                <div style={{ height: 14, borderRadius: 5, background: skel, width: '70%' }} />
                <div style={{ height: 11, borderRadius: 12, background: skel, width: '45%' }} />
                <div style={{ height: 20, borderRadius: 8, background: skel, width: '55%', marginTop: 4 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cartItems.length === 0) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', fontFamily: F }}>
        <div style={{
          position: 'sticky', top: 0, zIndex: 20, background: bg,
          padding: '12px 16px 12px',
          paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
          borderBottom: `1px solid ${border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <button
            onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}
            style={{ width: 36, height: 36, borderRadius: 11, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent', flexShrink: 0 }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          </button>
          <p style={{ fontSize: 17, fontWeight: 700, color: txt }}>Cart</p>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', textAlign: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: 12, border: `2px dashed ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
            <svg width={42} height={42} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5}><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
          </div>
          <p style={{ fontSize: 20, fontWeight: 800, color: txt, marginBottom: 8 }}>Your cart is empty</p>
          <p style={{ fontSize: 14, color: muted, lineHeight: 1.5, marginBottom: 28 }}>Add items to start your order</p>
          <button
            onClick={() => navigate('/')}
            style={{ background: accent, color: '#fff', border: 'none', borderRadius: 12, padding: '14px 36px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent' }}
          >
            Start Shopping
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', fontFamily: F }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: bg,
        borderBottom: `1px solid ${border}`,
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        <button
          onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/'); }}
          style={{
            width: 36, height: 36, borderRadius: 11,
            background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)',
            border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            WebkitTapHighlightColor: 'transparent', flexShrink: 0,
          }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 5l-7 7 7 7"/>
          </svg>
        </button>

        <div style={{ flex: 1, textAlign: 'center' as const }}>
          <span style={{ fontSize: 17, fontWeight: 700, color: txt }}>Cart</span>
          {totalItems > 0 && (
            <span style={{ marginLeft: 8, fontSize: 13, fontWeight: 600, color: muted }}>
              ({totalItems} item{totalItems !== 1 ? 's' : ''})
            </span>
          )}
        </div>

        {/* Spacer for centering (mirrors the back button) */}
        <div style={{ width: 36, height: 36, flexShrink: 0 }} />
      </div>

      {/* Items */}
      <div style={{ flex: 1, paddingBottom: 130 }}>
        <div style={{ background: card, border: `1px solid ${border}`, marginTop: 12, marginBottom: 12 }}>
          {cartItems.map(item => (
            <CartRow
              key={item.id}
              item={item}
              accent={accent}
              isDark={isDark}
              onQty={onQuantityChange}
              onRemove={onRemoveItem}
            />
          ))}
        </div>

        {/* Order summary card */}
        <div style={{ margin: '0 16px', background: card, borderRadius: 12, padding: '16px 18px', border: `1px solid ${border}` }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 14 }}>
            Order Summary
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: muted }}>Subtotal ({totalItems} item{totalItems !== 1 ? 's' : ''})</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: txt }}>GHS {subtotal.toFixed(2)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: muted }}>Delivery fee</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: deliveryFee > 0 ? txt : accent }}>
                {deliveryFee > 0 ? `GHS ${deliveryFee.toFixed(2)}` : 'Calculated at checkout'}
              </span>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${border}`, marginTop: 14, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: txt }}>Estimated total</span>
            <span style={{ fontSize: 22, fontWeight: 900, color: accent }}>GHS {total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Checkout bar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 30,
        background: isDark ? 'rgba(17,17,17,0.96)' : 'rgba(242,242,247,0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: `1px solid ${border}`,
        padding: '10px 16px',
        paddingBottom: 'max(14px, calc(10px + env(safe-area-inset-bottom)))',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        {/* Subtotal pill */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 11, fontWeight: 500, color: muted, marginBottom: 1 }}>Subtotal</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: txt }}>GHS {total.toFixed(2)}</span>
        </div>

        {/* Checkout button */}
        <button
          onClick={onCheckout}
          style={{
            flex: 1, height: 52, borderRadius: 12,
            background: accent, border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            fontFamily: F, WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Checkout</span>
          <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
