import { useEffect, useState } from "react";
import { useIsDark } from "@/lib/theme";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { useToast } from "@/hooks/use-toast";
import { Copy, Check } from "lucide-react";
import { SubpageShell, SubpageLabel, SubpagePrimary, subpageColors, useSubpageDark } from "@/components/mobile/MobileSubpage";
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

/** Phone "Referral" (approved 28 Nov 2026): plain page, code + copy, share, counts, how it works. */
function MobileReferralPage({ stats }: { stats?: ReferralStats }) {
  const isDarkSub = useSubpageDark();
  const c = subpageColors(isDarkSub);
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const referralCode = stats?.referralCode ?? '';
  const referralLink = referralCode ? `${window.location.origin}/auth?ref=${referralCode}` : '';
  const completed = stats?.completed ?? 0;
  const pending = stats?.signedUp ?? 0;
  const total = completed + pending;
  const threshold = stats?.threshold ?? 0;

  const copyCode = () => {
    if (!referralCode) return;
    navigator.clipboard.writeText(referralCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const shareLink = async () => {
    if (!referralLink) return;
    try {
      if (navigator.share) { await navigator.share({ title: 'Join me on KiyuMart', url: referralLink }); return; }
    } catch { return; }
    await navigator.clipboard.writeText(referralLink).catch(() => {});
    toast({ title: 'Link copied', description: 'Paste it in a message to your friends.' });
  };

  const steps = [
    { t: 'Share your link', d: 'Copy your link and send it to friends.' },
    { t: 'They sign up', d: 'Your friend creates an account with your link.' },
    { t: 'They purchase', d: 'Their first purchase confirms your referral.' },
    { t: 'Earn rewards', d: threshold > 0 ? `Reach ${threshold} completed referrals and your reward unlocks.` : 'Reach the referral target and your reward unlocks.' },
  ];

  return (
    <SubpageShell title="Referral" isDark={isDarkSub} testId="mobile-referral">
      <div style={{ padding: '12px 24px 0', textAlign: 'center' }}>
        <div style={{ display: 'inline-grid', placeItems: 'center', width: 64, height: 64, borderRadius: 32, background: isDarkSub ? '#2C2C2E' : '#F2F2F2' }}>
          <Gift size={30} strokeWidth={1.6} color={c.ink} aria-hidden="true" />
        </div>
        <div style={{ marginTop: 12, fontSize: 22, fontWeight: 700 }}>Invite friends, earn rewards</div>
        <div style={{ marginTop: 6, fontSize: 14, color: c.soft }}>Share your link. Friends join. You earn.</div>
      </div>
      <SubpageLabel isDark={isDarkSub}>Your referral code</SubpageLabel>
      <div style={{ margin: '0 24px', display: 'flex', alignItems: 'center', gap: 10, height: 56, padding: '0 6px 0 16px', border: `1px dashed ${c.border}`, borderRadius: 12 }}>
        <span data-testid="text-referral-code" style={{ flex: 1, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>{referralCode || '—'}</span>
        <button onClick={copyCode} disabled={!referralCode} style={{ height: 40, padding: '0 14px', border: `1px solid ${c.border}`, borderRadius: 20, background: 'transparent', fontSize: 14, fontWeight: 600, color: c.ink, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'inherit' }}>
          {copied ? <Check size={16} strokeWidth={2.2} aria-hidden="true" /> : <Copy size={16} strokeWidth={1.9} aria-hidden="true" />}{copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <SubpagePrimary onClick={shareLink} disabled={!referralLink} top={14}>Share my link</SubpagePrimary>
      <SubpageLabel isDark={isDarkSub}>Your referrals</SubpageLabel>
      <div style={{ margin: '0 24px', display: 'flex', borderTop: `1px solid ${c.line}`, borderBottom: `1px solid ${c.line}` }}>
        {[['Total', total], ['Completed', completed], ['Pending', pending]].map(([label, value], i) => (
          <div key={String(label)} style={{ flex: 1, padding: '14px 0', textAlign: 'center', borderLeft: i ? `1px solid ${c.line}` : 'none' }}>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
            <div style={{ fontSize: 12, color: c.soft }}>{label}</div>
          </div>
        ))}
      </div>
      {threshold > 0 && (
        <p style={{ margin: '10px 24px 0', fontSize: 13, color: c.soft }}>
          {completed >= threshold ? 'Target reached — your reward is unlocked.' : `${completed} of ${threshold} completed referrals`}
        </p>
      )}
      <SubpageLabel isDark={isDarkSub}>How it works</SubpageLabel>
      <div style={{ padding: '0 24px' }}>
        {steps.map((st, i) => (
          <div key={st.t} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '10px 0' }}>
            <span style={{ width: 28, height: 28, borderRadius: 14, border: `1.5px solid ${c.ink}`, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
            <span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{st.t}</span>
              <span style={{ display: 'block', fontSize: 13, color: c.soft, marginTop: 2, lineHeight: 1.4 }}>{st.d}</span>
            </span>
          </div>
        ))}
      </div>
    </SubpageShell>
  );
}

function MobileReferralInactive() {
  const isDarkSub = useSubpageDark();
  const c = subpageColors(isDarkSub);
  return (
    <SubpageShell title="Referral" isDark={isDarkSub} testId="mobile-referral-inactive">
      <div style={{ textAlign: 'center', padding: '72px 32px' }}>
        <Gift size={40} strokeWidth={1.5} color={c.faint} aria-hidden="true" />
        <div style={{ marginTop: 12, fontSize: 17, fontWeight: 700 }}>Referral programme not active</div>
        <div style={{ marginTop: 6, fontSize: 14, color: c.soft }}>This feature isn't switched on right now.</div>
      </div>
    </SubpageShell>
  );
}

export default function ReferralPage() {
  const isDark = useIsDark();
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
    if (!referralEnabled) return <MobileReferralInactive />;
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
