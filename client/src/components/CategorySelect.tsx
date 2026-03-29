import { useQuery } from "@tanstack/react-query";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  image: string;
  storeTypes: string[];
  isActive: boolean;
}

interface CategorySelectProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
  storeType?: string;
  label?: string;
  required?: boolean;
  error?: string;
  testId?: string;
}

export function CategorySelect({
  value,
  onValueChange,
  storeType,
  label = "Category",
  required = false,
  error,
  testId = "select-category",
}: CategorySelectProps) {
  const { data: allCategories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories", "active"],
    queryFn: async () => {
      const res = await fetch("/api/categories?isActive=true");
      return res.json();
    },
  });

  const categories = storeType
    ? allCategories.filter((cat) => {
        // Include categories with no storeType restriction (null or empty array)
        if (!cat.storeTypes || cat.storeTypes.length === 0) {
          return true; // Global category - show to all store types
        }
        // Include categories that match the seller's storeType
        return cat.storeTypes.includes(storeType);
      })
    : allCategories;

  return (
    <div className="space-y-2">
      <Label htmlFor={testId}>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value} onValueChange={onValueChange} disabled={isLoading}>
        <SelectTrigger data-testid={testId}>
          <SelectValue placeholder={isLoading ? "Loading categories..." : "Select a category"} />
        </SelectTrigger>
        <SelectContent>
          {categories.length === 0 && !isLoading && (
            <div className="px-2 py-3 text-sm text-muted-foreground text-center">
              {storeType
                ? `No categories available for ${storeType.replace(/_/g, " ")}`
                : "No categories available"}
            </div>
          )}
          {categories.map((cat) => (
            <SelectItem key={cat.id} value={cat.id}>
              {cat.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive mt-1">{error}</p>}
    </div>
  );
}
