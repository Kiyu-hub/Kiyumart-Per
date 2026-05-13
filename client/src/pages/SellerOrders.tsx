import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Eye, Package, ShoppingBag, Store, Clock3, Truck, CheckCircle2, CalendarDays, DollarSign } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { io, Socket } from "socket.io-client";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  total: string;
  status: string;
  deliveryMethod?: string;
  externalDeliveryType?: string | null;
  externalDeliveryByBus?: boolean | null;
  riderId?: string | null;
  paymentStatus: string;
  subtotal?: string | number | null;
  deliveryFee?: string | number | null;
  couponDiscount?: string | number | null;
  processingFee?: string | number | null;
  createdAt: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
  buyer?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  items?: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price?: string;
    selectedColor?: string | null;
    selectedSize?: string | null;
    image?: string | null;
  }>;
  customerInfo?: {
    name?: string;
    email?: string;
    phone?: string;
    address?: string | null;
  };
  seller?: {
    id?: string | null;
    name?: string | null;
    storeName?: string | null;
  };
  pickupStationInfo?: {
    id?: string | null;
    name?: string | null;
    address?: string | null;
    area?: string | null;
    city?: string | null;
    region?: string | null;
    locationLabel?: string | null;
    pickupAgentName?: string | null;
    pickupAgentPhone?: string | null;
  } | null;
  riderInfo?: {
    id: string;
    name: string | null;
    phone: string | null;
    vehicleType: string | null;
    vehiclePlateNumber: string | null;
    rating: string | number | null;
  } | null;
}

interface SellerAnalytics {
  totalRevenue?: number;
  sellerSettlementTotal?: number | string;
  completedRevenue?: number;
  totalOrders?: number;
}

type OrderContext = "seller" | "buyer";
type SellerOrderFlowFilter =
  | "all"
  | "action_required"
  | "pending_fulfillment"
  | "completed"
  | "cancelled";


