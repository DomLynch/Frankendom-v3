#!/bin/bash
# The heavy-blow stumble stills for ?feel=limbs on an hfjob (HF CPU, software GL): hfjob --timeout 1h -- bash scripts/limbs-hf.sh
# Builds, serves, sweeps the limbs-only run over where the hero stands (AWAY) and when the heavy lands (HEAVY), picks the variant with the most stumbles, reruns it as default vs limbs (375 wide, jpeg),
# and prints the result tarball base64 between LIMBS-TAR markers (a job has no other way out):  sed -n '/LIMBS-TAR-BEGIN/,/LIMBS-TAR-END/p' log | sed '1d;$d' | base64 -d | tar xz
set -uo pipefail
PORT=8761; OUT=/tmp/limbs-out; mkdir -p "$OUT"
node scripts/build.mjs >/tmp/build.log 2>&1 || { echo "build failed"; tail -15 /tmp/build.log; exit 1; }
(node scripts/serve.mjs $PORT >/tmp/serve.log 2>&1 &); sleep 3
npm i --no-save playwright@1.62.1 >/dev/null 2>&1 && npx playwright install --with-deps chromium >/dev/null 2>&1 || { echo "playwright install failed"; exit 1; }
export DPR=1 FMT=jpg EVERY=6 LIMB=leg QUIET=150 AT=480 SECONDS=3
best=""; bestn=-1
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
cd "$OUT/final"
# keep the reports, every crop, and every second full frame
for f in leg-default-[0-9][0-9][0-9].jpg leg-limbs-[0-9][0-9][0-9].jpg; do b=${f%.jpg}; n=$((10#${b##*-})); [ $((n % 2)) -eq 1 ] && rm -f "$f"; done
ls | wc -l; du -sh .
echo LIMBS-TAR-BEGIN; tar czf - . | base64; echo LIMBS-TAR-END
