/**
 * Chat Permission Service - Role-Based Access Control (RBAC)
 * 
 * Implements permission rules for chat access:
 * 
 * - Riders: Can only chat with Buyers if there's an active order linking them.
 *           Chat access terminates when order is marked 'Completed' or 'Cancelled'.
 * 
 * - Sellers: Can only initiate chats with Agent (Support) role.
 *            Can respond to Buyers who have ordered from them.
 * 
 * - Buyers: Can only initiate chats with Agent (Support) for support.
 *           Can chat with Sellers they have orders with.
 *           Can chat with Riders delivering their orders.
 * 
 * - Agents: Can chat with any user for support purposes.
 * 
 * - Admins/Super_Admins: Full access to all chats. Can join any conversation.
 * 
 * This ensures marketplace communication is order-based and support-focused.
 */

interface User {
  id: string;
  role: 'customer' | 'seller' | 'rider' | 'agent' | 'admin' | 'super_admin';
}

interface Order {
  id: string;
  buyerId: string;
  sellerId: string;
  riderId?: string | null;
  status: string;
}

// Interface for storage adapter
interface StorageAdapter {
  getUser(userId: string): Promise<User | null>;
  getOrdersByBuyer(buyerId: string): Promise<Order[]>;
  getOrdersBySeller(sellerId: string): Promise<Order[]>;
  getOrdersByRider(riderId: string): Promise<Order[]>;
  getActiveOrderBetweenUsers(userId1: string, userId2: string): Promise<Order | null>;
}

// Active order statuses that allow chat
const ACTIVE_ORDER_STATUSES = [
  'pending',
  'confirmed', 
  'processing',
  'ready_for_pickup',
  'assigned_to_rider',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'arriving_soon',
];

class ChatPermissionService {
  private storage: StorageAdapter | null = null;

  /**
   * Initialize with storage adapter
   */
  initialize(storage: StorageAdapter) {
    this.storage = storage;
    console.log('[CHAT-RBAC] Permission service initialized');
  }

  /**
   * Check if a user can initiate a chat with another user
   */
  async canInitiateChat(initiatorId: string, targetId: string): Promise<{
    allowed: boolean;
    reason: string;
    orderId?: string;
  }> {
    if (!this.storage) {
      return { allowed: false, reason: 'Service not initialized' };
    }

    const initiator = await this.storage.getUser(initiatorId);
    const target = await this.storage.getUser(targetId);

    if (!initiator || !target) {
      return { allowed: false, reason: 'User not found' };
    }

    // Admins and Super Admins can chat with anyone
    if (initiator.role === 'admin' || initiator.role === 'super_admin') {
      return { allowed: true, reason: 'Admin has full chat access' };
    }

    // Agents can chat with anyone (they are support)
    if (initiator.role === 'agent') {
      return { allowed: true, reason: 'Agent can provide support to any user' };
    }

    // Everyone can message Agents for support
    if (target.role === 'agent') {
      return { allowed: true, reason: 'Users can contact support agents' };
    }

    // Everyone can message Admins/Super_Admins
    if (target.role === 'admin' || target.role === 'super_admin') {
      return { allowed: true, reason: 'Users can contact administrators' };
    }

    // Role-specific rules
    switch (initiator.role) {
      case 'customer':
        return this.checkCustomerPermission(initiator.id, target);
      
      case 'seller':
        return this.checkSellerPermission(initiator.id, target);
      
      case 'rider':
        return this.checkRiderPermission(initiator.id, target);
      
      default:
        return { allowed: false, reason: `Unknown role: ${initiator.role}` };
    }
  }

  /**
   * Check if a customer can chat with target
   */
  private async checkCustomerPermission(customerId: string, target: User): Promise<{
    allowed: boolean;
    reason: string;
    orderId?: string;
  }> {
    if (!this.storage) {
      return { allowed: false, reason: 'Service not initialized' };
    }

    // Customer can chat with Sellers they have orders with
    if (target.role === 'seller') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(customerId, target.id);
      
      if (activeOrder && ACTIVE_ORDER_STATUSES.includes(activeOrder.status)) {
        return { 
          allowed: true, 
          reason: 'You have an active order with this seller',
          orderId: activeOrder.id 
        };
      }
      
      return { 
        allowed: false, 
        reason: 'You can only message sellers you have active orders with. Contact support for other inquiries.' 
      };
    }

    // Customer can chat with Riders delivering their orders
    if (target.role === 'rider') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(customerId, target.id);
      
      if (activeOrder && ACTIVE_ORDER_STATUSES.includes(activeOrder.status)) {
        return { 
          allowed: true, 
          reason: 'Rider is handling your order delivery',
          orderId: activeOrder.id 
        };
      }
      
