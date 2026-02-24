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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Store, ArrowLeft, Upload, Image as ImageIcon, AlertCircle, Package } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { STORE_TYPES, STORE_TYPE_CONFIG, type StoreType, getStoreTypeFields, getStoreTypeSchema } from "@shared/storeTypes";

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
  storeType: z.enum(STORE_TYPES, { required_error: "Please select a store type" }),
});

function getSellerSchema(storeType: StoreType | null) {
  if (!storeType) {
    return baseSellerSchema.extend({
      storeTypeMetadata: z.record(z.any()).optional(),
    });
  }
  
  return baseSellerSchema.extend({
    storeTypeMetadata: getStoreTypeSchema(storeType),
  });
}

type BecomeSellerFormData = z.infer<ReturnType<typeof getSellerSchema>>;

export default function BecomeSellerPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const isLoggedIn = !!user;
  const [uploading, setUploading] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string>("");
  const [cardFrontPreview, setCardFrontPreview] = useState<string>("");
  const [cardBackPreview, setCardBackPreview] = useState<string>("");
  const [selectedStoreType, setSelectedStoreType] = useState<StoreType | null>(null);
  const [metadataErrors, setMetadataErrors] = useState<Record<string, string>>({});

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
    if (user) {
      if (user.name) form.setValue("name", user.name);
      if (user.email) form.setValue("email", user.email);
      if ((user as any).phone) form.setValue("phone", (user as any).phone);
      // Set a placeholder password for logged-in users (they already have an account)
      if (isLoggedIn) form.setValue("password", "existing-user");
      if ((user as any).profilePicture) {
        form.setValue("profileImage", (user as any).profilePicture);
        setProfilePreview((user as any).profilePicture);
      }
    }
  }, [user]);

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
      const payload = {
        ...data,
        role: "seller",
      };
      if (isLoggedIn) {
        return apiRequest("POST", "/api/users/apply", payload);
      }
      return apiRequest("POST", "/api/applications/seller", payload);
    },
    onSuccess: () => {
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
    if (!selectedStoreType) {
      toast({
        title: "Store Type Required",
        description: "Please select a store type before submitting",
        variant: "destructive",
      });
      return;
    }

    try {
      const storeTypeSchema = getStoreTypeSchema(selectedStoreType);
      storeTypeSchema.parse(data.storeTypeMetadata);
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
                  <Store className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Become a Seller</CardTitle>
                  <CardDescription>
                    Start selling your products on KiyuMart
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

              {isLoggedIn && (
                <Alert className="mb-6 border-green-500/20 bg-green-500/5">
                  <AlertCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-sm">
                    <strong>Welcome, {user?.name}!</strong> We've pre-filled your details from your account. 
                    Just complete the store information and verification documents below.
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
                    <h3 className="text-lg font-semibold">Store Information</h3>
                    
                    <FormField
                      control={form.control}
                      name="storeType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Store Type</FormLabel>
                          <Select
                            onValueChange={(value) => {
                              field.onChange(value);
                              setSelectedStoreType(value as StoreType);
                              form.setValue("storeTypeMetadata", {});
                            }}
                            value={field.value}
                          >
                            <FormControl>
                              <SelectTrigger data-testid="select-store-type">
                                <SelectValue placeholder="Select your store type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {STORE_TYPES.map((type) => (
                                <SelectItem key={type} value={type} data-testid={`option-store-type-${type}`}>
                                  {STORE_TYPE_CONFIG[type].icon} {STORE_TYPE_CONFIG[type].label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            {selectedStoreType && STORE_TYPE_CONFIG[selectedStoreType].description}
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
                          <FormLabel>Store Name</FormLabel>
                          <FormControl>
                            <Input placeholder="My Awesome Store" {...field} data-testid="input-store-name" />
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
                              placeholder="Tell us about your store and products..."
                              className="min-h-[100px]"
                              {...field}
                              data-testid="input-store-description"
                            />
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
                          <FormLabel>Business Address / Location</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main St, Accra, Ghana" {...field} data-testid="input-business-address" />
                          </FormControl>
                          <FormDescription>Your business location must match Ghana Card address</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {selectedStoreType && (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2">
                        <Package className="h-5 w-5 text-primary" />
                        <h3 className="text-lg font-semibold">Product Information</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Tell us about the products you'll be selling. This helps us better understand your business.
                      </p>
                      
                      {getStoreTypeFields(selectedStoreType).map((field) => (
                        <div key={field.name}>
                          {field.type === "multiselect" ? (
                            <div className="space-y-3">
                              <FormLabel>
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </FormLabel>
                              <div className="grid grid-cols-2 gap-2">
                                {field.options?.map((option) => (
                                  <div key={option} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`${field.name}-${option}`}
                                      checked={
                                        (form.watch("storeTypeMetadata")?.[field.name] as string[])?.includes(option) || false
                                      }
                                      onCheckedChange={(checked) => {
                                        const current = (form.watch("storeTypeMetadata")?.[field.name] as string[]) || [];
                                        const updated = checked
                                          ? [...current, option]
                                          : current.filter((v: string) => v !== option);
                                        form.setValue("storeTypeMetadata", {
                                          ...form.watch("storeTypeMetadata"),
                                          [field.name]: updated,
                                        });
                                      }}
                                      data-testid={`checkbox-${field.name}-${option}`}
                                    />
                                    <label
                                      htmlFor={`${field.name}-${option}`}
                                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                    >
                                      {option}
                                    </label>
                                  </div>
                                ))}
                              </div>
                              {field.description && (
                                <p className="text-sm text-muted-foreground">{field.description}</p>
                              )}
                              {metadataErrors[field.name] && (
                                <p className="text-sm text-destructive">{metadataErrors[field.name]}</p>
                              )}
                            </div>
                          ) : field.type === "select" ? (
                            <div className="space-y-2">
                              <FormLabel>
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </FormLabel>
                              <Select
                                onValueChange={(value) => {
                                  form.setValue("storeTypeMetadata", {
                                    ...form.watch("storeTypeMetadata"),
                                    [field.name]: value,
                                  });
                                }}
                                value={(form.watch("storeTypeMetadata")?.[field.name] as string) || ""}
                              >
                                <SelectTrigger data-testid={`select-${field.name}`}>
                                  <SelectValue placeholder={field.placeholder || `Select ${field.label}`} />
                                </SelectTrigger>
                                <SelectContent>
                                  {field.options?.map((option) => (
                                    <SelectItem key={option} value={option} data-testid={`option-${field.name}-${option}`}>
                                      {option}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {field.description && (
                                <p className="text-sm text-muted-foreground">{field.description}</p>
                              )}
                              {metadataErrors[field.name] && (
                                <p className="text-sm text-destructive">{metadataErrors[field.name]}</p>
                              )}
                            </div>
                          ) : field.type === "textarea" ? (
                            <div className="space-y-2">
                              <FormLabel>
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </FormLabel>
                              <Textarea
                                placeholder={field.placeholder}
                                value={(form.watch("storeTypeMetadata")?.[field.name] as string) || ""}
                                onChange={(e) => {
                                  form.setValue("storeTypeMetadata", {
                                    ...form.watch("storeTypeMetadata"),
                                    [field.name]: e.target.value,
                                  });
                                }}
                                data-testid={`textarea-${field.name}`}
                              />
                              {field.description && (
                                <p className="text-sm text-muted-foreground">{field.description}</p>
                              )}
                              {metadataErrors[field.name] && (
                                <p className="text-sm text-destructive">{metadataErrors[field.name]}</p>
                              )}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <FormLabel>
                                {field.label}
                                {field.required && <span className="text-destructive ml-1">*</span>}
                              </FormLabel>
                              <Input
                                type={field.type === "number" ? "number" : "text"}
                                placeholder={field.placeholder}
                                value={(form.watch("storeTypeMetadata")?.[field.name] as string | number) || ""}
                                onChange={(e) => {
                                  const value = field.type === "number" ? Number(e.target.value) : e.target.value;
                                  form.setValue("storeTypeMetadata", {
                                    ...form.watch("storeTypeMetadata"),
                                    [field.name]: value,
                                  });
                                }}
                                data-testid={`input-${field.name}`}
                              />
                              {field.description && (
                                <p className="text-sm text-muted-foreground">{field.description}</p>
                              )}
                              {metadataErrors[field.name] && (
                                <p className="text-sm text-destructive">{metadataErrors[field.name]}</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

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
                      disabled={applyMutation.isPending || uploading !== null}
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
