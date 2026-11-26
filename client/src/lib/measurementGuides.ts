/**
 * Measurement guides for fashion products.
 *
 * Each guide has a line-art picture in /public/measure/<id>.svg whose numbered
 * dots match the order of `fields` below (dot 1 = fields[0], …). Sellers fill
 * the numbers per size in the add-product flow; buyers see the same picture
 * with the seller's numbers on the product page.
 *
 * Stored on the product as `dynamicFields.measurementGuide` (see
 * MeasurementGuideData). Overlapping keys are also mirrored into the older
 * `dynamicFields.sizeGuide` shape so the desktop product page keeps working.
 */

export type MeasurementGuideId =
  | "dress-short" | "abaya" | "top-short" | "top-long" | "shirt-long" | "jacket"
  | "kaftan" | "trousers" | "shorts" | "skirt" | "hijab" | "shoes" | "bag";

export type BodyGuideId = "body-women" | "body-men";

export interface MeasurementField { key: string; label: string; hint?: string }

export interface MeasurementGuideDef {
  id: MeasurementGuideId;
  label: string;
  /** Short help shown next to the picture. */
  howTo: string[];
  fields: MeasurementField[];
  /** true: one set of numbers for the whole product (no per-size rows). */
  oneSize?: boolean;
  /** Shoes use a size chart (EU/UK/US) plus foot measurements. */
  kind?: "garment" | "shoes" | "item";
}

const FLAT = "Lay the item flat and measure in a straight line.";
const DOUBLE = "Bust, chest, waist and hips: measure across, then double it.";

export const MEASUREMENT_GUIDES: Record<MeasurementGuideId, MeasurementGuideDef> = {
  "dress-short": {
    id: "dress-short", label: "Dress, short sleeve", howTo: [FLAT, DOUBLE, "Length: top of the shoulder to the hem."],
    fields: [
      { key: "shoulder", label: "Shoulder" }, { key: "sleeve", label: "Sleeve length" },
      { key: "bust", label: "Bust" }, { key: "waist", label: "Waist" },
      { key: "hips", label: "Hips" }, { key: "length", label: "Length" },
    ],
  },
  abaya: {
    id: "abaya", label: "Abaya / long dress / gown", howTo: [FLAT, DOUBLE, "Length: top of the shoulder to the hem."],
    fields: [
      { key: "shoulder", label: "Shoulder" }, { key: "sleeve", label: "Sleeve length" },
      { key: "bust", label: "Bust" }, { key: "waist", label: "Waist" },
      { key: "hips", label: "Hips" }, { key: "length", label: "Length" },
    ],
  },
  "top-short": {
    id: "top-short", label: "Top / T-shirt, short sleeve", howTo: [FLAT, DOUBLE, "Length: top of the shoulder to the hem."],
    fields: [
      { key: "shoulder", label: "Shoulder" }, { key: "sleeve", label: "Sleeve length" },
      { key: "bust", label: "Chest / bust" }, { key: "length", label: "Length" },
    ],
  },
  "top-long": {
    id: "top-long", label: "Top / blouse, long sleeve", howTo: [FLAT, DOUBLE, "Length: top of the shoulder to the hem."],
    fields: [
      { key: "shoulder", label: "Shoulder" }, { key: "sleeve", label: "Sleeve length" },
      { key: "bust", label: "Chest / bust" }, { key: "length", label: "Length" },
    ],
  },
  "shirt-long": {
    id: "shirt-long", label: "Shirt", howTo: [FLAT, "Neck: around the buttoned collar.", DOUBLE],
    fields: [
      { key: "neck", label: "Neck" }, { key: "shoulder", label: "Shoulder" },
      { key: "sleeve", label: "Sleeve length" }, { key: "bust", label: "Chest" },
      { key: "waist", label: "Waist" }, { key: "length", label: "Length" },
    ],
  },
  jacket: {
    id: "jacket", label: "Jacket / coat / suit", howTo: [FLAT, DOUBLE, "Length: top of the shoulder to the hem."],
    fields: [
      { key: "shoulder", label: "Shoulder" }, { key: "sleeve", label: "Sleeve length" },
      { key: "bust", label: "Chest" }, { key: "waist", label: "Waist" }, { key: "length", label: "Length" },
    ],
  },
  kaftan: {
    id: "kaftan", label: "Kaftan / jalabiya / smock", howTo: [FLAT, DOUBLE, "Length: top of the shoulder to the hem."],
    fields: [
      { key: "shoulder", label: "Shoulder" }, { key: "sleeve", label: "Sleeve length" },
      { key: "bust", label: "Chest" }, { key: "length", label: "Length" },
    ],
  },
  trousers: {
    id: "trousers", label: "Trousers / jeans", howTo: [FLAT, "Waist and hips: measure across, then double it.", "Inside leg: crotch seam to the hem."],
    fields: [
      { key: "waist", label: "Waist" }, { key: "hips", label: "Hips" }, { key: "thigh", label: "Thigh" },
      { key: "inseam", label: "Inside leg" }, { key: "length", label: "Length" }, { key: "legOpening", label: "Leg opening" },
    ],
  },
  shorts: {
    id: "shorts", label: "Shorts", howTo: [FLAT, "Waist and hips: measure across, then double it."],
    fields: [
      { key: "waist", label: "Waist" }, { key: "hips", label: "Hips" }, { key: "inseam", label: "Inside leg" },
      { key: "length", label: "Length" }, { key: "legOpening", label: "Leg opening" },
    ],
  },
  skirt: {
    id: "skirt", label: "Skirt", howTo: [FLAT, "Waist and hips: measure across, then double it.", "Length: waistband to the hem."],
    fields: [{ key: "waist", label: "Waist" }, { key: "hips", label: "Hips" }, { key: "length", label: "Length" }],
  },
  hijab: {
    id: "hijab", label: "Hijab / scarf", howTo: ["Spread the scarf flat.", "Measure the long side, then the short side."], oneSize: true, kind: "item",
    fields: [{ key: "length", label: "Length" }, { key: "width", label: "Width" }],
  },
  shoes: {
    id: "shoes", label: "Shoes", kind: "shoes",
    howTo: ["1: stand on paper, mark the heel and the longest toe, measure between.", "2: the widest part of the foot. Optional."],
    fields: [{ key: "footLength", label: "Foot length" }, { key: "footWidth", label: "Foot width" }],
  },
  bag: {
    id: "bag", label: "Bag", howTo: ["Measure the bag empty, standing up.", "Strap drop: top of the handle to the top of the bag."], oneSize: true, kind: "item",
    fields: [
      { key: "width", label: "Width" }, { key: "height", label: "Height" },
      { key: "depth", label: "Depth" }, { key: "strapDrop", label: "Strap drop" },
    ],
  },
};

