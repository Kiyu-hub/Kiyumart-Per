import type { MapRenderer } from "@/tracking/interfaces";

export const leafletProviderB: MapRenderer = {
  id: "PROVIDER_B",
  getRenderConfig() {
    return {
      provider: "PROVIDER_B",
      tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 3,
      maxZoom: 19,
      detectRetina: false,
      updateWhenIdle: true,
      keepBuffer: 2,
    };
  },
};

