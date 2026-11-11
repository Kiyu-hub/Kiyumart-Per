-- KiyuMart fashion-first reset — OWNER-AUTHORIZED CLEANUP.
-- WARNING: DESTRUCTIVE for public user, store, catalog, order, and test data.
-- All 59 original tables/5,180 rows already copied to the restricted internal
-- schema kiyumart_pre_reset_20261111. This is NOT an offsite/disaster backup.
-- All original orders/financial history remain archived in that schema.
-- Public idempotency keys (7) are intentionally retained to prevent payment replay.
-- Other preserved live tables: users (1 Super Admin), hero_banners (7),
-- media_library ('banner' rows), platform_settings, role_features, footer_pages,
-- catalog_departments. Source image files are preserved in GitHub.
-- Execute ONLY after code/build/deployment compatibility review.
-- DO NOT APPLY until a verified independent/offsite backup exists and the
-- product/category API changes are deployed and live-tested. The restricted
-- internal snapshot protects against mistaken deletion, NOT database loss.
-- Live original homepage must not be replaced during this release.
-- Preserve Super Admin authentication security_settings if created later.
BEGIN;
DO $$
DECLARE
  saved_tables bigint; saved_rows bigint;
  total_users bigint; super_admins bigint; valid_superadmins bigint;
  non_failed_orders bigint; live_payments bigint; catalog_total bigint;
  fashion_enabled bigint; protected_media bigint;
