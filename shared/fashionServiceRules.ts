/** Shared rules for fashion-service workflows. Kept pure for regression tests. */
export const FASHION_SERVICE_TYPES = [
  { key: "tailoring", label: "Tailoring & Alterations" },
  { key: "custom_design", label: "Custom Fashion Design" },
  { key: "occasion_wear", label: "Bridal & Occasion Wear" },
  { key: "consultation", label: "Fashion Consultation" },
] as const;

export type FashionRequestStatus =
  | "pending" | "quoted" | "accepted" | "in_progress"
  | "ready_for_collection" | "completed" | "declined" | "cancelled";

export function validServiceType(value: string): boolean {
  return FASHION_SERVICE_TYPES.some((service) => service.key === value);
}

/** Select the correct participant-scoped list; a seller can also be a customer. */
export type FashionRequestListScope = "all" | "seller" | "buyer";
export function fashionRequestListScope(role: string, view?: "buyer"): FashionRequestListScope {
  if (view === "buyer") return "buyer";
  return role === "super_admin" ? "all" : role === "seller" ? "seller" : "buyer";
}

/** Only unpaid, pending requests and existing quotes can be quoted again. */
export function canQuoteFashionRequest(status: FashionRequestStatus, paidPesewas: number): boolean {
  return (status === "pending" || status === "quoted") && paidPesewas === 0;
}

export function canTransitionFashionRequest(
  from: FashionRequestStatus,
  to: FashionRequestStatus,
  actor: "buyer" | "seller",
  paidPesewas: number,
  requiredDepositPesewas: number,
): boolean {
  if (actor === "buyer") {
    if (to === "cancelled") return (from === "pending" || from === "quoted" || from === "accepted") && paidPesewas === 0;
    if (to === "accepted") return from === "quoted";
    return from === "ready_for_collection" && to === "completed";
  }
  if (to === "declined") return from === "pending" && paidPesewas === 0;
  if (to === "in_progress") return from === "accepted" && paidPesewas >= requiredDepositPesewas;
  return from === "in_progress" && to === "ready_for_collection";
}

export function depositDuePesewas(quotePesewas: number, depositPercent: number): number {
  if (!Number.isSafeInteger(quotePesewas) || quotePesewas < 100 || ![50, 100].includes(depositPercent)) {
    throw new Error("Invalid quote or deposit percentage");
  }
  return Math.ceil(quotePesewas * depositPercent / 100);
}

/** First payment is the agreed deposit; later payments cover remaining balance. */
export function nextFashionPaymentPesewas(
  quotePesewas: number,
  depositPercent: number,
  paidPesewas: number,
): number {
  const deposit = depositDuePesewas(quotePesewas, depositPercent);
  if (!Number.isSafeInteger(paidPesewas) || paidPesewas < 0 || paidPesewas > quotePesewas) {
    throw new Error("Invalid paid balance");
  }
  return paidPesewas === 0 ? deposit : quotePesewas - paidPesewas;
}

export function validateFashionImages(urls: string[], maximum: number): string[] {
  if (urls.length > maximum) throw new Error("Too many images");
  return urls.map(url => {
    const trimmed = url.trim();
    if (trimmed.length > 1500 || !/^https:\/\//i.test(trimmed)) throw new Error("Images must use secure HTTPS URLs");
    return trimmed;
  });
}
