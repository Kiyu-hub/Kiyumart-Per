import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, Package, Truck, CheckCircle2, XCircle, AlertTriangle, MapPin } from "lucide-react";

interface OrderStatusBadgeProps {
  status: string;
  deliveryMethod?: string;
  className?: string;
}

const normalizeStatus = (status?: string) => {
  const s = (status || "").toLowerCase().trim();
  if (s === "created") return "pending";
  if (s === "ready" || s === "confirmed") return "processing";
  if (s === "searching_rider" || s === "assigned" || s === "rider_arrived") return "processing";
  if (s === "picked_up" || s === "in_transit" || s === "en_route") return "en_route";
  if (s === "completed") return "completed";
  return s || "pending";
};

const normalizeForPickup = (status?: string) => {
  const s = normalizeStatus(status);
  if (["pending"].includes(s)) return "pending";
  if (["searching_rider", "confirmed", "ready", "processing", "assigned", "rider_arrived"].includes(s)) {
    return s === "ready" ? "ready_for_pickup" : "processing";
  }
  if (["picked_up", "in_transit", "en_route"].includes(s)) return "ready_for_pickup";
  if (s === "completed") return "delivered";
  return s;
};

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    variant: "secondary" as const,
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  processing: {
    label: "Preparing Delivery",
    icon: Package,
    variant: "secondary" as const,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  en_route: {
    label: "On the Way",
    icon: Truck,
    variant: "secondary" as const,
    className: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300",
  },
  delivered: {
    label: "Delivered",
    icon: CheckCircle2,
    variant: "secondary" as const,
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    variant: "secondary" as const,
    className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  },
  cancelled: {
    label: "Cancelled",
    icon: XCircle,
    variant: "destructive" as const,
    className: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300",
  },
  disputed: {
    label: "Disputed",
    icon: AlertTriangle,
    variant: "secondary" as const,
    className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
  },
  ready_for_pickup: {
    label: "Ready for Pickup",
    icon: MapPin,
    variant: "secondary" as const,
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300",
  },
};

export default function OrderStatusBadge({ status, deliveryMethod, className }: OrderStatusBadgeProps) {
  const isPickup = (deliveryMethod || "").toLowerCase().trim() === "pickup";
  const normalizedStatus = isPickup ? normalizeForPickup(status) : normalizeStatus(status);
  const config = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;

  const label =
    isPickup && normalizedStatus === "processing"
      ? "Preparing Order"
      : config.label;

  return (
    <Badge
      variant={config.variant}
      className={cn("gap-1.5 px-3 py-1", config.className, className)}
      data-testid={`badge-${normalizedStatus}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{label}</span>
    </Badge>
  );
}
