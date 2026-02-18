import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Eye, Package, ShoppingBag, Store } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocation } from "wouter";

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  total: string;
  status: string;
  paymentStatus: string;
  createdAt: string;
}

type OrderContext = "seller" | "buyer";

export default function SellerOrders() {
  const { user } = useAuth();
  const { formatPrice, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [orderContext, setOrderContext] = useState<OrderContext>("seller");

  const { data: orders = [], isLoading } = useQuery<Order[]>({
    queryKey: [`/api/orders?context=${orderContext}`],
  });

  const filteredOrders = orders.filter(order =>
    order.orderNumber.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "pending": return "bg-yellow-500";
      case "processing": return "bg-blue-500";
      case "delivering": return "bg-purple-500";
      case "delivered": return "bg-green-500";
      case "cancelled": return "bg-red-500";
      default: return "bg-gray-500";
    }
  };

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Orders</h1>
            <p className="text-muted-foreground">
              {orderContext === "seller" 
                ? "Manage orders from your customers" 
                : "View your personal shopping orders"}
            </p>
          </div>
          
          <Tabs value={orderContext} onValueChange={(value) => setOrderContext(value as OrderContext)}>
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
        </div>

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

        {isLoading ? (
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
                {searchQuery 
                  ? "No orders match your search" 
                  : orderContext === "seller"
                    ? "You haven't received any customer orders yet"
                    : "You haven't placed any orders as a customer yet"}
              </p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOrders.map((order) => (
              <Card key={order.id} className="p-4 flex flex-col" data-testid={`card-order-${order.id}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="flex-1">
                    <p className="font-bold text-sm">#{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Badge className={`${getStatusColor(order.status)} text-white text-xs`}>
                    {order.status}
                  </Badge>
                  <Badge variant={order.paymentStatus === "paid" ? "default" : "outline"} className="text-xs">
                    {order.paymentStatus}
                  </Badge>
                </div>
                <div className="flex-1 mb-3">
                  <p className="text-lg font-bold">{formatPrice(Number(order.total) || 0)}</p>
                </div>
                {(() => {
                  const s = (order.status || "").toLowerCase().trim();
                  const trackStatuses = new Set(["processing", "delivering", "en_route", "picked_up", "assigned"]);

                  if (orderContext === "buyer") {
                    const paymentStatus = (order as any).paymentStatus?.toLowerCase()?.trim() || "";
                    if (paymentStatus === "completed" || paymentStatus === "paid") {
                      return (
                        <Button variant="outline" size="sm" className="w-full text-xs" onClick={() => { window.location.href = `/track?orderId=${order.id}`; }}>
                          <Package className="h-3 w-3 mr-2" />
                          Track Order
                        </Button>
                      );
                    }
                    if (paymentStatus === "processing") {
                      return (
                        <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
                          Completing Payment...
                        </Button>
                      );
                    }

                    return (
                      <Button variant="default" size="sm" className="w-full text-xs" onClick={() => { window.location.href = `/payment/${order.id}`; }}>
                        Continue Payment
                      </Button>
                    );
                  }

                  if (trackStatuses.has(s)) {
                    return (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full text-xs"
                        onClick={() => { window.location.href = `/track?orderId=${order.id}`; }}
                        data-testid={`button-track-${order.id}`}
                      >
                        <Package className="h-3 w-3 mr-2" />
                        Track Order
                      </Button>
                    );
                  }

                  return (
                    <Button variant="outline" size="sm" className="w-full text-xs" data-testid={`button-view-${order.id}`}>
                      <Eye className="h-3 w-3 mr-2" />
                      View Details
                    </Button>
                  );
                })()}
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
