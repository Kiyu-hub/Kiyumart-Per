import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/UserAvatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

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

// ── Minimal SVG helper ────────────────────────────────────────────────────────
function Icon({ d, size = 18, color = 'currentColor', sw = 1.8, fill = 'none' }: {
  d: React.ReactNode; size?: number; color?: string; sw?: number; fill?: string;
}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill}
      stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
}

// Desktop-matching icon paths
const IC = {
  user:       <><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></>,
  edit:       <><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></>,
  lock:       <><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
  bell:       <><path d="M6 8a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 18a2 2 0 0 0 4 0"/></>,
  heart:      <path d="M12 20s-7-4.5-9.5-9C.5 7 3 3.5 6.5 3.5c2 0 3.5 1 5.5 3.5 2-2.5 3.5-3.5 5.5-3.5C21 3.5 23.5 7 21.5 11c-2.5 4.5-9.5 9-9.5 9z" fill="currentColor" stroke="none"/>,
  bag:        <><path d="M5 7h14l-1 13H6z"/><path d="M9 7a3 3 0 0 1 6 0"/></>,
  store:      <><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></>,
  wallet:     <><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 14a1 1 0 1 0 2 0 1 1 0 0 0-2 0z" fill="currentColor" stroke="none"/><path d="M2 10h20"/></>,
  gift:       <><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
  help:       <><circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><circle cx="12" cy="17" r=".5" fill="currentColor" stroke="none"/></>,
  shield:     <path d="M12 2 3 7v5c0 5.5 3.8 10.7 9 12 5.2-1.3 9-6.5 9-12V7z"/>,
  logout:     <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
  truck:      <><rect x="1" y="3" width="15" height="13"/><path d="M16 8h4l3 5v3h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></>,
  chart:      <><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></>,
  layout:     <><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></>,
  copy:       <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>,
  download:   <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></>,
  chevRight:  <path d="m9 5 7 7-7 7"/>,
  users:      <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  star:       <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" fill="currentColor" stroke="none"/>,
  tag:        <><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.5" fill="currentColor" stroke="none"/></>,
  settings:  <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  message:    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>,
  external:   <><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></>,
  package:    <><path d="M16.5 9.4 7.55 4.24"/><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></>,
  camera:     <><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></>,
};

