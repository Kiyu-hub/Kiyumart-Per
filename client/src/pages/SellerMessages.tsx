import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Send, ArrowLeft, Phone } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useSocket } from "@/contexts/NotificationContext";
import { usePresence, useBatchPresence, formatLastSeen } from "@/hooks/usePresence";
import VoiceRecorderControls from "@/components/VoiceRecorderControls";
import MessageAttachmentContent from "@/components/MessageAttachmentContent";
import { buildChatAttachmentMessage } from "@/lib/chatAttachments";
import UserAvatar from "@/components/UserAvatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface UserData {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
  profileImage?: string | null;
  isActive: boolean;
}

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  messageType?: string;
  createdAt: string;
  isRead: boolean;
  status: 'sent' | 'delivered' | 'read';
  deliveredAt?: string | null;
  readAt?: string | null;
}

export default function SellerMessages() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { allowSellerDirectSupportMessages, hasResolvedSettings } = usePlatformSettings();
  const { toast } = useToast();
  const socket = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  // Get userId from URL search params
  const urlParams = new URLSearchParams(window.location.search);
  const userIdFilter = urlParams.get("userId");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  useEffect(() => {
    if (authLoading || user?.role !== "seller" || !hasResolvedSettings) return;
    if (allowSellerDirectSupportMessages === false) {
      navigate("/support");
    }
  }, [allowSellerDirectSupportMessages, authLoading, hasResolvedSettings, navigate, user?.role]);

  // Listen for real-time messages
  useEffect(() => {
    if (!socket || !selectedUserId) return;

    const handleNewMessage = (msg: Message) => {
      if (msg.receiverId === user?.id) {
        socket.emit("message_delivered", { messageId: msg.id });
      }
      if (msg.senderId === selectedUserId || msg.receiverId === selectedUserId) {
        if (!seenMessageIdsRef.current.has(msg.id)) {
          seenMessageIdsRef.current.add(msg.id);
          queryClient.setQueryData<Message[]>(["/api/messages", selectedUserId], (old) => {
            if (!old) return [msg];
            if (old.some((m) => m.id === msg.id)) return old;
            return [...old, msg];
          });
        }
      }
    };

    const handleMessageStatusUpdated = (data: { messageId: string; status: "sent" | "delivered" | "read"; deliveredAt?: string; readAt?: string }) => {
      queryClient.setQueryData<Message[]>(["/api/messages", selectedUserId], (old) => {
        if (!old) return old;
        return old.map((m) =>
          m.id === data.messageId
            ? {
                ...m,
                status: data.status,
                deliveredAt: data.deliveredAt ?? m.deliveredAt ?? null,
                readAt: data.readAt ?? m.readAt ?? null,
                isRead: data.status === "read" ? true : m.isRead,
              }
            : m
        );
      });
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_status_updated", handleMessageStatusUpdated);
    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_status_updated", handleMessageStatusUpdated);
    };
  }, [socket, selectedUserId, user?.id]);

  useEffect(() => {
    if (!socket || !selectedUserId) return;

    const resolveUserId = (payload: any) => (typeof payload === "string" ? payload : payload?.userId);

    const handleUserTyping = (payload: any) => {
      if (resolveUserId(payload) === selectedUserId) {
        setIsPeerTyping(true);
      }
    };

    const handleUserStopTyping = (payload: any) => {
      if (resolveUserId(payload) === selectedUserId) {
        setIsPeerTyping(false);
      }
    };

    socket.on("user_typing", handleUserTyping);
    socket.on("user_stop_typing", handleUserStopTyping);

    return () => {
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stop_typing", handleUserStopTyping);
    };
  }, [socket, selectedUserId]);

  useEffect(() => {
    setIsPeerTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
    seenMessageIdsRef.current.clear();
  }, [selectedUserId]);

  // Fetch contacts:
  // - always-open masked support channel
  // - active stakeholders + existing non-support conversation partners
  const { data: users = [], isLoading: usersLoading } = useQuery<UserData[]>({
    queryKey: ["/api/seller/message-contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/seller/message-contacts");
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "seller",
    refetchInterval: 10000,
  });

  const supportUsers = users.filter(
    (u) => String(u.role || "").toLowerCase() === "support_agent",
  );

  // Default to unified support contact first
  useEffect(() => {
    if (!supportUsers.length || selectedUserId) return;
    setSelectedUserId(supportUsers[0].id);
  }, [supportUsers, selectedUserId]);

  // Auto-select user when coming from notification with userId
  useEffect(() => {
    if (userIdFilter && users.length > 0 && !selectedUserId) {
      const targetUser = supportUsers.find(u => u.id === userIdFilter);
      if (targetUser) {
        setSelectedUserId(targetUser.id);
      }
    }
  }, [userIdFilter, supportUsers, selectedUserId]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const res = await apiRequest("GET", `/api/messages/${selectedUserId}`);
      if (!res.ok) throw new Error("Failed to load messages");
      return res.json();
    },
    enabled: !!selectedUserId,
  });

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedUserId, messages.length]);

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { receiverId: string; message: string }) => {
      return apiRequest("POST", "/api/messages", {
        receiverId: data.receiverId,
        message: data.message,
      });
    },
    onSuccess: () => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const markConversationReadMutation = useMutation({
    mutationFn: async (peerUserId: string) => {
      return apiRequest("PATCH", `/api/messages/${peerUserId}/read`);
    },
  });

  const requestCallMutation = useMutation({
    mutationFn: async (callType: "voice" | "video") => {
      const res = await apiRequest("POST", "/api/calls/request", { callType });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Call requested", description: "An admin has been notified and will call you back shortly." });
    },
    onError: () => {
      toast({ title: "Request failed", description: "Could not send call request.", variant: "destructive" });
    },
  });

  useEffect(() => {
    if (!socket || !selectedUserId || messages.length === 0) return;

    const incoming = messages.filter((m) => m.senderId !== user?.id);
    const undelivered = incoming.filter((m) => !m.deliveredAt && m.status === "sent");
    const unread = incoming.filter((m) => !m.readAt && !m.isRead);

    undelivered.forEach((m) => socket.emit("message_delivered", { messageId: m.id }));

    if (unread.length > 0 && !markConversationReadMutation.isPending) {
      markConversationReadMutation.mutate(selectedUserId, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
        },
      });
    }
  }, [socket, selectedUserId, messages, markConversationReadMutation.isPending, user?.id]);

  const handleSendMessage = () => {
    if (message.trim() && selectedUserId) {
      if (isTypingRef.current) {
        socket?.emit("stop_typing", { receiverId: selectedUserId });
        isTypingRef.current = false;
      }
      sendMessageMutation.mutate({
        receiverId: selectedUserId,
        message: message.trim(),
      });
    }
  };

  const handleSendAudio = async (file: File) => {
    if (!selectedUserId) return;
    try {
      setUploadingAudio(true);
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload/audio", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const payload = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !payload?.url) {
        throw new Error(payload?.error || "Failed to upload voice note");
      }
      await sendMessageMutation.mutateAsync({
        receiverId: selectedUserId,
        message: buildChatAttachmentMessage({
          kind: "audio",
          url: payload.url,
          name: file.name,
          size: file.size,
        }),
      });
    } catch (error: any) {
      toast({
        title: "Voice note failed",
        description: error?.message || "Could not send voice note",
        variant: "destructive",
      });
    } finally {
      setUploadingAudio(false);
    }
  };

  const selectedUser = supportUsers.find(u => u.id === selectedUserId) || supportUsers[0];
  const selectedUserPresence = usePresence(selectedUserId || undefined);
  const userIds = supportUsers.map((u) => u.id);
  useBatchPresence(userIds);

  const handleTypingChange = (value: string) => {
    setMessage(value);
    if (!socket || !selectedUserId) return;
    if (value.trim().length > 0 && !isTypingRef.current) {
      socket.emit("typing", { receiverId: selectedUserId });
      isTypingRef.current = true;
    }
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        socket.emit("stop_typing", { receiverId: selectedUserId });
        isTypingRef.current = false;
      }
    }, 1200);
  };

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate("/seller");
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (socket && selectedUserId && isTypingRef.current) {
        socket.emit("stop_typing", { receiverId: selectedUserId });
      }
    };
  }, [socket, selectedUserId]);

  const getPresenceMeta = (presence: { status?: "online" | "offline" | "away"; lastSeen?: string | null } | null | undefined) => {
    const status = presence?.status ?? "offline";
    if (status === "online") {
      return {
        label: "Online",
        textClass: "text-emerald-500 font-medium",
        dotClass: "bg-emerald-500",
      };
    }
    if (status === "away") {
      return {
        label: "Away",
        textClass: "text-amber-500 font-medium",
        dotClass: "bg-amber-500",
      };
    }
    const label = presence?.lastSeen ? `Last seen ${formatLastSeen(presence.lastSeen)}` : "Offline";
    return {
      label,
      textClass: "text-muted-foreground",
      dotClass: "bg-muted-foreground/60",
    };
  };

  if (authLoading) {
    return (
      <DashboardLayout role="seller">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="seller">
      <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
        <div className="flex items-center gap-4 p-4 md:p-6 flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">Messages</h1>
            <p className="text-muted-foreground text-sm">
              Use this chat for operational support conversations. Account appeals must be submitted through Support tickets.
            </p>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col p-4 pt-0 md:hidden md:p-6 md:pt-0">
          <Card className="h-full flex flex-col">
              <div className="flex items-center gap-3 p-3 border-b">
                <div className="relative">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={selectedUser?.profileImage || undefined} alt={selectedUser?.name || "Support"} />
                    <AvatarFallback>
                      {(selectedUser?.name || "S").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${getPresenceMeta(selectedUserPresence.presence).dotClass}`} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm">{selectedUser?.name || "Support Agent"}</h3>
                    <Badge className="bg-emerald-600 text-white text-[10px] px-1.5 py-0">support</Badge>
                  </div>
                  <p className={`text-xs ${isPeerTyping ? "text-primary font-medium" : getPresenceMeta(selectedUserPresence.presence).textClass}`}>
                    {isPeerTyping ? (
                      <span className="inline-flex items-center gap-0.5">
                        typing
                        <span className="inline-flex gap-px ml-0.5">
                          <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{animationDelay:"0ms",animationDuration:"900ms"}}/>
                          <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{animationDelay:"200ms",animationDuration:"900ms"}}/>
                          <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{animationDelay:"400ms",animationDuration:"900ms"}}/>
                        </span>
                      </span>
                    ) : getPresenceMeta(selectedUserPresence.presence).label}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs shrink-0"
                  disabled={requestCallMutation.isPending}
                  onClick={() => requestCallMutation.mutate("voice")}
                  title="Request a voice call with support"
                >
                  {requestCallMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                  Request Call
                </Button>
              </div>

              <ScrollArea className="flex-1 p-3">
                {messagesLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No messages yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {Array.from(new Map(messages.map((m) => [m.id, m])).values()).map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderId === user?.id ? "justify-start" : "justify-end"}`}
                      >
                        <div
                          className={`max-w-[85%] px-3 py-2 rounded-2xl ${
                            msg.senderId === user?.id
                              ? "bg-muted rounded-bl-sm"
                              : "bg-primary text-primary-foreground rounded-br-sm"
                          }`}
                        >
                          <MessageAttachmentContent message={msg.message} className="text-sm whitespace-pre-wrap" />
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-[10px] opacity-70">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                            {msg.senderId === user?.id && (
                              <MessageStatusTicks
                                status={msg.status || "sent"}
                                deliveredAt={msg.deliveredAt}
                                readAt={msg.readAt}
                                isRead={msg.isRead}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {isPeerTyping && (
                      <div className="flex justify-start">
                        <TypingIndicator />
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                )}
              </ScrollArea>

              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => handleTypingChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                  disabled={sendMessageMutation.isPending}
                  className="flex-1"
                />
                {message.trim() ? (
                  <Button
                    onClick={handleSendMessage}
                    disabled={sendMessageMutation.isPending || uploadingAudio}
                    size="icon"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                ) : (
                  <VoiceRecorderControls
                    onSendAudio={handleSendAudio}
                    disabled={sendMessageMutation.isPending || uploadingAudio}
                  />
                )}
              </div>
            </Card>
        </div>
        <div className="hidden md:flex md:flex-col flex-1 min-h-0 p-6 pt-0">
            <Card className="p-4 flex flex-col flex-1 overflow-hidden">
              {selectedUser || selectedUserId ? (
                <>
                  <div className="flex items-center gap-3 pb-4 border-b mb-4">
                    <div className="relative">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={selectedUser?.profileImage || undefined} alt={selectedUser?.name || "Support"} />
                        <AvatarFallback>
                          {(selectedUser?.name || "S").charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${getPresenceMeta(selectedUserPresence.presence).dotClass}`} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg">{selectedUser?.name || "Support Agent"}</h3>
                      <p className={`text-xs ${isPeerTyping ? "text-primary font-medium" : getPresenceMeta(selectedUserPresence.presence).textClass}`}>
                        {isPeerTyping ? (
                          <span className="inline-flex items-center gap-0.5">
                            typing
                            <span className="inline-flex gap-px ml-0.5">
                              <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{animationDelay:"0ms",animationDuration:"900ms"}}/>
                              <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{animationDelay:"200ms",animationDuration:"900ms"}}/>
                              <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{animationDelay:"400ms",animationDuration:"900ms"}}/>
                            </span>
                          </span>
                        ) : getPresenceMeta(selectedUserPresence.presence).label}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-sm shrink-0"
                      disabled={requestCallMutation.isPending}
                      onClick={() => requestCallMutation.mutate("voice")}
                      title="Request a voice call with support"
                    >
                      {requestCallMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                      Request a Call
                    </Button>
                  </div>

                  <ScrollArea className="flex-1 mb-4">
                    {messagesLoading ? (
                      <div className="text-center py-12">
                        <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-12">
                        <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">No messages yet. Start the conversation!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {Array.from(new Map(messages.map((m) => [m.id, m])).values()).map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.senderId !== user?.id ? "flex-row-reverse" : ""}`}
                          >
                            <UserAvatar
                              profileImage={msg.senderId === user?.id ? (user?.profileImage || null) : (selectedUser?.profileImage || null)}
                              name={msg.senderId === user?.id ? (user?.name || "You") : (selectedUser?.name || selectedUser?.username || "User")}
                              email={msg.senderId === user?.id ? user?.email : selectedUser?.email}
                              size="sm"
                              className="flex-shrink-0"
                            />
                            <div className={`flex-1 ${msg.senderId !== user?.id ? "text-right" : ""}`}>
                              <div
                                className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                                  msg.senderId === user?.id
                                    ? "bg-muted"
                                    : "bg-primary text-primary-foreground"
                                }`}
                              >
                                <MessageAttachmentContent message={msg.message} className="text-sm whitespace-pre-wrap" />
                                <div className="flex items-center gap-1 mt-1">
                                  <span className={`text-[10px] ${msg.senderId === user?.id ? 'opacity-70' : 'text-muted-foreground'}`}>
                                    {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                  </span>
                                  {msg.senderId === user?.id && (
                                    <MessageStatusTicks
                                      status={msg.status || "sent"}
                                      deliveredAt={msg.deliveredAt}
                                      readAt={msg.readAt}
                                      isRead={msg.isRead}
                                    />
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                        {isPeerTyping && (
                          <div className="flex justify-start">
                            <TypingIndicator />
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </ScrollArea>

                  <div className="flex gap-2 pt-2 border-t">
                    <Input
                      placeholder="Type a message..."
                      value={message}
                      onChange={(e) => handleTypingChange(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
                      disabled={sendMessageMutation.isPending}
                      className="flex-1"
                    />
                    {message.trim() ? (
                      <Button
                        onClick={handleSendMessage}
                        disabled={sendMessageMutation.isPending || uploadingAudio}
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    ) : (
                      <VoiceRecorderControls
                        onSendAudio={handleSendAudio}
                        disabled={sendMessageMutation.isPending || uploadingAudio}
                      />
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">Select a conversation to start messaging</p>
                  </div>
                </div>
              )}
            </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
