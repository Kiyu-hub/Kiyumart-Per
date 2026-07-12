import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import fs from "fs";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log, DIST_PUBLIC_PATH } from "./vite";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { captureApiActivity } from "./observability";

const app = express();
let processLevelGuardsInstalled = false;
let frontendReady = false;

function installProcessLevelGuards() {
  if (processLevelGuardsInstalled) return;
  processLevelGuardsInstalled = true;

  process.on("unhandledRejection", (reason) => {
    console.error("[PROCESS] Unhandled promise rejection:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[PROCESS] Uncaught exception:", error?.stack || error?.message || error);
  });

  process.on("warning", (warning) => {
    console.warn("[PROCESS] Warning:", warning?.stack || warning?.message || warning);
  });
}

installProcessLevelGuards();

// Request logging middleware - placed first to capture all requests including health checks
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;
  const verboseApiLogs = process.env.API_VERBOSE_LOGS === "true";

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    if (res.headersSent || res.writableEnded) {
      log(`[warn] Suppressed late JSON response for ${req.method} ${path}`);
      return res;
    }
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    const isApiPath = path.startsWith("/api");
    const isErrorStatus = res.statusCode >= 400;
    const isNoisyPollPath =
      path === "/api/platform-settings" ||
      path === "/api/settings" ||
      path === "/api/homepage/promotional" ||
      path === "/api/notifications/unread-count" ||
      path.startsWith("/api/presence") ||
      path === "/api/auth/me";

    // Keep errors visible, but suppress high-frequency successful polling logs by default.
    if (!isApiPath && !isErrorStatus) return;
    if (isApiPath && !verboseApiLogs && !isErrorStatus) {
      if (isNoisyPollPath) return;
      if (duration < 800) return;
    }

    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if ((verboseApiLogs || isErrorStatus) && isApiPath && capturedJsonResponse) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    }

    if (logLine.length > 200) {
      logLine = logLine.slice(0, 199) + "…";
    }

    log(logLine);

    if (isApiPath) {
      void captureApiActivity({
        method: req.method,
        path,
        statusCode: res.statusCode,
        duration,
        actorId: (req as any)?.user?.id || null,
        actorRole: (req as any)?.user?.role || null,
      }).catch((error) => {
        console.warn("[OBSERVABILITY] Failed to capture API activity:", (error as any)?.message || error);
      });
    }
  });

  next();
});

// CORS configuration for separated frontend/backend
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:5001',
  'http://localhost:5173',
  'http://127.0.0.1:5000',
  'http://127.0.0.1:5001',
  'http://127.0.0.1:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// Gzip compress all responses — reduces payload size 60-80%
app.use(compression());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, be permissive so Vite client and headless browsers can load dev assets
    if (process.env.NODE_ENV !== 'production') return callback(null, true);

    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      return callback(null, true);
    }
    // In production, ONLY allow exact Netlify domain to prevent subdomain takeovers
    if (process.env.NODE_ENV === 'production') {
      if (origin === 'https://kiyumart.netlify.app') {
        return callback(null, true);
      }
    } else {
      // In development, allow any *.netlify.app for flexibility
      if (origin.includes('.netlify.app')) {
        return callback(null, true);
      }
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Cookie'],
}));

// Configure Helmet for security headers
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com", "https://meet.jit.si"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com", "fonts.googleapis.com", "https://meet.jit.si"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      connectSrc: ["'self'", "https:", "wss:", "https://meet.jit.si", "wss://meet.jit.si"],
      workerSrc: ["'self'", "blob:"],
      childSrc: ["'self'", "blob:", "https://meet.jit.si"],
      frameSrc: ["'self'", "https://meet.jit.si"],
    },
  } : false,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
  frameguard: { action: 'sameorigin' },
  noSniff: true,
  xssFilter: true,
  // Disable COEP — Jitsi iframe requires cross-origin resources without CORP headers
  crossOriginEmbedderPolicy: false,
}));

// During development remove any CSP headers that could block Vite's inline preamble
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    // Some middleware (or reverse proxies) may add CSP headers; ensure dev doesn't block inline scripts
    res.removeHeader('Content-Security-Policy');
    res.removeHeader('Content-Security-Policy-Report-Only');
    next();
  });
}

// Add request timeout handling (30 seconds)
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    if (res.headersSent || res.writableEnded) return;
    res.locals.requestTimedOut = true;
    res.status(408).json({ error: "Request timeout after 30 seconds" });
  });
  next();
});

