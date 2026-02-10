import { db } from "../db/index";
import { 
  users, products, orders, orderItems, orderStatusHistory, deliveryZones, deliveryTracking,
  chatMessages, transactions, platformSettings, cart, wishlist, reviews, riderReviews,
  productVariants, heroBanners, promotionalAds, coupons, bannerCollections, marketplaceBanners,
  stores, categoryFields, categories, notifications, mediaLibrary, footerPages,
  idempotencyKeys,
  commissions, platformEarnings, sellerPayouts, riderPayouts, roleFeatures,
  type User, type InsertUser, type Product, type InsertProduct,
  type Order, type InsertOrder, type DeliveryZone, type InsertDeliveryZone,
  type ChatMessage, type InsertChatMessage, type Transaction, type PlatformSettings,
  type Cart, type Wishlist, type DeliveryTracking, type InsertDeliveryTracking,
  type Review, type InsertReview, type RiderReview, type InsertRiderReview, type ProductVariant, type InsertProductVariant, type HeroBanner, type InsertHeroBanner,
  type Coupon, type InsertCoupon, type BannerCollection, type InsertBannerCollection,
  type MarketplaceBanner, type InsertMarketplaceBanner, type Store, type CategoryField,
  type Category, type Notification, type InsertNotification, type MediaLibrary,
  type InsertMediaLibrary, type FooterPage, type InsertFooterPage,
  type Commission, type InsertCommission, type PlatformEarning, type InsertPlatformEarning,
  type SellerPayout, type InsertSellerPayout,
  type RiderPayout, type InsertRiderPayout,
  type OrderStatusHistory, type InsertOrderStatusHistory
} from "@shared/schema";
import { eq, and, desc, sql, lte, gte, or, isNull, isNotNull } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getUsersByRole(role: string): Promise<User[]>;
  
  // Product operations
  createProduct(product: InsertProduct & { sellerId: string }): Promise<Product>;
  getProduct(id: string): Promise<Product | undefined>;
  getProducts(filters?: { sellerId?: string; category?: string; isActive?: boolean }): Promise<Product[]>;
  updateProduct(id: string, data: Partial<Product>): Promise<Product | undefined>;
  deleteProduct(id: string): Promise<boolean>;
  
  // Order operations
  createOrder(order: InsertOrder, items: Array<{ productId: string; quantity: number; price: string; total: string }>): Promise<Order>;
  getOrder(id: string): Promise<Order | undefined>;
  getAllOrders(): Promise<Order[]>;
  getOrdersByUser(userId: string, role: "buyer" | "seller" | "rider"): Promise<Order[]>;
  getOrderItems(orderId: string): Promise<Array<{ productId: string; productName: string; quantity: number; price: string }>>;
  updateOrderStatus(id: string, status: string): Promise<Order | undefined>;
  applyOrderStatusTransition(orderId: string, toStatus: string, changedBy: string, changedByRole: string, reason?: string, sideEffects?: Partial<Order>): Promise<Order | undefined>;
  createOrderStatusHistory(data: InsertOrderStatusHistory): Promise<OrderStatusHistory>;
  getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]>;
  updateOrder(orderId: string, data: Partial<Order>): Promise<Order | undefined>;
  assignRider(orderId: string, riderId: string): Promise<Order | undefined>;
  getAvailableRidersWithOrderCounts(): Promise<Array<{ rider: User; activeOrderCount: number }>>;
  
  // Delivery Zone operations
  createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone>;
  getDeliveryZones(): Promise<DeliveryZone[]>;
  updateDeliveryZone(id: string, data: Partial<DeliveryZone>): Promise<DeliveryZone | undefined>;
  deleteDeliveryZone(id: string): Promise<boolean>;
  
  // Chat operations
  createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage>;
  getMessages(userId1: string, userId2: string): Promise<ChatMessage[]>;
  markMessageDelivered(messageId: string): Promise<void>;
  markMessagesAsRead(senderId: string, receiverId: string): Promise<void>;
  getUnreadMessageCount(userId: string): Promise<number>;
  
  // Transaction operations
  createTransaction(data: any): Promise<Transaction>;
  getTransactionByReference(reference: string): Promise<Transaction | undefined>;
  // Idempotency key operations (simple DB-backed keys for init/webhook dedupe)
  createIdempotencyKey(key: string, payload?: any): Promise<{ key: string }>;
  getIdempotencyKey(key: string): Promise<any | undefined>;
  getIdempotencyByReference(reference: string): Promise<any | undefined>;
  markIdempotencyUsed(key: string, reference?: string): Promise<void>;
  incrementIdempotencyRetry(key: string): Promise<number>;
  
  // Commission operations
  createCommission(data: InsertCommission): Promise<Commission>;
  createPlatformEarning(data: InsertPlatformEarning): Promise<PlatformEarning>;
  createCommissionWithEarning(orderId: string): Promise<{commission: Commission, earning: PlatformEarning}>;
  getSellerAvailableBalance(sellerId: string): Promise<number>;
  getSellerCommissions(sellerId: string, status?: string): Promise<Commission[]>;
  
  // Seller Payout operations
  createSellerPayout(data: InsertSellerPayout): Promise<SellerPayout>;
  getSellerPayouts(sellerId: string): Promise<SellerPayout[]>;
  getAllPendingPayouts(): Promise<SellerPayout[]>;
  updatePayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<SellerPayout | undefined>;
  
  // Rider Payout operations
  createRiderPayout(data: InsertRiderPayout): Promise<RiderPayout>;
  getRiderPayouts(riderId: string): Promise<RiderPayout[]>;
  getAllPendingRiderPayouts(): Promise<RiderPayout[]>;
  updateRiderPayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<RiderPayout | undefined>;
  getRiderAvailableBalance(riderId: string): Promise<number>;
  queueRiderPayout(riderId: string, amount: number, orderId: string): Promise<RiderPayout>;
  
  // Platform settings
  getPlatformSettings(): Promise<PlatformSettings>;
  updatePlatformSettings(data: Partial<PlatformSettings>): Promise<PlatformSettings>;
  
  // Cart operations
  addToCart(userId: string, productId: string, quantity: number, variantId?: string, selectedColor?: string, selectedSize?: string, selectedImageIndex?: number): Promise<Cart>;
  getCart(userId: string): Promise<Array<{ id: string; productId: string; productName: string; productImage: string; quantity: number; price: string; variantId: string | null; selectedColor: string | null; selectedSize: string | null; selectedImageIndex: number | null }>>;
  updateCartItem(id: string, quantity: number): Promise<Cart | undefined>;
  removeFromCart(id: string): Promise<boolean>;
  clearCart(userId: string): Promise<void>;
  
  // Wishlist operations
  addToWishlist(userId: string, productId: string): Promise<Wishlist>;
  getWishlist(userId: string): Promise<Wishlist[]>;
  removeFromWishlist(userId: string, productId: string): Promise<boolean>;
  
  // Delivery Tracking operations
  createDeliveryTracking(data: InsertDeliveryTracking): Promise<DeliveryTracking>;
  getLatestDeliveryLocation(orderId: string): Promise<DeliveryTracking | undefined>;
  getDeliveryTrackingHistory(orderId: string): Promise<DeliveryTracking[]>;
  
  // Review operations
  createReview(review: InsertReview & { userId: string }): Promise<Review>;
  getProductReviews(productId: string): Promise<Array<Review & { userName: string }>>;
  addSellerReply(reviewId: string, reply: string): Promise<Review | undefined>;
  verifyPurchaseForReview(userId: string, productId: string): Promise<{ verified: boolean; orderId?: string }>;
  
  // Notification operations
  createNotification(notification: InsertNotification): Promise<Notification>;
  getNotificationsByUser(userId: string, limit?: number): Promise<Notification[]>;
  getUnreadNotificationCount(userId: string): Promise<number>;
  markNotificationAsRead(notificationId: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;
  deleteNotification(notificationId: string, userId: string): Promise<boolean>;
  
  // Product Variant operations
  getProductVariants(productId: string): Promise<ProductVariant[]>;
  
  // Category Fields operations (admin only)
  createCategoryField(field: any): Promise<any>;
  getCategoryFields(categoryName?: string): Promise<any[]>;
  updateCategoryField(id: string, data: any): Promise<any | undefined>;
  deleteCategoryField(id: string): Promise<boolean>;
  
  // Store operations
  createStore(store: any): Promise<any>;
  getStore(id: string): Promise<any | undefined>;
  getStores(filters?: { isActive?: boolean; isApproved?: boolean }): Promise<any[]>;
  getStoreByPrimarySeller(sellerId: string): Promise<any | undefined>;
  updateStore(id: string, data: any): Promise<any | undefined>;
  deleteStore(id: string): Promise<boolean>;
  
  // Category operations
  createCategory(category: any): Promise<any>;
  getCategory(id: string): Promise<any | undefined>;
  getCategoryBySlug(slug: string): Promise<any | undefined>;
  getCategories(filters?: { isActive?: boolean }): Promise<any[]>;
  getCategoriesByStore(storeId: string): Promise<any[]>;
  updateCategory(id: string, data: any): Promise<any | undefined>;
  deleteCategory(id: string): Promise<boolean>;
  
  // Hero Banner operations
  getHeroBanners(storeMode?: string): Promise<HeroBanner[]>;
  getAllHeroBanners(): Promise<HeroBanner[]>;
  getHeroBanner(id: string): Promise<HeroBanner | undefined>;
  createHeroBanner(banner: InsertHeroBanner): Promise<HeroBanner>;
  updateHeroBanner(id: string, data: Partial<HeroBanner>): Promise<HeroBanner | undefined>;
  deleteHeroBanner(id: string): Promise<boolean>;
  
  // Coupon operations
  createCoupon(coupon: InsertCoupon & { sellerId: string }): Promise<Coupon>;
  getCoupon(id: string): Promise<Coupon | undefined>;
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  getCouponsBySeller(sellerId: string): Promise<Coupon[]>;
  updateCoupon(id: string, data: Partial<Coupon>): Promise<Coupon | undefined>;
  deleteCoupon(id: string): Promise<boolean>;
  validateCoupon(code: string, sellerId: string, orderTotal: number): Promise<{ valid: boolean; message?: string; coupon?: Coupon }>;
  
  // Analytics
  getAnalytics(userId?: string, role?: string): Promise<any>;
  
  // Banner Collection operations
  createBannerCollection(collection: InsertBannerCollection): Promise<BannerCollection>;
  getBannerCollection(id: string): Promise<BannerCollection | undefined>;
  getBannerCollections(): Promise<BannerCollection[]>;
  updateBannerCollection(id: string, data: Partial<BannerCollection>): Promise<BannerCollection | undefined>;
  deleteBannerCollection(id: string): Promise<boolean>;
  
  // Marketplace Banner operations
  createMarketplaceBanner(banner: InsertMarketplaceBanner): Promise<MarketplaceBanner>;
  getMarketplaceBanner(id: string): Promise<MarketplaceBanner | undefined>;
  getMarketplaceBanners(collectionId?: string): Promise<MarketplaceBanner[]>;
  getActiveMarketplaceBanners(): Promise<MarketplaceBanner[]>;
  updateMarketplaceBanner(id: string, data: Partial<MarketplaceBanner>): Promise<MarketplaceBanner | undefined>;
  deleteMarketplaceBanner(id: string): Promise<boolean>;
  
  // Footer Pages operations
  getActiveFooterPages(): Promise<FooterPage[]>;
  getAllFooterPages(): Promise<FooterPage[]>;
  createFooterPage(data: InsertFooterPage): Promise<FooterPage>;
  updateFooterPage(id: string, data: Partial<FooterPage>): Promise<FooterPage | undefined>;
  deleteFooterPage(id: string): Promise<boolean>;
  reorderMarketplaceBanners(bannerIds: string[]): Promise<void>;
  
  // Multi-vendor homepage data
  getApprovedSellers(): Promise<User[]>;
  getFeaturedProducts(limit?: number, sellerId?: string): Promise<Product[]>;
  
  // Media Library operations
  createMediaLibraryItem(data: InsertMediaLibrary): Promise<MediaLibrary>;
  getMediaLibraryItems(filters?: { category?: string; uploaderRole?: string; uploaderId?: string }): Promise<MediaLibrary[]>;
  deleteMediaLibraryItem(id: string): Promise<boolean>;
  
  // Role Features operations (super_admin only)
  getRoleFeatures(role?: string): Promise<any[]>;
  updateRoleFeatures(role: string, features: Record<string, boolean>, updatedBy: string): Promise<any>;
}

