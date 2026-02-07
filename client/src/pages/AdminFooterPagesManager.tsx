import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertFooterPageSchema } from "@shared/schema";
import { z } from "zod";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Edit, Trash2, ArrowLeft, Loader2, Eye, EyeOff, Store, Globe, LayoutGrid } from "lucide-react";
import type { FooterPage } from "@shared/schema";

const FOOTER_GROUPS = [
  { value: "quick_links", label: "Quick Links / Marketplace" },
  { value: "customer_service", label: "Customer Service" },
  { value: "legal", label: "Legal" },
  { value: "trust_bar", label: "Trust Bar" },
  { value: "general", label: "General" },
];

const STORE_MODES = [
  { value: "both", label: "Both Modes", icon: Globe },
  { value: "single", label: "Single Store", icon: Store },
  { value: "multivendor", label: "Multi-Vendor", icon: LayoutGrid },
];

const footerPageFormSchema = insertFooterPageSchema.extend({
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  title: z.string().min(1, "Title is required"),
  content: z.string().optional(),
  url: z.string().optional(),
  group: z.string().optional(),
  storeMode: z.string().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  openInNewTab: z.boolean().optional(),
});

type FooterPageFormData = z.infer<typeof footerPageFormSchema>;

export default function AdminFooterPagesManager() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<FooterPage | null>(null);
  const [storeModeFilter, setStoreModeFilter] = useState<string>("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const { data: pages = [], isLoading } = useQuery<FooterPage[]>({
    queryKey: ["/api/admin/footer-pages"],
  });

  const { data: settings } = useQuery<{ isMultiVendor?: boolean }>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (!authLoading && (!isAuthenticated || (user?.role !== "admin" && user?.role !== "super_admin"))) {
      navigate("/auth");
    }
  }, [isAuthenticated, authLoading, user, navigate]);

  const form = useForm<FooterPageFormData>({
    resolver: zodResolver(footerPageFormSchema),
    defaultValues: {
      title: "",
      slug: "",
      content: "",
      url: "",
      group: "general",
      storeMode: "both",
      displayOrder: 0,
      isActive: true,
      openInNewTab: false,
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: FooterPageFormData) => {
      const response = await apiRequest("POST", "/api/admin/footer-pages", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      setIsDialogOpen(false);
      setEditingPage(null);
      form.reset();
      toast({ title: "Success", description: "Footer item created successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: FooterPageFormData }) => {
      const response = await apiRequest("PATCH", `/api/admin/footer-pages/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      setIsDialogOpen(false);
      setEditingPage(null);
      form.reset();
      toast({ title: "Success", description: "Footer item updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/admin/footer-pages/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      toast({ title: "Success", description: "Footer item deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const toggleVisibilityMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const response = await apiRequest("PATCH", `/api/admin/footer-pages/${id}`, { isActive });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/footer-pages"] });
      queryClient.invalidateQueries({ queryKey: ["/api/footer-pages"] });
      toast({ title: "Visibility updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleEdit = (page: FooterPage) => {
    setEditingPage(page);
    form.reset({
      title: page.title,
      slug: page.slug,
      content: page.content || "",
      url: page.url || "",
      group: page.group || "general",
      storeMode: (page as any).storeMode || "both",
      displayOrder: page.displayOrder || 0,
      isActive: page.isActive ?? true,
      openInNewTab: page.openInNewTab ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this item?")) {
      deleteMutation.mutate(id);
    }
  };

  const onSubmit = (data: FooterPageFormData) => {
    if (editingPage) {
      updateMutation.mutate({ id: editingPage.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleOpenDialog = () => {
    setEditingPage(null);
    form.reset({
      title: "",
      slug: "",
      content: "",
      url: "",
      group: "general",
      storeMode: "both",
      displayOrder: pages.length,
      isActive: true,
      openInNewTab: false,
    });
    setIsDialogOpen(true);
  };

  const handleTitleChange = (title: string) => {
    if (!editingPage) {
      const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").trim();
      form.setValue("slug", slug);
    }
  };

  // Filtering
  const filteredPages = pages.filter((page) => {
    const sm = (page as any).storeMode || "both";
    const matchesStore = storeModeFilter === "all" || sm === storeModeFilter || sm === "both";
    const matchesGroup = groupFilter === "all" || (page.group || "general") === groupFilter;
    return matchesStore && matchesGroup;
  });

  const groupedPages = filteredPages.reduce((acc, page) => {
    const g = page.group || "general";
    if (!acc[g]) acc[g] = [];
    acc[g].push(page);
    return acc;
  }, {} as Record<string, FooterPage[]>);

  const getGroupLabel = (g: string) => FOOTER_GROUPS.find(f => f.value === g)?.label || g;
  const getStoreModeLabel = (m: string) => STORE_MODES.find(s => s.value === m)?.label || m;
  const getStoreModeBadgeClass = (m: string) => {
    if (m === "single") return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
    if (m === "multivendor") return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
    return "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20";
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
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => window.history.back()} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">Footer Manager</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage all footer sections & links. Changes appear instantly on the storefront.
            </p>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Store Mode:</span>
            <Select value={storeModeFilter} onValueChange={setStoreModeFilter}>
              <SelectTrigger className="w-[160px]" data-testid="select-store-mode-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modes</SelectItem>
                {STORE_MODES.map(m => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">Section:</span>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-[200px]" data-testid="select-group-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sections</SelectItem>
                {FOOTER_GROUPS.map(g => (
                  <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1" />

          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={handleOpenDialog} data-testid="button-add-page">
                <Plus className="mr-2 h-4 w-4" />
                Add Footer Item
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingPage ? "Edit Footer Item" : "Create Footer Item"}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField control={form.control} name="title" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input {...field} onChange={(e) => { field.onChange(e); handleTitleChange(e.target.value); }} placeholder="e.g., Returns & Refunds" data-testid="input-title" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="slug" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Slug (URL)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., returns-refunds" data-testid="input-slug" />
                      </FormControl>
                      {editingPage && <p className="text-xs text-muted-foreground">Changing the slug will update the page URL.</p>}
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <FormField control={form.control} name="group" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Footer Section</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-group"><SelectValue placeholder="Select section" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FOOTER_GROUPS.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="storeMode" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Store Mode</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-store-mode"><SelectValue placeholder="Select mode" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {STORE_MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Controls which storefront this link appears on</p>
                        <FormMessage />
                      </FormItem>
                    )} />
                  </div>

                  <FormField control={form.control} name="url" render={({ field }) => (
                    <FormItem>
                      <FormLabel>External URL (optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="https://... (leave empty for internal page)" data-testid="input-url" />
                      </FormControl>
                      <p className="text-xs text-muted-foreground">If blank, visitors see the content at /page/{form.watch("slug")}</p>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <FormField control={form.control} name="content" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Page Content (HTML)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={8} placeholder="Enter page content (HTML supported)..." data-testid="textarea-content" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />

                  <div className="grid grid-cols-3 gap-4">
                    <FormField control={form.control} name="displayOrder" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Order</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} onChange={(e) => field.onChange(parseInt(e.target.value))} data-testid="input-display-order" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="isActive" render={({ field }) => (
                      <FormItem className="flex flex-col justify-end">
                        <FormLabel>Visible</FormLabel>
                        <FormControl>
                          <div className="flex items-center space-x-2">
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-is-active" />
                            <span className="text-sm">{field.value ? "Yes" : "No"}</span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )} />

                    <FormField control={form.control} name="openInNewTab" render={({ field }) => (
                      <FormItem className="flex flex-col justify-end">
                        <FormLabel>New Tab</FormLabel>
                        <FormControl>
                          <div className="flex items-center space-x-2">
                            <Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-new-tab" />
                            <span className="text-sm">{field.value ? "Yes" : "No"}</span>
                          </div>
                        </FormControl>
                      </FormItem>
                    )} />
                  </div>

                  <DialogFooter>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-save">
                      {(createMutation.isPending || updateMutation.isPending) ? (
                        <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                      ) : editingPage ? "Update" : "Create"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Mode indicator */}
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border text-sm">
          <Store className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">Current store mode:</span>
          <Badge variant="outline" className={settings?.isMultiVendor ? "border-purple-500 text-purple-500" : "border-blue-500 text-blue-500"}>
            {settings?.isMultiVendor ? "Multi-Vendor Marketplace" : "Single Store"}
          </Badge>
          <span className="text-muted-foreground">•</span>
          <span className="text-muted-foreground">{filteredPages.length} of {pages.length} items</span>
        </div>

        {/* Footer Items by section */}
        {Object.keys(groupedPages).length > 0 ? (
          Object.entries(groupedPages)
            .sort(([a], [b]) => {
              const order = FOOTER_GROUPS.map(g => g.value);
              return (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b));
            })
            .map(([group, gPages]) => (
              <div key={group} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-semibold">{getGroupLabel(group)}</h3>
                  <Badge variant="secondary" className="text-xs">{gPages.length}</Badge>
                </div>
                <div className="grid gap-2">
                  {gPages.sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0)).map((page) => (
                    <Card key={page.id} className={`transition-all ${!page.isActive ? 'opacity-60' : ''}`} data-testid={`card-page-${page.id}`}>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3 px-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm" data-testid={`text-page-title-${page.id}`}>{page.title}</span>
                            {page.isActive ? (
                              <Badge variant="default" className="text-[10px] h-5">Active</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] h-5">Hidden</Badge>
                            )}
                            <Badge variant="outline" className={`text-[10px] h-5 ${getStoreModeBadgeClass((page as any).storeMode || 'both')}`}>
                              {getStoreModeLabel((page as any).storeMode || 'both')}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {page.url || `/page/${page.slug}`} • Order: {page.displayOrder}
                          </p>
                        </div>
                        <div className="flex gap-1 ml-2 shrink-0">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleVisibilityMutation.mutate({ id: page.id, isActive: !page.isActive })}>
                            {page.isActive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(page)}>
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(page.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              </div>
            ))
        ) : (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground" data-testid="text-empty-state">
              {pages.length === 0 ? "No footer items yet. Click \"Add Footer Item\" to create one." : "No items match the current filters."}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
