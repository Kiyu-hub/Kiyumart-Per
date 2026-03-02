import type { MapRenderer } from "@/tracking/interfaces";

export const leafletProviderA: MapRenderer = {
  id: "PROVIDER_A",
  getRenderConfig() {
    return {
      provider: "PROVIDER_A",
      tileUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 3,
      maxZoom: 19,
      detectRetina: true,
      updateWhenIdle: true,
      keepBuffer: 2,
    };
  },
};

