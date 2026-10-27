#!/bin/bash
# Free-walk proof on a Hugging Face CPU job (hfjob --box v3 --wait -- bash scripts/hf-freewalk-job.sh <before sha>): the zone suites at this HEAD, then the 375 stills of the BEFORE tree
# (<before sha>, worktree) and the AFTER tree (this HEAD), each page driven by scripts/free-walk-stills.mjs. The job has no way to hand files back, so the jpegs are printed in the log
# between ==IMG name== and ==END== lines, base64.
set -uo pipefail
BEFORE=${1:?before sha}
ROOT=$(pwd); OUT=/tmp/walk-out; mkdir -p $OUT
echo "== suites"
node test/gate0/extract.mjs >/dev/null 2>&1 || echo "gate0 extract failed"
node --test test/gate0/gate0.test.mjs test/gate0/v3-gate0.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
node --test test/zone-spawns.test.mjs test/zone-opener.test.mjs test/zone-attackers.test.mjs test/zone-loop.test.mjs test/zone-client.test.mjs test/validate.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
echo "== chromium"
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
(apt-get update -qq && apt-get install -y -qq libjpeg-turbo-progs) >/dev/null 2>&1 || echo "apt jpegtran failed"
npx playwright install --with-deps chromium 2>&1 | tail -3 || echo "playwright install failed"
git fetch -q origin "$BEFORE" && git worktree add -q /tmp/before FETCH_HEAD && ln -s "$ROOT/node_modules" /tmp/before/node_modules
run() {   # tree tag query
  (cd "$1" && node scripts/build.mjs | tail -1 && PORT=$((20000 + RANDOM % 5000)) && (node scripts/serve.mjs $PORT >/dev/null 2>&1 & echo $! >/tmp/srv.pid) && sleep 1 &&
    timeout 420 node "$ROOT/scripts/free-walk-stills.mjs" "http://localhost:$PORT" "$OUT" "$2" "$3" 2>&1 | grep -E "kill|walk|back|pageerror|console"; kill "$(cat /tmp/srv.pid)")
}
run /tmp/before before ""
run "$ROOT" after ""
run "$ROOT" flag "postkill=v1"
for f in "$OUT"/*.jpg; do echo "==IMG $(basename "$f")=="; base64 -w0 "$f"; echo; echo "==END=="; done
