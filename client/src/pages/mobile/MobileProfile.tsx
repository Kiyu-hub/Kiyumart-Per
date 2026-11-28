import { useEffect, useState, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useHaptic } from "@/hooks/useHaptic";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/UserAvatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { MobileSubpageHeader } from "@/components/mobile/MobileSubpage";
import { User as UserIcon, Lock, Settings as SettingsIcon, ShoppingBag, Heart, Bell, Gift, Lightbulb, Headphones, Download, LogOut, Camera, ChevronRight, type LucideIcon } from "lucide-react";

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

// ── Plain list (approved 28 Nov 2026): desktop lucide icons, no coloured
//    backgrounds, no cards — one profile for every role. Role tools live behind
//    the bottom bar's middle button, as on desktop.
function PlainRow({ icon: IconC, label, right, onClick, isDark, last }: {
  icon: LucideIcon; label: string; right?: string | number; onClick?: () => void; isDark: boolean; last?: boolean;
}) {
  const ink = isDark ? '#FFFFFF' : '#1A1A1A';
  const line = isDark ? 'rgba(255,255,255,0.08)' : '#EFEFEF';
  return (
    <button onClick={onClick} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, height: 56, padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: ink, fontFamily: F, WebkitTapHighlightColor: 'transparent' }}>
      <IconC size={22} strokeWidth={1.75} color={ink} aria-hidden="true" />
      <span style={{ flex: 1, height: 56, display: 'flex', alignItems: 'center', gap: 8, borderBottom: last ? 'none' : `1px solid ${line}` }}>
        <span style={{ flex: 1, fontSize: 16 }}>{label}</span>
        {right !== undefined && right !== '' && right !== 0 && <span style={{ fontSize: 14, color: isDark ? 'rgba(235,235,245,0.55)' : '#8A8A8A' }}>{right}</span>}
        <ChevronRight size={18} strokeWidth={2} color={isDark ? 'rgba(255,255,255,0.3)' : '#B5B5B5'} aria-hidden="true" />
      </span>
    </button>
  );
}