export class DbStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async createUser(user: InsertUser): Promise<User> {
    const result = await db.insert(users).values([user as any]).returning();
    return result[0];
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return result[0];
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id)).returning();
    return result.length > 0;
  }

  async getUsersByRole(role: string): Promise<User[]> {
    return db.select().from(users).where(eq(users.role, role as any));
  }

  // Product operations
  async createProduct(product: InsertProduct & { sellerId: string }): Promise<Product> {
    const result = await db.insert(products).values(product).returning();
    return result[0];
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
    return result[0];
  }

  async getProducts(filters?: { sellerId?: string; category?: string; isActive?: boolean }): Promise<Product[]> {
    let query = db.select().from(products);
    
    if (filters?.sellerId) {
      query = query.where(eq(products.sellerId, filters.sellerId)) as any;
    }
    if (filters?.category) {
      query = query.where(eq(products.category, filters.category)) as any;
    }
    if (filters?.isActive !== undefined) {
      query = query.where(eq(products.isActive, filters.isActive)) as any;
    }
    
    return query.orderBy(desc(products.createdAt));
  }

  async updateProduct(id: string, data: Partial<Product>): Promise<Product | undefined> {
    const result = await db.update(products).set({ ...data, updatedAt: new Date() }).where(eq(products.id, id)).returning();
    return result[0];
  }

  async deleteProduct(id: string): Promise<boolean> {
    const result = await db.delete(products).where(eq(products.id, id));
    return true;
  }

  // Order operations
  async createOrder(
    order: InsertOrder, 
    items: Array<{ productId: string; quantity: number; price: string; total: string }>
  ): Promise<Order> {
    const orderNumber = `ORD-${Date.now()}`;
    const qrCode = `${orderNumber}-${order.buyerId}`;
    
    const [newOrder] = await db.insert(orders).values({
      ...order,
      orderNumber,
      qrCode,
    }).returning();

    for (const item of items) {
      await db.insert(orderItems).values({
        orderId: newOrder.id,
        ...item,
      });
    }

    // Increment coupon usage count atomically if coupon was applied
    if (order.couponCode) {
      await db.update(coupons)
        .set({ usedCount: sql`COALESCE(${coupons.usedCount}, 0) + 1` })
        .where(eq(coupons.code, order.couponCode));
    }

    await this.clearCart(order.buyerId);

    return newOrder;
  }

  async createMultiSellerOrders(
    baseOrderData: Omit<InsertOrder, 'sellerId' | 'storeId' | 'subtotal' | 'total' | 'processingFee'>,
    itemsBySeller: Array<{
      sellerId: string;
      storeId: string | null;
      items: Array<{ productId: string; quantity: number; price: string; total: string }>;
      subtotal: number;
      deliveryFee: number;
      processingFee: number;
      couponDiscount: number;
      total: number;
    }>
  ): Promise<{ sessionId: string; orders: Order[] }> {
    return await db.transaction(async (tx) => {
      const sessionId = `SESSION-${Date.now()}`;
      const createdOrders: Order[] = [];

      for (const sellerGroup of itemsBySeller) {
        const orderNumber = `ORD-${Date.now()}-${sellerGroup.sellerId.slice(0, 8)}`;
        const qrCode = `${orderNumber}-${baseOrderData.buyerId}`;

        const [newOrder] = await tx.insert(orders).values({
          ...baseOrderData,
          sellerId: sellerGroup.sellerId,
          storeId: sellerGroup.storeId,
          checkoutSessionId: sessionId,
          orderNumber,
          qrCode,
          subtotal: sellerGroup.subtotal.toFixed(2),
          deliveryFee: sellerGroup.deliveryFee.toFixed(2),
          processingFee: sellerGroup.processingFee.toFixed(2),
          couponDiscount: sellerGroup.couponDiscount > 0 ? sellerGroup.couponDiscount.toFixed(2) : null,
          total: sellerGroup.total.toFixed(2),
        }).returning();

        for (const item of sellerGroup.items) {
          await tx.insert(orderItems).values({
            orderId: newOrder.id,
            ...item,
          });
        }

        createdOrders.push(newOrder);
      }

      // Increment coupon usage count if coupon was applied
      if (baseOrderData.couponCode) {
        await tx.update(coupons)
          .set({ usedCount: sql`COALESCE(${coupons.usedCount}, 0) + 1` })
          .where(eq(coupons.code, baseOrderData.couponCode));
      }

      // Clear cart once after all orders created
      await tx.delete(cart).where(eq(cart.userId, baseOrderData.buyerId));

      return { sessionId, orders: createdOrders };
    });
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const result = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
    return result[0];
  }

  async getAllOrders(): Promise<Order[]> {
    return db.select().from(orders).orderBy(desc(orders.createdAt));
  }

  async getOrdersByUser(userId: string, role: "buyer" | "seller" | "rider"): Promise<Order[]> {
    if (role === "buyer") {
      return db.select().from(orders).where(eq(orders.buyerId, userId)).orderBy(desc(orders.createdAt));
    } else if (role === "seller") {
      return db.select().from(orders).where(eq(orders.sellerId, userId)).orderBy(desc(orders.createdAt));
    } else {
      return db.select().from(orders).where(eq(orders.riderId, userId as any)).orderBy(desc(orders.createdAt));
    }
  }

  async getOrderItems(orderId: string): Promise<Array<{ productId: string; productName: string; quantity: number; price: string }>> {
    const items = await db
      .select({
        productId: orderItems.productId,
        productName: products.name,
        quantity: orderItems.quantity,
        price: orderItems.price,
      })
      .from(orderItems)
      .leftJoin(products, eq(orderItems.productId, products.id))
      .where(eq(orderItems.orderId, orderId));
    
    return items.map(item => ({
      ...item,
      productName: item.productName || "Unknown Product"
    }));
  }

  async updateOrderStatus(id: string, status: string): Promise<Order | undefined> {
    const result = await db.update(orders).set({ 
      status: status as any,
      updatedAt: new Date(),
      ...(status === "delivered" ? { deliveredAt: new Date() } : {})
    }).where(eq(orders.id, id)).returning();
    return result[0];
  }

  async applyOrderStatusTransition(
    orderId: string,
    toStatus: string,
    changedBy: string,
    changedByRole: string,
    reason?: string
  ): Promise<Order | undefined> {
    // CRITICAL: Use transaction to ensure atomicity
    // Read order, validate, compute side effects, update, and audit trail must all be atomic
    try {
      const updatedOrder = await db.transaction(async (tx) => {
        // CRITICAL: Read order INSIDE transaction with row lock (FOR UPDATE)
        // This prevents TOCTOU race conditions
        const currentOrderResult = await tx.select()
          .from(orders)
          .where(eq(orders.id, orderId))
          .for('update'); // Lock row for duration of transaction

        const currentOrder = currentOrderResult[0];

        if (!currentOrder) {
          throw new Error("ORDER_NOT_FOUND");
        }

        const fromStatus = currentOrder.status;

        // CRITICAL: Validate transition INSIDE transaction with locked order state
        // This prevents validation on stale data
        const { assertCanTransition, getTransitionSideEffects } = await import("./services/orderStateMachine");

        const transitionResult = assertCanTransition({
          order: currentOrder, // Use locked order state
          targetStatus: toStatus as any,
          actorId: changedBy,
          actorRole: changedByRole as any,
          reason,
        });

        if (!transitionResult.valid) {
          const error = transitionResult.error;
          // Throw with error code for proper HTTP status mapping
          const errorWithCode = new Error(error.message);
          (errorWithCode as any).code = error.code;
          (errorWithCode as any).details = error.details;
          throw errorWithCode;
        }

        // Compute side effects based on locked order state
        const sideEffects = getTransitionSideEffects(currentOrder, toStatus as any);

        // Apply status change with side effects
        const result = await tx.update(orders).set({
          status: toStatus as any,
          updatedAt: new Date(),
          ...sideEffects,
        })
        .where(eq(orders.id, orderId))
        .returning();

        const updatedOrder = result[0];

        if (!updatedOrder) {
          throw new Error("UPDATE_FAILED");
        }

        // Create audit trail entry (inside same transaction)
        await tx.insert(orderStatusHistory).values({
          orderId,
          fromStatus: fromStatus as any,
          toStatus: toStatus as any,
          changedBy,
          changedByRole: changedByRole as any,
          reason,
          metadata: sideEffects as any,
        });

        return updatedOrder;
      });

      return updatedOrder;
    } catch (error: any) {
      console.error("Failed to apply order status transition:", error);
      // Re-throw with error code for proper HTTP status mapping
      throw error;
    }
  }

  async createOrderStatusHistory(data: InsertOrderStatusHistory): Promise<OrderStatusHistory> {
    const result = await db.insert(orderStatusHistory).values(data).returning();
    return result[0];
  }

  async getOrderStatusHistory(orderId: string): Promise<OrderStatusHistory[]> {
    return db.select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, orderId))
      .orderBy(desc(orderStatusHistory.createdAt));
  }

  async updateOrder(orderId: string, data: Partial<Order>): Promise<Order | undefined> {
    const result = await db.update(orders).set({ 
      ...data,
      updatedAt: new Date()
    }).where(eq(orders.id, orderId)).returning();
    return result[0];
  }

  async assignRider(orderId: string, riderId: string): Promise<Order | undefined> {
    const result = await db.update(orders).set({ 
      riderId,
      status: "processing",
      updatedAt: new Date()
    }).where(eq(orders.id, orderId)).returning();
    return result[0];
  }

  async getAvailableRidersWithOrderCounts(): Promise<Array<{ rider: User; activeOrderCount: number }>> {
    const allRiders = await db.select().from(users)
      .where(
        and(
          eq(users.role, 'rider'),
          eq(users.isApproved, true),
          eq(users.isActive, true)
        )
      );

    const ridersWithCounts = await Promise.all(
      allRiders.map(async (rider) => {
        const activeOrders = await db.select()
          .from(orders)
          .where(
            and(
              eq(orders.riderId, rider.id),
              or(
                eq(orders.status, 'processing'),
                eq(orders.status, 'delivering')
              )
            )
          );
        
        return {
          rider,
          activeOrderCount: activeOrders.length
        };
      })
    );

    return ridersWithCounts.filter(r => r.activeOrderCount < 10)
      .sort((a, b) => a.activeOrderCount - b.activeOrderCount);
  }

  // Delivery Zone operations
  async createDeliveryZone(zone: InsertDeliveryZone): Promise<DeliveryZone> {
    // CRITICAL: Validate at storage layer to prevent bypass via seeds/scripts
    const { insertDeliveryZoneSchema } = await import("@shared/schema");
    
    // Parse and validate input (throws if invalid)
    // Zod coerce handles both string and number inputs
    const validatedZone = insertDeliveryZoneSchema.parse(zone);
    
    // Normalize zone name (trim whitespace)
    const normalizedZone = {
      ...validatedZone,
      name: validatedZone.name.trim(),
      fee: validatedZone.fee.toString(), // Convert number to string for database
    };
    
    // Check for duplicate names (case-insensitive)
    const existingZones = await db.select()
      .from(deliveryZones)
      .where(sql`lower(${deliveryZones.name}) = lower(${normalizedZone.name})`);
    
    if (existingZones.length > 0) {
      const error = new Error("A delivery zone with this name already exists. Please use a different name.");
      (error as any).code = 'DUPLICATE_ZONE_NAME';
      throw error;
    }
    
    const result = await db.insert(deliveryZones).values(normalizedZone).returning();
    return result[0];
  }

  async getDeliveryZones(): Promise<DeliveryZone[]> {
    return db.select().from(deliveryZones).where(eq(deliveryZones.isActive, true));
  }

  async updateDeliveryZone(id: string, data: Partial<DeliveryZone>): Promise<DeliveryZone | undefined> {
    // CRITICAL: Validate at storage layer to prevent bypass
    // Don't mutate input - create new object with validated values
    const updateData: Partial<DeliveryZone> = {};
    
    // Validate fee if provided
    if (data.fee !== undefined) {
      const feeValue = typeof data.fee === 'string' ? parseFloat(data.fee) : data.fee;
      if (isNaN(feeValue) || feeValue < 0) {
        const error = new Error("Delivery fee must be a non-negative number");
        (error as any).code = 'INVALID_FEE';
        throw error;
      }
      updateData.fee = feeValue.toString() as any;
    }
    
    // Validate and normalize name if provided
    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (trimmedName.length === 0) {
        const error = new Error("Zone name cannot be empty");
        (error as any).code = 'INVALID_NAME';
        throw error;
      }
      if (trimmedName.length > 100) {
        const error = new Error("Zone name must be less than 100 characters");
        (error as any).code = 'INVALID_NAME';
        throw error;
      }
      
      // Check for duplicate names (case-insensitive), excluding current zone
      const existingZones = await db.select()
        .from(deliveryZones)
        .where(
          and(
            sql`lower(${deliveryZones.name}) = lower(${trimmedName})`,
            sql`${deliveryZones.id} != ${id}`
          )
        );
      
      if (existingZones.length > 0) {
        const error = new Error("A delivery zone with this name already exists. Please use a different name.");
        (error as any).code = 'DUPLICATE_ZONE_NAME';
        throw error;
      }
      
      updateData.name = trimmedName;
    }
    
    // Copy over other fields that don't need validation
    if (data.isActive !== undefined) {
      updateData.isActive = data.isActive;
    }
    
    const result = await db.update(deliveryZones).set(updateData).where(eq(deliveryZones.id, id)).returning();
    return result[0];
  }

  async deleteDeliveryZone(id: string): Promise<boolean> {
    const result = await db.delete(deliveryZones).where(eq(deliveryZones.id, id));
    return true;
  }

  // Chat operations
  async createMessage(message: InsertChatMessage & { senderId: string }): Promise<ChatMessage> {
    const result = await db.insert(chatMessages).values(message).returning();
    return result[0];
  }

  async getMessages(userId1: string, userId2: string): Promise<ChatMessage[]> {
    return db.select().from(chatMessages)
      .where(
        sql`(${chatMessages.senderId} = ${userId1} AND ${chatMessages.receiverId} = ${userId2}) OR 
            (${chatMessages.senderId} = ${userId2} AND ${chatMessages.receiverId} = ${userId1})`
      )
      .orderBy(chatMessages.createdAt);
  }

  async markMessageDelivered(messageId: string): Promise<void> {
    await db.update(chatMessages)
      .set({ 
        status: 'delivered',
        deliveredAt: new Date()
      })
      .where(eq(chatMessages.id, messageId));
  }

  async markMessagesAsRead(senderId: string, receiverId: string): Promise<void> {
    await db.update(chatMessages)
      .set({ 
        status: 'read',
        isRead: true,
        readAt: new Date()
      })
      .where(
        and(
          eq(chatMessages.senderId, senderId),
          eq(chatMessages.receiverId, receiverId),
          eq(chatMessages.isRead, false)
        )
      );
  }

  async getUnreadMessageCount(userId: string): Promise<number> {
    const result = await db.select().from(chatMessages)
      .where(
        and(
          eq(chatMessages.receiverId, userId),
          eq(chatMessages.isRead, false)
        )
      );
    return result.length;
  }

  // Transaction operations
  async createTransaction(data: any): Promise<Transaction> {
    const result = await db.insert(transactions).values(data as any).returning();
    return result[0];
  }

  async getTransactionByReference(reference: string): Promise<Transaction | undefined> {
    const result = await db.select().from(transactions).where(eq(transactions.paymentReference, reference)).limit(1);
    return result[0];
  }

  // Idempotency helpers using typed Drizzle table `idempotencyKeys`
  async createIdempotencyKey(key: string, payload?: any): Promise<{ key: string }> {
    try {
      await db.insert(idempotencyKeys).values({ key, payload: payload ?? null }).onConflictDoNothing();
    } catch (e) {
      console.warn('[IDEMPOTENCY] insert failed', (e as any).message || e);
    }
    return { key };
  }

  async getIdempotencyKey(key: string): Promise<any | undefined> {
    try {
      const res = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
      return res[0];
    } catch (e) {
      console.warn('[IDEMPOTENCY] select failed', (e as any).message || e);
      return undefined;
    }
  }

  async getIdempotencyByReference(reference: string): Promise<any | undefined> {
    try {
      const res = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.usedReference, reference)).limit(1);
      return res[0];
    } catch (e) {
      console.warn('[IDEMPOTENCY] select by reference failed', (e as any).message || e);
      return undefined;
    }
  }

  async markIdempotencyUsed(key: string, reference?: string): Promise<void> {
    try {
      await db.update(idempotencyKeys).set({ used: true, usedReference: reference ?? null, lastAttempt: new Date() }).where(eq(idempotencyKeys.key, key));
    } catch (e) {
      console.warn('[IDEMPOTENCY] mark used failed', (e as any).message || e);
    }
  }

  async incrementIdempotencyRetry(key: string): Promise<number> {
    try {
      const updated = await db.update(idempotencyKeys)
        .set({ retries: sql`COALESCE(${idempotencyKeys.retries},0) + 1`, lastAttempt: new Date() })
        .where(eq(idempotencyKeys.key, key)).returning();
      if (updated && updated[0]) return (updated[0] as any).retries ?? 0;
      const res = await db.select({ retries: idempotencyKeys.retries }).from(idempotencyKeys).where(eq(idempotencyKeys.key, key)).limit(1);
      return res[0]?.retries ?? 0;
    } catch (e) {
      console.warn('[IDEMPOTENCY] increment retry failed', (e as any).message || e);
      return 0;
    }
  }

  // Commission operations
  async createCommission(data: InsertCommission): Promise<Commission> {
    const result = await db.insert(commissions).values(data as any).returning();
    return result[0];
  }

  async createPlatformEarning(data: InsertPlatformEarning): Promise<PlatformEarning> {
    const result = await db.insert(platformEarnings).values(data as any).returning();
    return result[0];
  }

  // Fetch platform earnings list with optional pagination and filtering
  async getPlatformEarnings(limit = 50, offset = 0): Promise<PlatformEarning[]> {
    const rows = await db.select().from(platformEarnings).orderBy(desc(platformEarnings.createdAt)).limit(limit).offset(offset);
    return rows;
  }

  // Detailed platform earnings (joins to provide store/seller and order info) with filters
  async getPlatformEarningsDetailed(options?: { limit?: number; offset?: number; sellerId?: string; storeId?: string; from?: string; to?: string; type?: string }) {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let query: any = db.select({
      id: platformEarnings.id,
      orderId: platformEarnings.orderId,
      commissionId: platformEarnings.commissionId,
      amount: platformEarnings.amount,
      type: platformEarnings.type,
      description: platformEarnings.description,
      createdAt: platformEarnings.createdAt,
      sellerId: commissions.sellerId,
      sellerName: users.name,
      storeId: stores.id,
      storeName: stores.name,
      orderNumber: orders.orderNumber,
      orderCreatedAt: orders.createdAt
    })
    .from(platformEarnings)
    .leftJoin(commissions, eq(platformEarnings.commissionId, commissions.id))
    .leftJoin(orders, eq(platformEarnings.orderId, orders.id))
    .leftJoin(stores, eq(commissions.sellerId, stores.primarySellerId))
    .leftJoin(users, eq(commissions.sellerId, users.id))
    .orderBy(desc(platformEarnings.createdAt)) as any;

    // Apply filters
    if (options?.sellerId) {
      query = query.where(eq(commissions.sellerId, options.sellerId));
    }
    if (options?.storeId) {
      query = query.where(eq(stores.id, options.storeId));
    }
    if (options?.type) {
      query = query.where(eq(platformEarnings.type, options.type));
    }
    if (options?.from) {
      query = query.where(sql`${platformEarnings.createdAt} >= ${new Date(options.from)}`);
    }
    if (options?.to) {
      query = query.where(sql`${platformEarnings.createdAt} <= ${new Date(options.to)}`);
    }

    const rows = await query.limit(limit).offset(offset);
    return rows;
  }

  // Summary of platform earnings grouped by type and total
  async getPlatformEarningsSummary(): Promise<{ total: string; byType: Record<string, string> }> {
    const totals = await db.select({ type: platformEarnings.type, sum: sql`SUM(${platformEarnings.amount})` }).from(platformEarnings).groupBy(platformEarnings.type);
    const totalAll = await db.select({ sum: sql`SUM(${platformEarnings.amount})` }).from(platformEarnings);
    const byType: Record<string, string> = {};
    totals.forEach((t: any) => { byType[String(t.type)] = (parseFloat(String(t.sum)) || 0).toFixed(2); });
    return { total: (parseFloat(String(totalAll[0]?.sum)) || 0).toFixed(2), byType };
  }

  // Fetch recent transactions
  async getTransactions(limit = 50, offset = 0): Promise<Transaction[]> {
    const rows = await db.select().from(transactions).orderBy(desc(transactions.createdAt)).limit(limit).offset(offset);
    return rows;
  }

  // CRITICAL: Atomic commission creation with platform earning
  async createCommissionWithEarning(orderId: string): Promise<{commission: Commission, earning: PlatformEarning}> {
    return await db.transaction(async (tx) => {
      // Step 1: Check if commission already exists (idempotency)
      const existingCommission = await tx.select().from(commissions)
        .where(eq(commissions.orderId, orderId))
        .limit(1);
      
      if (existingCommission.length > 0) {
        const error = new Error(`Commission already exists for order ${orderId}`);
        (error as any).code = 'COMMISSION_ALREADY_EXISTS';
        throw error;
      }

      // Step 2: Get and validate order
      const [order] = await tx.select().from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);
      
      if (!order) {
        const error = new Error(`Order ${orderId} not found`);
        (error as any).code = 'ORDER_NOT_FOUND';
        throw error;
      }

      if (order.paymentStatus !== 'completed') {
        const error = new Error(`Order ${orderId} payment not completed (status: ${order.paymentStatus})`);
        (error as any).code = 'PAYMENT_NOT_COMPLETED';
        throw error;
      }

      if (!order.sellerId) {
        const error = new Error(`Order ${orderId} missing sellerId`);
        (error as any).code = 'MISSING_SELLER';
        throw error;
      }

      // Step 3: Get platform commission rate
      const settings = await this.getPlatformSettings();
      const commissionRatePercent = parseFloat(settings.defaultCommissionRate || "1.00");

      // Step 4: Calculate amounts using integer arithmetic (cents) for precision
      // Convert to cents to avoid floating point errors
      // Commission and seller amounts are calculated on the amount excluding processing fees
      const orderProcessingFeeCents = Math.round((parseFloat(order.processingFee || "0") || 0) * 100);
      const orderAmountCents = Math.round(parseFloat(order.total) * 100) - orderProcessingFeeCents;
      const commissionAmountCents = Math.round((orderAmountCents * commissionRatePercent) / 100);
      const sellerAmountCents = orderAmountCents - commissionAmountCents;

      // Validation: Ensure splits add up correctly
      if (sellerAmountCents + commissionAmountCents !== orderAmountCents) {
        const error = new Error(`Commission split calculation error: ${sellerAmountCents} + ${commissionAmountCents} !== ${orderAmountCents}`);
        (error as any).code = 'CALCULATION_ERROR';
        throw error;
      }

      // Convert back to decimal strings for database
      const orderAmountDecimal = (orderAmountCents / 100).toFixed(2);
      const commissionAmountDecimal = (commissionAmountCents / 100).toFixed(2);
      const sellerAmountDecimal = (sellerAmountCents / 100).toFixed(2);

      // Step 5: Create commission record with processedAt timestamp
      const [commission] = await tx.insert(commissions).values({
        orderId: order.id,
        sellerId: order.sellerId,
        orderAmount: orderAmountDecimal,
        commissionRate: commissionRatePercent.toFixed(2),
        commissionAmount: commissionAmountDecimal,
        sellerAmount: sellerAmountDecimal,
        platformAmount: commissionAmountDecimal, // Same as commission amount
        status: "processed", // Auto-mark processed on successful payment
        processedAt: new Date(), // Set when commission is calculated
      } as any).returning();

      // Step 6: Create linked platform earning
      const [earning] = await tx.insert(platformEarnings).values({
        orderId: order.id,
        commissionId: commission.id, // Link to commission
        amount: commissionAmountDecimal,
        type: "commission",
        description: `Commission from order #${order.orderNumber}`,
      } as any).returning();

      return { commission, earning };
    });
  }

  // Get seller's available balance (sum of pending commissions not in payouts)
  async getSellerAvailableBalance(sellerId: string): Promise<number> {
    // Get all pending commissions for seller
    const pendingCommissions = await db.select()
      .from(commissions)
      .where(
        and(
          eq(commissions.sellerId, sellerId),
          eq(commissions.status, 'pending')
        )
      );

    // Calculate total available (sum of sellerAmount)
    const totalCents = pendingCommissions.reduce((sum, commission) => {
      return sum + Math.round(parseFloat(commission.sellerAmount) * 100);
    }, 0);

    return totalCents / 100; // Convert back to decimal
  }

  // Get seller commissions
  async getSellerCommissions(sellerId: string, status?: string): Promise<Commission[]> {
    if (status) {
      return await db.select()
        .from(commissions)
        .where(
          and(
            eq(commissions.sellerId, sellerId),
            eq(commissions.status, status)
          )
        )
        .orderBy(desc(commissions.createdAt));
    }
    
    return await db.select()
      .from(commissions)
      .where(eq(commissions.sellerId, sellerId))
      .orderBy(desc(commissions.createdAt));
  }

  // CRITICAL: Create seller payout with comprehensive validation
  async createSellerPayout(data: InsertSellerPayout): Promise<SellerPayout> {
    return await db.transaction(async (tx) => {
      // Step 1: Validate seller exists
      const [seller] = await tx.select()
        .from(users)
        .where(eq(users.id, data.sellerId))
        .limit(1);

      if (!seller || seller.role !== 'seller') {
        const error = new Error(`Seller ${data.sellerId} not found`);
        (error as any).code = 'SELLER_NOT_FOUND';
        throw error;
      }

      // Step 2: Get platform settings
      const settings = await this.getPlatformSettings();
      const requestedAmount = parseFloat(data.amount);
      // No minimum payout amount is enforced platform-wide

      if (requestedAmount <= 0) {
        const error = new Error(`Invalid payout amount: ${requestedAmount.toFixed(2)}`);
        (error as any).code = 'INVALID_AMOUNT';
        throw error;
      }

      // Step 4: Calculate available balance from pending commissions
      const pendingCommissions = await tx.select()
        .from(commissions)
        .where(
          and(
            eq(commissions.sellerId, data.sellerId),
            eq(commissions.status, 'pending')
          )
        );

      const availableBalanceCents = pendingCommissions.reduce((sum, commission) => {
        return sum + Math.round(parseFloat(commission.sellerAmount) * 100);
      }, 0);
      const availableBalance = availableBalanceCents / 100;

      // Step 5: Validate sufficient balance
      if (requestedAmount > availableBalance) {
        const error = new Error(`Insufficient balance. Requested: ${requestedAmount.toFixed(2)}, Available: ${availableBalance.toFixed(2)}`);
        (error as any).code = 'INSUFFICIENT_BALANCE';
        throw error;
      }

      // Step 6: Find commissions that sum to exact requested amount
      // CRITICAL: Use subset sum algorithm to find exact match, allowing skips
      const requestedCents = Math.round(requestedAmount * 100);
      const sortedCommissions = pendingCommissions.sort((a, b) => 
        new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime()
      );
      
      // Convert commissions to cents for precise calculation
      const commissionData = sortedCommissions.map(c => ({
        id: c.id,
        amountCents: Math.round(parseFloat(c.sellerAmount) * 100),
        amountDisplay: parseFloat(c.sellerAmount).toFixed(2)
      }));

      // Find subset that sums to exactly requestedCents (greedy with backtracking)
      const commissionsToInclude: string[] = [];
      let accumulatedCents = 0;

      for (const commission of commissionData) {
        // Can we add this commission without exceeding?
        if (accumulatedCents + commission.amountCents <= requestedCents) {
          commissionsToInclude.push(commission.id);
          accumulatedCents += commission.amountCents;
          
          // Exact match found!
          if (accumulatedCents === requestedCents) {
            break;
          }
        }
        // Skip commissions that would cause overshoot, continue searching
      }

      // Verify exact match found
      if (accumulatedCents !== requestedCents) {
        // No exact composition exists - provide helpful error
        const availableAmounts = commissionData.map(c => c.amountDisplay).join(', ');
        const error = new Error(
          `Cannot compose exact payout amount ${requestedAmount.toFixed(2)} from available commissions. ` +
          `Available commissions (oldest first): ${availableAmounts}. ` +
          `Please request an amount that equals the sum of one or more commissions, or withdraw your full balance of ${availableBalance.toFixed(2)}.`
        );
        (error as any).code = 'AMOUNT_NOT_COMPOSABLE';
        throw error;
      }

      // Step 7: Validate payout method details
      if (data.method === 'bank_transfer' || data.method === 'bank_account') {
        if (!data.bankDetails?.accountNumber || !data.bankDetails?.bankName) {
          const error = new Error('Bank account details required for bank transfer');
          (error as any).code = 'MISSING_BANK_DETAILS';
          throw error;
        }
      } else if (data.method === 'mobile_money') {
        if (!data.bankDetails?.mobileNumber) {
          const error = new Error('Mobile number required for mobile money payout');
          (error as any).code = 'MISSING_MOBILE_NUMBER';
          throw error;
        }
      }

      // Step 8: Create payout record
      const [payout] = await tx.insert(sellerPayouts).values({
        ...data,
        commissionIds: commissionsToInclude,
        status: 'pending',
      } as any).returning();

      // Step 9: Mark included commissions as 'processing'
      if (commissionsToInclude.length > 0) {
        await tx.update(commissions)
          .set({ status: 'processing' })
          .where(
            and(
              eq(commissions.sellerId, data.sellerId),
              sql`${commissions.id} = ANY(${commissionsToInclude})`
            )
          );
      }

      return payout;
    });
  }

  // Get seller payouts
  async getSellerPayouts(sellerId: string): Promise<SellerPayout[]> {
    return await db.select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.sellerId, sellerId))
      .orderBy(desc(sellerPayouts.createdAt));
  }

  // Get all pending payouts (for admin)
  async getAllPendingPayouts(): Promise<SellerPayout[]> {
    return await db.select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.status, 'pending'))
      .orderBy(desc(sellerPayouts.createdAt));
  }

  // Get payouts by status (e.g., 'processing')
  async getPayoutsByStatus(status: string): Promise<SellerPayout[]> {
    return await db.select()
      .from(sellerPayouts)
      .where(eq(sellerPayouts.status, status))
      .orderBy(desc(sellerPayouts.createdAt));
  }

  // Mark an array of commission IDs as processed
  async markCommissionsProcessed(commissionIds: string[]): Promise<void> {
    if (!commissionIds || commissionIds.length === 0) return;

    // Some DB drivers can fail when passing JS arrays directly to ANY(...).
    // Update commissions one-by-one inside a transaction to ensure compatibility and atomicity.
    await db.transaction(async (tx) => {
      for (const id of commissionIds) {
        await tx.update(commissions).set({ status: 'processed' }).where(eq(commissions.id, id));
      }
    });
  }

  // Update payout status (for admin processing)
  async updatePayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<SellerPayout | undefined> {
    return await db.transaction(async (tx) => {
      // Get payout
      const [payout] = await tx.select()
        .from(sellerPayouts)
        .where(eq(sellerPayouts.id, payoutId))
        .limit(1);

      if (!payout) {
        return undefined;
      }

      // Update payout status
      const [updated] = await tx.update(sellerPayouts)
        .set({
          status,
          processedBy: processedBy || payout.processedBy,
          processedAt: status === 'completed' || status === 'failed' ? new Date() : payout.processedAt,
        } as any)
        .where(eq(sellerPayouts.id, payoutId))
        .returning();

      // Update commission status based on payout outcome
      if (payout.commissionIds && payout.commissionIds.length > 0) {
        const commissionStatus = status === 'completed' ? 'processed' : 
                               status === 'failed' ? 'pending' : 
                               'processing';

        await tx.update(commissions)
          .set({ status: commissionStatus })
          .where(sql`${commissions.id} = ANY(${payout.commissionIds})`);
      }

      return updated;
    });
  }

  // ===== Rider Payout Operations =====
  
  // Create rider payout (for approved payouts after delivery completion)
  async createRiderPayout(data: InsertRiderPayout): Promise<RiderPayout> {
    const [payout] = await db.insert(riderPayouts)
      .values(data as any)
      .returning();
    return payout;
  }

  // Get rider payouts
  async getRiderPayouts(riderId: string): Promise<RiderPayout[]> {
    return await db.select()
      .from(riderPayouts)
      .where(eq(riderPayouts.riderId, riderId))
      .orderBy(desc(riderPayouts.createdAt));
  }

  // Get all pending rider payouts (for admin approval)
  async getAllPendingRiderPayouts(): Promise<RiderPayout[]> {
    return await db.select()
      .from(riderPayouts)
      .where(eq(riderPayouts.status, 'pending_approval'))
      .orderBy(desc(riderPayouts.createdAt));
  }

  // Update rider payout status (admin processing)
  async updateRiderPayoutStatus(payoutId: string, status: string, processedBy?: string): Promise<RiderPayout | undefined> {
    const [updated] = await db.update(riderPayouts)
      .set({
        status,
        processedBy: processedBy || undefined,
        processedAt: status === 'completed' || status === 'failed' ? new Date() : undefined,
      } as any)
      .where(eq(riderPayouts.id, payoutId))
      .returning();
    return updated;
  }

  // Get rider's available balance (sum of pending payouts)
  async getRiderAvailableBalance(riderId: string): Promise<number> {
    const result = await db.select({
      total: sql`COALESCE(SUM(${riderPayouts.amount}::numeric), 0)::numeric`
    })
      .from(riderPayouts)
      .where(and(
        eq(riderPayouts.riderId, riderId),
        eq(riderPayouts.status, 'pending_approval')
      ));
    
    return parseFloat(result[0]?.total as string || '0');
  }

  // Queue a payout for a completed delivery (called when delivery is marked complete)
  async queueRiderPayout(riderId: string, amount: number, orderId: string): Promise<RiderPayout> {
    const [payout] = await db.insert(riderPayouts)
      .values({
        riderId,
        orderId,
        amount: amount.toFixed(2),
        method: 'mobile_money',
        status: 'pending_approval',
        notes: `Delivery fee for order ${orderId}`
      })
      .returning();
    return payout;
  }

  // Platform settings
  async getPlatformSettings(): Promise<PlatformSettings> {
    try {
      // Return the most recently updated settings row (if multiple exist) to avoid ambiguity
      console.info('PLAT_SETTINGS_COLUMNS', Object.keys(platformSettings));
      const result = await db.select().from(platformSettings).orderBy(desc(platformSettings.updatedAt)).limit(1);
      if (result.length === 0) {
        // Ensure reasonable defaults on first creation: Single-store by default and GHS currency
        const [settings] = await db.insert(platformSettings).values({ isMultiVendor: false, defaultCurrency: 'GHS' }).returning();
        return settings;
      }
      // Sanitize social URLs: convert '__CLEAR__' to null
      const socialKeys = [
        'facebookUrl','instagramUrl','twitterUrl','linkedinUrl','youtubeUrl','tiktokUrl','pinterestUrl','whatsappPage'
      ];
      const settings: any = { ...result[0] };
      for (const key of socialKeys) {
        if (settings[key] === '__CLEAR__') settings[key] = null;
      }
      return settings;
    } catch (err: any) {
      const msg = err?.message || String(err);
      console.error('ERROR getPlatformSettings query failed:', msg);
      // If the settings table or expected columns are not present (e.g., migrations not applied),
      // return reasonable defaults so the frontend can continue to render without crashing.
      if (msg.includes('does not exist') || msg.includes('column') || msg.includes('relation')) {
        console.warn('[STORAGE] platform_settings table or columns missing; returning defaults');
        // Provide a full shape that satisfies the PlatformSettings type; set optional fields to null/defaults
        const defaults: PlatformSettings = {
          id: 'default',
          isMultiVendor: false,
          platformName: 'KiyuMart',
          logo: null,
          primaryColor: '#1e7b5f',
          secondaryColor: '#2c3e50',
          accentColor: '#e74c3c',
          lightBgColor: '#ffffff',
          lightTextColor: '#000000',
          darkBgColor: '#1a1a1a',
          darkTextColor: '#ffffff',
          lightCardColor: '#f8f9fa',
          darkCardColor: '#2a2a2a',
          onboardingImages: [],
          defaultCurrency: 'GHS',
          paystackPublicKey: null,
          paystackSecretKey: null,
          processingFeePercent: '1.95',
          cloudinaryCloudName: null,
          cloudinaryApiKey: null,
          cloudinaryApiSecret: null,
          contactPhone: null,
          contactEmail: null,
          contactAddress: null,
          facebookUrl: null,
          instagramUrl: null,
          twitterUrl: null,
          linkedinUrl: null,
          youtubeUrl: null,
          tiktokUrl: null,
          pinterestUrl: null,
          whatsappPage: null,
          showSocialLinks: true,
          showFacebook: true,
          showInstagram: true,
          showTwitter: true,
          showLinkedin: true,
          showYoutube: true,
          showTiktok: true,
          showPinterest: true,
          showWhatsapp: true,
          showShopBySection: true,
          footerDescription: null,
          footerLinks: [],
          footerPaymentIcons: [],
          activeBannerCollectionId: null,
          categoryDisplayStyle: null,
          bannerAutoplayEnabled: false,
          bannerAutoplayDuration: 5,
          adsEnabled: true,
          heroBannerEnabled: true,
          sidebarAdEnabled: true,
          footerAdEnabled: true,
          productPageAdEnabled: true,
          heroBannerAdImage: null,
          heroBannerAdUrl: null,
          sidebarAdImage: null,
          sidebarAdUrl: null,
          shopDisplayMode: 'by-store',
          footerAdImage: null,
          footerAdUrl: null,
          productPageAdImage: null,
          productPageAdUrl: null,
          allowSellerRegistration: true,
          allowRiderRegistration: true,
          primaryStoreId: null,
          defaultCommissionRate: '1',
          updatedAt: new Date(),
        };
        return defaults;
      }
      throw err;
    }
  }

  async updatePlatformSettings(data: Partial<PlatformSettings>): Promise<PlatformSettings> {
    const existing = await this.getPlatformSettings();
    const result = await db.update(platformSettings)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(platformSettings.id, existing.id))
      .returning();
    return result[0];
  }

  // Promotional Ads management
  async createPromotionalAd(payload: { type: 'store' | 'product'; targetId: string; startAt?: Date | null; endAt?: Date | null; createdBy?: string | null; title?: string | null; description?: string | null; imageUrl?: string | null; ctaText?: string | null; ctaUrl?: string | null; themeColor?: string | null }) {
    try {
      const [created] = await db.insert(promotionalAds).values({
        type: payload.type,
        targetId: payload.targetId,
        startAt: payload.startAt || null,
        endAt: payload.endAt || null,
        isActive: true,
        createdBy: payload.createdBy || null,
        title: payload.title || null,
        description: payload.description || null,
        imageUrl: payload.imageUrl || null,
        ctaText: payload.ctaText || null,
        ctaUrl: payload.ctaUrl || null,
        themeColor: payload.themeColor || null,
      }).returning();
      return created;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        throw new Error('Promotional ads table not present; please run migrations');
      }
      throw err;
    }
  }

  async getActivePromotionalAds(): Promise<any[]> {
    const now = new Date();
    try {
      const rows = await db.select().from(promotionalAds).where(and(eq(promotionalAds.isActive, true), or(isNull(promotionalAds.endAt), gte(promotionalAds.endAt, now))));
      return rows;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; getActivePromotionalAds returning empty list');
        return [];
      }
      throw err;
    }
  }

  // Return all promotions (active + inactive) for admin listing; resilient if table missing
  async getAllPromotionalAds(): Promise<any[]> {
    try {
      const rows = await db.select().from(promotionalAds).orderBy(desc(promotionalAds.createdAt));
      return rows;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; getAllPromotionalAds returning empty list');
        return [];
      }
      throw err;
    }
  }

  async expirePromotionalAds() {
    const now = new Date();
    try {
      await db.update(promotionalAds).set({ isActive: false, updatedAt: new Date() }).where(and(eq(promotionalAds.isActive, true), isNotNull(promotionalAds.endAt), lte(promotionalAds.endAt, now)));
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; expirePromotionalAds no-op');
        return;
      }
      throw err;
    }
  }

  async expirePromotionById(id: string) {
    try {
      await db.update(promotionalAds).set({ isActive: false, updatedAt: new Date() }).where(eq(promotionalAds.id, id));
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        console.warn('[STORAGE] promotional_ads table missing; expirePromotionById no-op');
        return;
      }
      throw err;
    }
  }

  // Check if promotions table exists in the database
  async promotionsTableExists(): Promise<boolean> {
    try {
      // Try a harmless query to check table presence
      const rows = await db.select().from(promotionalAds).limit(1);
      return true;
    } catch (err: any) {
      const msg = err?.message || String(err);
      if (msg.includes('relation "promotional_ads"') || msg.includes('does not exist')) {
        return false;
      }
      throw err;
    }
  }

  // Cart operations
  async addToCart(userId: string, productId: string, quantity: number, variantId?: string, selectedColor?: string, selectedSize?: string, selectedImageIndex?: number): Promise<Cart> {
    // FIXED: Different images from same product should be separate cart items
    // Each combination of product + variant + color + size + imageIndex is unique
    const imageIdx = selectedImageIndex ?? 0;
    
    const existing = await db.select().from(cart)
      .where(and(
        eq(cart.userId, userId), 
        eq(cart.productId, productId),
        variantId ? eq(cart.variantId, variantId) : sql`${cart.variantId} IS NULL`,
        selectedColor ? eq(cart.selectedColor, selectedColor) : sql`${cart.selectedColor} IS NULL`,
        selectedSize ? eq(cart.selectedSize, selectedSize) : sql`${cart.selectedSize} IS NULL`,
        eq(cart.selectedImageIndex, imageIdx)
      ))
      .limit(1);

    if (existing.length > 0) {
      // Exact match - update quantity and ensure image index is preserved
      const [updated] = await db.update(cart)
        .set({ 
          quantity: existing[0].quantity + quantity,
          selectedImageIndex: imageIdx,
          updatedAt: new Date() 
        })
        .where(eq(cart.id, existing[0].id))
        .returning();
      return updated;
    }

    // New unique combination - create separate cart item
    const [newItem] = await db.insert(cart).values({ 
      userId, 
      productId, 
      quantity,
      variantId,
      selectedColor,
      selectedSize,
      selectedImageIndex: imageIdx
    }).returning();
    return newItem;
  }

  async getCart(userId: string): Promise<Array<{ id: string; productId: string; productName: string; productImage: string; quantity: number; price: string; variantId: string | null; selectedColor: string | null; selectedSize: string | null; selectedImageIndex: number | null }>> {
    const items = await db
      .select({
        id: cart.id,
        productId: cart.productId,
        productName: products.name,
        productImages: products.images,
        quantity: cart.quantity,
        price: products.price,
        variantId: cart.variantId,
        selectedColor: cart.selectedColor,
        selectedSize: cart.selectedSize,
        selectedImageIndex: cart.selectedImageIndex,
      })
      .from(cart)
      .leftJoin(products, eq(cart.productId, products.id))
      .where(eq(cart.userId, userId))
      .orderBy(desc(cart.createdAt));
    
    return items.map(item => {
      const imageIndex = item.selectedImageIndex ?? 0;
      const productImage = item.productImages && Array.isArray(item.productImages) && item.productImages.length > imageIndex
        ? item.productImages[imageIndex]
        : (item.productImages && Array.isArray(item.productImages) && item.productImages.length > 0 ? item.productImages[0] : "");
      
      return {
        id: item.id,
        productId: item.productId,
        productName: item.productName || "Unknown Product",
        productImage,
        quantity: item.quantity,
        price: item.price || "0",
        variantId: item.variantId,
        selectedColor: item.selectedColor,
        selectedSize: item.selectedSize,
        selectedImageIndex: item.selectedImageIndex
      };
    });
  }

  async updateCartItem(id: string, quantity: number): Promise<Cart | undefined> {
    if (quantity <= 0) {
      await db.delete(cart).where(eq(cart.id, id));
      return undefined;
    }
    const [updated] = await db.update(cart)
      .set({ quantity, updatedAt: new Date() })
      .where(eq(cart.id, id))
      .returning();
    return updated;
  }

  async removeFromCart(id: string): Promise<boolean> {
    await db.delete(cart).where(eq(cart.id, id));
    return true;
  }

  async clearCart(userId: string): Promise<void> {
    await db.delete(cart).where(eq(cart.userId, userId));
  }

  // Wishlist operations
  async addToWishlist(userId: string, productId: string): Promise<Wishlist> {
    const existing = await db.select().from(wishlist)
      .where(and(eq(wishlist.userId, userId), eq(wishlist.productId, productId)))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const [newItem] = await db.insert(wishlist).values({ userId, productId }).returning();
    return newItem;
  }

  async getWishlist(userId: string): Promise<Wishlist[]> {
    return db.select().from(wishlist).where(eq(wishlist.userId, userId)).orderBy(desc(wishlist.createdAt));
  }

  async removeFromWishlist(userId: string, productId: string): Promise<boolean> {
    const result = await db.delete(wishlist)
      .where(and(eq(wishlist.userId, userId), eq(wishlist.productId, productId)));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Review operations
  async createReview(review: InsertReview & { userId: string }): Promise<Review> {
    const [newReview] = await db.insert(reviews).values(review).returning();
    return newReview;
  }

  async getProductReviews(productId: string): Promise<Array<Review & { userName: string }>> {
    const result = await db.select({
      id: reviews.id,
      productId: reviews.productId,
      userId: reviews.userId,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      userName: users.name,
    })
      .from(reviews)
      .leftJoin(users, eq(reviews.userId, users.id))
      .where(eq(reviews.productId, productId))
      .orderBy(desc(reviews.createdAt));
    return result as Array<Review & { userName: string }>;
  }

  async createRiderReview(review: InsertRiderReview & { userId: string }): Promise<RiderReview> {
    const [newReview] = await db.insert(riderReviews).values(review).returning();
    return newReview;
  }

  async getRiderReviews(riderId: string): Promise<Array<RiderReview & { userName: string }>> {
    const result = await db.select({
      id: riderReviews.id,
      riderId: riderReviews.riderId,
      userId: riderReviews.userId,
      orderId: riderReviews.orderId,
      rating: riderReviews.rating,
      comment: riderReviews.comment,
      createdAt: riderReviews.createdAt,
      userName: users.name,
    })
      .from(riderReviews)
      .leftJoin(users, eq(riderReviews.userId, users.id))
      .where(eq(riderReviews.riderId, riderId))
      .orderBy(desc(riderReviews.createdAt));
    return result as Array<RiderReview & { userName: string }>;
  }

  async getRiderAverageRating(riderId: string): Promise<number> {
    const result = await db.select({
      avgRating: sql<number>`avg(${riderReviews.rating})::float`,
    })
      .from(riderReviews)
      .where(eq(riderReviews.riderId, riderId));
    return result[0]?.avgRating || 0;
  }

  async addSellerReply(reviewId: string, reply: string): Promise<Review | undefined> {
    const [updated] = await db.update(reviews)
      .set({ sellerReply: reply, sellerReplyAt: new Date() })
      .where(eq(reviews.id, reviewId))
      .returning();
    return updated;
  }

  async verifyPurchaseForReview(userId: string, productId: string): Promise<{ verified: boolean; orderId?: string }> {
    const result = await db.select()
      .from(orders)
      .innerJoin(orderItems, eq(orders.id, orderItems.orderId))
      .where(
        and(
          eq(orders.buyerId, userId),
          eq(orderItems.productId, productId),
          eq(orders.status, "delivered")
        )
      )
      .limit(1);
    
    if (result.length > 0) {
      return { verified: true, orderId: result[0].orders.id };
    }
    return { verified: false };
  }

  // Notification operations
  async createNotification(notification: InsertNotification): Promise<Notification> {
    const [newNotification] = await db.insert(notifications).values(notification).returning();
    return newNotification;
  }

  async getNotificationsByUser(userId: string, limit: number = 50): Promise<Notification[]> {
    return db.select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  }

  async getUnreadNotificationCount(userId: string): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(
        eq(notifications.userId, userId),
        eq(notifications.isRead, false)
      ));
    return result[0]?.count || 0;
  }

  async markNotificationAsRead(notificationId: string): Promise<Notification | undefined> {
    const [updated] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, notificationId))
      .returning();
    return updated;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async deleteNotification(notificationId: string, userId: string): Promise<boolean> {
    const result = await db.delete(notifications)
      .where(and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId)
      ))
      .returning();
    return result.length > 0;
  }

  // Product Variant operations
  async getProductVariants(productId: string): Promise<ProductVariant[]> {
    return await db.select().from(productVariants).where(eq(productVariants.productId, productId));
  }

  async createProductVariant(variant: InsertProductVariant): Promise<ProductVariant> {
    const [newVariant] = await db.insert(productVariants).values(variant).returning();
    return newVariant;
  }

  async updateProductVariant(variantId: string, updates: Partial<InsertProductVariant>): Promise<ProductVariant> {
    const [updatedVariant] = await db
      .update(productVariants)
      .set(updates)
      .where(eq(productVariants.id, variantId))
      .returning();
    return updatedVariant;
  }

  async deleteProductVariant(variantId: string): Promise<void> {
    await db.delete(productVariants).where(eq(productVariants.id, variantId));
  }

  // Hero Banner operations
  async getHeroBanners(storeMode?: string): Promise<HeroBanner[]> {
    if (storeMode && storeMode !== 'both') {
      return await db.select().from(heroBanners)
        .where(and(
          eq(heroBanners.isActive, true),
          or(
            eq(heroBanners.storeMode, storeMode as any),
            eq(heroBanners.storeMode, 'both')
          )
        ))
        .orderBy(heroBanners.displayOrder);
    }
    return await db.select().from(heroBanners)
      .where(eq(heroBanners.isActive, true))
      .orderBy(heroBanners.displayOrder);
  }
  
  async getAllHeroBanners(): Promise<HeroBanner[]> {
    return await db.select().from(heroBanners)
      .orderBy(heroBanners.displayOrder);
  }
  
  async getHeroBanner(id: string): Promise<HeroBanner | undefined> {
    const [banner] = await db.select().from(heroBanners).where(eq(heroBanners.id, id));
    return banner;
  }
  
  async createHeroBanner(banner: InsertHeroBanner): Promise<HeroBanner> {
    const [newBanner] = await db.insert(heroBanners).values(banner).returning();
    return newBanner;
  }
  
  async updateHeroBanner(id: string, data: Partial<HeroBanner>): Promise<HeroBanner | undefined> {
    const [updated] = await db.update(heroBanners)
      .set(data)
      .where(eq(heroBanners.id, id))
      .returning();
    return updated;
  }
  
  async deleteHeroBanner(id: string): Promise<boolean> {
    const result = await db.delete(heroBanners).where(eq(heroBanners.id, id)).returning();
    return result.length > 0;
  }

  // Delivery Tracking operations
  async createDeliveryTracking(data: InsertDeliveryTracking): Promise<DeliveryTracking> {
    const [tracking] = await db.insert(deliveryTracking).values(data).returning();
    return tracking;
  }

  async getLatestDeliveryLocation(orderId: string): Promise<DeliveryTracking | undefined> {
    const result = await db.select()
      .from(deliveryTracking)
      .where(eq(deliveryTracking.orderId, orderId))
      .orderBy(desc(deliveryTracking.timestamp))
      .limit(1);
    return result[0];
  }

  async getDeliveryTrackingHistory(orderId: string): Promise<DeliveryTracking[]> {
    return db.select()
      .from(deliveryTracking)
      .where(eq(deliveryTracking.orderId, orderId))
      .orderBy(desc(deliveryTracking.timestamp));
  }

  // Coupon operations
  async createCoupon(coupon: InsertCoupon & { sellerId: string }): Promise<Coupon> {
    const [newCoupon] = await db.insert(coupons).values({
      ...coupon,
      code: coupon.code.toUpperCase(),
    }).returning();
    return newCoupon;
  }

  async getCoupon(id: string): Promise<Coupon | undefined> {
    const result = await db.select().from(coupons).where(eq(coupons.id, id)).limit(1);
    return result[0];
  }

  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    const result = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase())).limit(1);
    return result[0];
  }

  async getCouponsBySeller(sellerId: string): Promise<Coupon[]> {
    return db.select().from(coupons).where(eq(coupons.sellerId, sellerId)).orderBy(desc(coupons.createdAt));
  }

  async updateCoupon(id: string, data: Partial<Coupon>): Promise<Coupon | undefined> {
    const updateData = { ...data };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    const result = await db.update(coupons).set(updateData).where(eq(coupons.id, id)).returning();
    return result[0];
  }

  async deleteCoupon(id: string): Promise<boolean> {
    const result = await db.delete(coupons).where(eq(coupons.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async validateCoupon(code: string, sellerId: string, orderTotal: number): Promise<{ valid: boolean; message?: string; coupon?: Coupon; discountAmount?: string }> {
    const coupon = await this.getCouponByCode(code);
    
    if (!coupon) {
      return { valid: false, message: "Invalid coupon code" };
    }

    if (!coupon.isActive) {
      return { valid: false, message: "This coupon is no longer active" };
    }

    if (coupon.sellerId !== sellerId) {
      return { valid: false, message: "This coupon is not valid for this seller" };
    }

    if (coupon.expiryDate && new Date(coupon.expiryDate) < new Date()) {
      return { valid: false, message: "This coupon has expired" };
    }

    if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
      return { valid: false, message: "This coupon has reached its usage limit" };
    }

    const minimumPurchase = parseFloat(coupon.minimumPurchase || "0");
    if (orderTotal < minimumPurchase) {
      return { valid: false, message: `Minimum purchase of ${minimumPurchase} required to use this coupon` };
    }

    // Calculate discount amount
    let discountAmount = 0;
    if (coupon.discountType === "percentage") {
      discountAmount = (orderTotal * parseFloat(coupon.discountValue)) / 100;
    } else {
      discountAmount = parseFloat(coupon.discountValue);
    }

    // Ensure discount doesn't exceed order total
    discountAmount = Math.min(discountAmount, orderTotal);

    return { valid: true, coupon, discountAmount: discountAmount.toFixed(2) };
  }

  // Analytics
  async getAnalytics(userId?: string, role?: string): Promise<any> {
    // Basic analytics - can be expanded
    const result: any = {};
    
    if (role === "admin" || role === "super_admin" || !userId) {
      // Only count paid/completed orders (critical production fix)
      const paidOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(eq(orders.paymentStatus, "completed"));
      
      const totalRevenue = await db.select({ sum: sql<number>`sum(${orders.total})` })
        .from(orders)
        .where(eq(orders.paymentStatus, "completed"));
      
      const totalUsers = await db.select({ count: sql<number>`count(*)` }).from(users);
      const totalProducts = await db.select({ count: sql<number>`count(*)` }).from(products);
      
      result.totalOrders = Number(paidOrders[0]?.count ?? 0);
      result.paidOrders = Number(paidOrders[0]?.count ?? 0);
      result.totalRevenue = Number(totalRevenue[0]?.sum ?? 0);
      result.totalUsers = Number(totalUsers[0]?.count ?? 0);
      result.totalProducts = Number(totalProducts[0]?.count ?? 0);
    } else if (role === "seller") {
      // Only count paid orders for sellers (critical production fix)
      const paidSellerOrders = await db.select({ count: sql<number>`count(*)` })
        .from(orders)
        .where(and(
          eq(orders.sellerId, userId),
          eq(orders.paymentStatus, "completed")
        ));
      
      const sellerRevenue = await db.select({ sum: sql<number>`sum(${orders.total})` })
        .from(orders)
        .where(and(
          eq(orders.sellerId, userId),
          eq(orders.paymentStatus, "completed")
        ));
      
      result.totalOrders = Number(paidSellerOrders[0]?.count ?? 0);
      result.paidOrders = Number(paidSellerOrders[0]?.count ?? 0);
      result.totalRevenue = Number(sellerRevenue[0]?.sum ?? 0);
    }
    
    return result;
  }

  // Banner Collection operations
  async createBannerCollection(collection: InsertBannerCollection): Promise<BannerCollection> {
    const [newCollection] = await db.insert(bannerCollections).values(collection).returning();
    return newCollection;
  }

  async getBannerCollection(id: string): Promise<BannerCollection | undefined> {
    const result = await db.select().from(bannerCollections).where(eq(bannerCollections.id, id)).limit(1);
    return result[0];
  }

  async getBannerCollections(): Promise<BannerCollection[]> {
    return db.select().from(bannerCollections).orderBy(desc(bannerCollections.createdAt));
  }

  async updateBannerCollection(id: string, data: Partial<BannerCollection>): Promise<BannerCollection | undefined> {
    const [updated] = await db.update(bannerCollections).set(data).where(eq(bannerCollections.id, id)).returning();
    return updated;
  }

  async deleteBannerCollection(id: string): Promise<boolean> {
    await db.delete(bannerCollections).where(eq(bannerCollections.id, id));
    return true;
  }

  // Marketplace Banner operations
  async createMarketplaceBanner(banner: InsertMarketplaceBanner): Promise<MarketplaceBanner> {
    const [newBanner] = await db.insert(marketplaceBanners).values(banner).returning();
    return newBanner;
  }

  async getMarketplaceBanner(id: string): Promise<MarketplaceBanner | undefined> {
    const result = await db.select().from(marketplaceBanners).where(eq(marketplaceBanners.id, id)).limit(1);
    return result[0];
  }

  async getMarketplaceBanners(collectionId?: string): Promise<MarketplaceBanner[]> {
    if (collectionId) {
      return db.select().from(marketplaceBanners)
        .where(eq(marketplaceBanners.collectionId, collectionId))
        .orderBy(marketplaceBanners.displayOrder, desc(marketplaceBanners.createdAt));
    }
    return db.select().from(marketplaceBanners)
      .orderBy(marketplaceBanners.displayOrder, desc(marketplaceBanners.createdAt));
  }

  async getActiveMarketplaceBanners(): Promise<MarketplaceBanner[]> {
    const now = new Date();
    return db.select().from(marketplaceBanners)
      .where(
        and(
          eq(marketplaceBanners.isActive, true),
          or(
            isNull(marketplaceBanners.startAt),
            lte(marketplaceBanners.startAt, now)
          ),
          or(
            isNull(marketplaceBanners.endAt),
            gte(marketplaceBanners.endAt, now)
          )
        )
      )
      .orderBy(marketplaceBanners.displayOrder);
  }

  async getActiveFooterPages(): Promise<FooterPage[]> {
    return db.select().from(footerPages)
      .where(eq(footerPages.isActive, true))
      .orderBy(footerPages.group, footerPages.displayOrder);
  }

  async getAllFooterPages(): Promise<FooterPage[]> {
    return db.select().from(footerPages)
      .orderBy(footerPages.group, footerPages.displayOrder);
  }

  async createFooterPage(data: InsertFooterPage): Promise<FooterPage> {
    const [created] = await db.insert(footerPages).values(data).returning();
    return created;
  }

  async updateFooterPage(id: string, data: Partial<FooterPage>): Promise<FooterPage | undefined> {
    const [updated] = await db.update(footerPages).set(data).where(eq(footerPages.id, id)).returning();
    return updated;
  }

  async deleteFooterPage(id: string): Promise<boolean> {
    await db.delete(footerPages).where(eq(footerPages.id, id));
    return true;
  }

  async updateMarketplaceBanner(id: string, data: Partial<MarketplaceBanner>): Promise<MarketplaceBanner | undefined> {
    const [updated] = await db.update(marketplaceBanners).set(data).where(eq(marketplaceBanners.id, id)).returning();
    return updated;
  }

  async deleteMarketplaceBanner(id: string): Promise<boolean> {
    await db.delete(marketplaceBanners).where(eq(marketplaceBanners.id, id));
    return true;
  }

  async reorderMarketplaceBanners(bannerIds: string[]): Promise<void> {
    for (let i = 0; i < bannerIds.length; i++) {
      await db.update(marketplaceBanners)
        .set({ displayOrder: i })
        .where(eq(marketplaceBanners.id, bannerIds[i]));
    }
  }

  // Multi-vendor homepage data
  async getApprovedSellers(): Promise<User[]> {
    return db.select().from(users)
      .where(
        and(
          eq(users.role, "seller"),
          eq(users.isApproved, true),
          eq(users.isActive, true)
        )
      )
      .orderBy(desc(users.createdAt));
  }

  async getFeaturedProducts(limit: number = 12, sellerId?: string): Promise<Product[]> {
    const conditions = [eq(products.isActive, true)];
    if (sellerId) {
      conditions.push(eq(products.sellerId, sellerId));
    }
    return db.select().from(products)
      .where(and(...conditions))
      .orderBy(desc(products.ratings), desc(products.createdAt))
      .limit(limit);
  }


  // Category Fields operations
  async createCategoryField(field: any): Promise<CategoryField> {
    const [newField] = await db.insert(categoryFields).values(field).returning();
    return newField;
  }

  async getCategoryFields(categoryName?: string): Promise<CategoryField[]> {
    if (categoryName) {
      return await db.select()
        .from(categoryFields)
        .where(eq(categoryFields.categoryName, categoryName))
        .orderBy(categoryFields.displayOrder);
    }
    return await db.select().from(categoryFields).orderBy(categoryFields.categoryName, categoryFields.displayOrder);
  }

  async updateCategoryField(id: string, data: any): Promise<CategoryField | undefined> {
    const [updated] = await db.update(categoryFields)
      .set(data)
      .where(eq(categoryFields.id, id))
      .returning();
    return updated;
  }

  async deleteCategoryField(id: string): Promise<boolean> {
    const result = await db.delete(categoryFields).where(eq(categoryFields.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Store operations
  async createStore(store: any): Promise<Store> {
    const [newStore] = await db.insert(stores).values(store).returning();
    return newStore;
  }

  // Centralized idempotent store creation/retrieval for sellers
  // Returns: Store object on success, throws error with specific message on failure
  async ensureStoreForSeller(sellerId: string, options?: { requireApproval?: boolean }): Promise<Store> {
    const requireApproval = options?.requireApproval ?? false;
    
    // First, check if store already exists
    const existingStore = await this.getStoreByPrimarySeller(sellerId);
    if (existingStore) {
      console.log(`[ensureStoreForSeller] Store ${existingStore.id} already exists for seller ${sellerId}`);
      return existingStore;
    }

    // Get seller details
    const seller = await this.getUser(sellerId);
    if (!seller) {
      throw new Error(`Seller account not found`);
    }

    // Check seller role
    if (seller.role !== "seller") {
      throw new Error(`User is not a seller (role: ${seller.role})`);
    }

    // Optionally check if seller is approved (used by product creation, my-store endpoints)
    if (requireApproval && !seller.isApproved) {
      throw new Error(`Seller account is not approved yet. Please wait for admin approval.`);
    }

    // Validate required fields for store creation
    if (!seller.storeType) {
      throw new Error(`Missing required store type. Please ensure the seller has selected a store type during registration.`);
    }

    // Create store with seller's profile data
    const storeData = {
      primarySellerId: sellerId,
      name: seller.storeName || `${seller.name}'s Store`,
      description: seller.storeDescription || `Welcome to ${seller.name}'s store`,
      logo: seller.storeBanner || undefined,
      banner: seller.storeBanner || undefined,
      storeType: seller.storeType,
      storeTypeMetadata: seller.storeTypeMetadata,
      isActive: true,
      isApproved: true
    };

    console.log(`[ensureStoreForSeller] Creating new store for seller ${sellerId}:`, {
      name: storeData.name,
      storeType: storeData.storeType,
      hasLogo: !!storeData.logo,
      sellerApproved: seller.isApproved
    });

    try {
      const newStore = await this.createStore(storeData);
      console.log(`[ensureStoreForSeller] Successfully created store ${newStore.id} for seller ${sellerId}`);
      return newStore;
    } catch (error: any) {
      console.error(`[ensureStoreForSeller] Database error creating store for seller ${sellerId}:`, {
        error: error.message,
        stack: error.stack
      });
      throw new Error(`Failed to create store: ${error.message}`);
    }
  }

  async getStore(id: string): Promise<Store | undefined> {
    const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
    return result[0];
  }

  async getStores(filters?: { isActive?: boolean; isApproved?: boolean }): Promise<Store[]> {
    let query = db.select().from(stores);
    
    const conditions = [];
    if (filters?.isActive !== undefined) {
      conditions.push(eq(stores.isActive, filters.isActive));
    }
    if (filters?.isApproved !== undefined) {
      conditions.push(eq(stores.isApproved, filters.isApproved));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(stores.createdAt));
  }

  async getStoreByPrimarySeller(sellerId: string): Promise<Store | undefined> {
    const result = await db.select()
      .from(stores)
      .where(eq(stores.primarySellerId, sellerId))
      .limit(1);
    return result[0];
  }

  async updateStore(id: string, data: any): Promise<Store | undefined> {
    const [updated] = await db.update(stores)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(stores.id, id))
      .returning();
    return updated;
  }

  async deleteStore(id: string): Promise<boolean> {
    const result = await db.delete(stores).where(eq(stores.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Category operations
  async createCategory(category: any): Promise<Category> {
    const [newCategory] = await db.insert(categories).values(category).returning();
    return newCategory;
  }

  async getCategory(id: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.id, id)).limit(1);
    return result[0];
  }

  async getCategoryBySlug(slug: string): Promise<Category | undefined> {
    const result = await db.select().from(categories).where(eq(categories.slug, slug)).limit(1);
    return result[0];
  }

  async getCategories(filters?: { isActive?: boolean }): Promise<Category[]> {
    let query = db.select().from(categories);
    
    if (filters?.isActive !== undefined) {
      query = query.where(eq(categories.isActive, filters.isActive)) as any;
    }

    return query.orderBy(categories.displayOrder, categories.name);
  }

  async updateCategory(id: string, data: any): Promise<Category | undefined> {
    const [updated] = await db.update(categories)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(categories.id, id))
      .returning();
    return updated;
  }

  async deleteCategory(id: string): Promise<boolean> {
    const result = await db.delete(categories).where(eq(categories.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  async getCategoriesByStore(storeId: string): Promise<Category[]> {
    const categoriesWithProducts = await db
      .selectDistinct({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        image: categories.image,
        storeTypes: categories.storeTypes,
        isActive: categories.isActive,
        displayOrder: categories.displayOrder,
        createdAt: categories.createdAt,
        updatedAt: categories.updatedAt,
      })
      .from(products)
      .innerJoin(categories, eq(products.categoryId, categories.id))
      .where(
        and(
          eq(products.storeId, storeId),
          eq(categories.isActive, true)
        )
      )
      .orderBy(categories.displayOrder, categories.name);

    return categoriesWithProducts;
  }

  // Media Library operations
  async createMediaLibraryItem(data: InsertMediaLibrary): Promise<MediaLibrary> {
    const [newItem] = await db.insert(mediaLibrary).values(data).returning();
    return newItem;
  }

  async getMediaLibraryItems(filters?: { category?: string; uploaderRole?: string; uploaderId?: string }): Promise<MediaLibrary[]> {
    let query = db.select().from(mediaLibrary);
    
    const conditions = [];
    if (filters?.category) {
      conditions.push(eq(mediaLibrary.category, filters.category as any));
    }
    if (filters?.uploaderRole) {
      conditions.push(eq(mediaLibrary.uploaderRole, filters.uploaderRole as any));
    }
    if (filters?.uploaderId) {
      conditions.push(eq(mediaLibrary.uploaderId, filters.uploaderId));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    return query.orderBy(desc(mediaLibrary.createdAt));
  }

  async deleteMediaLibraryItem(id: string): Promise<boolean> {
    const result = await db.delete(mediaLibrary).where(eq(mediaLibrary.id, id));
    return result.rowCount !== null && result.rowCount > 0;
  }

  // Role Features operations
  async getRoleFeatures(role?: string): Promise<any[]> {
    let query = db.select().from(roleFeatures);
    
    if (role) {
      query = query.where(eq(roleFeatures.role, role as any)) as any;
    }
    
    return query;
  }

  async updateRoleFeatures(role: string, features: Record<string, boolean>, updatedBy: string): Promise<any> {
    const existing = await db.select().from(roleFeatures).where(eq(roleFeatures.role, role as any)).limit(1);
    
    if (existing.length > 0) {
      const [updated] = await db.update(roleFeatures)
        .set({ features, updatedAt: new Date(), updatedBy })
        .where(eq(roleFeatures.role, role as any))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(roleFeatures)
        .values({ role: role as any, features, updatedBy })
        .returning();
      return created;
    }
  }
}

export const storage = new DbStorage();
