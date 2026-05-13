import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  BarChart3,
  Clock3,
  DollarSign,
  Loader2,
  Package,
  Palette,
  Percent,
  ShoppingBag,
  Store,
  Truck,
  Wallet,
} from "lucide-react";

type StoreProfile = {
  id: string;
  name: string;
  description?: string | null;
  banner?: string | null;
  logo?: string | null;
  primarySellerId?: string | null;
  isActive?: boolean | null;
  isApproved?: boolean | null;
  storeType?: string | null;
  createdAt?: string | null;
  whatsappNumber?: string | null;
  merchantCategory?: string | null;
  brandingConfig?: {
    primaryColor?: string;
    accentColor?: string;
    logoOverride?: string;
    tagline?: string;
  } | null;
};

type LinkedSeller = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
  storeName?: string | null;
};

type StoreProduct = {
  id: string;
  name: string;
  description?: string | null;
  images?: string[] | null;
  price: string;
  costPrice?: string | null;
  stock?: number | null;
  isActive?: boolean;
  categoryName?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type OrderParty = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
};

type StoreOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: string;
  total: string;
  image?: string | null;
};

type StoreOrder = {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus?: string | null;
  deliveryMethod?: string | null;
  deliveryAddress?: string | null;
  subtotal?: string | null;
  deliveryFee?: string | null;
  processingFee?: string | null;
  total: string;
  currency?: string | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
  buyer?: OrderParty | null;
  seller?: OrderParty | null;
  rider?: OrderParty | null;
  items: StoreOrderItem[];
};

type StorePayout = {
  id: string;
  amount: string;
  currency?: string | null;
  method?: string | null;
  status: string;
  reference?: string | null;
  notes?: string | null;
  createdAt?: string | null;
  processedAt?: string | null;
};

type StoreCommission = {
  id: string;
  orderId: string;
  orderAmount: string;
  commissionAmount: string;
  sellerAmount: string;
  commissionRate: string;
  status: string;
  createdAt?: string | null;
};

type TopProduct = {
  productId: string;
  name: string;
  image?: string | null;
  unitsSold: number;
  revenue: number;
};

type ActivityItem = {
  type: string;
  title: string;
  description: string;
  status: string;
  at: string;
};

type StoreDashboardData = {
  store: StoreProfile;
  seller?: LinkedSeller | null;
  summary: {
    totalOrders: number;
    completedOrders: number;
    activeOrders: number;
    totalRevenue: number;
    averageOrderValue: number;
    totalProducts: number;
    activeProducts: number;
    totalStockUnits: number;
    completedPayoutValue: number;
    pendingPayoutValue: number;
    totalCommissionCharged: number;
  };
  products: StoreProduct[];
  orders: StoreOrder[];
  payouts: StorePayout[];
  commissions: StoreCommission[];
  topProducts: TopProduct[];
  recentActivity: ActivityItem[];
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "N/A";
  try {
    return format(new Date(value), "MMM dd, yyyy HH:mm");
  } catch {
    return "N/A";
  }
};

const moneyValue = (value: unknown) => Number.parseFloat(String(value ?? "0")) || 0;

const statusTone = (status?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (["completed", "approved", "active", "paid", "success", "delivered"].includes(normalized)) return "default";
  if (["pending", "processing"].includes(normalized)) return "secondary";
  if (["cancelled", "rejected", "failed", "inactive"].includes(normalized)) return "destructive";
  return "outline";
};

function ParticipantCard({ title, party, fallbackName }: { title: string; party?: OrderParty | null; fallbackName?: string }) {
  return (
    <div className="rounded-xl border p-3 text-sm">
      <p className="text-muted-foreground">{title}</p>
      <p className="font-medium">{party?.name || fallbackName || "N/A"}</p>
      <p className="text-xs text-muted-foreground">{party?.email || "No email"}</p>
      <p className="text-xs text-muted-foreground">{party?.phone || "No phone"}</p>
    </div>
  );
}

