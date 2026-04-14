import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchSameOrigin, fetchSameOriginJson, queryClient } from "./queryClient";

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  roleFeatures?: Record<string, boolean>;
  requestedRole?: "seller" | "rider" | null;
  applicationStatus?: "pending" | "interview_scheduled" | "approved" | "rejected";
  interviewScheduledAt?: string | null;
  rejectionReason?: string | null;
  phone?: string;
  profileImage?: string;
  storeName?: string;
  isActive: boolean;
  isApproved: boolean;
}

function normalizeRole(role?: string | null): string {
  const raw = String(role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
  if (raw === "superadmin") return "super_admin";
  return raw;
}

function normalizeUser(user: User): User {
  return {
    ...user,
    role: normalizeRole(user.role),
  };
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { email: string; password: string; name: string; role?: string }) => Promise<void>;
  logout: () => Promise<void>;
  ensureAuthenticated: (options?: { force?: boolean }) => Promise<User | null>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [lastVerifiedAt, setLastVerifiedAt] = useState(0);

  const fetchCurrentUser = async (): Promise<User | null> => {
    const res = await fetchSameOrigin("/api/auth/me", { cache: "no-store" });
    if (res.status === 401) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`${res.status}: ${res.statusText}`);
    }
    return res.json();
  };

  const { data: currentUser, isLoading, isError } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: fetchCurrentUser,
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (currentUser) {
      setUser(normalizeUser(currentUser));
      setLastVerifiedAt(Date.now());
    } else if ((currentUser === null && !isLoading) || isError) {
      setUser(null);
      setLastVerifiedAt(Date.now());
      queryClient.setQueryData(["/api/auth/me"], null);
    }
  }, [currentUser, isLoading, isError]);

  const ensureAuthenticated = async (options?: { force?: boolean }) => {
    const shouldUseCurrentUser =
      !options?.force &&
      user &&
      Date.now() - lastVerifiedAt < 30_000;

    if (shouldUseCurrentUser) {
      return user;
    }

    try {
      const refreshed = await queryClient.fetchQuery<User | null>({
        queryKey: ["/api/auth/me"],
        queryFn: fetchCurrentUser,
        staleTime: 0,
      });

      if (refreshed) {
        const normalized = normalizeUser(refreshed);
        setUser(normalized);
        setLastVerifiedAt(Date.now());
        return normalized;
      }

      setUser(null);
      setLastVerifiedAt(Date.now());
      queryClient.setQueryData(["/api/auth/me"], null);
      return null;
    } catch {
      setUser(null);
      setLastVerifiedAt(Date.now());
      queryClient.setQueryData(["/api/auth/me"], null);
      return null;
    }
  };

  const loginMutation = useMutation({
    mutationFn: async ({ email, password }: { email: string; password: string }) => {
      return fetchSameOriginJson<{ user: User }>("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });
    },
    onSuccess: (data) => {
      setUser(normalizeUser(data.user));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const signupMutation = useMutation({
    mutationFn: async (data: { email: string; password: string; name: string; role?: string }) => {
      return fetchSameOriginJson<{ user: User }>("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      setUser(normalizeUser(data.user));
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetchSameOriginJson<{ success: boolean }>("/api/auth/logout", {
        method: "POST",
      });
    },
    onSuccess: () => {
      setUser(null);
      queryClient.clear();
      window.location.href = "/";
    },
  });

  const login = async (email: string, password: string) => {
    await loginMutation.mutateAsync({ email, password });
  };

  const signup = async (data: { email: string; password: string; name: string; role?: string }) => {
    await signupMutation.mutateAsync(data);
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        login,
        signup,
        logout,
        ensureAuthenticated,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
