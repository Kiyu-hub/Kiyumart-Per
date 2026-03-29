import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Loader2 } from "lucide-react";
import { STORE_TYPES, STORE_TYPE_CONFIG } from "@shared/storeTypes";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { getRoleDisplayName } from "@/lib/roleLabels";

interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  nationalIdCard?: string | null;
  businessAddress?: string | null;
  storeType?: string | null;
  riderCity?: string | null;
  riderRegion?: string | null;
  deliveryZoneId?: string | null;
  vehicleInfo?: {
    type: string;
    plateNumber?: string;
    license?: string;
    color?: string;
  } | null;
}

const editUserSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().optional(),
    role: z.enum(["buyer", "seller", "rider", "pickup_agent", "agent", "admin", "super_admin"]),
    nationalIdCard: z.string().optional(),
    businessAddress: z.string().optional(),
    storeType: z.string().optional(),
    riderCity: z.string().optional(),
    riderRegion: z.string().optional(),
    deliveryZoneId: z.string().optional(),
    vehicleType: z.string().optional(),
    vehiclePlateNumber: z.string().optional(),
    vehicleLicense: z.string().optional(),
    vehicleColor: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const requiredForSeller: Array<{ key: keyof typeof data; label: string }> = [
      { key: "nationalIdCard", label: "Ghana Card Number" },
      { key: "businessAddress", label: "Business Address" },
      { key: "storeType", label: "Store Type" },
    ];

    const requiredForRider: Array<{ key: keyof typeof data; label: string }> = [
      { key: "nationalIdCard", label: "Ghana Card Number" },
      { key: "businessAddress", label: "Address / Location" },
      { key: "riderCity", label: "City" },
      { key: "riderRegion", label: "Region" },
      { key: "vehicleType", label: "Vehicle Type" },
    ];

    if (data.role === "seller") {
      requiredForSeller.forEach(({ key, label }) => {
        if (!data[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${label} is required for seller role upgrades`,
          });
        }
      });

      if (data.storeType && !STORE_TYPES.includes(data.storeType as typeof STORE_TYPES[number])) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["storeType"],
          message: "Please select a valid store type",
        });
      }
    }

    if (data.role === "rider") {
      requiredForRider.forEach(({ key, label }) => {
        if (!data[key]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${label} is required for rider role upgrades`,
          });
        }
      });

      if (data.vehicleType === "car") {
        if (!data.vehiclePlateNumber?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["vehiclePlateNumber"],
            message: "Plate number is required for car riders",
          });
        }
        if (!data.vehicleLicense?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["vehicleLicense"],
            message: "Driver's license is required for car riders",
          });
        }
        if (!data.vehicleColor?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["vehicleColor"],
            message: "Vehicle color is required for car riders",
          });
        }
      }

      if (data.vehicleType === "motorcycle") {
        if (!data.vehiclePlateNumber?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["vehiclePlateNumber"],
            message: "Plate number is required for motorcycle riders",
          });
        }
        if (!data.vehicleLicense?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["vehicleLicense"],
            message: "Driver's license is required for motorcycle riders",
          });
        }
      }
    }
  });

type EditUserFormData = z.infer<typeof editUserSchema>;

