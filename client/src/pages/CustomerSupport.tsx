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

interface SupportConversation {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  customerRole?: string | null;
  customerIsActive?: boolean | null;
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

function normalizeSupportStatus(status?: string | null): "open" | "assigned" | "resolved" {
  const normalized = String(status || "")
    .toLowerCase()
    .trim()
    .replace(/[\s-]+/g, "_");

  if (normalized === "resolved" || normalized === "closed") return "resolved";
  if (normalized === "assigned") return "assigned";
  return "open";
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
  const [appealDecisionMessage, setAppealDecisionMessage] = useState("");
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
  const canInitiateCalls = normalizedRole === "admin" || normalizedRole === "super_admin";
  const isRestrictedOperationalUser =
    (normalizedRole === "seller" || normalizedRole === "rider") && user?.isActive === false;
  const restrictedRoleLabel = normalizedRole === "rider" ? "rider" : "seller";

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

    const handleSupportUpdate = (payload?: { conversationId?: string; event?: string }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      const targetConvId = payload?.conversationId || selectedConversation;
      if (targetConvId) {
        queryClient.invalidateQueries({
          queryKey: ["/api/support/conversations", targetConvId, "/messages"],
        });
      }
      if (payload?.event === "message" && payload?.conversationId) {
        const convData = queryClient.getQueryData<SupportConversation[]>(["/api/support/conversations"]);
        const conv = convData?.find((c) => c.id === payload.conversationId);
        if (conv && payload.conversationId !== selectedConversation) {
          toast({
            title: isSupportStaff ? "New customer message" : "Support replied",
            description: conv.subject || "You have a new message in your support ticket",
          });
        }
      }
    };

    socket.on("support_conversation_updated", handleSupportUpdate);
    return () => {
      socket.off("support_conversation_updated", handleSupportUpdate);
    };
  }, [socket, selectedConversation, isSupportStaff]);

  useEffect(() => {
    if (selectedConversation) return;
    const autoSelectableConversations = isSupportStaff
      ? conversations.filter((conversation) => conversation.status !== "resolved")
      : conversations;
    if (autoSelectableConversations.length > 0) {
      setSelectedConversation(autoSelectableConversations[0].id);
    }
  }, [conversations, isSupportStaff, selectedConversation]);

  useEffect(() => {
    if (isRestrictedOperationalUser) {
      setShowNewTicketForm(true);
      setNewSupportSubject((current) => current || "Account Reactivation Appeal");
    }
  }, [isRestrictedOperationalUser]);

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
        description: isRestrictedOperationalUser
          ? "Your appeal ticket has been submitted to admin support."
          : "We'll respond to your request soon.",
      });
      queryClient.setQueryData<SupportConversation[]>(["/api/support/conversations"], (current = []) => {
        const exists = current.some((c) => c.id === conversation.id);
        if (exists) return current;
        return [conversation, ...current];
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

  const appealDecisionMutation = useMutation({
    mutationFn: async (payload: {
      conversationId: string;
      decision: "activate" | "reject";
      message: string;
    }) => {
      const res = await apiRequest("POST", `/api/support/conversations/${payload.conversationId}/appeal-decision`, payload);
      return res.json();
    },
    onSuccess: (updatedConversation: SupportConversation, variables) => {
      const resolvedAt = updatedConversation.resolvedAt ?? new Date().toISOString();
      const updatedAt = updatedConversation.updatedAt ?? new Date().toISOString();
      let nextOpenConversationId: string | null = null;

      queryClient.setQueryData<SupportConversation[]>(["/api/support/conversations"], (current = []) => {
        const nextConversations = current.map((conversation) => {
          if (conversation.id !== updatedConversation.id) {
            return conversation;
          }

          return {
            ...conversation,
            ...updatedConversation,
            status: "resolved" as const,
            resolvedAt,
            updatedAt,
            customerIsActive: variables.decision === "activate",
            lastMessage: updatedConversation.lastMessage || conversation.lastMessage,
            firstResponseAt: updatedConversation.firstResponseAt || conversation.firstResponseAt || resolvedAt,
            lastSupportResponderId: updatedConversation.lastSupportResponderId || conversation.lastSupportResponderId || user?.id || null,
          };
        });

        const nextConversation = nextConversations.find(
          (conversation) =>
            conversation.id !== updatedConversation.id &&
            conversation.status !== "resolved",
        );
        nextOpenConversationId = nextConversation?.id || null;
        return nextConversations;
      });

      if (selectedConversation === updatedConversation.id) {
        setSelectedConversation(nextOpenConversationId);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/support/conversations"] });
      if (selectedConversation) {
        queryClient.invalidateQueries({ queryKey: ["/api/support/conversations", selectedConversation, "/messages"] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setAppealDecisionMessage("");
      setMessage("");
      toast({
        title: variables.decision === "activate" ? "Appeal Activated" : "Appeal Rejected",
        description:
          variables.decision === "activate"
            ? "The account has been reactivated and the reply was sent."
            : "The account remains restricted and the reply was sent.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Appeal action failed",
        description: error.message,
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
    if (!isSupportStaff && !isRestrictedOperationalUser) {
      const hasOpenTicket = conversations.some((c) => {
        const s = normalizeSupportStatus(c.status);
        return s === "open" || s === "assigned";
      });
      if (hasOpenTicket) {
        toast({
          title: "You already have an open ticket",
          description: "Please resolve your current ticket before opening a new one.",
          variant: "destructive",
        });
        return;
      }
    }
    createTicketMutation.mutate({ subject: newSupportSubject, message: newSupportMessage });
  };

  const selectedConv = conversations.find(c => c.id === selectedConversation);
  const appealConversation = isRestrictedOperationalUser
    ? conversations
        .filter((conversation) => conversation.subject === "Account Reactivation Appeal")
        .sort((a, b) => new Date(String(b.updatedAt || b.createdAt)).getTime() - new Date(String(a.updatedAt || a.createdAt)).getTime())[0] || null
    : null;
  const hasSubmittedAppeal = Boolean(appealConversation);
  const hasAppealReply = Boolean(
    appealConversation &&
      (appealConversation.firstResponseAt || appealConversation.lastSupportResponderId),
  );
  const latestAppealReply = messages
    .filter((msg) => msg.senderId !== user?.id)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;
  const isSelectedAppealConversation = Boolean(
    selectedConv && selectedConv.subject === "Account Reactivation Appeal",
  );
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
    const routingMode = conversation.routingMode || "all_support";
    if (routingMode === "all_support") {
      return ["All Support"];
    }
    if (routingMode === "all_agents") {
      return ["All Customer Agents"];
    }
    if (routingMode === "all_admins") {
      return ["All Admins"];
    }

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
  const activeTicketCount = conversations.filter((c) => {
    const status = normalizeSupportStatus(c.status);
    return status === "open" || status === "assigned";
  }).length;
  const resolvedTicketCount = conversations.filter((c) => normalizeSupportStatus(c.status) === "resolved").length;
  const visibleConversations =
    isSupportStaff && staffTicketFilter !== "all"
      ? conversations.filter((conv) => normalizeSupportStatus(conv.status) === staffTicketFilter)
      : conversations;
  const peerUserId = selectedConv
    ? (isSupportStaff ? selectedConv.customerId : selectedConv.agentId)
    : null;
  const canCurrentUserResolve = useMemo(() => {
    if (!selectedConv || !isSupportStaff) return false;
    if (normalizeSupportStatus(selectedConv.status) === "resolved") return false;
    if (isSuperAdmin) return true;
    if (selectedConv.agentId) return String(selectedConv.agentId) === String(user?.id || "");

    const mode = selectedConv.routingMode || "all_support";
    if (mode === "all_support") return true;
    if (mode === "all_agents") return normalizedRole === "agent";
    if (mode === "all_admins") return normalizedRole === "admin";
    const ids = Array.isArray(selectedConv.routingUserIds) ? selectedConv.routingUserIds.map(String) : [];
    return ids.includes(String(user?.id || ""));
  }, [selectedConv, isSupportStaff, isSuperAdmin, user?.id, normalizedRole]);
  const canDecideAppeal = Boolean(
    isSupportStaff &&
      selectedConv &&
      selectedConv.subject === "Account Reactivation Appeal" &&
      (selectedConv.customerRole === "seller" || selectedConv.customerRole === "rider") &&
      selectedConv.customerIsActive === false &&
      normalizeSupportStatus(selectedConv.status) !== "resolved",
  );

  useEffect(() => {
    if (!selectedConv) return;
    setRoutingMode((selectedConv.routingMode as any) || "all_support");
    const rawIds = Array.isArray(selectedConv.routingUserIds) ? selectedConv.routingUserIds.map(String) : [];
    const validIds = rawIds.filter((id) => selectableStaffIdSet.has(String(id)));
    setRoutingUserIds(validIds);
  }, [selectedConv?.id, selectedConv?.routingMode, selectedConv?.routingUserIds, selectableStaffIdSet]);

  useEffect(() => {
    setAppealDecisionMessage("");
  }, [selectedConv?.id]);

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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "open":
        return "inline-flex min-w-[96px] justify-center rounded-full border border-yellow-500/30 bg-yellow-500 px-3 py-1 text-xs font-semibold text-white shadow-sm";
      case "assigned":
        return "inline-flex min-w-[96px] justify-center rounded-full border border-blue-500/30 bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-sm";
      case "resolved":
        return "inline-flex min-w-[96px] justify-center rounded-full border border-emerald-500/30 bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm";
      default:
        return "inline-flex min-w-[96px] justify-center rounded-full border border-gray-500/30 bg-gray-500 px-3 py-1 text-xs font-semibold text-white shadow-sm";
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

  const handleAppealDecision = (decision: "activate" | "reject") => {
    if (!selectedConv) return;
    if (!appealDecisionMessage.trim()) {
      toast({
        title: "Response required",
        description: "Write a response before deciding the appeal.",
        variant: "destructive",
      });
      return;
    }

    appealDecisionMutation.mutate({
      conversationId: selectedConv.id,
      decision,
      message: appealDecisionMessage.trim(),
    });
  };

  const syncLabel = conversationsUpdatedAt
    ? formatDistanceToNow(new Date(conversationsUpdatedAt), { addSuffix: true })
    : "just now";

  useEffect(() => {
    if (!isRestrictedOperationalUser || !appealConversation) return;
    if (selectedConversation !== appealConversation.id) {
      setSelectedConversation(appealConversation.id);
    }
  }, [appealConversation, isRestrictedOperationalUser, selectedConversation]);

  if (authLoading || !isAuthenticated) {
    return null;
  }

  if (isRestrictedOperationalUser) {
    return (
      <DashboardLayout role={normalizedRole as any} showBackButton={false}>
        <div className="p-4 md:p-6">
          <div className="mx-auto max-w-3xl">
            {hasSubmittedAppeal ? (
              !hasAppealReply ? (
                <Card className="border-emerald-500/20 bg-card/95">
                  <div className="p-6 md:p-8 space-y-5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-emerald-600 text-white">Appeal Submitted</Badge>
                        <Badge className={`${getStatusColor(appealConversation?.status || "open")} text-white`}>
                          {getStatusLabel(appealConversation?.status || "open")}
                        </Badge>
                      </div>
                      <h2 className="text-2xl font-semibold">Appeal submitted</h2>
                      <p className="text-sm text-muted-foreground">
                        Customer support will get in touch within 72 hours. Please wait for an update on your appeal.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm text-muted-foreground">
                      No admin reply yet. You will be notified here once support responds.
                    </div>
                  </div>
                </Card>
              ) : (
                <Card className="border-emerald-500/20 bg-card/95">
                  <div className="p-6 md:p-8 space-y-5">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-green-600 text-white">Appeal Response</Badge>
                        <Badge className={`${getStatusColor(appealConversation?.status || "resolved")} text-white`}>
                          {getStatusLabel(appealConversation?.status || "resolved")}
                        </Badge>
                      </div>
                      <h2 className="text-2xl font-semibold">Appeal decision received</h2>
                      <p className="text-sm text-muted-foreground">
                        Support has responded to your appeal request.
                      </p>
                    </div>

                    <div className="rounded-2xl border border-border/70 bg-muted/30 p-5">
                      {messagesLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-5 w-5 mx-auto mb-2 animate-spin" />
                          Loading support response...
                        </div>
                      ) : latestAppealReply ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">
                              {latestAppealReply.senderDisplayName || latestAppealReply.senderName || "Support"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(latestAppealReply.createdAt), { addSuffix: true })}
                            </p>
                          </div>
                          <p className="text-sm whitespace-pre-wrap text-foreground/90">
                            {parseAttachmentMessage(latestAppealReply.message)
                              ? "Support sent an attachment update."
                              : latestAppealReply.message}
                          </p>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          Support has responded and the ticket is resolved.
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              )
            ) : (
              <Card className="border-amber-500/25 bg-card/95">
                <div className="p-6 md:p-8 space-y-5">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    Your {restrictedRoleLabel} account is currently restricted. Submit one appeal ticket here to request reactivation.
                  </div>

                  <div className="space-y-2">
                    <h2 className="text-2xl font-semibold">Account Reactivation Appeal</h2>
                    <p className="text-sm text-muted-foreground">
                      Explain clearly why your account should be reactivated. Support will review your appeal within 72 hours.
                    </p>
                  </div>

                  <Textarea
                    placeholder="Explain why your account should be reactivated..."
                    value={newSupportMessage}
                    onChange={(e) => setNewSupportMessage(e.target.value)}
                    rows={6}
                    data-testid="textarea-appeal-message"
                  />

                  <Button
                    onClick={handleCreateTicket}
                    disabled={createTicketMutation.isPending}
                    className="w-full"
                    data-testid="button-submit-appeal-ticket"
                  >
                    {createTicketMutation.isPending ? "Submitting..." : "Submit Appeal Ticket"}
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={normalizedRole as any} showBackButton={false}>
      <div className="flex flex-col h-[calc(100vh-14px)] overflow-hidden">
        <div className="p-4 pb-0 md:p-6 md:pb-0 flex-shrink-0">
          <Card className="border-border/70 bg-card p-4 shadow-sm dark:border-emerald-500/25 dark:bg-[linear-gradient(105deg,rgba(16,185,129,0.16)_0%,rgba(16,185,129,0.06)_38%,rgba(15,23,42,0.92)_100%)] dark:shadow-lg dark:shadow-emerald-900/10 md:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-xl md:text-2xl font-bold" data-testid="text-page-title">
                  {isSupportStaff ? "Support Dashboard" : isRestrictedOperationalUser ? "Account Appeal Support" : "Customer Support"}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {isSupportStaff
                    ? "Manage and respond to customer requests"
                    : isRestrictedOperationalUser
                      ? "Create a support ticket to appeal your account restriction. Admin will review your request here."
                      : "Get help from our support team"}
                </p>
                {isSupportStaff && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
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
                    className="border-border/70 text-foreground hover:bg-muted dark:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                    onClick={() => void refetchConversations()}
                    disabled={conversationsRefreshing}
                    data-testid="button-refresh-support-conversations"
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${conversationsRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                )}
                {!isSupportStaff && (
                  (() => {
                    const hasOpenTicket = !isRestrictedOperationalUser && conversations.some((c) => {
                      const s = normalizeSupportStatus(c.status);
                      return s === "open" || s === "assigned";
                    });
                    return (
                      <Button
                        size="sm"
                        onClick={() => setShowNewTicketForm((prev) => !prev)}
                        disabled={isRestrictedOperationalUser || hasOpenTicket}
                        title={hasOpenTicket ? "You already have an open ticket. Resolve it before creating a new one." : undefined}
                        data-testid="button-new-ticket"
                      >
                        {isRestrictedOperationalUser ? "Appeal Ticket Required" : hasOpenTicket ? "Open Ticket Exists" : showNewTicketForm ? "Close" : "New Ticket"}
                      </Button>
                    );
                  })()
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
                  {isRestrictedOperationalUser && (
                    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                      Your {restrictedRoleLabel} account is currently restricted. Submit an appeal ticket here to request reactivation.
                    </div>
                  )}
                  <Input
                    placeholder="Subject"
                    value={newSupportSubject}
                    onChange={(e) => setNewSupportSubject(e.target.value)}
                    data-testid="input-ticket-subject"
                  />
                  <Textarea
                    placeholder={isRestrictedOperationalUser ? "Explain why your account should be reactivated..." : "Describe your issue..."}
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
                      {createTicketMutation.isPending ? "Submitting..." : isRestrictedOperationalUser ? "Submit Appeal Ticket" : "Create Ticket"}
                    </Button>
                    {!isRestrictedOperationalUser && (
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
                    )}
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
                    <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600">
                      {resolvedTicketCount} resolved
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
                      const normalizedConversationStatus = normalizeSupportStatus(conv.status);
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
                              <Badge className={`${getStatusBadgeClass(normalizedConversationStatus)} whitespace-nowrap`}>
                                {getStatusLabel(normalizedConversationStatus)}
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
                          <p className="mb-1 text-xs text-muted-foreground whitespace-pre-wrap break-words line-clamp-3">
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
                  <div className="px-4 py-3 border-b space-y-2 flex-shrink-0">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="relative mt-0.5 flex-shrink-0">
                        {peerProfileImage ? (
                          <img
                            src={peerProfileImage}
                            alt={peerDisplayName}
                            className="h-9 w-9 rounded-full object-cover border"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-background ${
                            peerPresence.isOnline ? "bg-[#25D366]" : peerPresence.isAway ? "bg-yellow-500" : "bg-gray-400"
                          }`}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h2 className="font-semibold truncate">{selectedConv.subject}</h2>
                          <Badge className={`${getStatusBadgeClass(normalizeSupportStatus(selectedConv.status))} whitespace-nowrap`}>
                            {getStatusLabel(normalizeSupportStatus(selectedConv.status))}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
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
                              <span>{`Customer Agent: ${peerDisplayName}`}</span>
                              {peerStatusText === "Online" ? (
                                <span className="ml-2 text-[#25D366] font-medium">Online</span>
                              ) : (
                                <span className="ml-2">{peerStatusText}</span>
                              )}
                            </>
                          ) : (
                            <span>Waiting for customer agent assignment</span>
                          )}
                        </p>
                        {isSupportStaff && (
                          <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                            <p className="truncate">
                              Assigned: {getAssignedStaffNames(selectedConv).length > 0 ? getAssignedStaffNames(selectedConv).join(", ") : "Unassigned"}
                            </p>
                            <p className="truncate md:text-right">
                              Last attended: {selectedConv.lastSupportResponderName ? sanitizeSupportDisplayName(selectedConv.lastSupportResponderName, "Support Team") : "No support response yet"}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                    {isSupportStaff && (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              {isSuperAdmin && (
                                <>
                                  <select
                                    value={routingMode}
                                    onChange={(e) => setRoutingMode(e.target.value as any)}
                                    className="h-9 min-w-[160px] rounded-md border bg-background px-2.5 text-sm"
                                    data-testid="select-support-routing-mode"
                                  >
                                    <option value="all_support">All Support</option>
                                    <option value="all_agents">All Customer Agents</option>
                                    <option value="all_admins">All Admins</option>
                                    <option value="specific_staff">Specific Staff</option>
                                  </select>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleApplyRouting}
                                    disabled={updateRoutingMutation.isPending}
                                    data-testid="button-apply-support-routing"
                                    className="h-9 px-4 whitespace-nowrap"
                                  >
                                    {updateRoutingMutation.isPending ? "Applying..." : "Apply"}
                                  </Button>
                                </>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {canInitiateCalls ? (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleStartSupportCall("voice")}
                                    disabled={!peerUserId || jitsiCall.isStarting || jitsiCall.inCall}
                                    data-testid="button-support-voice-call"
                                    title="Start voice call"
                                    className="h-9 w-10 px-0"
                                  >
                                    <Phone className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleStartSupportCall("video")}
                                    disabled={!peerUserId || jitsiCall.isStarting || jitsiCall.inCall}
                                    data-testid="button-support-video-call"
                                    title="Start video call"
                                    className="h-9 w-10 px-0"
                                  >
                                    <Video className="h-4 w-4" />
                                  </Button>
                                </>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => requestCallMutation.mutate("voice")}
                                  disabled={requestCallMutation.isPending}
                                  data-testid="button-request-call"
                                  title="Request a call with admin"
                                  className="h-9 px-3 text-xs"
                                >
                                  {requestCallMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Phone className="h-3.5 w-3.5 mr-1" />}
                                  Request Call
                                </Button>
                              )}
                              {canCurrentUserResolve && !isSelectedAppealConversation && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => resolveConversationMutation.mutate(selectedConv.id)}
                                  disabled={resolveConversationMutation.isPending}
                                  data-testid="button-resolve"
                                  className="h-9 px-4 whitespace-nowrap"
                                >
                                  <CheckCircle2 className="h-4 w-4 mr-1" />
                                  Resolve
                                </Button>
                              )}
                            </div>
                          </div>
                          {canDecideAppeal && (
                            <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                              <div>
                                <p className="text-sm font-medium">Appeal Decision</p>
                                <p className="text-xs text-muted-foreground">
                                  Send your response and choose whether to activate or reject this appeal.
                                </p>
                              </div>
                              <Textarea
                                value={appealDecisionMessage}
                                onChange={(e) => setAppealDecisionMessage(e.target.value)}
                                placeholder="Write your decision message to the seller or rider..."
                                rows={3}
                                data-testid="textarea-appeal-decision"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  onClick={() => handleAppealDecision("activate")}
                                  disabled={appealDecisionMutation.isPending}
                                  data-testid="button-activate-appeal"
                                >
                                  Activate Appeal
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => handleAppealDecision("reject")}
                                  disabled={appealDecisionMutation.isPending}
                                  data-testid="button-reject-appeal"
                                >
                                  Reject Appeal
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  {isSuperAdmin && routingMode === "specific_staff" && (
                    <div className="px-4 py-2 border-b space-y-2">
                      <p className="text-[11px] text-muted-foreground">
                        Super Admin access is automatic. Select one or more admins/agents to assign this ticket.
                      </p>
                      <div className="flex flex-wrap items-center gap-2 max-h-20 overflow-y-auto pr-1">
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
                        {Array.from(new Map(messages.map((m) => [m.id, m])).values()).map((msg, idx, arr) => {
                          const isMe = msg.senderId === user?.id;
                          const attachment = parseAttachmentMessage(msg.message);
                          const hasPeerReplyAfter = arr.slice(idx + 1).some((nextMsg) => nextMsg.senderId !== msg.senderId);
                          const inferredStatus: "delivered" | "read" = msg.isRead ? "read" : hasPeerReplyAfter ? "read" : "delivered";
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
                              {isMe && (
                                <div className="ml-2 mt-1">
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
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </ScrollArea>
                  {selectedConv.status !== "resolved" && !isSelectedAppealConversation && (
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

    </DashboardLayout>
  );
}
