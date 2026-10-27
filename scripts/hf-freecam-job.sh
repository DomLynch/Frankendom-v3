#!/bin/bash
# Free-camera proof on a Hugging Face CPU job (hfjob --box v3 --wait -- bash scripts/hf-freecam-job.sh): the camera and zone suites at this HEAD, then the 375 stills of the same tree three ways (the free camera,
# ?freecam=v1 = the lock camera as it was, ?postkill=v1 = the single fight), each page driven by scripts/free-camera-stills.mjs. The job has no way to hand files back, so the jpegs are printed in the log
# between ==IMG name== and ==END== lines, base64.
set -uo pipefail
ROOT=$(pwd); OUT=/tmp/freecam-out; mkdir -p $OUT
echo "== suites"
node test/gate0/extract.mjs >/dev/null 2>&1 || echo "gate0 extract failed"
node --test test/gate0/gate0.test.mjs test/gate0/v3-gate0.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
node --test test/free-camera.test.mjs test/zone-loop.test.mjs test/zone-cues-wiring.test.mjs test/zone-opener.test.mjs test/zone-attackers.test.mjs test/zone-spawns.test.mjs test/camera-zoom.test.mjs test/validate.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)|^not ok"
echo "== chromium"
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
(apt-get update -qq && apt-get install -y -qq libjpeg-turbo-progs) >/dev/null 2>&1 || echo "apt jpegtran failed"
npx playwright install --with-deps chromium 2>&1 | tail -3 || echo "playwright install failed"
node scripts/build.mjs | tail -1
PORT=$((20000 + RANDOM % 5000)); (node scripts/serve.mjs $PORT >/dev/null 2>&1 & echo $! >/tmp/srv.pid); sleep 1
for q in "after:" "before:freecam=v1" "flag:postkill=v1"; do
  timeout 420 node scripts/free-camera-stills.mjs "http://localhost:$PORT" "$OUT" "${q%%:*}" "${q#*:}" 2>&1 | grep -E "fight|kill|walk|pageerror|console"
done
kill "$(cat /tmp/srv.pid)"
for f in "$OUT"/*.jpg; do echo "==IMG $(basename "$f")=="; base64 -w0 "$f"; echo; echo "==END=="; done
