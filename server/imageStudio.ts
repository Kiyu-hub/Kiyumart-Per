/**
 * Studio product photos: background removed, product placed "just as it is"
 * on pure white, centred in a 3:4 portrait canvas with a safe margin so the
 * full-screen product page (object-fit: cover on tall phones) never cuts the
 * product off. Colours are not altered — only a light sharpen.
 *
 * Everything is a Cloudinary delivery URL (no extra storage, original kept).
 * Cost on the free plan: background removal = 75 transformations per photo;
 * upscale is added only for small photos (< 0.25 MP), where it costs 10.
 */

const CANVAS_W = 1600;
const CANVAS_H = 2133; // 3:4
// Product box inside the canvas: 62.5% wide (survives a ~9:19.5 phone crop)
// and 70% high (survives a square thumbnail crop on cards).
const BOX_W = 1000;
const BOX_H = 1500;
const SMALL_PIXELS = 250_000;

const CLOUDINARY_UPLOAD_RE = /^https:\/\/res\.cloudinary\.com\/[a-z0-9_-]+\/image\/upload\//i;

export function isCloudinaryImageUrl(url: string): boolean {
  return CLOUDINARY_UPLOAD_RE.test(String(url || ""));
}

export function isStudioUrl(url: string): boolean {
  return String(url || "").includes("/e_background_removal/");
}

/** Strip any transformations we added before (f_auto,q_auto etc.) so we start from the original. */
function originalPath(url: string): { base: string; rest: string } {
  const idx = url.indexOf("/image/upload/") + "/image/upload/".length;
  const base = url.slice(0, idx);
  const segments = url.slice(idx).split("/");
  // Keep from the version segment (v123…) or the first segment that isn't a transformation.
  const isTransform = (s: string) => /^([a-z]{1,3}_[^/]*)(,[a-z]{1,3}_[^/]*)*$/i.test(s) && !/^v\d+$/.test(s);
  let i = 0;
  while (i < segments.length - 1 && isTransform(segments[i])) i++;
  return { base, rest: segments.slice(i).join("/") };
}

export function buildStudioUrl(url: string, opts: { width?: number | null; height?: number | null } = {}): string {
  if (!isCloudinaryImageUrl(url) || isStudioUrl(url)) return url;
  const { base, rest } = originalPath(url);
  const w = Number(opts.width) || 0;
  const h = Number(opts.height) || 0;
  const steps = [
    ...(w > 0 && h > 0 && w * h < SMALL_PIXELS ? ["e_upscale"] : []),
    "e_background_removal",
    "e_trim",
    `c_fit,w_${BOX_W},h_${BOX_H}`,
    `b_white,c_lpad,w_${CANVAS_W},h_${CANVAS_H},g_center`,
    "e_sharpen:50",
    // JPEG guarantees the white is solid (WebP/AVIF could keep transparency).
    "f_jpg,q_auto:good",
  ];
  return `${base}${steps.join("/")}/${rest.replace(/\.(png|webp|avif|gif|heic|jpe?g)$/i, "")}.jpg`;
}

/**
 * Asks Cloudinary to render the studio version and waits for it.
 * Background removal runs asynchronously: Cloudinary answers 423 until ready.
 * Returns null when the account can't do it (plan, quota, unsupported image).
 */
export async function renderStudioPhoto(
  url: string,
  opts: { width?: number | null; height?: number | null } = {},
): Promise<{ url: string | null; reason?: string }> {
  if (!isCloudinaryImageUrl(url)) return { url: null, reason: "not_cloudinary" };
  const studio = buildStudioUrl(url, opts);
  const deadline = Date.now() + 45_000;
  let lastReason = "unknown";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(studio, { method: "GET", signal: AbortSignal.timeout(20_000) });
      if (res.ok) {
        await res.arrayBuffer().catch(() => null);
        return { url: studio };
      }
      lastReason = res.headers.get("x-cld-error") || `http_${res.status}`;
      if (res.status !== 423) break; // 423 = still processing; anything else is final
    } catch (e: any) {
      lastReason = e?.name === "TimeoutError" ? "timeout" : String(e?.message || e);
    }
    await new Promise((r) => setTimeout(r, 2500));
  }
  return { url: null, reason: lastReason };
}
