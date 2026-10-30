// Audit 5 (bone cache): rAF-callback cost of the fight loop on a BUILT dist, plus the bone-lookup counters the build keeps (globalThis.__boneLookups,
// src/fight/rig-bones.ts; a build from before the cache has none). The hero walks and strikes for SECS seconds, 375 wide; every rAF callback (the render
// is inside it) is timed. Counters are read at the start and end of the timed window and divided by the frames in it.
//   node scripts/perf-bone-cache.mjs <label> <base url> [out.json]      env: SECS=20  RUNS=1
// Playwright is not a repo dependency: npm i --no-save playwright@1.62.1. On a job: hfjob -- bash scripts/perf-bone-cache-job.sh <base sha>
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const [label, base, out] = process.argv.slice(2);
if (!label || !base) { console.error('usage: node scripts/perf-bone-cache.mjs <label> <base url> [out.json]'); process.exit(2); }
const SECS = Number(process.env.SECS ?? 20);
const MIX = [['KeyF'], ['KeyG'], ['KeyD', 'KeyF'], ['KeyG'], ['KeyA', 'KeyF'], ['KeyF']];
const press = async (page, codes) => { for (const c of codes) await page.keyboard.down(c); for (const c of codes.slice().reverse()) await page.keyboard.up(c); };
const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window), frames = globalThis.__cb = []; let on = false; globalThis.__cbOn = (v) => { on = v; };
    window.requestAnimationFrame = (cb) => raf((t) => { const s = performance.now(); cb(t); if (on) frames.push(performance.now() - s); });
  });
  await page.goto(`${base}/?feel=v1&rules=m4`, { timeout: 240000 });
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 240000, polling: 'raf' });
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
  await page.waitForTimeout(3000);
  const snap = () => page.evaluate(() => ({ ...(globalThis.__boneLookups ?? {}) }));
  const c0 = await snap();
  await page.keyboard.down('KeyW'); await page.waitForTimeout(500); await page.keyboard.up('KeyW');
  await page.evaluate(() => globalThis.__cbOn(true));
  const t0 = Date.now(); let n = 0;
  while (Date.now() - t0 < SECS * 1000) {
    await press(page, MIX[n++ % MIX.length]);
    await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; h.stamina = h.maxStamina; f.health = Math.max(f.health, Math.ceil(f.maxHealth / 2)); });
    await page.waitForTimeout(500);
  }
  await page.evaluate(() => globalThis.__cbOn(false));
  const cb = (await page.evaluate(() => globalThis.__cb)).sort((a, b) => a - b), c1 = await snap();
  const avg = cb.reduce((a, b) => a + b, 0) / cb.length;
  const per = (k) => (k in c1 ? +((c1[k] - (c0[k] ?? 0)) / cb.length).toFixed(2) : null);
  const row = { label, frames: cb.length, avgMs: +avg.toFixed(3), medianMs: +q(cb, .5).toFixed(3), p95Ms: +q(cb, .95).toFixed(3), p99Ms: +q(cb, .99).toFixed(3),
    perFrame: { boneSearches: per('searches'), boneCacheHits: per('hits'), boneWorldFull: per('worldFull'), boneWorldChain: per('worldChain') } };
  console.log(JSON.stringify(row));
  if (out) writeFileSync(out, JSON.stringify(row, null, 2));
} finally { await browser.close().catch(() => {}); }
