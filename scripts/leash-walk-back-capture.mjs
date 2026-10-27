// Evidence capture for PR #151 (boss leash walk-back), 375 wide, REAL TIME, Metal GL on a Mac.
//   node scripts/leash-walk-back-capture.mjs <base url> <out dir> [query]       query '' = the PR default (walk back), 'leash=v1' = the instant reset as before
// The hero walks up to the held boss, the page engages, and the boss is wounded (BOSS_PCT of its health, default 30). Then the staging: the boss is moved to LEASH+0.5 m from its spot on the line away from it,
// the hero 2.5 m beyond it (what a hero kiting the boss out to its leash leaves behind; the run itself is not driven). Only positions and the wound are set; the leash check, the walk home and the regeneration are the page's own.
// A frame every FRAME_MS for SECONDS seconds; each frame logs the boss's distance from its spot, its health percent, whether the page still counts the fight engaged, and the hero's health.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const [base, out, query = ''] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/leash-walk-back-capture.mjs <base url> <out dir> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const SECONDS = Number(process.env.SECONDS ?? 12), FRAME_MS = Number(process.env.FRAME_MS ?? 250), BOSS_PCT = Number(process.env.BOSS_PCT ?? 30), LEASH = Number(process.env.LEASH ?? 20);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 240000 });
await page.waitForTimeout(4000);
await key('KeyW', 'keydown');
await page.waitForFunction(() => globalThis.__v3Zone?.engaged, null, { timeout: 60000 });
await key('KeyW', 'keyup'); await page.waitForTimeout(1500);
const read = () => page.evaluate(() => {
  const z = globalThis.__v3Zone, [h, f] = globalThis.__v3Fight.duel.fighters, s = z.spawns[z.current];
  return { engaged: z.engaged, current: z.current, spot: { x: s.x, z: s.z }, boss: { x: +f.body.x.toFixed(2), z: +f.body.z.toFixed(2) }, bossPct: +(100 * f.health / f.maxHealth).toFixed(1), heroPct: +(100 * h.health / h.maxHealth).toFixed(1), fromSpot: +Math.hypot(f.body.x - s.x, f.body.z - s.z).toFixed(2) };
});
const before = await read(); console.log('engaged', JSON.stringify(before));
await page.screenshot({ path: `${out}/f-pre.jpg`, type: 'jpeg', quality: 85 });
// stage: wound the boss and put it just past its leash (LEASH + 0.5 m from the spot, away from the hero's side), the hero 2.5 m beyond it
await page.evaluate(({ pct, leash }) => {
  const z = globalThis.__v3Zone, [h, f] = globalThis.__v3Fight.duel.fighters, s = z.spawns[z.current];
  let dx = f.body.x - s.x, dz = f.body.z - s.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  f.health = Math.round(f.maxHealth * pct / 100); h.health = h.maxHealth;
  f.body = { ...f.body, x: s.x + dx * (leash + 0.5), z: s.z + dz * (leash + 0.5) };
  h.body = { ...h.body, x: s.x + dx * (leash + 3), z: s.z + dz * (leash + 3), heading: Math.atan2(-dx, -dz) };
}, { pct: BOSS_PCT, leash: LEASH });
const t0 = Date.now(), log = []; let n = 0;
while (Date.now() - t0 < SECONDS * 1000) {
  const t = Date.now() - t0;
  await page.screenshot({ path: `${out}/f-${String(n++).padStart(4, '0')}.jpg`, type: 'jpeg', quality: 85 });
  log.push({ ms: t, ...(await read()) });
  const wait = FRAME_MS - (Date.now() - t0 - t); if (wait > 0) await page.waitForTimeout(wait);
}
const first = log[0], last = log.at(-1), walking = log.filter((r) => !r.engaged && r.fromSpot > 0.3);
const summary = { query: query || 'default', frames: n, frameEveryMs: FRAME_MS, bossPctStaged: BOSS_PCT, first, last, minFromSpot: Math.min(...log.map((r) => r.fromSpot)), framesWalkingNotEngaged: walking.length, bossPctRange: [Math.min(...log.map((r) => r.bossPct)), Math.max(...log.map((r) => r.bossPct))] };
console.log(JSON.stringify(summary));
writeFileSync(`${out}/summary.json`, JSON.stringify({ ...summary, log }, null, 1));
await browser.close();
