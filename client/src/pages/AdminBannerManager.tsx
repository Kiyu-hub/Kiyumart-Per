import { goBack } from "@/lib/navigation";
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, Image as ImageIcon, Calendar, Eye, ArrowLeft, Loader2 } from "lucide-react";
import type { BannerCollection, MarketplaceBanner } from "@shared/schema";

export default function AdminBannerManager() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [isCollectionDialogOpen, setIsCollectionDialogOpen] = useState(false);
  const [isBannerDialogOpen, setIsBannerDialogOpen] = useState(false);
  const [editingCollection, setEditingCollection] = useState<BannerCollection | null>(null);
  const [editingBanner, setEditingBanner] = useState<MarketplaceBanner | null>(null);

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: collections = [] } = useQuery<BannerCollection[]>({
    queryKey: ["/api/admin/banner-collections"],
  });

  const { data: banners = [] } = useQuery<MarketplaceBanner[]>({
    queryKey: ["/api/admin/marketplace-banners", selectedCollection],
  });

  const createCollectionMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/banner-collections", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/banner-collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      setIsCollectionDialogOpen(false);
      toast({ title: "Success", description: "Banner collection created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const createBannerMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch("/api/admin/marketplace-banners", {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to create banner");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/marketplace-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      setIsBannerDialogOpen(false);
      setEditingBanner(null);
      toast({ title: "Success", description: "Banner created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteBannerMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/marketplace-banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        predicate: (query) => query.queryKey[0] === "/api/admin/marketplace-banners"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/sellers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/homepage/featured-products"] });
      toast({ title: "Success", description: "Banner deleted" });
    },
  });

  const handleCreateCollection = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createCollectionMutation.mutate({
      name: formData.get("name"),
      description: formData.get("description"),
      type: formData.get("type"),
      isActive: formData.get("isActive") === "on",
    });
  };

  const handleCreateBanner = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    createBannerMutation.mutate(formData);
  };

  if (authLoading || !isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin")) {
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
              onClick={() => goBack()}
              data-testid="button-back"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold">Banner Management</h1>
              <p className="text-muted-foreground mt-1">Manage marketplace banners and collections</p>
            </div>
          </div>

          <Tabs defaultValue="banners" className="space-y-6">
            <TabsList>
              <TabsTrigger value="banners" data-testid="tab-banners">Banners</TabsTrigger>
              <TabsTrigger value="collections" data-testid="tab-collections">Collections</TabsTrigger>
            </TabsList>

            <TabsContent value="banners" className="space-y-6">
              <div className="flex justify-between items-center">
                <div className="flex gap-4">
                  <Select value={selectedCollection || "all"} onValueChange={(v) => setSelectedCollection(v === "all" ? null : v)}>
                    <SelectTrigger className="w-64" data-testid="select-collection-filter">
                      <SelectValue placeholder="Filter by collection" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Banners</SelectItem>
                      {collections.map((col) => (
                        <SelectItem key={col.id} value={col.id!}>
                          {col.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Dialog open={isBannerDialogOpen} onOpenChange={setIsBannerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-banner">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Banner
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Banner</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateBanner} className="space-y-4">
                      <div>
                        <Label htmlFor="banner-image">Image *</Label>
                        <Input id="banner-image" name="image" type="file" accept="image/*" required data-testid="input-banner-image" />
                      </div>
                      <div>
                        <Label htmlFor="banner-title">Title</Label>
                        <Input id="banner-title" name="title" placeholder="Black Friday Blowout" data-testid="input-banner-title" />
                      </div>
                      <div>
                        <Label htmlFor="banner-subtitle">Subtitle</Label>
                        <Textarea id="banner-subtitle" name="subtitle" placeholder="Deals across categories" data-testid="input-banner-subtitle" />
                      </div>
                      <div>
                        <Label htmlFor="banner-cta">CTA Text</Label>
                        <Input id="banner-cta" name="ctaText" placeholder="Shop Deals" data-testid="input-banner-cta" />
                      </div>
                      <div>
                        <Label htmlFor="banner-url">CTA URL</Label>
                        <Input id="banner-url" name="ctaUrl" placeholder="/search?tag=black-friday" data-testid="input-banner-url" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="banner-start">Start Date</Label>
                          <Input id="banner-start" name="startAt" type="datetime-local" data-testid="input-banner-start" />
                        </div>
                        <div>
                          <Label htmlFor="banner-end">End Date</Label>
                          <Input id="banner-end" name="endAt" type="datetime-local" data-testid="input-banner-end" />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="banner-collection">Collection</Label>
                        <Select name="collectionId">
                          <SelectTrigger data-testid="select-banner-collection">
                            <SelectValue placeholder="Select collection" />
                          </SelectTrigger>
                          <SelectContent>
                            {collections.map((col) => (
                              <SelectItem key={col.id} value={col.id!}>
                                {col.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="banner-active" name="isActive" defaultChecked data-testid="switch-banner-active" />
                        <Label htmlFor="banner-active">Active</Label>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={createBannerMutation.isPending} data-testid="button-submit-banner">
                          Create Banner
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {banners.map((banner) => (
                  <Card key={banner.id} data-testid={`card-banner-${banner.id}`}>
                    <CardContent className="p-0">
                      <div className="relative aspect-[16/9]">
                        <img
                          src={banner.imageUrl}
                          alt={banner.title || "Banner"}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2 right-2 flex gap-2">
                          {banner.isActive ? (
                            <Badge variant="default">Active</Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </div>
                      </div>
                      <div className="p-4 space-y-2">
                        <h3 className="font-semibold truncate">{banner.title || "Untitled"}</h3>
                        {banner.subtitle && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{banner.subtitle}</p>
                        )}
                        <div className="flex gap-2 pt-2">
                          <Button size="sm" variant="outline" onClick={() => deleteBannerMutation.mutate(banner.id!)} data-testid={`button-delete-banner-${banner.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="collections" className="space-y-6">
              <div className="flex justify-end">
                <Dialog open={isCollectionDialogOpen} onOpenChange={setIsCollectionDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-create-collection">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Collection
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Collection</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleCreateCollection} className="space-y-4">
                      <div>
                        <Label htmlFor="collection-name">Name *</Label>
                        <Input id="collection-name" name="name" required placeholder="Black Friday 2025" data-testid="input-collection-name" />
                      </div>
                      <div>
                        <Label htmlFor="collection-description">Description</Label>
                        <Textarea id="collection-description" name="description" placeholder="Black Friday promotional banners" data-testid="input-collection-description" />
                      </div>
                      <div>
                        <Label htmlFor="collection-type">Type</Label>
                        <Input id="collection-type" name="type" placeholder="promotional" data-testid="input-collection-type" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch id="collection-active" name="isActive" data-testid="switch-collection-active" />
                        <Label htmlFor="collection-active">Active</Label>
                      </div>
                      <DialogFooter>
                        <Button type="submit" disabled={createCollectionMutation.isPending} data-testid="button-submit-collection">
                          Create Collection
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>

              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {collections.map((collection) => (
                  <Card key={collection.id} data-testid={`card-collection-${collection.id}`}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <CardTitle className="text-lg">{collection.name}</CardTitle>
                        {collection.isActive ? (
                          <Badge variant="default">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      {collection.description && (
                        <p className="text-sm text-muted-foreground mb-4">{collection.description}</p>
                      )}
                      {collection.type && (
                        <Badge variant="outline" className="mb-2">{collection.type}</Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </div>
    </DashboardLayout>
  );
}
