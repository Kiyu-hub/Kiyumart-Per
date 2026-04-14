import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Link as LinkIcon, Loader2, X, Image, Video, CheckCircle, FolderOpen, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import CleanVideoPlayer from "@/components/CleanVideoPlayer";

interface MediaLibraryItem {
  id: string;
  url: string;
  filename: string;
  category: string;
  altText: string | null;
  tags: string[] | null;
}

interface AssetImage {
  filename: string;
  url: string;
  path: string;
  size: number;
}

interface MediaUploadInputProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  accept?: "image" | "video" | "both";
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Skip 4K resolution validation (for category images, logos, etc.) */
  skip4KValidation?: boolean;
  /** Minimum dimensions for images when skip4KValidation is true (default: 200x200) */
  minDimensions?: { width: number; height: number };
  /** Category filter for media library (banner, product, category, logo) */
  mediaCategory?: string;
  compact?: boolean;
}

export default function MediaUploadInput({
  id,
  label,
  value,
  onChange,
  accept = "image",
  placeholder = "https://example.com/image.jpg",
  description,
  required = false,
  disabled = false,
  skip4KValidation = false,
  minDimensions = { width: 200, height: 200 },
  mediaCategory,
  compact = false,
}: MediaUploadInputProps) {
  const apiBase = ((import.meta.env as any).VITE_API_URL || "").trim().replace(/\/$/, "");
  const toApiUrl = (path: string) => (path.startsWith("http") ? path : `${apiBase}${path}`);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationStatus, setValidationStatus] = useState("");
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"url" | "upload" | "library">("url");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const mediaLibraryPath = mediaCategory ? `/api/media-library?category=${encodeURIComponent(mediaCategory)}` : "/api/media-library";
  const resolvedMediaCategory =
    mediaCategory && ["banner", "category", "logo", "product", "general"].includes(mediaCategory)
      ? mediaCategory
      : "general";

  const buildEndpointUrls = (path: string): string[] => {
    const absolute = toApiUrl(path);
    if (absolute === path) return [path];
    return [absolute, path];
  };

  const fetchJsonWithFallback = async (path: string, init?: RequestInit) => {
    let lastError: Error | null = null;
    for (const url of buildEndpointUrls(path)) {
      try {
        const res = await fetch(url, init);
        const bodyText = await res.text();
        let parsed: any = null;
        try {
          parsed = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          parsed = null;
        }
        if (!res.ok) {
          throw new Error(parsed?.error || bodyText || `Request failed with status ${res.status}`);
        }
        return parsed;
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    throw lastError || new Error("Request failed");
  };

  // Fetch media library items
  const {
    data: mediaItems = [],
    isLoading: mediaLoading,
    isError: mediaError,
  } = useQuery<MediaLibraryItem[]>({
    queryKey: ["/api/media-library", mediaCategory || "all"],
    queryFn: async () => {
      const result = await fetchJsonWithFallback(mediaLibraryPath, {
        credentials: "include",
      });
      return Array.isArray(result) ? result : [];
    },
    enabled: activeTab === "library",
  });

  // Fetch asset images (stock images)
  const { data: assetImages = [], isLoading: assetsLoading, isError: assetsError } = useQuery<AssetImage[]>({
    queryKey: ["/api/assets/images"],
    queryFn: async () => {
      const result = await fetchJsonWithFallback("/api/assets/images", {
        credentials: "include",
      });
      return Array.isArray(result) ? result : [];
    },
    enabled: activeTab === "library",
  });

  // Combine media library items and asset images for the library view
  const allLibraryImages = [
    ...mediaItems.map(item => ({ url: item.url, name: item.filename, source: "uploaded" as const })),
    ...assetImages.map(asset => ({ url: asset.url, name: asset.filename, source: "asset" as const })),
  ];

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const validateImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const objectURL = URL.createObjectURL(file);

      img.onload = function() {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        URL.revokeObjectURL(objectURL);
        resolve({ width, height });
      };

      img.onerror = function() {
        URL.revokeObjectURL(objectURL);
        reject("Failed to load image");
      };

      img.src = objectURL;
    });
  };

  const validateVideoDuration = (file: File): Promise<number> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";

      video.onloadedmetadata = function() {
        window.URL.revokeObjectURL(video.src);
        resolve(video.duration);
      };

      video.onerror = function() {
        reject("Failed to load video");
      };

      video.src = URL.createObjectURL(file);
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadProgress(0);
    setValidationStatus("");
    setFileInfo({ name: file.name, size: formatFileSize(file.size) });

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    setValidationStatus("Checking file type...");

    if (accept === "image" && !isImage) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      setFileInfo(null);
      return;
    }

    if (accept === "video" && !isVideo) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file",
        variant: "destructive",
      });
      setFileInfo(null);
      return;
    }

    setValidationStatus("Checking file...");
    const maxSize = 10 * 1024 * 1024;
    if (isImage && file.size > maxSize) {
      toast({
        title: "File too large",
        description: `File is ${formatFileSize(file.size)}. Maximum size is 10MB`,
        variant: "destructive",
      });
      setFileInfo(null);
      return;
    }

    if (isImage) {
      setValidationStatus("Image ready for upload");
    }

    if (isVideo) {
      try {
        setValidationStatus("Preparing video for upload...");
        const duration = await validateVideoDuration(file);
        setValidationStatus(
          duration > 30
            ? `Long video detected (${duration.toFixed(1)}s). It will be optimized automatically.`
            : `Video validated (${duration.toFixed(1)}s)`,
        );
      } catch {
        setValidationStatus("Uploading video without local duration check...");
      }
    }

    setIsUploading(true);
    setValidationStatus("Uploading to cloud storage...");
    setUploadProgress(10);

    try {
      const uploadViaEndpoint = async (endpointPath: string, includeCredentials: boolean): Promise<string> => {
        let lastError: Error | null = null;
        for (const endpointUrl of buildEndpointUrls(endpointPath)) {
          try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(endpointUrl, {
              method: "POST",
              body: formData,
              credentials: includeCredentials ? "include" : "omit",
            });
            const bodyText = await res.text();
            let parsed: any = null;
            try {
              parsed = bodyText ? JSON.parse(bodyText) : null;
            } catch {
              parsed = null;
            }
            if (!res.ok) {
              throw new Error(parsed?.error || bodyText || `Upload failed with status ${res.status}`);
            }
            if (!parsed?.url) {
              throw new Error("Upload succeeded but no URL was returned");
            }
            return parsed.url;
          } catch (error: any) {
            lastError = error instanceof Error ? error : new Error(String(error));
          }
        }
        throw lastError || new Error("Network error during upload");
      };

      const primaryEndpoint = isVideo
        ? "/api/upload/video"
        : (skip4KValidation ? "/api/upload/public" : "/api/upload/image");

      setUploadProgress(45);
      let url: string;
      try {
        url = await uploadViaEndpoint(primaryEndpoint, primaryEndpoint !== "/api/upload/public");
      } catch (primaryError) {
        if (!isVideo && primaryEndpoint !== "/api/upload/public") {
          setValidationStatus("Primary upload failed. Retrying with fallback endpoint...");
          url = await uploadViaEndpoint("/api/upload/public", false);
        } else {
          throw primaryError;
        }
      }

      setUploadProgress(85);
      onChange(url);

      if (isImage) {
        try {
          await fetchJsonWithFallback("/api/media-library", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              url,
              filename: file.name,
              category: resolvedMediaCategory,
              altText: file.name,
              tags: [],
              isTemporary: false,
            }),
          });
          await queryClient.invalidateQueries({ queryKey: ["/api/media-library"] });
          await queryClient.invalidateQueries({ queryKey: ["/api/media-library", mediaCategory || "all"] });
        } catch {
          // Upload is still usable even if media library persistence fails.
        }
      }

      setUploadProgress(100);
      setValidationStatus("Upload complete");
      toast({
        title: "Upload successful",
        description: `${isVideo ? "Video" : "Image"} uploaded successfully`,
      });

      setTimeout(() => {
        setValidationStatus("");
        setFileInfo(null);
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message || "Network error during upload",
        variant: "destructive",
      });
      setValidationStatus("");
      setFileInfo(null);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      e.target.value = "";
    }
  };
  const handleClearValue = () => {
    onChange("");
  };

  const getAcceptAttribute = () => {
    if (accept === "image") return "image/*";
    if (accept === "video") return "video/*";
    return "image/*,video/*";
  };

  const getFileTypeLabel = () => {
    if (accept === "image") return "image";
    if (accept === "video") return "video";
    return "image or video";
  };

  return (
    <div className="space-y-2">
      {label ? (
        <Label htmlFor={id}>
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
      ) : null}
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "url" | "upload" | "library")} className="w-full">
        <TabsList className={`grid w-full grid-cols-3 ${compact ? "h-auto gap-1 p-1" : ""}`}>
          <TabsTrigger value="url" disabled={disabled} className={compact ? "px-2 py-2 text-[11px]" : ""}>
            <LinkIcon className={`h-4 w-4 ${compact ? "" : "mr-2"}`} />
            <span className={compact ? "sr-only" : ""}>URL</span>
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={disabled} className={compact ? "px-2 py-2 text-[11px]" : ""}>
            <Upload className={`h-4 w-4 ${compact ? "" : "mr-2"}`} />
            <span className={compact ? "sr-only" : ""}>Upload</span>
          </TabsTrigger>
          <TabsTrigger value="library" disabled={disabled} className={compact ? "px-2 py-2 text-[11px]" : ""}>
            <FolderOpen className={`h-4 w-4 ${compact ? "" : "mr-2"}`} />
            <span className={compact ? "sr-only" : ""}>Library</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className={compact ? "mt-2 space-y-2" : "space-y-2"}>
          <div className={`flex gap-2 ${compact ? "flex-col" : ""}`}>
            <Input
              id={id}
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              data-testid={`input-${id}`}
              className={compact ? "h-9 text-xs" : ""}
            />
            {value && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleClearValue}
                disabled={disabled}
                data-testid={`button-clear-${id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TabsContent>

        <TabsContent value="upload" className={compact ? "mt-2 space-y-2" : "space-y-2"}>
          <div className={`flex items-center gap-2 ${compact ? "flex-col" : ""}`}>
            <Button
              type="button"
              variant="outline"
              disabled={isUploading || disabled}
              onClick={() => document.getElementById(`${id}-file-input`)?.click()}
              className={compact ? "h-9 w-full px-2 text-xs" : "flex-1"}
              data-testid={`button-upload-${id}`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {compact ? "Uploading" : "Uploading..."}
                </>
              ) : (
                <>
                  {accept === "video" ? (
                    <Video className="h-4 w-4 mr-2" />
                  ) : (
                    <Image className="h-4 w-4 mr-2" />
                  )}
                  {compact ? "Upload" : `Choose ${getFileTypeLabel()}`}
                </>
              )}
            </Button>
            <input
              id={`${id}-file-input`}
              type="file"
              accept={getAcceptAttribute()}
              onChange={handleFileUpload}
              className="hidden"
              disabled={isUploading || disabled}
            />
            {value && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleClearValue}
                disabled={disabled}
                data-testid={`button-clear-upload-${id}`}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {fileInfo && !compact && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">{fileInfo.name}</span>
              <span className="mx-2">•</span>
              <span>{fileInfo.size}</span>
            </div>
          )}

          {validationStatus && !compact && (
            <div className="flex items-start gap-2 text-xs">
              {validationStatus.startsWith('✓') ? (
                <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
              ) : (
                <Loader2 className="h-4 w-4 animate-spin shrink-0 mt-0.5" />
              )}
              <span className={validationStatus.startsWith('✓') ? "text-green-600 dark:text-green-400" : ""}>
                {validationStatus}
              </span>
            </div>
          )}

          {isUploading && uploadProgress > 0 && !compact && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}

          {value && !compact && (
            <p className="text-xs text-muted-foreground break-all">
              Current: {value}
            </p>
          )}
        </TabsContent>

        <TabsContent value="library" className={compact ? "mt-2 space-y-2" : "space-y-2"}>
          {(mediaError || assetsError) && !compact && (
            <div className="text-xs text-muted-foreground">
              Some library sources could not be loaded. Try refreshing or signing in again.
            </div>
          )}
          {(mediaLoading || assetsLoading) ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : allLibraryImages.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No images in library</p>
              {!compact && <p className="text-xs">Upload images or add from assets</p>}
            </div>
          ) : (
            <ScrollArea className={`${compact ? "h-28" : "h-48"} border rounded-md p-2`}>
              <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-3"} gap-2`}>
                {allLibraryImages.map((img, idx) => (
                  <button
                    key={`${img.source}-${idx}`}
                    type="button"
                    onClick={() => {
                      onChange(img.url);
                      toast({ title: "Image Selected", description: img.name });
                    }}
                    className={`relative aspect-square rounded-md overflow-hidden border-2 transition-all hover:opacity-80 ${
                      value === img.url 
                        ? "border-primary ring-2 ring-primary/30" 
                        : "border-transparent hover:border-muted-foreground/30"
                    }`}
                  >
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full h-full object-cover"
                    />
                    {value === img.url && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <Check className="h-6 w-6 text-primary drop-shadow-lg" />
                      </div>
                    )}
                    {!compact && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                        <p className="text-[10px] text-white truncate">{img.name}</p>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
          {value && !compact && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground break-all flex-1">
                Selected: {value.split('/').pop()}
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearValue}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {description && !compact && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {value && accept === "image" && !compact && (
        <div className="mt-2">
          <img
            src={value}
            alt="Preview"
            className="max-w-xs h-32 object-cover rounded border"
            data-testid={`img-preview-${id}`}
          />
        </div>
      )}

      {value && accept === "video" && !compact && (
        <div className="mt-2">
          <CleanVideoPlayer
            videoUrl={value}
            title={label || "Product video"}
            className="max-w-md"
            compact
            layout="landscape"
          />
        </div>
      )}
    </div>
  );
}

