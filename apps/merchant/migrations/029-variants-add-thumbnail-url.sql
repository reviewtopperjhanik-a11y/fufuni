-- Migration 029: add thumbnail_url column to variants
-- Used for small WebP thumbnails (≤ 300 px, base64 inline or R2 URL)
ALTER TABLE variants ADD COLUMN thumbnail_url TEXT;
