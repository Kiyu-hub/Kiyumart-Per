import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Bike, ArrowLeft, AlertCircle } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const becomeRiderSchema = z.discriminatedUnion("vehicleType", [
  z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    profileImage: z.string().min(1, "Profile image is required"),
    ghanaCardFront: z.string().min(1, "Ghana Card front image is required"),
    ghanaCardBack: z.string().min(1, "Ghana Card back image is required"),
    nationalIdCard: z.string().min(10, "Ghana Card number is required"),
    businessAddress: z.string().min(5, "Address/Location is required"),
    riderCity: z.string().min(2, "City is required"),
    riderRegion: z.string().min(2, "Region is required"),
    vehicleType: z.literal("car"),
    vehicleNumber: z.string().min(1, "Plate number is required for cars"),
    licenseNumber: z.string().min(1, "Driver's license is required for cars"),
    vehicleColor: z.string().min(1, "Vehicle color is required for cars"),
  }),
  z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    profileImage: z.string().min(1, "Profile image is required"),
    ghanaCardFront: z.string().min(1, "Ghana Card front image is required"),
    ghanaCardBack: z.string().min(1, "Ghana Card back image is required"),
    nationalIdCard: z.string().min(10, "Ghana Card number is required"),
    businessAddress: z.string().min(5, "Address/Location is required"),
    riderCity: z.string().min(2, "City is required"),
    riderRegion: z.string().min(2, "Region is required"),
    vehicleType: z.literal("motorcycle"),
    vehicleNumber: z.string().min(1, "Plate number is required for motorcycles"),
    licenseNumber: z.string().min(1, "Driver's license is required for motorcycles"),
    vehicleColor: z.string().optional(),
  }),
  z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Invalid email address"),
    phone: z.string().min(10, "Phone number must be at least 10 characters"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    profileImage: z.string().min(1, "Profile image is required"),
    ghanaCardFront: z.string().min(1, "Ghana Card front image is required"),
    ghanaCardBack: z.string().min(1, "Ghana Card back image is required"),
    nationalIdCard: z.string().min(10, "Ghana Card number is required"),
    businessAddress: z.string().min(5, "Address/Location is required"),
    riderCity: z.string().min(2, "City is required"),
    riderRegion: z.string().min(2, "Region is required"),
    vehicleType: z.literal("bicycle"),
    vehicleNumber: z.string().optional(),
    licenseNumber: z.string().optional(),
    vehicleColor: z.string().optional(),
  }),
]);

type BecomeRiderFormData = z.infer<typeof becomeRiderSchema>;

