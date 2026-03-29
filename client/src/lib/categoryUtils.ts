type ProductCategoryShape = {
  category?: string | null;
  categoryName?: string | null;
  categoryId?: string | null;
};

type CategoryShape = {
  id?: string | null;
  slug?: string | null;
  name?: string | null;
};

export const normalizeCategoryKey = (value?: string | null) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

export const formatCategoryLabel = (value?: string | null) => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";

  return normalized
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

export const getProductCategoryLabel = (product?: ProductCategoryShape | null) => {
  const categoryName = String(product?.categoryName || "").trim();
  if (categoryName) return categoryName;
  return formatCategoryLabel(product?.category);
};

export const productMatchesCategory = (
  product: ProductCategoryShape | null | undefined,
  category: CategoryShape | null | undefined,
) => {
  if (!product || !category) return false;

  const categoryId = String(category.id || "").trim();
  if (categoryId && String(product.categoryId || "").trim() === categoryId) {
    return true;
  }

  const categoryKeys = new Set(
    [category.slug, category.name]
      .map((value) => normalizeCategoryKey(value))
      .filter(Boolean),
  );

  const productKeys = new Set(
    [product.category, product.categoryName]
      .map((value) => normalizeCategoryKey(value))
      .filter(Boolean),
  );

  return Array.from(productKeys).some((key) => categoryKeys.has(key));
};
