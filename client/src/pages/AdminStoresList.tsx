import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, fetchApiJson, queryClient } from "@/lib/queryClient";
import DashboardLayout from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Search, Store, Plus, Edit, Trash2, ArrowLeft, Eye } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import MediaUploadInput from "@/components/MediaUploadInput";

interface StoreType {
  id: string;
  name: string;
  description: string | null;
  logo: string | null;
  primarySellerId: string | null;
  isActive: boolean;
  isApproved: boolean;
  createdAt: string;
}

interface Seller {
  id: string;
  name: string;
  email: string;
}

const storeTypeOptions = [
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
] as const;

const storeSchema = z.object({
  name: z.string().min(3, "Store name must be at least 3 characters"),
  description: z.string().min(10, "Description must be at least 10 characters"),
  logo: z.string().optional(),
  storeType: z.enum(["clothing", "electronics", "food_beverages", "beauty_cosmetics", "home_garden", "sports_fitness", "books_media", "toys_games", "automotive", "health_wellness"], {
    required_error: "Please select a store type",
  }),
  primarySellerId: z.string().min(1, "Please select a seller"),
});

type StoreFormData = z.infer<typeof storeSchema>;

function CreateStoreDialog({ sellers }: { sellers: Seller[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<StoreFormData>({
    resolver: zodResolver(storeSchema),
    defaultValues: {
      name: "",
      description: "",
      logo: "",
      storeType: undefined,
      primarySellerId: "",
    },
  });

  const createStoreMutation = useMutation({
    mutationFn: async (data: StoreFormData) => {
      const newStore = {
        name: data.name,
        description: data.description,
        logo: data.logo || "",
        storeType: data.storeType,
        primarySellerId: data.primarySellerId,
        isActive: true,
        isApproved: true,
      };
      return apiRequest("POST", "/api/stores", newStore);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Store created successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
      form.reset();
      setOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create store",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: StoreFormData) => {
    createStoreMutation.mutate(data);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="button-create-store" className="gap-2">
          <Plus className="h-4 w-4" />
          Create New Store
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create New Store</DialogTitle>
          <DialogDescription>
            Add a new store to the platform
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Amazing Store" {...field} data-testid="input-store-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Tell customers about this store..."
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
              name="logo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Logo (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://example.com/logo.png" {...field} data-testid="input-store-logo" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="storeType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-store-type">
                        <SelectValue placeholder="Select store type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {storeTypeOptions.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="primarySellerId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assign Seller</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-seller">
                        <SelectValue placeholder="Select a seller" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sellers.map((seller) => (
                        <SelectItem key={seller.id} value={seller.id}>
                          {seller.name} ({seller.email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                disabled={createStoreMutation.isPending}
                data-testid="button-submit-store"
              >
                {createStoreMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Create Store
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminStoresList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [, navigate] = useLocation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const { data: stores = [], isLoading: storesLoading } = useQuery<StoreType[]>({
    queryKey: ["/api/stores"],
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const { data: sellers = [] } = useQuery<Seller[]>({
    queryKey: ["/api/users", "seller"],
    queryFn: () => fetchApiJson<Seller[]>("/api/users?role=seller"),
    enabled: isAuthenticated && (user?.role === "admin" || user?.role === "super_admin"),
  });

  const deleteStoreMutation = useMutation({
    mutationFn: async (storeId: string) => {
      return apiRequest("DELETE", `/api/stores/${storeId}`);
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Store deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/stores"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete store",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this store?")) {
      deleteStoreMutation.mutate(id);
    }
  };

  const filteredStores = stores.filter(s => 
    (s.name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
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
              <h1 className="text-3xl font-bold text-foreground" data-testid="heading-stores">Stores Management</h1>
              <p className="text-muted-foreground mt-1">Manage all stores on the platform</p>
            </div>
            <CreateStoreDialog sellers={sellers} />
          </div>

          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search stores..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search-stores"
              />
            </div>
          </div>

          {storesLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filteredStores.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Store Name</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredStores.map((store) => (
                    <TableRow key={store.id} data-testid={`row-store-${store.id}`}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          {store.logo ? (
                            <img src={store.logo} alt={store.name} className="w-10 h-10 rounded-lg object-cover" />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Store className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <span data-testid={`text-name-${store.id}`}>{store.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs truncate" data-testid={`text-description-${store.id}`}>
                        {store.description || "No description"}
                      </TableCell>
                      <TableCell>
                        {store.isActive ? (
                          <Badge className="bg-green-500" data-testid={`badge-status-${store.id}`}>Active</Badge>
                        ) : (
                          <Badge variant="secondary" data-testid={`badge-status-${store.id}`}>Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell data-testid={`text-created-${store.id}`}>
                        {new Date(store.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => navigate(`/admin/stores/${store.id}`)}
                            data-testid={`button-view-${store.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => navigate(`/admin/store?id=${store.id}`)}
                            data-testid={`button-edit-${store.id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => handleDelete(store.id)}
                            data-testid={`button-delete-${store.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <div className="text-center py-12">
              <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground" data-testid="text-no-stores">
                {searchQuery ? "No stores found matching your search" : "No stores yet"}
              </p>
              {!searchQuery && (
                <div className="mt-4">
                  <CreateStoreDialog sellers={sellers} />
                </div>
              )}
            </div>
          )}
        </div>
    </DashboardLayout>
  );
}
