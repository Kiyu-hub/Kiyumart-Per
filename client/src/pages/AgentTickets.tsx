import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Ticket, MessageCircle, Send, ArrowLeft, Search, Clock, AlertTriangle, CheckCircle2, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Conversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  agentId: string | null;
  agentName: string | null;
  status: "open" | "assigned" | "resolved";
  subject: string;
  lastMessage: string;
  unreadCount?: number;
  firstResponseAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string | null;
  senderRole?: string | null;
  message: string;
  isRead?: boolean | null;
  createdAt: string;
}

function statusBadge(status: Conversation["status"]) {
  if (status === "resolved") return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-200 dark:text-emerald-300" variant="outline"><CheckCircle2 className="h-3 w-3 mr-1" />Resolved</Badge>;
  if (status === "assigned") return <Badge className="bg-blue-500/15 text-blue-700 border-blue-200 dark:text-blue-300" variant="outline"><User className="h-3 w-3 mr-1" />Assigned</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-700 border-amber-200 dark:text-amber-300" variant="outline"><Clock className="h-3 w-3 mr-1" />Open</Badge>;
}

function isUrgent(conv: Conversation): boolean {
  const ageMs = Date.now() - new Date(conv.createdAt).getTime();
  return ageMs > 30 * 60 * 1000 && !conv.firstResponseAt && conv.status !== "resolved";
}

