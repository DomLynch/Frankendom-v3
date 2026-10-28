// The hero's death and respawn loop (data/hero-death.json, src/fight/hero-death.ts), 375 wide, real time: the hero is held at 1 health until the first blow lands, then
//   <tag>-1-fall      ~0.9 s after the death: the hero ragdolled (or the Death clip under ?herodeath=v1)
//   <tag>-2-line      ~3 s after: the death camera has pulled back, the plain "You fell" line and the Respawn button are up
//   <tag>-3-respawn   a tap on Respawn (v1: the automatic stand-up): the hero stands at the pit's mark at full health
// It prints the page state at each beat and fails on a page error, a console error, or a page that stops stepping (rAF frames counted across each wait).
//   node scripts/hero-death-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/hero-death-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 2), isMobile: true, hasTouch: true });
let bad = 0;
page.on('pageerror', (e) => { bad++; console.error(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') { bad++; console.error(`console ${m.text()}`); } });
const shot = async (n) => { await page.screenshot({ path: `${out}/${tag}-${n}.png` }); };
const state = () => page.evaluate(() => ({ heroHealth: globalThis.__v3Fight?.duel?.fighters?.[0]?.health ?? null, finish: !!globalThis.__v3Fight?.finish, hud: document.querySelector('#hint, .hint, [data-hint]')?.textContent ?? null, resetShown: !document.getElementById('reset-button')?.hidden, resetText: document.getElementById('reset-button')?.textContent, hero: globalThis.__ragdollHero ? { state: globalThis.__ragdollHero.state, frames: globalThis.__ragdollHero.frames, ms: +(globalThis.__ragdollHero.totalMs / Math.max(1, globalThis.__ragdollHero.frames)).toFixed(3) } : null, body: document.body.innerText.match(/You (fell|died)/)?.[0] ?? null }));
const frames = () => page.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 > 1000) done(n); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.evaluate(() => { globalThis.__v3Rows = { frames: 0 }; const f = () => { globalThis.__v3Rows.frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
console.log(`${tag} ready`, JSON.stringify(await state()));
await page.evaluate(() => new Promise((done) => { const id = setInterval(() => { const [h] = globalThis.__v3Fight.duel.fighters; if (globalThis.__v3Fight.finish) { clearInterval(id); done(); } else h.health = Math.min(h.health, 1); }, 100); }));
const t0 = Date.now(), at = (ms) => page.waitForTimeout(Math.max(0, ms - (Date.now() - t0)));
await at(900); await shot('1-fall'); console.log(`${tag} fall ${Date.now() - t0} ms`, JSON.stringify(await state()));
await at(3200); await shot('2-line'); const line = await state(); console.log(`${tag} line ${Date.now() - t0} ms`, JSON.stringify(line));
const f0 = await page.evaluate(() => globalThis.__v3Rows.frames); const fps = await frames(); const f1 = await page.evaluate(() => globalThis.__v3Rows.frames);
console.log(`${tag} stepping: ${fps} frames in 1 s (counter ${f1 - f0})`); if (!(fps > 5)) { bad++; console.error(`${tag} the page stopped stepping`); }
if (!query.includes('herodeath=v1') && !query.includes('postkill=v1')) {
  if (line.body !== 'You fell' || !line.resetShown || line.resetText !== 'Respawn') { bad++; console.error(`${tag} expected "You fell" and a Respawn button`); }
  const box = await page.evaluate(() => { const r = document.getElementById('reset-button').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await page.touchscreen.tap(box[0], box[1]);
} else {
  await page.waitForFunction(() => !globalThis.__v3Fight?.finish, null, { timeout: 60000 });
}
await page.waitForFunction(() => !globalThis.__v3Fight?.finish, null, { timeout: 30000 });
await page.waitForTimeout(1800); await shot('3-respawn'); const back = await state(); console.log(`${tag} respawned`, JSON.stringify(back));
if (back.finish || back.heroHealth === 0) { bad++; console.error(`${tag} the hero did not stand up`); }
await browser.close();
if (bad) { console.error(`${tag} FAILED (${bad})`); process.exit(1); }
console.log(`${tag} ok`);
