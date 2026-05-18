/**
 * Dev data seeder — populates every storeType with realistic stores,
 * categories, and ≥10 products per (store × category).
 *
 * Everything created here is tagged with `devSeed: true` so that
 * scripts/wipe-dev-data.ts can remove ONLY this data while leaving
 * platform_settings, super_admin, hero_banners, delivery_zones, and any
 * real seller/customer data fully intact.
 *
 * Run:   npm run seed:dev
 * Wipe:  npm run wipe:dev
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { sql, eq } from "drizzle-orm";
import { db } from "../db/index";
import {
  users,
  stores,
  categories,
  products,
  productModifiers,
} from "@shared/schema";
import { STORE_TYPES, type StoreType, buildStoreTypeProductDefaults } from "@shared/storeTypes";

// ============================================================================
//  Constants
// ============================================================================

const DEV_SEED_MARK = { devSeed: true } as const;
const DEFAULT_PASSWORD = "DevSeed123!";
const SEED_EMAIL_DOMAIN = "dev.kiyumart.local"; // never a real domain — easy to filter

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = <T>(arr: T[]): T => arr[rand(0, arr.length - 1)];

// Curated, royalty-free Unsplash images keyed by storeType. These are CDN URLs
// (no API key needed). Each storeType has a small rotating pool so seeded
// catalogs look plausible without us bundling images into the repo.
const IMAGE_POOL: Record<StoreType, string[]> = {
  clothing: [
    "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800",
    "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=800",
    "https://images.unsplash.com/photo-1542272604-787c3835535d?w=800",
    "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?w=800",
  ],
  electronics: [
    "https://images.unsplash.com/photo-1518770660439-4636190af475?w=800",
    "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800",
    "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800",
    "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800",
  ],
  food_beverages: [
    "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=800",
    "https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=800",
    "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=800",
    "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=800",
  ],
  beauty_cosmetics: [
    "https://images.unsplash.com/photo-1522335789203-aaa7c1d0aef0?w=800",
    "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=800",
    "https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=800",
    "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=800",
  ],
  home_garden: [
    "https://images.unsplash.com/photo-1493663284031-b7e3aefcae8e?w=800",
    "https://images.unsplash.com/photo-1556228453-efd6c1ff04f6?w=800",
    "https://images.unsplash.com/photo-1583845112203-29329902332e?w=800",
    "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800",
  ],
  sports_fitness: [
    "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?w=800",
    "https://images.unsplash.com/photo-1517649763962-0c623066013b?w=800",
    "https://images.unsplash.com/photo-1530549387789-4c1017266635?w=800",
    "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800",
  ],
  books_media: [
    "https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=800",
    "https://images.unsplash.com/photo-1495446815901-a7297e633e8d?w=800",
    "https://images.unsplash.com/photo-1532012197267-da84d127e765?w=800",
    "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800",
  ],
  toys_games: [
    "https://images.unsplash.com/photo-1558877385-1d2d1c9b94be?w=800",
    "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=800",
    "https://images.unsplash.com/photo-1587654780291-39c9404d746b?w=800",
    "https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=800",
  ],
  automotive: [
    "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?w=800",
    "https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800",
    "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=800",
    "https://images.unsplash.com/photo-1486006920555-c77dcf18193c?w=800",
  ],
  health_wellness: [
    "https://images.unsplash.com/photo-1556228724-4c8f1f0bc4ed?w=800",
    "https://images.unsplash.com/photo-1559757148-5c350d0d3c56?w=800",
    "https://images.unsplash.com/photo-1505751172876-fa1923c5c528?w=800",
    "https://images.unsplash.com/photo-1471864190281-a93a3070b6de?w=800",
  ],
  restaurant: [
    "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=800",
    "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=800",
    "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=800",
    "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=800",
  ],
};

// ============================================================================
//  Per-storeType catalog: category names + product name templates
// ============================================================================

interface CategorySpec {
  name: string;
  productNames: string[];
  /** Bolt-style per-category dynamic fields (mostly used for cuisines). */
  productFieldsConfig?: any[];
  /** Price band (GHS) — pick a random price in this range. */
  priceBand: [number, number];
  /** Optional modifier groups to attach to every product in this category. */
  modifiers?: Array<{
    name: string;
    options: Array<{ label: string; priceAdj: number }>;
    required?: boolean;
    maxSelections?: number;
  }>;
}

