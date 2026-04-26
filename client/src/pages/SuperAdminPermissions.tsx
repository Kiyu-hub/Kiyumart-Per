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
import { Loader2, Shield, ArrowLeft, Save, Search, ShieldCheck, Sparkles, ChevronDown, ChevronRight, Users, UserCog, Truck, Package, HeadphonesIcon, CheckCircle2, XCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { getRoleDisplayName } from "@/lib/roleLabels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  "users.approve": { label: "Approve Applications", description: "Approve marketplace applications", category: "User Management" },
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
  "deliveries.view": { label: "View Deliveries", description: "View delivery operations", category: "Operations" },
  "deliveries.manage": { label: "Manage Deliveries", description: "Update delivery lifecycle", category: "Operations" },
  "tracking.update": { label: "Update Tracking", description: "Update live delivery tracking", category: "Operations" },
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
    "orders.create": true,
    "products.create": true,
    "products.edit": true,
    "products.delete": true,
    "orders.view": true,
    "orders.manage": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
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
  pickup_agent: {
    "orders.view": true,
    "support.view": true,
    "profile.manage": true,
  },
  buyer: {
    "orders.create": true,
    "orders.view": true,
    "messages.view": true,
    "messages.send": true,
    "support.view": true,
    "wishlist.manage": true,
    "profile.manage": true,
    "maps.view": true,
  },
};

const ROLE_OPTIONS = ["super_admin", "admin", "pickup_agent", "agent", "seller", "rider", "buyer"] as const;

const ROLE_SUMMARIES: Record<string, { icon: React.ElementType; color: string; summary: string; capabilities: string[] }> = {
  super_admin: {
    icon: Shield,
    color: "text-emerald-600",
    summary: "The highest-privilege role on the platform. Super Admin has absolute, unrestricted access to every feature, page, and configuration. Cannot be restricted.",
    capabilities: [
      "Full access to all platform settings and configuration",
      "Create, edit, and delete any admin or user account",
      "Manage all orders, products, stores, and categories",
      "Approve and reject applications for sellers, riders, and agents",
      "View and approve all payouts (seller and rider)",
      "Toggle permissions for all other roles including other admins",
      "Access all analytics, reports, and financial data",
      "Configure referral programme, pricing, and commissions",
      "Trigger deployments and manage infrastructure settings",
    ],
  },
  admin: {
    icon: UserCog,
    color: "text-sky-600",
    summary: "Admin has near-equal access to Super Admin by default, with the exception that they cannot manage other admin accounts or view admin-only management sections. Superadmin can restrict any permission individually.",
    capabilities: [
      "Manage all buyers, sellers, riders, and pickup agents (excluding other admins)",
      "View and manage all orders platform-wide",
      "Approve or reject seller and rider applications",
      "Manage all products and product categories",
      "View and manage all store profiles",
      "Access all support conversations and live support dashboard",
      "View platform analytics and financial reports",
      "Manage promotions and advertising placements",
      "Approve seller and rider payouts (if canManagePayouts is on)",
      "Configure delivery zones and pickup stations",
    ],
  },
  seller: {
    icon: Package,
    color: "text-amber-600",
    summary: "Sellers manage their own store, products, and orders. They can communicate with buyers via messages and request payouts for their earnings.",
    capabilities: [
      "Create, edit, and delete their own product listings",
      "View and manage orders for their store",
      "Set up and manage store profile and branding",
      "Create discount coupons and promotions",
      "View store analytics and sales reports",
      "Request payouts for earned commissions",
      "Communicate with buyers via the messaging system",
      "Respond to reviews on their products",
    ],
  },
  rider: {
    icon: Truck,
    color: "text-violet-600",
    summary: "Riders handle deliveries assigned to them by the platform. They can update delivery status, view their route, and track their earnings.",
    capabilities: [
      "Accept and manage assigned delivery orders",
      "Update delivery status in real time (picked up, in transit, delivered)",
      "View live map route to buyer address",
      "Communicate with admin and buyers via messages",
      "View personal earnings and payout history",
      "Submit proof of delivery via QR code or OTP",
    ],
  },
  buyer: {
    icon: Users,
    color: "text-rose-600",
    summary: "Buyers browse the platform, make purchases, and track their orders. They can communicate with sellers and the support team.",
    capabilities: [
      "Browse products and stores across the platform",
      "Add items to cart and complete checkout with payment",
      "Track order status and live delivery",
      "Manage a personal wishlist",
      "Submit and view reviews on purchased products",
      "Communicate with sellers and customer support",
      "View order history and download receipts",
    ],
  },
  agent: {
    icon: HeadphonesIcon,
    color: "text-teal-600",
    summary: "Support agents handle customer support tickets and conversations. They assist buyers and sellers with issues on behalf of the platform.",
    capabilities: [
      "View and respond to support tickets and conversations",
      "View buyer and seller profiles for context",
      "Communicate with users via the messaging system",
      "Escalate complex issues to admins",
    ],
  },
  pickup_agent: {
    icon: Package,
    color: "text-orange-600",
    summary: "Pickup agents manage physical pickup stations. They verify and hand over orders to buyers who choose store/station pickup.",
    capabilities: [
      "Verify and confirm order pickups via QR code or OTP",
      "View assigned orders for their pickup station",
      "Manage their availability and shift schedule",
      "View personal performance and earnings",
    ],
  },
};
const INTERNAL_RIDER_ONLY_FEATURE_KEYS = new Set([
  "deliveries.view",
  "deliveries.manage",
  "tracking.update",
]);
const ROLE_DISALLOWED_FEATURES: Record<string, string[]> = {
  seller: ["support.manage"],
  buyer: ["support.manage"],
  rider: ["support.manage"],
  pickup_agent: ["support.manage"],
};

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

