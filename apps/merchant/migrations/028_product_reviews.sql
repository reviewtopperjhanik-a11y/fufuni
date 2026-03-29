-- Migration 028: Product reviews and ratings
-- Allows authenticated customers to leave a star rating and optional comment.
-- Reviews are moderated by default (status = 'pending').

CREATE TABLE IF NOT EXISTS product_reviews (
  id          TEXT PRIMARY KEY,                              -- UUID
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,                                 -- display name at review time
  author_email TEXT NOT NULL,                                -- for moderation notifications
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'approved', 'rejected')),
  is_verified_purchase INTEGER NOT NULL DEFAULT 0,           -- 1 if linked to a real order
  order_id    TEXT REFERENCES orders(id) ON DELETE SET NULL,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Fast lookup: all approved reviews for a product (ordered by creation date)
CREATE INDEX IF NOT EXISTS idx_product_reviews_product
  ON product_reviews (product_id, status, created_at DESC);

-- Fast lookup: all reviews by a customer
CREATE INDEX IF NOT EXISTS idx_product_reviews_customer
  ON product_reviews (customer_id);

-- Computed rating cache: avoid recalculating on every page load.
-- SQLite 3.35+ (used in Cloudflare DO) supports ADD COLUMN IF NOT EXISTS.
ALTER TABLE products ADD COLUMN review_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE products ADD COLUMN average_rating REAL    NOT NULL DEFAULT 0.0;
