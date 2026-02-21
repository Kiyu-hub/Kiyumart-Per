import { useEffect, useState } from "react";
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
import { Loader2, Shield, ArrowLeft, Save } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface RoleFeature {
  id: string;
  role: string;
  features: Record<string, boolean>;
  updatedAt: string;
  updatedBy: string;
}

interface AdminPermissionPayload {
  canManageUsers: boolean;
  canManageProducts: boolean;
  canManageOrders: boolean;
  canManageStores: boolean;
  canManageCategories: boolean;
  canManageAdmins: boolean;
  canEditPasswords: boolean;
  canManageRoles: boolean;
  canManagePlatformSettings: boolean;
  canViewAnalytics: boolean;
  canManagePromotions: boolean;
  canManageReviews: boolean;
  maxProductsPerDay: number;
  maxOrdersPerDay: number;
}

interface AdminPermissionUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "super_admin";
  isActive: boolean;
  isApproved: boolean;
  hasPermissionRecord: boolean;
  permissions: AdminPermissionPayload;
}

// Feature manifest defining all available features by role
const FEATURE_MANIFEST: Record<string, { label: string; description: string; category: string }> = {
  // Product Management
  "products.create": { label: "Create Products", description: "Allow creating new products", category: "Product Management" },
  "products.edit": { label: "Edit Products", description: "Allow editing product details", category: "Product Management" },
  "products.delete": { label: "Delete Products", description: "Allow deleting products", category: "Product Management" },
  "products.viewAll": { label: "View All Products", description: "View products from all sellers", category: "Product Management" },
  
  // Order Management
  "orders.view": { label: "View Orders", description: "View order listings", category: "Order Management" },
  "orders.manage": { label: "Manage Orders", description: "Update order status and details", category: "Order Management" },
  "orders.cancel": { label: "Cancel Orders", description: "Cancel customer orders", category: "Order Management" },
  
  // User Management
  "users.view": { label: "View Users", description: "Access user listings", category: "User Management" },
  "users.create": { label: "Create Users", description: "Create new user accounts", category: "User Management" },
  "users.edit": { label: "Edit Users", description: "Edit user details", category: "User Management" },
  "users.delete": { label: "Delete Users", description: "Delete user accounts", category: "User Management" },
  "users.approve": { label: "Approve Applications", description: "Approve seller/rider applications", category: "User Management" },
  
  // Platform Settings
  "settings.view": { label: "View Settings", description: "View platform settings", category: "Platform Settings" },
  "settings.edit": { label: "Edit Settings", description: "Modify platform settings", category: "Platform Settings" },
  "branding.edit": { label: "Edit Branding", description: "Customize platform branding", category: "Platform Settings" },
  
  // Content Management
  "banners.manage": { label: "Manage Banners", description: "Create and edit banners", category: "Content Management" },
  "categories.manage": { label: "Manage Categories", description: "Create and edit categories", category: "Content Management" },
  "promotions.manage": { label: "Manage Promotions", description: "Create and manage promotions/coupons", category: "Content Management" },
  "reviews.manage": { label: "Manage Reviews", description: "Moderate and reply to reviews", category: "Content Management" },
  
  // Reports & Analytics
  "analytics.view": { label: "View Analytics", description: "Access analytics and reports", category: "Reports & Analytics" },
  "reports.generate": { label: "Generate Reports", description: "Create custom reports", category: "Reports & Analytics" },

  // Messaging & Support
  "messages.view": { label: "View Messages", description: "Access messaging inbox and contacts", category: "Messaging & Support" },
  "messages.send": { label: "Send Messages", description: "Send chat/support messages", category: "Messaging & Support" },
  "support.view": { label: "View Support", description: "Access support conversations", category: "Messaging & Support" },
  "support.manage": { label: "Manage Support", description: "Manage support tickets and responses", category: "Messaging & Support" },

  // Store / Delivery / Payout Operations
  "store.manage": { label: "Manage Store", description: "Manage store profile and settings", category: "Operations" },
  "deliveries.view": { label: "View Deliveries", description: "View delivery assignments", category: "Operations" },
  "deliveries.manage": { label: "Manage Deliveries", description: "Update delivery lifecycle", category: "Operations" },
  "tracking.update": { label: "Update Tracking", description: "Post rider tracking updates", category: "Operations" },
  "earnings.view": { label: "View Earnings", description: "View earnings and payouts", category: "Operations" },
  "payouts.request": { label: "Request Payouts", description: "Submit payout requests", category: "Operations" },
  "orders.create": { label: "Create Orders", description: "Create checkout orders", category: "Operations" },
  "wishlist.manage": { label: "Manage Wishlist", description: "Add/remove wishlist items", category: "Operations" },
  "profile.manage": { label: "Manage Profile", description: "Update profile details and media", category: "Operations" },

  // Administrative Access (legacy key compatibility and expanded controls)
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
  },
  seller: {
    "products.create": true,
    "products.edit": true,
    "products.delete": true,
    "orders.view": true,
    "orders.manage": true,
    "messages.view": true,
    "messages.send": true,
    "store.manage": true,
    "payouts.request": true,
    "promotions.manage": true,
    "reviews.manage": true,
    "analytics.view": true,
  },
  rider: {
    "orders.view": true,
    "deliveries.view": true,
    "deliveries.manage": true,
    "tracking.update": true,
    "messages.view": true,
    "messages.send": true,
    "earnings.view": true,
    "profile.manage": true,
  },
  agent: {
    "orders.view": true,
    "users.view": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "support.manage": true,
    "profile.manage": true,
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
  },
};

