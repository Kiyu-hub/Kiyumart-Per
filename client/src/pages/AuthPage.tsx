import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import AuthForm from "@/components/AuthForm";
import ThemeToggle from "@/components/ThemeToggle";
import Logo from "@/components/Logo";
import { useMobileDevice } from "@/hooks/useMobileDevice";
import { queryClient } from "@/lib/queryClient";
import {
  Eye, EyeOff, Loader2, MapPin, CheckCircle,
  AlertCircle, ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AuthPage() {
  const [location, navigate] = useLocation();
  const { login, signup, isAuthenticated, user } = useAuth();
  const { toast } = useToast();
  const { isMobile, isTablet } = useMobileDevice();

  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isSigningUp, setIsSigningUp] = useState(false);
  // Desktop: track if logged-in user needs email verification
  const [desktopNeedsVerify, setDesktopNeedsVerify] = useState(false);
  const [desktopVerifyEmail, setDesktopVerifyEmail] = useState("");
  const searchParams = new URLSearchParams(location.split("?")[1] || "");
  const redirectTarget = searchParams.get("redirect");
  const referralCode = searchParams.get("ref") || "";

  // Prevents the auth useEffect from navigating away while OTP is pending
  const otpGateRef = useRef(false);

  // Mobile: force OTP screen from outside MobileAuth (e.g. post password-reset login)
  const [mobileForceVerify, setMobileForceVerify] = useState(false);
  const [mobileForceVerifyEmail, setMobileForceVerifyEmail] = useState("");

  // Navigate home once authenticated — but show OTP if emailVerified === false
  useEffect(() => {
    if (otpGateRef.current) return; // OTP flow in progress — skip
    if (!isAuthenticated || !user) return;

    if (user.emailVerified === false) {
      // Block navigation and show OTP screen
      otpGateRef.current = true;
      if (isMobile || isTablet) {
        setMobileForceVerify(true);
        setMobileForceVerifyEmail((user as any).email || "");
      } else {
        // Desktop: trigger OTP screen if not already shown
        if (!desktopNeedsVerify) {
          setDesktopNeedsVerify(true);
          setDesktopVerifyEmail((user as any).email || "");
          setDesktopOtp(["","","","","",""]);
          fetch("/api/auth/send-verification-otp", { method: "POST", credentials: "include" })
            .then(r => r.ok && setDesktopResendCountdown(60)).catch(() => {});
        }
      }
      return;
    }

    const safeRedirect =
      redirectTarget &&
      /^\/[^/]/.test(redirectTarget) &&
      !/^\/\//i.test(redirectTarget) &&
      !/:\/\//i.test(redirectTarget)
        ? redirectTarget : "/";
    navigate(safeRedirect);
  }, [isAuthenticated, user, navigate, redirectTarget, isMobile, isTablet, desktopNeedsVerify]);

  // Returns the logged-in User so callers can check emailVerified
  const handleLogin = async (email: string, password: string) => {
    setIsLoggingIn(true);
    try {
      const loggedInUser = await login(email, password);
      toast({ title: "Login Successful", description: "Welcome back!" });
      return loggedInUser;
    } catch (error: any) {
      const rawMsg: string = error?.message || "";
      toast({ title: "Login Failed", description: rawMsg.replace(/^\d{3}:\s*/, "") || "Invalid email or password", variant: "destructive" });
      return null;
    } finally { setIsLoggingIn(false); }
  };

  const handleSignup = async (name: string, email: string, password: string, loc?: { latitude: number; longitude: number }) => {
    // Set gate BEFORE awaiting signup so the auth useEffect can't navigate while OTP is pending
    otpGateRef.current = true;
    setIsSigningUp(true);
    try {
      const newUser = await signup({ name, email, password, role: "buyer", ...(referralCode ? { referralCode } : {}) });
      toast({ title: "Account Created", description: "Welcome to KiyuMart!" });
      return newUser;
    } catch (error: any) {
      otpGateRef.current = false; // Signup failed — release the gate
      toast({ title: "Signup Failed", description: error.message || "Failed to create account", variant: "destructive" });
      throw error;
    } finally { setIsSigningUp(false); }
  };

  // Desktop: OTP verify for unverified login
  const [desktopOtp, setDesktopOtp] = useState(["","","","","",""]);
  const [isDesktopVerifying, setIsDesktopVerifying] = useState(false);
  const [isDesktopResending, setIsDesktopResending] = useState(false);
  const [desktopResendCountdown, setDesktopResendCountdown] = useState(0);
  const desktopOtpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (desktopResendCountdown <= 0) return;
    const t = setTimeout(() => setDesktopResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [desktopResendCountdown]);

  useEffect(() => {
    if (desktopNeedsVerify && desktopOtpRefs.current[0]) {
      setTimeout(() => desktopOtpRefs.current[0]?.focus(), 300);
    }
  }, [desktopNeedsVerify]);

  const handleDesktopOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...desktopOtp];
    next[i] = digit;
    setDesktopOtp(next);
    if (digit && i < 5) desktopOtpRefs.current[i + 1]?.focus();
  };

  const handleDesktopOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !desktopOtp[i] && i > 0) desktopOtpRefs.current[i - 1]?.focus();
  };

  const submitDesktopVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = desktopOtp.join("");
    if (code.length < 6) return;
    setIsDesktopVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Invalid or expired code");
      toast({ title: "Email Verified!", description: "Your account is ready." });
      otpGateRef.current = false;
      setDesktopNeedsVerify(false);
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Verification Failed", description: err?.message || "Please try again", variant: "destructive" });
      setDesktopOtp(["","","","","",""]);
      setTimeout(() => desktopOtpRefs.current[0]?.focus(), 50);
    } finally { setIsDesktopVerifying(false); }
  };

  const resendDesktopOtp = async () => {
    if (desktopResendCountdown > 0 || isDesktopResending) return;
    setIsDesktopResending(true);
    try {
      await fetch("/api/auth/send-verification-otp", { method: "POST", credentials: "include" });
      setDesktopResendCountdown(60);
      setDesktopOtp(["","","","","",""]);
      toast({ title: "Code Sent", description: "A new 6-digit code has been sent." });
    } catch {
      toast({ title: "Failed to Resend", description: "Could not send code.", variant: "destructive" });
    } finally { setIsDesktopResending(false); }
  };

  if (isMobile || isTablet) {
    return (
      <MobileAuth
        onLogin={handleLogin}
        onSignup={handleSignup}
        isLoggingIn={isLoggingIn}
        isSigningUp={isSigningUp}
        referralCode={referralCode}
        forceVerify={mobileForceVerify}
        forceVerifyEmail={mobileForceVerifyEmail}
        onVerified={() => { otpGateRef.current = false; setMobileForceVerify(false); }}
      />
    );
  }

  // ── Desktop ───────────────────────────────────────────────────────────────
  // Desktop: unverified user gate
  if (desktopNeedsVerify) {
    return (
      <div className="min-h-screen flex flex-col">
        <div className="sticky top-0 z-50 w-full border-b bg-background">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="cursor-pointer" onClick={() => navigate("/")}><Logo size="lg" variant="auto" /></div>
            <ThemeToggle />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center p-6 bg-muted/30">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-black text-gray-900">Verify your email</h2>
              <p className="text-gray-500 text-sm mt-2">Enter the 6-digit code sent to <span className="font-semibold text-gray-700">{desktopVerifyEmail}</span></p>
            </div>
            <form onSubmit={submitDesktopVerify} className="space-y-5">
              <div className="flex gap-2 justify-center">
                {desktopOtp.map((d, i) => (
                  <input
                    key={i}
                    ref={el => { desktopOtpRefs.current[i] = el; }}
                    type="text" inputMode="numeric" pattern="[0-9]*" maxLength={1}
                    value={d}
                    onChange={e => handleDesktopOtpChange(i, e.target.value)}
                    onKeyDown={e => handleDesktopOtpKeyDown(i, e)}
                    onFocus={e => e.target.select()}
                    disabled={isDesktopVerifying}
                    className={cn(
                      "w-12 h-14 text-center text-2xl font-black border-2 rounded-xl outline-none transition-all",
                      "bg-white text-gray-900",
                      "focus:border-green-600 focus:ring-2 focus:ring-green-600/10",
                      d ? "border-green-600" : "border-gray-200",
                      "disabled:opacity-40",
                    )}
                  />
                ))}
              </div>
              <button
                type="submit"
                disabled={desktopOtp.join("").length < 6 || isDesktopVerifying}
                className="w-full h-12 rounded-xl bg-[#1A4A3C] text-white text-[15px] font-bold disabled:opacity-40"
              >
                {isDesktopVerifying ? "Verifying…" : "Verify Email"}
              </button>
              <div className="text-center text-sm text-gray-400">
                {desktopResendCountdown > 0 ? (
                  <span>Resend in <span className="font-bold text-[#1A4A3C]">{desktopResendCountdown}s</span></span>
                ) : (
                  <button type="button" onClick={resendDesktopOtp} disabled={isDesktopResending} className="text-[#1A4A3C] font-bold disabled:opacity-50">
                    {isDesktopResending ? "Sending…" : "Resend Code"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-50 w-full border-b bg-background">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="cursor-pointer" onClick={() => navigate("/")}><Logo size="lg" variant="auto" /></div>
          <ThemeToggle />
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-6 bg-muted/30">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-primary mb-2">Welcome to KiyuMart</h1>
            <p className="text-muted-foreground">Quality meets affordability</p>
          </div>
          <AuthForm
            onLogin={async (email, password) => {
              await handleLogin(email, password);
              // Navigation handled by useEffect; EmailVerificationGuard protects private pages
            }}
            onSignup={async (name, email, password, location) => {
              try {
                await handleSignup(name, email, password, location);
              } catch {
                return; // handleSignup already surfaced the error toast
              }
              // New accounts are unverified — go straight to the OTP screen.
              // The auth useEffect is gated off by otpGateRef during signup, so
              // we trigger the verify screen explicitly here instead of waiting
              // for a refresh.
              setDesktopVerifyEmail(email);
              setDesktopOtp(["", "", "", "", "", ""]);
              setDesktopNeedsVerify(true);
              fetch("/api/auth/send-verification-otp", { method: "POST", credentials: "include" })
                .then((r) => r.ok && setDesktopResendCountdown(60))
                .catch(() => {});
            }}
            isLoginLoading={isLoggingIn}
            isSignupLoading={isSigningUp}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Mobile auth — full-screen, keyboard-aware, scroll-locked
// ─────────────────────────────────────────────────────────────────────────────
type Screen = "login" | "signup" | "forgot" | "verify";

const PW_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter",  test: (p: string) => /[A-Z]/.test(p) },
  { label: "One lowercase letter",  test: (p: string) => /[a-z]/.test(p) },
  { label: "One number",            test: (p: string) => /[0-9]/.test(p) },
];

const DARK = "#1A4A3C";
const BTN  = "#1A4A3C";

function MobileAuth({
  onLogin, onSignup, isLoggingIn, isSigningUp, referralCode,
  forceVerify, forceVerifyEmail, onVerified,
}: {
  onLogin: (e: string, p: string) => Promise<any>;
  onSignup: (n: string, e: string, p: string, l?: { latitude: number; longitude: number }) => Promise<any>;
  isLoggingIn: boolean; isSigningUp: boolean; referralCode?: string;
  forceVerify?: boolean; forceVerifyEmail?: string; onVerified?: () => void;
}) {
  const [screen, setScreen] = useState<Screen>("login");
  const [verifyEmail, setVerifyEmail] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // login
  const [loginEmail, setLoginEmail]     = useState("");
  const [loginPw, setLoginPw]           = useState("");
  const [showLoginPw, setShowLoginPw]   = useState(false);

  // signup
  const [signupName, setSignupName]     = useState("");
  const [signupEmail, setSignupEmail]   = useState("");
  const [signupPw, setSignupPw]         = useState("");
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [locStatus, setLocStatus]       = useState<"idle"|"requesting"|"granted"|"denied">("idle");
  const [loc, setLoc]                   = useState<{latitude:number;longitude:number}|null>(null);
  const [locErr, setLocErr]             = useState("");

  // forgot
  const [resetEmail, setResetEmail]     = useState("");
  const [isResetting, setIsResetting]   = useState(false);
  const [resetDone, setResetDone]       = useState(false);

  // verify
  const [otpDigits, setOtpDigits]             = useState(["","","","","",""]);
  const [isVerifying, setIsVerifying]         = useState(false);
  const [isResending, setIsResending]         = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pwRules  = PW_RULES.map(r => ({ ...r, met: r.test(signupPw) }));
  const pwStrong = pwRules.every(r => r.met);
  const metCount = pwRules.filter(r => r.met).length;

  useEffect(() => {
    if (screen === "verify") setTimeout(() => otpRefs.current[0]?.focus(), 350);
  }, [screen]);

  // Parent signals: show verify screen (e.g., login after password reset)
  useEffect(() => {
    if (!forceVerify || !forceVerifyEmail) return;
    sendOtpAndShowVerifyScreen(forceVerifyEmail);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceVerify, forceVerifyEmail]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const t = setTimeout(() => setResendCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCountdown]);

  const handleOtpChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...otpDigits];
    next[i] = digit;
    setOtpDigits(next);
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !otpDigits[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const sendOtpAndShowVerifyScreen = async (email: string) => {
    let otpSent = false;
    try {
      const res = await fetch("/api/auth/send-verification-otp", { method: "POST", credentials: "include" });
      otpSent = res.ok;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: "Email not sent", description: (data?.error as string) || "Could not send verification code — use Resend below.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Email not sent", description: "Could not send verification code — use Resend below.", variant: "destructive" });
    }
    setVerifyEmail(email);
    setOtpDigits(["","","","","",""]);
    setResendCountdown(otpSent ? 60 : 0);
    setScreen("verify");
  };

  const resendOtp = async () => {
    if (resendCountdown > 0 || isResending) return;
    setIsResending(true);
    try {
      const res = await fetch("/api/auth/send-verification-otp", { method: "POST", credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data?.error as string) || "Could not send code");
      }
      setResendCountdown(60);
      setOtpDigits(["","","","","",""]);
      toast({ title: "Code Sent", description: "A new 6-digit code has been sent to your email." });
    } catch (err: any) {
      toast({ title: "Failed to Resend", description: err?.message || "Could not send verification code.", variant: "destructive" });
    } finally { setIsResending(false); }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = otpDigits.join("");
    if (code.length < 6) return;
    setIsVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Invalid or expired code");
      toast({ title: "Email Verified!", description: "Your account is ready." });
      onVerified?.(); // Release OTP gate in parent
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      navigate("/");
    } catch (err: any) {
      toast({ title: "Verification Failed", description: err?.message || "Please try again", variant: "destructive" });
      setOtpDigits(["","","","","",""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 50);
    } finally { setIsVerifying(false); }
  };

  const requestLocation = () => {
    if (!navigator.geolocation) { setLocStatus("denied"); setLocErr("Geolocation not supported"); return; }
    setLocStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      p  => { setLoc({ latitude: p.coords.latitude, longitude: p.coords.longitude }); setLocStatus("granted"); },
      er => { setLocStatus("denied"); setLocErr(er.code === 1 ? "Location permission denied" : "Could not get location"); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await onLogin(loginEmail, loginPw);
    // Navigation handled by parent useEffect; EmailVerificationGuard protects private pages
  };

  const submitSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwStrong) return;
    if (loc) localStorage.setItem("kiyumart_user_location", JSON.stringify({ ...loc, timestamp: Date.now() }));
    try {
      await onSignup(signupName, signupEmail, signupPw, loc || undefined);
    } catch (_) {
      return;
    }
    // Account created — must verify email before accessing the app
    await sendOtpAndShowVerifyScreen(signupEmail);
  };

  const submitForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) return;
    setIsResetting(true);
    try {
      const res  = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ email: resetEmail.trim() }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Request failed");
      setResetDone(true);
    } catch (err: any) {
      toast({ title: "Failed", description: err?.message || "Could not send reset request", variant: "destructive" });
    } finally { setIsResetting(false); }
  };

  const toLogin  = () => { setScreen("login");  setResetDone(false); setResetEmail(""); };
  const toSignup = () => setScreen("signup");
  const toForgot = () => { setResetEmail(loginEmail); setScreen("forgot"); };

  const heading = screen === "login"
    ? { title: "Welcome back.",       sub: "Sign in to continue shopping on KiyuMart." }
    : screen === "signup"
    ? { title: "Create your account.", sub: "Join thousands shopping on KiyuMart." }
    : screen === "verify"
    ? { title: "Verify your email.", sub: `Enter the 6-digit code sent to ${verifyEmail || "your email"}.` }
    : { title: "Reset your password.", sub: "Enter your email and our support team will help you recover access." };

  return (
    <AuthShell darkColor={DARK} heading={heading} showBack={screen !== "login"} onBack={toLogin}>

      {/* ── LOGIN ────────────────────────────────────────────────────── */}
      {screen === "login" && (
        <form onSubmit={submitLogin} className="flex flex-col gap-4">
          <Field label="Email address">
            <PillInput
              type="email" placeholder="Enter your email"
              value={loginEmail} onChange={setLoginEmail}
              disabled={isLoggingIn} testId="input-login-email"
              showCheck
            />
          </Field>

          <Field label="Password">
            <PillInput
              type={showLoginPw ? "text" : "password"} placeholder="Enter your password"
              value={loginPw} onChange={setLoginPw}
              disabled={isLoggingIn} testId="input-login-password"
              rightEl={<EyeToggle show={showLoginPw} onToggle={() => setShowLoginPw(v => !v)} />}
            />
          </Field>

          <div className="text-right -mt-1">
            <button type="button" onClick={toForgot} className="text-[#1A4A3C] text-[13px] font-semibold">
              Forgot password?
            </button>
          </div>

          <AuthBtn type="submit" loading={isLoggingIn} loadingText="Signing in…" color={BTN} testId="button-login">
            Log in
          </AuthBtn>

          <p className="text-center text-gray-400 text-[14px] pb-2">
            Don't have an account?{" "}
            <button type="button" onClick={toSignup} className="font-bold text-[#1A4A3C]">
              Sign up.
            </button>
          </p>
        </form>
      )}

      {/* ── SIGNUP ───────────────────────────────────────────────────── */}
      {screen === "signup" && (
        <form onSubmit={submitSignup} className="flex flex-col gap-4">
          <Field label="Full name">
            <PillInput
              type="text" placeholder="Enter your name"
              value={signupName} onChange={setSignupName}
              disabled={isSigningUp} testId="input-signup-name" showCheck
            />
          </Field>

          <Field label="Email address">
            <PillInput
              type="email" placeholder="Enter your email"
              value={signupEmail} onChange={setSignupEmail}
              disabled={isSigningUp} testId="input-signup-email" showCheck
            />
          </Field>

          <Field label="Password">
            <PillInput
              type={showSignupPw ? "text" : "password"} placeholder="Enter your password"
              value={signupPw} onChange={setSignupPw}
              disabled={isSigningUp} testId="input-signup-password"
              rightEl={<EyeToggle show={showSignupPw} onToggle={() => setShowSignupPw(v => !v)} />}
            />
            {signupPw.length > 0 && (
              <div className="mt-2.5 space-y-2">
                <div className="flex gap-1.5">
                  {[0,1,2,3].map(i => (
                    <div key={i} className={cn("h-1.5 flex-1 rounded-full transition-all duration-300",
                      i < metCount
                        ? metCount <= 1 ? "bg-red-400" : metCount <= 2 ? "bg-orange-400" : metCount <= 3 ? "bg-yellow-400" : "bg-[#22C55E]"
                        : "bg-gray-200",
                    )} />
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {pwRules.map(r => (
                    <div key={r.label} className={cn("flex items-center gap-1.5 text-[11px] font-medium", r.met ? "text-[#1A4A3C]" : "text-gray-300")}>
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", r.met ? "bg-[#22C55E]" : "bg-gray-200")} />
                      {r.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Field>

          {/* Location */}
          <div className="space-y-1.5">
            <p className="text-[13px] font-semibold text-gray-500">
              Location <span className="font-normal text-gray-300">(optional)</span>
            </p>
            {locStatus === "idle" && (
              <button type="button" onClick={requestLocation}
                className="w-full h-14 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center gap-2 text-gray-400 text-[14px] bg-white touch-ripple active:border-[#1A4A3C] active:text-[#1A4A3C] transition-colors">
                <MapPin className="w-4 h-4" /> Allow Location Access
              </button>
            )}
            {locStatus === "requesting" && (
              <div className="h-14 rounded-2xl bg-gray-50 flex items-center justify-center gap-2 text-gray-400 text-[13px]">
                <Loader2 className="w-4 h-4 animate-spin" /> Getting location…
              </div>
            )}
            {locStatus === "granted" && (
              <div className="h-14 rounded-2xl bg-[#1A4A3C]/8 border border-[#1A4A3C]/20 flex items-center justify-center gap-2 text-[#1A4A3C] text-[14px] font-semibold">
                <CheckCircle className="w-4 h-4" /> Location captured
              </div>
            )}
            {locStatus === "denied" && (
              <div className="space-y-2">
                <div className="h-13 rounded-2xl bg-red-50 border border-red-100 flex items-center gap-2 px-4 text-red-500 text-[12px]">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {locErr}
                </div>
                <button type="button" onClick={requestLocation}
                  className="w-full h-12 rounded-2xl border border-gray-200 text-gray-500 text-[13px] font-medium touch-ripple">
                  Try Again
                </button>
              </div>
            )}
          </div>

          {referralCode && (
            <div className="h-12 rounded-2xl bg-[#1A4A3C]/8 border border-[#1A4A3C]/20 flex items-center justify-center gap-2 text-[#1A4A3C] text-[13px] font-semibold">
              <CheckCircle className="w-4 h-4" /> Referral code applied
            </div>
          )}

          <AuthBtn type="submit" loading={isSigningUp} loadingText="Creating account…" color={BTN} disabled={!pwStrong} testId="button-signup">
            Create Account
          </AuthBtn>

          <p className="text-center text-gray-400 text-[14px] pb-2">
            Already have an account?{" "}
            <button type="button" onClick={toLogin} className="font-bold text-[#1A4A3C]">Please Login.</button>
          </p>
        </form>
      )}

      {/* ── FORGOT PASSWORD ──────────────────────────────────────────── */}
      {screen === "forgot" && (
        resetDone ? (
          <div className="flex flex-col items-center text-center gap-5 py-4">
            <div className="w-20 h-20 rounded-full bg-[#1A4A3C]/10 flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-[#22C55E]" />
            </div>
            <div>
              <p className="text-gray-900 text-[22px] font-black">Request Sent!</p>
              <p className="text-gray-400 text-[14px] leading-relaxed mt-2 max-w-xs mx-auto">
                Our support team will review your request and send instructions to{" "}
                <span className="font-bold text-gray-700">{resetEmail}</span>.
              </p>
            </div>
            <AuthBtn type="button" onClick={toLogin} color={BTN}>
              Back to Sign In
            </AuthBtn>
          </div>
        ) : (
          <form onSubmit={submitForgot} className="flex flex-col gap-4">
            <p className="text-gray-400 text-[13px]">We'll pass your request to our support team right away.</p>
            <Field label="Email address">
              <PillInput
                type="email" placeholder="you@example.com"
                value={resetEmail} onChange={setResetEmail}
                disabled={isResetting} showCheck
              />
            </Field>
            <AuthBtn type="submit" loading={isResetting} loadingText="Sending…" color={BTN}>
              Send Reset Request
            </AuthBtn>
          </form>
        )
      )}

      {/* ── EMAIL OTP VERIFY ─────────────────────────────────────────── */}
      {screen === "verify" && (
        <form onSubmit={submitVerify} className="flex flex-col gap-5">
          {/* 6-digit boxes */}
          <div className="flex gap-2.5 justify-center pt-1">
            {otpDigits.map((digit, i) => (
              <input
                key={i}
                ref={el => { otpRefs.current[i] = el; }}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={1}
                value={digit}
                onChange={e => handleOtpChange(i, e.target.value)}
                onKeyDown={e => handleOtpKeyDown(i, e)}
                onFocus={e => e.target.select()}
                disabled={isVerifying}
                className={cn(
                  "w-12 h-14 text-center text-[22px] font-black border-2 rounded-2xl outline-none transition-all",
                  "bg-white text-gray-900 placeholder:text-gray-200",
                  "focus:border-[#1A4A3C] focus:ring-2 focus:ring-[#1A4A3C]/10",
                  digit ? "border-[#1A4A3C]" : "border-gray-200",
                  "disabled:opacity-40",
                )}
              />
            ))}
          </div>

          <AuthBtn
            type="submit"
            loading={isVerifying}
            loadingText="Verifying…"
            color={BTN}
            disabled={otpDigits.join("").length < 6}
            testId="button-verify-otp"
          >
            Verify Email
          </AuthBtn>

          {/* Resend */}
          <div className="text-center">
            {resendCountdown > 0 ? (
              <p className="text-gray-400 text-[14px]">
                Resend code in{" "}
                <span className="font-bold text-[#1A4A3C]">{resendCountdown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={resendOtp}
                disabled={isResending}
                className="text-[#1A4A3C] text-[14px] font-bold disabled:opacity-50"
              >
                {isResending ? "Sending…" : "Resend Code"}
              </button>
            )}
          </div>

          <p className="text-center text-gray-400 text-[14px] pb-2">
            Wrong account?{" "}
            <button type="button" onClick={toLogin} className="font-bold text-[#1A4A3C]">
              Sign in instead.
            </button>
          </p>
        </form>
      )}
    </AuthShell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AuthShell — dark top + white draggable+scrollable bottom, keyboard-aware
// ─────────────────────────────────────────────────────────────────────────────
function AuthShell({
  darkColor, heading, showBack, onBack, children,
}: {
  darkColor: string;
  heading: { title: string; sub: string };
  showBack?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [topPct, setTopPct] = useState(20);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number; startPct: number } | null>(null);

  const handleFocusCapture = () => {
    setTimeout(() => {
      const active = document.activeElement as HTMLElement | null;
      if (active && sheetRef.current) {
        active.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 400);
  };

  const onHandleTouchStart = (e: React.TouchEvent) => {
    dragRef.current = { startY: e.touches[0].clientY, startPct: topPct };
    setIsDragging(true);
  };

  const onHandleTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const delta = e.touches[0].clientY - dragRef.current.startY;
    const deltaPct = (delta / window.innerHeight) * 100;
    const newPct = Math.min(20, Math.max(4, dragRef.current.startPct + deltaPct));
    setTopPct(newPct);
  };

  const onHandleTouchEnd = () => {
    setIsDragging(false);
    dragRef.current = null;
    setTopPct(prev => (prev > 12 ? 20 : 6));
  };

  const contentVisible = topPct >= 8;

  return (
    <div
      className="flex flex-col w-full overflow-hidden"
      style={{ background: darkColor, height: "100dvh", maxHeight: "100dvh" }}
    >
      <div
        className="flex-shrink-0 flex flex-col px-7 pb-8 overflow-hidden"
        style={{
          paddingTop: "max(20px, env(safe-area-inset-top, 20px))",
          height: `${topPct}dvh`,
          transition: isDragging ? "none" : "height 0.3s cubic-bezier(0.32,0.72,0,1)",
        }}
      >
        {contentVisible && (
          <>
            <div className="flex items-center mb-auto">
              <div className="w-9 shrink-0">
                {showBack && (
                  <button
                    onClick={onBack}
                    className="w-9 h-9 rounded-full flex items-center justify-center touch-ripple active:bg-white/10"
                    style={{ border: "1px solid rgba(255,255,255,0.25)" }}
                  >
                    <ArrowLeft className="w-4 h-4 text-white" />
                  </button>
                )}
              </div>
              <div className="flex-1 flex justify-center px-2">
                <img
                  src="/attached_assets/kiyumart_logo_dark.png"
                  alt="KiyuMart"
                  className="h-9 object-contain"
                  style={{ filter: "brightness(0) invert(1)" }}
                />
              </div>
              <div className="w-9 shrink-0" />
            </div>

            <div className="mt-auto text-center">
              <h1
                className="text-white font-black leading-tight tracking-tight"
                style={{ fontSize: "clamp(20px, 5.5vw, 26px)" }}
              >
                {heading.title}
              </h1>
              <p className="text-white/55 text-[13px] font-medium mt-2 leading-relaxed">
                {heading.sub}
              </p>
            </div>
          </>
        )}
      </div>

      <div
        ref={sheetRef}
        onFocusCapture={handleFocusCapture}
        className="flex-1 min-h-0 bg-white overflow-y-auto"
        style={{
          borderRadius: "28px 28px 0 0",
          paddingBottom: "max(24px, env(safe-area-inset-bottom, 24px))",
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
        }}
      >
        <div
          className="flex justify-center pt-3 pb-1 select-none"
          style={{ touchAction: "none", cursor: "grab" }}
          onTouchStart={onHandleTouchStart}
          onTouchMove={onHandleTouchMove}
          onTouchEnd={onHandleTouchEnd}
        >
          <div className="w-10 h-1.5 rounded-full bg-gray-200" />
        </div>

        <div className="px-7 pt-5 pb-2">
          {children}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-gray-500 text-[13px] font-semibold">{label}</p>
      {children}
    </div>
  );
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className="touch-ripple p-1.5">
      {show
        ? <EyeOff className="w-[18px] h-[18px] text-gray-400" />
        : <Eye    className="w-[18px] h-[18px] text-gray-400" />}
    </button>
  );
}

function PillInput({
  type, placeholder, value, onChange, disabled,
  testId, rightEl, showCheck,
}: {
  type: string; placeholder: string; value: string;
  onChange: (v: string) => void; disabled?: boolean;
  testId?: string; rightEl?: React.ReactNode; showCheck?: boolean;
}) {
  const filled = value.trim().length > 0;

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setTimeout(() => e.target.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
  };

  return (
    <div className="relative flex items-center">
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={handleFocus}
        disabled={disabled}
        data-testid={testId}
        required
        className="w-full h-14 px-4 bg-white border border-gray-200 rounded-2xl text-gray-900 text-[15px] placeholder:text-gray-300 outline-none transition-all disabled:opacity-50 focus:border-[#1A4A3C] focus:ring-2 focus:ring-[#1A4A3C]/10"
        style={{ paddingRight: (showCheck || rightEl) ? "3rem" : "1rem" }}
      />
      {showCheck && filled && !rightEl && (
        <div className="absolute right-3.5 w-6 h-6 rounded-full bg-[#22C55E] flex items-center justify-center pointer-events-none">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 12 12">
            <path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
      {rightEl && <div className="absolute right-3.5">{rightEl}</div>}
    </div>
  );
}

function AuthBtn({
  children, type = "button", loading, loadingText, disabled, testId, color, onClick,
}: {
  children: React.ReactNode; type?: "button" | "submit";
  loading?: boolean; loadingText?: string; disabled?: boolean;
  testId?: string; color: string; onClick?: () => void;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      data-testid={testId}
      className="w-full h-14 rounded-2xl text-white text-[16px] font-bold flex items-center justify-center gap-2 touch-ripple transition-opacity disabled:opacity-40 disabled:cursor-not-allowed mt-1"
      style={{ background: color, boxShadow: `0 4px 18px ${color}40` }}
    >
      {loading ? <><Loader2 className="w-5 h-5 animate-spin" />{loadingText || "Loading…"}</> : children}
    </button>
  );
}
