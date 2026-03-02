import type { NotificationService } from "@/tracking/interfaces";

type TrackingNotificationEvent = {
  title: string;
  message: string;
  severity: "info" | "warning" | "critical";
};

const listeners = new Set<(event: TrackingNotificationEvent) => void>();

class EventTrackingNotificationService implements NotificationService {
  notifyReportRequested(payload: { requestedBy: string; reportType: string; relatedId?: string }): void {
    this.emit({
      title: "Report Request",
      message: `${payload.requestedBy} requested ${payload.reportType}${payload.relatedId ? ` (${payload.relatedId})` : ""}`,
      severity: "info",
    });
  }

  notifyTripFlagged(payload: { orderId: string; vehicleId: string; reason: string }): void {
    this.emit({
      title: "Trip Flagged",
      message: `Order ${payload.orderId} (${payload.vehicleId}) flagged: ${payload.reason}`,
      severity: "warning",
    });
  }

  notifyAnomaly(payload: { vehicleId: string; message: string; orderId?: string }): void {
    this.emit({
      title: "Tracking Anomaly",
      message: `${payload.vehicleId}${payload.orderId ? ` / ${payload.orderId}` : ""}: ${payload.message}`,
      severity: "critical",
    });
  }

  private emit(event: TrackingNotificationEvent) {
    listeners.forEach((listener) => listener(event));
  }
}

export const trackingNotificationService: NotificationService = new EventTrackingNotificationService();

export function subscribeTrackingNotifications(listener: (event: TrackingNotificationEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
