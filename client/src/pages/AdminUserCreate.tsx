import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
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
import { ArrowLeft, Loader2, Upload } from "lucide-react";
import MediaUploadInput from "@/components/MediaUploadInput";

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
  phone: z.string().optional(),
  role: z.enum(["buyer", "seller", "rider", "agent", "admin"]),
  // Seller-specific fields
  storeName: z.string().optional(),
  storeDescription: z.string().optional(),
  storeType: z.enum(["clothing", "electronics", "food_beverages", "beauty_cosmetics", "home_garden", "sports_fitness", "books_media", "toys_games", "automotive", "health_wellness"]).optional(),
  storeBanner: z.string().optional(),
  // Rider-specific fields
  vehicleType: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehiclePlateNumber: z.string().optional(),
}).refine((data) => {
  if (data.role === "seller") {
    return data.storeName && data.storeType && data.storeName.length >= 2;
  }
  return true;
}, {
  message: "Store name and store type are required for sellers",
  path: ["storeName"],
}).refine((data) => {
  if (data.role === "rider") {
    return data.vehicleType && data.vehicleColor;
  }
  return true;
}, {
  message: "Vehicle type and color are required for riders",
  path: ["vehicleType"],
});

type CreateUserFormData = z.infer<typeof createUserSchema>;

export default function AdminUserCreate() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const params = new URLSearchParams(window.location.search);
  const defaultRole = params.get("role") as any || "buyer";

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const [storeBannerUrl, setStoreBannerUrl] = useState<string>("");

  const form = useForm<CreateUserFormData>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      role: defaultRole,
      storeName: "",
      storeDescription: "",
      storeType: undefined,
      storeBanner: "",
      vehicleType: "",
      vehicleColor: "",
      vehiclePlateNumber: "",
    },
  });

  const selectedRole = form.watch("role");
  const selectedVehicleType = form.watch("vehicleType");

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
                          <SelectTrigger data-testid="select-role-trigger">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent data-testid="select-role-content">
                          <SelectItem value="buyer" data-testid="select-role-option-buyer">Buyer</SelectItem>
                          <SelectItem value="seller" data-testid="select-role-option-seller">Seller</SelectItem>
                          <SelectItem value="rider" data-testid="select-role-option-rider">Rider</SelectItem>
                          <SelectItem value="agent" data-testid="select-role-option-agent">Agent</SelectItem>
                          <SelectItem value="admin" data-testid="select-role-option-admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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

                    <FormField
                      control={form.control}
                      name="storeName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Name <span className="text-destructive">*</span></FormLabel>
                          <FormControl>
                            <Input placeholder="My Store" {...field} data-testid="input-store-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="storeDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Describe your store..." 
                              {...field} 
                              rows={3}
                              data-testid="input-store-description" 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="storeBanner"
                      render={({ field }) => (
                        <FormItem>
                          <MediaUploadInput
                            id="storeBanner"
                            label="Store Banner Image"
                            value={field.value || ""}
                            onChange={(url) => {
                              field.onChange(url);
                              setStoreBannerUrl(url);
                            }}
                            accept="image"
                            description="Upload a banner image for the store (min 800×200px)"
                            skip4KValidation
                            minDimensions={{ width: 800, height: 200 }}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                {/* Rider-specific fields */}
                {selectedRole === "rider" && (
                  <>
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
                  </>
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
