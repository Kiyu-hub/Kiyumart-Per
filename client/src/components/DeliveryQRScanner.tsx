import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  QrCode, 
  Camera, 
  CameraOff, 
  CheckCircle, 
  XCircle,
  Loader2,
  Package
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface DeliveryQRScannerProps {
  orderId: string;
  orderNumber: string;
  expectedQRCode?: string;
  onScanSuccess?: () => void;
  onScanError?: (error: string) => void;
}

export default function DeliveryQRScanner({ 
  orderId, 
  orderNumber, 
  expectedQRCode: _expectedQRCode,
  onScanSuccess,
  onScanError 
}: DeliveryQRScannerProps) {
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [deliveryOtp, setDeliveryOtp] = useState("");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const { toast } = useToast();

  // Mutation to complete delivery
  const completeDeliveryMutation = useMutation({
    mutationFn: async (payload: { qrCode: string; otp: string }) => {
      return apiRequest("POST", `/api/orders/${orderId}/complete-delivery`, payload);
    },
    onSuccess: () => {
      setScanResult('success');
      toast({
        title: "Delivery Complete!",
        description: `Order #${orderNumber} has been successfully delivered.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/deliveries/active"] });
      onScanSuccess?.();
    },
    onError: (error: any) => {
      setScanResult('error');
      const message = error.message || "Failed to complete delivery";
      setErrorMessage(message);
      toast({
        title: "Verification Failed",
        description: message,
        variant: "destructive",
      });
      onScanError?.(message);
    },
  });

  const startScanner = async () => {
    try {
      const scannerId = "qr-reader";
      
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode(scannerId);
      }

      await scannerRef.current.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          handleScan(decodedText);
        },
        (errorMessage) => {
          // QR code not found - this is normal during scanning
        }
      );

      setIsScanning(true);
      setScanResult(null);
      setErrorMessage("");
    } catch (err) {
      console.error("Failed to start scanner:", err);
      toast({
        title: "Camera Error",
        description: "Could not access camera. Please ensure camera permissions are enabled.",
        variant: "destructive",
      });
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current && isScanning) {
        await scannerRef.current.stop();
        setIsScanning(false);
      }
    } catch (err) {
      console.error("Failed to stop scanner:", err);
    }
  };

  const handleScan = async (scannedCode: string) => {
    // Stop scanning first
    await stopScanner();
    const normalizedOtp = deliveryOtp.replace(/\D/g, "").trim();
    completeDeliveryMutation.mutate({ qrCode: scannedCode, otp: normalizedOtp || "" });
  };

  const completeWithOtpOnly = () => {
    const normalizedOtp = deliveryOtp.replace(/\D/g, "").trim();
    if (normalizedOtp.length !== 6) {
      setScanResult('error');
      setErrorMessage("Enter a valid 6-digit OTP to verify without QR.");
      toast({
        title: "OTP Required",
        description: "Enter a valid 6-digit OTP.",
        variant: "destructive",
      });
      return;
    }
    completeDeliveryMutation.mutate({ qrCode: "", otp: normalizedOtp });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current && isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isScanning]);

  const resetScanner = () => {
    setScanResult(null);
    setErrorMessage("");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              Delivery Verification
            </CardTitle>
            <CardDescription>
              Scan the buyer's QR code to complete delivery
            </CardDescription>
          </div>
          <Badge variant="secondary">
            <Package className="h-3 w-3 mr-1" />
            #{orderNumber}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Scanner Container */}
        <div 
          id="qr-reader" 
          className={`w-full aspect-square max-w-sm mx-auto rounded-lg overflow-hidden border-2 ${
            isScanning ? 'border-primary' : 'border-dashed border-muted-foreground/30'
          } ${scanResult === 'success' ? 'border-green-500' : ''} ${scanResult === 'error' ? 'border-red-500' : ''}`}
          style={{ 
            display: isScanning || scanResult ? 'block' : 'none',
            backgroundColor: isScanning ? 'black' : undefined
          }}
        />

        {/* Placeholder when not scanning */}
        {!isScanning && !scanResult && (
          <div className="w-full aspect-square max-w-sm mx-auto rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center bg-muted/30">
            <Camera className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground text-center px-4">
              Click the button below to start scanning the buyer's delivery QR code
            </p>
          </div>
        )}

        {/* Success State */}
        {scanResult === 'success' && (
          <div className="text-center p-6 bg-green-50 dark:bg-green-950 rounded-lg">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-green-700 dark:text-green-300 mb-2">
              Delivery Complete!
            </h3>
            <p className="text-sm text-green-600 dark:text-green-400">
              Order #{orderNumber} has been successfully delivered and verified.
            </p>
          </div>
        )}

        {/* Error State */}
        {scanResult === 'error' && (
          <div className="text-center p-6 bg-red-50 dark:bg-red-950 rounded-lg">
            <XCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-red-700 dark:text-red-300 mb-2">
              Verification Failed
            </h3>
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              {errorMessage}
            </p>
            <Button variant="outline" onClick={resetScanner}>
              Try Again
            </Button>
          </div>
        )}

        {/* Control Buttons */}
        {!scanResult && (
          <div className="space-y-3">
            <div className="max-w-sm mx-auto">
              <label className="text-sm font-medium mb-2 block">Customer OTP (Optional)</label>
              <Input
                inputMode="numeric"
                maxLength={6}
                value={deliveryOtp}
                onChange={(event) => setDeliveryOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="Enter 6-digit OTP"
                data-testid="input-delivery-otp"
              />
            </div>
            <div className="flex justify-center gap-4">
            {!isScanning ? (
              <Button onClick={startScanner} className="gap-2">
                <Camera className="h-4 w-4" />
                Start Scanning
              </Button>
            ) : (
              <Button onClick={stopScanner} variant="destructive" className="gap-2">
                <CameraOff className="h-4 w-4" />
                Stop Scanning
              </Button>
            )}
              {!isScanning && (
                <Button onClick={completeWithOtpOnly} variant="outline" className="gap-2">
                  Verify with OTP Only
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Processing State */}
        {completeDeliveryMutation.isPending && (
          <div className="flex items-center justify-center gap-2 p-4">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Verifying delivery...</span>
          </div>
        )}

        {/* Instructions */}
        <div className="text-center text-sm text-muted-foreground">
          <p>Use either the buyer QR code or the 6-digit OTP to verify delivery.</p>
        </div>
      </CardContent>
    </Card>
  );
}
