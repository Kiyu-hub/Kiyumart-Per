import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Store, Bike, Check, X, ArrowLeft, Eye, MapPin, CreditCard, User, Car, AlertTriangle, CalendarClock, Trash2, ZoomIn, ZoomOut, RotateCw, Tag, Users, Clock, TrendingUp, Megaphone } from "lucide-react";
import { queryClient } from "@/lib/queryClient";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { PageLoadingState } from "@/components/ui/loading-state";

interface Application {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  requestedRole?: string | null;
  isApproved: boolean;
  applicationStatus?: "pending" | "interview_scheduled" | "approved" | "rejected";
  rejectionReason?: string | null;
  interviewScheduledAt?: string | null;
  createdAt: string;
  profileImage?: string;
  ghanaCardFront?: string;
  ghanaCardBack?: string;
  nationalIdCard?: string;
  businessAddress?: string;
  riderCity?: string | null;
  riderRegion?: string | null;
  deliveryZoneId?: string | null;
  storeType?: string | null;
  storeTypeMetadata?: Record<string, any> | null;
  storeName?: string;
  storeDescription?: string;
  storeBanner?: string | null;
  vehicleInfo?: {
    type: string;
    plateNumber?: string;
    license?: string;
    color?: string;
  };
}

interface PromotionApplication {
  id: string;
  type: "store" | "product";
  targetId: string;
  targetName: string;
  storeId?: string | null;
  storeName?: string | null;
  durationType: "hour" | "day";
  duration: number;
  unitPrice: string;
  totalPrice: string;
  sellerNote?: string | null;
  customerServiceNote?: string | null;
  paymentConfirmed: boolean;
  paymentConfirmedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  createdPromotionId?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  durationHours?: number | null;
  isActive: boolean;
  status: "pending_payment" | "payment_confirmed" | "approved" | "active" | "expired" | "rejected";
  createdAt: string;
  seller: {
    id: string;
    name: string;
    email: string;
    phone?: string | null;
  } | null;
}

