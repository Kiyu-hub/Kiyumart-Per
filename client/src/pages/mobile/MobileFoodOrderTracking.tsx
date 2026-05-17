import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { io, type Socket } from "socket.io-client";

// Bolt-Food-style mobile order tracking page.
// Brand color = KiyuMart TEAL. Layout mirrors Bolt Food's order screen:
//   - Hero status illustration + ETA chip
//   - Vertical status timeline with active glow
//   - Rider card (avatar + name + vehicle + rating + call/message)
//   - Items list with modifier summary lines
//   - Delivery address card
//   - Bill breakdown (subtotal / delivery / total) — all from the order record.
const F    = 'Inter,-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL = '#009688';
const AMBER = '#F59E0B';

interface OrderItem {
  id: string;
  productId: string;
  productName?: string | null;
  productImage?: string | null;
  quantity: number;
  price: string | number;
  total?: string | number;
  selectedColor?: string | null;
  selectedSize?: string | null;
  modifierSelections?: Array<{ groupName: string; selected: { label: string; priceAdj: number }[] }> | null;
  notes?: string | null;
}

interface OrderData {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: string;
  total: string | number;
  subtotal: string | number;
  deliveryFee: string | number;
  processingFee: string | number;
  couponDiscount?: string | number;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPhone?: string | null;
  deliveryLatitude?: string | null;
  deliveryLongitude?: string | null;
  riderId?: string | null;
  sellerId: string;
  storeId?: string | null;
  storeName?: string | null;
  buyerId: string;
  estimatedDelivery?: string | null;
  deliveredAt?: string | null;
  createdAt: string;
  items?: OrderItem[];
}

interface RiderInfo {
  id: string;
  name?: string | null;
  phone?: string | null;
  profileImage?: string | null;
  vehicleInfo?: { type?: string; plate?: string } | null;
  averageRating?: string;
}

// Bolt-Food status mapping for food orders. We translate KiyuMart's canonical
// statuses into the buyer-friendly Bolt vocabulary.
const FOOD_STATUS_FLOW: { key: string; label: string; sub: string; aliases: string[] }[] = [
  { key: 'confirmed', label: 'Order confirmed',  sub: "Restaurant received your order", aliases: ['pending', 'created', 'confirmed'] },
  { key: 'preparing', label: 'Preparing food',   sub: 'Your meal is being cooked',       aliases: ['processing', 'packaged', 'preparing'] },
  { key: 'ready',     label: 'Ready for pickup', sub: 'Waiting for a rider',             aliases: ['ready', 'searching_rider'] },
  { key: 'pickedup',  label: 'Rider on the way', sub: 'Heading to your address',         aliases: ['assigned', 'rider_arrived', 'picked_up', 'in_transit', 'en_route'] },
  { key: 'delivered', label: 'Delivered',        sub: 'Enjoy your meal!',                aliases: ['delivered', 'completed'] },
];

function statusStepIndex(status: string): number {
  const s = String(status || '').toLowerCase();
  for (let i = FOOD_STATUS_FLOW.length - 1; i >= 0; i--) {
    if (FOOD_STATUS_FLOW[i].aliases.includes(s)) return i;
  }
  return 0;
}

