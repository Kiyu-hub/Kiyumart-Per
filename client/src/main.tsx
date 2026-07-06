import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import registerServiceWorker from "./serviceWorkerRegistration";
import "./index.css";

// Sentry — only initialises when VITE_SENTRY_DSN is set (production)
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION as string | undefined,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Capture 10% of transactions in production, 100% in dev/staging
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    // Capture 10% of sessions for replay in production
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Don't send events for known non-critical errors
      if (event.exception?.values?.[0]?.value?.includes("ResizeObserver loop")) {
        return null;
      }
      return event;
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={({ error, resetError }) => (
      <div style={{ padding: 32, textAlign: "center" }}>
        <h2 style={{ marginBottom: 8 }}>Something went wrong</h2>
        <p style={{ color: "#666", marginBottom: 16 }}>
          {(error as Error)?.message || "An unexpected error occurred"}
        </p>
        <button
          onClick={resetError}
          style={{ padding: "8px 16px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
        >
          Try Again
        </button>
      </div>
    )}
  >
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </Sentry.ErrorBoundary>
);

registerServiceWorker();
