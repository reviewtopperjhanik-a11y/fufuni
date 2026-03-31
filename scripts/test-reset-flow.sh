#!/usr/bin/env bash
# Copyright (c) 2026 Ronan LE MEILLAT
# License: AGPL-3.0-or-later
#
# Local validation of the reset-demo workflow logic.
# Sources .env from the repo root and runs all steps against the real Auth0 tenant.
# Usage:
#   ./scripts/test-reset-flow.sh           # full run including reset call
#   ./scripts/test-reset-flow.sh --dry-run # skip step 4 (POST /v1/setup/reset)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# Load .env
ENV_FILE="$REPO_ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "ERROR: $ENV_FILE not found" >&2
  exit 1
fi
# Export all non-comment, non-empty lines
set -o allexport
# shellcheck disable=SC1090
source <(grep -v '^\s*#' "$ENV_FILE" | grep -v '^\s*$' | sed 's/^[[:space:]]*//')
set +o allexport

echo "=== Step 1: Check/obtain Management API token ==="
NOW=$(date +%s)
THRESHOLD=$((NOW + 604800))
EXP=$(JWT_TOKEN="${AUTH0_MANAGEMENT_TOKEN:-}" python3 "$SCRIPT_DIR/jwt-exp.py")

if [[ "$EXP" -gt "$THRESHOLD" ]]; then
  echo "Reusing stored management token:"
  JWT_TOKEN="${AUTH0_MANAGEMENT_TOKEN}" python3 "$SCRIPT_DIR/jwt-info.py"
  MGMT_TOKEN="$AUTH0_MANAGEMENT_TOKEN"
else
  echo "Stored token expired or absent (exp=$EXP threshold=$THRESHOLD) — obtaining new 30-day management token..."
  MGMT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "https://${AUTH0_DOMAIN}/oauth/token" \
    -H "Content-Type: application/json" \
    -d "{
      \"client_id\":\"${AUTH0_MANAGEMENT_API_CLIENT_ID}\",
      \"client_secret\":\"${AUTH0_MANAGEMENT_API_CLIENT_SECRET}\",
      \"audience\":\"https://${AUTH0_DOMAIN}/api/v2/\",
      \"grant_type\":\"client_credentials\"
    }")
  MGMT_STATUS=$(echo "$MGMT_RESPONSE" | tail -1)
  MGMT_BODY=$(echo "$MGMT_RESPONSE" | sed '$d')
  echo "Auth0 management token request: HTTP $MGMT_STATUS"
  if [[ "$MGMT_STATUS" -ne 200 ]]; then
    echo "ERROR: Failed to obtain management token — $(echo "$MGMT_BODY" | jq -r '.error_description // .error // "unknown"')" >&2
    exit 1
  fi
  MGMT_TOKEN=$(echo "$MGMT_BODY" | jq -r '.access_token')
  echo "New management token claims:"
  JWT_TOKEN="$MGMT_TOKEN" python3 "$SCRIPT_DIR/jwt-info.py"
  echo "(In CI this token would be persisted via: gh secret set AUTH0_MANAGEMENT_TOKEN)"
fi

echo ""
echo "=== Step 2: Upsert client grant (POST, then PATCH on 409) ==="
echo "Target audience: ${AUTH0_AUDIENCE}"
echo "Scopes: ${ADMIN_STORE_PERMISSION} ${DATABASE_PERMISSION}"

GRANT_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "https://${AUTH0_DOMAIN}/api/v2/client-grants" \
  -H "Authorization: Bearer $MGMT_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\":\"${AUTH0_MANAGEMENT_API_CLIENT_ID}\",
    \"audience\":\"${AUTH0_AUDIENCE}\",
    \"scope\":[\"${ADMIN_STORE_PERMISSION}\",\"${DATABASE_PERMISSION}\"]
  }")
GRANT_STATUS=$(echo "$GRANT_RESPONSE" | tail -1)
GRANT_BODY=$(echo "$GRANT_RESPONSE" | sed '$d')

if [[ "$GRANT_STATUS" -eq 201 ]]; then
  echo "Client grant created (HTTP 201)"
