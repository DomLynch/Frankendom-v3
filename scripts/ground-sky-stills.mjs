// The skyline against the zone's ground (#129 skyline, #127 open ground), 375 wide, the game's OWN camera (nothing is overridden): the hero is pinned at a place, the page waits for the
// skyline strip to load and fade in (it is fetched after the first frame), then one still. Run on each tree (origin/main alone, and main + the ground branch) and compare.
//   AT=0,500 WAIT_MS=12000 node scripts/ground-sky-stills.mjs <base url> <out dir> <tag> [query]      (query e.g. pitch=horizon)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/ground-sky-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const AT = (process.env.AT ?? '0,500').split(',').map(Number), WAIT = Number(process.env.WAIT_MS ?? 12000);
const browser = await chromium.launch({ args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 1), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 240000 });
await page.waitForTimeout(WAIT);   // the strip is fetched after the first frame and fades in over about a second and a half
await page.evaluate(() => { globalThis.__pin = { x: 0, z: 0 }; setInterval(() => { const f = globalThis.__v3Fight, p = globalThis.__pin; if (f?.fighter) { f.fighter.x = p.x; f.fighter.z = p.z; } if (f?.enemy) { f.enemy.x = p.x; f.enemy.z = p.z - 3.25; } }, 4); });   // the boss stands with him (the lock camera frames the two of them)
for (const z of AT) {
  await page.evaluate((p) => { globalThis.__pin = p; }, { x: 0, z });
  await page.waitForTimeout(Number(process.env.PLACE_MS ?? 20000));   // the follow camera eases to a teleported hero: wait until it has arrived
  await page.screenshot({ path: `${out}/${tag}-${z}.jpg`, type: 'jpeg', quality: 85 });
  console.log(`${tag} at ${z}`, JSON.stringify(await page.evaluate(() => ({ x: globalThis.__v3Fight?.fighter.x, z: globalThis.__v3Fight?.fighter.z }))));
}
await browser.close();
