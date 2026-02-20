import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { apiRequest, queryClient } from "@/lib/queryClient";
import DashboardSidebar from "@/components/DashboardSidebar";
import MetricCard from "@/components/MetricCard";
import ProductCard from "@/components/ProductCard";
import ThemeToggle from "@/components/ThemeToggle";
import { DollarSign, Package, ShoppingBag, TrendingUp, Loader2, AlertCircle, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";

interface Analytics {
  totalOrders: number;
  totalRevenue: number;
}

interface Product {
  id: string;
  name: string;
  price: string;
  images: string[];
  discount: number | null;
  sellerId: string;
  isActive: boolean;
}

interface Order {
  id: string;
  status: string;
  sellerId: string;
}

interface SellerProfileSummary {
  storeType?: string | null;
  storeName?: string | null;
  storeDescription?: string | null;
  storeBanner?: string | null;
  businessAddress?: string | null;
}

interface Coupon {
  id: string;
  code: string;
  sellerId: string;
  discountType: "percentage" | "fixed";
  discountValue: string;
  minimumPurchase: string;
  usageLimit: number | null;
  usedCount: number;
  expiryDate: string | null;
  isActive: boolean;
  createdAt: string;
}

const couponFormSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").toUpperCase(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.string().min(1, "Discount value is required"),
  minimumPurchase: z.string().optional(),
  usageLimit: z.string().optional(),
  expiryDate: z.string().optional(),
  isActive: z.boolean().default(true),
}).refine((data) => {
  if (data.discountType === "percentage") {
    const value = parseFloat(data.discountValue);
    return value >= 0 && value <= 100;
  }
  return true;
}, {
  message: "Percentage discount must be between 0 and 100",
  path: ["discountValue"],
});

type CouponFormData = z.infer<typeof couponFormSchema>;

const SELLER_NAV_ROUTES: Record<string, string> = {
  "media-library": "/seller/media-library",
  products: "/seller/products",
  orders: "/seller/orders",
  deliveries: "/seller/deliveries",
  "payment-setup": "/seller/payment-setup",
  messages: "/seller/messages",
  analytics: "/seller/analytics",
  settings: "/seller/settings",
  notifications: "/seller/notifications",
  support: "/support",
  "my-cart": "/cart",
  "my-purchases": "/orders",
  "my-wishlist": "/wishlist",
  "platform-earnings": "/seller/analytics",
};

function safeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function SellerDashboardConnected() {
  const [activeItem, setActiveItem] = useState("dashboard");
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "seller")) {
      navigate("/");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  useEffect(() => {
    // Update activeItem based on current route
    const path = location;
    if (path === "/seller" || path === "/seller/") {
      setActiveItem("dashboard");
    } else if (path.includes("/seller/products")) {
      setActiveItem("products");
    } else if (path.includes("/seller/orders")) {
      setActiveItem("orders");
    } else if (path.includes("/seller/coupons")) {
      setActiveItem("coupons");
    } else if (path.includes("/seller/deliveries")) {
      setActiveItem("deliveries");
    } else if (path.includes("/seller/messages")) {
      setActiveItem("messages");
    } else if (path.includes("/seller/analytics")) {
      setActiveItem("analytics");
    } else if (path.includes("/seller/settings")) {
      setActiveItem("settings");
    } else if (path.includes("/seller/notifications")) {
      setActiveItem("notifications");
    } else if (path === "/cart") {
      setActiveItem("my-cart");
    } else if (path === "/orders") {
      setActiveItem("my-purchases");
    } else if (path === "/wishlist") {
      setActiveItem("my-wishlist");
    } else if (path === "/support") {
      setActiveItem("support");
    } else if (path.includes("/notifications")) {
      setActiveItem("notifications");
    }
  }, [location]);

  useEffect(() => {
    // Navigate when sidebar item is clicked
    switch(activeItem) {
      case "dashboard":
        // Already on dashboard
        break;
      case "media-library":
        navigate("/seller/media-library");
        break;
      case "products":
        navigate("/seller/products");
        break;
      case "orders":
        navigate("/seller/orders");
        break;
      case "coupons":
        // Stays on dashboard showing coupons section
        break;
      case "deliveries":
        navigate("/seller/deliveries");
        break;
      case "payment-setup":
        navigate("/seller/payment-setup");
        break;
      case "messages":
        navigate("/seller/messages");
        break;
      case "analytics":
        navigate("/seller/analytics");
        break;
      case "settings":
        navigate("/seller/settings");
        break;
      case "notifications":
        navigate("/seller/notifications");
        break;
      case "support":
        navigate("/support");
        break;
      case "my-cart":
        navigate("/cart");
        break;
      case "my-purchases":
        navigate("/orders");
        break;
      case "my-wishlist":
        navigate("/wishlist");
        break;
      case "platform-earnings":
        navigate("/seller/analytics");
        break;
      default: {
        const targetRoute = SELLER_NAV_ROUTES[activeItem];
        if (targetRoute) {
          navigate(targetRoute);
        } else {
          setActiveItem("dashboard");
        }
        break;
      }
    }
  }, [activeItem, navigate]);

  const { data: store } = useQuery<{ paystackSubaccountId?: string; isPayoutVerified?: boolean }>({
    queryKey: ["/api/stores/my-store"],
    enabled: isAuthenticated && user?.role === "seller",
  });

  const { data: sellerProfile } = useQuery<SellerProfileSummary>({
    queryKey: ["/api/auth/me", "seller-completeness", user?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/auth/me");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "seller",
  });

  const missingStoreFields = [
    { key: "storeType", label: "Store type" },
    { key: "storeName", label: "Store name" },
    { key: "storeDescription", label: "Store description" },
    { key: "storeBanner", label: "Store banner image" },
    { key: "businessAddress", label: "Business address" },
  ].filter(({ key }) => {
    const value = (sellerProfile as Record<string, any> | undefined)?.[key];
    return value === null || value === undefined || value === "";
  });

  useEffect(() => {
    if (!sellerProfile || missingStoreFields.length === 0) {
      return;
    }
    if (location.startsWith("/profile")) {
      return;
    }

    toast({
      title: "Complete Store Information",
      description: `Missing required fields: ${missingStoreFields.map((field) => field.label).join(", ")}. Please complete your profile.`,
    });
    navigate("/profile");
  }, [sellerProfile, missingStoreFields, location, navigate, toast]);

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Partial<Analytics>>({
    queryKey: ["/api/analytics", user?.id, user?.role],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/analytics");
      const data = await res.json();
      return data && typeof data === "object" ? data : {};
    },
    enabled: isAuthenticated && user?.role === "seller",
  });

  const { data: products = [], isLoading: productsLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", user?.id],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/products?sellerId=${user?.id}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: isAuthenticated && user?.role === "seller" && !!user?.id,
  });

  const { data: orders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    enabled: isAuthenticated && user?.role === "seller",
  });

  const { data: coupons = [], isLoading: couponsLoading } = useQuery<Coupon[]>({
    queryKey: ["/api/coupons"],
    enabled: isAuthenticated && user?.role === "seller" && activeItem === "coupons",
  });

  const form = useForm<CouponFormData>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      discountType: "percentage",
      discountValue: "",
      minimumPurchase: "",
      usageLimit: "",
      expiryDate: "",
      isActive: true,
    },
  });

  const createCouponMutation = useMutation({
    mutationFn: async (data: CouponFormData) => {
      return apiRequest("POST", "/api/coupons", {
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minimumPurchase: data.minimumPurchase || "0",
        usageLimit: data.usageLimit ? parseInt(data.usageLimit) : null,
        expiryDate: data.expiryDate || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon created successfully",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create coupon",
        variant: "destructive",
      });
    },
  });

  const updateCouponMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CouponFormData }) => {
      return apiRequest("PATCH", `/api/coupons/${id}`, {
        code: data.code,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minimumPurchase: data.minimumPurchase || "0",
        usageLimit: data.usageLimit ? parseInt(data.usageLimit) : null,
        expiryDate: data.expiryDate || null,
        isActive: data.isActive,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon updated successfully",
      });
      setIsDialogOpen(false);
      setEditingCoupon(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update coupon",
        variant: "destructive",
      });
    },
  });

  const deleteCouponMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/coupons/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete coupon",
        variant: "destructive",
      });
    },
  });

  const toggleCouponStatusMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/coupons/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/coupons"] });
      toast({
        title: "Success",
        description: "Coupon status updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update coupon status",
        variant: "destructive",
      });
    },
  });


  const onSubmit = (data: CouponFormData) => {
    if (editingCoupon) {
      updateCouponMutation.mutate({ id: editingCoupon.id, data });
    } else {
      createCouponMutation.mutate(data);
    }
  };

  const handleEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    form.reset({
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      minimumPurchase: coupon.minimumPurchase || "",
      usageLimit: coupon.usageLimit?.toString() || "",
      expiryDate: coupon.expiryDate ? format(new Date(coupon.expiryDate), "yyyy-MM-dd") : "",
      isActive: coupon.isActive,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this coupon?")) {
      deleteCouponMutation.mutate(id);
    }
  };

  const handleToggleStatus = (id: string, currentStatus: boolean) => {
    toggleCouponStatusMutation.mutate({ id, isActive: !currentStatus });
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingCoupon(null);
    form.reset();
  };

  if (authLoading || !isAuthenticated || user?.role !== "seller") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-seller" />
      </div>
    );
  }

  const safeProducts = Array.isArray(products) ? products : [];
  const safeOrders = Array.isArray(orders) ? orders : [];
  const safeCoupons = Array.isArray(coupons) ? coupons : [];
  const safeAnalytics: Analytics = {
    totalOrders: safeNumber((analytics as any)?.totalOrders),
    totalRevenue: safeNumber((analytics as any)?.totalRevenue),
  };

  const pendingOrders = safeOrders.filter((o) =>
    o?.sellerId === user.id &&
    (o?.status === "pending" || o?.status === "processing")
  ).length;

  const activeProducts = safeProducts.filter((p) => !!p?.isActive).length;

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role="seller"
        activeItem={activeItem}
        onItemClick={setActiveItem}
        userName={user.name}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b p-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold" data-testid="text-dashboard-title">
            {activeItem === "coupons" ? "Coupon Management" : "Seller Dashboard"}
          </h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" onClick={() => navigate("/")} data-testid="button-shop">
              Shop
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {store && !store.paystackSubaccountId && !store.isPayoutVerified && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                      Payment Setup Required
                    </h3>
                    <p className="text-sm text-amber-800 dark:text-amber-200 mb-3">
                      Set up your bank account to receive payments from your sales. This is required to start receiving earnings.
                    </p>
                    <Button 
                      size="sm"
                      onClick={() => navigate("/seller/payment-setup")}
                      data-testid="button-setup-payment"
                      className="bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      <DollarSign className="h-4 w-4 mr-1" />
                      Set Up Payment Now
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {!store && user?.isApproved && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                      Store Setup In Progress
                    </h3>
                    <p className="text-sm text-blue-800 dark:text-blue-200 mb-3">
                      Your seller account is approved! Your store profile is being created. This usually completes within a few moments. Please refresh the page if this message persists.
                    </p>
                    <Button 
                      size="sm"
                      variant="outline"
                      onClick={() => window.location.reload()}
                      data-testid="button-refresh-store"
                      className="border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    >
                      Refresh Page
                    </Button>
                  </div>
                </div>
              </div>
            )}
            
            {activeItem === "dashboard" && (
              <>
                {analyticsLoading ? (
                  <div className="flex justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <MetricCard
                      title="Total Sales"
                      value={formatPrice(safeAnalytics.totalRevenue)}
                      icon={DollarSign}
                      change={18.2}
                    />
                    <MetricCard
                      title="Total Orders"
                      value={safeAnalytics.totalOrders.toString()}
                      icon={Package}
                      change={12.5}
                    />
                    <MetricCard
                      title="Pending Orders"
                      value={pendingOrders.toString()}
                      icon={ShoppingBag}
                    />
                    <MetricCard
                      title="Active Products"
                      value={activeProducts.toString()}
                      icon={TrendingUp}
                      change={5.4}
                    />
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold">My Products</h2>
                    <Button onClick={() => navigate("/seller/products")} data-testid="button-add-product">
                      <Plus className="mr-2 h-4 w-4" />
                      Add New Product
                    </Button>
                  </div>

                  {productsLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : safeProducts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {safeProducts.map((product) => (
                        <ProductCard
                          key={product.id}
                          id={product.id}
                          name={product.name}
                          price={Number(product.price) || 0}
                          image={(Array.isArray(product.images) ? product.images[0] : "") || ""}
                          discount={product.discount || undefined}
                          rating={4.5}
                          reviewCount={0}
                        />
                      ))}
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="p-8 text-center text-muted-foreground">
                        <p className="mb-4">No products yet</p>
                        <Button onClick={() => navigate("/seller/products")}>
                          Add Your First Product
                        </Button>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </>
            )}

            {activeItem === "coupons" && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="h-5 w-5 text-primary" />
                      <CardTitle>Manage Coupons</CardTitle>
                    </div>
                    <Dialog
                      open={isDialogOpen}
                      onOpenChange={(open) => {
                        if (open) {
                          setIsDialogOpen(true);
                          return;
                        }
                        handleDialogClose();
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button data-testid="button-create-coupon">
                          <Plus className="h-4 w-4 mr-2" />
                          Create Coupon
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md" data-testid="dialog-coupon-form">
                        <DialogHeader>
                          <DialogTitle>
                            {editingCoupon ? "Edit Coupon" : "Create New Coupon"}
                          </DialogTitle>
                        </DialogHeader>
                        <Form {...form}>
                          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                            <FormField
                              control={form.control}
                              name="code"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Coupon Code</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="SUMMER2024"
                                      onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                                      data-testid="input-coupon-code"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="discountType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Discount Type</FormLabel>
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid="select-discount-type">
                                        <SelectValue placeholder="Select discount type" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="percentage">Percentage (%)</SelectItem>
                                      <SelectItem value="fixed">Fixed Amount (GHS)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="discountValue"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Discount Value</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      step="0.01"
                                      placeholder={form.watch("discountType") === "percentage" ? "10" : "50.00"}
                                      data-testid="input-discount-value"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="minimumPurchase"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Minimum Purchase (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      step="0.01"
                                      placeholder="0.00"
                                      data-testid="input-minimum-purchase"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="usageLimit"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Usage Limit (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="number"
                                      placeholder="Unlimited"
                                      data-testid="input-usage-limit"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="expiryDate"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Expiry Date (Optional)</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      type="date"
                                      data-testid="input-expiry-date"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="isActive"
                              render={({ field }) => (
                                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                                  <div className="space-y-0.5">
                                    <FormLabel className="text-base">Active</FormLabel>
                                    <div className="text-sm text-muted-foreground">
                                      Enable this coupon for use
                                    </div>
                                  </div>
                                  <FormControl>
                                    <Switch
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                      data-testid="switch-is-active"
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />

                            <DialogFooter>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={handleDialogClose}
                                data-testid="button-cancel-coupon"
                              >
                                Cancel
                              </Button>
                              <Button
                                type="submit"
                                disabled={createCouponMutation.isPending || updateCouponMutation.isPending}
                                data-testid="button-submit-coupon"
                              >
                                {createCouponMutation.isPending || updateCouponMutation.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : null}
                                {editingCoupon ? "Update" : "Create"}
                              </Button>
                            </DialogFooter>
                          </form>
                        </Form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {couponsLoading ? (
                    <div className="flex justify-center p-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : safeCoupons.length > 0 ? (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead data-testid="header-code">Code</TableHead>
                            <TableHead data-testid="header-discount">Discount</TableHead>
                            <TableHead data-testid="header-min-purchase">Min. Purchase</TableHead>
                            <TableHead data-testid="header-usage">Usage</TableHead>
                            <TableHead data-testid="header-expiry">Expiry</TableHead>
                            <TableHead data-testid="header-status">Status</TableHead>
                            <TableHead data-testid="header-actions">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {safeCoupons.map((coupon) => (
                            <TableRow key={coupon.id} data-testid={`row-coupon-${coupon.id}`}>
                              <TableCell className="font-mono font-semibold" data-testid={`text-code-${coupon.id}`}>
                                {coupon.code}
                              </TableCell>
                              <TableCell data-testid={`text-discount-${coupon.id}`}>
                                {coupon.discountType === "percentage"
                                  ? `${coupon.discountValue}%`
                                  : formatPrice(parseFloat(coupon.discountValue))}
                              </TableCell>
                              <TableCell data-testid={`text-min-purchase-${coupon.id}`}>
                                {coupon.minimumPurchase && parseFloat(coupon.minimumPurchase) > 0
                                  ? formatPrice(parseFloat(coupon.minimumPurchase))
                                  : "-"}
                              </TableCell>
                              <TableCell data-testid={`text-usage-${coupon.id}`}>
                                {coupon.usedCount} / {coupon.usageLimit || "∞"}
                              </TableCell>
                              <TableCell data-testid={`text-expiry-${coupon.id}`}>
                                {coupon.expiryDate
                                  ? format(new Date(coupon.expiryDate), "MMM dd, yyyy")
                                  : "No expiry"}
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={coupon.isActive ? "default" : "secondary"}
                                  data-testid={`badge-status-${coupon.id}`}
                                >
                                  {coupon.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleToggleStatus(coupon.id, coupon.isActive)}
                                    data-testid={`button-toggle-${coupon.id}`}
                                  >
                                    {coupon.isActive ? "Deactivate" : "Activate"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleEdit(coupon)}
                                    data-testid={`button-edit-${coupon.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(coupon.id)}
                                    disabled={deleteCouponMutation.isPending}
                                    data-testid={`button-delete-${coupon.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center p-8 text-muted-foreground">
                      <Tag className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium mb-2">No coupons yet</p>
                      <p className="text-sm mb-4">Create your first coupon to offer discounts to customers</p>
                      <Button onClick={() => setIsDialogOpen(true)} data-testid="button-create-first-coupon">
                        <Plus className="h-4 w-4 mr-2" />
                        Create Your First Coupon
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
