import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import DashboardLayout from "@/components/DashboardLayout";
import MediaUploadInput from "@/components/MediaUploadInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Loader2, Plus, MoreHorizontal, Pencil, Trash2, Eye, Store, Layers, ArrowLeft, Check, ChevronsUpDown, Package, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface HeroBanner {
  id: string;
  title: string;
  subtitle: string | null;
  image: string;
  ctaText: string | null;
  ctaLink: string | null;
  storeMode: "single" | "multivendor" | "both";
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
}

interface StoreInfo {
  id: string;
  name: string;
  isActive: boolean;
}

interface ProductInfo {
  id: string;
  name: string;
  storeId: string | null;
  sellerId: string;
  images: string[];
  price: string;
  isActive: boolean;
}

interface BannerFormData {
  title: string;
  subtitle: string;
  image: string;
  ctaText: string;
  ctaLink: string;
  storeMode: "single" | "multivendor" | "both";
  isActive: boolean;
  displayOrder: number;
}

const defaultFormData: BannerFormData = {
  title: "",
  subtitle: "",
  image: "",
  ctaText: "",
  ctaLink: "",
  storeMode: "both",
  isActive: true,
  displayOrder: 0,
};

export default function AdminHeroBanners() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<HeroBanner | null>(null);
  const [formData, setFormData] = useState<BannerFormData>(defaultFormData);
  const [bannerToDelete, setBannerToDelete] = useState<HeroBanner | null>(null);
  
  // Product selector state
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  // Fetch banners
  const { data: banners = [], isLoading } = useQuery<HeroBanner[]>({
    queryKey: ["/api/admin/hero-banners"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Fetch stores for product selector
  const { data: stores = [] } = useQuery<StoreInfo[]>({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Fetch all products
  const { data: allProducts = [] } = useQuery<ProductInfo[]>({
    queryKey: ["/api/products"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  // Filter products by selected store and search term
  const filteredProducts = useMemo(() => {
    let products = allProducts.filter(p => p.isActive);
    
    if (selectedStoreId && selectedStoreId !== "all") {
      products = products.filter(p => p.storeId === selectedStoreId);
    }
    
    if (productSearch) {
      const searchLower = productSearch.toLowerCase();
      products = products.filter(p => 
        p.name.toLowerCase().includes(searchLower)
      );
    }
    
    return products.slice(0, 50); // Limit to 50 for performance
  }, [allProducts, selectedStoreId, productSearch]);

  // Get store name by ID
  const getStoreName = (storeId: string | null) => {
    if (!storeId) return "No Store";
    const store = stores.find(s => s.id === storeId);
    return store?.name || "Unknown Store";
  };

  // Create banner mutation
  const createMutation = useMutation({
    mutationFn: async (data: BannerFormData) => {
      return apiRequest("POST", "/api/admin/hero-banners", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hero-banners"] });
      toast({ title: "Success", description: "Banner created successfully" });
      setDialogOpen(false);
      setFormData(defaultFormData);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update banner mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BannerFormData> }) => {
      return apiRequest("PATCH", `/api/admin/hero-banners/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hero-banners"] });
      toast({ title: "Success", description: "Banner updated successfully" });
      setDialogOpen(false);
      setEditingBanner(null);
      setFormData(defaultFormData);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete banner mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/admin/hero-banners/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hero-banners"] });
      toast({ title: "Success", description: "Banner deleted successfully" });
      setDeleteDialogOpen(false);
      setBannerToDelete(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest("PATCH", `/api/admin/hero-banners/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/hero-banners"] });
      queryClient.invalidateQueries({ queryKey: ["/api/hero-banners"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleOpenDialog = (banner?: HeroBanner) => {
    if (banner) {
      setEditingBanner(banner);
      setFormData({
        title: banner.title,
        subtitle: banner.subtitle || "",
        image: banner.image,
        ctaText: banner.ctaText || "",
        ctaLink: banner.ctaLink || "",
        storeMode: banner.storeMode || "both",
        isActive: banner.isActive,
        displayOrder: banner.displayOrder,
      });
    } else {
      setEditingBanner(null);
      setFormData(defaultFormData);
    }
    // Reset product selector state
    setSelectedStoreId("");
    setProductSearch("");
    setDialogOpen(true);
  };

  // Handle product selection - auto-fill ctaLink
  const handleProductSelect = (product: ProductInfo) => {
    const productUrl = `/product/${product.id}`;
    setFormData({ ...formData, ctaLink: productUrl });
    setProductSearchOpen(false);
    setProductSearch("");
    toast({ title: "Product Selected", description: `Link set to ${product.name}` });
  };

  const handleSubmit = () => {
    if (!formData.title || !formData.image) {
      toast({ title: "Error", description: "Title and image are required", variant: "destructive" });
      return;
    }

    if (editingBanner) {
      updateMutation.mutate({ id: editingBanner.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (banner: HeroBanner) => {
    setBannerToDelete(banner);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (bannerToDelete) {
      deleteMutation.mutate(bannerToDelete.id);
    }
  };

  const getStoreModeBadge = (mode: string) => {
    switch (mode) {
      case "single":
        return <Badge variant="outline" className="gap-1"><Store className="h-3 w-3" /> Single Store</Badge>;
      case "multivendor":
        return <Badge variant="secondary" className="gap-1"><Layers className="h-3 w-3" /> Multi-Vendor</Badge>;
      case "both":
        return <Badge className="gap-1 bg-primary"><Store className="h-3 w-3" /> Both Modes</Badge>;
      default:
        return <Badge variant="outline">{mode}</Badge>;
    }
  };

  if (authLoading || isLoading) {
    return (
      <DashboardLayout role={user?.role as any}>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout role={user?.role as any}>
      <div className="p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/settings")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">Hero Banner Management</h1>
            <p className="text-muted-foreground">
              Create and manage homepage banners for different store modes
            </p>
          </div>
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4 mr-2" />
            Add Banner
          </Button>
        </div>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Store Mode Settings</CardTitle>
            <CardDescription>
              Choose which store mode each banner should appear in:
              <ul className="mt-2 space-y-1 list-disc list-inside text-sm">
                <li><strong>Single Store:</strong> Banners appear only when platform is in single-store mode</li>
                <li><strong>Multi-Vendor:</strong> Banners appear only when platform is in multi-vendor mode</li>
                <li><strong>Both Modes:</strong> Banners appear in both store modes</li>
              </ul>
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Banners Table */}
        <Card>
          <CardContent className="p-0">
            {banners.length === 0 ? (
              <div className="text-center py-12">
                <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No banners yet</h3>
                <p className="text-muted-foreground mb-4">
                  Create your first hero banner to display on the homepage.
                </p>
                <Button onClick={() => handleOpenDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Banner
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px]">Preview</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Store Mode</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {banners.map((banner) => (
                    <TableRow key={banner.id}>
                      <TableCell>
                        <div className="w-20 h-12 rounded overflow-hidden bg-muted">
                          <img
                            src={banner.image}
                            alt={banner.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{banner.title}</p>
                          {banner.subtitle && (
                            <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                              {banner.subtitle}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStoreModeBadge(banner.storeMode)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{banner.displayOrder}</Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={banner.isActive}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: banner.id, isActive: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleOpenDialog(banner)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => window.open(banner.image, "_blank")}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              View Image
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(banner)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingBanner ? "Edit Banner" : "Create New Banner"}
            </DialogTitle>
            <DialogDescription>
              {editingBanner
                ? "Update the banner details below"
                : "Fill in the details to create a new hero banner"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Summer Sale"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="storeMode">Store Mode *</Label>
                <Select
                  value={formData.storeMode}
                  onValueChange={(value: "single" | "multivendor" | "both") =>
                    setFormData({ ...formData, storeMode: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select store mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4" />
                        Single Store Only
                      </div>
                    </SelectItem>
                    <SelectItem value="multivendor">
                      <div className="flex items-center gap-2">
                        <Layers className="h-4 w-4" />
                        Multi-Vendor Only
                      </div>
                    </SelectItem>
                    <SelectItem value="both">
                      <div className="flex items-center gap-2">
                        <Store className="h-4 w-4" />
                        Both Modes
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={formData.subtitle}
                onChange={(e) => setFormData({ ...formData, subtitle: e.target.value })}
                placeholder="Up to 50% off on selected items"
              />
            </div>

            <MediaUploadInput
              id="banner-image"
              label="Banner Image *"
              value={formData.image}
              onChange={(value) => setFormData({ ...formData, image: value })}
              accept="image"
              placeholder="https://example.com/banner.jpg"
              description="Upload a banner image (min 800×300px)"
              skip4KValidation
              minDimensions={{ width: 800, height: 300 }}
              mediaCategory="banner"
            />

            <div className="space-y-2">
              <Label htmlFor="ctaText">Button Text</Label>
              <Input
                id="ctaText"
                value={formData.ctaText}
                onChange={(e) => setFormData({ ...formData, ctaText: e.target.value })}
                placeholder="Shop Now"
              />
            </div>

            {/* Product Selector Section */}
            <div className="p-4 border rounded-lg bg-muted/30 space-y-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Product Link Selector</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Select a store and product to auto-fill the button link, or enter a custom link below.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Store Selector */}
                <div className="space-y-2">
                  <Label>Filter by Store</Label>
                  <Select
                    value={selectedStoreId}
                    onValueChange={setSelectedStoreId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Stores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stores</SelectItem>
                      {stores.filter(s => s.isActive).map((store) => (
                        <SelectItem key={store.id} value={store.id}>
                          <div className="flex items-center gap-2">
                            <Store className="h-3 w-3" />
                            {store.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Product Search Dropdown */}
                <div className="space-y-2">
                  <Label>Select Product</Label>
                  <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={productSearchOpen}
                        className="w-full justify-between"
                      >
                        <span className="flex items-center gap-2 truncate">
                          <Search className="h-3 w-3 text-muted-foreground" />
                          Search products...
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Search products by name..." 
                          value={productSearch}
                          onValueChange={setProductSearch}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {allProducts.length === 0 ? "Loading products..." : "No products found."}
                          </CommandEmpty>
                          <CommandGroup heading={`Products${selectedStoreId && selectedStoreId !== "all" ? ` in ${getStoreName(selectedStoreId)}` : ""}`}>
                            {filteredProducts.map((product) => (
                              <CommandItem
                                key={product.id}
                                value={product.id}
                                onSelect={() => handleProductSelect(product)}
                                className="flex items-center gap-3 py-3"
                              >
                                <div className="w-10 h-10 rounded bg-muted overflow-hidden flex-shrink-0">
                                  {product.images?.[0] ? (
                                    <img
                                      src={product.images[0]}
                                      alt={product.name}
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Package className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{product.name}</p>
                                  <p className="text-xs text-muted-foreground truncate">
                                    {getStoreName(product.storeId)} • GH₵{parseFloat(product.price).toFixed(2)}
                                  </p>
                                </div>
                                <Check
                                  className={cn(
                                    "h-4 w-4",
                                    formData.ctaLink === `/product/${product.id}` ? "opacity-100" : "opacity-0"
                                  )}
                                />
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="ctaLink">Button Link (Manual Override)</Label>
              <Input
                id="ctaLink"
                value={formData.ctaLink}
                onChange={(e) => setFormData({ ...formData, ctaLink: e.target.value })}
                placeholder="/products?category=sale or https://external-link.com"
              />
              <p className="text-xs text-muted-foreground">
                Auto-filled when selecting a product, or enter any custom URL
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="displayOrder">Display Order</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={formData.displayOrder}
                  onChange={(e) =>
                    setFormData({ ...formData, displayOrder: parseInt(e.target.value) || 0 })
                  }
                  placeholder="0"
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first
                </p>
              </div>
              
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center space-x-2 pt-2">
                  <Switch
                    checked={formData.isActive}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, isActive: checked })
                    }
                  />
                  <Label className="font-normal">
                    {formData.isActive ? "Active" : "Inactive"}
                  </Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : editingBanner ? (
                "Update Banner"
              ) : (
                "Create Banner"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Banner</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{bannerToDelete?.title}"? This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
