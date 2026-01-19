import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, TrendingUp, DollarSign, Package, ShoppingCart } from "lucide-react";

export default function SellerAnalytics() {
  const { user } = useAuth();
  const { formatPrice } = useLanguage();

  const { data: stats, isLoading } = useQuery<{ totalRevenue?: string; totalOrders?: number; productsSold?: number; growthRate?: number }>({
    queryKey: ["/api/analytics"],
    enabled: !!user && user.role === "seller",
  });

  const metrics = [
    {
      title: "Total Revenue",
      value: stats?.totalRevenue || "0.00",
      icon: DollarSign,
      format: true,
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders || 0,
      icon: ShoppingCart,
    },
    {
      title: "Products Sold",
      value: stats?.productsSold || 0,
      icon: Package,
    },
    {
      title: "Growth Rate",
      value: `${stats?.growthRate || 0}%`,
      icon: TrendingUp,
    },
  ];

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Analytics</h1>
          <p className="text-muted-foreground">Track your store performance</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {metrics.map((metric, index) => (
              <Card key={index} data-testid={`card-metric-${index}`}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
                  <metric.icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {metric.format ? formatPrice(Number(metric.value) || 0) : metric.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="mt-6 p-6">
          <h2 className="text-xl font-semibold mb-4">Sales Overview</h2>
          <p className="text-muted-foreground">Detailed analytics charts coming soon...</p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
