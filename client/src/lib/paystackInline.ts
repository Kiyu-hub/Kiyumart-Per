export interface InlinePaystackConfig {
  publicKey: string;
  email: string;
  amount: number;
  currency?: string;
  reference: string;
  accessCode?: string;
  channels?: string[];
  metadata?: Record<string, unknown>;
  onOpen?: () => void;
}

let paystackPaymentInProgress = false;

/** No-op: Paystack SDK is no longer needed. Kept for backwards-compat imports. */
export function loadPaystackInlineScript(): Promise<void> {
  return Promise.resolve();
}

export function resetPaystackGuard() {
  paystackPaymentInProgress = false;
}

/**
 * Opens Paystack's hosted checkout in a full-screen modal iframe that overlays
 * the current page — identical visual experience to the Paystack v1 popup but
 * without any SDK iframe/postMessage race conditions.
 *
 * Completion is detected via:
 *  1. postMessage events that Paystack sends on success/cancel.
 *  2. The iframe navigating to our origin after payment (callback_url redirect).
 */
function openPaystackCheckoutModal(
  checkoutUrl: string,
  fallbackReference: string,
  onSuccess: (reference: string) => void,
  onCancel: () => void,
): () => void {
  // ── Backdrop ──────────────────────────────────────────────────────────────
  const backdrop = document.createElement("div");
  backdrop.style.cssText = [
    "position:fixed",
    "inset:0",
    "z-index:99999",
    "background:rgba(0,0,0,0.65)",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:16px",
    "box-sizing:border-box",
  ].join(";");

  // ── Modal shell ──────────────────────────────────────────────────────────
  const modal = document.createElement("div");
  modal.style.cssText = [
    "position:relative",
    "width:480px",
    "max-width:100%",
    "height:min(700px,90vh)",
    "border-radius:12px",
    "overflow:hidden",
    "background:#fff",
    "box-shadow:0 25px 60px rgba(0,0,0,0.45)",
    "display:flex",
    "flex-direction:column",
  ].join(";");

  // ── Loading indicator ────────────────────────────────────────────────────
  const loader = document.createElement("div");
  loader.style.cssText = [
    "position:absolute",
    "inset:0",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "background:#fff",
    "z-index:2",
    "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
    "font-size:14px",
    "color:#666",
    "flex-direction:column",
    "gap:12px",
  ].join(";");
  loader.innerHTML = `
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation:spin 0.8s linear infinite">
      <circle cx="20" cy="20" r="16" stroke="#e5e7eb" stroke-width="4"/>
      <path d="M20 4a16 16 0 0 1 16 16" stroke="#1e40af" stroke-width="4" stroke-linecap="round"/>
    </svg>
    <span>Loading secure payment…</span>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
  `;

  // ── iframe ───────────────────────────────────────────────────────────────
  const iframe = document.createElement("iframe");
  iframe.src = checkoutUrl;
  iframe.title = "Secure Payment";
  iframe.allow = "payment";
  iframe.style.cssText = "flex:1;width:100%;border:none;display:block;";

  // ── Close button ─────────────────────────────────────────────────────────
  const closeBtn = document.createElement("button");
  closeBtn.setAttribute("aria-label", "Close payment");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = [
    "position:absolute",
    "top:10px",
    "right:10px",
    "z-index:3",
    "width:28px",
    "height:28px",
    "border-radius:50%",
    "border:none",
    "background:rgba(0,0,0,0.12)",
    "color:#222",
    "font-size:13px",
    "cursor:pointer",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "padding:0",
    "line-height:1",
    "transition:background 0.15s",
  ].join(";");
  closeBtn.onmouseenter = () => { closeBtn.style.background = "rgba(0,0,0,0.22)"; };
  closeBtn.onmouseleave = () => { closeBtn.style.background = "rgba(0,0,0,0.12)"; };

  modal.appendChild(loader);
  modal.appendChild(iframe);
  modal.appendChild(closeBtn);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  let resolved = false;

  const cleanup = () => {
    window.removeEventListener("message", handleMessage);
    document.removeEventListener("keydown", handleKeydown);
    if (backdrop.parentNode) backdrop.remove();
  };

  const succeed = (ref: string) => {
    if (resolved) return;
    resolved = true;
    paystackPaymentInProgress = false;
    cleanup();
    onSuccess(ref || fallbackReference);
  };

  const cancel = () => {
    if (resolved) return;
    resolved = true;
    paystackPaymentInProgress = false;
    cleanup();
    onCancel();
  };

  // ── Hide loader once iframe initial load fires ───────────────────────────
  iframe.addEventListener("load", () => {
    if (loader.parentNode) loader.remove();

    // If the iframe navigated to our origin (Paystack redirected to callback_url),
    // try to read the reference from the URL params.
    try {
      const loc = iframe.contentWindow?.location;
      if (loc && !loc.href.includes("paystack.com")) {
        const params = new URLSearchParams(loc.search);
        const ref =
          params.get("reference") ||
          params.get("trxref") ||
          fallbackReference;
        succeed(ref);
      }
    } catch {
      // Still cross-origin (still on paystack.com) — normal, ignore.
    }
  });

  // ── Listen for postMessage events from Paystack's checkout page ───────────
  const handleMessage = (event: MessageEvent) => {
    try {
      if (!String(event.origin || "").includes("paystack")) return;
    } catch {
      return;
    }

    const data = event.data as Record<string, unknown> | null;
    if (!data || typeof data !== "object") return;

    // Paystack sends various shapes depending on SDK version; handle all.
    const evt = String(data.event || "");
    const status = String(
      (data as any).status ||
      (data as any).data?.status ||
      ""
    );
    const isSuccess =
      evt === "success" ||
      evt === "successful" ||
      evt === "charge_success" ||
      status === "success";
    const isClose = evt === "close" || evt === "closed";

    if (isSuccess) {
      const ref = String(
        (data as any).reference ||
        (data as any).trxref ||
        (data as any).data?.reference ||
        (data as any).data?.trxref ||
        fallbackReference
      );
      succeed(ref);
    } else if (isClose && !resolved) {
      cancel();
    }
  };

  window.addEventListener("message", handleMessage);

  closeBtn.addEventListener("click", cancel);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) cancel();
  });

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") cancel();
  };
  document.addEventListener("keydown", handleKeydown);

  return cleanup;
}

export class PaystackInlineService {
  static async pay(config: InlinePaystackConfig): Promise<string> {
    if (paystackPaymentInProgress) {
      throw new Error(
        "A payment is already open. Please complete or close it before starting a new one.",
      );
    }

    if (!config.accessCode) {
      throw new Error(
        "Payment cannot be opened: no access code was returned by the server. Please try again.",
      );
    }

    paystackPaymentInProgress = true;

    return new Promise<string>((resolve, reject) => {
      let safetyTimerId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        safetyTimerId = null;
        paystackPaymentInProgress = false;
        reject(new Error("Payment session timed out."));
      }, 12 * 60 * 1000);

      const done = () => {
        if (safetyTimerId !== null) {
          clearTimeout(safetyTimerId);
          safetyTimerId = null;
        }
      };

      const checkoutUrl = `https://checkout.paystack.com/${encodeURIComponent(config.accessCode!)}`;

      openPaystackCheckoutModal(
        checkoutUrl,
        config.reference,
        (ref) => {
          done();
          resolve(ref);
        },
        () => {
          done();
          paystackPaymentInProgress = false;
          reject(new Error("Payment was cancelled before completion."));
        },
      );

      try { config.onOpen?.(); } catch { /* ignore */ }
    });
  }
}
