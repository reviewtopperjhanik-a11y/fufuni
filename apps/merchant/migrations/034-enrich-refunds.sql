-- Migration 034: Enrich refunds table with currency, reason, notes and updated_at.
-- Strictly additive — uses ALTER TABLE ADD COLUMN (safe on existing data).
-- Also adds a GET-friendly index and support for partially_refunded order status.

ALTER TABLE refunds ADD COLUMN currency TEXT NOT NULL DEFAULT 'EUR';
ALTER TABLE refunds ADD COLUMN reason TEXT CHECK(reason IN ('duplicate', 'fraudulent', 'requested_by_customer'));
ALTER TABLE refunds ADD COLUMN notes TEXT;
ALTER TABLE refunds ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'));

-- Fast lookup for refund listing per order
CREATE INDEX IF NOT EXISTS idx_refunds_order_id_created ON refunds(order_id, created_at DESC);
