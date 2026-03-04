import type { MapRenderer } from "@/tracking/interfaces";
import { resolveMapboxAccessToken, resolveMapboxStyleUrl } from "@/tracking/mapbox/mapboxLoader";

export const leafletProviderA: MapRenderer = {
  id: "PROVIDER_A",
  getRenderConfig() {
    const useMapboxLeafletTiles =
      String((import.meta.env as any).VITE_LEAFLET_USE_MAPBOX_TILES || "")
        .toLowerCase()
        .trim() === "true";
    const token = resolveMapboxAccessToken();
    const styleUrl = resolveMapboxStyleUrl();
    const styleIdFromUrl = styleUrl.startsWith("mapbox://styles/")
      ? String(styleUrl.replace("mapbox://styles/", "")).trim()
      : "";
    const envStyleId = String((import.meta.env as any).VITE_MAPBOX_STYLE_ID || "").trim();
    const styleId = styleIdFromUrl || envStyleId || "mapbox/navigation-night-v1";
    const mapboxTileUrl = useMapboxLeafletTiles && token
      ? `https://api.mapbox.com/styles/v1/${styleId}/tiles/256/{z}/{x}/{y}?access_token=${token}`
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    return {
      provider: "PROVIDER_A",
      tileUrl: mapboxTileUrl,
      attribution: useMapboxLeafletTiles && token
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