const roleLabel = (role: string) => getRoleDisplayName(role);

const sanitizeFeaturesForRole = (role: string, features: Record<string, boolean>) => {
  const sanitized = { ...features };
  for (const key of ROLE_DISALLOWED_FEATURES[role] || []) {
    delete sanitized[key];
  }
  return sanitized;
};

interface AdminPermRecord {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  isActive: boolean | null;
  hasPermissionRecord: boolean;
  permissions: {
    canManageUsers: boolean; canManageProducts: boolean; canManageOrders: boolean;
    canManageStores: boolean; canManageCategories: boolean; canManageAdmins: boolean;
    canEditPasswords: boolean; canManageRoles: boolean; canManagePlatformSettings: boolean;
    canViewAnalytics: boolean; canManagePromotions: boolean; canManageReviews: boolean;
    canManagePayouts: boolean; canViewPayouts: boolean; canManageFeatures: boolean;
  };
}

const ADMIN_PERM_LABELS: { key: keyof AdminPermRecord["permissions"]; label: string; description: string; superAdminOnly?: boolean }[] = [
  { key: "canManageUsers", label: "Manage Users", description: "View, edit, approve, reject buyers/sellers/riders (not other admins)" },
  { key: "canManageProducts", label: "Manage Products", description: "View, edit, approve, delete any product platform-wide" },
  { key: "canManageOrders", label: "Manage Orders", description: "Update order status, assign riders, resolve disputes" },
  { key: "canManageStores", label: "Manage Stores", description: "View and configure seller stores" },
  { key: "canManageCategories", label: "Manage Categories", description: "Create, edit, approve product categories" },
  { key: "canManagePlatformSettings", label: "Platform Settings", description: "Edit platform configuration and settings" },
  { key: "canViewAnalytics", label: "View Analytics", description: "Access analytics dashboards and financial reports" },
  { key: "canManagePromotions", label: "Manage Promotions", description: "Create and manage promotions and ad placements" },
  { key: "canManageReviews", label: "Manage Reviews", description: "Moderate and manage product reviews" },
  { key: "canManagePayouts", label: "Manage Payouts", description: "Approve and process seller and rider payouts" },
  { key: "canViewPayouts", label: "View Payouts", description: "View payout queues and history" },
  { key: "canManageFeatures", label: "Manage Feature Flags", description: "Toggle role features and platform capabilities", superAdminOnly: true },
  { key: "canManageAdmins", label: "Manage Admins", description: "Create and manage admin accounts (super admin territory)", superAdminOnly: true },
  { key: "canEditPasswords", label: "Edit Passwords", description: "Reset or override any user password", superAdminOnly: true },
  { key: "canManageRoles", label: "Manage Roles", description: "Modify role policy and assignments", superAdminOnly: true },
];

