#!/bin/bash
# Zone spacing proof on a Hugging Face CPU job (hfjob --box v3 --wait -- bash scripts/hf-spacing-job.sh <before sha>): Gate 0 + the zone suites at this HEAD, then the 375 stills of
# the BEFORE tree (<before sha>, worktree) and the AFTER tree (this HEAD), each page driven by scripts/zone-spacing-measure.mjs. The job has no way to hand files back, so the jpegs
# are printed in the log between ==IMG name== and ==END== lines, base64 (decode with scripts/hf-spacing-decode.mjs or `sed -n`).
set -uo pipefail
BEFORE=${1:?before sha}
ROOT=$(pwd); OUT=/tmp/spacing-out; mkdir -p $OUT
echo "== gate0 + zone suites"
node test/gate0/extract.mjs >/dev/null 2>&1 || echo "gate0 extract failed"
node --test test/gate0/gate0.test.mjs test/gate0/v3-gate0.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
node --test test/zone-spawns.test.mjs test/zone-opener.test.mjs test/zone-attackers.test.mjs test/zone-loop.test.mjs test/zone-client.test.mjs test/validate.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
echo "== chromium"
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
(apt-get update -qq && apt-get install -y -qq libjpeg-turbo-progs) >/dev/null 2>&1 || echo "apt jpegtran failed"
npx playwright install --with-deps chromium 2>&1 | tail -3 || echo "playwright install failed"
git fetch -q origin "$BEFORE" && git worktree add -q /tmp/before FETCH_HEAD && cp scripts/zone-spacing-measure.mjs /tmp/before/scripts/ && ln -s "$ROOT/node_modules" /tmp/before/node_modules
run() {   # tree tag
  (cd "$1" && node scripts/build.mjs | tail -1 && PORT=$((20000 + RANDOM % 5000)) && (node scripts/serve.mjs $PORT >/dev/null 2>&1 & echo $! >/tmp/srv.pid) && sleep 1 &&
    timeout 420 node scripts/zone-spacing-measure.mjs "http://localhost:$PORT" "$OUT" "$2" "" 30 2>&1 | grep -E "spots|pairwise|SUMMARY|pageerror"; kill "$(cat /tmp/srv.pid)")
}
run /tmp/before before
run "$ROOT" after
for f in "$OUT"/*.jpg; do echo "==IMG $(basename "$f")=="; base64 -w0 "$f"; echo; echo "==END=="; done
