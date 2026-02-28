import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { type User } from "@shared/schema";
import { Request, Response, NextFunction } from "express";
import { storage } from "./storage";

if (!process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET environment variable is required for JWT authentication");
}

const JWT_SECRET = process.env.SESSION_SECRET;
const JWT_EXPIRES_IN = "7d";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: Pick<User, "id" | "email" | "role">): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Try to get token from cookie first, then fall back to Authorization header
  let token = req.cookies?.token;
  
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7);
    }
  }
  
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  req.user = decoded;
  next();
}

export function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const latestUser = await storage.getUser(req.user.id);
    if (!latestUser || !latestUser.isActive) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Enforce current DB role/approval, not token snapshot role.
    const latestRole = latestUser.role;
    if (!roles.includes(latestRole)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    if (!latestUser.isApproved && (latestRole === "seller" || latestRole === "rider")) {
      return res.status(403).json({ error: "Account pending approval" });
    }

    // Keep downstream checks aligned with freshest role value.
    req.user.role = latestRole;

    next();
  };
}

export function requirePermission(...permissions: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (req.user.role !== "admin" && req.user.role !== "super_admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (req.user.role === "super_admin") {
      return next();
    }

    try {
      const { db } = await import("../db");
      const { adminPermissions } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");

      const [userPermissions] = await db
        .select()
        .from(adminPermissions)
        .where(eq(adminPermissions.userId, req.user.id));

      if (!userPermissions) {
        return res.status(403).json({ error: "No permissions configured for this admin" });
      }

      const hasPermission = permissions.every((permission) => {
        switch (permission) {
          case "manage_users":
            return userPermissions.canManageUsers;
          case "manage_products":
            return userPermissions.canManageProducts;
          case "manage_orders":
            return userPermissions.canManageOrders;
          case "manage_stores":
            return userPermissions.canManageStores;
          case "manage_categories":
            return userPermissions.canManageCategories;
          case "manage_admins":
            return userPermissions.canManageAdmins;
          case "edit_passwords":
            return userPermissions.canEditPasswords;
          case "manage_roles":
            return userPermissions.canManageRoles;
          case "manage_platform_settings":
            return userPermissions.canManagePlatformSettings;
          case "view_analytics":
            return userPermissions.canViewAnalytics;
          case "manage_promotions":
            return userPermissions.canManagePromotions;
          case "manage_reviews":
            return userPermissions.canManageReviews;
          default:
            return false;
        }
      });

      if (!hasPermission) {
        return res.status(403).json({ error: "Insufficient permissions for this action" });
      }

      next();
    } catch (error) {
      console.error("Permission check error:", error);
      return res.status(500).json({ error: "Failed to verify permissions" });
    }
  };
}

/**
 * Apply permission checks only when the authenticated user is admin/super_admin.
 * Useful for mixed-role routes (e.g., admin + seller) so non-admin roles are not blocked.
 */
export function requirePermissionIfAdmin(...permissions: string[]) {
  const adminPermissionMiddleware = requirePermission(...permissions);
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.role === "admin" || req.user.role === "super_admin") {
      return adminPermissionMiddleware(req, res, next);
    }
    return next();
  };
}

const ROLE_FEATURE_DEFAULTS: Record<string, Record<string, boolean>> = {
  super_admin: {},
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
    "support.manage": true,
    "support.view": true,
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
    "profile.manage": true,
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
    "support.view": true,
    "support.manage": true,
    "messages.view": true,
    "messages.send": true,
    "users.view": true,
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

const SUPER_ADMIN_ABSOLUTE_KEYS = Array.from(
  new Set([
    ...Object.values(ROLE_FEATURE_DEFAULTS).flatMap((record) => Object.keys(record || {})),
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
    "manage_users",
    "manage_products",
    "manage_orders",
    "manage_stores",
    "manage_categories",
    "manage_admins",
    "edit_passwords",
    "manage_roles",
    "manage_platform_settings",
    "view_analytics",
    "manage_promotions",
    "manage_reviews",
  ]),
);

const buildSuperAdminAbsoluteFeatures = (configured: Record<string, boolean> = {}): Record<string, boolean> => {
  const absolute = {} as Record<string, boolean>;
  Array.from(new Set([...SUPER_ADMIN_ABSOLUTE_KEYS, ...Object.keys(configured || {})])).forEach((key) => {
    absolute[key] = true;
  });
  return absolute;
};

export async function resolveRoleFeatures(role: string): Promise<Record<string, boolean>> {
  const normalizedRole = String(role || "").toLowerCase().trim();
  const defaults = ROLE_FEATURE_DEFAULTS[normalizedRole] || {};
  try {
    const { db } = await import("../db");
    const { roleFeatures } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    if (normalizedRole === "super_admin") {
      const configuredRows = await db
        .select({ features: roleFeatures.features })
        .from(roleFeatures);
      const discoveredKeys = configuredRows.flatMap((row: any) =>
        Object.keys((row?.features || {}) as Record<string, boolean>),
      );
      const discoveredFeatureMap = Object.fromEntries(discoveredKeys.map((key) => [key, true])) as Record<
        string,
        boolean
      >;
      return buildSuperAdminAbsoluteFeatures(discoveredFeatureMap);
    }

    const [configured] = await db
      .select({ features: roleFeatures.features })
      .from(roleFeatures)
      .where(eq(roleFeatures.role, normalizedRole as any))
      .limit(1);
    const configuredFeatures = (configured?.features || {}) as Record<string, boolean>;
    return { ...defaults, ...configuredFeatures };
  } catch {
    if (normalizedRole === "super_admin") {
      return buildSuperAdminAbsoluteFeatures();
    }
    return defaults;
  }
}

export function requireRoleFeature(...features: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    // Self-service safety net:
    // Never lock authenticated users out of managing their own profile due to
    // stale/misconfigured role-feature rows.
    if (features.every((f) => f === "profile.manage")) {
      return next();
    }

    if (req.user.role === "super_admin") {
      return next();
    }

    const resolved = await resolveRoleFeatures(req.user.role);
    // Keep profile editing available even if role-feature configuration is stale.
    const missing = features.filter((f) => f !== "profile.manage" && resolved[f] !== true);
    if (missing.length > 0) {
      console.warn(`[RBAC] Role feature denied user=${req.user.id} role=${req.user.role} missing=${missing.join(",")}`);
      return res.status(403).json({
        error: "Feature access denied",
        missingFeatures: missing,
      });
    }

    return next();
  };
}

export function requireRoleFeatureIfRole(roles: string[], ...features: string[]) {
  const featureMiddleware = requireRoleFeature(...features);
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return next();
    }
    return featureMiddleware(req, res, next);
  };
}