function PlainGroup({ title, isDark, children }: { title: string; isDark: boolean; children: React.ReactNode }) {
  return (
    <>
      <p style={{ padding: '28px 24px 4px', margin: 0, fontSize: 13, fontWeight: 600, color: isDark ? 'rgba(235,235,245,0.55)' : '#8A8A8A', fontFamily: F }}>{title}</p>
      <div style={{ padding: '0 24px' }}>{children}</div>
    </>
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
  // Full profile (includes address) for Personal information.
  const { data: fullProfile } = useQuery<any>({ queryKey: ['/api/profile'], enabled: !!user });
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
  const [editAddress, setEditAddress]   = useState('');
  const [editImage, setEditImage]       = useState('');
  const [previewImg, setPreviewImg]     = useState('');
  const [isUploadingImg, setIsUploadingImg] = useState(false);
  const [isSaving, setIsSaving]         = useState(false);

  const openEdit = () => {
    setEditName(profile?.name || user?.name || '');
    setEditPhone(fullProfile?.phone || profile?.phone || '');
    setEditAddress(fullProfile?.businessAddress || '');
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
      const body: Record<string, string> = { name: editName.trim(), phone: editPhone.trim(), businessAddress: editAddress.trim() };
      if (editImage) body.profileImage = editImage;
      // Same endpoint the desktop profile uses (PATCH /api/profile).
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Save failed');
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
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
    const ink = isDark ? '#FFFFFF' : '#1A1A1A';
    return (
      <div data-testid="profile-guest" style={{ minHeight: '100dvh', background: isDark ? '#111111' : '#FFFFFF', color: ink, fontFamily: F, paddingBottom: 'max(96px, calc(80px + env(safe-area-inset-bottom)))' }}>
        <div style={{ padding: '20px 24px 0', paddingTop: 'max(20px, env(safe-area-inset-top, 20px))', fontSize: 17, fontWeight: 700, textAlign: 'center' }}>Profile</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 24px 8px', textAlign: 'center' }}>
          <div style={{ width: 92, height: 92, borderRadius: 46, background: isDark ? '#2C2C2E' : '#F2F2F2', display: 'grid', placeItems: 'center' }}>
            <UserIcon size={40} strokeWidth={1.5} color={isDark ? 'rgba(235,235,245,0.55)' : '#8A8A8A'} aria-hidden="true" />
          </div>
          <div style={{ marginTop: 16, fontSize: 22, fontWeight: 700 }}>Welcome to KiyuMart</div>
          <div style={{ marginTop: 6, fontSize: 14, color: isDark ? 'rgba(235,235,245,0.6)' : '#6B6B6B', lineHeight: 1.5 }}>Sign in to see your orders, wishlist and messages.</div>
          <button onClick={() => navigate('/auth')} style={{ marginTop: 20, width: '100%', height: 50, borderRadius: 25, border: 0, background: '#00796B', color: '#FFFFFF', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F }}>Sign in</button>
          <button onClick={() => navigate('/auth?mode=signup')} style={{ marginTop: 10, width: '100%', height: 50, borderRadius: 25, border: '1px solid #00796B', background: 'transparent', color: isDark ? '#4DB6AC' : '#00796B', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: F }}>Create account</button>
        </div>
        <PlainGroup title="Help" isDark={isDark}>
          <PlainRow icon={Headphones} label="Support" onClick={() => navigate('/support')} isDark={isDark} last />
        </PlainGroup>
        <p style={{ padding: '24px 24px 0', margin: 0, fontSize: 12, color: isDark ? 'rgba(235,235,245,0.4)' : '#A3A3A3', textAlign: 'center' }}>KiyuMart · Version 1.0.0</p>
      </div>
    );
  }

  // ── Personal information (approved 28 Nov 2026) ─────────────────────────────
  if (isEditing) {
    const ink = isDark ? '#FFFFFF' : '#1A1A1A';
    const soft = isDark ? 'rgba(235,235,245,0.6)' : '#8A8A8A';
    const fieldBorder = isDark ? 'rgba(255,255,255,0.18)' : '#D6D6D6';
    const fieldStyle = (readOnly = false) => ({ width: '100%', boxSizing: 'border-box' as const, height: 48, border: `1px solid ${fieldBorder}`, borderRadius: 12, padding: '0 14px', fontSize: 16, color: readOnly ? soft : ink, background: readOnly ? (isDark ? '#1C1C1E' : '#F7F7F7') : (isDark ? '#111111' : '#FFFFFF'), fontFamily: F, outline: 'none' });
    const labelStyle = { display: 'flex', flexDirection: 'column' as const, gap: 6, fontSize: 14, fontWeight: 600, color: ink };
    return (
      <div data-testid="profile-personal-info" style={{ minHeight: '100dvh', background: isDark ? '#111111' : '#FFFFFF', color: ink, fontFamily: F, paddingBottom: 40 }}>
        <MobileSubpageHeader title="Personal information" onBack={() => setIsEditing(false)} isDark={isDark} />
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 24px 4px' }}>
          <button onClick={() => fileRef.current?.click()} aria-label="Change profile photo" style={{ position: 'relative', border: 0, padding: 0, background: 'none', cursor: 'pointer' }}>
            <div style={{ width: 92, height: 92, borderRadius: 46, overflow: 'hidden', background: isDark ? '#2C2C2E' : '#F2F2F2' }}>
              {previewImg ? <img src={previewImg} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <UserAvatar name={name} profileImage={avatar} size="lg" className="h-full w-full" />}
            </div>
            <span style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#E2E2E2'}`, background: isDark ? '#1C1C1E' : '#FFFFFF', display: 'grid', placeItems: 'center' }}>
              {isUploadingImg
                ? <span style={{ width: 12, height: 12, borderRadius: 6, border: '2px solid rgba(0,0,0,0.15)', borderTopColor: '#00796B', animation: 'spin 0.6s linear infinite' }} />
                : <Camera size={16} strokeWidth={1.9} color={ink} aria-hidden="true" />}
            </span>
          </button>
          <button onClick={() => fileRef.current?.click()} style={{ marginTop: 10, border: 0, background: 'transparent', color: isDark ? '#4DB6AC' : '#00796B', fontSize: 14, fontWeight: 600, padding: 8, cursor: 'pointer', fontFamily: F }}>Change photo</button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handleImagePick} style={{ display: 'none' }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 24px 0' }}>
          <label style={labelStyle}>Full name
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Your full name" autoComplete="name" style={fieldStyle()} />
          </label>
          <label style={labelStyle}>Email
            <input value={email} readOnly style={fieldStyle(true)} />
            <span style={{ fontSize: 12, color: soft, fontWeight: 400 }}>To change your email, contact Support.</span>
          </label>
          <label style={labelStyle}>Phone number
            <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Your phone number" type="tel" autoComplete="tel" style={fieldStyle()} />
          </label>
          <label style={labelStyle}>Address / location
            <input value={editAddress} onChange={e => setEditAddress(e.target.value)} placeholder="e.g. East Legon, Accra" autoComplete="street-address" style={fieldStyle()} />
            <span style={{ fontSize: 12, color: soft, fontWeight: 400 }}>Used to fill in your delivery details at checkout.</span>
          </label>
        </div>
        <div style={{ padding: '28px 24px 0' }}>
          <button onClick={saveEdit} disabled={isSaving || isUploadingImg} style={{ width: '100%', height: 52, border: 0, borderRadius: 26, background: '#00796B', color: '#FFFFFF', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: F, opacity: isSaving || isUploadingImg ? 0.6 : 1 }}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Main profile screen (same for every role) ─────────────────────────────────
  const ink = isDark ? '#FFFFFF' : '#1A1A1A';
  const soft = isDark ? 'rgba(235,235,245,0.6)' : '#6B6B6B';
  const line = isDark ? 'rgba(255,255,255,0.08)' : '#EFEFEF';
  return (
    <div data-testid="profile-page" style={{ minHeight: '100dvh', background: isDark ? '#111111' : '#FFFFFF', color: ink, fontFamily: F, paddingBottom: 'max(96px, calc(80px + env(safe-area-inset-bottom)))' }}>
      <div style={{ padding: '20px 24px 0', paddingTop: 'max(20px, env(safe-area-inset-top, 20px))', fontSize: 17, fontWeight: 700, textAlign: 'center' }}>Profile</div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 24px 8px', textAlign: 'center' }}>
        <div style={{ position: 'relative' }}>
          <div style={{ width: 92, height: 92, borderRadius: 46, overflow: 'hidden', background: isDark ? '#2C2C2E' : '#F2F2F2' }}>
            {avatar ? (
              <img src={avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            ) : (
              <UserAvatar name={name} profileImage={avatar} size="lg" className="h-full w-full" />
            )}
          </div>
          <button aria-label="Change profile photo" onClick={openEdit} style={{ position: 'absolute', right: 0, bottom: 0, width: 32, height: 32, borderRadius: 16, border: `1px solid ${isDark ? 'rgba(255,255,255,0.15)' : '#E2E2E2'}`, background: isDark ? '#1C1C1E' : '#FFFFFF', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
            <Camera size={16} strokeWidth={1.9} color={ink} aria-hidden="true" />
          </button>
        </div>
        <div data-testid="text-profile-name" style={{ marginTop: 14, fontSize: 22, fontWeight: 700, letterSpacing: -0.2 }}>{name}</div>
        {email && <div style={{ marginTop: 4, fontSize: 14, color: soft }}>{email}</div>}
        <button onClick={openEdit} style={{ marginTop: 16, height: 40, padding: '0 22px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : '#D6D6D6'}`, borderRadius: 20, background: 'transparent', fontSize: 14, fontWeight: 600, color: ink, cursor: 'pointer', fontFamily: F }}>
          Edit profile
        </button>
      </div>

      <PlainGroup title="Account" isDark={isDark}>
        <PlainRow icon={UserIcon} label="Personal information" onClick={openEdit} isDark={isDark} />
        <PlainRow icon={Lock} label="Change password" onClick={() => navigate('/change-password')} isDark={isDark} />
        <PlainRow icon={SettingsIcon} label="Settings" onClick={() => navigate('/settings')} isDark={isDark} last />
      </PlainGroup>

      <PlainGroup title="Activity" isDark={isDark}>
        <PlainRow icon={ShoppingBag} label="My orders" onClick={() => navigate('/orders')} isDark={isDark} />
        <PlainRow icon={Heart} label="Wishlist" onClick={() => navigate('/wishlist')} isDark={isDark} />
        <PlainRow icon={Bell} label="Notifications" right={notifCount > 99 ? '99+' : notifCount} onClick={() => navigate('/notifications')} isDark={isDark} last />
      </PlainGroup>

      <PlainGroup title="More" isDark={isDark}>
        <PlainRow icon={Gift} label="Referral" onClick={() => navigate('/referral')} isDark={isDark} />
        <PlainRow icon={Lightbulb} label="Suggestions" onClick={() => navigate('/suggestions')} isDark={isDark} />
        <PlainRow icon={Headphones} label="Support" onClick={() => navigate('/support')} isDark={isDark} />
        <PlainRow icon={Download} label="Download my data" onClick={downloadMyData} isDark={isDark} last />
      </PlainGroup>

      <div style={{ padding: '24px 24px 0' }}>
        <button data-testid="button-logout" onClick={handleLogout} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 16, height: 56, padding: 0, border: 0, borderTop: `1px solid ${line}`, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: '#D93025', fontFamily: F }}>
          <LogOut size={22} strokeWidth={1.75} color="#D93025" aria-hidden="true" />
          <span style={{ fontSize: 16, fontWeight: 600 }}>Log out</span>
        </button>
      </div>
      <p style={{ padding: '12px 24px 0', margin: 0, fontSize: 12, color: isDark ? 'rgba(235,235,245,0.4)' : '#A3A3A3', textAlign: 'center' }}>KiyuMart · Version 1.0.0</p>
    </div>
  );
}
