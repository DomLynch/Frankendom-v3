// Kachujin's SHADOW DASH on the BUILT game with REAL input (keys), 375 wide (data/mechanics.json "shadow-dash"). Reads globalThis.__v3Mech (the mechanic's view: stage 'tell' | 'lunge', lock) and the sim's own events.
//   node scripts/shadow-dash-check.mjs <base url> <out dir> [query]      (serve dist with scripts/serve.mjs; needs playwright; env CHROME_PATH, DSF)
//   A. leaves the line (rolls off it with E+D when it locks, keeps D held): he dashes, he must NOT cut (no boss AttackStarted in the whole move window), the hero loses no health.
//   B. stands on the line: he dashes in and cuts once (a boss AttackStarted after the dash).
// The move window is read off the row (tell + dash + cut + recovery ticks), never a number written here. Stills of the locked line and of the dash land in <out dir>. Exit 1 on a failed check.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [base, out, query = 'opener=off'] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/shadow-dash-check.mjs <base url> <out dir> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const ROW = JSON.parse(readFileSync(new URL('../data/mechanics.json', import.meta.url), 'utf8')).mechanics['shadow-dash'];
const WINDOW = ROW.tellTicks + ROW.dashMaxTicks + ROW.slashMaxTicks + ROW.recoverTicks;   // ticks from the first tell tick to the end of the move
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error('pageerror', e.message));
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(2000);
const SPOT = await page.evaluate(() => { const s = globalThis.__v3Zone.spawns.find((o) => /kachujin/.test(o.id)); return [s.x, s.z]; });   // his ring spot in the sim's frame, read off the live zone
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const state = () => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight, m = globalThis.__v3Mech; return { engaged: z?.engaged, hero: f && [f.fighter.x, f.fighter.z], foe: f && [f.enemy.x, f.enemy.z], gap: f && Math.hypot(f.fighter.x - f.enemy.x, f.fighter.z - f.enemy.z), stage: m?.stage ?? 'none', lock: !!m?.lock, hp: f?.playerHealth, tick: f?.duel.tick }; });
const keepAlive = () => page.evaluate(() => { const f = globalThis.__v3Fight; if (f) { const h = f.duel.fighters[0]; h.health = h.maxHealth; } });
// the recorder: every sim tick, the stage, the lock, the hero's health and the boss's attack starts (the page runs at 60 Hz; this polls faster)
await page.evaluate(() => {
  const log = (globalThis.__rec = []); let last = -1;
  setInterval(() => {
    const p = globalThis.__v3Fight, m = globalThis.__v3Mech; if (!p || p.duel.tick === last) return; last = p.duel.tick;
    log.push({ tick: last, stage: m?.stage ?? 'none', lock: !!m?.lock, hp: p.playerHealth, cut: p.events.some((e) => e.type === 'AttackStarted' && e.actor === 1), foe: p.duel.fighters[1].phase });
    if (log.length > 20000) log.splice(0, 5000);
  }, 3);
});
const fails = [];
const check = (ok, what) => { console.log(ok ? 'ok  ' : 'FAIL', what); if (!ok) fails.push(what); };

// 1. down 9 m south of his spot, then walk in with the real W key until he aggros
await page.evaluate(([x, z]) => { globalThis.__pin = setInterval(() => { const g = globalThis.__v3Fight; for (const o of [g.fighter, g.duel.fighters[0].body]) { o.x = x; o.z = z; } }, 16); }, [SPOT[0], SPOT[1] + 9]);
await page.waitForTimeout(3000);
await page.evaluate(() => clearInterval(globalThis.__pin));
await page.waitForTimeout(6000);   // the far body streams in
for (let i = 0; i < 400; i++) {
  const s = await state(); if (s.engaged) break;
  await key('KeyW', Math.hypot(s.foe[0] - s.hero[0], s.foe[1] - s.hero[1]) > 2.2 ? 'keydown' : 'keyup'); await page.waitForTimeout(120);
}
await key('KeyW', 'keyup');
check((await state()).engaged, 'he aggroed on a hero who walked in');

// hold the hero 4.5 to 6.2 m from him (back off / close in) until the tell begins
async function toTell() {
  for (let i = 0; i < 1500; i++) {
    const c = await state();
    if (c.stage === 'tell') return c;
    await keepAlive(); await key('KeyS', c.gap < 4.5 ? 'keydown' : 'keyup'); await key('KeyW', c.gap > 6.2 ? 'keydown' : 'keyup'); await page.waitForTimeout(60);
  }
  return null;
}
const release = async () => { for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyE']) await key(c, 'keyup'); };
const window_ = (from) => page.evaluate(([from, n]) => globalThis.__rec.filter((r) => r.tick >= from && r.tick <= from + n), [from, WINDOW]);

// A. leave the line
let t = await toTell(); await release();
check(!!t, 'A: the tell began when I held 4.5 to 6.2 m away');
const startA = t.tick;
for (let i = 0; i < 400 && !(await state()).lock; i++) await page.waitForTimeout(8);
await page.screenshot({ path: `${out}/shadow-dash-locked.png` });
await key('KeyD', 'keydown'); await key('KeyE', 'keydown'); await page.waitForTimeout(60); await key('KeyE', 'keyup');   // roll sideways off the locked line; D stays held
let shot = false;
for (let i = 0; i < 600; i++) { const c = await state(); if (c.stage === 'lunge' && !shot) { shot = true; await page.waitForTimeout(40); await page.screenshot({ path: `${out}/shadow-dash-dash.png` }); } if (c.tick - startA > WINDOW) break; await page.waitForTimeout(8); }
await release(); await page.waitForTimeout(500);
let rec = await window_(startA);
check(rec.some((r) => r.stage === 'lunge'), 'A: he dashed');
check(!rec.some((r) => r.cut), `A: no cut at a hero who left the line (cuts at ${rec.filter((r) => r.cut).map((r) => r.tick)})`);
check(rec.every((r) => r.hp >= rec[0].hp), `A: no health lost (${rec[0]?.hp} -> ${rec.at(-1)?.hp})`);

// B. stand on the line
await keepAlive();
t = await toTell(); await release();
check(!!t, 'B: a second tell after the cooldown');
const startB = t.tick;
for (let i = 0; i < 600; i++) { const c = await state(); if (c.tick - startB > WINDOW) break; await keepAlive(); await page.waitForTimeout(8); }
rec = await window_(startB);
const dashed = rec.findIndex((r) => r.stage === 'lunge');
check(dashed >= 0, 'B: he dashed');
check(rec.slice(Math.max(0, dashed)).some((r) => r.cut), 'B: he cut a hero who stood on the line');

console.log(fails.length ? `FAILED ${fails.length}` : 'ALL PASS');
await browser.close();
process.exit(fails.length ? 1 : 0);
