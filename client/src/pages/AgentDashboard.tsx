import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  ArrowRight, Clock3, Loader2, Ticket,
  Users, MessageSquare, AlertTriangle, BarChart3, Flag,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Conversation = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  agentId: string | null;
  status: "open" | "assigned" | "resolved";
  subject: string;
  lastMessage: string;
  firstResponseAt: string | null;
  updatedAt: string;
  createdAt: string;
};

type SupportAnalytics = {
  totals?: { total?: number; open?: number; assigned?: number; resolved?: number; unresolved?: number };
  responseTime?: { avgFirstResponseSeconds?: number };
};

function badgeVariant(status: Conversation["status"]): "default" | "secondary" | "outline" {
  if (status === "resolved") return "default";
  if (status === "assigned") return "secondary";
  return "outline";
}

function statusColor(status: Conversation["status"]) {
  if (status === "resolved") return "bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-300 dark:border-emerald-500/30";
  if (status === "assigned") return "bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-300 dark:border-blue-500/30";
  return "bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-300 dark:border-amber-500/30";
}

function isUrgent(conv: Conversation): boolean {
  const now = Date.now();
  const created = new Date(conv.createdAt).getTime();
  const ageMs = now - created;
  const thirtyMin = 30 * 60 * 1000;
  return ageMs > thirtyMin && !conv.firstResponseAt && conv.status !== "resolved";
}

