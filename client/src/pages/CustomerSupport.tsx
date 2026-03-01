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
import { formatLastSeen, useBatchPresence, usePresence } from "@/hooks/usePresence";
import { AlertCircle, CheckCircle2, Clock, Loader2, MessageCircle, Paperclip, Phone, RefreshCw, Send, ShieldCheck, User, Video } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import VoiceRecorderControls from "@/components/VoiceRecorderControls";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import { JitsiCallDialog } from "@/components/JitsiCallDialog";

interface SupportConversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerProfileImage?: string | null;
  agentId: string | null;
  agentName: string | null;
  agentRole?: string | null;
  agentProfileImage?: string | null;
  routingMode?: "all_support" | "all_agents" | "all_admins" | "specific_staff";
  routingUserIds?: string[] | null;
  lastSupportResponderId?: string | null;
  lastSupportResponderName?: string | null;
  lastSupportResponderRole?: string | null;
  status: "open" | "assigned" | "resolved";
  subject: string;
  lastMessage: string;
  unreadCount?: number;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SupportStaffUser {
  id: string;
  name: string;
  email: string;
  role: "agent" | "admin" | "super_admin";
  isActive: boolean;
}

interface Message {
  id: string;
  senderId: string;
  senderName: string | null;
  senderDisplayName?: string | null;
  senderRole?: string | null;
  senderProfileImage?: string | null;
  message: string;
  isRead?: boolean | null;
  readAt?: string | null;
  createdAt: string;
}

interface SupportAttachment {
  kind: "image" | "video" | "audio" | "file";
  url: string;
  name: string;
  size: number;
}

const SUPPORT_ATTACHMENT_PREFIX = "__SUPPORT_ATTACHMENT__:";
const MAX_ATTACHMENT_MB = Number((import.meta.env as any).VITE_SUPPORT_ATTACHMENT_MAX_MB || 5);
const MAX_ATTACHMENT_SIZE = MAX_ATTACHMENT_MB * 1024 * 1024;

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

function isSystemIdentityText(value?: string | null): boolean {
  const normalized = String(value || "").toLowerCase().trim();
  return normalized.includes("system");
}

