// Phone cart: unticked items must stay in the cart after payment, and the
// cart's money maths must match checkout / the server.
import { matchPurchasedCartRows, clearPurchasedCartItems } from "../cartCleanup";
import { normalizeRequestedCouponCodes } from "../couponRequest";
import { computeDeliveryFees } from "../deliveryFees";
import { filterCheckoutCartItems } from "../../client/src/lib/cartSelection";
import { summarizeCart, couponDiscountFor, computeExactProcessingFee, resolveProcessingFeePercent } from "../../client/src/lib/cartTotals";

let failures = 0;
const check = (ok: boolean, msg: string) => { if (ok) console.log(`  ✓ ${msg}`); else { failures++; console.error(`  ✗ ${msg}`); } };
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  console.log("matchPurchasedCartRows");
  const cartRows = [
    { id: "r1", productId: "abaya", selectedColor: "Burgundy", selectedSize: "M" },
    { id: "r2", productId: "abaya", selectedColor: "Black", selectedSize: "M" },
    { id: "r3", productId: "bag", variantId: "v-tan" },
    { id: "r4", productId: "jacket", selectedColor: null, selectedSize: "L" },
  ];
  const bought = [
    { productId: "abaya", selectedColor: "burgundy", selectedSize: "M" },
    { productId: "bag", variantId: "v-tan" },
  ];
  const ids = matchPurchasedCartRows(cartRows, bought);
  check(ids.includes("r1") && ids.includes("r3"), "purchased rows are removed");
  check(!ids.includes("r2"), "same product in another colour stays");
  check(!ids.includes("r4"), "unticked product stays");

  console.log("clearPurchasedCartItems");
  let removedFor: string[] = []; let cleared = false;
  await clearPurchasedCartItems({ removePurchasedCartItems: async (_u, o) => { removedFor = o; return 1; }, clearCart: async () => { cleared = true; } }, "buyer", ["o1", null, "o2"]);
  check(removedFor.join() === "o1,o2" && !cleared, "uses precise removal, never clears all");
  cleared = false;
  await clearPurchasedCartItems({ clearCart: async () => { cleared = true; } }, "buyer", ["o1"]);
  check(cleared, "falls back to clearCart when precise removal is missing");
  cleared = false;
  await clearPurchasedCartItems({ clearCart: async () => { cleared = true; } }, null, ["o1"]);
  check(!cleared, "no buyer, nothing touched");

  console.log("filterCheckoutCartItems");
  const items = [{ id: "a", availableStock: 3 }, { id: "b", availableStock: 0 }, { id: "c", availableStock: 5 }];
  check(filterCheckoutCartItems(items, ["c"]).map((i) => i.id).join() === "a", "drops unticked and sold-out rows");

  console.log("cart totals");
  const lines = [
    { price: 560, originalPrice: 690, quantity: 1 },
    { price: 690, originalPrice: 850, quantity: 1 },
    { price: 850, originalPrice: 1050, quantity: 1 },
  ];
  const coupon = couponDiscountFor({ discountType: "percentage", discountValue: "10" }, 560 + 690);
  check(near(coupon, 125), "10% coupon on the shop's GH₵1,250 = GH₵125");
  check(near(couponDiscountFor({ discountType: "fixed", discountValue: "999" }, 100), 100), "fixed coupon is capped at the shop subtotal");
  const s = summarizeCart({ lines, couponDiscount: coupon, feePercent: 1.95 });
  check(near(s.itemsOriginal, 2590) && near(s.discounts, 490), "items and discounts");
  check(near(s.fee, 1975 * 0.0195 / 0.9805), "Paystack charge uses server gross-up");
  check(near(s.total - s.fee, 1975), "total = items − coupon + charges");
  check(near(s.fee, computeExactProcessingFee(1975, 0.0195)), "same helper as checkout");
  console.log("shop coupons (one per shop, only that shop's items)");
  check(normalizeRequestedCouponCodes({ couponCodes: ["kiyu10", " SHOP5 "], couponCode: "KIYU10" }).join() === "KIYU10,SHOP5", "codes from list + legacy field, uppercased, no duplicates");
  check(normalizeRequestedCouponCodes({ couponCodes: [{ code: "abc" }] }).join() === "ABC", "accepts {code} entries");
  check(normalizeRequestedCouponCodes({}).length === 0, "no coupons");
  const shopA = 560 + 690, shopB = 850;
  const offA = couponDiscountFor({ discountType: "percentage", discountValue: "10" }, shopA);
  const offB = couponDiscountFor({ discountType: "fixed", discountValue: "50" }, shopB);
  const both = summarizeCart({ lines, couponDiscount: offA + offB, feePercent: 1.95 });
  check(near(offA, 125) && near(offB, 50), "each coupon computed on its own shop");
  check(near(shopA - offA, 1125) && near(shopB - offB, 800), "each shop keeps its own net (A 1,125 / B 800)");
  const perShopFee = computeExactProcessingFee(shopA - offA, 0.0195) + computeExactProcessingFee(shopB - offB, 0.0195);
  check(near(both.fee, perShopFee), "cart charge = sum of per-shop server charges");
  const onlyA = summarizeCart({ lines, couponDiscount: offA, feePercent: 1.95 });
  check(near(onlyA.itemsNet - onlyA.coupon - shopA + offA, shopB), "shop without a coupon is unaffected");
  console.log("delivery fees (server-side, one parcel per shop)");
  const own = computeDeliveryFees({ externalDelivery: false, isPickup: false, zone: { fee: "20", isActive: true }, commission: "0", sellerIds: ["A", "B", "A"] });
  check(own.ok && own.total === 40 && own.feeBySeller.get("A") === 20 && own.feeBySeller.get("B") === 20, "own riders: zone fee for each shop (2 shops = GH₵40)");
  const withCommission = computeDeliveryFees({ externalDelivery: false, isPickup: false, zone: { fee: "20" }, commission: "2.5", sellerIds: ["A"] });
  check(withCommission.ok && withCommission.total === 22.5, "platform delivery commission added per shop");
  const ext = computeDeliveryFees({ externalDelivery: true, isPickup: false, zone: null, sellerIds: ["A", "B"] });
  check(ext.ok && ext.total === 0, "external delivery: nothing charged in the app");
  const pick = computeDeliveryFees({ externalDelivery: false, isPickup: true, zone: null, sellerIds: ["A"] });
  check(pick.ok && pick.total === 0, "pickup: no delivery fee");
  const missing = computeDeliveryFees({ externalDelivery: false, isPickup: false, zone: null, sellerIds: ["A"] });
  check(!missing.ok, "own riders without a zone is refused (browser can't set the fee)");
  const inactive = computeDeliveryFees({ externalDelivery: false, isPickup: false, zone: { fee: "20", isActive: false }, sellerIds: ["A"] });
  check(!inactive.ok, "inactive zone is refused");
  check(resolveProcessingFeePercent(undefined) === 1.95 && resolveProcessingFeePercent("1.5") === 1.5, "fee percent from settings, default 1.95");
}

main().then(() => {
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
  console.log("All cart selection checks passed");
});
