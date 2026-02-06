import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Upload, Link as LinkIcon, Loader2, X, Image, Video, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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
}: MediaUploadInputProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationStatus, setValidationStatus] = useState("");
  const [fileInfo, setFileInfo] = useState<{ name: string; size: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"url" | "upload">("url");
  const { toast } = useToast();

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

    // Reset states
    setUploadProgress(0);
    setValidationStatus("");
    setFileInfo({ name: file.name, size: formatFileSize(file.size) });

    // Validate file type
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

    // Validate file size (max 10MB for images, 30MB for videos)
    setValidationStatus("Checking file size...");
    const maxSize = isVideo ? 30 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: `File is ${formatFileSize(file.size)}. Maximum size is ${isVideo ? "30MB" : "10MB"}`,
        variant: "destructive",
      });
      setFileInfo(null);
      return;
    }

    // Validate image dimensions
    if (isImage) {
      try {
        setValidationStatus("Checking image dimensions...");
        const { width, height } = await validateImageDimensions(file);
        
        if (skip4KValidation) {
          // Use minimum dimensions check when 4K is not required
          if (width < minDimensions.width || height < minDimensions.height) {
            toast({
              title: "Image resolution too low",
              description: `Image is ${width}×${height}px. Minimum required: ${minDimensions.width}×${minDimensions.height}px`,
              variant: "destructive",
            });
            e.target.value = "";
            setFileInfo(null);
            return;
          }
        } else {
          // Default 4K validation (3840x2160 minimum)
          if (width < 3840 || height < 2160) {
            toast({
              title: "Image resolution too low",
              description: `Image is ${width}×${height}px. Minimum required: 3840×2160px (4K)`,
              variant: "destructive",
            });
            e.target.value = "";
            setFileInfo(null);
            return;
          }
        }
        setValidationStatus(`✓ Image validated (${width}×${height}px)`);
      } catch (error) {
        toast({
          title: "Validation failed",
          description: "Could not validate image dimensions",
          variant: "destructive",
        });
        setFileInfo(null);
        return;
      }
    }

    // Validate video duration (under 30 seconds)
    if (isVideo) {
      try {
        setValidationStatus("Checking video duration...");
        const duration = await validateVideoDuration(file);
        if (duration >= 30) {
          toast({
            title: "Video too long",
            description: `Video is ${duration.toFixed(1)}s. Must be under 30 seconds`,
            variant: "destructive",
          });
          e.target.value = "";
          setFileInfo(null);
          return;
        }
        setValidationStatus(`✓ Video validated (${duration.toFixed(1)}s)`);
      } catch (error) {
        toast({
          title: "Validation failed",
          description: "Could not validate video duration",
          variant: "destructive",
        });
        setFileInfo(null);
        return;
      }
    }

    setIsUploading(true);
    setValidationStatus("Uploading to cloud storage...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const endpoint = isVideo ? "/api/upload/video" : "/api/upload/image";
      
      // Use XMLHttpRequest for upload progress tracking
      const uploadPromise = new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable) {
            const percentComplete = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percentComplete);
          }
        });

        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const data = JSON.parse(xhr.responseText);
              resolve(data.url);
            } catch (error) {
              reject(new Error("Invalid response from server"));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || "Upload failed"));
            } catch {
              reject(new Error(`Upload failed with status ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener("error", () => {
          reject(new Error("Network error during upload"));
        });

        xhr.addEventListener("abort", () => {
          reject(new Error("Upload cancelled"));
        });

        xhr.open("POST", endpoint);
        xhr.send(formData);
      });

      const url = await uploadPromise;
      onChange(url);

      setValidationStatus("✓ Upload complete!");
      toast({
        title: "Upload successful",
        description: `${isVideo ? "Video" : "Image"} uploaded successfully`,
      });

      // Clear status after a short delay
      setTimeout(() => {
        setValidationStatus("");
        setFileInfo(null);
      }, 2000);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
      setValidationStatus("");
      setFileInfo(null);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      e.target.value = ""; // Reset input
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
      <Label htmlFor={id}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "url" | "upload")} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="url" disabled={disabled}>
            <LinkIcon className="h-4 w-4 mr-2" />
            Enter URL
          </TabsTrigger>
          <TabsTrigger value="upload" disabled={disabled}>
            <Upload className="h-4 w-4 mr-2" />
            Upload File
          </TabsTrigger>
        </TabsList>

        <TabsContent value="url" className="space-y-2">
          <div className="flex gap-2">
            <Input
              id={id}
              type="url"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={placeholder}
              disabled={disabled}
              data-testid={`input-${id}`}
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

        <TabsContent value="upload" className="space-y-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isUploading || disabled}
              onClick={() => document.getElementById(`${id}-file-input`)?.click()}
              className="flex-1"
              data-testid={`button-upload-${id}`}
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  {accept === "video" ? (
                    <Video className="h-4 w-4 mr-2" />
                  ) : (
                    <Image className="h-4 w-4 mr-2" />
                  )}
                  Choose {getFileTypeLabel()}
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

          {fileInfo && (
            <div className="text-xs text-muted-foreground">
              <span className="font-medium">{fileInfo.name}</span>
              <span className="mx-2">•</span>
              <span>{fileInfo.size}</span>
            </div>
          )}

          {validationStatus && (
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

          {isUploading && uploadProgress > 0 && (
            <div className="space-y-1">
              <Progress value={uploadProgress} className="h-2" />
              <p className="text-xs text-muted-foreground text-center">
                {uploadProgress}% uploaded
              </p>
            </div>
          )}

          {value && (
            <p className="text-xs text-muted-foreground break-all">
              Current: {value}
            </p>
          )}
        </TabsContent>
      </Tabs>

      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}

      {value && accept === "image" && (
        <div className="mt-2">
          <img
            src={value}
            alt="Preview"
            className="max-w-xs h-32 object-cover rounded border"
            data-testid={`img-preview-${id}`}
          />
        </div>
      )}

      {value && accept === "video" && (
        <div className="mt-2">
          <video
            src={value}
            controls
            className="max-w-xs h-32 rounded border"
            data-testid={`video-preview-${id}`}
          />
        </div>
      )}
    </div>
  );
}
