// KiyuMart local preview — mock API with SAMPLE data only (never production).
// Run: node tools/local-preview/mock-api.mjs [multivendor-store|multivendor-category|single]
//      npx vite --port 5173   (Vite proxies /api to :5000)
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";
const require = createRequire(new URL("../../package.json", import.meta.url));
const express = require("express");

const here = path.dirname(fileURLToPath(import.meta.url));
const MODE = process.env.MOCK_MODE || process.argv[2] || "multivendor-category";
const isMultiVendor = MODE !== "single";
const shopDisplayMode = MODE === "multivendor-store" ? "by-store" : "by-category";
const img = (f) => `/api/mock-img/${encodeURIComponent(f)}`;
const now = new Date("2026-11-20T10:00:00Z").toISOString();

const stores = [
  { id: "st1", primarySellerId: "u1", name: "Amira Modest Wear", logo: img("Elegant_black_abaya_with_gold_embroidery_cc860cad.png"), banner: img("Islamic_fashion_hero_banner_6bb20763.png"), storeType: "clothing", businessType: "store", isActive: true, isApproved: true, verificationStatus: "approved", location: "Accra", sellerName: "Amira", averageRating: "4.8", totalOrders: 120, productCount: 5 },
  { id: "st2", primarySellerId: "u2", name: "Accra Hijab House", logo: img("hijab_scarf_collecti_7b95575d.jpg"), banner: img("Diverse_Islamic_fashion_banner_eb13714d.png"), storeType: "clothing", businessType: "store", isActive: true, isApproved: true, verificationStatus: "approved", location: "Kumasi", sellerName: "Fatima", averageRating: "4.6", totalOrders: 80, productCount: 3 },
  { id: "st3", primarySellerId: "u3", name: "Urban Kente Studio", logo: img("Leather_jacket_product_photo_999cea00.png"), banner: img("Fashion_hero_banner_lifestyle_000ccc89.png"), storeType: "clothing", businessType: "store", isActive: true, isApproved: true, verificationStatus: "approved", location: "Accra", sellerName: "Kojo", averageRating: "4.7", totalOrders: 64, productCount: 4 },
  { id: "st4", primarySellerId: "u4", name: "Luxe Accessories GH", logo: img("Designer_handbag_product_photo_d9f11f99.png"), banner: img("Fashion_hero_banner_lifestyle_000ccc89.png"), storeType: "clothing", businessType: "store", isActive: true, isApproved: true, verificationStatus: "approved", location: "Tema", sellerName: "Esi", averageRating: "4.5", totalOrders: 41, productCount: 2 },
];
const categories = [
  ["c1", "Abayas", "abayas", "cat-abayas.png"],
  ["c2", "Hijabs & Scarves", "hijabs", "cat-hijabs.png"],
  ["c3", "Evening Wear", "evening-wear", "cat-evening.png"],
  ["c4", "Footwear", "footwear", "cat-footwear.png"],
  ["c5", "Men's Fashion", "mens-fashion", "cat-men.png"],
  ["c6", "Accessories", "accessories", "cat-accessories.png"],
].map(([id, name, slug, f], i) => ({ id, name, slug, image: img(f), description: `${name} (sample)`, storeTypes: ["clothing"], displayOrder: i, isActive: true, createdAt: now, updatedAt: now }));

