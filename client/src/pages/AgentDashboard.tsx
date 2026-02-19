import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, ArrowRight, CheckCircle2, Clock3, Loader2, Ticket, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SupportConversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  agentId: string | null;
  status: "open" | "assigned" | "resolved";
  subject: string;
  lastMessage: string;
  updatedAt: string;
}

interface UnreadNotificationCount {
  count: number;
}

function getStatusBadgeVariant(status: SupportConversation["status"]): "default" | "secondary" | "outline" {
  if (status === "resolved") return "default";
  if (status === "assigned") return "secondary";
  return "outline";
}

function getStatusLabel(status: SupportConversation["status"]): string {
  if (status === "resolved") return "Resolved";
  if (status === "assigned") return "Assigned";
  return "Open";
}

export default function AgentDashboard() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<SupportConversation[]>({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/support/conversations");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 5000,
  });

  const { data: unreadNotificationData } = useQuery<UnreadNotificationCount>({
    queryKey: ["/api/notifications/unread-count"],
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 30000,
  });

  const metrics = useMemo(() => {
    const now = Date.now();
    const today = new Date().toDateString();
    const activeWindowMs = 24 * 60 * 60 * 1000;

    const open = conversations.filter((conv) => conv.status === "open");
    const assigned = conversations.filter((conv) => conv.status === "assigned");
    const resolved = conversations.filter((conv) => conv.status === "resolved");
    const assignedToMe = conversations.filter(
      (conv) => conv.agentId === user?.id && (conv.status === "open" || conv.status === "assigned"),
    );
    const resolvedToday = resolved.filter(
      (conv) => new Date(conv.updatedAt).toDateString() === today,
    ).length;
    const activeCustomers = new Set(
      conversations
        .filter((conv) => now - new Date(conv.updatedAt).getTime() <= activeWindowMs)
        .map((conv) => conv.customerId),
    ).size;
    const customers = new Set(conversations.map((conv) => conv.customerId)).size;

    return {
      openCount: open.length,
      openUnassignedCount: open.filter((conv) => !conv.agentId).length,
      assignedCount: assigned.length,
      assignedToMeCount: assignedToMe.length,
      resolvedCount: resolved.length,
      resolvedTodayCount: resolvedToday,
      customerCount: customers,
      activeCustomerCount: activeCustomers,
    };
  }, [conversations, user?.id]);

  const recentTickets = useMemo(() => {
    return [...conversations]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  }, [conversations]);

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-agent" />
      </div>
    );
  }

  return (
    <DashboardLayout role="agent">
      <div className="p-6 space-y-6">
        <Card>
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-2xl">Agent Operations Dashboard</CardTitle>
                <CardDescription>
                  Monitor support workload, prioritize active tickets, and respond faster.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => navigate("/agent/tickets")} data-testid="button-open-ticket-inbox">
                  Open Ticket Inbox
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate("/agent/customers")}
                  data-testid="button-open-customers"
                >
                  View Customers
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card data-testid="card-open-queue">
            <CardHeader className="pb-2">
              <CardDescription>Open Queue</CardDescription>
              <CardTitle className="text-3xl">{metrics.openCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>{metrics.openUnassignedCount} unassigned ticket(s)</span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-assigned-to-me">
            <CardHeader className="pb-2">
              <CardDescription>Assigned To Me</CardDescription>
              <CardTitle className="text-3xl">{metrics.assignedToMeCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                <span>{metrics.assignedCount} assigned across all agents</span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-resolved-today">
            <CardHeader className="pb-2">
              <CardDescription>Resolved Today</CardDescription>
              <CardTitle className="text-3xl">{metrics.resolvedTodayCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                <span>{metrics.resolvedCount} total resolved ticket(s)</span>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-active-customers">
            <CardHeader className="pb-2">
              <CardDescription>Active Customers (24h)</CardDescription>
              <CardTitle className="text-3xl">{metrics.activeCustomerCount}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <span>
                  {metrics.customerCount} total customer(s), {unreadNotificationData?.count || 0} unread alert(s)
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-recent-tickets">
          <CardHeader>
            <CardTitle className="text-lg">Recent Tickets</CardTitle>
            <CardDescription>Latest support activity ordered by most recent updates.</CardDescription>
          </CardHeader>
          <CardContent>
            {conversationsLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : recentTickets.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                No support tickets yet.
              </div>
            ) : (
              <div className="space-y-3">
                {recentTickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="rounded-lg border border-border p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                    data-testid={`ticket-row-${ticket.id}`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{ticket.subject}</p>
                        <Badge variant={getStatusBadgeVariant(ticket.status)}>
                          {getStatusLabel(ticket.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {ticket.customerName} ({ticket.customerEmail})
                      </p>
                      <p className="text-xs text-muted-foreground truncate mt-1">{ticket.lastMessage}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true })}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(`/agent/tickets?conversationId=${ticket.id}`)}
                        data-testid={`button-open-ticket-${ticket.id}`}
                      >
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
