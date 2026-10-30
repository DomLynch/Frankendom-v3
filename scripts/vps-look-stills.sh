#!/bin/bash
# The look-thumb 375 stills on the VPS (headless Chromium, software GL, real two-finger touches), niced: build this tree, serve dist/, run scripts/look-thumb-stills.mjs:
#   free    the gesture with nobody fighting him (opener off so nothing engages)       combat    the same gesture while a boss fights him (the yaw must not move)
#   off     ?look=off: the plain drag the free camera shipped with
#   ssh <user>@<vps-host>'cd <checkout> && nice -n 10 capture --prio 3 v3 bash scripts/vps-look-stills.sh <out dir>'
set -euo pipefail
OUT=${1:?out dir}
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000))
node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
for q in "free:free:opener=off" "combat:combat:" "off:free:look=off&opener=off"; do
  IFS=: read -r tag mode query <<<"$q"
  [ "$mode" = combat ] && export PUSH=0,0 || unset PUSH
  MODE=$mode timeout 420 node scripts/look-thumb-stills.mjs "http://localhost:$PORT" "$OUT" "$tag" "$query" 2>&1 | grep -E "stick pad|before|held|turned|drag|after|RESULT|pageerror|console" || true
done
