import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { format } from "date-fns";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import {
  ArrowLeft,
  Clock3,
  Heart,
  Loader2,
  Package,
  ShoppingBag,
  Store,
  Truck,
  User,
  Wallet,
} from "lucide-react";

type BuyerUser = {
  id: string;
  username?: string | null;
  name: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
  isActive?: boolean;
  createdAt?: string | null;
};

type BuyerOrderItem = {
  productId: string;
  productName: string;
  quantity: number;
  price: string;
  total: string;
  image?: string | null;
};

type OrderParty = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  profileImage?: string | null;
};

type BuyerOrder = {
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
  items: BuyerOrderItem[];
};

type WishlistProduct = {
  id: string;
  name: string;
  description?: string | null;
  images?: string[] | null;
  price: string;
  stock?: number | null;
  isActive?: boolean;
  categoryName?: string | null;
  updatedAt?: string | null;
  createdAt?: string | null;
};

type ActivityItem = {
  type: string;
  title: string;
  description: string;
  status: string;
  at: string;
};

type BuyerDashboardData = {
  buyer: BuyerUser;
  summary: {
    totalOrders: number;
    completedOrders: number;
    activeOrders: number;
    totalSpend: number;
    deliverySpend: number;
    processingFees: number;
    averageOrderValue: number;
    ordersThisMonth: number;
    wishlistCount: number;
    sellerCount: number;
    riderCount: number;
  };
  orders: BuyerOrder[];
  wishlist: WishlistProduct[];
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
  if (["pending", "processing", "shipped", "wishlisted"].includes(normalized)) return "secondary";
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

export default function BuyerDetailsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const buyerId = params.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const { data, isLoading } = useQuery<BuyerDashboardData>({
    queryKey: [`/api/admin/buyers/${buyerId}/dashboard`],
    enabled: !!buyerId && isAuthenticated,
  });

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

  const { buyer, summary, orders, wishlist, recentActivity } = data;

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/users")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold" data-testid="heading-buyer-dashboard">Buyer Command View</h1>
            <p className="text-sm text-muted-foreground">Profile, order history, wishlist, spend behavior, and activity.</p>
          </div>
        </div>

        <Card className="overflow-hidden border-border/70">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-3xl border bg-muted shadow-lg">
                  {buyer.profileImage ? (
                    <img src={buyer.profileImage} alt={`${buyer.name} profile`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <User className="h-8 w-8 text-primary" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold">{buyer.name}</h2>
                  <p className="truncate text-base text-primary">{buyer.username || "Buyer account"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={buyer.isActive ? "default" : "destructive"}>{buyer.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge variant="outline">Joined {formatDateTime(buyer.createdAt)}</Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Spend</p><p className="text-lg font-semibold">{formatPrice(summary.totalSpend)}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Orders</p><p className="text-lg font-semibold">{summary.totalOrders}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Wishlist</p><p className="text-lg font-semibold">{summary.wishlistCount}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Avg Order</p><p className="text-lg font-semibold">{formatPrice(summary.averageOrderValue)}</p></CardContent></Card>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completed Orders</span><ShoppingBag className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.completedOrders}</p><p className="mt-1 text-xs text-muted-foreground">{summary.ordersThisMonth} this month</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Active Orders</span><Clock3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.activeOrders}</p><p className="mt-1 text-xs text-muted-foreground">Currently in motion</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Delivery Spend</span><Truck className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.deliverySpend)}</p><p className="mt-1 text-xs text-muted-foreground">Fees across paid orders</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Network Reach</span><Store className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.sellerCount}</p><p className="mt-1 text-xs text-muted-foreground">{showInternalRiderFeatures ? `${summary.riderCount} riders involved` : "Seller network only"}</p></CardContent></Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="orders">Orders</TabsTrigger>
            <TabsTrigger value="wishlist">Wishlist</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Buyer Profile</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Name</p><p className="font-medium">{buyer.name}</p></div>
                  <div><p className="text-muted-foreground">Username</p><p className="font-medium">{buyer.username || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Email</p><p className="font-medium">{buyer.email}</p></div>
                  <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{buyer.phone || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">Joined</p><p className="font-medium">{formatDateTime(buyer.createdAt)}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Commerce Snapshot</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Spend</p><p className="text-xl font-semibold">{formatPrice(summary.totalSpend)}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Processing Fees</p><p className="text-xl font-semibold">{formatPrice(summary.processingFees)}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Completed</p><p className="text-xl font-semibold">{summary.completedOrders}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Wishlist Items</p><p className="text-xl font-semibold">{summary.wishlistCount}</p></CardContent></Card>
                  </div>
                  <div className="rounded-xl border p-4">
                    <p className="text-sm text-muted-foreground">Relationship coverage</p>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                      <div><p className="text-muted-foreground">Distinct Sellers</p><p className="font-medium">{summary.sellerCount}</p></div>
                      {showInternalRiderFeatures ? <div><p className="text-muted-foreground">Distinct Riders</p><p className="font-medium">{summary.riderCount}</p></div> : null}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Recent Intent</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {wishlist.length === 0 ? <p className="text-sm text-muted-foreground">No wishlist items yet.</p> : wishlist.slice(0, 4).map((product) => (
                    <div key={product.id} className="flex items-center gap-3 rounded-xl border p-3">
                      <div className="h-12 w-12 overflow-hidden rounded-xl bg-muted">
                        {product.images?.[0] ? (
                          <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Heart className="h-4 w-4 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{product.name}</p>
                        <p className="text-xs text-muted-foreground">{product.categoryName || "Uncategorized"}</p>
                      </div>
                      <p className="text-sm font-semibold">{formatPrice(moneyValue(product.price))}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="orders" className="space-y-4">
            {orders.length === 0 ? <Card><CardContent className="p-8 text-sm text-muted-foreground">No orders recorded for this buyer.</CardContent></Card> : orders.map((order) => (
              <Card key={order.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Order #{order.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{order.seller?.name || "Seller"} to {order.buyer?.name || buyer.name}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusTone(order.status) as any}>{order.status}</Badge>
                      <Badge variant={statusTone(order.paymentStatus) as any}>{order.paymentStatus || "payment unknown"}</Badge>
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
                    <ParticipantCard title="Customer" party={order.buyer} fallbackName={buyer.name} />
                    <ParticipantCard title="Seller" party={order.seller} />
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

          <TabsContent value="wishlist" className="space-y-6">
            {wishlist.length === 0 ? <Card><CardContent className="p-8 text-sm text-muted-foreground">No wishlist products saved by this buyer.</CardContent></Card> : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {wishlist.map((product) => (
                  <Card key={product.id} className="overflow-hidden">
                    <div className="h-32 bg-muted">
                      {product.images?.[0] ? (
                        <img src={product.images[0]} alt={product.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Heart className="h-6 w-6 text-muted-foreground" />
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
                        <div><p className="text-muted-foreground">Stock</p><p className="font-medium">{product.stock ?? 0}</p></div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

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
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
