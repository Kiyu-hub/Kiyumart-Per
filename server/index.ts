import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { db } from "../db";
import { sql } from "drizzle-orm";

const app = express();

// Request logging middleware - placed first to capture all requests including health checks
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;

    // Verbose logging: always log requests with errors (4xx/5xx), and
    // also log API responses to capture useful JSON payloads for debugging.
    if (!path.startsWith("/api") && res.statusCode < 400) return;

    let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
    if (path.startsWith("/api") && capturedJsonResponse) {
      logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
    }

    if (logLine.length > 200) {
      logLine = logLine.slice(0, 199) + "…";
    }

    log(logLine);
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

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);

    // In development, be permissive so Vite client and headless browsers can load dev assets
    if (process.env.NODE_ENV !== 'production') return callback(null, true);

    if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace(/\/$/, '')))) {
      return callback(null, true);
    }
    // In production, also allow any netlify.app subdomain
    if (origin.includes('.netlify.app')) {
      return callback(null, true);
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
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      fontSrc: ["'self'", "fonts.gstatic.com"],
      connectSrc: ["'self'", "https:"],
    },
  } : undefined,
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : undefined,
  frameguard: { action: 'deny' },
  noSniff: true,
  xssFilter: true,
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
    res.status(408).json({ error: "Request timeout after 30 seconds" });
  });
  next();
});

// Health check endpoint for Render + Supabase Heartbeat
app.get('/api/health', async (_req, res) => {
  try {
    const start = Date.now();
    // This pokes Supabase to keep it from pausing
    await db.execute(sql`SELECT 1`);
    const duration = Date.now() - start;

    res.json({ 
      status: 'ok', 
      database: 'connected',
      latency: `${duration}ms`,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      timestamp: new Date().toISOString() 
    });
  }
});

// Trust proxy - Required for rate limiting behind Replit's proxy
// Trust only first proxy (Replit's reverse proxy) for security
// See: https://expressjs.com/en/guide/behind-proxies.html
app.set('trust proxy', 1);

// Security Headers - Helmet.js
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));

// Role-aware rate limiting - Different limits based on user role
// Uses IP-based keying (IPv6-safe by default) with role-based quotas
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    // Extract user role from JWT token for role-based limits
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as any;
        
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
  message: 'Too many requests, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for static assets
    return req.path.startsWith('/attached_assets') || !req.path.startsWith('/api');
  }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 login/register attempts per windowMs
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
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
  try {
    await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS requested_role user_role`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS users_requested_role_idx ON users(requested_role)`);
  } catch (e: any) {
    console.warn("[STARTUP] Could not ensure users.requested_role compatibility:", e?.message || String(e));
  }

  // Validate frontend URL on startup
  try {
    const { validateFrontendUrlOnStartup } = await import('./frontendUrlResolver');
    await validateFrontendUrlOnStartup();
  } catch (e) {
    console.warn('[STARTUP] Could not validate frontend URL:', (e as any)?.message ?? String(e));
    console.log('[STARTUP] Will fall back to localhost for payment redirects');
  }

  const server = await registerRoutes(app);

  // Seed default role features on startup (without overriding existing custom config)
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
      },
      seller: {
        "products.create": true,
        "products.edit": true,
        "products.delete": true,
        "orders.view": true,
        "orders.manage": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "support.manage": true,
        "store.manage": true,
        "payouts.request": true,
        "promotions.manage": true,
        "reviews.manage": true,
        "analytics.view": true,
      },
      rider: {
        "orders.view": true,
        "deliveries.view": true,
        "deliveries.manage": true,
        "tracking.update": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "support.manage": true,
        "earnings.view": true,
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
      },
      buyer: {
        "orders.create": true,
        "orders.view": true,
        "messages.view": true,
        "messages.send": true,
        "support.view": true,
        "support.manage": true,
        "wishlist.manage": true,
        "profile.manage": true,
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

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);

    // In development, Vite's HMR injects inline scripts which can be blocked by strict CSP.
    // Set a permissive CSP for dev to allow inline and eval needed by dev tools.
    app.use((req, res, next) => {
      // Allow inline scripts and eval in dev for the local dev server only.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self';"
      );
      next();
    });
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT.
  // Default to 5000 for local development.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  const host = process.env.HOST || '0.0.0.0';
  server.on("error", (err: any) => {
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
})();
