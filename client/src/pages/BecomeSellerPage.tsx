import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { formatGhanaCardInput, GHANA_CARD_MAX_LENGTH } from "@/lib/ghanaCard";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Store, ArrowLeft, AlertCircle, MapPin, Navigation } from "lucide-react";
import { STORE_TYPES, type StoreType, getStoreTypeSchema } from "@shared/storeTypes";
import { StoreTypeSelector, StoreTypeDynamicFields } from "@/components/StoreTypeSelector";
import { resolveSavedLocationToAddress } from "@/lib/locationPrefill";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const baseSellerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  storeName: z.string().min(3, "Store name must be at least 3 characters"),
  storeDescription: z.string().min(10, "Please provide a detailed store description"),
  businessAddress: z.string().min(5, "Business address is required"),
  profileImage: z.string().min(1, "Profile image is required"),
  ghanaCardFront: z.string().min(1, "Ghana Card front image is required"),
  ghanaCardBack: z.string().min(1, "Ghana Card back image is required"),
  nationalIdCard: z.string().min(10, "Ghana Card number is required"),
  storeType: z.enum(STORE_TYPES).optional(),
});

function getSellerSchema(_storeType: StoreType | null) {
  return baseSellerSchema.extend({
    storeTypeMetadata: z.record(z.any()).optional(),
  });
}

type BecomeSellerFormData = z.infer<ReturnType<typeof getSellerSchema>>;

