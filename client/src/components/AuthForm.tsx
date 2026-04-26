import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { MapPin, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AuthFormProps {
  onLogin?: (email: string, password: string) => Promise<void> | void;
  onSignup?: (
    name: string,
    email: string,
    password: string,
    location?: { latitude: number; longitude: number },
  ) => Promise<void> | void;
  isLoginLoading?: boolean;
  isSignupLoading?: boolean;
}

export default function AuthForm({
  onLogin,
  onSignup,
  isLoginLoading = false,
  isSignupLoading = false,
}: AuthFormProps) {
  const { settings } = usePlatformSettings();
  const { toast } = useToast();
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [locationStatus, setLocationStatus] = useState<"idle" | "requesting" | "granted" | "denied">("idle");
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState("");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isSubmittingResetRequest, setIsSubmittingResetRequest] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin?.(loginEmail, loginPassword);
  };

  const passwordRules = [
    { label: "At least 8 characters",      met: signupPassword.length >= 8 },
    { label: "One uppercase letter (A–Z)",  met: /[A-Z]/.test(signupPassword) },
    { label: "One lowercase letter (a–z)",  met: /[a-z]/.test(signupPassword) },
    { label: "One number (0–9)",            met: /[0-9]/.test(signupPassword) },
  ];
  const passwordStrong = passwordRules.every((r) => r.met);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordStrong) return;
    if (location) {
      localStorage.setItem(
        "kiyumart_user_location",
        JSON.stringify({
          ...location,
          timestamp: Date.now(),
        }),
      );
    }
    await onSignup?.(signupName, signupEmail, signupPassword, location || undefined);
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
      },
    );
  };

  const supportEmail = String(settings?.contactEmail || "support@kiyumart.com").trim() || "support@kiyumart.com";

  const openForgotPasswordModal = () => {
    setResetEmail(loginEmail.trim());
    setForgotPasswordOpen(true);
  };

  const handleForgotPasswordRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedEmail = resetEmail.trim();
    if (!normalizedEmail) {
      toast({
        title: "Email required",
        description: "Enter the email linked to your account to request a password reset.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingResetRequest(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error || "Could not submit password reset request.");
      }

      toast({
        title: "Reset request received",
        description:
          payload?.message ||
          "If the account exists, your password reset request has been received and will be reviewed shortly.",
      });
      setForgotPasswordOpen(false);
    } catch (error: any) {
      toast({
        title: "Reset request failed",
        description: error?.message || "Could not submit password reset request.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingResetRequest(false);
    }
  };

  return (
    <>
      <Dialog open={forgotPasswordOpen} onOpenChange={setForgotPasswordOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forgot password</DialogTitle>
            <DialogDescription>
              Enter the email linked to your account and we will send a reset link if it exists.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPasswordRequest} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">Account Email</Label>
              <Input
                id="reset-email"
                type="email"
                placeholder="you@example.com"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                disabled={isSubmittingResetRequest}
                data-testid="input-forgot-password-email"
                required
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Need urgent help? Our support team can also assist through {supportEmail}.
            </p>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setForgotPasswordOpen(false)}
                disabled={isSubmittingResetRequest}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmittingResetRequest} data-testid="button-submit-forgot-password">
                {isSubmittingResetRequest ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  "Reset Password"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

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
              <TabsTrigger value="login" data-testid="tab-login">
                Login
              </TabsTrigger>
              <TabsTrigger value="signup" data-testid="tab-signup">
                Sign Up
              </TabsTrigger>
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
                    disabled={isLoginLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showLoginPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      data-testid="input-login-password"
                      disabled={isLoginLoading}
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((current) => !current)}
                      disabled={isLoginLoading}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
                      aria-label={showLoginPassword ? "Hide password" : "Show password"}
                      data-testid="button-toggle-login-password"
                    >
                      {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={openForgotPasswordModal}
                      className="text-sm font-medium text-primary underline-offset-4 transition-colors hover:underline"
                      disabled={isLoginLoading}
                      data-testid="link-forgot-password"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <p className="text-xs text-center text-muted-foreground">
                    Request a reset and our support team will help you recover access to your account.
                  </p>
                </div>
                <Button type="submit" className="w-full" data-testid="button-login" disabled={isLoginLoading}>
                  {isLoginLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Signing In...
                    </>
                  ) : (
                    "Login"
                  )}
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
                    disabled={isSignupLoading}
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
                    disabled={isSignupLoading}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <div className="relative">
                    <Input
                      id="signup-password"
                      type={showSignupPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      data-testid="input-signup-password"
                      disabled={isSignupLoading}
                      className="pr-11"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((current) => !current)}
                      disabled={isSignupLoading}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed"
                      aria-label={showSignupPassword ? "Hide password" : "Show password"}
                      data-testid="button-toggle-signup-password"
                    >
                      {showSignupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {/* Strength meter — shown only once the user starts typing */}
                  {signupPassword.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      {/* Bar */}
                      <div className="flex gap-1">
                        {passwordRules.map((_, i) => {
                          const metCount = passwordRules.filter((r) => r.met).length;
                          const filled = i < metCount;
                          const color =
                            metCount <= 1 ? "bg-destructive" :
                            metCount <= 2 ? "bg-orange-400" :
                            metCount <= 3 ? "bg-yellow-400" :
                            "bg-green-500";
                          return (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${filled ? color : "bg-muted"}`}
                            />
                          );
                        })}
                      </div>
                      {/* Rules checklist */}
                      <ul className="space-y-0.5">
                        {passwordRules.map((rule) => (
                          <li key={rule.label} className={`flex items-center gap-1.5 text-xs transition-colors ${rule.met ? "text-green-600 dark:text-green-400" : "text-muted-foreground"}`}>
                            <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 12 12">
                              {rule.met
                                ? <path d="M2 6 L5 9 L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                : <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" />
                              }
                            </svg>
                            {rule.label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    Location
                  </Label>
                  {locationStatus === "idle" && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={requestLocation}
                      disabled={isSignupLoading}
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
                    <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-sm">Location captured successfully</span>
                    </div>
                  )}
                  {locationStatus === "denied" && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                        <AlertCircle className="h-4 w-4" />
                        <span className="text-sm">{locationError}</span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        onClick={requestLocation}
                        disabled={isSignupLoading}
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Try Again
                      </Button>
                    </div>
                  )}
                  {!location && locationStatus === "idle" && (
                    <p className="text-xs text-muted-foreground">
                      Add your location if you want nearby stores and delivery suggestions.
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" data-testid="button-signup" disabled={isSignupLoading || !passwordStrong}>
                  {isSignupLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    "Create Account"
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}
