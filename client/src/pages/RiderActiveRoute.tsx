import { useState, lazy, Suspense, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, MapPin, Navigation, Package, QrCode, Phone, MessageSquare, ChevronDown } from "lucide-react";
import { useJitsiCall } from "@/hooks/useJitsiCall";
import { JitsiCallDialog } from "@/components/JitsiCallDialog";
import { useToast } from "@/hooks/use-toast";
import UserAvatar from "@/components/UserAvatar";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { buildExternalNavigationUrl } from "@/tracking/providers/externalMapUrl";

// Lazy load heavy map components
const RiderNavigationMap = lazy(() => import("@/components/RiderNavigationMap"));
const DeliveryQRScanner = lazy(() => import("@/components/DeliveryQRScanner"));

interface ActiveDelivery {
  id: string;
  orderNumber: string;
  status: string;
  deliveryMethod?: string;
  deliveryAddress: string;
  deliveryLatitude?: number;
  deliveryLongitude?: number;
  buyerId?: string;
  buyerName?: string;
  buyerPhone?: string;
  buyerProfileImage?: string | null;
  qrCode?: string;
  busDeliveryWorkflow?: {
    stage?: string;
    proofSubmitted?: boolean;
    proof?: {
      receiptImageUrl?: string | null;
      driverPhone?: string | null;
      busNumber?: string | null;
      stationName?: string | null;
    } | null;
  } | null;
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
  const [receiptImageUrl, setReceiptImageUrl] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [busNumber, setBusNumber] = useState("");
  const [stationName, setStationName] = useState("");
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
    refetchInterval: 15000,
  });

  const handleDeliveryComplete = () => {
    refetch();
    setActiveTab("navigation");
  };

  const submitBusProofMutation = useMutation({
    mutationFn: async (payload: {
      receiptImageUrl: string;
      driverPhone: string;
      busNumber?: string;
      stationName?: string;
      latitude?: number;
      longitude?: number;
    }) => {
      if (!activeDelivery?.id) throw new Error("No active BUS delivery found");
      const response = await apiRequest("POST", `/api/orders/${activeDelivery.id}/bus-transport-proof`, payload);
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to submit BUS transport proof");
      }
      return response.json();
    },
    onSuccess: async () => {
      toast({
        title: "BUS proof submitted",
        description: "Transport receipt and driver details were sent for super admin verification.",
      });
      await Promise.all([
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey?.[0];
            if (typeof key !== "string") return false;
            return key.startsWith("/api/orders") || key.startsWith("/api/rider/active-delivery");
          },
        }),
      ]);
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Submission failed",
        description: error?.message || "Could not submit BUS proof",
        variant: "destructive",
      });
    },
  });

  const captureCurrentPosition = async (): Promise<{ latitude?: number; longitude?: number }> => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return {};
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => resolve({}),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  };

  const handleSubmitBusProof = async () => {
    const receipt = receiptImageUrl.trim();
    const phone = driverPhone.trim();
    if (!receipt || !phone) {
      toast({
        title: "Missing required fields",
        description: "Receipt image URL and bus driver phone are required.",
        variant: "destructive",
      });
      return;
    }
    const geo = await captureCurrentPosition();
    submitBusProofMutation.mutate({
      receiptImageUrl: receipt,
      driverPhone: phone,
      busNumber: busNumber.trim() || undefined,
      stationName: stationName.trim() || undefined,
      latitude: geo.latitude,
      longitude: geo.longitude,
    });
  };

  const normalizedStatus = String(activeDelivery?.status || "").toLowerCase().trim();
  const canUseDeliveryComms = COMMUNICATION_ACTIVE_STATUSES.has(normalizedStatus);
  const isBusDelivery = String(activeDelivery?.deliveryMethod || "").toLowerCase().trim() === "bus";
  const busStage = String(activeDelivery?.busDeliveryWorkflow?.stage || "").toUpperCase();
  const busProofSubmitted = Boolean(activeDelivery?.busDeliveryWorkflow?.proofSubmitted) || ["AWAITING_CONFIRMATION", "COMPLETED"].includes(busStage);

  useEffect(() => {
    const proof = activeDelivery?.busDeliveryWorkflow?.proof;
    if (!proof) return;
    if (proof.receiptImageUrl) setReceiptImageUrl(String(proof.receiptImageUrl));
    if (proof.driverPhone) setDriverPhone(String(proof.driverPhone));
    if (proof.busNumber) setBusNumber(String(proof.busNumber));
    if (proof.stationName) setStationName(String(proof.stationName));
  }, [activeDelivery?.id, activeDelivery?.busDeliveryWorkflow?.proof]);

  useEffect(() => {
    if (isBusDelivery) {
      setActiveTab("scan");
    }
  }, [isBusDelivery, activeDelivery?.id]);

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
                    {isBusDelivery && (
                      <Badge variant="secondary" className="mt-2 ml-2">
                        BUS Stage: {busStage || "READY"}
                      </Badge>
                    )}
                  </div>
                </div>
                
                {/* Buyer Contact - In-App Chat & Call */}
                <div className="flex items-center gap-2">
                  {activeDelivery.buyerId && canUseDeliveryComms && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/rider/messages?userId=${activeDelivery.buyerId}`)}
                        className="flex items-center gap-1.5"
                      >
                        <MessageSquare className="h-4 w-4" />
                        <span className="hidden sm:inline">Chat</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={jitsiCall.inCall}
                            className="flex items-center gap-1.5"
                          >
                            <Phone className="h-4 w-4" />
                            <span className="hidden sm:inline">Call</span>
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={async () => {
                              if (!activeDelivery.buyerId) return;
                              try {
                                await jitsiCall.startCall(activeDelivery.buyerId, "voice");
                              } catch (error: any) {
                                toast({
                                  title: "Failed to start in-app call",
                                  description: error?.message || "Unable to start call right now",
                                  variant: "destructive",
                                });
                              }
                            }}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            In-App Call
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (activeDelivery.buyerPhone) {
                                window.location.href = `tel:${activeDelivery.buyerPhone}`;
                                return;
                              }
                              toast({
                                title: "Phone number unavailable",
                                description: "This customer does not have a phone number on the order yet.",
                                variant: "destructive",
                              });
                            }}
                          >
                            <Phone className="h-4 w-4 mr-2" />
                            Phone Call
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                  <UserAvatar
                    profileImage={activeDelivery.buyerProfileImage || null}
                    name={activeDelivery.buyerName || "Customer"}
                    size="sm"
                    className="flex-shrink-0"
                  />
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
                  {isBusDelivery ? "Bus Proof" : "Scan QR"}
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
                            const mapsUrl = buildExternalNavigationUrl({
                              lat: Number(activeDelivery.deliveryLatitude || 0) || 5.6037,
                              lng: Number(activeDelivery.deliveryLongitude || 0) || -0.187,
                            });
                            window.open(mapsUrl, '_blank');
                          }}
                          data-testid="button-navigate"
                        >
                          <Navigation className="h-4 w-4 mr-2" />
                          Open in External Map
                        </Button>
                      </div>
                    </Card>
                  )}
                </Suspense>
              </TabsContent>

              <TabsContent value="scan" className="mt-4">
                {isBusDelivery ? (
                  <Card className="p-4 space-y-4">
                    <div>
                      <h3 className="font-semibold flex items-center gap-2">
                        <QrCode className="h-5 w-5" />
                        BUS Transport Proof (Required)
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Submit receipt and bus driver details after handoff at the transport station.
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        BUS deliveries do not use rider-to-customer QR/OTP verification.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Receipt Image URL *</p>
                        <Input
                          value={receiptImageUrl}
                          onChange={(event) => setReceiptImageUrl(event.target.value)}
                          placeholder="https://..."
                          data-testid="input-bus-receipt-url"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Bus Driver Phone *</p>
                        <Input
                          value={driverPhone}
                          onChange={(event) => setDriverPhone(event.target.value)}
                          placeholder="+233..."
                          data-testid="input-bus-driver-phone"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Bus Number (Optional)</p>
                        <Input
                          value={busNumber}
                          onChange={(event) => setBusNumber(event.target.value)}
                          placeholder="Bus number"
                          data-testid="input-bus-number"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium">Station Name (Optional)</p>
                        <Input
                          value={stationName}
                          onChange={(event) => setStationName(event.target.value)}
                          placeholder="Station"
                          data-testid="input-bus-station"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        onClick={handleSubmitBusProof}
                        disabled={submitBusProofMutation.isPending || busProofSubmitted}
                        data-testid="button-submit-bus-proof"
                      >
                        {submitBusProofMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : busProofSubmitted ? (
                          "Proof Submitted"
                        ) : (
                          "Submit BUS Proof"
                        )}
                      </Button>
                      {busProofSubmitted && (
                        <Badge variant="secondary">Proof submitted</Badge>
                      )}
                    </div>
                    {busProofSubmitted && (
                      <div className="rounded-md border border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30 p-3 text-xs">
                        <p className="font-semibold text-blue-900 dark:text-blue-200 mb-1">Awaiting Super Admin Confirmation</p>
                        <p className="text-blue-800 dark:text-blue-100">
                          Current BUS stage: {busStage || "AWAITING_CONFIRMATION"}. Super admin will verify and complete this order.
                        </p>
                      </div>
                    )}
                  </Card>
                ) : (
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
                          Confirm delivery using either customer QR code scan or customer OTP
                        </p>
                        <p className="text-xs text-muted-foreground mt-2">
                          Ask customer for one method only: scan QR from their order screen or enter their 6-digit OTP.
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
                )}
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
