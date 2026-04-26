import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, MapPin, PackageCheck, TrendingUp } from "lucide-react";

interface AgentStats {
  totalVerifications: number;
  verificationsToday: number;
  verificationsThisMonth: number;
  pendingOrders: number;
  zoneName: string | null;
  shift: { onShift: boolean; startedAt: string | null; verificationsThisShift: number } | null;
}

export default function PickupAgentEarnings() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "pickup_agent")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: stats, isLoading } = useQuery<AgentStats>({
    queryKey: ["/api/pickup-agent/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pickup-agent/stats");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "pickup_agent",
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  if (authLoading || !isAuthenticated || user?.role !== "pickup_agent") {
    return <PageLoadingState title="Loading performance stats" description="Fetching your verification activity." />;
  }

  return (
    <DashboardLayout role="pickup_agent">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Performance &amp; Activity</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your verification record across all pickup orders at your assigned station.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Zone info */}
            {stats?.zoneName && (
              <Card className="border-primary/20 bg-card/95">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <MapPin className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Your Assigned Pickup Station</p>
                    <p className="text-lg font-semibold">{stats.zoneName}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stats grid */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="border-l-4 border-l-emerald-500">
                <CardHeader className="pb-2">
                  <CardDescription>Total Verifications (All Time)</CardDescription>
                  <CardTitle className="text-3xl">{stats?.totalVerifications ?? 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Pickup orders you have successfully verified</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-primary">
                <CardHeader className="pb-2">
                  <CardDescription>Verifications Today</CardDescription>
                  <CardTitle className="text-3xl">{stats?.verificationsToday ?? 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Orders verified since midnight</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-blue-500">
                <CardHeader className="pb-2">
                  <CardDescription>This Month</CardDescription>
                  <CardTitle className="text-3xl">{stats?.verificationsThisMonth ?? 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Verifications in the current calendar month</p>
                </CardContent>
              </Card>

              <Card className="border-l-4 border-l-amber-500">
                <CardHeader className="pb-2">
                  <CardDescription>Pending at Station</CardDescription>
                  <CardTitle className="text-3xl">{stats?.pendingOrders ?? 0}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">Orders at your station awaiting customer pickup</p>
                </CardContent>
              </Card>
            </div>

            {/* Shift this session (if on shift) */}
            {stats?.shift?.onShift && (
              <Card className="border-emerald-500/30 bg-emerald-500/5">
                <CardContent className="flex items-center gap-4 p-5">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold">Current Shift Active</p>
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-xs">On Shift</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Started {stats.shift.startedAt ? new Date(stats.shift.startedAt).toLocaleTimeString() : "recently"} —{" "}
                      {stats.shift.verificationsThisShift} verification{stats.shift.verificationsThisShift !== 1 ? "s" : ""} this shift
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Explainer */}
            <Card className="border-border/60">
              <details>
                <summary className="cursor-pointer list-none px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold">Understanding Your Activity Stats</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Expand for a breakdown of what each number means</p>
                    </div>
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">Show / Hide</span>
                  </div>
                </summary>
                <CardContent className="pt-0">
                  <div className="grid gap-3 sm:grid-cols-2 mt-2">
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <PackageCheck className="h-4 w-4 text-emerald-500" />
                        <p className="text-sm font-medium">Total Verifications</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The total number of pickup orders you have verified at your station using QR scan or OTP since your account was activated.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="h-4 w-4 text-primary" />
                        <p className="text-sm font-medium">Verifications Today / This Month</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your activity within today's date and within the current calendar month respectively.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <p className="text-sm font-medium mb-1">Pending at Station</p>
                      <p className="text-xs text-muted-foreground">
                        Orders assigned to your pickup station that have not yet been collected. These are the orders visible in your Dashboard queue.
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                      <p className="text-sm font-medium mb-1">Shift Activity</p>
                      <p className="text-xs text-muted-foreground">
                        If shift tracking is enabled by your platform manager, you can track how many pickups you verified during a single shift session.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </details>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
