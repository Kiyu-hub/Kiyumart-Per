/**
 * Message Delivery Service - WhatsApp-style Delivery Lifecycle
 * 
 * Tracks message states through four stages:
 * - Sent: Message left server
 * - Delivered: Message reached recipient's device
 * - Read: Message opened by recipient
 * - Failed: Delivery error encountered
 * 
 * Implements retry with exponential backoff for failed deliveries.
 */

import { Server as SocketIOServer } from "socket.io";
import presenceService from "./presenceService";

interface PendingMessage {
  id: string;
  senderId: string;
  receiverId: string;
  message: string;
  messageType: 'text' | 'media' | 'file' | 'location';
  mediaUrl?: string;
  retryCount: number;
  maxRetries: number;
  lastAttempt: Date;
  nextRetry: Date | null;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  createdAt: Date;
}

// Queue of messages pending delivery
const pendingMessages = new Map<string, PendingMessage>();

// Retry configuration
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 300000; // 5 minutes

class MessageDeliveryService {
  private io: SocketIOServer | null = null;
  private retryInterval: NodeJS.Timeout | null = null;
  private deliveryCallbacks: Map<string, (status: string, error?: string) => void> = new Map();

  /**
   * Initialize the message delivery service
   */
  initialize(io: SocketIOServer) {
    this.io = io;
    this.startRetryLoop();
    console.log('[MESSAGE-DELIVERY] Service initialized');
  }

  /**
   * Queue a message for delivery with retry support
   */
  async queueMessage(message: {
    id: string;
    senderId: string;
    receiverId: string;
    message: string;
    messageType?: 'text' | 'media' | 'file' | 'location';
    mediaUrl?: string;
  }): Promise<{ status: 'sent' | 'queued'; delivered: boolean }> {
    const receiverPresence = presenceService.getPresence(message.receiverId);
    const isOnline = receiverPresence?.status === 'online';

    const pendingMessage: PendingMessage = {
      id: message.id,
      senderId: message.senderId,
      receiverId: message.receiverId,
      message: message.message,
      messageType: message.messageType || 'text',
      mediaUrl: message.mediaUrl,
      retryCount: 0,
      maxRetries: MAX_RETRIES,
      lastAttempt: new Date(),
      nextRetry: null,
      status: 'pending',
      createdAt: new Date(),
    };

    if (isOnline && this.io) {
      // Attempt immediate delivery
      const delivered = await this.attemptDelivery(pendingMessage);
      if (delivered) {
        return { status: 'sent', delivered: true };
      }
    }

    // Queue for retry if not delivered immediately
    if (pendingMessage.status !== 'delivered') {
      pendingMessage.nextRetry = this.calculateNextRetry(0);
      pendingMessages.set(message.id, pendingMessage);
      console.log(`[MESSAGE-DELIVERY] Message ${message.id} queued for retry`);
      return { status: 'queued', delivered: false };
    }

    return { status: 'sent', delivered: true };
  }

  /**
   * Attempt to deliver a message to the recipient
   */
  private async attemptDelivery(message: PendingMessage): Promise<boolean> {
    if (!this.io) return false;

    const receiverPresence = presenceService.getPresence(message.receiverId);
    
    if (!receiverPresence || receiverPresence.status !== 'online') {
      console.log(`[MESSAGE-DELIVERY] User ${message.receiverId} not online, queuing`);
      return false;
    }

    try {
      // Emit to receiver's socket room
      this.io.to(message.receiverId).emit('new_message', {
        id: message.id,
        senderId: message.senderId,
        receiverId: message.receiverId,
        message: message.message,
        messageType: message.messageType,
        mediaUrl: message.mediaUrl,
        status: 'sent',
        createdAt: message.createdAt.toISOString(),
      });

      // Also emit to sender to confirm send
      this.io.to(message.senderId).emit('message_sent', {
        messageId: message.id,
        status: 'sent',
        timestamp: new Date().toISOString(),
      });

      message.status = 'sent';
      message.lastAttempt = new Date();
      
      console.log(`[MESSAGE-DELIVERY] Message ${message.id} sent to ${message.receiverId}`);
      return true;
    } catch (error) {
      console.error(`[MESSAGE-DELIVERY] Failed to send message ${message.id}:`, error);
      return false;
    }
  }

