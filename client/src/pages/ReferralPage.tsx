import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import DashboardLayout from "@/components/DashboardLayout";
import ReferralTracker from "@/components/ReferralTracker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gift, Users, Star, CheckCircle, Clock } from "lucide-react";
import { PageLoadingState } from "@/components/ui/loading-state";

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

interface ReferralStats {
  referralCode: string;
  completed: number;
  signedUp: number;
  threshold: number;
  rewardPercent: number;
  rewardDurationHours: number;
}

function MobileReferralPage({ stats }: { stats?: ReferralStats }) {
  const isDark = useTheme();
  const [, navigate] = useLocation();
  const { primaryColor } = usePlatformSettings();
  const accent = primaryColor || '#22C55E';
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);

  const bg   = isDark ? '#111111' : '#F2F2F7';
  const card = isDark ? '#1C1C1E' : '#FFFFFF';
  const hdr  = isDark ? '#111111' : '#FFFFFF';
  const bdr  = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const txt  = isDark ? '#FFFFFF' : '#111111';
  const muted = isDark ? 'rgba(235,235,245,0.45)' : 'rgba(60,60,67,0.45)';
  const inp  = isDark ? '#2C2C2E' : '#EBEBF0';
  const divClr = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

  const referralCode = stats?.referralCode ?? '';
  const referralLink = referralCode
    ? `${window.location.origin}/auth?ref=${referralCode}`
    : '';

  const copyText = (text: string, type: 'code' | 'link') => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(type);
      setTimeout(() => setCopied(null), 2000);
    });
  };

  const total     = (stats?.completed ?? 0) + (stats?.signedUp ?? 0);
  const completed = stats?.completed ?? 0;
  const pending   = stats?.signedUp ?? 0;
  const threshold = stats?.threshold ?? 5;
  const progress  = Math.min(1, threshold > 0 ? completed / threshold : 0);

  const steps = [
    {
      icon: <><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></>,
      title: 'Share Your Link',
      desc: 'Copy your referral link and share it with friends on social media or via messaging.',
      color: '#3B82F6',
    },
    {
      icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
      title: 'They Sign Up',
      desc: 'Your friend creates their account using your referral link and starts shopping.',
      color: '#8B5CF6',
    },
    {
      icon: <><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></>,
      title: 'They Purchase',
      desc: 'When they make their first purchase, your referral is confirmed and counted.',
      color: '#F59E0B',
    },
    {
      icon: <path d="m12 3 3 6.5 7 .8-5 4.7 1.4 7L12 18.5 5.6 22 7 15l-5-4.7 7-.8z" fill="currentColor" stroke="none"/>,
      title: 'Earn Rewards',
      desc: `Reach ${threshold} completed referrals and your reward is automatically unlocked.`,
      color: '#22C55E',
    },
  ];

  return (
    <div style={{ background: bg, minHeight: '100dvh', fontFamily: F }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: hdr, borderBottom: `1px solid ${bdr}`,
        padding: '0 16px 12px',
        paddingTop: 'max(14px, env(safe-area-inset-top, 14px))',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, height: 44 }}>
          <button
            onClick={() => navigate(-1 as any)}
            style={{ width: 34, height: 34, borderRadius: 17, background: inp, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
          >
            <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={txt} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <span style={{ fontSize: 17, fontWeight: 700, color: txt }}>Referral Programme</span>
        </div>
      </div>

      <div style={{ padding: '16px 16px 120px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Hero card */}
        <div style={{
          background: `linear-gradient(135deg, ${accent}22 0%, ${accent}0a 100%)`,
          border: `1.5px solid ${accent}33`,
          borderRadius: 18, padding: '20px 18px',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `${accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={accent} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/>
              <path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/>
              <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
            </svg>
          </div>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: txt, lineHeight: 1.2 }}>Invite & Earn</p>
            <p style={{ fontSize: 13, color: muted, marginTop: 3, lineHeight: 1.4 }}>
              Share your link. Friends join. You earn rewards.
            </p>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[
              { label: 'Total', value: total, color: accent, icon: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></> },
              { label: 'Completed', value: completed, color: '#22C55E', icon: <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></> },
              { label: 'Pending', value: pending, color: '#F59E0B', icon: <><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
            ].map(s => (
              <div key={s.label} style={{ background: card, borderRadius: 14, padding: '14px 12px', textAlign: 'center', border: `1px solid ${bdr}` }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px' }}>
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg>
                </div>
                <p style={{ fontSize: 22, fontWeight: 800, color: txt, lineHeight: 1 }}>{s.value}</p>
                <p style={{ fontSize: 10, color: muted, marginTop: 4, fontWeight: 500 }}>{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Progress towards threshold */}
        {stats && threshold > 0 && (
          <div style={{ background: card, borderRadius: 16, padding: '16px', border: `1px solid ${bdr}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: txt }}>Reward Progress</p>
              <p style={{ fontSize: 12, color: muted, fontWeight: 600 }}>{completed} / {threshold}</p>
            </div>
            <div style={{ height: 8, background: isDark ? '#2C2C2E' : '#E5E5EA', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress * 100}%`, background: accent, borderRadius: 4, transition: 'width 0.6s ease' }} />
            </div>
            <p style={{ fontSize: 12, color: muted, marginTop: 8 }}>
              {completed >= threshold
                ? 'Reward threshold reached! Claim your reward below.'
                : `${threshold - completed} more completed referral${threshold - completed !== 1 ? 's' : ''} needed`}
            </p>
          </div>
        )}

        {/* Referral code + link */}
        {referralCode && (
          <div style={{ background: card, borderRadius: 16, border: `1px solid ${bdr}`, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', borderBottom: `1px solid ${divClr}` }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Your Referral Code</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontFamily: 'monospace', fontSize: 22, fontWeight: 900, color: accent, letterSpacing: 3 }}>{referralCode}</span>
                <button
                  onClick={() => copyText(referralCode, 'code')}
                  style={{ height: 36, padding: '0 14px', borderRadius: 10, background: copied === 'code' ? '#22C55E' : `${accent}20`, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={copied === 'code' ? '#fff' : accent} strokeWidth={2} strokeLinecap="round">
                    {copied === 'code'
                      ? <polyline points="20 6 9 17 4 12"/>
                      : <><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></>}
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 700, color: copied === 'code' ? '#fff' : accent }}>
                    {copied === 'code' ? 'Copied!' : 'Copy'}
                  </span>
                </button>
              </div>
            </div>
            <div style={{ padding: '14px 16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Referral Link</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ flex: 1, fontSize: 12, color: muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{referralLink}</span>
                <button
                  onClick={() => copyText(referralLink, 'link')}
                  style={{ height: 36, padding: '0 14px', borderRadius: 10, background: copied === 'link' ? '#22C55E' : `${accent}20`, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, WebkitTapHighlightColor: 'transparent' }}
                >
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={copied === 'link' ? '#fff' : accent} strokeWidth={2} strokeLinecap="round">
                    {copied === 'link'
                      ? <polyline points="20 6 9 17 4 12"/>
                      : <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>}
                  </svg>
                  <span style={{ fontSize: 13, fontWeight: 700, color: copied === 'link' ? '#fff' : accent }}>
                    {copied === 'link' ? 'Copied!' : 'Copy Link'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* How it works */}
        <div style={{ background: card, borderRadius: 16, border: `1px solid ${bdr}`, overflow: 'hidden' }}>
          <div style={{ padding: '14px 16px 4px', borderBottom: `1px solid ${divClr}` }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: txt }}>How It Works</p>
          </div>
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '14px 16px', borderBottom: i < steps.length - 1 ? `1px solid ${divClr}` : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${step.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={step.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{step.icon}</svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 9, background: `${step.color}22`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: step.color }}>{i + 1}</span>
                  <p style={{ fontSize: 14, fontWeight: 700, color: txt }}>{step.title}</p>
                </div>
                <p style={{ fontSize: 12, color: muted, marginTop: 4, lineHeight: 1.5 }}>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

export default function ReferralPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { referralEnabled } = usePlatformSettings();
  const { isMobile, isTablet } = useMobileDevice();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate]);

  const role = user?.role ?? "buyer";

  const { data: referralStats } = useQuery<ReferralStats>({
    queryKey: ["/api/referral/stats"],
    queryFn: () => fetch("/api/referral/stats", { credentials: "include" }).then((r) => r.ok ? r.json() : null),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const layoutRole =
    role === "agent" ? "agent" :
    role === "seller" ? "seller" :
    role === "rider" ? "rider" :
    "buyer";

  if (authLoading || !isAuthenticated) {
    return <PageLoadingState title="Loading referral programme" description="Fetching your referral details." />;
  }

  if (isMobile || isTablet) {
    if (!referralEnabled) {
      return (
        <div style={{ minHeight: '100dvh', background: '#111', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, fontFamily: F, padding: 24 }}>
          <svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeLinecap="round">
            <path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/>
          </svg>
          <p style={{ fontSize: 17, fontWeight: 700, color: '#fff', textAlign: 'center' }}>Referral Programme Not Active</p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>This feature is not currently enabled.</p>
        </div>
      );
    }
    return <MobileReferralPage stats={referralStats} />;
  }

  if (!referralEnabled) {
    return (
      <DashboardLayout role={layoutRole as any}>
        <div className="p-6 flex items-center justify-center min-h-[60vh]">
          <Card className="max-w-md w-full text-center">
            <CardContent className="py-12">
              <Gift className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">Referral Programme Not Active</h3>
              <p className="text-sm text-muted-foreground mt-2">The referral programme is not currently enabled on this platform.</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={layoutRole as any}>
      <div className="p-6 space-y-6">
        <Card className="relative overflow-hidden rounded-2xl border border-border bg-card dark:border-emerald-500/30 dark:bg-[linear-gradient(90deg,rgba(6,78,59,0.42)_0%,rgba(2,6,23,0.98)_48%,rgba(8,47,73,0.48)_100%)] dark:text-white">
          <div className="pointer-events-none absolute inset-0 hidden dark:block dark:bg-[radial-gradient(circle_at_18%_50%,rgba(16,185,129,0.14),transparent_40%)]" />
          <CardContent className="relative p-5">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 dark:bg-white/20">
                <Gift className="h-6 w-6 text-primary dark:text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold dark:text-white">Referral Programme</h1>
                <p className="text-sm text-muted-foreground dark:text-white/80">
                  Invite friends and earn rewards for every successful referral.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Users className="h-4 w-4" /> How It Works</CardDescription>
              <CardTitle className="text-base">Step 1: Share</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Copy your referral link and share it with friends, family, or on social media.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Users className="h-4 w-4" /> Step 2: They Sign Up</CardDescription>
              <CardTitle className="text-base">Step 2: They Join</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              When your friend signs up using your link, they are linked to your referral. They also get a chance to earn a discount by inviting others.
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Star className="h-4 w-4" /> Step 3: Earn</CardDescription>
              <CardTitle className="text-base">Step 3: Earn Rewards</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              When they make their first purchase, your referral is counted. Reach the threshold and claim your reward automatically.
            </CardContent>
          </Card>
        </div>

        {referralStats && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{(referralStats.completed ?? 0) + (referralStats.signedUp ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">Total Referrals Made</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <CheckCircle className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats.completed ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Completed (Made a Purchase)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <Clock className="h-5 w-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{referralStats.signedUp ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Signed Up (Awaiting Purchase)</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        <ReferralTracker />
      </div>
    </DashboardLayout>
  );
}
