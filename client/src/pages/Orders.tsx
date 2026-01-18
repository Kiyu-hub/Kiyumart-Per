import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ThemeToggle from "@/components/ThemeToggle";
import { Package, Clock, CheckCircle, XCircle, Truck, CreditCard } from "lucide-react";

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
  const { currencySymbol, formatPrice } = useLanguage();

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

  const filterOrdersByStatus = (status: string) => {
    if (status === "all") return orders;
    return orders.filter((order) => order.status.toLowerCase() === status.toLowerCase());
  };

  const OrderCard = ({ order }: { order: Order }) => (
    <Card
      className="cursor-pointer hover-elevate active-elevate-2 transition-all"
      onClick={() => navigate(`/track?orderId=${order.id}`)}
      data-testid={`order-card-${order.id}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-muted">
              {getStatusIcon(order.status)}
            </div>
            <div>
              <CardTitle className="text-lg">Order #{order.id.slice(0, 8)}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {new Date(order.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Badge className={getStatusColor(order.status)} data-testid={`badge-status-${order.id}`}>
            {order.status}
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
              variant={order.paymentStatus === 'completed' ? 'default' : 'secondary'}
              className="h-5"
            >
              <CreditCard className="h-3 w-3 mr-1" />
              {order.paymentStatus === 'completed' ? 'Paid' : order.paymentStatus}
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
          variant={order.paymentStatus !== 'completed' ? 'default' : 'outline'}
          onClick={(e) => {
            e.stopPropagation();
            if (order.paymentStatus !== 'completed') {
              navigate(`/payment/${order.id}`);
            } else {
              navigate(`/track?orderId=${order.id}`);
            }
          }}
          data-testid={`button-track-${order.id}`}
        >
          {order.paymentStatus !== 'completed' ? 'Continue Payment' : 'Track Order'}
        </Button>
      </CardContent>
    </Card>
  );

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
