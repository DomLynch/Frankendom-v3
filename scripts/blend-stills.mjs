// Blend stills (data/fight.json blendMs/settleMs, ?blend=v1), 375 wide, tick-exact (Playwright's paused fake clock: one rAF frame = one
// 60 Hz tick, as in scripts/clip-stills.mjs). Shots are picked by the hero's own sim state (window.__v3Fight), so default and ?blend=v1 show
// the same tick of the same fight (the sim is the same; only the clip weights differ):
//   <tag>-roll-<age>      the roll (A held + Space), `age` ticks into it (the roll is 36 ticks)
//   <tag>-roll-after-<n>  n ticks after the roll ends (the settle back into the stance)
//   <tag>-cut-<age>       the right cut (D+F), `age` ticks into it
//   <tag>-cut-after-<n>   n ticks after the cut ends
//   node scripts/blend-stills.mjs <base url> <out dir> [query ...]   (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/blend-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60;
const MOVES = [
  ['roll', 'roll', ['KeyA', 'Space'], [3, 8, 27, 33], [2, 6]],
  ['cut', 'attack', ['KeyD', 'KeyF'], [3, 6], [2, 6]],
];
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  for (const [name, phase, keys, ages, afters] of MOVES) {
    const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
    await page.clock.install();
    await page.goto(`${base}/${query ? `?${query}` : ''}`);
    await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
    await page.waitForTimeout(1500);
    await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
    const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
    const shoot = async (label) => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${tag}-${name}-${label}.png` }); console.log(`${tag}: ${name}-${label}`); };
    const hero = () => page.evaluate(() => { const h = globalThis.__v3Fight.duel.fighters[0]; return { phase: h.phase, age: h.age }; });
    const full = () => page.evaluate(() => { for (const f of globalThis.__v3Fight.duel.fighters) f.health = f.maxHealth; });
    for (let i = 0; i < 300 && /sheathed|draw/.test((await hero()).phase); i++) await run(1);
    await run(20);
    for (const k of keys) await page.keyboard.down(k);
    let started = false, ended = -1, n = 0;
    const want = new Set([...ages.map((a) => `${a}`), ...afters.map((a) => `after-${a}`)]);
    for (; n < 400 && want.size; n++) {
      await run(1); await full();
      const h = await hero();
      if (!started && h.phase === phase) { started = true; for (const k of keys) await page.keyboard.up(k); }
      if (started && ended < 0 && h.phase === phase && want.has(`${h.age}`)) { want.delete(`${h.age}`); await shoot(`${h.age}`); }
      if (started && ended < 0 && h.phase !== phase) ended = n;
      if (ended >= 0 && want.has(`after-${n - ended + 1}`)) { want.delete(`after-${n - ended + 1}`); await shoot(`after-${n - ended + 1}`); }
    }
    for (const k of keys) await page.keyboard.up(k);
    console.log(`${tag} ${name}: ${n} ticks; not reached: ${[...want].join(', ') || 'none'}`);
    await page.close();
  }
}
await browser.close();
