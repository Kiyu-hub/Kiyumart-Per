/**
 * useJitsiCall Hook - Jitsi Meet Video/Voice Call Integration
 * 
 * Provides easy-to-use interface for starting and joining Jitsi calls.
 * Zero-cost: Uses public Jitsi Meet infrastructure.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useSocket } from '@/contexts/NotificationContext';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface JitsiRoom {
  roomName: string;
  roomUrl: string;
  createdBy: string;
  participants: string[];
  callType: 'voice' | 'video';
  createdAt: string;
}

interface JitsiConfig {
  domain: string;
  roomName: string;
  roomUrl: string;
  isModerator: boolean;
  configOverwrite: Record<string, any>;
  interfaceConfigOverwrite: Record<string, any>;
  userInfo: {
    displayName: string;
    email: string;
  };
}

interface IncomingCall {
  roomName: string;
  roomUrl: string;
  callerId: string;
  callerName: string;
  callType: 'voice' | 'video';
}

interface OutgoingUnansweredCall {
  roomName: string;
  targetUserId: string;
  callType: 'voice' | 'video';
  timerId: number | null;
  answered: boolean;
  recordedMissed: boolean;
}

interface UseJitsiCallReturn {
  // State
  inCall: boolean;
  currentRoom: JitsiRoom | null;
  incomingCall: IncomingCall | null;
  isStarting: boolean;
  isJoining: boolean;
  
  // Actions
  startCall: (targetUserId: string, callType?: 'voice' | 'video', orderId?: string) => Promise<void>;
  startGroupCall: (participantIds: string[], callType?: 'voice' | 'video') => Promise<void>;
  joinCall: (roomName: string) => Promise<void>;
  acceptIncomingCall: () => Promise<void>;
  rejectIncomingCall: () => void;
  leaveCall: () => Promise<void>;
  endCall: () => Promise<void>;
  
  // Jitsi embed helpers
  getJitsiUrl: () => string | null;
  jitsiConfig: JitsiConfig | null;
}

export function useJitsiCall(userId: string): UseJitsiCallReturn {
  const socket = useSocket();
  const { toast } = useToast();
  
  const [currentRoom, setCurrentRoom] = useState<JitsiRoom | null>(null);
  const [jitsiConfig, setJitsiConfig] = useState<JitsiConfig | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const inCallRef = useRef(false);
  const ringtoneRef = useRef<{ audioContext: AudioContext | null; intervalId: number | null; outgoingIntervalId: number | null }>({
    audioContext: null,
    intervalId: null,
    outgoingIntervalId: null,
  });
  const outgoingUnansweredRef = useRef<OutgoingUnansweredCall | null>(null);

  const getOrCreateAudioContext = useCallback(() => {
    if (ringtoneRef.current.audioContext) {
      return ringtoneRef.current.audioContext;
    }
    const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextCtor) return null;
    const ctx = new AudioContextCtor();
    ringtoneRef.current.audioContext = ctx;
    return ctx;
  }, []);

  const closeAudioContextIfIdle = useCallback(() => {
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
    closeAudioContextIfIdle();
  }, [closeAudioContextIfIdle]);

  const playRingBurst = useCallback((audioContext: AudioContext) => {
    const now = audioContext.currentTime;
    const envelope = 0.22;
    [880, 660].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * envelope);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * envelope + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * envelope + envelope);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + index * envelope);
      oscillator.stop(now + index * envelope + envelope);
    });
  }, []);

  const startRingtone = useCallback(async () => {
    if (ringtoneRef.current.intervalId !== null) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      playRingBurst(ctx);
      ringtoneRef.current.intervalId = window.setInterval(() => {
        playRingBurst(ctx);
      }, 1400);
    } catch {
      // Ignore ringtone init failures
    }
  }, [getOrCreateAudioContext, playRingBurst]);

  const playOutgoingRingBurst = useCallback((audioContext: AudioContext) => {
    const now = audioContext.currentTime;
    const envelope = 0.24;
    [540, 720].forEach((frequency, index) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = "triangle";
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + index * envelope);
      gain.gain.exponentialRampToValueAtTime(0.09, now + index * envelope + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * envelope + envelope);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now + index * envelope);
      oscillator.stop(now + index * envelope + envelope);
    });
  }, []);

  const startOutgoingRingback = useCallback(async () => {
    if (ringtoneRef.current.outgoingIntervalId !== null) return;
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      playOutgoingRingBurst(ctx);
      ringtoneRef.current.outgoingIntervalId = window.setInterval(() => {
        playOutgoingRingBurst(ctx);
      }, 1600);
    } catch {
      // Ignore ringback init failures
    }
  }, [getOrCreateAudioContext, playOutgoingRingBurst]);

  const stopOutgoingRingback = useCallback(() => {
    if (ringtoneRef.current.outgoingIntervalId !== null) {
      window.clearInterval(ringtoneRef.current.outgoingIntervalId);
      ringtoneRef.current.outgoingIntervalId = null;
    }
    closeAudioContextIfIdle();
  }, [closeAudioContextIfIdle]);

  const clearOutgoingUnanswered = useCallback(() => {
    const state = outgoingUnansweredRef.current;
    if (!state) return;
    if (state.timerId !== null) {
      window.clearTimeout(state.timerId);
    }
    outgoingUnansweredRef.current = null;
  }, []);

  const recordOutgoingMissedCall = useCallback(async (state: OutgoingUnansweredCall) => {
    if (state.recordedMissed || state.answered) return;
    state.recordedMissed = true;
    try {
      await apiRequest('POST', '/api/calls/missed', {
        targetUserId: state.targetUserId,
        callType: state.callType,
      });
    } catch (error) {
      console.error('Failed to record outgoing missed call:', error);
    }
  }, []);

  const scheduleOutgoingUnanswered = useCallback((
    roomName: string,
    targetUserId: string,
    callType: 'voice' | 'video'
  ) => {
    clearOutgoingUnanswered();
    const state: OutgoingUnansweredCall = {
      roomName,
      targetUserId,
      callType,
      timerId: null,
      answered: false,
      recordedMissed: false,
    };
    state.timerId = window.setTimeout(async () => {
      if (!outgoingUnansweredRef.current || outgoingUnansweredRef.current.roomName !== roomName) return;
      if (!state.answered) {
        await recordOutgoingMissedCall(state);
        try {
          await apiRequest('POST', `/api/calls/${roomName}/end`);
        } catch (error) {
          console.error('Failed to auto-end unanswered call:', error);
        }
        toast({
          title: 'No answer',
          description: 'Missed call recorded.',
        });
      }
      stopOutgoingRingback();
      clearOutgoingUnanswered();
    }, 30000);
    outgoingUnansweredRef.current = state;
  }, [clearOutgoingUnanswered, recordOutgoingMissedCall, stopOutgoingRingback, toast]);

  // Start 1-on-1 call
  const startCallMutation = useMutation({
    mutationFn: async ({ targetUserId, callType, orderId }: { 
      targetUserId: string; 
      callType: 'voice' | 'video';
      orderId?: string;
    }) => {
      const res = await apiRequest('POST', '/api/calls/start', {
        targetUserId,
        callType,
        orderId,
      });
      return res.json();
    },
    onSuccess: (data) => {
      stopRingtone();
      setCurrentRoom(data.room);
      setJitsiConfig(data.config);
      inCallRef.current = true;
      toast({
        title: 'Call started',
        description: 'Waiting for the other participant to join...',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to start call',
        description: error.message || 'Could not start the call',
        variant: 'destructive',
      });
    },
  });

  // Start group call
  const startGroupCallMutation = useMutation({
    mutationFn: async ({ participantIds, callType }: {
      participantIds: string[];
      callType: 'voice' | 'video';
    }) => {
      const res = await apiRequest('POST', '/api/calls/group/start', {
        participantIds,
        callType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      stopRingtone();
      setCurrentRoom(data.room);
      setJitsiConfig(data.config);
      inCallRef.current = true;
      toast({
        title: 'Group call started',
        description: `Inviting ${data.room.participants.length - 1} participants...`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to start group call',
        description: error.message || 'Could not start the call',
        variant: 'destructive',
      });
    },
  });

  // Join existing call
  const joinCallMutation = useMutation({
    mutationFn: async (roomName: string) => {
      const res = await apiRequest('POST', `/api/calls/${roomName}/join`);
      return res.json();
    },
    onSuccess: (data) => {
      stopRingtone();
      stopOutgoingRingback();
      setCurrentRoom(data.room);
      setJitsiConfig(data.config);
      setIncomingCall(null);
      inCallRef.current = true;
      toast({
        title: 'Joined call',
        description: 'You are now in the call',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to join call',
        description: error.message || 'Could not join the call',
        variant: 'destructive',
      });
    },
  });

  // Leave call
  const leaveCallMutation = useMutation({
    mutationFn: async () => {
      if (!currentRoom) throw new Error('Not in a call');
      const res = await apiRequest('POST', `/api/calls/${currentRoom.roomName}/leave`);
      return res.json();
    },
    onSuccess: () => {
      stopRingtone();
      stopOutgoingRingback();
      setCurrentRoom(null);
      setJitsiConfig(null);
      inCallRef.current = false;
      toast({
        title: 'Left call',
        description: 'You have left the call',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error leaving call',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // End call (host only)
  const endCallMutation = useMutation({
    mutationFn: async () => {
      if (!currentRoom) throw new Error('Not in a call');
      const res = await apiRequest('POST', `/api/calls/${currentRoom.roomName}/end`);
      return res.json();
    },
    onSuccess: () => {
      stopRingtone();
      stopOutgoingRingback();
      setCurrentRoom(null);
      setJitsiConfig(null);
      inCallRef.current = false;
      toast({
        title: 'Call ended',
        description: 'The call has been ended',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error ending call',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    // Incoming 1-on-1 call
    const handleIncomingCall = (data: IncomingCall) => {
      if (!inCallRef.current) {
        setIncomingCall(data);
        startRingtone();
        toast({
          title: `Incoming ${data.callType} call`,
          description: `${data.callerName} is calling you`,
        });
      }
    };

    // Incoming group call invite
    const handleGroupInvite = (data: any) => {
      if (!inCallRef.current) {
        setIncomingCall({
          roomName: data.roomName,
          roomUrl: data.roomUrl,
          callerId: data.hostId,
          callerName: data.hostName,
          callType: data.callType,
        });
        startRingtone();
        toast({
          title: `Group ${data.callType} call`,
          description: `${data.hostName} invited you to a group call`,
        });
      }
    };

    // Call ended by host
    const handleCallEnded = (data: { roomName: string; endedBy: string }) => {
      if (outgoingUnansweredRef.current?.roomName === data.roomName) {
        clearOutgoingUnanswered();
      }
      stopOutgoingRingback();
      if (currentRoom?.roomName === data.roomName) {
        stopRingtone();
        setCurrentRoom(null);
        setJitsiConfig(null);
        inCallRef.current = false;
        toast({
          title: 'Call ended',
          description: 'The call has been ended by the host',
        });
      }
    };

    // Participant joined
    const handleParticipantJoined = (data: { roomName: string; userId: string; userName: string }) => {
      if (outgoingUnansweredRef.current?.roomName === data.roomName) {
        outgoingUnansweredRef.current.answered = true;
        clearOutgoingUnanswered();
        stopOutgoingRingback();
      }
      if (currentRoom?.roomName === data.roomName) {
        toast({
          title: 'Participant joined',
          description: `${data.userName} joined the call`,
        });
      }
    };

    // Participant left
    const handleParticipantLeft = (data: { roomName: string; userId: string }) => {
      if (currentRoom?.roomName === data.roomName) {
        toast({
          title: 'Participant left',
          description: 'A participant left the call',
        });
      }
    };

    socket.on('jitsi_call_incoming', handleIncomingCall);
    socket.on('jitsi_group_call_invite', handleGroupInvite);
    socket.on('jitsi_call_ended', handleCallEnded);
    socket.on('jitsi_participant_joined', handleParticipantJoined);
    socket.on('jitsi_participant_left', handleParticipantLeft);

    return () => {
      socket.off('jitsi_call_incoming', handleIncomingCall);
      socket.off('jitsi_group_call_invite', handleGroupInvite);
      socket.off('jitsi_call_ended', handleCallEnded);
      socket.off('jitsi_participant_joined', handleParticipantJoined);
      socket.off('jitsi_participant_left', handleParticipantLeft);
    };
  }, [clearOutgoingUnanswered, socket, currentRoom, startRingtone, stopOutgoingRingback, stopRingtone, toast]);

  // Actions
  const startCall = useCallback(async (
    targetUserId: string,
    callType: 'voice' | 'video' = 'video',
    orderId?: string
  ) => {
    const data = await startCallMutation.mutateAsync({ targetUserId, callType, orderId });
    if (data?.room?.roomName) {
      await startOutgoingRingback();
      scheduleOutgoingUnanswered(data.room.roomName, targetUserId, callType);
    }
  }, [scheduleOutgoingUnanswered, startCallMutation, startOutgoingRingback]);

  const startGroupCall = useCallback(async (
    participantIds: string[],
    callType: 'voice' | 'video' = 'video'
  ) => {
    const data = await startGroupCallMutation.mutateAsync({ participantIds, callType });
    if (data?.room?.roomName) {
      await startOutgoingRingback();
    }
  }, [startGroupCallMutation, startOutgoingRingback]);

  const joinCall = useCallback(async (roomName: string) => {
    await joinCallMutation.mutateAsync(roomName);
  }, [joinCallMutation]);

  const acceptIncomingCall = useCallback(async () => {
    if (incomingCall) {
      await joinCall(incomingCall.roomName);
    }
  }, [incomingCall, joinCall]);

  const rejectIncomingCall = useCallback(async () => {
    stopRingtone();
    setIncomingCall(null);
    toast({
      title: 'Call rejected',
      description: 'You declined the incoming call',
    });
  }, [incomingCall, stopRingtone, toast]);

  const leaveCall = useCallback(async () => {
    if (outgoingUnansweredRef.current && !outgoingUnansweredRef.current.answered) {
      await recordOutgoingMissedCall(outgoingUnansweredRef.current);
      clearOutgoingUnanswered();
    }
    stopOutgoingRingback();
    await leaveCallMutation.mutateAsync();
  }, [clearOutgoingUnanswered, leaveCallMutation, recordOutgoingMissedCall, stopOutgoingRingback]);

  const endCall = useCallback(async () => {
    if (outgoingUnansweredRef.current && !outgoingUnansweredRef.current.answered) {
      await recordOutgoingMissedCall(outgoingUnansweredRef.current);
      clearOutgoingUnanswered();
    }
    stopOutgoingRingback();
    await endCallMutation.mutateAsync();
  }, [clearOutgoingUnanswered, endCallMutation, recordOutgoingMissedCall, stopOutgoingRingback]);

  const getJitsiUrl = useCallback(() => {
    return jitsiConfig?.roomUrl || currentRoom?.roomUrl || null;
  }, [jitsiConfig, currentRoom]);

  useEffect(() => {
    if (!incomingCall) {
      stopRingtone();
    }
  }, [incomingCall, stopRingtone]);

  useEffect(() => {
    if (!currentRoom && !incomingCall) {
      stopRingtone();
      stopOutgoingRingback();
    }
  }, [currentRoom, incomingCall, stopOutgoingRingback, stopRingtone]);

  useEffect(() => {
    const unlockRingtone = async () => {
      const ctx = getOrCreateAudioContext();
      if (!ctx) return;
      if (ctx.state === "suspended") {
        try {
          await ctx.resume();
        } catch {
          // no-op
        }
      }
    };
    window.addEventListener("pointerdown", unlockRingtone, { once: true });
    window.addEventListener("keydown", unlockRingtone, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockRingtone);
      window.removeEventListener("keydown", unlockRingtone);
    };
  }, [getOrCreateAudioContext]);

  useEffect(() => {
    return () => {
      clearOutgoingUnanswered();
      stopOutgoingRingback();
      stopRingtone();
    };
  }, [clearOutgoingUnanswered, stopOutgoingRingback, stopRingtone]);

  return {
    inCall: !!currentRoom,
    currentRoom,
    incomingCall,
    isStarting: startCallMutation.isPending || startGroupCallMutation.isPending,
    isJoining: joinCallMutation.isPending,
    startCall,
    startGroupCall,
    joinCall,
    acceptIncomingCall,
    rejectIncomingCall,
    leaveCall,
    endCall,
    getJitsiUrl,
    jitsiConfig,
  };
}
