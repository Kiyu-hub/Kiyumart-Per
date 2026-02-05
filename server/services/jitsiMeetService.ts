/**
 * Jitsi Meet Integration Service - Free Video/Voice Calls
 * 
 * Uses Jitsi Meet public infrastructure (meet.jit.si) for zero-cost video calls.
 * Can be configured to use a self-hosted Jitsi instance for full control.
 * 
 * Features:
 * - Generates unique room names based on chat/order IDs
 * - JWT authentication for secure room access (optional)
 * - Tracks active calls for admin dashboard
 * - Supports 1-on-1 and group calls
 */

import crypto from "crypto";

interface JitsiRoom {
  roomName: string;
  roomUrl: string;
  createdBy: string;
  participants: string[];
  callType: 'voice' | 'video';
  createdAt: Date;
  endedAt?: Date;
  orderId?: string;
  chatId?: string;
}

// Active rooms store
const activeRooms = new Map<string, JitsiRoom>();

// Configuration
const JITSI_CONFIG = {
  // Public Jitsi Meet instance (free, no setup required)
  domain: process.env.JITSI_DOMAIN || 'meet.jit.si',
  // For self-hosted, use your domain
  // domain: 'jitsi.yourdomain.com',
  
  // App ID for JWT auth (optional, for self-hosted)
  appId: process.env.JITSI_APP_ID || '',
  
  // Secret key for JWT signing (optional, for self-hosted)
  secret: process.env.JITSI_SECRET || '',
  
  // Room name prefix to avoid collisions
  roomPrefix: 'kiyumart',
};

class JitsiMeetService {
  /**
   * Generate a unique room name based on participants and context
   */
  generateRoomName(userId1: string, userId2: string, orderId?: string): string {
    // Create a deterministic room name so both users get the same room
    const participants = [userId1, userId2].sort().join('-');
    const contextHash = crypto
      .createHash('sha256')
      .update(orderId ? `${participants}-${orderId}` : participants)
      .digest('hex')
      .substring(0, 12);
    
    return `${JITSI_CONFIG.roomPrefix}-${contextHash}`;
  }

  /**
   * Generate a group call room name
   */
  generateGroupRoomName(hostId: string, callId?: string): string {
    const uniqueId = callId || crypto.randomUUID().substring(0, 8);
    return `${JITSI_CONFIG.roomPrefix}-group-${uniqueId}`;
  }

  /**
   * Get the full Jitsi room URL
   */
  getRoomUrl(roomName: string): string {
    return `https://${JITSI_CONFIG.domain}/${roomName}`;
  }

  /**
   * Create/start a call between two users
   */
  startCall(params: {
    initiatorId: string;
    targetId: string;
    callType: 'voice' | 'video';
    orderId?: string;
    chatId?: string;
  }): JitsiRoom {
    const roomName = this.generateRoomName(
      params.initiatorId, 
      params.targetId, 
      params.orderId
    );
    
    const existingRoom = activeRooms.get(roomName);
    if (existingRoom && !existingRoom.endedAt) {
      // Room already exists and is active
      if (!existingRoom.participants.includes(params.initiatorId)) {
        existingRoom.participants.push(params.initiatorId);
      }
      return existingRoom;
    }

    const room: JitsiRoom = {
      roomName,
      roomUrl: this.getRoomUrl(roomName),
      createdBy: params.initiatorId,
      participants: [params.initiatorId],
      callType: params.callType,
      createdAt: new Date(),
      orderId: params.orderId,
      chatId: params.chatId,
    };

    activeRooms.set(roomName, room);
    console.log(`[JITSI] Call started: ${roomName} by ${params.initiatorId}`);
    
    return room;
  }

  /**
   * Start a group call
   */
  startGroupCall(params: {
    hostId: string;
    participantIds: string[];
    callType: 'voice' | 'video';
    callId?: string;
  }): JitsiRoom {
    const roomName = this.generateGroupRoomName(params.hostId, params.callId);
    
    const room: JitsiRoom = {
      roomName,
      roomUrl: this.getRoomUrl(roomName),
      createdBy: params.hostId,
      participants: [params.hostId, ...params.participantIds],
      callType: params.callType,
      createdAt: new Date(),
    };

    activeRooms.set(roomName, room);
    console.log(`[JITSI] Group call started: ${roomName} with ${room.participants.length} participants`);
    
    return room;
  }