      return { 
        allowed: false, 
        reason: 'You can only message riders assigned to your active deliveries' 
      };
    }

    // Customers cannot directly message other customers
    if (target.role === 'customer') {
      return { 
        allowed: false, 
        reason: 'Direct messaging between customers is not available. Please contact support.' 
      };
    }

    return { allowed: false, reason: 'Chat not permitted' };
  }

  /**
   * Check if a seller can chat with target
   */
  private async checkSellerPermission(sellerId: string, target: User): Promise<{
    allowed: boolean;
    reason: string;
    orderId?: string;
  }> {
    if (!this.storage) {
      return { allowed: false, reason: 'Service not initialized' };
    }

    // Seller can chat with Customers who have orders with them
    if (target.role === 'customer') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(sellerId, target.id);
      
      if (activeOrder && ACTIVE_ORDER_STATUSES.includes(activeOrder.status)) {
        return { 
          allowed: true, 
          reason: 'Customer has an active order with your store',
          orderId: activeOrder.id 
        };
      }
      
      return { 
        allowed: false, 
        reason: 'You can only message customers with active orders from your store' 
      };
    }

    // Seller can chat with Riders handling their deliveries
    if (target.role === 'rider') {
      const orders = await this.storage.getOrdersBySeller(sellerId);
      const activeOrderWithRider = orders.find(
        o => o.riderId === target.id && ACTIVE_ORDER_STATUSES.includes(o.status)
      );
      
      if (activeOrderWithRider) {
        return { 
          allowed: true, 
          reason: 'Rider is handling your store delivery',
          orderId: activeOrderWithRider.id 
        };
      }
      
      return { 
        allowed: false, 
        reason: 'You can only message riders assigned to your active deliveries' 
      };
    }

    // Sellers cannot directly message other sellers
    if (target.role === 'seller') {
      return { 
        allowed: false, 
        reason: 'Direct messaging between sellers is not available. Please contact support.' 
      };
    }

    return { allowed: false, reason: 'Chat not permitted' };
  }

  /**
   * Check if a rider can chat with target
   */
  private async checkRiderPermission(riderId: string, target: User): Promise<{
    allowed: boolean;
    reason: string;
    orderId?: string;
  }> {
    if (!this.storage) {
      return { allowed: false, reason: 'Service not initialized' };
    }

    // Rider can chat with Customers whose orders they're delivering
    if (target.role === 'customer') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(riderId, target.id);
      
      if (activeOrder && ACTIVE_ORDER_STATUSES.includes(activeOrder.status)) {
        return { 
          allowed: true, 
          reason: 'You are delivering an order to this customer',
          orderId: activeOrder.id 
        };
      }
      
      return { 
        allowed: false, 
        reason: 'You can only message customers with active deliveries assigned to you' 
      };
    }

    // Rider can chat with Sellers whose orders they're picking up
    if (target.role === 'seller') {
      const orders = await this.storage.getOrdersByRider(riderId);
      const activeOrderWithSeller = orders.find(
        o => o.sellerId === target.id && ACTIVE_ORDER_STATUSES.includes(o.status)
      );
      
      if (activeOrderWithSeller) {
        return { 
          allowed: true, 
          reason: 'You are handling a delivery from this seller',
          orderId: activeOrderWithSeller.id 
        };
      }
      
      return { 
        allowed: false, 
        reason: 'You can only message sellers for active pickups assigned to you' 
      };
    }

    // Riders cannot directly message other riders
    if (target.role === 'rider') {
      return { 
        allowed: false, 
        reason: 'Direct messaging between riders is not available. Please contact support.' 
      };
    }

    return { allowed: false, reason: 'Chat not permitted' };
  }

  /**
   * Get all users a given user can chat with (for contact list)
   */
  async getAvailableChatContacts(userId: string): Promise<{
    agents: { id: string; name: string; role: string }[];
    orderRelated: { id: string; name: string; role: string; orderId: string }[];
  }> {
    if (!this.storage) {
      return { agents: [], orderRelated: [] };
    }

    const user = await this.storage.getUser(userId);
    if (!user) {
      return { agents: [], orderRelated: [] };
    }

    // This would be implemented to fetch actual contacts
    // For now, return structure
    return {
      agents: [], // Would be populated with agent users
      orderRelated: [], // Would be populated based on active orders
    };
  }

  /**
   * Check if a chat should be terminated (order completed)
   */
  async shouldTerminateChat(userId1: string, userId2: string): Promise<{
    terminate: boolean;
    reason?: string;
  }> {
    if (!this.storage) {
      return { terminate: false };
    }

    const user1 = await this.storage.getUser(userId1);
    const user2 = await this.storage.getUser(userId2);

    if (!user1 || !user2) {
      return { terminate: false };
    }

    // Admins, Super Admins, and Agents never have chats terminated
    const privilegedRoles = ['admin', 'super_admin', 'agent'];
    if (privilegedRoles.includes(user1.role) || privilegedRoles.includes(user2.role)) {
      return { terminate: false };
    }

    // Check if there's still an active order between users
    const activeOrder = await this.storage.getActiveOrderBetweenUsers(userId1, userId2);
    
    if (!activeOrder) {
      return { 
        terminate: true, 
        reason: 'No active order between users - chat access revoked' 
      };
    }

    if (!ACTIVE_ORDER_STATUSES.includes(activeOrder.status)) {
      return { 
        terminate: true, 
        reason: `Order ${activeOrder.id} is ${activeOrder.status} - chat access revoked` 
      };
    }

    return { terminate: false };
  }
}

// Singleton instance
export const chatPermissionService = new ChatPermissionService();
export default chatPermissionService;
