-- Add per-social toggles to platform_settings
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_facebook boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_instagram boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_twitter boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_linkedin boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_youtube boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_tiktok boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_pinterest boolean DEFAULT true;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS show_whatsapp boolean DEFAULT true;
