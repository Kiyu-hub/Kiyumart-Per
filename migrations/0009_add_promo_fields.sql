-- Add detailed fields to promotional_ads for richer promotions
ALTER TABLE promotional_ads
  ADD COLUMN IF NOT EXISTS title text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS description text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS image_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cta_text varchar DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cta_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS theme_color varchar DEFAULT NULL;

-- Index for active promotions by end date
CREATE INDEX IF NOT EXISTS promotional_ads_endat_idx ON promotional_ads(end_at);
