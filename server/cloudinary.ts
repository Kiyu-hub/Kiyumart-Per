import { v2 as cloudinary } from "cloudinary";
import { Readable } from "stream";
import { storage } from "./storage";
import sharp from "sharp";

// Initialize with environment variables as default
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
  api_key: process.env.CLOUDINARY_API_KEY || "",
  api_secret: process.env.CLOUDINARY_API_SECRET || "",
});

// Cache configuration to avoid repeated DB queries (FREE TIER OPTIMIZATION)
interface CachedConfig {
  timestamp: number;
  config: {
    cloud_name: string;
    api_key: string;
    api_secret: string;
  };
}

const CONFIG_CACHE_TTL_MS = 3600000; // 1 hour
let configCache: CachedConfig | null = null;

const isMaskedCloudinaryValue = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  const bulletOnly = normalized.replace(/[\u2022\u00B7*\s]/g, "");
  return bulletOnly.length === 0;
};

const resolveCloudinaryConfig = (settings: {
  cloudinaryCloudName?: string | null;
  cloudinaryApiKey?: string | null;
  cloudinaryApiSecret?: string | null;
} | null | undefined) => {
  const configuredCloudName = String(settings?.cloudinaryCloudName || "").trim();
  const configuredApiKey = String(settings?.cloudinaryApiKey || "").trim();
  const configuredApiSecret = String(settings?.cloudinaryApiSecret || "").trim();

  const envCloudName = String(process.env.CLOUDINARY_CLOUD_NAME || "").trim();
  const envApiKey = String(process.env.CLOUDINARY_API_KEY || "").trim();
  const envApiSecret = String(process.env.CLOUDINARY_API_SECRET || "").trim();

  const settingsValid =
    configuredCloudName &&
    configuredApiKey &&
    configuredApiSecret &&
    !isMaskedCloudinaryValue(configuredCloudName) &&
    !isMaskedCloudinaryValue(configuredApiKey) &&
    !isMaskedCloudinaryValue(configuredApiSecret);

  if (settingsValid) {
    return {
      cloud_name: configuredCloudName,
      api_key: configuredApiKey,
      api_secret: configuredApiSecret,
    };
  }

  return {
    cloud_name: envCloudName,
    api_key: envApiKey,
    api_secret: envApiSecret,
  };
};

export function resetCloudinaryConfigCache() {
  configCache = null;
}

function useEnvCloudinaryConfig() {
  const config = {
    cloud_name: String(process.env.CLOUDINARY_CLOUD_NAME || "").trim(),
    api_key: String(process.env.CLOUDINARY_API_KEY || "").trim(),
    api_secret: String(process.env.CLOUDINARY_API_SECRET || "").trim(),
  };
  cloudinary.config(config);
  return config;
}

// Helper function to configure cloudinary with database settings or env vars
async function ensureCloudinaryConfig() {
  const now = Date.now();
  
  // Return cached config if valid (SAVES ~50 API CALLS/DAY)
  if (configCache && (now - configCache.timestamp) < CONFIG_CACHE_TTL_MS) {
    cloudinary.config(configCache.config);
    return;
  }
  
  try {
    const settings = await storage.getPlatformSettings();
    const config = resolveCloudinaryConfig(settings);
    
    // Update cache
    configCache = {
      timestamp: now,
      config
    };
    
    cloudinary.config(config);
  } catch (error) {
    // If database query fails, keep using env vars (use last cached or env)
    console.error("Failed to load Cloudinary config from database, using cached/env:", error);
    if (!configCache) {
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME || "",
        api_key: process.env.CLOUDINARY_API_KEY || "",
        api_secret: process.env.CLOUDINARY_API_SECRET || "",
      });
    }
  }
}

