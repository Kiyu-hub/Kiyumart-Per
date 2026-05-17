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

interface OrderItem {
  productId: string; productName: string; quantity: number; price: string;
  image?: string | null; selectedColor?: string | null; selectedSize?: string | null;
}
interface Order {
  id: string; orderNumber?: string; status: string; paymentStatus: string;
  totalAmount: string; createdAt: string; items: OrderItem[];
  externalDeliveryType?: string | null;
}
type FilterTab = 'all' | 'active' | 'completed' | 'cancelled';

interface MobileOrdersProps {
  orders: Order[];
  isLoading: boolean;
  onDeleteOrder: (id: string) => void;
}

function statusBadge(status: string): { bg: string; dot: string; text: string } {
  const map: Record<string, { bg: string; dot: string; text: string }> = {
    pending:                    { bg: 'rgba(245,158,11,0.15)', dot: '#F59E0B', text: '#F59E0B' },
    created:                    { bg: 'rgba(245,158,11,0.15)', dot: '#F59E0B', text: '#F59E0B' },
    processing:                 { bg: 'rgba(59,130,246,0.15)', dot: '#3B82F6', text: '#3B82F6' },
    packaged:                   { bg: 'rgba(59,130,246,0.15)', dot: '#3B82F6', text: '#3B82F6' },
    ready:                      { bg: 'rgba(59,130,246,0.15)', dot: '#3B82F6', text: '#3B82F6' },
    searching_rider:            { bg: 'rgba(139,92,246,0.15)', dot: '#8B5CF6', text: '#8B5CF6' },
    assigned:                   { bg: 'rgba(139,92,246,0.15)', dot: '#8B5CF6', text: '#8B5CF6' },
    rider_arrived:              { bg: 'rgba(139,92,246,0.15)', dot: '#8B5CF6', text: '#8B5CF6' },
    picked_up:                  { bg: 'rgba(139,92,246,0.15)', dot: '#8B5CF6', text: '#8B5CF6' },
    in_transit:                 { bg: 'rgba(139,92,246,0.15)', dot: '#8B5CF6', text: '#8B5CF6' },
    en_route:                   { bg: 'rgba(139,92,246,0.15)', dot: '#8B5CF6', text: '#8B5CF6' },
    delivered:                  { bg: 'rgba(0,150,136,0.15)',  dot: '#009688', text: '#009688' },
    completed:                  { bg: 'rgba(0,150,136,0.15)',  dot: '#009688', text: '#009688' },
    cancelled:                  { bg: 'rgba(239,68,68,0.15)',  dot: '#EF4444', text: '#EF4444' },
    external_dispatch_arranged: { bg: 'rgba(6,182,212,0.15)', dot: '#06B6D4', text: '#06B6D4' },
  };
  return map[status] || { bg: 'rgba(255,255,255,0.08)', dot: '#888', text: '#888' };
}

function statusLabel(status: string, extType?: string | null): string {
  const labels: Record<string, string> = {
    pending: 'Pending', created: 'Pending', processing: 'Processing',
    packaged: 'Packaged', ready: 'Ready', searching_rider: 'Finding Rider',
    assigned: 'Rider Assigned', rider_arrived: 'Rider Arrived', picked_up: 'Picked Up',
    in_transit: 'In Transit', en_route: 'En Route',
    delivered: 'Delivered', completed: 'Completed', cancelled: 'Cancelled',
    external_dispatch_arranged: extType === 'VIP Bus' ? 'VIP Bus' : '3rd-Party Delivery',
  };
  return labels[status] || status;
}

function isActive(status: string): boolean {
  return !['delivered', 'completed', 'cancelled'].includes(status);
}

