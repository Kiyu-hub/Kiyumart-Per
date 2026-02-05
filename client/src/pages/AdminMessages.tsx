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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Search, MessageSquare, Send, ArrowLeft, User, Phone, Video, PhoneOff } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { MessageStatusTicks } from "@/components/MessageStatusTicks";
import { useSocket } from "@/contexts/NotificationContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGroupCall } from "@/hooks/useGroupCall";
import { ParticipantSelectorDialog } from "@/components/ParticipantSelectorDialog";
import { GroupCallDialog } from "@/components/GroupCallDialog";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import { JitsiCallDialog } from "@/components/JitsiCallDialog";
import { usePresence, useBatchPresence, formatLastSeen } from "@/hooks/usePresence";
import { PresenceIndicator, AvatarWithPresence } from "@/components/PresenceIndicator";

interface UserData {
  id: string;
  username: string;
  name: string;
  email: string;
  role: string;
  phone: string | null;
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

export default function AdminMessages() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState<string>("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const socket = useSocket();
  
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

  // Get userId from URL search params if present (when clicking from AdminUsers)
  const urlParams = new URLSearchParams(window.location.search);
  const userIdFilter = urlParams.get("userId");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  // Socket.IO event listeners for message status updates
  useEffect(() => {
    if (!socket || !selectedUserId) return;

    const handleMessageDelivered = (data: { messageId: string; deliveredAt: string }) => {
      console.log("📨 Message delivered:", data);
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
      console.log("👀 Messages read:", data);
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
      console.log("📞 Incoming call from:", data.callerName, data.callType);
      setIncomingCall({
        callerId: data.callerId,
        callerName: data.callerName,
        callType: data.callType,
        offer: data.offer
      });
    };

    const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log("📞 Call answer received");
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      } catch (error) {
        console.error("❌ Error setting remote description:", error);
      }
    };

    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      console.log("🧊 ICE candidate received");
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error("❌ Error adding ICE candidate:", error);
      }
    };

    const handleCallEnd = () => {
      console.log("📞 Call ended by remote party");
      endCall();
    };

    const handleGroupCallInvite = (data: { callId: string; hostId: string; hostName: string; callType: 'voice' | 'video' }) => {
      console.log("🎥 Group call invite from:", data.hostName, data.callType);
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

  const { data: users = [], isLoading: usersLoading } = useQuery<UserData[]>({
    queryKey: ["/api/users"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
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

  const { data: messages = [], isLoading: messagesLoading } = useQuery<Message[]>({
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

  const handleSendMessage = () => {
    if (message.trim() && selectedUserId) {
      sendMessageMutation.mutate({
        receiverId: selectedUserId,
        message: message.trim(),
      });
    }
  };

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
      console.log("📹 Remote track received:", event.streams[0]);
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    };

    // Handle ICE candidates (use parameter instead of state to avoid stale closure)
    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log("🧊 Sending ICE candidate to:", targetUserId);
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
      console.log(`📞 Starting Jitsi ${callType} call with ${selectedUser.name}`);
      await jitsiCall.startCall(selectedUserId, callType);
      toast({
        title: `${callType === 'video' ? 'Video' : 'Voice'} Call Started`,
        description: `Connecting to ${selectedUser.name}...`
      });
    } catch (error) {
      console.error("❌ Jitsi call start error:", error);
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
      console.log(`📞 Starting ${callType} call with ${selectedUser?.name}`);
      
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
      console.error("❌ Call start error:", error);
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
      console.log(`📞 Accepting ${incomingCall.callType} call from ${incomingCall.callerName}`);
      
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
      console.error("❌ Call accept error:", error);
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
    console.log("📞 Ending call");
    
    // Stop all media tracks
    localStreamRef.current?.getTracks().forEach(track => {
      track.stop();
      console.log(`🛑 Stopped track: ${track.kind}`);
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
  const otherUsers = users.filter(u => u.id !== user?.id);
  const filteredUsers = filterUsersBySearch(
    filterUsersByRole(otherUsers, selectedRole),
    searchQuery
  );

  // Get batch presence for all visible users (WhatsApp-style online indicators)
  const userIds = filteredUsers.map(u => u.id);
  const batchPresence = useBatchPresence(userIds);

  const rolesCounts = {
    all: otherUsers.length,
    admin: otherUsers.filter(u => u.role === "admin").length,
    seller: otherUsers.filter(u => u.role === "seller").length,
    buyer: otherUsers.filter(u => u.role === "buyer").length,
    rider: otherUsers.filter(u => u.role === "rider").length,
    agent: otherUsers.filter(u => u.role === "agent").length,
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="flex flex-col h-[calc(100vh-56px)] overflow-hidden">
        <div className="flex items-center gap-4 p-4 pb-0 md:p-6 md:pb-0 flex-shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => selectedUserId ? setSelectedUserId(null) : window.history.back()}
            data-testid="button-back"
            className="md:hidden"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            data-testid="button-back-desktop"
            className="hidden md:flex"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl md:text-2xl font-bold text-foreground" data-testid="heading-messages">Messages</h1>
            <p className="text-muted-foreground text-sm hidden md:block">Chat with users on the platform</p>
          </div>
        </div>

        {/* Mobile: Show user list or chat based on selection */}
        <div className="md:hidden flex-1 min-h-0 flex flex-col p-4 pt-4">
          {!selectedUserId ? (
            <Card className="flex-1 min-h-0 p-4 flex flex-col overflow-hidden">
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
                          className="p-3 rounded-lg cursor-pointer hover:bg-accent/50 flex items-center gap-3 active:scale-[0.98] transition-all"
                          data-testid={`user-mobile-${userData.id}`}
                        >
                          {/* Avatar with presence */}
                          <div className="relative flex-shrink-0">
                            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                              <span className="text-base font-semibold text-primary">
                                {(userData.name || userData.username || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
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
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                    <span className="text-sm font-semibold text-primary">
                      {(selectedUser.name || selectedUser.username || 'U').charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background ${
                    selectedUserPresence.isOnline ? 'bg-green-500' : 
                    selectedUserPresence.isAway ? 'bg-yellow-500' : 'bg-gray-400'
                  }`} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{selectedUser.name || selectedUser.username}</h3>
                  <p className={`text-xs ${selectedUserPresence.isOnline ? 'text-green-600' : 'text-muted-foreground'}`}>
                    {selectedUserPresence.isOnline ? 'Online' : 
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
                    {messages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.messageType === 'missed_call' ? 'justify-center' : msg.senderId === user?.id ? "justify-end" : "justify-start"}`}
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
                              ? "bg-primary text-primary-foreground rounded-br-sm"
                              : "bg-muted rounded-bl-sm"
                          }`}
                        >
                          <div className="flex items-end gap-2">
                            <p className="text-sm flex-1">{msg.message}</p>
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
                  </div>
                )}
              </ScrollArea>

              {/* Mobile Input */}
              <div className="p-3 border-t flex gap-2">
                <Input
                  placeholder="Type a message..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                  disabled={sendMessageMutation.isPending}
                  className="flex-1"
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!message.trim() || sendMessageMutation.isPending}
                  size="icon"
                  className="rounded-full"
                >
                  {sendMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Desktop: Side-by-side layout */}
        <div className="hidden md:flex md:flex-col flex-1 min-h-0 p-4 md:p-6 pt-4">
          <div className="mb-4 flex-shrink-0">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-messages"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 min-h-0 overflow-hidden">
            <Card className="md:col-span-1 p-4 flex flex-col overflow-hidden">
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
                <TabsList className="grid w-full grid-cols-3 mt-2">
                  <TabsTrigger value="rider" data-testid="tab-rider">Riders ({rolesCounts.rider})</TabsTrigger>
                  <TabsTrigger value="admin" data-testid="tab-admin">Admins ({rolesCounts.admin})</TabsTrigger>
                  <TabsTrigger value="agent" data-testid="tab-agent">Agents ({rolesCounts.agent})</TabsTrigger>
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
                        className={`p-3 rounded-lg cursor-pointer transition-all ${
                          selectedUserId === userData.id
                            ? "bg-primary/10 border-l-4 border-l-primary"
                            : "hover:bg-accent/50"
                        }`}
                        data-testid={`user-${userData.id}`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Avatar with presence indicator */}
                          <div className="relative flex-shrink-0">
                            <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                              <span className="text-sm font-semibold text-primary">
                                {(userData.name || userData.username || 'U').charAt(0).toUpperCase()}
                              </span>
                            </div>
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

          <Card className="md:col-span-2 p-4 flex flex-col overflow-hidden">
            {selectedUser ? (
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="flex items-center justify-between pb-4 border-b mb-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar with presence */}
                    <div className="relative">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center">
                        <span className="text-lg font-semibold text-primary">
                          {(selectedUser.name || selectedUser.username || 'U').charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <span className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-background ${
                        selectedUserPresence.isOnline ? 'bg-green-500' : 
                        selectedUserPresence.isAway ? 'bg-yellow-500' : 'bg-gray-400'
                      }`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg">{selectedUser.name || selectedUser.username}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-sm ${
                          selectedUserPresence.isOnline ? 'text-green-600 font-medium' : 'text-muted-foreground'
                        }`}>
                          {selectedUserPresence.isOnline ? 'Online now' : 
                           selectedUserPresence.isAway ? 'Away' :
                           selectedUserPresence.presence?.lastSeen ? `Last seen ${formatLastSeen(selectedUserPresence.presence.lastSeen)}` : 'Offline'}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <Badge className={getRoleBadgeColor(selectedUser.role)} variant="secondary">
                          {selectedUser.role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ParticipantSelectorDialog
                      currentUserId={user?.id || ''}
                      onStartCall={(participantIds, callType) => {
                        groupCall.startGroupCall(participantIds, callType, user?.role);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startCall('voice')}
                      disabled={!selectedUserId || !!ongoingCall || !!incomingCall || groupCall.state.isActive}
                      data-testid="button-voice-call"
                    >
                      <Phone className="h-5 w-5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startCall('video')}
                      disabled={!selectedUserId || !!ongoingCall || !!incomingCall || groupCall.state.isActive}
                      data-testid="button-video-call"
                    >
                      <Video className="h-5 w-5" />
                    </Button>
                  </div>
                </div>

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
                      {messages.map((msg) => (
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
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <User className="h-4 w-4 text-primary" />
                            </div>
                          </div>
                          <div className={`flex-1 ${msg.senderId === user?.id ? "text-right" : ""}`}>
                            <div
                              className={`inline-block px-3 py-2 rounded-lg max-w-[80%] ${
                                msg.senderId === user?.id
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-accent"
                              }`}
                            >
                              <div className="flex items-end gap-2">
                                <p className="text-sm flex-1">{msg.message}</p>
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
                    </div>
                  )}
                </ScrollArea>

                <div className="flex gap-2 flex-shrink-0 pt-2 border-t">
                  <Input
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyPress={(e) => e.key === "Enter" && !e.shiftKey && handleSendMessage()}
                    disabled={sendMessageMutation.isPending}
                    className="flex-1"
                    data-testid="input-message"
                  />
                  <Button
                    onClick={handleSendMessage}
                    disabled={!message.trim() || sendMessageMutation.isPending}
                    data-testid="button-send"
                  >
                    {sendMessageMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
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

      {/* Jitsi Meet Call Dialog */}
      <JitsiCallDialog
        isOpen={jitsiCall.inCall || !!jitsiCall.incomingCall}
        roomUrl={jitsiCall.getJitsiUrl()}
        roomName={jitsiCall.currentRoom?.roomName || null}
        callType={jitsiCall.currentRoom?.callType || jitsiCall.incomingCall?.callType || 'video'}
        participants={jitsiCall.currentRoom?.participants?.map(id => ({ id, name: 'Participant' })) || []}
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
