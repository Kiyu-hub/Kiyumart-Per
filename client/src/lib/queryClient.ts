import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_CANDIDATE_TIMEOUT_MS = 6000;
const SAME_ORIGIN_TIMEOUT_MS = 12000;

/** Fires a global event the MaintenanceGuard listens to, so the maintenance
 *  page shows immediately without waiting for the next 20-second poll. */
function signalMaintenanceDetected() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("kiyumart:maintenance"));
  }
}

/** Returns true if the parsed body looks like a maintenance 503 response. */
function isMaintenanceBody(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const b = body as Record<string, unknown>;
  return b.error === "maintenance" && b.maintenanceMode === true;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    // Detect maintenance 503 and immediately signal the UI
    if (res.status === 503) {
      try {
        const parsed = JSON.parse(text);
        if (isMaintenanceBody(parsed)) {
          signalMaintenanceDetected();
          throw new Error("maintenance");
        }
      } catch (e) {
        if ((e as Error).message === "maintenance") throw e;
      }
    }
    throw new Error(`${res.status}: ${text}`);
  }
}

function addUniqueCandidate(candidates: string[], url?: string) {
  if (url && !candidates.includes(url)) {
    candidates.push(url);
  }
}

function getApiCandidates(url: string): string[] {
  if (url.startsWith("http")) return [url];

  const base = String((import.meta.env as any).VITE_API_URL || "").trim().replace(/\/$/, "");
  const normalizedPath = url.startsWith("/") ? url : `/${url}`;
  const candidates: string[] = [];

  // Always prefer the current origin first so auth cookies/session stay aligned
  // with the page the user is already on.
  addUniqueCandidate(candidates, normalizedPath);

  if (base) {
    addUniqueCandidate(candidates, `${base}${normalizedPath}`);
  }

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "https:" : "http:";
    const currentPort = window.location.port || (protocol === "https:" ? "443" : "80");

    if (currentPort !== "5000") {
      addUniqueCandidate(candidates, `${protocol}//${host}:5000${normalizedPath}`);
    }
    if (currentPort !== "5001") {
      addUniqueCandidate(candidates, `${protocol}//${host}:5001${normalizedPath}`);
    }

    // Only add localhost fallbacks in development — avoids wasted requests in production
    if ((import.meta.env as any).DEV) {
      addUniqueCandidate(candidates, `http://localhost:5000${normalizedPath}`);
      addUniqueCandidate(candidates, `http://127.0.0.1:5000${normalizedPath}`);
      addUniqueCandidate(candidates, `http://localhost:5001${normalizedPath}`);
      addUniqueCandidate(candidates, `http://127.0.0.1:5001${normalizedPath}`);
    }
  }

  return candidates;
}

async function fetchWithApiFallback(url: string, init?: RequestInit): Promise<Response> {
  const candidates = getApiCandidates(url);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), API_CANDIDATE_TIMEOUT_MS);
      const signal =
        init?.signal && typeof AbortSignal !== "undefined" && "any" in AbortSignal
          ? AbortSignal.any([init.signal, controller.signal])
          : (init?.signal ?? controller.signal);
      const res = await fetch(candidate, {
        credentials: "include",
        signal,
        ...init,
      });
      clearTimeout(timeoutId);

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/html")) {
        const bodyText = await res.text();
        lastError = new Error(
          `Expected JSON response from API but received HTML. The backend may not be running or the request was routed incorrectly. URL: ${candidate}. Response snippet: ${bodyText.substring(0, 200)}`
        );
        continue;
      }

      return res;
    } catch (error: any) {
      // Ensure each fallback attempt releases its timeout before trying the next candidate.
      if (timeoutId) clearTimeout(timeoutId);
      lastError =
        error instanceof Error
          ? error.name === "AbortError"
            ? new Error(`Request timed out after ${API_CANDIDATE_TIMEOUT_MS}ms for ${candidate}`)
            : error
          : new Error(String(error));
    }
  }

  throw lastError || new Error(`API request failed for ${url}`);
}

export async function fetchSameOrigin(url: string, init?: RequestInit): Promise<Response> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), SAME_ORIGIN_TIMEOUT_MS);
    const signal =
      init?.signal && typeof AbortSignal !== "undefined" && "any" in AbortSignal
        ? AbortSignal.any([init.signal, controller.signal])
        : (init?.signal ?? controller.signal);

    return await fetch(url, {
      credentials: "include",
      signal,
      ...init,
    });
  } catch (error: any) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${SAME_ORIGIN_TIMEOUT_MS}ms for ${url}`);
    }
    throw error instanceof Error ? error : new Error(String(error));
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

function safeParseJson(text: string): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function friendlyStatusMessage(status: number, fallback: string): string {
  if (status === 429) return "Too many attempts. Please wait a moment and try again.";
  if (status === 502 || status === 503 || status === 504) {
    return "The service is temporarily unavailable. Please try again shortly.";
  }
  return fallback;
}

export async function fetchSameOriginJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchSameOrigin(url, init);
  const text = await res.text();
  const parsed = safeParseJson(text);

  if (!res.ok) {
    if (res.status === 503 && isMaintenanceBody(parsed)) {
      signalMaintenanceDetected();
      throw new Error("maintenance");
    }
    const rawMessage = parsed?.userMessage || parsed?.error || (parsed ? null : text) || res.statusText;
    const message = friendlyStatusMessage(res.status, rawMessage);
    throw new Error(`${res.status}: ${message}`);
  }

  if (!parsed && text) {
    // Server returned 2xx but non-JSON body — surface a clear error instead of crashing.
    throw new Error(`${res.status}: Unexpected response from server.`);
  }

  return parsed as T;
}

export async function fetchApiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithApiFallback(url, init);
  const text = await res.text();
  const parsed = safeParseJson(text);

  if (!res.ok) {
    if (res.status === 503 && isMaintenanceBody(parsed)) {
      signalMaintenanceDetected();
      throw new Error("maintenance");
    }
    const rawMessage = parsed?.userMessage || parsed?.error || (parsed ? null : text) || res.statusText;
    const message = friendlyStatusMessage(res.status, rawMessage);
    throw new Error(`${res.status}: ${message}`);
  }

  if (!parsed && text) {
    throw new Error(`${res.status}: Unexpected response from server.`);
  }

  return parsed as T;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetchWithApiFallback(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : undefined,
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    // Only use the first element as the URL, rest are just cache keys
    let url = queryKey[0] as string;
    const res = await fetchWithApiFallback(url);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