// ── Row item ──────────────────────────────────────────────────────────────────
function Row({
  icon, label, sub, right, danger, badge, onClick, isDark,
}: {
  icon: keyof typeof IC; label: string; sub?: string; right?: string;
  danger?: boolean; badge?: number; isDark: boolean; onClick?: () => void;
}) {
  const rowBg   = isDark ? '#1C1C1E' : '#FFFFFF';
  const divClr  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const subClr  = isDark ? 'rgba(235,235,245,0.38)' : 'rgba(60,60,67,0.45)';
  const chevClr = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(60,60,67,0.25)';
  const txtClr  = danger ? '#FF453A' : (isDark ? '#FFFFFF' : '#111111');
  const iconClr = danger ? '#FF453A' : (isDark ? 'rgba(255,255,255,0.55)' : 'rgba(60,60,67,0.55)');

  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px', background: rowBg,
        border: 'none', cursor: onClick ? 'pointer' : 'default',
        textAlign: 'left', fontFamily: F,
        WebkitTapHighlightColor: 'transparent',
        borderBottom: `1px solid ${divClr}`,
      }}
    >
      <div style={{ width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon d={IC[icon]} size={18} color={iconClr} sw={1.8} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 15, fontWeight: 400, color: txtClr, lineHeight: 1.2 }}>{label}</p>
        {sub && <p style={{ fontSize: 12, color: subClr, marginTop: 2 }}>{sub}</p>}
      </div>
      {badge !== undefined && badge > 0 && (
        <span style={{ minWidth: 20, height: 20, borderRadius: 12, background: '#FF453A', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', marginRight: 2 }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {right && <span style={{ fontSize: 13, color: subClr, flexShrink: 0 }}>{right}</span>}
      {onClick && !right && <Icon d={IC.chevRight} size={14} color={chevClr} sw={2.5} />}
    </button>
  );
}

function Section({ title, children, isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  const subClr  = isDark ? 'rgba(235,235,245,0.38)' : 'rgba(60,60,67,0.45)';
  const bdrClr  = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
  const bg      = isDark ? '#1C1C1E' : '#FFFFFF';
  return (
    <div style={{ marginBottom: 8 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: subClr, textTransform: 'uppercase' as const, letterSpacing: 0.5, padding: '14px 20px 6px', fontFamily: F }}>
        {title}
      </p>
      <div style={{ marginInline: 16, borderRadius: 12, overflow: 'hidden', border: `1px solid ${bdrClr}`, background: bg }}>
        {children}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function MobileProfile() {
  const isDark = useTheme();
  const [, navigate] = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const { trigger: haptic } = useHaptic();
  const accent = '#009688';
  const fileRef = useRef<HTMLInputElement>(null);

  const bg     = isDark ? '#111111' : '#F2F2F7';
  const hdrBg  = isDark ? '#111111' : '#F2F2F7';
  const card   = isDark ? '#1C1C1E' : '#FFFFFF';
  const txt    = isDark ? '#FFFFFF' : '#111111';
  const muted  = isDark ? 'rgba(235,235,245,0.38)' : 'rgba(60,60,67,0.45)';
  const bdr    = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.08)';
  const inp    = isDark ? '#2C2C2E' : '#EBEBF0';

  const { data: profile } = useQuery<any>({ queryKey: ['/api/auth/me'], enabled: !!user });
  const { data: orders = [] } = useQuery<any[]>({ queryKey: ['/api/orders'], enabled: !!user && user.role === 'buyer' });
  const { data: wishlist = [] } = useQuery<any[]>({ queryKey: ['/api/wishlist'], enabled: !!user && user.role === 'buyer' });
  const { data: notifCount = 0 } = useQuery<number>({
    queryKey: ['/api/notifications/unread-count', user?.id],
    queryFn: async () => {
      const r = await fetch('/api/notifications/unread-count', { credentials: 'include' });
      if (!r.ok) return 0;
      const d = await r.json();
      return typeof d === 'number' ? d : (d?.count ?? 0);
    },
    enabled: !!user, staleTime: 30_000, refetchInterval: 60_000,
  });
  const { data: store } = useQuery<any>({ queryKey: ['/api/stores/my-store', 'profile'], enabled: !!user && user.role === 'seller' });

  const role     = user?.role ?? 'buyer';
  const isBuyer  = role === 'buyer';
  const isSeller = role === 'seller';
  const isRider  = role === 'rider';
  const isAdmin  = role === 'admin' || role === 'super_admin';
  const isAgent  = role === 'agent' || role === 'pickup_agent';

  // Mirror desktop Header gating: hide the "Become a Seller / Rider" rows when
  // the platform has registration disabled or external rider mode is on.
  const { allowSellerRegistration, allowRiderRegistration, isExternalRiderSystemEnabled } = usePlatformSettings();
  const showBecomeSeller = allowSellerRegistration && isBuyer;
  const showBecomeRider  = allowRiderRegistration && isBuyer && !isExternalRiderSystemEnabled;

  const name    = profile?.name || user?.name || 'User';
  const email   = profile?.email || user?.email || '';
  const phone   = profile?.phone || '';
  const avatar  = profile?.profileImage || '';
  const activeOrders = (orders as any[]).filter(o => !['completed', 'cancelled', 'delivered'].includes(o.status)).length;
  const referralUrl = profile?.referralCode ? `${window.location.origin}/signup?ref=${profile.referralCode}` : null;

  // ── Edit state ───────────────────────────────────────────────────────────────
  const [isEditing, setIsEditing]       = useState(false);
  const [editName, setEditName]         = useState('');
  const [editPhone, setEditPhone]       = useState('');
  const [editImage, setEditImage]       = useState('');
  const [previewImg, setPreviewImg]     = useState('');
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [isSaving, setIsSaving]         = useState(false);

  const openEdit = () => {
    setEditName(profile?.name || user?.name || '');
    setEditPhone(profile?.phone || '');
    setEditImage(profile?.profileImage || '');
    setPreviewImg(profile?.profileImage || '');
    setIsEditing(true);
  };

  const handleImagePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreviewImg(URL.createObjectURL(file));
    setIsUploadingImg(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/upload/public', { method: 'POST', body: fd });
      const data = await res.json();
      if (data?.url) { setEditImage(data.url); setPreviewImg(data.url); }
      else throw new Error('Upload failed');
    } catch {
      toast({ title: 'Upload failed', description: 'Could not upload image', variant: 'destructive' });
      setPreviewImg(editImage);
    } finally { setIsUploadingImg(false); }
  };

  const saveEdit = async () => {
    if (!editName.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setIsSaving(true);
    try {
      const body: Record<string, string> = { name: editName.trim() };
      if (editPhone.trim()) body.phone = editPhone.trim();
      if (editImage) body.profileImage = editImage;
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      toast({ title: 'Profile updated' });
      setIsEditing(false);
    } catch {
      toast({ title: 'Save failed', variant: 'destructive' });
    } finally { setIsSaving(false); }
  };

  const copyReferral = () => {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      haptic('success');
      toast({ title: 'Referral link copied!' });
    });
  };

  const handleLogout = async () => {
    haptic('warning');
    await logout();
    navigate('/auth');
  };

  const downloadMyData = async () => {
    haptic('medium');
    try {
      const res = await fetch('/api/profile/export', { credentials: 'include' });
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `kiyumart-data-${Date.now()}.json`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      toast({ title: 'Data exported' });
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const ROLE_LABEL: Record<string, string> = { seller: 'Seller', rider: 'Rider', admin: 'Admin', super_admin: 'Super Admin', pickup_agent: 'Pickup Agent', agent: 'Support Agent' };

  if (!isAuthenticated) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, fontFamily: F }}>
        <Icon d={IC.user} size={48} color={muted} sw={1.2} />
        <p style={{ fontSize: 17, fontWeight: 600, color: txt }}>Not signed in</p>
        <button onClick={() => navigate('/auth')} style={{ marginTop: 8, background: accent, color: '#fff', border: 'none', borderRadius: 12, padding: '12px 28px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>
          Sign In
        </button>
      </div>
    );
  }

  // ── Edit screen ───────────────────────────────────────────────────────────────
  if (isEditing) {
    return (
      <div style={{ minHeight: '100dvh', background: bg, fontFamily: F }}>
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 20, background: hdrBg, borderBottom: `1px solid ${bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px', paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}>
          <button onClick={() => setIsEditing(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 500, color: muted, fontFamily: F }}>Cancel</button>
          <span style={{ fontSize: 17, fontWeight: 700, color: txt }}>Edit Profile</span>
          <button onClick={saveEdit} disabled={isSaving} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 700, color: accent, fontFamily: F, opacity: isSaving ? 0.5 : 1 }}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>

        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Avatar picker */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => fileRef.current?.click()}>
              <div style={{ width: 80, height: 80, borderRadius: 40, overflow: 'hidden', border: `2px solid ${bdr}` }}>
                {previewImg ? (
                  <img src={previewImg} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <UserAvatar name={name} profileImage={avatar} size="lg" />
                )}
              </div>
              <div style={{ position: 'absolute', bottom: 0, right: 0, width: 26, height: 26, borderRadius: 13, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `2px solid ${bg}` }}>
                {isUploadingImg
                  ? <div style={{ width: 10, height: 10, borderRadius: 5, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', animation: 'spin 0.6s linear infinite' }} />
                  : <Icon d={IC.camera} size={12} color="#fff" sw={2} />
                }
              </div>
            </div>
            <span style={{ fontSize: 13, color: muted }}>Tap to change photo</span>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
          </div>

          {/* Name */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Full Name</label>
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Your full name"
              style={{ width: '100%', height: 48, background: card, border: `1.5px solid ${editName.trim() ? accent : bdr}`, borderRadius: 12, padding: '0 14px', fontSize: 15, color: txt, fontFamily: F, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>

          {/* Phone */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: muted, textTransform: 'uppercase' as const, letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>Phone Number</label>
            <input
              value={editPhone}
              onChange={e => setEditPhone(e.target.value)}
              placeholder="Your phone number"
              type="tel"
              style={{ width: '100%', height: 48, background: card, border: `1.5px solid ${bdr}`, borderRadius: 12, padding: '0 14px', fontSize: 15, color: txt, fontFamily: F, outline: 'none', boxSizing: 'border-box' as const }}
            />
          </div>

          <p style={{ fontSize: 12, color: muted, lineHeight: 1.5, marginTop: -8 }}>
            To change your email or password, use the relevant options in the menu.
          </p>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Main profile screen ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100dvh', background: bg, fontFamily: F, paddingBottom: 'max(88px, calc(72px + env(safe-area-inset-bottom)))' }}>

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: hdrBg, borderBottom: `1px solid ${bdr}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 12px', paddingTop: 'max(14px, env(safe-area-inset-top, 14px))' }}>
        <span style={{ fontSize: 17, fontWeight: 700, color: txt }}>Profile</span>
        <button onClick={() => navigate('/notifications')} style={{ position: 'relative', width: 34, height: 34, borderRadius: 17, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', WebkitTapHighlightColor: 'transparent' }}>
          <Icon d={IC.bell} size={20} color={isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'} sw={1.8} />
          {notifCount > 0 && (
            <span style={{ position: 'absolute', top: 0, right: 0, width: 16, height: 16, borderRadius: 8, background: '#FF453A', fontSize: 9, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {notifCount > 9 ? '9+' : notifCount}
            </span>
          )}
        </button>
      </div>

      {/* Profile card */}
      <div style={{ margin: '12px 16px 0', borderRadius: 12, background: card, border: `1px solid ${bdr}`, overflow: 'hidden' }}>
        <div style={{ padding: '20px 16px 16px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
          <div style={{ width: 60, height: 60, borderRadius: 30, overflow: 'hidden', flexShrink: 0, border: `1.5px solid ${bdr}`, background: card }}>
            {avatar ? (
              <img
                src={avatar}
                alt={name}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            ) : (
              <UserAvatar name={name} profileImage={avatar} size="lg" className="h-full w-full" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <p style={{ fontSize: 17, fontWeight: 700, color: txt, lineHeight: 1.2 }}>{name}</p>
                <p style={{ fontSize: 13, color: muted, marginTop: 2 }}>{email}</p>
                {phone && <p style={{ fontSize: 13, color: muted }}>{phone}</p>}
                {isSeller && store?.name && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
                    <Icon d={IC.store} size={12} color={muted} sw={1.8} />
                    <span style={{ fontSize: 12, color: muted }}>{store.name}</span>
                  </div>
                )}
                {!isBuyer && ROLE_LABEL[role] && (
                  <span style={{ display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, color: accent, border: `1px solid ${accent}40`, borderRadius: 6, padding: '2px 7px' }}>
                    {ROLE_LABEL[role]}
                  </span>
                )}
              </div>
              <button
                onClick={openEdit}
                style={{ width: 32, height: 32, borderRadius: 8, background: 'none', border: `1px solid ${bdr}`, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}
              >
                <Icon d={IC.edit} size={15} color={muted} sw={1.8} />
              </button>
            </div>
          </div>
        </div>

        {/* Buyer quick stats */}
        {isBuyer && (
          <div style={{ display: 'flex', borderTop: `1px solid ${bdr}` }}>
            {[
              { val: (orders as any[]).length, lbl: 'Orders' },
              { val: (wishlist as any[]).length, lbl: 'Wishlist' },
              { val: activeOrders, lbl: 'Active' },
            ].map((s, i, arr) => (
              <div key={s.lbl} style={{ flex: 1, textAlign: 'center', padding: '12px 4px', borderRight: i < arr.length - 1 ? `1px solid ${bdr}` : undefined }}>
                <p style={{ fontSize: 18, fontWeight: 800, color: txt, lineHeight: 1 }}>{s.val}</p>
                <p style={{ fontSize: 11, color: muted, marginTop: 3 }}>{s.lbl}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Referral link */}
      {isBuyer && referralUrl && (
        <div style={{ margin: '10px 16px 0' }}>
          <button onClick={copyReferral} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${bdr}`, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', textAlign: 'left', fontFamily: F }}>
            <Icon d={IC.gift} size={18} color={muted} sw={1.8} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: txt, marginBottom: 1 }}>Referral Link</p>
              <p style={{ fontSize: 12, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{referralUrl}</p>
            </div>
            <Icon d={IC.copy} size={16} color={muted} sw={1.8} />
          </button>
        </div>
      )}

      {/* Buyer sections */}
      {isBuyer && (
        <>
          <Section title="Shopping" isDark={isDark}>
            <Row icon="bag" label="My Orders" sub={activeOrders > 0 ? `${activeOrders} active` : undefined} badge={activeOrders > 0 ? activeOrders : undefined} isDark={isDark} onClick={() => navigate('/orders')} />
            <Row icon="heart" label="Wishlist" sub={(wishlist as any[]).length > 0 ? `${(wishlist as any[]).length} saved` : undefined} isDark={isDark} onClick={() => navigate('/wishlist')} />
            {showBecomeSeller && (
              <Row icon="store" label="Become a Seller" sub="Open your own store" isDark={isDark} onClick={() => navigate('/become-seller')} />
            )}
            {showBecomeRider && (
              <Row icon="truck" label="Become a Rider" sub="Deliver and earn" isDark={isDark} onClick={() => navigate('/become-rider')} />
            )}
          </Section>
          <Section title="Account" isDark={isDark}>
            <Row icon="user" label="Edit Profile" isDark={isDark} onClick={openEdit} />
            <Row icon="star" label="Referral Programme" sub="Earn rewards for inviting friends" isDark={isDark} onClick={() => navigate('/referral')} />
            <Row icon="settings" label="Settings" isDark={isDark} onClick={() => navigate('/settings')} />
            <Row icon="lock" label="Change Password" isDark={isDark} onClick={() => navigate('/change-password')} />
            <Row icon="download" label="Download My Data" isDark={isDark} onClick={downloadMyData} />
          </Section>
        </>
      )}

      {/* Seller sections */}
      {isSeller && (
        <>
          <Section title="Store" isDark={isDark}>
            <Row icon="layout" label="Dashboard" isDark={isDark} onClick={() => navigate('/seller')} />
            <Row icon="package" label="Products" isDark={isDark} onClick={() => navigate('/seller/products')} />
            <Row icon="bag" label="Orders" badge={activeOrders > 0 ? activeOrders : undefined} isDark={isDark} onClick={() => navigate('/seller/orders')} />
            <Row icon="chart" label="Analytics" isDark={isDark} onClick={() => navigate('/seller/analytics')} />
            <Row icon="star" label="Reviews" isDark={isDark} onClick={() => navigate('/seller/reviews')} />
            <Row icon="tag" label="Promotions" isDark={isDark} onClick={() => navigate('/seller/promotions')} />
            <Row icon="wallet" label="Earnings & Payouts" isDark={isDark} onClick={() => navigate('/seller/payouts')} />
            <Row icon="settings" label="Store Settings" isDark={isDark} onClick={() => navigate('/seller/settings')} />
          </Section>
          <Section title="Account" isDark={isDark}>
            <Row icon="user" label="Edit Profile" isDark={isDark} onClick={openEdit} />
            <Row icon="lock" label="Change Password" isDark={isDark} onClick={() => navigate('/change-password')} />
            <Row icon="message" label="Support Messages" isDark={isDark} onClick={() => navigate('/seller/messages')} />
            <Row icon="download" label="Download My Data" isDark={isDark} onClick={downloadMyData} />
          </Section>
        </>
      )}

      {/* Rider sections */}
      {isRider && (
        <>
          <Section title="Rider Hub" isDark={isDark}>
            <Row icon="layout" label="Dashboard" isDark={isDark} onClick={() => navigate('/rider')} />
            <Row icon="truck" label="Deliveries" isDark={isDark} onClick={() => navigate('/rider/deliveries')} />
            <Row icon="chart" label="Earnings" isDark={isDark} onClick={() => navigate('/rider/earnings')} />
            <Row icon="message" label="Messages" isDark={isDark} onClick={() => navigate('/rider/messages')} />
            <Row icon="settings" label="Settings" isDark={isDark} onClick={() => navigate('/rider/settings')} />
          </Section>
          <Section title="Account" isDark={isDark}>
            <Row icon="user" label="Edit Profile" isDark={isDark} onClick={openEdit} />
            <Row icon="lock" label="Change Password" isDark={isDark} onClick={() => navigate('/change-password')} />
            <Row icon="download" label="Download My Data" isDark={isDark} onClick={downloadMyData} />
          </Section>
        </>
      )}

      {/* Admin sections */}
      {isAdmin && (
        <>
          <Section title="Administration" isDark={isDark}>
            <Row icon="layout" label="Admin Dashboard" isDark={isDark} onClick={() => navigate('/admin')} />
            <Row icon="bag" label="All Orders" isDark={isDark} onClick={() => navigate('/admin/orders')} />
            <Row icon="users" label="Users" isDark={isDark} onClick={() => navigate('/admin/users')} />
            <Row icon="store" label="Stores" isDark={isDark} onClick={() => navigate('/admin/stores')} />
            <Row icon="package" label="Products" isDark={isDark} onClick={() => navigate('/admin/products')} />
            <Row icon="chart" label="Analytics" isDark={isDark} onClick={() => navigate('/admin/analytics')} />
            <Row icon="wallet" label="Platform Earnings" isDark={isDark} onClick={() => navigate('/admin/platform-earnings')} />
            <Row icon="message" label="Messages" isDark={isDark} onClick={() => navigate('/admin/messages')} />
            <Row icon="settings" label="Platform Settings" isDark={isDark} onClick={() => navigate('/admin/settings')} />
          </Section>
          <Section title="Account" isDark={isDark}>
            <Row icon="user" label="Edit Profile" isDark={isDark} onClick={openEdit} />
            <Row icon="lock" label="Change Password" isDark={isDark} onClick={() => navigate('/change-password')} />
          </Section>
        </>
      )}

      {/* Agent / Pickup-agent sections */}
      {isAgent && (
        <>
          <Section title="Agent Hub" isDark={isDark}>
            <Row icon="bag" label="Orders" isDark={isDark} onClick={() => navigate('/pickup-agent')} />
            <Row icon="chart" label="Earnings" isDark={isDark} onClick={() => navigate('/pickup-agent/earnings')} />
            <Row icon="layout" label="Shift" isDark={isDark} onClick={() => navigate('/pickup-agent/shift')} />
          </Section>
          <Section title="Account" isDark={isDark}>
            <Row icon="user" label="Edit Profile" isDark={isDark} onClick={openEdit} />
            <Row icon="lock" label="Change Password" isDark={isDark} onClick={() => navigate('/change-password')} />
          </Section>
        </>
      )}

      {/* Support */}
      <Section title="Support" isDark={isDark}>
        <Row icon="bell" label="Notifications" badge={notifCount > 0 ? notifCount : undefined} isDark={isDark} onClick={() => navigate('/notifications')} />
        <Row icon="help" label="Help & Support" isDark={isDark} onClick={() => navigate('/support')} />
        <Row icon="external" label="App Version" right="1.0.0" isDark={isDark} />
      </Section>

      {/* Sign out */}
      <div style={{ margin: '8px 16px 24px' }}>
        <button
          onClick={handleLogout}
          style={{ width: '100%', height: 48, borderRadius: 12, background: 'none', border: `1px solid rgba(255,69,58,0.3)`, color: '#FF453A', fontSize: 15, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', WebkitTapHighlightColor: 'transparent', fontFamily: F }}
        >
          <Icon d={IC.logout} size={17} color="#FF453A" sw={1.8} />
          Sign Out
        </button>
      </div>
    </div>
  );
}