const STORE_TYPE_CATALOG: Record<StoreType, { storeName: string; merchantCategory?: string; businessType?: string; categories: CategorySpec[] }> = {
  clothing: {
    storeName: "Adwoa Modest Boutique",
    merchantCategory: "RETAIL_BOUTIQUE",
    businessType: "store",
    categories: [
      { name: "Abayas", productNames: ["Open Abaya — Pearl Trim", "Classic Black Abaya", "Embroidered Eid Abaya", "Belted Modest Abaya", "Two-Piece Abaya Set", "Kimono Abaya — Sage", "Linen Summer Abaya", "Velvet Maxi Abaya", "Hooded Abaya — Charcoal", "Front-Slit Abaya", "Pleated Sleeve Abaya", "Lace-Hem Abaya"], priceBand: [180, 650] },
      { name: "Dresses", productNames: ["Floral Maxi Dress", "Wrap Midi Dress", "Off-Shoulder Sundress", "Bodycon Evening Dress", "Pleated Day Dress", "Boho Long Dress", "Linen Shirt Dress", "Tiered Cotton Dress", "Satin Slip Dress", "Smock Mini Dress"], priceBand: [120, 480] },
      { name: "Tops & Blouses", productNames: ["Silk Blouse — Ivory", "Puff-Sleeve Top", "Crop Knit Tee", "Ruffle Front Blouse", "Linen Crossover Top", "Mock-Neck Tee", "Off-Shoulder Top", "Lace Cami", "Striped Shirt", "Embroidered Blouse"], priceBand: [70, 260] },
      { name: "Bottoms", productNames: ["Wide-Leg Linen Pants", "High-Waist Jeans", "Pleated Trousers", "Cargo Joggers", "A-Line Midi Skirt", "Cotton Shorts", "Denim Skirt", "Tailored Slacks", "Paperbag Pants", "Maxi Skirt"], priceBand: [90, 320] },
      { name: "Hijabs & Scarves", productNames: ["Chiffon Hijab — Blush", "Modal Square Scarf", "Cotton Hijab — Navy", "Pleated Crinkle Hijab", "Silk Headscarf", "Jersey Wrap Hijab", "Printed Pashmina", "Lightweight Maxi Hijab", "Satin Headwrap", "Cap & Hijab Set"], priceBand: [25, 120] },
      { name: "Accessories", productNames: ["Leather Belt", "Beaded Anklet", "Statement Earrings", "Crossbody Bag", "Tote — Tan", "Sunglasses — Oval", "Layered Necklace", "Hair Clip Set", "Silk Scrunchie Pack", "Watch — Rose Gold"], priceBand: [40, 280] },
    ],
  },
  electronics: {
    storeName: "Kofi Tech Hub",
    merchantCategory: "GENERAL_PROVISIONS",
    businessType: "store",
    categories: [
      { name: "Phones", productNames: ["Samsung A55 — 128GB", "iPhone 13 — 128GB", "Tecno Spark 20", "Xiaomi Redmi Note 13", "Infinix Hot 40", "Pixel 7a", "Samsung A35", "iPhone SE 2022", "Tecno Camon 30", "Itel Vision 5"], priceBand: [800, 7500] },
      { name: "Laptops", productNames: ["HP Pavilion 14", "Lenovo IdeaPad 3", "Dell Inspiron 15", "Acer Aspire 5", "ASUS Vivobook", "MacBook Air M1", "HP EliteBook G8", "MSI Modern 14", "Lenovo ThinkPad E14", "Chromebook Plus"], priceBand: [3500, 18000] },
      { name: "Audio", productNames: ["JBL Flip 6", "Sony WH-CH520", "AirPods 2nd Gen", "Anker Soundcore Q30", "Bose SoundLink Mini", "JBL Tune 510BT", "Marshall Emberton II", "Skullcandy Crusher", "Beats Studio Buds", "Logitech G435"], priceBand: [180, 2400] },
      { name: "Accessories", productNames: ["USB-C Cable 1m", "65W GaN Charger", "Wireless Mouse", "Mechanical Keyboard", "Phone Stand", "MagSafe Wallet", "Surge Protector", "Laptop Sleeve 14\"", "Cable Organizer", "HDMI 2.1 Cable"], priceBand: [25, 380] },
      { name: "Smart Home", productNames: ["WiFi Smart Bulb", "Smart Plug — 4 Pack", "Security Camera 1080p", "Robot Vacuum Lite", "Smart Doorbell", "Smart Power Strip", "WiFi Range Extender", "Bluetooth Tracker", "Smart Thermostat", "Voice Assistant Speaker"], priceBand: [120, 1600] },
      { name: "Gaming", productNames: ["Wireless Controller", "Gaming Headset", "Gaming Mouse 16k DPI", "Mousepad XXL", "Capture Card 1080p60", "Streaming Mic", "RGB Keyboard", "Gaming Chair", "Ring Light", "Console Stand"], priceBand: [80, 2200] },
    ],
  },
  food_beverages: {
    storeName: "Auntie Akua Local Kitchen",
    merchantCategory: "QUICK_EATS",
    businessType: "local_vendor",
    categories: [
      {
        name: "Rice Dishes",
        productNames: ["Jollof Rice with Chicken", "Waakye with Egg", "Fried Rice & Beef", "Coconut Rice & Tilapia", "Plain Rice & Stew", "Banku & Tilapia", "Assorted Jollof", "Sea Food Jollof"],
        priceBand: [25, 75],
        modifiers: [
          { name: "Protein Choice", options: [{ label: "Chicken", priceAdj: 0 }, { label: "Beef", priceAdj: 5 }, { label: "Fish (Tilapia)", priceAdj: 10 }, { label: "Egg", priceAdj: -5 }], required: true, maxSelections: 1 },
          { name: "Add-ons", options: [{ label: "Extra Plantain", priceAdj: 5 }, { label: "Shito Sauce", priceAdj: 2 }, { label: "Salad", priceAdj: 5 }], maxSelections: 3 },
        ],
      },
      { name: "Soups & Stews", productNames: ["Light Soup with Tilapia", "Groundnut Soup with Goat", "Palmnut Soup", "Okro Stew", "Garden Egg Stew", "Kontomire Stew", "Fante Fante Soup", "Ebunu Ebunu Soup", "Pepper Soup", "Tomato Stew"], priceBand: [30, 80] },
      { name: "Snacks", productNames: ["Meat Pie", "Spring Rolls (6)", "Samosa Combo", "Bofrot (Doughnut)", "Chin Chin Pack", "Plantain Chips", "Kelewele Pack", "Roasted Plantain + Groundnut", "Pancake Stack", "Sweet Potato Chips"], priceBand: [8, 40] },
      { name: "Drinks", productNames: ["Sobolo (Hibiscus)", "Pineapple Ginger", "Lamugin", "Asaana Drink", "Tigernut Drink", "Fresh Coconut Water", "Lemon Mint Iced Tea", "Watermelon Juice", "Banana Smoothie", "Cold Bissap"], priceBand: [10, 35] },
      { name: "Beverages — Packaged", productNames: ["Bottled Water 1.5L", "Coke 500ml", "Malta Guinness", "Alvaro Pineapple", "Fan Milk Strawberry", "Voltic 1L", "Sprite 500ml", "Energy Drink 250ml", "Iced Coffee Can", "Apple Juice 1L"], priceBand: [3, 18] },
      { name: "Bakery", productNames: ["Sugar Bread Loaf", "Tea Bread", "Butter Bread", "Coconut Bread", "Banana Bread Slice", "Whole Wheat Loaf", "Cinnamon Roll", "Croissant", "Muffin (Choco)", "Sausage Roll"], priceBand: [5, 30] },
    ],
  },
  beauty_cosmetics: {
    storeName: "Glow by Yaa",
    merchantCategory: "HEALTH_ESSENTIALS",
    businessType: "store",
    categories: [
      { name: "Skincare", productNames: ["Vitamin C Serum", "Hyaluronic Acid Toner", "Niacinamide 10%", "Retinol Night Cream", "Gentle Foaming Cleanser", "Shea Butter Moisturizer", "SPF 50 Sunscreen", "Eye Cream — Coffee", "Clay Mask", "Glow Drops"], priceBand: [40, 280] },
      { name: "Makeup", productNames: ["Matte Lipstick — Plum", "Liquid Eyeliner", "Cream Blush", "Setting Spray", "Foundation Stick", "Concealer Tube", "Pressed Powder", "Mascara — Volume", "Highlighter Palette", "Lip Gloss Trio"], priceBand: [35, 220] },
      { name: "Haircare", productNames: ["Sulfate-Free Shampoo", "Curl Defining Cream", "Deep Conditioner", "Hair Growth Oil", "Edge Control", "Heat Protectant Spray", "Leave-In Detangler", "Hair Mask", "Co-Wash Cleanser", "Bonnet — Satin"], priceBand: [25, 180] },
      { name: "Fragrances", productNames: ["Oud Vanilla EDP 50ml", "Citrus Bergamot EDT", "Rose Musk Body Mist", "Coconut Sandalwood", "Jasmine EDP", "Amber Oud", "Fresh Linen Body Spray", "White Peony EDT", "Bakhour Mist", "Black Vanilla"], priceBand: [70, 450] },
      { name: "Body Care", productNames: ["Shea Body Butter", "Cocoa Lotion 250ml", "Sugar Body Scrub", "Hand Cream — Honey", "Foot Balm", "Body Wash 500ml", "Lavender Soap Bar", "Bath Salts Jar", "Body Oil — Argan", "Roll-On Deodorant"], priceBand: [20, 160] },
    ],
  },
  home_garden: {
    storeName: "Cosy Home Studio",
    merchantCategory: "GENERAL_PROVISIONS",
    businessType: "store",
    categories: [
      { name: "Furniture", productNames: ["Wooden Coffee Table", "Fabric Accent Chair", "Compact Bookshelf", "Bed Frame — Queen", "Office Desk Small", "TV Console 1.4m", "Bar Stool — Tan", "Foldable Dining Table", "Ottoman Storage Bench", "Shoe Rack 4-Tier"], priceBand: [220, 2500] },
      { name: "Kitchen", productNames: ["Non-Stick Pan Set", "Knife Block 6pc", "Glass Storage Jars", "Coffee French Press", "Mixing Bowl Set", "Silicone Spatulas", "Bamboo Cutting Board", "Cast Iron Skillet", "Tea Kettle", "Insulated Tumbler"], priceBand: [40, 480] },
      { name: "Decor", productNames: ["Woven Wall Hanging", "Ceramic Vase Trio", "Scented Candle Jar", "Throw Blanket — Cream", "Velvet Cushion Covers", "Framed Print A2", "LED String Lights", "Brass Mirror Round", "Plant Stand Steel", "Macrame Plant Holder"], priceBand: [25, 320] },
      { name: "Bedding", productNames: ["Cotton Sheet Set Queen", "Linen Duvet Cover", "Memory Foam Pillow", "Weighted Blanket", "Mattress Topper", "Bath Towel Bundle", "Pillowcase Pair Satin", "Bedskirt Pleated", "Throw Pillow Trio", "Cotton Comforter"], priceBand: [80, 760] },
      { name: "Garden", productNames: ["Plant Pot — Terracotta", "Hose 15m", "Hand Trowel Set", "LED Grow Light", "Potting Soil 10L", "Herb Garden Kit", "Outdoor Mat", "Watering Can 5L", "Garden Gloves", "Hanging Planter"], priceBand: [15, 220] },
    ],
  },
  sports_fitness: {
    storeName: "PeakFit Gear",
    merchantCategory: "RETAIL_BOUTIQUE",
    businessType: "store",
    categories: [
      { name: "Fitness Equipment", productNames: ["Yoga Mat 6mm", "Resistance Band Set", "Adjustable Dumbbells", "Jump Rope Pro", "Foam Roller", "Pull-Up Bar Doorway", "Kettlebell 12kg", "Ab Wheel", "Skipping Mat", "Massage Gun Mini"], priceBand: [40, 980] },
      { name: "Sportswear", productNames: ["Compression Shorts", "Performance Tee", "Training Joggers", "Sports Bra", "Running Shorts", "Athletic Hoodie", "Track Jacket", "Tank Top", "Yoga Leggings", "Workout Set"], priceBand: [60, 380] },
      { name: "Footwear", productNames: ["Running Shoes — Neutral", "Trail Sneakers", "Cross-Training Shoes", "Indoor Court Shoe", "Soccer Cleats", "Hiking Boots", "Slide Sandals", "Spikes Track", "Boxing Boots", "Cycling Shoes"], priceBand: [180, 1400] },
      { name: "Outdoor", productNames: ["Hiking Backpack 30L", "Insulated Bottle 1L", "Headlamp Rechargeable", "Tent 2-Person", "Camping Stove", "Cooler Box 20L", "Sleeping Bag", "Trekking Poles", "Rain Poncho", "Compass + Map"], priceBand: [70, 1100] },
      { name: "Cycling", productNames: ["Bike Helmet", "Cycling Gloves", "Tail Light USB", "Front Light Set", "Floor Pump", "Patch Kit", "Saddle Bag", "Water Cage", "Cycle Shorts", "Bell Brass"], priceBand: [20, 480] },
    ],
  },
  books_media: {
    storeName: "Pages & Stories",
    merchantCategory: "GENERAL_PROVISIONS",
    businessType: "store",
    categories: [
      { name: "Fiction", productNames: ["Half of a Yellow Sun", "Things Fall Apart", "Homegoing", "The Death of Vivek Oji", "Nervous Conditions", "Born a Crime", "Stay With Me", "We Need New Names", "The Henna Wars", "The Famished Road"], priceBand: [35, 180] },
      { name: "Non-Fiction", productNames: ["Atomic Habits", "Deep Work", "Rich Dad Poor Dad", "Sapiens", "The 5AM Club", "Africa Rising", "Why We Sleep", "Educated", "Quiet", "Outliers"], priceBand: [40, 220] },
      { name: "Education", productNames: ["BECE Pasco Math", "WASSCE Physics Notes", "Spelling Bee Practice", "Algebra Workbook", "Primary 4 English", "JHS Integrated Science", "Adinkra Symbols Guide", "Twi for Beginners", "Encyclopedia of Africa", "Grammar Essentials"], priceBand: [25, 140] },
      { name: "Children's Books", productNames: ["Tales by Moonlight", "Anansi Stories", "ABC Animals of Ghana", "First Counting Book", "Bedtime Tales", "Funny Faces", "Color Adventure", "Brave Little Lion", "Akua's Big Day", "Where Do Stars Sleep?"], priceBand: [20, 90] },
      { name: "Magazines & Media", productNames: ["GH Style Magazine", "Tech Africa Monthly", "Cooking with Africa DVD", "Music Compilation CD", "Afrobeats Playlist", "Documentary — Ghana", "Audiobook — Half of a Yellow Sun", "Children's Songs CD", "Drumming Lessons DVD", "Yoga Audio Guide"], priceBand: [15, 100] },
    ],
  },
  toys_games: {
    storeName: "Little Stars Toys",
    merchantCategory: "RETAIL_BOUTIQUE",
    businessType: "store",
    categories: [
      { name: "Educational", productNames: ["Wooden Alphabet Blocks", "Counting Beads", "Magnetic Letters", "Shape Sorter Cube", "Mini Microscope Kit", "Solar System Model", "Tangram Puzzle", "Number Tiles", "World Map Floor Puzzle", "Coding Robot Junior"], priceBand: [45, 420] },
      { name: "Board Games", productNames: ["Ludo Classic", "Snakes & Ladders", "Chess Set Wood", "Draughts Set", "Scrabble Original", "Monopoly Junior", "Uno Card Game", "Connect Four", "Memory Match", "Risk — World"], priceBand: [50, 380] },
      { name: "Action Figures", productNames: ["Hero Warrior Figure", "Dino Pack of 6", "Robot Transformer", "Pirate Captain Figure", "Space Astronaut", "Knight & Castle Set", "Football Stars Pack", "Cartoon Hero Set", "Animal Kingdom Pack", "Soldier Set 10pc"], priceBand: [40, 260] },
      { name: "Outdoor Toys", productNames: ["Kite — Eagle", "Skateboard Mini", "Foot Bicycle Pump", "Trampoline Mini", "Hula Hoops Pair", "Bubble Wand Giant", "Sidewalk Chalk Set", "Water Balloon Pack 100", "Frisbee", "Sand Bucket Set"], priceBand: [30, 480] },
      { name: "Plush & Dolls", productNames: ["Teddy Bear Large", "Bunny Soft Toy", "Lion Plush", "Doll with Outfit", "Baby Doll Set", "Princess Doll", "Soft Elephant", "Unicorn Plush", "Penguin Plush", "Astronaut Plush"], priceBand: [40, 320] },
    ],
  },
  automotive: {
    storeName: "RideReady Auto Parts",
    merchantCategory: "GENERAL_PROVISIONS",
    businessType: "store",
    categories: [
      { name: "Parts", productNames: ["Brake Pads Front Set", "Spark Plug — Iridium", "Oil Filter Universal", "Air Filter Sedan", "Timing Belt", "Wheel Bearing", "Alternator Belt", "Radiator Hose", "Fuel Pump", "Ignition Coil"], priceBand: [60, 980] },
      { name: "Accessories", productNames: ["Phone Mount Magnetic", "Seat Cover Set", "Floor Mats Universal", "Steering Wheel Cover", "Dash Cam 1080p", "Sun Shade Front", "Trunk Organizer", "Car Vacuum 12V", "LED Headlight Pair", "Side Mirror Rain Guards"], priceBand: [40, 680] },
      { name: "Tools", productNames: ["Socket Wrench Set", "Tire Inflator 12V", "Jack 2-Ton", "Multimeter Auto", "Battery Booster Cables", "Oil Filter Wrench", "OBD2 Scanner", "Lug Nut Set", "Tow Strap 5m", "Torque Wrench"], priceBand: [80, 1200] },
      { name: "Fluids", productNames: ["Engine Oil 5W30 4L", "Brake Fluid DOT4", "Coolant 5L", "Power Steering Fluid", "Windshield Washer Fluid", "Gear Oil 1L", "ATF Transmission", "Diesel Treatment", "Octane Booster", "AC Refrigerant"], priceBand: [30, 380] },
      { name: "Cleaning", productNames: ["Car Wash Soap 1L", "Microfiber Towels 6pk", "Wax & Polish Tin", "Tire Shine Spray", "Glass Cleaner", "Leather Conditioner", "Engine Degreaser", "All-Purpose Cleaner", "Air Freshener", "Wheel Cleaner"], priceBand: [15, 180] },
    ],
  },
  health_wellness: {
    storeName: "Wellness Pharmacy & Care",
    merchantCategory: "HEALTH_ESSENTIALS",
    businessType: "store",
    categories: [
      { name: "Supplements", productNames: ["Multivitamin 60ct", "Vitamin D3 2000 IU", "Vitamin C 1000mg", "Iron + Folic", "Omega-3 Fish Oil", "Calcium Magnesium", "Probiotic 30 caps", "B-Complex", "Zinc 50mg", "Ashwagandha Caps"], priceBand: [50, 320] },
      { name: "Medical Devices", productNames: ["Digital Thermometer", "Blood Pressure Monitor", "Pulse Oximeter", "Glucose Meter Kit", "Nebulizer", "First Aid Kit", "Compression Stockings", "Crepe Bandage Set", "Knee Brace", "TENS Unit"], priceBand: [40, 1200] },
      { name: "Personal Care", productNames: ["Body Wash Sensitive 500ml", "Toothpaste Whitening", "Toothbrush Electric", "Mouthwash 500ml", "Dental Floss Pick", "Hand Sanitizer 500ml", "Insect Repellent", "Cotton Swabs Pack", "Wet Wipes Pack", "Foot Powder"], priceBand: [15, 240] },
      { name: "Wellness", productNames: ["Herbal Tea Detox", "Sleep Aid Spray", "Mood Balance Tea", "Eye Cooling Mask", "Hot Water Bottle", "Aroma Diffuser", "Lavender Essential Oil", "Magnesium Foot Salt", "Posture Corrector", "Meditation Mat"], priceBand: [25, 380] },
      { name: "First Aid", productNames: ["Sterile Gauze Pack", "Adhesive Bandages 50ct", "Antiseptic Spray", "Burn Cream Tube", "Pain Relief Patch", "Cold Compress Gel", "Tweezers Stainless", "Medical Scissors", "Triangular Bandage", "Eye Wash 250ml"], priceBand: [10, 180] },
    ],
  },
  restaurant: {
    storeName: "Chez Selasi — Restaurant",
    merchantCategory: "QUICK_EATS",
    businessType: "restaurant",
    categories: [
      {
        name: "Pizza",
        productNames: ["Margherita Classic", "Pepperoni Supreme", "BBQ Chicken Pizza", "Veggie Garden Pizza", "Four Cheese", "Hawaiian Pizza", "Spicy Suya Pizza", "Tuna & Olive", "Mushroom Truffle", "Meat Lovers"],
        priceBand: [55, 180],
        productFieldsConfig: [
          { name: "crust", label: "Crust", type: "select", options: ["Thin", "Hand-tossed", "Stuffed", "Gluten-free"], required: true, description: "Pick the crust style." },
          { name: "sauce", label: "Sauce Base", type: "select", options: ["Tomato", "BBQ", "Pesto", "White Garlic"], required: true, description: "Base sauce for this pizza." },
          { name: "toppings", label: "Toppings", type: "multiselect", options: ["Mushrooms", "Olives", "Onions", "Peppers", "Pineapple", "Extra Cheese", "Jalapeños", "Pepperoni"], description: "Pick all toppings on this pizza." },
        ],
        modifiers: [
          { name: "Size", options: [{ label: "Personal (8\")", priceAdj: 0 }, { label: "Medium (12\")", priceAdj: 30 }, { label: "Large (16\")", priceAdj: 65 }], required: true, maxSelections: 1 },
          { name: "Extras", options: [{ label: "Extra Cheese", priceAdj: 10 }, { label: "Chili Oil", priceAdj: 5 }, { label: "Garlic Dip", priceAdj: 4 }], maxSelections: 3 },
        ],
      },
      {
        name: "Burgers",
        productNames: ["Classic Cheeseburger", "Double Beef Stack", "Crispy Chicken Burger", "Spicy Suya Burger", "BBQ Bacon Burger", "Veggie Black Bean", "Fish Fillet Burger", "Mushroom Swiss", "Smash Burger", "Turkey Avocado"],
        priceBand: [40, 95],
        modifiers: [
          { name: "Side", options: [{ label: "Fries", priceAdj: 8 }, { label: "Sweet Potato Fries", priceAdj: 12 }, { label: "Coleslaw", priceAdj: 6 }, { label: "Side Salad", priceAdj: 10 }], maxSelections: 1 },
          { name: "Spice Level", options: [{ label: "Mild", priceAdj: 0 }, { label: "Medium", priceAdj: 0 }, { label: "Hot", priceAdj: 0 }, { label: "Suya Spicy", priceAdj: 2 }], maxSelections: 1 },
        ],
      },
      {
        name: "Local Dishes",
        productNames: ["Jollof Rice & Chicken", "Banku & Tilapia", "Waakye Special", "Fufu & Light Soup", "Tuo Zaafi", "Red Red & Plantain", "Kenkey & Fried Fish", "Yam & Egg Stew", "Akple & Okro", "Konkonte & Soup"],
        priceBand: [40, 110],
      },
      {
        name: "Pasta",
        productNames: ["Spaghetti Bolognese", "Penne Arrabbiata", "Creamy Alfredo", "Carbonara", "Pesto Linguine", "Seafood Spaghetti", "Mac & Cheese", "Lasagna Slice", "Chicken Fettuccine", "Veggie Primavera"],
        priceBand: [50, 130],
      },
      {
        name: "Sushi",
        productNames: ["California Roll (8pc)", "Salmon Nigiri (4pc)", "Spicy Tuna Roll", "Dragon Roll", "Veggie Maki", "Tempura Shrimp Roll", "Avocado Roll", "Eel Nigiri (4pc)", "Rainbow Roll", "Volcano Roll"],
        priceBand: [55, 220],
        productFieldsConfig: [
          { name: "rice", label: "Rice Type", type: "select", options: ["White Sushi Rice", "Brown Rice"], required: true, description: "Pick rice style." },
          { name: "fish", label: "Fish", type: "select", options: ["Salmon", "Tuna", "Eel", "Shrimp", "No Fish (Veggie)"], required: true, description: "Pick the fish (or veggie)." },
          { name: "wasabi", label: "Wasabi & Ginger", type: "select", options: ["Both", "Wasabi Only", "Ginger Only", "Neither"], description: "Sides for your sushi." },
        ],
      },
      {
        name: "Grill & BBQ",
        productNames: ["Suya Skewer Beef", "Grilled Tilapia Whole", "BBQ Chicken Quarter", "Goat Khebab", "Grilled Pork Ribs", "Shawarma Wrap Beef", "Mixed Grill Platter", "Spicy Wings (10pc)", "Lamb Chops Trio", "Smoked Sausage Plate"],
        priceBand: [45, 200],
        modifiers: [
          { name: "Spice", options: [{ label: "Mild", priceAdj: 0 }, { label: "Medium", priceAdj: 0 }, { label: "Hot", priceAdj: 0 }, { label: "Suya Hot", priceAdj: 3 }], required: true, maxSelections: 1 },
        ],
      },
      {
        name: "Drinks",
        productNames: ["Fresh Bissap (Sobolo)", "Pineapple Ginger Juice", "Asaana", "Iced Lemonade", "Iced Coffee", "Mango Smoothie", "Watermelon Cooler", "Cocoa Hot Drink", "Mint Mojito Mocktail", "Sparkling Water"],
        priceBand: [10, 45],
      },
      {
        name: "Desserts",
        productNames: ["Chocolate Lava Cake", "Cheesecake Slice", "Ice Cream Sundae", "Banana Split", "Tiramisu Cup", "Fruit Salad Bowl", "Coconut Tart", "Brownie à la Mode", "Apple Pie Slice", "Crème Brûlée"],
        priceBand: [20, 60],
      },
    ],
  },
};

