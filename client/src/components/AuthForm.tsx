import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { MapPin, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

interface AuthFormProps {
  onLogin?: (email: string, password: string) => void;
  onSignup?: (name: string, email: string, password: string, location?: { latitude: number; longitude: number }) => void;
}

export default function AuthForm({ onLogin, onSignup }: AuthFormProps) {
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState("");

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    onLogin?.(loginEmail, loginPassword);
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!location) {
      setLocationError("Location is required to create an account");
      return;
    }
    // Store location in localStorage for future use
    localStorage.setItem("kiyumart_user_location", JSON.stringify({
      ...location,
      timestamp: Date.now(),
    }));
    onSignup?.(signupName, signupEmail, signupPassword, location);
  };

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setLocationStatus("denied");
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setLocationStatus("requesting");
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationStatus("granted");
        setLocationError("");
      },
      (error) => {
        setLocationStatus("denied");
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError("Location permission denied. Please allow location access to sign up.");
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location unavailable. Please try again.");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out. Please try again.");
            break;
          default:
            setLocationError("Failed to get location. Please try again.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl text-center">Welcome to KiyuMart</CardTitle>
        <CardDescription className="text-center">
          Sign in to your account or create a new one
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login" data-testid="tab-login">Login</TabsTrigger>
            <TabsTrigger value="signup" data-testid="tab-signup">Sign Up</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  data-testid="input-login-email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Password</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  data-testid="input-login-password"
                  required
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-login">
                Login
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Doe"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                  data-testid="input-signup-name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                  data-testid="input-signup-email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="••••••••"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                  data-testid="input-signup-password"
                  required
                />
              </div>
              
              {/* Location Capture - Required */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  Location <span className="text-destructive">*</span>
                </Label>
                {locationStatus === "idle" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={requestLocation}
                    data-testid="button-request-location"
                  >
                    <MapPin className="h-4 w-4 mr-2" />
                    Allow Location Access
                  </Button>
                )}
                {locationStatus === "requesting" && (
                  <Button type="button" variant="outline" className="w-full" disabled>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Getting your location...
                  </Button>
                )}
                {locationStatus === "granted" && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Location captured successfully</span>
                  </div>
                )}
                {locationStatus === "denied" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 p-3 rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">{locationError}</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={requestLocation}
                    >
                      <MapPin className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                )}
                {!location && locationStatus === "idle" && (
                  <p className="text-xs text-muted-foreground">
                    We need your location to show you nearby stores and enable delivery
                  </p>
                )}
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                data-testid="button-signup"
                disabled={!location}
              >
                Create Account
              </Button>
              {!location && locationStatus !== "idle" && (
                <p className="text-xs text-center text-muted-foreground">
                  Location is required to create an account
                </p>
              )}
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
