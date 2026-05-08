import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import ReferralTracker from "@/components/ReferralTracker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Gift, Users, Star, CheckCircle, Clock } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { PageLoadingState } from "@/components/ui/loading-state";

export default function ReferralPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { referralEnabled } = usePlatformSettings();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/auth");
  }, [authLoading, isAuthenticated, navigate]);

  const role = user?.role ?? "buyer";

  const { data: referralStats } = useQuery<{ completed: number; signedUp: number; threshold: number }>({
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
