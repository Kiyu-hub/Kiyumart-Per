ALTER TABLE platform_settings
  ADD COLUMN IF NOT EXISTS mapbox_public_token text,
  ADD COLUMN IF NOT EXISTS mapbox_style_url text DEFAULT 'mapbox://styles/mapbox/dark-v11',
  ADD COLUMN IF NOT EXISTS mapbox_gl_version text DEFAULT 'v3.4.0';
