import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import { Package, Clock, CheckCircle, XCircle, Truck, CreditCard, AlertCircle, Loader2 } from "lucide-react";

interface Order {
  id: string;
  userId: string;
  status: string;
  paymentStatus: string;
  totalAmount: string;
  createdAt: string;
  deliveryAddress: string;
  items: Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
  }>;
}

export default function Orders() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { currencySymbol, formatPrice } = useLanguage();

  const normalize = (value?: string) => (value || "").toLowerCase().trim();
  const normalizePaymentStatus = (value?: string) => {
    const s = normalize(value);
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid") return "paid";
    return s || "pending";
  };

  // Always fetch orders where the user is the buyer (their purchases)
  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: ["/api/orders?context=buyer"],
  });

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return "bg-yellow-500 text-white";
      case "processing":
        return "bg-blue-500 text-white";
      case "delivering":
        return "bg-purple-500 text-white";
      case "delivered":
        return "bg-green-500 text-white";
      case "cancelled":
        return "bg-red-500 text-white";
      default:
        return "bg-gray-500 text-white";
    }
  };

  const getPaymentStatusColor = (paymentStatus: string) => {
    switch (normalizePaymentStatus(paymentStatus)) {
      case "pending":
        return "bg-yellow-100 text-yellow-800";
      case "processing":
        return "bg-blue-100 text-blue-800";
      case "paid":
        return "bg-green-100 text-green-800";
      case "failed":
        return "bg-red-100 text-red-800";
      case "refunded":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending":
        return <Clock className="h-4 w-4" />;
      case "processing":
        return <Package className="h-4 w-4" />;
      case "delivering":
        return <Truck className="h-4 w-4" />;
      case "delivered":
        return <CheckCircle className="h-4 w-4" />;
      case "cancelled":
        return <XCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getPaymentStatusIcon = (paymentStatus: string) => {
    switch (normalizePaymentStatus(paymentStatus)) {
      case "pending":
        return <AlertCircle className="h-3 w-3" />;
      case "processing":
        return <Loader2 className="h-3 w-3 animate-spin" />;
      case "paid":
        return <CheckCircle className="h-3 w-3" />;
      case "failed":
        return <XCircle className="h-3 w-3" />;
      default:
        return <CreditCard className="h-3 w-3" />;
    }
  };

  const filterOrdersByStatus = (status: string) => {
    if (status === "all") return orders;
    return orders.filter((order) => order.status.toLowerCase() === status.toLowerCase());
  };

  const getPaymentButtonConfig = (order: Order) => {
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const orderStatus = normalize(order.status);

    if (orderStatus === "pending") {
      return {
        label: "Continue Payment",
        variant: "default" as const,
        disabled: false,
        onClick: () => navigate(`/payment/${order.id}`),
        title: "Resume payment for this pending order",
      };
    }

    if (paymentStatus === "paid") {
      return {
        label: "Track Order",
        variant: "outline" as const,
        disabled: false,
        onClick: () => navigate(`/track?orderId=${order.id}`),
        title: "View order status and tracking information",
      };
    }

    if (paymentStatus === "processing") {
      return {
        label: "Track Order",
        variant: "outline" as const,
        disabled: false,
        onClick: () => navigate(`/track?orderId=${order.id}`),
        title: "Payment is processing. Track order updates.",
      };
    }

    // Default to showing payment CTA for unpaid/failed states
    return {
      label: "Continue Payment",
      variant: "default" as const,
      disabled: false,
      onClick: () => navigate(`/payment/${order.id}`),
      title: "Resume payment for this order",
    };
  };

  const OrderCard = ({ order }: { order: Order }) => {
    const paymentButtonConfig = getPaymentButtonConfig(order);
    const orderStatus = normalize(order.status) || "pending";
    const paymentStatus = normalizePaymentStatus(order.paymentStatus);
    const handleCardClick = () => {
      if (orderStatus === "pending") {
        navigate(`/payment/${order.id}`);
        return;
      }
      if (paymentStatus === "processing" || paymentStatus === "paid") {
        navigate(`/track?orderId=${order.id}`);
        return;
      }
      navigate(`/payment/${order.id}`);
    };

    return (
      <Card
        className="cursor-pointer hover-elevate active-elevate-2 transition-all"
        onClick={handleCardClick}
        data-testid={`order-card-${order.id}`}
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                {getStatusIcon(orderStatus)}
              </div>
              <div>
                <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {new Date(order.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>
            <Badge className={getStatusColor(orderStatus)} data-testid={`badge-status-${order.id}`}>
              {orderStatus}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items:</span>
              <span className="font-medium">{order.items?.length || 0} items</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span className="font-bold text-primary">
                {formatPrice(parseFloat(order.totalAmount))}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment:</span>
              <Badge 
                variant="secondary"
                className={`h-5 gap-1 ${getPaymentStatusColor(paymentStatus)}`}
                data-testid={`badge-payment-status-${order.id}`}
              >
                {getPaymentStatusIcon(paymentStatus)}
                {paymentStatus === "paid"
                  ? "Paid"
                  : paymentStatus === "processing"
                  ? "Processing..."
                  : paymentStatus === "failed"
                  ? "Failed"
                  : "Pending"}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delivery:</span>
              <span className="font-medium truncate max-w-[200px]">
                {order.deliveryAddress || "N/A"}
              </span>
            </div>
          </div>
          <Button
            className="w-full mt-4"
            variant={paymentButtonConfig.variant}
            onClick={(e) => {
              e.stopPropagation();
              paymentButtonConfig.onClick();
            }}
            disabled={paymentButtonConfig.disabled}
            title={paymentButtonConfig.title}
            data-testid={`button-action-${order.id}`}
          >
            {paymentButtonConfig.label}
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="flex items-center justify-end p-2 border-b bg-background">
          <ThemeToggle />
        </div>
        <Header onCartClick={() => navigate("/cart")} data-testid="header-orders" />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading orders...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex items-center justify-end p-2 border-b bg-background">
        <ThemeToggle />
      </div>

      <Header onCartClick={() => navigate("/cart")} data-testid="header-orders" />

      <main className="flex-1">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-2" data-testid="heading-orders">
              My Orders
            </h1>
            <p className="text-muted-foreground">
              View and track all your orders in one place
            </p>
          </div>

          <Tabs defaultValue="all" className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="all" data-testid="tab-all">
                All ({orders.length})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending">
                Pending ({filterOrdersByStatus("pending").length})
              </TabsTrigger>
              <TabsTrigger value="processing" data-testid="tab-processing">
                Processing ({filterOrdersByStatus("processing").length})
              </TabsTrigger>
              <TabsTrigger value="delivering" data-testid="tab-delivering">
                Out for Delivery ({filterOrdersByStatus("delivering").length})
              </TabsTrigger>
              <TabsTrigger value="delivered" data-testid="tab-delivered">
                Delivered ({filterOrdersByStatus("delivered").length})
              </TabsTrigger>
              <TabsTrigger value="cancelled" data-testid="tab-cancelled">
                Cancelled ({filterOrdersByStatus("cancelled").length})
              </TabsTrigger>
            </TabsList>

            {["all", "pending", "processing", "delivering", "delivered", "cancelled"].map((status) => (
              <TabsContent key={status} value={status} className="mt-6">
                {filterOrdersByStatus(status).length === 0 ? (
                  <div className="text-center py-12">
                    <Package className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">
                      No {status === "all" ? "" : status} orders
                    </h3>
                    <p className="text-muted-foreground mb-6">
                      {status === "all"
                        ? "You haven't placed any orders yet"
                        : `You don't have any ${status} orders`}
                    </p>
                    <Button onClick={() => navigate("/")} data-testid="button-shop-now">
                      Start Shopping
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filterOrdersByStatus(status).map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