app.use((req, res, next) => {
  if (frontendReady) return next();
  if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/socket.io")) return next();
  if (req.method !== "GET" && req.method !== "HEAD") return next();

  res
    .status(503)
    .type("html")
    .send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="refresh" content="2" />
    <title>Loading KiyuMart</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #e5e7eb; font-family: Arial, sans-serif; }
      .card { max-width: 420px; padding: 24px 28px; border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; background: rgba(15, 23, 42, 0.92); text-align: center; box-shadow: 0 20px 45px rgba(0,0,0,0.35); }
      .spinner { width: 32px; height: 32px; margin: 0 auto 16px; border: 3px solid rgba(255,255,255,0.18); border-top-color: #10b981; border-radius: 999px; animation: spin 0.9s linear infinite; }
      h1 { margin: 0 0 10px; font-size: 22px; }
      p { margin: 0; color: #cbd5e1; line-height: 1.5; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="spinner"></div>
      <h1>Loading KiyuMart</h1>
      <p>Please wait a moment. This page will reload automatically when everything is ready.</p>
    </div>
    <script>
      setTimeout(function () { window.location.reload(); }, 1800);
    </script>
  </body>
</html>`);
});

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
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

// Health check endpoint for Render + Supabase Heartbeat
app.get('/api/health', async (_req, res) => {
  const startedAt = Date.now();
  try {
    await withTimeout(db.execute(sql`SELECT 1`), 3000, "Database health check");
    const duration = Date.now() - startedAt;

    res.json({
      status: 'ok',
      database: 'connected',
      latency: `${duration}ms`,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    const duration = Date.now() - startedAt;
    console.error("Health check failed:", error);
    res.status(503).json({
      status: 'degraded',
      database: 'disconnected',
      latency: `${duration}ms`,
      message: error?.message || 'Database unavailable',
      timestamp: new Date().toISOString(),
    });
  }
});

// Trust proxy - Required for rate limiting behind Replit's proxy
// Trust only first proxy (Replit's reverse proxy) for security
// See: https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', 1);

// Role-aware rate limiting - Different limits based on user role
// Uses IP-based keying (IPv6-safe by default) with role-based quotas
const rateLimitJsonHandler = (message: string) => (_req: any, res: any) => {
  res.status(429).json({ error: message, userMessage: message });
};

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Extract user role from JWT token for role-based limits
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('[FATAL] JWT_SECRET not configured. This is required in production.');
        }
        const decoded = jwt.verify(token, secret) as any;
        
        // Role-based limits (per IP address)
        switch (decoded.role) {
          case 'super_admin':
          case 'admin':
            return 1000; // Admins: 1000 requests per 15 min per IP
          case 'seller':
          case 'rider':
            return 500; // Sellers/riders: 500 requests per 15 min per IP
          case 'agent':
            return 300; // Agents: 300 requests per 15 min per IP
          default:
            return 100; // Buyers: 100 requests per 15 min per IP
        }
      } catch {
        // Invalid token - treat as anonymous
        return 100;
      }
    }
    return 100; // Anonymous: 100 requests per 15 min per IP
  },
  // No custom keyGenerator - use library's default IPv6-safe IP-based keying
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler('Too many requests, please try again later.'),
  skip: (req) => {
    // Skip rate limiting for static assets
    return req.path.startsWith('/attached_assets') || !req.path.startsWith('/api');
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login/register attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitJsonHandler('Too many login attempts. Please wait 15 minutes and try again.'),
});

// Stricter rate limiting for auth routes (applied first)
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Role-aware rate limiting for all API routes
app.use('/api', apiLimiter);

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '10mb',
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '10mb', extended: false }));
app.use(cookieParser());

(async () => {
  // Backward-compatible schema self-heal for environments missing latest migration.
  // Probe DB first — if Neon is cold, fail fast and skip all migrations so the
  // server can start immediately rather than hanging for 30+ seconds per statement.
  let schemaHealEnabled = false;
  try {
    await withTimeout(db.execute(sql`SELECT 1`), 8000, "startup DB ping");
    schemaHealEnabled = true;
  } catch {
    console.warn("[STARTUP] DB not reachable on startup — skipping schema self-heal. Server will start without it.");
  }

  if (schemaHealEnabled)
  try {
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'pickup_agent'
            AND enumtypid = 'user_role'::regtype
        ) THEN
          ALTER TYPE user_role ADD VALUE 'pickup_agent';
        END IF;
      END $$;
    `);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role user_role`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS users_requested_role_idx ON users(requested_role)`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_admin_operations_panels boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ads_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hero_banner_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sidebar_ad_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_ad_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_page_ad_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS is_external_rider_system_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS restaurants_enabled boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_checkout_delivery_map boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_pickup_agent_admin_chat boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_seller_direct_support_messages boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allow_rider_registration boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_homepage_featured_section boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_homepage_new_arrival_section boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ALTER COLUMN ads_enabled SET DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ALTER COLUMN hero_banner_enabled SET DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ALTER COLUMN sidebar_ad_enabled SET DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ALTER COLUMN footer_ad_enabled SET DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ALTER COLUMN product_page_ad_enabled SET DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ALTER COLUMN allow_rider_registration SET DEFAULT false`);
    await db.execute(sql`UPDATE platform_settings SET ads_enabled = false WHERE ads_enabled IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET hero_banner_enabled = false WHERE hero_banner_enabled IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET sidebar_ad_enabled = false WHERE sidebar_ad_enabled IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET footer_ad_enabled = false WHERE footer_ad_enabled IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET product_page_ad_enabled = false WHERE product_page_ad_enabled IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET allow_rider_registration = false WHERE allow_rider_registration IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET is_external_rider_system_enabled = false WHERE is_external_rider_system_enabled IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET allow_seller_direct_support_messages = true WHERE allow_seller_direct_support_messages IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET show_homepage_featured_section = true WHERE show_homepage_featured_section IS NULL`);
    await db.execute(sql`UPDATE platform_settings SET show_homepage_new_arrival_section = true WHERE show_homepage_new_arrival_section IS NULL`);
    await db.execute(sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS images text[]`);
    await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS variant_id varchar`);
    await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_color varchar`);
    await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_size varchar`);
    await db.execute(sql`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS selected_image_index integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS entity_kind text DEFAULT 'delivery_zone'`);
    await db.execute(sql`UPDATE delivery_zones SET entity_kind = 'delivery_zone' WHERE entity_kind IS NULL`);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'external_dispatch_arranged'
            AND enumtypid = 'order_status'::regtype
        ) THEN
          ALTER TYPE order_status ADD VALUE 'external_dispatch_arranged';
        END IF;
      END $$;
    `);
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'packaged'
            AND enumtypid = 'order_status'::regtype
        ) THEN
          ALTER TYPE order_status ADD VALUE 'packaged';
        END IF;
      END $$;
    `);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_delivery_by_bus boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE orders ADD COLUMN IF NOT EXISTS external_delivery_type varchar(32)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS promotion_applications (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type promo_type NOT NULL,
        target_id varchar NOT NULL,
        target_name text NOT NULL,
        duration_type varchar NOT NULL,
        duration integer NOT NULL,
        unit_price decimal(10, 2) NOT NULL,
        total_price decimal(10, 2) NOT NULL,
        seller_note text,
        customer_service_note text,
        status varchar(40) NOT NULL DEFAULT 'pending_payment',
        payment_confirmed boolean DEFAULT false,
        payment_confirmed_at timestamp,
        payment_confirmed_by varchar REFERENCES users(id) ON DELETE SET NULL,
        approved_at timestamp,
        approved_by varchar REFERENCES users(id) ON DELETE SET NULL,
        rejected_at timestamp,
        rejected_by varchar REFERENCES users(id) ON DELETE SET NULL,
        rejection_reason text,
        created_promotion_id varchar REFERENCES promotional_ads(id) ON DELETE SET NULL,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS promotion_applications_seller_id_idx ON promotion_applications(seller_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS promotion_applications_status_idx ON promotion_applications(status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS promotion_applications_created_promotion_id_idx ON promotion_applications(created_promotion_id)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS report_activity_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        requested_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        requester_role user_role NOT NULL,
        report_type text NOT NULL,
        action text NOT NULL,
        format text,
        status text DEFAULT 'success',
        report_id text,
        scope jsonb DEFAULT '{}'::jsonb,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS report_activity_logs_requested_by_idx ON report_activity_logs(requested_by)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS report_activity_logs_requester_role_idx ON report_activity_logs(requester_role)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS report_activity_logs_report_type_idx ON report_activity_logs(report_type)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS report_activity_logs_created_at_idx ON report_activity_logs(created_at)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS system_activity_logs (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        category text NOT NULL,
        severity text NOT NULL DEFAULT 'info',
        title text NOT NULL,
        message text NOT NULL,
        human_explanation text,
        root_cause text,
        suggested_fix text,
        preventive_action text,
        source text,
        entity_type text,
        entity_id text,
        actor_id varchar REFERENCES users(id) ON DELETE SET NULL,
        actor_role user_role,
        fingerprint text,
        occurrence_count integer NOT NULL DEFAULT 1,
        is_resolved boolean NOT NULL DEFAULT false,
        first_seen_at timestamp DEFAULT now(),
        last_seen_at timestamp DEFAULT now(),
        resolved_at timestamp,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS system_activity_logs_category_idx ON system_activity_logs(category)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS system_activity_logs_severity_idx ON system_activity_logs(severity)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS system_activity_logs_is_resolved_idx ON system_activity_logs(is_resolved)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS system_activity_logs_fingerprint_idx ON system_activity_logs(fingerprint)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS system_activity_logs_last_seen_at_idx ON system_activity_logs(last_seen_at)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS system_activity_logs_created_at_idx ON system_activity_logs(created_at)`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS receipts (
        id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        receipt_number text NOT NULL UNIQUE,
        order_id varchar NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
        generated_by varchar REFERENCES users(id),
        generated_by_role user_role,
        trigger text NOT NULL DEFAULT 'payment_success',
        status text NOT NULL DEFAULT 'generated',
        payload jsonb DEFAULT '{}'::jsonb,
        created_at timestamp DEFAULT now(),
        updated_at timestamp DEFAULT now()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS receipts_order_id_idx ON receipts(order_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS receipts_generated_by_idx ON receipts(generated_by)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS receipts_updated_at_idx ON receipts(updated_at)`);
    // Phase 4 — seller upgrade plans, promo self-service, delivery commission, referral reward
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_a_price decimal(10,2) DEFAULT 15`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_a_slots integer DEFAULT 10`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_b_price decimal(10,2) DEFAULT 40`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS upgrade_plan_c_price decimal(10,2) DEFAULT 100`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS delivery_fee_commission decimal(10,2) DEFAULT 0`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_reward_percent decimal(5,2) DEFAULT 10`);
    // Heal: existing rows that still have the 0 default (never explicitly set) get bumped to 10
    await db.execute(sql`UPDATE platform_settings SET referral_reward_percent = 10 WHERE referral_reward_percent = 0 OR referral_reward_percent IS NULL`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_upgrade_plan text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_plan_expires_at timestamp`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_bonus_slots integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE promotion_applications ADD COLUMN IF NOT EXISTS paystack_reference text`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS cloudinary_accounts text`);
    // Referral programme
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_enabled boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_enabled_single_store boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_enabled_multi_vendor boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_customer_threshold integer DEFAULT 5`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_seller_threshold integer DEFAULT 10`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS referral_seller_promo_hours integer DEFAULT 24`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code text`);
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_referral_notification_at timestamp`);
    // Admin permissions extended columns
    await db.execute(sql`ALTER TABLE admin_permissions ADD COLUMN IF NOT EXISTS can_manage_payouts boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE admin_permissions ADD COLUMN IF NOT EXISTS can_view_payouts boolean DEFAULT true`);
    await db.execute(sql`ALTER TABLE admin_permissions ADD COLUMN IF NOT EXISTS can_manage_features boolean DEFAULT false`);
    // GA4 Data API + Sentry API credentials stored in DB
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS ga4_property_id text`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS google_credentials_json text`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_auth_token text`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_org text`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sentry_project text`);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'referrals') THEN
          CREATE TABLE referrals (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            referrer_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            referred_user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            status text NOT NULL DEFAULT 'signed_up',
            completed_at timestamp,
            created_at timestamp DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals(referrer_id);
          CREATE INDEX IF NOT EXISTS referrals_referred_idx ON referrals(referred_user_id);
        END IF;
      END $$`);
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'referral_rewards') THEN
          CREATE TABLE referral_rewards (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            type text NOT NULL,
            reward_percent decimal(5,2),
            reward_duration_hours integer,
            status text NOT NULL DEFAULT 'pending',
            claimed_at timestamp,
            expires_at timestamp,
            discount_code text UNIQUE,
            promotion_type text,
            promotion_target_id text,
            created_at timestamp DEFAULT now()
          );
          CREATE INDEX IF NOT EXISTS referral_rewards_user_idx ON referral_rewards(user_id);
        END IF;
      END $$`);
    // Advanced features columns (invite-only, operational limits)
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS invite_only_registration boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS order_auto_cancel_hours integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS free_tier_product_limit integer DEFAULT 20`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS max_products_per_seller integer DEFAULT 0`);
    // Upload controls
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS max_upload_size_mb integer DEFAULT 10`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS allowed_upload_types text DEFAULT 'jpg,jpeg,png,webp,gif,avif'`);
    // Frontend URL for password reset emails and payment callbacks
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS frontend_url text`);
    // Suggestions feature toggle
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS suggestions_enabled boolean DEFAULT false`);
    // Refund button visibility
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_refund_button boolean DEFAULT true`);
    // Per-storeType image / label overrides managed by super_admin
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS store_category_overrides jsonb DEFAULT '{}'::jsonb`);
    // Sound & ringtone settings
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS caller_ringtone text DEFAULT 'default'`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS receiver_ringtone text DEFAULT 'default'`);
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS notification_sound text DEFAULT 'default'`);
    // Render deploy hook
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS render_deploy_hook_url text`);
    // Promotion display section
    await db.execute(sql`ALTER TABLE promotional_ads ADD COLUMN IF NOT EXISTS display_section varchar(20) DEFAULT 'homepage'`);
    await db.execute(sql`ALTER TABLE promotion_applications ADD COLUMN IF NOT EXISTS display_section varchar(20) DEFAULT 'homepage'`);
    await db.execute(sql`ALTER TABLE promotional_ads ADD COLUMN IF NOT EXISTS banner_config jsonb`);
    // Group chat
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'group_chat_messages') THEN
          CREATE TABLE group_chat_messages (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            group_name varchar(30) NOT NULL,
            sender_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message text NOT NULL,
            message_type varchar(20) NOT NULL DEFAULT 'text',
            file_url text,
            created_at timestamp DEFAULT now()
          );
          CREATE INDEX group_chat_messages_group_idx ON group_chat_messages(group_name);
          CREATE INDEX group_chat_messages_sender_idx ON group_chat_messages(sender_id);
          CREATE INDEX group_chat_messages_created_at_idx ON group_chat_messages(created_at);
        END IF;
      END $$`);
    // Reported cases
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'reported_cases') THEN
          CREATE TABLE reported_cases (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            reporter_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            reporter_role varchar(30) NOT NULL,
            subject varchar(200) NOT NULL,
            description text NOT NULL,
            priority varchar(20) NOT NULL DEFAULT 'medium',
            status varchar(30) NOT NULL DEFAULT 'open',
            admin_notes text,
            resolved_by varchar REFERENCES users(id),
            created_at timestamp DEFAULT now(),
            updated_at timestamp DEFAULT now()
          );
          CREATE INDEX reported_cases_reporter_idx ON reported_cases(reporter_id);
          CREATE INDEX reported_cases_status_idx ON reported_cases(status);
        END IF;
      END $$`);
    // Suggestions
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'suggestions') THEN
          CREATE TABLE suggestions (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            user_role varchar(30) NOT NULL,
            message text NOT NULL,
            reply text,
            replied_at timestamp,
            created_at timestamp DEFAULT now()
          );
          CREATE INDEX suggestions_user_idx ON suggestions(user_id);
          CREATE INDEX suggestions_created_idx ON suggestions(created_at);
        END IF;
      END $$`);
    // Chat message delete/edit support
    await db.execute(sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS deleted_at timestamp`);
    await db.execute(sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS is_edited boolean DEFAULT false`);
    await db.execute(sql`ALTER TABLE chat_messages ADD COLUMN IF NOT EXISTS edited_at timestamp`);
    // Social commerce & persona fields on stores
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS merchant_category text`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS whatsapp_number text`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS social_links jsonb`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS branding_config jsonb`);
    // Product slug for /p/:slug social commerce pages
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS slug text`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique_idx ON products(slug) WHERE slug IS NOT NULL`);
    // 3D / AR model assets — let sellers attach .glb (Android/Web) and .usdz (iOS)
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS model_url text`);
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS model_url_ios text`);
    await db.execute(sql`ALTER TABLE products ADD COLUMN IF NOT EXISTS model_poster text`);
    // Product modifiers (food add-ons for QUICK_EATS stores)
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'product_modifiers') THEN
          CREATE TABLE product_modifiers (
            id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
            product_id varchar NOT NULL REFERENCES products(id) ON DELETE CASCADE,
            name text NOT NULL,
            options jsonb NOT NULL DEFAULT '[]'::jsonb,
            required boolean DEFAULT false,
            max_selections integer DEFAULT 1,
            created_at timestamp DEFAULT now()
          );
          CREATE INDEX product_modifiers_product_id_idx ON product_modifiers(product_id);
        END IF;
      END $$`);
    // Fix seller_payouts.commission_ids: convert from text (plain UUID) to text[] if not already done
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'seller_payouts'
          AND column_name = 'commission_ids'
          AND data_type = 'text'
        ) THEN
          ALTER TABLE seller_payouts
          ALTER COLUMN commission_ids TYPE text[]
          USING CASE
            WHEN commission_ids IS NULL THEN NULL::text[]
            WHEN commission_ids LIKE '{%}' THEN commission_ids::text[]
            ELSE ARRAY[REPLACE(commission_ids, '"', '')]
          END;
        END IF;
      END $$`);
    // Add platform branding logo columns if they don't exist
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'platform_settings' AND column_name = 'logo_light'
        ) THEN
          ALTER TABLE platform_settings ADD COLUMN logo_light TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'platform_settings' AND column_name = 'logo_dark'
        ) THEN
          ALTER TABLE platform_settings ADD COLUMN logo_dark TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'platform_settings' AND column_name = 'favicon'
        ) THEN
          ALTER TABLE platform_settings ADD COLUMN favicon TEXT;
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'platform_settings' AND column_name = 'secondary_color'
        ) THEN
          ALTER TABLE platform_settings ADD COLUMN secondary_color TEXT DEFAULT '#2c3e50';
        END IF;
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'platform_settings' AND column_name = 'accent_color'
        ) THEN
          ALTER TABLE platform_settings ADD COLUMN accent_color TEXT DEFAULT '#e74c3c';
        END IF;
      END $$`);
    // Cart links table for social commerce cart sharing
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS cart_links (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          token TEXT NOT NULL UNIQUE,
          store_id VARCHAR NOT NULL,
          seller_id VARCHAR NOT NULL,
          items JSONB NOT NULL DEFAULT '[]'::jsonb,
          note TEXT,
          total_amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          expires_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      EXCEPTION WHEN OTHERS THEN NULL;
      END $$`);
    await db.execute(sql`
      DO $$ BEGIN
        ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;
      EXCEPTION WHEN OTHERS THEN NULL; END $$`);
    await db.execute(sql`
      DO $$ BEGIN
        CREATE TABLE IF NOT EXISTS email_otp_verifications (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL,
          email TEXT NOT NULL,
          code TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
      EXCEPTION WHEN OTHERS THEN NULL; END $$`);
    // Stores — business type, location text + coordinates for local vendor/restaurant distance calc
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS business_type text DEFAULT 'store'`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS location text`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS latitude decimal(10,7)`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS longitude decimal(10,7)`);
    // Grandfather existing users as email-verified (they predate the email verification requirement)
    await db.execute(sql`UPDATE users SET email_verified = true WHERE email_verified = false AND created_at < '2026-05-15 00:00:00'::timestamp`);
    // Store verification columns
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'none'`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_doc_front text`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_doc_back text`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_selfie text`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_applied_at timestamp`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_reviewed_at timestamp`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS verification_rejection_reason text`);
    // Bolt-style food storefront columns (Restaurants & Local Vendors page).
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS prep_time_mins integer DEFAULT 15`);
    await db.execute(sql`ALTER TABLE stores ADD COLUMN IF NOT EXISTS min_order_amount decimal(10,2) DEFAULT 0`);
    // Hero banner placement scope + theme color so super admin can target the
    // food vendors page separately from the home page.
    await db.execute(sql`ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS placement text DEFAULT 'home'`);
    await db.execute(sql`ALTER TABLE hero_banners ADD COLUMN IF NOT EXISTS theme_color text`);
    // Global 3D / AR feature toggle on platform_settings.
    await db.execute(sql`ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS enable_3d_ar boolean DEFAULT true`);
    // Per-category dynamic field template (Bolt-style cuisine fields).
    await db.execute(sql`ALTER TABLE categories ADD COLUMN IF NOT EXISTS product_fields_config jsonb`);
    // Cart link mode — "prefilled" (default, locked-in items) vs "browse"
    // (buyer picks from the seller's catalog).
    await db.execute(sql`ALTER TABLE cart_links ADD COLUMN IF NOT EXISTS mode text DEFAULT 'prefilled'`);
    // Variant curation: displayOrder lets sellers re-order chips; isDefault
    // controls which variant a buyer sees first on the product page.
    await db.execute(sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS display_order integer DEFAULT 0`);
    await db.execute(sql`ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_default boolean DEFAULT false`);
    // Variant FK cascade — orphan variant rows when a product is deleted is
    // a data-integrity bug. Drop the old FK and recreate with ON DELETE CASCADE.
    // Postgres requires this dance because ALTER CONSTRAINT can't change the
    // referential action; we drop and re-add idempotently.
    await db.execute(sql`
      DO $$
      DECLARE
        fk_name text;
      BEGIN
        SELECT conname INTO fk_name
          FROM pg_constraint
         WHERE conrelid = 'product_variants'::regclass
           AND contype = 'f'
           AND pg_get_constraintdef(oid) LIKE '%REFERENCES products%';
        IF fk_name IS NOT NULL AND pg_get_constraintdef((SELECT oid FROM pg_constraint WHERE conname = fk_name)) NOT LIKE '%ON DELETE CASCADE%' THEN
          EXECUTE format('ALTER TABLE product_variants DROP CONSTRAINT %I', fk_name);
          ALTER TABLE product_variants
            ADD CONSTRAINT product_variants_product_id_fkey
            FOREIGN KEY (product_id)
            REFERENCES products(id)
            ON DELETE CASCADE;
        END IF;
      END $$;
    `);
    // Add restaurant to store_type enum
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'restaurant' AND enumtypid = 'store_type'::regtype
        ) THEN
          ALTER TYPE store_type ADD VALUE 'restaurant';
        END IF;
      END $$;
    `);
  } catch (e: any) {
    console.warn("[STARTUP] Could not run schema self-heal compatibility checks:", e?.message || String(e));
  } // end if (schemaHealEnabled)

  // Validate frontend URL on startup
  try {
    const { validateFrontendUrlOnStartup } = await import('./frontendUrlResolver');
    await validateFrontendUrlOnStartup();
  } catch (e) {
    console.warn('[STARTUP] Could not validate frontend URL:', (e as any)?.message ?? String(e));
    console.log('[STARTUP] Will fall back to localhost for payment redirects');
  }

  const server = await registerRoutes(app);

  if (schemaHealEnabled) {
    try {
      const { storage } = await import("./storage");
      await storage.getPlatformSettings();
      console.log("[BOOT] Warmed platform settings cache");
    } catch (e) {
      console.warn("[BOOT] Could not warm platform settings cache:", (e as any)?.message ?? String(e));
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT.
  // Default to 5000 for local development.
  // This starts the API immediately even if optional DB bootstrap tasks are still running.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST || '0.0.0.0';
  server.on("error", (err: any) => {
    if (server.listening) {
      console.error("[BOOT] Runtime server error:", err?.stack || err?.message || err);
      return;
    }
    if (err?.code === "EADDRINUSE") {
      console.error(`[BOOT] Port ${port} is already in use. Stop the existing server process or use a different PORT.`);
    } else {
      console.error("[BOOT] Server failed to start:", err?.message || err);
    }
    process.exit(1);
  });
  server.listen(port, host, () => {
    log(`serving on ${host}:${port}`);
  });

  // Seed default role features and footer defaults in the background so they never
  // delay Vite startup. Both are non-critical and safe to run after the server is live.
  void (async () => {
  try {
    const { storage } = await import('./storage');
    const roleDefaults: Record<string, Record<string, boolean>> = {
      super_admin: {
        canManageUsers: true,
        canManageProducts: true,
        canManageOrders: true,
        canManageStores: true,
        canManageCategories: true,
        canManageAdmins: true,
        canEditPasswords: true,
        canManageRoles: true,
        canManagePlatformSettings: true,
        canViewAnalytics: true,
        canManagePromotions: true,
        canManageReviews: true,
        canManagePayouts: true,
        canViewPayouts: true,
        canManageFeatures: true,
      },
      admin: {
        "products.viewAll": true,
        "orders.view": true,
        "orders.manage": true,
        "users.view": true,
        "users.approve": true,
        "settings.view": true,
        "settings.edit": true,
        "analytics.view": true,
        "promotions.manage": true,
        "reviews.manage": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "support.manage": true,
        "profile.manage": true,
        "maps.view": true,
      },
      seller: {
        "orders.create": true,
        "products.create": true,
        "products.edit": true,
        "products.delete": true,
        "orders.view": true,
        "orders.manage": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "store.manage": true,
        "payouts.request": true,
        "promotions.manage": true,
        "reviews.manage": true,
        "analytics.view": true,
        "profile.manage": true,
        "maps.view": true,
      },
      rider: {
        "orders.view": true,
        "deliveries.view": true,
        "deliveries.manage": true,
        "tracking.update": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "earnings.view": true,
        "profile.manage": true,
        "maps.view": true,
      },
      pickup_agent: {
        "orders.view": true,
        "support.view": true,
        "profile.manage": true,
      },
      agent: {
        "orders.view": true,
        "users.view": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "support.manage": true,
        "profile.manage": true,
        "maps.view": true,
      },
      buyer: {
        "orders.create": true,
        "orders.view": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "wishlist.manage": true,
        "profile.manage": true,
        "maps.view": true,
      },
    };

    for (const [role, features] of Object.entries(roleDefaults)) {
      const existing = await storage.getRoleFeatures(role);
      if (!existing || existing.length === 0) {
        await storage.updateRoleFeatures(role, features, "system");
      }
    }
    console.log('[BOOT] Ensured default role features exist for all roles');
  } catch (e) {
    console.warn('[BOOT] Could not seed role feature defaults:', (e as any)?.message ?? String(e));
  }

  // Auto-populate default footer items into DB so they're editable from admin
  try {
    const { storage } = await import('./storage');
    const existing = await storage.getAllFooterPages();
    const existingGroups = new Set(existing.map((p: any) => p.group || 'general'));
    const keyGroups = ['trust_bar', 'quick_links', 'customer_service', 'legal'];
    const missingGroups = keyGroups.filter(g => !existingGroups.has(g));

    if (missingGroups.length > 0) {
      const allDefaults = [
        // Trust Bar
        { title: 'Fast Delivery', slug: 'fast-delivery', content: 'Nationwide shipping', url: '', group: 'trust_bar', storeMode: 'both', displayOrder: 0, isActive: true, openInNewTab: false },
        { title: 'Secure Shopping', slug: 'secure-shopping', content: '100% protected payments', url: '', group: 'trust_bar', storeMode: 'both', displayOrder: 1, isActive: true, openInNewTab: false },
        { title: 'Easy Payments', slug: 'easy-payments', content: 'Mobile money & cards', url: '', group: 'trust_bar', storeMode: 'both', displayOrder: 2, isActive: true, openInNewTab: false },
        { title: '24/7 Support', slug: '247-support', content: 'Always here to help', url: '', group: 'trust_bar', storeMode: 'both', displayOrder: 3, isActive: true, openInNewTab: false },
        // Quick Links (both modes)
        { title: 'Home', slug: 'home-link', content: '', url: '/', group: 'quick_links', storeMode: 'both', displayOrder: 0, isActive: true, openInNewTab: false },
        { title: 'All Products', slug: 'all-products', content: '', url: '/products', group: 'quick_links', storeMode: 'both', displayOrder: 1, isActive: true, openInNewTab: false },
        // Quick Links (multi-vendor only)
        { title: 'Browse Stores', slug: 'browse-stores', content: '', url: '/stores', group: 'quick_links', storeMode: 'multivendor', displayOrder: 2, isActive: true, openInNewTab: false },
        { title: 'Become a Seller', slug: 'become-seller', content: '', url: '/become-seller', group: 'quick_links', storeMode: 'multivendor', displayOrder: 3, isActive: true, openInNewTab: false },
        { title: 'Become a Rider', slug: 'become-rider', content: '', url: '/become-rider', group: 'quick_links', storeMode: 'multivendor', displayOrder: 4, isActive: true, openInNewTab: false },
        // Customer Service
        { title: 'Customer Support', slug: 'customer-support', content: '', url: '/support', group: 'customer_service', storeMode: 'both', displayOrder: 0, isActive: true, openInNewTab: false },
        { title: 'Track My Order', slug: 'track-order', content: '', url: '/orders', group: 'customer_service', storeMode: 'both', displayOrder: 1, isActive: true, openInNewTab: false },
        { title: 'My Wishlist', slug: 'my-wishlist', content: '', url: '/wishlist', group: 'customer_service', storeMode: 'both', displayOrder: 2, isActive: true, openInNewTab: false },
        { title: 'My Account', slug: 'my-account', content: '', url: '/profile', group: 'customer_service', storeMode: 'both', displayOrder: 3, isActive: true, openInNewTab: false },
        // Legal
        { title: 'Privacy Policy', slug: 'privacy-policy', content: '<h1>Privacy Policy</h1><p>Your privacy is important to us.</p>', url: '', group: 'legal', storeMode: 'both', displayOrder: 0, isActive: true, openInNewTab: false },
        { title: 'Terms of Service', slug: 'terms-of-service', content: '<h1>Terms of Service</h1><p>By using this platform, you agree to our terms.</p>', url: '', group: 'legal', storeMode: 'both', displayOrder: 1, isActive: true, openInNewTab: false },
        { title: 'Return Policy', slug: 'return-policy', content: '<h1>Return Policy</h1><p>We accept returns within 7 days of delivery.</p>', url: '', group: 'legal', storeMode: 'both', displayOrder: 2, isActive: true, openInNewTab: false },
      ];

      const existingSlugs = new Set(existing.map((p: any) => p.slug));
      const toInsert = allDefaults.filter(d => missingGroups.includes(d.group!) && !existingSlugs.has(d.slug));
      let created = 0;
      for (const item of toInsert) {
        try {
          await storage.createFooterPage(item);
          created++;
        } catch (e: any) {
          // Skip duplicates
        }
      }
      console.log(`[BOOT] Populated ${created} default footer items for sections: ${missingGroups.join(', ')}`);
    } else {
      console.log('[BOOT] All footer sections already populated');
    }
  } catch (e) {
    console.warn('[BOOT] Could not populate footer defaults:', (e as any)?.message ?? String(e));
  }
  })(); // end background boot tasks

  // Global Error Handler - Must be after all routes
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log error details for debugging (in production, use proper logging service)
    console.error('[ERROR]', {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status,
      message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      user: (req as any).user?.id || 'anonymous'
    });

    // Send appropriate error response
    res.status(status).json({ 
      error: message,
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  });

  // Serve static files from attached_assets directory
  app.use("/attached_assets", express.static(path.resolve(import.meta.dirname, "..", "attached_assets")));
  // Serve local fallback uploads used when external media provider is unavailable.
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  // Importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes.
  // We start listening first so API/health endpoints stay responsive
  // even if the frontend dev middleware takes time to initialize.
  const useEmbeddedVite =
    app.get("env") === "development" &&
    process.env.KIYUMART_USE_EMBEDDED_VITE !== "false";

  if (useEmbeddedVite) {
    try {
      await setupVite(app, server);
      frontendReady = true;

      // In development, Vite's HMR injects inline scripts which can be blocked by strict CSP.
      // Set a permissive CSP for dev to allow inline and eval needed by dev tools.
      app.use((req, res, next) => {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self';"
        );
        next();
      });
    } catch (viteError: any) {
      console.error("[BOOT] Vite dev middleware failed; continuing without crashing the backend:", viteError?.message || viteError);
      console.error("[BOOT] Refusing to serve a stale built frontend in development. Fix the Vite startup error and restart.");
      app.use("*", (req, res) => {
        if (req.originalUrl.startsWith("/api") || req.originalUrl.startsWith("/socket.io")) {
          res.status(404).json({ error: `API route not found: ${req.method} ${req.originalUrl}` });
          return;
        }

        if (req.method !== "GET" && req.method !== "HEAD") {
          res.status(404).end();
          return;
        }

        res.status(503).type("html").send(`<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>KiyuMart Dev Server Error</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; color: #e5e7eb; font-family: Arial, sans-serif; }
      .card { max-width: 560px; padding: 24px 28px; border: 1px solid rgba(255,255,255,0.1); border-radius: 18px; background: rgba(15, 23, 42, 0.92); box-shadow: 0 20px 45px rgba(0,0,0,0.35); }
      h1 { margin: 0 0 12px; font-size: 22px; }
      p { margin: 0 0 10px; color: #cbd5e1; line-height: 1.5; }
      code { color: #86efac; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Frontend Dev Server Failed To Start</h1>
      <p>KiyuMart will not serve an old built frontend in development anymore.</p>
      <p>Restart with <code>npx tsx server/index.ts</code> after fixing the Vite startup issue.</p>
    </div>
  </body>
</html>`);
      });
    }
  } else {
    serveStatic(app);
    frontendReady = true;
  }

  // Start payout worker
  try {
    const { runPayoutWorker } = await import('./workers/payoutWorker');
    // Pass io if available via registerRoutes; try to import io via routes module if exported
    runPayoutWorker();
    console.log('[BOOT] Payout worker started');
  } catch (e) {
    console.warn('[BOOT] Could not start payout worker:', (e as any)?.message ?? String(e));
  }

  // Start promotional ads worker (optional)
  try {
    const { runPromotionalWorker } = await import('./workers/promotionalWorker');
    runPromotionalWorker();
    console.log('[BOOT] Promotional ads worker started');
  } catch (e) {
    console.warn('[BOOT] Could not start promotional worker:', (e as any)?.message ?? String(e));
  }

  // Start order auto-cancel worker (optional — only active when orderAutoCancelHours > 0)
  try {
    const { runOrderAutoCancelWorker } = await import('./workers/orderAutoCancelWorker');
    runOrderAutoCancelWorker();
  } catch (e) {
    console.warn('[BOOT] Could not start order auto-cancel worker:', (e as any)?.message ?? String(e));
  }

  // Start notification reminder worker (5-hr payment reminders + interview reminders)
  try {
    const { runNotificationReminderWorker } = await import('./workers/notificationReminderWorker');
    runNotificationReminderWorker();
  } catch (e) {
    console.warn('[BOOT] Could not start notification reminder worker:', (e as any)?.message ?? String(e));
  }

})().catch((error) => {
  console.error("[BOOT] Fatal bootstrap error:", error?.stack || error?.message || error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.info("[SHUTDOWN] SIGTERM received — shutting down gracefully");
  setTimeout(() => process.exit(0), 8000).unref();
});
process.on("SIGINT", () => {
  console.info("[SHUTDOWN] SIGINT received — shutting down gracefully");
  setTimeout(() => process.exit(0), 8000).unref();
});
