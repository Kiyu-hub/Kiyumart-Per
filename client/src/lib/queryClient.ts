import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
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

    addUniqueCandidate(candidates, `http://localhost:5000${normalizedPath}`);
    addUniqueCandidate(candidates, `http://127.0.0.1:5000${normalizedPath}`);
    addUniqueCandidate(candidates, `http://localhost:5001${normalizedPath}`);
    addUniqueCandidate(candidates, `http://127.0.0.1:5001${normalizedPath}`);
  }

  addUniqueCandidate(candidates, normalizedPath);
  return candidates;
}

async function fetchWithApiFallback(url: string, init?: RequestInit): Promise<Response> {
  const candidates = getApiCandidates(url);
  let lastError: Error | null = null;

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, {
        credentials: "include",
        ...init,
      });

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
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error(`API request failed for ${url}`);
}

export async function fetchApiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithApiFallback(url, init);
  const text = await res.text();
  const parsed = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const message = parsed?.error || text || res.statusText;
    throw new Error(`${res.status}: ${message}`);
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
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
