-- Add rider-specific operational state and preferences.
-- Non-breaking: defaults keep existing riders eligible and UI-safe.

ALTER TABLE users
ADD COLUMN IF NOT EXISTS rider_online boolean DEFAULT true;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS rider_preferences jsonb;

CREATE INDEX IF NOT EXISTS users_rider_online_idx ON users(rider_online);

UPDATE users
SET rider_online = true
WHERE role = 'rider' AND rider_online IS NULL;
