// Several bosses at their spots (live-zone phase 1b), 375 wide, real time: the hero at the pit's mark with the bosses standing at their spots, walking up to one,
// the fight, the kill, the others still standing. Also the cost: draw calls, triangles and mean frame time with the copies on, and the bytes served at first visit.
//   <tag>-1-standing   the page after load: the hero at the mark, the bosses at their spots (the held one is the live rig, the rest frozen copies)
//   <tag>-2-walking    W held a while: the hero walking up to the nearest boss
//   <tag>-3-engaged    inside its aggro: the fight has started (auto-draw), the others stay standing
//   <tag>-4-kill       the held boss at 1 health and killed (a kick), the corpse lying, the hero standing over it
//   <tag>-5-others     the hero has walked on: the other bosses still stand at their spots, the killed one's timer runs on its own
//   node scripts/zone-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/zone-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const WALK_KEY = process.env.WALK_KEY ?? 'KeyW';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const shot = async (n) => { await page.screenshot({ path: `${out}/${tag}-${n}.png` }); };
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const zone = () => page.evaluate(() => ({ zone: globalThis.__v3Zone ?? null, hero: globalThis.__v3Fight ? { x: +globalThis.__v3Fight.fighter.x.toFixed(2), z: +globalThis.__v3Fight.fighter.z.toFixed(2) } : null, foe: globalThis.__v3Fight ? { x: +globalThis.__v3Fight.enemy.x.toFixed(2), z: +globalThis.__v3Fight.enemy.z.toFixed(2) } : null, finish: !!globalThis.__v3Fight?.finish, foeHealth: globalThis.__v3Fight?.health, phase: globalThis.__v3Fight?.duel.fighters.map((f) => f.phase) }));
const bytes = () => page.evaluate(() => fetch('/__bytes').then((r) => r.json()).catch(() => null));
await page.goto(`${base}/__reset`).catch(() => {});
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(4000);
const total = await bytes();
console.log(`${tag} first-visit bytes`, JSON.stringify(total));
await shot('1-standing'); console.log(`${tag} standing`, JSON.stringify(await zone()));
// the cost: mean frame time and the renderer's counts over 3 s of the standing scene
const cost = await page.evaluate(() => new Promise((done) => { let n = 0; const t0 = performance.now(); const tick = () => { n++; if (performance.now() - t0 >= 3000) done({ frames: n, meanMs: +((performance.now() - t0) / n).toFixed(2), zone: globalThis.__v3Zone ?? null }); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));
console.log(`${tag} cost`, JSON.stringify(cost));
if (!(await zone()).zone) { console.log(`${tag} no zone state (the old single fight): done`); await browser.close(); process.exit(0); }
await key(WALK_KEY, 'keydown'); await page.waitForTimeout(700);
await shot('2-walking'); console.log(`${tag} walking`, JSON.stringify(await zone()));
await page.waitForFunction(() => globalThis.__v3Zone?.engaged, null, { timeout: 30000 }); await key(WALK_KEY, 'keyup');
await page.waitForTimeout(2500);
await shot('3-engaged'); console.log(`${tag} engaged`, JSON.stringify(await zone()));
await page.evaluate(() => new Promise((done) => {   // the kill: the hero full, the foe at 1 health, a kick; the corpse is let lie until frozen
  const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const id = setInterval(() => {
    const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
    fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
    if (globalThis.__ragdoll.state === 'frozen') { clearInterval(id); setTimeout(done, 5000); }
  }, 250);
}));
await shot('4-kill'); console.log(`${tag} kill`, JSON.stringify(await zone()));
await key('KeyA', 'keydown'); await page.waitForTimeout(2500); await key('KeyA', 'keyup'); await page.waitForTimeout(800);
await shot('5-others'); console.log(`${tag} others`, JSON.stringify(await zone()));
await browser.close();
