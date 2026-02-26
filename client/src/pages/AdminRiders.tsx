import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Search, User, Edit, Plus, Bike, ArrowLeft, CheckCircle, XCircle, ShieldCheck, Clock, Eye, CreditCard, MapPin, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Rider {
  id: string;
  username: string;
  name: string;
  email: string;
  phone: string | null;
  isActive: boolean;
  isApproved: boolean;
  applicationStatus?: "pending" | "interview_scheduled" | "approved" | "rejected" | null;
  profileImage: string | null;
  ghanaCardFront: string | null;
  ghanaCardBack: string | null;
  nationalIdCard: string | null;
  vehicleInfo: {
    type: string;
    plateNumber: string;
    license: string;
    color?: string;
  } | null;
  businessAddress: string | null;
  riderCity?: string | null;
  riderRegion?: string | null;
  createdAt: string | null;
}

const addRiderSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().min(10, "Phone number must be at least 10 characters"),
  vehicleType: z.string().min(1, "Vehicle type is required"),
  vehicleNumber: z.string().optional(),
  vehicleColor: z.string().min(1, "Vehicle color is required"),
  licenseNumber: z.string().optional(),
  nationalIdCard: z.string().min(5, "National ID card must be at least 5 characters"),
  businessAddress: z.string().min(5, "Business address is required"),
  riderCity: z.string().min(2, "City is required"),
  riderRegion: z.string().min(2, "Region is required"),
}).superRefine((data, ctx) => {
  if ((data.vehicleType === "car" || data.vehicleType === "motorcycle") && !data.vehicleNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["vehicleNumber"],
      message: "Vehicle number is required for motorized riders",
    });
  }
  if ((data.vehicleType === "car" || data.vehicleType === "motorcycle") && !data.licenseNumber?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["licenseNumber"],
      message: "License number is required for motorized riders",
    });
  }
});

type AddRiderFormData = z.infer<typeof addRiderSchema>;

const parseVehicleInfo = (value: unknown): Rider["vehicleInfo"] => {
  if (!value) return null;
  if (typeof value === "object") return value as Rider["vehicleInfo"];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return parsed as Rider["vehicleInfo"];
      }
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeRider = (raw: any): Rider => ({
  id: String(raw?.id || ""),
  username: String(raw?.username || raw?.name || ""),
  name: String(raw?.name || raw?.username || ""),
  email: String(raw?.email || ""),
  phone: raw?.phone ? String(raw.phone) : null,
  isActive: Boolean(raw?.isActive),
  isApproved: Boolean(raw?.isApproved),
  applicationStatus: raw?.applicationStatus || null,
  profileImage: raw?.profileImage || null,
  ghanaCardFront: raw?.ghanaCardFront || null,
  ghanaCardBack: raw?.ghanaCardBack || null,
  nationalIdCard: raw?.nationalIdCard || null,
  vehicleInfo: parseVehicleInfo(raw?.vehicleInfo),
  businessAddress: raw?.businessAddress || null,
  riderCity: raw?.riderCity || null,
  riderRegion: raw?.riderRegion || null,
  createdAt: raw?.createdAt || null,
});

