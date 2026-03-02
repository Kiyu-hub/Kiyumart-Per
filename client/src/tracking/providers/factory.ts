import { USE_PROVIDER } from "@/tracking/config";
import type { MapRenderer, RoutingEngine } from "@/tracking/interfaces";
import { leafletProviderA } from "@/tracking/providers/map/leafletProviderA";
import { leafletProviderB } from "@/tracking/providers/map/leafletProviderB";
import { osrmProviderA } from "@/tracking/providers/routing/osrmProviderA";
import { osrmProviderB } from "@/tracking/providers/routing/osrmProviderB";

export function getMapRenderer(): MapRenderer {
  return USE_PROVIDER === "PROVIDER_B" ? leafletProviderB : leafletProviderA;
}

export function getRoutingEngine(): RoutingEngine {
  return USE_PROVIDER === "PROVIDER_B" ? osrmProviderB : osrmProviderA;
}

