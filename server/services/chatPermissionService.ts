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
  role: 'buyer' | 'seller' | 'rider' | 'agent' | 'admin' | 'super_admin' | 'customer';
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

// Active order statuses that allow chat, normalized to canonical delivery lifecycle.
const ACTIVE_ORDER_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "ready",
  "searching_rider",
  "assigned",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "en_route",
  "delivered",
];

function normalizeOrderStatus(status?: string | null): string {
  const value = String(status || "").toLowerCase().trim();
  if (value === "created") return "pending";
  if (value === "assigned_to_rider") return "assigned";
  if (value === "out_for_delivery" || value === "delivering") return "en_route";
  return value;
}

function isChatActiveOrderStatus(status?: string | null): boolean {
  return ACTIVE_ORDER_STATUSES.includes(normalizeOrderStatus(status));
}

function normalizeRole(role: User["role"]): "buyer" | "seller" | "rider" | "agent" | "admin" | "super_admin" {
  if (role === "customer") return "buyer";
  return role;
}

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

    const initiatorRole = normalizeRole(initiator.role);
    const targetRole = normalizeRole(target.role);

    // Admins and Super Admins can chat with anyone
    if (initiatorRole === 'admin' || initiatorRole === 'super_admin') {
      return { allowed: true, reason: 'Admin has full chat access' };
    }

    // Agents can chat with anyone (they are support)
    if (initiatorRole === 'agent') {
      return { allowed: true, reason: 'Agent can provide support to any user' };
    }

    // Everyone can message Agents for support
    if (targetRole === 'agent') {
      return { allowed: true, reason: 'Users can contact support agents' };
    }

    // Everyone can message Admins/Super_Admins
    if (targetRole === 'admin' || targetRole === 'super_admin') {
      return { allowed: true, reason: 'Users can contact administrators' };
    }

    // Role-specific rules
    switch (initiatorRole) {
      case 'buyer':
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
    const targetRole = normalizeRole(target.role);

    if (targetRole === 'seller') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(customerId, target.id);
      
      if (activeOrder && isChatActiveOrderStatus(activeOrder.status)) {
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
    if (targetRole === 'rider') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(customerId, target.id);
      
      if (activeOrder && isChatActiveOrderStatus(activeOrder.status)) {
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
    if (targetRole === 'buyer') {
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
    const targetRole = normalizeRole(target.role);

    if (targetRole === 'buyer') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(sellerId, target.id);
      
      if (activeOrder && isChatActiveOrderStatus(activeOrder.status)) {
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
    if (targetRole === 'rider') {
      const orders = await this.storage.getOrdersBySeller(sellerId);
      const activeOrderWithRider = orders.find(
        o => o.riderId === target.id && isChatActiveOrderStatus(o.status)
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
    if (targetRole === 'seller') {
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

    const targetRole = normalizeRole(target.role);

    // Rider can chat with Buyers whose orders they're delivering
    if (targetRole === 'buyer') {
      const activeOrder = await this.storage.getActiveOrderBetweenUsers(riderId, target.id);
      
      if (activeOrder && isChatActiveOrderStatus(activeOrder.status)) {
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
    if (targetRole === 'seller') {
      const orders = await this.storage.getOrdersByRider(riderId);
      const activeOrderWithSeller = orders.find(
        o => o.sellerId === target.id && isChatActiveOrderStatus(o.status)
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
    if (targetRole === 'rider') {
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
    if (privilegedRoles.includes(normalizeRole(user1.role)) || privilegedRoles.includes(normalizeRole(user2.role))) {
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

    if (!isChatActiveOrderStatus(activeOrder.status)) {
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
