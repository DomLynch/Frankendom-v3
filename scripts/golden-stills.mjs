// Golden weapon drops (data/golden-weapons.json, src/zone/golden-drops.ts), 375 wide, on the BUILT dist, through the real input layer: the hero WALKS onto the pickup with the W key (real keydown events), the
// pickup equips with its charges, a real strike key landing blows spends them, and at 0 he reverts. Stills:
//   <tag>-1-world     the pickup in the world (ring and beam), the radar dot
//   <tag>-2-held      after walking onto it: the charges counter, the toast, the hero holding the gold weapon
//   <tag>-3-spent     after the last charge: the counter gone, the toast "is spent", the weapon its own colour again
// Prints the save and the HUD at each beat; fails on a page error, a console error, or a beat that did not happen.
//   node scripts/golden-stills.mjs <base url> <out dir> <tag>      (a Mac uses Metal, elsewhere SwiftShader; CHROME=<path> picks the browser)
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';

const [base, out, tag] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/golden-stills.mjs <base url> <out dir> <tag>'); process.exit(2); }
mkdirSync(out, { recursive: true });
const PROG = JSON.parse(readFileSync(new URL('../data/progression.json', import.meta.url), 'utf8'));
const GOLD = JSON.parse(readFileSync(new URL('../data/golden-weapons.json', import.meta.url), 'utf8'));
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--mute-audio'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: Number(process.env.DSF ?? 2), isMobile: true, hasTouch: true });
let bad = 0;
const fail = (m) => { bad++; console.error(`${tag} FAIL ${m}`); };
page.on('pageerror', (e) => { bad++; console.error(`pageerror ${e.message}`); });
page.on('console', (m) => { if (m.type() === 'error') { bad++; console.error(`console ${m.text()}`); } });
const shot = (n) => page.screenshot({ path: `${out}/${tag}-${n}.png` });
const seed = { v: 1, kills: { gargantua: 1 }, ladder: ['gargantua'], unlocked: ['gladius'], coins: 0, banked: 0 };
await page.addInitScript(([key, value]) => { if (!localStorage.getItem(key)) localStorage.setItem(key, value); }, [PROG.key, JSON.stringify(seed)]);
const look = () => page.evaluate((key) => {
  const save = JSON.parse(localStorage.getItem(key) ?? 'null'), q = (s) => document.querySelector(s), f = globalThis.__v3Fight;
  const marks = [...document.querySelectorAll('.gw-mark')].map((e) => Number(e.style.opacity || 0));
  return { golden: save?.golden ?? null, hero: f ? { x: +f.fighter.x.toFixed(2), z: +f.fighter.z.toFixed(2), health: f.playerHealth } : null, counter: q('.gw-count')?.textContent || null, line: q('.gw-line')?.textContent || null, lineOpacity: q('.gw-line')?.style.opacity ?? null, markers: marks, items: globalThis.__v3Golden?.items().length ?? null };
}, PROG.key);
const load = async () => { await page.goto(`${base}/`); await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__v3Golden, null, { timeout: 180000 }); await page.waitForTimeout(2500); };
await load();
const ready = await look(); console.log(`${tag} ready`, JSON.stringify(ready));
if (ready.golden?.held || ready.counter) fail('a game with no pickup shows no counter');

// 1. another lane's API drops a pickup 4 m ahead of the hero (the camera looks along -z from the spawn)
const dropped = await page.evaluate(() => { const f = globalThis.__v3Fight.fighter; return globalThis.__v3Golden.dropGolden({ x: f.x, z: f.z - 4 }, 1); });
if (!dropped) fail('dropGolden placed nothing (a tier 1 row is drawable)');
console.log(`${tag} dropped`, JSON.stringify(dropped));
await page.waitForTimeout(800); await shot('1-world');
const world = await look(); console.log(`${tag} in the world`, JSON.stringify(world));
if (!world.markers.some((o) => o > 0)) fail('the pickup shows no glowing marker');

