#!/bin/bash
# Free-camera suites on a Hugging Face CPU job (hfjob --box v3 --wait -- bash scripts/hf-freecam-job.sh): the Gate 0 replay and the camera / zone suites at this HEAD. The box has no root, so no Chromium and no
# jpegtran (the build needs it): the 375 stills run on the VPS, scripts/vps-freecam-stills.sh.
set -uo pipefail
echo "== suites"
node test/gate0/extract.mjs >/dev/null 2>&1 || echo "gate0 extract failed"
node --test test/gate0/gate0.test.mjs test/gate0/v3-gate0.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)"
node --test test/free-camera.test.mjs test/zone-loop.test.mjs test/zone-cues-wiring.test.mjs test/zone-opener.test.mjs test/zone-attackers.test.mjs test/zone-spawns.test.mjs test/camera-zoom.test.mjs test/validate.test.mjs 2>&1 | grep -E "^# (pass|fail|tests)|^not ok"
