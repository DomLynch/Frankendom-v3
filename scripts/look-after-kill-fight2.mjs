import { launchBrowser, phoneOptions } from './lib/browser.mjs';
// Kill boss 1, then put the walking hero beside boss 2 (the roam body is moved in the page) so boss 2 takes the sim; probe the look thumb in fight 2 as it is, then after running away from boss 2.
//   node scripts/look-after-kill-fight2.mjs <base url> [query]
const [base, query = ''] = process.argv.slice(2);
const browser = await launchBrowser({ angle: 'metal' });
const page = await browser.newPage(phoneOptions());
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const st = () => page.evaluate(() => { const z = globalThis.__v3Zone, r = globalThis.__v3Roam, f = globalThis.__v3Fight?.fighter, p = r ?? f; return { yaw: globalThis.__v3Yaw, free: globalThis.__v3FreeShare, engaged: z?.engaged, cur: z?.current, att: z?.attackers?.map((a) => a.id), finish: !!globalThis.__v3Fight?.finish, roam: !!r, hero: [+p.x.toFixed(1), +p.z.toFixed(1)] }; });
const drag = async (tag) => {
  const a = await st();
  await touch('touchStart', [[2, 300, 420]]);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [[2, 300 - 10 * i, 420]]); await page.waitForTimeout(30); }
  await touch('touchEnd', []); await page.waitForTimeout(500);
  const b = await st();
  console.log(`${tag}: dYaw=${(b.yaw - a.yaw).toFixed(3)} before=${JSON.stringify(a)} after=${JSON.stringify(b)}`);
};
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForFunction(() => globalThis.__v3Zone?.engaged === true, null, { timeout: 90000 });
await page.waitForTimeout(2000);
await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 60000 });
await key('KeyW', 'keydown'); await page.waitForTimeout(600); await key('KeyW', 'keyup');   // a nudge: the stick hands him the body
console.log('roaming', JSON.stringify(await st()));
await drag('R-roaming-before-boss-2');
// beside boss 2: the standing spawn that is not the dead one, 3 m from it on the hero's side
const put = await page.evaluate(() => { const z = globalThis.__v3Zone, r = globalThis.__v3Roam; const s = z.spawns.map((s, i) => ({ i, s })).filter(({ i, s }) => i !== z.current && s.deadFor === null)[0]; if (!s) return null; r.x = s.s.x + 1.2; r.z = s.s.z + 1.2; return { to: s.s.id, x: r.x, z: r.z }; });
console.log('moved beside', JSON.stringify(put));
await page.waitForTimeout(1000);
for (let i = 0; i < 6; i++) { await key('KeyF', 'keydown'); await page.waitForTimeout(80); await key('KeyF', 'keyup'); await page.waitForTimeout(500); if ((await st()).engaged) break; }
await page.waitForTimeout(1500);
console.log('fight 2?', JSON.stringify(await st()));
await drag('F2-fight-2-as-is');
await key('KeyS', 'keydown'); await page.waitForTimeout(1500); await drag('F2-S-held'); await key('KeyS', 'keyup');
await key('KeyW', 'keydown'); await page.waitForTimeout(1500); await drag('F2-W-held'); await key('KeyW', 'keyup');
await key('KeyD', 'keydown'); await page.waitForTimeout(1500); await drag('F2-D-held'); await key('KeyD', 'keyup');
await browser.close();
