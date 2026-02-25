ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_otp varchar(6),
ADD COLUMN IF NOT EXISTS pickup_otp varchar(6);

CREATE INDEX IF NOT EXISTS orders_delivery_otp_idx ON orders(delivery_otp);
CREATE INDEX IF NOT EXISTS orders_pickup_otp_idx ON orders(pickup_otp);
