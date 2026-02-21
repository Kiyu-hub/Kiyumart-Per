-- Phase 2: Revenue/statistics normalization views (non-breaking, read-only)

CREATE OR REPLACE VIEW order_payments AS
SELECT
  o.id AS order_id,
  o.order_number,
  o.buyer_id,
  o.seller_id,
  o.status AS order_status,
  o.payment_status,
  o.total,
  o.currency,
  o.created_at AS order_created_at,
  o.delivered_at,
  t.id AS transaction_id,
  t.status AS transaction_status,
  t.amount AS transaction_amount,
  t.payment_provider,
  t.payment_reference,
  t.created_at AS transaction_created_at
FROM orders o
LEFT JOIN transactions t ON t.order_id = o.id;

CREATE OR REPLACE VIEW daily_revenue AS
SELECT
  date_trunc('day', coalesce(o.delivered_at, o.created_at))::date AS revenue_date,
  o.currency,
  count(*) AS completed_orders,
  coalesce(sum(o.total::numeric), 0) AS total_revenue
FROM orders o
WHERE lower(cast(o.payment_status as text)) IN ('completed', 'paid', 'success')
  AND o.status = 'delivered'
GROUP BY revenue_date, o.currency;

CREATE OR REPLACE VIEW seller_revenue AS
SELECT
  o.seller_id,
  o.currency,
  count(*) AS completed_orders,
  coalesce(sum(o.total::numeric), 0) AS total_revenue
FROM orders o
WHERE lower(cast(o.payment_status as text)) IN ('completed', 'paid', 'success')
  AND o.status = 'delivered'
GROUP BY o.seller_id, o.currency;

CREATE OR REPLACE VIEW platform_commission AS
SELECT
  c.id AS commission_id,
  c.order_id,
  c.seller_id,
  c.commission_rate,
  c.commission_amount,
  c.platform_amount,
  c.seller_amount,
  c.status AS commission_status,
  c.created_at AS commission_created_at
FROM commissions c;
