#!/bin/bash
# Audit 5 before/after on a job (hfjob -- bash scripts/perf-bone-cache-job.sh <base sha>): builds this checkout (after) and <base sha>'s src+data (before) side by side,
# serves each, and runs scripts/perf-bone-cache.mjs alternately (RUNS each, default 3). Prints one JSON row per run to the job log.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${1:?usage: scripts/perf-bone-cache-job.sh <base sha>}; RUNS=${RUNS:-3}
command -v jpegtran >/dev/null || { apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq libjpeg-turbo-progs >/dev/null 2>&1; }
[ -d node_modules/playwright ] || npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1 || npx playwright install chromium >/dev/null 2>&1
[ -d node_modules/esbuild ] || npm ci --no-audit --no-fund >/dev/null 2>&1
stage() { mkdir -p "/tmp/$1/scripts"; cp -r dist "/tmp/$1/dist"; cp scripts/serve.mjs "/tmp/$1/scripts/serve.mjs"; }
node scripts/build.mjs | tail -1; stage after
git fetch -q --depth 1 origin "$BASE"; git checkout -q FETCH_HEAD -- src data
node scripts/build.mjs | tail -1; stage before
node /tmp/before/scripts/serve.mjs 21001 >/dev/null 2>&1 & S1=$!
node /tmp/after/scripts/serve.mjs 21002 >/dev/null 2>&1 & S2=$!
trap 'kill $S1 $S2' EXIT
sleep 2
echo "uptime: $(uptime)"; echo "cores: $(nproc)"
for i in $(seq "$RUNS"); do
  node scripts/perf-bone-cache.mjs "before-$i" http://localhost:21001
  node scripts/perf-bone-cache.mjs "after-$i" http://localhost:21002
done
