import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useSocket } from "@/contexts/NotificationContext";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { WebRTCCallDialog } from "@/components/WebRTCCallDialog";

// ─── ICE / STUN / TURN configuration ─────────────────────────────────────────
const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // Free TURN relay — handles symmetric NAT without any account
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveCall {
  roomName: string;
  callType: "voice" | "video";
  targetUserId: string;
  createdBy: string;
  participants: string[];
  roomUrl: string;
  createdAt: string;
}

interface IncomingCall {
  roomName: string;
  roomUrl: string;
  callerId: string;
  callerName: string;
  callType: "voice" | "video";
}

interface PendingOffer {
  offer: RTCSessionDescriptionInit;
  callerId: string;
  callType: "voice" | "video";
}

interface OutgoingUnansweredCall {
  roomName: string;
  targetUserId: string;
  callType: "voice" | "video";
  timerId: number | null;
  answered: boolean;
  recordedMissed: boolean;
}

// Keep JitsiConfig in the interface for backward-compat with any page that might read it;
// it is always null in WebRTC mode.
interface JitsiConfig {
  domain: string;
  roomName: string;
  roomUrl: string;
  isModerator: boolean;
  configOverwrite: Record<string, any>;
  interfaceConfigOverwrite: Record<string, any>;
  userInfo: { displayName: string; email: string };
}

export interface JitsiCallContextType {
  inCall: boolean;
  currentRoom: ActiveCall | null;
  incomingCall: IncomingCall | null;
  isStarting: boolean;
  isJoining: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  startCall: (targetUserId: string, callType?: "voice" | "video", orderId?: string) => Promise<void>;
  startGroupCall: (participantIds: string[], callType?: "voice" | "video") => Promise<void>;
  joinCall: (roomName: string) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => void;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
  getJitsiUrl: () => string | null;
  jitsiConfig: JitsiConfig | null;
}

const JitsiCallContext = createContext<JitsiCallContextType | undefined>(undefined);