// the tap discs never sit under a control: for every pickup disc that is on (display not none) no control's box overlaps it, and a pickup low on the screen (over the thumbs) has its disc off
const overlap = () => page.evaluate(() => {
  const boxes = (sel) => [...document.querySelectorAll(sel)].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
  const controls = boxes('#joystick, #actions, #actions *, #attack-button, #reset-button, #camera-button, #recenter-button, #hud button, button');
  const discs = [...document.querySelectorAll('.gw-hit')].map((e) => ({ on: getComputedStyle(e).display !== 'none', r: e.getBoundingClientRect() }));
  const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  return { discs: discs.length, on: discs.filter((d) => d.on).length, overlapping: discs.filter((d) => d.on && controls.some((c) => hit(d.r, c))).length, high: innerHeight };
});
const ov = await overlap(); console.log(`${tag} tap discs`, JSON.stringify(ov));
if (ov.overlapping) fail('a tap disc sits over a control');
await page.evaluate(() => { const f = globalThis.__v3Fight.fighter; globalThis.__v3Golden.dropGolden({ x: f.x, z: f.z + 6 }, 1); globalThis.__v3Golden.dropGolden({ x: f.x + 1.2, z: f.z + 1.6 }, 1); });   // behind and beside him: low on the screen, over the thumb cluster
await page.waitForTimeout(500);
const ov2 = await overlap(); console.log(`${tag} tap discs low`, JSON.stringify(ov2));
if (ov2.overlapping) fail('a low pickup\'s tap disc sits over a control');
const strikeAt = await page.evaluate(() => { const r = (document.getElementById('attack-button') ?? document.querySelector('#actions')).getBoundingClientRect(); const x = r.x + r.width / 2, y = r.y + r.height / 2; return { x, y, top: document.elementsFromPoint(x, y)[0]?.className ?? '' }; });
if (/gw-/.test(String(strikeAt.top))) fail(`a pickup element is over STRIKE (${strikeAt.top})`);

// 2. walk onto it with the real W key until it is his
await page.keyboard.down('KeyW');
await page.waitForFunction(() => !!globalThis.__v3Golden.held(), null, { timeout: 15000 }).catch(() => fail('walking onto the pickup did not equip it'));
await page.keyboard.up('KeyW');
await page.waitForTimeout(600); await shot('2-held');
const held = await look(); console.log(`${tag} held`, JSON.stringify(held));
const row = GOLD.weapons.find((w) => w.id === held.golden?.held?.id);
if (!row || held.golden.held.charges !== row.charges) fail('he holds the row with all its charges');
if (!held.counter?.includes(row?.name ?? '?')) fail(`the HUD counter names the weapon (${held.counter})`);
if (held.golden?.ground?.length !== 2) fail(`the pickup he took left the ground and the two low ones stayed (${held.golden?.ground?.length})`);
const charges0 = held.golden?.held?.charges ?? 0;

// 3. a reload keeps it (the save) and he is drawn as that row's weapon from the first frame
await page.reload(); await page.waitForFunction(() => globalThis.__ragdoll?.state === 'alive' && globalThis.__v3Golden, null, { timeout: 180000 }); await page.waitForTimeout(2500);
const again = await look(); console.log(`${tag} reloaded`, JSON.stringify(again));
if (again.golden?.held?.id !== held.golden?.held?.id || !again.counter) fail('the held golden weapon survives a reload');

// 4. real strikes into a boss: charges fall, and at 0 he reverts. The hero is brought to the boss the sim holds (the aggro starts the fight), the F key is the strike.
await page.evaluate(() => { const z = globalThis.__v3Zone, s = z.spawns[z.current], f = globalThis.__v3Fight.fighter; f.x = s.x; f.z = s.z + 2; });
let spent = false;
for (let i = 0; i < 400 && !spent; i++) {
  await page.keyboard.press('KeyF'); await page.waitForTimeout(260);
  const s = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null')?.golden?.held ?? null, PROG.key);
  const hp = await page.evaluate(() => globalThis.__v3Fight.playerHealth);
  if (i === 20) { const mid = await look(); console.log(`${tag} mid-fight`, JSON.stringify(mid)); }
  spent = !s; if (hp <= 0) break;
  // keep the hero alive for the beat: this still is about the charges, not about surviving
  await page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; h.health = Math.max(h.health, 60); });
}
await page.waitForTimeout(500); await shot('3-spent');
// the radar: the white pickup dots beside the red boss dots, with the kill flash armed (the red dots pulse yellow-ringed): a crop of the disc at its brightest
await page.evaluate(() => globalThis.__v3Radar?.armFlash());
await page.waitForTimeout(450);
const radar = await page.evaluate(() => { const r = document.querySelector('[data-radar]')?.getBoundingClientRect(); return r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null; });
if (!radar) fail('no radar on the page'); else await page.screenshot({ path: `${out}/${tag}-4-radar.png`, clip: { x: Math.max(0, radar.x - 8), y: Math.max(0, radar.y - 8), width: radar.width + 16, height: radar.height + 16 } });
const end = await look(); console.log(`${tag} end`, JSON.stringify(end));
if (end.golden?.held) fail(`the weapon was not spent (${JSON.stringify(end.golden?.held)} of ${charges0})`);
if (end.counter) fail('the counter is gone once spent');
if (!/is spent/.test(end.line ?? '')) fail(`the toast says it is spent (${end.line})`);
await browser.close();
console.log(bad ? `${tag} FAILED (${bad})` : `${tag} ok: 0 console errors`);
process.exit(bad ? 1 : 0);
