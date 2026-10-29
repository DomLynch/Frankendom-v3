// Real-time zone aggro (a second boss attacks while you fight the first), 375 wide, real time. Reads the page's own state (window.__v3Zone) for the proof.
//   <tag>-1-fighting   engaged with the held boss, the second boss still outside its aggro
//   <tag>-2-joined     the hero walked into the second boss's aggro: it attacks (its own health, the hero's health dropping from both)
//   <tag>-3-framed     both attackers live, camera backed off: both in frame
// Prints the hero's health and each attacker's state every half second. The hero is topped up between samples so the walk is not cut short by a death (health is only SAMPLED
// before the top-up, and the top-up is logged).  node scripts/zone-aggro-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { mkdirSync } from 'node:fs';
import { collectErrors, launchBrowser, phoneOptions } from './lib/browser.mjs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/zone-aggro-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await launchBrowser({ extra: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage(phoneOptions(2));
collectErrors(page, { echo: true });
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const hero = () => page.evaluate(() => ({ x: globalThis.__v3Fight.fighter.x, z: globalThis.__v3Fight.fighter.z }));
const zone = () => page.evaluate(() => ({ z: globalThis.__v3Zone, hero: { x: +globalThis.__v3Fight.fighter.x.toFixed(2), z: +globalThis.__v3Fight.fighter.z.toFixed(2) } }));
const topUp = () => page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; const was = h.health; h.health = h.maxHealth; return was; });
const press = async (code, ms) => { await key(code, 'keydown'); await page.waitForTimeout(ms); await key(code, 'keyup'); await page.waitForTimeout(60); };
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(4000);
// walk up to the nearest boss: W is toward the held boss at the start
await key('KeyW', 'keydown');
await page.waitForFunction(() => globalThis.__v3Zone?.engaged, null, { timeout: 30000 });
await key('KeyW', 'keyup'); await page.waitForTimeout(1500);
const first = await zone(); console.log(`${tag} engaged`, JSON.stringify(first));
await shot('1-fighting');
// walk toward the nearest OTHER standing boss. The lock camera looks at the held boss: W walks toward it, S away, D to the hero's right ((-fz, fx) of the unit vector f to the boss), A to his left.
const target = () => page.evaluate(() => { const z = globalThis.__v3Zone, h = globalThis.__v3Fight.fighter; return z.spawns.map((s, i) => ({ i, s })).filter(({ i, s }) => i !== z.current && s.deadFor === null).map(({ i, s }) => ({ i, id: s.id, x: s.x, z: s.z, d: Math.hypot(s.x - h.x, s.z - h.z) })).sort((a, b) => a.d - b.d)[0] ?? null; });
let joined = false, samples = [];
for (let k = 0; k < 160 && !joined; k++) {
  const t = await target(); if (!t) break;
  const h = await hero(), to = { x: t.x - h.x, z: t.z - h.z }, held = await page.evaluate(() => ({ x: globalThis.__v3Fight.enemy.x, z: globalThis.__v3Fight.enemy.z }));
  const fl = Math.hypot(held.x - h.x, held.z - h.z) || 1, f = { x: (held.x - h.x) / fl, z: (held.z - h.z) / fl }, dirs = { KeyW: f, KeyS: { x: -f.x, z: -f.z }, KeyD: { x: -f.z, z: f.x }, KeyA: { x: f.z, z: -f.x } };
  const best = Object.entries(dirs).sort((p, q) => (q[1].x * to.x + q[1].z * to.z) - (p[1].x * to.x + p[1].z * to.z))[0][0];
  await press(best, 120);
  const s = await zone(); samples.push({ k, heroHealth: s.z.heroHealth, attackers: s.z.attackers.length });
  if (s.z.attackers.length) joined = true;
  if (s.z.heroHealth < 60) await topUp();
}
const j = await zone(); console.log(`${tag} joined`, joined, JSON.stringify(j));
await page.waitForTimeout(1500);
await shot('2-joined');
// the fight: the hero keeps fighting, both bosses on him; sample the health pool and each attacker twice a second
for (let n = 0; n < 12; n++) {
  await press('KeyF', 80);
  const s = await zone();
  console.log(`${tag} t${n} heroHealth=${s.z.heroHealth} first=${s.z.foeHealth} attackers=${JSON.stringify(s.z.attackers.map((a) => [a.id, a.health, a.phase, a.dead]))} live=${s.z.live}`);
  if (n === 5) await shot('3-framed');
  await page.waitForTimeout(400);
  if (s.z.heroHealth < 50) console.log(`${tag} (topped up from ${await topUp()})`);
}
await browser.close();
