#!/bin/bash
# HF job body for V3 #171 evidence: build, serve, run the stills (JOB=stills, default) or the 10-kill run (JOB=kills); results go to the log between BEGIN/END markers (tar.gz, base64).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
command -v jpegtran >/dev/null || { apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq libjpeg-turbo-progs >/dev/null 2>&1; }
command -v jpegtran >/dev/null || { echo "no jpegtran"; exit 1; }
npm run build > /tmp/build.log 2>&1 || { tail -40 /tmp/build.log; echo BUILD-FAILED; exit 1; }
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/tmp/pw.log 2>&1 || { tail -5 /tmp/pw.log; echo "playwright install failed"; exit 1; }   # the image bakes Chromium for this version; the package is not a V3 dependency
echo "build ok"; node scripts/serve.mjs 4188 > /tmp/serve.log 2>&1 &
sleep 3; curl -sf localhost:4188/ >/dev/null || { echo "serve failed"; exit 1; }
out=/tmp/ev; mkdir -p $out
if [ "${JOB:-stills}" = stills ]; then
  for attempt in 1 2 3; do
    FINISHERS=splitCrown,decapitation,runThrough,opened AFTER=4,64 JSON=$out/stills.json timeout 1500 node scripts/finisher-cuts-stills.mjs http://localhost:4188 $out "${Q:-ragdoll=finishers}" 2>&1 | tee -a $out/stills.log && break
    echo "attempt $attempt failed, retrying"
  done
else
  { node scripts/gore-kills.mjs http://localhost:4188 10 "" ; node scripts/gore-kills.mjs http://localhost:4188 10 "gore=v1"; } 2>&1 | tee $out/kills.log
fi
echo "=====BEGIN-TARBALL"; tar czf - -C $out . | base64; echo "=====END-TARBALL"
