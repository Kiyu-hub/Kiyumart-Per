import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare, Send, Search, ArrowLeft, Store, Bike } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useSocket } from "@/contexts/NotificationContext";
import VoiceRecorderControls from "@/components/VoiceRecorderControls";
import MessageAttachmentContent from "@/components/MessageAttachmentContent";
import { buildChatAttachmentMessage } from "@/lib/chatAttachments";
import UserAvatar from "@/components/UserAvatar";
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

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  createdAt: string;
  isRead: boolean;
  status: "sent" | "delivered" | "read";
  deliveredAt?: string | null;
  readAt?: string | null;
}

function ContactList({
  contacts,
  selectedUserId,
  onSelect,
  emptyText,
}: {
  contacts: Contact[];
  selectedUserId: string | null;
  onSelect: (id: string) => void;
  emptyText: string;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q));
  }, [contacts, search]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="p-3 border-b shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-9"
          />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((contact) => (
              <button
                key={contact.id}
                onClick={() => onSelect(contact.id)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  selectedUserId === contact.id ? "bg-primary/10 text-primary" : "hover:bg-muted"
                }`}
              >
                <Avatar className="h-9 w-9 shrink-0">
                  <AvatarImage src={contact.profileImage || undefined} />
                  <AvatarFallback className="text-xs">{contact.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{contact.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export default function AgentDirectMessages() {
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();
  const showRidersTab = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;

  const urlParams = new URLSearchParams(window.location.search);
  const userIdParam = urlParams.get("userId");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "agent")) navigate("/");
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const { data: contactsData, isLoading: contactsLoading } = useQuery<ContactsData>({
    queryKey: ["/api/agent/contacts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/contacts");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "agent",
  });

  // Only contacts who have previously sent a message
  const sellerContacts = useMemo<Contact[]>(
    () => (contactsData?.sellers || []).filter((c) => c.hasMessaged),
    [contactsData]
  );
  const riderContacts = useMemo<Contact[]>(
    () => (contactsData?.riders || []).filter((c) => c.hasMessaged),
    [contactsData]
  );
  const allContacts = useMemo<Contact[]>(
    () => [...sellerContacts, ...(showRidersTab ? riderContacts : [])],
    [sellerContacts, riderContacts, showRidersTab]
  );

  useEffect(() => {
    if (userIdParam && allContacts.length > 0 && !selectedUserId) {
      const found = allContacts.find((c) => c.id === userIdParam);
      if (found) setSelectedUserId(found.id);
      else setSelectedUserId(userIdParam);
    }
  }, [userIdParam, allContacts, selectedUserId]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedUserId, messages.length]);

  useEffect(() => {
    if (!socket || !selectedUserId) return;
    const handleNewMessage = (msg: Message) => {
      if (msg.receiverId === user?.id) socket.emit("message_delivered", { messageId: msg.id });
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
    const handleStatusUpdated = (data: { messageId: string; status: "sent" | "delivered" | "read"; deliveredAt?: string; readAt?: string }) => {
      queryClient.setQueryData<Message[]>(["/api/messages", selectedUserId], (old) => {
        if (!old) return old;
        return old.map((m) => m.id === data.messageId ? { ...m, ...data } : m);
      });
    };
    const handleUserTyping = (payload: any) => {
      if ((typeof payload === "string" ? payload : payload?.userId) === selectedUserId) setIsPeerTyping(true);
    };
    const handleUserStopTyping = (payload: any) => {
      if ((typeof payload === "string" ? payload : payload?.userId) === selectedUserId) setIsPeerTyping(false);
    };
    socket.on("new_message", handleNewMessage);
    socket.on("message_status_updated", handleStatusUpdated);
    socket.on("user_typing", handleUserTyping);
    socket.on("user_stop_typing", handleUserStopTyping);
    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_status_updated", handleStatusUpdated);
      socket.off("user_typing", handleUserTyping);
      socket.off("user_stop_typing", handleUserStopTyping);
    };
  }, [socket, selectedUserId, user?.id]);

  useEffect(() => {
    setIsPeerTyping(false);
    seenMessageIdsRef.current.clear();
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
  }, [selectedUserId]);

  const sendMutation = useMutation({
    mutationFn: async (data: { receiverId: string; message: string }) => {
      return apiRequest("POST", "/api/messages", data);
    },
    onSuccess: (_, vars) => {
      setMessage("");
      queryClient.invalidateQueries({ queryKey: ["/api/messages", vars.receiverId] });
    },
    onError: () => toast({ title: "Send failed", variant: "destructive" }),
  });

  const handleSend = () => {
    if (message.trim() && selectedUserId) {
      if (isTypingRef.current) {
        socket?.emit("stop_typing", { receiverId: selectedUserId });
        isTypingRef.current = false;
      }
      sendMutation.mutate({ receiverId: selectedUserId, message: message.trim() });
    }
  };

  const handleTyping = (value: string) => {
    setMessage(value);
    if (!socket || !selectedUserId) return;
    if (value.trim() && !isTypingRef.current) {
      socket.emit("typing", { receiverId: selectedUserId });
      isTypingRef.current = true;
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current) {
        socket?.emit("stop_typing", { receiverId: selectedUserId });
        isTypingRef.current = false;
      }
    }, 1200);
  };

  const handleSendAudio = async (file: File) => {
    if (!selectedUserId) return;
    try {
      setUploadingAudio(true);
      const formData = new FormData();
      formData.append("file", file);
      const uploadRes = await fetch("/api/upload/audio", { method: "POST", credentials: "include", body: formData });
      const payload = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok || !payload?.url) throw new Error(payload?.error || "Failed to upload voice note");
      await sendMutation.mutateAsync({
        receiverId: selectedUserId,
        message: buildChatAttachmentMessage({ kind: "audio", url: payload.url, name: file.name, size: file.size }),
      });
    } catch (error: any) {
      toast({ title: "Voice note failed", description: error?.message, variant: "destructive" });
    } finally {
      setUploadingAudio(false);
    }
  };

  const selectedContact = allContacts.find((c) => c.id === selectedUserId) || null;
  const deduped = Array.from(new Map(messages.map((m) => [m.id, m])).values());

  if (authLoading || !isAuthenticated || user?.role !== "agent") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const chatPanel = (
    <div className={`flex-1 flex flex-col min-w-0 ${selectedUserId ? "flex" : "hidden md:flex"}`}>
      {selectedUserId && selectedContact ? (
        <>
          <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0 bg-card">
            <Button variant="ghost" size="icon" className="md:hidden h-8 w-8" onClick={() => setSelectedUserId(null)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Avatar className="h-9 w-9">
              <AvatarImage src={selectedContact.profileImage || undefined} />
              <AvatarFallback>{selectedContact.name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{selectedContact.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{selectedContact.role}</p>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            {messagesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : deduped.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No messages yet. Start the conversation.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deduped.map((msg) => (
                  <div key={msg.id} className={`flex gap-2 ${msg.senderId === user?.id ? "flex-row-reverse" : ""}`}>
                    <UserAvatar
                      profileImage={msg.senderId === user?.id ? (user?.profileImage || null) : (selectedContact?.profileImage || null)}
                      name={msg.senderId === user?.id ? (user?.name || "Me") : (selectedContact?.name || "User")}
                      email={msg.senderId === user?.id ? user?.email : selectedContact?.email}
                      size="sm"
                      className="shrink-0"
                    />
                    <div className={`flex-1 ${msg.senderId === user?.id ? "text-right" : ""}`}>
                      <div className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                        msg.senderId === user?.id ? "bg-primary text-primary-foreground" : "bg-muted"
                      }`}>
                        <MessageAttachmentContent message={msg.message} className="text-sm whitespace-pre-wrap" />
                        <div className="flex items-center gap-1 mt-1 justify-end">
                          <span className="text-[10px] opacity-70">
                            {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                          </span>
                          {msg.senderId === user?.id && (
                            <MessageStatusTicks status={msg.status || "sent"} deliveredAt={msg.deliveredAt} readAt={msg.readAt} isRead={msg.isRead} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {isPeerTyping && <div className="flex justify-start"><TypingIndicator /></div>}
                <div ref={messagesEndRef} />
              </div>
            )}
          </ScrollArea>

          <div className="flex gap-2 p-3 border-t shrink-0 bg-card">
            <Input
              placeholder="Type a message..."
              value={message}
              onChange={(e) => handleTyping(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              disabled={sendMutation.isPending}
              className="flex-1"
            />
            {message.trim() ? (
              <Button onClick={handleSend} disabled={sendMutation.isPending || uploadingAudio} size="icon">
                {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            ) : (
              <VoiceRecorderControls onSendAudio={handleSendAudio} disabled={sendMutation.isPending || uploadingAudio} />
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <MessageSquare className="h-14 w-14 text-muted-foreground mb-4" />
          <p className="text-lg font-semibold">Select a contact</p>
          <p className="text-sm text-muted-foreground mt-1">Choose a seller{showRidersTab ? " or rider" : ""} from the list to start messaging.</p>
        </div>
      )}
    </div>
  );

  return (
    <DashboardLayout role="agent">
      <div className="flex h-[calc(100vh-64px)] overflow-hidden">
        {/* Contact sidebar with tabs */}
        <div className={`w-80 shrink-0 border-r flex flex-col bg-card ${selectedUserId ? "hidden md:flex" : "flex"}`}>
          {contactsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
            <Tabs defaultValue="sellers" className="flex flex-col h-full">
              <div className="border-b px-3 pt-3">
                <TabsList className="w-full">
                  <TabsTrigger value="sellers" className="flex-1 flex items-center justify-center gap-1.5">
                    <Store className="h-3.5 w-3.5" />
                    Sellers
                    {sellerContacts.length > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{sellerContacts.length}</Badge>
                    )}
                  </TabsTrigger>
                  {showRidersTab && (
                    <TabsTrigger value="riders" className="flex-1 flex items-center justify-center gap-1.5">
                      <Bike className="h-3.5 w-3.5" />
                      Riders
                      {riderContacts.length > 0 && (
                        <Badge variant="secondary" className="text-[10px] px-1 py-0 ml-1">{riderContacts.length}</Badge>
                      )}
                    </TabsTrigger>
                  )}
                </TabsList>
              </div>

              <TabsContent value="sellers" className="flex flex-col flex-1 min-h-0 mt-0">
                <ContactList
                  contacts={sellerContacts}
                  selectedUserId={selectedUserId}
                  onSelect={setSelectedUserId}
                  emptyText="No sellers have sent messages yet."
                />
              </TabsContent>

              {showRidersTab && (
                <TabsContent value="riders" className="flex flex-col flex-1 min-h-0 mt-0">
                  <ContactList
                    contacts={riderContacts}
                    selectedUserId={selectedUserId}
                    onSelect={setSelectedUserId}
                    emptyText="No riders have sent messages yet."
                  />
                </TabsContent>
              )}
            </Tabs>
          )}
        </div>

        {chatPanel}
      </div>
    </DashboardLayout>
  );
}
