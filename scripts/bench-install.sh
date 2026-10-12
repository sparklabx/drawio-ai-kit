#!/usr/bin/env bash
# Cold-cache install benchmark: time `npm install <spec>` into a throwaway prefix + empty npm cache.
# usage: scripts/bench-install.sh [spec]   (default: a fresh `npm pack` of this checkout)
set -euo pipefail
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
spec=${1:-}
if [ -z "$spec" ]; then
  spec="$tmp/$(npm pack --silent --pack-destination "$tmp" | tail -1)"
  echo "packed: $(wc -c <"$spec" | tr -d ' ') bytes"
fi
start=$(node -p "Date.now()")
npm install --prefix "$tmp/inst" --cache "$tmp/cache" --no-audit --no-fund --loglevel=error "$spec" >/dev/null
echo "install: $(node -p "(($(node -p "Date.now()")-$start)/1000).toFixed(1)") s  ($spec)"
echo "on disk: $(du -sh "$tmp/inst" | cut -f1)"
"$tmp/inst/node_modules/.bin/drawio-ai" search lambda | grep -q '"name":"lambda"' && echo "smoke: ok"
