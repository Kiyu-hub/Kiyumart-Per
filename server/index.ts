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
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

// CORS configuration for separated frontend/backend
const allowedOrigins = [
  'http://localhost:5000',
  'http://localhost:5173',
  process.env.FRONTEND_URL,  // Netlify URL
].filter(Boolean) as string[];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
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
  const server = await registerRoutes(app);

  // Ensure super_admin has all role features on startup
  try {
    const { storage } = await import('./storage');
    const superAdminFeatures: Record<string, boolean> = {
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
    };
    await storage.updateRoleFeatures('super_admin', superAdminFeatures, 'system');
    console.log('[BOOT] Ensured super_admin role features are set');
  } catch (e) {
    console.warn('[BOOT] Could not seed super_admin role features:', (e as any)?.message ?? String(e));
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

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
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
})();
