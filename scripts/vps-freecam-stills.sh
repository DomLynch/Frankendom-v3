#!/bin/bash
# The free-camera 375 stills on the VPS (headless Chromium, software GL), niced: build this tree, serve dist/, run scripts/free-camera-stills.mjs three ways:
#   after   the free camera (the default)       before  ?freecam=v1 (the lock camera as it was)       flag  ?postkill=v1 (the single fight)
#   ssh <user>@<vps-host>'cd <checkout> && nice -n 10 capture --prio 3 v3 bash scripts/vps-freecam-stills.sh <out dir>'
set -euo pipefail
OUT=${1:?out dir}
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000))
node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
for q in "after:" "before:freecam=v1" "flag:postkill=v1"; do
  timeout 420 node scripts/free-camera-stills.mjs "http://localhost:$PORT" "$OUT" "${q%%:*}" "${q#*:}" 2>&1 | grep -E "fight|kill|walk|pageerror|console" || true
done
