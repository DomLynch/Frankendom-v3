#!/bin/bash
# The open-world frame-cost rows on a job (hfjob -- bash scripts/perf-open-world-job.sh [corpses ...]): build, serve dist/, run scripts/perf-open-world.mjs once per corpse count
# (default 0 2 4: none, the M8 row's two, data/physics.json corpse.max). The table goes to the job log; the json files to $OUT (default ./perf-out).
#   env: RUNS SECS (see the script), OUT
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=${OUT:-$PWD/perf-out}
command -v jpegtran >/dev/null || { apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq libjpeg-turbo-progs >/dev/null 2>&1; }   # the build packs textures with jpegtran (scripts/lossless-jpeg.mjs)
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1 || npx playwright install chromium >/dev/null 2>&1
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000))
node scripts/serve.mjs $PORT > /dev/null 2>&1 & SRV=$!
trap 'kill $SRV' EXIT
sleep 2
echo "uptime: $(uptime)"; echo "cores: $(nproc)"
for c in ${@:-0 2 4}; do
  echo "=== CORPSES=$c ==="
  CORPSES=$c timeout 1500 node scripts/perf-open-world.mjs "http://localhost:$PORT" "$OUT"
done
