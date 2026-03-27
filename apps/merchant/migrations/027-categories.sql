-- Migration 027: Product categories (hierarchical, optional parent)
-- Products can belong to multiple categories via product_categories join table.
-- 
-- Run locally:  npx wrangler d1 execute merchant --local --file migrations/027-categories.sql
-- Run remotely: npx wrangler d1 execute merchant-db --remote --file migrations/027-categories.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  handle      TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  description TEXT,
  parent_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  image_url   TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, category_id)
);

-- Fast lookup: all approved reviews for a product
CREATE INDEX IF NOT EXISTS idx_product_categories_category
  ON product_categories (category_id, position);

-- Fast lookup: category by handle (public endpoints)
CREATE INDEX IF NOT EXISTS idx_categories_handle_active
  ON categories (handle) WHERE status = 'active';

-- Fast lookup: all subcategories of a parent
CREATE INDEX IF NOT EXISTS idx_categories_parent
  ON categories (parent_id) WHERE status = 'active';

-- Auto-update the updated_at column on row changes
CREATE TRIGGER IF NOT EXISTS trg_categories_updated_at
AFTER UPDATE ON categories
FOR EACH ROW
BEGIN
  UPDATE categories SET updated_at = datetime('now') WHERE id = NEW.id;
END;