export default function AgentTickets() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const urlParams = new URLSearchParams(window.location.search);
  const conversationIdParam = urlParams.get("conversationId");

  const [selectedId, setSelectedId] = useState<string | null>(conversationIdParam);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "open" | "assigned" | "resolved">("all");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) navigate("/");
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: conversations = [], isLoading: convLoading } = useQuery<Conversation[]>({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/support/conversations");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
    refetchInterval: 5000,
  });

  useEffect(() => {
    if (conversationIdParam && conversations.length > 0 && !selectedId) {
      setSelectedId(conversationIdParam);
    }
  }, [conversationIdParam, conversations.length, selectedId]);

  useEffect(() => {
    if (conversationIdParam) setSelectedId(conversationIdParam);
  }, [conversationIdParam]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/support/conversations", selectedId, "/messages"],
    queryFn: async () => {
      if (!selectedId) return [];
      const res = await apiRequest("GET", `/api/support/conversations/${selectedId}/messages`);
      return res.json();
    },
    enabled: !!selectedId,
    refetchInterval: selectedId ? 3000 : false,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, selectedId]);

  useEffect(() => {
    if (!socket) return;
    const handler = (payload?: { conversationId?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      const targetId = payload?.conversationId || selectedId;
      if (targetId) {
        queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", targetId, "/messages"] });
      }
    };
    socket.on("support_conversation_updated", handler);
    socket.on("support_update", handler);
    socket.on("new_support_message", handler);
    return () => {
      socket.off("support_conversation_updated", handler);
      socket.off("support_update", handler);
      socket.off("new_support_message", handler);
    };
  }, [socket, selectedId]);

  const replyMutation = useMutation({
    mutationFn: async ({ convId, text }: { convId: string; text: string }) => {
      const res = await apiRequest("POST", `/api/support/conversations/${convId}/messages`, { message: text });
      return res.json();
    },
    onSuccess: () => {
      setMessage("");
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedId, "/messages"] });
        queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      }
    },
    onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
  });

  const assignMutation = useMutation({
    mutationFn: async (convId: string) => {
      const res = await apiRequest("POST", `/api/support/conversations/${convId}/assign`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({ title: "Ticket assigned to you" });
    },
    onError: () => toast({ title: "Failed to assign ticket", variant: "destructive" }),
  });

  const resolveMutation = useMutation({
    mutationFn: async (convId: string) => {
      const res = await apiRequest("POST", `/api/support/conversations/${convId}/resolve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({ title: "Ticket resolved" });
    },
    onError: () => toast({ title: "Failed to resolve ticket", variant: "destructive" }),
  });

  const handleSend = () => {
    if (message.trim() && selectedId) {
      replyMutation.mutate({ convId: selectedId, text: message.trim() });
    }
  };

  const filteredConversations = useMemo(() => {
    let list = conversations;
    if (filter !== "all") list = list.filter((c) => c.status === filter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) => c.subject.toLowerCase().includes(q) || c.customerName.toLowerCase().includes(q) || c.customerEmail.toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [conversations, filter, search]);

  const selectedConv = conversations.find((c) => c.id === selectedId) || null;

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role="agent">
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Conversation list */}
        <div className={`w-80 shrink-0 border-r flex flex-col bg-card ${selectedId ? "hidden md:flex" : "flex"}`}>
          <div className="p-3 border-b space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search tickets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <div className="flex gap-1 flex-wrap">
              {(["all", "open", "assigned", "resolved"] as const).map((f) => (
                <Button
                  key={f}
                  size="sm"
                  variant={filter === f ? "default" : "outline"}
                  className="h-7 text-xs px-2"
                  onClick={() => setFilter(f)}
                >
                  {f === "all" ? `All (${conversations.length})` : `${f.charAt(0).toUpperCase() + f.slice(1)} (${conversations.filter((c) => c.status === f).length})`}
                </Button>
              ))}
            </div>
          </div>
          <ScrollArea className="flex-1">
            {convLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <Ticket className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No tickets found</p>
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredConversations.map((conv) => {
                  const urgent = isUrgent(conv);
                  return (
                    <button
                      key={conv.id}
                      onClick={() => { setSelectedId(conv.id); navigate(`/agent/tickets?conversationId=${conv.id}`); }}
                      className={`w-full text-left rounded-lg p-3 transition-colors ${
                        selectedId === conv.id
                          ? "bg-primary/10 border border-primary/20"
                          : urgent
                          ? "bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30"
                          : "hover:bg-muted border border-transparent"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p className="text-sm font-medium truncate flex-1">{conv.subject}</p>
                        {urgent && <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{conv.customerName}</p>
                      <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                      <div className="flex items-center justify-between mt-1.5">
                        {statusBadge(conv.status)}
                        <span className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>

        {/* Chat panel */}
        <div className={`flex-1 flex flex-col min-w-0 ${selectedId ? "flex" : "hidden md:flex"}`}>
          {selectedId && selectedConv ? (
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
                <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => { setSelectedId(null); navigate("/agent/tickets"); }}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{selectedConv.subject}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-muted-foreground">{selectedConv.customerName} · {selectedConv.customerEmail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {statusBadge(selectedConv.status)}
                  {selectedConv.agentId !== user?.id && selectedConv.status !== "resolved" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => assignMutation.mutate(selectedConv.id)} disabled={assignMutation.isPending}>
                      {assignMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Assign to Me"}
                    </Button>
                  )}
                  {selectedConv.status !== "resolved" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30" onClick={() => resolveMutation.mutate(selectedConv.id)} disabled={resolveMutation.isPending}>
                      {resolveMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Resolve"}
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <ScrollArea className="flex-1 p-4">
                {messagesLoading ? (
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <MessageCircle className="h-10 w-10 text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No messages yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {messages.map((msg) => {
                      const isCustomer = msg.senderId === selectedConv.customerId;
                      // Customer (sender/initiator) → LEFT; all staff/agents (respondents) → RIGHT
                      return (
                        <div key={msg.id} className={`flex gap-2 ${isCustomer ? "" : "flex-row-reverse"}`}>
                          <div className={`h-7 w-7 rounded-full shrink-0 flex items-center justify-center text-xs font-medium ${isCustomer ? "bg-muted text-foreground" : "bg-primary/20 text-primary"}`}>
                            {isCustomer ? (selectedConv.customerName?.slice(0, 1) || "C") : (msg.senderName?.slice(0, 1) || "S")}
                          </div>
                          <div className={`flex-1 ${isCustomer ? "" : "text-right"}`}>
                            <p className="text-[10px] text-muted-foreground mb-0.5">
                              {isCustomer ? selectedConv.customerName : (msg.senderName || "Support")} · {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </p>
                            <div className={`inline-block px-3 py-2 rounded-lg max-w-[80%] text-sm whitespace-pre-wrap ${
                              isCustomer ? "bg-muted text-foreground" : "bg-primary text-primary-foreground"
                            }`}>
                              {msg.message}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              {/* Reply input */}
              {selectedConv.status !== "resolved" ? (
                <div className="flex gap-2 p-3 border-t shrink-0 bg-card">
                  <Input
                    placeholder="Type a reply..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                    disabled={replyMutation.isPending}
                    className="flex-1"
                  />
                  <Button onClick={handleSend} disabled={replyMutation.isPending || !message.trim()} size="icon">
                    {replyMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              ) : (
                <div className="p-3 border-t text-center text-sm text-muted-foreground bg-card">
                  This ticket has been resolved.
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <Ticket className="h-14 w-14 text-muted-foreground mb-4" />
              <p className="text-lg font-semibold">Select a ticket</p>
              <p className="text-sm text-muted-foreground mt-1">Choose a conversation from the list to view and respond.</p>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
