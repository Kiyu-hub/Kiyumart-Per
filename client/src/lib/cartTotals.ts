/**
 * Cart money maths, kept identical to what checkout and the server charge.
 *
 * - Coupons apply only to the shop that issued them (server/routes.ts validates
 *   against that seller's subtotal), and one coupon is used per order.
 * - Paystack charges are passed to the buyer with the same gross-up the server
 *   uses: fee = base × r / (1 − r), so the shop still receives its full amount.
 */

export const DEFAULT_PROCESSING_FEE_PERCENT = 1.95;

export function resolveProcessingFeePercent(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : DEFAULT_PROCESSING_FEE_PERCENT;
}

export function computeExactProcessingFee(chargeableBase: number, feeRate: number): number {
  const base = Math.max(0, chargeableBase);
  if (base <= 0 || feeRate <= 0 || feeRate >= 1) return 0;
  return (base * feeRate) / (1 - feeRate);
}

export interface CouponLike {
  discountType?: string | null;
  discountValue?: string | number | null;
}

/** Discount a coupon gives on one shop's subtotal (never more than the subtotal). */
export function couponDiscountFor(coupon: CouponLike | null | undefined, shopSubtotal: number): number {
  if (!coupon || shopSubtotal <= 0) return 0;
  const value = Number(coupon.discountValue) || 0;
  const raw = coupon.discountType === "percentage" ? (shopSubtotal * value) / 100 : value;
  return Math.max(0, Math.min(shopSubtotal, raw));
}

export interface CartSummaryInput {
  /** Selected, in-stock lines only. */
  lines: Array<{ price: number; originalPrice?: number | null; quantity: number }>;
  couponDiscount: number;
  deliveryFee?: number;
  feePercent: number;
}

export function summarizeCart({ lines, couponDiscount, deliveryFee = 0, feePercent }: CartSummaryInput) {
  const itemsNet = lines.reduce((t, l) => t + l.price * l.quantity, 0);
  const itemsOriginal = lines.reduce((t, l) => {
    const was = l.originalPrice && l.originalPrice > l.price ? l.originalPrice : l.price;
    return t + was * l.quantity;
  }, 0);
  const coupon = Math.min(Math.max(0, couponDiscount), itemsNet);
  const base = itemsNet - coupon + Math.max(0, deliveryFee);
  const fee = computeExactProcessingFee(base, feePercent / 100);
  return {
    itemCount: lines.reduce((t, l) => t + l.quantity, 0),
    itemsOriginal,
    discounts: itemsOriginal - itemsNet,
    itemsNet,
    coupon,
    fee,
    total: base + fee,
    savings: itemsOriginal - itemsNet + coupon,
  };
}
