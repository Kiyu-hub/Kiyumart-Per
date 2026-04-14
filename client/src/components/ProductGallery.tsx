import { X, Upload, Image as ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import MediaUploadInput from "@/components/MediaUploadInput";
import { cn } from "@/lib/utils";

interface ProductGalleryProps {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  required?: boolean;
  description?: string;
}

export default function ProductGallery({
  images,
  onChange,
  maxImages = 5,
  required = false,
  description = "Add clear images from different angles so customers can see this item well",
}: ProductGalleryProps) {
  const handleAddImage = (url: string) => {
    if (url && images.length < maxImages) {
      onChange([...images, url]);
    }
  };

  const handleRemoveImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    onChange(newImages);
  };

  const handleSetPrimary = (index: number) => {
    if (index === 0) return;
    const newImages = [...images];
    const [primaryImage] = newImages.splice(index, 1);
    newImages.unshift(primaryImage);
    onChange(newImages);
  };

  const canAddMore = images.length < maxImages;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <Label>
            Product Gallery {required && <span className="text-destructive">*</span>}
          </Label>
          {description && (
            <p className="text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <span className="text-sm font-medium text-muted-foreground">
          {images.length}/{maxImages}
        </span>
      </div>

      {images.length === 0 && (
        <Card
          className={cn(
            "border-2 border-dashed p-8 text-center transition-colors",
            "hover:border-primary/50 hover:bg-accent/5",
          )}
        >
          <div className="flex flex-col items-center justify-center space-y-3">
            <ImageIcon className="h-12 w-12 text-muted-foreground" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Drop your images here, or browse
              </p>
              <p className="text-xs text-muted-foreground">
                Upload up to {maxImages} images using URL, Upload, or Library
              </p>
              <p className="mt-2 text-xs font-medium text-primary">
                Add front, back, side, and close-up images
              </p>
            </div>
            <MediaUploadInput
              id="gallery-upload-primary"
              label="Upload Image"
              value=""
              onChange={handleAddImage}
              accept="image"
              placeholder="Upload image or enter URL"
            />
          </div>
        </Card>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {images.map((image, index) => (
            <Card
              key={index}
              className={cn(
                "group relative aspect-square overflow-hidden",
                index === 0 && "ring-2 ring-primary",
              )}
              data-testid={`image-preview-${index}`}
            >
              <img
                src={image}
                alt={`Product ${index + 1}`}
                className="h-full w-full object-cover"
              />

              <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
                {index !== 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSetPrimary(index)}
                    data-testid={`button-set-primary-${index}`}
                  >
                    Set Primary
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={() => handleRemoveImage(index)}
                  data-testid={`button-remove-image-${index}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {index === 0 && (
                <div className="absolute left-2 top-2 rounded bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                  Primary
                </div>
              )}
            </Card>
          ))}

          {canAddMore && (
            <Card
              className="flex aspect-square flex-col items-center justify-center border-2 border-dashed p-4 transition-colors hover:border-primary/50 hover:bg-accent/5"
              data-testid="card-add-more-image"
            >
              <Upload className="mb-2 h-8 w-8 text-muted-foreground" />
              <p className="mb-3 text-center text-xs text-muted-foreground">
                Add More Images
              </p>
              <MediaUploadInput
                id={`gallery-upload-${images.length}`}
                label=""
                value=""
                onChange={handleAddImage}
                accept="image"
                placeholder="Upload or enter URL"
                compact={true}
              />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
