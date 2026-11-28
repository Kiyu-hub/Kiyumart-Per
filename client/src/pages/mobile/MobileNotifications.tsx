import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { useAuth } from "@/lib/auth";
import { Bell, Check, CheckCheck, CreditCard, MessageSquare, Package, Star, Tag, Truck, User as UserIcon, type LucideIcon } from "lucide-react";
import { SubpageShell, SubpageTabs, subpageColors, useSubpageDark, SUB_TEAL } from "@/components/mobile/MobileSubpage";

const F      = '-apple-system,"SF Pro Text","SF Pro",system-ui,sans-serif';
const TEAL   = '#009688';
const DELETE_CLR = '#EF4444';
const READ_CLR   = '#3B82F6';

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

interface Notification {
  id: string; type: string; title: string; message: string;
  isRead: boolean; createdAt: string;
  metadata?: Record<string, any> | null;
}

interface MobileNotificationsProps {
  notifications: Notification[];
  isLoading: boolean;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDelete: (id: string) => void;
}

type TabFilter = 'all' | 'new' | 'read';

function resolveNotificationTarget(notif: Notification, role?: string): string | null {
  const m = notif.metadata || {};
  const isAdmin = role === 'admin' || role === 'super_admin';
  const isBuyer = role === 'buyer';
  const isSeller = role === 'seller';
  const isRider = role === 'rider';
  const isAgent = role === 'agent';
  const isPickupAgent = role === 'pickup_agent';
  const rolePrefix = isAdmin ? '/admin' : `/${role}`;
  if (m.link) return m.link;
  if (m.promotionApplicationId && isAdmin) return `/admin/applications?tab=promotions&promotionId=${encodeURIComponent(String(m.promotionApplicationId))}`;
  switch (notif.type) {
    case 'order': case 'order_placed': case 'order_update': case 'delivery': case 'delivered':
      if (m.orderId && isBuyer)       return `/track/${encodeURIComponent(String(m.orderId))}`;
      if (m.orderId && isAdmin)       return `/admin/orders/${m.orderId}/action`;
      if (m.orderId && isSeller)      return `/seller/orders/${encodeURIComponent(String(m.orderId))}?context=seller`;
      if (m.orderId && isRider)       return `/rider/deliveries?orderId=${encodeURIComponent(String(m.orderId))}`;
      if (m.orderId && isPickupAgent) return `/pickup-agent?orderId=${encodeURIComponent(String(m.orderId))}`;
      return isBuyer ? '/orders' : (role ? `${rolePrefix}/orders` : null);
    case 'payment': case 'payment_success': case 'payout':
      if (isSeller) return '/seller';
      return isBuyer ? '/orders' : null;
    case 'message':
      if (m.conversationId) {
        if (isAdmin)       return `/admin/live-support?conversationId=${encodeURIComponent(String(m.conversationId))}`;
        if (isAgent)       return `/agent/tickets?conversationId=${encodeURIComponent(String(m.conversationId))}`;
        if (isPickupAgent) return `/pickup-agent/support?conversationId=${encodeURIComponent(String(m.conversationId))}`;
        return `/support?conversationId=${encodeURIComponent(String(m.conversationId))}`;
      }
      if (!isBuyer && m.senderId) return `${rolePrefix}/messages?userId=${encodeURIComponent(String(m.senderId))}`;
      return null;
    case 'product':
      if (m.productId && isAdmin)  return `${rolePrefix}/products/${m.productId}/edit`;
      if (m.productId && isSeller) return `/seller/products?productId=${encodeURIComponent(String(m.productId))}`;
      if (m.productId)             return `/product/${m.productId}`;
      return null;
    case 'user':
      if (m.userId && isAdmin) {
        const r = String(m.role || '').toLowerCase().trim();
        if (['seller','rider','pickup_agent'].includes(r)) return `/admin/applications?userId=${encodeURIComponent(String(m.userId))}&role=${encodeURIComponent(r)}`;
        return `${rolePrefix}/users/${m.userId}/edit`;
      }
      return null;
    default: return null;
  }
}

