import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
import { db } from "../db";
import { users, cart, wishlist, chatMessages, notifications, orders, products, stores } from "@shared/schema";
import { eq, or, isNotNull, and, desc } from "drizzle-orm";
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
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
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
      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
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
  app.post("/api/products", requireAuth, requireRole("admin", "seller"), upload.fields([
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
      const banners = await storage.getHeroBanners();
      res.json(banners);
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
      const products = await storage.getFeaturedProducts(limit);
      res.json(products);
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
  app.post("/api/seed/test-users", async (req, res) => {
    try {
      const testUsers = [
        {
          email: "superadmin@kiyumart.com",
          password: await bcrypt.hash("superadmin123", 10),
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
        credentials: {
          super_admin: "superadmin@kiyumart.com / superadmin123",
          admin: "admin@kiyumart.com / admin123",
          seller: "seller@kiyumart.com / seller123",
          buyer: "buyer@kiyumart.com / buyer123",
          rider: "rider@kiyumart.com / rider123",
          agent: "agent@kiyumart.com / agent123"
        }
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Complete marketplace seed - creates sellers, products, and banners (Development/Testing only)
  app.post("/api/seed/complete-marketplace", async (req, res) => {
    try {
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

  // Islamic Fashion Products Seed (Development/Testing only)
  app.post("/api/seed/islamic-fashion", async (req, res) => {
    try {
      const { createCompliantProductData, getAllProductBundles } = await import("./seedMediaLibrary");
      
      // Get or create a seller for the store
      let seller;
      try {
        const existingSeller = await storage.getUserByEmail("store@kiyumart.com");
        seller = existingSeller;
      } catch {
        seller = await storage.createUser({
          email: "store@kiyumart.com",
          password: await bcrypt.hash("store123", 10),
          name: "KiyuMart Store",
          role: "seller" as const,
          storeName: "KiyuMart - Islamic Fashion",
          storeType: "clothing"
        });
        // Approve the seller after creation
        if (seller) {
          await storage.updateUser(seller.id, { isApproved: true, isActive: true });
        }
      }

      if (!seller) {
        throw new Error("Failed to create or find seller");
      }

      const products = [];
      const reviews = [];

      // Create products using compliant bundles from media library
      const clothingBundles = getAllProductBundles("clothing");
      for (let i = 0; i < Math.min(clothingBundles.length, 3); i++) {
        const productData = createCompliantProductData(seller.id, "clothing", i);
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
        try {
          let user;
          try {
            user = await storage.getUserByEmail(customer.email);
          } catch {
            user = await storage.createUser({
              email: customer.email,
              password: await bcrypt.hash("customer123", 10),
              name: customer.name,
              role: "buyer"
            });
          }
          customers.push(user);
        } catch (error) {
          console.log(`Customer ${customer.email} already exists`);
        }
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

  app.get("/api/riders/available", requireAuth, requireRole("admin", "seller", "super_admin"), async (req, res) => {
    try {
      const availableRiders = await storage.getAvailableRidersWithOrderCounts();
      res.json(availableRiders);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
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
      // Get all orders and filter for delivering status
      const allOrders = await storage.getAllOrders();
      const activeOrders = allOrders.filter(order => order.status === "delivering");
      
      const riderLocations = await Promise.all(
        activeOrders.map(async (order: any) => {
          if (!order.riderId) return null;
          
          const rider = await storage.getUser(order.riderId);
          const latestLocation = await storage.getLatestDeliveryLocation(order.id);
          
          if (!latestLocation || !rider) return null;
          
          return {
            riderId: rider.id,
            riderName: rider.name,
            orderId: order.id,
            orderNumber: order.orderNumber,
            latitude: latestLocation.latitude,
            longitude: latestLocation.longitude,
            speed: latestLocation.speed,
            heading: latestLocation.heading,
            timestamp: latestLocation.timestamp,
          };
        })
      );
      
      res.json(riderLocations.filter(Boolean));
    } catch (error: any) {
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
      const messageData = {
        senderId: req.user!.id,
        receiverId: req.body.receiverId,
        message: req.body.message,
        messageType: req.body.messageType || "text",
      };

      const message = await storage.createMessage(messageData);
      
      // CRITICAL FIX: Broadcast to BOTH sender and receiver for instant message updates
      io.to(req.body.receiverId).emit("new_message", message);
      io.to(req.user!.id).emit("new_message", message);
      
      // Notify admins about new messages to admin, agent, or super_admin
      const receiver = await storage.getUser(req.body.receiverId);
      const sender = await storage.getUser(req.user!.id);
      if (receiver && (receiver.role === "admin" || receiver.role === "super_admin" || receiver.role === "agent")) {
        await notifyAdmins(
          "message",
          "New message received",
          `You have a new message from ${sender?.name || sender?.email || 'a user'}`,
          { messageId: message.id, senderId: req.user!.id }
        );
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
      const settings = await storage.getPlatformSettings();
      // Mask sensitive credentials in the response
      const sanitizedSettings = {
        ...settings,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "••••••••••••••••" : "",
      };
      res.json(sanitizedSettings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for platform settings (used by multi-vendor components)
  app.get("/api/platform-settings", async (req, res) => {
    try {
      const settings = await storage.getPlatformSettings();
      // Mask sensitive credentials in the response
      const sanitizedSettings = {
        ...settings,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "••••••••••••••••" : "",
      };
      res.json(sanitizedSettings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/settings", requireAuth, requireRole("admin", "super_admin"), async (req, res) => {
    try {
      const previousSettings = await storage.getPlatformSettings();
      
      // Handle cloudinaryApiSecret: preserve existing if placeholder or empty is sent
      const updateData = { ...req.body };
      if (!updateData.cloudinaryApiSecret || updateData.cloudinaryApiSecret === "••••••••••••••••") {
        updateData.cloudinaryApiSecret = previousSettings.cloudinaryApiSecret;
      }
      
      const settings = await storage.updatePlatformSettings(updateData);
      
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
      res.status(400).json({ error: error.message });
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
      
      // Prepare payment payload (use first order's currency for consistency)
      const paymentPayload: any = {
        email: req.user!.email,
        amount: Math.round(totalAmount * 100), // Total in kobo/pesewas
        currency: orders[0].currency,
        channels: ["card", "bank_transfer", "mobile_money"],
        callback_url: callbackUrl,
        metadata: {
          userId: req.user!.id,
          buyerId: req.user!.id,
          isMultiVendor,
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
        const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "10");
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
              
              // Calculate seller's share for this order
              const orderAmount = parseFloat(order.total);
              const sellerShare = Math.round(orderAmount * (100 - commissionRate) / 100 * 100); // In kobo
              
              subaccounts.push({
                subaccount: store.paystackSubaccountId,
                share: sellerShare,
              });
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
        }
        
      } else {
        // Single-vendor: Original split logic
        const order = orders[0];
        if (order.storeId) {
          try {
            const store = await storage.getStore(order.storeId);
            if (store && store.paystackSubaccountId && store.isPayoutVerified) {
              const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "10");
              
              paymentPayload.subaccount = store.paystackSubaccountId;
              paymentPayload.transaction_charge = commissionRate * 100;
              paymentPayload.bearer = "account";
              
              paymentPayload.metadata.storeId = store.id;
              paymentPayload.metadata.storeName = store.name;
              paymentPayload.metadata.commissionRate = commissionRate;
              paymentPayload.metadata.splitEnabled = true;
            }
          } catch (storeError) {
            console.warn("Could not fetch store for split payment:", storeError);
          }
        }
      }
      
      try {
        const response = await fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.paystackSecretKey}`,
            "Content-Type": "application/json",
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
      
      // Get platform settings for Paystack key
      const settings = await storage.getPlatformSettings();
      if (!settings.paystackSecretKey) {
        return res.status(503).json({ 
          error: "Payment gateway not configured",
          userMessage: "Payment system is currently unavailable. Please contact support."
        });
      }
      
      // Check if transaction already exists (idempotency)
      const existingTransaction = await storage.getTransactionByReference(reference);
      if (existingTransaction) {
        const order = await storage.getOrder(existingTransaction.orderId);
        return res.json({ 
          transaction: existingTransaction, 
          verified: existingTransaction.status === "completed",
          orderId: existingTransaction.orderId,
          message: "Transaction already processed"
        });
      }

      // Verify payment with Paystack with timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      
      try {
        const response = await fetch(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${settings.paystackSecretKey}`,
            },
            signal: controller.signal,
          }
        );
        
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          return res.status(502).json({ 
            error: errorData.message || "Payment verification failed",
            userMessage: "Unable to verify payment. Please contact support with your payment reference."
          });
        }

        const data = await response.json();
        
        if (!data.status) {
          return res.status(400).json({ 
            error: data.message || "Payment verification failed",
            userMessage: data.message || "Unable to verify your payment. Please contact support."
          });
        }

        // Determine if multi-vendor payment
        const isMultiVendor = data.data.metadata?.isMultiVendor || false;
        let orders: any[] = [];
        
        if (isMultiVendor) {
          // Multi-vendor: Fetch all orders in the session
          const checkoutSessionId = data.data.metadata.checkoutSessionId;
          const orderIds = data.data.metadata.orderIds || [];
          
          if (!checkoutSessionId || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ 
              error: "Invalid multi-vendor payment data",
              userMessage: "Multi-vendor payment data is incomplete. Please contact support."
            });
          }
          
          // Fetch all orders
          const allOrders = await storage.getAllOrders();
          orders = allOrders.filter((o: any) => orderIds.includes(o.id));
          
          if (orders.length !== orderIds.length) {
            return res.status(404).json({ 
              error: "Some orders not found",
              userMessage: "Some orders in this payment session could not be found."
            });
          }
          
          // Verify user owns all orders
          const allOwnedByUser = orders.every((o: any) => o.buyerId === req.user!.id);
          if (!allOwnedByUser) {
            return res.status(403).json({ 
              error: "Unauthorized",
              userMessage: "You don't have permission to verify these payments."
            });
          }
          
          // Validate all orders have matching payment reference
          const allMatchReference = orders.every((o: any) => o.paymentReference === reference);
          if (!allMatchReference) {
            return res.status(400).json({ 
              error: "Payment reference mismatch",
              userMessage: "Payment reference does not match all orders. Please contact support."
            });
          }
          
          // Validate total amount
          const totalExpected = orders.reduce((sum: number, o: any) => sum + parseFloat(o.total), 0);
          const expectedAmount = Math.round(totalExpected * 100);
          
          if (data.data.amount !== expectedAmount) {
            return res.status(400).json({ 
              error: "Payment amount mismatch",
              userMessage: `Payment amount (${data.data.currency} ${(data.data.amount / 100).toFixed(2)}) does not match total (${orders[0].currency} ${totalExpected.toFixed(2)}).`,
              expected: expectedAmount / 100,
              received: data.data.amount / 100
            });
          }
          
          // Validate currency (use first order)
          if (data.data.currency !== orders[0].currency) {
            return res.status(400).json({ 
              error: "Currency mismatch",
              userMessage: `Payment currency (${data.data.currency}) does not match order currency (${orders[0].currency}).`
            });
          }
          
        } else {
          // Single order
          const orderId = data.data.metadata?.orderId;
          if (!orderId) {
            return res.status(400).json({ 
              error: "Invalid payment data",
              userMessage: "Payment verification returned invalid data. Please contact support."
            });
          }

          const order = await storage.getOrder(orderId);
          
          if (!order) {
            return res.status(404).json({ error: "Order not found", userMessage: "Order associated with this payment could not be found." });
          }

          // Verify the user owns this order
          if (order.buyerId !== req.user!.id) {
            return res.status(403).json({ error: "Unauthorized to verify payment for this order", userMessage: "You don't have permission to verify this payment." });
          }

          // Validate the payment reference matches
          if (order.paymentReference !== reference) {
            return res.status(400).json({ 
              error: "Payment reference mismatch",
              userMessage: "Payment reference does not match the order. Please contact support."
            });
          }

          // Validate the payment amount matches the order total
          const expectedAmount = Math.round(parseFloat(order.total) * 100);
          if (data.data.amount !== expectedAmount) {
            return res.status(400).json({ 
              error: "Payment amount mismatch",
              userMessage: `Payment amount (${data.data.currency} ${(data.data.amount / 100).toFixed(2)}) does not match order total (${order.currency} ${parseFloat(order.total).toFixed(2)}).`,
              expected: expectedAmount / 100,
              received: data.data.amount / 100
          });
        }

        // Validate currency
        if (data.data.currency !== order.currency) {
          return res.status(400).json({ 
            error: "Currency mismatch",
            userMessage: `Payment currency (${data.data.currency}) does not match order currency (${order.currency}). Please contact support.`
          });
        }
        
        orders = [order];
      }

      // Establish primary order for consistent access (first order in array)
      if (orders.length === 0) {
        return res.status(500).json({
          error: "No orders found in payment session",
          userMessage: "Payment verification failed due to missing order data. Please contact support."
        });
      }
      const primaryOrder = orders[0];

      // Create transaction record (use primary order for single orderId field)
      const transactionData = {
        orderId: primaryOrder.id,
        userId: data.data.metadata.userId || data.data.metadata.buyerId,
        amount: (data.data.amount / 100).toString(),
        currency: data.data.currency,
        paymentProvider: "paystack",
        paymentReference: data.data.reference,
        status: data.data.status === "success" ? "completed" : "failed",
        metadata: {
          ...data.data,
          isMultiVendor,
          orderCount: orders.length,
          orderIds: orders.map((o: any) => o.id),
        },
      };

      const transaction = await storage.createTransaction(transactionData);
      
      if (data.data.status === "success") {
        // Update ALL orders atomically
        const updatePromises = orders.map((order: any) =>
          storage.updateOrder(order.id, {
            paymentStatus: "completed",
            status: "processing",
          })
        );
        await Promise.all(updatePromises);
        
        // Calculate and record commission for ALL orders
        const commissionPromises = orders.map((order: any) => 
          calculateAndRecordCommission(order.id)
        );
        await Promise.all(commissionPromises);
        
        // Get buyer details (all orders have same buyer)
        const buyer = await storage.getUser(primaryOrder.buyerId);
        
        // Notify about all orders
        for (const order of orders) {
          // Notify admins about each paid order
          await notifyAdmins(
            "order",
            "New order placed",
            `Order #${order.orderNumber} has been placed by ${buyer?.name || 'Customer'}`,
            { orderId: order.id, orderNumber: order.orderNumber, buyerId: order.buyerId }
          );
        }
        
        // Create single notification for buyer (summarize all orders)
        const orderNumbers = orders.map((o: any) => `#${o.orderNumber}`).join(", ");
        const totalPaid = (data.data.amount / 100).toFixed(2);
        
        await storage.createNotification({
          userId: primaryOrder.buyerId,
          type: "order",
          title: "Payment Successful",
          message: isMultiVendor 
            ? `Your payment for ${orders.length} orders (${orderNumbers}) was successful. Total: ${data.data.currency} ${totalPaid}`
            : `Your payment for order #${primaryOrder.orderNumber} was successful. Total: ${primaryOrder.currency} ${primaryOrder.total}`,
        });
        
        // Emit payment success notification to buyer
        io.to(primaryOrder.buyerId).emit("payment_completed", {
          orderId: primaryOrder.id,
          orderNumber: orderNumbers,
          amount: `${data.data.currency} ${totalPaid}`,
          paymentMethod: "Paystack",
          isMultiVendor,
          orderCount: orders.length,
        });
        
        // Emit order status updates for all orders
        for (const order of orders) {
          io.to(order.buyerId).emit("order_status_updated", {
            orderId: order.id,
            orderNumber: order.orderNumber,
            status: "processing",
            updatedAt: new Date().toISOString(),
          });
        }
      } else {
        // Payment failed - update all orders
        const failedUpdatePromises = orders.map((order: any) =>
          storage.updateOrder(order.id, {
            paymentStatus: "failed",
          })
        );
        await Promise.all(failedUpdatePromises);
        
        await storage.createNotification({
          userId: primaryOrder.buyerId,
          type: "order",
          title: "Payment Failed",
          message: isMultiVendor
            ? `Payment for ${orders.length} orders failed. Please try again.`
            : `Payment for order #${primaryOrder.orderNumber} failed. Please try again.`,
        });
        
        // Emit payment failure notification to buyer
        const orderNumbers = orders.map((o: any) => o.orderNumber).join(", ");
        io.to(primaryOrder.buyerId).emit("payment_failed", {
          orderId: primaryOrder.id,
          orderNumber: orderNumbers,
          reason: data.data.gateway_response || "Payment failed",
          isMultiVendor,
          orderCount: orders.length,
        });
      }

      res.json({ 
        transaction, 
        verified: data.data.status === "success",
        orderId: primaryOrder.id,
        orderIds: orders.map((o: any) => o.id),
        isMultiVendor,
        orderCount: orders.length,
        message: data.data.status === "success" ? "Payment verified successfully" : data.data.gateway_response || "Payment failed"
      });
      } catch (fetchError: any) {
        clearTimeout(timeout);
        
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ 
            error: "Payment verification timeout",
            userMessage: "Payment verification is taking too long. Please check your order status or contact support."
          });
        }
        
        return res.status(502).json({ 
          error: "Failed to verify payment",
          userMessage: "Unable to reach payment gateway for verification. Please try again or contact support."
        });
      }
    } catch (error: any) {
      console.error("Payment verification error:", error);
      res.status(500).json({ 
        error: error.message || "Internal server error",
        userMessage: "An unexpected error occurred while verifying your payment. Please contact support with your payment reference."
      });
    }
  });

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
        const { reference, metadata } = event.data;
        
        if (!metadata?.orderId) {
          console.error('[WEBHOOK] Missing orderId in metadata');
          return res.status(400).json({ error: "Invalid webhook data" });
        }

        // Check if transaction already processed (idempotency)
        const existingTransaction = await storage.getTransactionByReference(reference);
        if (existingTransaction && existingTransaction.status === "completed") {
          console.log('[WEBHOOK] Transaction already processed:', reference);
          return res.json({ message: "Transaction already processed" });
        }

        const order = await storage.getOrder(metadata.orderId);
        if (!order) {
          console.error('[WEBHOOK] Order not found:', metadata.orderId);
          return res.status(404).json({ error: "Order not found" });
        }

        // Create or update transaction
        if (!existingTransaction) {
          await storage.createTransaction({
            orderId: metadata.orderId,
            userId: metadata.userId,
            amount: (event.data.amount / 100).toString(),
            currency: event.data.currency,
            paymentProvider: "paystack",
            paymentReference: reference,
            status: "completed",
            metadata: event.data,
          });
        } else {
          // Update existing transaction status
          // Note: This would require a updateTransaction method in storage
          console.log('[WEBHOOK] Updating existing transaction:', reference);
        }

        // Update order status
        await storage.updateOrder(metadata.orderId, {
          paymentStatus: "completed",
          status: "processing",
        });

        // Calculate and record commission for multi-vendor marketplace
        await calculateAndRecordCommission(metadata.orderId);

        // Notify buyer
        await storage.createNotification({
          userId: order.buyerId,
          type: "order",
          title: "Payment Confirmed",
          message: `Your payment for order #${order.orderNumber} has been confirmed by Paystack.`,
        });

        // Real-time notification
        io.to(order.buyerId).emit("payment_completed", {
          orderId: order.id,
          orderNumber: order.orderNumber,
          amount: `${order.currency} ${order.total}`,
        });

        console.log('[WEBHOOK] Payment processed successfully:', reference);
      } else if (event.event === 'charge.failed') {
        // Handle failed payment
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

  io.on("connection", (socket) => {
    const userId = socket.data.userId; // From authentication middleware
    const userEmail = socket.data.userEmail;
    
    console.log(`✅ User connected: ${userEmail} (${userId})`);
    
    // Track user socket for online status
    userSockets.set(userId, socket.id);
    io.emit("user_online", userId);

    socket.on("disconnect", () => {
      console.log(`❌ User disconnected: ${userEmail} (${userId})`);
      userSockets.delete(userId);
      io.emit("user_offline", userId);
    });

    socket.on("typing", ({ receiverId }) => {
      io.to(receiverId).emit("user_typing", socket.id);
    });

    socket.on("stop_typing", ({ receiverId }) => {
      io.to(receiverId).emit("user_stop_typing", socket.id);
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
  app.post("/api/categories", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
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

  app.patch("/api/categories/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
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

  app.delete("/api/categories/:id", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
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
  app.post("/api/admin/migrate-categories", requireAuth, requireRole("admin"), async (req: AuthRequest, res) => {
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
      
      const assetsDir = path.join(process.cwd(), 'attached_assets');
      const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
      
      const getImagesFromDir = (dir: string, baseDir: string = dir): any[] => {
        const images: any[] = [];
        
        try {
          const items = fs.readdirSync(dir);
          
          for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
              images.push(...getImagesFromDir(fullPath, baseDir));
            } else if (stat.isFile()) {
              const ext = path.extname(item).toLowerCase();
              if (imageExtensions.includes(ext)) {
                const relativePath = path.relative(process.cwd(), fullPath);
                const url = '/' + relativePath.replace(/\\/g, '/');
                
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
      
      const images = getImagesFromDir(assetsDir);
      res.json(images);
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
      const banks = await paystackService.getGhanaBanks();
      res.json(banks.data);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Verify bank account
  app.post("/api/paystack/verify-account", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { accountNumber, bankCode } = req.body;
      const verification = await paystackService.verifyAccountNumber(accountNumber, bankCode);
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
      const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "10");
      
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

        const paystackResponse = await paystackService.createSubaccount(subaccountData);
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

      if (!paystackService.verifyWebhookSignature(payload, signature)) {
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

  return httpServer;
}
