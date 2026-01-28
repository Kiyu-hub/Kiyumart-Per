-- Create promotional_ads table
CREATE TYPE promo_type AS ENUM ('store', 'product');

CREATE TABLE IF NOT EXISTS promotional_ads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type promo_type NOT NULL,
  target_id uuid NOT NULL,
  start_at timestamp,
  end_at timestamp,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS promotional_ads_type_idx ON promotional_ads(type);
CREATE INDEX IF NOT EXISTS promotional_ads_active_idx ON promotional_ads(is_active);
