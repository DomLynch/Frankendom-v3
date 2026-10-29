// The King's AURA on the BUILT game at 375 wide, headless Chromium, through the real input layer (KeyboardEvents walk the hero from the pit to The King; the fight then runs by itself).
//   1 the hero walks to the King (ring 3) and the fight engages        2 the ring (scene object "KingAura") is up, centred on his feet, at the radius the rows give for his health
//   3 over a few seconds the rim flares in the last pulseTellTicks of the period and the wave mesh shows exactly for ticks 1..pulseWaveTicks of it (the sim's tick, read off the live practice)
//   4 stills: engaged, the tell, the wave, each with the ring on and with it hidden (the scene object, a stills-only switch)      5 zero page errors, zero console errors
//   node scripts/king-aura-check.mjs <base url> <out dir>          (npm run build, then node scripts/serve.mjs 8734; playwright from the machine)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { auraPhase, auraRadius } from '../src/fight/mechanics/king-aura.ts';
import { ringedZoneFor } from '../src/zone/zone-rows.ts';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/king-aura-check.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const ROW = JSON.parse(readFileSync(new URL('../data/mechanics.json', import.meta.url), 'utf8')).mechanics['king-aura'];
// The King stands in ring 3, 130 m out, beyond the pit's walk until a first kill frees the hero, so the check takes SPOT="x,z" (the sim's frame) for a STILLS-ONLY build in which a pit spawn's kind is big-vegas
// (never committed: the shipped rows keep the King in ring 3). Without SPOT it aims at the ring-3 row's own position, which only a hero already free to roam can reach.
const RING3 = ringedZoneFor('').spawns.find((s) => s.kind === 'big-vegas').position;
const FOE = process.env.SPOT === 'foe';   // SPOT=foe: walk at whoever the sim holds (the stills-only build's King)
const spotOf = (s) => (FOE ? { x: s.foe[0], z: s.foe[1] } : KING);
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}), args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text().slice(0, 200)}`); });
await page.goto(`${base}/?opener=off`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(2000);
// LOCAL FIX: aim at the LIVE King spawn (ring-3-big-vegas) read off __v3Zone, and stand the hero 12 m short of it (the sim's body, as scripts/king-aggro-probe.mjs does); the walk-in is real keys
const KING = await page.evaluate(() => { const z = globalThis.__v3Zone; const s = z.spawns.find((o) => /big-vegas/.test(o.id)); return s ? { id: s.id, x: s.x, z: s.z } : null; });
assert.ok(KING, 'a big-vegas spawn exists in __v3Zone');
console.log('king spawn', JSON.stringify(KING));
await page.evaluate(([x, z]) => { const h = globalThis.__v3Fight.duel.fighters[0]; const d = Math.hypot(x - h.body.x, z - h.body.z) || 1; h.body.x = x - ((x - h.body.x) / d) * 12; h.body.z = z - ((z - h.body.z) / d) * 12; }, [KING.x, KING.z]);
await page.waitForTimeout(4000);
const state =() => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight; return { zone: z?.current, engaged: z?.engaged, hero: f?.fighter && [f.fighter.x, f.fighter.z], foe: f?.enemy && [f.enemy.x, f.enemy.z], tick: f?.duel?.tick, kingHp: f?.duel?.fighters[1].health, kingMax: f?.duel?.fighters[1].maxHealth, heroHp: f?.duel?.fighters[0].health }; });
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
async function basis(code, fallback) { for (let hold = 700; hold <= 5600; hold *= 2) { const a = (await state()).hero; await key(code, 'keydown'); await page.waitForTimeout(hold); await key(code, 'keyup'); await page.waitForTimeout(200); const b = (await state()).hero; const d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d); if (n > 0.05) return [d[0] / n, d[1] / n]; } return fallback; }   // a loaded machine may not have moved him in 700 ms: hold longer
const fw = await basis('KeyW', [0, 1]), rt = await basis('KeyD', [1, 0]);
for (let i = 0; i < 4000; i++) {   // walk with the keys, steering by the sim's own position until the zone loop engages The King
  const s = await state(), SPOT = spotOf(s); if (s.engaged) break;
  if (i % 25 === 0) console.log('walk', i, JSON.stringify({ hero: s.hero.map((v) => +v.toFixed(1)), foe: s.foe.map((v) => +v.toFixed(1)), engaged: s.engaged, heroHp: s.heroHp, to: [SPOT.x, SPOT.z], fw, rt }));
  const dx = SPOT.x - s.hero[0], dz = SPOT.z - s.hero[1], n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
  for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
  await page.waitForTimeout(200);
}
for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA']) await key(c, 'keyup');
const s0 = await state();
assert.ok(s0.engaged, `engaged: ${JSON.stringify(s0)}`);
console.log('engaged', JSON.stringify(s0));

// the ring, read off the scene each frame together with the sim's tick
const probe = () => page.evaluate(() => {
  const g = globalThis.__v3Scene?.getObjectByName('KingAura'), f = globalThis.__v3Fight;
  if (!g) return null;
  const [disc, edge, wave] = g.children;
  return { tick: f.duel.tick, kingHp: f.duel.fighters[1].health, kingMax: f.duel.fighters[1].maxHealth, visible: g.visible, scale: edge.scale.x, edgeOpacity: edge.material.opacity, waveVisible: wave.visible, waveScale: wave.scale.x, pos: g.position.toArray(), foe: [f.enemy.x, f.enemy.z] };
});
let p = null; for (let i = 0; i < 60 && !p; i++) { await page.waitForTimeout(250); p = await probe(); }
assert.ok(p, 'the KingAura ring exists in the scene'); assert.ok(p.visible, 'the ring is up while he stands');
assert.ok(Math.abs(p.scale - auraRadius(ROW, p.kingHp / p.kingMax)) < 1e-6, `radius ${p.scale} follows his health ${p.kingHp}/${p.kingMax}`);
assert.ok(Math.hypot(p.pos[0] - p.foe[0], p.pos[2] - p.foe[1]) < 1.5, `the ring is centred on him: ring ${p.pos} foe ${p.foe}`);

// one pulse cycle, sampled every frame: the opacity and the wave track auraPhase of the live tick
const seen = { tell: 0, wave: 0, quiet: 0 }, shots = {};
const hide = (on) => page.evaluate((hidden) => { globalThis.__v3Scene.getObjectByName('KingAura').children.forEach((m) => m.layers.set(hidden ? 1 : 0)); return true; }, on);   // layer 1 is one the camera does not draw: the ring is still updated, just not seen (stills only)
await page.screenshot({ path: `${out}/king-aura-engaged-on.png` });
const deadline = Date.now() + 120000;
// LOCAL FIX: keep sampling until the stills AND all three phases (tell, wave, rest) were observed (the old loop stopped at the two stills, before a quiet frame); the hero is topped up so the King's own blows do not end the sampling
while (Date.now() < deadline && !(shots.tell && shots.wave && seen.tell > 5 && seen.wave > 5 && seen.quiet > 5)) {
  await page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; h.health = h.maxHealth; });
  const q = await probe(); if (!q || !q.visible) { await page.waitForTimeout(30); continue; }
  const want = auraPhase(ROW, q.tick, q.kingHp / q.kingMax);
  if (want.wave > 0) { assert.ok(q.waveVisible, `tick ${q.tick}: the wave mesh shows (age ${want.age})`); seen.wave++; }
  else { assert.ok(!q.waveVisible, `tick ${q.tick}: no wave mesh outside the wave (age ${want.age})`); }
  if (want.tell > 0.8) { assert.ok(q.edgeOpacity > ROW.look.edgeOpacity, `tick ${q.tick}: the rim flares in the tell`); seen.tell++; }
  else if (want.tell === 0 && want.wave === 0) { assert.ok(Math.abs(q.edgeOpacity - ROW.look.edgeOpacity) < 1e-6, `tick ${q.tick}: the rim rests at ${ROW.look.edgeOpacity}`); seen.quiet++; }
  if (!shots.tell && want.tell > 0.9) { shots.tell = true; await page.screenshot({ path: `${out}/king-aura-tell-on.png` }); await hide(true); await page.screenshot({ path: `${out}/king-aura-tell-off.png` }); await hide(false); }
  if (!shots.wave && want.wave > 0.4 && want.wave < 0.7) { shots.wave = true; await page.screenshot({ path: `${out}/king-aura-wave-on.png` }); await hide(true); await page.screenshot({ path: `${out}/king-aura-wave-off.png` }); await hide(false); }
  const s = await state(); if (s.heroHp <= 0) break;   // the hero fell: the fight is over (the stills stop here)
}
console.log('seen', JSON.stringify(seen), 'shots', JSON.stringify(shots), 'hero', (await state()).heroHp);
assert.ok(seen.tell > 0 && seen.wave > 0 && seen.quiet > 0, `the tell, the wave and the rest were all observed: ${JSON.stringify(seen)}`);
assert.deepEqual(errors, [], 'zero page errors, zero console errors');
console.log('king-aura-check: PASS');
await browser.close();
