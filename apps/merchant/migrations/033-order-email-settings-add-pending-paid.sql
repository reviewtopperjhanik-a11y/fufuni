-- Migration 033: Expand order_email_settings CHECK constraint to include 'pending' and 'paid'
-- SQLite does not support ALTER TABLE to modify CHECK constraints, so we recreate the table.

CREATE TABLE IF NOT EXISTS order_email_settings_new (
  id        TEXT PRIMARY KEY,
  event     TEXT NOT NULL UNIQUE
            CHECK (event IN ('global','pending','paid','payment_failed','processing','shipped','delivered','refunded','canceled')),
  enabled   INTEGER NOT NULL DEFAULT 0,
  subject   TEXT NOT NULL DEFAULT '',
  html_body TEXT NOT NULL DEFAULT '',
  text_body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO order_email_settings_new SELECT * FROM order_email_settings;
DROP TABLE order_email_settings;
ALTER TABLE order_email_settings_new RENAME TO order_email_settings;
