import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  // Allow overriding API base in dev (Vite): e.g., VITE_API_URL=http://localhost:5000
  const base = (import.meta.env as any).VITE_API_URL || "";
  const fullUrl = url.startsWith("http") ? url : `${base}${url}`;

  const res = await fetch(fullUrl, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
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

    // Support Vite-configured API base (VITE_API_URL). This helps when frontend is served on a different host than backend.
    const base = (import.meta.env as any).VITE_API_URL || "";
    const fullUrl = url.startsWith("http") ? url : `${base}${url}`;

    const res = await fetch(fullUrl, {
      credentials: "include",
    });

    // Helpful error if the backend returns HTML (common when backend isn't running or proxy misconfigured)
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("text/html")) {
      const bodyText = await res.text();
      throw new Error(
        `Expected JSON response from API but received HTML. The backend may not be running at '${base || "<same origin>"}' or the request was routed incorrectly. URL: ${fullUrl}. Response snippet: ${bodyText.substring(0, 200)}`
      );
    }

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