  /**
   * Mark message as delivered (called when recipient acknowledges)
   */
  markDelivered(messageId: string, receiverId: string) {
    const now = new Date();
    
    // Remove from pending queue
    pendingMessages.delete(messageId);

    // Notify sender
    if (this.io) {
      // Get sender ID from storage or cache
      this.io.emit('message_delivered', {
        messageId,
        deliveredAt: now.toISOString(),
      });
    }

    console.log(`[MESSAGE-DELIVERY] Message ${messageId} delivered`);
    return { messageId, deliveredAt: now };
  }

  /**
   * Mark messages as read
   */
  markRead(messageIds: string[], readerId: string) {
    const now = new Date();

    for (const messageId of messageIds) {
      pendingMessages.delete(messageId);
    }

    // Notify sender(s)
    if (this.io) {
      this.io.emit('message_read', {
        messageIds,
        readAt: now.toISOString(),
        readerId,
      });
    }

    console.log(`[MESSAGE-DELIVERY] ${messageIds.length} messages marked as read`);
    return { messageIds, readAt: now };
  }

  /**
   * Calculate next retry time with exponential backoff
   */
  private calculateNextRetry(retryCount: number): Date {
    const delay = Math.min(BASE_RETRY_DELAY * Math.pow(2, retryCount), MAX_RETRY_DELAY);
    const jitter = Math.random() * 1000; // Add some jitter to prevent thundering herd
    return new Date(Date.now() + delay + jitter);
  }

  /**
   * Start the retry loop for pending messages
   */
  private startRetryLoop() {
    this.retryInterval = setInterval(async () => {
      const now = Date.now();

      for (const [messageId, message] of Array.from(pendingMessages.entries())) {
        // Skip if not ready for retry
        if (message.nextRetry && message.nextRetry.getTime() > now) {
          continue;
        }

        // Check if max retries exceeded
        if (message.retryCount >= message.maxRetries) {
          message.status = 'failed';
          pendingMessages.delete(messageId);
          
          // Notify sender of failure
          if (this.io) {
            this.io.to(message.senderId).emit('message_failed', {
              messageId,
              error: 'Max retries exceeded - recipient unavailable',
              failedAt: new Date().toISOString(),
            });
          }
          
          console.log(`[MESSAGE-DELIVERY] Message ${messageId} failed after ${message.retryCount} retries`);
          continue;
        }

        // Attempt delivery
        const delivered = await this.attemptDelivery(message);
        
        if (delivered) {
          pendingMessages.delete(messageId);
        } else {
          message.retryCount++;
          message.nextRetry = this.calculateNextRetry(message.retryCount);
          pendingMessages.set(messageId, message);
          console.log(`[MESSAGE-DELIVERY] Message ${messageId} retry ${message.retryCount}/${MAX_RETRIES}, next: ${message.nextRetry.toISOString()}`);
        }
      }
    }, 2000); // Check every 2 seconds
  }

  /**
   * Get pending messages for a user (for reconnection sync)
   */
  getPendingMessagesForUser(userId: string): PendingMessage[] {
    return Array.from(pendingMessages.values())
      .filter(m => m.receiverId === userId && m.status === 'pending');
  }

  /**
   * Deliver queued messages when user comes online
   */
  async onUserOnline(userId: string) {
    const pending = this.getPendingMessagesForUser(userId);
    
    for (const message of pending) {
      const delivered = await this.attemptDelivery(message);
      if (delivered) {
        pendingMessages.delete(message.id);
      }
    }

    if (pending.length > 0) {
      console.log(`[MESSAGE-DELIVERY] Delivered ${pending.length} queued messages to ${userId}`);
    }
  }

  /**
   * Get queue stats for monitoring
   */
  getStats() {
    const all = Array.from(pendingMessages.values());
    return {
      queueSize: all.length,
      pending: all.filter(m => m.status === 'pending').length,
      retrying: all.filter(m => m.retryCount > 0).length,
      failed: all.filter(m => m.status === 'failed').length,
    };
  }

  /**
   * Shutdown the service
   */
  shutdown() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    console.log('[MESSAGE-DELIVERY] Service shutdown');
  }
}

// Singleton instance
export const messageDeliveryService = new MessageDeliveryService();
export default messageDeliveryService;
