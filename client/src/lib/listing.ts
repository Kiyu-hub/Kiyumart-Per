/**
 * Product listing helpers for the phone New arrivals / Featured / Category /
 * All Products pages. Everything is derived from the products themselves
 * (sizes, colours, occasions, stock) — nothing is hard-coded per category.
 */

export type ListingSort = "newest" | "price-asc" | "price-desc" | "discount";

export interface ListingFilters {
  sizes: string[];
  colours: string[];
  types: string[];
  minPrice: number | null;
  maxPrice: number | null;
  inStockOnly: boolean;
}

export const EMPTY_FILTERS: ListingFilters = { sizes: [], colours: [], types: [], minPrice: null, maxPrice: null, inStockOnly: false };

const LETTER_SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "2XL", "XXXL", "3XL", "4XL", "5XL", "FREE SIZE", "ONE SIZE"];
function sizeRank(label: string): [number, number] {
  const t = label.trim().toUpperCase();
  const letter = LETTER_SIZE_ORDER.indexOf(t);
  if (letter >= 0) return [0, letter];
  const num = parseFloat(t.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(num)) return [t.includes("Y") ? 2 : 1, num];
  return [3, 0];
}
export function sortSizes(sizes: string[]): string[] {
  return sizes
    .map((s, i) => ({ s, i, r: sizeRank(s) }))
    .sort((a, b) => a.r[0] - b.r[0] || a.r[1] - b.r[1] || a.i - b.i)
    .map((x) => x.s);
}

const SWATCHES: Record<string, string> = {
  black: "#121212", white: "#f8f8f6", red: "#c62828", blue: "#1e56c4", navy: "#1f2f5c", green: "#2e7d32",
  emerald: "#0b6e4f", yellow: "#f2c200", orange: "#ef6c00", pink: "#ec5f95", purple: "#7b3fa0", brown: "#7a4e33",
  beige: "#d8c3a5", cream: "#f2ead8", grey: "#8a8a8a", gray: "#8a8a8a", gold: "#c9a227", silver: "#b9bec5",
  maroon: "#6d1b1b", wine: "#6d1b2e", burgundy: "#7a1626", nude: "#d6a77a", tan: "#c19a6b", olive: "#6b6b2a",
  teal: "#00897b", turquoise: "#1fb5ad", mint: "#9ed9c3", sky: "#7cc4ea", coral: "#f2735a", peach: "#f6b48f",
  lilac: "#c3a6d8", lavender: "#b9a3dc", violet: "#7f4fc9", khaki: "#b5a26c", mustard: "#d1a21f", charcoal: "#36383b",
  ivory: "#f6f1e3", champagne: "#e9d9b8", rose: "#d97a8c", magenta: "#c2185b", camel: "#b5884f", denim: "#3b5b8a",
  indigo: "#2f3e9e", lime: "#9acd32", rust: "#a8451f", copper: "#b06a3b", bronze: "#8c6a3f", sand: "#d9c49c",
  taupe: "#8b7d70", plum: "#5e2750", mauve: "#b2879a", fuchsia: "#d63384", blush: "#efb8b8", aqua: "#3fc9c9",
};
export function swatchFor(name: string): string {
  const words = String(name || "").trim().toLowerCase().split(/\s+/);
  for (let i = words.length - 1; i >= 0; i--) if (SWATCHES[words[i]]) return SWATCHES[words[i]];
  return "#c9c5be";
}

const variants = (p: any): any[] => (Array.isArray(p?.dynamicFields?.variantSummary) ? p.dynamicFields.variantSummary : []);
const norm = (s: unknown) => String(s ?? "").trim();
const lower = (s: unknown) => norm(s).toLowerCase();

/** Price the shopper pays (same rule as checkout): price × (1 − discount%). */
export const priceOf = (p: any) => {
  const list = Number(p?.price) || 0;
  const d = Number(p?.discount) || 0;
  return d > 0 && d < 100 ? list * (1 - d / 100) : list;
};
export function discountOf(p: any): number {
  const price = priceOf(p);
  const list = Number(p?.price) || 0;
  const cost = Number(p?.costPrice) || 0;
  const was = cost > price ? cost : list > price ? list : 0;
  return was > 0 ? Math.round(((was - price) / was) * 100) : 0;
}

/** Sold out only when stock is known to be 0 (missing data is not "sold out"). */
export function isSoldOut(p: any): boolean {
  return p?.stock !== undefined && p?.stock !== null && Number(p.stock) <= 0;
}

/** Sizes that still have stock (sizes with unknown stock count as available). */
export function sizesOf(p: any, inStockOnly = true): string[] {
  const out = new Set<string>();
  for (const v of variants(p)) {
    const s = norm(v?.size);
    if (!s) continue;
    if (inStockOnly && v?.stock !== undefined && v?.stock !== null && Number(v.stock) <= 0) continue;
    out.add(s);
  }
  return Array.from(out);
}

export function coloursOf(p: any): string[] {
  const out = new Map<string, string>();
  for (const v of variants(p)) {
    const c = norm(v?.color);
    if (c && !out.has(c.toLowerCase())) out.set(c.toLowerCase(), c);
  }
  return Array.from(out.values());
}

/** "Shop by type": occasions the seller ticked (e.g. Everyday wear, Evening). */
export function typesOf(p: any): string[] {
  const occ = p?.dynamicFields?.storeSpecific?.occasion;
  const list = Array.isArray(occ) ? occ : occ ? [occ] : [];
  return list.map(norm).filter(Boolean);
}

