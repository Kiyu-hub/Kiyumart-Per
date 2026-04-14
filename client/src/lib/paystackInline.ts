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
const PAYSTACK_SCRIPT_SRC = "https://js.paystack.co/v1/inline.js";
const PAYSTACK_LOAD_TIMEOUT_MS = 20000;

function hasActivePaystackFrame() {
  if (typeof document === "undefined") return false;
  return Boolean(
    document.querySelector('iframe[src*="paystack"]') ||
      document.querySelector('iframe[name*="paystack"]') ||
      document.querySelector('iframe[title*="Paystack"]'),
  );
}

function shouldSuppressPaystackRuntimeNoise(message: string, filename: string) {
  const normalizedMessage = String(message || "").toLowerCase();
  const normalizedFilename = String(filename || "").toLowerCase();
  if (!activeInlinePaymentCount || !hasActivePaystackFrame()) return false;
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
  const existingPreconnect = document.querySelector<HTMLLinkElement>('link[data-paystack-preconnect="true"]');
  if (!existingPreconnect) {
    const preconnect = document.createElement("link");
    preconnect.rel = "preconnect";
    preconnect.href = "https://js.paystack.co";
    preconnect.dataset.paystackPreconnect = "true";
    document.head.appendChild(preconnect);
  }

  const existingDnsPrefetch = document.querySelector<HTMLLinkElement>('link[data-paystack-dns-prefetch="true"]');
  if (!existingDnsPrefetch) {
    const dnsPrefetch = document.createElement("link");
    dnsPrefetch.rel = "dns-prefetch";
    dnsPrefetch.href = "//js.paystack.co";
    dnsPrefetch.dataset.paystackDnsPrefetch = "true";
    document.head.appendChild(dnsPrefetch);
  }
}

function isPaystackReady() {
  return Boolean(window.PaystackPop?.setup);
}

function waitForPaystackReady(timeoutMs = PAYSTACK_LOAD_TIMEOUT_MS): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const start = Date.now();

    const check = () => {
      if (isPaystackReady()) {
        resolve();
        return;
      }

      if (Date.now() - start >= timeoutMs) {
        reject(new Error("Paystack payment tools took too long to load."));
        return;
      }

      window.setTimeout(check, 150);
    };

    check();
  });
}

function createPaystackScript(cacheBust = false) {
  const script = document.createElement("script");
  const cacheSuffix = cacheBust ? `?t=${Date.now()}` : "";
  script.src = `${PAYSTACK_SCRIPT_SRC}${cacheSuffix}`;
  script.async = true;
  script.defer = true;
  script.dataset.paystackInline = "true";
  script.dataset.loaded = "false";
  return script;
}

export function loadPaystackInlineScript(): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Paystack inline payment is only available in the browser."));
  }

  ensurePaystackPreconnect();

  if (isPaystackReady()) {
    return Promise.resolve();
  }

  if (paystackScriptPromise) {
    return paystackScriptPromise;
  }

  paystackScriptPromise = new Promise<void>((resolve, reject) => {
    let attempts = 0;

    const tryLoad = () => {
      if (isPaystackReady()) {
        resolve();
        return;
      }

      document.querySelectorAll<HTMLScriptElement>('script[data-paystack-inline="true"]').forEach((script) => {
        script.remove();
      });

      const script = createPaystackScript(attempts > 0);
      let settled = false;

      const succeed = () => {
        if (settled) return;
        settled = true;
        script.dataset.loaded = "true";
        resolve();
      };

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        script.remove();
        if (attempts < 1) {
          attempts += 1;
          window.setTimeout(tryLoad, 250);
          return;
        }
        reject(error);
      };

      script.addEventListener(
        "load",
        () => {
          void waitForPaystackReady(12000)
            .then(succeed)
            .catch(() => fail(new Error("Paystack payment tools took too long to load.")));
        },
        { once: true },
      );

      script.addEventListener(
        "error",
        () => fail(new Error("Could not load Paystack payment tools.")),
        { once: true },
      );

      document.head.appendChild(script);

      void waitForPaystackReady(12000)
        .then(succeed)
        .catch(() => {
          if (!settled) {
            fail(new Error("Paystack payment tools took too long to load."));
          }
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

export class PaystackInlineService {
  static async pay(config: InlinePaystackConfig): Promise<string> {
    ensurePaystackRuntimeGuards();
    await loadPaystackInlineScript();

    if (!window.PaystackPop?.setup) {
      throw new Error("Paystack payment tools are not available right now.");
    }

    return new Promise<string>((resolve, reject) => {
      let completed = false;
      activeInlinePaymentCount += 1;

      const finish = (callback: () => void) => {
        activeInlinePaymentCount = Math.max(0, activeInlinePaymentCount - 1);
        callback();
      };

      const handler = window.PaystackPop!.setup({
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
          const normalizedReference = normalizePaystackResponseReference(response, config.reference);
          if (!normalizedReference) {
            finish(() => reject(new Error("Payment completed, but no reference was returned.")));
            return;
          }
          finish(() => resolve(normalizedReference));
        },
        onClose: () => {
          if (completed) return;
          finish(() => reject(new Error("Payment was cancelled before completion.")));
        },
      });

      try {
        handler.openIframe();
        config.onOpen?.();
      } catch (error) {
        finish(() => reject(error instanceof Error ? error : new Error("Could not open secure payment.")));
      }
    });
  }
}
