import type { MapRenderer } from "@/tracking/interfaces";

export const leafletProviderA: MapRenderer = {
  id: "PROVIDER_A",
  getRenderConfig() {
    const token = String((import.meta.env as any).VITE_MAPBOX_ACCESS_TOKEN || "").trim();
    const styleId = String((import.meta.env as any).VITE_MAPBOX_STYLE_ID || "mapbox/dark-v11").trim();
    const mapboxTileUrl = token
      ? `https://api.mapbox.com/styles/v1/${styleId}/tiles/256/{z}/{x}/{y}?access_token=${token}`
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    return {
      provider: "PROVIDER_A",
      tileUrl: mapboxTileUrl,
      attribution: token
        ? '© <a href="https://www.mapbox.com/about/maps/">Mapbox</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 3,
      maxZoom: 19,
      detectRetina: true,
      updateWhenIdle: true,
      keepBuffer: 2,
    };
  },
};