export default function StoreDetailsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  // Branding config state
  const [primaryColor, setPrimaryColor] = useState("#16a34a");
  const [accentColor, setAccentColor] = useState("#0ea5e9");
  const [logoOverride, setLogoOverride] = useState("");
  const [tagline, setTagline] = useState("");
  const [whatsappNum, setWhatsappNum] = useState("");
  const [merchantCat, setMerchantCat] = useState("");

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const { data, isLoading } = useQuery<StoreDashboardData>({
    queryKey: [`/api/admin/stores/${storeId}/dashboard`],
    enabled: !!storeId && isAuthenticated,
  });

  // Sync store branding into local state once data loads — must be before early returns
  useEffect(() => {
    const store = data?.store as any;
    if (!store) return;
    const b = store.brandingConfig;
    if (b?.primaryColor) setPrimaryColor(b.primaryColor);
    if (b?.accentColor) setAccentColor(b.accentColor);
    setLogoOverride(b?.logoOverride || "");
    setTagline(b?.tagline || "");
    setWhatsappNum(store.whatsappNumber || "");
    setMerchantCat(store.merchantCategory || "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.store?.id]);

  const saveBrandingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", `/api/stores/${storeId}`, {
        whatsappNumber: whatsappNum.trim() || null,
        merchantCategory: merchantCat || null,
        brandingConfig: {
          primaryColor: primaryColor || "#16a34a",
          accentColor: accentColor || "#0ea5e9",
          logoOverride: logoOverride.trim() || null,
          tagline: tagline.trim() || null,
        },
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Branding saved", description: "Store branding config updated successfully." });
      queryClient.invalidateQueries({ queryKey: [`/api/admin/stores/${storeId}/dashboard`] });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: err?.message || "Could not save branding.", variant: "destructive" });
    },
  });

  const MERCHANT_CATEGORIES = [
    { value: "QUICK_EATS", label: "Quick Eats" },
    { value: "HEALTH_ESSENTIALS", label: "Health Essentials" },
    { value: "RETAIL_BOUTIQUE", label: "Retail Boutique" },
    { value: "GENERAL_PROVISIONS", label: "General Provisions" },
  ];

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const { store, seller, summary, products, orders, payouts, commissions, topProducts, recentActivity } = data;

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/stores")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold" data-testid="heading-store-dashboard">Store Command View</h1>
            <p className="text-sm text-muted-foreground">Store identity, product mix, orders, finance, and operational activity.</p>
          </div>
        </div>

        <Card className="overflow-hidden border-border/70">
          <div className="relative h-40 bg-gradient-to-r from-primary/25 via-primary/10 to-background">
            {store.banner ? <img src={store.banner} alt={`${store.name} banner`} className="h-full w-full object-cover" /> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-background/20 via-transparent to-background/30" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background" />
          </div>
          <CardContent className="relative px-6 pb-6 pt-0">
            <div className="-mt-12 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex min-w-0 items-end gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-3xl border-4 border-background bg-muted shadow-lg">
                  {store.logo ? (
                    <img src={store.logo} alt={`${store.name} logo`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Store className="h-8 w-8 text-primary" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 pb-1">
                  <h2 className="truncate text-2xl font-semibold">{store.name}</h2>
                  <p className="truncate text-base text-primary">{store.storeType || "Store account"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={store.isActive ? "default" : "destructive"}>{store.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge variant={store.isApproved ? "default" : "secondary"}>{store.isApproved ? "Approved" : "Pending approval"}</Badge>
                    {seller ? <Badge variant="outline">Managed by {seller.name}</Badge> : null}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Revenue</p><p className="text-lg font-semibold">{formatPrice(summary.totalRevenue)}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Orders</p><p className="text-lg font-semibold">{summary.totalOrders}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Products</p><p className="text-lg font-semibold">{summary.totalProducts}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Stock Units</p><p className="text-lg font-semibold">{summary.totalStockUnits}</p></CardContent></Card>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completed Orders</span><ShoppingBag className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.completedOrders}</p><p className="mt-1 text-xs text-muted-foreground">{summary.activeOrders} still active</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Average Order</span><BarChart3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.averageOrderValue)}</p><p className="mt-1 text-xs text-muted-foreground">Paid-order average</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pending Payouts</span><Clock3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.pendingPayoutValue)}</p><p className="mt-1 text-xs text-muted-foreground">Awaiting settlement</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Commission</span><Percent className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.totalCommissionCharged)}</p><p className="mt-1 text-xs text-muted-foreground">Platform charges</p></CardContent></Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            {user?.role === "super_admin" && <TabsTrigger value="finance">Finance</TabsTrigger>}
            <TabsTrigger value="activity">Activity</TabsTrigger>
            {user?.role === "super_admin" && <TabsTrigger value="branding"><Palette className="h-3.5 w-3.5 mr-1" />Branding</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Store Identity</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Store Name</p><p className="font-medium">{store.name}</p></div>
                  <div><p className="text-muted-foreground">Store Type</p><p className="font-medium">{store.storeType || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Description</p><p className="font-medium">{store.description || "No description"}</p></div>
                  <div><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDateTime(store.createdAt)}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Linked Seller</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Owner</p><p className="font-medium">{seller?.name || "Not assigned"}</p></div>
                  <div><p className="text-muted-foreground">Email</p><p className="font-medium">{seller?.email || "No email"}</p></div>
                  <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{seller?.phone || "No phone"}</p></div>
                  <div><p className="text-muted-foreground">Store Name on Seller Profile</p><p className="font-medium">{seller?.storeName || "Not set"}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Top Products</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {topProducts.length === 0 ? <p className="text-sm text-muted-foreground">No product performance data yet.</p> : topProducts.slice(0, 4).map((product) => (
                    <div key={product.productId} className="flex items-center gap-3 rounded-xl border p-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-muted">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.unitsSold} units sold</p>
                      </div>
                      <p className="text-sm font-semibold">{formatPrice(product.revenue)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="products" className="space-y-6">
            {products.length === 0 ? <Card><CardContent className="p-8 text-sm text-muted-foreground">No products exist for this store yet.</CardContent></Card> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {products.map((product) => (
                  <Card key={product.id} className="overflow-hidden">
                    <div className="h-32 bg-muted">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Package className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-base font-semibold">{product.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{product.categoryName || "Uncategorized"}</p>
                        </div>
                        <Badge variant={product.isActive ? "default" : "secondary"}>{product.isActive ? "Active" : "Inactive"}</Badge>
                      </div>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{product.description || "No description."}</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div><p className="text-muted-foreground">Price</p><p className="font-medium">{formatPrice(moneyValue(product.price))}</p></div>
                        <div><p className="text-muted-foreground">Cost</p><p className="font-medium">{formatPrice(moneyValue(product.costPrice))}</p></div>
                        <div><p className="text-muted-foreground">Stock</p><p className="font-medium">{product.stock ?? 0}</p></div>
                        <div><p className="text-muted-foreground">Updated</p><p className="font-medium">{formatDateTime(product.updatedAt || product.createdAt)}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            {orders.length === 0 ? <Card><CardContent className="p-8 text-sm text-muted-foreground">No orders recorded for this store.</CardContent></Card> : orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Order #{order.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{order.buyer?.name || "Buyer"} with {order.seller?.name || seller?.name || "Seller"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusTone(order.status) as any}>{order.status}</Badge>
                      <Badge variant={statusTone(order.paymentStatus) as any}>{order.paymentStatus || "payment unknown"}</Badge>
                      <Badge variant="outline">{order.deliveryMethod || "delivery"}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-5 text-sm">
                    <div><p className="text-muted-foreground">Total</p><p className="font-medium">{formatPrice(moneyValue(order.total))}</p></div>
                    <div><p className="text-muted-foreground">Subtotal</p><p className="font-medium">{formatPrice(moneyValue(order.subtotal))}</p></div>
                    <div><p className="text-muted-foreground">Delivery Fee</p><p className="font-medium">{formatPrice(moneyValue(order.deliveryFee))}</p></div>
                    <div><p className="text-muted-foreground">Processing Fee</p><p className="font-medium">{formatPrice(moneyValue(order.processingFee))}</p></div>
                    <div><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDateTime(order.createdAt)}</p></div>
                  </div>
                  <div className={`grid grid-cols-1 gap-3 ${order.rider && showInternalRiderFeatures ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                    <ParticipantCard title="Customer" party={order.buyer} />
                    <ParticipantCard title="Seller" party={order.seller} fallbackName={seller?.name} />
                    {order.rider && showInternalRiderFeatures ? <ParticipantCard title="Assigned Rider" party={order.rider} /> : null}
                  </div>
                  {order.items.length > 0 ? (
                    <div className="space-y-2 rounded-xl border p-3">
                      <p className="text-sm font-medium">Order Items</p>
                      {order.items.map((item) => (
                        <div key={`${order.id}-${item.productId}`} className="flex items-center gap-3 text-sm">
                          <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">
                            {item.image ? <img src={item.image} alt={item.productName} className="h-full w-full object-cover" /> : null}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                          </div>
                          <p className="font-medium">{formatPrice(moneyValue(item.total))}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {order.deliveryAddress ? <p className="text-sm text-muted-foreground">Delivery address: {order.deliveryAddress}</p> : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {user?.role === "super_admin" && (<TabsContent value="finance" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Gross Revenue</span><DollarSign className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.totalRevenue)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completed Payouts</span><Wallet className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.completedPayoutValue)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pending Payouts</span><Clock3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.pendingPayoutValue)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Commission</span><Percent className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.totalCommissionCharged)}</p></CardContent></Card>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Payout Ledger</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {payouts.length === 0 ? <p className="text-sm text-muted-foreground">No payout records.</p> : payouts.map((payout) => (
                    <div key={payout.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">{payout.reference || payout.id}</p>
                        <Badge variant={statusTone(payout.status) as any}>{payout.status}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4 text-sm">
                        <div><p className="text-muted-foreground">Amount</p><p className="font-medium">{formatPrice(moneyValue(payout.amount))}</p></div>
                        <div><p className="text-muted-foreground">Method</p><p className="font-medium">{payout.method || "N/A"}</p></div>
                        <div><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDateTime(payout.createdAt)}</p></div>
                        <div><p className="text-muted-foreground">Processed</p><p className="font-medium">{formatDateTime(payout.processedAt)}</p></div>
                      </div>
                      {payout.notes ? <p className="mt-3 text-sm text-muted-foreground">{payout.notes}</p> : null}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Commission Ledger</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {commissions.length === 0 ? <p className="text-sm text-muted-foreground">No commission records.</p> : commissions.map((commission) => (
                    <div key={commission.id} className="rounded-xl border p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">Order {commission.orderId.slice(0, 8)}</p>
                        <Badge variant={statusTone(commission.status) as any}>{commission.status}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-4 text-sm">
                        <div><p className="text-muted-foreground">Gross</p><p className="font-medium">{formatPrice(moneyValue(commission.orderAmount))}</p></div>
                        <div><p className="text-muted-foreground">Commission</p><p className="font-medium">{formatPrice(moneyValue(commission.commissionAmount))}</p></div>
                        <div><p className="text-muted-foreground">Net</p><p className="font-medium">{formatPrice(moneyValue(commission.sellerAmount))}</p></div>
                        <div><p className="text-muted-foreground">Rate</p><p className="font-medium">{commission.commissionRate}%</p></div>
                      </div>
                      <p className="mt-3 text-xs text-muted-foreground">{formatDateTime(commission.createdAt)}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>)}

          <TabsContent value="activity" className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Recent Activity Feed</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {recentActivity.length === 0 ? <p className="text-sm text-muted-foreground">No recent activity.</p> : recentActivity.map((item, index) => (
                    <div key={`${item.type}-${index}`} className="rounded-2xl border border-border/70 bg-muted/10 p-4 shadow-sm">
                      <div className="mb-4 h-1.5 w-14 rounded-full bg-primary/80" />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{item.title}</p>
                          <Badge variant={statusTone(item.status) as any}>{item.status}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(item.at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {user?.role === "super_admin" && (
            <TabsContent value="branding" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Palette className="h-5 w-5" /> White-Label Branding
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Customize this store's brand identity for the social commerce page (<code>/p/:slug</code>).
                      Colors affect the Pay Now button and price accent.
                    </p>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Primary Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={primaryColor}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                            className="h-10 w-14 cursor-pointer rounded border border-border"
                          />
                          <Input
                            value={primaryColor}
                            onChange={(e) => setPrimaryColor(e.target.value)}
                            placeholder="#16a34a"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Accent Color</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="h-10 w-14 cursor-pointer rounded border border-border"
                          />
                          <Input
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            placeholder="#0ea5e9"
                            className="flex-1 font-mono text-sm"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium">Logo Override URL</label>
                        <Input
                          value={logoOverride}
                          onChange={(e) => setLogoOverride(e.target.value)}
                          placeholder="https://cdn.example.com/custom-logo.png (optional)"
                        />
                        {logoOverride && (
                          <img src={logoOverride} alt="Logo preview" className="h-12 w-12 rounded-full object-cover border" />
                        )}
                      </div>

                      <div className="space-y-2 sm:col-span-2">
                        <label className="text-sm font-medium">Store Tagline</label>
                        <Input
                          value={tagline}
                          onChange={(e) => setTagline(e.target.value)}
                          placeholder="e.g. Fresh meals, fast delivery"
                          maxLength={120}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4 space-y-4">
                    <p className="text-sm font-medium">Social Commerce Settings</p>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">WhatsApp Number</label>
                        <Input
                          value={whatsappNum}
                          onChange={(e) => setWhatsappNum(e.target.value)}
                          placeholder="+233201234567"
                          type="tel"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Store Persona</label>
                        <div className="grid grid-cols-2 gap-2">
                          {MERCHANT_CATEGORIES.map((cat) => (
                            <button
                              key={cat.value}
                              type="button"
                              onClick={() => setMerchantCat(cat.value === merchantCat ? "" : cat.value)}
                              className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                                merchantCat === cat.value
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border hover:bg-muted"
                              }`}
                            >
                              {cat.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <Button
                      onClick={() => saveBrandingMutation.mutate()}
                      disabled={saveBrandingMutation.isPending}
                    >
                      {saveBrandingMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Save Branding
                    </Button>

                    {/* Live preview swatch */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        className="inline-block h-6 w-6 rounded-full border"
                        style={{ backgroundColor: primaryColor }}
                      />
                      <span>Primary</span>
                      <span
                        className="inline-block h-6 w-6 rounded-full border"
                        style={{ backgroundColor: accentColor }}
                      />
                      <span>Accent</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
