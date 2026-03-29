import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { PageLoadingState } from "@/components/ui/loading-state";
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
    return <PageLoadingState title="Loading admin access" description="Checking your dashboard permissions and workspace." />;
  }

  if (!isAuthenticated || (normalizedRole !== "admin" && normalizedRole !== "super_admin")) {
    return <PageLoadingState title="Redirecting" description="Taking you to the right entry point." />;
  }

  // Super admin gets full AdminDashboardConnected
  if (normalizedRole === "super_admin") {
    return <AdminDashboardConnected />;
  }

  // Regular admin gets limited AdminDashboard
  return <AdminDashboard />;
}
