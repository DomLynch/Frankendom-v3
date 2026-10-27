// Stills for the sky-alien PR (skyline.yawFollow): 375x812, the fight camera. For each query ('' = the default page, 'skyfollow=v1' = the strip fixed in world yaw) it takes ready idle,
// then the hero strafes round the boss (KeyD) so the camera turns: a shot after each hold, with the camera's heading read back; then one mid-fight (heavy swing) at the end.
//   node scripts/sky-alien-stills.mjs <base url> <out dir> [query ...]      env HOLDS=1200,2500,4000 (ms of strafe added before each heading shot)
// Headless Chromium (Metal on a Mac). Waits for the strip to land. Writes <out>/<tag>-ready.png, -turn1..N.png, -heavy.png and headings.json.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/sky-alien-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const HOLDS = (process.env.HOLDS ?? '1200,1400,1600').split(',').map(Number);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const report = {};
for (const query of queries.length ? queries : ['', 'skyfollow=v1']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
  await page.waitForFunction(() => globalThis.__v3Scene?.getObjectByName('skyline')?.visible === true, null, { timeout: 60000 });
  if (process.env.HACK) {   // what-if rows with no rebuild: {"h":metres,"drop":metres,"yawOff":degrees} replaces the strip's height, drop and turn at run time (the same maths as skyline.ts centreOffsetY)
    await page.evaluate((hack) => {
      const mesh = globalThis.__v3Scene.getObjectByName('skyline'), T = mesh.geometry.constructor, row = { radius: 150, horizon: 0.88 };
      mesh.geometry.dispose(); mesh.geometry = new T(row.radius, row.radius, hack.h, 96, 1, true);
      const set = mesh.position.set.bind(mesh.position);
      mesh.position.set = (x, y, z) => set(x, y - (mesh.userData.baseOffset ?? 0) + (hack.h / 2 - (1 - row.horizon) * hack.h - hack.drop), z);
      mesh.userData.baseOffset = 100 / 2 - 0.12 * 100 - 72;   // the shipped B: 100 m tall, dropped 72 m
      const e = mesh.rotation, off = (hack.yawOff * Math.PI) / 180;
      Object.defineProperty(e, 'y', { get() { return this._y; }, set(v) { this._y = v + off; this._onChangeCallback(); }, configurable: true });
    }, JSON.parse(process.env.HACK));
  }
  await page.waitForTimeout(4000);
  const read = () => page.evaluate(() => {
    const c = globalThis.__v3Scene.userData.camera, d = c.getWorldDirection(new c.position.constructor()), s = globalThis.__v3Scene.getObjectByName('skyline');
    return { headingDeg: +(Math.atan2(-d.x, -d.z) * 180 / Math.PI).toFixed(1), pitchDeg: +(Math.asin(d.y) * 180 / Math.PI).toFixed(1), stripYawDeg: s ? +(s.rotation.y * 180 / Math.PI).toFixed(1) : null };
  });
  const heads = [];
  await page.screenshot({ path: `${out}/${tag}-ready.png` }); heads.push({ shot: 'ready', ...(await read()) });
  for (let i = 0; i < HOLDS.length; i++) {
    await page.keyboard.down('KeyD');
    if (i === 1) { await page.waitForTimeout(HOLDS[i] * 0.7); await page.screenshot({ path: `${out}/${tag}-moving.png` }); heads.push({ shot: 'moving (mid-strafe, no settle)', ...(await read()) }); await page.waitForTimeout(HOLDS[i] * 0.3); }
    else await page.waitForTimeout(HOLDS[i]);
    await page.keyboard.up('KeyD');
    await page.waitForTimeout(2500);   // the slow follow settles
    await page.screenshot({ path: `${out}/${tag}-turn${i + 1}.png` }); heads.push({ shot: `turn${i + 1}`, ...(await read()) });
  }
  await page.keyboard.press('KeyG'); await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${tag}-heavy.png` }); heads.push({ shot: 'heavy', ...(await read()) });
  report[tag] = heads; console.log(tag, JSON.stringify(heads));
  await page.close();
}
writeFileSync(`${out}/headings.json`, JSON.stringify(report, null, 1));
await browser.close();
