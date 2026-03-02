import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import RealTimeRiderMap from "@/components/RealTimeRiderMap";
import { Loader2 } from "lucide-react";

export default function AdminDeliveryTracking() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "super_admin")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  if (authLoading || !isAuthenticated || user?.role !== "super_admin") {
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
            Monitor all active deliveries in real-time
          </p>
        </div>

        <RealTimeRiderMap forceMapboxGl />
      </div>
    </DashboardLayout>
  );
}