export const BODY_GUIDES: Record<BodyGuideId, { id: BodyGuideId; label: string; fields: MeasurementField[] }> = {
  "body-women": { id: "body-women", label: "Body sizes (women)", fields: [
    { key: "bust", label: "Bust" }, { key: "waist", label: "Waist" }, { key: "hips", label: "Hips" }, { key: "height", label: "Height" },
  ] },
  "body-men": { id: "body-men", label: "Body sizes (men)", fields: [
    { key: "bust", label: "Chest" }, { key: "waist", label: "Waist" }, { key: "hips", label: "Hips" }, { key: "height", label: "Height" },
  ] },
};

/** Guides a seller can switch between in step 3, in a sensible order. */
export const GARMENT_GUIDE_CHOICES: MeasurementGuideId[] = [
  "dress-short", "abaya", "top-short", "top-long", "shirt-long", "jacket", "kaftan",
  "trousers", "shorts", "skirt", "hijab", "shoes", "bag",
];

export const measurementPicture = (id: MeasurementGuideId | BodyGuideId) => `/measure/${id}.svg`;

/** What step 3 should be for a product. */
export type ProductMeasureMode =
  | { mode: "garment"; guide: MeasurementGuideId }
  | { mode: "none" }      // accessories with nothing to measure (jewellery, belts, fabric…)
  | { mode: "beauty" };   // beauty & cosmetics: size/volume and product facts instead

/**
 * Picks the right step 3 from the store type, category slug/name and who the
 * item is for. Sellers can still switch the garment picture in step 3.
 */
