// The radar (data/radar.json, src/fight/radar.ts), 375 portrait, real touches. Standing at the start (?opener=off: nobody fights the newcomer), then the right thumb drags the camera round by half a turn.
// Each beat: a full still, a close crop of the radar, and a check that the dots are where the geometry says (the expected pixel of each boss from the hero, the boss spots and the camera yaw, read off the page's
// own globals, against red pixels found in the radar's canvas at that pixel). Prints one line per boss.
//   <tag>-0-start / <tag>-0-start-radar, <tag>-1-turned / <tag>-1-turned-radar   (and -2-off for ?radar=off)
//   node scripts/radar-stills.mjs <base url> <out dir> <tag> [query]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = 'opener=off'] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/radar-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const DSF = Number(process.env.DSF ?? 3);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: DSF, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const cdp = await page.context().newCDPSession(page);
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([id, x, y]) => ({ id, x, y })) });
const shot = async (n) => {
  await page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 82 });
  const box = await page.evaluate(() => { const r = document.querySelector('[data-radar]')?.getBoundingClientRect(); return r ? { x: r.left - 6, y: r.top - 6, width: r.width + 12, height: r.height + 12 } : null; });
  if (box) await page.screenshot({ path: `${out}/${tag}-${n}-radar.png`, clip: box });
};
// what the radar should show: each boss's offset from the hero, turned into the camera's frame by the yaw (the camera looks along (-sin yaw, -cos yaw); its right is (cos yaw, -sin yaw)), as a pixel on the canvas
const check = (label) => page.evaluate((label) => {
  const el = document.querySelector('[data-radar]'), cv = el?.querySelector('canvas');
  if (!cv) return { label, radar: false };
  const z = globalThis.__v3Zone, f = globalThis.__v3Fight.fighter, yaw = globalThis.__v3Yaw, hero = globalThis.__v3Roam ?? f;
  const ratio = cv.width / cv.clientWidth, c = cv.width / 2, R = 30 /* rangeMetres */, reach = 0.9;
  const ctx = cv.getContext('2d'), rows = [];
  for (const s of z.spawns) {
    const dx = s.x - hero.x, dz = s.z - hero.z, right = dx * Math.cos(yaw) - dz * Math.sin(yaw), up = -dx * Math.sin(yaw) - dz * Math.cos(yaw), d = Math.hypot(right, up), k = d > R ? R / d : 1;
    const px = c + (right * k / R) * reach * c, py = c - (up * k / R) * reach * c;
    const r = Math.max(2, Math.round(3 * ratio)), img = ctx.getImageData(Math.max(0, Math.round(px - r)), Math.max(0, Math.round(py - r)), 2 * r, 2 * r).data;
    let red = 0; for (let i = 0; i < img.length; i += 4) if (img[i] > 150 && img[i + 1] < 120 && img[i + 3] > 120) red++;
    rows.push({ id: s.id, offsetM: [+dx.toFixed(1), +dz.toFixed(1)], distM: +Math.hypot(dx, dz).toFixed(1), bearingDeg: +((Math.atan2(right, up) * 180) / Math.PI).toFixed(0), onRim: k < 1, expectedPx: [+(px / ratio).toFixed(1), +(py / ratio).toFixed(1)], redPixelsThere: red });
  }
  const rect = el.getBoundingClientRect();
  return { label, yaw, hero: [+hero.x.toFixed(2), +hero.z.toFixed(2)], radarRect: [rect.left, rect.top, rect.width, rect.height].map((n) => +n.toFixed(1)), rows };
}, label);
await page.goto(`${base}/__reset`).catch(() => {});
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(1500);
await shot('0-start'); console.log(`${tag} start`, JSON.stringify(await check('start')));
// the right thumb turns the camera: drag left in several strokes until the view has gone half a turn
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const y0 = await page.evaluate(() => globalThis.__v3Yaw);
for (let stroke = 0; stroke < 8; stroke++) {
  const turned = Math.abs(wrap((await page.evaluate(() => globalThis.__v3Yaw)) - y0));
  if (turned > Math.PI - 0.12) break;
  await touch('touchStart', [[2, 360, 400]]);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [[2, 360 - (200 * i) / 12, 400]]); await page.waitForTimeout(25); }
  await touch('touchEnd', []);
  await page.waitForTimeout(700);
}
await page.waitForTimeout(500);
await shot('1-turned'); console.log(`${tag} turned`, JSON.stringify(await check('turned')), `turnedBy=${(Math.abs(wrap((await page.evaluate(() => globalThis.__v3Yaw)) - y0)) * 180 / Math.PI).toFixed(0)} deg`);
await browser.close();
