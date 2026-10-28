// Taking a corpse's body parts (data/pickup.json, src/fight/pickup.ts), 375 wide, tick-exact (Playwright's paused fake clock, one rAF frame = one 60 Hz tick, as scripts/finisher-cuts-stills.mjs).
// The hero kills the foe (held at 1 hp), the corpse freezes, then:  <tag>-1-fell (the arrow and line once the corpse has frozen), <tag>-2-selected (a part tapped: outline, mini arrow, Take pill),
// <tag>-3-taken (Take pressed: the part gone, the arrow gone, the chip is mid-flight in <tag>-3a-flying). With ?pickup=v1 the same moments are shot without any of it (-1-fell, -2-tapped, -3-later).
// Prints the page errors (must be 0), the part events on the bus (part:taken), and the boxes of the arrow, line, pill and the thumb controls so the overlap can be read off.
//   node scripts/pickup-stills.mjs <base url> <out dir> <tag> [query]      env: CUTS=head,arm_left (units cut by tap before the stills; default arm_left), SELECT=arm_left (the part tapped)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, tag, query = ''] = process.argv.slice(2);
if (!base || !out || !tag) { console.error('usage: node scripts/pickup-stills.mjs <base url> <out dir> <tag> [query]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const TICK = 1000 / 60, CUT_EVERY = 55, MAX_TICKS = 3000, errors = [], off = /pickup=v1/.test(query);
const CUTS = (process.env.CUTS ?? 'arm_left').split(','), SELECT = process.env.SELECT ?? CUTS[0];
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: process.env.GL_ARGS ? process.env.GL_ARGS.split(' ') : ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console ${m.text()}`); });
await page.clock.install();
await page.goto(`${base}/${query ? `?${query}` : ''}`);
await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
await page.waitForTimeout(3000);
await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, victim: p.finish?.victim ?? -1, ragdoll: globalThis.__ragdoll?.state }; });
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
// the plain corpse tap cuts a part that is still on the body (as before); the cut piece lands, and is a part that can be taken
const unitAt = (u) => page.evaluate((u) => { for (let y = 120; y < 700; y += 4) for (let x = 20; x < 360; x += 4) if (globalThis.__ragdoll.probe?.(x, y) === u) return [x, y]; return null; }, u);
const already = await page.evaluate(() => (globalThis.__v3Cuts ?? []).map((c) => c.unit));
console.log(`${tag}: cut by the kill ${JSON.stringify(already)}`);
for (const u of CUTS) {
  if (already.includes(u)) continue;
  const at = await unitAt(u); console.log(`${tag}: tap to cut ${u} at ${at}`);
  if (at) { await page.touchscreen.tap(at[0], at[1]); await run(20); }
}
await run(100);   // the fall settles and the corpse has frozen for more than delayS
await shoot('1-fell');
const parts = () => page.evaluate(() => globalThis.__pickup?.seen() ?? null);
console.log(`${tag}: parts ${JSON.stringify(await parts())}`);
const boxes = await page.evaluate(() => {
  const r = (el) => { const b = el?.getBoundingClientRect(); return b && b.width ? [b.left, b.top, b.right, b.bottom].map((v) => +v.toFixed(0)) : null; };
  return { hint: r(document.querySelector('[data-pk=hint]')), text: r(document.querySelector('.pk-text')), thumbs: ['joystick', 'actions'].map((id) => [id, r(document.getElementById(id))]) };
});
console.log(`${tag}: boxes ${JSON.stringify(boxes)}`);
const seen = (await parts()) ?? [], target = seen.find((p) => p.unit === SELECT && p.onScreen);
if (off) { await run(6); await shoot('2-tapped'); await run(60); await shoot('3-later'); }   // ?pickup=v1: the same moments, nothing of the pickup on screen
else if (target) {
  await page.touchscreen.tap(target.sx, target.sy); await run(6);
  await shoot('2-selected');
  const sel = await page.evaluate(() => ({ selected: globalThis.__pickup.selected(), pill: (() => { const b = document.querySelector('[data-pk=take]')?.getBoundingClientRect(); return b ? [b.left, b.top, b.right, b.bottom].map((v) => +v.toFixed(0)) : null; })() }));
  console.log(`${tag}: after the tap ${JSON.stringify(sel)}`);
  if (!off) {
    const pill = await page.$('[data-pk=take]');
    await pill.tap(); await run(8); await page.waitForTimeout(80);
    await page.screenshot({ path: `${out}/${tag}-3a-flying.png` });
    await run(60); await shoot('3-taken');
  } else { await run(60); await shoot('3-later'); }
} else console.log(`${tag}: no on-screen part ${SELECT}; parts were ${JSON.stringify(seen)}`);
const events = await page.evaluate(() => (globalThis.__feelEvents ?? []).filter((e) => /part:taken|corpse:cut/.test(e.name)));
console.log(`${tag}: bus ${JSON.stringify(events)}`);
console.log(`${tag}: errors ${errors.length}${errors.length ? ' ' + errors.slice(0, 3).join(' | ') : ''}`);
await browser.close();