export function suggestMeasureMode(input: {
  storeType?: string | null;
  categorySlug?: string | null;
  categoryName?: string | null;
  genderTarget?: string | null;
}): ProductMeasureMode {
  if (input.storeType === "beauty_cosmetics") return { mode: "beauty" };
  const text = `${input.categorySlug || ""} ${input.categoryName || ""}`.toLowerCase();
  const men = /^(men|boys)$/i.test(String(input.genderTarget || ""));
  const has = (...words: string[]) => words.some((w) => text.includes(w));

  if (has("foot", "shoe", "sandal", "sneaker", "slipper", "heel")) return { mode: "garment", guide: "shoes" };
  if (has("bag", "handbag", "purse", "backpack")) return { mode: "garment", guide: "bag" };
  if (has("hijab", "scarf", "scarves", "shawl", "veil")) return { mode: "garment", guide: "hijab" };
  if (has("jewel", "watch", "belt", "cap", "hat", "headwear", "fabric", "tailoring", "accessor", "sunglass")) return { mode: "none" };
  if (has("trouser", "pant", "jean")) return { mode: "garment", guide: "trousers" };
  if (has("skirt")) return { mode: "garment", guide: "skirt" };
  if (has("short")) return { mode: "garment", guide: "shorts" };
  if (has("bottom")) return { mode: "garment", guide: "trousers" };
  if (has("jacket", "coat", "suit", "blazer")) return { mode: "garment", guide: "jacket" };
  if (has("kaftan", "jalabiya", "smock", "traditional", "agbada")) return { mode: "garment", guide: men ? "kaftan" : "abaya" };
  if (has("abaya")) return { mode: "garment", guide: "abaya" };
  if (has("dress")) return { mode: "garment", guide: "dress-short" };
  if (has("evening", "occasion", "wedding", "gown", "modest")) return { mode: "garment", guide: men ? "kaftan" : "abaya" };
  if (has("sleep", "lounge")) return { mode: "garment", guide: "top-long" };
  if (has("top", "shirt", "blouse", "tee", "sport", "active")) return { mode: "garment", guide: men ? "shirt-long" : "top-short" };
  if (has("men's", "mens")) return { mode: "garment", guide: "shirt-long" };
  if (has("women", "kids", "girl", "boy")) return { mode: "garment", guide: men ? "shirt-long" : "dress-short" };
  return { mode: "garment", guide: men ? "shirt-long" : "dress-short" };
}

export interface MeasurementGuideData {
  type: MeasurementGuideId;
  unit: "cm" | "in";
  /** size label → field key → value (as typed). oneSize guides use the key "One size". */
  rows: Record<string, Record<string, string>>;
  /** Optional body chart: size label → field key → value. */
  body?: { guide: BodyGuideId; rows: Record<string, Record<string, string>> };
  /** Shoes: size label (EU) → { uk, us }, plus overall fit. */
  shoeSizes?: Record<string, { uk?: string; us?: string }>;
  shoeFit?: "small" | "true" | "large";
}

/** Mirrors the new guide into the older sizeGuide shape used on desktop. */
export function toLegacySizeGuide(data: MeasurementGuideData) {
  const legacyKeys = ["length", "bust", "waist", "hips", "shoulder", "sleeve"] as const;
  const productRows = Object.entries(data.rows).map(([size, values]) => {
    const row: Record<string, string> = { labelSize: size, uk: "", bust: "", waist: "", hips: "", height: "", length: "", shoulder: "", sleeve: "" };
    for (const k of legacyKeys) if (values[k]) row[k] = `${values[k]}${data.unit === "in" ? '"' : " cm"}`;
    return row;
  });
  const bodyRows = data.body
    ? Object.entries(data.body.rows).map(([size, values]) => ({
        labelSize: size, uk: "", bust: values.bust || "", waist: values.waist || "", hips: values.hips || "",
        height: values.height || "", length: "", shoulder: "", sleeve: "",
      }))
    : [];
  return { displaySystem: "Standard size", bodyRows, productRows };
}

/**
 * Standard adult EU → UK size and typical foot length, used only to pre-fill
 * the shoe chart. US sizes differ between men and women, so they are left for
 * the seller to type.
 */
export const SHOE_SIZE_TABLE: Record<string, { uk: string; cm: string }> = {
  "35": { uk: "2.5", cm: "22.5" }, "36": { uk: "3.5", cm: "23" }, "37": { uk: "4", cm: "23.7" },
  "38": { uk: "5", cm: "24.3" }, "39": { uk: "6", cm: "25" }, "40": { uk: "6.5", cm: "25.4" },
  "41": { uk: "7", cm: "26" }, "42": { uk: "8", cm: "26.7" }, "43": { uk: "9", cm: "27.3" },
  "44": { uk: "9.5", cm: "28" }, "45": { uk: "10.5", cm: "28.6" }, "46": { uk: "11", cm: "29.3" },
  "47": { uk: "12", cm: "30" },
};
