// Stills for the ?skyview= PR (data/stage.json skyline.views): today's look and variants a, b, c at 375x812 (the fight: hero and boss ready; the free walk after a kill) and 812x375,
// each measured (how much of the screen height is the backdrop and how much is sand: the floor is hidden for a second frame and the two are compared down a column strip
// that holds no body), then a contact sheet with b first. Same fight state for every variant (the page loads and waits the same way each time).
//   node scripts/skyview-stills.mjs <base url> <out dir> [variants ...]        (default: default b a c)
// Writes <out>/<id>-fight-375.png, <id>-walk-375.png, <id>-fight-812.png, contact-sheet.png and measure.json. Headless Chromium (Metal on a Mac, SwiftShader elsewhere).
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { launchBrowser, phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...ids] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/skyview-stills.mjs <base url> <out dir> [variants ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const IDS = ids.length ? ids : ['default', 'v1'];   // 'default' = no link (B since Dom's pick); 'v1' = ?skyview=v1, the look before; a, b, c = ?skyview=<id>
const WORDS = { default: 'no link (B)', v1: 'before (?skyview=v1)', a: 'A: fog only', b: 'B: melt + lowered strip', c: 'C: lowered strip only' };
const STRIP = [0.02, 0.12];   // x range (fraction of the width) the sand test reads: beside the fighters, clear of the HUD's middle
const THRESHOLD = Number(process.env.THRESHOLD ?? 25);   // mean 0..255 difference a row must show, floor shown against floor hidden, to count as sand (about half melted)
const browser = await launchBrowser();
const calc = await browser.newPage();   // decodes two PNGs and reads the rows
const rows = (a, b, from, to, threshold) => calc.evaluate(async ([a, b, from, to, threshold]) => {
  const load = (s) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = `data:image/png;base64,${s}`; });
  const [ia, ib] = await Promise.all([load(a), load(b)]), w = ia.width, h = ia.height;
  const data = (i) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(i, 0, 0); return g.getImageData(0, 0, w, h).data; };
  const da = data(ia), db = data(ib), x0 = Math.floor(from * w), x1 = Math.ceil(to * w), sand = [];
  for (let y = 0; y < h; y++) { let sum = 0; for (let x = x0; x < x1; x++) { const k = (y * w + x) * 4; sum += (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2])) / 3; } sand.push(sum / (x1 - x0) > threshold); }
  const first = sand.indexOf(true);   // the first row of sand from the top: everything above it is the backdrop (and flat sky above that)
  return { height: h, backdropRows: first < 0 ? h : first, sandRows: first < 0 ? 0 : h - first };
}, [a, b, from, to, threshold]);

async function measure(page, path, tag) {
  await page.addStyleTag({ content: '* { visibility: hidden !important } canvas { visibility: visible !important }' });   // the HUD is out of both frames, so only the sand differs
  await page.waitForTimeout(300);
  const on = (await page.screenshot({ type: 'png' })).toString('base64');
  const cam = await page.evaluate(() => { const c = globalThis.__v3Scene.userData.camera; const d = c.getWorldDirection(new c.position.constructor()); const sk = globalThis.__v3Scene.getObjectByName('skyline'); return { y: +c.position.y.toFixed(2), x: +c.position.x.toFixed(1), z: +c.position.z.toFixed(1), pitchDeg: +(Math.asin(d.y) * 180 / Math.PI).toFixed(1), fov: +c.fov.toFixed(1), aspect: +c.aspect.toFixed(3), skyY: sk ? +sk.position.y.toFixed(1) : null, fade: (() => { let r = null; globalThis.__v3Scene.traverse((o) => { if (o.userData.skyviewFade) r = { eye: o.userData.skyviewFade.eye.value.toArray().map((n) => +n.toFixed(1)), scale: +o.scale.x.toFixed(3), at: o.position.toArray() }; }); return r; })() }; });
  console.log(tag, 'camera', JSON.stringify(cam));
  await page.evaluate(() => { const s = globalThis.__v3Scene; s.traverse((o) => { if (o.type === 'Group' && o.getObjectByName('floor') && o.children.length <= 3) { o.visible = false; globalThis.__hidden = o; } }); });
  await page.waitForTimeout(500);
  const off = (await page.screenshot({ type: 'png' })).toString('base64');
  await page.evaluate(() => { if (globalThis.__hidden) globalThis.__hidden.visible = true; });
  const r = await rows(on, off, STRIP[0], STRIP[1], THRESHOLD);
  const m = { shot: path, backdropPct: +(100 * r.backdropRows / r.height).toFixed(1), sandPct: +(100 * r.sandRows / r.height).toFixed(1), rows: r.height };
  console.log(tag, JSON.stringify(m));
  return m;
}

