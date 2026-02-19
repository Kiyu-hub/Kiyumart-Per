import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { useSocket } from "@/contexts/NotificationContext";
import { AlertCircle, Check, CheckCircle2, Clock, Loader2, MessageCircle, Mic, Paperclip, Send, Square, User, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SupportConversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  agentId: string | null;
  agentName: string | null;
  status: "open" | "assigned" | "resolved";
  subject: string;
  lastMessage: string;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string | null;
  senderProfileImage?: string | null;
  message: string;
  createdAt: string;
}

interface SupportAttachment {
  kind: "image" | "video" | "audio" | "file";
  url: string;
  name: string;
  size: number;
}

const SUPPORT_ATTACHMENT_PREFIX = "__SUPPORT_ATTACHMENT__:";
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024; // 5MB

function buildAttachmentMessage(attachment: SupportAttachment): string {
  return `${SUPPORT_ATTACHMENT_PREFIX}${encodeURIComponent(JSON.stringify(attachment))}`;
}

function parseAttachmentMessage(rawMessage: string): SupportAttachment | null {
  if (!rawMessage?.startsWith(SUPPORT_ATTACHMENT_PREFIX)) return null;
  try {
    const payload = rawMessage.slice(SUPPORT_ATTACHMENT_PREFIX.length);
    const parsed = JSON.parse(decodeURIComponent(payload));
    if (!parsed?.url || !parsed?.kind) return null;
    return parsed as SupportAttachment;
  } catch {
    return null;
  }
}

