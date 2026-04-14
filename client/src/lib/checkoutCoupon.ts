const CHECKOUT_COUPON_STORAGE_PREFIX = "kiyumart.checkoutCoupon";

export interface PersistedCheckoutCoupon {
  code: string;
  sellerId: string | null;
  savedAt: number;
}

function getStorageKey(userId: string) {
  return `${CHECKOUT_COUPON_STORAGE_PREFIX}:${userId}`;
}

export function readPersistedCheckoutCoupon(userId: string | null | undefined): PersistedCheckoutCoupon | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedCheckoutCoupon>;
    if (!parsed || typeof parsed.code !== "string" || !parsed.code.trim()) return null;
    return {
      code: parsed.code.trim().toUpperCase(),
      sellerId: parsed.sellerId ? String(parsed.sellerId) : null,
      savedAt: Number(parsed.savedAt) || Date.now(),
    };
  } catch {
    return null;
  }
}

export function writePersistedCheckoutCoupon(
  userId: string | null | undefined,
  coupon: PersistedCheckoutCoupon | null,
): void {
  if (!userId || typeof window === "undefined") return;
  try {
    if (!coupon) {
      window.localStorage.removeItem(getStorageKey(userId));
      return;
    }
    window.localStorage.setItem(getStorageKey(userId), JSON.stringify(coupon));
  } catch {
    // Ignore storage failures to avoid breaking checkout UX.
  }
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
