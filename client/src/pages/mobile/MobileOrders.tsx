import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileOrderCardSkeleton } from "@/components/mobile/MobileSkeletonCard";
import { SwipeableRow } from "@/components/mobile/SwipeableRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package, MapPin, RotateCcw, Trash2, ChevronRight,
  Clock, CheckCircle, XCircle, Truck, CreditCard,
} from "lucide-react";

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  price: string;
  image?: string | null;
  selectedColor?: string | null;
  selectedSize?: string | null;
}

interface Order {
  id: string;
  orderNumber?: string;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  createdAt: string;
  items: OrderItem[];
  externalDeliveryType?: string | null;
}

type FilterTab = "all" | "active" | "completed" | "cancelled";

function getStatusColor(status: string): string {
  if (["pending", "created"].includes(status)) return "bg-amber-500";
  if (["processing", "packaged", "ready"].includes(status)) return "bg-blue-500";
  if (["searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes(status)) return "bg-violet-500";
  if (["delivered", "completed"].includes(status)) return "bg-emerald-500";
  if (["cancelled"].includes(status)) return "bg-destructive";
  if (["external_dispatch_arranged"].includes(status)) return "bg-cyan-500";
  return "bg-muted-foreground";
}

function getStatusLabel(status: string, externalType?: string | null): string {
  const labels: Record<string, string> = {
    pending: "Pending",
    created: "Pending",
    processing: "Processing",
    packaged: "Packaged",
    ready: "Ready",
    searching_rider: "Finding Rider",
    assigned: "Rider Assigned",
    rider_arrived: "Rider Arrived",
    picked_up: "Picked Up",
    in_transit: "In Transit",
    en_route: "En Route",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
    external_dispatch_arranged: externalType === "VIP Bus" ? "VIP Bus" : "3rd-Party Delivery",
  };
  return labels[status] || status;
}

function isActiveStatus(status: string): boolean {
  return !["delivered", "completed", "cancelled"].includes(status);
}

interface MobileOrdersProps {
  orders: Order[];
  isLoading: boolean;
  onDeleteOrder: (id: string) => void;
}

function OrderCard({ order, onDelete }: { order: Order; onDelete: (id: string) => void }) {
  const [, navigate] = useLocation();
  const { trigger: haptic } = useHaptic();
  const active = isActiveStatus(order.status);
  const colorClass = getStatusColor(order.status);

  const firstThreeImages = order.items.slice(0, 3);
  const overflowCount = order.items.length - 3;

  return (
    <SwipeableRow
      rightAction={!active ? {
        label: "Delete",
        icon: <Trash2 className="w-5 h-5" />,
        color: "destructive",
        onPress: () => onDelete(order.id),
      } : undefined}
      leftAction={active ? {
        label: "Track",
        icon: <MapPin className="w-5 h-5" />,
        color: "primary",
        onPress: () => navigate(`/orders/${order.id}/tracking`),
      } : undefined}
    >
      <button
        onClick={() => { haptic("light"); navigate(`/orders/${order.id}`); }}
        className="w-full text-left bg-card p-4 touch-ripple relative"
      >
        {/* Left status color bar */}
        <span className={cn("status-bar-left", colorClass)} />

        <div className="pl-2">
          {/* Top row */}
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <p className="mobile-caption text-muted-foreground">
                {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <p className="text-[13px] font-semibold text-foreground mt-0.5">
                #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
              </p>
            </div>
            <Badge
              variant="secondary"
              className={cn(
                "text-[11px] font-semibold px-2 py-0.5 rounded-full border-0",
                order.status === "completed" || order.status === "delivered"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                  : order.status === "cancelled"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-primary/10 text-primary",
              )}
            >
              {getStatusLabel(order.status, order.externalDeliveryType)}
            </Badge>
          </div>

          {/* Product thumbnails */}
          <div className="flex items-center gap-2 mb-3">
            {firstThreeImages.map((item, i) => (
              <div key={i} className="w-12 h-12 rounded-xl overflow-hidden bg-muted border border-border/30 shrink-0">
                {item.image ? (
                  <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}
              </div>
            ))}
            {overflowCount > 0 && (
              <div className="w-12 h-12 rounded-xl bg-muted border border-border/30 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-muted-foreground">+{overflowCount}</span>
              </div>
            )}
            <div className="flex-1 ml-1">
              <p className="text-sm text-foreground font-medium line-clamp-1">
                {order.items[0]?.productName}
                {order.items.length > 1 && ` +${order.items.length - 1} more`}
              </p>
              <p className="text-[13px] font-bold text-primary mt-0.5">
                GHS {parseFloat(order.totalAmount).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {active ? (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs rounded-xl flex-1 border-primary/30 text-primary hover:bg-primary/5"
                onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}/tracking`); }}
              >
                <MapPin className="w-3 h-3 mr-1" /> Track Order
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs rounded-xl flex-1 border-border/40"
                onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}
              >
                <RotateCcw className="w-3 h-3 mr-1" /> View Receipt
              </Button>
            )}
            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        </div>
      </button>
    </SwipeableRow>
  );
}

export function MobileOrders({ orders, isLoading, onDeleteOrder }: MobileOrdersProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const filteredOrders = orders.filter((o) => {
    if (activeTab === "all") return true;
    if (activeTab === "active") return isActiveStatus(o.status);
    if (activeTab === "completed") return ["delivered", "completed"].includes(o.status);
    if (activeTab === "cancelled") return o.status === "cancelled";
    return true;
  });

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "active", label: "Active" },
    { id: "completed", label: "Completed" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background mobile-page-enter">
      <MobilePageHeader title="My Orders" showBack={false} />

      {/* Filter tabs */}
      <div className="mobile-pill-scroll px-4 py-3 border-b border-border/30 sticky top-[53px] z-20 bg-background/95 backdrop-blur-sm">
        {tabs.map((tab) => {
          const count = tab.id === "all"
            ? orders.length
            : orders.filter((o) => {
                if (tab.id === "active") return isActiveStatus(o.status);
                if (tab.id === "completed") return ["delivered", "completed"].includes(o.status);
                if (tab.id === "cancelled") return o.status === "cancelled";
                return true;
              }).length;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all touch-ripple flex items-center gap-1.5",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground",
              )}
            >
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-muted-foreground/20 text-muted-foreground",
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <MobileOrderCardSkeleton key={i} />)}
          </div>
        ) : filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-muted/40 flex items-center justify-center mb-4">
              <Package className="w-9 h-9 text-muted-foreground/60" />
            </div>
            <p className="mobile-title-3 text-foreground mb-2">No orders yet</p>
            <p className="mobile-subhead text-muted-foreground">
              {activeTab === "all" ? "Your orders will appear here once you shop." : `No ${activeTab} orders.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/30">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} onDelete={onDeleteOrder} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
