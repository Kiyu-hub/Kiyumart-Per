import { FASHION_STORE_TYPES, isFashionStoreType, getSelectableStoreTypes } from "../../shared/storeTypes";

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

assert(FASHION_STORE_TYPES.join(",") === "clothing,beauty_cosmetics", "Fashion types must be clothing + beauty");
assert(isFashionStoreType("clothing") && isFashionStoreType("beauty_cosmetics"), "Fashion types accepted");
for (const t of ["restaurant", "food_beverages", "electronics", "automotive", "", null, undefined]) {
  assert(!isFashionStoreType(t as any), `Non-fashion type rejected: ${t}`);
}
assert(getSelectableStoreTypes(null).join(",") === "clothing,beauty_cosmetics", "Pickers offer fashion only");
assert(getSelectableStoreTypes("electronics").includes("electronics"), "An older record's own type still displays");
assert(!getSelectableStoreTypes("clothing").includes("restaurant"), "Food never offered");
console.log("fashion-only-store-types.test passed");
