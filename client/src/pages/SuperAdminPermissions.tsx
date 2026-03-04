import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, ArrowLeft, Save, Search, ShieldCheck, Sparkles } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface RoleFeature {
  id: string;
  role: string;
  features: Record<string, boolean>;
  updatedAt: string;
  updatedBy: string;
}

const FEATURE_MANIFEST: Record<string, { label: string; description: string; category: string }> = {
  "products.create": { label: "Create Products", description: "Allow creating new products", category: "Product Management" },
  "products.edit": { label: "Edit Products", description: "Allow editing product details", category: "Product Management" },
  "products.delete": { label: "Delete Products", description: "Allow deleting products", category: "Product Management" },
  "products.viewAll": { label: "View All Products", description: "View products from all sellers", category: "Product Management" },
  "orders.view": { label: "View Orders", description: "View order listings", category: "Order Management" },
  "orders.manage": { label: "Manage Orders", description: "Update order status and details", category: "Order Management" },
  "orders.cancel": { label: "Cancel Orders", description: "Cancel customer orders", category: "Order Management" },
  "users.view": { label: "View Users", description: "Access user listings", category: "User Management" },
  "users.create": { label: "Create Users", description: "Create new user accounts", category: "User Management" },
  "users.edit": { label: "Edit Users", description: "Edit user details", category: "User Management" },
  "users.delete": { label: "Delete Users", description: "Delete user accounts", category: "User Management" },
  "users.approve": { label: "Approve Applications", description: "Approve seller/rider applications", category: "User Management" },
  "settings.view": { label: "View Settings", description: "View platform settings", category: "Platform Settings" },
  "settings.edit": { label: "Edit Settings", description: "Modify platform settings", category: "Platform Settings" },
  "branding.edit": { label: "Edit Branding", description: "Customize platform branding", category: "Platform Settings" },
  "banners.manage": { label: "Manage Banners", description: "Create and edit banners", category: "Content Management" },
  "categories.manage": { label: "Manage Categories", description: "Create and edit categories", category: "Content Management" },
  "promotions.manage": { label: "Manage Promotions", description: "Create and manage promotions/coupons", category: "Content Management" },
  "reviews.manage": { label: "Manage Reviews", description: "Moderate and reply to reviews", category: "Content Management" },
  "analytics.view": { label: "View Analytics", description: "Access analytics and reports", category: "Reports & Analytics" },
  "reports.generate": { label: "Generate Reports", description: "Create custom reports", category: "Reports & Analytics" },
  "messages.view": { label: "View Messages", description: "Access messaging inbox and contacts", category: "Messaging & Support" },
  "messages.send": { label: "Send Messages", description: "Send chat/support messages", category: "Messaging & Support" },
  "support.view": { label: "View Support", description: "Access support conversations", category: "Messaging & Support" },
  "support.manage": { label: "Manage Support", description: "Manage support tickets and responses", category: "Messaging & Support" },
  "store.manage": { label: "Manage Store", description: "Manage store profile and settings", category: "Operations" },
  "deliveries.view": { label: "View Deliveries", description: "View delivery assignments", category: "Operations" },
  "deliveries.manage": { label: "Manage Deliveries", description: "Update delivery lifecycle", category: "Operations" },
  "tracking.update": { label: "Update Tracking", description: "Post rider tracking updates", category: "Operations" },
  "maps.view": { label: "Map Access", description: "Allow user to view map and live tracking interfaces", category: "Operations" },
  "earnings.view": { label: "View Earnings", description: "View earnings and payouts", category: "Operations" },
  "payouts.request": { label: "Request Payouts", description: "Submit payout requests", category: "Operations" },
  "orders.create": { label: "Create Orders", description: "Create checkout orders", category: "Operations" },
  "wishlist.manage": { label: "Manage Wishlist", description: "Add/remove wishlist items", category: "Operations" },
  "profile.manage": { label: "Manage Profile", description: "Update profile details and media", category: "Operations" },
  "canManageUsers": { label: "Manage Users", description: "Manage user accounts and approvals", category: "Administrative Access" },
  "canManageProducts": { label: "Manage Products", description: "Manage product listings platform-wide", category: "Administrative Access" },
  "canManageOrders": { label: "Manage Orders", description: "Manage order lifecycle and issues", category: "Administrative Access" },
  "canManageStores": { label: "Manage Stores", description: "Manage store status and configuration", category: "Administrative Access" },
  "canManageCategories": { label: "Manage Categories", description: "Manage product categories and taxonomy", category: "Administrative Access" },
  "canManageAdmins": { label: "Manage Admins", description: "Create and manage admin accounts", category: "Administrative Access" },
  "canEditPasswords": { label: "Edit Passwords", description: "Reset or update user passwords", category: "Administrative Access" },
  "canManageRoles": { label: "Manage Roles", description: "Modify role assignments and policy", category: "Administrative Access" },
  "canManagePlatformSettings": { label: "Manage Platform Settings", description: "Update global settings", category: "Administrative Access" },
  "canViewAnalytics": { label: "View Analytics", description: "Access analytics dashboards", category: "Administrative Access" },
  "canManagePromotions": { label: "Manage Promotions", description: "Manage promotions and ad placements", category: "Administrative Access" },
  "canManageReviews": { label: "Manage Reviews", description: "Moderate and manage reviews", category: "Administrative Access" },
  "canManagePayouts": { label: "Manage Payouts", description: "Approve and process payouts", category: "Administrative Access" },
  "canViewPayouts": { label: "View Payouts", description: "View payout queues and history", category: "Administrative Access" },
  "canManageFeatures": { label: "Manage Feature Flags", description: "Toggle role and platform features", category: "Administrative Access" },
};

