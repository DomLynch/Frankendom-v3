// Heat and the hunt (data/heat.json, src/heat.ts, src/zone/hunters.ts), 375 wide, on the BUILT dist, real time. The hero is handed heat through the page's hook (__v3Heat.add: a kill pays it in play) and stands clear of the camps:
//   <tag>-1-heat      the heat line under the coin line ("Heat 4 · Marked")
//   <tag>-2-warning   the announcement line
//   <tag>-3-chasing   the hunter has arrived behind him: the orange radar dot, the hunter drawn walking at him
//   <tag>-4-fight     it stands within its aggro: the 1v1 (zone state: the held boss is the hunter)
// It prints the page state at each beat and fails on a page error, a console error or a beat that did not happen.
//   node scripts/hunt-stills.mjs <base url> <out dir> <tag>      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/hunt-stills.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 2), isMobile: true, hasTouch: true });
let bad = 0;
const fail = (m) => { bad++; console.error(`${tag} FAIL ${m}`); };
page.on('pageerror', (e) => { bad++; console.error(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') { bad++; console.error(`console ${m.text()}`); } });
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const look = () => page.evaluate(() => {
  const h = globalThis.__v3Heat, z = globalThis.__v3Zone, q = (s) => document.querySelector(s);
  const hunters = h.hunt.slots.map((s) => { const sp = h.spawn(s.index); return { i: s.index, chasing: s.chasing, engaged: s.engaged, warned: s.warnedAt !== null, x: +sp.x.toFixed(1), z: +sp.z.toFixed(1), standing: sp.deadFor === null }; });
  const f = globalThis.__v3Fight?.fighter;
  return { heat: h.heat.count, hud: q('.heat-line')?.textContent ?? null, line: q('.ul-line')?.textContent ?? null, hero: f ? { x: +f.x.toFixed(1), z: +f.z.toFixed(1) } : null, hunters, held: z ? { current: z.current, engaged: z.engaged, attackers: z.attackers.map((a) => a.id) } : null };
});
await page.goto(`${base}/`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
const ready = await look(); console.log(`${tag} ready`, JSON.stringify(ready));
if (ready.heat !== 0 || ready.hud !== null) fail('a fresh game has no heat and no heat line');
await page.evaluate(() => { globalThis.__v3Heat.add(4); });
await page.waitForTimeout(1200); await shot('1-heat');
const heated = await look(); console.log(`${tag} heated`, JSON.stringify(heated));
if (heated.heat !== 4 || !/^Heat 4 · Marked$/.test(heated.hud ?? '')) fail(`the heat line (${heated.hud})`);
// the announcement (tier 3 waits arrivalDelaySeconds x 0.35, floor 15 s)
await page.waitForFunction(() => globalThis.__v3Heat.hunt.slots.some((s) => s.warnedAt !== null), null, { timeout: 90000 });
await page.waitForTimeout(600); await shot('2-warning');
const warned = await look(); console.log(`${tag} warned`, JSON.stringify(warned));
if (!/hunter/i.test(warned.line ?? '')) fail(`the announcement line (${warned.line})`);
await page.waitForFunction(() => globalThis.__v3Heat.hunt.slots.some((s) => s.chasing), null, { timeout: 60000 });
await page.waitForTimeout(1500); await shot('3-chasing');
const chasing = await look(); console.log(`${tag} chasing`, JSON.stringify(chasing));
const walker = chasing.hunters.find((s) => s.chasing);
if (!walker || walker.standing) fail('a hunter walks and is not yet a standing boss');
// it closes on the standing hero and the zone's aggro takes over
await page.waitForFunction(() => globalThis.__v3Heat.hunt.slots.some((s) => s.engaged), null, { timeout: 90000 });
await page.waitForTimeout(2500); await shot('4-fight');
const fight = await look(); console.log(`${tag} fight`, JSON.stringify(fight));
const engagedSlot = fight.hunters.find((s) => s.engaged);
if (!engagedSlot || !engagedSlot.standing) fail('the hunter stands within its aggro');
if (!fight.held || !(fight.held.attackers.length || fight.held.engaged)) fail(`a fight began (${JSON.stringify(fight.held)})`);
await browser.close();
console.log(bad ? `${tag} FAILED (${bad})` : `${tag} OK`);
process.exit(bad ? 1 : 0);
