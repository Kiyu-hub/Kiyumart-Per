import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Camera, CameraOff, CheckCircle, Loader2, QrCode, ShieldCheck, XCircle } from "lucide-react";

interface PickupVerificationScannerProps {
  orderId: string;
  orderNumber: string;
  onSuccess?: () => void;
}

export default function PickupVerificationScanner({
  orderId,
  orderNumber,
  onSuccess,
}: PickupVerificationScannerProps) {
  const { toast } = useToast();
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerId = `pickup-qr-reader-${orderId}`;
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<"success" | "error" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [pickupOtp, setPickupOtp] = useState("");

  const verifyPickupMutation = useMutation({
    mutationFn: async (payload: { qrCode?: string; otp?: string }) =>
      apiRequest("POST", `/api/orders/${orderId}/verify-customer-pickup`, payload),
    onSuccess: () => {
      setScanResult("success");
      toast({
        title: "Pickup verified",
        description: `Order #${orderNumber} was completed successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/orders", orderId] });
      onSuccess?.();
    },
    onError: (error: any) => {
      const message = error?.message || "Failed to verify pickup";
      setScanResult("error");
      setErrorMessage(message);
      toast({
        title: "Verification failed",
        description: message,
        variant: "destructive",
      });
    },
  });

  const stopScanner = async () => {
    try {
      if (scannerRef.current && isScanning) {
        await scannerRef.current.stop();
      }
    } catch (error) {
      console.error("Failed to stop pickup scanner", error);
    } finally {
      setIsScanning(false);
    }
  };

  const startScanner = async () => {
    try {
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerId);
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        async (decodedText) => {
          await stopScanner();
          verifyPickupMutation.mutate({ qrCode: decodedText });
        },
        () => {
          // ignore scan misses while camera is active
        },
      );

      setIsScanning(true);
      setScanResult(null);
      setErrorMessage("");
    } catch (error) {
      console.error("Failed to start pickup scanner", error);
      toast({
        title: "Camera unavailable",
        description: "Please allow camera access or use the OTP/manual entry option.",
        variant: "destructive",
      });
    }
  };

  const verifyWithOtpOnly = () => {
    const otp = pickupOtp.replace(/\D/g, "").trim();
    if (otp.length !== 6) {
      setScanResult("error");
      setErrorMessage("Enter a valid 6-digit pickup OTP.");
      return;
    }
    verifyPickupMutation.mutate({ otp });
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isScanning]);

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-amber-300" />
              Scan Buyer QR
            </CardTitle>
            <CardDescription>
              Use the buyer QR code for the fastest pickup confirmation.
            </CardDescription>
          </div>
          <Badge variant="outline" className="border-amber-400/40 text-amber-100">
            <ShieldCheck className="mr-1 h-3 w-3" />
            Pickup
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          id={scannerId}
          className={`mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-2xl border-2 ${
            isScanning ? "border-amber-400 bg-black" : "border-dashed border-amber-400/30 bg-muted/20"
          } ${scanResult === "success" ? "border-green-500" : ""} ${scanResult === "error" ? "border-red-500" : ""}`}
          style={{ display: isScanning || scanResult ? "block" : "none" }}
        />

        {!isScanning && !scanResult ? (
          <div className="mx-auto flex aspect-square w-full max-w-sm flex-col items-center justify-center rounded-2xl border-2 border-dashed border-amber-400/30 bg-muted/20 px-6 text-center">
            <Camera className="mb-4 h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Start the camera and scan the buyer QR code from the pickup screen.
            </p>
          </div>
        ) : null}

        {scanResult === "success" ? (
          <div className="rounded-2xl bg-green-500/10 p-5 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-400" />
            <p className="text-lg font-semibold text-green-200">Pickup Verified</p>
            <p className="mt-1 text-sm text-green-100/80">Order #{orderNumber} has been completed.</p>
          </div>
        ) : null}

        {scanResult === "error" ? (
          <div className="rounded-2xl bg-red-500/10 p-5 text-center">
            <XCircle className="mx-auto mb-3 h-12 w-12 text-red-400" />
            <p className="text-lg font-semibold text-red-200">Verification Failed</p>
            <p className="mt-1 text-sm text-red-100/80">{errorMessage}</p>
          </div>
        ) : null}

        {!scanResult ? (
          <div className="space-y-3">
            <div className="mx-auto max-w-sm">
              <label className="mb-2 block text-sm font-medium text-muted-foreground">Pickup OTP fallback</label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={pickupOtp}
                onChange={(event) => setPickupOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit pickup OTP"
              />
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {!isScanning ? (
                <Button onClick={startScanner} className="gap-2">
                  <Camera className="h-4 w-4" />
                  Start Scan
                </Button>
              ) : (
                <Button variant="destructive" onClick={stopScanner} className="gap-2">
                  <CameraOff className="h-4 w-4" />
                  Stop Scan
                </Button>
              )}
              {!isScanning ? (
                <Button variant="outline" onClick={verifyWithOtpOnly}>
                  Verify With OTP
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {verifyPickupMutation.isPending ? (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Verifying pickup...
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
