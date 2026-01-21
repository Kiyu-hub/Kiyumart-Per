-- Add social URL columns to platform_settings if they do not exist
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS facebook_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS instagram_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS twitter_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS linkedin_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS youtube_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS tiktok_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS pinterest_url text;
ALTER TABLE platform_settings ADD COLUMN IF NOT EXISTS whatsapp_page text;
