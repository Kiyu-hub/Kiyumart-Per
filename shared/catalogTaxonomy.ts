/**
 * Default KiyuMart department catalog (major e-commerce departments).
 * Only the Clothing & Fashion department launches. All others are registered
 * for expansion but MUST stay disabled until the relevant seller, product,
 * delivery, payment, content and moderation flows have been tested.
 * Categories are leaf/subcategory records linked through departmentId.
 */
export type CatalogDepartmentSeed = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  storeTypes: readonly string[];
  enabledByDefault: boolean;
  launchReady: boolean;
};
export const CATALOG_DEPARTMENTS: readonly CatalogDepartmentSeed[] = [
  { slug: "clothing", name: "Clothing & Fashion", description: "Clothing, footwear, hijabs, modest fashion, bags and accessories", icon: "👗", storeTypes: ["clothing"], enabledByDefault: true, launchReady: true },
  { slug: "electronics", name: "Electronics & Computers", description: "Computers, gadgets, smart devices, audio and accessories", icon: "💻", storeTypes: ["electronics"], enabledByDefault: false, launchReady: false },
  { slug: "phones", name: "Phones & Mobile", description: "Smartphones, tablets, wearables and phone accessories", icon: "📱", storeTypes: ["electronics"], enabledByDefault: false, launchReady: false },
  { slug: "home-furniture", name: "Home & Furniture", description: "Furniture, decor, home textiles and essentials", icon: "🛋️", storeTypes: ["home_garden"], enabledByDefault: false, launchReady: false },
  { slug: "appliances", name: "Home Appliances", description: "Kitchen and household appliances", icon: "🧺", storeTypes: ["home_garden"], enabledByDefault: false, launchReady: false },
  { slug: "beauty", name: "Beauty & Personal Care", description: "Skincare, makeup, haircare and fragrance", icon: "🧴", storeTypes: ["beauty_cosmetics"], enabledByDefault: false, launchReady: false },
  { slug: "health", name: "Health & Wellness", description: "Health, wellbeing and personal care products", icon: "💚", storeTypes: ["health_wellness"], enabledByDefault: false, launchReady: false },
  { slug: "groceries", name: "Groceries & Food", description: "Food staples, packaged food and beverages", icon: "🛒", storeTypes: ["food_beverages"], enabledByDefault: false, launchReady: false },
  { slug: "restaurants", name: "Restaurants & Prepared Meals", description: "Prepared food, restaurant meals and takeaway", icon: "🍽️", storeTypes: ["restaurant"], enabledByDefault: false, launchReady: false },
  { slug: "sports", name: "Sports & Fitness", description: "Fitness equipment, sports apparel and outdoor activities", icon: "🏃", storeTypes: ["sports_fitness"], enabledByDefault: false, launchReady: false },
  { slug: "automotive", name: "Automotive & Parts", description: "Cars, auto parts, maintenance and accessories", icon: "🚗", storeTypes: ["automotive"], enabledByDefault: false, launchReady: false },
  { slug: "books", name: "Books & Stationery", description: "Books, stationery, media and educational materials", icon: "📚", storeTypes: ["books_media"], enabledByDefault: false, launchReady: false },
  { slug: "toys", name: "Toys & Games", description: "Toys, games and playful learning", icon: "🧸", storeTypes: ["toys_games"], enabledByDefault: false, launchReady: false },
  { slug: "baby", name: "Baby & Maternity", description: "Baby care, maternity, nursery and essentials", icon: "👶", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "pets", name: "Pet Supplies", description: "Pet food, care and accessories", icon: "🐾", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "garden", name: "Garden & Outdoor", description: "Plants, gardens, camping and outdoor living", icon: "🌿", storeTypes: ["home_garden"], enabledByDefault: false, launchReady: false },
  { slug: "hardware", name: "Hardware & Tools", description: "Tools, construction and DIY supplies", icon: "🔧", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "industrial", name: "Industrial & Business", description: "Industrial equipment, workplace supplies and B2B goods", icon: "🏭", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "office", name: "Office & School Supplies", description: "Office equipment, school supplies and stationery", icon: "✏️", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "arts", name: "Arts & Crafts", description: "Craft supplies, artworks and creative equipment", icon: "🎨", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "music", name: "Music & Entertainment", description: "Musical instruments, entertainment and media", icon: "🎵", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "travel", name: "Travel & Luggage", description: "Travel gear, suitcases and travel essentials", icon: "🧳", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "gifts", name: "Gifts & Celebrations", description: "Gifts, decorations, events and party supplies", icon: "🎁", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "religious", name: "Religious & Cultural Goods", description: "Religious items, crafts and cultural goods", icon: "🕌", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "agriculture", name: "Agriculture & Farming", description: "Farming inputs, equipment and agricultural products", icon: "🌾", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "digital", name: "Digital Products & Software", description: "Software licenses, ebooks and other digital goods", icon: "💾", storeTypes: [], enabledByDefault: false, launchReady: false },
  { slug: "services", name: "Services & Bookings", description: "Bookings, tailoring and professional services", icon: "📅", storeTypes: [], enabledByDefault: false, launchReady: false },
] as const;

