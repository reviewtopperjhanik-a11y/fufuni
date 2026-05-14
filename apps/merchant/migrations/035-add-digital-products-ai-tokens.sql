-- Migration 035: Add support for digital (downloadable) products and AI token packages.
--
-- Changes:
--   1. Add variant_type and ai_token_units columns to variants.
--   2. Create digital_assets table linking a SKU to its downloadable file.
--   3. Create ai_token_balances table tracking per-customer token credits keyed by api_key.
--   4. Create ai_token_transactions table for an immutable credit/debit audit log.

-- 1. Extend variants with a product type discriminator and token unit count.
ALTER TABLE variants ADD COLUMN variant_type TEXT NOT NULL DEFAULT 'physical'
  CHECK (variant_type IN ('physical', 'digital', 'ai_tokens'));
ALTER TABLE variants ADD COLUMN ai_token_units INTEGER;

CREATE INDEX IF NOT EXISTS idx_variants_type ON variants (variant_type);

-- 2. Downloadable file metadata bound to a SKU.
--    storage_type = 'url'  → storage_value is a plain HTTPS URL (external CDN / S3 / R2 public URL)
--    storage_type = 'r2'   → storage_value is the R2 object key (served via DIGITAL_ASSETS_BUCKET binding)
CREATE TABLE IF NOT EXISTS digital_assets (
  id            TEXT PRIMARY KEY,
  sku           TEXT NOT NULL UNIQUE REFERENCES inventory (sku) ON DELETE CASCADE,
  storage_type  TEXT NOT NULL DEFAULT 'url' CHECK (storage_type IN ('url', 'r2')),
  storage_value TEXT NOT NULL,
  filename      TEXT NOT NULL,
  content_type  TEXT NOT NULL DEFAULT 'application/octet-stream',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER IF NOT EXISTS trg_digital_assets_updated_at
AFTER UPDATE ON digital_assets
FOR EACH ROW
BEGIN
  UPDATE digital_assets SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- 3. Per-customer AI token balance, keyed by the customer's ai-proxy API key.
--    customer_id may be NULL when the balance was credited before the customer linked their key.
CREATE TABLE IF NOT EXISTS ai_token_balances (
  customer_id    TEXT PRIMARY KEY REFERENCES customers (id) ON DELETE CASCADE,
  api_key        TEXT NOT NULL,
  balance_units  INTEGER NOT NULL DEFAULT 0,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Allow fast proxy-side balance lookup by api_key alone.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_token_balances_api_key ON ai_token_balances (api_key);

-- 4. Immutable audit log for every credit and debit.
--    amount is positive for credits, negative for debits.
CREATE TABLE IF NOT EXISTS ai_token_transactions (
  id           TEXT PRIMARY KEY,
  api_key      TEXT NOT NULL,
  customer_id  TEXT REFERENCES customers (id) ON DELETE SET NULL,
  order_id     TEXT REFERENCES orders (id) ON DELETE SET NULL,
  amount       INTEGER NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('credit', 'debit')),
  note         TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_token_transactions_api_key ON ai_token_transactions (api_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_token_transactions_order   ON ai_token_transactions (order_id);
