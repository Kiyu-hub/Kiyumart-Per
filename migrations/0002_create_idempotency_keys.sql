-- Create idempotency_keys table for payment idempotency handling
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  payload JSONB,
  used BOOLEAN DEFAULT false,
  used_reference TEXT,
  retries INTEGER DEFAULT 0,
  last_attempt TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_used_reference ON idempotency_keys (used_reference);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at ON idempotency_keys (created_at);
