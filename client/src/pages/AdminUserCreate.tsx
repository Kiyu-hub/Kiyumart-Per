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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { ArrowLeft, Loader2 } from "lucide-react";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";
import { getRoleDisplayName } from "@/lib/roleLabels";

const STORE_TYPES = [
  { value: "clothing", label: "Clothing & Fashion" },
  { value: "electronics", label: "Electronics" },
  { value: "food_beverages", label: "Food & Beverages" },
  { value: "beauty_cosmetics", label: "Beauty & Cosmetics" },
  { value: "home_garden", label: "Home & Garden" },
  { value: "sports_fitness", label: "Sports & Fitness" },
  { value: "books_media", label: "Books & Media" },
  { value: "toys_games", label: "Toys & Games" },
  { value: "automotive", label: "Automotive" },
  { value: "health_wellness", label: "Health & Wellness" },
];

const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional().or(z.literal("")),
  role: z.enum(["buyer", "seller", "rider", "pickup_agent", "agent", "admin"]),
  // Shared KYC fields for seller/rider admin setup
  nationalIdCard: z.string().optional(),
  businessAddress: z.string().optional(),
  // Seller-specific fields
  storeType: z.enum(["clothing", "electronics", "food_beverages", "beauty_cosmetics", "home_garden", "sports_fitness", "books_media", "toys_games", "automotive", "health_wellness"]).optional(),
  // Rider-specific fields
  vehicleType: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehiclePlateNumber: z.string().optional(),
  vehicleLicense: z.string().optional(),
  riderCity: z.string().optional(),
  riderRegion: z.string().optional(),
  deliveryZoneId: z.string().optional(),
}).refine((data) => {
  if (data.role === "seller") {
    return data.nationalIdCard?.trim() && data.businessAddress?.trim() && data.storeType;
  }
  return true;
}, {
  message: "Ghana card number, business address, and store type are required for sellers",
  path: ["nationalIdCard"],
}).refine((data) => {
  if (data.role === "rider") {
    return data.nationalIdCard?.trim() && data.businessAddress?.trim() && data.vehicleType && data.vehicleColor && data.riderCity?.trim() && data.riderRegion?.trim();
  }
  return true;
}, {
  message: "Ghana card number, address, city, region, vehicle type and color are required for riders",
  path: ["vehicleType"],
}).refine((data) => {
  if (data.role === "pickup_agent") {
    return Boolean(data.phone?.trim());
  }
  return true;
}, {
  message: "Phone number is required for pickup agents",
  path: ["phone"],
}).refine((data) => {
  if (data.role === "pickup_agent") {
    return Boolean(data.businessAddress?.trim() && data.deliveryZoneId?.trim());
  }
  return true;
}, {
  message: "Pickup agents require a location and an assigned pickup station",
  path: ["deliveryZoneId"],
}).superRefine((data, ctx) => {
  if (data.role !== "rider") return;
  if ((data.vehicleType === "car" || data.vehicleType === "motorcycle") && !data.vehiclePlateNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehiclePlateNumber"],
      message: "Plate number is required for motorized riders",
    });
  }
  if ((data.vehicleType === "car" || data.vehicleType === "motorcycle") && !data.vehicleLicense?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehicleLicense"],
      message: "Driver's license is required for motorized riders",
    });
  }
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export default function AdminUserCreate() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const { isExternalRiderSystemEnabled } = usePlatformSettings();
  const showInternalRiderFeatures = !isExternalRiderSystemEnabled;

  const params = new URLSearchParams(window.location.search);
  const defaultRole = params.get("role") as any || "buyer";

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      role: defaultRole,
      nationalIdCard: "",
      businessAddress: "",
      storeType: undefined,
      vehicleType: "",
      vehicleColor: "",
      vehiclePlateNumber: "",
      vehicleLicense: "",
      riderCity: "",
      riderRegion: "",
      deliveryZoneId: "",
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

  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      return apiRequest("POST", "/api/users", data);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "User created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      navigate("/admin/users");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateUserFormData) => {
    if (!showInternalRiderFeatures && data.role === "rider") {
      toast({
        title: "Rider creation disabled",
        description: "The external rider system is enabled.",
        variant: "destructive",
      });
      return;
    }
    createUserMutation.mutate(data);
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
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
            <h1 className="text-3xl font-bold text-foreground" data-testid="heading-create-user">
              Create New User
            </h1>
            <p className="text-muted-foreground mt-1">Add a new user to the platform</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>User Information</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                        <Input type="email" placeholder="john@example.com" {...field} data-testid="input-email" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} data-testid="input-password" />
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
                      <FormLabel>Phone {selectedRole === "pickup_agent" ? <span className="text-destructive">*</span> : "(Optional)"}</FormLabel>
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
                          <SelectTrigger data-testid="select-role-trigger">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent data-testid="select-role-content">
                          <SelectItem value="buyer" data-testid="select-role-option-buyer">Buyer</SelectItem>
                          <SelectItem value="seller" data-testid="select-role-option-seller">Seller</SelectItem>
                          {showInternalRiderFeatures ? <SelectItem value="rider" data-testid="select-role-option-rider">Rider</SelectItem> : null}
                          <SelectItem value="pickup_agent" data-testid="select-role-option-pickup-agent">Pickup Agent</SelectItem>
                          <SelectItem value="agent" data-testid="select-role-option-agent">Customer Agent</SelectItem>
                          <SelectItem value="admin" data-testid="select-role-option-admin">Admin</SelectItem>
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
                            {selectedRole !== "pickup_agent" ? <span className="text-destructive">*</span> : null}
                          </FormLabel>
                          <FormControl>
                            <Input placeholder="GHA-XXXXXXXXX-X" {...field} data-testid="input-national-id-card" />
                          </FormControl>
                          {selectedRole === "pickup_agent" ? (
                            <FormDescription>
                              Optional for {getRoleDisplayName(selectedRole).toLowerCase()} records.
                            </FormDescription>
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
                            <FormLabel>{selectedRole === "pickup_agent" ? "Pickup Location / Address" : "Business Address / Location"} <span className="text-destructive">*</span></FormLabel>
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

                {/* Seller-specific fields */}
                {selectedRole === "seller" && (
                  <>
                    <FormField
                      control={form.control}
                      name="storeType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Type / Category <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-store-type-trigger">
                                <SelectValue placeholder="Select store type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent data-testid="select-store-type-content">
                              {STORE_TYPES.map((type) => (
                                <SelectItem key={type.value} value={type.value} data-testid={`select-store-type-${type.value}`}>
                                  {type.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            This determines which product categories will be available for this seller
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <p className="text-sm text-muted-foreground">
                      Store name, description, and banner are completed by the seller on their profile before full access.
                    </p>
                  </>
                )}

                {/* Rider-specific fields */}
                {showInternalRiderFeatures && selectedRole === "rider" && (
                  <>
                    <FormField
                      control={form.control}
                      name="riderCity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City <span className="text-destructive">*</span></FormLabel>
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
                          <FormLabel>Region <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="Greater Accra" {...field} data-testid="input-rider-region" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehicleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Type <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid="select-vehicle-type-trigger">
                                <SelectValue placeholder="Select vehicle type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent data-testid="select-vehicle-type-content">
                              <SelectItem value="bicycle">Bicycle</SelectItem>
                              <SelectItem value="motorcycle">Motorcycle</SelectItem>
                              <SelectItem value="car">Car</SelectItem>
                              <SelectItem value="van">Van</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="vehicleColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Color <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Red, Blue, Black" {...field} data-testid="input-vehicle-color" />
                          </FormControl>
                          <FormDescription>
                            Required for all vehicle types
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {selectedVehicleType && selectedVehicleType !== "bicycle" && (
                      <FormField
                        control={form.control}
                        name="vehiclePlateNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Plate Number</FormLabel>
                            <FormControl>
                              <Input placeholder="GR-1234-20" {...field} data-testid="input-plate-number" />
                            </FormControl>
                            <FormDescription>
                              Required for motorized vehicles
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {selectedVehicleType && selectedVehicleType !== "bicycle" && (
                      <FormField
                        control={form.control}
                        name="vehicleLicense"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Driver's License <span className="text-destructive">*</span></FormLabel>
                            <FormControl>
                              <Input placeholder="DL-123456" {...field} data-testid="input-vehicle-license" />
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
                        <FormLabel>Pickup Station <span className="text-destructive">*</span></FormLabel>
                        <Select
                          onValueChange={(value) => field.onChange(value === "__none__" ? "" : value)}
                          value={field.value || "__none__"}
                        >
                          <FormControl>
                            <SelectTrigger data-testid="select-pickup-agent-zone-create">
                              <SelectValue placeholder="Assign pickup station" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="__none__">Select a pickup station</SelectItem>
                            {deliveryZones.map((zone) => (
                              <SelectItem key={zone.id} value={zone.id}>
                                {zone.name} ({zone.city || zone.region || "N/A"})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Pickup agents receive pickup-order alerts and verification access for the zone assigned here.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="flex gap-4 pt-4">
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
                    disabled={createUserMutation.isPending}
                    data-testid="button-submit"
                  >
                    {createUserMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create User
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

