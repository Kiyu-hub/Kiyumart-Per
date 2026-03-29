import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import RealTimeRiderMap from "@/components/RealTimeRiderMap";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

export default function AdminDeliveryTracking() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { isExternalRiderSystemEnabled, isLoading: settingsLoading } = usePlatformSettings();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "super_admin")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  if (authLoading || settingsLoading || !isAuthenticated || user?.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role="super_admin">
      <div className="p-6" data-testid="page-admin-delivery-tracking">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="heading-delivery-tracking">
            Live Delivery Tracking
          </h1>
          <p className="text-muted-foreground mt-1">
            {isExternalRiderSystemEnabled
              ? "This map is disabled because the External Rider System is active"
              : "Monitor all active deliveries in real-time"}
          </p>
        </div>

        {isExternalRiderSystemEnabled ? (
          <Card className="border-dashed border-border/70 bg-card/80">
            <CardContent className="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center">
              <h2 className="text-2xl font-semibold">Live Map Disabled</h2>
              <p className="max-w-2xl text-sm text-muted-foreground">
                The External Rider System is enabled, so the built-in rider live map is unavailable on this page.
                Turn the feature off in Platform Settings to restore internal delivery tracking.
              </p>
            </CardContent>
          </Card>
        ) : (
          <RealTimeRiderMap forceMapboxGl />
        )}
      </div>
    </DashboardLayout>
  );
}
