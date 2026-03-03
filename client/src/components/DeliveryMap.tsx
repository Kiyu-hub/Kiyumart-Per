import { useEffect, useState, useMemo } from "react";
import { MapContainer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { Icon, LatLngExpression, DivIcon } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import UserAvatar from "@/components/UserAvatar";
import { Loader2, MapPin, Navigation, Star, Car, Clock } from "lucide-react";
import MapTileLayer from "@/tracking/components/MapTileLayer";
import MapUsageTracker from "@/tracking/components/MapUsageTracker";
import { useVehicleTracking } from "@/tracking/hooks/useVehicleTracking";
import { isMapboxGlPreferred } from "@/tracking/mapbox/mapboxLoader";
import MapboxSingleTripMap from "@/tracking/mapbox/MapboxSingleTripMap";

// Fix Leaflet icon issue
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

// @ts-ignore
delete Icon.Default.prototype._getIconUrl;
Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface DeliveryMapProps {
  orderId?: string;
  deliveryLocation: {
    latitude: number;
    longitude: number;
    address: string;
  };
  riderLocation?: {
    latitude: number;
    longitude: number;
    timestamp?: string;
    heading?: number;
    speed?: number;
  };
  riderInfo?: {
    name?: string;
    profileImage?: string;
    rating?: number;
    vehicleType?: string;
    phone?: string;
  };
  orderNumber: string;
  className?: string;
  compact?: boolean;
}

// Format ETA for display
function formatETA(minutes: number): string {
  if (minutes < 1) return "Less than 1 min";
  if (minutes === 1) return "1 min";
  if (minutes < 60) return `${minutes} mins`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) return `${hours} ${hours === 1 ? 'hr' : 'hrs'}`;
  return `${hours} ${hours === 1 ? 'hr' : 'hrs'} ${mins} mins`;
}

// Component to auto-fit map bounds
function MapBoundsUpdater({ deliveryPos, riderPos }: { deliveryPos: [number, number]; riderPos?: [number, number] }) {
  const map = useMap();
  
  useEffect(() => {
    if (riderPos) {
      map.fitBounds([deliveryPos, riderPos], { padding: [50, 50] });
    } else {
      map.setView(deliveryPos, 15);
    }
  }, [map, deliveryPos, riderPos]);
  
  return null;
}

