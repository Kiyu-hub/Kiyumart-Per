import { useState } from "react";
import { useLocation } from "wouter";
import { useHaptic } from "@/hooks/useHaptic";
import { cn } from "@/lib/utils";
import { MobilePageHeader } from "@/components/mobile/MobilePageHeader";
import { MobileOrderCardSkeleton } from "@/components/mobile/MobileSkeletonCard";
import { SwipeableRow } from "@/components/mobile/SwipeableRow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Package, MapPin, RotateCcw, Trash2, ChevronRight,
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

function getStatusConfig(status: string): { color: string; bg: string; text: string; dot: string } {
  if (["pending", "created"].includes(status))
    return { color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500" };
  if (["processing", "packaged", "ready"].includes(status))
    return { color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/20", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" };
  if (["searching_rider", "assigned", "rider_arrived", "picked_up", "in_transit", "en_route"].includes(status))
    return { color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-900/20", text: "text-violet-700 dark:text-violet-300", dot: "bg-violet-500" };
  if (["delivered", "completed"].includes(status))
    return { color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" };
  if (["cancelled"].includes(status))
    return { color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/20", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" };
  if (["external_dispatch_arranged"].includes(status))
    return { color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-900/20", text: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-500" };
  return { color: "text-muted-foreground", bg: "bg-muted/30", text: "text-muted-foreground", dot: "bg-muted-foreground" };
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
    external_dispatch_arranged: externalType === "VIP Bus" ? "VIP Bus" : "3rd-Party",
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
  const cfg = getStatusConfig(order.status);

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
        className="w-full text-left bg-card p-4 touch-ripple"
      >
        <div className="flex items-start gap-3">
          {/* Product thumbnails stack */}
          <div className="relative shrink-0 w-[68px] h-[68px]">
            {firstThreeImages.slice(0, 2).map((item, i) => (
              <div
                key={i}
                className={cn(
                  "absolute rounded-2xl overflow-hidden bg-muted border border-border/30",
                  i === 0 ? "w-[56px] h-[56px] top-2 left-2 z-10" : "w-[52px] h-[52px] top-0 left-0 z-0 opacity-60",
                )}
              >
                {item.image ? (
                  <img src={item.image} alt={item.productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            ))}
            {firstThreeImages.length === 1 && (
              <div className="absolute w-[64px] h-[64px] top-0.5 left-0.5 rounded-2xl overflow-hidden bg-muted border border-border/30 z-10">
                {firstThreeImages[0].image ? (
                  <img src={firstThreeImages[0].image} alt={firstThreeImages[0].productName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Package className="w-7 h-7 text-muted-foreground/40" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-1">
              <div>
                <p className="text-[13px] font-bold text-foreground">
                  #{order.orderNumber || order.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className={cn(
                "flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full border-0",
                cfg.bg, cfg.text,
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", cfg.dot)} />
                {getStatusLabel(order.status, order.externalDeliveryType)}
              </span>
            </div>

            <p className="text-[14px] text-foreground font-medium line-clamp-1 mt-1">
              {order.items[0]?.productName}
              {order.items.length > 1 && (
                <span className="text-muted-foreground"> +{order.items.length - 1} more</span>
              )}
            </p>

            <div className="flex items-center justify-between mt-2.5">
              <p className="text-[16px] font-black text-primary">
                GHS {parseFloat(order.totalAmount).toFixed(2)}
              </p>
              {active ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-[12px] rounded-xl border-primary/30 text-primary hover:bg-primary/5 font-semibold px-3"
                  onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}/tracking`); }}
                >
                  <MapPin className="w-3 h-3 mr-1" /> Track
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-[12px] rounded-xl text-muted-foreground px-2 font-medium"
                  onClick={(e) => { e.stopPropagation(); navigate(`/orders/${order.id}`); }}
                >
                  <RotateCcw className="w-3 h-3 mr-1" /> Receipt
                </Button>
              )}
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
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
      <div className="mobile-pill-scroll px-4 py-3 border-b border-border/20 sticky top-[53px] z-20 bg-background/95 backdrop-blur-md gap-2">
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
                "shrink-0 px-4 py-2 rounded-2xl text-[13px] font-semibold transition-all touch-ripple flex items-center gap-1.5",
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-sm shadow-primary/20"
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
            <div className="w-24 h-24 rounded-3xl bg-primary/5 border-2 border-dashed border-primary/20 flex items-center justify-center mb-5">
              <Package className="w-10 h-10 text-primary/30" />
            </div>
            <p className="text-[20px] font-bold text-foreground mb-2">No orders yet</p>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              {activeTab === "all"
                ? "Your orders will appear here once you shop."
                : `No ${activeTab} orders found.`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border/20">
            {filteredOrders.map((order) => (
              <OrderCard key={order.id} order={order} onDelete={onDeleteOrder} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