export default function AdminApplications() {
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const [selectedApplication, setSelectedApplication] = useState<Application | null>(null);
  const [viewDetailsOpen, setViewDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [interviewDateTime, setInterviewDateTime] = useState("");
  const [mainTab, setMainTab] = useState<"applications" | "promotion">("applications");
  const [applicationTab, setApplicationTab] = useState<"pending_sellers" | "pending_riders" | "interview" | "rejected">("pending_sellers");
  const [promotionTab, setPromotionTab] = useState<"pending" | "active" | "expired">("pending");
  const deepLinkHandledRef = useRef(false);
  const [rotatedImageUrls, setRotatedImageUrls] = useState<Record<string, boolean>>({});
  const [zoomedImage, setZoomedImage] = useState<{ label: string; url: string; rotation: number } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomRotation, setZoomRotation] = useState(0);
  const isTestingPurgeEnabled = (import.meta.env.MODE || "development") !== "production";
  const { isExternalRiderSystemEnabled, hasResolvedSettings } = usePlatformSettings();
  const showInternalRiderFeatures = hasResolvedSettings ? !isExternalRiderSystemEnabled : false;

  const queryParams = useMemo(() => {
    const query = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(query);
    return {
      userId: params.get("userId") || "",
      role: String(params.get("role") || "").toLowerCase(),
      tab: String(params.get("tab") || "").toLowerCase(),
      promotionId: String(params.get("promotionId") || ""),
    };
  }, [location]);

  const getEffectiveRole = (application: Application): "seller" | "rider" => {
    const requested = String(application.requestedRole || "").toLowerCase();
    if (requested === "seller" || requested === "rider") return requested;
    const current = String(application.role || "").toLowerCase();
    return current === "rider" ? "rider" : "seller";
  };

  const renderImageTile = (label: string, url?: string | null, testId?: string, compact = false) => {
    if (!url) {
      return (
        <div className="rounded-lg border border-dashed p-3 h-[250px] flex flex-col">
          <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
          <div className="flex-1 rounded-md border border-dashed border-border/70 bg-background/50 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">N/A</p>
          </div>
        </div>
      );
    }

    const rotateForLandscape = Boolean(rotatedImageUrls[url]);
    const initialRotation = rotateForLandscape ? 90 : 0;
    return (
      <div className="rounded-lg border p-3 bg-muted/30 h-[250px] flex flex-col" data-testid={testId}>
        <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
        <div className="rounded-md overflow-hidden border bg-background flex-1 min-h-0 flex items-center justify-center">
          <img
            src={url}
            alt={label}
            className={`object-contain transition-transform duration-150 ${
              compact ? "max-h-[85%] max-w-[85%]" : "max-h-full max-w-full"
            } ${rotateForLandscape ? "rotate-90" : ""}`}
            style={{ imageOrientation: "from-image" as any }}
            onLoad={(event) => {
              const image = event.currentTarget;
              const shouldRotate = /ghana card/i.test(label) && image.naturalHeight > image.naturalWidth;
              setRotatedImageUrls((prev) => {
              if (Boolean(prev[url]) === shouldRotate) return prev;
              return { ...prev, [url]: shouldRotate };
            });
          }}
        />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block min-w-0 flex-1 text-xs text-primary break-all hover:underline truncate"
            title={url}
          >
            {url}
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 px-3"
            onClick={() => {
              setZoomedImage({ label, url, rotation: initialRotation });
              setZoomScale(1);
              setZoomRotation(initialRotation);
            }}
          >
            <ZoomIn className="h-3.5 w-3.5 mr-1" />
            Zoom Card
          </Button>
        </div>
      </div>
    );
  };

  const formatFieldValue = (value: unknown) => {
    if (value === null || value === undefined) return "N/A";
    if (typeof value === "string" && value.trim().length === 0) return "N/A";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  };

  const DetailField = ({
    label,
    value,
    fullWidth = false,
    testId,
  }: {
    label: string;
    value: unknown;
    fullWidth?: boolean;
    testId?: string;
  }) => (
    <div className={fullWidth ? "md:col-span-2" : ""} data-testid={testId}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm leading-6 break-words">{formatFieldValue(value)}</p>
    </div>
  );

  const getApplicationChecklist = (application: Application, role: "seller" | "rider") => {
    const checks = [
      { label: "Full name", ok: Boolean(application.name) },
      { label: "Email", ok: Boolean(application.email) },
      { label: "Phone", ok: Boolean(application.phone) },
      { label: "Business/Contact address", ok: Boolean(application.businessAddress) },
      { label: "Ghana Card number", ok: Boolean(application.nationalIdCard) },
      { label: "Profile photo", ok: Boolean(application.profileImage) },
      { label: "Ghana Card front", ok: Boolean(application.ghanaCardFront) },
      { label: "Ghana Card back", ok: Boolean(application.ghanaCardBack) },
    ];

    if (role === "seller") {
      checks.push(
        { label: "Store name", ok: Boolean(application.storeName) },
        { label: "Store type", ok: Boolean(application.storeType) },
        { label: "Store description", ok: Boolean(application.storeDescription) },
        { label: "Store banner", ok: Boolean(application.storeBanner) },
      );
    } else {
      checks.push(
        { label: "Rider city", ok: Boolean(application.riderCity) },
        { label: "Rider region", ok: Boolean(application.riderRegion) },
        { label: "Vehicle type", ok: Boolean(application.vehicleInfo?.type) },
        { label: "Vehicle plate", ok: Boolean(application.vehicleInfo?.plateNumber) },
        { label: "Driver license", ok: Boolean(application.vehicleInfo?.license) },
      );
    }

    return checks;
  };

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const canManageApplications = isAuthenticated && (user?.role === "admin" || user?.role === "super_admin");

  const buildCandidateApiUrls = (path: string): string[] => {
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const configuredBase = ((import.meta.env as any).VITE_API_URL || "").trim().replace(/\/$/, "");
    const candidates: string[] = [];

    if (configuredBase) candidates.push(`${configuredBase}${normalizedPath}`);
    candidates.push(normalizedPath);

    if (typeof window !== "undefined") {
      const host = window.location.hostname;
      const isLocal = host === "localhost" || host === "127.0.0.1";
      if (isLocal) {
        candidates.push(`http://localhost:5000${normalizedPath}`);
        candidates.push(`http://127.0.0.1:5000${normalizedPath}`);
        candidates.push(`http://localhost:5001${normalizedPath}`);
        candidates.push(`http://127.0.0.1:5001${normalizedPath}`);
      }
    }

    return Array.from(new Set(candidates));
  };

  const parseErrorPayload = (text: string, statusText: string): string => {
    if (!text?.trim()) return statusText || "Request failed";
    try {
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || text;
    } catch {
      return text;
    }
  };

  const requestJsonWithFallback = async <T,>(
    method: string,
    path: string,
    data?: unknown,
    contextLabel?: string,
  ): Promise<T> => {
    const urls = buildCandidateApiUrls(path);
    let lastNetworkError: Error | null = null;

    for (const url of urls) {
      try {
        const res = await fetch(url, {
          method,
          credentials: "include",
          headers: data ? { "Content-Type": "application/json" } : undefined,
          body: data ? JSON.stringify(data) : undefined,
        });

        const text = await res.text();
        const isHtml = /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text);
        if (isHtml) {
          // Try the next candidate backend target (common when frontend server served HTML fallback).
          continue;
        }

        if (!res.ok) {
          const backendError = new Error(parseErrorPayload(text, res.statusText));
          (backendError as any).__backendError = true;
          throw backendError;
        }

        if (!text.trim()) {
          return {} as T;
        }

        try {
          return JSON.parse(text) as T;
        } catch {
          throw new Error(`${contextLabel || path}: invalid JSON response from backend.`);
        }
      } catch (error: any) {
        if (error?.__backendError) {
          throw error;
        }
        lastNetworkError = error instanceof Error ? error : new Error(String(error || "Network request failed"));
      }
    }

    if (lastNetworkError) {
      throw new Error(
        `${contextLabel || path}: backend unreachable (${lastNetworkError.message}). Restart backend on port 5000.`,
      );
    }

    throw new Error(
      `${contextLabel || path}: backend returned HTML or was unreachable. Restart backend on port 5000.`,
    );
  };

  const fetchApplications = async (url: string) => {
    const payload = await requestJsonWithFallback<Application[]>("GET", url, undefined, "Applications list");
    return Array.isArray(payload) ? payload : [];
  };

  const { data: pendingSellerApplications = [], isLoading: pendingSellersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "seller", "pending"],
    queryFn: async () => fetchApplications("/api/users?role=seller&applicationStatus=pending"),
    enabled: canManageApplications,
  });

  const { data: pendingRiderApplications = [], isLoading: pendingRidersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "rider", "pending"],
    queryFn: async () => fetchApplications("/api/users?role=rider&applicationStatus=pending"),
    enabled: canManageApplications && showInternalRiderFeatures,
  });

  const { data: interviewSellerApplications = [], isLoading: interviewSellersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "seller", "interview_scheduled"],
    queryFn: async () => fetchApplications("/api/users?role=seller&applicationStatus=interview_scheduled"),
    enabled: canManageApplications,
  });

  const { data: interviewRiderApplications = [], isLoading: interviewRidersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "rider", "interview_scheduled"],
    queryFn: async () => fetchApplications("/api/users?role=rider&applicationStatus=interview_scheduled"),
    enabled: canManageApplications && showInternalRiderFeatures,
  });

  const { data: rejectedSellerApplications = [], isLoading: rejectedSellersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "seller", "rejected"],
    queryFn: async () => fetchApplications("/api/users?role=seller&applicationStatus=rejected"),
    enabled: canManageApplications,
  });

  const { data: rejectedRiderApplications = [], isLoading: rejectedRidersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "rider", "rejected"],
    queryFn: async () => fetchApplications("/api/users?role=rider&applicationStatus=rejected"),
    enabled: canManageApplications && showInternalRiderFeatures,
  });

  const { data: promotionApplications = [], isLoading: promotionApplicationsLoading } = useQuery<PromotionApplication[]>({
    queryKey: ["/api/admin/promotion-applications"],
    queryFn: async () => {
      const payload = await requestJsonWithFallback<PromotionApplication[]>(
        "GET",
        "/api/admin/promotion-applications",
        undefined,
        "Promotion applications",
      );
      return Array.isArray(payload) ? payload : [];
    },
    enabled: canManageApplications,
    refetchInterval: 15000,
  });

  const approveApplicationMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return requestJsonWithFallback("PATCH", `/api/users/${userId}/approve`, {}, "Approve application");
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Application approved successfully",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/stores/my-store"] });
      setViewDetailsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve application",
        variant: "destructive",
      });
    },
  });

  const rejectApplicationMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason?: string }) => {
      return requestJsonWithFallback("PATCH", `/api/users/${userId}/reject`, { reason }, "Reject application");
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Application rejected",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setViewDetailsOpen(false);
      setRejectDialogOpen(false);
      setRejectionReason("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject application",
        variant: "destructive",
      });
    },
  });

  const scheduleInterviewMutation = useMutation({
    mutationFn: async ({ userId, scheduledAt }: { userId: string; scheduledAt: string }) => {
      return requestJsonWithFallback(
        "PATCH",
        `/api/users/${userId}/interview`,
        { scheduledAt },
        "Schedule interview",
      );
    },
    onSuccess: async () => {
      toast({
        title: "Interview Scheduled",
        description: "The applicant has been moved to the Pending Interview queue.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setScheduleDialogOpen(false);
      setInterviewDateTime("");
      setViewDetailsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to schedule interview",
        variant: "destructive",
      });
    },
  });

  const deleteApplicantMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return requestJsonWithFallback("DELETE", `/api/admin/applications/${userId}`, undefined, "Remove rejected application");
    },
    onSuccess: async () => {
      toast({
        title: "Removed",
        description: "Rejected application removed. User account was not deleted.",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      setViewDetailsOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete applicant",
        variant: "destructive",
      });
    },
  });

  const promotionMutationSuccess = async (title: string, description: string) => {
    toast({ title, description });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotion-applications"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/seller/promotion-applications"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/promotions"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/promotional"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/analytics"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-earnings"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/admin/finance-summary"] }),
    ]);
  };

  const confirmPromotionPaymentMutation = useMutation({
    mutationFn: async (promotionId: string) =>
      requestJsonWithFallback("PATCH", `/api/admin/promotion-applications/${promotionId}/confirm-payment`, {}, "Confirm promotion payment"),
    onSuccess: async () => {
      await promotionMutationSuccess("Payment confirmed", "The seller promotion payment has been marked as confirmed.");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to confirm payment", variant: "destructive" });
    },
  });

  const approvePromotionMutation = useMutation({
    mutationFn: async (promotionId: string) =>
      requestJsonWithFallback("POST", `/api/admin/promotion-applications/${promotionId}/approve`, {}, "Approve promotion application"),
    onSuccess: async () => {
      await promotionMutationSuccess("Promotion approved", "The promotion has been created from the seller application.");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to approve promotion", variant: "destructive" });
    },
  });

  const rejectPromotionMutation = useMutation({
    mutationFn: async ({ promotionId, rejectionReason }: { promotionId: string; rejectionReason?: string }) =>
      requestJsonWithFallback("PATCH", `/api/admin/promotion-applications/${promotionId}/reject`, { rejectionReason }, "Reject promotion application"),
    onSuccess: async () => {
      await promotionMutationSuccess("Promotion request rejected", "The seller has been notified about the rejection.");
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to reject promotion", variant: "destructive" });
    },
  });

  const purgePendingMutation = useMutation({
    mutationFn: async () => {
      if (!isTestingPurgeEnabled) {
        throw new Error("Clear Pending Queue is disabled in production.");
      }
      try {
        return await requestJsonWithFallback<{ totalFound?: number; clearedApproved?: number; deletedUnapproved?: number; fallback?: boolean }>(
          "POST",
          "/api/admin/applications/purge-pending",
          {},
          "Clear Pending Queue",
        );
      } catch {
        if (!isTestingPurgeEnabled) {
          throw new Error("Clear Pending Queue is disabled in production.");
        }
        // Legacy fallback: perform equivalent cleanup using existing user APIs.
        const buckets = await Promise.all([
          fetchApplications("/api/users?role=seller&applicationStatus=pending"),
          ...(showInternalRiderFeatures ? [fetchApplications("/api/users?role=rider&applicationStatus=pending")] : []),
          fetchApplications("/api/users?role=seller&applicationStatus=interview_scheduled"),
          ...(showInternalRiderFeatures ? [fetchApplications("/api/users?role=rider&applicationStatus=interview_scheduled")] : []),
        ]);

        const byId = new Map<string, Application>();
        for (const appList of buckets) {
          for (const app of appList) {
            if (app?.id) byId.set(app.id, app);
          }
        }

        let clearedApproved = 0;
        let deletedUnapproved = 0;

        const uniqueApps = Array.from(byId.values());
        for (const app of uniqueApps) {
          if (app.isApproved) {
            await requestJsonWithFallback(
              "PATCH",
              `/api/users/${app.id}`,
              {
                requestedRole: null,
                applicationStatus: "approved",
                rejectionReason: null,
                interviewScheduledAt: null,
                interviewScheduledBy: null,
              },
              `Clear pending state for ${app.id}`,
            );
            clearedApproved += 1;
          } else {
            await requestJsonWithFallback("DELETE", `/api/users/${app.id}`, undefined, `Delete pending applicant ${app.id}`);
            deletedUnapproved += 1;
          }
        }

        return {
          totalFound: byId.size,
          clearedApproved,
          deletedUnapproved,
          fallback: true,
        };
      }
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Pending Queue Cleared",
        description: `${data?.fallback ? "[Legacy fallback] " : ""}Found ${data?.totalFound ?? 0}. Cleared ${data?.clearedApproved ?? 0}, deleted ${data?.deletedUnapproved ?? 0}.`,
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to clear pending queue",
        variant: "destructive",
      });
    },
  });

  const toDateTimeLocalValue = (value?: string | null) => {
    if (!value) return "";
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return "";
    const timezoneOffset = parsed.getTimezoneOffset() * 60 * 1000;
    return new Date(parsed.getTime() - timezoneOffset).toISOString().slice(0, 16);
  };

  const openDetails = async (application: Application) => {
    if (!showInternalRiderFeatures && getEffectiveRole(application) === "rider") {
      return;
    }
    setSelectedApplication(application);
    setViewDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const full = await requestJsonWithFallback<Application>("GET", `/api/users/${application.id}`, undefined, "Application details");
      setSelectedApplication(full);
    } catch {
      // Keep list payload as fallback.
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (queryParams.tab === "promotions") {
      setMainTab("promotion");
      return;
    }
    setMainTab("applications");
    if (queryParams.role === "seller") setApplicationTab("pending_sellers");
    if (showInternalRiderFeatures && queryParams.role === "rider") setApplicationTab("pending_riders");
  }, [queryParams.role, queryParams.tab, showInternalRiderFeatures]);

  useEffect(() => {
    if (!showInternalRiderFeatures && applicationTab === "pending_riders") {
      setApplicationTab("pending_sellers");
    }
  }, [applicationTab, showInternalRiderFeatures]);

  useEffect(() => {
    if (queryParams.promotionId) {
      setMainTab("promotion");
    }
  }, [queryParams.promotionId]);

  useEffect(() => {
    if (!queryParams.promotionId) return;
    const matchedPromotion = promotionApplications.find(
      (application) => String(application.id) === String(queryParams.promotionId),
    );
    if (!matchedPromotion) return;

    setMainTab("promotion");
    if (matchedPromotion.status === "active") {
      setPromotionTab("active");
      return;
    }
    if (matchedPromotion.status === "expired") {
      setPromotionTab("expired");
      return;
    }
    setPromotionTab("pending");
  }, [promotionApplications, queryParams.promotionId]);

  useEffect(() => {
    deepLinkHandledRef.current = false;
  }, [queryParams.userId, queryParams.promotionId]);

  useEffect(() => {
    if (!queryParams.userId || deepLinkHandledRef.current) return;

    const allBuckets: Array<{ tab: "pending_sellers" | "pending_riders" | "interview" | "rejected"; items: Application[] }> = [
      { tab: "pending_sellers", items: pendingSellerApplications },
      ...(showInternalRiderFeatures ? [{ tab: "pending_riders" as const, items: pendingRiderApplications }] : []),
      { tab: "interview", items: [...interviewSellerApplications, ...(showInternalRiderFeatures ? interviewRiderApplications : [])] },
      { tab: "rejected", items: [...rejectedSellerApplications, ...(showInternalRiderFeatures ? rejectedRiderApplications : [])] },
    ];

    for (const bucket of allBuckets) {
      const found = bucket.items.find((app) => app.id === queryParams.userId);
      if (found) {
        deepLinkHandledRef.current = true;
        setMainTab("applications");
        setApplicationTab(bucket.tab);
        openDetails(found);
        return;
      }
    }
  }, [
    queryParams.userId,
    pendingSellerApplications,
    pendingRiderApplications,
    interviewSellerApplications,
    interviewRiderApplications,
    rejectedSellerApplications,
    rejectedRiderApplications,
    showInternalRiderFeatures,
  ]);

  const openRejectDialog = (application: Application) => {
    setSelectedApplication(application);
    setRejectDialogOpen(true);
  };

  const openScheduleDialog = (application: Application) => {
    setSelectedApplication(application);
    const initialDate = toDateTimeLocalValue(application.interviewScheduledAt);
    setInterviewDateTime(initialDate);
    setScheduleDialogOpen(true);
  };

  const handleReject = () => {
    if (selectedApplication) {
      rejectApplicationMutation.mutate({
        userId: selectedApplication.id,
        reason: rejectionReason.trim() || undefined,
      });
    }
  };

  const handleScheduleInterview = () => {
    if (!selectedApplication) return;
    if (!interviewDateTime) {
      toast({
        title: "Interview date required",
        description: "Please select a date and time before scheduling.",
        variant: "destructive",
      });
      return;
    }

    scheduleInterviewMutation.mutate({
      userId: selectedApplication.id,
      scheduledAt: interviewDateTime,
    });
  };

  const handleDeleteApplicant = (application: Application) => {
    if (user?.role !== "super_admin") return;
    const confirmed = window.confirm(
      `Remove ${application.name}'s rejected application record from this queue? Their user account will remain active.`,
    );
    if (!confirmed) return;
    deleteApplicantMutation.mutate({ userId: application.id });
  };

  const handlePurgePendingQueue = () => {
    if (user?.role !== "super_admin") return;
    if (!isTestingPurgeEnabled) {
      toast({
        title: "Disabled in Production",
        description: "Clear Pending Queue is available for testing environments only.",
        variant: "destructive",
      });
      return;
    }
    const confirmed = window.confirm(`Clear all pending ${showInternalRiderFeatures ? "seller/rider" : "seller"} applications now? This deletes unapproved applicant accounts.`);
    if (!confirmed) return;
    purgePendingMutation.mutate();
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return <PageLoadingState title="Loading applications" description="Preparing applicant queues, promotion requests, and review actions." />;
  }

  const pendingTotal = pendingSellerApplications.length + (showInternalRiderFeatures ? pendingRiderApplications.length : 0);
  const interviewTotal = interviewSellerApplications.length + (showInternalRiderFeatures ? interviewRiderApplications.length : 0);
  const rejectedTotal = rejectedSellerApplications.length + (showInternalRiderFeatures ? rejectedRiderApplications.length : 0);
  const pendingPromotionApplications = promotionApplications.filter((application) =>
    ["pending_payment", "payment_confirmed", "approved"].includes(application.status),
  );
  const activePromotionApplications = promotionApplications.filter((application) => application.status === "active");
  const expiredPromotionApplications = promotionApplications.filter((application) => application.status === "expired");
  const promotionTotal = pendingPromotionApplications.length;

  const ApplicationCard = ({ 
    application, 
    type, 
    status 
  }: { 
    application: Application; 
    type: "seller" | "rider"; 
    status: "pending" | "interview_scheduled" | "rejected";
  }) => {
    const isActionable = status === "pending" || status === "interview_scheduled";
    const effectiveRole = getEffectiveRole(application);
    if (!showInternalRiderFeatures && effectiveRole === "rider") {
      return null;
    }
    const completionChecks = getApplicationChecklist(application, effectiveRole);
    const completedChecks = completionChecks.filter((check) => check.ok).length;
    const roleTone = effectiveRole === "seller"
      ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-200"
      : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200";
    const statusTone =
      status === "pending"
        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
        : status === "interview_scheduled"
          ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200"
          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200";
    return (
      <Card className="overflow-hidden border-border/70 bg-card/95 shadow-sm transition-all hover:border-primary/30 hover:shadow-md" data-testid={`card-${type}-${application.id}`}>
        <div className={`h-1 w-full ${effectiveRole === "seller" ? "bg-gradient-to-r from-sky-500/80 to-cyan-400/70" : "bg-gradient-to-r from-amber-500/80 to-orange-400/70"}`} />
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
            <div className="flex min-w-0 flex-1 gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${type === "seller" ? "border-sky-200 bg-sky-50 dark:border-sky-500/20 dark:bg-sky-500/10" : "border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10"}`}>
                {type === "seller" ? (
                  <Store className="h-5 w-5 text-sky-600 dark:text-sky-300" />
                ) : (
                  <Bike className="h-5 w-5 text-amber-600 dark:text-amber-300" />
                )}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start gap-2">
                  <h3 className="text-base font-semibold" data-testid={`text-name-${application.id}`}>
                    {application.name}
                  </h3>
                  <Badge variant="outline" className={roleTone}>
                    {effectiveRole === "seller" ? "Seller Application" : "Rider Application"}
                  </Badge>
                  <Badge variant="outline" className={statusTone}>
                    {status === "interview_scheduled" ? "Interview Scheduled" : status === "rejected" ? "Rejected" : "Pending Review"}
                  </Badge>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Applied {new Date(application.createdAt).toLocaleDateString()}</span>
                  <span>Checklist {completedChecks}/{completionChecks.length}</span>
                  {effectiveRole === "seller" && application.storeName ? <span>Store: {application.storeName}</span> : null}
                </div>

                {application.profileImage ? (
                    <div className="mt-3">
                      <img
                        src={application.profileImage}
                        alt="Profile"
                        className="h-14 w-14 rounded-2xl border border-border/70 object-cover"
                    />
                  </div>
                ) : null}

                <div className="mt-2 space-y-1">
                  <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-email-${application.id}`}>
                    <span className="font-medium">Email:</span> {application.email}
                  </p>
                  {application.phone ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-phone-${application.id}`}>
                      <span className="font-medium">Phone:</span> {application.phone}
                    </p>
                  ) : null}
                  {application.businessAddress ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-location-${application.id}`}>
                      <MapPin className="h-3 w-3" />
                      <span className="font-medium">Location:</span> {application.businessAddress}
                    </p>
                  ) : null}
                  {type === "seller" && application.storeName ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-store-${application.id}`}>
                      <Store className="h-3 w-3" />
                      <span className="font-medium">Store:</span> {application.storeName}
                    </p>
                  ) : null}
                  {showInternalRiderFeatures && type === "rider" && application.vehicleInfo ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-vehicle-${application.id}`}>
                      <Car className="h-3 w-3" />
                      <span className="font-medium">Vehicle:</span> {application.vehicleInfo.type}
                    </p>
                  ) : null}
                  {showInternalRiderFeatures && effectiveRole === "rider" && (application.riderCity || application.riderRegion) ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground" data-testid={`text-rider-zone-${application.id}`}>
                      <MapPin className="h-3 w-3" />
                      <span className="font-medium">City/Region:</span> {[application.riderCity, application.riderRegion].filter(Boolean).join(" / ")}
                    </p>
                  ) : null}
                  {status === "interview_scheduled" && application.interviewScheduledAt ? (
                    <p className="flex items-center gap-2 text-sm text-primary" data-testid={`text-interview-${application.id}`}>
                      <CalendarClock className="h-3 w-3" />
                      <span className="font-medium">Interview:</span>{" "}
                      {new Date(application.interviewScheduledAt).toLocaleString()}
                    </p>
                  ) : null}
                  {status === "rejected" && application.rejectionReason ? (
                    <div className="mt-2 rounded border border-destructive/20 bg-destructive/10 p-2">
                      <p className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Rejection Reason:
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">{application.rejectionReason}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 xl:min-w-[200px]">
              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Readiness</p>
                  <span className="text-xs font-semibold text-foreground">{completedChecks}/{completionChecks.length}</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${completedChecks === completionChecks.length ? "bg-emerald-500" : completedChecks >= completionChecks.length * 0.7 ? "bg-amber-500" : "bg-rose-500"}`}
                    style={{ width: `${(completedChecks / completionChecks.length) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Required fields filled</p>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { void openDetails(application); }}
                  data-testid={`button-view-${application.id}`}
                  className="gap-2"
                >
                  <Eye className="h-4 w-4" />
                  View Details
                </Button>
                {isActionable ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openScheduleDialog(application)}
                      disabled={scheduleInterviewMutation.isPending}
                      data-testid={`button-schedule-${application.id}`}
                      className="gap-2"
                    >
                      <CalendarClock className="h-4 w-4" />
                      {status === "interview_scheduled" ? "Reschedule" : "Schedule Interview"}
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => approveApplicationMutation.mutate({ userId: application.id })}
                      disabled={approveApplicationMutation.isPending}
                      data-testid={`button-approve-${application.id}`}
                      className="gap-2"
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => openRejectDialog(application)}
                      disabled={rejectApplicationMutation.isPending}
                      data-testid={`button-reject-${application.id}`}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                      Reject
                    </Button>
                  </>
                ) : null}
                {status === "rejected" && user?.role === "super_admin" ? (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDeleteApplicant(application)}
                    disabled={deleteApplicantMutation.isPending}
                    data-testid={`button-delete-rejected-${application.id}`}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove Rejected Application
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const PromotionApplicationCard = ({ application }: { application: PromotionApplication }) => {
    const isHighlighted = queryParams.promotionId && String(queryParams.promotionId) === String(application.id);
    const createdAtText = application.createdAt ? new Date(application.createdAt).toLocaleString() : "N/A";
    const windowText =
      application.startAt && application.endAt
        ? `${new Date(application.startAt).toLocaleString()} -> ${new Date(application.endAt).toLocaleString()}`
        : "N/A";

    const statusClass =
      application.status === "active"
        ? "border-emerald-200 bg-emerald-100 text-emerald-700"
        : application.status === "expired"
          ? "border-zinc-200 bg-zinc-100 text-zinc-700"
          : application.status === "payment_confirmed"
            ? "border-sky-200 bg-sky-100 text-sky-700"
            : application.status === "rejected"
              ? "border-red-200 bg-red-100 text-red-700"
              : "border-amber-200 bg-amber-100 text-amber-700";

    return (
      <Card
        className={`p-4 transition-shadow hover:shadow-md ${isHighlighted ? "ring-2 ring-primary/60 border-primary" : ""}`}
        data-testid={`card-promotion-application-${application.id}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-purple-500/10 p-2">
                <Tag className="h-4 w-4 text-purple-600" />
              </span>
              <div>
                <p className="font-semibold text-foreground">
                  {application.type === "store" ? "Store Promotion" : "Product Promotion"}
                </p>
                <p className="text-sm text-muted-foreground">{application.targetName}</p>
              </div>
            </div>
             <p className="text-sm text-muted-foreground">
               <span className="font-medium">Seller:</span> {application.seller?.name || "Unknown"} ({application.seller?.email || "N/A"})
             </p>
             <p className="text-sm text-muted-foreground">
               <span className="font-medium">Phone:</span> {application.seller?.phone || "No phone"}
             </p>
             <p className="text-sm text-muted-foreground">
               <span className="font-medium">Submitted:</span> {createdAtText}
             </p>
             <p className="text-sm text-muted-foreground">
               <span className="font-medium">Duration:</span> {application.duration} {application.durationType}(s)
             </p>
             <p className="text-sm text-muted-foreground">
               <span className="font-medium">Unit price:</span> GHS {application.unitPrice} <span className="font-medium ml-3">Quoted total:</span> GHS {application.totalPrice}
             </p>
             {application.customerServiceNote ? (
               <p className="text-sm text-muted-foreground">
                 <span className="font-medium">Service note:</span> {application.customerServiceNote}
               </p>
             ) : null}
             {application.sellerNote ? (
               <p className="text-sm text-muted-foreground">
                 <span className="font-medium">Seller note:</span> {application.sellerNote}
               </p>
             ) : null}
             {application.startAt && application.endAt ? (
               <p className="text-sm text-muted-foreground">
                 <span className="font-medium">Promotion Window:</span> {windowText}
               </p>
             ) : null}
             {application.rejectionReason ? (
               <p className="text-sm text-destructive">
                 <span className="font-medium">Reason:</span> {application.rejectionReason}
               </p>
             ) : null}
           </div>
           <div className="flex flex-col items-end gap-2 min-w-[190px]">
             <span className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${statusClass}`}>
               {application.status.replace(/_/g, " ")}
             </span>
             {(application.status === "pending_payment" || application.status === "payment_confirmed") && (
               <div className="flex flex-col gap-2 w-full">
                 {application.status === "pending_payment" ? (
                   <Button
                     size="sm"
                     className="w-full"
                     onClick={() => confirmPromotionPaymentMutation.mutate(application.id)}
                     disabled={confirmPromotionPaymentMutation.isPending}
                   >
                     Confirm Payment
                   </Button>
                 ) : null}
                 {user?.role === "super_admin" && application.status === "payment_confirmed" ? (
                   <Button
                     size="sm"
                     className="w-full"
                     onClick={() => approvePromotionMutation.mutate(application.id)}
                     disabled={approvePromotionMutation.isPending}
                   >
                     Approve & Create
                   </Button>
                 ) : null}
                 <Button
                   variant="outline"
                   size="sm"
                   className="w-full"
                   onClick={() => {
                     const reason = window.prompt("Reason for rejecting this promotion request?") || "";
                     rejectPromotionMutation.mutate({ promotionId: application.id, rejectionReason: reason });
                   }}
                   disabled={rejectPromotionMutation.isPending}
                 >
                   Reject
                 </Button>
               </div>
             )}
             {(application.status === "active" || application.status === "approved" || application.status === "expired") ? (
               <Button
                 variant="outline"
                 size="sm"
                 onClick={() => navigate("/admin/promotions")}
                 data-testid={`button-open-promotion-${application.id}`}
               >
                 Open Promotions
               </Button>
             ) : null}
           </div>
         </div>
      </Card>
    );
  };

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="space-y-6 p-4 md:p-6">
        {/* Page header */}
        <div className="relative overflow-hidden rounded-2xl border bg-card shadow-sm">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-primary/4 pointer-events-none" />
          <div className="relative p-5 md:p-6">
            <div className="flex items-start gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => window.history.back()}
                data-testid="button-back"
                className="shrink-0 mt-0.5"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="hidden sm:flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl font-bold tracking-tight md:text-3xl" data-testid="heading-applications">
                    Applications Center
                  </h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Onboarding review, interview scheduling, and promotion campaign management
                  </p>
                </div>
                <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0">
                  <span className="text-2xl font-bold text-primary tabular-nums">{pendingTotal + interviewTotal}</span>
                  <span className="text-xs text-muted-foreground">Active in queue</span>
                </div>
              </div>
            </div>
            <div className="mt-4 ml-12 sm:ml-[76px] flex flex-wrap gap-2">
              <Badge variant="outline" className="border-primary/25 bg-primary/8 text-primary text-xs font-medium">Operations Queue</Badge>
              <Badge variant="outline" className="text-xs">
                {showInternalRiderFeatures ? "Seller + Rider Intake" : "Seller Intake Only"}
              </Badge>
              <Badge variant="outline" className="text-xs">Promotion Review</Badge>
            </div>
          </div>
        </div>

        <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as "applications" | "promotion")} className="w-full">
          <TabsList className="grid h-auto w-full grid-cols-2 gap-2 bg-muted/40 border rounded-xl p-1">
            <TabsTrigger
              value="applications"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/70"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/20">
                <Store className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold leading-none">Applications</p>
                <p className="text-xs text-muted-foreground mt-0.5">Seller & rider onboarding</p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold tabular-nums ml-auto shrink-0">
                {pendingTotal + interviewTotal + rejectedTotal}
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="promotion"
              className="flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:border data-[state=active]:border-border/70"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/10 border border-purple-500/20">
                <Megaphone className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold leading-none">Promotions</p>
                <p className="text-xs text-muted-foreground mt-0.5">Campaigns & requests</p>
              </div>
              <span className="rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-bold tabular-nums ml-auto shrink-0">
                {promotionTotal + activePromotionApplications.length + expiredPromotionApplications.length}
              </span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="mt-5 space-y-5">
            <div className={`grid gap-3 ${showInternalRiderFeatures ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
              <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 border border-sky-500/20">
                    <Store className="h-5 w-5 text-sky-600 dark:text-sky-400" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Pending Sellers</p>
                    <p className="text-2xl font-bold tabular-nums">{pendingSellerApplications.length}</p>
                  </div>
                </CardContent>
              </Card>
              {showInternalRiderFeatures ? (
                <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                      <Bike className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Pending Riders</p>
                      <p className="text-2xl font-bold tabular-nums">{pendingRiderApplications.length}</p>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10 border border-blue-500/20">
                    <CalendarClock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Interviews</p>
                    <p className="text-2xl font-bold tabular-nums">{interviewTotal}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <X className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Rejected</p>
                    <p className="text-2xl font-bold tabular-nums">{rejectedTotal}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardContent className="p-4 md:p-5">
                <Tabs
                  value={applicationTab}
                  onValueChange={(value) =>
                    setApplicationTab(value as "pending_sellers" | "pending_riders" | "interview" | "rejected")
                  }
                  className="w-full"
                >
                  <TabsList
                    className={`grid h-auto w-full gap-2 bg-transparent p-0 ${
                      showInternalRiderFeatures ? "grid-cols-1 md:grid-cols-4" : "grid-cols-1 md:grid-cols-3"
                    }`}
                  >
                    <TabsTrigger value="pending_sellers" data-testid="tab-sellers" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                      Pending Sellers ({pendingSellerApplications.length})
                    </TabsTrigger>
                    {showInternalRiderFeatures ? (
                      <TabsTrigger value="pending_riders" data-testid="tab-riders" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                        Pending Riders ({pendingRiderApplications.length})
                      </TabsTrigger>
                    ) : null}
                    <TabsTrigger value="interview" data-testid="tab-interview" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                      Interviews ({interviewTotal})
                    </TabsTrigger>
                    <TabsTrigger value="rejected" data-testid="tab-rejected" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                      Rejected ({rejectedTotal})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="pending_sellers" className="mt-6">
                    {pendingSellersLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="grid gap-4 xl:grid-cols-2">
                        {pendingSellerApplications.map((application) => (
                          <ApplicationCard key={application.id} application={application} type="seller" status="pending" />
                        ))}
                        {pendingSellerApplications.length === 0 ? (
                          <div className="col-span-full text-center py-12">
                            <p className="text-muted-foreground" data-testid="text-no-sellers">
                              No pending seller applications
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </TabsContent>

                  {showInternalRiderFeatures ? (
                    <TabsContent value="pending_riders" className="mt-6">
                      {pendingRidersLoading ? (
                        <div className="flex justify-center py-12">
                          <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        </div>
                      ) : (
                        <div className="grid gap-4 xl:grid-cols-2">
                          {pendingRiderApplications.map((application) => (
                            <ApplicationCard key={application.id} application={application} type="rider" status="pending" />
                          ))}
                          {pendingRiderApplications.length === 0 ? (
                            <div className="col-span-full text-center py-12">
                              <p className="text-muted-foreground" data-testid="text-no-riders">
                                No pending rider applications
                              </p>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </TabsContent>
                  ) : null}

                  <TabsContent value="interview" className="mt-6">
                    {interviewSellersLoading || (showInternalRiderFeatures && interviewRidersLoading) ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {interviewSellerApplications.length > 0 ? (
                          <div>
                            <h3 className="mb-4 text-lg font-semibold">Seller Interviews</h3>
                            <div className="grid gap-4 xl:grid-cols-2">
                              {interviewSellerApplications.map((application) => (
                                <ApplicationCard key={application.id} application={application} type="seller" status="interview_scheduled" />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {showInternalRiderFeatures && interviewRiderApplications.length > 0 ? (
                          <div>
                            <h3 className="mb-4 text-lg font-semibold">Rider Interviews</h3>
                            <div className="grid gap-4 xl:grid-cols-2">
                              {interviewRiderApplications.map((application) => (
                                <ApplicationCard key={application.id} application={application} type="rider" status="interview_scheduled" />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {interviewSellerApplications.length === 0 && (!showInternalRiderFeatures || interviewRiderApplications.length === 0) ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground" data-testid="text-no-interviews">
                              No pending interviews
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="rejected" className="mt-6">
                    {rejectedSellersLoading || (showInternalRiderFeatures && rejectedRidersLoading) ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {rejectedSellerApplications.length > 0 ? (
                          <div>
                            <h3 className="mb-4 text-lg font-semibold">Rejected Sellers</h3>
                            <div className="grid gap-4 xl:grid-cols-2">
                              {rejectedSellerApplications.map((application) => (
                                <ApplicationCard key={application.id} application={application} type="seller" status="rejected" />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {showInternalRiderFeatures && rejectedRiderApplications.length > 0 ? (
                          <div>
                            <h3 className="mb-4 text-lg font-semibold">Rejected Riders</h3>
                            <div className="grid gap-4 xl:grid-cols-2">
                              {rejectedRiderApplications.map((application) => (
                                <ApplicationCard key={application.id} application={application} type="rider" status="rejected" />
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {rejectedSellerApplications.length === 0 && (!showInternalRiderFeatures || rejectedRiderApplications.length === 0) ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground" data-testid="text-no-rejected">
                              No rejected applications
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="promotion" className="mt-5 space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20">
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Pending</p>
                    <p className="text-2xl font-bold tabular-nums">{pendingPromotionApplications.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Active</p>
                    <p className="text-2xl font-bold tabular-nums">{activePromotionApplications.length}</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border/70 bg-card shadow-sm overflow-hidden">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-500/10 border border-zinc-500/20">
                    <Megaphone className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Expired</p>
                    <p className="text-2xl font-bold tabular-nums">{expiredPromotionApplications.length}</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-border/70 bg-card/95 shadow-sm">
              <CardContent className="p-4 md:p-5">
                <Tabs
                  value={promotionTab}
                  onValueChange={(value) => setPromotionTab(value as "pending" | "active" | "expired")}
                  className="w-full"
                >
                  <TabsList className="grid h-auto w-full grid-cols-1 gap-2 bg-transparent p-0 md:grid-cols-3">
                    <TabsTrigger value="pending" data-testid="tab-promotion-applications" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                      Pending Applications ({pendingPromotionApplications.length})
                    </TabsTrigger>
                    <TabsTrigger value="active" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                      Active ({activePromotionApplications.length})
                    </TabsTrigger>
                    <TabsTrigger value="expired" className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10">
                      Expired ({expiredPromotionApplications.length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="pending" className="mt-6">
                    {promotionApplicationsLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {pendingPromotionApplications.map((promotion) => (
                          <PromotionApplicationCard key={promotion.id} application={promotion} />
                        ))}
                        {pendingPromotionApplications.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground" data-testid="text-no-promotion-applications">
                              No pending promotion applications
                            </p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="active" className="mt-6">
                    {promotionApplicationsLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {activePromotionApplications.map((promotion) => (
                          <PromotionApplicationCard key={promotion.id} application={promotion} />
                        ))}
                        {activePromotionApplications.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground">No active promotions</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="expired" className="mt-6">
                    {promotionApplicationsLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {expiredPromotionApplications.map((promotion) => (
                          <PromotionApplicationCard key={promotion.id} application={promotion} />
                        ))}
                        {expiredPromotionApplications.length === 0 ? (
                          <div className="text-center py-12">
                            <p className="text-muted-foreground">No expired promotions</p>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Application</DialogTitle>
              <DialogDescription>
                Are you sure you want to reject {selectedApplication?.name}'s application? 
                You can optionally provide a reason.
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="reason">Rejection Reason (Optional)</Label>
                <Textarea
                  id="reason"
                  placeholder="e.g., Incomplete documentation, invalid Ghana Card, etc."
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="mt-2"
                  rows={4}
                  data-testid="input-rejection-reason"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectDialogOpen(false);
                  setRejectionReason("");
                }}
                data-testid="button-cancel-reject"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={rejectApplicationMutation.isPending}
                data-testid="button-confirm-reject"
                className="gap-2"
              >
                {rejectApplicationMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Reject Application
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={scheduleDialogOpen} onOpenChange={setScheduleDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Interview</DialogTitle>
              <DialogDescription>
                Select interview date and time for {selectedApplication?.name}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div>
                <Label htmlFor="interview-date-time">Interview Date and Time</Label>
                <Input
                  id="interview-date-time"
                  type="datetime-local"
                  value={interviewDateTime}
                  onChange={(e) => setInterviewDateTime(e.target.value)}
                  className="mt-2"
                  data-testid="input-interview-date-time"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setScheduleDialogOpen(false);
                  setInterviewDateTime("");
                }}
                data-testid="button-cancel-schedule"
              >
                Cancel
              </Button>
              <Button
                onClick={handleScheduleInterview}
                disabled={scheduleInterviewMutation.isPending}
                data-testid="button-confirm-schedule"
                className="gap-2"
              >
                {scheduleInterviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarClock className="h-4 w-4" />
                )}
                Schedule Interview
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Application Details Dialog */}
        <Dialog open={viewDetailsOpen} onOpenChange={setViewDetailsOpen}>
          <DialogContent className="w-[98vw] sm:w-[96vw] max-w-6xl h-[88vh] max-h-[88vh] overflow-hidden p-0">
            {selectedApplication && (
              <>
                <div className="relative flex h-full min-h-0 flex-col">
                  <DialogHeader className="shrink-0 border-b bg-muted/20 px-6 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <DialogTitle className="text-2xl flex items-center gap-3">
                          {selectedApplication.profileImage ? (
                            <img
                              src={selectedApplication.profileImage}
                              alt={`${selectedApplication.name || "Applicant"} profile`}
                              className="h-12 w-12 rounded-full object-cover border border-border shrink-0"
                            />
                          ) : (
                            <span className="h-12 w-12 rounded-full border border-border bg-muted/40 flex items-center justify-center shrink-0">
                              <User className="h-6 w-6 text-muted-foreground" />
                            </span>
                          )}
                          <span className={`rounded-full p-2 ${getEffectiveRole(selectedApplication) === "seller" ? "bg-blue-500/10" : "bg-orange-500/10"}`}>
                            {getEffectiveRole(selectedApplication) === "seller" ? (
                              <Store className="h-6 w-6 text-blue-500" />
                            ) : (
                              <Bike className="h-6 w-6 text-orange-500" />
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate">{selectedApplication.name || "Unnamed Applicant"}</span>
                            <span className="block text-sm font-normal text-muted-foreground truncate">
                              {selectedApplication.email || "No email"}
                            </span>
                          </span>
                        </DialogTitle>
                        <DialogDescription className="mt-2">
                          {getEffectiveRole(selectedApplication) === "seller" ? "Seller" : "Delivery"} application profile and verification details
                        </DialogDescription>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize ${
                            selectedApplication.applicationStatus === "rejected"
                              ? "border-rose-200 bg-rose-100 text-rose-700"
                              : selectedApplication.applicationStatus === "interview_scheduled"
                                ? "border-blue-200 bg-blue-100 text-blue-700"
                                : selectedApplication.applicationStatus === "approved"
                                  ? "border-emerald-200 bg-emerald-100 text-emerald-700"
                                  : "border-amber-200 bg-amber-100 text-amber-700"
                          }`}
                        >
                          {(selectedApplication.applicationStatus || "pending").replace(/_/g, " ")}
                        </span>
                        <span className="rounded-full border bg-background px-3 py-1 text-xs font-semibold capitalize">
                          {getEffectiveRole(selectedApplication)} application
                        </span>
                      </div>
                    </div>
                  </DialogHeader>

                  <div className="mt-0 flex-1 min-h-0 overflow-y-auto px-6 py-5">
                  <div className="space-y-5">
                  {/* Rejection Reason (if rejected) */}
                  {selectedApplication.applicationStatus === "rejected" && selectedApplication.rejectionReason && (
                    <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="h-5 w-5 text-destructive" />
                        <h3 className="text-lg font-semibold text-destructive">Rejection Reason</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedApplication.rejectionReason}</p>
                    </div>
                  )}

                  {selectedApplication.applicationStatus === "interview_scheduled" && selectedApplication.interviewScheduledAt && (
                    <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CalendarClock className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold text-primary">Interview Scheduled</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {new Date(selectedApplication.interviewScheduledAt).toLocaleString()}
                      </p>
                    </div>
                  )}

                  {/* ID Card Verification */}
                  <Card className="p-3">
                    <h3 className="text-base font-semibold mb-2 flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      ID Card Verifications
                    </h3>
                    <p className="text-xs text-muted-foreground mb-3">
                      Use the <span className="font-semibold">Zoom Card</span> button under each image to inspect details clearly.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {renderImageTile("Ghana Card Front", selectedApplication.ghanaCardFront, "media-card-front", true)}
                      {renderImageTile("Ghana Card Back", selectedApplication.ghanaCardBack, "media-card-back", true)}
                    </div>
                  </Card>

                  {/* Personal Information */}
                  <Card className="p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <User className="h-5 w-5" />
                      Personal Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <DetailField label="Application ID" value={selectedApplication.id} />
                      <DetailField
                        label="Applied On"
                        value={selectedApplication.createdAt ? new Date(selectedApplication.createdAt).toLocaleString() : "N/A"}
                      />
                      <DetailField label="Full Name" value={selectedApplication.name} />
                      <DetailField label="Email" value={selectedApplication.email} />
                      <DetailField label="Phone" value={selectedApplication.phone} />
                      <DetailField label="Current Account Role" value={selectedApplication.role} />
                      <DetailField label="Requested Role" value={getEffectiveRole(selectedApplication)} />
                      <DetailField label="Ghana Card Number" value={selectedApplication.nationalIdCard} />
                      <DetailField label="Application Status" value={selectedApplication.applicationStatus} />
                      <DetailField label="Delivery Zone ID" value={selectedApplication.deliveryZoneId} />
                      <DetailField label="Address / Location" value={selectedApplication.businessAddress} fullWidth />
                      {showInternalRiderFeatures && getEffectiveRole(selectedApplication) === "rider" && (
                        <>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Rider City</p>
                            <p className="text-base">{selectedApplication.riderCity || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Rider Region</p>
                            <p className="text-base">{selectedApplication.riderRegion || "N/A"}</p>
                          </div>
                        </>
                      )}
                      {getEffectiveRole(selectedApplication) === "seller" && (
                        <>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Store Name</p>
                            <p className="text-base">{selectedApplication.storeName || "N/A"}</p>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-muted-foreground">Store Type</p>
                            <p className="text-base">{selectedApplication.storeType || "N/A"}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-sm font-medium text-muted-foreground">Store Description</p>
                            <p className="text-base">{selectedApplication.storeDescription || "N/A"}</p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-sm font-medium text-muted-foreground">Store Metadata</p>
                            {selectedApplication.storeTypeMetadata && Object.keys(selectedApplication.storeTypeMetadata).length > 0 ? (
                              <div className="space-y-3">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {Object.entries(selectedApplication.storeTypeMetadata).map(([key, value]) => (
                                    <div key={key} className="rounded border p-2 bg-muted/20">
                                      <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        {key.replace(/([A-Z])/g, " $1").trim()}
                                      </p>
                                      <p className="text-sm break-words">
                                        {Array.isArray(value)
                                          ? value.join(", ")
                                          : typeof value === "object"
                                            ? JSON.stringify(value)
                                            : String(value)}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                                <details className="rounded border p-2 bg-muted/10">
                                  <summary className="cursor-pointer text-xs text-muted-foreground">Raw metadata JSON</summary>
                                  <pre className="text-xs mt-2 overflow-x-auto whitespace-pre-wrap">
                                    {JSON.stringify(selectedApplication.storeTypeMetadata, null, 2)}
                                  </pre>
                                </details>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">N/A</p>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </Card>

                  {/* Vehicle Information (rider-only) */}
                  {showInternalRiderFeatures && getEffectiveRole(selectedApplication) === "rider" && (
                    <Card className="p-4">
                      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                        <Car className="h-5 w-5" />
                        Vehicle Information
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Vehicle Type</p>
                          <p className="text-base capitalize">{selectedApplication.vehicleInfo?.type || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Plate Number</p>
                          <p className="text-base">{selectedApplication.vehicleInfo?.plateNumber || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">License Number</p>
                          <p className="text-base">{selectedApplication.vehicleInfo?.license || "N/A"}</p>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Vehicle Color</p>
                          <p className="text-base">{selectedApplication.vehicleInfo?.color || "N/A"}</p>
                        </div>
                      </div>
                    </Card>
                  )}

                  <Card className="p-4">
                    <h3 className="text-lg font-semibold mb-3">Application Completeness</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      {
                        (() => {
                          const checks = getApplicationChecklist(selectedApplication, getEffectiveRole(selectedApplication));
                          const completed = checks.filter((item) => item.ok).length;
                          return `${completed}/${checks.length} required fields provided`;
                        })()
                      }
                    </p>
                    <div className="space-y-2">
                      {getApplicationChecklist(selectedApplication, getEffectiveRole(selectedApplication)).map((item) => (
                        <div
                          key={item.label}
                            className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                              item.ok
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/80 dark:bg-emerald-900/45 dark:text-emerald-50"
                                : "border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-400/80 dark:bg-yellow-900/45 dark:text-yellow-50"
                            }`}
                        >
                          {item.ok ? (
                            <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-200" />
                          ) : (
                            <X className="h-4 w-4 text-yellow-600 dark:text-yellow-200" />
                          )}
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="shrink-0 border-t bg-background px-6 py-4">
                    <div className="flex flex-wrap justify-end gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setViewDetailsOpen(false)}
                        data-testid="button-close-details"
                      >
                        Close
                      </Button>
                      {(selectedApplication.applicationStatus === "pending" || selectedApplication.applicationStatus === "interview_scheduled") && (
                        <>
                          <Button
                            variant="destructive"
                            onClick={() => {
                              setViewDetailsOpen(false);
                              openRejectDialog(selectedApplication);
                            }}
                            data-testid="button-reject-details"
                            className="gap-2"
                          >
                            <X className="h-4 w-4" />
                            Reject Application
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => {
                              setViewDetailsOpen(false);
                              openScheduleDialog(selectedApplication);
                            }}
                            disabled={scheduleInterviewMutation.isPending}
                            data-testid="button-schedule-details"
                            className="gap-2"
                          >
                            <CalendarClock className="h-4 w-4" />
                            {selectedApplication.applicationStatus === "interview_scheduled"
                              ? "Reschedule Interview"
                              : "Schedule Interview"}
                          </Button>
                          <Button
                            variant="default"
                            onClick={() => approveApplicationMutation.mutate({ userId: selectedApplication.id })}
                            disabled={approveApplicationMutation.isPending}
                            data-testid="button-approve-details"
                            className="gap-2"
                          >
                            {approveApplicationMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            Approve Application
                          </Button>
                        </>
                      )}
                      {selectedApplication.applicationStatus === "rejected" && user?.role === "super_admin" && (
                        <Button
                          variant="destructive"
                          onClick={() => handleDeleteApplicant(selectedApplication)}
                          disabled={deleteApplicantMutation.isPending}
                          data-testid="button-delete-details"
                          className="gap-2"
                        >
                          <Trash2 className="h-4 w-4" />
                          Remove Rejected Application
                        </Button>
                      )}
                    </div>
                  </div>
                  {detailsLoading && (
                    <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px] flex items-center justify-center">
                      <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(zoomedImage)}
          onOpenChange={(open) => {
            if (!open) {
              setZoomedImage(null);
              setZoomScale(1);
              setZoomRotation(0);
            }
          }}
        >
          <DialogContent className="w-[96vw] max-w-5xl h-[90vh] p-0 overflow-hidden">
            <DialogHeader className="border-b px-6 py-4">
              <DialogTitle>{zoomedImage?.label || "Image Preview"}</DialogTitle>
              <DialogDescription>Use zoom and rotate controls to inspect verification details clearly.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between gap-2 border-b px-6 py-3">
              <div className="text-sm text-muted-foreground truncate">{zoomedImage?.url || ""}</div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
                >
                  <ZoomOut className="h-4 w-4" />
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setZoomScale(1)}>
                  100%
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
                >
                  <ZoomIn className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setZoomRotation((prev) => (prev + 90) % 360)}
                >
                  <RotateCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="h-full overflow-auto bg-black/80 p-4">
              {zoomedImage && (
                <div className="flex min-h-full items-center justify-center">
                  <img
                    src={zoomedImage.url}
                    alt={zoomedImage.label}
                    className="max-w-none"
                    style={{
                      transform: `scale(${zoomScale}) rotate(${zoomRotation}deg)`,
                      transformOrigin: "center center",
                      imageOrientation: "from-image" as any,
                    }}
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
