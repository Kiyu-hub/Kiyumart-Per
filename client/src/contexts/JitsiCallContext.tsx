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
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

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

// ── Mesh group call (up to 4 participants) ───────────────────────────────────
// Each browser opens an RTCPeerConnection to every other participant. Free
// STUN + the existing OpenRelay TURN handle NAT traversal. No SFU, no signup.
export const GROUP_CALL_MAX = 4;

export interface GroupCallParticipant {
  userId: string;
  userName: string;
  stream: MediaStream | null;
  pc: RTCPeerConnection | null;
}

interface GroupCallState {
  callId: string;
  callType: "voice" | "video";
  isHost: boolean;
  hostId: string;
  hostName: string;
  // participants = everyone EXCEPT the local user
  participants: Map<string, GroupCallParticipant>;
}

interface IncomingCall {
  roomName: string;
  roomUrl: string;
  callerId: string;
  callerName: string;
  callType: "voice" | "video";
  // Group-call invites carry these. Falsy = legacy 1-to-1.
  isGroup?: boolean;
  groupCallId?: string;
  participantIds?: string[];
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
  // Group call (mesh, up to 4 participants total)
  groupCall: GroupCallState | null;
  remoteParticipants: GroupCallParticipant[];
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
  const { callerRingtone, receiverRingtone } = usePlatformSettings();

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

  // ── Group call state ────────────────────────────────────────────────────────
  const [groupCall, setGroupCall] = useState<GroupCallState | null>(null);
  const groupCallRef = useRef<GroupCallState | null>(null);
  useEffect(() => { groupCallRef.current = groupCall; }, [groupCall]);

