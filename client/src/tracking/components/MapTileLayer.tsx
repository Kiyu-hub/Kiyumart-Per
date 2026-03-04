import { TileLayer } from "react-leaflet";
import { getMapRenderer } from "@/tracking/providers/factory";
import { usageMonitor } from "@/tracking/usage/usageMonitor";

export interface OpenSourceMapPreset {
  id: string;
  label: string;
  tileUrl: string;
  attribution: string;
  minZoom?: number;
  maxZoom?: number;
  detectRetina?: boolean;
}

export const OPEN_SOURCE_MAP_PRESETS: OpenSourceMapPreset[] = [
  {
    id: "carto_voyager",
    label: "Voyager",
    tileUrl: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    minZoom: 2,
    maxZoom: 20,
    detectRetina: true,
  },
  {
    id: "osm_standard",
    label: "OpenStreetMap",
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    minZoom: 2,
    maxZoom: 19,
    detectRetina: false,
  },
  {
    id: "osm_hot",
    label: "Humanitarian",
    tileUrl: "https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png",
    attribution: '&copy; OpenStreetMap contributors, Tiles style by Humanitarian OpenStreetMap Team hosted by OpenStreetMap France',
    minZoom: 2,
    maxZoom: 19,
    detectRetina: false,
  },
  {
    id: "open_topo",
    label: "Topo",
    tileUrl: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap',
    minZoom: 2,
    maxZoom: 17,
    detectRetina: false,
  },
  {
    id: "esri_satellite",
    label: "Satellite",
    tileUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    minZoom: 2,
    maxZoom: 19,
    detectRetina: false,
  },
  {
    id: "carto_dark",
    label: "Dark",
    tileUrl: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; <a href="https://carto.com/attributions">CARTO</a>',
    minZoom: 2,
    maxZoom: 20,
    detectRetina: true,
  },
];

interface MapTileLayerProps {
  presetId?: string | null;
}

export default function MapTileLayer({ presetId }: MapTileLayerProps) {
  const fallbackConfig = getMapRenderer().getRenderConfig();
  const preset = presetId ? OPEN_SOURCE_MAP_PRESETS.find((entry) => entry.id === presetId) : null;
  const config = preset
    ? {
        provider: fallbackConfig.provider,
        tileUrl: preset.tileUrl,
        attribution: preset.attribution,
        minZoom: preset.minZoom,
        maxZoom: preset.maxZoom,
        detectRetina: preset.detectRetina,
        updateWhenIdle: true,
        keepBuffer: 2,
      }
    : fallbackConfig;

  return (
    <TileLayer
      attribution={config.attribution}
      url={config.tileUrl}
      minZoom={config.minZoom}
      maxZoom={config.maxZoom}
      detectRetina={config.detectRetina}
      updateWhenIdle={config.updateWhenIdle}
      keepBuffer={config.keepBuffer}
      eventHandlers={{
        tileloadstart: () => usageMonitor.trackTileLoad(),
      }}
    />
  );
}
