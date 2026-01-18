import { useLocation, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Package, Truck, CheckCircle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const statusSteps = [
  { id: "pending", label: "Pending", icon: Package },
  { id: "processing", label: "Processing", icon: Package },
  { id: "delivering", label: "Out for Delivery", icon: Truck },
  { id: "delivered", label: "Delivered", icon: CheckCircle },
];

export default function TrackOrder() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { formatPrice } = useLanguage();

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
          <p className="text-muted-foreground">Loading order...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center">
          <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Order not found</h2>
          <Button onClick={() => navigate("/orders")}>View All Orders</Button>
        </div>
      </div>
    );
  }

  const currentStepIndex = statusSteps.findIndex(
    (step) => step.id === order.status
  );

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => navigate("/orders")}
            className="mb-4"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Orders
          </Button>
          <h1 className="text-3xl font-bold">Track Order</h1>
        </div>

        <div className="space-y-6">
        {/* Order Info Card */}
        <Card className="p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-sm text-muted-foreground">Order #{order.id}</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm font-medium">{order.items?.length || 0} Item(s)</span>
                <span className="text-sm text-primary font-bold">
                  {formatPrice(order.total)}
                </span>
              </div>
            </div>
            <Badge
              className="bg-primary/10 text-primary border-primary/20"
              data-testid="badge-order-status"
            >
              {order.paymentStatus || "Pending"}
            </Badge>
          </div>

          {/* Order Items */}
          {order.items?.map((item: any, index: number) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
            >
              {item.productImage && (
                <img
                  src={item.productImage}
                  alt={item.productName}
                  className="w-16 h-16 object-cover rounded-md"
                />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm truncate">{item.productName}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatPrice(item.price)} × {item.quantity}
                </p>
              </div>
              <div className="text-sm font-bold text-primary">
                {formatPrice(item.price * item.quantity)}
              </div>
            </div>
          ))}
        </Card>

        {/* Delivery Timeline */}
        <Card className="p-6">
          <h3 className="font-bold mb-6 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            {statusSteps[currentStepIndex]?.label || "In Progress"}
          </h3>

          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border" />

            {/* Steps */}
            <div className="space-y-6">
              {statusSteps.map((step, index) => {
                const Icon = step.icon;
                const isCompleted = index <= currentStepIndex;
                const isCurrent = index === currentStepIndex;

                return (
                  <div key={step.id} className="relative flex items-start gap-4">
                    <div
                      className={cn(
                        "relative z-10 flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors",
                        isCompleted
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-background border-border text-muted-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 pt-1">
                      <p
                        className={cn(
                          "font-medium",
                          isCompleted ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {step.label}
                      </p>
                      {isCurrent && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Current status
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Delivery Address */}
        {order.shippingAddress && (
          <Card className="p-4">
            <h3 className="font-bold mb-3 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Delivery Address
            </h3>
            <p className="text-sm text-muted-foreground whitespace-pre-line">
              {order.shippingAddress}
            </p>
          </Card>
        )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
