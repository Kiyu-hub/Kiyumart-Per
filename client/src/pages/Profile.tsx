import { useState, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import UserAvatar from "@/components/UserAvatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { User, MapPin, CreditCard, Package, LogOut, Settings, Camera, Loader2, Truck, Store } from "lucide-react";
import MediaUploadInput from "@/components/MediaUploadInput";
import { useLocation } from "wouter";

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: string;
  profileImage?: string;
  storeName?: string;
  storeDescription?: string;
  storeBanner?: string;
  vehicleInfo?: {
    type: string;
    plateNumber: string;
    license: string;
  };
}

export default function Profile() {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<UserProfile>>({});

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/me"],
    enabled: !!user,
  });

  const { data: orders = [] } = useQuery<any[]>({
    queryKey: ["/api/orders"],
    enabled: !!user,
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: Partial<UserProfile>) => {
      return await apiRequest("PATCH", `/api/profile`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleLogout = async () => {
    await logout();
  };

  const handleEditToggle = () => {
    if (!isEditing && profile) {
      setFormData({
        name: profile.name,
        email: profile.email,
        phone: profile.phone || "",
        storeName: profile.storeName || "",
        storeDescription: profile.storeDescription || "",
        storeBanner: profile.storeBanner || "",
        vehicleInfo: profile.vehicleInfo || { type: "", plateNumber: "", license: "" },
      });
    }
    setIsEditing(!isEditing);
  };

  const handleInputChange = (field: keyof UserProfile, value: string | any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVehicleInfoChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      vehicleInfo: {
        ...(prev.vehicleInfo || { type: "", plateNumber: "", license: "" }),
        [field]: value,
      },
    }));
  };

  const handleSaveProfile = () => {
    updateProfileMutation.mutate(formData);
  };

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, etc.)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);

    try {
      const formData = new FormData();
      formData.append('profileImage', file);

      const response = await fetch('/api/profile/upload-image', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();

      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });

      toast({
        title: "Profile picture updated",
        description: "Your profile picture has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload profile picture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingImage(false);
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header
          onSearch={(query) => navigate(`/products?search=${encodeURIComponent(query)}`)}
          onCartClick={() => navigate("/cart")}
          data-testid="header-profile"
        />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header
        onSearch={(query) => navigate(`/products?search=${encodeURIComponent(query)}`)}
        onCartClick={() => navigate("/cart")}
        data-testid="header-profile"
      />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="mb-8">
            <div className="flex items-center gap-6 mb-6">
              <div className="relative">
                <UserAvatar 
                  profileImage={profile?.profileImage || user?.profileImage}
                  name={user?.name || profile?.name}
                  email={user?.email}
                  size="lg"
                  className="h-24 w-24"
                />
                <Button
                  size="icon"
                  variant="secondary"
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full shadow-lg"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                  data-testid="button-upload-profile-picture"
                >
                  {isUploadingImage ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  data-testid="input-profile-picture"
                />
              </div>
              <div className="flex-1">
                <h1 className="text-3xl font-bold mb-1" data-testid="text-profile-username">
                  {profile?.name || user?.name || "User"}
                </h1>
                <p className="text-muted-foreground" data-testid="text-profile-email">
                  {profile?.email}
                </p>
                <p className="text-xs text-muted-foreground capitalize mt-1">
                  {profile?.role || user?.role} Account
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => navigate("/settings")}
                  data-testid="button-settings"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Settings
                </Button>
                <Button
                  variant="outline"
                  onClick={handleLogout}
                  data-testid="button-logout"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>

          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="profile" data-testid="tab-profile">
                <User className="h-4 w-4 mr-2" />
                Profile
              </TabsTrigger>
              <TabsTrigger value="orders" data-testid="tab-orders">
                <Package className="h-4 w-4 mr-2" />
                Orders
              </TabsTrigger>
              <TabsTrigger value="settings" data-testid="tab-settings">
                <Settings className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>

            <TabsContent value="profile" className="mt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Personal Information</CardTitle>
                      <CardDescription>
                        Manage your personal details and contact information
                      </CardDescription>
                    </div>
                    <Button
                      variant={isEditing ? "outline" : "default"}
                      onClick={handleEditToggle}
                      data-testid="button-edit-profile"
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        value={isEditing ? formData.name || "" : profile?.name || ""}
                        onChange={(e) => handleInputChange("name", e.target.value)}
                        disabled={!isEditing}
                        data-testid="input-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={isEditing ? formData.email || "" : profile?.email || ""}
                        onChange={(e) => handleInputChange("email", e.target.value)}
                        disabled={!isEditing}
                        data-testid="input-email"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={isEditing ? formData.phone || "" : profile?.phone || ""}
                        onChange={(e) => handleInputChange("phone", e.target.value)}
                        disabled={!isEditing}
                        placeholder="+233 XX XXX XXXX"
                        data-testid="input-phone"
                      />
                    </div>
                  </div>

                  {/* Seller-specific fields */}
                  {profile?.role === "seller" && (
                    <>
                      <div className="border-t pt-4 mt-4">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Store className="h-4 w-4" />
                          Store Information
                        </h3>
                        <div className="space-y-4">
                          <div>
                            <Label htmlFor="storeName">Store Name</Label>
                            <Input
                              id="storeName"
                              value={isEditing ? formData.storeName || "" : profile?.storeName || ""}
                              onChange={(e) => handleInputChange("storeName", e.target.value)}
                              disabled={!isEditing}
                              placeholder="Your store name"
                              data-testid="input-store-name"
                            />
                          </div>
                          <div>
                            <Label htmlFor="storeDescription">Store Description</Label>
                            <Textarea
                              id="storeDescription"
                              value={isEditing ? formData.storeDescription || "" : profile?.storeDescription || ""}
                              onChange={(e) => handleInputChange("storeDescription", e.target.value)}
                              disabled={!isEditing}
                              placeholder="Describe your store and products"
                              data-testid="input-store-description"
                              rows={3}
                            />
                          </div>
                          <div>
                            <Label htmlFor="storeBanner">Store Banner</Label>
                            {isEditing ? (
                              <MediaUploadInput
                                id="storeBanner"
                                label=""
                                value={formData.storeBanner || ""}
                                onChange={(value) => handleInputChange("storeBanner", value)}
                                accept="image"
                                placeholder="Upload or enter banner URL..."
                                description="Store banner image (recommended: 1200x300px)"
                                skip4KValidation
                                minDimensions={{ width: 800, height: 200 }}
                              />
                            ) : (
                              profile?.storeBanner ? (
                                <img 
                                  src={profile.storeBanner} 
                                  alt="Store banner" 
                                  className="w-full h-24 object-cover rounded-md mt-1"
                                />
                              ) : (
                                <p className="text-sm text-muted-foreground mt-1">No banner set</p>
                              )
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Rider-specific fields */}
                  {profile?.role === "rider" && (
                    <>
                      <div className="border-t pt-4 mt-4">
                        <h3 className="font-semibold mb-3 flex items-center gap-2">
                          <Truck className="h-4 w-4" />
                          Vehicle Information
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <Label htmlFor="vehicleType">Vehicle Type</Label>
                            <Input
                              id="vehicleType"
                              value={isEditing 
                                ? formData.vehicleInfo?.type || "" 
                                : profile?.vehicleInfo?.type || ""}
                              onChange={(e) => handleVehicleInfoChange("type", e.target.value)}
                              disabled={!isEditing}
                              placeholder="e.g., Motorcycle, Bicycle"
                              data-testid="input-vehicle-type"
                            />
                          </div>
                          <div>
                            <Label htmlFor="plateNumber">Plate Number</Label>
                            <Input
                              id="plateNumber"
                              value={isEditing 
                                ? formData.vehicleInfo?.plateNumber || "" 
                                : profile?.vehicleInfo?.plateNumber || ""}
                              onChange={(e) => handleVehicleInfoChange("plateNumber", e.target.value)}
                              disabled={!isEditing}
                              placeholder="Vehicle plate number"
                              data-testid="input-plate-number"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <Label htmlFor="license">Driver's License</Label>
                            <Input
                              id="license"
                              value={isEditing 
                                ? formData.vehicleInfo?.license || "" 
                                : profile?.vehicleInfo?.license || ""}
                              onChange={(e) => handleVehicleInfoChange("license", e.target.value)}
                              disabled={!isEditing}
                              placeholder="License number"
                              data-testid="input-license"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {isEditing && (
                    <div className="flex justify-end">
                      <Button
                        onClick={handleSaveProfile}
                        disabled={updateProfileMutation.isPending}
                        data-testid="button-save-profile"
                      >
                        {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="orders" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Order History</CardTitle>
                  <CardDescription>
                    View and track your recent orders
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {orders.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
                      <p className="text-muted-foreground mb-4">
                        Start shopping to see your orders here
                      </p>
                      <Button 
                        onClick={() => navigate("/")}
                        data-testid="button-start-shopping"
                      >
                        Start Shopping
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between p-4 border rounded-lg hover-elevate"
                          data-testid={`card-order-${order.id}`}
                        >
                          <div>
                            <p className="font-semibold">Order #{order.id}</p>
                            <p className="text-sm text-muted-foreground">
                              {order.createdAt}
                            </p>
                          </div>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => navigate(`/track`)}
                            data-testid={`button-view-order-${order.id}`}
                          >
                            View Details
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="settings" className="mt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Account Settings</CardTitle>
                  <CardDescription>
                    Manage your account preferences and security
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-semibold">Change Password</h4>
                        <p className="text-sm text-muted-foreground">
                          Update your password to keep your account secure
                        </p>
                      </div>
                      <Button 
                        variant="outline" 
                        onClick={() => navigate("/settings")}
                        data-testid="button-change-password"
                      >
                        Change
                      </Button>
                    </div>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                      <div>
                        <h4 className="font-semibold">Email Notifications</h4>
                        <p className="text-sm text-muted-foreground">
                          Manage your email notification preferences
                        </p>
                      </div>
                      <Button 
                        variant="outline"
                        onClick={() => navigate("/settings")}
                        data-testid="button-email-preferences"
                      >
                        Manage
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <Footer />
    </div>
  );
}