// ============================================================================
//  Helpers
// ============================================================================

function generateSlug(name: string, suffix?: string): string {
  const base = slugify(name);
  return suffix ? `${base}-${suffix}` : base;
}

function buildProductDescription(productName: string, categoryName: string, storeType: StoreType): string {
  const lower = storeType.toLowerCase();
  if (storeType === "restaurant" || storeType === "food_beverages") {
    return `Freshly prepared ${productName.toLowerCase()} — ${categoryName.toLowerCase()} crafted with quality local ingredients. Served hot and ready to enjoy.`;
  }
  return `Quality ${categoryName.toLowerCase()} item — ${productName}. Carefully curated for our ${lower.replace(/_/g, " ")} customers in Ghana.`;
}

function buildDynamicFields(storeType: StoreType, categoryFields: any[] = []): Record<string, any> {
  // Start with empty defaults for this storeType
  const base = buildStoreTypeProductDefaults(storeType, null);

  // Sensible default values so required dynamic fields are satisfied
  const presets: Record<string, any> = {
    fitType: "Regular fit",
    material: "Cotton",
    careInstructions: "Hand wash cold, hang dry.",
    occasion: ["Everyday wear"],
    genderTarget: "Unisex",
    brand: "Generic",
    model: "Standard",
    keySpecs: "Standard specifications, see product details.",
    warranty: "No warranty",
    condition: "Brand new",
    foodType: "Cooked meal / Local dish",
    prepTime: "10–20 minutes",
    portionOrWeight: "Regular serving",
    storageGuide: "Serve fresh / hot",
    productType: "Skincare",
    skinOrHairType: ["All skin types"],
    benefits: "Hydrates and refreshes the skin.",
    sizeVolume: "Standard size",
    dimensions: "30 x 20 x 10 cm",
    useArea: ["Living room"],
    assemblyNeeded: "No",
    sportCategory: ["Gym"],
    skillLevel: "All levels",
    authorOrCreator: "Various",
    format: "Paperback",
    genre: "General",
    language: "English",
    summary: "Engaging read for all ages.",
    ageRange: "6-8 years",
    toyType: "Educational",
    safetyNote: "Adult supervision recommended for children under 3.",
    vehicleCompatibility: "Universal — most sedans 2010-2024.",
    installationNote: "Professional installation recommended.",
    productCategory: "Supplement",
    prescriptionRequired: "No",
    usageDirections: "Use as directed by product label.",
    keyIngredients: "See product packaging.",
    cuisineType: "Ghanaian",
    mealCategory: "Main course",
    portionSize: "Regular",
    dietaryTags: ["Halal"],
    spiceLevel: "Medium",
  };

  for (const k of Object.keys(base)) {
    if (presets[k] !== undefined) base[k] = presets[k];
  }

  // Cuisine fields — sensible defaults
  for (const f of categoryFields) {
    if (!f?.name) continue;
    if (f.type === "multiselect") base[f.name] = f.options ? [f.options[0]] : [];
    else if (f.type === "select") base[f.name] = f.options?.[0] ?? "";
    else if (f.type === "number") base[f.name] = 0;
    else base[f.name] = "";
  }

  return base;
}

