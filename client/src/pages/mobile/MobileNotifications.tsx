import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { useAuth } from "@/lib/auth";

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

function notifStyle(type: string): { icon: React.ReactNode; accent: string; bg: string } {
  const icons: Record<string, { path: React.ReactNode; accent: string; bg: string }> = {
    order:          { path: <path d="M5 7h14l-1 13H6z"/>,                                                              accent: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
    order_placed:   { path: <path d="M5 7h14l-1 13H6z"/>,                                                              accent: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
    order_update:   { path: <path d="M5 7h14l-1 13H6z"/>,                                                              accent: '#3B82F6', bg: 'rgba(59,130,246,0.15)' },
    payment:        { path: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,                accent: TEAL,      bg: 'rgba(0,150,136,0.15)' },
    payment_success:{ path: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></>,                accent: TEAL,      bg: 'rgba(0,150,136,0.15)' },
    payout:         { path: <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 14a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor" stroke="none"/><path d="M2 10h20"/></>, accent: TEAL, bg: 'rgba(0,150,136,0.15)' },
    delivery:       { path: <><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 5v3h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>, accent: '#8B5CF6', bg: 'rgba(139,92,246,0.15)' },
    delivered:      { path: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>, accent: TEAL, bg: 'rgba(0,150,136,0.15)' },
    message:        { path: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,              accent: '#38BDF8', bg: 'rgba(56,189,248,0.15)' },
    review:         { path: <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" fill="currentColor" stroke="none"/>, accent: '#F59E0B', bg: 'rgba(245,158,11,0.15)' },
    alert:          { path: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>,                         accent: '#EF4444', bg: 'rgba(239,68,68,0.15)' },
    system:         { path: <><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>,                         accent: '#6B7280', bg: 'rgba(107,114,128,0.15)' },
  };
  const def = { path: <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/>, accent: '#6B7280', bg: 'rgba(107,114,128,0.12)' };
  const s = icons[type] || def;
  return {
    accent: s.accent, bg: s.bg,
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
          padding: '13px 16px',
          background: card,
          border: 'none', borderRadius: 10, cursor: 'pointer',
          textAlign: 'left', fontFamily: F, WebkitTapHighlightColor: 'transparent',
          borderLeft: unread ? `3px solid ${TEAL}` : '3px solid transparent',
          transform: `translateX(${offsetX}px)`,
          transition: dragging.current ? 'none' : 'transform 0.25s cubic-bezier(0.25,1,0.5,1)',
          userSelect: 'none', position: 'relative', zIndex: 1,
          boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.07)',
        }}
      >
        <div style={{ width: 44, height: 44, borderRadius: 12, background: ns.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
          {ns.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 3 }}>
            <p style={{ fontSize: 14, fontWeight: unread ? 700 : 500, color: txt, lineHeight: 1.3, flex: 1 }}>{notif.title}</p>
            <span style={{ fontSize: 11, color: muted, flexShrink: 0, whiteSpace: 'nowrap' as const }}>{timeAgo(notif.createdAt)}</span>
          </div>
          <p style={{ fontSize: 13, color: muted, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
            {notif.message}
          </p>
        </div>
      </button>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export function MobileNotifications({
  notifications, isLoading, onMarkRead, onMarkAllRead, onDelete,
}: MobileNotificationsProps) {
  const isDark = useTheme();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();
  const [selectedNotif, setSelectedNotif]   = useState<Notification | null>(null);
  const [pendingAction, setPendingAction]   = useState<{ type: 'delete' | 'read'; id: string } | null>(null);
  const [activeTab, setActiveTab]           = useState<TabFilter>('all');

  const bg    = isDark ? '#111111' : '#F2F2F7';
  const hdr   = isDark ? '#111111' : '#F2F2F7';
  const txt   = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.4)' : 'rgba(60,60,67,0.45)';
  const bdr   = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
  const skel  = isDark ? '#2C2C2E' : '#E5E5EA';
  const card  = isDark ? '#1C1C1E' : '#FFFFFF';
  const tabBg = isDark ? '#2C2C2E' : '#E5E5EA';

  const unreadCount = notifications.filter(n => !n.isRead).length;

  const displayed = activeTab === 'new'
    ? notifications.filter(n => !n.isRead)
    : activeTab === 'read'
      ? notifications.filter(n => n.isRead)
      : notifications;

  const grouped = groupByDate(displayed);

  const TABS: { id: TabFilter; label: string; count?: number }[] = [
    { id: 'all',  label: 'All',  count: notifications.length },
    { id: 'new',  label: 'New',  count: unreadCount },
    { id: 'read', label: 'Read', count: notifications.filter(n => n.isRead).length },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', fontFamily: F }}>

      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20, background: hdr,
        borderBottom: `1px solid ${bdr}`,
        padding: '0 16px 10px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ fontSize: 17, fontWeight: 700, color: txt }}>Notifications</p>
            {unreadCount > 0 && (
              <span style={{ minWidth: 22, height: 20, borderRadius: 10, background: TEAL, color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={() => { haptic('light'); onMarkAllRead(); }} style={{
              fontSize: 13, fontWeight: 600, color: TEAL, background: 'none', border: 'none',
              cursor: 'pointer', fontFamily: F, WebkitTapHighlightColor: 'transparent',
            }}>Mark all read</button>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          {TABS.map(tab => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => { haptic('light'); setActiveTab(tab.id); }}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontFamily: F, fontSize: 13, fontWeight: 600,
                  WebkitTapHighlightColor: 'transparent',
                  background: active ? TEAL : tabBg,
                  color: active ? '#fff' : muted,
                  transition: 'background 0.15s, color 0.15s',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span style={{
                    minWidth: 18, height: 16, borderRadius: 8,
                    background: active ? 'rgba(255,255,255,0.25)' : (isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)'),
                    color: active ? '#fff' : muted,
                    fontSize: 10, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
                  }}>{tab.count > 99 ? '99+' : tab.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '12px 12px 0', paddingBottom: 'max(88px, calc(72px + env(safe-area-inset-bottom)))' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3,4].map(i => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '13px 16px', background: card, borderRadius: 10, boxShadow: isDark ? 'none' : '0 1px 4px rgba(0,0,0,0.07)' }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: skel, flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 2 }}>
                  <div style={{ height: 13, borderRadius: 4, background: skel, width: '60%' }} />
                  <div style={{ height: 11, borderRadius: 4, background: skel, width: '85%' }} />
                  <div style={{ height: 11, borderRadius: 4, background: skel, width: '45%' }} />
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 32px', textAlign: 'center' }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={muted} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/>
                <path d="M10 18a2 2 0 0 0 4 0"/>
              </svg>
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: txt, marginBottom: 5 }}>
              {activeTab === 'new' ? 'No new notifications' : activeTab === 'read' ? 'No read notifications' : 'All caught up'}
            </p>
            <p style={{ fontSize: 13, color: muted }}>
              {activeTab === 'all' ? "We'll notify you about orders, offers, and more." : activeTab === 'new' ? 'Switch to "All" to see everything.' : ''}
            </p>
          </div>
        ) : (
          grouped.map(group => (
            <div key={group.label} style={{ marginBottom: 4 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: 0.6, padding: '4px 4px 8px', fontFamily: F }}>
                {group.label}
              </p>
              {group.items.map(n => (
                <NotifRow
                  key={n.id}
                  notif={n}
                  isDark={isDark}
                  onPress={(notif) => {
                    setSelectedNotif(notif);
                    // auto mark as read when opened
                    if (!notif.isRead) onMarkRead(notif.id);
                  }}
                  onRequestAction={(type) => setPendingAction({ type, id: n.id })}
                />
              ))}
            </div>
          ))
        )}
      </div>

      {/* Detail modal */}
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

      {/* Swipe confirmation dialog */}
      {pendingAction && (
        <ConfirmDialog
          type={pendingAction.type}
          isDark={isDark}
          onConfirm={() => {
            if (pendingAction.type === 'delete') onDelete(pendingAction.id);
            else onMarkRead(pendingAction.id);
            setPendingAction(null);
          }}
          onCancel={() => setPendingAction(null)}
        />
      )}
    </div>
  );
}
