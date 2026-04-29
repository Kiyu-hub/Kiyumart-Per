import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, MessageSquare, Send, ArrowLeft, User, Phone, Video, PhoneOff, X, RefreshCw, ShieldCheck, Wifi } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { TypingIndicator } from "@/components/TypingIndicator";
import { useSocket } from "@/contexts/NotificationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGroupCall } from "@/hooks/useGroupCall";
import { ParticipantSelectorDialog } from "@/components/ParticipantSelectorDialog";
import { GroupCallDialog } from "@/components/GroupCallDialog";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import { usePresence, useBatchPresence, formatLastSeen } from "@/hooks/usePresence";
import VoiceRecorderControls from "@/components/VoiceRecorderControls";
import MessageAttachmentContent from "@/components/MessageAttachmentContent";
import { buildChatAttachmentMessage, parseChatAttachmentMessage } from "@/lib/chatAttachments";
import UserAvatar from "@/components/UserAvatar";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { PageLoadingState } from "@/components/ui/loading-state";

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
  messageType?: 'text' | 'missed_call' | 'call_started' | 'call_ended';
  createdAt: string;
  isRead: boolean;
  status: 'sent' | 'delivered' | 'read';
  deliveredAt?: string | null;
  readAt?: string | null;
}

interface ProductContextData {
  id: string;
  name: string;
  images?: string[];
}

type OrderActionOwner = "seller" | "rider" | "admin";

interface OrderReferenceData {
  id: string;
  number: string;
  action: string;
  actionOwner: OrderActionOwner;
  link: string;
}

