#!/usr/bin/env bash
# The corpse cue probe for a Hugging Face CPU job (scripts/hf-job.sh <sha> -- bash scripts/hf-cut-probe.sh "1 -1 2 -2"): playwright + chromium, build, serve, then scripts/cut-stills.mjs
# once per LEAVE offset (metres), printed reads only (NOSHOOT). The job carries no secrets.
set -uo pipefail
OFFSETS=${1:-"1 -1"}
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=21111; node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!; trap 'kill $SRV' EXIT; sleep 2
for L in $OFFSETS; do
  echo "== LEAVE=$L"
  CLICK_MS=3000 NOSHOOT=1 PAUSE_MARGIN=500 TAP=head LEAVE=$L CUE=head AFTER=0,40 timeout 400 node scripts/cut-stills.mjs "http://localhost:$PORT" out "" 2>&1 \
    | grep -E "cue buttons|leaveCorpse|Timeout|rror" | sed 's/{"unit":"Cut [a-z ]*","shown":false},\?//g' | cut -c1-700
done
