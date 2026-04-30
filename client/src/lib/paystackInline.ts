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

interface PaystackCallbackResponse {
  reference?: string;
  trxref?: string;
  status?: string;
  transaction?: string;
}

interface PaystackHandler {
  openIframe: () => void;
}

interface PaystackPopGlobal {
  setup: (config: Record<string, unknown>) => PaystackHandler;
}

declare global {
  interface Window {
    PaystackPop?: PaystackPopGlobal;
  }
}

let paystackScriptPromise: Promise<void> | null = null;
let paystackGuardsAttached = false;
let activeInlinePaymentCount = 0;
let paystackPaymentInProgress = false;
let pendingCleanupTimerId: ReturnType<typeof setTimeout> | null = null;

const PAYSTACK_SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";
const PAYSTACK_LOAD_TIMEOUT_MS = 20000;

function findPaystackFrames(): HTMLIFrameElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(
    document.querySelectorAll<HTMLIFrameElement>(
      'iframe[src*="paystack"], iframe[src*="checkout.paystack"], iframe[name*="paystack"], iframe[title*="Paystack"]',
    ),
  );
}

function hasActivePaystackFrame() {
  return findPaystackFrames().length > 0;
}

/**
 * Remove any lingering Paystack iframes from a completed/cancelled session.
 * NEVER runs while a payment is actively in progress — this prevents the
 * deferred cleanup from removing a freshly-opened payment modal.
 */
function cleanupPaystackFrames() {
  if (typeof document === "undefined") return;
  // Critical guard: never remove the iframe while payment is open
  if (paystackPaymentInProgress) return;

  findPaystackFrames().forEach((frame) => {
    // Walk up to find Paystack's wrapping overlay div and remove the whole thing
    let node: HTMLElement | null = frame;
    for (let i = 0; i < 5; i++) {
      const parent: HTMLElement | null = node?.parentElement ?? null;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      const style = window.getComputedStyle(parent);
      if (
        style.position === "fixed" &&
        (parseInt(style.zIndex, 10) > 100 || Boolean(parent.style.zIndex))
      ) {
        parent.remove();
        return;
      }
      node = parent;
    }
    frame.remove();
  });
}

function scheduleDeferredCleanup(delayMs: number) {
  // Cancel any previously scheduled cleanup before scheduling a new one
  if (pendingCleanupTimerId !== null) {
    clearTimeout(pendingCleanupTimerId);
    pendingCleanupTimerId = null;
  }
  pendingCleanupTimerId = setTimeout(() => {
    pendingCleanupTimerId = null;
    cleanupPaystackFrames();
  }, delayMs);
}

function cancelDeferredCleanup() {
  if (pendingCleanupTimerId !== null) {
    clearTimeout(pendingCleanupTimerId);
    pendingCleanupTimerId = null;
  }
}

function shouldSuppressPaystackRuntimeNoise(message: string, filename: string) {
  const normalizedMessage = String(message || "").toLowerCase();
  const normalizedFilename = String(filename || "").toLowerCase();
  if (!activeInlinePaymentCount && !hasActivePaystackFrame()) return false;
  if (normalizedFilename.includes("paystack")) return true;
  return normalizedMessage === "script error." || normalizedMessage.includes("paystack");
}

function ensurePaystackRuntimeGuards() {
  if (typeof window === "undefined" || paystackGuardsAttached) return;

  window.addEventListener(
    "error",
    (event) => {
      if (!shouldSuppressPaystackRuntimeNoise(event.message || "", event.filename || "")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason;
      const message =
        typeof reason === "string"
          ? reason
          : reason instanceof Error
            ? reason.message
            : String(reason || "");
      if (!shouldSuppressPaystackRuntimeNoise(message, "")) return;
      event.preventDefault();
    },
    true,
  );

  paystackGuardsAttached = true;
}

function ensurePaystackPreconnect() {
  if (typeof document === "undefined") return;
  if (!document.querySelector('link[data-paystack-preconnect="true"]')) {
    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = "https://js.paystack.co";
    link.dataset.paystackPreconnect = "true";
    document.head.appendChild(link);
  }
  if (!document.querySelector('link[data-paystack-dns-prefetch="true"]')) {
    const link = document.createElement("link");
    link.rel = "dns-prefetch";
    link.href = "//js.paystack.co";
    link.dataset.paystackDnsPrefetch = "true";
    document.head.appendChild(link);
  }
}

function isPaystackReady() {
  return Boolean(window.PaystackPop?.setup);
}

function waitForPaystackReady(timeoutMs = PAYSTACK_LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      if (isPaystackReady()) { resolve(); return; }
      if (Date.now() - start >= timeoutMs) {
        reject(new Error("Paystack payment tools took too long to load."));
        return;
      }
      setTimeout(check, 150);
    };
    check();
  });
}

function createPaystackScript(cacheBust = false) {
  const script = document.createElement("script");
  script.src = cacheBust ? `${PAYSTACK_SCRIPT_SRC}?t=${Date.now()}` : PAYSTACK_SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.dataset.paystackInline = "true";
  return script;
}

