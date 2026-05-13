import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { X, Download, Smartphone } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const { favicon } = usePlatformSettings();

  useEffect(() => {
    // Detect if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    // iOS detection
    const isIOSDevice =
      /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Dismiss if already dismissed this session
    if (sessionStorage.getItem("pwa-install-dismissed")) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      // Show after a short delay so user settles
      setTimeout(() => setIsVisible(true), 3000);
    };

    window.addEventListener("beforeinstallprompt", handler);

    // For iOS, show the prompt after 5s if not installed
    if (isIOSDevice && !sessionStorage.getItem("pwa-install-dismissed")) {
      setTimeout(() => setIsVisible(true), 5000);
    }

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (installEvent) {
      await installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === "accepted") {
        setIsInstalled(true);
      }
      setIsVisible(false);
      setInstallEvent(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    sessionStorage.setItem("pwa-install-dismissed", "1");
  };

  if (isInstalled || !isVisible) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 pb-[env(safe-area-inset-bottom,16px)] animate-in slide-in-from-bottom-4 duration-300"
      role="banner"
      aria-label="Install KiyuMart app"
    >
      <div className="max-w-sm mx-auto bg-card border border-border rounded-2xl shadow-xl p-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center shrink-0 shadow-md overflow-hidden">
            {favicon ? (
              <img src={favicon} alt="App icon" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-2xl">K</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">Install KiyuMart</p>
            {isIOS ? (
              <p className="text-xs text-muted-foreground mt-0.5">
                Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> for the full app experience.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">
                Add to your home screen for faster access, offline support, and a native app feel.
              </p>
            )}
          </div>
          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {!isIOS && installEvent && (
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={handleDismiss}
            >
              Not now
            </Button>
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={handleInstall}
            >
              <Download className="h-3.5 w-3.5" />
              Install
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
