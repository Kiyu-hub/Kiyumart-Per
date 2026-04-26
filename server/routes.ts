import type { Express } from "express";
import { createServer, type Server } from "http";
import { Server as SocketIOServer } from "socket.io";
import { execFile } from "child_process";
import { promisify } from "util";
import bcrypt from "bcryptjs";
import path from "path";
import fs from "fs/promises";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import { db } from "../db";
import {
  users,
  cart,
  wishlist,
  wishlists,
  chatMessages,
  notifications,
  supportConversations,
  supportMessages,
  orders,
  orderItems,
  orderStatusHistory,
  deliveryTracking,
  deliveryAssignments,
  transactions,
  reviews,
  riderReviews,
  products,
  productVariants,
  productMedia,
  stores,
  coupons,
  promotionalAds,
  promotionPricing,
  promotionApplications,
  promotions,
  featuredListings,
  commissions,
  sellerPayouts,
  riderPayouts,
  platformEarnings,
  adminWalletTransactions,
  platformSettings as platformSettingsTable,
  footerPages as footerPagesTable,
  adminPermissions,
  passwordResetTokens,
  securitySettings,
  mediaLibrary,
  reportActivityLogs,
  systemActivityLogs,
  receipts,
} from "@shared/schema";
import { eq, or, isNotNull, isNull, and, desc, sql, inArray, asc, lte, gte } from "drizzle-orm";
import { 
  hashPassword, 
  comparePassword, 
  generateToken, 
  verifyToken,
  requireAuth, 
  requireRole,
  requireRoleAllowInactive,
  requirePermission,
  requirePermissionIfAdmin,
  requireRoleFeature,
  requireRoleFeatureIfRole,
  resolveRoleFeatures,
  type AuthRequest 
} from "./auth";
import {
  buildTrimmedCloudinaryVideoUrl,
  resetCloudinaryConfigCache,
  uploadToCloudinary,
  uploadWithMetadata,
  uploadWith4KEnhancement,
} from "./cloudinary";
import multer from "multer";
import sharp from "sharp";
import { insertUserSchema, insertProductSchema, insertDeliveryZoneSchema, insertOrderSchema, insertWishlistSchema, insertReviewSchema, insertRiderReviewSchema, insertBannerCollectionSchema, insertMarketplaceBannerSchema, insertFooterPageSchema, vehicleInfoSchema, type User } from "@shared/schema";
import {
  getStoreTypeSchema,
  getStoreTypeProductSchema,
  buildStoreTypeProductDefaults,
  type StoreType,
  STORE_TYPES,
} from "@shared/storeTypes";
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
import { getRiderRiskScore, listRiderRiskScores, recordRiderRiskSignal } from "./services/riderRiskEngine";
import { logSystemActivity } from "./observability";
import { encryptField, decryptField, isEncrypted } from "./utils/sensitiveEncrypt";
import {
  recordReferralSignup,
  checkAndCompleteReferral,
  getReferralStats,
  claimReward,
  getAdminReferralReport,
  getOrCreateReferralCode,
} from "./services/referralService";

const upload = multer({ storage: multer.memoryStorage() });
const PROFILE_IMAGE_MAX_BYTES = runtimeConfig.upload.profileImageMaxBytes;
const AUDIO_UPLOAD_MAX_BYTES = runtimeConfig.upload.audioMaxBytes;
const SUPPORT_MEDIA_MAX_BYTES = runtimeConfig.upload.supportMediaMaxBytes;
const SOCKET_VERBOSE_LOGS = process.env.SOCKET_VERBOSE_LOGS === "true";
const AUTO_DISPATCH_MINUTES = runtimeConfig.dispatch.autoDispatchMinutes;
const RIDER_OFFER_TIMEOUT_MS = 12_000;
const RIDER_MATCH_RADIUS_STEPS_KM = [3, 5, 8] as const;
const RIDER_MATCH_LIMIT = 5;
const SOFT_ZONE_DISTANCE_MARGIN_KM = 1;
const ENABLE_SOFT_ZONE_MATCH = process.env.ENABLE_SOFT_ZONE_MATCH !== "false";
const RIDER_GPS_FRESHNESS_MS = Math.max(3_000, Number(process.env.RIDER_GPS_FRESHNESS_MS || 10_000));
const RIDER_LAST_KNOWN_RETENTION_MS = Math.max(
  RIDER_GPS_FRESHNESS_MS,
  Number(process.env.RIDER_LAST_KNOWN_RETENTION_MS || 24 * 60 * 60 * 1000),
);
const RIDER_DEFAULT_MAX_CAPACITY = Math.max(1, Number(process.env.RIDER_DEFAULT_MAX_CAPACITY || 3));
const RIDER_RISK_BLOCK_THRESHOLD = Math.max(1, Number(process.env.RIDER_RISK_BLOCK_THRESHOLD || 8));
const ENABLE_NON_PROD_APPLICATION_AUTOFILL = process.env.NODE_ENV !== "production";
const CHAT_ATTACHMENT_PREFIX = "__CHAT_ATTACHMENT__:";
const SUPPORT_ATTACHMENT_PREFIX = "__SUPPORT_ATTACHMENT__:";
const execFileAsync = promisify(execFile);
const PLATFORM_AUDIT_REPORT_PATH = path.resolve(process.cwd(), "docs", "platform-audit-report.json");
const PLATFORM_AUDIT_README_PATH = path.resolve(process.cwd(), "docs", "platform-living-readme.md");

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

type MinimalSuperAdminRecord = {
  id: string;
  email: string;
  name: string;
  createdAt: Date | string | null;
  isActive: boolean | null;
};

const normalizeIdentityText = (value: unknown): string =>
  String(value || "")
    .toLowerCase()
    .trim();

const isLikelySystemIdentity = (user: Pick<MinimalSuperAdminRecord, "email" | "name">): boolean => {
  const combined = `${user.name || ""} ${user.email || ""}`.toLowerCase();
  return combined.includes("system");
};

const sortByCreatedAtAscending = (a: MinimalSuperAdminRecord, b: MinimalSuperAdminRecord) => {
  const aMs = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const bMs = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return aMs - bMs;
};

async function withStartupTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function enforceSingleSuperAdminAccount(): Promise<string | null> {
  const superAdmins = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      isActive: users.isActive,
    })
    .from(users)
    .where(eq(users.role, "super_admin"))
    .orderBy(asc(users.createdAt));

  if (superAdmins.length === 0) {
    return null;
  }

  if (superAdmins.length === 1) {
    return superAdmins[0].id;
  }

  const preferredEmail = normalizeIdentityText(process.env.SUPER_ADMIN_EMAIL);
  const sorted = [...superAdmins].sort(sortByCreatedAtAscending);
  const canonical =
    sorted.find((candidate) => preferredEmail && normalizeIdentityText(candidate.email) === preferredEmail) ||
    sorted.find((candidate) => !isLikelySystemIdentity(candidate)) ||
    sorted[0];

  const demotedIds = sorted
    .filter((candidate) => candidate.id !== canonical.id)
    .map((candidate) => candidate.id);

  if (demotedIds.length > 0) {
    await db
      .update(users)
      .set({ role: "admin", isApproved: true, isActive: true })
      .where(inArray(users.id, demotedIds));

    console.warn(
      `[SECURITY] Detected ${superAdmins.length} super_admin accounts; kept ${canonical.email} (${canonical.id}) and demoted ${demotedIds.length} duplicate(s) to admin.`,
    );
  }

  return canonical.id;
}

function resolveMessageNotificationActor(
  receiver: Pick<User, "role"> | null | undefined,
  sender: Pick<User, "id" | "role" | "name" | "email"> | null | undefined
): {
  titleSenderName: string;
  bodySenderName: string;
  senderIdMetadata: string | null;
  senderRoleMetadata: string | null;
} {
  const senderRole = String(sender?.role || "").toLowerCase().trim();
  const receiverRole = String(receiver?.role || "").toLowerCase().trim();
  const senderName = sender?.name || sender?.email || "Support";
  const shouldMask = receiverRole === "rider" && (senderRole === "agent" || senderRole === "admin" || senderRole === "super_admin");

  if (shouldMask) {
    return {
      titleSenderName: "Support Agent",
      bodySenderName: "Support Agent",
      senderIdMetadata: null,
      senderRoleMetadata: "support_agent",
    };
  }

  return {
    titleSenderName: senderName,
    bodySenderName: senderName,
    senderIdMetadata: sender?.id || null,
    senderRoleMetadata: sender?.role || null,
  };
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

function buildRouteFallbackPlatformSettings() {
  return {
    id: "default",
    isMultiVendor: false,
    platformName: "KiyuMart",
    logo: null,
    primaryColor: "#1e7b5f",
    secondaryColor: "#2c3e50",
    accentColor: "#e74c3c",
    lightBgColor: "#ffffff",
    lightTextColor: "#000000",
    darkBgColor: "#1a1a1a",
    darkTextColor: "#ffffff",
    lightCardColor: "#f8f9fa",
    darkCardColor: "#2a2a2a",
    onboardingImages: [],
    defaultCurrency: "GHS",
    mapboxPublicToken: null,
    mapboxStyleUrl: "mapbox://styles/mapbox/navigation-night-v1",
    mapboxGlVersion: "v3.4.0",
    smtpHost: null,
    smtpPort: null,
    smtpUser: null,
    smtpPass: null,
    smtpSecure: false,
    smtpFromEmail: null,
    smtpFromName: null,
    paystackPublicKey: null,
    paystackSecretKey: null,
    processingFeePercent: "1.95",
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
    adsEnabled: false,
    heroBannerEnabled: false,
    sidebarAdEnabled: false,
    footerAdEnabled: false,
    productPageAdEnabled: false,
    heroBannerAdImage: null,
    heroBannerAdUrl: null,
    sidebarAdImage: null,
    sidebarAdUrl: null,
    shopDisplayMode: "by-store",
    footerAdImage: null,
    footerAdUrl: null,
    productPageAdImage: null,
    productPageAdUrl: null,
    showAdminOperationsPanels: true,
    isExternalRiderSystemEnabled: false,
    showCheckoutDeliveryMap: true,
    allowPickupAgentAdminChat: true,
    allowSellerRegistration: true,
    allowRiderRegistration: false,
    primaryStoreId: null,
    defaultCommissionRate: "1",
    frontendUrl: null,
    updatedAt: new Date(),
  };
}

function isMaskedSecretValue(value?: string | null): boolean {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  return (
    /^[\u2022\u25CF\u25E6\u2219\u00B7*\-_\sxX]{4,}$/.test(normalized) ||
    normalized.includes("â€¢") ||
    normalized.includes("Ã¢â‚¬Â¢")
  );
}

function isValidPaystackSecretKey(value?: string | null): boolean {
  const normalized = String(value || "").trim();
  if (!normalized || isMaskedSecretValue(normalized)) return false;
  return /^sk_(test|live)_/i.test(normalized);
}

function isValidPaystackPublicKey(value?: string | null): boolean {
  const normalized = String(value || "").trim();
  if (!normalized || isMaskedSecretValue(normalized)) return false;
  return /^pk_(test|live)_/i.test(normalized);
}

function getPaystackKeyMode(value?: string | null): "test" | "live" | null {
  const normalized = String(value || "").trim().toLowerCase();
  if (/^sk_test_|^pk_test_/.test(normalized)) return "test";
  if (/^sk_live_|^pk_live_/.test(normalized)) return "live";
  return null;
}

function resolvePaystackKeyPair(settings: { paystackSecretKey?: string | null; paystackPublicKey?: string | null } | null | undefined) {
  const configuredSecret = decryptField(String(settings?.paystackSecretKey || "").trim());
  const configuredPublic = String(settings?.paystackPublicKey || "").trim();
  const envSecret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
  const envPublic = String(process.env.PAYSTACK_PUBLIC_KEY || "").trim();

  const settingsPairValid =
    isValidPaystackSecretKey(configuredSecret) &&
    isValidPaystackPublicKey(configuredPublic) &&
    getPaystackKeyMode(configuredSecret) === getPaystackKeyMode(configuredPublic);

  if (settingsPairValid) {
    return {
      secretKey: configuredSecret,
      publicKey: configuredPublic,
      secretSource: "settings" as const,
      publicSource: "settings" as const,
    };
  }

  const envPairValid =
    isValidPaystackSecretKey(envSecret) &&
    isValidPaystackPublicKey(envPublic) &&
    getPaystackKeyMode(envSecret) === getPaystackKeyMode(envPublic);

  if (envPairValid) {
    return {
      secretKey: envSecret,
      publicKey: envPublic,
      secretSource: "env" as const,
      publicSource: "env" as const,
    };
  }

  const candidatePairs = [
    {
      secretKey: configuredSecret,
      publicKey: envPublic,
      secretSource: "settings" as const,
      publicSource: "env" as const,
    },
    {
      secretKey: envSecret,
      publicKey: configuredPublic,
      secretSource: "env" as const,
      publicSource: "settings" as const,
    },
  ];

  for (const candidate of candidatePairs) {
    if (
      isValidPaystackSecretKey(candidate.secretKey) &&
      isValidPaystackPublicKey(candidate.publicKey) &&
      getPaystackKeyMode(candidate.secretKey) === getPaystackKeyMode(candidate.publicKey)
    ) {
      return candidate;
    }
  }

  return {
    secretKey: "",
    publicKey: "",
    secretSource: "missing" as const,
    publicSource: "missing" as const,
  };
}

function resolvePaystackPublicKey(settings: { paystackPublicKey?: string | null } | null | undefined): string {
  return resolvePaystackKeyPair(settings as any).publicKey;
}

function resolvePaystackSecretKey(settings: { paystackSecretKey?: string | null } | null | undefined): string {
  return resolvePaystackKeyPair(settings as any).secretKey;
}

export async function registerRoutes(app: Express): Promise<Server> {
  let canonicalSuperAdminId: string | null = null;
  try {
    canonicalSuperAdminId = await withStartupTimeout(
      enforceSingleSuperAdminAccount(),
      3000,
      "Super admin normalization",
    );
  } catch (superAdminNormalizationError) {
    console.error(
      "[SECURITY] Failed to normalize super admin accounts:",
      (superAdminNormalizationError as any)?.message || superAdminNormalizationError,
    );
  }

  const httpServer = createServer(app);

  // Build the Socket.IO allowed-origin list from the same sources as the HTTP CORS policy
  const socketIoAllowedOrigins = [
    "http://localhost:5000",
    "http://localhost:5001",
    "http://localhost:5173",
    "http://127.0.0.1:5000",
    "http://127.0.0.1:5001",
    "http://127.0.0.1:5173",
    "https://kiyumart.netlify.app",
    process.env.FRONTEND_URL,
  ].filter(Boolean) as string[];

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: (origin, callback) => {
        // Allow no-origin requests (native apps, server-to-server)
        if (!origin) return callback(null, true);
        // In dev be permissive
        if (process.env.NODE_ENV !== "production") return callback(null, true);
        const isAllowed = socketIoAllowedOrigins.some(
          (allowed) => origin === allowed || origin.startsWith(allowed.replace(/\/$/, ""))
        );
        if (isAllowed) return callback(null, true);
        callback(new Error("Socket.IO origin not allowed"));
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });
  // Share io instance so background workers can emit real-time notifications
  const { setIo: registerIo } = await import("./socketManager");
  registerIo(io);

  const resolveInitialMapProviderMode = (): "mapbox" | "open_source" => {
    const explicit = String(process.env.MAP_PROVIDER_MODE || "").toLowerCase().trim();
    if (explicit === "open_source" || explicit === "open-source" || explicit === "opensource") return "open_source";
    if (explicit === "mapbox") return "mapbox";
    const envProvider = String(process.env.VITE_MAP_PROVIDER || process.env.MAP_PROVIDER || "PROVIDER_A")
      .toUpperCase()
      .trim();
    return envProvider === "PROVIDER_B" ? "open_source" : "mapbox";
  };
  let runtimeMapProviderMode: "mapbox" | "open_source" = resolveInitialMapProviderMode();

  // ─── Maintenance Mode ─────────────────────────────────────────────────────
  // Two triggers:
  //   1. Server restart (production only — covers the deployment gap)
  //   2. Manual admin toggle via POST /api/admin/maintenance
  //
  // NOTE: The development file-change watcher was removed. On Windows,
  // fs.watch fires for file *reads* as well as writes, so tsx's own
  // compilation phase (which reads every .ts file) triggered a 30-second
  // maintenance blackout on every hot-reload. This blocked all /api/ calls
  // immediately after each restart, making data appear not to load.
  const SERVER_START_AT = Date.now();
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  // When running locally via tsx dev server, skip the 60s maintenance blackout
  // even if NODE_ENV is set to "production" in .env — it only makes sense on real deploys.
  const IS_LOCAL_DEV = process.env.KIYUMART_USE_EMBEDDED_VITE === "true" ||
    process.env.NODE_ENV === "development";

  // Production: auto-enable maintenance for 60s on restart so Render's
  // rolling deployment doesn't serve a half-ready API.
  // Development / local dev: disabled — tsx hot-reload is fast enough.
  // Override with AUTO_MAINTENANCE_DURATION_MS env var (set to 0 to disable).
  const DEFAULT_RESTART_MAINTENANCE_MS = IS_PRODUCTION && !IS_LOCAL_DEV ? 60_000 : 0;
  const AUTO_MAINTENANCE_DURATION_MS = process.env.AUTO_MAINTENANCE_DURATION_MS !== undefined
    ? Number(process.env.AUTO_MAINTENANCE_DURATION_MS)
    : DEFAULT_RESTART_MAINTENANCE_MS;

  let autoMaintenanceUntil = AUTO_MAINTENANCE_DURATION_MS > 0
    ? SERVER_START_AT + AUTO_MAINTENANCE_DURATION_MS
    : 0;
  let autoMaintenanceReason: "restart" | "file_change" | null =
    AUTO_MAINTENANCE_DURATION_MS > 0 ? "restart" : null;

  const getMaintenanceStatus = async () => {
    const now = Date.now();
    const isAutoMaintenance = autoMaintenanceUntil > 0 && now < autoMaintenanceUntil;
    const autoSecondsLeft = isAutoMaintenance ? Math.ceil((autoMaintenanceUntil - now) / 1_000) : 0;
    try {
      const settings = await storage.getPlatformSettings();
      return {
        isMaintenanceMode: !!(settings.isMaintenanceMode) || isAutoMaintenance,
        isManualMaintenance: !!(settings.isMaintenanceMode),
        isAutoMaintenance,
        autoMaintenanceReason: isAutoMaintenance ? autoMaintenanceReason : null,
        autoMaintenanceUntil: isAutoMaintenance ? new Date(autoMaintenanceUntil).toISOString() : null,
        autoSecondsLeft,
        maintenanceMessage: settings.maintenanceMessage || null,
        maintenanceStartedAt: settings.maintenanceStartedAt
          ? new Date(settings.maintenanceStartedAt).toISOString()
          : null,
        maintenanceScheduledEnd: settings.maintenanceScheduledEnd
          ? new Date(settings.maintenanceScheduledEnd).toISOString()
          : null,
      };
    } catch {
      return {
        isMaintenanceMode: isAutoMaintenance,
        isManualMaintenance: false,
        isAutoMaintenance,
        autoMaintenanceReason: isAutoMaintenance ? autoMaintenanceReason : null,
        autoMaintenanceUntil: isAutoMaintenance ? new Date(autoMaintenanceUntil).toISOString() : null,
        autoSecondsLeft,
        maintenanceMessage: null,
        maintenanceStartedAt: null,
        maintenanceScheduledEnd: null,
      };
    }
  };

  // Paths that always work, even during maintenance
  const MAINTENANCE_WHITELIST = [
    "/api/maintenance",
    "/api/health",
    "/api/auth/login",
    "/api/auth/logout",
    "/api/auth/me",
    "/api/auth/forgot-password",
    "/api/auth/reset-password",
    "/api/payments/webhook",
    "/api/payments/verify-public",
    "/api/platform-settings",
    "/api/public/",
    "/api/admin/maintenance",
  ];

  app.use(async (req, res, next) => {
    // Only enforce maintenance on API routes.
    // Non-API paths (/, /seller, /orders, etc.) always pass through so the
    // React app can load and render its own animated maintenance page.
    if (!req.path.startsWith("/api/")) return next();

    const isWhitelisted = MAINTENANCE_WHITELIST.some((p) => req.path === p || req.path.startsWith(p + "/") || req.path.startsWith(p));
    if (isWhitelisted) return next();

    const status = await getMaintenanceStatus();
    if (!status.isMaintenanceMode) return next();

    // Let admin/super_admin users through so they can operate the dashboard
    const token = req.cookies?.token || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.substring(7) : null);
    if (token) {
      const decoded = verifyToken(token) as any;
      if (decoded?.role === "admin" || decoded?.role === "super_admin") return next();
    }

    return res.status(503).json({
      error: "maintenance",
      message: status.maintenanceMessage || "The platform is currently undergoing scheduled maintenance. Please check back soon.",
      maintenanceMode: true,
      scheduledEnd: status.maintenanceScheduledEnd,
      autoEnabled: status.isAutoMaintenance,
    });
  });

  // Public maintenance status endpoint (always accessible)
  app.get("/api/maintenance/status", async (_req, res) => {
    try {
      const status = await getMaintenanceStatus();
      return res.json(status);
    } catch {
      return res.json({ isMaintenanceMode: false });
    }
  });

  // Admin: toggle maintenance mode
  app.post("/api/admin/maintenance", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      const { enable, message, scheduledEnd } = req.body as {
        enable: boolean;
        message?: string;
        scheduledEnd?: string | null;
      };

      const updatePayload: Record<string, any> = {
        isMaintenanceMode: enable,
        maintenanceMessage: message || (enable ? "The platform is currently undergoing maintenance. We'll be back shortly." : null),
        maintenanceStartedAt: enable ? new Date() : null,
        maintenanceScheduledEnd: scheduledEnd ? new Date(scheduledEnd) : null,
        maintenanceStartedBy: req.user!.id,
      };

      await storage.updatePlatformSettings(updatePayload as any);

      // Broadcast notification to all active users
      try {
        const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
        const notifTitle = enable ? "Platform Maintenance" : "Platform Back Online";
        const notifMessage = enable
          ? (message || "The platform will undergo maintenance shortly. Please save your work and complete any pending actions.")
          : "Maintenance is complete. The platform is fully operational again.";

        for (const u of allUsers) {
          if (u.role === "admin" || u.role === "super_admin") continue; // skip admins
          try {
            const notif = await storage.createNotification({
              userId: u.id,
              type: "system",
              title: notifTitle,
              message: notifMessage,
            });
            io.to(u.id).emit("notification", {
              id: notif.id,
              type: notif.type,
              title: notif.title,
              message: notif.message,
              createdAt: notif.createdAt,
              isRead: false,
            });
          } catch { /* non-critical */ }
        }
      } catch (notifErr) {
        console.warn("[MAINTENANCE] Could not broadcast notifications:", (notifErr as any)?.message);
      }

      // If auto-maintenance was running, clear it when admin manually disables
      if (!enable && autoMaintenanceUntil > Date.now()) {
        autoMaintenanceUntil = 0;
      }

      const status = await getMaintenanceStatus();
      return res.json({ success: true, ...status });
    } catch (err) {
      console.error("[MAINTENANCE] Toggle error:", (err as any)?.message || err);
      return res.status(500).json({ error: "Failed to update maintenance mode" });
    }
  });

  // Public runtime map config (safe values only) so frontend can initialize map engines
  // even when tokens are provided as server env vars instead of Vite build-time vars.
  app.get("/api/public/map-provider-config", async (_req, res) => {
    let settings: any = null;
    try {
      settings = await storage.getPlatformSettings();
    } catch {
      // Ignore settings lookup failures and fall back to env defaults.
    }

    const rawProvider = String(
      process.env.VITE_MAP_PROVIDER || process.env.MAP_PROVIDER || "PROVIDER_A",
    )
      .toUpperCase()
      .trim();
    const provider = rawProvider === "PROVIDER_B" ? "PROVIDER_B" : "PROVIDER_A";

    const tokenCandidates = [
      settings?.mapboxPublicToken,
      process.env.VITE_MAPBOX_ACCESS_TOKEN,
      process.env.MAPBOX_PUBLIC_TOKEN,
      process.env.MAPBOX_ACCESS_TOKEN,
    ];
    const safeToken =
      tokenCandidates
        .map((value) => String(value || "").trim())
        .find((token) => token.startsWith("pk.")) || "";
    const styleUrl = String(
      settings?.mapboxStyleUrl || process.env.VITE_MAPBOX_STYLE_URL || "mapbox://styles/mapbox/navigation-night-v1",
    ).trim();
    const glVersion = String(settings?.mapboxGlVersion || process.env.VITE_MAPBOX_GL_VERSION || "v3.4.0").trim();

    res.json({
      provider,
      mapboxAccessToken: safeToken,
      mapboxStyleUrl: styleUrl,
      mapboxGlVersion: glVersion,
      preferredMapMode: runtimeMapProviderMode,
    });
  });

  app.put(
    "/api/admin/map-provider-mode",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("manage_platform_settings"),
    async (req: AuthRequest, res) => {
      try {
        const requested = String(req.body?.mode || "").toLowerCase().trim();
        if (!["mapbox", "open_source", "open-source", "opensource"].includes(requested)) {
          return res.status(400).json({ error: "Invalid map mode. Use mapbox or open_source." });
        }
        runtimeMapProviderMode =
          requested === "open_source" || requested === "open-source" || requested === "opensource"
            ? "open_source"
            : "mapbox";
        io.emit("map_provider_mode_updated", {
          mode: runtimeMapProviderMode,
          updatedAt: new Date().toISOString(),
          updatedBy: req.user?.id || null,
        });
        return res.json({ mode: runtimeMapProviderMode });
      } catch (error: any) {
        return res.status(400).json({ error: error?.message || "Failed to update map provider mode" });
      }
    },
  );

  app.get(
    "/api/admin/platform-audit",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (_req: AuthRequest, res) => {
      try {
        const reportRaw = await fs.readFile(PLATFORM_AUDIT_REPORT_PATH, "utf8");
        const report = JSON.parse(reportRaw);
        const readme = await fs.readFile(PLATFORM_AUDIT_README_PATH, "utf8").catch(() => "");
        return res.json({
          ok: true,
          report,
          readme,
        });
      } catch (error: any) {
        return res.status(404).json({
          error: "Platform audit artifacts not found. Run npm run audit:platform first.",
          details: error?.message || "Unknown error",
        });
      }
    },
  );

  // POST /api/admin/verify-elevated-access
  // Super admin must re-enter password to gain elevated access for sensitive settings tabs.
  // Returns { granted: true, expiresIn: 900 } on success. Client maintains the session timer.
  app.post(
    "/api/admin/verify-elevated-access",
    requireAuth,
    requireRole("super_admin"),
    async (req: AuthRequest, res) => {
      try {
        const { password } = req.body || {};
        if (!password || typeof password !== "string") {
          return res.status(400).json({ error: "Password is required" });
        }

        const user = await storage.getUser(req.user!.id);
        if (!user || !user.password) {
          return res.status(401).json({ error: "Invalid credentials" });
        }

        const isValid = await comparePassword(password, user.password);
        if (!isValid) {
          return res.status(401).json({ error: "Incorrect password. Please try again." });
        }

        return res.json({ granted: true, expiresIn: 900 }); // 15 minutes
      } catch (error: any) {
        console.error("[ELEVATED-ACCESS] Error:", error.message);
        return res.status(500).json({ error: "Verification failed" });
      }
    },
  );

  // GET /api/admin/encryption-key-status
  // Returns whether SETTINGS_ENCRYPTION_KEY is configured on the server.
  app.get(
    "/api/admin/encryption-key-status",
    requireAuth,
    requireRole("super_admin"),
    async (_req: AuthRequest, res) => {
      const key = process.env.SETTINGS_ENCRYPTION_KEY || "";
      return res.json({ isSet: key.length > 0, keyLength: key.length });
    },
  );

  // POST /api/admin/push-to-render
  // Pushes an environment variable to a Render service via the Render API and triggers a redeploy.
  // All Render credentials are passed per-request and never stored.
  app.post(
    "/api/admin/push-to-render",
    requireAuth,
    requireRole("super_admin"),
    async (req: AuthRequest, res) => {
      const { renderApiKey, renderServiceId, envKey, envValue } = req.body || {};

      if (!renderApiKey || !renderServiceId || !envKey || !envValue) {
        return res.status(400).json({
          error: "Missing required fields: renderApiKey, renderServiceId, envKey, envValue",
        });
      }

      const renderBase = "https://api.render.com/v1";
      const headers: Record<string, string> = {
        Authorization: `Bearer ${renderApiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      };

      try {
        // 1. Fetch all existing env vars so we preserve them
        const listRes = await fetch(`${renderBase}/services/${renderServiceId}/env-vars`, { headers });
        if (!listRes.ok) {
          const errText = await listRes.text().catch(() => listRes.statusText);
          return res.status(400).json({
            error: `Render API error fetching env vars (${listRes.status}): ${errText.substring(0, 300)}`,
          });
        }
        const existing: Array<{ key: string; value: string }> = await listRes.json();

        // 2. Upsert the target env var
        const updated = existing.filter((e) => e.key !== envKey);
        updated.push({ key: envKey, value: envValue });

        // 3. PUT the full updated env var list back
        const putRes = await fetch(`${renderBase}/services/${renderServiceId}/env-vars`, {
          method: "PUT",
          headers,
          body: JSON.stringify(updated),
        });
        if (!putRes.ok) {
          const errText = await putRes.text().catch(() => putRes.statusText);
          return res.status(400).json({
            error: `Render API error updating env vars (${putRes.status}): ${errText.substring(0, 300)}`,
          });
        }

        // 4. Trigger a new deploy (so the env var takes effect immediately)
        const deployRes = await fetch(`${renderBase}/services/${renderServiceId}/deploys`, {
          method: "POST",
          headers,
          body: JSON.stringify({ clearCache: "do_not_clear" }),
        });
        const deployData = deployRes.ok ? await deployRes.json().catch(() => null) : null;

        return res.json({
          success: true,
          message: `"${envKey}" pushed to Render${deployData?.id ? ` and deploy triggered (${deployData.id})` : ""}. Your service will restart shortly.`,
          deployId: deployData?.id ?? null,
        });
      } catch (error: any) {
        console.error("[RENDER-PUSH] Error:", error.message);
        return res.status(500).json({ error: `Failed to push to Render: ${error.message}` });
      }
    },
  );

  app.get(
    "/api/agent/platform-audit",
    requireAuth,
    requireRole("agent", "admin", "super_admin"),
    requireRoleFeatureIfRole(["agent"], "support.view"),
    async (_req: AuthRequest, res) => {
      try {
        const reportRaw = await fs.readFile(PLATFORM_AUDIT_REPORT_PATH, "utf8");
        const report = JSON.parse(reportRaw);
        const readme = await fs.readFile(PLATFORM_AUDIT_README_PATH, "utf8").catch(() => "");
        return res.json({
          ok: true,
          summary: report?.summary || null,
          version: report?.version || null,
          timestamp: report?.timestamp || null,
          issues: Array.isArray(report?.issues) ? report.issues : [],
          readme,
        });
      } catch (error: any) {
        return res.status(404).json({
          error: "Platform audit artifacts not found.",
          details: error?.message || "Unknown error",
        });
      }
    },
  );

  app.post(
    "/api/admin/platform-audit/run",
    requireAuth,
    requireRole("super_admin"),
    requirePermission("manage_platform_settings"),
    async (_req: AuthRequest, res) => {
      try {
        const { stdout, stderr } = await execFileAsync(
          "npx",
          ["tsx", "scripts/generate-platform-audit.ts"],
          {
            cwd: process.cwd(),
            timeout: 180_000,
          },
        );
        const reportRaw = await fs.readFile(PLATFORM_AUDIT_REPORT_PATH, "utf8");
        const report = JSON.parse(reportRaw);
        return res.json({
          ok: true,
          report,
          stdout: String(stdout || "").trim(),
          stderr: String(stderr || "").trim(),
        });
      } catch (error: any) {
        return res.status(500).json({
          error: "Failed to run platform audit",
          details: error?.message || "Unknown error",
          stdout: String(error?.stdout || "").trim(),
          stderr: String(error?.stderr || "").trim(),
        });
      }
    },
  );

  app.get(
    "/api/admin/system-activities/summary",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (_req: AuthRequest, res) => {
      try {
        const [summary] = await db
          .select({
            totalActivities: sql<number>`COUNT(*)`,
            activeIssues: sql<number>`COUNT(*) FILTER (WHERE ${systemActivityLogs.isResolved} = false AND ${systemActivityLogs.severity} IN ('warning', 'error', 'critical'))`,
            criticalErrors: sql<number>`COUNT(*) FILTER (WHERE ${systemActivityLogs.isResolved} = false AND ${systemActivityLogs.severity} = 'critical')`,
          })
          .from(systemActivityLogs);

        return res.json({
          totalActivities: Number(summary?.totalActivities || 0),
          activeIssues: Number(summary?.activeIssues || 0),
          criticalErrors: Number(summary?.criticalErrors || 0),
        });
      } catch (error: any) {
        return res.status(500).json({ error: error?.message || "Failed to load system activity summary" });
      }
    },
  );

  app.get(
    "/api/admin/system-activities",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (req: AuthRequest, res) => {
      try {
        const limit = Math.min(500, Math.max(10, Number(req.query.limit || 100)));
        const category = String(req.query.category || "").trim();
        const severity = String(req.query.severity || "").trim();
        const status = String(req.query.status || "").trim().toLowerCase();
        const search = String(req.query.search || "").trim();

        const conditions = [];

        if (category && category !== "all") {
          conditions.push(eq(systemActivityLogs.category, category));
        }
        if (severity && severity !== "all") {
          conditions.push(eq(systemActivityLogs.severity, severity));
        }
        if (status === "open") {
          conditions.push(eq(systemActivityLogs.isResolved, false));
        } else if (status === "resolved") {
          conditions.push(eq(systemActivityLogs.isResolved, true));
        }
        if (search) {
          const searchPattern = `%${search}%`;
          conditions.push(
            sql`(
              ${systemActivityLogs.title} ILIKE ${searchPattern}
              OR ${systemActivityLogs.message} ILIKE ${searchPattern}
              OR COALESCE(${systemActivityLogs.humanExplanation}, '') ILIKE ${searchPattern}
              OR COALESCE(${systemActivityLogs.rootCause}, '') ILIKE ${searchPattern}
              OR COALESCE(${systemActivityLogs.source}, '') ILIKE ${searchPattern}
            )`,
          );
        }

        const logs = await db
          .select()
          .from(systemActivityLogs)
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(systemActivityLogs.lastSeenAt), desc(systemActivityLogs.createdAt))
          .limit(limit);

        return res.json(logs);
      } catch (error: any) {
        return res.status(500).json({ error: error?.message || "Failed to load system activities" });
      }
    },
  );

  app.patch(
    "/api/admin/system-activities/:id/resolve",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (req: AuthRequest, res) => {
      try {
        const shouldResolve = req.body?.resolved !== false;
        const [updated] = await db
          .update(systemActivityLogs)
          .set({
            isResolved: shouldResolve,
            resolvedAt: shouldResolve ? new Date() : null,
            updatedAt: new Date(),
          })
          .where(eq(systemActivityLogs.id, req.params.id))
          .returning();

        if (!updated) {
          return res.status(404).json({ error: "System activity not found" });
        }

        await logSystemActivity({
          category: "system",
          severity: "info",
          title: shouldResolve ? "System issue resolved" : "System issue reopened",
          message: `${updated.title} was ${shouldResolve ? "resolved" : "reopened"} by ${req.user?.role || "admin"}.`,
          humanExplanation: "A platform operator changed the issue state from the System Activities page.",
          source: "/api/admin/system-activities/:id/resolve",
          actorId: req.user?.id || null,
          actorRole: req.user?.role || null,
          entityType: "system_activity_log",
          entityId: updated.id,
          metadata: {
            targetActivityId: updated.id,
            targetSeverity: updated.severity,
            resolutionState: shouldResolve ? "resolved" : "open",
          },
        });

        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: error?.message || "Failed to update system activity" });
      }
    },
  );

  app.get(
    "/api/admin/system-activities/export",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (req: AuthRequest, res) => {
      try {
        const logs = await db
          .select()
          .from(systemActivityLogs)
          .orderBy(desc(systemActivityLogs.lastSeenAt), desc(systemActivityLogs.createdAt))
          .limit(1000);

        await logSystemActivity({
          category: "system",
          severity: "info",
          title: "System activities exported",
          message: `${req.user?.role || "admin"} exported ${logs.length} system activity rows.`,
          humanExplanation: "A platform operator exported the current system activity history for analysis or debugging.",
          source: "/api/admin/system-activities/export",
          actorId: req.user?.id || null,
          actorRole: req.user?.role || null,
          entityType: "system_activity_export",
          metadata: {
            exportedCount: logs.length,
            format: "json",
          },
        });

        res.setHeader("Content-Type", "application/json");
        res.setHeader("Content-Disposition", `attachment; filename="system-activities-${Date.now()}.json"`);
        return res.send(JSON.stringify(logs, null, 2));
      } catch (error: any) {
        return res.status(500).json({ error: error?.message || "Failed to export system activities" });
      }
    },
  );

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
      
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Socket authenticated: ${decoded.email} (${decoded.id})`);
      }
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
    pickup_agent: "Pickup Agent",
    agent: "Customer Agent",
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
      "Access customer-agent workspace",
      "Handle customer support tickets and conversations",
    ],
    pickup_agent: [
      "Access pickup-agent workspace",
      "Verify pickup orders assigned to pickup stations",
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

      // Enforce invite-only registration if enabled
      const regSettings = await storage.getPlatformSettings().catch(() => null);
      if (regSettings?.inviteOnlyRegistration) {
        return res.status(403).json({ error: "Registration is currently by invitation only. Please contact the platform administrator." });
      }

      // Enforce strong password for new accounts
      const pw = validatedData.password || "";
      if (pw.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters long" });
      }
      if (!/[A-Z]/.test(pw)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
      }
      if (!/[a-z]/.test(pw)) {
        return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
      }
      if (!/[0-9]/.test(pw)) {
        return res.status(400).json({ error: "Password must contain at least one number" });
      }

      const hashedPassword = await hashPassword(validatedData.password);
      
      const userData: any = {
        ...validatedData,
        role: requestedRole,
        password: hashedPassword,
        isApproved: requestedRole === "seller" || requestedRole === "rider" ? false : true,
      };
      
      const user = await storage.createUser(userData);

      // Record referral if a referral code was provided
      if (req.body.referralCode) {
        recordReferralSignup(String(req.body.referralCode).trim(), user.id).catch(() => {});
      }

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
      
      const dbUser = await storage.getUserByEmail(email);
      if (!dbUser) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const isValidPassword = await comparePassword(password, dbUser.password);
      if (!isValidPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      let user = dbUser;
      if (!user.isActive && user.role !== "seller" && user.role !== "rider") {
        return res.status(403).json({ error: "Account is inactive" });
      }

      // Safety self-heal:
      // keep unapproved seller/rider applicants in buyer role so they can still access the app
      // while their requested role remains pending for admin approval.
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

  app.post("/api/auth/forgot-password", async (req, res) => {
    try {
      const email = String(req.body?.email || "").trim().toLowerCase();

      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Enter a valid email address." });
      }

      const account = await storage.getUserByEmail(email);
      if (!account) {
        return res.status(404).json({ error: "No account found for that email address." });
      }

      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const token = `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`;
      const frontendUrl = getFrontendUrlSync();
      const resetLink = frontendUrl ? `${frontendUrl.replace(/\/$/, "")}/reset-password?token=${token}` : null;

      await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, account.id));
      await db.insert(passwordResetTokens).values({
        userId: account.id,
        token,
        expiresAt,
        createdBy: null,
      });

      await logSystemActivity({
        category: "auth",
        severity: "info",
        title: "Password reset requested",
        message: `Password reset requested for ${account.email}.`,
        humanExplanation: "A user opened the forgot-password flow and submitted their account email.",
        rootCause: "The user could not access their account password and requested a reset.",
        suggestedFix: "Review the request and continue with the password recovery process for the account owner.",
        preventiveAction: "Encourage users to keep access to their sign-in email and store passwords securely.",
        source: "/api/auth/forgot-password",
        entityType: "user",
        entityId: account.id,
        metadata: {
          email: account.email,
          expiresAt: expiresAt.toISOString(),
        },
      });

      await notifyAdmins(
        "security",
        "Password Reset Request",
        `${account.email} requested a password reset.`,
        {
          userId: account.id,
          email: account.email,
          resetRequest: true,
        },
        {
          requiredAdminPermission: "manage_users",
          includeAgents: true,
          requiredAgentFeature: "support.view",
        },
      );

      const platformSettings = await storage.getPlatformSettings();
      const platformName = String(platformSettings?.platformName || "KiyuMart").trim() || "KiyuMart";
      const supportEmail = String(platformSettings?.contactEmail || "support@kiyumart.com").trim() || "support@kiyumart.com";

      try {
        const { sendPasswordResetEmail } = await import("./email");
        if (!resetLink) {
          throw new Error("Reset link is not available");
        }
        await sendPasswordResetEmail({
          to: account.email,
          resetLink,
          platformName,
          supportEmail,
        });
      } catch (emailErr: any) {
        console.error("[AUTH] Failed to send password reset email:", emailErr?.message || emailErr);
        return res.status(503).json({
          error: "Email service is not configured",
          userMessage: "We could not send the reset email right now. Please contact support.",
        });
      }

      return res.json({
        success: true,
        message: "Password reset email sent.",
        resetLink: process.env.NODE_ENV === "production" ? undefined : resetLink,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to submit password reset request." });
    }
  });

  app.post("/api/auth/reset-password", async (req, res) => {
    try {
      const token = String(req.body?.token || "").trim();
      const newPassword = String(req.body?.newPassword || "");

      if (!token || !newPassword) {
        return res.status(400).json({ error: "Reset token and new password are required." });
      }

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

      const [resetToken] = await db
        .select()
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, token))
        .limit(1);

      if (!resetToken || resetToken.usedAt) {
        return res.status(400).json({ error: "This reset link is no longer valid." });
      }

      const expiresAt = resetToken.expiresAt ? new Date(resetToken.expiresAt) : null;
      if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
        return res.status(400).json({ error: "This reset link has expired. Please request a new one." });
      }

      const account = await storage.getUser(resetToken.userId);
      if (!account) {
        return res.status(404).json({ error: "Account not found." });
      }

      const hashedPassword = await hashPassword(newPassword);
      await db.update(users).set({ password: hashedPassword }).where(eq(users.id, account.id));
      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, resetToken.id));

      await logSystemActivity({
        category: "auth",
        severity: "info",
        title: "Password reset completed",
        message: `Password reset completed for ${account.email}.`,
        humanExplanation: "A user successfully reset their account password using a reset link.",
        rootCause: "Account password was reset through the forgot-password flow.",
        suggestedFix: "Confirm the account owner can sign in with their new password.",
        preventiveAction: "Encourage strong, unique passwords and enable account recovery steps.",
        source: "/api/auth/reset-password",
        entityType: "user",
        entityId: account.id,
        metadata: {
          email: account.email,
        },
      });

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error?.message || "Failed to reset password." });
    }
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
      const rawMessage = String(error?.message || "");
      console.error("[ORDERS] Checkout creation failed:", rawMessage, error);
      if (
        rawMessage.includes("invalid input value for enum order_status") &&
        rawMessage.includes("created")
      ) {
        return res.status(409).json({
          error: "Checkout state is out of date",
          userMessage: "Your checkout session was out of date. Please refresh the page and try again.",
        });
      }
      res.status(400).json({ error: rawMessage });
    }
  });

  app.get("/api/profile/export", requireAuth, async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const { password, ...safeUser } = user;

      const settledValue = <T,>(result: PromiseSettledResult<T>, fallback: T): T =>
        result.status === "fulfilled" ? result.value : fallback;

      const [
        userStore,
        userOrders,
        userCart,
        userWishlist,
        userNotifications,
        userSupportConversations,
      ] = await Promise.allSettled([
        user.role === "seller"
          ? db.select().from(stores).where(eq(stores.primarySellerId, userId)).limit(1).then((rows) => rows[0] || null)
          : Promise.resolve(null),
        storage.getOrdersByUser(userId, "buyer"),
        db.select().from(cart).where(eq(cart.userId, userId)).orderBy(desc(cart.createdAt)),
        storage.getWishlist(userId),
        storage.getNotificationsByUser(userId, 500),
        db
          .select()
          .from(supportConversations)
          .where(eq(supportConversations.customerId, userId))
          .orderBy(desc(supportConversations.updatedAt)),
      ]);

      const safeUserStore = settledValue(userStore, null);
      const safeUserOrders = settledValue(userOrders, []);
      const safeUserCart = settledValue(userCart, []);
      const safeUserWishlist = settledValue(userWishlist, []);
      const safeUserNotifications = settledValue(userNotifications, []);
      const safeUserSupportConversations = settledValue(userSupportConversations, []);

      const orderIds = Array.from(new Set(safeUserOrders.map((order) => order.id).filter(Boolean)));
      const supportConversationIds = Array.from(
        new Set(safeUserSupportConversations.map((conversation) => conversation.id).filter(Boolean)),
      );
      const cartProductIds = safeUserCart.map((item) => item.productId).filter(Boolean);
      const wishlistProductIds = safeUserWishlist.map((item) => item.productId).filter(Boolean);

      const [allOrderItems, allOrderStatusHistory, allSupportMessages, cartProducts, wishlistProducts] =
        await Promise.allSettled([
          orderIds.length > 0
            ? db
                .select({
                  id: orderItems.id,
                  orderId: orderItems.orderId,
                  productId: orderItems.productId,
                  quantity: orderItems.quantity,
                  price: orderItems.price,
                  productName: products.name,
                  productImage: products.images,
                })
                .from(orderItems)
                .leftJoin(products, eq(orderItems.productId, products.id))
                .where(inArray(orderItems.orderId, orderIds))
                .orderBy(asc(orderItems.id))
            : Promise.resolve([]),
          orderIds.length > 0
            ? db
                .select()
                .from(orderStatusHistory)
                .where(inArray(orderStatusHistory.orderId, orderIds))
                .orderBy(asc(orderStatusHistory.createdAt))
            : Promise.resolve([]),
          supportConversationIds.length > 0
            ? db
                .select()
                .from(supportMessages)
                .where(inArray(supportMessages.conversationId, supportConversationIds))
                .orderBy(asc(supportMessages.createdAt))
            : Promise.resolve([]),
          cartProductIds.length > 0
            ? db
                .select({
                  id: products.id,
                  name: products.name,
                  image: products.images,
                  price: products.price,
                  categoryId: products.categoryId,
                })
                .from(products)
                .where(inArray(products.id, Array.from(new Set(cartProductIds))))
            : Promise.resolve([]),
          wishlistProductIds.length > 0
            ? db
                .select({
                  id: products.id,
                  name: products.name,
                  image: products.images,
                  price: products.price,
                  categoryId: products.categoryId,
                })
                .from(products)
                .where(inArray(products.id, Array.from(new Set(wishlistProductIds))))
            : Promise.resolve([]),
        ]);

      const safeOrderItems = settledValue(allOrderItems, []);
      const safeOrderStatusHistory = settledValue(allOrderStatusHistory, []);
      const safeSupportMessages = settledValue(allSupportMessages, []);
      const safeCartProducts = settledValue(cartProducts, []);
      const safeWishlistProducts = settledValue(wishlistProducts, []);

      const cartProductMap = new Map(safeCartProducts.map((product) => [product.id, product]));
      const wishlistProductMap = new Map(safeWishlistProducts.map((product) => [product.id, product]));

      const orderItemsByOrder = new Map<string, any[]>();
      for (const item of safeOrderItems) {
        const bucket = orderItemsByOrder.get(item.orderId) || [];
        bucket.push({
          id: item.id,
          productId: item.productId,
          productName: item.productName || "Unknown Product",
          productImage: item.productImage || null,
          quantity: item.quantity,
          price: item.price,
        });
        orderItemsByOrder.set(item.orderId, bucket);
      }

      const orderHistoryByOrder = new Map<string, any[]>();
      for (const entry of safeOrderStatusHistory) {
        const bucket = orderHistoryByOrder.get(entry.orderId) || [];
        bucket.push(entry);
        orderHistoryByOrder.set(entry.orderId, bucket);
      }

      const supportMessagesByConversation = new Map<string, any[]>();
      for (const message of safeSupportMessages) {
        const bucket = supportMessagesByConversation.get(message.conversationId) || [];
        bucket.push(message);
        supportMessagesByConversation.set(message.conversationId, bucket);
      }

      const exportPayload = {
        exportedAt: new Date().toISOString(),
        account: safeUser,
        store: safeUserStore,
        cart: safeUserCart.map((item) => ({
          ...item,
          product: cartProductMap.get(item.productId) || null,
        })),
        wishlist: safeUserWishlist.map((item) => ({
          ...item,
          product: wishlistProductMap.get(item.productId) || null,
        })),
        notifications: safeUserNotifications,
        orders: safeUserOrders.map((order) => ({
          ...order,
          items: orderItemsByOrder.get(order.id) || [],
          statusHistory: orderHistoryByOrder.get(order.id) || [],
        })),
        supportConversations: safeUserSupportConversations.map((conversation) => ({
          ...conversation,
          messages: supportMessagesByConversation.get(conversation.id) || [],
        })),
      };

      const safeName = String(user.name || "account")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "account";
      const fileName = `kiyumart-data-export-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.status(200).send(JSON.stringify(exportPayload, null, 2));
    } catch (error: any) {
      console.error("Profile export failed:", error);
      res.status(500).json({ error: "Could not prepare your data export right now" });
    }
  });

  app.patch("/api/profile", requireAuth, async (req: AuthRequest, res) => {
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
        'profileImage',
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

      const currentUser = await storage.getUser(req.user!.id);
      const currentRole = String(currentUser?.role || "").toLowerCase();

      // Only sellers should be able to update seller-store fields from the profile route.
      if (currentRole !== "seller") {
        delete updateData.storeType;
        delete updateData.storeTypeMetadata;
        delete updateData.storeName;
        delete updateData.storeDescription;
        delete updateData.storeBanner;
      }

      // Treat blank store type from stale forms as "not updating store type" instead of failing the whole profile save.
      if ("storeType" in updateData && !String(updateData.storeType || "").trim()) {
        delete updateData.storeType;
      }

      if ("storeTypeMetadata" in updateData && !("storeType" in updateData) && currentRole !== "seller") {
        delete updateData.storeTypeMetadata;
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

      // Keep seller profile fields synchronized with the seller store record.
      if (updatedUser.role === "seller") {
        const shouldSyncSellerStore =
          ("storeType" in updateData) ||
          ("storeTypeMetadata" in updateData) ||
          ("profileImage" in updateData) ||
          ("storeName" in updateData) ||
          ("storeDescription" in updateData) ||
          ("storeBanner" in updateData);

        if (shouldSyncSellerStore) {
          try {
            const existingStore = await storage.getStoreByPrimarySeller(req.user!.id);
            if (existingStore) {
              const storeUpdate: Record<string, any> = {};
              if ("storeType" in updateData && updateData.storeType) {
                storeUpdate.storeType = updateData.storeType;
              }
              if ("storeTypeMetadata" in updateData && updateData.storeTypeMetadata !== undefined) {
                storeUpdate.storeTypeMetadata = updateData.storeTypeMetadata || existingStore.storeTypeMetadata;
              }
              if ("storeName" in updateData) {
                storeUpdate.name = typeof updateData.storeName === "string"
                  ? updateData.storeName.trim()
                  : updateData.storeName;
              }
              if ("storeDescription" in updateData) {
                storeUpdate.description = updateData.storeDescription || "";
              }
              if ("storeBanner" in updateData) {
                const normalizedBanner = typeof updateData.storeBanner === "string"
                  ? updateData.storeBanner.trim()
                  : "";
                storeUpdate.banner = normalizedBanner || null;
              }
              if ("profileImage" in updateData) {
                const normalizedLogo = typeof updateData.profileImage === "string"
                  ? updateData.profileImage.trim()
                  : "";
                storeUpdate.logo = normalizedLogo || null;
              }

              if (Object.keys(storeUpdate).length > 0) {
                await storage.updateStore(existingStore.id, storeUpdate);
              }
            }
          } catch (storeUpdateError: any) {
            console.error("Failed to sync seller profile fields to store record:", storeUpdateError);
            // Don't fail the profile update if store sync fails.
          }
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

      if (updatedUser.role === "seller") {
        try {
          const existingStore = await storage.getStoreByPrimarySeller(updatedUser.id);
          if (existingStore) {
            await storage.updateStore(existingStore.id, { logo: imageUrl });
          }
        } catch (profileSyncError) {
          console.error("Failed syncing seller profile upload to store logo:", profileSyncError);
        }
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json({ profileImage: imageUrl, user: userWithoutPassword });
    } catch (error: any) {
      console.error("Profile image upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload profile image" });
    }
  });

  const DIRECT_VIDEO_EXTENSIONS = [".mp4", ".webm", ".ogg", ".mov", ".m4v"] as const;

  const isDirectVideoUrl = (value: string) => {
    const normalized = String(value || "").trim().toLowerCase();
    return DIRECT_VIDEO_EXTENSIONS.some((ext) => normalized.includes(ext));
  };

  const decodeEscapedVideoUrl = (value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    try {
      return JSON.parse(`"${normalized.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
        .replace(/&amp;/g, "&")
        .trim();
    } catch {
      return normalized.replace(/\\u002F/g, "/").replace(/\\\//g, "/").replace(/&amp;/g, "&").trim();
    }
  };

  const extractFirstMatch = (html: string, patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      const candidate = decodeEscapedVideoUrl(match?.[1] || "");
      if (candidate && /^https?:\/\//i.test(candidate)) {
        return candidate;
      }
    }
    return "";
  };

  app.get("/api/video-source", async (req, res) => {
    try {
      const rawUrl = String(req.query?.url || "").trim();
      if (!rawUrl) {
        return res.status(400).json({ error: "Video URL is required" });
      }

      let parsed: URL;
      try {
        parsed = new URL(rawUrl);
      } catch {
        return res.status(400).json({ error: "Invalid video URL" });
      }

      if (!["http:", "https:"].includes(parsed.protocol)) {
        return res.status(400).json({ error: "Only HTTP and HTTPS video links are supported" });
      }

      const host = parsed.hostname.toLowerCase();
      const provider =
        host.includes("tiktok.com")
          ? "tiktok"
          : host.includes("youtube.com") || host.includes("youtu.be")
            ? "youtube"
            : host.includes("vimeo.com")
              ? "vimeo"
              : host.includes("instagram.com")
                ? "instagram"
                : host.includes("facebook.com") || host.includes("fb.watch")
                  ? "facebook"
              : isDirectVideoUrl(rawUrl)
                ? "direct"
                : "unknown";

      if (isDirectVideoUrl(rawUrl)) {
        return res.json({ playbackUrl: rawUrl, provider: "direct", posterUrl: null });
      }

      const response = await fetch(rawUrl, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return res.status(422).json({ error: "Could not load this video page" });
      }

      const html = await response.text();
      const playbackUrl = extractFirstMatch(html, [
        /"playAddr":"([^"]+)"/,
        /"playAddrH264":"([^"]+)"/,
        /"downloadAddr":"([^"]+)"/,
        /<meta[^>]+property=["']og:video:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:video:url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:video["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
        /<source[^>]+src=["']([^"']+)["']/i,
        /<video[^>]+src=["']([^"']+)["']/i,
      ]);
      const posterUrl = extractFirstMatch(html, [
        /<meta[^>]+property=["']og:image:secure_url["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      ]);

      if (!playbackUrl) {
        return res.status(422).json({
          error: "We could not extract a clean in-app video source from this link. Try a direct video file or upload the video.",
        });
      }

      return res.json({
        playbackUrl,
        posterUrl: posterUrl || null,
        provider,
      });
    } catch (error: any) {
      console.error("Video source resolve error:", error);
      return res.status(500).json({ error: error.message || "Failed to prepare video playback" });
    }
  });

  // Generic image upload endpoint (for admins/sellers)
  // Public upload endpoint for registration (seller/rider Ghana cards, profile images)
  app.post("/api/upload/public", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "Please upload an image file" });
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size is 10MB" });
      }

      // Normalize orientation at upload time so ID/profile cards render correctly downstream.
      let uploadBuffer = req.file.buffer;
      let uploadMimeType = req.file.mimetype;
      if (req.file.mimetype !== "image/gif") {
        try {
          const autoOriented = await sharp(req.file.buffer).rotate().toBuffer();
          const orientedMeta = await sharp(autoOriented).metadata();
          const orientedWidth = orientedMeta.width || 0;
          const orientedHeight = orientedMeta.height || 0;

          // Ghana/ID cards should be landscape in admin review surfaces.
          uploadBuffer = orientedHeight > orientedWidth
            ? await sharp(autoOriented).rotate(90).toBuffer()
            : autoOriented;
        } catch (orientationError) {
          console.warn("Public image orientation normalization skipped:", orientationError);
          uploadBuffer = req.file.buffer;
          uploadMimeType = req.file.mimetype;
        }
      }

      try {
        const imageUrl = await uploadToCloudinary(uploadBuffer, "kiyumart/registration");
        return res.json({ url: imageUrl, provider: "cloudinary" });
      } catch (cloudinaryError: any) {
        console.warn("Public image upload cloud provider failed, using local fallback:", cloudinaryError?.message || cloudinaryError);
        const localUrl = await persistPublicUploadLocally(uploadBuffer, uploadMimeType);
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

      if (!req.file.mimetype.startsWith("image/")) {
        return res.status(400).json({ error: "Please upload an image file" });
      }

      const maxSize = 10 * 1024 * 1024; // 10MB
      if (req.file.size > maxSize) {
        return res.status(400).json({ error: "File too large. Maximum size is 10MB" });
      }

      try {
        const metadata = await sharp(req.file.buffer).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        
        const result = await uploadWith4KEnhancement(
          req.file.buffer, 
          "kiyumart/uploads", 
          width, 
          height
        );
        
        return res.json({ 
          url: result.url, 
          width: result.width, 
          height: result.height,
          enhanced: result.enhanced 
        });
      } catch (enhancementError: any) {
        console.warn("Image enhancement skipped, falling back to standard upload:", enhancementError?.message || enhancementError);
        const imageUrl = await uploadToCloudinary(req.file.buffer, "kiyumart/uploads");
        return res.json({ url: imageUrl, width: null, height: null, enhanced: false });
      }
    } catch (error: any) {
      console.error("Image upload error:", error);
      res.status(500).json({ error: error.message || "Failed to upload image" });
    }
  });

  // Generic video upload endpoint (for admins/sellers)
  app.post("/api/upload/video", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No video file provided" });
      }

      if (!String(req.file.mimetype || "").toLowerCase().startsWith("video/")) {
        return res.status(400).json({ error: "Invalid file type. Please upload a video file." });
      }

      const result = await uploadWithMetadata(req.file.buffer, "kiyumart/videos");

      const optimizedUrl =
        result.duration && result.duration > 30
          ? buildTrimmedCloudinaryVideoUrl(result.url, 30)
          : result.url;

      res.json({
        url: optimizedUrl,
        originalUrl: result.url,
        duration: result.duration,
        trimmed: Boolean(result.duration && result.duration > 30),
      });
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
          const allRoles = ["admin", "buyer", "seller", "rider", "pickup_agent", "agent"];
          users = [];
          for (const r of allRoles) {
            const roleUsers = await storage.getUsersByRole(r);
            users.push(...roleUsers);
          }
          const roleQuery = String(role || "").toLowerCase();
          const appStatusQuery = String(applicationStatus || "").toLowerCase();
          const includeRequestedRoleByStatus = !appStatusQuery;
          users = users.filter((u: any) => {
            const currentRole = String(u.role || "").toLowerCase();
            const requestedRole = String(u.requestedRole || "").toLowerCase();
            const appStatus = String((u as any).applicationStatus || "").toLowerCase();

            if (currentRole === roleQuery) {
              // Hide unapproved rejected application accounts from operational role management lists.
              if (!u.isApproved && appStatus === "rejected") return false;
              return true;
            }

            if (requestedRole === roleQuery) {
              if (includeRequestedRoleByStatus) {
                return appStatus === "pending" || appStatus === "interview_scheduled";
              }
              return true;
            }

            return false;
          });
        } else {
          users = await storage.getUsersByRole(role as string);
        }
      } else {
        // Get all users including admins
        const allRoles = ["admin", "buyer", "seller", "rider", "pickup_agent", "agent"];
        users = [];
        for (const r of allRoles) {
          const roleUsers = await storage.getUsersByRole(r);
          users.push(...roleUsers);
        }
      }
      
      // Apply additional filters
      if (isApproved !== undefined) {
        const isApprovedBool = isApproved === "true";
        const roleQuery = String(role || "").toLowerCase();
        const appStatusQuery = String(applicationStatus || "").toLowerCase();
        const isRoleApplicationListing =
          (roleQuery === "seller" || roleQuery === "rider") &&
          (appStatusQuery === "pending" || appStatusQuery === "interview_scheduled");

        users = users.filter((u: any) => {
          // For seller/rider application queues, an applicant can be currently approved
          // in their existing role (e.g., buyer) while still pending for requestedRole.
          // Treat that as "not approved for requested role" to keep them visible.
          if (isRoleApplicationListing) {
            const requestedRole = String(u.requestedRole || "").toLowerCase();
            const currentRole = String(u.role || "").toLowerCase();
            const pendingForRequestedRole = requestedRole === roleQuery && currentRole !== roleQuery;
            const effectiveApproved = pendingForRequestedRole ? false : Boolean(u.isApproved);
            return effectiveApproved === isApprovedBool;
          }
          return Boolean(u.isApproved) === isApprovedBool;
        });
      }
      
      if (applicationStatus) {
        users = users.filter(u => u.applicationStatus === applicationStatus);

        const roleQuery = String(role || "").toLowerCase();
        const appStatusQuery = String(applicationStatus || "").toLowerCase();
        const isPendingQueue =
          (roleQuery === "seller" || roleQuery === "rider") &&
          (appStatusQuery === "pending" || appStatusQuery === "interview_scheduled");

        // Prevent approved operational accounts from being shown in pending application queues,
        // even if stale applicationStatus data exists.
        if (isPendingQueue) {
          users = users.filter((u: any) => !(String(u.role || "").toLowerCase() === roleQuery && Boolean(u.isApproved)));
        }
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

  const deriveCityAndRegionFromAddress = (address?: string | null): { city: string; region: string } => {
    const parts = String(address || "")
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const city = parts[0] || "";
    const regionMatch = parts.find((part) => /region/i.test(part)) || parts[1] || parts[2] || "";

    return { city, region: regionMatch };
  };

  const normalizeVehicleType = (value?: string | null): "car" | "motorcycle" | undefined => {
    const normalized = String(value || "").toLowerCase().trim();
    if (!normalized) return undefined;
    if (normalized.includes("car") || normalized.includes("van") || normalized.includes("truck")) return "car";
    if (
      normalized.includes("motor") ||
      normalized.includes("bike") ||
      normalized.includes("bicycle") ||
      normalized.includes("cycle")
    ) {
      return "motorcycle";
    }
    return undefined;
  };

  const hydratePendingRiderApplicationFields = async (user: User): Promise<User> => {
    if (!ENABLE_NON_PROD_APPLICATION_AUTOFILL) return user;

    const updateData: Record<string, unknown> = {};
    const appStatus = String((user as any).applicationStatus || "").toLowerCase();
    const requestedRole = String((user as any).requestedRole || "").toLowerCase();
    const currentRole = String(user.role || "").toLowerCase();
    const isPendingRiderApplication =
      (requestedRole === "rider" || currentRole === "rider") &&
      (appStatus === "pending" || appStatus === "interview_scheduled");

    if (!isPendingRiderApplication) return user;

    const cityRaw = String((user as any).riderCity || "").trim();
    const regionRaw = String((user as any).riderRegion || "").trim();
    const { city: fallbackCity, region: fallbackRegion } = deriveCityAndRegionFromAddress(user.businessAddress);

    const resolvedCity = cityRaw || fallbackCity || "Accra";
    const resolvedRegion = regionRaw || fallbackRegion || "Greater Accra Region";

    if (!cityRaw && resolvedCity) updateData.riderCity = resolvedCity;
    if (!regionRaw && resolvedRegion) updateData.riderRegion = resolvedRegion;

    const existingVehicleInfo = (typeof (user as any).vehicleInfo === "object" && (user as any).vehicleInfo)
      ? { ...(user as any).vehicleInfo }
      : {};

    const existingVehicleType = normalizeVehicleType(
      String(existingVehicleInfo.type || (user as any).vehicleType || "").trim()
    );
    if (!existingVehicleType) {
      // Backfill legacy pending rider records with a safe default type so approval can proceed.
      existingVehicleInfo.type = "motorcycle";
      const parsedVehicle = vehicleInfoSchema.safeParse(existingVehicleInfo);
      if (parsedVehicle.success) {
        updateData.vehicleInfo = parsedVehicle.data as any;
      }
    }

    const willHaveZone = Boolean((user as any).deliveryZoneId || updateData.deliveryZoneId);
    if (!willHaveZone && (resolvedCity || resolvedRegion)) {
      const zones = await storage.getDeliveryZones();
      const normalize = (value?: string | null) => (value || "").toLowerCase().trim();
      const city = normalize(resolvedCity);
      const region = normalize(resolvedRegion);

      if (city) {
        const cityZone = zones.find((z: any) => normalize(z.city) === city || normalize(z.name) === city);
        if (cityZone?.id) updateData.deliveryZoneId = cityZone.id;
      }

      if (!updateData.deliveryZoneId && region) {
        const regionZone = zones.find((z: any) => normalize(z.region) === region || normalize(z.name) === region);
        if (regionZone?.id) updateData.deliveryZoneId = regionZone.id;
      }
    }

    if (Object.keys(updateData).length === 0) return user;
    const updated = await storage.updateUser(user.id, updateData as any);
    return (updated as User) || user;
  };

  const hydratePendingSellerApplicationFields = async (user: User): Promise<User> => {
    if (!ENABLE_NON_PROD_APPLICATION_AUTOFILL) return user;

    const updateData: Record<string, unknown> = {};
    const appStatus = String((user as any).applicationStatus || "").toLowerCase();
    const requestedRole = String((user as any).requestedRole || "").toLowerCase();
    const currentRole = String(user.role || "").toLowerCase();
    const isPendingSellerApplication =
      (requestedRole === "seller" || currentRole === "seller") &&
      (appStatus === "pending" || appStatus === "interview_scheduled");

    if (!isPendingSellerApplication) return user;

    const storeType = String((user as any).storeType || "").toLowerCase().trim();
    if (!storeType || !STORE_TYPES.includes(storeType as StoreType)) {
      updateData.storeType = "clothing" as StoreType;
    }

    if (!String((user as any).storeName || "").trim()) {
      updateData.storeName = `${String(user.name || "Seller").trim() || "Seller"} Store`;
    }
    if (!String((user as any).storeDescription || "").trim()) {
      updateData.storeDescription = `Welcome to ${String(user.name || "our")} store.`;
    }

    if (Object.keys(updateData).length === 0) return user;
    const updated = await storage.updateUser(user.id, updateData as any);
    return (updated as User) || user;
  };

  app.patch("/api/users/:id/approve", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
    try {
      // First, get the user without approving yet
      let user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const targetRole = (user as any).requestedRole || user.role;
      if (targetRole !== "seller" && targetRole !== "rider") {
        return res.status(400).json({ error: "User does not have a pending seller/rider application" });
      }

      // CRITICAL: Validate role-specific requirements before approval
      if (targetRole === "seller") {
        user = await hydratePendingSellerApplicationFields(user);
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
        user = await hydratePendingRiderApplicationFields(user);
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
        io.emit(`seller-approved:${approvedUser.id}`, {
          sellerId: approvedUser.id,
          timestamp: new Date().toISOString()
        });
      }

      // Transactional email — application approved (best-effort)
      if (approvedUser.email) {
        try {
          const ps = await storage.getPlatformSettings().catch(() => null);
          const pName = ps?.platformName || "KiyuMart";
          const frontendUrl = process.env.FRONTEND_URL || "";
          const dashLink = targetRole === "seller" ? `${frontendUrl}/seller` : `${frontendUrl}/rider`;
          const emailSubject = `${pName}: Your ${approvedRoleLabel} Application is Approved!`;
          const emailText = [
            `Dear ${approvedUser.name || "Applicant"},`,
            "",
            `Congratulations! Your ${approvedRoleLabel} application has been approved.`,
            `You can now access your ${approvedRoleLabel} dashboard: ${dashLink}`,
            "",
            `— ${pName}`,
          ].join("\n");
          const emailHtml = `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
              <h2 style="color:#10b981;">Application Approved 🎉</h2>
              <p>Dear ${approvedUser.name || "Applicant"},</p>
              <p>Congratulations! Your <strong>${approvedRoleLabel}</strong> application has been approved.</p>
              <p style="margin:24px 0;">
                <a href="${dashLink}" style="background:#10b981;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;display:inline-block;">Go to Your Dashboard</a>
              </p>
              <p style="font-size:13px;color:#64748b;">— ${pName}</p>
            </div>`.trim();
          const { sendEmail } = await import("./email");
          await sendEmail({ to: approvedUser.email, subject: emailSubject, text: emailText, html: emailHtml });
        } catch {
          // non-critical
        }
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

      // Generate a dedicated Jitsi room for this interview
      const interviewRoomName = `kiyumart-interview-${updatedUser.id.slice(0, 8)}-${interviewDate.getTime()}`;
      const sanitizedRoom = interviewRoomName.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-");
      const interviewCallUrl = `https://meet.jit.si/${sanitizedRoom}`;

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
            label: "Video Call Link",
            value: `Join via video call at the scheduled time: ${interviewCallUrl}`,
          },
          {
            label: "Next Steps",
            value: "Please be available at the scheduled time. The interviewer will initiate the call, or you may join using the link above.",
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
          interviewCallUrl,
          link: "/profile",
        } as any,
      });

      io.to(updatedUser.id).emit("notification", {
        type: "default",
        title: `${roleLabel} Interview Scheduled`,
        message: `Your interview is scheduled for ${formattedDate}. A video call link has been sent to you.`,
      });

      // Transactional email — interview scheduled (best-effort)
      if (updatedUser.email) {
        try {
          const ps = await storage.getPlatformSettings().catch(() => null);
          const pName = ps?.platformName || "KiyuMart";
          const emailSubject = `${pName}: Your ${roleLabel} Interview is Scheduled`;
          const emailText = [
            `Dear ${updatedUser.name || "Applicant"},`,
            "",
            `Your ${roleLabel} application interview has been scheduled for:`,
            formattedDate,
            "",
            "Join the video call at the scheduled time using this link:",
            interviewCallUrl,
            "",
            "The interviewer may also initiate the call directly. Please be available at the scheduled time.",
            "",
            `— ${pName}`,
          ].join("\n");
          const emailHtml = `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
              <h2>Interview Scheduled</h2>
              <p>Dear ${updatedUser.name || "Applicant"},</p>
              <p>Your <strong>${roleLabel}</strong> application interview has been scheduled for:</p>
              <p style="font-size:18px;font-weight:bold;color:#10b981;">${formattedDate}</p>
              <p>Join the video call at the scheduled time:</p>
              <p style="margin:16px 0;">
                <a href="${interviewCallUrl}" style="background:#10b981;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block;">Join Video Call</a>
              </p>
              <p style="font-size:13px;color:#64748b;">The interviewer may also initiate the call directly. Please be available at the scheduled time.</p>
              <p style="font-size:13px;color:#64748b;">— ${pName}</p>
            </div>`.trim();
          const { sendEmail } = await import("./email");
          await sendEmail({ to: updatedUser.email, subject: emailSubject, text: emailText, html: emailHtml });
        } catch {
          // non-critical
        }
      }

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

      const requestedRole = String((user as any).requestedRole || "").toLowerCase();
      const currentRole = String(user.role || "").toLowerCase();
      const applicationRole =
        requestedRole === "seller" || requestedRole === "rider"
          ? requestedRole
          : currentRole === "seller" || currentRole === "rider"
            ? currentRole
            : "";
      const applicationStatus = String((user as any).applicationStatus || "").toLowerCase();

      if (!applicationRole) {
        return res.status(400).json({ error: "User does not have a seller/rider application to reject" });
      }

      // Reject only pending/interview applications. Approved applications should be deactivated instead.
      const approvedForApplicationRole =
        applicationStatus === "approved" || (currentRole === applicationRole && Boolean(user.isApproved));
      if (approvedForApplicationRole) {
        return res.status(400).json({
          error: "Cannot reject already approved applications. Use deactivate instead."
        });
      }

      if (applicationStatus && applicationStatus !== "pending" && applicationStatus !== "interview_scheduled") {
        return res.status(400).json({ error: `Cannot reject application with status '${applicationStatus}'` });
      }

      // Mark as rejected but keep account active so user can see rejection and reapply.
      // Preserve existing approval for the user's current role (e.g., approved buyer applying for rider).
      const rejectedUser = await storage.updateUser(req.params.id, {
        isActive: true, // Explicitly keep account active
        applicationStatus: "rejected" as any,
        interviewScheduledAt: null,
        interviewScheduledBy: null,
        rejectionReason: reason || null
      });
      
      if (!rejectedUser) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const rejectedRole = applicationRole as string;
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

      // Transactional email — application rejected (best-effort)
      if (rejectedUser.email) {
        try {
          const ps = await storage.getPlatformSettings().catch(() => null);
          const pName = ps?.platformName || "KiyuMart";
          const emailSubject = `${pName}: Update on your ${rejectedRoleLabel} application`;
          const reasonLine = reason?.trim() ? `\n\nReason: ${reason.trim()}` : "";
          const emailText = [
            `Dear ${rejectedUser.name || "Applicant"},`,
            "",
            `We have reviewed your ${rejectedRoleLabel} application and are unable to approve it at this time.${reasonLine}`,
            "",
            "If you have questions, please contact our support team.",
            "",
            `— ${pName}`,
          ].join("\n");
          const emailHtml = `
            <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;">
              <h2>Application Update</h2>
              <p>Dear ${rejectedUser.name || "Applicant"},</p>
              <p>We have reviewed your <strong>${rejectedRoleLabel}</strong> application and are unable to approve it at this time.</p>
              ${reason?.trim() ? `<p><strong>Reason:</strong> ${reason.trim()}</p>` : ""}
              <p>If you have questions, please contact our support team.</p>
              <p style="font-size:13px;color:#64748b;">— ${pName}</p>
            </div>`.trim();
          const { sendEmail } = await import("./email");
          await sendEmail({ to: rejectedUser.email, subject: emailSubject, text: emailText, html: emailHtml });
        } catch {
          // non-critical
        }
      }

      console.info(`User ${user.id} (${rejectedRole}) pending application rejected by admin`);
      const { password, ...userWithoutPassword } = rejectedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error rejecting user application:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.delete(
    "/api/admin/applications/:id",
    requireAuth,
    requireRole("super_admin"),
    requirePermission("manage_users"),
    async (req: AuthRequest, res) => {
      try {
        const user = await storage.getUser(req.params.id);
        if (!user) {
          return res.status(404).json({ error: "User not found" });
        }

        const requestedRole = String((user as any).requestedRole || "").toLowerCase();
        const currentRole = String(user.role || "").toLowerCase();
        const applicationRole =
          requestedRole === "seller" || requestedRole === "rider"
            ? requestedRole
            : currentRole === "seller" || currentRole === "rider"
              ? currentRole
              : "";
        const applicationStatus = String((user as any).applicationStatus || "").toLowerCase();

        if (!applicationRole) {
          return res.status(400).json({ error: "User does not have a seller/rider application record" });
        }

        if (applicationStatus !== "rejected") {
          return res.status(400).json({ error: "Only rejected applications can be removed from the queue" });
        }

        const updateData: Record<string, any> = {
          requestedRole: null,
          applicationStatus: null,
          rejectionReason: null,
          interviewScheduledAt: null,
          interviewScheduledBy: null,
        };

        // If this account is an unapproved operational-role shell, revert it to buyer.
        if ((currentRole === "seller" || currentRole === "rider") && !user.isApproved) {
          updateData.role = "buyer";
        }

        const updatedUser = await storage.updateUser(req.params.id, updateData as any);
        if (!updatedUser) {
          return res.status(404).json({ error: "User not found" });
        }

        const roleLabel = ROLE_LABELS[applicationRole] || applicationRole;
        await storage.createNotification({
          userId: updatedUser.id,
          type: "system",
          title: `${roleLabel} Application Record Cleared`,
          message:
            `Your rejected ${roleLabel.toLowerCase()} application record was removed by platform administration. ` +
            `Your account remains active and you can submit a new application when ready.`,
          metadata: {
            role: applicationRole,
            status: "cleared",
            link: applicationRole === "seller" ? "/become-seller" : "/become-rider",
          } as any,
        });

        const { password, ...userWithoutPassword } = updatedUser;
        res.json({
          success: true,
          message: "Rejected application removed. User account remains active.",
          user: userWithoutPassword,
        });
      } catch (error: any) {
        console.error("Error clearing rejected application:", error);
        res.status(400).json({ error: error.message || "Failed to clear rejected application" });
      }
    },
  );

  app.patch("/api/users/:id/status", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req, res) => {
    try {
      const { isActive } = req.body;
      const normalizedReason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      const user = await storage.getUser(req.params.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      if (!isActive && (user.role === "seller" || user.role === "rider") && !normalizedReason) {
        return res.status(400).json({ error: "Deactivation reason is required" });
      }

      if (!isActive && (user.role === "seller" || user.role === "rider")) {
        const { db } = await import("../db/index");
        const { supportConversations, supportMessages } = await import("@shared/schema");
        const { eq, inArray } = await import("drizzle-orm");

        const previousAppeals = await db
          .select({ id: supportConversations.id, subject: supportConversations.subject })
          .from(supportConversations)
          .where(eq(supportConversations.customerId, req.params.id));

        const appealConversationIds = previousAppeals
          .filter((conversation) => String(conversation.subject || "").startsWith("Account Reactivation Appeal"))
          .map((conversation) => conversation.id);

        if (appealConversationIds.length > 0) {
          await db.delete(supportMessages).where(inArray(supportMessages.conversationId, appealConversationIds));
          await db.delete(supportConversations).where(inArray(supportConversations.id, appealConversationIds));
        }
      }
      
      // If deactivating an approved seller, also deactivate their store
      if (!isActive && user.role === "seller" && user.isApproved) {
        const store = await storage.getStoreByPrimarySeller(req.params.id);
        if (store) {
          await storage.updateStore(store.id, { isActive: false, isApproved: false });
          console.info(`[STORE] Deactivated ${store.id} seller ${req.params.id}`);
        }
      }
      
      // If reactivating an approved seller, also reactivate their store
      if (isActive && user.role === "seller" && user.isApproved) {
        const store = await storage.getStoreByPrimarySeller(req.params.id);
        if (store) {
          await storage.updateStore(store.id, { isActive: true, isApproved: true });
          console.info(`[STORE] Reactivated ${store.id} seller ${req.params.id}`);
        }
      }
      
      const updatePayload: Record<string, any> = { isActive };
      if (user.role === "seller" || user.role === "rider") {
        updatePayload.rejectionReason = isActive
          ? null
          : (normalizedReason || user.rejectionReason || "Account deactivated by admin");
      }

      const updatedUser = await storage.updateUser(req.params.id, updatePayload);
      if (!updatedUser) {
        return res.status(404).json({ error: "User not found" });
      }

      try {
        const isSellerOrRider = updatedUser.role === "seller" || updatedUser.role === "rider";
        const dashboardLink = updatedUser.role === "seller"
          ? "/support"
          : updatedUser.role === "rider"
            ? "/support"
            : "/";
        const message = isActive
          ? "Your account has been reactivated. You can access your dashboard again."
          : isSellerOrRider
            ? `Your account was deactivated by admin. Reason: ${updatePayload.rejectionReason}`
            : "Your account status was updated by admin.";

        await storage.createNotification({
          userId: updatedUser.id,
          type: "system",
          title: isActive ? "Account Reactivated" : "Account Deactivated",
          message,
          metadata: {
            reason: updatePayload.rejectionReason || null,
            link: dashboardLink,
          } as any,
        });

        io.to(updatedUser.id).emit("support_conversation_updated", {
          conversationId: null,
          event: isActive ? "account_reactivated" : "account_deactivated",
        });
      } catch (notificationError) {
        console.error("Failed to create account status notification:", notificationError);
      }

      const { password, ...userWithoutPassword } = updatedUser;
      res.json(userWithoutPassword);
    } catch (error: any) {
      console.error("Error updating user status:", error);
      res.status(400).json({ error: error.message });
    }
  });

  // Toggle premium seller status — upgrades or downgrades a seller's listing tier
  app.patch("/api/users/:id/toggle-premium-seller", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_users"), async (req: AuthRequest, res) => {
    try {
      const targetUser = await storage.getUser(req.params.id);
      if (!targetUser) return res.status(404).json({ error: "User not found" });
      if (targetUser.role !== "seller") return res.status(400).json({ error: "Only sellers can have a premium tier" });

      const newValue = !(targetUser as any).isPremiumSeller;
      const updated = await storage.updateUser(req.params.id, { isPremiumSeller: newValue } as any);
      if (!updated) return res.status(500).json({ error: "Update failed" });

      try {
        await storage.createNotification({
          userId: req.params.id,
          type: "system",
          title: newValue ? "Premium Seller Activated" : "Premium Seller Deactivated",
          message: newValue
            ? "Your account has been upgraded to Premium Seller — you can now list unlimited products on the platform."
            : "Your Premium Seller status has been removed. Your listings are now subject to the platform free tier limit.",
          metadata: {} as any,
        });
      } catch { /* non-critical */ }

      const { password, ...safe } = updated;
      res.json(safe);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ── Seller self-service upgrade ─────────────────────────────────────────
  // plan: "plan_a" (GHS 15, +10 slots), "plan_b" (GHS 40/mo, unlimited monthly),
  //       "plan_c" (GHS 100 one-time, unlimited permanent), "premium_seller" (legacy)
  app.post("/api/seller/upgrade/initialize", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const seller = await storage.getUser(req.user!.id);
      if (!seller) return res.status(404).json({ error: "User not found" });

      const plan: string = req.body?.plan || "premium_seller";
      const settings = await storage.getPlatformSettings();
      const { decryptField } = await import("./utils/sensitiveEncrypt");
      const rawSecret = settings?.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY || "";
      const paystackSecretKey = decryptField(rawSecret);
      if (!paystackSecretKey) return res.status(503).json({ error: "Payment gateway not configured" });

      let amountGhs: number;
      let upgradeType: string;
      let planLabel: string;

      if (plan === "plan_a") {
        amountGhs = Number((settings as any)?.upgradePlanAPrice ?? 15);
        upgradeType = "seller_plan_a";
        planLabel = "Plan A — Extra Slots";
      } else if (plan === "plan_b") {
        amountGhs = Number((settings as any)?.upgradePlanBPrice ?? 40);
        upgradeType = "seller_plan_b";
        planLabel = "Plan B — Monthly Unlimited";
      } else if (plan === "plan_c") {
        amountGhs = Number((settings as any)?.upgradePlanCPrice ?? 100);
        upgradeType = "seller_plan_c";
        planLabel = "Plan C — Unlimited Forever";
      } else {
        // Legacy premium_seller path
        if ((seller as any).isPremiumSeller) return res.status(400).json({ error: "You are already a premium seller" });
        amountGhs = (settings as any)?.sellerUpgradeFeeGhs ? Number((settings as any).sellerUpgradeFeeGhs) : 5000;
        upgradeType = "premium_seller";
        planLabel = "Premium Seller";
      }

      const amountKobo = Math.round(amountGhs * 100);
      const reference = `upgrade-${plan}-${req.user!.id}-${Date.now()}`;

      const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackSecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: seller.email,
          amount: amountKobo,
          currency: "GHS",
          reference,
          metadata: {
            upgradeType,
            sellerId: req.user!.id,
            sellerName: seller.name,
            planLabel,
          },
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        return res.status(502).json({ error: err?.message || "Payment gateway error" });
      }

      const initData = await initRes.json();
      if (!initData.status) return res.status(502).json({ error: initData.message || "Payment initialization failed" });

      const rawPublicKey = settings?.paystackPublicKey || process.env.PAYSTACK_PUBLIC_KEY || "";
      const { decryptField: decryptPub } = await import("./utils/sensitiveEncrypt");
      const publicKey = decryptPub(rawPublicKey) || rawPublicKey;

      res.json({
        reference,
        accessCode: initData.data.access_code,
        authorizationUrl: initData.data.authorization_url,
        amountGhs,
        publicKey,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ── Seller self-service promotion payment ──────────────────────────────
  app.post("/api/seller/promotions/initialize", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const seller = await storage.getUser(req.user!.id);
      if (!seller) return res.status(404).json({ error: "User not found" });

      const { type, targetId, durationType, duration, sellerNote } = req.body;
      if (!type || !targetId || !durationType || !duration) {
        return res.status(400).json({ error: "type, targetId, durationType, and duration are required" });
      }

      // Look up the pricing row
      const [pricing] = await db
        .select()
        .from(promotionPricing)
        .where(
          and(
            eq(promotionPricing.type, type),
            eq(promotionPricing.durationType, durationType),
            eq(promotionPricing.duration, Number(duration)),
            eq(promotionPricing.isActive, true),
          ),
        )
        .limit(1);
      if (!pricing) return res.status(404).json({ error: "No active pricing found for this selection" });

      const totalPrice = Number(pricing.price) * Number(duration);
      const amountKobo = Math.round(totalPrice * 100);

      const settings = await storage.getPlatformSettings();
      const { decryptField } = await import("./utils/sensitiveEncrypt");
      const rawSecret = settings?.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY || "";
      const paystackSecretKey = decryptField(rawSecret);
      if (!paystackSecretKey) return res.status(503).json({ error: "Payment gateway not configured" });

      // Get target name for the record
      let targetName = targetId;
      try {
        if (type === "store") {
          const store = await db.select({ name: stores.name }).from(stores).where(eq(stores.id, targetId)).limit(1);
          if (store[0]) targetName = store[0].name;
        } else {
          const prod = await db.select({ name: products.name }).from(products).where(eq(products.id, targetId)).limit(1);
          if (prod[0]) targetName = prod[0].name;
        }
      } catch { /* best-effort */ }

      // Create the application record immediately (pending_payment)
      const [application] = await db
        .insert(promotionApplications)
        .values({
          sellerId: req.user!.id,
          type,
          targetId,
          targetName,
          durationType,
          duration: Number(duration),
          unitPrice: pricing.price,
          totalPrice: String(totalPrice),
          sellerNote: sellerNote || null,
          status: "pending_payment",
        })
        .returning();

      const reference = `promo-${application.id}-${Date.now()}`;

      const initRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${paystackSecretKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: seller.email,
          amount: amountKobo,
          currency: "GHS",
          reference,
          metadata: {
            upgradeType: "seller_promotion",
            sellerId: req.user!.id,
            sellerName: seller.name,
            applicationId: application.id,
            promoType: type,
            targetId,
            targetName,
            durationType,
            duration: Number(duration),
            totalPrice,
          },
        }),
      });

      if (!initRes.ok) {
        const err = await initRes.json().catch(() => ({}));
        return res.status(502).json({ error: err?.message || "Payment gateway error" });
      }

      const initData = await initRes.json();
      if (!initData.status) return res.status(502).json({ error: initData.message || "Payment initialization failed" });

      // Store the reference on the application
      await db
        .update(promotionApplications)
        .set({ updatedAt: new Date() } as any)
        .where(eq(promotionApplications.id, application.id));

      const rawPublicKey = settings?.paystackPublicKey || process.env.PAYSTACK_PUBLIC_KEY || "";
      const { decryptField: decryptPub } = await import("./utils/sensitiveEncrypt");
      const publicKey = decryptPub(rawPublicKey) || rawPublicKey;

      res.json({
        reference,
        applicationId: application.id,
        accessCode: initData.data.access_code,
        authorizationUrl: initData.data.authorization_url,
        amountGhs: totalPrice,
        publicKey,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

      // Platform policy: exactly one super admin account.
      if (validatedData.role === "super_admin") {
        const existingSuperAdmins = await storage.getUsersByRole("super_admin");
        if (existingSuperAdmins.length > 0) {
          return res.status(400).json({
            error: "Only one super admin account is allowed on this platform",
          });
        }
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
            
            const newStore = await storage.createStore(storeData);
            
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
        "profileImage",
        "role",
        "isActive",
        "isApproved",
        "vehicleInfo",
        "storeType",
        "storeName",
        "storeDescription",
        "storeBanner",
        "nationalIdCard",
        "ghanaCardFront",
        "ghanaCardBack",
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
        ? (() => {
            const rawRequestedRole = String(updateData.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
            return rawRequestedRole === "superadmin" ? "super_admin" : rawRequestedRole;
          })()
        : normalizedCurrentRole;
      const roleChanged = typeof updateData.role === "string" && normalizedRequestedRole !== normalizedCurrentRole;

      if (
        normalizedCurrentRole === "super_admin" &&
        roleChanged &&
        normalizedRequestedRole !== "super_admin"
      ) {
        const existingSuperAdmins = await storage.getUsersByRole("super_admin");
        if (existingSuperAdmins.length <= 1) {
          return res.status(400).json({
            error: "Platform requires one super admin account. Reassign another user to super admin first.",
          });
        }
      }

      if (typeof updateData.role === "string") {
        updateData.role = normalizedRequestedRole;
      }

      if (normalizedRequestedRole === "super_admin" && roleChanged) {
        const existingSuperAdmins = await storage.getUsersByRole("super_admin");
        const otherSuperAdmin = existingSuperAdmins.find((u: any) => String(u.id) !== String(req.params.id));
        if (otherSuperAdmin) {
          return res.status(400).json({
            error: "Only one super admin account is allowed on this platform",
          });
        }
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

      // Keep seller profile fields in sync with the seller store record.
      if (user.role === "seller") {
        try {
          const existingStore = await storage.getStoreByPrimarySeller(user.id);
          if (existingStore) {
            const storeUpdate: Record<string, any> = {};
            if ("storeType" in updateData && updateData.storeType) {
              storeUpdate.storeType = updateData.storeType;
            }
            if ("storeName" in updateData) {
              storeUpdate.name = typeof updateData.storeName === "string"
                ? updateData.storeName.trim()
                : updateData.storeName;
            }
            if ("storeDescription" in updateData) {
              storeUpdate.description = updateData.storeDescription || "";
            }
            if ("storeBanner" in updateData) {
              const normalizedBanner = typeof updateData.storeBanner === "string"
                ? updateData.storeBanner.trim()
                : "";
              storeUpdate.banner = normalizedBanner || null;
            }
            if ("profileImage" in updateData) {
              const normalizedLogo = typeof updateData.profileImage === "string"
                ? updateData.profileImage.trim()
                : "";
              storeUpdate.logo = normalizedLogo || null;
            }
            if (Object.keys(storeUpdate).length > 0) {
              await storage.updateStore(existingStore.id, storeUpdate);
            }
          }
        } catch (storeSyncError) {
          console.error("Failed syncing seller admin updates to store:", storeSyncError);
        }
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

      if (user.role === "super_admin") {
        const existingSuperAdmins = await storage.getUsersByRole("super_admin");
        if (existingSuperAdmins.length <= 1) {
          return res.status(400).json({
            error: "Platform requires one super admin account. Create or promote another super admin first.",
          });
        }
      }

      console.info(`[ADMIN] Hard delete started user ${req.params.id} (${user.role})`);
      
      // Execute all deletes in a transaction for data integrity
      await db.transaction(async (tx) => {
        const userId = req.params.id;

        // Collect support conversations tied to this account.
        const conversationRows = await tx
          .select({ id: supportConversations.id })
          .from(supportConversations)
          .where(
            or(
              eq(supportConversations.customerId, userId),
              eq(supportConversations.agentId, userId),
              eq(supportConversations.lastSupportResponderId, userId),
            ),
          );
        const conversationIds = conversationRows.map((c) => c.id);

        // Collect order IDs where this user is buyer/seller/rider.
        const orderRows = await tx
          .select({ id: orders.id })
          .from(orders)
          .where(
            or(eq(orders.buyerId, userId), eq(orders.sellerId, userId), eq(orders.riderId, userId)),
          );
        const orderIds = orderRows.map((o) => o.id);

        // Collect products owned by seller account (if any).
        const productRows = await tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sellerId, userId));
        const productIds = productRows.map((p) => p.id);

        // Collect seller stores.
        const sellerStoreRows = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.primarySellerId, userId));
        const sellerStoreIds = sellerStoreRows.map((s) => s.id);

        // Support/chat clean-up.
        await tx.delete(chatMessages).where(or(eq(chatMessages.senderId, userId), eq(chatMessages.receiverId, userId)));
        await tx.delete(supportMessages).where(eq(supportMessages.senderId, userId));
        if (conversationIds.length > 0) {
          await tx.delete(supportMessages).where(inArray(supportMessages.conversationId, conversationIds));
          await tx.delete(supportConversations).where(inArray(supportConversations.id, conversationIds));
        }

        // User-tied clean-up.
        await tx.delete(cart).where(eq(cart.userId, userId));
        await tx.delete(wishlist).where(eq(wishlist.userId, userId));
        await tx.delete(wishlists).where(eq(wishlists.userId, userId));
        await tx.delete(notifications).where(eq(notifications.userId, userId));
        await tx.delete(transactions).where(eq(transactions.userId, userId));
        await tx.delete(reviews).where(eq(reviews.userId, userId));
        await tx.delete(riderReviews).where(or(eq(riderReviews.userId, userId), eq(riderReviews.riderId, userId)));
        await tx.delete(passwordResetTokens).where(or(eq(passwordResetTokens.userId, userId), eq(passwordResetTokens.createdBy, userId)));
        await tx.delete(securitySettings).where(eq(securitySettings.userId, userId));
        await tx.delete(mediaLibrary).where(eq(mediaLibrary.uploaderId, userId));
        await tx.delete(promotionalAds).where(eq(promotionalAds.createdBy, userId));
        await tx.delete(coupons).where(eq(coupons.sellerId, userId));
        await tx.delete(commissions).where(eq(commissions.sellerId, userId));
        await tx.delete(sellerPayouts).where(or(eq(sellerPayouts.sellerId, userId), eq(sellerPayouts.processedBy, userId)));
        await tx
          .delete(riderPayouts)
          .where(
            or(
              eq(riderPayouts.riderId, userId),
              eq(riderPayouts.approvedBy, userId),
              eq(riderPayouts.processedBy, userId),
              eq(riderPayouts.rejectedBy, userId),
            ),
          );
        await tx.delete(promotions).where(or(eq(promotions.sellerId, userId), eq(promotions.promotedBy, userId)));
        await tx.delete(featuredListings).where(eq(featuredListings.sellerId, userId));
        await tx.delete(adminWalletTransactions).where(eq(adminWalletTransactions.adminId, userId));

        // Product/store clean-up for sellers.
        if (productIds.length > 0) {
          await tx.delete(cart).where(inArray(cart.productId, productIds));
          await tx.delete(wishlist).where(inArray(wishlist.productId, productIds));
          await tx.delete(wishlists).where(inArray(wishlists.productId, productIds));
          await tx.delete(reviews).where(inArray(reviews.productId, productIds));
          await tx.delete(orderItems).where(inArray(orderItems.productId, productIds));
          await tx.delete(productVariants).where(inArray(productVariants.productId, productIds));
          await tx.delete(productMedia).where(inArray(productMedia.productId, productIds));
          await tx.delete(promotions).where(inArray(promotions.productId, productIds));
          await tx.delete(featuredListings).where(inArray(featuredListings.productId, productIds));
          await tx.delete(products).where(inArray(products.id, productIds));
        }

        if (sellerStoreIds.length > 0) {
          await tx.delete(stores).where(inArray(stores.id, sellerStoreIds));
        }

        // Order dependency clean-up.
        if (orderIds.length > 0) {
          await tx.delete(orderItems).where(inArray(orderItems.orderId, orderIds));
          await tx.delete(deliveryTracking).where(inArray(deliveryTracking.orderId, orderIds));
          await tx.delete(deliveryAssignments).where(inArray(deliveryAssignments.orderId, orderIds));
          await tx.delete(orderStatusHistory).where(inArray(orderStatusHistory.orderId, orderIds));
          await tx.delete(transactions).where(inArray(transactions.orderId, orderIds));
          await tx.delete(riderReviews).where(inArray(riderReviews.orderId, orderIds));
          await tx.delete(reviews).where(inArray(reviews.orderId, orderIds));
          await tx.delete(platformEarnings).where(inArray(platformEarnings.orderId, orderIds));
          await tx.delete(commissions).where(inArray(commissions.orderId, orderIds));
          await tx.delete(riderPayouts).where(inArray(riderPayouts.orderId, orderIds));
          await tx.delete(orders).where(inArray(orders.id, orderIds));
        }

        // Remove status history entries authored by this user on orders not owned by the user.
        await tx.delete(orderStatusHistory).where(eq(orderStatusHistory.changedBy, userId));

        // Finally, delete the user.
        await tx.delete(users).where(eq(users.id, userId));
      });
      
      console.info(`[ADMIN] Hard delete completed user ${req.params.id}`);
      res.json({ success: true, message: "User and all related data deleted successfully" });
    } catch (error: any) {
      console.error("Error deleting user:", error);
      const detail = error?.detail ? ` (${error.detail})` : "";
      res.status(400).json({ error: `${error.message || "Failed to delete user"}${detail}` });
    }
  });

  app.post(
    "/api/admin/applications/purge-pending",
    requireAuth,
    requireRole("super_admin"),
    requirePermission("manage_users"),
    async (req, res) => {
      try {
        if (process.env.NODE_ENV === "production") {
          return res.status(403).json({
            error: "Clear pending queue is disabled in production environments.",
          });
        }
        const pendingStatuses = ["pending", "interview_scheduled"] as const;
        const roleTargets = ["seller", "rider"] as const;

        const candidates = await db
          .select({
            id: users.id,
            role: users.role,
            isApproved: users.isApproved,
            requestedRole: users.requestedRole,
            applicationStatus: users.applicationStatus,
          })
          .from(users)
          .where(
            and(
              inArray(users.applicationStatus as any, pendingStatuses as any),
              or(
                inArray(users.requestedRole as any, roleTargets as any),
                and(inArray(users.role as any, roleTargets as any), eq(users.isApproved, false)),
              ),
            ),
          );

        const toClear = candidates.filter((u) => Boolean(u.isApproved));
        const toDelete = candidates.filter((u) => !u.isApproved);

        if (toClear.length) {
          const clearIds = toClear.map((u) => u.id);
          await db
            .update(users)
            .set({
              requestedRole: null,
              applicationStatus: "approved" as any,
              rejectionReason: null,
              interviewScheduledAt: null,
              interviewScheduledBy: null,
            })
            .where(inArray(users.id, clearIds));
        }

        if (toDelete.length) {
          await db.transaction(async (tx) => {
            for (const applicant of toDelete) {
              const applicantId = applicant.id;
              await tx
                .delete(chatMessages)
                .where(or(eq(chatMessages.senderId, applicantId), eq(chatMessages.receiverId, applicantId)));
              await tx.delete(cart).where(eq(cart.userId, applicantId));
              await tx.delete(wishlist).where(eq(wishlist.userId, applicantId));
              await tx.delete(notifications).where(eq(notifications.userId, applicantId));

              if (String(applicant.role || "").toLowerCase() === "seller") {
                const sellerStores = await tx
                  .select({ id: stores.id })
                  .from(stores)
                  .where(eq(stores.primarySellerId, applicantId));
                for (const store of sellerStores) {
                  await tx.delete(products).where(eq(products.storeId, store.id));
                  await tx.delete(stores).where(eq(stores.id, store.id));
                }
              }

              await tx.delete(orders).where(or(eq(orders.buyerId, applicantId), eq(orders.riderId, applicantId)));
              await tx.delete(users).where(eq(users.id, applicantId));
            }
          });
        }

        res.json({
          success: true,
          totalFound: candidates.length,
          clearedApproved: toClear.length,
          deletedUnapproved: toDelete.length,
        });
      } catch (error: any) {
        console.error("Error purging pending applications:", error);
        res.status(400).json({ error: error.message || "Failed to purge pending applications" });
      }
    },
  );

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
          if (existingStatus === "rejected") {
            const hashedPassword = await bcrypt.hash(password, 10);
            const normalizedExistingRole = existingRole.toLowerCase();
            const nextRole =
              (normalizedExistingRole === "seller" || normalizedExistingRole === "rider") && !(existingUser as any).isApproved
                ? "buyer"
                : existingUser.role;

            const updatedUser = await storage.updateUser(existingUser.id, {
              ...userData,
              password: hashedPassword,
              role: nextRole as any,
              requestedRole: "seller",
              applicationStatus: "pending" as any,
              rejectionReason: null,
              interviewScheduledAt: null,
              interviewScheduledBy: null,
            } as any);

            if (!updatedUser) {
              return res.status(500).json({ error: "Failed to resubmit seller application" });
            }

            await notifyAdmins(
              "user",
              "Resubmitted seller application",
              `${updatedUser.name} has re-applied to become a seller`,
              { userId: updatedUser.id, role: "seller", link: `/admin/applications?userId=${updatedUser.id}&role=seller` },
              {
                requiredAdminPermission: "manage_users",
                includeAgents: true,
                requiredAgentFeature: "users.view",
              }
            );

            const { password: _, ...userWithoutPassword } = updatedUser;
            return res.json(userWithoutPassword);
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
          if (existingStatus === "rejected") {
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

            if (rawUserData.vehicleInfo) {
              const parsedVehicle = vehicleInfoSchema.safeParse(rawUserData.vehicleInfo);
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

              userData.vehicleInfo = parsedVehicle.data as { type: string; plateNumber?: string; license?: string; color?: string };
            }

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
            const normalizedExistingRole = existingRole.toLowerCase();
            const nextRole =
              (normalizedExistingRole === "seller" || normalizedExistingRole === "rider") && !(existingUser as any).isApproved
                ? "buyer"
                : existingUser.role;

            const updatedUser = await storage.updateUser(existingUser.id, {
              ...userData,
              password: hashedPassword,
              role: nextRole as any,
              requestedRole: "rider",
              applicationStatus: "pending" as any,
              rejectionReason: null,
              interviewScheduledAt: null,
              interviewScheduledBy: null,
            } as any);

            if (!updatedUser) {
              return res.status(500).json({ error: "Failed to resubmit rider application" });
            }

            await notifyAdmins(
              "user",
              "Resubmitted rider application",
              `${updatedUser.name} has re-applied to become a delivery rider`,
              { userId: updatedUser.id, role: "rider", link: `/admin/applications?userId=${updatedUser.id}&role=rider` },
              {
                requiredAdminPermission: "manage_users",
                includeAgents: true,
                requiredAgentFeature: "users.view",
              }
            );

            const { password: _, ...userWithoutPassword } = updatedUser;
            return res.json(userWithoutPassword);
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
  const normalizeProductDynamicFieldsForStore = (storeType: StoreType | null | undefined, rawDynamicFields: any) => {
    const currentDynamicFields =
      rawDynamicFields && typeof rawDynamicFields === "object" && !Array.isArray(rawDynamicFields)
        ? rawDynamicFields
        : {};

    if (!storeType) {
      return currentDynamicFields;
    }

    const normalizedStoreSpecific = buildStoreTypeProductDefaults(storeType, currentDynamicFields.storeSpecific);
    getStoreTypeProductSchema(storeType).parse(normalizedStoreSpecific);

  return {
    ...currentDynamicFields,
    storeType: storeType || currentDynamicFields.storeType || null,
    storeSpecific: normalizedStoreSpecific,
  };
};

  app.post("/api/products", requireAuth, requireRole("seller"), requireRoleFeature("products.create"), upload.fields([
    { name: "images", maxCount: 5 },
    { name: "video", maxCount: 1 }
  ]), async (req: AuthRequest, res) => {
    try {
      // Enforce product listing limits (free-tier vs upgrade plan sellers)
      const prodSettings = await storage.getPlatformSettings().catch(() => null);
      const sellerRecord = await storage.getUser(req.user!.id);
      const isPremium = (sellerRecord as any)?.isPremiumSeller === true;
      const sellerUpgradePlan: string | null = (sellerRecord as any)?.sellerUpgradePlan ?? null;
      const sellerPlanExpiresAt: Date | null = (sellerRecord as any)?.sellerPlanExpiresAt ?? null;
      const sellerBonusSlots: number = Number((sellerRecord as any)?.sellerBonusSlots ?? 0);
      const [{ cnt }] = await db.select({ cnt: sql<number>`count(*)` }).from(products).where(eq(products.sellerId, req.user!.id));
      const currentCount = Number(cnt);
      // Hard ceiling (applies to everyone)
      const hardMax = Number(prodSettings?.maxProductsPerSeller || 0);
      if (hardMax > 0 && currentCount >= hardMax) {
        return res.status(403).json({ error: `You have reached the platform maximum of ${hardMax} products.` });
      }
      // Determine effective soft limit based on upgrade plan
      const freeTierLimit = Number(prodSettings?.freeTierProductLimit ?? 20);
      const planBExpired = sellerUpgradePlan === "plan_b" && sellerPlanExpiresAt && new Date() > new Date(sellerPlanExpiresAt);
      const hasUnlimited = isPremium || sellerUpgradePlan === "plan_c" || (sellerUpgradePlan === "plan_b" && !planBExpired);
      if (!hasUnlimited) {
        const softLimit = sellerUpgradePlan === "plan_a" && freeTierLimit > 0
          ? freeTierLimit + sellerBonusSlots
          : (freeTierLimit > 0 ? freeTierLimit : 0);
        if (softLimit > 0 && currentCount >= softLimit) {
          return res.status(403).json({
            error: `You have reached your product listing limit of ${softLimit}. Upgrade your plan for more slots or unlimited listings.`,
            code: "FREE_TIER_LIMIT",
            limit: softLimit,
            currentCount,
          });
        }
      }

      const files = (req.files as { [fieldname: string]: Express.Multer.File[] } | undefined) || {};
      const parseMaybeJson = (value: any) => {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      };
      const normalizeStringArray = (value: any): string[] => {
        const parsed = parseMaybeJson(value);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || "").trim()).filter(Boolean);
        }
        if (typeof parsed === "string" && parsed.trim()) {
          return [parsed.trim()];
        }
        return [];
      };
      const imageUrls: string[] = [];
      let videoUrl: string | undefined;
      let videoDuration: number | undefined;

      if (files.images?.length) {
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

        if (!String(videoFile.mimetype || "").toLowerCase().startsWith("video/")) {
          return res.status(400).json({
            error: "Invalid video format. Please upload a valid video file.",
          });
        }

        // Upload video and get server-side metadata
        const videoMetadata = await uploadWithMetadata(videoFile.buffer, "kiyumart/videos");
        videoUrl = videoMetadata.url;

        if (videoMetadata.duration) {
          videoDuration = Math.round(videoMetadata.duration);
          if (videoDuration > 30) {
            videoUrl = buildTrimmedCloudinaryVideoUrl(videoMetadata.url, 30);
          }
        }
      }

      if (imageUrls.length === 0) {
        imageUrls.push(...normalizeStringArray(req.body.images));
      }

      if (!videoUrl) {
        const parsedVideo = parseMaybeJson(req.body.video);
        if (typeof parsedVideo === "string" && parsedVideo.trim()) {
          videoUrl = parsedVideo.trim();
        }
      }

      // Parse dynamic fields if provided
      let dynamicFields = parseMaybeJson(req.body.dynamicFields);

      // Auto-link products to seller's store if seller is creating the product
      let storeId = req.body.storeId;
      let sellerStoreType: StoreType | undefined;
      if (req.user!.role === "seller") {
        try {
          // Ensure seller has a store (requires approval and storeType)
          const sellerStore = await storage.ensureStoreForSeller(req.user!.id, { requireApproval: true });
          storeId = sellerStore.id;
          sellerStoreType = sellerStore.storeType as StoreType | undefined;
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

      dynamicFields = normalizeProductDynamicFieldsForStore(sellerStoreType, dynamicFields);

      const normalizedCategoryId = String(req.body.categoryId || "").trim();
      let resolvedCategorySlug: string | undefined;
      if (normalizedCategoryId) {
        const selectedCategory = await storage.getCategory(normalizedCategoryId);
        if (!selectedCategory) {
          return res.status(400).json({ error: "Selected category was not found." });
        }
        resolvedCategorySlug = selectedCategory.slug;
      }

      const productData = {
        ...req.body,
        images: imageUrls,
        video: videoUrl,
        videoDuration,
        dynamicFields,
        tags: normalizeStringArray(req.body.tags),
        price: req.body.price,
        costPrice: req.body.costPrice || null,
        sellerId: req.user!.id,
        storeId: storeId || undefined,
      };

      const validatedData = insertProductSchema.parse(productData);
      const product = await storage.createProduct({
        ...validatedData,
        category: resolvedCategorySlug,
        sellerId: req.user!.id,
      } as any);
      clearProductListCache();

      // Best effort: product creation should not fail because notifications fail.
      try {
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
      } catch (notifyError) {
        console.error("[PRODUCT CREATE] Failed to notify admins:", notifyError);
      }

      try {
        await notifyLowStockIfNeeded(null, product);
      } catch (lowStockError) {
        console.error("[PRODUCT CREATE] Failed to send low stock alert:", lowStockError);
      }

      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin: create product on behalf of a seller
  app.post("/api/admin/products", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_products"), async (req: AuthRequest, res) => {
    try {
      const parseMaybeJson = (value: any) => {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      };
      const normalizeStringArray = (value: any): string[] => {
        const parsed = parseMaybeJson(value);
        if (Array.isArray(parsed)) {
          return parsed.map((item) => String(item || "").trim()).filter(Boolean);
        }
        if (typeof parsed === "string" && parsed.trim()) {
          return [parsed.trim()];
        }
        return [];
      };
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
      let sellerStoreType: StoreType | undefined;
      try {
        const sellerStore = await storage.ensureStoreForSeller(sellerId, { requireApproval: true });
        storeId = sellerStore.id;
        sellerStoreType = sellerStore.storeType as StoreType | undefined;
      } catch (storeError: any) {
        return res.status(400).json({ error: `Cannot create product for seller: ${storeError.message}` });
      }

      const normalizedCategoryId = String(req.body.categoryId || "").trim();
      let resolvedCategorySlug: string | undefined;
      if (normalizedCategoryId) {
        const selectedCategory = await storage.getCategory(normalizedCategoryId);
        if (!selectedCategory) {
          return res.status(400).json({ error: "Selected category was not found." });
        }
        resolvedCategorySlug = selectedCategory.slug;
      }

      const productData = {
        ...req.body,
        images: normalizeStringArray(req.body.images),
        video: req.body.video || null,
        videoDuration: req.body.videoDuration || undefined,
        dynamicFields: normalizeProductDynamicFieldsForStore(
          sellerStoreType,
          parseMaybeJson(req.body.dynamicFields),
        ),
        tags: normalizeStringArray(req.body.tags),
        price: req.body.price,
        costPrice: req.body.costPrice || null,
        sellerId,
        storeId: storeId || undefined,
      };

      const validatedData = insertProductSchema.parse(productData);
      const product = await storage.createProduct({
        ...validatedData,
        category: resolvedCategorySlug,
        sellerId,
      } as any);

      try {
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
      } catch (notifyError) {
        console.error("[ADMIN PRODUCT CREATE] Failed to notify admins:", notifyError);
      }

      try {
        await notifyLowStockIfNeeded(null, product);
      } catch (lowStockError) {
        console.error("[ADMIN PRODUCT CREATE] Failed to send low stock alert:", lowStockError);
      }

      res.json(product);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  const hydrateProductsWithCategories = async (productList: any[]) => {
    const categories = await storage.getCategories();
    const categoryById = new Map(categories.map((item: any) => [item.id, item]));
    const allStores = await storage.getStores();
    const storeByPrimarySellerId = new Map(
      allStores
        .filter((store: any) => String(store?.primarySellerId || "").trim())
        .map((store: any) => [String(store.primarySellerId), store]),
    );
    const uniqueStoreIds = Array.from(
      new Set(productList.map((product: any) => String(product?.storeId || "").trim()).filter(Boolean))
    );
    const uniqueSellerIdsNeedingFallback = Array.from(
      new Set(
        productList
          .filter((product: any) => {
            const sellerId = String(product?.sellerId || "").trim();
            const storeId = String(product?.storeId || "").trim();
            return sellerId && !storeId && !storeByPrimarySellerId.has(sellerId);
          })
          .map((product: any) => String(product?.sellerId || "").trim())
          .filter(Boolean)
      )
    );
    const storeEntries = await Promise.all(
      uniqueStoreIds.map(async (storeId) => {
        const store = await storage.getStore(storeId);
        return [storeId, store] as const;
      })
    );
    const sellerEntries = await Promise.all(
      uniqueSellerIdsNeedingFallback.map(async (sellerId) => {
        const seller = await storage.getUser(sellerId);
        return [sellerId, seller] as const;
      })
    );
    const storeById = new Map(storeEntries);
    const sellerById = new Map(sellerEntries);

    return productList.map((product: any) => {
      const resolvedCategory = product.categoryId ? categoryById.get(product.categoryId) : undefined;
      const resolvedStore = product.storeId ? storeById.get(String(product.storeId)) : undefined;
      const resolvedSellerStore = product.sellerId
        ? storeByPrimarySellerId.get(String(product.sellerId))
        : undefined;
      const resolvedSeller = product.sellerId ? sellerById.get(String(product.sellerId)) : undefined;
      return {
        ...product,
        stock:
          Array.isArray(product?.dynamicFields?.variantSummary) && product.dynamicFields.variantSummary.length > 0
            ? getVariantSummaryStock(product.dynamicFields.variantSummary)
            : product.stock,
        category: resolvedCategory?.slug || product.category || null,
        categoryName: resolvedCategory?.name || null,
        storeName:
          resolvedStore?.name ||
          resolvedSellerStore?.name ||
          resolvedSeller?.storeName ||
          product.storeName ||
          null,
      };
    });
  };

  const reconcileProductsWithLiveVariants = async (productList: any[]) => {
    if (!Array.isArray(productList) || productList.length === 0) return [];

    const reconciledEntries = await Promise.all(
      productList.map(async (product: any) => {
        if (!product?.id) return [null, null] as const;

        const variants = await storage.getProductVariants(product.id).catch(() => []);
        if (!Array.isArray(variants) || variants.length === 0) {
          return [product.id, null] as const;
        }

        const { productImages, productStock } = getProductImagesAndStockFromValidVariants(variants);
        const nextVariantSummary = buildVariantSummarySnapshot(variants);
        const currentVariantSummary = Array.isArray(product?.dynamicFields?.variantSummary)
          ? buildVariantSummarySnapshot(product.dynamicFields.variantSummary)
          : [];
        const currentImages = Array.isArray(product.images) ? product.images : [];
        const summaryChanged = JSON.stringify(currentVariantSummary) !== JSON.stringify(nextVariantSummary);
        const imagesChanged = productImages.length > 0 && JSON.stringify(currentImages) !== JSON.stringify(productImages);
        const stockChanged =
          Number(product.stock || 0) !== productStock ||
          getVariantSummaryStock(currentVariantSummary) !== productStock;

        const nextDynamicFields = {
          ...(product.dynamicFields || {}),
          variantSummary: nextVariantSummary,
        };
        const nextImages = productImages.length > 0 ? productImages : currentImages;

        if (summaryChanged || imagesChanged || stockChanged) {
          await storage.updateProduct(product.id, {
            stock: productStock,
            images: nextImages,
            dynamicFields: nextDynamicFields,
          });
        }

        return [
          product.id,
          {
            ...product,
            stock: productStock,
            images: nextImages,
            dynamicFields: nextDynamicFields,
          },
        ] as const;
      }),
    );

    const reconciledById = new Map(reconciledEntries.filter(([id]) => Boolean(id)));
    return productList.map((product: any) => reconciledById.get(product.id) || product);
  };

  const filterPublicMarketplaceProducts = async (productList: any[]) => {
    if (!Array.isArray(productList) || productList.length === 0) return [];

    const [activeCategories, activeStores, allSellers] = await Promise.all([
      storage.getCategories({ isActive: true }),
      storage.getStores({ isActive: true, isApproved: true }),
      storage.getUsersByRole("seller"),
    ]);

    const activeCategoryById = new Map(
      (activeCategories || []).map((category: any) => [String(category.id), category]),
    );
    const activeCategoryKeys = new Set(
      (activeCategories || []).flatMap((category: any) => {
        const values = [category.slug, category.name]
          .map((value) => String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-"))
          .filter(Boolean);
        return values;
      }),
    );
    const activeStoreIds = new Set(
      (activeStores || []).map((store: any) => String(store.id)).filter(Boolean),
    );
    const activeApprovedSellerIds = new Set(
      (allSellers || [])
        .filter((seller: any) => Boolean(seller?.isActive) && Boolean(seller?.isApproved))
        .map((seller: any) => String(seller.id))
        .filter(Boolean),
    );

    return productList.filter((product: any) => {
      if (!product || product.isActive !== true) return false;

      const sellerId = String(product.sellerId || "").trim();
      if (!sellerId || !activeApprovedSellerIds.has(sellerId)) return false;

      const storeId = String(product.storeId || "").trim();
      if (storeId && !activeStoreIds.has(storeId)) return false;

      const categoryId = String(product.categoryId || "").trim();
      if (categoryId) {
        return activeCategoryById.has(categoryId);
      }

      const categoryKeys = [product.category, product.categoryName]
        .map((value: any) => String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-"))
        .filter(Boolean);

      if (categoryKeys.length === 0) return false;

      return categoryKeys.some((key) => activeCategoryKeys.has(key));
    });
  };

  const PRODUCT_LIST_CACHE_TTL_MS = 15000;
  const productListCache = new Map<string, { timestamp: number; data: any }>();

  const getCachedProductList = (key: string) => {
    const entry = productListCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > PRODUCT_LIST_CACHE_TTL_MS) {
      productListCache.delete(key);
      return null;
    }
    return entry.data;
  };

  const setCachedProductList = (key: string, data: any) => {
    productListCache.set(key, { timestamp: Date.now(), data });
  };

  const clearProductListCache = () => {
    productListCache.clear();
  };

  app.get("/api/products", async (req, res) => {
    try {
      const { sellerId, category, isActive } = req.query;
      
      // Get platform settings to check for single-store mode
      const platformSettings = await storage.getPlatformSettings();
      
      // In single-store mode with a primary store set, always force product scope to that exact store.
      let finalSellerId: string | undefined = sellerId as string;
      let finalStoreId: string | undefined;
      if (!platformSettings.isMultiVendor && platformSettings.primaryStoreId) {
        const primaryStore = await storage.getStore(platformSettings.primaryStoreId);
        if (primaryStore) {
          finalSellerId = primaryStore.primarySellerId || undefined;
          finalStoreId = primaryStore.id;
        }
      }
      
      const normalizedIsActive =
        isActive === "true" ? true : isActive === "false" ? false : undefined;
      const cacheKey = JSON.stringify({
        scope: "products",
        sellerId: finalSellerId || null,
        storeId: finalStoreId || null,
        category: String(category || ""),
        isActive: normalizedIsActive ?? null,
      });
      const cachedProducts = getCachedProductList(cacheKey);
      if (cachedProducts) {
        return res.json(cachedProducts);
      }

      const products = await storage.getProducts({
        sellerId: finalSellerId,
        storeId: finalStoreId,
        category: category as string,
        isActive: normalizedIsActive,
      });
      const sellerScopedRequest = Boolean(finalSellerId || finalStoreId || sellerId);
      const scopedProducts = sellerScopedRequest
        ? products.filter((product: any) => !product?.dynamicFields?.archived)
        : products;
      const liveProducts = sellerScopedRequest
        ? await reconcileProductsWithLiveVariants(scopedProducts)
        : scopedProducts;
      const hydratedProducts = await hydrateProductsWithCategories(liveProducts);
      const shouldApplyPublicVisibilityFilter = !sellerId;
      const responseProducts = shouldApplyPublicVisibilityFilter
        ? await filterPublicMarketplaceProducts(hydratedProducts)
        : hydratedProducts;
      setCachedProductList(cacheKey, responseProducts);
      res.json(responseProducts);
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
      const [platformSettings, resolvedCategory] = await Promise.all([
        storage.getPlatformSettings().catch(() => null),
        product.categoryId ? storage.getCategory(product.categoryId).catch(() => undefined) : Promise.resolve(undefined),
      ]);

      if (platformSettings && !platformSettings.isMultiVendor && platformSettings.primaryStoreId) {
        const primaryStore = await storage.getStore(platformSettings.primaryStoreId).catch(() => undefined);
        if (primaryStore && product.storeId !== primaryStore.id) {
          return res.status(404).json({ error: "Product not found" });
        }
      }

      res.json({
        ...product,
        stock:
          Array.isArray(product?.dynamicFields?.variantSummary) && product.dynamicFields.variantSummary.length > 0
            ? getVariantSummaryStock(product.dynamicFields.variantSummary)
            : product.stock,
        category: resolvedCategory?.slug || product.category || null,
        categoryName: resolvedCategory?.name || null,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post(
    "/api/users/:id/reset-password",
    requireAuth,
    requireRole("super_admin"),
    requirePermission("edit_passwords"),
    async (req: AuthRequest, res) => {
      try {
        const userId = req.params.id;
        const newPassword = typeof req.body?.password === "string" ? req.body.password : "";

        if (!newPassword) {
          return res.status(400).json({ error: "A new password is required" });
        }
        // Super admins can set any password with at least 6 characters — no strength restrictions
        if (newPassword.length < 6) {
          return res.status(400).json({ error: "Password must be at least 6 characters long" });
        }

        const targetUser = await storage.getUser(userId);
        if (!targetUser) {
          return res.status(404).json({ error: "User not found" });
        }

        const hashedPassword = await hashPassword(newPassword);
        await storage.updateUser(userId, { password: hashedPassword });

        await logSystemActivity({
          category: "security",
          severity: "info",
          title: "Admin password reset completed",
          message: `Super admin ${req.user?.email || req.user?.id} reset the password for ${targetUser.email}.`,
          humanExplanation: "A super admin manually reset a user's password from the admin console.",
          rootCause: "Manual admin intervention was requested to restore account access.",
          suggestedFix: "Confirm the user can sign in with the new password or request a reset link.",
          preventiveAction: "Encourage users to use strong passwords and password managers.",
          source: "/api/users/:id/reset-password",
          entityType: "user",
          entityId: String(targetUser.id),
          actorId: String(req.user?.id || ""),
          actorRole: String(req.user?.role || ""),
          metadata: {
            targetUserId: targetUser.id,
            targetUserEmail: targetUser.email,
          },
        });

        try {
          const notification = await storage.createNotification({
            userId: targetUser.id,
            type: "system",
            title: "Password reset",
            message:
              "Your password was reset by a Super Admin. If you did not request this, please contact support immediately.",
            metadata: { link: "/profile", action: "admin_password_reset" } as any,
          });
          io.to(targetUser.id).emit("notification", {
            id: notification.id,
            title: notification.title,
            message: notification.message,
            type: notification.type,
            metadata: notification.metadata,
            createdAt: notification.createdAt,
          });
        } catch (notifyError) {
          console.error("Failed to notify user about admin password reset:", notifyError);
        }

        res.json({ success: true, message: "Password reset successfully" });
      } catch (error: any) {
        res.status(500).json({ error: error?.message || "Failed to reset password" });
      }
    },
  );

  app.patch("/api/products/:id", requireAuth, requireRole("admin", "super_admin", "seller"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.edit"), async (req: AuthRequest, res) => {
    try {
      const parseMaybeJson = (value: any) => {
        if (typeof value !== "string") return value;
        const trimmed = value.trim();
        if (!trimmed) return undefined;
        try {
          return JSON.parse(trimmed);
        } catch {
          return value;
        }
      };
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user!.role === "seller" && product.sellerId !== req.user!.id) {
        return res.status(403).json({ error: "Not authorized" });
      }

      const updateData = { ...req.body } as Record<string, any>;
      const productStore = product.storeId
        ? await storage.getStore(product.storeId)
        : product.sellerId
          ? await storage.getStoreByPrimarySeller(product.sellerId)
          : undefined;
      const storeType = productStore?.storeType as StoreType | undefined;

      if (Object.prototype.hasOwnProperty.call(updateData, "categoryId")) {
        const normalizedCategoryId = String(updateData.categoryId || "").trim();
        updateData.categoryId = normalizedCategoryId || null;

        if (normalizedCategoryId) {
          const selectedCategory = await storage.getCategory(normalizedCategoryId);
          if (!selectedCategory) {
            return res.status(400).json({ error: "Selected category was not found." });
          }
          updateData.category = selectedCategory.slug;
        } else {
          updateData.category = null;
        }
      }

      if (Object.prototype.hasOwnProperty.call(updateData, "dynamicFields")) {
        const nextDynamicFields = normalizeProductDynamicFieldsForStore(
          storeType,
          parseMaybeJson(updateData.dynamicFields),
        );
        updateData.dynamicFields = {
          ...((product.dynamicFields as Record<string, any> | undefined) || {}),
          ...(nextDynamicFields || {}),
        };
      } else if (storeType) {
        updateData.dynamicFields = normalizeProductDynamicFieldsForStore(
          storeType,
          (product.dynamicFields as Record<string, any> | undefined) || {},
        );
      }

      const updated = await storage.updateProduct(req.params.id, updateData);
      if (!updated) {
        return res.status(404).json({ error: "Product not found" });
      }

      try {
        await notifyLowStockIfNeeded(product, updated);
      } catch (lowStockError) {
        console.error("[PRODUCT UPDATE] Failed to send low stock alert:", lowStockError);
      }

      clearProductListCache();
      const [hydratedUpdated] = await hydrateProductsWithCategories([updated]);
      res.json(hydratedUpdated);
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
      clearProductListCache();
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

      const [{ count: orderItemCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(orderItems)
        .where(eq(orderItems.productId, req.params.id));

      const archiveProductForHistory = async () => {
        const archivedDynamicFields = {
          ...(product.dynamicFields || {}),
          archived: true,
          archivedAt: new Date().toISOString(),
          archivedReason: "linked_order_history",
        };

        const archivedProduct = await storage.updateProduct(req.params.id, {
          isActive: false,
          dynamicFields: archivedDynamicFields,
        } as any);

        clearProductListCache();
        return res.json({
          success: true,
          archived: true,
          product: archivedProduct,
          message: "Product was archived because it is already linked to past orders.",
        });
      };

      if (Number(orderItemCount || 0) > 0) {
        return await archiveProductForHistory();
      }

      try {
        await storage.deleteProduct(req.params.id);
      } catch (deleteError: any) {
        const isForeignKeyHistoryError =
          deleteError?.code === "23503" ||
          String(deleteError?.message || "").includes("order_items_product_id_products_id_fk") ||
          String(deleteError?.message || "").includes("violates foreign key constraint");

        if (isForeignKeyHistoryError) {
          return await archiveProductForHistory();
        }

        throw deleteError;
      }

      clearProductListCache();
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // ============ Delivery Zone Routes ============
  app.post("/api/delivery-zones", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      // Storage layer handles all validation
      const entityKind =
        String(req.body?.entityKind || "").trim().toLowerCase() === "pickup_station"
          ? "pickup_station"
          : "delivery_zone";
      const zone = await storage.createDeliveryZone({ ...req.body, entityKind });
      io.emit("delivery_zones_updated", { action: "created", zoneId: zone.id });
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
      const requestedEntityKind =
        String(req.query.entityKind || "").trim().toLowerCase() === "pickup_station"
          ? "pickup_station"
          : "delivery_zone";
      const zones = await storage.getDeliveryZones(false, requestedEntityKind);
      res.json(zones);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/pickup-stations", async (_req, res) => {
    try {
      const stations = await storage.getDeliveryZones(false, "pickup_station");
      res.json(stations);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Admin/super_admin management endpoint (includes inactive zones)
  app.get("/api/admin/delivery-zones", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      const requestedEntityKind =
        String(req.query.entityKind || "").trim().toLowerCase() === "pickup_station"
          ? "pickup_station"
          : "delivery_zone";
      const zones = await storage.getDeliveryZones(true, requestedEntityKind);
      res.json(zones);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/pickup-stations", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (_req, res) => {
    try {
      const stations = await storage.getDeliveryZones(true, "pickup_station");
      res.json(stations);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/delivery-zones/:id", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      // Storage layer handles all validation
      const entityKind =
        req.body?.entityKind === undefined
          ? undefined
          : String(req.body?.entityKind || "").trim().toLowerCase() === "pickup_station"
            ? "pickup_station"
            : "delivery_zone";
      const zone = await storage.updateDeliveryZone(req.params.id, {
        ...req.body,
        ...(entityKind ? { entityKind } : {}),
      });
      if (!zone) {
        return res.status(404).json({ error: "Zone not found" });
      }
      io.emit("delivery_zones_updated", { action: "updated", zoneId: zone.id });
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
      io.emit("delivery_zones_updated", { action: "deleted", zoneId: req.params.id });
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

  app.get("/api/coupons/available", requireAuth, async (req: AuthRequest, res) => {
    try {
      const sellerId = String(req.query.sellerId || "").trim();
      const orderTotal = Number(req.query.orderTotal || 0);

      if (!sellerId) {
        return res.status(400).json({ error: "sellerId is required" });
      }

      const sellerCoupons = await storage.getCouponsBySeller(sellerId);
      const now = new Date();
      const availableCoupons = sellerCoupons.filter((coupon: any) => {
        if (!coupon?.isActive) return false;
        if (coupon.expiryDate && new Date(coupon.expiryDate) < now) return false;
        if (coupon.usageLimit && Number(coupon.usedCount || 0) >= Number(coupon.usageLimit || 0)) return false;
        const minimumPurchase = Number(coupon.minimumPurchase || 0);
        if (orderTotal > 0 && minimumPurchase > orderTotal) return false;
        return true;
      });

      res.json(availableCoupons);
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

  const getValidVariantRows = (variants: any[] = []) =>
    variants.filter((variant) => {
      const color = String(variant?.color || "").trim();
      const size = String(variant?.size || "").trim();
      return color.length > 0 && size.length > 0;
    });

  const getProductImagesAndStockFromValidVariants = (variants: any[] = []) => {
    const validVariants = getValidVariantRows(variants);
    const productImages = Array.from(
      new Set(
        validVariants.flatMap((item: any) =>
          Array.isArray(item?.images) && item.images.length > 0
            ? item.images
            : item?.image
              ? [item.image]
              : []
        )
      )
    ).filter(Boolean).slice(0, 8);
    const productStock = validVariants.reduce((sum: number, item: any) => sum + (Number(item?.stock) || 0), 0);

    return { validVariants, productImages, productStock };
  };

  const buildVariantSummarySnapshot = (variants: any[] = []) =>
    getValidVariantRows(variants).map((variant: any) => ({
      id: variant.id,
      color: String(variant?.color || "").trim(),
      size: String(variant?.size || "").trim(),
      images: Array.isArray(variant?.images) ? variant.images : [],
      image: variant?.image || null,
      stock: Number(variant?.stock) || 0,
      originalStock: Number(variant?.originalStock ?? variant?.stock) || 0,
    }));

  const getVariantSummaryStock = (summary: any[] = []) =>
    buildVariantSummarySnapshot(summary).reduce((sum: number, variant: any) => sum + (Number(variant?.stock) || 0), 0);

  app.get("/api/products/:productId/variants", async (req, res) => {
    try {
      const { productId } = req.params;
      const variants = await storage.getProductVariants(productId);
      const product = await storage.getProduct(productId).catch(() => null);

      if (product) {
        const { productImages, productStock } = getProductImagesAndStockFromValidVariants(variants);
        const nextVariantSummary = buildVariantSummarySnapshot(variants);
        const currentVariantSummary = Array.isArray((product as any)?.dynamicFields?.variantSummary)
          ? buildVariantSummarySnapshot((product as any).dynamicFields.variantSummary)
          : [];
        const currentImages = Array.isArray(product.images) ? product.images : [];
        const summaryChanged = JSON.stringify(currentVariantSummary) !== JSON.stringify(nextVariantSummary);
        const imagesChanged = productImages.length > 0 && JSON.stringify(currentImages) !== JSON.stringify(productImages);
        const stockChanged =
          Number(product.stock || 0) !== productStock ||
          getVariantSummaryStock(currentVariantSummary) !== productStock;

        if (summaryChanged || imagesChanged || stockChanged) {
          await storage.updateProduct(productId, {
            stock: productStock,
            images: productImages.length > 0 ? productImages : currentImages,
            dynamicFields: {
              ...(product.dynamicFields || {}),
              variantSummary: nextVariantSummary,
            },
          });
        }
      }

      res.json(variants);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Create product variant
  app.post("/api/products/:productId/variants", requireAuth, requireRole("seller", "admin", "super_admin"), requirePermissionIfAdmin("manage_products"), requireRoleFeatureIfRole(["seller"], "products.edit"), async (req: AuthRequest, res) => {
    try {
      const { productId } = req.params;
      const { color, size, images, stock } = req.body;

      // Verify the product belongs to the seller (or admin creating on behalf)
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user?.role === "seller" && product.sellerId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const normalizedColor = String(color || "").trim();
      const normalizedSize = String(size || "").trim();
      const normalizedImages = Array.isArray(images)
        ? images.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const normalizedStock = Number.isFinite(Number(stock)) ? Math.max(0, Math.floor(Number(stock))) : 0;

      if (!normalizedColor) {
        return res.status(400).json({ error: "Color is required" });
      }
      if (!normalizedSize) {
        return res.status(400).json({ error: "Size is required" });
      }
      if (normalizedImages.length < 3 || normalizedImages.length > 5) {
        return res.status(400).json({ error: "Each variant must have 3 to 5 images" });
      }

      const variant = await storage.createProductVariant({
        productId,
        color: normalizedColor,
        size: normalizedSize,
        images: normalizedImages,
        image: normalizedImages[0] || null,
        stock: normalizedStock,
        originalStock: normalizedStock,
        sku: null,
        priceAdjustment: "0",
      });

      const allVariants = await storage.getProductVariants(productId);
      const { productImages, productStock } = getProductImagesAndStockFromValidVariants(allVariants);
      await storage.updateProduct(productId, {
        stock: productStock,
        images: productImages,
        dynamicFields: {
          ...(product.dynamicFields || {}),
          variantSummary: buildVariantSummarySnapshot(allVariants),
        },
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
      const { color, size, images, stock } = req.body;

      // Verify the product belongs to the seller
      const product = await storage.getProduct(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }

      if (req.user?.role === "seller" && product.sellerId !== req.user.id) {
        return res.status(403).json({ error: "Access denied" });
      }

      const existingVariants = await storage.getProductVariants(productId);
      const currentVariant = existingVariants.find((variant) => variant.id === variantId);
      if (!currentVariant) {
        return res.status(404).json({ error: "Variant not found for this product" });
      }

      const normalizedColor = String(color || "").trim();
      const normalizedSize = String(size || "").trim();
      const normalizedImages = Array.isArray(images)
        ? images.map((value: unknown) => String(value || "").trim()).filter(Boolean)
        : [];
      const normalizedStock = Number.isFinite(Number(stock)) ? Math.max(0, Math.floor(Number(stock))) : 0;

      if (!normalizedColor) {
        return res.status(400).json({ error: "Color is required" });
      }
      if (!normalizedSize) {
        return res.status(400).json({ error: "Size is required" });
      }
      if (normalizedImages.length < 3 || normalizedImages.length > 5) {
        return res.status(400).json({ error: "Each variant must have 3 to 5 images" });
      }

      const variant = await storage.updateProductVariant(variantId, {
        color: normalizedColor,
        size: normalizedSize,
        images: normalizedImages,
        image: normalizedImages[0] || null,
        stock: normalizedStock,
        sku: null,
        priceAdjustment: "0",
      });

      const allVariants = await storage.getProductVariants(productId);
      const { productImages, productStock } = getProductImagesAndStockFromValidVariants(allVariants);
      await storage.updateProduct(productId, {
        stock: productStock,
        images: productImages,
        dynamicFields: {
          ...(product.dynamicFields || {}),
          variantSummary: buildVariantSummarySnapshot(allVariants),
        },
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

      const existingVariants = await storage.getProductVariants(productId);
      const currentVariant = existingVariants.find((variant) => variant.id === variantId);
      if (!currentVariant) {
        return res.status(404).json({ error: "Variant not found for this product" });
      }

      const normalizedCurrentColor = String(currentVariant.color || "").trim().toLowerCase();
      const replacementVariant = existingVariants.find((variant) => {
        if (variant.id === variantId) return false;
        return String(variant.color || "").trim().toLowerCase() === normalizedCurrentColor;
      });

      if (replacementVariant) {
        await storage.reassignCartVariantReferences([variantId], replacementVariant.id);
      } else {
        await storage.clearCartVariantReferences([variantId]);
      }

      await storage.deleteProductVariant(variantId);

      const allVariants = await storage.getProductVariants(productId);
      const { productImages, productStock } = getProductImagesAndStockFromValidVariants(allVariants);
      await storage.updateProduct(productId, {
        stock: productStock,
        images: productImages,
        dynamicFields: {
          ...(product.dynamicFields || {}),
          variantSummary: buildVariantSummarySnapshot(allVariants),
        },
      });

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
      const requestedLimit = req.query.limit ? parseInt(req.query.limit as string) : 5;
      const limit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(requestedLimit, 5)) : 5;
      const cacheKey = JSON.stringify({ scope: "homepage-featured-products", limit });
      const cachedProducts = getCachedProductList(cacheKey);
      if (cachedProducts) {
        return res.json(cachedProducts);
      }
      
      // Get platform settings to check for single-store mode
      const platformSettings = await storage.getPlatformSettings();
      if (platformSettings.showHomepageFeaturedSection === false) {
        return res.json([]);
      }
      
      let scopedProducts;
      if (!platformSettings.isMultiVendor && platformSettings.primaryStoreId) {
        // In single-store mode, only show products from the primary store
        const primaryStore = await storage.getStore(platformSettings.primaryStoreId);
        const primarySellerId = primaryStore?.primarySellerId || undefined;
        const primaryStoreId = primaryStore?.id || undefined;
        scopedProducts = await storage.getProducts({
          sellerId: primarySellerId,
          storeId: primaryStoreId,
          isActive: true,
        });
      } else {
        scopedProducts = await storage.getProducts({ isActive: true });
      }

      const featuredProducts = scopedProducts
        .filter((product: any) => Boolean(product?.dynamicFields?.homepageFeatured))
        .sort((a: any, b: any) => {
          const ratingDiff = Number(b?.ratings || 0) - Number(a?.ratings || 0);
          if (ratingDiff !== 0) return ratingDiff;
          return new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime();
        })
        .slice(0, limit);
      
      const hydratedFeaturedProducts = await hydrateProductsWithCategories(featuredProducts);
      const visibleFeaturedProducts = await filterPublicMarketplaceProducts(hydratedFeaturedProducts);
      setCachedProductList(cacheKey, visibleFeaturedProducts);
      res.json(visibleFeaturedProducts);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/homepage/new-arrivals", async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      const cacheKey = JSON.stringify({ scope: "homepage-new-arrivals", limit });
      const cachedProducts = getCachedProductList(cacheKey);
      if (cachedProducts) {
        return res.json(cachedProducts);
      }
      const platformSettings = await storage.getPlatformSettings();
      if (platformSettings.showHomepageNewArrivalSection === false) {
        return res.json([]);
      }

      let scopedProducts;
      if (!platformSettings.isMultiVendor && platformSettings.primaryStoreId) {
        const primaryStore = await storage.getStore(platformSettings.primaryStoreId);
        const primarySellerId = primaryStore?.primarySellerId || undefined;
        const primaryStoreId = primaryStore?.id || undefined;
        scopedProducts = await storage.getProducts({
          sellerId: primarySellerId,
          storeId: primaryStoreId,
          isActive: true,
        });
      } else {
        scopedProducts = await storage.getProducts({ isActive: true });
      }

      const newArrivals = scopedProducts
        .filter((product: any) => Boolean(product?.dynamicFields?.homepageNewArrival))
        .sort((a: any, b: any) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime())
        .slice(0, limit);

      const hydratedNewArrivals = await hydrateProductsWithCategories(newArrivals);
      const visibleNewArrivals = await filterPublicMarketplaceProducts(hydratedNewArrivals);
      setCachedProductList(cacheKey, visibleNewArrivals);
      res.json(visibleNewArrivals);
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
      res.json(earnings);
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
      const resultRows = await storage.getAdminSellerPayoutSummaries();
      res.json(resultRows);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get(
    "/api/admin/sellers/:sellerId/dashboard/bootstrap",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (req, res) => {
      try {
        const { sellerId } = req.params;
        const seller = await storage.getUser(sellerId);

        if (!seller || seller.role !== "seller") {
          return res.status(404).json({ error: "Seller not found" });
        }

        const store = await storage.getStoreByPrimarySeller(sellerId);
        const { password: _password, ...sellerWithoutPassword } = seller as any;

        return res.json({
          seller: sellerWithoutPassword,
          store,
        });
      } catch (error: any) {
        console.error("Error building seller dashboard bootstrap:", error);
        return res.status(400).json({ error: error.message });
      }
    },
  );

  // Admin: Get payouts for a seller
  app.get('/api/admin/sellers/:id/payouts', requireAuth, requireRole('admin', 'super_admin'), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const sellerId = req.params.id;
      void storage.backfillMissingCommissionEarnings(100).catch((error: any) => {
        console.error("[ADMIN_SELLER_PAYOUTS] Background commission backfill failed:", error?.message || error);
      });
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

      console.info(`[PAYOUT] Payout ${payoutId} approved by ${adminId} order #${orderNumber}`);
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

      console.info(`[PAYOUT] Payout ${payoutId} rejected by ${adminId} order #${orderNumber}`);
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
          if (user.role === "super_admin") {
            const existingSuperAdmins = await storage.getUsersByRole("super_admin");
            if (existingSuperAdmins.length > 0) {
              created.push({ email: user.email, role: user.role, status: "skipped (single super admin policy)" });
              continue;
            }
          }
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
                logo: (user as any).profileImage || user.storeBanner || "",
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
    activeOrderCount: number;
    maxCapacity: number;
    riskScore: number;
    gpsAgeSeconds: number | null;
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
    if (typeof value === "string" && value.trim() === "") return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const RIDER_ENGAGED_STATUSES = new Set([
    "searching_rider",
    "assigned",
    "rider_arrived",
    "picked_up",
    "in_transit",
    "en_route",
    "delivering",
  ]);

  const buildRiderActiveOrderCountMap = (orderRows: any[]): Map<string, number> => {
    const countByRider = new Map<string, number>();
    orderRows.forEach((row: any) => {
      const riderId = String(row?.riderId || "").trim();
      if (!riderId) return;
      const status = canonicalizeOrderStatus(row?.status);
      if (!RIDER_ENGAGED_STATUSES.has(status)) return;
      countByRider.set(riderId, (countByRider.get(riderId) || 0) + 1);
    });
    return countByRider;
  };

  const resolveRiderMaxCapacity = (rider: any): number => {
    const preferenceCapacity = toFiniteNumber((rider as any)?.riderPreferences?.maxActiveOrders);
    const vehicleCapacity = toFiniteNumber((rider as any)?.vehicleInfo?.maxCapacity);
    const resolved = preferenceCapacity ?? vehicleCapacity ?? RIDER_DEFAULT_MAX_CAPACITY;
    return Math.max(1, Math.floor(resolved));
  };

  const toTimestampMs = (value: unknown): number => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const parsed = new Date(String(value)).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const extractCoordinatesFromText = (value: unknown): { lat: number; lng: number } | null => {
    const raw = String(value || "");
    if (!raw) return null;
    const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  };

  const normalizeOtp = (value: unknown): string => String(value ?? "").replace(/\D/g, "").trim();
  const isPrivilegedOpsRole = (role?: string | null) => role === "admin" || role === "super_admin";
  const normalizePaymentStatus = (value?: string | null) => (value || "").toLowerCase().trim();
  const isPaidPaymentStatus = (value?: string | null) =>
    ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
  const isPickupMethod = (value?: string | null) => (value || "").toLowerCase().trim() === "pickup";
  const isBusMethod = (value?: string | null) => (value || "").toLowerCase().trim() === "bus";
  const isManualExternalDeliveryOrder = (orderLike?: {
    deliveryMethod?: string | null;
    externalDeliveryType?: string | null;
    externalDeliveryByBus?: boolean | null;
  } | null) => {
    if (!orderLike || isPickupMethod(orderLike.deliveryMethod) || isBusMethod(orderLike.deliveryMethod)) return false;
    const externalType = String(orderLike.externalDeliveryType || "").toLowerCase().trim();
    return orderLike.externalDeliveryByBus === true || externalType === "bus" || externalType === "third_party";
  };
  const isExternalDeliveryArrangedStatus = (value?: string | null) =>
    (value || "").toLowerCase().trim() === "external_dispatch_arranged";
  const isExternalRiderSystemActive = async () =>
    Boolean((await storage.getPlatformSettings())?.isExternalRiderSystemEnabled);
  type BusDeliveryWorkflowStage =
    | "READY"
    | "ASSIGNED"
    | "AT_BUS_STATION"
    | "IN_TRANSIT_BUS"
    | "AWAITING_CONFIRMATION"
    | "COMPLETED";
  const BUS_STAGE_REASON_PREFIX = "bus_stage:";
  const BUS_STAGE_REASONS = {
    atBusStation: `${BUS_STAGE_REASON_PREFIX}AT_BUS_STATION`,
    inTransit: `${BUS_STAGE_REASON_PREFIX}IN_TRANSIT_BUS`,
    awaitingConfirmation: `${BUS_STAGE_REASON_PREFIX}AWAITING_CONFIRMATION`,
    completed: `${BUS_STAGE_REASON_PREFIX}COMPLETED`,
  } as const;
  const BUS_TRANSPORT_PROOF_REASON = "bus_transport_proof_submitted";
  const BUS_SUPER_ADMIN_COMPLETED_REASON = "bus_super_admin_completed";
  const isBusWorkflowStage = (value?: string | null): value is BusDeliveryWorkflowStage => {
    const normalized = String(value || "").trim().toUpperCase();
    return (
      normalized === "READY" ||
      normalized === "ASSIGNED" ||
      normalized === "AT_BUS_STATION" ||
      normalized === "IN_TRANSIT_BUS" ||
      normalized === "AWAITING_CONFIRMATION" ||
      normalized === "COMPLETED"
    );
  };
  const resolveBusStageFromOrderState = (status?: string | null): BusDeliveryWorkflowStage => {
    const canonical = canonicalizeOrderStatus(status || "");
    if (canonical === "completed") return "COMPLETED";
    if (canonical === "delivered") return "AWAITING_CONFIRMATION";
    if (canonical === "in_transit" || canonical === "en_route") return "IN_TRANSIT_BUS";
    if (canonical === "rider_arrived") return "AT_BUS_STATION";
    if (canonical === "assigned" || canonical === "picked_up") return "ASSIGNED";
    return "READY";
  };
  const extractBusDeliveryWorkflow = (history: Array<any>, orderLike?: { status?: string | null }) => {
    const chronological = [...(history || [])].sort(
      (a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime()
    );
    let stage: BusDeliveryWorkflowStage = resolveBusStageFromOrderState(orderLike?.status);
    let latestProof: Record<string, any> | null = null;

    for (const entry of chronological) {
      const reason = String(entry?.reason || "").trim();
      if (reason.startsWith(BUS_STAGE_REASON_PREFIX)) {
        const candidate = reason.slice(BUS_STAGE_REASON_PREFIX.length).trim().toUpperCase();
        if (isBusWorkflowStage(candidate)) {
          stage = candidate;
        }
      }
      if (reason === BUS_TRANSPORT_PROOF_REASON) {
        latestProof =
          entry?.metadata && typeof entry.metadata === "object"
            ? ({ ...entry.metadata } as Record<string, any>)
            : null;
        stage = "AWAITING_CONFIRMATION";
      }
      if (reason === BUS_SUPER_ADMIN_COMPLETED_REASON) {
        stage = "COMPLETED";
      }
    }

    if (canonicalizeOrderStatus(orderLike?.status || "") === "completed") {
      stage = "COMPLETED";
    } else if (latestProof && stage !== "COMPLETED") {
      stage = "AWAITING_CONFIRMATION";
    }

    return {
      stage,
      proofSubmitted: Boolean(latestProof),
      proof: latestProof
        ? {
            receiptImageUrl: latestProof.receiptImageUrl || null,
            driverPhone: latestProof.driverPhone || null,
            busNumber: latestProof.busNumber || null,
            stationName: latestProof.stationName || null,
            submittedAt: latestProof.submittedAt || null,
            latitude: latestProof.latitude ?? null,
            longitude: latestProof.longitude ?? null,
            riderId: latestProof.riderId || null,
            riderName: latestProof.riderName || null,
          }
        : null,
      completionRestrictedTo: "super_admin",
    };
  };
  const resolveVisibleOrderStateForRole = (
    orderLike: {
      status?: string | null;
      paymentStatus?: string | null;
      deliveryMethod?: string | null;
      externalDeliveryType?: string | null;
      externalDeliveryByBus?: boolean | null;
    },
    viewerRole?: string | null
  ): { status: string; hidden: boolean } => {
    const canonicalStatus = canonicalizeOrderStatus(orderLike?.status || "");
    const paid = isPaidPaymentStatus(orderLike?.paymentStatus);
    const pickup = isPickupMethod(orderLike?.deliveryMethod);
    const bus = isBusMethod(orderLike?.deliveryMethod);
    const manualExternalDelivery = isManualExternalDeliveryOrder(orderLike);

    if (isPrivilegedOpsRole(viewerRole)) return { status: canonicalStatus, hidden: false };

    if (viewerRole === "seller") {
      if (!paid) return { status: canonicalStatus, hidden: true };
      if (pickup && canonicalStatus === "packaged") return { status: "packaged", hidden: false };
      if (canonicalStatus === "searching_rider") return { status: "ready", hidden: false };
      if (canonicalStatus === "external_dispatch_arranged") return { status: "processing", hidden: false };
      if (manualExternalDelivery && ["rider_arrived", "delivered", "completed"].includes(canonicalStatus)) {
        return { status: "completed", hidden: false };
      }
      if (bus && canonicalStatus === "delivered") return { status: "in_transit", hidden: false };
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
      if (bus && canonicalStatus === "delivered") return { status: "in_transit", hidden: false };
      if (["delivered", "completed"].includes(canonicalStatus)) return { status: "completed", hidden: false };
      return { status: canonicalStatus, hidden: false };
    }

    if (viewerRole === "buyer") {
      if (!paid) return { status: "pending", hidden: false };
      if (pickup) {
        if (canonicalStatus === "packaged") return { status: "packaged", hidden: false };
        if (["delivered", "completed"].includes(canonicalStatus)) return { status: "delivered", hidden: false };
        return { status: canonicalStatus, hidden: false };
      }
      if (manualExternalDelivery && ["rider_arrived", "delivered", "completed"].includes(canonicalStatus)) {
        return { status: "completed", hidden: false };
      }
      if (bus) {
        if (["searching_rider", "assigned", "rider_arrived", "ready", "confirmed", "processing", "external_dispatch_arranged"].includes(canonicalStatus)) {
          return { status: "processing", hidden: false };
        }
        if (["picked_up", "in_transit", "en_route", "delivered"].includes(canonicalStatus)) {
          return { status: "en_route", hidden: false };
        }
        if (canonicalStatus === "completed") return { status: "delivered", hidden: false };
        return { status: canonicalStatus, hidden: false };
      }
      if (["searching_rider", "assigned", "rider_arrived", "ready", "confirmed", "processing", "external_dispatch_arranged"].includes(canonicalStatus)) {
        return { status: "processing", hidden: false };
      }
      if (["picked_up", "in_transit", "en_route"].includes(canonicalStatus)) return { status: "en_route", hidden: false };
      if (["delivered", "completed"].includes(canonicalStatus)) return { status: "delivered", hidden: false };
      return { status: canonicalStatus, hidden: false };
    }

    if (viewerRole === "admin" || viewerRole === "super_admin" || viewerRole === "agent") {
      return { status: canonicalStatus, hidden: false };
    }

    if (manualExternalDelivery && ["rider_arrived", "delivered", "completed"].includes(canonicalStatus)) {
      return { status: "completed", hidden: false };
    }
    if (pickup && canonicalStatus === "packaged") return { status: "packaged", hidden: false };
    if (canonicalStatus === "searching_rider") return { status: "processing", hidden: false };
    if (canonicalStatus === "external_dispatch_arranged") return { status: "processing", hidden: false };
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

  const inferOrderSellerContext = async (orderLike: { id: string; sellerId?: string | null; storeId?: string | null }) => {
    let sellerId = String(orderLike.sellerId || "").trim() || null;
    let storeId = String(orderLike.storeId || "").trim() || null;

    let storeRecord: any = null;
    if (storeId) {
      storeRecord = await storage.getStore(storeId);
      if (storeRecord?.primarySellerId && !sellerId) {
        sellerId = storeRecord.primarySellerId;
      }
    }

    let sellerRecord: any = null;
    if (sellerId) {
      sellerRecord = await storage.getUser(sellerId);
    }

    if (!storeRecord && sellerId) {
      storeRecord = await storage.getStoreByPrimarySeller(sellerId);
      if (storeRecord?.id) storeId = storeRecord.id;
    }

    if (!sellerId || !storeId || !sellerRecord) {
      const [firstItem] = await db
        .select({
          productId: orderItems.productId,
          productSellerId: products.sellerId,
          productStoreId: products.storeId,
        })
        .from(orderItems)
        .leftJoin(products, eq(orderItems.productId, products.id))
        .where(eq(orderItems.orderId, orderLike.id))
        .limit(1);

      const inferredSellerId = String(firstItem?.productSellerId || "").trim() || null;
      const inferredStoreId = String(firstItem?.productStoreId || "").trim() || null;

      if (!sellerId && inferredSellerId) sellerId = inferredSellerId;
      if (!storeId && inferredStoreId) storeId = inferredStoreId;

      if (!sellerRecord && sellerId) {
        sellerRecord = await storage.getUser(sellerId);
      }
      if (!storeRecord && storeId) {
        storeRecord = await storage.getStore(storeId);
      }
      if (!storeRecord && sellerId) {
        storeRecord = await storage.getStoreByPrimarySeller(sellerId);
        if (storeRecord?.id) storeId = storeRecord.id;
      }
      const inferredPrimarySellerId = String(storeRecord?.primarySellerId || "").trim();
      if (!sellerId && inferredPrimarySellerId) {
        sellerId = inferredPrimarySellerId;
        sellerRecord = await storage.getUser(inferredPrimarySellerId);
      }
    }

    return { sellerId, storeId, sellerRecord, storeRecord };
  };

  const sanitizeOrderVerificationSecrets = (order: any, viewer: { id: string; role: string }) => {
    const isAdminViewer = viewer.role === "admin" || viewer.role === "super_admin";
    const isAgentViewer = viewer.role === "agent";
    const isBuyerViewer = order?.buyerId === viewer.id;
    const isSellerViewer = order?.sellerId === viewer.id;
    const isRiderViewer = order?.riderId && order.riderId === viewer.id;
    const sanitized = { ...order } as any;
    const busDelivery = isBusMethod(order?.deliveryMethod);
    const manualExternalDelivery = isManualExternalDeliveryOrder(order);

    if (busDelivery || manualExternalDelivery) {
      sanitized.qrCode = null;
      sanitized.deliveryOtp = null;
      if (manualExternalDelivery) {
        sanitized.pickupOtp = isPickupMethod(order?.deliveryMethod) ? sanitized.pickupOtp : null;
      } else {
        sanitized.pickupOtp = null;
      }
    }

    if (isAdminViewer || (isAgentViewer && isPickupMethod(order?.deliveryMethod))) {
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

  const generateOrderOtp = (): string => {
    return String(Math.floor(100000 + Math.random() * 900000));
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

  const mapCanonicalStatusToTripLifecycleEvent = (canonicalStatus: string): string | null => {
    const normalized = canonicalizeOrderStatus(canonicalStatus as any);
    if (normalized === "created") return "ORDER_CREATED";
    if (normalized === "processing" || normalized === "confirmed") return "PAYMENT_CONFIRMED";
    if (normalized === "searching_rider") return "MATCHING_RIDER";
    if (normalized === "assigned") return "RIDER_ASSIGNED";
    if (normalized === "rider_arrived") return "RIDER_ARRIVED_PICKUP";
    if (normalized === "picked_up") return "PICKUP_VERIFIED";
    if (normalized === "in_transit" || normalized === "en_route") return "IN_TRANSIT";
    if (normalized === "delivered" || normalized === "completed") return "COMPLETED";
    if (normalized === "cancelled") return "CANCELLED";
    return null;
  };

  type EtaRoleKey = "customer" | "rider" | "agent" | "admin" | "super_admin";
  type EtaControlsSnapshot = {
    aiEnabledGlobal: boolean;
    aiEnabledByRegion: Record<string, boolean>;
    aiEnabledByRole: Record<EtaRoleKey, boolean>;
    aiVisibleByRole: Record<EtaRoleKey, boolean>;
  };
  const ETA_MUTABLE_ROLE_KEYS: EtaRoleKey[] = ["customer", "rider", "agent", "admin"];
  const ETA_ROLE_TO_STORAGE_ROLE: Record<EtaRoleKey, "buyer" | "rider" | "agent" | "admin" | "super_admin"> = {
    customer: "buyer",
    rider: "rider",
    agent: "agent",
    admin: "admin",
    super_admin: "super_admin",
  };
  const ETA_FEATURE_KEY_AI_ENABLED = "tracking.ai_eta.enabled";
  const ETA_FEATURE_KEY_AI_VISIBLE = "tracking.ai_eta.visible";
  const ETA_FEATURE_KEY_GLOBAL_ENABLED = "tracking.ai_eta.global_enabled";
  const ETA_FEATURE_REGION_PREFIX = "tracking.ai_eta.region.";

  const buildDefaultEtaControls = (): EtaControlsSnapshot => ({
    aiEnabledGlobal: true,
    aiEnabledByRegion: {},
    aiEnabledByRole: {
      customer: true,
      rider: true,
      agent: true,
      admin: true,
      super_admin: true,
    },
    aiVisibleByRole: {
      customer: false,
      rider: false,
      agent: true,
      admin: true,
      super_admin: true,
    },
  });

  let etaControls: EtaControlsSnapshot = buildDefaultEtaControls();

  const toEtaRoleKey = (role: string): EtaRoleKey => {
    const normalized = String(role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    if (normalized === "buyer" || normalized === "customer") return "customer";
    if (normalized === "seller") return "customer";
    if (normalized === "rider") return "rider";
    if (normalized === "agent") return "agent";
    if (normalized === "admin") return "admin";
    if (normalized === "super_admin" || normalized === "superadmin") return "super_admin";
    return "customer";
  };

  const normalizeEtaRegionKey = (value: string): string => {
    const normalized = String(value || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "_");
    return normalized || "global";
  };

  const readRoleFeatureMap = async (role: "buyer" | "rider" | "agent" | "admin" | "super_admin") => {
    const rows = await storage.getRoleFeatures(role);
    const candidate = rows?.[0]?.features;
    if (!candidate || typeof candidate !== "object") return {} as Record<string, boolean>;
    return candidate as Record<string, boolean>;
  };

  const readEtaControlsFromDb = async (): Promise<EtaControlsSnapshot> => {
    const snapshot = buildDefaultEtaControls();
    const superAdminFeatures = await readRoleFeatureMap("super_admin");

    if (typeof superAdminFeatures[ETA_FEATURE_KEY_GLOBAL_ENABLED] === "boolean") {
      snapshot.aiEnabledGlobal = superAdminFeatures[ETA_FEATURE_KEY_GLOBAL_ENABLED];
    }

    Object.entries(superAdminFeatures).forEach(([featureKey, enabled]) => {
      if (!featureKey.startsWith(ETA_FEATURE_REGION_PREFIX) || typeof enabled !== "boolean") return;
      const regionKey = normalizeEtaRegionKey(featureKey.slice(ETA_FEATURE_REGION_PREFIX.length));
      snapshot.aiEnabledByRegion[regionKey] = enabled;
    });

    for (const roleKey of ETA_MUTABLE_ROLE_KEYS) {
      const storageRole = ETA_ROLE_TO_STORAGE_ROLE[roleKey];
      const roleFeatures = await readRoleFeatureMap(storageRole);
      if (typeof roleFeatures[ETA_FEATURE_KEY_AI_ENABLED] === "boolean") {
        snapshot.aiEnabledByRole[roleKey] = roleFeatures[ETA_FEATURE_KEY_AI_ENABLED];
      }
      if (typeof roleFeatures[ETA_FEATURE_KEY_AI_VISIBLE] === "boolean") {
        snapshot.aiVisibleByRole[roleKey] = roleFeatures[ETA_FEATURE_KEY_AI_VISIBLE];
      }
    }

    // Super-admin visibility and enablement are enforced server-side.
    snapshot.aiEnabledByRole.super_admin = true;
    snapshot.aiVisibleByRole.super_admin = true;
    return snapshot;
  };

  const persistEtaControlsToDb = async (snapshot: EtaControlsSnapshot, updatedBy: string) => {
    for (const roleKey of ETA_MUTABLE_ROLE_KEYS) {
      const storageRole = ETA_ROLE_TO_STORAGE_ROLE[roleKey];
      const current = await readRoleFeatureMap(storageRole);
      const next = {
        ...current,
        [ETA_FEATURE_KEY_AI_ENABLED]: snapshot.aiEnabledByRole[roleKey] !== false,
        [ETA_FEATURE_KEY_AI_VISIBLE]: snapshot.aiVisibleByRole[roleKey] !== false,
      };
      await storage.updateRoleFeatures(storageRole, next, updatedBy);
    }

    const currentSuperAdmin = await readRoleFeatureMap("super_admin");
    const nextSuperAdmin: Record<string, boolean> = {
      ...currentSuperAdmin,
      [ETA_FEATURE_KEY_AI_ENABLED]: true,
      [ETA_FEATURE_KEY_AI_VISIBLE]: true,
      [ETA_FEATURE_KEY_GLOBAL_ENABLED]: snapshot.aiEnabledGlobal !== false,
    };

    Object.keys(nextSuperAdmin).forEach((featureKey) => {
      if (featureKey.startsWith(ETA_FEATURE_REGION_PREFIX)) {
        delete nextSuperAdmin[featureKey];
      }
    });

    Object.entries(snapshot.aiEnabledByRegion).forEach(([region, enabled]) => {
      const regionKey = normalizeEtaRegionKey(region);
      nextSuperAdmin[`${ETA_FEATURE_REGION_PREFIX}${regionKey}`] = enabled !== false;
    });

    await storage.updateRoleFeatures("super_admin", nextSuperAdmin, updatedBy);
  };

  const refreshEtaControls = async () => {
    try {
      etaControls = await readEtaControlsFromDb();
    } catch (error: any) {
      console.warn("[ETA] Failed to refresh ETA controls from DB, using in-memory snapshot:", error?.message || error);
    }
    return etaControls;
  };

  void refreshEtaControls();

  const getRegionKeyForEta = (order: any): string => {
    const region = String(order?.deliveryRegion || order?.deliveryCity || "global").toLowerCase().trim();
    return normalizeEtaRegionKey(region);
  };

  const isAiEtaEnabledFor = (role: string, regionKey: string): boolean => {
    const roleKey = toEtaRoleKey(role);
    const roleEnabled = etaControls.aiEnabledByRole[roleKey] !== false;
    const regionEnabled = etaControls.aiEnabledByRegion[regionKey] !== false;
    return Boolean(etaControls.aiEnabledGlobal && roleEnabled && regionEnabled);
  };

  const isAiEtaVisibleFor = (role: string): boolean => {
    const roleKey = toEtaRoleKey(role);
    return etaControls.aiVisibleByRole[roleKey] !== false;
  };

  const computeAiEtaAdjustment = (params: {
    rawEtaMinutes: number;
    speedKmh: number;
    distanceKm: number;
    timestampMs: number;
  }) => {
    const date = new Date(params.timestampMs);
    const hour = date.getHours();
    const peakTraffic = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);
    const congestionFactor = peakTraffic ? 1.12 : 1.03;
    const lowSpeedPenalty = params.speedKmh < 18 ? 1.08 : 1.0;
    const shortTripStability = params.distanceKm < 2 ? 0.94 : 1.0;
    const adjusted = Math.max(1, Math.round(params.rawEtaMinutes * congestionFactor * lowSpeedPenalty * shortTripStability));
    const confidenceScore = Math.max(
      0.45,
      Math.min(0.98, 0.92 - (peakTraffic ? 0.08 : 0.03) - (params.speedKmh < 10 ? 0.1 : 0.0)),
    );
    return { adjustedEtaMinutes: adjusted, confidenceScore: Number(confidenceScore.toFixed(2)) };
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

  const resolveZoneBySellerProfile = (seller: any, zones: any[]): string | null => {
    if (!seller) return null;
    if (seller.deliveryZoneId) return String(seller.deliveryZoneId);

    const addressParts = String(seller.businessAddress || "")
      .split(",")
      .map((part) => normalizeZoneText(part))
      .filter(Boolean);

    if (addressParts.length === 0) return null;

    for (const part of addressParts) {
      const zone = zones.find(
        (z) =>
          normalizeZoneText(z.city) === part ||
          normalizeZoneText(z.region) === part ||
          normalizeZoneText(z.name) === part
      );
      if (zone?.id) return String(zone.id);
    }
    return null;
  };

  const resolvePickupStationRecord = (order: any, stations: any[]) => {
    const stationId = String(order?.deliveryZoneId || "").trim();
    if (!stationId) return null;
    return stations.find((station: any) => String(station.id) === stationId) || null;
  };

  const formatPickupStationLocation = (station?: any | null) => {
    if (!station) return null;
    const locationParts = [station.name, station.city, station.region]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    return locationParts.length > 0 ? locationParts.join(", ") : null;
  };

  const resolvePickupAgentsForStation = async (stationId?: string | null) => {
    const normalizedStationId = String(stationId || "").trim();
    if (!normalizedStationId) return [];
    const pickupAgents = await storage.getUsersByRole("pickup_agent");
    return pickupAgents
      .filter((agent: any) => agent?.isActive !== false)
      .filter((agent: any) => String(agent.deliveryZoneId || "").trim() === normalizedStationId)
      .sort((a: any, b: any) => resolveUserDisplayName(a).localeCompare(resolveUserDisplayName(b)));
  };

  const buildPickupStationInfo = async (order: any) => {
    if (!isPickupMethod(order?.deliveryMethod)) return null;
    const stations = await storage.getDeliveryZones(true, "pickup_station");
    const station = resolvePickupStationRecord(order, stations);
    if (!station) return null;
    const agents = await resolvePickupAgentsForStation(station.id);
    const primaryAgent = agents[0] || null;
    return {
      id: station.id,
      name: station.name || null,
      city: station.city || null,
      region: station.region || null,
      locationLabel: formatPickupStationLocation(station),
      pickupAgentName: primaryAgent ? resolveUserDisplayName(primaryAgent) : null,
      pickupAgentPhone: primaryAgent?.phone || null,
    };
  };

  const getRiderMatchCandidates = async (order: any, radiusKm: number, excludedRiderIds: string[] = []): Promise<RiderMatchCandidate[]> => {
    const allRiders = await storage.getUsersByRole("rider");
    const activeRiders = allRiders.filter((r: any) => r.isApproved && r.isActive);
    if (activeRiders.length === 0) return [];

    const allOrders = await storage.getAllOrders();
    const activeOrderCountByRider = buildRiderActiveOrderCountMap(allOrders);

    const excludedSet = new Set(excludedRiderIds);
    const availableRiders = activeRiders.filter((r: any) => !excludedSet.has(r.id));
    if (availableRiders.length === 0) return [];

    const now = Date.now();
    const zones = await storage.getDeliveryZones();
    const orderLocation = getOrderLocationForMatching(order);
    const resolvedOrderZoneId = resolveZoneByOrder(order, zones);
    const riderLocations = await Promise.all(
      availableRiders.map(async (rider: any) => {
        const [location, riskState] = await Promise.all([
          storage.getLatestRiderLocation(rider.id),
          Promise.resolve(getRiderRiskScore(rider.id)),
        ]);
        const riderPrefs = ((rider as any).riderPreferences || {}) as Record<string, any>;
        const prefLocation = (riderPrefs.lastKnownLocation || {}) as Record<string, any>;
        const trackedLat = toFiniteNumber(location?.latitude);
        const trackedLng = toFiniteNumber(location?.longitude);
        const prefLat = toFiniteNumber(prefLocation.latitude);
        const prefLng = toFiniteNumber(prefLocation.longitude);
        const resolvedLat = trackedLat ?? prefLat;
        const resolvedLng = trackedLng ?? prefLng;
        const timestampMs = Math.max(
          toTimestampMs(location?.timestamp),
          toTimestampMs(prefLocation.timestamp),
        );
        const gpsAgeMs = timestampMs > 0 ? Math.max(0, now - timestampMs) : Number.POSITIVE_INFINITY;
        const gpsFresh = gpsAgeMs <= RIDER_GPS_FRESHNESS_MS;
        const hasRecentKnownLocation = gpsAgeMs <= RIDER_LAST_KNOWN_RETENTION_MS;
        const presence = presenceService.getPresence(rider.id);
        const onlineByPresence = Boolean(presence && (presence.status === "online" || presence.status === "away"));
        const onlineByFlag = (rider as any).riderOnline !== false;
        const maxCapacity = resolveRiderMaxCapacity(rider);
        const activeOrderCount = activeOrderCountByRider.get(rider.id) || 0;
        const riskScore = Number(riskState.score || 0);

        return {
          rider,
          riskScore,
          activeOrderCount,
          maxCapacity,
          onlineByPresence,
          onlineByFlag,
          gpsFresh,
          hasRecentKnownLocation,
          gpsAgeMs,
          location: {
            latitude: resolvedLat,
            longitude: resolvedLng,
          },
        };
      }),
    );

    const candidates = riderLocations
      .filter((entry) => {
        if (!entry.onlineByFlag || !entry.onlineByPresence) return false;
        if (!entry.gpsFresh) return false;
        if (!entry.hasRecentKnownLocation) return false;
        if (entry.activeOrderCount >= entry.maxCapacity) return false;
        if (entry.riskScore >= RIDER_RISK_BLOCK_THRESHOLD) return false;
        return true;
      })
      .map(({ rider, location, activeOrderCount, maxCapacity, riskScore, gpsAgeMs }) => {
        const riderLat = toFiniteNumber(location.latitude);
        const riderLng = toFiniteNumber(location.longitude);
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
          activeOrderCount,
          maxCapacity,
          riskScore: Number(riskScore.toFixed(2)),
          gpsAgeSeconds: Number.isFinite(gpsAgeMs) ? Math.max(0, Math.round(gpsAgeMs / 1000)) : null,
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
        if (a.activeOrderCount !== b.activeOrderCount) return a.activeOrderCount - b.activeOrderCount;
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

    // Socket event for live admin dashboards
    [...admins, ...superAdmins].forEach((adminUser: any) => {
      io.to(adminUser.id).emit("order_rider_assignment_failed", payload);
    });

    // Persist admin notifications so it survives page reloads
    await Promise.allSettled([
      ...[...admins, ...superAdmins].map((adminUser: any) =>
        storage.createNotification({
          userId: adminUser.id,
          type: "order",
          title: "Rider Assignment Failed",
          message: `No rider accepted order #${order.orderNumber}. Manual assignment may be required.`,
          metadata: { orderId: order.id, orderNumber: order.orderNumber, attempts: attempts.length, link: "/admin/orders" } as any,
        })
      ),
      // Notify buyer so they know their order is being handled
      order.buyerId
        ? storage.createNotification({
            userId: order.buyerId,
            type: "order",
            title: "Finding Your Rider",
            message: `We're still working on assigning a rider to your order #${order.orderNumber}. Our team has been alerted and will sort this out shortly.`,
            metadata: { orderId: order.id, orderNumber: order.orderNumber, link: "/orders" } as any,
          })
        : Promise.resolve(),
    ]);

    // Also emit to buyer so they see it in real time if they're online
    if (order.buyerId) {
      io.to(order.buyerId).emit("notification", {
        type: "order",
        title: "Finding Your Rider",
        message: `We're still locating a rider for order #${order.orderNumber}. Please hold on.`,
        metadata: { orderId: order.id },
      });
    }
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
      clearPendingRiderAssignment(orderId);
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
    if (await isExternalRiderSystemActive()) {
      throw new Error("Internal rider matching is disabled while the External Rider System is enabled");
    }
    const order = await storage.getOrder(orderId);
    if (!order) {
      throw new Error("Order not found");
    }
    if (!["rider", "bus"].includes(String(order.deliveryMethod || "").toLowerCase().trim())) {
      throw new Error("Order does not require rider delivery");
    }
    let destinationLat = toFiniteNumber((order as any).deliveryLatitude);
    let destinationLng = toFiniteNumber((order as any).deliveryLongitude);
    if (destinationLat === null || destinationLng === null) {
      const extracted = extractCoordinatesFromText((order as any).deliveryAddress);
      if (extracted) {
        destinationLat = extracted.lat;
        destinationLng = extracted.lng;
        await storage.updateOrder(order.id, {
          deliveryLatitude: String(extracted.lat) as any,
          deliveryLongitude: String(extracted.lng) as any,
        } as any);
      }
    }
    if (destinationLat === null || destinationLng === null) {
      throw new Error(
        "Cannot start rider matching: delivery destination coordinates are missing. Update order location first."
      );
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
    if (await isExternalRiderSystemActive()) {
      return;
    }
    for (const orderId of orderIds) {
      try {
        const order = await storage.getOrder(orderId);
        if (!order) continue;
        if (!["rider", "bus"].includes(String(order.deliveryMethod || "").toLowerCase().trim())) continue;
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

  const buildOrderStatusFlow = (history: Array<any>) =>
    [...(history || [])]
      .sort((a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime())
      .map((entry) => String(entry?.toStatus || "").trim())
      .filter(Boolean)
      .join(" -> ");

  const buildOrderReceiptSnapshot = async (order: any) => {
    const [items, history, txRows, commissionRows, seller, buyer, rider, store] = await Promise.all([
      storage.getOrderItems(order.id),
      storage.getOrderStatusHistory(order.id),
      db.execute(
        sql`select * from order_payments where order_id = ${order.id} order by transaction_created_at desc nulls last limit 1`,
      ),
      db.execute(
        sql`select * from platform_commission where order_id = ${order.id} order by commission_created_at desc nulls last limit 1`,
      ),
      storage.getUser(order.sellerId),
      storage.getUser(order.buyerId),
      order.riderId ? storage.getUser(order.riderId) : Promise.resolve(null),
      order.storeId ? storage.getStore(order.storeId) : Promise.resolve(null),
    ]);

    const latestTx = ((txRows as any)?.rows || [])[0] || null;
    const latestCommission = ((commissionRows as any)?.rows || [])[0] || null;
    const busDeliveryWorkflow = isBusMethod(order.deliveryMethod) ? extractBusDeliveryWorkflow(history, order) : null;

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryMethod: order.deliveryMethod,
        deliveryAddress: order.deliveryAddress,
        deliveryCity: order.deliveryCity,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        deliveredAt: order.deliveredAt,
      },
      items: items.map((item: any) => ({
        productId: item.productId,
        productName: item.productName || "Product",
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
        lineTotal: Number(item.price || 0) * Number(item.quantity || 0),
      })),
      financial: {
        subtotal: Number(order.subtotal || 0),
        deliveryFee: Number(order.deliveryFee || 0),
        processingFee: Number(order.processingFee || 0),
        couponDiscount: Number(order.couponDiscount || 0),
        total: Number(order.total || 0),
        currency: order.currency || "GHS",
        sellerPaidAmount: Number(latestCommission?.seller_amount || 0),
        platformCommissionAmount: Number(latestCommission?.commission_amount || 0),
        platformAmount: Number(latestCommission?.platform_amount || 0),
        commissionRate: Number(latestCommission?.commission_rate || 0),
        commissionStatus: latestCommission?.commission_status || null,
      },
      transaction: latestTx
        ? {
            id: latestTx.transaction_id || null,
            status: latestTx.transaction_status || null,
            amount: Number(latestTx.transaction_amount || 0),
            provider: latestTx.payment_provider || null,
            reference: latestTx.payment_reference || null,
            createdAt: latestTx.transaction_created_at || null,
          }
        : null,
      parties: {
        buyer: buyer
          ? { id: buyer.id, name: buyer.name, email: buyer.email, phone: buyer.phone || null }
          : null,
        seller: seller
          ? {
              id: seller.id,
              name: resolveUserDisplayName(seller as any),
              email: seller.email,
              phone: seller.phone || null,
              storeName: (store as any)?.name || seller.storeName || null,
            }
          : null,
        rider: rider
          ? { id: rider.id, name: resolveUserDisplayName(rider as any), email: rider.email, phone: rider.phone || null }
          : null,
      },
      statusFlow: buildOrderStatusFlow(history) || String(order.status || ""),
      statusTimeline: [...(history || [])]
        .sort((a, b) => new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime())
        .map((entry) => ({
          fromStatus: entry?.fromStatus || null,
          toStatus: entry?.toStatus || null,
          changedBy: entry?.changedBy || null,
          changedByRole: entry?.changedByRole || null,
          reason: entry?.reason || null,
          at: entry?.createdAt || null,
        })),
      busDeliveryWorkflow,
      completion: {
        isCompleted: canonicalizeOrderStatus(order.status) === "completed",
        completedAt: canonicalizeOrderStatus(order.status) === "completed" ? order.updatedAt || order.deliveredAt || null : null,
      },
    };
  };

  const upsertReceiptForOrder = async (params: {
    orderId: string;
    trigger?: string;
    generatedBy?: string | null;
    generatedByRole?: string | null;
  }) => {
    const order = await storage.getOrder(params.orderId);
    if (!order) return null;

    const payload = await buildOrderReceiptSnapshot(order);
    const [existing] = await db.select().from(receipts).where(eq(receipts.orderId, params.orderId)).limit(1);
    const safeGeneratedByRole =
      params.generatedByRole &&
      ["super_admin", "admin", "seller", "buyer", "rider", "agent"].includes(params.generatedByRole)
        ? (params.generatedByRole as any)
        : null;

    if (existing) {
      const [updated] = await db
        .update(receipts)
        .set({
          trigger: params.trigger || existing.trigger,
          status: "generated",
          payload: payload as any,
          generatedBy: params.generatedBy || existing.generatedBy,
          generatedByRole: safeGeneratedByRole || existing.generatedByRole,
          updatedAt: new Date(),
        })
        .where(eq(receipts.id, existing.id))
        .returning();
      return updated || existing;
    }

    const receiptNumber = `RCT-${String(order.orderNumber || order.id).replace(/[^A-Za-z0-9-]/g, "").slice(-36)}`;
    const [created] = await db
      .insert(receipts)
      .values({
        receiptNumber,
        orderId: params.orderId,
        generatedBy: params.generatedBy || null,
        generatedByRole: safeGeneratedByRole,
        trigger: params.trigger || "payment_success",
        status: "generated",
        payload: payload as any,
      } as any)
      .returning();
    return created;
  };

  const ensureReceiptsForOrders = async (
    orderIds: string[],
    options: { trigger: string; generatedBy?: string | null; generatedByRole?: string | null },
  ) => {
    const uniqueOrderIds = Array.from(new Set((orderIds || []).filter(Boolean)));
    const results: any[] = [];
    for (const orderId of uniqueOrderIds) {
      try {
        const receipt = await upsertReceiptForOrder({
          orderId,
          trigger: options.trigger,
          generatedBy: options.generatedBy || null,
          generatedByRole: options.generatedByRole || null,
        });
        if (receipt) results.push(receipt);
      } catch (receiptError: any) {
        console.warn(
          `[RECEIPTS] Failed to generate receipt for order ${orderId}:`,
          receiptError?.message || receiptError,
        );
      }
    }
    return results;
  };

  const canAccessOrderReceipt = (order: any, requester: { id: string; role: string }) => {
    const role = String(requester.role || "").toLowerCase().trim();
    if (role === "admin" || role === "super_admin") return true;
    if (role === "buyer") return String(order.buyerId || "") === String(requester.id);
    if (role === "seller") return String(order.sellerId || "") === String(requester.id);
    if (role === "rider") return String(order.riderId || "") === String(requester.id);
    return false;
  };

  const logReportActivity = async (params: {
    requester: { id: string; role: string; email?: string | null };
    reportType: string;
    action: string;
    format?: string | null;
    status?: string | null;
    scope?: Record<string, any>;
    metadata?: Record<string, any>;
    reportId?: string | null;
  }) => {
    const requesterRole = String(params.requester.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    const safeRole = requesterRole === "superadmin" ? "super_admin" : requesterRole;
    const reportId =
      params.reportId ||
      `RPT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const [entry] = await db
      .insert(reportActivityLogs)
      .values({
        requestedBy: params.requester.id,
        requesterRole: safeRole as any,
        reportType: params.reportType,
        action: params.action,
        format: params.format || null,
        status: params.status || "success",
        reportId,
        scope: (params.scope || {}) as any,
        metadata: (params.metadata || {}) as any,
      } as any)
      .returning();

    if (safeRole !== "super_admin") {
      const actorLabel = params.requester.email || params.requester.id;
      const tense =
        params.action === "request"
          ? "requested"
          : params.action === "generate"
          ? "generated"
          : params.action === "download"
          ? "downloaded"
          : "performed";
      await notifyAdmins(
        "system",
        "Report Activity",
        `${actorLabel} (${safeRole}) ${tense} ${params.reportType} report${params.format ? ` (${params.format.toUpperCase()})` : ""}.`,
        {
          reportId,
          reportType: params.reportType,
          action: params.action,
          scope: params.scope || {},
          status: params.status || "success",
          actorId: params.requester.id,
          actorRole: safeRole,
          link: "/admin/analytics",
        },
        { requiredAdminPermission: "view_analytics" },
      );
    }

    return entry;
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
    const lifecycleEvent = mapCanonicalStatusToTripLifecycleEvent(canonicalStatus);
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
        if (lifecycleEvent) {
          io.to(userId).emit("trip_lifecycle_event", {
            event: lifecycleEvent,
            trip_id: order.id,
            orderNumber: order.orderNumber,
            rider_id: order.riderId || null,
            state: canonicalStatus,
            timestamp: payload.updatedAt,
            vehicle: {
              type: order?.vehicleType || null,
              color: order?.vehicleColor || null,
              model: order?.vehicleModel || null,
            },
          });
        }
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
      if (lifecycleEvent) {
        io.to(adminUser.id).emit("trip_lifecycle_event", {
          event: lifecycleEvent,
          trip_id: order.id,
          orderNumber: order.orderNumber,
          rider_id: order.riderId || null,
          state: canonicalStatus,
          timestamp: payload.updatedAt,
          vehicle: {
            type: order?.vehicleType || null,
            color: order?.vehicleColor || null,
            model: order?.vehicleModel || null,
          },
        });
      }
    });

    // Notify the pickup agent(s) assigned to this order's station for pickup orders
    const isPickupDelivery = String(order.deliveryMethod || "").toLowerCase().trim() === "pickup";
    if (isPickupDelivery && order.deliveryZoneId) {
      try {
        const pickupAgents = await storage.getUsersByRole("pickup_agent");
        const assignedAgents = pickupAgents.filter(
          (a: any) => a.isActive !== false && String(a.deliveryZoneId || "").trim() === String(order.deliveryZoneId).trim()
        );
        assignedAgents.forEach((agent: any) => {
          io.to(agent.id).emit("order_status_updated", {
            ...payload,
            status: canonicalStatus,
          });
        });
      } catch {
        // non-critical
      }
    }
  };

  const createRiderPayoutIfMissing = async (order: any, riderId: string | null | undefined) => {
    if (!order?.deliveryFee || !riderId) return;

    const existingPayout = await db
      .select({ id: riderPayouts.id })
      .from(riderPayouts)
      .where(and(eq(riderPayouts.orderId, order.id), eq(riderPayouts.riderId, riderId)))
      .limit(1);
    if (existingPayout.length > 0) return;

    try {
      const rider = await storage.getUser(riderId);
      const payout = await storage.createRiderPayout({
        riderId,
        orderId: order.id,
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
          title: "Payout Action Required",
          message: `Order #${order.orderNumber} delivered by ${rider?.name || "Rider"}. Amount: ${order.currency || "GHS"} ${order.deliveryFee}. Status: Completed & Verified.`,
          metadata: {
            link: `/admin/riders-payouts`,
            payoutId: payout.id,
            orderId: order.id,
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
        orderId: order.id,
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
  };

  const finalizeRiderDelivery = async (orderId: string, riderId: string, reason: string) => {
    const order = await storage.getOrder(orderId);
    if (!order) {
      const error = new Error("Order not found");
      (error as any).code = 404;
      throw error;
    }
    if (isBusMethod(order.deliveryMethod)) {
      const error = new Error(
        "BUS delivery is handoff-based. Riders cannot complete BUS orders; submit transport proof and wait for super admin confirmation."
      );
      (error as any).code = 409;
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
    await createRiderPayoutIfMissing(order, riderId);
    await ensureReceiptsForOrders([orderId], {
      trigger: "order_completed",
      generatedBy: riderId,
      generatedByRole: "rider",
    });

    // Complete referral for buyer on first delivered order
    if (order.buyerId) {
      checkAndCompleteReferral(order.buyerId).catch(() => {});
    }

    return updatedOrder;
  };

  app.post("/api/orders", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { items, ...orderData } = req.body;
      const initialOrderStatus = "pending";
      
      if (!items || items.length === 0) {
        return res.status(400).json({ error: "Order must contain at least one item" });
      }

      const [_, platformSettings] = await Promise.all([
        typeof (storage as any).resolveBuyerUnpaidOrders === "function"
          ? (storage as any).resolveBuyerUnpaidOrders(req.user!.id)
          : Promise.resolve(0),
        storage.getPlatformSettings(),
      ]);

      // Get platform settings to check if multi-vendor mode is enabled
      const platformIsMultiVendor = platformSettings?.isMultiVendor ?? false;
      const externalRiderSystemEnabled = !!platformSettings?.isExternalRiderSystemEnabled;
      const processingFeePercent = Number(platformSettings?.processingFeePercent ?? "1.95");
      const processingFeeRate = Number.isFinite(processingFeePercent) ? processingFeePercent / 100 : 0.0195;
      const computeExactProcessingFee = (chargeableBase: number) => {
        const normalizedBase = Math.max(0, chargeableBase);
        if (normalizedBase <= 0 || processingFeeRate <= 0 || processingFeeRate >= 1) {
          return 0;
        }
        return normalizedBase * processingFeeRate / (1 - processingFeeRate);
      };
      const primaryStoreForSingleStore =
        !platformIsMultiVendor && platformSettings?.primaryStoreId
          ? await storage.getStore(platformSettings.primaryStoreId)
          : null;
      
      // Server-side price recalculation to prevent tampering
      let serverSubtotal = 0;
      let serverProductSavings = 0;
      const validatedItems = [];
      const productsBySeller = new Map<string, { sellerId: string; storeId: string | null; products: any[] }>();

      const resolvedProducts = await Promise.all(
        items.map(async (item: any) => ({
          item,
          product: await storage.getProduct(item.productId),
        })),
      );

      for (const { item, product } of resolvedProducts) {
        if (!product) {
          return res.status(404).json({ error: `Product ${item.productId} not found` });
        }
        if (primaryStoreForSingleStore) {
          const sellerMismatch = product.sellerId !== primaryStoreForSingleStore.primarySellerId;
          const productStoreId = String(product.storeId || "").trim();
          const storeMismatch = !!productStoreId && productStoreId !== primaryStoreForSingleStore.id;
          if (sellerMismatch || storeMismatch) {
            return res.status(409).json({
              error: "Single-store scope violation",
              userMessage: "This order includes products outside the active store scope. Refresh and retry with products from the primary store only.",
            });
          }
        }
        
        if (String(product.sellerId || "").trim() === String(req.user!.id || "").trim()) {
          return res.status(403).json({
            error: "Self purchase is not allowed",
            userMessage: "You cannot place an order for your own product. Remove it from your cart to continue.",
          });
        }

        if (!product.isActive) {
          return res.status(400).json({ error: `Product ${product.name} is no longer available` });
        }
        
        // Calculate actual price with discount
        const normalizedVariantId = String(item.variantId || "").trim() || null;
        const normalizedSelectedColor = String(item.selectedColor || "").trim() || null;
        const normalizedSelectedSize = String(item.selectedSize || "").trim() || null;
        const normalizedSelectedImageIndex = Number.isFinite(Number(item.selectedImageIndex))
          ? Math.max(0, Number(item.selectedImageIndex) || 0)
          : 0;
        const productVariantRows = await storage.getProductVariants(product.id).catch(() => []);
        const currentVariant = normalizedVariantId
          ? productVariantRows.find((variant: any) => String(variant.id) === normalizedVariantId)
          : null;

        if (productVariantRows.length > 0 && !normalizedVariantId) {
          return res.status(400).json({
            error: "Variant selection is required",
            userMessage: "Please choose the product option again before checking out.",
          });
        }

        if (normalizedVariantId && !currentVariant) {
          return res.status(400).json({
            error: "Selected variant is invalid",
            userMessage: "The selected product option is no longer available. Please choose it again.",
          });
        }

        const originalPrice = parseFloat(product.price);
        const discount = product.discount || 0;
        const discountedPrice = originalPrice * (1 - discount / 100);
        const itemTotal = discountedPrice * item.quantity;
        
        // Track savings
        serverProductSavings += (originalPrice - discountedPrice) * item.quantity;
        serverSubtotal += itemTotal;
        
        const validatedItem = {
          productId: item.productId,
          variantId: normalizedVariantId,
          selectedColor: normalizedSelectedColor || String(currentVariant?.color || "").trim() || null,
          selectedSize: normalizedSelectedSize || String(currentVariant?.size || "").trim() || null,
          selectedImageIndex: normalizedSelectedImageIndex,
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
      const requestedExternalDeliveryByBus = orderData.externalDeliveryByBus === true;
      const requestedExternalDeliveryType = String(orderData.externalDeliveryType || "").toLowerCase().trim();
      const deliveryFee = externalRiderSystemEnabled
        ? 0
        : parseFloat(orderData.deliveryFee || "0");
      const clientTotal = parseFloat(orderData.total || "0");
      
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
      const effectiveExternalDeliveryType =
        externalRiderSystemEnabled && !isPickupOrder
          ? (requestedExternalDeliveryType === "bus" || requestedExternalDeliveryType === "third_party"
              ? requestedExternalDeliveryType
              : requestedExternalDeliveryByBus
                ? "bus"
                : "third_party")
          : null;
      if (
        externalRiderSystemEnabled &&
        !isPickupOrder &&
        effectiveExternalDeliveryType !== "bus" &&
        effectiveExternalDeliveryType !== "third_party"
      ) {
        return res.status(400).json({
          error: "Invalid external delivery type",
          userMessage: "Please choose either VIP Bus Delivery or Third-Party Delivery before placing your order.",
        });
      }
      const effectiveExternalDeliveryByBus = effectiveExternalDeliveryType === "bus";
      const storedDeliveryMethod = externalRiderSystemEnabled && !isPickupOrder
        ? "rider"
        : normalizedDeliveryMethod;
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
      const pickupStationId = isPickupOrder ? String(orderData.deliveryZoneId || "").trim() : "";
      const resolvedDeliveryZoneId =
        isPickupOrder
          ? (pickupStationId || null)
          : externalRiderSystemEnabled
            ? null
            : (orderData.deliveryZoneId || null);
      if (isPickupOrder) {
        const pickupStations = await storage.getDeliveryZones(false, "pickup_station");
        if (pickupStations.length > 0 && !pickupStationId) {
          return res.status(400).json({
            error: "Pickup station is required",
            userMessage: "Please choose a pickup station before placing this pickup order.",
          });
        }
        if (pickupStationId) {
          const matchingPickupStation = pickupStations.find((station: any) => String(station.id) === pickupStationId);
          if (!matchingPickupStation) {
            return res.status(400).json({
              error: "Pickup station is invalid",
              userMessage: "The selected pickup station is no longer available. Please choose another one.",
            });
          }
        }
      }
      const resolvedDeliveryLatitude = isPickupOrder ? null : toFiniteNumber(orderData.deliveryLatitude);
      const resolvedDeliveryLongitude = isPickupOrder ? null : toFiniteNumber(orderData.deliveryLongitude);

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
      if (!isPickupOrder && (resolvedDeliveryLatitude === null || resolvedDeliveryLongitude === null)) {
        return res.status(400).json({
          error: "Delivery coordinates are required",
          userMessage: externalRiderSystemEnabled
            ? "Please pin your location on the map so customer service can coordinate external delivery."
            : "Please pin your location on the map so rider navigation can be enabled.",
        });
      }
      if (
        !isPickupOrder &&
        (resolvedDeliveryLatitude! < -90 ||
          resolvedDeliveryLatitude! > 90 ||
          resolvedDeliveryLongitude! < -180 ||
          resolvedDeliveryLongitude! > 180)
      ) {
        return res.status(400).json({
          error: "Delivery coordinates are invalid",
          userMessage: "The selected delivery location is invalid. Please reselect your location.",
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
            const sellerProcessingFee = computeExactProcessingFee(
              sellerSubtotal - sellerCouponDiscount + sellerDeliveryFee
            );
            const sellerTotal = sellerSubtotal - sellerCouponDiscount + sellerDeliveryFee + sellerProcessingFee;
            
            return {
              sellerId: sellerGroup.sellerId,
              storeId: sellerGroup.storeId,
              items: sellerGroup.products.map(p => ({
                productId: p.productId,
                variantId: p.variantId || null,
                selectedColor: p.selectedColor || null,
                selectedSize: p.selectedSize || null,
                selectedImageIndex: p.selectedImageIndex ?? 0,
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
          status: initialOrderStatus,
          deliveryMethod: storedDeliveryMethod,
          externalDeliveryByBus: effectiveExternalDeliveryByBus,
          externalDeliveryType: effectiveExternalDeliveryType,
          deliveryZoneId: resolvedDeliveryZoneId,
          deliveryAddress: resolvedDeliveryAddress,
          deliveryCity: resolvedDeliveryCity,
          deliveryPhone: resolvedDeliveryPhone,
          deliveryLatitude: resolvedDeliveryLatitude !== null ? String(resolvedDeliveryLatitude) : null,
          deliveryLongitude: resolvedDeliveryLongitude !== null ? String(resolvedDeliveryLongitude) : null,
          currency: orderData.currency || 'GHS',
          paymentStatus: 'pending',
          couponCode: orderData.couponCode || null,
          estimatedDelivery: orderData.estimatedDelivery || null,
        };
        
        const aggregateMultiVendorTotal = itemsBySeller.reduce((sum, sellerGroup) => sum + sellerGroup.total, 0);
        if (Math.abs(aggregateMultiVendorTotal - clientTotal) > 0.02) {
          return res.status(400).json({
            error: "Total amount mismatch. Please refresh and try again.",
            serverTotal: aggregateMultiVendorTotal.toFixed(2),
            clientTotal: clientTotal.toFixed(2),
          });
        }

        const result = await storage.createMultiSellerOrders(baseOrderData as any, itemsBySeller);
        sessionId = result.sessionId;
        createdOrders = result.orders;
        
        console.info(`[ORDER] Created ${createdOrders.length} orders for multi-vendor checkout (session: ${sessionId})`);
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
        const finalProcessingFee = computeExactProcessingFee(
          serverSubtotal - singleVendorCouponDiscount + deliveryFee
        );
        const finalTotal = serverSubtotal - singleVendorCouponDiscount + deliveryFee + finalProcessingFee;
        if (Math.abs(finalTotal - clientTotal) > 0.02) {
          return res.status(400).json({
            error: "Total amount mismatch. Please refresh and try again.",
            serverTotal: finalTotal.toFixed(2),
            clientTotal: clientTotal.toFixed(2),
          });
        }
        
        const orderInput = {
          ...orderData,
          buyerId: req.user!.id,
          status: initialOrderStatus,
          deliveryMethod: storedDeliveryMethod,
          externalDeliveryByBus: effectiveExternalDeliveryByBus,
          externalDeliveryType: effectiveExternalDeliveryType,
          deliveryZoneId: resolvedDeliveryZoneId,
          deliveryCity: resolvedDeliveryCity,
          deliveryAddress: resolvedDeliveryAddress,
          deliveryPhone: resolvedDeliveryPhone,
          deliveryLatitude: resolvedDeliveryLatitude !== null ? String(resolvedDeliveryLatitude) : null,
          deliveryLongitude: resolvedDeliveryLongitude !== null ? String(resolvedDeliveryLongitude) : null,
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
          variantId: v.variantId || null,
          selectedColor: v.selectedColor || null,
          selectedSize: v.selectedSize || null,
          selectedImageIndex: v.selectedImageIndex ?? 0,
          quantity: v.quantity,
          price: v.price,
          total: v.total
        })));
        createdOrders = [order];
      }
      // Return response: single order for single-vendor (backward compatible)
      // or first order + session info for multi-vendor
      const responsePayload = isMultiVendor
        ? {
            ...createdOrders[0],
            checkoutSessionId: sessionId,
            isMultiVendor: true,
            totalOrders: createdOrders.length,
          }
        : createdOrders[0];

      res.json(responsePayload);

      // Rider matching starts only after payment verification to keep assignment deterministic.
      // Run non-critical post-order side effects after the response so checkout stays fast.
      void (async () => {
        const createdOrderNumbers = createdOrders.map((o: any) => `#${o.orderNumber}`).join(", ");

        try {
          await notifyAdmins(
            "order",
            "New Order Created",
            `${createdOrders.length} order(s) created by ${req.user!.email}: ${createdOrderNumbers}.`,
            {
              buyerId: req.user!.id,
              orderIds: createdOrders.map((o: any) => o.id),
              orderNumbers: createdOrderNumbers,
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

        try {
          const inventorySnapshot = validatedItems.map((item: any) => ({
            productId: item.productId,
            quantityPurchased: Number(item.quantity || 0),
          }));
          clearProductListCache();
          io.emit("product_inventory_updated", {
            orderIds: createdOrders.map((o: any) => o.id),
            buyerId: req.user!.id,
            items: inventorySnapshot,
            timestamp: new Date().toISOString(),
          });
        } catch (inventoryEventError) {
          console.error("[ORDERS] Could not emit product inventory update:", inventoryEventError);
        }
      })();

      return;
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/orders", requireAuth, requireRoleFeature("orders.view"), async (req: AuthRequest, res) => {
    try {
      const userRole = req.user!.role as "admin" | "super_admin" | "buyer" | "seller" | "rider" | "agent";
      // Allow context override: buyers can shop, sellers/riders/agents can view purchases vs their work orders
      const context = (req.query.context as string) || userRole;
      const includeItems = String(req.query.includeItems || "true").toLowerCase() !== "false";
      const lightweightList = !includeItems;
      
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
          const [items, orderHistory] = includeItems
            ? await Promise.all([
                storage.getOrderItems(order.id),
                storage.getOrderStatusHistory(order.id),
              ])
            : [[], []];
          const verificationSummary = includeItems ? extractVerificationSummary(orderHistory) : null;
          const busDeliveryWorkflow = includeItems && isBusMethod(order.deliveryMethod)
            ? extractBusDeliveryWorkflow(orderHistory, order)
            : null;
          const normalizedVerificationSummary = verificationSummary && isBusMethod(order.deliveryMethod)
            ? {
                sellerToRider: verificationSummary.sellerToRider || null,
                riderToBuyer: null,
                sellerToBuyer: null,
              }
            : verificationSummary;
          const buyer = buyersById.get(order.buyerId);
          const seller = sellersById.get(order.sellerId);
          const orderStore = order.storeId ? storesById.get(order.storeId) : null;
          const fallbackSeller =
            !seller && orderStore?.primarySellerId ? await storage.getUser(orderStore.primarySellerId) : null;
          let resolvedSeller = seller || fallbackSeller;
          let resolvedStore = orderStore || sellerStoresBySellerId.get(order.sellerId) || null;
          if (!lightweightList && (!resolvedSeller || !resolvedStore)) {
            const inferred = await inferOrderSellerContext(order);
            if (!resolvedSeller && inferred.sellerRecord) resolvedSeller = inferred.sellerRecord;
            if (!resolvedStore && inferred.storeRecord) resolvedStore = inferred.storeRecord;
            // Self-heal historical orders that missed seller/store linkage.
            if ((!order.sellerId && inferred.sellerId) || (!order.storeId && inferred.storeId)) {
              await storage.updateOrder(order.id, {
                sellerId: (order.sellerId || inferred.sellerId) as any,
                storeId: (order.storeId || inferred.storeId) as any,
              } as any);
            }
          }
          const rider = order.riderId ? ridersById.get(order.riderId) : null;
          const pickupStationInfo = includeItems ? await buildPickupStationInfo(order) : null;
          const securedOrder = sanitizeOrderVerificationSecrets(order, req.user!);
          const deliveryMethod = String(order?.deliveryMethod || "").toLowerCase().trim();
          const isPickup = deliveryMethod === "pickup";
          const isBus = deliveryMethod === "bus";
          const isManualExternalDelivery = isManualExternalDeliveryOrder(order as any);
          const isBuyerOrAdminViewer =
            req.user!.role === "buyer" ||
            req.user!.role === "customer" ||
            req.user!.role === "admin" ||
            req.user!.role === "super_admin" ||
            String(order?.buyerId || "") === String(req.user!.id);
          if (includeItems && isBuyerOrAdminViewer) {
            if (isPickup && !securedOrder.pickupOtp) {
              const newPickupOtp = generateOrderOtp();
              await storage.updateOrder(order.id, { pickupOtp: newPickupOtp } as any);
              securedOrder.pickupOtp = newPickupOtp;
            }
            if (!isPickup && !isBus && !isManualExternalDelivery && !securedOrder.deliveryOtp) {
              const newDeliveryOtp = generateOrderOtp();
              await storage.updateOrder(order.id, { deliveryOtp: newDeliveryOtp } as any);
              securedOrder.deliveryOtp = newDeliveryOtp;
            }
          }
          const visible = resolveVisibleOrderStateForRole(securedOrder as any, req.user!.role);
          return {
            ...securedOrder,
            status: visible.status,
            _hiddenForViewer: visible.hidden,
            totalAmount: order.total,
            items,
            verificationSummary: normalizedVerificationSummary,
            busDeliveryWorkflow,
            seller: (resolvedSeller || resolvedStore)
              ? {
                  id: resolvedSeller?.id || resolvedStore?.primarySellerId || order.sellerId || null,
                  name: resolvedSeller ? resolveUserDisplayName(resolvedSeller) : null,
                  storeName: resolvedStore?.name || resolvedSeller?.storeName || null,
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
                  name: resolveUserDisplayName(buyer),
                  email: buyer.email,
                  phone: buyer.phone,
                }
              : undefined,
            pickupStationInfo,
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

  app.get(
    "/api/pickup-agent/orders",
    requireAuth,
    requireRole("pickup_agent"),
    requireRoleFeature("orders.view"),
    async (req: AuthRequest, res) => {
      try {
        const pickupAgent = await storage.getUser(req.user!.id);
        const agentZoneId = String(pickupAgent?.deliveryZoneId || "").trim();
        if (!agentZoneId) {
          return res.json([]);
        }

        const [allOrders, pickupStations] = await Promise.all([
          storage.getAllOrders(),
          storage.getDeliveryZones(false, "pickup_station"),
        ]);

        const pickupOrders = allOrders.filter((order: any) => {
          const normalizedMethod = String(order?.deliveryMethod || "").toLowerCase().trim();
          const normalizedStatus = String(order?.status || "").toLowerCase().trim();
          return normalizedMethod === "pickup" && normalizedStatus !== "cancelled";
        });

        const zoneMatchedOrders: Array<{ order: any; store: any; seller: any; resolvedZoneId: string }> = [];
        for (const order of pickupOrders) {
          const store = order.storeId ? await storage.getStore(order.storeId) : null;
          const seller =
            (order.sellerId ? await storage.getUser(order.sellerId) : null) ||
            (store?.primarySellerId ? await storage.getUser(store.primarySellerId) : null);
          const resolvedZoneId = String(order.deliveryZoneId || "").trim();

          if (resolvedZoneId && String(resolvedZoneId) === agentZoneId) {
            zoneMatchedOrders.push({ order, store, seller, resolvedZoneId });
          }
        }

        const payload = await Promise.all(
          zoneMatchedOrders.map(async ({ order, store, seller, resolvedZoneId }) => {
            const [buyer, items] = await Promise.all([
              storage.getUser(order.buyerId),
              storage.getOrderItems(order.id),
            ]);
            const zone = pickupStations.find((candidate: any) => String(candidate.id) === String(resolvedZoneId));
            return {
              id: order.id,
              orderNumber: order.orderNumber,
              status: order.status,
              total: order.total,
              createdAt: order.createdAt,
              storeName: store?.name || seller?.storeName || null,
              sellerName: seller ? resolveUserDisplayName(seller) : null,
              sellerPhone: seller?.phone || null,
              buyerName: buyer?.name || null,
              buyerPhone: buyer?.phone || order.deliveryPhone || null,
              zoneId: resolvedZoneId,
              zoneName: zone?.name || zone?.city || zone?.region || null,
              itemCount: items.length,
              items: items.map((item) => ({
                productName: item.productName,
                quantity: item.quantity,
              })),
            };
          }),
        );

        res.json(payload);
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  );

  // --- Pickup Agent Stats ---
  const agentShifts = new Map<string, { startedAt: string; verificationsThisShift: number }>();

  app.get("/api/pickup-agent/stats", requireAuth, requireRole("pickup_agent"), async (req: AuthRequest, res) => {
    try {
      const pickupAgent = await storage.getUser(req.user!.id);
      const agentZoneId = String(pickupAgent?.deliveryZoneId || "").trim();
      if (!agentZoneId) {
        return res.json({ totalVerifications: 0, verificationsToday: 0, verificationsThisMonth: 0, pendingOrders: 0, zoneName: null, shift: null });
      }
      const allOrders = await storage.getAllOrders();
      const pickupOrders = allOrders.filter((order: any) => {
        const method = String(order?.deliveryMethod || "").toLowerCase().trim();
        const zoneId = String(order?.deliveryZoneId || "").trim();
        return method === "pickup" && zoneId === agentZoneId;
      });
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const completedOrders = pickupOrders.filter((o: any) => String(o.status || "").toLowerCase() === "completed");
      const todayCompletions = completedOrders.filter((o: any) => o.updatedAt && new Date(o.updatedAt) >= todayStart);
      const monthCompletions = completedOrders.filter((o: any) => o.updatedAt && new Date(o.updatedAt) >= monthStart);
      const pendingOrders = pickupOrders.filter((o: any) => !["completed", "cancelled"].includes(String(o.status || "").toLowerCase())).length;
      const zones = await storage.getDeliveryZones(true, "pickup_station");
      const zone = zones.find((z: any) => String(z.id) === agentZoneId);
      const shift = agentShifts.get(req.user!.id) || null;
      res.json({
        totalVerifications: completedOrders.length,
        verificationsToday: todayCompletions.length,
        verificationsThisMonth: monthCompletions.length,
        pendingOrders,
        zoneName: zone?.name || zone?.city || null,
        shift: shift ? { onShift: true, startedAt: shift.startedAt, verificationsThisShift: shift.verificationsThisShift } : { onShift: false, startedAt: null, verificationsThisShift: 0 },
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/pickup-agent/shift", requireAuth, requireRole("pickup_agent"), requireRoleFeature("shifts.manage"), async (req: AuthRequest, res) => {
    const shift = agentShifts.get(req.user!.id);
    res.json({ onShift: !!shift, startedAt: shift?.startedAt || null, verificationsThisShift: shift?.verificationsThisShift || 0 });
  });

  app.post("/api/pickup-agent/shift/start", requireAuth, requireRole("pickup_agent"), requireRoleFeature("shifts.manage"), async (req: AuthRequest, res) => {
    if (agentShifts.has(req.user!.id)) {
      return res.status(400).json({ error: "You already have an active shift. End your current shift first." });
    }
    agentShifts.set(req.user!.id, { startedAt: new Date().toISOString(), verificationsThisShift: 0 });
    res.json({ onShift: true, startedAt: agentShifts.get(req.user!.id)!.startedAt, verificationsThisShift: 0 });
  });

  app.post("/api/pickup-agent/shift/end", requireAuth, requireRole("pickup_agent"), requireRoleFeature("shifts.manage"), async (req: AuthRequest, res) => {
    const shift = agentShifts.get(req.user!.id);
    if (!shift) {
      return res.status(400).json({ error: "No active shift to end." });
    }
    const summary = { startedAt: shift.startedAt, endedAt: new Date().toISOString(), verificationsThisShift: shift.verificationsThisShift };
    agentShifts.delete(req.user!.id);
    res.json({ onShift: false, summary });
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
      const deliveryMethod = String(finalOrder?.deliveryMethod || "").toLowerCase().trim();
      const isPickup = deliveryMethod === "pickup";
      const isBus = deliveryMethod === "bus";
      const isManualExternalDelivery = isManualExternalDeliveryOrder(finalOrder as any);
      const isBuyerOrAdminViewer =
        req.user!.role === "buyer" ||
        req.user!.role === "customer" ||
        req.user!.role === "admin" ||
        req.user!.role === "super_admin" ||
        String(finalOrder?.buyerId || "") === String(req.user!.id);
      if (isBuyerOrAdminViewer) {
        if (isPickup && !securedOrder.pickupOtp) {
          const newPickupOtp = generateOrderOtp();
          await storage.updateOrder(finalOrder.id, { pickupOtp: newPickupOtp } as any);
          securedOrder.pickupOtp = newPickupOtp;
        }
        if (!isPickup && !isBus && !isManualExternalDelivery && !securedOrder.deliveryOtp) {
          const newDeliveryOtp = generateOrderOtp();
          await storage.updateOrder(finalOrder.id, { deliveryOtp: newDeliveryOtp } as any);
          securedOrder.deliveryOtp = newDeliveryOtp;
        }
        if (isPickup && !securedOrder.pickupOtp) {
          const newPickupOtp = generateOrderOtp();
          await storage.updateOrder(finalOrder.id, { pickupOtp: newPickupOtp } as any);
          securedOrder.pickupOtp = newPickupOtp;
        }
        if (!isPickup && !isBus && !isManualExternalDelivery && !securedOrder.deliveryOtp) {
          const newDeliveryOtp = generateOrderOtp();
          await storage.updateOrder(finalOrder.id, { deliveryOtp: newDeliveryOtp } as any);
          securedOrder.deliveryOtp = newDeliveryOtp;
        }
      }
      const visible = resolveVisibleOrderStateForRole(securedOrder as any, req.user!.role);
      const orderHistory = await storage.getOrderStatusHistory(securedOrder.id);
      const verificationSummary = extractVerificationSummary(orderHistory);
      const busDeliveryWorkflow = isBusMethod(securedOrder.deliveryMethod)
        ? extractBusDeliveryWorkflow(orderHistory, securedOrder)
        : null;
      const normalizedVerificationSummary = isBusMethod(securedOrder.deliveryMethod)
        ? {
            sellerToRider: verificationSummary.sellerToRider || null,
            riderToBuyer: null,
            sellerToBuyer: null,
          }
        : verificationSummary;
      
      // Enforce stakeholder access for order detail reads.
      const isAdmin = req.user!.role === "admin" || req.user!.role === "super_admin";
      const isSupportAgent = req.user!.role === "agent";
      const isBuyer = req.user!.id === securedOrder.buyerId;
      const isSeller = req.user!.id === securedOrder.sellerId;
      const isRider = !!securedOrder.riderId && req.user!.id === securedOrder.riderId;
      const isStakeholder = isBuyer || isSeller || isRider;

      if (!isAdmin && !isSupportAgent && !isStakeholder) {
        return res.status(403).json({ error: "Unauthorized to view this order" });
      }
      if (!isAdmin && !isSupportAgent && visible.hidden) {
        return res.status(404).json({ error: "Order not found" });
      }

      const pickupStationInfo = await buildPickupStationInfo(securedOrder);
      const items = await storage.getOrderItems(securedOrder.id);
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
      {
        const inferred = await inferOrderSellerContext(securedOrder as any);
        const resolvedSeller = inferred.sellerRecord;
        const resolvedStore = inferred.storeRecord;
        if (resolvedSeller) {
          sellerInfo = {
            id: resolvedSeller.id,
            name: resolveUserDisplayName(resolvedSeller),
            storeName: resolvedStore?.name || resolvedSeller.storeName || null,
            email: resolvedSeller.email || null,
            phone: resolvedSeller.phone || null,
          };
        } else if (resolvedStore) {
          sellerInfo = {
            id: resolvedStore.primarySellerId || securedOrder.sellerId || null,
            name: null,
            storeName: resolvedStore.name || null,
            email: null,
            phone: null,
          };
        }
        if ((!securedOrder.sellerId && inferred.sellerId) || (!securedOrder.storeId && inferred.storeId)) {
          await storage.updateOrder(securedOrder.id, {
            sellerId: (securedOrder.sellerId || inferred.sellerId) as any,
            storeId: (securedOrder.storeId || inferred.storeId) as any,
          } as any);
        }
      }
      
      const sellerLimitedOrderPayload = isSeller && !isAdmin && !isSupportAgent && !isBuyer
        ? {
            ...securedOrder,
            deliveryPhone: null,
          }
        : securedOrder;

      // Include customer contact details only for admin/support staff and the buyer.
      if (isAdmin || isSupportAgent || isBuyer) {
        // Fetch customer/buyer information to display in order details
        const buyer = await storage.getUser(finalOrder.buyerId);
        
        // Return order with complete customer info (authorized)
        res.json({
          ...sellerLimitedOrderPayload,
          items,
          riderInfo,
          sellerInfo,
          pickupStationInfo,
          verificationSummary: normalizedVerificationSummary,
          busDeliveryWorkflow,
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
          ...sellerLimitedOrderPayload,
          items,
          riderInfo,
          sellerInfo,
          pickupStationInfo,
          verificationSummary: normalizedVerificationSummary,
          busDeliveryWorkflow,
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
      const regionKey = getRegionKeyForEta(order);
      const aiEnabled = isAiEtaEnabledFor(req.user!.role, regionKey);
      const ai = computeAiEtaAdjustment({
        rawEtaMinutes: eta.etaMinutes,
        speedKmh: eta.speedKmh,
        distanceKm: eta.distanceKm,
        timestampMs: Date.now(),
      });
      const finalEtaMinutes = aiEnabled ? ai.adjustedEtaMinutes : eta.etaMinutes;
      const aiVisible = isAiEtaVisibleFor(req.user!.role);

      res.json({
        orderId: order.id,
        orderNumber: order.orderNumber,
        ...eta,
        etaMinutes: finalEtaMinutes,
        rawEtaMinutes: eta.etaMinutes,
        aiEtaMinutes: aiEnabled ? ai.adjustedEtaMinutes : eta.etaMinutes,
        etaConfidenceScore: aiEnabled ? ai.confidenceScore : 1,
        aiEtaEnabled: aiEnabled,
        aiEtaVisible: aiVisible,
        etaRegion: regionKey,
        calculatedAt: new Date().toISOString(),
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get(
    "/api/admin/eta-controls",
    requireAuth,
    requireRole("super_admin"),
    async (_req: AuthRequest, res) => {
      await refreshEtaControls();
      return res.json({
        ...etaControls,
      });
    },
  );

  app.patch(
    "/api/admin/eta-controls",
    requireAuth,
    requireRole("super_admin"),
    async (req: AuthRequest, res) => {
      const body = req.body || {};
      const current = await refreshEtaControls();
      const next: EtaControlsSnapshot = {
        aiEnabledGlobal: current.aiEnabledGlobal,
        aiEnabledByRegion: { ...current.aiEnabledByRegion },
        aiEnabledByRole: { ...current.aiEnabledByRole },
        aiVisibleByRole: { ...current.aiVisibleByRole },
      };

      if (typeof body.aiEnabledGlobal === "boolean") {
        next.aiEnabledGlobal = body.aiEnabledGlobal;
      }

      if (body.aiEnabledByRegion && typeof body.aiEnabledByRegion === "object") {
        Object.entries(body.aiEnabledByRegion).forEach(([region, enabled]) => {
          if (typeof enabled !== "boolean") return;
          const regionKey = normalizeEtaRegionKey(String(region));
          next.aiEnabledByRegion[regionKey] = enabled;
        });
      }

      if (body.aiEnabledByRole && typeof body.aiEnabledByRole === "object") {
        ETA_MUTABLE_ROLE_KEYS.forEach((roleKey) => {
          const incoming = (body.aiEnabledByRole as any)[roleKey];
          if (typeof incoming === "boolean") {
            next.aiEnabledByRole[roleKey] = incoming;
          }
        });
      }

      if (body.aiVisibleByRole && typeof body.aiVisibleByRole === "object") {
        ETA_MUTABLE_ROLE_KEYS.forEach((roleKey) => {
          const incoming = (body.aiVisibleByRole as any)[roleKey];
          if (typeof incoming === "boolean") {
            next.aiVisibleByRole[roleKey] = incoming;
          }
        });
      }

      // Super-admin role controls are mandatory and cannot be disabled via API/UI.
      next.aiEnabledByRole.super_admin = true;
      next.aiVisibleByRole.super_admin = true;

      try {
        await persistEtaControlsToDb(next, req.user!.id);
        etaControls = next;
        io.emit("admin_eta_controls_updated", { ...etaControls });
        return res.json({
          ...etaControls,
        });
      } catch (error: any) {
        console.error("[ETA] Failed to persist ETA controls:", error?.message || error);
        return res.status(500).json({ error: "Failed to persist ETA controls" });
      }
    },
  );

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

        await ensureReceiptsForOrders(
          updatedOrders.map((o: any) => o.id).filter(Boolean),
          {
            trigger: "payment_success",
            generatedBy: req.user!.id,
            generatedByRole: req.user!.role,
          },
        );

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
      const externalRiderSystemEnabled = await isExternalRiderSystemActive();
      const isBusDelivery = isBusMethod(order.deliveryMethod);
      const actorRole = req.user!.role;
      const actorId = req.user!.id;
      const isAdminActor = actorRole === "admin" || actorRole === "super_admin";
      const adminBlockedManualStatuses = new Set([
        "confirmed",
        "processing",
        "ready",
        "packaged",
        "searching_rider",
      ]);
      const externalManualFlowStatuses = new Set([
        "external_dispatch_arranged",
        "en_route",
        "delivered",
        "completed",
      ]);
      if (!isAdminActor) {
        const isStakeholder =
          (actorRole === "buyer" && order.buyerId === actorId) ||
          (actorRole === "seller" && order.sellerId === actorId) ||
          (actorRole === "rider" && order.riderId === actorId);
        if (!isStakeholder) {
          return res.status(403).json({ error: "Unauthorized to update this order status" });
        }
      }

      if (isAdminActor && adminBlockedManualStatuses.has(normalizedStatus)) {
        return res.status(409).json({
          error: "Admin users cannot manually set seller or payment-gated workflow statuses. Use payment verification, seller actions, or the dedicated delivery actions instead.",
        });
      }

      if (isAdminActor && externalRiderSystemEnabled && externalManualFlowStatuses.has(normalizedStatus)) {
        return res.status(409).json({
          error: "External rider workflow statuses must use the dedicated admin delivery actions, not the generic status updater.",
        });
      }

      if (isBusDelivery && (normalizedStatus === "completed" || normalizedStatus === "delivered")) {
        return res.status(409).json({
          error: "BUS delivery completion is restricted to super admin. Use /api/orders/:id/bus-complete after transport proof verification.",
        });
      }

      // Completion is verification-gated and must go through dedicated QR/OTP verification endpoints.
      if (normalizedStatus === "completed") {
        return res.status(409).json({
          error: "Order completion is verification-gated. Use QR/OTP verification endpoints to complete delivery or pickup.",
        });
      }

      // Rider handoff is verification-gated and must use seller/admin QR/OTP verification endpoint.
      if (normalizedStatus === "picked_up") {
        return res.status(409).json({
          error: "Rider handoff requires verification. Use /api/orders/:id/verify-rider-pickup with QR or OTP.",
        });
      }

      // Delivery completion is verification-gated for all actors.
      if (normalizedStatus === "delivered") {
        return res.status(409).json({
          error: "Delivery completion requires verification. Use /api/orders/:id/complete-delivery with QR or OTP.",
        });
      }

      if (externalRiderSystemEnabled && normalizedStatus === "searching_rider") {
        return res.status(409).json({
          error: "Rider matching is disabled while the External Rider System is enabled.",
        });
      }

      if (
        externalRiderSystemEnabled &&
        canonicalizeOrderStatus(order.status) === "ready" &&
        normalizedStatus !== "external_dispatch_arranged" &&
        normalizedStatus !== "cancelled" &&
        normalizedStatus !== "ready"
      ) {
        return res.status(409).json({
          error: "Ready orders must remain ready until an admin arranges external delivery or cancels the order.",
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

      if (actorRole === "seller" && canonicalStatus === "packaged" && isPickupMethod(updatedOrder.deliveryMethod)) {
        try {
          await notifyAdmins(
            "order",
            "Pickup Order Packaged",
            `Seller packaged pickup order #${updatedOrder.orderNumber}. Assign it to a pickup station to make it ready for collection.`,
            {
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.orderNumber,
              status: canonicalStatus,
              link: `/admin/orders/${updatedOrder.id}/action`,
            },
            {
              requiredAdminPermission: "manage_orders",
              includeAgents: false,
            }
          );
        } catch (packagedNotifyErr) {
          console.error("[PICKUP_PACKAGED_NOTIFY] Failed to notify ops users:", packagedNotifyErr);
        }
      }

      if (actorRole === "seller" && canonicalStatus === "ready") {
        try {
          const isPickupOrder = isPickupMethod(updatedOrder.deliveryMethod);
          const adminMessage = isPickupOrder
            ? `Seller marked pickup order #${updatedOrder.orderNumber} ready for collection. Admin or pickup agent can now verify completion.`
            : `Seller marked order #${updatedOrder.orderNumber} ready for the next delivery action.`;

          await notifyAdmins(
            "order",
            isPickupOrder ? "Pickup Order Ready" : "Order Ready",
            adminMessage,
            {
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.orderNumber,
              status: canonicalStatus,
              link: `/admin/orders/${updatedOrder.id}/action`,
            },
            {
              requiredAdminPermission: "manage_orders",
              includeAgents: false,
            }
          );

          // Also notify the pickup agent(s) at the assigned station when order is ready
          if (isPickupOrder && updatedOrder.deliveryZoneId) {
            try {
              const pickupAgents = await storage.getUsersByRole("pickup_agent");
              const assignedAgents = pickupAgents.filter(
                (a: any) => a.isActive !== false && String(a.deliveryZoneId || "").trim() === String(updatedOrder.deliveryZoneId).trim()
              );
              await Promise.all(
                assignedAgents.map((agent: any) =>
                  storage.createNotification({
                    userId: agent.id,
                    type: "order",
                    title: "Pickup Order Ready",
                    message: `Order #${updatedOrder.orderNumber} is ready for customer pickup at your station. Verify when the customer arrives.`,
                    metadata: {
                      orderId: updatedOrder.id,
                      orderNumber: updatedOrder.orderNumber,
                      link: "/pickup-agent/verify",
                    } as any,
                  })
                )
              );
              assignedAgents.forEach((agent: any) => {
                io.to(agent.id).emit("notification", {
                  title: "Pickup Order Ready",
                  message: `Order #${updatedOrder.orderNumber} is ready for pickup verification.`,
                  type: "default",
                });
              });
            } catch (agentNotifyErr) {
              console.error("[PICKUP_AGENT_READY_NOTIFY] Failed:", agentNotifyErr);
            }
          }
        } catch (readyNotifyErr) {
          console.error("[ORDER_READY_NOTIFY] Failed to notify ops users:", readyNotifyErr);
        }

      }
      await emitOrderStatusUpdateToStakeholders(updatedOrder, canonicalStatus);

      if (
        !externalRiderSystemEnabled &&
        ["rider", "bus"].includes(String(updatedOrder.deliveryMethod || "").toLowerCase().trim()) &&
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

  app.post(
    "/api/admin/orders/:id/arrange-external-delivery",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermissionIfAdmin("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        const externalRiderSystemEnabled = await isExternalRiderSystemActive();
        if (!externalRiderSystemEnabled) {
          return res.status(409).json({
            error: "External Rider System is not enabled.",
          });
        }

        const order = await storage.getOrder(req.params.id);
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (isPickupMethod(order.deliveryMethod)) {
          return res.status(409).json({
            error: "Pickup orders cannot be arranged for external delivery.",
          });
        }

        if (canonicalizeOrderStatus(order.status) !== "ready") {
          return res.status(409).json({
            error: "Only ready orders can be moved to external dispatch.",
          });
        }

        const updatedOrder = await storage.applyOrderStatusTransition(
          order.id,
          "external_dispatch_arranged",
          req.user!.id,
          req.user!.role,
          "external_delivery_arranged"
        );

        if (!updatedOrder) {
          return res.status(404).json({ error: "Order not found" });
        }

        const externalDeliveryTypeLabel =
          String((updatedOrder as any).externalDeliveryType || "").toLowerCase().trim() === "bus" ||
          Boolean((updatedOrder as any).externalDeliveryByBus)
            ? "VIP Bus Delivery"
            : "Third-Party Delivery (Yango, Uber, Bolt)";

        await Promise.all(
          [updatedOrder.buyerId, updatedOrder.sellerId]
            .filter(Boolean)
            .map((userId) =>
              storage.createNotification({
                userId: userId!,
                type: "order",
                title: "External Delivery Arranged",
                message: `Order #${updatedOrder.orderNumber} has been arranged for ${externalDeliveryTypeLabel}.`,
                metadata: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.orderNumber,
                  status: "external_dispatch_arranged",
                  externalDeliveryByBus: Boolean((updatedOrder as any).externalDeliveryByBus),
                  externalDeliveryType: (updatedOrder as any).externalDeliveryType || null,
                } as any,
              })
            )
        );

        await emitOrderStatusUpdateToStakeholders(updatedOrder, "external_dispatch_arranged");

        return res.json({
          ...updatedOrder,
          status: mapOrderStatusForViewerRole(updatedOrder as any, req.user!.role),
        });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message || "Failed to arrange external delivery" });
      }
    }
  );

  app.post(
    "/api/admin/orders/:id/assign-pickup-station",
    requireAuth,
    requireRole("super_admin"),
    requirePermissionIfAdmin("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        const stationId = String(req.body?.stationId || "").trim();
        if (!stationId) {
          return res.status(400).json({ error: "Pickup station is required." });
        }

        const order = await storage.getOrder(req.params.id);
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        if (!isPickupMethod(order.deliveryMethod)) {
          return res.status(409).json({ error: "Pickup station assignment is only valid for pickup orders." });
        }

        if (canonicalizeOrderStatus(order.status) !== "packaged") {
          return res.status(409).json({ error: "Only packaged pickup orders can be assigned to a pickup station." });
        }

        const pickupStations = await storage.getDeliveryZones(true, "pickup_station");
        const station = pickupStations.find((candidate: any) => String(candidate.id) === stationId);
        if (!station || station.isActive === false) {
          return res.status(404).json({ error: "Pickup station not found." });
        }

        await storage.updateOrder(order.id, { deliveryZoneId: station.id } as any);
        const updatedOrder = await storage.applyOrderStatusTransition(
          order.id,
          "ready",
          req.user!.id,
          req.user!.role,
          "pickup_station_assigned"
        );

        if (!updatedOrder) {
          return res.status(404).json({ error: "Order not found" });
        }

        const pickupAgents = await resolvePickupAgentsForStation(station.id);
        const primaryAgent = pickupAgents[0] || null;
        const stationLocationLabel = formatPickupStationLocation(station);

        await Promise.all(
          pickupAgents.map((agent: any) =>
            storage.createNotification({
              userId: agent.id,
              type: "order",
              title: "Pickup Order Assigned",
              message: `Pickup order #${updatedOrder.orderNumber} is ready for collection at ${stationLocationLabel || station.name}.`,
              metadata: {
                orderId: updatedOrder.id,
                orderNumber: updatedOrder.orderNumber,
                stationId: station.id,
                stationName: station.name || null,
                stationCity: station.city || null,
                stationRegion: station.region || null,
                link: `/pickup-agent?orderId=${updatedOrder.id}`,
              },
            } as any)
          )
        );

        await storage.createNotification({
          userId: updatedOrder.buyerId,
          type: "order",
          title: "Order Ready for Pickup",
          message: `Order #${updatedOrder.orderNumber} is ready for pickup at ${stationLocationLabel || station.name}.${primaryAgent?.phone ? ` Contact ${resolveUserDisplayName(primaryAgent)} on ${primaryAgent.phone}.` : ""}`,
          metadata: {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.orderNumber,
            stationId: station.id,
            stationName: station.name || null,
            stationCity: station.city || null,
            stationRegion: station.region || null,
            pickupAgentId: primaryAgent?.id || null,
            pickupAgentName: primaryAgent ? resolveUserDisplayName(primaryAgent) : null,
            pickupAgentPhone: primaryAgent?.phone || null,
            link: `/track?orderId=${updatedOrder.id}`,
          },
        } as any);

        await storage.createNotification({
          userId: updatedOrder.sellerId,
          type: "order",
          title: "Pickup Station Assigned",
          message: `Order #${updatedOrder.orderNumber} is now ready for pickup at ${stationLocationLabel || station.name}.`,
          metadata: {
            orderId: updatedOrder.id,
            orderNumber: updatedOrder.orderNumber,
            stationId: station.id,
            stationName: station.name || null,
            link: `/seller/orders?orderId=${updatedOrder.id}`,
          },
        } as any);

        await emitOrderStatusUpdateToStakeholders(updatedOrder, "ready");

        return res.json({
          ...updatedOrder,
          pickupStationInfo: {
            id: station.id,
            name: station.name || null,
            city: station.city || null,
            region: station.region || null,
            locationLabel: stationLocationLabel,
            pickupAgentName: primaryAgent ? resolveUserDisplayName(primaryAgent) : null,
            pickupAgentPhone: primaryAgent?.phone || null,
          },
          status: mapOrderStatusForViewerRole(updatedOrder as any, req.user!.role),
        });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message || "Failed to assign pickup station" });
      }
    }
  );

  app.post(
    "/api/admin/orders/:id/mark-external-delivered",
    requireAuth,
    requireRole("super_admin"),
    requirePermissionIfAdmin("manage_orders"),
    async (req: AuthRequest, res) => {
      try {
        const externalRiderSystemEnabled = await isExternalRiderSystemActive();
        if (!externalRiderSystemEnabled) {
          return res.status(409).json({
            error: "External Rider System is not enabled.",
          });
        }

        const order = await storage.getOrder(req.params.id);
        if (!order) {
          return res.status(404).json({ error: "Order not found" });
        }

        const deliveryMethod = String(order.deliveryMethod || "").toLowerCase().trim();
        if (deliveryMethod === "pickup" || deliveryMethod === "store_pickup") {
          return res.status(409).json({
            error: "Pickup orders should continue using the pickup completion flow.",
          });
        }

        const currentStatus = canonicalizeOrderStatus(order.status);
        if (!["external_dispatch_arranged", "en_route", "delivered", "rider_arrived"].includes(currentStatus)) {
          return res.status(409).json({
            error: "Only manually arranged external deliveries can be marked complete here.",
          });
        }

        const updatedOrder = await storage.applyOrderStatusTransition(
          order.id,
          "completed",
          req.user!.id,
          req.user!.role,
          "super_admin_marked_external_delivery_completed"
        );

        if (!updatedOrder) {
          return res.status(404).json({ error: "Order not found" });
        }

        await Promise.all(
          [updatedOrder.buyerId, updatedOrder.sellerId]
            .filter(Boolean)
            .map((userId) =>
              storage.createNotification({
                userId: userId!,
                type: "order",
                title: "External Delivery Completed",
                message: `Order #${updatedOrder.orderNumber} has been manually confirmed as completed.`,
                metadata: {
                  orderId: updatedOrder.id,
                  orderNumber: updatedOrder.orderNumber,
                  status: "completed",
                  manuallyCompletedExternalDelivery: true,
                } as any,
              })
            )
        );

        await emitOrderStatusUpdateToStakeholders(updatedOrder, "completed");

        // Complete referral for buyer on external delivery completion
        if (updatedOrder.buyerId) {
          checkAndCompleteReferral(updatedOrder.buyerId).catch(() => {});
        }

        return res.json({
          ...updatedOrder,
          status: mapOrderStatusForViewerRole(updatedOrder as any, req.user!.role),
        });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message || "Failed to mark external delivery as completed" });
      }
    }
  );

  assignRiderToOrder = async (params: {
    orderId: string;
    riderId: string;
    actorId: string;
    actorRole: string;
    allowSellerOwnershipCheck?: boolean;
  }) => {
    const { orderId, riderId, actorId, actorRole, allowSellerOwnershipCheck = false } = params;

    if (await isExternalRiderSystemActive()) {
      const error = new Error("Internal rider assignment is disabled while the External Rider System is enabled");
      (error as any).code = 409;
      throw error;
    }

    if (!riderId) {
      const error = new Error("Rider ID is required");
      (error as any).code = 400;
      throw error;
    }

    if (actorRole === "seller") {
      const error = new Error("Seller direct rider assignment is disabled. Seller can only mark Ready and start rider matching.");
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
    if (!rider.isApproved || !rider.isActive) {
      const error = new Error("Rider is not available for deliveries");
      (error as any).code = 400;
      throw error;
    }
    const riderPresence = presenceService.getPresence(rider.id);
    const onlineByPresence = Boolean(riderPresence && (riderPresence.status === "online" || riderPresence.status === "away"));
    const onlineByFlag = (rider as any).riderOnline !== false;
    if (!onlineByPresence || !onlineByFlag) {
      const error = new Error("Rider is offline. Assignment requires active app connection.");
      (error as any).code = 409;
      throw error;
    }
    const riderLatestTracking = await storage.getLatestRiderLocation(rider.id);
    const riderPrefs = (((rider as any).riderPreferences || {}) as Record<string, any>);
    const prefLocation = (riderPrefs.lastKnownLocation || {}) as Record<string, any>;
    const latestGpsTimestampMs = Math.max(
      toTimestampMs(riderLatestTracking?.timestamp),
      toTimestampMs(prefLocation.timestamp),
    );
    const gpsAgeMs = latestGpsTimestampMs > 0 ? Math.max(0, Date.now() - latestGpsTimestampMs) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(gpsAgeMs) || gpsAgeMs > RIDER_GPS_FRESHNESS_MS) {
      const error = new Error(
        `Rider GPS is stale (${Number.isFinite(gpsAgeMs) ? `${Math.round(gpsAgeMs / 1000)}s` : "unknown"}). Assignment requires GPS ping within ${Math.round(RIDER_GPS_FRESHNESS_MS / 1000)} seconds.`
      );
      (error as any).code = 409;
      throw error;
    }
    const riderRisk = getRiderRiskScore(rider.id);
    if (Number(riderRisk.score || 0) >= RIDER_RISK_BLOCK_THRESHOLD) {
      const error = new Error("Rider is temporarily blocked from assignment due to elevated risk score.");
      (error as any).code = 409;
      throw error;
    }
    const riderOrders = await storage.getOrdersByUser(rider.id, "rider");
    const activeOrderCount = riderOrders.filter((candidate: any) =>
      RIDER_ENGAGED_STATUSES.has(canonicalizeOrderStatus(candidate.status))
    ).length;
    const maxCapacity = resolveRiderMaxCapacity(rider);
    if (activeOrderCount >= maxCapacity) {
      const error = new Error(
        `Rider capacity reached (${activeOrderCount}/${maxCapacity}). Select a rider with lower active load.`
      );
      (error as any).code = 409;
      throw error;
    }

    // Rider-contact guard: every rider-assigned delivery must have a callable buyer number.
    if (String(order.deliveryMethod || "").toLowerCase().trim() === "rider") {
      const existingPhone = typeof order.deliveryPhone === "string" ? order.deliveryPhone.trim() : "";
      if (!existingPhone) {
        const buyer = await storage.getUser(order.buyerId);
        const fallbackPhone = typeof buyer?.phone === "string" ? buyer.phone.trim() : "";
        if (fallbackPhone) {
          await storage.updateOrder(orderId, { deliveryPhone: fallbackPhone } as any);
          (order as any).deliveryPhone = fallbackPhone;
        } else {
          const error = new Error(
            "Cannot assign rider: buyer phone number is required. Ask buyer to update phone before assignment."
          );
          (error as any).code = 409;
          throw error;
        }
      }
    }
    if (["rider", "bus"].includes(String(order.deliveryMethod || "").toLowerCase().trim())) {
      const destinationLat = toFiniteNumber((order as any).deliveryLatitude);
      const destinationLng = toFiniteNumber((order as any).deliveryLongitude);
      const hasValidDestination =
        destinationLat !== null &&
        destinationLng !== null &&
        destinationLat >= -90 &&
        destinationLat <= 90 &&
        destinationLng >= -180 &&
        destinationLng <= 180;
      if (!hasValidDestination) {
        const error = new Error(
          "Cannot assign rider: delivery destination coordinates are required. Update order location first."
        );
        (error as any).code = 409;
        throw error;
      }
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

    const busDelivery = isBusMethod(order.deliveryMethod);
    await storage.createNotification({
      userId: riderId,
      type: "order",
      title: "New Delivery Assigned",
      message: busDelivery
        ? `BUS delivery assigned for order #${order.orderNumber}. Deliver to approved bus station, submit transport receipt + driver phone, and await super admin completion.`
        : `You have been assigned to deliver order #${order.orderNumber}. Please pick up the order from the seller.`,
      metadata: { link: `/rider/deliveries?orderId=${orderId}`, busDelivery } as any,
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

  app.get("/api/rider/assignment-offers", requireAuth, requireRole("rider"), requireRoleFeature("deliveries.view"), async (req: AuthRequest, res) => {
    try {
      const riderId = req.user!.id;
      const now = Date.now();
      const offers = await Promise.all(
        Array.from(pendingRiderAssignments.values())
          .filter((entry) => entry.currentRiderId === riderId)
          .map(async (entry) => {
            const order = await storage.getOrder(entry.orderId);
            if (!order) return null;
            const expiresAtMs = toTimestampMs(entry.expiresAt);
            if (expiresAtMs > 0 && expiresAtMs <= now) return null;
            const latestAttempt = [...entry.attempts]
              .reverse()
              .find((attempt) => attempt.riderId === riderId && attempt.status === "offered");
            if (!latestAttempt) return null;
            return {
              orderId: order.id,
              orderNumber: order.orderNumber,
              deliveryAddress: order.deliveryAddress || null,
              deliveryLatitude: toFiniteNumber((order as any).deliveryLatitude),
              deliveryLongitude: toFiniteNumber((order as any).deliveryLongitude),
              deliveryMethod: order.deliveryMethod,
              estimatedPayout: order.deliveryFee || null,
              currency: order.currency || "GHS",
              status: canonicalizeOrderStatus(order.status),
              offeredAt: latestAttempt.offeredAt,
              expiresAt: entry.expiresAt,
              radiusKm: entry.currentRadiusKm,
            };
          }),
      );
      res.json(offers.filter(Boolean));
    } catch (error: any) {
      res.status(400).json({ error: error.message || "Failed to fetch rider assignment offers" });
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

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (isManualExternalDeliveryOrder(order as any)) {
        return res.status(409).json({
          error: "External/manual deliveries are completed by platform operations and do not use rider QR/OTP verification.",
        });
      }
      if (isBusMethod(order.deliveryMethod)) {
        return res.status(409).json({
          error: "BUS delivery does not use rider-to-buyer QR/OTP verification. Submit transport proof and wait for super admin confirmation.",
        });
      }
      if (!qrCode && !normalizedOtp) {
        console.warn(`[DELIVERY_VERIFY_DENIED] order=${orderId} rider=${riderId} reason=missing_qr_and_otp`);
        return res.status(400).json({ error: "Provide at least one verification method: QR code or OTP" });
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
      console.info(`[ORDER] Order ${orderId} delivered by rider ${riderId}`);
      res.json({
        ...updatedOrder,
        status: mapOrderStatusForViewerRole(updatedOrder as any, req.user!.role),
      });
    } catch (error: any) {
      console.error("Error completing delivery:", error);
      res.status((error as any)?.code || 400).json({ error: error.message });
    }
  });

  app.post(
    "/api/orders/:id/bus-transport-proof",
    requireAuth,
    requireRole("rider"),
    requireRoleFeature("deliveries.manage"),
    async (req: AuthRequest, res) => {
      try {
        const orderId = req.params.id;
        const riderId = req.user!.id;
        const receiptImageUrl = String(req.body?.receiptImageUrl || "").trim();
        const driverPhone = String(req.body?.driverPhone || "").trim();
        const busNumber = String(req.body?.busNumber || "").trim() || null;
        const stationName = String(req.body?.stationName || "").trim() || null;
        const latitudeFromBody = toFiniteNumber(req.body?.latitude);
        const longitudeFromBody = toFiniteNumber(req.body?.longitude);

        if (!receiptImageUrl || !driverPhone) {
          return res.status(400).json({
            error: "receiptImageUrl and driverPhone are required for BUS transport proof submission.",
          });
        }

        const order = await storage.getOrder(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (!isBusMethod(order.deliveryMethod)) {
          return res.status(409).json({ error: "This endpoint is only valid for BUS delivery orders." });
        }
        if (order.riderId !== riderId) {
          return res.status(403).json({ error: "You are not assigned to this BUS delivery order." });
        }

        let workingOrder = order;
        let current = canonicalizeOrderStatus(workingOrder.status);
        if (current === "cancelled" || current === "completed") {
          return res.status(409).json({ error: `Cannot submit BUS proof when order is ${current}.` });
        }

        if (current === "assigned") {
          const moved = await storage.applyOrderStatusTransition(
            orderId,
            "rider_arrived",
            riderId,
            "rider",
            BUS_STAGE_REASONS.atBusStation
          );
          if (moved) {
            workingOrder = moved as any;
            current = canonicalizeOrderStatus(workingOrder.status);
          }
        }

        if (current === "rider_arrived") {
          const moved = await storage.applyOrderStatusTransition(
            orderId,
            "picked_up",
            riderId,
            "rider",
            "bus_handoff_to_transport_operator"
          );
          if (moved) {
            workingOrder = moved as any;
            current = canonicalizeOrderStatus(workingOrder.status);
          }
        }

        if (current === "picked_up") {
          const moved = await storage.applyOrderStatusTransition(
            orderId,
            "in_transit",
            riderId,
            "rider",
            BUS_STAGE_REASONS.inTransit
          );
          if (moved) {
            workingOrder = moved as any;
            current = canonicalizeOrderStatus(workingOrder.status);
          }
        }

        if (!["in_transit", "en_route", "delivered"].includes(current)) {
          return res.status(409).json({
            error: "BUS proof can only be submitted after assignment and handoff progression (assigned -> rider_arrived -> picked_up -> in_transit).",
            details: { currentStatus: current },
          });
        }

        const latestTracking = await storage.getLatestDeliveryLocation(orderId);
        const latitude = latitudeFromBody ?? toFiniteNumber((latestTracking as any)?.latitude);
        const longitude = longitudeFromBody ?? toFiniteNumber((latestTracking as any)?.longitude);
        const rider = await storage.getUser(riderId);
        const submittedAt = new Date().toISOString();
        const proofMetadata = {
          receiptImageUrl,
          driverPhone,
          busNumber,
          stationName,
          submittedAt,
          latitude,
          longitude,
          riderId,
          riderName: rider ? resolveUserDisplayName(rider as any) : null,
          orderId,
          orderNumber: workingOrder.orderNumber,
          awaitingConfirmation: true,
        };

        await storage.createOrderStatusHistory({
          orderId,
          fromStatus: workingOrder.status as any,
          toStatus: workingOrder.status as any,
          changedBy: riderId,
          changedByRole: "rider",
          reason: BUS_TRANSPORT_PROOF_REASON,
          metadata: proofMetadata as any,
        } as any);
        await storage.createOrderStatusHistory({
          orderId,
          fromStatus: workingOrder.status as any,
          toStatus: workingOrder.status as any,
          changedBy: riderId,
          changedByRole: "rider",
          reason: BUS_STAGE_REASONS.awaitingConfirmation,
          metadata: { submittedAt } as any,
        } as any);

        const superAdmins = await storage.getUsersByRole("super_admin");
        for (const admin of superAdmins) {
          if (!admin?.isActive) continue;
          await storage.createNotification({
            userId: admin.id,
            type: "order",
            title: "BUS Transport Proof Submitted",
            message: `Order #${workingOrder.orderNumber} BUS transport proof is ready for verification.`,
            metadata: {
              orderId,
              orderNumber: workingOrder.orderNumber,
              link: `/admin/orders?orderId=${orderId}`,
              proof: proofMetadata,
            } as any,
          });
        }

        const refreshedOrder = (await storage.getOrder(orderId)) || workingOrder;
        const refreshedHistory = await storage.getOrderStatusHistory(orderId);
        const busDeliveryWorkflow = extractBusDeliveryWorkflow(refreshedHistory, refreshedOrder);

        io.emit("admin_bus_transport_proof_submitted", {
          orderId,
          orderNumber: refreshedOrder.orderNumber,
          riderId,
          submittedAt,
        });
        await emitOrderStatusUpdateToStakeholders(refreshedOrder, refreshedOrder.status);

        return res.json({
          success: true,
          order: {
            ...refreshedOrder,
            status: mapOrderStatusForViewerRole(refreshedOrder as any, req.user!.role),
          },
          busDeliveryWorkflow,
        });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message });
      }
    }
  );

  app.post(
    "/api/orders/:id/bus-complete",
    requireAuth,
    requireRole("super_admin"),
    async (req: AuthRequest, res) => {
      try {
        const orderId = req.params.id;
        const actorId = req.user!.id;
        const confirmationNote = String(req.body?.confirmationNote || "").trim() || null;

        const order = await storage.getOrder(orderId);
        if (!order) return res.status(404).json({ error: "Order not found" });
        if (!isBusMethod(order.deliveryMethod)) {
          return res.status(409).json({ error: "This endpoint is only valid for BUS delivery orders." });
        }

        const history = await storage.getOrderStatusHistory(orderId);
        const busWorkflow = extractBusDeliveryWorkflow(history, order);
        const proof = busWorkflow.proof;
        if (!proof?.receiptImageUrl || !proof?.driverPhone) {
          return res.status(422).json({
            error: "BUS completion requires transport proof (receipt image + driver phone).",
          });
        }

        let workingOrder = order;
        let current = canonicalizeOrderStatus(workingOrder.status);
        if (current === "cancelled") {
          return res.status(409).json({ error: "Cancelled BUS orders cannot be completed." });
        }
        if (current !== "completed") {
          if (current === "assigned") {
            const moved = await storage.applyOrderStatusTransition(
              orderId,
              "rider_arrived",
              actorId,
              "super_admin",
              BUS_STAGE_REASONS.atBusStation
            );
            if (moved) {
              workingOrder = moved as any;
              current = canonicalizeOrderStatus(workingOrder.status);
            }
          }
          if (current === "rider_arrived") {
            const moved = await storage.applyOrderStatusTransition(
              orderId,
              "picked_up",
              actorId,
              "super_admin",
              "bus_super_admin_progress_pickup"
            );
            if (moved) {
              workingOrder = moved as any;
              current = canonicalizeOrderStatus(workingOrder.status);
            }
          }
          if (current === "picked_up") {
            const moved = await storage.applyOrderStatusTransition(
              orderId,
              "in_transit",
              actorId,
              "super_admin",
              BUS_STAGE_REASONS.inTransit
            );
            if (moved) {
              workingOrder = moved as any;
              current = canonicalizeOrderStatus(workingOrder.status);
            }
          }
          if (current === "in_transit" || current === "en_route") {
            const moved = await storage.applyOrderStatusTransition(
              orderId,
              "delivered",
              actorId,
              "super_admin",
              BUS_STAGE_REASONS.awaitingConfirmation
            );
            if (moved) {
              workingOrder = moved as any;
              current = canonicalizeOrderStatus(workingOrder.status);
            }
          }
          if (current !== "delivered" && current !== "completed") {
            return res.status(409).json({
              error: "BUS order is not ready for completion. Ensure transport handoff and in-transit progression are complete.",
              details: { currentStatus: current },
            });
          }

          const completed = await storage.applyOrderStatusTransition(
            orderId,
            "completed",
            actorId,
            "super_admin",
            BUS_SUPER_ADMIN_COMPLETED_REASON
          );
          if (!completed) return res.status(404).json({ error: "Order not found" });
          workingOrder = completed as any;
        }

        const completedAt = new Date().toISOString();
        await storage.createOrderStatusHistory({
          orderId,
          fromStatus: workingOrder.status as any,
          toStatus: workingOrder.status as any,
          changedBy: actorId,
          changedByRole: "super_admin",
          reason: BUS_STAGE_REASONS.completed,
          metadata: {
            completedAt,
            confirmationNote,
            proof,
          } as any,
        } as any);

        await Promise.all(
          [
            { userId: workingOrder.buyerId, audience: "buyer" },
            { userId: workingOrder.sellerId, audience: "seller" },
            { userId: workingOrder.riderId, audience: "rider" },
          ]
            .filter((target) => Boolean(target.userId))
            .map((target) =>
              storage.createNotification({
                userId: target.userId!,
                type: "order",
                title: "BUS Delivery Completed",
                message: `Order #${workingOrder.orderNumber} was confirmed and completed by super admin.`,
                metadata: {
                  orderId,
                  orderNumber: workingOrder.orderNumber,
                  audience: target.audience,
                  link:
                    target.audience === "seller"
                      ? `/seller/orders?orderId=${orderId}`
                      : target.audience === "rider"
                      ? `/rider/deliveries?orderId=${orderId}`
                      : `/orders?orderId=${orderId}`,
                } as any,
              })
            )
        );

        await createRiderPayoutIfMissing(workingOrder, workingOrder.riderId);
        await ensureReceiptsForOrders([orderId], {
          trigger: "bus_delivery_completed",
          generatedBy: actorId,
          generatedByRole: "super_admin",
        });
        await emitOrderStatusUpdateToStakeholders(workingOrder, "completed");

        const refreshedHistory = await storage.getOrderStatusHistory(orderId);
        const busDeliveryWorkflow = extractBusDeliveryWorkflow(refreshedHistory, workingOrder);
        return res.json({
          success: true,
          order: workingOrder,
          busDeliveryWorkflow,
        });
      } catch (error: any) {
        return res.status((error as any)?.code || 400).json({ error: error.message });
      }
    }
  );

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
        if (isManualExternalDeliveryOrder(order as any)) {
          return res.status(409).json({
            error: "External/manual deliveries do not use rider pickup verification.",
          });
        }

        if (actorRole === "seller" && order.sellerId !== actorId) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=not_owner`);
          return res.status(403).json({ error: "Unauthorized to verify this order pickup" });
        }
        const normalizedDeliveryMethod = String(order.deliveryMethod || "").toLowerCase().trim();
        if (!["rider", "bus"].includes(normalizedDeliveryMethod)) {
          console.warn(`[PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=wrong_delivery_method method=${order.deliveryMethod}`);
          return res.status(409).json({ error: "Rider pickup verification is only valid for rider or bus deliveries" });
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

  // Pickup verification accepts either QR code or OTP for pickup agents, admins, and super admins.
  app.post(
    "/api/orders/:id/verify-customer-pickup",
    requireAuth,
    requireRole("pickup_agent", "admin", "super_admin"),
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

        if (order.deliveryMethod !== "pickup") {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=wrong_delivery_method method=${order.deliveryMethod}`);
          return res.status(409).json({ error: "Customer pickup verification is only valid for pickup orders" });
        }
        if (canonicalizeOrderStatus(order.status) !== "ready") {
          console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=pickup_not_ready status=${order.status}`);
          return res.status(409).json({ error: "Pickup verification is only available after the order has been assigned to a pickup station and marked ready for pickup" });
        }
        if (actorRole === "pickup_agent") {
          const [pickupAgent, pickupStations] = await Promise.all([
            storage.getUser(actorId),
            storage.getDeliveryZones(false, "pickup_station"),
          ]);
          const agentZoneId = String(pickupAgent?.deliveryZoneId || "").trim();
          const resolvedOrderZoneId = String(order.deliveryZoneId || "").trim();
          const stationExists = pickupStations.some((station: any) => String(station.id) === resolvedOrderZoneId);

          if (!agentZoneId || !resolvedOrderZoneId || !stationExists || String(resolvedOrderZoneId) !== agentZoneId) {
            console.warn(`[CUSTOMER_PICKUP_VERIFY_DENIED] order=${orderId} actor=${actorId} role=${actorRole} reason=zone_mismatch`);
            return res.status(403).json({ error: "This pickup order does not belong to your assigned zone" });
          }
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

        // If verified by a pickup agent, send them a completion DB notification
        if (actorRole === "pickup_agent") {
          try {
            await storage.createNotification({
              userId: actorId,
              type: "order",
              title: "Pickup Verified",
              message: `You successfully verified order #${updated.orderNumber}. The order is now marked as completed.`,
              metadata: {
                orderId: updated.id,
                orderNumber: updated.orderNumber,
                link: "/pickup-agent/verify",
              } as any,
            });
          } catch {
            // non-critical
          }
        }

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
        locationSharing: true,
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
        locationSharing: true,
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
        return res.status(403).json({
          error: "Rider self-offline is disabled. Availability is managed by platform operations.",
        });
      }
      const updated = await storage.updateUser(req.user!.id, { riderOnline: true } as any);
      io.to(req.user!.id).emit("rider_availability_updated", { online: true });
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
          deliveryMethod: orders.deliveryMethod,
          deliveryAddress: orders.deliveryAddress,
          deliveryPhone: orders.deliveryPhone,
          deliveryLatitude: orders.deliveryLatitude,
          deliveryLongitude: orders.deliveryLongitude,
          buyerId: orders.buyerId,
          qrCode: orders.qrCode,
        })
        .from(orders)
        .where(
          and(
            eq(orders.riderId, riderId),
            sql`(
              lower(cast(${orders.status} as text)) in ('processing','ready','confirmed','searching_rider','assigned','rider_arrived','picked_up','in_transit','en_route','delivering')
              or (
                lower(cast(${orders.deliveryMethod} as text)) = 'bus'
                and lower(cast(${orders.status} as text)) = 'delivered'
              )
            )`
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
      const orderHistory = await storage.getOrderStatusHistory(order.id);
      const busDeliveryWorkflow = isBusMethod(order.deliveryMethod)
        ? extractBusDeliveryWorkflow(orderHistory, order as any)
        : null;
      let deliveryLatitude = toFiniteNumber(order.deliveryLatitude);
      let deliveryLongitude = toFiniteNumber(order.deliveryLongitude);
      if (deliveryLatitude === null || deliveryLongitude === null) {
        const extracted = extractCoordinatesFromText(order.deliveryAddress);
        if (extracted) {
          deliveryLatitude = extracted.lat;
          deliveryLongitude = extracted.lng;
          await storage.updateOrder(order.id, {
            deliveryLatitude: String(extracted.lat) as any,
            deliveryLongitude: String(extracted.lng) as any,
          } as any);
        }
      }
      
      res.json({
        id: order.id,
        orderNumber: order.orderNumber,
        status: canonicalizeOrderStatus(order.status),
        deliveryMethod: order.deliveryMethod,
        deliveryAddress: order.deliveryAddress || "Address not available",
        deliveryLatitude,
        deliveryLongitude,
        buyerId: order.buyerId,
        buyerName: buyer?.name || "Customer",
        buyerProfileImage: buyer?.profileImage || null,
        buyerPhone: order.deliveryPhone || buyer?.phone || null,
        qrCode: isBusMethod(order.deliveryMethod) ? null : order.qrCode || null,
        gpsNavigationReady: deliveryLatitude !== null && deliveryLongitude !== null,
        busDeliveryWorkflow,
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
            recordRiderRiskSignal(req.user!.id, "impossible_speed", 2.1);
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
      const rider = await storage.getUser(req.user!.id);
      if (rider) {
        const currentPrefs = ((rider as any).riderPreferences || {}) as Record<string, any>;
        await storage.updateUser(req.user!.id, {
          riderOnline: true,
          riderPreferences: {
            ...currentPrefs,
            lastKnownLocation: {
              latitude: effectiveLat,
              longitude: effectiveLng,
              accuracy: req.body.accuracy ?? null,
              speed: req.body.speed ?? null,
              heading: req.body.heading ?? null,
              timestamp: new Date().toISOString(),
            },
          } as any,
        } as any);
      }
      
      // Emit real-time location update to all stakeholders
      if (order) {
        const riderVehicleType = String((rider as any)?.vehicleInfo?.type || "").trim() || null;
        const locationUpdate = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          riderId: req.user!.id,
          riderName: rider?.name || "Rider",
          riderPhone: rider?.phone || null,
          vehicleType: riderVehicleType,
          latitude: tracking.latitude,
          longitude: tracking.longitude,
          speed: tracking.speed,
          heading: tracking.heading,
          timestamp: tracking.timestamp,
          isOnline: true,
          onlineStatus: "online",
          hasActiveOrder: true,
          activeOrderCount: 1,
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
            recordRiderRiskSignal(req.user!.id, "route_deviation", 1.4);
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
      const allOrders = await storage.getAllOrders();
      const allRiders = (await storage.getUsersByRole("rider")).filter((r: any) => r.isApproved && r.isActive);
      const activeOrderCountByRider = buildRiderActiveOrderCountMap(allOrders);
      const activeOrdersByRider = new Map<string, any[]>();
      allOrders.forEach((order: any) => {
        const riderId = String(order.riderId || "");
        if (!riderId) return;
        const status = canonicalizeOrderStatus(order.status);
        if (!RIDER_ENGAGED_STATUSES.has(status)) return;
        const bucket = activeOrdersByRider.get(riderId) || [];
        bucket.push(order);
        activeOrdersByRider.set(riderId, bucket);
      });
      const now = Date.now();

      const riderLocations = await Promise.all(
        allRiders.map(async (rider: any) => {
          const riderActiveOrders = activeOrdersByRider.get(rider.id) || [];
          const primaryOrder = riderActiveOrders[0] || null;
          const latestFromOrder = primaryOrder ? await storage.getLatestDeliveryLocation(primaryOrder.id) : null;
          const latestTracking = latestFromOrder || (await storage.getLatestRiderLocation(rider.id));

          const riderPrefs = (rider as any).riderPreferences || {};
          const prefLocation = (riderPrefs.lastKnownLocation || {}) as any;
          const prefLat = toFiniteNumber(prefLocation.latitude);
          const prefLng = toFiniteNumber(prefLocation.longitude);
          const trackedLat = toFiniteNumber(latestTracking?.latitude);
          const trackedLng = toFiniteNumber(latestTracking?.longitude);
          const resolvedLat = trackedLat ?? prefLat;
          const resolvedLng = trackedLng ?? prefLng;
          const resolvedTimestamp = latestTracking?.timestamp || prefLocation.timestamp || null;
          const resolvedTimestampMs = toTimestampMs(resolvedTimestamp);
          const gpsAgeMs = resolvedTimestampMs > 0 ? Math.max(0, now - resolvedTimestampMs) : Number.POSITIVE_INFINITY;
          const hasRecentLocation = Number.isFinite(gpsAgeMs) && gpsAgeMs <= RIDER_LAST_KNOWN_RETENTION_MS;
          const gpsFresh = Number.isFinite(gpsAgeMs) && gpsAgeMs <= RIDER_GPS_FRESHNESS_MS;
          const resolvedSpeed =
            latestTracking?.speed ??
            (Number.isFinite(prefLocation.speed) ? Number(prefLocation.speed) : null);
          const resolvedHeading =
            latestTracking?.heading ??
            (Number.isFinite(prefLocation.heading) ? Number(prefLocation.heading) : null);

          const destinationLat = toFiniteNumber(primaryOrder?.deliveryLatitude);
          const destinationLng = toFiniteNumber(primaryOrder?.deliveryLongitude);
          const etaPayload =
            destinationLat !== null &&
            destinationLng !== null &&
            resolvedLat !== null &&
            resolvedLng !== null
              ? computeEtaMetrics({
                  riderLat: resolvedLat,
                  riderLng: resolvedLng,
                  destinationLat,
                  destinationLng,
                  speedRaw: resolvedSpeed,
                })
              : null;

          const presenceRaw = presenceService.getPresence(rider.id);
          const presenceStatus = presenceRaw?.status || "offline";
          const onlineByPresence = presenceStatus === "online" || presenceStatus === "away";
          const onlineByFlag = rider.riderOnline !== false;
          const isOnline = Boolean(onlineByPresence && onlineByFlag && gpsFresh);
          const resolvedOnlineStatus = isOnline ? String(presenceStatus || "online") : "offline";
          const vehicleInfo = (rider as any).vehicleInfo || {};
          const riskScore = Number(getRiderRiskScore(rider.id).score || 0);
          const activeOrderCount = activeOrderCountByRider.get(rider.id) || 0;
          const maxCapacity = resolveRiderMaxCapacity(rider);

          return {
            riderId: rider.id,
            riderName: rider.name,
            riderProfileImage: rider.profileImage || null,
            riderPhone: rider.phone || null,
            vehicleType: String(vehicleInfo.type || "").trim() || "motorcycle",
            vehicleColor: String(vehicleInfo.color || "").trim() || null,
            isOnline,
            onlineStatus: resolvedOnlineStatus,
            lastSeenAt: presenceRaw?.lastSeen?.toISOString?.() || resolvedTimestamp,
            activeOrderCount,
            maxCapacity,
            hasActiveOrder: activeOrderCount > 0,
            orderId: primaryOrder?.id || null,
            orderNumber: primaryOrder?.orderNumber || null,
            orderStatus: primaryOrder?.status || null,
            deliveryAddress: primaryOrder?.deliveryAddress || null,
            deliveryPhone: primaryOrder?.deliveryPhone || null,
            buyerName: primaryOrder?.buyerName || null,
            deliveryLatitude: destinationLat,
            deliveryLongitude: destinationLng,
            latitude: resolvedLat,
            longitude: resolvedLng,
            speed: resolvedSpeed,
            heading: resolvedHeading,
            timestamp: resolvedTimestamp,
            hasLocation: hasRecentLocation && resolvedLat !== null && resolvedLng !== null,
            gpsFresh,
            gpsAgeSeconds: Number.isFinite(gpsAgeMs) ? Math.max(0, Math.round(gpsAgeMs / 1000)) : null,
            riskScore: Number(riskScore.toFixed(2)),
            eta: etaPayload?.etaMinutes ?? null,
            distance: etaPayload?.distanceKm ?? null,
          };
        }),
      );

      res.json(riderLocations);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get(
    "/api/admin/rider-risk-scores",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("manage_orders"),
    async (req, res) => {
      const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
      const riderId = String(req.query.riderId || "").trim();
      if (riderId) {
        return res.json(getRiderRiskScore(riderId));
      }
      return res.json(listRiderRiskScores(limit));
    },
  );

  // Get pending orders that need rider assignment (for Command Center dispatch)
  app.get("/api/admin/pending-orders", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_orders"), async (req, res) => {
    try {
      const allOrders = await storage.getAllOrders();
      
      // Filter for orders that need rider assignment:
      // - delivery method is rider
      // - seller has marked dispatch-ready (or system has started rider matching)
      // - no rider assigned yet
      const pendingOrders = allOrders
        .map((order) => {
          const directLat = toFiniteNumber((order as any).deliveryLatitude);
          const directLng = toFiniteNumber((order as any).deliveryLongitude);
          const extracted =
            directLat === null || directLng === null
              ? extractCoordinatesFromText((order as any).deliveryAddress)
              : null;
          const resolvedLat = directLat ?? extracted?.lat ?? null;
          const resolvedLng = directLng ?? extracted?.lng ?? null;
          return {
            order,
            resolvedLat,
            resolvedLng,
          };
        })
        .filter(({ order, resolvedLat, resolvedLng }) =>
          ["rider", "bus"].includes(String(order.deliveryMethod || "").toLowerCase().trim()) &&
          ["ready", "searching_rider"].includes(canonicalizeOrderStatus(order.status)) &&
          resolvedLat !== null &&
          resolvedLng !== null &&
          !order.riderId
        )
        .map(({ order, resolvedLat, resolvedLng }) => ({
          id: order.id,
          orderNumber: order.orderNumber,
          sellerId: order.sellerId,
          buyerName: "Buyer", // Will be populated below
          buyerEmail: null as string | null,
          buyerPhone: null as string | null,
          deliveryAddress: order.deliveryAddress,
          deliveryPhone: order.deliveryPhone,
          deliveryLatitude: resolvedLat,
          deliveryLongitude: resolvedLng,
          deliveryZoneId: order.deliveryZoneId,
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
      const { orderLat, orderLng, orderZoneId, sellerId } = req.query;
      
      // Get all approved and active riders; eligibility is computed from fresh presence/GPS/load checks.
      const allRiders = await storage.getUsersByRole("rider");
      const activeRiders = allRiders.filter(r => r.isApproved && r.isActive);
      const zones = await storage.getDeliveryZones();
      const seller = sellerId ? await storage.getUser(String(sellerId)) : null;
      const sellerZoneId = resolveZoneBySellerProfile(seller, zones);
      const allOrders = await storage.getAllOrders();
      const activeOrderCountByRider = buildRiderActiveOrderCountMap(allOrders);
      const now = Date.now();
      
      const orderLatNum = toFiniteNumber(orderLat);
      const orderLngNum = toFiniteNumber(orderLng);
      const availableRiders = await Promise.all(
        activeRiders.map(async (rider) => {
          const [latest] = await Promise.all([
            storage.getLatestRiderLocation(rider.id),
          ]);
          const riderPrefs = (((rider as any).riderPreferences || {}) as Record<string, any>);
          const prefLocation = (riderPrefs.lastKnownLocation || {}) as Record<string, any>;
          const riderLat = toFiniteNumber(latest?.latitude) ?? toFiniteNumber(prefLocation.latitude);
          const riderLng = toFiniteNumber(latest?.longitude) ?? toFiniteNumber(prefLocation.longitude);
          const locationTs = Math.max(toTimestampMs(latest?.timestamp), toTimestampMs(prefLocation.timestamp));
          const gpsAgeMs = locationTs > 0 ? Math.max(0, now - locationTs) : Number.POSITIVE_INFINITY;
          const gpsFresh = Number.isFinite(gpsAgeMs) && gpsAgeMs <= RIDER_GPS_FRESHNESS_MS;
          const onlineByFlag = (rider as any).riderOnline !== false;
          const presence = presenceService.getPresence(rider.id);
          const onlineByPresence = Boolean(presence && (presence.status === "online" || presence.status === "away"));
          const activeOrderCount = activeOrderCountByRider.get(rider.id) || 0;
          const maxCapacity = resolveRiderMaxCapacity(rider);
          const riskScore = Number(getRiderRiskScore(rider.id).score || 0);
          const zoneId = resolveZoneByRiderProfile(rider, zones);
          const distanceToOrder =
            orderLatNum !== null && orderLngNum !== null && riderLat !== null && riderLng !== null
              ? haversineDistanceKm(riderLat, riderLng, orderLatNum, orderLngNum)
              : undefined;
          const isAvailable =
            onlineByFlag &&
            onlineByPresence &&
            gpsFresh &&
            activeOrderCount < maxCapacity &&
            riskScore < RIDER_RISK_BLOCK_THRESHOLD;

          return {
            id: rider.id,
            name: rider.name,
            email: rider.email,
            phone: rider.phone,
            profileImage: rider.profileImage || null,
            isAvailable,
            onlineStatus: isAvailable ? String(presence?.status || "online") : "offline",
            vehicleType: String((((rider as any).vehicleInfo || {}) as any).type || "").trim() || "motorcycle",
            zoneId,
            zoneMatched:
              ENABLE_SOFT_ZONE_MATCH &&
              !!orderZoneId &&
              String(zoneId || "") === String(orderZoneId),
            sellerZoneMatched:
              ENABLE_SOFT_ZONE_MATCH &&
              !!sellerZoneId &&
              String(zoneId || "") === String(sellerZoneId),
            distanceToOrder,
            currentLocation: riderLat !== null && riderLng !== null ? { lat: riderLat, lng: riderLng } : undefined,
            heading:
              latest?.heading ??
              (Number.isFinite(prefLocation.heading) ? Number(prefLocation.heading) : null),
            timestamp: locationTs > 0 ? new Date(locationTs).toISOString() : null,
            activeOrderCount,
            maxCapacity,
            gpsFresh,
            gpsAgeSeconds: Number.isFinite(gpsAgeMs) ? Math.max(0, Math.round(gpsAgeMs / 1000)) : null,
            riskScore: Number(riskScore.toFixed(2)),
            rating: toFiniteNumber((rider as any)?.ratings) ?? 0,
          };
        })
      );
      const eligibleRiders = availableRiders.filter((rider) => rider.isAvailable);

      eligibleRiders.sort((a, b) => {
        if ((a as any).zoneMatched !== (b as any).zoneMatched) {
          return (a as any).zoneMatched ? -1 : 1;
        }
        if ((a as any).sellerZoneMatched !== (b as any).sellerZoneMatched) {
          return (a as any).sellerZoneMatched ? -1 : 1;
        }
        const distanceA = typeof a.distanceToOrder === "number" ? a.distanceToOrder : Number.MAX_SAFE_INTEGER;
        const distanceB = typeof b.distanceToOrder === "number" ? b.distanceToOrder : Number.MAX_SAFE_INTEGER;
        if (distanceA !== distanceB) return distanceA - distanceB;
        const loadA = Number((a as any).activeOrderCount || 0);
        const loadB = Number((b as any).activeOrderCount || 0);
        if (loadA !== loadB) return loadA - loadB;
        const ratingA = Number((a as any).rating || 0);
        const ratingB = Number((b as any).rating || 0);
        if (ratingA !== ratingB) return ratingB - ratingA;
        return a.name.localeCompare(b.name);
      });

      res.json(eligibleRiders);
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
        if (!["rider", "bus"].includes(String(order.deliveryMethod || "").toLowerCase().trim())) return false;
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
  app.get("/api/admin/sellers/:sellerId/dashboard", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      const liteMode = String(req.query.lite || req.query.mode || "").toLowerCase();
      const isLite = liteMode === "1" || liteMode === "true" || liteMode === "summary";
      const seller = await storage.getUser(sellerId);

      if (!seller || seller.role !== "seller") {
        return res.status(404).json({ error: "Seller not found" });
      }

      const toNumber = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
      const normalizePaymentStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
      const isPaidPaymentStatus = (value?: string | null) =>
        ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
      const store = await storage.getStoreByPrimarySeller(sellerId);
      const sellerOrderFilter = store?.id
        ? and(eq(orders.sellerId, sellerId), eq(orders.storeId, store.id))
        : eq(orders.sellerId, sellerId);
      const sellerProductFilter = and(
        eq(products.sellerId, sellerId),
        store?.id ? eq(products.storeId, store.id) : sql`true`,
      );

      if (isLite) {
        const paidStatusFilter = sql`lower(cast(${orders.paymentStatus} as text)) in ('completed', 'paid', 'success')`;
        const completedPaidFilter = sql`lower(cast(${orders.status} as text)) = 'completed' and ${paidStatusFilter}`;
        const visibleProductFilter = and(
          sellerProductFilter,
          sql`coalesce((${products.dynamicFields}->>'archived')::boolean, false) = false`,
        );

        const [summaryRows, productSummaryRows, payoutSummaryRows, commissionSummaryRows, availableBalanceRows, featuredProductSummaryRows] = await Promise.all([
          db
            .select({
              totalSales: sql<number>`count(*)`,
              totalRevenue: sql<number>`coalesce(sum(case when ${completedPaidFilter} then ${orders.total}::numeric else 0 end), 0)`,
              totalPaid: sql<number>`coalesce(sum(case when ${paidStatusFilter} then ${orders.total}::numeric else 0 end), 0)`,
              salesThisMonth: sql<number>`coalesce(sum(case when date_trunc('month', ${orders.createdAt}) = date_trunc('month', now()) then 1 else 0 end), 0)`,
              revenueThisMonth: sql<number>`coalesce(sum(case when ${completedPaidFilter} and date_trunc('month', coalesce(${orders.updatedAt}, ${orders.deliveredAt}, ${orders.createdAt})) = date_trunc('month', now()) then ${orders.total}::numeric else 0 end), 0)`,
            })
            .from(orders)
            .where(sellerOrderFilter),
          db
            .select({
              totalProducts: sql<number>`count(*)`,
              activeProducts: sql<number>`coalesce(sum(case when ${products.isActive} then 1 else 0 end), 0)`,
              inactiveProducts: sql<number>`coalesce(sum(case when not ${products.isActive} then 1 else 0 end), 0)`,
              outOfStockProducts: sql<number>`coalesce(sum(case when coalesce(${products.stock}, 0) <= 0 then 1 else 0 end), 0)`,
              lowStockProducts: sql<number>`coalesce(sum(case when coalesce(${products.stock}, 0) > 0 and coalesce(${products.stock}, 0) <= 5 then 1 else 0 end), 0)`,
              totalStockUnits: sql<number>`coalesce(sum(coalesce(${products.stock}, 0)), 0)`,
              averageProductRating: sql<number>`coalesce(avg(case when coalesce(${products.totalRatings}, 0) > 0 then ${products.ratings}::numeric else null end), 0)`,
              totalProductRatings: sql<number>`coalesce(sum(coalesce(${products.totalRatings}, 0)), 0)`,
            })
            .from(products)
            .where(visibleProductFilter),
          db
            .select({
              completedPayoutValue: sql<number>`coalesce(sum(case when lower(cast(${sellerPayouts.status} as text)) = 'completed' then ${sellerPayouts.amount}::numeric else 0 end), 0)`,
              pendingPayoutValue: sql<number>`coalesce(sum(case when lower(cast(${sellerPayouts.status} as text)) in ('pending', 'processing') then ${sellerPayouts.amount}::numeric else 0 end), 0)`,
            })
            .from(sellerPayouts)
            .where(eq(sellerPayouts.sellerId, sellerId)),
          db
            .select({
              totalCommissionCharged: sql<number>`coalesce(sum(${commissions.commissionAmount}::numeric), 0)`,
              netSellerProfit: sql<number>`coalesce(sum(${commissions.sellerAmount}::numeric), 0)`,
            })
            .from(commissions)
            .where(eq(commissions.sellerId, sellerId)),
          db
            .select({
              availableBalance: sql<number>`coalesce(sum(${commissions.sellerAmount}::numeric), 0)`,
            })
            .from(commissions)
            .where(and(eq(commissions.sellerId, sellerId), eq(commissions.status, "pending"))),
          db
            .select({
              featuredProducts: sql<number>`count(*)`,
            })
            .from(featuredListings)
            .where(and(eq(featuredListings.sellerId, sellerId), eq(featuredListings.isActive, true))),
        ]);

        const summaryRow = summaryRows[0] || {};
        const productSummaryRow = productSummaryRows[0] || {};
        const payoutSummaryRow = payoutSummaryRows[0] || {};
        const commissionSummaryRow = commissionSummaryRows[0] || {};
        const totalCommissionCharged = Number(commissionSummaryRow.totalCommissionCharged ?? 0);
        const netSellerProfit = Number(commissionSummaryRow.netSellerProfit ?? 0);
        const completedPayoutValue = Number(payoutSummaryRow.completedPayoutValue ?? 0);
        const pendingPayoutValue = Number(payoutSummaryRow.pendingPayoutValue ?? 0);
        const availableBalance = Number(availableBalanceRows[0]?.availableBalance ?? 0);
        const featuredProducts = Number(featuredProductSummaryRows[0]?.featuredProducts ?? 0);

        const { password: _password, ...sellerWithoutPassword } = seller as any;

        return res.json({
          seller: sellerWithoutPassword,
          store,
          summary: {
            totalSales: Number(summaryRow.totalSales ?? 0),
            totalRevenue: Number(summaryRow.totalRevenue ?? 0),
            totalPaid: Number(summaryRow.totalPaid ?? 0),
            salesThisMonth: Number(summaryRow.salesThisMonth ?? 0),
            revenueThisMonth: Number(summaryRow.revenueThisMonth ?? 0),
            avgOrderValue: Number(summaryRow.totalSales ?? 0) > 0 ? Number(summaryRow.totalRevenue ?? 0) / Number(summaryRow.totalSales ?? 0) : 0,
            totalProducts: Number(productSummaryRow.totalProducts ?? 0),
            activeProducts: Number(productSummaryRow.activeProducts ?? 0),
            inactiveProducts: Number(productSummaryRow.inactiveProducts ?? 0),
            outOfStockProducts: Number(productSummaryRow.outOfStockProducts ?? 0),
            lowStockProducts: Number(productSummaryRow.lowStockProducts ?? 0),
            totalStockUnits: Number(productSummaryRow.totalStockUnits ?? 0),
            averageProductRating: Number(productSummaryRow.averageProductRating ?? 0),
            totalProductRatings: Number(productSummaryRow.totalProductRatings ?? 0),
            featuredProducts,
            totalCommissionCharged,
            netSellerProfit,
            availableBalance,
            completedPayoutValue,
            pendingPayoutValue,
          },
          sales: [],
          payouts: [],
          commissions: [],
          products: [],
          topProducts: [],
          recentActivity: [],
        });
      }

      const [rawProducts, sales, payouts, commissionsList, availableBalance, activeFeaturedRows] = await Promise.all([
        storage.getProducts({ sellerId }),
        storage.getOrdersByUser(sellerId, "seller"),
        storage.getSellerPayouts(sellerId),
        storage.getSellerCommissions(sellerId),
        storage.getSellerAvailableBalance(sellerId),
        db
          .select()
          .from(featuredListings)
          .where(and(eq(featuredListings.sellerId, sellerId), eq(featuredListings.isActive, true))),
      ]);

      const sellerScopedProducts = rawProducts.filter((product: any) => {
        const matchesStore = store?.id ? product.storeId === store.id : true;
        return matchesStore && !product?.dynamicFields?.archived;
      });
      const productsHydrated = isLite
        ? sellerScopedProducts
        : await hydrateProductsWithCategories(
            await reconcileProductsWithLiveVariants(sellerScopedProducts),
          );
      const productById = new Map(productsHydrated.map((product: any) => [product.id, product]));
      const scopedSales = store?.id
        ? sales.filter((order: any) => order.storeId === store.id)
        : sales;

      const buyerIds = Array.from(new Set(scopedSales.map((order: any) => order.buyerId).filter(Boolean)));
      const riderIds = Array.from(new Set(scopedSales.map((order: any) => order.riderId).filter(Boolean)));
      const relatedUserIds = Array.from(new Set([sellerId, ...buyerIds, ...riderIds]));
      const buyers = !isLite && relatedUserIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
            })
            .from(users)
            .where(inArray(users.id, relatedUserIds))
        : [];
      const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));

      const orderIds = scopedSales.map((order: any) => order.id).filter(Boolean);
      const orderItemRows = !isLite && orderIds.length > 0
        ? await db
            .select({
              orderId: orderItems.orderId,
              productId: orderItems.productId,
              quantity: orderItems.quantity,
              price: orderItems.price,
              total: orderItems.total,
              productName: products.name,
              productImages: products.images,
            })
            .from(orderItems)
            .leftJoin(products, eq(orderItems.productId, products.id))
            .where(inArray(orderItems.orderId, orderIds))
        : [];

      const itemsByOrderId = new Map<string, any[]>();
      const productPerformanceMap = new Map<string, {
        productId: string;
        name: string;
        image: string | null;
        unitsSold: number;
        revenue: number;
        ordersCount: number;
      }>();

      for (const row of orderItemRows) {
        const currentItems = itemsByOrderId.get(row.orderId) || [];
        currentItems.push({
          productId: row.productId,
          productName: row.productName || "Product",
          quantity: Number(row.quantity || 0),
          price: row.price,
          total: row.total,
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
        });
        itemsByOrderId.set(row.orderId, currentItems);

        const existing = productPerformanceMap.get(row.productId) || {
          productId: row.productId,
          name: row.productName || "Product",
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
          unitsSold: 0,
          revenue: 0,
          ordersCount: 0,
        };
        existing.unitsSold += Number(row.quantity || 0);
        existing.revenue += toNumber(row.total);
        existing.ordersCount += 1;
        productPerformanceMap.set(row.productId, existing);
      }

      const detailedSales = scopedSales.map((order: any) => ({
        ...order,
        buyer: buyerById.get(order.buyerId) || null,
        seller: buyerById.get(order.sellerId) || null,
        rider: order.riderId ? buyerById.get(order.riderId) || null : null,
        items: itemsByOrderId.get(order.id) || [],
      }));

      const completedPaidOrders = scopedSales.filter((order: any) => {
        const normalizedStatus = String(order.status || "").toLowerCase().trim();
        return normalizedStatus === "completed" && isPaidPaymentStatus(order.paymentStatus);
      });
      const paidOrders = scopedSales.filter((order: any) => isPaidPaymentStatus(order.paymentStatus));
      const totalRevenue = completedPaidOrders.reduce((sum: number, order: any) => sum + toNumber(order.total), 0);
      const totalPaid = paidOrders.reduce((sum: number, order: any) => sum + toNumber(order.total), 0);
      const totalCommissionCharged = commissionsList.reduce((sum: number, commission: any) => sum + toNumber(commission.commissionAmount), 0);
      const netSellerProfit = commissionsList.reduce((sum: number, commission: any) => sum + toNumber(commission.sellerAmount), 0);
      const completedPayoutValue = payouts
        .filter((payout: any) => String(payout.status || "").toLowerCase() === "completed")
        .reduce((sum: number, payout: any) => sum + toNumber(payout.amount), 0);
      const pendingPayoutValue = payouts
        .filter((payout: any) => ["pending", "processing"].includes(String(payout.status || "").toLowerCase()))
        .reduce((sum: number, payout: any) => sum + toNumber(payout.amount), 0);

      const now = new Date();
      const salesThisMonth = scopedSales.filter((order: any) => {
        const orderDate = order.createdAt ? new Date(order.createdAt) : null;
        return Boolean(orderDate) && orderDate!.getMonth() === now.getMonth() && orderDate!.getFullYear() === now.getFullYear();
      }).length;
      const revenueThisMonth = completedPaidOrders
        .filter((order: any) => {
          const completionDate = order.updatedAt ? new Date(order.updatedAt) : order.deliveredAt ? new Date(order.deliveredAt) : null;
          return Boolean(completionDate) && completionDate!.getMonth() === now.getMonth() && completionDate!.getFullYear() === now.getFullYear();
        })
        .reduce((sum: number, order: any) => sum + toNumber(order.total), 0);

      const totalStockUnits = productsHydrated.reduce((sum: number, product: any) => sum + Number(product.stock || 0), 0);
      const activeProducts = productsHydrated.filter((product: any) => product.isActive);
      const inactiveProducts = productsHydrated.filter((product: any) => !product.isActive);
      const outOfStockProducts = productsHydrated.filter((product: any) => Number(product.stock || 0) <= 0);
      const lowStockProducts = productsHydrated.filter((product: any) => {
        const stock = Number(product.stock || 0);
        return stock > 0 && stock <= 5;
      });
      const ratedProducts = productsHydrated.filter((product: any) => Number(product.totalRatings || 0) > 0);
      const averageProductRating = ratedProducts.length > 0
        ? ratedProducts.reduce((sum: number, product: any) => sum + toNumber(product.ratings), 0) / ratedProducts.length
        : 0;
      const totalProductRatings = productsHydrated.reduce((sum: number, product: any) => sum + Number(product.totalRatings || 0), 0);

      const topProducts = Array.from(productPerformanceMap.values())
        .map((entry) => ({
          ...entry,
          product: productById.get(entry.productId) || null,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      const recentActivity = [
        ...detailedSales.slice(0, 6).map((order: any) => ({
          type: "sale",
          title: `Order #${order.orderNumber}`,
          description: `${order.buyer?.name || "Buyer"} placed an order worth ${order.total} ${order.currency || "GHS"}`,
          status: order.status,
          at: order.createdAt,
        })),
        ...payouts.slice(0, 4).map((payout: any) => ({
          type: "payout",
          title: `Payout ${payout.reference || payout.id}`,
          description: `${payout.amount} ${payout.currency || "GHS"} via ${payout.method}`,
          status: payout.status,
          at: payout.createdAt,
        })),
        ...productsHydrated.slice(0, 4).map((product: any) => ({
          type: "product",
          title: product.name,
          description: `${product.isActive ? "Active" : "Inactive"} product in ${product.categoryName || "Uncategorized"}`,
          status: product.isActive ? "active" : "inactive",
          at: product.updatedAt || product.createdAt,
        })),
      ]
        .filter((item) => item.at)
        .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
        .slice(0, 12);

      const { password: _password, ...sellerWithoutPassword } = seller as any;

      res.json({
        seller: sellerWithoutPassword,
        store,
        summary: {
          totalSales: scopedSales.length,
          totalRevenue,
          totalPaid,
          salesThisMonth,
          revenueThisMonth,
          avgOrderValue: scopedSales.length > 0 ? totalRevenue / scopedSales.length : 0,
          totalProducts: productsHydrated.length,
          activeProducts: activeProducts.length,
          inactiveProducts: inactiveProducts.length,
          outOfStockProducts: outOfStockProducts.length,
          lowStockProducts: lowStockProducts.length,
          totalStockUnits,
          averageProductRating,
          totalProductRatings,
          featuredProducts: activeFeaturedRows.length,
          totalCommissionCharged,
          netSellerProfit,
          availableBalance,
          completedPayoutValue,
          pendingPayoutValue,
        },
        sales: detailedSales,
        payouts,
        commissions: commissionsList,
        products: productsHydrated,
        topProducts,
        recentActivity,
      });
    } catch (error: any) {
      console.error("Error building seller dashboard:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/riders/:riderId/dashboard", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { riderId } = req.params;
      const rider = await storage.getUser(riderId);

      if (!rider || rider.role !== "rider") {
        return res.status(404).json({ error: "Rider not found" });
      }

      const toNumber = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
      const normalizeStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
      const isCompletedDelivery = (status?: string | null) => {
        const normalized = normalizeStatus(status);
        return normalized === "completed" || normalized === "delivered";
      };

      const [deliveries, payouts, reviewsList, averageRating, latestLocation] = await Promise.all([
        storage.getOrdersByUser(riderId, "rider"),
        storage.getRiderPayouts(riderId),
        storage.getRiderReviews(riderId),
        storage.getRiderAverageRating(riderId),
        storage.getLatestRiderLocation(riderId),
      ]);

      const buyerIds = Array.from(new Set(deliveries.map((order: any) => order.buyerId).filter(Boolean)));
      const sellerIds = Array.from(new Set(deliveries.map((order: any) => order.sellerId).filter(Boolean)));
      const relatedUserIds = Array.from(new Set([...buyerIds, ...sellerIds]));
      const relatedUsers = relatedUserIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
            })
            .from(users)
            .where(inArray(users.id, relatedUserIds))
        : [];
      const userById = new Map(relatedUsers.map((entry) => [entry.id, entry]));

      const deliveryOrderIds = deliveries.map((order: any) => order.id).filter(Boolean);
      const deliveryItems = deliveryOrderIds.length > 0
        ? await db
            .select({
              orderId: orderItems.orderId,
              productId: orderItems.productId,
              quantity: orderItems.quantity,
              total: orderItems.total,
              productName: products.name,
              productImages: products.images,
            })
            .from(orderItems)
            .leftJoin(products, eq(orderItems.productId, products.id))
            .where(inArray(orderItems.orderId, deliveryOrderIds))
        : [];

      const deliveryItemsByOrderId = new Map<string, any[]>();
      for (const row of deliveryItems) {
        const items = deliveryItemsByOrderId.get(row.orderId) || [];
        items.push({
          productId: row.productId,
          productName: row.productName || "Product",
          quantity: Number(row.quantity || 0),
          total: row.total,
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
        });
        deliveryItemsByOrderId.set(row.orderId, items);
      }

      const detailedDeliveries = deliveries.map((order: any) => ({
        ...order,
        buyer: userById.get(order.buyerId) || null,
        seller: userById.get(order.sellerId) || null,
        items: deliveryItemsByOrderId.get(order.id) || [],
      }));

      const completedDeliveries = deliveries.filter((order: any) => isCompletedDelivery(order.status));
      const activeDeliveries = deliveries.filter((order: any) => {
        const normalized = normalizeStatus(order.status);
        return !["completed", "delivered", "cancelled"].includes(normalized);
      });
      const cancelledDeliveries = deliveries.filter((order: any) => normalizeStatus(order.status) === "cancelled");
      const totalDeliveryFees = completedDeliveries.reduce((sum: number, order: any) => sum + toNumber(order.deliveryFee), 0);
      const now = new Date();
      const completedThisMonth = completedDeliveries.filter((order: any) => {
        const deliveredDate = order.deliveredAt ? new Date(order.deliveredAt) : order.updatedAt ? new Date(order.updatedAt) : null;
        return Boolean(deliveredDate) && deliveredDate!.getMonth() === now.getMonth() && deliveredDate!.getFullYear() === now.getFullYear();
      }).length;
      const earningsThisMonth = completedDeliveries
        .filter((order: any) => {
          const deliveredDate = order.deliveredAt ? new Date(order.deliveredAt) : order.updatedAt ? new Date(order.updatedAt) : null;
          return Boolean(deliveredDate) && deliveredDate!.getMonth() === now.getMonth() && deliveredDate!.getFullYear() === now.getFullYear();
        })
        .reduce((sum: number, order: any) => sum + toNumber(order.deliveryFee), 0);

      const completedPayoutValue = payouts
        .filter((payout: any) => String(payout.status || "").toLowerCase() === "completed")
        .reduce((sum: number, payout: any) => sum + toNumber(payout.amount), 0);
      const pendingPayoutValue = payouts
        .filter((payout: any) => ["pending_approval", "approved", "processing"].includes(String(payout.status || "").toLowerCase()))
        .reduce((sum: number, payout: any) => sum + toNumber(payout.amount), 0);

      const risk = getRiderRiskScore(riderId);
      const recentActivity = [
        ...detailedDeliveries.slice(0, 8).map((order: any) => ({
          type: "delivery",
          title: `Order #${order.orderNumber}`,
          description: `${order.seller?.name || "Seller"} to ${order.buyer?.name || "Buyer"}`,
          status: order.status,
          at: order.deliveredAt || order.updatedAt || order.createdAt,
        })),
        ...payouts.slice(0, 4).map((payout: any) => ({
          type: "payout",
          title: `Payout ${payout.id}`,
          description: `${payout.amount} ${payout.currency || "GHS"} via ${payout.method}`,
          status: payout.status,
          at: payout.createdAt,
        })),
        ...reviewsList.slice(0, 4).map((review: any) => ({
          type: "review",
          title: `Review from ${review.userName || "Customer"}`,
          description: review.comment || "Rating submitted",
          status: `${review.rating || 0} stars`,
          at: review.createdAt,
        })),
      ]
        .filter((item) => item.at)
        .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
        .slice(0, 12);

      const { password: _password, ...riderWithoutPassword } = rider as any;

      res.json({
        rider: riderWithoutPassword,
        summary: {
          totalDeliveries: deliveries.length,
          completedDeliveries: completedDeliveries.length,
          activeDeliveries: activeDeliveries.length,
          cancelledDeliveries: cancelledDeliveries.length,
          completionRate: deliveries.length > 0 ? (completedDeliveries.length / deliveries.length) * 100 : 0,
          totalEarnings: totalDeliveryFees,
          earningsThisMonth,
          completedThisMonth,
          avgDeliveryFee: completedDeliveries.length > 0 ? totalDeliveryFees / completedDeliveries.length : 0,
          completedPayoutValue,
          pendingPayoutValue,
          averageRating,
          totalReviews: reviewsList.length,
          riskScore: Number(risk.score || 0),
          riderOnline: Boolean((rider as any).riderOnline),
        },
        deliveries: detailedDeliveries,
        payouts,
        reviews: reviewsList,
        latestLocation,
        risk,
        recentActivity,
      });
    } catch (error: any) {
      console.error("Error building rider dashboard:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/buyers/:buyerId/dashboard", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { buyerId } = req.params;
      const buyer = await storage.getUser(buyerId);

      if (!buyer || buyer.role !== "buyer") {
        return res.status(404).json({ error: "Buyer not found" });
      }

      const toNumber = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
      const normalizePaymentStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
      const isPaid = (value?: string | null) => ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
      const normalizeStatus = (value?: string | null) => String(value || "").toLowerCase().trim();

      const [ordersForBuyer, wishlistItems] = await Promise.all([
        storage.getOrdersByUser(buyerId, "buyer"),
        storage.getWishlist(buyerId),
      ]);

      const sellerIds = Array.from(new Set(ordersForBuyer.map((order: any) => order.sellerId).filter(Boolean)));
      const riderIds = Array.from(new Set(ordersForBuyer.map((order: any) => order.riderId).filter(Boolean)));
      const relatedUserIds = Array.from(new Set([buyerId, ...sellerIds, ...riderIds]));
      const relatedUsers = relatedUserIds.length > 0
        ? await db.select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            profileImage: users.profileImage,
          }).from(users).where(inArray(users.id, relatedUserIds))
        : [];
      const userById = new Map(relatedUsers.map((entry) => [entry.id, entry]));

      const orderIds = ordersForBuyer.map((order: any) => order.id).filter(Boolean);
      const orderItemRows = orderIds.length > 0
        ? await db.select({
            orderId: orderItems.orderId,
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            price: orderItems.price,
            total: orderItems.total,
            productName: products.name,
            productImages: products.images,
          }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(inArray(orderItems.orderId, orderIds))
        : [];
      const itemsByOrderId = new Map<string, any[]>();
      for (const row of orderItemRows) {
        const items = itemsByOrderId.get(row.orderId) || [];
        items.push({
          productId: row.productId,
          productName: row.productName || "Product",
          quantity: Number(row.quantity || 0),
          price: row.price,
          total: row.total,
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
        });
        itemsByOrderId.set(row.orderId, items);
      }

      const detailedOrders = ordersForBuyer.map((order: any) => ({
        ...order,
        buyer: userById.get(order.buyerId) || null,
        seller: userById.get(order.sellerId) || null,
        rider: order.riderId ? userById.get(order.riderId) || null : null,
        items: itemsByOrderId.get(order.id) || [],
      }));

      const paidOrders = ordersForBuyer.filter((order: any) => isPaid(order.paymentStatus));
      const completedOrders = ordersForBuyer.filter((order: any) => ["completed", "delivered"].includes(normalizeStatus(order.status)));
      const totalSpend = paidOrders.reduce((sum: number, order: any) => sum + toNumber(order.total), 0);
      const deliverySpend = paidOrders.reduce((sum: number, order: any) => sum + toNumber(order.deliveryFee), 0);
      const processingFees = paidOrders.reduce((sum: number, order: any) => sum + toNumber(order.processingFee), 0);
      const wishlistProductIds = Array.from(new Set(wishlistItems.map((item: any) => item.productId).filter(Boolean)));
      const wishedProducts = wishlistProductIds.length > 0
        ? await db.select().from(products).where(inArray(products.id, wishlistProductIds))
        : [];
      const hydratedWishlist = await hydrateProductsWithCategories(wishedProducts);
      const now = new Date();
      const ordersThisMonth = ordersForBuyer.filter((order: any) => {
        const createdAt = order.createdAt ? new Date(order.createdAt) : null;
        return Boolean(createdAt) && createdAt!.getMonth() === now.getMonth() && createdAt!.getFullYear() === now.getFullYear();
      }).length;

      const recentActivity = [
        ...detailedOrders.slice(0, 10).map((order: any) => ({
          type: "order",
          title: `Order #${order.orderNumber}`,
          description: `${order.seller?.name || "Seller"} • ${order.total} ${order.currency || "GHS"}`,
          status: order.status,
          at: order.createdAt,
        })),
        ...hydratedWishlist.slice(0, 4).map((product: any) => ({
          type: "wishlist",
          title: product.name,
          description: `Wishlisted product in ${product.categoryName || "Uncategorized"}`,
          status: "wishlisted",
          at: product.updatedAt || product.createdAt,
        })),
      ].filter((item) => item.at).sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime()).slice(0, 12);

      const { password: _password, ...buyerWithoutPassword } = buyer as any;

      res.json({
        buyer: buyerWithoutPassword,
        summary: {
          totalOrders: ordersForBuyer.length,
          completedOrders: completedOrders.length,
          activeOrders: ordersForBuyer.filter((order: any) => !["completed", "delivered", "cancelled"].includes(normalizeStatus(order.status))).length,
          totalSpend,
          deliverySpend,
          processingFees,
          averageOrderValue: paidOrders.length > 0 ? totalSpend / paidOrders.length : 0,
          ordersThisMonth,
          wishlistCount: hydratedWishlist.length,
          sellerCount: sellerIds.length,
          riderCount: riderIds.length,
        },
        orders: detailedOrders,
        wishlist: hydratedWishlist,
        recentActivity,
      });
    } catch (error: any) {
      console.error("Error building buyer dashboard:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/stores/:storeId/dashboard", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { storeId } = req.params;
      const store = await storage.getStore(storeId);
      if (!store) {
        return res.status(404).json({ error: "Store not found" });
      }

      const toNumber = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
      const normalizePaymentStatus = (value?: string | null) => String(value || "").toLowerCase().trim();
      const isPaid = (value?: string | null) => ["completed", "paid", "success"].includes(normalizePaymentStatus(value));
      const normalizeStatus = (value?: string | null) => String(value || "").toLowerCase().trim();

      const [seller, storeProductsRaw, storeOrders, payouts, commissionsList] = await Promise.all([
        store.primarySellerId ? storage.getUser(store.primarySellerId) : Promise.resolve(undefined),
        storage.getProducts({ storeId }),
        db.select().from(orders).where(eq(orders.storeId, storeId)).orderBy(desc(orders.createdAt)),
        store.primarySellerId ? storage.getSellerPayouts(store.primarySellerId) : Promise.resolve([]),
        store.primarySellerId ? storage.getSellerCommissions(store.primarySellerId) : Promise.resolve([]),
      ]);

      const visibleStoreProducts = storeProductsRaw.filter((product: any) => !product?.dynamicFields?.archived);
      const storeProducts = await hydrateProductsWithCategories(
        await reconcileProductsWithLiveVariants(visibleStoreProducts),
      );
      const buyerIds = Array.from(new Set(storeOrders.map((order: any) => order.buyerId).filter(Boolean)));
      const riderIds = Array.from(new Set(storeOrders.map((order: any) => order.riderId).filter(Boolean)));
      const relatedUserIds = Array.from(new Set([...buyerIds, ...riderIds, ...(store.primarySellerId ? [store.primarySellerId] : [])]));
      const relatedUsers = relatedUserIds.length > 0
        ? await db.select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            profileImage: users.profileImage,
          }).from(users).where(inArray(users.id, relatedUserIds))
        : [];
      const userById = new Map(relatedUsers.map((entry) => [entry.id, entry]));

      const orderIds = storeOrders.map((order: any) => order.id).filter(Boolean);
      const orderItemRows = orderIds.length > 0
        ? await db.select({
            orderId: orderItems.orderId,
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            price: orderItems.price,
            total: orderItems.total,
            productName: products.name,
            productImages: products.images,
          }).from(orderItems).leftJoin(products, eq(orderItems.productId, products.id)).where(inArray(orderItems.orderId, orderIds))
        : [];
      const itemsByOrderId = new Map<string, any[]>();
      const performanceMap = new Map<string, { productId: string; name: string; image: string | null; unitsSold: number; revenue: number }>();
      for (const row of orderItemRows) {
        const items = itemsByOrderId.get(row.orderId) || [];
        items.push({
          productId: row.productId,
          productName: row.productName || "Product",
          quantity: Number(row.quantity || 0),
          price: row.price,
          total: row.total,
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
        });
        itemsByOrderId.set(row.orderId, items);
        const current = performanceMap.get(row.productId) || {
          productId: row.productId,
          name: row.productName || "Product",
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
          unitsSold: 0,
          revenue: 0,
        };
        current.unitsSold += Number(row.quantity || 0);
        current.revenue += toNumber(row.total);
        performanceMap.set(row.productId, current);
      }

      const detailedOrders = storeOrders.map((order: any) => ({
        ...order,
        buyer: userById.get(order.buyerId) || null,
        seller: userById.get(order.sellerId) || null,
        rider: order.riderId ? userById.get(order.riderId) || null : null,
        items: itemsByOrderId.get(order.id) || [],
      }));

      const paidOrders = storeOrders.filter((order: any) => isPaid(order.paymentStatus));
      const totalRevenue = paidOrders.reduce((sum: number, order: any) => sum + toNumber(order.total), 0);
      const completedOrders = storeOrders.filter((order: any) => ["completed", "delivered"].includes(normalizeStatus(order.status)));

      const recentActivity = [
        ...detailedOrders.slice(0, 8).map((order: any) => ({
          type: "order",
          title: `Order #${order.orderNumber}`,
          description: `${order.buyer?.name || "Buyer"} • ${order.total} ${order.currency || "GHS"}`,
          status: order.status,
          at: order.createdAt,
        })),
        ...storeProducts.slice(0, 4).map((product: any) => ({
          type: "product",
          title: product.name,
          description: `${product.categoryName || "Uncategorized"} • stock ${product.stock || 0}`,
          status: product.isActive ? "active" : "inactive",
          at: product.updatedAt || product.createdAt,
        })),
      ].filter((item) => item.at).sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime()).slice(0, 12);

      res.json({
        store,
        seller: seller ? (({ password, ...rest }) => rest)(seller as any) : null,
        summary: {
          totalOrders: storeOrders.length,
          completedOrders: completedOrders.length,
          activeOrders: storeOrders.filter((order: any) => !["completed", "delivered", "cancelled"].includes(normalizeStatus(order.status))).length,
          totalRevenue,
          averageOrderValue: paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0,
          totalProducts: storeProducts.length,
          activeProducts: storeProducts.filter((product: any) => product.isActive).length,
          totalStockUnits: storeProducts.reduce((sum: number, product: any) => sum + Number(product.stock || 0), 0),
          completedPayoutValue: payouts.filter((p: any) => String(p.status || "").toLowerCase() === "completed").reduce((sum: number, p: any) => sum + toNumber(p.amount), 0),
          pendingPayoutValue: payouts.filter((p: any) => ["pending", "processing"].includes(String(p.status || "").toLowerCase())).reduce((sum: number, p: any) => sum + toNumber(p.amount), 0),
          totalCommissionCharged: commissionsList.reduce((sum: number, commission: any) => sum + toNumber(commission.commissionAmount), 0),
        },
        products: storeProducts,
        orders: detailedOrders,
        payouts,
        commissions: commissionsList,
        topProducts: Array.from(performanceMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8),
        recentActivity,
      });
    } catch (error: any) {
      console.error("Error building store dashboard:", error);
      res.status(400).json({ error: error.message });
    }
  });

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
      const senderId = String(req.user!.id);
      const receiverId = String(req.body.receiverId);

      const permission = await chatPermissionService.canInitiateChat(senderId, receiverId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason });
      }

      const receiver = await storage.getUser(receiverId);
      const sender = await storage.getUser(senderId);
      const senderRole = String(sender?.role || "").toLowerCase();
      const receiverRole = String(receiver?.role || "").toLowerCase();
      const isUnifiedSupportSender =
        (senderRole === "rider" || senderRole === "seller") &&
        (receiverRole === "agent" || receiverRole === "admin" || receiverRole === "super_admin");

      let recipientIds = [receiverId];
      if (isUnifiedSupportSender) {
        const [admins, superAdmins, agents] = await Promise.all([
          storage.getUsersByRole("admin"),
          storage.getUsersByRole("super_admin"),
          storage.getUsersByRole("agent"),
        ]);
        const supportIds = [...admins, ...superAdmins, ...agents]
          .filter((u, idx, arr) => Boolean(u?.isActive) && u.id !== senderId && arr.findIndex((x) => x.id === u.id) === idx)
          .map((u) => String(u.id));
        if (supportIds.length > 0) recipientIds = supportIds;
      }

      const createdMessages = await Promise.all(
        recipientIds.map((targetReceiverId) =>
          storage.createMessage({
            senderId,
            receiverId: targetReceiverId,
            message: req.body.message,
            messageType: req.body.messageType || "text",
          })
        )
      );
      const primaryMessage = createdMessages.find((m: any) => String(m.receiverId) === receiverId) || createdMessages[0];

      io.to(senderId).emit("new_message", primaryMessage);
      await Promise.all(
        createdMessages.map((msg) =>
          messageDeliveryService.queueMessage({
            id: msg.id,
            senderId,
            receiverId: String((msg as any).receiverId),
            message: msg.message,
            messageType: (msg.messageType as any) || "text",
            mediaUrl: (msg as any).mediaUrl || undefined,
            emitSenderAck: false,
          })
        )
      );

      const rawMessage = (primaryMessage.message || "").trim();
      const messagePreview = decodeAttachmentNotificationPreview(rawMessage) || rawMessage;
      const actor = resolveMessageNotificationActor(receiver as any, sender as any);
      const notificationBody = messagePreview || `You have a new message from ${actor.bodySenderName}`;

      await Promise.all(
        recipientIds.map(async (targetReceiverId, idx) => {
          if (String(targetReceiverId) === senderId) return;
          const msgForRecipient = createdMessages[idx] || primaryMessage;
          await storage.createNotification({
            userId: targetReceiverId,
            type: "message",
            title: `New message from ${actor.titleSenderName}`,
            message: notificationBody,
            metadata: {
              messageId: msgForRecipient.id,
              senderId: actor.senderIdMetadata,
              senderRole: actor.senderRoleMetadata,
              preview: messagePreview,
            } as any,
          });

          io.to(targetReceiverId).emit("notification", {
            type: "message",
            title: `New message from ${actor.titleSenderName}`,
            message: notificationBody,
            data: {
              messageId: msgForRecipient.id,
              senderId: actor.senderIdMetadata,
              senderRole: actor.senderRoleMetadata,
              preview: messagePreview,
            },
          });
        })
      );

      res.json(primaryMessage);
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
      const requester = await storage.getUser(req.user!.id);
      const peer = await storage.getUser(req.params.userId);
      const requesterRole = String(requester?.role || "").toLowerCase().trim();
      const peerRole = String(peer?.role || "").toLowerCase().trim();
      const isUnifiedSupportThread =
        (requesterRole === "rider" || requesterRole === "seller") &&
        (peerRole === "agent" || peerRole === "admin" || peerRole === "super_admin");

      if (isUnifiedSupportThread) {
        const [admins, superAdmins, agents] = await Promise.all([
          storage.getUsersByRole("admin"),
          storage.getUsersByRole("super_admin"),
          storage.getUsersByRole("agent"),
        ]);
        const supportIds = [...admins, ...superAdmins, ...agents]
          .filter((u, idx, arr) => Boolean(u) && arr.findIndex((x) => x.id === u.id) === idx)
          .map((u) => String(u.id));

        if (supportIds.length === 0) {
          return res.json([]);
        }

        const unifiedMessages = await db
          .select()
          .from(chatMessages)
          .where(
            or(
              and(eq(chatMessages.senderId, req.user!.id), inArray(chatMessages.receiverId, supportIds)),
              and(eq(chatMessages.receiverId, req.user!.id), inArray(chatMessages.senderId, supportIds)),
            ),
          )
          .orderBy(asc(chatMessages.createdAt));

        return res.json(unifiedMessages);
      }

      const messages = await storage.getMessages(req.user!.id, req.params.userId);
      return res.json(messages);
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
      const requester = await storage.getUser(req.user!.id);
      const peer = await storage.getUser(req.params.userId);
      const requesterRole = String(requester?.role || "").toLowerCase().trim();
      const peerRole = String(peer?.role || "").toLowerCase().trim();
      const isUnifiedSupportThread =
        (requesterRole === "rider" || requesterRole === "seller") &&
        (peerRole === "agent" || peerRole === "admin" || peerRole === "super_admin");

      let updatedMessages: any[] = [];
      if (isUnifiedSupportThread) {
        const [admins, superAdmins, agents] = await Promise.all([
          storage.getUsersByRole("admin"),
          storage.getUsersByRole("super_admin"),
          storage.getUsersByRole("agent"),
        ]);
        const supportIds = [...admins, ...superAdmins, ...agents]
          .filter((u, idx, arr) => Boolean(u) && arr.findIndex((x) => x.id === u.id) === idx)
          .map((u) => String(u.id));

        if (supportIds.length > 0) {
          updatedMessages = await db
            .update(chatMessages)
            .set({
              isRead: true,
              status: "read",
              readAt: new Date(),
              deliveredAt: sql`coalesce(${chatMessages.deliveredAt}, now())`,
            })
            .where(
              and(
                eq(chatMessages.receiverId, req.user!.id),
                inArray(chatMessages.senderId, supportIds),
                sql`coalesce(${chatMessages.isRead}, false) = false`,
              ),
            )
            .returning();
        }
      } else {
        updatedMessages = await storage.markMessagesAsRead(req.params.userId, req.user!.id);
      }

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

  // Get message contacts for sellers:
  // - Always include exactly one masked support entry ("Support Agent")
  // - Include active-order stakeholders + existing non-support conversation partners
  app.get("/api/seller/message-contacts", requireAuth, requireRoleAllowInactive("seller"), requireRoleFeature("messages.view"), async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;
      const platformSettings = await storage.getPlatformSettings().catch(() => null as any);
      const supportEmail = String(platformSettings?.contactEmail || "support@kiyumart.com").trim() || "support@kiyumart.com";
      const supportPhone = String(platformSettings?.contactPhone || "").trim() || null;
      const supportLabel = `${String(platformSettings?.platformName || "KiyuMart").trim() || "KiyuMart"} Support`;

      const [admins, superAdmins, agents] = await Promise.all([
        storage.getUsersByRole("admin"),
        storage.getUsersByRole("super_admin"),
        storage.getUsersByRole("agent"),
      ]);
      const supportPool = [...agents, ...admins, ...superAdmins].filter((u) => Boolean(u?.isActive));

      const sellerOrders = await storage.getOrdersByUser(userId, "seller");
      const activeStatuses = new Set([
        "pending",
        "confirmed",
        "processing",
        "packaged",
        "ready",
        "external_dispatch_arranged",
        "searching_rider",
        "assigned",
        "rider_arrived",
        "picked_up",
        "in_transit",
        "en_route",
        "delivering",
        "delivered",
        "completed",
      ]);

      const activeStakeholderIds = new Set<string>();
      sellerOrders.forEach((o: any) => {
        if (!activeStatuses.has(canonicalizeOrderStatus(o.status))) return;
        if (o.buyerId) activeStakeholderIds.add(String(o.buyerId));
        if (o.riderId) activeStakeholderIds.add(String(o.riderId));
      });

      const activeStakeholders = await Promise.all(
        Array.from(activeStakeholderIds).map((id) => storage.getUser(id)),
      );

      const allMessages = await db
        .select({
          senderId: chatMessages.senderId,
          receiverId: chatMessages.receiverId,
        })
        .from(chatMessages)
        .where(sql`${chatMessages.senderId} = ${userId} OR ${chatMessages.receiverId} = ${userId}`);

      const conversationPartners = new Set<string>();
      allMessages.forEach((msg) => {
        if (msg.senderId !== userId) conversationPartners.add(msg.senderId);
        if (msg.receiverId !== userId) conversationPartners.add(msg.receiverId);
      });

      const partnerUsers = await Promise.all(Array.from(conversationPartners).map((id) => storage.getUser(id)));

      const isSupportRole = (role?: string | null) => {
        const normalized = String(role || "").toLowerCase().trim();
        return normalized === "agent" || normalized === "admin" || normalized === "super_admin";
      };

      const allContacts: any[] = [];
      const primarySupport = supportPool[0];
      if (primarySupport) {
        allContacts.push({
          id: primarySupport.id,
          name: supportLabel,
          email: supportEmail,
          role: "support_agent",
          phone: supportPhone,
          profileImage: primarySupport.profileImage || null,
          isActive: true,
        });
      }

      const appendUniqueNonSupportContact = (u: any) => {
        if (!u || isSupportRole(u.role) || allContacts.some((c) => c.id === u.id)) return;
        allContacts.push({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          phone: u.phone,
          profileImage: u.profileImage,
          isActive: u.isActive,
        });
      };

      activeStakeholders.forEach((u) => appendUniqueNonSupportContact(u));
      partnerUsers.forEach((u) => appendUniqueNonSupportContact(u));

      const contacts = allContacts.map((u) => ({
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

  // Get message contacts for riders:
  // - Always include exactly one masked support entry ("Support Agent")
  // - Include only active-order stakeholders (buyer/seller) for assigned deliveries
  app.get("/api/rider/message-contacts", requireAuth, requireRoleAllowInactive("rider"), requireRoleFeature("messages.view"), async (req: AuthRequest, res) => {
    try {
      const userId = req.user!.id;

      // Explicit policy: rider can always contact support staff; buyer/seller contacts are restricted to active deliveries.
      const admins = await storage.getUsersByRole("admin");
      const superAdmins = await storage.getUsersByRole("super_admin");
      const agents = await storage.getUsersByRole("agent");
      const supportPool = [...agents, ...admins, ...superAdmins].filter((u) => Boolean(u?.isActive));

      const riderOrders = await storage.getOrdersByUser(userId, "rider");
      const activeStatuses = new Set([
        "searching_rider",
        "assigned",
        "rider_arrived",
        "picked_up",
        "in_transit",
        "en_route",
        "arrived",
      ]);
      const activeStakeholderIds = new Set<string>();
      riderOrders.forEach((o: any) => {
        if (!activeStatuses.has(canonicalizeOrderStatus(o.status))) return;
        if (o.buyerId) activeStakeholderIds.add(String(o.buyerId));
        if (o.sellerId) activeStakeholderIds.add(String(o.sellerId));
      });
      const activeStakeholders = await Promise.all(
        Array.from(activeStakeholderIds).map((id) => storage.getUser(id))
      );

      const allContacts: any[] = [];
      const primarySupport = supportPool[0];
      if (primarySupport) {
        allContacts.push({
          id: primarySupport.id,
          name: "Support Agent",
          email: "support@kiyumart.com",
          role: "support_agent",
          phone: null,
          profileImage: primarySupport.profileImage || null,
          isActive: true,
        });
      }
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
  app.post("/api/calls/start", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
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

  // Request a call — non-admin users notify admin/super_admin to initiate a call
  app.post("/api/calls/request", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { callType = "voice", message: requestMessage } = req.body;
      const requesterId = req.user!.id;
      const requester = await storage.getUser(requesterId);
      if (!requester) return res.status(404).json({ error: "User not found" });

      // Find all admins and super_admins to notify
      const admins = await db
        .select({ id: users.id })
        .from(users)
        .where(
          or(
            eq(sql`lower(cast(${users.role} as text))`, "admin"),
            eq(sql`lower(cast(${users.role} as text))`, "super_admin"),
          ),
        );

      const callTypeLabel = callType === "video" ? "video" : "voice";
      const title = `Call Request from ${requester.name}`;
      const msg = requestMessage?.trim()
        ? `${requester.name} is requesting a ${callTypeLabel} call: "${requestMessage.trim()}"`
        : `${requester.name} is requesting a ${callTypeLabel} call. Open Messages to call them back.`;

      for (const admin of admins) {
        await storage.createNotification({
          userId: admin.id,
          type: "message",
          title,
          message: msg,
          metadata: {
            callType,
            requesterId,
            requesterName: requester.name,
            link: `/admin/messages?userId=${requesterId}`,
          },
        } as any);
        io.to(admin.id).emit("notification", { type: "default", title, message: msg });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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
        return ["rider", "bus"].includes(String(o.deliveryMethod || "").toLowerCase().trim()) && !o.riderId && ["processing", "ready", "confirmed"].includes(status);
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

  app.get(
    "/api/admin/seller-stats",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("manage_users"),
    async (_req, res) => {
      try {
        const [sellerUsers, sellerStores, productCounts, orderCounts] = await Promise.all([
          storage.getUsersByRole("seller"),
          storage.getStores(),
          db
            .select({
              sellerId: products.sellerId,
              count: sql<number>`cast(count(*) as int)`,
            })
            .from(products)
            .groupBy(products.sellerId),
          db
            .select({
              sellerId: orders.sellerId,
              count: sql<number>`cast(count(*) as int)`,
            })
            .from(orders)
            .where(isNotNull(orders.sellerId))
            .groupBy(orders.sellerId),
        ]);

        const storeBySellerId = new Map(
          sellerStores
            .filter((store) => !!store.primarySellerId)
            .map((store) => [String(store.primarySellerId), store]),
        );
        const productCountBySellerId = new Map(
          productCounts
            .filter((entry) => !!entry.sellerId)
            .map((entry) => [String(entry.sellerId), Number(entry.count || 0)]),
        );
        const orderCountBySellerId = new Map(
          orderCounts
            .filter((entry) => !!entry.sellerId)
            .map((entry) => [String(entry.sellerId), Number(entry.count || 0)]),
        );

        res.json(
          sellerUsers.map((seller) => {
            const linkedStore = storeBySellerId.get(String(seller.id));
            return {
              ...seller,
              storeId: linkedStore?.id || null,
              storeName: seller.storeName || linkedStore?.name || null,
              storeBanner: seller.storeBanner || linkedStore?.banner || null,
              storeLogo: linkedStore?.logo || null,
              productCount: productCountBySellerId.get(String(seller.id)) || 0,
              orderCount: orderCountBySellerId.get(String(seller.id)) || 0,
            };
          }),
        );
      } catch (error: any) {
        console.error("GET /api/admin/seller-stats failed:", error?.message || error);
        res.status(500).json({ error: "Could not load seller stats right now." });
      }
    },
  );

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
      const envMapboxToken = String(
        process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "",
      ).trim();
      if (!settings.mapboxPublicToken && envMapboxToken.startsWith("pk.")) {
        toUpdate.mapboxPublicToken = envMapboxToken;
      }
      if (!settings.mapboxStyleUrl && process.env.VITE_MAPBOX_STYLE_URL) {
        toUpdate.mapboxStyleUrl = process.env.VITE_MAPBOX_STYLE_URL;
      }
      if (!settings.mapboxGlVersion && process.env.VITE_MAPBOX_GL_VERSION) {
        toUpdate.mapboxGlVersion = process.env.VITE_MAPBOX_GL_VERSION;
      }
      if (!settings.smtpHost && process.env.SMTP_HOST) {
        toUpdate.smtpHost = process.env.SMTP_HOST;
      }
      if (!settings.smtpPort && process.env.SMTP_PORT) {
        toUpdate.smtpPort = Number(process.env.SMTP_PORT);
      }
      if (!settings.smtpUser && process.env.SMTP_USER) {
        toUpdate.smtpUser = process.env.SMTP_USER;
      }
      if (!settings.smtpPass && process.env.SMTP_PASS) {
        toUpdate.smtpPass = process.env.SMTP_PASS;
      }
      if ((settings.smtpSecure === null || settings.smtpSecure === undefined) && process.env.SMTP_SECURE) {
        toUpdate.smtpSecure = String(process.env.SMTP_SECURE).trim().toLowerCase() === "true";
      }
      if (!settings.smtpFromEmail && process.env.SMTP_FROM_EMAIL) {
        toUpdate.smtpFromEmail = process.env.SMTP_FROM_EMAIL;
      }
      if (!settings.smtpFromName && process.env.SMTP_FROM_NAME) {
        toUpdate.smtpFromName = process.env.SMTP_FROM_NAME;
      }

      if (Object.keys(toUpdate).length > 0) {
        // Persist imported env settings so they become manageable via dashboard.
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
        showAdminOperationsPanels: settings.showAdminOperationsPanels !== false,
        isExternalRiderSystemEnabled: settings.isExternalRiderSystemEnabled === true,
        showCheckoutDeliveryMap: settings.showCheckoutDeliveryMap !== false,
        allowPickupAgentAdminChat: settings.allowPickupAgentAdminChat !== false,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "••••••••••••••••" : "",
        paystackSecretKey: settings.paystackSecretKey ? "••••••••••••••••" : "",
        smtpPass: settings.smtpPass ? "********************************" : "",
        cloudinaryApiSecretSource: getSource(settings.cloudinaryApiSecret ?? undefined, process.env.CLOUDINARY_API_SECRET),
        cloudinaryApiKeySource: getSource(settings.cloudinaryApiKey ?? undefined, process.env.CLOUDINARY_API_KEY),
        cloudinaryCloudNameSource: getSource(settings.cloudinaryCloudName ?? undefined, process.env.CLOUDINARY_CLOUD_NAME),
        paystackSecretKeySource: getSource(settings.paystackSecretKey ?? undefined, process.env.PAYSTACK_SECRET_KEY),
        paystackPublicKeySource: getSource(settings.paystackPublicKey ?? undefined, process.env.PAYSTACK_PUBLIC_KEY),
        smtpHostSource: getSource(settings.smtpHost ?? undefined, process.env.SMTP_HOST),
        smtpPortSource: getSource(
          settings.smtpPort !== null && settings.smtpPort !== undefined ? String(settings.smtpPort) : undefined,
          process.env.SMTP_PORT,
        ),
        smtpUserSource: getSource(settings.smtpUser ?? undefined, process.env.SMTP_USER),
        smtpPassSource: getSource(settings.smtpPass ?? undefined, process.env.SMTP_PASS),
        smtpFromEmailSource: getSource(settings.smtpFromEmail ?? undefined, process.env.SMTP_FROM_EMAIL),
        smtpFromNameSource: getSource(settings.smtpFromName ?? undefined, process.env.SMTP_FROM_NAME),
        mapboxPublicTokenSource: getSource(
          settings.mapboxPublicToken ?? undefined,
          String(process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "").trim() || undefined,
        ),
        mapboxStyleUrlSource: getSource(
          settings.mapboxStyleUrl ?? undefined,
          String(process.env.VITE_MAPBOX_STYLE_URL || "").trim() || undefined,
        ),
        mapboxGlVersionSource: getSource(
          settings.mapboxGlVersion ?? undefined,
          String(process.env.VITE_MAPBOX_GL_VERSION || "").trim() || undefined,
        ),
      };
      res.json(sanitizedSettings);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Alias for platform settings (used by multi-vendor components)
  app.get("/api/platform-settings", async (req, res) => {
    try {
      let settings: any;
      try {
        settings = await storage.getPlatformSettings();
      } catch {
        settings = buildRouteFallbackPlatformSettings();
      }

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
        const envMapboxToken = String(
          process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "",
        ).trim();
        if (!settings.mapboxPublicToken && envMapboxToken.startsWith("pk.")) {
          toUpdate.mapboxPublicToken = envMapboxToken;
        }
        if (!settings.mapboxStyleUrl && process.env.VITE_MAPBOX_STYLE_URL) {
          toUpdate.mapboxStyleUrl = process.env.VITE_MAPBOX_STYLE_URL;
        }
        if (!settings.mapboxGlVersion && process.env.VITE_MAPBOX_GL_VERSION) {
          toUpdate.mapboxGlVersion = process.env.VITE_MAPBOX_GL_VERSION;
        }

        if (settings?.id !== "default" && Object.keys(toUpdate).length > 0) {
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
        showAdminOperationsPanels: settings.showAdminOperationsPanels !== false,
        isExternalRiderSystemEnabled: settings.isExternalRiderSystemEnabled === true,
        showCheckoutDeliveryMap: settings.showCheckoutDeliveryMap !== false,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "••••••••••••••••" : "",
        paystackSecretKey: settings.paystackSecretKey ? "••••••••••••••••" : "",
        cloudinaryApiSecretSource: getSource(settings.cloudinaryApiSecret ?? undefined, process.env.CLOUDINARY_API_SECRET),
        cloudinaryApiKeySource: getSource(settings.cloudinaryApiKey ?? undefined, process.env.CLOUDINARY_API_KEY),
        cloudinaryCloudNameSource: getSource(settings.cloudinaryCloudName ?? undefined, process.env.CLOUDINARY_CLOUD_NAME),
        paystackSecretKeySource: getSource(settings.paystackSecretKey ?? undefined, process.env.PAYSTACK_SECRET_KEY),
        paystackPublicKeySource: getSource(settings.paystackPublicKey ?? undefined, process.env.PAYSTACK_PUBLIC_KEY),
        mapboxPublicTokenSource: getSource(
          settings.mapboxPublicToken ?? undefined,
          String(process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "").trim() || undefined,
        ),
        mapboxStyleUrlSource: getSource(
          settings.mapboxStyleUrl ?? undefined,
          String(process.env.VITE_MAPBOX_STYLE_URL || "").trim() || undefined,
        ),
        mapboxGlVersionSource: getSource(
          settings.mapboxGlVersion ?? undefined,
          String(process.env.VITE_MAPBOX_GL_VERSION || "").trim() || undefined,
        ),
      };
      res.json(sanitizedSettings);
    } catch (error: any) {
      console.warn('[ROUTES] Falling back to default platform settings response:', error?.message || error);
      const settings: any = buildRouteFallbackPlatformSettings();
      res.json({
        ...settings,
        showAdminOperationsPanels: true,
        isExternalRiderSystemEnabled: false,
        showCheckoutDeliveryMap: true,
        cloudinaryApiSecret: "",
        paystackSecretKey: "",
        cloudinaryApiSecretSource: "none",
        cloudinaryApiKeySource: "none",
        cloudinaryCloudNameSource: "none",
        paystackSecretKeySource: "none",
        paystackPublicKeySource: "none",
        mapboxPublicTokenSource: "none",
        mapboxStyleUrlSource: "db",
        mapboxGlVersionSource: "db",
      });
    }
  });

  app.get("/api/public/platform-settings", async (_req, res) => {
    try {
      let settings: any;
      try {
        settings = await storage.getPlatformSettings();
      } catch {
        settings = buildRouteFallbackPlatformSettings();
      }
      res.json({
        isExternalRiderSystemEnabled: settings.isExternalRiderSystemEnabled === true,
        showCheckoutDeliveryMap: settings.showCheckoutDeliveryMap !== false,
        isMultiVendor: settings.isMultiVendor === true,
        allowSellerBankPayouts: settings.allowSellerBankPayouts !== false,
        allowSellerDirectSupportMessages: settings.allowSellerDirectSupportMessages !== false,
        contactEmail: String(settings.contactEmail || "support@kiyumart.com").trim() || "support@kiyumart.com",
        referralEnabled: settings.referralEnabled === true,
      });
    } catch (error: any) {
      console.warn('[ROUTES] Falling back to public platform settings response:', error?.message || error);
      res.json({
        isExternalRiderSystemEnabled: false,
        showCheckoutDeliveryMap: true,
        isMultiVendor: false,
        allowSellerBankPayouts: true,
        allowSellerDirectSupportMessages: true,
        contactEmail: "support@kiyumart.com",
      });
    }
  });

  app.get("/api/admin/sellers/:sellerId/dashboard/products", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      const seller = await storage.getUser(sellerId);

      if (!seller || seller.role !== "seller") {
        return res.status(404).json({ error: "Seller not found" });
      }

      const store = await storage.getStoreByPrimarySeller(sellerId);
      const rawProducts = await storage.getProducts({ sellerId });
      const sellerScopedProducts = rawProducts.filter((product: any) => {
        const matchesStore = store?.id ? product.storeId === store.id : true;
        return matchesStore && !product?.dynamicFields?.archived;
      });
      const productsHydrated = await hydrateProductsWithCategories(
        await reconcileProductsWithLiveVariants(sellerScopedProducts),
      );

      res.json({
        products: productsHydrated,
      });
    } catch (error: any) {
      console.error("Error building seller products dashboard section:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/sellers/:sellerId/dashboard/sales", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      const seller = await storage.getUser(sellerId);

      if (!seller || seller.role !== "seller") {
        return res.status(404).json({ error: "Seller not found" });
      }

      const toNumber = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;
      const store = await storage.getStoreByPrimarySeller(sellerId);
      const rawProducts = await storage.getProducts({ sellerId });
      const sellerScopedProducts = rawProducts.filter((product: any) => {
        const matchesStore = store?.id ? product.storeId === store.id : true;
        return matchesStore && !product?.dynamicFields?.archived;
      });
      const productsHydrated = await hydrateProductsWithCategories(
        await reconcileProductsWithLiveVariants(sellerScopedProducts),
      );
      const productById = new Map(productsHydrated.map((product: any) => [product.id, product]));

      const allSales = await storage.getOrdersByUser(sellerId, "seller");
      const sales = store?.id
        ? allSales.filter((order: any) => order.storeId === store.id)
        : allSales;
      const buyerIds = Array.from(new Set(sales.map((order: any) => order.buyerId).filter(Boolean)));
      const riderIds = Array.from(new Set(sales.map((order: any) => order.riderId).filter(Boolean)));
      const relatedUserIds = Array.from(new Set([sellerId, ...buyerIds, ...riderIds]));
      const buyers = relatedUserIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
              email: users.email,
              phone: users.phone,
            })
            .from(users)
            .where(inArray(users.id, relatedUserIds))
        : [];
      const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));

      const orderIds = sales.map((order: any) => order.id).filter(Boolean);
      const orderItemRows = orderIds.length > 0
        ? await db
            .select({
              orderId: orderItems.orderId,
              productId: orderItems.productId,
              quantity: orderItems.quantity,
              price: orderItems.price,
              total: orderItems.total,
              selectedColor: orderItems.selectedColor,
              selectedSize: orderItems.selectedSize,
              selectedImageIndex: orderItems.selectedImageIndex,
              productName: products.name,
              productImages: products.images,
            })
            .from(orderItems)
            .leftJoin(products, eq(orderItems.productId, products.id))
            .where(inArray(orderItems.orderId, orderIds))
        : [];

      const itemsByOrderId = new Map<string, any[]>();
      const productPerformanceMap = new Map<string, {
        productId: string;
        name: string;
        image: string | null;
        unitsSold: number;
        revenue: number;
        ordersCount: number;
      }>();

      for (const row of orderItemRows) {
        const currentItems = itemsByOrderId.get(row.orderId) || [];
        currentItems.push({
          productId: row.productId,
          productName: row.productName || "Product",
          quantity: Number(row.quantity || 0),
          price: row.price,
          total: row.total,
          selectedColor: row.selectedColor || null,
          selectedSize: row.selectedSize || null,
          image: Array.isArray(row.productImages)
            ? row.productImages[Math.max(0, Number(row.selectedImageIndex ?? 0))] || row.productImages[0] || null
            : null,
        });
        itemsByOrderId.set(row.orderId, currentItems);

        const existing = productPerformanceMap.get(row.productId) || {
          productId: row.productId,
          name: row.productName || "Product",
          image: Array.isArray(row.productImages) ? row.productImages[0] || null : null,
          unitsSold: 0,
          revenue: 0,
          ordersCount: 0,
        };
        existing.unitsSold += Number(row.quantity || 0);
        existing.revenue += toNumber(row.total);
        existing.ordersCount += 1;
        productPerformanceMap.set(row.productId, existing);
      }

      const detailedSales = await Promise.all(
        sales.map(async (order: any) => ({
          ...order,
          buyer: buyerById.get(order.buyerId) || null,
          seller: buyerById.get(order.sellerId) || null,
          rider: order.riderId ? buyerById.get(order.riderId) || null : null,
          items: itemsByOrderId.get(order.id) || [],
          pickupStationInfo: await buildPickupStationInfo(order),
        })),
      );

      const topProducts = Array.from(productPerformanceMap.values())
        .map((entry) => ({
          ...entry,
          product: productById.get(entry.productId) || null,
        }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8);

      res.json({
        sales: detailedSales,
        topProducts,
      });
    } catch (error: any) {
      console.error("Error building seller sales dashboard section:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/sellers/:sellerId/dashboard/finance", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      const seller = await storage.getUser(sellerId);

      if (!seller || seller.role !== "seller") {
        return res.status(404).json({ error: "Seller not found" });
      }

      const [payouts, commissionsList] = await Promise.all([
        storage.getSellerPayouts(sellerId),
        storage.getSellerCommissions(sellerId),
      ]);

      res.json({
        payouts,
        commissions: commissionsList,
      });
    } catch (error: any) {
      console.error("Error building seller finance dashboard section:", error);
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/sellers/:sellerId/dashboard/activity", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req, res) => {
    try {
      const { sellerId } = req.params;
      const seller = await storage.getUser(sellerId);

      if (!seller || seller.role !== "seller") {
        return res.status(404).json({ error: "Seller not found" });
      }

      const store = await storage.getStoreByPrimarySeller(sellerId);
      const rawProducts = await storage.getProducts({ sellerId });
      const sellerScopedProducts = rawProducts.filter((product: any) => {
        const matchesStore = store?.id ? product.storeId === store.id : true;
        return matchesStore && !product?.dynamicFields?.archived;
      });
      const productsHydrated = await hydrateProductsWithCategories(
        await reconcileProductsWithLiveVariants(sellerScopedProducts),
      );
      const allSales = await storage.getOrdersByUser(sellerId, "seller");
      const sales = store?.id
        ? allSales.filter((order: any) => order.storeId === store.id)
        : allSales;
      const payouts = await storage.getSellerPayouts(sellerId);

      const buyerIds = Array.from(new Set(sales.map((order: any) => order.buyerId).filter(Boolean)));
      const buyers = buyerIds.length > 0
        ? await db
            .select({
              id: users.id,
              name: users.name,
            })
            .from(users)
            .where(inArray(users.id, buyerIds))
        : [];
      const buyerById = new Map(buyers.map((buyer) => [buyer.id, buyer]));

      const recentActivity = [
        ...sales.slice(0, 6).map((order: any) => ({
          type: "sale",
          title: `Order #${order.orderNumber}`,
          description: `${buyerById.get(order.buyerId)?.name || "Buyer"} placed an order worth ${order.total} ${order.currency || "GHS"}`,
          status: order.status,
          at: order.createdAt,
        })),
        ...payouts.slice(0, 4).map((payout: any) => ({
          type: "payout",
          title: `Payout ${payout.reference || payout.id}`,
          description: `${payout.amount} ${payout.currency || "GHS"} via ${payout.method}`,
          status: payout.status,
          at: payout.createdAt,
        })),
        ...productsHydrated.slice(0, 4).map((product: any) => ({
          type: "product",
          title: product.name,
          description: `${product.isActive ? "Active" : "Inactive"} product in ${product.categoryName || "Uncategorized"}`,
          status: product.isActive ? "active" : "inactive",
          at: product.updatedAt || product.createdAt,
        })),
      ]
        .filter((item) => item.at)
        .sort((a, b) => new Date(String(b.at)).getTime() - new Date(String(a.at)).getTime())
        .slice(0, 12);

      res.json({
        recentActivity,
      });
    } catch (error: any) {
      console.error("Error building seller activity dashboard section:", error);
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
      const envMapboxToken = String(
        process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "",
      ).trim();
      if (envMapboxToken.startsWith("pk.") && !current.mapboxPublicToken) toUpdate.mapboxPublicToken = envMapboxToken;
      if (process.env.VITE_MAPBOX_STYLE_URL && !current.mapboxStyleUrl) toUpdate.mapboxStyleUrl = process.env.VITE_MAPBOX_STYLE_URL;
      if (process.env.VITE_MAPBOX_GL_VERSION && !current.mapboxGlVersion) toUpdate.mapboxGlVersion = process.env.VITE_MAPBOX_GL_VERSION;

      if (Object.keys(toUpdate).length === 0) {
        return res.json({ message: "No environment secrets to import", settings: current });
      }

      const updated = await storage.updatePlatformSettings(toUpdate);
      resetCloudinaryConfigCache();
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

  // Import only Mapbox config from environment into DB
  app.post("/api/settings/import-map", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req, res) => {
    try {
      const current = await storage.getPlatformSettings();
      const toUpdate: any = {};
      const envMapboxToken = String(
        process.env.VITE_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || "",
      ).trim();
      const envStyleUrl = String(process.env.VITE_MAPBOX_STYLE_URL || "").trim();
      const envGlVersion = String(process.env.VITE_MAPBOX_GL_VERSION || "").trim();

      if (envMapboxToken.startsWith("pk.")) toUpdate.mapboxPublicToken = envMapboxToken;
      if (envStyleUrl) toUpdate.mapboxStyleUrl = envStyleUrl;
      if (envGlVersion) toUpdate.mapboxGlVersion = envGlVersion;

      if (Object.keys(toUpdate).length === 0) {
        return res.json({ message: "No Mapbox environment values to import", settings: current });
      }

      const updated = await storage.updatePlatformSettings(toUpdate);
      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/settings/import-smtp", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (_req, res) => {
    try {
      const current = await storage.getPlatformSettings();
      const toUpdate: any = {};
      if (process.env.SMTP_HOST && !current.smtpHost) toUpdate.smtpHost = process.env.SMTP_HOST;
      if (process.env.SMTP_PORT && !current.smtpPort) toUpdate.smtpPort = Number(process.env.SMTP_PORT);
      if (process.env.SMTP_USER && !current.smtpUser) toUpdate.smtpUser = process.env.SMTP_USER;
      if (process.env.SMTP_PASS && !current.smtpPass) toUpdate.smtpPass = process.env.SMTP_PASS;
      if (process.env.SMTP_FROM_EMAIL && !current.smtpFromEmail) toUpdate.smtpFromEmail = process.env.SMTP_FROM_EMAIL;
      if (process.env.SMTP_FROM_NAME && !current.smtpFromName) toUpdate.smtpFromName = process.env.SMTP_FROM_NAME;
      if ((current.smtpSecure === null || current.smtpSecure === undefined) && process.env.SMTP_SECURE) {
        toUpdate.smtpSecure = String(process.env.SMTP_SECURE).trim().toLowerCase() === "true";
      }

      if (Object.keys(toUpdate).length === 0) {
        return res.json({ message: "No SMTP environment values to import", settings: current });
      }

      const updated = await storage.updatePlatformSettings(toUpdate);
      res.json({
        ...updated,
        smtpPass: updated.smtpPass ? "********************************" : "",
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/settings", requireAuth, requireRole("admin", "super_admin"), requirePermission("manage_platform_settings"), async (req: AuthRequest, res) => {
    const start = Date.now();
    try {
      const previousSettings = await storage.getPlatformSettings();
      
      // Handle cloudinaryApiSecret: preserve existing if placeholder or empty is sent
      const updateData: any = { ...req.body };

      if (req.user?.role !== "super_admin") {
        delete updateData.isExternalRiderSystemEnabled;
        delete updateData.showCheckoutDeliveryMap;
        delete updateData.allowPickupAgentAdminChat;
        delete updateData.showHomepageFeaturedSection;
        delete updateData.showHomepageNewArrivalSection;
        delete updateData.smtpHost;
        delete updateData.smtpPort;
        delete updateData.smtpUser;
        delete updateData.smtpPass;
        delete updateData.smtpSecure;
        delete updateData.smtpFromEmail;
        delete updateData.smtpFromName;
        delete updateData.freeTierProductLimit;
        delete updateData.maxProductsPerSeller;
        delete updateData.orderAutoCancelHours;
        delete updateData.inviteOnlyRegistration;
      }

      // Preserve sensitive fields when placeholders or empty values are submitted
      if (!updateData.cloudinaryApiSecret || isMaskedSecretValue(updateData.cloudinaryApiSecret)) {
        updateData.cloudinaryApiSecret = previousSettings.cloudinaryApiSecret;
      }
      if (!updateData.paystackSecretKey || isMaskedSecretValue(updateData.paystackSecretKey)) {
        updateData.paystackSecretKey = previousSettings.paystackSecretKey;
      }
      if (!updateData.paystackPublicKey || isMaskedSecretValue(updateData.paystackPublicKey)) {
        updateData.paystackPublicKey = previousSettings.paystackPublicKey;
      }
      if (!updateData.smtpPass || isMaskedSecretValue(updateData.smtpPass)) {
        updateData.smtpPass = previousSettings.smtpPass;
      }
      if (
        updateData.paystackSecretKey &&
        !isMaskedSecretValue(updateData.paystackSecretKey) &&
        !isValidPaystackSecretKey(updateData.paystackSecretKey)
      ) {
        return res.status(400).json({
          error: "Invalid Paystack secret key",
          userMessage: "Please enter a valid Paystack secret key that starts with sk_test_ or sk_live_.",
        });
      }
      if (
        updateData.paystackPublicKey &&
        !isMaskedSecretValue(updateData.paystackPublicKey) &&
        !isValidPaystackPublicKey(updateData.paystackPublicKey)
      ) {
        return res.status(400).json({
          error: "Invalid Paystack public key",
          userMessage: "Please enter a valid Paystack public key that starts with pk_test_ or pk_live_.",
        });
      }
      if (
        isValidPaystackSecretKey(updateData.paystackSecretKey) &&
        isValidPaystackPublicKey(updateData.paystackPublicKey) &&
        getPaystackKeyMode(updateData.paystackSecretKey) !== getPaystackKeyMode(updateData.paystackPublicKey)
      ) {
        return res.status(400).json({
          error: "Mismatched Paystack key modes",
          userMessage: "Your Paystack secret key and public key must both be test keys or both be live keys.",
        });
      }

      if (updateData.paystackSecretKey && isMaskedSecretValue(updateData.paystackSecretKey)) {
        updateData.paystackSecretKey = previousSettings.paystackSecretKey;
      }
      if (updateData.paystackPublicKey && isMaskedSecretValue(updateData.paystackPublicKey)) {
        updateData.paystackPublicKey = previousSettings.paystackPublicKey;
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

      // Preserve existing map config if blank values are submitted, and normalize strings.
      const mapKeys = ["mapboxPublicToken", "mapboxStyleUrl", "mapboxGlVersion"] as const;
      for (const key of mapKeys) {
        if (!(key in updateData)) continue;
        const raw = updateData[key];
        if (raw === null || raw === undefined) {
          delete updateData[key];
          continue;
        }
        if (typeof raw !== "string") {
          delete updateData[key];
          continue;
        }
        const trimmed = raw.trim();
        if (!trimmed) {
          delete updateData[key];
          continue;
        }
        updateData[key] = trimmed;
      }
      if (
        typeof updateData.mapboxPublicToken === "string" &&
        updateData.mapboxPublicToken.length > 0 &&
        !updateData.mapboxPublicToken.startsWith("pk.")
      ) {
        return res.status(400).json({ error: "Mapbox public token must start with pk." });
      }
      if ("smtpPort" in updateData) {
        const smtpPort = Number(updateData.smtpPort);
        if (!Number.isFinite(smtpPort) || smtpPort <= 0) {
          return res.status(400).json({ error: "SMTP port must be a valid positive number." });
        }
        updateData.smtpPort = smtpPort;
      }
      if ("smtpHost" in updateData && typeof updateData.smtpHost === "string") {
        updateData.smtpHost = updateData.smtpHost.trim();
      }
      if ("smtpUser" in updateData && typeof updateData.smtpUser === "string") {
        updateData.smtpUser = updateData.smtpUser.trim();
      }
      if ("smtpFromEmail" in updateData && typeof updateData.smtpFromEmail === "string") {
        updateData.smtpFromEmail = updateData.smtpFromEmail.trim().toLowerCase();
      }
      if ("smtpFromName" in updateData && typeof updateData.smtpFromName === "string") {
        updateData.smtpFromName = updateData.smtpFromName.trim();
      }

      // Encrypt sensitive fields at rest using AES-256-GCM (no-op if key not configured)
      if (updateData.smtpPass && typeof updateData.smtpPass === "string" && !isEncrypted(updateData.smtpPass)) {
        updateData.smtpPass = encryptField(updateData.smtpPass);
      }
      if (updateData.paystackSecretKey && typeof updateData.paystackSecretKey === "string" && !isEncrypted(updateData.paystackSecretKey)) {
        updateData.paystackSecretKey = encryptField(updateData.paystackSecretKey);
      }
      if (updateData.cloudinaryApiSecret && typeof updateData.cloudinaryApiSecret === "string" && !isEncrypted(updateData.cloudinaryApiSecret)) {
        updateData.cloudinaryApiSecret = encryptField(updateData.cloudinaryApiSecret);
      }

      let settings;
      try {
        settings = await storage.updatePlatformSettings(updateData);
      } catch (error: any) {
        const message = String(error?.message || "");
        const missingBankPayoutColumn =
          message.includes("allow_seller_bank_payouts") &&
          message.toLowerCase().includes("does not exist");
        const missingExternalRiderColumn =
          message.includes("is_external_rider_system_enabled") &&
          message.toLowerCase().includes("does not exist");
        const missingCheckoutMapColumn =
          message.includes("show_checkout_delivery_map") &&
          message.toLowerCase().includes("does not exist");
        const missingPickupAgentChatColumn =
          message.includes("allow_pickup_agent_admin_chat") &&
          message.toLowerCase().includes("does not exist");
        const missingSellerDirectSupportMessagesColumn =
          message.includes("allow_seller_direct_support_messages") &&
          message.toLowerCase().includes("does not exist");
        const missingSharedVariantStockColumn =
          message.includes("allow_shared_variant_color_stock") &&
          message.toLowerCase().includes("does not exist");

        if (
          !missingBankPayoutColumn &&
          !missingExternalRiderColumn &&
          !missingCheckoutMapColumn &&
          !missingPickupAgentChatColumn &&
          !missingSellerDirectSupportMessagesColumn &&
          !missingSharedVariantStockColumn
        ) {
          throw error;
        }

        console.warn(
          "[ROUTES] platform settings update hit a missing newer feature column; retrying without unsupported fields",
        );
        delete updateData.allowSellerBankPayouts;
        delete updateData.isExternalRiderSystemEnabled;
        delete updateData.showCheckoutDeliveryMap;
        delete updateData.allowPickupAgentAdminChat;
        delete updateData.allowSellerDirectSupportMessages;
        delete updateData.allowSharedVariantColorStock;
        settings = await storage.updatePlatformSettings(updateData);
      }

      if (previousSettings.allowPickupAgentAdminChat !== settings.allowPickupAgentAdminChat) {
        const { db } = await import("../db/index");
        const { supportConversations, users } = await import("@shared/schema");
        const { eq, inArray } = await import("drizzle-orm");
        const superAdmins = await storage.getUsersByRole("super_admin");
        const activeSuperAdminIds = superAdmins
          .filter((staff) => staff?.isActive !== false)
          .map((staff) => String(staff.id));

        const pickupAgentConversations = await db
          .select({ id: supportConversations.id, customerId: supportConversations.customerId })
          .from(supportConversations)
          .leftJoin(users, eq(supportConversations.customerId, users.id))
          .where(eq(users.role, "pickup_agent" as any));

        const activePickupAgents = await storage.getUsersByRole("pickup_agent");
        const activePickupAgentIds = new Set(
          activePickupAgents.filter((agent) => agent?.isActive !== false).map((agent) => String(agent.id)),
        );
        const targetConversationIds = pickupAgentConversations
          .filter((conversation) => activePickupAgentIds.has(String(conversation.customerId)))
          .map((conversation) => String(conversation.id));

        if (targetConversationIds.length > 0) {
          const nextRoutingMode = settings.allowPickupAgentAdminChat !== false ? "all_admins" : "specific_staff";
          await db
            .update(supportConversations)
            .set({
              routingMode: nextRoutingMode,
              routingUserIds: nextRoutingMode === "specific_staff" ? activeSuperAdminIds : [],
              agentId: nextRoutingMode === "specific_staff" ? activeSuperAdminIds[0] || null : null,
              status: nextRoutingMode === "specific_staff" && activeSuperAdminIds.length > 0 ? "assigned" : "open",
              updatedAt: new Date(),
            })
            .where(inArray(supportConversations.id, targetConversationIds as any));
        }
      }

      if (
        previousSettings.cloudinaryApiSecret !== settings.cloudinaryApiSecret ||
        previousSettings.cloudinaryApiKey !== settings.cloudinaryApiKey ||
        previousSettings.cloudinaryCloudName !== settings.cloudinaryCloudName
      ) {
        resetCloudinaryConfigCache();
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
                  logo: seller.profileImage || seller.storeBanner || "",
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
        }
      }

      settings = {
        ...settings,
        smtpPass: settings.smtpPass ? "********************************" : "",
      };
      
      res.json({
        ...settings,
        showAdminOperationsPanels: settings.showAdminOperationsPanels !== false,
        isExternalRiderSystemEnabled: settings.isExternalRiderSystemEnabled === true,
        showCheckoutDeliveryMap: settings.showCheckoutDeliveryMap !== false,
        allowPickupAgentAdminChat: settings.allowPickupAgentAdminChat !== false,
        cloudinaryApiSecret: settings.cloudinaryApiSecret ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" : "",
        paystackSecretKey: settings.paystackSecretKey ? "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢" : "",
      });
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
        const uniqueTargetIds = Array.from(new Set(targetIds.map((value: any) => String(value || '').trim()).filter(Boolean)));
        const now = new Date();

        for (const tId of uniqueTargetIds) {
          const [existingActivePromotion] = await db
            .select()
            .from(promotionalAds)
            .where(
              and(
                eq(promotionalAds.type, type),
                eq(promotionalAds.targetId, tId),
                eq(promotionalAds.isActive, true),
                or(isNull(promotionalAds.endAt), gte(promotionalAds.endAt, now)),
              ),
            )
            .limit(1);

          if (existingActivePromotion) {
            return res.status(400).json({
              error: `A product promotion already exists for one of the selected products. End the current promotion before creating another one.`,
            });
          }
        }

        for (const tId of uniqueTargetIds) {
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

  const calculatePromotionEndAt = (startAt: Date, durationType: string, duration: number) => {
    const endAt = new Date(startAt);
    if (durationType === "hour") {
      endAt.setHours(endAt.getHours() + duration);
    } else if (durationType === "day") {
      endAt.setDate(endAt.getDate() + duration);
    } else if (durationType === "week") {
      endAt.setDate(endAt.getDate() + (duration * 7));
    } else if (durationType === "month") {
      endAt.setMonth(endAt.getMonth() + duration);
    } else {
      endAt.setDate(endAt.getDate() + duration);
    }
    return endAt;
  };

  const buildPromotionApplicationResponse = async (application: any) => {
    const seller = await storage.getUser(String(application.sellerId)).catch(() => null);
    let resolvedTargetName = String(application.targetName || "Promotion Target");
    let resolvedStoreId: string | null = null;
    let resolvedStoreName: string | null = null;

    if (application.type === "store") {
      const store = await storage.getStore(String(application.targetId || "")).catch(() => null);
      resolvedTargetName = store?.name || resolvedTargetName;
      resolvedStoreId = store?.id || null;
      resolvedStoreName = store?.name || null;
    } else if (application.type === "product") {
      const product = await storage.getProduct(String(application.targetId || "")).catch(() => null);
      resolvedTargetName = product?.name || resolvedTargetName;
      if (product?.storeId) {
        const store = await storage.getStore(String(product.storeId)).catch(() => null);
        resolvedStoreId = store?.id || null;
        resolvedStoreName = store?.name || null;
      }
    }

    const createdPromotion = application.createdPromotionId
      ? await db.select().from(promotionalAds).where(eq(promotionalAds.id, String(application.createdPromotionId))).limit(1).then((rows) => rows[0] || null)
      : null;

    let derivedStatus = String(application.status || "pending_payment");
    if (derivedStatus === "approved" && createdPromotion) {
      const now = new Date();
      const endAt = createdPromotion.endAt ? new Date(createdPromotion.endAt) : null;
      derivedStatus = createdPromotion.isActive && (!endAt || endAt > now) ? "active" : "expired";
    }

    return {
      id: application.id,
      type: application.type,
      targetId: application.targetId,
      targetName: resolvedTargetName,
      storeId: resolvedStoreId,
      storeName: resolvedStoreName,
      durationType: application.durationType,
      duration: application.duration,
      durationHours:
        application.durationType === "day"
          ? Number(application.duration || 0) * 24
          : application.durationType === "week"
            ? Number(application.duration || 0) * 24 * 7
            : application.durationType === "month"
              ? Number(application.duration || 0) * 24 * 30
              : Number(application.duration || 0),
      unitPrice: application.unitPrice,
      totalPrice: application.totalPrice,
      sellerNote: application.sellerNote,
      customerServiceNote: application.customerServiceNote,
      paymentConfirmed: Boolean(application.paymentConfirmed),
      paymentConfirmedAt: application.paymentConfirmedAt,
      approvedAt: application.approvedAt,
      approvedBy: application.approvedBy,
      rejectedAt: application.rejectedAt,
      rejectedBy: application.rejectedBy,
      rejectionReason: application.rejectionReason,
      createdPromotionId: application.createdPromotionId,
      status: derivedStatus,
      isActive: createdPromotion ? Boolean(createdPromotion.isActive) : false,
      startAt: createdPromotion?.startAt || null,
      endAt: createdPromotion?.endAt || null,
      createdAt: application.createdAt,
      seller: seller
        ? {
            id: seller.id,
            name: seller.name,
            email: seller.email,
            phone: seller.phone,
          }
        : null,
    };
  };

  app.get('/api/admin/promotion-applications', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const rows = await db.select().from(promotionApplications).orderBy(desc(promotionApplications.createdAt));
      const enriched = await Promise.all(rows.map((row) => buildPromotionApplicationResponse(row)));
      res.json(enriched);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/admin/promotion-applications/:id/confirm-payment', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
    try {
      const [application] = await db.select().from(promotionApplications).where(eq(promotionApplications.id, req.params.id)).limit(1);
      if (!application) {
        return res.status(404).json({ error: "Promotion application not found" });
      }
      if (String(application.status) === "rejected") {
        return res.status(400).json({ error: "Rejected applications cannot be confirmed" });
      }

      const customerServiceNote = typeof req.body?.customerServiceNote === "string" ? req.body.customerServiceNote.trim() : "";
      const [updated] = await db
        .update(promotionApplications)
        .set({
          paymentConfirmed: true,
          paymentConfirmedAt: new Date(),
          paymentConfirmedBy: req.user?.id || null,
          customerServiceNote: customerServiceNote || application.customerServiceNote || null,
          status: "payment_confirmed",
          updatedAt: new Date(),
        })
        .where(eq(promotionApplications.id, application.id))
        .returning();

      if (application.sellerId) {
        await storage.createNotification({
          userId: application.sellerId,
          type: "system" as any,
          title: "Promotion payment confirmed",
          message: `Your ${application.type} promotion payment has been confirmed. Your request is now under final review.`,
          metadata: {
            promotionApplicationId: application.id,
            status: "payment_confirmed",
          } as any,
        });
      }

      res.json(await buildPromotionApplicationResponse(updated));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.patch('/api/admin/promotion-applications/:id/reject', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
    try {
      const [application] = await db.select().from(promotionApplications).where(eq(promotionApplications.id, req.params.id)).limit(1);
      if (!application) {
        return res.status(404).json({ error: "Promotion application not found" });
      }

      const rejectionReason = typeof req.body?.rejectionReason === "string" ? req.body.rejectionReason.trim() : "";
      const customerServiceNote = typeof req.body?.customerServiceNote === "string" ? req.body.customerServiceNote.trim() : "";

      const [updated] = await db
        .update(promotionApplications)
        .set({
          status: "rejected",
          rejectedAt: new Date(),
          rejectedBy: req.user?.id || null,
          rejectionReason: rejectionReason || null,
          customerServiceNote: customerServiceNote || application.customerServiceNote || null,
          updatedAt: new Date(),
        })
        .where(eq(promotionApplications.id, application.id))
        .returning();

      if (application.sellerId) {
        await storage.createNotification({
          userId: application.sellerId,
          type: "system" as any,
          title: "Promotion application rejected",
          message: rejectionReason || "Your promotion application was rejected. Contact customer support for more details.",
          metadata: {
            promotionApplicationId: application.id,
            status: "rejected",
          } as any,
        });
      }

      res.json(await buildPromotionApplicationResponse(updated));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/admin/promotion-applications/:id/approve', requireAuth, requireRole('super_admin'), requirePermission("manage_promotions"), async (req: AuthRequest, res) => {
    try {
      const [application] = await db.select().from(promotionApplications).where(eq(promotionApplications.id, req.params.id)).limit(1);
      if (!application) {
        return res.status(404).json({ error: "Promotion application not found" });
      }
      if (String(application.status) === "rejected") {
        return res.status(400).json({ error: "Rejected applications cannot be approved" });
      }
      if (!application.paymentConfirmed) {
        return res.status(400).json({ error: "Confirm payment before approving this promotion" });
      }
      if (application.createdPromotionId) {
        return res.status(400).json({ error: "This promotion application has already been approved" });
      }

      const now = new Date();
      const endAt = calculatePromotionEndAt(now, String(application.durationType), Number(application.duration || 0));
      const createdPromotion = await storage.createPromotionalAd({
        type: application.type as "store" | "product",
        targetId: String(application.targetId),
        startAt: now,
        endAt,
        createdBy: application.sellerId,
        title: null,
        description: null,
        imageUrl: null,
        ctaText: null,
        ctaUrl: null,
        themeColor: null,
      });

      const [updated] = await db
        .update(promotionApplications)
        .set({
          status: "approved",
          approvedAt: now,
          approvedBy: req.user?.id || null,
          createdPromotionId: createdPromotion.id,
          updatedAt: now,
        })
        .where(eq(promotionApplications.id, application.id))
        .returning();

      if (application.sellerId) {
        await storage.createNotification({
          userId: application.sellerId,
          type: "system" as any,
          title: "Promotion approved",
          message: `Your ${application.type} promotion has been approved and is now scheduled to run.`,
          metadata: {
            promotionApplicationId: application.id,
            promotionId: createdPromotion.id,
            status: "approved",
          } as any,
        });
      }

      res.json(await buildPromotionApplicationResponse(updated));
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

  app.post('/api/admin/promotions/reset-expired', requireAuth, requireRole('super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const now = new Date();
      const deleted = await db
        .delete(promotionalAds)
        .where(and(isNotNull(promotionalAds.endAt), lte(promotionalAds.endAt, now)))
        .returning({ id: promotionalAds.id });

      res.json({
        ok: true,
        deletedCount: deleted.length,
      });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Public: homepage promotions
  app.get('/api/homepage/promotional', async (req, res) => {
    try {
      const rows = await storage.getActivePromotionalAds();
      // Enrich with store or product info for frontend display
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
      console.error('[PROMO-API] Error:', e.message);
      res.status(400).json({ error: e.message });
    }
  });

  // ============ Admin Promotion Pricing Management ============
  app.post('/api/admin/promotion-pricing', requireAuth, requireRole('admin', 'super_admin'), requirePermission("manage_promotions"), async (req, res) => {
    try {
      const { type, durationType, duration, price } = req.body;
      if (!['store', 'product'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!['hour', 'day', 'week', 'month'].includes(durationType)) return res.status(400).json({ error: 'Invalid durationType' });
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
      const rows = await storage.getAllPromotionPricing({ includeInactive: true });
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
  // Returns the calling admin's own resolved permissions (including defaults when no record exists)
  app.get("/api/admin/my-permissions", requireAuth, requireRole("admin", "super_admin"), async (req: AuthRequest, res) => {
    try {
      if (req.user!.role === "super_admin") {
        return res.json({
          canManageUsers: true, canManageProducts: true, canManageOrders: true, canManageStores: true,
          canManageCategories: true, canManageAdmins: true, canEditPasswords: true, canManageRoles: true,
          canManagePlatformSettings: true, canViewAnalytics: true, canManagePromotions: true,
          canManageReviews: true, canManagePayouts: true, canViewPayouts: true, canManageFeatures: true,
        });
      }
      const [row] = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, req.user!.id)).limit(1);
      const defaults = {
        canManageUsers: true, canManageProducts: true, canManageOrders: true, canManageStores: true,
        canManageCategories: true, canManageAdmins: false, canEditPasswords: false, canManageRoles: false,
        canManagePlatformSettings: true, canViewAnalytics: true, canManagePromotions: true,
        canManageReviews: true, canManagePayouts: true, canViewPayouts: true, canManageFeatures: false,
      };
      res.json({ ...defaults, ...(row ? {
        canManageUsers: row.canManageUsers ?? defaults.canManageUsers,
        canManageProducts: row.canManageProducts ?? defaults.canManageProducts,
        canManageOrders: row.canManageOrders ?? defaults.canManageOrders,
        canManageStores: row.canManageStores ?? defaults.canManageStores,
        canManageCategories: row.canManageCategories ?? defaults.canManageCategories,
        canManageAdmins: row.canManageAdmins ?? defaults.canManageAdmins,
        canEditPasswords: row.canEditPasswords ?? defaults.canEditPasswords,
        canManageRoles: row.canManageRoles ?? defaults.canManageRoles,
        canManagePlatformSettings: row.canManagePlatformSettings ?? defaults.canManagePlatformSettings,
        canViewAnalytics: row.canViewAnalytics ?? defaults.canViewAnalytics,
        canManagePromotions: row.canManagePromotions ?? defaults.canManagePromotions,
        canManageReviews: row.canManageReviews ?? defaults.canManageReviews,
        canManagePayouts: (row as any).canManagePayouts ?? defaults.canManagePayouts,
        canViewPayouts: (row as any).canViewPayouts ?? defaults.canViewPayouts,
        canManageFeatures: (row as any).canManageFeatures ?? defaults.canManageFeatures,
      } : {}) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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
        canManagePayouts: true,
        canViewPayouts: true,
        canManageFeatures: false,
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
          canManagePayouts: (u as any).canManagePayouts ?? defaultPermissions.canManagePayouts,
          canViewPayouts: (u as any).canViewPayouts ?? defaultPermissions.canViewPayouts,
          canManageFeatures: (u as any).canManageFeatures ?? defaultPermissions.canManageFeatures,
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
        "canManagePayouts",
        "canViewPayouts",
        "canManageFeatures",
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
      res.json(
        features.map((entry: any) => ({
          ...entry,
          features: sanitizeRoleFeaturePayload(entry.role, entry.features || {}),
        })),
      );
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

      const normalizedRole = String(role || "").toLowerCase().trim();
      let normalizedFeatures = Object.fromEntries(
        Object.entries(features as Record<string, unknown>).map(([key, value]) => [key, value === true]),
      ) as Record<string, boolean>;

      // Super admin is always absolute. Any submitted key is persisted as enabled.
      if (normalizedRole === "super_admin") {
        normalizedFeatures = Object.fromEntries(Object.keys(normalizedFeatures).map((key) => [key, true]));
      }
      normalizedFeatures = sanitizeRoleFeaturePayload(normalizedRole, normalizedFeatures);
      
      const updatedFeatures = await storage.updateRoleFeatures(
        normalizedRole,
        normalizedFeatures,
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

  app.get('/api/seller/promotion-applications', requireAuth, requireRoleFeatureIfRole(["seller"], "promotions.manage"), async (req: AuthRequest, res) => {
    try {
      const user = req.user;
      if (!user || user.role !== 'seller') {
        return res.status(403).json({ error: "Seller access required" });
      }

      const rows = await db
        .select()
        .from(promotionApplications)
        .where(eq(promotionApplications.sellerId, user.id))
        .orderBy(desc(promotionApplications.createdAt));

      const enriched = await Promise.all(rows.map((row) => buildPromotionApplicationResponse(row)));
      res.json(enriched);
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

      const { type, targetId, durationType, duration, sellerNote } = req.body;
      if (!['store', 'product'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!['hour', 'day', 'week', 'month'].includes(durationType)) return res.status(400).json({ error: 'Invalid durationType' });
      if (typeof duration !== 'number' || duration <= 0) return res.status(400).json({ error: 'Invalid duration' });

      // Validate targetId belongs to seller
      let targetName = type === "store" ? "Store" : "Product";
      if (type === 'store') {
        const store = await storage.getStore(targetId);
        if (!store || store.primarySellerId !== user.id) {
          return res.status(403).json({ error: 'You can only promote your own store' });
        }
        targetName = store.name || "Store";
      } else if (type === 'product') {
        const product = await storage.getProduct(targetId);
        if (!product || product.sellerId !== user.id) {
          return res.status(403).json({ error: 'You can only promote your own products' });
        }
        targetName = product.name || "Product";
      }

      const now = new Date();
      const [existingActivePromotion] = await db
        .select()
        .from(promotionalAds)
        .where(
          and(
            eq(promotionalAds.type, type),
            eq(promotionalAds.targetId, targetId),
            eq(promotionalAds.isActive, true),
            or(isNull(promotionalAds.endAt), gte(promotionalAds.endAt, now)),
          ),
        )
        .limit(1);

      if (existingActivePromotion) {
        return res.status(400).json({ error: `This ${type} already has an active promotion.` });
      }

      const [existingOpenApplication] = await db
        .select()
        .from(promotionApplications)
        .where(
          and(
            eq(promotionApplications.sellerId, user.id),
            eq(promotionApplications.type, type),
            eq(promotionApplications.targetId, targetId),
            or(
              eq(promotionApplications.status, "pending_payment"),
              eq(promotionApplications.status, "payment_confirmed"),
            ),
          ),
        )
        .limit(1);

      if (existingOpenApplication) {
        return res.status(400).json({ error: `A promotion request for this ${type} is already in progress.` });
      }

      // Get pricing
      const pricing = await storage.getPromotionPricing(type, durationType, duration);
      if (!pricing) {
        return res.status(400).json({ error: 'No pricing found for the selected options' });
      }

      // Calculate total price (for multiple days, multiply)
      const unitPrice = parseFloat(pricing.price);
      const totalPrice = unitPrice * duration;
      const [application] = await db
        .insert(promotionApplications)
        .values({
          sellerId: user.id,
          type,
          targetId,
          targetName,
          durationType,
          duration,
          unitPrice: unitPrice.toFixed(2),
          totalPrice: totalPrice.toFixed(2),
          sellerNote: typeof sellerNote === "string" && sellerNote.trim() ? sellerNote.trim() : null,
          status: "pending_payment",
          paymentConfirmed: false,
        } as any)
        .returning();

      const requestUser = req.user as (typeof req.user & { name?: string; phone?: string });
      await notifyAdmins(
        "system",
        "New Seller Promotion Application",
        `${requestUser.name || user.email || "Seller"} requested a ${type} promotion for ${targetName}. Contact the seller to facilitate payment.`,
        {
          promotionApplicationId: application.id,
          sellerId: user.id,
          sellerName: requestUser.name,
          sellerEmail: user.email,
          sellerPhone: requestUser.phone,
          type,
          targetId,
          targetName,
          durationType,
          duration,
          totalPrice: totalPrice.toFixed(2),
          sellerNote: application.sellerNote,
          link: `/admin/applications?tab=promotions&promotionId=${encodeURIComponent(String(application.id))}`,
        },
        {
          requiredAdminPermission: "manage_promotions",
          includeAgents: true,
          requiredAgentFeature: "support.view",
        },
      );

      await storage.createNotification({
        userId: user.id,
        type: "system" as any,
        title: "Promotion application received",
        message: "Customer service will call you to facilitate payment for this promotion request.",
        metadata: {
          promotionApplicationId: application.id,
          targetName,
          totalPrice: totalPrice.toFixed(2),
        } as any,
      });

      res.json(await buildPromotionApplicationResponse(application));
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // ============ Payment Routes (Paystack) ============
  app.post("/api/payments/initialize", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { orderId, checkoutSessionId } = req.body;
      const forceRetry = req.body?.forceRetry === true;
      const inlineMode = req.body?.inline === true;
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
      const paystackKeyPair = resolvePaystackKeyPair(settings as any);
      let paystackSecretKey = paystackKeyPair.secretKey;
      let paystackPublicKey = paystackKeyPair.publicKey;
      const configuredSecret = String((settings as any)?.paystackSecretKey || "").trim();
      const configuredPublic = String((settings as any)?.paystackPublicKey || "").trim();
      const secretSource = paystackKeyPair.secretSource;
      const publicSource = paystackKeyPair.publicSource;
      console.info(`[PAYMENTS] Initializing checkout: inline=${inlineMode}`);
      if (!paystackSecretKey) {
        return res.status(503).json({ 
          error: "Payment gateway not configured", 
          userMessage: "Payment system is currently unavailable. Please contact support or try again later."
        });
      }
      if (inlineMode && !paystackPublicKey) {
        return res.status(503).json({
          error: "Payment gateway public key not configured",
          userMessage: "Payment system is currently unavailable. Please contact support or try again later.",
        });
      }

      const verifyExistingReferenceStatus = async (reference: string): Promise<string | null> => {
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 8000);
          const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${paystackSecretKey}`,
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
      if (!callbackBase || callbackBase.startsWith('/')) {
        return res.status(503).json({
          error: "Frontend URL not configured",
          userMessage: "Payment cannot be initialized: the platform redirect URL is not configured. Please contact support.",
        });
      }
      const callbackUrl = `${callbackBase}/payment/verify`;
      const {
        isValidGhanaMobileMoneyNumber,
        normalizeGhanaMobileMoneyNumber,
        normalizeGhanaMobileMoneyProvider,
      } = await import("./paystack");

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

      const calculateSellerShareKobo = (order: any, commissionRate: number) => {
        const subtotal = parseFloat(order.subtotal || "0") || 0;
        const couponDiscount = parseFloat(order.couponDiscount || "0") || 0;
        const merchandiseNet = Math.max(0, subtotal - couponDiscount);
        const sellerShare = Math.max(0, merchandiseNet * (100 - commissionRate) / 100);
        return Math.round(sellerShare * 100);
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
              
              // Seller share is merchandise net of coupon discounts and commission only.
              // Delivery fees and processing fees remain with the platform.
              const sellerShare = calculateSellerShareKobo(order, commissionRate);

              // Only include as Paystack subaccount if seller uses bank account payouts
              if (store.payoutType === 'bank_account') {
                if (settings.allowSellerBankPayouts === false) {
                  storeErrors.push(`Store ${store.name} bank payout setup is disabled by platform settings`);
                  continue;
                }
                if (!store.isPayoutVerified || !store.paystackSubaccountId) {
                  storeErrors.push(`Store ${store.name} bank payout setup is incomplete`);
                  continue;
                }
                subaccounts.push({
                  subaccount: store.paystackSubaccountId,
                  share: sellerShare,
                });
              } else if (store.payoutType === 'mobile_money') {
                const normalizedProvider = normalizeGhanaMobileMoneyProvider(store.payoutDetails?.provider);
                const normalizedMobileNumber = normalizeGhanaMobileMoneyNumber(store.payoutDetails?.mobileNumber);
                if (
                  !store.isPayoutVerified ||
                  !normalizedMobileNumber ||
                  !normalizedProvider ||
                  !isValidGhanaMobileMoneyNumber(normalizedMobileNumber, normalizedProvider)
                ) {
                  storeErrors.push(`Store ${store.name} mobile money payout setup is incomplete`);
                  continue;
                }
                // For mobile money recipients, include payout info in metadata for post-processing
                paymentPayload.metadata = paymentPayload.metadata || {};
                paymentPayload.metadata.mobilePayouts = paymentPayload.metadata.mobilePayouts || [];
                paymentPayload.metadata.mobilePayouts.push({
                  storeId: store.id,
                  sellerId: store.primarySellerId,
                  provider: normalizedProvider,
                  mobileNumber: normalizedMobileNumber,
                  amountKobo: sellerShare,
                });
              } else {
                storeErrors.push(`Store ${store.name} has an unsupported payout method`);
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
          // Remove transaction_charge — it only applies to single-subaccount splits,
          // not Paystack's multi-split (subaccounts array) format.
          delete paymentPayload.transaction_charge;
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
            if (store) {
              const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "1");
              const sellerShare = calculateSellerShareKobo(order, commissionRate);

              // Only assign as Paystack subaccount when seller uses bank account payouts
              if (store.payoutType === 'bank_account') {
                if (settings.allowSellerBankPayouts === false) {
                  return res.status(400).json({
                    error: "Payment configuration incomplete",
                    userMessage: `Store ${store.name} bank payout setup is currently disabled by platform settings.`,
                  });
                }
                if (!store.isPayoutVerified || !store.paystackSubaccountId) {
                  return res.status(400).json({
                    error: "Payment configuration incomplete",
                    userMessage: `Store ${store.name} bank payout setup is incomplete.`,
                  });
                }
                paymentPayload.subaccount = store.paystackSubaccountId;
                // Keep only the seller's merchandise share with the subaccount.
                // Commission, processing, and delivery remain with the platform.
                paymentPayload.transaction_charge = Math.max(0, paymentPayload.amount - sellerShare);
                paymentPayload.bearer = "account"; // Platform bears Paystack fees

                paymentPayload.metadata.storeId = store.id;
                paymentPayload.metadata.storeName = store.name;
                paymentPayload.metadata.commissionRate = commissionRate;
                paymentPayload.metadata.splitEnabled = true;
                paymentPayload.metadata.sellerShareKobo = sellerShare;
              } else if (store.payoutType === 'mobile_money') {
                const normalizedProvider = normalizeGhanaMobileMoneyProvider(store.payoutDetails?.provider);
                const normalizedMobileNumber = normalizeGhanaMobileMoneyNumber(store.payoutDetails?.mobileNumber);
                if (
                  !store.isPayoutVerified ||
                  !normalizedMobileNumber ||
                  !normalizedProvider ||
                  !isValidGhanaMobileMoneyNumber(normalizedMobileNumber, normalizedProvider)
                ) {
                  return res.status(400).json({
                    error: "Payment configuration incomplete",
                    userMessage: `Store ${store.name} mobile money payout setup is incomplete.`,
                  });
                }
                // For mobile money, include payout info for post-processing and do not set subaccount
                paymentPayload.metadata.storeId = store.id;
                paymentPayload.metadata.storeName = store.name;
                paymentPayload.metadata.commissionRate = commissionRate;
                paymentPayload.metadata.splitEnabled = false;
                paymentPayload.metadata.mobilePayout = paymentPayload.metadata.mobilePayout || {};
                paymentPayload.metadata.mobilePayout[store.id] = {
                  provider: normalizedProvider,
                  mobileNumber: normalizedMobileNumber,
                  amountKobo: sellerShare,
                };
              } else {
                return res.status(400).json({
                  error: "Payment configuration incomplete",
                  userMessage: `Store ${store.name} has an unsupported payout method.`,
                });
              }
            } else {
              return res.status(400).json({
                error: "Payment configuration incomplete",
                userMessage: "Store configuration could not be loaded. Please try again or contact support.",
              });
            }
          } catch (storeError) {
            console.error("Could not fetch store for split payment:", storeError);
            return res.status(500).json({
              error: "Payment configuration error",
              userMessage: "Could not load store configuration for payment. Please try again.",
            });
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

        const initializePayment = async (secretKey: string) =>
          fetch("https://api.paystack.co/transaction/initialize", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${secretKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": idempotencyKey,
          },
          body: JSON.stringify(paymentPayload),
          signal: controller.signal,
        });

        let response = await initializePayment(paystackSecretKey);
        let responsePublicKey = paystackPublicKey;
         
        clearTimeout(timeout);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const gatewayMessage = String(errorData?.message || "").trim();
          if (response.status === 401 || response.status === 403) {
            const envSecret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
            const envPublic = String(process.env.PAYSTACK_PUBLIC_KEY || "").trim();
            const canRetryWithEnvPair =
              isValidPaystackSecretKey(envSecret) &&
              envSecret !== paystackSecretKey;

            if (canRetryWithEnvPair) {
              const retryResponse = await initializePayment(envSecret);
              if (retryResponse.ok) {
                response = retryResponse;
                paystackSecretKey = envSecret;
                if (isValidPaystackPublicKey(envPublic)) {
                  responsePublicKey = envPublic;
                }
              } else {
                const retryErrorData = await retryResponse.json().catch(() => ({}));
                return res.status(502).json({
                  error: String(retryErrorData?.message || gatewayMessage || "Payment gateway authentication failed").trim(),
                  userMessage: "Payment gateway credentials need attention. Please contact support and try again shortly.",
                });
              }
            } else {
              return res.status(502).json({
                error: gatewayMessage || "Payment gateway authentication failed",
                userMessage: "Payment gateway credentials need attention. Please contact support and try again shortly.",
              });
            }
          }
          if (!response.ok) {
            return res.status(502).json({ 
              error: gatewayMessage || "Payment gateway error",
              userMessage: gatewayMessage || "Unable to connect to payment gateway. Please try again in a few moments."
            });
          }
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
        // Reference and status logged via logSystemActivity below
        
        if (!data.status) {
          await logSystemActivity({
            category: "payment",
            severity: "error",
            title: "Paystack initialize failed",
            message: data.message || "Paystack returned a failed initialize response.",
            humanExplanation: "The Paystack gateway declined the initialization request.",
            rootCause: "Paystack returned a non-success status during initialization.",
            suggestedFix: "Verify Paystack credentials, order totals, and network connectivity.",
            preventiveAction: "Keep Paystack keys in sync and monitor gateway health.",
            source: "/api/payments/initialize",
            entityType: "payment",
            entityId: String(orderId || checkoutSessionId || ""),
            actorId: String(req.user?.id || ""),
            actorRole: String(req.user?.role || ""),
            metadata: {
              paystackStatus: data.status,
              paystackMessage: data.message || null,
              reference: data?.data?.reference || null,
              orderIds: orders.map((o: any) => o.id),
              orderNumbers: orders.map((o: any) => o.orderNumber),
              amount: totalAmount,
              currency: orders[0]?.currency || null,
              inline: inlineMode,
            },
          });
          return res.status(400).json({ 
            error: data.message || "Payment initialization failed",
            userMessage: data.message || "Unable to initialize payment. Please try again."
          });
        }

        if (!data.data?.authorization_url || !data.data?.reference) {
          await logSystemActivity({
            category: "payment",
            severity: "error",
            title: "Paystack initialize returned invalid payload",
            message: "Paystack did not return a valid authorization URL or reference.",
            humanExplanation: "The gateway response was missing required fields for checkout.",
            rootCause: "Paystack returned incomplete initialization data.",
            suggestedFix: "Retry initialization and confirm Paystack API status.",
            preventiveAction: "Monitor gateway health and validate responses.",
            source: "/api/payments/initialize",
            entityType: "payment",
            entityId: String(orderId || checkoutSessionId || ""),
            actorId: String(req.user?.id || ""),
            actorRole: String(req.user?.role || ""),
            metadata: {
              paystackStatus: data.status,
              paystackMessage: data.message || null,
              reference: data?.data?.reference || null,
              orderIds: orders.map((o: any) => o.id),
              orderNumbers: orders.map((o: any) => o.orderNumber),
              amount: totalAmount,
              currency: orders[0]?.currency || null,
              inline: inlineMode,
            },
          });
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

        // Payment initialized — logged via logSystemActivity below
        await logSystemActivity({
          category: "payment",
          severity: "info",
          title: "Paystack initialize succeeded",
          message: `Payment initialization created reference ${data.data.reference}.`,
          humanExplanation: "The payment gateway accepted the initialization request and issued a reference.",
          rootCause: "Valid Paystack credentials and order data were supplied.",
          suggestedFix: "Proceed to Paystack inline checkout.",
          preventiveAction: "Continue monitoring initialization success rate.",
          source: "/api/payments/initialize",
          entityType: "payment",
          entityId: String(data.data.reference || ""),
          actorId: String(req.user?.id || ""),
          actorRole: String(req.user?.role || ""),
          metadata: {
            reference: data.data.reference,
            accessCode: data.data.access_code,
            authorizationUrl: data.data.authorization_url,
            orderIds: orders.map((o: any) => o.id),
            orderNumbers: orders.map((o: any) => o.orderNumber),
            amount: totalAmount,
            currency: orders[0]?.currency || null,
            inline: inlineMode,
            keySource: { secret: secretSource, public: publicSource },
          },
        });

        const inlineResponse = {
          reference: data.data.reference,
          access_code: data.data.access_code,
          authorization_url: data.data.authorization_url,
          inline: {
            publicKey: responsePublicKey,
            email: req.user!.email,
            amount: Math.round(totalAmount * 100),
            currency: orders[0].currency,
            reference: data.data.reference,
            accessCode: data.data.access_code,
            channels: ["card", "bank_transfer", "mobile_money"],
          },
        };

        res.json(inlineMode ? inlineResponse : data.data);
      } catch (fetchError: any) {
        clearTimeout(timeout);

        const retryWithEnvSecret =
          paystackSecretKey !== String(process.env.PAYSTACK_SECRET_KEY || "").trim() &&
          String(process.env.PAYSTACK_SECRET_KEY || "").trim().length > 0;

        if (retryWithEnvSecret) {
          try {
            const envSecret = String(process.env.PAYSTACK_SECRET_KEY || "").trim();
            const retryResponse = await fetch("https://api.paystack.co/transaction/initialize", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${envSecret}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(paymentPayload),
            });

            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              if (retryData?.status && retryData?.data?.authorization_url && retryData?.data?.reference) {
                const updatePromises = orders.map((order: any) =>
                  storage.updateOrder(order.id, {
                    paymentReference: retryData.data.reference,
                    paymentStatus: "pending",
                  })
                );
                await Promise.all(updatePromises);

                const retryInlineResponse = {
                  reference: retryData.data.reference,
                  access_code: retryData.data.access_code,
                  authorization_url: retryData.data.authorization_url,
                  inline: {
                    publicKey: paystackPublicKey,
                    email: req.user!.email,
                    amount: Math.round(totalAmount * 100),
                    currency: orders[0].currency,
                    reference: retryData.data.reference,
                    accessCode: retryData.data.access_code,
                    channels: ["card", "bank_transfer", "mobile_money"],
                  },
                };

                return res.json(inlineMode ? retryInlineResponse : retryData.data);
              }
            }
          } catch {
            // Fall through to the normal gateway error response below.
          }
        }
        
        if (fetchError.name === 'AbortError') {
          return res.status(504).json({ 
            error: "Payment gateway timeout",
            userMessage: "Payment gateway is taking too long to respond. Please check your internet connection and try again."
          });
        }
        
        await logSystemActivity({
          category: "payment",
          severity: "error",
          title: "Paystack initialize request failed",
          message: fetchError?.message || "Payment gateway request failed.",
          humanExplanation: "The platform could not reach Paystack to initialize checkout.",
          rootCause: "Network timeout or Paystack API error during initialization.",
          suggestedFix: "Check gateway connectivity and retry with valid credentials.",
          preventiveAction: "Monitor gateway latency and configure retries.",
          source: "/api/payments/initialize",
          entityType: "payment",
          entityId: String(orderId || checkoutSessionId || ""),
          actorId: String(req.user?.id || ""),
          actorRole: String(req.user?.role || ""),
          metadata: {
            orderIds: orders.map((o: any) => o.id),
            orderNumbers: orders.map((o: any) => o.orderNumber),
            amount: totalAmount,
            currency: orders[0]?.currency || null,
            inline: inlineMode,
            error: fetchError?.message || null,
          },
        });
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
    const paystackSecretKey = resolvePaystackSecretKey(settings as any);
    if (!paystackSecretKey) {
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
        await Promise.allSettled(
          targetOrderIds.map((id: string) => storage.createCommissionWithEarning(id))
        );
        try {
          const cartOwnerId = currentUserId || existingTransaction.userId || null;
          if (cartOwnerId && typeof storage.clearCart === "function") {
            await storage.clearCart(cartOwnerId);
          }
        } catch (cartCleanupError: any) {
          console.error("[VERIFY] Could not clear cart for completed transaction:", cartCleanupError?.message || cartCleanupError);
        }
        await startRiderMatchingForPaidOrders(targetOrderIds);
        await ensureReceiptsForOrders(targetOrderIds, {
          trigger: "payment_success",
          generatedBy: currentUserId || existingTransaction.userId || null,
          generatedByRole: currentUserId ? "buyer" : "super_admin",
        });
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

    let usedVerificationFallback = false;
    try {
      const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
        headers: { Authorization: `Bearer ${paystackSecretKey}` },
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

      // Paystack verify response logged via logSystemActivity below — raw data not logged to avoid leaking card details

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
        await logSystemActivity({
          category: "payment",
          severity: "info",
          title: "Paystack verification reused completed transaction",
          message: "Payment verification reused an existing completed transaction record.",
          humanExplanation: "The platform found a completed transaction for this reference and avoided duplicate processing.",
          rootCause: "A prior verification or webhook already completed the transaction.",
          suggestedFix: "No action needed unless the order state is incorrect.",
          preventiveAction: "Continue to use idempotent verification flows.",
          source: "/api/payments/verify",
          entityType: "payment",
          entityId: reference,
          actorId: String(currentUserId || ""),
          actorRole: currentUserId ? "buyer" : "system",
          metadata: {
            reference,
            orderIds: orders.map((o: any) => o.id),
            orderNumbers: orders.map((o: any) => o.orderNumber),
            paymentStatus: "completed",
          },
        });
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
          usedVerificationFallback = true;
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
          try {
            if (primaryOrder?.buyerId && typeof storage.clearCart === "function") {
              await storage.clearCart(primaryOrder.buyerId);
            }
          } catch (cartCleanupError: any) {
            console.error("[VERIFY] Could not clear cart after fallback payment success:", cartCleanupError?.message || cartCleanupError);
          }
          const commissionResults = await Promise.allSettled(
            orders.map((o: any) => storage.createCommissionWithEarning(o.id))
          );
          commissionResults.forEach((result, index) => {
            if (result.status === "rejected") {
              const reason: any = result.reason;
              if (reason?.code === "COMMISSION_ALREADY_EXISTS") return;
              console.error(
                `[VERIFY] Failed to backfill commission for paid order ${orders[index]?.id}:`,
                reason?.message || reason,
              );
            }
          });
          await Promise.all(
            commissionResults.map(async (result) => {
              if (result.status !== "fulfilled") return;
              try {
                await storage.ensureAutomaticSellerPayoutForCommission(result.value.commission.id);
              } catch (settlementErr: any) {
                console.error(
                  `[VERIFY] Failed to ensure automatic seller settlement for commission ${result.value.commission.id}:`,
                  settlementErr?.message || settlementErr,
                );
              }
            })
          );
          try {
            const { notifySellerSettlementSuccess } = await import("./payments");
            await Promise.all(
              commissionResults.map(async (result, index) => {
                if (result.status !== "fulfilled") return;
                const commission = result.value.commission;
                const order = orders[index];
                const payout = await storage.ensureAutomaticSellerPayoutForCommission(commission.id);
                if (!payout) return;
                const store = await storage.getStoreByPrimarySeller(commission.sellerId);
                const destinationLabel = store?.payoutType === "mobile_money"
                  ? `mobile money ${store?.payoutDetails?.mobileNumber || ""}`.trim()
                  : store?.payoutDetails?.accountNumber
                    ? `bank account ${store.payoutDetails.accountNumber}`
                    : "configured payout account";
                if (String(payout.status || "").toLowerCase() === "completed") {
                  await notifySellerSettlementSuccess(storage, io, {
                    sellerId: commission.sellerId,
                    payoutId: payout.id,
                    sellerAmount: commission.sellerAmount,
                    orderId: order?.id || commission.orderId,
                    orderNumber: order?.orderNumber,
                    destinationLabel,
                  });
                }
              })
            );
          } catch (settlementNotifyErr: any) {
            console.error("[VERIFY] Could not send seller settlement notifications:", settlementNotifyErr?.message || settlementNotifyErr);
          }
        } else {
          throw procErr;
        }
      }

        if (data.data.status === "success") {
          await startRiderMatchingForPaidOrders(orders.map((o: any) => o.id));
          await ensureReceiptsForOrders(
          orders.map((o: any) => o.id),
          {
            trigger: "payment_success",
            generatedBy: currentUserId || primaryOrder.buyerId || null,
            generatedByRole: currentUserId ? "buyer" : "super_admin",
          },
          );
          if (usedVerificationFallback) {
            try {
              const orderNumbers = orders.map((o: any) => `#${o.orderNumber}`).join(", ");
              const totalPaid = (Number(data.data.amount || 0) / 100).toFixed(2);
              await storage.createNotification({
                userId: primaryOrder.buyerId,
                type: "order",
                title: "New Order Placed",
                message:
                  orders.length === 1
                    ? `Your order ${orderNumbers} has been placed successfully. Payment confirmed: ${data.data.currency} ${totalPaid}.`
                    : `Your orders ${orderNumbers} have been placed successfully. Payment confirmed: ${data.data.currency} ${totalPaid}.`,
                metadata: {
                  orderIds: orders.map((o: any) => o.id),
                  orderNumbers: orders.map((o: any) => o.orderNumber),
                  link: "/orders",
                  paymentStatus: "completed",
                } as any,
              });
            } catch (buyerPaidNotifyErr) {
              console.error("[VERIFY] Could not send buyer paid-order notification:", buyerPaidNotifyErr);
            }
            try {
              await Promise.all(
                orders
                  .filter((order: any) => Boolean(order?.sellerId))
                .map(async (order: any) => {
                  const deliveryMethod = String(order.deliveryMethod || "").toLowerCase().trim();
                  const isPickup = deliveryMethod === "pickup" || deliveryMethod === "store_pickup";
                  const sellerMessage = isPickup
                    ? `A new order #${order.orderNumber} has been placed and paid. Start packaging and mark it as packaged when the pickup order is prepared.`
                    : `A new order #${order.orderNumber} has been placed and paid. Start packaging and mark it ready when dispatch preparation is complete.`;
                  await storage.createNotification({
                    userId: order.sellerId,
                    type: "order",
                    title: "New Order Placed",
                    message: sellerMessage,
                    metadata: {
                      orderId: order.id,
                      orderNumber: order.orderNumber,
                      link: "/seller/orders",
                      paymentStatus: "completed",
                    } as any,
                  });
                })
            );
          } catch (sellerPaidNotifyErr) {
            console.error("[VERIFY] Could not send seller paid-order notification:", sellerPaidNotifyErr);
          }
        }
        if (usedVerificationFallback) {
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
                includeAgents: false,
              }
            );
          } catch (opsNotifyErr) {
            console.error("[VERIFY] Could not send ops notification for paid order:", opsNotifyErr);
          }
        }
      }

      await logSystemActivity({
        category: "payment",
        severity: data.data.status === "success" ? "info" : "warning",
        title: "Paystack verification completed",
        message: data.data.status === "success"
          ? "Payment verified successfully with Paystack."
          : data.data.gateway_response || "Payment verification completed with a non-success status.",
        humanExplanation: "The platform verified the payment reference with Paystack.",
        rootCause: "Paystack verification responded with the latest payment status.",
        suggestedFix: data.data.status === "success"
          ? "Continue order fulfillment."
          : "Review Paystack response and retry verification if needed.",
        preventiveAction: "Monitor Paystack status codes and keep credentials valid.",
        source: "/api/payments/verify",
        entityType: "payment",
        entityId: reference,
        actorId: String(currentUserId || ""),
        actorRole: currentUserId ? "buyer" : "system",
        metadata: {
          reference,
          status: data.data.status,
          gatewayResponse: data.data.gateway_response || null,
          amount: Number(data.data.amount || 0) / 100,
          currency: data.data.currency,
          channel: data.data.channel,
          paidAt: data.data.paid_at || null,
          customer: {
            id: data.data.customer?.id,
            email: data.data.customer?.email,
            firstName: data.data.customer?.first_name,
            lastName: data.data.customer?.last_name,
          },
          orderIds: orders.map((o: any) => o.id),
          orderNumbers: orders.map((o: any) => o.orderNumber),
          isMultiVendor,
          metadata: data.data.metadata || {},
        },
      });

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
        await logSystemActivity({
          category: "payment",
          severity: "error",
          title: "Paystack verification timed out",
          message: "Paystack verification request timed out.",
          humanExplanation: "The Paystack verification call took too long to respond.",
          rootCause: "Gateway latency or network interruption.",
          suggestedFix: "Retry verification after a short delay.",
          preventiveAction: "Monitor gateway latency and add retries.",
          source: "/api/payments/verify",
          entityType: "payment",
          entityId: reference,
          actorId: String(currentUserId || ""),
          actorRole: currentUserId ? "buyer" : "system",
          metadata: {
            reference,
            error: "timeout",
          },
        });
        throw new Error('Payment verification timeout');
      }
      await logSystemActivity({
        category: "payment",
        severity: "error",
        title: "Paystack verification failed",
        message: fetchError?.message || "Payment verification failed.",
        humanExplanation: "An error occurred while verifying the Paystack reference.",
        rootCause: "Gateway or validation error during verification.",
        suggestedFix: "Retry verification and confirm Paystack status.",
        preventiveAction: "Maintain resilient verification retries.",
        source: "/api/payments/verify",
        entityType: "payment",
        entityId: reference,
        actorId: String(currentUserId || ""),
        actorRole: currentUserId ? "buyer" : "system",
        metadata: {
          reference,
          error: fetchError?.message || null,
        },
      });
      throw fetchError;
    }
  }

  // ============ Paystack Webhook Handler ============
  // Note: Uses raw body for HMAC signature verification (captured via express.json verify hook)
  app.post("/api/webhooks/paystack", async (req, res) => {
    try {
      const crypto = await import('crypto');
      const settings = await storage.getPlatformSettings();
      const paystackSecretKey = resolvePaystackSecretKey(settings as any);
      
      if (!paystackSecretKey) {
        console.error('[WEBHOOK] Paystack secret key not configured');
        await logSystemActivity({
          category: "payment",
          severity: "critical",
          title: "Paystack webhook rejected (missing secret key)",
          message: "Paystack webhook received but the secret key is not configured.",
          humanExplanation: "The platform cannot verify webhook signatures without a Paystack secret key.",
          rootCause: "Paystack secret key was missing from platform settings.",
          suggestedFix: "Configure the Paystack secret key in platform settings.",
          preventiveAction: "Keep payment credentials configured in all environments.",
          source: "/api/webhooks/paystack",
          entityType: "payment",
          entityId: "webhook",
          actorRole: "system",
          metadata: {
            event: (req as any)?.body?.event || null,
          },
        });
        return res.status(503).json({ error: "Payment gateway not configured" });
      }

      // Verify webhook signature using raw body (HMAC SHA-512)
      const rawBody = (req as any).rawBody;
      if (!rawBody) {
        console.error('[WEBHOOK] Missing raw body for signature verification');
        await logSystemActivity({
          category: "security",
          severity: "error",
          title: "Paystack webhook rejected (missing raw body)",
          message: "Webhook request did not include raw body needed for signature verification.",
          humanExplanation: "The webhook payload could not be verified.",
          rootCause: "Request body was not captured before JSON parsing.",
          suggestedFix: "Ensure raw body capture middleware is enabled for webhooks.",
          preventiveAction: "Validate webhook middleware configuration on deploy.",
          source: "/api/webhooks/paystack",
          entityType: "payment",
          entityId: "webhook",
          actorRole: "system",
          metadata: {
            event: (req as any)?.body?.event || null,
          },
        });
        return res.status(400).json({ error: "Invalid request format" });
      }

      const hash = crypto
        .createHmac('sha512', paystackSecretKey)
        .update(rawBody)
        .digest('hex');

      const paystackSignature = req.headers['x-paystack-signature'];
      if (hash !== paystackSignature) {
        console.error('[SECURITY] Invalid Paystack webhook signature', {
          expected: hash.substring(0, 20) + '...',
          received: typeof paystackSignature === 'string' ? paystackSignature.substring(0, 20) + '...' : 'missing'
        });
        await logSystemActivity({
          category: "security",
          severity: "critical",
          title: "Paystack webhook signature mismatch",
          message: "Webhook signature verification failed.",
          humanExplanation: "The webhook signature did not match the expected HMAC.",
          rootCause: "Signature mismatch or malicious webhook attempt.",
          suggestedFix: "Verify Paystack secret key configuration.",
          preventiveAction: "Monitor webhook signature failures and rotate keys if necessary.",
          source: "/api/webhooks/paystack",
          entityType: "payment",
          entityId: "webhook",
          actorRole: "system",
          metadata: {
            receivedSignature: typeof paystackSignature === "string" ? `${paystackSignature.substring(0, 20)}...` : null,
          },
        });
        return res.status(401).json({ error: "Invalid signature" });
      }

      const event = req.body as any;
      await logSystemActivity({
        category: "payment",
        severity: "info",
        title: "Paystack webhook received",
        message: `Webhook event ${event.event} received from Paystack.`,
        humanExplanation: "Paystack sent a webhook event to the platform.",
        rootCause: "Paystack emitted an event for a transaction state change.",
        suggestedFix: "Review event payload if payment state is unexpected.",
        preventiveAction: "Keep webhook endpoint healthy and authenticated.",
        source: "/api/webhooks/paystack",
        entityType: "payment",
        entityId: event?.data?.reference || "webhook",
        actorRole: "system",
        metadata: {
          event: event.event,
          reference: event?.data?.reference || null,
          amount: event?.data?.amount ? Number(event.data.amount) / 100 : null,
          currency: event?.data?.currency || null,
          status: event?.data?.status || null,
          channel: event?.data?.channel || null,
          customerEmail: event?.data?.customer?.email || null,
        },
      });

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

          // Early-return guard: if already fully processed, respond 200 immediately (Paystack retry safety)
          if (idemp && (idemp as any).used === true && (idemp as any).usedAt) {
            return res.json({ status: "success" });
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

          // Handle premium seller upgrade payment
          if (data?.metadata?.upgradeType === "premium_seller" && data?.metadata?.sellerId) {
            try {
              const sellerId = String(data.metadata.sellerId);
              await storage.updateUser(sellerId, { isPremiumSeller: true } as any);
              await storage.createNotification({
                userId: sellerId,
                type: "system",
                title: "Premium Seller Activated",
                message: "Your payment was confirmed. Your account is now upgraded to Premium — you can list unlimited products.",
                metadata: { upgradeType: "premium_seller", reference, link: "/seller" } as any,
              });
              io.to(sellerId).emit("notification", {
                title: "Premium Seller Activated",
                message: "Your account is now Premium. Unlimited product listings are now unlocked.",
                type: "default",
              });
              // Email confirmation (best-effort)
              try {
                const seller = await storage.getUser(sellerId);
                if (seller?.email) {
                  const ps = await storage.getPlatformSettings().catch(() => null);
                  const pName = ps?.platformName || "KiyuMart";
                  const { sendEmail } = await import('./email');
                  await sendEmail({
                    to: seller.email,
                    subject: `${pName}: Premium Seller Activated`,
                    text: `Hi ${seller.name || "there"},\n\nYour Premium Seller upgrade payment has been confirmed. You can now list unlimited products on ${pName}.\n\n— ${pName}`,
                    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;"><h2 style="color:#10b981;">Premium Seller Activated ⭐</h2><p>Hi ${seller.name || "there"},</p><p>Your Premium Seller upgrade payment has been confirmed. You can now list unlimited products.</p><p style="font-size:13px;color:#64748b;">— ${pName}</p></div>`,
                  });
                }
              } catch { /* non-critical */ }
              await storage.markIdempotencyUsed(idempotencyKey, reference);
              return res.json({ status: "success" });
            } catch (upgradeErr: any) {
              console.error("[WEBHOOK] Premium upgrade processing error:", upgradeErr?.message);
              // Fall through to normal processing as safety net
            }
          }

          // Handle Plan A upgrade (+bonus slots)
          if (data?.metadata?.upgradeType === "seller_plan_a" && data?.metadata?.sellerId) {
            try {
              const sellerId = String(data.metadata.sellerId);
              const ps = await storage.getPlatformSettings().catch(() => null);
              const addSlots = Number((ps as any)?.upgradePlanASlots ?? 10);
              const sellerNow = await storage.getUser(sellerId);
              const currentBonus = Number((sellerNow as any)?.sellerBonusSlots ?? 0);
              await storage.updateUser(sellerId, {
                sellerUpgradePlan: "plan_a",
                sellerBonusSlots: currentBonus + addSlots,
              } as any);
              await storage.createNotification({
                userId: sellerId,
                type: "system",
                title: "Plan A Activated",
                message: `Your Plan A payment was confirmed. ${addSlots} additional product slots have been added to your account.`,
                metadata: { upgradeType: "seller_plan_a", reference, link: "/seller/products" } as any,
              });
              io.to(sellerId).emit("notification", {
                title: "Plan A Activated",
                message: `${addSlots} extra product listing slots have been added to your account.`,
                type: "default",
              });
              try {
                const seller = await storage.getUser(sellerId);
                if (seller?.email) {
                  const pName = ps?.platformName || "KiyuMart";
                  const { sendEmail } = await import('./email');
                  await sendEmail({
                    to: seller.email,
                    subject: `${pName}: Plan A Activated — Extra Slots Added`,
                    text: `Hi ${seller.name || "there"},\n\nYour Plan A payment has been confirmed. ${addSlots} additional product listing slots have been added to your account.\n\n— ${pName}`,
                    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;"><h2 style="color:#10b981;">Plan A Activated</h2><p>Hi ${seller.name || "there"},</p><p>Your Plan A payment has been confirmed. <strong>${addSlots} additional product listing slots</strong> have been added to your account.</p><p style="font-size:13px;color:#64748b;">— ${pName}</p></div>`,
                  });
                }
              } catch { /* non-critical */ }
              await storage.markIdempotencyUsed(idempotencyKey, reference);
              return res.json({ status: "success" });
            } catch (planAErr: any) {
              console.error("[WEBHOOK] Plan A upgrade processing error:", planAErr?.message);
            }
          }

          // Handle Plan B upgrade (unlimited monthly)
          if (data?.metadata?.upgradeType === "seller_plan_b" && data?.metadata?.sellerId) {
            try {
              const sellerId = String(data.metadata.sellerId);
              const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
              await storage.updateUser(sellerId, {
                sellerUpgradePlan: "plan_b",
                sellerPlanExpiresAt: expiresAt,
              } as any);
              const ps = await storage.getPlatformSettings().catch(() => null);
              await storage.createNotification({
                userId: sellerId,
                type: "system",
                title: "Plan B Activated",
                message: `Your Plan B monthly subscription is now active. Unlimited product listings until ${expiresAt.toLocaleDateString()}.`,
                metadata: { upgradeType: "seller_plan_b", reference, link: "/seller/products" } as any,
              });
              io.to(sellerId).emit("notification", {
                title: "Plan B Activated",
                message: `Monthly unlimited listings active until ${expiresAt.toLocaleDateString()}.`,
                type: "default",
              });
              try {
                const seller = await storage.getUser(sellerId);
                if (seller?.email) {
                  const pName = ps?.platformName || "KiyuMart";
                  const { sendEmail } = await import('./email');
                  await sendEmail({
                    to: seller.email,
                    subject: `${pName}: Plan B Active — Unlimited Listings`,
                    text: `Hi ${seller.name || "there"},\n\nYour Plan B subscription is now active. You can list unlimited products until ${expiresAt.toLocaleDateString()}. Remember to renew to keep unlimited access.\n\n— ${pName}`,
                    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;"><h2 style="color:#10b981;">Plan B Active</h2><p>Hi ${seller.name || "there"},</p><p>Your Plan B monthly subscription is now active. List unlimited products until <strong>${expiresAt.toLocaleDateString()}</strong>.</p><p>Remember to renew before this date to keep your unlimited access.</p><p style="font-size:13px;color:#64748b;">— ${pName}</p></div>`,
                  });
                }
              } catch { /* non-critical */ }
              await storage.markIdempotencyUsed(idempotencyKey, reference);
              return res.json({ status: "success" });
            } catch (planBErr: any) {
              console.error("[WEBHOOK] Plan B upgrade processing error:", planBErr?.message);
            }
          }

          // Handle Plan C upgrade (unlimited permanent)
          if (data?.metadata?.upgradeType === "seller_plan_c" && data?.metadata?.sellerId) {
            try {
              const sellerId = String(data.metadata.sellerId);
              await storage.updateUser(sellerId, {
                isPremiumSeller: true,
                sellerUpgradePlan: "plan_c",
                sellerPlanExpiresAt: null,
              } as any);
              const ps = await storage.getPlatformSettings().catch(() => null);
              await storage.createNotification({
                userId: sellerId,
                type: "system",
                title: "Plan C Activated — Unlimited Forever",
                message: "Your one-time Plan C payment has been confirmed. You can now list unlimited products permanently.",
                metadata: { upgradeType: "seller_plan_c", reference, link: "/seller/products" } as any,
              });
              io.to(sellerId).emit("notification", {
                title: "Plan C Activated",
                message: "Unlimited product listings unlocked permanently.",
                type: "default",
              });
              try {
                const seller = await storage.getUser(sellerId);
                if (seller?.email) {
                  const pName = ps?.platformName || "KiyuMart";
                  const { sendEmail } = await import('./email');
                  await sendEmail({
                    to: seller.email,
                    subject: `${pName}: Plan C Activated — Unlimited Listings Forever`,
                    text: `Hi ${seller.name || "there"},\n\nYour one-time Plan C payment has been confirmed. You can now list unlimited products permanently on ${pName}.\n\n— ${pName}`,
                    html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;"><h2 style="color:#10b981;">Plan C Activated — Unlimited Forever</h2><p>Hi ${seller.name || "there"},</p><p>Your one-time Plan C payment has been confirmed. You can list <strong>unlimited products permanently</strong>.</p><p style="font-size:13px;color:#64748b;">— ${pName}</p></div>`,
                  });
                }
              } catch { /* non-critical */ }
              await storage.markIdempotencyUsed(idempotencyKey, reference);
              return res.json({ status: "success" });
            } catch (planCErr: any) {
              console.error("[WEBHOOK] Plan C upgrade processing error:", planCErr?.message);
            }
          }

          // Handle self-service promotion payment
          if (data?.metadata?.upgradeType === "seller_promotion" && data?.metadata?.applicationId) {
            try {
              const applicationId = String(data.metadata.applicationId);
              const sellerId = String(data.metadata.sellerId || "");
              const promoType = String(data.metadata.promoType || "store");
              const targetId = String(data.metadata.targetId || "");
              const durationType = String(data.metadata.durationType || "day");
              const duration = Number(data.metadata.duration || 1);
              const totalPrice = Number(data.metadata.totalPrice || 0);

              const startAt = new Date();
              const endAt = new Date(startAt);
              if (durationType === "hour") endAt.setHours(endAt.getHours() + duration);
              else if (durationType === "day") endAt.setDate(endAt.getDate() + duration);
              else if (durationType === "week") endAt.setDate(endAt.getDate() + duration * 7);
              else if (durationType === "month") endAt.setMonth(endAt.getMonth() + duration);

              // Create the promotional ad
              const [ad] = await db.insert(promotionalAds).values({
                type: promoType as any,
                targetId,
                startAt,
                endAt,
                isActive: true,
                createdBy: sellerId || null,
              }).returning();

              // Activate the application
              await db.update(promotionApplications).set({
                status: "active",
                paymentConfirmed: true,
                paymentConfirmedAt: new Date(),
                approvedAt: new Date(),
                createdPromotionId: ad.id,
                updatedAt: new Date(),
              } as any).where(eq(promotionApplications.id, applicationId));

              if (sellerId) {
                const ps = await storage.getPlatformSettings().catch(() => null);
                await storage.createNotification({
                  userId: sellerId,
                  type: "system",
                  title: "Promotion Activated",
                  message: `Your promotion for "${data.metadata.targetName || targetId}" is now live and will run until ${endAt.toLocaleDateString()}.`,
                  metadata: { upgradeType: "seller_promotion", reference, link: "/seller/promotions" } as any,
                });
                io.to(sellerId).emit("notification", {
                  title: "Promotion Activated",
                  message: `Your promotion is now live until ${endAt.toLocaleDateString()}.`,
                  type: "default",
                });
                try {
                  const seller = await storage.getUser(sellerId);
                  if (seller?.email) {
                    const pName = ps?.platformName || "KiyuMart";
                    const { sendEmail } = await import('./email');
                    await sendEmail({
                      to: seller.email,
                      subject: `${pName}: Promotion Activated`,
                      text: `Hi ${seller.name || "there"},\n\nYour promotion payment was confirmed. Your ${promoType} promotion for "${data.metadata.targetName || targetId}" is now live and will run until ${endAt.toLocaleDateString()}.\n\n— ${pName}`,
                      html: `<div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;max-width:560px;"><h2 style="color:#10b981;">Promotion Activated</h2><p>Hi ${seller.name || "there"},</p><p>Your promotion for <strong>"${data.metadata.targetName || targetId}"</strong> is now live and will run until <strong>${endAt.toLocaleDateString()}</strong>.</p><p style="font-size:13px;color:#64748b;">— ${pName}</p></div>`,
                    });
                  }
                } catch { /* non-critical */ }
              }
              // Notify admins
              try {
                const admins = await db.select({ id: users.id }).from(users)
                  .where(or(eq(sql`lower(cast(${users.role} as text))`, "admin"), eq(sql`lower(cast(${users.role} as text))`, "super_admin")));
                for (const admin of admins) {
                  await storage.createNotification({
                    userId: admin.id,
                    type: "system",
                    title: "New Paid Promotion Active",
                    message: `A seller promotion for "${data.metadata.targetName || targetId}" is now active (self-service payment confirmed).`,
                    metadata: { link: "/admin/promotions" } as any,
                  });
                  io.to(admin.id).emit("notification", {
                    title: "New Paid Promotion Active",
                    message: `Seller promotion for "${data.metadata.targetName || targetId}" activated via self-service payment.`,
                    type: "default",
                  });
                }
              } catch { /* non-critical */ }
              await storage.markIdempotencyUsed(idempotencyKey, reference);
              return res.json({ status: "success" });
            } catch (promoErr: any) {
              console.error("[WEBHOOK] Seller promotion processing error:", promoErr?.message);
            }
          }

          // Delegate processing to shared helper
          try {
            const { processPaystackChargeSuccess } = await import('./payments');
            await processPaystackChargeSuccess(data, storage, io);
            const paidOrderIds = extractOrderIdsFromPaymentPayload(data);
            await startRiderMatchingForPaidOrders(paidOrderIds);
            await ensureReceiptsForOrders(paidOrderIds, {
              trigger: "payment_success",
              generatedBy: null,
              generatedByRole: "super_admin",
            });
            await logSystemActivity({
              category: "payment",
              severity: "info",
              title: "Paystack webhook processed",
              message: "Webhook charge.success was processed and orders updated.",
              humanExplanation: "The payment was confirmed and the order flow was updated.",
              rootCause: "Paystack charge.success webhook received.",
              suggestedFix: "No action needed unless orders are missing.",
              preventiveAction: "Maintain webhook delivery and processing health.",
              source: "/api/webhooks/paystack",
              entityType: "payment",
              entityId: reference || "webhook",
              actorRole: "system",
              metadata: {
                event: "charge.success",
                reference,
                orderIds: paidOrderIds,
                amount: data?.amount ? Number(data.amount) / 100 : null,
                currency: data?.currency || null,
              },
            });
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
        console.warn('[WEBHOOK] Payment failed for reference:', event?.data?.reference || 'unknown');
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
      console.info(`[COMMISSION] Recorded for order ${orderId}: platform=${commission.platformAmount} seller=${commission.sellerAmount}`);
    } catch (error: any) {
      // Handle idempotent retry (webhook duplicate)
      if (error.code === 'COMMISSION_ALREADY_EXISTS') {
        console.info(`[COMMISSION] Already calculated for order ${orderId}, skipping (idempotent)`);
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
  
  // Seller tier info — returns product count, limits, and upgrade plan status
  app.get("/api/seller/tier-info", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || req.user.role !== "seller") return res.status(403).json({ error: "Seller access required" });
      const [platformSettings, sellerRecord, [{ cnt }]] = await Promise.all([
        storage.getPlatformSettings().catch(() => null),
        storage.getUser(req.user.id),
        db.select({ cnt: sql<number>`count(*)` }).from(products).where(eq(products.sellerId, req.user.id)),
      ]);
      const isPremium = (sellerRecord as any)?.isPremiumSeller === true;
      const sellerUpgradePlan: string | null = (sellerRecord as any)?.sellerUpgradePlan ?? null;
      const sellerPlanExpiresAt: Date | null = (sellerRecord as any)?.sellerPlanExpiresAt ?? null;
      const sellerBonusSlots: number = Number((sellerRecord as any)?.sellerBonusSlots ?? 0);

      const freeTierLimit = Number(platformSettings?.freeTierProductLimit ?? 20);
      const hardMax = Number(platformSettings?.maxProductsPerSeller || 0);
      const planBExpired = sellerUpgradePlan === "plan_b" && sellerPlanExpiresAt && new Date() > new Date(sellerPlanExpiresAt);
      const hasUnlimited = isPremium || sellerUpgradePlan === "plan_c" || (sellerUpgradePlan === "plan_b" && !planBExpired);
      const effectiveLimit = hasUnlimited
        ? (hardMax > 0 ? hardMax : 0)
        : sellerUpgradePlan === "plan_a"
          ? (freeTierLimit > 0 ? freeTierLimit + sellerBonusSlots : 0)
          : (freeTierLimit > 0 ? freeTierLimit : 0);

      res.json({
        isPremiumSeller: isPremium,
        sellerUpgradePlan,
        sellerPlanExpiresAt,
        sellerBonusSlots,
        planBExpired: !!planBExpired,
        productCount: Number(cnt),
        freeTierLimit,
        hardMax,
        effectiveLimit,
        upgradePlanAPrice: Number((platformSettings as any)?.upgradePlanAPrice ?? 15),
        upgradePlanASlots: Number((platformSettings as any)?.upgradePlanASlots ?? 10),
        upgradePlanBPrice: Number((platformSettings as any)?.upgradePlanBPrice ?? 40),
        upgradePlanCPrice: Number((platformSettings as any)?.upgradePlanCPrice ?? 100),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

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

      // Mobile money payouts are fully automated via the payout worker.
      // Advance status to 'processing' immediately so the worker picks it up
      // within its next polling cycle (~15 seconds) and initiates the Paystack transfer.
      if (method === 'mobile_money') {
        const advanced = await storage.updatePayoutStatus(payout.id, 'processing', 'system');
        console.info(`[PAYOUT] Seller ${user.id} mobile money payout ${payout.id} auto-advanced to processing`);
        return res.json(advanced ?? payout);
      }

      console.info(`[PAYOUT] Seller ${user.id} requested payout of ${amount}`);

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

  // Seller payment alerts — sellers with pending/failed payouts and accurate reason
  app.get("/api/admin/seller-payment-alerts", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const pendingPayouts = await storage.getAllPendingPayouts();
      if (!pendingPayouts.length) return res.json([]);

      // Collect unique seller IDs, then fetch names
      const sellerIds = Array.from(new Set(pendingPayouts.map((p) => p.sellerId)));
      const sellerUsers = await Promise.all(sellerIds.map((id) => storage.getUser(id)));
      const sellerMap: Record<string, string> = {};
      for (const u of sellerUsers) {
        if (u) sellerMap[u.id] = u.name || u.email || u.id;
      }

      const alerts = pendingPayouts.map((p) => {
        const bd = (p.bankDetails || {}) as Record<string, unknown>;
        const settlementMode = String(bd.settlementMode || "");
        let reason = "Payout pending";
        if (p.status === "pending") {
          if (!settlementMode) {
            reason = "Seller has not completed payout setup (no bank account or mobile money verified)";
          } else if (settlementMode === "split") {
            reason = "Paystack subaccount split was not confirmed — check seller's subaccount ID";
          } else {
            reason = "Awaiting payout setup verification from seller";
          }
        } else if (p.status === "processing") {
          if (settlementMode === "transfer") {
            reason = "Mobile money transfer initiated — waiting for Paystack transfer confirmation";
          } else {
            reason = "Payout is being processed";
          }
        } else if (p.status === "failed") {
          const transferStatus = String(bd.transferStatus || "");
          reason = transferStatus
            ? `Transfer failed with status: ${transferStatus} — manual intervention required`
            : "Transfer attempt failed — check Paystack dashboard and retry manually";
        }
        return {
          payoutId: p.id,
          sellerId: p.sellerId,
          sellerName: sellerMap[p.sellerId] || "Unknown Seller",
          amount: p.amount,
          currency: p.currency || "GHS",
          status: p.status,
          method: p.method,
          reason,
          createdAt: p.createdAt,
        };
      });

      res.json(alerts);
    } catch (error) {
      console.error("[ADMIN-SELLER-ALERTS] Error:", error);
      res.status(500).json({ error: "Failed to fetch seller payment alerts" });
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

      if (status === "completed") {
        try {
          await storage.createNotification({
            userId: updated.sellerId,
            type: "payout",
            title: "Seller Settlement Sent",
            message: `A settlement of ${updated.amount} has been sent to your payout account.`,
            metadata: {
              payoutId: updated.id,
            } as any,
          });

          const admins = await storage.getUsersByRole("admin");
          const superAdmins = await storage.getUsersByRole("super_admin");
          await Promise.all(
            [...admins, ...superAdmins].map((admin: any) =>
              storage.createNotification({
                userId: admin.id,
                type: "payout",
                title: "Seller Settlement Sent",
                message: `Seller settlement of ${updated.amount} was completed.`,
                metadata: {
                  payoutId: updated.id,
                  sellerId: updated.sellerId,
                } as any,
              })
            )
          );
        } catch (notifyErr) {
          console.error("[ADMIN-PAYOUT] Failed to notify payout completion:", notifyErr);
        }
      }

      console.info(`[ADMIN-PAYOUT] Admin ${req.user!.id} updated payout ${id} to ${status}`);
      
      res.json(updated);
    } catch (error: any) {
      if (error?.code === "PAYOUT_VERIFICATION_REQUIRED") {
        return res.status(400).json({ error: error.message || "Payout verification evidence is required before completion." });
      }
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

  app.get(
    "/api/admin/dashboard-summary",
    requireAuth,
    requireRole("admin", "super_admin"),
    async (_req: AuthRequest, res) => {
      try {
        const paidStatusFilter = sql`lower(cast(${orders.paymentStatus} as text)) in ('completed', 'paid', 'success')`;
        const successfulDeliveryFilter = sql`${paidStatusFilter} and lower(cast(${orders.status} as text)) = 'completed'`;
        const pickupMethodFilter = sql`lower(cast(${orders.deliveryMethod} as text)) in ('pickup', 'store_pickup')`;

        const [orderTotals, userTotals, commissionTotals, promotionTotals, receivedMoneyTotals, deliveryTotals] = await Promise.all([
          db.select({ count: sql<number>`count(*)` }).from(orders),
          db.select({ count: sql<number>`count(*)` }).from(users),
          db.select({ total: sql<number>`coalesce(sum(${commissions.commissionAmount}::numeric), 0)` }).from(commissions),
          db
            .select({ total: sql<number>`coalesce(sum(${promotionApplications.totalPrice}::numeric), 0)` })
            .from(promotionApplications)
            .where(and(eq(promotionApplications.paymentConfirmed, true), isNotNull(promotionApplications.approvedAt))),
          db.select({ total: sql<number>`coalesce(sum(${orders.total}::numeric), 0)` }).from(orders).where(paidStatusFilter),
          db.select({
            totalDeliveries: sql<number>`coalesce(sum(case when not (${pickupMethodFilter}) then 1 else 0 end), 0)`,
            totalPickups: sql<number>`coalesce(sum(case when ${pickupMethodFilter} then 1 else 0 end), 0)`,
            successfulDeliveries: sql<number>`coalesce(sum(case when not (${pickupMethodFilter}) and ${successfulDeliveryFilter} then 1 else 0 end), 0)`,
            successfulPickups: sql<number>`coalesce(sum(case when ${pickupMethodFilter} and ${successfulDeliveryFilter} then 1 else 0 end), 0)`,
            successfulOrders: sql<number>`coalesce(sum(case when ${successfulDeliveryFilter} then 1 else 0 end), 0)`,
          }).from(orders),
        ]);

        const commissionRevenue = Number(commissionTotals[0]?.total ?? 0);
        const promotionRevenue = Number(promotionTotals[0]?.total ?? 0);

        res.json({
          totalOrders: Number(orderTotals[0]?.count ?? 0),
          totalUsers: Number(userTotals[0]?.count ?? 0),
          totalRevenue: commissionRevenue + promotionRevenue,
          platformCommissionTotal: commissionRevenue,
          promotionRevenueTotal: promotionRevenue,
          platformRevenueTotal: commissionRevenue + promotionRevenue,
          totalReceivedMoney: Number(receivedMoneyTotals[0]?.total ?? 0),
          totalDeliveries: Number(deliveryTotals[0]?.totalDeliveries ?? 0),
          totalPickups: Number(deliveryTotals[0]?.totalPickups ?? 0),
          successfulDeliveries: Number(deliveryTotals[0]?.successfulDeliveries ?? 0),
          successfulPickups: Number(deliveryTotals[0]?.successfulPickups ?? 0),
          successfulOrders: Number(deliveryTotals[0]?.successfulOrders ?? 0),
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  );

  // Public analytics config — GA4 + Clarity IDs for frontend script injection (no auth required)
  app.get("/api/public/analytics-config", async (_req, res) => {
    try {
      const settings = await storage.getPlatformSettings().catch(() => null);
      res.json({
        googleAnalyticsId: settings?.googleAnalyticsId || null,
        microsoftClarityId: settings?.microsoftClarityId || null,
      });
    } catch {
      res.json({ googleAnalyticsId: null, microsoftClarityId: null });
    }
  });

  // Trigger a Render deploy via the stored deploy hook URL
  app.post("/api/admin/trigger-deploy", requireAuth, requireRole("super_admin"), async (_req: AuthRequest, res) => {
    try {
      const settings = await storage.getPlatformSettings();
      const hookUrl = settings?.renderDeployHookUrl?.trim();
      if (!hookUrl) return res.status(400).json({ error: "No deploy hook URL configured. Set it in Settings → Hosting." });
      const response = await fetch(hookUrl, { method: "POST" });
      if (!response.ok) return res.status(502).json({ error: `Deploy hook returned ${response.status}` });
      res.json({ success: true, message: "Deploy triggered. Your Render service will redeploy shortly." });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Failed to trigger deploy" });
    }
  });

  // Period-comparison stats: current 30d vs previous 30d for metric card change arrows.
  app.get(
    "/api/admin/dashboard-period-stats",
    requireAuth,
    requireRole("admin", "super_admin"),
    async (_req: AuthRequest, res) => {
      try {
        const now = new Date();
        const periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const prevStart   = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

        const paidFilter = sql`lower(cast(${orders.paymentStatus} as text)) in ('completed', 'paid', 'success')`;
        const completedFilter = sql`${paidFilter} and lower(cast(${orders.status} as text)) = 'completed'`;
        const pickupFilter = sql`lower(cast(${orders.deliveryMethod} as text)) in ('pickup', 'store_pickup')`;

        const [cur, prev] = await Promise.all([
          // current period
          db.select({
            orders:     sql<number>`count(*)`,
            revenue:    sql<number>`coalesce(sum(case when ${paidFilter} then cast(${orders.total} as numeric) else 0 end), 0)`,
            deliveries: sql<number>`coalesce(sum(case when not (${pickupFilter}) and ${completedFilter} then 1 else 0 end), 0)`,
            pickups:    sql<number>`coalesce(sum(case when (${pickupFilter}) and ${completedFilter} then 1 else 0 end), 0)`,
          }).from(orders).where(sql`${orders.createdAt} >= ${periodStart}`),
          // previous period
          db.select({
            orders:     sql<number>`count(*)`,
            revenue:    sql<number>`coalesce(sum(case when ${paidFilter} then cast(${orders.total} as numeric) else 0 end), 0)`,
            deliveries: sql<number>`coalesce(sum(case when not (${pickupFilter}) and ${completedFilter} then 1 else 0 end), 0)`,
            pickups:    sql<number>`coalesce(sum(case when (${pickupFilter}) and ${completedFilter} then 1 else 0 end), 0)`,
          }).from(orders).where(sql`${orders.createdAt} >= ${prevStart} and ${orders.createdAt} < ${periodStart}`),
        ]);

        // Commission-based platform revenue per period
        const [curComm, prevComm] = await Promise.all([
          db.select({ total: sql<number>`coalesce(sum(${commissions.commissionAmount}::numeric), 0)` })
            .from(commissions).where(sql`${commissions.createdAt} >= ${periodStart}`),
          db.select({ total: sql<number>`coalesce(sum(${commissions.commissionAmount}::numeric), 0)` })
            .from(commissions).where(sql`${commissions.createdAt} >= ${prevStart} and ${commissions.createdAt} < ${periodStart}`),
        ]);

        // New user registrations per period
        const [curUsers, prevUsers] = await Promise.all([
          db.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.createdAt} >= ${periodStart}`),
          db.select({ count: sql<number>`count(*)` }).from(users).where(sql`${users.createdAt} >= ${prevStart} and ${users.createdAt} < ${periodStart}`),
        ]);

        res.json({
          current: {
            orders:     Number(cur[0]?.orders ?? 0),
            revenue:    Number(cur[0]?.revenue ?? 0),
            platformRevenue: Number(curComm[0]?.total ?? 0),
            deliveries: Number(cur[0]?.deliveries ?? 0),
            pickups:    Number(cur[0]?.pickups ?? 0),
            newUsers:   Number(curUsers[0]?.count ?? 0),
          },
          previous: {
            orders:     Number(prev[0]?.orders ?? 0),
            revenue:    Number(prev[0]?.revenue ?? 0),
            platformRevenue: Number(prevComm[0]?.total ?? 0),
            deliveries: Number(prev[0]?.deliveries ?? 0),
            pickups:    Number(prev[0]?.pickups ?? 0),
            newUsers:   Number(prevUsers[0]?.count ?? 0),
          },
        });
      } catch (error: any) {
        res.status(400).json({ error: error.message });
      }
    },
  );

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
      if (res.headersSent || res.writableEnded) {
        return;
      }
      res.json((rows as any).rows || []);
    } catch (error: any) {
      if (res.headersSent || res.writableEnded) {
        return;
      }
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/revenue/views/order-ledger", requireAuth, requireRole("admin", "super_admin"), requirePermission("view_analytics"), async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(1000, Math.max(1, Number(req.query.limit || 300)));
      const actor =
        req.user!.role === "admin"
          ? await storage.getUser(req.user!.id)
          : null;
      const scopedZoneId =
        req.user!.role === "admin" ? String((actor as any)?.deliveryZoneId || "").trim() : "";

      const zoneFilter = scopedZoneId
        ? sql`where o.delivery_zone_id = ${scopedZoneId}`
        : sql``;

      const rows = await db.execute(sql`
        select
          o.id as order_id,
          o.order_number,
          o.status as order_status,
          o.payment_status,
          o.delivery_method,
          o.delivery_zone_id,
          o.total,
          o.currency,
          o.created_at as order_created_at,
          o.updated_at as order_updated_at,
          o.delivered_at,
          case when o.status = 'completed' then true else false end as is_completed,
          tx.transaction_id,
          tx.transaction_status,
          tx.transaction_amount,
          tx.payment_provider,
          tx.payment_reference,
          pc.commission_amount,
          pc.platform_amount,
          pc.seller_amount,
          pc.commission_status,
          pc.commission_rate,
          pc.commission_created_at,
          seller.name as seller_name,
          store.name as store_name,
          (
            select string_agg(h.to_status::text, ' -> ' order by h.created_at asc)
            from order_status_history h
            where h.order_id = o.id
          ) as status_flow
        from orders o
        left join lateral (
          select
            op.transaction_id,
            op.transaction_status,
            op.transaction_amount,
            op.payment_provider,
            op.payment_reference
          from order_payments op
          where op.order_id = o.id
          order by op.transaction_created_at desc nulls last
          limit 1
        ) tx on true
        left join lateral (
          select
            c.commission_amount,
            c.platform_amount,
            c.seller_amount,
            c.commission_status,
            c.commission_rate,
            c.commission_created_at
          from platform_commission c
          where c.order_id = o.id
          order by c.commission_created_at desc nulls last
          limit 1
        ) pc on true
        left join users seller on seller.id = o.seller_id
        left join stores store on store.id = o.store_id
        ${zoneFilter}
        order by o.created_at desc
        limit ${limit}
      `);

      res.json((rows as any).rows || []);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/reports/activity", requireAuth, async (req: AuthRequest, res) => {
    try {
      const action = String(req.body?.action || "").toLowerCase().trim();
      const reportType = String(req.body?.reportType || "").trim();
      const format = String(req.body?.format || "").toLowerCase().trim() || null;
      const status = String(req.body?.status || "success").toLowerCase().trim();
      const scope = req.body?.scope && typeof req.body.scope === "object" ? req.body.scope : {};
      const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};
      const reportId = req.body?.reportId ? String(req.body.reportId).trim() : null;

      if (!["request", "generate", "download"].includes(action)) {
        return res.status(400).json({ error: "Invalid report action. Use request, generate, or download." });
      }
      if (!reportType) {
        return res.status(400).json({ error: "reportType is required." });
      }

      const entry = await logReportActivity({
        requester: { id: req.user!.id, role: req.user!.role, email: req.user!.email || null },
        reportType,
        action,
        format,
        status,
        scope,
        metadata,
        reportId,
      });

      if (action === "request") {
        const [admins, superAdmins, requester] = await Promise.all([
          storage.getUsersByRole("admin"),
          storage.getUsersByRole("super_admin"),
          storage.getUser(req.user!.id),
        ]);
        const requesterName = requester?.name || req.user!.email || req.user!.id;
        const message = `${requesterName} requested report "${reportType}"${reportId ? ` (${reportId})` : ""}`;
        const recipients = [...admins, ...superAdmins];
        recipients.forEach((recipient) => {
          io.to(recipient.id).emit("notification", {
            title: "Report Request",
            message,
            type: "warning",
            metadata: {
              requestedBy: req.user!.id,
              requesterRole: req.user!.role,
              reportType,
              reportId,
              scope,
            },
          });
        });
      }

      return res.json(entry);
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get(
    "/api/reports/activity",
    requireAuth,
    requireRole("admin", "super_admin"),
    requirePermission("view_analytics"),
    async (req: AuthRequest, res) => {
      try {
        const limit = Math.min(500, Math.max(1, Number(req.query.limit || 100)));
        const requestedBy = String(req.query.userId || "").trim();
        const roleFilter = String(req.query.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
        const reportType = String(req.query.reportType || "").trim();
        const action = String(req.query.action || "").toLowerCase().trim();
        const status = String(req.query.status || "").toLowerCase().trim();
        const normalizedRoleFilter = roleFilter === "superadmin" ? "super_admin" : roleFilter;

        const conditions: any[] = [];
        if (requestedBy) conditions.push(eq(reportActivityLogs.requestedBy, requestedBy));
        if (normalizedRoleFilter) conditions.push(eq(reportActivityLogs.requesterRole, normalizedRoleFilter as any));
        if (reportType) conditions.push(eq(reportActivityLogs.reportType, reportType));
        if (action) conditions.push(eq(reportActivityLogs.action, action));
        if (status) conditions.push(eq(reportActivityLogs.status, status));

        const rows = await db
          .select({
            id: reportActivityLogs.id,
            requestedBy: reportActivityLogs.requestedBy,
            requesterRole: reportActivityLogs.requesterRole,
            requesterEmail: users.email,
            requesterName: users.name,
            reportType: reportActivityLogs.reportType,
            action: reportActivityLogs.action,
            format: reportActivityLogs.format,
            status: reportActivityLogs.status,
            reportId: reportActivityLogs.reportId,
            scope: reportActivityLogs.scope,
            metadata: reportActivityLogs.metadata,
            createdAt: reportActivityLogs.createdAt,
          })
          .from(reportActivityLogs)
          .leftJoin(users, eq(users.id, reportActivityLogs.requestedBy))
          .where(conditions.length ? and(...conditions) : undefined)
          .orderBy(desc(reportActivityLogs.createdAt))
          .limit(limit);

        return res.json(rows);
      } catch (error: any) {
        return res.status(400).json({ error: error.message });
      }
    },
  );

  app.get("/api/receipts", requireAuth, async (req: AuthRequest, res) => {
    try {
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
      const role = String(req.user!.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
      const scopedRole = role === "superadmin" ? "super_admin" : role;

      const rows = await db
        .select({
          id: receipts.id,
          receiptNumber: receipts.receiptNumber,
          orderId: orders.id,
          orderNumber: orders.orderNumber,
          buyerId: orders.buyerId,
          sellerId: orders.sellerId,
          riderId: orders.riderId,
          orderStatus: orders.status,
          paymentStatus: orders.paymentStatus,
          deliveryMethod: orders.deliveryMethod,
          total: orders.total,
          currency: orders.currency,
          trigger: receipts.trigger,
          status: receipts.status,
          payload: receipts.payload,
          createdAt: receipts.createdAt,
          updatedAt: receipts.updatedAt,
        })
        .from(receipts)
        .innerJoin(orders, eq(orders.id, receipts.orderId))
        .orderBy(desc(receipts.updatedAt))
        .limit(Math.max(limit * 4, 200));

      const scoped = rows.filter((row) => {
        if (scopedRole === "super_admin" || scopedRole === "admin") return true;
        if (scopedRole === "buyer") return String(row.buyerId || "") === String(req.user!.id);
        if (scopedRole === "seller") return String(row.sellerId || "") === String(req.user!.id);
        if (scopedRole === "rider") return String(row.riderId || "") === String(req.user!.id);
        return false;
      });

      return res.json(scoped.slice(0, limit));
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/receipts/:orderId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const order = await storage.getOrder(req.params.orderId);
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      if (!canAccessOrderReceipt(order, req.user!)) {
        return res.status(403).json({ error: "Unauthorized to view this receipt" });
      }

      const receipt = await upsertReceiptForOrder({
        orderId: order.id,
        generatedBy: req.user!.id,
        generatedByRole: req.user!.role,
      });

      if (!receipt) {
        return res.status(500).json({ error: "Failed to build receipt" });
      }

      const payload =
        receipt.payload && typeof receipt.payload === "object"
          ? receipt.payload
          : await buildOrderReceiptSnapshot(order);

      return res.json({
        receipt: {
          id: receipt.id,
          receiptNumber: receipt.receiptNumber,
          orderId: receipt.orderId,
          trigger: receipt.trigger,
          status: receipt.status,
          createdAt: receipt.createdAt,
          updatedAt: receipt.updatedAt,
        },
        ...(payload as Record<string, any>),
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
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

  const ROLE_DISALLOWED_FEATURES: Record<string, string[]> = {
    seller: ["support.manage"],
    buyer: ["support.manage"],
    rider: ["support.manage"],
    pickup_agent: ["support.manage"],
  };

  function sanitizeRoleFeaturePayload(role: string, features: Record<string, boolean>) {
    const normalizedRole = String(role || "").toLowerCase().trim();
    const sanitized = { ...features };
    for (const key of ROLE_DISALLOWED_FEATURES[normalizedRole] || []) {
      delete sanitized[key];
    }
    return sanitized;
  }

  const LOW_STOCK_THRESHOLD = 5;

  async function notifyUserDirect(
    userId: string,
    type: "product" | "system" | "order" | "message" | "payout" | "review" | "user",
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ) {
    await storage.createNotification({
      userId,
      type: type as any,
      title,
      message,
      metadata,
    });

    io.to(userId).emit("notification", {
      userId,
      type,
      title,
      message,
      metadata,
      createdAt: new Date().toISOString(),
    });
  }

  async function notifyLowStockIfNeeded(
    previousProduct: { id: string; name: string; stock?: number | null; sellerId: string } | null | undefined,
    currentProduct: { id: string; name: string; stock?: number | null; sellerId: string },
  ) {
    const previousStock = Number(previousProduct?.stock ?? Number.POSITIVE_INFINITY);
    const currentStock = Number(currentProduct.stock ?? 0);
    const crossedIntoLowStock = previousStock > LOW_STOCK_THRESHOLD && currentStock <= LOW_STOCK_THRESHOLD;

    if (!crossedIntoLowStock || currentStock < 0) {
      return;
    }

    const lowStockMessage =
      currentStock <= 0
        ? `${currentProduct.name} is now out of stock.`
        : `${currentProduct.name} is running low with ${currentStock} item${currentStock === 1 ? "" : "s"} left.`;

    try {
      await notifyUserDirect(
        currentProduct.sellerId,
        "product",
        "Low stock alert",
        lowStockMessage,
        {
          productId: currentProduct.id,
          sellerId: currentProduct.sellerId,
          stock: currentStock,
          threshold: LOW_STOCK_THRESHOLD,
          link: "/seller/products",
          alertKind: "low_stock",
        },
      );
    } catch (sellerNotifyError) {
      console.error("[LOW STOCK] Failed to notify seller:", sellerNotifyError);
    }

    try {
      const superAdmins = await storage.getUsersByRole("super_admin");
      for (const superAdmin of superAdmins) {
        if (!superAdmin?.id || superAdmin.isActive === false) continue;
        await notifyUserDirect(
          superAdmin.id,
          "product",
          "Seller product is low on stock",
          `${currentProduct.name} is low on stock with ${Math.max(currentStock, 0)} item${currentStock === 1 ? "" : "s"} left.`,
          {
            productId: currentProduct.id,
            sellerId: currentProduct.sellerId,
            stock: currentStock,
            threshold: LOW_STOCK_THRESHOLD,
            link: "/admin/products",
            alertKind: "low_stock",
          },
        );
      }
    } catch (superAdminNotifyError) {
      console.error("[LOW STOCK] Failed to notify super admins:", superAdminNotifyError);
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
      const target = String(buyerId);
      return buyerOrders.filter((o: any) => String(o.buyerId || "") === target);
    },
    getOrdersBySeller: async (sellerId: string) => {
      const sellerOrders = await storage.getAllOrders();
      const target = String(sellerId);
      return sellerOrders.filter((o: any) => String(o.sellerId || "") === target);
    },
    getOrdersByRider: async (riderId: string) => {
      const riderOrders = await storage.getAllOrders();
      const target = String(riderId);
      return riderOrders.filter((o: any) => String(o.riderId || "") === target);
    },
    getActiveOrderBetweenUsers: async (userId1: string, userId2: string) => {
      const allOrders = await storage.getAllOrders();
      const lhs = String(userId1);
      const rhs = String(userId2);
      const chatActiveStatuses = new Set([
        "ready",
        "processing",
        "searching_rider",
        "assigned",
        "rider_arrived",
        "picked_up",
        "in_transit",
        "en_route",
        "arrived",
      ]);

      const linked = allOrders.filter((o: any) => {
        const buyerId = String(o.buyerId || "");
        const sellerId = String(o.sellerId || "");
        const riderId = String(o.riderId || "");
        return (
          (buyerId === lhs && (sellerId === rhs || riderId === rhs)) ||
          (buyerId === rhs && (sellerId === lhs || riderId === lhs)) ||
          (sellerId === lhs && riderId === rhs) ||
          (sellerId === rhs && riderId === lhs)
        );
      });

      if (linked.length === 0) return null;

      const sorted = linked.sort((a: any, b: any) => {
        const aTs = new Date(a.updatedAt || a.createdAt || 0).getTime();
        const bTs = new Date(b.updatedAt || b.createdAt || 0).getTime();
        return bTs - aTs;
      });

      const active = sorted.find((o: any) => chatActiveStatuses.has(canonicalizeOrderStatus(o.status)));
      return active || null;
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
  // ─── Auto-Fix: Run safe, non-destructive repairs on known issue patterns ───
  app.post("/api/admin/system-health/auto-fix", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    const fixes: Array<{ name: string; status: "ok" | "fixed" | "skipped" | "error"; detail?: string }> = [];

    // 1. Re-seed missing role feature defaults
    try {
      const roleDefaults: Record<string, Record<string, boolean>> = {
        admin: {
          "products.viewAll": true, "orders.view": true, "orders.manage": true,
          "users.view": true, "settings.view": true, "analytics.view": true,
          "messages.view": true, "messages.send": true, "support.view": true, "maps.view": true,
        },
        seller: {
          "orders.create": true, "products.create": true, "products.edit": true, "products.delete": true,
          "orders.view": true, "orders.manage": true, "messages.view": true, "messages.send": true,
          "store.manage": true, "payouts.request": true, "analytics.view": true, "maps.view": true,
          "reviews.manage": true, "promotions.manage": true, "categories.manage": true,
        },
        buyer: {
          "orders.create": true, "orders.view": true, "messages.view": true, "messages.send": true,
          "support.view": true, "wishlist.manage": true, "profile.manage": true, "maps.view": true,
        },
        rider: {
          "orders.view": true, "deliveries.view": true, "deliveries.manage": true,
          "messages.view": true, "earnings.view": true, "maps.view": true,
        },
        agent: {
          "orders.view": true, "users.view": true, "messages.view": true, "messages.send": true,
          "support.view": true, "support.manage": true, "profile.manage": true,
        },
        pickup_agent: {
          "orders.view": true, "support.view": true, "profile.manage": true,
        },
      };
      let seeded = 0;
      for (const [role, features] of Object.entries(roleDefaults)) {
        const existing = await storage.getRoleFeatures(role).catch(() => []);
        if (!existing || existing.length === 0) {
          await storage.updateRoleFeatures(role, features, req.user?.id || "system");
          seeded++;
        }
      }
      fixes.push({ name: "role_feature_defaults", status: seeded > 0 ? "fixed" : "ok", detail: seeded > 0 ? `Seeded ${seeded} role(s)` : "All roles have features" });
    } catch (e: any) {
      fixes.push({ name: "role_feature_defaults", status: "error", detail: e?.message });
    }

    // 2. Repopulate missing footer sections
    try {
      const existing = await storage.getAllFooterPages();
      const existingGroups = new Set(existing.map((p: any) => p.group || "general"));
      const keyGroups = ["trust_bar", "quick_links", "customer_service", "legal"];
      const missing = keyGroups.filter(g => !existingGroups.has(g));
      if (missing.length > 0) {
        const defaults = [
          { title: "Fast Delivery", slug: "fast-delivery", content: "Nationwide shipping", url: "", group: "trust_bar", storeMode: "both", displayOrder: 0, isActive: true, openInNewTab: false },
          { title: "Secure Shopping", slug: "secure-shopping", content: "100% protected", url: "", group: "trust_bar", storeMode: "both", displayOrder: 1, isActive: true, openInNewTab: false },
          { title: "Home", slug: "home-link", content: "", url: "/", group: "quick_links", storeMode: "both", displayOrder: 0, isActive: true, openInNewTab: false },
          { title: "Customer Support", slug: "customer-support", content: "", url: "/support", group: "customer_service", storeMode: "both", displayOrder: 0, isActive: true, openInNewTab: false },
          { title: "Privacy Policy", slug: "privacy-policy", content: "<h1>Privacy Policy</h1><p>Your privacy is important to us.</p>", url: "", group: "legal", storeMode: "both", displayOrder: 0, isActive: true, openInNewTab: false },
          { title: "Terms of Service", slug: "terms-of-service", content: "<h1>Terms of Service</h1><p>By using this platform, you agree to our terms.</p>", url: "", group: "legal", storeMode: "both", displayOrder: 1, isActive: true, openInNewTab: false },
        ];
        const existingSlugs = new Set(existing.map((p: any) => p.slug));
        let created = 0;
        for (const item of defaults) {
          if (missing.includes(item.group!) && !existingSlugs.has(item.slug)) {
            try { await storage.createFooterPage(item); created++; } catch {}
          }
        }
        fixes.push({ name: "footer_defaults", status: "fixed", detail: `Created ${created} footer items for sections: ${missing.join(", ")}` });
      } else {
        fixes.push({ name: "footer_defaults", status: "ok", detail: "All footer sections present" });
      }
    } catch (e: any) {
      fixes.push({ name: "footer_defaults", status: "error", detail: e?.message });
    }

    // 3. Release stale rider assignments (stuck in searching_rider for > 30 minutes)
    try {
      const staleThresholdMs = 30 * 60 * 1000;
      const allOrders = await storage.getAllOrders();
      const stale = allOrders.filter((o: any) => {
        const status = canonicalizeOrderStatus(o.status);
        if (status !== "searching_rider") return false;
        const ageMs = Date.now() - new Date(o.updatedAt || o.createdAt).getTime();
        return ageMs > staleThresholdMs;
      });
      let released = 0;
      for (const order of stale) {
        try {
          if (pendingRiderAssignments.has(order.id)) {
            const pending = pendingRiderAssignments.get(order.id)!;
            if (pending.timer) clearTimeout(pending.timer);
            pendingRiderAssignments.delete(order.id);
          }
          await storage.updateOrder(order.id, { status: "processing" } as any);
          released++;
        } catch {}
      }
      fixes.push({ name: "stale_rider_assignments", status: released > 0 ? "fixed" : "ok", detail: released > 0 ? `Released ${released} stale assignment(s)` : "No stale assignments" });
    } catch (e: any) {
      fixes.push({ name: "stale_rider_assignments", status: "error", detail: e?.message });
    }

    // 4. Warm platform settings cache
    try {
      await storage.getPlatformSettings();
      fixes.push({ name: "settings_cache", status: "ok", detail: "Platform settings cache is warm" });
    } catch (e: any) {
      fixes.push({ name: "settings_cache", status: "error", detail: e?.message });
    }

    // 5. Resolve all info-level system activity logs (keep errors/warnings)
    try {
      const infoLogs = await db
        .select({ id: systemActivityLogs.id })
        .from(systemActivityLogs)
        .where(and(eq(systemActivityLogs.isResolved, false), eq(systemActivityLogs.severity, "info")))
        .limit(200);
      if (infoLogs.length > 0) {
        await db
          .update(systemActivityLogs)
          .set({ isResolved: true, resolvedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(systemActivityLogs.isResolved, false), eq(systemActivityLogs.severity, "info")));
        fixes.push({ name: "resolve_info_logs", status: "fixed", detail: `Auto-resolved ${infoLogs.length} info-level log(s)` });
      } else {
        fixes.push({ name: "resolve_info_logs", status: "ok", detail: "No unresolved info logs" });
      }
    } catch (e: any) {
      fixes.push({ name: "resolve_info_logs", status: "error", detail: e?.message });
    }

    const fixedCount = fixes.filter(f => f.status === "fixed").length;
    const errorCount = fixes.filter(f => f.status === "error").length;

    await logSystemActivity({
      category: "system",
      severity: errorCount > 0 ? "warning" : "info",
      title: "Auto-Fix Run",
      message: `Auto-fix completed: ${fixedCount} fix(es) applied, ${errorCount} error(s).`,
      source: "/api/admin/system-health/auto-fix",
      actorId: req.user?.id || null,
      actorRole: req.user?.role || null,
    }).catch(() => {});

    res.json({ success: true, fixedCount, errorCount, fixes });
  });

  console.log('[BOOT] WhatsApp-style messaging services initialized');

  io.on("connection", (socket) => {
    const userId = socket.data.userId; // From authentication middleware
    const userEmail = socket.data.userEmail;
    
    if (SOCKET_VERBOSE_LOGS) {
      console.log(`User connected: ${userEmail} (${userId})`);
    }
    
    // Track user socket for online status (legacy)
    userSockets.set(userId, socket.id);
    io.emit("user_online", userId);
    
    // Register with presence service
    presenceService.userConnected(userId, socket.id);
    if (socket.data.userRole === "rider") {
      void (async () => {
        try {
          await storage.updateUser(userId, { riderOnline: true } as any);
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
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`User disconnected: ${userEmail} (${userId})`);
      }
      userSockets.delete(userId);
      io.emit("user_offline", userId);
      
      // Update presence service
      presenceService.userDisconnected(userId);
      if (socket.data.userRole === "rider") {
        void (async () => {
          try {
            await storage.updateUser(userId, { riderOnline: false } as any);
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
        const lat = toFiniteNumber(payload?.latitude);
        const lng = toFiniteNumber(payload?.longitude);
        if (lat === null || lng === null) return;
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return;

        const rider = await storage.getUser(userId);
        if (!rider) return;
        const currentPrefs = (((rider as any).riderPreferences || {}) as Record<string, any>);
        await storage.updateUser(userId, {
          riderOnline: true,
          riderPreferences: {
            ...currentPrefs,
            lastKnownLocation: {
              latitude: lat,
              longitude: lng,
              accuracy: payload?.accuracy ?? null,
              speed: payload?.speed ?? null,
              heading: payload?.heading ?? null,
              timestamp: new Date().toISOString(),
            },
          } as any,
        } as any);

        const activeTrackingStatuses = new Set([
          "assigned",
          "rider_arrived",
          "picked_up",
          "in_transit",
          "en_route",
          "delivering",
          "searching_rider",
          "ready",
          "confirmed",
          "processing",
        ]);
        const riderOrders = await storage.getOrdersByUser(userId, "rider");
        const activeRiderOrders = riderOrders.filter((candidate: any) =>
          activeTrackingStatuses.has(canonicalizeOrderStatus(candidate.status))
        );
        const activeOrderCount = activeRiderOrders.length;
        const fallbackActiveOrder = activeRiderOrders[0] || null;
        const providedOrderId = String(payload?.orderId || "").trim();
        const effectiveOrderId = providedOrderId || String(fallbackActiveOrder?.id || "");

        if (!effectiveOrderId) {
          const update = {
            orderId: fallbackActiveOrder?.id || null,
            orderNumber: fallbackActiveOrder?.orderNumber || null,
            riderId: userId,
            riderName: rider?.name || "Rider",
            riderPhone: rider?.phone || null,
            vehicleType: String((rider as any)?.vehicleInfo?.type || "").trim() || "motorcycle",
            latitude: lat,
            longitude: lng,
            speed: payload?.speed ?? null,
            heading: payload?.heading ?? null,
            timestamp: new Date().toISOString(),
            hasActiveOrder: activeOrderCount > 0,
            activeOrderCount,
            isOnline: true,
          };
          const [admins, superAdmins] = await Promise.all([
            storage.getUsersByRole("admin"),
            storage.getUsersByRole("super_admin"),
          ]);
          [...admins, ...superAdmins].forEach((adminUser) => {
            io.to(adminUser.id).emit("admin_rider_location_updated", update);
          });
          return;
        }

        let order: any = null;
        if (providedOrderId) {
          order = await storage.getOrder(providedOrderId);
        }
        if ((!order || order.riderId !== userId) && fallbackActiveOrder) {
          order = fallbackActiveOrder;
        }
        if (!order || order.riderId !== userId) return;

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
              recordRiderRiskSignal(userId, "impossible_speed", 2.1);
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

        const update = {
          orderId: order.id,
          orderNumber: order.orderNumber,
          riderId: userId,
          riderName: rider?.name || "Rider",
          riderPhone: rider?.phone || null,
          vehicleType: String((rider as any)?.vehicleInfo?.type || "").trim() || "motorcycle",
          latitude: tracking.latitude,
          longitude: tracking.longitude,
          speed: tracking.speed,
          heading: tracking.heading,
          timestamp: tracking.timestamp,
          hasActiveOrder: activeOrderCount > 0,
          activeOrderCount: Math.max(1, activeOrderCount),
          isOnline: true,
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
        const actor = await storage.getUser(userId);
        if (!actor || !canSupportUserAccessConversation(actor as any, conversation as any)) return;

        const targetUserIds = new Set<string>();
        targetUserIds.add(conversation.customerId);
        const routedStaff = await resolveConversationSupportRecipients(conversation as any, { includeSuperAdminsAlways: true });
        routedStaff.forEach((staff) => targetUserIds.add(staff.id));
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
        const actor = await storage.getUser(userId);
        if (!actor || !canSupportUserAccessConversation(actor as any, conversation as any)) return;

        const targetUserIds = new Set<string>();
        targetUserIds.add(conversation.customerId);
        const routedStaff = await resolveConversationSupportRecipients(conversation as any, { includeSuperAdminsAlways: true });
        routedStaff.forEach((staff) => targetUserIds.add(staff.id));
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
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Call answer sent to ${callerId}`);
      }
      io.to(callerId).emit("call-answered", { answer });
    });

    socket.on("ice-candidate", ({ targetId, candidate }) => {
      io.to(targetId).emit("ice-candidate", { candidate });
    });

    socket.on("call-rejected", ({ callerId }) => {
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Call rejected, notifying ${callerId}`);
      }
      io.to(callerId).emit("call-rejected");
    });

    socket.on("call-ended", ({ targetId }) => {
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Call ended, notifying ${targetId}`);
      }
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

        if (SOCKET_VERBOSE_LOGS) {
          console.log(`Call initiated from ${caller.name} (${callerId}) to ${targetUserId}`);
        }
        
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

        if (SOCKET_VERBOSE_LOGS) {
          console.log(`Call offer (${callType}) from ${caller.name} to ${targetUserId}`);
        }
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
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Call answer from ${socket.data.userId} to ${targetUserId}`);
      }
      io.to(targetUserId).emit("call_answer", { answer });
    });

    socket.on("ice_candidate", ({ candidate, targetUserId }) => {
      io.to(targetUserId).emit("ice_candidate", { candidate });
    });

    socket.on("call_end", ({ targetUserId }) => {
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Call ended by ${socket.data.userId}, notifying ${targetUserId}`);
      }
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

        if (SOCKET_VERBOSE_LOGS) {
          console.log(`Group call ${callId} started by ${host.name} with ${participants.size} participants`);
        }

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

        if (SOCKET_VERBOSE_LOGS) {
          console.log(`${user.name} joined group call ${callId}`);
        }

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

      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Group call offer: ${userId} -> ${targetUserId} in ${callId}`);
      }
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

      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Group call answer: ${userId} -> ${targetUserId} in ${callId}`);
      }
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
      if (SOCKET_VERBOSE_LOGS) {
        console.log(`User ${userId} left group call ${callId}`);
      }

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
        if (SOCKET_VERBOSE_LOGS) {
          console.log(`Group call ${callId} ended (no participants)`);
        }
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

      if (SOCKET_VERBOSE_LOGS) {
        console.log(`Group call ${callId} ended by host ${userId}`);
      }

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

        if (SOCKET_VERBOSE_LOGS) {
          console.debug(`Message delivered: ${messageId} from ${message.senderId} to ${receiverId}`);
        }
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

        if (SOCKET_VERBOSE_LOGS) {
          console.debug(`Message read: ${messageId} from ${message.senderId} to ${receiverId}`);
        }
      } catch (error) {
        console.error("Error marking message as read:", error);
        socket.emit("error", { message: "Failed to update message status" });
      }
    });

    // Real-time message sending handler
    socket.on("new_message", async ({ receiverId, message }) => {
      try {
        const senderId = socket.data.userId;

        if (!receiverId || !message?.trim()) {
          socket.emit("error", { message: "Receiver ID and message are required" });
          return;
        }

        const permission = await chatPermissionService.canInitiateChat(senderId, receiverId);
        if (!permission.allowed) {
          socket.emit("error", { message: permission.reason || "Chat not permitted" });
          return;
        }

        const { db } = await import("../db/index");
        const { chatMessages } = await import("@shared/schema");
        const [receiverUser, senderUser] = await Promise.all([
          storage.getUser(receiverId),
          storage.getUser(senderId),
        ]);

        const senderRole = String(senderUser?.role || "").toLowerCase();
        const receiverRole = String(receiverUser?.role || "").toLowerCase();
        const isRiderToPrivilegedSupport =
          senderRole === "rider" && (receiverRole === "agent" || receiverRole === "admin" || receiverRole === "super_admin");

        let recipientIds = [receiverId];
        if (isRiderToPrivilegedSupport) {
          const [admins, superAdmins, agents] = await Promise.all([
            storage.getUsersByRole("admin"),
            storage.getUsersByRole("super_admin"),
            storage.getUsersByRole("agent"),
          ]);
          const supportIds = [...admins, ...superAdmins, ...agents]
            .filter((u, idx, arr) => Boolean(u?.isActive) && u.id !== senderId && arr.findIndex((x) => x.id === u.id) === idx)
            .map((u) => String(u.id));
          if (supportIds.length > 0) recipientIds = supportIds;
        }

        const createdMessages = await Promise.all(
          recipientIds.map(async (targetReceiverId) => {
            const [created] = await db.insert(chatMessages).values({
              senderId,
              receiverId: targetReceiverId,
              message: message.trim(),
              status: "sent",
              isRead: false,
            }).returning();
            return created;
          })
        );

        const primaryMessage = createdMessages.find((m: any) => String(m.receiverId) === receiverId) || createdMessages[0];

        await Promise.all(
          createdMessages.map((msg) =>
            messageDeliveryService.queueMessage({
              id: msg.id,
              senderId: msg.senderId,
              receiverId: msg.receiverId,
              message: msg.message,
              messageType: "text",
              emitSenderAck: false,
            })
          )
        );

        socket.emit("message_sent", {
          id: primaryMessage.id,
          tempId: message.tempId,
          status: "sent",
          createdAt: primaryMessage.createdAt,
        });

        try {
          const actor = resolveMessageNotificationActor(receiverUser as any, senderUser as any);
          const notificationText = `You have a new message from ${actor.bodySenderName}`;
          await Promise.all(
            recipientIds.map(async (targetReceiverId, idx) => {
              const msgForRecipient = createdMessages[idx] || primaryMessage;
              await storage.createNotification({
                userId: targetReceiverId,
                type: "message",
                title: "New message",
                message: notificationText,
                metadata: {
                  messageId: msgForRecipient.id,
                  senderId: actor.senderIdMetadata,
                  senderRole: actor.senderRoleMetadata,
                } as any,
              });

              io.to(targetReceiverId).emit("notification", {
                type: "message",
                title: "New message",
                message: notificationText,
                data: {
                  messageId: msgForRecipient.id,
                  senderId: actor.senderIdMetadata,
                  senderRole: actor.senderRoleMetadata,
                },
              });
            })
          );
        } catch (notifyError) {
          console.error("Error creating message notification:", notifyError);
        }
      } catch (error) {
        console.error("Error sending message:", error);
        socket.emit("error", { message: "Failed to send message" });
      }
    });
  });

  type SupportRoutingMode = "all_support" | "all_agents" | "all_admins" | "specific_staff";

  const normalizeSupportRoutingMode = (value?: string | null): SupportRoutingMode => {
    const normalized = String(value || "").toLowerCase().trim();
    if (normalized === "all_agents") return "all_agents";
    if (normalized === "all_admins") return "all_admins";
    if (normalized === "specific_staff") return "specific_staff";
    return "all_support";
  };

  const parseRoutingUserIds = (value: unknown): string[] => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
      } catch {
        return [];
      }
    }
    return [];
  };

  const getSupportStaffRoster = async () => {
    const [admins, superAdmins, agents] = await Promise.all([
      storage.getUsersByRole("admin"),
      storage.getUsersByRole("super_admin"),
      storage.getUsersByRole("agent"),
    ]);

    const normalizedSuperAdmins = canonicalSuperAdminId
      ? superAdmins.filter((staff) => String(staff.id) === String(canonicalSuperAdminId))
      : superAdmins.slice(0, 1);

    return [...admins, ...normalizedSuperAdmins, ...agents]
      .filter((staff, index, arr) => Boolean(staff?.isActive) && arr.findIndex((x) => x.id === staff.id) === index);
  };

  const resolveConversationSupportRecipients = async (
    conversation: { routingMode?: string | null; routingUserIds?: unknown; agentId?: string | null },
    options?: { includeSuperAdminsAlways?: boolean }
  ) => {
    const includeSuperAdminsAlways = options?.includeSuperAdminsAlways !== false;
    const roster = await getSupportStaffRoster();
    const mode = normalizeSupportRoutingMode(conversation.routingMode);
    const configuredIds = new Set(parseRoutingUserIds(conversation.routingUserIds));
    if (conversation.agentId) configuredIds.add(String(conversation.agentId));

    const recipients = roster.filter((staff) => {
      if (includeSuperAdminsAlways && staff.role === "super_admin") return true;
      if (mode === "all_support") return true;
      if (mode === "all_agents") return staff.role === "agent";
      if (mode === "all_admins") return staff.role === "admin" || staff.role === "super_admin";
      return configuredIds.has(String(staff.id));
    });

    return recipients;
  };

  const canSupportUserAccessConversation = (
    user: { id: string; role: string },
    conversation: { customerId: string; routingMode?: string | null; routingUserIds?: unknown; agentId?: string | null }
  ): boolean => {
    const role = String(user.role || "").toLowerCase().trim();
    if (role === "super_admin") return true;
    if (conversation.customerId === user.id) return true;
    if (role !== "admin" && role !== "agent") return false;

    const mode = normalizeSupportRoutingMode(conversation.routingMode);
    const configuredIds = new Set(parseRoutingUserIds(conversation.routingUserIds));
    if (conversation.agentId) configuredIds.add(String(conversation.agentId));

    if (mode === "all_support") return true;
    if (mode === "all_agents") return role === "agent";
    if (mode === "all_admins") return role === "admin";
    return configuredIds.has(String(user.id));
  };

  // ============ Customer Support Routes ============
  app.get("/api/support/conversations", requireAuth, requireRoleFeature("support.view"), async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const { db } = await import("../db/index");
      const { supportConversations, supportMessages, users, notifications } = await import("@shared/schema");
      const { and, eq, desc, sql } = await import("drizzle-orm");

      let conversationsQuery;
      
      if (user.role === "agent" || user.role === "admin" || user.role === "super_admin") {
        // Agents and admins see all conversations
        conversationsQuery = db
          .select({
            id: supportConversations.id,
            customerId: supportConversations.customerId,
            customerName: users.name,
            customerEmail: users.email,
            customerRole: users.role,
            customerIsActive: users.isActive,
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
            routingMode: supportConversations.routingMode,
            routingUserIds: supportConversations.routingUserIds,
            subject: supportConversations.subject,
            lastMessage: supportConversations.lastMessage,
            lastSupportResponderId: supportConversations.lastSupportResponderId,
            lastSupportResponderName: sql<string | null>`(
              select ${users.name}
              from ${users}
              where ${users.id} = ${supportConversations.lastSupportResponderId}
              limit 1
            )`,
            lastSupportResponderRole: sql<string | null>`(
              select ${users.role}
              from ${users}
              where ${users.id} = ${supportConversations.lastSupportResponderId}
              limit 1
            )`,
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
            customerRole: users.role,
            customerIsActive: users.isActive,
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
            routingMode: supportConversations.routingMode,
            routingUserIds: supportConversations.routingUserIds,
            subject: supportConversations.subject,
            lastMessage: supportConversations.lastMessage,
            lastSupportResponderId: supportConversations.lastSupportResponderId,
            lastSupportResponderName: sql<string | null>`(
              select ${users.name}
              from ${users}
              where ${users.id} = ${supportConversations.lastSupportResponderId}
              limit 1
            )`,
            lastSupportResponderRole: sql<string | null>`(
              select ${users.role}
              from ${users}
              where ${users.id} = ${supportConversations.lastSupportResponderId}
              limit 1
            )`,
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
      let currentRestrictionStartedAt: Date | null = null;
      const freshUser = await storage.getUser(user.id);

      if ((user.role === "seller" || user.role === "rider") && freshUser?.isActive === false) {
        const [latestDeactivation] = await db
          .select({ createdAt: notifications.createdAt })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, user.id),
              eq(notifications.title, "Account Deactivated"),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1);

        currentRestrictionStartedAt = latestDeactivation?.createdAt || null;
      }

      const restrictionCutoffTime = currentRestrictionStartedAt
        ? new Date(currentRestrictionStartedAt).getTime()
        : null;

      const routed = result
        .filter((conversation: any) => canSupportUserAccessConversation(user, conversation))
        .filter((conversation: any) => {
          if (!restrictionCutoffTime) return true;
          if (String(conversation.subject || "").trim() !== "Account Reactivation Appeal") return true;
          const createdAtTime = conversation.createdAt ? new Date(conversation.createdAt).getTime() : 0;
          return createdAtTime >= restrictionCutoffTime;
        });
      const response = routed.map((conversation: any) => {
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
      if (res.headersSent || res.writableEnded) {
        return;
      }
      res.json(response);
    } catch (error: any) {
      if (res.headersSent || res.writableEnded) {
        return;
      }
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
      const { supportConversations, supportMessages, notifications } = await import("@shared/schema");
      const { and, eq, desc } = await import("drizzle-orm");
      const freshUser = await storage.getUser(user.id);
      const isRestrictedOperationalUser = Boolean(
        freshUser &&
        (freshUser.role === "seller" || freshUser.role === "rider") &&
        freshUser.isActive === false,
      );
      const effectiveSubject = isRestrictedOperationalUser
        ? "Account Reactivation Appeal"
        : String(subject).trim();
      const supportSettings = await storage.getPlatformSettings();

      if (isRestrictedOperationalUser) {
        const [latestDeactivation] = await db
          .select({ createdAt: notifications.createdAt })
          .from(notifications)
          .where(
            and(
              eq(notifications.userId, user.id),
              eq(notifications.title, "Account Deactivated"),
            ),
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1);

        const restrictionCutoffTime = latestDeactivation?.createdAt
          ? new Date(latestDeactivation.createdAt).getTime()
          : null;

        const existingAppeals = await db
          .select({ id: supportConversations.id, createdAt: supportConversations.createdAt })
          .from(supportConversations)
          .where(
            and(
              eq(supportConversations.customerId, user.id),
              eq(supportConversations.subject, "Account Reactivation Appeal"),
            ),
          );

        const hasCurrentCycleAppeal = existingAppeals.some((conversation) => {
          if (!restrictionCutoffTime) return true;
          const createdAtTime = conversation.createdAt ? new Date(conversation.createdAt).getTime() : 0;
          return createdAtTime >= restrictionCutoffTime;
        });

        if (hasCurrentCycleAppeal) {
          return res.status(409).json({ error: "Appeal ticket already submitted" });
        }
      }

      // Create conversation
      const pickupAgentRoutingMode =
        freshUser?.role === "pickup_agent"
          ? (supportSettings.allowPickupAgentAdminChat !== false ? "all_admins" : "specific_staff")
          : "all_support";
      const pickupAgentSuperAdminIds =
        freshUser?.role === "pickup_agent"
          ? (await storage.getUsersByRole("super_admin"))
              .filter((staff) => staff?.isActive !== false)
              .map((staff) => String(staff.id))
          : [];
      const [conversation] = await db.insert(supportConversations).values({
        customerId: user.id,
        subject: effectiveSubject,
        lastMessage: message,
        routingMode: pickupAgentRoutingMode,
        routingUserIds: pickupAgentRoutingMode === "specific_staff" ? pickupAgentSuperAdminIds : [],
        agentId: pickupAgentRoutingMode === "specific_staff" ? pickupAgentSuperAdminIds[0] || null : null,
        status:
          pickupAgentRoutingMode === "specific_staff" && pickupAgentSuperAdminIds.length > 0
            ? "assigned"
            : "open",
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
        const supportStaff = await resolveConversationSupportRecipients(conversation, { includeSuperAdminsAlways: true });

        for (const staff of supportStaff) {
          if (staff.id === user.id) continue;
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

      if (!canSupportUserAccessConversation(user, conversation as any)) {
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
      const routedStaff = await resolveConversationSupportRecipients(conversation as any, { includeSuperAdminsAlways: true });
      for (const staff of routedStaff) {
        io.to(staff.id).emit("support_conversation_updated", {
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

      if (!canSupportUserAccessConversation(user, conversation as any)) {
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
      if (isSupportSender) {
        updatedConversationData.lastSupportResponderId = user.id;
        if (String(conversation.subject || "").trim() === "Account Reactivation Appeal") {
          updatedConversationData.status = "resolved";
          updatedConversationData.resolvedAt = new Date();
        }
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
          const supportStaff = await resolveConversationSupportRecipients(conversation as any, {
            includeSuperAdminsAlways: true,
          });

          for (const staff of supportStaff) {
            if (staff.id === user.id) continue;
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
      const routedStaff = await resolveConversationSupportRecipients(conversation as any, { includeSuperAdminsAlways: true });
      for (const staff of routedStaff) {
        io.to(staff.id).emit("support_conversation_updated", {
          conversationId: id,
          event: "message",
        });
      }

      res.json(newMessage);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/appeal-decision", requireAuth, requireRoleFeature("support.manage"), async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const { decision, message } = req.body;
      const user = req.user!;
      const normalizedDecision = String(decision || "").trim().toLowerCase();
      const responseMessage = String(message || "").trim();
      const { db } = await import("../db/index");
      const { supportConversations, supportMessages } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const platformSettings = await storage.getPlatformSettings();
      const supportEmail = String(platformSettings?.contactEmail || "support@kiyumart.com").trim();
      const supportPhone = String(platformSettings?.contactPhone || "+233 XX XXX XXXX").trim();

      if (!isSupportStaffRole(user.role)) {
        return res.status(403).json({ error: "Only support staff can decide appeals" });
      }

      if (normalizedDecision !== "activate" && normalizedDecision !== "reject") {
        return res.status(400).json({ error: "Invalid appeal decision" });
      }

      if (!responseMessage) {
        return res.status(400).json({ error: "Response message is required" });
      }

      const [conversation] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (!canSupportUserAccessConversation(user, conversation as any)) {
        return res.status(403).json({ error: "Access denied" });
      }

      if (String(conversation.subject || "").trim() !== "Account Reactivation Appeal") {
        return res.status(400).json({ error: "This ticket is not an appeal" });
      }

      const targetUser = await storage.getUser(conversation.customerId);
      if (!targetUser) {
        return res.status(404).json({ error: "Appeal owner not found" });
      }

      if (targetUser.role !== "seller" && targetUser.role !== "rider") {
        return res.status(400).json({ error: "Appeal owner is not a seller or rider" });
      }

      if (normalizedDecision === "activate") {
        if (targetUser.role === "seller" && targetUser.isApproved) {
          const store = await storage.getStoreByPrimarySeller(targetUser.id);
          if (store) {
            await storage.updateStore(store.id, { isActive: true, isApproved: true });
          }
        }
        await storage.updateUser(targetUser.id, {
          isActive: true,
          rejectionReason: null,
        });
      } else {
        if (targetUser.role === "seller" && targetUser.isApproved) {
          const store = await storage.getStoreByPrimarySeller(targetUser.id);
          if (store) {
            await storage.updateStore(store.id, { isActive: false, isApproved: false });
          }
        }
        await storage.updateUser(targetUser.id, {
          isActive: false,
          rejectionReason: responseMessage,
        });
      }

      const supportContactLine =
        normalizedDecision === "reject"
          ? `\n\nFor more information, contact Customer Support directly:\nPhone: ${supportPhone}\nEmail: ${supportEmail}`
          : "";
      const decisionSummary =
        normalizedDecision === "activate"
          ? "\n\nAppeal decision: Activated. Your dashboard is now accessible again."
          : "\n\nAppeal decision: Rejected. Your account remains restricted.";
      const finalMessage = `${responseMessage}${decisionSummary}${supportContactLine}`;
      const notificationBody =
        normalizedDecision === "activate"
          ? `${responseMessage}\n\nYour appeal was approved. Your dashboard is now active again.`
          : `${responseMessage}\n\nYour appeal was rejected. Your account remains restricted.\nContact Customer Support:\nPhone: ${supportPhone}\nEmail: ${supportEmail}`;

      const [newMessage] = await db.insert(supportMessages).values({
        conversationId: id,
        senderId: user.id,
        message: finalMessage,
        isRead: false,
      }).returning();

      const now = new Date();
      const updatedConversationData: any = {
        agentId: conversation.agentId || user.id,
        lastMessage: finalMessage,
        updatedAt: now,
        lastSupportResponderId: user.id,
        status: "resolved",
        resolvedAt: now,
      };
      if (!conversation.firstResponseAt) {
        updatedConversationData.firstResponseAt = now;
      }

      await db
        .update(supportConversations)
        .set(updatedConversationData)
        .where(eq(supportConversations.id, id));

      try {
        const senderProfile = await storage.getUser(user.id);
        const senderName = senderProfile?.name || req.user?.email || "Support";
        const customerVisibleSenderName = resolveSupportDisplayName({
          senderRole: user.role,
          senderName,
          viewerRole: "buyer",
        });
        const customerLink = `/support?conversationId=${id}`;
        const supportReplyPreview =
          decodeAttachmentNotificationPreview(`${customerVisibleSenderName}: ${finalMessage}`) ||
          `${customerVisibleSenderName}: ${finalMessage}`;

        await storage.createNotification({
          userId: conversation.customerId,
          type: "message",
          title: normalizedDecision === "activate" ? "Appeal Approved" : "Appeal Rejected",
          message: notificationBody,
          metadata: { conversationId: id, senderId: user.id, link: customerLink } as any,
        });

        io.to(conversation.customerId).emit("notification", {
          type: "message",
          title: normalizedDecision === "activate" ? "Appeal Approved" : "Appeal Rejected",
          message: notificationBody,
          data: { conversationId: id, senderId: user.id, link: customerLink },
        });
        io.to(conversation.customerId).emit("support_conversation_updated", {
          conversationId: id,
          event: "message",
        });

        const routedStaff = await resolveConversationSupportRecipients(conversation as any, { includeSuperAdminsAlways: true });
        for (const staff of routedStaff) {
          io.to(staff.id).emit("support_conversation_updated", {
            conversationId: id,
            event: "resolved",
          });
        }
      } catch (notifyError) {
        console.error("Failed to notify appeal participants:", notifyError);
      }

      res.json({
        ...conversation,
        ...updatedConversationData,
        customerIsActive: normalizedDecision === "activate",
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/assign", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;

      if (req.user?.role !== "super_admin") {
        return res.status(403).json({ error: "Only super admin can assign conversations" });
      }

      const { db } = await import("../db/index");
      const { supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      const [existing] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (!canSupportUserAccessConversation(user, existing as any)) {
        return res.status(403).json({ error: "Access denied" });
      }

      let assignedAgentId = user.id;
      if (req.body?.assigneeId) {
        const assignee = await storage.getUser(String(req.body.assigneeId));
        if (!assignee || !["agent", "admin", "super_admin"].includes(String(assignee.role || ""))) {
          return res.status(400).json({ error: "Invalid assigneeId" });
        }
        assignedAgentId = assignee.id;
      }

      const [updated] = await db
        .update(supportConversations)
        .set({ agentId: assignedAgentId, status: "assigned", updatedAt: new Date() })
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

  app.get("/api/support/staff", requireAuth, requireRole("super_admin"), async (_req: AuthRequest, res) => {
    try {
      const roster = await getSupportStaffRoster();
      const staff = roster
        .filter((member) => !isLikelySystemIdentity(member))
        .map((member) => ({
        id: member.id,
        name: member.name,
        email: member.email,
        role: member.role,
        isActive: member.isActive,
      }));
      res.json(staff);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch("/api/support/conversations/:id/routing", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const mode = normalizeSupportRoutingMode(req.body?.mode);
      const requestedIds = parseRoutingUserIds(req.body?.routingUserIds);
      const { db } = await import("../db/index");
      const { supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [existing] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      const roster = await getSupportStaffRoster();
      const selectableRoster = roster.filter(
        (member) => member.role !== "super_admin" && !isLikelySystemIdentity(member),
      );
      const rosterSet = new Set(selectableRoster.map((member) => String(member.id)));
      const validIds = requestedIds.filter((candidate) => rosterSet.has(String(candidate)));

      if (mode === "specific_staff" && validIds.length === 0) {
        return res.status(400).json({ error: "At least one support user must be selected for specific_staff routing" });
      }

      const primaryAssigneeId =
        mode === "specific_staff"
          ? validIds[0] || null
          : null;
      const nextStatus =
        existing.status === "resolved"
          ? "resolved"
          : primaryAssigneeId
            ? "assigned"
            : "open";

      const [updated] = await db
        .update(supportConversations)
        .set({
          routingMode: mode,
          routingUserIds: mode === "specific_staff" ? validIds : [],
          agentId: primaryAssigneeId,
          status: nextStatus as any,
          updatedAt: new Date(),
        })
        .where(eq(supportConversations.id, id))
        .returning();

      const recipients = await resolveConversationSupportRecipients(updated as any, { includeSuperAdminsAlways: true });
      for (const recipient of recipients) {
        io.to(recipient.id).emit("support_conversation_updated", {
          conversationId: id,
          event: "routing_updated",
        });
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/support/conversations/:id/resolve", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { id } = req.params;
      const user = req.user!;

      if (user.role !== "agent" && user.role !== "admin" && user.role !== "super_admin") {
        return res.status(403).json({ error: "Only agents and admins can resolve conversations" });
      }

      const { db } = await import("../db/index");
      const { supportConversations } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [existing] = await db
        .select()
        .from(supportConversations)
        .where(eq(supportConversations.id, id))
        .limit(1);

      if (!existing) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      if (!canSupportUserAccessConversation(user, existing as any)) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Resolution policy:
      // - super admin can always resolve
      // - when a ticket is explicitly assigned to specific staff, any assigned staff member can resolve
      // - when unassigned (default/all_* routing), any routed support staff can resolve
      const explicitAssigneeIds = new Set(parseRoutingUserIds((existing as any).routingUserIds));
      if ((existing as any).agentId) explicitAssigneeIds.add(String((existing as any).agentId));
      const hasExplicitAssignees =
        normalizeSupportRoutingMode((existing as any).routingMode) === "specific_staff" &&
        explicitAssigneeIds.size > 0;
      if (
        user.role !== "super_admin" &&
        hasExplicitAssignees &&
        !explicitAssigneeIds.has(String(user.id))
      ) {
        return res.status(403).json({
          error: "Only staff assigned by super admin can resolve this conversation",
        });
      }

      const [updated] = await db
        .update(supportConversations)
        .set({ status: "resolved", resolvedAt: new Date(), updatedAt: new Date() })
        .where(eq(supportConversations.id, id))
        .returning();

      if (!updated) {
        return res.status(404).json({ error: "Conversation not found" });
      }

      io.to((existing as any).customerId).emit("support_conversation_updated", {
        conversationId: id,
        event: "resolved",
      });
      const routedStaff = await resolveConversationSupportRecipients(updated as any, { includeSuperAdminsAlways: true });
      for (const staff of routedStaff) {
        io.to(staff.id).emit("support_conversation_updated", {
          conversationId: id,
          event: "resolved",
        });
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
  app.get("/api/stores/my-store", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      
      try {
        // Use centralized helper (requireApproval=true ensures only approved sellers get stores)
        const store = await storage.ensureStoreForSeller(req.user!.id, { requireApproval: true });
        res.json(store);
      } catch (storeError: any) {
        console.warn(`[/api/stores/my-store] Failed to ensure store for seller ${req.user!.id}:`, storeError.message);
        
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
      const seller = store.primarySellerId ? await storage.getUser(store.primarySellerId) : null;
      res.json({
        ...store,
        sellerProfileImage: seller?.profileImage || null,
      });
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
      const seller = await storage.getUser(req.params.sellerId);
      res.json({
        ...store,
        sellerProfileImage: seller?.profileImage || null,
      });
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

      // Keep seller user profile fields aligned when store details are edited directly.
      if (updated?.primarySellerId) {
        try {
          const userPatch: Record<string, any> = {};
          if (req.body.name !== undefined) {
            userPatch.storeName = typeof req.body.name === "string" ? req.body.name.trim() : req.body.name;
          }
          if (req.body.description !== undefined) {
            userPatch.storeDescription = req.body.description || "";
          }
          if (req.body.banner !== undefined) {
            const bannerValue = typeof req.body.banner === "string" ? req.body.banner.trim() : "";
            userPatch.storeBanner = bannerValue || null;
          }
          if (req.body.logo !== undefined) {
            const logoValue = typeof req.body.logo === "string" ? req.body.logo.trim() : "";
            userPatch.profileImage = logoValue || null;
          }
          if (Object.keys(userPatch).length > 0) {
            await storage.updateUser(updated.primarySellerId, userPatch);
          }
        } catch (profileSyncError) {
          console.error("Failed to sync store edits back to seller profile:", profileSyncError);
        }
      }

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
  const DEFAULT_CATEGORY_IMAGES_BY_STORE_TYPE: Record<string, string> = {
    clothing: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=800",
    beauty_cosmetics: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800",
    groceries: "https://images.unsplash.com/photo-1542838132-92c53300491e?w=800",
    electronics: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800",
    food_restaurant: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800",
    pharmacy: "https://images.unsplash.com/photo-1587854692152-cbe660dbde88?w=800",
    automotive: "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800",
    health_wellness: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800",
    home_living: "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?w=800",
    toys_games: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=800",
    books_stationery: "https://images.unsplash.com/photo-1512820790803-83ca734da794?w=800",
    sports_outdoor: "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800",
    jewelry_accessories: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?w=800",
  };

  const getDefaultCategoryImageForStoreType = (storeType?: string | null) => {
    const normalized = String(storeType || "").trim();
    return DEFAULT_CATEGORY_IMAGES_BY_STORE_TYPE[normalized] || "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800";
  };

  const buildRequestedCategoryImage = (categoryName: string, storeType?: string | null) => {
    const normalizedName = String(categoryName || "").trim().toLowerCase();
    const normalizedStoreType = String(storeType || "").trim().replace(/_/g, " ");
    const keywordByCategoryName: Array<[RegExp, string]> = [
      [/\bprayer\s*mat\b|\bprayer\s*rug\b/, "islamic prayer mat"],
      [/\bhijab\b/, "modest hijab fashion"],
      [/\babayas?\b/, "modest abaya fashion"],
      [/\bqur'?an\b|\bislamic book\b/, "islamic books quran"],
      [/\btasbih\b|\bmisbaha\b|\bprayer beads\b/, "islamic prayer beads"],
      [/\bbukhoor\b|\boud\b|\bincense\b/, "arabic oud incense"],
      [/\bthobe\b|\bjubba\b/, "traditional islamic thobe"],
      [/\bjalabiya\b/, "jalabiya traditional clothing"],
      [/\bdates?\b/, "premium dates ramadan"],
      [/\bperfume\b|\battar\b|\bfragrance\b/, "arabic perfume bottle"],
    ];

    const matchedKeyword =
      keywordByCategoryName.find(([pattern]) => pattern.test(normalizedName))?.[1] ||
      `${normalizedName} ${normalizedStoreType}`.trim();

    const query = encodeURIComponent(matchedKeyword.replace(/\s+/g, " ").trim());
    return `https://loremflickr.com/960/720/${query}`;
  };

  const flagSellerRequestedCategories = async <T extends { id: string }>(categoryList: T[]) => {
    if (categoryList.length === 0) return categoryList.map((category) => ({ ...category, requestedBySeller: false }));

    const requestRows = await db
      .select({
        categoryId: sql<string>`${notifications.metadata} ->> 'categoryId'`,
      })
      .from(notifications)
      .where(sql`${notifications.metadata} ->> 'categoryRequestKind' = 'seller_category_request'`);

    const sellerRequestedCategoryIds = new Set(
      requestRows
        .map((row) => String(row.categoryId || "").trim())
        .filter(Boolean),
    );

    return categoryList.map((category) => ({
      ...category,
      requestedBySeller: sellerRequestedCategoryIds.has(String(category.id || "").trim()),
    }));
  };

  app.post("/api/seller/categories/request", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const sellerStore = await storage.ensureStoreForSeller(req.user!.id, { requireApproval: true });
      const storeType = String(sellerStore.storeType || "").trim();

      if (!storeType) {
        return res.status(400).json({ error: "Your store type must be configured before requesting a category." });
      }

      const rawName = String(req.body?.name || "").trim();
      if (!rawName) {
        return res.status(400).json({ error: "Category name is required." });
      }

      const slug = String(req.body?.slug || rawName)
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .trim();

      if (!slug) {
        return res.status(400).json({ error: "A valid category slug could not be generated." });
      }

      const existingCategories = await storage.getCategories();
      const existing = existingCategories.find((category: any) => String(category.slug || "").trim().toLowerCase() === slug);
      if (existing) {
        return res.status(200).json({
          ...existing,
          message: existing.isActive
            ? "This category already exists and is already available."
            : "This category request already exists and is pending admin approval.",
        });
      }

      const normalizedName = rawName.toLowerCase().replace(/\s+/g, " ").trim();
      const existingByName = existingCategories.find(
        (category: any) => String(category.name || "").toLowerCase().replace(/\s+/g, " ").trim() === normalizedName
      );
      if (existingByName) {
        return res.status(200).json({
          ...existingByName,
          message: existingByName.isActive
            ? "This category already exists and is already available."
            : "This category request already exists and is pending admin approval.",
        });
      }

      const category = await storage.createCategory({
        name: rawName,
        slug,
        image: String(req.body?.image || "").trim() || buildRequestedCategoryImage(rawName, storeType) || getDefaultCategoryImageForStoreType(storeType),
        description: String(req.body?.description || "").trim() || `Seller-submitted category for ${storeType.replace(/_/g, " ")} stores.`,
        storeTypes: [storeType],
        displayOrder: existingCategories.length,
        isActive: false,
      });

      try {
        await storage.createNotification({
          userId: req.user!.id,
          type: "system",
          title: "Category request submitted",
          message: `"${category.name}" is pending admin approval.`,
          metadata: {
            categoryRequestKind: "seller_category_request",
            categoryId: category.id,
            categoryName: category.name,
            categorySlug: category.slug,
            storeId: sellerStore.id,
            storeName: sellerStore.name,
            storeType,
            categoryStatus: "pending",
            link: `/seller/categories?categoryId=${encodeURIComponent(String(category.id))}`,
          } as any,
        });
      } catch (notificationError) {
        console.error("[CATEGORY REQUEST] Failed to create seller notification:", notificationError);
      }

      try {
        await notifyAdmins(
          "system",
          "New category request",
          `${req.user?.email || "A seller"} requested the "${category.name}" category for ${sellerStore.name || "their store"}.`,
          {
            categoryId: category.id,
            categoryName: category.name,
            categorySlug: category.slug,
            storeId: sellerStore.id,
            storeName: sellerStore.name,
            storeType,
            sellerId: req.user!.id,
            sellerName: sellerStore.name || null,
            sellerEmail: req.user?.email || null,
            link: `/admin/categories?categoryId=${encodeURIComponent(String(category.id))}&action=review`,
          },
          {
            requiredAdminPermission: "manage_categories",
            includeAgents: false,
          }
        );
      } catch (notifyErr) {
        console.error("[CATEGORY REQUEST] Failed to notify admins:", notifyErr);
      }

      res.status(201).json({
        ...category,
        message: "Category request submitted. An admin must approve it before it appears on the homepage.",
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/seller/category-requests", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const sellerNotifications = await storage.getNotificationsByUser(req.user!.id, 500);
      const latestRequestByCategory = new Map<string, { notification: any; metadata: Record<string, any> }>();

      for (const notification of sellerNotifications) {
        const metadata = typeof notification.metadata === "string"
          ? (() => {
              try {
                return JSON.parse(notification.metadata);
              } catch {
                return {};
              }
            })()
          : (notification.metadata || {});
        const categoryId = String(metadata?.categoryId || "").trim();
        if (metadata?.categoryRequestKind !== "seller_category_request" || !categoryId || latestRequestByCategory.has(categoryId)) {
          continue;
        }
        latestRequestByCategory.set(categoryId, { notification, metadata });
      }

      const requests = await Promise.all(
        Array.from(latestRequestByCategory.values()).map(async ({ notification, metadata }) => {
          const categoryId = String(metadata?.categoryId || "").trim();
          const category = categoryId ? await storage.getCategory(categoryId) : undefined;
          const metadataStatus = String(metadata?.categoryStatus || "").trim().toLowerCase();
          const status =
            category?.isActive === true
              ? "approved"
              : metadataStatus === "rejected"
                ? "rejected"
                : "pending";
          const categoryName = category?.name || metadata?.categoryName || "Requested category";

          return {
            categoryId,
            name: categoryName,
            slug: category?.slug || metadata?.categorySlug || "",
            image: category?.image || null,
            storeType: metadata?.storeType || null,
            requestedAt: notification.createdAt,
            status,
            message: status === "approved"
              ? `"${categoryName}" has been approved and is now available for use.`
              : status === "rejected"
                ? metadata?.rejectionReason
                  ? `"${categoryName}" was rejected by admin. Reason: ${metadata.rejectionReason}`
                  : `"${categoryName}" was rejected by admin.`
                : notification.message,
          };
        })
      );

      requests.sort((a, b) => {
        const aTime = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
        const bTime = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
        return bTime - aTime;
      });

      res.json(requests);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

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
      res.json(await flagSellerRequestedCategories(categories));
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

  app.post("/api/categories/:id/approve", requireAuth, requireRole("super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
    try {
      const updated = await storage.updateCategory(req.params.id, { isActive: true });
      if (!updated) {
        return res.status(404).json({ error: "Category not found" });
      }

      try {
        const [requestNotification] = await db
          .select()
          .from(notifications)
          .where(
            and(
              sql`${notifications.metadata} ->> 'categoryRequestKind' = 'seller_category_request'`,
              sql`${notifications.metadata} ->> 'categoryId' = ${req.params.id}`
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1);

        if (requestNotification?.userId) {
          const approvalMessage = `"${updated.name}" has been approved and is now available for use.`;
          await storage.createNotification({
            userId: requestNotification.userId,
            type: "system",
            title: "Category approved",
            message: approvalMessage,
            metadata: {
              categoryRequestKind: "seller_category_request",
              categoryId: updated.id,
              categoryName: updated.name,
              categorySlug: updated.slug,
              storeType: Array.isArray(updated.storeTypes) ? updated.storeTypes[0] || null : null,
              categoryStatus: "approved",
               link: `/seller/categories?categoryId=${encodeURIComponent(String(updated.id))}`,
            } as any,
          });

          io.to(requestNotification.userId).emit("notification", {
            title: "Category approved",
            message: approvalMessage,
            type: "default",
          });
        }
      } catch (notifyErr) {
        console.error("[CATEGORY APPROVAL] Failed to notify seller:", notifyErr);
      }

      res.json(updated);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post("/api/categories/:id/reject", requireAuth, requireRole("super_admin"), requirePermission("manage_categories"), async (req: AuthRequest, res) => {
    try {
      const category = await storage.getCategory(req.params.id);
      if (!category) {
        return res.status(404).json({ error: "Category not found" });
      }

      if (category.isActive) {
        return res.status(400).json({ error: "Active categories cannot be rejected." });
      }

      const rejectionReason = String(req.body?.reason || "").trim();

      let sellerUserId: string | null = null;
      try {
        const [requestNotification] = await db
          .select()
          .from(notifications)
          .where(
            and(
              sql`${notifications.metadata} ->> 'categoryRequestKind' = 'seller_category_request'`,
              sql`${notifications.metadata} ->> 'categoryId' = ${req.params.id}`
            )
          )
          .orderBy(desc(notifications.createdAt))
          .limit(1);

        sellerUserId = requestNotification?.userId || null;
      } catch (lookupErr) {
        console.error("[CATEGORY REJECTION] Failed to resolve seller request notification:", lookupErr);
      }

      const success = await storage.deleteCategory(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Category not found" });
      }

      if (sellerUserId) {
        const rejectionMessage = rejectionReason
          ? `"${category.name}" was rejected by admin. Reason: ${rejectionReason}`
          : `"${category.name}" was rejected by admin.`;

        try {
          await storage.createNotification({
            userId: sellerUserId,
            type: "system",
            title: "Category rejected",
            message: rejectionMessage,
            metadata: {
              categoryRequestKind: "seller_category_request",
              categoryId: category.id,
              categoryName: category.name,
              categorySlug: category.slug,
              storeType: Array.isArray(category.storeTypes) ? category.storeTypes[0] || null : null,
              categoryStatus: "rejected",
              rejectionReason: rejectionReason || null,
               link: `/seller/categories?categoryId=${encodeURIComponent(String(category.id))}`,
            } as any,
          });

          io.to(sellerUserId).emit("notification", {
            title: "Category rejected",
            message: rejectionMessage,
            type: "default",
          });
        } catch (notifyErr) {
          console.error("[CATEGORY REJECTION] Failed to notify seller:", notifyErr);
        }
      }

      res.json({
        success: true,
        categoryId: category.id,
        message: `"${category.name}" was rejected successfully.`,
      });
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
      const freshUser = await storage.getUser(req.user!.id);
      if (!freshUser || !freshUser.isActive) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const rawRole = String(freshUser.role || req.user!.role || "").toLowerCase().trim();
      const normalizedRawRole = rawRole.replace(/[\s-]+/g, "_");
      const userRole = normalizedRawRole === "superadmin" ? "super_admin" : normalizedRawRole;
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
        uploaderId: freshUser.id,
      });
      res.json(mediaItem);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/media-library", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { category, uploaderRole } = req.query;
      const freshUser = await storage.getUser(req.user!.id);
      if (!freshUser || !freshUser.isActive) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const rawRole = String(freshUser.role || req.user!.role || "").toLowerCase().trim();
      const normalizedRawRole = rawRole.replace(/[\s-]+/g, "_");
      const userRole = normalizedRawRole === "superadmin" ? "super_admin" : normalizedRawRole;

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
            item => item.uploaderId === freshUser.id || item.uploaderRole === "admin" || item.uploaderRole === "super_admin"
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
      const freshUser = await storage.getUser(req.user!.id);
      if (!freshUser || !freshUser.isActive) {
        return res.status(401).json({ error: "Authentication required" });
      }
      const rawRole = String(freshUser.role || req.user!.role || "").toLowerCase().trim();
      const normalizedRawRole = rawRole.replace(/[\s-]+/g, "_");
      const userRole = normalizedRawRole === "superadmin" ? "super_admin" : normalizedRawRole;
      
      // Get the item first to check ownership
      const items = await storage.getMediaLibraryItems({});
      const item = items.find(i => i.id === req.params.id);

      if (!item) {
        return res.status(404).json({ error: "Media item not found" });
      }

      // Admin and super_admin can delete anything, sellers can only delete their own product images
      if (userRole === "seller") {
        if (item.uploaderId !== freshUser.id) {
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
  app.get("/api/seller/reviews", requireAuth, requireRole("seller"), async (req: AuthRequest, res) => {
    try {
      const products = await storage.getProducts({ sellerId: req.user!.id });
      if (!products.length) return res.json([]);
      const reviewArrays = await Promise.all(products.map((p: any) => storage.getProductReviews(p.id)));
      const productMap = new Map(products.map((p: any) => [p.id, p]));
      const allReviews = reviewArrays.flat().map((review: any) => {
        const product = productMap.get(review.productId);
        return {
          ...review,
          productName: product?.name || "Unknown Product",
          productImage: Array.isArray(product?.images) && product.images.length ? product.images[0] : null,
        };
      });
      allReviews.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      res.json(allReviews);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

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
  const {
    isValidGhanaMobileMoneyNumber,
    normalizeGhanaMobileMoneyNumber,
    normalizeGhanaMobileMoneyProvider,
    paystackService,
  } = await import("./paystack");

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
      const normalizedPayoutDetails = { ...(payoutDetails || {}) };
      const settings = await storage.getPlatformSettings();

      // Validate payout details based on type
      if (payoutType === "bank_account") {
        if (settings.allowSellerBankPayouts === false) {
          return res.status(400).json({
            error: "Bank account payouts are currently disabled. Please use mobile money.",
          });
        }
        if (!normalizedPayoutDetails.bankCode || !normalizedPayoutDetails.accountNumber || !normalizedPayoutDetails.accountName || !normalizedPayoutDetails.bankName) {
          return res.status(400).json({ 
            error: "Bank code, bank name, account number, and account name are required for bank account payouts" 
          });
        }
      } else if (payoutType === "mobile_money") {
        normalizedPayoutDetails.provider = normalizeGhanaMobileMoneyProvider(normalizedPayoutDetails.provider);
        normalizedPayoutDetails.mobileNumber = normalizeGhanaMobileMoneyNumber(normalizedPayoutDetails.mobileNumber);

        if (
          !normalizedPayoutDetails.provider ||
          !normalizedPayoutDetails.mobileNumber ||
          !isValidGhanaMobileMoneyNumber(normalizedPayoutDetails.mobileNumber, normalizedPayoutDetails.provider)
        ) {
          return res.status(400).json({ 
            error: "Provider and a valid Ghana mobile money number for that provider are required for mobile money payouts" 
          });
        }
      } else {
        return res.status(400).json({ 
          error: "Invalid payout type. Supported types: bank_account, mobile_money" 
        });
      }

      // Get platform settings for commission rate
      const commissionRate = parseFloat(settings.defaultCommissionRate?.toString() || "1");
      
      let paystackIdentifier: string;

      // Bank accounts use Paystack subaccounts for automatic split payments
      if (payoutType === "bank_account") {
        const seller = await storage.getUser(store.primarySellerId!);
        const subaccountData = {
          business_name: store.name,
          bank_code: normalizedPayoutDetails.bankCode,
          account_number: normalizedPayoutDetails.accountNumber,
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
        paystackIdentifier = `mobile_${normalizedPayoutDetails.provider}_${normalizedPayoutDetails.mobileNumber}`;
      }

      // Update store with payment configuration
      const updatedStore = await storage.updateStore(req.params.storeId, {
        paystackSubaccountId: paystackIdentifier,
        payoutType: payoutType,
        payoutDetails: normalizedPayoutDetails,
        isPayoutVerified: true,
      });

      let releasedPayouts = { releasedCount: 0, releasedAmount: 0 };
      try {
        releasedPayouts = await storage.activateEligibleSellerPayoutsForSeller(store.primarySellerId!);
      } catch (activationError: any) {
        console.warn(
          "[PAYOUT] Store payout setup completed, but held payout activation failed:",
          activationError?.message || activationError,
        );
      }

      try {
        const payoutSetupMessage =
          releasedPayouts.releasedCount > 0
            ? `Your payout setup is complete. ${releasedPayouts.releasedCount} held payout${releasedPayouts.releasedCount === 1 ? "" : "s"} worth GHS ${releasedPayouts.releasedAmount.toFixed(2)} ${payoutType === "mobile_money" ? "have been queued for transfer" : "have been released"} for your seller account.`
            : `Your payout setup is complete. Future seller earnings can now be transferred to your ${payoutType === "mobile_money" ? "mobile money wallet" : "bank account"}.`;

        await storage.createNotification({
          userId: store.primarySellerId!,
          type: "payout",
          title: "Payout Setup Complete",
          message: payoutSetupMessage,
          metadata: {
            link: "/seller/payment-setup",
            payoutType,
            releasedCount: releasedPayouts.releasedCount,
            releasedAmount: releasedPayouts.releasedAmount,
          },
        } as any);

        io.to(store.primarySellerId!).emit("notification", {
          type: "payout",
          title: "Payout Setup Complete",
          message: payoutSetupMessage,
        });
      } catch (notifyError: any) {
        console.error("[SELLER_PAYOUT_SETUP] Failed to notify seller about payout setup completion:", notifyError?.message || notifyError);
      }

      res.json({
        success: true,
        identifier: paystackIdentifier,
        store: updatedStore,
        releasedPayouts,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // NOTE: Legacy /webhooks/paystack endpoint removed. All webhook traffic must use /api/webhooks/paystack
  // which has proper rawBody signature verification, idempotency guards, and full audit logging.

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

  // ─── Referral System ──────────────────────────────────────────────────────

  app.get("/api/referral/stats", requireAuth, async (req: AuthRequest, res) => {
    try {
      const stats = await getReferralStats(req.user!.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/referral/claim/:rewardId", requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await claimReward(req.params.rewardId, req.user!.id, req.body.promoOptions);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get("/api/admin/referral-report", requireAuth, requireRole("super_admin", "admin"), requirePermissionIfAdmin("manage_users"), async (req: AuthRequest, res) => {
    try {
      const report = await getAdminReferralReport();
      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // PLATFORM HEALTH  (Task 8.4)
  // ─────────────────────────────────────────────────────────────────────────────
  app.get("/api/admin/platform-health", requireAuth, requireRole("super_admin", "admin"), async (_req: AuthRequest, res) => {
    try {
      const dbStart = Date.now();
      let dbStatus = "healthy";
      try { await db.execute(sql`SELECT 1`); } catch { dbStatus = "error"; }
      const dbLatency = Date.now() - dbStart;

      const socketCount = io.sockets.sockets.size;

      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);

      const [recentOrderRows, criticalErrorRows, activeUserRows, uptimeRow] = await Promise.allSettled([
        db.select({
          id: orders.id,
          total: orders.total,
          paymentStatus: orders.paymentStatus,
          createdAt: orders.createdAt,
          status: orders.status,
        }).from(orders).where(gte(orders.createdAt, dayAgo)).limit(200),

        db.select({ count: sql<number>`count(*)` })
          .from(systemActivityLogs)
          .where(and(
            eq(systemActivityLogs.isResolved, false),
            inArray(systemActivityLogs.severity as any, ["critical", "error"]),
            gte(systemActivityLogs.createdAt, dayAgo),
          )),

        db.select({ count: sql<number>`count(*)` })
          .from(users)
          .where(eq(users.isActive, true)),

        db.select({ count: sql<number>`count(*)` })
          .from(systemActivityLogs)
          .limit(1),
      ]);

      const recentOrders = recentOrderRows.status === "fulfilled" ? recentOrderRows.value : [];
      const critCount = criticalErrorRows.status === "fulfilled" ? Number(criticalErrorRows.value[0]?.count ?? 0) : 0;
      const activeSessions = activeUserRows.status === "fulfilled" ? Number(activeUserRows.value[0]?.count ?? 0) : 0;
      const hasActivityTable = uptimeRow.status === "fulfilled";

      const successfulPayments = recentOrders.filter((o) =>
        ["paid", "completed", "success"].includes(String(o.paymentStatus ?? "").toLowerCase()),
      );
      const failedPayments = recentOrders.filter((o) =>
        String(o.paymentStatus ?? "").toLowerCase() === "failed",
      );
      const totalRevenue24h = successfulPayments.reduce((s, o) => s + Number(o.total || 0), 0);

      const uptimeSeconds = Math.floor(process.uptime());
      const uptimeDays = Math.floor(uptimeSeconds / 86400);
      const uptimeHours = Math.floor((uptimeSeconds % 86400) / 3600);
      const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);

      res.json({
        timestamp: new Date().toISOString(),
        uptime: { seconds: uptimeSeconds, days: uptimeDays, hours: uptimeHours, minutes: uptimeMinutes, label: `${uptimeDays}d ${uptimeHours}h ${uptimeMinutes}m` },
        database: { status: dbStatus, latencyMs: dbLatency },
        sockets: { activeConnections: socketCount },
        sessions: { active30Min: activeSessions },
        payments: {
          last24hTotal: recentOrders.length,
          successful: successfulPayments.length,
          failed: failedPayments.length,
          totalRevenue24h,
        },
        errors: { criticalLast24h: critCount, monitoringAvailable: hasActivityTable },
        nodeVersion: process.version,
        memoryMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // GA4 REPORT  (Task 8.1)
  // ─────────────────────────────────────────────────────────────────────────────

  async function getGoogleAccessToken(credentials: { client_email: string; private_key: string }): Promise<string> {
    const { createSign } = await import("crypto");
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({
      iss: credentials.client_email,
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })).toString("base64url");
    const sign = createSign("RSA-SHA256");
    sign.update(`${header}.${payload}`);
    const signature = sign.sign(credentials.private_key, "base64url");
    const jwtToken = `${header}.${payload}.${signature}`;
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwtToken}`,
    });
    const tokenData = await tokenRes.json() as any;
    if (!tokenData.access_token) throw new Error(tokenData.error_description || "Token exchange failed");
    return tokenData.access_token;
  }

  app.get("/api/admin/ga4-report", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    const settings = await storage.getPlatformSettings();
    const propertyId = (settings as any).ga4PropertyId || process.env.GA4_PROPERTY_ID;
    const credJson = (settings as any).googleCredentialsJson || process.env.GOOGLE_CREDENTIALS_JSON;
    if (!propertyId || !credJson) {
      return res.json({ configured: false, message: "Configure GA4 Property ID and Google Credentials JSON in Admin Settings → Analytics Integrations to enable GA4 reporting." });
    }
    try {
      const credentials = JSON.parse(credJson);
      const accessToken = await getGoogleAccessToken(credentials);
      const dateRange = (req.query.range as string) || "28daysAgo";

      const [mainReport, topPagesReport] = await Promise.all([
        fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateRange, endDate: "today" }],
            metrics: [
              { name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" },
              { name: "screenPageViews" }, { name: "purchaseRevenue" }, { name: "conversions" },
              { name: "averageSessionDuration" }, { name: "bounceRate" },
            ],
            dimensions: [{ name: "date" }],
            orderBys: [{ dimension: { dimensionName: "date" } }],
          }),
        }),
        fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            dateRanges: [{ startDate: dateRange, endDate: "today" }],
            metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
            dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
            orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
            limit: 10,
          }),
        }),
      ]);

      const [mainData, topPagesData] = await Promise.all([mainReport.json(), topPagesReport.json()]) as any[];

      const parseRows = (data: any, metricNames: string[]) =>
        (data.rows || []).map((row: any) => {
          const obj: Record<string, string> = {};
          (data.dimensionHeaders || []).forEach((h: any, i: number) => { obj[h.name] = row.dimensionValues?.[i]?.value ?? ""; });
          metricNames.forEach((m, i) => { obj[m] = row.metricValues?.[i]?.value ?? "0"; });
          return obj;
        });

      const metricNames = ["sessions", "totalUsers", "newUsers", "screenPageViews", "purchaseRevenue", "conversions", "averageSessionDuration", "bounceRate"];
      res.json({
        configured: true,
        range: dateRange,
        timeSeries: parseRows(mainData, metricNames),
        topPages: parseRows(topPagesData, ["screenPageViews", "sessions"]),
        totals: mainData.totals?.[0]?.metricValues?.reduce((acc: any, v: any, i: number) => {
          acc[metricNames[i]] = v.value;
          return acc;
        }, {}) ?? {},
      });
    } catch (err: any) {
      res.status(500).json({ configured: true, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SENTRY ISSUES  (Task 8.2)
  // ─────────────────────────────────────────────────────────────────────────────
  app.get("/api/admin/sentry-issues", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    const settings = await storage.getPlatformSettings();
    const authToken = (settings as any).sentryAuthToken || process.env.SENTRY_AUTH_TOKEN;
    const org = (settings as any).sentryOrg || process.env.SENTRY_ORG;
    const project = (settings as any).sentryProject || process.env.SENTRY_PROJECT;
    if (!authToken || !org || !project) {
      return res.json({ configured: false, message: "Configure Sentry Auth Token, Org, and Project in Admin Settings → Analytics Integrations to enable Sentry monitoring." });
    }
    try {
      const query = (req.query.q as string) || "is:unresolved";
      const limit = Math.min(Number(req.query.limit) || 25, 100);
      const [issuesRes, projectRes] = await Promise.all([
        fetch(`https://sentry.io/api/0/projects/${org}/${project}/issues/?query=${encodeURIComponent(query)}&limit=${limit}&expand=owners&collapse=stats`, {
          headers: { "Authorization": `Bearer ${authToken}` },
        }),
        fetch(`https://sentry.io/api/0/projects/${org}/${project}/`, {
          headers: { "Authorization": `Bearer ${authToken}` },
        }),
      ]);
      if (!issuesRes.ok) {
        const err = await issuesRes.json() as any;
        return res.status(issuesRes.status).json({ configured: true, error: err.detail || "Sentry API error" });
      }
      const [issues, project_info] = await Promise.all([issuesRes.json(), projectRes.json()]) as any[];
      res.json({ configured: true, issues: Array.isArray(issues) ? issues : [], project: project_info });
    } catch (err: any) {
      res.status(500).json({ configured: true, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // SENTRY ISSUE DETAIL (for AI fix context)
  // ─────────────────────────────────────────────────────────────────────────────
  app.get("/api/admin/sentry-issues/:issueId/events", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    const settings = await storage.getPlatformSettings();
    const authToken = (settings as any).sentryAuthToken || process.env.SENTRY_AUTH_TOKEN;
    const org = (settings as any).sentryOrg || process.env.SENTRY_ORG;
    if (!authToken || !org) return res.status(503).json({ error: "Sentry not configured" });
    try {
      const r = await fetch(`https://sentry.io/api/0/organizations/${org}/issues/${req.params.issueId}/events/latest/`, {
        headers: { "Authorization": `Bearer ${authToken}` },
      });
      const data = await r.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // AI-SUGGESTED FIX FOR SENTRY ISSUE  (Task 8.3)
  // ─────────────────────────────────────────────────────────────────────────────
  app.post("/api/admin/sentry-ai-fix", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "ANTHROPIC_API_KEY not configured" });

    const { title, culprit, stacktrace, issueType } = req.body as {
      title?: string; culprit?: string; stacktrace?: string; issueType?: string;
    };

    // Attempt to read the culprit file for better context
    let fileContent = "";
    let resolvedFilePath = "";
    if (culprit) {
      const rawPath = culprit.split(" in ")[0].trim().replace(/^\//, "");
      const candidates = [
        path.join(process.cwd(), rawPath),
        path.join(process.cwd(), "client", "src", rawPath),
        path.join(process.cwd(), "server", rawPath),
        path.join(process.cwd(), rawPath.replace(/^client\//, "")),
      ];
      for (const candidate of candidates) {
        try {
          const content = await fs.readFile(candidate, "utf8");
          fileContent = content.slice(0, 4000);
          resolvedFilePath = path.relative(process.cwd(), candidate).replace(/\\/g, "/");
          break;
        } catch { /* try next */ }
      }
    }

    const prompt = `You are an expert TypeScript/React/Node.js developer reviewing a production error in a KiyuMart e-commerce platform (React 18 + Vite frontend, Express + TypeScript backend, PostgreSQL + Drizzle ORM, Socket.IO, Paystack payments).

**Error:** ${title || "Unknown error"}
**Type:** ${issueType || "N/A"}
**Location (culprit):** ${culprit || "Unknown"}

**Stack trace:**
\`\`\`
${stacktrace || "No stack trace available"}
\`\`\`

${resolvedFilePath ? `**Current file content (${resolvedFilePath}):**\n\`\`\`typescript\n${fileContent}\n\`\`\`` : ""}

Analyze this error and provide a specific fix. Respond with ONLY a valid JSON object (no markdown, no extra text):
{
  "file": "relative/path/to/file.ts",
  "explanation": "2-3 sentence explanation of why this error occurs and what the fix does",
  "originalCode": "the exact code snippet to replace (copy from file content above if available)",
  "fixedCode": "the corrected replacement code",
  "safe": true or false (true = auto-apply safe, false = requires manual review),
  "confidence": "high" | "medium" | "low"
}`;

    try {
      const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const aiData = await aiRes.json() as any;
      const text: string = aiData.content?.[0]?.text || "";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          return res.json({ success: true, fix: { ...parsed, resolvedFilePath } });
        } catch { /* fall through */ }
      }
      res.json({ success: true, fix: { explanation: text, file: resolvedFilePath || culprit, safe: false, confidence: "low" } });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // APPLY AI FIX TO FILE  (Task 8.3)
  // ─────────────────────────────────────────────────────────────────────────────
  app.post("/api/admin/apply-fix", requireAuth, requireRole("super_admin"), async (req: AuthRequest, res) => {
    const { file, originalCode, fixedCode } = req.body as { file?: string; originalCode?: string; fixedCode?: string };
    if (!file || !fixedCode) return res.status(400).json({ error: "file and fixedCode are required" });

    const normalizedPath = (file as string).replace(/\\/g, "/").replace(/^\/+/, "");
    const allowedPrefixes = ["client/src/", "server/"];
    if (!allowedPrefixes.some((p) => normalizedPath.startsWith(p))) {
      return res.status(403).json({ error: "File path is outside the allowed source directories" });
    }

    const fullPath = path.join(process.cwd(), normalizedPath);
    try {
      const currentContent = await fs.readFile(fullPath, "utf8");

      let updatedContent: string;
      if (originalCode && currentContent.includes(originalCode.trim())) {
        updatedContent = currentContent.replace(originalCode.trim(), fixedCode.trim());
      } else {
        // originalCode not found (file may have changed) — treat fixedCode as full replacement if it looks complete
        if (fixedCode.length < 50) return res.status(400).json({ error: "Cannot locate original code in file — please apply manually" });
        updatedContent = fixedCode;
      }

      await fs.writeFile(fullPath, updatedContent, "utf8");

      // Optionally trigger a Render deploy hook
      const deployHook = process.env.RENDER_DEPLOY_HOOK_URL;
      let redeployTriggered = false;
      if (deployHook) {
        fetch(deployHook, { method: "POST" }).catch(() => {});
        redeployTriggered = true;
      }

      console.info(`[APPLY-FIX] Applied AI fix to ${normalizedPath} by ${req.user!.email}`);
      res.json({ success: true, file: normalizedPath, redeployTriggered });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}






