import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import AuthForm from "@/components/AuthForm";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { login, signup, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const [isNewSignup, setIsNewSignup] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const redirectTarget = searchParams.get("redirect");
  const referralCode = searchParams.get("ref") || "";

  useEffect(() => {
    if (isAuthenticated && user) {
      // Only allow purely relative paths (no protocol, no host, no double-slash tricks)
      const safeRedirect =
        redirectTarget &&
        /^\/[^/]/.test(redirectTarget) &&
        !/^\/\//i.test(redirectTarget) &&
        !/:\/\//i.test(redirectTarget)
          ? redirectTarget
          : "/";
      navigate(safeRedirect);
    }
  }, [isAuthenticated, user, navigate, redirectTarget]);

  const handleLogin = async (email: string, password: string) => {
    setIsLoggingIn(true);
    try {
      await login(email, password);
      toast({
        title: "Login Successful",
        description: "Welcome back!",
      });
    } catch (error: any) {
      toast({
        title: "Login Failed",
        description: error.message || "Invalid email or password",
        variant: "destructive",
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignup = async (name: string, email: string, password: string, location?: { latitude: number; longitude: number }) => {
    setIsSigningUp(true);
    try {
      setIsNewSignup(true);
      await signup({ name, email, password, role: "buyer", ...(referralCode ? { referralCode } : {}) });
      toast({
        title: "Account Created",
        description: "Welcome to KiyuMart!",
      });
    } catch (error: any) {
      setIsNewSignup(false);
      toast({
        title: "Signup Failed",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    } finally {
      setIsSigningUp(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-50 w-full border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div 
              className="cursor-pointer flex items-center" 
              data-testid="logo-container"
              onClick={() => navigate("/")}
            >
              <Logo size="lg" variant="auto" />
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
      
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/30">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary mb-2">Welcome to KiyuMart</h1>
            <p className="text-muted-foreground">Quality meet affordability</p>
          </div>
          
          <AuthForm
            onLogin={handleLogin}
            onSignup={handleSignup}
            isLoginLoading={isLoggingIn}
            isSignupLoading={isSigningUp}
          />
        </div>
      </div>
    </div>
  );
}
