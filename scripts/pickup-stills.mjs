// The cut hint (data/pickup.json, src/fight/pickup.ts), 375 wide, tick-exact (Playwright's paused fake clock, one rAF frame = one 60 Hz tick, as scripts/finisher-cuts-stills.mjs).
// The hero kills the foe (held at 1 hp), the corpse freezes, then:  <tag>-1-hint (the arrow and the line over the corpse), <tag>-2-cut (one part tapped: it flew and lies on the ground, the hint gone).
// Prints the page errors (must be 0), the arrow / line box against the thumb controls, and the cut events.
//   node scripts/pickup-stills.mjs <base url> <out dir> <tag> [query]      env: CUT=arm_left (the unit tapped)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/pickup-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, CUT_EVERY = 55, MAX_TICKS = 3000, errors = [], CUT = process.env.CUT ?? 'arm_left';
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 2000);   // (a loaded box can be slower than 100 ms between the two calls)
const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1, ragdoll: globalThis.__ragdoll?.state }; });
const shoot = async (name) => { await page.waitForTimeout(350); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); };
for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
await run(30);
await page.keyboard.down('KeyW');
let killedAt = -1, stickUp = false;
for (let n = 0; n < MAX_TICKS; n++) {
  if (n % CUT_EVERY === 0 && killedAt < 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
  await run(1);
  const s = await read();
  if (killedAt < 0) {
    const gap = await page.evaluate(() => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; f.health = Math.min(f.health, 1); return Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z); });
    if (!stickUp && gap < 1.6) { stickUp = true; await page.keyboard.up('KeyW'); }
  }
  if (killedAt < 0 && s.victim === 1) { killedAt = n; await page.keyboard.up('KeyW'); }
  if (killedAt >= 0 && n - killedAt >= 150) break;
}
await page.keyboard.up('KeyW');
console.log(`${tag}: killed at ${killedAt}, ragdoll ${(await read()).ragdoll}`);
await run(60);
await shoot('1-hint');
const boxes = await page.evaluate(() => {
  const r = (el) => { const b = el?.getBoundingClientRect(); return b && b.width ? [b.left, b.top, b.right, b.bottom].map((v) => +v.toFixed(0)) : null; };
  return { hint: r(document.querySelector('[data-pk=hint]')), hintOpacity: document.querySelector('[data-pk=hint]')?.style.opacity ?? null, text: document.querySelector('.pk-text')?.textContent ?? null, pill: !!document.querySelector('.pk-pill'), thumbs: ['joystick', 'actions'].map((id) => [id, r(document.getElementById(id))]) };
});
console.log(`${tag}: hint ${JSON.stringify(boxes)}`);
// every cuttable unit by a plain tap (the pre-#219 behaviour: a tap on a part cuts it; the piece flies a bit and lands): the first (CUT) is shot, then the rest
const UNITS = ['head', 'arm_left', 'arm_right', 'leg_left', 'leg_right', 'torso_waist'];
const tapUnit = async (u) => {
  const cut = () => page.evaluate(() => (globalThis.__v3Cuts ?? []).map((c) => c.unit));
  if ((await cut()).includes(u)) return console.log(`${tag}: ${u} already cut by the kill`);
  const at = await page.evaluate((u) => { for (let y = 120; y < 700; y += 4) for (let x = 20; x < 360; x += 4) if (globalThis.__ragdoll.probe?.(x, y) === u) return [x, y]; return null; }, u);
  const d0 = await page.evaluate((u) => globalThis.__ragdoll.limbDistance?.(u), u);
  if (at) await page.touchscreen.tap(at[0], at[1]);
  await run(60);
  const d1 = await page.evaluate((u) => globalThis.__ragdoll.limbDistance?.(u), u);
  console.log(`${tag}: tap ${u} at ${at}: cut ${(await cut()).includes(u)}, distance to the chest ${d0?.toFixed(2)} -> ${d1?.toFixed(2)} m`);
};
await tapUnit(CUT);
await run(90);
await shoot('2-cut');
console.log(`${tag}: hint after the cut ${await page.evaluate(() => document.querySelector('[data-pk=hint]')?.style.opacity ?? null)}`);
for (const u of UNITS) if (u !== CUT) await tapUnit(u);
await run(120);
await shoot('3-all-six');
console.log(`${tag}: events ${JSON.stringify(await page.evaluate(() => (globalThis.__feelEvents ?? []).map((e) => `${e.name}:${e.payload?.unit}:${e.payload?.source}`)))}`);
console.log(`${tag}: errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
