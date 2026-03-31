#!/usr/bin/env python3
# Copyright (c) 2026 Ronan LE MEILLAT
# License: AGPL-3.0-or-later
#
# Reads a JWT from the environment variable JWT_TOKEN and prints its `exp` claim.
# Prints 0 on any error (missing token, malformed JWT, missing claim).
# Usage: JWT_TOKEN=<token> python3 scripts/jwt-exp.py
import base64
import json
import os
import sys

token = os.environ.get("JWT_TOKEN", "")
if not token or token.count(".") < 2:
    print(0)
    sys.exit()

try:
    payload = token.split(".")[1]
    payload += "=" * ((4 - len(payload) % 4) % 4)
    print(json.loads(base64.urlsafe_b64decode(payload)).get("exp", 0))
except Exception:
    print(0)
