import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import DashboardSidebar from "@/components/DashboardSidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { ArrowLeft, Loader2 } from "lucide-react";
import MediaUploadInput from "@/components/MediaUploadInput";

interface RiderUser {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  vehicleInfo: {
    type: string;
    plateNumber: string;
    license: string;
    color?: string;
  } | null;
  nationalIdCard: string | null;
  businessAddress?: string | null;
  riderCity?: string | null;
  riderRegion?: string | null;
  profileImage?: string | null;
  ghanaCardFront?: string | null;
  ghanaCardBack?: string | null;
}

const normalizeVehicleInfo = (
  value: RiderUser["vehicleInfo"] | string | null | undefined,
): RiderUser["vehicleInfo"] => {
  if (!value) return null;
  if (typeof value === "object") return value as RiderUser["vehicleInfo"];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as RiderUser["vehicleInfo"];
      }
    } catch {
      return null;
    }
  }
  return null;
};

const editRiderSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  vehicleType: z.string().min(1, "Vehicle type is required"),
  vehicleNumber: z.string().min(1, "Vehicle number is required"),
  vehicleColor: z.string().optional(),
  licenseNumber: z.string().min(1, "License number is required"),
  nationalIdCard: z.string().min(5, "National ID card must be at least 5 characters"),
  businessAddress: z.string().min(5, "Address is required"),
  riderCity: z.string().min(2, "City is required"),
  riderRegion: z.string().min(2, "Region is required"),
  profileImage: z.string().optional(),
  ghanaCardFront: z.string().optional(),
  ghanaCardBack: z.string().optional(),
});

type EditRiderFormData = z.infer<typeof editRiderSchema>;