elif [[ "$GRANT_STATUS" -eq 409 ]]; then
  echo "Grant already exists (409) — fetching grant ID to PATCH scopes..."
  GRANT_ID=$(curl -s \
    "https://${AUTH0_DOMAIN}/api/v2/client-grants?client_id=${AUTH0_MANAGEMENT_API_CLIENT_ID}&audience=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "${AUTH0_AUDIENCE}")" \
    -H "Authorization: Bearer $MGMT_TOKEN" | jq -r '.[0].id // empty')
  if [[ -z "$GRANT_ID" ]]; then
    echo "ERROR: Could not retrieve grant ID for PATCH" >&2
    exit 1
  fi
  echo "Patching grant $GRANT_ID..."
  PATCH_RESPONSE=$(curl -s -w "\n%{http_code}" -X PATCH "https://${AUTH0_DOMAIN}/api/v2/client-grants/${GRANT_ID}" \
    -H "Authorization: Bearer $MGMT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"scope\":[\"${ADMIN_STORE_PERMISSION}\",\"${DATABASE_PERMISSION}\"]}")
  PATCH_STATUS=$(echo "$PATCH_RESPONSE" | tail -1)
  PATCH_BODY=$(echo "$PATCH_RESPONSE" | sed '$d')
  if [[ "$PATCH_STATUS" -ge 200 && "$PATCH_STATUS" -lt 300 ]]; then
    echo "Grant patched (HTTP $PATCH_STATUS) — scopes: $(echo "$PATCH_BODY" | jq -r '.scope')"
  else
    echo "ERROR: PATCH failed (HTTP $PATCH_STATUS): $PATCH_BODY" >&2
    exit 1
  fi
else
  echo "ERROR: Unexpected grant response HTTP $GRANT_STATUS: $(echo "$GRANT_BODY" | jq -r '.message // .error // "unknown"')" >&2
  exit 1
fi

echo ""
echo "=== Step 3: Obtain API token for ${AUTH0_AUDIENCE} ==="
echo "Requesting scope: ${ADMIN_STORE_PERMISSION} ${DATABASE_PERMISSION}"
API_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "https://${AUTH0_DOMAIN}/oauth/token" \
  -H "Content-Type: application/json" \
  -d "{
    \"client_id\":\"${AUTH0_MANAGEMENT_API_CLIENT_ID}\",
    \"client_secret\":\"${AUTH0_MANAGEMENT_API_CLIENT_SECRET}\",
    \"audience\":\"${AUTH0_AUDIENCE}\",
    \"scope\":\"${ADMIN_STORE_PERMISSION} ${DATABASE_PERMISSION}\",
    \"grant_type\":\"client_credentials\"
  }")
API_STATUS=$(echo "$API_RESPONSE" | tail -1)
API_BODY=$(echo "$API_RESPONSE" | sed '$d')
echo "Auth0 API token request: HTTP $API_STATUS"
if [[ "$API_STATUS" -ne 200 ]]; then
  echo "ERROR: Failed to obtain API token — $(echo "$API_BODY" | jq -r '.error_description // .error // "unknown"')" >&2
  exit 1
fi
API_TOKEN=$(echo "$API_BODY" | jq -r '.access_token')
echo "API token claims:"
JWT_TOKEN="$API_TOKEN" python3 "$SCRIPT_DIR/jwt-info.py"

echo ""
echo "=== Step 4: POST /v1/setup/reset ==="
if [[ "$DRY_RUN" == "true" ]]; then
  echo "[dry-run] Skipping reset call to ${API_BASE_URL}/v1/setup/reset"
  echo "SUCCESS (dry-run)"
  exit 0
fi

RESET_RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "${API_BASE_URL}/v1/setup/reset" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")
RESET_STATUS=$(echo "$RESET_RESPONSE" | tail -1)
RESET_BODY=$(echo "$RESET_RESPONSE" | sed '$d')
echo "Reset returned HTTP $RESET_STATUS"
if [[ "$RESET_STATUS" -lt 200 || "$RESET_STATUS" -ge 300 ]]; then
  echo "ERROR: Reset failed (HTTP $RESET_STATUS): $RESET_BODY" >&2
  exit 1
fi
echo "Reset successful: $RESET_BODY"
