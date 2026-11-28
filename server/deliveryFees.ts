/**
 * Delivery fees are worked out on the server, never taken from the browser.
 *
 * KiyuMart model (approved 28 Nov 2026): each shop is its own parcel, so with
 * the platform's own riders every shop in the order pays the buyer's zone fee
 * (plus the platform delivery commission). Items from the same shop share one
 * delivery. With external delivery or pickup nothing is charged in the app;
 * the cost is confirmed with the buyer after checkout.
 */
export interface DeliveryFeeInput {
  externalDelivery: boolean;
  isPickup: boolean;
  zone: { fee?: string | number | null; isActive?: boolean | null } | null | undefined;
  commission?: string | number | null;
  sellerIds: string[];
}

export type DeliveryFeeResult =
  | { ok: true; perShopFee: number; feeBySeller: Map<string, number>; total: number }
  | { ok: false; error: string; userMessage: string };

const money = (n: number) => Math.round(n * 100) / 100;

export function computeDeliveryFees(input: DeliveryFeeInput): DeliveryFeeResult {
  const sellers = Array.from(new Set(input.sellerIds.filter(Boolean)));
  const zero = () => ({ ok: true as const, perShopFee: 0, feeBySeller: new Map(sellers.map((s) => [s, 0])), total: 0 });
  if (input.isPickup || input.externalDelivery) return zero();
  if (!input.zone || input.zone.isActive === false) {
    return {
      ok: false,
      error: "Delivery zone is required",
      userMessage: "Please choose your delivery area so we can work out the delivery fee.",
    };
  }
  const zoneFee = Number(input.zone.fee);
  const commission = Number(input.commission ?? 0);
  const perShopFee = money(Math.max(0, Number.isFinite(zoneFee) ? zoneFee : 0) + Math.max(0, Number.isFinite(commission) ? commission : 0));
  const feeBySeller = new Map(sellers.map((s) => [s, perShopFee]));
  return { ok: true, perShopFee, feeBySeller, total: money(perShopFee * sellers.length) };
}
