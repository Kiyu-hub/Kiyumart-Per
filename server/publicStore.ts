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
