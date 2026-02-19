import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Clock, Package, Truck, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

interface OrderStatusBadgeProps {
  status: string;
  className?: string;
}

const normalizeStatus = (status?: string) => {
  const s = (status || "").toLowerCase().trim();
  if (s === "ready" || s === "confirmed") return "processing";
  if (s === "assigned" || s === "picked_up" || s === "en_route") return "delivering";
  return s || "pending";
};

const statusConfig = {
  pending: {
    label: "Pending",
    icon: Clock,
    variant: "secondary" as const,
    className: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  processing: {
    label: "Processing",
    icon: Package,
    variant: "secondary" as const,
    className: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  },
  delivering: {
    label: "Delivering",
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
};

export default function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const normalizedStatus = normalizeStatus(status);
  const config = statusConfig[normalizedStatus as keyof typeof statusConfig] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <Badge
      variant={config.variant}
      className={cn("gap-1.5 px-3 py-1", config.className, className)}
      data-testid={`badge-${normalizedStatus}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{config.label}</span>
    </Badge>
  );
}
