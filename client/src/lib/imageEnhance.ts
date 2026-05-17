/**
 * Auto-enhance Cloudinary image URLs at delivery time.
 *
 * Cloudinary's `e_enhance` transformation runs an AI model that:
 *   - removes compression artifacts
 *   - reduces noise
 *   - sharpens details
 *   - applies natural-looking colour & contrast adjustments
 *
 * It runs on Cloudinary's edge — no upload step, no new API key, no extra cost
 * on the standard transformation tier. It must be the FIRST transformation in
 * the chain to work correctly.
 *
 * https://cloudinary.com/blog/automatic-image-enhancement-at-scale-e_enhance
 *
 * In addition we apply `q_auto` (smart quality) and `f_auto` (best modern
 * format — WebP / AVIF where the browser supports it) for further savings.
 */

/** Quick check: is this a Cloudinary delivery URL we can transform? */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//.test(url);
}

/**
 * Inject `e_enhance,q_auto:best,f_auto` (or a custom chain) into a Cloudinary
 * URL right after `/upload/`. Returns the original URL unchanged when the URL
 * is not a Cloudinary delivery URL or has already been enhanced.
 *
 * Examples:
 *   enhanceCloudinaryUrl("https://res.cloudinary.com/x/image/upload/v1/photo.jpg")
 *     → "https://res.cloudinary.com/x/image/upload/e_enhance,q_auto:best,f_auto/v1/photo.jpg"
 *
 *   enhanceCloudinaryUrl("https://example.com/photo.jpg")
 *     → "https://example.com/photo.jpg" (unchanged — not Cloudinary)
 */
export function enhanceCloudinaryUrl(
  url: string | null | undefined,
  opts: { chain?: string; maxWidth?: number } = {},
): string {
  if (!url || typeof url !== "string") return "";
  if (!isCloudinaryUrl(url)) return url;

  // Already enhanced — leave it alone.
  if (/\/upload\/[^/]*e_enhance/.test(url)) return url;

  // `e_enhance` must come first per Cloudinary docs.
  const baseChain = opts.chain || "e_enhance,q_auto:best,f_auto";
  const widthClause = opts.maxWidth ? `,w_${opts.maxWidth},c_limit` : "";

  return url.replace(
    /\/upload\/(?!.*e_enhance)/,
    `/upload/${baseChain}${widthClause}/`,
  );
}

/**
 * Convenience: enhance an array of image URLs (e.g. product.images).
 */
export function enhanceImageList(urls: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => enhanceCloudinaryUrl(u)).filter((u): u is string => Boolean(u));
}

/**
 * Lighter variant for thumbnails / cards — caps width to save bandwidth.
 */
export function enhanceCloudinaryThumb(url: string | null | undefined, width = 640): string {
  return enhanceCloudinaryUrl(url, { maxWidth: width });
}