function money(v: any): string {
  const n = parseFloat(String(v ?? 0));
  return `GH₵ ${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export default function MobileFoodOrderTracking() {
  const [, params] = useRoute<{ id: string }>("/orders/:id");
  const [, params2] = useRoute<{ id: string }>("/track/:id");
  const orderId = params?.id || params2?.id || '';
  const [, navigate] = useLocation();
  const { user } = useAuth();
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

  const { data: order, refetch } = useQuery<OrderData>({
    queryKey: ["/api/orders", orderId, "food-tracking"],
    queryFn: async () => {
      const r = await fetch(`/api/orders/${orderId}`, { credentials: 'include' });
      if (!r.ok) throw new Error("Order not found");
      return r.json();
    },
    enabled: !!orderId,
    refetchInterval: 20_000,
  });

  const { data: rider } = useQuery<RiderInfo | null>({
    queryKey: ["/api/users", order?.riderId, "rider-card"],
    queryFn: async () => {
      if (!order?.riderId) return null;
      const r = await fetch(`/api/users/${order.riderId}/public`);
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!order?.riderId,
  });

  // Socket subscription for live status updates from the order state machine.
  useEffect(() => {
    if (!user?.id || !orderId) return;
    const socket: Socket = io({ withCredentials: true });
    socket.on('connect', () => { socket.emit('join', user.id); });
    const refresh = () => refetch();
    socket.on('order_status_changed', refresh);
    socket.on('order_updated', refresh);
    socket.on('rider_assigned', refresh);
    return () => { socket.disconnect(); };
  }, [orderId, user?.id, refetch]);

  // Palette
  const bg     = isDark ? '#0B0B0B' : '#F7F8FA';
  const card   = isDark ? '#161616' : '#FFFFFF';
  const bdr    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)';
  const txt    = isDark ? '#FFFFFF' : '#0F172A';
  const muted  = isDark ? 'rgba(235,235,245,0.55)' : 'rgba(15,23,42,0.55)';
  const skel   = isDark ? '#1F1F22' : '#E5E7EB';

  const activeStep = useMemo(() => statusStepIndex(order?.status || ''), [order?.status]);
  const isDelivered = activeStep >= FOOD_STATUS_FLOW.length - 1;

  // Live ETA — minutes remaining vs estimatedDelivery.
  const minutesRemaining = useMemo(() => {
    if (!order?.estimatedDelivery || isDelivered) return null;
    const eta = new Date(order.estimatedDelivery).getTime();
    const now = Date.now();
    const mins = Math.max(0, Math.round((eta - now) / 60000));
    return mins;
  }, [order?.estimatedDelivery, isDelivered]);

  if (!order) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, color: txt }}>
        <div style={{ height: 220, background: skel }} />
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ width: '60%', height: 18, borderRadius: 6, background: skel }} />
          <div style={{ width: '40%', height: 12, borderRadius: 4, background: skel }} />
        </div>
      </div>
    );
  }

  const currentStatus = FOOD_STATUS_FLOW[activeStep];

  return (
    <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, color: txt, paddingBottom: 24 }}>
      {/* ── Hero status block ──────────────────────────── */}
      <div style={{
        position: 'relative',
        padding: '14px 16px 32px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
        background: isDelivered
          ? `linear-gradient(180deg, ${TEAL}22 0%, transparent 100%)`
          : `linear-gradient(180deg, ${TEAL}33 0%, transparent 100%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) window.history.back(); else navigate('/orders'); }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: bg, border: `1px solid ${bdr}`, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <div style={{ fontSize: 12, color: muted, fontWeight: 600 }}>Order #{order.orderNumber}</div>
          <div style={{ width: 36 }} />
        </div>

        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 72, lineHeight: 1 }}>
            {activeStep === 0 ? '🧾' : activeStep === 1 ? '🍳' : activeStep === 2 ? '🍱' : activeStep === 3 ? '🛵' : '🎉'}
          </div>
          <div style={{ marginTop: 14, fontSize: 22, fontWeight: 800, color: txt, lineHeight: 1.2 }}>
            {currentStatus.label}
          </div>
          <div style={{ marginTop: 4, fontSize: 13, color: muted }}>
            {currentStatus.sub}
          </div>
          {minutesRemaining !== null && (
            <div style={{
              marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6,
              background: card, border: `1px solid ${bdr}`,
              padding: '6px 14px', borderRadius: 999,
              fontSize: 13, fontWeight: 700, color: txt,
            }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
              </svg>
              {minutesRemaining > 0 ? `Arrives in ~${minutesRemaining} min` : 'Arriving any moment'}
            </div>
          )}
        </div>
      </div>

      {/* ── Status timeline ────────────────────────────── */}
      <div style={{ margin: '0 16px', background: card, borderRadius: 16, border: `1px solid ${bdr}`, padding: '16px 18px' }}>
        {FOOD_STATUS_FLOW.map((step, idx) => {
          const done = idx <= activeStep;
          const isLast = idx === FOOD_STATUS_FLOW.length - 1;
          return (
            <div key={step.key} style={{ display: 'flex', gap: 12, paddingBottom: isLast ? 0 : 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: done ? TEAL : 'transparent',
                  border: `2px solid ${done ? TEAL : bdr}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {done && (
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  )}
                </div>
                {!isLast && (
                  <div style={{
                    flex: 1, width: 2, marginTop: 2,
                    background: done ? TEAL : bdr,
                    minHeight: 24,
                  }} />
                )}
              </div>
              <div style={{ flex: 1, paddingBottom: 4 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: done ? txt : muted }}>{step.label}</div>
                <div style={{ marginTop: 2, fontSize: 12, color: muted }}>{step.sub}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Rider card ─────────────────────────────────── */}
      {rider && (
        <div style={{ margin: '16px', background: card, borderRadius: 16, border: `1px solid ${bdr}`, padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, overflow: 'hidden', background: skel, flexShrink: 0 }}>
            {rider.profileImage ? (
              <img src={rider.profileImage} alt={rider.name || 'Rider'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 22 }}>🛵</div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: txt, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {rider.name || 'Your rider'}
            </div>
            <div style={{ marginTop: 2, fontSize: 12, color: muted, display: 'flex', alignItems: 'center', gap: 6 }}>
              {rider.vehicleInfo?.type && <span>{String(rider.vehicleInfo.type).replace(/_/g, ' ')}</span>}
              {rider.averageRating && parseFloat(rider.averageRating) > 0 && (
                <>
                  <span>·</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <svg width={10} height={10} viewBox="0 0 24 24" fill={AMBER} stroke="none">
                      <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" />
                    </svg>
                    {parseFloat(rider.averageRating).toFixed(1)}
                  </span>
                </>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {rider.phone && (
              <a
                href={`tel:${rider.phone}`}
                style={{
                  width: 40, height: 40, borderRadius: 20,
                  background: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none',
                }}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                </svg>
              </a>
            )}
            <button
              onClick={() => order.riderId && navigate(`/chat/${order.riderId}`)}
              style={{
                width: 40, height: 40, borderRadius: 20,
                background: 'transparent', border: `1.5px solid ${TEAL}`, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Items list ─────────────────────────────────── */}
      <SectionHeader title="Your order" muted={muted} txt={txt} />
      <div style={{ margin: '0 16px', background: card, borderRadius: 16, border: `1px solid ${bdr}`, overflow: 'hidden' }}>
        {(order.items ?? []).map((item, idx) => {
          const last = idx === (order.items?.length || 0) - 1;
          const itemModSummary = (item.modifierSelections || [])
            .flatMap((g) => g.selected.map((s) => s.label))
            .filter(Boolean)
            .join(', ');
          return (
            <div key={item.id} style={{
              display: 'flex', gap: 12, padding: '12px 14px',
              borderBottom: last ? 'none' : `1px solid ${bdr}`,
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', background: skel, flexShrink: 0 }}>
                {item.productImage ? (
                  <img src={item.productImage} alt={item.productName || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', fontSize: 20 }}>🍽️</div>
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: txt, lineHeight: 1.3 }}>
                  {item.quantity}× {item.productName || 'Item'}
                </div>
                {itemModSummary && (
                  <div style={{ marginTop: 2, fontSize: 11, color: muted, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                    {itemModSummary}
                  </div>
                )}
                {item.notes && (
                  <div style={{ marginTop: 2, fontSize: 11, color: muted, fontStyle: 'italic' }}>
                    Note: {item.notes}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: txt, flexShrink: 0 }}>
                {money(item.total ?? (parseFloat(String(item.price)) * item.quantity))}
              </div>
            </div>
          );
        })}
        {(!order.items || order.items.length === 0) && (
          <div style={{ padding: 16, fontSize: 13, color: muted, textAlign: 'center' }}>
            No items found on this order.
          </div>
        )}
      </div>

      {/* ── Delivery address ───────────────────────────── */}
      <SectionHeader title="Delivery to" muted={muted} txt={txt} />
      <div style={{ margin: '0 16px', background: card, borderRadius: 16, border: `1px solid ${bdr}`, padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 18, background: TEAL + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: txt, lineHeight: 1.3 }}>
              {order.deliveryAddress || 'Address not provided'}
            </div>
            {order.deliveryCity && (
              <div style={{ marginTop: 2, fontSize: 12, color: muted }}>{order.deliveryCity}</div>
            )}
            {order.deliveryPhone && (
              <div style={{ marginTop: 2, fontSize: 12, color: muted }}>{order.deliveryPhone}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Bill breakdown ─────────────────────────────── */}
      <SectionHeader title="Payment summary" muted={muted} txt={txt} />
      <div style={{ margin: '0 16px 32px', background: card, borderRadius: 16, border: `1px solid ${bdr}`, padding: '14px 16px' }}>
        <Row label="Subtotal" value={money(order.subtotal)} txt={txt} muted={muted} />
        <Row label="Delivery fee" value={money(order.deliveryFee)} txt={txt} muted={muted} />
        {parseFloat(String(order.processingFee || 0)) > 0 && (
          <Row label="Processing fee" value={money(order.processingFee)} txt={txt} muted={muted} />
        )}
        {parseFloat(String(order.couponDiscount || 0)) > 0 && (
          <Row label="Discount" value={`- ${money(order.couponDiscount)}`} txt={TEAL} muted={muted} />
        )}
        <div style={{ height: 1, background: bdr, margin: '10px 0' }} />
        <Row label="Total" value={money(order.total)} txt={txt} muted={muted} bold />
      </div>
    </div>
  );
}

function SectionHeader({ title, txt, muted }: { title: string; txt: string; muted: string }) {
  return (
    <div style={{ padding: '20px 16px 8px', fontSize: 12, color: muted, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>
      {title}
    </div>
  );
}

function Row({ label, value, txt, muted, bold }: { label: string; value: string; txt: string; muted: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 0',
    }}>
      <span style={{ fontSize: bold ? 15 : 13, color: bold ? txt : muted, fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{ fontSize: bold ? 16 : 14, color: txt, fontWeight: bold ? 800 : 700 }}>{value}</span>
    </div>
  );
}
