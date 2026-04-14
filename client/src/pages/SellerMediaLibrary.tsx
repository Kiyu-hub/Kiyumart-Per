import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Trash2, Copy, Loader2, Image as ImageIcon, Check, FolderOpen, Link as LinkIcon } from "lucide-react";
import type { MediaLibrary } from "@shared/schema";

export default function SellerMediaLibrary() {
  const { toast } = useToast();
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<"file" | "url" | "library">("file");
  const [uploadForm, setUploadForm] = useState({
    url: "",
    filename: "",
    altText: "",
    tags: "",
  });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const { data: mediaItems = [], isLoading } = useQuery<MediaLibrary[]>({
    queryKey: ["/api/media-library", "product"],
    queryFn: async () => {
      const res = await fetch("/api/media-library?category=product");
      const data = await res.json();
      // Ensure we always return an array
      return Array.isArray(data) ? data : [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (data: typeof uploadForm) => {
      return apiRequest("POST", "/api/media-library", {
        ...data,
        category: "product",
        tags: data.tags ? data.tags.split(",").map(t => t.trim()) : [],
        isTemporary: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media-library"] });
      toast({
        title: "Success",
        description: "Product image uploaded successfully",
      });
      setUploadDialogOpen(false);
      setUploadForm({
        url: "",
        filename: "",
        altText: "",
        tags: "",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload image",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("DELETE", `/api/media-library/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media-library"] });
      setSelectedImages(new Set());
      toast({
        title: "Success",
        description: "Image deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete image",
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/media-library/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/media-library"] });
      setSelectedImages(new Set());
      toast({
        title: "Success",
        description: `${selectedImages.size} items deleted successfully`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete images",
        variant: "destructive",
      });
    },
  });

  const toggleImageSelection = (id: string) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedImages(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedImages.size === mediaItems.length) {
      setSelectedImages(new Set());
    } else {
      setSelectedImages(new Set(mediaItems.map(item => item.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedImages.size === 0) return;
    
    if (confirm(`Are you sure you want to delete ${selectedImages.size} selected item(s)?`)) {
      bulkDeleteMutation.mutate(Array.from(selectedImages));
    }
  };

  const copyToClipboard = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    toast({
      title: "Copied!",
      description: "Image URL copied to clipboard",
    });
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setIsUploading(true);
      const res = await fetch("/api/upload/image", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || !payload?.url) {
        throw new Error(payload?.error || "Could not upload image");
      }

      setUploadForm((prev) => ({
        ...prev,
        url: payload.url,
        filename: prev.filename || file.name,
      }));
      toast({
        title: "Upload successful",
        description: "Image uploaded. Review the details and click Save.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error?.message || "Could not upload image",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      void handleFileUpload(file);
    }
  };

  return (
    <DashboardLayout role="seller" showBackButton>
      <div className="p-6 space-y-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mediaItems.length > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                data-testid="button-select-all"
              >
                {selectedImages.size === mediaItems.length ? "Deselect All" : "Select All"}
              </Button>
              {selectedImages.size > 0 && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-bulk-delete"
                >
                  {bulkDeleteMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete ({selectedImages.size})
                    </>
                  )}
                </Button>
              )}
            </>
          )}
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-upload-media">
                <Upload className="mr-2 h-4 w-4" />
                Upload Image
              </Button>
            </DialogTrigger>
                <DialogContent data-testid="dialog-upload-media">
                  <DialogHeader>
                    <DialogTitle>Upload Product Image</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Tabs value={uploadMode} onValueChange={(v) => setUploadMode(v as "file" | "url" | "library")}>
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="file">
                          <Upload className="mr-2 h-4 w-4" />
                          Upload File
                        </TabsTrigger>
                        <TabsTrigger value="url">
                          <LinkIcon className="mr-2 h-4 w-4" />
                          Enter URL
                        </TabsTrigger>
                        <TabsTrigger value="library">
                          <FolderOpen className="mr-2 h-4 w-4" />
                          Library
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="file" className="mt-4">
                        <div
                          onDragOver={handleDragOver}
                          onDragLeave={handleDragLeave}
                          onDrop={handleDrop}
                          className={`rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                            isDragging ? "border-primary bg-primary/5" : "border-border/70 hover:border-primary/50"
                          } ${isUploading ? "pointer-events-none opacity-60" : "cursor-pointer"}`}
                          onClick={() => document.getElementById("seller-media-file-upload")?.click()}
                        >
                          <input
                            id="seller-media-file-upload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            disabled={isUploading}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                void handleFileUpload(file);
                              }
                              e.currentTarget.value = "";
                            }}
                          />
                          {isUploading ? (
                            <div className="flex flex-col items-center gap-2">
                              <Loader2 className="h-8 w-8 animate-spin text-primary" />
                              <p className="text-sm text-muted-foreground">Uploading to Cloudinary...</p>
                            </div>
                          ) : uploadForm.url ? (
                            <div className="flex flex-col items-center gap-2">
                              <Check className="h-8 w-8 text-green-500" />
                              <p className="text-sm font-medium text-green-600">Image uploaded</p>
                              <img src={uploadForm.url} alt="Preview" className="mt-2 max-h-24 rounded border" />
                              <p className="text-xs text-muted-foreground">Click to upload a different image</p>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-2">
                              <Upload className="h-8 w-8 text-muted-foreground" />
                              <p className="text-sm font-medium">Drop image here or click to browse</p>
                              <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</p>
                            </div>
                          )}
                        </div>
                      </TabsContent>

                      <TabsContent value="url" className="mt-4">
                        <div>
                          <Label htmlFor="url">Image URL *</Label>
                          <Input
                            id="url"
                            value={uploadForm.url}
                            onChange={(e) => setUploadForm({ ...uploadForm, url: e.target.value })}
                            placeholder="https://example.com/product-image.jpg"
                            data-testid="input-media-url"
                          />
                          <p className="text-xs text-muted-foreground mt-1">
                            Paste an external image URL if the file is already hosted elsewhere.
                          </p>
                        </div>
                      </TabsContent>

                      <TabsContent value="library" className="mt-4">
                        {mediaItems.length === 0 ? (
                          <div className="rounded-xl border border-border/70 p-6 text-center text-sm text-muted-foreground">
                            No saved product images yet. Upload one first, then you can reuse it from your library.
                          </div>
                        ) : (
                          <ScrollArea className="h-56 rounded-xl border border-border/70 p-2">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              {mediaItems.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() =>
                                    setUploadForm((prev) => ({
                                      ...prev,
                                      url: item.url,
                                      filename: prev.filename || item.filename,
                                      altText: prev.altText || item.altText || "",
                                    }))
                                  }
                                  className={`relative aspect-square overflow-hidden rounded-md border-2 transition-all ${
                                    uploadForm.url === item.url
                                      ? "border-primary ring-2 ring-primary/30"
                                      : "border-transparent hover:border-border"
                                  }`}
                                >
                                  <img src={item.url} alt={item.filename} className="h-full w-full object-cover" />
                                  <div className="absolute inset-x-0 bottom-0 bg-black/60 px-1 py-0.5">
                                    <p className="truncate text-[10px] text-white">{item.filename}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </ScrollArea>
                        )}
                      </TabsContent>
                    </Tabs>

                    <div>
                      <Label htmlFor="filename">Filename *</Label>
                      <Input
                        id="filename"
                        value={uploadForm.filename}
                        onChange={(e) => setUploadForm({ ...uploadForm, filename: e.target.value })}
                        placeholder="elegant-abaya.jpg"
                        data-testid="input-media-filename"
                      />
                    </div>
                    <div>
                      <Label htmlFor="altText">Alt Text</Label>
                      <Input
                        id="altText"
                        value={uploadForm.altText}
                        onChange={(e) => setUploadForm({ ...uploadForm, altText: e.target.value })}
                        placeholder="Description of the product"
                        data-testid="input-media-alt"
                      />
                    </div>
                    <div>
                      <Label htmlFor="tags">Tags (comma separated)</Label>
                      <Input
                        id="tags"
                        value={uploadForm.tags}
                        onChange={(e) => setUploadForm({ ...uploadForm, tags: e.target.value })}
                        placeholder="abaya, modest, fashion"
                        data-testid="input-media-tags"
                      />
                    </div>
                    <Button
                      onClick={() => uploadMutation.mutate(uploadForm)}
                      disabled={!uploadForm.url || !uploadForm.filename || uploadMutation.isPending || isUploading}
                      className="w-full"
                      data-testid="button-submit-media"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload"
                      )}
                    </Button>
                  </div>
                </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : mediaItems.length === 0 ? (
          <Card className="border-border/70 bg-card/80 shadow-sm">
            <CardContent className="flex min-h-[340px] flex-col items-center justify-center p-8 text-center md:p-12">
              <div className="mb-5 rounded-2xl border border-border/70 bg-muted/40 p-4">
                <ImageIcon className="h-12 w-12 text-muted-foreground" />
              </div>
              <h3 className="text-2xl font-semibold tracking-tight">No product images found</h3>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
                Upload your first product image to get started. You can reuse these images across multiple products and keep your listing workflow much faster.
              </p>
              <div className="mt-6">
                <Button
                  onClick={() => setUploadDialogOpen(true)}
                  data-testid="button-upload-first-media"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Your First Image
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {mediaItems.map((item) => (
              <Card key={item.id} className={`overflow-hidden border-border/70 bg-card/80 shadow-sm ${selectedImages.has(item.id) ? 'ring-2 ring-primary' : ''}`} data-testid={`media-card-${item.id}`}>
                <div className="relative aspect-[4/3] bg-muted">
                  <img
                    src={item.url}
                    alt={item.altText || item.filename}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23ddd' width='100' height='100'/%3E%3Ctext x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' fill='%23999'%3ENo Image%3C/text%3E%3C/svg%3E";
                    }}
                  />
                  <div className="absolute top-2 left-2">
                    <Checkbox
                      checked={selectedImages.has(item.id)}
                      onCheckedChange={() => toggleImageSelection(item.id)}
                      className="bg-white"
                      data-testid={`checkbox-select-${item.id}`}
                    />
                  </div>
                  {item.isTemporary && (
                    <div className="absolute top-2 right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded">
                      Sample
                    </div>
                  )}
                  {item.uploaderRole === "admin" && (
                    <div className="absolute bottom-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                      Platform
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2 p-3">
                  <div>
                    <p className="truncate text-sm font-semibold" title={item.filename}>
                      {item.filename}
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                      {item.altText || "Reusable product image for seller listings"}
                    </p>
                  </div>
                  <div className="min-h-[18px]">
                    {item.tags && item.tags.length > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {item.tags.slice(0, 2).join(", ")}
                        {item.tags.length > 2 && ` +${item.tags.length - 2}`}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => copyToClipboard(item.url, item.id)}
                      data-testid={`button-copy-${item.id}`}
                    >
                      {copiedId === item.id ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                    {item.uploaderRole !== "admin" && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this image?")) {
                            deleteMutation.mutate(item.id);
                          }
                        }}
                        data-testid={`button-delete-${item.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