  /**
   * Join an existing call
   */
  joinCall(roomName: string, userId: string): JitsiRoom | null {
    const room = activeRooms.get(roomName);
    if (!room || room.endedAt) {
      console.log(`[JITSI] Room ${roomName} not found or ended`);
      return null;
    }

    if (!room.participants.includes(userId)) {
      room.participants.push(userId);
    }

    console.log(`[JITSI] User ${userId} joined room ${roomName}`);
    return room;
  }

  /**
   * Leave a call
   */
  leaveCall(roomName: string, userId: string): boolean {
    const room = activeRooms.get(roomName);
    if (!room) return false;

    room.participants = room.participants.filter(p => p !== userId);
    
    // If no participants left, end the call
    if (room.participants.length === 0) {
      room.endedAt = new Date();
      console.log(`[JITSI] Room ${roomName} ended - no participants left`);
    }
    
    console.log(`[JITSI] User ${userId} left room ${roomName}`);
    return true;
  }

  /**
   * End a call
   */
  endCall(roomName: string): boolean {
    const room = activeRooms.get(roomName);
    if (!room) return false;

    room.endedAt = new Date();
    console.log(`[JITSI] Room ${roomName} ended`);
    return true;
  }

  /**
   * Get room info
   */
  getRoom(roomName: string): JitsiRoom | null {
    return activeRooms.get(roomName) || null;
  }

  /**
   * Get all active rooms (for admin dashboard)
   */
  getActiveRooms(): JitsiRoom[] {
    return Array.from(activeRooms.values())
      .filter(room => !room.endedAt);
  }

  /**
   * Get user's active call
   */
  getUserActiveCall(userId: string): JitsiRoom | null {
    for (const room of Array.from(activeRooms.values())) {
      if (!room.endedAt && room.participants.includes(userId)) {
        return room;
      }
    }
    return null;
  }

  /**
   * Get Jitsi configuration for frontend
   */
  getJitsiConfig(roomName: string, userDisplayName: string, userEmail?: string) {
    return {
      domain: JITSI_CONFIG.domain,
      roomName,
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
        enableWelcomePage: false,
        enableClosePage: false,
        // Disable some features for simpler UI
        toolbarButtons: [
          'microphone',
          'camera',
          'closedcaptions',
          'desktop',
          'fullscreen',
          'hangup',
          'chat',
          'settings',
          'raisehand',
          'videoquality',
          'filmstrip',
          'tileview',
          'mute-everyone',
        ],
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        SHOW_BRAND_WATERMARK: false,
        BRAND_WATERMARK_LINK: '',
        MOBILE_APP_PROMO: false,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'desktop', 'fullscreen',
          'hangup', 'chat', 'settings', 'raisehand',
        ],
      },
      userInfo: {
        displayName: userDisplayName,
        email: userEmail || '',
      },
    };
  }

  /**
   * Generate JWT token for self-hosted Jitsi (optional)
   * Only needed if using self-hosted Jitsi with JWT auth
   */
  generateJWT(roomName: string, userId: string, userDisplayName: string): string | null {
    if (!JITSI_CONFIG.secret || !JITSI_CONFIG.appId) {
      // JWT not configured, using public Jitsi
      return null;
    }

    // JWT generation for self-hosted Jitsi
    // Implement if needed for self-hosted deployment
    return null;
  }

  /**
   * Get call statistics for admin
   */
  getStats() {
    const all = Array.from(activeRooms.values());
    const active = all.filter(r => !r.endedAt);
    
    return {
      totalCalls: all.length,
      activeCalls: active.length,
      totalParticipants: active.reduce((sum, r) => sum + r.participants.length, 0),
      voiceCalls: active.filter(r => r.callType === 'voice').length,
      videoCalls: active.filter(r => r.callType === 'video').length,
    };
  }

  /**
   * Cleanup old ended calls
   */
  cleanup() {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24 hours
    for (const [roomName, room] of Array.from(activeRooms.entries())) {
      if (room.endedAt && room.endedAt.getTime() < cutoff) {
        activeRooms.delete(roomName);
      }
    }
  }
}

// Singleton instance
export const jitsiMeetService = new JitsiMeetService();
export default jitsiMeetService;
