import "dotenv/config";
import { db } from "../db/index";
import {
  users,
  products,
  stores,
  categories,
  orders,
  reviews,
  heroBanners,
  footerPages,
  deliveryZones,
  orderItems,
  chatMessages,
  notifications,
  cart,
  transactions,
  adminPermissions,
  passwordResetTokens,
  supportConversations,
  supportMessages,
  deliveryAssignments,
  mediaLibrary,
  wishlists,
  commissions,
  sellerPayouts,
  platformEarnings
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

const STORE_TYPES = [
  "clothing",
  "electronics",
  "beauty_cosmetics",
  "home_garden",
  "sports_fitness",
  "books_media",
  "toys_games",
  "food_beverages",
  "health_wellness",
  "automotive"
] as const;

function generateSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

async function seed() {
  console.log("🌱 Starting comprehensive seed...");

  try {
    console.log("🧹 Clearing existing data...");
    await db.delete(supportMessages);
    await db.delete(supportConversations);
    await db.delete(deliveryAssignments);
    await db.delete(mediaLibrary);
    await db.delete(wishlists);
    await db.delete(sellerPayouts);
    await db.delete(commissions);
    await db.delete(platformEarnings);
    await db.delete(chatMessages);
    await db.delete(notifications);
    await db.delete(cart);
    await db.delete(transactions);
    await db.delete(orderItems);
    await db.delete(reviews);
    await db.delete(orders);
    await db.delete(products);
    await db.delete(stores);
    await db.delete(adminPermissions);
    await db.delete(passwordResetTokens);
    await db.delete(categories);
    await db.delete(heroBanners);
    await db.delete(footerPages);
    await db.delete(deliveryZones);
    await db.delete(users);

    console.log("👥 Seeding users...");
    const hashedPassword = await bcrypt.hash("password123", 10);

    const [superAdmin] = await db.insert(users).values({
      email: "superadmin@kiyumart.com",
      password: hashedPassword,
      name: "Super Admin",
      role: "super_admin",
      isApproved: true
    }).returning();

    const [admin1] = await db.insert(users).values({
      email: "admin1@kiyumart.com",
      password: hashedPassword,
      name: "Admin One",
      role: "admin",
      isApproved: true
    }).returning();

    const [admin2] = await db.insert(users).values({
      email: "admin2@kiyumart.com",
      password: hashedPassword,
      name: "Admin Two",
      role: "admin",
      isApproved: true
    }).returning();

    const sellers: typeof users.$inferSelect[] = [];
    for (let i = 0; i < STORE_TYPES.length; i++) {
      const storeType = STORE_TYPES[i];
      const [seller] = await db.insert(users).values({
        email: `seller.${storeType}@kiyumart.com`,
        password: hashedPassword,
        name: `${storeType.charAt(0).toUpperCase() + storeType.slice(1)} Seller`,
        role: "seller",
        phone: `+233${2400000000 + i}`,
        storeType,
        storeName: `${storeType.charAt(0).toUpperCase() + storeType.slice(1).replace('_', ' ')} Store`,
        businessAddress: `${i + 1} Market Street, Accra, Ghana`,
        isApproved: true,
        profileImage: `https://res.cloudinary.com/demo/image/upload/sample.jpg`
      }).returning();
      sellers.push(seller);
    }

    const riders: typeof users.$inferSelect[] = [];
    for (let i = 0; i < 5; i++) {
      const [rider] = await db.insert(users).values({
        email: `rider${i + 1}@kiyumart.com`,
        password: hashedPassword,
        name: `Rider ${i + 1}`,
        role: "rider",
        phone: `+233${2500000000 + i}`,
        vehicleInfo: { type: i % 2 === 0 ? "motorcycle" : "bicycle", plateNumber: `GH-${1000 + i}` } as { type: string; plateNumber?: string; license?: string; color?: string },
        isApproved: true,
        profileImage: `https://res.cloudinary.com/demo/image/upload/sample.jpg`
      }).returning();
      riders.push(rider);
    }

    const buyers: typeof users.$inferSelect[] = [];
    for (let i = 0; i < 20; i++) {
      const [buyer] = await db.insert(users).values({
        email: `buyer${i + 1}@kiyumart.com`,
        password: hashedPassword,
        name: `Customer ${i + 1}`,
        role: "buyer",
        phone: `+233${2600000000 + i}`
      }).returning();
      buyers.push(buyer);
    }

    console.log(`✅ Created ${1 + 2 + sellers.length + riders.length + buyers.length} users`);

    console.log("📦 Seeding delivery zones...");
    const zones = ["Accra Central", "Kumasi", "Takoradi", "Tamale", "Cape Coast"];
    const zoneRecords: typeof deliveryZones.$inferSelect[] = [];
    for (let i = 0; i < zones.length; i++) {
      const [zone] = await db.insert(deliveryZones).values({
        name: zones[i],
        fee: String(10 + (i * 5)),
        isActive: true
      }).returning();
      zoneRecords.push(zone);
    }

    console.log("🏪 Seeding stores...");
    const storesData: typeof stores.$inferSelect[] = [];
    for (const seller of sellers) {
      const [store] = await db.insert(stores).values({
        name: seller.storeName!,
        description: `Premium ${seller.storeType} products for modest fashion enthusiasts`,
        primarySellerId: seller.id,
        storeType: seller.storeType!,
        isActive: true,
        logo: seller.profileImage
      }).returning();
      storesData.push(store);
    }

    console.log("📑 Seeding simplified categories (5 per store type)...");
    const categoryMapping: Record<string, string[]> = {
      clothing: ["Hijabs & Scarves", "Abayas & Jilbabs", "Modest Dresses", "Islamic Accessories", "Modest Footwear"],
      electronics: ["Smartphones", "Laptops & Tablets", "Accessories", "Smart Home", "Audio & Gaming"],
      beauty_cosmetics: ["Halal Skincare", "Halal Makeup", "Haircare", "Fragrances", "Beauty Tools"],
      home_garden: ["Furniture", "Decor", "Kitchen", "Garden", "Storage"],
      sports_fitness: ["Modest Sportswear", "Fitness Equipment", "Outdoor Gear", "Yoga & Meditation", "Sports Accessories"],
      books_media: ["Islamic Books", "Children's Books", "Educational", "Arabic Literature", "Self-Help"],
      toys_games: ["Educational Toys", "Dolls & Figures", "Games", "Arts & Crafts", "Outdoor Toys"],
      food_beverages: ["Halal Snacks", "Dates & Honey", "Spices", "Halal Meat", "Beverages"],
      health_wellness: ["Vitamins", "First Aid", "Personal Care", "Wellness", "Medical Devices"],
      automotive: ["Car Accessories", "Tools", "Care Products", "Electronics", "Safety"]
    };

    const allCategories: typeof categories.$inferSelect[] = [];
    for (const [storeType, cats] of Object.entries(categoryMapping)) {
      for (const catName of cats) {
        const [cat] = await db.insert(categories).values({
          name: catName,
          slug: generateSlug(catName),
          image: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&q=80",
          description: `${catName} for ${storeType}`,
          storeTypes: [storeType],
          isActive: true
        }).returning();
        allCategories.push(cat);
      }
    }

    console.log(`✅ Created ${allCategories.length} categories (5 per store type)`);

    console.log("🛍️ Seeding products with 4K images...");
    
    const clothingSeller = sellers.find(s => s.storeType === "clothing")!;
    const clothingStore = storesData.find(s => s.primarySellerId === clothingSeller.id)!;
    const clothingCats = allCategories.filter(c => c.storeTypes?.includes("clothing"));
    
    const hijabsCat = clothingCats.find(c => c.name === "Hijabs & Scarves")!;
    const abayasCat = clothingCats.find(c => c.name === "Abayas & Jilbabs")!;
    const dressesCat = clothingCats.find(c => c.name === "Modest Dresses")!;
    const accessoriesCat = clothingCats.find(c => c.name === "Islamic Accessories")!;
    const footwearCat = clothingCats.find(c => c.name === "Modest Footwear")!;

    const clothingProducts = [
      // HIJABS & SCARVES (10 products)
      {
        name: "Premium Silk Hijab - Black",
        description: "Luxurious premium silk hijab with soft texture and elegant drape. Perfect for all occasions, featuring smooth fabric that stays in place throughout the day.",
        price: "89.99",
        categoryId: hijabsCat.id,
        stock: 85,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_0558c52e.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_14ba2a54.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_72f3ae4b.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_00cebc1e.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_0b4cf2c1.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Chiffon Square Hijab - Burgundy",
        description: "Lightweight chiffon square hijab in rich burgundy color. Breathable and comfortable for daily wear with beautiful color that complements all skin tones.",
        price: "64.99",
        categoryId: hijabsCat.id,
        stock: 92,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_7b95575d.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_9f43fb6a.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_2627c21c.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_4dff5032.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_b3749b7c.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Jersey Stretch Hijab - Navy Blue",
        description: "Comfortable jersey stretch hijab that provides excellent coverage without pins. Easy care fabric that maintains shape and color after multiple washes.",
        price: "54.99",
        categoryId: hijabsCat.id,
        stock: 78,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_b835d03b.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_d97c91f9.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_55eae44d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_5f75c5b7.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_dda2fcc3.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Satin Edge Hijab - Emerald Green",
        description: "Elegant hijab with satin edges adding a touch of sophistication. The emerald green shade is perfect for special occasions and formal events.",
        price: "79.99",
        categoryId: hijabsCat.id,
        stock: 65,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_e715a79d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_75f65901.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_a24655f6.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_72f3ae4b.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_0558c52e.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Cotton Voile Hijab - Cream",
        description: "Soft cotton voile hijab in classic cream color. Breathable and lightweight, ideal for warm weather while maintaining modest coverage.",
        price: "49.99",
        categoryId: hijabsCat.id,
        stock: 95,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_a97b994f.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_f39c5f81.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_14ba2a54.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_9f43fb6a.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_0b4cf2c1.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Printed Silk Hijab - Floral Pattern",
        description: "Beautiful silk hijab with delicate floral print. Adds elegance to any outfit while maintaining Islamic modesty standards.",
        price: "94.99",
        categoryId: hijabsCat.id,
        stock: 58,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_b3749b7c.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_7b95575d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_2627c21c.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_dda2fcc3.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_4dff5032.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Instant Hijab - Two Piece Set",
        description: "Convenient two-piece instant hijab set for quick and easy styling. No pins required, perfect for busy mornings and active lifestyles.",
        price: "69.99",
        categoryId: hijabsCat.id,
        stock: 82,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_d97c91f9.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_55eae44d.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_b835d03b.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_5f75c5b7.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_e715a79d.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Crinkle Chiffon Hijab - Dusty Rose",
        description: "Textured crinkle chiffon hijab in soft dusty rose. The crinkle texture adds dimension and makes styling easier without looking wrinkled.",
        price: "59.99",
        categoryId: hijabsCat.id,
        stock: 71,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_75f65901.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_a24655f6.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_72f3ae4b.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_a97b994f.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_0558c52e.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Viscose Modal Hijab - Charcoal Gray",
        description: "Premium viscose modal blend hijab in sophisticated charcoal gray. Soft, durable, and maintains its shape beautifully throughout the day.",
        price: "74.99",
        categoryId: hijabsCat.id,
        stock: 67,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_f39c5f81.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_14ba2a54.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_00cebc1e.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_9f43fb6a.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_0b4cf2c1.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },
      {
        name: "Lace Trim Hijab - White",
        description: "Elegant white hijab with delicate lace trim detailing. Perfect for weddings, Eid celebrations, and special religious occasions.",
        price: "84.99",
        categoryId: hijabsCat.id,
        stock: 45,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_b3749b7c.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_dda2fcc3.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_2627c21c.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_7b95575d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_4dff5032.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/hijab_demo.mp4"
      },

      // ABAYAS & JILBABS (10 products)
      {
        name: "Classic Black Abaya with Gold Embroidery",
        description: "Timeless black abaya featuring intricate gold embroidery on the front and sleeves. Made from premium fabric with elegant draping and full coverage design.",
        price: "189.99",
        categoryId: abayasCat.id,
        stock: 52,
        images: [
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_30efae18.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_bdde15ea.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_d72e0670.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Elegant Black Abaya - Simple Design",
        description: "Sophisticated black abaya with clean lines and minimalist design. Perfect for daily wear, professional settings, and religious gatherings.",
        price: "149.99",
        categoryId: abayasCat.id,
        stock: 68,
        images: [
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Burgundy Velvet Abaya",
        description: "Luxurious burgundy velvet abaya perfect for special occasions. Rich fabric with elegant fall and sophisticated color that stands out.",
        price: "229.99",
        categoryId: abayasCat.id,
        stock: 38,
        images: [
          "/attached_assets/stock_images/burgundy_velvet_abay_dad8b0d4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Open Front Abaya - Navy Blue",
        description: "Modern open front abaya in navy blue with front zipper closure. Versatile design that can be worn open or closed for different styling options.",
        price: "169.99",
        categoryId: abayasCat.id,
        stock: 74,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Kimono Style Abaya - Beige",
        description: "Contemporary kimono-style abaya in elegant beige. Features wide sleeves and relaxed fit while maintaining full Islamic modesty coverage.",
        price: "179.99",
        categoryId: abayasCat.id,
        stock: 56,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_30efae18.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Embroidered Sleeve Abaya - Charcoal",
        description: "Charcoal gray abaya with beautiful embroidered sleeves. Combines traditional modesty with modern embellishment for a unique look.",
        price: "199.99",
        categoryId: abayasCat.id,
        stock: 44,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_bdde15ea.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Pink Lace Abaya Dress",
        description: "Feminine pink abaya with delicate lace detailing. Perfect for Eid celebrations, weddings, and festive occasions while maintaining modesty.",
        price: "219.99",
        categoryId: abayasCat.id,
        stock: 42,
        images: [
          "/attached_assets/stock_images/pink_lace_abaya_dres_56b3cb26.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg",
          "/attached_assets/stock_images/burgundy_velvet_abay_dad8b0d4.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Butterfly Abaya - Dark Green",
        description: "Flowing butterfly abaya in dark green with wide batwing sleeves. Comfortable design that provides elegant movement and full coverage.",
        price: "184.99",
        categoryId: abayasCat.id,
        stock: 61,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_d72e0670.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Nida Fabric Abaya - Brown",
        description: "Premium Nida fabric abaya in warm brown tone. Wrinkle-resistant and easy care, perfect for travel and everyday modest wear.",
        price: "159.99",
        categoryId: abayasCat.id,
        stock: 72,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },
      {
        name: "Hooded Jilbab Set - Two Piece",
        description: "Complete two-piece jilbab set with attached hood. Provides maximum coverage and comfort for prayer, daily activities, and outdoor wear.",
        price: "174.99",
        categoryId: abayasCat.id,
        stock: 48,
        images: [
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_30efae18.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/abaya_demo.mp4"
      },

      // MODEST DRESSES (10 products)
      {
        name: "Navy Blue Modest Maxi Dress",
        description: "Elegant navy blue maxi dress with long sleeves and modest neckline. Features flowing silhouette perfect for formal events and daily wear.",
        price: "139.99",
        categoryId: dressesCat.id,
        stock: 77,
        images: [
          "/attached_assets/stock_images/navy_blue_modest_dre_14544497.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_307924af.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_b796da0b.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_e97421f4.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Embroidered Modest Dress - Navy",
        description: "Beautiful navy dress with delicate embroidered details on the bodice. Long sleeves and ankle length for complete modest coverage.",
        price: "164.99",
        categoryId: dressesCat.id,
        stock: 64,
        images: [
          "/attached_assets/stock_images/navy_blue_modest_dre_307924af.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_b796da0b.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_e97421f4.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_14544497.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Emerald Green Satin Maxi Dress",
        description: "Stunning emerald green satin dress perfect for weddings and special occasions. Luxurious fabric with modest cut and elegant drape.",
        price: "199.99",
        categoryId: dressesCat.id,
        stock: 39,
        images: [
          "/attached_assets/stock_images/emerald_green_satin__71f2fadb.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_b796da0b.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Cotton Jersey Modest Dress - Black",
        description: "Comfortable cotton jersey dress in classic black. Perfect for everyday wear with stretchy fabric that moves with you while staying modest.",
        price: "89.99",
        categoryId: dressesCat.id,
        stock: 88,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Pleated Modest Dress - Gray",
        description: "Sophisticated gray dress with pleated skirt detail. Long sleeves and high neckline provide modest coverage with contemporary style.",
        price: "149.99",
        categoryId: dressesCat.id,
        stock: 59,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_e97421f4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_14544497.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Belted Modest Tunic Dress - Beige",
        description: "Elegant beige tunic dress with matching belt. Versatile design suitable for work, casual outings, and religious occasions.",
        price: "119.99",
        categoryId: dressesCat.id,
        stock: 71,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_307924af.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Linen Blend Modest Dress - Olive",
        description: "Breathable linen blend dress in earthy olive tone. Perfect for warm weather with natural fabric that keeps you cool and modest.",
        price: "129.99",
        categoryId: dressesCat.id,
        stock: 66,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Floral Print Modest Dress - Burgundy",
        description: "Feminine floral print dress in burgundy base. Features modest cut with beautiful pattern perfect for spring and summer occasions.",
        price: "154.99",
        categoryId: dressesCat.id,
        stock: 53,
        images: [
          "/attached_assets/stock_images/burgundy_velvet_abay_dad8b0d4.jpg",
          "/attached_assets/stock_images/pink_lace_abaya_dres_56b3cb26.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_b796da0b.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "A-Line Modest Dress - Dusty Pink",
        description: "Soft dusty pink A-line dress with elegant silhouette. Perfect for Eid celebrations and special gatherings with feminine modest styling.",
        price: "144.99",
        categoryId: dressesCat.id,
        stock: 58,
        images: [
          "/attached_assets/stock_images/pink_lace_abaya_dres_56b3cb26.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_e97421f4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_14544497.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },
      {
        name: "Tiered Modest Dress - Charcoal",
        description: "Modern tiered maxi dress in charcoal gray. Features layered design with long sleeves and ankle length for stylish modest fashion.",
        price: "134.99",
        categoryId: dressesCat.id,
        stock: 62,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_307924af.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/dress_demo.mp4"
      },

      // ISLAMIC ACCESSORIES (10 products)
      {
        name: "Hijab Pins Set - Gold Finish",
        description: "Premium set of 12 decorative hijab pins with gold finish. Secure hold with elegant design, perfect for special occasions and daily styling.",
        price: "24.99",
        categoryId: accessoriesCat.id,
        stock: 95,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_00cebc1e.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_0558c52e.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_0b4cf2c1.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_14ba2a54.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Underscarves Set of 3 - Neutral Colors",
        description: "Essential set of 3 cotton underscarves in beige, white, and black. Prevents slipping and provides smooth base for hijab styling.",
        price: "34.99",
        categoryId: accessoriesCat.id,
        stock: 87,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_14ba2a54.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_9f43fb6a.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_2627c21c.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_72f3ae4b.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_4dff5032.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Islamic Prayer Beads Tasbih - Wooden",
        description: "Beautiful handcrafted wooden tasbih with 99 beads. Perfect for dhikr and prayer, comes with storage pouch for safekeeping.",
        price: "29.99",
        categoryId: accessoriesCat.id,
        stock: 76,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_55eae44d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_5f75c5b7.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_30efae18.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_75f65901.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Modest Handbag - Black Leather",
        description: "Spacious modest handbag in genuine black leather. Perfect size for daily essentials with elegant design suitable for all occasions.",
        price: "119.99",
        categoryId: accessoriesCat.id,
        stock: 54,
        images: [
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_bdde15ea.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_d72e0670.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_a24655f6.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Hijab Magnets Set - Silver",
        description: "Set of 6 strong magnetic hijab pins in silver tone. No holes, no damage - secure your hijab effortlessly without traditional pins.",
        price: "19.99",
        categoryId: accessoriesCat.id,
        stock: 98,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_b3749b7c.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_b835d03b.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_a97b994f.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_d97c91f9.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_f39c5f81.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Prayer Mat - Velvet Turkish Design",
        description: "Luxurious velvet prayer mat with traditional Turkish pattern. Portable and comfortable with non-slip backing for safe prayer.",
        price: "49.99",
        categoryId: accessoriesCat.id,
        stock: 63,
        images: [
          "/attached_assets/stock_images/burgundy_velvet_abay_dad8b0d4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_00cebc1e.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Wudu Socks - Waterproof Khuff",
        description: "Islamic waterproof khuff socks for wudu. Comfortable, durable, and allows wiping over during ablution according to Shariah.",
        price: "39.99",
        categoryId: accessoriesCat.id,
        stock: 81,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_0b4cf2c1.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_2627c21c.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Islamic Wall Art - Ayatul Kursi",
        description: "Beautiful Islamic wall art featuring Ayatul Kursi in elegant calligraphy. Perfect decoration for home, bringing blessings and beauty.",
        price: "69.99",
        categoryId: accessoriesCat.id,
        stock: 47,
        images: [
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_30efae18.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_bdde15ea.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Modesty Arm Sleeves - Pair",
        description: "Comfortable arm sleeves for additional modesty coverage. Perfect for wearing under short-sleeve clothing or for sports activities.",
        price: "22.99",
        categoryId: accessoriesCat.id,
        stock: 92,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_4dff5032.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_55eae44d.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_7b95575d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_5f75c5b7.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_9f43fb6a.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },
      {
        name: "Modest Shawl Wrap - Cashmere Blend",
        description: "Luxurious cashmere blend shawl in neutral tone. Versatile accessory for added coverage and warmth with elegant drape.",
        price: "89.99",
        categoryId: accessoriesCat.id,
        stock: 55,
        images: [
          "/attached_assets/stock_images/hijab_scarf_collecti_dda2fcc3.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_e715a79d.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_75f65901.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_72f3ae4b.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_a24655f6.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/accessories_demo.mp4"
      },

      // MODEST FOOTWEAR (10 products)
      {
        name: "Closed Toe Ballet Flats - Black",
        description: "Comfortable closed toe ballet flats in classic black. Perfect modest footwear for daily wear with cushioned insole for all-day comfort.",
        price: "69.99",
        categoryId: footwearCat.id,
        stock: 84,
        images: [
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_2d59a3ef.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_30efae18.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__2271f738.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Modest Ankle Boots - Brown Leather",
        description: "Stylish ankle boots in brown leather with full coverage. Perfect for modest fashion with comfortable heel height and zipper closure.",
        price: "129.99",
        categoryId: footwearCat.id,
        stock: 58,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_14544497.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_307924af.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Covered Wedge Sandals - Navy",
        description: "Elegant covered wedge sandals in navy blue. Provides height while maintaining modesty with closed toe and ankle strap design.",
        price: "79.99",
        categoryId: footwearCat.id,
        stock: 72,
        images: [
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_b796da0b.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_e97421f4.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Modest Slip-On Sneakers - White",
        description: "Comfortable slip-on sneakers in white with full coverage. Perfect for active Muslim women who value both comfort and modesty.",
        price: "89.99",
        categoryId: footwearCat.id,
        stock: 91,
        images: [
          "/attached_assets/stock_images/muslim_woman_wearing_a97b994f.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_f39c5f81.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_14ba2a54.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__1e029f9a.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_9f43fb6a.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Closed Toe Mary Janes - Burgundy",
        description: "Classic Mary Jane shoes in burgundy with closed toe. Features adjustable strap and low heel for modest professional wear.",
        price: "94.99",
        categoryId: footwearCat.id,
        stock: 64,
        images: [
          "/attached_assets/stock_images/burgundy_velvet_abay_dad8b0d4.jpg",
          "/attached_assets/stock_images/pink_lace_abaya_dres_56b3cb26.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Modest Loafers - Tan Suede",
        description: "Sophisticated tan suede loafers with full coverage. Comfortable for daily wear with cushioned footbed and slip-resistant sole.",
        price: "99.99",
        categoryId: footwearCat.id,
        stock: 69,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_00cebc1e.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_0b4cf2c1.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__50592685.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Covered Platform Shoes - Black",
        description: "Modern platform shoes in black with full toe coverage. Adds height while maintaining Islamic modesty standards.",
        price: "109.99",
        categoryId: footwearCat.id,
        stock: 52,
        images: [
          "/attached_assets/stock_images/black_abaya_gold_emb_bdde15ea.jpg",
          "/attached_assets/stock_images/black_abaya_gold_emb_d72e0670.jpg",
          "/attached_assets/stock_images/elegant_black_abaya__ee0b9296.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__98675945.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Modest Sports Shoes - Gray & Pink",
        description: "Athletic sports shoes designed for modest Muslim women. Breathable with full coverage, perfect for exercise and active lifestyle.",
        price: "119.99",
        categoryId: footwearCat.id,
        stock: 75,
        images: [
          "/attached_assets/stock_images/pink_lace_abaya_dres_56b3cb26.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a89c51a3.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_2627c21c.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_4dff5032.jpg",
          "/attached_assets/stock_images/hijab_scarf_collecti_7b95575d.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Formal Covered Heels - Silver",
        description: "Elegant silver formal heels with closed toe design. Perfect for weddings and special occasions while maintaining modesty.",
        price: "139.99",
        categoryId: footwearCat.id,
        stock: 43,
        images: [
          "/attached_assets/stock_images/emerald_green_satin__71f2fadb.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_307924af.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a7d5dff4.jpg",
          "/attached_assets/stock_images/navy_blue_modest_dre_36973ac5.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__a5cb2e45.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      },
      {
        name: "Modest Walking Shoes - Beige",
        description: "Comfortable walking shoes in neutral beige with full coverage. Designed for long walks and daily activities with arch support.",
        price: "84.99",
        categoryId: footwearCat.id,
        stock: 79,
        images: [
          "/attached_assets/stock_images/islamic_abaya_dress__2afdf9c3.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_55eae44d.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__333b8784.jpg",
          "/attached_assets/stock_images/muslim_woman_wearing_5f75c5b7.jpg",
          "/attached_assets/stock_images/islamic_abaya_dress__860c9bb0.jpg"
        ],
        video: "https://res.cloudinary.com/demo/video/upload/v1/footwear_demo.mp4"
      }
    ];

    const insertedProducts: typeof products.$inferSelect[] = [];
    for (const prod of clothingProducts) {
      const [inserted] = await db.insert(products).values({
        name: prod.name,
        description: prod.description,
        price: prod.price,
        images: prod.images,
        video: prod.video,
        sellerId: clothingSeller.id,
        storeId: clothingStore.id,
        categoryId: prod.categoryId,
        stock: prod.stock,
        isActive: true
      }).returning();
      insertedProducts.push(inserted);
    }

    console.log(`✅ Created ${clothingProducts.length} products with 4K images`);

    console.log("🎨 Seeding hero banners...");
    await db.insert(heroBanners).values([
      {
        title: "Elegant Abaya Collection",
        subtitle: "Discover modest elegance with our exclusive abaya designs",
        image: "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png",
        ctaText: "Shop Now",
        ctaLink: "/products?category=abayas",
        displayOrder: 1,
        isActive: true
      },
      {
        title: "Premium Hijab Styles",
        subtitle: "Luxurious fabrics, timeless designs for every occasion",
        image: "/attached_assets/stock_images/Islamic_fashion_hero_banner_6bb20763.png",
        ctaText: "Explore Collection",
        ctaLink: "/products?category=hijabs",
        displayOrder: 2,
        isActive: true
      },
      {
        title: "Modest Fashion Essentials",
        subtitle: "Complete your wardrobe with our curated modest wear",
        image: "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png",
        ctaText: "View Deals",
        ctaLink: "/products",
        displayOrder: 3,
        isActive: true
      },
      {
        title: "Premium Hijabs & Accessories",
        subtitle: "Beautiful hijabs and accessories for every style",
        image: "/attached_assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png",
        ctaText: "Shop Hijabs",
        ctaLink: "/products?category=hijabs",
        displayOrder: 4,
        isActive: true
      },
      {
        title: "Evening Wear Collection",
        subtitle: "Stunning modest evening dresses for special occasions",
        image: "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png",
        ctaText: "Shop Evening Wear",
        ctaLink: "/products?category=evening-wear",
        displayOrder: 5,
        isActive: true
      },
      {
        title: "Burgundy Velvet Abayas",
        subtitle: "Luxurious velvet abayas with elegant pearl details",
        image: "/attached_assets/stock_images/Burgundy_velvet_abaya_with_pearls_c19f2d40.png",
        ctaText: "View Collection",
        ctaLink: "/products?category=abayas",
        displayOrder: 6,
        isActive: true
      },
      {
        title: "Women's Accessories",
        subtitle: "Complete your look with our curated accessories",
        image: "/attached_assets/stock_images/Women's_accessories_category_image_091f4ac1.png",
        ctaText: "Shop Accessories",
        ctaLink: "/products?category=accessories",
        displayOrder: 7,
        isActive: true
      }
    ]);

    console.log("📄 Seeding footer pages...");
    await db.insert(footerPages).values([
      {
        title: "About Us",
        slug: "about",
        content: `# About KiyuMart\n\nGhana's premier marketplace for modest Islamic women's fashion.`,
        isActive: true,
        displayOrder: 1
      },
      {
        title: "Privacy Policy",
        slug: "privacy",
        content: `# Privacy Policy\n\nYour privacy is important to us.`,
        isActive: true,
        displayOrder: 2
      }
    ]);

    console.log("📦 Seeding test orders with rider assignments...");
    const testOrders = [];
    for (let i = 0; i < 7; i++) {
      const buyer = buyers[i % buyers.length];
      const seller = clothingSeller;
      const product = insertedProducts[i % insertedProducts.length];
      const zone = zoneRecords[i % zoneRecords.length];
      const rider = riders[i % riders.length];
      
      const subtotal = parseFloat(product.price) * 2;
      const deliveryFee = parseFloat(zone.fee);
      const processingFee = (subtotal + deliveryFee) * 0.0195;
      const total = subtotal + deliveryFee + processingFee;
      
      const statuses = ['processing', 'processing', 'delivering', 'delivering', 'delivered', 'processing', 'delivering'];
      const status = statuses[i];
      
      const orderNumber = `ORD-${Date.now() + i}`;
      const qrCode = `${orderNumber}-${buyer.id}`;
      
      const [order] = await db.insert(orders).values({
        orderNumber,
        qrCode,
        buyerId: buyer.id,
        sellerId: seller.id,
        riderId: rider.id,
        subtotal: subtotal.toFixed(2),
        deliveryFee: deliveryFee.toFixed(2),
        processingFee: processingFee.toFixed(2),
        total: total.toFixed(2),
        status,
        deliveryMethod: 'rider',
        deliveryZoneId: zone.id,
        deliveryAddress: `${buyer.name}'s Address, ${zone.name}, Ghana`,
        deliveryPhone: buyer.phone || '+233200000000',
        paymentStatus: 'completed',
        paymentReference: `PAY-${Date.now() + i}`,
        deliveredAt: status === 'delivered' ? new Date() : null
      } as any).returning();
      
      await db.insert(orderItems).values({
        orderId: order.id,
        productId: product.id,
        quantity: 2,
        price: product.price,
        total: subtotal.toFixed(2)
      });
      
      testOrders.push(order);
    }

    console.log(`✅ Created ${testOrders.length} test orders distributed across ${riders.length} riders`);

    console.log("\n✨ Seed completed successfully!");
    console.log("\n📊 Summary:");
    console.log(`   👤 Users: ${1 + 2 + sellers.length + riders.length + buyers.length}`);
    console.log(`      - 1 Super Admin (superadmin@kiyumart.com)`);
    console.log(`      - 2 Admins (admin1@, admin2@)`);
    console.log(`      - ${sellers.length} Sellers (seller.[storetype]@)`);
    console.log(`      - ${riders.length} Riders (rider1-5@)`);
    console.log(`      - ${buyers.length} Buyers (buyer1-20@)`);
    console.log(`   🏪 Stores: ${storesData.length}`);
    console.log(`   📑 Categories: ${allCategories.length} (5 per store type)`);
    console.log(`   🛍️  Products: ${clothingProducts.length}`);
    console.log(`   📦 Test Orders: ${testOrders.length} (distributed across riders)`);
    console.log(`   🎨 Hero Banners: 2`);
    console.log(`   📄 Footer Pages: 2`);
    console.log(`   🚚 Delivery Zones: ${zones.length}`);
    console.log(`\n🔑 All passwords: password123`);
    console.log(`\n🌐 Try logging in:`);
    console.log(`   - superadmin@kiyumart.com`);
    console.log(`   - seller.clothing@kiyumart.com`);
    console.log(`   - buyer1@kiyumart.com`);

  } catch (error) {
    console.error("❌ Seed failed:", error);
    throw error;
  }
}

seed()
  .then(() => {
    console.log("\n✅ Exiting...");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Fatal error:", error);
    process.exit(1);
  });