/** Unique values across products, most common first (ties keep first-seen order). */
function tally(products: any[], pick: (p: any) => string[]): string[] {
  const counts = new Map<string, { label: string; n: number; i: number }>();
  let i = 0;
  for (const p of products) {
    for (const v of Array.from(new Set(pick(p).map((x) => x.trim()).filter(Boolean)))) {
      const k = v.toLowerCase();
      const e = counts.get(k);
      if (e) e.n++;
      else counts.set(k, { label: v, n: 1, i: i++ });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.n - a.n || a.i - b.i).map((e) => e.label);
}

export function availableSizes(products: any[]): string[] {
  return sortSizes(tally(products, (p) => sizesOf(p)));
}
export function availableColours(products: any[]): string[] {
  return tally(products, coloursOf);
}
export function availableTypes(products: any[]): string[] {
  return tally(products, typesOf);
}
export function priceBounds(products: any[]): { min: number; max: number } | null {
  const prices = products.map(priceOf).filter((n) => n > 0);
  if (!prices.length) return null;
  return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
}

export function countActiveFilters(f: ListingFilters): number {
  return f.sizes.length + f.colours.length + f.types.length + (f.minPrice !== null || f.maxPrice !== null ? 1 : 0) + (f.inStockOnly ? 1 : 0);
}

export function applyFilters(products: any[], f: ListingFilters): any[] {
  const sizes = new Set(f.sizes.map(lower));
  const colours = new Set(f.colours.map(lower));
  const types = new Set(f.types.map(lower));
  return products.filter((p) => {
    if (f.inStockOnly && isSoldOut(p)) return false;
    if (sizes.size && !sizesOf(p).some((s) => sizes.has(lower(s)))) return false;
    if (colours.size && !coloursOf(p).some((c) => colours.has(lower(c)))) return false;
    if (types.size && !typesOf(p).some((t) => types.has(lower(t)))) return false;
    const price = priceOf(p);
    if (f.minPrice !== null && price < f.minPrice) return false;
    if (f.maxPrice !== null && price > f.maxPrice) return false;
    return true;
  });
}

const time = (p: any) => new Date(p?.createdAt || 0).getTime() || 0;

/** Sorts, always keeping sold-out products after the ones in stock. */
export function sortProducts(products: any[], sort: ListingSort): any[] {
  const cmp: Record<ListingSort, (a: any, b: any) => number> = {
    newest: (a, b) => time(b) - time(a),
    "price-asc": (a, b) => priceOf(a) - priceOf(b),
    "price-desc": (a, b) => priceOf(b) - priceOf(a),
    discount: (a, b) => discountOf(b) - discountOf(a) || time(b) - time(a),
  };
  return products
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(isSoldOut(a.p)) - Number(isSoldOut(b.p)) || cmp[sort](a.p, b.p) || a.i - b.i)
    .map((x) => x.p);
}

export type ArrivalGroup = { key: "today" | "week" | "earlier"; title: string; products: any[] };

/** New arrivals grouped by when they were added. Empty groups are dropped. */
export function groupByArrival(products: any[], now = Date.now()): ArrivalGroup[] {
  const DAY = 86_400_000;
  const groups: ArrivalGroup[] = [
    { key: "today", title: "Today", products: [] },
    { key: "week", title: "This week", products: [] },
    { key: "earlier", title: "Earlier", products: [] },
  ];
  for (const p of products) {
    const age = now - time(p);
    groups[age < DAY ? 0 : age < 7 * DAY ? 1 : 2].products.push(p);
  }
  return groups.filter((g) => g.products.length > 0);
}

/**
 * Editor's pick: the best-presented product that is in stock. Scores what
 * makes a product page look good — photos (studio photos count extra), a
 * proper description, filled-in details, a size guide, colour options, a
 * real discount and genuine ratings. Ties go to the newest.
 */
export function editorScore(p: any): number {
  if (isSoldOut(p)) return -1;
  const images = Array.isArray(p?.images) ? p.images.filter(Boolean) : [];
  let score = Math.min(images.length, 6) * 2;
  if (images.some((u: string) => String(u).includes("e_background_removal"))) score += 3;
  const desc = norm(p?.description);
  score += desc.length >= 200 ? 3 : desc.length >= 80 ? 2 : desc.length > 0 ? 1 : 0;
  const spec = p?.dynamicFields?.storeSpecific || {};
  score += Object.values(spec).filter((v) => (Array.isArray(v) ? v.length > 0 : norm(v).length > 0)).length;
  if (p?.dynamicFields?.measurementGuide) score += 3;
  score += Math.min(coloursOf(p).length, 3);
  score += Math.min(sizesOf(p).length, 4) * 0.5;
  const disc = discountOf(p);
  if (disc > 0) score += Math.min(disc / 10, 3);
  const rating = Number(p?.ratings) || 0;
  const count = Number(p?.totalRatings) || 0;
  if (rating > 0 && count > 0) score += Math.min(rating, 5) * Math.min(count, 20) / 20;
  return score;
}

export function pickEditorsPick(products: any[]): any | null {
  let best: any = null;
  let bestScore = -1;
  for (const p of products) {
    const s = editorScore(p);
    if (s < 0) continue;
    if (s > bestScore || (s === bestScore && time(p) > time(best))) { best = p; bestScore = s; }
  }
  return best;
}