BEGIN
 SELECT count(*),sum(archived_rows) INTO saved_tables,saved_rows
 FROM kiyumart_pre_reset_20261111._manifest;
 IF saved_tables<>59 OR saved_rows<>5180 THEN
  RAISE EXCEPTION 'Unexpected snapshot manifest: % tables, % records',saved_tables,saved_rows;
 END IF;
 SELECT count(*),count(*) FILTER(WHERE role='super_admin'),
 count(*) FILTER(WHERE role='super_admin' AND is_active AND email_verified AND password LIKE '$2%')
 INTO total_users,super_admins,valid_superadmins FROM public.users;
 IF total_users<>31 OR super_admins<>1 OR valid_superadmins<>1 THEN
  RAISE EXCEPTION 'Super Admin/user baseline changed. Abort reset.';
 END IF;
 IF (SELECT count(*) FROM public.products)<>614 OR
    (SELECT count(*) FROM public.categories)<>26 OR
    (SELECT count(*) FROM public.stores)<>16 OR
    (SELECT count(*) FROM public.hero_banners)<>7 THEN
    RAISE EXCEPTION 'Marketplace row-count baseline changed. Abort reset.';
 END IF;
 SELECT count(*) FILTER(WHERE status::text<>'cancelled' OR payment_status::text<>'failed')
 INTO non_failed_orders FROM public.orders;
 IF (SELECT count(*) FROM public.orders)<>8 OR non_failed_orders<>0 THEN
   RAISE EXCEPTION 'Order status changed; archive/reconcile before reset.';
 END IF;
 SELECT
  (SELECT count(*) FROM public.transactions)
  + (SELECT count(*) FROM public.commissions)
  + (SELECT count(*) FROM public.seller_payouts)
  + (SELECT count(*) FROM public.rider_payouts)
  + (SELECT count(*) FROM public.receipts)
  INTO live_payments;
 IF live_payments<>0 THEN RAISE EXCEPTION 'Financial ledger contains records; abort reset'; END IF;
 SELECT count(*),count(*) FILTER(WHERE is_enabled) INTO catalog_total,fashion_enabled FROM public.catalog_departments;
 IF catalog_total<>27 OR fashion_enabled<>1 OR NOT EXISTS
 (SELECT 1 FROM public.catalog_departments WHERE slug='clothing' AND is_enabled AND launch_ready) THEN
  RAISE EXCEPTION 'Catalog launch-state guard failed';
 END IF;
 SELECT count(*) INTO protected_media FROM public.media_library WHERE category='banner';
 IF protected_media<>7 THEN RAISE EXCEPTION 'Expected 7 banner-media files'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.media_library m LEFT JOIN public.users u ON u.id=m.uploader_id
  WHERE m.category='banner' AND (u.role IS DISTINCT FROM 'super_admin'::user_role)
 ) THEN RAISE EXCEPTION 'Banner media owner must remain Super Admin'; END IF;
 IF EXISTS(
  SELECT 1 FROM public.role_features r
  LEFT JOIN public.users u ON u.id=r.updated_by
  WHERE r.updated_by IS NOT NULL AND u.role IS DISTINCT FROM 'super_admin'::user_role
 ) THEN RAISE EXCEPTION 'Role feature updater references another user'; END IF;
 IF EXISTS(SELECT 1 FROM public.users WHERE role='super_admin' AND delivery_zone_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Super Admin still assigned to zone; abort';
 END IF;
END $$;

-- All related child tables are truncated in a single RESTRICT batch. Neither
-- users nor protected tables are truncated.
DO $$
DECLARE to_clear text; clear_count int;
BEGIN
 SELECT string_agg(format('public.%I',c.relname),', ' ORDER BY c.relname),count(*)
 INTO to_clear,clear_count
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r'
 AND c.relname NOT IN (
  'catalog_departments','users','hero_banners','media_library',
  'platform_settings','role_features','footer_pages','idempotency_keys','delivery_zones',
  'security_settings'
 );
 IF clear_count<>50 THEN
  RAISE EXCEPTION 'Expected exactly 50 tables in reset, got %',clear_count;
 END IF;
 EXECUTE 'TRUNCATE TABLE '||to_clear||' RESTRICT';
END $$;

DELETE FROM public.media_library WHERE category <> 'banner';
DELETE FROM public.security_settings
 WHERE user_id NOT IN (SELECT id FROM public.users WHERE role='super_admin');
DELETE FROM public.users WHERE role <> 'super_admin';
DELETE FROM public.delivery_zones;

-- Seed 20 subcategories under Clothing & Fashion. The banner CTA slugs
-- abayas, hijabs, evening-wear and accessories remain valid.
INSERT INTO public.categories
 (slug,name,image,display_order,store_types,is_active,department_id)
SELECT src.slug,src.name,src.image,src.display_order,
 ARRAY['clothing']::text[],true,d.id
FROM (
  VALUES
  ('mens-clothing','Men''s Clothing','/attached_assets/stock_images/Men''s_fashion_category_image_d439510a.png',0),
  ('womens-clothing','Women''s Clothing','/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png',1),
  ('kids-clothing','Kids'' Clothing','/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png',2),
  ('abayas','Abayas','/attached_assets/stock_images/Burgundy_velvet_abaya_with_pearls_c19f2d40.png',3),
  ('hijabs','Hijabs & Scarves','/attached_assets/stock_images/Hijabs_and_accessories_category_09f9b1a2.png',4),
  ('evening-wear','Evening & Occasion Wear','/attached_assets/stock_images/Evening_wear_category_image_455c3389.png',5),
  ('accessories','Fashion Accessories','/attached_assets/stock_images/Women''s_accessories_category_image_091f4ac1.png',6),
  ('dresses','Dresses & Gowns','/attached_assets/stock_images/Evening_wear_category_image_455c3389.png',7),
  ('tops-shirts','Tops, Shirts & Blouses','/attached_assets/stock_images/Men''s_fashion_category_image_d439510a.png',8),
  ('pants-bottoms','Trousers, Skirts & Bottoms','/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png',9),
  ('modest-fashion','Modest Fashion','/attached_assets/stock_images/Islamic_fashion_hero_banner_6bb20763.png',10),
  ('kaftans-traditional','Kaftans & Traditional Wear','/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png',11),
  ('footwear','Shoes & Footwear','/attached_assets/stock_images/Footwear_category_image_9d3587fc.png',12),
  ('bags','Bags & Handbags','/attached_assets/stock_images/Women''s_accessories_category_image_091f4ac1.png',13),
  ('jewelry-watches','Jewelry & Watches','/attached_assets/stock_images/Men''s_watch_product_photo_7b78c9da.png',14),
  ('belts-hats','Belts, Caps & Headwear','/attached_assets/stock_images/Men''s_fashion_category_image_d439510a.png',15),
  ('fabrics-tailoring','Fabrics & Tailoring','/attached_assets/stock_images/Diverse_Islamic_fashion_banner_eb13714d.png',16),
  ('sportswear','Activewear & Sportswear','/attached_assets/stock_images/Men''s_sneakers_product_photo_2c87b833.png',17),
  ('sleepwear','Sleepwear & Loungewear','/attached_assets/stock_images/Fashion_hero_banner_lifestyle_000ccc89.png',18),
  ('wedding-occasion','Wedding & Special Events','/attached_assets/stock_images/Evening_wear_category_image_455c3389.png',19)
) AS src(slug,name,image,display_order)
CROSS JOIN public.catalog_departments d
WHERE d.slug='clothing';

DO $$
DECLARE missing_banner_slugs int;
BEGIN
 IF (SELECT count(*) FROM public.users)<>1 OR
   (SELECT count(*) FROM public.users WHERE role='super_admin' AND is_active AND email_verified AND password LIKE '$2%')<>1 THEN
   RAISE EXCEPTION 'Super Admin must remain intact';
 END IF;
 IF (SELECT count(*) FROM public.hero_banners)<>7 OR
    (SELECT count(*) FROM public.media_library WHERE category='banner')<>7 OR
    (SELECT count(*) FROM public.platform_settings)<>1 OR
    (SELECT count(*) FROM public.role_features)<>6 OR
    (SELECT count(*) FROM public.footer_pages)<>16 OR
    (SELECT count(*) FROM public.idempotency_keys)<>7 THEN
   RAISE EXCEPTION 'Protected configuration/banner/payment records changed; abort';
 END IF;
 IF (SELECT count(*) FROM public.products)<>0 OR (SELECT count(*) FROM public.stores)<>0 OR
    (SELECT count(*) FROM public.orders)<>0 OR (SELECT count(*) FROM public.categories)<>20 THEN
   RAISE EXCEPTION 'Reset row counts failed; abort';
 END IF;
 IF (SELECT count(*) FROM public.categories c LEFT JOIN public.catalog_departments d
       ON c.department_id=d.id WHERE d.slug IS DISTINCT FROM 'clothing')<>0 THEN
   RAISE EXCEPTION 'Unexpected category department assignments';
 END IF;
 SELECT count(*) INTO missing_banner_slugs FROM public.hero_banners h
 LEFT JOIN public.categories c
   ON c.slug=split_part(split_part(h.cta_link,'category=',2),'&',1)
 WHERE position('category=' IN COALESCE(h.cta_link,''))>0 AND c.id IS NULL;
 IF missing_banner_slugs<>0 THEN
   RAISE EXCEPTION '% banner links still refer to unknown categories', missing_banner_slugs;
 END IF;
END $$;
COMMIT;
