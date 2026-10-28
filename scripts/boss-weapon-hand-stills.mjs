// A zone boss's OWN body holding its weapon row (data/boss-weapons.json), through the real spawn path: 375 wide, built dist, no game change.
// The hero is set down DIST metres from the boss's zone spawn (the sim's fighter position; aggro does the rest, as scripts/boss-walkin-stills.mjs), the fight camera frames both, and
//   <out>/<tag>-375-ready.png   the ready pose at the fight camera, 375 wide (hero and boss standing, weapon in the boss's hand)
//   <out>/<tag>-hand.png        the same instant, the stills' close-up lens (src/fight/camera.ts __v3CamShot, as scripts/finisher-cuts-stills.mjs CAM=) set beside the boss's right hand
//   node scripts/boss-weapon-hand-stills.mjs <base url> <out dir> <spawn id> <tag> [query]      e.g. ring-3-anime-boy-black-0 ryo opener=off
//   env: DIST=2.2 (metres short of the spawn), HAND_SIDE=1|-1 (which flank of the boss the close-up stands on), HAND_DIST=0.9 (metres from the hand), HAND_RISE=0.25, HAND_LOOK=0.25 (aim this far above the hand)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, spawnId, tag, query = 'opener=off'] = process.argv.slice(2);
if (!base || !out || !spawnId || !tag) { console.error('usage: node scripts/boss-weapon-hand-stills.mjs <base url> <out dir> <spawn id> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const num = (k, d) => Number(process.env[k] ?? d);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`${tag}: console ${m.text().slice(0, 200)}`); });
await page.addInitScript(([side, dist, rise, look]) => {   // the close-up lens: beside the boss's right hand, aimed a little above it (the grip and the blade's root), only while globalThis.__handCam is on
  const st = { hand: null };
  globalThis.__v3CamShot = (cam) => {
    if (!globalThis.__handCam) return;
    const p = globalThis.__v3Fight, root = globalThis.__v3Scene; if (!p || !root) return;
    const [hero, foe] = p.duel.fighters; let dx = hero.body.x - foe.body.x, dz = hero.body.z - foe.body.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const w = cam.position.clone();
    if (!st.hand) { let bd = 1e9; root.traverse((o) => { if (o.name !== 'mixamorigRightHand' || !o.getObjectByName('Grip106')) return; o.getWorldPosition(w); const d = Math.hypot(w.x - foe.body.x, w.z - foe.body.z); if (d < bd) { bd = d; st.hand = o; } }); }   // the boss's: the hand the grafted weapon's grip seat (Grip106) hangs on (the hero's hand carries the hero's own sword), the nearest to the sim's foe
    if (!st.hand) return;
    st.hand.getWorldPosition(w);
    let ax = w.x, ay = w.y + look, az = w.z, d = dist;
    if (globalThis.__handCam === 'weapon') {   // the whole weapon in frame: aim at the centre of the grafted part (Grip106's meshes), stand back by its size
      let lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; const v = w.clone();
      st.hand.getObjectByName('Grip106').traverse((o) => { if (!o.isMesh) return; o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { v.set(x, y, z).applyMatrix4(o.matrixWorld); lo = [Math.min(lo[0], v.x), Math.min(lo[1], v.y), Math.min(lo[2], v.z)]; hi = [Math.max(hi[0], v.x), Math.max(hi[1], v.y), Math.max(hi[2], v.z)]; } });
      ax = (lo[0] + hi[0]) / 2; ay = (lo[1] + hi[1]) / 2; az = (lo[2] + hi[2]) / 2; d = Math.max(1.6, 1.3 * Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
    }
    const px = -dz * side, pz = dx * side;   // the boss's flank (perpendicular to the line to the hero); blended with the line to the hero so the lens sees his front quarter
    cam.position.set(ax + (px * 0.7 + dx * 0.7) * d, ay + rise, az + (pz * 0.7 + dz * 0.7) * d); cam.lookAt(ax, ay, az); cam.updateMatrixWorld();
  };
}, [num('HAND_SIDE', 1), num('HAND_DIST', 0.9), num('HAND_RISE', 0.25), num('HAND_LOOK', 0.25)]);
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__v3Zone && document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
await page.waitForTimeout(1500);
const spawn = await page.evaluate((id) => globalThis.__v3Zone.spawns.find((s) => s.id === id), spawnId);
if (!spawn) { console.error(`${tag}: no spawn ${spawnId} in this build (${(await page.evaluate(() => globalThis.__v3Zone.spawns.map((s) => s.id))).join(', ')})`); process.exit(3); }
await page.evaluate(([s, d]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + d; f.z = s.z; }, [spawn, num('DIST', 2.2)]);
// aggro needs the hero to walk in (a set-down inside the leash is pushed back out by the body): find which way the stick goes, then steer to the spawn until the boss engages
const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
const heroAt = () => page.evaluate(() => { const f = globalThis.__v3Fight.fighter; return [f.x, f.z]; });
const basis = async (code) => { const a = await heroAt(); await key(code, 'keydown'); await page.waitForTimeout(500); await key(code, 'keyup'); await page.waitForTimeout(300); const b = await heroAt(), d = [b[0] - a[0], b[1] - a[1]], n = Math.hypot(...d) || 1; return [d[0] / n, d[1] / n]; };
const fw = await basis('KeyW'), rt = await basis('KeyD');
await page.evaluate(([s, d]) => { const f = globalThis.__v3Fight.fighter; f.x = s.x + d; f.z = s.z; }, [spawn, num('DIST', 5)]);   // set down short of the spawn on the +x side (the basis probe walked him off)
await page.waitForTimeout(500);
for (let i = 0; i < 300 && !(await page.evaluate(() => globalThis.__v3Zone.engaged)); i++) {
  const h = await heroAt(), dx = spawn.x - h[0], dz = spawn.z - h[1], n = Math.hypot(dx, dz) || 1, f = (dx * fw[0] + dz * fw[1]) / n, r = (dx * rt[0] + dz * rt[1]) / n;
  for (const [c, on] of [['KeyW', f > 0.3], ['KeyS', f < -0.3], ['KeyD', r > 0.3], ['KeyA', r < -0.3]]) await key(c, on ? 'keydown' : 'keyup');
  if (i > 40 && n < 4) await page.evaluate(([s, ux, uz]) => { const q = globalThis.__v3Fight.fighter; q.x = s.x - ux * 2; q.z = s.z - uz * 2; }, [spawn, dx / n, dz / n]);   // a big body holds him just outside the aggro ring: step him in to 2 m
  await page.waitForTimeout(100);
}
for (const c of ['KeyW', 'KeyS', 'KeyD', 'KeyA']) await key(c, 'keyup');
if (!(await page.evaluate(() => globalThis.__v3Zone.engaged))) { console.error(`${tag}: the boss did not engage; hero`, JSON.stringify(await heroAt()), 'spawn', JSON.stringify(spawn), 'basis', JSON.stringify([fw, rt]), JSON.stringify(await page.evaluate(() => globalThis.__v3Zone.attackers))); process.exit(4); }
const state = () => page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; return { hero: h.phase, foe: f.phase, weapon: f.weapon, foeAt: [globalThis.__v3Fight.enemy.x, globalThis.__v3Fight.enemy.z] }; });   // stills only: the hero lives
await page.waitForTimeout(2000);
for (let i = 0; i < 400; i++) { const s = await state(); if (s.foe === 'ready' && s.hero !== 'sheathed') break; await page.waitForTimeout(50); }   // the boss at rest, not mid-swing
if (process.env.DEBUG) console.log(`${tag}: the foe's hand tree`, JSON.stringify(await page.evaluate(() => {   // what hangs on the foe's right hand (name, world position, mesh count)
  const root = globalThis.__v3Scene, p = globalThis.__v3Fight.enemy, rows = [];
  root.traverse((o) => { if (o.name !== 'mixamorigRightHand') return; const w = o.getWorldPosition(o.position.clone()); if (Math.hypot(w.x - p.x, w.z - p.z) > 3) return;
    o.traverse((c) => { if (c === o) return; if (/^mixamorig(?!RightHand$)/.test(c.name) && !/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(c.name)) return; if (/Hand(Thumb|Index|Middle|Ring|Pinky)/.test(c.name)) return; const q = c.getWorldPosition(c.position.clone()); rows.push([c.name, c.type, c.visible, +q.x.toFixed(2), +q.y.toFixed(2), +q.z.toFixed(2), c.parent?.name]); }); });
  return rows;
})));
await page.screenshot({ path: `${out}/${tag}-375-ready.png` });
console.log(`${tag}: ready`, JSON.stringify(await state()));
for (const [mode, name] of [['hand', 'hand'], ['weapon', 'weapon']]) {
  await page.evaluate((m) => { globalThis.__handCam = m; }, mode);
  await page.waitForTimeout(700);
  for (let i = 0; i < 200 && /attack|stagger|hit/.test((await state()).foe); i++) await page.waitForTimeout(50);   // not mid-swing (the weapon is across the lens then)
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}/${tag}-${name}.png` });
  console.log(`${tag}: ${name}`, JSON.stringify(await state()));
}
await browser.close();
