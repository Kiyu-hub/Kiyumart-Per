import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp: number;
}

export default function LocationPrompt() {
  const { user, isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState<"idle" | "requesting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    // Check if this is a new user who needs location prompt
    const isNewUser = sessionStorage.getItem("kiyumart_new_user") === "true";
    const hasLocation = localStorage.getItem("kiyumart_user_location");
    
    if (isAuthenticated && isNewUser && !hasLocation) {
      // Show prompt after a short delay
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setStatus("error");
      setErrorMessage("Geolocation is not supported by your browser");
      return;
    }

    setStatus("requesting");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const locationData: LocationData = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        };
        
        // Store in localStorage
        localStorage.setItem("kiyumart_user_location", JSON.stringify(locationData));
        
        // Clear the new user flag
        sessionStorage.removeItem("kiyumart_new_user");
        
        setStatus("success");
        
        // Close dialog after a short delay
        setTimeout(() => {
          setIsOpen(false);
        }, 1500);
      },
      (error) => {
        setStatus("error");
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setErrorMessage("Location permission was denied. You can enable it in your browser settings.");
            break;
          case error.POSITION_UNAVAILABLE:
            setErrorMessage("Location information is unavailable.");
            break;
          case error.TIMEOUT:
            setErrorMessage("Location request timed out. Please try again.");
            break;
          default:
            setErrorMessage("An unknown error occurred.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  const handleSkip = () => {
    // Clear the new user flag so prompt doesn't show again
    sessionStorage.removeItem("kiyumart_new_user");
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            Enable Location Services
          </DialogTitle>
          <DialogDescription>
            Help us serve you better by sharing your location. This helps with accurate delivery estimates and finding nearby stores.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {status === "idle" && (
            <div className="text-center space-y-6">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <MapPin className="h-12 w-12 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">
                Your location data is stored locally on your device and is used to provide better delivery services.
              </p>
            </div>
          )}

          {status === "requesting" && (
            <div className="text-center space-y-4">
              <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Loader2 className="h-12 w-12 text-primary animate-spin" />
              </div>
              <p className="text-sm text-muted-foreground">
                Requesting your location...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="text-center space-y-4">
              <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mx-auto">
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              </div>
              <p className="text-sm text-green-600 font-medium">
                Location saved successfully!
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="text-center space-y-4">
              <div className="h-24 w-24 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center mx-auto">
                <XCircle className="h-12 w-12 text-red-600" />
              </div>
              <p className="text-sm text-red-600">
                {errorMessage}
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          {status === "idle" && (
            <>
              <Button variant="outline" className="flex-1" onClick={handleSkip}>
                Skip for Now
              </Button>
              <Button className="flex-1" onClick={requestLocation}>
                <MapPin className="h-4 w-4 mr-2" />
                Share Location
              </Button>
            </>
          )}

          {status === "error" && (
            <>
              <Button variant="outline" className="flex-1" onClick={handleSkip}>
                Skip
              </Button>
              <Button 
                className="flex-1" 
                onClick={() => {
                  setStatus("idle");
                  setErrorMessage("");
                }}
              >
                Try Again
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
