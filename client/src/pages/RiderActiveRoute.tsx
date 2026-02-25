import { useState, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, MapPin, Navigation, Package, QrCode, Phone, User, Video, MessageSquare } from "lucide-react";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import { JitsiCallDialog } from "@/components/JitsiCallDialog";
import { useToast } from "@/hooks/use-toast";

// Lazy load heavy map components
const RiderNavigationMap = lazy(() => import("@/components/RiderNavigationMap"));
const DeliveryQRScanner = lazy(() => import("@/components/DeliveryQRScanner"));

interface ActiveDelivery {
  id: string;
  orderNumber: string;
  status: string;
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  qrCode?: string;
}

const COMMUNICATION_ACTIVE_STATUSES = new Set([
  "ready",
  "searching_rider",
  "assigned",
  "rider_arrived",
  "picked_up",
  "in_transit",
  "en_route",
  "delivering",
  "arrived",
]);

export default function RiderActiveRoute() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("navigation");
  const jitsiCall = useJitsiCall(user?.id || '');

  const { data: activeDelivery, isLoading, refetch } = useQuery<ActiveDelivery | null>({
    queryKey: ["/api/rider/active-delivery"],
    queryFn: async () => {
      const base = (import.meta.env as any).VITE_API_URL || "";
      const res = await fetch(`${base}/api/rider/active-delivery`, { credentials: "include" });
      if (!res.ok) {
        if (res.status === 404) return null;
        throw new Error("Failed to fetch active delivery");
      }
      return res.json();
    },
  });

  const handleDeliveryComplete = () => {
    refetch();
    setActiveTab("navigation");
  };

  const normalizedStatus = String(activeDelivery?.status || "").toLowerCase().trim();
  const canUseDeliveryComms = COMMUNICATION_ACTIVE_STATUSES.has(normalizedStatus);

  return (
    <DashboardLayout role="rider">
      <div className="p-4 md:p-6">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold" data-testid="text-page-title">Active Delivery</h1>
          <p className="text-muted-foreground">Navigate to destination and complete delivery</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !activeDelivery ? (
          <Card className="p-12">
            <div className="text-center">
              <Navigation className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Active Delivery</h3>
              <p className="text-muted-foreground">You don't have any active deliveries at the moment.</p>
              <p className="text-muted-foreground text-sm mt-2">Check your pending orders to accept a new delivery.</p>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Order Info Card */}
            <Card className="p-4" data-testid="card-active-delivery">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <Package className="h-6 w-6 text-primary" />
                  <div>
                    <p className="font-semibold">Order #{activeDelivery.orderNumber}</p>
                    <Badge className="bg-blue-500 text-white mt-1">
                      {activeDelivery.status.replace(/_/g, " ").toUpperCase()}
                    </Badge>
                  </div>
                </div>
                
                {/* Buyer Contact - In-App Chat & Call */}
                <div className="flex items-center gap-2">
                  {activeDelivery.buyerId && canUseDeliveryComms && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/chat?userId=${activeDelivery.buyerId}`)}
                        className="flex items-center gap-1.5"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">Chat</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          if (activeDelivery.buyerId) {
                            jitsiCall.startCall(activeDelivery.buyerId, 'voice');
                          }
                        }}
                        disabled={jitsiCall.inCall}
                        className="flex items-center gap-1.5"
                      >
                        <Phone className="h-4 w-4" />
                        <span className="hidden sm:inline">Call</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => {
                          if (activeDelivery.buyerId) {
                            jitsiCall.startCall(activeDelivery.buyerId, 'video');
                          }
                        }}
                        disabled={jitsiCall.inCall}
                        className="flex items-center gap-1.5 bg-primary"
                      >
                        <Video className="h-4 w-4" />
                        <span className="hidden sm:inline">Video</span>
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex items-start gap-3">
                <MapPin className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Delivery Address</p>
                  <p className="text-muted-foreground text-sm">{activeDelivery.deliveryAddress}</p>
                </div>
              </div>

              {activeDelivery.buyerName && (
                <div className="mt-3 flex items-center gap-3">
                  <User className="h-5 w-5 text-gray-500 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Customer</p>
                    <p className="text-muted-foreground text-sm">{activeDelivery.buyerName}</p>
                  </div>
                </div>
              )}
            </Card>

            {/* Navigation & QR Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="navigation" className="flex items-center gap-2">
                  <Navigation className="h-4 w-4" />
                  Navigation
                </TabsTrigger>
                <TabsTrigger value="scan" className="flex items-center gap-2">
                  <QrCode className="h-4 w-4" />
                  Scan QR
                </TabsTrigger>
              </TabsList>

              <TabsContent value="navigation" className="mt-4">
                <Suspense fallback={
                  <Card className="p-6">
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  </Card>
                }>
                  {activeDelivery.deliveryLatitude && activeDelivery.deliveryLongitude ? (
                    <RiderNavigationMap
                      riderId={user?.id?.toString() || ""}
                      delivery={{
                        orderId: activeDelivery.id,
                        orderNumber: activeDelivery.orderNumber,
                        buyerName: activeDelivery.buyerName || "Customer",
                        buyerPhone: activeDelivery.buyerPhone || "",
                        deliveryAddress: activeDelivery.deliveryAddress,
                        deliveryLatitude: activeDelivery.deliveryLatitude,
                        deliveryLongitude: activeDelivery.deliveryLongitude,
                        status: activeDelivery.status,
                      }}
                    />
                  ) : (
                    <Card className="p-6">
                      <div className="text-center py-6">
                        <MapPin className="h-10 w-10 text-amber-500 mx-auto mb-3" />
                        <h3 className="font-semibold mb-2">GPS Coordinates Not Available</h3>
                        <p className="text-muted-foreground text-sm mb-4">
                          This order doesn't have GPS coordinates for turn-by-turn navigation.
                        </p>
                        <Button 
                          onClick={() => {
                            const mapsUrl = `https://www.openstreetmap.org/search?query=${encodeURIComponent(activeDelivery.deliveryAddress)}`;
                            window.open(mapsUrl, '_blank');
                          }}
                          data-testid="button-navigate"
                        >
                          <Navigation className="h-4 w-4 mr-2" />
                          Open in OpenStreetMap
                        </Button>
                      </div>
                    </Card>
                  )}
                </Suspense>
              </TabsContent>

              <TabsContent value="scan" className="mt-4">
                <Suspense fallback={
                  <Card className="p-6">
                    <div className="flex justify-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  </Card>
                }>
                  <Card className="p-4">
                    <div className="mb-4">
                      <h3 className="font-semibold flex items-center gap-2">
                        <QrCode className="h-5 w-5" />
                        Complete Delivery
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Scan the customer's QR code to confirm delivery
                      </p>
                    </div>
                    <DeliveryQRScanner
                      orderId={activeDelivery.id}
                      orderNumber={activeDelivery.orderNumber}
                      expectedQRCode={activeDelivery.qrCode || ""}
                      onScanSuccess={handleDeliveryComplete}
                    />
                  </Card>
                </Suspense>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Jitsi Call Dialog */}
      <JitsiCallDialog
        isOpen={jitsiCall.inCall || !!jitsiCall.incomingCall}
        roomUrl={jitsiCall.getJitsiUrl()}
        roomName={jitsiCall.currentRoom?.roomName || null}
        jitsiConfig={jitsiCall.jitsiConfig}
        callType={jitsiCall.currentRoom?.callType || jitsiCall.incomingCall?.callType || 'voice'}
        participants={[]}
        isHost={true}
        incomingCall={jitsiCall.incomingCall}
        onAccept={jitsiCall.acceptIncomingCall}
        onReject={jitsiCall.rejectIncomingCall}
        onLeave={jitsiCall.leaveCall}
        onEnd={jitsiCall.endCall}
        isJoining={jitsiCall.isJoining}
      />
    </DashboardLayout>
  );
}
