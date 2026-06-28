/**
 * Shared banner / CTA navigation.
 *
 * Banners store a single freeform `ctaLink`. The admin may configure:
 *   - an internal route  (e.g. "/product/123", "/sellers/45", "/category/food")
 *   - an external URL     (e.g. "https://example.com")
 *   - a mailto: / tel:    link
 *
 * Wouter's `navigate()` only understands internal routes — passing it an
 * external URL pushes a malformed history entry (e.g. "/https://example.com")
 * and breaks navigation. This helper routes each link to the correct mechanism
 * so the banner always opens the EXACT configured destination.
 *
 * Empty/whitespace links are a no-op — there is intentionally no homepage
 * fallback (the CTA button should not be rendered when there is no link).
 */
export function navigateToBannerLink(
  rawLink: string | null | undefined,
  navigate: (to: string) => void,
): void {
  const link = (rawLink || "").trim();
  if (!link) return; // no destination → do nothing (no generic homepage fallback)

  // mailto: / tel: — let the browser/OS handle the protocol
  if (/^(mailto:|tel:)/i.test(link)) {
    window.location.href = link;
    return;
  }

  // External URL (absolute http(s) or protocol-relative) → new tab, safely
  if (/^(https?:)?\/\//i.test(link)) {
    window.open(link, "_blank", "noopener,noreferrer");
    return;
  }

  // Internal route — normalise to a leading slash and hand to the router
  navigate(link.startsWith("/") ? link : `/${link}`);
}