// ============================================================================
//  Upsert helpers
// ============================================================================

async function upsertSellerForStoreType(storeType: StoreType, storeName: string): Promise<string> {
  const email = `seller.${storeType.replace(/_/g, "-")}@${SEED_EMAIL_DOMAIN}`;

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const hashed = await bcrypt.hash(DEFAULT_PASSWORD, 10);
  const [created] = await db
    .insert(users)
    .values({
      email,
      password: hashed,
      name: storeName,
      role: "seller",
      isApproved: true,
      isActive: true,
      emailVerified: true,
      applicationStatus: "approved",
      storeName,
      storeType: storeType as any,
      storeTypeMetadata: { ...DEV_SEED_MARK, storeType, autoSeeded: true } as any,
    })
    .returning({ id: users.id });

  return created.id;
}

async function upsertStoreForSeller(
  sellerId: string,
  storeType: StoreType,
  spec: typeof STORE_TYPE_CATALOG[StoreType],
): Promise<string> {
  const existing = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.primarySellerId, sellerId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].id;
  }

  const [created] = await db
    .insert(stores)
    .values({
      primarySellerId: sellerId,
      name: spec.storeName,
      description: `Dev test ${storeType.replace(/_/g, " ")} store — auto-seeded for QA.`,
      storeType: storeType as any,
      storeTypeMetadata: { ...DEV_SEED_MARK, storeType } as any,
      merchantCategory: spec.merchantCategory ?? null,
      businessType: spec.businessType ?? "store",
      isActive: true,
      isApproved: true,
      verificationStatus: "approved",
      prepTimeMins: storeType === "food_beverages" || storeType === "restaurant" ? rand(10, 25) : 15,
      minOrderAmount: (storeType === "food_beverages" || storeType === "restaurant" ? "20" : "0") as any,
      location: "Accra, Ghana",
      latitude: "5.6037" as any,
      longitude: "-0.1870" as any,
    })
    .returning({ id: stores.id });

  return created.id;
}

