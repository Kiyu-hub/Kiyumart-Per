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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Loader2, Plus, Edit, Trash2, MapPin } from "lucide-react";

const zoneSchema = z.object({
  name: z.string().min(1, "Zone name is required"),
  type: z.enum(["city", "region"]).default("city"),
  city: z.string().optional(),
  region: z.string().optional(),
  fee: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, {
    message: "Fee must be a positive number",
  }),
  isActive: z.boolean(),
});

type ZoneFormData = z.infer<typeof zoneSchema>;

interface DeliveryZone {
  id: string;
  name: string;
  type?: "city" | "region";
  city?: string | null;
  region?: string | null;
  fee: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminDeliveryZones() {
  const { toast } = useToast();
  const { formatPrice, currency } = useLanguage();
  const socket = useSocket();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const normalizedRole = (() => {
    const raw = String(user?.role || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    return raw === "superadmin" ? "super_admin" : raw;
  })();
  const isAdminViewer = normalizedRole === "admin" || normalizedRole === "super_admin";

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || !isAdminViewer)) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, isAdminViewer, navigate]);

  const { data: zones = [], isLoading } = useQuery<DeliveryZone[]>({
    queryKey: ["/api/admin/delivery-zones"],
    queryFn: async () => {
      const res = await fetch("/api/admin/delivery-zones", { credentials: "include", cache: "no-store" });
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

  useEffect(() => {
    if (!socket) return;
    const handleZonesUpdate = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
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

  const createZoneMutation = useMutation({
    mutationFn: async (data: ZoneFormData) => {
      const res = await apiRequest("POST", "/api/delivery-zones", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      toast({
        title: "Delivery zone created",
        description: "New delivery zone has been added successfully.",
      });
      setIsDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create zone",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateZoneMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ZoneFormData }) => {
      const res = await apiRequest("PATCH", `/api/delivery-zones/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      toast({
        title: "Delivery zone updated",
        description: "Delivery zone has been updated successfully.",
      });
      setIsDialogOpen(false);
      setEditingZone(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update zone",
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
      queryClient.invalidateQueries({ queryKey: ["/api/delivery-zones"] });
      queryClient.invalidateQueries({ queryKey: ["/api/riders/available"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/available-riders"] });
      toast({
        title: "Delivery zone deleted",
        description: "Delivery zone has been removed successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete zone",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ZoneFormData) => {
    if (editingZone) {
      updateZoneMutation.mutate({ id: editingZone.id, data });
    } else {
      createZoneMutation.mutate(data);
    }
  };

  const openEditDialog = (zone: DeliveryZone) => {
    setEditingZone(zone);
    form.reset({
      name: zone.name,
      type: (zone.type as "city" | "region") || "city",
      city: zone.city || "",
      region: zone.region || "",
      fee: zone.fee,
      isActive: zone.isActive,
    });
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingZone(null);
    form.reset({
      name: "",
      type: "city",
      city: "",
      region: "",
      fee: "0",
      isActive: true,
    });
    setIsDialogOpen(true);
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
              Delivery Zones & Pricing
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage delivery zones and their associated fees
            </p>
          </div>
          
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreateDialog} data-testid="button-add-zone">
                <Plus className="h-4 w-4 mr-2" />
                Add Zone
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={form.handleSubmit(handleSubmit)}>
                <DialogHeader>
                  <DialogTitle>
                    {editingZone ? "Edit Delivery Zone" : "Add Delivery Zone"}
                  </DialogTitle>
                  <DialogDescription>
                    {editingZone 
                      ? "Update the delivery zone details" 
                      : "Create a new delivery zone with pricing"}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Zone Name</Label>
                    <Input
                      id="name"
                      {...form.register("name")}
                      placeholder="e.g., Accra Central, Tema, Kumasi"
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
                      <Label htmlFor="type">Zone Type</Label>
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
                      <Input
                        id="region"
                        {...form.register("region")}
                        placeholder="Greater Accra"
                        data-testid="input-zone-region"
                      />
                    </div>
                  </div>

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

                  <div className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="space-y-0.5">
                      <Label htmlFor="isActive">Active</Label>
                      <p className="text-sm text-muted-foreground">
                        Make this zone available for orders
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
                    onClick={() => setIsDialogOpen(false)}
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
                      editingZone ? "Update Zone" : "Create Zone"
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Delivery Zones</CardTitle>
            <CardDescription>
              {zones.length} zone{zones.length !== 1 ? "s" : ""} configured
            </CardDescription>
          </CardHeader>
          <CardContent>
            {zones.length === 0 ? (
              <div className="text-center py-12">
                <MapPin className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No delivery zones</h3>
                <p className="text-muted-foreground mb-4">
                  Add your first delivery zone to start managing delivery fees
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Zone Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>City/Region</TableHead>
                    <TableHead>Delivery Fee</TableHead>
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
                      <TableCell>{formatPrice(parseFloat(zone.fee))}</TableCell>
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
                            if (confirm(`Delete delivery zone "${zone.name}"?`)) {
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
