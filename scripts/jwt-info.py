#!/usr/bin/env python3
# Copyright (c) 2026 Ronan LE MEILLAT
# License: AGPL-3.0-or-later
#
# Reads a JWT from the environment variable JWT_TOKEN and prints safe diagnostic
# claims (sub, exp, aud, scope, permissions, gty) to stdout — the raw token is
# never printed.  Prints an error line on any malformation.
# Usage: JWT_TOKEN=<token> python3 scripts/jwt-info.py
import base64
import datetime
import json
import os
import sys

token = os.environ.get("JWT_TOKEN", "")
if not token:
    print("[jwt-info] JWT_TOKEN is empty or not set")
    sys.exit(1)
if token.count(".") < 2:
    print("[jwt-info] Not a valid JWT (wrong number of segments)")
    sys.exit(1)

try:
    payload = token.split(".")[1]
    payload += "=" * ((4 - len(payload) % 4) % 4)
    claims = json.loads(base64.urlsafe_b64decode(payload))
except Exception as e:
    print(f"[jwt-info] Failed to decode payload: {e}")
    sys.exit(1)

exp = claims.get("exp")
exp_str = datetime.datetime.utcfromtimestamp(exp).strftime("%Y-%m-%dT%H:%M:%SZ") if exp else "N/A"
now = datetime.datetime.utcnow()
remaining = (datetime.datetime.utcfromtimestamp(exp) - now).days if exp else "?"

print(f"[jwt-info] sub         : {claims.get('sub', 'N/A')}")
print(f"[jwt-info] aud         : {claims.get('aud', 'N/A')}")
print(f"[jwt-info] exp         : {exp_str} ({remaining} days remaining)")
print(f"[jwt-info] gty         : {claims.get('gty', 'N/A')}")
print(f"[jwt-info] scope       : {claims.get('scope', 'N/A')}")
print(f"[jwt-info] permissions : {claims.get('permissions', 'N/A')}")
print(f"[jwt-info] azp         : {claims.get('azp', 'N/A')}")