export default function RiderEdit() {
  const [activeItem, setActiveItem] = useState("riders");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const riderId = window.location.pathname.split("/")[3];

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: riderData, isLoading: riderLoading} = useQuery<RiderUser>({
    queryKey: ["/api/users", riderId],
    queryFn: async () => {
      const res = await fetch(`/api/users/${riderId}`, { credentials: "include" });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load rider");
      }
      return res.json();
    },
    enabled: !!riderId && isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const form = useForm<EditRiderFormData>({
    resolver: zodResolver(editRiderSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      vehicleType: "",
      vehicleNumber: "",
      vehicleColor: "",
      licenseNumber: "",
      nationalIdCard: "",
      businessAddress: "",
      riderCity: "",
      riderRegion: "",
      profileImage: "",
      ghanaCardFront: "",
      ghanaCardBack: "",
    },
  });

  useEffect(() => {
    if (riderData) {
      const vehicleInfo = normalizeVehicleInfo(riderData.vehicleInfo as any);
      form.reset({
        name: riderData.name,
        email: riderData.email,
        phone: riderData.phone || "",
        vehicleType: vehicleInfo?.type || "",
        vehicleNumber: vehicleInfo?.plateNumber || "",
        vehicleColor: vehicleInfo?.color || "",
        licenseNumber: vehicleInfo?.license || "",
        nationalIdCard: riderData.nationalIdCard || "",
        businessAddress: riderData.businessAddress || "",
        riderCity: riderData.riderCity || "",
        riderRegion: riderData.riderRegion || "",
        profileImage: riderData.profileImage || "",
        ghanaCardFront: riderData.ghanaCardFront || "",
        ghanaCardBack: riderData.ghanaCardBack || "",
      });
    }
  }, [riderData, form]);

  const updateRiderMutation = useMutation({
    mutationFn: async (data: EditRiderFormData) => {
      const updateData = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        vehicleInfo: {
          type: data.vehicleType,
          plateNumber: data.vehicleNumber,
          license: data.licenseNumber,
          color: data.vehicleColor || undefined,
        },
        nationalIdCard: data.nationalIdCard,
        businessAddress: data.businessAddress,
        riderCity: data.riderCity,
        riderRegion: data.riderRegion,
        profileImage: data.profileImage || null,
        ghanaCardFront: data.ghanaCardFront || null,
        ghanaCardBack: data.ghanaCardBack || null,
      };
      return apiRequest("PATCH", `/api/users/${riderId}`, updateData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Rider updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users", "rider"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users", riderId] });
      navigate("/admin/riders");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update rider",
        variant: "destructive",
      });
    },
  });

  const handleItemClick = (id: string) => {
    navigate(
      id === "dashboard" ? "/admin" :
      id === "store" ? "/admin/store" :
      id === "branding" ? "/admin/branding" :
      id === "categories" ? "/admin/categories" :
      id === "products" ? "/admin/products" :
      id === "orders" ? "/admin/orders" :
      id === "users" ? "/admin/users" :
      id === "sellers" ? "/admin/sellers" :
      id === "riders" ? "/admin/riders" :
      id === "zones" ? "/admin/zones" :
      id === "messages" ? "/admin/messages" :
      id === "analytics" ? "/admin/analytics" :
      id === "settings" ? "/admin/settings" :
      "/admin"
    );
  };

  const onSubmit = (data: EditRiderFormData) => {
    updateRiderMutation.mutate(data);
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (riderLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <DashboardSidebar
        role="admin"
        activeItem={activeItem}
        onItemClick={handleItemClick}
        userName={user?.name || "Admin"}
      />
      
      <div className="flex-1 overflow-auto">
        <div className="p-8">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/admin/riders")}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-edit-rider">
                Edit Rider
              </h1>
              <p className="text-muted-foreground mt-1">Update rider information and vehicle details</p>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
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
                          <Input type="email" placeholder="rider@example.com" {...field} data-testid="input-email" />
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
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="+233 XX XXX XXXX" {...field} data-testid="input-phone" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="nationalIdCard"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>National ID Card</FormLabel>
                        <FormControl>
                          <Input placeholder="GHA-123456789-0" {...field} data-testid="input-national-id" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                      )}
                    />

                  <FormField
                    control={form.control}
                    name="businessAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address</FormLabel>
                        <FormControl>
                          <Input placeholder="123 Main St, Accra" {...field} data-testid="input-business-address" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  </div>

                  <FormField
                    control={form.control}
                    name="profileImage"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Profile Image</FormLabel>
                        <FormControl>
                          <MediaUploadInput
                            id="edit-rider-profile-image"
                            label=""
                            value={field.value || ""}
                            onChange={field.onChange}
                            accept="image"
                            placeholder="Upload or enter profile image URL..."
                            description="Profile image shown in rider cards and profile views"
                            skip4KValidation
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="ghanaCardFront"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ghana Card Front</FormLabel>
                          <FormControl>
                            <MediaUploadInput
                              id="edit-rider-ghana-front"
                              label=""
                              value={field.value || ""}
                              onChange={field.onChange}
                              accept="image"
                              placeholder="Upload or enter front image URL..."
                              description="Front side of Ghana card verification"
                              skip4KValidation
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ghanaCardBack"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ghana Card Back</FormLabel>
                          <FormControl>
                            <MediaUploadInput
                              id="edit-rider-ghana-back"
                              label=""
                              value={field.value || ""}
                              onChange={field.onChange}
                              accept="image"
                              placeholder="Upload or enter back image URL..."
                              description="Back side of Ghana card verification"
                              skip4KValidation
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Vehicle Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <FormField
                    control={form.control}
                    name="vehicleType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-vehicle-type">
                              <SelectValue placeholder="Select vehicle type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="motorcycle">Motorcycle</SelectItem>
                            <SelectItem value="bicycle">Bicycle</SelectItem>
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
                    name="vehicleNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Number</FormLabel>
                        <FormControl>
                          <Input placeholder="GR-1234-23" {...field} data-testid="input-vehicle-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="vehicleColor"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Vehicle Color</FormLabel>
                        <FormControl>
                          <Input placeholder="Red, Blue, Black..." {...field} data-testid="input-vehicle-color" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="licenseNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>License Number</FormLabel>
                        <FormControl>
                          <Input placeholder="DL-123456" {...field} data-testid="input-license-number" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin/riders")}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updateRiderMutation.isPending}
                  data-testid="button-submit"
                >
                  {updateRiderMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Update Rider
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
