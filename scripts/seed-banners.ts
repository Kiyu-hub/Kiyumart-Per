import "dotenv/config";
import { db } from "../db";
import { heroBanners, marketplaceBanners } from "../shared/schema";
import { sql } from "drizzle-orm";

async function seedBanners() {
  console.log("🧹 Clearing existing hero banners...");
  await db.delete(heroBanners);
  
  console.log("🎨 Seeding hero banners with local images (for single-store mode)...");
  
  const banners = [
    {
      title: "Elegant Abaya Collection",
      subtitle: "Discover modest elegance with our exclusive abaya designs",
      image: "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png",
      ctaText: "Shop Now",
      ctaLink: "/products?category=abayas",
      isActive: true,
      displayOrder: 1
    },
    {
      title: "Premium Hijab Styles",
      subtitle: "Luxurious fabrics, timeless designs for every occasion",
      image: "/attached_assets/stock_images/Islamic_fashion_hero_banner_6bb20763.png",
      ctaText: "Explore Collection",
      ctaLink: "/products?category=hijabs",
      isActive: true,
      displayOrder: 2
    },
    {
      title: "Modest Fashion Essentials",
      subtitle: "Complete your wardrobe with our curated modest wear",
      image: "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png",
      ctaText: "View Deals",
      ctaLink: "/products",
      isActive: true,
      displayOrder: 3
    },
    {
      title: "Premium Hijabs & Accessories",
      subtitle: "Beautiful hijabs and accessories for every style",
      image: "/attached_assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png",
      ctaText: "Shop Hijabs",
      ctaLink: "/products?category=hijabs",
      isActive: true,
      displayOrder: 4
    },
    {
      title: "Evening Wear Collection",
      subtitle: "Stunning modest evening dresses for special occasions",
      image: "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png",
      ctaText: "Shop Evening Wear",
      ctaLink: "/products?category=evening-wear",
      isActive: true,
      displayOrder: 5
    },
    {
      title: "Burgundy Velvet Abayas",
      subtitle: "Luxurious velvet abayas with elegant pearl details",
      image: "/attached_assets/stock_images/Burgundy_velvet_abaya_with_pearls_c19f2d40.png",
      ctaText: "View Collection",
      ctaLink: "/products?category=abayas",
      isActive: true,
      displayOrder: 6
    },
    {
      title: "Women's Accessories",
      subtitle: "Complete your look with our curated accessories",
      image: "/attached_assets/stock_images/Women's_accessories_category_image_091f4ac1.png",
      ctaText: "Shop Accessories",
      ctaLink: "/products?category=accessories",
      isActive: true,
      displayOrder: 7
    }
  ];

  await db.insert(heroBanners).values(banners);
  console.log("✅ Hero banners seeded successfully!");

  // Seed marketplace banners for multi-vendor mode
  console.log("🧹 Clearing existing marketplace banners...");
  await db.delete(marketplaceBanners);
  
  console.log("🎨 Seeding marketplace banners (for multi-vendor mode)...");
  
  const mpBanners = [
    {
      title: "Welcome to KiyuMart Marketplace",
      subtitle: "Discover amazing products from multiple vendors",
      imageUrl: "/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png",
      ctaText: "Explore Now",
      ctaUrl: "/stores",
      isActive: true,
      displayOrder: 1
    },
    {
      title: "Fashion Collection",
      subtitle: "Trendy styles from top sellers",
      imageUrl: "/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png",
      ctaText: "Shop Fashion",
      ctaUrl: "/products?category=fashion",
      isActive: true,
      displayOrder: 2
    },
    {
      title: "Islamic Fashion",
      subtitle: "Premium modest wear from trusted vendors",
      imageUrl: "/attached_assets/stock_images/Islamic_fashion_hero_banner_6bb20763.png",
      ctaText: "View Collection",
      ctaUrl: "/products?category=abayas",
      isActive: true,
      displayOrder: 3
    },
    {
      title: "Hijabs & Accessories",
      subtitle: "Beautiful accessories for every occasion",
      imageUrl: "/attached_assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png",
      ctaText: "Shop Now",
      ctaUrl: "/products?category=hijabs",
      isActive: true,
      displayOrder: 4
    },
    {
      title: "Evening Elegance",
      subtitle: "Stunning evening wear collection",
      imageUrl: "/attached_assets/stock_images/Evening_wear_category_image_455c3389.png",
      ctaText: "Discover",
      ctaUrl: "/products?category=evening-wear",
      isActive: true,
      displayOrder: 5
    },
    {
      title: "Ramadan Special",
      subtitle: "Celebrate with our special collection",
      imageUrl: "/attached_assets/stock_images/ramadan_celebration__84d6d687.jpg",
      ctaText: "Shop Ramadan",
      ctaUrl: "/products",
      isActive: true,
      displayOrder: 6
    },
    {
      title: "Summer Sale",
      subtitle: "Hot deals on summer essentials",
      imageUrl: "/attached_assets/stock_images/summer_sale_banner_b_5d34cfd4.jpg",
      ctaText: "View Deals",
      ctaUrl: "/products",
      isActive: true,
      displayOrder: 7
    }
  ];

  await db.insert(marketplaceBanners).values(mpBanners);
  console.log("✅ Marketplace banners seeded successfully!");
  
  process.exit(0);
}

seedBanners().catch(e => {
  console.error("❌ Error seeding banners:", e);
  process.exit(1);
});