export default function AdminMessages() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [showOnlineOnly, setShowOnlineOnly] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showOrderContext, setShowOrderContext] = useState(true);
  const [showProductContext, setShowProductContext] = useState(true);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [isPeerTyping, setIsPeerTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  
  // 1-on-1 Call state management
  const [incomingCall, setIncomingCall] = useState<{ callerId: string; callerName: string; callType: 'voice' | 'video'; offer: any } | null>(null);
  const [ongoingCall, setOngoingCall] = useState<{ targetUserId: string; targetName: string; callType: 'voice' | 'video' } | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Group call management
  const groupCall = useGroupCall(user?.id || '');
  const [groupCallInvite, setGroupCallInvite] = useState<{ callId: string; hostId: string; hostName: string; callType: 'voice' | 'video' } | null>(null);

  // Jitsi Meet integration for video/voice calls
  const jitsiCall = useJitsiCall(user?.id || '');
  
  // Selected user presence status
  const selectedUserPresence = usePresence(selectedUserId || undefined);

  // Get URL search params when navigating from contextual entry points (orders/products/users).
  const urlParams = new URLSearchParams(window.location.search);
  const userIdFilter = urlParams.get("userId");
  const orderIdFilter = urlParams.get("orderId") || "";
  const orderNumberFilter = urlParams.get("orderNumber") || "";
  const orderActionFilter = urlParams.get("orderAction") || "";
  const orderActionOwnerParam = urlParams.get("orderActionOwner");
  const orderActionOwnerFilter: OrderActionOwner =
    orderActionOwnerParam === "seller" || orderActionOwnerParam === "rider" || orderActionOwnerParam === "admin"
      ? orderActionOwnerParam
      : "admin";
  const orderLinkFilter =
    urlParams.get("orderLink") ||
    (orderIdFilter
      ? `/admin/orders?orderId=${orderIdFilter}`
      : "");
  const productIdFilter = urlParams.get("productId");
  const productNameFilter = urlParams.get("productName") || "";
  const productImageFilter = urlParams.get("productImage") || "";
  const productLinkFilter = urlParams.get("productLink") || (productIdFilter ? `/product/${productIdFilter}` : "");
  const autoReferencedThreadsRef = useRef<Set<string>>(new Set());
  const autoOrderReferencedThreadsRef = useRef<Set<string>>(new Set());
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Socket.IO event listeners for message status updates
  useEffect(() => {
    if (!socket || !selectedUserId) return;

    const handleMessageDelivered = (data: { messageId: string; deliveredAt: string }) => {
      queryClient.setQueryData<Message[]>(["/api/messages", selectedUserId], (oldMessages) => {
        if (!oldMessages) return oldMessages;
        return oldMessages.map((msg) =>
          msg.id === data.messageId
            ? { ...msg, status: "delivered" as const, deliveredAt: data.deliveredAt }
            : msg
        );
      });
    };

    const handleMessageRead = (data: { messageIds: string[]; readAt: string }) => {
      queryClient.setQueryData<Message[]>(["/api/messages", selectedUserId], (oldMessages) => {
        if (!oldMessages) return oldMessages;
        return oldMessages.map((msg) =>
          data.messageIds.includes(msg.id)
            ? { ...msg, status: "read" as const, readAt: data.readAt, isRead: true }
            : msg
        );
      });
    };

    socket.on("message_delivered", handleMessageDelivered);
    socket.on("message_read", handleMessageRead);

    return () => {
      socket.off("message_delivered", handleMessageDelivered);
      socket.off("message_read", handleMessageRead);
    };
  }, [socket, selectedUserId]);

  // Socket.IO event listeners for WebRTC calls
  useEffect(() => {
    if (!socket) return;

    const handleCallOffer = (data: { callerId: string; callerName: string; callType: 'voice' | 'video'; offer: RTCSessionDescriptionInit }) => {
      setIncomingCall({
        callerId: data.callerId,
        callerName: data.callerName,
        callType: data.callType,
        offer: data.offer
      });
    };

    const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      } catch {
        // no-op
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch {
        // no-op
      }
    };

    const handleCallEnd = () => {
      endCall();
    };

    const handleGroupCallInvite = (data: { callId: string; hostId: string; hostName: string; callType: 'voice' | 'video' }) => {
      setGroupCallInvite({
        callId: data.callId,
        hostId: data.hostId,
        hostName: data.hostName,
        callType: data.callType
      });
    };

    socket.on('call_offer', handleCallOffer);
    socket.on('call_answer', handleCallAnswer);
    socket.on('ice_candidate', handleIceCandidate);
    socket.on('call_end', handleCallEnd);
    socket.on('group_call_invite', handleGroupCallInvite);

    return () => {
      socket.off('call_offer', handleCallOffer);
      socket.off('call_answer', handleCallAnswer);
      socket.off('ice_candidate', handleIceCandidate);
      socket.off('call_end', handleCallEnd);
      socket.off('group_call_invite', handleGroupCallInvite);
    };
  }, [socket]);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (ongoingCall || incomingCall) {
        endCall();
      }
    };
  }, []);

  const {
    data: users = [],
    isLoading: usersLoading,
    isFetching: usersRefreshing,
    refetch: refetchUsers,
    dataUpdatedAt: usersUpdatedAt,
  } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const { data: productContext } = useQuery<ProductContextData | null>({
    queryKey: ["/api/products", productIdFilter, "message-context"],
    queryFn: async () => {
      if (!productIdFilter) return null;
      const res = await fetch(`/api/products/${productIdFilter}`, { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: Boolean(productIdFilter),
    staleTime: 60_000,
  });

  // Auto-select user when filtering by userId
  useEffect(() => {
    if (userIdFilter && users.length > 0 && !selectedUserId) {
      const targetUser = users.find(u => u.id === userIdFilter);
      if (targetUser) {
        setSelectedUserId(targetUser.id);
      }
    }
  }, [userIdFilter, users, selectedUserId]);

  const {
    data: messages = [],
    isLoading: messagesLoading,
    isFetching: messagesRefreshing,
    refetch: refetchMessages,
    dataUpdatedAt: messagesUpdatedAt,
  } = useQuery<Message[]>({
    queryKey: ["/api/messages", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const res = await apiRequest("GET", `/api/messages/${selectedUserId}`);
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      return res.json();
    },
    enabled: !!selectedUserId,
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    refetchInterval: selectedUserId ? 10000 : false,
    refetchIntervalInBackground: true,
  });

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
      queryClient.setQueryData<Message[]>(["/api/messages", selectedUserId], (oldMessages) => {
        if (!oldMessages) return oldMessages;
        return oldMessages.map((msg) =>
          msg.id === data.messageId
            ? {
                ...msg,
                status: data.status,
                deliveredAt: data.deliveredAt ?? msg.deliveredAt ?? null,
                readAt: data.readAt ?? msg.readAt ?? null,
                isRead: data.status === "read" ? true : msg.isRead,
              }
            : msg
        );
      });
    };
    const handleMissedCall = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Missed call",
        description: "A missed call alert was received.",
      });
    };

    socket.on("new_message", handleNewMessage);
    socket.on("message_status_updated", handleMessageStatusUpdated);
    socket.on("missed_call", handleMissedCall);

    return () => {
      socket.off("new_message", handleNewMessage);
      socket.off("message_status_updated", handleMessageStatusUpdated);
      socket.off("missed_call", handleMissedCall);
    };
  }, [socket, selectedUserId, toast, user?.id]);

  useEffect(() => {
    if (!socket) return;

    const handleNotificationSync = (payload: any) => {
      if (payload?.type !== "message") return;
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      if (selectedUserId) {
        queryClient.invalidateQueries({ queryKey: ["/api/messages", selectedUserId] });
      }
    };

    socket.on("notification", handleNotificationSync);

    return () => {
      socket.off("notification", handleNotificationSync);
    };
  }, [socket, selectedUserId]);

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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedUserId, messages.length]);

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

  const productReference =
    productIdFilter || productNameFilter || productContext
      ? {
          id: productContext?.id || productIdFilter || "",
          name: productContext?.name || productNameFilter || "Product reference",
          image: productContext?.images?.[0] || productImageFilter || "",
          link: productLinkFilter || (productContext?.id ? `/product/${productContext.id}` : ""),
        }
      : null;
  const orderReference: OrderReferenceData | null =
    orderIdFilter || orderNumberFilter
      ? {
          id: orderIdFilter,
          number: orderNumberFilter || orderIdFilter,
          action: orderActionFilter || "Review and proceed with the required order step",
          actionOwner: orderActionOwnerFilter,
          link: orderLinkFilter,
        }
      : null;
  const orderActionOwnerLabel =
    orderReference?.actionOwner === "seller"
      ? "Seller Action"
      : orderReference?.actionOwner === "rider"
        ? (showInternalRiderFeatures ? "Rider Action" : "Delivery Action")
        : "Required Action";

  useEffect(() => {
    if (productReference?.link) {
      setShowProductContext(true);
    }
  }, [productReference?.id, productReference?.link]);

  useEffect(() => {
    if (orderReference?.link) {
      setShowOrderContext(true);
    }
  }, [orderReference?.id, orderReference?.link, orderReference?.action]);

  const sendProductReference = async () => {
    if (!selectedUserId || !productReference || !productReference.link) return;
    await sendMessageMutation.mutateAsync({
      receiverId: selectedUserId,
      message: buildChatAttachmentMessage({
        kind: "product",
        url: productReference.link,
        name: productReference.name,
        size: 0,
        productId: productReference.id,
        productName: productReference.name,
        productImage: productReference.image,
      }),
    });
  };

  const sendOrderReference = async () => {
    if (!selectedUserId || !orderReference || !orderReference.link) return;
    await sendMessageMutation.mutateAsync({
      receiverId: selectedUserId,
      message: buildChatAttachmentMessage({
        kind: "order",
        url: orderReference.link,
        name: orderReference.number,
        size: 0,
        orderId: orderReference.id,
        orderNumber: orderReference.number,
        orderAction: orderReference.action,
        orderActionOwner: orderReference.actionOwner,
      }),
    });
  };

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

  useEffect(() => {
    if (!selectedUserId || !userIdFilter || selectedUserId !== userIdFilter) return;
    if (!productReference?.link) return;
    if (messagesLoading) return;

    const hasReference = messages.some((msg) => {
      const parsed = parseChatAttachmentMessage(msg.message || "");
      if (!parsed || parsed.kind !== "product") return false;
      if (productReference.id && parsed.productId === productReference.id) return true;
      return parsed.url === productReference.link;
    });
    if (hasReference) return;

    const threadKey = `${selectedUserId}:${productReference.id || productReference.link}`;
    if (autoReferencedThreadsRef.current.has(threadKey)) return;
    autoReferencedThreadsRef.current.add(threadKey);

    void sendProductReference().catch(() => {
      // Keep non-blocking behavior; user can send reference manually from the context card.
    });
  }, [
    selectedUserId,
    userIdFilter,
    productReference?.id,
    productReference?.link,
    messages,
    messagesLoading,
  ]);

  useEffect(() => {
    if (!selectedUserId || !userIdFilter || selectedUserId !== userIdFilter) return;
    if (!orderReference?.link) return;
    if (messagesLoading) return;

    const hasReference = messages.some((msg) => {
      const parsed = parseChatAttachmentMessage(msg.message || "");
      if (!parsed || parsed.kind !== "order") return false;
      if (orderReference.id && parsed.orderId === orderReference.id) return true;
      if (orderReference.number && parsed.orderNumber === orderReference.number) return true;
      return parsed.url === orderReference.link;
    });
    if (hasReference) return;

    const threadKey = `${selectedUserId}:${orderReference.id || orderReference.number || orderReference.link}:${orderReference.actionOwner}`;
    if (autoOrderReferencedThreadsRef.current.has(threadKey)) return;
    autoOrderReferencedThreadsRef.current.add(threadKey);

    void sendOrderReference().catch(() => {
      // Keep non-blocking behavior; user can send reference manually from the context card.
    });
  }, [
    selectedUserId,
    userIdFilter,
    orderReference?.id,
    orderReference?.number,
    orderReference?.action,
    orderReference?.actionOwner,
    orderReference?.link,
    messages,
    messagesLoading,
  ]);

  // WebRTC Helper Functions
  const initPeerConnection = (targetUserId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // Add local tracks to peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates (use parameter instead of state to avoid stale closure)
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice_candidate', {
          targetUserId: targetUserId,
          candidate: event.candidate
        });
      }
    };

    peerConnectionRef.current = pc;
    return pc;
  };

  // Use Jitsi Meet for video/voice calls (more reliable than WebRTC)
  const startCall = async (callType: 'voice' | 'video') => {
    if (!selectedUserId || !selectedUser) {
      toast({
        title: "No user selected",
        description: "Please select a user to call",
        variant: "destructive"
      });
      return;
    }
    
    try {
      await jitsiCall.startCall(selectedUserId, callType);
      toast({
        title: `${callType === 'video' ? 'Video' : 'Voice'} Call Started`,
        description: `Connecting to ${selectedUser.name}...`
      });
    } catch (error) {
      toast({
        title: "Call Failed",
        description: error instanceof Error ? error.message : "Could not start call",
        variant: "destructive"
      });
    }
  };

  // Legacy WebRTC startCall (kept for reference)
  const startCallWebRTC = async (callType: 'voice' | 'video') => {
    try {
      
      const constraints = callType === 'video' 
        ? { video: true, audio: true }
        : { video: false, audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      if (localVideoRef.current && callType === 'video') {
        localVideoRef.current.srcObject = stream;
      }
      
      const pc = initPeerConnection(selectedUserId!);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      
      socket?.emit('call_offer', {
        targetUserId: selectedUserId,
        offer: offer,
        callType
      });
      
      setOngoingCall({ 
        targetUserId: selectedUserId!, 
        targetName: selectedUser?.name || 'User',
        callType 
      });

      toast({
        title: `${callType === 'video' ? 'Video' : 'Voice'} Call Started`,
        description: `Calling ${selectedUser?.name}...`
      });
    } catch (error) {
      toast({
        title: "Call Failed",
        description: error instanceof Error ? error.message : "Could not access camera/microphone",
        variant: "destructive"
      });
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    
    try {
      
      const constraints = incomingCall.callType === 'video'
        ? { video: true, audio: true }
        : { video: false, audio: true };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      
      if (localVideoRef.current && incomingCall.callType === 'video') {
        localVideoRef.current.srcObject = stream;
      }
      
      const pc = initPeerConnection(incomingCall.callerId);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      
      socket?.emit('call_answer', {
        targetUserId: incomingCall.callerId,
        answer: answer
      });
      
      setOngoingCall({
        targetUserId: incomingCall.callerId,
        targetName: incomingCall.callerName,
        callType: incomingCall.callType
      });
      setIncomingCall(null);

      toast({
        title: "Call Connected",
        description: `Connected with ${incomingCall.callerName}`
      });
    } catch (error) {
      toast({
        title: "Call Failed",
        description: error instanceof Error ? error.message : "Could not accept call",
        variant: "destructive"
      });
      setIncomingCall(null);
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket?.emit('call_end', { targetUserId: incomingCall.callerId });
      setIncomingCall(null);
      toast({
        title: "Call Rejected",
        description: `Declined call from ${incomingCall.callerName}`
      });
    }
  };

  const endCall = () => {
    localStreamRef.current?.getTracks().forEach(track => {
      track.stop();
    });
    
    // Close peer connection
    peerConnectionRef.current?.close();
    
    // Emit call end to other party
    if (ongoingCall) {
      socket?.emit('call_end', { targetUserId: ongoingCall.targetUserId });
    }
    
    // Clear refs and state
    setOngoingCall(null);
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    toast({
      title: "Call Ended",
      description: "The call has been disconnected"
    });
  };

  const getRoleBadgeColor = (role: string) => {
    switch(role.toLowerCase()) {
      case "admin": return "bg-purple-500 text-white";
      case "seller": return "bg-blue-500 text-white";
      case "buyer": return "bg-green-500 text-white";
      case "rider": return "bg-orange-500 text-white";
      case "agent": return "bg-pink-500 text-white";
      default: return "bg-gray-500 text-white";
    }
  };

  const filterUsersByRole = (users: UserData[], role: string) => {
    if (role === "all") return users;
    return users.filter(u => u.role === role);
  };

  const filterUsersBySearch = (users: UserData[], query: string) => {
    if (!query) return users;
    const lowerQuery = query.toLowerCase();
    return users.filter(u => 
      (u.username?.toLowerCase() || '').includes(lowerQuery) ||
      (u.name?.toLowerCase() || '').includes(lowerQuery) ||
      (u.email?.toLowerCase() || '').includes(lowerQuery)
    );
  };

  // Filter out the current admin user from the list
  const otherUsers = users.filter((u) => {
    if (u.id === user?.id) return false;
    if (!showInternalRiderFeatures && u.role === "rider") return false;
    return true;
  });
  const roleAndSearchFilteredUsers = filterUsersBySearch(
    filterUsersByRole(otherUsers, selectedRole),
    searchQuery
  );

  // Get batch presence for all visible users (WhatsApp-style online indicators)
  const userIds = roleAndSearchFilteredUsers.map(u => u.id);
  const batchPresence = useBatchPresence(userIds);
  const filteredUsers = showOnlineOnly
    ? roleAndSearchFilteredUsers.filter((u) => batchPresence.getPresence(u.id).status === "online")
    : roleAndSearchFilteredUsers;

  const rolesCounts = {
    all: otherUsers.length,
    admin: otherUsers.filter(u => u.role === "admin").length,
    seller: otherUsers.filter(u => u.role === "seller").length,
    buyer: otherUsers.filter(u => u.role === "buyer").length,
    rider: showInternalRiderFeatures ? otherUsers.filter(u => u.role === "rider").length : 0,
    agent: otherUsers.filter(u => u.role === "agent").length,
  };

  const onlineUsersCount = roleAndSearchFilteredUsers.filter(
    (u) => batchPresence.getPresence(u.id).status === "online",
  ).length;
  const usersLastSyncedLabel = usersUpdatedAt
    ? formatDistanceToNow(new Date(usersUpdatedAt), { addSuffix: true })
    : "just now";
  const messagesLastSyncedLabel = messagesUpdatedAt
    ? formatDistanceToNow(new Date(messagesUpdatedAt), { addSuffix: true })
    : "just now";
  const activeLastSyncedLabel = selectedUserId ? messagesLastSyncedLabel : usersLastSyncedLabel;
  const isSyncingNow = usersRefreshing || messagesRefreshing;

  const selectedUser = otherUsers.find((u) => u.id === selectedUserId);

  useEffect(() => {
    if (!showInternalRiderFeatures && selectedRole === "rider") {
      setSelectedRole("all");
    }
  }, [selectedRole, showInternalRiderFeatures]);

  useEffect(() => {
    if (!showInternalRiderFeatures && selectedUserId) {
      const selected = users.find((u) => u.id === selectedUserId);
      if (selected?.role === "rider") {
        setSelectedUserId(null);
      }
    }
  }, [selectedUserId, showInternalRiderFeatures, users]);

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading messages" description="Preparing conversations, recipients, and realtime messaging tools." />;
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
        <div className="p-4 pb-0 md:p-6 md:pb-0 flex-shrink-0">
          <div className="rounded-2xl border border-border/70 bg-card px-4 py-4 shadow-sm dark:border-emerald-500/25 dark:bg-[linear-gradient(105deg,rgba(16,185,129,0.16)_0%,rgba(16,185,129,0.06)_38%,rgba(15,23,42,0.92)_100%)] md:px-6 md:py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-[240px]">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => selectedUserId ? setSelectedUserId(null) : window.history.back()}
                  data-testid="button-back"
                    className="md:hidden text-foreground/90 hover:bg-muted dark:hover:bg-white/10"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => window.history.back()}
                  data-testid="button-back-desktop"
                  className="hidden md:flex text-foreground/90 hover:bg-muted dark:hover:bg-white/10"
                >
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex-1">
                  <h1 className="text-xl md:text-2xl font-bold text-foreground" data-testid="heading-messages">Messages Hub</h1>
                  <p className="text-sm text-muted-foreground">Real-time conversation center for super admin operations.</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-500/20 dark:text-emerald-200">
                      <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                      Super Admin Messaging
                    </Badge>
                    <Badge variant="secondary">
                      <Wifi className="h-3.5 w-3.5 mr-1" />
                      {onlineUsersCount} online
                    </Badge>
                    <Badge variant="secondary">
                      Synced {activeLastSyncedLabel}
                    </Badge>
                  </div>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-border/70 text-foreground hover:bg-muted dark:border-emerald-500/40 dark:hover:bg-emerald-500/10"
                onClick={() => {
                  void refetchUsers();
                  if (selectedUserId) {
                    void refetchMessages();
                  }
                }}
                data-testid="button-refresh-messages"
                disabled={isSyncingNow}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isSyncingNow ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Mobile: Show user list or chat based on selection */}
        <div className="md:hidden flex-1 min-h-0 flex flex-col p-4 pt-4">
          {!selectedUserId ? (
            <Card className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden border-emerald-500/20 bg-card/95 backdrop-blur-sm">
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search users..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                    data-testid="input-search-messages-mobile"
                  />
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant={showOnlineOnly ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setShowOnlineOnly((prev) => !prev)}
                    data-testid="toggle-online-only-mobile"
                  >
                    {showOnlineOnly ? "Active only" : "All users"}
                  </Button>
                </div>
              </div>
              
              <Tabs value={selectedRole} onValueChange={setSelectedRole} className="mb-3">
                <TabsList className="grid w-full grid-cols-3 h-auto">
                  <TabsTrigger value="all" className="text-xs py-1">All</TabsTrigger>
                  <TabsTrigger value="seller" className="text-xs py-1">Sellers</TabsTrigger>
                  <TabsTrigger value="buyer" className="text-xs py-1">Buyers</TabsTrigger>
                </TabsList>
              </Tabs>

              <ScrollArea className="flex-1">
                {usersLoading ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="text-center py-12">
                    <User className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-sm text-muted-foreground">No users found</p>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredUsers.map((userData) => {
                      const userPresence = batchPresence.getPresence(userData.id);
                      const isOnline = userPresence?.status === 'online';
                      const isAway = userPresence?.status === 'away';
                      
                      return (
                        <div
                          key={userData.id}
                          onClick={() => setSelectedUserId(userData.id)}
                          className="p-3 rounded-lg cursor-pointer hover:bg-muted/70 flex items-center gap-3 active:scale-[0.98] transition-all"
                          data-testid={`user-mobile-${userData.id}`}
                        >
                          {/* Avatar with presence */}
                          <div className="relative flex-shrink-0">
                            <UserAvatar
                              profileImage={userData.profileImage}
                              name={userData.name || userData.username}
                              email={userData.email}
                              size="lg"
                            />
                            <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${
                              isOnline ? 'bg-green-500' : isAway ? 'bg-yellow-500' : 'bg-gray-400'
                            }`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="font-medium text-sm truncate">{userData.name || userData.username}</p>
                              <span className={`text-xs ${isOnline ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                                {isOnline ? 'Online' : isAway ? 'Away' : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <Badge className={`${getRoleBadgeColor(userData.role)} text-[10px] px-1.5 py-0`}>
                                {userData.role}
                              </Badge>
                              {!isOnline && userPresence?.lastSeen && (
                                <span className="text-xs text-muted-foreground">
                                  {formatLastSeen(userPresence.lastSeen)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </Card>
          ) : selectedUser && (
            <Card className="h-full flex flex-col">
              {/* Mobile Chat Header - WhatsApp style */}
              <div className="flex items-center gap-3 p-3 border-b bg-gradient-to-r from-primary/5 to-transparent">
                {/* Avatar with presence */}
                <div className="relative flex-shrink-0">
                  <UserAvatar
                    profileImage={selectedUser.profileImage}
                    name={selectedUser.name || selectedUser.username}
                    email={selectedUser.email}
                    size="md"
                  />
                  <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
                    selectedUserPresence.isOnline ? 'bg-green-500' : 
                    selectedUserPresence.isAway ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{selectedUser.name || selectedUser.username}</h3>
                  <p className={`text-xs ${isPeerTyping ? 'text-primary font-medium' : selectedUserPresence.isOnline ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {isPeerTyping ? (
                      <span className="inline-flex items-center gap-0.5">
                        typing
                        <span className="inline-flex gap-px ml-0.5">
                          <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{animationDelay:"0ms",animationDuration:"900ms"}}/>
                          <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{animationDelay:"200ms",animationDuration:"900ms"}}/>
                          <span className="h-1 w-1 rounded-full bg-current animate-bounce" style={{animationDelay:"400ms",animationDuration:"900ms"}}/>
                        </span>
                      </span>
                    ) : selectedUserPresence.isOnline ? 'Online' :
                       selectedUserPresence.isAway ? 'Away' :
                       selectedUserPresence.presence?.lastSeen ? formatLastSeen(selectedUserPresence.presence.lastSeen) : selectedUser.role}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startCall('voice')}
                  disabled={!!ongoingCall || !!incomingCall || jitsiCall.inCall}
                  className="h-8 w-8"
                >
                  <Phone className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startCall('video')}
                  disabled={!!ongoingCall || !!incomingCall || jitsiCall.inCall}
                  className="h-8 w-8 text-primary"
                >
                  <Video className="h-4 w-4" />
                </Button>
              </div>

              {orderReference?.link && showOrderContext && (
                <div className="mx-3 mt-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Order Context
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowOrderContext(false)}
                      title="Close order reference"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 space-y-2">
                    <p className="text-sm font-semibold">Order #{orderReference.number}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold">{orderActionOwnerLabel}:</span> {orderReference.action}
                    </p>
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        className="text-xs text-primary hover:underline bg-transparent border-0 p-0"
                        onClick={() => navigate(orderReference.link)}
                      >
                        Open order
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void sendOrderReference()}
                        disabled={sendMessageMutation.isPending}
                      >
                        Send Ref
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {productReference?.link && showProductContext && (
                <div className="mx-3 mt-3 rounded-lg border bg-muted/30 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                      Product Context
                    </p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setShowProductContext(false)}
                      title="Close product reference"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <img
                      src={productReference.image || "/placeholder.jpg"}
                      alt={productReference.name}
                      className="h-12 w-12 rounded-md border object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold truncate">{productReference.name}</p>
                      <a href={productReference.link} className="text-xs text-primary hover:underline">
                        Open product
                      </a>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void sendProductReference()}
                      disabled={sendMessageMutation.isPending}
                    >
                      Send Ref
                    </Button>
                  </div>
                </div>
              )}

              {/* Mobile Chat Messages */}
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
                        className={`flex ${msg.messageType === 'missed_call' ? 'justify-center' : msg.senderId === user?.id ? "justify-end" : "justify-start"}`}
                        data-msg-id={msg.id}
                      >
                        {msg.messageType === 'missed_call' ? (
                          <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/20 rounded-full text-red-600 dark:text-red-400 text-sm">
                            <PhoneOff className="h-4 w-4" />
                            <span>{msg.message}</span>
                            <span className="text-xs opacity-70">
                              {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        ) : (
                        <div
                          className={`max-w-[85%] px-3 py-2 rounded-2xl ${
                            msg.senderId === user?.id
                              ? "bg-emerald-700 text-white rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          }`}
                        >
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <MessageAttachmentContent message={msg.message} className="text-sm whitespace-pre-wrap" />
                            </div>
                            <span className="flex items-center gap-0.5 flex-shrink-0">
                              <span className="text-[10px] opacity-70 whitespace-nowrap">
                                {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                              </span>
                              {msg.senderId === user?.id && (
                                <MessageStatusTicks
                                  status={msg.status || "sent"}
                                  deliveredAt={msg.deliveredAt}
                                  readAt={msg.readAt}
                                />
                              )}
                            </span>
                          </div>
                        </div>
                        )}
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

              {/* Mobile Input */}
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => handleTypingChange(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  disabled={sendMessageMutation.isPending}
                  className="flex-1"
                />
                {message.trim() ? (
                  <Button
                    onClick={handleSendMessage}
                    disabled={sendMessageMutation.isPending || uploadingAudio}
                    size="icon"
                    className="rounded-full"
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
        <div className="hidden md:flex md:flex-col flex-1 min-h-0 p-4 md:p-6 pt-4">
          <div className="mb-4 flex-shrink-0 flex items-center gap-2">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 border-emerald-500/20"
                data-testid="input-search-messages"
              />
            </div>
            <Button
              size="sm"
              variant={showOnlineOnly ? "default" : "outline"}
              className="h-9"
              onClick={() => setShowOnlineOnly((prev) => !prev)}
              data-testid="toggle-online-only-desktop"
            >
              {showOnlineOnly ? "Active only" : "All users"}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
            <Card className="md:col-span-1 p-4 flex flex-col overflow-hidden border-emerald-500/20 bg-card/95 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-4 flex-shrink-0">
                <h3 className="font-semibold">Users</h3>
                <Badge variant="secondary" data-testid="badge-total-count">
                  {filteredUsers.length}
                </Badge>
              </div>
              
              <Tabs value={selectedRole} onValueChange={setSelectedRole} className="mb-4 flex-shrink-0">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all" data-testid="tab-all">All ({rolesCounts.all})</TabsTrigger>
                  <TabsTrigger value="seller" data-testid="tab-seller">Sellers ({rolesCounts.seller})</TabsTrigger>
                  <TabsTrigger value="buyer" data-testid="tab-buyer">Buyers ({rolesCounts.buyer})</TabsTrigger>
                </TabsList>
                <TabsList className={`grid w-full mt-2 ${showInternalRiderFeatures ? "grid-cols-3" : "grid-cols-2"}`}>
                  {showInternalRiderFeatures ? <TabsTrigger value="rider" data-testid="tab-rider">Riders ({rolesCounts.rider})</TabsTrigger> : null}
                  <TabsTrigger value="admin" data-testid="tab-admin">Admins ({rolesCounts.admin})</TabsTrigger>
                  <TabsTrigger value="agent" data-testid="tab-agent">Customer Agents ({rolesCounts.agent})</TabsTrigger>
                </TabsList>
            </Tabs>

            <ScrollArea className="flex-1 min-h-0">
              {usersLoading ? (
                <div className="text-center py-12">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="text-center py-12">
                  <User className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <p className="text-sm text-muted-foreground" data-testid="text-no-users">
                    No users found
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredUsers.map((userData) => {
                    const userPresence = batchPresence.getPresence(userData.id);
                    const isOnline = userPresence?.status === 'online';
                    const isAway = userPresence?.status === 'away';
                    
                    return (
                      <div
                        key={userData.id}
                        onClick={() => setSelectedUserId(userData.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-all border ${
                          selectedUserId === userData.id
                            ? "bg-emerald-500/12 border-emerald-500/45 shadow-sm"
                            : "border-transparent hover:border-emerald-500/25 hover:bg-emerald-500/5"
                        }`}
                        data-testid={`user-${userData.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar with presence indicator */}
                          <div className="relative flex-shrink-0">
                            <UserAvatar
                              profileImage={userData.profileImage}
                              name={userData.name || userData.username}
                              email={userData.email}
                              size="md"
                            />
                            {/* Online indicator dot */}
                            <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
                              isOnline ? 'bg-green-500' : isAway ? 'bg-yellow-500' : 'bg-gray-400'
                            }`} />
                          </div>
                          
                          {/* User info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-sm truncate">{userData.name || userData.username}</p>
                              <Badge className={`${getRoleBadgeColor(userData.role)} text-[10px] px-1.5 py-0`} data-testid={`badge-role-${userData.id}`}>
                                {userData.role}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`text-xs ${isOnline ? 'text-green-600 font-medium' : 'text-muted-foreground'}`}>
                                {isOnline ? 'Online' : isAway ? 'Away' : userPresence?.lastSeen ? formatLastSeen(userPresence.lastSeen) : 'Offline'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </Card>

            <Card className="md:col-span-2 p-4 flex flex-col overflow-hidden border-emerald-500/20 bg-card/95 backdrop-blur-sm">
            {selectedUser ? (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between pb-4 border-b mb-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar with presence */}
                    <div className="relative">
                      <UserAvatar
                        profileImage={selectedUser.profileImage}
                        name={selectedUser.name || selectedUser.username}
                        email={selectedUser.email}
                        size="lg"
                      />
                      <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${
                        selectedUserPresence.isOnline ? 'bg-green-500' : 
                        selectedUserPresence.isAway ? 'bg-yellow-500' : 'bg-gray-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{selectedUser.name || selectedUser.username}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${
                          isPeerTyping ? 'text-primary font-medium' : selectedUserPresence.isOnline ? 'text-green-600 font-medium' : 'text-muted-foreground'
                        }`}>
                          {isPeerTyping ? (
                            <span className="inline-flex items-center gap-0.5">
                              typing
                              <span className="inline-flex gap-px ml-0.5">
                                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{animationDelay:"0ms",animationDuration:"900ms"}}/>
                                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{animationDelay:"200ms",animationDuration:"900ms"}}/>
                                <span className="h-1.5 w-1.5 rounded-full bg-current animate-bounce" style={{animationDelay:"400ms",animationDuration:"900ms"}}/>
                              </span>
                            </span>
                          ) : selectedUserPresence.isOnline ? 'Online' :
                             selectedUserPresence.isAway ? 'Away' :
                             selectedUserPresence.presence?.lastSeen ? `Last seen ${formatLastSeen(selectedUserPresence.presence.lastSeen)}` : 'Offline'}
                        </span>
                        <span className="text-muted-foreground">|</span>
                        <Badge className={getRoleBadgeColor(selectedUser.role)} variant="secondary">
                          {selectedUser.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ParticipantSelectorDialog
                      currentUserId={user?.id || ''}
                      onStartCall={async (participantIds, callType) => {
                        try {
                          await jitsiCall.startGroupCall(participantIds, callType);
                        } catch (error) {
                          toast({
                            title: "Group call failed",
                            description: error instanceof Error ? error.message : "Could not start group call",
                            variant: "destructive",
                          });
                        }
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startCall('voice')}
                      disabled={!selectedUserId || !!ongoingCall || !!incomingCall || jitsiCall.inCall}
                      data-testid="button-voice-call"
                    >
                      <Phone className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startCall('video')}
                      disabled={!selectedUserId || !!ongoingCall || !!incomingCall || jitsiCall.inCall}
                      data-testid="button-video-call"
                    >
                      <Video className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

                {orderReference?.link && showOrderContext && (
                  <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Order Context
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setShowOrderContext(false)}
                        title="Close order reference"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 space-y-2">
                      <p className="text-sm font-semibold">Order #{orderReference.number}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-semibold">{orderActionOwnerLabel}:</span> {orderReference.action}
                      </p>
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          className="text-xs text-primary hover:underline bg-transparent border-0 p-0"
                          onClick={() => navigate(orderReference.link)}
                        >
                          Open order
                        </button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void sendOrderReference()}
                          disabled={sendMessageMutation.isPending}
                        >
                          Send reference
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                {productReference?.link && showProductContext && (
                  <div className="mb-4 rounded-lg border bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                        Product Context
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setShowProductContext(false)}
                        title="Close product reference"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <img
                        src={productReference.image || "/placeholder.jpg"}
                        alt={productReference.name}
                        className="h-14 w-14 rounded-md border object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{productReference.name}</p>
                        <a href={productReference.link} className="text-xs text-primary hover:underline">
                          Open product
                        </a>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void sendProductReference()}
                        disabled={sendMessageMutation.isPending}
                      >
                        Send reference
                      </Button>
                    </div>
                  </div>
                )}

                <ScrollArea className="flex-1 min-h-0 mb-4">
                  {messagesLoading ? (
                    <div className="text-center py-12">
                      <Loader2 className="h-8 w-8 mx-auto animate-spin text-primary" />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center py-12">
                      <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground" data-testid="text-no-messages">
                        No messages yet. Start the conversation!
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Array.from(new Map(messages.map((m) => [m.id, m])).values()).map((msg) => (
                        msg.messageType === 'missed_call' ? (
                          <div key={msg.id} className="flex justify-center" data-testid={`message-${msg.id}`}>
                            <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-900/20 rounded-full text-red-600 dark:text-red-400 text-sm">
                              <PhoneOff className="h-4 w-4" />
                              <span>{msg.message}</span>
                              <span className="text-xs opacity-70">
                                {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                        ) : (
                        <div
                          key={msg.id}
                          className={`flex gap-3 ${msg.senderId === user?.id ? "flex-row-reverse" : ""}`}
                          data-testid={`message-${msg.id}`}
                        >
                          <div className="flex-shrink-0">
                            <UserAvatar
                              profileImage={msg.senderId === user?.id ? (user?.profileImage || null) : (selectedUser?.profileImage || null)}
                              name={msg.senderId === user?.id ? (user?.name || "You") : (selectedUser?.name || selectedUser?.username || "User")}
                              email={msg.senderId === user?.id ? user?.email : selectedUser?.email}
                              size="sm"
                            />
                          </div>
                          <div className={`flex-1 ${msg.senderId === user?.id ? "text-right" : ""}`}>
                            <div
                              className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                                msg.senderId === user?.id
                                  ? "bg-emerald-700 text-white"
                                  : "bg-muted"
                              }`}
                            >
                              <div className="flex items-end gap-2">
                                <div className="flex-1">
                                  <MessageAttachmentContent message={msg.message} className="text-sm whitespace-pre-wrap" />
                                </div>
                                <span className="flex items-center gap-0.5 flex-shrink-0">
                                  <span className={`text-[10px] whitespace-nowrap ${
                                    msg.senderId === user?.id ? 'opacity-70' : 'text-muted-foreground'
                                  }`}>
                                    {formatDistanceToNow(new Date(msg.createdAt), { addSuffix: true })}
                                  </span>
                                  {msg.senderId === user?.id && (
                                    <MessageStatusTicks
                                      status={msg.status || "sent"}
                                      deliveredAt={msg.deliveredAt}
                                      readAt={msg.readAt}
                                    />
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                        )
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

                <div className="flex gap-2 flex-shrink-0 pt-2 border-t">
                  <Input
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => handleTypingChange(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    disabled={sendMessageMutation.isPending}
                    className="flex-1"
                    data-testid="input-message"
                  />
                  {message.trim() ? (
                    <Button
                      onClick={handleSendMessage}
                      disabled={sendMessageMutation.isPending || uploadingAudio}
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
                      disabled={sendMessageMutation.isPending || uploadingAudio}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center">
                    <MessageSquare className="h-16 w-16 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground" data-testid="text-select-user">
                      Select a user to start messaging
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
          </div>
        </div>
      </div>

      {/* Incoming Call Dialog */}
      {incomingCall && (
        <Dialog open={!!incomingCall} onOpenChange={() => rejectCall()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">
                Incoming {incomingCall.callType === 'video' ? 'Video' : 'Voice'} Call
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 py-4">
              <div className="text-center">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  {incomingCall.callType === 'video' ? (
                    <Video className="h-8 w-8 text-primary" />
                  ) : (
                    <Phone className="h-8 w-8 text-primary" />
                  )}
                </div>
                <p className="text-lg font-semibold mb-2">{incomingCall.callerName}</p>
                <p className="text-sm text-muted-foreground">
                  is calling you...
                </p>
              </div>
              <div className="flex gap-4">
                <Button
                  onClick={acceptCall}
                  className="flex-1"
                  size="lg"
                  data-testid="button-accept-call"
                >
                  <Phone className="h-5 w-5 mr-2" />
                  Accept
                </Button>
                <Button
                  onClick={rejectCall}
                  variant="destructive"
                  className="flex-1"
                  size="lg"
                  data-testid="button-reject-call"
                >
                  <PhoneOff className="h-5 w-5 mr-2" />
                  Decline
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Ongoing Call Dialog */}
      {ongoingCall && (
        <Dialog open={!!ongoingCall} onOpenChange={endCall}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">
                {ongoingCall.callType === 'video' ? 'Video' : 'Voice'} Call with {ongoingCall.targetName}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {ongoingCall.callType === 'video' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover"
                      data-testid="video-remote"
                    />
                    <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1 rounded-md">
                      <p className="text-white text-sm font-medium">{ongoingCall.targetName}</p>
                    </div>
                  </div>
                  <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      data-testid="video-local"
                    />
                    <div className="absolute bottom-3 left-3 bg-black/70 px-3 py-1 rounded-md">
                      <p className="text-white text-sm font-medium">You</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6 animate-pulse">
                    <Phone className="h-12 w-12 text-primary" />
                  </div>
                  <p className="text-lg font-semibold mb-2">Voice Call in Progress</p>
                  <p className="text-sm text-muted-foreground">
                    Connected with {ongoingCall.targetName}
                  </p>
                </div>
              )}
              <div className="flex justify-center gap-4">
                <Button
                  onClick={endCall}
                  variant="destructive"
                  size="lg"
                  className="min-w-[150px]"
                  data-testid="button-end-call"
                >
                  <PhoneOff className="h-5 w-5 mr-2" />
                  End Call
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Group Call Invitation Dialog */}
      {groupCallInvite && (
        <Dialog open={!!groupCallInvite} onOpenChange={(open) => !open && setGroupCallInvite(null)}>
          <DialogContent data-testid="dialog-group-call-invite">
            <DialogHeader>
              <DialogTitle>Incoming Group {groupCallInvite.callType === 'video' ? 'Video' : 'Voice'} Call</DialogTitle>
            </DialogHeader>
            <div className="text-center py-6">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <User className="h-8 w-8 text-primary" />
              </div>
              <p className="text-lg font-semibold mb-1">{groupCallInvite.hostName}</p>
              <p className="text-sm text-muted-foreground mb-6">
                invites you to a group {groupCallInvite.callType} call
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  onClick={() => setGroupCallInvite(null)}
                  data-testid="button-decline-group-call"
                >
                  Decline
                </Button>
                <Button
                  variant="default"
                  onClick={() => {
                    if (groupCallInvite) {
                      groupCall.joinGroupCall(groupCallInvite.callId, groupCallInvite.callType);
                      setGroupCallInvite(null);
                    }
                  }}
                  data-testid="button-accept-group-call"
                >
                  <Video className="h-4 w-4 mr-2" />
                  Join Call
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Group Call Dialog */}
      <GroupCallDialog
        isOpen={groupCall.state.isActive}
        isHost={groupCall.state.isHost}
        participants={groupCall.state.participants}
        localStream={groupCall.state.localStream}
        callType={groupCall.state.callType}
        onEndCall={groupCall.endGroupCall}
        onLeaveCall={groupCall.leaveGroupCall}
        onToggleMute={groupCall.toggleMute}
        onToggleVideo={groupCall.toggleVideo}
      />

    </DashboardLayout>
  );
}