export default function SuperAdminPermissions() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [selectedAdminId, setSelectedAdminId] = useState<string>("");
  const [localAdminPermissions, setLocalAdminPermissions] = useState<AdminPermissionPayload | null>(null);
  const [adminHasChanges, setAdminHasChanges] = useState(false);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "super_admin")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: roleFeatures = [], isLoading } = useQuery<RoleFeature[]>({
    queryKey: ["/api/role-features"],
    queryFn: async () => {
      const res = await fetch("/api/role-features", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch role features");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "super_admin",
  });

  const { data: adminPermissionUsers = [], isLoading: adminPermissionsLoading } = useQuery<AdminPermissionUser[]>({
    queryKey: ["/api/admin/permissions"],
    queryFn: async () => {
      const res = await fetch("/api/admin/permissions", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch admin permissions");
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

  const updateAdminPermissionsMutation = useMutation({
    mutationFn: async ({ userId, permissions }: { userId: string; permissions: AdminPermissionPayload }) => {
      const res = await apiRequest("PUT", `/api/admin/permissions/${userId}`, permissions);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Admin permissions updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/permissions"] });
      setAdminHasChanges(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update admin permissions",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    const currentRole = roleFeatures.find(rf => rf.role === selectedRole);
    if (currentRole) {
      setLocalFeatures(currentRole.features);
    } else {
      // Load defaults if no configuration exists
      setLocalFeatures(DEFAULT_FEATURES[selectedRole] || {});
    }
    setHasChanges(false);
  }, [selectedRole, roleFeatures]);

  useEffect(() => {
    if (adminPermissionUsers.length === 0) {
      setSelectedAdminId("");
      setLocalAdminPermissions(null);
      setAdminHasChanges(false);
      return;
    }

    const activeId = selectedAdminId || adminPermissionUsers[0].id;
    const selected = adminPermissionUsers.find((u) => u.id === activeId) || adminPermissionUsers[0];
    setSelectedAdminId(selected.id);
    setLocalAdminPermissions({ ...selected.permissions });
    setAdminHasChanges(false);
  }, [adminPermissionUsers, selectedAdminId]);

  const handleToggleFeature = (featureKey: string, enabled: boolean) => {
    setLocalFeatures(prev => ({ ...prev, [featureKey]: enabled }));
    setHasChanges(true);
  };

  const handleSave = () => {
    updateFeaturesMutation.mutate({
      role: selectedRole,
      features: localFeatures,
    });
  };

  const handleReset = () => {
    const currentRole = roleFeatures.find(rf => rf.role === selectedRole);
    if (currentRole) {
      setLocalFeatures(currentRole.features);
    } else {
      setLocalFeatures(DEFAULT_FEATURES[selectedRole] || {});
    }
    setHasChanges(false);
  };

  const handleSelectAdmin = (adminId: string) => {
    const selected = adminPermissionUsers.find((u) => u.id === adminId);
    if (!selected) return;
    setSelectedAdminId(adminId);
    setLocalAdminPermissions({ ...selected.permissions });
    setAdminHasChanges(false);
  };

  const handleToggleAdminPermission = (key: keyof AdminPermissionPayload, value: boolean) => {
    setLocalAdminPermissions((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: value };
    });
    setAdminHasChanges(true);
  };

  const handleAdminLimitChange = (key: "maxProductsPerDay" | "maxOrdersPerDay", value: string) => {
    const parsed = Number(value);
    setLocalAdminPermissions((prev) => {
      if (!prev) return prev;
      return { ...prev, [key]: Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0 };
    });
    setAdminHasChanges(true);
  };

  const handleSaveAdminPermissions = () => {
    if (!selectedAdminId || !localAdminPermissions) return;
    updateAdminPermissionsMutation.mutate({
      userId: selectedAdminId,
      permissions: localAdminPermissions,
    });
  };

  const handleResetAdminPermissions = () => {
    const selected = adminPermissionUsers.find((u) => u.id === selectedAdminId);
    if (!selected) return;
    setLocalAdminPermissions({ ...selected.permissions });
    setAdminHasChanges(false);
  };

  if (authLoading || !isAuthenticated || user?.role !== "super_admin") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Group features by category
  const mergedFeatureManifest: Record<string, { label: string; description: string; category: string }> = {
    ...FEATURE_MANIFEST,
  };
  const featuresByCategory: Record<string, string[]> = {};
  const discoveredFeatureKeys = Array.from(
    new Set([
      ...Object.keys(mergedFeatureManifest),
      ...roleFeatures.flatMap((rf) => Object.keys(rf.features || {})),
      ...Object.keys(localFeatures || {}),
    ]),
  );
  discoveredFeatureKeys.forEach((key) => {
    if (!mergedFeatureManifest[key]) {
      mergedFeatureManifest[key] = {
        label: key,
        description: "Dynamically discovered permission key",
        category: "Uncategorized",
      };
    }
    const category = mergedFeatureManifest[key].category;
    if (!featuresByCategory[category]) {
      featuresByCategory[category] = [];
    }
    featuresByCategory[category].push(key);
  });

  return (
    <DashboardLayout role="super_admin">
      <div className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-2" data-testid="heading-permissions">
              <Shield className="h-8 w-8 text-primary" />
              Role Permissions Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure feature access for different user roles
            </p>
          </div>
          {hasChanges && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleReset}
                data-testid="button-reset"
              >
                Reset
              </Button>
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
                Save Changes
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6">
          {/* Role Selection */}
          <Card>
            <CardHeader>
              <CardTitle>Select Role</CardTitle>
              <CardDescription>Choose a role to configure its permissions</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 flex-wrap">
                {["super_admin", "admin", "agent", "seller", "rider", "buyer"].map((role) => (
                  <Button
                    key={role}
                    variant={selectedRole === role ? "default" : "outline"}
                    onClick={() => setSelectedRole(role)}
                    data-testid={`button-role-${role}`}
                  >
                    {role
                      .split("_")
                      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
                      .join(" ")}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Features by Category */}
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid gap-4">
              {Object.keys(featuresByCategory).map((category) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="text-lg">{category}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {featuresByCategory[category].map((featureKey) => {
                      const feature = mergedFeatureManifest[featureKey];
                      const isEnabled = localFeatures[featureKey] || false;
                      
                      return (
                        <div key={featureKey} className="flex items-center justify-between space-x-4">
                          <div className="flex-1">
                            <Label
                              htmlFor={featureKey}
                              className="text-base font-medium cursor-pointer"
                              data-testid={`label-${featureKey}`}
                            >
                              {feature.label}
                            </Label>
                            <p className="text-sm text-muted-foreground">
                              {feature.description}
                            </p>
                          </div>
                          <Switch
                            id={featureKey}
                            checked={isEnabled}
                            onCheckedChange={(checked) => handleToggleFeature(featureKey, checked)}
                            data-testid={`switch-${featureKey}`}
                          />
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Per-Admin Permissions (admin_permissions table) */}
          <Card>
            <CardHeader>
              <CardTitle>Per-Admin Permission Controls</CardTitle>
              <CardDescription>
                Super admin controls for individual admin/super admin permission flags and operation limits.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {adminPermissionsLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : adminPermissionUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No admin or super admin users found.</p>
              ) : (
                <>
                  <div className="flex gap-2 flex-wrap">
                    {adminPermissionUsers.map((adminUser) => (
                      <Button
                        key={adminUser.id}
                        variant={selectedAdminId === adminUser.id ? "default" : "outline"}
                        onClick={() => handleSelectAdmin(adminUser.id)}
                        data-testid={`button-admin-user-${adminUser.id}`}
                      >
                        {adminUser.name || adminUser.email} ({adminUser.role})
                      </Button>
                    ))}
                  </div>

                  {localAdminPermissions && (
                    <div className="grid gap-4">
                      {(
                        [
                          ["canManageUsers", "Manage Users"],
                          ["canManageProducts", "Manage Products"],
                          ["canManageOrders", "Manage Orders"],
                          ["canManageStores", "Manage Stores"],
                          ["canManageCategories", "Manage Categories"],
                          ["canManageAdmins", "Manage Admins"],
                          ["canEditPasswords", "Edit Passwords"],
                          ["canManageRoles", "Manage Roles"],
                          ["canManagePlatformSettings", "Manage Platform Settings"],
                          ["canViewAnalytics", "View Analytics"],
                          ["canManagePromotions", "Manage Promotions"],
                          ["canManageReviews", "Manage Reviews"],
                        ] as Array<[keyof AdminPermissionPayload, string]>
                      ).map(([key, label]) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                          <Label htmlFor={`admin-perm-${key}`} className="text-sm font-medium">
                            {label}
                          </Label>
                          <Switch
                            id={`admin-perm-${key}`}
                            checked={!!localAdminPermissions[key]}
                            onCheckedChange={(checked) => handleToggleAdminPermission(key, checked)}
                            data-testid={`switch-admin-${key}`}
                          />
                        </div>
                      ))}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                          <Label htmlFor="maxProductsPerDay">Max Products Per Day</Label>
                          <Input
                            id="maxProductsPerDay"
                            type="number"
                            min={0}
                            value={localAdminPermissions.maxProductsPerDay}
                            onChange={(e) => handleAdminLimitChange("maxProductsPerDay", e.target.value)}
                            data-testid="input-max-products-per-day"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="maxOrdersPerDay">Max Orders Per Day</Label>
                          <Input
                            id="maxOrdersPerDay"
                            type="number"
                            min={0}
                            value={localAdminPermissions.maxOrdersPerDay}
                            onChange={(e) => handleAdminLimitChange("maxOrdersPerDay", e.target.value)}
                            data-testid="input-max-orders-per-day"
                          />
                        </div>
                      </div>

                      {adminHasChanges && (
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={handleResetAdminPermissions}
                            data-testid="button-reset-admin-permissions"
                          >
                            Reset
                          </Button>
                          <Button
                            onClick={handleSaveAdminPermissions}
                            disabled={updateAdminPermissionsMutation.isPending}
                            className="gap-2"
                            data-testid="button-save-admin-permissions"
                          >
                            {updateAdminPermissionsMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4" />
                            )}
                            Save Admin Permissions
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
