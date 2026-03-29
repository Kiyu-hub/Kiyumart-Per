import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSocket } from "@/contexts/NotificationContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Plus, Edit, Trash2, MapPin, Users, Mail, Phone } from "lucide-react";

const GHANA_REGIONS = [
  "Greater Accra",
  "Ashanti",
  "Central",
  "Eastern",
  "Western",
  "Western North",
  "Volta",
  "Oti",
  "Northern",
  "Savannah",
  "North East",
  "Upper East",
  "Upper West",
  "Bono",
  "Bono East",
  "Ahafo",
] as const;

const zoneSchema = z.object({
  name: z.string().min(1, "Zone name is required"),
  type: z.enum(["city", "region"]).default("city"),
  city: z.string().optional(),
  region: z.string().optional(),
  fee: z.string().optional().refine((val) => val === undefined || val === "" || (!isNaN(parseFloat(val)) && parseFloat(val) >= 0), {
    message: "Fee must be a positive number",
  }),
  isActive: z.boolean(),
});

type ZoneFormData = z.infer<typeof zoneSchema>;

interface DeliveryZone {
  id: string;
  entityKind?: "delivery_zone" | "pickup_station";
  name: string;
  type?: "city" | "region";
  city?: string | null;
  region?: string | null;
  fee: string;
  isActive: boolean;
  createdAt: string;
}

interface PickupAgent {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  businessAddress?: string | null;
  deliveryZoneId?: string | null;
  isActive?: boolean;
}

