// Stills for the sky ring PR (data/stage.json skyline.ring), 375 x 812 portrait. For each query ('' = the ring; 'skyring=v1' = the look before): the view turned to each compass bearing
// (default 0 90 180 270 for the four plates, 45 135 225 315 for the four joins), the camera turned right of the first heading by that many degrees, once the plate it faces has landed.
// The turn is a wrapper on camera.lookAt that rotates the aim about the eye (the rig and the hero are untouched), so the SKY sees a real heading change and fetches what it should.
//   CHROME=<chromium path> node scripts/skyring-stills.mjs <base url> <out dir> [name=query ...]     env BEARINGS=0,90,180,270  DSF=1  WAIT=3500
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...specs] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/skyring-stills.mjs <base url> <out dir> [name=query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const BEARINGS = (process.env.BEARINGS ?? '0,90,180,270,45,135,225,315').split(',').map(Number), WAIT = Number(process.env.WAIT ?? 3500);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
for (const spec of specs.length ? specs : ['ring=', 'v1=skyring=v1']) {
  const [name, ...rest] = spec.split('='), query = rest.join('=');
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${name}: pageerror ${e.message}`));
  const fetched = []; page.on('request', (r) => { if (/\/ring-/.test(r.url())) fetched.push(r.url().split('/').pop()); });
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
  await page.waitForFunction(() => globalThis.__v3Scene?.getObjectByName('skyline')?.visible === true, null, { timeout: 60000 });
  await page.waitForTimeout(4000);
  const firstVisitRingFetches = fetched.length;
  await page.evaluate(() => {
    const c = globalThis.__v3Scene.userData.camera, orig = c.lookAt.bind(c); globalThis.__turn = 0;
    c.lookAt = (v, ...r) => { const p = c.position, dx = v.x - p.x, dz = v.z - p.z, a = globalThis.__turn, co = Math.cos(a), si = Math.sin(a), t = v.clone(); t.x = p.x + dx * co + dz * si; t.z = p.z - dx * si + dz * co; return orig(t, ...r); };
  });
  const shots = [];
  for (const b of BEARINGS) {
    await page.evaluate((deg) => { globalThis.__turn = (-deg * Math.PI) / 180; }, b);   // a right turn lowers the heading
    await page.waitForTimeout(WAIT);
    await page.screenshot({ path: `${out}/${name}-bearing${String(b).padStart(3, '0')}-375.png` });
    shots.push({ bearing: b, ringStates: await page.evaluate(() => { const g = globalThis.__v3Scene.getObjectByName('skyring'); return g ? g.children.map((m) => [m.name, +m.material.opacity.toFixed(2)]) : null; }) });
  }
  report[name] = { query, firstVisitRingFetches, fetchedAfterTurning: [...fetched], shots };
  console.log(name, JSON.stringify(report[name]));
  await page.close();
}
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 1));
await browser.close();
