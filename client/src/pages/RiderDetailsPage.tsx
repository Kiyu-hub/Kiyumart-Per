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
import {
  ArrowLeft,
  Bike,
  Clock3,
  DollarSign,
  Loader2,
  MapPin,
  Navigation,
  Package,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
} from "lucide-react";

type RiderUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  isActive?: boolean;
  isApproved?: boolean;
  applicationStatus?: string | null;
  profileImage?: string | null;
  nationalIdCard?: string | null;
  ghanaCardFront?: string | null;
  ghanaCardBack?: string | null;
  businessAddress?: string | null;
  riderCity?: string | null;
  riderRegion?: string | null;
  riderOnline?: boolean;
  deliveryZoneId?: string | null;
  vehicleInfo?: {
    type?: string;
    plateNumber?: string;
    license?: string;
    color?: string;
  } | null;
  riderPreferences?: {
    lastKnownLocation?: {
      latitude?: number;
      longitude?: number;
      timestamp?: string | null;
    };
  } | null;
  createdAt?: string | null;
};

type RiderDeliveryItem = {
  productId: string;
  productName: string;
  quantity: number;
  total: string;
  image?: string | null;
};

type RiderDelivery = {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: string | null;
  deliveryAddress?: string | null;
  deliveryFee?: string | null;
  total: string;
  createdAt?: string | null;
  updatedAt?: string | null;
  deliveredAt?: string | null;
  buyer?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  seller?: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
  items: RiderDeliveryItem[];
};

type RiderPayout = {
  id: string;
  amount: string;
  currency?: string | null;
  method?: string | null;
  status: string;
  notes?: string | null;
  createdAt?: string | null;
  processedAt?: string | null;
};

type RiderReview = {
  id: string;
  rating: string | number;
  comment?: string | null;
  userName?: string | null;
  createdAt?: string | null;
};

type RiderDashboardData = {
  rider: RiderUser;
  summary: {
    totalDeliveries: number;
    completedDeliveries: number;
    activeDeliveries: number;
    cancelledDeliveries: number;
    completionRate: number;
    totalEarnings: number;
    earningsThisMonth: number;
    completedThisMonth: number;
    avgDeliveryFee: number;
    completedPayoutValue: number;
    pendingPayoutValue: number;
    averageRating: number;
    totalReviews: number;
    riskScore: number;
    riderOnline: boolean;
  };
  deliveries: RiderDelivery[];
  payouts: RiderPayout[];
  reviews: RiderReview[];
  latestLocation?: {
    latitude?: string | number | null;
    longitude?: string | number | null;
    accuracy?: string | number | null;
    speed?: string | number | null;
    heading?: string | number | null;
    timestamp?: string | null;
  } | null;
  risk: {
    score: number;
    updatedAt?: number;
    signals?: Array<{ signal: string; weight: number; at: number }>;
  };
  recentActivity: Array<{
    type: string;
    title: string;
    description: string;
    status: string;
    at: string;
  }>;
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
  if (["completed", "approved", "active", "delivered", "online"].includes(normalized)) return "default";
  if (["pending", "processing", "pending_approval", "approved"].includes(normalized)) return "secondary";
  if (["cancelled", "rejected", "failed", "inactive", "offline"].includes(normalized)) return "destructive";
  return "outline";
};

