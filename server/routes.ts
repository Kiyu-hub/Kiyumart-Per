import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { db } from "../db";
import { users, cart, wishlist, chatMessages, notifications, orders, products, stores, promotionalAds, commissions, platformSettings as platformSettingsTable, footerPages as footerPagesTable, adminPermissions, riderPayouts } from "@shared/schema";
import { eq, or, isNotNull, and, desc, sql } from "drizzle-orm";
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  verifyToken,
  requireAuth, 
  requireRole,
  requirePermission,
  requirePermissionIfAdmin,
  requireRoleFeature,
  requireRoleFeatureIfRole,
  resolveRoleFeatures,
  type AuthRequest 
} from "./auth";
import { uploadToCloudinary, uploadWithMetadata, uploadWith4KEnhancement } from "./cloudinary";
import multer from "multer";
import sharp from "sharp";
import { insertUserSchema, insertProductSchema, insertDeliveryZoneSchema, insertOrderSchema, insertWishlistSchema, insertReviewSchema, insertRiderReviewSchema, insertBannerCollectionSchema, insertMarketplaceBannerSchema, insertFooterPageSchema, vehicleInfoSchema, type User } from "@shared/schema";
import { getStoreTypeSchema, type StoreType, STORE_TYPES } from "@shared/storeTypes";
import buildPaystackInitializePayload from './paystackUtils';
import { getValidFrontendUrl, getFrontendUrlSync, clearFrontendUrlCache } from './frontendUrlResolver';
import { runtimeConfig } from "./config/runtimeConfig";
// WhatsApp-style messaging services
import { presenceService } from "./services/presenceService";
import { messageDeliveryService } from "./services/messageDeliveryService";
import { chatPermissionService } from "./services/chatPermissionService";
import { jitsiMeetService } from "./services/jitsiMeetService";
import { hasSupportFirstResponse, isSupportStaffRole, resolveSupportDisplayName, shouldMaskSupportIdentityForViewer } from "./services/supportMessagingService";
import { canonicalizeOrderStatus } from "./services/orderStateMachine";

const upload = multer({ storage: multer.memoryStorage() });
const PROFILE_IMAGE_MAX_BYTES = runtimeConfig.upload.profileImageMaxBytes;
const AUDIO_UPLOAD_MAX_BYTES = runtimeConfig.upload.audioMaxBytes;
const SUPPORT_MEDIA_MAX_BYTES = runtimeConfig.upload.supportMediaMaxBytes;
const AUTO_DISPATCH_MINUTES = runtimeConfig.dispatch.autoDispatchMinutes;
const RIDER_OFFER_TIMEOUT_MS = 12_000;
const RIDER_MATCH_RADIUS_STEPS_KM = [3, 5, 8] as const;
const RIDER_MATCH_LIMIT = 5;
const SOFT_ZONE_DISTANCE_MARGIN_KM = 1;
const ENABLE_SOFT_ZONE_MATCH = process.env.ENABLE_SOFT_ZONE_MATCH !== "false";
const CHAT_ATTACHMENT_PREFIX = "__CHAT_ATTACHMENT__:";
const SUPPORT_ATTACHMENT_PREFIX = "__SUPPORT_ATTACHMENT__:";

const PUBLIC_UPLOAD_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

async function persistPublicUploadLocally(fileBuffer: Buffer, mimetype: string): Promise<string> {
  const extension = PUBLIC_UPLOAD_MIME_TO_EXT[mimetype] || "bin";
  const baseDir = path.resolve(process.cwd(), "uploads", "registration");
  await fs.mkdir(baseDir, { recursive: true });
  const filename = `${Date.now()}-${randomUUID()}.${extension}`;
  const fullPath = path.join(baseDir, filename);
  await fs.writeFile(fullPath, fileBuffer);
  return `/uploads/registration/${filename}`;
}

function decodeAttachmentNotificationPreview(rawMessage: string): string | null {
  const trimmed = String(rawMessage || "").trim();
  if (!trimmed) return null;

  const supportIdx = trimmed.indexOf(SUPPORT_ATTACHMENT_PREFIX);
  const chatIdx = trimmed.indexOf(CHAT_ATTACHMENT_PREFIX);
  const prefixIdx =
    supportIdx >= 0 && chatIdx >= 0 ? Math.min(supportIdx, chatIdx) : supportIdx >= 0 ? supportIdx : chatIdx;

  if (prefixIdx < 0) return null;

  const isSupportAttachment = prefixIdx === supportIdx;
  const prefix = isSupportAttachment ? SUPPORT_ATTACHMENT_PREFIX : CHAT_ATTACHMENT_PREFIX;
  const payload = trimmed.slice(prefixIdx + prefix.length);
  let attachmentLabel = "Sent an attachment";

  try {
    const parsed = JSON.parse(decodeURIComponent(payload));
    const kind = String(parsed?.kind || "").toLowerCase();
    if (kind === "image") attachmentLabel = "Sent an image";
    else if (kind === "video") attachmentLabel = "Sent a video";
    else if (kind === "audio") attachmentLabel = "Sent a voice note";
    else if (kind === "file") attachmentLabel = "Sent a file";
  } catch {
    // Fall back to a generic attachment label when payload cannot be decoded.
  }

  const senderPrefix = trimmed.slice(0, prefixIdx).trim().replace(/:\s*$/, "");
  return senderPrefix ? `${senderPrefix}: ${attachmentLabel}` : attachmentLabel;
}

type RiderAssignmentAttemptStatus =
  | "offered"
  | "accepted"
  | "accepted_pending_admin"
  | "rejected"
  | "timed_out"
  | "failed";

