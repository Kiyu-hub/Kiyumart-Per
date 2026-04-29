import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Package, QrCode, KeyRound, User, Phone, ShoppingBag, Loader2, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type PickupOrder = {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  createdAt: string;
  storeName?: string | null;
  buyerName?: string | null;
  buyerPhone?: string | null;
  zoneName?: string | null;
  itemCount: number;
  items: { productName: string; quantity: number }[];
};

const statusLabel = (s: string) => {
  const map: Record<string, string> = {
    ready: "Ready for Pickup",
    processing: "Processing",
    packaged: "Packaged",
    completed: "Completed",
  };
  return map[s] || s.replace(/_/g, " ");
};

const statusColor = (s: string) => {
  if (s === "ready") return "bg-green-100 text-green-700 border-green-200";
  if (s === "completed") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-yellow-100 text-yellow-700 border-yellow-200";
};

export default function PickupAgentVerifyPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedOrder, setSelectedOrder] = useState<PickupOrder | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [otp, setOtp] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: orders = [], isLoading } = useQuery<PickupOrder[]>({
    queryKey: ["/api/pickup-agent/orders"],
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ orderId, qrCode, otp }: { orderId: string; qrCode: string; otp: string }) => {
      const payload: Record<string, string> = {};
      if (qrCode.trim()) payload.qrCode = qrCode.trim();
      if (otp.trim()) payload.otp = otp.trim();
      const res = await apiRequest("POST", `/api/orders/${orderId}/verify-customer-pickup`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pickup verified", description: "Order marked as completed successfully." });
      setSelectedOrder(null);
      setQrCode("");
      setOtp("");
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-agent/stats"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Verification failed", description: err.message || "Could not verify pickup." });
    },
  });

  const pendingOrders = orders.filter((o) => o.status === "ready");
  const completedOrders = orders.filter((o) => o.status === "completed");

  const filtered = pendingOrders.filter(
    (o) =>
      !searchQuery ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      o.id.toLowerCase() === searchQuery.toLowerCase().trim(),
  );

  const handleVerify = () => {
    if (!selectedOrder) return;
    if (!qrCode.trim() && !otp.trim()) {
      toast({ variant: "destructive", title: "Input required", description: "Enter either the QR code or the 6-digit OTP." });
      return;
    }
    verifyMutation.mutate({ orderId: selectedOrder.id, qrCode, otp });
  };

  return (
    <DashboardLayout role="pickup_agent">
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Verify Pickup</h2>
          <p className="text-sm text-muted-foreground">
            Scan the customer's QR code or enter their OTP to complete a pickup order. Only orders assigned to your station are shown.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Pending Pickups</p>
              <p className="text-2xl font-bold text-orange-600">{pendingOrders.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Completed Today</p>
              <p className="text-2xl font-bold text-green-600">
                {completedOrders.filter((o) => new Date(o.createdAt).toDateString() === new Date().toDateString()).length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Completed</p>
              <p className="text-2xl font-bold text-blue-600">{completedOrders.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">All Orders (Station)</p>
              <p className="text-2xl font-bold">{orders.length}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Order list */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Orders Awaiting Pickup</CardTitle>
              <CardDescription>Select an order to verify</CardDescription>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by Order Number or Order ID"
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading orders…
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {pendingOrders.length === 0 ? "No orders awaiting pickup at your station." : "No results match your search."}
                </div>
              ) : (
                <ul className="divide-y">
                  {filtered.map((order) => (
                    <li
                      key={order.id}
                      className={`cursor-pointer px-4 py-3 transition-colors hover:bg-muted/40 ${selectedOrder?.id === order.id ? "bg-muted/70" : ""}`}
                      onClick={() => { setSelectedOrder(order); setQrCode(""); setOtp(""); }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">#{order.orderNumber}</p>
                          {order.buyerName && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" /> {order.buyerName}
                            </p>
                          )}
                          {order.buyerPhone && (
                            <p className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" /> {order.buyerPhone}
                            </p>
                          )}
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <ShoppingBag className="h-3 w-3" /> {order.itemCount} item{order.itemCount !== 1 ? "s" : ""}
                            {order.storeName && ` · ${order.storeName}`}
                          </p>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <Badge className={`text-xs ${statusColor(order.status)}`}>{statusLabel(order.status)}</Badge>
                          <p className="mt-1 text-xs font-semibold">GHS {Number(order.total || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Verify panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-5 w-5 text-green-600" /> Verify Pickup
              </CardTitle>
              <CardDescription>
                {selectedOrder
                  ? `Verifying order #${selectedOrder.orderNumber}`
                  : "Select an order from the list to begin verification"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedOrder ? (
                <div className="flex flex-col items-center gap-3 py-8 text-muted-foreground">
                  <Package className="h-10 w-10 opacity-40" />
                  <p className="text-sm">No order selected</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl border bg-muted/30 p-3 text-sm">
                    <p className="font-medium">Order #{selectedOrder.orderNumber}</p>
                    {selectedOrder.buyerName && <p className="text-muted-foreground">Customer: {selectedOrder.buyerName}</p>}
                    {selectedOrder.zoneName && <p className="text-muted-foreground">Station: {selectedOrder.zoneName}</p>}
                    <p className="font-semibold">GHS {Number(selectedOrder.total || 0).toFixed(2)}</p>
                    {selectedOrder.items.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {selectedOrder.items.map((item, i) => (
                          <li key={i} className="text-xs text-muted-foreground">
                            {item.quantity}× {item.productName}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  {/* QR code input — mobile only */}
                  <div className="block sm:hidden space-y-2">
                    <Label htmlFor="qr-input" className="flex items-center gap-1 text-sm">
                      <QrCode className="h-4 w-4" /> QR Code
                    </Label>
                    <Input
                      id="qr-input"
                      placeholder="Scan or paste QR code"
                      value={qrCode}
                      onChange={(e) => setQrCode(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-3 sm:hidden">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="otp-input" className="flex items-center gap-1 text-sm">
                      <KeyRound className="h-4 w-4" /> OTP Code
                    </Label>
                    <Input
                      id="otp-input"
                      placeholder="Enter 6-digit OTP"
                      maxLength={6}
                      inputMode="numeric"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    />
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { setSelectedOrder(null); setQrCode(""); setOtp(""); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleVerify}
                      disabled={verifyMutation.isPending || (!qrCode.trim() && !otp.trim())}
                    >
                      {verifyMutation.isPending ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</>
                      ) : (
                        <><CheckCircle2 className="mr-2 h-4 w-4" /> Confirm Pickup</>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recently verified orders */}
        {completedOrders.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="h-4 w-4 text-blue-500" /> Recently Verified
              </CardTitle>
              <CardDescription>Orders already completed at your station — cannot be re-verified</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <ul className="divide-y">
                {completedOrders.slice(0, 10).map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-3 opacity-70">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">#{order.orderNumber}</p>
                      {order.buyerName && (
                        <p className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" /> {order.buyerName}
                        </p>
                      )}
                    </div>
                    <Badge className="text-xs bg-blue-100 text-blue-700 border-blue-200 shrink-0">
                      Already Verified
                    </Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