export default function DeliveryMap({ 
  orderId,
  deliveryLocation, 
  riderLocation, 
  riderInfo,
  orderNumber,
  className,
  compact = false
}: DeliveryMapProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [mapboxInitFailed, setMapboxInitFailed] = useState(false);
  const [mapboxError, setMapboxError] = useState("");
  const shouldUseMapboxGl = isMapboxGlPreferred() && !mapboxInitFailed;

  const deliveryPos: [number, number] = [deliveryLocation.latitude, deliveryLocation.longitude];
  const riderPos: [number, number] | undefined = riderLocation
    ? [riderLocation.latitude, riderLocation.longitude]
    : undefined;
  const trackedVehicle = useVehicleTracking({
    vehicleId: orderId ? `delivery-${orderId}` : `delivery-${orderNumber}`,
    orderId,
    destination: { lat: deliveryLocation.latitude, lng: deliveryLocation.longitude },
    tripPhase: riderPos ? "en_route" : "assigned",
    gps: riderLocation
      ? {
          lat: riderLocation.latitude,
          lng: riderLocation.longitude,
          speedMps: riderLocation.speed ?? 0,
          bearingDeg: riderLocation.heading ?? 0,
          timestampMs: riderLocation.timestamp ? new Date(riderLocation.timestamp).getTime() : Date.now(),
        }
      : undefined,
  });

  const animatedRiderPos: [number, number] | undefined = trackedVehicle?.predictedPosition
    ? [trackedVehicle.predictedPosition.lat, trackedVehicle.predictedPosition.lng]
    : riderPos;
  const routePolyline: [number, number][] = trackedVehicle?.route?.geometry?.length
    ? trackedVehicle.route.geometry.map((point) => [point.lat, point.lng] as [number, number])
    : animatedRiderPos
      ? [animatedRiderPos, deliveryPos]
      : [];

  // Backend is authoritative for ETA/distance. No client-derived fallback math.
  const distanceKm = typeof trackedVehicle?.eta?.distanceKm === "number" ? trackedVehicle.eta.distanceKm : null;
  const etaMinutes = typeof trackedVehicle?.eta?.minutes === "number" ? trackedVehicle.eta.minutes : null;

  // Create custom icons
  const deliveryIcon = new Icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  // Custom car icon for rider with rotation based on heading
  const riderIcon = useMemo(() => {
    const rotation = riderLocation?.heading || 0;
    return new DivIcon({
      className: 'custom-rider-marker',
      html: `
        <div style="transform: rotate(${rotation}deg); transition: transform 0.3s ease;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="11" fill="#10B981" opacity="0.2"/>
            <circle cx="12" cy="12" r="8" fill="#10B981"/>
            <path d="M12 6L12 12L16 14" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
  }, [riderLocation?.heading]);

  useEffect(() => {
    // Simulate map loading
    const timer = setTimeout(() => setIsLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <Card className={className} data-testid="card-map-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Delivery Map
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  // Compact mobile-first view (matching reference image)
  if (compact) {
    return (
      <div className={`relative h-screen w-full ${className}`} data-testid="map-container-compact">
        {/* Map Container */}
        {shouldUseMapboxGl ? (
          <MapboxSingleTripMap
            center={animatedRiderPos || deliveryPos}
            riderPos={animatedRiderPos || null}
            destinationPos={deliveryPos}
            routeGeometry={routePolyline}
            style={{ height: "100%", width: "100%" }}
            onLoad={() => {
              setMapboxInitFailed(false);
              setMapboxError("");
            }}
            onError={(error) => {
              console.error("Mapbox single trip map failed to initialize", error);
              setMapboxError(error instanceof Error ? error.message : String(error || "Mapbox initialization failed"));
              setMapboxInitFailed(true);
            }}
          />
        ) : (
          <MapContainer
            center={deliveryPos}
            zoom={15}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={true}
            zoomControl={false}
          >
            <MapTileLayer />
            <MapUsageTracker />
            
            {/* Delivery destination marker */}
            <Marker position={deliveryPos} icon={deliveryIcon}>
              <Popup>
                <div className="text-sm" data-testid="popup-delivery">
                  <p className="font-semibold">Delivery Destination</p>
                  <p className="text-muted-foreground">{deliveryLocation.address}</p>
                </div>
              </Popup>
            </Marker>

            {/* Rider location marker */}
            {animatedRiderPos && (
              <>
                <Marker position={animatedRiderPos} icon={riderIcon} />
                
                {routePolyline.length > 1 && (
                  <Polyline positions={routePolyline} color="#10B981" weight={4} opacity={0.8} />
                )}
              </>
            )}

            <MapBoundsUpdater deliveryPos={deliveryPos} riderPos={animatedRiderPos} />
          </MapContainer>
        )}

        {mapboxInitFailed && (
          <div className="absolute left-3 right-3 top-3 z-[1200] rounded-lg border border-amber-300 bg-background/95 p-2 text-xs text-amber-700 shadow-sm backdrop-blur">
            Falling back to standard map view. {mapboxError || "Mapbox initialization failed."}
          </div>
        )}

        {/* Delivery Address Banner (Top) */}
        <div className="absolute top-0 left-0 right-0 bg-black/80 text-white p-4 z-[1000]" data-testid="address-banner">
          <div className="flex items-center gap-2 max-w-md">
            <MapPin className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm font-medium truncate">{deliveryLocation.address}</p>
          </div>
        </div>

        {/* ETA Display (Center) */}
        {animatedRiderPos && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-[1000]" data-testid="eta-display">
            <div className="bg-white dark:bg-gray-800 rounded-full px-6 py-3 shadow-xl border-2 border-primary">
              <div className="flex flex-col items-center">
                <p className="text-3xl font-bold text-primary">{etaMinutes !== null ? etaMinutes : "--"}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">MIN AWAY</p>
              </div>
            </div>
          </div>
        )}

        {/* Rider Profile Card (Bottom) */}
        {animatedRiderPos && riderInfo && (
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl p-6 shadow-2xl z-[1000]" data-testid="rider-profile">
            <div className="flex items-center gap-4">
              <UserAvatar 
                profileImage={riderInfo.profileImage}
                name={riderInfo.name || 'Rider'}
                size="lg"
                className="h-14 w-14 border-2 border-primary"
              />
              
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-lg">{riderInfo.name || 'Your Rider'}</h3>
                  {riderInfo.rating && (
                    <div className="flex items-center gap-1 bg-yellow-100 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      <span className="text-xs font-medium">{riderInfo.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <Car className="h-4 w-4" />
                  <span>{riderInfo.vehicleType || 'Motorcycle'}</span>
                  <span className="mx-1">•</span>
                  <span>{distanceKm !== null ? `${distanceKm.toFixed(1)} km away` : "ETA pending"}</span>
                </div>
              </div>

              <button 
                className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                data-testid="button-call-rider"
                onClick={() => riderInfo?.phone && window.open(`tel:${riderInfo.phone}`, '_self')}
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Waiting for Rider */}
        {!animatedRiderPos && (
          <div className="absolute bottom-0 left-0 right-0 bg-white dark:bg-gray-900 rounded-t-3xl p-6 shadow-2xl z-[1000]" data-testid="waiting-rider">
            <div className="flex items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <p className="text-sm">Waiting for rider to start tracking...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Standard card view
  return (
    <Card className={className} data-testid="card-delivery-map">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          Delivery Tracking - Order #{orderNumber}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-96 rounded-lg overflow-hidden border" data-testid="map-container">
          {shouldUseMapboxGl ? (
            <MapboxSingleTripMap
              center={animatedRiderPos || deliveryPos}
              riderPos={animatedRiderPos || null}
              destinationPos={deliveryPos}
              routeGeometry={routePolyline}
              style={{ height: "100%", width: "100%" }}
              onLoad={() => {
                setMapboxInitFailed(false);
                setMapboxError("");
              }}
              onError={(error) => {
                console.error("Mapbox single trip map failed to initialize", error);
                setMapboxError(error instanceof Error ? error.message : String(error || "Mapbox initialization failed"));
                setMapboxInitFailed(true);
              }}
            />
          ) : (
            <MapContainer
              center={deliveryPos}
              zoom={15}
              style={{ height: "100%", width: "100%" }}
              scrollWheelZoom={false}
            >
              <MapTileLayer />
              <MapUsageTracker />
              
              {/* Delivery destination marker */}
              <Marker position={deliveryPos} icon={deliveryIcon}>
                <Popup>
                  <div className="text-sm" data-testid="popup-delivery">
                    <p className="font-semibold">Delivery Destination</p>
                    <p className="text-muted-foreground">{deliveryLocation.address}</p>
                  </div>
                </Popup>
              </Marker>

              {/* Rider location marker */}
              {animatedRiderPos && (
                <>
                  <Marker position={animatedRiderPos} icon={riderIcon}>
                    <Popup>
                      <div className="text-sm" data-testid="popup-rider">
                        <p className="font-semibold flex items-center gap-1">
                          <Navigation className="h-3 w-3" />
                          Rider Location
                        </p>
                        {riderLocation?.timestamp && (
                          <p className="text-xs text-muted-foreground">
                            Updated: {new Date(riderLocation.timestamp).toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                  
                  {/* Line connecting rider to destination */}
                  {routePolyline.length > 1 && (
                    <Polyline
                      positions={routePolyline}
                      color="#10B981"
                      weight={3}
                      opacity={0.6}
                      dashArray="10, 10"
                    />
                  )}
                </>
              )}

              <MapBoundsUpdater deliveryPos={deliveryPos} riderPos={animatedRiderPos} />
            </MapContainer>
          )}

          {mapboxInitFailed && (
            <div className="absolute left-3 right-3 top-3 z-[1200] rounded-lg border border-amber-300 bg-background/95 p-2 text-xs text-amber-700 shadow-sm backdrop-blur">
              Falling back to standard map view. {mapboxError || "Mapbox initialization failed."}
            </div>
          )}

          {/* ETA Overlay for standard view */}
          {animatedRiderPos && (
            <div className="absolute top-4 right-4 bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow-lg z-[1000]" data-testid="eta-badge">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">ETA</p>
                  <p className="text-sm font-bold text-primary">{etaMinutes !== null ? formatETA(etaMinutes) : "ETA pending"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Location info */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="location-info">
          <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
            <MapPin className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium">Delivery Destination</p>
              <p className="text-xs text-muted-foreground">{deliveryLocation.address}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {deliveryLocation.latitude.toFixed(6)}, {deliveryLocation.longitude.toFixed(6)}
              </p>
            </div>
          </div>

          {riderLocation && (
            <div className="flex items-start gap-3 p-3 bg-green-500/10 rounded-lg">
              <Navigation className="h-5 w-5 text-green-600 dark:text-green-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Rider Location</p>
                <p className="text-xs text-muted-foreground">
                  {distanceKm !== null ? `${distanceKm.toFixed(2)} km away` : "Distance pending"} • {etaMinutes !== null ? `ETA: ${formatETA(etaMinutes)}` : "ETA pending"}
                </p>
                {riderLocation.timestamp && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Last updated: {new Date(riderLocation.timestamp).toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
          )}

          {!riderLocation && (
            <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
              <Navigation className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rider Location</p>
                <p className="text-xs text-muted-foreground">Waiting for rider to start tracking...</p>
              </div>
            </div>
          )}
        </div>

        {/* Rider Info Card for standard view */}
        {riderInfo && animatedRiderPos && (
          <div className="mt-4 p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border border-primary/20">
            <div className="flex items-center gap-3">
              <UserAvatar 
                profileImage={riderInfo.profileImage}
                name={riderInfo.name || 'Rider'}
                size="md"
                className="h-12 w-12 border-2 border-primary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-semibold">{riderInfo.name || 'Your Rider'}</h4>
                  {riderInfo.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                      <span className="text-xs font-medium">{riderInfo.rating.toFixed(1)}</span>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Car className="h-3 w-3" />
                  {riderInfo.vehicleType || 'Motorcycle'}
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
