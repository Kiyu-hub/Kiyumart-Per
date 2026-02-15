-- Create promotion_pricing table for seller promotion pricing
CREATE TABLE promotion_pricing (
  id SERIAL PRIMARY KEY,
  type VARCHAR(10) NOT NULL CHECK (type IN ('store', 'product')),
  duration_type VARCHAR(10) NOT NULL CHECK (duration_type IN ('hour', 'day')),
  duration INTEGER NOT NULL CHECK (duration > 0),
  price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for efficient lookups
CREATE INDEX promotion_pricing_type_duration_idx ON promotion_pricing (type, duration_type, duration);

-- Insert default pricing
INSERT INTO promotion_pricing (type, duration_type, duration, price) VALUES
('store', 'hour', 1, 2.00),
('store', 'hour', 24, 30.00),
('product', 'hour', 1, 1.00),
('product', 'hour', 24, 15.00);