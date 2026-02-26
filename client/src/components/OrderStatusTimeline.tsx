import { Check, Clock, Package, Truck, CheckCircle2, XCircle, AlertTriangle, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrderStatusTimelineProps {
  currentStatus: string;
  deliveryMethod?: string;
  createdAt?: string;
  updatedAt?: string;
  deliveredAt?: string;
  className?: string;
}

const normalizeStatus = (status?: string) => {
  const s = (status || "").toLowerCase().trim();
  if (s === "created") return "pending";
  if (s === "ready_for_pickup") return "ready";
  if (s === "assigned_to_rider") return "assigned";
  if (s === "out_for_delivery" || s === "delivering") return "en_route";
  return s || "pending";
};

const toCustomerTimelineStatus = (status?: string, deliveryMethod?: string) => {
  const s = normalizeStatus(status);
  const isPickup = (deliveryMethod || "").toLowerCase().trim() === "pickup";
  if (s === "cancelled" || s === "disputed") return s;
  if (["pending"].includes(s)) return "pending";
  if (isPickup) {
    if (["searching_rider", "confirmed", "ready", "processing", "assigned", "rider_arrived"].includes(s)) return s === "ready" ? "ready_for_pickup" : "processing";
    if (["picked_up", "in_transit", "en_route"].includes(s)) return "ready_for_pickup";
    if (["delivered", "completed"].includes(s)) return "delivered";
    return "pending";
  }
  if (["searching_rider", "confirmed", "ready", "processing", "assigned", "rider_arrived"].includes(s)) return "processing";
  if (["picked_up", "in_transit", "en_route"].includes(s)) return "en_route";
  if (["delivered", "completed"].includes(s)) return "delivered";
  return "pending";
};

const deliveryStatusSteps = [
  { key: "pending", label: "Order Placed", icon: Clock },
  { key: "processing", label: "Preparing Delivery", icon: Package },
  { key: "en_route", label: "On the Way", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

const pickupStatusSteps = [
  { key: "pending", label: "Order Placed", icon: Clock },
  { key: "processing", label: "Preparing Order", icon: Package },
  { key: "ready_for_pickup", label: "Ready for Pickup", icon: MapPin },
  { key: "delivered", label: "Completed", icon: CheckCircle2 },
];

const deliveryStatusOrder = ["pending", "processing", "en_route", "delivered"];
const pickupStatusOrder = ["pending", "processing", "ready_for_pickup", "delivered"];

export default function OrderStatusTimeline({ 
  currentStatus, 
  deliveryMethod,
  createdAt, 
  updatedAt,
  deliveredAt,
  className 
}: OrderStatusTimelineProps) {
  const isPickup = (deliveryMethod || "").toLowerCase().trim() === "pickup";
  const normalizedStatus = toCustomerTimelineStatus(currentStatus, deliveryMethod);
  const statusSteps = isPickup ? pickupStatusSteps : deliveryStatusSteps;
  const statusOrder = isPickup ? pickupStatusOrder : deliveryStatusOrder;
  // Handle cancelled and disputed separately
  const isCancelled = normalizedStatus === "cancelled";
  const isDisputed = normalizedStatus === "disputed";
  const currentIndex = statusOrder.indexOf(normalizedStatus);

  if (isCancelled) {
    return (
      <div className={cn("flex items-center gap-3 p-4 bg-destructive/10 rounded-lg border border-destructive/20", className)} data-testid="timeline-cancelled">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
          <XCircle className="h-5 w-5 text-destructive" />
        </div>
        <div>
          <p className="font-semibold text-destructive">Order Cancelled</p>
          <p className="text-sm text-muted-foreground">This order has been cancelled</p>
        </div>
      </div>
    );
  }

  if (isDisputed) {
    return (
      <div className={cn("flex items-center gap-3 p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20", className)} data-testid="timeline-disputed">
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-500" />
        </div>
        <div>
          <p className="font-semibold text-yellow-700 dark:text-yellow-500">Order Disputed</p>
          <p className="text-sm text-muted-foreground">This order is under review</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("py-4", className)} data-testid="timeline-normal">
      <div className="flex items-center justify-between">
        {statusSteps.map((step, index) => {
          const isCompleted = index <= currentIndex;
          const isCurrent = index === currentIndex;
          const Icon = step.icon;
          const isLast = index === statusSteps.length - 1;

          return (
            <div key={step.key} className="flex items-center flex-1" data-testid={`timeline-step-${step.key}`}>
              <div className="flex flex-col items-center relative">
                {/* Icon Circle */}
                <div
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                    isCompleted
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                  data-testid={`icon-${step.key}`}
                >
                  {isCompleted && !isCurrent ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <Icon className="h-5 w-5" />
                  )}
                </div>

                {/* Label */}
                <div className="mt-2 text-center">
                  <p
                    className={cn(
                      "text-xs font-medium",
                      isCompleted ? "text-foreground" : "text-muted-foreground"
                    )}
                    data-testid={`label-${step.key}`}
                  >
                    {step.label}
                  </p>
                  {isCurrent && (
                    <p className="text-xs text-primary mt-1" data-testid={`status-current-${step.key}`}>
                      Current
                    </p>
                  )}
                </div>
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div
                  className={cn(
                    "flex-1 h-0.5 mx-2 transition-all",
                    isCompleted ? "bg-primary" : "bg-muted"
                  )}
                  data-testid={`line-${step.key}`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Timestamp Information */}
      {normalizedStatus === "delivered" && deliveredAt && (
        <div className="mt-4 text-center" data-testid="delivery-timestamp">
          <p className="text-sm text-muted-foreground">
            Delivered on {new Date(deliveredAt).toLocaleDateString()} at{" "}
            {new Date(deliveredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      )}
    </div>
  );
}
