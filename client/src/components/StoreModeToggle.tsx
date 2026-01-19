import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Loader2, Store, Building2 } from "lucide-react";
import type { PlatformSettings } from "@shared/schema";

interface StoreModeToggleProps {
  role: "admin" | "seller" | "buyer" | "rider" | "agent";
  showLabel?: boolean;
  className?: string;
}

export default function StoreModeToggle({
  role,
  showLabel = true,
  className = "",
}: StoreModeToggleProps) {
  const { toast } = useToast();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingMode, setPendingMode] = useState<boolean | null>(null);

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings"],
  });

  const updateModeMutation = useMutation({
    mutationFn: async (isMultiVendor: boolean) => {
      return await apiRequest("PATCH", "/api/settings", { isMultiVendor });
    },
    onMutate: async (isMultiVendor: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["/api/settings"] });
      const previous = queryClient.getQueryData<any>(["/api/settings"]);
      queryClient.setQueryData(["/api/settings"], (old: any) => ({ ...old, isMultiVendor }));
      return { previous };
    },
    onError: (error: any, _vars, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["/api/settings"], context.previous);
      }
      toast({
        title: "Error",
        description: error.message || "Failed to update store mode",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Success",
        description: "Store mode updated successfully.",
      });
    },
    onSettled: () => {
      queryClient.refetchQueries({ queryKey: ["/api/settings"] });
    }
  });

  const handleToggle = (checked: boolean) => {
    if (role !== "admin") return;

    // If switching to single-store mode, ensure a primaryStoreId is set in platform settings
    if (!checked && !settings?.primaryStoreId) {
      toast({
        title: "Primary store required",
        description: "Select a Primary Store in Settings before switching to Single-Store mode.",
        variant: "destructive",
      });
      return;
    }

    setPendingMode(checked);
    setShowConfirmDialog(true);
  };

  const confirmModeChange = () => {
    if (pendingMode !== null) {
      updateModeMutation.mutate(pendingMode);
    }
    setShowConfirmDialog(false);
    setPendingMode(null);
  };

  const cancelModeChange = () => {
    setShowConfirmDialog(false);
    setPendingMode(null);
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`} data-testid="loader-store-mode">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading...</span>
      </div>
    );
  }

  const isMultiVendor = settings?.isMultiVendor ?? false;
  const isAdmin = role === "admin";

  return (
    <>
      <div className={`flex items-center gap-3 ${className}`} data-testid="container-store-mode">
        <div className="flex items-center gap-2">
          {isMultiVendor ? (
            <Building2 className="h-5 w-5 text-primary" data-testid="icon-multi-vendor" />
          ) : (
            <Store className="h-5 w-5 text-primary" data-testid="icon-single-store" />
          )}
        </div>
        
        <div className="flex items-center gap-3">
          {showLabel && (
            <div className="flex flex-col">
              <Label 
                htmlFor="store-mode-toggle" 
                className="text-sm font-medium cursor-pointer"
                data-testid="label-store-mode"
              >
                {isMultiVendor ? "Multi-Vendor Mode" : "Single Store Mode"}
              </Label>
              {!isAdmin && (
                <span className="text-xs text-muted-foreground">
                  (Read-only)
                </span>
              )}
            </div>
          )}
          
          <Switch
            id="store-mode-toggle"
            checked={isMultiVendor}
            onCheckedChange={handleToggle}
            disabled={!isAdmin || updateModeMutation.isPending}
            data-testid="switch-store-mode"
            aria-label={isAdmin ? "Toggle store mode" : "Store mode (read-only)"}
          />
        </div>
      </div>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent data-testid="dialog-confirm-mode-change">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMode ? "Switch to Multi-Vendor Mode?" : "Switch to Single Store Mode?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p className="font-semibold">
                This will change how your platform operates:
              </p>
              {pendingMode ? (
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Multiple sellers can create and manage their own stores</li>
                  <li>Homepage will display products grouped by stores</li>
                  <li>Each store can have its own branding and products</li>
                  <li>Buyers can browse and shop from multiple vendors</li>
                </ul>
              ) : (
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Platform operates as a single store</li>
                  <li>All products are managed centrally</li>
                  <li>Unified branding and product catalog</li>
                  <li>Simpler shopping experience for buyers</li>
                </ul>
              )}
              <p className="text-sm font-medium mt-3">
                ⚠️ The page will refresh after this change to apply the new settings.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelModeChange} data-testid="button-cancel-mode-change">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmModeChange} 
              disabled={updateModeMutation.isPending}
              data-testid="button-confirm-mode-change"
            >
              {updateModeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                "Confirm"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
