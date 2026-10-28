#!/bin/bash
# The keyboard/mouse + landscape stills on the VPS (headless Chromium, software GL), niced: build this tree, serve dist/, shoot the three screens (landscape phone 812x375, desktop 1280x720 and 1920x1080, portrait 375x812):
#   ssh root@49.12.7.18 'cd <checkout> && nice -n 10 bash scripts/vps-kbm-stills.sh <out dir> <tag prefix> [query]'
set -euo pipefail
OUT=${1:?out dir}; PRE=${2:?tag prefix}; QUERY=${3:-}
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000))
node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
for row in "land:812x375:touch" "hd:1280x720:desktop" "fhd:1920x1080:desktop" "port:375x812:touch"; do
  IFS=: read -r name size kind <<<"$row"
  timeout 600 node scripts/kbm-stills.mjs "http://localhost:$PORT" "$OUT" "$PRE-$name" "$size" "$kind" "$QUERY" 2>&1 | grep -E "ready|later|click|page errors" || true
done
