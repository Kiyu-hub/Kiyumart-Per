/** KiyuMart is permanently a multi-vendor marketplace. Brand colours and homepage discovery remain independent. */
export function withPermanentMultiVendor<T extends object>(settings: T): T & { isMultiVendor: true } {
  return { ...settings, isMultiVendor: true };
}
