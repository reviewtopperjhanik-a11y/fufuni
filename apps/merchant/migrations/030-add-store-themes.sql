-- Migration 030: Add store themes configuration
-- Strictly additive for backward compatibility.

CREATE TABLE IF NOT EXISTS store_themes (
    id         TEXT    PRIMARY KEY,
    name       TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 0,
    config_json TEXT   NOT NULL,
    created_at TEXT    NOT NULL DEFAULT current_timestamp,
    updated_at TEXT    NOT NULL DEFAULT current_timestamp
);

CREATE TRIGGER IF NOT EXISTS trg_store_themes_updated_at
    AFTER UPDATE ON store_themes
    FOR EACH ROW
BEGIN
    UPDATE store_themes SET updated_at = current_timestamp WHERE id = OLD.id;
END;

-- Default Fufuni Classic theme (active by default)
INSERT OR IGNORE INTO store_themes (id, name, is_active, config_json)
VALUES (
    'theme_classic',
    'Fufuni Classic',
    1,
    '{"themeSlug":"light","radius":"md","accentOklch":"oklch(87.41% 0.0128 244.59)"}'
);

-- Luxury Minimal theme (inactive — activate via admin or API)
INSERT OR IGNORE INTO store_themes (id, name, is_active, config_json)
VALUES (
    'theme_luxury',
    'Luxury Minimal',
    0,
    '{"themeSlug":"luxury","radius":"none","accentOklch":"oklch(15% 0 0)"}'
);
