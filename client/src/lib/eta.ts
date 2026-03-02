export interface OrderEtaResponse {
  orderId: string;
  orderNumber: string;
  distanceKm: number;
  etaMinutes: number;
  rawEtaMinutes?: number;
  aiEtaMinutes?: number;
  etaConfidenceScore?: number;
  aiEtaEnabled?: boolean;
  aiEtaVisible?: boolean;
  etaRegion?: string;
  speedKmh: number;
  source: string;
  calculatedAt: string;
}

export async function fetchOrderEta(params: {
  orderId: string;
  riderLat?: number | null;
  riderLng?: number | null;
  speed?: number | null;
}): Promise<OrderEtaResponse> {
  const search = new URLSearchParams();
  if (typeof params.riderLat === "number") search.set("riderLat", String(params.riderLat));
  if (typeof params.riderLng === "number") search.set("riderLng", String(params.riderLng));
  if (typeof params.speed === "number") search.set("speed", String(params.speed));

  const base = (import.meta.env as any).VITE_API_URL || "";
  const url = `${base}/api/orders/${params.orderId}/eta${search.toString() ? `?${search.toString()}` : ""}`;
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch ETA: ${response.status} ${text}`);
  }
  return response.json();
}
