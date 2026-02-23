import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, DollarSign, TrendingUp, Package } from "lucide-react";

export default function RiderEarnings() {
  const { user } = useAuth();
  const { formatPrice } = useLanguage();

  const { data: earnings, isLoading } = useQuery({
    queryKey: ["/api/rider/earnings"],
    queryFn: async () => {
      const res = await fetch("/api/rider/earnings", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch earnings");
      return res.json();
    },
  });

  const stats = [
    {
      title: "Total Earnings",
      value: earnings?.total || "0.00",
      icon: DollarSign,
      format: true,
    },
    {
      title: "This Month",
      value: earnings?.thisMonth || "0.00",
      icon: TrendingUp,
      format: true,
    },
    {
      title: "Deliveries Completed",
      value: earnings?.deliveriesCompleted || 0,
      icon: Package,
    },
  ];

  return (
    <DashboardLayout role="rider">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Earnings</h1>
          <p className="text-muted-foreground">Track your delivery earnings</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-3">
              {stats.map((stat, index) => (
                <Card key={index} data-testid={`card-stat-${index}`}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {stat.format ? formatPrice(Number(stat.value) || 0) : stat.value}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Earnings History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {earnings?.history?.length > 0 ? (
                    earnings.history.map((item: any, index: number) => (
                      <div key={index} className="flex items-center justify-between py-2 border-b last:border-b-0">
                        <div>
                          <p className="font-medium">Delivery #{item.deliveryId}</p>
                          <p className="text-sm text-muted-foreground">{new Date(item.date).toLocaleDateString()}</p>
                        </div>
                        <p className="font-semibold text-green-600">{formatPrice(Number(item.amount) || 0)}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-center text-muted-foreground py-8">No earnings history yet</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
