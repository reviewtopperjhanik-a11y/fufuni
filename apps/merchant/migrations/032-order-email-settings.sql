-- Migration 032: Order status email notifications
-- Stores per-status (or global fallback) email template configuration.
-- Templates support {{placeholders}} for order data and a JSON locale map for subject.

CREATE TABLE IF NOT EXISTS order_email_settings (
  id           TEXT PRIMARY KEY,
  -- 'global' or one of: payment_failed, processing, shipped, delivered, refunded, canceled
  event        TEXT NOT NULL UNIQUE
               CHECK (event IN ('global','payment_failed','processing','shipped','delivered','refunded','canceled')),
  enabled      INTEGER NOT NULL DEFAULT 0,   -- 1 = send email for this event
  -- subject: plain string (all locales) OR JSON locale map {"en-US":"...","fr-FR":"..."}
  subject      TEXT NOT NULL DEFAULT '',
  -- html_body: Handlebars-like template with {{orderNumber}}, {{customerName}},
  --            {{total}}, {{orderUrl}}, {{storeName}}, {{status}}, {{trackingNumber}}
  html_body    TEXT NOT NULL DEFAULT '',
  text_body    TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Add locale column to orders so we know which language to use for emails
ALTER TABLE orders ADD COLUMN locale TEXT NOT NULL DEFAULT 'en-US';
