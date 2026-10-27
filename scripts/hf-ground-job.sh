#!/bin/bash
# Zone open-ground proof on a Hugging Face CPU job (hfjob --box v3 --wait -- bash scripts/hf-ground-job.sh): Gate 0 + the zone suites at this HEAD, then the 375 stills of the
# hero at the pit's old wall edge looking out, BEFORE (?ground=v1 = the pit's floor as it was) and AFTER (the open ground), driven by scripts/ground-stills.mjs. The job has no way to
# hand files back, so the jpegs are printed in the log between ==IMG name== and ==END== lines, base64.
set -uo pipefail
ROOT=$(pwd); OUT=/tmp/ground-out; mkdir -p $OUT
echo "== gate0 + zone suites"
git fetch -q origin tag v1-seed-82a994d15 2>/dev/null || true
node test/gate0/extract.mjs >/dev/null 2>&1 || echo "gate0 extract failed"
node --test test/gate0/gate0.test.mjs test/gate0/v3-gate0.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
node --test test/zone-ground.test.mjs test/zone-spawns.test.mjs test/zone-opener.test.mjs test/zone-attackers.test.mjs test/zone-loop.test.mjs test/validate.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)|^not ok"
echo "== chromium"
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
npx playwright install chromium 2>&1 | tail -3 || echo "playwright install failed"   # the box job is not root: no apt, no --with-deps
command -v jpegtran >/dev/null || { npm i --no-save --no-audit --no-fund jpegtran-bin >/dev/null 2>&1; export PATH="$ROOT/node_modules/jpegtran-bin/vendor:$PATH"; command -v jpegtran || echo "no jpegtran"; }   # scripts/build.mjs packs textures losslessly
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000)); (node scripts/serve.mjs $PORT >/dev/null 2>&1 & echo $! >/tmp/srv.pid); sleep 1
timeout 600 node scripts/ground-stills.mjs "http://localhost:$PORT" "$OUT" before "ground=v1&opener=off" 2>&1 | grep -E "done|pageerror|console"
timeout 600 node scripts/ground-stills.mjs "http://localhost:$PORT" "$OUT" after "opener=off" 2>&1 | grep -E "done|pageerror|console"
kill "$(cat /tmp/srv.pid)"
for f in "$OUT"/*.jpg; do echo "==IMG $(basename "$f")=="; base64 -w0 "$f"; echo; echo "==END=="; done
