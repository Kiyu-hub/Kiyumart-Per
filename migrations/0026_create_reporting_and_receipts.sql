-- Centralized report activity audit logs + persistent receipts
-- Non-breaking additive migration.

CREATE TABLE IF NOT EXISTS report_activity_logs (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  requester_role user_role NOT NULL,
  report_type text NOT NULL,
  action text NOT NULL,
  format text,
  status text DEFAULT 'success',
  report_id text,
  scope jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS report_activity_logs_requested_by_idx
  ON report_activity_logs (requested_by);
CREATE INDEX IF NOT EXISTS report_activity_logs_requester_role_idx
  ON report_activity_logs (requester_role);
CREATE INDEX IF NOT EXISTS report_activity_logs_report_type_idx
  ON report_activity_logs (report_type);
CREATE INDEX IF NOT EXISTS report_activity_logs_created_at_idx
  ON report_activity_logs (created_at);

CREATE TABLE IF NOT EXISTS receipts (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_number text NOT NULL UNIQUE,
  order_id varchar NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  generated_by varchar REFERENCES users(id),
  generated_by_role user_role,
  trigger text NOT NULL DEFAULT 'payment_success',
  status text NOT NULL DEFAULT 'generated',
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_order_id_idx
  ON receipts (order_id);
CREATE INDEX IF NOT EXISTS receipts_generated_by_idx
  ON receipts (generated_by);
CREATE INDEX IF NOT EXISTS receipts_updated_at_idx
  ON receipts (updated_at);
