import { Router, type Response } from "express";
import rateLimit from "express-rate-limit";
import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { catalogDepartments } from "@shared/schema";
import { CATALOG_DEPARTMENTS } from "@shared/catalogTaxonomy";
import { comparePassword, requireAuth, requireRole, type AuthRequest } from "./auth";
import { storage } from "./storage";

/**
 * Super Admin department toggles are more privileged than ordinary category
 * editing. They require current super_admin role AND proof of a fresh password
 * check on a purpose-bound, 10-minute token. Never use client-side timers as an
 * authorization mechanism.
 */
export const catalogDepartmentsRouter = Router();
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET) throw new Error("SESSION_SECRET is required");
const SCOPED_PURPOSE = "kiyumart.catalog_departments.toggle";
const PASSWORD_PROOF_TTL = 10 * 60;
const allowedSlugs = new Set(CATALOG_DEPARTMENTS.map((x) => x.slug));

function fingerprint(passwordHash: string): string {
  return createHmac("sha256", SESSION_SECRET!).update(passwordHash).digest("hex");
}
function sameFingerprint(first: string, second: string): boolean {
  const a = Buffer.from(first, "hex");
  const b = Buffer.from(second, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
async function verifyElevatedAccess(req: AuthRequest, res: Response): Promise<boolean> {
  if (req.user?.role !== "super_admin") {
    res.status(403).json({ error: "Super Admin role required" });
    return false;
  }
  const token = req.get("x-elevated-access");
  if (!token) {
    res.status(403).json({ error: "Recent Super Admin password verification required" });
    return false;
  }
  try {
    const signed = jwt.verify(token, SESSION_SECRET!, { algorithms: ["HS256"] });
    if (typeof signed === "string" || signed.purpose !== SCOPED_PURPOSE || signed.sub !== req.user.id || typeof signed.fingerprint !== "string") {
      res.status(403).json({ error: "Invalid elevated access scope" });
      return false;
    }
    const user = await storage.getUser(req.user.id);
    if (!user || !user.isActive || user.role !== "super_admin" || !user.password ||
        !sameFingerprint(signed.fingerprint, fingerprint(user.password))) {
      res.status(403).json({ error: "Elevated verification is no longer valid" });
      return false;
    }
    return true;
  } catch {
    res.status(403).json({ error: "Elevated access expired or invalid" });
    return false;
  }
}

catalogDepartmentsRouter.get("/api/catalog-departments", async (_req, res) => {
  try {
    const rows = await db.select().from(catalogDepartments)
      .where(eq(catalogDepartments.isEnabled, true))
      .orderBy(asc(catalogDepartments.displayOrder));
    res.json(rows.map(row => ({ slug: row.slug, name: row.name, description: row.description, icon: row.icon, storeTypes: row.storeTypes, displayOrder: row.displayOrder })));
  } catch (error) {
    console.error("[CATALOG] Public departments error", error);
    res.status(503).json({ error: "Departments temporarily unavailable" });
  }
});

catalogDepartmentsRouter.get("/api/admin/catalog-departments", requireAuth, requireRole("super_admin"), async (_req, res) => {
  try {
    const rows = await db.select().from(catalogDepartments).orderBy(asc(catalogDepartments.displayOrder));
    res.json(rows);
  } catch (error) {
    console.error("[CATALOG] Admin department listing error", error);
    res.status(503).json({ error: "Departments unavailable" });
  }
});

catalogDepartmentsRouter.post(
  "/api/admin/catalog-departments/elevate",
  rateLimit({ windowMs: 15 * 60_000, limit: 5, standardHeaders: "draft-7", legacyHeaders: false }),
  requireAuth,
  requireRole("super_admin"),
  async (req: AuthRequest, res) => {
    const password = req.body?.password;
    if (typeof password !== "string" || password.length > 256 || !password) {
      return res.status(400).json({ error: "Enter your current Super Admin password" });
    }
    try {
      const user = await storage.getUser(req.user!.id);
      if (!user || user.role !== "super_admin" || !user.isActive || !user.password ||
          !(await comparePassword(password, user.password))) {
        return res.status(403).json({ error: "Password verification failed" });
      }
      const token = jwt.sign({
        purpose: SCOPED_PURPOSE,
        fingerprint: fingerprint(user.password)
      }, SESSION_SECRET!, {
        algorithm: "HS256", subject: user.id, expiresIn: PASSWORD_PROOF_TTL,
      });
      return res.json({ elevatedToken: token, expiresInSeconds: PASSWORD_PROOF_TTL });
    } catch (error) {
      console.error("[CATALOG] Elevated login error", error);
      return res.status(503).json({ error: "Unable to verify credentials" });
    }
  },
);

catalogDepartmentsRouter.patch(
  "/api/admin/catalog-departments/:slug",
  requireAuth,
  requireRole("super_admin"),
  async (req: AuthRequest, res) => {
    if (!(await verifyElevatedAccess(req, res))) return;
    const slug = String(req.params.slug || "");
    if (!allowedSlugs.has(slug)) {
      return res.status(404).json({ error: "Unknown marketplace department" });
    }
    if (typeof req.body?.isEnabled !== "boolean") {
      return res.status(400).json({ error: "isEnabled must be boolean" });
    }
    const isEnabled = req.body.isEnabled as boolean;
    if (slug === "clothing" && !isEnabled) {
      return res.status(409).json({ error: "Clothing & Fashion must remain enabled as the default department" });
    }
    try {
      const [department] = await db.select().from(catalogDepartments).where(eq(catalogDepartments.slug, slug)).limit(1);
      if (!department) return res.status(404).json({ error: "Department not configured" });
      if (isEnabled && !department.launchReady) {
        return res.status(409).json({ error: "This department is locked until its seller/store/product workflows have been prepared and tested" });
      }
      const [updated] = await db.update(catalogDepartments)
        .set({ isEnabled, updatedAt: new Date() })
        .where(eq(catalogDepartments.slug, slug)).returning();
      return res.json({
        slug: updated.slug, name: updated.name, isEnabled: updated.isEnabled,
        launchReady: updated.launchReady
      });
    } catch (error) {
      console.error("[CATALOG] Department toggle error", error);
      return res.status(503).json({ error: "Unable to update department state" });
    }
  },
);