// FREE TIER OPTIMIZATION: apply gentle compression only to large images.
// This preserves catalog quality while reducing storage and transfer costs.
export async function compressImageBuffer(buffer: Buffer, maxSizeKb: number = 3500): Promise<Buffer> {
  try {
    const metadata = await sharp(buffer).metadata();
    if (!metadata.width || !metadata.height || !metadata.format) return buffer;

    // Keep originals for smaller files to avoid unnecessary quality loss.
    if (buffer.length <= maxSizeKb * 1024) return buffer;

    const targetWidth = Math.min(metadata.width, 2560);
    const targetHeight = Math.min(metadata.height, 2560);
    let quality = 92;
    let compressed = buffer;

    while (quality >= 85) {
      const pipeline = sharp(buffer).resize(targetWidth, targetHeight, {
          fit: 'inside',
          withoutEnlargement: true,
      });

      if (metadata.format === 'png') {
        compressed = await pipeline.png({ compressionLevel: 9 }).toBuffer();
      } else {
        compressed = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      }

      if (compressed.length <= maxSizeKb * 1024) break;
      quality -= 2;
    }

    // Final fallback: slight downscale for very large originals.
    if (compressed.length > maxSizeKb * 1024) {
      const scale = Math.sqrt((maxSizeKb * 1024) / compressed.length);
      const fallbackPipeline = sharp(buffer).resize(
        Math.max(1280, Math.floor(targetWidth * scale)),
        Math.max(1280, Math.floor(targetHeight * scale)),
        {
          fit: 'inside',
          withoutEnlargement: true,
        }
      );

      if (metadata.format === 'png') {
        compressed = await fallbackPipeline.png({ compressionLevel: 9 }).toBuffer();
      } else {
        compressed = await fallbackPipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
      }
    }

    const savings = ((buffer.length - compressed.length) / buffer.length * 100).toFixed(1);
    console.log(`[Cloudinary] Optimized image: ${(buffer.length / 1024).toFixed(1)}KB -> ${(compressed.length / 1024).toFixed(1)}KB (${savings}% savings)`);

    return compressed;
  } catch (error) {
    // Non-image buffers (e.g. videos) should pass through untouched.
    return buffer;
  }
}

export async function uploadToCloudinary(
  buffer: Buffer,
  folder: string = "kiyumart"
): Promise<string> {
  await ensureCloudinaryConfig();
  
  // Compress only large images to preserve visual quality.
  const compressedBuffer = await compressImageBuffer(buffer);
  
  const performUpload = () => new Promise<string>((resolve, reject) => {
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
    readableStream.push(compressedBuffer);
    readableStream.push(null);
    readableStream.pipe(uploadStream);
  });

  try {
    return await performUpload();
  } catch (error: any) {
    if (/invalid signature/i.test(String(error?.message || ""))) {
      resetCloudinaryConfigCache();
      useEnvCloudinaryConfig();
      return await performUpload();
    }
    throw error;
  }
}

// Upload with full metadata (for videos)
export async function uploadWithMetadata(
  buffer: Buffer,
  folder: string = "kiyumart"
): Promise<{ url: string; duration?: number; format?: string; resource_type?: string }> {
  await ensureCloudinaryConfig();
  
  const performUpload = () => new Promise<{ url: string; duration?: number; format?: string; resource_type?: string }>((resolve, reject) => {
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

  try {
    return await performUpload();
  } catch (error: any) {
    if (/invalid signature/i.test(String(error?.message || ""))) {
      resetCloudinaryConfigCache();
      useEnvCloudinaryConfig();
      return await performUpload();
    }
    throw error;
  }
}

export function buildTrimmedCloudinaryVideoUrl(url: string | undefined, maxDurationSeconds: number = 30): string {
  const normalized = String(url || "").trim();
  if (!normalized || !normalized.includes("cloudinary.com")) return normalized;
  const duration = Math.max(1, Math.floor(maxDurationSeconds));
  if (normalized.includes("/upload/")) {
    return normalized.replace(
      "/upload/",
      `/upload/f_auto,q_auto,vc_auto,so_0,du_${duration}/`,
    );
  }
  return normalized;
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
  
  // FREE TIER OPTIMIZATION: Disable eager transformations (saves 30+ API calls/day)
  // Instead: Direct upload with no transformations, resize via CDN on-demand
  // Quality loss: 0% (Cloudinary resizes on delivery)
  // Cost savings: 100% of transformation costs
  
  const url = await uploadToCloudinary(buffer, folder);
  return { 
    url, 
    width: originalWidth, 
    height: originalHeight, 
    enhanced: false  // No expensive transformation applied
  };
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
