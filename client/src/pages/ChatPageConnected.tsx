import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { io, Socket } from "socket.io-client";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import ChatInterface from "@/components/ChatInterface";
import CallInterface from "@/components/CallInterface";
import ThemeToggle from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Loader2, AlertCircle, Users, Phone, Video } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePresence, useBatchPresence, formatLastSeen } from "@/hooks/usePresence";
import { buildChatAttachmentMessage } from "@/lib/chatAttachments";

interface ChatMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: string;
  readAt?: string | null;
  deliveredAt?: string | null;
  status?: 'sent' | 'delivered' | 'read';
  isRead: boolean;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  profileImage?: string | null;
}

export default function ChatPageConnected() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedContact, setSelectedContact] = useState<User | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isContactTyping, setIsContactTyping] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const selectedContactIdRef = useRef<string | null>(null);
  const prevContactsLength = useRef(0);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  // WebRTC Call State
  const [callState, setCallState] = useState<"idle" | "calling" | "incoming" | "connected" | "ended">("idle");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const userIdFilter = new URLSearchParams(location.split("?")[1] || "").get("userId");
  const [incomingCallData, setIncomingCallData] = useState<{ callerId: string; callerName: string; callType: "audio" | "video"; offer: any } | null>(null);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null); // Track remote peer for ICE candidates
  
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const remotePeerIdRef = useRef<string | null>(null); // Ref for immediate access in closures
  const iceCandidatesQueue = useRef<RTCIceCandidate[]>([]);

  // Auth guard: only redirect after auth is fully resolved
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    selectedContactIdRef.current = selectedContact?.id || null;
  }, [selectedContact?.id]);

  // Initialize Socket.io connection ONCE per user
  useEffect(() => {
    if (!user) return;

    // Get JWT token from cookie for Socket.IO authentication
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('token='))
      ?.split('=')[1];

    const socket = io({
      auth: { 
        token // JWT token for authentication middleware
      }
    });

    socket.on("connect", () => {
      console.log("Socket connected (authenticated via JWT)");
      // No manual register needed - auth middleware auto-joins user room
    });

    socket.on("new_message", (message: ChatMessage) => {
      // Update messages if from/to current contact
      setMessages((prevMessages) => {
        const currentContactId = selectedContactIdRef.current;
        if (currentContactId && (message.senderId === currentContactId || message.receiverId === currentContactId)) {
          return [...prevMessages, message];
        }
        return prevMessages;
      });
      
      if (message.senderId !== user.id) {
        toast({
          title: "New Message",
          description: `${message.senderId}: ${message.message.substring(0, 50)}...`,
        });
      }
    });

    // WhatsApp-style message status updates (real-time)
    socket.on("message_status_updated", ({ messageId, status, deliveredAt, readAt }) => {
      setMessages((prevMessages) => 
        prevMessages.map((msg) => 
          msg.id === messageId 
            ? { 
                ...msg, 
                status, 
                deliveredAt: deliveredAt || msg.deliveredAt,
                readAt: readAt || msg.readAt,
                isRead: status === 'read' ? true : msg.isRead
              }
            : msg
        )
      );
      console.log(`✅ Message ${messageId} status updated to: ${status}`);
    });

    const resolveUserId = (payload: any) => (typeof payload === "string" ? payload : payload?.userId);

    socket.on("user_typing", (payload: any) => {
      const typingUserId = resolveUserId(payload);
      if (typingUserId && selectedContactIdRef.current === typingUserId) {
        setIsContactTyping(true);
      }
    });

    socket.on("user_stop_typing", (payload: any) => {
      const typingUserId = resolveUserId(payload);
      if (typingUserId && selectedContactIdRef.current === typingUserId) {
        setIsContactTyping(false);
      }
    });

    // WebRTC Call Signaling Events
    socket.on("call-incoming", ({ callerId, callerName, offer, callType }) => {
      console.log(`Incoming ${callType} call from ${callerName}`);
      setIncomingCallData({ callerId, callerName, callType, offer });
      setCallState("incoming");
      setCallType(callType);
      
      toast({
        title: `Incoming ${callType === "video" ? "Video" : "Voice"} Call`,
        description: `${callerName} is calling you`,
      });
    });

    socket.on("call-answered", async ({ answer }) => {
      console.log("Call answered");
      if (peerConnectionRef.current) {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(answer));
        setCallState("connected");
        
        // Process queued ICE candidates
        iceCandidatesQueue.current.forEach(candidate => {
          peerConnectionRef.current?.addIceCandidate(candidate);
        });
        iceCandidatesQueue.current = [];
      }
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      if (peerConnectionRef.current && peerConnectionRef.current.remoteDescription) {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        iceCandidatesQueue.current.push(new RTCIceCandidate(candidate));
      }
    });

    socket.on("call-rejected", () => {
      console.log("Call rejected");
      toast({
        title: "Call Rejected",
        description: "The other user rejected your call",
        variant: "destructive",
      });
      cleanupCall();
    });

    socket.on("call-ended", () => {
      console.log("Call ended by remote user");
      toast({
        title: "Call Ended",
        description: "The call has been ended",
      });
      cleanupCall();
    });

    socketRef.current = socket;

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socket.disconnect();
      cleanupCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only reconnect when user changes, NOT when contact changes

  // WebRTC Functions
  const createPeerConnection = () => {
    const configuration: RTCConfiguration = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    };

    const pc = new RTCPeerConnection(configuration);

    pc.onicecandidate = (event) => {
      if (event.candidate && socketRef.current && remotePeerIdRef.current) {
        socketRef.current.emit("ice-candidate", {
          targetId: remotePeerIdRef.current,
          candidate: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log("Remote track received");
      setRemoteStream(event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      console.log("Connection state:", pc.connectionState);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanupCall();
      }
    };

    return pc;
  };

  const getMediaStream = async (type: "audio" | "video") => {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: type === "video",
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      setLocalStream(stream);
      return stream;
    } catch (error) {
      console.error("Error accessing media devices:", error);
      toast({
        title: "Media Access Error",
        description: "Could not access camera/microphone. Please check permissions.",
        variant: "destructive",
      });
      return null;
    }
  };

  const startCall = async (type: "audio" | "video") => {
    if (!selectedContact || !user) return;

    setCallType(type);
    setCallState("calling");
    setRemotePeerId(selectedContact.id); // Store remote peer ID for ICE candidates
    remotePeerIdRef.current = selectedContact.id; // Store in ref for immediate access

    const stream = await getMediaStream(type);
    if (!stream) {
      setCallState("idle");
      setRemotePeerId(null);
      remotePeerIdRef.current = null;
      return;
    }

    const pc = createPeerConnection();
    peerConnectionRef.current = pc;

    // Add local stream to peer connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    socketRef.current?.emit("call-offer", {
      receiverId: selectedContact.id,
      offer,
      callType: type,
      callerId: user.id,
      callerName: user.name,
    });
  };

  const acceptCall = async () => {
    if (!incomingCallData || !user) return;

    setRemotePeerId(incomingCallData.callerId); // Store remote peer ID for ICE candidates
    remotePeerIdRef.current = incomingCallData.callerId; // Store in ref for immediate access

    const stream = await getMediaStream(incomingCallData.callType);
    if (!stream) {
      rejectCall();
      return;
    }

    const pc = createPeerConnection();
    peerConnectionRef.current = pc;

    // Add local stream to peer connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Set remote description and create answer
    await pc.setRemoteDescription(new RTCSessionDescription(incomingCallData.offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    // Send answer
    socketRef.current?.emit("call-answer", {
      callerId: incomingCallData.callerId,
      answer,
    });

    setCallState("connected");
    
    // Process queued ICE candidates
    iceCandidatesQueue.current.forEach(candidate => {
      pc.addIceCandidate(candidate);
    });
    iceCandidatesQueue.current = [];
  };

  const rejectCall = () => {
    if (incomingCallData) {
      socketRef.current?.emit("call-rejected", {
        callerId: incomingCallData.callerId,
      });
    }
    cleanupCall();
  };

  const endCall = () => {
    if (remotePeerId) {
      socketRef.current?.emit("call-ended", { targetId: remotePeerId });
    }
    
    cleanupCall();
  };

  const cleanupCall = () => {
    // Stop all media tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      setLocalStream(null);
    }
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => track.stop());
      setRemoteStream(null);
    }

    // Close peer connection
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    // Reset state and refs
    setCallState("idle");
    setIncomingCallData(null);
    setRemotePeerId(null);
    remotePeerIdRef.current = null; // Clear ref too
    setIsMuted(false);
    setIsVideoOff(false);
    iceCandidatesQueue.current = [];
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const { data: contacts = [], isLoading: contactsLoading } = useQuery<User[]>({
    queryKey: ["/api/users", "all", user?.role],
    queryFn: async () => {
      if (user?.role === "admin") {
        const sellersRes = await apiRequest("GET", "/api/users?role=seller");
        const buyersRes = await apiRequest("GET", "/api/users?role=buyer");
        const ridersRes = await apiRequest("GET", "/api/users?role=rider");
        
        const sellers = await sellersRes.json();
        const buyers = await buyersRes.json();
        const riders = await ridersRes.json();
        
        return [...sellers, ...buyers, ...riders].filter(u => u.id !== user?.id);
      } else {
        const adminsRes = await apiRequest("GET", "/api/support/contacts");
        const admins = await adminsRes.json();
        return admins;
      }
    },
    enabled: !authLoading && !!user,
  });

  const contactIds = contacts.map((contact) => contact.id);
  const contactsPresence = useBatchPresence(contactIds);
  const selectedContactPresence = usePresence(selectedContact?.id);

  // Auto-select first contact for non-admin users (prevents empty chat state)
  useEffect(() => {
    if (!selectedContact && contacts.length > 0 && user?.role !== "admin") {
      setSelectedContact(contacts[0]);
    }
  }, [contacts, selectedContact, user?.role]);

  // Open specific contact when arriving via /chat?userId=...
  useEffect(() => {
    if (!userIdFilter || selectedContact?.id === userIdFilter) return;
    const target = contacts.find((c) => c.id === userIdFilter);
    if (target) {
      setSelectedContact(target);
      return;
    }
    // Fallback for rider/buyer assignment links when user isn't in preloaded contacts
    setSelectedContact({
      id: userIdFilter,
      name: "User",
      email: "",
      role: "user",
      profileImage: null,
    });
  }, [userIdFilter, contacts, selectedContact?.id]);

  const { data: chatMessages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/messages", selectedContact?.id],
    queryFn: async () => {
      if (!selectedContact) return [];
      const res = await apiRequest("GET", `/api/messages/${selectedContact.id}`);
      if (!res.ok) {
        throw new Error("Failed to load messages");
      }
      return res.json();
    },
    enabled: !!selectedContact && isAuthenticated,
  });

  // Sync chatMessages to local state
  useEffect(() => {
    setMessages(chatMessages);
  }, [chatMessages]);

  // WhatsApp-style delivery/read receipts for incoming messages in active conversation
  useEffect(() => {
    if (!socketRef.current || !selectedContact || messages.length === 0 || !user?.id) return;

    const incoming = messages.filter((m) => m.senderId === selectedContact.id);
    const undelivered = incoming.filter((m) => !m.deliveredAt && m.status === "sent");
    const unread = incoming.filter((m) => !m.readAt && !m.isRead);

    undelivered.forEach((m) => socketRef.current?.emit("message_delivered", { messageId: m.id }));

    if (unread.length > 0) {
      apiRequest("PATCH", `/api/messages/${selectedContact.id}/read`).catch((error) => {
        console.error("Failed to mark chat as read:", error);
      });
    }
  }, [messages, selectedContact, user?.id]);

  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", "/api/messages", {
        receiverId: selectedContact?.id,
        message,
        messageType: "text",
      });
      return res.json();
    },
    onSuccess: (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Message",
        description: error.message || "Failed to send message",
        variant: "destructive",
      });
    },
  });

  const handleSendMessage = (message: string) => {
    if (!selectedContact) return;
    if (isTypingRef.current) {
      socketRef.current?.emit("stop_typing", { receiverId: selectedContact.id });
      isTypingRef.current = false;
    }
    sendMessageMutation.mutate(message);
  };

  const handleSendAudio = async (file: File) => {
    if (!selectedContact) return;
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

      const voiceMessage = buildChatAttachmentMessage({
        kind: "audio",
        url: payload.url,
        name: file.name,
        size: file.size,
      });
      await sendMessageMutation.mutateAsync(voiceMessage);
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

  const handleTypingChange = (value: string) => {
    if (!selectedContact || !socketRef.current) return;

    if (value.trim().length > 0 && !isTypingRef.current) {
      socketRef.current.emit("typing", { receiverId: selectedContact.id });
      isTypingRef.current = true;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      if (isTypingRef.current && selectedContact) {
        socketRef.current?.emit("stop_typing", { receiverId: selectedContact.id });
        isTypingRef.current = false;
      }
    }, 1200);
  };

  useEffect(() => {
    setIsContactTyping(false);
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
    isTypingRef.current = false;
  }, [selectedContact?.id]);

  useEffect(() => {
    return () => {
      if (selectedContact?.id && isTypingRef.current) {
        socketRef.current?.emit("stop_typing", { receiverId: selectedContact.id });
      }
    };
  }, [selectedContact?.id]);

  // Show loading state while auth is resolving
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-chat" />
      </div>
    );
  }

  // Don't render if no user (will redirect via useEffect)
  if (!user) {
    return null;
  }

  // Show loading for contacts
  if (contactsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-chat" />
      </div>
    );
  }

  const transformedMessages = messages.map((msg) => ({
    id: msg.id,
    text: msg.message,
    sender: msg.senderId === user?.id ? ('user' as const) : ('other' as const),
    timestamp: new Date(msg.createdAt).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    }),
    isRead: !!msg.readAt,
    deliveredAt: msg.deliveredAt,
    readAt: msg.readAt,
    status: msg.status,
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold">Messages</h1>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        <Card className="w-80 flex-shrink-0">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Users className="h-5 w-5" />
              <h2 className="font-semibold">
                {user?.role === "admin" ? "Contacts" : "Support"}
              </h2>
            </div>

            {contactsLoading ? (
              <div className="flex justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : contacts.length > 0 ? (
              <div className="space-y-2">
                {contacts.map((contact) => {
                  const presence = contactsPresence.getPresence(contact.id);
                  const isOnline = presence.status === "online";
                  const statusText = isOnline
                    ? "Online"
                    : presence.status === "away"
                    ? "Away"
                    : presence.lastSeen
                    ? `Last seen ${formatLastSeen(presence.lastSeen)}`
                    : "Offline";

                  return (
                    <button
                      key={contact.id}
                      onClick={() => {
                        setSelectedContact(contact);
                        // TanStack Query will auto-refetch when selectedContact?.id changes
                      }}
                      className={`w-full text-left p-3 rounded-lg transition-colors hover-elevate ${
                        selectedContact?.id === contact.id
                          ? "bg-accent"
                          : "bg-muted"
                      }`}
                      data-testid={`contact-${contact.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={contact.profileImage || undefined} alt={contact.name} />
                          <AvatarFallback>{(contact.name || "U").charAt(0).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium truncate">{contact.name}</div>
                          <div className={`text-xs ${isOnline ? "text-green-600" : "text-muted-foreground"}`}>
                            {statusText}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="text-center text-muted-foreground p-4">
                No contacts available
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex-1 flex items-center justify-center">
          {selectedContact ? (
            <div className="w-full max-w-4xl relative">
              {/* Call Action Buttons */}
              <div className="absolute top-0 right-0 flex gap-2 z-10 bg-background/95 backdrop-blur-sm p-3 rounded-lg border shadow-lg">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => startCall("audio")}
                  disabled={callState !== "idle"}
                  data-testid="button-audio-call"
                  title="Start voice call"
                >
                  <Phone className="h-5 w-5" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => startCall("video")}
                  disabled={callState !== "idle"}
                  data-testid="button-video-call"
                  title="Start video call"
                >
                  <Video className="h-5 w-5" />
                </Button>
              </div>

              <ChatInterface
                contactName={selectedContact.name}
                contactStatus={selectedContactPresence.isOnline ? "online" : "offline"}
                contactStatusText={
                  selectedContactPresence.isOnline
                    ? "Online"
                    : selectedContactPresence.isAway
                    ? "Away"
                    : selectedContactPresence.presence?.lastSeen
                    ? `Last seen ${formatLastSeen(selectedContactPresence.presence.lastSeen)}`
                    : "Offline"
                }
                contactAvatarUrl={selectedContact.profileImage || undefined}
                isContactTyping={isContactTyping}
                messages={transformedMessages}
                onSendMessage={handleSendMessage}
                onTypingChange={handleTypingChange}
                onSendAudio={handleSendAudio}
                isSendingAudio={uploadingAudio || sendMessageMutation.isPending}
              />
            </div>
          ) : contactsLoading ? (
            <div className="flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <Card className="max-w-md">
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">No Conversation Available</h3>
                <p className="text-sm text-muted-foreground">
                  {user?.role === "admin" 
                    ? "Select a contact from the list to start chatting"
                    : "No support contacts available"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Call Interface Overlay */}
      <CallInterface
        localStream={localStream}
        remoteStream={remoteStream}
        callState={callState}
        callType={callType}
        contactName={incomingCallData?.callerName || selectedContact?.name || "Unknown"}
        onAccept={acceptCall}
        onReject={rejectCall}
        onEnd={endCall}
        onToggleMute={toggleMute}
        onToggleVideo={toggleVideo}
        isMuted={isMuted}
        isVideoOff={isVideoOff}
      />
    </div>
  );
}
