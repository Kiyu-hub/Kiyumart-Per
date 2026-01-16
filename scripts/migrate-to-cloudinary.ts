import "dotenv/config";
import { v2 as cloudinary } from "cloudinary";
import { db } from "../db";
import { heroBanners } from "../shared/schema";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(localPath: string, folder: string = "kiyumart"): Promise<string> {
  const fullPath = path.join(process.cwd(), localPath.replace(/^\//, ""));
  
  if (!fs.existsSync(fullPath)) {
    console.error(`File not found: ${fullPath}`);
    throw new Error(`File not found: ${fullPath}`);
  }

  const result = await cloudinary.uploader.upload(fullPath, {
    folder: folder,
    resource_type: "image",
    quality: "auto:best",
    fetch_format: "auto",
  });

  return result.secure_url;
}

async function migrateBannersToCloudinary() {
  console.log("🚀 Starting Cloudinary migration for hero banners...\n");

  // Get all banners
  const banners = await db.select().from(heroBanners);
  console.log(`Found ${banners.length} hero banners to migrate\n`);

  for (const banner of banners) {
    // Skip if already on Cloudinary
    if (banner.image.includes("cloudinary.com") || banner.image.includes("res.cloudinary.com")) {
      console.log(`⏭️  Skipping "${banner.title}" - already on Cloudinary`);
      continue;
    }

    // Skip if it's an external URL (not local)
    if (banner.image.startsWith("http://") || banner.image.startsWith("https://")) {
      console.log(`⏭️  Skipping "${banner.title}" - external URL`);
      continue;
    }

    try {
      console.log(`📤 Uploading "${banner.title}"...`);
      const cloudinaryUrl = await uploadToCloudinary(banner.image, "kiyumart/banners");
      
      // Update database with Cloudinary URL
      await db.update(heroBanners)
        .set({ image: cloudinaryUrl })
        .where(eq(heroBanners.id, banner.id));
      
      console.log(`✅ "${banner.title}" uploaded: ${cloudinaryUrl}\n`);
    } catch (error) {
      console.error(`❌ Failed to upload "${banner.title}":`, error);
    }
  }

  console.log("\n🎉 Migration complete!");
  process.exit(0);
}

migrateBannersToCloudinary().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
