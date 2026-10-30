// The corpse run (data/corpse-run.json, src/corpse-run.ts), 375 wide, on the BUILT dist (production content-hashed names), real time. A save with 30 carried coins and the Gladius is seeded, then the hero is held at 1 health
// until the first blow kills him (the same hook as scripts/hero-death-stills.mjs):
//   <tag>-1-pile      ~2 s after the death: the pile where he fell (ring and beam), the coin line
//   <tag>-2-respawn   after a tap on Respawn: at camp, the pile still marked, the radar blip, the boss that killed him lingering at the pile
//   <tag>-3-retrieved after walking onto the pile: "Recovered 30 coins and the Gladius", the pile gone from the save and the screen
// It prints the save and the HUD at each beat and fails on a page error, a console error, or a pile that did not behave.
//   node scripts/corpse-run-stills.mjs <base url> <out dir> <tag>      (on a Mac it uses Metal, elsewhere SwiftShader)
import { mkdirSync, readFileSync } from 'node:fs';
import { launchBrowser, phoneOptions } from './lib/browser.mjs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/corpse-run-stills.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const PROG = JSON.parse(readFileSync(new URL('../data/progression.json', import.meta.url), 'utf8'));
const browser = await launchBrowser();
const page = await browser.newPage(phoneOptions(Number(process.env.DSF ?? 2)));
let bad = 0;
const fail = (m) => { bad++; console.error(`${tag} FAIL ${m}`); };
page.on('pageerror', (e) => { bad++; console.error(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') { bad++; console.error(`console ${m.text()}`); } });
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const seed = { v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 0, banked: 0 };
await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [PROG.key, JSON.stringify(seed)]);
const look = () => page.evaluate((key) => {
  const save = JSON.parse(localStorage.getItem(key) ?? 'null'), q = (s) => document.querySelector(s), r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), opacity: el.style.opacity }; };
  const f = globalThis.__v3Fight;
  return { pile: save?.pile ?? null, coins: save?.coins, lost: save?.lost, hero: f ? { x: +f.fighter.x.toFixed(2), z: +f.fighter.z.toFixed(2), health: f.playerHealth } : null, line: q('.ul-line')?.textContent ?? null, coinsHud: q('.cr-coins')?.textContent ?? null, marker: r(q('.cr-pile')), finish: !!f?.finish };
}, PROG.key);
await page.goto(`${base}/`);
await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 });
await page.waitForTimeout(3000);
const ready = await look(); console.log(`${tag} ready`, JSON.stringify(ready));
if (ready.pile || ready.coinsHud !== null) fail(`a game with no coins shows no coin line and no pile (${JSON.stringify(ready)})`);
// the hero steps out of the camp's bank radius, then is handed 30 carried coins (the sim hook; a boss kill pays them in play)
await page.evaluate(() => { const f = globalThis.__v3Fight.fighter; f.x = -7; f.z = f.z; globalThis.__v3Corpse.give(30); });
await page.waitForTimeout(500);
const carried = await look(); console.log(`${tag} carrying`, JSON.stringify(carried));
if (carried.coins !== 30 || carried.coinsHud !== 'Coins 30') fail('30 carried coins away from camp are not banked');
await page.evaluate(() => new Promise((done) => { const id = setInterval(() => { const [h] = globalThis.__v3Fight.duel.fighters; if (globalThis.__v3Fight.finish) { clearInterval(id); done(); } else h.health = Math.min(h.health, 1); }, 100); }));
await page.waitForTimeout(2200); await shot('1-pile');
const dead = await look(); console.log(`${tag} dead`, JSON.stringify(dead));
if (!dead.pile || dead.pile.coins !== 30 || dead.pile.weapon !== 'gladius' || dead.coins !== 0) fail('the pile holds the 30 coins and the Gladius, he carries none');
if (!dead.marker || Number(dead.marker.opacity) <= 0) fail('the pile marker is not showing');
await page.waitForTimeout(1500);
const box = await page.evaluate(() => { const r = document.getElementById('reset-button').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await page.touchscreen.tap(box[0], box[1]);
await page.waitForFunction(() => !globalThis.__v3Fight?.finish, null, { timeout: 30000 });
await page.waitForTimeout(1800); await shot('2-respawn');
const back = await look(); console.log(`${tag} respawned`, JSON.stringify(back));
if (!back.pile || back.pile.x !== dead.pile.x) fail('the pile is still where he fell after the respawn');
// a reload keeps the pile (the save), then he walks onto it
await page.reload(); await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive', null, { timeout: 180000 }); await page.waitForTimeout(2500);
const reloaded = await look(); console.log(`${tag} reloaded`, JSON.stringify(reloaded));
if (!reloaded.pile || reloaded.pile.x !== dead.pile.x || reloaded.pile.z !== dead.pile.z) fail('the pile survived the reload');
await page.evaluate(([x, z]) => { const f = globalThis.__v3Fight.fighter; f.x = x; f.z = z; }, [reloaded.pile.x, reloaded.pile.z]);
await page.waitForTimeout(900); await shot('3-retrieved');
const got = await look(); console.log(`${tag} retrieved`, JSON.stringify(got));
if (got.pile || got.coins !== 30 || !/Recovered 30 coins and the Gladius/.test(got.line ?? '')) fail('retrieval gives the coins and the Gladius back with a plain line');
await page.evaluate(() => { const f = globalThis.__v3Fight.fighter; f.x = 0; f.z = 2.6; });
await page.waitForTimeout(700);
const banked = await look(); console.log(`${tag} at camp`, JSON.stringify(banked), (await page.evaluate((k) => localStorage.getItem(k), PROG.key)));
if (banked.coins !== 0 || !/Banked 30/.test(banked.line ?? '')) fail('at camp the carried coins bank');
await browser.close();
console.log(bad ? `${tag} FAILED (${bad})` : `${tag} ok: 0 console errors`);
process.exit(bad ? 1 : 0);