export type FashionSubcategorySeed = { slug: string; name: string; image: string };
/** Actual version-controlled assets; reuse is temporary pending new photography. */
export const FASHION_SUBCATEGORIES: readonly FashionSubcategorySeed[] = [
  { slug: "mens-clothing", name: "Men's Clothing", image: "/attached_assets/stock_images/Men's_fashion_category_image_d439510a.png" },
  { slug: "womens-clothing", name: "Women's Clothing", image: "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png" },
  { slug: "kids-clothing", name: "Kids' Clothing", image: "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png" },
  { slug: "abayas", name: "Abayas", image: "/attached_assets/stock_images/Burgundy_velvet_abaya_with_pearls_c19f2d40.png" },
  { slug: "hijabs", name: "Hijabs & Scarves", image: "/attached_assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png" },
  { slug: "evening-wear", name: "Evening & Occasion Wear", image: "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png" },
  { slug: "accessories", name: "Fashion Accessories", image: "/attached_assets/stock_images/Women's_accessories_category_image_091f4ac1.png" },
  { slug: "dresses", name: "Dresses & Gowns", image: "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png" },
  { slug: "tops-shirts", name: "Tops, Shirts & Blouses", image: "/attached_assets/stock_images/Men's_fashion_category_image_d439510a.png" },
  { slug: "pants-bottoms", name: "Trousers, Skirts & Bottoms", image: "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png" },
  { slug: "modest-fashion", name: "Modest Fashion", image: "/attached_assets/stock_images/Islamic_fashion_hero_banner_6bb20763.png" },
  { slug: "kaftans-traditional", name: "Kaftans & Traditional Wear", image: "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png" },
  { slug: "footwear", name: "Shoes & Footwear", image: "/attached_assets/stock_images/Footwear_category_image_9d3587fc.png" },
  { slug: "bags", name: "Bags & Handbags", image: "/attached_assets/stock_images/Women's_accessories_category_image_091f4ac1.png" },
  { slug: "jewelry-watches", name: "Jewelry & Watches", image: "/attached_assets/stock_images/Men's_watch_product_photo_7b78c9da.png" },
  { slug: "belts-hats", name: "Belts, Caps & Headwear", image: "/attached_assets/stock_images/Men's_fashion_category_image_d439510a.png" },
  { slug: "fabrics-tailoring", name: "Fabrics & Tailoring", image: "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png" },
  { slug: "sportswear", name: "Activewear & Sportswear", image: "/attached_assets/stock_images/Men's_sneakers_product_photo_2c87b833.png" },
  { slug: "sleepwear", name: "Sleepwear & Loungewear", image: "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png" },
  { slug: "wedding-occasion", name: "Wedding & Special Events", image: "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png" },
] as const;

/** Banner destination slugs that must stay valid after the fashion reset. */
export const PROTECTED_FASHION_BANNER_SLUGS = [
  "abayas", "hijabs", "evening-wear", "accessories"
] as const;
