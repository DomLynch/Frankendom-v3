// The Pitborn's reach, 375 wide, tick-exact (the page's clock is Playwright's fake clock, paused; one rAF frame = one 60 Hz tick, as in
// scripts/foe-stills.mjs). Once the hero has drawn, the scene is staged in the sim's own state (window.__v3Fight, src/client/main.ts): the
// hero stands still, ready, unguarded, at full health; the Pitborn faces him GAP metres away and starts MOVE there (what duel.ts's attack
// start writes), then the sim runs on untouched: his step-in, the sweep, the hit or the whiff. GAP sits between the two sweeps' reach
// (test/foe-reach.test.mjs: the thrust from 2.0 m lands on V1's sweeps, whiffs on the Minotaur's), so default vs ?reach=v1 is a miss vs a hit.
//   <tag>-windup   AT[0] ticks into his move    <tag>-contact   AT[1]    <tag>-after   AT[2] (the hero's health bar, his recoil or not)
//   node scripts/reach-stills.mjs <base url> <out dir> [query ...]   (on a Mac it uses Metal, elsewhere ANGLE's default)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { phoneOptions, waitPlayable } from './lib/browser.mjs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/reach-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const angle = process.env.ANGLE ?? (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', ...(process.env.CHROME_ARGS ? process.env.CHROME_ARGS.split(' ') : [])] });
const TICK = 1000 / 60, MOVE = process.env.MOVE ?? 'thrust', GAP = Number(process.env.GAP ?? 2.0), AT = (process.env.AT ?? '10,18,34').split(',').map(Number);
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage(phoneOptions(2));
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await waitPlayable(page, { timeout: 180000 });
  await page.waitForTimeout(1500);
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  // JPEG=1: 375x812 JPEGs (CSS pixels), the size the PR bodies show, small enough to bring back in a job's log
  const shoot = async (name) => { await page.waitForTimeout(150); await page.screenshot(process.env.JPEG ? { path: `${out}/${tag}-${name}.jpg`, type: 'jpeg', quality: 85, scale: 'css' } : { path: `${out}/${tag}-${name}.png` }); console.log(`${tag}: ${name}`); };
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { hero: h.phase, heroHealth: h.health, foe: f.phase, move: f.move, age: f.age, gap: Math.hypot(h.body.x - f.body.x, h.body.z - f.body.z), events: p.events.filter((e) => e.actor === 1).map((e) => e.type) }; });
  for (let i = 0; i < 300 && (await read()).hero !== 'ready'; i++) await run(1);
  await run(40);
  // Stage: hero where he stands, the Pitborn GAP in front of him facing him, his MOVE started (duel.ts startAttack's fields).
  await page.evaluate(([move, gap]) => {
    const [h, f] = globalThis.__v3Fight.duel.fighters, a = h.body.heading;
    Object.assign(h, { phase: 'ready', age: 0, health: h.maxHealth, move: null, buffer: null });
    f.body = { ...f.body, x: h.body.x + Math.sin(a) * gap, z: h.body.z + Math.cos(a) * gap, heading: a + Math.PI };
    Object.assign(f, { phase: 'attack', age: 0, move, chained: false, landed: false, chain: 0, lastMove: move, attackFrom: { x: f.body.x, z: f.body.z, gap }, stall: 0, charge: 0, charged: false, buffer: null });
  }, [MOVE, GAP]);
  const seen = new Set(); let start = await read(), last = start;
  for (let t = 1; t <= AT.at(-1); t++) {
    await run(1); last = await read(); last.events.forEach((e) => seen.add(e));
    const i = AT.indexOf(t); if (i >= 0) await shoot(['windup', 'contact', 'after'][i] ?? `t${t}`);
  }
  console.log(`${tag}: ${MOVE} from ${GAP} m: his events ${[...seen].join(', ') || 'none'}; hero health ${start.heroHealth} -> ${last.heroHealth}`);
  await page.close();
}
await browser.close();