async function upsertCategory(name: string, storeType: StoreType, fields?: any[]): Promise<string> {
  const slug = generateSlug(name);
  const existing = await db
    .select({ id: categories.id, storeTypes: categories.storeTypes })
    .from(categories)
    .where(eq(categories.slug, slug))
    .limit(1);

  if (existing.length > 0) {
    // Ensure storeType is in the array — don't strip user-managed values
    const current = existing[0].storeTypes ?? [];
    if (!current.includes(storeType)) {
      await db
        .update(categories)
        .set({ storeTypes: [...current, storeType] })
        .where(eq(categories.id, existing[0].id));
    }
    return existing[0].id;
  }

  const [created] = await db
    .insert(categories)
    .values({
      name,
      slug,
      image: pick(IMAGE_POOL[storeType]),
      description: `${name} — auto-seeded category for ${storeType.replace(/_/g, " ")} stores.`,
      storeTypes: [storeType],
      productFieldsConfig: (fields && fields.length > 0 ? fields : null) as any,
      displayOrder: 0,
      isActive: true,
    })
    .returning({ id: categories.id });

  return created.id;
}

async function productExists(sellerId: string, name: string): Promise<boolean> {
  const rows = await db
    .select({ id: products.id })
    .from(products)
    .where(sql`${products.sellerId} = ${sellerId} AND ${products.name} = ${name}`)
    .limit(1);
  return rows.length > 0;
}