type RiderAssignmentAttempt = {
  riderId: string;
  riderName: string;
  distanceKm: number | null;
  offeredAt: string;
  resolvedAt?: string;
  status: RiderAssignmentAttemptStatus;
  reason?: string;
};

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

  const ROLE_LABELS: Record<string, string> = {
    buyer: "Buyer",
    seller: "Seller",
    rider: "Rider",
    agent: "Agent",
    admin: "Admin",
    super_admin: "Super Admin",
  };

  const ROLE_CAPABILITIES: Record<string, string[]> = {
    seller: [
      "Access the seller dashboard and seller tools",
      "Create and manage product listings",
      "View and process incoming orders",
    ],
    rider: [
      "Access the rider dashboard and delivery tools",
      "Receive and manage delivery assignments",
      "Track active delivery jobs and payout status",
    ],
    agent: [
      "Access support-agent workspace",
      "Handle customer support tickets and conversations",
    ],
    admin: [
      "Access admin management dashboard",
      "Manage users, products, and platform content",
    ],
    super_admin: [
      "Access super-admin controls and moderation tools",
      "Manage administrative roles and platform-wide settings",
    ],
    buyer: [
      "Continue purchasing products and managing orders",
    ],
  };

  const formatFormalNotification = (
    heading: string,
    sections: Array<{ label: string; value: string }>,
  ) => {
    const lines = [heading, "", ...sections.map((section) => `${section.label}: ${section.value}`)];
    return lines.join("\n");
  };

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

      // Notify operations users about new signup.
      await notifyAdmins(
        "user",
        "New User Signup",
        `${user.name} has created an account (${requestedRole}).`,
        {
          userId: user.id,
          role: requestedRole,
          link:
            requestedRole === "seller" || requestedRole === "rider"
              ? `/admin/applications?userId=${user.id}&role=${requestedRole}`
              : "/admin/users",
        },
        {
          requiredAdminPermission: "manage_users",
          includeAgents: true,
          requiredAgentFeature: "users.view",
        }
      );

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
      const currentUser = await storage.getUser(req.user!.id);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      // Safety self-heal:
      // If an unapproved operational role leaked onto the account, keep the user in buyer role
      // and retain the intended role in requestedRole until admin approval.
      let user = currentUser;
      if (!user.isApproved && (user.role === "seller" || user.role === "rider")) {
        const patch: Record<string, unknown> = {
          role: "buyer",
          applicationStatus:
            (user as any).applicationStatus && (user as any).applicationStatus !== "approved"
              ? (user as any).applicationStatus
              : ("pending" as any),
        };
        if (!(user as any).requestedRole) {
          patch.requestedRole = user.role;
        }
        const healed = await storage.updateUser(user.id, patch);
        if (healed) user = healed as any;
      }

      const { password, ...userWithoutPassword } = user;
      const roleFeatures = await resolveRoleFeatures(user.role);
      res.json({
        ...userWithoutPassword,
        roleFeatures,
      });
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

  app.patch("/api/profile", requireAuth, requireRoleFeature("profile.manage"), async (req: AuthRequest, res) => {
    try {
      // CRITICAL FIX: Added storeType and storeTypeMetadata to allow existing sellers to complete their profiles
      const allowedFields = [
        'name',
        'username',
        'phone',
        'address',
        'city',
        'country',
        'email',
        'storeName',
        'storeDescription',
        'storeBanner',
        'vehicleInfo',
        'storeType',
        'storeTypeMetadata',
        'businessAddress',
        'riderCity',
        'riderRegion',
        'nationalIdCard',
      ];
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

      // Validate file size (configurable, defaults to 5MB)
      if (req.file.size > PROFILE_IMAGE_MAX_BYTES) {
        const maxMb = (PROFILE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
        return res.status(400).json({ error: `File too large. Maximum size is ${maxMb}MB` });
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

      try {
        const imageUrl = await uploadToCloudinary(req.file.buffer, "kiyumart/registration");
        return res.json({ url: imageUrl, provider: "cloudinary" });
      } catch (cloudinaryError: any) {
        console.warn("Public image upload cloud provider failed, using local fallback:", cloudinaryError?.message || cloudinaryError);
        const localUrl = await persistPublicUploadLocally(req.file.buffer, req.file.mimetype);
        return res.json({ url: localUrl, provider: "local" });
      }
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
  app.get("/api/users", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
    try {
      const { role, isApproved, applicationStatus } = req.query;
      let users;
      
      if (role && role !== "all") {
        if (role === "seller" || role === "rider") {
          const allRoles = ["admin", "buyer", "seller", "rider", "agent"];
          users = [];
          for (const r of allRoles) {
            const roleUsers = await storage.getUsersByRole(r);
            users.push(...roleUsers);
          }
          users = users.filter((u: any) => u.role === role || u.requestedRole === role);
        } else {
          users = await storage.getUsersByRole(role as string);
        }
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

  app.get("/api/users/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
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

  app.patch("/api/users/:id/approve", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
    try {
      // First, get the user without approving yet
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const targetRole = (user as any).requestedRole || user.role;
      if (targetRole !== "seller" && targetRole !== "rider") {
        return res.status(400).json({ error: "User does not have a pending seller/rider application" });
      }

      // CRITICAL: Validate role-specific requirements before approval
      if (targetRole === "seller") {
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
      
      if (targetRole === "rider") {
        if (!user.vehicleInfo || !user.vehicleInfo.type) {
          return res.status(400).json({ 
            error: "Cannot approve rider without vehicle information",
            details: "The rider must have vehicle type and details set. Please ask them to update their profile before approval."
          });
        }
        if (!user.riderCity || String(user.riderCity).trim().length < 2) {
          return res.status(400).json({
            error: "Cannot approve rider without city",
            details: "Set rider city before approval to enable zone-aware matching.",
          });
        }
        if (!user.riderRegion || String(user.riderRegion).trim().length < 2) {
          return res.status(400).json({
            error: "Cannot approve rider without region",
            details: "Set rider region before approval to enable zone-aware matching.",
          });
        }
      }
      
      // Now approve the user (store creation succeeded or not needed)
      const approvedUser = await storage.updateUser(req.params.id, { 
        role: targetRole as any,
        requestedRole: null,
        isApproved: true,
        applicationStatus: "approved" as any,
        interviewScheduledAt: null,
        interviewScheduledBy: null,
        rejectionReason: null // Clear any previous rejection reason
      });
      if (!approvedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const approvedRoleLabel = ROLE_LABELS[targetRole] || targetRole;
      const approvalMessage = formatFormalNotification(
        `Dear ${approvedUser.name || "Applicant"},`,
        [
          {
            label: "Decision",
            value: `Approved - Your ${approvedRoleLabel} application was successful.`,
          },
          {
            label: "Reason for Decision",
            value: "Your submitted profile and verification details met our onboarding requirements.",
          },
          {
            label: "Next Steps",
            value: targetRole === "seller"
              ? "Open your seller dashboard, complete any remaining store setup items, and begin listing products."
              : "Open your rider dashboard, confirm your vehicle details, and begin accepting delivery assignments.",
          },
        ],
      );

      // Send approval notification
      await storage.createNotification({
        userId: approvedUser.id,
        type: "system",
        title: `${approvedRoleLabel} Application Approved`,
        message: approvalMessage,
        metadata: {
          role: targetRole,
          status: "approved",
          link: targetRole === "seller" ? "/seller" : "/rider",
        } as any,
      });
      
      // Emit Socket.IO event for real-time seller dashboard update
      if (targetRole === "seller") {
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

  app.patch("/api/users/:id/interview", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req: AuthRequest, res) => {
    try {
      const { scheduledAt } = req.body as { scheduledAt?: string };
      if (!scheduledAt) {
        return res.status(400).json({ error: "Interview date and time are required" });
      }

      const interviewDate = new Date(scheduledAt);
      if (Number.isNaN(interviewDate.getTime())) {
        return res.status(400).json({ error: "Invalid interview date and time" });
      }

      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const targetRole = ((user as any).requestedRole || user.role) as string;
      if (targetRole !== "seller" && targetRole !== "rider") {
        return res.status(400).json({ error: "Interview scheduling is only available for seller and rider applications" });
      }

      if (user.isApproved || user.applicationStatus === "approved") {
        return res.status(400).json({ error: "Cannot schedule interview for an approved application" });
      }

      if (user.applicationStatus === "rejected") {
        return res.status(400).json({ error: "Cannot schedule interview for a rejected application" });
      }

      const updatedUser = await storage.updateUser(req.params.id, {
        applicationStatus: "interview_scheduled" as any,
        interviewScheduledAt: interviewDate,
        interviewScheduledBy: req.user!.id,
        rejectionReason: null,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const roleLabel = ROLE_LABELS[targetRole] || targetRole;
      const formattedDate = interviewDate.toLocaleString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });

      const message = formatFormalNotification(
        `Dear ${updatedUser.name || "Applicant"},`,
        [
          {
            label: "Status Update",
            value: `Your ${roleLabel} application has moved to Interview Scheduled.`,
          },
          {
            label: "Interview Date & Time",
            value: formattedDate,
          },
          {
            label: "Next Steps",
            value: "Please be available at the scheduled time and keep your contact channels active for interview communication.",
          },
        ],
      );

      await storage.createNotification({
        userId: updatedUser.id,
        type: "system",
        title: `${roleLabel} Interview Scheduled`,
        message,
        metadata: {
          role: targetRole,
          status: "interview_scheduled",
          interviewScheduledAt: interviewDate.toISOString(),
          link: "/notifications",
        } as any,
      });

      io.to(updatedUser.id).emit("notification", {
        type: "system",
        title: `${roleLabel} Interview Scheduled`,
        message,
        data: {
          role: targetRole,
          status: "interview_scheduled",
          interviewScheduledAt: interviewDate.toISOString(),
          link: "/notifications",
        },
      });

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error scheduling interview:", error);
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

      // Email is immutable on authenticated role-application updates.
      if (typeof req.body?.email === "string" && req.body.email.trim() && req.body.email.trim() !== user.email) {
        return res.status(400).json({ error: "Email cannot be changed in role application. Update profile email separately." });
      }

      const currentRole = String(user.role || "");
      const currentRequestedRole = String((user as any).requestedRole || "").toLowerCase();
      const currentApplicationStatus = String((user as any).applicationStatus || "").toLowerCase();
      const hasActiveApplication = ["pending", "interview_scheduled"].includes(currentApplicationStatus);
      const approvedOperationalRole = (currentRole === "seller" || currentRole === "rider") && user.isApproved;
      const pendingRequestedRole = currentRequestedRole === "seller" || currentRequestedRole === "rider";

      if (approvedOperationalRole && currentRole !== role) {
        return res.status(409).json({
          error: `You can only apply for one role. Your current application/account role is ${currentRole}.`,
          userMessage: `You can only apply to one role. You already applied as ${currentRole}.`,
          currentRole,
          requestedRole: role,
          applicationStatus: currentApplicationStatus || null,
        });
      }

      if (pendingRequestedRole && currentRequestedRole !== role) {
        return res.status(409).json({
          error: `You can only apply for one role. Your current pending application role is ${currentRequestedRole}.`,
          userMessage: `You can only apply to one role. You already applied as ${currentRequestedRole}.`,
          currentRole,
          requestedRole: role,
          applicationStatus: currentApplicationStatus || null,
        });
      }

      if (user.role === role && user.isApproved) {
        return res.status(200).json({
          success: true,
          alreadyApplied: true,
          role,
          applicationStatus: "approved",
          userMessage: `You are already an approved ${role}.`,
        });
      }

      if ((currentRequestedRole === role || user.role === role) && hasActiveApplication) {
        return res.status(200).json({
          success: true,
          alreadyApplied: true,
          role,
          applicationStatus: currentApplicationStatus,
          userMessage: `Your application to become a ${role} has been submitted. An admin will review and approve your application shortly.`,
        });
      }

      const updateData: Record<string, unknown> = {
        requestedRole: role,
        applicationStatus: 'pending' as any,
        interviewScheduledAt: null,
        interviewScheduledBy: null,
        rejectionReason: null,
      };

      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        updateData.name = req.body.name.trim();
      }
      if (typeof req.body?.phone === "string" && req.body.phone.trim()) {
        updateData.phone = req.body.phone.trim();
      }

      if (role === "seller") {
        const sellerStoreType = typeof req.body?.storeType === "string" ? req.body.storeType : user.storeType;
        const sellerStoreTypeMetadata = req.body?.storeTypeMetadata ?? user.storeTypeMetadata ?? {};
        const sellerStoreName = typeof req.body?.storeName === "string" ? req.body.storeName.trim() : user.storeName;
        const sellerStoreDescription = typeof req.body?.storeDescription === "string"
          ? req.body.storeDescription.trim()
          : user.storeDescription;
        const sellerBusinessAddress = typeof req.body?.businessAddress === "string"
          ? req.body.businessAddress.trim()
          : user.businessAddress;
        const sellerNationalIdCard = typeof req.body?.nationalIdCard === "string"
          ? req.body.nationalIdCard.trim()
          : user.nationalIdCard;
        const sellerProfileImage = typeof req.body?.profileImage === "string" ? req.body.profileImage : user.profileImage;
        const sellerCardFront = typeof req.body?.ghanaCardFront === "string" ? req.body.ghanaCardFront : (user as any).ghanaCardFront;
        const sellerCardBack = typeof req.body?.ghanaCardBack === "string" ? req.body.ghanaCardBack : (user as any).ghanaCardBack;

        if (!sellerStoreType || !STORE_TYPES.includes(sellerStoreType as StoreType)) {
          return res.status(400).json({ error: "Store type is required" });
        }
        try {
          const storeTypeSchema = getStoreTypeSchema(sellerStoreType as StoreType);
          storeTypeSchema.parse(sellerStoreTypeMetadata || {});
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
        if (!sellerStoreName || String(sellerStoreName).length < 3) {
          return res.status(400).json({ error: "Store name must be at least 3 characters" });
        }
        if (!sellerStoreDescription || String(sellerStoreDescription).length < 10) {
          return res.status(400).json({ error: "Please provide a detailed store description" });
        }
        if (!sellerBusinessAddress || String(sellerBusinessAddress).length < 5) {
          return res.status(400).json({ error: "Business address is required" });
        }
        if (!sellerNationalIdCard || String(sellerNationalIdCard).length < 10) {
          return res.status(400).json({ error: "Ghana Card number is required" });
        }
        if (!sellerProfileImage || !sellerCardFront || !sellerCardBack) {
          return res.status(400).json({ error: "Profile and Ghana Card images are required" });
        }

        updateData.storeType = sellerStoreType;
        updateData.storeTypeMetadata = sellerStoreTypeMetadata;
        updateData.storeName = sellerStoreName;
        updateData.storeDescription = sellerStoreDescription;
        updateData.businessAddress = sellerBusinessAddress;
        updateData.nationalIdCard = sellerNationalIdCard;
        updateData.profileImage = sellerProfileImage;
        updateData.ghanaCardFront = sellerCardFront;
        updateData.ghanaCardBack = sellerCardBack;
      } else if (role === "rider") {
        const riderBusinessAddress = typeof req.body?.businessAddress === "string"
          ? req.body.businessAddress.trim()
          : user.businessAddress;
        const riderNationalIdCard = typeof req.body?.nationalIdCard === "string"
          ? req.body.nationalIdCard.trim()
          : user.nationalIdCard;
        const riderProfileImage = typeof req.body?.profileImage === "string" ? req.body.profileImage : user.profileImage;
        const riderCardFront = typeof req.body?.ghanaCardFront === "string" ? req.body.ghanaCardFront : (user as any).ghanaCardFront;
        const riderCardBack = typeof req.body?.ghanaCardBack === "string" ? req.body.ghanaCardBack : (user as any).ghanaCardBack;
        const riderCity = typeof req.body?.riderCity === "string" ? req.body.riderCity.trim() : ((user as any).riderCity || "");
        const riderRegion = typeof req.body?.riderRegion === "string" ? req.body.riderRegion.trim() : ((user as any).riderRegion || "");
        const riderVehicleInfoRaw = req.body?.vehicleInfo ?? (user as any).vehicleInfo;

        if (!riderBusinessAddress || String(riderBusinessAddress).length < 5) {
          return res.status(400).json({ error: "Address/Location is required" });
        }
        if (!riderNationalIdCard || String(riderNationalIdCard).length < 10) {
          return res.status(400).json({ error: "Ghana Card number is required" });
        }
        if (!riderProfileImage || !riderCardFront || !riderCardBack) {
          return res.status(400).json({ error: "Profile and Ghana Card images are required" });
        }
        if (!riderCity || riderCity.length < 2) {
          return res.status(400).json({ error: "City is required for rider applications" });
        }
        if (!riderRegion || riderRegion.length < 2) {
          return res.status(400).json({ error: "Region is required for rider applications" });
        }

        const parsedVehicle = vehicleInfoSchema.safeParse(riderVehicleInfoRaw);
        if (!parsedVehicle.success) {
          return res.status(400).json({
            error: "Invalid vehicle information",
            details: parsedVehicle.error.issues
          });
        }

        const { type, plateNumber, license, color } = parsedVehicle.data;
        if (type === "car") {
          if (!plateNumber) return res.status(400).json({ error: "Plate number is required for car riders" });
          if (!license) return res.status(400).json({ error: "Driver's license is required for car riders" });
          if (!color) return res.status(400).json({ error: "Vehicle color is required for car riders" });
        } else if (type === "motorcycle") {
          if (!plateNumber) return res.status(400).json({ error: "Plate number is required for motorcycle riders" });
          if (!license) return res.status(400).json({ error: "Driver's license is required for motorcycle riders" });
        }

        updateData.businessAddress = riderBusinessAddress;
        updateData.nationalIdCard = riderNationalIdCard;
        updateData.profileImage = riderProfileImage;
        updateData.ghanaCardFront = riderCardFront;
        updateData.ghanaCardBack = riderCardBack;
        updateData.riderCity = riderCity;
        updateData.riderRegion = riderRegion;
        updateData.vehicleInfo = parsedVehicle.data as any;

        // Best-effort zone mapping from rider city/region
        const zones = await storage.getDeliveryZones();
        const city = riderCity.toLowerCase().trim();
        const region = riderRegion.toLowerCase().trim();
        const matchedCityZone = zones.find((z: any) =>
          String(z.city || z.name || "").toLowerCase().trim() === city
        );
        const matchedRegionZone = !matchedCityZone
          ? zones.find((z: any) => String(z.region || z.name || "").toLowerCase().trim() === region)
          : null;
        if (matchedCityZone?.id) updateData.deliveryZoneId = matchedCityZone.id;
        else if (matchedRegionZone?.id) updateData.deliveryZoneId = matchedRegionZone.id;
      }

      // Keep user on current role (e.g., buyer) until admin approval.
      const updated = await storage.updateUser(user.id, updateData as any);

      if (!updated) return res.status(500).json({ error: 'Failed to submit application' });

      // Notify admins about new application
      try {
        await notifyAdmins(
          'user',
          `New ${role} application`,
          `${updated.name} (${updated.email}) has applied to become a ${role}`,
          { userId: updated.id, role, link: `/admin/applications?userId=${updated.id}&role=${role}` },
          {
            requiredAdminPermission: "manage_users",
            includeAgents: true,
            requiredAgentFeature: "users.view",
          }
        );
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

  app.patch("/api/users/:id/reject", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
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
        interviewScheduledAt: null,
        interviewScheduledBy: null,
        rejectionReason: reason || null
      });
      
      if (!rejectedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const rejectedRole = ((user as any).requestedRole || user.role) as string;
      const rejectedRoleLabel = ROLE_LABELS[rejectedRole] || rejectedRole;
      const rejectionMessage = formatFormalNotification(
        `Dear ${rejectedUser.name || "Applicant"},`,
        [
          {
            label: "Decision",
            value: `Rejected - Your ${rejectedRoleLabel} application was not approved at this time.`,
          },
          {
            label: "Reason for Decision",
            value: reason?.trim() || "No detailed reason was provided. Please contact support for clarification.",
          },
          {
            label: "Next Steps",
            value: "Review the decision reason, update your profile/application details, and re-apply when ready.",
          },
        ],
      );

      // Send rejection notification
      await storage.createNotification({
        userId: rejectedUser.id,
        type: "system",
        title: `${rejectedRoleLabel} Application Rejected`,
        message: rejectionMessage,
        metadata: {
          role: rejectedRole,
          status: "rejected",
          reason: reason?.trim() || null,
          link: "/support",
        } as any,
      });
      
      console.log(`User ${user.id} (${rejectedRole}) pending application rejected by admin`);
      const { password, ...userWithoutPassword } = rejectedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error rejecting user application:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/users/:id/status", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
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

  app.post("/api/users", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
    try {
      // Capture additional data before schema parsing
      const { storeType, vehicleType, vehicleColor, vehiclePlateNumber, vehicleLicense } = req.body;
      
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
        const normalizedRiderCity = typeof req.body.riderCity === "string" ? req.body.riderCity.trim() : "";
        const normalizedRiderRegion = typeof req.body.riderRegion === "string" ? req.body.riderRegion.trim() : "";
        const addressFallback = String(validatedData.businessAddress || "").split(",").map((part) => part.trim()).filter(Boolean);
        const resolvedRiderCity = normalizedRiderCity || addressFallback[0] || "";
        const resolvedRiderRegion = normalizedRiderRegion || addressFallback[1] || "";

        if (!resolvedRiderCity || resolvedRiderCity.length < 2) {
          return res.status(400).json({
            error: "City is required for rider accounts"
          });
        }

        if (!resolvedRiderRegion || resolvedRiderRegion.length < 2) {
          return res.status(400).json({
            error: "Region is required for rider accounts"
          });
        }

        if (!validatedData.nationalIdCard) {
          return res.status(400).json({
            error: "Ghana card number is required for rider accounts"
          });
        }

        if (!validatedData.businessAddress) {
          return res.status(400).json({
            error: "Address is required for rider accounts"
          });
        }

        const rawVehicleInfo = req.body.vehicleInfo;
        const vehicleTypeFromPayload = vehicleType || rawVehicleInfo?.type;
        const vehicleColorFromPayload = vehicleColor || rawVehicleInfo?.color;
        const vehiclePlateNumberFromPayload = vehiclePlateNumber || rawVehicleInfo?.plateNumber;
        const vehicleLicenseFromPayload = vehicleLicense || rawVehicleInfo?.license;

        if (!vehicleTypeFromPayload) {
          return res.status(400).json({ 
            error: "Vehicle type is required for rider accounts" 
          });
        }
        
        const vehiclePayload = {
          type: vehicleTypeFromPayload,
          color: vehicleColorFromPayload,
          plateNumber: vehiclePlateNumberFromPayload,
          license: vehicleLicenseFromPayload,
        };
        
        const parsedVehicle = vehicleInfoSchema.safeParse(vehiclePayload);
        if (!parsedVehicle.success) {
          return res.status(400).json({ 
            error: "Invalid vehicle information",
            details: parsedVehicle.error.issues 
          });
        }
        
        userData.vehicleInfo = parsedVehicle.data;
        userData.riderCity = resolvedRiderCity;
        userData.riderRegion = resolvedRiderRegion;

        // Best-effort zone resolution from rider city/region.
        if (!userData.deliveryZoneId) {
          const zones = await storage.getDeliveryZones();
          const normalize = (value?: string | null) => (value || "").toLowerCase().trim();
          const city = normalize(resolvedRiderCity);
          const region = normalize(resolvedRiderRegion);
          if (city) {
            const cityZone = zones.find((z: any) => normalize(z.city) === city || normalize(z.name) === city);
            if (cityZone) userData.deliveryZoneId = cityZone.id;
          }
          if (!userData.deliveryZoneId && region) {
            const regionZone = zones.find((z: any) => normalize(z.region) === region || normalize(z.name) === region);
            if (regionZone) userData.deliveryZoneId = regionZone.id;
          }
        }
      }

      // Handle seller-specific fields - ENFORCE storeType requirement
      if (validatedData.role === "seller") {
        if (!validatedData.nationalIdCard) {
          return res.status(400).json({
            error: "Ghana card number is required for seller accounts"
          });
        }

        if (!validatedData.businessAddress) {
          return res.status(400).json({
            error: "Business address is required for seller accounts"
          });
        }

        if (!storeType) {
          return res.status(400).json({ 
            error: "Store type is required for seller accounts. Please select a store type to continue." 
          });
        }
        
        if (!STORE_TYPES.includes(storeType)) {
          return res.status(400).json({ error: "Invalid store type" });
        }
        
        userData.storeType = storeType;
        // Admin setup should not define seller storefront profile fields.
        // Seller must complete these in their own profile flow.
        userData.storeName = null;
        userData.storeDescription = null;
        userData.storeBanner = null;
      }
      
      const user = await storage.createUser(userData);
      
      // Create store for seller with captured store data
      if (user.role === "seller") {
        try {
          const existingStore = await storage.getStoreByPrimarySeller(user.id);
          if (!existingStore) {
            const storeData = {
              primarySellerId: user.id,
              name: user.name + "'s Store",
              description: "",
              logo: "",
              banner: "",
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

  app.patch("/api/users/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req: AuthRequest, res) => {
    try {
      const allowedFields = [
        "name",
        "email",
        "phone",
        "role",
        "isActive",
        "isApproved",
        "vehicleInfo",
        "storeType",
        "nationalIdCard",
        "businessAddress",
        "riderCity",
        "riderRegion",
        "deliveryZoneId",
      ];
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

      const currentUser = await storage.getUser(req.params.id);
      if (!currentUser) {
        return res.status(404).json({ error: "User not found" });
      }

      const normalizedCurrentRole = currentUser.role;
      const normalizedRequestedRole = typeof updateData.role === "string"
        ? (updateData.role === "superadmin" ? "super_admin" : updateData.role)
        : normalizedCurrentRole;
      const roleChanged = typeof updateData.role === "string" && normalizedRequestedRole !== normalizedCurrentRole;

      if (typeof updateData.role === "string") {
        updateData.role = normalizedRequestedRole;
      }

      if (updateData.storeType && !STORE_TYPES.includes(updateData.storeType)) {
        return res.status(400).json({
          error: "Invalid store type",
          details: `Valid types: ${STORE_TYPES.join(", ")}`,
        });
      }

      if ("riderCity" in updateData) {
        updateData.riderCity = typeof updateData.riderCity === "string" ? updateData.riderCity.trim() || null : null;
      }
      if ("riderRegion" in updateData) {
        updateData.riderRegion = typeof updateData.riderRegion === "string" ? updateData.riderRegion.trim() || null : null;
      }

      if ("vehicleInfo" in updateData && updateData.vehicleInfo) {
        const parsedVehicle = vehicleInfoSchema.safeParse(updateData.vehicleInfo);
        if (!parsedVehicle.success) {
          return res.status(400).json({
            error: "Invalid vehicle information",
            details: parsedVehicle.error.issues,
          });
        }
        updateData.vehicleInfo = parsedVehicle.data;
      }

      const mergedUser = {
        ...currentUser,
        ...updateData,
        role: normalizedRequestedRole,
      } as any;

      const manualUpgradeToApplicationRole =
        roleChanged && (normalizedRequestedRole === "seller" || normalizedRequestedRole === "rider");

      if (manualUpgradeToApplicationRole) {
        if (normalizedRequestedRole === "seller") {
          const requiredSellerFields: Array<{ key: string; label: string }> = [
            { key: "nationalIdCard", label: "Ghana Card Number" },
            { key: "businessAddress", label: "Business Address" },
            { key: "storeType", label: "Store Type" },
          ];

          const missingSellerFields = requiredSellerFields
            .filter(({ key }) => {
              const value = (mergedUser as Record<string, any>)[key];
              return value === null || value === undefined || value === "";
            })
            .map(({ label }) => label);

          if (missingSellerFields.length > 0) {
            return res.status(400).json({
              error: "Cannot upgrade user to Seller: required application/KYC fields are missing",
              details: missingSellerFields,
            });
          }

          if (!STORE_TYPES.includes(mergedUser.storeType)) {
            return res.status(400).json({
              error: "Cannot upgrade user to Seller: invalid store type",
              details: `Valid store types: ${STORE_TYPES.join(", ")}`,
            });
          }

          // Admin role setup must not prefill storefront profile fields.
          // Force seller to complete these in their own profile flow.
          updateData.storeName = null;
          updateData.storeDescription = null;
          updateData.storeBanner = null;
        }

        if (normalizedRequestedRole === "rider") {
          const requiredRiderFields: Array<{ key: string; label: string }> = [
            { key: "nationalIdCard", label: "Ghana Card Number" },
            { key: "businessAddress", label: "Address / Location" },
            { key: "riderCity", label: "City" },
            { key: "riderRegion", label: "Region" },
          ];

          const missingRiderFields = requiredRiderFields
            .filter(({ key }) => {
              const value = (mergedUser as Record<string, any>)[key];
              return value === null || value === undefined || value === "";
            })
            .map(({ label }) => label);

          if (!mergedUser.vehicleInfo?.type) {
            missingRiderFields.push("Vehicle Type");
          }

          if (mergedUser.vehicleInfo?.type === "car") {
            if (!mergedUser.vehicleInfo?.plateNumber) missingRiderFields.push("Vehicle Plate Number");
            if (!mergedUser.vehicleInfo?.license) missingRiderFields.push("Driver's License Number");
            if (!mergedUser.vehicleInfo?.color) missingRiderFields.push("Vehicle Color");
          }

          if (mergedUser.vehicleInfo?.type === "motorcycle") {
            if (!mergedUser.vehicleInfo?.plateNumber) missingRiderFields.push("Vehicle Plate Number");
            if (!mergedUser.vehicleInfo?.license) missingRiderFields.push("Driver's License Number");
          }

          if (missingRiderFields.length > 0) {
            return res.status(400).json({
              error: "Cannot upgrade user to Rider: required application/KYC fields are missing",
              details: missingRiderFields,
            });
          }
        }
      }

      // ENFORCE: Sellers cannot lose storeType if approved
      if (currentUser.role === "seller" && currentUser.isApproved) {
        if ("storeType" in updateData && !updateData.storeType) {
          return res.status(400).json({
            error: "Cannot remove store type from approved seller",
            details: "Approved sellers must maintain a valid store type. To change it, provide a new valid type.",
          });
        }
      }

      // ENFORCE: Riders cannot lose vehicleInfo if approved
      if (currentUser.role === "rider" && currentUser.isApproved) {
        if ("vehicleInfo" in updateData && (!updateData.vehicleInfo || !updateData.vehicleInfo.type)) {
          return res.status(400).json({
            error: "Cannot remove vehicle information from approved rider",
            details: "Approved riders must maintain valid vehicle information.",
          });
        }
        if ("riderCity" in updateData && !updateData.riderCity) {
          return res.status(400).json({
            error: "Cannot remove rider city from approved rider",
            details: "Approved riders must maintain city metadata for assignment logic.",
          });
        }
        if ("riderRegion" in updateData && !updateData.riderRegion) {
          return res.status(400).json({
            error: "Cannot remove rider region from approved rider",
            details: "Approved riders must maintain region metadata for assignment logic.",
          });
        }
      }

      // Keep application state coherent when assigning seller/rider roles manually
      if (
        (normalizedRequestedRole === "seller" || normalizedRequestedRole === "rider") &&
        (roleChanged || "isApproved" in updateData)
      ) {
        const willBeApproved = ("isApproved" in updateData) ? !!updateData.isApproved : !!currentUser.isApproved;
        updateData.applicationStatus = willBeApproved ? "approved" : "pending";
        if (willBeApproved) {
          updateData.interviewScheduledAt = null;
          updateData.interviewScheduledBy = null;
          updateData.rejectionReason = null;
        }
      }

      const user = await storage.updateUser(req.params.id, updateData);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (roleChanged) {
        try {
          const newRoleDashboard = normalizedRequestedRole === "super_admin"
            ? "/admin"
            : `/${normalizedRequestedRole}`;
          const newRoleLabel = ROLE_LABELS[normalizedRequestedRole] || normalizedRequestedRole;
          const previousRoleLabel = ROLE_LABELS[normalizedCurrentRole] || normalizedCurrentRole;
          const enabledCapabilities = (ROLE_CAPABILITIES[normalizedRequestedRole] || ["Access your updated workspace"])
            .join("; ");
          const roleUpdateMessage = formatFormalNotification(
            `Dear ${user.name || "User"},`,
            [
              {
                label: "Role Update",
                value: `Your account role has been updated from ${previousRoleLabel} to ${newRoleLabel}.`,
              },
              {
                label: "Effective Date",
                value: new Date().toLocaleString("en-US"),
              },
              {
                label: "New Capabilities",
                value: enabledCapabilities,
              },
              {
                label: "Next Steps",
                value: `Sign in and open ${newRoleDashboard} to begin using your new permissions.`,
              },
            ],
          );
          const title = normalizedRequestedRole === "agent"
            ? "Promotion: Agent Access Granted"
            : "Account Role Updated";

          await storage.createNotification({
            userId: user.id,
            type: "system",
            title,
            message: roleUpdateMessage,
            metadata: {
              previousRole: normalizedCurrentRole,
              newRole: normalizedRequestedRole,
              link: newRoleDashboard,
            } as any,
          });

          io.to(user.id).emit("notification", {
            type: "system",
            title,
            message: roleUpdateMessage,
            data: {
              previousRole: normalizedCurrentRole,
              newRole: normalizedRequestedRole,
              link: newRoleDashboard,
            },
          });
        } catch (notificationError) {
          console.error("Failed to create role update notification:", notificationError);
        }
      }

      const { password, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  

  app.delete("/api/users/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
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
        const existingRole = String(existingUser.role || "");
        const existingRequestedRole = String((existingUser as any).requestedRole || "");
        const existingStatus = String((existingUser as any).applicationStatus || "").toLowerCase();
        const effectiveRole = (existingRequestedRole || existingRole).toLowerCase();
        if (effectiveRole === "seller" || effectiveRole === "rider") {
          if (effectiveRole !== "seller") {
            return res.status(409).json({
              error: `You can only apply to one role. This account already applied as ${effectiveRole}.`,
              userMessage: `You can only apply to one role. This account already applied as ${effectiveRole}.`,
            });
          }
          if (["pending", "interview_scheduled", "approved"].includes(existingStatus) || (existingUser as any).isApproved) {
            return res.status(200).json({
              success: true,
              alreadyApplied: true,
              role: "seller",
              applicationStatus: existingStatus || ((existingUser as any).isApproved ? "approved" : null),
              userMessage: "Your application to become a seller has been submitted. An admin will review and approve your application shortly.",
            });
          }
        }
        return res.status(400).json({ error: "Email already registered. Please log in to continue your application." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await storage.createUser({
        ...userData,
        password: hashedPassword,
        role: "buyer",
        requestedRole: "seller",
        applicationStatus: "pending",
        isApproved: false,
      });

      await notifyAdmins(
        "user",
        `New seller application`,
        `${userData.name} has applied to become a seller`,
        { userId: newUser.id, role: "seller", link: `/admin/applications?userId=${newUser.id}&role=seller` },
        {
          requiredAdminPermission: "manage_users",
          includeAgents: true,
          requiredAgentFeature: "users.view",
        }
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
        const existingRole = String(existingUser.role || "");
        const existingRequestedRole = String((existingUser as any).requestedRole || "");
        const existingStatus = String((existingUser as any).applicationStatus || "").toLowerCase();
        const effectiveRole = (existingRequestedRole || existingRole).toLowerCase();
        if (effectiveRole === "seller" || effectiveRole === "rider") {
          if (effectiveRole !== "rider") {
            return res.status(409).json({
              error: `You can only apply to one role. This account already applied as ${effectiveRole}.`,
              userMessage: `You can only apply to one role. This account already applied as ${effectiveRole}.`,
            });
          }
          if (["pending", "interview_scheduled", "approved"].includes(existingStatus) || (existingUser as any).isApproved) {
            return res.status(200).json({
              success: true,
              alreadyApplied: true,
              role: "rider",
              applicationStatus: existingStatus || ((existingUser as any).isApproved ? "approved" : null),
              userMessage: "Your application to become a rider has been submitted. An admin will review and approve your application shortly.",
            });
          }
        }
        return res.status(400).json({ error: "Email already registered. Please log in to continue your application." });
      }

      // Build properly typed user data
      const userData: any = { ...rawUserData };
      userData.riderCity = typeof rawUserData.riderCity === "string" ? rawUserData.riderCity.trim() : undefined;
      userData.riderRegion = typeof rawUserData.riderRegion === "string" ? rawUserData.riderRegion.trim() : undefined;
      if (!userData.riderCity || !userData.riderRegion) {
        const address = String(rawUserData.businessAddress || "").trim();
        if (address) {
          const parts = address.split(",").map((part: string) => part.trim()).filter(Boolean);
          if (!userData.riderCity && parts[0]) userData.riderCity = parts[0];
          if (!userData.riderRegion && parts[1]) userData.riderRegion = parts[1];
        }
      }
      if (!userData.riderCity || String(userData.riderCity).length < 2) {
        return res.status(400).json({ error: "City is required for rider applications" });
      }
      if (!userData.riderRegion || String(userData.riderRegion).length < 2) {
        return res.status(400).json({ error: "Region is required for rider applications" });
      }

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

      // Best-effort zone mapping from rider city/region.
      if (!userData.deliveryZoneId) {
        const zones = await storage.getDeliveryZones();
        const city = normalizeZoneText(userData.riderCity);
        const region = normalizeZoneText(userData.riderRegion);
        if (city) {
          const matchedCityZone = zones.find((z: any) =>
            normalizeZoneText(z.city) === city || normalizeZoneText(z.name) === city
          );
          if (matchedCityZone) userData.deliveryZoneId = matchedCityZone.id;
        }
        if (!userData.deliveryZoneId && region) {
          const matchedRegionZone = zones.find((z: any) =>
            normalizeZoneText(z.region) === region || normalizeZoneText(z.name) === region
          );
          if (matchedRegionZone) userData.deliveryZoneId = matchedRegionZone.id;
        }
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      
      const newUser = await storage.createUser({
        ...userData,
        password: hashedPassword,
        role: "buyer",
        requestedRole: "rider",
        applicationStatus: "pending",
        isApproved: false,
      });

      await notifyAdmins(
        "user",
        `New rider application`,
        `${userData.name} has applied to become a delivery rider`,
        { userId: newUser.id, role: "rider", link: `/admin/applications?userId=${newUser.id}&role=rider` },
        {
          requiredAdminPermission: "manage_users",
          includeAgents: true,
          requiredAgentFeature: "users.view",
        }
      );

      const { password: _, ...userWithoutPassword } = newUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Product Routes ============
  // Only sellers may create products via this endpoint. Admins should not create products directly.
  app.post("/api/products", requireAuth, requireRole("seller"), requireRoleFeature("products.create"), upload.fields([
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
        { productId: product.id, sellerId: req.user!.id },
        {
          requiredAdminPermission: "manage_products",
          includeAgents: true,
          requiredAgentFeature: "products.viewAll",
        }
      );

      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: create product on behalf of a seller
  app.post("/api/admin/products", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_products"), async (req: AuthRequest, res) => {
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
        { productId: product.id, sellerId },
        {
          requiredAdminPermission: "manage_products",
          includeAgents: true,
          requiredAgentFeature: "products.viewAll",
        }
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

  app.patch("/api/products/:id", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.edit"), async (req: AuthRequest, res) => {
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

  app.patch("/api/products/:id/status", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_products"), async (req: AuthRequest, res) => {
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

  app.delete("/api/products/:id", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.delete"), async (req: AuthRequest, res) => {
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
  app.post("/api/delivery-zones", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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

  app.patch("/api/delivery-zones/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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

  app.delete("/api/delivery-zones/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      await storage.deleteDeliveryZone(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Coupon Routes ============
  app.post("/api/coupons", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_promotions"), requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
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

  app.get("/api/coupons", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_promotions"), requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
    try {
      const coupons = await storage.getCouponsBySeller(req.user!.id);
      res.json(coupons);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/coupons/:id", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_promotions"), async (req: AuthRequest, res) => {
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

  app.patch("/api/coupons/:id", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_promotions"), requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
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

  app.delete("/api/coupons/:id", requireAuth, requireRole("admin", "seller"), requirePermissionIfAdmin("manage_promotions"), requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
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
  app.post("/api/wishlist", requireAuth, requireRoleFeature("wishlist.manage"), async (req: AuthRequest, res) => {
    try {
      const validatedData = insertWishlistSchema.parse(req.body);
      const wishlistItem = await storage.addToWishlist(req.user!.id, validatedData.productId);
      res.json(wishlistItem);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/wishlist", requireAuth, requireRoleFeature("wishlist.manage"), async (req: AuthRequest, res) => {
    try {
      const wishlist = await storage.getWishlist(req.user!.id);
      res.json(wishlist);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete("/api/wishlist/:productId", requireAuth, requireRoleFeature("wishlist.manage"), async (req: AuthRequest, res) => {
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
      
      // Notify admins about new review with proper redirect metadata
      const product = await storage.getProduct(validatedData.productId);
      await notifyAdmins(
        "review",
        "New review posted",
        `A customer posted a ${validatedData.rating}-star review${product ? ` for ${product.name}` : ''}`,
        { reviewId: review.id, productId: validatedData.productId, userId: req.user!.id, link: `/product/${validatedData.productId}?reviewId=${review.id}` },
        {
          requiredAdminPermission: "manage_reviews",
        }
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

  // Create product variant
  app.post("/api/products/:productId/variants", requireAuth, requireRole("seller", "admin", "super_admin"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.edit"), async (req: AuthRequest, res) => {
    try {
      const { productId } = req.params;
      const { color, size, sku, image, stock, priceAdjustment } = req.body;

      // Verify the product belongs to the seller (or admin creating on behalf)
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user?.role === "seller" && product.sellerId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const variant = await storage.createProductVariant({
        productId,
        color: color || null,
        size: size || null,
        sku: sku || null,
        image: image || null,
        stock: stock || 0,
        priceAdjustment: priceAdjustment || "0",
      });

      res.json(variant);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Update product variant
  app.put("/api/products/:productId/variants/:variantId", requireAuth, requireRole("seller", "admin", "super_admin"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.edit"), async (req: AuthRequest, res) => {
    try {
      const { productId, variantId } = req.params;
      const { color, size, sku, image, stock, priceAdjustment } = req.body;

      // Verify the product belongs to the seller
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user?.role === "seller" && product.sellerId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const variant = await storage.updateProductVariant(variantId, {
        color: color || null,
        size: size || null,
        sku: sku || null,
        image: image || null,
        stock: stock || 0,
        priceAdjustment: priceAdjustment || "0",
      });

      res.json(variant);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Delete product variant
  app.delete("/api/products/:productId/variants/:variantId", requireAuth, requireRole("seller", "admin", "super_admin"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.edit"), async (req: AuthRequest, res) => {
    try {
      const { productId, variantId } = req.params;

      // Verify the product belongs to the seller
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user?.role === "seller" && product.sellerId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      await storage.deleteProductVariant(variantId);
      res.json({ success: true });
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
  app.get("/api/admin/hero-banners", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
    try {
      const banners = await storage.getAllHeroBanners();
      res.json(banners);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Get single banner
  app.get("/api/admin/hero-banners/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
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
  app.post("/api/admin/hero-banners", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
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
  app.patch("/api/admin/hero-banners/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
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
  app.delete("/api/admin/hero-banners/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
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
  app.post("/api/admin/banner-collections", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const validatedData = insertBannerCollectionSchema.parse(req.body);
      const collection = await storage.createBannerCollection(validatedData);
      res.json(collection);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/banner-collections", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const collections = await storage.getBannerCollections();
      res.json(collections);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/banner-collections/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
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

  app.patch("/api/admin/banner-collections/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
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

  app.delete("/api/admin/banner-collections/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
    try {
      await storage.deleteBannerCollection(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Marketplace Banners (Admin only)
  app.post("/api/admin/marketplace-banners", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), upload.single("image"), async (req, res) => {
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

  app.get("/api/admin/marketplace-banners", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const { collectionId } = req.query;
      const banners = await storage.getMarketplaceBanners(collectionId as string);
      res.json(banners);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/marketplace-banners/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
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

  app.patch("/api/admin/marketplace-banners/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), upload.single("image"), async (req, res) => {
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

  app.delete("/api/admin/marketplace-banners/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
    try {
      await storage.deleteMarketplaceBanner(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/marketplace-banners/reorder", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_promotions"), async (req, res) => {
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

  app.get("/api/admin/footer-pages", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      const pages = await storage.getAllFooterPages();
      res.json(pages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Platform earnings list
  app.get('/api/admin/platform-earnings', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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

  app.get('/api/admin/finance-summary', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const summary = await storage.getPlatformEarningsSummary();
      res.json(summary);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Sellers list with payout summary
  app.get('/api/admin/sellers', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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
          phone: s.phone,
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
  app.get('/api/admin/sellers/:id/payouts', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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
  app.get('/api/admin/riders-payouts', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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
  app.get('/api/admin/riders/:id/payouts', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const riderId = req.params.id;
      const payouts = await storage.getRiderPayouts(riderId);
      res.json(payouts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: Get all pending rider payouts awaiting approval
  app.get('/api/admin/rider-payouts/pending', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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
  app.get('/api/admin/transactions', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const limit = parseInt((req.query.limit as string) || '50');
      const offset = parseInt((req.query.offset as string) || '0');
      const txs = await storage.getTransactions(limit, offset);
      res.json(txs);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/admin/footer-pages", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      const data = insertFooterPageSchema.parse(req.body);
      const page = await storage.createFooterPage(data);
      res.status(201).json(page);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/admin/footer-pages/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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

  app.delete("/api/admin/footer-pages/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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
  app.post("/api/seed/marketplace-setup", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
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
  type RiderMatchCandidate = {
    riderId: string;
    riderName: string;
    rating: number;
    distanceKm: number | null;
    zoneId: string | null;
    zoneMatched: boolean;
  };

  type PendingRiderAssignment = {
    orderId: string;
    orderNumber: string;
    actorId: string;
    actorRole: "seller" | "admin" | "super_admin";
    candidates: RiderMatchCandidate[];
    attempts: RiderAssignmentAttempt[];
    currentCandidateIndex: number;
    currentRadiusKm: number;
    currentRadiusIndex: number;
    attemptedRiderIds: string[];
    currentRiderId: string | null;
    acceptedRiderId: string | null;
    expiresAt: string | null;
    timer: NodeJS.Timeout | null;
    startedAt: string;
    lastError?: string;
  };

  const pendingRiderAssignments = new Map<string, PendingRiderAssignment>();
  const isManualAssignmentConfirmationRequired =
    String(process.env.RIDER_ASSIGNMENT_MANUAL_CONFIRM || "false").toLowerCase().trim() === "true";

  let assignRiderToOrder: (params: {
    orderId: string;
    riderId: string;
    actorId: string;
    actorRole: string;
    allowSellerOwnershipCheck?: boolean;
  }) => Promise<any>;

  const toFiniteNumber = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const normalizeOtp = (value: unknown): string => String(value ?? "").replace(/\D/g, "").trim();
  const isPrivilegedOpsRole = (role?: string | null) => role === "admin" || role === "super_admin";
  const normalizePaymentStatus = (value?: string | null) => (value || "").toLowerCase().trim();
  const isPaidPaymentStatus = (value?: string | null) =>
    ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
  const isPickupMethod = (value?: string | null) => (value || "").toLowerCase().trim() === "pickup";
  const resolveVisibleOrderStateForRole = (
    orderLike: { status?: string | null; paymentStatus?: string | null; deliveryMethod?: string | null },
    viewerRole?: string | null
  ): { status: string; hidden: boolean } => {
    const canonicalStatus = canonicalizeOrderStatus(orderLike?.status || "");
    const paid = isPaidPaymentStatus(orderLike?.paymentStatus);
    const pickup = isPickupMethod(orderLike?.deliveryMethod);

    if (isPrivilegedOpsRole(viewerRole)) return { status: canonicalStatus, hidden: false };

    if (viewerRole === "seller") {
      if (!paid) return { status: canonicalStatus, hidden: true };
      if (canonicalStatus === "searching_rider") return { status: "ready", hidden: false };
      if (["assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes(canonicalStatus)) {
        return { status: "in_transit", hidden: false };
      }
      if (["delivered", "completed"].includes(canonicalStatus)) return { status: "completed", hidden: false };
      return { status: canonicalStatus, hidden: false };
    }

    if (viewerRole === "rider") {
      if (!paid || pickup) return { status: canonicalStatus, hidden: true };
      if (["searching_rider", "created", "confirmed", "processing", "ready"].includes(canonicalStatus)) {
        return { status: canonicalStatus, hidden: true };
      }
      if (["delivered", "completed"].includes(canonicalStatus)) return { status: "completed", hidden: false };
      return { status: canonicalStatus, hidden: false };
    }

    if (viewerRole === "buyer") {
      if (!paid) return { status: "pending", hidden: false };
      if (pickup) {
        if (["delivered", "completed"].includes(canonicalStatus)) return { status: "delivered", hidden: false };
        return { status: canonicalStatus, hidden: false };
      }
      if (["searching_rider", "assigned", "rider_arrived", "ready", "confirmed", "processing"].includes(canonicalStatus)) {
        return { status: "processing", hidden: false };
      }
      if (["picked_up", "in_transit", "en_route"].includes(canonicalStatus)) return { status: "en_route", hidden: false };
      if (["delivered", "completed"].includes(canonicalStatus)) return { status: "delivered", hidden: false };
      return { status: canonicalStatus, hidden: false };
    }

    if (canonicalStatus === "searching_rider") return { status: "processing", hidden: false };
    return { status: canonicalStatus, hidden: false };
  };
  const mapOrderStatusForViewerRole = (
    orderLike: { status?: string | null; paymentStatus?: string | null; deliveryMethod?: string | null },
    viewerRole?: string | null
  ) => resolveVisibleOrderStateForRole(orderLike, viewerRole).status;

  const resolveVerificationMethod = (hasQr: boolean, hasOtp: boolean): "qr" | "otp" | "qr_otp" | "unknown" => {
    if (hasQr && hasOtp) return "qr_otp";
    if (hasQr) return "qr";
    if (hasOtp) return "otp";
    return "unknown";
  };

  const formatVerificationMethodLabel = (method?: string | null): string | null => {
    const normalized = String(method || "").toLowerCase().trim();
    if (normalized === "qr") return "QR";
    if (normalized === "otp") return "OTP";
    if (normalized === "qr_otp") return "QR + OTP";
    return null;
  };
  const resolveUserDisplayName = (user?: { name?: string | null; email?: string | null; id?: string | null } | null) => {
    const name = String(user?.name || "").trim();
    if (name) return name;
    const email = String(user?.email || "").trim();
    if (email.includes("@")) return email.split("@")[0];
    const id = String(user?.id || "").trim();
    if (id) return `User ${id.slice(0, 6)}`;
    return "Unknown";
  };

  const extractVerificationSummary = (history: Array<any>) => {
    const summary: {
      sellerToRider?: string | null;
      riderToBuyer?: string | null;
      sellerToBuyer?: string | null;
    } = {};

    for (const entry of history) {
      const reason = String(entry?.reason || "");
      const matched = reason.match(/^verification:(seller_to_rider|rider_to_buyer|seller_to_buyer):(qr|otp|qr_otp)$/);
      if (matched) {
        const channel = matched[1];
        const methodLabel = formatVerificationMethodLabel(matched[2]);
        if (!methodLabel) continue;
        if (channel === "seller_to_rider" && !summary.sellerToRider) summary.sellerToRider = methodLabel;
        if (channel === "rider_to_buyer" && !summary.riderToBuyer) summary.riderToBuyer = methodLabel;
        if (channel === "seller_to_buyer" && !summary.sellerToBuyer) summary.sellerToBuyer = methodLabel;
        continue;
      }
      // Backward compatibility for legacy reason strings before method capture existed.
      if (!summary.sellerToRider && reason === "seller_pickup_qr_otp_verified") {
        summary.sellerToRider = "QR + OTP";
        continue;
      }
      if (!summary.riderToBuyer && reason === "qr_delivery_verified") {
        summary.riderToBuyer = "Verified (legacy)";
        continue;
      }
      if (!summary.sellerToBuyer && reason === "seller_customer_pickup_qr_otp_verified") {
        summary.sellerToBuyer = "QR + OTP";
        continue;
      }
    }

    return summary;
  };

  const sanitizeOrderVerificationSecrets = (order: any, viewer: { id: string; role: string }) => {
    const isAdminViewer = viewer.role === "admin" || viewer.role === "super_admin";
    const isBuyerViewer = order?.buyerId === viewer.id;
    const isSellerViewer = order?.sellerId === viewer.id;
    const isRiderViewer = order?.riderId && order.riderId === viewer.id;
    const sanitized = { ...order } as any;

    if (isAdminViewer) {
      return sanitized;
    }

    if (isBuyerViewer) {
      return sanitized;
    }

    if (isSellerViewer) {
      sanitized.deliveryOtp = null;
      return sanitized;
    }

    if (isRiderViewer) {
      sanitized.deliveryOtp = null;
      sanitized.pickupOtp = null;
      sanitized.qrCode = null;
      return sanitized;
    }

    sanitized.deliveryOtp = null;
    sanitized.pickupOtp = null;
    sanitized.qrCode = null;
    return sanitized;
  };

  const haversineDistanceKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c;
  };

  const resolveSpeedKmh = (value: unknown): number | null => {
    const raw = toFiniteNumber(value);
    if (raw === null || raw <= 0) return null;
    if (raw <= 60) return raw * 3.6;
    return raw;
  };

  const computeEtaMetrics = (params: {
    riderLat: number;
    riderLng: number;
    destinationLat: number;
    destinationLng: number;
    speedRaw?: unknown;
  }) => {
    const distanceKm = haversineDistanceKm(
      params.riderLat,
      params.riderLng,
      params.destinationLat,
      params.destinationLng
    );
    const speedKmh = resolveSpeedKmh(params.speedRaw) ?? 30;
    const etaMinutes = distanceKm <= 0.05 ? 0 : Math.max(1, Math.ceil((distanceKm / speedKmh) * 60));
    return {
      distanceKm: Number(distanceKm.toFixed(3)),
      etaMinutes,
      speedKmh: Number(speedKmh.toFixed(2)),
      source: "backend_math",
    };
  };

  const clearPendingRiderAssignment = (orderId: string) => {
    const pending = pendingRiderAssignments.get(orderId);
    if (pending?.timer) {
      clearTimeout(pending.timer);
    }
    pendingRiderAssignments.delete(orderId);
  };

  const getOrderLocationForMatching = (order: any): { lat: number; lng: number } | null => {
    const lat = toFiniteNumber(order.deliveryLatitude);
    const lng = toFiniteNumber(order.deliveryLongitude);
    if (lat === null || lng === null) return null;
    return { lat, lng };
  };

  const normalizeZoneText = (value?: string | null) => (value || "").toLowerCase().trim();

  const resolveZoneByRiderProfile = (rider: any, zones: any[]): string | null => {
    if (rider.deliveryZoneId) return String(rider.deliveryZoneId);
    const riderCity = normalizeZoneText(rider.riderCity);
    const riderRegion = normalizeZoneText(rider.riderRegion);
    if (riderCity) {
      const cityZone = zones.find((z) => normalizeZoneText(z.city) === riderCity || normalizeZoneText(z.name) === riderCity);
      if (cityZone) return String(cityZone.id);
    }
    if (riderRegion) {
      const regionZone = zones.find((z) => normalizeZoneText(z.region) === riderRegion || normalizeZoneText(z.name) === riderRegion);
      if (regionZone) return String(regionZone.id);
    }
    return null;
  };

  const resolveZoneByOrder = (order: any, zones: any[]): string | null => {
    if (order.deliveryZoneId) return String(order.deliveryZoneId);
    const city = normalizeZoneText(order.deliveryCity);
    if (city) {
      const cityZone = zones.find((z) => normalizeZoneText(z.city) === city || normalizeZoneText(z.name) === city);
      if (cityZone) return String(cityZone.id);
    }
    return null;
  };

  const getRiderMatchCandidates = async (order: any, radiusKm: number, excludedRiderIds: string[] = []): Promise<RiderMatchCandidate[]> => {
    const allRiders = await storage.getUsersByRole("rider");
    const activeRiders = allRiders.filter((r: any) => r.isApproved && r.isActive && r.riderOnline !== false);
    if (activeRiders.length === 0) return [];

    const allOrders = await storage.getAllOrders();
    const ridersOnDelivery = new Set(
      allOrders
        .filter((o: any) => ["assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes((o.status || "").toLowerCase().trim()) && o.riderId)
        .map((o: any) => o.riderId)
    );

    const excludedSet = new Set(excludedRiderIds);
    const availableRiders = activeRiders.filter((r: any) => !ridersOnDelivery.has(r.id) && !excludedSet.has(r.id));
    if (availableRiders.length === 0) return [];

    const zones = await storage.getDeliveryZones();
    const orderLocation = getOrderLocationForMatching(order);
    const resolvedOrderZoneId = resolveZoneByOrder(order, zones);
    const riderLocations = await Promise.all(
      availableRiders.map(async (rider: any) => ({
        rider,
        location: await storage.getLatestRiderLocation(rider.id),
      }))
    );

    const candidates = riderLocations
      .map(({ rider, location }) => {
        const riderLat = toFiniteNumber(location?.latitude);
        const riderLng = toFiniteNumber(location?.longitude);
        const distanceKm =
          orderLocation && riderLat !== null && riderLng !== null
            ? haversineDistanceKm(riderLat, riderLng, orderLocation.lat, orderLocation.lng)
            : null;
        return {
          riderId: rider.id,
          riderName: rider.name,
          rating: toFiniteNumber(rider.ratings) ?? 0,
          distanceKm,
          zoneId: resolveZoneByRiderProfile(rider, zones),
          zoneMatched: false,
        };
      })
      .filter((candidate) => candidate.distanceKm === null || candidate.distanceKm <= radiusKm);

    const minDistance = candidates.reduce((min, c) => {
      if (c.distanceKm === null) return min;
      return Math.min(min, c.distanceKm);
    }, Number.MAX_SAFE_INTEGER);

    const rankedCandidates = candidates
      .map((candidate) => ({
        ...candidate,
        zoneMatched:
          ENABLE_SOFT_ZONE_MATCH &&
          !!resolvedOrderZoneId &&
          !!candidate.zoneId &&
          String(candidate.zoneId) === String(resolvedOrderZoneId) &&
          (candidate.distanceKm === null || candidate.distanceKm <= minDistance + SOFT_ZONE_DISTANCE_MARGIN_KM),
      }))
      .sort((a, b) => {
        const distanceA = a.distanceKm === null ? Number.MAX_SAFE_INTEGER : a.distanceKm;
        const distanceB = b.distanceKm === null ? Number.MAX_SAFE_INTEGER : b.distanceKm;
        if (a.zoneMatched !== b.zoneMatched) return a.zoneMatched ? -1 : 1;
        if (distanceA !== distanceB) return distanceA - distanceB;
        if (a.rating !== b.rating) return b.rating - a.rating;
        return a.riderId.localeCompare(b.riderId);
      })
      .slice(0, RIDER_MATCH_LIMIT);

    return rankedCandidates;
  };

  const emitRiderAssignmentFailure = async (order: any, reason: string, attempts: RiderAssignmentAttempt[]) => {
    const [admins, superAdmins] = await Promise.all([
      storage.getUsersByRole("admin"),
      storage.getUsersByRole("super_admin"),
    ]);
    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      reason,
      attempts,
      failedAt: new Date().toISOString(),
    };
    [...admins, ...superAdmins].forEach((adminUser: any) => {
      io.to(adminUser.id).emit("order_rider_assignment_failed", payload);
    });
  };

  const dispatchNextRiderOffer = async (orderId: string) => {
    const pending = pendingRiderAssignments.get(orderId);
    if (!pending) return;

    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }

    const order = await storage.getOrder(orderId);
    if (!order || order.riderId) {
      clearPendingRiderAssignment(orderId);
      return;
    }

    let nextCandidate = pending.candidates[pending.currentCandidateIndex];
    while (!nextCandidate && pending.currentRadiusIndex < RIDER_MATCH_RADIUS_STEPS_KM.length - 1) {
      pending.currentRadiusIndex += 1;
      pending.currentRadiusKm = RIDER_MATCH_RADIUS_STEPS_KM[pending.currentRadiusIndex];
      pending.candidates = await getRiderMatchCandidates(order, pending.currentRadiusKm, pending.attemptedRiderIds);
      pending.currentCandidateIndex = 0;
      nextCandidate = pending.candidates[pending.currentCandidateIndex];
    }

    if (!nextCandidate) {
      pending.lastError = "No available riders accepted the offer";
      pending.currentRiderId = null;
      pending.expiresAt = null;
      await emitRiderAssignmentFailure(order, pending.lastError, pending.attempts);
      return;
    }

    pending.currentCandidateIndex += 1;
    pending.attemptedRiderIds.push(nextCandidate.riderId);
    pending.currentRiderId = nextCandidate.riderId;
    pending.expiresAt = new Date(Date.now() + RIDER_OFFER_TIMEOUT_MS).toISOString();

    pending.attempts.push({
      riderId: nextCandidate.riderId,
      riderName: nextCandidate.riderName,
      distanceKm: nextCandidate.distanceKm,
      reason: nextCandidate.zoneMatched ? "Same-zone preferred offer" : undefined,
      offeredAt: new Date().toISOString(),
      status: "offered",
    });

    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      deliveryAddress: order.deliveryAddress,
      deliveryLatitude: order.deliveryLatitude,
      deliveryLongitude: order.deliveryLongitude,
      estimatedPayout: order.deliveryFee,
      currency: order.currency || "GHS",
      expiresAt: pending.expiresAt,
      radiusKm: pending.currentRadiusKm,
      zoneMatched: nextCandidate.zoneMatched,
    };

    io.to(nextCandidate.riderId).emit("rider_assignment_offer", payload);
    await storage.createNotification({
      userId: nextCandidate.riderId,
      type: "order",
      title: "Delivery Offer",
      message: `You have a new delivery offer for order #${order.orderNumber}.`,
      metadata: { orderId: order.id, orderNumber: order.orderNumber, expiresAt: pending.expiresAt } as any,
    });

    pending.timer = setTimeout(async () => {
      const timedOut = pendingRiderAssignments.get(orderId);
      if (!timedOut || timedOut.currentRiderId !== nextCandidate.riderId) return;
      const offeredAttempt = [...timedOut.attempts].reverse().find((a) => a.riderId === nextCandidate.riderId && a.status === "offered");
      if (offeredAttempt) {
        offeredAttempt.status = "timed_out";
        offeredAttempt.resolvedAt = new Date().toISOString();
        offeredAttempt.reason = "Offer timed out";
      }
      timedOut.currentRiderId = null;
      timedOut.expiresAt = null;
      await dispatchNextRiderOffer(orderId);
    }, RIDER_OFFER_TIMEOUT_MS);
  };

  const startRiderMatching = async (orderId: string, actorId: string, actorRole: "seller" | "admin" | "super_admin") => {
    const order = await storage.getOrder(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (order.deliveryMethod !== "rider") {
      throw new Error("Order does not require rider delivery");
    }
    if (order.riderId) {
      clearPendingRiderAssignment(order.id);
      return order;
    }
    if (canonicalizeOrderStatus(order.status) === "created" && order.paymentStatus !== "completed") {
      throw new Error("Payment must be completed before rider matching");
    }

    const currentStatus = canonicalizeOrderStatus(order.status);
    if (currentStatus !== "searching_rider") {
      await storage.applyOrderStatusTransition(order.id, "searching_rider", actorId, actorRole, "auto_rider_matching_started");
    }

    const initialRadiusKm = RIDER_MATCH_RADIUS_STEPS_KM[0];
    const candidates = await getRiderMatchCandidates(order, initialRadiusKm);
    const pending: PendingRiderAssignment = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      actorId,
      actorRole,
      candidates,
      attempts: [],
      currentCandidateIndex: 0,
      currentRadiusKm: initialRadiusKm,
      currentRadiusIndex: 0,
      attemptedRiderIds: [],
      currentRiderId: null,
      acceptedRiderId: null,
      expiresAt: null,
      timer: null,
      startedAt: new Date().toISOString(),
    };
    clearPendingRiderAssignment(order.id);
    pendingRiderAssignments.set(order.id, pending);
    await dispatchNextRiderOffer(order.id);
    return await storage.getOrder(order.id);
  };

  const startRiderMatchingForPaidOrders = async (orderIds: string[]) => {
    for (const orderId of orderIds) {
      try {
        const order = await storage.getOrder(orderId);
        if (!order) continue;
        if (order.deliveryMethod !== "rider") continue;
        if (order.riderId) continue;
        if (order.paymentStatus !== "completed") continue;
        await startRiderMatching(order.id, order.sellerId, "seller");
      } catch (error: any) {
        console.warn(`[RIDER_MATCH] Failed to start matching for order ${orderId}:`, error?.message || error);
      }
    }
  };

  const extractOrderIdsFromPaymentPayload = (paymentData: any): string[] => {
    const meta = paymentData?.metadata || {};
    const orderIds = Array.isArray(meta.orderIds) ? meta.orderIds.filter(Boolean) : [];
    if (orderIds.length > 0) return orderIds;
    if (meta.orderId) return [meta.orderId];
    return [];
  };

  const resolveRiderOfferResponse = async (orderId: string, riderId: string, action: "accept" | "reject") => {
    const pending = pendingRiderAssignments.get(orderId);
    if (!pending) {
      const error = new Error("No active assignment offer for this order");
      (error as any).code = 404;
      throw error;
    }
    if (pending.currentRiderId !== riderId) {
      const error = new Error("This offer is not active for the rider");
      (error as any).code = 409;
      throw error;
    }

    const activeAttempt = [...pending.attempts].reverse().find((a) => a.riderId === riderId && a.status === "offered");
    if (activeAttempt) {
      activeAttempt.resolvedAt = new Date().toISOString();
      activeAttempt.status = action === "accept" ? "accepted" : "rejected";
      activeAttempt.reason = action === "accept" ? "Accepted by rider" : "Rejected by rider";
    }

    if (pending.timer) {
      clearTimeout(pending.timer);
      pending.timer = null;
    }
    pending.currentRiderId = null;
    pending.expiresAt = null;

    if (action === "accept") {
      if (isManualAssignmentConfirmationRequired) {
        pending.acceptedRiderId = riderId;
        if (activeAttempt) {
          activeAttempt.status = "accepted_pending_admin";
          activeAttempt.reason = "Awaiting admin confirmation";
        }

        const order = await storage.getOrder(orderId);
        if (order) {
          const [admins, superAdmins] = await Promise.all([
            storage.getUsersByRole("admin"),
            storage.getUsersByRole("super_admin"),
          ]);
          const payload = {
            orderId: order.id,
            orderNumber: order.orderNumber,
            riderId,
            riderName: activeAttempt?.riderName || "Rider",
            acceptedAt: new Date().toISOString(),
            manualConfirmationRequired: true,
          };
          [...admins, ...superAdmins].forEach((adminUser: any) => {
            io.to(adminUser.id).emit("order_rider_acceptance_pending_confirmation", payload);
          });
          await Promise.all(
            [...admins, ...superAdmins]
              .filter((adminUser: any) => adminUser?.isActive)
              .map((adminUser: any) =>
                storage.createNotification({
                  userId: adminUser.id,
                  type: "order",
                  title: "Rider Awaiting Confirmation",
                  message: `Rider accepted order #${order.orderNumber}. Confirm assignment to proceed.`,
                  metadata: {
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                    riderId,
                    link: `/admin/manual-rider-assignment?orderId=${order.id}`,
                  } as any,
                })
              )
          );
        }

        return {
          success: true,
          status: "pending_admin_confirmation",
          orderId,
          riderId,
        };
      }

      clearPendingRiderAssignment(orderId);
      return assignRiderToOrder({
        orderId,
        riderId,
        actorId: riderId,
        actorRole: "rider",
      });
    }

    await dispatchNextRiderOffer(orderId);
    return await storage.getOrder(orderId);
  };

  const emitOrderStatusUpdateToStakeholders = async (order: any, statusOverride?: string) => {
    const canonicalStatus = canonicalizeOrderStatus(statusOverride || order.status);
    const payload = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      updatedAt: order.updatedAt || new Date().toISOString(),
    };

    const stakeholderTargets = [
      order.buyerId ? { userId: order.buyerId, fallbackRole: "buyer" } : null,
      order.sellerId ? { userId: order.sellerId, fallbackRole: "seller" } : null,
      order.riderId ? { userId: order.riderId, fallbackRole: "rider" } : null,
    ].filter(Boolean) as Array<{ userId: string; fallbackRole: string }>;
    await Promise.all(
      stakeholderTargets.map(async ({ userId, fallbackRole }) => {
        const user = await storage.getUser(userId);
        const viewerRole = user?.role || fallbackRole;
        io.to(userId).emit("order_status_updated", {
          ...payload,
          status: mapOrderStatusForViewerRole(
            {
              status: canonicalStatus,
              paymentStatus: order.paymentStatus,
              deliveryMethod: order.deliveryMethod,
            },
            viewerRole
          ),
        });
      })
    );

    const [admins, superAdmins] = await Promise.all([
      storage.getUsersByRole("admin"),
      storage.getUsersByRole("super_admin"),
    ]);
    [...admins, ...superAdmins].forEach((adminUser) => {
      const adminPayload = {
        ...payload,
        status: mapOrderStatusForViewerRole(
          {
            status: canonicalStatus,
            paymentStatus: order.paymentStatus,
            deliveryMethod: order.deliveryMethod,
          },
          adminUser.role
        ),
      };
      io.to(adminUser.id).emit("order_status_updated", adminPayload);
      io.to(adminUser.id).emit("admin_order_status_updated", adminPayload);
    });
  };

  const finalizeRiderDelivery = async (orderId: string, riderId: string, reason: string) => {
    const order = await storage.getOrder(orderId);
    if (!order) {
      const error = new Error("Order not found");
      (error as any).code = 404;
      throw error;
    }
    if (order.riderId !== riderId) {
      const error = new Error("You are not assigned to this delivery");
      (error as any).code = 403;
      throw error;
    }

    const normalizedOrderStatus = canonicalizeOrderStatus(order.status);
    const completionEligibleStatuses = new Set(["rider_arrived", "picked_up", "in_transit", "en_route"]);
    if (!completionEligibleStatuses.has(normalizedOrderStatus)) {
      const error = new Error(`Order cannot be completed from "${order.status}" status`);
      (error as any).code = 400;
      throw error;
    }

    const deliveredOrder = await storage.applyOrderStatusTransition(
      orderId,
      "delivered",
      riderId,
      "rider",
      reason
    );
    if (!deliveredOrder) {
      const error = new Error("Order not found");
      (error as any).code = 404;
      throw error;
    }

    const updatedOrder = await storage.applyOrderStatusTransition(
      orderId,
      "completed",
      riderId,
      "rider",
      "delivery_verified_and_completed"
    );
    if (!updatedOrder) {
      const error = new Error("Order not found");
      (error as any).code = 404;
      throw error;
    }

    await storage.createNotification({
      userId: order.buyerId,
      type: "order",
      title: "Order Completed!",
      message: `Your order #${order.orderNumber} has been successfully delivered and verified.`,
      metadata: { link: `/orders/${orderId}` } as any,
    });

    await storage.createNotification({
      userId: order.sellerId,
      type: "order",
      title: "Order Completed",
      message: `Order #${order.orderNumber} delivery has been verified and completed.`,
      metadata: { link: `/seller/orders?orderId=${orderId}` } as any,
    });

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

    await emitOrderStatusUpdateToStakeholders(updatedOrder, "completed");

    // Keep payout creation idempotent across all delivery completion entry points.
    if (order.deliveryFee) {
      const existingPayout = await db
        .select({ id: riderPayouts.id })
        .from(riderPayouts)
        .where(and(eq(riderPayouts.orderId, orderId), eq(riderPayouts.riderId, riderId)))
        .limit(1);
      if (existingPayout.length === 0) {
        try {
          const rider = await storage.getUser(riderId);
          const payout = await storage.createRiderPayout({
            riderId,
            orderId,
            amount: order.deliveryFee,
            currency: order.currency || "GHS",
            method: "mobile_money",
            status: "pending_approval",
            notes: `Order #${order.orderNumber} delivered by ${rider?.name || "Rider"}. Amount: ${order.currency || "GHS"} ${order.deliveryFee}. Status: Completed & Verified.`,
          });

          const superAdmins = await storage.getUsersByRole("super_admin");
          const buyer = await storage.getUser(order.buyerId);
          for (const admin of superAdmins) {
            if (!admin.isActive) continue;
            await storage.createNotification({
              userId: admin.id,
              type: "payout",
              title: "📦 Payout Action Required",
              message: `Order #${order.orderNumber} delivered by ${rider?.name || "Rider"}. Amount: ${order.currency || "GHS"} ${order.deliveryFee}. Status: Completed & Verified.`,
              metadata: {
                link: `/admin/riders-payouts`,
                payoutId: payout.id,
                orderId,
                riderId,
                riderName: rider?.name || "Rider",
                amount: order.deliveryFee,
                currency: order.currency || "GHS",
                orderNumber: order.orderNumber,
                buyerName: buyer?.name || "Customer",
                deliveryAddress: order.deliveryAddress || "",
              } as any,
            });
          }
          io.emit("admin_payout_pending", {
            payoutId: payout.id,
            orderId,
            orderNumber: order.orderNumber,
            riderId,
            riderName: rider?.name || "Rider",
            amount: order.deliveryFee,
            currency: order.currency || "GHS",
            createdAt: new Date().toISOString(),
          });
        } catch (payoutError) {
          console.error("[PAYOUT] Failed to create rider payout after delivery:", payoutError);
        }
      }
    }

    return updatedOrder;
  };

  app.post("/api/orders", requireAuth, requireRoleFeature("orders.create"), async (req: AuthRequest, res) => {
    try {
      const { items, ...orderData } = req.body;
      
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "Order must contain at least one item" });
      }
      
      // Get platform settings to check if multi-vendor mode is enabled
      const platformSettings = await storage.getPlatformSettings();
      const platformIsMultiVendor = platformSettings?.isMultiVendor ?? false;
      const processingFeePercent = Number(platformSettings?.processingFeePercent ?? "1.95");
      const processingFeeRate = Number.isFinite(processingFeePercent) ? processingFeePercent / 100 : 0.0195;
      
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
      const serverProcessingFee = (serverSubtotal + deliveryFee) * processingFeeRate;
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
      const buyerProfile = await storage.getUser(req.user!.id);
      const normalizedDeliveryMethod = String(orderData.deliveryMethod || "").toLowerCase().trim();
      if (!["pickup", "bus", "rider"].includes(normalizedDeliveryMethod)) {
        return res.status(400).json({
          error: "Invalid delivery method",
          userMessage: "Please select a valid fulfillment method before placing your order.",
        });
      }
      const isPickupOrder = normalizedDeliveryMethod === "pickup";
      const resolvedDeliveryPhone = isPickupOrder
        ? null
        : ((typeof orderData.deliveryPhone === "string" && orderData.deliveryPhone.trim()) ||
          (buyerProfile?.phone || null));
      const resolvedDeliveryAddress = isPickupOrder
        ? null
        : ((typeof orderData.deliveryAddress === "string" && orderData.deliveryAddress.trim()) ||
          (buyerProfile?.businessAddress || null));
      const resolvedDeliveryCity = isPickupOrder
        ? null
        : (typeof orderData.deliveryCity === "string" && orderData.deliveryCity.trim())
          ? orderData.deliveryCity
          : null;
      const resolvedDeliveryZoneId = isPickupOrder ? null : (orderData.deliveryZoneId || null);
      const resolvedDeliveryLatitude = isPickupOrder ? null : (orderData.deliveryLatitude || null);
      const resolvedDeliveryLongitude = isPickupOrder ? null : (orderData.deliveryLongitude || null);

      if (!isPickupOrder && !resolvedDeliveryAddress) {
        return res.status(400).json({
          error: "Delivery address is required",
          userMessage: "Please provide a delivery address for bus or rider delivery.",
        });
      }
      if (!isPickupOrder && !resolvedDeliveryPhone) {
        return res.status(400).json({
          error: "Delivery phone is required",
          userMessage: "Please provide a delivery contact number for bus or rider delivery.",
        });
      }
      
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
            const sellerProcessingFee = (sellerSubtotal - sellerCouponDiscount + sellerDeliveryFee) * processingFeeRate;
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
          deliveryMethod: normalizedDeliveryMethod,
          deliveryZoneId: resolvedDeliveryZoneId,
          deliveryAddress: resolvedDeliveryAddress,
          deliveryCity: resolvedDeliveryCity,
          deliveryPhone: resolvedDeliveryPhone,
          deliveryLatitude: resolvedDeliveryLatitude,
          deliveryLongitude: resolvedDeliveryLongitude,
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
        const finalProcessingFee = (serverSubtotal - singleVendorCouponDiscount + deliveryFee) * processingFeeRate;
        const finalTotal = serverSubtotal - singleVendorCouponDiscount + deliveryFee + finalProcessingFee;
        
        const orderInput = {
          ...orderData,
          buyerId: req.user!.id,
          deliveryMethod: normalizedDeliveryMethod,
          deliveryZoneId: resolvedDeliveryZoneId,
          deliveryCity: resolvedDeliveryCity,
          deliveryAddress: resolvedDeliveryAddress,
          deliveryPhone: resolvedDeliveryPhone,
          deliveryLatitude: resolvedDeliveryLatitude,
          deliveryLongitude: resolvedDeliveryLongitude,
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
      // Rider matching starts only after payment verification to keep assignment deterministic.
      
      // Notify operations users as soon as an order is created (pending payment),
      // then follow with payment-confirmed notification once paid.
      try {
        const orderNumbers = createdOrders.map((o: any) => `#${o.orderNumber}`).join(", ");
        await notifyAdmins(
          "order",
          "New Order Created",
          `${createdOrders.length} order(s) created by ${req.user!.email}: ${orderNumbers}.`,
          {
            buyerId: req.user!.id,
            orderIds: createdOrders.map((o: any) => o.id),
            orderNumbers,
            deliveryMethod: normalizedDeliveryMethod,
            link: "/admin/orders",
          },
          {
            requiredAdminPermission: "manage_orders",
            includeAgents: true,
            requiredAgentFeature: "orders.view",
          }
        );
      } catch (opsNotifyErr) {
        console.error("[ORDERS] Could not send ops notification for created order:", opsNotifyErr);
      }
      
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

  app.get("/api/orders", requireAuth, requireRoleFeature("orders.view"), async (req: AuthRequest, res) => {
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

      // Enrich orders with buyer contact fields for list/detail UIs.
      const buyerIds = Array.from(new Set(orders.map((o) => o.buyerId).filter(Boolean)));
      const buyersById = new Map<string, any>();
      await Promise.all(
        buyerIds.map(async (buyerId) => {
          const buyer = await storage.getUser(buyerId);
          if (buyer) buyersById.set(buyerId, buyer);
        })
      );
      const storeIds = Array.from(new Set(orders.map((o) => o.storeId).filter(Boolean)));
      const storesById = new Map<string, any>();
      await Promise.all(
        storeIds.map(async (storeId) => {
          const store = await storage.getStore(storeId);
          if (store) storesById.set(storeId, store);
        })
      );
      const sellerIds = Array.from(new Set(orders.map((o) => o.sellerId).filter(Boolean)));
      const sellersById = new Map<string, any>();
      const sellerStoresBySellerId = new Map<string, any>();
      await Promise.all(
        sellerIds.map(async (sellerId) => {
          const [seller, sellerStore] = await Promise.all([
            storage.getUser(sellerId),
            storage.getStoreByPrimarySeller(sellerId),
          ]);
          if (seller) sellersById.set(sellerId, seller);
          if (sellerStore) sellerStoresBySellerId.set(sellerId, sellerStore);
        })
      );
      const riderIds = Array.from(new Set(orders.map((o) => o.riderId).filter(Boolean)));
      const ridersById = new Map<string, any>();
      await Promise.all(
        riderIds.map(async (riderId) => {
          const rider = await storage.getUser(riderId);
          if (rider) ridersById.set(riderId, rider);
        })
      );

      // Fetch order items with product names for each order
      const ordersWithItemsRaw = await Promise.all(
        orders.map(async (order) => {
          const items = await storage.getOrderItems(order.id);
          const orderHistory = await storage.getOrderStatusHistory(order.id);
          const verificationSummary = extractVerificationSummary(orderHistory);
          const buyer = buyersById.get(order.buyerId);
          const seller = sellersById.get(order.sellerId);
          const orderStore = order.storeId ? storesById.get(order.storeId) : null;
          const sellerStore = sellerStoresBySellerId.get(order.sellerId);
          const rider = order.riderId ? ridersById.get(order.riderId) : null;
          const securedOrder = sanitizeOrderVerificationSecrets(order, req.user!);
          const visible = resolveVisibleOrderStateForRole(securedOrder as any, req.user!.role);
          return {
            ...securedOrder,
            status: visible.status,
            _hiddenForViewer: visible.hidden,
            totalAmount: order.total,
            items,
            verificationSummary,
            seller: seller
              ? {
                  id: seller.id,
                  name: resolveUserDisplayName(seller),
                  storeName: orderStore?.name || sellerStore?.name || seller.storeName || null,
                }
              : undefined,
            rider: rider
              ? {
                  id: rider.id,
                  name: resolveUserDisplayName(rider),
                }
              : undefined,
            buyer: buyer
              ? {
                  id: buyer.id,
                  name: buyer.name,
                  email: buyer.email,
                  phone: buyer.phone,
                }
              : undefined,
          };
        })
      );
      const ordersWithItems = ordersWithItemsRaw
        .filter((o: any) => !o._hiddenForViewer)
        .map(({ _hiddenForViewer, ...rest }: any) => rest);
      
      res.json(ordersWithItems);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders/:id", requireAuth, requireRoleFeature("orders.view"), async (req: AuthRequest, res) => {
    try {
      let order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Payment state normalization for single-order reads as well.
      if (isPaidPaymentStatus(order.paymentStatus) && (order.status || "").toLowerCase().trim() === "pending") {
        order = { ...(order as any), status: "processing" } as any;
      }
      const finalOrder = {
        ...(order as NonNullable<typeof order>),
        status: mapOrderStatusForViewerRole(order as any, req.user!.role),
      };
      const securedOrder = sanitizeOrderVerificationSecrets(finalOrder, req.user!);
      const visible = resolveVisibleOrderStateForRole(securedOrder as any, req.user!.role);
      const orderHistory = await storage.getOrderStatusHistory(securedOrder.id);
      const verificationSummary = extractVerificationSummary(orderHistory);
      
      // Enforce stakeholder access for order detail reads.
      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      const isBuyer = req.user!.id === securedOrder.buyerId;
      const isSeller = req.user!.id === securedOrder.sellerId;
      const isRider = !!securedOrder.riderId && req.user!.id === securedOrder.riderId;
      const isStakeholder = isBuyer || isSeller || isRider;

      if (!isAdmin && !isStakeholder) {
        return res.status(403).json({ error: "Unauthorized to view this order" });
      }
      if (!isAdmin && visible.hidden) {
        return res.status(404).json({ error: "Order not found" });
      }

      let riderInfo: any = securedOrder.riderId
        ? {
            id: securedOrder.riderId,
            name: "Assigned Rider",
            phone: null,
            vehicleType: null,
            vehiclePlateNumber: null,
            rating: null,
          }
        : null;
      if (securedOrder.riderId) {
        const rider = await storage.getUser(securedOrder.riderId);
        if (rider) {
          riderInfo = {
            id: rider.id,
            name: resolveUserDisplayName(rider),
            phone: rider.phone || null,
            vehicleType: rider.vehicleInfo?.type || null,
            vehiclePlateNumber: rider.vehicleInfo?.plateNumber || null,
            rating: rider.ratings ?? null,
          };
        }
      }
      let sellerInfo: any = securedOrder.sellerId
        ? {
            id: securedOrder.sellerId,
            name: "Seller",
            storeName: null,
          }
        : null;
      if (securedOrder.sellerId) {
        const [seller, sellerStore] = await Promise.all([
          storage.getUser(securedOrder.sellerId),
          storage.getStoreByPrimarySeller(securedOrder.sellerId),
        ]);
        if (seller) {
          sellerInfo = {
            id: seller.id,
            name: resolveUserDisplayName(seller),
            storeName: sellerStore?.name || seller.storeName || null,
            email: seller.email || null,
            phone: seller.phone || null,
          };
        }
      }
      
      // Only include customer PII for admin/super_admin or the buyer themselves
      if (isAdmin || isBuyer) {
        // Fetch customer/buyer information to display in order details
        const buyer = await storage.getUser(finalOrder.buyerId);
        
        // Return order with complete customer info (authorized)
        res.json({
          ...securedOrder,
          riderInfo,
          sellerInfo,
          verificationSummary,
          customerInfo: buyer ? {
            name: buyer.name,
            email: buyer.email,
            phone: buyer.phone,
            address: finalOrder.deliveryAddress || buyer.businessAddress || null,
          } : null
        });
      } else {
        // Return order with rider metadata but without customer PII.
        res.json({
          ...securedOrder,
          riderInfo,
          sellerInfo,
          verificationSummary,
        });
      }
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders/:id/eta", requireAuth, requireRoleFeature("orders.view"), async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const role = req.user!.role;
      const canView =
        role === "admin" ||
        role === "super_admin" ||
        req.user!.id === order.buyerId ||
        req.user!.id === order.sellerId ||
        req.user!.id === order.riderId;
      if (!canView) {
        return res.status(403).json({ error: "Unauthorized to view ETA for this order" });
      }

      const destinationLat = toFiniteNumber(order.deliveryLatitude);
      const destinationLng = toFiniteNumber(order.deliveryLongitude);
      if (destinationLat === null || destinationLng === null) {
        return res.status(400).json({ error: "Delivery destination coordinates are not available" });
      }

      const queryRiderLat = toFiniteNumber(req.query.riderLat);
      const queryRiderLng = toFiniteNumber(req.query.riderLng);
      const querySpeed = toFiniteNumber(req.query.speed);

      let riderLat = queryRiderLat;
      let riderLng = queryRiderLng;
      let riderSpeed: number | null = querySpeed;
      if (riderLat === null || riderLng === null) {
        const latest = await storage.getLatestDeliveryLocation(order.id);
        riderLat = toFiniteNumber(latest?.latitude);
        riderLng = toFiniteNumber(latest?.longitude);
        riderSpeed = toFiniteNumber(latest?.speed);
      }

      if (riderLat === null || riderLng === null) {
        return res.status(404).json({ error: "Rider location is not available for ETA calculation" });
      }

      const eta = computeEtaMetrics({
        riderLat,
        riderLng,
        destinationLat,
        destinationLng,
        speedRaw: riderSpeed,
      });

      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        ...eta,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Dev-only payment completion hook for deterministic local QA without external webhooks.
  app.post(
    "/api/test/payments/complete",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermissionIfAdmin("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        if (process.env.NODE_ENV === "production") {
          console.warn("[SECURITY] Blocked test endpoint /api/test/payments/complete in production");
          return res.status(403).json({ error: "Test endpoints are disabled in production" });
        }

        const orderId = String(req.body?.orderId || "").trim();
        const checkoutSessionId = String(req.body?.checkoutSessionId || "").trim();
        if (!orderId && !checkoutSessionId) {
          return res.status(400).json({ error: "orderId or checkoutSessionId is required" });
        }

        const allOrders = await storage.getAllOrders();
        const targetOrders = orderId
          ? allOrders.filter((o: any) => o.id === orderId)
          : allOrders.filter((o: any) => o.checkoutSessionId === checkoutSessionId);

        if (targetOrders.length === 0) {
          return res.status(404).json({ error: "No matching orders found" });
        }

        const reference = `test-local-${Date.now()}`;
        const updatedOrders: any[] = [];
        for (const order of targetOrders) {
          const nextStatus =
            canonicalizeOrderStatus(order.status) === "created" ? "processing" : order.status;
          const updated = await storage.updateOrder(order.id, {
            paymentStatus: "completed",
            status: nextStatus,
            paymentReference: order.paymentReference || reference,
          } as any);

          await storage.createTransaction({
            orderId: order.id,
            userId: order.buyerId,
            amount: order.total,
            currency: order.currency || "GHS",
            paymentProvider: "test_hook",
            paymentReference: `${reference}-${order.id}`,
            status: "completed",
            metadata: {
              source: "api_test_payments_complete",
              actorId: req.user!.id,
              actorRole: req.user!.role,
            },
          });

          updatedOrders.push(updated);
        }

        await startRiderMatchingForPaidOrders(updatedOrders.map((o: any) => o.id));
        res.json({
          success: true,
          reference,
          orderCount: updatedOrders.length,
          orders: updatedOrders.map((o: any) => ({
            id: o.id,
            orderNumber: o.orderNumber,
            status: o.status,
            paymentStatus: o.paymentStatus,
          })),
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  app.get("/api/orders/:id/items", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Only allow buyer or admin to view order items
      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      const isBuyer = req.user!.id === order.buyerId;
      
      if (!isAdmin && !isBuyer) {
        return res.status(403).json({ error: "Unauthorized to view order items" });
      }
      
      const items = await storage.getOrderItems(req.params.id);
      res.json(items);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/orders/:id/status", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { status, reason } = req.body;
      const rawStatus = String(status || "").toLowerCase().trim();
      const normalizedStatus =
        rawStatus === "ready_for_pickup" ? "ready" :
        rawStatus === "assigned_to_rider" ? "assigned" :
        rawStatus === "out_for_delivery" || rawStatus === "delivering" ? "en_route" :
        rawStatus;
      const orderId = req.params.id;

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const actorRole = req.user!.role;
      const actorId = req.user!.id;
      const isAdminActor = actorRole === "admin" || actorRole === "super_admin";
      if (!isAdminActor) {
        const isStakeholder =
          (actorRole === "buyer" && order.buyerId === actorId) ||
          (actorRole === "seller" && order.sellerId === actorId) ||
          (actorRole === "rider" && order.riderId === actorId);
        if (!isStakeholder) {
          return res.status(403).json({ error: "Unauthorized to update this order status" });
        }
      }

      // Completion is verification-gated and must go through dedicated QR/OTP verification endpoints.
      if (normalizedStatus === "completed") {
        return res.status(409).json({
          error: "Order completion is verification-gated. Use QR/OTP verification endpoints to complete delivery or pickup.",
        });
      }

      // Rider delivery completion is verification-gated and must use the dedicated QR/OTP endpoint.
      if (normalizedStatus === "delivered" && actorRole === "rider") {
        return res.status(409).json({
          error: "Rider delivery completion requires verification. Use /api/orders/:id/complete-delivery with QR or OTP.",
        });
      }
      
      // CRITICAL: All validation, side effects, and audit trail happen INSIDE the transaction
      // in applyOrderStatusTransition() to prevent TOCTOU race conditions
      const updatedOrder = await storage.applyOrderStatusTransition(
        orderId,
        normalizedStatus,
        actorId,
        actorRole,
        reason
      );
      
      if (!updatedOrder) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      const canonicalStatus = canonicalizeOrderStatus(updatedOrder.status);
      const recipients = [
        { userId: updatedOrder.buyerId, label: "buyer" },
        { userId: updatedOrder.sellerId, label: "seller" },
        { userId: updatedOrder.riderId, label: "rider" },
      ].filter((r) => Boolean(r.userId));
      for (const recipient of recipients) {
        const recipientStatus = mapOrderStatusForViewerRole(
          {
            status: canonicalStatus,
            paymentStatus: updatedOrder.paymentStatus,
            deliveryMethod: updatedOrder.deliveryMethod,
          },
          recipient.label
        );
        await storage.createNotification({
          userId: recipient.userId!,
          type: "order",
          title: "Order Status Updated",
          message: `Order #${updatedOrder.orderNumber} is now ${recipientStatus}`,
          metadata: {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.orderNumber,
            status: recipientStatus,
            audience: recipient.label,
          } as any
        });
      }
      await emitOrderStatusUpdateToStakeholders(updatedOrder, canonicalStatus);

      if (
        updatedOrder.deliveryMethod === "rider" &&
        !updatedOrder.riderId &&
        updatedOrder.paymentStatus === "completed" &&
        ["processing", "ready", "confirmed", "searching_rider"].includes(canonicalStatus)
      ) {
        try {
          await startRiderMatching(updatedOrder.id, req.user!.id, req.user!.role as "seller" | "admin" | "super_admin");
        } catch (matchError: any) {
          console.warn(`[RIDER_MATCH] Could not start after status update for order ${updatedOrder.id}:`, matchError?.message || matchError);
        }
      }
      
      res.json({
        ...updatedOrder,
        status: mapOrderStatusForViewerRole(updatedOrder as any, req.user!.role),
      });
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

  assignRiderToOrder = async (params: {
    orderId: string;
    riderId: string;
    actorId: string;
    actorRole: string;
    allowSellerOwnershipCheck?: boolean;
  }) => {
    const { orderId, riderId, actorId, actorRole, allowSellerOwnershipCheck = false } = params;

    if (!riderId) {
      const error = new Error("Rider ID is required");
      (error as any).code = 400;
      throw error;
    }

    if (isManualAssignmentConfirmationRequired && actorRole === "seller") {
      const error = new Error("Manual assignment confirmation is restricted to admin and super admin");
      (error as any).code = 403;
      throw error;
    }

    const order = await storage.getOrder(orderId);
    if (!order) {
      const error = new Error("Order not found");
      (error as any).code = 404;
      throw error;
    }

    const canonicalOrderStatus = canonicalizeOrderStatus(order.status);
    const dispatchEligibleStatuses = new Set<ReturnType<typeof canonicalizeOrderStatus>>([
      "ready",
      "searching_rider",
    ]);
    if (!dispatchEligibleStatuses.has(canonicalOrderStatus)) {
      const error = new Error(
        "Order is not ready for rider assignment. Seller must mark it Ready for Dispatch first."
      );
      (error as any).code = 409;
      (error as any).details = {
        currentStatus: canonicalOrderStatus,
        requiredStatuses: Array.from(dispatchEligibleStatuses),
      };
      throw error;
    }

    if (order.riderId) {
      const error = new Error("Order already has a rider assigned");
      (error as any).code = 400;
      throw error;
    }

    if (allowSellerOwnershipCheck && actorRole === "seller" && order.sellerId !== actorId) {
      const error = new Error("You can only assign riders to your own orders");
      (error as any).code = 403;
      throw error;
    }

    const rider = await storage.getUser(riderId);
    if (!rider || rider.role !== "rider") {
      const error = new Error("Rider not found");
      (error as any).code = 404;
      throw error;
    }
    if (!rider.isApproved || !rider.isActive || (rider as any).riderOnline === false) {
      const error = new Error("Rider is not available for deliveries");
      (error as any).code = 400;
      throw error;
    }

    // Always assign rider first.
    const assigned = await storage.assignRider(orderId, riderId);
    if (!assigned) {
      const refreshed = await storage.getOrder(orderId);
      const error = new Error(refreshed?.riderId ? "Order already has a rider assigned" : "Order not found");
      (error as any).code = refreshed?.riderId ? 409 : 404;
      throw error;
    }

    // Promote order into assigned state when currently in dispatch-ready statuses.
    const current = (assigned.status || "").toLowerCase().trim();
    const canPromoteToAssigned = ["processing", "ready", "confirmed", "searching_rider"].includes(current);
    let updatedOrder = assigned;
    if (canPromoteToAssigned) {
      try {
        const transitioned = await storage.applyOrderStatusTransition(
          orderId,
          "assigned",
          actorId,
          actorRole
        );
        if (transitioned) updatedOrder = transitioned as any;
      } catch (transitionErr) {
        // Assignment should not fail hard if the status transition is not currently allowed.
        console.warn("[ORDER] Rider assigned but status transition to assigned failed:", (transitionErr as any)?.message || transitionErr);
      }
    }

    await storage.createNotification({
      userId: riderId,
      type: "order",
      title: "New Delivery Assigned",
      message: `You have been assigned to deliver order #${order.orderNumber}. Please pick up the order from the seller.`,
      metadata: { link: `/rider/deliveries?orderId=${orderId}` } as any,
    });

    await storage.createNotification({
      userId: order.buyerId,
      type: "order",
      title: "Rider Assigned",
      message: `A rider has been assigned to deliver your order #${order.orderNumber}. You can track the delivery in real-time.`,
      metadata: { link: `/track?orderId=${orderId}` } as any,
    });

    io.emit("order_rider_assigned", {
      orderId,
      riderId,
      riderName: rider.name,
      orderNumber: order.orderNumber,
    });
    await emitOrderStatusUpdateToStakeholders(updatedOrder, updatedOrder.status);

    clearPendingRiderAssignment(orderId);
    return updatedOrder;
  };

  app.patch("/api/orders/:id/assign-rider", requireAuth, requireRole("admin", "super_admin", "seller"), requirePermissionIfAdmin("manage_orders"), async (req: AuthRequest, res) => {
    try {
      const updatedOrder = await assignRiderToOrder({
        orderId: req.params.id,
        riderId: String(req.body?.riderId || ""),
        actorId: req.user!.id,
        actorRole: req.user!.role,
        allowSellerOwnershipCheck: true,
      });
      res.json(updatedOrder);
    } catch (error: any) {
      res.status((error as any)?.code || 400).json({ error: error.message });
    }
  });

  app.post(
    "/api/orders/:id/confirm-rider-assignment",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        const orderId = req.params.id;
        const pending = pendingRiderAssignments.get(orderId);
        const requestedRiderId = String(req.body?.riderId || "").trim();
        const riderId = requestedRiderId || pending?.acceptedRiderId || "";
        if (!riderId) {
          return res.status(400).json({ error: "No rider available for confirmation" });
        }

        const updatedOrder = await assignRiderToOrder({
          orderId,
          riderId,
          actorId: req.user!.id,
          actorRole: req.user!.role,
        });

        return res.json({
          success: true,
          manualConfirmationRequired: isManualAssignmentConfirmationRequired,
          order: updatedOrder,
        });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message });
      }
    }
  );

  app.post("/api/orders/:id/start-rider-matching", requireAuth, requireRole("admin", "super_admin", "seller"), requirePermissionIfAdmin("manage_orders"), async (req: AuthRequest, res) => {
    try {
      const updated = await startRiderMatching(
        req.params.id,
        req.user!.id,
        req.user!.role as "seller" | "admin" | "super_admin"
      );
      res.json({
        ...updated,
        status: mapOrderStatusForViewerRole((updated as any) || {}, req.user!.role),
      });
    } catch (error: any) {
      res.status((error as any)?.code || 400).json({ error: error.message });
    }
  });

  app.post("/api/rider/assignment-offers/:orderId/respond", requireAuth, requireRole("rider"), requireRoleFeature("deliveries.manage"), async (req: AuthRequest, res) => {
    try {
      const action = String(req.body?.action || "").toLowerCase();
      if (action !== "accept" && action !== "reject") {
        return res.status(400).json({ error: "Invalid action. Use accept or reject." });
      }

      const updated = await resolveRiderOfferResponse(req.params.orderId, req.user!.id, action as "accept" | "reject");
      res.json(updated);
    } catch (error: any) {
      res.status((error as any)?.code || 400).json({ error: error.message });
    }
  });

  // Complete delivery with dual verification (rider scans buyer QR and enters OTP)
  app.post("/api/orders/:id/complete-delivery", requireAuth, requireRole("rider"), requireRoleFeature("deliveries.manage"), async (req: AuthRequest, res) => {
    try {
      const qrCode = String(req.body?.qrCode || "").trim();
      const otp = req.body?.otp;
      const orderId = req.params.id;
      const riderId = req.user!.id;
      const normalizedOtp = normalizeOtp(otp);

      if (!qrCode && !normalizedOtp) {
        console.warn(`[DELIVERY_VERIFY_DENIED] order=${orderId} rider=${riderId} reason=missing_qr_and_otp`);
        return res.status(400).json({ error: "Provide at least one verification method: QR code or OTP" });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      // Verify the rider is assigned to this order
      if (order.riderId !== riderId) {
        console.warn(`[DELIVERY_VERIFY_DENIED] order=${orderId} rider=${riderId} reason=not_assigned`);
        return res.status(403).json({ error: "You are not assigned to this delivery" });
      }

      // Verify QR code matches
      const isQrValid = qrCode ? order.qrCode === qrCode : false;
      const isOtpValid = normalizedOtp ? normalizeOtp((order as any).deliveryOtp) === normalizedOtp : false;
      if (qrCode && !isQrValid) {
        console.warn(`[DELIVERY_VERIFY_DENIED] order=${orderId} rider=${riderId} reason=invalid_qr`);
      }
      if (normalizedOtp && !isOtpValid) {
        console.warn(`[DELIVERY_VERIFY_DENIED] order=${orderId} rider=${riderId} reason=invalid_otp`);
      }
      if (!isQrValid && !isOtpValid) {
        return res.status(400).json({
          error: "Invalid verification",
          details: "Provided QR/OTP does not match this delivery order.",
        });
      }
      const verificationMethod = resolveVerificationMethod(Boolean(isQrValid), Boolean(isOtpValid));
      const updatedOrder = await finalizeRiderDelivery(
        orderId,
        riderId,
        `verification:rider_to_buyer:${verificationMethod}`
      );
      console.log(`Order ${orderId} delivered by rider ${riderId} via unified completion flow`);
      res.json({
        ...updatedOrder,
        status: mapOrderStatusForViewerRole(updatedOrder as any, req.user!.role),
      });
    } catch (error: any) {
      console.error("Error completing delivery:", error);
      res.status((error as any)?.code || 400).json({ error: error.message });
    }
  });

  // Seller verifies assigned rider pickup using QR + OTP before handoff.
  app.post(
    "/api/orders/:id/verify-rider-pickup",
    requireAuth,
    requireRole("seller", "admin", "super_admin"),
    requirePermissionIfAdmin("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        const orderId = req.params.id;
        const riderId = String(req.body?.riderId || "").trim();
        const qrCode = String(req.body?.qrCode || "").trim();
        const otp = normalizeOtp(req.body?.otp);
        const actorRole = req.user!.role;
        const actorId = req.user!.id;

        if (!riderId || (!qrCode && !otp)) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=missing_payload`);
          return res.status(400).json({ error: "riderId and one verification method (qrCode or otp) are required" });
        }

        const order = await storage.getOrder(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });

        if (actorRole === "seller" && order.sellerId !== actorId) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=not_owner`);
          return res.status(403).json({ error: "Unauthorized to verify this order pickup" });
        }
        if (order.deliveryMethod !== "rider") {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=wrong_delivery_method method=${order.deliveryMethod}`);
          return res.status(409).json({ error: "Rider pickup verification is only valid for rider deliveries" });
        }
        if (order.riderId !== riderId) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=rider_mismatch`);
          return res.status(409).json({ error: "Rider does not match the assigned delivery rider" });
        }
        const isQrValid = qrCode ? (order as any).qrCode === qrCode : false;
        const isOtpValid = otp ? normalizeOtp((order as any).pickupOtp) === otp : false;
        if (qrCode && !isQrValid) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=invalid_qr`);
        }
        if (otp && !isOtpValid) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=invalid_otp`);
        }
        if (!isQrValid && !isOtpValid) {
          return res.status(400).json({ error: "Invalid verification (QR/OTP mismatch)" });
        }
        const verificationMethod = resolveVerificationMethod(Boolean(isQrValid), Boolean(isOtpValid));

        const current = canonicalizeOrderStatus(order.status);
        if (current === "assigned") {
          await storage.applyOrderStatusTransition(orderId, "rider_arrived", actorId, actorRole, "seller_verified_rider_at_pickup");
        }
        const updated = await storage.applyOrderStatusTransition(
          orderId,
          "picked_up",
          actorId,
          actorRole,
          `verification:seller_to_rider:${verificationMethod}`
        );
        if (!updated) return res.status(404).json({ error: "Order not found" });
        await emitOrderStatusUpdateToStakeholders(updated, "picked_up");
        return res.json({ success: true, order: updated });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message });
      }
    }
  );

  // Seller verifies customer pickup (store pickup flow) using QR + OTP.
  app.post(
    "/api/orders/:id/verify-customer-pickup",
    requireAuth,
    requireRole("seller", "admin", "super_admin"),
    requirePermissionIfAdmin("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        const orderId = req.params.id;
        const qrCode = String(req.body?.qrCode || "").trim();
        const otp = normalizeOtp(req.body?.otp);
        const actorRole = req.user!.role;
        const actorId = req.user!.id;

        if (!qrCode && !otp) {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=missing_payload`);
          return res.status(400).json({ error: "Provide at least one verification method: qrCode or otp" });
        }

        const order = await storage.getOrder(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });

        if (actorRole === "seller" && order.sellerId !== actorId) {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=not_owner`);
          return res.status(403).json({ error: "Unauthorized to verify this pickup" });
        }
        if (order.deliveryMethod !== "pickup") {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=wrong_delivery_method method=${order.deliveryMethod}`);
          return res.status(409).json({ error: "Customer pickup verification is only valid for pickup orders" });
        }
        const isQrValid = qrCode ? (order as any).qrCode === qrCode : false;
        const isOtpValid = otp ? normalizeOtp((order as any).pickupOtp) === otp : false;
        if (qrCode && !isQrValid) {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=invalid_qr`);
        }
        if (otp && !isOtpValid) {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=invalid_otp`);
        }
        if (!isQrValid && !isOtpValid) {
          return res.status(400).json({ error: "Invalid verification (QR/OTP mismatch)" });
        }
        const verificationMethod = resolveVerificationMethod(Boolean(isQrValid), Boolean(isOtpValid));

        const updated = await storage.applyOrderStatusTransition(
          orderId,
          "completed",
          actorId,
          actorRole,
          `verification:seller_to_buyer:${verificationMethod}`
        );
        if (!updated) return res.status(404).json({ error: "Order not found" });
        await emitOrderStatusUpdateToStakeholders(updated, "completed");
        return res.json({ success: true, order: updated });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message });
      }
    }
  );

  app.get("/api/orders/policy", requireAuth, async (_req: AuthRequest, res) => {
    res.json({
      assignment: {
        manualConfirmationRequired: isManualAssignmentConfirmationRequired,
        mode: isManualAssignmentConfirmationRequired ? "admin_confirm" : "rider_accept_auto_assign",
      },
      tracking: {
        gpsBroadcastSourceOfTruth: "backend",
        expectedUpdateIntervalSeconds: "3-5",
      },
    });
  });

  app.get("/api/riders/available", requireAuth, requireRole("admin", "seller", "super_admin"), requirePermissionIfAdmin("manage_orders"), async (req, res) => {
    try {
      const availableRiders = await storage.getAvailableRidersWithOrderCounts();
      res.json(availableRiders);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/rider/earnings", requireAuth, requireRole("rider"), requireRoleFeature("deliveries.view"), async (req: AuthRequest, res) => {
    try {
      const riderId = req.user!.id;
      const payouts = await storage.getRiderPayouts(riderId);
      const payableStatuses = new Set(["pending_approval", "approved", "processing", "completed"]);
      const settledPayouts = payouts.filter((p: any) => payableStatuses.has(String(p.status || "").toLowerCase().trim()));

      const total = settledPayouts.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const now = new Date();
      const thisMonthPayouts = settledPayouts.filter((p: any) => {
        const dt = p.createdAt ? new Date(p.createdAt) : null;
        return !!dt && dt.getMonth() === now.getMonth() && dt.getFullYear() === now.getFullYear();
      });
      const thisMonth = thisMonthPayouts.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
      const todayPayouts = settledPayouts.filter((p: any) => {
        const dt = p.createdAt ? new Date(p.createdAt) : null;
        return !!dt && dt.toDateString() === now.toDateString();
      });
      const today = todayPayouts.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);

      const history = settledPayouts.slice(0, 100).map((p: any) => ({
        deliveryId: p.orderId || p.id,
        orderId: p.orderId || null,
        date: p.createdAt || null,
        amount: p.amount,
        currency: p.currency || "GHS",
        status: p.status,
      }));

      res.json({
        total: total.toFixed(2),
        thisMonth: thisMonth.toFixed(2),
        today: today.toFixed(2),
        deliveriesCompleted: settledPayouts.filter((p: any) => String(p.status || "").toLowerCase().trim() === "completed").length,
        history,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/rider/settings", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const rider = await storage.getUser(req.user!.id);
      if (!rider) return res.status(404).json({ error: "Rider not found" });
      const prefs = (rider as any).riderPreferences || {};
      res.json({
        riderOnline: (rider as any).riderOnline !== false,
        deliveryNotifications: prefs.deliveryNotifications !== false,
        emailNotifications: prefs.emailNotifications !== false,
        locationSharing: prefs.locationSharing !== false,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/rider/settings", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const rider = await storage.getUser(req.user!.id);
      if (!rider) return res.status(404).json({ error: "Rider not found" });
      const currentPrefs = (rider as any).riderPreferences || {};
      const nextPrefs = {
        deliveryNotifications: req.body?.deliveryNotifications !== undefined ? Boolean(req.body.deliveryNotifications) : currentPrefs.deliveryNotifications !== false,
        emailNotifications: req.body?.emailNotifications !== undefined ? Boolean(req.body.emailNotifications) : currentPrefs.emailNotifications !== false,
        locationSharing: req.body?.locationSharing !== undefined ? Boolean(req.body.locationSharing) : currentPrefs.locationSharing !== false,
      };
      const updated = await storage.updateUser(req.user!.id, {
        riderPreferences: nextPrefs as any,
      } as any);
      res.json({
        riderOnline: (updated as any)?.riderOnline !== false,
        ...nextPrefs,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/rider/availability", requireAuth, requireRole("rider"), async (req: AuthRequest, res) => {
    try {
      const online = Boolean(req.body?.online);
      if (!online) {
        const riderOrders = await storage.getOrdersByUser(req.user!.id, "rider");
        const hasActiveDelivery = riderOrders.some((o: any) =>
          ["assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes(canonicalizeOrderStatus(o.status))
        );
        if (hasActiveDelivery) {
          return res.status(409).json({ error: "Cannot go offline while an active delivery is in progress" });
        }
      }
      const updated = await storage.updateUser(req.user!.id, { riderOnline: online } as any);
      io.to(req.user!.id).emit("rider_availability_updated", { online });
      res.json({ online: (updated as any)?.riderOnline !== false });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get rider's active delivery (for rider navigation page)
  app.get("/api/rider/active-delivery", requireAuth, requireRole("rider"), requireRoleFeature("deliveries.view"), async (req: AuthRequest, res) => {
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
            sql`lower(cast(${orders.status} as text)) in ('processing','ready','confirmed','searching_rider','assigned','rider_arrived','picked_up','in_transit','en_route','delivering')`
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
        status: canonicalizeOrderStatus(order.status),
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
  app.post("/api/delivery-tracking", requireAuth, requireRole("rider"), requireRoleFeature("tracking.update"), async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.body.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (order.riderId !== req.user!.id) {
        return res.status(403).json({ error: "You are not assigned to this order" });
      }

      const currentLat = toFiniteNumber(req.body.latitude);
      const currentLng = toFiniteNumber(req.body.longitude);
      if (currentLat === null || currentLng === null || currentLat < -90 || currentLat > 90 || currentLng < -180 || currentLng > 180) {
        return res.status(400).json({ error: "Invalid latitude/longitude payload" });
      }

      const latest = await storage.getLatestDeliveryLocation(order.id);
      let effectiveLat = currentLat;
      let effectiveLng = currentLng;
      let smoothingApplied = false;
      let ignoredGpsSpike = false;

      if (latest) {
        const prevLat = toFiniteNumber(latest.latitude);
        const prevLng = toFiniteNumber(latest.longitude);
        if (prevLat !== null && prevLng !== null) {
          const distanceKm = haversineDistanceKm(prevLat, prevLng, currentLat, currentLng);
          const prevTs = latest.timestamp ? new Date(latest.timestamp).getTime() : Date.now();
          const elapsedHours = Math.max((Date.now() - prevTs) / 3_600_000, 1 / 3600);
          const impliedSpeed = distanceKm / elapsedHours;

          if (impliedSpeed > 160) {
            // Ignore impossible GPS spike and keep the latest valid point.
            effectiveLat = prevLat;
            effectiveLng = prevLng;
            ignoredGpsSpike = true;
          } else if (distanceKm < 0.03) {
            // Apply light smoothing for short jitter jumps.
            effectiveLat = Number((prevLat * 0.65 + currentLat * 0.35).toFixed(7));
            effectiveLng = Number((prevLng * 0.65 + currentLng * 0.35).toFixed(7));
            smoothingApplied = true;
          }
        }
      }

      const trackingData = {
        orderId: req.body.orderId,
        riderId: req.user!.id,
        latitude: effectiveLat.toString(),
        longitude: effectiveLng.toString(),
        accuracy: req.body.accuracy,
        speed: req.body.speed,
        heading: req.body.heading,
      };

      const tracking = await storage.createDeliveryTracking(trackingData as any);
      
      // Emit real-time location update to all stakeholders
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
          smoothingApplied,
          ignoredGpsSpike,
        };
        
        // Send to buyer/seller/rider
        io.to(order.buyerId).emit("rider_location_updated", locationUpdate);
        if (order.sellerId) io.to(order.sellerId).emit("rider_location_updated", locationUpdate);
        if (order.riderId) io.to(order.riderId).emit("rider_location_updated", locationUpdate);
        
        // Send to all admins for real-time tracking
        const admins = await storage.getUsersByRole("admin");
        const superAdmins = await storage.getUsersByRole("super_admin");
        [...admins, ...superAdmins].forEach(adminUser => {
          io.to(adminUser.id).emit("admin_rider_location_updated", locationUpdate);
        });

        // Deviation signal: moving significantly farther from destination.
        const destination = getOrderLocationForMatching(order);
        const prevLat = latest ? toFiniteNumber(latest.latitude) : null;
        const prevLng = latest ? toFiniteNumber(latest.longitude) : null;
        if (destination && prevLat !== null && prevLng !== null) {
          const previousDistance = haversineDistanceKm(prevLat, prevLng, destination.lat, destination.lng);
          const currentDistance = haversineDistanceKm(effectiveLat, effectiveLng, destination.lat, destination.lng);
          if (currentDistance - previousDistance > 2) {
            const alert = {
              orderId: order.id,
              orderNumber: order.orderNumber,
              riderId: req.user!.id,
              riderName: rider?.name || "Rider",
              message: "Rider trajectory deviated from expected route",
              previousDistanceKm: previousDistance,
              currentDistanceKm: currentDistance,
              timestamp: new Date().toISOString(),
            };
            [...admins, ...superAdmins].forEach((adminUser) => {
              io.to(adminUser.id).emit("geofence_alert", alert);
            });
          }
        }
      }
      
      res.json(tracking);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/delivery-tracking/:orderId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const role = req.user!.role;
      const isAllowed =
        role === "admin" ||
        role === "super_admin" ||
        req.user!.id === order.buyerId ||
        req.user!.id === order.sellerId ||
        req.user!.id === order.riderId;
      if (!isAllowed) {
        return res.status(403).json({ error: "Unauthorized to view tracking data" });
      }

      const tracking = await storage.getLatestDeliveryLocation(req.params.orderId);
      if (!tracking) {
        return res.status(404).json({ error: "No tracking data found" });
      }
      const timestampMs = tracking.timestamp ? new Date(tracking.timestamp).getTime() : Date.now();
      const ageMs = Math.max(0, Date.now() - timestampMs);
      const staleAfterMs = 2 * 60 * 1000;
      res.json({
        ...tracking,
        lastKnown: true,
        isStale: ageMs > staleAfterMs,
        ageSeconds: Math.floor(ageMs / 1000),
        staleAfterSeconds: staleAfterMs / 1000,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/delivery-tracking/:orderId/history", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      const role = req.user!.role;
      const isAllowed =
        role === "admin" ||
        role === "super_admin" ||
        req.user!.id === order.buyerId ||
        req.user!.id === order.sellerId ||
        req.user!.id === order.riderId;
      if (!isAllowed) {
        return res.status(403).json({ error: "Unauthorized to view tracking data" });
      }

      const history = await storage.getDeliveryTrackingHistory(req.params.orderId);
      res.json(history);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders/:id/status-history", requireAuth, requireRoleFeature("orders.view"), async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }

      const role = req.user!.role;
      const canView =
        role === "admin" ||
        role === "super_admin" ||
        req.user!.id === order.buyerId ||
        req.user!.id === order.sellerId ||
        req.user!.id === order.riderId;

      if (!canView) {
        return res.status(403).json({ error: "Unauthorized to view order status history" });
      }

      const history = await storage.getOrderStatusHistory(order.id);
      const chronological = [...history]
        .sort((a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime())
        .map((entry) => ({
          ...entry,
          fromStatus: entry.fromStatus
            ? mapOrderStatusForViewerRole(
                {
                  status: entry.fromStatus,
                  paymentStatus: order.paymentStatus,
                  deliveryMethod: order.deliveryMethod,
                },
                req.user!.role
              )
            : null,
          toStatus: mapOrderStatusForViewerRole(
            {
              status: entry.toStatus,
              paymentStatus: order.paymentStatus,
              deliveryMethod: order.deliveryMethod,
            },
            req.user!.role
          ),
        }));

      res.json(chronological);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get all active riders with their current locations (for admin tracking)
  app.get("/api/admin/active-riders", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req, res) => {
    try {
      // Get all orders and filter for active delivery statuses with assigned riders
      const allOrders = await storage.getAllOrders();
      const activeOrders = allOrders.filter(order => 
        ["processing", "ready", "confirmed", "searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes((order.status || "").toLowerCase().trim()) && order.riderId
      );
      
      const riderLocations = await Promise.all(
        activeOrders.map(async (order: any) => {
          if (!order.riderId) return null;
          
          const rider = await storage.getUser(order.riderId);
          if (!rider) return null;
          
          const latestLocation = await storage.getLatestDeliveryLocation(order.id);
          const destinationLat = toFiniteNumber(order.deliveryLatitude);
          const destinationLng = toFiniteNumber(order.deliveryLongitude);
          const riderLat = toFiniteNumber(latestLocation?.latitude);
          const riderLng = toFiniteNumber(latestLocation?.longitude);
          const etaPayload =
            destinationLat !== null &&
            destinationLng !== null &&
            riderLat !== null &&
            riderLng !== null
              ? computeEtaMetrics({
                  riderLat,
                  riderLng,
                  destinationLat,
                  destinationLng,
                  speedRaw: latestLocation?.speed,
                })
              : null;
          
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
            eta: etaPayload?.etaMinutes ?? null,
            distance: etaPayload?.distanceKm ?? null,
          };
        })
      );
      
      res.json(riderLocations.filter(Boolean));
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get pending orders that need rider assignment (for Command Center dispatch)
  app.get("/api/admin/pending-orders", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      
      // Filter for orders that need rider assignment:
      // - delivery method is rider
      // - seller has marked dispatch-ready (or system has started rider matching)
      // - no rider assigned yet
      const pendingOrders = allOrders
        .filter(order => 
          order.deliveryMethod === "rider" &&
          ["ready", "searching_rider"].includes(canonicalizeOrderStatus(order.status)) &&
          !order.riderId
        )
        .map(order => ({
          id: order.id,
          orderNumber: order.orderNumber,
          buyerName: "Buyer", // Will be populated below
          buyerEmail: null as string | null,
          buyerPhone: null as string | null,
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
            return {
              ...order,
              buyerName: buyer?.name || "Unknown",
              buyerEmail: buyer?.email || null,
              buyerPhone: order.deliveryPhone || buyer?.phone || null,
            };
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
  app.get("/api/admin/available-riders", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req, res) => {
    try {
      const { orderLat, orderLng, orderZoneId } = req.query;
      
      // Get all approved and active riders
      const allRiders = await storage.getUsersByRole("rider");
      const activeRiders = allRiders.filter(r => r.isApproved && r.isActive && r.riderOnline !== false);
      const zones = await storage.getDeliveryZones();
      
      // Get orders currently being delivered
      const allOrders = await storage.getAllOrders();
      const ridersOnDelivery = new Set(
        allOrders
          .filter(o => ["assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes((o.status || "").toLowerCase().trim()) && o.riderId)
          .map(o => o.riderId)
      );
      
      // Filter out riders currently on delivery
      const orderLatNum = toFiniteNumber(orderLat);
      const orderLngNum = toFiniteNumber(orderLng);
      const availableRiders = await Promise.all(
        activeRiders
          .filter(r => !ridersOnDelivery.has(r.id))
          .map(async (rider) => {
            let distanceToOrder: number | undefined;
            if (orderLatNum !== null && orderLngNum !== null) {
              const latest = await storage.getLatestRiderLocation(rider.id);
              const riderLat = toFiniteNumber(latest?.latitude);
              const riderLng = toFiniteNumber(latest?.longitude);
              if (riderLat !== null && riderLng !== null) {
                distanceToOrder = haversineDistanceKm(riderLat, riderLng, orderLatNum, orderLngNum);
              }
            }
            
            return {
              id: rider.id,
              name: rider.name,
              email: rider.email,
              phone: rider.phone,
              isAvailable: true,
              zoneId: resolveZoneByRiderProfile(rider, zones),
              zoneMatched:
                ENABLE_SOFT_ZONE_MATCH &&
                !!orderZoneId &&
                String(resolveZoneByRiderProfile(rider, zones) || "") === String(orderZoneId),
              distanceToOrder,
            };
          })
      );

      availableRiders.sort((a, b) => {
        if ((a as any).zoneMatched !== (b as any).zoneMatched) {
          return (a as any).zoneMatched ? -1 : 1;
        }
        const distanceA = typeof a.distanceToOrder === "number" ? a.distanceToOrder : Number.MAX_SAFE_INTEGER;
        const distanceB = typeof b.distanceToOrder === "number" ? b.distanceToOrder : Number.MAX_SAFE_INTEGER;
        if (distanceA !== distanceB) return distanceA - distanceB;
        return a.name.localeCompare(b.name);
      });

      res.json(availableRiders);
    } catch (error: any) {
      console.error("Error fetching available riders:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Assign rider to order
  app.post("/api/orders/:orderId/assign-rider", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req: AuthRequest, res) => {
    try {
      const updatedOrder = await assignRiderToOrder({
        orderId: req.params.orderId,
        riderId: String(req.body?.riderId || ""),
        actorId: req.user!.id,
        actorRole: req.user!.role,
      });
      res.json(updatedOrder);
    } catch (error: any) {
      console.error("Error assigning rider to order:", error);
      res.status((error as any)?.code || 400).json({ error: error.message });
    }
  });

  // Auto-dispatch: Assign unassigned orders older than configured threshold (default 60 minutes)
  // This should be called by a cron job or scheduled task
  app.post("/api/admin/auto-dispatch", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req: AuthRequest, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      const now = new Date();
      const autoDispatchThresholdMs = Math.max(1, AUTO_DISPATCH_MINUTES) * 60 * 1000;

      // Find orders that need auto-dispatch
      const overdueOrders = allOrders.filter(order => {
        if (order.deliveryMethod !== "rider") return false;
        if (order.riderId) return false; // Already assigned
        if (!["processing", "ready", "confirmed", "searching_rider"].includes((order.status || "").toLowerCase().trim())) return false;
        
        const orderAge = now.getTime() - new Date(order.createdAt!).getTime();
        return orderAge >= autoDispatchThresholdMs;
      });

      if (overdueOrders.length === 0) {
        return res.json({ message: "No orders require auto-dispatch", assigned: 0 });
      }

      let startedMatching = 0;
      for (const order of overdueOrders) {
        try {
          await startRiderMatching(order.id, req.user!.id, req.user!.role as "admin" | "super_admin");
          startedMatching++;
        } catch (error: any) {
          console.warn(`[AUTO_DISPATCH] Rider matching skipped for order ${order.id}:`, error?.message || error);
        }
      }

      res.json({
        message: "Auto-dispatch completed",
        matchingStarted: startedMatching,
        pending: Math.max(overdueOrders.length - startedMatching, 0),
      });
    } catch (error: any) {
      console.error("Error in auto-dispatch:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Rider & Seller Analytics Routes ============
  app.get("/api/riders/:riderId/deliveries", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { riderId } = req.params;
      
      const deliveries = await storage.getOrdersByUser(riderId, "rider");
      
      res.json(deliveries);
    } catch (error: any) {
      console.error("Error fetching rider deliveries:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/riders/:riderId/earnings", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { riderId } = req.params;
      
      const deliveries = await db.query.orders.findMany({
        where: and(
          eq(orders.riderId, riderId),
          eq(orders.status, "completed")
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

  app.get("/api/sellers/:sellerId/sales", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      const normalizePaymentStatus = (value?: string | null) => (value || "").toLowerCase().trim();
      const isPaidPaymentStatus = (value?: string | null) =>
        ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
      
      const sales = await storage.getOrdersByUser(sellerId, "seller");
      
      const totalSales = sales.length;
      const completedPaidOrders = sales.filter((order) => {
        const normalizedStatus = (order.status || "").toLowerCase().trim();
        return normalizedStatus === "completed" && isPaidPaymentStatus(order.paymentStatus);
      });
      const totalRevenue = completedPaidOrders.reduce((sum, order) => {
        return sum + parseFloat(order.total || "0");
      }, 0);
      
      const paidOrders = sales.filter(order => isPaidPaymentStatus(order.paymentStatus));
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
      
      const revenueThisMonth = completedPaidOrders
        .filter(order => {
          const completionDate = order.updatedAt ? new Date(order.updatedAt) : order.deliveredAt ? new Date(order.deliveredAt) : null;
          if (!completionDate) return false;
          const now = new Date();
          return completionDate.getMonth() === now.getMonth() && 
                 completionDate.getFullYear() === now.getFullYear();
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

  app.post("/api/messages", requireAuth, requireRoleFeature("messages.send"), async (req: AuthRequest, res) => {
    try {
      // Ensure IDs are strings for consistent socket room matching
      const senderId = String(req.user!.id);
      const receiverId = String(req.body.receiverId);

      const permission = await chatPermissionService.canInitiateChat(senderId, receiverId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
      
      const messageData = {
        senderId,
        receiverId,
        message: req.body.message,
        messageType: req.body.messageType || "text",
        status: "sent" as const,
        isRead: false,
      };

      const message = await storage.createMessage(messageData);
      
      console.log(`📤 Message sent from ${senderId} to ${receiverId}`);
      
      // Sender gets immediate local echo; receiver delivery uses retry-aware queue.
      io.to(senderId).emit("new_message", message);
      await messageDeliveryService.queueMessage({
        id: message.id,
        senderId,
        receiverId,
        message: message.message,
        messageType: (message.messageType as any) || "text",
        mediaUrl: (message as any).mediaUrl || undefined,
        emitSenderAck: false,
      });
      
      const receiver = await storage.getUser(receiverId);
      const sender = await storage.getUser(senderId);
      
      // Create notification for the receiver only (never notify sender for own outgoing message)
      if (receiver && receiver.id !== senderId) {
        const rawMessage = (message.message || "").trim();
        const messagePreview = decodeAttachmentNotificationPreview(rawMessage) || rawMessage;
        const notificationBody = messagePreview || `You have a new message from ${sender?.name || sender?.email || 'Support'}`;
        await storage.createNotification({
          userId: receiver.id,
          type: "message",
          title: `New message from ${sender?.name || sender?.email || 'Support'}`,
          message: notificationBody,
          metadata: { messageId: message.id, senderId, preview: messagePreview } as any,
        });
        
        // Also emit a notification event to the receiver's socket room
        io.to(receiverId).emit("notification", {
          type: "message",
          title: `New message from ${sender?.name || sender?.email || 'Support'}`,
          message: notificationBody,
          data: { messageId: message.id, senderId, preview: messagePreview },
        });
      }
      
      res.json(message);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/messages/:userId", requireAuth, requireRoleFeature("messages.view"), async (req: AuthRequest, res) => {
    try {
      const permission = await chatPermissionService.canInitiateChat(req.user!.id, req.params.userId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
      const messages = await storage.getMessages(req.user!.id, req.params.userId);
      res.json(messages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/messages/:userId/read", requireAuth, requireRoleFeature("messages.view"), async (req: AuthRequest, res) => {
    try {
      const permission = await chatPermissionService.canInitiateChat(req.user!.id, req.params.userId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }
      const updatedMessages = await storage.markMessagesAsRead(req.params.userId, req.user!.id);

      // Emit WhatsApp-style read status updates back to original senders
      for (const msg of updatedMessages) {
        const payload = {
          messageId: msg.id,
          status: "read",
          readAt: msg.readAt?.toISOString?.() || new Date().toISOString(),
          deliveredAt: msg.deliveredAt?.toISOString?.() || new Date().toISOString(),
        };
        // Keep both participants in sync (sender + receiver)
        io.to(msg.senderId).emit("message_status_updated", payload);
        io.to(req.user!.id).emit("message_status_updated", payload);
      }

      // Backward-compat event for any legacy listeners
      if (updatedMessages.length > 0) {
        io.to(req.params.userId).emit("message_read", {
          messageIds: updatedMessages.map((m) => m.id),
          readAt: new Date().toISOString(),
        });
      }

      res.json({ success: true, updated: updatedMessages.length });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/rider-assignment/active", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (_req, res) => {
    const active = Array.from(pendingRiderAssignments.values()).map((entry) => ({
      orderId: entry.orderId,
      orderNumber: entry.orderNumber,
      startedAt: entry.startedAt,
      expiresAt: entry.expiresAt,
      currentRiderId: entry.currentRiderId,
      currentCandidateIndex: entry.currentCandidateIndex,
      currentRadiusKm: entry.currentRadiusKm,
      candidateCount: entry.candidates.length,
      acceptedRiderId: entry.acceptedRiderId,
      manualConfirmationRequired: isManualAssignmentConfirmationRequired,
      attempts: entry.attempts,
      lastError: entry.lastError || null,
    }));
    res.json(active);
  });

  // Audio upload endpoint (voice notes/support) - configurable max (default 5MB)
  app.post("/api/upload/audio", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No audio file provided" });
      }

      const allowedMimeTypes = [
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
      ];
      const normalizedMime = (req.file.mimetype || "").toLowerCase().split(";")[0].trim();
      if (!allowedMimeTypes.includes(normalizedMime)) {
        return res.status(400).json({ error: "Invalid file type. Only common audio formats are allowed" });
      }

      if (req.file.size > AUDIO_UPLOAD_MAX_BYTES) {
        const maxMb = (AUDIO_UPLOAD_MAX_BYTES / (1024 * 1024)).toFixed(0);
        return res.status(400).json({ error: `File too large. Maximum size is ${maxMb}MB` });
      }

      const result = await uploadWithMetadata(req.file.buffer, "kiyumart/audio");
      res.json({ url: result.url, duration: result.duration, format: result.format });
    } catch (error: any) {
      console.error("Audio upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload audio" });
    }
  });

  // Support media upload endpoint - configurable cap (default 5MB) for image/video/audio
  app.post("/api/upload/support-media", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const allowedMimeTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/webp",
        "image/gif",
        "video/mp4",
        "video/webm",
        "video/quicktime",
        "audio/mpeg",
        "audio/mp3",
        "audio/wav",
        "audio/x-wav",
        "audio/webm",
        "audio/ogg",
        "audio/mp4",
        "audio/aac",
      ];

      const normalizedMime = (req.file.mimetype || "").toLowerCase().split(";")[0].trim();
      if (!allowedMimeTypes.includes(normalizedMime)) {
        return res.status(400).json({ error: "Unsupported file type for support media" });
      }

      if (req.file.size > SUPPORT_MEDIA_MAX_BYTES) {
        const maxMb = (SUPPORT_MEDIA_MAX_BYTES / (1024 * 1024)).toFixed(0);
        return res.status(400).json({ error: `File too large. Maximum size is ${maxMb}MB` });
      }

      const result = await uploadWithMetadata(req.file.buffer, "kiyumart/support");
      res.json({
        url: result.url,
        resourceType: result.resource_type || "raw",
        format: result.format,
        duration: result.duration,
      });
    } catch (error: any) {
      console.error("Support media upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload support media" });
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
  app.get("/api/seller/message-contacts", requireAuth, requireRole("seller"), requireRoleFeature("messages.view"), async (req: AuthRequest, res) => {
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
        profileImage: u.profileImage,
        isActive: u.isActive,
      }));
      
      res.json(contacts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Get message contacts for riders (admins, agents, sellers, and buyers who have messaged)
  app.get("/api/rider/message-contacts", requireAuth, requireRole("rider"), requireRoleFeature("messages.view"), async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      // Explicit policy: rider can always contact support staff; buyer/seller contacts are restricted to active deliveries.
      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      const agents = await storage.getUsersByRole("agent");

      const riderOrders = await storage.getOrdersByUser(userId, "rider");
      const activeStatuses = new Set(["searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route"]);
      const activeStakeholderIds = new Set<string>();
      riderOrders.forEach((o: any) => {
        if (!activeStatuses.has(canonicalizeOrderStatus(o.status))) return;
        if (o.buyerId) activeStakeholderIds.add(String(o.buyerId));
        if (o.sellerId) activeStakeholderIds.add(String(o.sellerId));
      });
      const activeStakeholders = await Promise.all(
        Array.from(activeStakeholderIds).map((id) => storage.getUser(id))
      );

      const allContacts = [...admins, ...superAdmins, ...agents];
      activeStakeholders.forEach((u) => {
        if (u && !allContacts.some((c) => c.id === u.id)) {
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
        profileImage: u.profileImage,
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
  app.get("/api/presence/stats", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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
      // Super admin is the only moderator role
      const isModerator = currentUser?.role === 'super_admin';
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
  app.post("/api/calls/group/start", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
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
      // Super admin is the only moderator role
      const isModerator = currentUser?.role === 'super_admin';
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
      // Super admin is the only moderator role
      const isModerator = currentUser?.role === 'super_admin';
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
      const roomName = req.params.roomName;
      const roomBeforeLeave = jitsiMeetService.getRoom(roomName);
      const wasOneToOneCall = !!roomBeforeLeave && !roomBeforeLeave.endedAt && roomBeforeLeave.participants.length <= 2;
      const remainingParticipantsBeforeLeave = roomBeforeLeave
        ? roomBeforeLeave.participants.filter((participantId) => participantId !== req.user!.id)
        : [];

      const success = jitsiMeetService.leaveCall(roomName, req.user!.id);
      
      if (success) {
        // Notify other participants
        const room = jitsiMeetService.getRoom(roomName);
        if (room) {
          for (const participantId of room.participants) {
            io.to(participantId).emit("jitsi_participant_left", {
              roomName,
              userId: req.user!.id,
            });
          }
        }

        // For 1-on-1 calls, remote hang-up should explicitly end the call for the other side too
        if (wasOneToOneCall && remainingParticipantsBeforeLeave.length > 0) {
          for (const participantId of remainingParticipantsBeforeLeave) {
            io.to(participantId).emit("jitsi_call_ended", {
              roomName,
              endedBy: req.user!.id,
            });
          }
          jitsiMeetService.endCall(roomName);
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

      const caller = await storage.getUser(req.user!.id);

      const { db } = await import("../db/index");
      const { chatMessages } = await import("@shared/schema");

      const missedCallMessage = await db.insert(chatMessages).values({
        senderId: req.user!.id,
        receiverId: targetUserId,
        message: `Missed ${callType || 'voice'} call from ${caller?.name || 'User'}`,
        messageType: 'missed_call',
        status: 'delivered',
      }).returning();

      const messageRecord = missedCallMessage[0];

      io.to(targetUserId).emit("missed_call", {
        callerId: req.user!.id,
        callerName: caller?.name || 'User',
        callType: callType || 'voice',
        messageId: messageRecord?.id,
      });

      if (messageRecord) {
        io.to(targetUserId).emit("new_message", messageRecord);
        io.to(req.user!.id).emit("new_message", messageRecord);
      }

      res.json({ success: true, message: messageRecord });
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
  app.get("/api/calls/active", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
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
  app.get("/api/admin/live-support", requireAuth, requireRole("admin", "super_admin", "agent"), requirePermissionIfAdmin("view_analytics"), requireRoleFeatureIfRole(["agent"], "support.manage"), async (req: AuthRequest, res) => {
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
  app.get("/api/admin/live-support/:user1Id/:user2Id", requireAuth, requireRole("admin", "super_admin", "agent"), requirePermissionIfAdmin("view_analytics"), requireRoleFeatureIfRole(["agent"], "support.manage"), async (req: AuthRequest, res) => {
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
  app.post("/api/admin/live-support/:targetUserId/message", requireAuth, requireRole("admin", "super_admin", "agent"), requirePermissionIfAdmin("view_analytics"), requireRoleFeatureIfRole(["agent"], "support.manage"), async (req: AuthRequest, res) => {
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
  app.get("/api/admin/messaging-stats", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const presenceStats = presenceService.getStats();
      const deliveryStats = messageDeliveryService.getStats();
      const callStats = jitsiMeetService.getStats();
      const allOrders = await storage.getAllOrders();
      const dispatchBacklog = allOrders.filter((o: any) => {
        const status = (o.status || "").toString().toLowerCase().trim();
        return o.deliveryMethod === "rider" && !o.riderId && ["processing", "ready", "confirmed"].includes(status);
      }).length;
      const alerts = {
        messageQueueWarning: deliveryStats.queueSize >= runtimeConfig.alerts.messageQueueWarnSize,
        dispatchBacklogWarning: dispatchBacklog >= runtimeConfig.alerts.dispatchBacklogWarnCount,
      };
      
      res.json({
        presence: presenceStats,
        messageQueue: deliveryStats,
        calls: callStats,
        operations: {
          dispatchBacklog,
        },
        alerts,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Admin Audit Endpoints ============
  app.get("/api/admin/audit/incomplete-sellers", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
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
  app.post("/api/settings/import-env", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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
  app.post("/api/settings/import-paystack", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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
  app.post("/api/settings/import-cloudinary", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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

  app.patch("/api/settings", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
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

  // ============ Frontend URL Status (Admin) ============
  app.get("/api/admin/frontend-url-status", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      // Get synchronously first (uses cache)
      const syncUrl = getFrontendUrlSync();
      
      // Get async to perform fresh check if requested
      const forceRefresh = req.query.refresh === 'true';
      if (forceRefresh) {
        clearFrontendUrlCache();
      }
      
      const validUrl = await getValidFrontendUrl();
      const envUrl = process.env.FRONTEND_URL || '';
      // Prefer DB-configured value for display when present
      let dbUrl = '';
      try {
        const currentSettings = await storage.getPlatformSettings();
        dbUrl = (currentSettings as any).frontendUrl || '';
      } catch (err) {
        // ignore
      }

      const configuredUrl = dbUrl || envUrl;
      const isHealthy = validUrl === (configuredUrl.replace(/\/$/, '') || 'http://localhost:5173');

      res.json({
        dbConfiguredUrl: dbUrl || null,
        envConfiguredUrl: envUrl || null,
        configuredUrl,
        resolvedUrl: validUrl,
        isHealthy,
        isFallingBack: validUrl === 'http://localhost:5173' && Boolean(configuredUrl),
        fallbackUrl: 'http://localhost:5173',
        cacheInfo: {
          message: forceRefresh ? 'Cache cleared, fresh check performed' : 'Using cached result',
          ttl: '60 seconds'
        }
      });
    } catch (error: any) {
      console.error('[FRONTEND_URL_STATUS] Error:', error?.message || String(error));
      res.status(500).json({ error: error?.message || "Failed to check frontend URL status" });
    }
  });

  // Admin: Promotional ads CRUD (basic scaffolding)
  app.post('/api/admin/promotions', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
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

  app.get('/api/admin/promotions', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
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

  app.patch('/api/admin/promotions/:id/expire', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
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

  // ============ Admin Promotion Pricing Management ============
  app.post('/api/admin/promotion-pricing', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const { type, durationType, duration, price } = req.body;
      if (!['store', 'product'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!['hour', 'day'].includes(durationType)) return res.status(400).json({ error: 'Invalid durationType' });
      if (typeof duration !== 'number' || duration <= 0) return res.status(400).json({ error: 'Invalid duration' });
      if (typeof price !== 'string' || isNaN(parseFloat(price))) return res.status(400).json({ error: 'Invalid price' });

      const created = await storage.createPromotionPricing({ type, durationType, duration, price });
      res.json(created);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/admin/promotion-pricing', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const rows = await storage.getAllPromotionPricing();
      res.json(rows);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/admin/promotion-pricing/:id', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const { id } = req.params;
      const { price, isActive } = req.body;
      const updateData: any = {};
      if (price !== undefined) updateData.price = price;
      if (isActive !== undefined) updateData.isActive = isActive;

      const updated = await storage.updatePromotionPricing(parseInt(id), updateData);
      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/admin/promotion-pricing/:id', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePromotionPricing(parseInt(id));
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ============ Super Admin: Per-Admin Permission Controls ============
  app.get("/api/admin/permissions", requireAuth, requireRole("super_admin"), async (_req, res) => {
    try {
      const adminUsers = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
          isApproved: users.isApproved,
          permissionRecordId: adminPermissions.id,
          canManageUsers: adminPermissions.canManageUsers,
          canManageProducts: adminPermissions.canManageProducts,
          canManageOrders: adminPermissions.canManageOrders,
          canManageStores: adminPermissions.canManageStores,
          canManageCategories: adminPermissions.canManageCategories,
          canManageAdmins: adminPermissions.canManageAdmins,
          canEditPasswords: adminPermissions.canEditPasswords,
          canManageRoles: adminPermissions.canManageRoles,
          canManagePlatformSettings: adminPermissions.canManagePlatformSettings,
          canViewAnalytics: adminPermissions.canViewAnalytics,
          canManagePromotions: adminPermissions.canManagePromotions,
          canManageReviews: adminPermissions.canManageReviews,
          maxProductsPerDay: adminPermissions.maxProductsPerDay,
          maxOrdersPerDay: adminPermissions.maxOrdersPerDay,
        })
        .from(users)
        .leftJoin(adminPermissions, eq(users.id, adminPermissions.userId))
        .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")))
        .orderBy(desc(users.createdAt));

      const defaultPermissions = {
        canManageUsers: true,
        canManageProducts: true,
        canManageOrders: true,
        canManageStores: true,
        canManageCategories: true,
        canManageAdmins: false,
        canEditPasswords: false,
        canManageRoles: false,
        canManagePlatformSettings: true,
        canViewAnalytics: true,
        canManagePromotions: true,
        canManageReviews: true,
        maxProductsPerDay: 100,
        maxOrdersPerDay: 500,
      };

      const response = adminUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        isActive: u.isActive,
        isApproved: u.isApproved,
        hasPermissionRecord: !!u.permissionRecordId,
        permissions: {
          canManageUsers: u.canManageUsers ?? defaultPermissions.canManageUsers,
          canManageProducts: u.canManageProducts ?? defaultPermissions.canManageProducts,
          canManageOrders: u.canManageOrders ?? defaultPermissions.canManageOrders,
          canManageStores: u.canManageStores ?? defaultPermissions.canManageStores,
          canManageCategories: u.canManageCategories ?? defaultPermissions.canManageCategories,
          canManageAdmins: u.canManageAdmins ?? defaultPermissions.canManageAdmins,
          canEditPasswords: u.canEditPasswords ?? defaultPermissions.canEditPasswords,
          canManageRoles: u.canManageRoles ?? defaultPermissions.canManageRoles,
          canManagePlatformSettings: u.canManagePlatformSettings ?? defaultPermissions.canManagePlatformSettings,
          canViewAnalytics: u.canViewAnalytics ?? defaultPermissions.canViewAnalytics,
          canManagePromotions: u.canManagePromotions ?? defaultPermissions.canManagePromotions,
          canManageReviews: u.canManageReviews ?? defaultPermissions.canManageReviews,
          maxProductsPerDay: u.maxProductsPerDay ?? defaultPermissions.maxProductsPerDay,
          maxOrdersPerDay: u.maxOrdersPerDay ?? defaultPermissions.maxOrdersPerDay,
        },
      }));

      res.json(response);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to load admin permissions" });
    }
  });

  app.put("/api/admin/permissions/:userId", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    try {
      const { userId } = req.params;
      const targetUser = await storage.getUser(userId);
      if (!targetUser) {
        return res.status(404).json({ error: "User not found" });
      }
      if (targetUser.role !== "admin" && targetUser.role !== "super_admin") {
        return res.status(400).json({ error: "Permissions can only be managed for admin or super_admin users" });
      }

      const payload = req.body || {};
      const boolFields = [
        "canManageUsers",
        "canManageProducts",
        "canManageOrders",
        "canManageStores",
        "canManageCategories",
        "canManageAdmins",
        "canEditPasswords",
        "canManageRoles",
        "canManagePlatformSettings",
        "canViewAnalytics",
        "canManagePromotions",
        "canManageReviews",
      ] as const;
      const numberFields = ["maxProductsPerDay", "maxOrdersPerDay"] as const;

      const updates: Record<string, any> = {};
      for (const field of boolFields) {
        if (field in payload) {
          if (typeof payload[field] !== "boolean") {
            return res.status(400).json({ error: `${field} must be a boolean` });
          }
          updates[field] = payload[field];
        }
      }
      for (const field of numberFields) {
        if (field in payload) {
          const value = Number(payload[field]);
          if (!Number.isFinite(value) || value < 0) {
            return res.status(400).json({ error: `${field} must be a non-negative number` });
          }
          updates[field] = Math.floor(value);
        }
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No valid permission fields provided" });
      }

      const [existing] = await db
        .select()
        .from(adminPermissions)
        .where(eq(adminPermissions.userId, userId))
        .limit(1);

      let saved;
      if (existing) {
        [saved] = await db
          .update(adminPermissions)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(adminPermissions.userId, userId))
          .returning();
      } else {
        [saved] = await db
          .insert(adminPermissions)
          .values({
            userId,
            ...updates,
          })
          .returning();
      }

      res.json(saved);
    } catch (error: any) {
      res.status(500).json({ error: error.message || "Failed to update admin permissions" });
    }
  });

  // ============ Seller Promotion Application ============
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

  // ============ Seller Promotion Application ============
  app.get('/api/seller/promotion-pricing', requireAuth, requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      // Check if multi-vendor is enabled
      const settings = await storage.getPlatformSettings();
      if (!settings.isMultiVendor) {
        return res.status(403).json({ error: "Promotions are only available in multi-vendor mode" });
      }

      const pricing = await storage.getAllPromotionPricing();
      res.json(pricing);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/seller/apply-promotion', requireAuth, requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      // Check if multi-vendor is enabled
      const settings = await storage.getPlatformSettings();
      if (!settings.isMultiVendor) {
        return res.status(403).json({ error: "Promotions are only available in multi-vendor mode" });
      }

      const { type, targetId, durationType, duration, paymentReference } = req.body;
      if (!['store', 'product'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!['hour', 'day'].includes(durationType)) return res.status(400).json({ error: 'Invalid durationType' });
      if (typeof duration !== 'number' || duration <= 0) return res.status(400).json({ error: 'Invalid duration' });

      // Validate targetId belongs to seller
      if (type === 'store') {
        const store = await storage.getStore(targetId);
        if (!store || store.primarySellerId !== user.id) {
          return res.status(403).json({ error: 'You can only promote your own store' });
        }
      } else if (type === 'product') {
        const product = await storage.getProduct(targetId);
        if (!product || product.sellerId !== user.id) {
          return res.status(403).json({ error: 'You can only promote your own products' });
        }
      }

      // Get pricing
      const pricing = await storage.getPromotionPricing(type, durationType, duration);
      if (!pricing) {
        return res.status(400).json({ error: 'No pricing found for the selected options' });
      }

      // Calculate total price (for multiple days, multiply)
      const unitPrice = parseFloat(pricing.price);
      const totalPrice = unitPrice * duration;
      const expectedAmountMinor = Math.round(totalPrice * 100);

      if (!paymentReference || typeof paymentReference !== "string" || !paymentReference.trim()) {
        return res.status(400).json({ error: "paymentReference is required to activate a promotion" });
      }

      const existingTx = await storage.getTransactionByReference(paymentReference.trim());
      if (existingTx) {
        return res.status(400).json({ error: "This payment reference has already been used" });
      }

      if (!settings.paystackSecretKey) {
        return res.status(503).json({ error: "Payment gateway not configured" });
      }

      const verifyResp = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentReference.trim())}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${settings.paystackSecretKey}`,
          "Content-Type": "application/json",
        },
      });
      if (!verifyResp.ok) {
        return res.status(400).json({ error: "Unable to verify payment reference" });
      }
      const verifyJson = await verifyResp.json();
      const paystackStatus = (verifyJson?.data?.status || "").toString().toLowerCase().trim();
      const paidAmountMinor = Number(verifyJson?.data?.amount || 0);
      const paidCurrency = (verifyJson?.data?.currency || "GHS").toString().toUpperCase();
      if (paystackStatus !== "success") {
        return res.status(400).json({ error: "Payment is not successful for this reference" });
      }
      if (paidAmountMinor < expectedAmountMinor) {
        return res.status(400).json({ error: `Insufficient promotion payment amount. Expected ${expectedAmountMinor}, got ${paidAmountMinor}` });
      }

      // Calculate end time
      const startAt = new Date();
      const endAt = new Date(startAt);
      if (durationType === 'hour') {
        endAt.setHours(endAt.getHours() + duration);
      } else {
        endAt.setDate(endAt.getDate() + duration);
      }

      // Create promotional ad only after verified payment.
      const promo = await storage.createPromotionalAd({
        type,
        targetId,
        startAt,
        endAt,
        createdBy: user.id,
        title: null,
        description: null,
        imageUrl: null,
        ctaText: null,
        ctaUrl: null,
        themeColor: null,
      });

      res.json({
        ...promo,
        totalPrice: totalPrice.toFixed(2),
        currency: 'GHS',
        durationType,
        duration,
        unitPrice: pricing.price,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ============ Payment Routes (Paystack) ============
  app.post("/api/payments/initialize", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { orderId, checkoutSessionId } = req.body;
      const forceRetry = req.body?.forceRetry === true;
      const normalizePaymentStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
      const isCompletedPaymentStatus = (value?: string | null) =>
        ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
      const isInFlightPaymentStatus = (value?: string | null) =>
        ["pending", "processing"].includes(normalizePaymentStatus(value));
      const inFlightWindowMs = 15 * 60 * 1000;
      
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

      const verifyExistingReferenceStatus = async (reference: string): Promise<string | null> => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${settings.paystackSecretKey}`,
              "Content-Type": "application/json",
            },
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (!response.ok) return null;
          const data = await response.json().catch(() => null);
          return normalizePaymentStatus(data?.data?.status || null);
        } catch {
          return null;
        }
      };
      
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
        const anyAlreadyPaid = orders.some((o: any) => isCompletedPaymentStatus(o.paymentStatus));
        if (anyAlreadyPaid) {
          return res.status(400).json({ 
            error: "One or more orders are already paid", 
            userMessage: "Some of these orders have already been paid for." 
          });
        }

        const hasInFlightRecentAttempt = orders.some((o: any) => {
          if (!isInFlightPaymentStatus(o.paymentStatus)) return false;
          if (!o.paymentReference) return false;
          const updatedAt = o.updatedAt ? new Date(o.updatedAt).getTime() : 0;
          if (!updatedAt) return false;
          return Date.now() - updatedAt < inFlightWindowMs;
        });
        if (hasInFlightRecentAttempt) {
          const refs = Array.from(new Set(
            orders
              .map((o: any) => String(o.paymentReference || "").trim())
              .filter((r: string) => r.length > 0)
          ));
          for (const ref of refs) {
            const status = await verifyExistingReferenceStatus(ref);
            if (status === "success") {
              await verifyReferenceAndProcess(ref, req.user!.id);
              return res.status(400).json({
                error: "Order is already paid",
                userMessage: "This order has already been paid for.",
              });
            }
            if (status && !["abandoned", "failed", "cancelled", "reversed"].includes(status)) {
              const canForceRetry = forceRetry;
              if (canForceRetry) continue;
              return res.status(409).json({
                error: "Payment attempt already in progress",
                userMessage: "A recent payment attempt is still processing. Please wait a few minutes before trying again.",
              });
            }
          }
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
        if (isCompletedPaymentStatus(order.paymentStatus)) {
          return res.status(400).json({ error: "Order is already paid", userMessage: "This order has already been paid for." });
        }

        if (isInFlightPaymentStatus(order.paymentStatus)) {
          if (!order.paymentReference) {
            // stale in-flight state without a reference; allow retry to recover.
          } else {
          const updatedAt = order.updatedAt ? new Date(order.updatedAt).getTime() : 0;
          if (updatedAt && Date.now() - updatedAt < inFlightWindowMs) {
            const status = await verifyExistingReferenceStatus(order.paymentReference);
            if (status === "success") {
              await verifyReferenceAndProcess(order.paymentReference, req.user!.id);
              return res.status(400).json({ error: "Order is already paid", userMessage: "This order has already been paid for." });
            }
            if (status && !["abandoned", "failed", "cancelled", "reversed"].includes(status)) {
              const canForceRetry = forceRetry;
              if (canForceRetry) {
                // Continue below and create a fresh Paystack initialization for explicit resume flow.
              } else {
              return res.status(409).json({
                error: "Payment attempt already in progress",
                userMessage: "A recent payment attempt is still processing. Please wait a few minutes before trying again.",
              });
              }
            }
          }
          }
        }
        
        orders = [order];
        totalAmount = parseFloat(order.total);
      }
      
      // Validate order amount
      if (totalAmount <= 0) {
        return res.status(400).json({ error: "Invalid order amount", userMessage: "Order amount must be greater than zero." });
      }
      
      // Initialize payment with Paystack with timeout
      // Prefer FRONTEND_URL (deployed front-end) for Paystack redirect so users return to the client
      // Fallback to request host for local/dev runs.
      // Prefer DB-configured frontendUrl (if set) then resolver
      const settingsForCallback = await storage.getPlatformSettings();
      const dbFrontend = (settingsForCallback as any).frontendUrl || '';
      const { getFrontendUrlSync } = await import('./frontendUrlResolver');
      const resolverHost = getFrontendUrlSync(`${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
      const frontendHost = (dbFrontend || resolverHost).replace(/\/$/, '');
      const callbackBase = frontendHost || `${req.protocol}://${req.get('host')}`;
      const callbackUrl = `${callbackBase}/payment/verify`;
      console.debug('[PAYMENTS] Using callback URL for Paystack initialize:', callbackUrl);

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
            // Keep payment as pending until verify/webhook confirms completion.
            paymentStatus: "pending",
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
      const txCompleted = existingTransaction.status === "completed";
      const txMeta = (existingTransaction as any).metadata || {};
      const orderIdsFromTx = Array.isArray(txMeta.orderIds) ? txMeta.orderIds : [];
      const targetOrderIds = orderIdsFromTx.length > 0 ? orderIdsFromTx : [existingTransaction.orderId];

      // Self-heal order state when transaction is already completed but order status was left stale.
      if (txCompleted) {
        await Promise.all(
          targetOrderIds.map(async (id: string) => {
            const o = await storage.getOrder(id);
            if (!o) return;
            const needsPaymentSync = o.paymentStatus !== "completed";
            const needsStatusSync = o.status === "pending";
            if (needsPaymentSync || needsStatusSync) {
              await storage.updateOrder(id, {
                paymentStatus: "completed",
                status: needsStatusSync ? "processing" : o.status,
              } as any);
            }
          })
        );
        await startRiderMatchingForPaidOrders(targetOrderIds);
      }

      return {
        transaction: existingTransaction,
        verified: txCompleted,
        orderId: existingTransaction.orderId,
        orderIds: targetOrderIds,
        isMultiVendor: targetOrderIds.length > 1,
        orderCount: targetOrderIds.length,
        message: "Transaction already processed",
      };
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

      console.log('[VERIFY] Paystack verify response data:', JSON.stringify(data.data, null, 2));

      // Determine payment mode based on platform configuration + tolerant metadata parsing
      // Platform setting has higher authority — if platform is single-store, treat payment as single-vendor.
      const platformIsMultiVendor = !!settings.isMultiVendor;
      const rawMeta = data.data.metadata || {};

      const metaIsMultiVendorRaw = rawMeta.isMultiVendor;
      const metaIsMultiVendor = metaIsMultiVendorRaw === true || (typeof metaIsMultiVendorRaw === 'string' && ['true','1'].includes(metaIsMultiVendorRaw.toLowerCase()));
      const metaHasOrderIds = Array.isArray(rawMeta.orderIds) && rawMeta.orderIds.length > 0;
      const metaHasCheckoutSession = Boolean(rawMeta.checkoutSessionId);

      // Only treat as multi-vendor when the platform supports it AND metadata indicates multi-vendor intent
      const isMultiVendor = platformIsMultiVendor && (metaIsMultiVendor || metaHasOrderIds || metaHasCheckoutSession);

      if (platformIsMultiVendor !== isMultiVendor) {
        console.warn('[VERIFY] Platform mode vs payment metadata mismatch', { platformIsMultiVendor: platformIsMultiVendor, paymentMeta: rawMeta });
      }

      let orders: any[] = [];

      if (isMultiVendor) {
        // Accept orderIds in multiple formats (array | JSON-string | comma-separated string)
        let orderIds: any = rawMeta.orderIds || [];
        const checkoutSessionIdFromMeta = rawMeta.checkoutSessionId;

        if (!Array.isArray(orderIds)) {
          if (typeof orderIds === 'string' && orderIds.length > 0) {
            try {
              const parsed = JSON.parse(orderIds);
              orderIds = Array.isArray(parsed) ? parsed : orderIds.split(',').map((s: string) => s.trim()).filter(Boolean);
            } catch (e) {
              orderIds = orderIds.split(',').map((s: string) => s.trim()).filter(Boolean);
            }
          } else {
            orderIds = [];
          }
        }

        // Resolve by checkoutSessionId when explicit IDs are not present
        if ((!Array.isArray(orderIds) || orderIds.length === 0) && checkoutSessionIdFromMeta) {
          const allOrders = await storage.getAllOrders();
          const sessionOrders = allOrders.filter((o: any) => o.checkoutSessionId === checkoutSessionIdFromMeta);
          if (sessionOrders.length === 0) {
            console.error('[VERIFY] No orders found for checkoutSessionId:', checkoutSessionIdFromMeta);
            throw new Error("Invalid multi-vendor payment data");
          }
          orders = sessionOrders;
        } else {
          if (!Array.isArray(orderIds) || orderIds.length === 0) {
            console.error('[VERIFY] Missing orderIds for multi-vendor payment - metadata:', rawMeta);
            throw new Error("Invalid multi-vendor payment data");
          }

          const allOrders = await storage.getAllOrders();
          orders = allOrders.filter((o: any) => orderIds.includes(o.id));
          if (orders.length !== orderIds.length) {
            console.error('[VERIFY] Some orders from metadata not found', { expected: orderIds, found: orders.map((o:any)=>o.id) });
            throw new Error("Some orders not found");
          }
        }

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
      const normalizePaymentStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
      const isCompletedPaymentStatus = (value?: string | null) =>
        ["completed", "paid", "success"].includes(normalizePaymentStatus(value));

      if (orders.every((o: any) => isCompletedPaymentStatus(o.paymentStatus))) {
        return {
          transaction: await storage.getTransactionByReference(reference),
          verified: true,
          orderId: primaryOrder.id,
          orderIds: orders.map((o: any) => o.id),
          isMultiVendor,
          orderCount: orders.length,
          message: "Order already paid",
        };
      }

      try {
        const { processPaystackChargeSuccess } = await import('./payments');
        await processPaystackChargeSuccess(data.data, storage, io);
      } catch (procErr: any) {
        console.error('[VERIFY] Error processing payment via shared helper:', procErr?.message || procErr);
        if (data.data.status === "success") {
          const existingTx = await storage.getTransactionByReference(reference);
          if (!existingTx) {
            await storage.createTransaction({
              orderId: primaryOrder.id,
              userId: primaryOrder.buyerId,
              amount: (Number(data.data.amount || 0) / 100).toString(),
              currency: data.data.currency || primaryOrder.currency || "GHS",
              paymentProvider: "paystack",
              paymentReference: reference,
              status: "completed",
              metadata: {
                source: "verify_fallback",
                orderIds: orders.map((o: any) => o.id),
                raw: data.data,
              },
            } as any);
          }

          await Promise.all(
            orders.map(async (o: any) => {
              const currentStatus = canonicalizeOrderStatus(o.status);
              const nextStatus = currentStatus === "created" ? "processing" : currentStatus;
              await storage.updateOrder(o.id, {
                paymentStatus: "completed",
                status: nextStatus,
                paymentReference: reference,
              } as any);
            })
          );
        } else {
          throw procErr;
        }
      }

      if (data.data.status === "success") {
        await startRiderMatchingForPaidOrders(orders.map((o: any) => o.id));
        try {
          const orderNumbers = orders.map((o: any) => `#${o.orderNumber}`).join(", ");
          const totalPaid = (Number(data.data.amount || 0) / 100).toFixed(2);
          await notifyAdmins(
            "order",
            "New Paid Order",
            `Payment confirmed for ${orders.length} order(s): ${orderNumbers}. Total: ${data.data.currency} ${totalPaid}.`,
            {
              reference,
              orderIds: orders.map((o: any) => o.id),
              orderNumbers,
              link: "/admin/orders",
            },
            {
              requiredAdminPermission: "manage_orders",
              includeAgents: true,
              requiredAgentFeature: "orders.view",
            }
          );
        } catch (opsNotifyErr) {
          console.error("[VERIFY] Could not send ops notification for paid order:", opsNotifyErr);
        }
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
              await notifyAdmins(
                'payment_webhook_retries',
                'Repeated webhook retries',
                `Paystack reference ${reference} has ${retries} webhook attempts`,
                { reference, retries, link: "/admin/orders" },
                {
                  requiredAdminPermission: "manage_orders",
                  includeAgents: true,
                  requiredAgentFeature: "orders.view",
                }
              );
            } catch (notifyErr) {
              console.error('[WEBHOOK] notifyAdmins failed', notifyErr);
            }
            console.warn(`[WEBHOOK] Repeated webhook retries for reference ${reference}: ${retries}`);
          }

          // Delegate processing to shared helper
          try {
            const { processPaystackChargeSuccess } = await import('./payments');
            await processPaystackChargeSuccess(data, storage, io);
            const paidOrderIds = extractOrderIdsFromPaymentPayload(data);
            await startRiderMatchingForPaidOrders(paidOrderIds);
            try {
              const orderListLabel = paidOrderIds.length > 0 ? paidOrderIds.join(", ") : "unknown";
              const paidAmount = (Number(data?.amount || 0) / 100).toFixed(2);
              await notifyAdmins(
                "order",
                "New Paid Order",
                `Webhook confirmed payment for order(s): ${orderListLabel}. Total: ${data?.currency || "GHS"} ${paidAmount}.`,
                {
                  reference,
                  orderIds: paidOrderIds,
                  link: "/admin/orders",
                },
                {
                  requiredAdminPermission: "manage_orders",
                  includeAgents: true,
                  requiredAgentFeature: "orders.view",
                }
              );
            } catch (opsNotifyErr) {
              console.error("[WEBHOOK] Could not send ops notification for paid order:", opsNotifyErr);
            }
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
  app.get("/api/admin/payouts/pending", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const payouts = await storage.getAllPendingPayouts();
      res.json(payouts);
    } catch (error) {
      console.error('[ADMIN-PAYOUTS] Error fetching pending payouts:', error);
      res.status(500).json({ error: "Failed to fetch pending payouts" });
    }
  });

  // Process payout (admin only)
  app.patch("/api/admin/payouts/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { status, notes } = req.body;

      if (!status || !['processing', 'completed', 'failed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status. Must be processing, completed, or failed" });
      }

      const updated = await storage.updatePayoutStatus(id, status, req.user!.id);
      
      if (!updated) {
        return res.status(404).json({ error: "Payout not found" });
      }

      console.log(`[ADMIN-PAYOUT] Admin ${req.user!.email} updated payout ${id} to ${status}`);
      
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

  // Revenue aggregate views (completed-only accounting source for dashboards/audits).
  app.get("/api/admin/revenue/views/summary", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (_req: AuthRequest, res) => {
    try {
      const [daily, seller, commissions] = await Promise.all([
        db.execute(sql`select * from daily_revenue order by revenue_date desc limit 30`),
        db.execute(sql`select * from seller_revenue order by total_revenue desc limit 50`),
        db.execute(sql`select * from platform_commission order by commission_created_at desc limit 50`),
      ]);
      res.json({
        dailyRevenue: (daily as any).rows || [],
        sellerRevenue: (seller as any).rows || [],
        platformCommission: (commissions as any).rows || [],
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/revenue/views/order-payments", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 100)));
      const rows = await db.execute(sql`select * from order_payments order by order_created_at desc limit ${limit}`);
      res.json((rows as any).rows || []);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Socket.IO for Real-time Chat ============
  const userSockets = new Map<string, string>();

  // Helper function to send operations notifications with permission-aware audience filtering.
  async function notifyAdmins(
    type: string,
    title: string,
    message: string,
    metadata?: Record<string, any>,
    options?: {
      requiredAdminPermission?:
        | "manage_users"
        | "manage_products"
        | "manage_orders"
        | "manage_stores"
        | "manage_categories"
        | "manage_platform_settings"
        | "view_analytics"
        | "manage_promotions"
        | "manage_reviews";
      includeAgents?: boolean;
      requiredAgentFeature?: string;
    }
  ) {
    try {
      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      const agents = options?.includeAgents ? await storage.getUsersByRole("agent") : [];
      const recipients = [...admins, ...superAdmins, ...agents];
      const adminPermissionCache = new Map<string, any>();

      const hasAdminPermission = async (adminId: string, permission?: string) => {
        if (!permission) return true;
        if (!adminPermissionCache.has(adminId)) {
          const [permissionsRow] = await db
            .select()
            .from(adminPermissions)
            .where(eq(adminPermissions.userId, adminId))
            .limit(1);
          adminPermissionCache.set(adminId, permissionsRow || null);
        }
        const row = adminPermissionCache.get(adminId);
        if (!row) return false;
        switch (permission) {
          case "manage_users":
            return row.canManageUsers === true;
          case "manage_products":
            return row.canManageProducts === true;
          case "manage_orders":
            return row.canManageOrders === true;
          case "manage_stores":
            return row.canManageStores === true;
          case "manage_categories":
            return row.canManageCategories === true;
          case "manage_platform_settings":
            return row.canManagePlatformSettings === true;
          case "view_analytics":
            return row.canViewAnalytics === true;
          case "manage_promotions":
            return row.canManagePromotions === true;
          case "manage_reviews":
            return row.canManageReviews === true;
          default:
            return false;
        }
      };

      for (const recipient of recipients) {
        // Legacy rows may have null isActive; only skip explicitly disabled users.
        if (recipient?.isActive === false) continue;

        if (recipient.role === "admin") {
          const allowed = await hasAdminPermission(recipient.id, options?.requiredAdminPermission);
          if (!allowed) continue;
        } else if (recipient.role === "agent") {
          const requiredFeature = options?.requiredAgentFeature || "support.view";
          const features = await resolveRoleFeatures(recipient.role);
          if (features[requiredFeature] !== true) continue;
        } else if (recipient.role !== "super_admin") {
          continue;
        }

        // Save notification to database
        await storage.createNotification({
          userId: recipient.id,
          type: type as any,
          title,
          message,
          metadata,
        });
        
        // Send real-time notification via Socket.IO
        if (recipient.id) {
          io.to(recipient.id).emit("notification", {
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
        ['pending', 'created', 'confirmed', 'processing', 'ready', 'searching_rider', 'assigned', 'rider_arrived', 'picked_up', 'in_transit', 'en_route', 'delivered'].includes(String(o.status || '').toLowerCase().trim())
      ) || null;
    },
  });

  // Aggregated system health indicators for admin/super admin operational dashboards.
  app.get("/api/admin/system-health", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (_req: AuthRequest, res) => {
    try {
      const presence = presenceService.getStats();
      const allOrders = await storage.getAllOrders();
      const canonicalActive = new Set(["searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route"]);
      const activeOrders = allOrders.filter((o: any) => canonicalActive.has(canonicalizeOrderStatus(o.status)));

      const ordersByRider = new Map<string, any[]>();
      for (const order of activeOrders) {
        if (!order.riderId) continue;
        const bucket = ordersByRider.get(order.riderId) || [];
        bucket.push(order);
        ordersByRider.set(order.riderId, bucket);
      }

      let staleGpsOrders = 0;
      const gpsLossThresholdMs = 2 * 60 * 1000;
      for (const order of activeOrders) {
        if (!order.riderId) continue;
        const latest = await storage.getLatestDeliveryLocation(order.id);
        if (!latest?.timestamp) {
          staleGpsOrders += 1;
          continue;
        }
        const ageMs = Date.now() - new Date(latest.timestamp).getTime();
        if (ageMs > gpsLossThresholdMs) staleGpsOrders += 1;
      }

      const overloadedRiders = Array.from(ordersByRider.entries())
        .filter(([, orders]) => orders.length > 1)
        .map(([riderId, orders]) => ({ riderId, activeOrders: orders.length }));

      res.json({
        generatedAt: new Date().toISOString(),
        presence,
        pipeline: {
          totalOrders: allOrders.length,
          activeOrders: activeOrders.length,
          searchingRider: activeOrders.filter((o: any) => canonicalizeOrderStatus(o.status) === "searching_rider").length,
          assigned: activeOrders.filter((o: any) => canonicalizeOrderStatus(o.status) === "assigned").length,
          inTransit: activeOrders.filter((o: any) => ["picked_up", "in_transit", "en_route"].includes(canonicalizeOrderStatus(o.status))).length,
        },
        assignment: {
          activeAttempts: pendingRiderAssignments.size,
          failedAttempts: Array.from(pendingRiderAssignments.values()).filter((entry) => Boolean(entry.lastError)).length,
        },
        tracking: {
          staleGpsOrders,
          gpsLossThresholdSeconds: gpsLossThresholdMs / 1000,
        },
        alerts: {
          overloadedRiders,
        },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
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
    if (socket.data.userRole === "rider") {
      void (async () => {
        try {
          const riderOrders = await storage.getOrdersByUser(userId, "rider");
          const activeOrder = riderOrders.find((o: any) =>
            ["assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes(canonicalizeOrderStatus(o.status))
          );
          if (!activeOrder) return;
          const latest = await storage.getLatestDeliveryLocation(activeOrder.id);
          socket.emit("rider_resume_state", {
            orderId: activeOrder.id,
            orderNumber: activeOrder.orderNumber,
            status: canonicalizeOrderStatus(activeOrder.status),
            lastKnownLocation: latest
              ? {
                  latitude: latest.latitude,
                  longitude: latest.longitude,
                  speed: latest.speed,
                  heading: latest.heading,
                  timestamp: latest.timestamp,
                }
              : null,
          });
        } catch (error) {
          console.warn(`[RIDER] Failed to send reconnect resume state for ${userId}:`, (error as any)?.message || error);
        }
      })();
    }
    
    // Deliver any queued messages for this user
    messageDeliveryService.onUserOnline(userId);

    socket.on("disconnect", () => {
      console.log(`User disconnected: ${userEmail} (${userId})`);
      userSockets.delete(userId);
      io.emit("user_offline", userId);
      
      // Update presence service
      presenceService.userDisconnected(userId);
      if (socket.data.userRole === "rider") {
        void (async () => {
          try {
            const riderOrders = await storage.getOrdersByUser(userId, "rider");
            const impacted = riderOrders.find((o: any) =>
              ["searching_rider", "assigned", "rider_arrived"].includes(canonicalizeOrderStatus(o.status))
            );
            if (!impacted) return;

            await storage.updateOrder(impacted.id, { riderId: null } as any);
            await startRiderMatchingForPaidOrders([impacted.id]);
          } catch (error) {
            console.warn(`[RIDER_MATCH] Offline reassign failed for rider ${userId}:`, (error as any)?.message || error);
          }
        })();
      }
    });

    // Heartbeat for presence tracking
    socket.on("heartbeat", () => {
      presenceService.heartbeat(userId);
    });

    socket.on("rider_location_update", async (payload) => {
      try {
        if (socket.data.userRole !== "rider") return;
        const orderId = String(payload?.orderId || "");
        if (!orderId) return;

        const order = await storage.getOrder(orderId);
        if (!order || order.riderId !== userId) return;

        const lat = toFiniteNumber(payload?.latitude);
        const lng = toFiniteNumber(payload?.longitude);
        if (lat === null || lng === null) return;

        const latest = await storage.getLatestDeliveryLocation(order.id);
        let effectiveLat = lat;
        let effectiveLng = lng;

        if (latest) {
          const prevLat = toFiniteNumber(latest.latitude);
          const prevLng = toFiniteNumber(latest.longitude);
          if (prevLat !== null && prevLng !== null) {
            const distanceKm = haversineDistanceKm(prevLat, prevLng, lat, lng);
            const prevTs = latest.timestamp ? new Date(latest.timestamp).getTime() : Date.now();
            const elapsedHours = Math.max((Date.now() - prevTs) / 3_600_000, 1 / 3600);
            const impliedSpeed = distanceKm / elapsedHours;
            if (impliedSpeed > 160) {
              effectiveLat = prevLat;
              effectiveLng = prevLng;
            }
          }
        }

        const tracking = await storage.createDeliveryTracking({
          orderId: order.id,
          riderId: userId,
          latitude: effectiveLat.toString(),
          longitude: effectiveLng.toString(),
          accuracy: payload?.accuracy,
          speed: payload?.speed,
          heading: payload?.heading,
        } as any);

        const rider = await storage.getUser(userId);
        const update = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          riderId: userId,
          riderName: rider?.name || "Rider",
          latitude: tracking.latitude,
          longitude: tracking.longitude,
          speed: tracking.speed,
          heading: tracking.heading,
          timestamp: tracking.timestamp,
        };
        io.to(order.buyerId).emit("rider_location_updated", update);
        if (order.sellerId) io.to(order.sellerId).emit("rider_location_updated", update);
        io.to(userId).emit("rider_location_updated", update);

        const [admins, superAdmins] = await Promise.all([
          storage.getUsersByRole("admin"),
          storage.getUsersByRole("super_admin"),
        ]);
        [...admins, ...superAdmins].forEach((adminUser) => {
          io.to(adminUser.id).emit("admin_rider_location_updated", update);
        });
      } catch (error) {
        console.error("rider_location_update handler error:", error);
      }
    });

    socket.on("typing", ({ receiverId }) => {
      io.to(receiverId).emit("user_typing", { userId });
      presenceService.setTyping(userId, receiverId);
    });

    socket.on("stop_typing", ({ receiverId }) => {
      io.to(receiverId).emit("user_stop_typing", { userId });
      presenceService.setTyping(userId, null);
    });

    // Support conversation typing events (works even when ticket is unassigned)
    socket.on("support_typing", async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const { db } = await import("../db/index");
        const { supportConversations } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        const [conversation] = await db
          .select()
          .from(supportConversations)
          .where(eq(supportConversations.id, conversationId))
          .limit(1);
        if (!conversation) return;

        const targetUserIds = new Set<string>();
        targetUserIds.add(conversation.customerId);
        if (conversation.agentId) {
          targetUserIds.add(conversation.agentId);
        } else {
          const admins = await storage.getUsersByRole("admin");
          const superAdmins = await storage.getUsersByRole("super_admin");
          const agents = await storage.getUsersByRole("agent");
          [...admins, ...superAdmins, ...agents].forEach((u) => targetUserIds.add(u.id));
        }
        targetUserIds.delete(userId);

        Array.from(targetUserIds).forEach((targetUserId) => {
          io.to(targetUserId).emit("support_user_typing", { conversationId, userId });
        });
      } catch (err) {
        console.error("support_typing handler error:", err);
      }
    });

    socket.on("support_stop_typing", async ({ conversationId }) => {
      try {
        if (!conversationId) return;
        const { db } = await import("../db/index");
        const { supportConversations } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");

        const [conversation] = await db
          .select()
          .from(supportConversations)
          .where(eq(supportConversations.id, conversationId))
          .limit(1);
        if (!conversation) return;

        const targetUserIds = new Set<string>();
        targetUserIds.add(conversation.customerId);
        if (conversation.agentId) {
          targetUserIds.add(conversation.agentId);
        } else {
          const admins = await storage.getUsersByRole("admin");
          const superAdmins = await storage.getUsersByRole("super_admin");
          const agents = await storage.getUsersByRole("agent");
          [...admins, ...superAdmins, ...agents].forEach((u) => targetUserIds.add(u.id));
        }
        targetUserIds.delete(userId);

        Array.from(targetUserIds).forEach((targetUserId) => {
          io.to(targetUserId).emit("support_user_stop_typing", { conversationId, userId });
        });
      } catch (err) {
        console.error("support_stop_typing handler error:", err);
      }
    });
    
    // Message acknowledgment events
    socket.on("message_received", ({ messageId }) => {
      messageDeliveryService.markDelivered(messageId, userId);
    });
    
    socket.on("messages_read", ({ messageIds }) => {
      messageDeliveryService.markRead(messageIds, userId);
    });

    const authorizeSocketCallTarget = async (targetUserId: string): Promise<boolean> => {
      const target = String(targetUserId || "");
      if (!target) {
        socket.emit("error", { message: "Target user is required" });
        return false;
      }
      const permission = await chatPermissionService.canInitiateChat(userId, target);
      if (!permission.allowed) {
        socket.emit("error", { message: permission.reason || "Call not permitted" });
        return false;
      }
      return true;
    };

    // WebRTC Call Signaling Events
    socket.on("call-offer", async ({ receiverId, offer, callType }) => {
      try {
        const targetId = String(receiverId || "");
        if (!(await authorizeSocketCallTarget(targetId))) return;
        const caller = await storage.getUser(userId);
        io.to(targetId).emit("call-incoming", {
          callerId: userId,
          callerName: caller?.name || "User",
          offer,
          callType,
        });
      } catch (error) {
        console.error("Error forwarding call-offer:", error);
        socket.emit("error", { message: "Failed to initiate call" });
      }
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
        if (!(await authorizeSocketCallTarget(String(targetUserId || "")))) return;
        
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
        if (!(await authorizeSocketCallTarget(String(targetUserId || "")))) return;
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
        const payload = {
          messageId,
          status: "delivered",
          deliveredAt: new Date().toISOString()
        };
        // Send to both participants so each client state stays consistent
        io.to(message.senderId).emit("message_status_updated", payload);
        io.to(receiverId).emit("message_status_updated", payload);

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
        const payload = {
          messageId,
          status: "read",
          readAt: now.toISOString(),
          deliveredAt: now.toISOString()
        };
        // Send to both participants so each client state stays consistent
        io.to(message.senderId).emit("message_status_updated", payload);
        io.to(receiverId).emit("message_status_updated", payload);

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

        const permission = await chatPermissionService.canInitiateChat(senderId, receiverId);
        if (!permission.allowed) {
          socket.emit("error", { message: permission.reason || "Chat not permitted" });
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

        await messageDeliveryService.queueMessage({
          id: newMessage.id,
          senderId: newMessage.senderId,
          receiverId: newMessage.receiverId,
          message: newMessage.message,
          messageType: "text",
          emitSenderAck: false,
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
  app.get("/api/support/conversations", requireAuth, requireRoleFeature("support.view"), async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const { db } = await import("../db/index");
      const { supportConversations, supportMessages, users } = await import("@shared/schema");
      const { eq, desc, sql } = await import("drizzle-orm");

      let conversationsQuery;
      
      if (user.role === "agent" || user.role === "admin" || user.role === "super_admin") {
        // Agents and admins see all conversations
        conversationsQuery = db
          .select({
            id: supportConversations.id,
            customerId: supportConversations.customerId,
            customerName: users.name,
            customerEmail: users.email,
            customerProfileImage: users.profileImage,
            agentId: supportConversations.agentId,
            agentName: sql<string | null>`(
              select ${users.name}
              from ${users}
              where ${users.id} = ${supportConversations.agentId}
              limit 1
            )`,
            agentProfileImage: sql<string | null>`(
              select ${users.profileImage}
              from ${users}
              where ${users.id} = ${supportConversations.agentId}
              limit 1
            )`,
            agentRole: sql<string | null>`(
              select ${users.role}
              from ${users}
              where ${users.id} = ${supportConversations.agentId}
              limit 1
            )`,
            status: supportConversations.status,
            subject: supportConversations.subject,
            lastMessage: supportConversations.lastMessage,
            unreadCount: sql<number>`(
              select count(*)::int
              from ${supportMessages}
              where ${supportMessages.conversationId} = ${supportConversations.id}
                and ${supportMessages.senderId} <> ${user.id}
                and coalesce(${supportMessages.isRead}, false) = false
            )`,
            firstResponseAt: supportConversations.firstResponseAt,
            resolvedAt: supportConversations.resolvedAt,
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
            customerProfileImage: users.profileImage,
            agentId: supportConversations.agentId,
            agentName: sql<string | null>`(
              select ${users.name}
              from ${users}
              where ${users.id} = ${supportConversations.agentId}
              limit 1
            )`,
            agentProfileImage: sql<string | null>`(
              select ${users.profileImage}
              from ${users}
              where ${users.id} = ${supportConversations.agentId}
              limit 1
            )`,
            agentRole: sql<string | null>`(
              select ${users.role}
              from ${users}
              where ${users.id} = ${supportConversations.agentId}
              limit 1
            )`,
            status: supportConversations.status,
            subject: supportConversations.subject,
            lastMessage: supportConversations.lastMessage,
            unreadCount: sql<number>`(
              select count(*)::int
              from ${supportMessages}
              where ${supportMessages.conversationId} = ${supportConversations.id}
                and ${supportMessages.senderId} <> ${user.id}
                and coalesce(${supportMessages.isRead}, false) = false
            )`,
            firstResponseAt: supportConversations.firstResponseAt,
            resolvedAt: supportConversations.resolvedAt,
            createdAt: supportConversations.createdAt,
            updatedAt: supportConversations.updatedAt,
          })
          .from(supportConversations)
          .leftJoin(users, eq(supportConversations.customerId, users.id))
          .where(eq(supportConversations.customerId, user.id))
          .orderBy(desc(supportConversations.updatedAt));
      }

      const result = await conversationsQuery;
      const response = result.map((conversation: any) => {
        const maskedAgentName = resolveSupportDisplayName({
          senderRole: conversation.agentRole,
          senderName: conversation.agentName,
          viewerRole: user.role,
        });
        const shouldMaskAgentImage = shouldMaskSupportIdentityForViewer({
          senderRole: conversation.agentRole,
          viewerRole: user.role,
        });
        return {
          ...conversation,
          agentName: maskedAgentName,
          agentProfileImage: shouldMaskAgentImage ? null : conversation.agentProfileImage,
        };
      });
      res.json(response);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations", requireAuth, requireRoleFeature("support.view"), async (req: AuthRequest, res) => {
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
        isRead: false,
      });

      // Notify support staff instantly (admins, super admins, agents)
      try {
        const senderProfile = await storage.getUser(user.id);
        const senderLabel = senderProfile?.name || user.email || "A customer";
        const admins = await storage.getUsersByRole("admin");
        const superAdmins = await storage.getUsersByRole("super_admin");
        const agents = await storage.getUsersByRole("agent");
        const supportStaff = [...admins, ...superAdmins, ...agents]
          .filter((staff, idx, arr) => staff.id !== user.id && arr.findIndex((x) => x.id === staff.id) === idx);

        for (const staff of supportStaff) {
          const supportLink = staff.role === "agent"
            ? `/agent/tickets?conversationId=${conversation.id}`
            : `/admin/live-support?conversationId=${conversation.id}`;
          const ticketPreview = `${senderLabel}: ${message}`;
          await storage.createNotification({
            userId: staff.id,
            type: "message",
            title: "New Support Ticket",
            message: ticketPreview,
            metadata: { conversationId: conversation.id, customerId: user.id, link: supportLink } as any,
          });

          io.to(staff.id).emit("notification", {
            type: "message",
            title: "New Support Ticket",
            message: ticketPreview,
            data: { conversationId: conversation.id, customerId: user.id, link: supportLink },
          });
          io.to(staff.id).emit("support_conversation_updated", {
            conversationId: conversation.id,
            event: "created",
          });
        }
      } catch (notifyError) {
        console.error("Failed to notify support staff about new ticket:", notifyError);
      }

      res.json(conversation);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/support/conversations/:id/messages", requireAuth, requireRoleFeature("support.view"), async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;
      const { db } = await import("../db/index");
      const { supportMessages, supportConversations, users } = await import("@shared/schema");
      const { eq, asc, and, ne, sql } = await import("drizzle-orm");

      // Check access
      const [conversation] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (user.role !== "agent" && user.role !== "admin" && user.role !== "super_admin" && conversation.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get messages with sender info
      const messages = await db
        .select({
          id: supportMessages.id,
          senderId: supportMessages.senderId,
          senderName: users.name,
          senderRole: users.role,
          senderProfileImage: users.profileImage,
          message: supportMessages.message,
          isRead: supportMessages.isRead,
          readAt: supportMessages.readAt,
          createdAt: supportMessages.createdAt,
        })
        .from(supportMessages)
        .leftJoin(users, eq(supportMessages.senderId, users.id))
        .where(eq(supportMessages.conversationId, id))
        .orderBy(asc(supportMessages.createdAt));

      // Mark inbound unread messages as read when opened by recipient
      const now = new Date();
      await db
        .update(supportMessages)
        .set({ isRead: true, readAt: now })
        .where(
          and(
            eq(supportMessages.conversationId, id),
            ne(supportMessages.senderId, user.id),
            sql`coalesce(${supportMessages.isRead}, false) = false`
          )
        );

      const mappedMessages = messages.map((msg: any) => {
        const maskedName = resolveSupportDisplayName({
          senderRole: msg.senderRole,
          senderName: msg.senderName,
          viewerRole: user.role,
        });
        const shouldMaskImage = shouldMaskSupportIdentityForViewer({
          senderRole: msg.senderRole,
          viewerRole: user.role,
        });

        return {
          ...msg,
          senderName: maskedName,
          senderDisplayName: maskedName,
          senderProfileImage: shouldMaskImage ? null : msg.senderProfileImage,
        };
      });

      io.to(conversation.customerId).emit("support_conversation_updated", {
        conversationId: id,
        event: "read",
      });
      if (conversation.agentId) {
        io.to(conversation.agentId).emit("support_conversation_updated", {
          conversationId: id,
          event: "read",
        });
      }

      res.json(mappedMessages);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/messages", requireAuth, requireRoleFeature("support.manage"), async (req: AuthRequest, res) => {
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

      if (user.role !== "agent" && user.role !== "admin" && user.role !== "super_admin" && conversation.customerId !== user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Create message
      const [newMessage] = await db.insert(supportMessages).values({
        conversationId: id,
        senderId: user.id,
        message,
        isRead: false,
      }).returning();

      // Update conversation last message and timestamp
      const isSupportSender = isSupportStaffRole(user.role);
      const shouldSetFirstResponse = hasSupportFirstResponse({
        firstResponseAt: conversation.firstResponseAt,
        senderRole: isSupportSender ? user.role : null,
      });
      const updatedConversationData: any = { lastMessage: message, updatedAt: new Date() };
      if (!conversation.firstResponseAt && shouldSetFirstResponse && isSupportSender) {
        updatedConversationData.firstResponseAt = new Date();
      }

      await db
        .update(supportConversations)
        .set(updatedConversationData)
        .where(eq(supportConversations.id, id));

      // Notify relevant participants instantly
      try {
        const senderProfile = await storage.getUser(user.id);
        const senderName = senderProfile?.name || req.user?.email || "Support";
        const isSupportStaffSender = ["admin", "super_admin", "agent"].includes(user.role || "");
        const customerVisibleSenderName = resolveSupportDisplayName({
          senderRole: user.role,
          senderName,
          viewerRole: "buyer",
        });

        if (isSupportStaffSender) {
          const customerLink = `/support?conversationId=${id}`;
          const supportReplyPreview =
            decodeAttachmentNotificationPreview(`${customerVisibleSenderName}: ${message}`) ||
            `${customerVisibleSenderName}: ${message}`;
          await storage.createNotification({
            userId: conversation.customerId,
            type: "message",
            title: "Support Reply",
            message: supportReplyPreview,
            metadata: { conversationId: id, senderId: user.id, link: customerLink } as any,
          });

          io.to(conversation.customerId).emit("notification", {
            type: "message",
            title: "Support Reply",
            message: supportReplyPreview,
            data: { conversationId: id, senderId: user.id, link: customerLink },
          });
          io.to(conversation.customerId).emit("support_conversation_updated", {
            conversationId: id,
            event: "message",
          });
        } else {
          const admins = await storage.getUsersByRole("admin");
          const superAdmins = await storage.getUsersByRole("super_admin");
          const agents = await storage.getUsersByRole("agent");
          const supportStaff = [...admins, ...superAdmins, ...agents]
            .filter((staff, idx, arr) => staff.id !== user.id && arr.findIndex((x) => x.id === staff.id) === idx);

          for (const staff of supportStaff) {
            const supportLink = staff.role === "agent"
              ? `/agent/tickets?conversationId=${id}`
              : `/admin/live-support?conversationId=${id}`;
            const supportMessagePreview =
              decodeAttachmentNotificationPreview(`${senderName}: ${message}`) ||
              `${senderName}: ${message}`;
            await storage.createNotification({
              userId: staff.id,
              type: "message",
              title: "New Support Message",
              message: supportMessagePreview,
              metadata: { conversationId: id, customerId: user.id, link: supportLink } as any,
            });

            io.to(staff.id).emit("notification", {
              type: "message",
              title: "New Support Message",
              message: supportMessagePreview,
              data: { conversationId: id, customerId: user.id, link: supportLink },
            });
            io.to(staff.id).emit("support_conversation_updated", {
              conversationId: id,
              event: "message",
            });
          }
        }
      } catch (notifyError) {
        console.error("Failed to notify support participants:", notifyError);
      }

      // Push live refresh event to likely participants
      io.to(conversation.customerId).emit("support_conversation_updated", {
        conversationId: id,
        event: "message",
      });
      if (conversation.agentId) {
        io.to(conversation.agentId).emit("support_conversation_updated", {
          conversationId: id,
          event: "message",
        });
      }

      res.json(newMessage);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/assign", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;

      if (req.user?.role !== "agent" && req.user?.role !== "admin" && req.user?.role !== "super_admin") {
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

      if (req.user?.role !== "agent" && req.user?.role !== "admin" && req.user?.role !== "super_admin") {
        return res.status(403).json({ error: "Only agents and admins can resolve conversations" });
      }

      const { db } = await import("../db/index");
      const { supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [updated] = await db
        .update(supportConversations)
        .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
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

  app.get(
    "/api/support/analytics",
    requireAuth,
    requireRole("agent", "admin", "super_admin"),
    requirePermissionIfAdmin("view_analytics"),
    requireRoleFeatureIfRole(["agent"], "support.view"),
    async (_req: AuthRequest, res) => {
      try {
        const { db } = await import("../db/index");
        const { supportConversations } = await import("@shared/schema");
        const { eq, and, ne, isNotNull, isNull, lte, count, avg, sql } = await import("drizzle-orm");

        const [totals] = await db
          .select({
            total: count(),
            open: sql<number>`count(*) filter (where ${supportConversations.status} = 'open')::int`,
            assigned: sql<number>`count(*) filter (where ${supportConversations.status} = 'assigned')::int`,
            resolved: sql<number>`count(*) filter (where ${supportConversations.status} = 'resolved')::int`,
            unresolved: sql<number>`count(*) filter (where ${supportConversations.status} <> 'resolved')::int`,
          })
          .from(supportConversations);

        const [firstResponse] = await db
          .select({
            avgSeconds: avg(
              sql<number>`extract(epoch from (${supportConversations.firstResponseAt} - ${supportConversations.createdAt}))`
            ),
          })
          .from(supportConversations)
          .where(isNotNull(supportConversations.firstResponseAt));

        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const [backlog] = await db
          .select({ count: count() })
          .from(supportConversations)
          .where(
            and(
              ne(supportConversations.status, "resolved"),
              isNull(supportConversations.firstResponseAt),
              lte(supportConversations.createdAt, thirtyMinutesAgo)
            )
          );

        res.json({
          totals: totals || { total: 0, open: 0, assigned: 0, resolved: 0, unresolved: 0 },
          responseTime: {
            avgFirstResponseSeconds: Number(firstResponse?.avgSeconds || 0),
          },
          unresolvedBacklog: {
            over30MinutesWithoutFirstResponse: backlog?.count || 0,
          },
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  // ============ Category Fields Routes (Admin Only) ============
  app.post("/api/category-fields", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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

  app.patch("/api/category-fields/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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

  app.delete("/api/category-fields/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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
  app.post("/api/stores", requireAuth, requireRole("admin", "super_admin", "seller"), requirePermissionIfAdmin("manage_stores"), async (req: AuthRequest, res) => {
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
  app.get("/api/stores/my-store", requireAuth, requireRole("seller"), requireRoleFeature("store.manage"), async (req: AuthRequest, res) => {
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

  app.patch("/api/stores/:id", requireAuth, requireRole("admin", "super_admin", "seller"), requirePermissionIfAdmin("manage_stores"), async (req: AuthRequest, res) => {
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

  app.delete("/api/stores/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_stores"), async (req: AuthRequest, res) => {
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
  app.post("/api/categories", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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

  app.patch("/api/categories/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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

  app.delete("/api/categories/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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
  app.post("/api/admin/migrate-categories", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
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
  app.get("/api/assets/images", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_products"), async (req: AuthRequest, res) => {
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

  app.delete("/api/assets/delete", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_products"), async (req: AuthRequest, res) => {
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
  app.post("/api/reviews/:id/reply", requireAuth, requireRole("seller"), requireRoleFeature("reviews.manage"), async (req: AuthRequest, res) => {
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
      const parsedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 500;
      const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 1000)) : 500;
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

      // If this is a message notification, mark corresponding conversation as read
      // so sender receives WhatsApp-style blue ticks when recipient opens notification.
      const notificationRecord: any = notification;
      const metadata = typeof notificationRecord.metadata === "string"
        ? (() => {
            try {
              return JSON.parse(notificationRecord.metadata);
            } catch {
              return {};
            }
          })()
        : (notificationRecord.metadata || {});
      const senderId = metadata?.senderId ? String(metadata.senderId) : null;

      if (notificationRecord.type === "message" && senderId && senderId !== String(req.user!.id)) {
        const updatedMessages = await storage.markMessagesAsRead(senderId, req.user!.id);
        for (const msg of updatedMessages) {
          const payload = {
            messageId: msg.id,
            status: "read",
            readAt: msg.readAt?.toISOString?.() || new Date().toISOString(),
            deliveredAt: msg.deliveredAt?.toISOString?.() || new Date().toISOString(),
          };
          io.to(msg.senderId).emit("message_status_updated", payload);
          io.to(req.user!.id).emit("message_status_updated", payload);
        }
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
  app.post("/api/stores/:storeId/setup-paystack", requireAuth, requireRole("seller"), requireRoleFeature("store.manage"), async (req: AuthRequest, res) => {
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
        const { processPaystackChargeSuccess } = await import('./payments');
        await processPaystackChargeSuccess(event.data, storage, io);
        await startRiderMatchingForPaidOrders(extractOrderIdsFromPaymentPayload(event.data));
      }

      res.status(200).json({ status: "success" });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Admin Fix Image Paths Endpoint ============
  app.post("/api/admin/fix-image-paths", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_products"), async (req: AuthRequest, res) => {
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



