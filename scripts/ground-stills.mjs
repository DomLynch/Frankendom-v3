// The zone's open ground (data/zone-ground.json), 375 wide: the hero stands at the pit's old wall edge facing outward and the camera stands behind him looking out over
// the ground beyond. Run it twice: with `ground=v1` in the query (the pit's floor as before) and without (the open ground).
//   <tag>-1-out    low behind the hero, looking straight out (+z)
//   <tag>-2-high   the same spot, 4 m up, looking out and down at the floor's far reach
//   <tag>-3-side   from the edge looking along the wall (+x), where the grid ended 26 m out
//   node scripts/ground-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/ground-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 2), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__v3Renderer, null, { timeout: 240000 });
await page.waitForTimeout(2000);
const wall = await page.evaluate(() => {
  // the wall: the hero stands at the sim's wall (the pit's old edge, the fight's RADIUS, here read from the fighter after a push outward), facing out
  const R = Number(new URLSearchParams(location.search).get('wall') ?? 7.18);
  const r = globalThis.__v3Renderer, orig = r.render.bind(r);
  globalThis.__look = null;
  r.render = (scene, camera) => { const l = globalThis.__look; if (l) { camera.position.set(l.x, l.y, l.z); camera.lookAt(l.tx, l.ty, l.tz); camera.updateMatrixWorld(); } return orig(scene, camera); };
  setInterval(() => { const h = globalThis.__v3Fight?.fighter; if (h) { h.x = 0; h.z = R; h.heading = 0; } }, 16);   // the hero pinned at the edge, facing +z
  return R;
});
const view = (l) => page.evaluate((v) => { globalThis.__look = v; }, l);
const shot = async (n) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 82 }); };
await view({ x: 0, y: 1.9, z: wall - 3.2, tx: 0, ty: 1.3, tz: wall + 90 }); await shot('1-out');
await view({ x: 0, y: 5.5, z: wall - 3.2, tx: 0, ty: 0.5, tz: wall + 60 }); await shot('2-high');
await view({ x: wall - 0.5, y: 1.9, z: 0, tx: wall + 90, ty: 1.3, tz: 0 }); await shot('3-side');
console.log(`${tag} done`, JSON.stringify(await page.evaluate(() => ({ hero: globalThis.__v3Fight?.fighter, far: null }))));
await browser.close();
