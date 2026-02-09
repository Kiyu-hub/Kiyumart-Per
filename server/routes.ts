import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { db } from "../db";
import { users, cart, wishlist, chatMessages, notifications, orders, products, stores, promotionalAds, commissions, platformSettings as platformSettingsTable, footerPages as footerPagesTable } from "@shared/schema";
import { eq, or, isNotNull, and, desc, sql } from "drizzle-orm";
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  verifyToken,
  requireAuth, 
  requireRole,
  type AuthRequest 
} from "./auth";
import { uploadToCloudinary, uploadWithMetadata, uploadWith4KEnhancement } from "./cloudinary";
import multer from "multer";
import sharp from "sharp";
import { insertUserSchema, insertProductSchema, insertDeliveryZoneSchema, insertOrderSchema, insertWishlistSchema, insertReviewSchema, insertRiderReviewSchema, insertBannerCollectionSchema, insertMarketplaceBannerSchema, insertFooterPageSchema, vehicleInfoSchema, type User } from "@shared/schema";
import { getStoreTypeSchema, type StoreType, STORE_TYPES } from "@shared/storeTypes";
import buildPaystackInitializePayload from './paystackUtils';
// WhatsApp-style messaging services
import { presenceService } from "./services/presenceService";
import { messageDeliveryService } from "./services/messageDeliveryService";
import { chatPermissionService } from "./services/chatPermissionService";
import { jitsiMeetService } from "./services/jitsiMeetService";