export default function RiderDetailsPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const riderId = params.id;
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { formatPrice } = useLanguage();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user]);

  const { data, isLoading } = useQuery<RiderDashboardData>({
    queryKey: [`/api/admin/riders/${riderId}/dashboard`],
    enabled: !!riderId && isAuthenticated,
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

  const { rider, summary, deliveries, payouts, reviews, latestLocation, risk, recentActivity } = data;

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="space-y-6 p-6 md:p-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/riders")} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold" data-testid="heading-rider-dashboard">Rider Command View</h1>
            <p className="text-sm text-muted-foreground">Profile, delivery execution, earnings, risk, and payout visibility.</p>
          </div>
        </div>

        <Card className="overflow-hidden border-border/70">
          <CardContent className="p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 items-start gap-4">
                <div className="h-24 w-24 overflow-hidden rounded-3xl border bg-muted shadow-lg">
                  {rider.profileImage ? (
                    <img src={rider.profileImage} alt={`${rider.name} profile`} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Bike className="h-8 w-8 text-primary" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-2xl font-semibold">{rider.name}</h2>
                  <p className="truncate text-base text-primary">{rider.vehicleInfo?.type || "Rider account"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge variant={rider.isActive ? "default" : "destructive"}>{rider.isActive ? "Active" : "Inactive"}</Badge>
                    <Badge variant={rider.isApproved ? "default" : "secondary"}>{rider.isApproved ? "Approved" : "Pending approval"}</Badge>
                    <Badge variant={summary.riderOnline ? "default" : "outline"}>{summary.riderOnline ? "Online" : "Offline"}</Badge>
                    {rider.applicationStatus ? <Badge variant="outline">{rider.applicationStatus.replace(/_/g, " ")}</Badge> : null}
                    <Badge variant={summary.riskScore >= 6 ? "destructive" : summary.riskScore >= 3 ? "secondary" : "outline"}>Risk {summary.riskScore.toFixed(1)}</Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Deliveries</p><p className="text-lg font-semibold">{summary.totalDeliveries}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Earnings</p><p className="text-lg font-semibold">{formatPrice(summary.totalEarnings)}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Payout Pending</p><p className="text-lg font-semibold">{formatPrice(summary.pendingPayoutValue)}</p></CardContent></Card>
                <Card className="border-border/60 bg-background/70"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Rating</p><p className="text-lg font-semibold">{summary.averageRating.toFixed(1)}</p></CardContent></Card>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completed</span><Package className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.completedDeliveries}</p><p className="mt-1 text-xs text-muted-foreground">{summary.completedThisMonth} this month</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completion Rate</span><ShieldCheck className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{summary.completionRate.toFixed(1)}%</p><p className="mt-1 text-xs text-muted-foreground">{summary.cancelledDeliveries} cancelled</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Avg Delivery Fee</span><DollarSign className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.avgDeliveryFee)}</p><p className="mt-1 text-xs text-muted-foreground">{formatPrice(summary.earningsThisMonth)} earned this month</p></CardContent></Card>
          <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Paid Out</span><Wallet className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-3xl font-semibold">{formatPrice(summary.completedPayoutValue)}</p><p className="mt-1 text-xs text-muted-foreground">{summary.totalReviews} reviews</p></CardContent></Card>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="deliveries">Deliveries</TabsTrigger>
            <TabsTrigger value="finance">Finance</TabsTrigger>
            <TabsTrigger value="risk">Risk & Reviews</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              <Card>
                <CardHeader><CardTitle>Profile & Vehicle</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Email</p><p className="font-medium">{rider.email}</p></div>
                  <div><p className="text-muted-foreground">Phone</p><p className="font-medium">{rider.phone || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">National ID</p><p className="font-medium">{rider.nationalIdCard || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">Vehicle Type</p><p className="font-medium">{rider.vehicleInfo?.type || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Plate Number</p><p className="font-medium">{rider.vehicleInfo?.plateNumber || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">License</p><p className="font-medium">{rider.vehicleInfo?.license || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Vehicle Color</p><p className="font-medium">{rider.vehicleInfo?.color || "Not set"}</p></div>
                  <div><p className="text-muted-foreground">Joined</p><p className="font-medium">{formatDateTime(rider.createdAt)}</p></div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Location & Operations</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div><p className="text-muted-foreground">Business Address</p><p className="font-medium">{rider.businessAddress || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">City / Region</p><p className="font-medium">{[rider.riderCity, rider.riderRegion].filter(Boolean).join(", ") || "Not provided"}</p></div>
                  <div><p className="text-muted-foreground">Delivery Zone ID</p><p className="font-medium break-all">{rider.deliveryZoneId || "Not assigned"}</p></div>
                  <div><p className="text-muted-foreground">Latest GPS Update</p><p className="font-medium">{formatDateTime(latestLocation?.timestamp || rider.riderPreferences?.lastKnownLocation?.timestamp)}</p></div>
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Latitude</p><p className="font-medium">{latestLocation?.latitude ?? rider.riderPreferences?.lastKnownLocation?.latitude ?? "N/A"}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Longitude</p><p className="font-medium">{latestLocation?.longitude ?? rider.riderPreferences?.lastKnownLocation?.longitude ?? "N/A"}</p></CardContent></Card>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Identity Documents</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="overflow-hidden rounded-xl border bg-muted/40">
                      {rider.ghanaCardFront ? <img src={rider.ghanaCardFront} alt="Ghana card front" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No front ID</div>}
                      <div className="border-t px-3 py-2 text-xs text-muted-foreground">Ghana card front</div>
                    </div>
                    <div className="overflow-hidden rounded-xl border bg-muted/40">
                      {rider.ghanaCardBack ? <img src={rider.ghanaCardBack} alt="Ghana card back" className="h-32 w-full object-cover" /> : <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">No back ID</div>}
                      <div className="border-t px-3 py-2 text-xs text-muted-foreground">Ghana card back</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
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

          <TabsContent value="deliveries" className="space-y-4">
            {deliveries.length === 0 ? <Card><CardContent className="p-8 text-sm text-muted-foreground">No deliveries assigned to this rider yet.</CardContent></Card> : deliveries.map((delivery) => (
              <Card key={delivery.id}>
                <CardContent className="space-y-4 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold">Order #{delivery.orderNumber}</p>
                      <p className="text-sm text-muted-foreground">{delivery.seller?.name || "Seller"} to {delivery.buyer?.name || "Buyer"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusTone(delivery.status) as any}>{delivery.status}</Badge>
                      <Badge variant="outline">{delivery.deliveryMethod || "delivery"}</Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-4 text-sm">
                    <div><p className="text-muted-foreground">Delivery Fee</p><p className="font-medium">{formatPrice(moneyValue(delivery.deliveryFee))}</p></div>
                    <div><p className="text-muted-foreground">Order Total</p><p className="font-medium">{formatPrice(moneyValue(delivery.total))}</p></div>
                    <div><p className="text-muted-foreground">Created</p><p className="font-medium">{formatDateTime(delivery.createdAt)}</p></div>
                    <div><p className="text-muted-foreground">Delivered</p><p className="font-medium">{formatDateTime(delivery.deliveredAt)}</p></div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="text-muted-foreground">Customer</p>
                      <p className="font-medium">{delivery.buyer?.name || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{delivery.buyer?.email || "No email"}</p>
                      <p className="text-xs text-muted-foreground">{delivery.buyer?.phone || "No phone"}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="text-muted-foreground">Seller</p>
                      <p className="font-medium">{delivery.seller?.name || "N/A"}</p>
                      <p className="text-xs text-muted-foreground">{delivery.seller?.email || "No email"}</p>
                      <p className="text-xs text-muted-foreground">{delivery.seller?.phone || "No phone"}</p>
                    </div>
                    <div className="rounded-xl border p-3 text-sm">
                      <p className="text-muted-foreground">Assigned Rider</p>
                      <p className="font-medium">{rider.name}</p>
                      <p className="text-xs text-muted-foreground">{rider.email}</p>
                      <p className="text-xs text-muted-foreground">{rider.phone || "No phone"}</p>
                    </div>
                  </div>
                  {delivery.deliveryAddress ? <p className="text-sm text-muted-foreground">Delivery address: {delivery.deliveryAddress}</p> : null}
                  {delivery.items.length > 0 ? (
                    <div className="space-y-2 rounded-xl border p-3">
                      <p className="text-sm font-medium">Delivery Items</p>
                      {delivery.items.map((item) => (
                        <div key={`${delivery.id}-${item.productId}`} className="flex items-center gap-3 text-sm">
                          <div className="h-10 w-10 overflow-hidden rounded-lg bg-muted">{item.image ? <img src={item.image} alt={item.productName} className="h-full w-full object-cover" /> : null}</div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                          </div>
                          <p className="font-medium">{formatPrice(moneyValue(item.total))}</p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="finance" className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Total Earnings</span><DollarSign className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.totalEarnings)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">This Month</span><Truck className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.earningsThisMonth)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Completed Payouts</span><Wallet className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.completedPayoutValue)}</p></CardContent></Card>
              <Card><CardContent className="p-5"><div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Pending Payouts</span><Clock3 className="h-4 w-4 text-muted-foreground" /></div><p className="mt-3 text-2xl font-semibold">{formatPrice(summary.pendingPayoutValue)}</p></CardContent></Card>
            </div>

            <Card>
              <CardHeader><CardTitle>Payout Ledger</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {payouts.length === 0 ? <p className="text-sm text-muted-foreground">No payout records.</p> : payouts.map((payout) => (
                  <div key={payout.id} className="rounded-xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-medium">{payout.id}</p>
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
          </TabsContent>

          <TabsContent value="risk" className="space-y-6">
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader><CardTitle>Risk Overlay</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Badge variant={summary.riskScore >= 6 ? "destructive" : summary.riskScore >= 3 ? "secondary" : "outline"}>
                      Risk {summary.riskScore.toFixed(1)}
                    </Badge>
                    <p className="text-sm text-muted-foreground">Updated {risk.updatedAt ? formatDateTime(new Date(risk.updatedAt).toISOString()) : "N/A"}</p>
                  </div>
                  <div className="space-y-3">
                    {(risk.signals || []).length === 0 ? <p className="text-sm text-muted-foreground">No active risk signals.</p> : (risk.signals || []).map((signal, index) => (
                      <div key={`${signal.signal}-${index}`} className="rounded-xl border p-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{signal.signal}</p>
                          <span className="text-muted-foreground">Weight {signal.weight}</span>
                        </div>
                        <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(new Date(signal.at).toISOString())}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Reviews & Live Position</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Average Rating</p><p className="text-xl font-semibold">{summary.averageRating.toFixed(1)}</p></CardContent></Card>
                    <Card className="border-border/60"><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Reviews</p><p className="text-xl font-semibold">{summary.totalReviews}</p></CardContent></Card>
                  </div>
                  <div className="rounded-xl border p-4 text-sm">
                    <div className="mb-3 flex items-center gap-2"><Navigation className="h-4 w-4 text-muted-foreground" /><span className="font-medium">Latest Location</span></div>
                    <p className="text-muted-foreground">Latitude: {latestLocation?.latitude ?? rider.riderPreferences?.lastKnownLocation?.latitude ?? "N/A"}</p>
                    <p className="text-muted-foreground">Longitude: {latestLocation?.longitude ?? rider.riderPreferences?.lastKnownLocation?.longitude ?? "N/A"}</p>
                    <p className="mt-2 text-xs text-muted-foreground">Updated {formatDateTime(latestLocation?.timestamp || rider.riderPreferences?.lastKnownLocation?.timestamp)}</p>
                  </div>
                  <div className="space-y-3">
                    {reviews.length === 0 ? <p className="text-sm text-muted-foreground">No rider reviews yet.</p> : reviews.map((review) => (
                      <div key={review.id} className="rounded-xl border p-4 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">{review.userName || "Customer"}</p>
                          <div className="flex items-center gap-1"><Star className="h-4 w-4 text-amber-500" /><span>{moneyValue(review.rating).toFixed(1)}</span></div>
                        </div>
                        <p className="mt-2 text-muted-foreground">{review.comment || "No written review."}</p>
                        <p className="mt-2 text-xs text-muted-foreground">{formatDateTime(review.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