async function seedProducts(
  sellerId: string,
  storeId: string,
  storeType: StoreType,
  categoryId: string,
  categoryName: string,
  spec: CategorySpec,
): Promise<{ created: number; skipped: number; productIds: string[] }> {
  const targetCount = Math.max(10, spec.productNames.length);
  const pool = spec.productNames;
  const productIds: string[] = [];
  let created = 0;
  let skipped = 0;

  for (let i = 0; i < targetCount; i++) {
    const baseName = pool[i % pool.length];
    const productName = i < pool.length ? baseName : `${baseName} #${Math.floor(i / pool.length) + 1}`;

    if (await productExists(sellerId, productName)) {
      skipped++;
      continue;
    }

    const price = rand(spec.priceBand[0], spec.priceBand[1]);
    const images = [pick(IMAGE_POOL[storeType]), pick(IMAGE_POOL[storeType])];
    const dynamicFields = {
      ...buildDynamicFields(storeType, spec.productFieldsConfig ?? []),
      storeSpecific: buildStoreTypeProductDefaults(storeType),
      ...DEV_SEED_MARK,
    };

    const [createdRow] = await db
      .insert(products)
      .values({
        sellerId,
        storeId,
        name: productName,
        description: buildProductDescription(productName, categoryName, storeType),
        categoryId,
        category: categoryName,
        price: String(price) as any,
        stock: rand(15, 80),
        images,
        tags: [categoryName.toLowerCase(), storeType.replace(/_/g, " ")],
        dynamicFields: dynamicFields as any,
        slug: generateSlug(productName, Math.random().toString(36).slice(2, 7)),
        isActive: true,
      })
      .returning({ id: products.id });

    productIds.push(createdRow.id);
    created++;
  }

  return { created, skipped, productIds };
}