const upload = multer({ storage: multer.memoryStorage() });

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // ============ Socket.IO Authentication Middleware ============
  io.use((socket, next) => {
    try {
      // Extract token from httpOnly cookie or auth object
      let token: string | undefined;
      
      // Try to parse token from cookie header
      const cookieHeader = socket.handshake.headers.cookie;
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [key, value] = cookie.trim().split('=');
          acc[key] = value;
          return acc;
        }, {} as Record<string, string>);
        token = cookies['token'];
      }
      
      // Fallback to auth object (for mobile/SSR clients)
      if (!token && socket.handshake.auth?.token) {
        token = socket.handshake.auth.token;
      }
      
      if (!token) {
        return next(new Error("Authentication required"));
      }
      
      // Verify JWT token
      const decoded = verifyToken(token);
      if (!decoded) {
        return next(new Error("Invalid or expired token"));
      }
      
      // Bind authenticated user to socket
      socket.data.userId = decoded.id;
      socket.data.userEmail = decoded.email;
      socket.data.userRole = decoded.role;
      
      // Auto-join user's personal room for targeted messages
      socket.join(decoded.id);
      
      console.log(`✅ Socket authenticated: ${decoded.email} (${decoded.id})`);
      next();
    } catch (error) {
      console.error("Socket.IO authentication error:", error);
      next(new Error("Authentication failed"));
    }
  });

  // ============ Authentication Routes ============
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const validatedData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(validatedData.email);
      
      if (existingUser) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const requestedRole = validatedData.role || "buyer";
      if (requestedRole === "admin") {
        return res.status(403).json({ error: "Cannot self-register as admin" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      
      const userData: any = {
        ...validatedData,
        role: requestedRole,
        password: hashedPassword,
        isApproved: requestedRole === "seller" || requestedRole === "rider" ? false : true,
      };
      
      const user = await storage.createUser(userData);

      // Send welcome message from KiyuMart Team
      try {
        // Find a super_admin to send the welcome message from
        const superAdmins = await storage.getUsersByRole("super_admin");
        const systemSender = superAdmins.length > 0 ? superAdmins[0] : null;
        
        // Get platform name from settings
        const platformSettingsArr = await db.select().from(platformSettingsTable).limit(1);
        const platformName = platformSettingsArr[0]?.platformName || "KiyuMart";
        
        if (systemSender) {
          const displayName = user.name || user.email?.split('@')[0] || 'there';
          const welcomeMessage = `Hi ${displayName}! 👋\n\nWelcome to ${platformName}! 🎉\n\nWe're absolutely thrilled to have you join our growing community. Whether you're here to discover amazing products, find great deals, or simply explore what we have to offer — you've come to the right place.\n\nHere's what you can do to get started:\n• 🛍️ Browse our wide selection of quality products\n• ❤️ Save items to your wishlist for later\n• 🔔 Turn on notifications so you never miss a deal\n• 💬 Message us anytime — we're here to help!\n\nIf you ever need assistance, our support team is just a message away. We're committed to making your experience seamless and enjoyable.\n\nHappy shopping, ${displayName}!\nWith love,\n— The ${platformName} Team 💚`;
          
          await storage.createMessage({
            senderId: systemSender.id,
            receiverId: user.id,
            message: welcomeMessage,
            messageType: "text",
          });
          
          // Create notification with FULL welcome message so dialog shows actual content
          await storage.createNotification({
            userId: user.id,
            type: "message",
            title: `Welcome to ${platformName}, ${displayName}! 🎉`,
            message: welcomeMessage,
            metadata: { messageId: "welcome", senderId: systemSender.id } as any,
          });
          
          // Emit real-time notification
          io.to(user.id).emit("notification", {
            type: "message",
            title: `Welcome to ${platformName}, ${displayName}! 🎉`,
            message: welcomeMessage,
            data: { senderId: systemSender.id },
          });
        }
      } catch (welcomeError) {
        console.error("Failed to send welcome message:", welcomeError);
        // Don't fail signup if welcome message fails
      }

      // Notify admins about new seller/rider registration
      if (requestedRole === "seller" || requestedRole === "rider") {
        await notifyAdmins(
          "user",
          `New ${requestedRole} registration`,
          `${user.name} (${user.email}) has registered as a ${requestedRole}`,
          { userId: user.id, role: requestedRole }
        );
      }

      const token = generateToken(user);
      const { password, ...userWithoutPassword } = user;

      // Set token as httpOnly cookie for security
      // Use sameSite: "none" for cross-origin requests (Netlify frontend -> Render backend)
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = req.body;
      
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      if (!user.isActive) {
        return res.status(403).json({ error: "Account is inactive" });
      }

      if (!user.isApproved && (user.role === "seller" || user.role === "rider")) {
        return res.status(403).json({ error: "Account pending approval" });
      }

      const token = generateToken(user);
      const { password: _, ...userWithoutPassword } = user;

      // Set token as httpOnly cookie for security
      // Use sameSite: "none" for cross-origin requests (Netlify frontend -> Render backend)
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      res.json({ user: userWithoutPassword });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("token");
    res.json({ success: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: "Current and new passwords are required" });
      }

      // Server-side password validation
      if (newPassword.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
      }
      if (!/[A-Z]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
      }
      if (!/[a-z]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
      }
      if (!/[0-9]/.test(newPassword)) {
        return res.status(400).json({ error: "Password must contain at least one number" });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const isValidPassword = await comparePassword(currentPassword, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Current password is incorrect" });
      }

      const hashedPassword = await hashPassword(newPassword);
      await storage.updateUser(user.id, { password: hashedPassword });

      res.json({ success: true, message: "Password changed successfully" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Profile Routes ============
  app.get("/api/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...profile } = user;
      res.json(profile);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/profile", requireAuth, async (req: AuthRequest, res) => {
    try {
      // CRITICAL FIX: Added storeType and storeTypeMetadata to allow existing sellers to complete their profiles
      const allowedFields = ['name', 'username', 'phone', 'address', 'city', 'country', 'email', 'storeName', 'storeDescription', 'storeBanner', 'vehicleInfo', 'storeType', 'storeTypeMetadata'];
      const updateData: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      // Prevent updates if no valid fields provided
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      // Validate storeType if being updated (check field presence, not truthiness)
      if ('storeType' in updateData) {
        // CRITICAL: Reject empty, null, or invalid values
        if (!updateData.storeType || !STORE_TYPES.includes(updateData.storeType)) {
          return res.status(400).json({ error: "Invalid store type. Must be one of: " + STORE_TYPES.join(", ") });
        }
        
        // ONLY validate storeTypeMetadata if it's explicitly provided
        // Allow sellers to set storeType without metadata to unblock their dashboard access
        if (updateData.storeTypeMetadata !== undefined) {
          try {
            const storeTypeSchema = getStoreTypeSchema(updateData.storeType as StoreType);
            storeTypeSchema.parse(updateData.storeTypeMetadata);
          } catch (validationError: any) {
            const errors = validationError.errors?.map((e: any) => ({
              field: e.path.join('.'),
              message: e.message
            }));
            return res.status(400).json({ 
              error: "Invalid store type metadata", 
              details: errors 
            });
          }
        }
      }
      
      // Validate storeTypeMetadata if being updated without storeType
      if (updateData.storeTypeMetadata !== undefined && !updateData.storeType) {
        const currentUser = await storage.getUser(req.user!.id);
        if (currentUser?.storeType) {
          try {
            const storeTypeSchema = getStoreTypeSchema(currentUser.storeType as StoreType);
            storeTypeSchema.parse(updateData.storeTypeMetadata);
          } catch (validationError: any) {
            const errors = validationError.errors?.map((e: any) => ({
              field: e.path.join('.'),
              message: e.message
            }));
            return res.status(400).json({ 
              error: "Invalid store type metadata", 
              details: errors 
            });
          }
        } else {
          return res.status(400).json({ error: "Cannot update metadata without a store type set" });
        }
      }

      // Check if email is being changed and if it's already in use
      if (updateData.email) {
        const existingUser = await storage.getUserByEmail(updateData.email);
        if (existingUser && existingUser.id !== req.user!.id) {
          return res.status(400).json({ error: "Email already in use" });
        }
      }
      
      const updatedUser = await storage.updateUser(req.user!.id, updateData);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // CRITICAL: If seller updated storeType, propagate to their store record
      if (updateData.storeType && updatedUser.role === "seller") {
        try {
          const existingStore = await storage.getStoreByPrimarySeller(req.user!.id);
          if (existingStore) {
            await storage.updateStore(existingStore.id, {
              storeType: updateData.storeType,
              storeTypeMetadata: updateData.storeTypeMetadata || existingStore.storeTypeMetadata
            });
            console.log(`Updated store ${existingStore.id} with new storeType: ${updateData.storeType}`);
          }
        } catch (storeUpdateError: any) {
          console.error('Failed to update store storeType:', storeUpdateError);
          // Don't fail the profile update if store update fails
        }
      }

      const { password: _, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/profile/upload-image", requireAuth, upload.single("profileImage"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Validate file type (server-side)
      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed" });
      }

      // Validate file size (max 5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB in bytes
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size is 5MB" });
      }

      const imageUrl = await uploadToCloudinary(req.file.buffer, "kiyumart/profiles");

      const updatedUser = await storage.updateUser(req.user!.id, {
        profileImage: imageUrl,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ profileImage: imageUrl, user: userWithoutPassword });
    } catch (error: any) {
      console.error("Profile image upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload profile image" });
    }
  });

  // Generic image upload endpoint (for admins/sellers)
  // Public upload endpoint for registration (seller/rider Ghana cards, profile images)
  app.post("/api/upload/public", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed" });
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size is 10MB" });
      }

      const imageUrl = await uploadToCloudinary(req.file.buffer, "kiyumart/registration");
      res.json({ url: imageUrl });
    } catch (error: any) {
      console.error("Public image upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  });

  app.post("/api/upload/image", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Only JPEG, PNG, WEBP, and GIF images are allowed" });
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size is 10MB" });
      }

      const metadata = await sharp(req.file.buffer).metadata();
      const width = metadata.width || 0;
      const height = metadata.height || 0;
      
      const result = await uploadWith4KEnhancement(
        req.file.buffer, 
        "kiyumart/uploads", 
        width, 
        height
      );
      
      res.json({ 
        url: result.url, 
        width: result.width, 
        height: result.height,
        enhanced: result.enhanced 
      });
    } catch (error: any) {
      console.error("Image upload error:", error);
      
      if (error.message?.includes("4K enhancement failed") || 
          error.message?.includes("quality insufficient") ||
          error.message?.includes("resolution")) {
        return res.status(400).json({ error: error.message });
      }
      
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  });

  // Generic video upload endpoint (for admins/sellers)
  app.post("/api/upload/video", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file provided" });
      }

      const allowedMimeTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({ error: "Invalid file type. Only MP4, WEBM, and MOV videos are allowed" });
      }

      const maxSize = 30 * 1024 * 1024; // 30MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size is 30MB" });
      }

      const result = await uploadWithMetadata(req.file.buffer, "kiyumart/videos");
      
      // Check video duration if metadata is available (must be under 30 seconds)
      if (result.duration && result.duration >= 30) {
        return res.status(400).json({ 
          error: `Video is too long (${result.duration.toFixed(1)}s). Must be under 30 seconds` 
        });
      }

      res.json({ url: result.url, duration: result.duration });
    } catch (error: any) {
      console.error("Video upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload video" });
    }
  });

  // ============ User Management (Admin only) ============
  app.get("/api/users", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { role, isApproved, applicationStatus } = req.query;
      let users;
      
      if (role && role !== "all") {
        users = await storage.getUsersByRole(role as string);
      } else {
        // Get all users including admins
        const allRoles = ["admin", "buyer", "seller", "rider", "agent"];
        users = [];
        for (const r of allRoles) {
          const roleUsers = await storage.getUsersByRole(r);
          users.push(...roleUsers);
        }
      }
      
      // Apply additional filters
      if (isApproved !== undefined) {
        const isApprovedBool = isApproved === "true";
        users = users.filter(u => u.isApproved === isApprovedBool);
      }
      
      if (applicationStatus) {
        users = users.filter(u => u.applicationStatus === applicationStatus);
      }
      
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/users/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id/approve", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      // First, get the user without approving yet
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // CRITICAL: Validate role-specific requirements before approval
      if (user.role === "seller") {
        if (!user.storeType) {
          return res.status(400).json({ 
            error: "Cannot approve seller without store type",
            details: "The seller must have a store type set. Please ask them to update their profile or set it manually before approval."
          });
        }
        
        if (!STORE_TYPES.includes(user.storeType)) {
          return res.status(400).json({ 
            error: "Invalid store type",
            details: `Store type "${user.storeType}" is not valid. Valid types: ${STORE_TYPES.join(", ")}`
          });
        }
        
        // For sellers: Create store BEFORE approving to ensure atomicity
        try {
          // Use centralized helper (requireApproval=false allows creation before approval)
          await storage.ensureStoreForSeller(user.id, { requireApproval: false });
          console.log(`[Approval] Store ensured for seller ${user.id} before approval`);
        } catch (storeError: any) {
          console.error(`[Approval] CRITICAL: Failed to ensure store for seller ${user.id}:`, storeError.message);
          // Store creation failed - DO NOT approve user, return error so admin can retry
          return res.status(400).json({ 
            error: `Cannot approve seller: ${storeError.message}`,
            details: "Please ensure the seller has provided all required information (especially store type) before approval."
          });
        }
      }
      
      if (user.role === "rider") {
        if (!user.vehicleInfo || !user.vehicleInfo.type) {
          return res.status(400).json({ 
            error: "Cannot approve rider without vehicle information",
            details: "The rider must have vehicle type and details set. Please ask them to update their profile before approval."
          });
        }
      }
      
      // Now approve the user (store creation succeeded or not needed)
      const approvedUser = await storage.updateUser(req.params.id, { 
        isApproved: true,
        applicationStatus: "approved" as any,
        rejectionReason: null // Clear any previous rejection reason
      });
      if (!approvedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Send approval notification
      await storage.createNotification({
        userId: approvedUser.id,
        type: "system",
        title: `${user.role === "seller" ? "Seller" : "Rider"} Application Approved`,
        message: `Congratulations! Your ${user.role} application has been approved. You can now access your dashboard and start ${user.role === "seller" ? "selling products" : "accepting deliveries"}.`
      });
      
      // Emit Socket.IO event for real-time seller dashboard update
      if (user.role === "seller") {
        console.log(`[Socket.IO] Emitting seller-approved event for seller ${approvedUser.id}`);
        io.emit(`seller-approved:${approvedUser.id}`, {
          sellerId: approvedUser.id,
          timestamp: new Date().toISOString()
        });
      }
      
      const { password, ...userWithoutPassword } = approvedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Allow authenticated users to apply to become a seller or rider
  app.post('/api/users/apply', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { role } = req.body as { role?: string };
      if (!role || (role !== 'seller' && role !== 'rider')) {
        return res.status(400).json({ error: 'Invalid role. Must be "seller" or "rider"' });
      }

      const user = await storage.getUser(req.user!.id);
      if (!user) return res.status(404).json({ error: 'User not found' });

      if (user.role === role && user.isApproved) {
        return res.status(400).json({ error: `You are already an approved ${role}` });
      }

      if (user.applicationStatus === 'pending' && user.role === role) {
        return res.status(400).json({ error: `Your ${role} application is already pending` });
      }

      // Update user's role and mark application as pending
      const updated = await storage.updateUser(user.id, {
        role,
        isApproved: false,
        applicationStatus: 'pending' as any,
        rejectionReason: null,
      });

      if (!updated) return res.status(500).json({ error: 'Failed to submit application' });

      // Notify admins about new application
      try {
        await notifyAdmins('user', `New ${role} application`, `${updated.name} (${updated.email}) has applied to become a ${role}`, { userId: updated.id, role });
      } catch (notifyErr) {
        console.error('[APPLY] notifyAdmins failed', notifyErr);
      }

      // Notify applicant
      await storage.createNotification({
        userId: updated.id,
        type: 'system',
        title: `${role.charAt(0).toUpperCase() + role.slice(1)} Application Submitted`,
        message: `Your application to become a ${role} has been submitted. An admin will review and approve your application shortly.`
      });

      const { password, ...userWithoutPassword } = updated;
      res.json(userWithoutPassword);
    } catch (err: any) {
      console.error('Error submitting application:', err);
      res.status(400).json({ error: err.message });
    }
  });

  app.patch("/api/users/:id/reject", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { reason } = req.body;
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Only allow rejection of pending (unapproved) applications
      if (user.isApproved) {
        return res.status(400).json({ 
          error: "Cannot reject already approved applications. Use deactivate instead." 
        });
      }
      
      // Mark as rejected but keep active so user can see rejection and reapply
      const rejectedUser = await storage.updateUser(req.params.id, { 
        isApproved: false,
        isActive: true, // Explicitly keep account active
        applicationStatus: "rejected" as any,
        rejectionReason: reason || null
      });
      
      if (!rejectedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Send rejection notification
      await storage.createNotification({
        userId: rejectedUser.id,
        type: "system",
        title: `${user.role === "seller" ? "Seller" : "Rider"} Application Rejected`,
        message: reason 
          ? `Unfortunately, your ${user.role} application has been rejected. Reason: ${reason}` 
          : `Unfortunately, your ${user.role} application has been rejected. Please contact support for more information.`
      });
      
      console.log(`User ${user.id} (${user.role}) pending application rejected by admin`);
      const { password, ...userWithoutPassword } = rejectedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error rejecting user application:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id/status", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { isActive } = req.body;
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // If deactivating an approved seller, also deactivate their store
      if (!isActive && user.role === "seller" && user.isApproved) {
        const store = await storage.getStoreByPrimarySeller(req.params.id);
        if (store) {
          await storage.updateStore(store.id, { isActive: false, isApproved: false });
          console.log(`Deactivated store ${store.id} for seller ${req.params.id}`);
        }
      }
      
      // If reactivating an approved seller, also reactivate their store
      if (isActive && user.role === "seller" && user.isApproved) {
        const store = await storage.getStoreByPrimarySeller(req.params.id);
        if (store) {
          await storage.updateStore(store.id, { isActive: true, isApproved: true });
          console.log(`Reactivated store ${store.id} for seller ${req.params.id}`);
        }
      }
      
      const updatedUser = await storage.updateUser(req.params.id, { isActive });
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error updating user status:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/users", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      // Capture additional data before schema parsing
      const { storeName, storeDescription, storeBanner, storeType, vehicleType, vehicleColor, vehiclePlateNumber } = req.body;
      
      const validatedData = insertUserSchema.parse(req.body);
      const existingUser = await storage.getUserByEmail(validatedData.email);
      
      if (existingUser) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      
      // Build user data with role-specific fields
      const userData: any = {
        ...validatedData,
        password: hashedPassword,
        isApproved: true,
        applicationStatus: "approved", // Auto-approve manually created users
      };

      // Handle rider-specific fields - validate and coerce into vehicleInfo JSONB
      if (validatedData.role === "rider") {
        if (!vehicleType) {
          return res.status(400).json({ 
            error: "Vehicle type is required for rider accounts" 
          });
        }
        
        const vehiclePayload = {
          type: vehicleType,
          color: vehicleColor,
          plateNumber: vehiclePlateNumber,
        };
        
        const parsedVehicle = vehicleInfoSchema.safeParse(vehiclePayload);
        if (!parsedVehicle.success) {
          return res.status(400).json({ 
            error: "Invalid vehicle information",
            details: parsedVehicle.error.issues 
          });
        }
        
        userData.vehicleInfo = parsedVehicle.data;
      }

      // Handle seller-specific fields - ENFORCE storeType requirement
      if (validatedData.role === "seller") {
        if (!storeType) {
          return res.status(400).json({ 
            error: "Store type is required for seller accounts. Please select a store type to continue." 
          });
        }
        
        if (!STORE_TYPES.includes(storeType)) {
          return res.status(400).json({ error: "Invalid store type" });
        }
        
        userData.storeType = storeType;
        userData.storeName = storeName;
        userData.storeDescription = storeDescription;
        userData.storeBanner = storeBanner;
      }
      
      const user = await storage.createUser(userData);
      
      // Create store for seller with captured store data
      if (user.role === "seller") {
        try {
          const existingStore = await storage.getStoreByPrimarySeller(user.id);
          if (!existingStore) {
            const storeData = {
              primarySellerId: user.id,
              name: storeName || user.storeName || user.name + "'s Store",
              description: storeDescription || user.storeDescription || "",
              logo: storeBanner || user.storeBanner || "",
              banner: storeBanner || user.storeBanner || "",
              storeType: storeType || user.storeType,
              storeTypeMetadata: {},
              isActive: true,
              isApproved: true
            };
            
            console.log(`Creating store for new seller ${user.id}:`, {
              name: storeData.name,
              storeType: storeData.storeType
            });
            
            const newStore = await storage.createStore(storeData);
            console.log(`Successfully created store ${newStore.id} for seller ${user.id}`);
            
            // Initialize categories for this store type
            if (storeType) {
              try {
                const categories = await storage.getCategories();
                const relevantCategories = categories.filter(cat => 
                  cat.storeTypes && cat.storeTypes.includes(storeType)
                );
                
                if (relevantCategories.length === 0) {
                  console.warn(`No categories found for store type: ${storeType}. Seller may need manual category setup.`);
                } else {
                  console.log(`Found ${relevantCategories.length} categories for store type "${storeType}":`, 
                    relevantCategories.map(c => c.name));
                }
              } catch (catError: any) {
                console.error(`Failed to query categories for store type ${storeType}:`, catError);
              }
            }
          }
        } catch (storeError: any) {
          console.error(`CRITICAL: Failed to create store for new seller ${user.id}:`, {
            error: storeError.message,
            stack: storeError.stack
          });
          // If store creation fails, delete the user to avoid orphaned accounts
          try {
            await storage.deleteUser(user.id);
            console.log(`Rolled back user ${user.id} after store creation failure`);
          } catch (deleteError: any) {
            console.error(`CRITICAL: Failed to rollback user ${user.id}:`, deleteError);
            throw new Error(`Store creation failed and user rollback failed. Please contact support to manually clean up user with email: ${user.email}`);
          }
          throw new Error(`Failed to create store: ${storeError.message}. User has been removed, please retry.`);
        }
      }
      
      const { password, ...userWithoutPassword } = user;

      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const allowedFields = ['name', 'email', 'phone', 'role', 'isActive', 'isApproved', 'vehicleInfo', 'storeType', 'storeName', 'storeDescription', 'storeBanner'];
      const updateData: Record<string, any> = {};
      
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields to update" });
      }

      // Security: Only super_admin can assign the super_admin role
      if (updateData.role === "super_admin" && req.user!.role !== "super_admin") {
        return res.status(403).json({ error: "Only super admins can assign the super admin role" });
      }

      if (updateData.email) {
        const existingUser = await storage.getUserByEmail(updateData.email);
        if (existingUser && existingUser.id !== req.params.id) {
          return res.status(400).json({ error: "Email already exists" });
        }
      }
      
      // CRITICAL: Get user to validate role-specific requirements
      const currentUser = await storage.getUser(req.params.id);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // ENFORCE: Sellers cannot lose storeType if approved
      if (currentUser.role === "seller" && currentUser.isApproved) {
        if ('storeType' in updateData && !updateData.storeType) {
          return res.status(400).json({ 
            error: "Cannot remove store type from approved seller",
            details: "Approved sellers must maintain a valid store type. To change it, provide a new valid type."
          });
        }
        
        // Validate storeType if being updated
        if (updateData.storeType && !STORE_TYPES.includes(updateData.storeType)) {
          return res.status(400).json({ 
            error: "Invalid store type",
            details: `Valid types: ${STORE_TYPES.join(", ")}`
          });
        }
      }
      
      // ENFORCE: Riders cannot lose vehicleInfo if approved
      if (currentUser.role === "rider" && currentUser.isApproved) {
        if ('vehicleInfo' in updateData && (!updateData.vehicleInfo || !updateData.vehicleInfo.type)) {
          return res.status(400).json({ 
            error: "Cannot remove vehicle information from approved rider",
            details: "Approved riders must maintain valid vehicle information."
          });
        }
      }
      
      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  

  app.delete("/api/users/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`Starting hard delete for user ${req.params.id} (${user.role})`);
      
      // Execute all deletes in a transaction for data integrity
      await db.transaction(async (tx) => {
        // Delete user's chat messages
        await tx.delete(chatMessages).where(
          or(
            eq(chatMessages.senderId, req.params.id),
            eq(chatMessages.receiverId, req.params.id)
          )
        );
        
        // Delete user's cart items
        await tx.delete(cart).where(eq(cart.userId, req.params.id));
        
        // Delete user's wishlist items
        await tx.delete(wishlist).where(eq(wishlist.userId, req.params.id));
        
        // Delete user's notifications
        await tx.delete(notifications).where(eq(notifications.userId, req.params.id));
        
        // If seller, delete their store and products
        if (user.role === "seller") {
          const store = await storage.getStoreByPrimarySeller(req.params.id);
          if (store) {
            // Delete products from this store
            await tx.delete(products).where(eq(products.storeId, store.id));
            // Delete the store
            await tx.delete(stores).where(eq(stores.id, store.id));
            console.log(`Deleting store ${store.id} and its products for seller ${req.params.id}`);
          }
        }
        
        // Delete user's orders (as buyer or rider)
        await tx.delete(orders).where(
          or(
            eq(orders.buyerId, req.params.id),
            eq(orders.riderId, req.params.id)
          )
        );
        
        // Finally, delete the user
        await tx.delete(users).where(eq(users.id, req.params.id));
      });
      
      console.log(`Successfully hard deleted user ${req.params.id} and all related data`);
      res.json({ success: true, message: "User and all related data deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Application Routes (Seller/Rider) ============
  app.post("/api/applications/seller", async (req, res) => {
    try {
      const { password, ...userData } = req.body;
      
      if (!password || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      if (!userData.storeType) {
        return res.status(400).json({ error: "Store type is required" });
      }

      if (!STORE_TYPES.includes(userData.storeType)) {
        return res.status(400).json({ error: "Invalid store type" });
      }

      try {
        const storeTypeSchema = getStoreTypeSchema(userData.storeType as StoreType);
        storeTypeSchema.parse(userData.storeTypeMetadata || {});
      } catch (validationError: any) {
        const errors = validationError.errors?.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message
        }));
        return res.status(400).json({ 
          error: "Invalid or missing product information", 
          details: errors 
        });
      }

      const existingUser = await storage.getUserByEmail(userData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await storage.createUser({
        ...userData,
        password: hashedPassword,
        role: "seller",
        isApproved: false,
      });

      await notifyAdmins(
        "user",
        `New seller application`,
        `${userData.name} has applied to become a seller`
      );

      const { password: _, ...userWithoutPassword } = newUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/applications/rider", async (req, res) => {
    try {
      const { password, ...rawUserData } = req.body;
      
      if (!password || password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }

      const existingUser = await storage.getUserByEmail(rawUserData.email);
      if (existingUser) {
        return res.status(400).json({ error: "Email already registered" });
      }

      // Build properly typed user data
      const userData: any = { ...rawUserData };

      // Validate and normalize vehicle information using vehicleInfoSchema
      if (rawUserData.vehicleInfo) {
        const parsedVehicle = vehicleInfoSchema.safeParse(rawUserData.vehicleInfo);
        if (!parsedVehicle.success) {
          return res.status(400).json({ 
            error: "Invalid vehicle information",
            details: parsedVehicle.error.issues 
          });
        }
        
        const { type, plateNumber, license, color } = parsedVehicle.data;
        
        // Validate required fields based on vehicle type
        if (type === "car") {
          if (!plateNumber) {
            return res.status(400).json({ error: "Plate number is required for car riders" });
          }
          if (!license) {
            return res.status(400).json({ error: "Driver's license is required for car riders" });
          }
          if (!color) {
            return res.status(400).json({ error: "Vehicle color is required for car riders" });
          }
        } else if (type === "motorcycle") {
          if (!plateNumber) {
            return res.status(400).json({ error: "Plate number is required for motorcycle riders" });
          }
          if (!license) {
            return res.status(400).json({ error: "Driver's license is required for motorcycle riders" });
          }
        }
        
        userData.vehicleInfo = parsedVehicle.data as { type: string; plateNumber?: string; license?: string; color?: string };
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await storage.createUser({
        ...userData,
        password: hashedPassword,
        role: "rider",
        isApproved: false,
      });

      await notifyAdmins(
        "user",
        `New rider application`,
        `${userData.name} has applied to become a delivery rider`
      );

      const { password: _, ...userWithoutPassword } = newUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Product Routes ============
  // Only sellers may create products via this endpoint. Admins should not create products directly.
  app.post("/api/products", requireAuth, requireRole("seller"), upload.fields([
    { name: "images", maxCount: 5 },
    { name: "video", maxCount: 1 }
  ]), async (req: AuthRequest, res) => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };
      const imageUrls: string[] = [];
      let videoUrl: string | undefined;
      let videoDuration: number | undefined;

      if (files.images) {
        for (const image of files.images) {
          const metadata = await sharp(image.buffer).metadata();
          const width = metadata.width || 0;
          const height = metadata.height || 0;
          
          const result = await uploadWith4KEnhancement(
            image.buffer,
            "kiyumart/products",
            width,
            height
          );
          imageUrls.push(result.url);
        }
      }

      if (files.video && files.video[0]) {
        const videoFile = files.video[0];
        
        // Video format validation
        const allowedFormats = ['video/mp4', 'video/webm'];
        if (!allowedFormats.includes(videoFile.mimetype)) {
          return res.status(400).json({ 
            error: "Invalid video format. Only MP4 and WEBM formats are allowed. Please upload an MP4 or WEBM file."
          });
        }

        // Upload video and get server-side metadata
        const videoMetadata = await uploadWithMetadata(videoFile.buffer, "kiyumart/videos");
        videoUrl = videoMetadata.url;
        
        // SERVER-SIDE validation of 30-second limit (critical security requirement)
        if (videoMetadata.duration) {
          videoDuration = Math.round(videoMetadata.duration);
          
          if (videoDuration > 30) {
            return res.status(400).json({ 
              error: `Video duration exceeds maximum limit of 30 seconds. Your video is ${videoDuration} seconds long. Please upload a shorter video (max 30 seconds).`
            });
          }
        }
      }

      // Parse dynamic fields if provided
      const dynamicFields = req.body.dynamicFields ? JSON.parse(req.body.dynamicFields) : undefined;

      // Auto-link products to seller's store if seller is creating the product
      let storeId = req.body.storeId;
      if (req.user!.role === "seller") {
        try {
          // Ensure seller has a store (requires approval and storeType)
          const sellerStore = await storage.ensureStoreForSeller(req.user!.id, { requireApproval: true });
          storeId = sellerStore.id;
          console.log(`[Product Creation] Using store ${storeId} for seller ${req.user!.id}`);
        } catch (storeError: any) {
          console.error(`[Product Creation] Failed to ensure store for seller ${req.user!.id}:`, storeError.message);
          return res.status(400).json({ 
            error: `Cannot create product: ${storeError.message}`,
            details: storeError.message.includes("not approved") 
              ? "Your seller account must be approved by an admin before you can create products."
              : storeError.message.includes("store type")
              ? "Please update your profile with a store type before creating products."
              : "Please contact support for assistance."
          });
        }
      }

      const productData = {
        ...req.body,
        images: imageUrls,
        video: videoUrl,
        videoDuration,
        dynamicFields,
        price: req.body.price,
        sellerId: req.user!.id,
        storeId: storeId || undefined,
      };

      const validatedData = insertProductSchema.parse(productData);
      const product = await storage.createProduct({
        ...validatedData,
        sellerId: req.user!.id,
      });

      // Notify admins about new product
      await notifyAdmins(
        "product",
        "New product added",
        `A seller added a new product: ${product.name}`,
        { productId: product.id, sellerId: req.user!.id }
      );

      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: create product on behalf of a seller
  app.post("/api/admin/products", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const sellerId = req.body.sellerId;
      if (!sellerId) {
        return res.status(400).json({ error: "sellerId is required to create product on behalf of a seller" });
      }

      const seller = await storage.getUser(sellerId);
      if (!seller || seller.role !== "seller") {
        return res.status(404).json({ error: "Seller not found or invalid" });
      }

      // Ensure seller has a store (requires approval)
      let storeId: string | undefined = req.body.storeId;
      try {
        const sellerStore = await storage.ensureStoreForSeller(sellerId, { requireApproval: true });
        storeId = sellerStore.id;
      } catch (storeError: any) {
        return res.status(400).json({ error: `Cannot create product for seller: ${storeError.message}` });
      }

      const productData = {
        ...req.body,
        images: req.body.images || [],
        video: req.body.video || null,
        videoDuration: req.body.videoDuration || undefined,
        dynamicFields: req.body.dynamicFields ? JSON.parse(req.body.dynamicFields) : undefined,
        price: req.body.price,
        sellerId,
        storeId: storeId || undefined,
      };

      const validatedData = insertProductSchema.parse(productData);
      const product = await storage.createProduct({
        ...validatedData,
        sellerId,
      });

      await notifyAdmins(
        "product",
        "Product created by admin",
        `An admin added a product for seller ${seller.email}: ${product.name}`,
        { productId: product.id, sellerId }
      );

      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/products", async (req, res) => {
    try {
      const { sellerId, category, isActive } = req.query;
      
      // Get platform settings to check for single-store mode
      const platformSettings = await storage.getPlatformSettings();
      
      // In single-store mode with a primary store set, filter by that store's seller
      let finalSellerId: string | undefined = sellerId as string;
      if (!platformSettings.isMultiVendor && platformSettings.primaryStoreId && !sellerId) {
        const primaryStore = await storage.getStore(platformSettings.primaryStoreId);
        if (primaryStore) {
          finalSellerId = primaryStore.primarySellerId || undefined;
        }
      }
      
      const products = await storage.getProducts({
        sellerId: finalSellerId,
        category: category as string,
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });
      res.json(products);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/products/:id", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user!.role === "seller" && product.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await storage.updateProduct(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/products/:id/status", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      const updated = await storage.updateProduct(req.params.id, { isActive: req.body.isActive });
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/products/:id", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user!.role === "seller" && product.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      await storage.deleteProduct(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Delivery Zone Routes ============
  app.post("/api/delivery-zones", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      // Storage layer handles all validation
      const zone = await storage.createDeliveryZone(req.body);
      res.json(zone);
    } catch (error: any) {
      // Handle storage layer errors
      if (error.code === 'DUPLICATE_ZONE_NAME') {
        return res.status(409).json({ 
          error: error.message,
          code: error.code
        });
      }
      
      // Zod validation errors from storage
      if (error.errors) {
        return res.status(400).json({ error: error.errors[0]?.message || "Validation failed" });
      }
      
      res.status(400).json({ error: error.message || "Failed to create delivery zone" });
    }
  });

  app.get("/api/delivery-zones", async (req, res) => {
    try {
      const zones = await storage.getDeliveryZones();
      res.json(zones);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/delivery-zones/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      // Storage layer handles all validation
      const zone = await storage.updateDeliveryZone(req.params.id, req.body);
      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }
      res.json(zone);
    } catch (error: any) {
      // Handle storage layer errors
      if (error.code === 'DUPLICATE_ZONE_NAME') {
        return res.status(409).json({ 
          error: error.message,
          code: error.code
        });
      }
      
      if (error.code === 'INVALID_FEE' || error.code === 'INVALID_NAME') {
        return res.status(400).json({ 
          error: error.message,
          code: error.code
        });
      }
      
      res.status(400).json({ error: error.message || "Failed to update delivery zone" });
    }
  });

  app.delete("/api/delivery-zones/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      await storage.deleteDeliveryZone(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Coupon Routes ============
  app.post("/api/coupons", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const { code, discountType, discountValue, minimumPurchase, usageLimit, expiryDate, isActive } = req.body;
      
      if (!code || !discountType || !discountValue) {
        return res.status(400).json({ error: "Code, discount type, and discount value are required" });
      }

      if (discountType === "percentage" && (parseFloat(discountValue) < 0 || parseFloat(discountValue) > 100)) {
        return res.status(400).json({ error: "Percentage discount must be between 0 and 100" });
      }

      const coupon = await storage.createCoupon({
        sellerId: req.user!.id,
        code,
        discountType,
        discountValue,
        minimumPurchase: minimumPurchase || "0",
        usageLimit,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
        isActive: isActive !== false,
      });

      res.json(coupon);
    } catch (error: any) {
      if (error.message.includes("unique")) {
        return res.status(400).json({ error: "A coupon with this code already exists" });
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/coupons", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const coupons = await storage.getCouponsBySeller(req.user!.id);
      res.json(coupons);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/coupons/:id", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const coupon = await storage.getCoupon(req.params.id);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }
      
      if (coupon.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      res.json(coupon);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/coupons/:id", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const coupon = await storage.getCoupon(req.params.id);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      if (coupon.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const { discountType, discountValue } = req.body;

      if (discountType === "percentage" && discountValue && (parseFloat(discountValue) < 0 || parseFloat(discountValue) > 100)) {
        return res.status(400).json({ error: "Percentage discount must be between 0 and 100" });
      }

      const updated = await storage.updateCoupon(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/coupons/:id", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const coupon = await storage.getCoupon(req.params.id);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      if (coupon.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      await storage.deleteCoupon(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/coupons/validate", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { code, sellerId, orderTotal } = req.body;

      if (!code || !sellerId || !orderTotal) {
        return res.status(400).json({ error: "Code, seller ID, and order total are required" });
      }

      const result = await storage.validateCoupon(code, sellerId, parseFloat(orderTotal));
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Cart Routes ============
  app.post("/api/cart", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { productId, quantity = 1, variantId, selectedColor, selectedSize, selectedImageIndex } = req.body;
      const cartItem = await storage.addToCart(
        req.user!.id, 
        productId, 
        quantity,
        variantId,
        selectedColor,
        selectedSize,
        selectedImageIndex
      );
      res.json(cartItem);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/cart", requireAuth, async (req: AuthRequest, res) => {
    try {
      const cartItems = await storage.getCart(req.user!.id);
      res.json(cartItems);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/cart/:id", requireAuth, async (req, res) => {
    try {
      const { quantity } = req.body;
      const updated = await storage.updateCartItem(req.params.id, quantity);
      res.json(updated || { deleted: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/cart/:id", requireAuth, async (req, res) => {
    try {
      await storage.removeFromCart(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/cart", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.clearCart(req.user!.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Wishlist Routes ============
  app.post("/api/wishlist", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertWishlistSchema.parse(req.body);
      const wishlistItem = await storage.addToWishlist(req.user!.id, validatedData.productId);
      res.json(wishlistItem);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/wishlist", requireAuth, async (req: AuthRequest, res) => {
    try {
      const wishlist = await storage.getWishlist(req.user!.id);
      res.json(wishlist);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/wishlist/:productId", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.removeFromWishlist(req.user!.id, req.params.productId);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Review Routes ============
  app.post("/api/reviews", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertReviewSchema.parse(req.body);
      
      // Automatically verify if user purchased the product
      const verification = await storage.verifyPurchaseForReview(req.user!.id, validatedData.productId);
      
      const review = await storage.createReview({
        ...validatedData,
        userId: req.user!.id,
        orderId: verification.orderId || null,
        isVerifiedPurchase: verification.verified,
      });
      
      // Notify admins about new review
      const product = await storage.getProduct(validatedData.productId);
      await notifyAdmins(
        "review",
        "New review posted",
        `A customer posted a ${validatedData.rating}-star review${product ? ` for ${product.name}` : ''}`,
        { reviewId: review.id, productId: validatedData.productId, userId: req.user!.id }
      );
      
      res.json(review);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/products/:productId/reviews", async (req, res) => {
    try {
      const reviews = await storage.getProductReviews(req.params.productId);
      res.json(reviews);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Rider Review Routes ============
  app.post("/api/rider-reviews", requireAuth, async (req: AuthRequest, res) => {
    try {
      const validatedData = insertRiderReviewSchema.parse(req.body);
      
      // Verify user received delivery from this rider for this order
      const order = await storage.getOrder(validatedData.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.buyerId !== req.user!.id) {
        return res.status(403).json({ error: "You can only review riders for your own orders" });
      }
      if (order.riderId !== validatedData.riderId) {
        return res.status(400).json({ error: "This rider did not deliver your order" });
      }
      if (order.status !== "delivered") {
        return res.status(400).json({ error: "You can only review completed deliveries" });
      }
      
      const review = await storage.createRiderReview({
        ...validatedData,
        userId: req.user!.id,
      });
      
      res.json(review);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/riders/:riderId/reviews", async (req, res) => {
    try {
      const reviews = await storage.getRiderReviews(req.params.riderId);
      res.json(reviews);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/riders/:riderId/rating", async (req, res) => {
    try {
      const avgRating = await storage.getRiderAverageRating(req.params.riderId);
      res.json({ averageRating: avgRating });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/products/:productId/variants", async (req, res) => {
    try {
      const variants = await storage.getProductVariants(req.params.productId);
      res.json(variants);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/hero-banners", async (req, res) => {
    try {
      const { storeMode } = req.query;
      const banners = await storage.getHeroBanners(storeMode as string | undefined);
      res.json(banners);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Hero Banner Admin Management ============
  // Get all banners (including inactive) for admin
  app.get("/api/admin/hero-banners", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const banners = await storage.getAllHeroBanners();
      res.json(banners);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Get single banner
  app.get("/api/admin/hero-banners/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const banner = await storage.getHeroBanner(req.params.id);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
      res.json(banner);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Create banner with storeMode selection
  app.post("/api/admin/hero-banners", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const { title, subtitle, image, ctaText, ctaLink, storeMode, isActive, displayOrder } = req.body;
      
      if (!title || !image) {
        return res.status(400).json({ error: "Title and image are required" });
      }
      
      const validStoreModes = ['single', 'multivendor', 'both'];
      const selectedStoreMode = validStoreModes.includes(storeMode) ? storeMode : 'both';
      
      const banner = await storage.createHeroBanner({
        title,
        subtitle: subtitle || null,
        image,
        ctaText: ctaText || null,
        ctaLink: ctaLink || null,
        storeMode: selectedStoreMode,
        isActive: isActive !== false,
        displayOrder: displayOrder || 0,
      });
      
      res.json(banner);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Update banner
  app.patch("/api/admin/hero-banners/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const banner = await storage.getHeroBanner(req.params.id);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
      
      const validStoreModes = ['single', 'multivendor', 'both'];
      const updates: any = {};
      
      if (req.body.title !== undefined) updates.title = req.body.title;
      if (req.body.subtitle !== undefined) updates.subtitle = req.body.subtitle;
      if (req.body.image !== undefined) updates.image = req.body.image;
      if (req.body.ctaText !== undefined) updates.ctaText = req.body.ctaText;
      if (req.body.ctaLink !== undefined) updates.ctaLink = req.body.ctaLink;
      if (req.body.storeMode !== undefined && validStoreModes.includes(req.body.storeMode)) {
        updates.storeMode = req.body.storeMode;
      }
      if (req.body.isActive !== undefined) updates.isActive = req.body.isActive;
      if (req.body.displayOrder !== undefined) updates.displayOrder = req.body.displayOrder;
      
      const updated = await storage.updateHeroBanner(req.params.id, updates);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Delete banner
  app.delete("/api/admin/hero-banners/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const banner = await storage.getHeroBanner(req.params.id);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
      
      await storage.deleteHeroBanner(req.params.id);
      res.json({ success: true, message: "Banner deleted successfully" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Multi-Vendor Banner Management ============
  // Banner Collections (Admin only)
  app.post("/api/admin/banner-collections", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const validatedData = insertBannerCollectionSchema.parse(req.body);
      const collection = await storage.createBannerCollection(validatedData);
      res.json(collection);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/banner-collections", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const collections = await storage.getBannerCollections();
      res.json(collections);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/banner-collections/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const collection = await storage.getBannerCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }
      res.json(collection);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/banner-collections/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const updated = await storage.updateBannerCollection(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Collection not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/banner-collections/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteBannerCollection(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Marketplace Banners (Admin only)
  app.post("/api/admin/marketplace-banners", requireAuth, requireRole("admin"), upload.single("image"), async (req, res) => {
    try {
      let imageUrl = req.body.imageUrl;
      
      if (req.file) {
        imageUrl = await uploadToCloudinary(req.file.buffer, "kiyumart/banners");
      }

      if (!imageUrl) {
        return res.status(400).json({ error: "Image is required" });
      }

      const bannerData = {
        collectionId: req.body.collectionId || null,
        title: req.body.title || null,
        subtitle: req.body.subtitle || null,
        imageUrl,
        productRef: req.body.productRef || null,
        storeRef: req.body.storeRef || null,
        ctaText: req.body.ctaText || null,
        ctaUrl: req.body.ctaUrl || null,
        displayOrder: req.body.displayOrder ? parseInt(req.body.displayOrder) : 0,
        startAt: req.body.startAt ? new Date(req.body.startAt) : null,
        endAt: req.body.endAt ? new Date(req.body.endAt) : null,
        isActive: req.body.isActive === "true" || req.body.isActive === true,
        metadata: req.body.metadata ? (typeof req.body.metadata === 'string' ? JSON.parse(req.body.metadata) : req.body.metadata) : {},
      };

      const validatedData = insertMarketplaceBannerSchema.parse(bannerData);
      const banner = await storage.createMarketplaceBanner(validatedData);
      res.json(banner);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/marketplace-banners", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { collectionId } = req.query;
      const banners = await storage.getMarketplaceBanners(collectionId as string);
      res.json(banners);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/marketplace-banners/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const banner = await storage.getMarketplaceBanner(req.params.id);
      if (!banner) {
        return res.status(404).json({ error: "Banner not found" });
      }
      res.json(banner);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/marketplace-banners/:id", requireAuth, requireRole("admin"), upload.single("image"), async (req, res) => {
    try {
      const updateData: any = { ...req.body };
      
      if (req.file) {
        updateData.imageUrl = await uploadToCloudinary(req.file.buffer, "kiyumart/banners");
      }

      if (req.body.startAt) {
        updateData.startAt = new Date(req.body.startAt);
      }
      if (req.body.endAt) {
        updateData.endAt = new Date(req.body.endAt);
      }
      if (req.body.metadata && typeof req.body.metadata === 'string') {
        updateData.metadata = JSON.parse(req.body.metadata);
      }

      const updated = await storage.updateMarketplaceBanner(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Banner not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/marketplace-banners/:id", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      await storage.deleteMarketplaceBanner(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/marketplace-banners/reorder", requireAuth, requireRole("admin"), async (req, res) => {
    try {
      const { bannerIds } = req.body;
      if (!Array.isArray(bannerIds)) {
        return res.status(400).json({ error: "bannerIds must be an array" });
      }
      await storage.reorderMarketplaceBanners(bannerIds);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Public Homepage APIs
  app.get("/api/homepage/banners", async (req, res) => {
    try {
      const banners = await storage.getActiveMarketplaceBanners();
      res.json(banners);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/homepage/sellers", async (req, res) => {
    try {
      const sellers = await storage.getApprovedSellers();
      res.json(sellers);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/homepage/featured-products", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      
      // Get platform settings to check for single-store mode
      const platformSettings = await storage.getPlatformSettings();
      
      let featuredProducts;
      if (!platformSettings.isMultiVendor && platformSettings.primaryStoreId) {
        // In single-store mode, only show products from the primary store
        const primaryStore = await storage.getStore(platformSettings.primaryStoreId);
        const primarySellerId = primaryStore?.primarySellerId || undefined;
        featuredProducts = await storage.getFeaturedProducts(limit, primarySellerId);
      } else {
        featuredProducts = await storage.getFeaturedProducts(limit);
      }
      
      res.json(featuredProducts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Footer Pages API
  app.get("/api/footer-pages", async (req, res) => {
    try {
      const pages = await storage.getActiveFooterPages();
      res.json(pages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/footer-pages", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const pages = await storage.getAllFooterPages();
      res.json(pages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Platform earnings list
  app.get('/api/admin/platform-earnings', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || '50');
      const offset = parseInt((req.query.offset as string) || '0');
      const sellerId = req.query.sellerId as string | undefined;
      const storeId = req.query.storeId as string | undefined;
      const type = req.query.type as string | undefined;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      const earnings = await storage.getPlatformEarningsDetailed({ limit, offset, sellerId, storeId, type, from, to });
      console.log('[DBG] earnings sample:', earnings[0]);

      // Enrich results with store and seller names (defensive: storage method may not return them in all DB adapters)
      const sellerIds = Array.from(new Set(earnings.map((e: any) => e.sellerId).filter(Boolean)));
      const storeIds = Array.from(new Set(earnings.map((e: any) => e.storeId).filter(Boolean)));

      const sellersMap: Record<string, any> = {};
      for (const sid of sellerIds) {
        try {
          const su = await db.select().from(users).where(eq(users.id, sid as string)).limit(1);
          if (su[0]) sellersMap[sid as string] = { id: su[0].id, name: su[0].name };
        } catch (e) { continue; }
      }

      const storesMap: Record<string, any> = {};
      for (const stid of storeIds) {
        try {
          const su = await db.select().from(stores).where(eq(stores.id, stid as string)).limit(1);
          if (su[0]) storesMap[stid as string] = { id: su[0].id, name: su[0].name };
        } catch (e) { continue; }
      }

      // Fallback: ensure seller/store details are attached by querying commissions/orders/stores per row
      const result = [] as any[];
      for (const e of earnings) {
        let commissionRow: any[] = [];
        if (e.commissionId) {
          try {
            commissionRow = await db.select().from(commissions).where(eq(commissions.id, e.commissionId)).limit(1);
          } catch (err) {
            console.warn('Warning: failed to load commission for id', e.commissionId, (err as any)?.message || (err as any));
            commissionRow = [];
          }
        }
        const commission = commissionRow[0];
        let sellerName = null;
        let storeName = null;
        let sellerIdLocal = commission?.sellerId || null;

        if (sellerIdLocal) {
          const su = await db.select().from(users).where(eq(users.id, sellerIdLocal)).limit(1);
          sellerName = su[0]?.name || null;
        }

        // Try to find store by commission sellerId or order.storeId
        let storeIdLocal = null;
        if (commission && commission.sellerId) {
          const storeRow = await db.select().from(stores).where(eq(stores.primarySellerId, commission.sellerId)).limit(1);
          if (storeRow[0]) {
            storeIdLocal = storeRow[0].id;
            storeName = storeRow[0].name;
          }
        }
        if (!storeName && e.orderId) {
          const orderRow = await db.select().from(orders).where(eq(orders.id, e.orderId)).limit(1);
          if (orderRow[0] && orderRow[0].storeId) {
            const storeRow = await db.select().from(stores).where(eq(stores.id, orderRow[0].storeId)).limit(1);
            if (storeRow[0]) {
              storeIdLocal = storeRow[0].id;
              storeName = storeRow[0].name;
            }
          }
        }

        result.push({
          id: e.id,
          orderId: e.orderId,
          orderNumber: e.orderNumber || null,
          orderCreatedAt: e.orderCreatedAt || null,
          commissionId: e.commissionId,
          amount: e.amount,
          type: e.type,
          description: e.description,
          createdAt: e.createdAt,
          sellerId: sellerIdLocal,
          sellerName,
          storeId: storeIdLocal,
          storeName,
        });
      }

      res.json(result);
    } catch (error: any) {
      console.error('ERROR /api/admin/platform-earnings', error?.stack || error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/admin/finance-summary', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const summary = await storage.getPlatformEarningsSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Sellers list with payout summary
  app.get('/api/admin/sellers', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const sellers = await storage.getUsersByRole('seller');
      const results: any[] = [];

      // Import needed schema and db helpers here so the scope is clear
      const { db } = await import("../db/index");
      const { sellerPayouts } = await import("@shared/schema");
      const { eq, sql } = await import("drizzle-orm");

      for (const s of sellers) {
        // Aggregates for payouts (use sql templates instead of db.raw)
        const totals = await db.select({
          totalPaid: sql`COALESCE(SUM(CASE WHEN ${sellerPayouts.status} = 'completed' THEN ${sellerPayouts.amount} ELSE 0 END), 0)`,
          pending: sql`COALESCE(SUM(CASE WHEN ${sellerPayouts.status} = 'pending' THEN ${sellerPayouts.amount} ELSE 0 END), 0)`,
          count: sql`COALESCE(COUNT(*), 0)`,
          lastPayoutAt: sql`MAX(${sellerPayouts.processedAt})`
        }).from(sellerPayouts).where(eq(sellerPayouts.sellerId, s.id));

        results.push({
          id: s.id,
          name: s.name,
          email: s.email,
          isApproved: s.isApproved,
          totalPaid: (totals[0]?.totalPaid as any) || '0.00',
          pendingAmount: (totals[0]?.pending as any) || '0.00',
          payoutCount: (totals[0]?.count as any) || 0,
          lastPayoutAt: totals[0]?.lastPayoutAt || null
        });
      }
      res.json(results);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Get payouts for a seller
  app.get('/api/admin/sellers/:id/payouts', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const sellerId = req.params.id;
      const payouts = await storage.getSellerPayouts(sellerId);
      res.json(payouts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ===== Rider Payout Routes =====
  
  // Admin: Get all riders with payout summary
  app.get('/api/admin/riders-payouts', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const riders = await storage.getUsersByRole('rider');
      const { riderPayouts } = await import("@shared/schema");
      const { eq, sql } = await import("drizzle-orm");
      const { db } = await import("../db/index");
      
      const results: any[] = [];

      for (const r of riders) {
        const totals = await db.select({
          totalPaid: sql`COALESCE(SUM(CASE WHEN ${riderPayouts.status} = 'completed' THEN ${riderPayouts.amount}::numeric ELSE 0 END), 0)`,
          pending: sql`COALESCE(SUM(CASE WHEN ${riderPayouts.status} IN ('pending_approval', 'approved', 'processing') THEN ${riderPayouts.amount}::numeric ELSE 0 END), 0)`,
          count: sql`COALESCE(COUNT(*), 0)`,
          lastPayoutAt: sql`MAX(${riderPayouts.processedAt})`
        }).from(riderPayouts).where(eq(riderPayouts.riderId, r.id));

        results.push({
          id: r.id,
          name: r.name,
          email: r.email,
          phone: r.phone,
          isApproved: r.isApproved,
          isActive: r.isActive,
          totalPaid: (totals[0]?.totalPaid as any) || '0.00',
          pendingAmount: (totals[0]?.pending as any) || '0.00',
          payoutCount: (totals[0]?.count as any) || 0,
          lastPayoutAt: totals[0]?.lastPayoutAt || null
        });
      }
      res.json(results);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Get payouts for a specific rider
  app.get('/api/admin/riders/:id/payouts', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const riderId = req.params.id;
      const payouts = await storage.getRiderPayouts(riderId);
      res.json(payouts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Get all pending rider payouts awaiting approval
  app.get('/api/admin/rider-payouts/pending', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const pending = await storage.getAllPendingRiderPayouts();
      res.json(pending);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Approve rider payout
  app.post('/api/admin/rider-payouts/:id/approve', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
    try {
      const payoutId = req.params.id;
      const adminId = req.user!.id;
      
      // Update payout status to completed (in real implementation, trigger actual payment here)
      const updated = await storage.updateRiderPayoutStatus(payoutId, 'completed', adminId);
      
      if (!updated) {
        return res.status(404).json({ error: 'Payout not found' });
      }

      // Get rider and order details to include in notification
      const rider = await storage.getUser(updated.riderId);
      const order = updated.orderId ? await storage.getOrder(updated.orderId) : null;
      const orderNumber = order?.orderNumber || updated.orderId?.slice(0, 8) || 'Unknown';

      // Create a transaction record (for auditing)
      await storage.createTransaction({
        type: 'payout',
        amount: updated.amount,
        currency: updated.currency || 'GHS',
        status: 'completed',
        description: `Rider payout approved - Order #${orderNumber} - Admin ID: ${adminId}`,
        paymentMethod: updated.method || 'mobile_money',
        userId: updated.riderId
      });

      // Send notification to rider
      await storage.createNotification({
        userId: updated.riderId,
        type: "payout",
        title: "Payment Processed",
        message: `Payment for Order #${orderNumber} has been processed. Amount: ${updated.currency || 'GHS'} ${updated.amount}`,
        metadata: { 
          link: `/rider/earnings`,
          payoutId,
          orderId: updated.orderId,
          amount: updated.amount,
          currency: updated.currency || "GHS"
        } as any,
      });

      // Emit real-time event to rider
      io.to(updated.riderId).emit("payout_completed", {
        payoutId,
        orderId: updated.orderId,
        orderNumber,
        amount: updated.amount,
        currency: updated.currency || "GHS",
        processedAt: new Date().toISOString(),
      });

      console.log(`Rider payout ${payoutId} approved by admin ${adminId} for order #${orderNumber}`);
      res.json({ success: true, payout: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Reject rider payout (Super Admin only)
  app.post('/api/admin/rider-payouts/:id/reject', requireAuth, requireRole('super_admin'), async (req: AuthRequest, res) => {
    try {
      const payoutId = req.params.id;
      const adminId = req.user!.id;
      const { reason } = req.body;
      
      const updated = await storage.updateRiderPayoutStatus(payoutId, 'rejected', adminId);
      
      if (!updated) {
        return res.status(404).json({ error: 'Payout not found' });
      }

      // Get rider and order details
      const order = updated.orderId ? await storage.getOrder(updated.orderId) : null;
      const orderNumber = order?.orderNumber || updated.orderId?.slice(0, 8) || 'Unknown';

      // Create transaction record for auditing
      await storage.createTransaction({
        type: 'payout',
        amount: updated.amount,
        currency: updated.currency || 'GHS',
        status: 'failed',
        description: `Rider payout rejected - Order #${orderNumber} - Reason: ${reason || 'No reason provided'} - Admin ID: ${adminId}`,
        paymentMethod: updated.method || 'mobile_money',
        userId: updated.riderId
      });

      // Notify rider about rejection
      await storage.createNotification({
        userId: updated.riderId,
        type: "payout",
        title: "Payout Rejected",
        message: `Your payment for Order #${orderNumber} was not approved. ${reason ? `Reason: ${reason}` : 'Please contact support for more information.'}`,
        metadata: { 
          link: `/rider/earnings`,
          payoutId,
          orderId: updated.orderId,
          reason
        } as any,
      });

      // Emit real-time event
      io.to(updated.riderId).emit("payout_rejected", {
        payoutId,
        orderId: updated.orderId,
        orderNumber,
        reason,
        rejectedAt: new Date().toISOString(),
      });

      console.log(`Rider payout ${payoutId} rejected by admin ${adminId} for order #${orderNumber}`);
      res.json({ success: true, payout: updated });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: recent transactions and logs
  app.get('/api/admin/transactions', requireAuth, requireRole('admin', 'super_admin'), async (req: AuthRequest, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || '50');
      const offset = parseInt((req.query.offset as string) || '0');
      const txs = await storage.getTransactions(limit, offset);
      res.json(txs);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/footer-pages", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const data = insertFooterPageSchema.parse(req.body);
      const page = await storage.createFooterPage(data);
      res.status(201).json(page);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/footer-pages/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      const data = insertFooterPageSchema.partial().parse(req.body);
      const page = await storage.updateFooterPage(id, data);
      if (!page) {
        return res.status(404).json({ error: "Page not found" });
      }
      res.json(page);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/admin/footer-pages/:id", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteFooterPage(id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create test user accounts for all roles (Development/Testing only)
  // SECURITY: Only allow in development mode
  app.post("/api/seed/test-users", async (req, res) => {
    try {
      // Reject seed endpoints in production
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked seed endpoint /api/seed/test-users in production`);
        return res.status(403).json({ error: "Seed endpoints are disabled in production" });
      }
      
      // Determine a non-exposed super-admin password: use env when provided, otherwise generate one at runtime (not logged)
      const crypto = await import('crypto');
      const resolvedSuperAdminPassword = process.env.SUPER_ADMIN_PASSWORD || crypto.randomBytes(16).toString('hex');

      const testUsers = [
        {
          email: process.env.SUPER_ADMIN_EMAIL || "superadmin@kiyumart.com",
          password: await bcrypt.hash(resolvedSuperAdminPassword, 10),
          name: "Super Admin",
          role: "super_admin",
          isActive: true,
          isApproved: true
        },
        {
          email: "admin@kiyumart.com",
          password: await bcrypt.hash("admin123", 10),
          name: "Test Admin",
          role: "admin",
          isActive: true,
          isApproved: true
        },
        {
          email: "seller@kiyumart.com",
          password: await bcrypt.hash("seller123", 10),
          name: "Test Seller",
          role: "seller",
          storeName: "Test Store",
          storeBanner: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800",
          isApproved: true,
          isActive: true
        },
        {
          email: "buyer@kiyumart.com",
          password: await bcrypt.hash("buyer123", 10),
          name: "Test Buyer",
          role: "buyer",
          isActive: true
        },
        {
          email: "rider@kiyumart.com",
          password: await bcrypt.hash("rider123", 10),
          name: "Test Rider",
          role: "rider",
          vehicleInfo: { type: "motorcycle", plateNumber: "TEST-001", license: "LIC-001" } as { type: string; plateNumber?: string; license?: string; color?: string },
          nationalIdCard: "TEST-ID-001",
          isActive: true,
          isApproved: true,
          phone: "+233501234567"
        },
        {
          email: "agent@kiyumart.com",
          password: await bcrypt.hash("agent123", 10),
          name: "Test Agent",
          role: "agent",
          isActive: true,
          isApproved: true
        }
      ];

      const created = [];
      for (const user of testUsers) {
        try {
          const newUser = await storage.createUser(user as any);
          created.push({ email: user.email, role: user.role });
          
          // Check if store exists for seller and create one if it doesn't
          if (user.role === "seller") {
            const existingStore = await storage.getStoreByPrimarySeller(newUser.id);
            if (!existingStore) {
              await storage.createStore({
                primarySellerId: newUser.id,
                name: user.storeName || "Test Store",
                description: "Test store description",
                logo: user.storeBanner || "",
                isActive: true,
                isApproved: true
              });
            }
          }
        } catch (error: any) {
          if (error.message.includes("duplicate")) {
            created.push({ email: user.email, role: user.role, status: "already exists" });
          }
        }
      }

      res.json({
        success: true,
        message: "Test users created/verified for all 6 roles",
        users: created,
        // Note: Passwords are not included in responses for security. Set `SUPER_ADMIN_PASSWORD` and `ADMIN_PASSWORD` via environment variables.
        credentials: {
          super_admin: `${process.env.SUPER_ADMIN_EMAIL || 'superadmin@kiyumart.com'} (password set via SUPER_ADMIN_PASSWORD)`,
          admin: `${process.env.ADMIN_EMAIL || 'admin@kiyumart.com'} (password set via ADMIN_PASSWORD)`,
          seller: `seller@kiyumart.com`,
          buyer: `buyer@kiyumart.com`,
          rider: `rider@kiyumart.com`,
          agent: `agent@kiyumart.com`
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Test helper: create a JWT for a seeded user (Development/Testing only)
  app.post('/api/test/token', async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked test endpoint /api/test/token in production`);
        return res.status(403).json({ error: "Test endpoints are disabled in production" });
      }

      const { email } = req.body;
      if (!email) return res.status(400).json({ error: 'Email is required' });

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).json({ error: 'User not found' });

      const token = generateToken(user);

      res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Dev-only helper to set an httpOnly auth cookie for a test user (useful for E2E tests)
  app.get('/api/test/auth-cookie', async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked test endpoint /api/test/auth-cookie in production`);
        return res.status(403).send('disabled in production');
      }

      const email = req.query.email as string | undefined;
      if (!email) return res.status(400).send('email required');

      const user = await storage.getUserByEmail(email);
      if (!user) return res.status(404).send('user not found');

      const token = generateToken(user);
      // Set cookie (httpOnly) so browser requests send it automatically
      res.cookie('token', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
      });

      res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Dev-only endpoint for client-side logs (useful for diagnosing init timeouts and other client issues)
  app.post('/api/test/client-log', async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked test endpoint /api/test/client-log in production`);
        return res.status(403).json({ error: "Test endpoints are disabled in production" });
      }

      const payload = req.body || {};
      // Sanitize and log a short summary so logs don't fill up with huge payloads
      const summary = {
        type: payload.type || 'unknown',
        message: (payload.message || '').toString().slice(0, 1000),
        url: payload.url || '',
        userAgent: (payload.userAgent || '').toString().slice(0, 200),
        timestamp: payload.timestamp || new Date().toISOString(),
      };

      console.warn(`[CLIENT-LOG] ${summary.type} @ ${summary.timestamp} - ${summary.message} (url=${summary.url})`);

      res.json({ success: true, received: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Complete marketplace seed - creates sellers, products, and banners (Development/Testing only)
  app.post("/api/seed/complete-marketplace", async (req, res) => {
    try {
      // Reject seed endpoints in production
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked seed endpoint /api/seed/complete-marketplace in production`);
        return res.status(403).json({ error: "Seed endpoints are disabled in production" });
      }
      
      const results = {
        sellers: [] as any[],
        products: [] as any[],
        banners: [] as any[]
      };

      // Create 3 seller accounts
      const sellers = [
        {
          email: "seller1@kiyumart.com",
          password: await bcrypt.hash("password123", 10),
          name: "Fatima's Modest Fashion",
          role: "seller",
          storeName: "Fatima's Boutique",
          storeBanner: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800",
          ratings: "4.8",
          isApproved: true,
          isActive: true
        },
        {
          email: "seller2@kiyumart.com",
          password: await bcrypt.hash("password123", 10),
          name: "Aisha's Elegant Wear",
          role: "seller",
          storeName: "Aisha's Collection",
          storeBanner: "https://images.unsplash.com/photo-1445205170230-053b83016050?w=800",
          ratings: "4.6",
          isApproved: true,
          isActive: true
        },
        {
          email: "seller3@kiyumart.com",
          password: await bcrypt.hash("password123", 10),
          name: "Zainab's Fashion House",
          role: "seller",
          storeName: "Zainab's Designs",
          storeBanner: "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=800",
          ratings: "4.9",
          isApproved: true,
          isActive: true
        }
      ];

      for (const seller of sellers) {
        const created = await storage.createUser(seller as any);
        results.sellers.push(created);
      }

      // Create compliant products using media library
      const { createCompliantProductData, getAllProductBundles } = await import("./seedMediaLibrary");
      const clothingBundles = getAllProductBundles("clothing");

      for (const seller of results.sellers) {
        for (let i = 0; i < Math.min(clothingBundles.length, 2); i++) {
          const productData = createCompliantProductData(seller.id, "clothing", i);
          const product = await storage.createProduct(productData as any);
          results.products.push(product);
        }
      }

      // Create marketplace banners
      const collection = await storage.createBannerCollection({
        name: "Homepage Promotions",
        description: "Main homepage promotional banners",
        type: "homepage",
        isActive: true
      });

      const banners = [
        {
          collectionId: collection.id,
          title: "New Season Collection",
          subtitle: "Discover our latest modest fashion arrivals",
          imageUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200",
          ctaText: "Shop Now",
          ctaUrl: "/products",
          displayOrder: 1,
          isActive: true,
          metadata: { discount: 25 }
        },
        {
          collectionId: collection.id,
          title: "Premium Abayas",
          subtitle: "Elegant and comfortable abayas for every occasion",
          imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
          ctaText: "Explore Collection",
          ctaUrl: "/products",
          displayOrder: 2,
          isActive: true,
          metadata: { discount: 15 }
        }
      ];

      for (const banner of banners) {
        const created = await storage.createMarketplaceBanner(banner as any);
        results.banners.push(created);
      }

      // Ensure a store exists for the first seeded seller and set it as primary store (single-store mode)
      try {
        if (results.sellers.length > 0) {
          const primarySeller = results.sellers[0];
          const primaryStore = await storage.ensureStoreForSeller(primarySeller.id);
          await storage.updatePlatformSettings({ isMultiVendor: false, primaryStoreId: primaryStore.id, defaultCurrency: 'GHS' });
          console.log(`[seed/complete-marketplace] Set primaryStoreId=${primaryStore.id} for seeded marketplace`);
        }
      } catch (err: any) {
        console.warn('[seed/complete-marketplace] Failed to set primary store:', err?.message || err);
      }

      res.json({
        success: true,
        message: "Complete marketplace seeded successfully!",
        stats: {
          sellers: results.sellers.length,
          products: results.products.length,
          banners: results.banners.length
        },
        credentials: "All sellers: password123"
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Development helper: Ensure the platform primary store is set to a store that has active products
  app.post('/api/seed/ensure-primary-store', async (req, res) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        console.warn('[SECURITY] Blocked /api/seed/ensure-primary-store in production');
        return res.status(403).json({ error: 'Seed endpoints are disabled in production' });
      }

      // Find any active product and use its store as the primary store
      const products = await storage.getProducts({ isActive: true });
      if (!products || products.length === 0) return res.status(400).json({ error: 'No active products found' });

      // Find the first active product that has an associated storeId
      const candidate = products.find((p: any) => !!p.storeId);
      if (!candidate) return res.status(400).json({ error: 'No active product with a storeId found' });

  const store = await storage.getStore(candidate.storeId as string);
      if (!store) return res.status(404).json({ error: 'Store not found' });

      const updated = await storage.updatePlatformSettings({ isMultiVendor: false, primaryStoreId: store.id, defaultCurrency: 'GHS' });
      res.json({ success: true, primaryStoreId: store.id, settings: updated });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  // Islamic Fashion Products Seed (Development/Testing only)
  app.post("/api/seed/islamic-fashion", async (req, res) => {
    try {
      // Reject seed endpoints in production
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked seed endpoint /api/seed/islamic-fashion in production`);
        return res.status(403).json({ error: "Seed endpoints are disabled in production" });
      }
      
      const { createCompliantProductData, getAllProductBundles } = await import("./seedMediaLibrary");
      
      // Get or create a seller for the store
      let seller = await storage.getUserByEmail("store@kiyumart.com");
      console.log('[seed] existingSeller:', !!seller);
      if (!seller) {
        try {
          seller = await storage.createUser({
            email: "store@kiyumart.com",
            password: await bcrypt.hash("store123", 10),
            name: "KiyuMart Store",
            role: "seller" as const,
            storeName: "KiyuMart - Islamic Fashion",
            storeType: "clothing"
          });
          console.log('[seed] created seller id:', seller?.id);
        } catch (err: any) {
          console.error('[seed] create seller failed:', err?.message || String(err));
          // If creation failed due to a race or duplicate key, try to fetch the user again
          seller = await storage.getUserByEmail("store@kiyumart.com");
          console.log('[seed] re-fetched seller after failure:', !!seller);
        }
      }

      if (!seller) {
        throw new Error("Failed to create or find seller");
      }

      // Ensure seller is approved and active
      if (!seller.isApproved || !seller.isActive) {
        await storage.updateUser(seller.id, { isApproved: true, isActive: true });
      }

      const products = [];
      const reviews = [];

      // Ensure this seller has an associated store, and create products for that store
      const store = await storage.ensureStoreForSeller(seller.id, { requireApproval: false });

      // Create products using compliant bundles from media library and attach storeId
      const clothingBundles = getAllProductBundles("clothing");
      for (let i = 0; i < Math.min(clothingBundles.length, 3); i++) {
        const productData = createCompliantProductData(seller.id, "clothing", i, store.id);
        const product = await storage.createProduct(productData as any);
        products.push(product);
      }

      // Create customer accounts for reviews
      const customers = [];
      const customerData = [
        { email: "fatima@customer.com", name: "Fatima Ahmed" },
        { email: "aisha@customer.com", name: "Aisha Rahman" },
        { email: "mariam@customer.com", name: "Mariam Hassan" },
        { email: "zainab@customer.com", name: "Zainab Ibrahim" }
      ];

      for (const customer of customerData) {
        let user = await storage.getUserByEmail(customer.email);
        if (!user) {
          try {
            user = await storage.createUser({
              email: customer.email,
              password: await bcrypt.hash("customer123", 10),
              name: customer.name,
              role: "buyer"
            });
          } catch (err: any) {
            // If creation failed due to a race or duplicate key, try to fetch again
            user = await storage.getUserByEmail(customer.email);
          }
        }
        if (user) customers.push(user);
      }

      // Add real customer reviews
      if (customers.length >= 4 && products.length >= 3) {
        const reviewsData = [
          { productId: products[0]!.id, userId: customers[0]!.id, rating: 5, comment: "Beautiful dress, runs true to size. The embroidery makes it feel very special." },
          { productId: products[0]!.id, userId: customers[1]!.id, rating: 4, comment: "Absolutely gorgeous dress! The navy blue color is rich and the fit is flattering. Highly recommend!" },
          { productId: products[0]!.id, userId: customers[2]!.id, rating: 5, comment: "The quality exceeded my expectations. Perfect for formal occasions and very comfortable to wear all day." },
          { productId: products[1]!.id, userId: customers[0]!.id, rating: 5, comment: "Love the lace details! Very elegant and modest. Got so many compliments." },
          { productId: products[1]!.id, userId: customers[3]!.id, rating: 4, comment: "Beautiful abaya, the pink color is lovely. Great quality fabric." },
          { productId: products[2]!.id, userId: customers[1]!.id, rating: 5, comment: "Stunning dress! The emerald green color is absolutely beautiful. Worth every penny." },
        ];

        for (const review of reviewsData) {
          try {
            const created = await storage.createReview(review);
            reviews.push(created);
          } catch (error) {
            console.log("Review already exists");
          }
        }
      }

      res.json({
        success: true,
        message: "Islamic fashion products seeded successfully!",
        stats: {
          products: products.length,
          reviews: reviews.length
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin seed for marketplace setup (Development only)
  app.post("/api/seed/marketplace-setup", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      // Reject seed endpoints in production
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked seed endpoint /api/seed/marketplace-setup in production`);
        return res.status(403).json({ error: "Seed endpoints are disabled in production" });
      }
      
      // Create sample banner collection
      const collection = await storage.createBannerCollection({
        name: "Homepage Promotions",
        description: "Main homepage promotional banners",
        type: "homepage",
        isActive: true
      });

      // Create sample marketplace banners
      const banners = [
        {
          collectionId: collection.id,
          title: "New Season Collection",
          subtitle: "Discover our latest modest fashion arrivals with exclusive designs",
          imageUrl: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1200",
          ctaText: "Shop Now",
          ctaUrl: "/products",
          displayOrder: 1,
          isActive: true,
          metadata: { discount: 25 }
        },
        {
          collectionId: collection.id,
          title: "Premium Abayas",
          subtitle: "Elegant and comfortable abayas for every occasion",
          imageUrl: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1200",
          ctaText: "Explore Collection",
          ctaUrl: "/category/Abayas",
          displayOrder: 2,
          isActive: true,
          metadata: { discount: 15 }
        },
        {
          collectionId: collection.id,
          title: "Designer Hijabs",
          subtitle: "Premium quality hijabs in beautiful colors and fabrics",
          imageUrl: "https://images.unsplash.com/photo-1487222477894-8943e31ef7b2?w=1200",
          ctaText: "View Collection",
          ctaUrl: "/category/Hijabs",
          displayOrder: 3,
          isActive: true,
          metadata: {}
        }
      ];

      const createdBanners = [];
      for (const banner of banners) {
        const created = await storage.createMarketplaceBanner(banner as any);
        createdBanners.push(created);
      }

      res.json({
        success: true,
        message: "Marketplace setup complete",
        collection,
        banners: createdBanners
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Seller seed for products (⚠️ DEVELOPMENT/TESTING ONLY - Remove or disable in production)
  app.post("/api/seed/sample-data", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      // Reject seed endpoints in production
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[SECURITY] Blocked seed endpoint /api/seed/sample-data in production`);
        return res.status(403).json({ error: "Seed endpoints are disabled in production" });
      }
      
      const sellerId = req.user!.id;
      const { createCompliantProductData, getAllProductBundles } = await import("./seedMediaLibrary");
      
      // Create compliant products with 5 images + 1 video each
      const clothingBundles = getAllProductBundles("clothing");
      const createdProducts = [];
      
      for (let i = 0; i < Math.min(clothingBundles.length, 3); i++) {
        const productData = createCompliantProductData(sellerId, "clothing", i);
        const created = await storage.createProduct(productData as any);
        createdProducts.push(created);
      }

      res.json({ 
        success: true, 
        message: `${createdProducts.length} products created successfully`,
        products: createdProducts 
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Order Routes ============
  app.post("/api/orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { items, ...orderData } = req.body;
      
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "Order must contain at least one item" });
      }
      
      // Get platform settings to check if multi-vendor mode is enabled
      const platformSettings = await storage.getPlatformSettings();
      const platformIsMultiVendor = platformSettings?.isMultiVendor ?? false;
      
      // Server-side price recalculation to prevent tampering
      let serverSubtotal = 0;
      let serverProductSavings = 0;
      const validatedItems = [];
      const productsBySeller = new Map<string, { sellerId: string; storeId: string | null; products: any[] }>();
      
      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(404).json({ error: `Product ${item.productId} not found` });
        }
        
        if (!product.isActive) {
          return res.status(400).json({ error: `Product ${product.name} is no longer available` });
        }
        
        // Calculate actual price with discount
        const originalPrice = parseFloat(product.price);
        const discount = product.discount || 0;
        const discountedPrice = originalPrice * (1 - discount / 100);
        const itemTotal = discountedPrice * item.quantity;
        
        // Track savings
        serverProductSavings += (originalPrice - discountedPrice) * item.quantity;
        serverSubtotal += itemTotal;
        
        const validatedItem = {
          productId: item.productId,
          quantity: item.quantity,
          price: discountedPrice.toFixed(2),
          total: itemTotal.toFixed(2),
          product,
        };
        
        validatedItems.push(validatedItem);
        
        // Group by seller for multi-vendor detection
        if (!productsBySeller.has(product.sellerId)) {
          productsBySeller.set(product.sellerId, {
            sellerId: product.sellerId,
            storeId: product.storeId,
            products: []
          });
        }
        productsBySeller.get(product.sellerId)!.products.push(validatedItem);
      }
      
      // Verify client-submitted subtotal matches server calculation
      const clientSubtotal = parseFloat(orderData.subtotal || "0");
      if (Math.abs(serverSubtotal - clientSubtotal) > 0.01) {
        return res.status(400).json({ 
          error: "Price mismatch detected. Please refresh and try again.",
          serverSubtotal: serverSubtotal.toFixed(2),
          clientSubtotal: clientSubtotal.toFixed(2)
        });
      }
      
      // Re-validate coupon on server-side
      // For multi-vendor carts, coupon applies ONLY to the seller who issued it
      let couponOwningSellerId: string | null = null;
      
      if (orderData.couponCode) {
        try {
          // Load coupon to determine which seller owns it
          const coupon = await storage.getCouponByCode(orderData.couponCode);
          
          if (!coupon) {
            return res.status(400).json({ 
              error: "Invalid coupon code" 
            });
          }
          
          if (!coupon.isActive) {
            return res.status(400).json({ 
              error: "This coupon is no longer active" 
            });
          }
          
          // Check if coupon owner's products are in the cart
          if (!productsBySeller.has(coupon.sellerId)) {
            return res.status(400).json({ 
              error: "This coupon can only be used with products from the seller who issued it" 
            });
          }
          
          // Set the coupon owner (will be validated against seller's subtotal later)
          couponOwningSellerId = coupon.sellerId;
        } catch (validationError: any) {
          return res.status(400).json({ 
            error: `Coupon validation failed: ${validationError.message}` 
          });
        }
      }
      
      // Recalculate total server-side (note: multi-vendor coupons calculated per-seller later)
      const deliveryFee = parseFloat(orderData.deliveryFee || "0");
      const serverProcessingFee = (serverSubtotal + deliveryFee) * 0.0195;
      const serverTotal = serverSubtotal + deliveryFee + serverProcessingFee;
      
      // Verify total matches
      const clientTotal = parseFloat(orderData.total || "0");
      if (Math.abs(serverTotal - clientTotal) > 0.02) {
        return res.status(400).json({ 
          error: "Total amount mismatch. Please refresh and try again.",
          serverTotal: serverTotal.toFixed(2),
          clientTotal: clientTotal.toFixed(2)
        });
      }
      
      // Detect multi-vendor cart
      const hasMultipleSellers = productsBySeller.size > 1;
      
      // Validate platform mode against cart contents
      if (!platformIsMultiVendor && hasMultipleSellers) {
        return res.status(400).json({ 
          error: "Platform is in single-store mode",
          userMessage: "This platform currently operates in single-store mode. You can only purchase products from one seller at a time. Please remove items from other sellers to continue."
        });
      }
      
      const isMultiVendor = platformIsMultiVendor && hasMultipleSellers;
      let createdOrders: any[] = [];
      let sessionId: string | undefined;
      
      if (isMultiVendor) {
        // Multi-vendor: create separate order per seller with proportional delivery fee
        // Coupon applies ONLY to the seller who issued it
        const itemsBySeller = await Promise.all(
          Array.from(productsBySeller.values()).map(async sellerGroup => {
            const sellerSubtotal = sellerGroup.products.reduce((sum, item) => sum + parseFloat(item.total), 0);
            const sellerProportion = sellerSubtotal / serverSubtotal;
            
            // Proportionally allocate delivery fee to each seller
            const sellerDeliveryFee = deliveryFee * sellerProportion;
            
            // Apply coupon discount ONLY to the seller who owns the coupon
            let sellerCouponDiscount = 0;
            if (couponOwningSellerId && sellerGroup.sellerId === couponOwningSellerId && orderData.couponCode) {
              // Validate coupon against THIS seller's subtotal
              const validationResult = await storage.validateCoupon(
                orderData.couponCode,
                sellerGroup.sellerId,
                sellerSubtotal
              );
              
              if (validationResult.valid) {
                sellerCouponDiscount = parseFloat(validationResult.discountAmount || "0");
              }
            }
            
            // Calculate processing fee for this seller's order AFTER applying coupon
            const sellerProcessingFee = (sellerSubtotal - sellerCouponDiscount + sellerDeliveryFee) * 0.0195;
            const sellerTotal = sellerSubtotal - sellerCouponDiscount + sellerDeliveryFee + sellerProcessingFee;
            
            return {
              sellerId: sellerGroup.sellerId,
              storeId: sellerGroup.storeId,
              items: sellerGroup.products.map(p => ({
                productId: p.productId,
                quantity: p.quantity,
                price: p.price,
                total: p.total
              })),
              subtotal: sellerSubtotal,
              deliveryFee: sellerDeliveryFee,
              processingFee: sellerProcessingFee,
              couponDiscount: sellerCouponDiscount > 0 ? sellerCouponDiscount : 0, // Will be converted to null in storage
              total: sellerTotal
            };
          })
        );
        
        const baseOrderData = {
          buyerId: req.user!.id,
          status: orderData.status || 'pending',
          deliveryMethod: orderData.deliveryMethod,
          deliveryZoneId: orderData.deliveryZoneId || null,
          deliveryAddress: orderData.deliveryAddress || null,
          deliveryCity: orderData.deliveryCity || null,
          deliveryPhone: orderData.deliveryPhone || null,
          deliveryLatitude: orderData.deliveryLatitude || null,
          deliveryLongitude: orderData.deliveryLongitude || null,
          currency: orderData.currency || 'GHS',
          paymentStatus: 'pending',
          couponCode: orderData.couponCode || null,
          estimatedDelivery: orderData.estimatedDelivery || null,
        };
        
        const result = await storage.createMultiSellerOrders(baseOrderData as any, itemsBySeller);
        sessionId = result.sessionId;
        createdOrders = result.orders;
        
        console.log(`✅ Created ${createdOrders.length} orders for multi-vendor checkout (session: ${sessionId})`);
      } else {
        // Single vendor: use existing createOrder method
        // For single-vendor, validate coupon if present
        let singleVendorCouponDiscount = 0;
        if (couponOwningSellerId && orderData.couponCode) {
          const validationResult = await storage.validateCoupon(
            orderData.couponCode,
            couponOwningSellerId,
            serverSubtotal
          );
          if (validationResult.valid) {
            singleVendorCouponDiscount = parseFloat(validationResult.discountAmount || "0");
          }
        }
        
        // Recalculate processing fee and total with coupon discount
        const finalProcessingFee = (serverSubtotal - singleVendorCouponDiscount + deliveryFee) * 0.0195;
        const finalTotal = serverSubtotal - singleVendorCouponDiscount + deliveryFee + finalProcessingFee;
        
        const orderInput = {
          ...orderData,
          buyerId: req.user!.id,
          subtotal: serverSubtotal.toFixed(2),
          couponDiscount: singleVendorCouponDiscount > 0 ? singleVendorCouponDiscount.toFixed(2) : null,
          processingFee: finalProcessingFee.toFixed(2),
          total: finalTotal.toFixed(2),
        };
        // If platform is single-store and a primary store is configured, ensure order
        // is stamped with that store and seller so payments route to the primary store.
        if (!platformIsMultiVendor && platformSettings?.primaryStoreId) {
          try {
            const primaryStore = await storage.getStore(platformSettings.primaryStoreId);
            if (primaryStore) {
              orderInput.storeId = primaryStore.id;
              orderInput.sellerId = primaryStore.primarySellerId || orderInput.sellerId;
            }
          } catch (storeErr: any) {
            console.warn('Could not fetch primary store for single-store mode:', storeErr?.message || storeErr);
          }
        }

        const validatedOrder = insertOrderSchema.parse(orderInput);
        const order = await storage.createOrder(validatedOrder, validatedItems.map(v => ({
          productId: v.productId,
          quantity: v.quantity,
          price: v.price,
          total: v.total
        })));
        createdOrders = [order];
      }
      
      // Automatic rider assignment with round-robin load balancing for all orders
      try {
        const availableRiders = await storage.getAvailableRidersWithOrderCounts();
        
        if (availableRiders.length > 0) {
          for (const order of createdOrders) {
            const selectedRider = availableRiders[0];
            
            await storage.assignRider(order.id, selectedRider.rider.id);
            
            await storage.createNotification({
              userId: selectedRider.rider.id,
              type: 'order',
              title: 'New Order Assigned',
              message: `Order ${order.orderNumber} has been automatically assigned to you`,
              metadata: { orderId: order.id, orderNumber: order.orderNumber } as any
            });
            
            io.to(selectedRider.rider.id).emit('new_order_assigned', {
              orderId: order.id,
              orderNumber: order.orderNumber,
              message: `New order ${order.orderNumber} assigned to you`
            });
            
            console.log(`✅ Auto-assigned order ${order.orderNumber} to rider ${selectedRider.rider.name}`);
          }
        } else {
          console.log(`⚠️ No available riders for ${createdOrders.length} orders`);
        }
      } catch (riderAssignmentError: any) {
        console.error('Rider auto-assignment failed:', riderAssignmentError);
      }
      
      // NOTE: Order notification will be sent after successful payment verification
      // See /api/payments/verify/:reference endpoint
      
      // Return response: single order for single-vendor (backward compatible)
      // or first order + session info for multi-vendor
      if (isMultiVendor) {
        res.json({ 
          ...createdOrders[0],
          checkoutSessionId: sessionId,
          isMultiVendor: true,
          totalOrders: createdOrders.length 
        });
      } else {
        res.json(createdOrders[0]);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userRole = req.user!.role as "admin" | "super_admin" | "buyer" | "seller" | "rider" | "agent";
      // Allow context override: buyers can shop, sellers/riders/agents can view purchases vs their work orders
      const context = (req.query.context as string) || userRole;
      
      let orders: any[];
      
      // Admin and super_admin see all orders by default, unless context=buyer is specified
      if ((userRole === "admin" || userRole === "super_admin") && (context === "admin" || context === "super_admin")) {
        orders = await storage.getAllOrders();
      } else {
        // For all other cases, use context-based filtering
        const filterRole = context as "buyer" | "seller" | "rider";
        orders = await storage.getOrdersByUser(req.user!.id, filterRole);
      }
      
      // Fetch order items with product names for each order
      const ordersWithItems = await Promise.all(
        orders.map(async (order) => {
          const items = await storage.getOrderItems(order.id);
          return {
            ...order,
            totalAmount: order.total,
            items,
          };
        })
      );
      
      res.json(ordersWithItems);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Only include customer PII for admin/super_admin or the buyer themselves
      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      const isBuyer = req.user!.id === order.buyerId;
      
      if (isAdmin || isBuyer) {
        // Fetch customer/buyer information to display in order details
        const buyer = await storage.getUser(order.buyerId);
        
        // Return order with complete customer info (authorized)
        res.json({
          ...order,
          customerInfo: buyer ? {
            name: buyer.name,
            email: buyer.email,
            phone: buyer.phone,
            address: order.deliveryAddress || buyer.businessAddress || null,
          } : null
        });
      } else {
        // Return order without PII for unauthorized roles
        res.json(order);
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/orders/:id/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { status, reason } = req.body;
      const orderId = req.params.id;
      
      // CRITICAL: All validation, side effects, and audit trail happen INSIDE the transaction
      // in applyOrderStatusTransition() to prevent TOCTOU race conditions
      const updatedOrder = await storage.applyOrderStatusTransition(
        orderId,
        status,
        req.user!.id,
        req.user!.role,
        reason
      );
      
      if (!updatedOrder) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Create notification for buyer about status update
      if (updatedOrder.buyerId) {
        await storage.createNotification({
          userId: updatedOrder.buyerId,
          type: "order",
          title: "Order Status Updated",
          message: `Your order #${updatedOrder.orderNumber} status has been updated to ${status}`,
          metadata: { orderId: updatedOrder.id, orderNumber: updatedOrder.orderNumber, status } as any
        });
        
        // Emit real-time order status update to buyer
        io.to(updatedOrder.buyerId).emit("order_status_updated", {
          orderId: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          updatedAt: updatedOrder.updatedAt,
        });
      }
      
      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error updating order status:", error);
      
      // Map error codes to appropriate HTTP status codes
      const errorCode = (error as any).code;
      
      if (error.message === "ORDER_NOT_FOUND") {
        return res.status(404).json({ error: "Order not found" });
      } else if (errorCode === "role_violation") {
        return res.status(403).json({ error: error.message, details: (error as any).details });
      } else if (errorCode === "invalid_transition") {
        return res.status(409).json({ error: error.message, details: (error as any).details });
      } else if (errorCode === "precondition_failed" || errorCode === "payment_required") {
        return res.status(422).json({ error: error.message, details: (error as any).details });
      }
      
      // Generic server error for unexpected failures
      res.status(500).json({ error: error.message || "Failed to update order status" });
    }
  });

  app.patch("/api/orders/:id/assign-rider", requireAuth, requireRole("admin", "seller"), async (req, res) => {
    try {
      const { riderId } = req.body;
      const order = await storage.assignRider(req.params.id, riderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      res.json(order);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Complete delivery with QR code verification (rider scans buyer's QR code)
  app.post("/api/orders/:id/complete-delivery", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const { qrCode } = req.body;
      const orderId = req.params.id;
      const riderId = req.user!.id;

      if (!qrCode) {
        return res.status(400).json({ error: "QR code is required" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Verify the rider is assigned to this order
      if (order.riderId !== riderId) {
        return res.status(403).json({ error: "You are not assigned to this delivery" });
      }

      // Verify the order is in a valid state for completion
      if (!["delivering", "en_route", "picked_up"].includes(order.status)) {
        return res.status(400).json({ 
          error: "Order cannot be completed",
          details: `Order is currently in "${order.status}" status. Only orders in delivery can be completed.`
        });
      }

      // Verify QR code matches
      if (order.qrCode !== qrCode) {
        return res.status(400).json({ 
          error: "Invalid QR code",
          details: "The scanned QR code does not match this order."
        });
      }

      // Update order status to delivered
      const updatedOrder = await storage.updateOrder(orderId, { 
        status: "delivered" as any,
        deliveredAt: new Date(),
      });

      // Create notifications
      await storage.createNotification({
        userId: order.buyerId,
        type: "order",
        title: "Order Delivered!",
        message: `Your order #${order.orderNumber} has been successfully delivered. Thank you for shopping with us!`,
        metadata: { link: `/orders/${orderId}` } as any,
      });

      await storage.createNotification({
        userId: order.sellerId,
        type: "order", 
        title: "Delivery Completed",
        message: `Order #${order.orderNumber} has been delivered to the customer.`,
        metadata: { link: `/seller/orders/${orderId}` } as any,
      });

      // Emit real-time events
      io.to(order.buyerId).emit("order_delivered", {
        orderId,
        orderNumber: order.orderNumber,
        deliveredAt: new Date().toISOString(),
      });

      io.emit("admin_delivery_completed", {
        orderId,
        orderNumber: order.orderNumber,
        riderId,
        deliveredAt: new Date().toISOString(),
      });

      // Create rider payout record (if enabled)
      try {
        const rider = await storage.getUser(riderId);
        if (rider && order.deliveryFee) {
          const payout = await storage.createRiderPayout({
            riderId,
            orderId,
            amount: order.deliveryFee,
            currency: order.currency || "GHS",
            method: "mobile_money",
            status: "pending_approval",
          });
          console.log(`Created rider payout for delivery ${orderId}`);

          // Get all super admins and notify them about pending payout
          const superAdmins = await storage.getUsersByRole("super_admin");
          const buyer = await storage.getUser(order.buyerId);
          
          for (const admin of superAdmins) {
            if (!admin.isActive) continue;
            await storage.createNotification({
              userId: admin.id,
              type: "payout",
              title: "📦 Payout Action Required",
              message: `Order #${order.orderNumber} delivered by ${rider.name}. Amount: ${order.currency || 'GHS'} ${order.deliveryFee}. Status: Delivered & Verified.`,
              metadata: { 
                link: `/admin/riders-payouts`,
                payoutId: payout.id,
                orderId,
                riderId,
                riderName: rider.name,
                amount: order.deliveryFee,
                currency: order.currency || "GHS",
                orderNumber: order.orderNumber,
                buyerName: buyer?.name || "Customer",
                deliveryAddress: order.deliveryAddress || ""
              } as any,
            });
          }

          // Emit real-time event for super admins
          io.emit("admin_payout_pending", {
            payoutId: payout.id,
            orderId,
            orderNumber: order.orderNumber,
            riderId,
            riderName: rider.name,
            amount: order.deliveryFee,
            currency: order.currency || "GHS",
            createdAt: new Date().toISOString(),
          });
        }
      } catch (payoutError) {
        console.error("Failed to create rider payout:", payoutError);
        // Don't fail the delivery completion even if payout creation fails
      }

      console.log(`Order ${orderId} delivered by rider ${riderId} via QR verification`);
      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error completing delivery:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/riders/available", requireAuth, requireRole("admin", "seller", "super_admin"), async (req, res) => {
    try {
      const availableRiders = await storage.getAvailableRidersWithOrderCounts();
      res.json(availableRiders);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get rider's active delivery (for rider navigation page)
  app.get("/api/rider/active-delivery", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const riderId = req.user!.id;
      
      // Find active order assigned to this rider
      const activeOrders = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          status: orders.status,
          deliveryAddress: orders.deliveryAddress,
          deliveryLatitude: orders.deliveryLatitude,
          deliveryLongitude: orders.deliveryLongitude,
          buyerId: orders.buyerId,
          qrCode: orders.qrCode,
        })
        .from(orders)
        .where(
          and(
            eq(orders.riderId, riderId),
            or(
              eq(orders.status, "processing"),
              eq(orders.status, "delivering")
            )
          )
        )
        .orderBy(desc(orders.createdAt))
        .limit(1);

      if (activeOrders.length === 0) {
        return res.status(404).json({ error: "No active delivery" });
      }

      const order = activeOrders[0];
      
      // Get buyer info
      const buyer = await storage.getUser(order.buyerId);
      
      res.json({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        deliveryAddress: order.deliveryAddress || "Address not available",
        deliveryLatitude: order.deliveryLatitude ? parseFloat(order.deliveryLatitude) : null,
        deliveryLongitude: order.deliveryLongitude ? parseFloat(order.deliveryLongitude) : null,
        buyerId: order.buyerId,
        buyerName: buyer?.name || "Customer",
        buyerPhone: buyer?.phone || null,
        qrCode: order.qrCode || null,
      });
    } catch (error: any) {
      console.error("Error fetching active delivery:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Delivery Tracking Routes ============
  app.post("/api/delivery-tracking", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const trackingData = {
        orderId: req.body.orderId,
        riderId: req.user!.id,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        accuracy: req.body.accuracy,
        speed: req.body.speed,
        heading: req.body.heading,
      };

      const tracking = await storage.createDeliveryTracking(trackingData);
      
      // Emit real-time location update to buyer and admins
      const order = await storage.getOrder(req.body.orderId);
      if (order) {
        const rider = await storage.getUser(req.user!.id);
        const locationUpdate = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          riderId: req.user!.id,
          riderName: rider?.name || "Rider",
          latitude: tracking.latitude,
          longitude: tracking.longitude,
          speed: tracking.speed,
          heading: tracking.heading,
          timestamp: tracking.timestamp,
        };
        
        // Send to buyer
        io.to(order.buyerId).emit("rider_location_updated", locationUpdate);
        
        // Send to all admins for real-time tracking
        const admins = await storage.getUsersByRole("admin");
        const superAdmins = await storage.getUsersByRole("super_admin");
        [...admins, ...superAdmins].forEach(admin => {
          io.to(admin.id).emit("admin_rider_location_updated", locationUpdate);
        });
      }
      
      res.json(tracking);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/delivery-tracking/:orderId", requireAuth, async (req, res) => {
    try {
      const tracking = await storage.getLatestDeliveryLocation(req.params.orderId);
      if (!tracking) {
        return res.status(404).json({ error: "No tracking data found" });
      }
      res.json(tracking);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/delivery-tracking/:orderId/history", requireAuth, async (req, res) => {
    try {
      const history = await storage.getDeliveryTrackingHistory(req.params.orderId);
      res.json(history);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all active riders with their current locations (for admin tracking)
  app.get("/api/admin/active-riders", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      // Get all orders and filter for processing or delivering status with assigned riders
      const allOrders = await storage.getAllOrders();
      const activeOrders = allOrders.filter(order => 
        (order.status === "delivering" || order.status === "processing") && order.riderId
      );
      
      const riderLocations = await Promise.all(
        activeOrders.map(async (order: any) => {
          if (!order.riderId) return null;
          
          const rider = await storage.getUser(order.riderId);
          if (!rider) return null;
          
          const latestLocation = await storage.getLatestDeliveryLocation(order.id);
          
          // Return rider even without location data (they may not have started tracking)
          return {
            riderId: rider.id,
            riderName: rider.name,
            orderId: order.id,
            orderNumber: order.orderNumber,
            orderStatus: order.status,
            latitude: latestLocation?.latitude ?? null,
            longitude: latestLocation?.longitude ?? null,
            speed: latestLocation?.speed ?? null,
            heading: latestLocation?.heading ?? null,
            timestamp: latestLocation?.timestamp ?? null,
            hasLocation: !!latestLocation,
          };
        })
      );
      
      res.json(riderLocations.filter(Boolean));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get pending orders that need rider assignment (for Command Center dispatch)
  app.get("/api/admin/pending-orders", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      
      // Filter for orders that need rider assignment:
      // - delivery method is "rider"
      // - status is "processing" or "ready" (paid but not yet picked up)
      // - no rider assigned yet
      const pendingOrders = allOrders
        .filter(order => 
          order.deliveryMethod === "rider" &&
          ["processing", "ready", "confirmed"].includes(order.status) &&
          !order.riderId
        )
        .map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          buyerName: "Buyer", // Will be populated below
          deliveryAddress: order.deliveryAddress,
          deliveryPhone: order.deliveryPhone,
          deliveryLatitude: order.deliveryLatitude,
          deliveryLongitude: order.deliveryLongitude,
          createdAt: order.createdAt,
          total: order.total,
          status: order.status,
        }));

      // Populate buyer names
      const ordersWithBuyers = await Promise.all(
        pendingOrders.map(async (order) => {
          const fullOrder = allOrders.find(o => o.id === order.id);
          if (fullOrder?.buyerId) {
            const buyer = await storage.getUser(fullOrder.buyerId);
            return { ...order, buyerName: buyer?.name || "Unknown" };
          }
          return order;
        })
      );

      res.json(ordersWithBuyers);
    } catch (error: any) {
      console.error("Error fetching pending orders:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Get available riders for dispatch (approved, active, not currently on delivery)
  app.get("/api/admin/available-riders", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { orderLat, orderLng } = req.query;
      
      // Get all approved and active riders
      const allRiders = await storage.getUsersByRole("rider");
      const activeRiders = allRiders.filter(r => r.isApproved && r.isActive);
      
      // Get orders currently being delivered
      const allOrders = await storage.getAllOrders();
      const ridersOnDelivery = new Set(
        allOrders
          .filter(o => ["delivering", "picked_up", "en_route"].includes(o.status) && o.riderId)
          .map(o => o.riderId)
      );
      
      // Filter out riders currently on delivery
      const availableRiders = activeRiders
        .filter(r => !ridersOnDelivery.has(r.id))
        .map(rider => {
          let distanceToOrder: number | undefined;
          
          // Calculate distance if order location provided
          if (orderLat && orderLng && rider.businessAddress) {
            // For now, we'll leave distance as undefined
            // In production, you'd geocode the business address or store rider's current location
          }
          
          return {
            id: rider.id,
            name: rider.name,
            email: rider.email,
            phone: rider.phone,
            isAvailable: true,
            distanceToOrder,
          };
        });

      res.json(availableRiders);
    } catch (error: any) {
      console.error("Error fetching available riders:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Assign rider to order
  app.post("/api/orders/:orderId/assign-rider", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { orderId } = req.params;
      const { riderId } = req.body;

      if (!riderId) {
        return res.status(400).json({ error: "Rider ID is required" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      if (order.riderId) {
        return res.status(400).json({ error: "Order already has a rider assigned" });
      }

      const rider = await storage.getUser(riderId);
      if (!rider || rider.role !== "rider") {
        return res.status(404).json({ error: "Rider not found" });
      }

      if (!rider.isApproved || !rider.isActive) {
        return res.status(400).json({ error: "Rider is not available for deliveries" });
      }

      // Update order with rider assignment
      const updatedOrder = await storage.updateOrder(orderId, { 
        riderId,
        status: "assigned" as any,
      });

      // Create notification for rider
      await storage.createNotification({
        userId: riderId,
        type: "order",
        title: "New Delivery Assigned",
        message: `You have been assigned to deliver order #${order.orderNumber}. Please pick up the order from the seller.`,
        metadata: { link: `/rider/deliveries/${orderId}` } as any,
      });

      // Create notification for buyer
      await storage.createNotification({
        userId: order.buyerId,
        type: "order",
        title: "Rider Assigned",
        message: `A rider has been assigned to deliver your order #${order.orderNumber}. You can track the delivery in real-time.`,
        metadata: { link: `/track-order/${orderId}` } as any,
      });

      // Emit socket event for real-time update
      io.emit("order_rider_assigned", {
        orderId,
        riderId,
        riderName: rider.name,
        orderNumber: order.orderNumber,
      });

      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error assigning rider to order:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Auto-dispatch: Assign unassigned orders older than 60 minutes to nearest available rider
  // This should be called by a cron job or scheduled task
  app.post("/api/admin/auto-dispatch", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      const now = new Date();
      const ONE_HOUR = 60 * 60 * 1000;

      // Find orders that need auto-dispatch
      const overdueOrders = allOrders.filter(order => {
        if (order.deliveryMethod !== "rider") return false;
        if (order.riderId) return false; // Already assigned
        if (!["processing", "ready", "confirmed"].includes(order.status)) return false;
        
        const orderAge = now.getTime() - new Date(order.createdAt!).getTime();
        return orderAge >= ONE_HOUR;
      });

      if (overdueOrders.length === 0) {
        return res.json({ message: "No orders require auto-dispatch", assigned: 0 });
      }

      // Get available riders
      const allRiders = await storage.getUsersByRole("rider");
      const activeRiders = allRiders.filter(r => r.isApproved && r.isActive);
      
      const ridersOnDelivery = new Set(
        allOrders
          .filter(o => ["delivering", "picked_up", "en_route"].includes(o.status) && o.riderId)
          .map(o => o.riderId)
      );
      
      const availableRiders = activeRiders.filter(r => !ridersOnDelivery.has(r.id));

      if (availableRiders.length === 0) {
        return res.json({ message: "No available riders for auto-dispatch", assigned: 0, pending: overdueOrders.length });
      }

      let assignedCount = 0;
      
      // Simple round-robin assignment (in production, use proximity-based assignment)
      for (let i = 0; i < overdueOrders.length && i < availableRiders.length; i++) {
        const order = overdueOrders[i];
        const rider = availableRiders[i];

        await storage.updateOrder(order.id, { 
          riderId: rider.id,
          status: "assigned" as any,
        });

        await storage.createNotification({
          userId: rider.id,
          type: "order",
          title: "Auto-Assigned Delivery",
          message: `You have been auto-assigned to deliver order #${order.orderNumber}. This order has been waiting for pickup.`,
          metadata: { link: `/rider/deliveries/${order.id}` } as any,
        });

        io.emit("order_rider_assigned", {
          orderId: order.id,
          riderId: rider.id,
          riderName: rider.name,
          orderNumber: order.orderNumber,
          isAutoAssigned: true,
        });

        assignedCount++;
      }

      res.json({ 
        message: `Auto-dispatch completed`, 
        assigned: assignedCount,
        pending: overdueOrders.length - assignedCount
      });
    } catch (error: any) {
      console.error("Error in auto-dispatch:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Rider & Seller Analytics Routes ============
  app.get("/api/riders/:riderId/deliveries", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { riderId } = req.params;
      
      const deliveries = await storage.getOrdersByUser(riderId, "rider");
      
      res.json(deliveries);
    } catch (error: any) {
      console.error("Error fetching rider deliveries:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/riders/:riderId/earnings", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { riderId } = req.params;
      
      const deliveries = await db.query.orders.findMany({
        where: and(
          eq(orders.riderId, riderId),
          eq(orders.status, "delivered")
        ),
      });
      
      const totalDeliveries = deliveries.length;
      const totalEarnings = deliveries.reduce((sum, order) => {
        return sum + parseFloat(order.deliveryFee || "0");
      }, 0);
      
      const completedThisMonth = deliveries.filter(order => {
        const deliveredDate = order.deliveredAt ? new Date(order.deliveredAt) : null;
        if (!deliveredDate) return false;
        const now = new Date();
        return deliveredDate.getMonth() === now.getMonth() && 
               deliveredDate.getFullYear() === now.getFullYear();
      }).length;
      
      const earningsThisMonth = deliveries
        .filter(order => {
          const deliveredDate = order.deliveredAt ? new Date(order.deliveredAt) : null;
          if (!deliveredDate) return false;
          const now = new Date();
          return deliveredDate.getMonth() === now.getMonth() && 
                 deliveredDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, order) => sum + parseFloat(order.deliveryFee || "0"), 0);
      
      res.json({
        totalDeliveries,
        totalEarnings,
        completedThisMonth,
        earningsThisMonth,
        avgDeliveryFee: totalDeliveries > 0 ? totalEarnings / totalDeliveries : 0,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/sellers/:sellerId/sales", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      
      const sales = await storage.getOrdersByUser(sellerId, "seller");
      
      const totalSales = sales.length;
      const totalRevenue = sales.reduce((sum, order) => {
        return sum + parseFloat(order.total || "0");
      }, 0);
      
      const paidOrders = sales.filter(order => order.paymentStatus === "completed");
      const totalPaid = paidOrders.reduce((sum, order) => {
        return sum + parseFloat(order.total || "0");
      }, 0);
      
      const salesThisMonth = sales.filter(order => {
        const orderDate = order.createdAt ? new Date(order.createdAt) : null;
        if (!orderDate) return false;
        const now = new Date();
        return orderDate.getMonth() === now.getMonth() && 
               orderDate.getFullYear() === now.getFullYear();
      }).length;
      
      const revenueThisMonth = sales
        .filter(order => {
          const orderDate = order.createdAt ? new Date(order.createdAt) : null;
          if (!orderDate) return false;
          const now = new Date();
          return orderDate.getMonth() === now.getMonth() && 
                 orderDate.getFullYear() === now.getFullYear();
        })
        .reduce((sum, order) => sum + parseFloat(order.total || "0"), 0);
      
      res.json({
        sales,
        analytics: {
          totalSales,
          totalRevenue,
          totalPaid,
          salesThisMonth,
          revenueThisMonth,
          avgOrderValue: totalSales > 0 ? totalRevenue / totalSales : 0,
        }
      });
    } catch (error: any) {
      console.error("Error fetching seller sales:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Chat Routes ============
  app.get("/api/support/contacts", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Allow any authenticated user to get admin contacts for support
      const admins = await storage.getUsersByRole("admin");
      const adminsWithoutPasswords = admins.map(({ password, ...admin }) => admin);
      res.json(adminsWithoutPasswords);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Ensure IDs are strings for consistent socket room matching
      const senderId = String(req.user!.id);
      const receiverId = String(req.body.receiverId);
      
      const messageData = {
        senderId,
        receiverId,
        message: req.body.message,
        messageType: req.body.messageType || "text",
      };

      const message = await storage.createMessage(messageData);
      
      console.log(`📤 Message sent from ${senderId} to ${receiverId}`);
      
      // CRITICAL FIX: Broadcast to BOTH sender and receiver for instant message updates
      io.to(receiverId).emit("new_message", message);
      io.to(senderId).emit("new_message", message);
      
      const receiver = await storage.getUser(receiverId);
      const sender = await storage.getUser(senderId);
      
      // Notify admins about new messages to admin, agent, or super_admin
      if (receiver && (receiver.role === "admin" || receiver.role === "super_admin" || receiver.role === "agent")) {
        await notifyAdmins(
          "message",
          "New message received",
          `You have a new message from ${sender?.name || sender?.email || 'a user'}`,
          { messageId: message.id, senderId }
        );
      }
      
      // Create notification for non-admin receivers (riders, sellers, customers)
      if (receiver && !["admin", "super_admin", "agent"].includes(receiver.role || "")) {
        await storage.createNotification({
          userId: receiver.id,
          type: "message",
          title: "New message",
          message: `You have a new message from ${sender?.name || sender?.email || 'Support'}`,
          metadata: { messageId: message.id, senderId } as any,
        });
        
        // Also emit a notification event to the receiver's socket room
        io.to(receiverId).emit("notification", {
          type: "message",
          title: "New message",
          message: `You have a new message from ${sender?.name || sender?.email || 'Support'}`,
          data: { messageId: message.id, senderId },
        });
      }
      
      res.json(message);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/messages/:userId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const messages = await storage.getMessages(req.user!.id, req.params.userId);
      res.json(messages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/messages/:userId/read", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.markMessagesAsRead(req.params.userId, req.user!.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/messages/unread-count", requireAuth, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadMessageCount(req.user!.id);
      res.json({ count });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get message contacts for sellers (admins, agents, and buyers who have messaged)
  app.get("/api/seller/message-contacts", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get all admins, super_admins, and agents as potential contacts
      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      const agents = await storage.getUsersByRole("agent");
      
      // Get users who have had conversations with this seller
      const allMessages = await db.select({
        senderId: chatMessages.senderId,
        receiverId: chatMessages.receiverId,
      }).from(chatMessages).where(
        sql`${chatMessages.senderId} = ${userId} OR ${chatMessages.receiverId} = ${userId}`
      );
      
      const conversationPartners = new Set<string>();
      allMessages.forEach(msg => {
        if (msg.senderId !== userId) conversationPartners.add(msg.senderId);
        if (msg.receiverId !== userId) conversationPartners.add(msg.receiverId);
      });
      
      // Get user details for conversation partners
      const partnerUsers = await Promise.all(
        Array.from(conversationPartners).map(id => storage.getUser(id))
      );
      
      // Combine all contacts (admins + agents + conversation partners)
      const allContacts = [...admins, ...superAdmins, ...agents];
      partnerUsers.forEach(u => {
        if (u && !allContacts.some(c => c.id === u.id)) {
          allContacts.push(u);
        }
      });
      
      // Remove passwords and return
      const contacts = allContacts.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        isActive: u.isActive,
      }));
      
      res.json(contacts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get message contacts for riders (admins, agents, sellers, and buyers who have messaged)
  app.get("/api/rider/message-contacts", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      
      // Get all admins, super_admins, and agents as potential contacts
      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      const agents = await storage.getUsersByRole("agent");
      
      // Get users who have had conversations with this rider
      const allMessages = await db.select({
        senderId: chatMessages.senderId,
        receiverId: chatMessages.receiverId,
      }).from(chatMessages).where(
        sql`${chatMessages.senderId} = ${userId} OR ${chatMessages.receiverId} = ${userId}`
      );
      
      const conversationPartners = new Set<string>();
      allMessages.forEach(msg => {
        if (msg.senderId !== userId) conversationPartners.add(msg.senderId);
        if (msg.receiverId !== userId) conversationPartners.add(msg.receiverId);
      });
      
      // Get user details for conversation partners
      const partnerUsers = await Promise.all(
        Array.from(conversationPartners).map(id => storage.getUser(id))
      );
      
      // Combine all contacts (admins + agents + conversation partners)
      const allContacts = [...admins, ...superAdmins, ...agents];
      partnerUsers.forEach(u => {
        if (u && !allContacts.some(c => c.id === u.id)) {
          allContacts.push(u);
        }
      });
      
      // Remove passwords and return
      const contacts = allContacts.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        phone: u.phone,
        isActive: u.isActive,
      }));
      
      res.json(contacts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Presence API Endpoints (WhatsApp-style) ============
  
  // Get single user presence
  app.get("/api/presence/:userId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const presence = presenceService.getPresenceForApi(req.params.userId);
      res.json(presence);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get multiple users' presence (batch)
  app.post("/api/presence/batch", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { userIds } = req.body;
      if (!Array.isArray(userIds)) {
        return res.status(400).json({ error: "userIds must be an array" });
      }
      const presences = presenceService.getBatchPresence(userIds);
      res.json(presences);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get online users count (for dashboard)
  app.get("/api/presence/stats", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const stats = presenceService.getStats();
      res.json(stats);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Chat Permission API Endpoints (RBAC) ============
  
  // Check if current user can chat with target
  app.get("/api/chat/can-message/:targetUserId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await chatPermissionService.canInitiateChat(
        req.user!.id,
        req.params.targetUserId
      );
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get available chat contacts for current user
  app.get("/api/chat/contacts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const contacts = await chatPermissionService.getAvailableChatContacts(req.user!.id);
      
      // Also get support agents
      const agents = await storage.getUsersByRole("agent");
      const admins = await storage.getUsersByRole("admin");
      
      res.json({
        support: [...agents, ...admins].map(u => ({
          id: u.id,
          name: u.name,
          role: u.role,
          profileImage: u.profileImage,
          presence: presenceService.getPresenceForApi(u.id),
        })),
        orderRelated: contacts.orderRelated,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Jitsi Meet Video Call Endpoints ============
  
  // Start a call with another user
  app.post("/api/calls/start", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { targetUserId, callType, orderId } = req.body;
      
      if (!targetUserId) {
        return res.status(400).json({ error: "targetUserId is required" });
      }
      
      // Check permission
      const permission = await chatPermissionService.canInitiateChat(req.user!.id, targetUserId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
      
      const room = jitsiMeetService.startCall({
        initiatorId: req.user!.id,
        targetId: targetUserId,
        callType: callType || 'video',
        orderId: permission.orderId || orderId,
      });
      
      // Get current user info for Jitsi config
      const currentUser = await storage.getUser(req.user!.id);
      // Admins and super_admins are automatically moderators
      const isModerator = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
      const config = jitsiMeetService.getJitsiConfig(
        room.roomName,
        currentUser?.name || 'User',
        currentUser?.email,
        isModerator
      );
      
      // Notify target user about incoming call
      io.to(targetUserId).emit("jitsi_call_incoming", {
        roomName: room.roomName,
        roomUrl: room.roomUrl,
        callerId: req.user!.id,
        callerName: currentUser?.name || 'User',
        callType: room.callType,
      });
      
      res.json({
        room,
        config,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Start a group call
  app.post("/api/calls/group/start", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { participantIds, callType } = req.body;
      
      if (!Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({ error: "participantIds array is required" });
      }
      
      const room = jitsiMeetService.startGroupCall({
        hostId: req.user!.id,
        participantIds,
        callType: callType || 'video',
      });
      
      // Get current user info
      const currentUser = await storage.getUser(req.user!.id);
      // Admins and super_admins are automatically moderators
      const isModerator = currentUser?.role === 'admin' || currentUser?.role === 'super_admin';
      const config = jitsiMeetService.getJitsiConfig(
        room.roomName,
        currentUser?.name || 'User',
        currentUser?.email,
        isModerator
      );
      
      // Notify all participants about the group call
      for (const participantId of participantIds) {
        io.to(participantId).emit("jitsi_group_call_invite", {
          roomName: room.roomName,
          roomUrl: room.roomUrl,
          hostId: req.user!.id,
          hostName: currentUser?.name || 'User',
          callType: room.callType,
          participants: room.participants,
        });
      }
      
      res.json({
        room,
        config,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Join an existing call
  app.post("/api/calls/:roomName/join", requireAuth, async (req: AuthRequest, res) => {
    try {
      const room = jitsiMeetService.joinCall(req.params.roomName, req.user!.id);
      
      if (!room) {
        return res.status(404).json({ error: "Call not found or has ended" });
      }
      
      const currentUser = await storage.getUser(req.user!.id);
      // Admins joining become moderators, or the call creator is also moderator
      const isModerator = currentUser?.role === 'admin' || currentUser?.role === 'super_admin' || room.createdBy === req.user!.id;
      const config = jitsiMeetService.getJitsiConfig(
        room.roomName,
        currentUser?.name || 'User',
        currentUser?.email,
        isModerator
      );
      
      // Notify other participants
      for (const participantId of room.participants) {
        if (participantId !== req.user!.id) {
          io.to(participantId).emit("jitsi_participant_joined", {
            roomName: room.roomName,
            userId: req.user!.id,
            userName: currentUser?.name || 'User',
          });
        }
      }
      
      res.json({
        room,
        config,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Leave a call
  app.post("/api/calls/:roomName/leave", requireAuth, async (req: AuthRequest, res) => {
    try {
      const success = jitsiMeetService.leaveCall(req.params.roomName, req.user!.id);
      
      if (success) {
        // Notify other participants
        const room = jitsiMeetService.getRoom(req.params.roomName);
        if (room) {
          for (const participantId of room.participants) {
            io.to(participantId).emit("jitsi_participant_left", {
              roomName: req.params.roomName,
              userId: req.user!.id,
            });
          }
        }
      }
      
      res.json({ success });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Record a missed call (when call is rejected or not answered)
  app.post("/api/calls/missed", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { targetUserId, callType } = req.body;
      
      if (!targetUserId) {
        return res.status(400).json({ error: "targetUserId is required" });
      }
      
      // Get caller info
      const caller = await storage.getUser(req.user!.id);
      
      // Create a system message for missed call
      const { db } = await import("../db/index");
      const { chatMessages } = await import("@shared/schema");
      
      const missedCallMessage = await db.insert(chatMessages).values({
        senderId: req.user!.id,
        receiverId: targetUserId,
        message: `📞 Missed ${callType || 'voice'} call from ${caller?.name || 'User'}`,
        messageType: 'missed_call',
        status: 'delivered',
      }).returning();
      
      // Notify the target user about missed call
      io.to(targetUserId).emit("missed_call", {
        callerId: req.user!.id,
        callerName: caller?.name || 'User',
        callType: callType || 'voice',
        messageId: missedCallMessage[0]?.id,
      });
      
      res.json({ success: true, message: missedCallMessage[0] });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // End a call (host only or admin)
  app.post("/api/calls/:roomName/end", requireAuth, async (req: AuthRequest, res) => {
    try {
      const room = jitsiMeetService.getRoom(req.params.roomName);
      
      if (!room) {
        return res.status(404).json({ error: "Call not found" });
      }
      
      // Only host or admin can end the call
      const isAdmin = req.user!.role === 'admin' || req.user!.role === 'super_admin';
      if (room.createdBy !== req.user!.id && !isAdmin) {
        return res.status(403).json({ error: "Only call host or admin can end the call" });
      }
      
      // Notify all participants before ending
      for (const participantId of room.participants) {
        io.to(participantId).emit("jitsi_call_ended", {
          roomName: req.params.roomName,
          endedBy: req.user!.id,
        });
      }
      
      const success = jitsiMeetService.endCall(req.params.roomName);
      res.json({ success });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get active calls (admin dashboard)
  app.get("/api/calls/active", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const activeCalls = jitsiMeetService.getActiveRooms();
      const stats = jitsiMeetService.getStats();
      
      // Enrich with user details
      const enrichedCalls = await Promise.all(activeCalls.map(async (call) => {
        const participantDetails = await Promise.all(
          call.participants.map(async (pId) => {
            const user = await storage.getUser(pId);
            return user ? { id: user.id, name: user.name, role: user.role } : { id: pId };
          })
        );
        
        return {
          ...call,
          participantDetails,
        };
      }));
      
      res.json({
        calls: enrichedCalls,
        stats,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Live Support Dashboard Endpoints ============
  
  // Get all active support conversations (admin)
  app.get("/api/admin/live-support", requireAuth, requireRole("admin", "super_admin", "agent"), async (req: AuthRequest, res) => {
    try {
      // Get all recent messages grouped by conversation
      const recentMessages = await db.select()
        .from(chatMessages)
        .orderBy(desc(chatMessages.createdAt))
        .limit(500);
      
      // Group by conversation pairs
      const conversations = new Map<string, {
        participants: string[];
        lastMessage: typeof recentMessages[0];
        messageCount: number;
        unreadCount: number;
      }>();
      
      for (const msg of recentMessages) {
        const key = [msg.senderId, msg.receiverId].sort().join('-');
        const existing = conversations.get(key);
        
        if (!existing) {
          conversations.set(key, {
            participants: [msg.senderId, msg.receiverId],
            lastMessage: msg,
            messageCount: 1,
            unreadCount: msg.isRead ? 0 : 1,
          });
        } else {
          existing.messageCount++;
          if (!msg.isRead) existing.unreadCount++;
        }
      }
      
      // Enrich with user details and presence
      const enrichedConversations = await Promise.all(
        Array.from(conversations.entries()).map(async ([key, conv]) => {
          const [user1Id, user2Id] = conv.participants;
          const user1 = await storage.getUser(user1Id);
          const user2 = await storage.getUser(user2Id);
          
          const presence1 = presenceService.getPresenceForApi(user1Id);
          const presence2 = presenceService.getPresenceForApi(user2Id);
          
          // Determine if conversation is "active" (at least one participant online)
          const isActive = presence1.status === 'online' || presence2.status === 'online';
          
          // Check if both participants are admins (should be filtered from support)
          const adminRoles = ['admin', 'super_admin'];
          const isAdminToAdmin = adminRoles.includes(user1?.role || '') && adminRoles.includes(user2?.role || '');
          
          return {
            id: key,
            participants: [
              {
                id: user1Id,
                name: user1?.name || 'Unknown',
                role: user1?.role || 'unknown',
                presence: presence1,
              },
              {
                id: user2Id,
                name: user2?.name || 'Unknown',
                role: user2?.role || 'unknown',
                presence: presence2,
              },
            ],
            lastMessage: {
              message: conv.lastMessage.message,
              createdAt: conv.lastMessage.createdAt,
              senderId: conv.lastMessage.senderId,
            },
            messageCount: conv.messageCount,
            unreadCount: conv.unreadCount,
            isActive, // New: indicates if conversation has online participants
            isAdminToAdmin, // New: flag to filter admin-to-admin chats
          };
        })
      );
      
      // Filter out admin-to-admin conversations from support
      const supportConversations = enrichedConversations.filter(c => !c.isAdminToAdmin);
      
      // Sort by most recent activity
      supportConversations.sort((a, b) => 
        new Date(b.lastMessage.createdAt || 0).getTime() - new Date(a.lastMessage.createdAt || 0).getTime()
      );
      
      // Separate active vs all for dashboard
      const activeConversations = supportConversations.filter(c => c.isActive);
      
      res.json({
        conversations: supportConversations,
        activeConversations: activeConversations,
        stats: {
          totalConversations: supportConversations.length,
          activeConversations: activeConversations.length,
          onlineUsers: presenceService.getStats().online,
          activeCalls: jitsiMeetService.getStats().activeCalls,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin join conversation (read messages between two users)
  app.get("/api/admin/live-support/:user1Id/:user2Id", requireAuth, requireRole("admin", "super_admin", "agent"), async (req: AuthRequest, res) => {
    try {
      const { user1Id, user2Id } = req.params;
      
      const messages = await db.select()
        .from(chatMessages)
        .where(
          or(
            and(eq(chatMessages.senderId, user1Id), eq(chatMessages.receiverId, user2Id)),
            and(eq(chatMessages.senderId, user2Id), eq(chatMessages.receiverId, user1Id))
          )
        )
        .orderBy(chatMessages.createdAt);
      
      const user1 = await storage.getUser(user1Id);
      const user2 = await storage.getUser(user2Id);
      
      res.json({
        messages,
        participants: [
          {
            id: user1Id,
            name: user1?.name || 'Unknown',
            role: user1?.role || 'unknown',
            presence: presenceService.getPresenceForApi(user1Id),
          },
          {
            id: user2Id,
            name: user2?.name || 'Unknown',
            role: user2?.role || 'unknown',
            presence: presenceService.getPresenceForApi(user2Id),
          },
        ],
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin send message to conversation (as mediator)
  app.post("/api/admin/live-support/:targetUserId/message", requireAuth, requireRole("admin", "super_admin", "agent"), async (req: AuthRequest, res) => {
    try {
      const { targetUserId } = req.params;
      const { message } = req.body;
      
      const messageData = {
        senderId: req.user!.id,
        receiverId: targetUserId,
        message,
        messageType: "text",
      };
      
      const newMessage = await storage.createMessage(messageData);
      
      // Emit to target user
      io.to(targetUserId).emit("new_message", newMessage);
      io.to(req.user!.id).emit("new_message", newMessage);
      
      res.json(newMessage);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Message Delivery Stats (Admin) ============
  app.get("/api/admin/messaging-stats", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const presenceStats = presenceService.getStats();
      const deliveryStats = messageDeliveryService.getStats();
      const callStats = jitsiMeetService.getStats();
      
      res.json({
        presence: presenceStats,
        messageQueue: deliveryStats,
        calls: callStats,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Admin Audit Endpoints ============
  app.get("/api/admin/audit/incomplete-sellers", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const sellers = await storage.getUsersByRole("seller");
      
      // Enhanced criteria: check ALL critical seller attributes
      const incompleteSellers = sellers.filter((seller: User) => {
        const missing = [];
        if (!seller.storeType) missing.push("storeType");
        if (!seller.storeName) missing.push("storeName");
        if (!seller.storeDescription) missing.push("storeDescription");
        return missing.length > 0;
      });
      
      const sellerSummary = incompleteSellers.map((seller: User) => {
        const missingFields = [];
        if (!seller.storeType) missingFields.push("storeType");
        if (!seller.storeName) missingFields.push("storeName");
        if (!seller.storeDescription) missingFields.push("storeDescription");
        
        return {
          id: seller.id,
          name: seller.name,
          email: seller.email,
          isApproved: seller.isApproved,
          isActive: seller.isActive,
          storeType: seller.storeType,
          storeName: seller.storeName,
          storeDescription: seller.storeDescription,
          missingFields,
          severity: !seller.storeType ? "CRITICAL" : "WARNING", // Missing storeType blocks payment setup
          canBeApproved: !!seller.storeType, // Can only approve if storeType exists
        };
      });
      
      const critical = sellerSummary.filter(s => s.severity === "CRITICAL");
      const warnings = sellerSummary.filter(s => s.severity === "WARNING");
      
      res.json({
        summary: {
          total: sellers.length,
          complete: sellers.length - incompleteSellers.length,
          incomplete: incompleteSellers.length,
          critical: critical.length,
          warnings: warnings.length,
        },
        incompleteSellers: sellerSummary,
        remediation: {
          critical: critical.length > 0 
            ? `${critical.length} seller(s) missing CRITICAL storeType - they cannot access payment setup, create products, or be approved. Action required: Update their profile with a store type via Admin User Edit or ask them to complete their profile.`
            : "No critical issues!",
          warnings: warnings.length > 0
            ? `${warnings.length} seller(s) have incomplete profiles (missing storeName/storeDescription). While they can function, complete profiles improve marketplace quality.`
            : "All sellers have complete profiles!",
          actionItems: [
            critical.length > 0 && "1. Navigate to Admin > Users, find incomplete sellers, and add missing storeType",
            warnings.length > 0 && "2. Encourage sellers to complete their store description for better visibility",
            incompleteSellers.length === 0 && "✅ All sellers have complete profiles - no action needed!"
          ].filter(Boolean),
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Platform Settings ============
  app.get("/api/settings", async (req, res) => {
    try {
      let settings = await storage.getPlatformSettings();

      // If secrets are present in environment but not in DB, import them into DB
      const toUpdate: any = {};
      if (!settings.paystackSecretKey && process.env.PAYSTACK_SECRET_KEY) {
        toUpdate.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
      }
      if (!settings.paystackPublicKey && process.env.PAYSTACK_PUBLIC_KEY) {
        toUpdate.paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;
      }
      if (!settings.cloudinaryApiSecret && process.env.CLOUDINARY_API_SECRET) {
        toUpdate.cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
      }
      if (!settings.cloudinaryApiKey && process.env.CLOUDINARY_API_KEY) {
        toUpdate.cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
      }
      if (!settings.cloudinaryCloudName && process.env.CLOUDINARY_CLOUD_NAME) {
        toUpdate.cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
      }

      if (Object.keys(toUpdate).length > 0) {
        // Persist imported env settings so they become manageable via dashboard
        console.info('GET /api/settings: toUpdate keys', Object.keys(toUpdate), 'toUpdate preview', JSON.stringify(toUpdate));
        settings = await storage.updatePlatformSettings(toUpdate);
      }

      // Sanitize social links if sentinel was stored accidentally
      const socialKeysForSanitize = ['facebookUrl','instagramUrl','twitterUrl','linkedinUrl','youtubeUrl','tiktokUrl','pinterestUrl','whatsappPage'];
      for (const k of socialKeysForSanitize) {
        if ((settings as any)[k] === '__CLEAR__') {
          (settings as any)[k] = null;
        }
      }

      // Determine secret sources for transparency
      const getSource = (keyName: string | undefined, envVar?: string | undefined) => {
        if (keyName && envVar && keyName === envVar) return "env";
        if (keyName) return "db";
        if (!keyName && envVar) return "env-only"; // env present but not yet imported
        return "none";
      };

      const sanitizedSettings = {
        ...settings,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "••••••••••••••••" : "",
        paystackSecretKey: settings.paystackSecretKey ? "••••••••••••••••" : "",
        cloudinaryApiSecretSource: getSource(settings.cloudinaryApiSecret ?? undefined, process.env.CLOUDINARY_API_SECRET),
        cloudinaryApiKeySource: getSource(settings.cloudinaryApiKey ?? undefined, process.env.CLOUDINARY_API_KEY),
        cloudinaryCloudNameSource: getSource(settings.cloudinaryCloudName ?? undefined, process.env.CLOUDINARY_CLOUD_NAME),
        paystackSecretKeySource: getSource(settings.paystackSecretKey ?? undefined, process.env.PAYSTACK_SECRET_KEY),
        paystackPublicKeySource: getSource(settings.paystackPublicKey ?? undefined, process.env.PAYSTACK_PUBLIC_KEY),
      };
      res.json(sanitizedSettings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for platform settings (used by multi-vendor components)
  app.get("/api/platform-settings", async (req, res) => {
    try {
      let settings = await storage.getPlatformSettings();

      // Import env secrets to DB if missing (so they appear in admin dashboard)
      try {
        const toUpdate: any = {};
        if (!settings.paystackSecretKey && process.env.PAYSTACK_SECRET_KEY) {
          toUpdate.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
        }
        if (!settings.paystackPublicKey && process.env.PAYSTACK_PUBLIC_KEY) {
          toUpdate.paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;
        }
        if (!settings.cloudinaryApiSecret && process.env.CLOUDINARY_API_SECRET) {
          toUpdate.cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
        }
        if (!settings.cloudinaryApiKey && process.env.CLOUDINARY_API_KEY) {
          toUpdate.cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
        }
        if (!settings.cloudinaryCloudName && process.env.CLOUDINARY_CLOUD_NAME) {
          toUpdate.cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
        }

        if (Object.keys(toUpdate).length > 0) {
          settings = await storage.updatePlatformSettings(toUpdate);
        }
      } catch (err: any) {
        console.warn('[ROUTES] Failed to persist env secrets to platform_settings, continuing with retrieved defaults:', (err?.message || err));
      }

      // Determine secret sources for transparency
      const getSource = (keyName: string | undefined, envVar?: string | undefined) => {
        if (keyName && envVar && keyName === envVar) return "env";
        if (keyName) return "db";
        if (!keyName && envVar) return "env-only"; // env present but not yet imported
        return "none";
      };

      const sanitizedSettings = {
        ...settings,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "••••••••••••••••" : "",
        paystackSecretKey: settings.paystackSecretKey ? "••••••••••••••••" : "",
        cloudinaryApiSecretSource: getSource(settings.cloudinaryApiSecret ?? undefined, process.env.CLOUDINARY_API_SECRET),
        cloudinaryApiKeySource: getSource(settings.cloudinaryApiKey ?? undefined, process.env.CLOUDINARY_API_KEY),
        cloudinaryCloudNameSource: getSource(settings.cloudinaryCloudName ?? undefined, process.env.CLOUDINARY_CLOUD_NAME),
        paystackSecretKeySource: getSource(settings.paystackSecretKey ?? undefined, process.env.PAYSTACK_SECRET_KEY),
        paystackPublicKeySource: getSource(settings.paystackPublicKey ?? undefined, process.env.PAYSTACK_PUBLIC_KEY),
      };
      res.json(sanitizedSettings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Import environment secrets into DB (admin only)
  app.post("/api/settings/import-env", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const current = await storage.getPlatformSettings();
      const toUpdate: any = {};
      if (process.env.PAYSTACK_SECRET_KEY && !current.paystackSecretKey) toUpdate.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
      if (process.env.PAYSTACK_PUBLIC_KEY && !current.paystackPublicKey) toUpdate.paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;
      if (process.env.CLOUDINARY_API_SECRET && !current.cloudinaryApiSecret) toUpdate.cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
      if (process.env.CLOUDINARY_API_KEY && !current.cloudinaryApiKey) toUpdate.cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
      if (process.env.CLOUDINARY_CLOUD_NAME && !current.cloudinaryCloudName) toUpdate.cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;

      if (Object.keys(toUpdate).length === 0) {
        return res.json({ message: "No environment secrets to import", settings: current });
      }

      const updated = await storage.updatePlatformSettings(toUpdate);
      const sanitized = { ...updated, cloudinaryApiSecret: updated.cloudinaryApiSecret ? "••••••••••••••••" : "", paystackSecretKey: updated.paystackSecretKey ? "••••••••••••••••" : "" };
      res.json(sanitized);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Import only Paystack secrets from environment into DB
  app.post("/api/settings/import-paystack", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const current = await storage.getPlatformSettings();
      const toUpdate: any = {};
      if (process.env.PAYSTACK_SECRET_KEY && !current.paystackSecretKey) toUpdate.paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
      if (process.env.PAYSTACK_PUBLIC_KEY && !current.paystackPublicKey) toUpdate.paystackPublicKey = process.env.PAYSTACK_PUBLIC_KEY;

      if (Object.keys(toUpdate).length === 0) {
        return res.json({ message: "No Paystack environment secrets to import", settings: current });
      }

      const updated = await storage.updatePlatformSettings(toUpdate);
      const sanitized = { ...updated, paystackSecretKey: updated.paystackSecretKey ? "••••••••••••••••" : "", paystackPublicKey: updated.paystackPublicKey || "" };
      res.json(sanitized);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Import only Cloudinary secrets from environment into DB
  app.post("/api/settings/import-cloudinary", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const current = await storage.getPlatformSettings();
      const toUpdate: any = {};
      if (process.env.CLOUDINARY_API_SECRET && !current.cloudinaryApiSecret) toUpdate.cloudinaryApiSecret = process.env.CLOUDINARY_API_SECRET;
      if (process.env.CLOUDINARY_API_KEY && !current.cloudinaryApiKey) toUpdate.cloudinaryApiKey = process.env.CLOUDINARY_API_KEY;
      if (process.env.CLOUDINARY_CLOUD_NAME && !current.cloudinaryCloudName) toUpdate.cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;

      if (Object.keys(toUpdate).length === 0) {
        return res.json({ message: "No Cloudinary environment secrets to import", settings: current });
      }

      const updated = await storage.updatePlatformSettings(toUpdate);
      const sanitized = { ...updated, cloudinaryApiSecret: updated.cloudinaryApiSecret ? "••••••••••••••••" : "", cloudinaryApiKey: updated.cloudinaryApiKey || "", cloudinaryCloudName: updated.cloudinaryCloudName || "" };
      res.json(sanitized);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/settings", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    const start = Date.now();
    try {
      const previousSettings = await storage.getPlatformSettings();
      
      // Handle cloudinaryApiSecret: preserve existing if placeholder or empty is sent
      const updateData: any = { ...req.body };

      // Preserve sensitive fields when placeholders or empty values are submitted
      if (!updateData.cloudinaryApiSecret || updateData.cloudinaryApiSecret === "••••••••••••••••") {
        updateData.cloudinaryApiSecret = previousSettings.cloudinaryApiSecret;
      }
      if (!updateData.paystackSecretKey || updateData.paystackSecretKey === "••••••••••••••••") {
        updateData.paystackSecretKey = previousSettings.paystackSecretKey;
      }

      // Do not overwrite social links with empty strings accidentally - preserve previous unless explicitly set to null
      const socialKeys = ['facebookUrl','instagramUrl','twitterUrl','linkedinUrl','youtubeUrl','tiktokUrl','pinterestUrl','whatsappPage'];
      const keysToDelete = req.body._clearSocialKeys || []; // Support for clearing specific social keys
      
      for (const key of socialKeys) {
        // If admin explicitly requested to clear this key
        if (keysToDelete.includes(key)) {
          updateData[key] = null;
          continue;
        }
        
        if (key in updateData && typeof updateData[key] === 'string') {
          const trimmed = updateData[key].trim();
          if (trimmed === '') {
            // Empty string: Remove the key so updatePlatformSettings doesn't set it to empty string
            // This preserves the previous value
            delete updateData[key];
          } else {
            // Basic URL normalization: add https:// if missing
            if (!/^https?:\/\//i.test(trimmed)) {
              updateData[key] = `https://${trimmed}`;
            } else {
              updateData[key] = trimmed;
            }
          }
        }
      }
      
      // Remove the internal flag before storing
      delete updateData._clearSocialKeys;

      console.warn('DEBUG-UPDATE-PATCH-SETTINGS', JSON.stringify(updateData, null, 2));
      const settings = await storage.updatePlatformSettings(updateData);

      const duration = Date.now() - start;
      const userId = (req as any).user?.id || 'unknown';
      console.info(`PATCH /api/settings by user=${userId} keys=${Object.keys(req.body).join(',') || 'none'} duration=${duration}ms`);
      if (duration > 500) {
        console.warn(`PATCH /api/settings took ${duration}ms - investigate potential latency`);
      }

      // Handle automatic store updates when multi-vendor mode is toggled
      if (previousSettings.isMultiVendor !== settings.isMultiVendor) {
        if (settings.isMultiVendor) {
          // Multi-vendor mode turned ON: Create stores for approved sellers who don't have one
          const sellers = await storage.getUsersByRole("seller");
          for (const seller of sellers) {
            if (seller.isApproved) {
              const existingStore = await storage.getStoreByPrimarySeller(seller.id);
              if (!existingStore) {
                await storage.createStore({
                  primarySellerId: seller.id,
                  name: seller.storeName || seller.name + "'s Store",
                  description: seller.storeDescription || "",
                  logo: seller.storeBanner || "",
                  storeType: seller.storeType,
                  storeTypeMetadata: seller.storeTypeMetadata,
                  isActive: true,
                  isApproved: true
                });
              }
            }
          }
        } else {
          // Multi-vendor mode turned OFF: Keep existing stores but set a flag or notification
          // In single-store mode, all sellers share the platform (no action needed)
          console.log("Multi-vendor mode disabled - operating in single-store mode");
        }
      }
      
      res.json(settings);
    } catch (error: any) {
      const duration = Date.now() - start;
      console.error(`PATCH /api/settings failed after ${duration}ms:`, error?.message || error);
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Promotional ads CRUD (basic scaffolding)
  app.post('/api/admin/promotions', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const { type, targetId, targetIds, startAt, endAt, title, description, imageUrl, ctaText, ctaUrl, themeColor } = req.body;
      if (!['store', 'product'].includes(type)) return res.status(400).json({ error: 'Invalid type' });

      // Support bulk creation for products when targetIds array is provided
      if (type === 'product' && Array.isArray(targetIds) && targetIds.length > 0) {
        const createdRows = [] as any[];
        for (const tId of targetIds) {
          const created = await storage.createPromotionalAd({ type, targetId: tId, startAt: startAt ? new Date(startAt) : null, endAt: endAt ? new Date(endAt) : null, createdBy: (req as any).user?.id, title: title || null, description: description || null, imageUrl: imageUrl || null, ctaText: ctaText || null, ctaUrl: ctaUrl || null, themeColor: themeColor || null });
          createdRows.push(created);
        }
        res.json(createdRows);
        return;
      }

      const created = await storage.createPromotionalAd({ type, targetId: targetId || '', startAt: startAt ? new Date(startAt) : null, endAt: endAt ? new Date(endAt) : null, createdBy: (req as any).user?.id, title: title || null, description: description || null, imageUrl: imageUrl || null, ctaText: ctaText || null, ctaUrl: ctaUrl || null, themeColor: themeColor || null });
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/admin/promotions', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const rows = await storage.getAllPromotionalAds();
      // Enrich with store/product details for admin UI
      const enriched = await Promise.all(rows.map(async (r: any) => {
        if (r.type === 'store') {
          const store = await storage.getStore(r.targetId).catch(() => null);
          return { ...r, store };
        }
        if (r.type === 'product') {
          const product = await storage.getProduct(r.targetId).catch(() => null);
          return { ...r, product };
        }
        return r;
      }));
      res.json(enriched);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/admin/promotions/:id/expire', requireAuth, requireRole('admin', 'super_admin'), async (req, res) => {
    try {
      const id = req.params.id;
      await storage.expirePromotionById(id);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Public: homepage promotions
  app.get('/api/homepage/promotional', async (req, res) => {
    try {
      const rows = await storage.getActivePromotionalAds();
      console.log('[PROMO-API] Retrieved active promos:', rows.length, 'rows');
      // Enrich with store or product info for frontend display
      const enriched = await Promise.all(rows.map(async (r: any) => {
        if (r.type === 'store') {
          const store = await storage.getStore(r.targetId).catch((err) => { console.warn('[PROMO-API] Failed to get store', r.targetId, err.message); return null; });
          return { ...r, store };
        }
        if (r.type === 'product') {
          const product = await storage.getProduct(r.targetId).catch((err) => { console.warn('[PROMO-API] Failed to get product', r.targetId, err.message); return null; });
          return { ...r, product };
        }
        return r;
      }));
      console.log('[PROMO-API] Enriched:', enriched.length, 'items');
      res.json(enriched);
    } catch (e: any) {
      console.error('[PROMO-API] Error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  // ============ Role Features Management (Super Admin Only) ============
  app.get("/api/role-features", requireAuth, requireRole("super_admin"), async (req, res) => {
    try {
      const { role } = req.query;
      const features = await storage.getRoleFeatures(role as string | undefined);
      res.json(features);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put("/api/role-features/:role", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    try {
      const { role } = req.params;
      const { features } = req.body;
      
      if (!features || typeof features !== 'object') {
        return res.status(400).json({ error: "Features object is required" });
      }
      
      const updatedFeatures = await storage.updateRoleFeatures(
        role,
        features,
        req.user!.id
      );
      
      res.json(updatedFeatures);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Payment Routes (Paystack) ============
  app.post("/api/payments/initialize", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { orderId, checkoutSessionId } = req.body;
      
      if (!orderId && !checkoutSessionId) {
        return res.status(400).json({ error: "Either Order ID or Checkout Session ID is required" });
      }
      
      // Get platform settings for Paystack key
      const settings = await storage.getPlatformSettings();
      if (!settings.paystackSecretKey) {
        return res.status(503).json({ 
          error: "Payment gateway not configured", 
          userMessage: "Payment system is currently unavailable. Please contact support or try again later."
        });
      }
      
      // Determine if this is multi-vendor (session-based) or single-vendor payment
      const isMultiVendor = !!checkoutSessionId;
      let orders: any[] = [];
      let totalAmount = 0;
      
      if (isMultiVendor) {
        // Multi-vendor: Fetch all orders in the session
        const allOrders = await storage.getAllOrders();
        orders = allOrders.filter((o: any) => o.checkoutSessionId === checkoutSessionId);
        
        if (orders.length === 0) {
          return res.status(404).json({ 
            error: "No orders found for this checkout session", 
            userMessage: "We couldn't find any orders for this checkout. Please try again." 
          });
        }
        
        // Verify the user owns all orders in this session
        const allOwnedByUser = orders.every((o: any) => o.buyerId === req.user!.id);
        if (!allOwnedByUser) {
          return res.status(403).json({ 
            error: "Unauthorized to pay for these orders", 
            userMessage: "You don't have permission to pay for these orders." 
          });
        }
        
        // Prevent double payment - check if any order is already paid
        const anyAlreadyPaid = orders.some((o: any) => o.paymentStatus === "completed");
        if (anyAlreadyPaid) {
          return res.status(400).json({ 
            error: "One or more orders are already paid", 
            userMessage: "Some of these orders have already been paid for." 
          });
        }
        
        // Calculate total amount across all orders
        totalAmount = orders.reduce((sum: number, order: any) => sum + parseFloat(order.total), 0);
        
      } else {
        // Single-vendor: Load and validate single order
        const order = await storage.getOrder(orderId);
        if (!order) {
          return res.status(404).json({ error: "Order not found", userMessage: "We couldn't find this order. Please check your order history." });
        }
        
        // Verify the user owns this order
        if (order.buyerId !== req.user!.id) {
          return res.status(403).json({ error: "Unauthorized to pay for this order", userMessage: "You don't have permission to pay for this order." });
        }
        
        // Prevent double payment
        if (order.paymentStatus === "completed") {
          return res.status(400).json({ error: "Order is already paid", userMessage: "This order has already been paid for." });
        }
        
        orders = [order];
        totalAmount = parseFloat(order.total);
      }
      
      // Validate order amount
      if (totalAmount <= 0) {
        return res.status(400).json({ error: "Invalid order amount", userMessage: "Order amount must be greater than zero." });
      }
      
      // Initialize payment with Paystack with timeout
      const callbackUrl = `${req.protocol}://${req.get('host')}/payment/verify`;
      
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000); // 15 second timeout
      
      // Prepare payment payload (use helper for base structure)
      // Compute total processing fee across orders and ensure it is set as transaction_charge
      const processingFeeTotal = orders.reduce((s: number, o: any) => s + (parseFloat(o.processingFee || "0") || 0), 0);

      // Use the Paystack payload builder for a consistent base payload, then extend
      const baseForHelper = {
        id: orders[0].id,
        orderNumber: orders[0].orderNumber,
        total: totalAmount.toFixed(2),
        currency: orders[0].currency,
        buyerId: req.user!.id,
        paystackSubaccountId: undefined,
      } as any;

      const helperSettings = { defaultCommissionRate: settings.defaultCommissionRate } as any;
      const basePayload = buildPaystackInitializePayload(baseForHelper, helperSettings);

      const paymentPayload: any = {
        ...basePayload,
        email: req.user!.email,
        amount: Math.round(totalAmount * 100), // Total in kobo/pesewas (includes processing fee)
        currency: orders[0].currency,
        channels: ["card", "bank_transfer", "mobile_money"],
        callback_url: callbackUrl,
        transaction_charge: Math.round(processingFeeTotal * 100), // pass processing fee to Paystack (kobo)
        metadata: {
          ...(basePayload.metadata || {}),
          userId: req.user!.id,
          buyerId: req.user!.id,
          isMultiVendor,
          processingFeeTotal: processingFeeTotal.toFixed(2),
          ...(isMultiVendor ? {
            checkoutSessionId,
            orderIds: orders.map((o: any) => o.id),
            orderNumbers: orders.map((o: any) => o.orderNumber).join(", "),
          } : {
            orderId: orders[0].id,
            orderNumber: orders[0].orderNumber,
          }),
        },
      };

      // Build split payment configuration
      if (isMultiVendor) {
        // Multi-vendor: Build subaccounts array with splits for each seller
        const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "1");
        const subaccounts: any[] = [];
        const storeErrors: string[] = [];
        
        for (const order of orders) {
          if (order.storeId) {
            try {
              const store = await storage.getStore(order.storeId);
              if (!store) {
                storeErrors.push(`Store not found for order ${order.orderNumber}`);
                continue;
              }
              
              if (!store.paystackSubaccountId || !store.isPayoutVerified) {
                storeErrors.push(`Store ${store.name} is not configured for payments`);
                continue;
              }
              
              // Calculate seller's share for this order excluding processing fee
              const orderAmount = parseFloat(order.total);
              const orderProcessingFee = parseFloat(order.processingFee || "0");
              const amountExcludingProcessing = Math.max(0, orderAmount - orderProcessingFee);

              const sellerShare = Math.round(amountExcludingProcessing * (100 - commissionRate) / 100 * 100); // In kobo

              // Only include as Paystack subaccount if seller uses bank account payouts
              if (store.payoutType === 'bank_account' && store.paystackSubaccountId) {
                subaccounts.push({
                  subaccount: store.paystackSubaccountId,
                  share: sellerShare,
                });
              } else {
                // For mobile money recipients, include payout info in metadata for post-processing
                paymentPayload.metadata = paymentPayload.metadata || {};
                paymentPayload.metadata.mobilePayouts = paymentPayload.metadata.mobilePayouts || [];
                paymentPayload.metadata.mobilePayouts.push({
                  storeId: store.id,
                  sellerId: store.primarySellerId,
                  provider: store.payoutDetails?.provider,
                  mobileNumber: store.payoutDetails?.mobileNumber,
                  amountKobo: sellerShare,
                });
              }
            } catch (storeError) {
              storeErrors.push(`Failed to fetch store for order ${order.orderNumber}`);
              console.error("Store fetch error:", storeError);
            }
          }
        }
        
        // Fail fast if any seller missing subaccount
        if (storeErrors.length > 0) {
          return res.status(400).json({
            error: "Payment configuration incomplete",
            userMessage: `Some sellers are not set up for payments: ${storeErrors.join("; ")}`,
            details: storeErrors,
          });
        }
        
        if (subaccounts.length > 0) {
          paymentPayload.subaccounts = subaccounts;
          paymentPayload.bearer = "account"; // Platform bears Paystack fees
          paymentPayload.metadata.splitEnabled = true;
          paymentPayload.metadata.commissionRate = commissionRate;
        } else {
          // No subaccounts (e.g., all sellers use mobile money); ensure split metadata flags are explicit
          paymentPayload.metadata.splitEnabled = false;
          paymentPayload.metadata.commissionRate = commissionRate;
        }
        
      } else {
        // Single-vendor: Original split logic
        const order = orders[0];
        if (order.storeId) {
          try {
            const store = await storage.getStore(order.storeId);
            if (store && store.paystackSubaccountId && store.isPayoutVerified) {
              const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "1");

              // Only assign as Paystack subaccount when seller uses bank account payouts
              if (store.payoutType === 'bank_account') {
                paymentPayload.subaccount = store.paystackSubaccountId;
                // Let Paystack charge processing fee from the transaction_charge (set above)
                paymentPayload.bearer = "account"; // Platform bears Paystack fees

                paymentPayload.metadata.storeId = store.id;
                paymentPayload.metadata.storeName = store.name;
                paymentPayload.metadata.commissionRate = commissionRate;
                paymentPayload.metadata.splitEnabled = true;
              } else {
                // For mobile money, include payout info for post-processing and do not set subaccount
                paymentPayload.metadata.storeId = store.id;
                paymentPayload.metadata.storeName = store.name;
                paymentPayload.metadata.commissionRate = commissionRate;
                paymentPayload.metadata.splitEnabled = false;
                paymentPayload.metadata.mobilePayout = paymentPayload.metadata.mobilePayout || {};
                paymentPayload.metadata.mobilePayout[store.id] = {
                  provider: store.payoutDetails?.provider,
                  mobileNumber: store.payoutDetails?.mobileNumber,
                };
              }
            }
          } catch (storeError) {
            console.warn("Could not fetch store for split payment:", storeError);
          }
        }
      }
      
      try {
        // Create a persistent idempotency key in DB so retries can be correlated and audited
        const idempotencyPayload = {
          orderIds: orders.map(o => o.id),
          checkoutSessionId: paymentPayload.metadata.checkoutSessionId || null,
          buyerId: req.user?.id || null,
        };
        const { key: idempotencyKey } = await storage.createIdempotencyKey(`init-${Date.now()}-${Math.random().toString(36).slice(2,8)}`, idempotencyPayload);

        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.paystackSecretKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(paymentPayload),
          signal: controller.signal,
        });
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return res.status(502).json({ 
            error: errorData.message || "Payment gateway error",
            userMessage: "Unable to connect to payment gateway. Please try again in a few moments."
          });
        }

        const data = await response.json();
        // Log initialize response and associate Paystack reference with idempotency (if reference present)
        try {
          if (data?.data?.reference) {
            // Mark the idempotency key with the eventual Paystack reference so webhooks can correlate
            await storage.markIdempotencyUsed(idempotencyKey, data.data.reference);
          }
        } catch (e) {
          console.warn('[PAYMENTS] Could not associate idempotency key with reference', (e as any).message || e);
        }
        console.info(`[PAYMENTS] Paystack initialize response: reference=${data?.data?.reference} status=${data?.status}`);
        
        if (!data.status) {
          return res.status(400).json({ 
            error: data.message || "Payment initialization failed",
            userMessage: data.message || "Unable to initialize payment. Please try again."
          });
        }

        if (!data.data?.authorization_url || !data.data?.reference) {
          return res.status(502).json({ 
            error: "Invalid payment gateway response",
            userMessage: "Payment system returned invalid data. Please try again."
          });
        }

        // Store the payment reference on all orders
        const updatePromises = orders.map((order: any) => 
          storage.updateOrder(order.id, {
            paymentReference: data.data.reference,
            paymentStatus: "processing",
          })
        );
        await Promise.all(updatePromises);

        console.log(`✅ Payment initialized for ${isMultiVendor ? `${orders.length} orders in session ${checkoutSessionId}` : `order ${orders[0].orderNumber}`}`);

        res.json(data.data);
      } catch (fetchError: any) {
        clearTimeout(timeout);
        
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ 
            error: "Payment gateway timeout",
            userMessage: "Payment gateway is taking too long to respond. Please check your internet connection and try again."
          });
        }
        
        return res.status(502).json({ 
          error: "Failed to connect to payment gateway",
          userMessage: "Unable to reach payment gateway. Please check your internet connection and try again."
        });
      }
    } catch (error: any) {
      console.error("Payment initialization error:", error);
      res.status(500).json({ 
        error: error.message || "Internal server error",
        userMessage: "An unexpected error occurred while processing your payment. Please try again or contact support."
      });
    }
  });

  app.get("/api/payments/verify/:reference", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { reference } = req.params;
      
      if (!reference) {
        return res.status(400).json({ error: "Payment reference is required", userMessage: "Invalid payment reference." });
      }
      
      // Delegate to shared helper function (reused by public verification)
      const result = await verifyReferenceAndProcess(reference, req.user?.id);
      res.json(result);
    } catch (error: any) {
      console.error("Payment verification error:", error);
      res.status(500).json({ 
        error: error.message || "Internal server error",
        userMessage: "An unexpected error occurred while verifying your payment. Please contact support with your payment reference."
      });
    }
  });

  // Public verification endpoint used when the user is redirected from Paystack and may not be authenticated
  app.get("/api/payments/verify-public/:reference", async (req, res) => {
    try {
      const { reference } = req.params;
      if (!reference) {
        return res.status(400).json({ error: "Payment reference is required", userMessage: "Invalid payment reference." });
      }

      // Reuse same verification helper but without a current user id (no ownership checks)
      const result = await verifyReferenceAndProcess(reference, undefined);
      res.json(result);
    } catch (error: any) {
      console.error("Payment verification public error:", error);
      res.status(500).json({ 
        error: error.message || "Internal server error",
        userMessage: "An unexpected error occurred while verifying your payment. Please contact support with your payment reference."
      });
    }
  });

  // Shared helper: verify reference with Paystack and process transaction; if `currentUserId` provided, perform ownership checks
  async function verifyReferenceAndProcess(reference: string, currentUserId?: string | undefined) {
    // Get platform settings for Paystack key
    const settings = await storage.getPlatformSettings();
    if (!settings.paystackSecretKey) {
      throw new Error("Payment gateway not configured");
    }

    // Check if transaction already exists (idempotency)
    const existingTransaction = await storage.getTransactionByReference(reference);
    if (existingTransaction) {
      const order = await storage.getOrder(existingTransaction.orderId);
      return { transaction: existingTransaction, verified: existingTransaction.status === "completed", orderId: existingTransaction.orderId, message: "Transaction already processed" };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${settings.paystackSecretKey}` },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Payment verification failed");
      }

      const data = await response.json();
      if (!data.status) {
        throw new Error(data.message || "Payment verification failed");
      }

      const isMultiVendor = data.data.metadata?.isMultiVendor || false;
      let orders: any[] = [];

      if (isMultiVendor) {
        const orderIds = data.data.metadata.orderIds || [];
        if (!Array.isArray(orderIds) || orderIds.length === 0) {
          throw new Error("Invalid multi-vendor payment data");
        }

        const allOrders = await storage.getAllOrders();
        orders = allOrders.filter((o: any) => orderIds.includes(o.id));
        if (orders.length !== orderIds.length) {
          throw new Error("Some orders not found");
        }

        // If a currentUserId is provided, ensure they own all orders; otherwise skip ownership check
        if (currentUserId) {
          const allOwnedByUser = orders.every((o: any) => o.buyerId === currentUserId);
          if (!allOwnedByUser) throw new Error("Unauthorized to verify these payments");
        }

        const allMatchReference = orders.every((o: any) => o.paymentReference === reference);
        if (!allMatchReference) throw new Error("Payment reference mismatch");

        const totalExpected = orders.reduce((sum: number, o: any) => sum + parseFloat(o.total), 0);
        const expectedAmount = Math.round(totalExpected * 100);
        if (data.data.amount !== expectedAmount) throw new Error("Payment amount mismatch");

      } else {
        const orderId = data.data.metadata?.orderId;
        if (!orderId) throw new Error("Invalid payment data");

        const order = await storage.getOrder(orderId);
        if (!order) throw new Error("Order not found");

        if (currentUserId && order.buyerId !== currentUserId) throw new Error("Unauthorized to verify payment for this order");

        if (order.paymentReference !== reference) throw new Error("Payment reference mismatch");

        const expectedAmount = Math.round(parseFloat(order.total) * 100);
        if (data.data.amount !== expectedAmount) throw new Error("Payment amount mismatch");

        if (data.data.currency !== order.currency) throw new Error("Currency mismatch");

        orders = [order];
      }

      if (orders.length === 0) throw new Error("No orders found in payment session");
      const primaryOrder = orders[0];

      try {
        const { processPaystackChargeSuccess } = await import('./payments');
        await processPaystackChargeSuccess(data.data, storage, io);
      } catch (procErr: any) {
        console.error('[VERIFY] Error processing payment via shared helper:', procErr?.message || procErr);
      }

      const transaction = await storage.getTransactionByReference(reference);

      return {
        transaction,
        verified: data.data.status === 'success',
        orderId: primaryOrder.id,
        orderIds: orders.map((o: any) => o.id),
        isMultiVendor,
        orderCount: orders.length,
        message: data.data.status === 'success' ? 'Payment verified successfully' : data.data.gateway_response || 'Payment failed'
      };
    } catch (fetchError: any) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        throw new Error('Payment verification timeout');
      }
      throw fetchError;
    }
  }

  // ============ Paystack Webhook Handler ============
  // Note: Uses raw body for HMAC signature verification (captured via express.json verify hook)
  app.post("/api/webhooks/paystack", async (req, res) => {
    try {
      const crypto = await import('crypto');
      const settings = await storage.getPlatformSettings();
      
      if (!settings.paystackSecretKey) {
        console.error('[WEBHOOK] Paystack secret key not configured');
        return res.status(503).json({ error: "Payment gateway not configured" });
      }

      // Verify webhook signature using raw body (HMAC SHA-512)
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error('[WEBHOOK] Missing raw body for signature verification');
        return res.status(400).json({ error: "Invalid request format" });
      }

      const hash = crypto
        .createHmac('sha512', settings.paystackSecretKey)
        .update(rawBody)
        .digest('hex');

      const paystackSignature = req.headers['x-paystack-signature'];
      if (hash !== paystackSignature) {
        console.error('[SECURITY] Invalid Paystack webhook signature', {
          expected: hash.substring(0, 20) + '...',
          received: typeof paystackSignature === 'string' ? paystackSignature.substring(0, 20) + '...' : 'missing'
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body as any;
      console.log('[WEBHOOK] Paystack event received:', event.event);

      // Handle different webhook events
      if (event.event === 'charge.success') {
        const data = event.data;
        const reference = data?.reference;
        try {
          // Attempt to find an idempotency key correlated to this reference
          let idemp = reference ? await storage.getIdempotencyByReference(reference) : undefined;

          // Fallback: if Paystack metadata included a session id, try to find init key
          if (!idemp && data?.metadata?.checkoutSessionId) {
            idemp = await storage.getIdempotencyKey(`init-${data.metadata.checkoutSessionId}`);
          }

          // If no idempotency record exists, create a lightweight one keyed by reference
          const idempotencyKey = idemp?.key ?? `paystack-ref-${reference || Date.now()}`;
          if (!idemp) {
            await storage.createIdempotencyKey(idempotencyKey, { reference, metadata: data?.metadata || null });
          }

          // Track retry attempts and alert if too many
          const retries = await storage.incrementIdempotencyRetry(idempotencyKey).catch(() => 0);
          if (retries > 5) {
            // Notify admins of repeated webhook retries for same reference
            try {
              await notifyAdmins('payment_webhook_retries', 'Repeated webhook retries', `Paystack reference ${reference} has ${retries} webhook attempts`, { reference, retries });
            } catch (notifyErr) {
              console.error('[WEBHOOK] notifyAdmins failed', notifyErr);
            }
            console.warn(`[WEBHOOK] Repeated webhook retries for reference ${reference}: ${retries}`);
          }

          // Delegate processing to shared helper
          try {
            const { processPaystackChargeSuccess } = await import('./payments');
            await processPaystackChargeSuccess(data, storage, io);
            console.log('[WEBHOOK] Payment processed successfully (charge.success)');

            // Mark idempotency record used (associate with reference)
            await storage.markIdempotencyUsed(idempotencyKey, reference).catch(() => {});
          } catch (innerErr: any) {
            console.error('[WEBHOOK] Error processing charge.success:', innerErr?.message || innerErr);
            // don't fail the webhook - log and return 200 so Paystack won't retry indefinitely for non-retriable issues
          }
        } catch (outerErr: any) {
          console.error('[WEBHOOK] Unexpected error while handling charge.success:', outerErr?.message || outerErr);
        }
      } else if (event.event === 'charge.failed') {
        console.log('[WEBHOOK] Payment failed:', event.data.reference);
      }

      res.json({ status: "success" });
    } catch (error: any) {
      console.error('[WEBHOOK] Error processing webhook:', error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // ============ Commission Calculation Helper ============
  async function calculateAndRecordCommission(orderId: string) {
    try {
      // CRITICAL: Use atomic transaction method with idempotency
      const { commission, earning } = await storage.createCommissionWithEarning(orderId);
      
      console.log(`[COMMISSION] ✅ Recorded commission for order ${orderId}:`);
      console.log(`  - Order Amount: ${commission.orderAmount}`);
      console.log(`  - Commission Rate: ${commission.commissionRate}%`);
      console.log(`  - Platform: ${commission.platformAmount}`);
      console.log(`  - Seller: ${commission.sellerAmount}`);
      console.log(`  - Earning ID: ${earning.id}`);
    } catch (error: any) {
      // Handle idempotent retry (webhook duplicate)
      if (error.code === 'COMMISSION_ALREADY_EXISTS') {
        console.log(`[COMMISSION] ⏭️  Commission already calculated for order ${orderId}, skipping (idempotent)`);
        return; // Safe to ignore - webhook retry
      }

      // Handle validation errors
      if (error.code === 'ORDER_NOT_FOUND') {
        console.error(`[COMMISSION] ❌ Order ${orderId} not found`);
        throw error; // Propagate - this is a real error
      }

      if (error.code === 'PAYMENT_NOT_COMPLETED') {
        console.error(`[COMMISSION] ❌ Order ${orderId} payment not completed:`, error.message);
        throw error; // Propagate - shouldn't calculate commission yet
      }

      if (error.code === 'MISSING_SELLER') {
        console.error(`[COMMISSION] ❌ Order ${orderId} missing seller`);
        throw error; // Propagate - data integrity issue
      }

      if (error.code === 'CALCULATION_ERROR') {
        console.error(`[COMMISSION] ❌ Commission calculation error:`, error.message);
        throw error; // Propagate - arithmetic mismatch
      }

      // Unknown error
      console.error('[COMMISSION] ❌ Unexpected error calculating commission:', error);
      throw error; // Propagate - don't silently fail
    }
  }

  // ============ Seller Payout Routes ============
  
  // Get seller available balance
  app.get("/api/seller/balance", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      const balance = await storage.getSellerAvailableBalance(user.id);
      const commissions = await storage.getSellerCommissions(user.id, 'pending');
      
      res.json({ 
        availableBalance: balance,
        pendingCommissions: commissions.length,
        currency: 'GHS'
      });
    } catch (error) {
      console.error('[BALANCE] Error fetching seller balance:', error);
      res.status(500).json({ error: "Failed to fetch balance" });
    }
  });

  // Get seller commissions
  app.get("/api/seller/commissions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      const { status } = req.query;
      const commissions = await storage.getSellerCommissions(
        user.id, 
        status as string | undefined
      );
      
      res.json(commissions);
    } catch (error) {
      console.error('[COMMISSIONS] Error fetching commissions:', error);
      res.status(500).json({ error: "Failed to fetch commissions" });
    }
  });

  // Request seller payout
  app.post("/api/seller/payout", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      const { amount, method, bankDetails, notes } = req.body;

      // Validate input
      if (!amount || !method) {
        return res.status(400).json({ error: "Amount and method are required" });
      }

      // Create payout request
      const payout = await storage.createSellerPayout({
        sellerId: user.id,
        amount: amount.toString(),
        currency: 'GHS',
        method,
        bankDetails,
        notes,
      });

      console.log(`[PAYOUT] ✅ Seller ${user.email} requested payout of ${amount}`);
      
      res.json(payout);
    } catch (error: any) {
      console.error('[PAYOUT] Error creating payout request:', error);
      
      // Handle specific validation errors
      if (error.code === 'SELLER_NOT_FOUND') {
        return res.status(404).json({ error: error.message || 'Seller not found' });
      }
      if (error.code === 'BELOW_MINIMUM_PAYOUT') {
        return res.status(400).json({ error: error.message || 'Payout amount below minimum' });
      }
      if (error.code === 'INVALID_AMOUNT') {
        return res.status(400).json({ error: error.message || 'Invalid payout amount' });
      }
      if (error.code === 'INSUFFICIENT_BALANCE') {
        return res.status(400).json({ error: error.message || 'Insufficient balance' });
      }
      if (error.code === 'AMOUNT_NOT_COMPOSABLE') {
        return res.status(400).json({ error: error.message || 'Cannot compose exact payout amount from available commissions' });
      }
      if (error.code === 'MISSING_BANK_DETAILS' || error.code === 'MISSING_MOBILE_NUMBER') {
        return res.status(400).json({ error: error.message || 'Payment details required' });
      }
      
      res.status(500).json({ error: "Failed to create payout request" });
    }
  });

  // Get seller payout history
  app.get("/api/seller/payouts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      const payouts = await storage.getSellerPayouts(user.id);
      res.json(payouts);
    } catch (error) {
      console.error('[PAYOUTS] Error fetching seller payouts:', error);
      res.status(500).json({ error: "Failed to fetch payouts" });
    }
  });

  // ============ Admin Payout Management Routes ============
  
  // Get all pending payouts (admin only)
  app.get("/api/admin/payouts/pending", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const payouts = await storage.getAllPendingPayouts();
      res.json(payouts);
    } catch (error) {
      console.error('[ADMIN-PAYOUTS] Error fetching pending payouts:', error);
      res.status(500).json({ error: "Failed to fetch pending payouts" });
    }
  });

  // Process payout (admin only)
  app.patch("/api/admin/payouts/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status || !['processing', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be processing, completed, or failed" });
      }

      const updated = await storage.updatePayoutStatus(id, status, user.id);
      
      if (!updated) {
        return res.status(404).json({ error: "Payout not found" });
      }

      console.log(`[ADMIN-PAYOUT] ✅ Admin ${user.email} updated payout ${id} to ${status}`);
      
      res.json(updated);
    } catch (error) {
      console.error('[ADMIN-PAYOUT] Error processing payout:', error);
      res.status(500).json({ error: "Failed to process payout" });
    }
  });

  // ============ Analytics Routes ============
  app.get("/api/analytics", requireAuth, async (req: AuthRequest, res) => {
    try {
      const analytics = await storage.getAnalytics(req.user!.id, req.user!.role);
      res.json(analytics);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Socket.IO for Real-time Chat ============
  const userSockets = new Map<string, string>();

  // Helper function to send notifications to all admins and super_admins
  async function notifyAdmins(type: string, title: string, message: string, metadata?: Record<string, any>) {
    try {
      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      const allAdmins = [...admins, ...superAdmins];
      
      for (const admin of allAdmins) {
        // Save notification to database
        await storage.createNotification({
          userId: admin.id,
          type: type as any,
          title,
          message,
          metadata,
        });
        
        // Send real-time notification via Socket.IO
        if (admin.id) {
          io.to(admin.id).emit("notification", {
            title,
            message,
            type: "default",
          });
        }
      }
    } catch (error) {
      console.error("Error notifying admins:", error);
    }
  }

  // ============ Initialize WhatsApp-style Services ============
  presenceService.initialize(io);
  messageDeliveryService.initialize(io);
  // chatPermissionService uses storage adapter, initialize with storage functions
  chatPermissionService.initialize({
    getUser: async (userId: string) => {
      const user = await storage.getUser(userId);
      return user ? { id: user.id, role: user.role as any } : null;
    },
    getOrdersByBuyer: async (buyerId: string) => {
      const buyerOrders = await storage.getAllOrders();
      return buyerOrders.filter((o: any) => o.buyerId === buyerId);
    },
    getOrdersBySeller: async (sellerId: string) => {
      const sellerOrders = await storage.getAllOrders();
      return sellerOrders.filter((o: any) => o.sellerId === sellerId);
    },
    getOrdersByRider: async (riderId: string) => {
      const riderOrders = await storage.getAllOrders();
      return riderOrders.filter((o: any) => o.riderId === riderId);
    },
    getActiveOrderBetweenUsers: async (userId1: string, userId2: string) => {
      const allOrders = await storage.getAllOrders();
      return allOrders.find((o: any) => 
        ((o.buyerId === userId1 && (o.sellerId === userId2 || o.riderId === userId2)) ||
         (o.buyerId === userId2 && (o.sellerId === userId1 || o.riderId === userId1)) ||
         (o.sellerId === userId1 && o.riderId === userId2) ||
         (o.sellerId === userId2 && o.riderId === userId1)) &&
        ['pending', 'confirmed', 'processing', 'ready_for_pickup', 'assigned_to_rider', 'picked_up', 'in_transit', 'out_for_delivery'].includes(o.status)
      ) || null;
    },
  });
  console.log('[BOOT] WhatsApp-style messaging services initialized');

  io.on("connection", (socket) => {
    const userId = socket.data.userId; // From authentication middleware
    const userEmail = socket.data.userEmail;
    
    console.log(`✅ User connected: ${userEmail} (${userId})`);
    
    // Track user socket for online status (legacy)
    userSockets.set(userId, socket.id);
    io.emit("user_online", userId);
    
    // Register with presence service
    presenceService.userConnected(userId, socket.id);
    
    // Deliver any queued messages for this user
    messageDeliveryService.onUserOnline(userId);

    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${userEmail} (${userId})`);
      userSockets.delete(userId);
      io.emit("user_offline", userId);
      
      // Update presence service
      presenceService.userDisconnected(userId);
    });

    // Heartbeat for presence tracking
    socket.on("heartbeat", () => {
      presenceService.heartbeat(userId);
    });

    socket.on("typing", ({ receiverId }) => {
      io.to(receiverId).emit("user_typing", socket.id);
      presenceService.setTyping(userId, receiverId);
    });

    socket.on("stop_typing", ({ receiverId }) => {
      io.to(receiverId).emit("user_stop_typing", socket.id);
      presenceService.setTyping(userId, null);
    });
    
    // Message acknowledgment events
    socket.on("message_received", ({ messageId }) => {
      messageDeliveryService.markDelivered(messageId, userId);
    });
    
    socket.on("messages_read", ({ messageIds }) => {
      messageDeliveryService.markRead(messageIds, userId);
    });

    // WebRTC Call Signaling Events
    socket.on("call-offer", ({ receiverId, offer, callType, callerId, callerName }) => {
      console.log(`Call offer from ${callerId} to ${receiverId} (${callType})`);
      io.to(receiverId).emit("call-incoming", { 
        callerId, 
        callerName, 
        offer, 
        callType 
      });
    });

    socket.on("call-answer", ({ callerId, answer }) => {
      console.log(`Call answer sent to ${callerId}`);
      io.to(callerId).emit("call-answered", { answer });
    });

    socket.on("ice-candidate", ({ targetId, candidate }) => {
      io.to(targetId).emit("ice-candidate", { candidate });
    });

    socket.on("call-rejected", ({ callerId }) => {
      console.log(`Call rejected, notifying ${callerId}`);
      io.to(callerId).emit("call-rejected");
    });

    socket.on("call-ended", ({ targetId }) => {
      console.log(`Call ended, notifying ${targetId}`);
      io.to(targetId).emit("call-ended");
    });

    // Admin WebRTC Call Signaling Events (underscore-based for admin calling feature)
    socket.on("call_initiate", async ({ targetUserId }) => {
      try {
        const callerId = socket.data.userId;
        const callerRole = socket.data.userRole;
        
        const caller = await storage.getUser(callerId);
        if (!caller) {
          socket.emit("error", { message: "Caller not found" });
          return;
        }

        console.log(`📞 Call initiated from ${caller.name} (${callerId}) to ${targetUserId}`);
        
        io.to(targetUserId).emit("call_initiate", {
          callerId,
          callerName: caller.name,
          callerRole
        });
      } catch (error) {
        console.error("Error initiating call:", error);
        socket.emit("error", { message: "Failed to initiate call" });
      }
    });

    socket.on("call_offer", async ({ offer, targetUserId, callType }) => {
      try {
        const callerId = socket.data.userId;
        const caller = await storage.getUser(callerId);
        
        if (!caller) {
          socket.emit("error", { message: "Caller not found" });
          return;
        }

        console.log(`📞 Call offer (${callType}) from ${caller.name} to ${targetUserId}`);
        io.to(targetUserId).emit("call_offer", {
          offer,
          callerId,
          callerName: caller.name,
          callType
        });
      } catch (error) {
        console.error("Error handling call offer:", error);
        socket.emit("error", { message: "Failed to initiate call" });
      }
    });

    socket.on("call_answer", ({ answer, targetUserId }) => {
      console.log(`📞 Call answer from ${socket.data.userId} to ${targetUserId}`);
      io.to(targetUserId).emit("call_answer", { answer });
    });

    socket.on("ice_candidate", ({ candidate, targetUserId }) => {
      io.to(targetUserId).emit("ice_candidate", { candidate });
    });

    socket.on("call_end", ({ targetUserId }) => {
      console.log(`📞 Call ended by ${socket.data.userId}, notifying ${targetUserId}`);
      if (targetUserId) {
        io.to(targetUserId).emit("call_end");
      }
    });

    // Group Call Handlers for Multi-Party WebRTC (Super Admin Feature)
    // Uses mesh topology: each participant connects to every other participant
    const activeGroupCalls = new Map<string, { callId: string; hostId: string; participants: Set<string>; callType: 'voice' | 'video' }>();

    socket.on("group_call_start", async ({ participantIds, callType }) => {
      try {
        const hostId = socket.data.userId;
        const host = await storage.getUser(hostId);
        
        if (!host) {
          socket.emit("error", { message: "Host not found" });
          return;
        }

        // Only super_admin can start group calls
        if (host.role !== "super_admin" && host.role !== "admin") {
          socket.emit("error", { message: "Only admins can start group calls" });
          return;
        }

        const callId = `group_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        const participants = new Set([hostId, ...participantIds]);

        activeGroupCalls.set(callId, {
          callId,
          hostId,
          participants,
          callType
        });

        console.log(`🎥 Group call ${callId} started by ${host.name} with ${participants.size} participants`);

        // Notify all participants (excluding host who initiated)
        for (const participantId of participantIds) {
          io.to(participantId).emit("group_call_invite", {
            callId,
            hostId,
            hostName: host.name,
            participantIds: Array.from(participants),
            callType
          });
        }

        // Confirm to host
        socket.emit("group_call_started", {
          callId,
          participants: Array.from(participants),
          callType
        });
      } catch (error) {
        console.error("Error starting group call:", error);
        socket.emit("error", { message: "Failed to start group call" });
      }
    });

    socket.on("group_call_join", async ({ callId }) => {
      try {
        const userId = socket.data.userId;
        const user = await storage.getUser(userId);
        
        if (!user) {
          socket.emit("error", { message: "User not found" });
          return;
        }

        const call = activeGroupCalls.get(callId);
        if (!call) {
          socket.emit("error", { message: "Group call not found" });
          return;
        }

        call.participants.add(userId);

        console.log(`🎥 ${user.name} joined group call ${callId}`);

        // Notify all existing participants about the new joiner
        for (const participantId of Array.from(call.participants)) {
          if (participantId !== userId) {
            io.to(participantId).emit("group_call_participant_joined", {
              callId,
              userId,
              userName: user.name,
              participants: Array.from(call.participants)
            });
          }
        }

        // Send current participant list to the new joiner
        socket.emit("group_call_joined", {
          callId,
          participants: Array.from(call.participants),
          callType: call.callType
        });
      } catch (error) {
        console.error("Error joining group call:", error);
        socket.emit("error", { message: "Failed to join group call" });
      }
    });

    socket.on("group_call_offer", ({ callId, targetUserId, offer }) => {
      const userId = socket.data.userId;
      const call = activeGroupCalls.get(callId);
      
      if (!call || !call.participants.has(userId) || !call.participants.has(targetUserId)) {
        return;
      }

      console.log(`🎥 Group call offer: ${userId} → ${targetUserId} in ${callId}`);
      io.to(targetUserId).emit("group_call_offer", {
        callId,
        fromUserId: userId,
        offer
      });
    });

    socket.on("group_call_answer", ({ callId, targetUserId, answer }) => {
      const userId = socket.data.userId;
      const call = activeGroupCalls.get(callId);
      
      if (!call || !call.participants.has(userId) || !call.participants.has(targetUserId)) {
        return;
      }

      console.log(`🎥 Group call answer: ${userId} → ${targetUserId} in ${callId}`);
      io.to(targetUserId).emit("group_call_answer", {
        callId,
        fromUserId: userId,
        answer
      });
    });

    socket.on("group_ice_candidate", ({ callId, targetUserId, candidate }) => {
      const userId = socket.data.userId;
      const call = activeGroupCalls.get(callId);
      
      if (!call || !call.participants.has(userId) || !call.participants.has(targetUserId)) {
        return;
      }

      io.to(targetUserId).emit("group_ice_candidate", {
        callId,
        fromUserId: userId,
        candidate
      });
    });

    socket.on("group_call_leave", ({ callId }) => {
      const userId = socket.data.userId;
      const call = activeGroupCalls.get(callId);
      
      if (!call || !call.participants.has(userId)) {
        return;
      }

      call.participants.delete(userId);
      console.log(`🎥 User ${userId} left group call ${callId}`);

      // Notify remaining participants
      for (const participantId of Array.from(call.participants)) {
        io.to(participantId).emit("group_call_participant_left", {
          callId,
          userId,
          participants: Array.from(call.participants)
        });
      }

      // Clean up call if no participants remain
      if (call.participants.size === 0) {
        activeGroupCalls.delete(callId);
        console.log(`🎥 Group call ${callId} ended (no participants)`);
      }
    });

    socket.on("group_call_end", ({ callId }) => {
      const userId = socket.data.userId;
      const call = activeGroupCalls.get(callId);
      
      if (!call) {
        return;
      }

      // Only host can end the entire call
      if (call.hostId !== userId) {
        socket.emit("error", { message: "Only host can end the group call" });
        return;
      }

      console.log(`🎥 Group call ${callId} ended by host ${userId}`);

      // Notify all participants
      for (const participantId of Array.from(call.participants)) {
        io.to(participantId).emit("group_call_ended", { callId });
      }

      activeGroupCalls.delete(callId);
    });

    // WhatsApp-style message status handlers (SECURED with ownership validation)
    socket.on("message_delivered", async ({ messageId }) => {
      try {
        const receiverId = socket.data.userId; // Authenticated user from middleware
        const { db } = await import("../db/index");
        const { chatMessages } = await import("@shared/schema");
        const { eq, and, sql: drizzleSql } = await import("drizzle-orm");

        // Fetch message to validate receiver ownership
        const message = await db.query.chatMessages.findFirst({
          where: eq(chatMessages.id, messageId)
        });

        // Validate: Message must exist AND authenticated user must be the receiver
        if (!message || message.receiverId !== receiverId) {
          console.debug(`❌ Invalid message_delivered: messageId=${messageId}, userId=${receiverId}`);
          return; // Silently ignore to avoid leaking message existence
        }

        // Mark message as delivered (idempotent - only if currently 'sent')
        await db
          .update(chatMessages)
          .set({ 
            status: drizzleSql`'delivered'::message_status`,
            deliveredAt: new Date() 
          })
          .where(
            and(
              eq(chatMessages.id, messageId),
              drizzleSql`status = 'sent'::message_status`
            )
          );

        // Notify sender of delivery status using senderId from message record
        io.to(message.senderId).emit("message_status_updated", {
          messageId,
          status: "delivered",
          deliveredAt: new Date().toISOString()
        });

        console.debug(`✅ Message delivered: ${messageId} from ${message.senderId} to ${receiverId}`);
      } catch (error) {
        console.error("Error marking message as delivered:", error);
        socket.emit("error", { message: "Failed to update message status" });
      }
    });

    socket.on("message_read", async ({ messageId }) => {
      try {
        const receiverId = socket.data.userId; // Authenticated user from middleware
        const { db } = await import("../db/index");
        const { chatMessages } = await import("@shared/schema");
        const { eq, and, sql: drizzleSql } = await import("drizzle-orm");

        // Fetch message to validate receiver ownership
        const message = await db.query.chatMessages.findFirst({
          where: eq(chatMessages.id, messageId)
        });

        // Validate: Message must exist AND authenticated user must be the receiver
        if (!message || message.receiverId !== receiverId) {
          console.debug(`❌ Invalid message_read: messageId=${messageId}, userId=${receiverId}`);
          return; // Silently ignore to avoid leaking message existence
        }

        // Mark message as read (idempotent - set delivered if null, always set read)
        const now = new Date();
        await db
          .update(chatMessages)
          .set({ 
            status: drizzleSql`'read'::message_status`,
            isRead: true,
            readAt: now,
            deliveredAt: drizzleSql`COALESCE(delivered_at, ${now})`
          })
          .where(eq(chatMessages.id, messageId));

        // Notify sender of read status using senderId from message record
        io.to(message.senderId).emit("message_status_updated", {
          messageId,
          status: "read",
          readAt: now.toISOString(),
          deliveredAt: now.toISOString()
        });

        console.debug(`✅ Message read: ${messageId} from ${message.senderId} to ${receiverId}`);
      } catch (error) {
        console.error("Error marking message as read:", error);
        socket.emit("error", { message: "Failed to update message status" });
      }
    });

    // Real-time message sending handler
    socket.on("new_message", async ({ receiverId, message }) => {
      try {
        const senderId = socket.data.userId; // Authenticated user from middleware
        
        if (!receiverId || !message?.trim()) {
          socket.emit("error", { message: "Receiver ID and message are required" });
          return;
        }

        // Create message in database
        const { db } = await import("../db/index");
        const { chatMessages } = await import("@shared/schema");
        
        const [newMessage] = await db.insert(chatMessages).values({
          senderId,
          receiverId,
          message: message.trim(),
          status: 'sent',
          isRead: false
        }).returning();

        console.debug(`✅ New message from ${senderId} to ${receiverId}: ${newMessage.id}`);

        // Broadcast to receiver in real-time
        io.to(receiverId).emit("new_message", {
          id: newMessage.id,
          senderId: newMessage.senderId,
          receiverId: newMessage.receiverId,
          message: newMessage.message,
          status: newMessage.status,
          isRead: newMessage.isRead,
          createdAt: newMessage.createdAt,
          deliveredAt: newMessage.deliveredAt,
          readAt: newMessage.readAt
        });

        // Acknowledge to sender
        socket.emit("message_sent", {
          id: newMessage.id,
          tempId: message.tempId, // For optimistic UI updates
          status: 'sent',
          createdAt: newMessage.createdAt
        });

        // Create notification for the receiver
        try {
          const receiver = await storage.getUser(receiverId);
          const sender = await storage.getUser(senderId);
          
          if (receiver) {
            // Create notification in database
            await storage.createNotification({
              userId: receiverId,
              type: "message",
              title: "New message",
              message: `You have a new message from ${sender?.name || sender?.email || 'Support'}`,
            });
            
            // Emit notification event
            io.to(receiverId).emit("notification", {
              type: "message",
              title: "New message",
              message: `You have a new message from ${sender?.name || sender?.email || 'Support'}`,
              data: { messageId: newMessage.id, senderId },
            });
          }
        } catch (notifyError) {
          console.error("Error creating message notification:", notifyError);
        }

      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });
  });

  // ============ Customer Support Routes ============
  app.get("/api/support/conversations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const { db } = await import("../db/index");
      const { supportConversations, supportMessages, users } = await import("@shared/schema");
      const { eq, desc, or } = await import("drizzle-orm");

      let conversationsQuery;
      
      if (user.role === "agent" || user.role === "admin") {
        // Agents and admins see all conversations
        conversationsQuery = db
          .select({
            id: supportConversations.id,
            customerId: supportConversations.customerId,
            customerName: users.name,
            customerEmail: users.email,
            agentId: supportConversations.agentId,
            agentName: users.name,
            status: supportConversations.status,
            subject: supportConversations.subject,
            lastMessage: supportConversations.lastMessage,
            createdAt: supportConversations.createdAt,
            updatedAt: supportConversations.updatedAt,
          })
          .from(supportConversations)
          .leftJoin(users, eq(supportConversations.customerId, users.id))
          .orderBy(desc(supportConversations.updatedAt));
      } else {
        // Customers see only their conversations
        conversationsQuery = db
          .select({
            id: supportConversations.id,
            customerId: supportConversations.customerId,
            customerName: users.name,
            customerEmail: users.email,
            agentId: supportConversations.agentId,
            agentName: users.name,
            status: supportConversations.status,
            subject: supportConversations.subject,
            lastMessage: supportConversations.lastMessage,
            createdAt: supportConversations.createdAt,
            updatedAt: supportConversations.updatedAt,
          })
          .from(supportConversations)
          .leftJoin(users, eq(supportConversations.customerId, users.id))
          .where(eq(supportConversations.customerId, user.id))
          .orderBy(desc(supportConversations.updatedAt));
      }

      const result = await conversationsQuery;
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { subject, message } = req.body;
      const user = req.user!;
      
      if (!subject || !message) {
        return res.status(400).json({ error: "Subject and message are required" });
      }

      const { db } = await import("../db/index");
      const { supportConversations, supportMessages } = await import("@shared/schema");

      // Create conversation
      const [conversation] = await db.insert(supportConversations).values({
        customerId: user.id,
        subject,
        lastMessage: message,
        status: "open",
      }).returning();

      // Create first message
      await db.insert(supportMessages).values({
        conversationId: conversation.id,
        senderId: user.id,
        message,
      });

      res.json(conversation);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/support/conversations/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const { db } = await import("../db/index");
      const { supportMessages, supportConversations, users } = await import("@shared/schema");
      const { eq, asc, or } = await import("drizzle-orm");

      // Check access
      const [conversation] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (user.role !== "agent" && user.role !== "admin" && conversation.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get messages with sender info
      const messages = await db
        .select({
          id: supportMessages.id,
          senderId: supportMessages.senderId,
          senderName: users.name,
          message: supportMessages.message,
          createdAt: supportMessages.createdAt,
        })
        .from(supportMessages)
        .leftJoin(users, eq(supportMessages.senderId, users.id))
        .where(eq(supportMessages.conversationId, id))
        .orderBy(asc(supportMessages.createdAt));

      res.json(messages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/messages", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { message } = req.body;
      const user = req.user!;
      const { db } = await import("../db/index");
      const { supportMessages, supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      if (!message) {
        return res.status(400).json({ error: "Message is required" });
      }

      // Check access
      const [conversation] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (user.role !== "agent" && user.role !== "admin" && conversation.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Create message
      const [newMessage] = await db.insert(supportMessages).values({
        conversationId: id,
        senderId: user.id,
        message,
      }).returning();

      // Update conversation last message and timestamp
      await db
        .update(supportConversations)
        .set({ lastMessage: message, updatedAt: new Date() })
        .where(eq(supportConversations.id, id));

      res.json(newMessage);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/assign", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;

      if (req.user?.role !== "agent" && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Only agents and admins can assign conversations" });
      }

      const { db } = await import("../db/index");
      const { supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [updated] = await db
        .update(supportConversations)
        .set({ agentId: user.id, status: "assigned", updatedAt: new Date() })
        .where(eq(supportConversations.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/resolve", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;

      if (req.user?.role !== "agent" && req.user?.role !== "admin") {
        return res.status(403).json({ error: "Only agents and admins can resolve conversations" });
      }

      const { db } = await import("../db/index");
      const { supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [updated] = await db
        .update(supportConversations)
        .set({ status: "resolved", updatedAt: new Date() })
        .where(eq(supportConversations.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Category Fields Routes (Admin Only) ============
  app.post("/api/category-fields", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const field = await storage.createCategoryField(req.body);
      res.json(field);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/category-fields", async (req, res) => {
    try {
      const { category } = req.query;
      const fields = await storage.getCategoryFields(category as string);
      res.json(fields);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/category-fields/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const field = await storage.updateCategoryField(req.params.id, req.body);
      if (!field) {
        return res.status(404).json({ error: "Category field not found" });
      }
      res.json(field);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/category-fields/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const success = await storage.deleteCategoryField(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Category field not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Store Routes ============
  app.post("/api/stores", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const storeData = {
        ...req.body,
        primarySellerId: req.user!.role === "seller" ? req.user!.id : req.body.primarySellerId,
      };
      const store = await storage.createStore(storeData);
      res.json(store);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/stores", async (req, res) => {
    try {
      const { isActive, isApproved } = req.query;
      const stores = await storage.getStores({
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
        isApproved: isApproved === "true" ? true : isApproved === "false" ? false : undefined,
      });
      res.json(stores);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get current seller's store (auto-create if missing)
  app.get("/api/stores/my-store", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      console.log(`[/api/stores/my-store] Request from seller ${req.user!.id}`);
      
      try {
        // Use centralized helper (requireApproval=true ensures only approved sellers get stores)
        const store = await storage.ensureStoreForSeller(req.user!.id, { requireApproval: true });
        console.log(`[/api/stores/my-store] Returning store ${store.id} for seller ${req.user!.id}`);
        res.json(store);
      } catch (storeError: any) {
        console.log(`[/api/stores/my-store] Failed to ensure store for seller ${req.user!.id}:`, storeError.message);
        
        // Return appropriate error based on issue
        if (storeError.message.includes("not approved")) {
          return res.status(403).json({ 
            error: "Your seller account is pending approval. Please wait for an admin to review your application.",
            code: "PENDING_APPROVAL"
          });
        } else if (storeError.message.includes("store type")) {
          return res.status(400).json({ 
            error: "Store setup incomplete. Please update your profile with a store type.",
            code: "MISSING_STORE_TYPE"
          });
        } else {
          return res.status(500).json({ 
            error: `Failed to set up store: ${storeError.message}`,
            code: "STORE_CREATION_FAILED"
          });
        }
      }
    } catch (error: any) {
      console.error(`[/api/stores/my-store] Unexpected error for seller ${req.user!.id}:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/stores/:id", async (req, res) => {
    try {
      const store = await storage.getStore(req.params.id);
      if (!store) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json(store);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/stores/:storeId/categories", async (req, res) => {
    try {
      const categories = await storage.getCategoriesByStore(req.params.storeId);
      res.json(categories);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/stores/by-seller/:sellerId", async (req, res) => {
    try {
      const store = await storage.getStoreByPrimarySeller(req.params.sellerId);
      if (!store) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json(store);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/stores/:id", requireAuth, requireRole("admin", "seller"), async (req: AuthRequest, res) => {
    try {
      const store = await storage.getStore(req.params.id);
      if (!store) {
        return res.status(404).json({ error: "Store not found" });
      }

      // Sellers can only update their own store
      if (req.user!.role === "seller" && store.primarySellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updated = await storage.updateStore(req.params.id, req.body);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/stores/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
    try {
      const success = await storage.deleteStore(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Store not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Category Routes ============
  app.post("/api/categories", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const category = await storage.createCategory(req.body);
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/categories", async (req, res) => {
    try {
      const { isActive } = req.query;
      const categories = await storage.getCategories({
        isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
      });
      res.json(categories);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/categories/:id", async (req, res) => {
    try {
      const category = await storage.getCategory(req.params.id);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/categories/by-slug/:slug", async (req, res) => {
    try {
      const category = await storage.getCategoryBySlug(req.params.slug);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(category);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/categories/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateCategory(req.params.id, req.body);
      if (!updated) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/categories/:id", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const success = await storage.deleteCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Category not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Category Migration Endpoint (Admin only) - Backfill categoryId from legacy category text
  app.post("/api/admin/migrate-categories", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const { dryRun = true } = req.body;
      
      // Default categories with unique names and proper storeType enum values
      const defaultCategories: Array<{ name: string; description: string; storeTypes: string[]; image: string }> = [
        { name: "Abayas", description: "Traditional modest outerwear", storeTypes: ["clothing"], image: "https://images.unsplash.com/photo-1601924994987-69e26d50dc26?w=400" },
        { name: "Hijabs", description: "Head coverings and scarves", storeTypes: ["clothing"], image: "https://images.unsplash.com/photo-1583292650898-7d22cd27ca6f?w=400" },
        { name: "Modest Dresses", description: "Modest dresses and gowns", storeTypes: ["clothing"], image: "https://images.unsplash.com/photo-1595777457583-95e059d581b8?w=400" },
        { name: "Fashion Accessories", description: "Clothing and fashion accessories", storeTypes: ["clothing"], image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?w=400" },
        
        { name: "Smartphones", description: "Mobile phones and smartphones", storeTypes: ["electronics"], image: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=400" },
        { name: "Laptops & Computers", description: "Notebooks and desktop computers", storeTypes: ["electronics"], image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400" },
        { name: "Tablets", description: "Tablet devices and accessories", storeTypes: ["electronics"], image: "https://images.unsplash.com/photo-1561154464-82e9adf32764?w=400" },
        { name: "Electronic Accessories", description: "Chargers, cases, and tech accessories", storeTypes: ["electronics"], image: "https://images.unsplash.com/photo-1572569511254-d8f925fe2cbb?w=400" },
        
        { name: "Skincare", description: "Face and body skincare products", storeTypes: ["beauty_cosmetics"], image: "https://images.unsplash.com/photo-1556228578-dd1cbb5ab546?w=400" },
        { name: "Makeup & Cosmetics", description: "Beauty and makeup products", storeTypes: ["beauty_cosmetics"], image: "https://images.unsplash.com/photo-1522338242992-e1a54906a8da?w=400" },
        { name: "Haircare", description: "Hair products and treatments", storeTypes: ["beauty_cosmetics"], image: "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?w=400" },
        { name: "Fragrances", description: "Perfumes and scents", storeTypes: ["beauty_cosmetics"], image: "https://images.unsplash.com/photo-1541643600914-78b084683601?w=400" },
        
        { name: "Furniture", description: "Home and office furniture", storeTypes: ["home_garden"], image: "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=400" },
        { name: "Home Decor", description: "Decorative items and accessories", storeTypes: ["home_garden"], image: "https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=400" },
        { name: "Garden & Outdoor", description: "Garden tools and outdoor supplies", storeTypes: ["home_garden"], image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400" },
        { name: "Kitchen Essentials", description: "Cookware and kitchen accessories", storeTypes: ["home_garden"], image: "https://images.unsplash.com/photo-1556911220-bff31c812dba?w=400" },
        
        { name: "Books", description: "Physical and digital books", storeTypes: ["books_media"], image: "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=400" },
        { name: "Magazines", description: "Periodicals and magazines", storeTypes: ["books_media"], image: "https://images.unsplash.com/photo-1604431696980-07b2b9e5a8d1?w=400" },
        { name: "Audio & Music", description: "Audiobooks, music, and audio media", storeTypes: ["books_media"], image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400" },
        { name: "Digital Media", description: "Digital downloads and e-content", storeTypes: ["books_media"], image: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=400" },
        
        { name: "Sports Equipment", description: "Athletic and sports equipment", storeTypes: ["sports_fitness"], image: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=400" },
        { name: "Athletic Apparel", description: "Sportswear and athletic clothing", storeTypes: ["sports_fitness"], image: "https://images.unsplash.com/photo-1556906781-9a412961c28c?w=400" },
        { name: "Fitness Supplements", description: "Nutritional and fitness supplements", storeTypes: ["sports_fitness"], image: "https://images.unsplash.com/photo-1593095948071-474c5cc2989d?w=400" },
        { name: "Sports Accessories", description: "Sports gear and accessories", storeTypes: ["sports_fitness"], image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=400" },
        
        { name: "Packaged Foods", description: "Packaged and processed foods", storeTypes: ["food_beverages"], image: "https://images.unsplash.com/photo-1534483509719-3feaee7c30da?w=400" },
        { name: "Beverages", description: "Drinks and liquid refreshments", storeTypes: ["food_beverages"], image: "https://images.unsplash.com/photo-1437418747212-8d9709afab22?w=400" },
        { name: "Snacks", description: "Snack foods and treats", storeTypes: ["food_beverages"], image: "https://images.unsplash.com/photo-1599490659213-e2b9527bd087?w=400" },
        { name: "Specialty Foods", description: "Gourmet and specialty food items", storeTypes: ["food_beverages"], image: "https://images.unsplash.com/photo-1481487196290-c152efe083f5?w=400" },
        
        { name: "Educational Toys", description: "Learning and educational toys", storeTypes: ["toys_games"], image: "https://images.unsplash.com/photo-1515854666411-0d0c8164f2e2?w=400" },
        { name: "Action Figures & Dolls", description: "Action figures, dolls, and collectibles", storeTypes: ["toys_games"], image: "https://images.unsplash.com/photo-1581776686443-cf643b86e3f2?w=400" },
        { name: "Board & Card Games", description: "Board games, card games, and puzzles", storeTypes: ["toys_games"], image: "https://images.unsplash.com/photo-1632501641765-e568d28b0015?w=400" },
        { name: "Outdoor Toys", description: "Outdoor play equipment and toys", storeTypes: ["toys_games"], image: "https://images.unsplash.com/photo-1588681664899-f142ff2dc9b1?w=400" },
        
        { name: "Auto Parts", description: "Automotive parts and components", storeTypes: ["automotive"], image: "https://images.unsplash.com/photo-1486262715619-67b85e0b08d3?w=400" },
        { name: "Car Accessories", description: "Vehicle accessories and add-ons", storeTypes: ["automotive"], image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=400" },
        { name: "Automotive Tools", description: "Tools for car maintenance and repair", storeTypes: ["automotive"], image: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=400" },
        { name: "Car Care Products", description: "Cleaning and maintenance products", storeTypes: ["automotive"], image: "https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=400" },
        
        { name: "Health Supplements", description: "Vitamins and health supplements", storeTypes: ["health_wellness"], image: "https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?w=400" },
        { name: "Medical Supplies", description: "Medical equipment and supplies", storeTypes: ["health_wellness"], image: "https://images.unsplash.com/photo-1585435557343-3b092031a831?w=400" },
        { name: "Wellness Products", description: "Holistic health and wellness items", storeTypes: ["health_wellness"], image: "https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400" },
        { name: "Fitness & Exercise", description: "Home fitness and exercise products", storeTypes: ["health_wellness"], image: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400" },
      ];

      const migrationReport = {
        createdCategories: [] as any[],
        matchedProducts: [] as any[],
        unmatchedProducts: [] as any[],
        errors: [] as string[],
      };

      // Step 1: Create default categories with all required fields
      for (const categoryData of defaultCategories) {
        const slug = categoryData.name.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and");
        
        // Check if category already exists
        const existing = await storage.getCategoryBySlug(slug);
        
        if (!existing) {
          if (!dryRun) {
            try {
              const created = await storage.createCategory({
                name: categoryData.name,
                slug,
                description: categoryData.description,
                image: categoryData.image,
                storeTypes: categoryData.storeTypes,
                isActive: true,
              });
              migrationReport.createdCategories.push(created);
            } catch (error: any) {
              migrationReport.errors.push(`Failed to create category "${categoryData.name}": ${error.message}`);
            }
          } else {
            migrationReport.createdCategories.push({ 
              name: categoryData.name, 
              slug, 
              storeTypes: categoryData.storeTypes 
            });
          }
        }
      }

      // Step 2: Get all products with legacy category text
      const allProducts = await db.select().from(products).where(isNotNull(products.category));

      // Step 3: Get all categories for matching
      const allCategories = await storage.getCategories({ isActive: true });

      // Step 4: Match products to categories (case-insensitive)
      for (const product of allProducts) {
        if (!product.category) continue;

        // Try to find matching category by name (case-insensitive)
        const matchedCategory = allCategories.find(
          cat => cat.name.toLowerCase() === product.category!.toLowerCase()
        );

        if (matchedCategory) {
          if (!dryRun) {
            await db.update(products)
              .set({ categoryId: matchedCategory.id })
              .where(eq(products.id, product.id));
          }
          migrationReport.matchedProducts.push({
            productId: product.id,
            productName: product.name,
            legacyCategory: product.category,
            matchedCategoryId: matchedCategory.id,
            matchedCategoryName: matchedCategory.name,
          });
        } else {
          migrationReport.unmatchedProducts.push({
            productId: product.id,
            productName: product.name,
            legacyCategory: product.category,
            sellerId: product.sellerId,
          });
        }
      }

      res.json({
        success: true,
        dryRun,
        message: dryRun 
          ? "Dry run complete - no changes made. Set dryRun=false to execute migration." 
          : "Migration complete!",
        report: migrationReport,
        stats: {
          categoriesCreated: migrationReport.createdCategories.length,
          productsMatched: migrationReport.matchedProducts.length,
          productsUnmatched: migrationReport.unmatchedProducts.length,
          errors: migrationReport.errors.length,
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ============ Media Library Routes ============
  app.post("/api/media-library", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Validate role - admin/super_admin can upload all types, seller can only upload product images
      const userRole = req.user!.role;
      const { category } = req.body;

      if (userRole === "seller" && category !== "product") {
        return res.status(403).json({ error: "Sellers can only upload product images" });
      }

      if (userRole !== "admin" && userRole !== "super_admin" && userRole !== "seller") {
        return res.status(403).json({ error: "Unauthorized to upload media" });
      }

      const mediaItem = await storage.createMediaLibraryItem({
        ...req.body,
        uploaderRole: userRole,
        uploaderId: req.user!.id,
      });
      res.json(mediaItem);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/media-library", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { category, uploaderRole } = req.query;
      const userRole = req.user!.role;

      // Only admin, super_admin and seller roles can access media library
      if (userRole !== "admin" && userRole !== "super_admin" && userRole !== "seller") {
        return res.status(403).json({ error: "Unauthorized to access media library" });
      }

      const filters: { category?: string; uploaderRole?: string; uploaderId?: string } = {};

      // Add category filter if specified
      if (category) {
        filters.category = category as string;
      }

      // Sellers can only see their own product images or admin/super_admin's media
      if (userRole === "seller") {
        // If category is product, show seller's own products plus admin/super_admin's products
        if (!category || category === "product") {
          const items = await storage.getMediaLibraryItems({ category: "product" });
          // Filter to only show seller's own or admin/super_admin uploaded
          const filtered = items.filter(
            item => item.uploaderId === req.user!.id || item.uploaderRole === "admin" || item.uploaderRole === "super_admin"
          );
          return res.json(filtered);
        } else {
          // For non-product categories, sellers can only see admin/super_admin uploads with requested category
          const items = await storage.getMediaLibraryItems({ category: category as string });
          const filtered = items.filter(item => item.uploaderRole === "admin" || item.uploaderRole === "super_admin");
          return res.json(filtered);
        }
      }

      // Admin and super_admin can see everything, optionally filtered
      if (uploaderRole && (userRole === "admin" || userRole === "super_admin")) {
        filters.uploaderRole = uploaderRole as string;
      }

      const items = await storage.getMediaLibraryItems(filters);
      res.json(items);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/media-library/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userRole = req.user!.role;
      
      // Get the item first to check ownership
      const items = await storage.getMediaLibraryItems({});
      const item = items.find(i => i.id === req.params.id);

      if (!item) {
        return res.status(404).json({ error: "Media item not found" });
      }

      // Admin and super_admin can delete anything, sellers can only delete their own product images
      if (userRole === "seller") {
        if (item.uploaderId !== req.user!.id) {
          return res.status(403).json({ error: "Unauthorized to delete this item" });
        }
      } else if (userRole !== "admin" && userRole !== "super_admin") {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const success = await storage.deleteMediaLibraryItem(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Media item not found" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Asset Browser Route ============
  app.get("/api/assets/images", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      
      const getImagesFromDir = (dir: string, urlPrefix: string): any[] => {
        const images: any[] = [];
        
        try {
          if (!fs.existsSync(dir)) {
            return images;
          }
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              images.push(...getImagesFromDir(fullPath, urlPrefix + '/' + item));
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (imageExtensions.includes(ext)) {
                const relativePath = path.relative(process.cwd(), fullPath);
                const url = urlPrefix + '/' + item;
                
                images.push({
                  filename: item,
                  url: url,
                  path: relativePath,
                  size: stat.size,
                });
              }
            }
          }
        } catch (error) {
          console.error('Error reading directory:', error);
        }
        
        return images;
      };
      
      // Scan attached_assets folder (served via express.static at /attached_assets)
      const attachedAssetsDir = path.join(process.cwd(), 'attached_assets');
      const attachedImages = getImagesFromDir(attachedAssetsDir, '/attached_assets');
      
      res.json(attachedImages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/assets/delete", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const { path: filePath } = req.body;

      if (!filePath) {
        return res.status(400).json({ error: "File path is required" });
      }

      const fullPath = path.join(process.cwd(), filePath);
      const assetsDir = path.join(process.cwd(), 'attached_assets');

      if (!fullPath.startsWith(assetsDir)) {
        return res.status(403).json({ error: "Cannot delete files outside attached_assets folder" });
      }

      if (!fs.existsSync(fullPath)) {
        return res.status(404).json({ error: "File not found" });
      }

      fs.unlinkSync(fullPath);
      res.json({ success: true, message: "File deleted successfully" });
    } catch (error: any) {
      console.error('Error deleting file:', error);
      res.status(500).json({ error: error.message || "Failed to delete file" });
    }
  });

  // ============ Enhanced Review Routes ============
  app.post("/api/reviews/:id/reply", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const { reply } = req.body;
      if (!reply) {
        return res.status(400).json({ error: "Reply is required" });
      }

      const review = await storage.addSellerReply(req.params.id, reply);
      if (!review) {
        return res.status(404).json({ error: "Review not found" });
      }

      res.json(review);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/reviews/verify-purchase/:productId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const verification = await storage.verifyPurchaseForReview(req.user!.id, req.params.productId);
      res.json(verification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Notification Routes ============
  app.get("/api/notifications", requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const notifications = await storage.getNotificationsByUser(req.user!.id, limit);
      res.json(notifications);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/notifications/unread-count", requireAuth, async (req: AuthRequest, res) => {
    try {
      const count = await storage.getUnreadNotificationCount(req.user!.id);
      res.json({ count });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req: AuthRequest, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/mark-all-read", requireAuth, async (req: AuthRequest, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.user!.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/notifications/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const success = await storage.deleteNotification(req.params.id, req.user!.id);
      if (!success) {
        return res.status(404).json({ error: "Notification not found or unauthorized" });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Paystack Integration Routes ============
  const { paystackService } = await import("./paystack");

  // Get Ghana banks list
  app.get("/api/paystack/banks", requireAuth, async (req: AuthRequest, res) => {
    try {
      const settings = await storage.getPlatformSettings();
      const banks = await paystackService.getGhanaBanks(settings.paystackSecretKey ?? undefined);
      res.json(banks.data);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Verify bank account
  app.post("/api/paystack/verify-account", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { accountNumber, bankCode } = req.body;
      const settings = await storage.getPlatformSettings();
      const verification = await paystackService.verifyAccountNumber(accountNumber, bankCode, settings.paystackSecretKey ?? undefined);
      res.json(verification.data);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create Paystack subaccount for store
  app.post("/api/stores/:storeId/setup-paystack", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const store = await storage.getStore(req.params.storeId);
      if (!store) {
        return res.status(404).json({ error: "Store not found" });
      }

      if (store.primarySellerId !== req.user!.id) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const { payoutType, payoutDetails } = req.body;

      // Validate payout details based on type
      if (payoutType === "bank_account") {
        if (!payoutDetails.bankCode || !payoutDetails.accountNumber) {
          return res.status(400).json({ 
            error: "Bank code and account number are required for bank account payouts" 
          });
        }
      } else if (payoutType === "mobile_money") {
        if (!payoutDetails.provider || !payoutDetails.mobileNumber) {
          return res.status(400).json({ 
            error: "Provider and mobile number are required for mobile money payouts" 
          });
        }
      } else {
        return res.status(400).json({ 
          error: "Invalid payout type. Supported types: bank_account, mobile_money" 
        });
      }

      // Get platform settings for commission rate
      const settings = await storage.getPlatformSettings();
      const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "1");
      
      let paystackIdentifier: string;

      // Bank accounts use Paystack subaccounts for automatic split payments
      if (payoutType === "bank_account") {
        const seller = await storage.getUser(store.primarySellerId!);
        const subaccountData = {
          business_name: store.name,
          bank_code: payoutDetails.bankCode,
          account_number: payoutDetails.accountNumber,
          percentage_charge: commissionRate,
          description: `Seller: ${store.name}`,
          primary_contact_email: req.user!.email,
          primary_contact_name: seller?.name || req.user!.email,
        };

        const settings = await storage.getPlatformSettings();
        const paystackResponse = await paystackService.createSubaccount(subaccountData, settings.paystackSecretKey ?? undefined);
        paystackIdentifier = paystackResponse.data.subaccount_code;
      } else {
        // Mobile money payouts work differently (no subaccounts)
        // Store mobile money details for manual transfer processing
        // Format: mobile_{provider}_{number} for tracking
        paystackIdentifier = `mobile_${payoutDetails.provider}_${payoutDetails.mobileNumber}`;
      }

      // Update store with payment configuration
      const updatedStore = await storage.updateStore(req.params.storeId, {
        paystackSubaccountId: paystackIdentifier,
        payoutType: payoutType,
        payoutDetails: payoutDetails,
        isPayoutVerified: true,
      });

      res.json({
        success: true,
        identifier: paystackIdentifier,
        store: updatedStore
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Paystack Webhook Handler
  app.post("/webhooks/paystack", async (req, res) => {
    try {
      const signature = req.headers['x-paystack-signature'] as string;
      const payload = JSON.stringify(req.body);

      const settings = await storage.getPlatformSettings();
      if (!paystackService.verifyWebhookSignature(payload, signature, settings.paystackSecretKey ?? undefined)) {
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body;

      if (event.event === "charge.success") {
        const reference = event.data.reference;
        const transaction = await storage.getTransactionByReference(reference);

        if (transaction && transaction.orderId) {
          // Update order payment status
          await storage.updateOrder(transaction.orderId, {
            paymentStatus: "completed"
          });
        }
      }

      res.status(200).json({ status: "success" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Admin Fix Image Paths Endpoint ============
  app.post("/api/admin/fix-image-paths", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      // Fix products only (not banners)
      const allProducts = await db.select().from(products);
      
      let updatedCount = 0;
      
      for (const product of allProducts) {
        if (!product.images || product.images.length === 0) continue;
        
        const hasInvalidPaths = product.images.some(img => img.startsWith("@assets/"));
        
        if (hasInvalidPaths) {
          const fixedImages = product.images.map(img => 
            img.replace(/^@assets\//, "/attached_assets/")
          );
          
          await db.update(products)
            .set({ images: fixedImages })
            .where(eq(products.id, product.id));
          
          updatedCount++;
        }
      }
      
      res.json({ 
        success: true, 
        message: `Fixed ${updatedCount} products with invalid image paths` 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
