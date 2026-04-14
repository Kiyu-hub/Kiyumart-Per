import { useMemo } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageLoadingState } from "@/components/ui/loading-state";
import { Bell, Store, Settings as SettingsIcon, Wallet, MessageSquare, Package, FolderTree, Image as ImageIcon, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { fetchApiJson } from "@/lib/queryClient";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface SellerStore {
  id: string;
  name: string;
  payoutType?: "bank_account" | "mobile_money" | null;
  payoutDetails?: {
    provider?: string | null;
    mobileNumber?: string | null;
    bankName?: string | null;
    accountNumber?: string | null;
    accountName?: string | null;
    bankCode?: string | null;
  } | null;
  isPayoutVerified?: boolean | null;
}

const hasSellerPayoutSetup = (store?: SellerStore | null) => {
  if (!store?.payoutType || !store?.payoutDetails) return false;

  if (store.payoutType === "mobile_money") {
    return Boolean(
      String(store.payoutDetails.provider || "").trim() &&
      String(store.payoutDetails.mobileNumber || "").trim(),
    );
  }

  return Boolean(
    String(store.payoutDetails.bankName || "").trim() &&
    String(store.payoutDetails.bankCode || "").trim() &&
    String(store.payoutDetails.accountName || "").trim() &&
    String(store.payoutDetails.accountNumber || "").trim(),
  );
};

export default function SellerSettings() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { allowSellerBankPayouts, allowSellerDirectSupportMessages } = usePlatformSettings();

  const { data: store, isLoading: storeLoading } = useQuery<SellerStore>({
    queryKey: ["/api/stores/my-store", "seller-settings"],
    enabled: !!user?.id && user.role === "seller",
  });

  const { data: unreadSummary } = useQuery<{ count: number }>({
    queryKey: ["/api/notifications/unread-count", "seller-settings"],
    queryFn: () => fetchApiJson<{ count: number }>("/api/notifications/unread-count"),
    enabled: !!user?.id && user.role === "seller",
    refetchInterval: 15000,
  });

  const storePayoutReady = hasSellerPayoutSetup(store);
  const storeApprovalLabel = useMemo(() => {
    if (!user) return "Loading";
    if (user.isApproved === false) return "Pending Approval";
    if (user.isActive === false) return "Restricted";
    return "Active";
  }, [user]);

  if (!user || storeLoading) {
    return (
      <DashboardLayout role="seller">
        <div className="p-6">
          <PageLoadingState title="Loading seller settings..." />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role="seller">
      <div className="p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Settings</h1>
          <p className="text-muted-foreground">Manage your seller account and payout details.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <Card data-testid="card-account-status" className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5" />
                Seller Account Status
              </CardTitle>
              <CardDescription>
                A quick view of your account, store, and payout status.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Seller Approval</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={user.isApproved === false ? "secondary" : "default"}>{storeApprovalLabel}</Badge>
                  {user.isActive === false && <Badge variant="destructive">Access Limited</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Your seller account is ready to use.
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Store Profile</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={store?.id ? "default" : "secondary"}>{store?.name?.trim() ? "Connected" : "Needs Review"}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {store?.name?.trim()
                    ? `Store: ${store.name}`
                    : "Add your store details so customers can see the right information."}
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Payout Setup</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant={storePayoutReady ? "default" : "secondary"}>
                    {storePayoutReady ? "Configured" : "Setup Required"}
                  </Badge>
                  {store?.payoutType === "mobile_money" && <Badge variant="outline">Mobile Money</Badge>}
                  {store?.payoutType === "bank_account" && <Badge variant="outline">Bank Account</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {storePayoutReady
                    ? "Your payout details are ready, so future payouts can be sent to this saved account."
                    : "Complete your payout setup so your earnings can be sent without delays."}
                </p>
              </div>

              <div className="rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">Notifications</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge variant="outline">{unreadSummary?.count ?? 0} unread</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Check here for new messages, updates, and payout alerts.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-payout-methods">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Payout Options
              </CardTitle>
              <CardDescription>
                Choose how you want to receive your money.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-xl border p-4">
                <p className="font-medium">Mobile Money</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your Ghana mobile money number so your payouts can be sent to the right wallet.</p>
              </div>
              {allowSellerBankPayouts !== false && (
                <div className="rounded-xl border p-4">
                  <p className="font-medium">Bank Account</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Use your bank account details to get paid.
                  </p>
                </div>
              )}
              <Button onClick={() => navigate("/seller/payment-setup")} data-testid="button-open-payout-setup">
                Open Payout Setup
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="card-workspace-shortcuts" className="lg:col-span-3">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <SettingsIcon className="h-5 w-5" />
                Seller Workspace Shortcuts
              </CardTitle>
              <CardDescription>
                Quick links to the seller tools you use most.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/products")} data-testid="button-open-products">
                <Package className="h-4 w-4" />
                Products
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/categories")} data-testid="button-open-categories">
                <FolderTree className="h-4 w-4" />
                Categories
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/media-library")} data-testid="button-open-media-library">
                <ImageIcon className="h-4 w-4" />
                Media Library
              </Button>
              {allowSellerDirectSupportMessages ? (
                <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/messages")} data-testid="button-open-messages">
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </Button>
              ) : (
                <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/support")} data-testid="button-open-support">
                  <MessageSquare className="h-4 w-4" />
                  Contact Support
                </Button>
              )}
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/seller/notifications")} data-testid="button-open-notifications">
                <Bell className="h-4 w-4" />
                Notifications
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/profile")} data-testid="button-edit-profile">
                <Store className="h-4 w-4" />
                Edit Store Profile
              </Button>
              <Button variant="outline" className="justify-start gap-2" onClick={() => navigate("/change-password")} data-testid="button-change-password">
                <SettingsIcon className="h-4 w-4" />
                Change Password
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
