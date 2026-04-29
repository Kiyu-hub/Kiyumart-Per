import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, Search, QrCode, KeyRound, Package, Loader2, AlertCircle } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";

type OrderLookup = {
  id: string;
  orderNumber: string;
  status: string;
  total: string;
  deliveryMethod: string;
  buyerName?: string | null;
  buyerPhone?: string | null;
  storeName?: string | null;
  zoneName?: string | null;
  createdAt: string;
};

const statusColor = (s: string) => {
  if (s === "ready") return "bg-green-100 text-green-700 border-green-200";
  if (s === "completed") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-yellow-100 text-yellow-700 border-yellow-200";
};

export default function AdminPickupVerifyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isSuperAdmin = user?.role === "super_admin";

  const [orderSearch, setOrderSearch] = useState("");
  const [foundOrder, setFoundOrder] = useState<OrderLookup | null>(null);
  const [searchResults, setSearchResults] = useState<OrderLookup[]>([]);
  const [lookupError, setLookupError] = useState("");
  const [isLooking, setIsLooking] = useState(false);
  const [qrCode, setQrCode] = useState("");
  const [otp, setOtp] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selectOrder = (order: OrderLookup) => {
    setFoundOrder(order);
    setSearchResults([]);
    setQrCode("");
    setOtp("");
  };

  const lookupOrder = async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setFoundOrder(null);
      setSearchResults([]);
      setLookupError("");
      return;
    }
    setIsLooking(true);
    setFoundOrder(null);
    setSearchResults([]);
    setLookupError("");
    setQrCode("");
    setOtp("");
    try {
      // If input is 4-8 digits, try OTP-based lookup first
      if (/^\d{4,8}$/.test(trimmed)) {
        const otpRes = await fetch(`/api/admin/orders/by-otp?otp=${encodeURIComponent(trimmed)}`, {
          credentials: "include",
        });
        if (otpRes.ok) {
          const otpData = await otpRes.json();
          const otpMatches: OrderLookup[] = Array.isArray(otpData) ? otpData : [];
          if (otpMatches.length === 1) {
            setFoundOrder(otpMatches[0]);
            setIsLooking(false);
            return;
          } else if (otpMatches.length > 1) {
            setSearchResults(otpMatches.slice(0, 10));
            setIsLooking(false);
            return;
          }
        }
      }
      // Fall back to order number / order ID search
      const res = await fetch(`/api/orders?context=admin`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to search orders");
      const data = await res.json();
      const results: OrderLookup[] = Array.isArray(data) ? data : [];
      const lc = trimmed.toLowerCase();
      const matches = results.filter(
        (o) =>
          o.orderNumber?.toLowerCase().includes(lc) ||
          o.id.toLowerCase() === lc,
      );
      if (matches.length === 0) {
        setLookupError("No order found. Enter the exact Order Number (e.g. KM-20240001), Order ID, or 6-digit OTP.");
      } else if (matches.length === 1) {
        setFoundOrder(matches[0]);
      } else {
        setSearchResults(matches.slice(0, 10));
      }
    } catch {
      setLookupError("Could not look up order. Check the order number, ID, or OTP and try again.");
    } finally {
      setIsLooking(false);
    }
  };

  // Auto-search with 400 ms debounce
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void lookupOrder(orderSearch);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearch]);

  const verifyMutation = useMutation({
    mutationFn: async ({ orderId, qrCode, otp }: { orderId: string; qrCode: string; otp: string }) => {
      const payload: Record<string, string> = {};
      if (qrCode.trim()) payload.qrCode = qrCode.trim();
      if (otp.trim()) payload.otp = otp.trim();
      const res = await apiRequest("POST", `/api/orders/${orderId}/verify-customer-pickup`, payload);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Pickup verified", description: "Order has been marked as completed." });
      setFoundOrder(null);
      setSearchResults([]);
      setOrderSearch("");
      setQrCode("");
      setOtp("");
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Verification failed", description: err.message || "Could not verify pickup." });
    },
  });

  const handleVerify = () => {
    if (!foundOrder) return;
    if (!qrCode.trim() && !otp.trim()) {
      toast({ variant: "destructive", title: "Input required", description: "Enter either the QR code or OTP." });
      return;
    }
    verifyMutation.mutate({ orderId: foundOrder.id, qrCode, otp });
  };

  const isAlreadyVerified = foundOrder?.status === "completed";

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="space-y-6 p-4 md:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">Verify Pickup Order</h2>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin
              ? "As Super Admin, you can verify any pickup order regardless of station assignment."
              : "Verify pickup orders if you have been granted manage_orders permission by Super Admin."}
          </p>
        </div>

        {!isSuperAdmin && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
            <CardContent className="flex items-start gap-3 p-4">
              <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Admin verification access is controlled by Super Admin through the Permissions page. Contact your Super Admin if you need access.
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-5 w-5" /> Look Up Order
            </CardTitle>
            <CardDescription>
              Enter the OTP (e.g. 123456) or Order Number (e.g. KM-20240001). Results update automatically.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Input
                placeholder="Enter OTP (e.g. 123456) or Order Number"
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="pr-9"
              />
              {isLooking && (
                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              )}
            </div>
            {lookupError && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> {lookupError}
              </p>
            )}
          </CardContent>
        </Card>

        {searchResults.length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Search className="h-5 w-5" /> {searchResults.length} orders found
              </CardTitle>
              <CardDescription>Select the order you want to verify</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {searchResults.map((order) => (
                <button
                  key={order.id}
                  onClick={() => selectOrder(order)}
                  className="w-full text-left rounded-xl border bg-muted/20 hover:bg-muted/50 transition-colors p-3 text-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="font-semibold">#{order.orderNumber}</p>
                      {order.buyerName && <p className="text-muted-foreground">{order.buyerName}{order.buyerPhone ? ` · ${order.buyerPhone}` : ""}</p>}
                      {order.storeName && <p className="text-muted-foreground">{order.storeName}</p>}
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <Badge className={`text-xs ${statusColor(order.status)}`}>
                        {order.status === "completed" ? "Already Verified" : order.status.replace(/_/g, " ")}
                      </Badge>
                      <p className="font-bold">GHS {Number(order.total || 0).toFixed(2)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </CardContent>
          </Card>
        )}

        {foundOrder && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className={`h-5 w-5 ${isAlreadyVerified ? "text-blue-500" : "text-green-600"}`} />
                {isAlreadyVerified ? "Already Verified" : `Verify Order #${foundOrder.orderNumber}`}
              </CardTitle>
              <CardDescription>
                {isAlreadyVerified
                  ? `Order #${foundOrder.orderNumber} has already been completed.`
                  : foundOrder.deliveryMethod !== "pickup"
                  ? "This order is not a pickup order."
                  : foundOrder.status !== "ready"
                  ? `Order status is "${foundOrder.status}" — must be "ready" to verify.`
                  : "Provide the customer's QR code or OTP to complete this pickup."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-semibold">#{foundOrder.orderNumber}</p>
                    {foundOrder.buyerName && <p className="text-muted-foreground">Customer: {foundOrder.buyerName}</p>}
                    {foundOrder.buyerPhone && <p className="text-muted-foreground">Phone: {foundOrder.buyerPhone}</p>}
                    {foundOrder.storeName && <p className="text-muted-foreground">Store: {foundOrder.storeName}</p>}
                    {foundOrder.zoneName && <p className="text-muted-foreground">Station: {foundOrder.zoneName}</p>}
                  </div>
                  <div className="text-right">
                    <Badge className={`mb-1 text-xs ${statusColor(foundOrder.status)}`}>
                      {foundOrder.status === "completed" ? "Already Verified" : foundOrder.status.replace(/_/g, " ")}
                    </Badge>
                    <p className="font-bold">GHS {Number(foundOrder.total || 0).toFixed(2)}</p>
                  </div>
                </div>
              </div>

              {!isAlreadyVerified && foundOrder.deliveryMethod === "pickup" && foundOrder.status === "ready" ? (
                <>
                  {/* QR code input — mobile only (hidden on desktop where scanning is impractical) */}
                  <div className="block sm:hidden space-y-2">
                    <Label htmlFor="admin-qr" className="flex items-center gap-1 text-sm">
                      <QrCode className="h-4 w-4" /> QR Code
                    </Label>
                    <Input
                      id="admin-qr"
                      placeholder="Scan or paste QR code"
                      value={qrCode}
                      onChange={(e) => setQrCode(e.target.value)}
                    />
                  </div>

                  {/* Separator only on mobile */}
                  <div className="flex items-center gap-3 sm:hidden">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs text-muted-foreground">or</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="admin-otp" className="flex items-center gap-1 text-sm">
                      <KeyRound className="h-4 w-4" /> OTP Code
                    </Label>
                    <Input
                      id="admin-otp"
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
                      onClick={() => { setFoundOrder(null); setSearchResults([]); setOrderSearch(""); setQrCode(""); setOtp(""); }}
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
              ) : !isAlreadyVerified ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4 text-sm text-muted-foreground">
                  <Package className="h-5 w-5 flex-shrink-0" />
                  <span>
                    {foundOrder.deliveryMethod !== "pickup"
                      ? "Pickup verification only applies to orders with delivery method: pickup."
                      : "Order must be in 'ready' status before it can be verified."}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 p-4 text-sm text-blue-700 dark:text-blue-300">
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
                  <span>This order has already been verified and completed. No further action is needed.</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
