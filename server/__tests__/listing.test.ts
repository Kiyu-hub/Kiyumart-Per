import assert from "node:assert/strict";
import {
  applyFilters, availableColours, availableSizes, availableTypes, EMPTY_FILTERS, groupByArrival,
  isSoldOut, pickEditorsPick, priceBounds, sortProducts, swatchFor,
} from "../../client/src/lib/listing";

const now = Date.parse("2026-11-26T12:00:00Z");
const mk = (id: string, o: any = {}) => ({
  id, name: id, price: "100", costPrice: null, stock: 5, images: ["a"], createdAt: "2026-11-20T00:00:00Z",
  description: "", dynamicFields: { storeSpecific: {}, variantSummary: [] }, ...o,
});
const v = (color: string, size: string, stock = 3) => ({ color, size, stock });

const a = mk("a", { price: "300", createdAt: "2026-11-26T08:00:00Z", dynamicFields: { storeSpecific: { occasion: ["Evening"] }, variantSummary: [v("Black", "M"), v("Black", "L", 0)] } });
const b = mk("b", { price: "150", costPrice: "200", dynamicFields: { storeSpecific: { occasion: ["Everyday wear", "Evening"] }, variantSummary: [v("Emerald Green", "S"), v("Emerald Green", "M")] } });
const c = mk("c", { price: "500", stock: 0, createdAt: "2026-10-01T00:00:00Z", dynamicFields: { storeSpecific: {}, variantSummary: [v("Pink", "XL", 0)] } });
const d = mk("d", { price: "80", stock: undefined });
const all = [a, b, c, d];

assert.equal(isSoldOut(c), true);
assert.equal(isSoldOut(d), false, "unknown stock is not sold out");
assert.deepEqual(availableSizes(all), ["S", "M"], "only in-stock sizes, in size order");
assert.deepEqual(availableColours(all), ["Black", "Emerald Green", "Pink"]);
assert.deepEqual(availableTypes(all), ["Evening", "Everyday wear"], "most common first");
assert.deepEqual(priceBounds(all), { min: 80, max: 500 });

assert.deepEqual(applyFilters(all, { ...EMPTY_FILTERS, sizes: ["L"] }).map((p) => p.id), [], "L is sold out");
assert.deepEqual(applyFilters(all, { ...EMPTY_FILTERS, sizes: ["m"] }).map((p) => p.id), ["a", "b"]);
assert.deepEqual(applyFilters(all, { ...EMPTY_FILTERS, colours: ["emerald green"] }).map((p) => p.id), ["b"]);
assert.deepEqual(applyFilters(all, { ...EMPTY_FILTERS, types: ["Evening"] }).map((p) => p.id), ["a", "b"]);
assert.deepEqual(applyFilters(all, { ...EMPTY_FILTERS, inStockOnly: true }).map((p) => p.id), ["a", "b", "d"]);
assert.deepEqual(applyFilters(all, { ...EMPTY_FILTERS, minPrice: 100, maxPrice: 300 }).map((p) => p.id), ["a", "b"]);

assert.deepEqual(sortProducts(all, "price-desc").map((p) => p.id), ["a", "b", "d", "c"], "sold out always last");
assert.deepEqual(sortProducts(all, "price-asc").map((p) => p.id), ["d", "b", "a", "c"]);
assert.equal(sortProducts(all, "discount")[0].id, "b");
assert.equal(sortProducts(all, "newest")[0].id, "a");

const groups = groupByArrival(sortProducts(all, "newest"), now);
assert.deepEqual(groups.map((g) => [g.key, g.products.map((p) => p.id)]), [["today", ["a"]], ["week", ["b", "d"]], ["earlier", ["c"]]]);

const rich = mk("rich", { images: ["1", "2", "3", "4"], description: "x".repeat(220), dynamicFields: { measurementGuide: {}, storeSpecific: { material: "Satin", fitType: "Regular", occasion: ["Evening"] }, variantSummary: [v("Green", "M"), v("Blue", "L")] } });
const richButSold = { ...rich, id: "sold", stock: 0, images: ["1", "2", "3", "4", "5", "6"] };
assert.equal(pickEditorsPick([a, b, rich, richButSold])?.id, "rich", "best-presented in-stock product wins");
assert.equal(pickEditorsPick([c]), null, "never a sold-out product");

assert.equal(swatchFor("Emerald Green"), "#2e7d32");
assert.equal(swatchFor("Burgundy"), "#7a1626");
console.log("listing tests passed");
