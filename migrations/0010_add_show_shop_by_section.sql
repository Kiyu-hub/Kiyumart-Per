-- Add show_shop_by_section toggle to platform_settings
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_shop_by_section BOOLEAN DEFAULT true;
