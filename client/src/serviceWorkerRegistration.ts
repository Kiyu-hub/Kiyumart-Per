import { registerSW } from "virtual:pwa-register";

export default function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  registerSW({
    immediate: true,
    onNeedRefresh() {
      window.dispatchEvent(new Event("kiyumart:sw-update-found"));
    },
    onOfflineReady() {
      window.dispatchEvent(new Event("kiyumart:sw-offline-ready"));
    },
  });
}