const results = {};
const unhide = (page) => page.evaluate(() => { for (const el of document.querySelectorAll('style')) if (el.textContent.includes('visibility: hidden !important')) el.remove(); });
for (const id of IDS) {
  const query = id === 'default' ? '' : `skyview=${id}`;
  results[id] = {};
  // phone portrait: the fight, then the free walk after a kill
  let page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 1)));
  page.on('pageerror', (e) => console.error(`${id}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await waitPlayable(page, { timeout: 240000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/${id}-fight-375.png` });
  results[id].fight375 = await measure(page, `${id}-fight-375.png`, `${id} fight 375`);
  await unhide(page);
  await page.evaluate(() => new Promise((done) => {
    const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    const t = setInterval(() => {
      const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
      fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
      if (globalThis.__ragdoll?.state === 'frozen') { clearInterval(t); setTimeout(done, 4000); }
    }, 250);
  }));
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS', bubbles: true })));
  await page.waitForFunction((r) => { const p = globalThis.__v3Roam; return !!p && Math.hypot(p.x, p.z) >= r; }, Number(process.env.WALK_R ?? 14), { timeout: 60000, polling: 50 }).catch(() => {});   // the same place for every variant, however slow the box
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyS', bubbles: true })));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${id}-walk-375.png` });
  results[id].walk375 = await measure(page, `${id}-walk-375.png`, `${id} walk 375`);
  await page.close();
  // phone landscape
  page = await browser.newPage({ viewport: { width: 812, height: 375 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await waitPlayable(page, { timeout: 240000 });
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${out}/${id}-fight-812.png` });
  results[id].fight812 = await measure(page, `${id}-fight-812.png`, `${id} fight 812`);
  await page.close();
}
writeFileSync(`${out}/measure.json`, JSON.stringify(results, null, 2));

// the contact sheet: a column per variant (b first), the 375 fight on top, the 375 free walk under it, the 812 landscape under that, each captioned with its backdrop share
const img = (f) => `data:image/png;base64,${readFileSync(`${out}/${f}`).toString('base64')}`;
const cell = (id, k, f, w) => `<figure><img src="${img(f)}" width="${w}"><figcaption>${WORDS[id]}: ${k}: backdrop ${results[id][k === 'free walk' ? 'walk375' : k === 'landscape' ? 'fight812' : 'fight375'].backdropPct}% / sand ${results[id][k === 'free walk' ? 'walk375' : k === 'landscape' ? 'fight812' : 'fight375'].sandPct}%</figcaption></figure>`;
const html = `<body style="margin:0;background:#141218;color:#ddd;font:13px sans-serif"><style>figure{margin:0 6px 10px}img{display:block;border:1px solid #444}.r{display:flex;align-items:flex-start;padding:6px}</style>
<div class="r">${IDS.map((id) => cell(id, 'fight', `${id}-fight-375.png`, 375)).join('')}</div>
<div class="r">${IDS.map((id) => cell(id, 'free walk', `${id}-walk-375.png`, 375)).join('')}</div>
<div class="r">${IDS.map((id) => cell(id, 'landscape', `${id}-fight-812.png`, 375)).join('')}</div></body>`;
const sheet = await browser.newPage({ viewport: { width: 6 + IDS.length * 399, height: 1900 } });
await sheet.setContent(html);
await sheet.waitForTimeout(500);
await sheet.screenshot({ path: `${out}/contact-sheet.png`, fullPage: true });
await browser.close();
console.log('done', out);
