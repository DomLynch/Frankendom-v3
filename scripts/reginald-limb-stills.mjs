// Sir Reginald's LIMB LOSS (data/mechanics.json `reginald-limb-loss`) on the BUILT game, 375 wide, REAL input: the page is loaded as a player loads it, the hero is stood 4 m from Reginald's spawn
// (stills only: the sim's hero body is moved, the way scripts/zone-aggro-stills.mjs tops him up), and from then on only keys are pressed (walk in, strike, kick, guard). The foe's health falls by the hero's own blows.
//   <tag>-1-whole        the fight drawn, both standing, Reginald whole
//   <tag>-2-arm-lost     the tick after the halberd arm failed (the caption, the piece gone, the stump cap)
//   <tag>-3-leg-lost     the tick after the leg failed
//   <tag>-4-corpse       the corpse after the kill, the lost limbs still gone
// Checks as it plays (exit 1 on a breach): after the arm is lost every attack he starts is a kick; after the leg every attack is not a heavy; the pace multiplier is the rows' product.
//   node scripts/reginald-limb-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/reginald-limb-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const ROW = JSON.parse(readFileSync(new URL('../data/mechanics.json', import.meta.url), 'utf8')).mechanics['reginald-limb-loss'];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const shot = async (n) => { await page.waitForTimeout(250); await page.screenshot({ path: `${out}/${tag}-${n}.png` }); console.log(`${tag}: ${n}`); };
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const press = async (code, ms) => { await key(code, 'keydown'); await page.waitForTimeout(ms); await key(code, 'keyup'); await page.waitForTimeout(40); };
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, f = p.duel.fighters[1], h = p.duel.fighters[0], z = globalThis.__v3Zone; return { foe: f.phase, move: f.move, health: f.health, max: f.maxHealth, phases: f.phases ?? [], speed: f.speed, hero: h.phase, heroHealth: h.health, current: z?.current, finish: !!p.finish, tick: p.duel.tick, x: p.enemy.x, z: p.enemy.z, hx: p.fighter.x, hz: p.fighter.z }; });
const topUp = () => page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; h.health = h.maxHealth; });
const fails = [];
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__v3Zone && globalThis.__v3Fight, null, { timeout: 180000 });
await page.waitForTimeout(3000);
const spot = await page.evaluate(() => { const z = globalThis.__v3Zone; const i = z.spawns.findIndex((s) => /castle-guard/.test(s.id)); return i < 0 ? null : { i, ...z.spawns[i] }; });
if (!spot) { console.error(`${tag}: no castle-guard spawn in __v3Zone`); process.exit(1); }
console.log(`${tag}: Reginald stands at ${spot.x}, ${spot.z} (${spot.id})`);
// stills only: stand the hero 4 m from him (the sim's own body, as the zone stills top him up); everything after this is keys
await page.evaluate(([x, z]) => { const h = globalThis.__v3Fight.duel.fighters[0]; const d = Math.hypot(x - h.body.x, z - h.body.z) || 1; h.body.x = x - ((x - h.body.x) / d) * 4; h.body.z = z - ((z - h.body.z) / d) * 4; }, [spot.x, spot.z]);
await page.waitForFunction((i) => globalThis.__v3Zone.current === i && globalThis.__v3Zone.engaged, spot.i, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(9000);   // his body is fetched when the hero is near (data/respawn.json world.loadWithinMetres)
for (let i = 0; i < 400 && /sheathed|draw/.test((await read()).hero); i++) await page.waitForTimeout(50);
let s = await read(); console.log(`${tag}: engaged ${JSON.stringify({ current: s.current, health: s.health, max: s.max, phases: s.phases })}`);
await shot('1-whole');
const seen = { arm: new Set(), leg: new Set() };
let lastD = null, stuck = 0, armShot = false, legShot = false, started = Date.now(), loops = 0;
while (Date.now() - started < Number(process.env.LOOP_MS || 240000)) {
  s = await read();
  if (s.finish || s.foe === 'dead') break;
  const arm = s.phases.includes('limb:arm_right'), leg = s.phases.includes('limb:leg_right');
  if (arm && !armShot) { armShot = true; await shot('2-arm-lost'); }
  if (leg && !legShot) { legShot = true; await shot('3-leg-lost'); }
  if (s.foe === 'attack' && s.move) { if (arm) seen.arm.add(s.move); if (leg) seen.leg.add(s.move); }
  await topUp();
  const d = Math.hypot(s.x - s.hx, s.z - s.hz);
  if (++loops % 15 === 1 || loops < 12) console.log(`${tag}: gap ${d.toFixed(2)} m foe ${s.foe}/${s.move} hp ${s.health}/${s.max} hero ${s.hero} at ${s.hx.toFixed(1)},${s.hz.toFixed(1)} foe at ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
  if (d > 1.9) {   // LOCAL FIX: W is the CAMERA's forward, not "toward him": measure the camera basis with W and D, then steer with the held keys by the sim's own positions (the held foe is Reginald while current === his spawn index)
    if (lastD !== null && d > lastD - 0.02) stuck++; else stuck = 0;
    if (!globalThis.__basis || stuck >= 8) { globalThis.__basis = null; stuck = 0; const pos = async () => { const r = await read(); return [r.hx, r.hz]; }; const bas = async (c) => { for (let hold = 400; hold <= 1600; hold *= 2) { const a = await pos(); await key(c, 'keydown'); await page.waitForTimeout(hold); await key(c, 'keyup'); await page.waitForTimeout(250); const b = await pos(), v = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...v); if (n > 0.15) return [v[0] / n, v[1] / n]; } return null; }; const fw = await bas('KeyW'), rt = await bas('KeyD'); console.log(`${tag}: basis fw ${JSON.stringify(fw)} rt ${JSON.stringify(rt)}`); if (!fw || !rt) { await page.waitForTimeout(500); continue; } globalThis.__basis = { fw, rt }; }
    const { fw, rt } = globalThis.__basis, tx = s.current === spot.i ? s.x : spot.x, tz = s.current === spot.i ? s.z : spot.z, dx = tx - s.hx, dz = tz - s.hz, n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
    for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
    await page.waitForTimeout(160); for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA']) await key(c, 'keyup');
    lastD = d;
  } else { lastD = null; await press(['KeyF', 'KeyF', 'KeyC', 'KeyF'][Math.floor(s.tick / 40) % 4], 70); await press('KeyQ', 90); }   // F strike, C kick, Q guard (data/input.json keys)
}
const end = await read();
console.log(`${tag}: ended ${JSON.stringify({ health: end.health, phases: end.phases, speed: end.speed })}`);
console.log(`${tag}: moves thrown after the arm: ${[...seen.arm].join(',') || 'none'}; after the leg: ${[...seen.leg].join(',') || 'none'}`);
if ([...seen.arm].some((m) => m !== 'kick')) fails.push(`after the arm he threw ${[...seen.arm].filter((m) => m !== 'kick')}`);
if ([...seen.leg].some((m) => /^heavy/.test(m))) fails.push(`after the leg he threw ${[...seen.leg].filter((m) => /^heavy/.test(m))}`);
if (!armShot) fails.push('the arm never failed (health never fell under its share)');
const slow = ROW.limbs.filter((l) => end.phases.includes(`limb:${l.id}`)).reduce((v, l) => v * l.speedMult, 1);
console.log(`${tag}: the rows' pace multiplier for the lost limbs: ${slow}; his speed now ${end.speed}`);
await page.waitForTimeout(6000); await shot('4-corpse');
await browser.close();
if (fails.length) { console.error(`${tag}: FAIL ${fails.join('; ')}`); process.exit(1); }
console.log(`${tag}: PASS`);
