import { useEffect } from "react";
import { useMap } from "react-leaflet";
import { usageMonitor } from "@/tracking/usage/usageMonitor";

export default function MapUsageTracker() {
  useMap();

  useEffect(() => {
    usageMonitor.trackMapInstantiation();
  }, []);

  return null;
}