  // ICE candidates that arrive before the corresponding peer's
  // setRemoteDescription has resolved — keyed by peerUserId.
  const groupIceQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

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
    const tone = (freq: number, startAt: number, dur: number, vol: number, shape: OscillatorType = "sine") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = shape;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + startAt);
      gain.gain.exponentialRampToValueAtTime(vol, now + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startAt + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startAt);
      osc.stop(now + startAt + dur + 0.05);
    };
    switch (receiverRingtone) {
      case "whatsapp":
        [660, 880, 660, 880].forEach((f, i) => tone(f, i * 0.15, 0.12, 0.1));
        break;
      case "classic":
        tone(800, 0, 0.15, 0.12, "square"); tone(800, 0.2, 0.15, 0.12, "square");
        tone(800, 0.6, 0.15, 0.12, "square"); tone(800, 0.8, 0.15, 0.12, "square");
        break;
      case "gentle":
        [523, 659, 784].forEach((f, i) => tone(f, i * 0.22, 0.18, 0.09));
        break;
      case "professional":
        tone(880, 0, 0.1, 0.1); tone(1100, 0.15, 0.1, 0.1); tone(880, 0.3, 0.1, 0.08);
        break;
      default:
        tone(880, 0, 0.22, 0.12); tone(660, 0.24, 0.22, 0.12);
    }
  }, [receiverRingtone]);

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
    const tone = (freq: number, startAt: number, dur: number, vol: number, shape: OscillatorType = "triangle") => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = shape;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + startAt);
      gain.gain.exponentialRampToValueAtTime(vol, now + startAt + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startAt + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startAt);
      osc.stop(now + startAt + dur + 0.05);
    };
    switch (callerRingtone) {
      case "whatsapp":
        [440, 550, 660].forEach((f, i) => tone(f, i * 0.18, 0.14, 0.08, "sine"));
        break;
      case "classic":
        tone(400, 0, 0.4, 0.1, "sine"); tone(400, 0.5, 0.4, 0.1, "sine");
        break;
      case "gentle":
        tone(480, 0, 0.5, 0.07, "sine");
        break;
      case "professional":
        tone(600, 0, 0.15, 0.08, "sine"); tone(600, 0.4, 0.15, 0.08, "sine");
        break;
      default:
        tone(540, 0, 0.24, 0.09); tone(720, 0.26, 0.24, 0.09);
    }
  }, [callerRingtone]);

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

    // Tear down every group peer connection.
    if (groupCallRef.current) {
      groupCallRef.current.participants.forEach((p) => {
        try { p.pc?.close(); } catch { /* no-op */ }
        try { p.stream?.getTracks().forEach((t) => t.stop()); } catch { /* no-op */ }
      });
    }
    groupCallRef.current = null;
    setGroupCall(null);
    groupIceQueueRef.current.clear();

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

  // ── Group peer factory ──────────────────────────────────────────────────────
  // Each group peer is identified by the remote user id. The callId is
  // included on every signaling message so the server can validate.
  const createGroupPeer = useCallback(
    (peerUserId: string, callId: string): RTCPeerConnection => {
      const pc = new RTCPeerConnection(RTC_CONFIG);

      pc.onicecandidate = ({ candidate }) => {
        if (candidate && socket) {
          socket.emit("group_ice_candidate", { callId, targetUserId: peerUserId, candidate });
        }
      };

      pc.ontrack = ({ streams }) => {
        const stream = streams[0];
        if (!stream) return;
        setGroupCall((prev) => {
          if (!prev) return prev;
          const next = new Map(prev.participants);
          const existing = next.get(peerUserId);
          if (existing) {
            next.set(peerUserId, { ...existing, stream });
          } else {
            next.set(peerUserId, { userId: peerUserId, userName: "Participant", stream, pc });
          }
          return { ...prev, participants: next };
        });
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          setGroupCall((prev) => {
            if (!prev) return prev;
            const next = new Map(prev.participants);
            const existing = next.get(peerUserId);
            if (existing) {
              try { existing.pc?.close(); } catch { /* no-op */ }
              next.set(peerUserId, { ...existing, pc: null, stream: null });
            }
            return { ...prev, participants: next };
          });
        }
      };

      return pc;
    },
    [socket],
  );

  const flushGroupIceQueue = useCallback(async (peerUserId: string, pc: RTCPeerConnection) => {
    const queued = groupIceQueueRef.current.get(peerUserId);
    if (!queued || queued.length === 0) return;
    for (const c of queued) {
      try { await pc.addIceCandidate(c); } catch { /* peer may have closed */ }
    }
    groupIceQueueRef.current.delete(peerUserId);
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

    // Group call branch — different signaling flow.
    if (inc.isGroup && inc.groupCallId) {
      try {
        await getLocalMedia(inc.callType);
        // Seed the group state so the dialog renders immediately.
        setGroupCall({
          callId: inc.groupCallId,
          callType: inc.callType,
          isHost: false,
          hostId: inc.callerId,
          hostName: inc.callerName.replace(/ \(group\)$/, ""),
          participants: new Map(),
        });
        socket?.emit("group_call_join", { callId: inc.groupCallId });
        stopRingtone();
        setIncomingCall(null);
        inCallRef.current = true;
        setIsConnecting(true);
        setIsJoining(false);
      } catch (error: any) {
        setIsJoining(false);
        cleanupCall();
        toast({
          title: "Failed to join group call",
          description: error?.message || "Could not access camera/microphone.",
          variant: "destructive",
        });
      }
      return;
    }

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
    // Group call: host ends for everyone, participant leaves only for self.
    const group = groupCallRef.current;
    if (group) {
      if (group.isHost) {
        socket?.emit("group_call_end", { callId: group.callId });
      } else {
        socket?.emit("group_call_leave", { callId: group.callId });
      }
      cleanupCall();
      toast({ title: "Call ended" });
      return;
    }

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
    // Group call: a non-host leaving = just emit leave; host leaving = end.
    const group = groupCallRef.current;
    if (group && !group.isHost) {
      socket?.emit("group_call_leave", { callId: group.callId });
      cleanupCall();
      toast({ title: "You left the call" });
      return;
    }
    await endCall();
  }, [cleanupCall, endCall, socket, toast]);

  // ── joinCall (by roomName) — kept for API compat, maps to accept ──────────────
  const joinCall = useCallback(async (roomName: string) => {
    if (incomingCall?.roomName === roomName) {
      await acceptIncomingCall();
    }
  }, [acceptIncomingCall, incomingCall]);

  // ── startGroupCall ──────────────────────────────────────────────────────────
  // Mesh group call up to GROUP_CALL_MAX participants (host + 3 others = 4).
  // Server fans out group_call_invite to each participant. Peer connections
  // open as those participants accept (group_call_participant_joined).
  const startGroupCall = useCallback(
    async (participantIds: string[], callType: "voice" | "video" = "video") => {
      if (inCallRef.current) {
        toast({ title: "Already in a call", description: "End the current call before starting a new one." });
        return;
      }
      if (!socket) {
        toast({ title: "Connection error", description: "Not connected to the server.", variant: "destructive" });
        return;
      }
      if (user?.role !== "admin" && user?.role !== "super_admin") {
        toast({ title: "Permission denied", description: "Only admins can start group calls.", variant: "destructive" });
        return;
      }

      const unique = Array.from(new Set(participantIds.filter((id) => id && id !== user?.id)));
      if (unique.length === 0) {
        toast({ title: "Pick at least one person", description: "Add participants before starting the call." });
        return;
      }
      if (unique.length + 1 > GROUP_CALL_MAX) {
        toast({
          title: "Too many participants",
          description: `Group calls support up to ${GROUP_CALL_MAX} people total — pick at most ${GROUP_CALL_MAX - 1} others.`,
          variant: "destructive",
        });
        return;
      }

      setIsStarting(true);
      try {
        await getLocalMedia(callType);
        socket.emit("group_call_start", { participantIds: unique, callType });
        inCallRef.current = true;
        await startOutgoingRingback();
      } catch (error: any) {
        cleanupCall();
        toast({
          title: "Failed to start group call",
          description: error?.message || "Could not access camera/microphone.",
          variant: "destructive",
        });
      } finally {
        setIsStarting(false);
      }
    },
    [cleanupCall, getLocalMedia, socket, startOutgoingRingback, toast, user?.id, user?.role],
  );

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

    // ── Group call signal handlers ─────────────────────────────────────────
    // Incoming invite (participant side)
    const handleGroupInvite = (data: {
      callId: string;
      hostId: string;
      hostName: string;
      participantIds: string[];
      callType: "voice" | "video";
    }) => {
      if (inCallRef.current) return;
      setIncomingCall({
        roomName: data.callId,
        roomUrl: "",
        callerId: data.hostId,
        callerName: `${data.hostName} (group)`,
        callType: data.callType,
        isGroup: true,
        groupCallId: data.callId,
        participantIds: data.participantIds,
      });
      startRingtone();
      toast({
        title: `Incoming group ${data.callType} call`,
        description: `${data.hostName} added you to a call.`,
      });
    };

    // Host gets confirmation that the call is live
    const handleGroupStarted = (data: { callId: string; participants: string[]; callType: "voice" | "video" }) => {
      const myId = user?.id || "";
      const others = data.participants.filter((p) => p !== myId);
      setGroupCall({
        callId: data.callId,
        callType: data.callType,
        isHost: true,
        hostId: myId,
        hostName: user?.name || "You",
        participants: new Map(
          others.map((id) => [id, { userId: id, userName: "Participant", stream: null, pc: null }]),
        ),
      });
      stopOutgoingRingback();
    };

    // Participant got their join confirmed — and receives the existing roster.
    // They open offers to everyone already on the call.
    const handleGroupJoined = async (data: {
      callId: string;
      participants: string[];
      callType: "voice" | "video";
    }) => {
      const myId = user?.id || "";
      const others = data.participants.filter((p) => p !== myId);
      // Seed roster
      setGroupCall((prev) => ({
        callId: data.callId,
        callType: data.callType,
        isHost: false,
        hostId: prev?.hostId || "",
        hostName: prev?.hostName || "",
        participants: new Map(
          others.map((id) => [id, { userId: id, userName: "Participant", stream: null, pc: null }]),
        ),
      }));

      const localStream = localStreamRef.current;
      if (!localStream) return;

      // Offer to every existing participant
      for (const peerUserId of others) {
        try {
          const pc = createGroupPeer(peerUserId, data.callId);
          localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit("group_call_offer", { callId: data.callId, targetUserId: peerUserId, offer });
          setGroupCall((prev) => {
            if (!prev) return prev;
            const next = new Map(prev.participants);
            const existing = next.get(peerUserId);
            next.set(peerUserId, { ...(existing || { userId: peerUserId, userName: "Participant", stream: null }), pc });
            return { ...prev, participants: next };
          });
        } catch (err) {
          console.error("group offer failed:", err);
        }
      }
    };

    // Someone new joined while you're already in the call — just add to roster.
    // The new joiner will send YOU the offer (handleGroupOffer).
    const handleGroupParticipantJoined = (data: { callId: string; userId: string; userName: string }) => {
      const myId = user?.id || "";
      if (data.userId === myId) return;
      setGroupCall((prev) => {
        if (!prev) return prev;
        const next = new Map(prev.participants);
        if (!next.has(data.userId)) {
          next.set(data.userId, { userId: data.userId, userName: data.userName || "Participant", stream: null, pc: null });
        }
        return { ...prev, participants: next };
      });
    };

    // Incoming SDP offer from another participant
    const handleGroupOffer = async (data: { callId: string; fromUserId: string; offer: RTCSessionDescriptionInit }) => {
      const current = groupCallRef.current;
      if (!current || current.callId !== data.callId) return;
      try {
        const pc = createGroupPeer(data.fromUserId, data.callId);
        const localStream = localStreamRef.current;
        if (localStream) localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
        await pc.setRemoteDescription(data.offer);
        await flushGroupIceQueue(data.fromUserId, pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit("group_call_answer", { callId: data.callId, targetUserId: data.fromUserId, answer });
        setGroupCall((prev) => {
          if (!prev) return prev;
          const next = new Map(prev.participants);
          const existing = next.get(data.fromUserId);
          next.set(data.fromUserId, { ...(existing || { userId: data.fromUserId, userName: "Participant", stream: null }), pc });
          return { ...prev, participants: next };
        });
      } catch (err) {
        console.error("group answer failed:", err);
      }
    };

    const handleGroupAnswer = async (data: { callId: string; fromUserId: string; answer: RTCSessionDescriptionInit }) => {
      const current = groupCallRef.current;
      if (!current || current.callId !== data.callId) return;
      const peer = current.participants.get(data.fromUserId)?.pc;
      if (!peer) return;
      try {
        await peer.setRemoteDescription(data.answer);
        await flushGroupIceQueue(data.fromUserId, peer);
      } catch { /* peer may have torn down */ }
    };

    const handleGroupIceCandidate = async (data: { callId: string; fromUserId: string; candidate: RTCIceCandidateInit }) => {
      const current = groupCallRef.current;
      if (!current || current.callId !== data.callId) return;
      const peer = current.participants.get(data.fromUserId)?.pc;
      if (peer && peer.remoteDescription) {
        try { await peer.addIceCandidate(data.candidate); } catch { /* no-op */ }
      } else {
        const list = groupIceQueueRef.current.get(data.fromUserId) || [];
        list.push(data.candidate);
        groupIceQueueRef.current.set(data.fromUserId, list);
      }
    };

    const handleGroupParticipantLeft = (data: { callId: string; userId: string }) => {
      setGroupCall((prev) => {
        if (!prev) return prev;
        const next = new Map(prev.participants);
        const existing = next.get(data.userId);
        if (existing) {
          try { existing.pc?.close(); } catch { /* no-op */ }
          next.delete(data.userId);
        }
        return { ...prev, participants: next };
      });
    };

    const handleGroupEnded = () => {
      if (!inCallRef.current && !incomingCall) return;
      cleanupCall();
      toast({ title: "Group call ended", description: "The host ended the call." });
    };

    socket.on("jitsi_call_incoming", handleIncomingCall);
    socket.on("call_offer", handleCallOffer);
    socket.on("call_answer", handleCallAnswer);
    socket.on("ice_candidate", handleIceCandidate);
    socket.on("call_end", handleCallEnd);
    socket.on("jitsi_call_ended", handleCallEnd); // legacy compat
    socket.on("group_call_invite", handleGroupInvite);
    socket.on("group_call_started", handleGroupStarted);
    socket.on("group_call_joined", handleGroupJoined);
    socket.on("group_call_participant_joined", handleGroupParticipantJoined);
    socket.on("group_call_offer", handleGroupOffer);
    socket.on("group_call_answer", handleGroupAnswer);
    socket.on("group_ice_candidate", handleGroupIceCandidate);
    socket.on("group_call_participant_left", handleGroupParticipantLeft);
    socket.on("group_call_ended", handleGroupEnded);

    return () => {
      socket.off("jitsi_call_incoming", handleIncomingCall);
      socket.off("call_offer", handleCallOffer);
      socket.off("call_answer", handleCallAnswer);
      socket.off("ice_candidate", handleIceCandidate);
      socket.off("call_end", handleCallEnd);
      socket.off("jitsi_call_ended", handleCallEnd);
      socket.off("group_call_invite", handleGroupInvite);
      socket.off("group_call_started", handleGroupStarted);
      socket.off("group_call_joined", handleGroupJoined);
      socket.off("group_call_participant_joined", handleGroupParticipantJoined);
      socket.off("group_call_offer", handleGroupOffer);
      socket.off("group_call_answer", handleGroupAnswer);
      socket.off("group_ice_candidate", handleGroupIceCandidate);
      socket.off("group_call_participant_left", handleGroupParticipantLeft);
      socket.off("group_call_ended", handleGroupEnded);
    };
  }, [
    cleanupCall,
    clearOutgoingUnanswered,
    createGroupPeer,
    flushGroupIceQueue,
    incomingCall,
    socket,
    startRingtone,
    stopOutgoingRingback,
    stopRingtone,
    toast,
    user?.id,
    user?.name,
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

  const inCall = !!currentRoom || !!groupCall;

  // Flatten the group participants Map into an array for the dialog.
  const remoteParticipants: GroupCallParticipant[] = groupCall
    ? Array.from(groupCall.participants.values())
    : [];

  const value: JitsiCallContextType = {
    inCall,
    currentRoom,
    incomingCall,
    isStarting,
    isJoining,
    localStream,
    remoteStream,
    groupCall,
    remoteParticipants,
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

  const callerName = groupCall
    ? `Group call · ${remoteParticipants.length + 1} people`
    : (incomingCall?.callerName ?? undefined);

  const callType = groupCall?.callType ?? currentRoom?.callType ?? incomingCall?.callType ?? "video";

  return (
    <JitsiCallContext.Provider value={value}>
      {children}
      {/* Global WebRTC call dialog — active on every page. Renders the
          multi-tile grid automatically when remoteParticipants has entries. */}
      <WebRTCCallDialog
        isOpen={inCall || !!incomingCall}
        localStream={localStream}
        remoteStream={remoteStream}
        remoteParticipants={remoteParticipants}
        callType={callType}
        callerName={callerName}
        incomingCall={
          incomingCall
            ? {
                callerName: incomingCall.callerName,
                callType: incomingCall.callType,
                isGroup: !!incomingCall.isGroup,
              }
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
