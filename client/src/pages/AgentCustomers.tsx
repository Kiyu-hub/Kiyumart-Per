import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SupportConversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerProfileImage?: string | null;
  status: "open" | "assigned" | "resolved";
  updatedAt: string;
}

interface CustomerSummary {
  id: string;
  name: string;
  email: string;
  profileImage?: string;
  totalTickets: number;
  openTickets: number;
  assignedTickets: number;
  resolvedTickets: number;
  isActive: boolean;
  lastActivityAt: string;
}

export default function AgentCustomers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: conversations = [], isLoading } = useQuery<SupportConversation[]>({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/support/conversations");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 5000,
  });

  const customers = useMemo<CustomerSummary[]>(() => {
    const map = new Map<string, CustomerSummary>();
    const activeWindowMs = 24 * 60 * 60 * 1000;
    const now = Date.now();

    for (const conversation of conversations) {
      const existing = map.get(conversation.customerId);
      const updatedAtTs = new Date(conversation.updatedAt).getTime();
      if (!existing) {
        map.set(conversation.customerId, {
          id: conversation.customerId,
          name: conversation.customerName || "Customer",
          email: conversation.customerEmail || "No email",
          profileImage: conversation.customerProfileImage || undefined,
          totalTickets: 0,
          openTickets: 0,
          assignedTickets: 0,
          resolvedTickets: 0,
          isActive: now - updatedAtTs <= activeWindowMs,
          lastActivityAt: conversation.updatedAt,
        });
      }

      const customer = map.get(conversation.customerId)!;
      customer.totalTickets += 1;
      if (conversation.status === "open") customer.openTickets += 1;
      if (conversation.status === "assigned") customer.assignedTickets += 1;
      if (conversation.status === "resolved") customer.resolvedTickets += 1;

      const knownLastActivity = new Date(customer.lastActivityAt).getTime();
      if (updatedAtTs > knownLastActivity) {
        customer.lastActivityAt = conversation.updatedAt;
      }
      customer.isActive = now - new Date(customer.lastActivityAt).getTime() <= activeWindowMs;
    }

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
    );
  }, [conversations]);

  const filteredCustomers = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return customers;
    return customers.filter(
      (customer) =>
        customer.name.toLowerCase().includes(needle) || customer.email.toLowerCase().includes(needle),
    );
  }, [customers, searchQuery]);

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-agent-customers" />
      </div>
    );
  }

  const activeCustomers = customers.filter((customer) => customer.isActive).length;
  const customersWithOpenTickets = customers.filter((customer) => customer.openTickets > 0).length;

  return (
    <DashboardLayout role="agent" showBackButton>
      <div className="p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card data-testid="card-total-customers">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-muted-foreground">Support Customers</p>
              <p className="text-3xl font-bold mt-1">{customers.length}</p>
            </CardContent>
          </Card>

          <Card data-testid="card-active-customers">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-muted-foreground">Active (24h)</p>
              <p className="text-3xl font-bold mt-1">{activeCustomers}</p>
            </CardContent>
          </Card>

          <Card data-testid="card-open-ticket-customers">
            <CardContent className="pt-6">
              <p className="text-sm font-medium text-muted-foreground">Customers With Open Tickets</p>
              <p className="text-3xl font-bold mt-1">{customersWithOpenTickets}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search customers by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-customers"
              />
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-semibold mb-2">No customers found</p>
                <p className="text-sm text-muted-foreground">
                  {searchQuery ? "Try a different search term." : "No support customers yet."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className="rounded-lg border border-border p-4"
                    data-testid={`customer-${customer.id}`}
                  >
                    <div className="flex items-start gap-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={customer.profileImage} alt={customer.name} />
                        <AvatarFallback>{customer.name.charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold truncate">{customer.name}</h3>
                          <Badge variant={customer.isActive ? "default" : "secondary"} className="text-xs">
                            {customer.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">{customer.email}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Last activity {formatDistanceToNow(new Date(customer.lastActivityAt), { addSuffix: true })}
                        </p>
                      </div>

                      <div className="text-right text-xs text-muted-foreground">
                        <p>{customer.totalTickets} total</p>
                        <p>{customer.openTickets} open</p>
                        <p>{customer.assignedTickets} assigned</p>
                        <p>{customer.resolvedTickets} resolved</p>
                      </div>
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
