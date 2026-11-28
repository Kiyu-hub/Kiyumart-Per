/**
 * KM-006 — Public store response contract.
 *
 * Public (unauthenticated) store endpoints must only ever return the fields
 * listed below. This is an ALLOWLIST: any column that is not named here —
 * including columns added to the `stores` table in future — stays private by
 * default.
 *
 * Never add financial or identity-verification fields here (payoutDetails,
 * payoutType, isPayoutVerified, paystackSubaccountId, verificationDoc*,
 * verificationSelfie, verificationRejectionReason, verificationAppliedAt,
 * verificationReviewedAt). Privileged data is served only by role-protected
 * endpoints (e.g. /api/admin/stores/:storeId/dashboard, /api/stores/my-store).
 *
 * Pending owner decision (kept for now so storefront behaviour is unchanged):
 * `whatsappNumber` and `storeTypeMetadata`.
 */
export const PUBLIC_STORE_FIELDS = [
  "id",
  "primarySellerId",
  "name",
  "description",
  "logo",
  "banner",
  "category",
  "storeType",
  "storeTypeMetadata",
  "businessType",
  "merchantCategory",
  "brandingConfig",
  "socialLinks",
  "whatsappNumber",
  "location",
  "latitude",
  "longitude",
  "prepTimeMins",
  "minOrderAmount",
  "isActive",
  "isApproved",
  "verificationStatus",
  "createdAt",
  "updatedAt",
  // Derived, non-sensitive values added by queries or route handlers
  "sellerName",
  "sellerProfileImage",
  "averageRating",
  "totalOrders",
  "productCount",
] as const;

export type PublicStoreField = (typeof PUBLIC_STORE_FIELDS)[number];
export type PublicStore = Partial<Record<PublicStoreField, unknown>>;

/** Returns a new object containing only allowlisted public store fields. */
export function toPublicStore(store: Record<string, any> | null | undefined): PublicStore | null {
  if (!store || typeof store !== "object") return null;
  const result: PublicStore = {};
  for (const field of PUBLIC_STORE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(store, field)) {
      result[field] = store[field];
    }
  }
  return result;
}

/** Applies toPublicStore to every element of a list. */
export function toPublicStores(stores: Array<Record<string, any>> | null | undefined): PublicStore[] {
  if (!Array.isArray(stores)) return [];
  return stores
    .map((store) => toPublicStore(store))
    .filter((store): store is PublicStore => store !== null);
}

// ── Admin views (KM-006f) ─────────────────────────────────────────────────
// Super Admin keeps the complete store record. Ordinary admins never receive
// identity-verification documents (only Super Admin approves verification) and
// receive payout details only when they hold the "view payouts" permission.
export const STORE_IDENTITY_FIELDS = [
  "verificationDocFront",
  "verificationDocBack",
  "verificationSelfie",
] as const;
export const STORE_PAYOUT_FIELDS = [
  "payoutDetails",
  "paystackSubaccountId",
] as const;

export function toAdminStoreView<T extends Record<string, any> | null | undefined>(
  store: T,
  viewer: { isSuperAdmin: boolean; canViewPayouts: boolean },
): T {
  if (!store || typeof store !== "object" || viewer.isSuperAdmin) return store;
  const copy: Record<string, any> = { ...store };
  for (const field of STORE_IDENTITY_FIELDS) delete copy[field];
  if (!viewer.canViewPayouts) for (const field of STORE_PAYOUT_FIELDS) delete copy[field];
  return copy as T;
}

/** Resolves what the requesting admin may see. Fails closed on lookup errors. */
export async function resolveAdminStoreViewer(user: { id: string; role: string } | undefined) {
  if (!user) return { isSuperAdmin: false, canViewPayouts: false };
  if (user.role === "super_admin") return { isSuperAdmin: true, canViewPayouts: true };
  if (user.role !== "admin") return { isSuperAdmin: false, canViewPayouts: false };
  try {
    const { db } = await import("../db");
    const { adminPermissions } = await import("@shared/schema");
    const { eq } = await import("drizzle-orm");
    const [perms] = await db.select().from(adminPermissions).where(eq(adminPermissions.userId, user.id));
    // Same default as requirePermission (server/auth.ts): view payouts allowed unless switched off.
    return { isSuperAdmin: false, canViewPayouts: (perms as any)?.canViewPayouts ?? true };
  } catch {
    return { isSuperAdmin: false, canViewPayouts: false };
  }
}
