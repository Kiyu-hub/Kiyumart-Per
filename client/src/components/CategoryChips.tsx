import { cn } from "@/lib/utils";
import { useState } from "react";

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface CategoryChipsProps {
  categories: Category[];
  selectedCategory?: string;
  onCategorySelect?: (category: string) => void;
}

export default function CategoryChips({ categories, selectedCategory, onCategorySelect }: CategoryChipsProps) {
  const [selected, setSelected] = useState(selectedCategory || "all");

  const handleSelect = (id: string) => {
    setSelected(id);
    onCategorySelect?.(id);
  };

  const allCategories = [{ id: "all", name: "All", slug: "all" }, ...categories];

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {allCategories.map((category) => (
        <button
          key={category.id}
          onClick={() => handleSelect(category.slug)}
          className={cn(
            "shrink-0 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all border",
            selected === category.slug
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-transparent border-border text-foreground hover:border-primary/50"
          )}
          data-testid={`chip-category-${category.slug}`}
        >
          {category.name}
        </button>
      ))}
    </div>
  );
}
