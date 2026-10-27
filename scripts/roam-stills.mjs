// The zone loop after the kill (data/respawn.json, src/fight/zone-loop.ts), 375 wide, real time (as scripts/cut-stills.mjs COST=1): the Minotaur is
// killed by a kick (his health set to 1 first), the corpse is let lie until it is frozen, then the hero walks sideways with A held and the corpse is tapped.
//   <tag>-1-kill     the frozen corpse at the fight camera, the hero beside it
//   <tag>-2-walked   the hero held A for WALK_S seconds (default 2.5): in the zone he has walked off and the camera follows; under ?postkill=v1 nothing moves
//   <tag>-3-tap      a touch tap on the corpse's PART (default armLeft) after walking away: the part is cut
//   <tag>-4-respawn  (RESPAWN=1) the wait for the spawn's respawnSeconds: the fresh foe stands, the dead body is left beside him
//   node scripts/roam-stills.mjs <base url> <out dir> <tag> [query]      (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/roam-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const WALK_S = Number(process.env.WALK_S ?? 2.5), PART = process.env.PART ?? 'armLeft', KEY = process.env.KEY ?? 'KeyA';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 2), isMobile: true, hasTouch: true });
page.on('pageerror', (e) => console.error(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') console.error(`console ${m.text()}`); });
const shot = async (n) => { await page.screenshot({ path: `${out}/${tag}-${n}.png` }); };
const key = (code, type) => page.evaluate(([c, t]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, bubbles: true })), [code, type]);
const hero = () => page.evaluate(() => ({ fight: globalThis.__v3Fight?.fighter, foe: globalThis.__v3Fight?.enemy, roam: globalThis.__v3Roam ?? null, finish: !!globalThis.__v3Fight?.finish, ragdoll: globalThis.__ragdoll?.state, cuts: globalThis.__ragdoll?.cuts }));
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
if (process.env.DIE) {   // the hero's death: he is held at 1 health with the foe full until a blow lands; "You died" (diedSeconds), then the pit mark at full health
  await page.evaluate(() => new Promise((done) => { const id = setInterval(() => { const [h] = globalThis.__v3Fight.duel.fighters; if (globalThis.__v3Fight.finish) { clearInterval(id); done(); } else h.health = Math.min(h.health, 1); }, 100); }));
  if (process.env.FALL) {   // the death fall (data/respawn.json heroDeath.fallSeconds): mid-fall, then on the ground with "You died" (FALL=<mid ms>,<ground ms> after the death; 'stop' ends the run there, e.g. under ?postkill=v1)
    const t0 = Date.now(), at = process.env.FALL.split(',').map(Number);   // one still per time, 1-fall-<ms>
    for (const ms of at) { await page.waitForTimeout(Math.max(0, ms - (Date.now() - t0))); await shot(`1-fall-${ms}`); console.log(`${tag} fall ${ms} (${Date.now() - t0} real)`, await page.evaluate(() => document.body.innerText.includes('You died'))); }
    if (process.env.STOP) { await browser.close(); process.exit(0); }
  } else { await page.waitForTimeout(900); await shot('1-died'); console.log(`${tag} died`, JSON.stringify(await hero())); }
  const t0 = Date.now(); await page.waitForFunction(() => !globalThis.__v3Fight?.finish, null, { timeout: 60000 });
  console.log(`${tag} back after ${((Date.now() - t0) / 1000).toFixed(1)} s more`);
  await page.waitForTimeout(1500); await shot('2-back'); console.log(`${tag} back`, JSON.stringify(await hero()));
  await browser.close(); process.exit(0);
}
await page.evaluate(() => new Promise((done) => {   // the kill: the hero full, the foe at 1 health, a kick; the corpse is let lie until frozen
  const fire = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
  const id = setInterval(() => {
    const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1);
    fire('KeyC', 'keydown'); fire('KeyC', 'keyup');
    if (globalThis.__ragdoll.state === 'frozen') { clearInterval(id); setTimeout(done, 5000); }   // 5 s: past startAfterSeconds, the ceremony is over
  }, 250);
}));
await shot('1-kill'); console.log(`${tag} kill`, JSON.stringify(await hero()));
await key(KEY, 'keydown'); await page.waitForTimeout(WALK_S * 1000); await key(KEY, 'keyup'); await page.waitForTimeout(800);
await shot('2-walked'); console.log(`${tag} walked`, JSON.stringify(await hero()));
const at = await page.evaluate((p) => globalThis.__ragdoll.screenOf?.(p), PART);
console.log(`${tag} tap ${PART} at`, JSON.stringify(at));
if (at) { await page.touchscreen.tap(at[0], at[1]); await page.waitForTimeout(1800); }
await shot('3-tap'); console.log(`${tag} tapped`, JSON.stringify(await hero()));
if (process.env.RESPAWN) {
  const t0 = Date.now();
  await page.waitForFunction(() => !globalThis.__v3Fight?.finish, null, { timeout: 120000 });
  console.log(`${tag} respawned after ${((Date.now() - t0) / 1000).toFixed(1)} s more`);
  await page.waitForTimeout(2500); await shot('4-respawn'); console.log(`${tag} respawn`, JSON.stringify(await hero()), JSON.stringify(await page.evaluate(() => ({ corpses: globalThis.__ragdoll?.corpses, respawn: globalThis.__v3Respawn }))));
}
await browser.close();
