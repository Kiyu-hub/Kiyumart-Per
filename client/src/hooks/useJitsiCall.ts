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
        toast({
          title: `Group ${data.callType} call`,
          description: `${data.hostName} invited you to a group call`,
        });
      }
    };

    // Call ended by host
    const handleCallEnded = (data: { roomName: string; endedBy: string }) => {
      if (currentRoom?.roomName === data.roomName) {
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
  }, [socket, currentRoom, toast]);

  // Actions
  const startCall = useCallback(async (
    targetUserId: string,
    callType: 'voice' | 'video' = 'video',
    orderId?: string
  ) => {
    await startCallMutation.mutateAsync({ targetUserId, callType, orderId });
  }, [startCallMutation]);

  const startGroupCall = useCallback(async (
    participantIds: string[],
    callType: 'voice' | 'video' = 'video'
  ) => {
    await startGroupCallMutation.mutateAsync({ participantIds, callType });
  }, [startGroupCallMutation]);

  const joinCall = useCallback(async (roomName: string) => {
    await joinCallMutation.mutateAsync(roomName);
  }, [joinCallMutation]);

  const acceptIncomingCall = useCallback(async () => {
    if (incomingCall) {
      await joinCall(incomingCall.roomName);
    }
  }, [incomingCall, joinCall]);

  const rejectIncomingCall = useCallback(() => {
    setIncomingCall(null);
    toast({
      title: 'Call rejected',
      description: 'You declined the incoming call',
    });
  }, [toast]);

  const leaveCall = useCallback(async () => {
    await leaveCallMutation.mutateAsync();
  }, [leaveCallMutation]);

  const endCall = useCallback(async () => {
    await endCallMutation.mutateAsync();
  }, [endCallMutation]);

  const getJitsiUrl = useCallback(() => {
    // Prefer config roomUrl which has pre-join skip parameters
    return jitsiConfig?.roomUrl || currentRoom?.roomUrl || null;
  }, [jitsiConfig, currentRoom]);

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
