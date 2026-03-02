import { TileLayer } from "react-leaflet";
import { getMapRenderer } from "@/tracking/providers/factory";
import { usageMonitor } from "@/tracking/usage/usageMonitor";

export default function MapTileLayer() {
  const config = getMapRenderer().getRenderConfig();

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

