import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, MessageSquare, Store, Truck } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Contact {
  id: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  profileImage: string | null;
  isActive: boolean;
  hasMessaged: boolean;
}

interface ContactsData {
  sellers: Contact[];
  riders: Contact[];
}

function ContactCard({ contact, onMessage }: { contact: Contact; onMessage: (id: string) => void }) {
  const initials = contact.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0">
            <Avatar className="h-12 w-12">
              <AvatarImage src={contact.profileImage || undefined} alt={contact.name} />
              <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
            </Avatar>
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${
                contact.isActive ? "bg-emerald-500" : "bg-muted-foreground/40"
              }`}
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-sm truncate">{contact.name}</p>
              {contact.hasMessaged && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Messaged</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{contact.email}</p>
            {contact.phone && (
              <p className="text-xs text-muted-foreground truncate">{contact.phone}</p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-2"
          onClick={() => onMessage(contact.id)}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Message
        </Button>
      </CardContent>
    </Card>
  );
}

export default function AgentCustomers() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();
  const showRiders = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) {
      navigate("/");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: contactsData, isLoading } = useQuery<ContactsData>({
    queryKey: ["/api/agent/contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/contacts");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 30000,
  });

  const handleMessage = (userId: string) => {
    navigate(`/agent/direct-messages?userId=${userId}`);
  };

  const filteredSellers = useMemo(() => {
    const list = contactsData?.sellers ?? [];
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle) || (c.phone || "").toLowerCase().includes(needle));
  }, [contactsData?.sellers, searchQuery]);

  const filteredRiders = useMemo(() => {
    const list = contactsData?.riders ?? [];
    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((c) => c.name.toLowerCase().includes(needle) || c.email.toLowerCase().includes(needle) || (c.phone || "").toLowerCase().includes(needle));
  }, [contactsData?.riders, searchQuery]);

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role="agent" showBackButton>
      <div className="p-4 md:p-6 space-y-5">
        {/* Header stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-2xl text-blue-600 dark:text-blue-400">
                {contactsData?.sellers.length ?? 0}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Active Sellers</p>
            </CardHeader>
          </Card>
          {showRiders && (
            <Card className="border-l-4 border-l-emerald-500">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-2xl text-emerald-600 dark:text-emerald-400">
                  {contactsData?.riders.length ?? 0}
                </CardTitle>
                <p className="text-xs text-muted-foreground">Active Riders</p>
              </CardHeader>
            </Card>
          )}
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-2xl text-purple-600 dark:text-purple-400">
                {(contactsData?.sellers.filter((c) => c.hasMessaged).length ?? 0) +
                  (showRiders ? contactsData?.riders.filter((c) => c.hasMessaged).length ?? 0 : 0)}
              </CardTitle>
              <p className="text-xs text-muted-foreground">Messaged Contacts</p>
            </CardHeader>
          </Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, email or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sellers">
          <TabsList>
            <TabsTrigger value="sellers" className="gap-2">
              <Store className="h-3.5 w-3.5" />
              Sellers
              {contactsData?.sellers.length ? (
                <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{contactsData.sellers.length}</Badge>
              ) : null}
            </TabsTrigger>
            {showRiders && (
              <TabsTrigger value="riders" className="gap-2">
                <Truck className="h-3.5 w-3.5" />
                Riders
                {contactsData?.riders.length ? (
                  <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">{contactsData.riders.length}</Badge>
                ) : null}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="sellers" className="mt-4">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredSellers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Store className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="font-semibold text-lg">No sellers found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {searchQuery ? "Try a different search term." : "No active sellers on the platform yet."}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {filteredSellers.map((contact) => (
                  <ContactCard key={contact.id} contact={contact} onMessage={handleMessage} />
                ))}
              </div>
            )}
          </TabsContent>

          {showRiders && (
            <TabsContent value="riders" className="mt-4">
              {isLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredRiders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Truck className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="font-semibold text-lg">No riders found</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {searchQuery ? "Try a different search term." : "No active riders on the platform yet."}
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {filteredRiders.map((contact) => (
                    <ContactCard key={contact.id} contact={contact} onMessage={handleMessage} />
                  ))}
                </div>
              )}
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
