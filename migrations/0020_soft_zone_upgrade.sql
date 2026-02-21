ALTER TABLE delivery_zones
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'city',
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS region text;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS rider_city text,
  ADD COLUMN IF NOT EXISTS rider_region text,
  ADD COLUMN IF NOT EXISTS delivery_zone_id varchar REFERENCES delivery_zones(id);

-- Backfill best-effort city metadata from legacy zone name.
UPDATE delivery_zones
SET city = COALESCE(NULLIF(TRIM(city), ''), NULLIF(TRIM(name), ''))
WHERE city IS NULL;

-- Normalize invalid zone types.
UPDATE delivery_zones
SET type = 'city'
WHERE type IS NULL OR lower(type) NOT IN ('city', 'region');
