/**
 * Which cart rows the buyer has unticked on the phone cart, plus items they
 * saved for later. Stored per user in localStorage so checkout can read the
 * same choice. We store the *excluded* ids, so new items start ticked.
 */

const EXCLUDED_PREFIX = "kiyumart.cart.excluded";
const SAVED_PREFIX = "kiyumart.cart.savedForLater";

export interface SavedForLaterItem {
  productId: string;
  name: string;
  image: string;
  price: number;
  variantId: string | null;
  selectedColor: string | null;
  selectedSize: string | null;
  selectedImageIndex: number | null;
  savedAt: number;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable (private mode); the cart still works.
  }
}

export function readExcludedCartIds(userId: string | null | undefined): string[] {
  if (!userId) return [];
  const value = read<unknown>(`${EXCLUDED_PREFIX}:${userId}`, []);
  return Array.isArray(value) ? value.map(String) : [];
}

export function writeExcludedCartIds(userId: string | null | undefined, ids: string[]) {
  if (!userId) return;
  write(`${EXCLUDED_PREFIX}:${userId}`, Array.from(new Set(ids)));
}

export function clearExcludedCartIds(userId: string | null | undefined) {
  if (!userId || typeof window === "undefined") return;
  try { window.localStorage.removeItem(`${EXCLUDED_PREFIX}:${userId}`); } catch { /* ignore */ }
}

/** Cart rows that go to checkout: not unticked by the buyer and still in stock. */
export function filterCheckoutCartItems<T extends { id: string; availableStock?: number | null }>(
  items: T[],
  excludedIds: string[],
): T[] {
  const excluded = new Set(excludedIds);
  return items.filter((item) => !excluded.has(item.id) && !(typeof item.availableStock === "number" && item.availableStock <= 0));
}

export function readSavedForLater(userId: string | null | undefined): SavedForLaterItem[] {
  if (!userId) return [];
  const value = read<unknown>(`${SAVED_PREFIX}:${userId}`, []);
  return Array.isArray(value) ? (value as SavedForLaterItem[]) : [];
}

export function writeSavedForLater(userId: string | null | undefined, items: SavedForLaterItem[]) {
  if (!userId) return;
  write(`${SAVED_PREFIX}:${userId}`, items);
}
