import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Clock, Loader2, PlayCircle, StopCircle, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface ShiftData {
  onShift: boolean;
  startedAt: string | null;
  verificationsThisShift: number;
  summary?: { startedAt: string; endedAt: string; verificationsThisShift: number };
}

export default function PickupAgentShift() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "pickup_agent")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const hasShiftFeature = (user as any)?.roleFeatures?.["shifts.manage"] !== false;

  const { data: shift, isLoading } = useQuery<ShiftData>({
    queryKey: ["/api/pickup-agent/shift"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pickup-agent/shift");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "pickup_agent" && hasShiftFeature,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pickup-agent/shift/start");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/shift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/stats"] });
      toast({ title: "Shift started", description: "Your shift is now active. Good luck today!" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to start shift.", variant: "destructive" });
    },
  });

  const endMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pickup-agent/shift/end");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/shift"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/stats"] });
      const summary = data?.summary;
      toast({
        title: "Shift ended",
        description: summary
          ? `Shift complete — ${summary.verificationsThisShift} verification${summary.verificationsThisShift !== 1 ? "s" : ""} recorded.`
          : "Your shift has been closed.",
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to end shift.", variant: "destructive" });
    },
  });

  if (authLoading || !isAuthenticated || user?.role !== "pickup_agent") {
    return <PageLoadingState title="Loading shift management" description="Checking your shift permissions." />;
  }

  if (!hasShiftFeature) {
    return (
      <DashboardLayout role="pickup_agent">
        <div className="p-6">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="py-12 text-center space-y-3">
              <ShieldAlert className="h-12 w-12 mx-auto text-amber-500" />
              <h2 className="text-lg font-semibold">Shift Tracking Not Enabled</h2>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Shift management is an optional feature that must be enabled by your platform manager. Contact support if you believe this should be active for your account.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="pickup_agent">
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Shift Management</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Start and end your shifts to track verification activity per session.
          </p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Current shift status */}
            <Card className={shift?.onShift ? "border-emerald-500/30 bg-emerald-500/5" : "border-border/70"}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Current Shift Status</CardTitle>
                    <CardDescription>
                      {shift?.onShift ? "You are currently on shift" : "You are not currently on shift"}
                    </CardDescription>
                  </div>
                  <Badge className={shift?.onShift ? "bg-emerald-600 text-white hover:bg-emerald-600" : "bg-muted text-muted-foreground"}>
                    {shift?.onShift ? "On Shift" : "Off Shift"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {shift?.onShift ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border/50 bg-card p-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">Shift Started</p>
                        </div>
                        <p className="font-semibold">
                          {shift.startedAt ? new Date(shift.startedAt).toLocaleTimeString() : "Unknown"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {shift.startedAt ? formatDistanceToNow(new Date(shift.startedAt), { addSuffix: true }) : ""}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-card p-4">
                        <p className="text-sm text-muted-foreground mb-1">Verifications This Shift</p>
                        <p className="text-2xl font-bold">{shift.verificationsThisShift}</p>
                        <p className="text-xs text-muted-foreground">pickup orders verified</p>
                      </div>
                    </div>
                    <Button
                      onClick={() => endMutation.mutate()}
                      disabled={endMutation.isPending}
                      variant="destructive"
                      className="gap-2"
                    >
                      {endMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                      End Shift
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Start your shift when you arrive at the pickup station. Your verification count will be tracked for this session.
                    </p>
                    <Button
                      onClick={() => startMutation.mutate()}
                      disabled={startMutation.isPending}
                      className="gap-2"
                    >
                      {startMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                      Start Shift
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Info card */}
            <Card className="border-border/60">
              <CardHeader>
                <CardTitle className="text-base">About Shift Tracking</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  Shift tracking lets you record exactly how many pickup verifications you complete during a single working session.
                </p>
                <p>
                  When you start a shift, a timer begins and verifications are counted. When you end your shift, the session summary is saved.
                </p>
                <p className="text-xs italic">
                  Note: Shift data is session-based and resets if the server restarts. Your all-time verification totals are always preserved on the Performance page.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