function OrderCard({ order, accent, isDark, onDelete }: {
  order: Order; accent: string; isDark: boolean; onDelete: (id: string) => void;
}) {
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();
  const card   = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt    = isDark ? '#FFFFFF' : '#111111';
  const muted  = isDark ? 'rgba(235,235,245,0.4)' : 'rgba(60,60,67,0.45)';
  const border = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const imgBg  = isDark ? '#2C2C2E' : '#E5E5EA';
  const active = isActive(order.status);
  const badge  = statusBadge(order.status);
  const firstItem = order.items[0];

  const TrashIcon = () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
    </svg>
  );
  const MapIcon = () => (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/>
    </svg>
  );

  return (
    <SwipeableRow
      rightAction={!active ? {
        label: 'Delete', icon: <TrashIcon />, color: 'destructive',
        onPress: () => onDelete(order.id),
      } : undefined}
      leftAction={active ? {
        label: 'Track', icon: <MapIcon />, color: 'primary',
        onPress: () => navigate(`/orders/${order.id}`),
      } : undefined}
    >
      <button
        onClick={() => { haptic('light'); navigate(`/orders/${order.id}`); }}
        style={{
          width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', background: card, border: 'none', cursor: 'pointer',
          borderBottom: `1px solid ${border}`, fontFamily: F,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Thumbnail stack */}
        <div style={{ width: 64, height: 64, position: 'relative', flexShrink: 0 }}>
          {order.items.length > 1 && (
            <div style={{ position: 'absolute', top: 0, left: 0, width: 48, height: 48, borderRadius: 12, overflow: 'hidden', background: imgBg, opacity: 0.5 }}>
              {order.items[1]?.image ? <img src={order.items[1].image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> : null}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 0, right: 0, width: 52, height: 52, borderRadius: 11, overflow: 'hidden', background: imgBg, zIndex: 1 }}>
            {firstItem?.image
              ? <img src={firstItem.image} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={firstItem.productName} />
              : <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>
            }
          </div>
          {order.items.length > 2 && (
            <div style={{ position: 'absolute', bottom: 0, right: 0, zIndex: 2, width: 18, height: 18, borderRadius: 9, background: isDark ? '#3A3A3C' : '#D1D1D6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 9, fontWeight: 800, color: txt }}>+{order.items.length - 1}</span>
            </div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: txt }}>
              #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 12,
              background: badge.bg, color: badge.text,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: 3, background: badge.dot, display: 'inline-block' }} />
              {statusLabel(order.status, order.externalDeliveryType)}
            </span>
          </div>

          <p style={{ fontSize: 13, color: muted, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', marginBottom: 6 }}>
            {firstItem?.productName}
            {order.items.length > 1 && <span style={{ color: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)' }}> +{order.items.length - 1} more</span>}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 16, fontWeight: 900, color: accent }}>
              GHS {parseFloat(order.totalAmount).toFixed(2)}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: muted }}>
                {new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
              {active ? (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}
                  style={{
                    fontSize: 11, fontWeight: 700, color: accent,
                    background: accent + '20', border: 'none', borderRadius: 12,
                    padding: '4px 10px', cursor: 'pointer', fontFamily: F,
                    display: 'flex', alignItems: 'center', gap: 3,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2.5}><path d="M12 22s-7-7-7-12a7 7 0 1 1 14 0c0 5-7 12-7 12z"/><circle cx="12" cy="10" r="2.5"/></svg>
                  Track
                </button>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}
                  style={{
                    fontSize: 11, fontWeight: 600, color: muted,
                    background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                    border: 'none', borderRadius: 12,
                    padding: '4px 10px', cursor: 'pointer', fontFamily: F,
                    WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  Details
                </button>
              )}
            </div>
          </div>
        </div>

        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="m9 5 7 7-7 7"/>
        </svg>
      </button>
    </SwipeableRow>
  );
}

export function MobileOrders({ orders, isLoading, onDeleteOrder }: MobileOrdersProps) {
  const isDark = useTheme();
  const accent = '#009688';
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const bg    = isDark ? '#111111' : '#F2F2F7';
  const hdr   = isDark ? '#111111' : '#F2F2F7';
  const txt   = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.4)' : 'rgba(60,60,67,0.45)';
  const border = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const skel  = isDark ? '#2C2C2E' : '#E5E5EA';
  const tabBg = isDark ? '#2C2C2E' : '#E5E5EA';

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'completed', label: 'Delivered' },
    { id: 'cancelled', label: 'Cancelled' },
  ];

  const counts: Record<FilterTab, number> = {
    all: orders.length,
    active: orders.filter(o => isActive(o.status)).length,
    completed: orders.filter(o => ['delivered', 'completed'].includes(o.status)).length,
    cancelled: orders.filter(o => o.status === 'cancelled').length,
  };

  const filtered = orders.filter(o => {
    if (activeTab === 'all') return true;
    if (activeTab === 'active') return isActive(o.status);
    if (activeTab === 'completed') return ['delivered', 'completed'].includes(o.status);
    if (activeTab === 'cancelled') return o.status === 'cancelled';
    return true;
  });

  return (
    <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', fontFamily: F }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: hdr,
        borderBottom: `1px solid ${border}`,
        padding: '0 16px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        <p style={{ fontSize: 17, fontWeight: 700, color: txt, marginBottom: 10 }}>My Orders</p>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', msOverflowStyle: 'none', scrollbarWidth: 'none' } as React.CSSProperties}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                flexShrink: 0, padding: '5px 14px', borderRadius: 12,
                background: activeTab === t.id ? accent : tabBg,
                color: activeTab === t.id ? '#fff' : muted,
                border: 'none', cursor: 'pointer', fontFamily: F,
                fontSize: 13, fontWeight: 600,
                WebkitTapHighlightColor: 'transparent',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
            >
              {t.label}
              {counts[t.id] > 0 && (
                <span style={{
                  background: activeTab === t.id ? 'rgba(0,0,0,0.2)' : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                  color: activeTab === t.id ? '#fff' : muted,
                  borderRadius: 12, padding: '0 5px', fontSize: 11, fontWeight: 700,
                }}>
                  {counts[t.id]}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: 'max(88px, calc(72px + env(safe-area-inset-bottom)))' }}>
        {isLoading ? (
          <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3].map(i => <div key={i} style={{ height: 100, borderRadius: 12, background: skel }} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 32px', textAlign: 'center' }}>
            <svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 16 }}>
              <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>
            </svg>
            <p style={{ fontSize: 17, fontWeight: 700, color: txt, marginBottom: 6 }}>
              {activeTab === 'all' ? 'No orders yet' : `No ${activeTab} orders`}
            </p>
            <p style={{ fontSize: 14, color: muted }}>
              {activeTab === 'all' ? 'Your orders will appear here once you shop' : `No orders in this category`}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map(order => (
              <OrderCard
                key={order.id}
                order={order}
                accent={accent}
                isDark={isDark}
                onDelete={onDeleteOrder}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
