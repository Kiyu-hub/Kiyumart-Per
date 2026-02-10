import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { CheckCircle, Package, MapPin, Clock, Phone, Mail, Star, MessageSquare } from "lucide-react";
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
import { useAuth } from "@/lib/auth";

interface Order {
  id: string;
  orderNumber: string;
  total: string;
  currency: string;
  status: string;
  deliveryAddress: string;
  deliveryPhone: string;
  deliveryEmail: string;
  createdAt: string;
}

export default function PaymentSuccess() {
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const { user } = useAuth();
  const searchParams = new URLSearchParams(window.location.search);
  const orderId = searchParams.get("orderId");

  const [selectedProductForReview, setSelectedProductForReview] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");

  const { data: order, isLoading } = useQuery<Order>({
    queryKey: [`/api/orders/${orderId}`],
    enabled: !!orderId,
  });

  const { data: orderItems = [] } = useQuery<Array<{
    productId: string;
    productName: string;
    quantity: number;
    price: string;
  }>>({
    queryKey: [`/api/orders/${orderId}/items`],
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
    if (order) {
      // Show in-app notification
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading order details...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Order Not Found</CardTitle>
            <CardDescription>Unable to retrieve order information</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/orders")} className="w-full">
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

              {/* Delivery Information */}
              <div className="space-y-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  Delivery Information
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Address</p>
                      <p data-testid="text-address">{order.deliveryAddress}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Phone</p>
                      <p data-testid="text-phone">{order.deliveryPhone}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div>
                      <p className="text-muted-foreground">Email</p>
                      <p data-testid="text-email">{order.deliveryEmail}</p>
                    </div>
                  </div>
                </div>
              </div>

              <Separator />

              {/* QR Code */}
              <div className="flex justify-center">
                <QRCodeDisplay value={order.orderNumber} />
              </div>
            </CardContent>
          </Card>

          {/* Next Steps */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                What's Next?
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-semibold text-primary">1</span>
                </div>
                <div>
                  <p className="font-medium">Order Confirmation</p>
                  <p className="text-sm text-muted-foreground">
                    You'll receive a confirmation email with your order details
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-semibold text-primary">2</span>
                </div>
                <div>
                  <p className="font-medium">Order Processing</p>
                  <p className="text-sm text-muted-foreground">
                    We're preparing your order for shipment
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-semibold text-primary">3</span>
                </div>
                <div>
                  <p className="font-medium">Delivery Updates</p>
                  <p className="text-sm text-muted-foreground">
                    Track your order in real-time with live updates
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

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
                <div className="space-y-4">
                  {orderItems.map((item) => (
                    <div key={item.productId} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{item.productName}</h4>
                        <p className="text-sm text-muted-foreground">Quantity: {item.quantity}</p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedProductForReview(item.productId)}
                        disabled={submitReviewMutation.isPending}
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
                    <Card className="w-full max-w-md relative">
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
              Track Order
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