export default function AgentDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTitle, setReportTitle] = useState("");
  const [reportDetails, setReportDetails] = useState("");

  const reportCaseMutation = useMutation({
    mutationFn: async (data: { title: string; details: string }) => {
      const res = await apiRequest("POST", "/api/support/conversations", {
        subject: `[Agent Report] ${data.title}`,
        message: data.details,
        category: "agent_report",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Case reported", description: "Your report has been submitted to the admin team." });
      setShowReportModal(false);
      setReportTitle("");
      setReportDetails("");
    },
    onError: () => {
      toast({ title: "Failed to submit report", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) navigate("/");
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: allConversations = [], isLoading: convLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      const r = await apiRequest("GET", "/api/support/conversations");
      return r.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 5000,
  });

  const { data: supportAnalytics } = useQuery<SupportAnalytics>({
    queryKey: ["/api/support/analytics"],
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 15000,
  });

  const { data: unreadNotificationData } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 30000,
  });

  const myConversations = useMemo(
    () => allConversations.filter((c) => c.agentId === user?.id || c.agentId === null),
    [allConversations, user?.id]
  );

  const metrics = useMemo(() => {
    const myAssigned = myConversations.filter((c) => c.agentId === user?.id);
    const myResolved = myAssigned.filter((c) => c.status === "resolved");
    const myOpen = myAssigned.filter((c) => c.status === "open" || c.status === "assigned");
    const urgentTickets = myConversations.filter(isUrgent);
    const avgResponseSec = Number(supportAnalytics?.responseTime?.avgFirstResponseSeconds || 0);
    const resolutionRate = myAssigned.length ? (myResolved.length / myAssigned.length) * 100 : 0;

    return {
      myOpenCount: myOpen.length,
      myResolvedCount: myResolved.length,
      myTotalCount: myAssigned.length,
      urgentCount: urgentTickets.length,
      avgResponseMins: avgResponseSec / 60,
      resolutionRate,
      unassigned: allConversations.filter((c) => !c.agentId && c.status !== "resolved").length,
    };
  }, [myConversations, allConversations, supportAnalytics, user?.id]);

  const recentTickets = useMemo(
    () =>
      [...myConversations]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 8),
    [myConversations]
  );

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
    <Dialog open={showReportModal} onOpenChange={setShowReportModal}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-red-500" />
            Report a Case
          </DialogTitle>
          <DialogDescription>
            Submit an escalation or case report to the admin team.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <label className="text-sm font-medium mb-1 block">Case Title</label>
            <Input
              placeholder="Brief title of the issue..."
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Details</label>
            <Textarea
              placeholder="Describe the issue, customer affected, and any relevant context..."
              value={reportDetails}
              onChange={(e) => setReportDetails(e.target.value)}
              rows={4}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              className="flex-1"
              disabled={!reportTitle.trim() || !reportDetails.trim() || reportCaseMutation.isPending}
              onClick={() => reportCaseMutation.mutate({ title: reportTitle.trim(), details: reportDetails.trim() })}
            >
              {reportCaseMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit Report
            </Button>
            <Button variant="outline" onClick={() => setShowReportModal(false)}>Cancel</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <DashboardLayout role="agent">
      <div className="p-4 md:p-6 space-y-5">
        {/* Welcome Banner */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Welcome back</p>
                <h1 className="text-xl font-bold text-foreground">{user?.name || "Customer Agent"}</h1>
                <p className="text-muted-foreground text-sm mt-1">Your personal support performance dashboard.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge variant="secondary">
                    {metrics.myOpenCount} active ticket{metrics.myOpenCount !== 1 ? "s" : ""}
                  </Badge>
                  {metrics.urgentCount > 0 && (
                    <Badge variant="destructive">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      {metrics.urgentCount} need{metrics.urgentCount === 1 ? "s" : ""} attention
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate("/agent/tickets")}>
                  <Ticket className="h-4 w-4 mr-2" />
                  Open Tickets
                </Button>
                <Button variant="outline" onClick={() => navigate("/agent/customers")}>
                  <Users className="h-4 w-4 mr-2" />
                  Customers
                </Button>
                <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10" onClick={() => setShowReportModal(true)}>
                  <Flag className="h-4 w-4 mr-2" />
                  Report a Case
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metrics Cards — agent-specific only */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardDescription className="text-xs">My Active Cases</CardDescription>
              <CardTitle className="text-2xl text-blue-600 dark:text-blue-400">{metrics.myOpenCount}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs text-muted-foreground">
              Assigned to me — open or ongoing
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardDescription className="text-xs">My Resolved</CardDescription>
              <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">{metrics.myResolvedCount}</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs text-muted-foreground">
              Tickets I have closed
            </CardContent>
          </Card>

          <Card className={`border-l-4 ${metrics.urgentCount > 0 ? "border-l-red-500" : "border-l-amber-400"}`}>
            <CardHeader className="pb-1 pt-3 px-4">
              <CardDescription className="text-xs flex items-center gap-1">
                {metrics.urgentCount > 0 && <AlertTriangle className="h-3 w-3 text-red-500" />}
                Urgent (30+ min)
              </CardDescription>
              <CardTitle className={`text-2xl ${metrics.urgentCount > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                {metrics.urgentCount}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs text-muted-foreground">
              Unanswered tickets over 30 min old
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardDescription className="text-xs">Avg. Response</CardDescription>
              <CardTitle className="text-2xl text-purple-600 dark:text-purple-400">
                {metrics.avgResponseMins < 1 ? "<1" : metrics.avgResponseMins.toFixed(1)} min
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs text-muted-foreground">
              Average first reply time
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-teal-500">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardDescription className="text-xs">Resolution Rate</CardDescription>
              <CardTitle className="text-2xl text-teal-600 dark:text-teal-400">
                {metrics.resolutionRate.toFixed(0)}%
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3 text-xs text-muted-foreground">
              My resolved vs. my total tickets
            </CardContent>
          </Card>
        </div>

        {/* Workload summary */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                My Workload Summary
              </CardTitle>
              <CardDescription className="text-xs">Overview of your current queue and activity</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5 text-sm">
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <span className="text-muted-foreground">Active cases assigned to me</span>
                <span className="font-semibold text-blue-600">{metrics.myOpenCount}</span>
              </div>
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <span className="text-muted-foreground">Unread alerts</span>
                <span className="font-semibold">{unreadNotificationData?.count || 0}</span>
              </div>
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <span className="text-muted-foreground">Tickets resolved by me</span>
                <span className="font-semibold text-emerald-600">{metrics.myResolvedCount}</span>
              </div>
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <span className="text-muted-foreground">Unassigned tickets (queue)</span>
                <span className="font-semibold text-amber-600">{metrics.unassigned}</span>
              </div>
            </CardContent>
          </Card>

          {metrics.urgentCount > 0 && (
            <Card className="border-red-200 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2 text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  Urgent Attention Required
                </CardTitle>
                <CardDescription className="text-xs text-red-600 dark:text-red-400">
                  These tickets have been open for over 30 minutes without a first response
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {myConversations
                  .filter(isUrgent)
                  .slice(0, 3)
                  .map((ticket) => (
                    <button
                      key={ticket.id}
                      onClick={() => navigate(`/agent/tickets?conversationId=${ticket.id}`)}
                      className="w-full text-left rounded-lg border border-red-200 dark:border-red-800 bg-white dark:bg-red-950/30 p-3 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium truncate">{ticket.subject}</p>
                        <Badge variant="outline" className="border-red-400 text-red-600 text-xs shrink-0">Urgent</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{ticket.customerName}</p>
                      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <Clock3 className="h-3 w-3" />
                        Opened {formatDistanceToNow(new Date(ticket.createdAt), { addSuffix: true })}
                      </p>
                    </button>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Recent Tickets — grid layout */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                Recent Tickets
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">Latest updates for quick action — your assigned and unassigned tickets</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => navigate("/agent/tickets")}>
              View All <ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {convLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recentTickets.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No support tickets yet.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {recentTickets.map((ticket) => {
                  const urgent = isUrgent(ticket);
                  return (
                    <div
                      key={ticket.id}
                      className={`rounded-xl border p-4 flex flex-col gap-2.5 hover:shadow-md transition-shadow cursor-pointer ${
                        urgent ? "border-red-200 bg-red-50/40 dark:border-red-800 dark:bg-red-950/20" : "border-border bg-card"
                      }`}
                      onClick={() => navigate(`/agent/tickets?conversationId=${ticket.id}`)}
                      data-testid={`ticket-card-${ticket.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-sm truncate flex-1">{ticket.subject}</p>
                        {urgent && <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge className={`text-xs border ${statusColor(ticket.status)}`} variant="outline">
                          {ticket.status}
                        </Badge>
                        {ticket.agentId === user?.id && (
                          <Badge variant="secondary" className="text-xs">Mine</Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground truncate">{ticket.customerName} · {ticket.customerEmail}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{ticket.lastMessage}</p>

                      <div className="flex items-center justify-between mt-auto">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock3 className="h-3 w-3" />
                          {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => { e.stopPropagation(); navigate(`/agent/tickets?conversationId=${ticket.id}`); }}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
    </>
  );
}
