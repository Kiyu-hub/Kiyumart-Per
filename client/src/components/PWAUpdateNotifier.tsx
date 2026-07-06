import * as React from "react";
import { toast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

function showUpdateToast(onUpdate: () => void) {
  toast({
    title: "Update available",
    description: "A new version of KiyuMart is ready. Refresh to apply it.",
    action: (
      <ToastAction altText="Refresh page" onClick={onUpdate}>
        Refresh
      </ToastAction>
    ),
  });
}

export default function PWAUpdateNotifier() {
  const waitingServiceWorkerRef = React.useRef<ServiceWorker | null>(null);
  const toastShownRef = React.useRef(false);
  const refreshPendingRef = React.useRef(false);

  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    const reloadPage = () => {
      if (refreshPendingRef.current) return;
      refreshPendingRef.current = true;
      if (waitingServiceWorkerRef.current) {
        waitingServiceWorkerRef.current.postMessage({ type: "SKIP_WAITING" });
      } else {
        window.location.reload();
      }
    };

    const showUpdateIfNeeded = () => {
      if (toastShownRef.current) return;
      toastShownRef.current = true;
      showUpdateToast(reloadPage);
    };

    const handleControllerChange = () => {
      if (refreshPendingRef.current) return;
      window.location.reload();
    };

    const showUpdateEvent = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        if (registration.waiting) {
          waitingServiceWorkerRef.current = registration.waiting;
          showUpdateIfNeeded();
        }
      } catch (error) {
        console.debug("PWA update event handling failed", error);
      }
    };

    const checkRegistration = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();

        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingServiceWorkerRef.current = registration.waiting;
          showUpdateIfNeeded();
        }

        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (
              installingWorker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              waitingServiceWorkerRef.current = registration.waiting;
              showUpdateIfNeeded();
            }
          });
        });
      } catch (error) {
        console.debug("PWA update check failed", error);
      }
    };

    window.addEventListener("controllerchange", handleControllerChange);
    window.addEventListener("focus", checkRegistration);
    window.addEventListener("kiyumart:sw-update-found", showUpdateEvent);
    checkRegistration();

    return () => {
      window.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("focus", checkRegistration);
      window.removeEventListener("kiyumart:sw-update-found", showUpdateEvent);
    };
  }, []);

  return null;
}
