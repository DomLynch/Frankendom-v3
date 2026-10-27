// The zone's endless open ground (data/zone-ground.json), 375 wide: the hero is put at a place (script-set: the sim's body is pinned there each frame, facing +z) and the camera
// stands behind him looking out. Run it twice: with `ground=v1` in the query (the pit's floor as before) and without (the endless ground).
// Places (env AT, metres along +z from the pit's centre, default 7.18,0,500,20000): 7.18 is the pit's old wall edge, 0 the centre, 500 and 20000 far out (edge and float jitter).
//   <tag>-<at>-1-out    low behind the hero, looking straight out
//   <tag>-<at>-2-high   4 m up, looking out and down at the floor's far reach
//   <tag>-<at>-3-side   from the hero looking sideways (+x), where the pit's grid used to end
//   node scripts/ground-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/ground-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const AT = (process.env.AT ?? '7.18,0,500,20000').split(',').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
console.log(`${tag} goto`);
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__v3Renderer, null, { timeout: 240000 });
console.log(`${tag} ready`);
await page.waitForTimeout(2000);
await page.evaluate(() => {
  const r = globalThis.__v3Renderer, orig = r.render.bind(r);
  globalThis.__look = null; globalThis.__pin = { x: 0, z: 0 };
  r.render = (scene, camera) => { const l = globalThis.__look; if (l && camera.isPerspectiveCamera) {   // the post chain's own full-screen pass has an orthographic camera: leave it alone camera.position.set(l.x, l.y, l.z); camera.lookAt(l.tx, l.ty, l.tz); camera.updateMatrixWorld(); } return orig(scene, camera); };
  const pin = () => { const h = globalThis.__v3Fight?.fighter, p = globalThis.__pin; if (h) { h.x = p.x; h.z = p.z; h.heading = 0; } };
  setInterval(pin, 4);
});
const view = (l) => page.evaluate((v) => { globalThis.__look = v; }, l);
const shot = async (n) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 82 }); };
for (const z of AT) {
  await page.evaluate((p) => { globalThis.__pin = p; }, { x: 0, z });
  await page.waitForTimeout(500);
  const hero = await page.evaluate(() => globalThis.__v3Fight?.fighter && { x: globalThis.__v3Fight.fighter.x, z: globalThis.__v3Fight.fighter.z });
  console.log(`${tag} at ${z}`, JSON.stringify(hero));
  await view({ x: 0, y: 1.9, z: z - 3.2, tx: 0, ty: 1.3, tz: z + 90 }); await shot(`${z}-1-out`);
  await view({ x: 0, y: 5.5, z: z - 3.2, tx: 0, ty: 0.5, tz: z + 60 }); await shot(`${z}-2-high`);
  await view({ x: -0.5, y: 1.9, z, tx: 90, ty: 1.3, tz: z }); await shot(`${z}-3-side`);
}
// a far field boss on drawn ground: the spawns farthest from the world's centre (the zone's frame less the centre, which is the held boss's spot less its place), the hero 5 m short of each
const spots = await page.evaluate(() => { const z = globalThis.__v3Zone, e = globalThis.__v3Fight?.enemy; if (!z || !e) return []; const held = z.spawns[z.current], ox = held.x - e.x, oz = held.z - e.z; return z.spawns.map((s) => ({ id: s.id, x: s.x - ox, z: s.z - oz })); });
console.log(`${tag} spots`, JSON.stringify(spots));
for (const s of spots.filter((p) => Math.hypot(p.x, p.z) > 3).slice(0, 2)) {
  const r = Math.hypot(s.x, s.z), ux = s.x / r, uz = s.z / r, hx = s.x - ux * 5, hz = s.z - uz * 5;
  await page.evaluate((p) => { globalThis.__pin = p; }, { x: hx, z: hz });
  await view({ x: hx - ux * 3.5, y: 2.2, z: hz - uz * 3.5, tx: s.x, ty: 1.2, tz: s.z }); await shot(`boss-${s.id}`);
  console.log(`${tag} boss ${s.id} at ${r.toFixed(1)} m`);
}
console.log(`${tag} done`);
await browser.close();