export default function BecomeRiderPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const currentRole = String(user?.role || "").toLowerCase();
  const currentRequestedRole = String((user as any)?.requestedRole || "").toLowerCase();
  const currentApplicationStatus = String((user as any)?.applicationStatus || "").toLowerCase();
  const sameRoleAlreadySubmitted =
    isLoggedIn &&
    ((currentRole === "rider" && (user?.isApproved ?? false)) ||
      ((currentRequestedRole === "rider" || currentRole === "rider") &&
        ["pending", "interview_scheduled", "approved"].includes(currentApplicationStatus)));
  const blockedByOtherRole =
    isLoggedIn &&
    (((currentRole === "seller" && (user?.isApproved ?? false)) ||
      (currentRequestedRole === "seller" &&
        ["pending", "interview_scheduled", "approved"].includes(currentApplicationStatus))));
  const [uploading, setUploading] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>("");
  const [cardFrontPreview, setCardFrontPreview] = useState<string>("");
  const [cardBackPreview, setCardBackPreview] = useState<string>("");

  const form = useForm<BecomeRiderFormData>({
    resolver: zodResolver(becomeRiderSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      profileImage: "",
      ghanaCardFront: "",
      ghanaCardBack: "",
      nationalIdCard: "",
      businessAddress: "",
      riderCity: "",
      riderRegion: "",
      vehicleType: undefined,
      vehicleNumber: "",
      licenseNumber: "",
      vehicleColor: "",
    },
  });

  // Auto-fill form fields from authenticated user data
  useEffect(() => {
    if (user) {
      if (user.name) form.setValue("name", user.name);
      if (user.email) form.setValue("email", user.email);
      if ((user as any).phone) form.setValue("phone", (user as any).phone);
      if ((user as any).riderCity) form.setValue("riderCity", (user as any).riderCity);
      if ((user as any).riderRegion) form.setValue("riderRegion", (user as any).riderRegion);
      if (isLoggedIn) form.setValue("password", "existing-user");
      if ((user as any).profilePicture) {
        form.setValue("profileImage", (user as any).profilePicture);
        setProfilePreview((user as any).profilePicture);
      }
    }
  }, [user]);

  const vehicleType = form.watch("vehicleType");

  const handleImageUpload = async (file: File, fieldName: "profileImage" | "ghanaCardFront" | "ghanaCardBack") => {
    if (!file) return;

    const validTypes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a JPEG, PNG, or WebP image",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Image must be less than 10MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(fieldName);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/upload/public", {
        method: "POST",
        body: formData,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.url) {
        throw new Error(data?.error || "Upload failed");
      }

      form.setValue(fieldName, data.url);

      if (fieldName === "profileImage") setProfilePreview(data.url);
      if (fieldName === "ghanaCardFront") setCardFrontPreview(data.url);
      if (fieldName === "ghanaCardBack") setCardBackPreview(data.url);

      toast({
        title: "Success",
        description: "Image uploaded successfully",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
    }
  };

  const applyMutation = useMutation({
    mutationFn: async (data: BecomeRiderFormData) => {
      const vehicleInfo: any = { type: data.vehicleType };
      
      if (data.vehicleType === "car") {
        if (data.vehicleNumber?.trim()) vehicleInfo.plateNumber = data.vehicleNumber.trim();
        if (data.licenseNumber?.trim()) vehicleInfo.license = data.licenseNumber.trim();
        if (data.vehicleColor?.trim()) vehicleInfo.color = data.vehicleColor.trim();
      } else if (data.vehicleType === "motorcycle") {
        if (data.vehicleNumber?.trim()) vehicleInfo.plateNumber = data.vehicleNumber.trim();
        if (data.licenseNumber?.trim()) vehicleInfo.license = data.licenseNumber.trim();
      }
      
      const payload = {
        name: data.name,
        email: data.email,
        phone: data.phone,
        password: data.password,
        role: "rider",
        profileImage: data.profileImage,
        ghanaCardFront: data.ghanaCardFront,
        ghanaCardBack: data.ghanaCardBack,
        nationalIdCard: data.nationalIdCard,
        businessAddress: data.businessAddress,
        riderCity: data.riderCity,
        riderRegion: data.riderRegion,
        vehicleInfo,
      };

      if (isLoggedIn) {
        const res = await apiRequest("POST", "/api/users/apply", payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/applications/rider", payload);
      return res.json();
    },
    onSuccess: (response: any) => {
      if (response?.alreadyApplied) {
        toast({
          title: "Application Status",
          description:
            response?.userMessage ||
            "Your application to become a rider has been submitted. An admin will review and approve your application shortly.",
          duration: 8000,
        });
        return;
      }
      toast({
        title: "Application Submitted Successfully!",
        description: "Thank you for applying! We will review your application and get back to you within 72 hours via email.",
        duration: 8000,
      });
      setTimeout(() => {
        navigate("/");
      }, 2000);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit application",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BecomeRiderFormData) => {
    if (blockedByOtherRole) {
      toast({
        title: "Application blocked",
        description: "You can only apply to one role. Your account already has a seller application/profile.",
        variant: "destructive",
      });
      return;
    }
    if (sameRoleAlreadySubmitted) {
      toast({
        title: "Application Status",
        description: "Your application to become a rider has been submitted. An admin will review and approve your application shortly.",
      });
      return;
    }
    if (data.vehicleType === "car" && (!data.vehicleNumber || !data.licenseNumber || !data.vehicleColor)) {
      toast({
        title: "Missing Information",
        description: "Car riders must provide plate number, license, and vehicle color",
        variant: "destructive",
      });
      return;
    }
    
    if (data.vehicleType === "motorcycle" && (!data.vehicleNumber || !data.licenseNumber)) {
      toast({
        title: "Missing Information",
        description: "Motorcycle riders must provide plate number and license",
        variant: "destructive",
      });
      return;
    }
    
    applyMutation.mutate(data);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      
      <main className="flex-1 py-6 px-4 overflow-y-auto">
        <div className="max-w-2xl mx-auto">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="mb-6"
            data-testid="button-back"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </Button>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Bike className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Become a Delivery Partner</CardTitle>
                  <CardDescription>
                    Join our delivery team and start earning today
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Alert className="mb-6 border-primary/20 bg-primary/5">
                <AlertCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <strong>Important:</strong> Your profile photo must be a clear image of you and must match the photo on your Ghana Card. 
                  Ensure all information matches exactly as it appears on your Ghana Card for verification purposes.
                </AlertDescription>
              </Alert>

              {sameRoleAlreadySubmitted && (
                <Alert className="mb-6 border-blue-500/20 bg-blue-500/5">
                  <AlertCircle className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-sm">
                    Your application to become a rider has been submitted. An admin will review and approve your application shortly.
                  </AlertDescription>
                </Alert>
              )}

              {blockedByOtherRole && (
                <Alert className="mb-6 border-amber-500/20 bg-amber-500/5">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-sm">
                    You can only apply to one role. Your account already has a seller application/profile.
                  </AlertDescription>
                </Alert>
              )}

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Personal Information</h3>
                    
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Full Name (As on Ghana Card)</FormLabel>
                          <FormControl>
                            <Input placeholder="John Doe" {...field} data-testid="input-name" />
                          </FormControl>
                          <FormDescription>Must match your Ghana Card exactly</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email Address</FormLabel>
                          <FormControl>
                            <Input type="email" placeholder="john@example.com" {...field} readOnly={isLoggedIn} className={isLoggedIn ? "bg-muted cursor-not-allowed" : ""} data-testid="input-email" />
                          </FormControl>
                          {isLoggedIn && <FormDescription>Auto-filled from your account</FormDescription>}
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+233 XX XXX XXXX" {...field} data-testid="input-phone" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {!isLoggedIn && (
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
                    )}

                    <FormField
                      control={form.control}
                      name="businessAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address / Location</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main St, Accra, Ghana" {...field} data-testid="input-address" />
                          </FormControl>
                          <FormDescription>Your address must match Ghana Card</FormDescription>
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
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Verification Documents</h3>
                    
                    <FormField
                      control={form.control}
                      name="profileImage"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Profile Photo</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload(file, "profileImage");
                                }}
                                disabled={uploading === "profileImage"}
                                data-testid="input-profile-image"
                              />
                              {profilePreview && (
                                <div className="relative w-32 h-32 border rounded-lg overflow-hidden">
                                  <img src={profilePreview} alt="Profile" className="w-full h-full object-cover" />
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormDescription>Clear photo of you - must match your Ghana Card photo</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="nationalIdCard"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ghana Card Number</FormLabel>
                          <FormControl>
                            <Input placeholder="GHA-XXXXXXXXX-X" {...field} data-testid="input-national-id" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ghanaCardFront"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ghana Card (Front)</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload(file, "ghanaCardFront");
                                }}
                                disabled={uploading === "ghanaCardFront"}
                                data-testid="input-card-front"
                              />
                              {cardFrontPreview && (
                                <div className="relative w-64 h-40 border rounded-lg overflow-hidden">
                                  <img src={cardFrontPreview} alt="Ghana Card Front" className="w-full h-full object-cover" />
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormDescription>Clear photo of the front of your Ghana Card</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="ghanaCardBack"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Ghana Card (Back)</FormLabel>
                          <FormControl>
                            <div className="space-y-2">
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleImageUpload(file, "ghanaCardBack");
                                }}
                                disabled={uploading === "ghanaCardBack"}
                                data-testid="input-card-back"
                              />
                              {cardBackPreview && (
                                <div className="relative w-64 h-40 border rounded-lg overflow-hidden">
                                  <img src={cardBackPreview} alt="Ghana Card Back" className="w-full h-full object-cover" />
                                </div>
                              )}
                            </div>
                          </FormControl>
                          <FormDescription>Clear photo of the back of your Ghana Card</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Vehicle Information</h3>
                    
                    <FormField
                      control={form.control}
                      name="vehicleType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Vehicle Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
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

                    {vehicleType === "car" && (
                      <>
                        <FormField
                          control={form.control}
                          name="vehicleNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Plate Number</FormLabel>
                              <FormControl>
                                <Input placeholder="GH-1234-21" {...field} data-testid="input-plate-number" />
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
                                <Input placeholder="e.g. Black, White, Red" {...field} data-testid="input-vehicle-color" />
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
                              <FormLabel>Driver's License Number</FormLabel>
                              <FormControl>
                                <Input placeholder="License number" {...field} data-testid="input-license" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {vehicleType === "motorcycle" && (
                      <>
                        <FormField
                          control={form.control}
                          name="vehicleNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Plate Number</FormLabel>
                              <FormControl>
                                <Input placeholder="M-1234-GH" {...field} data-testid="input-plate-number" />
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
                              <FormLabel>Driver's License Number</FormLabel>
                              <FormControl>
                                <Input placeholder="License number" {...field} data-testid="input-license" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {vehicleType === "bicycle" && (
                      <Alert>
                        <AlertDescription>
                          No additional vehicle information required for bicycle riders.
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate("/")}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={applyMutation.isPending || uploading !== null || sameRoleAlreadySubmitted || blockedByOtherRole}
                      data-testid="button-submit"
                    >
                      {(applyMutation.isPending || uploading) && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      {uploading ? "Uploading..." : "Submit Application"}
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
