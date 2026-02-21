/**
 * usePresence Hook - WhatsApp-style Presence Management
 * 
 * Provides real-time online/offline/last seen status for users.
 * Sends heartbeat signals to maintain online status.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useSocket } from '@/contexts/NotificationContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface UserPresence {
  status: 'online' | 'offline' | 'away';
  lastSeen: string | null;
}

interface PresenceChangeEvent {
  userId: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: string;
}

const HEARTBEAT_INTERVAL = Number((import.meta.env as any).VITE_PRESENCE_HEARTBEAT_INTERVAL_MS || 8000);

export function usePresence(userId?: string) {
  const socket = useSocket();
  const queryClient = useQueryClient();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch single user presence
  const { data: presence, isLoading } = useQuery<UserPresence>({
    queryKey: ['presence', userId],
    queryFn: async () => {
      if (!userId) return { status: 'offline', lastSeen: null };
      const res = await fetch(`/api/presence/${userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch presence');
      return res.json();
    },
    enabled: !!userId,
    staleTime: 10000, // 10 seconds
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Listen for real-time presence changes
  useEffect(() => {
    if (!socket || !userId) return;

    const handlePresenceChange = (event: PresenceChangeEvent) => {
      if (event.userId === userId) {
        queryClient.setQueryData(['presence', userId], {
          status: event.status,
          lastSeen: event.lastSeen,
        });
      }
    };

    socket.on('presence_change', handlePresenceChange);
    socket.on('user_online', (onlineUserId: string) => {
      if (onlineUserId === userId) {
        queryClient.setQueryData(['presence', userId], {
          status: 'online',
          lastSeen: new Date().toISOString(),
        });
      }
    });
    socket.on('user_offline', (offlineUserId: string) => {
      if (offlineUserId === userId) {
        queryClient.setQueryData(['presence', userId], {
          status: 'offline',
          lastSeen: new Date().toISOString(),
        });
      }
    });

    return () => {
      socket.off('presence_change', handlePresenceChange);
      socket.off('user_online');
      socket.off('user_offline');
    };
  }, [socket, userId, queryClient]);

  return {
    presence,
    isLoading,
    isOnline: presence?.status === 'online',
    isAway: presence?.status === 'away',
    isOffline: presence?.status === 'offline' || !presence,
  };
}

/**
 * useBatchPresence - Get presence for multiple users at once
 */
export function useBatchPresence(userIds: string[]) {
  const socket = useSocket();
  const queryClient = useQueryClient();

  const { data: presences, isLoading } = useQuery<Record<string, UserPresence>>({
    queryKey: ['presence', 'batch', userIds.sort().join(',')],
    queryFn: async () => {
      if (userIds.length === 0) return {};
      const res = await apiRequest('POST', '/api/presence/batch', { userIds });
      return res.json();
    },
    enabled: userIds.length > 0,
    staleTime: 10000,
    refetchInterval: 30000,
  });

  // Listen for real-time presence changes
  useEffect(() => {
    if (!socket) return;

    const handlePresenceChange = (event: PresenceChangeEvent) => {
      if (userIds.includes(event.userId)) {
        queryClient.setQueryData(
          ['presence', 'batch', userIds.sort().join(',')],
          (old: Record<string, UserPresence> | undefined) => ({
            ...old,
            [event.userId]: {
              status: event.status,
              lastSeen: event.lastSeen,
            },
          })
        );
      }
    };

    socket.on('presence_change', handlePresenceChange);

    return () => {
      socket.off('presence_change', handlePresenceChange);
    };
  }, [socket, userIds, queryClient]);

  return {
    presences: presences || {},
    isLoading,
    getPresence: (userId: string) => presences?.[userId] || { status: 'offline', lastSeen: null },
  };
}

/**
 * useHeartbeat - Send periodic heartbeat to maintain online status
 */
export function useHeartbeat() {
  const socket = useSocket();
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!socket) return;

    // Send heartbeat immediately on mount
    socket.emit('heartbeat');

    // Set up periodic heartbeat
    heartbeatRef.current = setInterval(() => {
      socket.emit('heartbeat');
    }, HEARTBEAT_INTERVAL);

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [socket]);
}

/**
 * Format last seen timestamp for display
 */
export function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return 'Never';

  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}
