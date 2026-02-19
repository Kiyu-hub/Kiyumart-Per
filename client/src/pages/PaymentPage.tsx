import { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  currency: string;
  status: string;
  paymentStatus: string;
  buyerId: string;
}

export default function PaymentPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
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

  const { data: order, isLoading: orderLoading, error } = useQuery<Order>({
    queryKey: ["/api/orders", orderId],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        if (res.status === 404) throw new Error("Order not found");
        if (res.status === 403) throw new Error("You don't have permission to access this order");
        throw new Error(errorData.error || "Failed to load order");
      }
      return res.json();
    },
    enabled: !!orderId && isAuthenticated,
  });

  const initializePaymentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/payments/initialize", { orderId });
      const data = await res.json();
      
      if (!res.ok) {
        const errorMessage = data.userMessage || data.error || "Failed to initialize payment";
        throw new Error(errorMessage);
      }
      
      if (!data.authorization_url) {
        throw new Error("Payment system returned invalid data. Please try again.");
      }
      
      return data;
    },
    onSuccess: (data) => {
      if (data.authorization_url) {
        window.location.href = data.authorization_url;
      }
    },
    onError: (error: any) => {
      const errorMessage = error.message || "Failed to initialize payment. Please check your connection and try again.";
      toast({
        title: "Payment Initialization Failed",
        description: errorMessage,
        variant: "destructive",
      });
      setIsInitializing(false);
    },
  });

  const handlePayNow = async () => {
    setIsInitializing(true);
    initializePaymentMutation.mutate();
  };

  if (authLoading || orderLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" data-testid="loader-payment" />
      </div>
    );
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
            <Button onClick={() => navigate(`/track?orderId=${order.id}`)} className="w-full" data-testid="button-track">
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
            <CardTitle>Payment Processing</CardTitle>
            <CardDescription>
              Payment for order #{order.orderNumber} is currently processing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => navigate(`/track?orderId=${order.id}`)} className="w-full" data-testid="button-track">
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
                  Redirecting to Paystack...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Pay with Paystack
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
            You'll be redirected to Paystack's secure payment page
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
