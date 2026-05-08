import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, Package, MapPin, Star, MessageSquare, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import QRCodeDisplay from "@/components/QRCodeDisplay";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { clearAllPersistedCheckoutCoupons } from "@/lib/checkoutCoupon";
import { fetchSameOrigin, fetchSameOriginJson, queryClient } from "@/lib/queryClient";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  currency: string;
  status: string;
  deliveryMethod?: "pickup" | "bus" | "rider" | string;
  deliveryAddress: string;
  qrCode?: string | null;
  deliveryOtp?: string | null;
  pickupOtp?: string | null;
  createdAt: string;
}

export default function PaymentSuccess() {
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const cleanupCompletedRef = useRef(false);
  const orderId =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("orderId")
      : null;

  const [selectedProductForReview, setSelectedProductForReview] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const { data: order, isLoading, isError } = useQuery<Order>({
    queryKey: [`/api/orders/${orderId}`],
    queryFn: () => fetchSameOriginJson<Order>(`/api/orders/${orderId}`),
    enabled: !!orderId,
    // Retry generously — the server may still be processing the payment when we land here
    retry: 6,
    retryDelay: 1500,
    staleTime: 0,
  });
  const isPickupOrder = ((order?.deliveryMethod || "").toLowerCase() === "pickup");

  const { data: orderItems = [] } = useQuery<Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
    image?: string | null;
    selectedColor?: string | null;
    selectedSize?: string | null;
  }>>({
    queryKey: [`/api/orders/${orderId}/items`],
    queryFn: () =>
      fetchSameOriginJson<
        Array<{
          productId: string;
          productName: string;
          quantity: number;
          price: string;
          image?: string | null;
          selectedColor?: string | null;
          selectedSize?: string | null;
        }>
      >(`/api/orders/${orderId}/items`),
    enabled: !!orderId,
  });

  const submitReviewMutation = useMutation({
    mutationFn: async ({ productId, rating, comment }: { productId: string; rating: number; comment: string }) => {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, rating, comment }),
      });
      if (!res.ok) throw new Error("Failed to submit review");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Review submitted!",
        description: "Thank you for your feedback.",
      });
      setSelectedProductForReview(null);
      setReviewRating(5);
      setReviewComment("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to submit review",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!order || cleanupCompletedRef.current) {
      return;
    }

    cleanupCompletedRef.current = true;
      clearAllPersistedCheckoutCoupons();
      queryClient.setQueryData(["/api/cart"], []);
      void fetchSameOrigin("/api/cart", {
        method: "DELETE",
        credentials: "include",
      }).catch(() => {});
      void queryClient.invalidateQueries({ queryKey: ["/api/cart"] });
      void queryClient.refetchQueries({ queryKey: ["/api/cart"], type: "active" });
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("kiyumart.checkout.lastPaidOrderId");
      }

      toast({
        title: "Payment Successful! 🎉",
        description: `Order ${order.orderNumber} has been confirmed. You'll receive updates on your order status.`,
        duration: 5000,
      });

      // Show browser notification if permitted
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Payment Successful! 🎉", {
          body: `Order ${order.orderNumber} has been confirmed`,
          icon: "/logo.png",
        });
      }
  }, [order, toast]);

  if (!orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Invalid Request</CardTitle>
            <CardDescription>No order information found</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/")} className="w-full">
              Go to Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-2">
              <CheckCircle className="h-9 w-9 text-primary" />
            </div>
            <CardTitle>Payment Confirmed!</CardTitle>
            <CardDescription>Your payment was successful. Loading your order details…</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <Button variant="outline" onClick={() => navigate("/orders")} className="w-full">
              View My Orders
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError && !order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mx-auto mb-2">
              <CheckCircle className="h-9 w-9 text-primary" />
            </div>
            <CardTitle>Payment Successful!</CardTitle>
            <CardDescription>
              Your payment went through. We're having trouble loading the order details right now —
              your order is safely recorded. Check your orders page or wait a moment and refresh.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button onClick={() => navigate("/orders")} className="w-full">
              View My Orders
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <CardTitle>Loading Order…</CardTitle>
            <CardDescription>Please wait while we retrieve your order details.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
            <Button variant="outline" onClick={() => navigate("/orders")} className="w-full">
              View My Orders
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 py-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Success Message */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
              <CheckCircle className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-2" data-testid="text-success-title">
              Payment Successful! 🎉
            </h1>
            <p className="text-muted-foreground text-lg">
              Thank you for your order. Your payment has been confirmed.
            </p>
          </div>

          {/* Order Details Card */}
          <Card className="mb-6" data-testid="card-order-details">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Order Details</CardTitle>
                  <CardDescription>Order #{order.orderNumber}</CardDescription>
                </div>
                <Badge className="bg-primary text-primary-foreground" data-testid="badge-status">
                  {order.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Order Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Order Number</p>
                  <p className="font-semibold" data-testid="text-order-number">
                    {order.orderNumber}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
                  <p className="font-semibold text-primary text-xl" data-testid="text-total">
                    {formatPrice(parseFloat(order.total))}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Order Date</p>
                  <p className="font-semibold" data-testid="text-date">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Payment Status</p>
                  <Badge variant="default" data-testid="badge-payment">
                    Paid
                  </Badge>
                </div>
              </div>

              <Separator />

              {/* Fulfillment Information */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Fulfillment Information
                </h3>
                <div className="space-y-2 text-sm">
                  <p className="text-muted-foreground">Method</p>
                  <p className="capitalize" data-testid="text-fulfillment-method">{order.deliveryMethod || "pickup"}</p>
                  {!isPickupOrder && (
                    <>
                      <p className="text-muted-foreground pt-1">Address</p>
                      <p data-testid="text-address">{order.deliveryAddress}</p>
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Verification QR/OTP */}
              <div className="flex justify-center">
                <div className="text-center">
                  <QRCodeDisplay value={order.qrCode || order.orderNumber} />
                  {isPickupOrder && order.pickupOtp && (
                    <p className="text-sm font-semibold mt-3">Pickup OTP: {order.pickupOtp}</p>
                  )}
                  {!isPickupOrder && order.deliveryOtp && (
                    <p className="text-sm font-semibold mt-3">Delivery OTP: {order.deliveryOtp}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-3 max-w-md">
                    {isPickupOrder
                      ? "When collecting from store, show either this QR code or your Pickup OTP to the pickup station agent."
                      : "When your rider arrives, share either this QR code or your Delivery OTP to confirm order handover."}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Items Ordered */}
          {orderItems.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  Items Ordered
                </CardTitle>
                <CardDescription>
                  {orderItems.length} item{orderItems.length === 1 ? "" : "s"} in this order
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="divide-y">
                  {orderItems.map((item) => (
                    <div key={item.productId} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.productName}
                          className="h-16 w-16 rounded-lg object-cover flex-shrink-0 bg-muted border"
                        />
                      ) : (
                        <div className="h-16 w-16 rounded-lg bg-muted flex-shrink-0 flex items-center justify-center border">
                          <Package className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.productName}</p>
                        {(item.selectedColor || item.selectedSize) && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {[item.selectedColor && `Color: ${item.selectedColor}`, item.selectedSize && `Size: ${item.selectedSize}`].filter(Boolean).join(" · ")}
                          </p>
                        )}
                        <p className="text-sm text-muted-foreground mt-0.5">Qty: {item.quantity}</p>
                      </div>
                      <p className="font-semibold text-right shrink-0">
                        {formatPrice(parseFloat(item.price) * item.quantity)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Review Section */}
          {orderItems.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Share Your Experience
                </CardTitle>
                <CardDescription>
                  Help other customers by reviewing the products you purchased
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {orderItems.map((item) => (
                    <div key={item.productId} className="flex items-center gap-3 p-3 border rounded-lg">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.productName}
                          className="h-10 w-10 rounded-md object-cover flex-shrink-0 bg-muted border"
                        />
                      ) : (
                        <div className="h-10 w-10 rounded-md bg-muted flex-shrink-0 flex items-center justify-center border">
                          <Package className="h-4 w-4 text-muted-foreground/40" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium truncate text-sm">{item.productName}</h4>
                        <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProductForReview(item.productId)}
                        disabled={submitReviewMutation.isPending}
                        className="shrink-0"
                      >
                        Write Review
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Review Form Modal */}
                {selectedProductForReview && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedProductForReview(null)} />
                    <Card className="w-full max-w-md relative max-h-[90vh] overflow-y-auto">
                      <CardHeader>
                        <CardTitle>Write a Review</CardTitle>
                        <CardDescription>
                          {orderItems.find(item => item.productId === selectedProductForReview)?.productName}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Rating */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">Rating</label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => setReviewRating(star)}
                                className="focus:outline-none"
                              >
                                <Star
                                  className={`h-6 w-6 ${
                                    star <= reviewRating
                                      ? "fill-yellow-400 text-yellow-400"
                                      : "text-gray-300"
                                  }`}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Comment */}
                        <div>
                          <label className="text-sm font-medium mb-2 block">Comment (Optional)</label>
                          <Textarea
                            placeholder="Share your thoughts about this product..."
                            value={reviewComment}
                            onChange={(e) => setReviewComment(e.target.value)}
                            rows={3}
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-2 pt-4">
                          <Button
                            variant="outline"
                            onClick={() => setSelectedProductForReview(null)}
                            className="flex-1"
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={() => {
                              if (selectedProductForReview) {
                                submitReviewMutation.mutate({
                                  productId: selectedProductForReview,
                                  rating: reviewRating,
                                  comment: reviewComment,
                                });
                              }
                            }}
                            disabled={submitReviewMutation.isPending}
                            className="flex-1"
                          >
                            {submitReviewMutation.isPending ? "Submitting..." : "Submit Review"}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              onClick={() => navigate("/track")}
              className="w-full"
              data-testid="button-track-order"
            >
              <MapPin className="h-4 w-4 mr-2" />
              {isPickupOrder ? "View Order Status" : "Track Order"}
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/orders")}
              className="w-full"
              data-testid="button-view-orders"
            >
              <Package className="h-4 w-4 mr-2" />
              View All Orders
            </Button>
            <Button
              onClick={() => navigate("/")}
              className="w-full"
              data-testid="button-continue-shopping"
            >
              Continue Shopping
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
