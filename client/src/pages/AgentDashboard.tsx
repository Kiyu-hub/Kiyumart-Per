import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Loader2, Ticket, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";

type Conversation = {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  agentId: string | null;
  status: "open" | "assigned" | "resolved";
  subject: string;
  lastMessage: string;
  updatedAt: string;
};

type SupportAnalytics = {
  totals?: { total?: number; open?: number; assigned?: number; resolved?: number; unresolved?: number };
  responseTime?: { avgFirstResponseSeconds?: number };
  unresolvedBacklog?: { over30MinutesWithoutFirstResponse?: number };
};

function badgeVariant(status: Conversation["status"]): "default" | "secondary" | "outline" {
  if (status === "resolved") return "default";
  if (status === "assigned") return "secondary";
  return "outline";
}

export default function AgentDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) navigate("/");
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: conversations = [], isLoading: convLoading } = useQuery<Conversation[]>({
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

  const metrics = useMemo(() => {
    const now = Date.now();
    const activeWindow = 24 * 60 * 60 * 1000;
    const open = conversations.filter((c) => c.status === "open");
    const assigned = conversations.filter((c) => c.status === "assigned");
    const resolved = conversations.filter((c) => c.status === "resolved");
    const assignedToMe = conversations.filter((c) => c.agentId === user?.id && (c.status === "open" || c.status === "assigned"));
    const activeCustomers = new Set(conversations.filter((c) => now - new Date(c.updatedAt).getTime() <= activeWindow).map((c) => c.customerId)).size;
    const resolutionRate = conversations.length ? (resolved.length / conversations.length) * 100 : 0;
    return {
      openCount: open.length,
      assignedCount: assigned.length,
      assignedToMeCount: assignedToMe.length,
      resolvedCount: resolved.length,
      activeCustomerCount: activeCustomers,
      resolutionRate,
      interventionQueue: Number(supportAnalytics?.unresolvedBacklog?.over30MinutesWithoutFirstResponse || 0),
      avgResponseMins: Number(supportAnalytics?.responseTime?.avgFirstResponseSeconds || 0) / 60,
    };
  }, [conversations, supportAnalytics?.responseTime?.avgFirstResponseSeconds, supportAnalytics?.unresolvedBacklog?.over30MinutesWithoutFirstResponse, user?.id]);

  const recentTickets = useMemo(() => [...conversations].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8), [conversations]);

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <DashboardLayout role="agent">
      <div className="p-4 md:p-6 space-y-4">
        <Card className="border-emerald-500/25 bg-[linear-gradient(96deg,rgba(6,78,59,0.42)_0%,rgba(2,6,23,0.96)_48%,rgba(14,116,144,0.4)_100%)] text-white">
          <CardContent className="p-4 md:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h1 className="text-2xl font-semibold">Agent Analytics Dashboard</h1>
                <p className="text-white/80 text-sm">Support-focused analytics for active cases, intervention queue, exceptions, and response quality.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className="bg-white/20 text-white border-white/30">No Financial Data</Badge>
                  <Badge className="bg-white/20 text-white border-white/30">Role Scoped</Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate("/agent/tickets")}>Open Tickets</Button>
                <Button variant="outline" onClick={() => navigate("/agent/customers")}>Customers</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Card><CardHeader className="pb-2"><CardDescription>Active Support Cases</CardDescription><CardTitle className="text-2xl">{Number(supportAnalytics?.totals?.unresolved || metrics.openCount + metrics.assignedCount)}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Open + assigned tickets</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Orders Needing Intervention</CardDescription><CardTitle className="text-2xl">{metrics.interventionQueue}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Unresolved &gt; 30 min without first response</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Delivery Exceptions</CardDescription><CardTitle className="text-2xl">{metrics.openCount}</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Open tickets requiring action</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Response Time</CardDescription><CardTitle className="text-2xl">{metrics.avgResponseMins.toFixed(1)} min</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Average first response</CardContent></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Resolution Success Rate</CardDescription><CardTitle className="text-2xl">{metrics.resolutionRate.toFixed(1)}%</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Resolved vs total support cases</CardContent></Card>
        </div>

        <TrackingMetricsPanel role="agent" title="Delivery Signal Monitor" />

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Support Case Status</CardTitle><CardDescription>Live queue composition</CardDescription></CardHeader>
            <CardContent>
              <ChartContainer config={{ value: { label: "Cases", color: "#06b6d4" } }} className="h-[230px] w-full">
                <BarChart
                  data={[
                    { label: "Open", value: Number(supportAnalytics?.totals?.open || 0) },
                    { label: "Assigned", value: Number(supportAnalytics?.totals?.assigned || 0) },
                    { label: "Resolved", value: Number(supportAnalytics?.totals?.resolved || 0) },
                  ]}
                >
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="value" fill="var(--color-value)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Agent Workload</CardTitle><CardDescription>Operational guidance</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-lg border p-3 flex items-center justify-between"><span>Assigned to me</span><span className="font-semibold">{metrics.assignedToMeCount}</span></div>
              <div className="rounded-lg border p-3 flex items-center justify-between"><span>Unread alerts</span><span className="font-semibold">{unreadNotificationData?.count || 0}</span></div>
              <div className="rounded-lg border p-3 flex items-center justify-between"><span>Active customers (24h)</span><span className="font-semibold">{metrics.activeCustomerCount}</span></div>
              <div className="rounded-lg border p-3 flex items-center justify-between"><span>Resolved cases</span><span className="font-semibold">{metrics.resolvedCount}</span></div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Recent Tickets</CardTitle><CardDescription>Latest updates for quick action</CardDescription></CardHeader>
          <CardContent>
            {convLoading ? (
              <div className="flex items-center justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : recentTickets.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">No support tickets yet.</div>
            ) : (
              <div className="space-y-3">
                {recentTickets.map((ticket) => (
                  <div key={ticket.id} className="rounded-lg border p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" data-testid={`ticket-row-${ticket.id}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><p className="font-semibold truncate">{ticket.subject}</p><Badge variant={badgeVariant(ticket.status)}>{ticket.status}</Badge></div>
                      <p className="text-sm text-muted-foreground truncate">{ticket.customerName} ({ticket.customerEmail})</p>
                      <p className="text-xs text-muted-foreground truncate mt-1">{ticket.lastMessage}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" />{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}</span>
                      <Button variant="ghost" size="sm" onClick={() => navigate(`/agent/tickets?conversationId=${ticket.id}`)}>
                        Open
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
