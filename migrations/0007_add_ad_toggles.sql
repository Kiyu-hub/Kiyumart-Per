-- Add toggles for individual ad placements
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS hero_banner_enabled boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS sidebar_ad_enabled boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS footer_ad_enabled boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS product_page_ad_enabled boolean DEFAULT true;
