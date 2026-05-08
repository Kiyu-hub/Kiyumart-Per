import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import PickupVerificationScanner from "@/components/PickupVerificationScanner";
import { Camera, Keyboard, Loader2, MapPin, PackageCheck, ShieldCheck, Ticket, TrendingUp, Clock, BarChart3 } from "lucide-react";

interface AgentStats {
  totalVerifications: number;
  verificationsToday: number;
  verificationsThisMonth: number;
  pendingOrders: number;
  zoneName: string | null;
  shift: { onShift: boolean; startedAt: string | null; verificationsThisShift: number } | null;
}

interface PickupAgentOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: string;
  storeName: string | null;
  sellerName: string | null;
  sellerPhone: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  zoneName: string | null;
  zoneId: string | null;
  itemCount: number;
  items: Array<{ productName: string; quantity: number }>;
}

export default function PickupAgentDashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [otpByOrder, setOtpByOrder] = useState<Record<string, string>>({});
  const [qrByOrder, setQrByOrder] = useState<Record<string, string>>({});
  const [scanModeByOrder, setScanModeByOrder] = useState<Record<string, "manual" | "camera">>({});

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || user?.role !== "pickup_agent")) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate, user?.role]);

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const highlightedOrderId = params.get("orderId");

  const { data: orders = [], isLoading } = useQuery<PickupAgentOrder[]>({
    queryKey: ["/api/pickup-agent/orders"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pickup-agent/orders");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "pickup_agent",
    refetchInterval: 10000,
  });

  const { data: stats } = useQuery<AgentStats>({
    queryKey: ["/api/pickup-agent/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/pickup-agent/stats");
      return res.json();
    },
    enabled: isAuthenticated && user?.role === "pickup_agent",
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const hasShiftFeature = (user as any)?.roleFeatures?.["shifts.manage"] !== false && (user as any)?.roleFeatures?.["shifts.manage"] !== undefined;

  const verifyPickupMutation = useMutation({
    mutationFn: async ({ orderId, otp, qrCode }: { orderId: string; otp?: string; qrCode?: string }) => {
      return apiRequest("POST", `/api/orders/${orderId}/verify-customer-pickup`, {
        otp,
        qrCode,
      });
    },
    onSuccess: async (_result, variables) => {
      setOtpByOrder((current) => ({ ...current, [variables.orderId]: "" }));
      setQrByOrder((current) => ({ ...current, [variables.orderId]: "" }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/orders"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/notifications"] }),
      ]);
      toast({
        title: "Pickup completed",
        description: "The pickup order was verified successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error?.message || "Unable to verify this pickup order.",
        variant: "destructive",
      });
    },
  });

  const openOrders = orders.filter((order) => !["completed", "cancelled"].includes(String(order.status || "").toLowerCase()));
  const readyOrders = openOrders.filter((order) => ["ready", "processing", "confirmed", "pending"].includes(String(order.status || "").toLowerCase()));
  const primaryZone = openOrders[0]?.zoneName || orders[0]?.zoneName || "Assigned pickup station";
  const sortedOrders = [...orders].sort((a, b) => {
    if (highlightedOrderId && a.id === highlightedOrderId) return -1;
    if (highlightedOrderId && b.id === highlightedOrderId) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <DashboardLayout role="pickup_agent">
      <div className="space-y-6">
        {/* Welcome + quick nav */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Pickup Agent Dashboard</h1>
            <p className="text-sm text-muted-foreground">Welcome back, {user?.name?.split(" ")[0] || "Agent"}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => navigate("/pickup-agent/earnings")}>
              <BarChart3 className="h-4 w-4 mr-1.5" />
              Performance
            </Button>
            {hasShiftFeature && (
              <Button
                size="sm"
                variant={stats?.shift?.onShift ? "default" : "outline"}
                onClick={() => navigate("/pickup-agent/shift")}
              >
                <Clock className="h-4 w-4 mr-1.5" />
                {stats?.shift?.onShift ? "On Shift" : "Manage Shift"}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <Card className="border-primary/20 bg-card/95 sm:col-span-2 md:col-span-1">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MapPin className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Pickup Station</p>
                <p className="text-lg font-semibold truncate">{primaryZone}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-card/95">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400">
                <PackageCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Open Orders</p>
                <p className="text-2xl font-semibold">{openOrders.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-500/20 bg-card/95">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-300">
                <Ticket className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Ready To Verify</p>
                <p className="text-2xl font-semibold">{readyOrders.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-500/20 bg-card/95">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-400">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Verified Today</p>
                <p className="text-2xl font-semibold">{stats?.verificationsToday ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-500/20 bg-card/95">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-500/10 text-purple-400">
                <PackageCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">All-Time Verified</p>
                <p className="text-2xl font-semibold">{stats?.totalVerifications ?? 0}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-border/70 bg-card/95 shadow-sm">
          <CardHeader>
            <CardTitle>Pickup Order Queue</CardTitle>
            <CardDescription>
              Orders shown here are matched to your pickup station. Verify a pickup with either the customer QR code or the pickup OTP.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : sortedOrders.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 p-8 text-center">
                  <p className="text-lg font-medium">No pickup orders at your station yet</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    New pickup-station orders will appear here automatically.
                  </p>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                {sortedOrders.map((order) => {
                  const orderStatus = String(order.status || "").toLowerCase();
                  const isClosed = ["completed", "cancelled"].includes(orderStatus);
                  const isHighlighted = highlightedOrderId === order.id;
                  const otp = otpByOrder[order.id] || "";
                  const qrCode = qrByOrder[order.id] || "";
                  return (
                    <Card
                      key={order.id}
                      className={`border-border/70 bg-background/70 transition-colors ${isHighlighted ? "border-primary shadow-[0_0_0_1px_rgba(16,185,129,0.4)]" : ""}`}
                    >
                      <CardContent className="space-y-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-lg font-semibold">#{order.orderNumber}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(order.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-wrap gap-2 justify-end">
                            <Badge variant="outline" className="truncate max-w-[140px]">{order.zoneName || "Pickup station"}</Badge>
                            <Badge className={isClosed ? "bg-emerald-600 hover:bg-emerald-600" : "bg-amber-600 hover:bg-amber-600"}>
                              {order.status}
                            </Badge>
                          </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Buyer</p>
                            <p className="mt-2 font-semibold">{order.buyerName || "Customer"}</p>
                            <p className="text-sm text-muted-foreground">{order.buyerPhone || "No phone"}</p>
                          </div>
                          <div className="rounded-xl border border-border/60 bg-muted/15 p-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Store</p>
                            <p className="mt-2 font-semibold">{order.storeName || "Store not available"}</p>
                            <p className="text-sm text-muted-foreground">
                              {order.sellerName || "Seller"}{order.sellerPhone ? ` • ${order.sellerPhone}` : ""}
                            </p>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">Products</p>
                            <p className="text-sm text-muted-foreground">{order.itemCount} item(s)</p>
                          </div>
                          <div className="mt-3 space-y-2">
                            {order.items.map((item, index) => (
                              <div key={`${order.id}-item-${index}`} className="flex items-center justify-between gap-3 text-sm">
                                <span className="truncate">{item.productName}</span>
                                <span className="text-muted-foreground">Qty {item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {!isClosed && (
                          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-300">
                                <ShieldCheck className="h-4 w-4" />
                              </div>
                              <div className="flex-1 space-y-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div>
                                    <p className="font-medium text-emerald-100">Pickup Verification</p>
                                    <p className="text-sm text-emerald-50/80">Verify with QR scan or OTP.</p>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5 text-xs"
                                    onClick={() =>
                                      setScanModeByOrder((s) => ({
                                        ...s,
                                        [order.id]: s[order.id] === "camera" ? "manual" : "camera",
                                      }))
                                    }
                                  >
                                    {scanModeByOrder[order.id] === "camera"
                                      ? <><Keyboard className="h-3.5 w-3.5" /> Manual</>
                                      : <><Camera className="h-3.5 w-3.5" /> Scan QR</>}
                                  </Button>
                                </div>

                                {scanModeByOrder[order.id] === "camera" ? (
                                  <PickupVerificationScanner
                                    orderId={order.id}
                                    orderNumber={order.orderNumber}
                                    onSuccess={() => {
                                      setScanModeByOrder((s) => ({ ...s, [order.id]: "manual" }));
                                    }}
                                  />
                                ) : (
                                  <>
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <Input
                                        value={qrCode}
                                        onChange={(e) => setQrByOrder((current) => ({ ...current, [order.id]: e.target.value }))}
                                        placeholder="Enter buyer QR code"
                                      />
                                      <Input
                                        value={otp}
                                        onChange={(e) =>
                                          setOtpByOrder((current) => ({
                                            ...current,
                                            [order.id]: e.target.value.replace(/\D/g, "").slice(0, 6),
                                          }))
                                        }
                                        inputMode="numeric"
                                        maxLength={6}
                                        placeholder="Enter pickup OTP"
                                      />
                                    </div>
                                    <Button
                                      onClick={() =>
                                        verifyPickupMutation.mutate({
                                          orderId: order.id,
                                          qrCode: qrCode.trim() || undefined,
                                          otp: otp.trim() || undefined,
                                        })
                                      }
                                      disabled={verifyPickupMutation.isPending || (!qrCode.trim() && !otp.trim())}
                                    >
                                      {verifyPickupMutation.isPending ? "Verifying..." : "Verify Pickup"}
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
