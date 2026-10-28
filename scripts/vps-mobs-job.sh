#!/bin/bash
# Trash mobs on the BUILT dist at 375 on the VPS (headless Chromium, software GL; numbers are relative only): build, serve dist/, run scripts/mobs-run.mjs.
#   bash scripts/vps-mobs-job.sh <tree> <out dir> <tag>
set -euo pipefail
TREE=$1; OUT=$2; TAG=$3
cd "$TREE"
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
[ -d dist ] || node scripts/build.mjs | tail -1
CHROME=$(ls /root/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | tail -1 || true)
PORT=$((20000 + RANDOM % 5000))
node scripts/serve.mjs $PORT > /dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
uptime
CHROME=$CHROME timeout 900 node ${MOBS_SCRIPT:-scripts/mobs-run.mjs} "http://localhost:$PORT" "$OUT" "$TAG"
uptime
