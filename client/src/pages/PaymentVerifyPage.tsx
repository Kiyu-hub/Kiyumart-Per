import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";

interface VerificationResult {
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

export default function PaymentVerifyPage() {
  const [, navigate] = useLocation();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // Accept both `reference` and legacy `trxref` query params from Paystack
    const ref = params.get("reference") || params.get("trxref");

    if (ref) {
      setReference(ref);
    } else if (!authLoading) {
      navigate("/");
    }
  }, [authLoading, navigate]);

  const { data: verification, isLoading, error } = useQuery<VerificationResult>({
    queryKey: ["/api/payments/verify", reference, isAuthenticated],
    queryFn: async () => {
      // Choose public or authenticated verify endpoint depending on auth state
      const url = isAuthenticated ? `/api/payments/verify/${reference}` : `/api/payments/verify-public/${reference}`;
      const res = await fetch(url);
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errorMessage = errorData.userMessage || errorData.error || "Failed to verify payment. Please contact support with your payment reference.";
        throw new Error(errorMessage);
      }
      const result = await res.json();
      
      if (!result.verified && !result.message) {
        throw new Error("Payment verification returned unexpected result. Please contact support.");
      }
      
      if (result.verified && result.transaction) {
        queryClient.invalidateQueries({ queryKey: ["/api/orders", result.transaction.orderId] });
        queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
        queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      }
      // Debug log to trace verification in test runs
      // eslint-disable-next-line no-console
      console.log('PaymentVerifyPage: fetched verification', result);
      
      return result;
    },
    enabled: !!reference,
    retry: 2, // Retry up to 2 times for network errors
    retryDelay: 1000, // Wait 1 second between retries
  });

  useEffect(() => {
    if (verification) {
      // eslint-disable-next-line no-console
      console.log('PaymentVerifyPage: verification result', verification);
      if (verification.verified && verification.orderId) {
        const timer = setTimeout(() => {
          // eslint-disable-next-line no-console
          console.log('PaymentVerifyPage: navigating to success', verification.orderId);
          navigate(`/payment/success?orderId=${verification.orderId}`);
        }, 500);
        return () => clearTimeout(timer);
      } else {
        const timer = setTimeout(() => {
          // eslint-disable-next-line no-console
          console.log('PaymentVerifyPage: navigating to failure', verification.message);
          navigate(`/payment/failure?reason=${encodeURIComponent(verification.message || "Payment failed")}`);
        }, 500);
        return () => clearTimeout(timer);
      }
    }
  }, [verification, navigate]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => {
        navigate(`/payment/failure?reason=${encodeURIComponent((error as Error).message || "Verification failed")}`);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [error, navigate]);

  if (authLoading || isLoading || !reference) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Verifying Payment
            </CardTitle>
            <CardDescription>Please wait while we confirm your payment...</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Verifying Payment
          </CardTitle>
          <CardDescription>Please wait while we confirm your payment...</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
