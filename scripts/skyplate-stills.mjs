// Stills + sky share for the skyline plate PR (data/stage.json skyline.plate, data/fight.json camera.pitch.portrait), 375 x 812 portrait.
// For each query ('' = the default page; 'skyplate=v1&pitch=off' = before ...): the ready idle view and a mid-fight view, and how much of the screen height is backdrop (sky) rather than sand
// (the floor is hidden for a second frame and the two are compared down a column strip beside the fighters, as scripts/skyview-stills.mjs does).
//   CHROME=<chromium path> node scripts/skyplate-stills.mjs <base url> <out dir> [name=query ...]     e.g.  before='skyplate=v1&pitch=off' after=''
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, ...specs] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/skyplate-stills.mjs <base url> <out dir> [name=query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const calc = await browser.newPage();
const sandStart = (a, b) => calc.evaluate(async ([a, b]) => {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${s}`; });
  const [ia, ib] = await Promise.all([load(a), load(b)]), w = ia.width, h = ia.height;
  const data = (i) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const da = data(ia), db = data(ib), x0 = Math.floor(0.02 * w), x1 = Math.ceil(0.12 * w);
  for (let y = 0; y < h; y++) { let sum = 0; for (let x = x0; x < x1; x++) { const k = (y * w + x) * 4; sum += (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2])) / 3; } if (sum / (x1 - x0) > 25) return y / h; }
  return 1;
}, [a, b]);
const results = {};
for (const spec of specs.length ? specs : ['default=']) {
  const [name, ...rest] = spec.split('='), query = rest.join('=');
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${name}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000 });
  await page.waitForFunction(() => globalThis.__v3Scene, null, { timeout: 60000 }).catch(() => console.error(`${name}: no __v3Scene`));
  await page.waitForTimeout(5000);   // the skyline lands after the first frame and fades in over about a second
  await page.screenshot({ path: `${out}/${name}-ready-375.png` });
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });
  await page.evaluate(() => { for (const n of ['skyline', 'skyfold']) { const o = globalThis.__v3Scene.getObjectByName(n); if (o) o.visible = false; } });   // the sand's own reach: the flat sky colour behind it, no backdrop, no cloud floor
  await page.waitForTimeout(300);
  const on =(await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => { globalThis.__v3Scene.traverse((o) => { if (o.type === 'Group' && o.getObjectByName('floor') && o.children.length <= 3) { o.visible = false; globalThis.__hidden = o; } }); });
  await page.waitForTimeout(500);
  const off = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => { if (globalThis.__hidden) globalThis.__hidden.visible = true; for (const n of ['skyline', 'skyfold']) { const o = globalThis.__v3Scene.getObjectByName(n); if (o) o.visible = true; } });
  const cam = await page.evaluate(() => { const c = globalThis.__v3Scene.userData.camera, d = c.getWorldDirection(new c.position.constructor()); return { y: +c.position.y.toFixed(2), pitchDeg: +(Math.asin(d.y) * 180 / Math.PI).toFixed(1) }; });
  results[name] = { query, skyPct: +(100 * await sandStart(on, off)).toFixed(1), ...cam };
  console.log(name, JSON.stringify(results[name]));
  await page.evaluate(() => { for (const el of document.querySelectorAll('style')) if (el.textContent.includes('visibility: hidden !important')) el.remove(); });
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  await page.keyboard.press('KeyG'); await page.waitForTimeout(450);
  await page.screenshot({ path: `${out}/${name}-midfight-375.png` });
  await page.close();
}
writeFileSync(`${out}/measure.json`, JSON.stringify(results, null, 1));
await browser.close();