export default function BecomeSellerPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const isLoggedIn = !!user;
  const currentRole = String(user?.role || "").toLowerCase();
  const currentRequestedRole = String((user as any)?.requestedRole || "").toLowerCase();
  const currentApplicationStatus = String((user as any)?.applicationStatus || "").toLowerCase();
  const sameRoleAlreadySubmitted =
    isLoggedIn &&
    ((currentRole === "seller" && (user?.isApproved ?? false)) ||
      ((currentRequestedRole === "seller" || currentRole === "seller") &&
        ["pending", "interview_scheduled", "approved"].includes(currentApplicationStatus)));
  const blockedByOtherRole =
    isLoggedIn &&
    (((currentRole === "rider" && (user?.isApproved ?? false)) ||
      (currentRequestedRole === "rider" &&
        ["pending", "interview_scheduled", "approved"].includes(currentApplicationStatus))));
  const applicationGate = blockedByOtherRole
    ? {
        title: "Application blocked",
        description: "You can only apply to one role. Your account already has a rider application/profile.",
      }
    : sameRoleAlreadySubmitted
      ? {
          title: "Application already submitted",
          description: "Your application to become a seller has been submitted. An admin will review and approve your application shortly.",
        }
      : null;
  const [uploading, setUploading] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>("");
  const [cardFrontPreview, setCardFrontPreview] = useState<string>("");
  const [cardBackPreview, setCardBackPreview] = useState<string>("");
  const [selectedStoreType, setSelectedStoreType] = useState<StoreType | null>(null);
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});
  // Business type step — must be chosen before the main form appears
  const [businessType, setBusinessType] = useState<"store" | "restaurant" | "local_vendor" | null>(null);
  // When the platform-wide food experience is disabled, hide the restaurant /
  // local-vendor application options entirely.
  const { restaurantsEnabled } = usePlatformSettings();
  // GPS coordinates captured at registration (for distance calculation on home screen)
  const [gpsCoords, setGpsCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  // Restaurant-specific extra fields (not in the main Zod schema)
  const [cuisineType, setCuisineType] = useState("");
  const [seatingType, setSeatingType] = useState("");
  const [operatingHours, setOperatingHours] = useState("");
  // Local vendor extra fields
  const [vendorFoodTypes, setVendorFoodTypes] = useState<string[]>([]);

  const captureGPS = () => {
    if (!navigator.geolocation) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCoords({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsLoading(false);
        toast({ title: "Location captured!", description: "Your GPS coordinates have been saved." });
      },
      () => {
        setGpsLoading(false);
        toast({ title: "Location denied", description: "Please enter your address manually.", variant: "destructive" });
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  useEffect(() => {
    if (!authLoading && !isLoggedIn) {
      navigate(`/auth?redirect=${encodeURIComponent("/become-seller")}`);
    }
  }, [authLoading, isLoggedIn, navigate]);

  const form = useForm<BecomeSellerFormData>({
    resolver: zodResolver(getSellerSchema(selectedStoreType)),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      storeName: "",
      storeDescription: "",
      businessAddress: "",
      profileImage: "",
      ghanaCardFront: "",
      ghanaCardBack: "",
      nationalIdCard: "",
      storeType: undefined as any,
      storeTypeMetadata: {},
    },
  });

  // Auto-fill form fields from authenticated user data
  useEffect(() => {
    const setIfEmpty = (field: keyof BecomeSellerFormData, value: unknown) => {
      const next = typeof value === "string" ? value.trim() : "";
      const current = String(form.getValues(field as any) || "").trim();
      if (next && !current) {
        form.setValue(field as any, next as any);
      }
    };

    if (user) {
      setIfEmpty("name", user.name);
      setIfEmpty("email", user.email);
      setIfEmpty("phone", (user as any).phone);
      setIfEmpty("storeName", (user as any).storeName);
      setIfEmpty("storeDescription", (user as any).storeDescription);
      setIfEmpty("nationalIdCard", (user as any).nationalIdCard);
      setIfEmpty("businessAddress", (user as any).businessAddress);
      if ((user as any).storeType && !form.getValues("storeType")) {
        form.setValue("storeType", (user as any).storeType);
        setSelectedStoreType((user as any).storeType as StoreType);
      }
      // Set a placeholder password for logged-in users (they already have an account)
      if (isLoggedIn) form.setValue("password", "existing-user");
      const profileImage = (user as any).profileImage || (user as any).profilePicture;
      if (profileImage && !String(form.getValues("profileImage") || "").trim()) {
        form.setValue("profileImage", profileImage);
        setProfilePreview(profileImage);
      }
      if ((user as any).ghanaCardFront && !String(form.getValues("ghanaCardFront") || "").trim()) {
        form.setValue("ghanaCardFront", (user as any).ghanaCardFront);
        setCardFrontPreview((user as any).ghanaCardFront);
      }
      if ((user as any).ghanaCardBack && !String(form.getValues("ghanaCardBack") || "").trim()) {
        form.setValue("ghanaCardBack", (user as any).ghanaCardBack);
        setCardBackPreview((user as any).ghanaCardBack);
      }
    }

    let cancelled = false;
    (async () => {
      const resolvedLocation = await resolveSavedLocationToAddress();
      if (cancelled || !resolvedLocation) return;
      setIfEmpty("businessAddress", resolvedLocation.address);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isLoggedIn, form]);

  useEffect(() => {
    if (selectedStoreType) {
      setMetadataErrors({});
    }
  }, [selectedStoreType]);

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
    // Ghana ID card uploads must be normalised to landscape for the admin review UI.
    // Profile photos keep their natural orientation.
    if (fieldName === "ghanaCardFront" || fieldName === "ghanaCardBack") {
      formData.append("purpose", "ghana_card");
    }

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
    mutationFn: async (data: BecomeSellerFormData) => {
      const autoStoreType = businessType === "restaurant" ? "restaurant"
        : businessType === "local_vendor" ? "food_beverages"
        : data.storeType;
      const payload = {
        ...data,
        role: "seller",
        businessType: businessType ?? "store",
        storeType: autoStoreType,
        ...(gpsCoords ? { storeLatitude: gpsCoords.lat, storeLongitude: gpsCoords.lon } : {}),
        // Extra metadata for restaurant / local vendor
        storeTypeMetadata: {
          ...data.storeTypeMetadata,
          ...(cuisineType ? { cuisineType } : {}),
          ...(seatingType ? { seatingType } : {}),
          ...(operatingHours ? { operatingHours } : {}),
          ...(vendorFoodTypes.length ? { foodType: vendorFoodTypes } : {}),
        },
      };
      if (isLoggedIn) {
        const res = await apiRequest("POST", "/api/users/apply", payload);
        return res.json();
      }
      const res = await apiRequest("POST", "/api/applications/seller", payload);
      return res.json();
    },
    onSuccess: (response: any) => {
      if (response?.alreadyApplied) {
        toast({
          title: "Application Status",
          description:
            response?.userMessage ||
            "Your application to become a seller has been submitted. An admin will review and approve your application shortly.",
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

  const onSubmit = (data: BecomeSellerFormData) => {
    if (blockedByOtherRole) {
      toast({
        title: "Application blocked",
        description: "You can only apply to one role. Your account already has a rider application/profile.",
        variant: "destructive",
      });
      return;
    }
    if (sameRoleAlreadySubmitted) {
      toast({
        title: "Application Status",
        description: "Your application to become a seller has been submitted. An admin will review and approve your application shortly.",
      });
      return;
    }
    // Restaurant and local vendor auto-set their storeType — no picker needed
    if (businessType === "store" && !selectedStoreType) {
      toast({
        title: "Store Type Required",
        description: "Please select a store type before submitting",
        variant: "destructive",
      });
      return;
    }
    if (businessType === "local_vendor" && vendorFoodTypes.length === 0) {
      toast({ title: "Please select what you sell", variant: "destructive" });
      return;
    }
    if (businessType === "restaurant" && !cuisineType) {
      toast({ title: "Please select a cuisine type", variant: "destructive" });
      return;
    }

    try {
      // Only validate storeTypeMetadata schema for regular stores
      if (businessType === "store" && selectedStoreType) {
        const storeTypeSchema = getStoreTypeSchema(selectedStoreType);
        storeTypeSchema.parse(data.storeTypeMetadata);
      }
      setMetadataErrors({});
      applyMutation.mutate(data);
    } catch (error: any) {
      if (error.errors) {
        const errors: Record<string, string> = {};
        error.errors.forEach((err: any) => {
          const fieldName = err.path[0];
          errors[fieldName] = err.message;
        });
        setMetadataErrors(errors);
        
        toast({
          title: "Missing Required Information",
          description: "Please fill in all required product information fields",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Validation Error",
          description: "Please check all required fields",
          variant: "destructive",
        });
      }
    }
  };

  return (
    <div className="bg-background" style={{ paddingBottom: 'max(40px, env(safe-area-inset-bottom))', overflowX: 'hidden' }}>
      {/* Sticky top bar — works with window scroll, not overflow container */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b px-4 flex items-center gap-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '12px' }}>
        <button
          onClick={() => navigate("/")}
          className="p-2 -ml-1 rounded-full hover:bg-muted transition-colors"
          data-testid="button-back"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="font-semibold text-base">Become a Seller</span>
      </div>

      <div className="px-4 py-5 max-w-2xl mx-auto">

          {applicationGate && (
            <Dialog open>
              <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
                <DialogHeader>
                  <DialogTitle>{applicationGate.title}</DialogTitle>
                  <DialogDescription>{applicationGate.description}</DialogDescription>
                </DialogHeader>
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => navigate("/")}>
                    Back to Home
                  </Button>
                  <Button onClick={() => navigate("/notifications")}>
                    View Updates
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {/* ── Step 0: Choose business type ── */}
          {!authLoading && isLoggedIn && !applicationGate && !businessType && (
            <div className="py-2">
              <div className="mb-5">
                <h2 className="text-xl font-bold">What kind of business are you?</h2>
                <p className="text-sm text-muted-foreground mt-1">Choose the type that best describes your business.</p>
              </div>
              <div className="flex flex-col gap-3">
                {([
                  { type: "store" as const,        icon: "🏪", label: "Store",        desc: "General merchandise, clothing, electronics & more" },
                  { type: "restaurant" as const,   icon: "🍽️", label: "Restaurant",   desc: "Dine-in or takeout food & drinks" },
                  { type: "local_vendor" as const, icon: "🥘", label: "Local Vendor",  desc: "Home-cooked food, local produce & street goods" },
                ] as const)
                  .filter(({ type }) => restaurantsEnabled || (type !== "restaurant" && type !== "local_vendor"))
                  .map(({ type, icon, label, desc }) => (
                  <button
                    key={type}
                    onClick={() => {
                      setBusinessType(type);
                      if (type === "restaurant" || type === "local_vendor") {
                        form.setValue("storeType", "food_beverages" as any);
                        setSelectedStoreType("food_beverages");
                      }
                    }}
                    className="flex items-center gap-4 rounded-2xl border-2 border-border bg-card px-5 py-4 text-left hover:border-primary hover:bg-primary/5 active:scale-[0.98] transition-all cursor-pointer w-full"
                  >
                    <span className="text-3xl shrink-0">{icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-base">{label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</div>
                    </div>
                    <svg className="ml-auto shrink-0 text-muted-foreground" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </div>
          )}

          {!authLoading && isLoggedIn && !applicationGate && businessType && (
          <Card className="border-0 shadow-none sm:border sm:shadow-sm">
            <CardHeader className="px-0 pt-2 pb-4 sm:px-6 sm:pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl">
                  <Store className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg leading-tight">
                    {businessType === "restaurant" ? "Open a Restaurant" : businessType === "local_vendor" ? "Register as Local Vendor" : "Open a Store"}
                  </CardTitle>
                  <CardDescription className="text-xs mt-0.5">
                    {businessType === "restaurant" ? "Set up your restaurant on KiyuMart" : businessType === "local_vendor" ? "Sell local food & goods near you" : "Start selling your products on KiyuMart"}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-0 sm:px-6">
              <Alert className="mb-6 border-primary/20 bg-primary/5">
                <AlertCircle className="h-4 w-4 text-primary" />
                <AlertDescription className="text-sm">
                  <strong>Important:</strong> Your profile photo must be a clear image of you and must match the photo on your Ghana Card. 
                  Ensure all information matches exactly as it appears on your Ghana Card for verification purposes.
                </AlertDescription>
              </Alert>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-base font-semibold border-b pb-2">Personal Information</h3>
                    
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
                  </div>

                  <div className="space-y-4">
                    <h3 className="text-base font-semibold border-b pb-2">Verification Documents</h3>
                    
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
                                <div className="relative w-20 h-20 border rounded-xl overflow-hidden">
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
                            <Input
                              placeholder="GHA-XXXXXXXXX-X"
                              inputMode="text"
                              autoComplete="off"
                              spellCheck={false}
                              maxLength={GHANA_CARD_MAX_LENGTH}
                              {...field}
                              value={field.value || ""}
                              onChange={(e) => field.onChange(formatGhanaCardInput(e.target.value))}
                              data-testid="input-national-id"
                            />
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
                                <div className="relative w-full max-w-xs h-36 border rounded-xl overflow-hidden">
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
                                <div className="relative w-full max-w-xs h-36 border rounded-xl overflow-hidden">
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

                  {/* ── Store Information — tailored per businessType ── */}
                  <div className="space-y-4">
                    <h3 className="text-base font-semibold border-b pb-2">
                      {businessType === "restaurant" ? "Restaurant Details"
                        : businessType === "local_vendor" ? "Vendor Details"
                        : "Store Information"}
                    </h3>

                    {/* NAME */}
                    <FormField control={form.control} name="storeName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {businessType === "restaurant" ? "Restaurant Name" : businessType === "local_vendor" ? "Vendor / Shop Name" : "Store Name"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={businessType === "restaurant" ? "e.g. Ama's Kitchen" : businessType === "local_vendor" ? "e.g. Afia's Chop Bar" : "My Awesome Store"}
                            {...field} data-testid="input-store-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* RESTAURANT — cuisine type */}
                    {businessType === "restaurant" && (
                      <FormItem>
                        <FormLabel>Cuisine Type <span className="text-destructive">*</span></FormLabel>
                        <select
                          value={cuisineType}
                          onChange={(e) => setCuisineType(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Select cuisine…</option>
                          {["Ghanaian", "West African", "Continental", "Chinese", "Fast Food", "Grills & BBQ", "Seafood", "Italian", "Indian", "Café & Pastry", "Mixed / Other"]
                            .map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </FormItem>
                    )}

                    {/* RESTAURANT — seating type */}
                    {businessType === "restaurant" && (
                      <FormItem>
                        <FormLabel>Service Type</FormLabel>
                        <select
                          value={seatingType}
                          onChange={(e) => setSeatingType(e.target.value)}
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                          <option value="">Select service type…</option>
                          {["Dine-in only", "Takeout only", "Dine-in & Takeout", "Delivery only", "All (Dine-in, Takeout & Delivery)"]
                            .map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </FormItem>
                    )}

                    {/* LOCAL VENDOR — food types */}
                    {businessType === "local_vendor" && (
                      <FormItem>
                        <FormLabel>What do you sell? <span className="text-destructive">*</span></FormLabel>
                        <FormDescription>Select all that apply</FormDescription>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          {["Local Dishes / Cooked Meals", "Street Food", "Fresh Produce", "Beverages & Drinks", "Snacks", "Pastry & Bakery", "Frozen Foods", "Packaged Foods"].map((ft) => (
                            <label key={ft} className="flex items-center gap-2 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={vendorFoodTypes.includes(ft)}
                                onChange={(e) => setVendorFoodTypes(prev => e.target.checked ? [...prev, ft] : prev.filter(x => x !== ft))}
                                className="rounded"
                              />
                              {ft}
                            </label>
                          ))}
                        </div>
                      </FormItem>
                    )}

                    {/* STORE — store type picker (excludes food types) */}
                    {businessType === "store" && (
                      <FormField control={form.control} name="storeType" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Type <span className="text-destructive">*</span></FormLabel>
                          <FormDescription>Choose the category that best describes your store.</FormDescription>
                          <StoreTypeSelector
                            value={field.value}
                            onChange={(value) => { field.onChange(value); setSelectedStoreType(value as StoreType); form.setValue("storeTypeMetadata", {}); }}
                            exclude={["food_beverages", "restaurant"]}
                            error={form.formState.errors.storeType?.message as string | undefined}
                          />
                        </FormItem>
                      )} />
                    )}

                    {/* DESCRIPTION */}
                    <FormField control={form.control} name="storeDescription" render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {businessType === "restaurant" ? "About Your Restaurant" : businessType === "local_vendor" ? "About Your Vendor" : "Store Description"}
                        </FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder={
                              businessType === "restaurant"
                                ? "Tell customers about your restaurant, specialties, atmosphere…"
                                : businessType === "local_vendor"
                                  ? "Tell customers what makes your food special, your story…"
                                  : "Tell us about your store and products…"
                            }
                            className="min-h-[100px]" {...field} data-testid="input-store-description"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* ADDRESS + GPS (required for local_vendor & restaurant) */}
                    <FormField control={form.control} name="businessAddress" render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {businessType === "restaurant" ? "Restaurant Address" : businessType === "local_vendor" ? "Vendor Location / Address" : "Business Address"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={businessType === "local_vendor" ? "e.g. Osu, near Total filling station" : "123 Main St, Accra, Ghana"}
                            {...field} data-testid="input-business-address"
                          />
                        </FormControl>
                        {(businessType === "restaurant" || businessType === "local_vendor") && (
                          <div className="flex items-center gap-2 mt-2">
                            <Button type="button" variant="outline" size="sm" onClick={captureGPS} disabled={gpsLoading} className="gap-2">
                              {gpsLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Navigation className="h-3.5 w-3.5" />}
                              {gpsCoords ? "GPS Saved ✓" : "Pin My Location"}
                            </Button>
                            {gpsCoords && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {gpsCoords.lat.toFixed(4)}, {gpsCoords.lon.toFixed(4)}
                              </span>
                            )}
                          </div>
                        )}
                        <FormDescription>
                          {(businessType === "restaurant" || businessType === "local_vendor")
                            ? "Pin your location so customers can see how far you are."
                            : "Your business location must match Ghana Card address"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )} />

                    {/* OPERATING HOURS (restaurant & local vendor) */}
                    {(businessType === "restaurant" || businessType === "local_vendor") && (
                      <FormItem>
                        <FormLabel>Operating Hours</FormLabel>
                        <input
                          value={operatingHours}
                          onChange={(e) => setOperatingHours(e.target.value)}
                          placeholder="e.g. Mon–Sat 8am–8pm, Sun 10am–6pm"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        />
                        <p className="text-xs text-muted-foreground mt-1">When do you operate? This is shown to customers.</p>
                      </FormItem>
                    )}
                  </div>

                  {/* Store dynamic fields (only for regular stores with a selected type) */}
                  {businessType === "store" && selectedStoreType && (
                    <StoreTypeDynamicFields
                      storeType={selectedStoreType}
                      metadata={form.watch("storeTypeMetadata") || {}}
                      onChange={(updated) => form.setValue("storeTypeMetadata", updated)}
                      errors={metadataErrors}
                    />
                  )}

                  <div className="flex justify-end gap-3 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBusinessType(null)}
                      data-testid="button-cancel"
                    >
                      ← Change type
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
          )}
      </div>
    </div>
  );
}
