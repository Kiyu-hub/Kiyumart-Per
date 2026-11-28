/**
 * After a paid checkout, remove only the cart rows that were actually bought.
 *
 * Buyers can now leave some cart items unticked on the phone cart. Clearing the
 * whole cart after payment would silently throw those items away, so we match
 * each cart row against the order items instead.
 */

export interface CartRowLike {
  id: string;
  productId: string;
  variantId?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

export interface PurchasedItemLike {
  productId: string;
  variantId?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase();

/** Returns the ids of cart rows that correspond to a purchased item. */
export function matchPurchasedCartRows(cartRows: CartRowLike[], purchased: PurchasedItemLike[]): string[] {
  const ids: string[] = [];
  for (const row of cartRows) {
    const hit = purchased.some((item) => {
      if (norm(item.productId) !== norm(row.productId)) return false;
      if (row.variantId && item.variantId) return norm(row.variantId) === norm(item.variantId);
      return norm(row.selectedColor) === norm(item.selectedColor) && norm(row.selectedSize) === norm(item.selectedSize);
    });
    if (hit) ids.push(row.id);
  }
  return ids;
}

type CartCleanupStorage = {
  removePurchasedCartItems?: (userId: string, orderIds: string[]) => Promise<number>;
  clearCart?: (userId: string) => Promise<void>;
};

/**
 * Removes purchased rows from the buyer's cart. Falls back to the old
 * clear-everything behaviour only when the precise method is unavailable.
 */
export async function clearPurchasedCartItems(
  storage: CartCleanupStorage,
  buyerId: string | null | undefined,
  orderIds: Array<string | null | undefined>,
): Promise<void> {
  if (!buyerId) return;
  const ids = orderIds.map((id) => String(id || "").trim()).filter(Boolean);
  if (typeof storage.removePurchasedCartItems === "function" && ids.length > 0) {
    await storage.removePurchasedCartItems(buyerId, ids);
    return;
  }
  if (typeof storage.clearCart === "function") {
    await storage.clearCart(buyerId);
  }
}
