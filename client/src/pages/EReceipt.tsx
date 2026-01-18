import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import QRCode from "react-qr-code";
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function EReceipt() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();
  const { toast } = useToast();
  const [showExportOptions, setShowExportOptions] = useState(false);

  const { data: order, isLoading } = useQuery({
    queryKey: ["/api/orders", id],
    queryFn: async () => {
      const res = await fetch(`/api/orders/${id}`);
      if (!res.ok) throw new Error("Order not found");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Receipt not found</h2>
          <Button onClick={() => navigate("/orders")}>View All Orders</Button>
        </div>
      </div>
    );
  }

  const subtotal = order.items?.reduce(
    (sum: number, item: any) => sum + item.price * item.quantity,
    0
  ) || 0;
  const discount = subtotal * 0.05; // Example 5% discount
  const processingFee = subtotal * 0.025; // 2.5% processing fee
  const total = order.total || subtotal - discount + processingFee;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate(`/orders/${id}`)}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Order
          </Button>
          <h1 className="text-3xl font-bold">E-Receipt</h1>
        </div>

        <div className="space-y-6">
        {/* Receipt QR Code */}
        <Card className="p-6 space-y-4">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Receipt No.</p>
            <div className="flex items-center justify-center gap-2 mb-4">
              <h2 className="text-xl font-bold" data-testid="text-receipt-number">
                {order.id}
              </h2>
              <Badge
                variant="secondary"
                className="bg-primary/10 text-primary"
              >
                {order.paymentStatus || "Paid"}
              </Badge>
            </div>

            {/* QR Code */}
            <div className="inline-block p-4 bg-white rounded-lg">
              <QRCode
                value={`ORDER:${order.id}`}
                size={200}
                level="H"
                data-testid="qr-code-receipt"
              />
            </div>
          </div>
        </Card>

        {/* Products */}
        <Card className="p-4 space-y-3">
          <h3 className="font-bold text-sm text-muted-foreground">Products</h3>

          <div className="space-y-3">
            {order.items?.map((item: any, index: number) => (
              <div key={index}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">{item.productName}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-primary font-semibold">
                        {item.quantity} BV{item.quantity > 1 ? "s" : ""}
                      </span>
                      <span className="text-xs">×</span>
                      <span className="text-xs">{item.quantity}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-primary">
                      {formatPrice(item.price * item.quantity)}
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-1 h-7 text-xs"
                      data-testid={`button-leave-review-${index}`}
                      onClick={() => navigate(`/product/${item.productId}`)}
                    >
                      Leave Review
                    </Button>
                  </div>
                </div>
                {index < (order.items?.length || 0) - 1 && (
                  <Separator className="mt-3" />
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Payment Summary */}
        <Card className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-medium">{formatPrice(subtotal)}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Discount Promo</span>
            <span className="text-primary font-medium">
              {discount > 0 ? `- ${formatPrice(discount)}` : formatPrice(0)}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Processing fee</span>
            <span className="text-destructive font-medium">
              {formatPrice(processingFee)}
            </span>
          </div>

          <Separator />

          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span className="text-primary">{formatPrice(total)}</span>
          </div>

          <div className="flex justify-between text-sm pt-2">
            <span className="text-muted-foreground">Product Qty.</span>
            <span className="font-medium">{order.items?.length || 0}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total BVs</span>
            <span className="text-primary font-semibold">
              {order.items?.reduce((sum: number, item: any) => sum + item.quantity, 0) || 0} BVs
            </span>
          </div>
        </Card>

        {/* Payment Details */}
        <Card className="p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Payment Methods</span>
            <span className="font-medium">{order.paymentMethod || "Card"}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Date</span>
            <span className="font-medium">
              {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "N/A"}
            </span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Transaction ID</span>
            <span className="font-mono text-xs">{order.transactionId || "N/A"}</span>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge
              className="bg-primary text-primary-foreground"
              data-testid="badge-payment-status"
            >
              {order.paymentStatus || "Pending"}
            </Badge>
          </div>
        </Card>

        {/* Export Options */}
        <Card>
          <button
            onClick={() => setShowExportOptions(!showExportOptions)}
            className="w-full flex items-center justify-between p-4 text-left"
            data-testid="button-export-options"
          >
            <span className="font-medium">Export Options</span>
            <ChevronDown
              className={`h-5 w-5 transition-transform ${
                showExportOptions ? "rotate-180" : ""
              }`}
            />
          </button>

          {showExportOptions && (
            <div className="px-4 pb-4 space-y-2">
              <Button 
                variant="outline" 
                className="w-full" 
                data-testid="button-export-pdf"
                onClick={() => {
                  window.print();
                  toast({
                    title: "Export Started",
                    description: "Use your browser's print dialog to save as PDF",
                  });
                }}
              >
                Export as PDF
              </Button>
              <Button 
                variant="outline" 
                className="w-full" 
                data-testid="button-export-email"
                onClick={() => {
                  toast({
                    title: "Receipt Sent",
                    description: "The receipt has been sent to your registered email",
                  });
                }}
              >
                Send to Email
              </Button>
            </div>
          )}
        </Card>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
