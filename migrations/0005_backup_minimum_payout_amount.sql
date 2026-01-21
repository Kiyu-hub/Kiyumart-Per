-- Backup existing minimum payout amounts before dropping the column
CREATE TABLE IF NOT EXISTS platform_settings_min_payout_backup AS
SELECT id AS settings_id, minimum_payout_amount, updated_at
FROM platform_settings
WHERE minimum_payout_amount IS NOT NULL;

-- Add an index for easier lookup
CREATE INDEX IF NOT EXISTS idx_platform_settings_min_payout_backup_settings_id ON platform_settings_min_payout_backup(settings_id);
