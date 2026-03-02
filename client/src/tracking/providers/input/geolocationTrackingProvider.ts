import type { RealityGpsUpdate, TrackingProvider } from "@/tracking/interfaces";

export class GeolocationTrackingProvider implements TrackingProvider {
  private vehicleId: string;
  private orderId?: string;
  private watchId: number | null = null;

  constructor(vehicleId: string, orderId?: string) {
    this.vehicleId = vehicleId;
    this.orderId = orderId;
  }

  start(onGps: (update: RealityGpsUpdate) => void): void {
    if (!navigator.geolocation) return;
    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        onGps({
          vehicleId: this.vehicleId,
          orderId: this.orderId,
          position: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
          speedMps: position.coords.speed,
          bearingDeg: position.coords.heading,
          accuracyM: position.coords.accuracy,
          timestampMs: position.timestamp,
        });
      },
      () => {
        // Ignore browser geolocation errors; caller handles fallback.
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 12000,
      },
    );
  }

  stop(): void {
    if (this.watchId == null || !navigator.geolocation) return;
    navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }
}

