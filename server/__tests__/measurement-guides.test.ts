import { suggestMeasureMode, suggestSizePresets, MEASUREMENT_GUIDES, toLegacySizeGuide } from "../../client/src/lib/measurementGuides";
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
eq(g("Jumpsuits & Playsuits"), { mode: "garment", guide: "jumpsuit" }, "Jumpsuits");
eq(g("Lingerie & Underwear", "Women"), { mode: "garment", guide: "bra" }, "Lingerie");
eq(g("Men's Underwear & Socks", "Men"), { mode: "garment", guide: "shorts" }, "Men's underwear");
eq(g("Swimwear", "Women"), { mode: "garment", guide: "swimsuit" }, "Swimwear");
eq(g("Baby Clothing (0-24 months)"), { mode: "garment", guide: "baby" }, "Baby");
eq(g("Hoodies, Sweatshirts & Knitwear"), { mode: "garment", guide: "top-long" }, "Hoodies");
eq(g("Suits & Blazers", "Men"), { mode: "garment", guide: "jacket" }, "Suits");
eq(g("Jeans & Denim"), { mode: "garment", guide: "trousers" }, "Jeans");
eq(g("Sneakers"), { mode: "garment", guide: "shoes" }, "Sneakers");
eq(g("Kids' Shoes"), { mode: "garment", guide: "shoes" }, "Kids shoes");
eq(g("Sunglasses & Eyewear"), { mode: "none" }, "Sunglasses");
eq(g("Ties, Cufflinks & Pocket Squares"), { mode: "none" }, "Ties");
eq(g("African Print, Kente & Smock", "Men"), { mode: "garment", guide: "kaftan" }, "Smock men");
eq(suggestSizePresets({ categoryName: "Kids' Shoes", guide: "shoes" })[0], "23", "Kids shoe sizes");
eq(suggestSizePresets({ categoryName: "Baby Clothing", guide: "baby" })[0], "0-3 m", "Baby sizes");
eq(suggestSizePresets({ categoryName: "Kids' Clothing", guide: "top-short" })[0], "2-3 y", "Kids ages");
console.log("measurement-guides.test passed");
