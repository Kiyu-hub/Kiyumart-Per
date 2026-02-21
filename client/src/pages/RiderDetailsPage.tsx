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
import { Loader2, ArrowLeft, Package, DollarSign, TrendingUp, Calendar } from "lucide-react";
import { format } from "date-fns";

interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  status: string;
  deliveryMethod: string;
  deliveryAddress: string;
  deliveryFee: string;
  total: string;
  createdAt: string;
  deliveredAt: string | null;
  buyer: {
    id: string;
    name: string;
    email: string;
  };
  seller: {
    id: string;
    name: string;
    email: string;
  };
}

interface Earnings {
  totalDeliveries: number;
  totalEarnings: number;
  completedThisMonth: number;
  earningsThisMonth: number;
  avgDeliveryFee: number;
}

interface Rider {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function RiderDetailsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const riderId = params.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: rider, isLoading: riderLoading } = useQuery<Rider>({
    queryKey: [`/api/users/${riderId}`],
    enabled: !!riderId && isAuthenticated,
  });

  const { data: deliveries = [], isLoading: deliveriesLoading } = useQuery<Order[]>({
    queryKey: [`/api/riders/${riderId}/deliveries`],
    enabled: !!riderId && isAuthenticated,
  });

  const { data: earnings, isLoading: earningsLoading } = useQuery<Earnings>({
    queryKey: [`/api/riders/${riderId}/earnings`],
    enabled: !!riderId && isAuthenticated,
  });

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (riderLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/riders")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-rider-details">
              Rider Details
            </h1>
            <p className="text-muted-foreground mt-1">
              {rider?.name || rider?.email || "Rider"}
            </p>
          </div>
        </div>

        {earnings && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Deliveries</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{earnings.totalDeliveries}</div>
                <p className="text-xs text-muted-foreground mt-1">All time deliveries</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(earnings.totalEarnings)}</div>
                <p className="text-xs text-muted-foreground mt-1">All time earnings</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">This Month</CardTitle>
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{earnings.completedThisMonth}</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatPrice(earnings.earningsThisMonth)}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Avg. Fee</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(earnings.avgDeliveryFee)}</div>
                <p className="text-xs text-muted-foreground mt-1">Per delivery</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs defaultValue="deliveries" className="w-full">
          <TabsList>
            <TabsTrigger value="deliveries" data-testid="tab-deliveries">
              Deliveries ({deliveries.length})
            </TabsTrigger>
            <TabsTrigger value="stats" data-testid="tab-stats">
              Statistics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="deliveries" className="mt-6">
            {deliveriesLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : deliveries.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Package className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No deliveries found</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {deliveries.map((order) => (
                  <Card key={order.id} data-testid={`delivery-${order.id}`}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold">Order #{order.orderNumber}</h3>
                            <Badge className={getStatusColor(order.status)}>
                              {order.status}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-muted-foreground">Buyer</p>
                              <p className="font-medium">{order.buyer.name}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Seller</p>
                              <p className="font-medium">{order.seller.name}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Delivery Address</p>
                              <p className="font-medium">{order.deliveryAddress || "N/A"}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Delivery Fee</p>
                              <p className="font-medium">{formatPrice(parseFloat(order.deliveryFee || "0"))}</p>
                            </div>
                            <div>
                              <p className="text-muted-foreground">Created</p>
                              <p className="font-medium">
                                {order.createdAt ? format(new Date(order.createdAt), "MMM dd, yyyy HH:mm") : "N/A"}
                              </p>
                            </div>
                            {order.deliveredAt && (
                              <div>
                                <p className="text-muted-foreground">Delivered</p>
                                <p className="font-medium">
                                  {format(new Date(order.deliveredAt), "MMM dd, yyyy HH:mm")}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            {earningsLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : earnings ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Performance Overview</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Deliveries</span>
                      <span className="font-bold text-lg">{earnings.totalDeliveries}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Completed This Month</span>
                      <span className="font-bold text-lg">{earnings.completedThisMonth}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Average Delivery Fee</span>
                      <span className="font-bold text-lg">{formatPrice(earnings.avgDeliveryFee)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Earnings Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total Earnings</span>
                      <span className="font-bold text-lg text-green-600">
                        {formatPrice(earnings.totalEarnings)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Earnings This Month</span>
                      <span className="font-bold text-lg text-green-600">
                        {formatPrice(earnings.earningsThisMonth)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No statistics available</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