const P = (id, name, price, discount, image, categoryId, storeId, extra = {}) => ({
  id, name, price: String(price), discount: discount || 0, images: [image], categoryId,
  category: categories.find((c) => c.id === categoryId)?.slug, storeId,
  sellerId: stores.find((s) => s.id === storeId)?.primarySellerId, stock: 12, isActive: true,
  ratings: "4.7", totalRatings: 23, description: "Sample product for design review. Not for sale.",
  dynamicFields: { sizes: ["S", "M", "L", "XL"] }, tags: [], createdAt: now, updatedAt: now, ...extra,
});
const products = [
  P("p1", "Burgundy Velvet Abaya with Pearls", 650, 15, img("Burgundy_velvet_abaya_with_pearls_c19f2d40.png"), "c1", "st1", { stock: 8, dynamicFields: { sizeGuide: { displaySystem: "Standard size", bodyRows: [], productRows: [
    { labelSize: "M", length: "142 cm", bust: "103 cm", waist: "91 cm", hips: "111 cm", shoulder: "39 cm", sleeve: "59 cm" },
    { labelSize: "L", length: "144 cm", bust: "108 cm", waist: "96 cm", hips: "116 cm", shoulder: "41 cm", sleeve: "60 cm" },
    { labelSize: "XL", length: "146 cm", bust: "113 cm", waist: "101 cm", hips: "121 cm", shoulder: "43 cm", sleeve: "61 cm" } ] } } }),
  P("p2", "Cream Embroidered Abaya", 520, 0, img("Cream_abaya_with_beige_embroidery_92e12aec.png"), "c1", "st1"),
  P("p3", "Black Abaya with Gold Embroidery", 590, 10, img("Elegant_black_abaya_with_gold_embroidery_cc860cad.png"), "c1", "st1"),
  P("p4", "Emerald Satin Evening Dress", 480, 0, img("Emerald_green_satin_dress_530931af.png"), "c3", "st3"),
  P("p5", "Navy Embroidered Modest Dress", 440, 20, img("Navy_blue_embroidered_modest_dress_aa08f435.png"), "c3", "st1"),
  P("p6", "Pink Lace Abaya Dress", 560, 0, img("Pink_lace_abaya_dress_53759991.png"), "c1", "st2"),
  P("p7", "Floral Summer Dress", 260, 0, img("Summer_dress_product_photo_9f6f8356.png"), "c3", "st3"),
  P("p8", "Men's Classic Leather Jacket", 780, 5, img("Leather_jacket_product_photo_999cea00.png"), "c5", "st3", { categoryName: "Men's Fashion", dynamicFields: { sizeGuide: { displaySystem: "Standard size", bodyRows: [], productRows: [
    { labelSize: "M", length: "70 cm", bust: "106 cm", shoulder: "46 cm", sleeve: "64 cm" },
    { labelSize: "L", length: "72 cm", bust: "112 cm", shoulder: "48 cm", sleeve: "65 cm" } ] } } }),
  P("p9", "Structured Designer Handbag", 690, 0, img("Designer_handbag_product_photo_d9f11f99.png"), "c6", "st4"),
  P("p10", "Men's White Sneakers", 420, 0, img("Men's_sneakers_product_photo_2c87b833.png"), "c4", "st3"),
  P("p11", "Chiffon Hijab Set", 120, 0, img("hijab_scarf_collecti_7b95575d.jpg"), "c2", "st2"),
  P("p12", "Designer Sunglasses", 350, 10, img("Designer_sunglasses_product_photo_2aa575e1.png"), "c6", "st4"),
];
const heroBanners = [
  { id: "b1", title: "Premium Abaya Collection", subtitle: "Elegant modest fashion from Ghanaian sellers", image: img("Islamic_fashion_hero_banner_6bb20763.png"), ctaText: "Shop Now", ctaLink: "/products", storeMode: "both", placement: "home", themeColor: null, isActive: true, displayOrder: 1, createdAt: now },
  { id: "b2", title: "New Season Styles", subtitle: "Fresh looks from independent shops", image: img("Fashion_hero_banner_lifestyle_000ccc89.png"), ctaText: "Explore", ctaLink: "/products", storeMode: "both", placement: "home", themeColor: null, isActive: true, displayOrder: 2, createdAt: now },
  { id: "b3", title: "Modest Fashion for Everyone", subtitle: "Discover KiyuMart sellers", image: img("Diverse_Islamic_fashion_banner_eb13714d.png"), ctaText: "Discover", ctaLink: "/stores", storeMode: "both", placement: "home", themeColor: null, isActive: true, displayOrder: 3, createdAt: now },
];
const settings = {
  id: "settings", platformName: "KiyuMart", isMultiVendor, shopDisplayMode, primaryStoreId: isMultiVendor ? null : "st1",
  primaryColor: "#009688", restaurantsEnabled: false, adsEnabled: false, heroBannerEnabled: false,
  showHomepageFeaturedSection: true, showHomepageNewArrivalSection: true, allowSellerRegistration: true,
  isExternalRiderSystemEnabled: true, currency: "GHS", defaultCurrency: "GHS", logoLight: null, logoDark: null, favicon: null,
  enable3dAr: false, maintenanceMode: false,
};

