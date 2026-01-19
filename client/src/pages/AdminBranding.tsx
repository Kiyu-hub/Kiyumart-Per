import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Palette, Sun, Moon, ArrowLeft } from "lucide-react";

const brandingSchema = z.object({
  primaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  secondaryColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  accentColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  lightBgColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  lightTextColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  lightCardColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  darkBgColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  darkTextColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
  darkCardColor: z.string().regex(/^#([A-Fa-f0-9]{6})$/, "Must be a valid hex color"),
});

type BrandingFormData = z.infer<typeof brandingSchema>;

interface PlatformSettings extends BrandingFormData {
  id: string;
  platformName: string;
  updatedAt: string;
}

export default function AdminBranding() {
  const [activeTab, setActiveTab] = useState("general");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: settings, isLoading } = useQuery<PlatformSettings>({
    queryKey: ["/api/settings", user?.id],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const form = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    values: settings ? {
      primaryColor: settings.primaryColor || "#1e7b5f",
      secondaryColor: settings.secondaryColor || "#2c3e50",
      accentColor: settings.accentColor || "#e74c3c",
      lightBgColor: settings.lightBgColor || "#ffffff",
      lightTextColor: settings.lightTextColor || "#000000",
      lightCardColor: settings.lightCardColor || "#f8f9fa",
      darkBgColor: settings.darkBgColor || "#1a1a1a",
      darkTextColor: settings.darkTextColor || "#ffffff",
      darkCardColor: settings.darkCardColor || "#2a2a2a",
    } : undefined,
  });

  // Reset form if settings change externally
  useEffect(() => {
    if (settings) {
      form.reset({
        primaryColor: settings.primaryColor || "#1e7b5f",
        secondaryColor: settings.secondaryColor || "#2c3e50",
        accentColor: settings.accentColor || "#e74c3c",
        lightBgColor: settings.lightBgColor || "#ffffff",
        lightTextColor: settings.lightTextColor || "#000000",
        lightCardColor: settings.lightCardColor || "#f8f9fa",
        darkBgColor: settings.darkBgColor || "#1a1a1a",
        darkTextColor: settings.darkTextColor || "#ffffff",
        darkCardColor: settings.darkCardColor || "#2a2a2a",
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (data: BrandingFormData) => {
      return await apiRequest("PATCH", "/api/settings", data);
    },
    onSuccess: () => {
      // Invalidate with exact pattern to match the query key
      queryClient.invalidateQueries({ queryKey: ["/api/settings", user?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/platform-settings"] });
      // Also invalidate without user?.id for backwards compatibility
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({
        title: "Success",
        description: "Branding colors updated successfully",
      });
      // Force immediate refetch of platform settings for useBranding hook
      queryClient.refetchQueries({ queryKey: ["/api/platform-settings"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update branding",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BrandingFormData) => {
    updateMutation.mutate(data);
  };

  const resetToDefaults = () => {
    form.reset({
      primaryColor: "#1e7b5f",
      secondaryColor: "#2c3e50",
      accentColor: "#e74c3c",
      lightBgColor: "#ffffff",
      lightTextColor: "#000000",
      lightCardColor: "#f8f9fa",
      darkBgColor: "#1a1a1a",
      darkTextColor: "#ffffff",
      darkCardColor: "#2a2a2a",
    });
  };

  if (authLoading || isLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout role={user?.role as any}>
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
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="heading-branding">
                <Palette className="h-8 w-8" />
                Branding & Colors
              </h1>
              <p className="text-muted-foreground mt-1">Customize your platform's appearance and color scheme</p>
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full max-w-md grid-cols-3 mb-6">
                <TabsTrigger value="general" data-testid="tab-general">
                  <Palette className="h-4 w-4 mr-2" />
                  General
                </TabsTrigger>
                <TabsTrigger value="light" data-testid="tab-light">
                  <Sun className="h-4 w-4 mr-2" />
                  Light Mode
                </TabsTrigger>
                <TabsTrigger value="dark" data-testid="tab-dark">
                  <Moon className="h-4 w-4 mr-2" />
                  Dark Mode
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general">
                <Card>
                  <CardHeader>
                    <CardTitle>General Colors</CardTitle>
                    <CardDescription>
                      Define the primary colors used throughout your platform
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="primaryColor">Primary Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="primaryColor"
                            type="color"
                            {...form.register("primaryColor")}
                            className="w-20 h-10"
                            data-testid="input-primary-color"
                          />
                          <Input
                            type="text"
                            {...form.register("primaryColor")}
                            placeholder="#1e7b5f"
                            className="flex-1"
                            data-testid="input-primary-color-text"
                          />
                        </div>
                        {form.formState.errors.primaryColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.primaryColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Main brand color (buttons, links, highlights)</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="secondaryColor">Secondary Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="secondaryColor"
                            type="color"
                            {...form.register("secondaryColor")}
                            className="w-20 h-10"
                            data-testid="input-secondary-color"
                          />
                          <Input
                            type="text"
                            {...form.register("secondaryColor")}
                            placeholder="#2c3e50"
                            className="flex-1"
                            data-testid="input-secondary-color-text"
                          />
                        </div>
                        {form.formState.errors.secondaryColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.secondaryColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Supporting color for headers and text</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="accentColor">Accent Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="accentColor"
                            type="color"
                            {...form.register("accentColor")}
                            className="w-20 h-10"
                            data-testid="input-accent-color"
                          />
                          <Input
                            type="text"
                            {...form.register("accentColor")}
                            placeholder="#e74c3c"
                            className="flex-1"
                            data-testid="input-accent-color-text"
                          />
                        </div>
                        {form.formState.errors.accentColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.accentColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Accent color for notifications and badges</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="light">
                <Card>
                  <CardHeader>
                    <CardTitle>Light Mode Colors</CardTitle>
                    <CardDescription>
                      Customize colors for light mode theme
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="lightBgColor">Background Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="lightBgColor"
                            type="color"
                            {...form.register("lightBgColor")}
                            className="w-20 h-10"
                            data-testid="input-light-bg-color"
                          />
                          <Input
                            type="text"
                            {...form.register("lightBgColor")}
                            placeholder="#ffffff"
                            className="flex-1"
                            data-testid="input-light-bg-color-text"
                          />
                        </div>
                        {form.formState.errors.lightBgColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.lightBgColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Main background color for light mode</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="lightTextColor">Text Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="lightTextColor"
                            type="color"
                            {...form.register("lightTextColor")}
                            className="w-20 h-10"
                            data-testid="input-light-text-color"
                          />
                          <Input
                            type="text"
                            {...form.register("lightTextColor")}
                            placeholder="#000000"
                            className="flex-1"
                            data-testid="input-light-text-color-text"
                          />
                        </div>
                        {form.formState.errors.lightTextColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.lightTextColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Primary text color for light mode</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="lightCardColor">Card Background</Label>
                        <div className="flex gap-2">
                          <Input
                            id="lightCardColor"
                            type="color"
                            {...form.register("lightCardColor")}
                            className="w-20 h-10"
                            data-testid="input-light-card-color"
                          />
                          <Input
                            type="text"
                            {...form.register("lightCardColor")}
                            placeholder="#f8f9fa"
                            className="flex-1"
                            data-testid="input-light-card-color-text"
                          />
                        </div>
                        {form.formState.errors.lightCardColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.lightCardColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Background color for cards and panels</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="dark">
                <Card>
                  <CardHeader>
                    <CardTitle>Dark Mode Colors</CardTitle>
                    <CardDescription>
                      Customize colors for dark mode theme
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid gap-6 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="darkBgColor">Background Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="darkBgColor"
                            type="color"
                            {...form.register("darkBgColor")}
                            className="w-20 h-10"
                            data-testid="input-dark-bg-color"
                          />
                          <Input
                            type="text"
                            {...form.register("darkBgColor")}
                            placeholder="#1a1a1a"
                            className="flex-1"
                            data-testid="input-dark-bg-color-text"
                          />
                        </div>
                        {form.formState.errors.darkBgColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.darkBgColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Main background color for dark mode</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="darkTextColor">Text Color</Label>
                        <div className="flex gap-2">
                          <Input
                            id="darkTextColor"
                            type="color"
                            {...form.register("darkTextColor")}
                            className="w-20 h-10"
                            data-testid="input-dark-text-color"
                          />
                          <Input
                            type="text"
                            {...form.register("darkTextColor")}
                            placeholder="#ffffff"
                            className="flex-1"
                            data-testid="input-dark-text-color-text"
                          />
                        </div>
                        {form.formState.errors.darkTextColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.darkTextColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Primary text color for dark mode</p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="darkCardColor">Card Background</Label>
                        <div className="flex gap-2">
                          <Input
                            id="darkCardColor"
                            type="color"
                            {...form.register("darkCardColor")}
                            className="w-20 h-10"
                            data-testid="input-dark-card-color"
                          />
                          <Input
                            type="text"
                            {...form.register("darkCardColor")}
                            placeholder="#2a2a2a"
                            className="flex-1"
                            data-testid="input-dark-card-color-text"
                          />
                        </div>
                        {form.formState.errors.darkCardColor && (
                          <p className="text-sm text-destructive">{form.formState.errors.darkCardColor.message}</p>
                        )}
                        <p className="text-xs text-muted-foreground">Background color for cards and panels</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 mt-6">
              <Button
                type="submit"
                disabled={updateMutation.isPending}
                data-testid="button-save-branding"
                className="gap-2"
              >
                {updateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save Changes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={resetToDefaults}
                data-testid="button-reset-defaults"
              >
                Reset to Defaults
              </Button>
            </div>
          </form>
        </div>
    </DashboardLayout>
  );
}
