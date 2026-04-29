import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { fetchApiJson } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import UserAvatar from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Send, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { io, Socket } from "socket.io-client";
import { useLocation } from "wouter";

interface GroupMessage {
  id: string;
  groupName: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  senderProfileImage?: string | null;
  message: string;
  messageType: string;
  fileUrl?: string | null;
  createdAt: string;
}

const GROUP_LABELS: Record<string, string> = {
  staff:   "Staff Chat",
  sellers: "Seller Chat",
  riders:  "Rider Chat",
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  agent: "Agent",
  pickup_agent: "Pickup Agent",
  seller: "Seller",
  rider: "Rider",
  buyer: "Buyer",
};

const ALLOWED_ROLES: Record<string, string[]> = {
  staff:   ["super_admin", "admin", "agent", "pickup_agent"],
  sellers: ["super_admin", "seller"],
  riders:  ["super_admin", "rider"],
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface GroupChatPageProps {
  group: "staff" | "sellers" | "riders";
}

export default function GroupChatPage({ group }: GroupChatPageProps) {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);

  const role = user?.role as string;
  const dashRole = ["super_admin", "admin"].includes(role)
    ? ("super_admin" as const)
    : (role as any);

  // Redirect if role not allowed
  useEffect(() => {
    if (!isAuthenticated || !role) return;
    if (!ALLOWED_ROLES[group]?.includes(role)) {
      navigate("/");
    }
  }, [isAuthenticated, role, group, navigate]);

  const { data: messages = [], isLoading } = useQuery<GroupMessage[]>({
    queryKey: [`/api/group-chat/${group}/messages`],
    queryFn: () => fetchApiJson<GroupMessage[]>(`/api/group-chat/${group}/messages?limit=50`),
    enabled: isAuthenticated && !!ALLOWED_ROLES[group]?.includes(role),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  // Socket real-time
  useEffect(() => {
    if (!isAuthenticated) return;
    const socket = io({ path: "/socket.io", withCredentials: true });
    socketRef.current = socket;

    socket.on("group_chat_message", (msg: GroupMessage) => {
      if (msg.groupName !== group) return;
      qc.setQueryData<GroupMessage[]>([`/api/group-chat/${group}/messages`], (prev = []) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, group, qc]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: (message: string) =>
      fetchApiJson<GroupMessage>(`/api/group-chat/${group}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      }),
    onSuccess: (msg: GroupMessage) => {
      qc.setQueryData<GroupMessage[]>([`/api/group-chat/${group}/messages`], (prev = []) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    setText("");
    sendMutation.mutate(trimmed);
  }, [text, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const groupLabel = GROUP_LABELS[group] || "Group Chat";

  return (
    <DashboardLayout role={dashRole}>
      <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)]">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-card shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold text-sm">{groupLabel}</h2>
            <p className="text-xs text-muted-foreground">
              {ALLOWED_ROLES[group]?.map((r) => ROLE_LABELS[r] || r).join(", ")}
            </p>
          </div>
        </div>

        {/* Messages */}
        <ScrollArea className="flex-1 px-4 py-3">
          {isLoading ? (
            <div className="flex justify-center py-12 text-muted-foreground text-sm">Loading messages...</div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Users className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">No messages yet. Start the conversation!</p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {messages.map((msg) => {
                const isMine = msg.senderId === user?.id;
                return (
                  <div key={msg.id} className={cn("flex gap-2 items-end", isMine ? "flex-row-reverse" : "flex-row")}>
                    {!isMine && (
                      <UserAvatar
                        name={msg.senderName}
                        profileImage={msg.senderProfileImage}
                        size="sm"
                      />
                    )}
                    <div className={cn("max-w-[70%] flex flex-col", isMine ? "items-end" : "items-start")}>
                      {!isMine && (
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs font-medium">{msg.senderName}</span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 h-4">
                            {ROLE_LABELS[msg.senderRole] || msg.senderRole}
                          </Badge>
                        </div>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl px-3 py-2 text-sm break-words",
                          isMine
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted text-foreground rounded-bl-sm"
                        )}
                      >
                        {msg.message}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-0.5 px-1">{formatTime(msg.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </ScrollArea>

        {/* Input */}
        <div className="border-t bg-card px-4 py-3 shrink-0">
          <div className="flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              className="flex-1"
              maxLength={2000}
              disabled={sendMutation.isPending}
            />
            <Button size="icon" onClick={handleSend} disabled={!text.trim() || sendMutation.isPending}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
