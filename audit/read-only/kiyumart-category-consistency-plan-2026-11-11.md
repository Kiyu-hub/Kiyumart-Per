# KiyuMart category data integrity — inspection and staging plan (2026-11-11)

**Scope:** READ ONLY. No production rows or categories changed, deleted or inserted.

## Verified database baseline
- 614 product records, all active; 26 category records, all active.
- 59 normalized, distinct category *labels* across products (60 with capitalization differences).
- 15 labels already have a matching category definition; **44 normalized labels have no definition**.
- 433 products have NULL `category_id`; another 30 have a category ID whose name differs from `products.category`; 151 have correct name/ID relationships case-insensitively.
- One correctly linked product uses different capitalization in `category` versus its category record.
- All product `seller_id` values agree with their store's primary seller ID. No inactive category/store mismatches found.
- 8 currently defined categories have zero linked product rows.
- `Accessories` is ambiguous: 10 clothing-store, 10 electronics-store, 10 automotive-store product rows share the same label. This requires a category taxonomy decision, **not** blind mapping.
- Six of seven homepage banners use `category=` query slugs; none of those six correspond to a currently defined `categories.slug` (although the app may have fallback routing).
- Category image is NOT NULL; creating category rows requires choosing real, valid image assets. 44 fabricated generic category images would worsen the homepage.

## Existing wrongly linked product sets
| Stored `products.category` | Current `category_id` points to | Affected products | Correct approach |
| --- | --- | ---: | --- |
| Board Games | Shoes | 10 | New Board Games definition or staged replacement taxonomy; not Shoes |
| Garden | Furnitures | 10 | New Garden definition or staged replacement taxonomy; not Furnitures |
| Laptops | Electronic | 10 | New Laptops definition or staged replacement taxonomy; not Electronic |

## Why the issue recurs
- `shared/schema.ts` defines `products.categoryId` as nullable, documents it as nullable during migration, and keeps `products.category` as a deprecated legacy label.
- `insertProductSchema` accepts `categoryId` without making it mandatory.
- `client/src/pages/AdminProductCreate.tsx` and `client/src/pages/SellerProducts.tsx` both make `categoryId` optional.
- `server/storage.ts`'s `createProduct` inserts supplied fields without canonicalizing category.
- Thus new products may be inserted without a valid category ID until validation is implemented in ALL create/update paths.

## Options before write changes
**Option A — Normalize all existing demo products:** Retain existing 26 category rows, create **44 additional** definitions (70 categories in total, with some empty); assign/fix 463 affected product IDs, standardize legacy case and validate store types. This temporarily adds unrelated restaurant, games, automotive and electronics categories to a fashion-first store. Not recommended as the final production taxonomy.

**Option B — Recommended:** Preserve an immutable relational snapshot of all current categories and product→category associations, design/approve the **fashion-first** canonical taxonomy and banner slug aliases, and prepare deterministic mappings from existing records. Validate all 614 rows against that map without changing their live rows. Then make atomic, backed-up, tested adjustments in staging; remove unused demo data only in a separately reviewed cleanup. This avoids creating 44 categories that will be removed.

## Required long-term invariants
1. New/updated product MUST include a real, active `category_id` matching `categories.id`.
2. The category must be applicable to the product's store type.
3. Display category name must be JOINed from `categories`, not silently differ from a legacy string; if old `category` remains for compatibility, update it atomically from the canonical category.
4. Reject invalid or mismatched category IDs at the backend for Seller, Admin and Super Admin product create/edit endpoints; do not rely only on frontend validation.
5. Distinguish cross-department labels like Accessories, or explicitly declare allowed store types and intentional aliases.
6. Preserve/verify all existing hero banners and their original `attached_assets/stock_images` files; ensure linked category slugs remain valid or explicitly redirected.
7. Don't show empty or unrelated categories on the fashion-first homepage solely because legacy records exist.
8. Test before/after exact counts, foreign keys, category consistency, seller/store ownership, buyer/seller/admin browsing, banner CTA navigation, and rollback behavior.
9. Keep Super Admin access, existing Paystack/Cloudinary credentials, financial and order history, and application legal/footer pages intact.
10. Do not apply deletes, database writes, migrations, or production merges as part of this read-only alignment audit.

## Audit files
- `audit/read-only/kiyumart-category-reconciliation-map-2026-11-11.csv` — 59-label mapping, existing category record, proposed action and impact.
- `audit/read-only/kiyumart-59-table-inventory-2026-11-11.csv` — total table count/handling.
- `audit/read-only/kiyumart-image-gallery-2026-11-11.html` — all 614 products and image references.
