// Phone cart: unticked items must stay in the cart after payment, and the
// cart's money maths must match checkout / the server.
import { matchPurchasedCartRows, clearPurchasedCartItems } from "../cartCleanup";
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
  check(resolveProcessingFeePercent(undefined) === 1.95 && resolveProcessingFeePercent("1.5") === 1.5, "fee percent from settings, default 1.95");
}

main().then(() => {
  if (failures) { console.error(`${failures} check(s) failed`); process.exit(1); }
  console.log("All cart selection checks passed");
});
