import { launchBrowser, phoneOptions } from './lib/browser.mjs';
// Look thumb before and after the first kill, 375 wide, real touches (CDP). A right-thumb drag is tried standing (before), then at several ages after the kill; logs yaw, freeShare, engaged.
//   node scripts/look-after-kill.mjs <base url> [query]
const [base, query = ''] = process.argv.slice(2);
const browser = await launchBrowser({ angle: 'metal' });
const page = await browser.newPage(phoneOptions());
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
const st = () => page.evaluate(() => ({ yaw: globalThis.__v3Yaw, free: globalThis.__v3FreeShare, engaged: globalThis.__v3Zone?.engaged, finish: !!globalThis.__v3Fight?.finish, roam: !!globalThis.__v3Roam, att: globalThis.__v3Zone?.attackers?.length }));
const scan = (tag) => page.evaluate((tag) => { const m = {}; for (let x = 150; x < 375; x += 25) for (let y = 60; y < 800; y += 40) { const e = document.elementFromPoint(x, y), k = e ? (e.id || e.className || e.tagName) : 'none'; (m[k] ??= []).push(`${x},${y}`); } return tag + ' ' + Object.entries(m).map(([k, v]) => `${k}:${v.length}`).join(' '); }, tag);
const drag = async (tag) => {
  console.log(await scan(tag));
  const a = await st();
  await touch('touchStart', [[2, 300, 420]]);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [[2, 300 - 10 * i, 420]]); await page.waitForTimeout(30); }
  await touch('touchEnd', []); await page.waitForTimeout(500);
  const b = await st();
  console.log(`${tag}: dYaw=${(b.yaw - a.yaw).toFixed(3)} before=${JSON.stringify(a)} after=${JSON.stringify(b)}`);
};
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(1500);
await drag('0-before-fight');
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 90000 });
await page.waitForTimeout(2500); console.log('engaged', JSON.stringify(await st())); await drag('0b-in-fight');
await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 120000 });
if (process.env.STICK) await page.evaluate((c) => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, bubbles: true })), process.env.STICK);   // held from the instant the kill lands
for (const [i, wait] of [[1, 300], [2, 1500], [3, 3000], [4, 4000], [5, 6000], [6, 8000], [7, 8000]]) { await page.waitForTimeout(wait); await drag(`${i}-after-kill`); }
if (process.env.STICK) {   // keep walking until the next boss takes the sim, then try the look, then run away (the lock breaks) and try again
  const key = (c, t) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [c, t]);
  await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 60000 }).catch(() => console.log('never re-engaged'));
  console.log('re-engaged', JSON.stringify(await st()));
  await page.waitForTimeout(1500); await drag('8-new-fight-stick-held');
  await key(process.env.STICK, 'keyup'); await drag('9-new-fight-no-stick');
  const away = process.env.STICK === 'KeyW' ? 'KeyS' : 'KeyW'; await key(away, 'keydown'); await page.waitForTimeout(1200); await drag('10-ran-away');
  await key(away, 'keyup');
}
await browser.close();
