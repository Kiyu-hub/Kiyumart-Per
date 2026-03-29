import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

/**
 * Seller Profile Completion Guard
 * 
 * Prevents sellers without storeType from accessing protected seller pages.
 * Redirects to /seller/settings with a friendly notification.
 * 
 * Usage: Call `useSellerProfileGuard(location)` from DashboardLayout.
 * 
 * @param currentLocation - Current route path (used to exempt /seller/settings)
 */
export function useSellerProfileGuard(currentLocation?: string) {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  // ALWAYS call useEffect (React Hooks Rules), exemption logic is INSIDE effect
  useEffect(() => {
    // Skip guard if on settings page (redirect target) to avoid loop
    if (currentLocation === "/seller/settings") {
      return; // This is OK - returning from effect body, not from hook
    }

    // Guard logic: redirect incomplete sellers to settings
    if (!authLoading && isAuthenticated && user?.role === "seller" && user?.isActive !== false && !(user as any)?.storeType) {
      toast({
        title: "Complete Your Store Profile",
        description: "Please set up your store type to access seller features.",
        variant: "default",
      });
      navigate("/seller/settings");
    }
  }, [authLoading, isAuthenticated, user, navigate, currentLocation, location, toast]);
}
