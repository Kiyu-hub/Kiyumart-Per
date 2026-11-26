import { suggestMeasureMode, MEASUREMENT_GUIDES, toLegacySizeGuide } from "../../client/src/lib/measurementGuides";
import { existsSync } from "node:fs";

function eq(actual: unknown, expected: unknown, msg: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${msg}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
}
const g = (categoryName: string, genderTarget?: string, storeType = "clothing") => suggestMeasureMode({ storeType, categoryName, genderTarget });

eq(g("Abayas"), { mode: "garment", guide: "abaya" }, "Abayas");
eq(g("Dresses & Gowns"), { mode: "garment", guide: "dress-short" }, "Dresses");
eq(g("Shoes & Footwear", "Men"), { mode: "garment", guide: "shoes" }, "Shoes");
eq(g("Bags & Handbags"), { mode: "garment", guide: "bag" }, "Bags");
eq(g("Hijabs & Scarves"), { mode: "garment", guide: "hijab" }, "Hijabs");
eq(g("Trousers, Skirts & Bottoms"), { mode: "garment", guide: "trousers" }, "Mixed bottoms");
eq(g("Skirts"), { mode: "garment", guide: "skirt" }, "Skirts");
eq(g("Evening & Occasion Wear"), { mode: "garment", guide: "abaya" }, "Evening wear");
eq(g("Men's Clothing", "Men"), { mode: "garment", guide: "shirt-long" }, "Men's clothing");
eq(g("Kaftans & Traditional Wear", "Men"), { mode: "garment", guide: "kaftan" }, "Men's kaftan");
eq(g("Jewelry & Watches"), { mode: "none" }, "Jewellery");
eq(g("Fabrics & Tailoring"), { mode: "none" }, "Fabric");
eq(g("Skincare", undefined, "beauty_cosmetics"), { mode: "beauty" }, "Beauty store");
for (const id of Object.keys(MEASUREMENT_GUIDES)) {
  if (!existsSync(`client/public/measure/${id}.svg`)) throw new Error(`Missing picture for ${id}`);
}
const legacy = toLegacySizeGuide({ type: "abaya", unit: "cm", rows: { M: { bust: "96", length: "140" } } });
eq(legacy.productRows[0].bust, "96 cm", "legacy desktop size guide mirror");
console.log("measurement-guides.test passed");
