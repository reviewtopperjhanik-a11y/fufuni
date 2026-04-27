#!/usr/bin/env sh
set -eu

if [ $# -ne 1 ]; then
  echo "Usage: $0 path/to/@github/copilot/sdk/index.js"
  exit 1
fi

file="$1"

perl -pi -e '
  s/if\(!vr\(e,lXe\)\{/if(!vr(e,lXe) && e.includeCoAuthoredBy!==false){/;
  s/if\(!n&&r.cwd&&vr\(e,lXe\)\)\{/if(!n&&r.cwd&&vr(e,lXe) && e.includeCoAuthoredBy!==false){/;
' "$file"

echo "Patched $file"