const app = express();
app.use("/api/mock-img", express.static(process.env.MOCK_IMG_DIR || path.join(here, "../../attached_assets/stock_images"), { maxAge: "1h" }));
const unknown = new Set();
const send = (res, data) => res.json(data);
const visibleProducts = () => (isMultiVendor ? products : products.filter((p) => p.storeId === "st1"));

app.get("/api/health", (_q, r) => send(r, { status: "ok", database: "mock" }));
app.get("/api/maintenance/status", (_q, r) => send(r, { isMaintenanceMode: false, isAutoMaintenance: false, maintenanceMessage: null, maintenanceScheduledEnd: null }));
app.get(["/api/public/platform-settings", "/api/platform-settings", "/api/settings"], (_q, r) => send(r, settings));
app.get("/api/public/analytics-config", (_q, r) => send(r, {}));
app.get("/api/auth/me", (_q, r) => r.status(401).json({ error: "Not authenticated" }));
app.get("/api/categories", (_q, r) => send(r, categories));
app.get("/api/stores", (_q, r) => send(r, stores));
app.get("/api/stores/:id", (q, r) => { const s = stores.find((x) => x.id === q.params.id); s ? send(r, s) : r.status(404).json({ error: "Store not found" }); });
app.get("/api/products", (q, r) => {
  let list = visibleProducts();
  if (q.query.storeId) list = list.filter((p) => p.storeId === q.query.storeId);
  if (q.query.categoryId) list = list.filter((p) => p.categoryId === q.query.categoryId);
  send(r, list);
});
const variantsFor = (id) => id === "p1" ? [
  { id: "v1", productId: "p1", color: "Burgundy", size: "M,L,XL", stock: 5, images: [img("Burgundy_velvet_abaya_with_pearls_c19f2d40.png")] },
  { id: "v2", productId: "p1", color: "Navy", size: "S,M", stock: 3, images: [img("Navy_blue_embroidered_modest_dress_aa08f435.png")] },
] : id === "p8" ? [ { id: "v8", productId: "p8", color: "Black", size: "M,L", stock: 6, images: [img("Leather_jacket_product_photo_999cea00.png")] } ] : [];
app.get("/api/products/:id/variants", (q, r) => send(r, variantsFor(q.params.id)));
app.get("/api/products/:id", (q, r) => { const p = products.find((x) => x.id === q.params.id); p ? send(r, p) : r.status(404).json({ error: "Not found" }); });
app.get("/api/homepage/featured-products", (_q, r) => send(r, visibleProducts().slice(0, 8)));
app.get("/api/homepage/new-arrivals", (_q, r) => send(r, [...visibleProducts()].reverse().slice(0, 8)));
app.get("/api/hero-banners", (_q, r) => send(r, heroBanners));
app.get("/api/homepage/promotional", (_q, r) => send(r, []));
app.get("/api/footer-pages", (_q, r) => send(r, []));
app.get("/api/stores/quotes", (_q, r) => send(r, {}));
app.get("/api/wishlist", (_q, r) => r.status(401).json({ error: "Not authenticated" }));
app.get("/api/cart", (_q, r) => r.status(401).json({ error: "Not authenticated" }));
// Everything else: harmless empty result, logged so gaps are visible.
app.use("/api", (q, r) => { unknown.add(`${q.method} ${q.path}`); q.method === "GET" ? send(r, []) : r.status(403).json({ error: "Mock API: writes disabled" }); });
process.on("SIGTERM", () => { console.log("Unhandled mock paths:", [...unknown].join(", ")); process.exit(0); });
app.listen(5000, () => console.log(`mock API on :5000 mode=${MODE} isMultiVendor=${isMultiVendor} shopDisplayMode=${shopDisplayMode}`));
