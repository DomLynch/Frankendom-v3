// The look thumb after the first kill WITH a second boss already on him (zone aggro): fight boss 1, walk into boss 2's aggro, kill boss 1, then try the right-thumb drag as the ceremony ends, then run away from boss 2 and drag again.
//   node scripts/look-after-kill-multi.mjs <base url> [query]
import { chromium } from 'playwright';
const [base, query = ''] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const cdp = await page.context().newCDPSession(page);
const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([id, x, y]) => ({ id, x, y })) });
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const press = async (code, ms) => { await key(code, 'keydown'); await page.waitForTimeout(ms); await key(code, 'keyup'); await page.waitForTimeout(60); };
const st = () => page.evaluate(() => { const z = globalThis.__v3Zone; return { yaw: globalThis.__v3Yaw, free: globalThis.__v3FreeShare, engaged: z?.engaged, cur: z?.current, att: z?.attackers?.map((a) => [a.id, a.dead]), finish: !!globalThis.__v3Fight?.finish, roam: !!globalThis.__v3Roam }; });
const drag = async (tag) => {
  const a = await st();
  await touch('touchStart', [[2, 300, 420]]);
  for (let i = 1; i <= 12; i++) { await touch('touchMove', [[2, 300 - 10 * i, 420]]); await page.waitForTimeout(30); }
  await touch('touchEnd', []); await page.waitForTimeout(500);
  const b = await st();
  console.log(`${tag}: dYaw=${(b.yaw - a.yaw).toFixed(3)} before=${JSON.stringify(a)} after=${JSON.stringify(b)}`);
};
const topUp = () => page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; h.health = h.maxHealth; });
await page.goto(`${base}/?${query}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await key('KeyW', 'keydown');
await page.waitForFunction(() => globalThis.__v3Zone?.engaged, null, { timeout: 40000 });
await key('KeyW', 'keyup'); await page.waitForTimeout(1000);
const target = () => page.evaluate(() => { const z = globalThis.__v3Zone, h = globalThis.__v3Fight.fighter; return z.spawns.map((s, i) => ({ i, s })).filter(({ i, s }) => i !== z.current && s.deadFor === null).map(({ i, s }) => ({ i, x: s.x, z: s.z, d: Math.hypot(s.x - h.x, s.z - h.z) })).sort((a, b) => a.d - b.d)[0] ?? null; });
const hero = () => page.evaluate(() => ({ x: globalThis.__v3Fight.fighter.x, z: globalThis.__v3Fight.fighter.z }));
let joined = false;
for (let k = 0; k < 200 && !joined; k++) {
  const t = await target(); if (!t) break;
  const h = await hero(), to = { x: t.x - h.x, z: t.z - h.z }, held = await page.evaluate(() => ({ x: globalThis.__v3Fight.enemy.x, z: globalThis.__v3Fight.enemy.z }));
  const fl = Math.hypot(held.x - h.x, held.z - h.z) || 1, f = { x: (held.x - h.x) / fl, z: (held.z - h.z) / fl }, dirs = { KeyW: f, KeyS: { x: -f.x, z: -f.z }, KeyD: { x: -f.z, z: f.x }, KeyA: { x: f.z, z: -f.x } };
  await press(Object.entries(dirs).sort((p, q) => (q[1].x * to.x + q[1].z * to.z) - (p[1].x * to.x + p[1].z * to.z))[0][0], 120);
  if ((await st()).att?.length) joined = true;
  await topUp();
}
console.log('joined', joined, JSON.stringify(await st()));
await drag('A-two-bosses-on-him');
// kill boss 1 (the held one)
await page.evaluate(() => { globalThis.__kill = setInterval(() => { const k = (c, t) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })); const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); k('KeyC', 'keydown'); k('KeyC', 'keyup'); if (globalThis.__v3Fight.finish) clearInterval(globalThis.__kill); }, 100); });
await page.waitForFunction(() => !!globalThis.__v3Fight?.finish, null, { timeout: 60000 });
for (const [i, wait] of [[1, 300], [2, 2000], [3, 3000], [4, 4000]]) { await page.waitForTimeout(wait); await topUp(); await drag(`B${i}-after-kill`); }
const away = 'KeyS'; await key(away, 'keydown'); await page.waitForTimeout(1500); await drag('C-ran-away(S)'); await key(away, 'keyup');
await key('KeyW', 'keydown'); await page.waitForTimeout(1500); await drag('D-ran-away(W)'); await key('KeyW', 'keyup');
await browser.close();
