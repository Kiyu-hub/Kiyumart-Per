-- Add store_mode column to footer_pages table
-- Values: 'single', 'multivendor', 'both' (default)
ALTER TABLE footer_pages ADD COLUMN IF NOT EXISTS store_mode TEXT DEFAULT 'both';
