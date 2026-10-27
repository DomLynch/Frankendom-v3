#!/bin/bash
# The skyline against the open ground on the VPS (root: Chromium has its libraries). Usage, from a checkout:
#   bash scripts/vps-ground-sky.sh <tag> <out dir>     builds this tree, runs scripts/ground-sky-stills.mjs at the default camera and ?pitch=horizon, at 0 m and 500 m
set -uo pipefail
TAG=${1:?tag}; OUT=${2:?out dir}; mkdir -p "$OUT"
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000)); node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!
sleep 1
timeout 600 node scripts/ground-sky-stills.mjs "http://localhost:$PORT" "$OUT" "$TAG-default" "opener=off" 2>&1 | tail -5
timeout 600 node scripts/ground-sky-stills.mjs "http://localhost:$PORT" "$OUT" "$TAG-horizon" "opener=off&pitch=horizon" 2>&1 | tail -5
kill $SRV; ls "$OUT"
echo ALLDONE
