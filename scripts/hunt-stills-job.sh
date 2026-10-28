#!/usr/bin/env bash
# Runs scripts/hunt-stills.mjs on the BUILT dist inside an hfjob (hf-cpu, SwiftShader) and prints the PNGs as base64 between B64START/B64END lines, so the stills come back through the job log
# (decode: awk between the markers | base64 -d). No token is read or printed.
set -u
apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq libjpeg-turbo-progs >/dev/null 2>&1
npm run build >/dev/null 2>&1 || { echo BUILD_FAILED; exit 1; }
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
node scripts/serve.mjs 8733 >/dev/null 2>&1 &
sleep 3
DSF=1 node scripts/hunt-stills.mjs http://localhost:8733 /tmp/hs hs; echo "EXIT=$?"
for f in /tmp/hs/*.png; do echo "B64START $(basename "$f")"; base64 -w0 "$f"; echo; echo B64END; done
