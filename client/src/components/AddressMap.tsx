import { useEffect, useMemo, useRef, useState } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMapEvents, useMap } from "react-leaflet";
import { useToast } from "@/hooks/use-toast";
import { Icon, LatLngExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import MapTileLayer from "@/tracking/components/MapTileLayer";
import { ensureMapboxRuntimeConfig, resolveMapboxAccessToken, resolveMapboxStyleUrl } from "@/tracking/mapbox/mapboxLoader";
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
  selectedCoordinates?: [number, number] | null;
};

export default function AddressMap({ address, onAddressChange, onLocationChange, className, selectedCoordinates = null }: Props) {
  const { toast } = useToast();
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [searching, setSearching] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const [mapboxConfigVersion, setMapboxConfigVersion] = useState(0);
  const debounceRef = useRef<number | null>(null);
  const skipNextAddressLookupRef = useRef<string | null>(null);
  const positionRef = useRef<[number, number] | null>(null);
  const activeLocationRequestRef = useRef(0);
  const activeSelectionRequestRef = useRef(0);
  const activeAddressLookupRef = useRef(0);
  const ghanaCenter: [number, number] = [7.9465, -1.0232];

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

  function normalizeAddressValue(value: string | null | undefined) {
    return String(value || "").trim().toLowerCase();
  }

  function isSamePoint(a: [number, number] | null, b: [number, number]) {
    if (!a) return false;
    return Math.abs(a[0] - b[0]) < 0.00005 && Math.abs(a[1] - b[1]) < 0.00005;
  }

  function uniqueAddressParts(parts: Array<string | null | undefined>) {
    const seen = new Set<string>();
    return parts
      .map((part) => String(part || "").trim())
      .filter((part) => {
        if (!part) return false;
        const normalized = part.toLowerCase();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
      });
  }

  function isSpecificAddress(value: string | null | undefined) {
    const text = String(value || "").trim();
    if (!text) return false;
    return text.includes(",") || text.split(/\s+/).length >= 4;
  }

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    if (!selectedCoordinates) return;
    if (!inGhana(selectedCoordinates[0], selectedCoordinates[1])) return;
    if (isSamePoint(positionRef.current, selectedCoordinates)) return;
    setPosition(selectedCoordinates);
  }, [selectedCoordinates?.[0], selectedCoordinates?.[1]]);

  useEffect(() => {
    void ensureMapboxRuntimeConfig()
      .then(() => setMapboxConfigVersion((value) => value + 1))
      .catch(() => {
        // Keep the local tile fallback when runtime config is unavailable.
      });
  }, []);

  const mapboxToken = resolveMapboxAccessToken();
  const mapboxStyleId = useMemo(() => {
    const runtimeStyle = resolveMapboxStyleUrl();
    if (runtimeStyle.startsWith("mapbox://styles/")) {
      return String(runtimeStyle.replace("mapbox://styles/", "")).trim();
    }
    return "mapbox/navigation-day-v1";
  }, [mapboxConfigVersion]);

  const mapboxTileUrl = mapboxToken
    ? `https://api.mapbox.com/styles/v1/${mapboxStyleId}/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`
    : "";

  async function applyCurrentLocation(lat: number, lng: number, source: "auto" | "manual") {
    if (!inGhana(lat, lng)) {
      if (!positionRef.current) {
        setPosition(ghanaCenter);
      }
      if (source === "manual") {
        toast({
          title: "Current location unavailable",
          description: "Your current device location is outside Ghana. Please place the pin within Ghana.",
          variant: "destructive",
        });
      }
      return;
    }
    await updateSelectedLocation(lat, lng, {
      showToast: source === "manual",
      toastTitle: "Location set",
    });
  }

  async function updateSelectedLocation(
    lat: number,
    lng: number,
    options?: { showToast?: boolean; toastTitle?: string; showOutsideGhanaToast?: boolean }
  ) {
    const selectionRequestId = ++activeSelectionRequestRef.current;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    if (!inGhana(lat, lng)) {
      if (options?.showOutsideGhanaToast) {
        toast({
          title: "Location outside service area",
          description: "Please keep the delivery point within Ghana.",
          variant: "destructive",
        });
      }
      return;
    }

    setPosition([lat, lng]);
    const addr = await reverseGeocode(lat, lng);
    if (selectionRequestId !== activeSelectionRequestRef.current) {
      return;
    }
    if (addr) {
      skipNextAddressLookupRef.current = normalizeAddressValue(addr);
      onAddressChange(addr);
    }
    if (onLocationChange) onLocationChange(lat, lng, addr || undefined);

    if (options?.showToast) {
      toast({
        title: options.toastTitle || "Location updated",
        description: shortAddress(addr) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      });
    }
  }

  function requestCurrentLocation(source: "auto" | "manual") {
    const locationRequestId = ++activeLocationRequestRef.current;
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const geolocation = window.navigator?.geolocation;
    if (!geolocation) {
      if (source === "manual") {
        toast({
          title: "Location unavailable",
          description: "Your browser does not support location access.",
          variant: "destructive",
        });
      } else if (!positionRef.current) {
        setPosition(ghanaCenter);
      }
      return;
    }

    setIsLocating(true);
    geolocation.getCurrentPosition(
      async (pos) => {
        if (locationRequestId !== activeLocationRequestRef.current) {
          return;
        }
        try {
          await applyCurrentLocation(pos.coords.latitude, pos.coords.longitude, source);
        } finally {
          if (locationRequestId === activeLocationRequestRef.current) {
            setIsLocating(false);
          }
        }
      },
      (error) => {
        if (locationRequestId !== activeLocationRequestRef.current) {
          return;
        }
        setIsLocating(false);
        if (source !== "manual") {
          if (!positionRef.current) {
            setPosition(ghanaCenter);
          }
          return;
        }
        const permissionDenied = error?.code === 1;
        const timeout = error?.code === 3;
        toast({
          title: permissionDenied ? "Location permission needed" : timeout ? "Location request timed out" : "Couldn't fetch current location",
          description: permissionDenied
            ? "Please allow location access so we can fill in your delivery point."
            : timeout
              ? "Please try again and keep location services enabled."
              : "Please try again or place the pin manually on the map.",
          variant: "destructive",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function stopMapEvent(event: {
    preventDefault: () => void;
    stopPropagation: () => void;
    nativeEvent?: { stopImmediatePropagation?: () => void };
  }) {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
  }

  useEffect(() => {
    requestCurrentLocation("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When `address` prop changes, debounce and geocode
  useEffect(() => {
    const normalizedAddress = normalizeAddressValue(address);
    if (!normalizedAddress) return;
    if (skipNextAddressLookupRef.current && skipNextAddressLookupRef.current === normalizedAddress) {
      skipNextAddressLookupRef.current = null;
      return;
    }
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const lookupRequestId = ++activeAddressLookupRef.current;
    debounceRef.current = window.setTimeout(() => {
      setSearching(true);
      geocode(address).then((res) => {
        if (lookupRequestId !== activeAddressLookupRef.current) return;
        if (res) {
          const nextPosition: [number, number] = [res.lat, res.lon];
          const normalizedResolved = normalizeAddressValue(res.display_name);
          if (normalizedResolved && normalizedResolved !== normalizedAddress && isSpecificAddress(res.display_name)) {
            skipNextAddressLookupRef.current = normalizedResolved;
            onAddressChange(res.display_name);
          }
          if (isSamePoint(positionRef.current, nextPosition)) return;
          setPosition(nextPosition);
          if (onLocationChange) onLocationChange(res.lat, res.lon, res.display_name);
        }
      }).finally(() => {
        if (lookupRequestId === activeAddressLookupRef.current) {
          setSearching(false);
        }
      });
    }, 5000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function geocode(q: string): Promise<{ lat: number; lon: number; display_name: string } | null> {
    try {
      await ensureMapboxRuntimeConfig();
      const mapboxToken = resolveMapboxAccessToken();
      if (mapboxToken) {
        const proximity = `${-0.1869644},${5.6037168}`;
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?country=gh&types=address,poi,street,neighborhood,locality,place,postcode&autocomplete=true&limit=1&proximity=${proximity}&access_token=${mapboxToken}`;
        const mapboxRes = await fetch(mapboxUrl, { headers: { Accept: "application/json" } });
        const mapboxData = await mapboxRes.json();
        const feature = Array.isArray(mapboxData?.features) ? mapboxData.features[0] : null;
        if (feature?.center?.length >= 2) {
          const lon = Number(feature.center[0]);
          const lat = Number(feature.center[1]);
          if (!inGhana(lat, lon)) return null;
          const contextParts = Array.isArray(feature.context)
            ? feature.context.map((entry: any) => String(entry?.text || entry?.place_name || "").trim())
            : [];
          const fullName = uniqueAddressParts([
            feature.place_name,
            feature.matching_place_name,
            feature.properties?.full_address,
            feature.address ? `${feature.address} ${feature.text || ""}` : null,
            feature.text,
            ...contextParts,
          ]).join(", ");
          return { lat, lon, display_name: fullName || String(feature.place_name || q) };
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
        const mapboxUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?types=address,poi,street,neighborhood,locality,place&limit=1&access_token=${mapboxToken}`;
        const mapboxRes = await fetch(mapboxUrl, { headers: { Accept: "application/json" } });
        const mapboxData = await mapboxRes.json();
        const feature = Array.isArray(mapboxData?.features) ? mapboxData.features[0] : null;
        if (feature) {
          const contextParts = Array.isArray(feature.context)
            ? feature.context.map((entry: any) => String(entry?.text || entry?.place_name || "").trim())
            : [];
          const fullName = uniqueAddressParts([
            feature.properties?.full_address,
            feature.address ? `${feature.address} ${feature.text || ""}` : null,
            feature.text,
            feature.place_name,
            ...contextParts,
          ]).join(", ");
          if (fullName) return fullName;
        }
      }

      const fallbackUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1`;
      const fallbackRes = await fetch(fallbackUrl, { headers: { Accept: "application/json" } });
      const fallbackData = await fallbackRes.json();
      if (fallbackData) {
        const addr = (fallbackData as any).address || {};
        const parts = uniqueAddressParts([
          addr.house_number ? `${addr.house_number} ${addr.road || ""}`.trim() : null,
          addr.road,
          addr.neighbourhood,
          addr.suburb,
          addr.city_district,
          addr.city || addr.town || addr.village || addr.hamlet,
          addr.county,
          addr.state,
          addr.country,
        ]);
        if (parts.length > 0) return parts.join(", ");
        if (fallbackData.display_name) return fallbackData.display_name;
      }
    } catch (e) {}
    return null;
  }

  function MapEvents() {
    useMapEvents({
      click: async (e) => {
        const { lat, lng } = e.latlng;
        await updateSelectedLocation(lat, lng, { showOutsideGhanaToast: true });
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
        map.flyTo(pos as LatLngExpression, 16, { animate: true, duration: 1.1 });
      }
    }, [pos, map]);
    return null;
  }

  return (
    <div className={className}>
      <div style={{ height: 260 }} className="rounded-xl overflow-hidden border border-white/10 bg-slate-950/60 relative shadow-[0_18px_40px_rgba(0,0,0,0.18)]">
        <MapContainer
          center={(position as LatLngExpression) || ghanaCenter}
          zoom={position ? 16 : 7}
          minZoom={6}
          maxZoom={19}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom
          dragging
          doubleClickZoom
          zoomControl
          attributionControl
          maxBounds={[[GH_BOUNDS.south, GH_BOUNDS.west], [GH_BOUNDS.north, GH_BOUNDS.east]]}
          maxBoundsViscosity={1}
        >
          {mapboxTileUrl ? (
            <TileLayer
              url={mapboxTileUrl}
              attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              tileSize={512}
              zoomOffset={-1}
              minZoom={6}
              maxZoom={19}
              updateWhenIdle
              keepBuffer={2}
            />
          ) : (
            <MapTileLayer presetId="esri_satellite" />
          )}
          <MapEvents />
          <RecenterMap pos={position} />
          {position && (
            <Marker
              ref={markerRef}
              position={position}
              icon={markerIcon}
              draggable
              eventHandlers={{
                dragend: async (event) => {
                  const marker = event.target;
                  const nextPosition = marker.getLatLng();
                  await updateSelectedLocation(nextPosition.lat, nextPosition.lng, {
                    showToast: true,
                    toastTitle: "Location updated",
                    showOutsideGhanaToast: true,
                  });
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <div className="font-semibold">Delivery Location</div>
                  <div className="text-muted-foreground truncate">{shortAddress(address) || "Selected location"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Drag the pin or tap the map to refine the drop-off point.</div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>

        <div className="pointer-events-none absolute bottom-3 left-3 z-[1000] rounded-full border border-white/10 bg-slate-950/80 px-3 py-1.5 text-[11px] font-medium tracking-[0.18em] text-slate-100 shadow-lg backdrop-blur-md">
          {mapboxTileUrl ? "MAPBOX VIEW | GHANA ONLY" : "SATELLITE VIEW | GHANA ONLY"}
        </div>

        {/* Current location shortcut pinned inside the map */}
        <div className="pointer-events-none absolute top-3 right-3 z-[1000]">
          <button
            type="button"
            aria-label="Use current location"
            title="Use current location"
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/90 px-4 py-2 text-sm font-medium text-white shadow-[0_14px_32px_rgba(0,0,0,0.32)] backdrop-blur-md transition hover:border-cyan-300/30 hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-70"
            disabled={isLocating}
            onPointerDown={stopMapEvent}
            onClick={(event) => {
              stopMapEvent(event);
              requestCurrentLocation("manual");
            }}
            data-testid="button-use-current-location"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-cyan-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m0 14v1m8-8h1M3 12H2m15.364-6.364l.707.707M6.343 17.657l-.707.707m12.728 0l.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
            </svg>
            <span>{isLocating ? "Finding location..." : "Use current location"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
