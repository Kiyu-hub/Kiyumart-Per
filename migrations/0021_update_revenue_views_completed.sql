-- Align revenue views to strict completed-only accounting.
-- Revenue is counted only when order.status = 'completed' and payment is paid.

CREATE OR REPLACE VIEW daily_revenue AS
SELECT
  date_trunc('day', coalesce(o.updated_at, o.delivered_at, o.created_at))::date AS revenue_date,
  o.currency,
  count(*) AS completed_orders,
  coalesce(sum(o.total::numeric), 0) AS total_revenue
FROM orders o
WHERE lower(cast(o.payment_status as text)) IN ('completed', 'paid', 'success')
  AND o.status = 'completed'
GROUP BY revenue_date, o.currency;

CREATE OR REPLACE VIEW seller_revenue AS
SELECT
  o.seller_id,
  o.currency,
  count(*) AS completed_orders,
  coalesce(sum(o.total::numeric), 0) AS total_revenue
FROM orders o
WHERE lower(cast(o.payment_status as text)) IN ('completed', 'paid', 'success')
  AND o.status = 'completed'
GROUP BY o.seller_id, o.currency;
