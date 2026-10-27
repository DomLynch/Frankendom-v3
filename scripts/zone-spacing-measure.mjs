// Zone spacing, measured (Dom 2026-10-27: "I was fighting one and I just ran into the other"). Headless Chromium at 375 wide, real time. Reads the page's own state
// (window.__v3Zone, __v3Fight): the spots, the hero, the held boss, and logs the hero-to-every-other-spot distance across a scripted fight (hero closes on the boss and swings,
// topped up so he does not die). Stills: -1-wide (the page open, all three bosses), -2-fight (mid-fight, fight camera).
//   node scripts/zone-spacing-measure.mjs <base url> <out dir> <tag> [query] [seconds]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = '', secs = '30'] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/zone-spacing-measure.mjs <base url> <out dir> <tag> [query] [seconds]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.jpg`, type: 'jpeg', quality: 72 });
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const press = async (code, ms) => { await key(code, 'keydown'); await page.waitForTimeout(ms); await key(code, 'keyup'); await page.waitForTimeout(40); };
const read = () => page.evaluate(() => { const z = globalThis.__v3Zone, f = globalThis.__v3Fight; return { z, hero: { x: f.fighter.x, z: f.fighter.z }, foe: { x: f.enemy.x, z: f.enemy.z }, heroHealth: f.playerHealth }; });
const d = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const topUp = () => page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; h.health = h.maxHealth; });
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
const s0 = await read();
console.log(`${tag} spots`, JSON.stringify(s0.z.spawns.map((s) => [s.id, +s.x.toFixed(2), +s.z.toFixed(2)])), 'hero start', JSON.stringify(s0.hero));
const sp = s0.z.spawns;
const pairs = []; for (let i = 0; i < sp.length; i++) for (let j = i + 1; j < sp.length; j++) pairs.push(`${sp[i].id}~${sp[j].id}=${d(sp[i], sp[j]).toFixed(2)}`);
console.log(`${tag} pairwise`, pairs.join(' '), '| hero start to spots', sp.map((s) => `${s.id}=${d(s0.hero, s).toFixed(2)}`).join(' '));
await shot('1-wide');
// the scripted fight: close on the held boss and swing; log each half second
const t0 = Date.now(); let engagedAt = null, shotMid = false, minOther = Infinity, maxHeroR = 0, maxFoeR = 0, joinedAt = null; const rows = [];
let last = 0;
while (Date.now() - t0 < Number(secs) * 1000) {
  const s = await read(), cur = s.z.current, held = s.z.spawns[cur];
  const gap = d(s.hero, s.foe);
  if (s.z.engaged && engagedAt === null) engagedAt = (Date.now() - t0) / 1000;
  if (gap > 1.9) await press('KeyW', 140); else { await press('KeyF', 90); if (Math.random() < 0.25) await press('KeyD', 120); }
  if (s.heroHealth < 60) await topUp();
  const others = s.z.spawns.map((o, i) => ({ id: o.id, i, dh: d(s.hero, o), df: d(s.foe, o), dead: o.deadFor !== null })).filter((o) => o.i !== cur && !o.dead);
  const nearest = others.sort((a, b) => a.dh - b.dh)[0];
  if (s.z.engaged) {
    if (nearest) minOther = Math.min(minOther, nearest.dh);
    maxHeroR = Math.max(maxHeroR, Math.hypot(s.hero.x, s.hero.z)); maxFoeR = Math.max(maxFoeR, Math.hypot(s.foe.x, s.foe.z));
    if (s.z.attackers.length && joinedAt === null) joinedAt = (Date.now() - t0) / 1000;
  }
  if (s.z.engaged && !shotMid && Date.now() - t0 > (engagedAt ?? 0) * 1000 + 2500) { await shot('2-fight'); shotMid = true; }
  if (Date.now() - last > 500) {
    last = Date.now();
    rows.push(`t${((Date.now() - t0) / 1000).toFixed(1)} engaged=${s.z.engaged} held=${held.id} hero=(${s.hero.x.toFixed(2)},${s.hero.z.toFixed(2)}) foe=(${s.foe.x.toFixed(2)},${s.foe.z.toFixed(2)}) gap=${gap.toFixed(2)} heroToOthers=${others.map((o) => `${o.id}:${o.dh.toFixed(2)}`).join(',')} attackers=${s.z.attackers.length}`);
  }
}
console.log(rows.join('\n'));
console.log(`${tag} SUMMARY engagedAt=${engagedAt} minHeroToNearestOtherWhileEngaged=${minOther.toFixed(2)} maxHeroRadius=${maxHeroR.toFixed(2)} maxFoeRadius=${maxFoeR.toFixed(2)} firstAttackerJoinAt=${joinedAt}`);
await browser.close();