function trimOrUndefined(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export default function AdminUserEdit() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  const userId = window.location.pathname.split("/")[3];

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: userData, isLoading: userLoading } = useQuery<User>({
    queryKey: ["/api/users", userId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${userId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch user");
      return res.json();
    },
    enabled: !!userId && isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const form = useForm<EditUserFormData>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      role: "buyer",
      nationalIdCard: "",
      businessAddress: "",
      storeType: "",
      riderCity: "",
      riderRegion: "",
      deliveryZoneId: "",
      vehicleType: "",
      vehiclePlateNumber: "",
      vehicleLicense: "",
      vehicleColor: "",
    },
  });

  const selectedRole = form.watch("role");
  const selectedVehicleType = form.watch("vehicleType");
  const { data: deliveryZones = [] } = useQuery<Array<{ id: string; name: string; city?: string | null; region?: string | null }>>({
    queryKey: [selectedRole === "pickup_agent" ? "/api/pickup-stations" : "/api/delivery-zones", selectedRole],
    queryFn: async () => {
      const endpoint = selectedRole === "pickup_agent" ? "/api/pickup-stations" : "/api/delivery-zones";
      const res = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      if (!res.ok) return [];
      const payload = await res.json();
      return Array.isArray(payload) ? payload : [];
    },
    enabled: selectedRole === "pickup_agent" || (showInternalRiderFeatures && selectedRole === "rider"),
  });

  useEffect(() => {
    if (!showInternalRiderFeatures && selectedRole === "rider") {
      form.setValue("role", "buyer");
    }
  }, [form, selectedRole, showInternalRiderFeatures]);

  useEffect(() => {
    if (userData) {
      if (!showInternalRiderFeatures && userData.role === "rider") {
        navigate("/admin/users");
        return;
      }
      form.reset({
        name: userData.name,
        email: userData.email,
        phone: userData.phone || "",
        role: userData.role as any,
        nationalIdCard: userData.nationalIdCard || "",
        businessAddress: userData.businessAddress || "",
        storeType: userData.storeType || "",
        riderCity: userData.riderCity || "",
        riderRegion: userData.riderRegion || "",
        deliveryZoneId: userData.deliveryZoneId || "",
        vehicleType: userData.vehicleInfo?.type || "",
        vehiclePlateNumber: userData.vehicleInfo?.plateNumber || "",
        vehicleLicense: userData.vehicleInfo?.license || "",
        vehicleColor: userData.vehicleInfo?.color || "",
      });
    }
  }, [form, navigate, showInternalRiderFeatures, userData]);

  const updateUserMutation = useMutation({
    mutationFn: async (data: EditUserFormData) => {
      const payload: Record<string, any> = {
        name: data.name.trim(),
        email: data.email.trim(),
        phone: trimOrUndefined(data.phone),
        role: data.role,
        nationalIdCard: trimOrUndefined(data.nationalIdCard),
        businessAddress: trimOrUndefined(data.businessAddress),
      };

      if (data.role === "seller") {
        payload.storeType = trimOrUndefined(data.storeType);
      }

      if (data.role === "rider") {
        payload.riderCity = trimOrUndefined(data.riderCity);
        payload.riderRegion = trimOrUndefined(data.riderRegion);
        payload.deliveryZoneId = trimOrUndefined(data.deliveryZoneId);
        payload.vehicleInfo = {
          type: trimOrUndefined(data.vehicleType),
          plateNumber: trimOrUndefined(data.vehiclePlateNumber),
          license: trimOrUndefined(data.vehicleLicense),
          color: trimOrUndefined(data.vehicleColor),
        };
      }

      if (data.role === "pickup_agent") {
        payload.deliveryZoneId = trimOrUndefined(data.deliveryZoneId);
      }

      return apiRequest("PATCH", `/api/users/${userId}`, payload);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", userId] });
      navigate("/admin/users");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditUserFormData) => {
    if (!showInternalRiderFeatures && data.role === "rider") {
      toast({
        title: "Rider updates disabled",
        description: "The external rider system is enabled.",
        variant: "destructive",
      });
      return;
    }
    updateUserMutation.mutate(data);
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any} showBackButton>
      <div className="p-8">
        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/users")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-edit-user">
              Edit User
            </h1>
              <p className="text-muted-foreground mt-1">
                {showInternalRiderFeatures
                  ? "Update user details and include required KYC metadata for seller/rider role upgrades"
                  : "Update user details and include required KYC metadata for seller role upgrades"}
              </p>
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
            <Card className="max-h-[calc(100vh-220px)] overflow-y-auto">
              <CardHeader>
                <CardTitle>User Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="user@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="+233 XX XXX XXXX" {...field} data-testid="input-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-role">
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="buyer">Buyer</SelectItem>
                          <SelectItem value="seller">Seller</SelectItem>
                          {showInternalRiderFeatures ? <SelectItem value="rider">Rider</SelectItem> : null}
                          <SelectItem value="pickup_agent">Pickup Agent</SelectItem>
                          <SelectItem value="agent">Customer Agent</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          {user?.role === "super_admin" && (
                            <SelectItem value="super_admin">Super Admin</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {(selectedRole === "seller" || selectedRole === "pickup_agent" || (showInternalRiderFeatures && selectedRole === "rider")) && (
                  <>
                    <div className="pt-2 border-t" />
                    <h3 className="text-base font-semibold">
                      {selectedRole === "pickup_agent" ? "Pickup Agent Information" : "Required KYC Information"}
                    </h3>

                    <FormField
                      control={form.control}
                      name="nationalIdCard"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Ghana Card Number
                            {selectedRole !== "pickup_agent" ? " (Required)" : ""}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="GHA-XXXXXXXXX-X" {...field} data-testid="input-national-id-card" />
                          </FormControl>
                          {selectedRole === "pickup_agent" ? (
                            <p className="text-xs text-muted-foreground">
                              Optional for {getRoleDisplayName(selectedRole).toLowerCase()} records.
                            </p>
                          ) : null}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="businessAddress"
                      render={({ field }) => (
                        <FormItem>
                            <FormLabel>{selectedRole === "pickup_agent" ? "Pickup Location / Address" : "Business Address / Location"}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={2}
                              placeholder="Applicant address/location"
                              {...field}
                              data-testid="input-business-address"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {selectedRole === "seller" && (
                  <>
                    <div className="pt-2 border-t" />
                    <h3 className="text-base font-semibold">Seller Store Information</h3>

                    <FormField
                      control={form.control}
                      name="storeType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value || undefined}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-store-type">
                                <SelectValue placeholder="Select store type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {STORE_TYPES.map((type) => (
                                <SelectItem key={type} value={type}>
                                  {STORE_TYPE_CONFIG[type].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {showInternalRiderFeatures && selectedRole === "rider" && (
                  <>
                    <div className="pt-2 border-t" />
                    <h3 className="text-base font-semibold">Rider Vehicle Information</h3>

                    <FormField
                      control={form.control}
                      name="riderCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="Accra" {...field} data-testid="input-rider-city" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="riderRegion"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Region</FormLabel>
                          <FormControl>
                            <Input placeholder="Greater Accra" {...field} data-testid="input-rider-region" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="deliveryZoneId"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Preferred Zone (Optional)</FormLabel>
                          <Select
                            onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                            value={field.value || "__none__"}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-rider-zone">
                                <SelectValue placeholder="Select zone" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="__none__">No explicit zone</SelectItem>
                              {deliveryZones.map((zone) => (
                                <SelectItem key={zone.id} value={zone.id}>
                                  {zone.name} ({zone.city || zone.region || "N/A"})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehicleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl>
                              <SelectTrigger data-testid="select-vehicle-type">
                                <SelectValue placeholder="Select vehicle type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="car">Car</SelectItem>
                              <SelectItem value="motorcycle">Motorcycle</SelectItem>
                              <SelectItem value="bicycle">Bicycle</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehiclePlateNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Plate Number
                            {selectedVehicleType === "car" || selectedVehicleType === "motorcycle" ? " (Required)" : ""}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="GT-1234-20" {...field} data-testid="input-vehicle-plate" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehicleLicense"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Driver's License Number
                            {selectedVehicleType === "car" || selectedVehicleType === "motorcycle" ? " (Required)" : ""}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="License number" {...field} data-testid="input-vehicle-license" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedVehicleType === "car" && (
                      <FormField
                        control={form.control}
                        name="vehicleColor"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Vehicle Color (Required)</FormLabel>
                            <FormControl>
                              <Input placeholder="Vehicle color" {...field} data-testid="input-vehicle-color" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                  </>
                )}

                {selectedRole === "pickup_agent" && (
                  <FormField
                    control={form.control}
                    name="deliveryZoneId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pickup Station</FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-pickup-agent-zone-edit">
                              <SelectValue placeholder="Assign pickup station" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">No zone assigned</SelectItem>
                            {deliveryZones.map((zone) => (
                              <SelectItem key={zone.id} value={zone.id}>
                                {zone.name} ({zone.city || zone.region || "N/A"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </CardContent>
            </Card>

            <div className="flex gap-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/admin/users")}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={updateUserMutation.isPending}
                data-testid="button-submit"
              >
                {updateUserMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Update User
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </DashboardLayout>
  );
}