const DEFAULT_FEATURES: Record<string, Record<string, boolean>> = {
  super_admin: {
    canManageUsers: true,
    canManageProducts: true,
    canManageOrders: true,
    canManageStores: true,
    canManageCategories: true,
    canManageAdmins: true,
    canEditPasswords: true,
    canManageRoles: true,
    canManagePlatformSettings: true,
    canViewAnalytics: true,
    canManagePromotions: true,
    canManageReviews: true,
    canManagePayouts: true,
    canViewPayouts: true,
    canManageFeatures: true,
  },
  admin: {
    "products.viewAll": true,
    "orders.view": true,
    "orders.manage": true,
    "users.view": true,
    "users.approve": true,
    "settings.view": true,
    "banners.manage": true,
    "categories.manage": true,
    "promotions.manage": true,
    "reviews.manage": true,
    "analytics.view": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "support.manage": true,
    "profile.manage": true,
    "maps.view": true,
  },
  seller: {
    "products.create": true,
    "products.edit": true,
    "products.delete": true,
    "orders.view": true,
    "orders.manage": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "support.manage": true,
    "store.manage": true,
    "payouts.request": true,
    "promotions.manage": true,
    "reviews.manage": true,
    "analytics.view": true,
    "maps.view": true,
  },
  rider: {
    "orders.view": true,
    "deliveries.view": true,
    "deliveries.manage": true,
    "tracking.update": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "support.manage": true,
    "earnings.view": true,
    "profile.manage": true,
    "maps.view": true,
  },
  agent: {
    "orders.view": true,
    "users.view": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "support.manage": true,
    "profile.manage": true,
    "maps.view": true,
  },
  buyer: {
    "orders.create": true,
    "orders.view": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "support.manage": true,
    "wishlist.manage": true,
    "profile.manage": true,
    "maps.view": true,
  },
};

const ROLE_OPTIONS = ["super_admin", "admin", "agent", "seller", "rider", "buyer"] as const;

const ABSOLUTE_SUPER_ADMIN_KEYS = Array.from(
  new Set([
    ...Object.keys(FEATURE_MANIFEST),
    ...Object.values(DEFAULT_FEATURES).flatMap((record) => Object.keys(record || {})),
    "manage_users",
    "manage_products",
    "manage_orders",
    "manage_stores",
    "manage_categories",
    "manage_admins",
    "edit_passwords",
    "manage_roles",
    "manage_platform_settings",
    "view_analytics",
    "manage_promotions",
    "manage_reviews",
  ]),
);

