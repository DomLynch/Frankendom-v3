// The radar kill flash (data/radar.json flash) on the BUILT dist, 375 wide. Three states of the radar: idle, flash-on (mid-pulse, yellow), flash-off (armed, between pulses), plus a full-page still
// at flash-on. The radar canvas is read in the frame it is drawn (toDataURL right after a rAF), so the pulse is caught exactly; the three crops are laid on one 375-wide sheet at 4x.
// The arm is the page's own debug handle (window.__v3Radar.armFlash, what a boss kill calls); the timing is the game's clock.
//   node scripts/radar-flash-stills.mjs <base url> <out dir> <tag>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/radar-flash-stills.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
await page.goto(`${base}/__reset`).catch(() => {});
await page.goto(`${base}/?opener=off`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__v3Radar, null, { timeout: 180000 });
await page.waitForTimeout(1500);
// read the radar canvas in the frame after `setup` ran; returns the data URL and the phase that frame drew
const grab = (agoMs) => page.evaluate(async (agoMs) => {
  const r = globalThis.__v3Radar, cv = document.querySelector('[data-radar] canvas');
  if (agoMs === null) r.stopFlash(); else r.armFlash(performance.now() - agoMs);
  await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
  await new Promise((res) => requestAnimationFrame(res));
  return { url: cv.toDataURL('image/png'), phase: r.flashPhase, flashing: r.flashing, px: [cv.width, cv.height] };
}, agoMs);
const idle = await grab(null);
const on = await grab(250);          // 0.25 s into a 0.6 s pulse: the swell is near its peak
await page.screenshot({ path: `${out}/${tag}-flash-on-full.jpg`, type: 'jpeg', quality: 82 });
const off = await grab(1500);        // 1.5 s into the 3 s period: between pulses
for (const [n, g] of [['idle', idle], ['on', on], ['off', off]]) console.log(tag, n, JSON.stringify({ phase: +g.phase.toFixed(2), flashing: g.flashing, px: g.px }));
const sheet = await browser.newPage({ viewport: { width: 375, height: 250 }, deviceScaleFactor: 2 });
const cell = (n, g) => `<figure><img src="${g.url}"><figcaption>${n}</figcaption></figure>`;
await sheet.setContent(`<body style="margin:0;background:#1b2330;font:12px sans-serif;color:#ddd"><div style="display:flex;gap:8px;padding:12px;justify-content:center">`
  + `<style>figure{margin:0;text-align:center}img{width:112px;height:112px;image-rendering:pixelated;border-radius:50%;background:#05080c}</style>`
  + `${cell('idle', idle)}${cell('flash-on', on)}${cell('flash-off', off)}</div></body>`);
await sheet.screenshot({ path: `${out}/${tag}-radar-3-states.png` });
for (const [n, g] of [['idle', idle], ['on', on], ['off', off]]) writeFileSync(`${out}/${tag}-radar-${n}.png`, Buffer.from(g.url.split(',')[1], 'base64'));
await browser.close();
