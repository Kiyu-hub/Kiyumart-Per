import { useEffect, useRef, useState } from "react";
import { MapContainer, Marker, Popup, useMapEvents, useMap } from "react-leaflet";
import { useToast } from "@/hooks/use-toast";
import { Icon, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import MapTileLayer from "@/tracking/components/MapTileLayer";
import { ensureMapboxRuntimeConfig, resolveMapboxAccessToken } from "@/tracking/mapbox/mapboxLoader";
import markerIconUrl from "leaflet/dist/images/marker-icon.png";
import markerIcon2xUrl from "leaflet/dist/images/marker-icon-2x.png";
import markerShadowUrl from "leaflet/dist/images/marker-shadow.png";

// Fix default icon paths
import { Icon as LeafIcon } from "leaflet";
// @ts-ignore
delete (LeafIcon as any).Default.prototype._getIconUrl;
(LeafIcon as any).Default.mergeOptions({
  iconUrl: markerIconUrl,
  iconRetinaUrl: markerIcon2xUrl,
  shadowUrl: markerShadowUrl,
});

type Props = {
  address: string;
  onAddressChange: (addr: string) => void;
  onLocationChange?: (lat: number, lng: number, addr?: string) => void;
  className?: string;
};

export default function AddressMap({ address, onAddressChange, onLocationChange, className }: Props) {
  const { toast } = useToast();
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  // Ghana bounding box and helper
  const GH_BOUNDS = {
    south: 4.5,
    west: -3.5,
    north: 11.5,
    east: 1.5,
  };

  function inGhana(lat: number, lon: number) {
    return lat >= GH_BOUNDS.south && lat <= GH_BOUNDS.north && lon >= GH_BOUNDS.west && lon <= GH_BOUNDS.east;
  }

  // On mount: try browser geolocation
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        // Only accept geolocation if inside Ghana bounds
        if (inGhana(lat, lng)) {
          setPosition([lat, lng]);
          // reverse geocode to populate address
          reverseGeocode(lat, lng).then((addr) => {
            if (addr) onAddressChange(addr);
            if (onLocationChange) onLocationChange(lat, lng, addr || undefined);
            // show a small toast confirming location capture
            try {
              toast({ title: "Location set", description: shortAddress(addr) || `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
            } catch (e) {}
          }).catch(() => {});
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // When `address` prop changes, debounce and geocode
  useEffect(() => {
    if (!address || address.trim().length === 0) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setSearching(true);
      geocode(address).then((res) => {
        if (res) {
          setPosition([res.lat, res.lon]);
          if (onLocationChange) onLocationChange(res.lat, res.lon, res.display_name);
        }
      }).finally(() => setSearching(false));
    }, 650);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function geocode(q: string): Promise<{ lat: number; lon: number; display_name: string } | null> {
    try {
      await ensureMapboxRuntimeConfig();
      const mapboxToken = resolveMapboxAccessToken();
      if (mapboxToken) {
        const proximity = `${-0.1869644},${5.6037168}`;
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=gh&limit=1&proximity=${proximity}&access_token=${mapboxToken}`;
        const mapboxRes = await fetch(mapboxUrl, { headers: { Accept: "application/json" } });
        const mapboxData = await mapboxRes.json();
        const feature = Array.isArray(mapboxData?.features) ? mapboxData.features[0] : null;
        if (feature?.center?.length >= 2) {
          const lon = Number(feature.center[0]);
          const lat = Number(feature.center[1]);
          if (!inGhana(lat, lon)) return null;
          return { lat, lon, display_name: String(feature.place_name || q) };
        }
      }

      // Fallback geocoder for non-configured environments
      const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&countrycodes=gh&bounded=1`;
      const fallbackRes = await fetch(fallbackUrl, { headers: { Accept: "application/json" } });
      const fallbackData = await fallbackRes.json();
      if (fallbackData && fallbackData.length > 0) {
        const lat = parseFloat(fallbackData[0].lat);
        const lon = parseFloat(fallbackData[0].lon);
        if (!inGhana(lat, lon)) return null;
        return { lat, lon, display_name: fallbackData[0].display_name };
      }
    } catch (e) {}
    return null;
  }

  async function reverseGeocode(lat: number, lon: number): Promise<string | null> {
    try {
      await ensureMapboxRuntimeConfig();
      const mapboxToken = resolveMapboxAccessToken();
      if (mapboxToken) {
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=address,poi,neighborhood,place&limit=1&access_token=${mapboxToken}`;
        const mapboxRes = await fetch(mapboxUrl, { headers: { Accept: "application/json" } });
        const mapboxData = await mapboxRes.json();
        const feature = Array.isArray(mapboxData?.features) ? mapboxData.features[0] : null;
        if (feature?.place_name) return String(feature.place_name);
      }

      const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
      const fallbackRes = await fetch(fallbackUrl, { headers: { Accept: "application/json" } });
      const fallbackData = await fallbackRes.json();
      if (fallbackData) {
        // Prefer specific address parts (neighbourhood/suburb/road + city/county/state)
        const addr = (fallbackData as any).address || {};
        const partA = addr.neighbourhood || addr.suburb || addr.road || addr.village || addr.town || addr.hamlet || null;
        const partB = addr.city || addr.town || addr.village || addr.county || addr.state || null;
        const parts = [partA, partB].filter(Boolean);
        if (parts.length > 0) return parts.join(', ');
        if (fallbackData.display_name) return fallbackData.display_name;
      }
    } catch (e) {}
    return null;
  }

  function MapEvents() {
    useMapEvents({
      click: async (e) => {
        const { lat, lng } = e.latlng;
        // Ignore clicks outside Ghana
        if (!inGhana(lat, lng)) return;
        setPosition([lat, lng]);
        const addr = await reverseGeocode(lat, lng);
        if (addr) onAddressChange(addr);
        if (onLocationChange) onLocationChange(lat, lng, addr || undefined);
      },
      dragend: async (e) => {
        // no-op here (marker handles drag)
      },
    });
    return null;
  }

  const markerIcon = new Icon({
    iconUrl: markerIconUrl,
    iconRetinaUrl: markerIcon2xUrl,
    shadowUrl: markerShadowUrl,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
  const markerRef = useRef<any>(null);

  // Inject marker bounce CSS once
  useEffect(() => {
    const id = "kiyumart-marker-bounce-style";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.innerHTML = `
      .marker-bounce { animation: marker-bounce 700ms ease; }
      @keyframes marker-bounce {
        0% { transform: translateY(0); }
        30% { transform: translateY(-14px); }
        50% { transform: translateY(0); }
        100% { transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }, []);

  // Trigger bounce when position updates
  useEffect(() => {
    if (!position || !markerRef.current) return;
    try {
      const el = markerRef.current.getElement ? markerRef.current.getElement() : null;
      if (el) {
        el.classList.remove("marker-bounce");
        // force reflow
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        el.offsetWidth;
        el.classList.add("marker-bounce");
        setTimeout(() => el.classList.remove("marker-bounce"), 900);
      }
    } catch (e) {}
  }, [position]);

  // helper to shorten display name into a concise address (3 parts max)
  function shortAddress(full?: string | null) {
    if (!full) return null;
    const parts = full.split(",").map(p => p.trim()).filter(Boolean);
    return parts.slice(0, 3).join(", ");
  }

  function RecenterMap({ pos }: { pos: [number, number] | null }) {
    const map = useMap();
    useEffect(() => {
      if (pos) {
        map.setView(pos as LatLngExpression, 15, { animate: true });
      }
    }, [pos, map]);
    return null;
  }

  return (
    <div className={className}>
      <div style={{ height: 200 }} className="rounded-md overflow-hidden border relative">
        <MapContainer
          center={(position as LatLngExpression) || [7.9465, -1.0232]}
          zoom={position ? 15 : 6}
          minZoom={6}
          maxZoom={18}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
          maxBounds={[[GH_BOUNDS.south, GH_BOUNDS.west], [GH_BOUNDS.north, GH_BOUNDS.east]]}
          maxBoundsViscosity={0.8}
        >
          <MapTileLayer />
          <MapEvents />
          <RecenterMap pos={position} />
          {position && (
            <Marker ref={markerRef} position={position} icon={markerIcon}>
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Delivery Location</div>
                  <div className="text-muted-foreground truncate">{shortAddress(address) || "Selected location"}</div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        {/* Modern compact location button inside map (icon-only) */}
        <div className="absolute top-3 right-3 z-[600]">
          <button
            aria-label="Use current location"
            title="Use current location"
            className="inline-flex items-center gap-2 bg-white/90 text-slate-800 dark:bg-black/60 dark:text-white px-3 py-1 rounded-md shadow-lg hover:scale-102 transition-transform"
            onClick={async () => {
              if (!navigator.geolocation) return;
              navigator.geolocation.getCurrentPosition(async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (!inGhana(lat, lng)) return;
                setPosition([lat, lng]);
                const addr = await reverseGeocode(lat, lng);
                if (addr) onAddressChange(addr);
                if (onLocationChange) onLocationChange(lat, lng, addr || undefined);
                try {
                  toast({ title: "Location set", description: shortAddress(addr) || `${lat.toFixed(4)}, ${lng.toFixed(4)}` });
                } catch (e) {}
              });
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-8h1M3 12H2m15.364-6.364l.707.707M6.343 17.657l-.707.707m12.728 0l.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
            <span className="text-sm font-medium">Use current location</span>
          </button>
        </div>
      </div>
    </div>
  );
}
