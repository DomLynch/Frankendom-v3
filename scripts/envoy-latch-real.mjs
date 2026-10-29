// The Titan's Envoy LATCH on the BUILT dist at 375 wide with REAL keyboard input (the input layer, no handler calls): walk to the Envoy (ring 3), let him crouch, lunge and latch, then ROLL and watch it break.
//   <tag>-1-tell      the crouch: the green line from him to the hero
//   <tag>-2-latched   latched: the thin tether, stamina draining, the walk slowed
//   <tag>-3-broken    after the roll: he is thrown off
//   node scripts/envoy-latch-real.mjs <base url> <out dir> [tag] [query]      (npm run build, node scripts/serve.mjs; playwright from the machine; CHROME=<path> for a browser)
// The hero's health is topped up in the page each poll so the check is about the latch, not about who wins the trade. Prints one JSON line per check and exits 1 when any fails.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag = 'envoy', query = 'opener=off'] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/envoy-latch-real.mjs <base url> <out dir> [tag] [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
let failed = 0;
page.on('pageerror', (e) => { failed++; console.error('pageerror', e.message); });
const check = (name, ok, extra = {}) => { if (!ok) failed++; console.log(JSON.stringify({ check: name, ok, ...extra })); };
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 72, timeout: 120000 });
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const tap = async (c, ms = 80) => { await key(c, 'keydown'); await page.waitForTimeout(ms); await key(c, 'keyup'); };
const state = () => page.evaluate(() => {
  const z = globalThis.__v3Zone, f = globalThis.__v3Fight, v = globalThis.__v3Mech;   // the held boss's mechanic view (phase, line, t) or null: src/client/main.ts
  if (f?.duel?.fighters?.[0]) f.duel.fighters[0].health = Math.max(f.duel.fighters[0].health, 120);   // test only: keep the hero alive through the trade
  const [h, b] = f?.duel?.fighters ?? [];
  return { engaged: z?.engaged, current: z?.current, spawns: z?.spawns, hero: h && { x: h.body.x, z: h.body.z, phase: h.phase, stamina: h.stamina, exhausted: h.exhausted }, boss: b && { x: b.body.x, z: b.body.z, phase: b.phase, health: b.health },
    mech: { id: globalThis.__v3Mechanics?.of?.('parasite')?.core?.id ?? null, view: v ? { phase: v.phase, t: v.t } : null }, tick: f?.duel?.tick };
});

await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(2000);
const s0 = await state();
const spot = s0.spawns.find((s) => /parasite/.test(s.id));
check('the Envoy has a spawn in the zone', !!spot, { id: spot?.id });

// the walk basis, then walk (running) to the Envoy's spot with the real keys until he fights
async function basis(code) { const a = (await state()).hero; await key(code, 'keydown'); await page.waitForTimeout(700); await key(code, 'keyup'); await page.waitForTimeout(200); const b = (await state()).hero, d = [b.x - a.x, b.z - a.z], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; }
const fw = await basis('KeyW'), rt = await basis('KeyD');
await key('ShiftLeft', 'keydown');
for (let i = 0; i < 1500; i++) {
  const s = await state(); if (s.engaged && s.spawns[s.current]?.id === spot.id) break;
  const dx = spot.x - s.hero.x, dz = spot.z - s.hero.z, n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
  for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
  await page.waitForTimeout(150);
}
for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA', 'ShiftLeft']) await key(c, 'keyup');
const fought = await page.waitForFunction(() => globalThis.__v3Mechanics?.of?.('parasite')?.core?.id === 'envoy-latch' && globalThis.__v3Zone?.engaged, null, { timeout: 30000 }).then(() => true, () => false);
check('the Envoy fights and carries the envoy-latch mechanic', fought, { state: await state() });

// the crouch (tell), then the lunge lands on a hero who stands (no guard, no roll)
const seen = async (phase, ms) => { const end = Date.now() + ms; while (Date.now() < end) { const s = await state(); if (s.mech?.view?.phase === phase) return s; await page.waitForTimeout(40); } return null; };
const tell = await seen('tell', 25000);
check('he crouches: the tell (a line to the hero) shows', !!tell, { tell });
if (tell) await shot('1-tell');
const latched = await seen('latched', 8000);
check('the lunge lands: LATCHED on a hero who stands', !!latched, { latched });
if (latched) {
  await page.waitForTimeout(200); await shot('2-latched');
  const a = await state(); await page.waitForTimeout(1500); const b = await state();
  check('latched: stamina drains', b.hero.stamina < a.hero.stamina - 5 || b.hero.stamina <= 41, { before: a.hero.stamina, after: b.hero.stamina });
  const p0 = (await state()).hero; await key('KeyW', 'keydown'); await page.waitForTimeout(1000); await key('KeyW', 'keyup'); const p1 = (await state()).hero;
  const speed = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('latched: the walk is slowed (under 2.2 m/s, a free walk is 3)', speed < 2.2, { speed });
  // ROLL with the real key: the latch breaks
  await tap('KeyE');
  const rolled = await page.waitForFunction(() => !globalThis.__v3Mech || globalThis.__v3Mech.phase !== 'latched', null, { timeout: 4000 }).then(() => true, () => false);
  const after = await state();
  check('ROLL breaks the latch', rolled && after.mech?.view?.phase !== 'latched', { after });
  await shot('3-broken');
}
await browser.close();
process.exit(failed ? 1 : 0);
