import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOriginJson, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import { PageLoadingState } from "@/components/ui/loading-state";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { loadPaystackInlineScript, PaystackInlineService, resetPaystackGuard } from "@/lib/paystackInline";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  currency: string;
  status: string;
  paymentStatus: string;
  buyerId: string;
}

interface InlinePaymentInitializeResponse {
  reference: string;
  access_code?: string;
  authorization_url?: string;
  inline?: {
    publicKey: string;
    email: string;
    amount: number;
    currency: string;
    reference: string;
    accessCode?: string;
    channels?: string[];
  };
}

interface PaymentVerificationResult {
  verified: boolean;
  message: string;
  orderId?: string;
  transaction?: {
    id: string;
    orderId: string;
    amount: string;
    status: string;
  };
}

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading, ensureAuthenticated } = useAuth();
  const { toast } = useToast();
  const { formatPrice } = useLanguage();
  const [isInitializing, setIsInitializing] = useState(false);
  const normalizePaymentStatus = (value?: string) => {
    const s = (value || "").toLowerCase().trim();
    if (s === "payment_pending") return "pending";
    if (s === "payment_failed") return "failed";
    if (s === "completed" || s === "paid") return "paid";
    return s || "pending";
  };
  const normalizeOrderStatus = (value?: string) => (value || "").toLowerCase().trim();

  useEffect(() => {
    if (!isAuthenticated && !authLoading) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, navigate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void loadPaystackInlineScript().catch(() => {
      // Let the on-demand initialize flow surface errors if preload fails.
    });
  }, [isAuthenticated]);

  const { data: order, isLoading: orderLoading, error } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      try {
        return await fetchSameOriginJson<Order>(`/api/orders/${orderId}`, {
          cache: "no-store",
        });
      } catch (error: any) {
        const message = String(error?.message || "");
        if (message.startsWith("404:")) throw new Error("Order not found");
        if (message.startsWith("403:")) throw new Error("You don't have permission to access this order");
        throw new Error(message.replace(/^\d+:\s*/, "") || "Failed to load order");
      }
    },
    enabled: !!orderId && isAuthenticated,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const initializePaymentMutation = useMutation({
    mutationFn: async () => {
      const authenticated = await ensureAuthenticated();
      if (!authenticated) {
        throw new Error("Your session has expired. Please log in again to continue.");
      }

      const data = await fetchSameOriginJson<InlinePaymentInitializeResponse>("/api/payments/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, forceRetry: true, inline: true }),
      });

      const inline = data.inline;
      if (!inline?.publicKey || !inline.reference || !inline.amount) {
        throw new Error("Payment system returned invalid data. Please try again.");
      }

      resetPaystackGuard();
      let reference: string;
      try {
        reference = await PaystackInlineService.pay({
          publicKey: inline.publicKey,
          email: inline.email,
          amount: inline.amount,
          currency: inline.currency || "GHS",
          reference: inline.reference,
          accessCode: inline.accessCode,
          channels: inline.channels,
        });
      } catch (inlineError: any) {
        const inlineMessage = String(inlineError?.message || "");
        const canFallbackToHostedCheckout =
          /could not load paystack payment tools|paystack payment tools took too long to load/i.test(
            inlineMessage,
          ) && data.authorization_url;
        if (canFallbackToHostedCheckout) {
          window.location.assign(data.authorization_url!);
          return { verified: false, message: "Redirecting to secure payment...", orderId };
        }
        throw inlineError;
      }

      try {
        const verification = await fetchSameOriginJson<PaymentVerificationResult>(
          `/api/payments/verify/${encodeURIComponent(reference)}`,
          { cache: "no-store" }
        );
        const resolvedOrderId = verification.orderId || verification.transaction?.orderId;
        if (!verification.verified || !resolvedOrderId) {
          throw new Error(verification.message || "Payment could not be confirmed.");
        }
        return { ...verification, orderId: resolvedOrderId };
      } catch (verifyError: any) {
        const verifyMessage = String(verifyError?.message || "");
        if (!verifyMessage.startsWith("401:")) {
          throw verifyError;
        }

        const verification = await fetchSameOriginJson<PaymentVerificationResult>(
          `/api/payments/verify-public/${encodeURIComponent(reference)}`,
          { cache: "no-store" }
        );
        const resolvedOrderId = verification.orderId || verification.transaction?.orderId;
        if (!verification.verified || !resolvedOrderId) {
          throw new Error(verification.message || "Payment could not be confirmed.");
        }
        return { ...verification, orderId: resolvedOrderId };
      }
    },
    onSuccess: (data) => {
      setIsInitializing(false);
      if (data.verified && data.orderId) {
        queryClient.setQueryData(["/api/cart"], []);
        void queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
        void queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        navigate(`/payment/success?orderId=${data.orderId}`);
      }
    },
    onError: (error: any) => {
      const rawMessage = String(error?.message || "");
      const wasCancelled = /cancelled/i.test(rawMessage);
      const normalizedMessage = rawMessage.replace(/^\d+:\s*/, "").trim();
      const isPaystackLoadIssue =
        /could not load paystack payment tools|paystack payment tools took too long to load/i.test(
          normalizedMessage,
        );
      const errorMessage = rawMessage.startsWith("401:")
        ? "Your session expired while preparing payment. Please log in again and try once more."
        : wasCancelled
          ? "Payment was cancelled. You can try again whenever you are ready."
          : isPaystackLoadIssue
            ? "Secure payment is taking longer than expected to open. Please try again in a moment."
            : normalizedMessage || "Failed to initialize payment. Please check your connection and try again.";
      toast({
        title: wasCancelled ? "Payment Cancelled" : "Payment Initialization Failed",
        description: errorMessage,
        variant: wasCancelled ? "default" : "destructive",
      });
      setIsInitializing(false);
    },
  });

  const handlePayNow = async () => {
    setIsInitializing(true);
    initializePaymentMutation.mutate();
  };

  if (authLoading || orderLoading) {
    return <PageLoadingState title="Loading payment page" description="Checking the order and preparing secure payment details." />;
  }

  if (error || !order) {
    const errorMessage = error 
      ? (error as Error).message 
      : "We couldn't find the order you're trying to pay for";
    
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              <CardTitle>Unable to Load Order</CardTitle>
            </div>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full" data-testid="button-home">
              Return to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const paymentStatus = normalizePaymentStatus(order.paymentStatus);
  const orderStatus = normalizeOrderStatus(order.status);

  if (paymentStatus === "paid") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Payment Already Completed</CardTitle>
            <CardDescription>
              Order #{order.orderNumber} has already been paid
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => navigate(`/track/${encodeURIComponent(order.id)}`)} className="w-full" data-testid="button-track">
              Track Order
            </Button>
            <Button onClick={() => navigate("/")} variant="outline" className="w-full" data-testid="button-home">
              Continue Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (paymentStatus === "processing" && orderStatus !== "pending") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Payment Not Completed</CardTitle>
            <CardDescription>
              Order #{order.orderNumber} has an unfinished payment attempt. Continue payment to complete checkout.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={handlePayNow} className="w-full" data-testid="button-pay-now-processing" disabled={isInitializing}>
              {isInitializing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening secure payment...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Continue Payment
                </>
              )}
            </Button>
            <Button onClick={() => navigate("/")} variant="outline" className="w-full" data-testid="button-home">
              Continue Shopping
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <CardTitle>Complete Your Payment</CardTitle>
          </div>
          <CardDescription>
            You're about to pay for order #{order.orderNumber}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Order Number</span>
              <span className="font-medium" data-testid="text-order-number">#{order.orderNumber}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-medium" data-testid="text-payment-amount">
                {formatPrice(parseFloat(order.total))}
              </span>
            </div>
          </div>

          <div className="space-y-3">
            <Button
              className="w-full"
              size="lg"
              onClick={handlePayNow}
              disabled={isInitializing}
              data-testid="button-pay-now"
            >
              {isInitializing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Opening secure payment...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay Securely
                </>
              )}
            </Button>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate("/")}
              disabled={isInitializing}
              data-testid="button-cancel-payment"
            >
              Cancel
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Secure payment powered by Paystack. Your payment opens in-app without leaving checkout.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
