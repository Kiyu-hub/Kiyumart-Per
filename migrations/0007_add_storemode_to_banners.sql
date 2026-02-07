-- Add store_mode enum type
DO $$ BEGIN
    CREATE TYPE store_mode AS ENUM ('single', 'multivendor', 'both');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add store_mode column to hero_banners table
ALTER TABLE hero_banners
ADD COLUMN IF NOT EXISTS store_mode store_mode DEFAULT 'both';
