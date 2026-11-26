import { eq } from "drizzle-orm";
import { db } from "../db";
import { categories, catalogDepartments, stores } from "@shared/schema";

export class ProductCategoryError extends Error {
  readonly statusCode = 400;
  constructor(message: string) {
    super(message);
    this.name = "ProductCategoryError";
  }
}

/**
 * Validate category and store ownership of the category. This MUST run on
 * server writes, not only in client forms.
 *
 * Category IDs, rather than legacy category labels, are authoritative.
 * Disabled/unlaunched departments cannot receive newly listed products.
 */
export async function requirePublishedCategoryForStore(
  categoryId: string | null | undefined,
  storeId: string | null | undefined,
): Promise<{ id: string; name: string; departmentId: string }> {
  if (!categoryId || !String(categoryId).trim()) {
    throw new ProductCategoryError("Select a valid fashion category for this product.");
  }
  if (!storeId || !String(storeId).trim()) {
    throw new ProductCategoryError("A product must belong to an approved seller store.");
  }

  const [[category], [store]] = await Promise.all([
    db.select().from(categories).where(eq(categories.id, categoryId)).limit(1),
    db.select().from(stores).where(eq(stores.id, storeId)).limit(1),
  ]);
  if (!category || !category.isActive || !category.departmentId) {
    throw new ProductCategoryError("The selected category is inactive or not linked to a marketplace department.");
  }
  if (!store || !store.isActive || !store.isApproved) {
    throw new ProductCategoryError("The selected seller store is missing or not approved.");
  }
  const [department] = await db.select().from(catalogDepartments)
    .where(eq(catalogDepartments.id, category.departmentId)).limit(1);
  if (!department?.isEnabled || !department.launchReady) {
    throw new ProductCategoryError("This category's marketplace department is not available yet.");
  }
  const storeType = String(store.storeType);
  if (department.storeTypes.length > 0 && !department.storeTypes.includes(storeType)) {
    throw new ProductCategoryError("The selected store is not eligible to list products in this department.");
  }
  if (category.storeTypes?.length && !category.storeTypes.includes(storeType)) {
    throw new ProductCategoryError("The selected category is not permitted for this store type.");
  }
  return { id: category.id, name: category.name, departmentId: category.departmentId };
}
