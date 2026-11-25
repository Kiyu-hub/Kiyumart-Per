/**
 * KiyuMart is permanently a multi-vendor, fashion-only marketplace.
 * - isMultiVendor is always true (single-store mode is retired).
 * - restaurantsEnabled is always false (the restaurant / local-vendor food
 *   experience is switched off; its code stays but is unreachable).
 * Brand colours and homepage discovery remain independent.
 */
export function withPermanentMultiVendor<T extends object>(
  settings: T,
): T & { isMultiVendor: true; restaurantsEnabled: false } {
  return { ...settings, isMultiVendor: true, restaurantsEnabled: false };
}
