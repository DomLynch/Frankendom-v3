// Kachujin's Shadow Dash on the BUILT game with REAL keyboard input (data/mechanics.json "shadow-dash"). The hero walks to his spot, is aggroed, and then:
//   A. leaves the line (runs sideways once it locks): the dash must happen, he must NOT cut, and he must stand open through the recovery;
//   B. stands and guards: the dash lands, the cut comes, and the guard takes it (no health lost, a Blocked or Parried event).
// Also shoots 375-wide stills of the tell (locked line) and the dash (afterimages). Pass/fail is printed and the exit code says it.
//   node scripts/shadow-dash-check.mjs <base url> <out dir>          (serve dist with scripts/serve.mjs; needs playwright)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/shadow-dash-check.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const SPOT = [196.93 - 226, 126.87 - 47];   // ring-2-kachujin-0 in the sim frame: data/zones/zone1.row.json pit origin (226, 47)
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error('pageerror', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('console', m.text().slice(0, 200)); });
await page.goto(`${base}/?opener=off`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(2000);
// an in-page recorder: every sim tick's events, the mechanic phase and both healths (the page runs at 60 Hz; this polls faster)
await page.evaluate(() => {
  const log = (globalThis.__rec = []); let last = -1;
  setInterval(() => {
    const p = globalThis.__v3Fight, m = globalThis.__v3Mech; if (!p || p.duel.tick === last) return; last = p.duel.tick;
    log.push({ tick: last, phase: m?.state?.phase ?? null, locked: !!m?.state?.locked, foe: p.duel.fighters[1].phase, hp: p.playerHealth, foeHp: p.health, ev: p.events.filter((e) => e.type !== 'PhaseChanged').map((e) => `${e.type}:${e.actor}`) });
    if (log.length > 20000) log.splice(0, 5000);
  }, 3);
});
const st = () => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight, m = globalThis.__v3Mech?.state; return { engaged: z?.engaged, hero: [f.fighter.x, f.fighter.z], foe: [f.enemy.x, f.enemy.z], gap: Math.hypot(f.fighter.x - f.enemy.x, f.fighter.z - f.enemy.z), phase: m?.phase, locked: m?.locked, hp: f.playerHealth, foeHp: f.health, tick: f.duel.tick, foePhase: f.duel.fighters[1].phase }; });
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const release = async () => { for (const c of ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'ShiftLeft', 'KeyQ']) await key(c, 'keyup'); };
// which screen key moves the hero which way (the camera yaw is the page's): measured by a short press of each
async function basis(code) { const a = (await st()).hero; await key(code, 'keydown'); await page.waitForTimeout(500); await key(code, 'keyup'); await page.waitForTimeout(200); const b = (await st()).hero, d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; }
const fw = await basis('KeyW'), rt = await basis('KeyD');
const steer = async (target, stopWithin, withRun = false) => {   // hold the keys that carry the hero toward `target`
  const s = await st(), dx = target[0] - s.hero[0], dz = target[1] - s.hero[1], n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
  for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3], ['ShiftLeft', withRun]]) await key(c, on ? 'keydown' : 'keyup');
  return n <= stopWithin;
};
const results = [], ok = (name, pass, note = '') => { results.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${note}`); };

// walk to him until aggro
for (let i = 0; i < 900; i++) { const s = await st(); if (s.engaged) break; await steer(SPOT, 1.5, true); await page.waitForTimeout(120); }
await release();
let s = await st();
ok('aggroed Kachujin by real walking', !!s.engaged, `gap ${s.gap.toFixed(1)}`);

// hold the hero about 5 m from him (back off / close in) until the tell begins; returns the state at the tell
async function toTell() {
  for (let i = 0; i < 1500; i++) {
    const c = await st();
    if (c.phase === 'tell') return c;
    const away = c.gap < 4.5, near = c.gap > 6.2;
    await key('KeyS', away ? 'keydown' : 'keyup'); await key('KeyW', near ? 'keydown' : 'keyup'); await key('KeyA', 'keyup'); await key('KeyD', 'keyup');
    await page.waitForTimeout(60);
  }
  return null;
}
const lockWait = async () => { for (let i = 0; i < 400; i++) { const c = await st(); if (c.locked || c.phase === 'dash') return c; await page.waitForTimeout(8); } return null; };

// A. leave the line
let t = await toTell(); await release();
ok('A: the tell begins when I hold 4.5-6.2 m away', !!t, t ? `gap ${t.gap.toFixed(1)}` : '');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/shadow-dash-tell.png` });
const lockedAt = await lockWait();
await page.screenshot({ path: `${out}/shadow-dash-locked.png` });
await key('ShiftLeft', 'keydown'); await key('KeyD', 'keydown');   // run sideways, off the locked line
const mark = (await st()).tick;
let shot = false;
for (let i = 0; i < 400; i++) { const c = await st(); if (c.phase === 'dash' && !shot) { shot = true; await page.waitForTimeout(40); await page.screenshot({ path: `${out}/shadow-dash-trail.png` }); } if (c.phase === 'recover' || (c.tick - mark > 400)) break; await page.waitForTimeout(8); }
await release();
await page.waitForTimeout(1500);
let rec = await page.evaluate((from) => globalThis.__rec.filter((r) => r.tick >= from), mark);
const phasesA = [...new Set(rec.map((r) => r.phase))];
ok('A: the dash happens (dash then recover seen)', phasesA.includes('dash') && phasesA.includes('recover'), phasesA.join('>'));
const cutA = rec.filter((r) => r.ev.includes('AttackStarted:1'));
ok('A: no cut at a hero who left the line', cutA.length === 0, `cuts ${cutA.length}`);
const recoverA = rec.filter((r) => r.phase === 'recover');
ok('A: he stood open for the recovery (never attacking)', recoverA.length >= 40 && recoverA.every((r) => r.foe !== 'attack'), `recover ticks ${recoverA.length}`);
ok('A: no health lost', rec.every((r) => r.hp >= rec[0].hp), `hp ${rec[0]?.hp} -> ${rec.at(-1)?.hp}`);

// B. stand and guard
t = await toTell(); await release();
ok('B: a second tell after the cooldown', !!t);
await lockWait();
await key('KeyQ', 'keydown');   // guard, held
const markB = (await st()).tick;
for (let i = 0; i < 600; i++) { const c = await st(); if (c.phase === 'recover' || c.tick - markB > 500) break; await page.waitForTimeout(10); }
await page.waitForTimeout(400); await release();
rec = await page.evaluate((from) => globalThis.__rec.filter((r) => r.tick >= from), markB);
ok('B: he dashed in and cut', rec.some((r) => r.phase === 'dash') && rec.some((r) => r.ev.includes('AttackStarted:1')));
ok('B: the guard answered the cut (Blocked or Parried)', rec.some((r) => r.ev.some((e) => /^(Blocked|Parried):/.test(e))), rec.flatMap((r) => r.ev).filter((e) => /Blocked|Parried|Hit/.test(e)).join(','));
console.log(results.every(Boolean) ? 'ALL PASS' : 'FAILED');
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
