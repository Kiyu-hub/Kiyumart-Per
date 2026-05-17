/**
 * Food-vendor / restaurant detection — shared by desktop and mobile home pages.
 * Single source of truth so food products never leak into the general product feeds.
 *
 * A store is a "food vendor" when any of the following is true:
 *   - businessType === 'local_vendor'  (street food, market vendors)
 *   - businessType === 'restaurant'    (full restaurants)
 *   - storeType === 'food_beverages'   (legacy classification)
 *   - merchantCategory === 'QUICK_EATS' (persona classification)
 */

export type FoodLikeStore = {
  id?: string | null;
  businessType?: string | null;
  merchantCategory?: string | null;
  storeType?: string | null;
};

export type ProductWithStoreId = { storeId?: string | null } & Record<string, unknown>;

export function isFoodVendorStore(store: FoodLikeStore | null | undefined): boolean {
  if (!store) return false;
  if (store.businessType === "local_vendor" || store.businessType === "restaurant") return true;
  if (store.merchantCategory === "QUICK_EATS") return true;
  if (store.storeType === "food_beverages") return true;
  return false;
}

export function isRestaurantStore(store: FoodLikeStore | null | undefined): boolean {
  return Boolean(store && store.businessType === "restaurant");
}

export function isLocalVendorStore(store: FoodLikeStore | null | undefined): boolean {
  if (!store) return false;
  if (store.businessType === "local_vendor") return true;
  // Fallback for older records without explicit businessType.
  if (!store.businessType && (store.merchantCategory === "QUICK_EATS" || store.storeType === "food_beverages")) return true;
  return false;
}

export function getLocalVendors<T extends FoodLikeStore>(stores: T[] | null | undefined): T[] {
  if (!Array.isArray(stores)) return [];
  return stores.filter((s) => isLocalVendorStore(s));
}

export function getRestaurants<T extends FoodLikeStore>(stores: T[] | null | undefined): T[] {
  if (!Array.isArray(stores)) return [];
  return stores.filter((s) => isRestaurantStore(s));
}

export function getFoodVendorStores<T extends FoodLikeStore>(stores: T[] | null | undefined): T[] {
  if (!Array.isArray(stores)) return [];
  return stores.filter((s) => isFoodVendorStore(s));
}

export function getFoodStoreIdSet(stores: FoodLikeStore[] | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(stores)) return ids;
  for (const s of stores) {
    if (s && s.id && isFoodVendorStore(s)) ids.add(String(s.id));
  }
  return ids;
}

/**
 * Splits a flat product list into two buckets based on which stores are food vendors.
 * - foodVendorProducts: products that belong to a food vendor / restaurant
 * - regularProducts:    everything else (used for Featured / New Arrivals / All Products)
 *
 * If a product has no storeId or its store is not in the provided list, it is
 * treated as a regular product (safe default).
 *
 * Uses a loose generic so callers can pass any product shape that has a
 * `storeId` (the only field this helper needs).
 */
export function splitProductsByFoodStores<T>(
  products: T[] | null | undefined,
  stores: FoodLikeStore[] | null | undefined,
): { foodVendorProducts: T[]; regularProducts: T[]; foodStoreIds: Set<string> } {
  const safe: T[] = Array.isArray(products) ? products : [];
  const foodStoreIds = getFoodStoreIdSet(stores);
  const foodVendorProducts: T[] = [];
  const regularProducts: T[] = [];
  for (const p of safe) {
    if (!p) continue;
    const sid = String((p as any).storeId || "");
    if (sid && foodStoreIds.has(sid)) {
      foodVendorProducts.push(p);
    } else {
      regularProducts.push(p);
    }
  }
  return { foodVendorProducts, regularProducts, foodStoreIds };
}

/**
 * Returns a new list with food-vendor products removed. Useful when you just
 * need the regular feed (Featured / New Arrivals / All Products).
 */
export function excludeFoodVendorProducts<T>(
  products: T[] | null | undefined,
  foodStoreIds: Set<string>,
): T[] {
  if (!Array.isArray(products)) return [];
  return products.filter((p) => p && !foodStoreIds.has(String((p as any)?.storeId || "")));
}