async function seedModifiersFor(productIds: string[], spec: CategorySpec): Promise<number> {
  if (!spec.modifiers || spec.modifiers.length === 0) return 0;
  let count = 0;
  for (const pid of productIds) {
    // Skip if modifiers already attached
    const existing = await db
      .select({ id: productModifiers.id })
      .from(productModifiers)
      .where(eq(productModifiers.productId, pid))
      .limit(1);
    if (existing.length > 0) continue;

    for (const m of spec.modifiers) {
      await db.insert(productModifiers).values({
        productId: pid,
        name: m.name,
        options: m.options as any,
        required: m.required ?? false,
        maxSelections: m.maxSelections ?? 1,
      });
      count++;
    }
  }
  return count;
}

// ============================================================================
//  Main
// ============================================================================

async function main() {
  console.log("\n🌱  KiyuMart dev-data seeder");
  console.log("─".repeat(60));
  console.log(`   marker:   devSeed = true on users.storeTypeMetadata,`);
  console.log(`             stores.storeTypeMetadata, products.dynamicFields,`);
  console.log(`             categories created here.`);
  console.log(`   password: ${DEFAULT_PASSWORD} (for every test seller)`);
  console.log(`   domain:   *@${SEED_EMAIL_DOMAIN}`);
  console.log("─".repeat(60));

  let totalProducts = 0;
  let totalCategories = 0;
  let totalStores = 0;
  let totalSellers = 0;
  let totalModifiers = 0;

  for (const storeType of STORE_TYPES) {
    const spec = STORE_TYPE_CATALOG[storeType];
    if (!spec) {
      console.log(`⚠️   No catalog defined for ${storeType} — skipping.`);
      continue;
    }

    console.log(`\n📦  ${storeType.toUpperCase()} — ${spec.storeName}`);

    const sellerId = await upsertSellerForStoreType(storeType, spec.storeName);
    totalSellers++;

    const storeId = await upsertStoreForSeller(sellerId, storeType, spec);
    totalStores++;

    for (const cat of spec.categories) {
      const categoryId = await upsertCategory(cat.name, storeType, cat.productFieldsConfig);
      totalCategories++;

      const { created, skipped, productIds } = await seedProducts(
        sellerId,
        storeId,
        storeType,
        categoryId,
        cat.name,
        cat,
      );
      totalProducts += created;

      const modCount = await seedModifiersFor(productIds, cat);
      totalModifiers += modCount;

      console.log(
        `   ├─ ${cat.name.padEnd(24)} ${String(created).padStart(2)} new, ${String(skipped).padStart(2)} skipped${modCount > 0 ? `, ${modCount} modifiers` : ""}`,
      );
    }
  }

  console.log("\n✅  Seed complete");
  console.log("─".repeat(60));
  console.log(`   Sellers:   ${totalSellers}`);
  console.log(`   Stores:    ${totalStores}`);
  console.log(`   Categories: ${totalCategories}`);
  console.log(`   Products:  ${totalProducts}`);
  console.log(`   Modifiers: ${totalModifiers}`);
  console.log("─".repeat(60));
  console.log(`   Test sellers can sign in with:  ${DEFAULT_PASSWORD}`);
  console.log(`   To wipe ALL seeded data:        npm run wipe:dev -- --confirm`);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("\n❌  Seed failed:", err);
    process.exit(1);
  });
