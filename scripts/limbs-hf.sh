#!/bin/bash
# The heavy-blow stumble stills for ?feel=limbs on an hfjob (HF CPU, software GL): hfjob --timeout 1h -- bash scripts/limbs-hf.sh
# Builds, serves, sweeps the limbs-only run over where the hero stands (AWAY) and when the heavy lands (HEAVY), picks the variant with the most stumbles, reruns it as default vs limbs (375 wide, jpeg),
# and prints the result tarball base64 between LIMBS-TAR markers (a job has no other way out):  sed -n '/LIMBS-TAR-BEGIN/,/LIMBS-TAR-END/p' log | sed '1d;$d' | base64 -d | tar xz
set -uo pipefail
shopt -s nullglob   # an unmatched glob is an empty list, never a literal (an arithmetic error on it once aborted the FIXED branch and fell into the sweep)
PORT=8761; OUT=/tmp/limbs-out; mkdir -p "$OUT"
command -v jpegtran >/dev/null || { apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq libjpeg-progs >/dev/null 2>&1; }   # the build's art step shells out to jpegtran
node scripts/build.mjs >/tmp/build.log 2>&1 || { echo "build failed"; tail -15 /tmp/build.log; exit 1; }
(node scripts/serve.mjs $PORT >/tmp/serve.log 2>&1 &); sleep 3
npm i --no-save playwright@1.62.1 >/dev/null 2>&1 && npx playwright install --with-deps chromium >/dev/null 2>&1 || { echo "playwright install failed"; exit 1; }
export DPR=1 FMT=jpg EVERY=6 LIMB=leg QUIET=150 AT=480 SECS=3   # SECS, not SECONDS: that one is bash's own clock
best=""; bestn=-1
# FIXED mode (bash scripts/limbs-hf.sh <away> <heavy> [aside]): no sweep, the one rerun that was chosen on the Mac (AWAY=2.5 ASIDE=1.0 HEAVY=60), few frames out
if [ $# -ge 2 ]; then
  export AWAY=$1 HEAVY=$2 EVERY=3 SECS=2.5 FROM=19; [ -n "${3:-}" ] && export ASIDE=$3   # frames 19..60 only (the heavy lands near 41), the rest are counted, not shot
  node scripts/limbs-stills.mjs http://localhost:$PORT "$OUT/final" 2>&1 | grep -v 'Failed to load'
  cd "$OUT/final" || { echo "the run left no output: nothing to send"; exit 1; }   # (never tar the checkout into the log)
  for f in leg-*-[0-9][0-9][0-9].jpg; do n=$((10#$(basename "${f%.jpg}" | sed 's/.*-//'))); case "$f" in *crop*) { [ $n -ge 20 ] && [ $n -le 56 ] && [ $((n % 3)) -eq 2 ]; } || rm -f "$f" ;; *) case $n in 41|47|53) ;; *) rm -f "$f" ;; esac ;; esac; done
  ls | wc -l; du -sh .
  echo LIMBS-TAR-BEGIN; tar czf - . | base64; echo LIMBS-TAR-END
  exit 0
fi
for away in 2 3.5; do for heavy in 30 60 90; do
  d=/tmp/sweep-$away-$heavy
  line=$(AWAY=$away HEAVY=$heavy node scripts/limbs-stills.mjs http://localhost:$PORT "$d" 'rules=m4&feel=limbs' 2>&1 | grep 'leg-limbs: .* frames' || true)
  n=$(echo "$line" | sed -n 's/.*stumbles \([0-9]*\).*/\1/p'); n=${n:-0}
  echo "SWEEP away=$away heavy=$heavy: $line"
  if [ "$n" -gt "$bestn" ]; then best="$away $heavy"; bestn=$n; fi
done; done
echo "BEST away/heavy=$best stumbles=$bestn"
set -- $best
AWAY=$1 HEAVY=$2 node scripts/limbs-stills.mjs http://localhost:$PORT "$OUT/final" 2>&1 | grep -v 'Failed to load'
cd "$OUT/final" || { echo "the run left no output: nothing to send"; exit 1; }
# keep the reports, every crop, and every second full frame
for f in leg-default-[0-9][0-9][0-9].jpg leg-limbs-[0-9][0-9][0-9].jpg; do b=${f%.jpg}; n=$((10#${b##*-})); [ $((n % 2)) -eq 1 ] && rm -f "$f"; done
ls | wc -l; du -sh .
echo LIMBS-TAR-BEGIN; tar czf - . | base64; echo LIMBS-TAR-END
