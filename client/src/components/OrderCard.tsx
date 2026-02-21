import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, MapPin, Calendar } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

interface OrderCardProps {
  orderId: string;
  customerName: string;
  items: number;
  total: number;
  currency?: string;
  status: string; // Allow any status string
  deliveryMethod: string; // Allow any delivery method string
  date: string;
  onViewDetails?: (orderId: string) => void;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
  searching_rider: { label: "Searching Rider", className: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400" },
  processing: { label: "Processing", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  en_route: { label: "Out for Delivery", className: "bg-purple-500/10 text-purple-700 dark:text-purple-400" },
  delivered: { label: "Delivered", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-green-500/10 text-green-700 dark:text-green-400" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
  disputed: { label: "Disputed", className: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

const normalizeStatus = (status?: string) => {
  const s = (status || "").toLowerCase().trim();
  if (s === "delivering" || s === "out_for_delivery") return "en_route";
  return s;
};

// Default status for unknown values
const defaultStatus = { label: "Unknown", className: "bg-gray-500/10 text-gray-700 dark:text-gray-400" };

const deliveryConfig: Record<string, { label: string; icon: typeof Package }> = {
  pickup: { label: "Pickup", icon: Package },
  bus: { label: "Bus", icon: Package },
  rider: { label: "Rider", icon: MapPin },
};

// Default delivery for unknown values
const defaultDelivery = { label: "Delivery", icon: Package };

export default function OrderCard({
  orderId,
  customerName,
  items,
  total,
  currency = "GHS",
  status,
  deliveryMethod,
  date,
  onViewDetails,
}: OrderCardProps) {
  const { formatPrice } = useLanguage();
  const statusInfo = statusConfig[normalizeStatus(status)] || defaultStatus;
  const deliveryInfo = deliveryConfig[deliveryMethod] || defaultDelivery;
  const DeliveryIcon = deliveryInfo.icon;

  return (
    <Card className="hover-elevate transition-all">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-sm font-medium" data-testid={`text-order-id-${orderId}`}>
              Order #{orderId}
            </p>
            <p className="text-sm text-muted-foreground">{customerName}</p>
          </div>
          <Badge className={statusInfo.className} data-testid={`badge-status-${orderId}`}>
            {statusInfo.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>{items} items</span>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <DeliveryIcon className="h-4 w-4" />
            <span>{deliveryInfo.label}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{date}</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t">
          <div>
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold" data-testid={`text-total-${orderId}`}>
              {formatPrice(total)}
            </p>
          </div>
          <Button 
            variant="outline"
            onClick={() => onViewDetails?.(orderId)}
            data-testid={`button-view-${orderId}`}
          >
            View Details
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
