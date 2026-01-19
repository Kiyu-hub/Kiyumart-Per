import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import { storage } from "./storage";

// Initialize with environment variables as default
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});

// Helper function to configure cloudinary with database settings or env vars
async function ensureCloudinaryConfig() {
  try {
    const settings = await storage.getPlatformSettings();
    
    // Use database settings if available, otherwise keep env vars
    const config = {
      cloud_name: settings.cloudinaryCloudName || process.env.CLOUDINARY_CLOUD_NAME || "",
      api_key: settings.cloudinaryApiKey || process.env.CLOUDINARY_API_KEY || "",
      api_secret: settings.cloudinaryApiSecret || process.env.CLOUDINARY_API_SECRET || "",
    };
    
    cloudinary.config(config);
  } catch (error) {
    // If database query fails, keep using env vars
    console.error("Failed to load Cloudinary config from database:", error);
  }
}

export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string = "kiyumart"
): Promise<string> {
  await ensureCloudinaryConfig();
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(optimizeUrl(result!.secure_url))
      }
    );

    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

// Upload with full metadata (for videos)
export async function uploadWithMetadata(
  buffer: Buffer,
  folder: string = "kiyumart"
): Promise<{ url: string; duration?: number; format?: string; resource_type?: string }> {
  await ensureCloudinaryConfig();
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
      },
      (error, result) => {
        if (error) reject(error);
        else resolve({
          url: optimizeUrl(result!.secure_url),
          duration: result!.duration, // Video duration in seconds
          format: result!.format,
          resource_type: result!.resource_type,
        });
      }
    );

    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}

export async function deleteFromCloudinary(publicId: string): Promise<void> {
  await ensureCloudinaryConfig();
  await cloudinary.uploader.destroy(publicId);
}

export async function uploadWith4KEnhancement(
  buffer: Buffer,
  folder: string = "kiyumart",
  originalWidth: number,
  originalHeight: number
): Promise<{ url: string; width: number; height: number; enhanced: boolean }> {
  await ensureCloudinaryConfig();
  
  const MIN_4K_WIDTH = 3840;
  const MIN_4K_HEIGHT = 2160;
  
  const needsEnhancement = originalWidth < MIN_4K_WIDTH || originalHeight < MIN_4K_HEIGHT;
  
  if (!needsEnhancement) {
    const url = await uploadToCloudinary(buffer, folder);
    return { url, width: originalWidth, height: originalHeight, enhanced: false };
  }
  
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "image",
        transformation: [
          {
            width: MIN_4K_WIDTH,
            height: MIN_4K_HEIGHT,
            crop: "fill",
            quality: "auto:best",
            fetch_format: "auto",
          }
        ],
        eager: [
          {
            width: MIN_4K_WIDTH,
            height: MIN_4K_HEIGHT,
            crop: "fill",
            quality: "auto:best"
          }
        ],
        eager_async: false,
      },
      (error, result) => {
        if (error) {
          reject(new Error(`4K enhancement failed: ${error.message}. Please upload a higher resolution image (minimum 3840×2160px).`));
        } else {
          const enhancedWidth = result!.eager?.[0]?.width || result!.width;
          const enhancedHeight = result!.eager?.[0]?.height || result!.height;
          const eagerUrl = result!.eager?.[0]?.secure_url;
          const finalUrl = eagerUrl || result!.secure_url;
          
          if (enhancedWidth < MIN_4K_WIDTH || enhancedHeight < MIN_4K_HEIGHT) {
            reject(new Error(`Image quality insufficient for 4K enhancement. Original: ${originalWidth}×${originalHeight}px. Please upload a higher resolution image.`));
          } else {
            resolve({
              url: optimizeUrl(finalUrl),
              width: enhancedWidth,
              height: enhancedHeight,
              enhanced: true
            });
          }
        }
      }
    );

    const readableStream = new Readable();
    readableStream.push(buffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });
}
/**
* Injects f_auto (auto-format) and q_auto (auto-quality) 
 * to save bandwidth and Cloudinary credits.
 */

export const optimizeUrl = (url: string | undefined): string => {
  if (!url || !url.includes("cloudinary.com")) return url || "";

  const hasF = url.includes("f_auto");
  const hasQ = url.includes("q_auto");

  // If both transformations already present, return as-is
  if (hasF && hasQ) return url;

  // Build the missing transformation string
  const parts: string[] = [];
  if (!hasF) parts.push("f_auto");
  if (!hasQ) parts.push("q_auto");
  const insert = parts.join(",");

  // Insert before any version or existing transformations
  return url.replace("/upload/", `/upload/${insert}/`);
};

export { cloudinary };