function AddRiderDialog() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<AddRiderFormData>({
    resolver: zodResolver(addRiderSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      phone: "",
      vehicleType: "",
      vehicleNumber: "",
      vehicleColor: "",
      licenseNumber: "",
      nationalIdCard: "",
      businessAddress: "",
      riderCity: "",
      riderRegion: "",
    },
  });

  const createRiderMutation = useMutation({
    mutationFn: async (data: AddRiderFormData) => {
      const riderData = {
        name: data.name,
        email: data.email,
        password: data.password,
        phone: data.phone,
        role: "rider",
        vehicleType: data.vehicleType,
        vehiclePlateNumber: data.vehicleNumber,
        vehicleColor: data.vehicleColor,
        vehicleLicense: data.licenseNumber,
        nationalIdCard: data.nationalIdCard,
        businessAddress: data.businessAddress,
        riderCity: data.riderCity,
        riderRegion: data.riderRegion,
      };
      return apiRequest("POST", "/api/users", riderData);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Rider added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/users", "rider"] });
      form.reset();
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add rider",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: AddRiderFormData) => {
    createRiderMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-add-rider" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Rider
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Rider</DialogTitle>
          <DialogDescription>
            Create a new rider account with vehicle information
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input placeholder="John Doe" {...field} data-testid="input-rider-name" />
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
                    <Input type="email" placeholder="rider@example.com" {...field} data-testid="input-rider-email" />
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
                    <Input type="password" placeholder="••••••••" {...field} data-testid="input-rider-password" />
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
                    <Input placeholder="+233 XX XXX XXXX" {...field} data-testid="input-rider-phone" />
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
                  <FormLabel>Vehicle Type</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                    <Input placeholder="e.g., Red, Blue, Black" {...field} data-testid="input-vehicle-color" />
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
                  <FormLabel>Business Address</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 123 Main St, Accra, Ghana" {...field} data-testid="input-business-address" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
                )}
              />

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

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createRiderMutation.isPending}
                data-testid="button-submit-rider"
              >
                {createRiderMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Add Rider
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ViewApplicationDialog({ riderData }: { riderData: Rider }) {
  const [open, setOpen] = useState(false);
  const vehicleInfo = parseVehicleInfo(riderData.vehicleInfo);
  const [cardRotation, setCardRotation] = useState<{ front: number; back: number }>({
    front: 0,
    back: 0,
  });
  const [zoomedImage, setZoomedImage] = useState<{ label: string; url: string } | null>(null);
  const [zoomScale, setZoomScale] = useState(1);
  const [zoomRotation, setZoomRotation] = useState(0);

  const openZoom = (label: string, url: string, rotation: number) => {
    setZoomedImage({ label, url });
    setZoomScale(1);
    setZoomRotation(rotation % 360);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setCardRotation({ front: 0, back: 0 });
        } else {
          setZoomedImage(null);
          setZoomScale(1);
          setZoomRotation(0);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          data-testid={`button-view-application-${riderData.id}`}
        >
          <Eye className="h-3 w-3 mr-1" />
          View Profile
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rider Application Details</DialogTitle>
          <DialogDescription>
            Review all application details including verification documents
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {riderData.profileImage && (
            <div>
                <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile Photo
                </h3>
                <div className="bg-muted rounded-lg p-4 flex justify-center">
                  <img 
                    src={riderData.profileImage} 
                    alt="Profile" 
                    className="w-32 h-32 rounded-full object-cover cursor-zoom-in"
                    onClick={() => openZoom("Profile Photo", riderData.profileImage!, 0)}
                  />
                </div>
              </div>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-3">Personal Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Name</p>
                <p className="font-medium">{riderData.name || riderData.username}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Email</p>
                <p className="font-medium">{riderData.email}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Phone</p>
                <p className="font-medium">{riderData.phone || 'N/A'}</p>
              </div>
              <div>
                <p className="text-muted-foreground">City / Region</p>
                <p className="font-medium">{riderData.riderCity || "N/A"} / {riderData.riderRegion || "N/A"}</p>
              </div>
              {riderData.nationalIdCard && (
                <div>
                  <p className="text-muted-foreground">Ghana Card Number</p>
                  <p className="font-medium">{riderData.nationalIdCard}</p>
                </div>
              )}
            </div>
          </div>

          {(riderData.ghanaCardFront || riderData.ghanaCardBack) && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Ghana Card Verification
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {riderData.ghanaCardFront && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Front</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openZoom("Ghana Card Front", riderData.ghanaCardFront!, cardRotation.front)}
                        >
                          Zoom
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setCardRotation((prev) => ({ ...prev, front: (prev.front + 90) % 360 }))
                          }
                        >
                          Rotate
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-2 h-60 border border-border/70 flex items-center justify-center overflow-hidden">
                      <img
                        src={riderData.ghanaCardFront}
                        alt="Ghana Card Front"
                        className="max-h-[85%] max-w-[85%] rounded object-contain transition-transform duration-150 cursor-zoom-in"
                        style={{
                          transform: `rotate(${cardRotation.front}deg)`,
                          imageOrientation: "from-image" as any,
                        }}
                        onClick={() => openZoom("Ghana Card Front", riderData.ghanaCardFront!, cardRotation.front)}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          const shouldRotate = img.naturalHeight > img.naturalWidth;
                          setCardRotation((prev) =>
                            prev.front !== 0 ? prev : { ...prev, front: shouldRotate ? 90 : 0 }
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
                {riderData.ghanaCardBack && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm font-medium text-muted-foreground">Back</p>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => openZoom("Ghana Card Back", riderData.ghanaCardBack!, cardRotation.back)}
                        >
                          Zoom
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setCardRotation((prev) => ({ ...prev, back: (prev.back + 90) % 360 }))
                          }
                        >
                          Rotate
                        </Button>
                      </div>
                    </div>
                    <div className="bg-muted rounded-lg p-2 h-60 border border-border/70 flex items-center justify-center overflow-hidden">
                      <img
                        src={riderData.ghanaCardBack}
                        alt="Ghana Card Back"
                        className="max-h-[85%] max-w-[85%] rounded object-contain transition-transform duration-150 cursor-zoom-in"
                        style={{
                          transform: `rotate(${cardRotation.back}deg)`,
                          imageOrientation: "from-image" as any,
                        }}
                        onClick={() => openZoom("Ghana Card Back", riderData.ghanaCardBack!, cardRotation.back)}
                        onLoad={(event) => {
                          const img = event.currentTarget;
                          const shouldRotate = img.naturalHeight > img.naturalWidth;
                          setCardRotation((prev) =>
                            prev.back !== 0 ? prev : { ...prev, back: shouldRotate ? 90 : 0 }
                          );
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {vehicleInfo && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <Bike className="h-5 w-5" />
                Vehicle Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Vehicle Type</p>
                  <p className="font-medium capitalize">{vehicleInfo.type || "N/A"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Plate Number</p>
                  <p className="font-medium">{vehicleInfo.plateNumber || "N/A"}</p>
                </div>
                {vehicleInfo.color && (
                  <div>
                    <p className="text-muted-foreground">Vehicle Color</p>
                    <p className="font-medium capitalize">{vehicleInfo.color}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">License Number</p>
                  <p className="font-medium">{vehicleInfo.license || "N/A"}</p>
                </div>
              </div>
            </div>
          )}

          {riderData.businessAddress && (
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Address
              </h3>
              <p className="text-sm">{riderData.businessAddress}</p>
            </div>
          )}
        </div>
      </DialogContent>

      <Dialog
        open={Boolean(zoomedImage)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setZoomedImage(null);
            setZoomScale(1);
            setZoomRotation(0);
          }
        }}
      >
        <DialogContent className="w-[96vw] max-w-5xl h-[90vh] p-0 overflow-hidden">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>{zoomedImage?.label || "Image Preview"}</DialogTitle>
            <DialogDescription>Use zoom and rotate controls to inspect details clearly.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 border-b px-6 py-3">
            <div className="text-sm text-muted-foreground truncate">{zoomedImage?.url || ""}</div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZoomScale((prev) => Math.max(0.5, Number((prev - 0.25).toFixed(2))))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setZoomScale(1)}>
                100%
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZoomScale((prev) => Math.min(4, Number((prev + 0.25).toFixed(2))))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setZoomRotation((prev) => (prev + 90) % 360)}
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="h-full overflow-auto bg-black/80 p-4">
            {zoomedImage && (
              <div className="flex min-h-full items-center justify-center">
                <img
                  src={zoomedImage.url}
                  alt={zoomedImage.label}
                  className="max-w-none"
                  style={{
                    transform: `scale(${zoomScale}) rotate(${zoomRotation}deg)`,
                    transformOrigin: "center center",
                    imageOrientation: "from-image" as any,
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

function ApproveRejectDialog({ riderData }: { riderData: Rider }) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const { toast } = useToast();

  const approveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/users/${riderData.id}/approve`);
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Rider application approved successfully",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", "rider"] });
      await queryClient.refetchQueries({ queryKey: ["/api/users", "rider"] });
      setOpen(false);
      setAction(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve rider",
        variant: "destructive",
      });
      setAction(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/users/${riderData.id}/reject`);
    },
    onSuccess: async () => {
      toast({
        title: "Success",
        description: "Rider application rejected successfully",
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/users", "rider"] });
      await queryClient.refetchQueries({ queryKey: ["/api/users", "rider"] });
      setOpen(false);
      setAction(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject rider",
        variant: "destructive",
      });
      setAction(null);
    },
  });

  const handleAction = (selectedAction: 'approve' | 'reject') => {
    setAction(selectedAction);
    setOpen(true);
  };

  const confirmAction = () => {
    if (action === 'approve') {
      approveMutation.mutate();
    } else if (action === 'reject') {
      rejectMutation.mutate();
    }
  };

  const isPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <>
      {!riderData.isApproved && riderData.isActive && (
        <div className="flex gap-1">
          <Button 
            variant="default" 
            size="sm"
            onClick={() => handleAction('approve')}
            data-testid={`button-approve-${riderData.id}`}
            className="bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-3 w-3 mr-1" />
            Approve
          </Button>
          <Button 
            variant="destructive" 
            size="sm"
            onClick={() => handleAction('reject')}
            data-testid={`button-reject-${riderData.id}`}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {action === 'approve' ? 'Approve' : 'Reject'} Rider Application?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {action === 'approve' 
                ? `Are you sure you want to approve ${riderData.name || riderData.username}'s application? This will allow them to start accepting deliveries.`
                : `Are you sure you want to reject ${riderData.name || riderData.username}'s application?`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-action">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmAction}
              disabled={isPending}
              data-testid="button-confirm-action"
              className={action === 'reject' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {action === 'approve' ? 'Approve' : 'Reject'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function AdminRiders() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: riders = [], isLoading } = useQuery<Rider[]>({
    queryKey: ["/api/users", "rider"],
    queryFn: async () => {
      const res = await fetch("/api/users?role=rider");
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load riders");
      }
      const payload = await res.json();
      if (!Array.isArray(payload)) return [];
      return payload.map(normalizeRider);
    },
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // All riders (exclude rejected application records from management lists)
  const allRiders = (Array.isArray(riders) ? riders : []).filter((r) => {
    const status = String(r.applicationStatus || "").toLowerCase();
    return !(status === "rejected" && !r.isApproved);
  });
  
  // Pending applications (unapproved active riders with pending/interview status only)
  const pendingRiders = allRiders.filter((r) => {
    const status = String(r.applicationStatus || "").toLowerCase();
    return r.isApproved === false && r.isActive === true && (status === "pending" || status === "interview_scheduled");
  });
  const approvedRiders = allRiders.filter(r => r.isApproved === true);
  
  // Get the appropriate rider list based on active tab
  const displayedRiders = activeTab === "pending" 
    ? pendingRiders 
    : activeTab === "approved" 
      ? approvedRiders 
      : allRiders;

  const filteredRiders = displayedRiders.filter(r => 
    (r.name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (r.username?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (r.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

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
              onClick={() => window.history.back()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-riders">Riders Management</h1>
              <p className="text-muted-foreground mt-1">Manage delivery riders</p>
            </div>
            <AddRiderDialog />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="all" data-testid="tab-all-riders">
                All Riders ({allRiders.length})
              </TabsTrigger>
              <TabsTrigger value="pending" data-testid="tab-pending-riders">
                Pending Applications ({pendingRiders.length})
              </TabsTrigger>
              <TabsTrigger value="approved" data-testid="tab-approved-riders">
                Approved Riders ({approvedRiders.length})
              </TabsTrigger>
            </TabsList>

            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search riders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-riders"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <div className="grid gap-4">
                {filteredRiders.map((rider) => (
                <Card key={rider.id} className="p-4" data-testid={`card-rider-${rider.id}`}>
                  <div className="flex items-center gap-4">
                    <div className="bg-orange-500/10 p-3 rounded-full">
                      <Bike className="h-6 w-6 text-orange-500" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg" data-testid={`text-username-${rider.id}`}>
                        {rider.name || rider.username}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                        <span data-testid={`text-email-${rider.id}`}>{rider.email}</span>
                        {rider.phone && (
                          <>
                            <span>•</span>
                            <span data-testid={`text-phone-${rider.id}`}>{rider.phone}</span>
                          </>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {rider.isActive ? (
                          <Badge className="bg-green-500" data-testid={`badge-status-${rider.id}`}>
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="destructive" data-testid={`badge-status-${rider.id}`}>
                            <XCircle className="h-3 w-3 mr-1" />
                            Inactive
                          </Badge>
                        )}
                        
                        {rider.isApproved ? (
                          <Badge className="bg-blue-500" data-testid={`badge-approval-${rider.id}`}>
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Approved
                          </Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-approval-${rider.id}`}>
                            <Clock className="h-3 w-3 mr-1" />
                            Pending Approval
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <ViewApplicationDialog riderData={rider} />
                      {!rider.isApproved && rider.isActive ? (
                        <ApproveRejectDialog riderData={rider} />
                      ) : (
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => navigate(`/admin/riders/${rider.id}/edit`)}
                          data-testid={`button-edit-${rider.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
              
                {filteredRiders.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-muted-foreground" data-testid="text-no-riders">
                      {searchQuery 
                        ? "No riders found matching your search" 
                        : activeTab === "pending"
                          ? "No pending applications"
                          : "No riders registered yet"
                      }
                    </p>
                  </div>
                )}
              </div>
            )}
          </Tabs>
      </div>
    </DashboardLayout>
  );
}