function notifStyle(type: string): { icon: React.ReactNode; accent: string; bg: string; label: string; kind: string } {
  const icons: Record<string, { path: React.ReactNode; accent: string; bg: string; kind: string }> = {
    order:          { path: <path d="M5 7h14l-1 13H6z"/>,                                                              accent: '#3B82F6', bg: 'rgba(59,130,246,0.15)', kind: 'Order' },
    order_placed:   { path: <path d="M5 7h14l-1 13H6z"/>,                                                              accent: '#3B82F6', bg: 'rgba(59,130,246,0.15)', kind: 'Order' },
    order_update:   { path: <path d="M5 7h14l-1 13H6z"/>,                                                              accent: '#3B82F6', bg: 'rgba(59,130,246,0.15)', kind: 'Order' },
    payment:        { path: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,                accent: TEAL,      bg: 'rgba(0,150,136,0.15)', kind: 'Payment' },
    payment_success:{ path: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,                accent: TEAL,      bg: 'rgba(0,150,136,0.15)', kind: 'Payment' },
    payout:         { path: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 14a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor" stroke="none"/><path d="M2 10h20"/></>, accent: TEAL, bg: 'rgba(0,150,136,0.15)', kind: 'Payout' },
    delivery:       { path: <><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 5v3h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>, accent: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', kind: 'Delivery' },
    delivered:      { path: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>, accent: TEAL, bg: 'rgba(0,150,136,0.15)', kind: 'Delivered' },
    message:        { path: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,              accent: '#38BDF8', bg: 'rgba(56,189,248,0.15)', kind: 'Message' },
    review:         { path: <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" fill="currentColor" stroke="none"/>, accent: '#F59E0B', bg: 'rgba(245,158,11,0.15)', kind: 'Review' },
    alert:          { path: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>,                         accent: '#EF4444', bg: 'rgba(239,68,68,0.15)', kind: 'Alert' },
    system:         { path: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>,                         accent: '#6B7280', bg: 'rgba(107,114,128,0.15)', kind: 'System' },
  };
  const def = { path: <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/>, accent: '#6B7280', bg: 'rgba(107,114,128,0.12)', kind: 'Update' };
  const s = icons[type] || def;
  return {
    accent: s.accent, bg: s.bg, label: s.accent, kind: s.kind,
    icon: (
      <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={s.accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {s.path}
      </svg>
    ),
  };
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function groupByDate(notifs: Notification[]): { label: string; items: Notification[] }[] {
  const today     = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  const groups: Record<string, Notification[]> = {};
  for (const n of notifs) {
    const d = new Date(n.createdAt).toDateString();
    const label = d === today ? 'Today' : d === yesterday ? 'Yesterday' : 'Earlier';
    (groups[label] = groups[label] || []).push(n);
  }
  return ['Today', 'Yesterday', 'Earlier'].filter(l => groups[l]?.length).map(l => ({ label: l, items: groups[l] }));
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}  ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

// ── Confirm dialog ─────────────────────────────────────────────────────────────
function ConfirmDialog({ type, isDark, onConfirm, onCancel }: {
  type: 'delete' | 'read'; isDark: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const { trigger: haptic } = useHaptic();
  const isDelete = type === 'delete';
  const clr  = isDelete ? DELETE_CLR : READ_CLR;
  const card = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt  = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.5)' : 'rgba(60,60,67,0.55)';
  return (
    <div onClick={onCancel} style={{
      position: 'fixed', inset: 0, zIndex: 1001,
      background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 28px', fontFamily: F,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 300, background: card,
        borderRadius: 8, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ background: clr, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 9 }}>
          {isDelete ? (
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
          ) : (
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>
            {isDelete ? 'Delete Notification' : 'Mark as Read'}
          </span>
        </div>
        <div style={{ padding: '16px 18px 18px' }}>
          <p style={{ fontSize: 13, color: muted, lineHeight: 1.55, margin: '0 0 18px' }}>
            {isDelete ? 'This notification will be permanently removed.' : 'This notification will be marked as read.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { haptic('light'); onCancel(); }} style={{
              flex: 1, height: 40, borderRadius: 8, background: 'none', cursor: 'pointer', fontFamily: F,
              border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
              fontSize: 14, fontWeight: 600, color: txt, WebkitTapHighlightColor: 'transparent',
            }}>Cancel</button>
            <button onClick={() => { haptic('medium'); onConfirm(); }} style={{
              flex: 1, height: 40, borderRadius: 8, background: clr, border: 'none', cursor: 'pointer', fontFamily: F,
              fontSize: 14, fontWeight: 700, color: '#fff', WebkitTapHighlightColor: 'transparent',
            }}>{isDelete ? 'Delete' : 'Mark Read'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail modal ───────────────────────────────────────────────────────────────
function NotifDetailModal({ notif, isDark, userRole, onClose, onMarkRead, onDelete, onNavigate }: {
  notif: Notification; isDark: boolean; userRole?: string;
  onClose: () => void; onMarkRead: (id: string) => void;
  onDelete: (id: string) => void; onNavigate: (url: string) => void;
}) {
  const { trigger: haptic } = useHaptic();
  const card  = isDark ? '#252528' : '#FFFFFF';
  const txt   = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.42)' : 'rgba(60,60,67,0.5)';
  const target = resolveNotificationTarget(notif, userRole);
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 24px', fontFamily: F,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 360, background: card,
        borderRadius: 8, padding: '20px', boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: TEAL, flex: 1, marginRight: 10, lineHeight: 1.3 }}>{notif.title}</span>
          <button onClick={onClose} style={{
            width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer',
            color: muted, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: 20, lineHeight: 1, WebkitTapHighlightColor: 'transparent',
          }}>×</button>
        </div>
        <p style={{ fontSize: 14, color: txt, lineHeight: 1.7, margin: '0 0 16px' }}>{notif.message}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            {target && (
              <button onClick={() => { haptic('medium'); onMarkRead(notif.id); onNavigate(target); onClose(); }} style={{
                height: 34, borderRadius: 8, padding: '0 14px',
                background: TEAL, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: F,
                WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center', gap: 5,
              }}>
                Open
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>
              </button>
            )}
            {!notif.isRead && (
              <button onClick={() => { haptic('light'); onMarkRead(notif.id); onClose(); }} style={{
                height: 34, borderRadius: 8, padding: '0 12px',
                background: 'none', border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}`,
                cursor: 'pointer', fontSize: 13, fontWeight: 600, color: muted,
                fontFamily: F, WebkitTapHighlightColor: 'transparent', display: 'flex', alignItems: 'center',
              }}>Mark read</button>
            )}
          </div>
          <span style={{ fontSize: 12, color: muted, textAlign: 'right', flexShrink: 0 }}>{formatTimestamp(notif.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Notification row ───────────────────────────────────────────────────────────
const SNAP_THRESHOLD = 60;

function NotifRow({ notif, isDark, onPress, onRequestAction }: {
  notif: Notification; isDark: boolean;
  onPress: (n: Notification) => void;
  onRequestAction: (type: 'delete' | 'read') => void;
}) {
  const { trigger: haptic } = useHaptic();
  const ns     = notifStyle(notif.type);
  const card   = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt    = isDark ? '#FFFFFF' : '#111111';
  const muted  = isDark ? 'rgba(235,235,245,0.4)' : 'rgba(60,60,67,0.45)';
  const bdr    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const unread = !notif.isRead;

  // Panel width: unread → 160px (Read+Delete), read → 80px (Delete only)
  const PANEL_W = unread ? 160 : 80;

  const startX   = useRef(0);
  const startY   = useRef(0);
  const isH      = useRef<boolean | null>(null);
  const dragging = useRef(false);
  const [offsetX, setOffsetX]   = useState(0);
  const [isOpen, setIsOpen]     = useState(false);

  // Swipe visual feedback progress (0 → 1)
  const leftProgress  = Math.min(Math.max(-offsetX, 0) / PANEL_W, 1);
  const rightProgress = Math.min(Math.max(offsetX, 0) / 80, 1);

  const close = () => { setIsOpen(false); setOffsetX(0); };

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startY.current = e.touches[0].clientY;
    isH.current = null;
    dragging.current = true;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragging.current) return;
    const dx = e.touches[0].clientX - startX.current;
    const dy = e.touches[0].clientY - startY.current;
    if (isH.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isH.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isH.current) return;
    e.preventDefault();
    if (isOpen) {
      // already open — allow swiping back right to close
      setOffsetX(Math.min(0, -PANEL_W + dx));
    } else {
      setOffsetX(Math.max(-PANEL_W, Math.min(unread ? 100 : 0, dx)));
    }
  };

  const onTouchEnd = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (offsetX <= -SNAP_THRESHOLD && !isOpen) {
      // snap panel open
      haptic('light');
      setIsOpen(true);
      setOffsetX(-PANEL_W);
    } else if (offsetX > -SNAP_THRESHOLD && isOpen) {
      // swipe back to close
      close();
    } else if (offsetX >= 80 && unread) {
      // swipe right → mark read confirmation
      haptic('light');
      setOffsetX(0);
      onRequestAction('read');
    } else if (!isOpen) {
      setOffsetX(0);
    }
  };

  return (
    <div style={{ overflow: 'hidden', position: 'relative', borderRadius: 10, marginBottom: 10 }}>

      {/* ── Left-swipe panel: blue Read + red Delete ── */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0,
        width: PANEL_W, display: 'flex',
      }}>
        {unread && (
          <button
            onClick={() => { close(); onRequestAction('read'); }}
            style={{
              flex: 1, background: READ_CLR, border: 'none', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              fontFamily: F, WebkitTapHighlightColor: 'transparent',
            }}
          >
            <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Read</span>
          </button>
        )}
        <button
          onClick={() => { close(); onRequestAction('delete'); }}
          style={{
            flex: 1, background: DELETE_CLR, border: 'none', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            fontFamily: F, WebkitTapHighlightColor: 'transparent',
          }}
        >
          <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
          </svg>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#fff' }}>Delete</span>
        </button>
      </div>

      {/* ── Right-swipe indicator (mark read, unread only) ── */}
      {rightProgress > 0.08 && unread && (
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          background: READ_CLR,
          opacity: 0.12 + rightProgress * 0.88,
          display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
          paddingLeft: 20, pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: rightProgress }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Mark Read</span>
          </div>
        </div>
      )}

      {/* ── Sliding row ── */}
      <button
        onClick={() => {
          if (isOpen) { close(); return; }
          if (Math.abs(offsetX) < 5) { haptic('light'); onPress(notif); }
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: '12px 14px',
          background: card,
          border: 'none', borderRadius: 12, cursor: 'pointer',
          textAlign: 'left', fontFamily: F, WebkitTapHighlightColor: 'transparent',
          borderLeft: unread ? `3px solid ${TEAL}` : '3px solid transparent',
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.25,1,0.5,1)',
          userSelect: 'none', position: 'relative', zIndex: 1,
          boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.07)',
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 12, background: ns.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
          {ns.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title row — single-line clamp so cards stay scannable. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <p
              style={{
                fontSize: 14.5,
                fontWeight: unread ? 700 : 600,
                color: txt,
                lineHeight: 1.25,
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
              }}
            >
              {notif.title}
            </p>
            {unread && (
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: TEAL,
                  flexShrink: 0,
                }}
                aria-label="Unread"
              />
            )}
          </div>
          {/* Message — 2-line clamp, mobile-friendly. */}
          <p
            style={{
              fontSize: 13,
              color: muted,
              lineHeight: 1.45,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical' as const,
              margin: 0,
              wordBreak: 'break-word' as const,
            }}
          >
            {notif.message}
          </p>
          {/* Footer row — type chip on the left, timestamp on the right. */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: 'uppercase' as const,
                color: ns.label,
                background: ns.bg,
                padding: '2px 8px',
                borderRadius: 999,
              }}
            >
              {ns.kind}
            </span>
            <span style={{ fontSize: 11, color: muted, whiteSpace: 'nowrap' as const }}>
              {timeAgo(notif.createdAt)}
            </span>
          </div>
        </div>
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
// Plain-list icons (desktop lucide set, no coloured backgrounds).
function plainIcon(type: string): LucideIcon {
  const t = String(type || "").toLowerCase();
  if (t.includes("deliver") || t.includes("rider") || t.includes("dispatch")) return Truck;
  if (t.includes("order")) return Package;
  if (t.includes("pay") || t.includes("payout") || t.includes("refund")) return CreditCard;
  if (t.includes("message") || t.includes("support")) return MessageSquare;
  if (t.includes("promo") || t.includes("coupon") || t.includes("product")) return Tag;
  if (t.includes("review")) return Star;
  if (t.includes("user") || t.includes("account")) return UserIcon;
  return Bell;
}

/** Phone "Notifications" (approved 28 Nov 2026): All / New / Read, unread dot, mark all as read. */
export function MobileNotifications({
  notifications, isLoading, onMarkRead, onMarkAllRead, onDelete,
}: MobileNotificationsProps) {
  const isDark = useSubpageDark();
  const c = subpageColors(isDark);
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();
  const [selectedNotif, setSelectedNotif] = useState<Notification | null>(null);
  const [activeTab, setActiveTab] = useState<TabFilter>('all');

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const displayed = activeTab === 'new'
    ? notifications.filter(n => !n.isRead)
    : activeTab === 'read' ? notifications.filter(n => n.isRead) : notifications;

  const open = (n: Notification) => {
    haptic('light');
    if (!n.isRead) onMarkRead(n.id);
    const target = resolveNotificationTarget(n, user?.role);
    if (target) navigate(target);
    else setSelectedNotif(n);
  };

  return (
    <SubpageShell
      title="Notifications"
      isDark={isDark}
      testId="mobile-notifications"
      right={unreadCount > 0 ? (
        <button aria-label="Mark all as read" onClick={() => { haptic('light'); onMarkAllRead(); }} style={{ width: 44, height: 44, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <CheckCheck size={22} strokeWidth={2} color={c.ink} aria-hidden="true" />
        </button>
      ) : undefined}
    >
      <SubpageTabs
        isDark={isDark}
        value={activeTab}
        onChange={setActiveTab}
        tabs={[
          { key: 'all', label: 'All' },
          { key: 'new', label: unreadCount > 0 ? `New (${unreadCount > 99 ? '99+' : unreadCount})` : 'New' },
          { key: 'read', label: 'Read' },
        ]}
      />
      {isLoading ? (
        <div style={{ padding: '0 24px' }}>
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: '16px 0', borderBottom: `1px solid ${c.line}` }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: c.line }} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ height: 12, width: '55%', borderRadius: 4, background: c.line }} />
                <div style={{ height: 10, width: '85%', borderRadius: 4, background: c.line }} />
              </div>
            </div>
          ))}
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '72px 32px' }}>
          <Bell size={40} strokeWidth={1.5} color={c.faint} aria-hidden="true" />
          <div style={{ marginTop: 12, fontSize: 17, fontWeight: 700 }}>
            {activeTab === 'new' ? 'No new notifications' : activeTab === 'read' ? 'No read notifications' : 'All caught up'}
          </div>
          <div style={{ marginTop: 6, fontSize: 14, color: c.soft }}>We'll notify you about orders, messages and more.</div>
        </div>
      ) : (
        <div style={{ padding: '0 24px' }}>
          {displayed.map((n, i) => {
            const I = plainIcon(n.type);
            return (
              <button key={n.id} data-testid="notification-row" onClick={() => open(n)} style={{ width: '100%', display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 0', border: 0, borderBottom: i === displayed.length - 1 ? 'none' : `1px solid ${c.line}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: c.ink, fontFamily: F }}>
                <I size={22} strokeWidth={1.75} color={c.ink} aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: n.isRead ? 500 : 700 }}>{n.title}</span>
                  {n.message && <span style={{ display: 'block', fontSize: 14, color: c.soft, marginTop: 2, lineHeight: 1.4 }}>{n.message}</span>}
                  <span style={{ display: 'block', fontSize: 12, color: c.faint, marginTop: 4 }}>{timeAgo(n.createdAt)}</span>
                </span>
                {n.isRead
                  ? <span style={{ width: 8, flexShrink: 0 }} />
                  : <span aria-label="Unread" style={{ width: 8, height: 8, borderRadius: 4, background: SUB_TEAL, flexShrink: 0, marginTop: 8 }} />}
              </button>
            );
          })}
        </div>
      )}

      {selectedNotif && (
        <NotifDetailModal
          notif={selectedNotif}
          isDark={isDark}
          userRole={user?.role}
          onClose={() => setSelectedNotif(null)}
          onMarkRead={(id) => { onMarkRead(id); }}
          onDelete={(id) => { onDelete(id); setSelectedNotif(null); }}
          onNavigate={(url) => { setSelectedNotif(null); navigate(url); }}
        />
      )}
    </SubpageShell>
  );
}