function AdminPermissionsSection() {
  const { toast } = useToast();
  const [expandedAdmin, setExpandedAdmin] = useState<string | null>(null);
  const [pendingChanges, setPendingChanges] = useState<Record<string, Partial<AdminPermRecord["permissions"]>>>({});

  const { data: admins = [], isLoading, refetch } = useQuery<AdminPermRecord[]>({
    queryKey: ["/api/admin/permissions"],
    queryFn: () => fetch("/api/admin/permissions", { credentials: "include" }).then((r) => r.json()),
    staleTime: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: async ({ userId, updates }: { userId: string; updates: Record<string, boolean> }) => {
      const res = await fetch(`/api/admin/permissions/${userId}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || "Save failed"); }
      return res.json();
    },
    onSuccess: (_, { userId }) => {
      toast({ title: "Permissions saved", description: "Admin permissions updated successfully." });
      setPendingChanges((prev) => { const next = { ...prev }; delete next[userId]; return next; });
      refetch();
    },
    onError: (err: any) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const onlineAdmins = admins.filter((a) => a.role === "admin");

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (onlineAdmins.length === 0) return <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No admin users found.</CardContent></Card>;

  return (
    <div className="space-y-3">
      {onlineAdmins.map((admin) => {
        const isOpen = expandedAdmin === admin.id;
        const local = { ...admin.permissions, ...(pendingChanges[admin.id] || {}) };
        const hasPending = Object.keys(pendingChanges[admin.id] || {}).length > 0;
        const enabledCount = ADMIN_PERM_LABELS.filter((p) => local[p.key]).length;
        return (
          <Card key={admin.id} className="border-border/70">
            <div
              className="flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-muted/30 transition-colors rounded-xl"
              onClick={() => setExpandedAdmin(isOpen ? null : admin.id)}
            >
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                <div>
                  <p className="font-medium text-sm">{admin.name || admin.email}</p>
                  <p className="text-xs text-muted-foreground">{admin.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {hasPending && <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">Unsaved</Badge>}
                <Badge variant="secondary" className="text-xs">{enabledCount}/{ADMIN_PERM_LABELS.length} on</Badge>
                <div className={`h-2 w-2 rounded-full ${admin.isActive ? "bg-emerald-500" : "bg-muted"}`} />
              </div>
            </div>
            {isOpen && (
              <CardContent className="pt-0 space-y-4 border-t">
                <div className="grid gap-2 sm:grid-cols-2 pt-4">
                  {ADMIN_PERM_LABELS.map(({ key, label, description, superAdminOnly }) => {
                    const isOn = !!local[key];
                    return (
                      <div key={key} className={`flex items-start justify-between rounded-lg border px-3 py-2.5 ${superAdminOnly ? "opacity-60" : ""}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-xs font-medium truncate">{label}</p>
                            {superAdminOnly && <Badge variant="secondary" className="text-[9px] px-1 py-0">SA Only</Badge>}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{description}</p>
                        </div>
                        <Switch
                          checked={isOn}
                          disabled={superAdminOnly}
                          onCheckedChange={(checked) => {
                            setPendingChanges((prev) => ({
                              ...prev,
                              [admin.id]: { ...(prev[admin.id] || {}), [key]: checked },
                            }));
                          }}
                          className="ml-3 shrink-0"
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={!hasPending || saveMutation.isPending}
                    onClick={() => saveMutation.mutate({ userId: admin.id, updates: pendingChanges[admin.id] as any })}
                  >
                    {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save Changes
                  </Button>
                  {hasPending && (
                    <Button size="sm" variant="ghost" onClick={() => setPendingChanges((prev) => { const n = { ...prev }; delete n[admin.id]; return n; })}>
                      Discard
                    </Button>
                  )}
                </div>
              </CardContent>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function RoleInfoPanel({ role, features }: { role: string; features: Record<string, boolean> }) {
  const [open, setOpen] = useState(true);
  const info = ROLE_SUMMARIES[role];
  if (!info) return null;
  const Icon = info.icon;

  const allPermKeys = Object.keys(features);
  const enabledKeys = allPermKeys.filter((k) => features[k]);
  const disabledKeys = allPermKeys.filter((k) => !features[k]);

  return (
    <Card className="border-border/70 bg-muted/20">
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-card border ${info.color}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-sm">{getRoleDisplayName(role)} — Capabilities & Permissions</p>
            <p className="text-xs text-muted-foreground">{enabledKeys.length} enabled · {disabledKeys.length} disabled</p>
          </div>
        </div>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </div>
      {open && (
        <CardContent className="pt-0 border-t space-y-4">
          <p className="text-sm text-muted-foreground pt-4 leading-relaxed">{info.summary}</p>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">What this role can do</p>
            <ul className="space-y-1.5">
              {info.capabilities.map((cap, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-500" />
                  <span>{cap}</span>
                </li>
              ))}
            </ul>
          </div>
          {(enabledKeys.length > 0 || disabledKeys.length > 0) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current Permission State</p>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {allPermKeys.map((key) => {
                  const isOn = features[key];
                  const manifest = FEATURE_MANIFEST[key];
                  return (
                    <div key={key} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${isOn ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30" : "border-border/60 bg-muted/30"}`}>
                      {isOn
                        ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        : <XCircle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <span className={isOn ? "text-foreground font-medium" : "text-muted-foreground"}>
                        {manifest?.label || key}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

export default function SuperAdminPermissions() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  const [selectedRole, setSelectedRole] = useState<string>("admin");
  const [localFeatures, setLocalFeatures] = useState<Record<string, boolean>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [featureSearch, setFeatureSearch] = useState("");

  const isSuperAdminRole = selectedRole === "super_admin";
  const visibleRoleOptions = useMemo(
    () => (showInternalRiderFeatures ? ROLE_OPTIONS : ROLE_OPTIONS.filter((role) => role !== "rider")),
    [showInternalRiderFeatures],
  );

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "super_admin")) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  useEffect(() => {
    if (!showInternalRiderFeatures && selectedRole === "rider") {
      setSelectedRole("admin");
    }
  }, [selectedRole, showInternalRiderFeatures]);

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
    const base = sanitizeFeaturesForRole(selectedRole, {
      ...(DEFAULT_FEATURES[selectedRole] || {}),
      ...(currentRole?.features || {}),
    });
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

    if (!showInternalRiderFeatures) {
      if (merged["users.approve"]) {
        merged["users.approve"] = {
          ...merged["users.approve"],
          description: "Approve seller applications",
        };
      }
      if (merged["tracking.update"]) {
        merged["tracking.update"] = {
          ...merged["tracking.update"],
          description: "Update delivery tracking",
        };
      }
    }

    return merged;
  }, [localFeatures, roleFeatures, showInternalRiderFeatures]);

  const featuresByCategory = useMemo(() => {
    const grouped: Record<string, string[]> = {};
    const query = featureSearch.trim().toLowerCase();
    const allKeys = Object.keys(mergedFeatureManifest).filter(
      (key) => showInternalRiderFeatures || !INTERNAL_RIDER_ONLY_FEATURE_KEYS.has(key),
    );

    for (const key of allKeys) {
      if ((ROLE_DISALLOWED_FEATURES[selectedRole] || []).includes(key)) continue;
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
        : sanitizeFeaturesForRole(selectedRole, localFeatures);

    updateFeaturesMutation.mutate({
      role: selectedRole,
      features: payload,
    });
  };

  const handleReset = () => {
    const currentRole = roleFeatures.find((rf) => rf.role === selectedRole);
    const base = sanitizeFeaturesForRole(selectedRole, {
      ...(DEFAULT_FEATURES[selectedRole] || {}),
      ...(currentRole?.features || {}),
    });
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
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <Card className="overflow-hidden border-border/70 bg-card shadow-sm dark:border-primary/25 dark:bg-gradient-to-r dark:from-primary/10 dark:via-background dark:to-sky-500/10">
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
                  Manage role capabilities and individually control what each admin can access.
                </p>
                <div className="flex gap-2 flex-wrap">
                  <Badge className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-600 dark:text-white">
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

        {/* ── Main tabs ──────────────────────────────────────────────────────── */}
        <Tabs defaultValue="role-features" className="space-y-6">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="role-features" className="flex-1 sm:flex-none gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Role Features
            </TabsTrigger>
            <TabsTrigger value="admin-permissions" className="flex-1 sm:flex-none gap-1.5">
              <UserCog className="h-3.5 w-3.5" />
              Individual Admin Permissions
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Role Features ─────────────────────────────────────────── */}
          <TabsContent value="role-features" className="space-y-6 mt-0">
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
                  {visibleRoleOptions.map((role) => (
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

            {/* Role info panel — collapsible summary + capabilities + live state */}
            <RoleInfoPanel role={selectedRole} features={localFeatures} />

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
                          const isRiderMapLock = showInternalRiderFeatures && selectedRole === "rider" && featureKey === "maps.view";
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
          </TabsContent>

          {/* ── Tab 2: Individual Admin Permissions ─────────────────────────── */}
          <TabsContent value="admin-permissions" className="space-y-4 mt-0">
            <div>
              <h2 className="text-lg font-semibold">Individual Admin Permissions</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Override the default access level for each admin individually. Superadmin-only gates (Manage Admins, Edit Passwords, Manage Roles, Feature Flags) cannot be granted to admins.
              </p>
            </div>
            <AdminPermissionsSection />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
