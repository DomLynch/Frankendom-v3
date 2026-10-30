// Stills for the foe-melt PR (src/fight/foefade.ts): a far boss at 375 wide, ?foefade=v1 (solid over the clouds) against the default (dissolved where the sand is). The hero is pinned at the
// origin, the boss is pinned DIST metres behind him (the game's own camera, nothing overridden), the page waits for the strip, then one still per distance.
//   DISTS=26,34,42 node scripts/foe-melt-stills.mjs <base url> <out dir>
// Writes <out>/<tag>-<dist>.png for tag in default, foefade-v1. Headless Chromium (Metal on a Mac).
import { mkdirSync } from 'node:fs';
import { launchBrowser, phoneOptions } from './lib/browser.mjs';

const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/foe-melt-stills.mjs <base url> <out dir>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const DISTS = (process.env.DISTS ?? '26,34,42').split(',').map(Number), WAIT = Number(process.env.WAIT_MS ?? 12000);
const browser = await launchBrowser({ chromeEnv: null });
for (const [tag, query] of [['default', ''], ['foefade-v1', 'foefade=v1']]) {
  const page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 1)));
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 240000 });
  await page.waitForTimeout(WAIT);
  await page.evaluate(() => { globalThis.__dist = 3.25; setInterval(() => { const f = globalThis.__v3Fight; if (f?.fighter) { f.fighter.x = 0; f.fighter.z = 0; } if (f?.enemy) { f.enemy.x = 0; f.enemy.z = -globalThis.__dist; } }, 4); });
  for (const d of DISTS) {
    await page.evaluate((v) => { globalThis.__dist = v; }, d);
    await page.waitForTimeout(Number(process.env.PLACE_MS ?? 6000));
    await page.screenshot({ path: `${out}/${tag}-${d}.png` });
    console.log(tag, d, 'ok');
  }
  await page.close();
}
await browser.close();
