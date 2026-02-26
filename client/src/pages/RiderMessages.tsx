import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, MessageSquare, Send, ArrowLeft, User } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { useSocket } from "@/contexts/NotificationContext";
import { usePresence, useBatchPresence, formatLastSeen } from "@/hooks/usePresence";
import VoiceRecorderControls from "@/components/VoiceRecorderControls";
import MessageAttachmentContent from "@/components/MessageAttachmentContent";
import { buildChatAttachmentMessage } from "@/lib/chatAttachments";

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

const SUPPORT_ROLES = new Set(["support_agent", "agent", "admin", "super_admin", "superadmin", "administrator"]);

export default function RiderMessages() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // Get userId from URL search params
  const urlParams = new URLSearchParams(window.location.search);
  const userIdFilter = urlParams.get("userId");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "rider")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Listen for real-time messages
  useEffect(() => {
    if (!socket || !selectedUserId) return;

    const handleNewMessage = (msg: Message) => {
      // Receiver acknowledges delivery so sender gets double gray ticks
      if (msg.receiverId === user?.id) {
        socket.emit("message_delivered", { messageId: msg.id });
      }
      if (msg.senderId === selectedUserId || msg.receiverId === selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
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
  }, [selectedUserId]);

  // Fetch rider chat contacts (masked support + active-order stakeholders only).
  const { data: users = [], isLoading: usersLoading } = useQuery<UserData[]>({
    queryKey: ["/api/rider/message-contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/rider/message-contacts");
      if (!res.ok) throw new Error("Failed to load contacts");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "rider",
    refetchInterval: 15000,
  });

  const normalizedUsers = useMemo(() => {
    const mapped: UserData[] = [];
    let supportInserted = false;
    for (const u of users) {
      if (SUPPORT_ROLES.has(String(u.role || "").toLowerCase())) {
        if (!supportInserted) {
          mapped.push({
            ...u,
            name: "Support Agent",
            role: "support_agent",
            email: "support@kiyumart.com",
          });
          supportInserted = true;
        }
        continue;
      }
      mapped.push(u);
    }
    return mapped;
  }, [users]);

  // Auto-select user only when the contact is still allowed (support or active-order stakeholder).
  useEffect(() => {
    if (userIdFilter && normalizedUsers.length > 0 && !selectedUserId) {
      const targetUser = normalizedUsers.find(u => u.id === userIdFilter);
      if (targetUser) {
        setSelectedUserId(targetUser.id);
      }
    }
  }, [userIdFilter, normalizedUsers, selectedUserId]);

  useEffect(() => {
    if (!selectedUserId) return;
    const stillAllowed = normalizedUsers.some((u) => u.id === selectedUserId);
    if (!stillAllowed) {
      setSelectedUserId(null);
    }
  }, [normalizedUsers, selectedUserId]);

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

  useEffect(() => {
    if (!socket || !selectedUserId || messages.length === 0) return;

    const incoming = messages.filter((m) => m.senderId === selectedUserId);
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
  }, [socket, selectedUserId, messages, markConversationReadMutation.isPending]);

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

  const filteredUsers = normalizedUsers.filter(u => 
    u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedUser = normalizedUsers.find(u => u.id === selectedUserId);
  const selectedUserPresence = usePresence(selectedUserId || undefined);
  const userIds = filteredUsers.map((u) => u.id);
  const batchPresence = useBatchPresence(userIds);

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
    navigate("/rider");
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case "admin":
      case "super_admin":
        return "bg-purple-500 text-white";
      case "support_agent":
        return "bg-emerald-600 text-white";
      case "seller":
        return "bg-green-500 text-white";
      case "buyer":
        return "bg-blue-500 text-white";
      case "agent":
        return "bg-orange-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  if (authLoading) {
    return (
      <DashboardLayout role="rider">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="rider">
      <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
        <div className="flex items-center gap-4 p-4 md:p-6 flex-shrink-0">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold">Messages</h1>
            <p className="text-muted-foreground text-sm">Chat with support and active delivery contacts</p>
          </div>
        </div>

        {/* Mobile: Show user list or chat */}
        <div className="md:hidden flex-1 min-h-0 flex flex-col p-4 pt-0">
          {!selectedUserId ? (
            <Card className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <ScrollArea className="flex-1">
                {usersLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No conversations yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredUsers.map((userData) => (
                      <div
                        key={userData.id}
                        onClick={() => setSelectedUserId(userData.id)}
                        className="p-3 rounded-lg cursor-pointer hover:bg-muted/70 flex items-center gap-3"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={userData.profileImage || undefined} alt={userData.name || userData.email} />
                          <AvatarFallback>
                            {(userData.name || "U").charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{userData.name || userData.email}</p>
                          <div className="flex items-center gap-2">
                            <Badge className={`${getRoleBadgeColor(userData.role)} text-[10px] px-1.5 py-0`}>
                              {userData.role === "support_agent" ? "support" : userData.role}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {batchPresence.getPresence(userData.id).status === "online"
                                ? "Online"
                                : formatLastSeen(batchPresence.getPresence(userData.id).lastSeen)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          ) : (
            <Card className="h-full flex flex-col">
              <div className="flex items-center gap-3 p-3 border-b">
                <Button variant="ghost" size="icon" onClick={() => setSelectedUserId(null)}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex-1">
                  <h3 className="font-semibold text-sm">{selectedUser?.name || "Support Agent"}</h3>
                  <p className={`text-xs ${selectedUserPresence.isOnline ? "text-green-600" : "text-muted-foreground"}`}>
                    {isPeerTyping
                      ? "typing..."
                      : selectedUserPresence.isOnline
                      ? "Online"
                      : selectedUserPresence.presence?.lastSeen
                      ? `Last seen ${formatLastSeen(selectedUserPresence.presence.lastSeen)}`
                      : (selectedUser?.role === "support_agent" ? "Support Agent" : selectedUser?.role || "Unknown")}
                  </p>
                </div>
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
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderId === user?.id ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] px-3 py-2 rounded-2xl ${
                            msg.senderId === user?.id
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
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
          )}
        </div>

        {/* Desktop: Side-by-side layout */}
        <div className="hidden md:flex md:flex-col flex-1 min-h-0 p-6 pt-0">
          <div className="grid grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
            <Card className="col-span-1 p-4 flex flex-col overflow-hidden">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contacts..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1">
                {usersLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No conversations yet</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredUsers.map((userData) => (
                      <div
                        key={userData.id}
                        onClick={() => setSelectedUserId(userData.id)}
                        className={`p-3 rounded-lg cursor-pointer ${
                          selectedUserId === userData.id
                            ? "bg-muted border border-border"
                            : "hover:bg-muted/70"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={userData.profileImage || undefined} alt={userData.name || userData.email} />
                            <AvatarFallback>
                              {(userData.name || "U").charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm truncate">{userData.name || userData.email}</p>
                            <div className="flex items-center gap-2">
                              <Badge className={`${getRoleBadgeColor(userData.role)} text-[10px] px-1.5 py-0`}>
                                {userData.role === "support_agent" ? "support" : userData.role}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">
                                {batchPresence.getPresence(userData.id).status === "online"
                                  ? "Online"
                                  : formatLastSeen(batchPresence.getPresence(userData.id).lastSeen)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>

            <Card className="col-span-2 p-4 flex flex-col overflow-hidden">
              {selectedUser || selectedUserId ? (
                <>
                  <div className="flex items-center gap-3 pb-4 border-b mb-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={selectedUser?.profileImage || undefined} alt={selectedUser?.name || "Support"} />
                      <AvatarFallback>
                        {(selectedUser?.name || "S").charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="font-semibold text-lg">{selectedUser?.name || "Support Agent"}</h3>
                      <p className={`text-xs ${selectedUserPresence.isOnline ? "text-green-600" : "text-muted-foreground"}`}>
                        {isPeerTyping
                          ? "typing..."
                          : selectedUserPresence.isOnline
                          ? "Online"
                          : selectedUserPresence.presence?.lastSeen
                          ? `Last seen ${formatLastSeen(selectedUserPresence.presence.lastSeen)}`
                          : (selectedUser?.role === "support_agent" ? "Support Agent" : selectedUser?.role || "Support")}
                      </p>
                    </div>
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
                        {messages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex gap-3 ${msg.senderId === user?.id ? "flex-row-reverse" : ""}`}
                          >
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                            <div className={`flex-1 ${msg.senderId === user?.id ? "text-right" : ""}`}>
                              <div
                                className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                                  msg.senderId === user?.id
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-muted"
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
      </div>
    </DashboardLayout>
  );
}