export default function CustomerSupport() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const socket = useSocket();
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [newSupportSubject, setNewSupportSubject] = useState("");
  const [newSupportMessage, setNewSupportMessage] = useState("");
  const [showNewTicketForm, setShowNewTicketForm] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const normalizedRole = useMemo(() => {
    if (!user?.role) return "buyer";
    return user.role === "superadmin" ? "super_admin" : user.role;
  }, [user?.role]);
  const isSupportStaff = normalizedRole === "agent" || normalizedRole === "admin" || normalizedRole === "super_admin";

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const { data: conversations = [], isLoading: conversationsLoading } = useQuery<SupportConversation[]>({
    queryKey: ["/api/support/conversations"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/support/conversations");
      return res.json();
    },
    enabled: isAuthenticated,
    refetchInterval: 5000,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
    queryKey: ["/api/support/conversations", selectedConversation, "/messages"],
    queryFn: async () => {
      if (!selectedConversation) return [];
      const res = await apiRequest("GET", `/api/support/conversations/${selectedConversation}/messages`);
      return res.json();
    },
    enabled: !!selectedConversation,
    refetchInterval: selectedConversation ? 3000 : false,
  });

  useEffect(() => {
    if (!socket) return;

    const handleSupportUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      if (selectedConversation) {
        queryClient.invalidateQueries({
          queryKey: ["/api/support/conversations", selectedConversation, "/messages"],
        });
      }
    };

    socket.on("support_conversation_updated", handleSupportUpdate);
    return () => {
      socket.off("support_conversation_updated", handleSupportUpdate);
    };
  }, [socket, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation && conversations.length > 0) {
      setSelectedConversation(conversations[0].id);
    }
  }, [conversations, selectedConversation]);

  const createTicketMutation = useMutation({
    mutationFn: async (data: { subject: string; message: string }) => {
      const res = await apiRequest("POST", "/api/support/conversations", data);
      return res.json();
    },
    onSuccess: (conversation: SupportConversation) => {
      toast({
        title: "Support Ticket Created",
        description: "We'll respond to your request soon.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setSelectedConversation(conversation.id);
      setNewSupportSubject("");
      setNewSupportMessage("");
      setShowNewTicketForm(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create support ticket",
        variant: "destructive",
      });
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (data: { conversationId: string; message: string }) => {
      const res = await apiRequest("POST", `/api/support/conversations/${data.conversationId}/messages`, {
        message: data.message,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConversation, "/messages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      setMessage("");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const assignConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", `/api/support/conversations/${conversationId}/assign`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({
        title: "Conversation Assigned",
        description: "This support ticket has been assigned to you",
      });
    },
  });

  const resolveConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", `/api/support/conversations/${conversationId}/resolve`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({
        title: "Conversation Resolved",
        description: "This support ticket has been marked as resolved",
      });
    },
  });

  const handleSendMessage = () => {
    if (!message.trim() || !selectedConversation) return;
    sendMessageMutation.mutate({ conversationId: selectedConversation, message: message.trim() });
  };

  const sendAttachmentMessage = (attachment: SupportAttachment) => {
    if (!selectedConversation) return;
    sendMessageMutation.mutate({
      conversationId: selectedConversation,
      message: buildAttachmentMessage(attachment),
    });
  };

  const uploadAttachment = async (file: File) => {
    if (file.size > MAX_ATTACHMENT_SIZE) {
      toast({
        title: "File too large",
        description: "Maximum supported size is 5MB.",
        variant: "destructive",
      });
      return;
    }

    const endpoint = "/api/upload/support-media";
    let kind: SupportAttachment["kind"] = "file";

    if (file.type.startsWith("image/")) {
      kind = "image";
    } else if (file.type.startsWith("video/")) {
      kind = "video";
    } else if (file.type.startsWith("audio/")) {
      kind = "audio";
    } else {
      toast({
        title: "Unsupported file",
        description: "Only image, video, or audio files are supported.",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setUploadingAttachment(true);
      const base = (import.meta.env as any).VITE_API_URL || "";
      const res = await fetch(`${base}${endpoint}`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Upload failed");
      }
      sendAttachmentMessage({
        kind,
        url: payload.url,
        name: file.name,
        size: file.size,
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploadingAttachment(false);
      if (attachmentInputRef.current) attachmentInputRef.current.value = "";
    }
  };

  const handleAttachmentPick = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadAttachment(file);
  };

  const stopRecordingAndUpload = () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== "recording") return;
    mediaRecorderRef.current.stop();
  };

  const toggleVoiceRecording = async () => {
    if (isRecording) {
      stopRecordingAndUpload();
      return;
    }

    try {
      setRecordingError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (evt) => {
        if (evt.data.size > 0) audioChunksRef.current.push(evt.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        setIsRecording(false);

        const file = new File([blob], `voice-note-${Date.now()}.webm`, {
          type: blob.type || "audio/webm",
        });
        await uploadAttachment(file);
      };

      recorder.start();
      setIsRecording(true);
    } catch (error: any) {
      setRecordingError(error?.message || "Could not start voice recording");
      toast({
        title: "Recording failed",
        description: "Please allow microphone access and try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateTicket = () => {
    if (!newSupportSubject.trim() || !newSupportMessage.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both subject and message",
        variant: "destructive",
      });
      return;
    }
    createTicketMutation.mutate({ subject: newSupportSubject, message: newSupportMessage });
  };

  const selectedConv = conversations.find(c => c.id === selectedConversation);

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-500";
      case "assigned": return "bg-blue-500";
      case "resolved": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  if (authLoading || !isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout role={normalizedRole as any} showBackButton={false}>
      <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
        <div className="flex items-center justify-between p-4 pb-0 md:p-6 md:pb-0 flex-shrink-0">
          <div>
            <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
              {isSupportStaff ? "Support Dashboard" : "Customer Support"}
            </h1>
            <p className="text-muted-foreground text-sm">
              {isSupportStaff
                ? "Manage and respond to customer requests"
                : "Get help from our support team"}
            </p>
          </div>
          {!isSupportStaff && (
            <Button
              size="sm"
              onClick={() => setShowNewTicketForm((prev) => !prev)}
              data-testid="button-new-ticket"
            >
              {showNewTicketForm ? "Close" : "New Ticket"}
            </Button>
          )}
        </div>

        <div className="flex-1 min-h-0 p-4 md:p-6 pt-4 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-0">
            <Card className="md:col-span-1 p-0 flex flex-col overflow-hidden" data-testid="card-conversations">
              {!isSupportStaff && showNewTicketForm && (
                <div className="p-4 border-b space-y-3">
                  <Input
                    placeholder="Subject"
                    value={newSupportSubject}
                    onChange={(e) => setNewSupportSubject(e.target.value)}
                    data-testid="input-ticket-subject"
                  />
                  <Textarea
                    placeholder="Describe your issue..."
                    value={newSupportMessage}
                    onChange={(e) => setNewSupportMessage(e.target.value)}
                    rows={4}
                    data-testid="textarea-ticket-message"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreateTicket}
                      disabled={createTicketMutation.isPending}
                      className="flex-1"
                      data-testid="button-create-ticket"
                    >
                      {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setShowNewTicketForm(false);
                        setNewSupportSubject("");
                        setNewSupportMessage("");
                      }}
                      data-testid="button-cancel-ticket"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0">
                <span className="flex items-center gap-2 font-semibold">
                  <MessageCircle className="h-4 w-4" />
                  {isSupportStaff ? "All Tickets" : "My Tickets"}
                </span>
                <Badge variant="secondary">{conversations.length}</Badge>
              </div>
              <ScrollArea className="flex-1 min-h-0">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                    Loading conversations...
                  </div>
                ) : conversations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    {isSupportStaff ? "No support tickets yet" : "No support tickets. Create one to get help."}
                  </div>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      className={`w-full text-left p-4 border-b transition-colors ${
                        selectedConversation === conv.id ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedConversation(conv.id)}
                      data-testid={`conversation-${conv.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{conv.subject}</p>
                          {isSupportStaff && (
                            <p className="text-xs text-muted-foreground truncate">{conv.customerName || conv.customerEmail}</p>
                          )}
                        </div>
                        <Badge className={`${getStatusColor(conv.status)} text-white`}>{conv.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground truncate mb-1">
                        {(() => {
                          const attachment = parseAttachmentMessage(conv.lastMessage || "");
                          if (!attachment) return conv.lastMessage;
                          if (attachment.kind === "image") return "Image attachment";
                          if (attachment.kind === "video") return "Video attachment";
                          if (attachment.kind === "audio") return "Voice note";
                          return "File attachment";
                        })()}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                      </p>
                    </button>
                  ))
                )}
              </ScrollArea>
            </Card>

            <Card className="md:col-span-2 p-0 flex flex-col overflow-hidden" data-testid="card-messages">
              {selectedConv ? (
                <div className="flex flex-col h-full min-h-0">
                  <div className="p-4 border-b flex items-start justify-between gap-3 flex-shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h2 className="font-semibold truncate">{selectedConv.subject}</h2>
                        <Badge className={`${getStatusColor(selectedConv.status)} text-white`}>{selectedConv.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground truncate">
                        {isSupportStaff
                          ? `Customer: ${selectedConv.customerName || "Unknown"} (${selectedConv.customerEmail || "No email"})`
                          : selectedConv.agentName
                            ? `Agent: ${selectedConv.agentName}`
                            : "Waiting for agent assignment"}
                      </p>
                    </div>
                    {isSupportStaff && (
                      <div className="flex items-center gap-2">
                        {selectedConv.status === "open" && (
                          <Button
                            size="sm"
                            onClick={() => assignConversationMutation.mutate(selectedConv.id)}
                            disabled={assignConversationMutation.isPending}
                            data-testid="button-assign"
                          >
                            Assign to Me
                          </Button>
                        )}
                        {selectedConv.status !== "resolved" && selectedConv.agentId === user?.id && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resolveConversationMutation.mutate(selectedConv.id)}
                            disabled={resolveConversationMutation.isPending}
                            data-testid="button-resolve"
                          >
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Resolve
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  <ScrollArea className="flex-1 min-h-0 p-4">
                    {messagesLoading ? (
                      <div className="text-center py-10 text-muted-foreground">
                        <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                        Loading messages...
                      </div>
                    ) : messages.length === 0 ? (
                      <div className="text-center py-10 text-muted-foreground">No messages yet</div>
                    ) : (
                      <div className="space-y-4">
                        {messages.map((msg) => {
                          const isMe = msg.senderId === user?.id;
                          const attachment = parseAttachmentMessage(msg.message);
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
                              data-testid={`message-${msg.id}`}
                            >
                              {!isMe && (
                                <div className="mr-2 mt-1">
                                  {msg.senderProfileImage ? (
                                    <img
                                      src={msg.senderProfileImage}
                                      alt={msg.senderName || "User"}
                                      className="h-8 w-8 rounded-full object-cover border"
                                    />
                                  ) : (
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                              )}
                              <div
                                className={`max-w-[80%] rounded-lg p-3 ${
                                  isMe ? "bg-primary text-primary-foreground" : "bg-muted"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <User className="h-3 w-3" />
                                  <span className="text-xs font-medium">{msg.senderName || "Unknown"}</span>
                                </div>
                                {attachment ? (
                                  <div className="space-y-2">
                                    {attachment.kind === "image" && (
                                      <img
                                        src={attachment.url}
                                        alt={attachment.name}
                                        className="max-h-56 rounded-md border object-cover"
                                      />
                                    )}
                                    {attachment.kind === "video" && (
                                      <video
                                        src={attachment.url}
                                        controls
                                        className="max-h-64 rounded-md border"
                                      />
                                    )}
                                    {attachment.kind === "audio" && (
                                      <audio src={attachment.url} controls className="w-full max-w-xs" />
                                    )}
                                    <a
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className={`text-xs underline ${isMe ? "text-primary-foreground/90" : "text-primary"}`}
                                    >
                                      {attachment.name}
                                    </a>
                                  </div>
                                ) : (
                                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                )}
                                <div className="text-xs mt-1 opacity-70 flex items-center gap-1 justify-end">
                                  <span>{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                                  {isMe && <Check className="h-3 w-3" />}
                                </div>
                              </div>
                              {isMe && (
                                <div className="ml-2 mt-1">
                                  {user?.profileImage ? (
                                    <img
                                      src={user.profileImage}
                                      alt={user.name || "You"}
                                      className="h-8 w-8 rounded-full object-cover border"
                                    />
                                  ) : (
                                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                      <User className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  {selectedConv.status !== "resolved" && (
                    <div className="p-4 border-t flex gap-2 flex-shrink-0">
                      <input
                        ref={attachmentInputRef}
                        type="file"
                        accept="image/*,video/*,audio/*"
                        onChange={handleAttachmentPick}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => attachmentInputRef.current?.click()}
                        disabled={uploadingAttachment || sendMessageMutation.isPending}
                        title="Upload media"
                      >
                        {uploadingAttachment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                      </Button>
                      <Button
                        type="button"
                        variant={isRecording ? "destructive" : "outline"}
                        size="icon"
                        onClick={toggleVoiceRecording}
                        disabled={uploadingAttachment || sendMessageMutation.isPending}
                        title={isRecording ? "Stop recording" : "Record voice note"}
                      >
                        {isRecording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                      </Button>
                      <Input
                        placeholder="Type your message..."
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        data-testid="input-message"
                      />
                      <Button
                        onClick={handleSendMessage}
                        disabled={sendMessageMutation.isPending || uploadingAttachment || !message.trim()}
                        data-testid="button-send"
                      >
                        {sendMessageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                      {recordingError && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setRecordingError(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Select a conversation to view messages</p>
                </div>
              )}
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
