import type { Socket } from "socket.io-client";
import type { RealityGpsUpdate, TrackingProvider } from "@/tracking/interfaces";

type SocketPayload = {
  riderId?: string;
  orderId?: string;
  latitude: string | number;
  longitude: string | number;
  speed?: string | number | null;
  heading?: string | number | null;
  timestamp?: string;
};

export class SocketTrackingProvider implements TrackingProvider {
  private socket: Socket;
  private eventName: string;
  private handler?: (payload: SocketPayload) => void;

  constructor(socket: Socket, eventName = "rider_location_updated") {
    this.socket = socket;
    this.eventName = eventName;
  }

  start(onGps: (update: RealityGpsUpdate) => void): void {
    this.handler = (payload) => {
      const lat = Number(payload.latitude);
      const lng = Number(payload.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const vehicleId = String(payload.riderId || payload.orderId || "unknown");
      onGps({
        vehicleId,
        orderId: payload.orderId,
        position: { lat, lng },
        speedMps: Number(payload.speed ?? 0),
        bearingDeg: Number(payload.heading ?? 0),
        timestampMs: payload.timestamp ? new Date(payload.timestamp).getTime() : Date.now(),
      });
    };
    this.socket.on(this.eventName, this.handler);
  }

  stop(): void {
    if (!this.handler) return;
    this.socket.off(this.eventName, this.handler);
    this.handler = undefined;
  }
}

