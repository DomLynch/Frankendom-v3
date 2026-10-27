// The zone opener (data/respawn.json openers), 375 wide, real time: the hero stands still at the pit's mark and touches nothing. Prints the seconds from ready to the
// fight starting (should be about openers.delaySeconds), and stills:
//   <tag>-1-ready     the page is ready: the hero at the mark, the bosses standing
//   <tag>-2-opening   just after the delay: the yard Pitborn has aggroed and walks up
//   <tag>-3-closing   a moment later, nearer the hero
// With a query that switches it off (opener=off) nothing happens in WAIT seconds: prints "no fight" (the proof of the off switch).
//   node scripts/zone-opener-stills.mjs <base url> <out dir> <tag> [query]      env WAIT=seconds to watch (default 12)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/zone-opener-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const WAIT = Number(process.env.WAIT ?? 12);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const state = () => page.evaluate(() => ({ z: globalThis.__v3Zone ? { engaged: globalThis.__v3Zone.engaged, idle: globalThis.__v3Zone.openerIdle, spent: globalThis.__v3Zone.openerSpent, current: globalThis.__v3Zone.current } : null, hero: globalThis.__v3Fight ? [+globalThis.__v3Fight.fighter.x.toFixed(2), +globalThis.__v3Fight.fighter.z.toFixed(2)] : null, foe: globalThis.__v3Fight ? [+globalThis.__v3Fight.enemy.x.toFixed(2), +globalThis.__v3Fight.enemy.z.toFixed(2)] : null }));
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForFunction(() => globalThis.__v3Zone, null, { timeout: 60000 });
const t0 = Date.now();
await shot('1-ready'); console.log(`${tag} ready`, JSON.stringify(await state()));
let fought = null, closing = false;
while ((Date.now() - t0) / 1000 < WAIT) {
  await page.waitForTimeout(250);
  const s = await state();
  if (!fought && s.z?.engaged) { fought = (Date.now() - t0) / 1000; console.log(`${tag} engaged after ${fought.toFixed(1)} s`, JSON.stringify(s)); await page.waitForTimeout(700); await shot('2-opening'); console.log(`${tag} opening`, JSON.stringify(await state())); }
  else if (fought && !closing && (Date.now() - t0) / 1000 > fought + 2.2) { closing = true; await shot('3-closing'); console.log(`${tag} closing`, JSON.stringify(s)); break; }
}
if (!fought) console.log(`${tag} no fight in ${WAIT} s`, JSON.stringify(await state()));
await browser.close();
