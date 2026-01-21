-- Drop the minimum_payout_amount column from platform_settings
ALTER TABLE platform_settings DROP COLUMN IF EXISTS minimum_payout_amount;
