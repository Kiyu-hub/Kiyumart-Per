import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Store, Bike, Check, X, ArrowLeft, Eye, MapPin, CreditCard, User, Car, AlertTriangle, CalendarClock, Trash2, Eraser } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
  const [activeTab, setActiveTab] = useState<"sellers" | "riders" | "interview" | "rejected">("sellers");
  const deepLinkHandledRef = useRef(false);

  const queryParams = useMemo(() => {
    const query = location.includes("?") ? location.split("?")[1] : "";
    const params = new URLSearchParams(query);
    return {
      userId: params.get("userId") || "",
      role: String(params.get("role") || "").toLowerCase(),
    };
  }, [location]);

  const getEffectiveRole = (application: Application): "seller" | "rider" => {
    const requested = String(application.requestedRole || "").toLowerCase();
    if (requested === "seller" || requested === "rider") return requested;
    const current = String(application.role || "").toLowerCase();
    return current === "rider" ? "rider" : "seller";
  };

  const renderImageTile = (label: string, url?: string | null, testId?: string) => {
    if (!url) {
      return (
        <div className="rounded-lg border border-dashed p-3">
          <p className="text-sm font-medium text-muted-foreground mb-1">{label}</p>
          <p className="text-sm text-muted-foreground">N/A</p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border p-3 bg-muted/30" data-testid={testId}>
        <p className="text-sm font-medium text-muted-foreground mb-2">{label}</p>
        <div className="rounded-md overflow-hidden border bg-background">
          <img src={url} alt={label} className="w-full max-h-64 object-contain" />
        </div>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-xs text-primary break-all hover:underline"
        >
          {url}
        </a>
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

  const parseJsonSafely = async <T,>(res: Response, contextLabel: string): Promise<T> => {
    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();

    if (contentType.includes("text/html") || text.trim().startsWith("<!doctype") || text.trim().startsWith("<html")) {
      throw new Error(`${contextLabel}: backend returned HTML instead of JSON. Restart backend and verify API base/port.`);
    }

    if (!text.trim()) {
      return {} as T;
    }

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`${contextLabel}: invalid JSON response from backend.`);
    }
  };

  const fetchApplications = async (url: string) => {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || "Failed to fetch applications");
    }
    const payload = await parseJsonSafely<unknown>(res, "Applications list");
    return Array.isArray(payload) ? (payload as Application[]) : [];
  };

  const { data: pendingSellerApplications = [], isLoading: pendingSellersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "seller", "pending"],
    queryFn: async () => fetchApplications("/api/users?role=seller&applicationStatus=pending"),
    enabled: canManageApplications,
  });

  const { data: pendingRiderApplications = [], isLoading: pendingRidersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "rider", "pending"],
    queryFn: async () => fetchApplications("/api/users?role=rider&applicationStatus=pending"),
    enabled: canManageApplications,
  });

  const { data: interviewSellerApplications = [], isLoading: interviewSellersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "seller", "interview_scheduled"],
    queryFn: async () => fetchApplications("/api/users?role=seller&applicationStatus=interview_scheduled"),
    enabled: canManageApplications,
  });

  const { data: interviewRiderApplications = [], isLoading: interviewRidersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "rider", "interview_scheduled"],
    queryFn: async () => fetchApplications("/api/users?role=rider&applicationStatus=interview_scheduled"),
    enabled: canManageApplications,
  });

  const { data: rejectedSellerApplications = [], isLoading: rejectedSellersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "seller", "rejected"],
    queryFn: async () => fetchApplications("/api/users?role=seller&applicationStatus=rejected"),
    enabled: canManageApplications,
  });

  const { data: rejectedRiderApplications = [], isLoading: rejectedRidersLoading } = useQuery<Application[]>({
    queryKey: ["/api/users", "rider", "rejected"],
    queryFn: async () => fetchApplications("/api/users?role=rider&applicationStatus=rejected"),
    enabled: canManageApplications,
  });

  const approveApplicationMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      return apiRequest("PATCH", `/api/users/${userId}/approve`, {});
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
      return apiRequest("PATCH", `/api/users/${userId}/reject`, { reason });
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
      return apiRequest("PATCH", `/api/users/${userId}/interview`, { scheduledAt });
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
      return apiRequest("DELETE", `/api/users/${userId}`);
    },
    onSuccess: async () => {
      toast({
        title: "Deleted",
        description: "Applicant account deleted successfully",
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

  const purgePendingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/applications/purge-pending", {});
      return parseJsonSafely<{ totalFound?: number; clearedApproved?: number; deletedUnapproved?: number }>(
        res,
        "Clear Pending Queue"
      );
    },
    onSuccess: async (data: any) => {
      toast({
        title: "Pending Queue Cleared",
        description: `Found ${data?.totalFound ?? 0}. Cleared ${data?.clearedApproved ?? 0}, deleted ${data?.deletedUnapproved ?? 0}.`,
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
    setSelectedApplication(application);
    setViewDetailsOpen(true);
    setDetailsLoading(true);
    try {
      const res = await fetch(`/api/users/${application.id}`, { credentials: "include" });
      if (!res.ok) return;
      const full = await parseJsonSafely<Application>(res, "Application details");
      setSelectedApplication(full);
    } catch {
      // Keep list payload as fallback.
    } finally {
      setDetailsLoading(false);
    }
  };

  useEffect(() => {
    if (queryParams.role === "seller") setActiveTab("sellers");
    if (queryParams.role === "rider") setActiveTab("riders");
  }, [queryParams.role]);

  useEffect(() => {
    deepLinkHandledRef.current = false;
  }, [queryParams.userId]);

  useEffect(() => {
    if (!queryParams.userId || deepLinkHandledRef.current) return;

    const allBuckets: Array<{ tab: "sellers" | "riders" | "interview" | "rejected"; items: Application[] }> = [
      { tab: "sellers", items: pendingSellerApplications },
      { tab: "riders", items: pendingRiderApplications },
      { tab: "interview", items: [...interviewSellerApplications, ...interviewRiderApplications] },
      { tab: "rejected", items: [...rejectedSellerApplications, ...rejectedRiderApplications] },
    ];

    for (const bucket of allBuckets) {
      const found = bucket.items.find((app) => app.id === queryParams.userId);
      if (found) {
        deepLinkHandledRef.current = true;
        setActiveTab(bucket.tab);
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
    const confirmed = window.confirm(`Delete ${application.name}'s account and related records? This cannot be undone.`);
    if (!confirmed) return;
    deleteApplicantMutation.mutate({ userId: application.id });
  };

  const handlePurgePendingQueue = () => {
    if (user?.role !== "super_admin") return;
    const confirmed = window.confirm("Clear all pending seller/rider applications now? This deletes unapproved applicant accounts.");
    if (!confirmed) return;
    purgePendingMutation.mutate();
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
    return (
      <Card className="p-4 hover:shadow-md transition-shadow" data-testid={`card-${type}-${application.id}`}>
        <div className="flex items-start gap-4">
          <div className={`p-3 rounded-full ${type === "seller" ? "bg-blue-500/10" : "bg-orange-500/10"}`}>
            {type === "seller" ? (
              <Store className="h-6 w-6 text-blue-500" />
            ) : (
              <Bike className="h-6 w-6 text-orange-500" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <h3 className="font-semibold text-lg" data-testid={`text-name-${application.id}`}>
                  {application.name}
                </h3>
                {application.profileImage && (
                  <div className="mt-2">
                    <img
                      src={application.profileImage}
                      alt="Profile"
                      className="w-16 h-16 rounded-full object-cover border-2 border-border"
                    />
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1 mt-3">
              <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-email-${application.id}`}>
                <span className="font-medium">Email:</span> {application.email}
              </p>
              {application.phone && (
                <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-phone-${application.id}`}>
                  <span className="font-medium">Phone:</span> {application.phone}
                </p>
              )}
              {application.businessAddress && (
                <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-location-${application.id}`}>
                  <MapPin className="h-3 w-3" />
                  <span className="font-medium">Location:</span> {application.businessAddress}
                </p>
              )}
              {type === "seller" && application.storeName && (
                <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-store-${application.id}`}>
                  <Store className="h-3 w-3" />
                  <span className="font-medium">Store:</span> {application.storeName}
                </p>
              )}
              {type === "rider" && application.vehicleInfo && (
                <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-vehicle-${application.id}`}>
                  <Car className="h-3 w-3" />
                  <span className="font-medium">Vehicle:</span> {application.vehicleInfo.type}
                </p>
              )}
              {effectiveRole === "rider" && (application.riderCity || application.riderRegion) && (
                <p className="text-sm text-muted-foreground flex items-center gap-2" data-testid={`text-rider-zone-${application.id}`}>
                  <MapPin className="h-3 w-3" />
                  <span className="font-medium">City/Region:</span> {[application.riderCity, application.riderRegion].filter(Boolean).join(" / ")}
                </p>
              )}
              {status === "interview_scheduled" && application.interviewScheduledAt && (
                <p className="text-sm text-primary flex items-center gap-2" data-testid={`text-interview-${application.id}`}>
                  <CalendarClock className="h-3 w-3" />
                  <span className="font-medium">Interview:</span>{" "}
                  {new Date(application.interviewScheduledAt).toLocaleString()}
                </p>
              )}
              {status === "rejected" && application.rejectionReason && (
                <div className="mt-2 p-2 bg-destructive/10 rounded border border-destructive/20">
                  <p className="text-sm font-medium text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3" />
                    Rejection Reason:
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">{application.rejectionReason}</p>
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-2" data-testid={`text-date-${application.id}`}>
                Applied: {new Date(application.createdAt).toLocaleDateString()}
              </p>
            </div>
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
            {isActionable && (
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
            )}
            {status === "rejected" && user?.role === "super_admin" && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteApplicant(application)}
                disabled={deleteApplicantMutation.isPending}
                data-testid={`button-delete-rejected-${application.id}`}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete Applicant
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-applications">
              Applications
            </h1>
            <p className="text-muted-foreground mt-1">Review and approve seller and rider applications</p>
          </div>
          {user?.role === "super_admin" && (
            <Button
              variant="outline"
              onClick={handlePurgePendingQueue}
              disabled={purgePendingMutation.isPending}
              data-testid="button-clear-pending-queue"
              className="gap-2"
            >
              {purgePendingMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eraser className="h-4 w-4" />
              )}
              Clear Pending Queue
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
          <TabsList className="grid w-full max-w-4xl grid-cols-4">
            <TabsTrigger value="sellers" data-testid="tab-sellers">
              Pending Sellers ({pendingSellerApplications.length})
            </TabsTrigger>
            <TabsTrigger value="riders" data-testid="tab-riders">
              Pending Riders ({pendingRiderApplications.length})
            </TabsTrigger>
            <TabsTrigger value="interview" data-testid="tab-interview">
              Pending Interview ({interviewSellerApplications.length + interviewRiderApplications.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              Rejected ({rejectedSellerApplications.length + rejectedRiderApplications.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sellers" className="mt-6">
            {pendingSellersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4">
                {pendingSellerApplications.map((application) => (
                  <ApplicationCard key={application.id} application={application} type="seller" status="pending" />
                ))}
                
                {pendingSellerApplications.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground" data-testid="text-no-sellers">
                      No pending seller applications
                    </p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="riders" className="mt-6">
            {pendingRidersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4">
                {pendingRiderApplications.map((application) => (
                  <ApplicationCard key={application.id} application={application} type="rider" status="pending" />
                ))}
                
                {pendingRiderApplications.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground" data-testid="text-no-riders">
                      No pending rider applications
                    </p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="interview" className="mt-6">
            {interviewSellersLoading || interviewRidersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {interviewSellerApplications.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Seller Interviews</h3>
                    <div className="grid gap-4">
                      {interviewSellerApplications.map((application) => (
                        <ApplicationCard key={application.id} application={application} type="seller" status="interview_scheduled" />
                      ))}
                    </div>
                  </div>
                )}

                {interviewRiderApplications.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Rider Interviews</h3>
                    <div className="grid gap-4">
                      {interviewRiderApplications.map((application) => (
                        <ApplicationCard key={application.id} application={application} type="rider" status="interview_scheduled" />
                      ))}
                    </div>
                  </div>
                )}

                {interviewSellerApplications.length === 0 && interviewRiderApplications.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground" data-testid="text-no-interviews">
                      No pending interviews
                    </p>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="mt-6">
            {rejectedSellersLoading || rejectedRidersLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="space-y-6">
                {rejectedSellerApplications.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Rejected Sellers</h3>
                    <div className="grid gap-4">
                      {rejectedSellerApplications.map((application) => (
                        <ApplicationCard key={application.id} application={application} type="seller" status="rejected" />
                      ))}
                    </div>
                  </div>
                )}
                
                {rejectedRiderApplications.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Rejected Riders</h3>
                    <div className="grid gap-4">
                      {rejectedRiderApplications.map((application) => (
                        <ApplicationCard key={application.id} application={application} type="rider" status="rejected" />
                      ))}
                    </div>
                  </div>
                )}
                
                {rejectedSellerApplications.length === 0 && rejectedRiderApplications.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground" data-testid="text-no-rejected">
                      No rejected applications
                    </p>
                  </div>
                )}
              </div>
            )}
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
          <DialogContent className="w-[98vw] sm:w-[96vw] max-w-6xl h-[92vh] max-h-[92vh] overflow-hidden p-0">
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
                          {getEffectiveRole(selectedApplication) === "seller" ? "Seller" : "Delivery Rider"} application profile and verification details
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
                      {getEffectiveRole(selectedApplication) === "rider" && (
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

                  {/* Uploaded Media */}
                  <Card className="p-4">
                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Uploaded Media & Verification Images
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {renderImageTile("Profile Photo", selectedApplication.profileImage, "media-profile-image")}
                      {renderImageTile("Ghana Card Front", selectedApplication.ghanaCardFront, "media-card-front")}
                      {renderImageTile("Ghana Card Back", selectedApplication.ghanaCardBack, "media-card-back")}
                      {getEffectiveRole(selectedApplication) === "seller" &&
                        renderImageTile("Store Banner", selectedApplication.storeBanner, "media-store-banner")}
                    </div>
                  </Card>

                  {/* Vehicle Information (rider-only) */}
                  {getEffectiveRole(selectedApplication) === "rider" && (
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
                            item.ok ? "border-emerald-200 bg-emerald-50/70" : "border-amber-200 bg-amber-50/70"
                          }`}
                        >
                          {item.ok ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <X className="h-4 w-4 text-amber-600" />
                          )}
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  </Card>

                  <Card className="p-4">
                    <h3 className="text-lg font-semibold mb-3">Raw Application Record</h3>
                    <p className="text-sm text-muted-foreground mb-3">
                      Full payload snapshot for audit and debugging.
                    </p>
                    <pre className="max-h-48 overflow-auto rounded-md border bg-muted/20 p-3 text-xs leading-5 whitespace-pre-wrap break-words">
                      {JSON.stringify(selectedApplication, null, 2)}
                    </pre>
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
                          Delete Applicant
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
      </div>
    </DashboardLayout>
  );
}
