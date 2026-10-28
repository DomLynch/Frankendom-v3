// A REAL kill starts the radar flash (data/radar.json flash) on the built dist: the first boss fights, is brought to 1 hp and struck down (the same driver as scripts/progression-stills.mjs); the radar must
// then be armed and pulse within a period, red dots with a thin yellow ring on the canvas; no flash before the kill.  node scripts/radar-flash-kill.mjs <base url> <out dir>
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/radar-flash-kill.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.goto(`${base}/?save=off`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
await page.waitForTimeout(1500);
const before = await page.evaluate(() => globalThis.__v3Radar.flashing);
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 120000 });
const during = await page.evaluate(() => globalThis.__v3Radar.flashing);
await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 180000 });
// after the kill: wait for the radar to be armed and a pulse near its peak, then read the canvas in that frame
const got = await page.evaluate(async () => {
  const r = globalThis.__v3Radar, cv = document.querySelector('[data-radar] canvas'), t0 = performance.now();
  for (;;) {
    await new Promise((res) => requestAnimationFrame(res));
    const p = r.flashPhase;
    if (r.flashing && p >= 0.2 && p <= 0.8) return { url: cv.toDataURL('image/png'), phase: p, flashing: true, waitedMs: Math.round(performance.now() - t0) };   // a loaded box stretches frames: a wide window
    if (performance.now() - t0 > 60000) return { url: null, phase: p, flashing: r.flashing, waitedMs: 60000 };
  }
});
console.log('before kill flashing=', before, ' in the fight flashing=', during, ' after kill:', JSON.stringify({ ...got, url: got.url ? 'png' : null }));
if (got.url) writeFileSync(`${out}/radar-after-real-kill.png`, Buffer.from(got.url.split(',')[1], 'base64'));
await page.screenshot({ path: `${out}/after-real-kill-full.jpg`, type: 'jpeg', quality: 82 });
await browser.close();
if (before || during || !got.flashing || !got.url) process.exit(1);
