#!/usr/bin/env bash
# Copyright (c) 2024-2026 Ronan LE MEILLAT
# License: AGPL-3.0-or-later
#
# Local dev launcher for the Fufuni MCP Worker.
# Sources root .env into .dev.vars then starts wrangler dev.
#
# Usage (from monorepo root):
#   npm run dev:env --workspace=apps/mcp
# Usage (from apps/mcp/):
#   bash ./dev-env.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠  $ENV_FILE not found — starting wrangler dev without env vars."
else
  cp "$ENV_FILE" "$SCRIPT_DIR/.dev.vars"
  echo "✓  Copied $ENV_FILE → .dev.vars"
fi

echo "→  Generating knowledge bundle..."
cd "$SCRIPT_DIR"
npm run gen-knowledge

echo "→  Starting wrangler dev on :8788"
npx wrangler dev "$@"
