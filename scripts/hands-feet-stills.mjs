// Hands and feet cut at runtime (data/physics.json cut.hands, ?hands=1), on the BUILT game at 375 wide with touch. A REAL kill (the sim kills the foe: held at 1 hp, the hero's own light blows),
// the corpse lies until it is frozen, then each unit of UNITS is tapped where the ragdoll's probe finds it (a finger or a toe is under the hand or foot bone). Shoots
//   <out>/<tag>-1-before.png   the frozen corpse            <out>/<tag>-2-<unit>.png   the fight camera after that cut       <out>/<tag>-2-<unit>-close.png   a crop round the stump, 3x
// and prints the cut units, whether the probe found each one, the page errors, and (CAPS=1) the visible cut-art meshes of the foe's body (every cap_* the manifest shows for the unit must be there).
//   node scripts/hands-feet-stills.mjs <base url> <out dir> <tag> [query]      env: UNITS=foot_left[,hand_left...]  SPAWN=<zone spawn id, e.g. ring-3-the-boss-0>  CHROME=<chromium> GL_ARGS=<flags>
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [base, out, tag, query = 'hands=1'] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/hands-feet-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, CUT_EVERY = 55, MAX_TICKS = 3000, errors = [], UNITS = (process.env.UNITS ?? 'foot_left').split(','), SPAWN = process.env.SPAWN;
const KEYS = JSON.parse(readFileSync(new URL('../data/input.json', import.meta.url), 'utf8')).keys;
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
await page.waitForTimeout(3000);
if (SPAWN) {   // a zone boss: set the hero down short of its spawn and walk in (the zone's aggro takes the sim; its own body is drawn: held-body swap)
  const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
  const pos = () => page.evaluate(() => { const f = globalThis.__v3Fight.fighter; return [f.x, f.z]; });
  const basis = async (code) => { const a = await pos(); await key(code, 'keydown'); await page.waitForTimeout(500); await key(code, 'keyup'); await page.waitForTimeout(300); const b = await pos(), d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; };
  const spawn = await page.evaluate((id) => globalThis.__v3Zone.spawns.find((s) => s.id === id), SPAWN);
  if (!spawn) { console.error(`${tag}: no spawn ${SPAWN}`); process.exit(3); }
  const set = () => page.evaluate(([s]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + 5; f.z = s.z; }, [spawn]);
  await set(); await page.waitForTimeout(500);
  const fw = await basis(KEYS.forward[0]), rt = await basis(KEYS.right[0]);
  await set(); await page.waitForTimeout(500);
  for (let i = 0; i < 1200 && !(await page.evaluate(() => globalThis.__v3Zone.engaged)); i++) {
    const h = await pos(), dx = spawn.x - h[0], dz = spawn.z - h[1], n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
    for (const [c, on] of [[KEYS.forward[0], f > 0.3], [KEYS.back[0], f < -0.3], [KEYS.right[0], r > 0.3], [KEYS.left[0], r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
    if (i > 40 && n < 4) await page.evaluate(([s, ux, uz]) => { const q = globalThis.__v3Fight.fighter; q.x = s.x - ux * 2; q.z = s.z - uz * 2; }, [spawn, dx / n, dz / n]);
    await page.waitForTimeout(100);
  }
  for (const k of ['forward', 'back', 'left', 'right']) await key(KEYS[k][0], 'keyup');
  console.log(`${tag}: zone ${JSON.stringify(await page.evaluate(() => ({ current: globalThis.__v3Zone?.current, engaged: globalThis.__v3Zone?.engaged })))}`);
  await page.waitForTimeout(2000);
}
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 15000);
const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
const ragdolls = () => page.evaluate(() => Object.keys(globalThis).filter((k) => k.startsWith('__ragdoll') && globalThis[k]?.probe).map((k) => [k, globalThis[k].state]));
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1 }; });
const shoot = async (name, clip) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${tag}-${name}.png`, ...(clip ? { clip } : {}) }); };
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
await run(120);
console.log(`${tag}: killed at ${killedAt}, ragdolls ${JSON.stringify(await ragdolls())}, cut by the kill ${JSON.stringify(await cuts())}`);
await shoot('1-before');
for (const unit of UNITS) {
  const found = await page.evaluate((u) => { const pr = Object.keys(globalThis).filter((k) => k.startsWith('__ragdoll') && globalThis[k]?.probe && globalThis[k].state === 'frozen'); for (const k of pr) for (let y = 120; y < 740; y += 3) for (let x = 12; x < 364; x += 3) if (globalThis[k].probe(x, y) === u) return { k, x, y }; return null; }, unit);
  console.log(`${tag}: ${unit}: probe ${found ? `${found.k} at ${found.x},${found.y}` : 'NOT FOUND'}`);
  if (!found) continue;
  await page.touchscreen.tap(found.x, found.y);
  await run(70);
  await shoot(`2-${unit}`);
  const r = 70;   // CSS px round the stump (the piece flies away from it)
  await shoot(`2-${unit}-close`, { x: Math.max(0, found.x - r), y: Math.max(0, found.y - r), width: Math.min(2 * r, 375 - Math.max(0, found.x - r)), height: 2 * r });
  console.log(`${tag}: after ${unit}: cuts ${JSON.stringify(await cuts())}`);
}
await run(180);
await shoot('3-all');
if (process.env.CAPS) console.log(`${tag}: cut meshes visible: ${JSON.stringify(await page.evaluate(() => { const root = globalThis.__v3Scene, names = []; root?.traverse((o) => { if (/^(cap|piece)_/.test(o.name) && o.visible && o.parent?.visible !== false) names.push(o.name); }); return names.filter((n) => /^cap_/.test(n)); }))}`);
console.log(`${tag}: errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