export function loadPaystackInlineScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Paystack inline payment is only available in the browser."));
  }

  ensurePaystackPreconnect();

  if (isPaystackReady()) return Promise.resolve();
  if (paystackScriptPromise) return paystackScriptPromise;

  paystackScriptPromise = new Promise<void>((resolve, reject) => {
    let attempts = 0;

    const tryLoad = () => {
      if (isPaystackReady()) { resolve(); return; }

      document.querySelectorAll<HTMLScriptElement>('script[data-paystack-inline="true"]').forEach((s) => s.remove());

      const script = createPaystackScript(attempts > 0);
      let settled = false;

      const succeed = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        script.remove();
        if (attempts < 1) {
          attempts += 1;
          setTimeout(tryLoad, 300);
          return;
        }
        reject(error);
      };

      script.addEventListener("load", () => {
        void waitForPaystackReady(12000).then(succeed).catch(() =>
          fail(new Error("Paystack payment tools took too long to load."))
        );
      }, { once: true });

      script.addEventListener("error", () =>
        fail(new Error("Could not load Paystack payment tools.")), { once: true }
      );

      document.head.appendChild(script);

      // Also start polling in case the load event fires before we attach
      void waitForPaystackReady(12000).then(succeed).catch(() => {
        if (!settled) fail(new Error("Paystack payment tools took too long to load."));
      });
    };

    tryLoad();
  }).catch((error) => {
    paystackScriptPromise = null;
    throw error;
  });

  return paystackScriptPromise;
}

function normalizePaystackResponseReference(
  response: PaystackCallbackResponse | undefined,
  fallbackReference: string,
) {
  return String(response?.reference || response?.trxref || fallbackReference || "").trim();
}

/**
 * Reset the Paystack guard flags when recovering from a stuck state.
 * Does NOT schedule deferred cleanup — that would race with an upcoming payment call
 * and remove the active payment iframe. Cleanup is handled inside pay().
 */
export function resetPaystackGuard() {
  activeInlinePaymentCount = 0;
  paystackPaymentInProgress = false;
  cancelDeferredCleanup();
}

export class PaystackInlineService {
  static async pay(config: InlinePaystackConfig): Promise<string> {
    // Block only if a payment is genuinely open (iframe visible AND flag set)
    if (paystackPaymentInProgress && hasActivePaystackFrame()) {
      throw new Error(
        "A payment is already open. Please complete or close it before starting a new one.",
      );
    }

    // Reset any stale state from a previous session
    paystackPaymentInProgress = false;
    activeInlinePaymentCount = 0;

    // Cancel any pending deferred cleanup from a previous session —
    // it must not fire while the new payment iframe is opening
    cancelDeferredCleanup();

    // Remove ghost iframes from previous sessions (safe now: flag is false)
    cleanupPaystackFrames();

    ensurePaystackRuntimeGuards();
    await loadPaystackInlineScript();

    if (!window.PaystackPop?.setup) {
      throw new Error("Paystack payment tools are not available right now. Please refresh and try again.");
    }

    return new Promise<string>((resolve, reject) => {
      let completed = false;
      let settled = false;
      activeInlinePaymentCount += 1;
      paystackPaymentInProgress = true;

      // Safety net: if Paystack never calls callback or onClose, reject after 12 minutes
      let safetyTimerId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        safetyTimerId = null;
        finish(() => reject(new Error("Payment session timed out.")));
      }, 12 * 60 * 1000);

      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        activeInlinePaymentCount = Math.max(0, activeInlinePaymentCount - 1);
        paystackPaymentInProgress = false;
        if (safetyTimerId !== null) { clearTimeout(safetyTimerId); safetyTimerId = null; }
        // Schedule cleanup after the modal closes — safe because paystackPaymentInProgress is now false
        scheduleDeferredCleanup(250);
        callback();
      };

      let handler: PaystackHandler;
      try {
        handler = window.PaystackPop!.setup({
          key: config.publicKey,
          email: config.email,
          amount: config.amount,
          currency: config.currency || "GHS",
          ref: config.reference,
          channels: config.channels,
          metadata: config.metadata,
          ...(config.accessCode ? { access_code: config.accessCode } : {}),
          callback: (response: PaystackCallbackResponse) => {
            completed = true;
            const ref = normalizePaystackResponseReference(response, config.reference);
            if (!ref) {
              finish(() => reject(new Error("Payment completed but no reference was returned.")));
              return;
            }
            finish(() => resolve(ref));
          },
          onClose: () => {
            if (completed) return;
            finish(() => reject(new Error("Payment was cancelled before completion.")));
          },
        });
      } catch (setupError) {
        paystackPaymentInProgress = false;
        activeInlinePaymentCount = Math.max(0, activeInlinePaymentCount - 1);
        if (safetyTimerId !== null) { clearTimeout(safetyTimerId); safetyTimerId = null; }
        reject(setupError instanceof Error ? setupError : new Error("Could not initialize payment."));
        return;
      }

      if (!handler || typeof handler.openIframe !== "function") {
        paystackPaymentInProgress = false;
        activeInlinePaymentCount = Math.max(0, activeInlinePaymentCount - 1);
        if (safetyTimerId !== null) { clearTimeout(safetyTimerId); safetyTimerId = null; }
        reject(new Error("Paystack returned an invalid payment handler. Please refresh and try again."));
        return;
      }

      try {
        handler.openIframe();
        config.onOpen?.();
      } catch (openError) {
        finish(() => reject(openError instanceof Error ? openError : new Error("Could not open secure payment.")));
      }
    });
  }
}
