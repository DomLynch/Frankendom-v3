// A strike cuts the fallen body (data/physics.json cut.strike), on the BUILT game at 375 wide with touch. A REAL kill (the sim kills the foe: held at 1 hp, the hero's own light blows), then per MODE:
//   attack: the STRIKE button tapped with no aim, six times: each press cuts the next unit of cut.tap.order      tap: each part tapped (touch) where the probe finds it     miss: taps on empty ground next to the body
//   far: the hero walks away first; an attack press cuts nothing
// Prints the cut units after every press (must be all six, no page errors) and shoots <tag>-1-hint, -2-first, -3-all.
//   node scripts/cut-strike-stills.mjs <base url> <out dir> <tag> [query]      env: MODE=attack|tap|miss|far  CHROME=<chromium> GL_ARGS=<flags>
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/cut-strike-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, CUT_EVERY = 55, MAX_TICKS = 3000, errors = [], MODE = process.env.MODE ?? 'attack';
const UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(3000);
if (process.env.SPOT) {   // a zone boss other than the first (SPOT = a spawn id from __v3Zone.spawns, pit-pitborn-east = Arachne): walk to it in real time (as boss-walkin-stills), the zone's aggro takes the sim; its own body is drawn (held-body swap)
  const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
  const pos = () => page.evaluate(() => { const f = globalThis.__v3Fight.fighter; return [f.x, f.z]; });
  const basis = async (code) => { const a = await pos(); await key(code, 'keydown'); await page.waitForTimeout(700); await key(code, 'keyup'); await page.waitForTimeout(200); const b = await pos(), d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; };
  const spot = await page.evaluate((id) => { const s = globalThis.__v3Zone.spawns.find((q) => q.id === id); return [s.x, s.z]; }, process.env.SPOT);
  const fw = await basis('KeyW'), rt = await basis('KeyD');
  for (let i = 0; i < 900; i++) {
    if (await page.evaluate(() => globalThis.__v3Zone?.engaged)) break;
    const [hx, hz] = await pos(), dx = spot[0] - hx, dz = spot[1] - hz, n = Math.hypot(dx, dz), f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
    for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
    await page.waitForTimeout(150);
  }
  for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA']) await key(c, 'keyup');
  console.log(`${tag}: zone ${JSON.stringify(await page.evaluate(() => ({ current: globalThis.__v3Zone?.current, engaged: globalThis.__v3Zone?.engaged })))}`);
  await page.waitForTimeout(2000);
}
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 15000);
const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1, ragdoll: globalThis.__ragdoll?.state }; });
const shoot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
const cuts = () => page.evaluate(() => (globalThis.__v3Cuts ?? []).map((c) => `${c.unit}:${c.source}`));
for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
await run(30);
await page.keyboard.down('KeyW');
let killedAt = -1, stickUp = false;
for (let n = 0; n < MAX_TICKS; n++) {
  if (n % CUT_EVERY === 0 && killedAt < 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
  await run(1);
  const s = await read();
  if (killedAt < 0) {
    const gap = await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); return Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z); });
    if (!stickUp && gap < 1.6) { stickUp = true; await page.keyboard.up('KeyW'); }
  }
  if (killedAt < 0 && s.victim === 1) { killedAt = n; await page.keyboard.up('KeyW'); }
  if (killedAt >= 0 && n - killedAt >= 150) break;
}
await page.keyboard.up('KeyW');
console.log(`${tag}: ${MODE}: killed at ${killedAt}, ragdoll ${(await read()).ragdoll}, cut by the kill ${JSON.stringify(await cuts())}`);
await run(90);
await shoot('1-hint');
const press = async () => {
  const b = await page.evaluate(() => {   // the STRIKE circle as drawn: #attack-button's box, or (when the button reports none) the point of the circle on a 375 phone
    const r = document.getElementById('attack-button').getBoundingClientRect(), x = r.width ? r.left + r.width / 2 : 271, y = r.width ? r.top + r.height / 2 : 684, el = document.elementFromPoint(x, y), cs = getComputedStyle(document.getElementById('attack-button'));
    return [x, y, `${el?.id || el?.className || el?.tagName} (rect ${Math.round(r.width)}x${Math.round(r.height)})`, cs.visibility, cs.pointerEvents];
  });
  if (!press.logged) { press.logged = true; console.log(`${tag}: STRIKE at ${b[0].toFixed(0)},${b[1].toFixed(0)}: top element ${b[2]}, visibility ${b[3]}, pointer-events ${b[4]}`); }
  await page.touchscreen.tap(b[0], b[1]); await run(70);
};
const have = async () => new Set((await cuts()).map((c) => c.split(':')[0]));
if (MODE === 'far') {
  await page.keyboard.down('KeyS'); await run(200); await page.keyboard.up('KeyS');
  const d = await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; return Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z); });
  const before = (await cuts()).length; await press(); await press();
  console.log(`${tag}: far (${d.toFixed(1)} m): cuts ${before} -> ${(await cuts()).length}`);
} else {
  let shot = 0;
  for (let i = 0; i < 9 && (await have()).size < UNITS.length; i++) {
    const before = await have();
    if (MODE === 'attack') await press();
    else if (MODE === 'miss') { await page.touchscreen.tap(30, 760); await run(70); }   // empty ground, off the thumb controls
    else {
      const u = UNITS.find((x) => !before.has(x));
      const at = await page.evaluate((u) => { for (let y = 120; y < 700; y += 4) for (let x = 20; x < 360; x += 4) if (globalThis.__ragdoll.probe?.(x, y) === u) return [x, y]; return null; }, u);
      if (at) { await page.touchscreen.tap(at[0], at[1]); await run(70); } else { console.log(`${tag}: no screen point for ${u}`); await press(); }
    }
    const now = await have(), added = [...now].filter((u) => !before.has(u));
    console.log(`${tag}: press ${i + 1}: +${JSON.stringify(added)} (${now.size}/6) ${JSON.stringify((await cuts()).slice(-added.length || -1))}`);
    if (!shot++) { await run(60); await shoot('2-first'); }
  }
  await run(120);
  await shoot('3-all');
  const all = await have();
  console.log(`${tag}: ${MODE}: ${UNITS.map((u) => `${u}=${all.has(u) ? 'cut' : 'NOT'}`).join(' ')}`);
}
console.log(`${tag}: errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
