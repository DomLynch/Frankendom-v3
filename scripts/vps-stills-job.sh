#!/bin/bash
# 375 stills on the VPS (headless Chromium, software GL): build the synced tree, serve dist/, run scripts/stills.mjs for each query.
#   rsync -az --delete --exclude .git --exclude node_modules --exclude dist --exclude .claude --exclude .gate0 ./ root@49.12.7.18:/root/f3v-stills/
#   ssh root@49.12.7.18 'capture --prio 3 v3 bash /root/f3v-stills/scripts/vps-stills-job.sh /root/f3v-stills /root/f3v-stills/out "" "cam=v1"'
#   scp 'root@49.12.7.18:/root/f3v-stills/out/*.png' <local dir>/   (then sips -Z 812 -s format jpeg for PR bodies)
set -euo pipefail
TREE=$1; OUT=$2; shift 2
cd "$TREE"
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000))
node scripts/serve.mjs $PORT > /dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 1
timeout 600 node scripts/stills.mjs "http://localhost:$PORT" "$OUT" "$@"
