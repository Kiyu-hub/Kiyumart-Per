import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, ShoppingCart, DollarSign, TrendingUp, Calendar, CheckCircle } from "lucide-react";
import { format } from "date-fns";

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  deliveryAddress: string;
  total: string;
  createdAt: string;
  buyer: {
    id: string;
    name: string;
    email: string;
  };
}

interface Analytics {
  totalSales: number;
  totalRevenue: number;
  totalPaid: number;
  salesThisMonth: number;
  revenueThisMonth: number;
  avgOrderValue: number;
}

interface SalesData {
  sales: Order[];
  analytics: Analytics;
}

interface Payout {
  id: string;
  sellerId: string;
  amount: string;
  currency: string;
  method: string;
  status: string;
  reference: string;
  bankDetails: string;
  commissionIds: string[];
  notes: string;
  processedBy: string;
  processedAt: string;
  createdAt: string;
}

interface Seller {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SellerDetailsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const sellerId = params.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: seller, isLoading: sellerLoading } = useQuery<Seller>({
    queryKey: [`/api/users/${sellerId}`],
    enabled: !!sellerId && isAuthenticated,
  });

  const { data: salesData, isLoading: salesLoading } = useQuery<SalesData>({
    queryKey: [`/api/sellers/${sellerId}/sales`],
    enabled: !!sellerId && isAuthenticated,
  });

  const { data: payouts = [], isLoading: payoutsLoading } = useQuery<Payout[]>({
    queryKey: [`/api/admin/sellers/${sellerId}/payouts`],
    enabled: !!sellerId && isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (sellerLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const sales = salesData?.sales || [];
  const analytics = salesData?.analytics;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "delivered":
        return "bg-green-500";
      case "en_route":
        return "bg-blue-500";
      case "processing":
        return "bg-yellow-500";
      case "cancelled":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  const getPaymentStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "bg-green-500";
      case "processing":
        return "bg-blue-500";
      case "failed":
        return "bg-red-500";
      default:
        return "bg-gray-500";
    }
  };

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/sellers")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-seller-details">
              Seller Details
            </h1>
            <p className="text-muted-foreground mt-1">
              {seller?.name || seller?.email || "Seller"}
            </p>
          </div>
        </div>

        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.totalSales}</div>
                <p className="text-xs text-muted-foreground mt-1">All time orders</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(analytics.totalRevenue)}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  Paid: {formatPrice(analytics.totalPaid)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{analytics.salesThisMonth}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatPrice(analytics.revenueThisMonth)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Order</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(analytics.avgOrderValue)}</div>
                <p className="text-xs text-muted-foreground mt-1">Per order</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="sales" className="w-full">
          <TabsList>
            <TabsTrigger value="sales" data-testid="tab-sales">
              Sales ({sales.length})
            </TabsTrigger>
            <TabsTrigger value="payouts" data-testid="tab-payouts">
              Payment History ({payouts.length})
            </TabsTrigger>
            <TabsTrigger value="analytics" data-testid="tab-analytics">
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-6">
            {salesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sales.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <ShoppingCart className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No sales found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {sales.map((order) => (
                  <Card key={order.id} data-testid={`sale-${order.id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">Order #{order.orderNumber}</h3>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                            <Badge className={getPaymentStatusColor(order.paymentStatus)}>
                              {order.paymentStatus}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Buyer</p>
                              <p className="font-medium">{order.buyer.name}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Order Total</p>
                              <p className="font-medium text-green-600">
                                {formatPrice(parseFloat(order.total || "0"))}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Delivery Method</p>
                              <p className="font-medium capitalize">{order.deliveryMethod}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p className="font-medium">
                                {order.createdAt ? format(new Date(order.createdAt), "MMM dd, yyyy HH:mm") : "N/A"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="payouts" className="mt-6">
            {payoutsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : payouts.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <DollarSign className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No payment history found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {payouts.map((payout) => (
                  <Card key={payout.id} data-testid={`payout-${payout.id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">Payout {payout.reference}</h3>
                            <Badge className={payout.status === "completed" ? "bg-green-500" : payout.status === "pending" ? "bg-yellow-500" : "bg-red-500"}>
                              {payout.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Amount</p>
                              <p className="font-bold text-lg text-green-600">
                                {formatPrice(parseFloat(payout.amount || "0"))}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Method</p>
                              <p className="font-medium capitalize">{payout.method}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Currency</p>
                              <p className="font-medium">{payout.currency}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Processed Date</p>
                              <p className="font-medium">
                                {payout.processedAt ? format(new Date(payout.processedAt), "MMM dd, yyyy HH:mm") : "N/A"}
                              </p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p className="font-medium">
                                {payout.createdAt ? format(new Date(payout.createdAt), "MMM dd, yyyy HH:mm") : "N/A"}
                              </p>
                            </div>
                            {payout.bankDetails && (
                              <div>
                                <p className="text-muted-foreground">Bank Details</p>
                                <p className="font-medium">{payout.bankDetails}</p>
                              </div>
                            )}
                          </div>
                          {payout.notes && (
                            <div className="mt-3">
                              <p className="text-muted-foreground text-xs">Notes</p>
                              <p className="text-sm">{payout.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="analytics" className="mt-6">
            {salesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : analytics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Sales Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Sales</span>
                      <span className="font-bold text-lg">{analytics.totalSales}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Sales This Month</span>
                      <span className="font-bold text-lg">{analytics.salesThisMonth}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Average Order Value</span>
                      <span className="font-bold text-lg">{formatPrice(analytics.avgOrderValue)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Revenue Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Revenue</span>
                      <span className="font-bold text-lg text-green-600">
                        {formatPrice(analytics.totalRevenue)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Paid</span>
                      <span className="font-bold text-lg text-green-600">
                        {formatPrice(analytics.totalPaid)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Revenue This Month</span>
                      <span className="font-bold text-lg text-green-600">
                        {formatPrice(analytics.revenueThisMonth)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No analytics available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
