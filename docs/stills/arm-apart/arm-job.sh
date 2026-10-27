#!/bin/bash
# Run on a Hugging Face CPU job: hfjob -- bash docs/stills/arm-apart/arm-job.sh
# Renders scripts/cut-stills.mjs (ASIDE / ORBIT / LEAVE framings, TAP=armRight, 375 wide) and prints the key shots as base64 JPEG in the log.
set -uo pipefail
npm i --no-save --no-audit --no-fund playwright@1.62.1 >/dev/null 2>&1
npx playwright install --with-deps chromium >/dev/null 2>&1
node scripts/build.mjs | tail -1
PORT=21234
node scripts/serve.mjs $PORT >/dev/null 2>&1 & SRV=$!; trap 'kill $SRV' EXIT; sleep 2
U=http://localhost:$PORT
run(){ n=$1; shift; echo "== $n: $*"; env AFTER=1,40,200 "$@" timeout 900 node scripts/cut-stills.mjs $U out/$n "" 2>&1 | tail -6; }
run a3 ASIDE=3 TAP=armRight
run a2 ASIDE=2 TAP=armRight
run a3o ASIDE=3 ORBIT=120 TAP=armRight
run a3l ASIDE=3 LEAVE=2.5 TAP=armRight
run a4 ASIDE=4 TAP=armRight
cat > /tmp/jpg.mjs <<'EOF'
import { chromium } from 'playwright'; import { readFileSync, readdirSync } from 'node:fs';
const b = await chromium.launch(); const p = await b.newPage();
for (const d of readdirSync('out')) for (const f of readdirSync(`out/${d}`).filter((x) => /tap-(-1|1|40|200)\.png$/.test(x))) {
  const png = readFileSync(`out/${d}/${f}`).toString('base64');
  const jpg = await p.evaluate(async (s) => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; c.getContext('2d').drawImage(i, 0, 0); return c.toDataURL('image/jpeg', 0.8).split(',')[1]; }, png);
  console.log(`IMG ${d}/${f.replace('.png', '.jpg')} ${jpg}`);
}
await b.close();
EOF
cp /tmp/jpg.mjs ./jpg.mjs && node jpg.mjs
echo DONE
