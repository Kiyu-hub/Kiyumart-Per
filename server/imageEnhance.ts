/**
 * Server-side mirror of client/src/lib/imageEnhance.ts.
 *
 * Used during product upload to permanently transform Cloudinary delivery URLs
 * with `e_enhance,q_auto:best,f_auto` so every stored image is automatically
 * enhanced. Free — runs on Cloudinary's edge, no extra credit cost.
 */

export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  return /res\.cloudinary\.com\/[^/]+\/(image|video)\/upload\//.test(url);
}

export function enhanceCloudinaryUrl(
  url: string | null | undefined,
  opts: { chain?: string; maxWidth?: number } = {},
): string {
  if (!url || typeof url !== "string") return "";
  if (!isCloudinaryUrl(url)) return url;
  if (/\/upload\/[^/]*e_enhance/.test(url)) return url;

  const baseChain = opts.chain || "e_enhance,q_auto:best,f_auto";
  const widthClause = opts.maxWidth ? `,w_${opts.maxWidth},c_limit` : "";

  return url.replace(
    /\/upload\/(?!.*e_enhance)/,
    `/upload/${baseChain}${widthClause}/`,
  );
}

export function enhanceImageList(
  urls: Array<string | null | undefined> | null | undefined,
): string[] {
  if (!Array.isArray(urls)) return [];
  return urls.map((u) => enhanceCloudinaryUrl(u)).filter((u): u is string => Boolean(u));
}
