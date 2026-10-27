#!/bin/bash
# The ground stills on the VPS (root, so Chromium has its libraries; the Hugging Face box job is not root and has none): build this tree, serve it, run scripts/ground-stills.mjs
# BEFORE (?ground=v1) and AFTER, into <out dir> (default /tmp/ground-out).
#   ssh root@49.12.7.18 'cd <checkout> && capture --prio 3 v3 bash scripts/vps-ground-stills.sh [out dir]'
set -uo pipefail
OUT=${1:-/tmp/ground-out}; rm -rf "$OUT"; mkdir -p "$OUT"
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000)); node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!
sleep 1
timeout 900 node scripts/ground-stills.mjs "http://localhost:$PORT" "$OUT" before "ground=v1&opener=off" 2>&1 | tail -12
timeout 900 node scripts/ground-stills.mjs "http://localhost:$PORT" "$OUT" after "opener=off" 2>&1 | tail -12
kill $SRV; ls "$OUT"
echo ALLDONE