export function AdminDeliveryZonesPage({
  entityKind = "delivery_zone",
}: {
  entityKind?: "delivery_zone" | "pickup_station";
}) {
  const { toast } = useToast();
  const { formatPrice, currency } = useLanguage();
  const socket = useSocket();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [selectedPickupAgentIds, setSelectedPickupAgentIds] = useState<string[]>([]);
  const [hasInitializedAgentSelection, setHasInitializedAgentSelection] = useState(false);
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const normalizedRole = (() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  })();
  const isAdminViewer = normalizedRole === "admin" || normalizedRole === "super_admin";
  const isPickupStationPage = entityKind === "pickup_station";
  const pageTitle = isPickupStationPage ? "Pickup Stations" : "Delivery Zones & Pricing";
  const pageDescription = isPickupStationPage
    ? "Manage pickup stations used for pickup-agent assignment and pickup order routing"
    : "Manage delivery zones and their associated fees";
  const entityLabel = isPickupStationPage ? "pickup station" : "zone";
  const entityLabelPlural = isPickupStationPage ? "pickup stations" : "zones";

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdminViewer)) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, isAdminViewer, navigate]);

  const { data: zones = [], isLoading } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/admin/delivery-zones", entityKind],
    queryFn: async () => {
      const endpoint = isPickupStationPage ? "/api/admin/pickup-stations" : "/api/admin/delivery-zones";
      const res = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch delivery zones");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && isAdminViewer,
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: pickupAgents = [], isLoading: pickupAgentsLoading } = useQuery<PickupAgent[]>({
    queryKey: ["/api/users", "pickup_agent", "station-assignment"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=pickup_agent", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch pickup agents");
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: isAuthenticated && isAdminViewer && isPickupStationPage,
    staleTime: 0,
    refetchInterval: 10000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!socket) return;
    const handleZonesUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", "pickup_agent", "station-assignment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
    };

    socket.on("delivery_zones_updated", handleZonesUpdate);
    return () => {
      socket.off("delivery_zones_updated", handleZonesUpdate);
    };
  }, [socket]);

  const form = useForm<ZoneFormData>({
    resolver: zodResolver(zoneSchema),
    defaultValues: {
      name: "",
      type: "city",
      city: "",
      region: "",
      fee: "0",
      isActive: true,
    },
  });

  const normalizeZonePayload = (data: ZoneFormData): ZoneFormData => {
    const normalizedFee = isPickupStationPage ? "0" : String(data.fee || "0");
    return {
      ...data,
      entityKind,
      fee: normalizedFee,
    } as ZoneFormData;
  };

  const syncPickupAgentAssignments = async (zoneId: string) => {
    if (!isPickupStationPage) return;

    const normalizedZoneId = String(zoneId || "").trim();
    const selectedIds = new Set(selectedPickupAgentIds.map((id) => String(id).trim()).filter(Boolean));

    const updates = pickupAgents.flatMap((agent) => {
      const agentId = String(agent.id || "").trim();
      if (!agentId) return [];

      const currentZoneId = String(agent.deliveryZoneId || "").trim();
      const shouldAssignHere = selectedIds.has(agentId);

      if (shouldAssignHere && currentZoneId !== normalizedZoneId) {
        return [apiRequest("PATCH", `/api/users/${agentId}`, { deliveryZoneId: normalizedZoneId })];
      }

      if (!shouldAssignHere && currentZoneId === normalizedZoneId) {
        return [apiRequest("PATCH", `/api/users/${agentId}`, { deliveryZoneId: null })];
      }

      return [];
    });

    await Promise.all(updates);
  };

  const createZoneMutation = useMutation({
    mutationFn: async (data: ZoneFormData) => {
      const normalizedData = normalizeZonePayload(data);
      const res = await apiRequest("POST", "/api/delivery-zones", normalizedData);
      return res.json();
    },
    onSuccess: async (zone: DeliveryZone) => {
      let assignmentError: Error | null = null;
      if (isPickupStationPage) {
        try {
          await syncPickupAgentAssignments(zone.id);
        } catch (error) {
          assignmentError = error as Error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", "pickup_agent", "station-assignment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      toast({
        title: isPickupStationPage ? "Pickup station created" : "Delivery zone created",
        description: assignmentError
          ? `Pickup station saved, but pickup-agent assignment could not be completed: ${assignmentError.message}`
          : isPickupStationPage
            ? "New pickup station has been added successfully and pickup agents were updated."
            : "New delivery zone has been added successfully.",
        variant: assignmentError ? "destructive" : "default",
      });
      handleDialogOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: isPickupStationPage ? "Failed to create pickup station" : "Failed to create zone",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ZoneFormData }) => {
      const normalizedData = normalizeZonePayload(data);
      const res = await apiRequest("PATCH", `/api/delivery-zones/${id}`, normalizedData);
      return res.json();
    },
    onSuccess: async (zone: DeliveryZone) => {
      let assignmentError: Error | null = null;
      if (isPickupStationPage) {
        try {
          await syncPickupAgentAssignments(zone.id);
        } catch (error) {
          assignmentError = error as Error;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", "pickup_agent", "station-assignment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      toast({
        title: isPickupStationPage ? "Pickup station updated" : "Delivery zone updated",
        description: assignmentError
          ? `Pickup station saved, but pickup-agent assignment could not be completed: ${assignmentError.message}`
          : isPickupStationPage
            ? "Pickup station has been updated successfully and pickup agents were updated."
            : "Delivery zone has been updated successfully.",
        variant: assignmentError ? "destructive" : "default",
      });
      handleDialogOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: isPickupStationPage ? "Failed to update pickup station" : "Failed to update zone",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteZoneMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/delivery-zones/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pickup-stations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", "pickup_agent", "station-assignment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      toast({
        title: isPickupStationPage ? "Pickup station deleted" : "Delivery zone deleted",
        description: isPickupStationPage
          ? "Pickup station has been removed successfully."
          : "Delivery zone has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: isPickupStationPage ? "Failed to delete pickup station" : "Failed to delete zone",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ZoneFormData) => {
    if (!isPickupStationPage) {
      const feeValue = parseFloat(String(data.fee || "0"));
      if (Number.isNaN(feeValue) || feeValue < 0) {
        form.setError("fee", { type: "manual", message: "Fee must be a positive number" });
        return;
      }
    }

    if (editingZone) {
      updateZoneMutation.mutate({ id: editingZone.id, data });
    } else {
      createZoneMutation.mutate(data);
    }
  };

  const openEditDialog = (zone: DeliveryZone) => {
    setEditingZone(zone);
    setHasInitializedAgentSelection(false);
    form.reset({
      name: zone.name,
      type: (zone.type as "city" | "region") || "city",
      city: zone.city || "",
      region: zone.region || "",
      fee: zone.fee,
      isActive: zone.isActive,
    });
    setSelectedPickupAgentIds([]);
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingZone(null);
    setHasInitializedAgentSelection(true);
    form.reset({
      name: "",
      type: "city",
      city: "",
      region: "",
      fee: "0",
      isActive: true,
    });
    setSelectedPickupAgentIds([]);
    setIsDialogOpen(true);
  };

  useEffect(() => {
    if (!isDialogOpen || !editingZone || !isPickupStationPage || hasInitializedAgentSelection) return;
    setSelectedPickupAgentIds(
      pickupAgents
        .filter((agent) => String(agent.deliveryZoneId || "").trim() === String(editingZone.id))
        .map((agent) => agent.id),
    );
    setHasInitializedAgentSelection(true);
  }, [
    editingZone,
    hasInitializedAgentSelection,
    isDialogOpen,
    pickupAgents,
    isPickupStationPage,
  ]);

  const togglePickupAgentSelection = (agentId: string) => {
    setSelectedPickupAgentIds((current) =>
      current.includes(agentId) ? current.filter((id) => id !== agentId) : [...current, agentId],
    );
  };

  const getAssignedPickupAgents = (zoneId: string) =>
    pickupAgents.filter((agent) => String(agent.deliveryZoneId || "").trim() === String(zoneId));

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingZone(null);
      setSelectedPickupAgentIds([]);
      setHasInitializedAgentSelection(false);
    }
  };

  if (authLoading || isLoading || !isAuthenticated || !isAdminViewer) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-delivery-zones">
              <MapPin className="h-8 w-8" />
              {pageTitle}
            </h1>
            <p className="text-muted-foreground mt-2">
              {pageDescription}
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} data-testid="button-add-zone">
                <Plus className="h-4 w-4 mr-2" />
                {isPickupStationPage ? "Add Pickup Station" : "Add Zone"}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <form onSubmit={form.handleSubmit(handleSubmit)}>
                <DialogHeader>
                  <DialogTitle>
                    {editingZone
                      ? isPickupStationPage ? "Edit Pickup Station" : "Edit Delivery Zone"
                      : isPickupStationPage ? "Add Pickup Station" : "Add Delivery Zone"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingZone 
                      ? isPickupStationPage ? "Update the pickup station details" : "Update the delivery zone details"
                      : isPickupStationPage ? "Create a new pickup station and assign pickup agents" : "Create a new delivery zone with pricing"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">{isPickupStationPage ? "Pickup Station Name" : "Zone Name"}</Label>
                    <Input
                      id="name"
                      {...form.register("name")}
                        placeholder={isPickupStationPage ? "e.g., Osu Pickup Station" : "e.g., Accra Central, Tema, Kumasi"}
                      data-testid="input-zone-name"
                    />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">
                        {form.formState.errors.name.message}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="type">{isPickupStationPage ? "Station Type" : "Zone Type"}</Label>
                      <Select
                        value={form.watch("type")}
                        onValueChange={(value) => form.setValue("type", value as "city" | "region")}
                      >
                        <SelectTrigger data-testid="select-zone-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="city">City</SelectItem>
                          <SelectItem value="region">Region</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="city">City</Label>
                      <Input
                        id="city"
                        {...form.register("city")}
                        placeholder="Accra"
                        data-testid="input-zone-city"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="region">Region</Label>
                      {isPickupStationPage ? (
                        <Select
                          value={form.watch("region") || "__none__"}
                          onValueChange={(value) => form.setValue("region", value === "__none__" ? "" : value, { shouldDirty: true })}
                        >
                          <SelectTrigger id="region" data-testid="select-pickup-station-region">
                            <SelectValue placeholder="Select Ghana region" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select region</SelectItem>
                            {GHANA_REGIONS.map((region) => (
                              <SelectItem key={region} value={region}>
                                {region}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Input
                          id="region"
                          {...form.register("region")}
                          placeholder="Greater Accra"
                          data-testid="input-zone-region"
                        />
                      )}
                    </div>
                  </div>

                  {!isPickupStationPage ? (
                    <div className="space-y-2">
                      <Label htmlFor="fee">Delivery Fee ({currency})</Label>
                      <Input
                        id="fee"
                        type="number"
                        step="0.01"
                        {...form.register("fee")}
                        placeholder="0.00"
                        data-testid="input-zone-fee"
                      />
                      {form.formState.errors.fee && (
                        <p className="text-sm text-destructive">
                          {form.formState.errors.fee.message}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 rounded-xl border border-border/70 bg-muted/20 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Label className="text-base">Assign Pickup Agents</Label>
                          <p className="text-sm text-muted-foreground">
                            Choose the pickup agents who should handle orders routed to this station.
                          </p>
                        </div>
                        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                          {selectedPickupAgentIds.length} selected
                        </Badge>
                      </div>

                      {pickupAgentsLoading ? (
                        <div className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Loading pickup agents...
                        </div>
                      ) : pickupAgents.length === 0 ? (
                        <div className="rounded-lg border border-dashed border-border/70 px-4 py-3 text-sm text-muted-foreground">
                          No pickup agents found yet. Create pickup-agent accounts first, then assign them here.
                        </div>
                      ) : (
                        <div className="grid gap-3 md:grid-cols-2">
                          {pickupAgents.map((agent) => {
                            const isSelected = selectedPickupAgentIds.includes(agent.id);
                            const currentStationName = zones.find(
                              (zone) => String(zone.id) === String(agent.deliveryZoneId || ""),
                            )?.name;

                            return (
                              <button
                                key={agent.id}
                                type="button"
                                onClick={() => togglePickupAgentSelection(agent.id)}
                                className={`rounded-xl border p-4 text-left transition ${
                                  isSelected
                                    ? "border-primary/50 bg-primary/10 shadow-sm"
                                    : "border-border/70 bg-card hover:border-primary/30 hover:bg-muted/30"
                                }`}
                                data-testid={`pickup-agent-option-${agent.id}`}
                              >
                                <div className="flex items-start gap-3">
                                  <Checkbox checked={isSelected} className="mt-1 pointer-events-none" />
                                  <div className="min-w-0 flex-1 space-y-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-foreground">{agent.name}</p>
                                      <Badge variant={agent.isActive ? "default" : "secondary"}>
                                        {agent.isActive ? "Active" : "Inactive"}
                                      </Badge>
                                    </div>
                                    <div className="space-y-1 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-2">
                                        <Mail className="h-3.5 w-3.5" />
                                        <span className="truncate">{agent.email}</span>
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Phone className="h-3.5 w-3.5" />
                                        <span>{agent.phone || "No phone"}</span>
                                      </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                      {currentStationName
                                        ? `Currently assigned to: ${currentStationName}`
                                        : "Currently unassigned"}
                                    </p>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Active</Label>
                      <p className="text-sm text-muted-foreground">
                         {isPickupStationPage ? "Make this pickup station available for orders" : "Make this zone available for orders"}
                      </p>
                    </div>
                    <Switch
                      id="isActive"
                      checked={form.watch("isActive")}
                      onCheckedChange={(checked) => form.setValue("isActive", checked)}
                      data-testid="switch-zone-active"
                    />
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                      onClick={() => handleDialogOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={createZoneMutation.isPending || updateZoneMutation.isPending}
                    data-testid="button-save-zone"
                  >
                    {createZoneMutation.isPending || updateZoneMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                       editingZone
                         ? isPickupStationPage ? "Update Pickup Station" : "Update Zone"
                         : isPickupStationPage ? "Create Pickup Station" : "Create Zone"
                     )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{isPickupStationPage ? "All Pickup Stations" : "All Delivery Zones"}</CardTitle>
            <CardDescription>
              {zones.length} {entityLabel}{zones.length !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
                {zones.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No {entityLabelPlural}</h3>
                <p className="text-muted-foreground mb-4">
                  {isPickupStationPage
                    ? "Add your first pickup station to start assigning pickup agents and routing pickup orders"
                    : "Add your first delivery zone to start managing delivery fees"}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                      <TableHead>{isPickupStationPage ? "Pickup Station" : "Zone Name"}</TableHead>
                      <TableHead>{isPickupStationPage ? "Station Type" : "Type"}</TableHead>
                      <TableHead>City/Region</TableHead>
                      {!isPickupStationPage ? (
                        <TableHead>Delivery Fee</TableHead>
                      ) : (
                        <TableHead>Assigned Pickup Agents</TableHead>
                      )}
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {zones.map((zone) => (
                    <TableRow key={zone.id} data-testid={`row-zone-${zone.id}`}>
                      <TableCell className="font-medium">{zone.name}</TableCell>
                      <TableCell className="capitalize">{zone.type || "city"}</TableCell>
                      <TableCell>{zone.city || zone.region || "-"}</TableCell>
                      {!isPickupStationPage ? (
                        <TableCell>{formatPrice(parseFloat(zone.fee || "0"))}</TableCell>
                      ) : (
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            {getAssignedPickupAgents(zone.id).length > 0 ? (
                              getAssignedPickupAgents(zone.id).map((agent) => (
                                <Badge
                                  key={agent.id}
                                  variant="outline"
                                  className="border-primary/30 bg-primary/10 text-primary"
                                >
                                  <Users className="mr-1 h-3 w-3" />
                                  {agent.name}
                                </Badge>
                              ))
                            ) : (
                              <span className="text-sm text-muted-foreground">No agents assigned</span>
                            )}
                          </div>
                        </TableCell>
                      )}
                      <TableCell>
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            zone.isActive
                              ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                              : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                          }`}
                        >
                          {zone.isActive ? "Active" : "Inactive"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditDialog(zone)}
                          data-testid={`button-edit-${zone.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (confirm(`Delete ${isPickupStationPage ? "pickup station" : "delivery zone"} "${zone.name}"?`)) {
                              deleteZoneMutation.mutate(zone.id);
                            }
                          }}
                          data-testid={`button-delete-${zone.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function AdminDeliveryZones() {
  return <AdminDeliveryZonesPage entityKind="delivery_zone" />;
}