export function useJitsiCallContext(): JitsiCallContextType {
  const ctx = useContext(JitsiCallContext);
  if (!ctx) throw new Error("useJitsiCallContext must be used inside JitsiCallProvider");
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function JitsiCallProvider({ children }: { children: ReactNode }) {
  const socket = useSocket();
  const { user } = useAuth();
  const { toast } = useToast();

  // ── Call state ──────────────────────────────────────────────────────────────
  const [currentRoom, setCurrentRoom] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // ── Refs (stable across renders, safe inside callbacks) ─────────────────────
  const inCallRef = useRef(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const targetUserIdRef = useRef<string | null>(null);
  const pendingOfferRef = useRef<PendingOffer | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const outgoingUnansweredRef = useRef<OutgoingUnansweredCall | null>(null);

  // ── Audio context for ringtone ───────────────────────────────────────────────
  const ringtoneRef = useRef<{
    audioContext: AudioContext | null;
    intervalId: number | null;
    outgoingIntervalId: number | null;
  }>({ audioContext: null, intervalId: null, outgoingIntervalId: null });

  const getOrCreateAudioContext = useCallback(() => {
    if (ringtoneRef.current.audioContext) return ringtoneRef.current.audioContext;
    const Ctor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return null;
    const ctx = new Ctor();
    ringtoneRef.current.audioContext = ctx;
    return ctx;
  }, []);

  const closeAudioIfIdle = useCallback(() => {
    if (ringtoneRef.current.intervalId !== null) return;
    if (ringtoneRef.current.outgoingIntervalId !== null) return;
    if (ringtoneRef.current.audioContext) {
      void ringtoneRef.current.audioContext.close();
      ringtoneRef.current.audioContext = null;
    }
  }, []);

  const stopRingtone = useCallback(() => {
    if (ringtoneRef.current.intervalId !== null) {
      window.clearInterval(ringtoneRef.current.intervalId);
      ringtoneRef.current.intervalId = null;
    }
    closeAudioIfIdle();
  }, [closeAudioIfIdle]);

  const playRingBurst = useCallback((ctx: AudioContext) => {
    const now = ctx.currentTime;
    const env = 0.22;
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * env);
      gain.gain.exponentialRampToValueAtTime(0.12, now + i * env + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * env + env);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * env);
      osc.stop(now + i * env + env);
    });
  }, []);

  const startRingtone = useCallback(async () => {
    if (ringtoneRef.current.intervalId !== null) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      playRingBurst(ctx);
      ringtoneRef.current.intervalId = window.setInterval(() => playRingBurst(ctx), 1400);
    } catch { /* ignore */ }
  }, [getOrCreateAudioContext, playRingBurst]);

  const stopOutgoingRingback = useCallback(() => {
    if (ringtoneRef.current.outgoingIntervalId !== null) {
      window.clearInterval(ringtoneRef.current.outgoingIntervalId);
      ringtoneRef.current.outgoingIntervalId = null;
    }
    closeAudioIfIdle();
  }, [closeAudioIfIdle]);

  const playOutgoingBurst = useCallback((ctx: AudioContext) => {
    const now = ctx.currentTime;
    const env = 0.24;
    [540, 720].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * env);
      gain.gain.exponentialRampToValueAtTime(0.09, now + i * env + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * env + env);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * env);
      osc.stop(now + i * env + env);
    });
  }, []);

  const startOutgoingRingback = useCallback(async () => {
    if (ringtoneRef.current.outgoingIntervalId !== null) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") await ctx.resume();
      playOutgoingBurst(ctx);
      ringtoneRef.current.outgoingIntervalId = window.setInterval(() => playOutgoingBurst(ctx), 1600);
    } catch { /* ignore */ }
  }, [getOrCreateAudioContext, playOutgoingBurst]);

  // ── Missed-call tracking ─────────────────────────────────────────────────────
  const clearOutgoingUnanswered = useCallback(() => {
    const s = outgoingUnansweredRef.current;
    if (!s) return;
    if (s.timerId !== null) window.clearTimeout(s.timerId);
    outgoingUnansweredRef.current = null;
  }, []);

  const recordOutgoingMissedCall = useCallback(async (s: OutgoingUnansweredCall) => {
    if (s.recordedMissed || s.answered) return;
    s.recordedMissed = true;
    try {
      await apiRequest("POST", "/api/calls/missed", { targetUserId: s.targetUserId, callType: s.callType });
    } catch { /* no-op */ }
  }, []);

  const scheduleOutgoingUnanswered = useCallback(
    (roomName: string, targetUserId: string, callType: "voice" | "video") => {
      clearOutgoingUnanswered();
      const s: OutgoingUnansweredCall = {
        roomName, targetUserId, callType, timerId: null, answered: false, recordedMissed: false,
      };
      s.timerId = window.setTimeout(async () => {
        if (!outgoingUnansweredRef.current || outgoingUnansweredRef.current.roomName !== roomName) return;
        if (!s.answered) {
          await recordOutgoingMissedCall(s);
          try { await apiRequest("POST", `/api/calls/${roomName}/end`); } catch { /* no-op */ }
          toast({ title: "No answer", description: "Missed call recorded." });
        }
        stopOutgoingRingback();
        clearOutgoingUnanswered();
      }, 30000);
      outgoingUnansweredRef.current = s;
    },
    [clearOutgoingUnanswered, recordOutgoingMissedCall, stopOutgoingRingback, toast]
  );

  // ── WebRTC peer factory ──────────────────────────────────────────────────────
  const createPeer = useCallback(
    (targetUserId: string): RTCPeerConnection => {
      const peer = new RTCPeerConnection(RTC_CONFIG);

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket?.emit("ice_candidate", { candidate, targetUserId });
        }
      };

      peer.ontrack = ({ streams }) => {
        if (streams[0]) {
          setRemoteStream(streams[0]);
          setIsConnecting(false);
        }
      };

      peer.onconnectionstatechange = () => {
        if (
          peer.connectionState === "failed" ||
          peer.connectionState === "disconnected" ||
          peer.connectionState === "closed"
        ) {
          if (inCallRef.current) {
            toast({ title: "Call disconnected", description: "The call connection was lost." });
            // cleanupCall is called via the ref to avoid stale closure
            cleanupCallRef.current?.();
          }
        }
      };

      return peer;
    },
    [socket, toast]
  );

  // ── Core cleanup ─────────────────────────────────────────────────────────────
  const cleanupCall = useCallback(() => {
    stopRingtone();
    stopOutgoingRingback();
    clearOutgoingUnanswered();

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    peerRef.current?.close();
    peerRef.current = null;

    setRemoteStream(null);
    setCurrentRoom(null);
    setIncomingCall(null);
    setIsConnecting(false);
    setIsStarting(false);
    setIsJoining(false);
    inCallRef.current = false;
    targetUserIdRef.current = null;
    pendingOfferRef.current = null;
    iceCandidateQueueRef.current = [];
  }, [stopRingtone, stopOutgoingRingback, clearOutgoingUnanswered]);

  // Stable ref so peer.onconnectionstatechange can call it without stale closure
  const cleanupCallRef = useRef(cleanupCall);
  useEffect(() => { cleanupCallRef.current = cleanupCall; }, [cleanupCall]);

  // ── Acquire local media ──────────────────────────────────────────────────────
  const getLocalMedia = useCallback(async (callType: "voice" | "video"): Promise<MediaStream> => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: callType === "video",
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  // ── startCall (outgoing) ─────────────────────────────────────────────────────
  const startCall = useCallback(
    async (targetUserId: string, callType: "voice" | "video" = "video", orderId?: string) => {
      if (inCallRef.current) return;
      setIsStarting(true);
      try {
        // 1. Acquire media first so permission prompt appears before API call
        const stream = await getLocalMedia(callType);

        // 2. Notify server → server emits jitsi_call_incoming to target as ring
        const res = await apiRequest("POST", "/api/calls/start", { targetUserId, callType, orderId });
        const data = await res.json();
        const roomName: string = data.room?.roomName || `kiyumart-${Date.now()}`;

        // 3. Build peer + attach tracks
        const peer = createPeer(targetUserId);
        peerRef.current = peer;
        targetUserIdRef.current = targetUserId;
        stream.getTracks().forEach((t) => peer.addTrack(t, stream));

        // 4. Create offer
        const offer = await peer.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: callType === "video",
        });
        await peer.setLocalDescription(offer);

        // 5. Send offer via socket (server relays to target)
        socket?.emit("call_offer", { targetUserId, offer, callType, roomName });

        // 6. Update state
        setCurrentRoom({
          roomName,
          callType,
          targetUserId,
          createdBy: user?.id || "",
          participants: [user?.id || "", targetUserId],
          roomUrl: "",
          createdAt: new Date().toISOString(),
        });
        inCallRef.current = true;
        setIsConnecting(true);
        setIsStarting(false);

        // 7. Outgoing ringback + unanswered timer
        await startOutgoingRingback();
        scheduleOutgoingUnanswered(roomName, targetUserId, callType);
      } catch (error: any) {
        setIsStarting(false);
        cleanupCall();
        toast({
          title: "Failed to start call",
          description: error?.message || "Could not access camera/microphone.",
          variant: "destructive",
        });
      }
    },
    [createPeer, getLocalMedia, cleanupCall, scheduleOutgoingUnanswered, socket, startOutgoingRingback, toast, user?.id]
  );

  // ── acceptIncomingCall ───────────────────────────────────────────────────────
  const acceptIncomingCall = useCallback(async () => {
    const inc = incomingCall;
    if (!inc) return;
    setIsJoining(true);
    try {
      const stream = await getLocalMedia(inc.callType);

      const peer = createPeer(inc.callerId);
      peerRef.current = peer;
      targetUserIdRef.current = inc.callerId;
      stream.getTracks().forEach((t) => peer.addTrack(t, stream));

      // Apply stored offer if already received
      const pending = pendingOfferRef.current;
      if (pending?.offer) {
        await peer.setRemoteDescription(pending.offer);
        for (const c of iceCandidateQueueRef.current) {
          await peer.addIceCandidate(c);
        }
        iceCandidateQueueRef.current = [];
      }

      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket?.emit("call_answer", { targetUserId: inc.callerId, answer });

      // Inform server
      if (inc.roomName) {
        try { await apiRequest("POST", `/api/calls/${inc.roomName}/join`); } catch { /* no-op */ }
      }

      stopRingtone();
      setCurrentRoom({
        roomName: inc.roomName,
        callType: inc.callType,
        targetUserId: inc.callerId,
        createdBy: inc.callerId,
        participants: [user?.id || "", inc.callerId],
        roomUrl: "",
        createdAt: new Date().toISOString(),
      });
      setIncomingCall(null);
      inCallRef.current = true;
      setIsConnecting(!pending?.offer); // already have offer → connecting, else waiting
      setIsJoining(false);
    } catch (error: any) {
      setIsJoining(false);
      cleanupCall();
      toast({
        title: "Failed to join call",
        description: error?.message || "Could not access camera/microphone.",
        variant: "destructive",
      });
    }
  }, [createPeer, cleanupCall, getLocalMedia, incomingCall, socket, stopRingtone, toast, user?.id]);

  // ── rejectIncomingCall ───────────────────────────────────────────────────────
  const rejectIncomingCall = useCallback(() => {
    const inc = incomingCall;
    if (inc) {
      socket?.emit("call_end", { targetUserId: inc.callerId });
    }
    stopRingtone();
    setIncomingCall(null);
    pendingOfferRef.current = null;
    toast({ title: "Call declined" });
  }, [incomingCall, socket, stopRingtone, toast]);

  // ── endCall / leaveCall ──────────────────────────────────────────────────────
  const endCall = useCallback(async () => {
    if (targetUserIdRef.current) {
      socket?.emit("call_end", { targetUserId: targetUserIdRef.current });
    }
    if (outgoingUnansweredRef.current && !outgoingUnansweredRef.current.answered) {
      await recordOutgoingMissedCall(outgoingUnansweredRef.current);
    }
    if (currentRoom?.roomName) {
      try { await apiRequest("POST", `/api/calls/${currentRoom.roomName}/end`); } catch { /* no-op */ }
    }
    cleanupCall();
    toast({ title: "Call ended" });
  }, [cleanupCall, currentRoom, recordOutgoingMissedCall, socket, toast]);

  const leaveCall = useCallback(async () => {
    // For 1-on-1 WebRTC calls leave = end
    await endCall();
  }, [endCall]);

  // ── joinCall (by roomName) — kept for API compat, maps to accept ──────────────
  const joinCall = useCallback(async (roomName: string) => {
    if (incomingCall?.roomName === roomName) {
      await acceptIncomingCall();
    }
  }, [acceptIncomingCall, incomingCall]);

  // ── startGroupCall — not supported in WebRTC mode (use useGroupCall hook) ────
  const startGroupCall = useCallback(async (_participantIds: string[], _callType?: "voice" | "video") => {
    toast({
      title: "Use group call button",
      description: "Group calls are handled separately via the group call feature.",
    });
  }, [toast]);

  // ── getJitsiUrl / jitsiConfig — always null in WebRTC mode ───────────────────
  const getJitsiUrl = useCallback(() => null, []);

  // ── Socket event handlers ────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket) return;

    // Incoming ring notification (from REST API via server)
    const handleIncomingCall = (data: IncomingCall) => {
      if (inCallRef.current) return;
      setIncomingCall(data);
      startRingtone();
      toast({
        title: `Incoming ${data.callType} call`,
        description: `${data.callerName} is calling you`,
      });
    };

    // SDP offer from caller (server relay of call_offer socket event)
    const handleCallOffer = (data: {
      offer: RTCSessionDescriptionInit;
      callerId: string;
      callerName: string;
      callType: "voice" | "video";
      roomName?: string;
    }) => {
      if (inCallRef.current) return;
      pendingOfferRef.current = { offer: data.offer, callerId: data.callerId, callType: data.callType };

      // If ring hasn't arrived yet, create the incoming call entry now
      setIncomingCall((prev) => {
        if (prev) return prev; // ring already shown
        startRingtone();
        toast({
          title: `Incoming ${data.callType} call`,
          description: `${data.callerName} is calling you`,
        });
        return {
          roomName: data.roomName || "",
          roomUrl: "",
          callerId: data.callerId,
          callerName: data.callerName,
          callType: data.callType,
        };
      });
    };

    // SDP answer from callee
    const handleCallAnswer = async (data: { answer: RTCSessionDescriptionInit }) => {
      const peer = peerRef.current;
      if (!peer) return;
      try {
        await peer.setRemoteDescription(data.answer);
        for (const c of iceCandidateQueueRef.current) {
          await peer.addIceCandidate(c);
        }
        iceCandidateQueueRef.current = [];
        stopOutgoingRingback();
        if (outgoingUnansweredRef.current) {
          outgoingUnansweredRef.current.answered = true;
          clearOutgoingUnanswered();
        }
      } catch { /* peer may have been cleaned up */ }
    };

    // ICE candidate from remote
    const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
      const peer = peerRef.current;
      if (!peer) return;
      if (peer.remoteDescription) {
        try { await peer.addIceCandidate(data.candidate); } catch { /* no-op */ }
      } else {
        iceCandidateQueueRef.current.push(data.candidate);
      }
    };

    // Remote party hung up
    const handleCallEnd = () => {
      if (!inCallRef.current && !incomingCall) return;
      stopRingtone();
      cleanupCall();
      toast({ title: "Call ended", description: "The other party ended the call." });
    };

    socket.on("jitsi_call_incoming", handleIncomingCall);
    socket.on("call_offer", handleCallOffer);
    socket.on("call_answer", handleCallAnswer);
    socket.on("ice_candidate", handleIceCandidate);
    socket.on("call_end", handleCallEnd);
    socket.on("jitsi_call_ended", handleCallEnd); // legacy compat

    return () => {
      socket.off("jitsi_call_incoming", handleIncomingCall);
      socket.off("call_offer", handleCallOffer);
      socket.off("call_answer", handleCallAnswer);
      socket.off("ice_candidate", handleIceCandidate);
      socket.off("call_end", handleCallEnd);
      socket.off("jitsi_call_ended", handleCallEnd);
    };
  }, [
    cleanupCall,
    clearOutgoingUnanswered,
    incomingCall,
    socket,
    startRingtone,
    stopOutgoingRingback,
    stopRingtone,
    toast,
  ]);

  // Stop ringtone when incoming call is dismissed
  useEffect(() => {
    if (!incomingCall) stopRingtone();
  }, [incomingCall, stopRingtone]);

  // Unlock AudioContext on first user interaction (browser requirement)
  useEffect(() => {
    const unlock = async () => {
      const ctx = getOrCreateAudioContext();
      if (!ctx || ctx.state !== "suspended") return;
      try { await ctx.resume(); } catch { /* no-op */ }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, [getOrCreateAudioContext]);

  // Full cleanup on unmount
  useEffect(() => {
    return () => { cleanupCallRef.current?.(); };
  }, []);

  const inCall = !!currentRoom;

  const value: JitsiCallContextType = {
    inCall,
    currentRoom,
    incomingCall,
    isStarting,
    isJoining,
    localStream,
    remoteStream,
    startCall,
    startGroupCall,
    joinCall,
    acceptIncomingCall,
    rejectIncomingCall,
    leaveCall,
    endCall,
    getJitsiUrl,
    jitsiConfig: null,
  };

  // Determine callerName for the active call display
  const callerName = incomingCall?.callerName ?? undefined;

  return (
    <JitsiCallContext.Provider value={value}>
      {children}
      {/* Global WebRTC call dialog — active on every page */}
      <WebRTCCallDialog
        isOpen={inCall || !!incomingCall}
        localStream={localStream}
        remoteStream={remoteStream}
        callType={currentRoom?.callType ?? incomingCall?.callType ?? "video"}
        callerName={callerName}
        incomingCall={
          incomingCall
            ? { callerName: incomingCall.callerName, callType: incomingCall.callType }
            : null
        }
        isConnecting={isConnecting}
        onAccept={() => { void acceptIncomingCall(); }}
        onReject={() => rejectIncomingCall()}
        onEnd={() => { void endCall(); }}
      />
    </JitsiCallContext.Provider>
  );
}
