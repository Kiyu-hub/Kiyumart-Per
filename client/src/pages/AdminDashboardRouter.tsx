import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import AdminDashboard from "./AdminDashboard";
import AdminDashboardConnected from "./AdminDashboardConnected";

export default function AdminDashboardRouter() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const normalizedRole = (() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  })();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (normalizedRole !== "admin" && normalizedRole !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, normalizedRole, navigate]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-admin-router" />
      </div>
    );
  }

  if (!isAuthenticated || (normalizedRole !== "admin" && normalizedRole !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-admin-router" />
      </div>
    );
  }

  // Super admin gets full AdminDashboardConnected
  if (normalizedRole === "super_admin") {
    return <AdminDashboardConnected />;
  }

  // Regular admin gets limited AdminDashboard
  return <AdminDashboard />;
}
