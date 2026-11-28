const CHECKOUT_COUPON_STORAGE_PREFIX = "kiyumart.checkoutCoupon";

export interface PersistedCheckoutCoupon {
  code: string;
  sellerId: string | null;
  savedAt: number;
}

function getStorageKey(userId: string) {
  return `${CHECKOUT_COUPON_STORAGE_PREFIX}:${userId}`;
}

/** Shop coupons the buyer applied (cart or checkout): at most one per shop. */
export function readPersistedCheckoutCoupons(userId: string | null | undefined): PersistedCheckoutCoupon[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as any;
    const list: any[] = Array.isArray(parsed?.coupons) ? parsed.coupons : parsed?.code ? [parsed] : [];
    const bySeller = new Map<string, PersistedCheckoutCoupon>();
    for (const entry of list) {
      if (!entry || typeof entry.code !== "string" || !entry.code.trim()) continue;
      const coupon = {
        code: entry.code.trim().toUpperCase(),
        sellerId: entry.sellerId ? String(entry.sellerId) : null,
        savedAt: Number(entry.savedAt) || Date.now(),
      };
      bySeller.set(coupon.sellerId || `code:${coupon.code}`, coupon);
    }
    return Array.from(bySeller.values());
  } catch {
    return [];
  }
}

export function writePersistedCheckoutCoupons(
  userId: string | null | undefined,
  coupons: PersistedCheckoutCoupon[],
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    if (!coupons.length) {
      window.localStorage.removeItem(getStorageKey(userId));
      return;
    }
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify({ coupons, savedAt: Date.now() }));
  } catch {
    // Ignore storage failures to avoid breaking checkout UX.
  }
}

/** First saved coupon (older single-coupon callers). */
export function readPersistedCheckoutCoupon(userId: string | null | undefined): PersistedCheckoutCoupon | null {
  return readPersistedCheckoutCoupons(userId)[0] || null;
}

/** Saves (or replaces) the coupon for its shop; null clears every saved coupon. */
export function writePersistedCheckoutCoupon(
  userId: string | null | undefined,
  coupon: PersistedCheckoutCoupon | null,
): void {
  if (!coupon) {
    writePersistedCheckoutCoupons(userId, []);
    return;
  }
  const others = readPersistedCheckoutCoupons(userId).filter((c) =>
    coupon.sellerId ? c.sellerId !== coupon.sellerId : c.code !== coupon.code,
  );
  writePersistedCheckoutCoupons(userId, [...others, coupon]);
}

/** Removes the saved coupon for one shop. */
export function removePersistedCheckoutCoupon(userId: string | null | undefined, sellerId: string): void {
  writePersistedCheckoutCoupons(userId, readPersistedCheckoutCoupons(userId).filter((c) => c.sellerId !== sellerId));
}

export function clearPersistedCheckoutCoupon(userId: string | null | undefined): void {
  writePersistedCheckoutCoupon(userId, null);
}

export function clearAllPersistedCheckoutCoupons(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToDelete: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key && key.startsWith(`${CHECKOUT_COUPON_STORAGE_PREFIX}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures to avoid breaking checkout UX.
  }
}
