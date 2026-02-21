/**
 * Presence Service - WhatsApp-style Online/Offline/Last Seen
 * 
 * Implements a heartbeat-based presence system where clients send signals
 * every 5-10 seconds to maintain 'Online' status. Missing a heartbeat
 * transitions the user to 'Offline' and records a 'Last Seen' timestamp.
 * 
 * Zero-cost: Uses in-memory Map (can be upgraded to Redis for multi-instance)
 */

import { Server as SocketIOServer, Socket } from "socket.io";
import { runtimeConfig } from "../config/runtimeConfig";

interface UserPresence {
  userId: string;
  status: 'online' | 'offline' | 'away';
  lastSeen: Date;
  lastHeartbeat: Date;
  socketId: string | null;
  typing?: { to: string; since: Date } | null;
}

// In-memory presence store (can be replaced with Redis for horizontal scaling)
const presenceStore = new Map<string, UserPresence>();

// Configuration
const HEARTBEAT_INTERVAL = runtimeConfig.presence.heartbeatIntervalMs;
const HEARTBEAT_TIMEOUT = runtimeConfig.presence.heartbeatTimeoutMs;
const AWAY_THRESHOLD = runtimeConfig.presence.awayThresholdMs;
const CLEANUP_INTERVAL_MS = runtimeConfig.presence.cleanupIntervalMs;

class PresenceService {
  private io: SocketIOServer | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  /**
   * Initialize the presence service with Socket.IO server
   */
  initialize(io: SocketIOServer) {
    this.io = io;
    this.startCleanupLoop();
    console.log('[PRESENCE] Service initialized with heartbeat interval:', HEARTBEAT_INTERVAL);
  }

  /**
   * Register a user as online when they connect
   */
  userConnected(userId: string, socketId: string) {
    const now = new Date();
    const existing = presenceStore.get(userId);
    
    const presence: UserPresence = {
      userId,
      status: 'online',
      lastSeen: now,
      lastHeartbeat: now,
      socketId,
      typing: existing?.typing || null,
    };
    
    presenceStore.set(userId, presence);
    this.broadcastPresenceChange(userId, 'online', now);
    
    console.log(`[PRESENCE] User ${userId} connected, status: online`);
    return presence;
  }

  /**
   * Handle user disconnect
   */
  userDisconnected(userId: string) {
    const presence = presenceStore.get(userId);
    if (presence) {
      const now = new Date();
      presence.status = 'offline';
      presence.lastSeen = now;
      presence.socketId = null;
      presence.typing = null;
      presenceStore.set(userId, presence);
      
      this.broadcastPresenceChange(userId, 'offline', now);
      console.log(`[PRESENCE] User ${userId} disconnected, last seen: ${now.toISOString()}`);
    }
  }

  /**
   * Process heartbeat from client
   */
  heartbeat(userId: string) {
    const presence = presenceStore.get(userId);
    if (presence) {
      const now = new Date();
      const wasOffline = presence.status === 'offline';
      const wasAway = presence.status === 'away';
      
      presence.lastHeartbeat = now;
      if (wasOffline || wasAway) {
        presence.status = 'online';
        this.broadcastPresenceChange(userId, 'online', now);
      }
      presence.lastSeen = now;
      presenceStore.set(userId, presence);
      
      if (wasOffline || wasAway) {
        console.log(`[PRESENCE] User ${userId} back online from ${wasOffline ? 'offline' : 'away'}`);
      }
    }
    return presence;
  }

  /**
   * Set user typing status
   */
  setTyping(userId: string, toUserId: string | null) {
    const presence = presenceStore.get(userId);
    if (presence) {
      presence.typing = toUserId ? { to: toUserId, since: new Date() } : null;
      presenceStore.set(userId, presence);
      
      // Broadcast typing status to the recipient
      if (toUserId && this.io) {
        this.io.to(toUserId).emit('user_typing', { userId, typing: !!toUserId });
      }
    }
  }

  /**
   * Get user presence
   */
  getPresence(userId: string): UserPresence | null {
    return presenceStore.get(userId) || null;
  }

  /**
   * Get multiple users' presence
   */
  getPresences(userIds: string[]): Map<string, UserPresence> {
    const result = new Map<string, UserPresence>();
    for (const userId of userIds) {
      const presence = presenceStore.get(userId);
      if (presence) {
        result.set(userId, presence);
      }
    }
    return result;
  }

  /**
   * Get all online users
   */
  getOnlineUsers(): string[] {
    return Array.from(presenceStore.entries())
      .filter(([_, p]) => p.status === 'online')
      .map(([userId, _]) => userId);
  }

  /**
   * Get presence for API response
   */
  getPresenceForApi(userId: string): { status: 'online' | 'offline' | 'away'; lastSeen: string | null } {
    const presence = presenceStore.get(userId);
    if (!presence) {
      return { status: 'offline', lastSeen: null };
    }
    return {
      status: presence.status,
      lastSeen: presence.lastSeen.toISOString(),
    };
  }

  /**
   * Get batch presence for multiple users
   */
  getBatchPresence(userIds: string[]): Record<string, { status: 'online' | 'offline' | 'away'; lastSeen: string | null }> {
    const result: Record<string, { status: 'online' | 'offline' | 'away'; lastSeen: string | null }> = {};
    for (const userId of userIds) {
      result[userId] = this.getPresenceForApi(userId);
    }
    return result;
  }

  /**
   * Broadcast presence change to all connected clients
   */
  private broadcastPresenceChange(userId: string, status: 'online' | 'offline' | 'away', lastSeen: Date) {
    if (this.io) {
      this.io.emit('presence_change', {
        userId,
        status,
        lastSeen: lastSeen.toISOString(),
      });
    }
  }

  /**
   * Start the cleanup loop to check for stale connections
   */
  private startCleanupLoop() {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      
      for (const [userId, presence] of Array.from(presenceStore.entries())) {
        if (presence.status === 'offline') continue;
        
        const timeSinceHeartbeat = now - presence.lastHeartbeat.getTime();
        
        if (timeSinceHeartbeat > HEARTBEAT_TIMEOUT) {
          // No heartbeat for too long, mark as offline
          presence.status = 'offline';
          presence.lastSeen = new Date(presence.lastHeartbeat);
          presenceStore.set(userId, presence);
          this.broadcastPresenceChange(userId, 'offline', presence.lastSeen);
          console.log(`[PRESENCE] User ${userId} timed out, marked offline`);
        } else if (timeSinceHeartbeat > AWAY_THRESHOLD && presence.status === 'online') {
          // No activity for a while, mark as away
          presence.status = 'away';
          presenceStore.set(userId, presence);
          this.broadcastPresenceChange(userId, 'away', presence.lastSeen);
          console.log(`[PRESENCE] User ${userId} marked away`);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop the cleanup loop
   */
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('[PRESENCE] Service shutdown');
  }

  /**
   * Get stats for admin dashboard
   */
  getStats() {
    const all = Array.from(presenceStore.values());
    return {
      total: all.length,
      online: all.filter(p => p.status === 'online').length,
      away: all.filter(p => p.status === 'away').length,
      offline: all.filter(p => p.status === 'offline').length,
    };
  }
}

// Singleton instance
export const presenceService = new PresenceService();
export default presenceService;
