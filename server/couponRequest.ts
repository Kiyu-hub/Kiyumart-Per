/**
 * Shop coupons on a checkout. Each shop may have one coupon, and it reduces
 * only that shop's items, so a shop that offers no coupon is never affected.
 * Accepts the new `couponCodes` list and the older single `couponCode`.
 */
export function normalizeRequestedCouponCodes(orderData: { couponCode?: unknown; couponCodes?: unknown } | null | undefined): string[] {
  const raw: unknown[] = [];
  if (Array.isArray(orderData?.couponCodes)) raw.push(...orderData!.couponCodes);
  if (orderData?.couponCode) raw.push(orderData.couponCode);
  const codes = raw
    .map((entry) => (entry && typeof entry === "object" ? (entry as any).code : entry))
    .map((code) => String(code ?? "").trim().toUpperCase())
    .filter(Boolean);
  return Array.from(new Set(codes)).slice(0, 50);
}
