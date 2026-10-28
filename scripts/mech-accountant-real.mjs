// THE ACCOUNTANT'S PARRY WALL on the BUILT dist with REAL INPUT (keyboard events the page's own input reads), 375 wide: the hero walks into the Accountant's aggro, the fight begins, the first wall rises on its own
// (data/mechanics.json firstTicks), and the script strikes into it with the strike key. It PRINTS and ASSERTS (exit 1 on a failed check):
//   - the tell is seen (state ticks 1..tellTicks, the boss planted: no step), then the wall stands (ticks above tellTicks)
//   - every strike into the wall is parried: the boss's health never falls while it stands, the hero staggers, a `Parried` event with `wall` is seen (the spark)
//   - once the wall is down the same strike lands: the boss's health falls (the mechanic is a window, not a shield)
// and takes stills:  <out>/<tag>-tell.png (feet planted, ring and wall rising, caption)  <out>/<tag>-wall.png (the wall standing)  <out>/<tag>-spark.png (the frame after a parry)  <out>/<tag>-after.png
//   node scripts/mech-accountant-real.mjs <base url> <out dir> [tag] [query]      env: SPAWN=ring-3-the-boss-0, DIST=5, HEADED=1
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [base, out, tag = 'acct', query = 'opener=off'] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/mech-accountant-real.mjs <base url> <out dir> [tag] [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const ROW = JSON.parse(readFileSync(new URL('../data/mechanics.json', import.meta.url), 'utf8')).mechanics['accountant-parry-wall'];
const KEYS = JSON.parse(readFileSync(new URL('../data/input.json', import.meta.url), 'utf8')).keys;
const SPAWN = process.env.SPAWN ?? 'ring-3-the-boss-0', DIST = Number(process.env.DIST ?? 5);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => { console.error(`${tag}: pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') console.error(`${tag}: console ${m.text().slice(0, 200)}`); });
await page.addInitScript(() => {   // record the sim's per-frame events the page hands out (the practice object is re-assigned each frame): wall parries and hits on the boss
  globalThis.__wallLog = { parries: 0, bossHits: 0, wallBreaks: 0 };
  let cur; Object.defineProperty(globalThis, '__v3Fight', { configurable: true, get: () => cur, set: (v) => { cur = v; for (const e of v?.events ?? []) { if (e.type === 'Parried' && e.wall) globalThis.__wallLog.parries++; if (e.type === 'Hit' && e.target === 1) globalThis.__wallLog.bossHits++; if (e.type === 'Staggered' && e.actor === 1 && e.wall) globalThis.__wallLog.wallBreaks++; } } });
});
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(1500);
const spawn = await page.evaluate((id) => globalThis.__v3Zone.spawns.find((s) => s.id === id), SPAWN);
if (!spawn) { console.error(`${tag}: no spawn ${SPAWN} (${(await page.evaluate(() => globalThis.__v3Zone.spawns.map((s) => s.id))).join(', ')})`); process.exit(3); }
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const tap = async (code, ms = 60) => { await key(code, 'keydown'); await page.waitForTimeout(ms); await key(code, 'keyup'); };
const heroAt = () => page.evaluate(() => { const f = globalThis.__v3Fight.fighter; return [f.x, f.z]; });
const basis = async (code) => { const a = await heroAt(); await key(code, 'keydown'); await page.waitForTimeout(500); await key(code, 'keyup'); await page.waitForTimeout(300); const b = await heroAt(), d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; };
await page.evaluate(([s, d]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + d; f.z = s.z; }, [spawn, DIST]);   // set down short of the spawn: the zone's aggro does the rest
await page.waitForTimeout(500);
const fw = await basis(KEYS.forward[0]), rt = await basis(KEYS.right[0]);
await page.evaluate(([s, d]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + d; f.z = s.z; }, [spawn, DIST]);
await page.waitForTimeout(500);
for (let i = 0; i < 1200 && !(await page.evaluate(() => globalThis.__v3Zone.engaged)); i++) {
  const h = await heroAt(), dx = spawn.x - h[0], dz = spawn.z - h[1], n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
  for (const [c, on] of [[KEYS.forward[0], f > 0.3], [KEYS.back[0], f < -0.3], [KEYS.right[0], r > 0.3], [KEYS.left[0], r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
  if (i > 40 && n < 4) await page.evaluate(([s, ux, uz]) => { const q = globalThis.__v3Fight.fighter; q.x = s.x - ux * 2; q.z = s.z - uz * 2; }, [spawn, dx / n, dz / n]);
  await page.waitForTimeout(100);
}
for (const k of ['forward', 'back', 'left', 'right']) await key(KEYS[k][0], 'keyup');
if (!(await page.evaluate(() => globalThis.__v3Zone.engaged))) { console.error(`${tag}: the Accountant did not engage; hero`, JSON.stringify(await heroAt()), 'spawn', JSON.stringify(spawn), 'basis', JSON.stringify([fw, rt]), JSON.stringify(await page.evaluate(() => ({ cur: globalThis.__v3Zone.current ?? null, eng: globalThis.__v3Zone.engaged, near: globalThis.__v3Zone.spawns.length })))); await page.screenshot({ path: `${out}/${tag}-noengage.png` }); process.exit(3); }
const st = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; return { hero: h.phase, heroHp: h.health, mech: f.mech ?? null, mS: f.mS ?? 0, mC: f.mC ?? 0, foe: f.phase, hp: f.health, at: [f.body.x, f.body.z], log: { ...globalThis.__wallLog } }; });
const fail = []; const check = (ok, what) => { console.log(`${tag}: ${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fail.push(what); };
let s = await st();
check(s.mech === 'accountant-parry-wall', `the live boss carries the mechanic (${s.mech})`);
await tap(KEYS.strike[0]);   // draws the sword (the fight opens sheathed)
// wait for the first wall to start on its own (firstTicks, then in range), keeping the hero in reach by walking at him
let sawTell = false, home = null;
for (let i = 0; i < 1800 && !(s.mS > ROW.tellTicks); i++) {
  s = await st();
  if (s.mS > 0 && s.mS <= ROW.tellTicks) {
    if (!sawTell) { sawTell = true; home = s.at; await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${tag}-tell.png` }); console.log(`${tag}: tell at tick ${s.mS}`); }
  }
  if (!s.mS) { const d = await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; return Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z); }); if (d > 1.6) { await key(KEYS.forward[0], 'keydown'); await page.waitForTimeout(120); await key(KEYS.forward[0], 'keyup'); } else await page.waitForTimeout(100); }
  else await page.waitForTimeout(16);
}
s = await st();
check(sawTell, 'the tell was seen (state ticks inside tellTicks)');
check(s.mS > ROW.tellTicks, `the wall stands (state tick ${s.mS} > ${ROW.tellTicks})`);
if (home) check(Math.hypot(s.at[0] - home[0], s.at[1] - home[1]) < 0.05, 'he stayed planted from the tell into the window');
await page.screenshot({ path: `${out}/${tag}-wall.png` });
const hp0 = s.hp; let minHp = hp0, parriedShot = false, heroHurt = 0, strikes = 0, last = 0;
const logAt0 = s.log.parries;
for (let i = 0; i < 600 && s.mS > ROW.tellTicks; i++) {   // strike into the standing wall every time the hero is free
  s = await st(); minHp = Math.min(minHp, s.hp);
  if (s.hero === 'hurt') heroHurt++;
  if (s.hero === 'ready' && i - last > 10) { await tap(KEYS.strike[0]); strikes++; last = i; }
  if (!parriedShot && s.log.parries > logAt0) { parriedShot = true; await page.waitForTimeout(40); await page.screenshot({ path: `${out}/${tag}-spark.png` }); }
  await page.waitForTimeout(16);
}
s = await st();
check(strikes >= 1, `struck into the wall (${strikes} strikes)`);
check(s.log.parries >= 1, `the sim parried (${s.log.parries} Parried events with wall)`);
check(minHp === hp0, `ZERO damage while the wall stood (boss health ${hp0} -> min ${minHp})`);
check(heroHurt > 0, 'the attacker staggered');
check(s.mC > 0 || s.mS === 0, `the wall is down and cooling (cooldown ${s.mC})`);
await page.screenshot({ path: `${out}/${tag}-after.png` });
// the same strike now lands
const hpBefore = s.hp;
for (let i = 0; i < 400 && (await st()).hp >= hpBefore; i++) { const t = await st(); if (t.hero === 'ready') await tap(KEYS.strike[0]); await page.waitForTimeout(60); }
s = await st();
check(s.hp < hpBefore, `after the wall, a strike lands (boss health ${hpBefore} -> ${s.hp})`);
await browser.close();
if (fail.length) { console.error(`${tag}: ${fail.length} check(s) failed`); process.exit(1); }
console.log(`${tag}: all checks passed`);