const roleLabel = (role: string) =>
  role
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export default function SuperAdminPermissions() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [featureSearch, setFeatureSearch] = useState("");

  const isSuperAdminRole = selectedRole === "super_admin";

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "super_admin")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: roleFeatures = [], isLoading } = useQuery<RoleFeature[]>({
    queryKey: ["/api/role-features"],
    queryFn: async () => {
      const res = await fetch("/api/role-features", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch role features");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "super_admin",
  });

  const updateFeaturesMutation = useMutation({
    mutationFn: async ({ role, features }: { role: string; features: Record<string, boolean> }) => {
      return apiRequest("PUT", `/api/role-features/${role}`, { features });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Role permissions updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/role-features"] });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update permissions",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const currentRole = roleFeatures.find((rf) => rf.role === selectedRole);
    const base = { ...(DEFAULT_FEATURES[selectedRole] || {}), ...(currentRole?.features || {}) };
    if (selectedRole === "super_admin") {
      const locked = { ...base };
      Array.from(new Set([...ABSOLUTE_SUPER_ADMIN_KEYS, ...Object.keys(base)])).forEach((key) => {
        locked[key] = true;
      });
      setLocalFeatures(locked);
      setHasChanges(false);
      return;
    }

    setLocalFeatures(base);
    setHasChanges(false);
  }, [selectedRole, roleFeatures]);

  const mergedFeatureManifest = useMemo(() => {
    const merged: Record<string, { label: string; description: string; category: string }> = { ...FEATURE_MANIFEST };
    const discovered = new Set<string>([
      ...Object.keys(merged),
      ...roleFeatures.flatMap((rf) => Object.keys(rf.features || {})),
      ...Object.keys(localFeatures || {}),
    ]);

    discovered.forEach((key) => {
      if (!merged[key]) {
        merged[key] = {
          label: key,
          description: "Dynamically discovered permission key",
          category: "Uncategorized",
        };
      }
    });

    return merged;
  }, [localFeatures, roleFeatures]);

  const featuresByCategory = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    const query = featureSearch.trim().toLowerCase();
    const allKeys = Object.keys(mergedFeatureManifest);

    for (const key of allKeys) {
      const feature = mergedFeatureManifest[key];
      const haystack = `${key} ${feature.label} ${feature.description}`.toLowerCase();
      if (query && !haystack.includes(query)) continue;

      const category = feature.category;
      if (!grouped[category]) grouped[category] = [];
      grouped[category].push(key);
    }

    Object.keys(grouped).forEach((category) => {
      grouped[category] = grouped[category].sort((a, b) =>
        mergedFeatureManifest[a].label.localeCompare(mergedFeatureManifest[b].label),
      );
    });

    return grouped;
  }, [featureSearch, mergedFeatureManifest]);

  const totalFeatureCount = useMemo(
    () => Object.values(featuresByCategory).reduce((sum, list) => sum + list.length, 0),
    [featuresByCategory],
  );
  const enabledFeatureCount = useMemo(
    () =>
      Object.values(featuresByCategory)
        .flat()
        .reduce((sum, key) => sum + (localFeatures[key] ? 1 : 0), 0),
    [featuresByCategory, localFeatures],
  );

  const handleToggleFeature = (featureKey: string, enabled: boolean) => {
    if (isSuperAdminRole) return;
    if (selectedRole === "rider" && featureKey === "maps.view" && !enabled) return;
    setLocalFeatures((prev) => ({ ...prev, [featureKey]: enabled }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const payload =
      selectedRole === "super_admin"
        ? Object.fromEntries(
            Array.from(new Set([...ABSOLUTE_SUPER_ADMIN_KEYS, ...Object.keys(localFeatures)])).map((key) => [key, true]),
          )
        : localFeatures;

    updateFeaturesMutation.mutate({
      role: selectedRole,
      features: payload,
    });
  };

  const handleReset = () => {
    const currentRole = roleFeatures.find((rf) => rf.role === selectedRole);
    const base = { ...(DEFAULT_FEATURES[selectedRole] || {}), ...(currentRole?.features || {}) };
    if (selectedRole === "super_admin") {
      const locked = { ...base };
      Array.from(new Set([...ABSOLUTE_SUPER_ADMIN_KEYS, ...Object.keys(base)])).forEach((key) => {
        locked[key] = true;
      });
      setLocalFeatures(locked);
      setHasChanges(false);
      return;
    }

    setLocalFeatures(base);
    setHasChanges(false);
  };

  if (authLoading || !isAuthenticated || user?.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role="super_admin">
      <div className="p-4 md:p-6 lg:p-8 space-y-6">
        <Card className="border-primary/25 bg-gradient-to-r from-primary/10 via-background to-sky-500/10 overflow-hidden">
          <CardContent className="p-6 md:p-7">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => window.history.back()}
                    data-testid="button-back"
                    className="h-9 w-9"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </Button>
                  <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2" data-testid="heading-permissions">
                    <Shield className="h-7 w-7 text-primary" />
                    Permissions Control Center
                  </h1>
                </div>
                <p className="text-sm md:text-base text-muted-foreground">
                  Manage role-level capabilities from one place. Super Admin access is enforced as absolute.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Badge className="bg-emerald-600 text-white gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Absolute Super Admin
                  </Badge>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    Role-Based Access Matrix
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {(hasChanges || isSuperAdminRole) && (
                  <>
                    {!isSuperAdminRole && (
                      <Button variant="outline" onClick={handleReset} data-testid="button-reset">
                        Reset
                      </Button>
                    )}
                    <Button
                      onClick={handleSave}
                      disabled={updateFeaturesMutation.isPending}
                      data-testid="button-save"
                      className="gap-2"
                    >
                      {updateFeaturesMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {isSuperAdminRole ? "Reinforce Super Admin Access" : "Save Changes"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Selected Role</p>
              <p className="mt-2 text-xl font-semibold">{roleLabel(selectedRole)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Enabled Features</p>
              <p className="mt-2 text-xl font-semibold">
                {enabledFeatureCount} / {totalFeatureCount || 0}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Permission Groups</p>
              <p className="mt-2 text-xl font-semibold">{Object.keys(featuresByCategory).length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Role Selection</CardTitle>
            <CardDescription>Choose a role and manage its feature access matrix</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              {ROLE_OPTIONS.map((role) => (
                <Button
                  key={role}
                  variant={selectedRole === role ? "default" : "outline"}
                  onClick={() => setSelectedRole(role)}
                  data-testid={`button-role-${role}`}
                  className={cn(selectedRole === role && "shadow-sm")}
                >
                  {roleLabel(role)}
                </Button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={featureSearch}
                onChange={(e) => setFeatureSearch(e.target.value)}
                placeholder="Search permissions by name, key, or description..."
                className="pl-9"
                data-testid="input-search-features"
              />
            </div>
          </CardContent>
        </Card>

        {isSuperAdminRole && (
          <Card className="border-emerald-500/30 bg-emerald-500/5">
            <CardContent className="p-4 text-sm text-emerald-700 dark:text-emerald-300">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Super Admin role is locked to full access. Toggles are disabled and the backend enforces all permissions as enabled.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : totalFeatureCount === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No permissions matched your search.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-2">
            {Object.keys(featuresByCategory)
              .sort((a, b) => a.localeCompare(b))
              .map((category) => (
                <Card key={category} className="border-border/70">
                  <CardHeader>
                    <CardTitle className="text-lg">{category}</CardTitle>
                    <CardDescription>{featuresByCategory[category].length} permissions</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {featuresByCategory[category].map((featureKey) => {
                      const feature = mergedFeatureManifest[featureKey];
                      const isEnabled = !!localFeatures[featureKey];
                      const isRiderMapLock = selectedRole === "rider" && featureKey === "maps.view";
                      return (
                        <div key={featureKey} className="rounded-lg border bg-card/50 px-3 py-2.5">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <Label
                                htmlFor={featureKey}
                                className="text-sm font-medium cursor-pointer"
                                data-testid={`label-${featureKey}`}
                              >
                                {feature.label}
                              </Label>
                              <p className="text-xs text-muted-foreground mt-1">
                                {feature.description}
                                {isRiderMapLock ? " (Rider map access is always enabled)." : ""}
                              </p>
                              <p className="text-[11px] text-muted-foreground/80 mt-1 font-mono">{featureKey}</p>
                            </div>
                            <Switch
                              id={featureKey}
                              checked={isEnabled}
                              disabled={isSuperAdminRole || isRiderMapLock}
                              onCheckedChange={(checked) => handleToggleFeature(featureKey, checked)}
                              data-testid={`switch-${featureKey}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