export default function SellerOrders() {
  const { user } = useAuth();
  const { formatPrice, t } = useLanguage();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const pathname = useMemo(() => location.split("?")[0] || "", [location]);
  const businessOrderPathMatch = useMemo(() => pathname.match(/^\/seller\/orders\/([^/?#]+)/), [pathname]);
  const personalOrderPathMatch = useMemo(() => pathname.match(/^\/seller\/personal-orders\/([^/?#]+)/), [pathname]);
  const orderIdFromPath = businessOrderPathMatch?.[1]
    ? decodeURIComponent(businessOrderPathMatch[1])
    : personalOrderPathMatch?.[1]
      ? decodeURIComponent(personalOrderPathMatch[1])
      : "";
  const pathOrderContext: OrderContext = pathname.startsWith("/seller/personal-orders") ? "buyer" : "seller";
  const urlParams = useMemo(() => new URLSearchParams(location.split("?")[1] || ""), [location]);
  const orderIdFromUrl = orderIdFromPath || urlParams.get("orderId");
  const orderNumberFromUrl = (urlParams.get("orderNumber") || "").trim();
  const contextFromUrl = urlParams.get("context");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderFlowFilter, setOrderFlowFilter] = useState<SellerOrderFlowFilter>("all");
  const [orderContext, setOrderContext] = useState<OrderContext>(
    contextFromUrl === "buyer" ? "buyer" : pathOrderContext,
  );
  const highlightedOrderRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;
  const [packagedItemChecks, setPackagedItemChecks] = useState<Record<string, boolean>>({});

  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const formatItemSelection = (item?: { selectedColor?: string | null; selectedSize?: string | null }) => {
    const parts = [
      item?.selectedColor ? `Color: ${item.selectedColor}` : null,
      item?.selectedSize ? `Size: ${item.selectedSize}` : null,
    ].filter(Boolean);
    return parts.join(" • ");
  };
  const extractApiErrorMessage = (error: any) => {
    const raw = String(error?.message || "Could not update order status");
    const trimmed = raw.replace(/^\d+:\s*/, "");
    const jsonStart = trimmed.indexOf("{");
    if (jsonStart >= 0) {
      const jsonCandidate = trimmed.slice(jsonStart);
      try {
        const parsed = JSON.parse(jsonCandidate);
        if (typeof parsed?.error === "string" && parsed.error.trim()) {
          return parsed.error;
        }
      } catch {
        // ignore parse errors and return trimmed fallback
      }
    }
    return trimmed;
  };
  const normalizePaymentStatus = (value?: string) => {
    const s = normalize(value);
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid") return "paid";
    return s || "pending";
  };
  const normalizeExternalOrderStatus = (value?: string) => {
    const status = String(value || "").toLowerCase().trim();
    if (status === "searching_rider" || status === "assigned") {
      return "external_dispatch_arranged";
    }
    if (status === "rider_arrived" || status === "delivered") {
      return "completed";
    }
    if (status === "external_dispatch_arranged") {
      return "external_dispatch_arranged";
    }
    if (["picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      return "en_route";
    }
    return status;
  };
  const getExternalDeliveryTypeLabel = (orderLike?: { externalDeliveryType?: string | null; externalDeliveryByBus?: boolean | null }) => {
    const normalizedType = String(orderLike?.externalDeliveryType || "").toLowerCase().trim();
    if (normalizedType === "bus" || orderLike?.externalDeliveryByBus) {
      return "VIP Bus Delivery";
    }
    if (normalizedType === "third_party") {
      return "Third-Party Delivery";
    }
    return "Third-Party Delivery";
  };
  const isPickupMethod = (value?: string) => {
    const method = normalize(value);
    return method === "pickup" || method === "store_pickup" || method === "store pickup";
  };
  const isPaidSellerOrder = (order?: Order) => normalizePaymentStatus(order?.paymentStatus) === "paid";
  const isCompletedSellerOrder = (order?: Order) => {
    const status = normalize(order?.status);
    return status === "completed" || status === "delivered" || (!showInternalRiderFeatures && status === "rider_arrived");
  };
  const isClosedSellerOrder = (order?: Order) => {
    const status = normalize(order?.status);
    return ["completed", "delivered", "cancelled", "failed", "refunded"].includes(status);
  };
  const getSellerFulfillmentMode = (order?: Order) => (isPickupMethod(order?.deliveryMethod) ? "pickup" : "delivery");
  const isPendingFulfillmentSellerOrder = (order?: Order) =>
    isPaidSellerOrder(order) && !isClosedSellerOrder(order);
  const getDisplayDeliveryMethod = (order: Order) => {
    if (isPickupMethod(order.deliveryMethod)) return "Pickup";
    if (!showInternalRiderFeatures) return getExternalDeliveryTypeLabel(order);
    const method = normalize(order.deliveryMethod);
    if (method === "bus") return "Bus Delivery";
    if (method === "rider") return "Rider Delivery";
    return order.deliveryMethod || "Delivery";
  };
  const getDisplayStatus = (order: Order) => {
    const normalized = showInternalRiderFeatures ? normalize(order.status) : normalizeExternalOrderStatus(order.status);
    if (isPickupMethod(order.deliveryMethod)) {
      if (normalized === "packaged") return "Packaged";
      if (normalized === "ready") return "Ready for Pickup";
      if (["delivered", "completed"].includes(normalized)) return "Completed";
    }
    return normalized.replace(/_/g, " ");
  };
  const getSellerActionState = (order: Order) => {
    const status = normalize(order.status);
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const pickupFlow = isPickupMethod(order.deliveryMethod);
    const externalDeliveryFlow = !showInternalRiderFeatures && !pickupFlow;

    if (externalDeliveryFlow && ["rider_arrived", "delivered", "completed"].includes(status)) {
      return {
        label: "Completed",
        hint: "No further seller action required",
        className: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
      };
    }

    if (paymentStatus !== "paid" && ["pending", "created", "unpaid"].includes(status)) {
      return {
        label: "Awaiting Payment",
        hint: "Seller action not started",
        className: "bg-yellow-100 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200",
      };
    }

    if (["paid", "processing", "preparing", "confirmed"].includes(status)) {
      return {
        label: "Seller Action Required",
        hint: pickupFlow
          ? "Seller must prepare for pickup"
          : externalDeliveryFlow
            ? "Seller must prepare for external delivery handoff"
            : "Seller must prepare for dispatch",
        className: "bg-orange-100 text-orange-900 dark:bg-orange-900/30 dark:text-orange-200",
      };
    }

    if (status === "packaged") {
      return {
        label: "Packaged",
        hint: pickupFlow
          ? "Awaiting pickup station assignment"
          : externalDeliveryFlow
            ? "Order packaged — mark ready to hand off for external delivery"
            : "Order is packaged",
        className: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/30 dark:text-indigo-200",
      };
    }

    if (["ready", "searching_rider", "assigned", "rider_arrived"].includes(status)) {
      return {
        label: pickupFlow ? "Ready for Pickup" : externalDeliveryFlow ? "Awaiting External Dispatch" : "Ready for Dispatch",
        hint: pickupFlow
          ? "Awaiting buyer collection"
          : externalDeliveryFlow
            ? "Admin must arrange the external delivery service"
            : "Awaiting rider/dispatch progression",
        className: "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-200",
      };
    }

    if (status === "external_dispatch_arranged") {
      return {
        label: "External Delivery Arranged",
        hint: "Customer support or admin is coordinating the delivery handoff",
        className: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/30 dark:text-cyan-200",
      };
    }

    if (["picked_up", "in_transit", "en_route", "arrived"].includes(status)) {
      return {
        label: externalDeliveryFlow ? "Delivery In Progress" : "Seller Handoff Complete",
        hint: externalDeliveryFlow ? "Delivery is being coordinated externally" : "No further seller action required",
        className: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
      };
    }

    if (["delivered", "completed"].includes(status)) {
      return {
        label: "Completed",
        hint: "No further seller action required",
        className: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-200",
      };
    }

    if (status === "cancelled") {
      return {
        label: "Order Cancelled",
        hint: "No seller action required",
        className: "bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-200",
      };
    }

    return {
      label: "Seller Status Pending",
      hint: "Review order details",
      className: "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-200",
    };
  };
  const requiresSellerAction = (order?: Order) => {
    if (!order) return false;
    return getSellerActionState(order).label === "Seller Action Required";
  };
  const getSellerOrderFlowFilterValue = (order: Order): SellerOrderFlowFilter => {
    const status = normalize(order.status);
    if (status === "cancelled" || status === "disputed") {
      return "cancelled";
    }
    if (isCompletedSellerOrder(order)) {
      return "completed";
    }
    if (requiresSellerAction(order)) {
      return "action_required";
    }
    if (isPendingFulfillmentSellerOrder(order)) {
      return "pending_fulfillment";
    }
    return "all";
  };

  const { data: orders = [], isLoading, refetch } = useQuery<Order[]>({
    queryKey: ["/api/orders", "seller-orders", user?.id, orderContext],
    queryFn: async () => {
      return fetchApiJson<Order[]>(`/api/orders?context=${orderContext}&includeItems=false`);
    },
    enabled: !!user?.id,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: analytics } = useQuery<SellerAnalytics>({
    queryKey: ["/api/analytics", "seller-orders-summary", user?.id],
    queryFn: async () => fetchApiJson<SellerAnalytics>("/api/analytics"),
    enabled: !!user?.id,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const { data: orderDetails, isLoading: isOrderDetailsLoading } = useQuery<Order>({
    queryKey: ["/api/orders", "seller-order-detail", orderIdFromPath, orderContext],
    queryFn: async () => fetchApiJson<Order>(`/api/orders/${encodeURIComponent(orderIdFromPath)}`),
    enabled: !!user?.id && !!orderIdFromPath,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
    staleTime: 0,
  });

  const updateOrderStatusMutation = useMutation({
    mutationFn: async ({ orderId, status, reason }: { orderId: string; status: string; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${orderId}/status`, { status, reason });
      return res.json();
    },
    onSuccess: (_data, variables) => {
      // Immediately write the new status into both caches so buttons re-evaluate
      // before the background refetch completes. This prevents double-click errors
      // like "Cannot transition from packaged to packaged".
      queryClient.setQueryData<Order>(
        ["/api/orders", "seller-order-detail", variables.orderId, orderContext],
        (old) => (old ? { ...old, status: variables.status as any } : old),
      );
      queryClient.setQueryData<Order[]>(
        ["/api/orders", "seller-orders", user?.id, orderContext],
        (old) => old ? old.map((o) => o.id === variables.orderId ? { ...o, status: variables.status as any } : o) : old,
      );
      toast({ title: "Order updated", description: "Order status was updated successfully." });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey?.[0];
          return typeof key === "string" && key.startsWith("/api/orders");
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Status update failed",
        description: extractApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  // For Third-Party Delivery: chain packaged → ready in one tap
  const markThirdPartyReadyMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const r1 = await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status: "packaged",
        reason: "seller_packaged_for_external_delivery",
      });
      if (!r1.ok) {
        const err = await r1.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || "Could not mark as packaged");
      }
      const r2 = await apiRequest("PATCH", `/api/orders/${orderId}/status`, {
        status: "ready",
        reason: "seller_marked_ready_for_external_delivery",
      });
      if (!r2.ok) {
        const err = await r2.json().catch(() => ({}));
        throw new Error(err?.error || err?.message || "Could not mark as ready");
      }
      return r2.json();
    },
    onSuccess: (_data, orderId) => {
      queryClient.setQueryData<Order>(
        ["/api/orders", "seller-order-detail", orderId, orderContext],
        (old) => (old ? { ...old, status: "ready" as any } : old),
      );
      queryClient.setQueryData<Order[]>(
        ["/api/orders", "seller-orders", user?.id, orderContext],
        (old) => old ? old.map((o) => o.id === orderId ? { ...o, status: "ready" as any } : o) : old,
      );
      toast({ title: "Order updated", description: "Order marked as packaged and ready for Third-Party delivery." });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey?.[0];
          return typeof key === "string" && key.startsWith("/api/orders");
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Status update failed",
        description: extractApiErrorMessage(error),
        variant: "destructive",
      });
    },
  });

  const startRiderMatchingMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const res = await apiRequest("POST", `/api/orders/${orderId}/start-rider-matching`, {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Rider matching started", description: "Dispatch engine is now finding an eligible rider." });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey?.[0];
          return typeof key === "string" && key.startsWith("/api/orders");
        },
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pending-orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
    },
    onError: (error: any) => {
      toast({
        title: "Matching failed",
        description: error?.message || "Could not start rider matching",
        variant: "destructive",
      });
    },
  });

  const referencedOrder =
    orders.find(
      (order) =>
        (orderIdFromUrl && order.id === orderIdFromUrl) ||
        (orderNumberFromUrl && order.orderNumber === orderNumberFromUrl),
    ) ?? null;
  const hasReferencedOrderRequest = Boolean(orderIdFromUrl || orderNumberFromUrl);
  const uniqueOrders = Array.from(new Map(orders.map((o) => [o.id, o])).values());
  const sellerVisibleOrders =
    orderContext === "seller"
      ? uniqueOrders.filter((order) => normalizePaymentStatus(order.paymentStatus) === "paid")
      : uniqueOrders;
  const sellerPendingFulfillmentOrders = sellerVisibleOrders.filter((order) =>
    isPendingFulfillmentSellerOrder(order),
  );
  const sellerCompletedFulfillmentOrders = sellerVisibleOrders.filter((order) =>
    isCompletedSellerOrder(order),
  );
  const sellerActionRequiredOrders = sellerVisibleOrders.filter((order) =>
    getSellerOrderFlowFilterValue(order) === "action_required",
  );
  const sellerOrderFlowTabs = [
    { value: "all" as const, label: "All", count: sellerVisibleOrders.length },
    {
      value: "action_required" as const,
      label: "Orders Requiring Action",
      count: sellerActionRequiredOrders.length,
    },
    {
      value: "pending_fulfillment" as const,
      label: "Pending Fulfillment",
      count: sellerPendingFulfillmentOrders.length,
    },
    {
      value: "completed" as const,
      label: "Completed Fulfillment",
      count: sellerCompletedFulfillmentOrders.length,
    },
    {
      value: "cancelled" as const,
      label: "Cancelled",
      count: sellerVisibleOrders.filter((order) => getSellerOrderFlowFilterValue(order) === "cancelled").length,
    },
  ];

  const isTodayOrder = (order: Order) => {
    const created = new Date(order.createdAt);
    if (Number.isNaN(created.getTime())) return false;
    const now = new Date();
    return created.getFullYear() === now.getFullYear() &&
      created.getMonth() === now.getMonth() &&
      created.getDate() === now.getDate();
  };
  const sellerSummaryCards = [
    {
      key: "total",
      label: "Total Orders",
      value: sellerVisibleOrders.length,
      icon: Package,
    },
    {
      key: "pending_fulfillment",
      label: "Pending Fulfillment",
      value: sellerPendingFulfillmentOrders.length,
      details: [
        `Deliveries: ${sellerPendingFulfillmentOrders.filter((order) => getSellerFulfillmentMode(order) === "delivery").length}`,
        `Pickups: ${sellerPendingFulfillmentOrders.filter((order) => getSellerFulfillmentMode(order) === "pickup").length}`,
      ],
      icon: Truck,
    },
    {
      key: "completed_fulfillment",
      label: "Completed Fulfillment",
      value: sellerCompletedFulfillmentOrders.length,
      details: [
        `Deliveries: ${sellerCompletedFulfillmentOrders.filter((order) => getSellerFulfillmentMode(order) === "delivery").length}`,
        `Pickups: ${sellerCompletedFulfillmentOrders.filter((order) => getSellerFulfillmentMode(order) === "pickup").length}`,
      ],
      icon: CheckCircle2,
    },
    {
      key: "action_required",
      label: "Orders Requiring Action",
      value: sellerActionRequiredOrders.length,
      icon: Clock3,
    },
    {
      key: "today",
      label: "Today",
      value: sellerVisibleOrders.filter(isTodayOrder).length,
      icon: CalendarDays,
    },
    {
      key: "revenue",
      label: "Gross Sales",
      // Gross product revenue (subtotal - couponDiscount) from analytics API.
      // Excludes delivery and processing fees. Net payout = this minus the platform service fee.
      value: formatPrice(Number(analytics?.totalRevenue ?? analytics?.sellerSettlementTotal ?? 0)),
      icon: DollarSign,
    },
  ];

  const filteredOrders = referencedOrder
    ? [referencedOrder]
    : hasReferencedOrderRequest
      ? []
      : sellerVisibleOrders.filter((order) => {
          const matchesSearch = (order.orderNumber || "").toLowerCase().includes(searchQuery.toLowerCase());
          const matchesFlow = (() => {
            if (orderContext !== "seller" || orderFlowFilter === "all") {
              return true;
            }
            if (orderFlowFilter === "pending_fulfillment") {
              return isPendingFulfillmentSellerOrder(order);
            }
            return getSellerOrderFlowFilterValue(order) === orderFlowFilter;
          })();
          return matchesSearch && matchesFlow;
        });

  const focusedOrderId = referencedOrder?.id ?? null;
  const isOrderDetailsMode = Boolean(orderIdFromPath);
  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate(orderContext === "buyer" ? "/seller/personal-orders" : "/seller/orders");
  };
  const handleOrderContextChange = (value: OrderContext) => {
    setOrderContext(value);
    navigate(value === "buyer" ? "/seller/personal-orders" : "/seller/orders");
  };

  useEffect(() => {
    if (contextFromUrl === "seller" || contextFromUrl === "buyer") {
      setOrderContext(contextFromUrl);
      return;
    }
    setOrderContext(pathOrderContext);
  }, [contextFromUrl, pathOrderContext]);

  useEffect(() => {
    setPackagedItemChecks({});
  }, [orderDetails?.id]);

  useEffect(() => {
    setOrderFlowFilter("all");
  }, [orderContext]);

  useEffect(() => {
    if (!orderNumberFromUrl) return;
    setSearchQuery(orderNumberFromUrl);
  }, [orderNumberFromUrl]);

  useEffect(() => {
    if (!focusedOrderId || isLoading || !highlightedOrderRef.current) return;
    highlightedOrderRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focusedOrderId, isLoading, filteredOrders.length]);

  useEffect(() => {
    socketRef.current = io();
    const refreshOrders = () => {
      void refetch();
    };

    socketRef.current.on("order_status_updated", refreshOrders);
    if (!isExternalRiderSystemEnabled) {
      socketRef.current.on("order_rider_assigned", refreshOrders);
    }

    return () => {
      socketRef.current?.off("order_status_updated", refreshOrders);
      if (!isExternalRiderSystemEnabled) {
        socketRef.current?.off("order_rider_assigned", refreshOrders);
      }
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [isExternalRiderSystemEnabled, refetch]);

  const getStatusColor = (status: string) => {
    const normalized = showInternalRiderFeatures
      ? status.toLowerCase()
      : normalizeExternalOrderStatus(status);
    switch (normalized) {
      case "pending": return "bg-yellow-500";
      case "processing": return "bg-blue-500";
      case "en_route": return "bg-purple-500";
      case "external_dispatch_arranged": return "bg-cyan-500";
      case "delivered": return "bg-green-500";
      case "completed": return "bg-green-500";
      case "cancelled": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              {isOrderDetailsMode ? "Order Details" : "Orders"}
            </h1>
            <p className="text-muted-foreground">
              {isOrderDetailsMode
                ? "Review the selected seller order and take the required action."
                : orderContext === "seller" 
                ? "Manage orders from your customers" 
                : "View your personal shopping orders"}
            </p>
          </div>

          {isOrderDetailsMode ? (
            <Button variant="outline" onClick={goBack}>
              <Store className="h-4 w-4 mr-2" />
              Back to Orders
            </Button>
          ) : (
            <Tabs value={orderContext} onValueChange={(value) => handleOrderContextChange(value as OrderContext)}>
              <TabsList data-testid="tabs-order-context">
                <TabsTrigger value="seller" data-testid="tab-business-orders">
                  <Store className="h-4 w-4 mr-2" />
                  Business Orders
                </TabsTrigger>
                <TabsTrigger value="buyer" data-testid="tab-personal-orders">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  Personal Orders
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {!isOrderDetailsMode && (
        <>
        {orderContext === "seller" && (
          <>
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
              {sellerSummaryCards.map((card) => {
                const Icon = card.icon;
                return (
                  <Card key={card.key} className="border-border/70 bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-muted-foreground">{card.label}</p>
                        <p className="mt-2 text-3xl font-semibold tracking-tight">
                          {typeof card.value === "number" ? card.value.toString() : card.value}
                        </p>
                        {"details" in card && Array.isArray(card.details) && card.details.length > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                            {card.details.map((detail) => (
                              <span key={detail}>{detail}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-full border border-border/70 p-2 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search orders by number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search"
            />
          </div>
        </div>
        </>
        )}

        {!isOrderDetailsMode && orderContext === "seller" && (
          <div className="mb-6">
            <Tabs value={orderFlowFilter} onValueChange={(value) => setOrderFlowFilter(value as SellerOrderFlowFilter)}>
              <TabsList className="flex h-auto w-full flex-wrap justify-start gap-3 rounded-none bg-transparent p-0">
                {sellerOrderFlowTabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="min-h-[42px] rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-sm transition-colors data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                  >
                    {tab.label} ({tab.count})
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        )}

        {isOrderDetailsMode ? (
          isOrderDetailsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : orderDetails ? (
            (() => {
              const detailStatus = normalize(orderDetails.status);
              const detailPaymentStatus = normalizePaymentStatus(orderDetails.paymentStatus);
              const detailIsPaid = detailPaymentStatus === "paid";
              const detailDeliveryMethod = normalize(orderDetails.deliveryMethod);
              const detailHasRiderAssigned = Boolean(orderDetails.riderId);
              const detailIsExternalDelivery = isExternalRiderSystemEnabled && detailDeliveryMethod !== "pickup";
              const detailIsThirdParty =
                detailIsExternalDelivery &&
                normalize(String(orderDetails.externalDeliveryType || "")) === "third_party";
              const detailCanStartPackaging =
                orderContext === "seller" &&
                detailIsPaid &&
                ["created", "pending", "confirmed"].includes(detailStatus);
              const detailCanMarkReady =
                orderContext === "seller" &&
                detailIsPaid &&
                detailDeliveryMethod !== "pickup" &&
                (detailIsExternalDelivery
                  ? ["packaged"].includes(detailStatus)
                  : ["processing", "confirmed"].includes(detailStatus));
              const detailCanMarkPackaged =
                orderContext === "seller" &&
                detailIsPaid &&
                (detailDeliveryMethod === "pickup" || detailIsExternalDelivery) &&
                ["processing", "confirmed"].includes(detailStatus);
              const detailCanStartRiderMatching =
                orderContext === "seller" &&
                !isExternalRiderSystemEnabled &&
                detailIsPaid &&
                !detailHasRiderAssigned &&
                ["rider", "bus"].includes(detailDeliveryMethod) &&
                ["ready"].includes(detailStatus);
              const detailItems = orderDetails.items || [];
              const checkedItemsCount = detailItems.reduce((count, _item, index) => {
                return count + (packagedItemChecks[`${orderDetails.id}-${index}`] ? 1 : 0);
              }, 0);
              const allItemsChecked = detailItems.length === 0 || checkedItemsCount === detailItems.length;
              const couponDiscount = Math.max(0, Number(orderDetails.couponDiscount) || 0);
              const subtotal = Math.max(0, Number(orderDetails.subtotal) || 0);
              const deliveryFee = Math.max(0, Number(orderDetails.deliveryFee) || 0);
              const processingFee = Math.max(0, Number(orderDetails.processingFee) || 0);
              const subtotalAfterDiscount = Math.max(0, subtotal - couponDiscount);

              return (
            <Card className="p-6 space-y-6" data-testid={`card-order-detail-${orderDetails.id}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Order Number</p>
                  <h2 className="text-2xl font-bold">#{orderDetails.orderNumber}</h2>
                  <p className="text-sm text-muted-foreground">
                    {new Date(orderDetails.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-primary">
                    {formatPrice(Number(orderDetails.total) || 0)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Badge className={`${getStatusColor(orderDetails.status)} text-white text-xs`}>
                  {getDisplayStatus(orderDetails)}
                </Badge>
                <Badge
                  variant={normalizePaymentStatus(orderDetails.paymentStatus) === "paid" ? "default" : "outline"}
                  className="text-xs"
                >
                  {normalizePaymentStatus(orderDetails.paymentStatus)}
                </Badge>
                <Badge className={`text-xs border-0 ${getSellerActionState(orderDetails).className}`}>
                  {getSellerActionState(orderDetails).label}
                </Badge>
              </div>

              {!!orderDetails.items?.length && (
                <div className="space-y-3">
                  <div>
                    <h3 className="text-base font-semibold">Ordered Items</h3>
                    <p className="text-sm text-muted-foreground">
                      Review the exact items and selected options before packaging.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {orderDetails.items.map((item, index) => (
                      <div
                        key={`${orderDetails.id}-${item.productId}-${index}`}
                        className="rounded-lg border border-border/70 bg-muted/20 p-4"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start gap-3">
                              {orderContext === "seller" && (
                                <Checkbox
                                  checked={!!packagedItemChecks[`${orderDetails.id}-${index}`]}
                                  onCheckedChange={(checked) => {
                                    setPackagedItemChecks((prev) => ({
                                      ...prev,
                                      [`${orderDetails.id}-${index}`]: checked === true,
                                    }));
                                  }}
                                  aria-label={`Mark ${item.productName} packaged`}
                                  className="mt-1"
                                />
                              )}
                              {item.image && (
                                <img
                                  src={item.image}
                                  alt={item.productName}
                                  className="h-14 w-14 rounded-md object-cover shrink-0 border border-border/40"
                                />
                              )}
                              <div className="min-w-0 flex-1 space-y-1">
                                <p className="font-semibold">{item.productName}</p>
                                {!!formatItemSelection(item) && (
                                  <p className="text-sm text-muted-foreground">{formatItemSelection(item)}</p>
                                )}
                                {item.price && (
                                  <p className="text-sm text-muted-foreground">
                                    Unit price: {formatPrice(Number(item.price) || 0)}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Quantity</p>
                            <p className="font-semibold">{item.quantity}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {orderContext === "seller" && detailItems.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/70 bg-muted/10 px-4 py-3">
                      <p className="text-sm text-muted-foreground">
                        Packaged items: <span className="font-medium text-foreground">{checkedItemsCount}/{detailItems.length}</span>
                      </p>
                      {!allItemsChecked && (
                        <p className="text-sm text-muted-foreground">
                          Tick each item once it has been packaged.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1 rounded-lg border border-border/70 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Delivery Method</p>
                  <p className="font-semibold">{getDisplayDeliveryMethod(orderDetails)}</p>
                  {orderDetails.deliveryAddress && (
                    <p className="text-sm text-muted-foreground">
                      Address: {orderDetails.deliveryAddress}
                    </p>
                  )}
                  {orderDetails.pickupStationInfo?.name && (
                    <div className="mt-1 space-y-0.5">
                      <p className="text-sm text-muted-foreground">
                        Pickup station: <span className="font-medium text-foreground">{orderDetails.pickupStationInfo.name}</span>
                        {orderDetails.pickupStationInfo.city ? `, ${orderDetails.pickupStationInfo.city}` : ""}
                      </p>
                      {orderDetails.pickupStationInfo.pickupAgentName && (
                        <p className="text-sm text-muted-foreground">
                          Pickup agent: <span className="font-medium text-foreground">{orderDetails.pickupStationInfo.pickupAgentName}</span>
                        </p>
                      )}
                      {orderDetails.pickupStationInfo.pickupAgentPhone && (
                        <p className="text-sm text-muted-foreground">
                          Agent contact: <a href={`tel:${orderDetails.pickupStationInfo.pickupAgentPhone}`} className="font-medium text-primary underline-offset-2 hover:underline">{orderDetails.pickupStationInfo.pickupAgentPhone}</a>
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div className="space-y-2 rounded-lg border border-border/70 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Seller Responsibility</p>
                  <p className="font-medium">{getSellerActionState(orderDetails).label}</p>
                  <p className="text-sm text-muted-foreground">{getSellerActionState(orderDetails).hint}</p>
                  {orderDetails.seller?.storeName && (
                    <p className="text-sm text-muted-foreground">
                      Responsible store: <span className="font-medium text-foreground">{orderDetails.seller.storeName}</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Searching for rider — neutral animation while platform finds a rider */}
              {showInternalRiderFeatures && detailStatus === "searching_rider" && (
                <div className="rounded-lg border border-border/70 p-4 flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Package className="h-5 w-5 text-primary" />
                    </div>
                    <span className="absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 animate-pulse" />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-sm font-semibold">Searching for Logistics Partner</p>
                    <p className="text-xs text-muted-foreground">We are finding the best available rider for this order. This usually takes under 2 minutes.</p>
                  </div>
                </div>
              )}

              {/* Rider identity — shown only in internal rider mode when rider is assigned */}
              {showInternalRiderFeatures && orderDetails.riderInfo && [
                "assigned", "rider_arrived", "picked_up", "in_transit", "en_route", "delivered", "completed",
              ].includes(detailStatus) && (
                <div className="rounded-lg border border-border/70 p-4 space-y-2">
                  <p className="text-sm font-medium text-muted-foreground">Assigned Rider</p>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                      {(orderDetails.riderInfo.name || "R").charAt(0).toUpperCase()}
                    </div>
                    <div className="space-y-0.5">
                      <p className="font-semibold text-sm">{orderDetails.riderInfo.name || "Rider"}</p>
                      {orderDetails.riderInfo.phone && (
                        <a
                          href={`tel:${orderDetails.riderInfo.phone}`}
                          className="text-xs text-primary underline-offset-2 hover:underline"
                        >
                          {orderDetails.riderInfo.phone}
                        </a>
                      )}
                    </div>
                  </div>
                  {(orderDetails.riderInfo.vehicleType || orderDetails.riderInfo.vehiclePlateNumber) && (
                    <p className="text-xs text-muted-foreground">
                      {[orderDetails.riderInfo.vehicleType, orderDetails.riderInfo.vehiclePlateNumber].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  {orderDetails.riderInfo.rating != null && Number(orderDetails.riderInfo.rating) > 0 && (
                    <p className="text-xs text-muted-foreground">Rating: {Number(orderDetails.riderInfo.rating).toFixed(1)} / 5</p>
                  )}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 rounded-lg border border-border/70 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Order Summary</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Merchandise subtotal</span>
                    <span>{formatPrice(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Coupon discount</span>
                    <span className={couponDiscount > 0 ? "text-primary" : ""}>
                      {couponDiscount > 0 ? `-${formatPrice(couponDiscount)}` : formatPrice(0)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal after discount</span>
                    <span>{formatPrice(subtotalAfterDiscount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Delivery Fee</span>
                    <span>{formatPrice(deliveryFee)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Processing Fee</span>
                    <span>{formatPrice(processingFee)}</span>
                  </div>
                  <div className="flex justify-between border-t pt-2 font-semibold">
                    <span>Total</span>
                    <span className="text-primary">{formatPrice(Number(orderDetails.total) || 0)}</span>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border/70 p-4">
                  <p className="text-sm font-medium text-muted-foreground">Order Actions</p>
                  {orderContext === "seller" ? (
                    <div className="grid gap-2">
                      {detailCanStartPackaging && (
                        <Button
                          className="w-full"
                          disabled={updateOrderStatusMutation.isPending || startRiderMatchingMutation.isPending}
                          onClick={() =>
                            updateOrderStatusMutation.mutate({
                              orderId: orderDetails.id,
                              status: "processing",
                              reason: "seller_packaging_started",
                            })
                          }
                        >
                          Start Packaging
                        </Button>
                      )}
                      {/* Third-Party Delivery: single combined button skips the separate packaged step */}
                      {detailCanMarkPackaged && detailIsThirdParty && (
                        <Button
                          className="w-full"
                          disabled={
                            markThirdPartyReadyMutation.isPending ||
                            updateOrderStatusMutation.isPending ||
                            startRiderMatchingMutation.isPending ||
                            !allItemsChecked
                          }
                          onClick={() => markThirdPartyReadyMutation.mutate(orderDetails.id)}
                        >
                          {markThirdPartyReadyMutation.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Updating…</>
                          ) : (
                            <><Package className="h-4 w-4 mr-2" />Packaged &amp; Ready for Delivery</>
                          )}
                        </Button>
                      )}
                      {/* Non-third-party external / pickup: keep the two separate steps */}
                      {detailCanMarkPackaged && !detailIsThirdParty && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          disabled={
                            updateOrderStatusMutation.isPending ||
                            startRiderMatchingMutation.isPending ||
                            !allItemsChecked
                          }
                          onClick={() =>
                            updateOrderStatusMutation.mutate({
                              orderId: orderDetails.id,
                              status: "packaged",
                              reason: detailIsExternalDelivery
                                ? "seller_packaged_for_external_delivery"
                                : "seller_packaged_for_pickup",
                            })
                          }
                        >
                          Mark Packaged
                        </Button>
                      )}
                      {detailCanMarkReady && (
                        <Button
                          variant="secondary"
                          className="w-full"
                          disabled={updateOrderStatusMutation.isPending || startRiderMatchingMutation.isPending}
                          onClick={() =>
                            updateOrderStatusMutation.mutate({
                              orderId: orderDetails.id,
                              status: "ready",
                              reason: detailIsExternalDelivery
                                ? "seller_marked_ready_for_external_delivery"
                                : "seller_marked_ready_for_dispatch",
                            })
                          }
                        >
                          {detailIsExternalDelivery ? "Mark Ready for Delivery" : "Mark Ready"}
                        </Button>
                      )}
                      {detailCanStartRiderMatching && (
                        <Button
                          className="w-full"
                          disabled={updateOrderStatusMutation.isPending || startRiderMatchingMutation.isPending}
                          onClick={() => startRiderMatchingMutation.mutate(orderDetails.id)}
                        >
                          Start Rider Matching
                        </Button>
                      )}
                      {!detailCanStartPackaging &&
                        !detailCanMarkPackaged &&
                        !detailCanMarkReady &&
                        !detailCanStartRiderMatching &&
                        !markThirdPartyReadyMutation.isPending && (
                          <p className="text-sm text-muted-foreground">
                            No seller action is required right now.
                          </p>
                        )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Review the order details and status from this page.
                    </p>
                  )}
                </div>
              </div>
            </Card>
              );
            })()
          ) : (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground">Failed to load full order details.</p>
            </Card>
          )
        ) : isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredOrders.length === 0 ? (
          <Card className="p-12">
            <div className="text-center">
              {orderContext === "seller" ? (
                <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              ) : (
                <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              )}
              <h3 className="text-lg font-semibold mb-2">No orders found</h3>
              <p className="text-muted-foreground">
                {hasReferencedOrderRequest
                  ? "The referenced seller order could not be resolved yet."
                  : searchQuery 
                  ? "No orders match your search" 
                  : orderContext === "seller"
                    ? "You have no paid seller orders in this flow yet"
                    : "You haven't placed any orders as a customer yet"}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => {
              const paymentStatusLabel = normalizePaymentStatus(order.paymentStatus);
              const sellerState = getSellerActionState(order);
              const isUnpaid = paymentStatusLabel === "pending" || paymentStatusLabel === "failed";
              return (
              <Card
                key={order.id}
                ref={order.id === focusedOrderId ? highlightedOrderRef : null}
                className={`p-4 flex flex-col ${order.id === focusedOrderId ? "ring-2 ring-primary/70" : ""}`}
                data-testid={`card-order-${order.id}`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1">
                    <p className="font-bold text-sm">#{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {order.id === focusedOrderId && (
                    <Badge variant="outline" className="text-[10px]">
                      Referenced
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                    {getDisplayStatus(order)}
                  </Badge>
                  <Badge variant={paymentStatusLabel === "paid" ? "default" : "outline"} className="text-xs">
                    {paymentStatusLabel}
                  </Badge>
                  <Badge className={`text-xs border-0 ${sellerState.className}`}>
                    {sellerState.label}
                  </Badge>
                </div>
                <div className="flex-1 mb-3 space-y-2">
                  <p className="text-lg font-bold">{formatPrice(Number(order.total) || 0)}</p>
                  <div className="text-xs space-y-1">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Method</span>
                      <span className="font-medium">{getDisplayDeliveryMethod(order)}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{sellerState.hint}</p>
                  {isUnpaid && orderContext === "buyer" && (
                    <p className="text-xs text-destructive font-medium">Payment required</p>
                  )}
                </div>
                {(() => {
                  const s = normalize(order.status);
                  const trackStatuses = new Set([
                    "processing",
                    "ready",
                    "external_dispatch_arranged",
                    "searching_rider",
                    "assigned",
                    "rider_arrived",
                    "picked_up",
                    "in_transit",
                    "en_route",
                    "arrived",
                  ]);
                  const canResumePayment =
                    ["pending", "created", "unpaid"].includes(s) &&
                    ["pending", "failed", "processing"].includes(paymentStatusLabel);
                  const isPaid = paymentStatusLabel === "paid";
                  const deliveryMethod = normalize(order.deliveryMethod);
                  const hasRiderAssigned = Boolean(order.riderId);
                  const canStartPackaging =
                    orderContext === "seller" &&
                    isPaid &&
                    ["created", "pending", "confirmed"].includes(s);
                  const isExternalDelivery = isExternalRiderSystemEnabled && deliveryMethod !== "pickup";
                  const canMarkReady =
                    orderContext === "seller" &&
                    isPaid &&
                    deliveryMethod !== "pickup" &&
                    (isExternalDelivery
                      ? ["packaged"].includes(s)
                      : ["processing", "confirmed"].includes(s));
                  const canMarkPackaged =
                    orderContext === "seller" &&
                    isPaid &&
                    (deliveryMethod === "pickup" || isExternalDelivery) &&
                    ["processing", "confirmed"].includes(s);
                  const canStartRiderMatching =
                    orderContext === "seller" &&
                    !isExternalRiderSystemEnabled &&
                    isPaid &&
                    !hasRiderAssigned &&
                    ["rider", "bus"].includes(deliveryMethod) &&
                    ["ready"].includes(s);
                  const hasSellerActionButtons =
                    canStartPackaging || canMarkPackaged || canMarkReady || canStartRiderMatching;

                  if (orderContext === "buyer") {
                    if (canResumePayment) {
                      return (
                        <Button
                          variant="default"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => navigate(`/payment/${order.id}`)}
                        >
                          Continue Payment
                        </Button>
                      );
                    }
                    if (paymentStatusLabel === "paid") {
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => navigate(`/track/${encodeURIComponent(order.id)}`)}
                        >
                          <Package className="h-3 w-3 mr-2" />
                          Track Order
                        </Button>
                      );
                    }
                    if (paymentStatusLabel === "processing" || trackStatuses.has(s)) {
                      return (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => navigate(`/track/${encodeURIComponent(order.id)}`)}
                        >
                          <Package className="h-3 w-3 mr-2" />
                          Track Order
                        </Button>
                      );
                    }

                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => navigate(`/track/${encodeURIComponent(order.id)}`)}
                      >
                        <Package className="h-3 w-3 mr-2" />
                        Track Order
                      </Button>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {hasSellerActionButtons && (
                        <div className="grid grid-cols-1 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full text-xs"
                            onClick={() => navigate(`/seller/orders/${encodeURIComponent(order.id)}?context=${orderContext}`)}
                            data-testid={`button-view-details-${order.id}`}
                          >
                            <Eye className="h-3 w-3 mr-2" />
                            View Details
                          </Button>
                        </div>
                      )}
                      {!hasSellerActionButtons && trackStatuses.has(s) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => navigate(`/seller/orders/${encodeURIComponent(order.id)}?context=${orderContext}`)}
                          data-testid={`button-track-${order.id}`}
                        >
                          <Package className="h-3 w-3 mr-2" />
                          View Details
                        </Button>
                      ) : !hasSellerActionButtons ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full text-xs"
                          onClick={() => navigate(`/seller/orders/${encodeURIComponent(order.id)}?context=${orderContext}`)}
                          data-testid={`button-view-${order.id}`}
                        >
                          <Eye className="h-3 w-3 mr-2" />
                          View Details
                        </Button>
                      ) : null}
                    </div>
                  );
                })()}
              </Card>
            )})}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