function sanitizeSupportDisplayName(name?: string | null, fallback = "Support Team"): string {
  if (isSystemIdentityText(name)) return "Super Administrator";
  const normalized = String(name || "").trim();
  return normalized || fallback;
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
  const [staffTicketFilter, setStaffTicketFilter] = useState<"open" | "assigned" | "resolved" | "all">("all");
  const [routingMode, setRoutingMode] = useState<"all_support" | "all_agents" | "all_admins" | "specific_staff">("all_support");
  const [routingUserIds, setRoutingUserIds] = useState<string[]>([]);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const jitsiCall = useJitsiCall(user?.id || "");
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localTypingStopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);

  const normalizedRole = useMemo(() => {
    if (!user?.role) return "buyer";
    return user.role === "superadmin" ? "super_admin" : user.role;
  }, [user?.role]);
  const isSupportStaff = normalizedRole === "agent" || normalizedRole === "admin" || normalizedRole === "super_admin";
  const isSuperAdmin = normalizedRole === "super_admin";

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  const {
    data: conversations = [],
    isLoading: conversationsLoading,
    isFetching: conversationsRefreshing,
    refetch: refetchConversations,
    dataUpdatedAt: conversationsUpdatedAt,
  } = useQuery<SupportConversation[]>({
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

  const { data: supportStaff = [] } = useQuery<SupportStaffUser[]>({
    queryKey: ["/api/support/staff"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/support/staff");
      return res.json();
    },
    enabled: isAuthenticated && isSuperAdmin,
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

  useEffect(() => {
    if (conversations.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const conversationId = params.get("conversationId");
    if (!conversationId) return;
    const exists = conversations.some((conv) => conv.id === conversationId);
    if (exists) setSelectedConversation(conversationId);
  }, [conversations]);

  useEffect(() => {
    const incomingCallerId = jitsiCall.incomingCall?.callerId;
    if (!incomingCallerId || conversations.length === 0) return;

    const matchingConversation = conversations.find((conv) => {
      if (isSupportStaff) return conv.customerId === incomingCallerId;
      return conv.agentId === incomingCallerId;
    });

    if (matchingConversation && selectedConversation !== matchingConversation.id) {
      setSelectedConversation(matchingConversation.id);
    }
  }, [conversations, isSupportStaff, jitsiCall.incomingCall?.callerId, selectedConversation]);

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

  const resolveConversationMutation = useMutation({
    mutationFn: async (conversationId: string) => {
      const res = await apiRequest("POST", `/api/support/conversations/${conversationId}/resolve`, {});
      return res.json();
    },
    onSuccess: (updatedConversation: SupportConversation) => {
      queryClient.setQueryData<SupportConversation[]>(["/api/support/conversations"], (current = []) =>
        current.map((conversation) =>
          conversation.id === updatedConversation.id
            ? {
                ...conversation,
                status: updatedConversation.status,
                resolvedAt: updatedConversation.resolvedAt ?? new Date().toISOString(),
                updatedAt: updatedConversation.updatedAt ?? new Date().toISOString(),
              }
            : conversation
        )
      );
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({
        title: "Conversation Resolved",
        description: "This support ticket has been marked as resolved",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Resolve failed",
        description: error.message || "Unable to resolve this conversation",
        variant: "destructive",
      });
    },
  });

  const updateRoutingMutation = useMutation({
    mutationFn: async (payload: {
      conversationId: string;
      mode: "all_support" | "all_agents" | "all_admins" | "specific_staff";
      routingUserIds: string[];
    }) => {
      const res = await apiRequest("PATCH", `/api/support/conversations/${payload.conversationId}/routing`, {
        mode: payload.mode,
        routingUserIds: payload.routingUserIds,
      });
      return res.json();
    },
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey: ["/api/support/conversations"] });
      const previousConversations = queryClient.getQueryData<SupportConversation[]>(["/api/support/conversations"]);
      const assignedAgentId =
        payload.mode === "specific_staff" && payload.routingUserIds.length > 0
          ? payload.routingUserIds[0]
          : null;

      queryClient.setQueryData<SupportConversation[]>(["/api/support/conversations"], (current = []) =>
        current.map((conversation) =>
          conversation.id === payload.conversationId
            ? {
                ...conversation,
                routingMode: payload.mode,
                routingUserIds: payload.mode === "specific_staff" ? payload.routingUserIds : [],
                agentId: assignedAgentId,
                status: conversation.status === "resolved" ? "resolved" : assignedAgentId ? "assigned" : "open",
                updatedAt: new Date().toISOString(),
              }
            : conversation,
        ),
      );

      return { previousConversations };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      toast({
        title: "Support routing updated",
        description: "Conversation recipients were updated successfully.",
      });
    },
    onError: (error: Error, _payload, context) => {
      if (context?.previousConversations) {
        queryClient.setQueryData(["/api/support/conversations"], context.previousConversations);
      }
      toast({
        title: "Routing update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = () => {
    if (!message.trim() || !selectedConversation) return;
    if (socket && peerUserId) {
      socket.emit("stop_typing", { receiverId: peerUserId });
    }
    if (socket) {
      socket.emit("support_stop_typing", { conversationId: selectedConversation });
    }
    sendMessageMutation.mutate({ conversationId: selectedConversation, message: message.trim() });
  };

  const handleStartSupportCall = async (callType: "voice" | "video") => {
    if (!peerUserId) {
      toast({
        title: "No recipient",
        description: "Select a support conversation first.",
        variant: "destructive",
      });
      return;
    }
    try {
      await jitsiCall.startCall(peerUserId, callType);
    } catch (error: any) {
      toast({
        title: "Call failed",
        description: error?.message || "Unable to start call",
        variant: "destructive",
      });
    }
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
        description: `Maximum supported size is ${MAX_ATTACHMENT_MB}MB.`,
        variant: "destructive",
      });
      return;
    }

    const primaryEndpoint = "/api/upload/support-media";
    let kind: SupportAttachment["kind"] = "file";
    let legacyEndpoint = "";

    if (file.type.startsWith("image/")) {
      kind = "image";
      legacyEndpoint = "/api/upload/image";
    } else if (file.type.startsWith("video/")) {
      kind = "video";
      legacyEndpoint = "/api/upload/video";
    } else if (file.type.startsWith("audio/")) {
      kind = "audio";
      legacyEndpoint = "/api/upload/audio";
    } else {
      toast({
        title: "Unsupported file",
        description: "Only image, video, or audio files are supported.",
        variant: "destructive",
      });
      return;
    }

    try {
      setUploadingAttachment(true);
      const envBase = (import.meta.env as any).VITE_API_URL || "";
      const candidatesRaw: string[] = [];
      const add = (url?: string) => {
        if (url && !candidatesRaw.includes(url)) candidatesRaw.push(url);
      };

      if (envBase) {
        add(`${envBase}${primaryEndpoint}`);
        if (legacyEndpoint) add(`${envBase}${legacyEndpoint}`);
      }

      // Explicit backend candidates first
      if (typeof window !== "undefined") {
        const host = window.location.hostname;
        const protocol = window.location.protocol === "https:" ? "https:" : "http:";
        add(`${protocol}//${host}:5000${primaryEndpoint}`);
        if (legacyEndpoint) add(`${protocol}//${host}:5000${legacyEndpoint}`);
      }
      add(`http://localhost:5000${primaryEndpoint}`);
      if (legacyEndpoint) add(`http://localhost:5000${legacyEndpoint}`);
      add(`http://127.0.0.1:5000${primaryEndpoint}`);
      if (legacyEndpoint) add(`http://127.0.0.1:5000${legacyEndpoint}`);
      // Same-origin proxy candidates last
      add(primaryEndpoint);
      if (legacyEndpoint) add(legacyEndpoint);

      const candidates = candidatesRaw;

      let payload: any = null;
      let lastError = "Upload failed";

      for (const url of candidates) {
        let res: Response;
        try {
          const formData = new FormData();
          formData.append("file", file);
          res = await fetch(url, {
            method: "POST",
            body: formData,
            credentials: "include",
          });
        } catch (networkErr: any) {
          lastError = networkErr?.message || "Network error";
          continue;
        }

        const contentType = res.headers.get("content-type") || "";
        const raw = await res.text();
        let parsed: any = null;

        if (contentType.includes("application/json")) {
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = null;
          }
        }

        if (res.ok && parsed?.url) {
          payload = parsed;
          break;
        }

        lastError = parsed?.error
          || (contentType.includes("text/html")
            ? "Backend upload endpoint returned HTML. Check API base/proxy and backend status."
            : raw.slice(0, 180) || `Upload failed (${res.status})`);
      }

      if (!payload?.url) {
        throw new Error(lastError);
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

  const handleSendAudio = async (file: File) => {
    await uploadAttachment(file);
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
  const supportStaffById = useMemo(
    () => new Map(supportStaff.map((staff) => [String(staff.id), staff])),
    [supportStaff],
  );
  const selectableSupportStaff = useMemo(
    () =>
      supportStaff.filter(
        (staff) =>
          Boolean(staff.isActive) &&
          staff.role !== "super_admin" &&
          !isSystemIdentityText(staff.name) &&
          !isSystemIdentityText(staff.email),
      ),
    [supportStaff],
  );
  const selectableStaffIdSet = useMemo(
    () => new Set(selectableSupportStaff.map((staff) => String(staff.id))),
    [selectableSupportStaff],
  );
  const getAssignedStaffNames = (conversation: SupportConversation): string[] => {
    const assignedNames: string[] = [];
    const routingIds = Array.isArray(conversation.routingUserIds) ? conversation.routingUserIds.map(String) : [];
    for (const id of routingIds) {
      const match = supportStaffById.get(id);
      if (!match) continue;
      if (isSystemIdentityText(match.name) || isSystemIdentityText(match.email)) continue;
      assignedNames.push(sanitizeSupportDisplayName(match.name, "Support Staff"));
    }
    const primaryAssignee = sanitizeSupportDisplayName(conversation.agentName, "Support Staff");
    if (
      conversation.agentId &&
      primaryAssignee &&
      !assignedNames.includes(primaryAssignee) &&
      !isSystemIdentityText(conversation.agentName)
    ) {
      assignedNames.unshift(primaryAssignee);
    }
    return Array.from(new Set(assignedNames));
  };
  const activeTicketCount = conversations.filter((c) => c.status === "open" || c.status === "assigned").length;
  const resolvedTicketCount = conversations.filter((c) => c.status === "resolved").length;
  const visibleConversations =
    isSupportStaff && staffTicketFilter !== "all"
      ? conversations.filter((conv) => conv.status === staffTicketFilter)
      : conversations;
  const peerUserId = selectedConv
    ? (isSupportStaff ? selectedConv.customerId : selectedConv.agentId)
    : null;
  const canCurrentUserResolve = useMemo(() => {
    if (!selectedConv || !isSupportStaff) return false;
    if (selectedConv.status === "resolved") return false;
    if (isSuperAdmin) return true;
    if (selectedConv.agentId) return String(selectedConv.agentId) === String(user?.id || "");

    const mode = selectedConv.routingMode || "all_support";
    if (mode === "all_support") return true;
    if (mode === "all_agents") return normalizedRole === "agent";
    if (mode === "all_admins") return normalizedRole === "admin";
    const ids = Array.isArray(selectedConv.routingUserIds) ? selectedConv.routingUserIds.map(String) : [];
    return ids.includes(String(user?.id || ""));
  }, [selectedConv, isSupportStaff, isSuperAdmin, user?.id, normalizedRole]);

  useEffect(() => {
    if (!selectedConv) return;
    setRoutingMode((selectedConv.routingMode as any) || "all_support");
    const rawIds = Array.isArray(selectedConv.routingUserIds) ? selectedConv.routingUserIds.map(String) : [];
    const validIds = rawIds.filter((id) => selectableStaffIdSet.has(String(id)));
    setRoutingUserIds(validIds);
  }, [selectedConv?.id, selectedConv?.routingMode, selectedConv?.routingUserIds, selectableStaffIdSet]);

  const presenceUserIds = useMemo(
    () =>
      Array.from(
        new Set(
          conversations
            .map((conv) => (isSupportStaff ? conv.customerId : conv.agentId))
            .filter((id): id is string => Boolean(id))
        )
      ),
    [conversations, isSupportStaff]
  );
  const batchPresence = useBatchPresence(presenceUserIds);
  const peerPresence = usePresence(peerUserId || undefined);
  const peerProfileImage = selectedConv
    ? (isSupportStaff ? selectedConv.customerProfileImage : selectedConv.agentProfileImage)
    : null;
  const peerDisplayName = selectedConv
    ? (isSupportStaff ? (selectedConv.customerName || "Customer") : sanitizeSupportDisplayName(selectedConv.agentName))
    : "Support";
  const peerStatusText = isPeerTyping
    ? "typing..."
    : peerPresence.isOnline
    ? "Online"
    : peerPresence.isAway
    ? "Away"
    : `Last seen ${formatLastSeen(peerPresence.presence?.lastSeen || null)}`;
  const getConversationPresence = (conv: SupportConversation) => {
    const id = isSupportStaff ? conv.customerId : conv.agentId;
    if (!id) return { status: "offline" as const, lastSeen: null as string | null };
    return batchPresence.getPresence(id);
  };

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      if (localTypingStopTimeoutRef.current) clearTimeout(localTypingStopTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handlePeerTyping = (payload: { userId: string }) => {
      if (payload?.userId && payload.userId === peerUserId) {
        setIsPeerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsPeerTyping(false), 2500);
      }
    };

    const handlePeerStopTyping = (payload: { userId: string }) => {
      if (payload?.userId && payload.userId === peerUserId) {
        setIsPeerTyping(false);
      }
    };

    socket.on("user_typing", handlePeerTyping);
    socket.on("user_stop_typing", handlePeerStopTyping);
    return () => {
      socket.off("user_typing", handlePeerTyping);
      socket.off("user_stop_typing", handlePeerStopTyping);
    };
  }, [socket, peerUserId]);

  useEffect(() => {
    if (!socket) return;

    const handleSupportTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload?.conversationId === selectedConversation && payload?.userId !== user?.id) {
        setIsPeerTyping(true);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setIsPeerTyping(false), 2500);
      }
    };

    const handleSupportStopTyping = (payload: { conversationId: string; userId: string }) => {
      if (payload?.conversationId === selectedConversation && payload?.userId !== user?.id) {
        setIsPeerTyping(false);
      }
    };

    socket.on("support_user_typing", handleSupportTyping);
    socket.on("support_user_stop_typing", handleSupportStopTyping);
    return () => {
      socket.off("support_user_typing", handleSupportTyping);
      socket.off("support_user_stop_typing", handleSupportStopTyping);
    };
  }, [socket, selectedConversation, user?.id]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open": return "bg-yellow-500";
      case "assigned": return "bg-blue-500";
      case "resolved": return "bg-green-500";
      default: return "bg-gray-500";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "open":
        return "Open";
      case "assigned":
        return "Assigned";
      case "resolved":
        return "Resolved";
      default:
        return status;
    }
  };

  const toggleRoutingUser = (staffId: string) => {
    if (!selectableStaffIdSet.has(String(staffId))) return;
    setRoutingUserIds((prev) =>
      prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId],
    );
  };

  const handleApplyRouting = () => {
    if (!selectedConv) return;
    const sanitizedRoutingIds =
      routingMode === "specific_staff"
        ? routingUserIds.filter((candidate) => selectableStaffIdSet.has(String(candidate)))
        : [];
    if (routingMode === "specific_staff" && sanitizedRoutingIds.length === 0) {
      toast({
        title: "Select staff",
        description: "Pick one admin or agent before applying specific staff routing.",
        variant: "destructive",
      });
      return;
    }
    updateRoutingMutation.mutate({
      conversationId: selectedConv.id,
      mode: routingMode,
      routingUserIds: routingMode === "specific_staff" ? sanitizedRoutingIds : [],
    });
  };

  const syncLabel = conversationsUpdatedAt
    ? formatDistanceToNow(new Date(conversationsUpdatedAt), { addSuffix: true })
    : "just now";

  if (authLoading || !isAuthenticated) {
    return null;
  }

  return (
    <DashboardLayout role={normalizedRole as any} showBackButton={false}>
      <div className="flex flex-col h-[calc(100vh-14px)] overflow-hidden">
        <div className="p-4 pb-0 md:p-6 md:pb-0 flex-shrink-0">
          <Card className="border-emerald-500/25 bg-[linear-gradient(105deg,rgba(16,185,129,0.16)_0%,rgba(16,185,129,0.06)_38%,rgba(15,23,42,0.92)_100%)] p-4 md:p-5 shadow-lg shadow-emerald-900/10">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
                  {isSupportStaff ? "Support Dashboard" : "Customer Support"}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {isSupportStaff
                    ? "Manage and respond to customer requests"
                    : "Get help from our support team"}
                </p>
                {isSupportStaff && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-500/40">
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Support Operations
                    </Badge>
                    <Badge variant="secondary">Synced {syncLabel}</Badge>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isSupportStaff && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-emerald-500/40 hover:bg-emerald-500/10"
                    onClick={() => void refetchConversations()}
                    disabled={conversationsRefreshing}
                    data-testid="button-refresh-support-conversations"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${conversationsRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                )}
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
            </div>
          </Card>
        </div>

        <div className="flex-1 min-h-0 p-4 md:p-6 pt-4 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-full min-h-0">
            <Card className="md:col-span-1 p-0 flex flex-col overflow-hidden border-emerald-500/20 bg-card/95 backdrop-blur-sm" data-testid="card-conversations">
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
                {isSupportStaff ? (
                  <div className="flex items-center gap-2">
                    <Badge variant="default" className="bg-blue-600 hover:bg-blue-600">
                      {activeTicketCount} active
                    </Badge>
                    <Badge variant="secondary">{conversations.length} total</Badge>
                  </div>
                ) : (
                  <Badge variant="secondary">{conversations.length}</Badge>
                )}
              </div>
              {isSupportStaff && (
                <div className="px-4 py-2 border-b flex items-center gap-2">
                  <Button
                    size="sm"
                    variant={staffTicketFilter === "open" ? "default" : "outline"}
                    onClick={() => setStaffTicketFilter("open")}
                    className="h-7 px-2 text-xs"
                    data-testid="filter-ticket-open"
                  >
                    Open
                  </Button>
                  <Button
                    size="sm"
                    variant={staffTicketFilter === "assigned" ? "default" : "outline"}
                    onClick={() => setStaffTicketFilter("assigned")}
                    className="h-7 px-2 text-xs"
                    data-testid="filter-ticket-assigned"
                  >
                    Assigned
                  </Button>
                  <Button
                    size="sm"
                    variant={staffTicketFilter === "resolved" ? "default" : "outline"}
                    onClick={() => setStaffTicketFilter("resolved")}
                    className="h-7 px-2 text-xs"
                    data-testid="filter-ticket-resolved"
                  >
                    Resolved
                  </Button>
                  <Button
                    size="sm"
                    variant={staffTicketFilter === "all" ? "default" : "outline"}
                    onClick={() => setStaffTicketFilter("all")}
                    className="h-7 px-2 text-xs ml-auto"
                    data-testid="filter-ticket-all"
                  >
                    All
                  </Button>
                </div>
              )}
              <ScrollArea className="flex-1 min-h-0">
                {conversationsLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                    Loading conversations...
                  </div>
                ) : visibleConversations.length === 0 ? (
                  <div className="p-6 text-center text-muted-foreground">
                    {isSupportStaff
                      ? "No tickets match this filter"
                      : "No support tickets. Create one to get help."}
                  </div>
                ) : (
                  visibleConversations.map((conv) => (
                    (() => {
                      const presence = getConversationPresence(conv);
                      const assignedStaffNames = getAssignedStaffNames(conv);
                      const lastAttendedBy = conv.lastSupportResponderName
                        ? sanitizeSupportDisplayName(conv.lastSupportResponderName, "Support Team")
                        : null;
                      return (
                        <button
                          key={conv.id}
                          type="button"
                          className={`w-full text-left p-4 pr-3 border-b transition-colors ${
                            selectedConversation === conv.id ? "bg-muted border-l-4 border-l-emerald-500" : "hover:bg-muted/70"
                          }`}
                          onClick={() => setSelectedConversation(conv.id)}
                          data-testid={`conversation-${conv.id}`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-start gap-2 min-w-0 flex-1">
                              <div className="relative mt-0.5">
                                {((isSupportStaff ? conv.customerProfileImage : conv.agentProfileImage) || "") ? (
                                  <img
                                    src={(isSupportStaff ? conv.customerProfileImage : conv.agentProfileImage) || ""}
                                    alt={isSupportStaff ? (conv.customerName || "Customer") : sanitizeSupportDisplayName(conv.agentName, "Support")}
                                    className="h-8 w-8 rounded-full object-cover border"
                                  />
                                ) : (
                                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                    <User className="h-4 w-4 text-muted-foreground" />
                                  </div>
                                )}
                                <span
                                  className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background ${
                                    presence.status === "online" ? "bg-[#25D366]" : presence.status === "away" ? "bg-yellow-500" : "bg-gray-400"
                                  }`}
                                />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-sm truncate">{conv.subject}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {isSupportStaff ? (conv.customerName || conv.customerEmail) : sanitizeSupportDisplayName(conv.agentName)}
                                </p>
                                <p className={`text-[11px] ${presence.status === "online" ? "text-[#25D366] font-medium" : "text-muted-foreground"}`}>
                                  {presence.status === "online"
                                    ? "Online"
                                    : presence.status === "away"
                                      ? "Away"
                                      : presence.lastSeen
                                        ? `Last seen ${formatLastSeen(presence.lastSeen)}`
                                        : "Offline"}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center justify-end gap-1.5 flex-wrap shrink-0 max-w-[46%]">
                              {Number(conv.unreadCount || 0) > 0 && (
                                <Badge variant="secondary" className="bg-primary text-primary-foreground whitespace-nowrap">
                                  {conv.unreadCount}
                                </Badge>
                              )}
                              <Badge className={`${getStatusColor(conv.status)} text-white whitespace-nowrap`}>
                                {getStatusLabel(conv.status)}
                              </Badge>
                            </div>
                          </div>
                          {isSupportStaff && (
                            <div className="mb-2 space-y-1">
                              <p className="text-[11px] text-muted-foreground break-words">
                                Assigned: {assignedStaffNames.length > 0 ? assignedStaffNames.join(", ") : "Unassigned"}
                              </p>
                              <p className="text-[11px] text-muted-foreground break-words">
                                Last attended: {lastAttendedBy || "No support response yet"}
                                {conv.lastSupportResponderRole ? ` (${conv.lastSupportResponderRole})` : ""}
                              </p>
                            </div>
                          )}
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
                      );
                    })()
                  ))
                )}
                {isSupportStaff && visibleConversations.length > 0 && (
                  <div className="px-4 py-2 border-t text-[11px] text-muted-foreground">
                    {resolvedTicketCount} resolved ticket{resolvedTicketCount === 1 ? "" : "s"} included in total
                  </div>
                )}
              </ScrollArea>
            </Card>

            <Card className="md:col-span-2 p-0 flex flex-col overflow-hidden border-emerald-500/20 bg-card/95 backdrop-blur-sm" data-testid="card-messages">
              {selectedConv ? (
                <div className="flex flex-col h-full min-h-0">
                  <div className="p-4 border-b flex flex-wrap items-start justify-between gap-3 flex-shrink-0">
                    <div className="min-w-0 flex items-start gap-3">
                      <div className="relative mt-0.5">
                        {peerProfileImage ? (
                          <img
                            src={peerProfileImage}
                            alt={peerDisplayName}
                            className="h-10 w-10 rounded-full object-cover border"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border border-background ${
                            peerPresence.isOnline ? "bg-[#25D366]" : peerPresence.isAway ? "bg-yellow-500" : "bg-gray-400"
                          }`}
                        />
                      </div>
                      <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h2 className="font-semibold truncate">{selectedConv.subject}</h2>
                        <Badge className={`${getStatusColor(selectedConv.status)} text-white whitespace-nowrap`}>
                          {getStatusLabel(selectedConv.status)}
                        </Badge>
                      </div>
                      {isSupportStaff && (
                        <div className="mb-1 space-y-1">
                          <p className="text-xs text-muted-foreground break-words">
                            Assigned: {getAssignedStaffNames(selectedConv).length > 0 ? getAssignedStaffNames(selectedConv).join(", ") : "Unassigned"}
                          </p>
                          <p className="text-xs text-muted-foreground break-words">
                            Last attended: {selectedConv.lastSupportResponderName ? sanitizeSupportDisplayName(selectedConv.lastSupportResponderName, "Support Team") : "No support response yet"}
                            {selectedConv.lastSupportResponderRole ? ` (${selectedConv.lastSupportResponderRole})` : ""}
                          </p>
                        </div>
                      )}
                      <div className="text-sm truncate text-muted-foreground">
                        {isPeerTyping ? (
                          <span className="text-[#25D366] font-medium">typing...</span>
                        ) : isSupportStaff ? (
                          <>
                            <span>{`Customer: ${peerDisplayName}`}</span>
                            {peerStatusText === "Online" ? (
                              <span className="ml-2 text-[#25D366] font-medium">Online</span>
                            ) : (
                              <span className="ml-2">{peerStatusText}</span>
                            )}
                          </>
                        ) : selectedConv.agentName ? (
                          <>
                            <span>{`Agent: ${peerDisplayName}`}</span>
                            {peerStatusText === "Online" ? (
                              <span className="ml-2 text-[#25D366] font-medium">Online</span>
                            ) : (
                              <span className="ml-2">{peerStatusText}</span>
                            )}
                          </>
                        ) : (
                          <span>Waiting for agent assignment</span>
                        )}
                      </div>
                      {isPeerTyping && (
                        <div className="flex items-center gap-1 text-xs text-[#25D366] mt-1">
                          <span>typing</span>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#25D366] animate-bounce [animation-delay:-0.3s]" />
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#25D366] animate-bounce [animation-delay:-0.15s]" />
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#25D366] animate-bounce" />
                        </div>
                      )}
                    </div>
                    </div>
                    {isSupportStaff && (
                      <div className="flex items-center gap-2 flex-wrap justify-end">
                        {isSuperAdmin && (
                          <div className="flex items-center gap-2 mr-2 flex-wrap justify-end">
                            <select
                              value={routingMode}
                              onChange={(e) => setRoutingMode(e.target.value as any)}
                              className="h-8 min-w-[140px] rounded-md border bg-background px-2 text-xs"
                              data-testid="select-support-routing-mode"
                            >
                              <option value="all_support">All Support</option>
                              <option value="all_agents">All Agents</option>
                              <option value="all_admins">All Admins</option>
                              <option value="specific_staff">Specific Staff</option>
                            </select>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleApplyRouting}
                              disabled={updateRoutingMutation.isPending}
                              data-testid="button-apply-support-routing"
                            >
                              {updateRoutingMutation.isPending ? "Applying..." : "Apply"}
                            </Button>
                          </div>
                        )}
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleStartSupportCall("voice")}
                          disabled={!peerUserId || jitsiCall.isStarting || jitsiCall.inCall}
                          data-testid="button-support-voice-call"
                          title="Start voice call"
                        >
                          <Phone className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="outline"
                          onClick={() => handleStartSupportCall("video")}
                          disabled={!peerUserId || jitsiCall.isStarting || jitsiCall.inCall}
                          data-testid="button-support-video-call"
                          title="Start video call"
                        >
                          <Video className="h-4 w-4" />
                        </Button>
                        {canCurrentUserResolve && (
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
                  {isSuperAdmin && routingMode === "specific_staff" && (
                    <div className="px-4 pb-3 border-b space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Super Admin access is automatic. Select one or more admins/agents to assign this ticket.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 max-h-28 overflow-y-auto pr-1">
                      {selectableSupportStaff.map((staff) => {
                        const selected = routingUserIds.includes(staff.id);
                        return (
                          <button
                            key={staff.id}
                            type="button"
                            className={`text-xs px-2 py-1 rounded border whitespace-nowrap ${
                              selected ? "bg-primary text-primary-foreground border-primary" : "bg-background"
                            }`}
                            onClick={() => toggleRoutingUser(staff.id)}
                            data-testid={`toggle-routing-user-${staff.id}`}
                          >
                            {staff.name} ({staff.role})
                          </button>
                        );
                      })}
                      {selectableSupportStaff.length === 0 && (
                        <span className="text-xs text-muted-foreground">No active agents/admins available.</span>
                      )}
                      </div>
                    </div>
                  )}
                  {isSupportStaff && selectedConv?.lastSupportResponderName && (
                    <div className="px-4 py-2 border-b text-xs text-muted-foreground">
                      Last attended by: {sanitizeSupportDisplayName(selectedConv.lastSupportResponderName, "Support Team")}
                      {selectedConv.lastSupportResponderRole ? ` (${selectedConv.lastSupportResponderRole})` : ""}
                    </div>
                  )}
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
                        {messages.map((msg, idx) => {
                          const isMe = msg.senderId === user?.id;
                          const attachment = parseAttachmentMessage(msg.message);
                          const hasPeerReplyAfter = messages.slice(idx + 1).some((nextMsg) => nextMsg.senderId !== msg.senderId);
                          const inferredStatus: "delivered" | "read" = msg.isRead ? "read" : hasPeerReplyAfter ? "read" : "delivered";
                          return (
                            <div
                              key={msg.id}
                              className={`flex ${isMe ? "justify-start" : "justify-end"}`}
                              data-testid={`message-${msg.id}`}
                            >
                              {isMe && (
                                <div className="mr-2 mt-1">
                                  {msg.senderProfileImage || user?.profileImage ? (
                                    <img
                                      src={msg.senderProfileImage || user?.profileImage || ""}
                                      alt={msg.senderName || user?.name || "You"}
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
                                  isMe ? "bg-emerald-700 text-white" : "bg-muted"
                                }`}
                              >
                                <div className="flex items-center gap-2 mb-1">
                                  <User className="h-3 w-3" />
                                   <span className="text-xs font-medium">{msg.senderDisplayName || msg.senderName || "Unknown"}</span>
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
                                      className={`text-xs underline ${isMe ? "text-white/90" : "text-primary"}`}
                                    >
                                      {attachment.name}
                                    </a>
                                  </div>
                                ) : (
                                  <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
                                )}
                                <div className="text-xs mt-1 opacity-70 flex items-center gap-1 justify-end">
                                  <span>{formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}</span>
                                  {isMe && <MessageStatusTicks status={inferredStatus} variant="primary" />}
                                </div>
                              </div>
                              {!isMe && (
                                <div className="ml-2 mt-1">
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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  {selectedConv.status !== "resolved" && (
                    <div className="p-4 border-t flex gap-2 flex-shrink-0 items-center">
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
                      <Input
                        placeholder="Type your message..."
                        value={message}
                        onChange={(e) => {
                          const next = e.target.value;
                          setMessage(next);

                          if (!socket) return;
                          if (next.trim().length > 0) {
                            if (peerUserId) socket.emit("typing", { receiverId: peerUserId });
                            if (selectedConversation) socket.emit("support_typing", { conversationId: selectedConversation });
                            if (localTypingStopTimeoutRef.current) clearTimeout(localTypingStopTimeoutRef.current);
                            localTypingStopTimeoutRef.current = setTimeout(() => {
                              if (peerUserId) socket.emit("stop_typing", { receiverId: peerUserId });
                              if (selectedConversation) socket.emit("support_stop_typing", { conversationId: selectedConversation });
                            }, 1200);
                          } else {
                            if (peerUserId) socket.emit("stop_typing", { receiverId: peerUserId });
                            if (selectedConversation) socket.emit("support_stop_typing", { conversationId: selectedConversation });
                          }
                        }}
                        onBlur={() => {
                          if (socket && peerUserId) {
                            socket.emit("stop_typing", { receiverId: peerUserId });
                          }
                          if (socket && selectedConversation) {
                            socket.emit("support_stop_typing", { conversationId: selectedConversation });
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                          }
                        }}
                        data-testid="input-message"
                      />
                      {message.trim() ? (
                        <Button
                          onClick={handleSendMessage}
                          disabled={sendMessageMutation.isPending || uploadingAttachment}
                          data-testid="button-send"
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
                          disabled={uploadingAttachment || sendMessageMutation.isPending}
                        />
                      )}
                      {uploadingAttachment && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Uploading...</span>
                      )}
                      {!message.trim() && (
                        <span className="text-xs text-muted-foreground whitespace-nowrap">Tap mic to record</span>
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

      <JitsiCallDialog
        isOpen={jitsiCall.inCall || !!jitsiCall.incomingCall}
        roomUrl={jitsiCall.getJitsiUrl()}
        roomName={jitsiCall.currentRoom?.roomName || null}
        jitsiConfig={jitsiCall.jitsiConfig}
        callType={jitsiCall.currentRoom?.callType || jitsiCall.incomingCall?.callType || "video"}
        participants={jitsiCall.currentRoom?.participants?.map((id) => ({ id, name: "Participant" })) || []}
        isHost={jitsiCall.currentRoom?.createdBy === user?.id}
        incomingCall={jitsiCall.incomingCall ? {
          callerName: jitsiCall.incomingCall.callerName,
          callType: jitsiCall.incomingCall.callType,
        } : null}
        onAccept={() => jitsiCall.acceptIncomingCall()}
        onReject={() => jitsiCall.rejectIncomingCall()}
        onLeave={() => jitsiCall.leaveCall()}
        onEnd={() => jitsiCall.endCall()}
        isJoining={jitsiCall.isJoining}
      />
    </DashboardLayout>
  );
}
