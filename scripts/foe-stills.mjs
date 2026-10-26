// Opponent stills, 375 wide, tick-exact (the page's clock is Playwright's fake clock, paused; one rAF frame = one 60 Hz tick, as in
// scripts/clip-stills.mjs). The shots are picked by the sim's own state (window.__v3Fight, src/client/main.ts), not by timers:
//   <tag>-ready        the fight drawn, both standing
//   <tag>-attack       his strike, `ATTACK_AGE` ticks into it
//   <tag>-block        two ticks after he blocks one of the hero's cuts (his scutum up)
//   <tag>-quake-windup / -quake-release   his Shield Quake: a few ticks after SpecialStarted, and its landing
//   <tag>-death-<n>    his fall / the finisher, n ticks after the killing blow
// The hero closes in (W) and cuts (D+F) every CUT_EVERY ticks. Stills only: the hero's health is held full so the fight lasts to the Quake,
// and once every other shot is in, his health is set to 1 so the next cut kills him (a finisher was never reached by script in 400 exchanges, PR #25).
//   node scripts/foe-stills.mjs <base url> <out dir> [query ...]   (on a Mac it uses Metal, elsewhere SwiftShader)
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const [base, out, ...queries] = process.argv.slice(2);
if (!base || !out) { console.error('usage: node scripts/foe-stills.mjs <base url> <out dir> [query ...]'); process.exit(2); }
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined, args: ['--use-gl=angle', process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const TICK = 1000 / 60, ATTACK_AGE = Number(process.env.ATTACK_AGE ?? 14), CUT_EVERY = Number(process.env.CUT_EVERY ?? 55), MAX_TICKS = Number(process.env.MAX_TICKS ?? 5400);
const DEATH_AT = [20, 70, 160];
for (const query of queries.length ? queries : ['']) {
  const tag = query ? query.replace(/[^a-z0-9]+/gi, '-') : 'default';
  const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', (e) => console.error(`${tag}: pageerror ${e.message}`));
  await page.clock.install();
  await page.goto(`${base}/${query ? `?${query}` : ''}`);
  await page.waitForFunction(() => document.getElementById('attack-button')?.getAttribute('aria-disabled') === 'false', null, { timeout: 180000 });
  await page.waitForTimeout(1500);   // the late kit (his scutum) dresses after the first frame
  await page.clock.pauseAt(await page.evaluate(() => Date.now()) + 100);
  const run = (ticks) => page.clock.runFor(Math.round(ticks * TICK));
  const shoot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${tag}-${name}.png` }); console.log(`${tag}: ${name}`); };
  const read = () => page.evaluate(() => { const p = globalThis.__v3Fight, [h, f] = p.duel.fighters; return { tick: p.duel.tick, hero: h.phase, foe: f.phase, age: f.age, foeHealth: f.health, finish: !!p.finish, events: p.events.map((e) => [e.type, e.actor]) }; });
  for (let i = 0; i < 240 && /sheathed|draw/.test((await read()).hero); i++) await run(1);
  await run(30); await shoot('ready');
  const want = new Set(['attack', 'block', 'quake-windup', 'quake-release']);
  let killedAt = -1, n = 0, quakeAt = -1;
  await page.keyboard.down('KeyW');
  for (; n < MAX_TICKS; n++) {
    if (n % CUT_EVERY === 0 && killedAt < 0) { await page.keyboard.down('KeyD'); await page.keyboard.down('KeyF'); await page.keyboard.up('KeyF'); await page.keyboard.up('KeyD'); }
    await run(1);
    const s = await read(), ev = (t, a) => s.events.some(([type, actor]) => type === t && actor === a);
    if (killedAt < 0) await page.evaluate((low) => { const [h, f] = globalThis.__v3Fight.duel.fighters; h.health = h.maxHealth; if (low) f.health = Math.min(f.health, 1); }, want.size === 0 || n > MAX_TICKS * 0.6);
    if (want.has('attack') && s.foe === 'attack' && s.age === ATTACK_AGE) { want.delete('attack'); await shoot('attack'); }
    if (want.has('block') && ev('Blocked', 1)) { want.delete('block'); await run(2); n += 2; await shoot('block'); }
    if (want.has('quake-windup') && ev('SpecialStarted', 1)) { want.delete('quake-windup'); quakeAt = n; await run(8); n += 8; await shoot('quake-windup'); }
    if (want.has('quake-release') && quakeAt >= 0 && ev('SpecialLanded', 1)) { want.delete('quake-release'); await shoot('quake-release'); }
    if (killedAt < 0 && ev('Killed', 0)) { killedAt = n; await page.keyboard.up('KeyW'); }
    if (killedAt >= 0) { const k = n - killedAt; if (DEATH_AT.includes(k)) await shoot(`death-${k}`); if (k >= DEATH_AT.at(-1)) break; }
  }
  await page.keyboard.up('KeyW');
  console.log(`${tag}: ${n} ticks; not reached: ${[...want, ...(killedAt < 0 ? ['death'] : [])].join(', ') || 'none'}`);
  await page.close();
}
await browser.close();
